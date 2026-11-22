// Leaderboard client. Backend: leaderboard/Code.gs (Google Apps Script + Sheet).

import { LEADERBOARD_URL } from './config.js';
import { store } from './util.js';

// On localhost you can point at a test server with ?lb=http://localhost:8766
const override = location.hostname === 'localhost' ? new URLSearchParams(location.search).get('lb') : null;
const URL_ = override || LEADERBOARD_URL;

export const lbEnabled = () => !!override || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(LEADERBOARD_URL);

export function playerId() {
  let id = store('pid');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^a-zA-Z0-9-]/g, '');
    store('pid', id);
  }
  return id;
}

export const savedName = () => store('name') || '';
export const saveName = (n) => store('name', n);

export function cleanName(s) {
  return (s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
}

async function call(url, opts = {}, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow' });
    const j = await r.json();
    if (!j || j.ok === false) throw new Error((j && j.error) || 'Leaderboard error');
    return j;
  } finally {
    clearTimeout(t);
  }
}

export function fetchTop(board, limit = 10) {
  const q = new URLSearchParams({ action: 'top', board, limit: String(limit), pid: playerId() });
  return call(`${URL_}?${q}`);
}

// text/plain keeps this a "simple" request, which Apps Script accepts cross-origin.
export function submitScore(entry) {
  return call(URL_, { method: 'POST', body: JSON.stringify({ action: 'submit', pid: playerId(), v: 1, ...entry }) });
}
