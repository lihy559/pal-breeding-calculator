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
const dex = new Map();
for (const p of pals) {
  const r = rowByName.get(norm(p.slug));
  if (!r) continue;
  bp.set(p.slug, +r.BreedPower);
  variant.set(p.slug, r.IsVariant === 'True');
  dex.set(p.slug, +r.PalDexNo);
}
const pool = pals.map((p) => p.slug).filter((s) => bp.has(s) && !variant.get(s));

let stat = { minBp: 0, maxBp: 0, minDex: 0, maxDex: 0, none: 0, total: 0 };
const samples = [];
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
  if (ties.length < 2) continue;
  stat.total++;
  if (ties.includes(c)) {
    const minBp = Math.min(...ties.map((s) => bp.get(s)));
    const maxBp = Math.max(...ties.map((s) => bp.get(s)));
    const minDex = Math.min(...ties.map((s) => dex.get(s)));
    const maxDex = Math.max(...ties.map((s) => dex.get(s)));
    if (bp.get(c) === minBp) stat.minBp++;
    if (bp.get(c) === maxBp) stat.maxBp++;
    if (dex.get(c) === minDex) stat.minDex++;
    if (dex.get(c) === maxDex) stat.maxDex++;
  } else {
    stat.none++;
    if (samples.length < 8) samples.push(`${a}+${b}=>${c} ties=${ties.slice(0, 4).join('/')}`);
  }
}
console.log('tie cases', stat.total, stat);
console.log(samples.join('\n'));
