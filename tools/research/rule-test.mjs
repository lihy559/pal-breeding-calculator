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
const idxOf = new Map(pals.map((p, i) => [p.slug, i]));

const childCount = new Map();
for (const [, , c] of pairs) childCount.set(c, (childCount.get(c) ?? 0) + 1);
const specialOnly = new Set(pals.filter((p) => childCount.get(p.slug) === 1).map((p) => p.slug));

const cand = pals.map((p) => p.slug).filter((s) => bp.has(s) && !specialOnly.has(s));

function run(label, rule) {
  let ok = 0;
  let bad = 0;
  const samples = [];
  for (const [a, b, c] of pairs) {
    if (specialOnly.has(c) || !bp.has(a) || !bp.has(b)) continue;
    const best = rule(a, b);
    if (best === c) ok++;
    else {
      bad++;
      if (samples.length < 6) samples.push(`${a}+${b}=>${c} (got ${best})`);
    }
  }
  console.log(`${label}: ok=${ok} bad=${bad}`);
  if (bad) console.log('   e.g. ' + samples.join(' | '));
  return bad;
}

const closest = (childPower, pool) => {
  let best = null;
  let bd = Infinity;
  for (const s of pool) {
    const d = Math.abs(bp.get(s) - childPower);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return { best, bd };
};

const cp = (a, b) => Math.floor((bp.get(a) + bp.get(b) + 1) / 2);

run('H1 closest, all candidates, first-index tie', (a, b) => {
  let best = null;
  let bd = Infinity;
  for (const s of cand) {
    const d = Math.abs(bp.get(s) - cp(a, b));
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
});

run('H2 closest non-variant', (a, b) => {
  let best = null;
  let bd = Infinity;
  for (const s of cand) {
    if (variant.get(s)) continue;
    const d = Math.abs(bp.get(s) - cp(a, b));
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
});

run('H3 closest, prefer lower BP on tie (then all)', (a, b) => {
  let best = null;
  let bd = Infinity;
  let bbp = -Infinity;
  for (const s of cand) {
    const d = Math.abs(bp.get(s) - cp(a, b));
    if (d < bd || (d === bd && bp.get(s) < bbp)) {
      bd = d;
      bbp = bp.get(s);
      best = s;
    }
  }
  return best;
});

run('H4 closest, prefer higher BP on tie', (a, b) => {
  let best = null;
  let bd = Infinity;
  let bbp = -Infinity;
  for (const s of cand) {
    const d = Math.abs(bp.get(s) - cp(a, b));
    if (d < bd || (d === bd && bp.get(s) > bbp)) {
      bd = d;
      bbp = bp.get(s);
      best = s;
    }
  }
  return best;
});
