# Voicing Atlas

Every voicing with a fixed bass and up to five more notes within two octaves — 55,455 shapes — arranged as a tree (each voicing grows from its parent by adding one note above the top) and as a lattice (add, remove or move one note). The bass sounds at 110 Hz and each note has 4 partials at amplitude 1/h.

**Live page:** https://barafael.github.io/voicing-atlas/

- Colour the tree by roughness (Sethares/Plomp–Levelt), periodicity (autocorrelation coherence over six periods), implied fundamental, spacing, span or scale membership.
- Click any voicing to hear it; hold a sound and step through its lattice neighbours.
- 135 common voicings (triads, shells, drop 2/3/2&4, Bill Evans rootless, So What and quartal, Kenny Barron, upper structures, Tristan, Hendrix, Farben…) are marked and compared with all voicings of the same size.
- Rate voicings to see which measures separate the ones you like. On GitHub Pages ratings stay in your browser.

## Build

```sh
node precompute.js   # only after changing the measures in core.js (~20 s)
node build.js        # writes index.html and voicing-explorer.html
node test.js && node test_catalog.js
```

`core.js` holds the enumeration, the measures and the voicing catalogue; `page.html` is the page template.
