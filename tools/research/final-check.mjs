import fs from 'node:fs';

const pairs = JSON.parse(fs.readFileSync('data/raw/breeding-pairs.json', 'utf8'));
const palsSrc = fs.readFileSync('data/raw/pals.generated.js', 'utf8');
const pals = JSON.parse(
  palsSrc
    .slice(palsSrc.indexOf('['), palsSrc.lastIndexOf(']') + 1)
    .replace(/`/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":'),
);
const csv = fs.readFileSync('data/raw/pals_palcalc.csv', 'utf8').trim().split(/\r?\n/);
const header = csv[0].split(',');
const rows = csv.slice(1).map((l) => {
  const c = l.split(',');
  const o = {};
  header.forEach((h, i) => (o[h] = c[i]));
  return o;
});
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const rowByName = new Map();
for (const r of rows) {
  rowByName.set(norm(r.Name), r);
  rowByName.set(norm(r.CodeName), r);
}
const bp = new Map();
const variant = new Map();
for (const p of pals) {
  const r = rowByName.get(norm(p.slug));
  if (!r) continue;
  bp.set(p.slug, +r.BreedPower);
  variant.set(p.slug, r.IsVariant === 'True');
}
for (const s of ['Lamball', 'Vixy', 'Chikipi', 'Mau', 'Jolthog', 'Cattiva', 'Mau_Cryst', 'Fuack', 'Flambelle', 'Fuack_Ignis'])
  console.log(s, bp.get(s), 'variant:', variant.get(s));

const pool = pals.map((p) => p.slug).filter((s) => bp.has(s) && !variant.get(s));
let uniq = 0;
let uniqHit = 0;
let tie = 0;
let tieHit = 0;
let unresolved = 0;
const badSamples = [];
for (const [a, b, c] of pairs) {
  if (!bp.has(a) || !bp.has(b) || !bp.has(c)) continue;
  const cp = Math.floor((bp.get(a) + bp.get(b) + 1) / 2);
  let bd = Infinity;
  let ties = [];
  for (const s of pool) {
    const d = Math.abs(bp.get(s) - cp);
    if (d < bd) {
      bd = d;
      ties = [s];
    } else if (d === bd) ties.push(s);
  }
  if (ties.length === 1) {
    uniq++;
    if (ties[0] === c) uniqHit++;
    else if (badSamples.length < 10) badSamples.push(`${a}+${b}=>${c} (closest ${ties[0]} bp${bp.get(ties[0])} cp${cp})`);
  } else {
    tie++;
    if (ties.includes(c)) tieHit++;
  }
}
console.log(`non-variant pool: unique-closest ${uniq} hit ${uniqHit} (${((uniqHit / uniq) * 100).toFixed(1)}%)`);
console.log(`ties ${tie} hit ${tieHit} (${((tieHit / tie) * 100).toFixed(1)}%)`);
console.log(badSamples.join('\n'));
