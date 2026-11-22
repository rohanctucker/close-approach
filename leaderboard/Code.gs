/**
 * Close Approach leaderboard: a Google Apps Script web app backed by this Sheet.
 *
 * Setup (about 2 minutes):
 *   1. Create a Google Sheet (any name). Extensions → Apps Script.
 *   2. Replace Code.gs with this file. Save.
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as: Me      Who has access: Anyone
 *   4. Copy the /exec URL into site/js/config.js (LEADERBOARD_URL) and push.
 *
 * API
 *   GET  ?action=top&board=today:2026-11-22&limit=10&pid=...
 *   POST (text/plain JSON) {action:'submit', board, name, pid, score, intel, intelTotal, hits, total, duration, v}
 *
 * Boards: "today:YYYY-MM-DD", "history:YYYY-MM-DD", "legends:all".
 * Each player (pid) keeps their best score per board, shown under their latest name.
 * Scores come from the browser, so a determined cheater could fake one; the checks
 * below reject impossible values and spam, which is plenty for friends.
 */

var SHEET = 'scores';
var HEADERS = ['ts', 'board', 'name', 'pid', 'score', 'intel', 'intelTotal', 'hits', 'total', 'duration', 'version'];
var BLOCK_PARTS = ['fuck', 'shit', 'cunt', 'nigg', 'bitch', 'whore', 'slut', 'nazi', 'hitler', 'pussy', 'porn', 'retard', 'twat', 'wank', 'asshole', 'faggot'];
var BLOCK_WORDS = ['fag', 'rape', 'cock', 'kkk', 'dick', 'cum'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'top') return json_(top_(String(p.board || ''), Number(p.limit) || 10, String(p.pid || '')));
    return json_({ ok: true, service: 'close-approach-leaderboard' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.action === 'submit') return json_(submit_(d));
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- validation ----------

function validBoard_(board) {
  if (board === 'legends:all') return true;
  var m = /^(today|history):(\d{4}-\d{2}-\d{2})$/.exec(board);
  if (!m) return false;
  var days = Math.abs(Date.parse(m[2] + 'T00:00:00Z') - Date.now()) / 86400000;
  return days <= 2.5; // only today's boards accept new scores (time zones allowed)
}

function cleanName_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

function blocked_(name) {
  var n = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  var squashed = n.replace(/[^a-z]/g, '');
  for (var i = 0; i < BLOCK_PARTS.length; i++) if (squashed.indexOf(BLOCK_PARTS[i]) >= 0) return true;
  var words = n.split(/[^a-z]+/);
  for (var j = 0; j < words.length; j++) if (BLOCK_WORDS.indexOf(words[j]) >= 0) return true;
  return false;
}

// Generous ceiling on what a real run can score (see site/js/game.js).
function maxScore_(total, intelTotal) {
  return total * 12500 + 60000 + intelTotal * 800;
}

function int_(v, lo, hi) {
  var n = Math.floor(Number(v));
  if (!isFinite(n) || n < lo || n > hi) throw new Error('invalid number');
  return n;
}

function submit_(d) {
  var board = String(d.board || '');
  if (!validBoard_(board)) throw new Error('board closed');
  var name = cleanName_(d.name);
  if (name.length < 2) throw new Error('name too short');
  if (blocked_(name)) throw new Error('pick another name');
  var pid = String(d.pid || '');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(pid)) throw new Error('bad player id');

  var total = int_(d.total, 1, 40);
  var hits = int_(d.hits, 0, total);
  var intelTotal = int_(d.intelTotal, 0, 10);
  var intel = int_(d.intel, 0, intelTotal);
  var score = int_(d.score, 0, maxScore_(total, intelTotal));
  var duration = int_(d.duration, 15, 7200);

  // Rate limit: 6 posts per player per minute.
  var cache = CacheService.getScriptCache();
  var rk = 'rl:' + pid;
  var count = Number(cache.get(rk) || 0);
  if (count >= 6) throw new Error('slow down');
  cache.put(rk, String(count + 1), 60);

  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    sheet_().appendRow([new Date().toISOString(), board, name, pid, score, intel, intelTotal, hits, total, duration, Number(d.v) || 0]);
  } finally {
    lock.releaseLock();
  }
  cache.remove('top:' + board);
  return top_(board, 10, pid);
}

// ---------- ranking ----------

function ranked_(board) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('top:' + board);
  if (hit) return JSON.parse(hit);
  var values = sheet_().getDataRange().getValues();
  var byPid = {};
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r[1] !== board) continue;
    var row = { ts: String(r[0]), name: String(r[2]), pid: String(r[3]), score: Number(r[4]), intel: Number(r[5]), intelTotal: Number(r[6]), hits: Number(r[7]), total: Number(r[8]) };
    var cur = byPid[row.pid];
    if (!cur) {
      byPid[row.pid] = { best: row, latestName: row.name, latestTs: row.ts };
      continue;
    }
    if (row.score > cur.best.score) cur.best = row;
    if (row.ts >= cur.latestTs) { // rows are appended in order, so later rows win ties
      cur.latestTs = row.ts;
      cur.latestName = row.name;
    }
  }
  var list = Object.keys(byPid).map(function (k) {
    var b = byPid[k].best;
    return { ts: b.ts, name: byPid[k].latestName, pid: b.pid, score: b.score, intel: b.intel, intelTotal: b.intelTotal, hits: b.hits, total: b.total };
  });
  list.sort(function (a, b) { return b.score - a.score || (a.ts < b.ts ? -1 : 1); });
  try {
    cache.put('top:' + board, JSON.stringify(list), 30);
  } catch (e) {
    /* too big to cache: fine */
  }
  return list;
}

function top_(board, limit, pid) {
  if (!/^(today|history):\d{4}-\d{2}-\d{2}$|^legends:all$/.test(board)) throw new Error('bad board');
  limit = Math.max(1, Math.min(50, limit));
  var list = ranked_(board);
  var rank = 0;
  for (var i = 0; i < list.length; i++) if (list[i].pid === pid) { rank = i + 1; break; }
  var out = list.slice(0, limit).map(function (r, i) {
    return { rank: i + 1, name: r.name, score: r.score, intel: r.intel, intelTotal: r.intelTotal, hits: r.hits, total: r.total, mine: r.pid === pid };
  });
  var me = null;
  if (rank > limit) {
    var r = list[rank - 1];
    me = { rank: rank, name: r.name, score: r.score, intel: r.intel, intelTotal: r.intelTotal, hits: r.hits, total: r.total, mine: true };
  }
  return { ok: true, board: board, count: list.length, rank: rank, top: out, me: me };
}
