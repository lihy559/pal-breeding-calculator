import fs from 'node:fs';

const pairs = JSON.parse(fs.readFileSync('data/raw/breeding-pairs.json', 'utf8'));
const palsSrc = fs.readFileSync('data/raw/pals.generated.js', 'utf8');
const palsJson = palsSrc
  .slice(palsSrc.indexOf('['), palsSrc.lastIndexOf(']') + 1)
  .replace(/`/g, '"')
  .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
const pals = JSON.parse(palsJson);

console.log('pals', pals.length);

const bySlug = new Map(pals.map((p) => [p.slug, p]));
const map = new Map();
const conflicts = [];
for (const [a, b, c] of pairs) {
  const k = [a, b].sort().join('|');
  if (map.has(k) && map.get(k) !== c) conflicts.push([k, map.get(k), c]);
  else map.set(k, c);
}
console.log('conflicts', JSON.stringify(conflicts));

// self pairs
const self = pairs.filter(([a, b]) => a === b).map(([a, , c]) => [a, c]);
const selfNotIdentity = self.filter(([a, c]) => a !== c);
console.log('self pairs', self.length, 'non-identity self', JSON.stringify(selfNotIdentity));

// pals that never appear as a child of any pair other than self
const childCount = new Map();
for (const [, , c] of pairs) childCount.set(c, (childCount.get(c) ?? 0) + 1);
const onlySelf = pals.filter((p) => childCount.get(p.slug) === 1);
console.log('only-self pals', onlySelf.length, onlySelf.map((p) => p.name).join(','));

// how many distinct children per pal-pair set => complete?
console.log('expected unordered pairs', (pals.length * (pals.length + 1)) / 2, 'actual', map.size);

// check hypothesis: rank = pals.length - index  (i.e. file order = strength order?)
function testRank(ranks) {
  let ok = 0;
  let bad = 0;
  for (const [a, b, c] of pairs) {
    const ra = ranks.get(a);
    const rb = ranks.get(b);
    const mid = (ra + rb) / 2;
    let best = null;
    let bestD = Infinity;
    for (const p of pals) {
      const d = Math.abs(ranks.get(p.slug) - mid);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = p.slug;
      }
    }
    if (best === c) ok++;
    else bad++;
  }
  return { ok, bad };
}

const rankByIdx = new Map(pals.map((p, i) => [p.slug, pals.length - i]));
console.log('hypothesis rank=len-index:', JSON.stringify(testRank(rankByIdx)));
