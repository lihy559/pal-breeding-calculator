/* 只读分析：复现截图里的方案，看看重复步骤是怎么来的（不修改程序） */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../../src/core.js').create(JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8')));
const { PALS, P, solve, childIdx } = core;

const byName = new Map(PALS.map((p) => [p.n, p]));
const slugOf = (name) => {
  const p = byName.get(name);
  if (!p) throw new Error('找不到帕鲁: ' + name);
  return p.s;
};

// 截图里从未被别步产出、只作为亲本出现的帕鲁 = 你已拥有的那几只
const ownedNames = ['梆梆鲶', '森猛犸', '雷冥鸟', '念影喵', '连理龙', '冲浪鸭', '毛老爹'];
const owned = new Set(ownedNames.map(slugOf));
console.log('已拥有:', [...owned].join(', '));

const r = solve({ owned, rare: new Map(), required: new Set() }, slugOf('阿努比斯'), 1, 'steps');
console.log('当前算法结果: ' + r.cost + ' 次配种 / ' + r.depth + ' 代');
console.log('步骤:');
const name = (i) => PALS[i].n + ' #' + (PALS[i].num || '?');
const seen = new Map();
r.steps.forEach((s) => {
  const key = [s.a, s.b, s.c].join('|');
  seen.set(key, (seen.get(key) || 0) + 1);
  console.log('  第' + s.no + '步: ' + name(s.a) + ' + ' + name(s.b) + ' = ' + name(s.c) + (seen.get(key) > 1 ? '   ← 与前面某步完全相同' : ''));
});

const dupKeys = [...seen.entries()].filter(([, n]) => n > 1);
const dupCount = dupKeys.reduce((a, [, n]) => a + n - 1, 0);
console.log('\n完全相同的配方出现次数: ' + dupKeys.length + ' 组，多出来的步骤 ' + dupCount + ' 步');
dupKeys.forEach(([k, n]) => {
  const [a, b, c] = k.split('|').map(Number);
  console.log('  ' + name(a) + ' + ' + name(b) + ' = ' + name(c) + '  ×' + n);
});

// 每一种帕鲁在方案里被当成亲本用了几次
const useAsParent = new Map();
r.steps.forEach((s) => {
  [s.a, s.b].forEach((p) => useAsParent.set(p, (useAsParent.get(p) || 0) + 1));
});
const ownedIdx = new Set([...owned].map((s) => P(s).i));
console.log('\n被当作亲本用 2 次以上、且不是已拥有的（= 需要配两只的）:');
[...useAsParent.entries()].filter(([p, n]) => n > 1 && !ownedIdx.has(p))
  .forEach(([p, n]) => console.log('  ' + name(p) + ' 用了 ' + n + ' 次'));

// 合并完全相同步骤后剩多少步
console.log('\n如果把「同一只帕鲁重复产出的步骤」合并（游戏里亲本不会被消耗），方案可降到 ' + (r.steps.length - dupCount) + ' 步');
