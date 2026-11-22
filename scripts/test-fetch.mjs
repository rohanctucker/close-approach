// Offline checks for the data pipeline, using responses shaped like the real JPL API.
import assert from 'node:assert/strict';
import { toRows, cdToISO, diameterMeters, parseName, compact, buildToday, buildLegends, rankHistory, matchesLegend } from './fetch-data.mjs';

const FIELDS = ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'diameter', 'diameter_sigma', 'fullname'];
const row = (des, cd, dist, v, h, diameter, fullname) => [des, '1', '2461000.5', cd, String(dist), String(dist), String(dist), String(v), String(v), '< 00:01', h == null ? null : String(h), diameter, null, fullname];
const resp = (rows) => ({ signature: { source: 'NASA/JPL SBDB Close Approach Data API', version: '1.5' }, count: rows.length, fields: FIELDS, data: rows });

// Five real flybys for 2026-11-22, as returned by the API (diameters unknown).
const TODAY = [
  row('2010 HG20', '2026-Nov-22 03:45', 0.10913, 10.475, 21.4, null, '       (2010 HG20)'),
  row('2026 WJ', '2026-Nov-22 04:21', 0.00431, 9.236, 27.121, null, '         (2026 WJ)'),
  row('2026 VZ7', '2026-Nov-22 22:16', 0.12462, 11.206, 21.992, null, '        (2026 VZ7)'),
  row('2016 BK1', '2026-Nov-22 23:52', 0.10175, 11.243, 24.8, null, '        (2016 BK1)'),
  row('2026 WC1', '2026-Nov-22 23:54', 0.0151, 19.681, 26.773, null, '        (2026 WC1)'),
];

assert.equal(toRows(resp(TODAY)).length, 5);
assert.deepEqual(toRows({ count: 0 }), []);
assert.equal(cdToISO('2026-Nov-22 03:45'), '2026-11-22T03:45Z');
assert.equal(cdToISO('garbage'), null);

const est = diameterMeters({ h: '21.4', diameter: null });
assert.ok(est.est && est.m > 150 && est.m < 220, `H=21.4 should be ~186 m, got ${est.m}`);
assert.deepEqual(diameterMeters({ h: '15', diameter: '1.2' }), { m: 1200, est: false });
assert.equal(diameterMeters({ h: null, diameter: null }), null);

assert.deepEqual(parseName('99942 Apophis (2004 MN4)'), { num: '99942', name: 'Apophis', des: '2004 MN4' });
assert.deepEqual(parseName('  523934 (1998 FF14)'), { num: '523934', name: null, des: '1998 FF14' });
assert.deepEqual(parseName('       (2010 HG20)'), { num: null, name: null, des: '2010 HG20' });
assert.deepEqual(parseName('433 Eros'), { num: '433', name: 'Eros', des: null });

const c = compact(toRows(resp(TODAY))[1], new Set(['2026 WJ']));
assert.equal(c.des, '2026 WJ');
assert.equal(c.t, '2026-11-22T04:21Z');
assert.ok(Math.abs(c.ld - 1.68) < 0.02, `0.00431 au should be ~1.68 LD, got ${c.ld}`);
assert.equal(c.pha, true);
assert.ok(c.d > 8 && c.d < 20);
assert.equal(c.vi, 9.24, 'keeps v_inf for impact energy');

// buildToday widens the search on a quiet day and never throws on small results.
const calls = [];
const fakeApi = async (q) => {
  calls.push(q);
  if (q.pha) return [];
  return toRows(resp(TODAY));
};
const today = await buildToday(new Date('2026-11-22T05:17:00Z'), fakeApi);
assert.equal(today.date, '2026-11-22');
assert.equal(today.objects.length, 5);
assert.ok(calls.some((q) => q['dist-max'] === '0.5'), 'should widen distance');
assert.equal(today.window.from, '2026-11-21', 'should widen dates when fewer than 6 flybys');
assert.ok(today.objects.every((o, i, a) => i === 0 || a[i - 1].t <= o.t), 'sorted by time');

assert.ok(matchesLegend({ des: '99942', fullname: '99942 Apophis (2004 MN4)' }, 'Apophis'));
assert.ok(matchesLegend({ des: '367943', fullname: '367943 Duende (2012 DA14)' }, '2012 DA14'));
assert.ok(!matchesLegend({ des: '2020 QG1', fullname: '(2020 QG1)' }, '2020 QG'));

const legends = await buildLegends(async (q) => (q.pha ? [] : toRows(resp([row('99942', '2029-Apr-13 21:46', 0.00025, 7.42, 19.09, '0.34', '99942 Apophis (2004 MN4)')]))), () => {});
assert.equal(legends.objects.length, 1, 'only the Apophis window has a matching row');
assert.equal(legends.objects[0].name, 'Apophis');
assert.equal(legends.objects[0].d, 340);

const ranked = rankHistory([{ au: 0.04, d: 10, pha: false }, { au: 0.001, d: 30, pha: false }, { au: 0.03, d: 2000, pha: true }], 2);
assert.equal(ranked.length, 2);
assert.ok(!ranked.some((o) => o.au === 0.04));

console.log('fetch-data tests passed');
