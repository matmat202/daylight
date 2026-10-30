// Daylight — pure logic, no DOM. The page and the suite both import this file.
//
// Sun times are NOAA's solar-position equations (the ones behind NOAA's solar calculator
// spreadsheet), with sunrise and sunset when the sun's upper edge crosses the horizon
// after refraction: a zenith of 90.833°. Each event is re-solved three times with the sun's
// position at the previous answer's instant, which settles it to under a tenth of a second:
// the page prints the change since yesterday in seconds. The equations themselves are good
// to about a minute below the polar circles.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const DAY = 86400e3;
export const ZENITH = 90.833;

// Julian day of 0h UTC on a calendar date.
export function jd0(y, m, d) { return Date.UTC(y, m - 1, d) / DAY + 2440587.5; }

// The sun at an instant (Julian day): declination (deg) and equation of time (minutes).
export function solar(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 * DEG * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eot };
}

// cos of the hour angle at which the sun is at `zenith`; outside [-1, 1] it never gets there.
function cosH(lat, decl, zenith) {
  return Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD)) - Math.tan(lat * RAD) * Math.tan(decl * RAD);
}

// The solar day around the local noon of calendar date y-m-d at longitude `lon` (east +).
// Returns instants in ms UTC. `polar` is 'day' when the sun never sets, 'night' when it
// never rises; rise and set are then null and `length` is 24 h or 0.
export function sunDay(y, m, d, lat, lon, zenith = ZENITH) {
  const base = jd0(y, m, d);
  let noonMin = 720 - 4 * lon;
  for (let i = 0; i < 2; i++) noonMin = 720 - 4 * lon - solar(base + noonMin / 1440).eot;
  const atNoon = solar(base + noonMin / 1440);
  const c = cosH(lat, atNoon.decl, zenith);
  const noon = Date.UTC(y, m - 1, d) + noonMin * 60e3;
  if (c > 1) return { noon, rise: null, set: null, length: 0, polar: 'night' };
  if (c < -1) return { noon, rise: null, set: null, length: DAY, polar: 'day' };
  const event = (sign) => {
    let t = noonMin + sign * 4 * Math.acos(c) * DEG;
    for (let i = 0; i < 3; i++) {
      const s = solar(base + t / 1440);
      const cc = Math.max(-1, Math.min(1, cosH(lat, s.decl, zenith)));
      t = 720 - 4 * lon - s.eot + sign * 4 * Math.acos(cc) * DEG;
    }
    return Date.UTC(y, m - 1, d) + t * 60e3;
  };
  const rise = event(-1), set = event(1);
  return { noon, rise, set, length: set - rise, polar: null };
}

// ---- calendar dates in a time zone ---------------------------------------------------

const ymdFmt = new Map();
// The calendar date an instant falls on in IANA zone `tz`, as [y, m, d].
export function ymdIn(ms, tz) {
  if (!ymdFmt.has(tz)) ymdFmt.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
  const [y, m, d] = ymdFmt.get(tz).format(new Date(ms)).split('-').map(Number);
  return [y, m, d];
}

export function addDays([y, m, d], n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const same = (a, b) => cmp(a, b) === 0;

// The sun on a calendar date as the town keeps it. Where a zone sits far from its
// longitude's solar time (Samoa is UTC+13 at 172°W), the solar day computed for a date
// can have its noon on the next or previous local date; step to the one whose noon is on
// the date asked for.
export function sunOn(date, place, zenith = ZENITH) {
  let k = date;
  for (let i = 0; i < 3; i++) {
    const s = sunDay(k[0], k[1], k[2], place.lat, place.lon, zenith);
    const local = ymdIn(s.noon, place.tz);
    if (same(local, date)) return s;
    k = addDays(k, cmp(local, date) < 0 ? 1 : -1);
  }
  return sunDay(date[0], date[1], date[2], place.lat, place.lon, zenith);
}

// Civil twilight: the sun 6° below the horizon, when it is light enough to see outdoors
// without lamps. `first` and `last` are first and last light; `polar` 'day' here means it
// never gets dark (a white night: Anchorage, Trondheim and Tampere in June), and
// 'night' means it never gets that light.
export const CIVIL = 96;
export function lightOn(date, place) {
  const s = sunOn(date, place, CIVIL);
  return { first: s.rise, last: s.set, polar: s.polar };
}

// What the sun's own line leaves out: 'white' when the sun sets but it never gets dark,
// 'twilight' when the sun never rises but the day still gets light. Otherwise null.
export function lightKind(sun, light) {
  if (light.polar === 'day' && !sun.polar) return 'white';
  if (sun.polar === 'night' && !light.polar) return 'twilight';
  return null;
}

// Day length for every day of a year in the town's calendar, in ms.
export function yearLengths(year, place) {
  const out = [];
  for (let k = [year, 1, 1]; k[0] === year; k = addDays(k, 1)) out.push(sunOn(k, place).length);
  return out;
}

// The longest and shortest days of a year: index into yearLengths and the length.
export function extremes(lengths) {
  let lo = 0, hi = 0;
  lengths.forEach((v, i) => { if (v > lengths[hi]) hi = i; if (v < lengths[lo]) lo = i; });
  return { longest: hi, shortest: lo };
}

// The wall clock in zone `tz` at an instant rounded to the minute, as the page shows it:
// minutes past local midnight, and the zone's offset from UTC in minutes.
const wallFmt = new Map();
function wall(ms, tz) {
  if (!wallFmt.has(tz)) wallFmt.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const at = Math.round(ms / 60e3) * 60e3;
  const p = Object.fromEntries(wallFmt.get(tz).formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
  return { minute: p.hour * 60 + p.minute, offset: (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at) / 60e3 };
}

// The earliest sunset and latest sunrise of a year on the town's clock. Neither is the
// shortest day: across the 400 biggest towns within 60° (measured 2026-10-30) each falls
// a median of 19 days from it, and where clocks change the latest sunrise is often the
// last morning before they go back (Palo Alto: 7:33 on 31 October, against 7:23 in
// January). The minute holds for about a week, so each is the run of days that share it:
// { first, last, ms, clocks }, with first/last as [y, m, d]. clocks is { dir: 'back' |
// 'forward', when: 'before' | 'after' } when the run ends the day before the clocks change
// or starts the day after, else null.
// A run that crosses New Year is cut at the year's edge. Null when the sun never sets.
export function clockExtremes(year, place) {
  const days = [];
  for (let k = [year, 1, 1]; k[0] === year; k = addDays(k, 1)) {
    const s = sunOn(k, place);
    days.push({ k, s, off: wall(s.noon, place.tz).offset });
  }
  const pick = (key, better) => {
    let best = -1, m = null;
    days.forEach((d, i) => {
      if (d.s.polar) return;
      // Near the midnight sun a sunset can fall after midnight, which is late, not early;
      // and a sunrise before midnight is early.
      const m0 = wall(d.s[key], place.tz).minute;
      d[key] = key === 'set' && m0 < 360 ? m0 + 1440 : key === 'rise' && m0 >= 1080 ? m0 - 1440 : m0;
      if (best < 0 || better(d[key], m)) { best = i; m = d[key]; }
    });
    if (best < 0) return null;
    // `best` is already the first day of a tie; widen forward only.
    const a = best;
    let b = best;
    while (b < days.length - 1 && days[b + 1][key] === m) b++;
    const turn = (i, j) => ({ dir: days[j].off > days[i].off ? 'forward' : 'back', when: i === b ? 'before' : 'after' });
    const clocks = b + 1 < days.length && days[b + 1].off !== days[b].off ? turn(b, b + 1)
      : a > 0 && days[a - 1].off !== days[a].off ? turn(a - 1, a) : null;
    return { first: days[a].k, last: days[b].k, ms: days[a].s[key], clocks };
  };
  const set = pick('set', (v, m) => v < m), rise = pick('rise', (v, m) => v > m);
  return set && rise ? { set, rise } : null;
}

// ---- words ------------------------------------------------------------------------------

// A line may break anywhere but between a number and its unit (unit-wrap-sweep: on both a
// 320px and a 390px phone, "53" ended one line and "min" began the next).
export const NB = '\u00a0';

export function hm(ms) {
  const min = Math.round(ms / 60e3);
  return `${Math.floor(min / 60)}${NB}h ${String(min % 60).padStart(2, '0')}${NB}min`;
}

// "+2 min 31 s" / "−1 min 4 s": the change since yesterday, which is seconds near a solstice.
export function delta(ms) {
  const s = Math.round(ms / 1000), a = Math.abs(s);
  const sign = s > 0 ? '+' : s < 0 ? '−' : '±';
  return a >= 60 ? `${sign}${Math.floor(a / 60)}${NB}min ${a % 60}${NB}s` : `${sign}${a}${NB}s`;
}

const timeFmt = new Map();
export function clock(ms, tz, locale) {
  const key = `${tz}|${locale || ''}`;
  if (!timeFmt.has(key)) timeFmt.set(key, new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit' }));
  // To the nearest minute, as almanacs give it: Intl alone drops the seconds, so 6:42:49
  // would read 6:42.
  return timeFmt.get(key).format(new Date(Math.round(ms / 60e3) * 60e3));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateWords([y, m, d]) { return `${d} ${MONTHS[m - 1]}`; }
export function dayOfYear(year, i) { return addDays([year, 1, 1], i); }

// "3–9 December", "28 November – 2 December", "31 October".
export function spanWords(a, b) {
  if (same(a, b)) return dateWords(a);
  return a[1] === b[1] ? `${a[2]}–${dateWords(b)}` : `${dateWords(a)} – ${dateWords(b)}`;
}

// "Earliest sunset: 4:50 PM, 3–9 December. Latest sunrise: 7:33 AM, 31 October, the last
// morning before the clocks go back."
export function clockExtremeWords(ex, t) {
  if (!ex) return '';
  const one = (label, e, noun) => {
    const c = e.clocks;
    const single = same(e.first, e.last);
    const tail = !c ? '' : c.when === 'before' ? (single ? `, the last ${noun} before the clocks go ${c.dir}` : `, until the clocks go ${c.dir}`)
      : (single ? `, the first ${noun} after the clocks go ${c.dir}` : `, from when the clocks go ${c.dir}`);
    return `${label}: ${t(e.ms)}, ${spanWords(e.first, e.last)}${tail}.`;
  };
  return `${one('Earliest sunset', ex.set, 'evening')} ${one('Latest sunrise', ex.rise, 'morning')}`;
}

// ---- places: [name, admin1, country, lat, lon, pop, tzIndex], most populous first ------

export const P = { NAME: 0, A1: 1, CC: 2, LAT: 3, LON: 4, POP: 5, TZ: 6 };

// Letters NFD does not take apart: "tromso" has to find the slashed o of Tromso, "lodz" the barred l of Lodz.
const LETTERS = { '\u00f8': 'o', '\u00e6': 'ae', '\u0153': 'oe', '\u00df': 'ss', '\u0142': 'l', '\u0111': 'd', '\u00f0': 'd', '\u00fe': 'th', '\u0131': 'i', '\u0127': 'h' };
export function fold(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u00f8\u00e6\u0153\u00df\u0142\u0111\u00f0\u00fe\u0131\u0127]/g, (c) => LETTERS[c]).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function placeLabel(p) {
  const parts = [p[P.NAME]];
  if (p[P.A1] && p[P.A1] !== p[P.NAME]) parts.push(p[P.A1]);
  parts.push(p[P.CC]);
  return parts.join(', ');
}

// Same rules as Shaken's box: the part before the first comma starts the name; each later
// part starts the region or the country. Whole-name matches first, then the list's order.
export function matchPlaces(places, q, limit = 8) {
  const [head, ...rest] = String(q).split(',').map(fold);
  if (!head) return [];
  const exact = [], prefix = [];
  for (const p of places) {
    const n = fold(p[P.NAME]);
    if (!n.startsWith(head)) continue;
    if (rest.some((r) => r && !(fold(p[P.A1]).startsWith(r) || fold(p[P.CC]).startsWith(r)))) continue;
    (n === head ? exact : prefix).push(p);
    if (exact.length >= limit) break;
  }
  return exact.concat(prefix).slice(0, limit);
}

export function placeByLabel(places, label) {
  const f = fold(label);
  return places.find((p) => fold(placeLabel(p)) === f) || null;
}

// The biggest town in a time zone: where the page starts when nothing else says.
export function biggestIn(places, zones, tz) {
  const i = zones.indexOf(tz);
  return i < 0 ? null : places.find((p) => p[P.TZ] === i) || null;
}

export const toPlace = (p, zones) => ({ label: placeLabel(p), lat: p[P.LAT], lon: p[P.LON], tz: zones[p[P.TZ]] });

// ?at=Palo Alto, California, United States&vs=Tromsø, Troms, Norway&d=2026-12-21
export function encodeState({ at, vs, date, today }) {
  const q = new URLSearchParams();
  if (at) q.set('at', at);
  if (vs) q.set('vs', vs);
  if (date && today && !same(date, today)) q.set('d', date.map((x, i) => String(x).padStart(i ? 2 : 4, '0')).join('-'));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function decodeState(search) {
  const q = new URLSearchParams(search || '');
  const clip = (v) => (v || '').slice(0, 120).trim() || null;
  let date = null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get('d') || '');
  if (m) {
    const k = [+m[1], +m[2], +m[3]];
    if (same(addDays(k, 0), k)) date = k;
  }
  return { at: clip(q.get('at')), vs: clip(q.get('vs')), date };
}
