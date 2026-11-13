// VOIDBLOOM — ui.js: DOM overlays + canvas HUD + procedural icons.
'use strict';

const UI = {
  els: {},
  _announceTimer: null,
  _tipTimer: null,
  _iconCache: new Map(),

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      title: $('title'), levelup: $('levelup'), pause: $('pause'),
      gameover: $('gameover'), victory: $('victory'),
      charRow: $('char-row'), cardRow: $('card-row'), lvlSub: $('lvl-sub'),
      announce: $('announce'), tip: $('tip'), flashRed: $('flash-red'),
      pauseStats: $('pause-stats'), pauseBuild: $('pause-build'),
      deathStats: $('death-stats'), deathBuild: $('death-build'),
      winStats: $('win-stats'), winBuild: $('win-build'),
    };
    this.buildCharCards();

    $('btn-resume').onclick = () => { AudioSys.play('ui'); App.resume(); };
    // desktop app only: close the game window (progress is saved first)
    const quit = () => { try { App.persist(); } catch (e) { /* still quit */ } window.close(); };
    $('btn-quit').onclick = quit;
    $('btn-quit-title').onclick = quit;
    $('btn-abandon').onclick = () => { AudioSys.play('uiBack'); App.toTitle(); };
    $('btn-retry').onclick = () => { AudioSys.play('ui'); App.retry(); };
    $('btn-title1').onclick = () => { AudioSys.play('uiBack'); App.toTitle(); };
    $('btn-endless').onclick = () => { AudioSys.play('ui'); App.startEndless(); };
    $('btn-title2').onclick = () => { AudioSys.play('uiBack'); App.toTitle(); };

    $('btn-hangar').onclick = () => { AudioSys.play('ui'); this.showHangar(); };
    $('btn-hangar-back').onclick = () => { AudioSys.play('uiBack'); this.hide('hangar'); this.show('title'); this.buildCharCards(); };
    $('btn-reroll').onclick = () => this.doReroll();
    $('btn-banish').onclick = () => this.toggleBanish();

    const volInit = (id, kind) => {
      const el = $(id);
      el.value = AudioSys.vols[kind] * 100;
      el.oninput = () => { AudioSys.setVol(kind, el.value / 100); App.saveSettings(); };
    };
    volInit('vol-master', 'master');
    volInit('vol-music', 'music');
    volInit('vol-sfx', 'sfx');
  },

  show(name) { (this.els[name] || document.getElementById(name)).classList.add('show'); },
  hide(name) { (this.els[name] || document.getElementById(name)).classList.remove('show'); },
  hideAll() { ['title', 'levelup', 'pause', 'gameover', 'victory', 'hangar'].forEach(n => this.hide(n)); },

  // ------------------------------------------------------------------
  // hangar (meta-progression)
  // ------------------------------------------------------------------
  showHangar() {
    this.hide('title');
    this.buildHangar();
    this.show('hangar');
  },

  buildHangar() {
    document.getElementById('hangar-shards').textContent = '◆ ' + (App.save.shards || 0);
    const grid = document.getElementById('hg-grid');
    grid.innerHTML = '';
    for (const item of HANGAR) {
      const rank = App.save.hangar[item.id] || 0;
      const maxed = rank >= item.ranks;
      const cost = maxed ? 0 : hangarCost(item, rank);
      const el = document.createElement('div');
      el.className = 'hg-item';
      el.appendChild(this.icon(item.icon, 34));
      let pips = '<div class="hg-pips">';
      for (let i = 0; i < item.ranks; i++) pips += `<i class="${i < rank ? 'on' : ''}"></i>`;
      pips += '</div>';
      el.insertAdjacentHTML('beforeend',
        `<div><div class="hg-name">${item.name}</div><div class="hg-per">${item.per} / rank</div>${pips}</div>`);
      const buy = document.createElement('div');
      if (maxed) { buy.className = 'hg-buy maxed'; buy.textContent = 'MAX'; }
      else {
        buy.className = 'hg-buy' + ((App.save.shards || 0) < cost ? ' off' : '');
        buy.innerHTML = '◆ ' + cost;
        buy.onclick = () => { if (App.buyHangar(item.id)) this.buildHangar(); };
      }
      el.appendChild(buy);
      grid.appendChild(el);
    }
    // achievements board
    const ach = document.getElementById('ach-grid');
    ach.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const done = App.save.achieved.includes(a.id);
      const el = document.createElement('div');
      el.className = 'hg-item' + (done ? ' done' : '');
      el.innerHTML = `
        <div style="font-size:20px; width:28px; text-align:center">${done ? '★' : '☆'}</div>
        <div><div class="hg-name">${a.name}</div><div class="hg-per">${a.desc}</div></div>
        <div class="hg-buy ${done ? 'maxed' : 'off'}">${done ? 'DONE' : '◆ ' + a.shards}</div>`;
      ach.appendChild(el);
    }
    // lifetime stats
    const st = App.save.stats;
    document.getElementById('hg-stats').textContent =
      `${st.runs} runs · ${st.kills.toLocaleString()} kills · ${st.wins} wins · best level ${st.bestLevel} · ◆ ${st.shardsEarned} earned lifetime`;
  },

  // ------------------------------------------------------------------
  // reroll / banish
  // ------------------------------------------------------------------
  _banishMode: false,
  doReroll() {
    if (G.state !== 'levelup') return;
    const fresh = G.rerollChoices(this._picker);
    if (fresh) { this._banishMode = false; this.showLevelUp(fresh, this._picker); }
  },
  toggleBanish() {
    if (G.state !== 'levelup' || G.banishes <= 0) return;
    this._banishMode = !this._banishMode;
    AudioSys.play(this._banishMode ? 'warn' : 'uiBack');
    this._syncLvlButtons();
  },
  _syncLvlButtons() {
    document.getElementById('reroll-n').textContent = '(' + G.rerolls + ')';
    document.getElementById('banish-n').textContent = '(' + G.banishes + ')';
    document.getElementById('btn-reroll').classList.toggle('off', G.rerolls <= 0);
    document.getElementById('btn-banish').classList.toggle('off', G.banishes <= 0);
    document.getElementById('banish-note').style.display = this._banishMode ? 'block' : 'none';
    document.querySelectorAll('.up-card').forEach(c => c.classList.toggle('banish-target', this._banishMode));
  },

  // ------------------------------------------------------------------
  // character select
  // ------------------------------------------------------------------
  buildCharCards() {
    const row = this.els.charRow;
    row.innerHTML = '';
    const selCls = ['sel-cyan', 'sel-violet', 'sel-gold'];
    CHARS.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'char-card ' + selCls[ch.id];
      const cv = document.createElement('canvas');
      cv.width = cv.height = 72;
      const cx = cv.getContext('2d');
      Sprites.draw(cx, ch.ship, 36, 36, -Math.PI / 2, 1.7);
      card.appendChild(cv);
      const locked = !App.shipUnlocked(ch);
      if (locked) card.classList.add('locked');
      const best = App.save.best[ch.id + '_' + (App.save.arena || 0)];
      const bestTxt = locked
        ? `<span class="char-unlock">UNLOCK — ◆ ${ch.cost}</span>`
        : best && best.time > 0
          ? `best: ${U.fmtTime(best.time)} · ${best.kills} kills` + (best.won ? ' · ★ CLEARED' : '')
          : 'no flights yet';
      card.insertAdjacentHTML('beforeend', `
        <div class="char-name" style="color:${ch.color}">${ch.name}</div>
        <div class="char-sub">${ch.sub}</div>
        <div class="char-desc">${ch.desc}</div>
        <div class="char-best">${bestTxt}</div>`);
      card.onclick = () => {
        if (!App.shipUnlocked(ch)) {
          if (App.buyShip(ch.id)) {
            UI.announce(ch.name + ' UNLOCKED', 'new ship in the fleet', ch.color, 2.2);
            this.buildCharCards();
          } else AudioSys.play('uiBack');
          return;
        }
        AudioSys.play('ui');
        if (!App.save.coopMode) { App.startRun(ch.id); return; }
        if (this._p1Char === null) {
          this._p1Char = ch.id;
          card.classList.add('picked');
          this.coopHint('PLAYER 2 — PICK YOUR SHIP');
        } else {
          App.startCoop([this._p1Char, ch.id]);
        }
      };
      card.onmouseenter = () => AudioSys.play('ui');
      row.appendChild(card);
    });
    this._p1Char = null;
    this.coopHint(App.save.coopMode ? 'PLAYER 1 — PICK YOUR SHIP' : null);
    document.getElementById('title-shards').textContent = '◆ ' + (App.save.shards || 0);
    this.buildModeRow();
    this.buildArenaRow();
  },

  _p1Char: null,
  coopHint(text) {
    const el = document.getElementById('coop-hint');
    el.style.display = text ? 'block' : 'none';
    el.style.color = this._p1Char !== null ? '#b06bff' : '#4ef3ff';
    if (text) el.textContent = text;
  },

  buildModeRow() {
    const row = document.getElementById('mode-row');
    row.innerHTML = '';
    [{ id: false, name: 'SOLO', sub: 'one pilot' },
     { id: true, name: 'CO-OP', sub: '2 players · one screen' }].forEach(m => {
      const card = document.createElement('div');
      card.className = 'arena-card a0' + (!!App.save.coopMode === m.id ? ' picked' : '');
      card.innerHTML = `<div class="an">${m.name}</div><div class="as">${m.sub}</div>`;
      card.onclick = () => {
        AudioSys.play('ui');
        App.save.coopMode = m.id;
        App.persist();
        this.buildCharCards();
      };
      row.appendChild(card);
    });
  },

  buildArenaRow() {
    const row = document.getElementById('arena-row');
    row.innerHTML = '';
    ARENAS.forEach(az => {
      const card = document.createElement('div');
      card.className = 'arena-card a' + Math.min(az.id, 1) + ((App.save.arena || 0) === az.id ? ' picked' : '');
      card.innerHTML = `<div class="an">${az.name}</div><div class="as">${az.sub}</div>`;
      card.onclick = () => {
        AudioSys.play('ui');
        App.save.arena = az.id;
        App.persist();
        this.buildCharCards();
      };
      row.appendChild(card);
    });
    // NIGHTMARE toggle — earned by beating the game once
    if (App.hasWon()) {
      const nm = document.createElement('div');
      nm.className = 'arena-card nm' + (App.save.nightmare ? ' picked' : '');
      nm.innerHTML = `<div class="an">NIGHTMARE</div><div class="as">${App.save.nightmare ? 'armed · ×1.75 shards' : 'harder · ×1.75 shards'}</div>`;
      nm.onclick = () => {
        App.save.nightmare = !App.save.nightmare;
        App.persist();
        AudioSys.play(App.save.nightmare ? 'warn' : 'uiBack');
        this.buildCharCards();
      };
      row.appendChild(nm);
    }
  },

  // ------------------------------------------------------------------
  // gamepad menu focus
  // ------------------------------------------------------------------
  _gpIdx: 0,
  _gpCards() {
    if (G.state === 'levelup') return [...document.querySelectorAll('.up-card')];
    if (G.state === 'title') return [...document.querySelectorAll('.char-card')];
    return [];
  },
  gpMove(delta) {
    const cards = this._gpCards();
    if (!cards.length) return;
    cards.forEach(c => c.classList.remove('gp-focus'));
    this._gpIdx = ((this._gpIdx + delta) % cards.length + cards.length) % cards.length;
    cards[this._gpIdx].classList.add('gp-focus');
    AudioSys.play('ui');
  },
  gpConfirm() {
    const cards = this._gpCards();
    if (cards.length) {
      const idx = Math.min(this._gpIdx, cards.length - 1);
      cards[idx].click();
      return;
    }
    if (G.state === 'pause') App.resume();
    else if (G.state === 'over') App.retry();
    else if (G.state === 'win') App.startEndless();
  },
  gpResetFocus() {
    this._gpIdx = 0;
    document.querySelectorAll('.gp-focus').forEach(c => c.classList.remove('gp-focus'));
  },

  // ------------------------------------------------------------------
  // procedural icons
  // ------------------------------------------------------------------
  icon(id, size = 40) {
    const key = id + '_' + size;
    let cv = this._iconCache.get(key);
    if (cv) return cv.cloneNode ? this._cloneCanvas(cv) : cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d');
    const c = size / 2, u = size / 40; // unit scale
    const color = this._iconColor(id);
    x.translate(c, c);
    x.scale(u, u);
    x.shadowColor = color; x.shadowBlur = 7;
    x.strokeStyle = color; x.fillStyle = color;
    x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round';
    this._drawGlyph(x, id);
    this._iconCache.set(key, cv);
    return this._cloneCanvas(cv);
  },
  _cloneCanvas(cv) {
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    c2.getContext('2d').drawImage(cv, 0, 0);
    return c2;
  },
  _iconColor(id) {
    if (id.startsWith('w_')) { const wid = id.slice(2); return WEAPONS[wid] ? WEAPONS[wid].color : '#fff'; }
    if (id.startsWith('p_')) { const pid = id.slice(2); return PASSIVES[pid] ? PASSIVES[pid].color : '#fff'; }
    return '#ffffff';
  },
  _drawGlyph(x, id) {
    switch (id) {
      case 'w_blaster':
        [[-8, 6], [0, 0], [8, -6]].forEach(([px, py]) => {
          x.beginPath(); x.ellipse(px, py, 7, 2.6, -0.64, 0, TAU); x.fill();
        });
        break;
      case 'w_orbit':
        x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.stroke();
        [0, 2.1, 4.2].forEach(a => { x.beginPath(); x.arc(Math.cos(a) * 10, Math.sin(a) * 10, 3.5, 0, TAU); x.fill(); });
        break;
      case 'w_nova':
        x.beginPath(); x.arc(0, 0, 5, 0, TAU); x.stroke();
        x.globalAlpha = 0.7; x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.stroke();
        x.globalAlpha = 0.4; x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.stroke();
        x.globalAlpha = 1;
        break;
      case 'w_rail':
        x.fillRect(-15, -2, 30, 4);
        x.beginPath(); x.arc(-11, 0, 5, 0, TAU); x.fill();
        break;
      case 'w_missiles':
        x.beginPath(); x.moveTo(10, -6); x.lineTo(-4, -2); x.lineTo(-1, -6); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(6, 7); x.lineTo(-8, 11); x.lineTo(-5, 7); x.closePath(); x.fill();
        break;
      case 'w_arc':
        x.beginPath(); x.moveTo(2, -14); x.lineTo(-6, 1); x.lineTo(0, 1); x.lineTo(-2, 14); x.lineTo(7, -2); x.lineTo(1, -2);
        x.closePath(); x.fill();
        break;
      case 'w_scythe':
        x.lineWidth = 4;
        x.beginPath(); x.arc(0, 0, 11, -2.2, 1.1); x.stroke();
        break;
      case 'w_scatter':
        [[-12, 0], [-2, -7], [-2, 0], [-2, 7], [8, -11], [8, -4], [8, 4], [8, 11]].forEach(([px, py]) => {
          x.beginPath(); x.arc(px, py, 2.4, 0, TAU); x.fill();
        });
        break;
      case 'w_mines':
        x.beginPath(); x.moveTo(0, -9); x.lineTo(9, 0); x.lineTo(0, 9); x.lineTo(-9, 0);
        x.closePath(); x.stroke();
        x.beginPath(); x.arc(0, 0, 2.8, 0, TAU); x.fill();
        break;
      case 'w_singularity':
        x.beginPath(); x.arc(0, 0, 4, 0, TAU); x.fill();
        x.beginPath(); x.arc(0, 0, 9, 0.4, 3.6); x.stroke();
        x.beginPath(); x.arc(0, 0, 13, 3.5, 6.4); x.stroke();
        break;
      case 'w_aura':
        x.globalAlpha = 0.35; x.beginPath(); x.arc(0, 0, 13, 0, TAU); x.fill();
        x.globalAlpha = 1;
        x.beginPath();
        x.moveTo(0, 8); x.bezierCurveTo(-7, 3, -4, -4, 0, -9); x.bezierCurveTo(4, -4, 7, 3, 0, 8);
        x.fill();
        break;
      case 'p_amp':
        x.beginPath(); x.moveTo(-9, 3); x.lineTo(0, -7); x.lineTo(9, 3); x.stroke();
        x.beginPath(); x.moveTo(-9, 11); x.lineTo(0, 1); x.lineTo(9, 11); x.stroke();
        break;
      case 'p_accel':
        x.beginPath(); x.arc(0, 2, 10, 0, TAU); x.stroke();
        x.beginPath(); x.moveTo(0, 2); x.lineTo(5, -3); x.stroke();
        x.beginPath(); x.moveTo(-4, -11); x.lineTo(4, -11); x.stroke();
        break;
      case 'p_plating':
        x.beginPath(); x.moveTo(0, -12); x.lineTo(10, -7); x.lineTo(10, 3); x.quadraticCurveTo(10, 10, 0, 13);
        x.quadraticCurveTo(-10, 10, -10, 3); x.lineTo(-10, -7); x.closePath(); x.stroke();
        break;
      case 'p_nanobots':
        x.lineWidth = 4;
        x.beginPath(); x.moveTo(0, -9); x.lineTo(0, 9); x.moveTo(-9, 0); x.lineTo(9, 0); x.stroke();
        break;
      case 'p_thrusters':
        x.beginPath(); x.moveTo(-10, -6); x.lineTo(2, -6); x.lineTo(10, 0); x.lineTo(2, 6); x.lineTo(-10, 6);
        x.lineTo(-4, 0); x.closePath(); x.stroke();
        break;
      case 'p_attractor':
        x.lineWidth = 4.5;
        x.beginPath(); x.arc(0, -2, 8, Math.PI * 0.1, Math.PI * 0.9, true); x.stroke();
        x.fillRect(-11, 4, 5.5, 6); x.fillRect(5.5, 4, 5.5, 6);
        break;
      case 'p_shield': {
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU - Math.PI / 2;
          i === 0 ? x.moveTo(Math.cos(a) * 11, Math.sin(a) * 11) : x.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        }
        x.closePath(); x.stroke();
        break;
      }
      case 'p_targeting':
        x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.stroke();
        x.beginPath();
        x.moveTo(0, -13); x.lineTo(0, -5); x.moveTo(0, 13); x.lineTo(0, 5);
        x.moveTo(-13, 0); x.lineTo(-5, 0); x.moveTo(13, 0); x.lineTo(5, 0);
        x.stroke();
        break;
      case 'heal':
        x.strokeStyle = x.fillStyle = '#ff5252'; x.shadowColor = '#ff5252';
        x.lineWidth = 5;
        x.beginPath(); x.moveTo(0, -9); x.lineTo(0, 9); x.moveTo(-9, 0); x.lineTo(9, 0); x.stroke();
        break;
      case 'p_siphon':
        x.beginPath(); x.moveTo(0, 12); x.bezierCurveTo(-9, 5, -6, -5, 0, -2);
        x.bezierCurveTo(6, -5, 9, 5, 0, 12); x.fill();
        x.beginPath(); x.moveTo(0, -12); x.lineTo(0, -4); x.stroke();
        break;
      case 'p_evasion':
        x.globalAlpha = 0.4;
        x.beginPath(); x.moveTo(9, -12); x.lineTo(-3, -12); x.lineTo(-9, 0); x.lineTo(3, 0); x.closePath(); x.stroke();
        x.globalAlpha = 1;
        x.beginPath(); x.moveTo(15, -6); x.lineTo(3, -6); x.lineTo(-3, 6); x.lineTo(9, 6); x.closePath(); x.stroke();
        break;
      case 'p_expanse':
        x.beginPath(); x.arc(0, 0, 5, 0, TAU); x.stroke();
        [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx2, dy2]) => {
          x.beginPath(); x.moveTo(dx2 * 8, dy2 * 8); x.lineTo(dx2 * 13, dy2 * 13); x.stroke();
        });
        break;
      case 'p_greed': case 'h_xp':
        x.beginPath(); x.moveTo(0, -11); x.lineTo(8, 0); x.lineTo(0, 11); x.lineTo(-8, 0); x.closePath(); x.fill();
        break;
      case 'p_curse':
        x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.stroke();
        x.beginPath(); x.arc(0, 0, 10, -0.5, 1.2); x.lineWidth = 5; x.stroke();
        x.lineWidth = 2.6;
        x.beginPath(); x.moveTo(-4, -3); x.lineTo(4, 3); x.moveTo(4, -3); x.lineTo(-4, 3); x.stroke();
        break;
      case 'p_duplicator':
        x.globalAlpha = 0.5;
        x.beginPath(); x.ellipse(-5, 3, 7, 2.8, -0.6, 0, TAU); x.fill();
        x.globalAlpha = 1;
        x.beginPath(); x.ellipse(4, -4, 7, 2.8, -0.6, 0, TAU); x.fill();
        break;
      case 'p_wrath':
        x.beginPath(); x.moveTo(0, -13); x.lineTo(4, -4); x.lineTo(13, -3); x.lineTo(6, 3);
        x.lineTo(8, 12); x.lineTo(0, 7); x.lineTo(-8, 12); x.lineTo(-6, 3); x.lineTo(-13, -3);
        x.lineTo(-4, -4); x.closePath(); x.fill();
        break;
      case 'p_wind':
        x.beginPath(); x.arc(0, 2, 9, Math.PI * 0.85, Math.PI * 2.25); x.stroke();
        x.beginPath(); x.moveTo(7, -4); x.lineTo(11, -8); x.moveTo(7, -4); x.lineTo(2, -6); x.stroke();
        break;
      case 'h_reroll':
        x.beginPath(); x.arc(0, 0, 9, 0.5, Math.PI * 1.7); x.stroke();
        x.beginPath(); x.moveTo(8, -6); x.lineTo(9, -1); x.lineTo(4, -2); x.stroke();
        break;
      case 'h_banish':
        x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.stroke();
        x.beginPath(); x.moveTo(-7, 7); x.lineTo(7, -7); x.stroke();
        break;
    }
  },

  // ------------------------------------------------------------------
  // level up cards
  // ------------------------------------------------------------------
  showLevelUp(choices, picker) {
    this._picker = picker || G.players[0];
    const row = this.els.cardRow;
    row.innerHTML = '';
    if (G.coop) {
      const ch = CHARS[this._picker.charId];
      this.els.lvlSub.innerHTML = `LEVEL ${G.level} — <span style="color:${ch.color}">P${this._picker.idx + 1} (${ch.name})</span> CHOOSES`;
    } else {
      this.els.lvlSub.textContent = 'LEVEL ' + G.level + ' — CHOOSE AN UPGRADE';
    }
    choices.forEach((c, i) => {
      const info = this._choiceInfo(c);
      const card = document.createElement('div');
      card.className = 'up-card' + (c.kind === 'epic' ? ' epic' : c.tier === 2 ? ' rare' : '');
      card.innerHTML = `<span class="uc-key">${i + 1}</span>`;
      card.appendChild(this.icon(info.icon, 40));
      let pips = '';
      if (info.pips) {
        pips = '<div class="uc-pips">';
        for (let k = 0; k < info.pipMax; k++)
          pips += `<i class="${k < info.pipOn ? (info.tag === 'EVOLUTION' ? 'evo on' : 'on') : ''}"></i>`;
        pips += '</div>';
      }
      card.insertAdjacentHTML('beforeend', `
        <div class="uc-name" style="color:${info.color}">${info.name}</div>
        <div class="uc-tag ${info.tagCls}">${info.tag}</div>
        <div class="uc-desc">${info.desc}</div>${pips}`);
      card.onclick = () => this._pick(c);
      card.onmouseenter = () => AudioSys.play('ui');
      row.appendChild(card);
    });
    this._choices = choices;
    this._banishMode = false;
    this._syncLvlButtons();
    this.gpResetFocus();
    this.show('levelup');
  },

  _choiceInfo(c) {
    switch (c.kind) {
      case 'newWeapon': {
        const d = WEAPONS[c.id];
        return { icon: d.icon, name: d.name, color: d.color, tag: 'NEW WEAPON', tagCls: 'new', desc: d.desc, pips: true, pipMax: 8, pipOn: 1 };
      }
      case 'weapon': {
        const d = WEAPONS[c.id];
        const w = (this._picker || G.players[0]).weapons.find(w => w.id === c.id);
        return { icon: d.icon, name: d.name, color: d.color, tag: 'WEAPON  LV ' + (w.lvl + 1), tagCls: 'wpn', desc: d.upgrades[w.lvl - 1].desc, pips: true, pipMax: 8, pipOn: w.lvl + 1 };
      }
      case 'evolve': {
        const d = WEAPONS[c.id];
        return { icon: d.icon, name: d.evo.name, color: '#ffd34e', tag: 'EVOLUTION', tagCls: 'evo', desc: d.evo.desc, pips: true, pipMax: 8, pipOn: 8 };
      }
      case 'newPassive': {
        const d = PASSIVES[c.id];
        return { icon: d.icon, name: d.name, color: d.color, tag: 'NEW PASSIVE', tagCls: 'new', desc: d.desc + ' ' + d.per + '.', pips: true, pipMax: d.max, pipOn: 1 };
      }
      case 'passive': {
        const d = PASSIVES[c.id];
        const lvl = (this._picker || G.players[0]).passives[c.id];
        return { icon: d.icon, name: d.name, color: d.color, tag: 'PASSIVE  LV ' + (lvl + 1), tagCls: 'pas', desc: d.per + '.', pips: true, pipMax: d.max, pipOn: lvl + 1 };
      }
      case 'heal':
        return { icon: 'heal', name: 'Emergency Repair', color: '#ff5252', tag: 'REPAIR', tagCls: 'heal', desc: 'Restore 40 hull points immediately.', pips: false };
      case 'epic': {
        const b = BOONS[c.id];
        return { icon: b.icon, name: b.name, color: '#b06bff', tag: 'EPIC BOON', tagCls: 'evo', desc: b.desc, pips: false };
      }
      case 'pact': {
        const d = PACTS[c.id];
        return { icon: d.icon, name: d.name, color: d.color, tag: 'VOID PACT', tagCls: 'heal',
          desc: d.gain + '. <b style="color:#ff5252">+1 HEAT</b>: more enemies, faster and tougher.', pips: false };
      }
    }
  },

  _pick(c) {
    if (this._banishMode) {
      const fresh = G.banishChoice(this._picker, c);
      this._banishMode = false;
      if (fresh) this.showLevelUp(fresh, this._picker);
      else this._syncLvlButtons();
      return;
    }
    this.hide('levelup');
    G.applyUpgrade(this._picker, c);
    G.state = 'run';
  },

  pickByKey(i) {
    if (G.state !== 'levelup' || !this._choices || !this._choices[i]) return;
    this._pick(this._choices[i]);
  },

  // ------------------------------------------------------------------
  // announcements / toasts
  // ------------------------------------------------------------------
  announce(text, sub, color, dur = 2) {
    const el = this.els.announce;
    el.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
    el.style.color = color || '#ff5252';
    el.style.textShadow = `0 0 24px ${color || '#ff5252'}`;
    el.classList.add('show');
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  },

  tip(text, dur = 4) {
    const el = this.els.tip;
    el.innerHTML = text;
    el.classList.add('show');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
  },

  redFlash() {
    const el = this.els.flashRed;
    el.style.transition = 'none';
    el.style.opacity = 1;
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .45s ease';
      el.style.opacity = 0;
    });
  },

  // ------------------------------------------------------------------
  // end screens
  // ------------------------------------------------------------------
  _statsRows(el) {
    // top damage sources this run
    const top = Object.entries(G.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, v]) => `${WEAPONS[id] ? WEAPONS[id].name : id} ${U.fmtNum(v)}`)
      .join(' · ');
    el.innerHTML = `
      <div class="k">Survived</div><div class="v">${U.fmtTime(G.time)}${G.mode === 'endless' ? ' (endless)' : ''}</div>
      <div class="k">Kills</div><div class="v">${G.kills.toLocaleString()}</div>
      <div class="k">Level</div><div class="v">${G.level}</div>
      <div class="k">Damage dealt</div><div class="v">${U.fmtNum(G.dmgDealt)}</div>
      <div class="k">Bosses slain</div><div class="v">${G.bossesKilled}</div>
      ${top ? `<div class="k">Top damage</div><div class="v" style="font-size:12.5px">${top}</div>` : ''}
      <div class="k">Shards earned</div><div class="v" style="color:var(--violet)">◆ ${G.lastShards}</div>
      ${(G.newAchievements || []).map(a =>
        `<div class="k" style="color:var(--gold)">★ ACHIEVEMENT</div><div class="v" style="color:var(--gold)">${a.name} (+◆${a.shards})</div>`).join('')}`;
  },

  _buildRecap(el) {
    el.innerHTML = '';
    G.players.forEach((pl, pi) => {
      if (G.coop) {
        const tag = document.createElement('div');
        tag.className = 'bi';
        tag.innerHTML = `<span style="color:${CHARS[pl.charId].color};font-weight:800;font-size:12px;line-height:30px">P${pi + 1}</span><span>&nbsp;</span>`;
        el.appendChild(tag);
      }
      for (const w of pl.weapons) {
        const d = document.createElement('div');
        d.className = 'bi';
        d.appendChild(this.icon(WEAPONS[w.id].icon, 30));
        d.insertAdjacentHTML('beforeend', `<span>${w.evolved ? 'EVO' : 'Lv' + w.lvl}</span>`);
        el.appendChild(d);
      }
      for (const id in pl.passives) {
        const d = document.createElement('div');
        d.className = 'bi';
        d.appendChild(this.icon(PASSIVES[id].icon, 30));
        d.insertAdjacentHTML('beforeend', `<span>Lv${pl.passives[id]}</span>`);
        el.appendChild(d);
      }
    });
  },

  showGameOver() {
    App.recordRun(false);
    this._statsRows(this.els.deathStats);
    this._buildRecap(this.els.deathBuild);
    this.show('gameover');
  },

  showVictory() {
    App.recordRun(true);
    this._statsRows(this.els.winStats);
    this._buildRecap(this.els.winBuild);
    this.show('victory');
  },

  showPause() {
    this._statsRows(this.els.pauseStats);
    this._buildRecap(this.els.pauseBuild);
    this.show('pause');
  },

  // ------------------------------------------------------------------
  // canvas HUD (drawn every frame over the world)
  // ------------------------------------------------------------------
  renderHUD(ctx, w, h) {
    if (G.state === 'title') return;
    if (!G.players.length) return;

    ctx.save();
    ctx.textBaseline = 'middle';

    // --- HP bars + build icons, one block per player (top-left) ---
    G.players.forEach((p, pi) => {
      const hpW = Math.min(210, Math.max(110, w * 0.3)), hpH = 13, hx = 16, hy = 16 + pi * 62;
      ctx.fillStyle = 'rgba(8,12,28,0.75)';
      ctx.fillRect(hx - 2, hy - 2, hpW + 4, hpH + 4);
      const frac = U.clamp(p.hp / p.maxHp, 0, 1);
      if (p.down) {
        ctx.fillStyle = 'rgba(224,68,55,0.35)';
        ctx.fillRect(hx, hy, hpW * (1 - p.downT / 15), hpH);
      } else {
        const hpGrad = ctx.createLinearGradient(hx, 0, hx + hpW, 0);
        if (frac > 0.35) { hpGrad.addColorStop(0, '#37e08a'); hpGrad.addColorStop(1, '#7bff9f'); }
        else { hpGrad.addColorStop(0, '#e04437'); hpGrad.addColorStop(1, '#ff8552'); }
        ctx.fillStyle = hpGrad;
        ctx.fillRect(hx, hy, hpW * frac, hpH);
      }
      ctx.strokeStyle = 'rgba(150,190,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 2, hy - 2, hpW + 4, hpH + 4);
      ctx.fillStyle = '#eaf4ff';
      ctx.font = 'bold 10px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(p.down ? 'DOWN — ' + Math.ceil(p.downT) + 's' : Math.ceil(p.hp) + ' / ' + p.maxHp,
        hx + hpW / 2, hy + hpH / 2 + 0.5);
      ctx.textAlign = 'left';
      if (G.coop) {
        ctx.fillStyle = CHARS[p.charId].color;
        ctx.font = 'bold 11px Segoe UI';
        ctx.fillText('P' + (pi + 1), hx + hpW + 10, hy + hpH / 2);
      }
      if (p.armor > 0) {
        ctx.fillStyle = '#8aa0ff';
        ctx.font = 'bold 11px Segoe UI';
        ctx.fillText('⬡ ' + p.armor, hx + hpW + (G.coop ? 34 : 10), hy + hpH / 2);
      }

      let ix = hx, iy = hy + 20;
      for (const wp of p.weapons) {
        const cv = this.icon(WEAPONS[wp.id].icon, 24);
        ctx.globalAlpha = 0.92;
        ctx.drawImage(cv, ix, iy);
        ctx.globalAlpha = 1;
        ctx.fillStyle = wp.evolved ? '#ffd34e' : '#9fb2d8';
        ctx.font = 'bold 9px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(wp.evolved ? '★' : wp.lvl, ix + 12, iy + 31);
        ix += 30;
      }
      ix += 6;
      for (const id in p.passives) {
        const cv = this.icon(PASSIVES[id].icon, 20);
        ctx.globalAlpha = 0.75;
        ctx.drawImage(cv, ix, iy + 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#9fb2d8';
        ctx.font = 'bold 9px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(p.passives[id], ix + 10, iy + 31);
        ix += 26;
      }
    });

    // --- timer (top-center) ---
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Segoe UI';
    ctx.fillStyle = '#eaf4ff';
    ctx.shadowColor = '#4ef3ff'; ctx.shadowBlur = 10;
    ctx.fillText(U.fmtTime(G.time), w / 2, 34);
    ctx.shadowBlur = 0;
    if (G.mode === 'endless') {
      ctx.font = 'bold 11px Segoe UI';
      ctx.fillStyle = '#ffd34e';
      ctx.fillText('ENDLESS', w / 2, 56);
    }

    // --- kills + level (top-right) ---
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Segoe UI';
    ctx.fillStyle = '#ff8adf';
    const rx = w - 18 - (IS_TOUCH ? 56 : 0);   // leave room for the on-screen pause button
    ctx.fillText(G.kills.toLocaleString() + ' ✦', rx, 24);
    ctx.fillStyle = '#4ef3ff';
    ctx.fillText('LV ' + G.level, rx, 46);
    if (G.heat) { ctx.fillStyle = '#ff5252'; ctx.font = 'bold 13px Segoe UI'; ctx.fillText('🔥 HEAT ' + G.heat, rx, 66); }
    if (G.healMult && G.healMult() < 0.99) {
      ctx.fillStyle = '#b06bff'; ctx.font = 'bold 11px Segoe UI';
      ctx.fillText('VOID ROT −' + Math.round((1 - G.healMult()) * 100) + '% healing', rx, G.heat ? 84 : 66);
    }

    // --- boss bar ---
    const b = G.boss;
    if (b && !b.dead) {
      const bw = Math.min(430, w * 0.5), bx = w / 2 - bw / 2, by = 66;
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px Segoe UI';
      ctx.fillStyle = b.def.color;
      ctx.shadowColor = b.def.color; ctx.shadowBlur = 8;
      ctx.fillText(b.def.name, w / 2, by - 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(8,12,28,0.75)';
      ctx.fillRect(bx - 2, by + 6, bw + 4, 12);
      ctx.fillStyle = b.def.color;
      ctx.fillRect(bx, by + 8, bw * U.clamp(b.hp / b.maxHp, 0, 1), 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(bx - 2, by + 6, bw + 4, 12);
    }

    if (G.state === 'run' || G.state === 'pause' || G.state === 'levelup') {
      BeatSys.renderScreen(G, ctx, w, h);
      BeatSys.renderHud(G, ctx, w, h);
    }

    // --- touch joystick ---
    const jcol = i => (G.coop && G.players[i]) ? CHARS[G.players[i].charId].color : '#9feaff';
    [[Input.touch, jcol(0)], [Input.touch2, jcol(1)]].forEach(([tj, col]) => {
      if (!tj || !tj.active) return;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tj.ox, tj.oy, 52, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(tj.x, tj.y, 20, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    });
    // co-op on a touch screen: faint split line + side labels so each player knows their half
    if (G.coop && IS_TOUCH && G.state === 'run') {
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([6, 10]);
      ctx.beginPath(); ctx.moveTo(w / 2, 80); ctx.lineTo(w / 2, h - 70); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.35;
      ctx.font = 'bold 12px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillStyle = jcol(0); ctx.fillText('P1', w / 4, h - 58);
      ctx.fillStyle = jcol(1); ctx.fillText('P2', w * 3 / 4, h - 58);
      ctx.globalAlpha = 1;
    }

    // --- XP bar (bottom edge) ---
    const xw = w - 32;
    ctx.fillStyle = 'rgba(8,12,28,0.7)';
    ctx.fillRect(16, h - 14, xw, 7);
    const xpFrac = U.clamp(G.xp / G.xpNext, 0, 1);
    const xpGrad = ctx.createLinearGradient(16, 0, 16 + xw, 0);
    xpGrad.addColorStop(0, '#2fb9d8'); xpGrad.addColorStop(1, '#4ef3ff');
    ctx.fillStyle = xpGrad;
    ctx.fillRect(16, h - 14, xw * xpFrac, 7);

    ctx.restore();
  },
};
