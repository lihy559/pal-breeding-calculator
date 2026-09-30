/* 新核心冒烟测试：正确性 + 速度（不改动程序，只跑 src/core.js） */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../../src/core.js').create(JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8')));
const { PALS, P, solve, childIdx, REV } = core;
const N = PALS.length;
const byName = new Map(PALS.map((p) => [p.n, p]));
const I = (n) => byName.get(n).i;
const nm = (i) => PALS[i].n + ' #' + (PALS[i].num || '?');

function validate(res, ownedSlugs, targetSlug, mode) {
  const errs = [];
  if (!res.ok) return ['失败: ' + res.reason];
  if (res.cost !== res.steps.length) errs.push('cost=' + res.cost + ' 但 steps=' + res.steps.length);
  const done = new Set(ownedSlugs.map((s) => P(s).i));
  const produced = new Set();
  res.steps.forEach((s, i) => {
    if (s.no !== i + 1) errs.push('步骤号错乱');
    if (childIdx(s.a, s.b) !== s.c) errs.push('第' + s.no + '步配方与配种表不符');
    if (!done.has(s.a) || !done.has(s.b)) errs.push('第' + s.no + '步亲本当时还拿不到');
    if (produced.has(s.c)) errs.push('第' + s.no + '步重复产出 ' + nm(s.c));
    done.add(s.c);
    produced.add(s.c);
  });
  if (res.steps.length && res.steps[res.steps.length - 1].c !== P(targetSlug).i) errs.push('最后一步不是目标');
  if (!res.steps.length && !done.has(P(targetSlug).i)) errs.push('空方案但目标不在池中');
  if (mode === 2) {
    if (!res.carry) errs.push('模式二没有标记 carry');
    // 目标必须带词条：沿着目标的配方一路回溯，至少要碰到一只标记帕鲁
    const markedSlugs = new Set();
    return errs; // 词条链由 core 保证，这里只检查结构
  }
  return errs;
}

function run(label, ownedNames, target, mode = 1) {
  const store = { owned: new Set(ownedNames.map((n) => byName.get(n).s)), rare: new Map(), required: new Set() };
  const t0 = Date.now();
  const res = solve(store, byName.get(target).s, mode, 'steps');
  const ms = Date.now() - t0;
  const errs = validate(res, [...store.owned], byName.get(target).s, mode);
  console.log(label + ' → ' + target + ': ' + (res.ok ? res.cost + ' 次 / ' + res.depth + ' 代' : '失败 ' + res.reason)
    + '  (' + ms + 'ms)' + (errs.length ? '  ✗ ' + errs.join('; ') : '  ✓'));
  return { res, ms };
}

console.log('=== 你的例子 ===');
const A = ['梆梆鲶', '森猛犸', '雷冥鸟', '念影喵', '连理龙', '冲浪鸭', '毛老爹'];
const r1 = run('7只', A, '阿努比斯');
r1.res.steps.forEach((s) => console.log('  第' + s.no + '步: ' + nm(s.a) + ' + ' + nm(s.b) + ' = ' + nm(s.c) + (s.t ? '  【带词条】' : '')));

console.log('\n=== 其他场景 ===');
run('5只弱帕鲁', ['棉悠悠', '捣蛋猫', '皮皮鸡', '翠叶鼠', '玉藻狐'], '阿努比斯');
run('5只弱帕鲁', ['棉悠悠', '捣蛋猫', '皮皮鸡', '翠叶鼠', '玉藻狐'], '雷鸣童子');
run('随机80只', PALS.filter((_, i) => i % 4 === 0).map((p) => p.n), '异构格里芬');
run('含空涡龙', ['空涡龙'], '阿努比斯');
run('空池', [], '阿努比斯');

console.log('\n=== 模式二（词条） ===');
{
  const store = { owned: new Set(A.map((n) => byName.get(n).s)), rare: new Map([[P('Sweepa').s, '传说']]), required: new Set(['传说']) };
  const t0 = Date.now();
  const res = solve(store, byName.get('阿努比斯').s, 2, 'steps');
  console.log('带词条 → 阿努比斯: ' + (res.ok ? res.cost + ' 次 / ' + res.depth + ' 代' : '失败 ' + res.reason) + '  (' + (Date.now() - t0) + 'ms)');
  if (res.ok) {
    // 回溯验证词条链
    const prod = new Map(res.steps.map((s) => [s.c, s]));
    const markedIdx = new Set([...store.rare.keys()].map((s) => P(s).i));
    const carries = new Map();
    const calc = (x) => {
      if (carries.has(x)) return carries.get(x);
      let v;
      if (!prod.has(x)) v = markedIdx.has(x);
      else { const s = prod.get(x); v = calc(s.a) || calc(s.b); }
      carries.set(x, v);
      return v;
    };
    console.log('  目标实际是否带词条: ' + (calc(P('Anubis').i) ? '是 ✓' : '否 ✗'));
    res.steps.forEach((s) => console.log('    第' + s.no + '步: ' + nm(s.a) + ' + ' + nm(s.b) + ' = ' + nm(s.c) + (s.t ? '  【带词条】' : '')));
  }
}

console.log('\n=== 性能压力 ===');
{
  const big = PALS.slice(0, 60).map((p) => p.n);
  const store = { owned: new Set(PALS.slice(0, 60).map((p) => p.s)), rare: new Map([[PALS[3].s, '传说']]), required: new Set(['传说']) };
  const t0 = Date.now();
  const res = solve(store, P('Anubis').s, 2, 'steps');
  console.log('60只 + 词条 → 阿努比斯: ' + (res.ok ? res.cost + ' 次' : '失败 ' + res.reason) + '  (' + (Date.now() - t0) + 'ms)');
  const t1b = Date.now();
  const resA = solve(store, P('Anubis').s, 1, 'steps');
  console.log('同样 60 只 → 阿努比斯（模式一）: ' + (resA.ok ? resA.cost + ' 次' : '失败 ' + resA.reason) + '  (' + (Date.now() - t1b) + 'ms)');
  const bigOwned = PALS.map((p) => p.s);
  const t1 = Date.now();
  const r2 = solve({ owned: new Set(bigOwned), rare: new Map([[PALS[9].s, '传说']]), required: new Set(['传说']) }, P('Anubis').s, 2, 'steps');
  console.log('全部299只 + 词条 → 阿努比斯: ' + (r2.ok ? r2.cost + ' 次' : '失败 ' + r2.reason) + '  (' + (Date.now() - t1) + 'ms)');
}
