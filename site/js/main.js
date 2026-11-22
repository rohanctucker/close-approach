// Screens, input and glue.

import { Game } from './game.js';
import { Sound } from './audio.js';
import { loadToday, loadHistory, loadLegends, pickHistory, todayUTC } from './data.js';
import { fmtDate, fmtScore, fmtDiameter, fmtLD, label, subLabel, store } from './util.js';
import { facts, gameplayLine, whenText, DID_YOU_KNOW, makeQuestion, intelBonus } from './learn.js';
import { BADGES, earned, awardBadges, streak, bumpStreak, logbook, addToLogbook } from './progress.js';
import { lbEnabled, fetchTop, submitScore, savedName, saveName, cleanName } from './leaderboard.js';
import { scaleSvg } from './scale.js';
import { sizeCompare, distanceCompare } from './learn.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const app = $('#app');
const canvas = $('#game');
const sound = new Sound();

const MODE_NAME = { today: "TODAY'S SKY", history: 'ON THIS DAY', legends: 'LEGENDS' };
let today = null;
let current = null;
let paused = false;
let holdBetween = null;

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

const show = (sel) => ($(sel).hidden = false);
const hide = (sel) => ($(sel).hidden = true);

// ---------- UI callbacks used by the game ----------

const ui = {
  hud(s) {
    $('#score').textContent = fmtScore(s.score);
    $('#wave').textContent = `${Math.max(1, s.wave)}/${s.waves}`;
    $('#mult').textContent = s.mult > 1 ? `×${s.mult} COMBO` : '';
    $('#hull').replaceChildren(...[0, 1, 2].map((i) => el('span', { class: i < s.hull ? '' : 'lost', text: '▲' })));
  },

  kill(o) {
    toast('hit', 'INTERCEPTED', label(o), fmtDiameter(o));
    if (current?.dataset?.live) addToLogbook(o, current.mode);
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
    if (i === 0 && !store('tutorialDone')) {
      parts.push(el('div', { class: 'btip' }, el('div', { text: 'DRAG ANYWHERE TO FLY · YOU FIRE AUTOMATICALLY' }), el('div', { text: 'AMBER + RED ROCKS ARE REAL ASTEROIDS. PROTECT EARTH.' })));
    }
    b.replaceChildren(...parts);
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), i === 0 && !store('tutorialDone') ? 3600 : 2300);
  },

  // After each wave: a short card that continues on its own. Field notes and
  // the guess-for-bonus are optional; nobody has to read or answer anything.
  debrief({ wave, waves, items, mode, last }) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        hide('#between');
        hide('#debrief');
        store('tutorialDone', true);
        resolve();
      };
      const q = makeQuestion(items, wave, mode);

      // ---- the auto-advancing card ----
      $('#bw-k').textContent = last ? 'SKY CLEARED' : `WAVE ${wave + 1} OF ${waves} CLEARED`;
      const shown = items.slice(0, 2);
      $('#bw-list').replaceChildren(
        ...shown.map(({ o, status }) =>
          el('div', { class: `bw-row ${status}` },
            scaleSvg(o, { kind: status === 'miss' ? 'miss' : o.pha ? 'boss' : 'real' }),
            el('div', { class: 'bw-txt' },
              el('b', { text: label(o) }),
              el('span', { text: `${fmtDiameter(o)} · ${sizeCompare(o.d)}` }),
              el('span', { class: 'bw-dist', text: `Really passed ${distanceCompare(o).ref}` }),
            ),
          ),
        ),
        ...(items.length > 2 ? [el('div', { class: 'bw-more', text: `+${items.length - 2} more in field notes` })] : []),
      );
      $('#bw-guess').hidden = !q;
      if (q) $('#bw-guess').textContent = `GUESS +${intelBonus(game.intel.streak + 1)}`;
      $('#bw-go').textContent = last ? 'RESULTS ▸' : 'NEXT ▸';
      const fill = $('#bw-fill');
      fill.style.transition = 'none';
      fill.style.width = '100%';
      show('#between');
      requestAnimationFrame(() => {
        fill.style.transition = 'width 6s linear';
        fill.style.width = '0%';
      });
      timer = setTimeout(finish, 6000);
      const hold = () => {
        clearTimeout(timer);
        fill.style.transition = 'none';
        fill.style.width = getComputedStyle(fill).width;
      };
      $('#bw-go').onclick = finish;
      holdBetween = hold; // if the phone locks or the app is backgrounded, wait for the player
      $('#bw-notes').onclick = () => {
        hold();
        openNotes(false);
      };
      $('#bw-guess').onclick = () => {
        hold();
        openNotes(true);
      };

      // ---- optional field notes (with the guess on top, if chosen) ----
      function openNotes(guess) {
        $('#debrief-kicker').textContent = `${MODE_NAME[mode]} · WAVE ${wave + 1} / ${waves}`;
        $('#debrief-sub').textContent = current.dataset.live ? 'What you just fought, in real numbers.' : 'Simulated sky: the live feed was offline, so these asteroids are made up.';
        const cards = $('#debrief-cards');
        cards.replaceChildren(...items.map((it) => card(it, mode, { focus: guess ? q?.focus : null })));
        const dyk = DID_YOU_KNOW[mode] || DID_YOU_KNOW.today;
        $('#dyk-text').textContent = dyk[wave % dyk.length];
        const btn = $('#debrief-next');
        const nextLabel = last ? 'SEE RESULTS ▸' : `WAVE ${wave + 2} ▸`;
        const reveal = () => {
          cards.hidden = false;
          $('#dyk').hidden = false;
          btn.querySelector('b').textContent = nextLabel;
        };
        const box = $('#intel');
        if (guess && q) {
          box.hidden = false;
          cards.hidden = true;
          $('#dyk').hidden = true;
          btn.querySelector('b').textContent = `SKIP · ${nextLabel}`;
          $('#intel-bonus').textContent = `+${intelBonus(game.intel.streak + 1)} IF RIGHT`;
          $('#intel-q').textContent = q.prompt;
          $('#intel-hint').textContent = q.hint || '';
          $('#intel-result').replaceChildren();
          const opts = q.options.map((o) => el('button', { class: 'opt', type: 'button', text: o.text }));
          $('#intel-opts').replaceChildren(...opts);
          let answered = false;
          opts.forEach((b, i) =>
            b.addEventListener('click', () => {
              if (answered) return;
              answered = true;
              const ok = q.options[i].correct;
              opts.forEach((x, j) => {
                x.disabled = true;
                if (q.options[j].correct) x.classList.add('right');
              });
              if (!ok) b.classList.add('wrong');
              const bonus = game.answerIntel(ok);
              $('#intel-bonus').textContent = ok ? 'BONUS EARNED' : 'STREAK RESET';
              ok ? sound.power() : sound.slip();
              const streakTxt = ok && game.intel.streak >= 2 ? ` · STREAK ${game.intel.streak}` : '';
              $('#intel-result').replaceChildren(
                el('b', { class: ok ? 'good' : 'bad', text: ok ? `✓ CORRECT  +${bonus}${streakTxt}` : '✗ NOT QUITE' }),
                el('span', { text: ` ${q.explain}` }),
              );
              reveal();
            }),
          );
        } else {
          box.hidden = true;
          reveal();
        }
        hide('#between');
        show('#debrief');
        $('#debrief .sheet-inner').scrollTop = 0;
        btn.onclick = () => {
          sound.unlock();
          finish();
        };
      }
    });
  },

  end(summary) {
    if (game.state !== 'over') return; // player already left for the menu
    hide('#hud');
    hide('#debrief');
    $('#toasts').replaceChildren();
    const { mode, dateKey, dataset } = current;
    const { win, score, results, intel } = summary;
    const bestKey = `best:${mode}:${dateKey}`;
    const prev = store(bestKey) || 0;
    const isBest = score > prev;
    if (isBest) store(bestKey, score);

    const title = $('#over-title');
    title.textContent = win ? 'SKY CLEARED' : summary.reason === 'shield' ? 'SHIELD DOWN' : 'SHIP LOST';
    title.className = `sheet-title big ${win ? 'win' : 'lose'}`;
    $('#over-kicker').textContent = `${MODE_NAME[mode]}${mode === 'legends' ? '' : ` · ${fmtDate(dataset.date || todayUTC())}`}`;
    $('#over-score').textContent = fmtScore(score);
    $('#over-best').textContent = isBest ? (prev ? `NEW BEST · previous ${fmtScore(prev)}` : 'FIRST SCORE TODAY') : prev ? `BEST ${fmtScore(prev)}` : '';
    const hit = results.filter((r) => r.status === 'hit').length;
    $('#st-int').textContent = `${hit}/${results.length}`;
    $('#st-intel').textContent = intel.total ? `${intel.correct}/${intel.total}` : '—';
    $('#st-shield').textContent = `${Math.round(summary.shield)}%`;

    // Streak + badges (real data only)
    const st = mode === 'today' && dataset.live ? bumpStreak(dataset.date) : streak(today?.date || todayUTC());
    const fresh = awardBadges({ live: dataset.live, results, intel, streak: st });
    $('#over-badges').hidden = !fresh.length;
    $('#over-badges h3').textContent = fresh.length > 1 ? 'NEW BADGES' : 'NEW BADGE';
    $('#over-badges-list').replaceChildren(...fresh.map((b) => badgeEl(b, true)));

    $('#over-list').replaceChildren(...results.map((r) => card(r, mode, { collapsible: true })));
    $('#over-src').textContent = dataset.live
      ? `Every named asteroid here is real. Source: ${dataset.source}.`
      : 'The live feed was unavailable, so this round used a simulated sky.';
    $('#share-btn').onclick = () => share(summary);
    endLeaderboard(summary);
    show('#over');
    $('#over .sheet-inner').scrollTop = 0;
    refreshTitle();
  },
};

// ---------- cards: the learning layer ----------

function card(item, mode, { collapsible = false, focus = null } = {}) {
  const { o, status } = item;
  const statusText = status === 'hit' ? '✓ INTERCEPTED' : status === 'miss' ? '✗ SLIPPED PAST' : '· NOT REACHED';
  const tag = o.pha ? 'HAZARDOUS' : item.boss && mode === 'today' ? 'CLOSEST' : null;
  const head = el('div', { class: 'head' }, el('span', { class: 'status', text: statusText }), el('span', { class: 'size', text: fmtDiameter(o) }));
  const sub = subLabel(o);
  const h3 = el('h3', {}, label(o), sub ? el('small', { text: sub }) : null, tag ? el('span', { class: `tag${o.pha ? ' red' : ''}`, text: tag }) : null);
  const refDate = mode === 'today' ? current?.dataset?.date || today?.date : null;
  const body = [
    item.logged ? null : el('p', { class: 'play', text: gameplayLine(item) }),
    el('p', { class: 'when', text: whenText(o, mode, refDate) }),
    o.blurb ? el('p', { class: 'blurb', text: o.blurb }) : null,
    el('dl', {}, ...facts(o).flatMap(([k, v]) => [el('dt', { class: k === focus ? 'focus' : null, text: k }), el('dd', { class: k === focus ? 'focus' : null, text: v })])),
  ];
  body.unshift(el('div', { class: 'card-scale' }, scaleSvg(o, { kind: status === 'miss' ? 'miss' : o.pha ? 'boss' : 'real', w: 220, h: 70 }), el('span', { text: `to scale with ${refName(o)}` })));
  const cls = `card ${status}`;
  if (!collapsible) return el('article', { class: cls }, head, h3, ...body);
  const summary = el('summary', {}, head, el('span', { class: 'chev', text: '▸' }), h3);
  return el('details', { class: cls }, summary, ...body);
}

function refName(o) {
  const t = sizeCompare(o.d);
  return t.replace(/^(about the size of|a bit bigger than|smaller than|about \d+) /, '').replace(/ (long|tall)$/, '');
}

function badgeEl(b, lit = true) {
  return el('div', { class: `badge${lit ? '' : ' locked'}` }, el('b', { text: b.name }), el('p', { text: b.desc }));
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

function renderLogbook() {
  const have = earned();
  const count = BADGES.filter((b) => have[b.id]).length;
  $('#badges-head').textContent = `BADGES ${count}/${BADGES.length}`;
  $('#badges-grid').replaceChildren(...BADGES.map((b) => badgeEl(b, !!have[b.id])));
  const entries = Object.values(logbook()).sort((a, b) => b.at - a.at);
  const st = streak(today?.date || todayUTC());
  $('#logbook-sub').textContent = entries.length
    ? `${entries.length} real asteroid${entries.length === 1 ? '' : 's'} so far${st > 1 ? ` · ${st}-day streak` : ''}. Saved on this device.`
    : 'Destroy a real asteroid and it lands here, with everything we know about it.';
  $('#logbook-list').replaceChildren(
    ...(entries.length
      ? entries.map((e) => card({ o: e.o, status: 'hit', logged: true }, e.mode === 'today' ? 'history' : e.mode, { collapsible: true }))
      : [el('div', { class: 'empty', text: 'EMPTY · GO HUNT' })]),
  );
}

// ---------- leaderboard ----------

function boardKey(mode, dateKey) {
  return mode === 'legends' ? 'legends:all' : `${mode}:${dateKey}`;
}

function boardRows(r) {
  const row = (x) =>
    el('li', { class: x.mine ? 'mine' : null }, el('span', { class: 'rk', text: `${x.rank}` }), el('span', { class: 'nm', text: x.name }), el('span', { class: 'iq', text: x.intelTotal ? `GUESS ${x.intel}/${x.intelTotal}` : '' }), el('span', { class: 'sc', text: fmtScore(x.score) }));
  const rows = r.top.map(row);
  if (r.me) rows.push(el('li', { class: 'gap', text: '…' }), row(r.me));
  if (!rows.length) rows.push(el('li', { class: 'gap', text: 'No scores yet. Be the first.' }));
  return rows;
}

function lbError(e) {
  const m = String(e && e.message);
  if (/board closed/.test(m)) return 'This board is closed to new scores.';
  if (/name/.test(m)) return 'Please pick another name (2–12 letters or numbers).';
  if (/slow down/.test(m)) return 'Too many posts. Try again in a minute.';
  return "Couldn't reach the leaderboard. Check your connection and try again.";
}

function endLeaderboard(summary) {
  const sec = $('#over-lb');
  if (!lbEnabled()) {
    sec.hidden = true;
    return;
  }
  sec.hidden = false;
  const { mode, dateKey, dataset } = current;
  const board = boardKey(mode, dateKey);
  const form = $('#lb-form');
  const input = $('#lb-name');
  const msg = (t) => ($('#lb-msg').textContent = t);
  const list = $('#lb-list');
  list.replaceChildren();
  $('#lb-sub').textContent = mode === 'legends' ? 'Legends · all time' : `${MODE_NAME[mode]} · ${fmtDate(dataset.date || todayUTC())}`;
  $('#lb-change').hidden = true;
  if (!dataset.live) {
    form.hidden = true;
    msg('Scores only count when the live NASA/JPL feed is up.');
    return;
  }
  const entry = {
    board,
    score: summary.score,
    intel: summary.intel.correct,
    intelTotal: summary.intel.total,
    hits: summary.results.filter((r) => r.status === 'hit').length,
    total: summary.results.length,
    duration: summary.duration,
  };
  const post = async (name) => {
    form.hidden = true;
    msg(`Posting as ${name}…`);
    try {
      const r = await submitScore({ ...entry, name });
      saveName(name);
      list.replaceChildren(...boardRows(r));
      msg(`${name}, you're #${r.rank} of ${r.count}.`);
      $('#lb-change').hidden = false;
    } catch (e) {
      msg(lbError(e));
      form.hidden = false;
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const n = cleanName(input.value);
    if (n.length < 2) return msg('Your name needs 2–12 letters or numbers.');
    input.blur();
    post(n);
  };
  $('#lb-change').onclick = () => {
    form.hidden = false;
    $('#lb-change').hidden = true;
    input.value = savedName();
    input.focus();
  };
  const name = savedName();
  input.value = name;
  if (name) post(name);
  else {
    form.hidden = false;
    msg('Add your name to post this score.');
  }
}

async function openBoard(mode = 'today') {
  $$('#board .seg button').forEach((b) => b.classList.toggle('on', b.dataset.board === mode));
  const dateKey = mode === 'today' ? today?.date || todayUTC() : todayUTC();
  $('#board-sub').textContent = mode === 'legends' ? 'Legends · all time' : `${MODE_NAME[mode]} · ${fmtDate(dateKey)}`;
  const list = $('#board-list');
  list.replaceChildren(el('li', { class: 'gap', text: 'Loading…' }));
  show('#board');
  try {
    const r = await fetchTop(boardKey(mode, dateKey), 20);
    list.replaceChildren(...boardRows(r));
  } catch (e) {
    list.replaceChildren(el('li', { class: 'gap', text: lbError(e) }));
  }
}

// ---------- share ----------

async function share(summary) {
  const { mode, dataset } = current;
  const squares = summary.results.map((r) => (r.status === 'hit' ? '🟧' : r.status === 'miss' ? '🟥' : '⬛')).join('');
  const hit = summary.results.filter((r) => r.status === 'hit').length;
  const when = mode === 'legends' ? '' : ` · ${fmtDate(dataset.date || todayUTC())}`;
  const url = location.origin + location.pathname;
  const brain = summary.intel.total ? ` · 🧠 ${summary.intel.correct}/${summary.intel.total}` : '';
  const text = `CLOSE APPROACH ☄️ ${MODE_NAME[mode]}${when}\n${fmtScore(summary.score)} pts · ${hit}/${summary.results.length} real asteroids${brain}\n${squares}`;
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

// ---------- title ----------

function refreshTitle() {
  $('#logbook-count').textContent = Object.keys(logbook()).length;
  const best = today ? store(`best:today:${today.date}`) : null;
  const st = streak(today?.date || todayUTC());
  const parts = [];
  if (best) parts.push(`TODAY'S BEST ${fmtScore(best)}`);
  if (st > 1) parts.push(`STREAK ${st} DAYS`);
  $('#best-line').textContent = parts.join(' · ');
  $('#sound-btn').textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
  $('#board-btn').hidden = !lbEnabled();
}

function fillFeed(ds) {
  const objs = ds.objects;
  const closest = [...objs].sort((a, b) => a.au - b.au)[0];
  const pha = objs.filter((o) => o.pha).length;
  $('#feed').classList.toggle('offline', !ds.live);
  $('#link-status').textContent = ds.live ? 'CNEOS LINK ESTABLISHED' : 'LIVE FEED OFFLINE · SIMULATION';
  $('#feed-src').textContent = ds.live ? (ds.source.startsWith('NASA NeoWs') ? 'NASA NEOWS' : 'NASA/JPL CNEOS') : 'SIMULATED';
  $('#feed-date').textContent = fmtDate(ds.date);
  const n = Math.min(objs.length, 15);
  $('#feed-count').textContent = `${n} REAL${pha ? ` · ${pha} HAZARDOUS` : ''}`;
  $('#feed-closest').textContent = closest ? `${label(closest)} · ${fmtLD(closest.ld)}` : '—';
  $('#today-sub').textContent = `${n} real flybys · same level for everyone`;
}

function toTitle() {
  paused = false;
  ['#hud', '#over', '#paused', '#debrief', '#between', '#about', '#logbook', '#board'].forEach(hide);
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
    ['#title', '#over', '#paused', '#debrief', '#board'].forEach(hide);
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
  if (p && (!$('#debrief').hidden || !$('#between').hidden)) return; // between waves, play is already stopped
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
  // Phone turned sideways: the "turn upright" screen shows, so stop the action.
  if (matchMedia('(orientation: landscape) and (max-height: 500px)').matches) setPaused(true);
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

const typing = (e) => /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'p' || k === 'Escape') return setPaused(!paused);
  game.input.keys.add(k);
  if (k.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => game.input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));

// Stop iOS rubber-banding except inside scrollable sheets and form fields.
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scroll, input')) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (!$('#between').hidden && holdBetween) holdBetween();
  setPaused(true);
});
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
$('#board-btn').addEventListener('click', () => openBoard('today'));
$$('#board .seg button').forEach((b) => b.addEventListener('click', () => openBoard(b.dataset.board)));
$$('.close-btn').forEach((b) =>
  b.addEventListener('click', () => {
    hide('#about');
    hide('#logbook');
    hide('#board');
  }),
);
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
