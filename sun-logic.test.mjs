// node site/sun-logic.test.mjs — the sun against the US Naval Observatory, then the page's
// small logic, then the shipped places. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './sun-logic.js');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
// USNO gives the nearest minute; ours must round to the same minute (±1 for a :30 edge).
const atMin = (name, ms, iso) => {
  const want = Date.parse(iso + ':00Z');
  ok(name, ms != null && Math.abs(Math.round(ms / 60e3) * 60e3 - want) <= 60e3, `got ${ms == null ? ms : new Date(ms).toISOString()} want ${iso}Z`);
};

// --- against USNO ------------------------------------------------------------------------
// aa.usno.navy.mil/api/rstt/oneday, tz=0, fetched 2026-10-26. Each case is the town's own
// calendar date; where its sunrise falls on the previous UTC day, so does the expected value.
const CASES = [
  // label, local date, place, rise UTC, set UTC, noon UTC
  ['Palo Alto, June solstice', [2026, 6, 21], { lat: 37.442, lon: -122.143, tz: 'America/Los_Angeles' }, '2026-06-21T12:48', '2026-06-22T03:33', '2026-06-21T20:10'],
  ['Palo Alto, December solstice', [2026, 12, 21], { lat: 37.442, lon: -122.143, tz: 'America/Los_Angeles' }, '2026-12-21T15:19', '2026-12-22T00:54', '2026-12-21T20:07'],
  ['London, the day the clocks go forward', [2026, 3, 29], { lat: 51.5085, lon: -0.1257, tz: 'Europe/London' }, '2026-03-29T05:43', '2026-03-29T18:29', '2026-03-29T12:05'],
  ['Reykjavík, equinox', [2026, 3, 20], { lat: 64.1355, lon: -21.8954, tz: 'Atlantic/Reykjavik' }, '2026-03-20T07:28', '2026-03-20T19:43', '2026-03-20T13:35'],
  ['Sydney, rise on the previous UTC day', [2026, 10, 26], { lat: -33.8679, lon: 151.2073, tz: 'Australia/Sydney' }, '2026-10-25T19:01', '2026-10-26T08:17', '2026-10-26T01:39'],
  ['Singapore', [2026, 10, 26], { lat: 1.2897, lon: 103.8501, tz: 'Asia/Singapore' }, '2026-10-25T22:46', '2026-10-26T10:51', '2026-10-26T04:49'],
  ['Tromsø, January: the sun is back for 2.6 hours', [2026, 1, 20], { lat: 69.6496, lon: 18.956, tz: 'Europe/Oslo' }, '2026-01-20T09:36', '2026-01-20T12:15', '2026-01-20T10:55'],
  ['Apia, UTC+13 at 172°W', [2026, 10, 27], { lat: -13.8333, lon: -171.7667, tz: 'Pacific/Apia' }, '2026-10-26T16:55', '2026-10-27T05:27', '2026-10-26T23:11'],
];
for (const [label, date, place, rise, set, noon] of CASES) {
  const s = L.sunOn(date, place);
  atMin(`${label}: sunrise`, s.rise, rise);
  atMin(`${label}: sunset`, s.set, set);
  atMin(`${label}: solar noon`, s.noon, noon);
  eq(`${label}: not polar`, s.polar, null);
  eq(`${label}: noon is on the date asked`, L.ymdIn(s.noon, place.tz), date);
}
const tromso = { lat: 69.6496, lon: 18.956, tz: 'Europe/Oslo' };
const mid = L.sunOn([2026, 6, 21], tromso), dark = L.sunOn([2026, 12, 21], tromso);
eq('Tromsø, June: midnight sun (USNO: no rise or set, sun up all day)', [mid.polar, mid.rise, mid.length], ['day', null, 86400e3]);
eq('Tromsø, December: polar night (USNO: no rise or set)', [dark.polar, dark.set, dark.length], ['night', null, 0]);
atMin('Tromsø, polar night still has a noon', dark.noon, '2026-12-21T10:42');
// Without the step to the right solar day, Apia's 27 October would be its 28th.
const naive = L.sunDay(2026, 10, 27, -13.8333, -171.7667);
ok('Apia: the naive solar day is the wrong local date', JSON.stringify(L.ymdIn(naive.noon, 'Pacific/Apia')) === '[2026,10,28]');

// --- clocks in the town's own zone ------------------------------------------------------
const lon = L.sunOn([2026, 3, 29], CASES[2][2]);
eq('London sunrise in BST, rounded to the minute', L.clock(lon.rise, 'Europe/London', 'en-US'), '6:43 AM');
eq('the same instant in Los Angeles', L.clock(lon.rise, 'America/Los_Angeles', 'en-US'), '10:43 PM');
eq('rounding, not truncation', [L.clock(Date.UTC(2026, 0, 1, 12, 0, 29), 'UTC', 'en-GB'), L.clock(Date.UTC(2026, 0, 1, 12, 0, 31), 'UTC', 'en-GB')], ['12:00', '12:01']);
eq('ymdIn across midnight', [L.ymdIn(Date.UTC(2026, 9, 26, 23, 30), 'Asia/Tokyo'), L.ymdIn(Date.UTC(2026, 9, 26, 3), 'America/Los_Angeles')], [[2026, 10, 27], [2026, 10, 25]]);
eq('addDays across months and years', [L.addDays([2026, 1, 31], 1), L.addDays([2026, 12, 31], 1), L.addDays([2028, 3, 1], -1)], [[2026, 2, 1], [2027, 1, 1], [2028, 2, 29]]);

// --- the year ----------------------------------------------------------------------------
const pa = CASES[0][2];
const yl = L.yearLengths(2026, pa);
eq('a year of days', [yl.length, L.yearLengths(2028, pa).length], [365, 366]);
const ex = L.extremes(yl);
eq('Palo Alto: longest day 20 or 21 June, shortest 21 or 22 December', [L.dayOfYear(2026, ex.longest).slice(1), L.dayOfYear(2026, ex.shortest).slice(1)].map(([m, d]) => `${m}-${d}`).map((s) => ['6-20', '6-21', '12-21', '12-22'].includes(s)), [true, true]);
ok('Palo Alto: 14 h 45 min at most, 9 h 34 min at least', Math.abs(yl[ex.longest] - (14 * 60 + 45) * 60e3) < 120e3 && Math.abs(yl[ex.shortest] - (9 * 60 + 34) * 60e3) < 120e3, [L.hm(yl[ex.longest]), L.hm(yl[ex.shortest])]);
const ty = L.yearLengths(2026, tromso);
ok('Tromsø: weeks of 24 h and weeks of 0', ty.filter((v) => v === 86400e3).length > 50 && ty.filter((v) => v === 0).length > 40, [ty.filter((v) => v === 86400e3).length, ty.filter((v) => v === 0).length]);
const sy = L.extremes(L.yearLengths(2026, CASES[4][2]));
eq('Sydney: the longest day is in December', L.dayOfYear(2026, sy.longest)[1], 12);

// --- words -------------------------------------------------------------------------------
eq('hours and minutes', [L.hm(53098e3), L.hm(0), L.hm(86400e3)], ['14 h 45 min', '0 h 00 min', '24 h 00 min']);
eq('change since yesterday', [L.delta(151e3), L.delta(-64e3), L.delta(4e3), L.delta(0)], ['+2 min 31 s', '−1 min 4 s', '+4 s', '±0 s']);
eq('dates in words', L.dateWords([2026, 12, 21]), '21 December');

// --- places and URL ------------------------------------------------------------------------
const pl = [
  ['Springfield', 'Missouri', 'United States', 37.2, -93.3, 170000, 0],
  ['Springfield', 'Illinois', 'United States', 39.8, -89.6, 114000, 0],
  ['Spring', 'Texas', 'United States', 30.1, -95.4, 60000, 0],
  ['Tromsø', 'Troms', 'Norway', 69.649, 18.955, 41915, 1],
];
const zones = ['America/Chicago', 'Europe/Oslo'];
eq('whole name first', L.matchPlaces(pl, 'spring').map(L.placeLabel)[0], 'Spring, Texas, United States');
eq('by region', L.matchPlaces(pl, 'springfield, ill').map(L.placeLabel), ['Springfield, Illinois, United States']);
eq('folded', L.matchPlaces(pl, 'TROMSO').length, 1);
eq('label round trip', L.placeByLabel(pl, 'tromsø, troms, norway'), pl[3]);
eq('biggest in a zone', [L.biggestIn(pl, zones, 'Europe/Oslo')[0], L.biggestIn(pl, zones, 'Asia/Tokyo')], ['Tromsø', null]);
eq('to a place', L.toPlace(pl[3], zones), { label: 'Tromsø, Troms, Norway', lat: 69.649, lon: 18.955, tz: 'Europe/Oslo' });
const today = [2026, 10, 26];
eq('today is not in the URL', L.encodeState({ at: 'A', date: today, today }), '?at=A');
const st = { at: 'Palo Alto, California, United States', vs: 'Tromsø, Troms, Norway', date: [2026, 12, 21], today };
eq('round trip', L.decodeState(L.encodeState(st)), { at: st.at, vs: st.vs, date: [2026, 12, 21] });
eq('a bad date is dropped', [L.decodeState('?d=2026-02-30').date, L.decodeState('?d=junk').date], [null, null]);

// --- the shipped places --------------------------------------------------------------------
const f = here('./data/places.json');
if (existsSync(f)) {
  const D = JSON.parse(readFileSync(f, 'utf8'));
  ok('shipped: 31,000+ places', D.places.length > 31000, D.places.length);
  eq('shipped: every zone index resolves and Intl knows the zone', D.places.every((p) => D.zones[p[6]]) && D.zones.every((z) => { try { L.ymdIn(0, z); return true; } catch { return false; } }), true);
  const apia = L.placeByLabel(D.places, 'Apia, Tuamasaga, Samoa');
  eq('shipped: Apia keeps Samoa time', apia && D.zones[apia[6]], 'Pacific/Apia');
  eq('shipped: palo alto', L.placeLabel(L.matchPlaces(D.places, 'palo alto')[0]), 'Palo Alto, California, United States');
  eq('shipped: the biggest town in Los Angeles time', L.biggestIn(D.places, D.zones, 'America/Los_Angeles')[0], 'Los Angeles');
} else ok('shipped: data/places.json exists (run build.py)', false);

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
