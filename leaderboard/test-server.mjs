// Runs Code.gs locally with an in-memory Sheet, for tests and local play.
//   node leaderboard/test-server.mjs        → http://localhost:8766
//   then open the game at http://localhost:8000/?lb=http://localhost:8766
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function loadScript() {
  const rows = [];
  const cache = new Map();
  const sheet = {
    appendRow: (r) => rows.push(r),
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
  };
  let created = false;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (created ? sheet : null), insertSheet: () => ((created = true), sheet) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: s }) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Date, JSON, Math, Number, String, Object, isFinite,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), ctx);
  return { ctx, rows, cache };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ctx } = loadScript();
  http
    .createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const send = (out) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(out.body);
      };
      if (req.method === 'GET') return send(ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }));
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => send(ctx.doPost({ postData: { contents: body } })));
    })
    .listen(8766, () => console.log('leaderboard test server on :8766'));
}
