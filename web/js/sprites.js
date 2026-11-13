// VOIDBLOOM — sprites.js: pre-rendered neon sprites (no image assets).
// Everything glowy is drawn ONCE into an offscreen canvas with shadowBlur,
// then blitted with drawImage at runtime (shadowBlur per-frame is too slow).
'use strict';

const Sprites = {
  cache: new Map(),

  // Create (or fetch) a sprite canvas. drawFn(ctx, s) draws centered at (s/2, s/2).
  make(key, size, drawFn) {
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size);
    const ctx = c.getContext('2d');
    drawFn(ctx, c.width);
    this.cache.set(key, c);
    return c;
  },

  get(key) { return this.cache.get(key); },

  // redraw a ship in another colour (ship paints)
  repaintShip(id, color) {
    if (!this._ship) return;
    this.cache.delete('ship' + id);
    this._ship('ship' + id, color, id);
  },

  // World-render fast path: G.render registers the camera transform here so
  // rotated blits can use raw setTransform instead of save/restore (much faster).
  _base: null,
  setCam(ctx, dpr, camX, camY) { this._base = { ctx, dpr, camX, camY }; },

  // Blit sprite centered at (x,y) with rotation + scale.
  draw(ctx, key, x, y, rot = 0, scale = 1) {
    const c = this.cache.get(key);
    if (!c) return;
    if (rot === 0 && scale === 1) {
      ctx.drawImage(c, x - c.width / 2, y - c.height / 2);
      return;
    }
    const b = this._base;
    if (b && b.ctx === ctx) {
      const cs = Math.cos(rot) * scale, sn = Math.sin(rot) * scale;
      const d = b.dpr;
      ctx.setTransform(d * cs, d * sn, -d * sn, d * cs, d * (x - b.camX), d * (y - b.camY));
      ctx.drawImage(c, -c.width / 2, -c.height / 2);
      ctx.setTransform(d, 0, 0, d, -d * b.camX, -d * b.camY);
    } else {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(c, -c.width / 2, -c.height / 2);
      ctx.restore();
    }
  },

  // ---- reusable glow dot: soft radial gradient, additive-friendly ----
  glowDot(color, r) {
    const key = 'dot_' + color + '_' + r;
    return this.make(key, r * 4, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  },

  // ---- generic neon shape with glow. pts in unit space (-1..1), scaled by r ----
  neonShape(key, r, color, pts, opts = {}) {
    const pad = 2.2; // room for glow
    return this.make(key, r * 2 * pad, (ctx, s) => {
      const c = s / 2, sc = r;
      ctx.translate(c, c);
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0] * sc, p[1] * sc) : ctx.lineTo(p[0] * sc, p[1] * sc));
      ctx.closePath();
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 0.9;
      ctx.fillStyle = opts.fill || this.shade(color, 0.28);
      ctx.fill();
      ctx.shadowBlur = r * 0.55;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.strokeStyle = color;
      ctx.stroke();
      if (opts.core) { // bright inner core dot
        ctx.shadowBlur = r * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * (opts.core), 0, TAU);
        ctx.fill();
      }
    });
  },

  neonCircle(key, r, color, opts = {}) {
    const pad = 2.2;
    return this.make(key, r * 2 * pad, (ctx, s) => {
      const c = s / 2;
      ctx.translate(c, c);
      ctx.beginPath();
      if (opts.spikes) {
        const n = opts.spikes;
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * TAU;
          const rr = i % 2 === 0 ? r : r * 0.68;
          i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      } else {
        ctx.arc(0, 0, r, 0, TAU);
      }
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 0.9;
      ctx.fillStyle = opts.fill || this.shade(color, 0.28);
      ctx.fill();
      ctx.shadowBlur = r * 0.55;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.strokeStyle = color;
      ctx.stroke();
      if (opts.core) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = r * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * opts.core, 0, TAU);
        ctx.fill();
      }
    });
  },

  // darken/lighten a hex color toward black (t<1) — used for fills
  shade(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) * t | 0, g = ((n >> 8) & 255) * t | 0, b = (n & 255) * t | 0;
    return `rgb(${r},${g},${b})`;
  },

  // ------------------------------------------------------------------
  // Build every named sprite the game uses. Called once at boot.
  // ------------------------------------------------------------------
  init() {
    // --- player ships (point "up" = facing -y at rot 0... we use +x convention: nose right) ---
    const ship = (key, color, style) => {
      this.make(key, 64, (ctx, s) => {
        const c = s / 2;
        ctx.translate(c, c);
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = color;
        ctx.fillStyle = this.shade(color, 0.3);
        ctx.beginPath();
        if (style === 0) {          // Vanguard: sleek dart
          ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10);
        } else if (style === 1) {   // Tempest: swept wings
          ctx.moveTo(14, 0); ctx.lineTo(-4, -4); ctx.lineTo(-12, -11); ctx.lineTo(-6, 0); ctx.lineTo(-12, 11); ctx.lineTo(-4, 4);
        } else if (style === 2) {   // Bastion: wide wedge
          ctx.moveTo(13, 0); ctx.lineTo(-8, -12); ctx.lineTo(-11, 0); ctx.lineTo(-8, 12);
        } else if (style === 3) {   // Revenant: curved reaper fangs
          ctx.moveTo(15, 0); ctx.lineTo(2, -4); ctx.lineTo(-6, -13); ctx.lineTo(-9, -4);
          ctx.lineTo(-5, 0); ctx.lineTo(-9, 4); ctx.lineTo(-6, 13); ctx.lineTo(2, 4);
        } else {                    // Wraith: razor sliver
          ctx.moveTo(17, 0); ctx.lineTo(-8, -3.5); ctx.lineTo(-13, 0); ctx.lineTo(-8, 3.5);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // cockpit
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(3, 0, 2.6, 0, TAU); ctx.fill();
      });
    };
    this._ship = ship;
    ship('ship0', '#4ef3ff', 0);
    ship('ship1', '#b06bff', 1);
    ship('ship2', '#ffd34e', 2);
    ship('ship3', '#ff5e9e', 3);
    ship('ship4', '#9feaff', 4);

    // --- enemies: base shape per type + white flash variant ---
    const tri = [[1, 0], [-0.8, -0.75], [-0.5, 0], [-0.8, 0.75]];
    const diamond = [[1, 0], [0, -0.8], [-1, 0], [0, 0.8]];
    const hexPts = []; for (let i = 0; i < 6; i++) hexPts.push([Math.cos(i / 6 * TAU), Math.sin(i / 6 * TAU)]);
    const sq = [[0.85, -0.85], [0.85, 0.85], [-0.85, 0.85], [-0.85, -0.85]];

    const enemyShapes = {
      mote:    (k, c) => this.neonCircle(k, 11, c, { core: 0.3 }),
      dart:    (k, c) => this.neonShape(k, 10, c, tri),
      bruiser: (k, c) => this.neonShape(k, 20, c, hexPts, { core: 0.22 }),
      spitter: (k, c) => this.neonShape(k, 13, c, diamond, { core: 0.28 }),
      volatile:(k, c) => this.neonCircle(k, 12, c, { spikes: 8, core: 0.3 }),
      mitosis: (k, c) => this.neonCircle(k, 15, c, { spikes: 5, core: 0.25 }),
      husk:    (k, c) => this.neonShape(k, 14, c, sq, { core: 0.2 }),
      weaver:  (k, c) => this.neonShape(k, 12, c, [[1,0],[0.1,-0.5],[-1,-0.9],[-0.4,0],[-1,0.9],[0.1,0.5]]),
      leech:   (k, c) => this.neonShape(k, 12, c, [[1,0],[0.3,-0.55],[-0.5,-0.4],[-1,0],[-0.5,0.4],[0.3,0.55]], { core: 0.3 }),
      warper:  (k, c) => this.make(k, 12 * 2 * 2.2, (ctx, s) => {
        const cc = s / 2; ctx.translate(cc, cc);
        ctx.shadowColor = c; ctx.shadowBlur = 10;
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = this.shade(c, 0.35);
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 6; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
      }),
      flower:  (k, c) => this.make(k, 15 * 2 * 2.2, (ctx, s) => {
        const cc = s / 2; ctx.translate(cc, cc);
        ctx.shadowColor = c; ctx.shadowBlur = 10;
        ctx.fillStyle = this.shade(c, 0.45);
        ctx.strokeStyle = c; ctx.lineWidth = 1.8;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * 8, Math.sin(a) * 8, 6.5, 3.4, a, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#ffe9a8';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      }),
      boss:    (k, c) => this.neonShape(k, 46, c, hexPts, { core: 0.18 }),
      boss2:   (k, c) => this.neonCircle(k, 44, c, { spikes: 10, core: 0.2 }),
      boss3:   (k, c) => this.neonCircle(k, 52, c, { spikes: 12, core: 0.16 }),
    };
    // colors assigned in data.js; generate lazily via ensureEnemy()
    this._enemyShapes = enemyShapes;

    // --- projectiles ---
    this.make('bullet', 22, (ctx, s) => {
      const c = s / 2;
      ctx.translate(c, c);
      ctx.shadowColor = '#4ef3ff'; ctx.shadowBlur = 7;
      ctx.fillStyle = '#bffcff';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(1.5, 0, 3.4, 1.4, 0, 0, TAU); ctx.fill();
    });
    this.make('missile', 26, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ff9d4e'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffd9b8';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -3.5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 3.5); ctx.closePath(); ctx.fill();
    });
    this.make('scythe', 60, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 12;
      ctx.strokeStyle = '#d8b6ff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 18, -2.3, 1.2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 18, -2.0, 0.9); ctx.stroke();
    });
    this.make('orb', 30, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#4effa1'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#9dffcb';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-2, -2, 3, 0, TAU); ctx.fill();
    });
    this.make('pellet', 16, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ffb14e'; ctx.shadowBlur = 5;
      ctx.fillStyle = '#ffd9a8';
      ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 1.8, 0, 0, TAU); ctx.fill();
    });
    this.make('mine', 26, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ff5e9e'; ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ff8cba'; ctx.lineWidth = 2;
      ctx.fillStyle = '#3a1226';
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5e9e';
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
    });
    this.make('singu', 64, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.55, '#1a0b33');
      g.addColorStop(0.85, 'rgba(157,123,255,0.55)');
      g.addColorStop(1, 'rgba(157,123,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
      ctx.shadowColor = '#9d7bff'; ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(200,175,255,0.9)'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0.3, 2.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 15, 3.3, 5.6); ctx.stroke();
    });
    this.make('ebullet', 22, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ff4e6a'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff8ca0';
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
    });

    // --- pickups ---
    this.make('gem0', 20, (ctx, s) => this._gem(ctx, s, '#5dd9ff', 5));
    this.make('gem1', 24, (ctx, s) => this._gem(ctx, s, '#6dff8a', 6.5));
    this.make('gem2', 28, (ctx, s) => this._gem(ctx, s, '#ffd34e', 8));
    this.make('heart', 30, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c); ctx.scale(0.55, 0.55);
      ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff7b7b';
      ctx.beginPath();
      ctx.moveTo(0, 10); ctx.bezierCurveTo(-14, -2, -8, -13, 0, -5);
      ctx.bezierCurveTo(8, -13, 14, -2, 0, 10);
      ctx.fill();
    });
    this.make('magnet', 30, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#4ef3ff'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#9feaff'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 7.5, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(-10.2, 3, 5, 5); ctx.fillRect(5.2, 3, 5, 5);
    });
    this.make('chest', 36, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ffd34e'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#8a6a1f'; ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2;
      ctx.beginPath();
      const roundRect = (x, y, w, h, r) => { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); };
      roundRect(-11, -8, 22, 16, 3);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-11, -1); ctx.lineTo(11, -1); ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(-2.5, -3.5, 5, 6);
    });
    this.make('bomb', 30, (ctx, s) => {
      const c = s / 2; ctx.translate(c, c);
      ctx.shadowColor = '#ff9d4e'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#2b2f45'; ctx.strokeStyle = '#ff9d4e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 2, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(3, -5); ctx.quadraticCurveTo(7, -11, 3, -13); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(3.4, -13.4, 1.8, 0, TAU); ctx.fill();
    });

    // pre-warm common glow dots
    ['#4ef3ff', '#ff4ecd', '#ffd34e', '#6dff8a', '#ff5252', '#b06bff', '#ff9d4e', '#ffffff', '#5dd9ff']
      .forEach(col => { this.glowDot(col, 6); this.glowDot(col, 10); this.glowDot(col, 16); });
  },

  _gem(ctx, s, color, r) {
    const c = s / 2; ctx.translate(c, c);
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.32, 0); ctx.lineTo(0, r * 0.2); ctx.lineTo(-r * 0.32, 0);
    ctx.closePath(); ctx.fill();
  },

  // Called from data.js once enemy defs exist: build color + white-flash sprites.
  ensureEnemy(type, color) {
    const fn = this._enemyShapes[type];
    if (!fn) return;
    fn('e_' + type, color);
    fn('e_' + type + '_w', '#ffffff');
  },
};
