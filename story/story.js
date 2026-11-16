/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the marks move to their place in that layout. Numbers in
 * the prose are not typed in: a <b data-fact="..."> is computed here from story.json's
 * towns, and test/story.test.mjs checks each against the `check` block build_story.py
 * computed in python. Modelled on further-north/site/story. */
import { layout, rowStats, STEPS, MIN } from './layout.js';

const fmt = (n) => n.toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
/* minutes after noon -> "12:22" / "11:47" on a 24-hour clock */
export const clockOf = (m) => {
  const t = 720 + Math.round(m);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const mins = (m) => { const a = Math.abs(Math.round(m)); return `${a} minute${a === 1 ? '' : 's'}`; };

export function numbers(D) {
  const N = { n_towns: D.towns.length };
  for (const { key } of D.rows) N[key] = rowStats(D, key);
  return N;
}

/* "after:all" -> "77%". Unknown names throw: a typo must not render as blank */
export function fact(D, spec) {
  const N = numbers(D);
  const [f, k] = spec.split(':');
  const S = () => { if (!(k in N)) throw new Error(`unknown fact ${spec}`); return N[k]; };
  switch (f) {
    case 'n_towns': return fmt(N.n_towns);
    case 'year': return String(D.year);
    case 'billion': return `${(S().pop / 1e9).toFixed(1)} billion`;
    case 'million': return `${fmt(Math.round(S().pop / 1e6))} million`;
    case 'after': return pct(S().after);
    case 'before': return pct(1 - S().after);
    case 'near': return pct(S().near);
    case 'half': return pct(S().half_hour);
    case 'hour': return pct(S().hour);
    case 'early': return pct(S().early_half);
    case 'clock': return clockOf(S().median);
    case 'mins': return mins(S().median);
    case 'earliest': return clockOf(S().min);
    case 'latest': return clockOf(S().max);
    case 'span': return `${((S().max - S().min) / 60).toFixed(1)} hours`;
    case 'summer': return mins(N.all.median - N.std.median);
    default: throw new Error(`unknown fact ${spec}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gS = el('g'), gR = el('g');
  svg.append(gAxis, gS, gR);
  plot.append(svg);
  const dots = D.rows.map((r) => {
    const c = gR.appendChild(el('circle', { r: 0 }));
    c.append(el('title')); c.firstChild.textContent = `${r.label}: the middle person`;
    return c;
  });
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };
  const grid = (x1, y1, x2, y2, cls = 'grid') => gAxis.append(el('line', { x1, x2, y1, y2, class: cls }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    gS.replaceChildren();
    for (const r of D.rows) for (const b of L.bars[r.key]) {
      const e = gS.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: 'bar' }));
      e.append(el('title')); e.firstChild.textContent = `${r.label}: ${fmt(Math.round(b.n / 1e5) / 10)} million people`;
    }
    L.real.forEach((d, k) => {
      const c = dots[k];
      c.style.transform = `translate(${d.x}px, ${d.y}px)`;
      c.setAttribute('r', d.r);
      c.style.fill = d.fill;
      c.style.opacity = d.op;
    });
    gAxis.replaceChildren();
    const narrow = W < 420;
    for (let v = MIN[0]; v <= MIN[1] + 1e-9; v += 30) {
      grid(L.X(v), 0, L.X(v), H, v === 0 ? 'grid zero' : 'grid');
      if (!narrow || v % 60 === 0) tick(L.X(v), H + 16, clockOf(v), 'tick mid');
    }
    tick(W / 2, H + 32, 'when the sun is highest, by the clock (the year’s mean)', 'tick mid');
    L.show.forEach((key, k) => {
      const r = D.rows.find((x) => x.key === key), S = rowStats(D, key);
      tick(0, L.Y(k) - L.rowH + (L.show.length > 3 ? 11 : 14), `${r.label}: middle ${clockOf(S.median)}`, 'tick cat');
    });
    document.body.dataset.step = i;
    const bars = D.rows.reduce((n, r) => n + L.bars[r.key].length, 0);
    window.__story = { step: i, name, shown: bars + L.real.filter((d) => d.op > 0).length };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
