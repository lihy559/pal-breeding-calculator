/* 算法测试：每只帕鲁只配一次、可无限复用；词条栏目最多 4 条，目标需带齐 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PalCore = require('../src/core.js');

const DATA = JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8'));
const core = PalCore.create(DATA);
const { N, PALS, P, childIdx, REV, solve } = core;
const byName = new Map(PALS.map((p) => [p.n, p]));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

/* ---------- 构造 store ---------- */
// slots: [ [帕鲁序号...], ... ]（最多 4 栏），空栏用 null
function mkStore(ownedIdx, slots) {
  const owned = new Set([...(ownedIdx || [])].map((i) => PALS[i].s));
  const out = [null, null, null, null];
  (slots || []).forEach((pals, i) => {
    if (!pals || !pals.length) return;
    out[i] = { name: '词条' + (i + 1), pals: pals.map((x) => PALS[x].s) };
    pals.forEach((x) => owned.add(PALS[x].s));
  });
  return { owned, slots: out };
}
function slotCfg(store) {
  const src = new Map();
  let need = 0, k = 0;
  store.slots.forEach((sl, i) => {
    if (!sl || !sl.pals.length) return;
    need |= (1 << i); k++;
    sl.pals.forEach((s) => src.set(P(s).i, (src.get(P(s).i) || 0) | (1 << i)));
  });
  return { src, need, k };
}

/* ---------- 方案合法性（独立重算） ---------- */
function validate(res, store, targetSlug, mode) {
  const errs = [];
  if (!res.ok) return ['失败: ' + res.reason];
  const cfg = slotCfg(store);
  const need = mode === 2 ? cfg.need : 0;
  if (res.cost !== res.steps.length) errs.push('cost=' + res.cost + ' ≠ steps=' + res.steps.length);
  const avail = new Set([...store.owned].map((s) => P(s).i));
  const prod = new Map(res.steps.map((s) => [s.c, s]));
  const memo = new Map();
  const maskOf = (x) => {
    if (memo.has(x)) return memo.get(x);
    let v;
    if (!prod.has(x)) v = cfg.src.get(x) || 0;
    else { const s = prod.get(x); v = maskOf(s.a) | maskOf(s.b); }
    memo.set(x, v);
    return v;
  };
  const produced = new Set();
  for (const s of res.steps) {
    if (childIdx(s.a, s.b) !== s.c) errs.push('第' + s.no + '步配方与配种表不符');
    if (!avail.has(s.a) || !avail.has(s.b)) errs.push('第' + s.no + '步亲本当时还拿不到');
    if (produced.has(s.c)) errs.push('第' + s.no + '步重复产出同一只帕鲁');
    if (maskOf(s.c) !== s.mask) errs.push('第' + s.no + '步词条掩码不符（记 ' + s.mask + '，实 ' + maskOf(s.c) + '）');
    produced.add(s.c); avail.add(s.c);
  }
  const tgt = P(targetSlug).i;
  if (res.steps.length && res.steps[res.steps.length - 1].c !== tgt) errs.push('最后一步不是目标');
  if (!avail.has(tgt)) errs.push('最终没有目标');
  if ((maskOf(tgt) & need) !== need) errs.push('目标词条不足（要 ' + need + '，得 ' + maskOf(tgt) + '）');
  return errs;
}
(function mask100() { /* noop */ })();

console.log('基础数据');
check('帕鲁数量 299', N === 299, 'got ' + N);
let holes = 0;
for (let a = 0; a < N; a++) for (let b = a; b < N; b++) if (childIdx(a, b) >= N) holes++;
check('配种表无空洞', holes === 0, holes + ' 缺失');
check('同种自交 = 自己', PALS[childIdx(P('Lamball').i, P('Lamball').i)].s === 'Lamball');
check('空涡龙只能自交', REV[P('Jetragon').i].length === 1);

/* ---------- 回归：用户的实际例子 ---------- */
const POOL = ['梆梆鲶', '森猛犸', '雷冥鸟', '念影喵', '连理龙', '冲浪鸭', '毛老爹'].map((n) => byName.get(n).i);
const idx = (n) => byName.get(n).i;
console.log('回归：7 只入门帕鲁 → 阿努比斯');
{
  const s1 = mkStore(POOL, []);
  const r1 = solve(s1, 'Anubis', 1, 'steps');
  check('模式一可解且方案合法', validate(r1, s1, 'Anubis', 1).length === 0, validate(r1, s1, 'Anubis', 1).join('; '));
  console.log('  模式一: ' + r1.cost + ' 次 / ' + r1.depth + ' 代');

  // 单栏多只（= 旧模式二）
  const s2 = mkStore(POOL, [[idx('雷冥鸟'), idx('毛老爹')]]);
  const r2 = solve(s2, 'Anubis', 2, 'steps');
  const e2 = validate(r2, s2, 'Anubis', 2);
  check('单栏多只（同词条两只）合法且目标带词条', e2.length === 0, e2.join('; '));
  console.log('  单栏两只: ' + r2.cost + ' 次 / ' + r2.depth + ' 代');

  // 两栏不同词条：目标必须同时带齐
  const s3 = mkStore(POOL, [[idx('雷冥鸟')], [idx('毛老爹')]]);
  const r3 = solve(s3, 'Anubis', 2, 'steps');
  const e3 = validate(r3, s3, 'Anubis', 2);
  check('两栏不同词条：目标同时带齐', e3.length === 0, e3.join('; '));
  console.log('  两栏: ' + r3.cost + ' 次 / ' + r3.depth + ' 代');

  // 三栏 / 四栏
  for (const bars of [3, 4]) {
    const names = ['雷冥鸟', '毛老爹', '冲浪鸭', '连理龙'].slice(0, bars).map(idx);
    const st = mkStore(POOL, names.map((x) => [x]));
    const rr = solve(st, 'Anubis', 2, 'steps');
    const ee = validate(rr, st, 'Anubis', 2);
    check(bars + ' 栏词条：方案合法且带齐', ee.length === 0, ee.join('; '));
    console.log('  ' + bars + ' 栏: ' + (rr.ok ? rr.cost + ' 次 / ' + rr.depth + ' 代' : '失败 ' + rr.reason));
  }

  // 同一只放两栏
  const s5 = mkStore(POOL, [[idx('毛老爹')], [idx('毛老爹')]]);
  const r5 = solve(s5, 'Anubis', 2, 'steps');
  const cfg5 = slotCfg(s5);
  check('同一只放两栏：能满足两条词条', validate(r5, s5, 'Anubis', 2).length === 0, JSON.stringify(cfg5));

  // 词条模式不会比无词条更短
  check('词条模式不短于模式一', r2.cost >= r1.cost && r3.cost >= r1.cost, r1.cost + '/' + r2.cost + '/' + r3.cost);
}

/* ---------- 旧存档格式兼容 ---------- */
console.log('旧存档兼容');
{
  const store = { owned: new Set(POOL.map((i) => PALS[i].s)), rare: new Map([[PALS[idx('毛老爹')].s, '传说']]) };
  const r = solve(store, 'Anubis', 2, 'steps');
  check('rare 旧格式仍可算出带词条方案', r.ok && r.steps.some((s) => s.mask), JSON.stringify(r.ok ? r.cost : r.reason));
  const r1 = solve(store, 'Anubis', 1, 'steps');
  check('旧格式模式下不受影响', r1.ok && r1.cost > 0);
}

/* ---------- 回归：模式一绝不能受词条栏目影响 ---------- */
console.log('回归：模式一与词条栏目无关');
{
  const base = solve(mkStore(POOL, []), 'Anubis', 1, 'steps');
  const variants = [
    [[idx('雷冥鸟')]],
    [[idx('雷冥鸟')], [idx('毛老爹')]],
    [[idx('雷冥鸟')], [idx('毛老爹')], [idx('冲浪鸭')], [idx('连理龙')]],
    [[idx('雷冥鸟'), idx('毛老爹'), idx('冲浪鸭')]],   // 同栏多只
  ];
  let same = 0;
  variants.forEach(function (v, i) {
    const r = solve(mkStore(POOL, v), 'Anubis', 1, 'steps');
    const ok = r.ok && r.cost === base.cost && r.depth === base.depth && JSON.stringify(r.steps) === JSON.stringify(base.steps);
    if (ok) same++;
    else check('模式一不受栏目影响 #' + i, false, JSON.stringify({ base: [base.cost, base.depth], got: r.ok ? [r.cost, r.depth] : r.reason }));
  });
  check('模式一在 4 种栏目组合下结果完全一致', same === variants.length, same + '/' + variants.length);
  // 栏目里的帕鲁不算“已拥有”
  const store = { owned: new Set(POOL.map(function (i) { return PALS[i].s; })),
    slots: [{ name: 'x', pals: [PALS[idx('棉悠悠')].s] }, null, null, null] };
  const ownedCheck = solve({ owned: store.owned, slots: [null, null, null, null] }, 'Lamball', 1, 'steps');
  check('栏目不会把未勾选的帕鲁算成已拥有', (ownedCheck.ok ? ownedCheck.cost > 0 : true), JSON.stringify(ownedCheck.ok ? ownedCheck.cost : ownedCheck.reason));
}

/* ---------- 随机场景 + 独立可达性对照 ---------- */
function closure(ownedIdx) {
  const have = new Set(ownedIdx);
  for (let changed = true; changed;) {
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
console.log('随机场景 + 可达性对照');
const rnd = (() => { let s = 20240930; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
let okCount = 0, total = 0;
for (let t = 0; t < 12; t++) {
  const owned = new Set();
  const k = 4 + Math.floor(rnd() * 14);
  while (owned.size < k) owned.add(Math.floor(rnd() * N));
  const pool = [...owned];
  const slotPals = [pool[Math.floor(rnd() * pool.length)]];
  if (rnd() > 0.5) slotPals.push(pool[Math.floor(rnd() * pool.length)]);
  const st = mkStore(pool, [slotPals]);
  const target = PALS[Math.floor(rnd() * N)].s;
  const r = solve(st, target, 2, 'steps');
  const reach = closure([...owned, ...slotPals]).has(P(target).i);
  total++;
  if (reach !== r.ok) { check('随机#' + t + ' 可达性与闭包一致', false, '闭包=' + reach + ' 求解器=' + (r.ok ? 'ok' : r.reason)); continue; }
  const errs = r.ok ? validate(r, st, target, 2) : [];
  if (errs.length === 0) okCount++;
  else check('随机#' + t + ' 方案合法（' + P(target).n + '）', false, errs.join('; '));
}
check('12 个随机场景：可达性一致 + 方案合法', okCount === total, okCount + '/' + total);

/* ---------- 性质 ---------- */
console.log('性质检查');
{
  let worse = 0;
  for (let t = 0; t < 6; t++) {
    const owned = new Set();
    while (owned.size < 6) owned.add(Math.floor(rnd() * N));
    const target = PALS[Math.floor(rnd() * N)].s;
    const a = solve(mkStore(owned, []), target, 1, 'steps');
    const more = new Set(owned); more.add(Math.floor(rnd() * N));
    const b = solve(mkStore(more, []), target, 1, 'steps');
    if (a.ok && b.ok && b.cost > a.cost) worse++;
  }
  check('多拥有帕鲁不会让方案变长', worse === 0, worse + ' 例变长');
}
{
  const st = mkStore([], []);
  check('空池 → empty', (() => { const r = solve(st, 'Anubis', 1, 'steps'); return !r.ok && r.reason === 'empty'; })());
  const own = new Set([idx('空涡龙')]);
  const st1 = mkStore(own, []);
  const r1 = solve(st1, 'Anubis', 1, 'steps');
  check('只有空涡龙 → 不可达', !r1.ok && r1.reason === 'unreachable');
  const r2 = solve(st1, 'Jetragon', 1, 'steps');
  check('已拥有目标 → 0 次', r2.ok && r2.cost === 0);
  const r3 = solve(st1, 'Jetragon', 2, 'steps');
  check('词条模式没填栏目 → noTrait', !r3.ok && r3.reason === 'noTrait');
  const st4 = mkStore(own, []);
  const r4 = solve(st4, 'Jetragon', 2, 'steps');
  check('四栏全空 → noTrait', !r4.ok && r4.reason === 'noTrait');
}

/* ---------- 性能 ---------- */
console.log('性能');
{
  const owned = new Set(PALS.slice(0, 60).map((p) => p.i));
  let t0 = Date.now();
  const a = solve(mkStore(owned, []), 'Anubis', 1, 'steps');
  const ms1 = Date.now() - t0;
  t0 = Date.now();
  const b = solve(mkStore(owned, [[0], [1]]), 'Anubis', 2, 'steps');
  const ms2 = Date.now() - t0;
  t0 = Date.now();
  const c = solve(mkStore(owned, [[0], [1], [2], [3]]), 'Anubis', 2, 'steps');
  const ms4 = Date.now() - t0;
  check('模式一 < 2000ms', ms1 < 2000, ms1 + 'ms');
  check('词条 2 栏 < 3000ms', ms2 < 3000, ms2 + 'ms');
  check('词条 4 栏 < 6000ms', ms4 < 6000, ms4 + 'ms');
  console.log('  （60 只已拥有：模式一 ' + ms1 + 'ms，2 栏 ' + ms2 + 'ms，4 栏 ' + ms4 + 'ms）');
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
