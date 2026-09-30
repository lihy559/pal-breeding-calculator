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
for (const p of pals) {
  const r = rowByName.get(norm(p.slug));
  if (r) bp.set(p.slug, +r.BreedPower);
}

let betweenOk = 0;
let betweenBad = 0;
const viol = [];
for (const [a, b, c] of pairs) {
  if (!bp.has(a) || !bp.has(b) || !bp.has(c)) continue;
  const lo = Math.min(bp.get(a), bp.get(b));
  const hi = Math.max(bp.get(a), bp.get(b));
  if (bp.get(c) >= lo && bp.get(c) <= hi) betweenOk++;
  else {
    betweenBad++;
    if (viol.length < 10) viol.push(`${a}(${bp.get(a)})+${b}(${bp.get(b)})=>${c}(${bp.get(c)})`);
  }
}
console.log('betweenness check (child rank within parents):', betweenOk, 'violations', betweenBad);
console.log(viol.join('\n'));

// how often is the table child the unique closest BP to the midpoint?
const list = [...bp.keys()];
let uniqueClose = 0;
let uniqueCloseHit = 0;
let tieCount = 0;
for (const [a, b, c] of pairs) {
  if (!bp.has(a) || !bp.has(b) || !bp.has(c)) continue;
  const cp = Math.floor((bp.get(a) + bp.get(b) + 1) / 2);
  let bd = Infinity;
  let ties = [];
  for (const s of list) {
    const d = Math.abs(bp.get(s) - cp);
    if (d < bd) {
      bd = d;
      ties = [s];
    } else if (d === bd) ties.push(s);
  }
  if (ties.length === 1) {
    uniqueClose++;
    if (ties[0] === c) uniqueCloseHit++;
  } else tieCount++;
}
console.log(`unique closest: ${uniqueClose}, table agrees: ${uniqueCloseHit} (${((uniqueCloseHit / uniqueClose) * 100).toFixed(1)}%)`);
console.log('pairs with tied closest BP:', tieCount);
