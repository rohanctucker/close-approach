// To-scale size pictures: the asteroid next to something familiar, drawn at
// the same scale. Seeing it beats reading "142 m".

import { makeRng } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

// axis: which dimension of the reference equals `m` ('w' = length, 'h' = height).
// w/h: shape extents in units of that dimension. Shapes are drawn top-left at (0,0).
const REFS = [
  { m: 4.5, name: 'car', axis: 'w', w: 1, h: 0.34, draw: (g) => {
    path(g, 'M0,0.25 L0.05,0.14 L0.25,0.12 L0.38,0.02 L0.68,0.02 L0.82,0.12 L0.97,0.15 L1,0.25 Z');
    circle(g, 0.22, 0.27, 0.065);
    circle(g, 0.78, 0.27, 0.065);
  } },
  { m: 12, name: 'school bus', axis: 'w', w: 1, h: 0.29, draw: (g) => {
    path(g, 'M0,0.02 L0.96,0.02 L1,0.06 L1,0.23 L0,0.23 Z');
    for (let i = 0; i < 6; i++) path(g, `M${0.08 + i * 0.13},0.06 h0.09 v0.06 h-0.09 Z`, true);
    circle(g, 0.18, 0.25, 0.04);
    circle(g, 0.8, 0.25, 0.04);
  } },
  { m: 25, name: 'blue whale', axis: 'w', w: 1, h: 0.22, draw: (g) => {
    path(g, 'M0,0.12 C0.05,0.02 0.45,0 0.7,0.08 C0.8,0.1 0.85,0.12 0.88,0.11 L1,0.02 L0.95,0.12 L1,0.2 L0.88,0.14 C0.7,0.2 0.3,0.22 0.05,0.17 Z');
  } },
  { m: 93, name: 'Statue of Liberty', axis: 'h', w: 0.32, h: 1, draw: (g) => {
    path(g, 'M0.02,1 L0.30,1 L0.26,0.55 L0.06,0.55 Z');
    path(g, 'M0.11,0.55 L0.21,0.55 L0.19,0.3 L0.21,0.22 L0.16,0.16 L0.12,0.22 L0.13,0.3 Z');
    path(g, 'M0.19,0.24 L0.24,0.05 L0.26,0.05 L0.22,0.25 Z');
  } },
  { m: 110, name: 'football field', axis: 'w', w: 1, h: 0.45, draw: (g) => {
    path(g, 'M0,0 H1 V0.45 H0 Z');
    path(g, 'M0.09,0 V0.45 M0.5,0 V0.45 M0.91,0 V0.45', true);
  } },
  { m: 330, name: 'Eiffel Tower', axis: 'h', w: 0.38, h: 1, draw: (g) => {
    path(g, 'M0,1 L0.12,0.62 L0.16,0.35 L0.185,0.05 L0.19,0 L0.195,0.05 L0.22,0.35 L0.26,0.62 L0.38,1 L0.29,1 C0.26,0.82 0.12,0.82 0.09,1 Z');
    path(g, 'M0.1,0.62 H0.28 M0.15,0.35 H0.23', true);
  } },
  { m: 443, name: 'Empire State Building', axis: 'h', w: 0.22, h: 1, draw: (g) => {
    path(g, 'M0,1 L0,0.45 L0.03,0.45 L0.03,0.32 L0.06,0.32 L0.06,0.22 L0.09,0.22 L0.10,0.12 L0.11,0 L0.12,0.12 L0.13,0.22 L0.16,0.22 L0.16,0.32 L0.19,0.32 L0.19,0.45 L0.22,0.45 L0.22,1 Z');
  } },
  { m: 828, name: 'Burj Khalifa', axis: 'h', w: 0.16, h: 1, draw: (g) => {
    path(g, 'M0,1 L0.02,0.7 L0.04,0.7 L0.05,0.45 L0.065,0.45 L0.07,0.25 L0.077,0.1 L0.08,0 L0.083,0.1 L0.09,0.25 L0.095,0.45 L0.11,0.45 L0.12,0.7 L0.14,0.7 L0.16,1 Z');
  } },
  { m: 4000, name: 'Central Park', axis: 'w', w: 1, h: 0.2, draw: (g) => {
    path(g, 'M0,0 H1 V0.2 H0 Z');
    for (let i = 0; i < 9; i++) circle(g, 0.06 + i * 0.11, 0.1, 0.025, true);
  } },
  { m: 8849, name: 'Mount Everest', axis: 'h', w: 3, h: 1, draw: (g) => {
    path(g, 'M0,1 L0.9,0.35 L1.2,0.45 L1.55,0 L2.0,0.4 L2.3,0.3 L3,1 Z');
    path(g, 'M1.38,0.22 L1.55,0 L1.74,0.2 L1.62,0.16 L1.55,0.21 L1.46,0.17 Z', true);
  } },
];

function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function path(g, d, detail = false) {
  g.append(el('path', { d, class: detail ? 'ref-detail' : 'ref-shape' }));
}
function circle(g, cx, cy, r, detail = false) {
  g.append(el('circle', { cx, cy, r, class: detail ? 'ref-detail' : 'ref-shape' }));
}

// Same rule as the written comparison: the largest reference not much bigger than the rock.
export function refFor(d) {
  let ref = REFS[0];
  for (const r of REFS) if (r.m <= d * 1.3) ref = r;
  return ref;
}

export function scaleSvg(o, { kind = 'real', w = 132, h = 62 } = {}) {
  const ref = refFor(o.d);
  const unitM = ref.m; // meters per shape unit
  const refW = ref.w * unitM;
  const refH = ref.h * unitM;
  const ground = h - 12; // room for the label underneath
  const gap = 10;
  const s = Math.min((ground - 6) / Math.max(refH, o.d), (w - 8 - gap) / (refW + o.d)); // px per meter
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'scale', role: 'img', 'aria-label': `${Math.round(o.d)} meter asteroid next to ${ref.name}` });
  svg.append(el('line', { x1: 0, y1: ground, x2: w, y2: ground, class: 'ref-ground' }));
  const g = el('g', { transform: `translate(4 ${ground - refH * s}) scale(${unitM * s})`, class: 'ref' });
  ref.draw(g);
  svg.append(g);
  const lbl = el('text', { x: 4, y: h - 2, class: 'ref-label' });
  lbl.textContent = ref.name.toUpperCase();
  svg.append(lbl);
  // Asteroid: lumpy outline, true diameter at the same scale (never smaller than 2.5 px).
  const dpx = Math.max(2.5, o.d * s);
  const cx = 4 + refW * s + gap + dpx / 2;
  const cy = ground - dpx / 2;
  const rng = makeRng(`${o.id}${o.t}`);
  const n = 11;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = (dpx / 2) * (0.78 + rng() * 0.22);
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)} `;
  }
  svg.append(el('path', { d: `${d}Z`, class: `rock ${kind}` }));
  return svg;
}
