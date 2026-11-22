// Tiny Web Audio synth: no audio files to load.
// iOS only allows sound after a tap, so unlock() is called from the first touch.

import { store } from './util.js';

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = store('muted') === true;
    this.music = null;
    this.lastLaser = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    store('muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.1, at = 0, filter = 0 }) {
    const { ctx } = this;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filter;
      node = g.connect(lp);
    }
    node.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.3, vol = 0.3, f0 = 2000, f1 = 100, at = 0 }) {
    const { ctx } = this;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  laser() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLaser < 0.12) return;
    this.lastLaser = now;
    this.tone({ type: 'square', f0: 1400, f1: 380, dur: 0.07, vol: 0.025, filter: 3500 });
  }

  hit() {
    if (!this.ready) return;
    this.tone({ type: 'triangle', f0: 260, f1: 120, dur: 0.06, vol: 0.06 });
  }

  boom(size = 1) {
    if (!this.ready) return;
    this.noise({ dur: 0.25 + size * 0.35, vol: 0.18 + size * 0.15, f0: 2400, f1: 60 });
    this.tone({ type: 'sine', f0: 140, f1: 35, dur: 0.3 + size * 0.3, vol: 0.2 * size });
  }

  hurt() {
    if (!this.ready) return;
    this.noise({ dur: 0.5, vol: 0.35, f0: 900, f1: 50 });
    this.tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.45, vol: 0.12, filter: 1200 });
  }

  power() {
    if (!this.ready) return;
    [72, 76, 79, 84].forEach((n, i) => this.tone({ type: 'square', f0: NOTE(n), dur: 0.09, vol: 0.05, at: i * 0.06, filter: 4000 }));
  }

  alarm() {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) this.tone({ type: 'sawtooth', f0: 520, f1: 380, dur: 0.22, vol: 0.06, at: i * 0.28, filter: 2000 });
  }

  wave() {
    if (!this.ready) return;
    [57, 64, 69].forEach((n, i) => this.tone({ type: 'sawtooth', f0: NOTE(n), dur: 0.6, vol: 0.04, at: i * 0.05, filter: 1800 }));
  }

  slip() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 600, f1: 150, dur: 0.5, vol: 0.08 });
  }

  end(win) {
    if (!this.ready) return;
    const seq = win ? [69, 72, 76, 81] : [69, 65, 62, 57];
    seq.forEach((n, i) => this.tone({ type: 'square', f0: NOTE(n), dur: 0.22, vol: 0.05, at: i * 0.14, filter: 2500 }));
  }

  // Simple synthwave loop: Am – F – C – G arpeggios over a bass pulse.
  startMusic() {
    if (!this.ctx || this.music) return;
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ];
    const bpm = 112;
    const step = 60 / bpm / 4; // 16ths
    let next = this.ctx.currentTime + 0.1;
    let i = 0;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.15) {
        if (!this.muted) {
          const chord = chords[Math.floor(i / 16) % 4];
          const at = next - this.ctx.currentTime;
          const arp = chord[[0, 1, 2, 1][i % 4]] + 12 * (i % 8 < 4 ? 1 : 2);
          this.tone({ type: 'square', f0: NOTE(arp), dur: step * 0.9, vol: 0.012, at, filter: 2200 });
          if (i % 4 === 0) this.tone({ type: 'sawtooth', f0: NOTE(chord[0] - 12), dur: step * 3.5, vol: 0.035, at, filter: 500 });
        }
        next += step;
        i++;
      }
    };
    this.music = setInterval(tick, 40);
  }

  stopMusic() {
    clearInterval(this.music);
    this.music = null;
  }
}
