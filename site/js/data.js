// Loads real asteroid data. Order of preference:
//   1. site/data/*.json, built daily by the GitHub Action from NASA/JPL CNEOS
//   2. NASA NeoWs directly from the browser (today's sky only, demo key)
//   3. a clearly labeled simulation, so the game always works

import { makeRng } from './util.js';

const BASE = './data';

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- today ----------

export async function loadToday() {
  try {
    const j = await getJSON(`${BASE}/today.json`);
    if (j.objects && j.objects.length) return { ...j, live: true };
  } catch {
    /* fall through */
  }
  try {
    return await loadNeoWs(todayUTC());
  } catch {
    /* fall through */
  }
  return simulated('today', todayUTC());
}

function parseNeoName(name) {
  const full = (name || '').trim();
  let m;
  if ((m = /^(\d+)\s+(.+?)\s+\(([^)]+)\)$/.exec(full))) return { num: m[1], name: m[2], des: m[3] };
  if ((m = /^(\d+)\s+\(([^)]+)\)$/.exec(full))) return { num: m[1], name: null, des: m[2] };
  if ((m = /^\(([^)]+)\)$/.exec(full))) return { num: null, name: null, des: m[1] };
  return { num: null, name: null, des: full };
}

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

async function loadNeoWs(day) {
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${day}&end_date=${day}&api_key=DEMO_KEY`;
  const j = await getJSON(url);
  const list = Object.values(j.near_earth_objects || {}).flat();
  const objects = list
    .map((n) => {
      const ca = (n.close_approach_data || [])[0];
      if (!ca) return null;
      const m = /^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/.exec(ca.close_approach_date_full || '');
      const t = m ? `${m[1]}-${MONTHS[m[2]]}-${m[3]}T${m[4]}:${m[5]}Z` : `${ca.close_approach_date}T12:00Z`;
      const dm = n.estimated_diameter?.meters;
      const d = dm ? Math.sqrt(dm.estimated_diameter_min * dm.estimated_diameter_max) : 50;
      const nm = parseNeoName(n.name);
      return {
        id: n.id,
        ...nm,
        t,
        au: +ca.miss_distance.astronomical,
        ld: +(+ca.miss_distance.lunar).toFixed(2),
        v: +(+ca.relative_velocity.kilometers_per_second).toFixed(2),
        h: n.absolute_magnitude_h,
        d: Math.round(d),
        dEst: true,
        pha: !!n.is_potentially_hazardous_asteroid,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t.localeCompare(b.t));
  if (!objects.length) throw new Error('empty NeoWs feed');
  return { mode: 'today', date: day, source: 'NASA NeoWs (api.nasa.gov)', objects, live: true };
}

// ---------- on this day ----------

export async function loadHistory(dateISO) {
  let mmdd = dateISO.slice(5, 10);
  try {
    const j = await getJSON(`${BASE}/history/${mmdd}.json`);
    if (j.objects && j.objects.length) return { ...j, date: dateISO, live: true };
  } catch {
    if (mmdd === '02-29') mmdd = '02-28';
  }
  return simulated('history', dateISO);
}

// Choose a playable set: the closest, the biggest, the hazardous, and a spread
// across past and future. Same picks for everyone on a given date.
export function pickHistory(objects, dateISO, count = 12) {
  const rng = makeRng(`history:${dateISO}`);
  const chosen = new Map();
  const ids = new Set();
  const add = (o) => {
    if (!o || chosen.size >= count || ids.has(o.id)) return;
    ids.add(o.id);
    chosen.set(o.id + o.t, o);
  };
  const by = (f) => [...objects].sort(f);
  by((a, b) => a.au - b.au).slice(0, 4).forEach(add);
  by((a, b) => b.d - a.d).slice(0, 3).forEach(add);
  objects.filter((o) => o.pha).slice(0, 3).forEach(add);
  const now = Date.now();
  objects.filter((o) => Date.parse(o.t) > now).sort((a, b) => a.au - b.au).slice(0, 2).forEach(add);
  const rest = objects.filter((o) => !ids.has(o.id));
  while (chosen.size < count && rest.length) add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  return [...chosen.values()].sort((a, b) => a.t.localeCompare(b.t));
}

// ---------- legends ----------

export async function loadLegends() {
  try {
    const j = await getJSON(`${BASE}/legends.json`);
    if (j.objects && j.objects.length) return { ...j, live: true };
  } catch {
    /* fall through */
  }
  return simulated('legends', todayUTC());
}

// ---------- simulation fallback ----------

export function simulated(mode, dateISO) {
  const rng = makeRng(`sim:${mode}:${dateISO}`);
  const n = mode === 'today' ? 9 : 10;
  const base = Date.parse(`${dateISO}T00:00Z`);
  const objects = Array.from({ length: n }, (_, i) => {
    const au = 10 ** rng.range(-3.2, -1.3);
    const yearShift = mode === 'today' ? 0 : rng.int(-110, 70);
    const t = new Date(base + yearShift * 365.25 * 86400000 + rng() * 86400000).toISOString().slice(0, 16) + 'Z';
    return {
      id: `SIM-${i}`,
      name: null,
      des: `SIM-${String(i + 1).padStart(3, '0')}`,
      num: null,
      t,
      au: +au.toFixed(5),
      ld: +(au * 389.17).toFixed(2),
      v: +rng.range(5, 28).toFixed(2),
      h: null,
      d: Math.round(10 ** rng.range(1, 3.1)),
      dEst: true,
      pha: rng() < 0.15,
    };
  }).sort((a, b) => a.t.localeCompare(b.t));
  return { mode, date: dateISO, source: 'Simulation (live feed unavailable)', objects, live: false };
}
