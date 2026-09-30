const VX = require('./core.js');
const T = VX.enumerate(), N = T.N;
const C = VX.CATALOG.filter(e => e.inRange);
const masks = new Set(C.map(e => e.mask));
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
for (const n of [3, 4, 5]) {
  const all = [], com = [];
  for (let i = 0; i < N; i++) if (T.depth[i] === n - 1) { const s = VX.structural(T.masks[i]); all.push(s); if (masks.has(T.masks[i])) com.push(s); }
  const row = (lab, f) => console.log(`  ${lab.padEnd(28)} all ${f(all).padStart(6)}   common ${f(com).padStart(6)}`);
  console.log(`${n} notes: ${all.length} voicings, ${com.length} common shapes`);
  row('median span', a => String(med(a.map(s => s.span))));
  row('median bottom gap', a => String(med(a.map(s => s.bottom))));
  row('has a semitone gap', a => (100 * mean(a.map(s => s.minGap === 1 ? 1 : 0))).toFixed(0) + '%');
  row('lowest gap ≤ 2 st', a => (100 * mean(a.map(s => s.bottom <= 2 ? 1 : 0))).toFixed(0) + '%');
  row('octave doubling', a => (100 * mean(a.map(s => s.doublings > 0 ? 1 : 0))).toFixed(0) + '%');
  row('fits a heptatonic scale', a => (100 * mean(a.map(s => (s.fam & 0b11110) ? 1 : 0))).toFixed(0) + '%');
  row('fits no listed scale', a => (100 * mean(a.map(s => s.fam === 0 ? 1 : 0))).toFixed(0) + '%');
  row('spacing narrows upward', a => (100 * mean(a.map(s => s.slope < 0 ? 1 : 0))).toFixed(0) + '%');
}
