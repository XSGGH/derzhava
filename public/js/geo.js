// ===== Геометрия карты: релаксированная диаграмма Вороного + органичные границы =====
import Delaunator from './vendor/delaunator.js';
import { makeRng } from './rng.js';

export const MW = 1000, MH = 640;
const STEP = 34;
// [x, y (в гекс-единицах 34×22), радиус, глубина]
const SEAS = [[5.6, 13.2, 1.7, 1.0], [20.6, 20.6, 2.2, 1.5], [11.6, 13.6, 1.4, 1.1], [24.5, 13.5, 0.9, 0.7], [16.5, 0.6, 2.0, 0.9], [27.8, 7.4, 1.4, 0.9], [11.2, 10.8, 1.0, 0.8], [30.5, 19.8, 1.8, 0.9], [2, 3, 2.2, 0.8], [33, 1, 2.5, 0.8], [13, 21.5, 1.6, 0.8]];

function valueNoise(rng, cell) {
  const gw = Math.ceil(MW / cell) + 3, gh = Math.ceil(MH / cell) + 3;
  const g = Array.from({ length: gw * gh }, () => rng());
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const v = (i, j) => g[((j + gh) % gh) * gw + ((i + gw) % gw)];
    const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * s(tx);
    const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
}

function triangulate(pts) {
  const d = Delaunator.from(pts);
  const n = pts.length;
  const inedge = new Int32Array(n).fill(-1);
  for (let e = 0; e < d.triangles.length; e++) {
    const p = d.triangles[e % 3 === 2 ? e - 2 : e + 1];
    if (d.halfedges[e] === -1 || inedge[p] === -1) inedge[p] = e;
  }
  const centers = [];
  for (let t = 0; t < d.triangles.length / 3; t++) {
    const [a, b, c] = [d.triangles[3 * t], d.triangles[3 * t + 1], d.triangles[3 * t + 2]].map((i) => pts[i]);
    const dx = b[0] - a[0], dy = b[1] - a[1], ex = c[0] - a[0], ey = c[1] - a[1];
    const bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, dd = 0.5 / (dx * ey - dy * ex || 1e-9);
    centers.push([a[0] + (ey * bl - dy * cl) * dd, a[1] + (dx * cl - ex * bl) * dd]);
  }
  const cell = (i) => {
    const start = inedge[i]; if (start === -1) return null;
    const poly = [], nb = []; let e = start;
    do {
      poly.push(centers[Math.floor(e / 3)]); nb.push(d.triangles[e]);
      const nx = e % 3 === 2 ? e - 2 : e + 1; e = d.halfedges[nx];
      if (e === -1) return null;
    } while (e !== start);
    return { poly, nb };
  };
  return { cell };
}

// capitals: [{x, y, size}]
export function buildGeometry(seed, capitals) {
  const rng = makeRng(seed);
  let pts = [];
  for (let y = STEP / 2; y < MH; y += STEP * 0.87) for (let x = STEP / 2; x < MW; x += STEP) pts.push([x + (rng() - 0.5) * STEP * 0.8, y + (rng() - 0.5) * STEP * 0.8]);
  const real = pts.length;
  const ring = [];
  for (let x = -STEP; x <= MW + STEP; x += STEP) ring.push([x, -STEP * 1.5], [x, MH + STEP * 1.5]);
  for (let y = 0; y <= MH; y += STEP) ring.push([-STEP * 1.5, y], [MW + STEP * 1.5, y]);
  // две итерации релаксации Ллойда — ровные, но живые ячейки
  for (let it = 0; it < 2; it++) {
    const T = triangulate(pts.concat(ring));
    pts = pts.map((p, i) => {
      const c = T.cell(i); if (!c) return p;
      let cx = 0, cy = 0; for (const q of c.poly) { cx += q[0]; cy += q[1]; }
      return [Math.min(MW - 4, Math.max(4, cx / c.poly.length)), Math.min(MH - 4, Math.max(4, cy / c.poly.length))];
    });
  }
  const T = triangulate(pts.concat(ring));
  const n1 = valueNoise(rng, 150), n2 = valueNoise(rng, 70), n3 = valueNoise(rng, 35);
  const cells = [];
  for (let i = 0; i < real; i++) {
    const [x, y] = pts[i];
    const c = T.cell(i);
    let land = 0.45 * n1(x, y) + 0.35 * n2(x, y) + 0.22 * n3(x, y) - 0.3;
    for (const k of capitals) {
      const d = Math.hypot(x - k.x, y - k.y) / 29.4; const sg = 1.9 + 2.1 * k.size;
      land += 0.72 * Math.exp(-(d * d) / (2 * sg * sg));
    }
    // моря и заливы
    for (const [sx, sy, r, a] of SEAS) {
      const d = Math.hypot(x - sx * 29.4, y - sy * 29.1);
      land -= a * Math.exp(-(d * d) / (2 * (r * 29.4) ** 2));
    }
    const edge = Math.min(x, MW - x, y, MH - y) / STEP;
    if (edge < 2.6) land -= (2.6 - edge) * 0.3;
    cells.push({ x, y, poly: c ? c.poly : null, nb: c ? c.nb.filter((j) => j < real) : [], landScore: land });
  }
  return { cells, n2, n3 };
}

// --- органичные рёбра: детерминированное смещение середины, одинаковое для обеих соседних ячеек ---
const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const edgeCache = new Map();
export function wiggle(a, b, rough = 0.2) {
  const ka = key(a), kb = key(b), flip = ka > kb, k = flip ? kb + '|' + ka : ka + '|' + kb;
  let pts = edgeCache.get(k);
  if (!pts) {
    const r = makeRng(hash(k));
    const [p, q] = flip ? [b, a] : [a, b];
    let seg = [p, q];
    for (let lvl = 0, amp = rough; lvl < 3; lvl++, amp *= 0.55) {
      const out = [seg[0]];
      for (let i = 0; i < seg.length - 1; i++) {
        const s = seg[i], t = seg[i + 1], dx = t[0] - s[0], dy = t[1] - s[1];
        const off = (r() - 0.5) * 2 * amp;
        out.push([(s[0] + t[0]) / 2 - dy * off, (s[1] + t[1]) / 2 + dx * off], t);
      }
      seg = out;
    }
    pts = seg; edgeCache.set(k, pts);
  }
  return flip ? [...pts].reverse() : pts;
}
export function cellPath(poly) {
  let d = '';
  for (let i = 0; i < poly.length; i++) {
    const seg = wiggle(poly[i], poly[(i + 1) % poly.length]);
    for (let j = i === 0 ? 0 : 1; j < seg.length; j++) d += (j === 0 && i === 0 ? 'M' : 'L') + seg[j][0].toFixed(1) + ' ' + seg[j][1].toFixed(1);
  }
  return d + 'Z';
}
export function edgePath(a, b) {
  const seg = wiggle(a, b);
  return 'M' + seg.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
}
// общее ребро двух ячеек (две общие вершины)
export function sharedEdge(pa, pb) {
  const kb = new Set(pb.map(key));
  const sh = []; for (let i = 0; i < pa.length; i++) if (kb.has(key(pa[i]))) sh.push(i);
  if (sh.length < 2) return null;
  let [i, j] = sh; if (i === 0 && j === pa.length - 1) [i, j] = [j, i];
  return [pa[i], pa[(i + 1) % pa.length]];
}
