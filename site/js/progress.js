// Long-term progress saved on this device: badges, daily streak, logbook.
// Badges are named after real concepts, so earning one teaches something.

import { store } from './util.js';

const AU_KM = 149597870.7;
const GEO_KM = 42164;

const hitsOf = (run) => run.results.filter((r) => r.status === 'hit').map((r) => r.o);
const year = (o) => +o.t.slice(0, 4);

export const BADGES = [
  { id: 'moon', name: 'INSIDE THE MOON', desc: 'Intercept an asteroid that really passed closer than the Moon (384,400 km).', test: (r) => hitsOf(r).some((o) => o.ld < 1) },
  { id: 'geo', name: 'GEO RING', desc: 'Intercept one that passed inside the ring of geostationary satellites, 42,164 km from Earth\'s center.', test: (r) => hitsOf(r).some((o) => o.au * AU_KM < GEO_KM) },
  { id: 'tunguska', name: 'TUNGUSKA STOPPER', desc: 'Intercept a 30–100 m asteroid, the size class of the rock that flattened 2,150 km² of Siberian forest in 1908.', test: (r) => hitsOf(r).some((o) => o.d >= 30 && o.d < 100) },
  { id: 'pha', name: 'HAZARD HUNTER', desc: 'Intercept a "potentially hazardous" asteroid: roughly 140 m+ on an orbit that comes within 7.5 million km of Earth\'s.', test: (r) => hitsOf(r).some((o) => o.pha) },
  { id: 'km', name: 'KILOMETER CLUB', desc: 'Intercept an asteroid at least 1 km across, the size where impacts have global effects.', test: (r) => hitsOf(r).some((o) => o.d >= 1000) },
  { id: 'past', name: 'TIME TRAVELER', desc: 'Intercept a flyby from before 1950. Astronomers reconstruct old passes from orbits.', test: (r) => hitsOf(r).some((o) => year(o) < 1950) },
  { id: 'future', name: 'FORECASTER', desc: 'Intercept a flyby forecast for a future year. Orbits can be predicted decades ahead.', test: (r) => hitsOf(r).some((o) => year(o) > new Date().getUTCFullYear()) },
  { id: 'intel', name: 'PERFECT INTEL', desc: 'Get every Intel Check right in a run (at least 3 questions).', test: (r) => r.intel.total >= 3 && r.intel.correct === r.intel.total },
  { id: 'clean', name: 'CLEAN SKY', desc: 'Intercept every real asteroid in a run.', test: (r) => r.results.length > 0 && r.results.every((x) => x.status === 'hit') },
  { id: 'streak3', name: 'THREE-DAY ORBIT', desc: "Play Today's Sky three days in a row. Every day is a new, real sky.", test: (r) => r.streak >= 3 },
];

export function earned() {
  return store('badges') || {};
}

// Returns badges newly earned by this run. Only real data counts.
export function awardBadges(run) {
  if (!run.live) return [];
  const have = earned();
  const fresh = BADGES.filter((b) => !have[b.id] && b.test(run));
  if (fresh.length) {
    for (const b of fresh) have[b.id] = Date.now();
    store('badges', have);
  }
  return fresh;
}

// ---------- streak (Today's Sky, by data date) ----------

const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

export function streak(todayISO) {
  const s = store('streak');
  if (!s) return 0;
  const gap = dayNum(todayISO) - dayNum(s.last);
  return gap <= 1 ? s.count : 0;
}

export function bumpStreak(dateISO) {
  const s = store('streak');
  let count = 1;
  if (s) {
    const gap = dayNum(dateISO) - dayNum(s.last);
    if (gap === 0) count = s.count;
    else if (gap === 1) count = s.count + 1;
  }
  store('streak', { last: dateISO, count });
  return count;
}

// ---------- logbook ----------

export function logbook() {
  return store('logbook') || {};
}

export function addToLogbook(o, mode) {
  const book = logbook();
  const key = `${o.id}|${o.t}`;
  if (!book[key]) book[key] = { o, mode, at: Date.now() };
  store('logbook', book);
}
