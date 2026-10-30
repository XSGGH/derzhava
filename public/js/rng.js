// Детерминированный генератор случайных чисел (xorshift32) — состояние сохраняется вместе с игрой
let s = 123456789;
export function seedRng(v) { s = (v >>> 0) || 1; }
export function getRng() { return s; }
export function rnd() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
export const rr = (a, b) => a + (b - a) * rnd();
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = (a) => a[Math.floor(rnd() * a.length)];
export const chance = (p) => rnd() < p;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

// Отдельный генератор для карты (не трогает игровой)
export function makeRng(seed) {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
