/* 检查“不可达”是否真的不可达：用独立的闭包 BFS 对照新求解器 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../../src/core.js').create(JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8')));
const { PALS, P, childIdx, solve } = core;
const N = PALS.length;

function closure(ownedIdx) {
  const have = new Set(ownedIdx);
  let changed = true;
  while (changed) {
    changed = false;
    const list = [...have];
    for (let i = 0; i < list.length; i++) {
      for (let j = i; j < list.length; j++) {
        const c = childIdx(list[i], list[j]);
        if (!have.has(c)) { have.add(c); changed = true; }
      }
    }
  }
  return have;
}

const rnd = (() => { let s = 20240930; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
let mismatch = 0;
for (let t = 0; t < 15; t++) {
  const owned = new Set();
  const k = 3 + Math.floor(rnd() * 12);
  while (owned.size < k) owned.add(Math.floor(rnd() * N));
  const target = Math.floor(rnd() * N);
  const cl = closure(owned);
  const res = solve({ owned: new Set([...owned].map((i) => PALS[i].s)), rare: new Map(), required: new Set() }, PALS[target].s, 1, 'steps');
  const reachable = cl.has(target);
  if (reachable !== res.ok) {
    mismatch++;
    console.log('不一致 #' + t + ': 闭包认为 ' + (reachable ? '可达' : '不可达') + '，求解器返回 ' + (res.ok ? 'ok(' + res.cost + ')' : res.reason) + ' → ' + PALS[target].n);
  }
}
console.log('闭包 vs 求解器 不一致数: ' + mismatch);

// 单独看看那些目标
const owned = new Set();
while (owned.size < 10) owned.add(Math.floor(rnd() * N));
const cl = closure(owned);
console.log('池子大小 ' + owned.size + ' 时，闭包可达 ' + cl.size + ' / ' + N + ' 只');
