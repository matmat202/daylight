// Daylight — the page. Logic lives in sun-logic.js; this file only reads and draws.
import * as L from './sun-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400e3;
let PLACES = [], ZONES = [];
const state = { at: null, vs: null, date: null }; // date null = today in the town's zone

const today = () => L.ymdIn(Date.now(), state.at.tz);
const theDate = () => state.date || today();
const iso = (k) => k.map((x, i) => String(x).padStart(i ? 2 : 4, '0')).join('-');

function sync() {
  history.replaceState(null, '', location.pathname + L.encodeState({
    at: state.at.label, vs: state.vs && state.vs.label, date: state.date, today: today(),
  }));
}

function zoneName(tz, ms) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName');
  return `${tz.replace(/_/g, ' ')}${part ? ` (${part.value})` : ''}`;
}

const years = new Map();
function yearOf(place, y) {
  const k = `${place.label}|${y}`;
  if (!years.has(k)) years.set(k, L.yearLengths(y, place));
  return years.get(k);
}

function card(prefix, place, date) {
  const s = L.sunOn(date, place);
  $(`${prefix}Name`).textContent = place.label;
  $(`${prefix}Zone`).textContent = `${L.dateWords(date)} ${date[0]} · times in ${zoneName(place.tz, s.noon)}`;
  const t = (ms) => (ms == null ? '—' : L.clock(ms, place.tz));
  $(`${prefix}Rise`).textContent = t(s.rise);
  $(`${prefix}Set`).textContent = t(s.set);
  $(`${prefix}Len`).textContent = L.hm(s.length);
  $(`${prefix}Noon`).textContent = t(s.noon);
  const polar = $(`${prefix}Polar`);
  const lt = L.lightOn(date, place), kind = L.lightKind(s, lt);
  polar.hidden = !s.polar && !kind;
  polar.textContent = kind === 'white' ? 'The sun sets, but it never gets dark tonight: a white night.'
    : kind === 'twilight' ? 'The sun does not rise today (polar night), but there is twilight around noon.'
    : s.polar === 'day' ? 'The sun does not set today: midnight sun.' : s.polar === 'night' ? 'The sun does not rise today: polar night.' : '';
  $(`${prefix}Light`).textContent = lt.polar === 'day' ? 'Light enough to be outdoors without lamps all night.'
    : lt.polar === 'night' ? 'Dark all day: the sun stays more than 6° below the horizon.'
    : `First light ${t(lt.first)} · last light ${t(lt.last)} (civil twilight, sun 6° below the horizon)`;
  const prev = L.sunOn(L.addDays(date, -1), place);
  const yl = yearOf(place, date[0]), ex = L.extremes(yl);
  const words = (i) => `${L.dateWords(L.dayOfYear(date[0], i))} (${L.hm(yl[i])})`;
  const change = s.polar && prev.polar === s.polar ? '' : `${L.delta(s.length - prev.length)} on the day before. `;
  $(`${prefix}More`).textContent = `${change}Longest day in ${date[0]}: ${words(ex.longest)}. Shortest: ${words(ex.shortest)}.`;
  return s;
}

function drawChart() {
  const date = theDate(), y = date[0];
  const W = 730, H = 240, top = 8, bot = 22, left = 30;
  const X = (i) => left + (i / 365) * (W - left - 4);
  const Y = (ms) => top + (1 - ms / DAY) * (H - top - bot);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  const main = yearOf(state.at, y);
  el('rect', { class: 'night', x: left, y: top, width: W - left - 4, height: H - top - bot });
  const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  el('path', { class: 'day', d: `${line(main)}L${X(main.length - 1).toFixed(1)},${Y(0)}L${X(0)},${Y(0)}Z` });
  for (const h of [6, 12, 18]) {
    el('line', { class: 'grid', x1: left, x2: W - 4, y1: Y(h * 3600e3), y2: Y(h * 3600e3) });
    el('text', { x: left - 4, y: Y(h * 3600e3) + 4, 'text-anchor': 'end' }).textContent = `${h} h`;
  }
  for (let m = 1; m <= 12; m++) {
    const i = Math.round((Date.UTC(y, m - 1, 1) - Date.UTC(y, 0, 1)) / DAY);
    el('text', { x: X(i) + 2, y: H - 6 }).textContent = 'JFMAMJJASOND'[m - 1];
  }
  el('path', { class: 'len', d: line(main) });
  if (state.vs) el('path', { class: 'len vs', d: line(yearOf(state.vs, y)) });
  const di = Math.round((Date.UTC(date[0], date[1] - 1, date[2]) - Date.UTC(y, 0, 1)) / DAY);
  el('line', { class: 'now', x1: X(di), x2: X(di), y1: top, y2: H - bot });
  svg.setAttribute('aria-label', `Hours of daylight through ${y} in ${state.at.label}${state.vs ? ` and ${state.vs.label}` : ''}`);
  svg.addEventListener('click', (e) => {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return;
    const q = p.matrixTransform(m.inverse());
    const i = Math.max(0, Math.min(main.length - 1, Math.round(((q.x - left) / (W - left - 4)) * 365)));
    setDate(L.dayOfYear(y, i));
  });
  $('chart').replaceChildren(svg);
  $('cTitle').textContent = `Hours of daylight through ${y}`;
  $('key').replaceChildren();
  for (const [p, cls] of [[state.at, ''], [state.vs, 'vs']]) {
    if (!p) continue;
    const s = document.createElement('span'); const i = document.createElement('i'); if (cls) i.className = cls;
    s.append(i, p.label); $('key').append(s);
  }
}

function draw() {
  const date = theDate();
  $('date').value = iso(date);
  card('m', state.at, date);
  $('second').hidden = !state.vs;
  if (state.vs) card('v', state.vs, date);
  drawChart();
  sync();
}

function setDate(k) {
  const t = today();
  state.date = k && iso(k) !== iso(t) ? k : null;
  draw();
}

// ---- the two town boxes -------------------------------------------------------------

function combo(boxId, listId, onPick, onClear) {
  const box = $(boxId), ul = $(listId);
  let opts = [], active = -1;
  const close = () => { opts = []; active = -1; ul.hidden = true; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); };
  const drawOpts = () => {
    ul.replaceChildren();
    opts.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `${listId}${i}`; li.setAttribute('role', 'option'); li.dataset.i = i;
      li.setAttribute('aria-selected', String(i === active));
      li.textContent = L.placeLabel(p);
      ul.append(li);
    });
    if (!opts.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No town by that name. Try a bigger place nearby.'; ul.append(li); }
    ul.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    if (active >= 0) { box.setAttribute('aria-activedescendant', `${listId}${active}`); $(`${listId}${active}`).scrollIntoView({ block: 'nearest' }); }
  };
  const pick = (p) => { close(); onPick(L.toPlace(p, ZONES)); };
  box.addEventListener('input', () => {
    if (!box.value.trim()) { close(); if (onClear) onClear(); return; }
    opts = L.matchPlaces(PLACES, box.value); active = opts.length ? 0 : -1; drawOpts();
  });
  box.addEventListener('keydown', (e) => {
    if (ul.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length; drawOpts(); e.preventDefault();
    } else if (e.key === 'Enter') { if (opts[active]) pick(opts[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  ul.addEventListener('mousedown', (e) => e.preventDefault());
  ul.addEventListener('click', (e) => { const i = e.target.closest('li[data-i]')?.dataset.i; if (i != null && opts[i]) pick(opts[i]); });
  return { close, box };
}

function wire() {
  const a = combo('at', 'atList', (p) => { state.at = p; $('at').value = p.label; draw(); });
  a.box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== a.box) { a.close(); a.box.value = state.at.label; } }, 150));
  const v = combo('vs', 'vsList', (p) => { state.vs = p; $('vs').value = p.label; draw(); }, () => { state.vs = null; draw(); });
  v.box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== v.box) { v.close(); v.box.value = state.vs ? state.vs.label : ''; } }, 150));
  $('addVs').addEventListener('click', () => { $('vsRow').hidden = false; $('addVs').hidden = true; $('vs').focus(); });
  $('dropVs').addEventListener('click', () => { state.vs = null; $('vs').value = ''; $('vsRow').hidden = true; $('addVs').hidden = false; draw(); });
  $('prev').addEventListener('click', () => setDate(L.addDays(theDate(), -1)));
  $('next').addEventListener('click', () => setDate(L.addDays(theDate(), 1)));
  $('today').addEventListener('click', () => setDate(null));
  $('date').addEventListener('change', () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('date').value);
    if (m) setDate([+m[1], +m[2], +m[3]]);
  });
}

async function main() {
  let doc;
  try {
    const r = await fetch('data/places.json');
    if (!r.ok) throw new Error(r.status);
    doc = await r.json();
  } catch (e) { $('mZone').textContent = `Could not load the list of towns (${e.message}). Reload to try again.`; return; }
  PLACES = doc.places; ZONES = doc.zones;
  const want = L.decodeState(location.search);
  const find = (label) => { const p = label && L.placeByLabel(PLACES, label); return p ? L.toPlace(p, ZONES) : null; };
  let mine = null;
  try { mine = L.biggestIn(PLACES, ZONES, Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* no zone: London */ }
  state.at = find(want.at) || (mine && L.toPlace(mine, ZONES)) || find('London, England, United Kingdom');
  state.vs = find(want.vs);
  state.date = want.date;
  $('at').value = state.at.label;
  if (state.vs) { $('vs').value = state.vs.label; $('vsRow').hidden = false; $('addVs').hidden = true; }
  wire();
  draw();
}
main();
