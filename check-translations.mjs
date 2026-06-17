import { en } from './src/translations/en.js';
import { fr } from './src/translations/fr.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function flatten(obj, prefix = '') {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const x of flatten(v, key)) out.add(x);
    } else {
      out.add(key);
    }
  }
  return out;
}
const enKeys = flatten(en);
const frKeys = flatten(fr);

function walk(dir) {
  let files = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (/\.(jsx|js)$/.test(e) && !/\.test\./.test(e)) files.push(p);
  }
  return files;
}
const files = walk('./src');

const used = new Map();
const re = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(txt))) {
    if (!used.has(m[1])) used.set(m[1], f.split(/[\\/]/).slice(-2).join('/'));
  }
}

const missingEn = [], missingFr = [];
for (const [key, file] of used) {
  if (!enKeys.has(key)) missingEn.push([key, file]);
  if (!frKeys.has(key)) missingFr.push([key, file]);
}

console.log('Total t() keys used:', used.size);
console.log('\n=== MISSING in en.js (' + missingEn.length + ') ===');
for (const [k, f] of missingEn) console.log('  ' + k + '   <- ' + f);
console.log('\n=== MISSING in fr.js (' + missingFr.length + ') ===');
for (const [k, f] of missingFr) console.log('  ' + k + '   <- ' + f);

const onlyEn = [...enKeys].filter(k => !frKeys.has(k));
const onlyFr = [...frKeys].filter(k => !enKeys.has(k));
console.log('\n=== Defined in en.js but NOT fr.js (' + onlyEn.length + ') ===');
console.log(onlyEn.map(k => '  ' + k).join('\n'));
console.log('\n=== Defined in fr.js but NOT en.js (' + onlyFr.length + ') ===');
console.log(onlyFr.map(k => '  ' + k).join('\n'));
