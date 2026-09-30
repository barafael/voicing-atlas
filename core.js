// Voicing core: enumeration, acoustic and structural features. Pure, no DOM.
var VX = (function () {
  var BASS = 110, MAXN = 6, RANGE = 24, NPART = 4;
  var TAU_MIN = 0.002, TAU_MAX = 0.040, TAU_STEP = 0.00004;

  // Preorder DFS of the bottom-up tree: parent = voicing minus its top note.
  // In preorder, node i's subtree is exactly indices [i, i + size[i]).
  function enumerate() {
    var masks = [], depth = [], parent = [], size = [], top = [];
    function dfs(mask, d, par, t) {
      var i = masks.length;
      masks.push(mask); depth.push(d); parent.push(par); top.push(t); size.push(1);
      if (d < MAXN - 1) for (var k = t + 1; k <= RANGE; k++) dfs(mask | (1 << k), d + 1, i, k);
      size[i] = masks.length - i;
    }
    dfs(1, 0, -1, 0);
    var index = new Map();
    for (var i = 0; i < masks.length; i++) index.set(masks[i], i);
    return {
      N: masks.length,
      masks: Uint32Array.from(masks), depth: Uint8Array.from(depth),
      parent: Int32Array.from(parent), size: Int32Array.from(size), top: Uint8Array.from(top),
      index: index
    };
  }

  function notesOf(mask) {
    var out = [];
    for (var k = 0; k <= RANGE; k++) if (mask & (1 << k)) out.push(k);
    return out;
  }
  function maskOf(notes) {
    var m = 0;
    for (var i = 0; i < notes.length; i++) m |= 1 << notes[i];
    return m >>> 0;
  }
  function freq(k) { return BASS * Math.pow(2, k / 12); }

  // Harmonic partials (amplitude 1/h), coincident frequencies merged in phase.
  function partials(notes, nPart) {
    nPart = nPart || NPART;
    var list = [];
    for (var i = 0; i < notes.length; i++) {
      var f0 = freq(notes[i]);
      for (var h = 1; h <= nPart; h++) list.push([f0 * h, 1 / h]);
    }
    list.sort(function (a, b) { return a[0] - b[0]; });
    var f = [], a = [];
    for (var j = 0; j < list.length; j++) {
      var n = f.length;
      if (n && Math.abs(list[j][0] - f[n - 1]) < 1e-6 * list[j][0]) a[n - 1] += list[j][1];
      else { f.push(list[j][0]); a.push(list[j][1]); }
    }
    return { f: f, a: a };
  }

  // Sethares (1993) parameterisation of the Plomp–Levelt dissonance curve.
  function roughness(p) {
    var f = p.f, a = p.a, r = 0;
    for (var i = 0; i < f.length; i++) {
      for (var j = i + 1; j < f.length; j++) {
        var s = 0.24 / (0.0207 * f[i] + 18.96), d = f[j] - f[i];
        r += Math.min(a[i], a[j]) * (Math.exp(-3.5 * s * d) - Math.exp(-5.75 * s * d));
      }
    }
    return r;
  }

  // Long-run autocorrelation of a sum of sinusoids, normalised so R(0) = 1.
  function autocorr(p, tau) {
    var num = 0, den = 0;
    for (var i = 0; i < p.f.length; i++) {
      var w = p.a[i] * p.a[i];
      num += w * Math.cos(2 * Math.PI * p.f[i] * tau);
      den += w;
    }
    return num / den;
  }

  // Coherence C(tau) = mean of R(k*tau) for k = 1..K: stays near 1 only if the wave
  // repeats over several periods, so near-unison clusters don't score as periodic.
  var K = 6;
  function coherence(p, tau) {
    var s = 0;
    for (var k = 1; k <= K; k++) s += autocorr(p, k * tau);
    return s / K;
  }
  var NLAGS = Math.floor((TAU_MAX - TAU_MIN) / TAU_STEP) + 1;
  var acc = new Float64Array(NLAGS);
  // Best coherence peak for tau in [2 ms, 40 ms]; ties go to the shortest lag (highest pitch).
  function periodicity(p) {
    acc.fill(0);
    var den = 0;
    for (var i = 0; i < p.f.length; i++) {
      var w = p.a[i] * p.a[i];
      den += w;
      for (var k = 1; k <= K; k++) {
        var om = 2 * Math.PI * p.f[i] * k;
        var c = Math.cos(om * TAU_MIN), s = Math.sin(om * TAU_MIN);
        var cd = Math.cos(om * TAU_STEP), sd = Math.sin(om * TAU_STEP);
        for (var j = 0; j < NLAGS; j++) {
          acc[j] += w * c;
          var c2 = c * cd - s * sd; s = s * cd + c * sd; c = c2;
        }
      }
    }
    var norm = 1 / (K * den), max = -Infinity;
    for (var j2 = 0; j2 < NLAGS; j2++) if (acc[j2] * norm > max) max = acc[j2] * norm;
    var best = 0;
    for (var j3 = 1; j3 < NLAGS - 1; j3++) {
      var v = acc[j3] * norm;
      if (v >= max - 0.005 && v >= acc[j3 - 1] * norm && v >= acc[j3 + 1] * norm) { best = j3; break; }
    }
    var lo = TAU_MIN + Math.max(0, best - 1) * TAU_STEP, hi = TAU_MIN + Math.min(NLAGS - 1, best + 1) * TAU_STEP;
    var g = 0.6180339887;
    for (var it = 0; it < 30; it++) {
      var x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
      if (coherence(p, x1) > coherence(p, x2)) hi = x2; else lo = x1;
    }
    var tau = (lo + hi) / 2;
    return { score: coherence(p, tau), tau: tau };
  }

  // How well the note fundamentals sit on the harmonic series of 1/tau.
  function harmonicFit(notes, tau) {
    var f0 = 1 / tau, err = 0, maxH = 0;
    for (var i = 0; i < notes.length; i++) {
      var h = freq(notes[i]) / f0, n = Math.max(1, Math.round(h));
      err += Math.abs(1200 * Math.log2(h / n));
      if (n > maxH) maxH = n;
    }
    return { err: err / notes.length, maxH: maxH };
  }

  function acoustic(mask) {
    var notes = notesOf(mask), p = partials(notes);
    var per = periodicity(p), hf = harmonicFit(notes, per.tau);
    return { rough: roughness(p), period: per.score, tau: per.tau, harmErr: hf.err, harmMax: hf.maxH };
  }

  // ---- structural ----
  var FAMILIES = [
    { key: 'pentatonic', label: 'Pentatonic', pcs: [0, 2, 4, 7, 9] },
    { key: 'diatonic', label: 'Diatonic', pcs: [0, 2, 4, 5, 7, 9, 11] },
    { key: 'acoustic', label: 'Acoustic (melodic minor)', pcs: [0, 2, 4, 6, 7, 9, 10] },
    { key: 'harmMinor', label: 'Harmonic minor', pcs: [0, 2, 3, 5, 7, 8, 11] },
    { key: 'harmMajor', label: 'Harmonic major', pcs: [0, 2, 4, 5, 7, 8, 11] },
    { key: 'wholeTone', label: 'Whole-tone', pcs: [0, 2, 4, 6, 8, 10] },
    { key: 'hexatonic', label: 'Hexatonic (augmented)', pcs: [0, 1, 4, 5, 8, 9] },
    { key: 'octatonic', label: 'Octatonic (diminished)', pcs: [0, 1, 3, 4, 6, 7, 9, 10] }
  ];
  FAMILIES.forEach(function (fam) {
    var base = 0;
    fam.pcs.forEach(function (p) { base |= 1 << p; });
    fam.rots = [];
    for (var t = 0; t < 12; t++) {
      var r = ((base << t) | (base >>> (12 - t))) & 0xfff;
      if (fam.rots.indexOf(r) < 0) fam.rots.push(r);
    }
  });
  // Families grouped for colouring: 0 pentatonic, 1 heptatonic, 2 symmetric, 3 none.
  var GROUP_OF = [0, 1, 1, 1, 1, 2, 2, 2];

  function pcMaskOf(notes) {
    var m = 0;
    for (var i = 0; i < notes.length; i++) m |= 1 << (notes[i] % 12);
    return m;
  }
  function familyBits(pcm) {
    var bits = 0;
    for (var f = 0; f < FAMILIES.length; f++) {
      var rots = FAMILIES[f].rots;
      for (var r = 0; r < rots.length; r++) if ((pcm & ~rots[r]) === 0) { bits |= 1 << f; break; }
    }
    return bits;
  }
  function familyGroup(bits) {
    for (var f = 0; f < FAMILIES.length; f++) if (bits & (1 << f)) return GROUP_OF[f];
    return 3;
  }

  function icv(pcs) {
    var v = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < pcs.length; i++) for (var j = i + 1; j < pcs.length; j++) {
      var d = Math.abs(pcs[i] - pcs[j]) % 12, ic = Math.min(d, 12 - d);
      if (ic) v[ic - 1]++;
    }
    return v;
  }

  // Rahn prime form.
  function primeForm(pcs) {
    if (pcs.length <= 1) return pcs.length ? [0] : [];
    var best = null;
    [pcs, pcs.map(function (p) { return (12 - p) % 12; })].forEach(function (set) {
      var s = set.slice().sort(function (a, b) { return a - b; });
      for (var r = 0; r < s.length; r++) {
        var c = [];
        for (var i = 0; i < s.length; i++) c.push((s[(r + i) % s.length] - s[r] + 12) % 12);
        if (!best || better(c, best)) best = c;
      }
    });
    return best;
    function better(a, b) {
      for (var i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return a[i] < b[i];
      return false;
    }
  }

  function structural(mask) {
    var notes = notesOf(mask), n = notes.length, gaps = [];
    for (var i = 1; i < n; i++) gaps.push(notes[i] - notes[i - 1]);
    var slope = 0;
    if (gaps.length >= 2) {
      var mx = (gaps.length - 1) / 2, my = 0, cov = 0, vx = 0;
      gaps.forEach(function (g) { my += g; });
      my /= gaps.length;
      gaps.forEach(function (g, x) { cov += (x - mx) * (g - my); vx += (x - mx) * (x - mx); });
      slope = cov / vx;
    }
    var pcm = pcMaskOf(notes), pcs = [];
    for (var p = 0; p < 12; p++) if (pcm & (1 << p)) pcs.push(p);
    var fam = familyBits(pcm);
    return {
      notes: notes, n: n, gaps: gaps, span: notes[n - 1],
      bottom: gaps.length ? gaps[0] : 0,
      minGap: gaps.length ? Math.min.apply(null, gaps) : 0,
      slope: slope, pcs: pcs, doublings: n - pcs.length,
      icv: icv(pcs), fam: fam, group: familyGroup(fam)
    };
  }

  // ---- note names and the catalogue of common voicings ----
  var LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var PC_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  // Spelled notes, lowest first; each note goes 1–12 semitones above the one before.
  function parseNames(text) {
    var toks = text.trim().split(/[\s,\-–—]+/).filter(Boolean);
    var pcs = toks.map(function (t) {
      var m = /^([A-Ga-g])([#♯b♭]*)\d*$/.exec(t);
      if (!m) throw new Error('“' + t + '” is not a note name. Use letters A–G with # or b.');
      var pc = LETTER[m[1].toUpperCase()];
      m[2].split('').forEach(function (ch) { pc += (ch === '#' || ch === '♯') ? 1 : -1; });
      return ((pc % 12) + 12) % 12;
    });
    var notes = [0], cur = 0;
    for (var k = 1; k < pcs.length; k++) {
      var d = ((pcs[k] - pcs[k - 1]) % 12 + 12) % 12;
      cur += d === 0 ? 12 : d;
      notes.push(cur);
    }
    return { notes: notes, bassPc: pcs[0] };
  }

  var CATALOG = (function () {
    var out = [];
    function add(cat, name, spelled) {
      var p = parseNames(spelled);
      out.push({ cat: cat, name: name, spelled: spelled, notes: p.notes, bassPc: p.bassPc });
    }
    function addNotes(cat, name, abs) {
      var low = Math.min.apply(null, abs), notes = abs.map(function (n) { return n - low; }).sort(function (a, b) { return a - b; });
      var bassPc = ((low % 12) + 12) % 12;
      out.push({ cat: cat, name: name, notes: notes, bassPc: bassPc,
        spelled: notes.map(function (n) { return PC_NAMES[(bassPc + n) % 12]; }).join(' ') });
    }
    var C = 'Triads';
    add(C, 'Major triad', 'C E G'); add(C, 'Major triad, 1st inversion', 'E G C'); add(C, 'Major triad, 2nd inversion', 'G C E');
    add(C, 'Minor triad', 'C Eb G'); add(C, 'Minor triad, 1st inversion', 'Eb G C'); add(C, 'Minor triad, 2nd inversion', 'G C Eb');
    add(C, 'Diminished triad', 'C Eb Gb'); add(C, 'Augmented triad', 'C E G#');
    add(C, 'Sus4 triad', 'C F G'); add(C, 'Sus2 triad', 'C D G');
    add(C, 'Open major triad (1-5-3)', 'C G E'); add(C, 'Open minor triad (1-5-♭3)', 'C G Eb');
    add(C, 'Power chord with octave', 'C G C'); add(C, 'Mu major (Steely Dan)', 'C D E G'); add(C, 'Open add9 (1-5-9-3)', 'C G D E');
    C = 'Shell voicings (Bud Powell)';
    add(C, 'maj7 shell 1-3-7', 'C E B'); add(C, 'maj7 shell 1-7-3', 'C B E');
    add(C, '7 shell 1-3-♭7', 'C E Bb'); add(C, '7 shell 1-♭7-3', 'C Bb E');
    add(C, 'm7 shell 1-♭3-♭7', 'C Eb Bb'); add(C, 'm7 shell 1-♭7-♭3', 'C Bb Eb');
    add(C, '6 shell 1-6-3', 'C A E'); add(C, 'Lydian shell 1-7-3-♯11', 'C B E F#');

    var QUAL = [['maj7', [0, 4, 7, 11]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]], ['m7♭5', [0, 3, 6, 10]]];
    var TONE = ['root', '3rd', '5th', '7th'], INV = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];
    function closeVoicing(q, inv) {
      var v = [];
      for (var k = 0; k < 4; k++) v.push(q[(inv + k) % 4] + 12 * Math.floor((inv + k) / 4));
      return v;
    }
    QUAL.forEach(function (q) { for (var inv = 0; inv < 4; inv++) addNotes('Seventh chords, close position', 'C' + q[0] + ', ' + INV[inv], closeVoicing(q[1], inv)); });
    add('Seventh chords, close position', 'Cdim7', 'C Eb Gb A'); add('Seventh chords, close position', 'Cm(maj7)', 'C Eb G B');
    add('Seventh chords, close position', 'Cmaj7♯5', 'C E G# B'); add('Seventh chords, close position', 'C7sus4', 'C F G Bb');
    add('Seventh chords, close position', 'C6', 'C E G A'); add('Seventh chords, close position', 'Cm6', 'C Eb G A');
    [['Drop 2', [2]], ['Drop 3', [3]], ['Drop 2 & 4', [2, 4]]].forEach(function (d) {
      QUAL.forEach(function (q) {
        for (var inv = 0; inv < 4; inv++) {
          var v = closeVoicing(q[1], inv);
          d[1].forEach(function (t) { v[4 - t] -= 12; });
          var low = 0; for (var k = 1; k < 4; k++) if (v[k] < v[low]) low = k;
          addNotes(d[0], 'C' + q[0] + ' ' + d[0].toLowerCase() + ', ' + TONE[(inv + low) % 4] + ' in bass', v);
        }
      });
    });
    C = 'Rootless (Bill Evans A/B), ii–V–I in C';
    add(C, 'Dm9 A form (3-5-7-9)', 'F A C E'); add(C, 'Dm9 B form (7-9-3-5)', 'C E F A');
    add(C, 'G13 A form (7-9-3-13)', 'F A B E'); add(C, 'G13 B form (3-13-7-9)', 'B E F A');
    add(C, 'Cmaj9 A form (3-5-7-9)', 'E G B D'); add(C, 'Cmaj9 B form (7-9-3-5)', 'B D E G');
    add(C, 'G7alt (3-♭7-♯9-♭13)', 'B F A# D#');
    add(C, 'Dm9 A form over root', 'D F A C E'); add(C, 'Dm9 B form over root', 'D C E F A');
    add(C, 'G13 A form over root', 'G F A B E'); add(C, 'G13 B form over root', 'G B E F A');
    add(C, 'Cmaj9 A form over root', 'C E G B D'); add(C, 'Cmaj9 B form over root', 'C B D E G');
    add(C, 'G7alt over root', 'G B F A# D#');
    C = 'Quartal and modal';
    add(C, 'So What voicing', 'E A D G B');
    add(C, 'Stacked fourths, 3 notes', 'D G C'); add(C, 'Stacked fourths, 4 notes', 'D G C F'); add(C, 'Stacked fourths, 5 notes', 'D G C F Bb');
    add(C, 'Stacked fifths', 'C G D A'); add(C, 'Fifth, then fourths (McCoy Tyner style)', 'C G C F Bb');
    add(C, '9sus4 as Gm7/C (Maiden Voyage sound)', 'C Bb D F G'); add(C, '6/9 in fourths (1-3-6-9-5)', 'C E A D G');
    C = 'Kenny Barron';
    add(C, 'Kenny Barron minor 11 (1-5-9 | ♭3-♭7-11)', 'C G D Eb Bb F');
    add(C, 'Kenny Barron major (1-5-9 | 3-7-♯11)', 'C G D E B F#');
    add(C, 'Kenny Barron minor, top 11th left out', 'C G D Eb Bb');
    add(C, 'Kenny Barron major, top ♯11 left out', 'C G D E B');
    C = 'Upper-structure triads on C7';
    add(C, 'C7 + D triad (13♯11)', 'C E Bb D F# A'); add(C, 'C7 + E♭ triad (7♯9)', 'C E Bb Eb G Bb');
    add(C, 'C7 + G♭ triad (7♭9♯11)', 'C E Bb Db Gb Bb'); add(C, 'C7 + A♭ triad (7♯5♯9)', 'C E Bb C Eb Ab');
    add(C, 'C7 + A triad (13♭9)', 'C E Bb C# E A');
    C = 'Block chords';
    add(C, 'Shearing locked hands (6th, melody doubled)', 'C E G A C'); add(C, 'Chopin chord (1-♭7-3-13)', 'C Bb E A');
    C = 'Named chords';
    add(C, 'Tristan chord', 'F B D# G#'); add(C, 'Hendrix chord (7♯9)', 'E G# D G');
    add(C, 'Farben chord (Schoenberg)', 'C G# B E A'); add(C, 'Hitchcock chord (minor-major 7)', 'E G B D#');
    add(C, 'James Bond chord (m(maj9))', 'E G B D# F#'); add(C, 'French augmented sixth', 'Ab C D F#');
    add(C, 'Dream chord (La Monte Young)', 'G C C# D');
    add(C, 'Mystic chord (Scriabin)', 'C F# Bb E A D'); add(C, 'Petrushka chord', 'C E G F# A# C#');
    out.forEach(function (e) {
      e.span = e.notes[e.notes.length - 1];
      e.inRange = e.span <= RANGE && e.notes.length <= MAXN;
      e.mask = e.inRange ? maskOf(e.notes) : 0;
    });
    return out;
  })();

  return {
    BASS: BASS, MAXN: MAXN, RANGE: RANGE, NPART: NPART, TAU_MIN: TAU_MIN, TAU_MAX: TAU_MAX,
    FAMILIES: FAMILIES,
    enumerate: enumerate, notesOf: notesOf, maskOf: maskOf, freq: freq,
    partials: partials, roughness: roughness, autocorr: autocorr, coherence: coherence, periodicity: periodicity,
    harmonicFit: harmonicFit, acoustic: acoustic, structural: structural, primeForm: primeForm,
    PC_NAMES: PC_NAMES, parseNames: parseNames, CATALOG: CATALOG
  };
})();
if (typeof module !== 'undefined') module.exports = VX;
