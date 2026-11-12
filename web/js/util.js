// VOIDBLOOM — util.js: math helpers, RNG, spatial hash, pooling
'use strict';

const TAU = Math.PI * 2;

const U = {
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  chance(p) { return Math.random() < p; },
  clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  // frame-rate independent exponential approach
  damp(a, b, smoothing, dt) { return U.lerp(a, b, 1 - Math.pow(smoothing, dt)); },
  dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  dist(x1, y1, x2, y2) { return Math.sqrt(U.dist2(x1, y1, x2, y2)); },
  angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },
  fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  },
  fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return Math.round(n).toLocaleString();
  },
};

// ---------------------------------------------------------------------------
// Spatial hash for broad-phase collision. Rebuilt each frame for enemies.
// Entities need .x .y .r
// ---------------------------------------------------------------------------
class SpatialHash {
  constructor(cellSize) {
    this.cs = cellSize;
    this.map = new Map();
  }
  clear() { this.map.clear(); }
  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  insert(e) {
    const cs = this.cs;
    const x0 = Math.floor((e.x - e.r) / cs), x1 = Math.floor((e.x + e.r) / cs);
    const y0 = Math.floor((e.y - e.r) / cs), y1 = Math.floor((e.y + e.r) / cs);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = this.key(cx, cy);
      let cell = this.map.get(k);
      if (!cell) { cell = []; this.map.set(k, cell); }
      cell.push(e);
    }
  }
  // gather candidates near circle; caller does precise checks. out is reused.
  query(x, y, r, out) {
    out.length = 0;
    const cs = this.cs;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const cell = this.map.get(this.key(cx, cy));
      if (cell) for (let i = 0; i < cell.length; i++) out.push(cell[i]);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Object pool: alloc() reuses freed objects to avoid GC churn.
// ---------------------------------------------------------------------------
class Pool {
  constructor(factory) {
    this.factory = factory;
    this.stack = [];
  }
  alloc() { return this.stack.length ? this.stack.pop() : this.factory(); }
  free(o) { this.stack.push(o); }
}

// remove index i from array by swapping with last (order not preserved)
function swapRemove(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}
