// Game state, waves, entities and collisions.

import { clamp, makeRng, fx, TAU } from './util.js';
import { intelBonus } from './learn.js';
import { fmtDiameter } from './util.js';
import { C, Starfield, makeBackground, drawEarth, drawShip, drawRock, rockShape, drawBullets, drawParticles, drawDrops, drawRadar } from './render.js';
import { refFor } from './scale.js';
import { impactShort } from './learn.js';

const log10 = Math.log10;

export class Game {
  constructor(canvas, sound, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sound = sound;
    this.ui = ui;
    this.stars = new Starfield();
    this.state = 'idle'; // idle | attract | play | over
    this.t = 0;
    this.input = { active: false, tx: 0, ty: 0, keys: new Set() };
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.reset();
  }

  // ---------- setup ----------

  resize(w, h, dpr, insets = { top: 0, bottom: 0 }) {
    const sx = this.W ? w / this.W : 1;
    const sy = this.H ? h / this.H : 1;
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.unit = Math.min(w, 520) / 400;
    this.insets = insets;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.bg = makeBackground(w, h, dpr);
    this.stars.resize(w, h);
    this.earthY = h - insets.bottom - 46 * this.unit;
    this.shipMinY = h * 0.38;
    this.shipMaxY = this.earthY - 30 * this.unit;
    if (this.player) {
      this.player.x = clamp(this.player.x * sx, 0, w);
      this.player.y = clamp(this.player.y * sy, this.shipMinY, this.shipMaxY);
    }
  }

  reset() {
    this.rocks = [];
    this.bullets = [];
    this.sparks = [];
    this.rings = [];
    this.floaters = [];
    this.drops = [];
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.shield = 100;
    this.shieldFlash = 0;
    this.shake = 0;
    this.warp = 0;
    this.waves = [];
    this.waveIdx = -1;
    this.queue = [];
    this.waveT = 0;
    this.phase = 'none';
    this.results = [];
    this.kills = { debris: 0, real: 0 };
    this.shots = 0;
    this.hits = 0;
    this.intel = { correct: 0, total: 0, streak: 0 };
    this.startedAt = performance.now();
  }

  // Intel Check answers feed the score, so learning moves you up the leaderboard.
  answerIntel(correct) {
    this.intel.total++;
    let bonus = 0;
    if (correct) {
      this.intel.correct++;
      this.intel.streak++;
      bonus = intelBonus(this.intel.streak);
      this.score += bonus;
    } else this.intel.streak = 0;
    this.emitHud();
    return bonus;
  }

  attract(objects) {
    this.reset();
    this.state = 'attract';
    this.player = null;
    this.attractObjs = objects || [];
    this.attractT = 0;
    this.attractIdx = 0;
    this.mode = 'today';
  }

  start(mode, dataset, objects, seed) {
    this.reset();
    this.state = 'play';
    this.mode = mode;
    this.dataset = dataset;
    this.rng = makeRng(seed);
    this.player = { x: this.W / 2, y: this.shipMaxY - 20 * this.unit, r: 10 * this.unit, hull: 3, inv: 1.5, fireT: 0, spreadT: 0, rapidT: 0, tilt: 0 };
    this.input.tx = this.player.x;
    this.input.ty = this.player.y;
    this.results = objects.map((o) => ({ o, status: 'pending' }));
    this.buildWaves();
    this.nextWave();
    this.emitHud();
  }

  buildWaves() {
    const list = this.results.map((r, idx) => ({ ...r, idx }));
    // Today: farthest first, closest flyby is the finale. Archives: in time order.
    if (this.mode === 'today') list.sort((a, b) => b.o.au - a.o.au);
    const n = list.length;
    const waveCount = clamp(n, 3, 7);
    const per = Math.max(1, Math.ceil(n / waveCount));
    for (let i = 0; i < n; i += per) this.waves.push({ heads: list.slice(i, i + per) });
    if (!this.waves.length) this.waves.push({ heads: [] });
    this.waves.forEach((w, i) => {
      w.debris = 12 + i * 4 + (per === 1 ? 3 : 0);
      w.speed = 1 + i * 0.07;
    });
    const last = this.waves[this.waves.length - 1].heads;
    if (last.length) last[last.length - 1].boss = true;
    for (const w of this.waves) for (const h of w.heads) if (h.o.pha || (this.mode === 'legends' && h.o.d > 300)) h.boss = true;
  }

  nextWave() {
    this.waveIdx++;
    if (this.waveIdx >= this.waves.length) return this.finish(true);
    const w = this.waves[this.waveIdx];
    w.escapes = 0;
    const R = this.rng;
    const span = Math.max(7, w.heads.length * 3.2 + 4);
    const q = [];
    w.heads.forEach((h, k) => q.push({ at: 0.8 + k * 3.2 + R() * 0.6, head: h, x: R.range(0.18, 0.82) }));
    for (let k = 0; k < w.debris; k++) q.push({ at: R() * span, x: R.range(0.06, 0.94), size: R(), speed: R(), drift: R.range(-1, 1) });
    q.sort((a, b) => a.at - b.at);
    this.queue = q;
    this.waveT = -2.4; // banner time before spawns
    this.phase = 'banner';
    this.warp = 1;
    this.ui.wave(this.waveIdx, this.waves.length, w.heads.map((h) => h.o), this.mode);
    this.sound.wave();
    if (w.heads.some((h) => h.boss)) setTimeout(() => this.state === 'play' && this.sound.alarm(), 900);
  }

  // ---------- spawning ----------

  spawnHead(item) {
    const { head } = item;
    const o = head.o;
    const u = this.unit;
    const boss = !!head.boss;
    const sz = log10(Math.max(o.d, 2) / 10);
    // Size and toughness come only from the real diameter, so "bigger = more hits" always holds.
    const r = clamp(13 + 9 * sz, 14, 42) * u;
    const hp = Math.round(clamp(5 + 5 * sz, 5, 22));
    // Fall speed comes only from the real speed relative to Earth (not the wave number).
    const vy = (34 + clamp(o.v, 3, 45) * 2.6) * u;
    this.results[head.idx].spawned = true;
    this.rocks.push({
      kind: boss ? 'boss' : 'real',
      obj: o,
      idx: head.idx,
      mode: this.mode,
      x: clamp(item.x * this.W, r + 8, this.W - r - 8),
      y: -r - 40 * u,
      vx: (fx() - 0.5) * 18 * u,
      vy,
      r,
      hp,
      max: hp,
      rot: fx() * TAU,
      vr: (fx() - 0.5) * 0.8,
      pts: rockShape(makeRng(o.id + o.t)),
      flash: 0,
      shedT: 2.5,
      wob: fx() * TAU,
      wobA: (6 + fx() * 10) * u,
    });
  }

  spawnDebris(item) {
    const u = this.unit;
    const r = (6 + item.size * 6) * u;
    const sp = this.waves[this.waveIdx]?.speed || 1;
    this.rocks.push({
      kind: 'debris',
      x: item.x * this.W,
      y: -r - 10 * u,
      vx: item.drift * 26 * u,
      vy: (95 + item.speed * 85) * u * sp,
      r,
      hp: 1,
      max: 1,
      rot: fx() * TAU,
      vr: (fx() - 0.5) * 3,
      pts: rockShape(fx),
      flash: 0,
    });
  }

  fragment(rock, count, speed = 1) {
    const u = this.unit;
    for (let i = 0; i < count; i++) {
      const a = Math.PI * 0.15 + (Math.PI * 0.7 * (i + 0.5)) / count;
      const r = (5 + fx() * 4) * u;
      this.rocks.push({
        kind: 'debris',
        x: rock.x,
        y: rock.y,
        vx: Math.cos(a) * 80 * u * speed,
        vy: Math.abs(Math.sin(a)) * 120 * u * speed + 40 * u,
        r,
        hp: 1,
        max: 1,
        rot: fx() * TAU,
        vr: (fx() - 0.5) * 4,
        pts: rockShape(fx),
        flash: 0,
        frag: true,
      });
    }
  }

  // ---------- update ----------

  update(dt) {
    this.t += dt;
    this.warp = Math.max(0, this.warp - dt * 0.9);
    this.stars.update(dt, this.unit, this.warp * this.warp);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);

    if (this.state === 'attract') this.updateAttract(dt);
    if (this.state === 'play') this.updatePlay(dt);
    this.updateEntities(dt);
  }

  updateAttract(dt) {
    this.attractT -= dt;
    if (this.attractT <= 0) {
      this.attractT = 2.2;
      const objs = this.attractObjs;
      const u = this.unit;
      if (objs.length && this.rocks.filter((r) => r.obj).length < 3) {
        const o = objs[this.attractIdx++ % objs.length];
        const r = clamp(13 + 9 * log10(Math.max(o.d, 2) / 10), 14, 34) * u;
        this.rocks.push({ kind: o.pha ? 'boss' : 'real', obj: o, mode: 'today', x: (0.2 + fx() * 0.6) * this.W, y: -r - 30 * u, vx: (fx() - 0.5) * 10 * u, vy: 26 * u, r, hp: 1, max: 1, rot: 0, vr: (fx() - 0.5) * 0.5, pts: rockShape(makeRng(o.id + o.t)), flash: 0 });
      }
      for (let i = 0; i < 2; i++) this.spawnDebris({ x: fx(), size: fx() * 0.6, speed: 0, drift: (fx() - 0.5) * 0.4 });
      this.rocks.forEach((r) => r.kind === 'debris' && r.vy > 60 * u && (r.vy *= 0.45));
    }
  }

  updatePlay(dt) {
    const p = this.player;
    const u = this.unit;

    // Movement: follow the finger (relative drag) or keyboard.
    const k = this.input.keys;
    const kv = 340 * u * dt;
    if (k.has('ArrowLeft') || k.has('a')) this.input.tx -= kv;
    if (k.has('ArrowRight') || k.has('d')) this.input.tx += kv;
    if (k.has('ArrowUp') || k.has('w')) this.input.ty -= kv;
    if (k.has('ArrowDown') || k.has('s')) this.input.ty += kv;
    this.input.tx = clamp(this.input.tx, 14 * u, this.W - 14 * u);
    this.input.ty = clamp(this.input.ty, this.shipMinY, this.shipMaxY);
    const prevX = p.x;
    const follow = Math.min(1, dt * 22);
    p.x += (this.input.tx - p.x) * follow;
    p.y += (this.input.ty - p.y) * follow;
    p.tilt += (clamp((p.x - prevX) / (dt * 600 * u || 1), -1, 1) - p.tilt) * Math.min(1, dt * 10);
    p.inv = Math.max(0, p.inv - dt);
    p.spreadT = Math.max(0, p.spreadT - dt);
    p.rapidT = Math.max(0, p.rapidT - dt);

    // Auto-fire
    p.fireT -= dt;
    if (p.fireT <= 0 && (this.phase === 'live' || this.phase === 'banner')) {
      p.fireT = p.rapidT > 0 ? 0.075 : 0.13;
      const v = 700 * u;
      const life = (this.H * 0.58) / v; // limited range: let them come to you
      const angles = p.spreadT > 0 ? [-0.2, 0, 0.2] : [0];
      for (const a of angles) {
        this.bullets.push({ x: p.x + Math.sin(a) * 6 * u, y: p.y - 16 * u, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, color: p.spreadT > 0 ? C.magenta : C.cyan, life, max: life });
        this.shots++;
      }
      this.sound.laser();
    }

    // Combo decay
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.emitHud();
      }
    }

    // Wave director
    this.waveT += dt;
    if (this.phase === 'banner' && this.waveT >= 0) this.phase = 'live';
    if (this.phase === 'live') {
      while (this.queue.length && this.queue[0].at <= this.waveT) {
        const item = this.queue.shift();
        item.head ? this.spawnHead(item) : this.spawnDebris(item);
      }
      if (!this.queue.length && !this.rocks.length) {
        this.phase = 'cleared';
        const w = this.waves[this.waveIdx];
        const bonus = w.escapes === 0 ? 250 * (this.waveIdx + 1) : 0;
        this.shield = Math.min(100, this.shield + 8); // a little repair between waves
        if (bonus) {
          this.score += bonus;
          this.floaters.push({ x: this.W / 2, y: this.H * 0.42, vy: -20 * u, text: `CLEAN SWEEP +${bonus}`, color: C.cyan, life: 1.8, max: 1.8, size: 24 });
        }
        this.emitHud();
        this.clearT = 1.1;
      }
    }
    if (this.phase === 'cleared') {
      this.clearT -= dt;
      if (this.clearT <= 0) this.openDebrief();
    }
  }

  // After each wave: learn about the real asteroids you just fought.
  openDebrief() {
    this.phase = 'debrief';
    const w = this.waves[this.waveIdx];
    const last = this.waveIdx === this.waves.length - 1;
    const items = w.heads.map((h) => ({ ...this.results[h.idx], boss: !!h.boss }));
    const done = () => {
      if (this.state !== 'play') return;
      last ? this.finish(true) : this.nextWave();
    };
    if (!items.length) return done();
    Promise.resolve(this.ui.debrief({ wave: this.waveIdx, waves: this.waves.length, items, mode: this.mode, last })).then(done);
  }

  updateEntities(dt) {
    const u = this.unit;
    const p = this.player;

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0 && b.y > -30 && b.x > -30 && b.x < this.W + 30);

    for (const r of this.rocks) {
      if (r.wobA) {
        r.wob += dt * 1.3;
        r.x += Math.cos(r.wob) * r.wobA * dt * 1.3;
      }
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.rot += r.vr * dt;
      r.flash = Math.max(0, r.flash - dt);
      if (r.x < r.r && r.vx < 0) r.vx *= -1;
      if (r.x > this.W - r.r && r.vx > 0) r.vx *= -1;

      if (this.state !== 'play') {
        if (r.y - r.r > this.earthY) r.dead = true;
        continue;
      }

      // Hazardous rocks shed fragments
      if (r.kind === 'boss' && r.y > 0) {
        r.shedT -= dt;
        if (r.shedT <= 0) {
          r.shedT = r.hp < r.max / 2 ? 1.1 : 1.8;
          const toward = Math.atan2(p.y - r.y, p.x - r.x);
          const sp = 150 * u;
          this.rocks.push({ kind: 'debris', x: r.x, y: r.y + r.r * 0.6, vx: Math.cos(toward) * sp * 0.6, vy: Math.max(80 * u, Math.sin(toward) * sp), r: 5 * u, hp: 1, max: 1, rot: 0, vr: 4, pts: rockShape(fx), flash: 0, frag: true });
        }
      }

      // Bullets
      for (const b of this.bullets) {
        if (b.dead) continue;
        const dx = b.x - r.x;
        const dy = b.y - r.y;
        if (dx * dx + dy * dy < r.r * r.r * 1.1) {
          b.dead = true;
          this.hits++;
          this.damage(r, 1);
          if (r.dead) break;
        }
      }

      // Ship collision
      if (!r.dead && p && p.inv <= 0) {
        const dx = p.x - r.x;
        const dy = p.y - r.y;
        const rr = p.r + r.r * 0.8;
        if (dx * dx + dy * dy < rr * rr) this.hurtPlayer(r);
      }

      // Slipped past the ship and reached Earth's atmosphere
      if (!r.dead && r.y - r.r * 0.3 > this.earthY) this.escape(r);
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.rocks = this.rocks.filter((r) => !r.dead);

    for (const d of this.drops) {
      d.y += d.vy * dt;
      if (p && this.state === 'play') {
        const dx = p.x - d.x;
        const dy = p.y - d.y;
        if (dx * dx + dy * dy < (p.r + 16 * u) ** 2) this.collect(d);
      }
      if (d.y > this.earthY) d.dead = true;
    }
    this.drops = this.drops.filter((d) => !d.dead);

    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const r of this.rings) {
      r.r += r.vr * dt;
      r.life -= dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of this.floaters) {
      f.y += f.vy * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  // ---------- events ----------

  damage(r, amount) {
    r.hp -= amount;
    r.flash = 0.06;
    if (r.hp > 0) {
      if (r.kind !== 'debris') this.sound.hit();
      this.burst(r.x, r.y + r.r * 0.5, 3, r.kind === 'boss' ? C.red : C.amber, 0.5);
      return;
    }
    r.dead = true;
    const u = this.unit;
    this.combo++;
    this.comboT = 1.8;
    const mult = Math.min(5, 1 + Math.floor(this.combo / 5));
    let pts = 25;
    if (r.kind === 'debris') {
      this.kills.debris++;
      this.burst(r.x, r.y, 8, C.violet, 0.7);
      this.sound.boom(0.15);
    } else {
      const o = r.obj;
      const big = r.kind === 'boss';
      pts = big ? 1500 + Math.round(200 * log10(o.d)) : 300 + Math.round(100 * log10(o.d));
      this.kills.real++;
      Object.assign(this.results[r.idx], { status: 'hit', hits: r.max, boss: big });
      this.burst(r.x, r.y, big ? 46 : 26, big ? C.red : C.amber, big ? 1.6 : 1.1);
      this.rings.push({ x: r.x, y: r.y, r: r.r, vr: 260 * u, life: 0.6, max: 0.6, color: big ? C.red : C.amber });
      this.rings.push({ x: r.x, y: r.y, r: r.r * 0.5, vr: 140 * u, life: 0.8, max: 0.8, color: C.white });
      this.shake = big ? 10 : 5;
      this.sound.boom(big ? 1 : 0.55);
      if (o.d > 120 || big) this.fragment(r, big ? 4 : 2, 0.8);
      if (big || fx() < 0.45) this.drops.push({ x: r.x, y: r.y, vy: 70 * u, type: this.pickDrop() });
      this.ui.kill(o, this.mode);
      // See the scale right where it happened.
      this.floaters.push({ x: r.x, y: r.y + 26 * u, vy: -14 * u, text: `${fmtDiameter(o)} · ${refFor(o.d).name.toUpperCase()}${o.d >= refFor(o.d).m * 1.75 ? ' ×' + Math.round(o.d / refFor(o.d).m) : ''}`, color: C.amber, life: 1.8, max: 1.8, size: 16 });
      if (navigator.vibrate) navigator.vibrate(big ? 60 : 25);
    }
    const gained = pts * mult;
    this.score += gained;
    this.floaters.push({ x: r.x, y: r.y, vy: -40 * u, text: `+${gained}`, color: r.kind === 'debris' ? C.violet : C.white, life: 0.8, max: 0.8, size: r.kind === 'debris' ? 15 : 22 });
    this.emitHud();
  }

  pickDrop() {
    if (this.shield < 60 && fx() < 0.5) return 'shield';
    return fx() < 0.5 ? 'spread' : 'rapid';
  }

  collect(d) {
    d.dead = true;
    const p = this.player;
    const u = this.unit;
    let text = '';
    if (d.type === 'shield') {
      this.shield = Math.min(100, this.shield + 20);
      text = 'SHIELD +20';
    } else if (d.type === 'spread') {
      p.spreadT = 9;
      text = 'WIDE BEAM';
    } else {
      p.rapidT = 9;
      text = 'RAPID FIRE';
    }
    this.floaters.push({ x: p.x, y: p.y - 30 * u, vy: -30 * u, text, color: C.cyan, life: 1.2, max: 1.2, size: 20 });
    this.sound.power();
    this.emitHud();
  }

  hurtPlayer(r) {
    const p = this.player;
    p.hull--;
    p.inv = 2;
    this.shake = 14;
    this.burst(p.x, p.y, 30, C.cyan, 1.2);
    this.rings.push({ x: p.x, y: p.y, r: 10, vr: 300 * this.unit, life: 0.5, max: 0.5, color: C.cyan });
    this.sound.hurt();
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    this.damage(r, r.kind === 'debris' ? 1 : 3);
    this.combo = 0;
    this.emitHud();
    if (p.hull <= 0) this.finish(false, 'hull');
  }

  escape(r) {
    r.dead = true;
    let loss = 1.5; // debris is filler; the real asteroids are what matter
    if (r.kind !== 'debris') {
      loss = r.kind === 'boss' ? 20 : clamp(8 + 2 * log10(r.obj.d / 10), 8, 14);
      Object.assign(this.results[r.idx], { status: 'miss', hits: r.max, boss: r.kind === 'boss' });
      this.ui.escape(r.obj, this.mode);
      this.floaters.push({ x: clamp(r.x, 120 * this.unit, this.W - 120 * this.unit), y: this.earthY - 18 * this.unit, vy: -18 * this.unit, text: impactShort(r.obj), color: C.red, life: 2.2, max: 2.2, size: 18 });
      this.sound.slip();
    }
    if (this.waves[this.waveIdx]) this.waves[this.waveIdx].escapes++;
    this.shield = Math.max(0, this.shield - loss);
    this.shieldFlash = 0.5;
    this.shake = Math.max(this.shake, r.kind === 'debris' ? 3 : 8);
    this.burst(r.x, this.earthY, r.kind === 'debris' ? 6 : 20, C.red, 0.8);
    this.combo = 0;
    this.emitHud();
    if (this.shield <= 0) this.finish(false, 'shield');
  }

  burst(x, y, n, color, power = 1) {
    const u = this.unit;
    for (let i = 0; i < n; i++) {
      const a = fx() * TAU;
      const s = (60 + fx() * 260) * u * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + fx() * 0.5, max: 0.8, color: fx() < 0.25 ? C.white : color, w: 1 + fx() * 1.4 });
    }
  }

  finish(win, reason) {
    if (this.state !== 'play') return;
    this.state = 'over';
    const p = this.player;
    let bonus = 0;
    if (win) bonus = Math.round(this.shield * 20 + p.hull * 500);
    this.score += bonus;
    if (!win) {
      this.burst(p.x, p.y, 40, C.cyan, 1.4);
      this.player = null;
    }
    this.sound.end(win);
    this.emitHud();
    const summary = {
      win,
      reason,
      score: this.score,
      bonus,
      results: this.results,
      shield: this.shield,
      hull: p.hull,
      accuracy: this.shots ? this.hits / this.shots : 0,
      intel: { ...this.intel },
      waves: this.waveIdx + (win ? 0 : 1),
      duration: Math.round((performance.now() - this.startedAt) / 1000),
    };
    setTimeout(() => this.ui.end(summary), win ? 900 : 1300);
  }

  emitHud() {
    this.ui.hud({
      score: this.score,
      wave: this.waveIdx + 1,
      waves: this.waves.length,
      hull: this.player ? this.player.hull : 0,
      shield: Math.round(this.shield),
      mult: Math.min(5, 1 + Math.floor(this.combo / 5)),
      combo: this.combo,
    });
  }

  // ---------- render ----------

  render() {
    const { ctx, dpr, unit } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.bg, 0, 0, this.W, this.H);
    const shake = this.reduceMotion ? 0 : this.shake;
    const sx = shake ? (fx() - 0.5) * shake * unit : 0;
    const sy = shake ? (fx() - 0.5) * shake * unit : 0;
    ctx.translate(sx, sy);
    this.stars.draw(ctx, unit, this.warp * this.warp);
    drawEarth(ctx, this, this.t);
    for (const r of this.rocks) drawRock(ctx, r, unit, this.t, true);
    drawDrops(ctx, this.drops, unit, this.t);
    drawBullets(ctx, this.bullets, unit);
    if (this.player) drawShip(ctx, this.player, unit, this.t);
    drawParticles(ctx, this);
    if (this.state === 'play' || this.state === 'over') {
      this.drawShieldLabel();
      drawRadar(ctx, this, this.t);
    }
  }

  drawShieldLabel() {
    const { ctx, unit } = this;
    ctx.save();
    ctx.font = `${Math.round(13 * unit)}px VT323, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.shield > 60 ? C.cyan : this.shield > 30 ? C.amber : C.red;
    ctx.globalAlpha = 0.85;
    ctx.fillText(`EARTH SHIELD ${Math.round(this.shield)}%`, this.W / 2, this.earthY + 22 * unit);
    ctx.restore();
  }
}
