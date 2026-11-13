// ===========================================================================
// VOIDBLOOM — progress.js
// The long game: the Campaign (15 sectors with stars), Pilot Rank (a reward at
// every rank), ship paints, and Contracts (three rotating goals).
// Everything here is plain data plus the bookkeeping that runs at the end of a run.
// ===========================================================================

// ---------------------------------------------------------------------------
// CAMPAIGN
// len: seconds of real play. pace: how fast the swarm's clock runs (1 = the
// normal 15-minute run). XP is multiplied by pace too, so your build keeps up.
// boss: fought when the timer runs out; killing it clears the sector.
// ---------------------------------------------------------------------------
const TWISTS = {
  swarm:  { name: 'Swarm',      desc: 'More enemies, and more crystals to grab.', mod: { spawn: 1.35, batch: 1 } },
  haste:  { name: 'Haste',      desc: 'Enemies move 25% faster.',                 mod: { spd: 1.25 } },
  rush:   { name: 'Elite rush', desc: 'Elites arrive from the start, every 30s.', mod: { eliteStart: 20, eliteEvery: 30 } },
  glass:  { name: 'Glass',      desc: 'You hit 40% harder. So do they: +50%.',    mod: { dealt: 1.4, dmg: 1.5 } },
  famine: { name: 'Famine',     desc: 'All healing is 65% weaker.',               mod: { heal: 0.35 } },
  tide:   { name: 'Tide',       desc: 'A ring of enemies closes in every 45s.',   mod: { tide: 45 } },
};

// star objectives. Every star also needs the sector cleared.
const OBJECTIVES = {
  hull:     o => `Finish with ${Math.round(o.v * 100)}% hull or more`,
  kills:    o => `Destroy ${o.v.toLocaleString()} enemies`,
  perfects: o => `Land ${o.v} Perfect dashes`,
  groove:   o => o.v >= 4 ? 'Reach Overdrive' : `Reach Groove ×${o.v + 1}`,
  bossfast: o => `Defeat the boss within ${o.v}s`,
  evolve:   o => `Evolve ${o.v === 1 ? 'a weapon' : o.v + ' weapons'}`,
  nodown:   () => 'No pilot goes down',
  level:    o => `Reach level ${o.v}`,
};

const SECTORS = [
  // ---- THE DRIFT ----
  { name: 'First Light',    arena: 0, len: 180, pace: 1.0,  heat: 0, twist: null,
    stars: [{ t: 'kills', v: 150 }, { t: 'hull', v: 0.5 }] },
  { name: 'Drift Lanes',    arena: 0, len: 210, pace: 1.2,  heat: 0, twist: 'swarm',
    stars: [{ t: 'perfects', v: 10 }, { t: 'kills', v: 350 }] },
  { name: 'Static Field',   arena: 0, len: 240, pace: 1.3,  heat: 0, twist: 'haste',
    stars: [{ t: 'groove', v: 2 }, { t: 'hull', v: 0.5 }] },
  { name: 'Hunting Ground', arena: 0, len: 240, pace: 1.4,  heat: 1, twist: 'rush',
    stars: [{ t: 'level', v: 16 }, { t: 'perfects', v: 25 }] },
  { name: 'The Warden',     arena: 0, len: 240, pace: 1.25, heat: 1, twist: null, boss: 'warden',
    stars: [{ t: 'bossfast', v: 75 }, { t: 'hull', v: 0.4 }] },
  // ---- REACTOR CORE ----
  { name: 'Hot Start',      arena: 1, len: 240, pace: 1.4,  heat: 1, twist: null, gate: 6,
    stars: [{ t: 'kills', v: 700 }, { t: 'groove', v: 3 }] },
  { name: 'Meltdown',       arena: 1, len: 270, pace: 1.5,  heat: 1, twist: 'glass',
    stars: [{ t: 'evolve', v: 1 }, { t: 'hull', v: 0.4 }] },
  { name: 'Containment',    arena: 1, len: 270, pace: 1.6,  heat: 2, twist: 'famine',
    stars: [{ t: 'perfects', v: 40 }, { t: 'level', v: 22 }] },
  { name: 'Pressure',       arena: 1, len: 300, pace: 1.6,  heat: 2, twist: 'swarm',
    stars: [{ t: 'kills', v: 1400 }, { t: 'groove', v: 4 }] },
  { name: 'The Siren',      arena: 1, len: 300, pace: 2.0,  heat: 2, twist: null, boss: 'siren',
    stars: [{ t: 'bossfast', v: 90 }, { t: 'evolve', v: 2 }] },
  // ---- VOID GARDEN ----
  { name: 'Overgrowth',     arena: 2, len: 300, pace: 1.8,  heat: 2, twist: null, gate: 16,
    stars: [{ t: 'kills', v: 1500 }, { t: 'hull', v: 0.5 }] },
  { name: 'Spore Season',   arena: 2, len: 300, pace: 2.0,  heat: 3, twist: 'tide',
    stars: [{ t: 'perfects', v: 60 }, { t: 'evolve', v: 2 }] },
  { name: 'Rot Bloom',      arena: 2, len: 330, pace: 2.0,  heat: 3, twist: 'famine',
    stars: [{ t: 'groove', v: 4 }, { t: 'level', v: 30 }] },
  { name: 'Last Light',     arena: 2, len: 330, pace: 2.2,  heat: 4, twist: 'rush',
    stars: [{ t: 'kills', v: 2500 }, { t: 'hull', v: 0.4 }] },
  { name: 'The Bloom',      arena: 2, len: 360, pace: 2.5,  heat: 4, twist: null, boss: 'bloom',
    stars: [{ t: 'bossfast', v: 120 }, { t: 'evolve', v: 3 }] },
];
SECTORS.forEach((s, i) => { s.idx = i; s.num = i + 1; });

// ---------------------------------------------------------------------------
// SHIP PAINTS (cosmetic) and PILOT RANK
// ---------------------------------------------------------------------------
const PAINT_COLORS = {
  crimson: { name: 'Crimson', color: '#ff5252' }, toxic:   { name: 'Toxic',   color: '#9dff4e' },
  solar:   { name: 'Solar',   color: '#ff9d4e' }, orchid:  { name: 'Orchid',  color: '#ff4ecd' },
  glacier: { name: 'Glacier', color: '#7ab8ff' }, ghost:   { name: 'Ghost',   color: '#e8eeff' },
  gilded:  { name: 'Gilded',  color: '#ffd34e' }, emerald: { name: 'Emerald', color: '#4effa6' },
  ember:   { name: 'Ember',   color: '#ff6a3d' },
};
// XP to go from rank r to r+1
const rankNeed = r => 120 + 45 * (r - 1);

// what you get for reaching each rank (index = rank reached). Past the list: shards every rank.
const RANK_REWARDS = {
  2:  { shards: 40 },
  3:  { paint: [0, 'crimson'] },
  4:  { perk: 'reroll' },
  5:  { shards: 60 },
  6:  { paint: [1, 'toxic'] },
  7:  { shards: 80 },
  8:  { paint: [2, 'emerald'] },
  9:  { perk: 'banish' },
  10: { ship: 3 },
  11: { shards: 100 },
  12: { paint: [0, 'solar'] },
  13: { perk: 'xp' },
  14: { shards: 120 },
  15: { paint: [3, 'ghost'] },
  16: { perk: 'reroll' },
  17: { shards: 140 },
  18: { paint: [1, 'glacier'] },
  19: { shards: 150 },
  20: { ship: 4 },
  21: { paint: [4, 'orchid'] },
  22: { perk: 'xp' },
  23: { shards: 175 },
  24: { paint: [2, 'crimson'] },
  25: { perk: 'banish' },
  26: { shards: 200 },
  27: { paint: [0, 'gilded'] },
  28: { shards: 200 },
  29: { paint: [3, 'toxic'] },
  30: { perk: 'hull' },
  31: { shards: 225 },
  32: { paint: [4, 'solar'] },
  33: { shards: 225 },
  34: { paint: [1, 'gilded'] },
  35: { perk: 'hull' },
  36: { paint: [2, 'ghost'] },
  37: { shards: 250 },
  38: { paint: [0, 'ghost'] },
  39: { shards: 250 },
  40: { paint: [3, 'ember'], perk: 'xp' },
};
const PERKS = {
  reroll: '+1 reroll every run',
  banish: '+1 banish every run',
  xp:     '+5% XP from crystals',
  hull:   '+10 max hull every run',
};
function rankReward(r) { return RANK_REWARDS[r] || (r > 40 ? { shards: 300 } : null); }
function rewardLabel(rw) {
  if (!rw) return '';
  const parts = [];
  if (rw.shards) parts.push('◆ ' + rw.shards);
  if (rw.paint) parts.push(PAINT_COLORS[rw.paint[1]].name + ' paint for ' + CHARS[rw.paint[0]].name[0] + CHARS[rw.paint[0]].name.slice(1).toLowerCase());
  if (rw.perk) parts.push(PERKS[rw.perk]);
  if (rw.ship != null) parts.push('Unlock ' + CHARS[rw.ship].name[0] + CHARS[rw.ship].name.slice(1).toLowerCase());
  return parts.join(' and ');
}

// ---------------------------------------------------------------------------
// CONTRACTS: three at a time, progress carries across runs
// ---------------------------------------------------------------------------
const KILL_TYPES = { dart: 'Darts', husk: 'Husks', spitter: 'Spitters', volatile: 'Volatiles', bruiser: 'Bruisers', mitosis: 'Mitosis cells', weaver: 'Weavers' };
const CONTRACTS = {
  kills:    { tiers: [400, 900, 1800],  text: n => `Destroy ${n.toLocaleString()} enemies`,      run: g => g.kills },
  killType: { tiers: [40, 80, 150],     text: (n, c) => `Destroy ${n} ${KILL_TYPES[c.sub]}`,     run: (g, c) => (g.killsByType[c.sub] || 0),
              pickSub: () => U.pick(Object.keys(KILL_TYPES)) },
  perfects: { tiers: [30, 70, 140],     text: n => `Land ${n} Perfect dashes`,                  run: g => g.perfects || 0 },
  overdrive:{ tiers: [1, 2, 4],         text: n => n === 1 ? 'Reach Overdrive' : `Reach Overdrive ${n} times`, run: g => g.overdrives || 0 },
  boss:     { tiers: [1, 2, 4],         text: n => n === 1 ? 'Defeat a boss' : `Defeat ${n} bosses`, run: g => g.bossesKilled },
  evolve:   { tiers: [1, 3, 5],         text: n => n === 1 ? 'Evolve a weapon' : `Evolve ${n} weapons`, run: g => Progress.evolvedCount(g) },
  stars:    { tiers: [2, 4, 6],         text: n => `Earn ${n} campaign stars`,                  run: g => g.newStarCount || 0,
              ok: () => Progress.totalStars() < SECTORS.length * 3 - 6 },
  minutes:  { tiers: [12, 25, 45],      text: n => `Fly for ${n} minutes`,                       run: g => g.time / 60 },
  level:    { tiers: [15, 22, 30],      text: n => `Reach level ${n} in one run`,                run: g => g.level, single: true },
  pacts:    { tiers: [1, 3, 6],         text: n => n === 1 ? 'Take a Void Pact' : `Take ${n} Void Pacts`, run: g => g.pacts || 0 },
  chests:   { tiers: [2, 4, 8],         text: n => `Open ${n} supply caches`,                    run: g => g.chests || 0 },
};
const CONTRACT_PAY = [{ shards: 40, xp: 120 }, { shards: 75, xp: 200 }, { shards: 120, xp: 320 }];

// ---------------------------------------------------------------------------
const Progress = {
  get s() { return App.save; },

  init() {
    const s = this.s;
    if (!s.sectors) s.sectors = {};
    if (s.track !== 'campaign' && s.track !== 'survival') s.track = 'campaign';
    if (typeof s.sector !== 'number') s.sector = 0;
    if (!s.rank) s.rank = { r: 1, xp: 0, claimed: 1 };
    if (!s.perks) s.perks = {};
    if (!s.paints) s.paints = {};      // { shipId: ['crimson', ...] } owned
    if (!s.equip) s.equip = {};        // { shipId: 'crimson' }
    if (!Array.isArray(s.contracts)) s.contracts = [];
    while (s.contracts.length < 3) s.contracts.push(this.newContract(s.contracts.map(c => c.type)));
    this.applyPaints();
  },

  // ---------------- campaign ----------------
  stars(i) { return this.s.sectors[i] || [false, false, false]; },
  starCount(i) { return this.stars(i).filter(Boolean).length; },
  totalStars() { let n = 0; for (let i = 0; i < SECTORS.length; i++) n += this.starCount(i); return n; },
  cleared(i) { return !!this.stars(i)[0]; },
  // why a sector is locked, or null if you can play it
  lockReason(i) {
    if (i === 0 || this.s.testAll) return null;
    if (!this.cleared(i - 1)) return 'Clear sector ' + i + ' first';
    const gate = SECTORS[i].gate || 0;
    if (this.totalStars() < gate) return 'Needs ★ ' + gate;
    return null;
  },
  unlocked(i) { return !this.lockReason(i); },
  // the furthest sector you can play that still has stars to earn
  suggestedSector() {
    let best = 0;
    for (let i = 0; i < SECTORS.length; i++) if (this.unlocked(i)) best = i;
    for (let i = 0; i <= best; i++) if (!this.cleared(i)) return i;
    return best;
  },
  objectiveText(o) { return OBJECTIVES[o.t](o); },

  // the rule set for a run in this sector
  mods(sec) {
    const m = { spawn: 1, batch: 0, hp: 1, dmg: 1, spd: 1, heal: 1, xp: 1, dealt: 1,
                eliteStart: null, eliteEvery: null, tide: 0 };
    if (sec) {
      m.xp = sec.pace;
      if (sec.twist) Object.assign(m, TWISTS[sec.twist].mod);
    }
    m.xp *= 1 + 0.05 * (this.s.perks.xp || 0);
    return m;
  },

  // called from G.step while a sector runs
  tick(g, dt) {
    const sec = g.sector;
    if (!sec || g.state !== 'run') return;
    if (g.mod.tide) {
      g.tideT = (g.tideT || g.mod.tide) - dt;
      if (g.tideT <= 0) {
        g.tideT = g.mod.tide;
        const PH = g.arena === 1 ? SPAWN_PHASES_REACTOR : g.arena === 2 ? SPAWN_PHASES_GARDEN : SPAWN_PHASES;
        const types = Object.keys(PH[g.spawn.phase].types);
        const d = Math.max(g.view.w, g.view.h) * 0.62, n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          g.spawnEnemy(U.pick(types), g.cam.x + Math.cos(a) * d, g.cam.y + Math.sin(a) * d);
        }
        UI.announce('TIDE', '', '#ff5252', 1.4);
        AudioSys.play('warn');
      }
    }
    if (g.time >= sec.len && !g.sectorEnd) {
      g.sectorEnd = true;
      if (sec.boss) {
        g.spawnBoss(sec.boss);
        g.bossSpawnT = g.time;
      } else {
        g.sectorClear();
      }
    }
  },

  // ---------------- rank ----------------
  // add XP, returns the ranks gained with their rewards (already granted)
  addXp(xp) {
    const R = this.s.rank, ups = [];
    R.xp += xp;
    while (R.xp >= rankNeed(R.r)) {
      R.xp -= rankNeed(R.r);
      R.r++;
      const rw = rankReward(R.r);
      ups.push({ rank: R.r, label: this.grant(rw) });
    }
    R.claimed = R.r;
    return ups;
  },
  grant(rw) {
    if (!rw) return '';
    const s = this.s;
    let label = rewardLabel(rw);
    if (rw.shards) s.shards = (s.shards || 0) + rw.shards;
    if (rw.perk) s.perks[rw.perk] = (s.perks[rw.perk] || 0) + 1;
    if (rw.paint) {
      const [ship, p] = rw.paint;
      const owned = s.paints[ship] || (s.paints[ship] = []);
      if (!owned.includes(p)) owned.push(p);
    }
    if (rw.ship != null) {
      if (s.ships[rw.ship]) {                       // already bought: pay its price instead
        s.shards += CHARS[rw.ship].cost;
        label = '◆ ' + CHARS[rw.ship].cost + ' (you already own ' + CHARS[rw.ship].name[0] + CHARS[rw.ship].name.slice(1).toLowerCase() + ')';
      } else s.ships[rw.ship] = true;
    }
    return label;
  },
  nextRewardText() {
    const R = this.s.rank;
    for (let r = R.r + 1; r < R.r + 6; r++) {
      const rw = rankReward(r);
      if (rw && (rw.paint || rw.ship != null || rw.perk)) return { rank: r, label: rewardLabel(rw) };
    }
    return { rank: R.r + 1, label: rewardLabel(rankReward(R.r + 1)) };
  },

  // test mode: top rank, every rank reward, every ship and sector, plenty of shards
  seedTestSave() {
    const s = this.s;
    s.testSeeded = true;
    s.testAll = true;
    const top = 41;
    for (let r = 2; r <= top; r++) this.grant(rankReward(r));
    s.rank = { r: top, xp: 0, claimed: top };
    for (const ch of CHARS) if (ch.cost) s.ships[ch.id] = true;
    s.shards = 99999;
    this.applyPaints();
  },

  // ---------------- paints ----------------
  applyPaints() {
    for (const ch of CHARS) {
      if (!ch.baseColor) ch.baseColor = ch.color;
      const p = this.s.equip[ch.id];
      const col = p && PAINT_COLORS[p] && (this.s.paints[ch.id] || []).includes(p) ? PAINT_COLORS[p].color : ch.baseColor;
      if (col !== ch.color || !Sprites.get(ch.ship)) {
        ch.color = col;
        Sprites.repaintShip(ch.id, col);
      }
    }
  },
  equip(ship, paint) {
    if (paint) this.s.equip[ship] = paint; else delete this.s.equip[ship];
    this.applyPaints();
    App.persist();
  },

  // ---------------- contracts ----------------
  newContract(exclude = []) {
    const types = Object.keys(CONTRACTS).filter(t => !exclude.includes(t) && (!CONTRACTS[t].ok || CONTRACTS[t].ok()));
    const type = U.pick(types);
    const T = CONTRACTS[type];
    const runs = (this.s.stats && this.s.stats.runs) || 0;
    // the first few contracts are easy; later ones mix all tiers
    const tier = runs < 3 ? 0 : runs < 10 ? U.pick([0, 0, 1]) : U.pick([0, 1, 1, 2]);
    const c = { type, n: T.tiers[tier], tier, prog: 0 };
    if (T.pickSub) c.sub = T.pickSub();
    return c;
  },
  contractText(c) { return CONTRACTS[c.type].text(c.n, c); },
  evolvedCount(g) { let n = 0; for (const p of g.players) for (const w of p.weapons) if (w.evolved) n++; return n; },

  // ---------------- end of run ----------------
  // returns { shards, report } and saves nothing itself (App.recordRun persists)
  finishRun(g, won) {
    const s = this.s, rep = { sector: null, contracts: [], ranks: [], daily: false };
    let shards = 0, bonusXp = 0;

    // --- sector stars ---
    g.newStarCount = 0;
    if (g.sector) {
      const sec = g.sector, before = this.stars(sec.idx).slice();
      const now = [won, ...sec.stars.map(o => won && this.objectiveMet(g, o))];
      const after = before.map((b, i) => b || now[i]);
      const fresh = after.map((b, i) => b && !before[i]);
      s.sectors[sec.idx] = after;
      g.newStarCount = fresh.filter(Boolean).length;
      shards += g.newStarCount * (10 + sec.idx * 3);
      bonusXp += g.newStarCount * 40 + (won ? 60 : 0);
      rep.sector = { sec, now, after, fresh,
        labels: ['Clear the sector', ...sec.stars.map(o => this.objectiveText(o))] };
      // point the campaign at the next thing to do
      if (won) {
        const nxt = sec.idx + 1;
        s.sector = nxt < SECTORS.length && this.unlocked(nxt) ? nxt : sec.idx;
        rep.nextUnlocked = nxt < SECTORS.length && this.unlocked(nxt) ? nxt : null;
      }
    }

    // --- contracts ---
    for (let i = 0; i < s.contracts.length; i++) {
      const c = s.contracts[i], T = CONTRACTS[c.type];
      const before = c.prog;
      const v = T.run(g, c);
      c.prog = T.single ? Math.max(c.prog, v) : c.prog + v;
      const done = c.prog >= c.n;
      const line = { text: this.contractText(c), before: Math.min(before, c.n), after: Math.min(c.prog, c.n), n: c.n, done };
      if (done) {
        const pay = CONTRACT_PAY[c.tier];
        shards += pay.shards; bonusXp += pay.xp;
        line.pay = pay;
        const others = s.contracts.filter((_, j) => j !== i).map(o => o.type);
        s.contracts[i] = this.newContract([c.type, ...others]);
        line.next = this.contractText(s.contracts[i]);
      }
      rep.contracts.push(line);
    }

    // --- rank XP ---
    let xp = Math.floor(g.kills / 8 + g.time / 3 + g.bossesKilled * 50 + g.level * 4) + bonusXp;
    const today = new Date().toDateString();
    if (s.lastBoost !== today) { s.lastBoost = today; xp *= 2; rep.daily = true; }
    rep.xp = xp;
    rep.rankBefore = s.rank.r; rep.xpBefore = s.rank.xp;
    rep.ranks = this.addXp(xp);
    rep.rankAfter = s.rank.r; rep.xpAfter = s.rank.xp;
    this.applyPaints();

    // --- what to chase next ---
    rep.next = this.nextGoal(g, rep);
    return { shards, report: rep };
  },

  objectiveMet(g, o) {
    switch (o.t) {
      case 'hull': {
        const live = g.players.filter(p => !p.down);
        if (!live.length) return false;
        return live.reduce((a, p) => a + p.hp / p.maxHp, 0) / live.length >= o.v;
      }
      case 'kills':    return g.kills >= o.v;
      case 'perfects': return (g.perfects || 0) >= o.v;
      case 'groove':   return (g.maxTier || 0) >= o.v;
      case 'bossfast': return g.bossKillT != null && g.bossSpawnT != null && g.bossKillT - g.bossSpawnT <= o.v;
      case 'evolve':   return this.evolvedCount(g) >= o.v;
      case 'nodown':   return !g.downs;
      case 'level':    return g.level >= o.v;
    }
    return false;
  },

  nextGoal(g, rep) {
    if (g.sector) {
      const sec = g.sector, st = this.stars(sec.idx);
      if (!st[0]) return 'Clear ' + sec.name + ' to open the next sector.';
      const miss = sec.stars.findIndex((o, i) => !st[i + 1]);
      if (rep.nextUnlocked != null) return 'Sector ' + (rep.nextUnlocked + 1) + ', ' + SECTORS[rep.nextUnlocked].name + ', is open.';
      if (miss >= 0) return 'Next star here: ' + this.objectiveText(sec.stars[miss]) + '.';
      const lock = SECTORS[sec.idx + 1] && this.lockReason(sec.idx + 1);
      if (lock) return 'Sector ' + (sec.idx + 2) + ': ' + lock.toLowerCase() + '. You have ★ ' + this.totalStars() + '.';
    }
    const nx = this.nextRewardText(), R = this.s.rank;
    return (rankNeed(R.r) - R.xp) + ' XP to rank ' + (R.r + 1) + (nx.rank === R.r + 1 ? ': ' + nx.label + '.' : '.');
  },
};
