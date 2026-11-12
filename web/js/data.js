// VOIDBLOOM — data.js: all balance tables. Tune the game here.
'use strict';

// ---------------------------------------------------------------------------
// WEAPONS — 8 weapons, 7 levels, each with a max-level evolution.
// base = level 1 stats; upgrades[i] = partial override applied at level i+2.
// rate is attacks/second. dmg is per hit before player multipliers.
// ---------------------------------------------------------------------------
const WEAPONS = {
  blaster: {
    name: 'Pulse Blaster', color: '#4ef3ff', icon: 'w_blaster',
    desc: 'Rapid bolts seek the nearest enemy.',
    base: { dmg: 12, count: 1, rate: 1.0, pierce: 1, spd: 540 },
    upgrades: [
      { stats: { count: 2 }, desc: '+1 bolt' },
      { stats: { dmg: 14, rate: 1.2 }, desc: '+damage, +fire rate' },
      { stats: { count: 3, dmg: 17 }, desc: '+1 bolt, +damage' },
      { stats: { pierce: 2, rate: 1.4 }, desc: 'Bolts pierce, +fire rate' },
      { stats: { count: 4, dmg: 24 }, desc: '+1 bolt, +damage' },
      { stats: { count: 5, dmg: 30, pierce: 3, rate: 1.6 }, desc: '+1 bolt, +pierce, +rate' },
    ],
    evo: { name: 'OVERDRIVE CANNON', desc: 'Every shot becomes a 3-round burst of shredding fire.' },
  },
  orbit: {
    name: 'Orbit Shards', color: '#4effa1', icon: 'w_orbit',
    desc: 'Crystal shards circle your ship, shredding what they touch.',
    base: { dmg: 12, count: 2, radius: 72, rotSpd: 2.6, tick: 0.35 },
    upgrades: [
      { stats: { count: 3 }, desc: '+1 shard' },
      { stats: { dmg: 16, radius: 84 }, desc: '+damage, wider orbit' },
      { stats: { count: 4, rotSpd: 3.0 }, desc: '+1 shard, spins faster' },
      { stats: { dmg: 22, radius: 96 }, desc: '+damage, wider orbit' },
      { stats: { count: 5, rotSpd: 3.4 }, desc: '+1 shard, spins faster' },
      { stats: { count: 6, dmg: 30, radius: 108 }, desc: '+1 shard, +damage' },
    ],
    evo: { name: 'HALO OF THORNS', desc: 'Massive shards with brutal knockback. Nothing gets close.' },
  },
  nova: {
    name: 'Nova Ring', color: '#ffd34e', icon: 'w_nova',
    desc: 'Periodic shockwave blasts everything around you.',
    base: { dmg: 16, radius: 115, rate: 0.33 },
    upgrades: [
      { stats: { dmg: 21 }, desc: '+damage' },
      { stats: { radius: 135, rate: 0.4 }, desc: 'Wider blast, faster' },
      { stats: { dmg: 28 }, desc: '+damage' },
      { stats: { radius: 155, rate: 0.48 }, desc: 'Wider blast, faster' },
      { stats: { dmg: 37 }, desc: '+damage' },
      { stats: { dmg: 46, radius: 180, rate: 0.55 }, desc: '+damage, wider blast' },
    ],
    evo: { name: 'SUPERNOVA', desc: 'Detonates twice and hurls enemies away.' },
  },
  rail: {
    name: 'Rail Lance', color: '#ff4ecd', icon: 'w_rail',
    desc: 'Charged beam that skewers the toughest enemy in sight.',
    base: { dmg: 40, rate: 0.26, width: 12 },
    upgrades: [
      { stats: { dmg: 52 }, desc: '+damage' },
      { stats: { rate: 0.34 }, desc: 'Charges faster' },
      { stats: { dmg: 70, width: 16 }, desc: '+damage, wider beam' },
      { stats: { rate: 0.42 }, desc: 'Charges faster' },
      { stats: { dmg: 95 }, desc: '+damage' },
      { stats: { dmg: 125, rate: 0.5, width: 20 }, desc: '+damage, faster, wider' },
    ],
    evo: { name: 'TWIN LANCE', desc: 'A second beam fires the opposite way. The void is a shooting gallery.' },
  },
  missiles: {
    name: 'Seeker Swarm', color: '#ff9d4e', icon: 'w_missiles',
    desc: 'Homing missiles that detonate in small blasts.',
    base: { dmg: 15, count: 1, rate: 0.55, blast: 58, spd: 330 },
    upgrades: [
      { stats: { count: 2 }, desc: '+1 missile' },
      { stats: { dmg: 20, blast: 68 }, desc: '+damage, bigger blast' },
      { stats: { count: 3, rate: 0.65 }, desc: '+1 missile, +rate' },
      { stats: { dmg: 26, blast: 78 }, desc: '+damage, bigger blast' },
      { stats: { count: 4, rate: 0.75 }, desc: '+1 missile, +rate' },
      { stats: { count: 5, dmg: 33, blast: 92 }, desc: '+1 missile, +damage' },
    ],
    evo: { name: 'HYDRA BARRAGE', desc: 'More missiles, bigger blasts, no survivors.' },
  },
  arc: {
    name: 'Arc Tether', color: '#b06bff', icon: 'w_arc',
    desc: 'Lightning that leaps from enemy to enemy.',
    base: { dmg: 14, chains: 3, rate: 0.8, range: 260, jump: 170 },
    upgrades: [
      { stats: { dmg: 18 }, desc: '+damage' },
      { stats: { chains: 4, rate: 0.95 }, desc: '+1 jump, +rate' },
      { stats: { dmg: 23 }, desc: '+damage' },
      { stats: { chains: 6, rate: 1.1 }, desc: '+2 jumps, +rate' },
      { stats: { dmg: 30 }, desc: '+damage' },
      { stats: { dmg: 38, chains: 8, rate: 1.25 }, desc: '+damage, +2 jumps' },
    ],
    evo: { name: 'STORM CAGE', desc: 'The lightning forks. Everything is a conductor.' },
  },
  scythe: {
    name: 'Void Scythe', color: '#d8b6ff', icon: 'w_scythe',
    desc: 'Spinning blades that arc out and return through the horde.',
    base: { dmg: 19, count: 1, rate: 0.5, range: 270, size: 1 },
    upgrades: [
      { stats: { dmg: 25 }, desc: '+damage' },
      { stats: { count: 2 }, desc: '+1 scythe' },
      { stats: { dmg: 32, size: 1.25 }, desc: '+damage, bigger blades' },
      { stats: { count: 3, rate: 0.6 }, desc: '+1 scythe, +rate' },
      { stats: { dmg: 41, size: 1.5 }, desc: '+damage, bigger blades' },
      { stats: { count: 4, dmg: 52, size: 1.7 }, desc: '+1 scythe, +damage' },
    ],
    evo: { name: 'EVENT HORIZON', desc: 'Colossal blades that drag enemies to a slow crawl.' },
  },
  aura: {
    name: 'Ember Aura', color: '#ff6a4e', icon: 'w_aura',
    desc: 'A burning field that scorches and slows everything inside.',
    base: { dps: 9, radius: 90, slow: 1 },
    upgrades: [
      { stats: { dps: 13 }, desc: '+burn damage' },
      { stats: { radius: 105 }, desc: 'Wider field' },
      { stats: { dps: 18, slow: 0.85 }, desc: '+burn, enemies slowed' },
      { stats: { radius: 122 }, desc: 'Wider field' },
      { stats: { dps: 24, slow: 0.75 }, desc: '+burn, stronger slow' },
      { stats: { dps: 32, radius: 142, slow: 0.7 }, desc: '+burn, wider, stronger slow' },
    ],
    evo: { name: 'STAR FURNACE', desc: 'Enemies inside the furnace take +25% damage from everything.' },
  },
  scatter: {
    name: 'Scatter Driver', color: '#ffb14e', icon: 'w_scatter',
    desc: 'Point-blank cone of shredding flak.',
    base: { dmg: 7, count: 5, rate: 0.9, spread: 0.55, spd: 620, life: 0.34 },
    upgrades: [
      { stats: { count: 7 }, desc: '+2 pellets' },
      { stats: { dmg: 9, rate: 1.05 }, desc: '+damage, +fire rate' },
      { stats: { count: 9, dmg: 12 }, desc: '+2 pellets, +damage' },
      { stats: { life: 0.42 }, desc: 'Longer reach' },
      { stats: { dmg: 15, count: 11 }, desc: '+damage, +2 pellets' },
      { stats: { dmg: 19, count: 13, rate: 1.25 }, desc: '+damage, +pellets, +rate' },
    ],
    evo: { name: "DRAGON'S BREATH", desc: 'A roaring wall of fire. Nothing survives the cone.' },
  },
  mines: {
    name: 'Void Mines', color: '#ff5e9e', icon: 'w_mines',
    desc: 'Drops proximity mines in your wake.',
    base: { dmg: 30, blast: 85, rate: 0.45, count: 1, maxLive: 6 },
    upgrades: [
      { stats: { count: 2 }, desc: '+1 mine per drop' },
      { stats: { dmg: 40, blast: 95 }, desc: '+damage, bigger blast' },
      { stats: { rate: 0.55, maxLive: 8 }, desc: 'Drops faster, +capacity' },
      { stats: { count: 3, dmg: 52 }, desc: '+1 mine, +damage' },
      { stats: { blast: 110, maxLive: 10 }, desc: 'Bigger blast, +capacity' },
      { stats: { dmg: 68, count: 4, rate: 0.62, maxLive: 12 }, desc: '+damage, +mine, +rate' },
    ],
    evo: { name: 'CHAIN REACTION', desc: 'Blasts detonate nearby mines. One spark, total annihilation.' },
  },
  singularity: {
    name: 'Singularity', color: '#9d7bff', icon: 'w_singularity',
    desc: 'Tears open a black hole that drags enemies to their doom.',
    base: { dps: 20, radius: 95, dur: 2.2, rate: 0.22, pull: 260 },
    upgrades: [
      { stats: { dps: 26 }, desc: '+crush damage' },
      { stats: { radius: 110 }, desc: 'Wider pull' },
      { stats: { dur: 2.8, dps: 34 }, desc: 'Lasts longer, +damage' },
      { stats: { rate: 0.26 }, desc: 'Opens more often' },
      { stats: { radius: 125, dps: 44 }, desc: 'Wider pull, +damage' },
      { stats: { dps: 56, dur: 3.2, rate: 0.3, pull: 330 }, desc: '+damage, longer, more often' },
    ],
    evo: { name: 'EVENT COLLAPSE', desc: 'The hole detonates when it dies. Physics files a complaint.' },
  },
};
const MAX_WLVL = 7; // level 8 = evolved

// ---------------------------------------------------------------------------
// PASSIVES — 16 total, max 5 equipped
// ---------------------------------------------------------------------------
const WEAPON_SLOTS = 4, PASSIVE_SLOTS = 5;
const PASSIVES = {
  amp:       { name: 'Amplifier',      icon: 'p_amp',       color: '#ff4ecd', max: 5, per: '+12% damage',        desc: 'Boosts all weapon damage.' },
  accel:     { name: 'Accelerator',    icon: 'p_accel',     color: '#4ef3ff', max: 5, per: '+10% fire rate',     desc: 'All weapons attack faster.' },
  plating:   { name: 'Hull Plating',   icon: 'p_plating',   color: '#ffd34e', max: 5, per: '+25 max HP',         desc: 'Reinforced hull. Heals 25 on pickup.' },
  nanobots:  { name: 'Nanobots',       icon: 'p_nanobots',  color: '#6dff8a', max: 5, per: '+0.6 HP/s regen',    desc: 'Self-repairing hull.' },
  thrusters: { name: 'Thrusters',      icon: 'p_thrusters', color: '#b06bff', max: 5, per: '+8% move speed',     desc: 'Outrun the swarm.' },
  attractor: { name: 'Attractor',      icon: 'p_attractor', color: '#5dd9ff', max: 5, per: '+30% pickup range',  desc: 'Crystals fly to you from farther away.' },
  shield:    { name: 'Shield Matrix',  icon: 'p_shield',    color: '#8aa0ff', max: 5, per: '+2 armor',           desc: 'Flat damage reduction on every hit.' },
  targeting: { name: 'Targeting Core', icon: 'p_targeting', color: '#ff9d4e', max: 5, per: '+6% crit chance',    desc: 'Crits deal bonus damage.' },
  siphon:    { name: 'Siphon Core',    icon: 'p_siphon',    color: '#ff5e9e', max: 5, per: '+0.2% lifesteal',    desc: 'A sliver of every wound feeds your hull.' },
  evasion:   { name: 'Ghost Plating',  icon: 'p_evasion',   color: '#9feaff', max: 5, per: '+4% dodge',          desc: 'Chance to phase through any hit.' },
  expanse:   { name: 'Expanse Coil',   icon: 'p_expanse',   color: '#ffd34e', max: 5, per: '+8% area',           desc: 'Blasts, fields, orbits and blades grow larger.' },
  greed:     { name: 'Greed Circuit',  icon: 'p_greed',     color: '#6dff8a', max: 5, per: '+8% XP',             desc: 'Crystals are worth more.' },
  curse:     { name: 'Voidbrand',      icon: 'p_curse',     color: '#ff5252', max: 3, per: '+10% spawns, +15% XP', desc: 'The void notices you. More enemies, richer crystals.' },
  duplicator:{ name: 'Duplicator',     icon: 'p_duplicator',color: '#4ef3ff', max: 2, per: '+1 projectile',      desc: 'Bolts, missiles, shards, blades — one more of each.' },
  wrath:     { name: 'Wrath Engine',   icon: 'p_wrath',     color: '#ff9d4e', max: 5, per: '+25% crit damage',   desc: 'Crits hit like a collapsing star.' },
  wind:      { name: 'Second Wind',    icon: 'p_wind',      color: '#ffffff', max: 1, per: 'revive once',        desc: 'Cheat death once per run. Come back at half hull.' },
};

// ---------------------------------------------------------------------------
// EPIC BOONS — rare one-shot cards that spice the level-up pool
// ---------------------------------------------------------------------------
const BOONS = {
  overload: { name: 'OVERLOAD',     icon: 'p_amp',       desc: 'Reactor unbound: +12% damage for the rest of this run.' },
  bulwark:  { name: 'BULWARK',      icon: 'p_plating',   desc: '+40 max hull, and full repairs. Right now.' },
  chrono:   { name: 'CHRONO FIELD', icon: 'p_accel',     desc: 'Every enemy moves 7% slower. Forever.' },
  tithe:    { name: 'VOID TITHE',   icon: 'h_xp',        desc: 'The void pays out: a surge of XP, instantly.' },
  armory:   { name: 'ARMORY CACHE', icon: 'w_blaster',   desc: 'Two random weapon levels, free of charge.' },
};

// ---------------------------------------------------------------------------
// HANGAR — permanent upgrades bought with Void Shards (persist across runs)
// ---------------------------------------------------------------------------
// Multiplies every Void Shard price (Hangar upgrades + ship unlocks). Raise to make progression slower.
const SHARD_COST_MULT = 3;

const HANGAR = [
  { id: 'hull',   name: 'Reinforced Hull',  icon: 'p_plating',   ranks: 5, base: 15, per: '+10 max HP' },
  { id: 'damage', name: 'Weapons Lab',      icon: 'p_amp',       ranks: 5, base: 20, per: '+4% damage' },
  { id: 'speed',  name: 'Vector Thrusters', icon: 'p_thrusters', ranks: 3, base: 18, per: '+2% move speed' },
  { id: 'magnet', name: 'Collector Array',  icon: 'p_attractor', ranks: 3, base: 13, per: '+10% pickup range' },
  { id: 'armor',  name: 'Ablative Plate',   icon: 'p_shield',    ranks: 3, base: 23, per: '+1 armor' },
  { id: 'regen',  name: 'Nanite Vats',      icon: 'p_nanobots',  ranks: 3, base: 20, per: '+0.2 HP/s regen' },
  { id: 'luck',   name: 'Combat Optics',    icon: 'p_targeting', ranks: 3, base: 18, per: '+2% crit chance' },
  { id: 'xp',     name: 'Salvage Rights',   icon: 'h_xp',        ranks: 3, base: 23, per: '+5% XP' },
  { id: 'reroll', name: 'Requisitions',     icon: 'h_reroll',    ranks: 2, base: 25, per: '+1 reroll per run' },
  { id: 'banish', name: 'Void Censor',      icon: 'h_banish',    ranks: 2, base: 25, per: '+1 banish per run' },
  { id: 'wind',   name: 'Phoenix Protocol', icon: 'p_wind',      ranks: 1, base: 75, per: 'auto-revive once per run' },
];
function hangarCost(item, rank) { return item.base * (rank + 1) * SHARD_COST_MULT; }

// ---------------------------------------------------------------------------
// ENEMIES
// ---------------------------------------------------------------------------
const ENEMIES = {
  mote:     { hp: 14,  spd: 88,  dmg: 8,  r: 11, xp: 1, color: '#ff4ecd', sprite: 'mote' },
  dart:     { hp: 12,  spd: 178, dmg: 7,  r: 10, xp: 1, color: '#66ffe3', sprite: 'dart' },
  husk:     { hp: 42,  spd: 58,  dmg: 11, r: 14, xp: 2, color: '#8aa0ff', sprite: 'husk' },
  spitter:  { hp: 36,  spd: 78,  dmg: 8,  r: 13, xp: 2, color: '#b06bff', sprite: 'spitter',
              ranged: { keep: 270, rate: 3.1, bdmg: 10, bspd: 225, n: 1 } },
  volatile: { hp: 26,  spd: 126, dmg: 5,  r: 12, xp: 2, color: '#ff5252', sprite: 'volatile',
              fuse: { trigger: 70, time: 0.75, radius: 95, dmg: 24 } },
  bruiser:  { hp: 170, spd: 47,  dmg: 18, r: 20, xp: 4, color: '#ff9d4e', sprite: 'bruiser', mass: 4 },
  mitosis:  { hp: 62,  spd: 82,  dmg: 10, r: 15, xp: 2, color: '#6dff8a', sprite: 'mitosis', splits: 3 },
  mite:     { hp: 10,  spd: 130, dmg: 6,  r: 8,  xp: 1, color: '#6dff8a', sprite: 'mote' },
  weaver:   { hp: 58,  spd: 112, dmg: 9,  r: 12, xp: 3, color: '#ff8adf', sprite: 'weaver', weave: true,
              ranged: { keep: 230, rate: 3.4, bdmg: 11, bspd: 245, n: 3, spread: 0.42 } },
  leech:    { hp: 34,  spd: 165, dmg: 5,  r: 12, xp: 2, color: '#c5ff4e', sprite: 'leech', steals: true },
  warper:   { hp: 60,  spd: 65,  dmg: 13, r: 13, xp: 3, color: '#b06bff', sprite: 'warper',
              warp: { every: 4.2, min: 240, max: 360 } },
  flower:   { hp: 70,  spd: 0,   dmg: 0,  r: 15, xp: 14, color: '#ff8adf', sprite: 'flower', still: true, mass: 8 },
};

// difficulty scaling over run time t (seconds)
const DIFF = {
  hpMult(t)  { const m = t / 60; return 1 + m * 0.22 + m * m * 0.09; },
  dmgMult(t) { return 1 + Math.min(t / 300, 3) * 0.35; },
  spdMult(t) { return 1 + Math.min(t / 900, 1.5) * 0.12; },
  aliveCap: 380,
  eliteEvery: 80,       // seconds between elite spawns (starting at t=170)
  eliteStart: 170,
  eliteHp: 9, eliteSize: 1.9, eliteXp: 10,
};

// spawn phases: from time t, spawn `batch` enemies every `interval`s using weighted types
const SPAWN_PHASES = [
  { t: 0,   interval: 1.8,  batch: 1, types: { mote: 1 } },
  { t: 40,  interval: 1.7,  batch: 2, types: { mote: 3, dart: 1 } },
  { t: 90,  interval: 1.5,  batch: 2, types: { mote: 3, dart: 2 } },
  { t: 150, interval: 1.35, batch: 2, types: { mote: 2, dart: 2, husk: 2 } },
  { t: 210, interval: 1.25, batch: 3, types: { mote: 2, dart: 2, husk: 2, spitter: 1 } },
  { t: 265, interval: 1.15, batch: 3, types: { husk: 3, dart: 2, spitter: 1, volatile: 1 } },
  { t: 335, interval: 1.05, batch: 3, types: { husk: 3, spitter: 1, volatile: 1, bruiser: 1 } },
  { t: 420, interval: 0.95, batch: 3, types: { mitosis: 2, husk: 2, spitter: 1, bruiser: 1, volatile: 1 } },
  { t: 510, interval: 0.88, batch: 4, types: { mitosis: 2, weaver: 1, spitter: 2, bruiser: 2, dart: 2 } },
  { t: 635, interval: 0.8,  batch: 5, types: { weaver: 2, bruiser: 2, mitosis: 2, volatile: 2, husk: 3 } },
  { t: 725, interval: 0.72, batch: 6, types: { weaver: 2, bruiser: 3, volatile: 2, dart: 3, spitter: 2 } },
  { t: 810, interval: 0.65, batch: 7, types: { weaver: 3, bruiser: 3, mitosis: 2, volatile: 2, spitter: 2, dart: 2 } },
];

// ---------------------------------------------------------------------------
// ARENAS
// ---------------------------------------------------------------------------
const ARENAS = [
  {
    id: 0, name: 'THE DRIFT', sub: 'open void · standard survey',
    bg: '#04050c', grid: 'rgba(80,110,190,0.06)', star: '#cdd8ff',
    gemMult: 1, hazard: null,
  },
  {
    id: 1, name: 'REACTOR CORE', sub: 'plasma storms · +15% crystals',
    bg: '#0a0407', grid: 'rgba(220,90,60,0.07)', star: '#ffd9c2',
    gemMult: 1.15,
    hazard: { count: 4, radius: 135, dps: 9, drift: 32 },
  },
  {
    id: 2, name: 'VOID GARDEN', sub: 'spore drift · bloomflowers · +25% crystals',
    bg: '#050a08', grid: 'rgba(90,200,140,0.07)', star: '#d2ffe6',
    gemMult: 1.25,
    hazard: { kind: 'spore', count: 5, radius: 150, slow: 0.55, drift: 26 },
  },
];

// Void Garden: weaver/mitosis-heavy with leeches, warpers, and bloomflowers
const SPAWN_PHASES_GARDEN = [
  { t: 0,   interval: 1.8,  batch: 1, types: { mote: 1 } },
  { t: 40,  interval: 1.6,  batch: 2, types: { mote: 3, dart: 1, flower: 1 } },
  { t: 90,  interval: 1.45, batch: 2, types: { mote: 3, dart: 2, leech: 1 } },
  { t: 150, interval: 1.3,  batch: 2, types: { mote: 2, dart: 2, mitosis: 2, flower: 1 } },
  { t: 210, interval: 1.2,  batch: 3, types: { mote: 2, mitosis: 2, husk: 2, leech: 1 } },
  { t: 265, interval: 1.1,  batch: 3, types: { mitosis: 3, dart: 2, warper: 1, leech: 1 } },
  { t: 335, interval: 1.0,  batch: 3, types: { mitosis: 3, weaver: 1, warper: 1, flower: 1 } },
  { t: 420, interval: 0.95, batch: 4, types: { mitosis: 2, weaver: 2, warper: 1, husk: 2, leech: 1 } },
  { t: 510, interval: 0.85, batch: 4, types: { weaver: 2, mitosis: 2, warper: 2, bruiser: 2 } },
  { t: 635, interval: 0.78, batch: 5, types: { weaver: 3, bruiser: 2, mitosis: 2, warper: 2, leech: 1 } },
  { t: 725, interval: 0.7,  batch: 6, types: { weaver: 3, bruiser: 3, warper: 2, dart: 3, mitosis: 2 } },
  { t: 810, interval: 0.62, batch: 7, types: { weaver: 3, bruiser: 4, warper: 3, mitosis: 3, dart: 2 } },
];

const SPAWN_EVENTS_GARDEN = [
  { t: 120, kind: 'ring',  type: 'mote',    n: 26, msg: 'THE SWARM TIGHTENS' },
  { t: 240, kind: 'flood', type: 'leech',   n: 8,  msg: 'CRYSTAL THIEVES' },
  { t: 400, kind: 'ring',  type: 'mitosis', n: 24, msg: 'THE GARDEN STIRS' },
  { t: 560, kind: 'flood', type: 'warper',  n: 8,  msg: 'SPACE FOLDS' },
  { t: 700, kind: 'ring',  type: 'weaver',  n: 20, msg: 'THE GARDEN STIRS' },
  { t: 840, kind: 'flood', type: 'dart',    n: 34, msg: 'FINAL APPROACH' },
];

// NIGHTMARE difficulty (unlocked by first victory)
const NIGHTMARE = { hp: 1.4, spd: 1.18, dmg: 1.2, shards: 1.75 };

// ---------------------------------------------------------------------------
// ACHIEVEMENTS — checked at run end; pay out Void Shards once
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  { id: 'blood',     name: 'First Blood',      shards: 10, desc: '100 kills in one run',            check: g => g.kills >= 100 },
  { id: 'warden',    name: 'Gatecrasher',      shards: 15, desc: 'slay The Warden',                 check: g => g.bossesKilled >= 1 },
  { id: 'siren',     name: 'Song Silenced',    shards: 20, desc: 'slay The Siren',                  check: g => g.bossesKilled >= 2 },
  { id: 'bloom',     name: 'Deadheaded',       shards: 50, desc: 'kill The Bloom — win a run',      check: (g, won) => won },
  { id: 'reactor',   name: 'Core Stable',      shards: 40, desc: 'win in the Reactor Core',         check: (g, won) => won && g.arena === 1 },
  { id: 'garden',    name: 'Weedkiller',       shards: 40, desc: 'win in the Void Garden',          check: (g, won) => won && g.arena === 2 },
  { id: 'lv30',      name: 'Ascendant',        shards: 20, desc: 'reach level 30',                  check: g => g.level >= 30 },
  { id: 'genocide',  name: 'Exterminatus',     shards: 25, desc: '2,000 kills in one run',          check: g => g.kills >= 2000 },
  { id: 'evolve',    name: 'Metamorphosis',    shards: 10, desc: 'evolve a weapon',                 check: g => g.players.some(p => p.weapons.some(w => w.evolved)) },
  { id: 'quadevo',   name: 'Full Bloom',       shards: 40, desc: '4 evolved weapons on one ship',   check: g => g.players.some(p => p.weapons.filter(w => w.evolved).length >= 4) },
  { id: 'untouch',   name: 'Ghost',            shards: 25, desc: 'reach 5:00 untouched',            check: g => g.firstHitAt >= 300 },
  { id: 'coopwin',   name: 'Wingmates',        shards: 30, desc: 'win a co-op run',                 check: (g, won) => won && g.coop },
  { id: 'nightwin',  name: 'Lucid',            shards: 75, desc: 'win a Nightmare run',             check: (g, won) => won && g.nightmare },
  { id: 'endless20', name: 'Beyond the Bloom', shards: 30, desc: 'survive to 20:00',                check: g => g.time >= 1200 },
];

// Reactor Core: volatile-heavy remix, slightly hotter throughout
const SPAWN_PHASES_REACTOR = [
  { t: 0,   interval: 1.7,  batch: 1, types: { mote: 1 } },
  { t: 40,  interval: 1.55, batch: 2, types: { mote: 3, dart: 1, volatile: 1 } },
  { t: 90,  interval: 1.4,  batch: 2, types: { mote: 3, dart: 2, volatile: 1 } },
  { t: 150, interval: 1.3,  batch: 2, types: { mote: 2, dart: 2, husk: 2, volatile: 1 } },
  { t: 210, interval: 1.2,  batch: 3, types: { mote: 2, dart: 2, husk: 2, volatile: 1 } },
  { t: 265, interval: 1.1,  batch: 3, types: { husk: 3, dart: 2, volatile: 2, bruiser: 1 } },
  { t: 335, interval: 1.0,  batch: 3, types: { husk: 3, spitter: 1, volatile: 2, bruiser: 1 } },
  { t: 420, interval: 0.92, batch: 3, types: { mitosis: 2, husk: 2, volatile: 2, bruiser: 2 } },
  { t: 510, interval: 0.85, batch: 4, types: { mitosis: 2, weaver: 1, volatile: 2, bruiser: 2, dart: 2 } },
  { t: 635, interval: 0.78, batch: 5, types: { weaver: 2, bruiser: 3, mitosis: 2, volatile: 3, husk: 2 } },
  { t: 725, interval: 0.7,  batch: 6, types: { weaver: 2, bruiser: 3, volatile: 3, dart: 3, spitter: 2 } },
  { t: 810, interval: 0.62, batch: 7, types: { weaver: 3, bruiser: 4, mitosis: 2, volatile: 3, spitter: 2 } },
];

const SPAWN_EVENTS_REACTOR = [
  { t: 120, kind: 'ring',  type: 'mote',     n: 26, msg: 'THE SWARM TIGHTENS' },
  { t: 240, kind: 'flood', type: 'volatile', n: 10, msg: 'MELTDOWN SURGE' },
  { t: 400, kind: 'ring',  type: 'husk',     n: 30, msg: 'THE SWARM TIGHTENS' },
  { t: 560, kind: 'flood', type: 'volatile', n: 14, msg: 'MELTDOWN SURGE' },
  { t: 700, kind: 'ring',  type: 'volatile', n: 18, msg: 'CORE BREACH' },
  { t: 840, kind: 'flood', type: 'dart',     n: 34, msg: 'FINAL APPROACH' },
];

// scripted events: rings close in, floods pour from one direction
const SPAWN_EVENTS = [
  { t: 120, kind: 'ring',  type: 'mote',  n: 26, msg: 'THE SWARM TIGHTENS' },
  { t: 240, kind: 'flood', type: 'dart',  n: 14, msg: 'CONTACTS INBOUND' },
  { t: 400, kind: 'ring',  type: 'husk',  n: 30, msg: 'THE SWARM TIGHTENS' },
  { t: 560, kind: 'flood', type: 'volatile', n: 12, msg: 'VOLATILE CLUSTER' },
  { t: 700, kind: 'ring',  type: 'mitosis', n: 22, msg: 'THE SWARM TIGHTENS' },
  { t: 840, kind: 'flood', type: 'dart',  n: 34, msg: 'FINAL APPROACH' },
];

// ---------------------------------------------------------------------------
// BOSSES
// ---------------------------------------------------------------------------
const BOSSES = {
  warden: {
    id: 'warden', name: 'THE WARDEN', sub: 'keeper of the first gate',
    sprite: 'boss', color: '#ff9d4e', hp: 1800, r: 46, spd: 215, dmg: 26, xp: 90,
  },
  siren: {
    id: 'siren', name: 'THE SIREN', sub: 'her song is static',
    sprite: 'boss2', color: '#b06bff', hp: 5200, r: 44, spd: 228, dmg: 30, xp: 180,
  },
  bloom: {
    id: 'bloom', name: 'THE BLOOM', sub: 'the void flowers at last',
    sprite: 'boss3', color: '#ff4ecd', hp: 26000, r: 54, spd: 248, dmg: 36, xp: 0,
  },
};
const BOSS_TIMES = [ { t: 300, id: 'warden' }, { t: 600, id: 'siren' }, { t: 900, id: 'bloom' } ];

// ---------------------------------------------------------------------------
// CHARACTERS
// ---------------------------------------------------------------------------
const CHARS = [
  {
    id: 0, name: 'VANGUARD', ship: 'ship0', color: '#4ef3ff', weapon: 'blaster',
    sub: 'balanced strike craft',
    desc: 'Starts with the Pulse Blaster. No tricks, no weaknesses — pure gunfighting.',
    mods: {},
  },
  {
    id: 1, name: 'TEMPEST', ship: 'ship1', color: '#b06bff', weapon: 'arc',
    sub: 'storm-runner',
    desc: 'Starts with the Arc Tether. +15% fire rate and +8% speed, but a fragile hull (-25 HP).',
    mods: { rate: 1.15, speed: 1.08, hp: -25 },
  },
  {
    id: 2, name: 'BASTION', ship: 'ship2', color: '#ffd34e', weapon: 'nova',
    sub: 'armored bulwark',
    desc: 'Starts with the Nova Ring. +50 HP and +2 armor, but 10% slower.',
    mods: { hp: 50, armor: 2, speed: 0.9 },
  },
  {
    id: 3, name: 'REVENANT', ship: 'ship3', color: '#ff5e9e', weapon: 'scythe',
    sub: 'void reaper', cost: 120 * SHARD_COST_MULT,
    desc: 'Starts with the Void Scythe. Innate 0.8% lifesteal — but a thin hull (-25 HP).',
    mods: { hp: -25, siphon: 0.008 },
  },
  {
    id: 4, name: 'WRAITH', ship: 'ship4', color: '#9feaff', weapon: 'rail',
    sub: 'glass phantom', cost: 150 * SHARD_COST_MULT,
    desc: 'Starts with the Rail Lance. +40% damage and +10% speed. 55 hull. Do not get hit.',
    mods: { hp: -45, dmg: 0.4, speed: 1.1 },
  },
];

// player baseline
const PLAYER_BASE = {
  hp: 100, speed: 255, pickupR: 88, armor: 0, regen: 0,
  dmgMult: 1, rateMult: 1, critChance: 0.05, critMult: 2.2,
};

// xp needed to go from level L to L+1
function xpNeed(l) { return Math.round(5 + (l - 1) * 5.5 + Math.pow(l - 1, 2) * 0.75); }

// register enemy + boss sprites now that colors are known
function initDataSprites() {
  for (const k in ENEMIES) Sprites.ensureEnemy(ENEMIES[k].sprite, ENEMIES[k].color);
  for (const k in BOSSES) Sprites.ensureEnemy(BOSSES[k].sprite, BOSSES[k].color);
}
