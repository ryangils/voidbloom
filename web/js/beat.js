// ===========================================================================
// VOIDBLOOM — beat.js
// BEAT SYNC: the soundtrack is the game clock.
//  - Beat Dash: dash on the beat for a PERFECT (invulnerable + damaging trail)
//  - Groove: chain PERFECTs to climb ×1 → ×2 → ×3 → ×4 → OVERDRIVE
//  - Downbeat shockwave: every bar pulses out from each ship, scaled by Groove
//  - The music builds layers as your Groove climbs
// ===========================================================================

const Beat = {
  // Beats elapsed (float), locked to the synth sequencer while music is playing.
  // Falls back to a wall clock at the same tempo when audio is unavailable/muted.
  now() {
    const M = AudioSys.music, ctx = AudioSys.ctx;
    if (M.on && ctx && ctx.state === 'running' && M.anchorT != null) {
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      return (ctx.currentTime - lat - M.anchorT) * M.bpm / 60;
    }
    return performance.now() / 1000 * M.bpm / 60;
  },
  secPerBeat() { return 60 / AudioSys.music.bpm; },
  // 0 right on a beat → 1 just before the next one
  phase() { const b = this.now(); return b - Math.floor(b); },
  // signed seconds to the nearest beat (negative = early, positive = late)
  offset() { const b = this.now(); return (b - Math.round(b)) * this.secPerBeat(); },
};

const BEAT = {
  PERFECT: 0.095,          // ± seconds
  GOOD: 0.17,
  // perfect-streak needed for each Groove tier (index = tier)
  TIERS: [0, 3, 8, 15, 24],
  NAMES: ['', 'GROOVE ×2', 'GROOVE ×3', 'GROOVE ×4', 'OVERDRIVE'],
  DMG: [0, 0.08, 0.16, 0.25, 0.4],      // bonus damage per tier
  COLORS: ['#9feaff', '#4ef3ff', '#b06bff', '#ff4ecd', '#ffd34e'],
  MUSIC_FLOOR: [0, 0.32, 0.5, 0.7, 0.9], // music intensity floor per tier
  DECAY_BEATS: 8,          // two bars without a PERFECT → drop a tier
};

const BeatSys = {
  initRun(g) {
    g.perfects = 0; g.maxTier = 0; g.beatTrails = []; g.lastBar = null; g.lastBeat = null; g.lastUpdBeat = null;
    for (const p of g.players) {
      p.groove = 0; p.tier = 0; p.lastPerfect = Beat.now();
      p.dashT = 0; p.dashCd = 0; p.dashVx = 0; p.dashVy = 0;
      p.dashJudge = null; p.dashSx = 0; p.dashSy = 0; p.beatFlash = 0;
    }
    AudioSys.music.grooveFloor = 0; AudioSys.music.overdrive = false;
  },

  tierOf(n) { let t = 0; for (let i = 0; i < BEAT.TIERS.length; i++) if (n >= BEAT.TIERS[i]) t = i; return t; },
  dmgBonus(p) { return p && p.tier ? BEAT.DMG[p.tier] : 0; },

  // called from input the instant the button is pressed (so judgement uses event time)
  requestDash(g, idx) {
    if (g.state !== 'run') return;
    const p = g.players[idx];
    if (!p || p.down || p.dashCd > 0 || p.dashT > 0) return;
    const off = Beat.offset(), a = Math.abs(off);
    const judge = a <= BEAT.PERFECT ? 'perfect' : a <= BEAT.GOOD ? 'good' : 'miss';

    // direction: stick/keys if moving, otherwise where the ship faces
    let dx = p.input.x, dy = p.input.y, m = Math.hypot(dx, dy);
    if (m < 0.15) { dx = Math.cos(p.faceAng); dy = Math.sin(p.faceAng); m = 1; }
    dx /= m; dy /= m;
    const spd = judge === 'perfect' ? 980 : judge === 'good' ? 820 : 640;
    p.dashT = 0.15; p.dashVx = dx * spd; p.dashVy = dy * spd;
    p.dashCd = judge === 'miss' ? 0.62 : 0.36;
    p.dashJudge = judge; p.dashSx = p.x; p.dashSy = p.y;
    p.iframes = Math.max(p.iframes, judge === 'miss' ? 0.08 : 0.24);
    p.faceAng = Math.atan2(dy, dx);

    const col = CHARS[p.charId].color;
    if (judge === 'perfect') {
      g.perfects++;
      p.lastPerfect = Beat.now();
      const before = p.tier;
      p.groove++;
      p.tier = this.tierOf(p.groove);
      g.spawnDnum(p.x, p.y - 26, '', false, BEAT.COLORS[p.tier], 'PERFECT');
      this.blip('perfect', p.tier);
      if (p.tier > before) this.tierUp(g, p);
    } else if (judge === 'good') {
      g.spawnDnum(p.x, p.y - 26, '', false, '#bcd2ff', 'GOOD');
      this.blip('good', p.tier);
    } else {
      g.spawnDnum(p.x, p.y - 26, '', false, '#ff7a7a', off < 0 ? 'EARLY' : 'LATE');
      this.blip('miss', p.tier);
      this.dropTier(g, p, true);
    }
    g.emitBurst(p.x, p.y, judge === 'perfect' ? BEAT.COLORS[p.tier] : col, judge === 'perfect' ? 14 : 6, 220, 4, 0.35);
  },

  tierUp(g, p) {
    g.maxTier = Math.max(g.maxTier, p.tier);
    const c = BEAT.COLORS[p.tier];
    UI.announce(BEAT.NAMES[p.tier], p.tier === 4 ? 'the void sings' : '+' + Math.round(BEAT.DMG[p.tier] * 100) + '% damage', c, 1.3);
    g.spawnRing(p.x, p.y, 180 + p.tier * 40, c);
    g.shake(0.15 + p.tier * 0.05);
    const notes = [69, 72, 76, 81];
    notes.forEach((n, i) => AudioSys.tone({ f: AudioSys.midi(n + p.tier * 2), t: 'triangle', dur: 0.18, vol: 0.06, when: AudioSys.ctx ? AudioSys.ctx.currentTime + i * 0.05 : 0 }));
  },

  dropTier(g, p, missed) {
    if (p.tier === 0) { p.groove = 0; return; }
    p.tier = Math.max(0, p.tier - 1);
    p.groove = BEAT.TIERS[p.tier];
    p.lastPerfect = Beat.now();
    if (!missed) g.spawnDnum(p.x, p.y - 26, '', false, '#8899bb', 'groove fading');
  },

  blip(kind, tier) {
    if (!AudioSys.ctx || AudioSys.muted) return;
    const t = AudioSys.ctx.currentTime;
    if (kind === 'perfect') {
      AudioSys.tone({ f: AudioSys.midi(81 + [0, 3, 5, 7, 12][tier]), t: 'square', dur: 0.09, vol: 0.05, when: t });
      AudioSys.tone({ f: AudioSys.midi(69), t: 'sine', dur: 0.12, vol: 0.06, when: t });
    } else if (kind === 'good') {
      AudioSys.tone({ f: AudioSys.midi(76), t: 'triangle', dur: 0.07, vol: 0.04, when: t });
    } else {
      AudioSys.tone({ f: 140, f2: 70, t: 'sawtooth', dur: 0.12, vol: 0.04, when: t });
    }
  },

  update(g, dt) {
    const beat = Beat.now();
    const beatN = Math.floor(beat), barN = Math.floor(beat / 4);
    const newBeat = g.lastBeat !== null && beatN !== g.lastBeat;
    const newBar = g.lastBar !== null && barN !== g.lastBar;
    g.lastBeat = beatN; g.lastBar = barN;
    // time spent on level-up / pause screens doesn't count against your groove
    if (g.lastUpdBeat != null && beat - g.lastUpdBeat > 0.5)
      for (const p of g.players) p.lastPerfect += beat - g.lastUpdBeat;
    g.lastUpdBeat = beat;

    let topTier = 0;
    for (const p of g.players) {
      if (p.dashCd > 0) p.dashCd -= dt;
      if (p.beatFlash > 0) p.beatFlash -= dt;
      if (p.down) { p.dashT = 0; continue; }

      // dash motion
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.x += p.dashVx * dt; p.y += p.dashVy * dt;
        if (p.dashJudge === 'perfect' && Math.random() < 0.8)
          g.emitPart(p.x, p.y, U.rand(-40, 40), U.rand(-40, 40), BEAT.COLORS[p.tier], 5, 0.4);
        if (p.dashT <= 0 && p.dashJudge === 'perfect') this.perfectSlash(g, p);
      }

      // groove decays if you stop hitting the beat
      if (p.tier > 0 && beat - p.lastPerfect > BEAT.DECAY_BEATS) this.dropTier(g, p, false);
      topTier = Math.max(topTier, p.tier);

      if (newBeat) p.beatFlash = 0.12;
      if (newBar) this.downbeatPulse(g, p);
    }

    // trails fade
    for (let i = g.beatTrails.length - 1; i >= 0; i--) {
      const t = g.beatTrails[i];
      t.life -= dt;
      if (t.life <= 0) g.beatTrails.splice(i, 1);
    }

    // the soundtrack follows your groove
    const M = AudioSys.music;
    M.grooveFloor = BEAT.MUSIC_FLOOR[topTier];
    M.overdrive = topTier === 4;
  },

  // PERFECT dash: everything along the dash line takes a neon slash
  perfectSlash(g, p) {
    const x1 = p.dashSx, y1 = p.dashSy, x2 = p.x, y2 = p.y;
    const capR = 38 + p.tier * 7;
    const dmg = (16 + g.level * 2.4) * (1 + p.tier * 0.3);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const col = BEAT.COLORS[p.tier];
    g.beatTrails.push({ x1, y1, x2, y2, w: capR, life: 0.45, maxLife: 0.45, color: col });
    g.grid.query(mx, my, len / 2 + capR + 30, g.qbuf);
    let hits = 0;
    for (const e of g.qbuf) {
      if (e.dead) continue;
      if (this.segDist2(e.x, e.y, x1, y1, x2, y2) < (capR + e.r) ** 2) {
        g.dealDamage(e, dmg, { pl: p, src: 'beatdash', knock: 160, kAng: U.angleTo(x1, y1, e.x, e.y) });
        hits++;
      }
    }
    const b = g.boss;
    if (b && !b.dead && this.segDist2(b.x, b.y, x1, y1, x2, y2) < (capR + b.r) ** 2) { g.hitBoss(dmg * 1.5, false, p, 'beatdash'); hits++; }
    if (hits) g.shake(0.06 + Math.min(0.2, hits * 0.015));
  },

  // every bar: a shockwave from each ship. Small at ×1, big in OVERDRIVE.
  downbeatPulse(g, p) {
    const radius = 70 + p.tier * 32;
    const dmg = (5 + g.level * 0.9) * (1 + p.tier * 0.6);
    const col = BEAT.COLORS[p.tier];
    g.spawnRing(p.x, p.y, radius, col);
    g.grid.query(p.x, p.y, radius + 30, g.qbuf);
    for (const e of g.qbuf) {
      if (e.dead) continue;
      if (U.dist2(p.x, p.y, e.x, e.y) < (radius + e.r) ** 2)
        g.dealDamage(e, dmg, { pl: p, src: 'downbeat', noNum: p.tier < 2, knock: 60 + p.tier * 30, kAng: U.angleTo(p.x, p.y, e.x, e.y) });
    }
    const b = g.boss;
    if (b && !b.dead && U.dist2(p.x, p.y, b.x, b.y) < (radius + b.r) ** 2) g.hitBoss(dmg, true, p, 'downbeat');
  },

  segDist2(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + dx * t, cy = y1 + dy * t;
    return (px - cx) ** 2 + (py - cy) ** 2;
  },

  // ---- drawing (world space, additive pass) ----
  renderWorld(g, ctx) {
    ctx.lineCap = 'round';
    for (const t of g.beatTrails) {
      const a = t.life / t.maxLife;
      ctx.strokeStyle = t.color; ctx.globalAlpha = 0.35 * a;
      ctx.lineWidth = t.w * 1.8 * a;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.globalAlpha = 0.9 * a; ctx.lineWidth = t.w * 0.55 * a;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.95 * a; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // approach ring: closes in on the ship and lands exactly on the beat
    const ph = Beat.phase();
    const b = Beat.now(), onBar = (Math.floor(b) + 1) % 4 === 0;  // next beat is a downbeat
    for (const p of g.players) {
      if (p.down) continue;
      const col = BEAT.COLORS[p.tier];
      const base = 20;
      const r = base + (1 - ph) * (onBar ? 70 : 46);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.2 + ph * 0.6;
      ctx.lineWidth = onBar ? 2.5 : 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      // target ring (flashes on the beat)
      ctx.globalAlpha = 0.18 + (p.beatFlash > 0 ? 0.6 : 0);
      ctx.lineWidth = p.beatFlash > 0 ? 3 : 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, base, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // ---- drawing (screen space) ----
  renderScreen(g, ctx, w, h) {
    // the whole void breathes with the kick, harder as your groove climbs
    let top = 0;
    for (const p of g.players) top = Math.max(top, p.tier);
    const ph = Beat.phase();
    const pulse = Math.max(0, 1 - ph * 3.5);
    if (pulse > 0 && OPTS.flashes) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = BEAT.COLORS[top];
      ctx.globalAlpha = pulse * (0.02 + top * 0.012);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  },

  renderHud(g, ctx, w, h) {
    const n = g.players.length;
    g.players.forEach((p, i) => {
      const bw = Math.min(220, w * 0.38), bh = 6;
      const cx = n === 1 ? w / 2 : (i === 0 ? w * 0.27 : w * 0.73);
      const x = cx - bw / 2, y = h - 30;
      const next = BEAT.TIERS[Math.min(4, p.tier + 1)], cur = BEAT.TIERS[p.tier];
      const frac = p.tier >= 4 ? 1 : (p.groove - cur) / (next - cur);
      const col = BEAT.COLORS[p.tier];
      ctx.fillStyle = 'rgba(8,12,28,0.7)';
      ctx.fillRect(x - 2, y - 2, bw + 4, bh + 4);
      ctx.fillStyle = col;
      ctx.globalAlpha = p.tier >= 4 ? 0.6 + 0.4 * Math.max(0, 1 - Beat.phase() * 2) : 0.9;
      ctx.fillRect(x, y, bw * U.clamp(frac, 0, 1), bh);
      ctx.globalAlpha = 1;
      // beat pips: 4 per bar, the current one lit
      const beatInBar = ((Math.floor(Beat.now()) % 4) + 4) % 4;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k === beatInBar ? col : 'rgba(136,153,187,0.35)';
        ctx.fillRect(x + bw + 10 + k * 9, y - 1, 6, bh + 2);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 11px ' + FONT;
      ctx.fillStyle = col;
      ctx.fillText(p.tier ? BEAT.NAMES[p.tier] : 'GROOVE', cx, y - 6);
    });
  },
};
