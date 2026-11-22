#!/usr/bin/env node
// Builds the game's data files from NASA/JPL CNEOS close-approach data.
//
//   site/data/today.json            today's real flybys (the daily level)
//   site/data/history/MM-DD.json    flybys on this calendar date, 1900–2100
//   site/data/legends.json          famous flybys
//
// Source: https://ssd-api.jpl.nasa.gov/doc/cad.html (no API key needed).
// History and legends rarely change, so they're cached in .cache/ between runs.

import { mkdir, writeFile, readFile, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'data');
const CACHE = path.join(ROOT, '.cache');
const API = 'https://ssd-api.jpl.nasa.gov/cad.api';
const AU_KM = 149597870.7;
const LD_AU = 384400 / AU_KM; // one lunar distance in au
const SOURCE = 'NASA/JPL Center for Near-Earth Object Studies (ssd-api.jpl.nasa.gov)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

// ---------- API ----------

export function toRows(json) {
  if (!json || !json.count || !Array.isArray(json.data)) return [];
  return json.data.map((r) => Object.fromEntries(json.fields.map((f, i) => [f, r[i]])));
}

export async function cad(params, { tries = 4 } = {}) {
  const qs = new URLSearchParams({ diameter: 'true', fullname: 'true', ...params });
  const url = `${API}?${qs}`;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'close-approach-game (github.com/rohanctucker/close-approach)' },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
      return toRows(JSON.parse(text));
    } catch (e) {
      lastErr = e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw lastErr;
}

// ---------- shaping ----------

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

// "2026-Nov-22 03:45" (TDB, within ~70 s of UTC) -> "2026-11-22T03:45Z"
export function cdToISO(cd) {
  const m = /^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/.exec(cd || '');
  return m ? `${m[1]}-${MONTHS[m[2]]}-${m[3]}T${m[4]}:${m[5]}Z` : null;
}

// Measured diameter when JPL has one, otherwise an estimate from brightness (H)
// assuming a typical albedo of 0.14: D(km) = 1329 / sqrt(p) * 10^(-H/5).
export function diameterMeters(row) {
  if (row.diameter != null && row.diameter !== '') return { m: Number(row.diameter) * 1000, est: false };
  if (row.h == null || row.h === '') return null;
  return { m: (1329 / Math.sqrt(0.14)) * 10 ** (-Number(row.h) / 5) * 1000, est: true };
}

export function parseName(fullname, des) {
  const full = (fullname || '').trim();
  let m;
  if ((m = /^(\d+)\s+(.+?)\s+\(([^)]+)\)$/.exec(full))) return { num: m[1], name: m[2], des: m[3] }; // 99942 Apophis (2004 MN4)
  if ((m = /^(\d+)\s+\(([^)]+)\)$/.exec(full))) return { num: m[1], name: null, des: m[2] };         // 523934 (1998 FF14)
  if ((m = /^(\d+)\s+(\S.*)$/.exec(full))) return { num: m[1], name: m[2], des: null };               // 433 Eros
  if ((m = /^\(([^)]+)\)$/.exec(full))) return { num: null, name: null, des: m[1] };                  // (2010 HG20)
  return { num: null, name: null, des: des || full || null };
}

export function compact(row, phaSet = new Set()) {
  const d = diameterMeters(row);
  const t = cdToISO(row.cd);
  if (!d || !t || row.dist == null) return null;
  const n = parseName(row.fullname, row.des);
  const au = Number(row.dist);
  return {
    id: row.des,
    name: n.name,
    des: n.des || row.des,
    num: n.num,
    t,
    au: +au.toFixed(6),
    ld: +(au / LD_AU).toFixed(2),
    v: +Number(row.v_rel).toFixed(2),
    h: row.h == null || row.h === '' ? null : Number(row.h),
    d: Math.max(1, Math.round(d.m)),
    dEst: d.est,
    pha: phaSet.has(row.des),
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// ---------- today ----------

export async function buildToday(now = new Date(), api = cad) {
  const day = iso(now);
  let window = { from: day, to: iso(addDays(now, 1)) };
  let rows = [];
  let dist = '0.05';
  for (dist of ['0.05', '0.1', '0.2', '0.3', '0.5']) {
    rows = await api({ 'date-min': window.from, 'date-max': window.to, 'dist-max': dist, kind: 'a' });
    if (rows.length >= 12) break;
  }
  if (rows.length < 6) {
    // Quiet sky: widen to a few days around today.
    window = { from: iso(addDays(now, -1)), to: iso(addDays(now, 2)) };
    dist = '0.3';
    rows = await api({ 'date-min': window.from, 'date-max': window.to, 'dist-max': dist, kind: 'a' });
  }
  const phaRows = await api({ 'date-min': window.from, 'date-max': window.to, 'dist-max': dist, kind: 'a', pha: 'true' });
  const pha = new Set(phaRows.map((r) => r.des));
  const objects = rows
    .map((r) => compact(r, pha))
    .filter(Boolean)
    .sort((a, b) => a.au - b.au)
    .slice(0, 30)
    .sort((a, b) => a.t.localeCompare(b.t));
  return { mode: 'today', date: day, window, distMaxAu: Number(dist), generated: now.toISOString(), source: SOURCE, objects };
}

// ---------- on this day (1900–2100) ----------

// Keep the most interesting flybys for each calendar date: close, big, or hazardous.
export function rankHistory(list, keep = 80) {
  const score = (o) => -Math.log10(Math.max(o.au, 1e-6)) + 0.7 * Math.log10(o.d) + (o.pha ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a)).slice(0, keep);
}

export async function buildHistory(api = cad, log = console.log) {
  const byDay = new Map();
  for (let y = 1900; y < 2100; y += 10) {
    const q = { 'date-min': `${y}-01-01`, 'date-max': `${y + 10}-01-01`, 'dist-max': '0.05', kind: 'a' };
    const rows = await api(q);
    const pha = new Set((await api({ ...q, pha: 'true' })).map((r) => r.des));
    for (const r of rows) {
      const o = compact(r, pha);
      if (!o) continue;
      const key = o.t.slice(5, 10); // MM-DD
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(o);
    }
    log(`  history ${y}s: ${rows.length} flybys`);
    await sleep(400);
  }
  const days = {};
  for (const [key, list] of byDay) days[key] = rankHistory(list);
  return days;
}

// ---------- legends ----------

export const LEGENDS = [
  { key: 'Toutatis', from: '2004-09-26', to: '2004-10-03', blurb: 'Kilometers long and tumbling end over end.' },
  { key: '2012 DA14', from: '2013-02-13', to: '2013-02-18', blurb: 'Passed inside the ring of geostationary satellites on the same day the unrelated Chelyabinsk meteor exploded over Russia.' },
  { key: 'Phaethon', from: '2017-12-12', to: '2017-12-20', blurb: 'The parent body of the Geminid meteor shower.' },
  { key: '2019 OK', from: '2019-07-23', to: '2019-07-28', blurb: 'Spotted only about a day before it flew past.' },
  { key: '2020 QG', from: '2020-08-14', to: '2020-08-19', blurb: 'Skimmed past at a few thousand kilometers, among the closest flybys ever recorded.' },
  { key: '2024 YR4', from: '2024-12-21', to: '2024-12-29', blurb: "Topped the world's asteroid-risk lists in early 2025, until follow-up observations ruled out an Earth impact." },
  { key: 'Apophis', from: '2029-04-10', to: '2029-04-17', blurb: 'Will pass closer than the geostationary satellites in 2029, bright enough to see without a telescope from parts of Earth.' },
];

export function matchesLegend(row, key) {
  const full = ` ${(row.fullname || '').trim()} `;
  return row.des === key || full.includes(`(${key})`) || full.includes(` ${key} `);
}

export async function buildLegends(api = cad, log = console.log) {
  const out = [];
  for (const L of LEGENDS) {
    try {
      const q = { 'date-min': L.from, 'date-max': L.to, 'dist-max': '0.1' };
      const rows = (await api(q)).filter((r) => matchesLegend(r, L.key));
      const pha = new Set((await api({ ...q, pha: 'true' })).map((r) => r.des));
      const best = rows.map((r) => compact(r, pha)).filter(Boolean).sort((a, b) => a.au - b.au)[0];
      if (best) out.push({ ...best, blurb: L.blurb, legend: true });
      else log(`  legend not found: ${L.key}`);
    } catch (e) {
      log(`  legend failed: ${L.key}: ${e.message}`);
    }
    await sleep(300);
  }
  return { mode: 'legends', generated: new Date().toISOString(), source: SOURCE, objects: out.sort((a, b) => a.t.localeCompare(b.t)) };
}

// ---------- main ----------

async function writeJSON(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function main() {
  const force = process.env.FORCE_REFRESH === '1';
  await mkdir(OUT, { recursive: true });
  const warn = (msg) => console.log(`::warning::${msg}`);

  try {
    const today = await buildToday();
    await writeJSON(path.join(OUT, 'today.json'), today);
    console.log(`today: ${today.objects.length} flybys within ${today.distMaxAu} au`);
  } catch (e) {
    warn(`today feed failed, the game will fall back to NASA NeoWs or a simulation: ${e.message}`);
  }

  // Archives are rebuilt monthly (new discoveries add future flybys). If a rebuild
  // fails, the previous cache is kept.
  const stale = async (file) => {
    try {
      const { generated } = JSON.parse(await readFile(file, 'utf8'));
      return Date.now() - Date.parse(generated) > 30 * 86400000;
    } catch {
      return true;
    }
  };

  const histDir = path.join(CACHE, 'history');
  if (force || (await stale(path.join(histDir, 'index.json')))) {
    try {
      const days = await buildHistory();
      for (const [key, list] of Object.entries(days)) await writeJSON(path.join(histDir, `${key}.json`), { mode: 'history', day: key, source: SOURCE, objects: list });
      await writeJSON(path.join(histDir, 'index.json'), { generated: new Date().toISOString(), days: Object.keys(days).length });
      console.log(`history: ${Object.keys(days).length} days cached`);
    } catch (e) {
      warn(`history build failed: ${e.message}`);
    }
  } else console.log('history: using cache');

  const legendsFile = path.join(CACHE, 'legends.json');
  if (force || (await stale(legendsFile))) {
    const legends = await buildLegends();
    if (legends.objects.length) await writeJSON(legendsFile, legends);
    console.log(`legends: ${legends.objects.length}`);
  } else console.log('legends: using cache');

  if (await exists(histDir)) await cp(histDir, path.join(OUT, 'history'), { recursive: true });
  if (await exists(legendsFile)) await cp(legendsFile, path.join(OUT, 'legends.json'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
