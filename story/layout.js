/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes. Modelled on further-north/site/story.
 *
 * Every step is the same chart with different rows: one row per slice of the towns, in
 * each the people of those towns as a grey histogram of when their sun is highest (the
 * year's mean, minutes after 12:00 on their own clock; bar height is population), and the
 * middle person as one red dot.
 *   "all":       every town
 *   "causes":    every town; with no summer time anywhere; leaving China out
 *   "countries": six big countries
 */
export const COL = { hit: '#b3261e', faint: '#cfcac3' };
export const MIN = [-90, 165];
export const BIN = 5;
export const STEPS = {
  all: ['all'],
  causes: ['all', 'std', 'exchina'],
  countries: ['china', 'india', 'us', 'spain', 'brazil', 'japan'],
};

const memo = new WeakMap();
/* row key -> [[minutes, population]] of its towns, sorted by minutes */
export function rowTowns(D, key) {
  if (!memo.has(D)) memo.set(D, {});
  const m = memo.get(D);
  if (m[key]) return m[key];
  const row = D.rows.find((r) => r.key === key);
  if (!row) throw new Error(`unknown row ${key}`);
  const k = row.col === 'late' ? 2 : 3;
  const cc = (t) => D.countries[t[0]];
  const keep = row.sel == null ? () => true
    : Array.isArray(row.sel) ? (t) => cc(t) !== row.sel[1] : (t) => cc(t) === row.sel;
  m[key] = D.towns.filter(keep).map((t) => [t[k] / 10, t[1]]).sort((a, b) => a[0] - b[0]);
  return m[key];
}

/* -> the shares and the middle that build_story.py's `check` holds for the row */
export function rowStats(D, key) {
  const T = rowTowns(D, key);
  const pop = T.reduce((s, t) => s + t[1], 0);
  const share = (f) => T.reduce((s, t) => s + (f(t[0]) ? t[1] : 0), 0) / pop;
  let acc = 0, median = null;
  for (const [v, w] of T) { acc += w; if (acc >= pop / 2) { median = v; break; } }
  return { pop, after: share((v) => v > 0), half_hour: share((v) => v > 30), hour: share((v) => v > 60),
    near: share((v) => Math.abs(v) < 15), early_half: share((v) => v < -30), median, min: T[0][0], max: T.at(-1)[0] };
}

/* -> {X, Y, show, rowH, bars: {key: [{x,y,w,h,n}]}, real: [{x,y,r,fill,op}] one per D.rows} in px of w x h */
export function layout(name, D, w, h) {
  const show = STEPS[name];
  if (!show) throw new Error(`unknown step ${name}`);
  const pad = 8;
  const keys = D.rows.map((r) => r.key);
  const X = (v) => pad + ((v - MIN[0]) / (MIN[1] - MIN[0])) * (w - 2 * pad);
  const rowH = (h - 2 * pad) / show.length;
  const Y = (k) => pad + rowH * (k + 1);
  const bars = Object.fromEntries(keys.map((k) => [k, []]));
  const real = keys.map(() => ({ x: w / 2, y: h / 2, r: 0, op: 0, fill: COL.faint }));
  // one bar per BIN minutes, its height that bin's people as a share of the row's fullest bin
  const hist = (T, base, room) => {
    const cnt = {};
    for (const [v, p] of T) { const b = Math.floor(Math.min(MIN[1] - 1e-9, Math.max(MIN[0], v)) / BIN); cnt[b] = (cnt[b] || 0) + p; }
    const most = Math.max(...Object.values(cnt)), bw = Math.max(1, (X(BIN) - X(0)) * 0.8);
    return Object.entries(cnt).map(([b, n]) => ({ x: X((+b + 0.5) * BIN) - bw / 2, y: base - (room * n) / most, w: bw, h: (room * n) / most, n }));
  };
  const big = Math.max(3.5, Math.min(8, rowH * 0.12));
  show.forEach((key, k) => {
    // the dot sits under its row's bars, so it never hides the bin it marks
    bars[key] = hist(rowTowns(D, key), Y(k) - 4 - 2 * big, rowH * (show.length > 3 ? 0.45 : 0.55));
    real[keys.indexOf(key)] = { x: X(rowStats(D, key).median), y: Y(k) - 2 - big, r: big, fill: COL.hit, op: 1 };
  });
  return { kind: name, X, Y, show, rowH, bars, real };
}
