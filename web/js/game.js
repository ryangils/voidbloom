// VOIDBLOOM — game.js: core simulation + world rendering.
'use strict';

const G = {
  state: 'title',        // title | run | levelup | pause | dying | over | winning | win
  mode: 'normal',        // normal | endless | sector
  sector: null,          // the campaign sector being flown, or null
  mod: { spawn: 1, batch: 0, hp: 1, dmg: 1, spd: 1, heal: 1, xp: 1, dealt: 1, eliteStart: null, eliteEvery: null, tide: 0 },
  killsByType: {},
  arena: 0,
  coop: false,
  nightmare: false,
  firstHitAt: Infinity,
  pickTurn: 0,           // whose upgrade pick is next in co-op
  time: 0, kills: 0, dmgDealt: 0,
  level: 1, xp: 0, xpNext: 0, banked: 0,
  rerolls: 0, banishes: 0, banned: null, dmgBy: {}, permSlow: 1, lastShards: 0,
  players: [],
  // legacy accessors: solo code paths and debug tools address player 1
  get player() { return this.players[0] || null; },
  get charId() { return this.players[0] ? this.players[0].charId : 0; },
  get weapons() { return this.players[0] ? this.players[0].weapons : []; },
  get passives() { return this.players[0] ? this.players[0].passives : {}; },
  enemies: [], bullets: [], ebullets: [], gems: [], pickups: [],
  parts: [], dnums: [], rings: [], beams: [], zaps: [], scythes: [],
  mines: [], singus: [], hazards: [], hazardT: 0,
  boss: null, bossIdx: 0, bossesKilled: 0,
  cam: { x: 0, y: 0, shake: 0 },
  grid: new SpatialHash(72),
  qbuf: [],              // reusable query buffer
  spawn: { phase: 0, timer: 1.2, eventIdx: 0, eliteTimer: 0, endlessT: 0 },
  gemCombo: { n: 0, t: 0 },
  hitStop: 0, timeScale: 1, seqT: 0,
  _inputFallback: { x: 0, y: 0 },
  // legacy solo accessor: writes to G.input land on player 1
  get input() { return this.players[0] ? this.players[0].input : this._inputFallback; },
  view: { w: 1280, h: 720 },
  deferred: [],

  // schedule fn on the sim clock (pauses with the game, unlike setTimeout)
  defer(delay, fn) { this.deferred.push({ t: this.time + delay, fn }); },
  runDeferred() {
    for (let i = this.deferred.length - 1; i >= 0; i--) {
      if (this.deferred[i].t <= this.time) {
        const d = this.deferred[i];
        swapRemove(this.deferred, i);
        d.fn();
      }
    }
  },

  pools: {
    bullet: new Pool(() => ({})), ebullet: new Pool(() => ({})),
    part: new Pool(() => ({})), dnum: new Pool(() => ({})),
    gem: new Pool(() => ({})),
  },

  // =========================================================================
  // RUN SETUP
  // =========================================================================
  newRun(charIds, endless = false, arena = 0, sector = null) {
    if (!Array.isArray(charIds)) charIds = [charIds];
    this.coop = charIds.length > 1;
    this.pickTurn = 0;
    this.sector = sector;
    if (sector) arena = sector.arena;
    this.arena = arena;
    this.mode = sector ? 'sector' : endless ? 'endless' : 'normal';
    this.mod = Progress.mods(sector);
    this.killsByType = {};
    this.overdrives = 0; this.pacts = 0; this.chests = 0; this.downs = 0;
    this.bossSpawnT = null; this.bossKillT = null; this.sectorEnd = false; this.tideT = 0;
    this.state = 'run';
    this.time = 0; this.kills = 0; this.dmgDealt = 0;
    this.level = 1; this.xp = 0; this.xpNext = xpNeed(1); this.banked = 0;
    this.enemies.length = 0; this.bullets.length = 0; this.ebullets.length = 0;
    this.gems.length = 0; this.pickups.length = 0; this.parts.length = 0;
    this.dnums.length = 0; this.rings.length = 0; this.beams.length = 0;
    this.zaps.length = 0; this.scythes.length = 0;
    this.mines.length = 0; this.singus.length = 0;
    this.hazards.length = 0; this.hazardT = 0;
    const az = ARENAS[arena];
    if (az.hazard) {
      for (let i = 0; i < az.hazard.count; i++) {
        const a = U.rand(0, TAU), d = U.rand(450, 950);
        this.hazards.push({
          x: Math.cos(a) * d, y: Math.sin(a) * d,
          vx: U.rand(-az.hazard.drift, az.hazard.drift), vy: U.rand(-az.hazard.drift, az.hazard.drift),
          r: az.hazard.radius * U.rand(0.8, 1.2), wob: U.rand(0, TAU),
        });
      }
    }
    this.boss = null; this.bossIdx = 0; this.bossesKilled = 0;
    this.deferred.length = 0;
    this.spawn = { phase: 0, timer: 1.2, eventIdx: 0, eliteTimer: 0, endlessT: 0 };
    this.gemCombo = { n: 0, t: 0 };
    this.hitStop = 0; this.timeScale = 1; this.seqT = 0;
    this.cam.x = 0; this.cam.y = 0; this.cam.shake = 0;

    const hg = (typeof App !== 'undefined' && App.save.hangar) ? App.save.hangar : {};
    const perks = (typeof App !== 'undefined' && App.save.perks) || {};
    this.rerolls = 2 + (hg.reroll || 0) + (perks.reroll || 0);
    this.banishes = 1 + (hg.banish || 0) + (perks.banish || 0);
    this.banned = new Set();
    this.dmgBy = {};
    this.permSlow = 1;
    this.lastShards = 0;
    this.firstHitAt = Infinity;
    this.nightmare = !sector && !!(typeof App !== 'undefined' && App.save.nightmare);

    this.players = charIds.map((cid, idx) => {
      const pl = {
        idx, charId: cid,
        x: idx * 70 - (charIds.length - 1) * 35, y: 0, vx: 0, vy: 0, r: 12, faceAng: 0,
        hp: 0, maxHp: 0, iframes: 0, hurtT: 0, trailT: 0,
        weapons: [], passives: {},
        input: { x: 0, y: 0 },
        down: false, downT: 0, sporeT: 0,
        bonusDmg: 0, bonusHp: 10 * (perks.hull || 0), usedWind: false,
      };
      this.addWeapon(pl, CHARS[cid].weapon);
      this.recalcStats(pl);
      pl.hp = pl.maxHp;
      return pl;
    });

    BeatSys.initRun(this);
    this.heat = sector ? sector.heat : 0; this.rotWarned = false;

    // opening wave so the first seconds aren't dead air
    this.defer(2.5, () => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + U.rand(-0.2, 0.2);
        this.spawnEnemy('mote', Math.cos(a) * 620, Math.sin(a) * 620);
      }
    });
  },

  // co-op runs a little hotter: two builds' worth of DPS on screen
  coopHpMult() { return this.coop ? 1.35 : 1; },

  recalcStats(pl) {
    if (!pl) { this.players.forEach(p => this.recalcStats(p)); return; }
    const ch = CHARS[pl.charId], m = ch.mods, pas = pl.passives;
    const lv = id => pas[id] || 0;
    const hg = (typeof App !== 'undefined' && App.save.hangar) ? App.save.hangar : {};
    const hgLv = id => hg[id] || 0;
    const oldMax = pl.maxHp;
    pl.maxHp = PLAYER_BASE.hp + (m.hp || 0) + lv('plating') * 25 + hgLv('hull') * 10 + (pl.bonusHp || 0);
    if (oldMax && pl.maxHp > oldMax) pl.hp += (pl.maxHp - oldMax);
    pl.speed = PLAYER_BASE.speed * (m.speed || 1) * (1 + lv('thrusters') * 0.08) * (1 + hgLv('speed') * 0.02) * (1 + (pl.bonusSpeed || 0));
    pl.armor = (m.armor || 0) + lv('shield') * 2 + hgLv('armor');
    pl.regen = lv('nanobots') * 0.6 + hgLv('regen') * 0.2;
    // inherent +6% damage per shared level keeps leveling meaningful all run
    pl.dmgMult = (1 + lv('amp') * 0.12 + hgLv('damage') * 0.04 + (pl.bonusDmg || 0) + (m.dmg || 0)) *
      (1 + (this.level - 1) * 0.06) * (1 + (pl.pactDmg || 0));
    pl.rateMult = (m.rate || 1) * (1 + lv('accel') * 0.10) * (1 + (pl.bonusRate || 0));
    pl.critChance = PLAYER_BASE.critChance + lv('targeting') * 0.06 + hgLv('luck') * 0.02 + (pl.bonusCrit || 0);
    pl.critMult = PLAYER_BASE.critMult + lv('wrath') * 0.25 + (pl.bonusCritMult || 0);
    pl.pickupR = PLAYER_BASE.pickupR * (1 + lv('attractor') * 0.30) * (1 + hgLv('magnet') * 0.10);
    pl.evasion = lv('evasion') * 0.04;
    pl.siphon = lv('siphon') * 0.002 + (m.siphon || 0);
  },

  // party-wide passive totals (curse and greed affect the shared world)
  curseTotal() { let n = 0; for (const pl of this.players) n += pl.passives.curse || 0; return n; },
  greedTotal() { let n = 0; for (const pl of this.players) n += pl.passives.greed || 0; return n; },

  addWeapon(pl, id) {
    const w = { id, lvl: 1, evolved: false, cd: U.rand(0.2, 0.6), s: null, ang: U.rand(0, TAU), burst: 0, burstCd: 0 };
    this.computeWStats(pl, w);
    pl.weapons.push(w);
  },

  computeWStats(pl, w) {
    if (w === undefined) { w = pl; pl = this.players[0]; }   // legacy solo callers
    const def = WEAPONS[w.id];
    const s = Object.assign({}, def.base);
    for (let i = 0; i < w.lvl - 1 && i < def.upgrades.length; i++)
      Object.assign(s, def.upgrades[i].stats);
    if (w.evolved) {
      // evolution multipliers per weapon
      switch (w.id) {
        case 'blaster': s.dmg *= 1.35; s.pierce += 1; break;
        case 'orbit': s.dmg *= 1.6; s.sizeMult = 2; s.knock = 300; break;
        case 'nova': s.dmg *= 1.4; s.double = true; s.knock = 340; break;
        case 'rail': s.dmg *= 1.4; s.twin = true; break;
        case 'missiles': s.count += 3; s.dmg *= 1.3; s.blast *= 1.3; break;
        case 'arc': s.dmg *= 1.35; s.fork = true; break;
        case 'scythe': s.dmg *= 1.5; s.size *= 1.8; s.slows = true; break;
        case 'aura': s.dps *= 1.6; s.radius *= 1.35; s.mark = true; break;
        case 'scatter': s.dmg *= 1.5; s.count += 4; s.spread += 0.15; break;
        case 'mines': s.dmg *= 1.4; s.blast *= 1.25; s.chain = true; break;
        case 'singularity': s.dps *= 1.3; s.collapse = true; break;
      }
    }

    // ---- passive modifiers (per owner) ----
    if (pl) {
      const dup = pl.passives.duplicator || 0;
      if (dup) {
        if (s.count !== undefined) s.count += dup * (w.id === 'scatter' ? 2 : 1);
        if (s.chains !== undefined) s.chains += dup;
      }
      const exp = 1 + (pl.passives.expanse || 0) * 0.08;
      if (exp > 1) {
        if (s.radius !== undefined) s.radius *= exp;
        if (s.blast !== undefined) s.blast *= exp;
        if (s.size !== undefined) s.size *= exp;
        if (s.width !== undefined) s.width *= exp;
      }
    }
    w.s = s;
  },

  // =========================================================================
  // UPGRADE OFFERS
  // =========================================================================
  getUpgradeChoices(pl) {
    pl = pl || this.players[0];
    const pool = [];
    const wCount = pl.weapons.length, pCount = Object.keys(pl.passives).length;
    for (const w of pl.weapons) {
      if (this.banned.has(w.id)) continue;
      if (w.lvl < MAX_WLVL) pool.push({ kind: 'weapon', id: w.id, w: 1.25 });
      else if (!w.evolved) pool.push({ kind: 'evolve', id: w.id, w: 1.6 });
    }
    if (wCount < WEAPON_SLOTS) for (const id in WEAPONS)
      if (!this.banned.has(id) && !pl.weapons.find(w => w.id === id)) pool.push({ kind: 'newWeapon', id, w: 1.0 });
    for (const id in PASSIVES) {
      if (this.banned.has(id)) continue;
      const lvl = pl.passives[id] || 0;
      if (lvl > 0 && lvl < PASSIVES[id].max) pool.push({ kind: 'passive', id, w: 1.0 });
      else if (lvl === 0 && pCount < PASSIVE_SLOTS) pool.push({ kind: 'newPassive', id, w: 0.9 });
    }
    // weighted pick of 3 distinct
    const picks = [];
    for (let n = 0; n < 3 && pool.length; n++) {
      let tot = 0; for (const c of pool) tot += c.w;
      let r = Math.random() * tot, idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break; } }
      picks.push(pool[idx]); pool.splice(idx, 1);
    }
    // pool running dry → Void Pacts (power for HEAT); keep a repair option if nothing else is left
    const pactIds = Object.keys(PACTS);
    const pactOk = this.level >= 12 || pool.length === 0;
    while (picks.length < 3) {
      const used = picks.filter(c => c.kind === 'pact').map(c => c.id);
      const free = pactIds.filter(id => !used.includes(id));
      if (pactOk && free.length && !(picks.length === 2 && picks.every(c => c.kind === 'pact'))) picks.push({ kind: 'pact', id: U.pick(free) });
      else picks.push({ kind: 'heal' });
    }
    // late game: one slot may be a pact even while normal upgrades remain
    if (this.level >= 25 && !picks.some(c => c.kind === 'pact') && U.chance(0.35))
      picks[picks.length - 1] = { kind: 'pact', id: U.pick(pactIds) };

    // rarity: upgrades can roll RARE (double level in one pick)
    for (const c of picks) {
      if (c.kind === 'weapon' || c.kind === 'passive' || c.kind === 'newWeapon' || c.kind === 'newPassive') {
        if (U.chance(0.10)) c.tier = 2;
      }
    }
    // and one slot can be swept by an EPIC boon (after the opening minutes)
    if (this.time > 120 && U.chance(0.08)) {
      const ids = Object.keys(BOONS);
      picks[picks.length - 1] = { kind: 'epic', id: U.pick(ids) };
    }
    return picks;
  },

  rerollChoices(pl) {
    if (this.rerolls <= 0) return null;
    this.rerolls--;
    AudioSys.play('ui');
    return this.getUpgradeChoices(pl);
  },

  banishChoice(pl, c) {
    if (this.banishes <= 0 || !c.id) return null;
    this.banishes--;
    this.banned.add(c.id);
    AudioSys.play('uiBack');
    return this.getUpgradeChoices(pl);
  },

  applyUpgrade(pl, c) {
    pl = pl || this.players[0];
    const times = c.tier === 2 ? 2 : 1;
    switch (c.kind) {
      case 'weapon': case 'evolve': {
        const w = pl.weapons.find(w => w.id === c.id);
        for (let n = 0; n < times; n++) {
          if (w.lvl < MAX_WLVL) w.lvl++;
          else if (!w.evolved) w.evolved = true;
        }
        this.computeWStats(pl, w);
        AudioSys.play(c.kind === 'evolve' || w.evolved ? 'evolve' : 'levelup');
        if (w.evolved && c.kind === 'evolve') {
          UI.announce(WEAPONS[c.id].evo.name, 'weapon evolved', WEAPONS[c.id].color, 2.2);
          this.shake(0.35);
          this.emitBurst(pl.x, pl.y, WEAPONS[c.id].color, 40, 320, 8, 0.8);
        }
        break;
      }
      case 'newWeapon': {
        this.addWeapon(pl, c.id);
        if (times === 2) {
          const w = pl.weapons[pl.weapons.length - 1];
          w.lvl = 2;
          this.computeWStats(pl, w);
        }
        AudioSys.play('levelup');
        break;
      }
      case 'passive': case 'newPassive': {
        const max = PASSIVES[c.id].max;
        pl.passives[c.id] = Math.min(max, (pl.passives[c.id] || 0) + times);
        this.recalcStats(pl);
        // duplicator / expanse change weapon stats too
        for (const w of pl.weapons) this.computeWStats(pl, w);
        AudioSys.play('levelup');
        break;
      }
      case 'heal':
        pl.hp = Math.min(pl.maxHp, pl.hp + 40);
        AudioSys.play('heart');
        break;
      case 'epic': this.applyBoon(pl, c.id); break;
      case 'pact': this.applyPact(pl, c.id); break;
    }
  },

  applyPact(pl, id) {
    switch (id) {
      case 'fury':   pl.pactDmg = (pl.pactDmg || 0) + 0.20; break;
      case 'frenzy': pl.bonusRate = (pl.bonusRate || 0) + 0.12; break;
      case 'ruin':   pl.bonusCrit = (pl.bonusCrit || 0) + 0.05; pl.bonusCritMult = (pl.bonusCritMult || 0) + 0.30; break;
      case 'titan':  pl.bonusHp = (pl.bonusHp || 0) + 50; break;
      case 'comet':  pl.bonusSpeed = (pl.bonusSpeed || 0) + 0.10; break;
    }
    this.recalcStats(pl);
    if (id === 'titan') pl.hp = pl.maxHp;
    for (const w of pl.weapons) this.computeWStats(pl, w);
    this.heat = (this.heat || 0) + 1;
    this.pacts++;
    AudioSys.play('evolve');
    this.shake(0.3);
    this.emitBurst(pl.x, pl.y, '#ff5252', 40, 320, 8, 0.8);
    UI.announce(PACTS[id].name.toUpperCase(), PACTS[id].gain + '  ·  HEAT ' + this.heat, '#ff5252', 2.2);
  },

  // VOID ROT: late-run healing weakens so sustain can't outscale the swarm
  healMult() {
    const t = this.mode === 'endless' ? 900 : this.clock();
    if (t <= SUSTAIN.rotStart) return 1;
    return 1 - SUSTAIN.rotMax * Math.min(1, (t - SUSTAIN.rotStart) / (SUSTAIN.rotFull - SUSTAIN.rotStart));
  },
  // lifesteal draws from a small per-second budget
  leech(p, amt) {
    if (amt <= 0 || p.down) return;
    const take = Math.min(amt * this.healMult() * this.mod.heal, p.leechPool || 0);
    if (take <= 0) return;
    p.leechPool -= take;
    p.hp = Math.min(p.maxHp, p.hp + take);
  },

  applyBoon(pl, id) {
    AudioSys.play('evolve');
    this.shake(0.3);
    this.emitBurst(pl.x, pl.y, '#b06bff', 36, 300, 8, 0.8);
    switch (id) {
      case 'overload':
        pl.bonusDmg = (pl.bonusDmg || 0) + 0.12;
        this.recalcStats(pl);
        UI.announce('OVERLOAD', '+12% damage, permanently', '#ff4ecd', 2.2);
        break;
      case 'bulwark':
        pl.bonusHp = (pl.bonusHp || 0) + 40;
        this.recalcStats(pl);
        pl.hp = pl.maxHp;
        UI.announce('BULWARK', '+40 hull, fully repaired', '#ffd34e', 2.2);
        break;
      case 'chrono':
        this.permSlow = Math.max(0.8, this.permSlow * 0.93);
        UI.announce('CHRONO FIELD', 'the swarm slows', '#4ef3ff', 2.2);
        break;
      case 'tithe':
        this.gainXp(60 * this.gemScale());
        UI.announce('VOID TITHE', 'the void pays out', '#6dff8a', 2.2);
        break;
      case 'armory': {
        for (let n = 0; n < 2; n++) {
          const ups = pl.weapons.filter(w => w.lvl < MAX_WLVL);
          if (!ups.length) break;
          const w = U.pick(ups);
          w.lvl++;
          this.computeWStats(pl, w);
        }
        UI.announce('ARMORY CACHE', 'two free weapon levels', '#ff9d4e', 2.2);
        break;
      }
    }
  },

  // =========================================================================
  // SPAWNING
  // =========================================================================
  spawnPos(minPad = 90, maxPad = 200) {
    const d = Math.max(this.view.w, this.view.h) * 0.55 + U.rand(minPad, maxPad);
    const a = U.rand(0, TAU);
    return { x: this.cam.x + Math.cos(a) * d, y: this.cam.y + Math.sin(a) * d };
  },

  nearestLivingPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const pl of this.players) {
      if (pl.down) continue;
      const d2 = U.dist2(x, y, pl.x, pl.y);
      if (d2 < bd) { bd = d2; best = pl; }
    }
    return best || this.players[0];
  },

  spawnEnemy(type, x, y, elite = false) {
    if (this.enemies.length >= DIFF.aliveCap && !elite) return null;
    // only so many thieves at once — extras arrive as motes
    if (type === 'leech') {
      let n = 0;
      for (const e of this.enemies) if (e.type === 'leech' && !e.dead) n++;
      if (n >= 6) type = 'mote';
    }
    const def = ENEMIES[type];
    const t = this.effTime();
    const nm = this.nightmare ? NIGHTMARE : null;
    const heat = this.heat || 0;
    const hpM = DIFF.hpMult(t) * (elite ? DIFF.eliteHp : 1) * this.coopHpMult() * (nm ? nm.hp : 1) * (1 + HEAT.hp * heat) * this.mod.hp;
    const e = {
      type, def, x, y, vx: 0, vy: 0,
      r: def.r * (elite ? DIFF.eliteSize : 1),
      hp: def.hp * hpM, maxHp: def.hp * hpM,
      dmg: def.dmg * DIFF.dmgMult(t) * (nm ? nm.dmg : 1) * (1 + HEAT.dmg * heat) * this.mod.dmg,
      spd: def.spd * DIFF.spdMult(t) * U.rand(0.92, 1.08) * (1 + 0.03 * this.curseTotal()) * (nm ? nm.spd : 1) * this.mod.spd,
      elite, flash: 0, atkCd: U.rand(0, 0.3), slow: 1, slowT: 0,
      kx: 0, ky: 0, orbCd: 0, auraCd: 0, scyCd: 0, marked: 0,
      mass: (def.mass || 1) * (elite ? 3 : 1),
      fuseT: -1, shootCd: def.ranged ? U.rand(1, def.ranged.rate) : 0,
      wob: U.rand(0, TAU), _lastB: 0, spawnT: 0.4,
      stolen: 0, warpT: def.warp ? U.rand(1.5, def.warp.every) : 0,
    };
    this.enemies.push(e);
    return e;
  },

  // the swarm's clock: real time, or faster in campaign sectors
  clock() { return this.sector ? this.time * this.sector.pace : this.time; },

  effTime() {
    // difficulty time: in endless keep climbing past 900
    return this.mode === 'endless' ? 900 + this.spawn.endlessT : Math.min(this.clock(), 900);
  },

  // campaign: sector survived (or its boss destroyed)
  sectorClear() {
    if (this.state !== 'run') return;
    this.state = 'winning'; this.seqT = 0; this.timeScale = 0.3;
    AudioSys.play('win');
    AudioSys.setBoss(false);
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e);
    this.clearEBullets();
    UI.announce('SECTOR CLEAR', this.sector.name, '#ffd34e', 2);
  },

  updateSpawning(dt) {
    const S = this.spawn;
    if (this.boss && this.boss.def.id === 'bloom') return;  // final arena: boss controls spawns

    if (this.mode === 'endless') S.endlessT += dt;

    // phase progression (per-arena tables)
    const PHASES = this.arena === 1 ? SPAWN_PHASES_REACTOR : this.arena === 2 ? SPAWN_PHASES_GARDEN : SPAWN_PHASES;
    let phase = PHASES[S.phase];
    while (S.phase < PHASES.length - 1 && this.clock() >= PHASES[S.phase + 1].t && this.mode !== 'endless')
      phase = PHASES[++S.phase];
    if (this.mode === 'endless') phase = PHASES[PHASES.length - 1];

    // continuous spawner (throttled while a boss holds the stage)
    S.timer -= dt;
    const speedup = this.mode === 'endless' ? Math.max(0.45, 1 - S.endlessT / 600 * 0.4) : 1;
    const bossFactor = this.boss && !this.boss.dead ? 1.5 : 1;
    if (S.timer <= 0) {
      const heat = this.heat || 0;
      S.timer = phase.interval * speedup * bossFactor / (1 + 0.1 * this.curseTotal()) / (1 + HEAT.spawnRate * heat) / this.mod.spawn;
      const batch = phase.batch + (this.coop ? 1 : 0) + Math.floor(heat / HEAT.batchEvery) + this.mod.batch +
        (this.mode === 'endless' ? Math.floor(S.endlessT / 120) : 0);
      const types = Object.keys(phase.types);
      const weights = types.map(k => phase.types[k]);
      let tot = 0; for (const w of weights) tot += w;
      for (let i = 0; i < batch; i++) {
        let r = Math.random() * tot, type = types[0];
        for (let j = 0; j < types.length; j++) { r -= weights[j]; if (r <= 0) { type = types[j]; break; } }
        const pos = this.spawnPos();
        this.spawnEnemy(type, pos.x + U.rand(-40, 40), pos.y + U.rand(-40, 40));
      }
    }

    // scripted events (per-arena)
    const EVENTS = this.arena === 1 ? SPAWN_EVENTS_REACTOR : this.arena === 2 ? SPAWN_EVENTS_GARDEN : SPAWN_EVENTS;
    if (this.mode !== 'endless' && S.eventIdx < EVENTS.length && this.clock() >= EVENTS[S.eventIdx].t) {
      const ev = EVENTS[S.eventIdx++];
      UI.announce(ev.msg, '', '#ff5252', 1.8);
      AudioSys.play('warn');
      const cx = this.cam.x, cy = this.cam.y;
      if (ev.kind === 'ring') {
        const d = Math.max(this.view.w, this.view.h) * 0.62;
        for (let i = 0; i < ev.n; i++) {
          const a = (i / ev.n) * TAU;
          this.spawnEnemy(ev.type, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        }
      } else {
        const a = U.rand(0, TAU);
        const d = Math.max(this.view.w, this.view.h) * 0.6;
        for (let i = 0; i < ev.n; i++) {
          const off = U.rand(-Math.PI / 5, Math.PI / 5);
          const dd = d + U.rand(0, 260);
          this.spawnEnemy(ev.type, cx + Math.cos(a + off) * dd, cy + Math.sin(a + off) * dd);
        }
      }
    }

    // elites
    if (this.clock() >= (this.mod.eliteStart != null ? this.mod.eliteStart : DIFF.eliteStart)) {
      S.eliteTimer -= dt;
      if (S.eliteTimer <= 0) {
        S.eliteTimer = (this.mod.eliteEvery || DIFF.eliteEvery) / (1 + HEAT.elite * (this.heat || 0));
        const phaseTypes = Object.keys(phase.types).filter(t => t !== 'mote' && t !== 'dart');
        const type = phaseTypes.length ? U.pick(phaseTypes) : 'mote';
        const pos = this.spawnPos();
        const e = this.spawnEnemy(type, pos.x, pos.y, true);
        if (e) { UI.announce('ELITE SIGNATURE', '', '#ffd34e', 1.6); AudioSys.play('warn'); }
      }
    }

    // bosses
    if (this.mode === 'sector') {
      // campaign bosses arrive when the sector timer runs out (Progress.tick)
    } else if (this.mode !== 'endless') {
      if (this.bossIdx < BOSS_TIMES.length && this.time >= BOSS_TIMES[this.bossIdx].t && !this.boss) {
        this.spawnBoss(BOSS_TIMES[this.bossIdx].id);
        this.bossIdx++;
      }
    } else {
      // endless: recurring boss every 180s, scaling
      S.nextBossT = S.nextBossT || 150;
      if (S.endlessT >= S.nextBossT && !this.boss) {
        S.nextBossT += 180;
        this.spawnBoss(U.pick(['warden', 'siren', 'bloom']), 1 + S.endlessT / 300);
      }
    }
  },

  // =========================================================================
  // DAMAGE
  // =========================================================================
  dealDamage(e, base, opts = {}) {
    const p = opts.pl || this.players[0];   // owner of the damage source
    let dmg = base * p.dmgMult * (1 + BeatSys.dmgBonus(p)) * this.mod.dealt * U.rand(0.88, 1.12);
    let crit = false;
    if (!opts.noCrit && Math.random() < p.critChance) { dmg *= p.critMult; crit = true; }
    if (e.marked > this.time - 0.4) dmg *= 1.25;   // Star Furnace mark
    dmg = Math.max(1, dmg);
    e.hp -= dmg;
    e.flash = 0.1;
    this.dmgDealt += dmg;
    if (opts.src) this.dmgBy[opts.src] = (this.dmgBy[opts.src] || 0) + dmg;
    if (p.siphon > 0) this.leech(p, dmg * p.siphon);
    if (opts.knock && e.mass < 4) {
      const kb = opts.knock / e.mass;
      e.kx += Math.cos(opts.kAng) * kb; e.ky += Math.sin(opts.kAng) * kb;
    }
    if (!opts.noNum) this.spawnDnum(e.x + U.rand(-8, 8), e.y - e.r, dmg, crit);
    AudioSys.play('hit');
    if (e.hp <= 0) this.killEnemy(e, opts);
    return dmg;
  },

  killEnemy(e, opts = {}) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.killsByType[e.type] = (this.killsByType[e.type] || 0) + 1;
    const col = e.def.color;
    this.emitBurst(e.x, e.y, col, e.elite ? 26 : 10, e.elite ? 260 : 170, e.elite ? 8 : 5, e.elite ? 0.7 : 0.45);
    AudioSys.play('edie');
    if (e.elite) { this.shake(0.3); AudioSys.play('boom'); this.spawnRing(e.x, e.y, e.r * 3, col); }

    // leech gives back what it took — with interest
    if (e.stolen > 0) {
      this.spawnGem(e.x, e.y, e.stolen * 1.5);
      this.spawnDnum(e.x, e.y - 20, '', false, '#c5ff4e', 'JACKPOT');
    }
    // bloomflower bursts into a crystal jackpot (skips the normal drop path)
    if (e.def.still) {
      for (let i = 0; i < 4; i++)
        this.spawnGem(e.x + U.rand(-20, 20), e.y + U.rand(-20, 20), e.def.xp / 4 * this.gemScale());
      this.emitBurst(e.x, e.y, e.def.color, 18, 220, 7, 0.6);
      return;
    }

    // splits
    if (e.def.splits && !e.elite) {
      for (let i = 0; i < e.def.splits; i++) {
        const a = U.rand(0, TAU);
        const m = this.spawnEnemy('mite', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
        if (m) { m.kx = Math.cos(a) * 180; m.ky = Math.sin(a) * 180; }
      }
    }
    // drops
    if (e.elite) {
      for (let i = 0; i < 5; i++) this.spawnGem(e.x + U.rand(-30, 30), e.y + U.rand(-30, 30), DIFF.eliteXp / 5 * this.gemScale());
      const r = Math.random();
      if (r < 0.55) this.spawnPickup('chest', e.x, e.y);
      else if (r < 0.75) this.spawnPickup('heart', e.x, e.y);
      else if (r < 0.9) this.spawnPickup('magnet', e.x, e.y);
      else this.spawnPickup('bomb', e.x, e.y);
    } else {
      this.spawnGem(e.x, e.y, e.def.xp * this.gemScale());
      const r = Math.random();
      if (r < 0.003) this.spawnPickup('heart', e.x, e.y);
      else if (r < 0.0045) this.spawnPickup('magnet', e.x, e.y);
      else if (r < 0.0051) this.spawnPickup('bomb', e.x, e.y);
    }
  },

  gemScale() {
    // late-game gems worth more so leveling doesn't stall
    const t = this.effTime();
    const hg = (typeof App !== 'undefined' && App.save.hangar) ? App.save.hangar : {};
    const bonus = 1 + this.greedTotal() * 0.08 + this.curseTotal() * 0.15 + (hg.xp || 0) * 0.05;
    return (1 + t / 900 * 1.4 + (this.mode === 'endless' ? this.spawn.endlessT / 600 : 0)) *
      ARENAS[this.arena].gemMult * bonus;
  },

  hurtPlayer(pl, rawDmg, srcX, srcY) {
    // back-compat: solo callers may pass (dmg, x, y)
    if (typeof pl === 'number') { srcY = srcX; srcX = rawDmg; rawDmg = pl; pl = this.players[0]; }
    if (!pl || pl.down || pl.iframes > 0 || this.state !== 'run') return;
    // Ghost Plating: chance to phase through the hit entirely
    if (pl.evasion > 0 && Math.random() < pl.evasion) {
      this.spawnDnum(pl.x, pl.y - 20, '', false, '#9feaff', 'DODGE');
      pl.iframes = 0.2;
      return;
    }
    const dmg = Math.max(1, rawDmg - pl.armor, rawDmg * (1 - SUSTAIN.armorMaxBlock));
    pl.hp -= dmg;
    if (this.firstHitAt === Infinity) this.firstHitAt = this.time;
    pl.iframes = 0.35; pl.hurtT = 0.3;
    this.shake(0.32);
    AudioSys.play('hurt');
    UI.redFlash();
    if (srcX !== undefined) {
      const a = U.angleTo(srcX, srcY, pl.x, pl.y);
      pl.vx += Math.cos(a) * 130; pl.vy += Math.sin(a) * 130;
    }
    if (pl.hp <= 0) {
      pl.hp = 0;
      // Second Wind / Phoenix Protocol: cheat death once per run
      const hg = (typeof App !== 'undefined' && App.save.hangar) ? App.save.hangar : {};
      if (!pl.usedWind && ((pl.passives.wind || 0) > 0 || (hg.wind || 0) > 0)) {
        pl.usedWind = true;
        this.downs++;
        pl.hp = Math.round(pl.maxHp * 0.5);
        pl.iframes = 3;
        this.spawnRing(pl.x, pl.y, 220, '#ffffff');
        this.emitBurst(pl.x, pl.y, '#ffffff', 40, 320, 9, 1);
        this.clearEBullets();
        this.shake(0.5);
        AudioSys.play('evolve');
        UI.announce('SECOND WIND', 'death declined', '#ffffff', 2.2);
        return;
      }
      const othersAlive = this.players.some(o => o !== pl && !o.down);
      this.emitBurst(pl.x, pl.y, CHARS[pl.charId].color, 60, 380, 10, 1.2);
      this.emitBurst(pl.x, pl.y, '#ffffff', 30, 260, 6, 0.9);
      this.spawnRing(pl.x, pl.y, 160, CHARS[pl.charId].color);
      this.shake(0.9);
      if (this.coop && othersAlive) {
        // downed, not dead — partner can carry until the revive timer
        pl.down = true; pl.downT = 15;
        this.downs++;
        AudioSys.play('bossroar');
        UI.announce('P' + (pl.idx + 1) + ' IS DOWN', 'revives in 15s — or on level up', '#ff5252', 2.5);
        return;
      }
      this.state = 'dying'; this.seqT = 0; this.timeScale = 0.25;
      AudioSys.play('death');
      AudioSys.setIntensity(0);
    }
  },

  revive(pl, frac) {
    if (!pl.down) return;
    pl.down = false; pl.downT = 0;
    pl.hp = Math.max(1, Math.round(pl.maxHp * frac));
    pl.iframes = 2;
    // come back beside a living partner
    const anchor = this.players.find(o => o !== pl && !o.down) || pl;
    pl.x = anchor.x + U.rand(-40, 40); pl.y = anchor.y + U.rand(-40, 40);
    this.emitBurst(pl.x, pl.y, CHARS[pl.charId].color, 30, 280, 8, 0.8);
    this.spawnRing(pl.x, pl.y, 140, CHARS[pl.charId].color);
    AudioSys.play('heart');
    UI.announce('P' + (pl.idx + 1) + ' BACK ONLINE', '', CHARS[pl.charId].color, 1.6);
  },

  // =========================================================================
  // ENEMY UPDATE
  // =========================================================================
  updateEnemies(dt) {
    const arr = this.enemies;
    for (let i = arr.length - 1; i >= 0; i--) {
      const e = arr[i];
      if (e.dead) { swapRemove(arr, i); continue; }
      if (e.spawnT > 0) e.spawnT -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.atkCd > 0) e.atkCd -= dt;
      if (e.orbCd > 0) e.orbCd -= dt;
      if (e.auraCd > 0) e.auraCd -= dt;
      if (e.scyCd > 0) e.scyCd -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 1; }

      const p = this.nearestLivingPlayer(e.x, e.y);
      const distP = U.dist(e.x, e.y, p.x, p.y);

      // despawn if absurdly far (players outran it) — teleport ahead instead
      if (U.dist(e.x, e.y, this.cam.x, this.cam.y) > Math.max(this.view.w, this.view.h) * 1.6) {
        const pos = this.spawnPos(60, 120);
        e.x = pos.x; e.y = pos.y;
        continue;
      }

      let mvx = 0, mvy = 0;
      const aim = U.angleTo(e.x, e.y, p.x, p.y);

      // --- behaviors ---
      if (e.def.still) {
        // bloomflower: rooted, harmless, full of crystals
        continue;
      }
      if (e.def.warp) {
        e.warpT -= dt;
        if (e.warpT <= 0) {
          e.warpT = e.def.warp.every * U.rand(0.85, 1.15);
          this.emitBurst(e.x, e.y, e.def.color, 10, 160, 5, 0.4);
          const a2 = U.rand(0, TAU);
          const d2 = U.rand(e.def.warp.min, e.def.warp.max);
          e.x = p.x + Math.cos(a2) * d2;
          e.y = p.y + Math.sin(a2) * d2;
          e.spawnT = 0.35;
          this.emitBurst(e.x, e.y, e.def.color, 12, 180, 5, 0.4);
          AudioSys.play('zap');
        }
      }
      if (e.def.steals) {
        // leech: raid the crystal field, then run for it
        if (e.stolen > 0) {
          mvx = -Math.cos(aim) * e.spd; mvy = -Math.sin(aim) * e.spd;
        } else {
          let bg = null, bd = 700 * 700;
          for (const g of this.gems) {
            const d2 = U.dist2(e.x, e.y, g.x, g.y);
            if (d2 < bd) { bd = d2; bg = g; }
          }
          if (bg) {
            const ga = U.angleTo(e.x, e.y, bg.x, bg.y);
            mvx = Math.cos(ga) * e.spd; mvy = Math.sin(ga) * e.spd;
            if (bd < (e.r + 10) * (e.r + 10)) {
              e.stolen += bg.val;
              this.emitPart(bg.x, bg.y, 0, -40, '#c5ff4e', 5, 0.4);
              const gi = this.gems.indexOf(bg);
              if (gi >= 0) { this.pools.gem.free(bg); swapRemove(this.gems, gi); }
            }
          } else {
            // nothing to steal: harass from a distance
            mvx = Math.cos(aim + Math.PI / 2) * e.spd * 0.5 + Math.cos(aim) * e.spd * 0.3;
            mvy = Math.sin(aim + Math.PI / 2) * e.spd * 0.5 + Math.sin(aim) * e.spd * 0.3;
          }
        }
        e.x += (mvx * e.slow * this.permSlow + e.kx) * dt;
        e.y += (mvy * e.slow * this.permSlow + e.ky) * dt;
        e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
        continue;
      }
      if (e.fuseT >= 0) {
        // volatile counting down
        e.fuseT -= dt;
        mvx = Math.cos(aim) * e.spd * 0.25; mvy = Math.sin(aim) * e.spd * 0.25;
        if (e.fuseT <= 0) {
          // detonate
          const f = e.def.fuse;
          this.emitBurst(e.x, e.y, '#ff5252', 24, 300, 9, 0.6);
          this.spawnRing(e.x, e.y, f.radius, '#ff5252');
          AudioSys.play('boom');
          this.shake(0.22);
          for (const pl of this.players)
            if (!pl.down && U.dist2(e.x, e.y, pl.x, pl.y) < (f.radius + pl.r) * (f.radius + pl.r))
              this.hurtPlayer(pl, f.dmg * DIFF.dmgMult(this.effTime()), e.x, e.y);
          e.dead = true; this.kills++;
          this.spawnGem(e.x, e.y, e.def.xp * this.gemScale());
          swapRemove(arr, i);
          continue;
        }
      } else if (e.def.fuse && distP < e.def.fuse.trigger) {
        e.fuseT = e.def.fuse.time;
        AudioSys.play('warn');
      } else if (e.def.ranged) {
        const rg = e.def.ranged;
        if (distP > rg.keep + 30) { mvx = Math.cos(aim) * e.spd; mvy = Math.sin(aim) * e.spd; }
        else if (distP < rg.keep - 40) { mvx = -Math.cos(aim) * e.spd * 0.7; mvy = -Math.sin(aim) * e.spd * 0.7; }
        else { // strafe
          const perp = aim + Math.PI / 2 * (e.wob > Math.PI ? 1 : -1);
          mvx = Math.cos(perp) * e.spd * 0.5; mvy = Math.sin(perp) * e.spd * 0.5;
        }
        e.shootCd -= dt;
        if (e.shootCd <= 0 && distP < rg.keep + 200 && e.spawnT <= 0) {
          e.shootCd = rg.rate * U.rand(0.9, 1.1);
          const n = rg.n, spread = rg.spread || 0;
          for (let b = 0; b < n; b++) {
            const a2 = aim + (n > 1 ? (b - (n - 1) / 2) * spread : 0);
            this.spawnEBullet(e.x, e.y, Math.cos(a2) * rg.bspd, Math.sin(a2) * rg.bspd,
              rg.bdmg * DIFF.dmgMult(this.effTime()));
          }
        }
      } else {
        mvx = Math.cos(aim) * e.spd; mvy = Math.sin(aim) * e.spd;
        if (e.def.weave) {
          e.wob += dt * 5;
          const perp = aim + Math.PI / 2;
          const s = Math.sin(e.wob) * e.spd * 0.6;
          mvx += Math.cos(perp) * s; mvy += Math.sin(perp) * s;
        }
      }

      // separation from neighbors
      this.grid.query(e.x, e.y, e.r + 18, this.qbuf);
      let sx = 0, sy = 0;
      for (const o of this.qbuf) {
        if (o === e || o.dead) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const min = (e.r + o.r) * 0.9;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / min * (o.mass / (e.mass + o.mass));
          sx += dx / d * push; sy += dy / d * push;
        }
      }

      e.x += (mvx * e.slow * this.permSlow + e.kx) * dt + sx * 120 * dt;
      e.y += (mvy * e.slow * this.permSlow + e.ky) * dt + sy * 120 * dt;
      e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);

      // contact damage — any living player it touches (harmless enemies skip)
      if (e.atkCd <= 0 && e.dmg > 0) {
        for (const pl of this.players) {
          if (pl.down) continue;
          if (U.dist2(e.x, e.y, pl.x, pl.y) < (e.r + pl.r) * (e.r + pl.r)) {
            e.atkCd = 0.85;
            this.hurtPlayer(pl, e.dmg, e.x, e.y);
            break;
          }
        }
      }
    }
  },

  // =========================================================================
  // WEAPONS
  // =========================================================================
  nearestEnemy(x, y, maxD, exclude) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || (exclude && exclude.has(e))) continue;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (this.boss && !this.boss.dead && (!exclude || !exclude.has(this.boss))) {
      const d2 = U.dist2(x, y, this.boss.x, this.boss.y);
      if (d2 < bd) { best = this.boss; }
    }
    return best;
  },

  updateWeapons(dt) {
    for (const pl of this.players) {
      if (pl.down) continue;
      this.updatePlayerWeapons(pl, dt);
    }
  },

  updatePlayerWeapons(p, dt) {
    for (const w of p.weapons) {
      const s = w.s;
      switch (w.id) {
        // ------------------------------------------------ blaster
        case 'blaster': {
          w.cd -= dt;
          if (w.burst > 0) {
            w.burstCd -= dt;
            if (w.burstCd <= 0) { w.burst--; w.burstCd = 0.07; this.fireBlaster(p, w); }
          }
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            this.fireBlaster(p, w);
            if (w.evolved) { w.burst = 2; w.burstCd = 0.07; }
          }
          break;
        }
        // ------------------------------------------------ orbit
        case 'orbit': {
          w.ang += s.rotSpd * dt;
          const sz = (s.sizeMult || 1);
          const orbR = 9 * sz;
          for (let k = 0; k < s.count; k++) {
            const a = w.ang + (k / s.count) * TAU;
            const ox = p.x + Math.cos(a) * s.radius, oy = p.y + Math.sin(a) * s.radius;
            this.grid.query(ox, oy, orbR + 22, this.qbuf);
            for (const e of this.qbuf) {
              if (e.dead || e.orbCd > 0) continue;
              if (U.dist2(ox, oy, e.x, e.y) < (orbR + e.r) * (orbR + e.r)) {
                e.orbCd = s.tick;
                this.dealDamage(e, s.dmg, { pl: p, src: 'orbit', knock: s.knock || 60, kAng: U.angleTo(p.x, p.y, e.x, e.y) });
              }
            }
            if (this.boss && !this.boss.dead && this.boss.orbCd <= 0 &&
                U.dist2(ox, oy, this.boss.x, this.boss.y) < (orbR + this.boss.r) ** 2) {
              this.boss.orbCd = s.tick;
              this.hitBoss(s.dmg, false, p, 'orbit');
            }
          }
          break;
        }
        // ------------------------------------------------ nova
        case 'nova': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            this.fireNova(p, s, 1);
            if (s.double) this.defer(0.22, () => this.fireNova(p, s, 0.7));
          }
          break;
        }
        // ------------------------------------------------ rail
        case 'rail': {
          w.cd -= dt;
          if (w.cd <= 0) {
            // target toughest thing in sight
            let best = null, bhp = -1;
            for (const e of this.enemies) {
              if (e.dead || e.spawnT > 0) continue;
              if (U.dist2(p.x, p.y, e.x, e.y) > 760 * 760) continue;
              if (e.hp > bhp) { bhp = e.hp; best = e; }
            }
            if (this.boss && !this.boss.dead && U.dist2(p.x, p.y, this.boss.x, this.boss.y) < 760 * 760) best = this.boss;
            if (best) {
              w.cd = 1 / (s.rate * p.rateMult);
              const ang = U.angleTo(p.x, p.y, best.x, best.y);
              this.fireRail(p, ang, s);
              if (s.twin) this.fireRail(p, ang + Math.PI, s);
            } else w.cd = 0.3;
          }
          break;
        }
        // ------------------------------------------------ missiles
        case 'missiles': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            for (let k = 0; k < s.count; k++) {
              this.defer(k * 0.09, () => {
                const a = U.rand(0, TAU);
                const b = this.spawnBullet(p.x, p.y, Math.cos(a) * 140, Math.sin(a) * 140, s.dmg, 1, 'missile');
                b.pl = p; b.blast = s.blast; b.turn = 5.5; b.accel = s.spd;
                AudioSys.play('missile');
              });
            }
          }
          break;
        }
        // ------------------------------------------------ arc
        case 'arc': {
          w.cd -= dt;
          if (w.cd <= 0) {
            const first = this.nearestEnemy(p.x, p.y, s.range);
            if (first) {
              w.cd = 1 / (s.rate * p.rateMult);
              this.fireArc(p, first, s);
            } else w.cd = 0.25;
          }
          break;
        }
        // ------------------------------------------------ scythe
        case 'scythe': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            for (let k = 0; k < s.count; k++) {
              const a = U.rand(0, TAU);
              this.scythes.push({
                x: p.x, y: p.y, ang: a, t: 0, dur: 1.5, pl: p,
                dmg: s.dmg, size: s.size, slows: s.slows, spin: U.rand(6, 9),
                range: s.range, rot: 0,
              });
            }
            AudioSys.play('scythe');
          }
          break;
        }
        // ------------------------------------------------ scatter
        case 'scatter': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            const tgt = this.nearestEnemy(p.x, p.y, 420);
            const baseAng = tgt ? U.angleTo(p.x, p.y, tgt.x, tgt.y) : p.faceAng;
            for (let k = 0; k < s.count; k++) {
              const a = baseAng + U.rand(-s.spread / 2, s.spread / 2);
              const sp = s.spd * U.rand(0.85, 1.15);
              const b = this.spawnBullet(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, s.dmg, 1, 'pellet');
              b.pl = p; b.life = s.life * U.rand(0.85, 1.15);
            }
            AudioSys.play('shoot');
            this.shake(0.05);
          }
          break;
        }
        // ------------------------------------------------ mines
        case 'mines': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 1 / (s.rate * p.rateMult);
            for (let k = 0; k < s.count; k++) {
              if (this.mines.length >= s.maxLive) break;
              this.mines.push({
                x: p.x + U.rand(-34, 34), y: p.y + U.rand(-34, 34),
                t: 0, arm: 0.5, trig: 70, dmg: s.dmg, blast: s.blast,
                chain: s.chain, dead: false, pl: p,
              });
            }
          }
          break;
        }
        // ------------------------------------------------ singularity
        case 'singularity': {
          w.cd -= dt;
          if (w.cd <= 0) {
            const cands = [];
            for (const e of this.enemies)
              if (!e.dead && e.spawnT <= 0 && U.dist2(p.x, p.y, e.x, e.y) < 480 * 480) cands.push(e);
            if (cands.length) {
              w.cd = 1 / (s.rate * p.rateMult);
              const tgt = U.pick(cands);
              this.singus.push({
                x: tgt.x, y: tgt.y, t: 0, dur: s.dur, radius: s.radius,
                dps: s.dps, pull: s.pull, collapse: s.collapse, tick: 0, rot: U.rand(0, TAU), pl: p,
              });
              AudioSys.play('magnet');
            } else w.cd = 0.3;
          }
          break;
        }
        // ------------------------------------------------ aura
        case 'aura': {
          w.cd -= dt;
          if (w.cd <= 0) {
            w.cd = 0.25; // 4 ticks/sec
            const rr = s.radius;
            this.grid.query(p.x, p.y, rr + 30, this.qbuf);
            for (const e of this.qbuf) {
              if (e.dead) continue;
              if (U.dist2(p.x, p.y, e.x, e.y) < (rr + e.r) * (rr + e.r)) {
                if (s.slow < 1) { e.slow = Math.min(e.slow, s.slow); e.slowT = 0.4; }
                if (s.mark) e.marked = this.time;
                this.dealDamage(e, s.dps * 0.25 * (1 / p.rateMult), { pl: p, src: 'aura', noNum: Math.random() > 0.2, noCrit: true });
              }
            }
            if (this.boss && !this.boss.dead &&
                U.dist2(p.x, p.y, this.boss.x, this.boss.y) < (rr + this.boss.r) ** 2) {
              if (s.mark) this.boss.marked = this.time;
              this.hitBoss(s.dps * 0.25, true, p, 'aura');
            }
          }
          break;
        }
      }
    }
  },

  fireBlaster(p, w) {
    const s = w.s;
    const tgt = this.nearestEnemy(p.x, p.y, 700);
    const baseAng = tgt ? U.angleTo(p.x, p.y, tgt.x, tgt.y) : p.faceAng;
    for (let k = 0; k < s.count; k++) {
      const a = baseAng + (k - (s.count - 1) / 2) * 0.09;
      const b = this.spawnBullet(p.x, p.y, Math.cos(a) * s.spd, Math.sin(a) * s.spd, s.dmg, s.pierce, 'bolt');
      b.pl = p;
    }
    AudioSys.play('shoot');
  },

  fireNova(p, s, mult) {
    this.spawnRing(p.x, p.y, s.radius, '#ffd34e');
    AudioSys.play('nova');
    this.shake(0.12);
    this.grid.query(p.x, p.y, s.radius + 40, this.qbuf);
    for (const e of this.qbuf) {
      if (e.dead) continue;
      if (U.dist2(p.x, p.y, e.x, e.y) < (s.radius + e.r) * (s.radius + e.r))
        this.dealDamage(e, s.dmg * mult, { pl: p, src: 'nova', knock: s.knock || 140, kAng: U.angleTo(p.x, p.y, e.x, e.y) });
    }
    if (this.boss && !this.boss.dead && U.dist2(p.x, p.y, this.boss.x, this.boss.y) < (s.radius + this.boss.r) ** 2)
      this.hitBoss(s.dmg * mult, false, p, 'nova');
  },

  fireRail(p, ang, s) {
    const len = 950;
    this.beams.push({ x: p.x, y: p.y, ang, len, width: s.width, life: 0.28, maxLife: 0.28, color: '#ff4ecd' });
    AudioSys.play('rail');
    this.shake(0.15);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const hitList = this.enemies.slice();
    if (this.boss && !this.boss.dead) hitList.push(this.boss);
    for (const e of hitList) {
      if (e.dead) continue;
      const relX = e.x - p.x, relY = e.y - p.y;
      const along = relX * cos + relY * sin;
      if (along < -e.r || along > len) continue;
      const perp = Math.abs(-relX * sin + relY * cos);
      if (perp < s.width / 2 + e.r) {
        if (e.isBoss) this.hitBoss(s.dmg, false, p, 'rail');
        else this.dealDamage(e, s.dmg, { pl: p, src: 'rail', knock: 40, kAng: ang });
      }
    }
  },

  fireArc(p, first, s) {
    AudioSys.play('zap');
    const visited = new Set();
    let cur = first, px = p.x, py = p.y;
    for (let j = 0; j <= s.chains && cur; j++) {
      this.zaps.push({ x1: px, y1: py, x2: cur.x, y2: cur.y, life: 0.18, maxLife: 0.18 });
      visited.add(cur);
      if (cur.isBoss) this.hitBoss(s.dmg, false, p, 'arc');
      else this.dealDamage(cur, s.dmg, { pl: p, src: 'arc' });
      // fork (evolution)
      if (s.fork) {
        const f = this.nearestEnemy(cur.x, cur.y, s.jump * 0.8, visited);
        if (f) {
          visited.add(f);
          this.zaps.push({ x1: cur.x, y1: cur.y, x2: f.x, y2: f.y, life: 0.15, maxLife: 0.15 });
          if (f.isBoss) this.hitBoss(s.dmg * 0.6, false, p, 'arc');
          else this.dealDamage(f, s.dmg * 0.6, { pl: p, src: 'arc' });
        }
      }
      px = cur.x; py = cur.y;
      cur = this.nearestEnemy(px, py, s.jump, visited);
    }
  },

  updateScythes(dt) {
    for (let i = this.scythes.length - 1; i >= 0; i--) {
      const sc = this.scythes[i];
      const p = sc.pl || this.players[0];
      sc.t += dt; sc.rot += sc.spin * dt;
      const half = sc.dur / 2;
      if (sc.t < half) {
        const spd = sc.range / half;
        sc.x += Math.cos(sc.ang) * spd * dt;
        sc.y += Math.sin(sc.ang) * spd * dt;
      } else {
        // return to its owner
        const a = U.angleTo(sc.x, sc.y, p.x, p.y);
        const spd = sc.range / half * 1.35;
        sc.x += Math.cos(a) * spd * dt;
        sc.y += Math.sin(a) * spd * dt;
        if (sc.t > sc.dur * 1.4 || U.dist2(sc.x, sc.y, p.x, p.y) < 500) { swapRemove(this.scythes, i); continue; }
      }
      const rr = 18 * sc.size;
      this.grid.query(sc.x, sc.y, rr + 24, this.qbuf);
      for (const e of this.qbuf) {
        if (e.dead || e.scyCd > 0) continue;
        if (U.dist2(sc.x, sc.y, e.x, e.y) < (rr + e.r) * (rr + e.r)) {
          e.scyCd = 0.3;
          if (sc.slows) { e.slow = Math.min(e.slow, 0.5); e.slowT = 1.4; }
          this.dealDamage(e, sc.dmg, { pl: p, src: 'scythe' });
        }
      }
      if (this.boss && !this.boss.dead && this.boss.scyCd <= 0 &&
          U.dist2(sc.x, sc.y, this.boss.x, this.boss.y) < (rr + this.boss.r) ** 2) {
        this.boss.scyCd = 0.3;
        this.hitBoss(sc.dmg, false, p, 'scythe');
      }
    }
  },

  updateMines(dt) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.t += dt;
      if (m.dead || m.t > 25 || U.dist2(m.x, m.y, this.cam.x, this.cam.y) > 1500 * 1500) {
        if (m.t > 25 && !m.dead) this.explodeMine(m);
        swapRemove(this.mines, i);
        continue;
      }
      if (m.t < m.arm) continue;
      this.grid.query(m.x, m.y, m.trig + 24, this.qbuf);
      for (const e of this.qbuf) {
        if (e.dead || e.spawnT > 0) continue;
        if (U.dist2(m.x, m.y, e.x, e.y) < (m.trig + e.r) * (m.trig + e.r)) {
          this.explodeMine(m);
          swapRemove(this.mines, i);
          break;
        }
      }
    }
  },

  explodeMine(m) {
    if (m.dead) return;
    m.dead = true;
    this.emitBurst(m.x, m.y, '#ff5e9e', 16, 240, 7, 0.55);
    this.spawnRing(m.x, m.y, m.blast, '#ff5e9e');
    AudioSys.play('boom');
    this.shake(0.1);
    this.grid.query(m.x, m.y, m.blast + 30, this.qbuf);
    for (const e of this.qbuf) {
      if (e.dead) continue;
      if (U.dist2(m.x, m.y, e.x, e.y) < (m.blast + e.r) * (m.blast + e.r))
        this.dealDamage(e, m.dmg, { pl: m.pl, src: 'mines', knock: 130, kAng: U.angleTo(m.x, m.y, e.x, e.y) });
    }
    if (this.boss && !this.boss.dead && U.dist2(m.x, m.y, this.boss.x, this.boss.y) < (m.blast + this.boss.r) ** 2)
      this.hitBoss(m.dmg, false, m.pl, 'mines');
    // CHAIN REACTION evolution: sympathetic detonation
    if (m.chain) {
      for (const o of this.mines) {
        if (o === m || o.dead || o.t < o.arm) continue;
        if (U.dist2(m.x, m.y, o.x, o.y) < (m.blast * 0.95) ** 2)
          this.defer(0.09, () => this.explodeMine(o));
      }
    }
  },

  updateSingus(dt) {
    for (let i = this.singus.length - 1; i >= 0; i--) {
      const sg = this.singus[i];
      sg.t += dt; sg.tick -= dt; sg.rot += dt * 3.2;
      if (sg.t >= sg.dur) {
        if (sg.collapse) {
          // EVENT COLLAPSE evolution
          const br = sg.radius * 1.35;
          this.emitBurst(sg.x, sg.y, '#9d7bff', 30, 320, 9, 0.8);
          this.spawnRing(sg.x, sg.y, br, '#9d7bff');
          AudioSys.play('boom', true);
          this.shake(0.25);
          this.grid.query(sg.x, sg.y, br + 30, this.qbuf);
          for (const e of this.qbuf) {
            if (e.dead) continue;
            if (U.dist2(sg.x, sg.y, e.x, e.y) < (br + e.r) * (br + e.r))
              this.dealDamage(e, 160, { pl: sg.pl, src: 'singularity', knock: 200, kAng: U.angleTo(sg.x, sg.y, e.x, e.y) });
          }
          if (this.boss && !this.boss.dead && U.dist2(sg.x, sg.y, this.boss.x, this.boss.y) < (br + this.boss.r) ** 2)
            this.hitBoss(160, false, sg.pl, 'singularity');
        }
        swapRemove(this.singus, i);
        continue;
      }
      // drag enemies inward + crush them
      const doTick = sg.tick <= 0;
      if (doTick) sg.tick = 0.25;
      this.grid.query(sg.x, sg.y, sg.radius + 30, this.qbuf);
      for (const e of this.qbuf) {
        if (e.dead) continue;
        const d2 = U.dist2(sg.x, sg.y, e.x, e.y);
        if (d2 > sg.radius * sg.radius) continue;
        const d = Math.sqrt(d2) || 1;
        const pull = sg.pull * (1 - d / sg.radius * 0.6) / (e.mass || 1);
        e.x += (sg.x - e.x) / d * pull * dt;
        e.y += (sg.y - e.y) / d * pull * dt;
        if (doTick) this.dealDamage(e, sg.dps * 0.25, { pl: sg.pl, src: 'singularity', noCrit: true, noNum: Math.random() > 0.25 });
      }
      if (doTick && this.boss && !this.boss.dead &&
          U.dist2(sg.x, sg.y, this.boss.x, this.boss.y) < (sg.radius + this.boss.r) ** 2)
        this.hitBoss(sg.dps * 0.25, true, sg.pl, 'singularity');
      // infalling sparkle
      if (Math.random() < dt * 9) {
        const a = U.rand(0, TAU);
        this.emitPart(sg.x + Math.cos(a) * sg.radius, sg.y + Math.sin(a) * sg.radius,
          -Math.cos(a) * 200, -Math.sin(a) * 200, '#9d7bff', 4, 0.4);
      }
    }
  },

  updateHazards(dt) {
    const az = ARENAS[this.arena];
    if (!az.hazard || !this.hazards.length) return;
    if (this.hazardT > 0) this.hazardT -= dt;
    let burned = null;
    for (const hz of this.hazards) {
      hz.wob += dt;
      hz.x += hz.vx * dt; hz.y += hz.vy * dt;
      if (Math.random() < dt * 0.2) {
        hz.vx = U.rand(-az.hazard.drift, az.hazard.drift);
        hz.vy = U.rand(-az.hazard.drift, az.hazard.drift);
      }
      // keep clouds roaming near the action
      if (U.dist2(hz.x, hz.y, this.cam.x, this.cam.y) > 1500 * 1500) {
        const a = U.rand(0, TAU), d = U.rand(600, 1000);
        hz.x = this.cam.x + Math.cos(a) * d; hz.y = this.cam.y + Math.sin(a) * d;
      }
      for (const pl of this.players) {
        if (pl.down || U.dist2(hz.x, hz.y, pl.x, pl.y) >= hz.r * hz.r) continue;
        if (az.hazard.kind === 'spore') pl.sporeT = 0.25;   // slows instead of burns
        else burned = pl;
      }
    }
    if (burned && this.hazardT <= 0 && this.state === 'run') {
      this.hazardT = 0.9;
      // environmental burn ignores armor (add it back so the subtraction cancels)
      this.hurtPlayer(burned, az.hazard.dps * 0.9 + burned.armor);
    }
  },

  // =========================================================================
  // PROJECTILES
  // =========================================================================
  spawnBullet(x, y, vx, vy, dmg, pierce, kind) {
    const b = this.pools.bullet.alloc();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.dmg = dmg; b.pierce = pierce; b.kind = kind;
    b.life = 1.6; b.dead = false; b.hit = b.hit || []; b.hit.length = 0;
    b.target = null; b.blast = 0; b.turn = 0; b.accel = 0; b.pl = null;
    this.bullets.push(b);
    return b;
  },

  updateBullets(dt) {
    const arr = this.bullets;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.life -= dt;
      if (b.kind === 'missile') {
        if (!b.target || b.target.dead) b.target = this.nearestEnemy(b.x, b.y, 900);
        if (b.target) {
          const want = U.angleTo(b.x, b.y, b.target.x, b.target.y);
          const cur = Math.atan2(b.vy, b.vx);
          const d = U.angDiff(cur, want);
          const na = cur + U.clamp(d, -b.turn * dt, b.turn * dt);
          const sp = Math.min(Math.hypot(b.vx, b.vy) + b.accel * dt, 460);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
        if (Math.random() < 0.5) this.emitPart(b.x, b.y, U.rand(-20, 20), U.rand(-20, 20), '#ff9d4e', 3, 0.25);
        b.life -= dt * 0.2;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.dead) { this.pools.bullet.free(b); swapRemove(arr, i); continue; }

      // collide
      const rr = b.kind === 'missile' ? 8 : 6;
      this.grid.query(b.x, b.y, rr + 26, this.qbuf);
      let exploded = false;
      for (const e of this.qbuf) {
        if (e.dead || e.spawnT > 0.25 || b.hit.includes(e)) continue;
        if (U.dist2(b.x, b.y, e.x, e.y) < (rr + e.r) * (rr + e.r)) {
          if (b.kind === 'missile') { this.explodeMissile(b); exploded = true; break; }
          b.hit.push(e);
          const bsrc = b.kind === 'pellet' ? 'scatter' : 'blaster';
          this.dealDamage(e, b.dmg, { pl: b.pl, src: bsrc, knock: 60, kAng: Math.atan2(b.vy, b.vx) });
          if (b.hit.length >= b.pierce) { b.dead = true; break; }
        }
      }
      if (!exploded && this.boss && !this.boss.dead && !b.hit.includes(this.boss) &&
          U.dist2(b.x, b.y, this.boss.x, this.boss.y) < (rr + this.boss.r) ** 2) {
        if (b.kind === 'missile') { this.explodeMissile(b); exploded = true; }
        else {
          b.hit.push(this.boss);
          this.hitBoss(b.dmg, false, b.pl, b.kind === 'pellet' ? 'scatter' : 'blaster');
          if (b.hit.length >= b.pierce) b.dead = true;
        }
      }
      if (exploded || b.dead) {
        if (b.dead && !exploded) this.emitBurst(b.x, b.y, '#4ef3ff', 3, 120, 3, 0.25);
        this.pools.bullet.free(b); swapRemove(arr, i);
      }
    }
  },

  explodeMissile(b) {
    b.dead = true;
    this.emitBurst(b.x, b.y, '#ff9d4e', 14, 220, 6, 0.5);
    this.spawnRing(b.x, b.y, b.blast, '#ff9d4e');
    AudioSys.play('boom');
    this.shake(0.08);
    this.grid.query(b.x, b.y, b.blast + 30, this.qbuf);
    for (const e of this.qbuf) {
      if (e.dead) continue;
      if (U.dist2(b.x, b.y, e.x, e.y) < (b.blast + e.r) * (b.blast + e.r))
        this.dealDamage(e, b.dmg, { pl: b.pl, src: 'missiles', knock: 100, kAng: U.angleTo(b.x, b.y, e.x, e.y) });
    }
    if (this.boss && !this.boss.dead && U.dist2(b.x, b.y, this.boss.x, this.boss.y) < (b.blast + this.boss.r) ** 2)
      this.hitBoss(b.dmg, false, b.pl, 'missiles');
  },

  spawnEBullet(x, y, vx, vy, dmg) {
    if (this.ebullets.length > 500) return;
    const b = this.pools.ebullet.alloc();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.life = 7;
    this.ebullets.push(b);
  },

  updateEBullets(dt) {
    const arr = this.ebullets;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || U.dist2(b.x, b.y, this.cam.x, this.cam.y) > 1500 * 1500) {
        this.pools.ebullet.free(b); swapRemove(arr, i); continue;
      }
      for (const pl of this.players) {
        if (pl.down) continue;
        if (U.dist2(b.x, b.y, pl.x, pl.y) < (6 + pl.r) * (6 + pl.r)) {
          this.hurtPlayer(pl, b.dmg, b.x, b.y);
          this.pools.ebullet.free(b); swapRemove(arr, i);
          break;
        }
      }
    }
  },

  clearEBullets() {
    for (const b of this.ebullets) {
      this.emitPart(b.x, b.y, 0, 0, '#ff8ca0', 4, 0.3);
      this.pools.ebullet.free(b);
    }
    this.ebullets.length = 0;
  },

  // =========================================================================
  // GEMS & PICKUPS
  // =========================================================================
  spawnGem(x, y, val) {
    if (this.gems.length > 320) { this.gems[0].val += val; return; }
    const g = this.pools.gem.alloc();
    g.x = x + U.rand(-6, 6); g.y = y + U.rand(-6, 6);
    g.vx = U.rand(-40, 40); g.vy = U.rand(-40, 40);
    g.val = val; g.mag = false; g.t = U.rand(0, TAU);
    this.gems.push(g);
  },

  spawnPickup(kind, x, y) {
    this.pickups.push({ kind, x, y, t: 0 });
  },

  updateGems(dt) {
    this.gemCombo.t -= dt;
    if (this.gemCombo.t <= 0) this.gemCombo.n = 0;
    const arr = this.gems;
    for (let i = arr.length - 1; i >= 0; i--) {
      const g = arr[i];
      g.t += dt;
      const p = this.nearestLivingPlayer(g.x, g.y);
      const pr2 = p.pickupR * p.pickupR;
      const d2 = U.dist2(g.x, g.y, p.x, p.y);
      if (g.mag || d2 < pr2) {
        const a = U.angleTo(g.x, g.y, p.x, p.y);
        const sp = g.mag ? 900 : U.lerp(650, 250, Math.min(1, d2 / pr2));
        g.vx = Math.cos(a) * sp; g.vy = Math.sin(a) * sp;
      } else { g.vx *= Math.pow(0.05, dt); g.vy *= Math.pow(0.05, dt); }
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (d2 < 22 * 22) {
        this.gemCombo.n++; this.gemCombo.t = 1.2;
        AudioSys.play('gem', this.gemCombo.n);
        this.emitPart(g.x, g.y, 0, -30, '#5dd9ff', 4, 0.3);
        this.gainXp(g.val);
        this.pools.gem.free(g); swapRemove(arr, i);
      }
    }
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      let taken = false;
      for (const pl of this.players) {
        if (pl.down) continue;
        if (U.dist2(k.x, k.y, pl.x, pl.y) < 30 * 30) {
          this.collectPickup(k, pl);
          taken = true;
          break;
        }
      }
      if (taken) swapRemove(this.pickups, i);
    }
  },

  collectPickup(k, p) {
    p = p || this.players[0];
    switch (k.kind) {
      case 'heart':
        const heal = Math.round(30 * this.mod.heal);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        AudioSys.play('heart');
        this.spawnDnum(p.x, p.y - 24, heal, false, '#6dff8a', '+');
        break;
      case 'magnet':
        AudioSys.play('magnet');
        for (const g of this.gems) g.mag = true;
        this.spawnRing(p.x, p.y, 300, '#4ef3ff');
        break;
      case 'chest': {
        this.chests++;
        AudioSys.play('chest');
        this.shake(0.2);
        this.emitBurst(k.x, k.y, '#ffd34e', 30, 280, 7, 0.8);
        const ups = p.weapons.filter(w => w.lvl < MAX_WLVL || !w.evolved);
        if (ups.length) {
          const w = U.pick(ups);
          if (w.lvl < MAX_WLVL) w.lvl++; else w.evolved = true;
          this.computeWStats(p, w);
          UI.announce(WEAPONS[w.id].name + (w.evolved ? ' EVOLVED' : ' +1'), 'supply cache', '#ffd34e', 2);
        } else {
          this.gainXp(60 * this.gemScale());
          UI.announce('+XP SURGE', 'supply cache', '#ffd34e', 2);
        }
        break;
      }
      case 'bomb': {
        AudioSys.play('boom', true);
        this.shake(0.5);
        this.spawnRing(p.x, p.y, 600, '#ff9d4e');
        const list = this.enemies.slice();
        for (const e of list) if (!e.dead) this.dealDamage(e, 250, { pl: p, noCrit: true });
        this.clearEBullets();
        break;
      }
    }
  },

  gainXp(v) {
    this.xp += v * this.mod.xp;
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeed(this.level);
      this.banked++;
      leveled = true;
    }
    if (leveled) {
      this.recalcStats();  // all players share the level bonus
      for (const pl of this.players) if (pl.down) this.revive(pl, 0.4);
    }
  },

  // =========================================================================
  // BOSSES
  // =========================================================================
  spawnBoss(id, hpMult = 1) {
    const def = BOSSES[id];
    const pos = this.spawnPos(200, 300);
    // the finale scales with how monstrous the player's build got
    if (id === 'bloom' && this.mode === 'normal')
      hpMult *= 1 + Math.max(0, this.level - 16) * 0.08;
    const totalHp = def.hp * hpMult * this.coopHpMult() * (this.nightmare ? NIGHTMARE.hp : 1) *
      (this.mode === 'endless' ? 1 + this.spawn.endlessT / 400 : 1);
    this.boss = {
      def, isBoss: true, x: pos.x, y: pos.y, r: def.r,
      hp: totalHp, maxHp: totalHp, dead: false,
      phase: 0, t: 0, patT: 2.5, patT2: 5, spiralA: 0, dashT: -1, dashAng: 0,
      flash: 0, orbCd: 0, scyCd: 0, marked: 0, spawnT: 0, slow: 1, mass: 50,
      rot: 0, atkCd: 0,
    };
    UI.announce(def.name, def.sub, def.color, 3);
    AudioSys.play('bossroar');
    AudioSys.setBoss(true);
    this.shake(0.5);
  },

  hitBoss(base, noNum = false, pl = null, src = null) {
    const b = this.boss;
    if (!b || b.dead) return;
    const p = pl || this.players[0];
    let dmg = base * p.dmgMult * (1 + BeatSys.dmgBonus(p)) * this.mod.dealt * U.rand(0.9, 1.1);
    let crit = false;
    if (Math.random() < p.critChance) { dmg *= p.critMult; crit = true; }
    if (b.marked > this.time - 0.4) dmg *= 1.25;
    b.hp -= dmg; b.flash = 0.08;
    this.dmgDealt += dmg;
    if (src) this.dmgBy[src] = (this.dmgBy[src] || 0) + dmg;
    if (p.siphon > 0) this.leech(p, dmg * p.siphon);
    if (!noNum && Math.random() < 0.6) this.spawnDnum(b.x + U.rand(-20, 20), b.y - b.r, dmg, crit);
    if (b.hp <= 0) this.killBoss();
  },

  killBoss() {
    const b = this.boss;
    b.dead = true;
    this.bossesKilled++;
    AudioSys.play('boom', true);
    AudioSys.setBoss(false);
    this.shake(0.8);
    this.emitBurst(b.x, b.y, b.def.color, 70, 420, 12, 1.3);
    this.emitBurst(b.x, b.y, '#ffffff', 40, 300, 8, 1);
    this.spawnRing(b.x, b.y, 400, b.def.color);
    this.clearEBullets();

    if (this.mode === 'sector' && this.sector && b.def.id === this.sector.boss) {
      this.bossKillT = this.time;
      this.boss = null;
      this.sectorClear();
      return;
    }
    if (b.def.id === 'bloom' && this.mode === 'normal') {
      // VICTORY
      this.state = 'winning'; this.seqT = 0; this.timeScale = 0.3;
      AudioSys.play('win');
      for (const e of this.enemies) if (!e.dead) this.killEnemy(e);
      this.boss = null;
      return;
    }
    // reward shower + a breather before spawns resume
    for (let i = 0; i < 8; i++) this.spawnGem(b.x + U.rand(-50, 50), b.y + U.rand(-50, 50), b.def.xp / 8 * this.gemScale());
    this.spawnPickup('chest', b.x, b.y);
    this.spawnPickup('heart', b.x + 40, b.y);
    this.spawn.timer = Math.max(this.spawn.timer, 6);
    this.boss = null;
  },

  updateBoss(dt) {
    const b = this.boss;
    if (!b || b.dead) return;
    const p = this.nearestLivingPlayer(b.x, b.y);
    b.t += dt;
    b.rot += dt * 0.7;
    if (b.flash > 0) b.flash -= dt;
    if (b.orbCd > 0) b.orbCd -= dt;
    if (b.scyCd > 0) b.scyCd -= dt;

    const id = b.def.id;
    const hpFrac = b.hp / b.maxHp;
    const aim = U.angleTo(b.x, b.y, p.x, p.y);
    const distP = U.dist(b.x, b.y, p.x, p.y);
    const dmgM = DIFF.dmgMult(this.effTime());

    // phase transitions (bloom)
    if (id === 'bloom') {
      const newPhase = hpFrac > 0.66 ? 0 : hpFrac > 0.33 ? 1 : 2;
      if (newPhase !== b.phase) {
        b.phase = newPhase;
        this.clearEBullets();
        this.shake(0.6);
        AudioSys.play('bossroar');
        UI.announce(newPhase === 1 ? 'THE BLOOM OPENS' : 'FINAL FORM', '', b.def.color, 2);
        this.spawnRing(b.x, b.y, 500, b.def.color);
      }
    }

    // --- movement --- (spawn grace ramp; gradual enrage after 75s so kiting can't stall the fight)
    let spd = b.def.spd * (id === 'bloom' && b.phase === 2 ? 1.35 : 1);
    if (b.t < 3) spd *= 0.3 + b.t / 3 * 0.7;
    if (b.t > 75) spd *= 1 + Math.min((b.t - 75) / 60, 1) * 0.45;
    if (b.dashT >= 0) {
      // dashing
      b.dashT -= dt;
      if (b.dashT > 0.6) { /* telegraph freeze */ }
      else if (b.dashT > 0) {
        b.x += Math.cos(b.dashAng) * 560 * dt;
        b.y += Math.sin(b.dashAng) * 560 * dt;
      } else b.dashT = -1;
    } else if (distP > 120) {
      b.x += Math.cos(aim) * spd * dt;
      b.y += Math.sin(aim) * spd * dt;
    }

    // contact damage (own cooldown so a glued boss doesn't shred through iframes)
    if (b.atkCd > 0) b.atkCd -= dt;
    if (b.atkCd <= 0) {
      for (const pl of this.players) {
        if (pl.down) continue;
        if (U.dist2(b.x, b.y, pl.x, pl.y) < (b.r + pl.r + 4) * (b.r + pl.r + 4)) {
          b.atkCd = 0.8;
          this.hurtPlayer(pl, b.def.dmg * dmgM, b.x, b.y);
          break;
        }
      }
    }

    // --- attack patterns ---
    b.patT -= dt; b.patT2 -= dt;
    const shoot = (ang, sp, dmg) => this.spawnEBullet(b.x, b.y, Math.cos(ang) * sp, Math.sin(ang) * sp, dmg);
    const bdmg = 13 * dmgM;

    if (id === 'warden') {
      if (b.patT <= 0) { b.patT = 3.2; for (let i = 0; i < 14; i++) shoot(b.rot + i / 14 * TAU, 190, bdmg); AudioSys.play('warn'); }
      if (b.patT2 <= 0) { b.patT2 = 8; b.dashT = 1.2; b.dashAng = aim; AudioSys.play('warn'); }
    } else if (id === 'siren') {
      b.spiralA += dt * 2.6;
      if (b.patT <= 0) { b.patT = 0.15; shoot(b.spiralA, 150, bdmg); shoot(b.spiralA + Math.PI, 150, bdmg); }
      if (b.patT2 <= 0) {
        b.patT2 = 6.5;
        if (U.chance(0.5)) { for (let i = 0; i < 5; i++) shoot(aim + (i - 2) * 0.16, 250, bdmg * 1.2); }
        else { for (let i = 0; i < 4; i++) { const pos = this.spawnPos(0, 60); this.spawnEnemy('dart', pos.x, pos.y); } }
        AudioSys.play('warn');
      }
    } else if (id === 'bloom') {
      if (b.phase === 0) {
        if (b.patT <= 0) {
          b.patT = 3;
          for (let ring = 0; ring < 2; ring++)
            for (let i = 0; i < 20; i++) shoot(b.rot + i / 20 * TAU + ring * 0.15, 150 + ring * 55, bdmg);
          AudioSys.play('warn');
        }
        if (b.patT2 <= 0) { b.patT2 = 5; for (let i = 0; i < 3; i++) { const pos = this.spawnPos(0, 80); this.spawnEnemy('mote', pos.x, pos.y); } }
      } else if (b.phase === 1) {
        b.spiralA += dt * 3;
        if (b.patT <= 0) { b.patT = 0.16; for (let arm = 0; arm < 3; arm++) shoot(b.spiralA + arm / 3 * TAU, 170, bdmg); }
        if (b.patT2 <= 0) {
          b.patT2 = 7;
          if (U.chance(0.6)) { b.dashT = 1.2; b.dashAng = aim; }
          else for (let i = 0; i < 2; i++) { const pos = this.spawnPos(0, 60); this.spawnEnemy('mitosis', pos.x, pos.y); }
          AudioSys.play('warn');
        }
      } else {
        b.spiralA += dt * 4.2;
        if (b.patT <= 0) { b.patT = 0.13; for (let arm = 0; arm < 4; arm++) shoot(b.spiralA + arm / 4 * TAU, 185, bdmg); }
        if (b.patT2 <= 0) {
          b.patT2 = 3.2;
          for (let i = 0; i < 6; i++) shoot(aim + (i - 2.5) * 0.14, 270, bdmg * 1.25);
          if (U.chance(0.4)) { const pos = this.spawnPos(0, 60); this.spawnEnemy('volatile', pos.x, pos.y); }
          AudioSys.play('warn');
        }
      }
    }
  },

  // =========================================================================
  // FX
  // =========================================================================
  shake(amt) { this.cam.shake = Math.min(1, this.cam.shake + amt * OPTS.shake); },

  emitPart(x, y, vx, vy, color, size, life) {
    if (this.parts.length > Quality.partCap[Quality.level]) return;
    const p = this.pools.part.alloc();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.color = color; p.size = size; p.life = life; p.maxLife = life;
    this.parts.push(p);
  },

  emitBurst(x, y, color, n, speed, size, life) {
    n = Math.ceil(n * Quality.burstMul[Quality.level]);
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, TAU), sp = U.rand(speed * 0.3, speed);
      this.emitPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color,
        U.rand(size * 0.5, size), U.rand(life * 0.5, life));
    }
  },

  spawnRing(x, y, maxR, color) {
    this.rings.push({ x, y, r: 10, maxR, life: 0.4, maxLife: 0.4, color });
  },

  spawnDnum(x, y, val, crit, color, prefix) {
    if (this.dnums.length > 110) return;
    if (!OPTS.dmgNums && val !== '') return;   // labels like PERFECT still show
    const d = this.pools.dnum.alloc();
    d.x = x; d.y = y; d.vy = -55; d.val = val === '' ? '' : Math.round(val);
    d.crit = crit; d.life = crit ? 0.85 : 0.6; d.maxLife = d.life;
    d.color = color || (crit ? '#ffd34e' : '#e8f2ff');
    d.prefix = prefix || '';
    this.dnums.push(d);
  },

  updateFx(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.pools.part.free(p); swapRemove(this.parts, i); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt);
    }
    for (let i = this.dnums.length - 1; i >= 0; i--) {
      const d = this.dnums[i];
      d.life -= dt;
      if (d.life <= 0) { this.pools.dnum.free(d); swapRemove(this.dnums, i); continue; }
      d.y += d.vy * dt; d.vy *= Math.pow(0.25, dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r = U.lerp(r.maxR, 10, r.life / r.maxLife * r.life / r.maxLife);
      if (r.life <= 0) swapRemove(this.rings, i);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      if (bm.life <= 0) swapRemove(this.beams, i);
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.life -= dt;
      if (z.life <= 0) swapRemove(this.zaps, i);
    }
  },

  // =========================================================================
  // MAIN STEP
  // =========================================================================
  step(rawDt) {
    if (this.state === 'dying' || this.state === 'winning') {
      this.seqT += rawDt;
      const dt = rawDt * this.timeScale;
      this.updateFx(dt);
      this.cam.shake = Math.max(0, this.cam.shake - rawDt * 1.6);
      if (this.seqT > 1.8) {
        if (this.state === 'dying') { this.state = 'over'; UI.showGameOver(); }
        else { this.state = 'win'; UI.showVictory(); }
      }
      return;
    }
    if (this.state !== 'run') return;

    if (this.hitStop > 0) { this.hitStop -= rawDt; return; }
    const dt = rawDt * this.timeScale;
    this.time += dt;
    Progress.tick(this, dt);
    this.runDeferred();

    // input & movement (per player)
    for (const p of this.players) {
      if (p.down) {
        // ghost: drifts at reduced speed, counts down to auto-revive
        p.downT -= dt;
        if (p.downT <= 0) { this.revive(p, 0.5); continue; }
        const gm = Math.hypot(p.input.x, p.input.y);
        if (gm > 0.01) {
          p.x += p.input.x / gm * p.speed * 0.55 * dt;
          p.y += p.input.y / gm * p.speed * 0.55 * dt;
        }
        continue;
      }
      const ix = p.input.x, iy = p.input.y;
      const mag = Math.hypot(ix, iy);
      if (p.sporeT > 0) p.sporeT -= dt;
      const az2 = ARENAS[this.arena];
      const spdEff = p.speed * (p.sporeT > 0 && az2.hazard ? az2.hazard.slow : 1);
      if (mag > 0.01) {
        const nx = ix / mag, ny = iy / mag;
        p.vx = U.damp(p.vx, nx * spdEff, 0.0001, dt);
        p.vy = U.damp(p.vy, ny * spdEff, 0.0001, dt);
        p.faceAng = Math.atan2(p.vy, p.vx);
      } else {
        p.vx = U.damp(p.vx, 0, 0.002, dt);
        p.vy = U.damp(p.vy, 0, 0.002, dt);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.iframes > 0) p.iframes -= dt;
      if (p.hurtT > 0) p.hurtT -= dt;
      if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * this.healMult() * this.mod.heal * dt);
      p.leechPool = Math.min(p.maxHp * SUSTAIN.leechPerSec, (p.leechPool || 0) + p.maxHp * SUSTAIN.leechPerSec * dt);

      // engine trail
      p.trailT -= dt;
      if (p.trailT <= 0 && mag > 0.01) {
        p.trailT = 0.03;
        const back = p.faceAng + Math.PI;
        this.emitPart(p.x + Math.cos(back) * 12, p.y + Math.sin(back) * 12,
          Math.cos(back) * 90 + U.rand(-25, 25), Math.sin(back) * 90 + U.rand(-25, 25),
          CHARS[p.charId].color, 4, 0.35);
      }
    }

    BeatSys.update(this, dt);
    if (!this.rotWarned && this.clock() >= SUSTAIN.rotStart && this.mode !== 'endless') {
      this.rotWarned = true;
      UI.announce('VOID ROT', 'healing weakens from here on', '#b06bff', 2.4);
      AudioSys.play('warn');
    }

    // shared-screen tether: partners can't split beyond the view
    if (this.players.length === 2) {
      const [a, b2] = this.players;
      const d = U.dist(a.x, a.y, b2.x, b2.y);
      const maxSep = Math.min(this.view.w, this.view.h) * 0.78;
      if (d > maxSep) {
        const mx = (a.x + b2.x) / 2, my = (a.y + b2.y) / 2;
        const ratio = maxSep / d;
        a.x = mx + (a.x - mx) * ratio; a.y = my + (a.y - my) * ratio;
        b2.x = mx + (b2.x - mx) * ratio; b2.y = my + (b2.y - my) * ratio;
      }
    }

    // rebuild spatial grid
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);

    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateWeapons(dt);
    this.updateScythes(dt);
    this.updateMines(dt);
    this.updateSingus(dt);
    this.updateHazards(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updateGems(dt);
    this.updateFx(dt);

    // camera follows the party midpoint
    let cx = 0, cy = 0;
    for (const pl of this.players) { cx += pl.x; cy += pl.y; }
    cx /= this.players.length; cy /= this.players.length;
    this.cam.x = U.damp(this.cam.x, cx, 0.00001, dt);
    this.cam.y = U.damp(this.cam.y, cy, 0.00001, dt);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.7);

    // music intensity follows danger
    const danger = Math.min(1, this.enemies.length / 200) * 0.6 +
      (this.boss ? 0.35 : 0) + Math.min(this.time / 900, 1) * 0.25;
    AudioSys.setIntensity(Math.min(1, danger));

    // level up pending? (co-op: living players alternate picks)
    if (this.banked > 0) {
      this.banked--;
      const living = this.players.filter(pl => !pl.down);
      const picker = living.length ? living[this.pickTurn % living.length] : this.players[0];
      this.pickTurn++;
      this.state = 'levelup';
      AudioSys.play('levelup');
      UI.showLevelUp(this.getUpgradeChoices(picker), picker);
    }
  },

  // =========================================================================
  // RENDER
  // =========================================================================
  render(ctx, w, h) {
    this.view.w = w; this.view.h = h;
    const cam = this.cam;
    const shakeAmt = cam.shake * cam.shake * 13;
    const sx = U.rand(-shakeAmt, shakeAmt), sy = U.rand(-shakeAmt, shakeAmt);
    // slow starfield drift behind the title screen
    const drift = this.player ? 0 : performance.now() * 0.02;
    const camX = cam.x + sx - w / 2 + drift, camY = cam.y + sy - h / 2 - drift * 0.35;

    // background (arena palette)
    const az = ARENAS[this.arena] || ARENAS[0];
    ctx.fillStyle = az.bg;
    ctx.fillRect(0, 0, w, h);
    this.renderBg(ctx, w, h, camX, camY, az);

    ctx.save();
    ctx.translate(-camX, -camY);
    Sprites.setCam(ctx, (canvas.width / w) || 1, camX, camY);

    const p = this.player;
    if (!p) { ctx.restore(); this.renderEmblem(ctx, w, h); return; }   // title screen: backdrop + emblem

    // hazard clouds (plasma burns / spore drifts)
    const spore = az.hazard && az.hazard.kind === 'spore';
    for (const hz of this.hazards) {
      const pulse = 1 + Math.sin(hz.wob * 1.7) * 0.05;
      const rr = hz.r * pulse;
      const grad = ctx.createRadialGradient(hz.x, hz.y, rr * 0.2, hz.x, hz.y, rr);
      if (spore) {
        grad.addColorStop(0, 'rgba(110,255,170,0.16)');
        grad.addColorStop(0.7, 'rgba(60,200,120,0.10)');
        grad.addColorStop(1, 'rgba(60,200,120,0)');
      } else {
        grad.addColorStop(0, 'rgba(255,140,50,0.22)');
        grad.addColorStop(0.7, 'rgba(255,80,30,0.13)');
        grad.addColorStop(1, 'rgba(255,80,30,0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(hz.x, hz.y, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = spore ? 'rgba(110,255,170,0.3)' : 'rgba(255,140,60,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.arc(hz.x, hz.y, rr, hz.wob * 0.3, hz.wob * 0.3 + TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // aura fields (per player)
    for (const pl of this.players) {
      if (pl.down) continue;
      for (const wp of pl.weapons) if (wp.id === 'aura') {
        const s = wp.s;
        const pulse = 1 + Math.sin(this.time * 5) * 0.03;
        const grad = ctx.createRadialGradient(pl.x, pl.y, s.radius * 0.3, pl.x, pl.y, s.radius * pulse);
        grad.addColorStop(0, 'rgba(255,106,78,0.02)');
        grad.addColorStop(0.8, wp.evolved ? 'rgba(255,160,60,0.13)' : 'rgba(255,106,78,0.09)');
        grad.addColorStop(1, 'rgba(255,106,78,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(pl.x, pl.y, s.radius * pulse, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,60,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pl.x, pl.y, s.radius * pulse, 0, TAU); ctx.stroke();
      }
    }

    // gems
    for (const g of this.gems) {
      const sprite = g.val >= 8 ? 'gem2' : g.val >= 3 ? 'gem1' : 'gem0';
      const bob = Math.sin(g.t * 4) * 0.12 + 1;
      Sprites.draw(ctx, sprite, g.x, g.y, 0, bob);
    }
    // pickups
    for (const k of this.pickups) {
      const bob = 1 + Math.sin(k.t * 3.5) * 0.1;
      Sprites.draw(ctx, k.kind, k.x, k.y, 0, bob * 1.15);
    }
    // mines
    for (const m of this.mines) {
      const armed = m.t >= m.arm;
      const pulse = armed ? 1 + Math.sin(m.t * 6) * 0.15 : 0.6 + m.t / m.arm * 0.4;
      Sprites.draw(ctx, 'mine', m.x, m.y, m.t * 0.8, pulse);
    }

    // enemy bullets (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.ebullets) Sprites.draw(ctx, 'ebullet', b.x, b.y);
    ctx.globalCompositeOperation = 'source-over';

    // enemies (LOD: skip decorative rotation when the horde is thick)
    const lod = this.enemies.length > 140;
    for (const e of this.enemies) {
      const key = 'e_' + e.def.sprite + (e.flash > 0 ? '_w' : '');
      const scl = (e.r / e.def.r) * (e.spawnT > 0 ? U.lerp(1, 0.3, e.spawnT / 0.4) : 1);
      let rot = 0;
      if (e.def.sprite === 'dart' || e.def.sprite === 'weaver') {
        const tgt = this.nearestLivingPlayer(e.x, e.y);
        rot = U.angleTo(e.x, e.y, tgt.x, tgt.y);
      } else if (!lod && (e.def.sprite === 'bruiser' || e.def.sprite === 'mitosis' || e.def.sprite === 'volatile'))
        rot = e.wob + this.time * 0.8;
      // volatile fuse flicker
      if (e.fuseT >= 0 && Math.floor(e.fuseT * 14) % 2 === 0) {
        Sprites.draw(ctx, 'e_' + e.def.sprite + '_w', e.x, e.y, rot, scl);
      } else {
        Sprites.draw(ctx, key, e.x, e.y, rot, scl);
      }
      if (e.elite) {
        ctx.strokeStyle = 'rgba(255,211,78,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7 + Math.sin(this.time * 6) * 2, 0, TAU); ctx.stroke();
      }
    }

    // boss
    const b = this.boss;
    if (b && !b.dead) {
      const key = 'e_' + b.def.sprite + (b.flash > 0 ? '_w' : '');
      const pulse = 1 + Math.sin(this.time * 4) * 0.04;
      // dash telegraph
      if (b.dashT > 0.6) {
        ctx.strokeStyle = 'rgba(255,82,82,0.5)';
        ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + Math.cos(b.dashAng) * 700, b.y + Math.sin(b.dashAng) * 700);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      Sprites.draw(ctx, key, b.x, b.y, b.rot, (b.r / 46) * pulse * (b.def.sprite === 'boss3' ? 46 / 52 * 1.18 : 1));
    }

    // scythes
    for (const sc of this.scythes)
      Sprites.draw(ctx, 'scythe', sc.x, sc.y, sc.rot, sc.size);

    // singularities (black holes swallow whatever is behind them)
    for (const sg of this.singus) {
      const grow = Math.min(1, sg.t * 3) * Math.min(1, (sg.dur - sg.t) * 2.5);
      Sprites.draw(ctx, 'singu', sg.x, sg.y, sg.rot, (sg.radius / 26) * 0.9 * grow);
    }

    // player ships
    if (this.state !== 'dying' || this.seqT < 0.1) {
      for (const pl of this.players) {
        if (pl.down) {
          // ghost with revive countdown
          ctx.globalAlpha = 0.25 + Math.sin(this.time * 6) * 0.1;
          Sprites.draw(ctx, CHARS[pl.charId].ship, pl.x, pl.y, pl.faceAng, 1.1);
          ctx.globalAlpha = 1;
          ctx.textAlign = 'center';
          ctx.font = 'bold 13px ' + FONT;
          ctx.fillStyle = '#ff8c8c';
          ctx.fillText(Math.ceil(pl.downT), pl.x, pl.y - 24);
          continue;
        }
        const blink = pl.iframes > 0 && Math.floor(pl.iframes * 16) % 2 === 0;
        if (!blink) Sprites.draw(ctx, CHARS[pl.charId].ship, pl.x, pl.y, pl.faceAng, 1.1);
        if (this.coop) {
          ctx.textAlign = 'center';
          ctx.font = 'bold 10px ' + FONT;
          ctx.fillStyle = CHARS[pl.charId].color;
          ctx.globalAlpha = 0.85;
          ctx.fillText('P' + (pl.idx + 1), pl.x, pl.y - 22);
          ctx.globalAlpha = 1;
        }
      }
    }

    // orbit shards (per player)
    for (const pl of this.players) {
      if (pl.down) continue;
      for (const wp of pl.weapons) if (wp.id === 'orbit') {
        const s = wp.s, sz = s.sizeMult || 1;
        for (let k = 0; k < s.count; k++) {
          const a = wp.ang + (k / s.count) * TAU;
          Sprites.draw(ctx, 'orb', pl.x + Math.cos(a) * s.radius, pl.y + Math.sin(a) * s.radius, 0, sz);
        }
      }
    }

    // additive pass: bullets, particles, beams, zaps, rings
    ctx.globalCompositeOperation = 'lighter';
    BeatSys.renderWorld(this, ctx);

    for (const bl of this.bullets) {
      const rot = Math.atan2(bl.vy, bl.vx);
      const spr = bl.kind === 'missile' ? 'missile' : bl.kind === 'pellet' ? 'pellet' : 'bullet';
      Sprites.draw(ctx, spr, bl.x, bl.y, rot);
    }

    for (const bm of this.beams) {
      const a = bm.life / bm.maxLife;
      ctx.save();
      ctx.translate(bm.x, bm.y);
      ctx.rotate(bm.ang);
      const wdt = bm.width * a;
      const grad = ctx.createLinearGradient(0, 0, bm.len, 0);
      grad.addColorStop(0, 'rgba(255,255,255,' + 0.9 * a + ')');
      grad.addColorStop(0.15, 'rgba(255,78,205,' + 0.8 * a + ')');
      grad.addColorStop(1, 'rgba(255,78,205,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, -wdt / 2, bm.len, wdt);
      ctx.restore();
    }

    ctx.lineCap = 'round';
    for (const z of this.zaps) {
      const a = z.life / z.maxLife;
      ctx.strokeStyle = 'rgba(200,150,255,' + (0.85 * a) + ')';
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      // jagged bolt
      const segs = 4;
      ctx.moveTo(z.x1, z.y1);
      for (let si = 1; si < segs; si++) {
        const t = si / segs;
        const mx = U.lerp(z.x1, z.x2, t) + U.rand(-9, 9);
        const my = U.lerp(z.y1, z.y2, t) + U.rand(-9, 9);
        ctx.lineTo(mx, my);
      }
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
    }

    for (const r of this.rings) {
      const a = r.life / r.maxLife;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 3 + 5 * a;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const pt of this.parts) {
      const a = pt.life / pt.maxLife;
      const spr = Sprites.glowDot(pt.color, 6);
      const size = pt.size * a * 2.2;
      ctx.globalAlpha = a;
      ctx.drawImage(spr, pt.x - size, pt.y - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // damage numbers (two passes so the font only changes once)
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px ' + FONT;
    for (const d of this.dnums) {
      if (d.crit) continue;
      ctx.globalAlpha = Math.min(1, d.life / d.maxLife * 2);
      ctx.fillStyle = d.color;
      ctx.fillText(d.prefix + d.val, d.x, d.y);
    }
    ctx.font = 'bold 17px ' + FONT;
    for (const d of this.dnums) {
      if (!d.crit) continue;
      ctx.globalAlpha = Math.min(1, d.life / d.maxLife * 2);
      ctx.fillStyle = d.color;
      ctx.fillText(d.prefix + d.val, d.x, d.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  },

  // soft colour clouds far behind the arena: one seamless tile per arena, drawn with slow parallax
  _nebTiles: {},
  renderNebula(ctx, w, h, camX, camY, az) {
    let tile = this._nebTiles[az.id];
    if (!tile) {
      const S = 512;
      tile = document.createElement('canvas');
      tile.width = tile.height = S;
      const g = tile.getContext('2d');
      let seed = 97 + az.id * 131;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 16; i++) {
        const x = rnd() * S, y = rnd() * S, r = 70 + rnd() * 150;
        const col = az.neb[i % az.neb.length], a = 0.16 + rnd() * 0.2;
        // draw each cloud at the wrapped positions too, so the tile repeats without seams
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue;
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.globalAlpha = a; g.fillStyle = gr;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
      this._nebTiles[az.id] = tile;
    }
    const T = 1536, par = 0.12;      // tile drawn 3x so the clouds stay soft
    let ox = -(camX * par) % T; if (ox > 0) ox -= T;
    let oy = -(camY * par) % T; if (oy > 0) oy -= T;
    ctx.globalAlpha = 0.55;
    for (let x = ox; x < w; x += T) for (let y = oy; y < h; y += T) ctx.drawImage(tile, x, y, T, T);
    ctx.globalAlpha = 1;
  },

  // Title screen: a vector bloom that opens on every beat of the menu music.
  renderEmblem(ctx, w, h) {
    const logo = this._logoEl || (this._logoEl = document.querySelector('#title .logo'));
    if (!logo || !document.getElementById('title').classList.contains('show')) return;
    const r = logo.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2 - cr.left, cy = r.top + r.height / 2 - cr.top;
    const beat = Beat.now(), ph = beat - Math.floor(beat);
    const kick = OPTS.flashes ? Math.pow(1 - ph, 3) : 0;          // 1 on the beat, easing to 0
    const R = Math.min(w * 0.42, 330) * (1 + kick * 0.035);
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    const rings = [
      { n: 8,  rad: R,        col: '#4ef3ff', spin: 0.05,  a: 0.5,  lw: 1.8 },
      { n: 8,  rad: R * 0.72, col: '#b06bff', spin: -0.08, a: 0.55, lw: 1.7 },
      { n: 6,  rad: R * 0.46, col: '#ff4ecd', spin: 0.12,  a: 0.6,  lw: 1.6 },
    ];
    for (const ring of rings) {
      ctx.strokeStyle = ring.col; ctx.lineWidth = ring.lw;
      ctx.globalAlpha = ring.a * (0.7 + kick * 0.5);
      const rot = t * ring.spin;
      ctx.beginPath();
      for (let i = 0; i < ring.n; i++) {
        const a0 = rot + (i / ring.n) * TAU, half = Math.PI / ring.n;
        // one petal: out along one side, in along the other
        const tipX = cx + Math.cos(a0) * ring.rad, tipY = cy + Math.sin(a0) * ring.rad;
        const lx = cx + Math.cos(a0 - half) * ring.rad * 0.55, ly = cy + Math.sin(a0 - half) * ring.rad * 0.55;
        const rx = cx + Math.cos(a0 + half) * ring.rad * 0.55, ry = cy + Math.sin(a0 + half) * ring.rad * 0.55;
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(lx, ly, tipX, tipY);
        ctx.quadraticCurveTo(rx, ry, cx, cy);
      }
      ctx.stroke();
    }
    // the beat itself: a ring that leaves the centre on every beat
    if (OPTS.flashes) {
      ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath(); ctx.arc(cx, cy, R * (0.2 + ph * 1.05), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  },

  // parallax starfield + grid, generated once
  _stars: null,
  renderBg(ctx, w, h, camX, camY, az) {
    az = az || ARENAS[0];
    if (!this._stars) {
      this._stars = [];
      const layers = [[70, 0.15, 1.1], [55, 0.35, 1.6], [40, 0.6, 2.2]];
      for (const [n, par, size] of layers) {
        const pts = [];
        for (let i = 0; i < n; i++)
          pts.push({ x: Math.random() * 2048, y: Math.random() * 2048, s: U.rand(size * 0.5, size), tw: U.rand(0, TAU) });
        this._stars.push({ par, pts });
      }
    }
    if (Quality.nebula) this.renderNebula(ctx, w, h, camX, camY, az);
    // faint world grid
    const gs = 130;
    ctx.strokeStyle = az.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = -camX % gs, oy = -camY % gs;
    for (let x = ox; x < w; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy; y < h; y += gs) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    // stars
    const t = performance.now() / 1000;
    for (const layer of this._stars) {
      const px = camX * layer.par, py = camY * layer.par;
      for (const s of layer.pts) {
        let x = (s.x - px) % 2048; if (x < 0) x += 2048;
        let y = (s.y - py) % 2048; if (y < 0) y += 2048;
        if (x > w + 4 || y > h + 4) continue;
        const tw = 0.5 + Math.sin(t * 2 + s.tw) * 0.3;
        ctx.globalAlpha = tw * (0.35 + layer.par * 0.6);
        ctx.fillStyle = az.star;
        ctx.fillRect(x, y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
  },
};
