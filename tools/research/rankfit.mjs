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
const n = pals.length;

const table = new Map();
for (const [a, b, c] of pairs) {
  const k = [idOf.get(a), idOf.get(b)].sort((x, y) => x - y).join('|');
  if (!table.has(k)) table.set(k, idOf.get(c));
}
const keys = [...table.keys()].map((k) => k.split('|').map(Number));
const child = [...table.values()];

// N = A^T A where each row of A is e_c - 0.5 e_a - 0.5 e_b
const N = Array.from({ length: n }, () => new Float64Array(n));
for (let k = 0; k < keys.length; k++) {
  const [a, b] = keys[k];
  const c = child[k];
  const idx = [a, b, c];
  const w = [a === c ? 0 : -0.5, b === c ? 0 : -0.5, 1];
  // generic: build coefficient vector
  const coef = new Float64Array(n);
  coef[c] += 1;
  coef[a] -= 0.5;
  coef[b] -= 0.5;
  const nz = [];
  for (const i of idx) if (coef[i] !== 0) nz.push(i);
  for (const i of nz) for (const j of nz) N[i][j] += coef[i] * coef[j];
}

function matvec(v) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = N[i];
    for (let j = 0; j < n; j++) s += row[j] * v[j];
    out[i] = s;
  }
  return out;
}

function project(v) {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= n;
  for (let i = 0; i < n; i++) v[i] -= mean;
  return v;
}
function norm(v) {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}
function scale(v, f) {
  for (let i = 0; i < n; i++) v[i] *= f;
  return v;
}

// estimate largest eigenvalue of N (power iteration)
let y = new Float64Array(n);
for (let i = 0; i < n; i++) y[i] = Math.sin(i * 12.9898) * 43758.5453 % 1;
project(y);
let lambda = 0;
for (let i = 0; i < 200; i++) {
  y = matvec(y);
  project(y);
  const nn = norm(y);
  y = scale(y, 1 / nn);
  lambda = nn;
}
console.log('estimated max eigenvalue', lambda);

// filter: repeatedly apply (I - eta N), projecting out the constant direction
const eta = 1 / lambda;
let v = new Float64Array(n);
for (let i = 0; i < n; i++) v[i] = Math.sin(i * 78.233) * 12345.6789 % 1;
project(v);
v = scale(v, 1 / norm(v));
for (let iter = 0; iter < 6000; iter++) {
  const Nv = matvec(v);
  for (let i = 0; i < n; i++) v[i] -= eta * Nv[i];
  project(v);
  const nn = norm(v);
  v = scale(v, 1 / nn);
}

// residual measure
const Nv = matvec(v);
console.log('rayleigh quotient', (() => { let s = 0; for (let i = 0; i < n; i++) s += v[i] * Nv[i]; return s; })() / (() => { let s = 0; for (let i = 0; i < n; i++) s += v[i] * v[i]; return s; })());

fs.writeFileSync('tools/direction.json', JSON.stringify(pals.map((p, i) => [p.slug, v[i]])));

const order = pals.map((p, i) => [p.slug, v[i]]).sort((a, b) => b[1] - a[1]);
console.log('top 8:', order.slice(0, 8).map((x) => x[0]).join(','));
console.log('bottom 8:', order.slice(-8).map((x) => x[0]).join(','));
for (const s of ['Lamball', 'Cattiva', 'Chikipi', 'Jetragon', 'Frostallion', 'Paladius', 'Necromus', 'Bellanoir']) {
  console.log(s, 'pos', order.findIndex((x) => x[0] === s));
}

// scale search with rounding, tie -> smaller rank wins
function evalScale(alpha, tieMode = 'low') {
  const vmin = Math.min(...v);
  const rank = [...v].map((x) => Math.round((x - vmin) * alpha));
  const maxR = Math.max(...rank);
  let ok = 0;
  const badList = [];
  for (let k = 0; k < keys.length; k++) {
    const [a, b] = keys[k];
    const mid = (rank[a] + rank[b]) / 2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(rank[i] - mid);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = i;
      } else if (Math.abs(d - bestD) < 1e-9) {
        if (tieMode === 'low' ? rank[i] < rank[best] : rank[i] > rank[best]) best = i;
      }
    }
    if (best === child[k]) ok++;
    else if (badList.length < 10) badList.push([pals[a].slug, pals[b].slug, pals[child[k]].slug, pals[best].slug]);
  }
  return { alpha: +alpha.toFixed(3), ok, bad: keys.length - ok, maxR, badList };
}

let best = null;
for (let alpha = 1; alpha <= 400; alpha *= 1.01) {
  const res = evalScale(alpha);
  if (!best || res.bad < best.bad) best = res;
}
console.log('best scale (tie low):', JSON.stringify({ ...best, badList: best.badList.slice(0, 5) }));

let best2 = null;
for (let alpha = 1; alpha <= 400; alpha *= 1.01) {
  const res = evalScale(alpha, 'high');
  if (!best2 || res.bad < best2.bad) best2 = res;
}
console.log('best scale (tie high):', JSON.stringify({ ...best2, badList: best2.badList.slice(0, 5) }));
