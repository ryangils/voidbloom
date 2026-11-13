// VOIDBLOOM — main.js: boot, input, game loop, meta state, saves.
'use strict';

const App = {
  save: {
    version: 4, best: {}, vols: null, seenTip: false, arena: 0, coopMode: false,
    shards: 0, hangar: {}, ships: {}, achieved: [], nightmare: false,
    stats: { runs: 0, kills: 0, wins: 0, shardsEarned: 0, bestLevel: 0 },
  },
  debugSpeed: 1,      // extra sim iterations per frame (testing)

  loadSave() {
    try {
      const raw = localStorage.getItem('voidbloom_save');
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 4) this.save = Object.assign(this.save, s);
        else if (s && s.version === 3) this.save = Object.assign(this.save, s, { version: 4 });
        else if (s && s.version === 2) {
          this.save = Object.assign(this.save, s, { version: 4, shards: 0, hangar: {} });
        } else if (s && s.version === 1) {
          // v1: best stats become per-arena ("charId_arenaId")
          const best = {};
          for (const k of ['0', '1', '2']) if (s.best && s.best[k]) best[k + '_0'] = s.best[k];
          this.save = Object.assign(this.save, s, { version: 4, best, arena: 0, shards: 0, hangar: {} });
        }
      }
    } catch (e) { /* fresh start */ }
    if (!this.save.hangar) this.save.hangar = {};
    if (!this.save.ships) this.save.ships = {};
    if (!this.save.achieved) this.save.achieved = [];
    if (!this.save.stats) this.save.stats = { runs: 0, kills: 0, wins: 0, shardsEarned: 0, bestLevel: 0 };
    if (this.save.vols) Object.assign(AudioSys.vols, this.save.vols);
  },

  shipUnlocked(ch) { return !ch.cost || !!this.save.ships[ch.id]; },
  buyShip(id) {
    const ch = CHARS[id];
    if (!ch || !ch.cost || this.save.ships[id]) return false;
    if (this.save.shards < ch.cost) return false;
    this.save.shards -= ch.cost;
    this.save.ships[id] = true;
    this.persist();
    AudioSys.play('chest');
    return true;
  },

  // won a run before? unlocks Nightmare
  hasWon() {
    return this.save.achieved.includes('bloom') ||
      Object.values(this.save.best).some(b => b && b.won);
  },

  buyHangar(id) {
    const item = HANGAR.find(h => h.id === id);
    if (!item) return false;
    const rank = this.save.hangar[id] || 0;
    if (rank >= item.ranks) return false;
    const cost = hangarCost(item, rank);
    if (this.save.shards < cost) return false;
    this.save.shards -= cost;
    this.save.hangar[id] = rank + 1;
    this.persist();
    AudioSys.play('chest');
    return true;
  },

  persist() {
    try { localStorage.setItem('voidbloom_save', JSON.stringify(this.save)); } catch (e) {}
  },

  saveSettings() {
    this.save.vols = Object.assign({}, AudioSys.vols);
    this.persist();
  },

  recordRun(won) {
    const key = G.charId + '_' + G.arena;
    const b = this.save.best[key] || { time: 0, kills: 0, won: false };
    if (G.time > b.time) { b.time = G.time; b.kills = G.kills; }
    b.kills = Math.max(b.kills, G.kills);
    if (won) b.won = true;
    this.save.best[key] = b;
    // void shards: the meta-currency earned by every run
    let shards = Math.floor(G.kills / 40) + G.level + G.bossesKilled * 10 +
      Math.floor(G.time / 60) + (won ? 50 : 0);
    if (G.nightmare) shards = Math.round(shards * NIGHTMARE.shards);
    // achievements pay out once
    G.newAchievements = [];
    for (const a of ACHIEVEMENTS) {
      if (this.save.achieved.includes(a.id)) continue;
      let hit = false;
      try { hit = a.check(G, won); } catch (e) { /* never break the end screen */ }
      if (hit) {
        this.save.achieved.push(a.id);
        shards += a.shards;
        G.newAchievements.push(a);
      }
    }
    G.lastShards = shards;
    this.save.shards = (this.save.shards || 0) + shards;
    // lifetime stats
    const st = this.save.stats;
    st.runs++; st.kills += G.kills; st.shardsEarned += shards;
    if (won) st.wins++;
    st.bestLevel = Math.max(st.bestLevel, G.level);
    this.persist();
  },

  _lastChars: [0],

  startRun(charId) { this._begin([charId]); },
  startCoop(charIds) { this._begin(charIds); },
  retry() { this._begin(this._lastChars); },

  _begin(charIds) {
    this._lastChars = charIds.slice();
    UI.hideAll();
    G.newRun(charIds, false, this.save.arena || 0);
    if (G.arena === 1) UI.announce('REACTOR CORE', 'mind the plasma', '#ff9a5c', 2.5);
    else if (G.coop) UI.announce('CO-OP SORTIE', 'protect each other', '#4ef3ff', 2.2);
    AudioSys.ensure();
    AudioSys.setBoss(false);
    AudioSys.setIntensity(0.1);
    AudioSys.startMusic('run');
    AudioSys.music.mode = 'run';
    if (!this.save.seenTip) {
      this.save.seenTip = true;
      this.persist();
      UI.tip((IS_TOUCH ? '<b>Drag anywhere</b> to fly' : 'Move with <b>WASD</b>') + ' — your weapons fire on their own.<br>Collect the crystals. Survive.', 6);
    }
    if (!this.save.seenBeatTip) {
      this.save.seenBeatTip = true;
      this.persist();
      G.defer(7, () => UI.tip('<b>BEAT SYNC</b> — ' + (IS_TOUCH ? 'tap with a <b>second finger</b>' : 'press <b>SPACE</b>') +
        ' to dash <b>on the beat</b>.<br>Land it as the ring closes for a PERFECT. Chain them for <b>OVERDRIVE</b>.', 8));
    }
    if (G.coop) UI.tip((IS_TOUCH
      ? 'P1: drag on the <b>left half</b> &nbsp;·&nbsp; P2: drag on the <b>right half</b>'
      : 'P1: <b>WASD</b> / pad 1 &nbsp;·&nbsp; P2: <b>arrows</b> / pad 2') + '<br>Downed pilots revive on a timer — or instantly on level up.', 7);
  },

  startEndless() {
    UI.hideAll();
    const ch = G.charId;
    // keep the build, keep fighting: endless continues the current run state
    G.state = 'run';
    G.mode = 'endless';
    G.timeScale = 1; G.seqT = 0;
    G.spawn.endlessT = 0;
    G.spawn.nextBossT = 120;
    for (const pl of G.players) {
      if (pl.down) G.revive(pl, 1);
      pl.hp = pl.maxHp;
    }
    AudioSys.setBoss(false);
    AudioSys.startMusic('run');
    AudioSys.music.mode = 'run';
    UI.announce('ENDLESS VOID', 'survive as long as you can', '#ffd34e', 2.5);
  },

  toTitle() {
    G.state = 'title';
    G.players = [];
    G.boss = null;
    UI.hideAll();
    UI.buildCharCards();
    UI.show('title');
    AudioSys.setBoss(false);
    AudioSys.startMusic('menu');
    AudioSys.music.mode = 'menu';
  },

  pause() {
    if (G.state !== 'run') return;
    G.state = 'pause';
    UI.showPause();
  },
  resume() {
    if (G.state !== 'pause') return;
    UI.hide('pause');
    G.state = 'run';
  },
};

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
if (/Electron/i.test(navigator.userAgent)) document.body.classList.add('is-desktop-app');

const Input = {
  keys: new Set(),
  touch: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 },    // P1 (or the only pilot in solo)
  touch2: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 },   // P2 in co-op: right half of the screen
  gpPrev: [],          // previous gamepad button states (edge detection)
  gpAxisPrev: 0,

  init() {
    // ---- touch joystick ----
    const cv = document.getElementById('game');
    cv.style.touchAction = 'none';
    // Solo: one joystick anywhere. Co-op: left half = P1, right half = P2 (two thumbs, one phone).
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const r = cv.getBoundingClientRect();   // canvas may be inset for the notch
      const lx = e.clientX - r.left, ly = e.clientY - r.top;
      const t = (G.coop && lx > r.width / 2) ? this.touch2 : this.touch;
      // a second finger while you're already steering = Beat Dash
      if (t.active) { BeatSys.requestDash(G, t === this.touch2 ? 1 : 0); return; }
      t.active = true; t.id = e.pointerId;
      t.downAt = performance.now(); t.moved = false;
      t.rx = r.left; t.ry = r.top;
      t.ox = t.x = lx; t.oy = t.y = ly;
    });
    window.addEventListener('pointermove', e => {
      const t = e.pointerId === this.touch.id ? this.touch : e.pointerId === this.touch2.id ? this.touch2 : null;
      if (!t || !t.active) return;
      const dx = e.clientX - t.rx - t.ox, dy = e.clientY - t.ry - t.oy;
      const d = Math.hypot(dx, dy), max = 52;
      if (d > 12) t.moved = true;
      const cl = d > max ? max / d : 1;
      t.x = t.ox + dx * cl;
      t.y = t.oy + dy * cl;
    });
    const endTouch = e => {
      for (const t of [this.touch, this.touch2])
        if (e.pointerId === t.id) {
          // a quick tap (no drag) also dashes
          if (e.type === 'pointerup' && !t.moved && performance.now() - t.downAt < 200)
            BeatSys.requestDash(G, t === this.touch2 ? 1 : 0);
          t.active = false; t.id = -1;
        }
    };
    window.addEventListener('pointerup', endTouch);
    window.addEventListener('pointercancel', endTouch);
    document.getElementById('touch-pause').addEventListener('click', () => {
      AudioSys.ensure();
      if (G.state === 'run') App.pause();
      else if (G.state === 'pause') App.resume();
    });
    this._initKeys();
  },

  // ---- gamepads (any number; pad N drives player N in co-op) ----
  pollPads() {
    if (!navigator.getGamepads) return [];
    const pads = [...(navigator.getGamepads() || [])].filter(g => g && g.connected);
    this.gpPrev = this.gpPrev || {};
    this.gpAxisPrev = this.gpAxisPrev || {};
    const moves = [];
    pads.forEach((gp, pi) => {
      const prev = this.gpPrev[pi] || [];
      const pressed = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const edge = i => pressed(i) && !prev[i];
      // menu navigation — any pad may drive menus
      const axX = gp.axes[0] || 0;
      const prevAx = this.gpAxisPrev[pi] || 0;
      const axEdge = (Math.abs(axX) > 0.6 && Math.abs(prevAx) <= 0.6) ? Math.sign(axX) : 0;
      const navL = edge(14) || axEdge < 0, navR = edge(15) || axEdge > 0;
      if (G.state === 'levelup' || G.state === 'title') {
        if (navL) UI.gpMove(-1);
        if (navR) UI.gpMove(1);
        if (edge(0)) UI.gpConfirm();
      } else if (G.state === 'pause' || G.state === 'over' || G.state === 'win') {
        if (edge(0)) UI.gpConfirm();
      }
      if (G.state === 'run' && (edge(0) || edge(5) || edge(7))) BeatSys.requestDash(G, G.coop ? pi : 0);   // A / RB / RT
      if (edge(9)) {           // Start
        if (G.state === 'run') App.pause();
        else if (G.state === 'pause') App.resume();
      }
      this.gpPrev[pi] = gp.buttons.map(b => b.pressed);
      this.gpAxisPrev[pi] = axX;
      // movement vector
      let x = axX, y = gp.axes[1] || 0;
      if (pressed(14)) x -= 1; if (pressed(15)) x += 1;
      if (pressed(12)) y -= 1; if (pressed(13)) y += 1;
      moves.push(Math.hypot(x, y) < 0.22 ? { x: 0, y: 0 } : { x, y });
    });
    return moves;
  },

  _initKeys() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      AudioSys.ensure();
      if (G.state === 'title' && !AudioSys.music.on) AudioSys.startMusic('menu');

      const k = e.key.toLowerCase();
      if (G.state === 'run' && !e.repeat) {
        if (k === ' ') BeatSys.requestDash(G, 0);
        else if (G.coop && (e.code === 'Enter' || e.code === 'ShiftRight' || e.code === 'Numpad0')) BeatSys.requestDash(G, 1);
      }
      if (k === 'escape' || k === 'p') {
        if (G.state === 'run') App.pause();
        else if (G.state === 'pause') App.resume();
      } else if (k === 'm') {
        const muted = AudioSys.toggleMute();
        UI.tip(muted ? 'muted' : 'sound on', 1);
      } else if (G.state === 'levelup' && ['1', '2', '3'].includes(k)) {
        UI.pickByKey(parseInt(k) - 1);
      } else if (G.state === 'levelup' && k === 'r') {
        UI.doReroll();
      } else if (G.state === 'levelup' && k === 'b') {
        UI.toggleBanish();
      } else if (G.state === 'over' && k === 'enter') {
        AudioSys.play('ui');
        App.retry();
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    // iOS Safari only unlocks Web Audio inside touchend/click, not pointerdown
    const unlock = () => {
      AudioSys.ensure();
      if (G.state === 'title' && !AudioSys.music.on) AudioSys.startMusic('menu');
    };
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
      window.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.state === 'run') App.pause();
      if (!document.hidden && AudioSys.ctx && AudioSys.ctx.state !== 'running') AudioSys.ctx.resume();
    });
    // block pinch-zoom and double-tap zoom on iOS
    ['gesturestart', 'gesturechange'].forEach(ev =>
      document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
    // (double-tap zoom is already disabled by touch-action:manipulation + the viewport tag)
    document.getElementById('game').addEventListener('contextmenu', e => e.preventDefault());
  },
  poll() {
    const pads = this.pollPads();      // also services gamepad menu buttons
    if (!G.players.length) return;
    const k = this.keys;

    if (!G.coop) {
      // solo: merge every input source into player 1
      const inp = G.players[0].input;
      if (this.touch.active) {
        inp.x = (this.touch.x - this.touch.ox) / 40;
        inp.y = (this.touch.y - this.touch.oy) / 40;
        return;
      }
      if (pads[0] && (pads[0].x || pads[0].y)) { inp.x = pads[0].x; inp.y = pads[0].y; return; }
      let x = 0, y = 0;
      if (k.has('a') || k.has('arrowleft')) x -= 1;
      if (k.has('d') || k.has('arrowright')) x += 1;
      if (k.has('w') || k.has('arrowup')) y -= 1;
      if (k.has('s') || k.has('arrowdown')) y += 1;
      inp.x = x; inp.y = y;
      return;
    }

    // co-op: P1 = WASD / pad 1 / touch, P2 = arrows / pad 2
    const p1 = G.players[0].input, p2 = G.players[1].input;
    let x1 = 0, y1 = 0;
    if (k.has('a')) x1 -= 1; if (k.has('d')) x1 += 1;
    if (k.has('w')) y1 -= 1; if (k.has('s')) y1 += 1;
    if (this.touch.active) {
      x1 = (this.touch.x - this.touch.ox) / 40;
      y1 = (this.touch.y - this.touch.oy) / 40;
    } else if (!x1 && !y1 && pads[0]) { x1 = pads[0].x; y1 = pads[0].y; }
    p1.x = x1; p1.y = y1;

    let x2 = 0, y2 = 0;
    if (k.has('arrowleft')) x2 -= 1; if (k.has('arrowright')) x2 += 1;
    if (k.has('arrowup')) y2 -= 1; if (k.has('arrowdown')) y2 += 1;
    if (this.touch2.active) {
      x2 = (this.touch2.x - this.touch2.ox) / 40;
      y2 = (this.touch2.y - this.touch2.oy) / 40;
    } else if (!x2 && !y2 && pads[1]) { x2 = pads[1].x; y2 = pads[1].y; }
    p2.x = x2; p2.y = y2;
  },
};

// ---------------------------------------------------------------------------
// canvas + loop
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
let viewW = 0, viewH = 0, dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  // the canvas is inset by CSS safe-area padding on notched phones
  const r = canvas.getBoundingClientRect();
  viewW = Math.round(r.width) || window.innerWidth; viewH = Math.round(r.height) || window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  // CSS sizes the canvas (full screen minus notch insets); we only set its pixel buffer
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

let lastT = performance.now(), acc = 0;
const STEP = 1 / 60;

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  acc += dt;
  Input.poll();
  document.body.classList.toggle('in-run', G.state === 'run' || G.state === 'pause' || G.state === 'levelup');
  let n = 0;
  while (acc >= STEP && n < 5) {
    for (let i = 0; i < App.debugSpeed; i++) G.step(STEP);
    acc -= STEP; n++;
  }
  if (n === 5) acc = 0;

  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.render(ctx2d, viewW, viewH);
  UI.renderHUD(ctx2d, viewW, viewH);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
Sprites.init();
initDataSprites();
App.loadSave();
UI.init();
Input.init();
resize();
App.toTitle();
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// debug console (for tuning; harmless easter egg): open devtools and use VB.*
// ---------------------------------------------------------------------------
window.VB = {
  G, App,
  skip(s) { G.time += s; },                          // jump the clock
  lvl(n = 1) { G.banked += n; },                     // bank level-ups
  god() { for (const pl of G.players) { pl.maxHp = 99999; pl.hp = 99999; } },
  speed(x) { App.debugSpeed = x; },                  // fast-forward sim
  killall() { for (const e of G.enemies.slice()) G.killEnemy(e); },
  boss(id) { G.spawnBoss(id || 'warden'); },
  xp(n) { G.gainXp(n); },
};
