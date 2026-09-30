import fs from 'node:fs';

const pairs = JSON.parse(fs.readFileSync('data/raw/breeding-pairs.json', 'utf8'));
const palsSrc = fs.readFileSync('data/raw/pals.generated.js', 'utf8');
const pals = JSON.parse(
  palsSrc
    .slice(palsSrc.indexOf('['), palsSrc.lastIndexOf(']') + 1)
    .replace(/`/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":'),
);

const idOf = new Map(pals.map((p, i) => [p.slug, i]));
const slugOf = pals.map((p) => p.slug);
const n = pals.length;

// build unique pair -> child (self-pair duplicates: keep self result as primary)
const table = new Map();
for (const [a, b, c] of pairs) {
  const k = [idOf.get(a), idOf.get(b)].sort((x, y) => x - y).join('|');
  if (!table.has(k)) table.set(k, idOf.get(c));
}
console.log('unique pairs in table:', table.size);

const keys = [...table.keys()].map((k) => k.split('|').map(Number));
const children = [...table.values()];

// Jacobi iteration to minimize sum (r_c - (r_a+r_b)/2)^2, normalized each step.
let r = new Float64Array(n);
for (let i = 0; i < n; i++) r[i] = Math.random() - 0.5;

function normalize(v) {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  for (let i = 0; i < v.length; i++) v[i] -= mean;
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

for (let iter = 0; iter < 4000; iter++) {
  const acc = new Float64Array(n);
  const cnt = new Float64Array(n);
  for (let k = 0; k < keys.length; k++) {
    const [a, b] = keys[k];
    const mid = (r[a] + r[b]) / 2;
    acc[children[k]] += mid;
    cnt[children[k]] += 1;
  }
  const next = new Float64Array(n);
  for (let i = 0; i < n; i++) next[i] = cnt[i] ? acc[i] / cnt[i] : r[i];
  normalize(next);
  let delta = 0;
  for (let i = 0; i < n; i++) delta += Math.abs(next[i] - r[i]);
  r = next;
  if (iter % 500 === 0) console.log('iter', iter, 'delta', delta.toFixed(6));
  if (delta < 1e-12) {
    console.log('converged at', iter);
    break;
  }
}

fs.writeFileSync('tools/ls-vector.json', JSON.stringify(slugOf.map((s, i) => [s, r[i]])));

// order check: print first few in decreasing rank
const order = slugOf.map((s, i) => [s, r[i]]).sort((a, b) => b[1] - a[1]);
console.log('top 5 (should be weakest/last paldeck):', order.slice(0, 5).map((x) => x[0]));
console.log('bottom 5:', order.slice(-5).map((x) => x[0]));

// scale search: r_true = alpha * (v - min) roughly
const vmin = Math.min(...r);
const base = [...r].map((x) => x - vmin);
const baseMax = Math.max(...base);

function testScale(alpha) {
  const rank = base.map((x) => Math.round(x * alpha));
  const sorted = [...rank].sort((a, b) => a - b);
  let ok = 0;
  let bad = 0;
  for (let k = 0; k < keys.length; k++) {
    const [a, b] = keys[k];
    const mid = (rank[a] + rank[b]) / 2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < rank.length; i++) {
      const d = Math.abs(rank[i] - mid);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = i;
      }
    }
    if (best === children[k]) ok++;
    else bad++;
  }
  return { alpha, ok, bad, max: sorted[sorted.length - 1] };
}

let best = null;
for (let alpha = 0.5; alpha <= 200; alpha *= 1.02) {
  const res = testScale(alpha);
  if (!best || res.bad < best.bad) best = res;
}
console.log('best scale', JSON.stringify(best));
