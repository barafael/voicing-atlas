const VX = require('./core.js');
const assert = require('assert');
const T = VX.enumerate();
assert.strictEqual(T.N, 55455);
const lv = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < T.N; i++) lv[T.depth[i]]++;
assert.deepStrictEqual(lv, [1, 24, 276, 2024, 10626, 42504]);
for (let i = 1; i < T.N; i++) {
  const p = T.parent[i];
  assert(i > p && i < p + T.size[p]);
  assert.strictEqual(T.masks[p], T.masks[i] & ~(1 << T.top[i]));
}
const ex = [[0, 10, 13, 16, 21], [0, 7, 10, 14, 17]];
for (const notes of ex) {
  const m = VX.maskOf(notes), i = T.index.get(m);
  assert(i !== undefined);
  const path = [];
  for (let j = i; j >= 0; j = T.parent[j]) path.unshift(VX.notesOf(T.masks[j]).join(','));
  const s = VX.structural(m);
  const fams = VX.FAMILIES.filter((f, k) => s.fam & (1 << k)).map(f => f.key);
  console.log(notes.join(' '), '| path:', path.join(' > '));
  console.log('  fams', fams, 'group', s.group, 'slope', s.slope.toFixed(2), 'prime', VX.primeForm(s.pcs), 'icv', s.icv);
  console.log('  acoustic', VX.acoustic(m));
}
const s1 = VX.structural(VX.maskOf(ex[0])), s2 = VX.structural(VX.maskOf(ex[1]));
assert(s1.fam & (1 << 7)); // octatonic
assert(s2.fam & 1 && s2.fam & 2); // pentatonic + diatonic
// sanity: single note, octave, fifth, minor second
for (const n of [[0], [0, 12], [0, 7], [0, 1], [0, 4, 7], [0, 1, 2]]) console.log(n.join(','), VX.acoustic(VX.maskOf(n)));
console.log('prime of major triad', VX.primeForm([0, 4, 7]), 'dim7', VX.primeForm([0, 3, 6, 9]));
let t0 = Date.now();
let rmax = 0;
for (let i = 0; i < T.N; i++) { const a = VX.acoustic(T.masks[i]); if (a.rough > rmax) rmax = a.rough; }
console.log('full acoustic pass ms', Date.now() - t0, 'rough max', rmax);
t0 = Date.now();
for (let i = 0; i < T.N; i++) VX.structural(T.masks[i]);
console.log('structural pass ms', Date.now() - t0);
console.log('OK');
