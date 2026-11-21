// node site/sun-logic.test.mjs — the sun against the US Naval Observatory, then the page's
// small logic, then the shipped places. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './sun-logic.js');
const Moon = await import(process.env.MOON ? pathToFileURL(process.env.MOON).href : './moon-logic.js');
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
// USNO, fetched 2026-10-27: the days the polar night and the midnight sun begin and end.
// The last and first sunrises are 22 and 50 minutes long, the hardest days to get right.
const edges = [];
for (let k = [2026, 1, 1], prev = 'night'; k[0] === 2026; k = L.addDays(k, 1)) {
  const s = L.sunOn(k, tromso); if (s.polar !== prev) edges.push(`${k[1]}-${k[2]} ${s.polar}`); prev = s.polar;
}
eq('Tromsø 2026: polar night ends 15 Jan, midnight sun 18 May-25 Jul, polar night from 28 Nov (USNO)', edges, ['1-15 null', '5-18 day', '7-26 null', '11-28 night']);
const jan15 = L.sunOn([2026, 1, 15], tromso), nov27 = L.sunOn([2026, 11, 27], tromso);
atMin('Tromsø, 15 Jan: the first sunrise', jan15.rise, '2026-01-15T10:29');
atMin('Tromsø, 15 Jan: and its sunset', jan15.set, '2026-01-15T11:19');
atMin('Tromsø, 27 Nov: the last sunrise', nov27.rise, '2026-11-27T10:20');
atMin('Tromsø, 27 Nov: and its sunset', nov27.set, '2026-11-27T10:42');
// Without the step to the right solar day, Apia's 27 October would be its 28th.
const naive = L.sunDay(2026, 10, 27, -13.8333, -171.7667);
ok('Apia: the naive solar day is the wrong local date', JSON.stringify(L.ymdIn(naive.noon, 'Pacific/Apia')) === '[2026,10,28]');

// --- the solar equations, against NOAA's own code --------------------------------------
// gml.noaa.gov/grad/solcalc/main.js, fetched 2026-10-27: calcSunDeclination and
// calcEquationOfTime at these instants (y, m, d, hour UTC). Across 1950-2100 at weekly steps
// ours agreed to 1e-13; USNO's minutes above cannot see a wrong coefficient that moves the
// sun by seconds, and the page prints the change since yesterday to the second.
const NOAA = [[[1950, 1, 1, 0], -23.070776202, -3.245631473], [[2000, 1, 1, 12], -23.032515938, -3.301258802],
  [[2026, 3, 20, 14.5], -0.002124227, -7.40214195], [[2026, 6, 21, 20], 23.437318513, -1.896727833],
  [[2026, 10, 27, 3], -12.752696686, 16.141681392], [[2026, 12, 21, 20], -23.437833655, 1.757763975],
  [[2050, 9, 23, 6], -0.169559248, 7.575862579], [[2099, 7, 4, 18], 22.781760546, -4.733078292]];
for (const [[y, m, d, hr], decl, eot] of NOAA) {
  const s = L.solar(L.jd0(y, m, d) + hr / 24);
  ok(`NOAA ${y}-${m}-${d} ${hr}h: declination and equation of time`, Math.abs(s.decl - decl) < 1e-8 && Math.abs(s.eot - eot) < 1e-8, JSON.stringify([s.decl, s.eot]));
}
// Each time sunDay returns is the instant the equations put the sun there, not an
// approximation to it: put the sun's position AT that instant back in and the same instant
// comes out, to 0.1 s. Two refinement passes left up to 1.25 s here (and a wrong second in
// "since yesterday" on 3 of 2,184 town-days); three leave 0.05 s.
const fixedPoint = (lat, lon, [y, m, d], zenith = L.ZENITH) => {
  const s = L.sunDay(y, m, d, lat, lon, zenith), base = L.jd0(y, m, d), u = Date.UTC(y, m - 1, d);
  const at = (ms) => L.solar(base + (ms - u) / 864e5);
  const ha = (ms) => { const x = at(ms), R = Math.PI / 180;
    return Math.acos(Math.max(-1, Math.min(1, Math.cos(zenith * R) / (Math.cos(lat * R) * Math.cos(x.decl * R)) - Math.tan(lat * R) * Math.tan(x.decl * R)))) * 180 / Math.PI; };
  const solarNoon = (ms) => u + (720 - 4 * lon - at(ms).eot) * 60e3;
  const noonErr = Math.abs(solarNoon(s.noon) - s.noon);
  const errs = [noonErr];
  if (!s.polar) errs.push(Math.abs(solarNoon(s.rise) - 4 * ha(s.rise) * 60e3 - s.rise), Math.abs(solarNoon(s.set) + 4 * ha(s.set) * 60e3 - s.set));
  return [Math.max(...errs), noonErr];
};
// Measured 2026-11-19 on these six sites: events 2.1 ms worst, noon 0.05 ms. The bounds sit
// ~5x and ~20x above that: a wrong first guess (4 -> 5 min/deg) leaves 31 ms, and noon
// evaluated at the wrong fraction of a day (noonMin / 1441) leaves 17 ms. Not every site is
// this good: on a 3° grid the third pass still leaves up to 0.15 s at 63° S in civil twilight.
let worstFix = 0, worstNoon = 0;
for (const [lat, lon] of [[37.44, -122.14], [64.13, -21.9], [-33.87, 151.2], [1.29, 103.85], [65.5, 25], [-54.8, -68.3]])
  for (let k = [2026, 1, 1]; k[0] === 2026; k = L.addDays(k, 5)) for (const z of [L.ZENITH, L.CIVIL]) {
    const [e, n] = fixedPoint(lat, lon, k, z);
    worstFix = Math.max(worstFix, e); worstNoon = Math.max(worstNoon, n);
  }
ok('every rise, set and noon is a fixed point of the equations (10 ms)', worstFix < 10, `${worstFix.toFixed(1)} ms`);
ok('every noon is a fixed point of the equations (1 ms)', worstNoon < 1, `${worstNoon.toFixed(3)} ms`);

// --- civil twilight, against USNO (sun 6° below the horizon) -------------------------
const civ = (date, place) => L.lightOn(date, place);
atMin('Palo Alto, 26 Oct: first light', civ([2026, 10, 26], { lat: 37.4419, lon: -122.143, tz: 'America/Los_Angeles' }).first, '2026-10-26T14:01');
const rey = civ([2026, 3, 20], CASES[3][2]);
atMin('Reykjavík, equinox: first light', rey.first, '2026-03-20T06:41');
atMin('Reykjavík, equinox: last light', rey.last, '2026-03-20T20:31');
const tw = civ([2026, 12, 21], tromso);
atMin('Tromsø, polar night: twilight begins', tw.first, '2026-12-21T08:31');
atMin('Tromsø, polar night: twilight ends', tw.last, '2026-12-21T12:53');
eq('Tromsø, polar night: no sunrise but twilight', L.lightKind(dark, tw), 'twilight');
// USNO: St Petersburg on 21 June has civil dusk at 21:11 UTC and dawn at 22:51, so it is not a white night.
const spb = { lat: 59.9386, lon: 30.3141, tz: 'Europe/Moscow' };
eq('St Petersburg, June: dark for a while, not a white night', L.lightKind(L.sunOn([2026, 6, 21], spb), civ([2026, 6, 21], spb)), null);
const anc = { lat: 61.218, lon: -149.9, tz: 'America/Anchorage' };
eq('Anchorage, June: the sun sets and it never gets dark', [L.sunOn([2026, 6, 21], anc).polar, civ([2026, 6, 21], anc).polar, L.lightKind(L.sunOn([2026, 6, 21], anc), civ([2026, 6, 21], anc))], [null, 'day', 'white']);
eq('Tromsø, June: midnight sun is not called a white night', L.lightKind(mid, civ([2026, 6, 21], tromso)), null);

// --- golden hour, against USNO's sun altitude (centre 6° above to 4° below) ----------------
// USNO has no golden-hour table, so each boundary is checked the other way round: our time,
// to the minute, must be USNO's, and USNO's own altitude for that point (api/celnav, Hc, the
// geometric altitude of the sun's centre, fetched 2026-11-14) must be on either side of the
// band's edge one minute before and one minute after. So ours is within two minutes of
// USNO's crossing, and the fixture can't simply agree with itself.
const GOLD_TOWNS = {
  'Palo Alto': [[2026, 11, 14], CASES[0][2], 'two'],
  'London midsummer': [[2026, 6, 21], CASES[2][2], 'two'],
  'Singapore': [[2026, 10, 26], CASES[5][2], 'two'],
  'Sydney': [[2026, 10, 26], CASES[4][2], 'two'],
  'Reykjavik midsummer': [[2026, 6, 21], CASES[3][2], 'night'],
  'Tromso Jun 21': [[2026, 6, 21], tromso, 'night'],
  'Tromso Jan 20': [[2026, 1, 20], tromso, 'day'],
  'Tromso Dec 21': [[2026, 12, 21], tromso, 'day'],
};
const GOLD = [  // town, edge, USNO minute (UTC), edge altitude, USNO Hc a minute before, a minute after
  ["Palo Alto", 'm0', '2026-11-14T14:30', -4, -4.204, -3.831],
  ["Palo Alto", 'm1', '2026-11-14T15:25', 6, 5.746, 6.095],
  ["Palo Alto", 'e0', '2026-11-15T00:20', 6, 6.223, 5.875],
  ["Palo Alto", 'e1', '2026-11-15T01:16', -4, -3.882, -4.255],
  ["London midsummer", 'm0', '2026-06-21T03:15', -4, -4.085, -3.871],
  ["London midsummer", 'm1', '2026-06-21T04:37', 6, 5.822, 6.09],
  ["London midsummer", 'e0', '2026-06-21T19:27', 6, 6.175, 5.908],
  ["London midsummer", 'e1', '2026-06-21T20:50', -4, -3.91, -4.123],
  ["Singapore", 'm0', '2026-10-25T22:33', -4, -4.336, -3.848],
  ["Singapore", 'm1', '2026-10-25T23:14', 6, 5.673, 6.161],
  ["Singapore", 'e0', '2026-10-26T10:23', 6, 6.202, 5.714],
  ["Singapore", 'e1', '2026-10-26T11:04', -4, -3.801, -4.289],
  ["Reykjavik midsummer", 'start', '2026-06-21T22:07', 6, 6.045, 5.89],
  ["Reykjavik midsummer", 'end', '2026-06-21T04:52', 6, 5.904, 6.06],
  ["Tromso Jan 20", 'start', '2026-01-20T08:17', -4, -4.076, -3.972],
  ["Tromso Jan 20", 'end', '2026-01-20T13:34', -4, -3.96, -4.064],
  ["Tromso Dec 21", 'start', '2026-12-21T09:30', -4, -4.012, -3.963],
  ["Tromso Dec 21", 'end', '2026-12-21T11:55', -4, -3.977, -4.027],
  ["Tromso Jun 21", 'start', '2026-06-21T20:35', 6, 6.049, 5.962],
  ["Tromso Jun 21", 'end', '2026-06-21T00:57', 6, 5.964, 6.051],
  ["Sydney", 'm0', '2026-10-25T18:45', -4, -4.296, -3.9],
  ["Sydney", 'm1', '2026-10-25T19:35', 6, 5.758, 6.166],
  ["Sydney", 'e0', '2026-10-26T07:44', 6, 6.133, 5.726],
  ["Sydney", 'e1', '2026-10-26T08:33', -4, -3.712, -4.107],
];
const goldEdge = (g, k) => ({ m0: g.morning?.[0], m1: g.morning?.[1], e0: g.evening?.[0], e1: g.evening?.[1], start: g.start, end: g.end })[k];
for (const [town, [date, place, kind]] of Object.entries(GOLD_TOWNS)) eq(`golden hour, ${town}: ${kind}`, L.goldenOn(date, place).kind, kind);
for (const [town, k, iso, alt, before, after] of GOLD) {
  const [date, place] = GOLD_TOWNS[town];
  ok(`golden hour, ${town} ${k}: USNO crosses ${alt}° in that minute`, Math.min(before, after) <= alt && alt <= Math.max(before, after), `${before} ${after}`);
  atMin(`golden hour, ${town} ${k}`, goldEdge(L.goldenOn(date, place), k), iso);
}
ok('golden hour: all 24 USNO edges checked', GOLD.length === 24, GOLD.length);
// Longyearbyen (78.2° N): the sun stays above 6° all through 21 June and below -4° all
// through 21 December, as declination ±23.4° says it must (min 11.7°, max -11.7°).
const lyr = { lat: 78.2232, lon: 15.6267, tz: 'Arctic/Longyearbyen' };
eq('golden hour, Longyearbyen June: never that low', L.goldenOn([2026, 6, 21], lyr), { kind: 'high' });
eq('golden hour, Longyearbyen December: never that high', L.goldenOn([2026, 12, 21], lyr), { kind: 'dark' });
// At the pole the sun circles at its declination, about 0° on 20 March, so it stays in the band all day.
// --- blue hour: the sun's centre 4° to 6° below the horizon -----------------------------
// Its -4° edges are golden hour's (checked above); the -6° edges and the polar kinds are
// checked against USNO celnav Hc a minute either side, fetched 2026-11-16.
const BLUE_TOWNS = { ...GOLD_TOWNS,
  'Tampere midsummer': [[2026, 6, 21], { lat: 61.4978, lon: 23.761, tz: 'Europe/Helsinki' }],
  'Hammerfest Dec 21': [[2026, 12, 21], { lat: 70.6634, lon: 23.6821, tz: 'Europe/Oslo' }] };
const BLUE_KINDS = { 'Palo Alto': 'two', 'London midsummer': 'two', 'Singapore': 'two', 'Sydney': 'two',
  'Reykjavik midsummer': 'high', 'Tromso Jun 21': 'high', 'Tromso Jan 20': 'two', 'Tromso Dec 21': 'two',
  'Tampere midsummer': 'night', 'Hammerfest Dec 21': 'day' };
for (const [town, kind] of Object.entries(BLUE_KINDS)) eq(`blue hour, ${town}: ${kind}`, L.blueOn(...BLUE_TOWNS[town]).kind, kind);
const BLUE = [  // town, edge, USNO minute (UTC), edge altitude, USNO Hc a minute before, a minute after
  ["Palo Alto", 'm0', '2026-11-14T14:19', -6, -6.265557, -5.889266],
  ["Palo Alto", 'e1', '2026-11-15T01:26', -6, -5.753211, -6.129371],
  ["London midsummer", 'm0', '2026-06-21T02:55', -6, -6.126228, -5.92975],
  ["London midsummer", 'e1', '2026-06-21T21:09', -6, -5.867077, -6.064122],
  ["Singapore", 'm0', '2026-10-25T22:25', -6, -6.289887, -5.801415],
  ["Singapore", 'e1', '2026-10-26T11:12', -6, -5.753045, -6.241173],
  ["Sydney", 'm0', '2026-10-25T18:35', -6, -6.264135, -5.871801],
  ["Sydney", 'e1', '2026-10-26T08:44', -6, -5.875553, -6.266707],
  ["Tromso Jan 20", 'm0', '2026-01-20T07:42', -6, -6.077808, -5.95498],
  ["Tromso Jan 20", 'e1', '2026-01-20T14:09', -6, -5.93945, -6.062053],
  ["Tromso Dec 21", 'm0', '2026-12-21T08:31', -6, -6.052419, -5.965574],
  ["Tromso Dec 21", 'e1', '2026-12-21T12:53', -6, -5.947693, -6.034292],
  ["Tampere midsummer", 'start', '2026-06-21T21:20', -4, -3.970275, -4.033385],
  ["Tampere midsummer", 'end', '2026-06-20T23:34', -4, -4.017819, -3.954272],
  ["Hammerfest Dec 21", 'start', '2026-12-21T08:35', -6, -6.048609, -5.979137],
  ["Hammerfest Dec 21", 'end', '2026-12-21T12:11', -6, -5.958788, -6.027906],
];
for (const [town, k, iso, alt, before, after] of BLUE) {
  ok(`blue hour, ${town} ${k}: USNO crosses ${alt}° in that minute`, Math.min(before, after) <= alt && alt <= Math.max(before, after), `${before} ${after}`);
  atMin(`blue hour, ${town} ${k}`, goldEdge(L.blueOn(...BLUE_TOWNS[town]), k), iso);
}
ok('blue hour: all 16 USNO edges checked', BLUE.length === 16, BLUE.length);
// Where both bands come in pairs, blue hour meets golden hour at -4° exactly: the evening's
// golden ends when its blue begins, and the morning's blue ends when golden begins.
for (const town of ['Palo Alto', 'London midsummer', 'Singapore', 'Sydney']) {
  const b = L.blueOn(...GOLD_TOWNS[town]), g = L.goldenOn(...GOLD_TOWNS[town]);
  eq(`blue meets golden at -4°, ${town}`, [b.morning[1], b.evening[0]], [g.morning[0], g.evening[1]]);
}
eq('blue hour, Longyearbyen December: never that high', L.blueOn([2026, 12, 21], lyr), { kind: 'dark' });

eq('golden hour, the North Pole at the equinox: all day', L.goldenOn([2026, 3, 20], { lat: 89.99, lon: 0, tz: 'UTC' }), { kind: 'all' });

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
// Weeks of 24 h at Tromsø tie: the longest day is the first of them, and so is the shortest.
eq('extremes: the first of a tie', L.extremes([1, 1, 3, 3, 2]), { longest: 2, shortest: 0 });

// Earliest sunset and latest sunrise on the town's clock, against USNO rstt/oneday in the
// town's offset (fetched 2026-10-30). The clock minute holds for days, and a run's end can
// sit on a :30 edge, so each end may be a day off; the minute itself must match.
const near = (a, b) => Math.abs(Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) <= 86400e3;
const runIs = (name, e, tz, hhmm, first, last, clocks) => {
  const got = e && L.clock(e.ms, tz, 'en-GB');
  ok(name, e && got === hhmm && near(e.first, first) && near(e.last, last) && JSON.stringify(e.clocks) === JSON.stringify(clocks),
    JSON.stringify(e && { got, first: e.first, last: e.last, clocks: e.clocks }));
};
const london = { lat: 51.5085, lon: -0.1257, tz: 'Europe/London' };
const cpa = L.clockExtremes(2026, pa), cln = L.clockExtremes(2026, london), csy = L.clockExtremes(2026, CASES[4][2]), ctr = L.clockExtremes(2026, tromso);
runIs('Palo Alto: earliest sunset 16:50, 3-9 December (USNO)', cpa.set, pa.tz, '16:50', [2026, 12, 3], [2026, 12, 9], null);
runIs('Palo Alto: latest sunrise 07:33 on 31 October, the last morning before the clocks go back (USNO; January is 07:23)', cpa.rise, pa.tz, '7:33', [2026, 10, 31], [2026, 10, 31], { dir: 'back', when: 'before' });
runIs('London: earliest sunset 15:51, 11-14 December (USNO)', cln.set, london.tz, '15:51', [2026, 12, 11], [2026, 12, 14], null);
runIs('London: latest sunrise 08:06 in early January (USNO 1 and 4 January)', cln.rise, london.tz, '8:06', [2026, 1, 1], [2026, 1, 4], null);
runIs('Sydney: latest sunrise 07:09 on 4 April, until the clocks go back on the 5th (USNO 06:10)', csy.rise, CASES[4][2].tz, '7:09', [2026, 4, 4], [2026, 4, 4], { dir: 'back', when: 'before' });
runIs('Sydney: earliest sunset 16:53 in June (USNO 5 and 19 June)', csy.set, CASES[4][2].tz, '16:53', [2026, 6, 5], [2026, 6, 19], null);
runIs('Tromsø: earliest sunset 11:42 on 27 November, before polar night (USNO); not a sunset after midnight in May', ctr.set, tromso.tz, '11:42', [2026, 11, 27], [2026, 11, 27], null);
runIs('Tromsø: latest sunrise 11:29 on 15 January, the first after polar night (USNO)', ctr.rise, tromso.tz, '11:29', [2026, 1, 15], [2026, 1, 15], null);
// The run's edges on made-up days (mutwatch, 2026-11-03): the towns above cannot reach them.
eq('London\'s run starts on 1 January itself, the year\'s first day', cln.rise.first, [2026, 1, 1]);
{
  const mk = (min, off = min.map(() => 0)) => min.map((m, i) => ({ k: [2026, 1, i + 1], polar: m === null, off: off[i], ms: { set: i, rise: i }, min: { set: m, rise: m } }));
  const set = (min, off) => L.clockRun(mk(min, off), 'set', (v, m) => v < m);
  const rise = (min, off) => L.clockRun(mk(min, off), 'rise', (v, m) => v > m);
  eq('a sunset at 6:00 sharp is evening-early, not after midnight', set([360, 1000]).ms, 0);
  eq('a sunset at 5:59 is after midnight, so late', set([359, 1000]).ms, 1);
  eq('a sunrise at 18:00 is the evening before, so early', rise([1080, 500]).ms, 1);
  eq('a sunrise at 17:59 is late', rise([1079, 500]).ms, 0);
  eq('the first day can win', set([500, 600, 700]).ms, 0);
  eq('a polar day is skipped, not a winner', set([null, 600, 500]).ms, 2);
  eq('all polar, no run', set([null, null]), null);
  eq('a run reaching the last day ends on it', [set([500, 400, 400]).first, set([500, 400, 400]).last, set([500, 400, 400]).clocks], [[2026, 1, 2], [2026, 1, 3], null]);
  eq('clocks forward the day after the run', set([500, 400, 500], [0, 0, 60]).clocks, { dir: 'forward', when: 'before' });
  eq('only the very next day counts', set([500, 400, 500, 500], [0, 0, 60, 0]).clocks, { dir: 'forward', when: 'before' });
  eq('clocks back the day after', set([500, 400, 500, 500], [60, 60, 0, 0]).clocks, { dir: 'back', when: 'before' });
  eq('clocks forward the day before the run', set([500, 400, 500, 500], [0, 60, 60, 60]).clocks, { dir: 'forward', when: 'after' });
  eq('clocks back the day before', set([500, 500, 400, 500], [60, 60, 0, 0]).clocks, { dir: 'back', when: 'after' });
  eq('no change on either side', set([500, 400, 500], [60, 60, 60]).clocks, null);
}
eq('wall: minutes past midnight', L.wall(Date.UTC(2026, 0, 1, 13, 5), 'UTC').minute, 785);
eq('wall: UTC is offset 0 in every month', [0, 1, 2, 6, 7, 11].map((mo) => L.wall(Date.UTC(2026, mo, 1, 12), 'UTC').offset), [0, 0, 0, 0, 0, 0]);
eq('wall: Palo Alto in July is -420', L.wall(Date.UTC(2026, 6, 1, 20), 'America/Los_Angeles').offset, -420);
eq('a span of days in words', [L.spanWords([2026, 12, 3], [2026, 12, 9]), L.spanWords([2026, 11, 28], [2026, 12, 2]), L.spanWords([2026, 10, 31], [2026, 10, 31])], ['3–9 December', '28 November – 2 December', '31 October']);
eq('earliest sunset and latest sunrise in words', L.clockExtremeWords(cpa, (ms) => L.clock(ms, pa.tz, 'en-GB')), 'Earliest sunset: 16:50, 3–9 December. Latest sunrise: 7:33, 31 October, the last morning before the clocks go back.');
eq('a run of days before a clock change reads "until"', L.clockExtremeWords({ set: { ms: 0, first: [2026, 4, 3], last: [2026, 4, 4], clocks: { dir: 'back', when: 'before' } }, rise: { ms: 0, first: [2026, 3, 8], last: [2026, 3, 8], clocks: { dir: 'forward', when: 'after' } } }, () => 'T'),
  'Earliest sunset: T, 3–4 April, until the clocks go back. Latest sunrise: T, 8 March, the first morning after the clocks go forward.');

// --- words -------------------------------------------------------------------------------
eq('hours and minutes', [L.hm(53098e3), L.hm(0), L.hm(86400e3)], ['14\u00a0h 45\u00a0min', '0\u00a0h 00\u00a0min', '24\u00a0h 00\u00a0min']);
eq('change since yesterday', [L.delta(151e3), L.delta(-64e3), L.delta(4e3), L.delta(0)], ['+2\u00a0min 31\u00a0s', '−1\u00a0min 4\u00a0s', '+4\u00a0s', '±0\u00a0s']);
eq('change since yesterday at its edges', [L.delta(60e3), L.delta(59e3), L.delta(1e3), L.delta(-1e3), L.delta(1500e3)], ['+1\u00a0min 0\u00a0s', '+59\u00a0s', '+1\u00a0s', '−1\u00a0s', '+25\u00a0min 0\u00a0s']);
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
eq('labels skip an empty or repeated region', [L.placeLabel(['Monaco', '', 'Monaco']), L.placeLabel(['Singapore', 'Singapore', 'Singapore'])], ['Monaco, Monaco', 'Singapore, Singapore']);
eq('the first zone has a biggest town', L.biggestIn(pl, zones, 'America/Chicago')[0], 'Springfield');
// Nearest town: a flat map of degrees gets both of these wrong. At 70° N a degree of
// longitude is 38 km, so the town 1° east is nearer than the one 0.5° (56 km) north; and a
// point at 179.9° W is 22 km from a town at 179.9° E, not 359.8 degrees.
const far = [['North', '', 'X', 70.5, 20, 1, 0], ['East', '', 'X', 70, 21, 1, 0], ['Date line', '', 'X', -16, 179.9, 1, 0], ['West', '', 'X', -16, 170, 1, 0]];
eq('nearest: longitude shrinks toward the pole', L.nearest(far, 70, 20)[0][0], 'East');
eq('nearest: across the date line', L.nearest(far, -16, -179.9)[0][0], 'Date line');
ok('nearest: km at 70° N (1° of longitude = 38.1 km)', Math.abs(L.nearest(far, 70, 20)[1] - 38.03) < 0.1, L.nearest(far, 70, 20)[1]);
ok('nearest: km across the date line (0.2° at 16° S = 21.4 km)', Math.abs(L.nearest(far, -16, -179.9)[1] - 21.37) < 0.1, L.nearest(far, -16, -179.9)[1]);
eq('nearest: none in an empty list', L.nearest([], 0, 0), null);
const today = [2026, 10, 26];
eq('today is not in the URL', L.encodeState({ at: 'A', date: today, today }), '?at=A');
eq('another day, same month or same day of the month, is', [L.encodeState({ date: [2026, 10, 27], today }), L.encodeState({ date: [2026, 11, 26], today })], ['?d=2026-10-27', '?d=2026-11-26']);
eq('names are cut at 120', L.decodeState('?at=' + 'y'.repeat(130)).at.length, 120);
const st = { at: 'Palo Alto, California, United States', vs: 'Tromsø, Troms, Norway', date: [2026, 12, 21], today };
eq('round trip', L.decodeState(L.encodeState(st)), { at: st.at, vs: st.vs, date: [2026, 12, 21] });
eq('a bad date is dropped', [L.decodeState('?d=2026-02-30').date, L.decodeState('?d=junk').date], [null, null]);

// --- the moon, against USNO ----------------------------------------------------------------
// aa.usno.navy.mil/api/rstt/oneday, fetched 2026-10-30 with tz = the town's offset that day;
// converted to UTC here. null = USNO lists no such event on that local date.
const PA = { lat: 37.442, lon: -122.143, tz: 'America/Los_Angeles' };
const MOON = [
  // label, local date, place, rise UTC, set UTC, percent lit, phase words
  ['Palo Alto 30 Oct', [2026, 10, 30], PA, '2026-10-31T05:18', '2026-10-30T19:49', 73, 'Waning gibbous'],
  ['Palo Alto 2 Nov: no moonrise', [2026, 11, 2], PA, null, '2026-11-02T21:48', 39, 'Waning crescent'],
  ['Palo Alto 3 Nov: rise just after midnight', [2026, 11, 3], PA, '2026-11-03T08:53', '2026-11-03T22:15', 29, 'Waning crescent'],
  ['Sydney 30 Oct: no moonrise', [2026, 10, 30], { lat: -33.8679, lon: 151.2073, tz: 'Australia/Sydney' }, null, '2026-10-29T21:47', 80, 'Waning gibbous'],
  ['Tromsø 15 Dec', [2026, 12, 15], { lat: 69.6496, lon: 18.956, tz: 'Europe/Oslo' }, '2026-12-15T11:14', '2026-12-15T20:21', 33, 'Waxing crescent'],
  ['Singapore 9 Nov: new moon', [2026, 11, 9], { lat: 1.2897, lon: 103.8501, tz: 'Asia/Singapore' }, '2026-11-08T22:28', '2026-11-09T10:47', 0, 'New moon'],
  ['Apia 27 Oct, UTC+13', [2026, 10, 27], { lat: -13.8333, lon: -171.7667, tz: 'Pacific/Apia' }, '2026-10-27T06:27', '2026-10-26T17:12', 99, 'Waning gibbous'],
  ['Buenos Aires 15 Jul', [2026, 7, 15], { lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires' }, '2026-07-15T12:04', '2026-07-15T22:37', 2, 'Waxing crescent'],
];
for (const [label, date, place, rise, set, pct, words] of MOON) {
  const m = Moon.moonOn(date, place), w = Moon.phaseWords(date, place);
  if (rise) atMin(`${label}: moonrise`, m.rise, rise); else eq(`${label}: no moonrise`, m.rise, null);
  if (set) atMin(`${label}: moonset`, m.set, set); else eq(`${label}: no moonset`, m.set, null);
  ok(`${label}: ${pct}% lit`, Math.abs(w.lit * 100 - pct) <= 1, (w.lit * 100).toFixed(1));
  eq(`${label}: phase`, w.name, words);
}
const tro = Moon.moonOn([2026, 12, 22], { lat: 69.6496, lon: 18.956, tz: 'Europe/Oslo' });
eq('Tromsø 22 Dec: the moon is up all day (USNO: continuously above the horizon)', [tro.rise, tro.set, tro.up], [null, null, 'all']);
// aa.usno.navy.mil/api/moon/phases/date, fetched 2026-10-30 (UT, to the minute)
const ph = Moon.phasesBetween(Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 12));
eq('principal phases Oct-Nov 2026: names', ph.map((p) => p.name), ['Last quarter', 'New moon', 'First quarter', 'Full moon', 'Last quarter', 'New moon']);
['2026-10-03T13:25', '2026-10-10T15:50', '2026-10-18T16:12', '2026-10-26T04:12', '2026-11-01T20:28', '2026-11-09T07:02']
  .forEach((iso, i) => atMin(`principal phase ${i + 1} at ${iso}`, ph[i] && ph[i].at, iso));
const full = Moon.phaseWords([2026, 10, 25], PA);
eq('Palo Alto 25 Oct: the full moon falls that evening, local time', [full.name, full.at && new Date(Math.round(full.at / 60e3) * 60e3).toISOString()], ['Full moon', '2026-10-26T04:12:00.000Z']);
// aa.usno.navy.mil/api/moon/phases/date?date=2026-11-13, fetched 2026-11-14 (UT): full
// 24 Nov 14:53, new 9 Dec 00:52, full 24 Dec 01:28, new 7 Jan 20:24, full 22 Jan 12:17.
const nx = (label, date, place, want) => {
  const got = Moon.nextFullNew(date, place);
  eq(`${label}: names and local dates`, got.map((p) => [p.name, p.date]), want.map((w) => [w[0], w[1]]));
  want.forEach((w, i) => { if (w[2]) atMin(`${label}: ${w[0]} at ${w[2]}`, got[i] && got[i].at, w[2]); });
};
nx('next full/new from Palo Alto 13 Nov: the new moon is still 8 Dec there', [2026, 11, 13], PA, [['Full moon', [2026, 11, 24], '2026-11-24T14:53'], ['New moon', [2026, 12, 8], '2026-12-09T00:52']]);
nx('next full/new from Sydney 13 Nov: the full moon is a day later than UT says', [2026, 11, 13], { tz: 'Australia/Sydney' }, [['Full moon', [2026, 11, 25]], ['New moon', [2026, 12, 9]]]);
nx('next full/new from Palo Alto 23 Dec: that evening\'s full moon is today, not next', [2026, 12, 23], PA, [['New moon', [2027, 1, 7], '2027-01-07T20:24'], ['Full moon', [2027, 1, 22], '2027-01-22T12:17']]);
nx('next full/new from London 24 Nov, the full moon\'s own day: the next is 24 Dec', [2026, 11, 24], { tz: 'Europe/London' }, [['New moon', [2026, 12, 9]], ['Full moon', [2026, 12, 24], '2026-12-24T01:28']]);
eq('local midnight across fall-back: 1 Nov is PDT, 2 Nov is PST', [Moon.midnight([2026, 11, 1], PA.tz), Moon.midnight([2026, 11, 2], PA.tz)].map((t) => new Date(t).toISOString()), ['2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z']);
// Sydney's clocks go forward at 02:00 on 4 Oct 2026: midnight that day is still +10, but
// 00:00 UTC that day is already +11, so a single read of the offset is an hour out.
eq('local midnight on Sydney\'s DST day: 4 Oct begins at +10', new Date(Moon.midnight([2026, 10, 4], 'Australia/Sydney')).toISOString(), '2026-10-03T14:00:00.000Z');
eq('local midnight east of Greenwich: Sydney 30 Oct', new Date(Moon.midnight([2026, 10, 30], 'Australia/Sydney')).toISOString(), '2026-10-29T13:00:00.000Z');

// --- the shipped places --------------------------------------------------------------------
const f = here('./data/places.json');
if (existsSync(f)) {
  const D = JSON.parse(readFileSync(f, 'utf8'));
  ok('shipped: 31,000+ places', D.places.length > 31000, D.places.length);
  eq('shipped: every zone index resolves and Intl knows the zone', D.places.every((p) => D.zones[p[6]]) && D.zones.every((z) => { try { L.ymdIn(0, z); return true; } catch { return false; } }), true);
  const apia = L.placeByLabel(D.places, 'Apia, Tuamasaga, Samoa');
  eq('shipped: Apia keeps Samoa time', apia && D.zones[apia[6]], 'Pacific/Apia');
  eq('shipped: palo alto', L.placeLabel(L.matchPlaces(D.places, 'palo alto')[0]), 'Palo Alto, California, United States');
  eq('shipped: eight matches at most', L.matchPlaces(D.places, 'san').length, 8);
  eq('shipped: the biggest town in Los Angeles time', L.biggestIn(D.places, D.zones, 'America/Los_Angeles')[0], 'Los Angeles');
  const near = (lat, lon) => { const r = L.nearest(D.places, lat, lon); return [L.placeLabel(r[0]), Math.round(r[1] * 10) / 10]; };
  eq('shipped: nearest to Stanford\'s Main Quad', near(37.4275, -122.1697), ['Palo Alto, California, United States', 2.9]);
  eq('shipped: nearest east of the date line in Fiji', near(-16.5, -179.95)[0], 'Labasa, Northern, Fiji');
  // Links typed by hand: the whole name finds the biggest such town; a fragment finds nothing.
  const link = (q) => { const p = L.placeForLink(D.places, q); return p && L.placeLabel(p); };
  eq('link: the full label', link('Apia, Tuamasaga, Samoa'), 'Apia, Tuamasaga, Samoa');
  eq('link: a name alone', link('Palo Alto'), 'Palo Alto, California, United States');
  eq('link: the biggest of a shared name', link('london'), 'London, England, United Kingdom');
  eq('link: folded', link('tromso'), 'Tromsø, Troms, Norway');
  eq('link: narrowed by region', link('London, Ontario'), 'London, Ontario, Canada');
  eq('link: narrowed by country', link('Paris, united'), 'Paris, Texas, United States');
  eq('link: the start of a name is not a town', link('Lon'), null);
  eq('link: no such town', link('Qwzxville'), null);
  eq('link: empty', link(null), null);
  // Two towns, one label (two Hayes in England): each must be its own line in the list and
  // its own link, else the second can be seen but never picked, kept or shared.
  const labels = D.places.map((p) => L.fold(L.placeLabel(p)));
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  eq('shipped: no two towns share a label', [dup.length, dup.slice(0, 3)], [0, []]);
  const hayes = L.matchPlaces(D.places, 'hayes, england').map(L.placeLabel);
  eq('shipped: both Hayes listed, the smaller with its neighbour', hayes.filter((l) => l.startsWith('Hayes')), ['Hayes, England, United Kingdom', 'Hayes (near Beckenham), England, United Kingdom']);
  const small = D.places.find((p) => p[0] === 'Hayes' && p[L.P.NEAR]);
  eq('link: the hinted label opens that town, not its namesake', L.placeForLink(D.places, 'Hayes (near Beckenham), England, United Kingdom'), small);
  eq('link: the bare label still opens the bigger one, as old links did', L.placeForLink(D.places, 'Hayes, England, United Kingdom')[L.P.POP], 93928);
  eq('shipped: a hint never crosses a border', D.places.every((p) => !p[7] || D.places.some((o) => o[0] === p[7] && o[2] === p[2])), true);
} else ok('shipped: data/places.json exists (run build.py)', false);

// --- nearest's tie-break, and the links placeForLink will and will not open ------------
// Added 2026-11-19. mutwatch named `nearest` and `placeForLink` among the exports its
// equivalence sweep never reaches, and one survivor sat in each region.
{
  // [NAME, A1, CC, LAT, LON, POP, TZ]
  const pl = (name, lat, lon, a1 = 'Region', cc = 'CC', pop = 1000) => [name, a1, cc, lat, lon, pop, 0];

  // kills L331 `if (h < bestH)` -> `<=`: two towns at the SAME point tie on distance, and
  // the first listed must win. With `<=` the last one does, silently reordering every tie.
  const tied = [pl('Alpha', 1, 0), pl('Beta', 1, 0)];
  eq('nearest keeps the first of two towns at the same point', L.nearest(tied, 0, 0)[0][0], 'Alpha');
  eq('nearest keeps the first whichever order they are listed in',
     L.nearest([pl('Beta', 1, 0), pl('Alpha', 1, 0)], 0, 0)[0][0], 'Beta');

  eq('nearest of an empty list is nothing', L.nearest([], 0, 0) || null, null);
  eq('nearest picks the closer of two towns', L.nearest([pl('Far', 10, 0), pl('Near', 1, 0)], 0, 0)[0][0], 'Near');
  ok('nearest measures one degree of latitude as about 111 km',
     Math.abs(L.nearest([pl('North', 1, 0)], 0, 0)[1] - 111.19) < 0.1,
     String(L.nearest([pl('North', 1, 0)], 0, 0)[1]));
  // longitude wraps: a point just east of 180 finds a town just west of it
  ok('nearest reaches across the 180th meridian',
     L.nearest([pl('West', 0, 179.5), pl('Elsewhere', 0, 0)], 0, -179.5)[0][0] === 'West',
     JSON.stringify(L.nearest([pl('West', 0, 179.5), pl('Elsewhere', 0, 0)], 0, -179.5)));

  const places = [pl('London', 51.5, -0.13, 'England', 'United Kingdom'), pl('Londonderry', 55, -7.3, 'Ulster', 'United Kingdom')];
  eq('placeForLink opens a full label', L.placeForLink(places, 'London, England, United Kingdom')[0], 'London');
  eq('placeForLink folds case', L.placeForLink(places, 'london, england, united kingdom')[0], 'London');
  eq('placeForLink takes the whole name before the first comma', L.placeForLink(places, 'London')[0], 'London');
  // a name that only STARTS a town's name is not enough -- "?at=Lon" must not open London
  eq('placeForLink refuses a bare prefix, so a typo is visible', L.placeForLink(places, 'Lon'), null);
  eq('placeForLink of no label is nothing', [L.placeForLink(places, ''), L.placeForLink(places, null)], [null, null]);
}

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
