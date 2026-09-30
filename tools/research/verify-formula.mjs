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
const rows = csv.slice(1).map((line) => {
  const cells = line.split(',');
  const o = {};
  header.forEach((h, i) => (o[h] = cells[i]));
  return o;
});

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cmp = (x, y) => {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const byName = new Map();
for (const r of rows) {
  byName.set(normName(r.Name), r);
  byName.set(normName(r.CodeName), r);
}

const bp = new Map();
const unmatched = [];
for (const p of pals) {
  const r = byName.get(normName(p.slug));
  if (r) bp.set(p.slug, +r.BreedPower);
  else unmatched.push(p.slug);
}
console.log('matched', bp.size, '/', pals.length);
console.log('unmatched slugs:', unmatched.join(','));
console.log('missing breedpower rows:', rows.length);

// prioritize variants: use PalDexNo + IsVariant as CombiDuplicatePriority proxy (lower priority number = ?)
// palcalc uses BreedingPowerPriority (CombiDuplicatePriority). We don't have it in CSV; try 0 for now.
const priority = new Map();
const isVariant = new Map();
for (const p of pals) {
  const r = byName.get(normName(p.slug));
  priority.set(p.slug, 0);
  isVariant.set(p.slug, r ? r.IsVariant === 'True' : false);
}

const idOf = new Map(pals.map((p, i) => [p.slug, i]));
const childOfPair = new Map();
for (const [a, b, c] of pairs) childOfPair.set([a, b].sort().join('|'), c);

// pals that are produced only by their own self-pair => "unique combo children" (special-combo-only)
const childCount = new Map();
for (const [, , c] of pairs) childCount.set(c, (childCount.get(c) ?? 0) + 1);
const specialOnly = new Set(pals.filter((p) => childCount.get(p.slug) === 1).map((p) => p.slug));
console.log('special-only pals:', specialOnly.size);

// 1) test the core average rule ignoring unique combos
let ok = 0;
let bad = 0;
const badSamples = [];
for (const [a, b, c] of pairs) {
  if (specialOnly.has(c)) continue;
  if (!bp.has(a) || !bp.has(b)) continue;
  const childPower = Math.floor((bp.get(a) + bp.get(b) + 1) / 2);
  let best = null;
  let bestKey = null;
  for (const p of pals) {
    if (!bp.has(p.slug)) continue;
    if (specialOnly.has(p.slug)) continue;
    const d = Math.abs(bp.get(p.slug) - childPower);
    const key = [d, -priority.get(p.slug), isVariant.get(p.slug) ? 1 : 0, idOf.get(p.slug)];
    if (!bestKey || cmp(key, bestKey) < 0) {
      bestKey = key;
      best = p.slug;
    }
  }
  if (best === c) ok++;
  else {
    bad++;
    if (badSamples.length < 12) badSamples.push(`${a}+${b}=>${c} (formula:${best}) childPower=${childPower}}`);
  }
}
console.log('core rule matches', ok, 'mismatches', bad);
console.log(badSamples.join('\n'));
