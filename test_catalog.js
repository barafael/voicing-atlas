const VX = require('./core.js');
const assert = require('assert');
const T = VX.enumerate(), N = T.N, C = VX.CATALOG;
// decode the embedded acoustic data the same way the page does
const b = Buffer.from(require('fs').readFileSync('acoustic.b64', 'utf8'), 'base64');
const rough = i => b.readUInt16LE(2 * i) / 65535 * 6, period = i => b.readUInt16LE(2 * (N + i)) / 65535;
function rankFn(get) { const v = Array.from({ length: N }, (_, i) => get(i)).sort((a, b) => a - b); return x => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } return lo / (N - 1); }; }
const rR = rankFn(rough), rP = rankFn(period);
const byMask = new Map();
let out = 0;
for (const e of C) {
  assert(e.notes[0] === 0 && e.notes.every((n, k) => !k || n > e.notes[k - 1]), e.name);
  if (!e.inRange) { out++; console.log('OUT OF RANGE:', e.name, e.spelled, 'span', e.span); continue; }
  const i = T.index.get(e.mask);
  assert(i !== undefined, 'missing ' + e.name);
  e.i = i;
  (byMask.get(e.mask) || byMask.set(e.mask, []).get(e.mask)).push(e.name);
}
// spot checks against hand-derived shapes
const want = { 'So What voicing': [0, 5, 10, 15, 19], 'Tristan chord': [0, 6, 10, 15], 'Hendrix chord (7♯9)': [0, 4, 10, 15], 'Kenny Barron minor, top 11th left out': [0, 7, 14, 15, 22], 'Cmaj7 drop 2, 5th in bass': [0, 5, 9, 16], 'C7 + D triad (13♯11)': [0, 4, 10, 14, 18, 21], 'Farben chord (Schoenberg)': [0, 8, 11, 16, 21] };
for (const [n, notes] of Object.entries(want)) assert.deepStrictEqual(C.find(e => e.name === n).notes, notes, n);
console.log('entries', C.length, 'in range', C.length - out, 'distinct shapes', byMask.size);
console.log('shared shapes:'); for (const [m, names] of byMask) if (names.length > 1) console.log('  ', VX.notesOf(m).join(','), '=', names.join(' | '));
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const cats = [...new Set(C.map(e => e.cat))];
console.log('\ncategory | n | median roughness pct | median periodicity pct | median slope | slope<0 share | median bottom gap');
for (const cat of cats.concat(['ALL COMMON'])) {
  const es = C.filter(e => e.inRange && (cat === 'ALL COMMON' || e.cat === cat));
  const ss = es.map(e => VX.structural(e.mask));
  const n3 = ss.filter(s => s.n >= 3);
  console.log(cat.padEnd(40), String(es.length).padStart(3), (100 * med(es.map(e => rR(rough(e.i))))).toFixed(0).padStart(5), (100 * med(es.map(e => rP(period(e.i))))).toFixed(0).padStart(5),
    med(n3.map(s => s.slope)).toFixed(2).padStart(6), (n3.filter(s => s.slope < 0).length / n3.length).toFixed(2).padStart(5), String(med(ss.map(s => s.bottom))).padStart(3));
}
// same measures for the whole population, per note count, for comparison
for (const n of [3, 4, 5, 6]) {
  const idx = []; for (let i = 0; i < N; i++) if (T.depth[i] === n - 1) idx.push(i);
  const ss = idx.map(i => VX.structural(T.masks[i]));
  const cm = C.filter(e => e.inRange && e.notes.length === n);
  console.log(`all ${n}-note voicings: median slope`, med(ss.map(s => s.slope)).toFixed(2), 'slope<0 share', (ss.filter(s => s.slope < 0).length / ss.length).toFixed(2), 'median bottom', med(ss.map(s => s.bottom)),
    `| common ${n}-note (${cm.length}): median rough pct within n`, cm.length ? (100 * med(cm.map(e => { const r = rough(e.i); return idx.filter(i => rough(i) < r).length / idx.length; }))).toFixed(0) : '-',
    'median period pct within n', cm.length ? (100 * med(cm.map(e => { const p = period(e.i); return idx.filter(i => period(i) < p).length / idx.length; }))).toFixed(0) : '-');
}
console.log('OK');
