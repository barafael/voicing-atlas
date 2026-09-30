// Computes acoustic features for every voicing (preorder) and writes them as base64.
// Layout: 4 x Uint16 arrays (rough/6, period, tau/0.04, harmErr/600) then Uint8 harmMax.
const VX = require('./core.js');
const fs = require('fs');
const T = VX.enumerate(), N = T.N;
const buf = Buffer.alloc(N * 9);
const q = v => Math.max(0, Math.min(65535, Math.round(v * 65535)));
let maxErr = 0, maxH = 0;
for (let i = 0; i < N; i++) {
  const a = VX.acoustic(T.masks[i]);
  buf.writeUInt16LE(q(a.rough / 6), 2 * i);
  buf.writeUInt16LE(q(a.period), 2 * (N + i));
  buf.writeUInt16LE(q(a.tau / 0.04), 2 * (2 * N + i));
  buf.writeUInt16LE(q(a.harmErr / 600), 2 * (3 * N + i));
  buf.writeUInt8(Math.min(255, a.harmMax), 8 * N + i);
  maxErr = Math.max(maxErr, a.harmErr); maxH = Math.max(maxH, a.harmMax);
}
fs.writeFileSync('acoustic.b64', buf.toString('base64'));
console.log('N', N, 'bytes', buf.length, 'maxErr', maxErr.toFixed(1), 'maxH', maxH);
