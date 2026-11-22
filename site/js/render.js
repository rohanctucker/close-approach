// Drawing: retro-vector look built from double strokes (a wide faint pass plus
// a thin bright pass) instead of canvas shadowBlur, which is slow on phones.

import { TAU, makeRng, fx, label, fmtDiameter, fmtLD } from './util.js';

export const C = {
  bg0: '#04030b',
  bg1: '#0b0820',
  bg2: '#1d0f36',
  cyan: '#3df5ff',
  magenta: '#ff3dbb',
  amber: '#ffb23d',
  red: '#ff3d5e',
  violet: '#8a7fd6',
  white: '#f4f1ff',
  ink: '#0d0a1c',
};

export function glowStroke(ctx, color, width, unit) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = width * 4 * unit;
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = width * 2 * unit;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width * unit;
  ctx.stroke();
}

function glowStrokeAlpha(ctx, color, width, unit, a) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.16 * a;
  ctx.lineWidth = width * 4 * unit;
  ctx.stroke();
  ctx.globalAlpha = 0.35 * a;
  ctx.lineWidth = width * 2 * unit;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.lineWidth = width * unit;
  ctx.stroke();
}

export function makeBackground(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(0.55, C.bg1);
  grad.addColorStop(1, C.bg2);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const rng = makeRng('nebula');
  for (let i = 0; i < 5; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.8;
    const r = (0.3 + rng() * 0.5) * Math.max(w, h);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const col = i % 2 ? '255,61,187' : '61,120,255';
    rg.addColorStop(0, `rgba(${col},0.07)`);
    rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }
  return c;
}

export class Starfield {
  constructor() {
    this.layers = [];
  }
  resize(w, h) {
    const rng = makeRng('stars');
    const area = (w * h) / 1000;
    this.layers = [
      { speed: 6, size: 0.8, alpha: 0.45, stars: [] },
      { speed: 16, size: 1.2, alpha: 0.7, stars: [] },
      { speed: 40, size: 1.7, alpha: 0.95, stars: [] },
    ];
    this.layers.forEach((L, i) => {
      const n = Math.round(area * [0.35, 0.16, 0.05][i]);
      for (let k = 0; k < n; k++) L.stars.push({ x: rng() * w, y: rng() * h, tw: rng() * TAU });
    });
    this.w = w;
    this.h = h;
  }
  update(dt, unit, warp) {
    for (const L of this.layers) {
      const v = L.speed * unit * (1 + warp * 14);
      for (const s of L.stars) {
        s.y += v * dt;
        s.tw += dt * 2;
        if (s.y > this.h) {
          s.y -= this.h;
          s.x = fx() * this.w;
        }
      }
    }
  }
  draw(ctx, unit, warp) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = C.white;
    ctx.strokeStyle = C.white;
    for (const L of this.layers) {
      const len = warp > 0.05 ? L.speed * unit * warp * 1.6 : 0;
      for (const s of L.stars) {
        const a = L.alpha * (0.75 + 0.25 * Math.sin(s.tw));
        ctx.globalAlpha = a;
        if (len > 1) {
          ctx.lineWidth = L.size * unit;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x, s.y - len);
          ctx.stroke();
        } else ctx.fillRect(s.x, s.y, L.size * unit, L.size * unit);
      }
    }
    ctx.restore();
  }
}

export function shieldColor(shield) {
  if (shield > 60) return C.cyan;
  if (shield > 30) return C.amber;
  return C.red;
}

// Earth's limb at the bottom of the screen, drawn as a spinning wireframe globe.
export function drawEarth(ctx, g, t) {
  const { W, earthY, unit } = g;
  const R = W * 1.25;
  const cx = W / 2;
  const cy = earthY + R;
  const col = shieldColor(g.shield);
  const flick = g.shieldFlash > 0 ? 0.5 + 0.5 * Math.sin(t * 60) : 1;

  ctx.save();
  // Atmosphere halo
  const halo = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R + 60 * unit);
  halo.addColorStop(0, hexA(col, 0.28 * flick));
  halo.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 60 * unit, 0, TAU);
  ctx.fill();

  // Planet body
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  const body = ctx.createLinearGradient(0, earthY, 0, earthY + 120 * unit);
  body.addColorStop(0, '#0d1d44');
  body.addColorStop(1, '#03050e');
  ctx.fillStyle = body;
  ctx.fill();

  // Wireframe grid
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1 * unit;
  const spin = t * 0.05;
  for (let k = -24; k <= 24; k++) {
    const a = k * 0.13 + (spin % 0.13);
    if (Math.abs(a) > Math.PI / 2) continue;
    const rx = Math.abs(Math.sin(a)) * R;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 0.5), R, 0, Math.PI, TAU);
    ctx.stroke();
  }
  let r = R;
  for (let j = 1; j < 9; j++) {
    r -= (5 + j * j * 1.6) * unit;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Limb line = the shield
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 1.05, Math.PI * 1.95);
  ctx.globalAlpha = flick;
  glowStroke(ctx, col, 1.6, unit);
  ctx.restore();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- ship ----------

const SHIP = [
  [0, -16],
  [5, -4],
  [13, 8],
  [5, 6],
  [3, 10],
  [-3, 10],
  [-5, 6],
  [-13, 8],
  [-5, -4],
];

export function drawShip(ctx, p, unit, t) {
  if (p.inv > 0 && Math.floor(t * 16) % 2 === 0) return;
  const s = unit;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.tilt * 0.35);

  // Engine flame
  ctx.globalCompositeOperation = 'lighter';
  const fl = (12 + fx() * 8) * s;
  ctx.beginPath();
  ctx.moveTo(-3 * s, 10 * s);
  ctx.lineTo(0, 10 * s + fl);
  ctx.lineTo(3 * s, 10 * s);
  ctx.fillStyle = hexA(C.magenta, 0.85);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1.5 * s, 10 * s);
  ctx.lineTo(0, 10 * s + fl * 0.55);
  ctx.lineTo(1.5 * s, 10 * s);
  ctx.fillStyle = C.amber;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.beginPath();
  SHIP.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  const body = ctx.createLinearGradient(0, -16 * s, 0, 10 * s);
  body.addColorStop(0, '#d9e6ff');
  body.addColorStop(0.35, '#5a6aa8');
  body.addColorStop(1, '#151a33');
  ctx.fillStyle = body;
  ctx.fill();
  glowStroke(ctx, C.cyan, 1.2, unit);

  // Cockpit + wingtips
  ctx.beginPath();
  ctx.moveTo(0, -9 * s);
  ctx.lineTo(2.2 * s, -2 * s);
  ctx.lineTo(-2.2 * s, -2 * s);
  ctx.closePath();
  ctx.fillStyle = C.magenta;
  ctx.fill();
  ctx.fillStyle = C.amber;
  ctx.fillRect(12 * s, 7 * s, 2 * s, 2 * s);
  ctx.fillRect(-14 * s, 7 * s, 2 * s, 2 * s);

  if (p.spreadT > 0 || p.rapidT > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 22 * s + Math.sin(t * 8) * 2 * s, 0, TAU);
    ctx.globalAlpha = 0.5;
    glowStroke(ctx, p.spreadT > 0 ? C.magenta : C.amber, 0.8, unit);
  }
  ctx.restore();
}

// ---------- rocks ----------

export function rockShape(rng) {
  const n = 9 + Math.floor(rng() * 5);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(0.72 + rng() * 0.28);
  return pts;
}

function rockPath(ctx, rock, scale = 1) {
  const n = rock.pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = rock.r * rock.pts[i] * scale;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export function rockColor(rock) {
  if (rock.kind === 'boss') return C.red;
  if (rock.kind === 'real') return C.amber;
  return C.violet;
}

export function drawRock(ctx, rock, unit, t, showLabels) {
  const col = rock.flash > 0 ? C.white : rockColor(rock);
  ctx.save();
  ctx.translate(rock.x, rock.y);

  if (rock.kind === 'boss') {
    ctx.save();
    ctx.rotate(t * 0.6);
    ctx.setLineDash([6 * unit, 7 * unit]);
    ctx.beginPath();
    ctx.arc(0, 0, rock.r * 1.35 + Math.sin(t * 5) * 2 * unit, 0, TAU);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 1.2 * unit;
    ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(rock.rot);
  rockPath(ctx, rock);
  ctx.fillStyle = C.ink;
  ctx.fill();
  glowStroke(ctx, col, rock.kind === 'debris' ? 1.1 : 1.6, unit);
  if (rock.kind !== 'debris') {
    rockPath(ctx, rock, 0.55);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1 * unit;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (showLabels && rock.obj) drawRockLabel(ctx, rock, unit);
}

function drawRockLabel(ctx, rock, unit) {
  const o = rock.obj;
  const x = rock.x;
  let y = rock.y + rock.r + 14 * unit;
  const col = rockColor(rock);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (rock.max > 1 && rock.hp < rock.max) {
    const w = rock.r * 1.6;
    ctx.fillStyle = hexA(col, 0.25);
    ctx.fillRect(x - w / 2, rock.y - rock.r - 9 * unit, w, 2 * unit);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, rock.y - rock.r - 9 * unit, (w * rock.hp) / rock.max, 2 * unit);
  }
  ctx.font = `${Math.round(15 * unit)}px VT323, monospace`;
  ctx.fillStyle = col;
  ctx.fillText(label(o), x, y);
  y += 12 * unit;
  ctx.font = `${Math.round(12 * unit)}px VT323, monospace`;
  ctx.globalAlpha = 0.75;
  const extra = rock.mode === 'today' ? fmtLD(o.ld) : o.t.slice(0, 4);
  ctx.fillText(`${fmtDiameter(o)} · ${extra}`, x, y);
  if (rock.kind === 'boss') {
    y += 11 * unit;
    ctx.fillStyle = C.red;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 120);
    ctx.fillText(o.pha ? 'POTENTIALLY HAZARDOUS' : rock.mode === 'today' ? 'CLOSEST FLYBY TODAY' : 'FINAL TARGET', x, y);
  }
  ctx.restore();
}

// ---------- effects ----------

export function drawBullets(ctx, bullets, unit) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of bullets) {
    ctx.globalAlpha = b.max ? Math.min(1, (b.life / b.max) * 3) : 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
    const a = ctx.globalAlpha;
    glowStrokeAlpha(ctx, b.color || C.cyan, 1.4, unit, a);
  }
  ctx.restore();
}

export function drawParticles(ctx, g) {
  const { unit } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const p of g.sparks) {
    const k = p.life / p.max;
    ctx.globalAlpha = k;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = (p.w || 1.4) * unit;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
    ctx.stroke();
  }
  for (const r of g.rings) {
    const k = r.life / r.max;
    ctx.globalAlpha = k * 0.9;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2 * unit * k + 0.5;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  for (const f of g.floaters) {
    const k = f.life / f.max;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = `${Math.round((f.size || 18) * unit)}px VT323, monospace`;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

export function drawDrops(ctx, drops, unit, t) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of drops) {
    const col = d.type === 'shield' ? C.cyan : d.type === 'spread' ? C.magenta : C.amber;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.sin(t * 3 + d.x) * 0.3);
    ctx.beginPath();
    const s = 10 * unit;
    ctx.moveTo(0, -s);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    glowStroke(ctx, col, 1.2, unit);
    ctx.fillStyle = col;
    ctx.font = `${Math.round(13 * unit)}px VT323, monospace`;
    ctx.fillText(d.type === 'shield' ? 'S' : d.type === 'spread' ? 'W' : 'R', 0, 1 * unit);
    ctx.restore();
  }
  ctx.restore();
}
