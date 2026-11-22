// Offline tests for the Apps Script leaderboard.
import assert from 'node:assert/strict';
import { loadScript } from './test-server.mjs';

const { ctx, rows, cache } = loadScript();
const today = new Date().toISOString().slice(0, 10);
const board = `today:${today}`;
const post = (d) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'submit', board, total: 5, hits: 5, intel: 4, intelTotal: 5, duration: 120, v: 1, ...d }) } }).body);
const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).body);

let r = post({ name: 'rohan', pid: 'aaaaaaaa-1', score: 12000 });
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(r.rank, 1);
assert.equal(r.top[0].name, 'ROHAN', 'names are uppercased');
assert.equal(r.top[0].mine, true);

r = post({ name: 'Kay', pid: 'bbbbbbbb-2', score: 15000 });
assert.equal(r.rank, 1);
r = post({ name: 'rohan', pid: 'aaaaaaaa-1', score: 9000 }); // worse run keeps best
assert.equal(r.rank, 2);
assert.equal(r.top[1].score, 12000);
r = post({ name: 'ROHAN T', pid: 'aaaaaaaa-1', score: 8000 }); // new name sticks
assert.equal(r.top.find((x) => x.mine).name, 'ROHAN T');
assert.equal(r.count, 2);

// Rejections
assert.equal(post({ name: 'x', pid: 'cccccccc-3', score: 10 }).ok, false, 'short name');
assert.equal(post({ name: 'b1tch', pid: 'cccccccc-3', score: 10 }).ok, false, 'blocked name');
assert.equal(post({ name: 'GRAPE', pid: 'cccccccc-3', score: 10 }).ok, true, 'no false positive on GRAPE');
assert.equal(post({ name: 'CHEAT', pid: 'dddddddd-4', score: 9_999_999 }).ok, false, 'impossible score');
assert.equal(post({ name: 'FAST', pid: 'dddddddd-4', score: 100, duration: 3 }).ok, false, 'too fast');
assert.equal(post({ name: 'OLD', pid: 'dddddddd-4', score: 100, board: 'today:2020-01-01' }).ok, false, 'old board closed');
assert.equal(post({ name: 'BAD', pid: 'short', score: 100 }).ok, false, 'bad pid');
for (let i = 0; i < 6; i++) post({ name: 'SPAM', pid: 'eeeeeeee-5', score: 100 + i });
assert.match(post({ name: 'SPAM', pid: 'eeeeeeee-5', score: 1 }).error, /slow down/);

// GET top + legends board
const g = get({ action: 'top', board, limit: '2', pid: 'cccccccc-3' });
assert.equal(g.top.length, 2);
assert.ok(g.me && g.me.rank > 2, 'returns your own row when outside the top');
assert.equal(post({ name: 'LEGEND', pid: 'ffffffff-6', score: 5000, board: 'legends:all' }).ok, true);
assert.equal(get({ action: 'top', board: 'bogus' }).ok, false);
assert.ok(rows.length > 5 && cache);

console.log('leaderboard tests passed');
