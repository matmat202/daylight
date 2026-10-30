// Daylight — the moon. Pure logic, no DOM; the page and the suite both import this file.
//
// The moon's position is the main terms of Meeus' series (Astronomical Algorithms, ch. 47:
// all 60 longitude and distance terms, the 15 largest latitude terms), good to a
// few arcminutes. Moonrise and moonset are when the moon's centre stands at
// 0.7275 × parallax − 34′ in geocentric altitude (Meeus ch. 15): the upper limb on the
// horizon after refraction, seen from the ground rather than the earth's centre. The moon
// rises about 50 minutes later each day, so once a month a town has a day with no moonrise
// (or no moonset), and above the polar circles it can stay up or down for days.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const DAY = 86400e3;
const DT = 69e3; // TT − UT in 2026, in ms; the moon moves 0.01° in that time
const norm = (a) => ((a % 360) + 360) % 360;

// D, M, M', F multipliers; longitude (1e-6 °); distance (1e-3 km)
const LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];
// D, M, M', F multipliers; latitude (1e-6 °)
const B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
];

const jdOf = (ms) => ms / DAY + 2440587.5;

// The moon and the sun at an instant (ms UT): the moon's apparent right ascension,
// declination and horizontal parallax (deg), and the sun's apparent longitude, for the phase.
export function moonAt(ms) {
  const T = (jdOf(ms + DT) - 2451545) / 36525;
  const Lp = norm(218.3164477 + 481267.88123421 * T);
  const D = norm(297.8501921 + 445267.1114034 * T);
  const M = norm(357.5291092 + 35999.0502909 * T);
  const Mp = norm(134.9633964 + 477198.8675055 * T);
  const F = norm(93.272095 + 483202.0175233 * T);
  const E = 1 - 0.002516 * T;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
  const e = (m) => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * RAD;
    sl += l * e(m) * Math.sin(arg); sr += r * e(m) * Math.cos(arg);
  }
  for (const [d, m, mp, f, b] of B) sb += b * e(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * RAD);
  sl += 3958 * Math.sin(A1 * RAD) + 1962 * Math.sin((Lp - F) * RAD) + 318 * Math.sin(A2 * RAD);
  sb += -2235 * Math.sin(Lp * RAD) + 382 * Math.sin(A3 * RAD) + 175 * Math.sin((A1 - F) * RAD)
    + 175 * Math.sin((A1 + F) * RAD) + 127 * Math.sin((Lp - Mp) * RAD) - 115 * Math.sin((Lp + Mp) * RAD);
  const omega = 125.04452 - 1934.136261 * T;
  const nut = -0.004778 * Math.sin(omega * RAD); // nutation in longitude, main term
  const lambda = Lp + sl / 1e6 + nut, beta = sb / 1e6, dist = 385000.56 + sr / 1000;
  const eps = 23.4392911 - 0.0130042 * T + 0.00256 * Math.cos(omega * RAD);
  const ra = Math.atan2(Math.sin(lambda * RAD) * Math.cos(eps * RAD) - Math.tan(beta * RAD) * Math.sin(eps * RAD), Math.cos(lambda * RAD)) * DEG;
  const dec = Math.asin(Math.sin(beta * RAD) * Math.cos(eps * RAD) + Math.cos(beta * RAD) * Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  // The sun, as in sun-logic.js (NOAA): mean longitude plus the equation of centre.
  const Ms = 357.52911 + T * 35999.05029;
  const sunLon = 280.46646 + T * 36000.76983 + Math.sin(Ms * RAD) * (1.914602 - 0.004817 * T)
    + Math.sin(2 * Ms * RAD) * 0.019993 + Math.sin(3 * Ms * RAD) * 0.000289 - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return { ra, dec, parallax: Math.asin(6378.14 / dist) * DEG, dist, lambda: norm(lambda), beta, sunLon: norm(sunLon) };
}

// The moon's geocentric altitude (deg) at an instant from a place, and the altitude at
// which it rises or sets then.
export function altitude(ms, lat, lon) {
  const m = moonAt(ms);
  const jd = jdOf(ms), T = (jd - 2451545) / 36525;
  const lst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T + lon;
  const H = (lst - m.ra) * RAD;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(m.dec * RAD) + Math.cos(lat * RAD) * Math.cos(m.dec * RAD) * Math.cos(H)) * DEG;
  return { alt, h0: 0.7275 * m.parallax - 34 / 60 };
}

// The instant local midnight begins calendar date [y, m, d] in IANA zone `tz`.
const partsFmt = new Map();
function offsetAt(ms, tz) {
  if (!partsFmt.has(tz)) partsFmt.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = Object.fromEntries(partsFmt.get(tz).formatToParts(new Date(ms)).map((x) => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
export function midnight([y, m, d], tz) {
  const wall = Date.UTC(y, m - 1, d);
  let t = wall - offsetAt(wall, tz);
  t = wall - offsetAt(t, tz); // again with the offset in force at that instant (DST days)
  return t;
}

const nextDay = ([y, m, d]) => { const t = new Date(Date.UTC(y, m - 1, d + 1)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };

// The moon on a calendar date as the town keeps it: `rise` and `set` in ms UT, or null
// when it does not happen that day; `up` is 'all' or 'none' when it does neither.
// Scans the local day at 10-minute steps (the moon cannot rise twice in 10 minutes) and
// bisects each crossing to a second.
const STEP = 10 * 60e3;
export function moonOn(date, place) {
  const start = midnight(date, place.tz);
  const end = midnight(nextDay(date), place.tz);
  const f = (t) => { const a = altitude(t, place.lat, place.lon); return a.alt - a.h0; };
  let rise = null, set = null, t0 = start, v0 = f(start);
  const up0 = v0 > 0;
  while (t0 < end) {
    const t1 = Math.min(t0 + STEP, end), v1 = f(t1);
    if ((v0 > 0) !== (v1 > 0)) {
      let a = t0, b = t1, va = v0;
      while (b - a > 1000) { const c = (a + b) / 2, vc = f(c); if ((vc > 0) === (va > 0)) { a = c; va = vc; } else b = c; }
      const at = Math.round((a + b) / 2);
      if (v1 > 0) { if (rise == null) rise = at; } else if (set == null) set = at;
    }
    t0 = t1; v0 = v1;
  }
  const up = rise == null && set == null ? (up0 ? 'all' : 'none') : null;
  return { rise, set, up };
}

// The moon's phase at an instant: `lit` is the illuminated fraction of the disc (0-1),
// `age` the sun-moon elongation in ecliptic longitude (0 new, 90 first quarter, 180 full).
export function phaseAt(ms) {
  const m = moonAt(ms);
  const elong = Math.acos(Math.cos(m.beta * RAD) * Math.cos((m.lambda - m.sunLon) * RAD));
  const R = 149597870.7; // the sun's distance (km); its 1.7% yearly swing moves `lit` by under 0.01%
  const i = Math.atan2(R * Math.sin(elong), m.dist - R * Math.cos(elong));
  return { lit: (1 + Math.cos(i)) / 2, age: norm(m.lambda - m.sunLon) };
}

// The principal phases between two instants: [{ name, at }], `at` to the minute.
const PRINCIPAL = ['New moon', 'First quarter', 'Full moon', 'Last quarter'];
export function phasesBetween(a, b) {
  const out = [];
  const g = (t) => phaseAt(t).age;
  for (let t = a; t < b; t += 6 * 3600e3) {
    const t1 = Math.min(t + 6 * 3600e3, b);
    const q0 = Math.floor(g(t) / 90), q1 = Math.floor(g(t1) / 90);
    if (q0 === q1) continue;
    const target = (q1 * 90) % 360;
    // the age only grows, about 12° a day; bisect on its distance past the target
    const past = (x) => norm(g(x) - target) < 180;
    let lo = t, hi = t1;
    while (hi - lo > 1000) { const c = (lo + hi) / 2; if (past(c)) hi = c; else lo = c; }
    out.push({ name: PRINCIPAL[q1 % 4], at: Math.round(hi) });
  }
  return out;
}

// The words for the phase on a local date: the principal phase if one falls on that date,
// otherwise the phase the moon is in at the end of the day, as USNO names them.
export function phaseWords(date, place) {
  const start = midnight(date, place.tz);
  const end = midnight(nextDay(date), place.tz);
  const hit = phasesBetween(start, end)[0];
  if (hit) return { name: hit.name, at: hit.at, lit: phaseAt(hit.at).lit };
  const p = phaseAt(start + (end - start) / 2);
  const wax = p.age < 180;
  const name = p.age < 90 || p.age > 270 ? `${wax ? 'Waxing' : 'Waning'} crescent` : `${wax ? 'Waxing' : 'Waning'} gibbous`;
  return { name, at: null, lit: p.lit };
}
