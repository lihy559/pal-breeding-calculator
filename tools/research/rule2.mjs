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
const index = new Map();
for (const p of pals) {
  const r = rowByName.get(norm(p.slug));
  if (!r) continue;
  bp.set(p.slug, +r.BreedPower);
  variant.set(p.slug, r.IsVariant === 'True');
  index.set(p.slug, +r.IndexOrder);
}
const pool = pals.map((p) => p.slug).filter((s) => bp.has(s) && !variant.get(s));
pool.sort((a, b) => bp.get(a) - bp.get(b) || index.get(a) - index.get(b));

function test(label, pick) {
  let ok = 0;
  let bad = 0;
  const samples = [];
  for (const [a, b, c] of pairs) {
    if (a === b) {
      if (c === a) ok++;
      else bad++;
      continue;
    }
    if (!bp.has(a) || !bp.has(b) || !bp.has(c)) continue;
    const cp = Math.floor((bp.get(a) + bp.get(b) + 1) / 2);
    const got = pick(cp);
    if (got === c) ok++;
    else {
      bad++;
      if (samples.length < 8) samples.push(`${a}(${bp.get(a)})+${b}(${bp.get(b)})=>${c}(${bp.get(c)}) cp=${cp} got=${got}(${bp.get(got)})`);
    }
  }
  console.log(`${label}\n  ok=${ok} bad=${bad} (${((ok / (ok + bad)) * 100).toFixed(2)}%)`);
  if (samples.length) console.log('  ' + samples.join('\n  '));
}

test('round-up (smallest bp >= cp)', (cp) => {
  for (const s of pool) if (bp.get(s) >= cp) return s;
  return pool[pool.length - 1];
});

test('closest bp, tie -> larger bp', (cp) => {
  let best = null;
  let bd = Infinity;
  for (const s of pool) {
    const d = Math.abs(bp.get(s) - cp);
    if (d < bd || (d === bd && bp.get(s) > bp.get(best))) {
      bd = d;
      best = s;
    }
  }
  return best;
});
