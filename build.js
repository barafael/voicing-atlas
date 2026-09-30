// Builds the page: voicing-explorer.html (body only, for the claude.ai artifact)
// and index.html (a complete document, for GitHub Pages).
const fs = require('fs');
const page = fs.readFileSync('page.html', 'utf8');
const core = fs.readFileSync('core.js', 'utf8');
const data = fs.readFileSync('acoustic.b64', 'utf8').trim();
const out = page.replace('/*DATA*/', () => data).replace('/*CORE*/', () => core);
fs.writeFileSync('voicing-explorer.html', out);
const head = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>';
fs.writeFileSync('index.html', head + out + '</body></html>');
// syntax check every inline script
const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m, k = 0;
while ((m = re.exec(out))) { new Function(m[1]); k++; }
console.log('scripts ok:', k, 'size KB:', (out.length / 1024).toFixed(0));
