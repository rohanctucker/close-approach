// Small helpers shared across the game.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Deterministic RNG so everyone gets the same sky on the same day.
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function makeRng(seed) {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

export const fx = Math.random; // cosmetic randomness only

// ---------- formatting ----------

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function fmtDate(isoOrDate, withTime = false) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  const s = `${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return s;
  return `${s} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function fmtDiameter(o) {
  const d = o.d;
  const approx = o.dEst ? '≈' : '';
  if (d >= 1000) return `${approx}${(d / 1000).toFixed(d >= 10000 ? 0 : 1)} km`;
  return `${approx}${Math.round(d)} m`;
}

export function fmtLD(ld) {
  if (ld < 0.1) return `${(ld * 384400).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
  return `${ld < 10 ? ld.toFixed(1) : Math.round(ld)} LD`;
}

export function fmtSpeed(v) {
  return `${v.toFixed(1)} km/s`;
}

export function label(o) {
  if (o.name) return o.name.toUpperCase();
  return o.des || o.id || 'UNKNOWN';
}

export function subLabel(o) {
  if (o.name && o.des) return o.des;
  if (o.num) return `#${o.num}`;
  return '';
}

export const fmtScore = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function isPast(o, now = Date.now()) {
  return Date.parse(o.t) < now;
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(`ca:${key}`));
    localStorage.setItem(`ca:${key}`, JSON.stringify(value));
  } catch {
    return null;
  }
  return value;
}
