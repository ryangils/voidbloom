// VOIDBLOOM — audio.js: fully synthesized SFX + adaptive music. No audio files.
'use strict';

const AudioSys = {
  ctx: null,
  master: null, sfxBus: null, musicBus: null,
  vols: { master: 0.8, music: 0.65, sfx: 0.8 },
  muted: false,
  _last: {},          // per-sfx throttle timestamps
  _noiseBuf: null,

  // Created lazily on first user gesture (browser autoplay policy).
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) { return false; }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.16;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(comp);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.applyVols();
    // shared noise buffer (2s white noise)
    const len = ctx.sampleRate * 2;
    this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  },

  applyVols() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : this.vols.master;
    this.musicBus.gain.value = this.vols.music;
    this.sfxBus.gain.value = this.vols.sfx;
  },
  setVol(kind, v) { this.vols[kind] = v; this.applyVols(); },
  toggleMute() { this.muted = !this.muted; this.applyVols(); return this.muted; },

  // ---------------- synth primitives ----------------
  tone(o) {
    // {f, f2, t='sine', dur, vol, when=now, attack=0.004, curve}
    const ctx = this.ctx; if (!ctx) return;
    const when = o.when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.t || 'sine';
    osc.frequency.setValueAtTime(o.f, when);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), when + o.dur);
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(o.vol, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + o.dur);
    osc.connect(g); g.connect(o.bus || this.sfxBus);
    osc.start(when); osc.stop(when + o.dur + 0.02);
  },

  noise(o) {
    // {dur, vol, when, fType='lowpass', f, f2, q}
    const ctx = this.ctx; if (!ctx) return;
    const when = o.when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const flt = ctx.createBiquadFilter();
    flt.type = o.fType || 'lowpass';
    flt.frequency.setValueAtTime(o.f || 1200, when);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), when + o.dur);
    flt.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(o.vol, when + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, when + o.dur);
    src.connect(flt); flt.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(when); src.stop(when + o.dur + 0.02);
  },

  // throttled dispatcher — many sfx fire dozens of times per second
  play(name, arg) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const throttle = { shoot: 0.045, hit: 0.05, edie: 0.05, gem: 0.03, zap: 0.09, ehit: 0.06 }[name];
    if (throttle) {
      if (this._last[name] && now - this._last[name] < throttle) return;
      this._last[name] = now;
    }
    const f = this.SFX[name];
    if (f) f.call(this, arg, now);
  },

  // ---------------- sound effects ----------------
  SFX: {
    shoot() { this.tone({ f: 820 + Math.random() * 160, f2: 320, t: 'square', dur: 0.06, vol: 0.045 }); },
    missile() { this.noise({ dur: 0.22, vol: 0.09, f: 2200, f2: 300 }); },
    rail() {
      this.tone({ f: 180, f2: 2400, t: 'sawtooth', dur: 0.22, vol: 0.12 });
      this.noise({ dur: 0.25, vol: 0.1, fType: 'highpass', f: 900 });
    },
    nova() {
      this.tone({ f: 340, f2: 55, t: 'sine', dur: 0.4, vol: 0.28 });
      this.noise({ dur: 0.32, vol: 0.14, f: 900, f2: 120 });
    },
    zap() {
      this.tone({ f: 1400 + Math.random() * 700, f2: 240, t: 'square', dur: 0.1, vol: 0.07 });
      this.noise({ dur: 0.08, vol: 0.05, fType: 'highpass', f: 2200 });
    },
    scythe() { this.tone({ f: 460, f2: 900, t: 'triangle', dur: 0.14, vol: 0.06 }); },
    hit() { this.noise({ dur: 0.05, vol: 0.06, f: 2600, f2: 700 }); },
    edie() { this.tone({ f: 300 + Math.random() * 120, f2: 60, t: 'square', dur: 0.13, vol: 0.08 }); },
    boom(big) {
      const v = big ? 0.4 : 0.2;
      this.tone({ f: 140, f2: 34, t: 'sine', dur: big ? 0.7 : 0.4, vol: v });
      this.noise({ dur: big ? 0.8 : 0.45, vol: v * 0.7, f: 1400, f2: 60 });
    },
    gem(combo) {
      const step = Math.min(combo || 0, 24);
      const f = 520 * Math.pow(1.045, step);
      this.tone({ f, f2: f * 1.6, t: 'sine', dur: 0.07, vol: 0.075 });
    },
    heart() { this.tone({ f: 420, f2: 640, t: 'sine', dur: 0.18, vol: 0.16 }); this.tone({ f: 640, f2: 820, dur: 0.2, vol: 0.1, when: this.ctx.currentTime + 0.09 }); },
    magnet() { this.tone({ f: 300, f2: 1500, t: 'sine', dur: 0.4, vol: 0.14 }); },
    levelup(_, now) {
      [523, 659, 784, 1046].forEach((f, i) =>
        this.tone({ f, t: 'sine', dur: 0.3, vol: 0.14, when: now + i * 0.07 }));
    },
    evolve(_, now) {
      [392, 523, 659, 784, 1046, 1318].forEach((f, i) =>
        this.tone({ f, t: 'triangle', dur: 0.5, vol: 0.13, when: now + i * 0.06 }));
      this.noise({ dur: 0.9, vol: 0.1, fType: 'highpass', f: 600, f2: 4500, when: now });
    },
    chest(_, now) {
      [659, 784, 988, 1318].forEach((f, i) =>
        this.tone({ f, t: 'square', dur: 0.22, vol: 0.07, when: now + i * 0.09 }));
    },
    hurt() {
      this.tone({ f: 160, f2: 60, t: 'sawtooth', dur: 0.22, vol: 0.3 });
      this.noise({ dur: 0.18, vol: 0.16, f: 700, f2: 150 });
    },
    ehit() { this.noise({ dur: 0.04, vol: 0.045, f: 3200, f2: 900 }); },
    bossroar(_, now) {
      this.tone({ f: 90, f2: 36, t: 'sawtooth', dur: 1.4, vol: 0.35 });
      this.tone({ f: 45, f2: 30, t: 'square', dur: 1.4, vol: 0.25, when: now + 0.05 });
      this.noise({ dur: 1.2, vol: 0.2, f: 500, f2: 80 });
    },
    warn() { this.tone({ f: 220, f2: 220, t: 'square', dur: 0.12, vol: 0.12 }); },
    ui() { this.tone({ f: 700, f2: 900, t: 'sine', dur: 0.05, vol: 0.06 }); },
    uiBack() { this.tone({ f: 500, f2: 320, t: 'sine', dur: 0.07, vol: 0.06 }); },
    death(_, now) {
      this.tone({ f: 320, f2: 40, t: 'sawtooth', dur: 1.6, vol: 0.3 });
      this.noise({ dur: 1.4, vol: 0.25, f: 2000, f2: 60 });
      [392, 311, 233, 196].forEach((f, i) =>
        this.tone({ f, t: 'triangle', dur: 0.5, vol: 0.12, when: now + 0.3 + i * 0.22 }));
    },
    win(_, now) {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
        this.tone({ f, t: 'triangle', dur: 0.8, vol: 0.12, when: now + i * 0.12 }));
    },
  },

  // ---------------- adaptive music ----------------
  music: {
    on: false, mode: 'menu', intensity: 0, boss: false,
    bpm: 122, step: 0, nextT: 0, timer: null,
  },

  // chords as [bassMidi, [chordMidis]] — A harmonic-minor flavored
  PROG_RUN: [
    [45, [57, 60, 64]],   // Am
    [41, [53, 57, 60]],   // F
    [43, [55, 59, 62]],   // G
    [40, [52, 56, 59]],   // E (maj — harmonic minor bite)
  ],
  PROG_BOSS: [
    [40, [52, 55, 59]],   // Em
    [41, [53, 56, 60]],   // Fm-ish shove
    [40, [52, 55, 59]],
    [39, [51, 54, 58]],   // Ebdim-ish
  ],
  PROG_MENU: [
    [45, [57, 60, 64]],
    [41, [53, 57, 60]],
  ],

  midi(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  startMusic(mode) {
    if (!this.ensure()) return;
    const M = this.music;
    M.mode = mode; M.step = 0;
    if (M.on) return;
    M.on = true;
    M.nextT = this.ctx.currentTime + 0.08;
    M.timer = setInterval(() => this._schedule(), 44);
  },
  stopMusic() {
    const M = this.music;
    M.on = false;
    if (M.timer) { clearInterval(M.timer); M.timer = null; }
  },
  setIntensity(x) { this.music.intensity = U.clamp(x, 0, 1); },
  setBoss(b) { this.music.boss = b; },

  _schedule() {
    const M = this.music, ctx = this.ctx;
    if (!M.on || !ctx) return;
    const stepDur = 60 / M.bpm / 4;   // 16th
    while (M.nextT < ctx.currentTime + 0.18) {
      this._playStep(M.step, M.nextT, stepDur);
      M.step = (M.step + 1) % 128;    // 8 bars of 16ths
      M.nextT += stepDur;
    }
  },

  _playStep(step, t, stepDur) {
    const M = this.music;
    const menu = M.mode === 'menu';
    const I = menu ? 0.12 : M.intensity;
    const prog = menu ? this.PROG_MENU : (M.boss ? this.PROG_BOSS : this.PROG_RUN);
    const barsPerChord = 2, stepsPerBar = 16;
    const chordIdx = Math.floor(step / (stepsPerBar * barsPerChord)) % prog.length;
    const [bassM, chord] = prog[chordIdx];
    const s16 = step % 16;
    const bus = this.musicBus;

    // pad — always (soft detuned saws, chord change only)
    if (step % (stepsPerBar * barsPerChord) === 0) {
      const padDur = stepDur * stepsPerBar * barsPerChord * 1.02;
      chord.forEach(m => {
        this.tone({ f: this.midi(m), t: 'sawtooth', dur: padDur, vol: 0.016, attack: 0.6, when: t, bus });
        this.tone({ f: this.midi(m) * 1.004, t: 'sawtooth', dur: padDur, vol: 0.012, attack: 0.8, when: t, bus });
      });
    }
    if (menu) {
      // sparse dreamy arp
      if (step % 4 === 0) {
        const m = chord[(step / 4) % chord.length];
        this.tone({ f: this.midi(m + 12), t: 'triangle', dur: 0.5, vol: 0.028, attack: 0.02, when: t, bus });
      }
      return;
    }

    // bass — 8ths, driving
    if (s16 % 2 === 0) {
      const octJump = (M.boss && s16 % 8 === 6) ? 12 : 0;
      this.tone({ f: this.midi(bassM + octJump), t: 'sawtooth', dur: stepDur * 1.7, vol: 0.055, when: t, bus });
      this.tone({ f: this.midi(bassM - 12 + octJump), t: 'square', dur: stepDur * 1.7, vol: 0.03, when: t, bus });
    }
    // kick — 4 on the floor
    if (s16 % 4 === 0) {
      this.tone({ f: 150, f2: 38, t: 'sine', dur: 0.16, vol: 0.5, when: t, bus });
    }
    // hats — offbeat 8ths, denser when hot
    if (I > 0.25 && (s16 % 4 === 2 || (I > 0.6 && s16 % 2 === 1))) {
      this.noise({ dur: 0.03, vol: 0.028 + I * 0.02, fType: 'highpass', f: 7000, when: t, bus });
    }
    // snare — 2 & 4
    if (I > 0.45 && (s16 === 4 || s16 === 12)) {
      this.noise({ dur: 0.12, vol: 0.09, f: 2400, f2: 900, when: t, bus });
      this.tone({ f: 210, f2: 150, t: 'triangle', dur: 0.08, vol: 0.05, when: t, bus });
    }
    // arp — 16ths climbing the chord, opens up with intensity
    if (I > 0.18) {
      const seq = [0, 1, 2, 1];
      const m = chord[seq[s16 % 4]] + 12 + (s16 >= 8 && I > 0.7 ? 12 : 0);
      this.tone({ f: this.midi(m), t: M.boss ? 'square' : 'triangle', dur: stepDur * 1.1, vol: 0.02 + I * 0.025, attack: 0.006, when: t, bus });
    }
    // lead motif — only at high heat, 2-bar phrase
    if (I > 0.78 && step % 2 === 0) {
      const phrase = [0, -1, 0, 2, -1, -1, 1, 0, -1, -1, 2, 1, 0, -1, -1, -1];
      const idx = (step / 2) % 16;
      const deg = phrase[idx];
      if (deg >= 0) {
        const m = chord[deg % chord.length] + 24;
        this.tone({ f: this.midi(m), t: 'square', dur: stepDur * 2.4, vol: 0.024, attack: 0.01, when: t, bus });
      }
    }
  },
};
