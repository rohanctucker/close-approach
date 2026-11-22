// Screens, input and glue.

import { Game } from './game.js';
import { Sound } from './audio.js';
import { loadToday, loadHistory, loadLegends, pickHistory, todayUTC } from './data.js';
import { fmtDate, fmtScore, fmtDiameter, fmtLD, label, subLabel, store } from './util.js';
import { facts, gameplayLine, whenText, DID_YOU_KNOW } from './learn.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const app = $('#app');
const canvas = $('#game');
const sound = new Sound();

const MODE_NAME = { today: "TODAY'S SKY", history: 'ON THIS DAY', legends: 'LEGENDS' };
let today = null;
let current = null;
let paused = false;

// ---------- element helper (data never goes through innerHTML) ----------

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}

// ---------- UI callbacks used by the game ----------

const ui = {
  hud(s) {
    $('#score').textContent = fmtScore(s.score);
    $('#wave').textContent = `${Math.max(1, s.wave)}/${s.waves}`;
    $('#mult').textContent = s.mult > 1 ? `×${s.mult} COMBO` : '';
    const hull = $('#hull');
    hull.replaceChildren(...[0, 1, 2].map((i) => el('span', { class: i < s.hull ? '' : 'lost', text: '▲' })));
  },

  kill(o) {
    toast('hit', 'INTERCEPTED', label(o), fmtDiameter(o));
    addToLogbook(o, current?.mode);
  },

  escape(o) {
    toast('miss', 'SLIPPED PAST', label(o), `real miss ${fmtLD(o.ld)}`);
  },

  wave(i, n, objs, mode) {
    const b = $('#banner');
    const names = objs.slice(0, 3).map(label);
    if (objs.length > 3) names.push(`+${objs.length - 3} more`);
    let title = 'INCOMING';
    let sub = '';
    if (mode === 'history' && objs.length) {
      const years = objs.map((o) => +o.t.slice(0, 4));
      const a = Math.min(...years);
      const z = Math.max(...years);
      title = a === z ? `${a}` : `${a} → ${z}`;
      if (Date.parse(objs[objs.length - 1].t) > Date.now()) sub = 'FORECAST';
    }
    if (mode === 'legends' && objs.length) title = objs[0].t.slice(0, 4);
    if (i === n - 1) sub = mode === 'today' ? 'CLOSEST FLYBY OF THE DAY' : sub || 'FINAL WAVE';
    if (objs.some((o) => o.pha)) sub = 'POTENTIALLY HAZARDOUS';
    const parts = [
      el('div', { class: 'bk', text: `WAVE ${i + 1} / ${n}` }),
      el('div', { class: 'bt', text: title }),
      el('div', { class: 'bn' }, ...names.map((t) => el('div', { text: t }))),
    ];
    if (sub) parts.push(el('div', { class: 'bs', text: sub }));
    b.replaceChildren(...parts);
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), 2300);
  },

  debrief({ wave, waves, items, mode, last }) {
    return new Promise((resolve) => {
      $('#debrief-kicker').textContent = `${MODE_NAME[mode]} · WAVE ${wave + 1} / ${waves}`;
      $('#debrief-cards').replaceChildren(...items.map((it) => card(it, mode)));
      const dyk = DID_YOU_KNOW[mode] || DID_YOU_KNOW.today;
      $('#dyk-text').textContent = dyk[wave % dyk.length];
      const btn = $('#debrief-next');
      btn.querySelector('b').textContent = last ? 'SEE RESULTS ▸' : `WAVE ${wave + 2} ▸`;
      show('#debrief');
      $('#debrief .sheet-inner').scrollTop = 0;
      btn.onclick = () => {
        sound.unlock();
        hide('#debrief');
        resolve();
      };
    });
  },

  end(summary) {
    if (game.state !== 'over') return; // player already left for the menu
    hide('#hud');
    hide('#debrief');
    $('#toasts').replaceChildren();
    const { mode, dateKey } = current;
    const { win, score, results } = summary;
    const bestKey = `best:${mode}:${dateKey}`;
    const prev = store(bestKey) || 0;
    const isBest = score > prev;
    if (isBest) store(bestKey, score);

    const title = $('#over-title');
    title.textContent = win ? 'SKY CLEARED' : summary.reason === 'shield' ? 'SHIELD DOWN' : 'SHIP LOST';
    title.className = `sheet-title big ${win ? 'win' : 'lose'}`;
    $('#over-kicker').textContent = `${MODE_NAME[mode]}${mode === 'legends' ? '' : ` · ${fmtDate(current.dataset.date || todayUTC())}`}`;
    $('#over-score').textContent = fmtScore(score);
    $('#over-best').textContent = isBest ? (prev ? `NEW BEST · previous ${fmtScore(prev)}` : 'FIRST RUN TODAY') : `BEST ${fmtScore(prev)}`;
    const hit = results.filter((r) => r.status === 'hit').length;
    $('#st-int').textContent = `${hit}/${results.length}`;
    $('#st-shield').textContent = `${Math.round(summary.shield)}%`;
    $('#st-acc').textContent = `${Math.round(summary.accuracy * 100)}%`;
    $('#over-list').replaceChildren(...results.map((r) => card(r, mode, { collapsible: true })));
    $('#over-src').textContent = current.dataset.live
      ? `Every named asteroid here is real. Source: ${current.dataset.source}.`
      : 'The live feed was unavailable, so this round used a simulated sky.';
    $('#share-btn').onclick = () => share(summary);
    show('#over');
    $('#over .sheet-inner').scrollTop = 0;
    refreshTitle();
  },
};

// ---------- cards: the learning layer ----------

function card(item, mode, { collapsible = false } = {}) {
  const { o, status } = item;
  const statusText = status === 'hit' ? '✓ INTERCEPTED' : status === 'miss' ? '✗ SLIPPED PAST' : '· NOT REACHED';
  const cls = `card ${status}`;
  const tag = o.pha ? 'HAZARDOUS' : item.boss && mode === 'today' ? 'CLOSEST' : null;
  const head = el('div', { class: 'head' }, el('span', { class: 'status', text: statusText }), el('span', { class: 'size', text: fmtDiameter(o) }));
  const sub = subLabel(o);
  const h3 = el('h3', {}, label(o), sub ? el('small', { text: sub }) : null, tag ? el('span', { class: `tag${o.pha ? ' red' : ''}`, text: tag }) : null);
  const body = [
    status !== 'logged' ? el('p', { class: 'play', text: gameplayLine(item, mode) }) : null,
    el('p', { class: 'when', text: whenText(o, mode === 'logged' ? 'history' : mode) }),
    o.blurb ? el('p', { class: 'blurb', text: o.blurb }) : null,
    el('dl', {}, ...facts(o).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
  ];
  if (!collapsible) return el('article', { class: cls }, head, h3, ...body);
  const summary = el('summary', {}, head, el('span', { class: 'chev', text: '▸' }), h3);
  return el('details', { class: cls }, summary, ...body);
}

// ---------- toasts ----------

function toast(tone, k, name, meta) {
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstChild.remove();
  const t = el('div', { class: `toast ${tone}` }, el('span', { class: 'k', text: k }), el('span', { class: 'n', text: name }), el('span', { class: 'm', text: meta }));
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 2950);
}

// ---------- logbook ----------

function logbook() {
  return store('logbook') || {};
}

function addToLogbook(o, mode) {
  if (!current?.dataset?.live) return;
  const book = logbook();
  const key = `${o.id}|${o.t}`;
  if (!book[key]) book[key] = { o, mode, at: Date.now() };
  store('logbook', book);
}

function renderLogbook() {
  const entries = Object.values(logbook()).sort((a, b) => b.at - a.at);
  $('#logbook-sub').textContent = entries.length
    ? `${entries.length} real asteroid${entries.length === 1 ? '' : 's'} so far. Saved on this device.`
    : 'Destroy a real asteroid and it lands here, with everything we know about it.';
  $('#logbook-list').replaceChildren(
    ...(entries.length
      ? entries.map((e) => card({ o: e.o, status: 'hit' }, e.mode === 'today' ? 'history' : e.mode, { collapsible: true }))
      : [el('div', { class: 'empty', text: 'EMPTY · GO HUNT' })]),
  );
}

// ---------- share ----------

async function share(summary) {
  const { mode } = current;
  const squares = summary.results.map((r) => (r.status === 'hit' ? '🟧' : r.status === 'miss' ? '🟥' : '⬛')).join('');
  const hit = summary.results.filter((r) => r.status === 'hit').length;
  const when = mode === 'legends' ? '' : ` · ${fmtDate(current.dataset.date || todayUTC())}`;
  const url = location.origin + location.pathname;
  const text = `CLOSE APPROACH ☄️ ${MODE_NAME[mode]}${when}\n${fmtScore(summary.score)} pts · ${hit}/${summary.results.length} real asteroids intercepted\n${squares}`;
  try {
    if (navigator.share) {
      await navigator.share({ text: `${text}\n${url}` });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    flashButton('#share-btn', 'COPIED ✓');
  } catch {
    flashButton('#share-btn', 'COPY FAILED');
  }
}

function flashButton(sel, text) {
  const b = $(sel).querySelector('b');
  const old = b.textContent;
  b.textContent = text;
  setTimeout(() => (b.textContent = old), 1600);
}

// ---------- screens ----------

function show(sel) {
  $(sel).hidden = false;
}
function hide(sel) {
  $(sel).hidden = true;
}

function refreshTitle() {
  const count = Object.keys(logbook()).length;
  $('#logbook-count').textContent = count;
  const best = today ? store(`best:today:${today.date}`) : null;
  $('#best-line').textContent = best ? `TODAY'S BEST ${fmtScore(best)}` : '';
  $('#sound-btn').textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
}

function fillFeed(ds) {
  const objs = ds.objects;
  const closest = [...objs].sort((a, b) => a.au - b.au)[0];
  const pha = objs.filter((o) => o.pha).length;
  $('#feed').classList.toggle('offline', !ds.live);
  $('#link-status').textContent = ds.live ? 'CNEOS LINK ESTABLISHED' : 'LIVE FEED OFFLINE · SIMULATION';
  $('#feed-src').textContent = ds.live ? (ds.source.startsWith('NASA NeoWs') ? 'NASA NEOWS' : 'NASA/JPL CNEOS') : 'SIMULATED';
  $('#feed-date').textContent = fmtDate(ds.date);
  $('#feed-count').textContent = `${objs.length} REAL${pha ? ` · ${pha} HAZARDOUS` : ''}`;
  $('#feed-closest').textContent = closest ? `${label(closest)} · ${fmtLD(closest.ld)}` : '—';
  $('#today-sub').textContent = `${objs.length} real flybys · same level for everyone`;
}

function toTitle() {
  paused = false;
  ['#hud', '#over', '#paused', '#debrief', '#about', '#logbook'].forEach(hide);
  $('#toasts').replaceChildren();
  $('#banner').classList.remove('show');
  sound.stopMusic();
  game.attract(today ? today.objects : []);
  refreshTitle();
  show('#title');
}

async function startMode(mode) {
  sound.unlock();
  const btns = $$('[data-mode]');
  btns.forEach((b) => (b.disabled = true));
  try {
    let dataset;
    let objects;
    let dateKey;
    if (mode === 'today') {
      dataset = today;
      objects = [...today.objects].sort((a, b) => a.au - b.au).slice(0, 15);
      dateKey = today.date;
    } else if (mode === 'history') {
      const d = todayUTC();
      dataset = await loadHistory(d);
      objects = dataset.live ? pickHistory(dataset.objects, d) : dataset.objects;
      dateKey = d;
    } else {
      dataset = await loadLegends();
      objects = dataset.objects;
      dateKey = 'all';
    }
    current = { mode, dataset, objects, dateKey };
    ['#title', '#over', '#paused', '#debrief'].forEach(hide);
    show('#hud');
    paused = false;
    game.start(mode, dataset, objects, `${mode}:${dateKey}`);
    sound.startMusic();
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

function setPaused(p) {
  if (game.state !== 'play') return;
  if (p && !$('#debrief').hidden) return; // debrief already pauses play
  paused = p;
  $('#paused').hidden = !p;
  p ? sound.stopMusic() : sound.startMusic();
}

// ---------- game + loop ----------

const game = new Game(canvas, sound, ui);

function insets() {
  const cs = getComputedStyle($('#safe-probe'));
  return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
}

function resize() {
  const r = app.getBoundingClientRect();
  game.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2), insets());
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!paused) game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}

// ---------- input ----------

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (game.state !== 'play' || paused) return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: game.player ? game.player.x : game.input.tx, sy: game.player ? game.player.y : game.input.ty };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  e.preventDefault();
  game.input.tx = drag.sx + (e.clientX - drag.x) * 1.25;
  game.input.ty = drag.sy + (e.clientY - drag.y) * 1.25;
});
const endDrag = (e) => {
  if (drag && e.pointerId === drag.id) drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'p' || k === 'Escape') return setPaused(!paused);
  game.input.keys.add(k);
  if (k.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => game.input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));

// Stop iOS rubber-banding except inside scrollable sheets.
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scroll')) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- buttons ----------

$$('[data-mode]').forEach((b) => b.addEventListener('click', () => startMode(b.dataset.mode)));
$('#pause-btn').addEventListener('click', () => setPaused(true));
$('#resume-btn').addEventListener('click', () => setPaused(false));
$$('.menu-btn').forEach((b) => b.addEventListener('click', toTitle));
$('#again-btn').addEventListener('click', () => startMode(current.mode));
$('#about-btn').addEventListener('click', () => show('#about'));
$('#logbook-btn').addEventListener('click', () => {
  renderLogbook();
  show('#logbook');
});
$$('.close-btn').forEach((b) => b.addEventListener('click', () => {
  hide('#about');
  hide('#logbook');
}));
$('#sound-btn').addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  refreshTitle();
});

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (ios && !standalone) $('.ios-hint').hidden = false;

// ---------- boot ----------

async function boot() {
  resize();
  requestAnimationFrame(frame);
  game.attract([]);
  const fonts = document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  [today] = await Promise.all([loadToday(), fonts]);
  fillFeed(today);
  hide('#loading');
  toTitle();
  // Warm the archives so mode switches feel instant.
  loadHistory(todayUTC());
  loadLegends();
}

boot();

// Debug hook for automated tests.
window.__ca = { game, ui, startMode, get current() { return current; } };
