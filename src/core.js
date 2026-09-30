/* =========================================================================
   PalCore —— 帕鲁配种计算核心

   模型（与游戏实际一致）：
     · 亲本不会被配种消耗，同一只帕鲁可以反复当亲本。
     · 所以「配种次数」= 需要新配出来的帕鲁只数；方案里不会再出现重复配方。
     · 已拥有的帕鲁视为数量无限。
     · 词条：任意一只亲本带词条，子代就有机会继承（OR，不是要求双亲都带）。
       「词条栏目」= 最多 4 条不同词条，每栏可以放多只帕鲁；同一只帕鲁放进多栏
       就算它同时提供这几条。只填 1 栏 = 单条词条、多只帕鲁一起算。
       词条模式下，目标需要**同时带齐**所有被填写的词条。
     · 自交（A + A = A）在「无限复用」模型下没有意义，已排除。

   解法：维护「物种 -> 若干条候选方案（Pareto 保留）」，每条方案 = 一组生产记录
         加上它能为该物种带来的词条掩码。两个亲本的方案取并集（同一种产物只留
         一条记录）—— 这就是共享，于是中间产物只配一次，之后可以喂给多条支路。
   ========================================================================= */
var PalCore = (function () {
  'use strict';

  function b64ToU16(b64) {
    let s;
    if (typeof atob === 'function') s = atob(b64);
    else s = Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint16Array(s.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = s.charCodeAt(2 * i) | (s.charCodeAt(2 * i + 1) << 8);
    return out;
  }

  function create(DATA) {
    const N = DATA.pals.length;
    const PALS = DATA.pals.map(function (p, i) { return Object.assign({}, p, { i: i }); });
    const BY_SLUG = new Map(PALS.map(function (p) { return [p.s, p]; }));
    const P = function (slug) { return BY_SLUG.get(slug); };
    const CHILD = b64ToU16(DATA.child);
    const childIdx = function (a, b) { return a > b ? CHILD[b * N + a] : CHILD[a * N + b]; };
    const REV = [];
    for (let i = 0; i < N; i++) REV.push([]);
    for (let a = 0; a < N; a++) for (let b = a; b < N; b++) REV[CHILD[a * N + b]].push([a, b]);
    // A + A = A 这类自交配方在「无限复用」模型下没有任何意义，直接排除
    const RECIPES = REV.map(function (list, c) {
      return list.filter(function (pr) { return !(pr[0] === pr[1] && pr[0] === c); });
    });

    const MAX_SLOTS = 4;      // 一只帕鲁最多继承 4 个词条位
    const KEEP_PLAIN = 3;     // 不要词条时每个物种保留的方案条数
    const KEEP_MASK = 6;      // 要词条时多留几条，保证不同词条组合都有候选

    function bitsOf(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
    const covers = function (mask, need) { return (mask & need) === need; };

    /* ---------------------------------------------------------------------
       solve(store, targetSlug, mode, obj)
         store: { owned:Set<slug>,
                  slots:[ {name, pals:[slug]} , null, null, null ],   // 词条栏目
                  rare:Map<slug,name> }                               // 旧存档兼容
         mode : 1 = 最短路径（忽略词条）；2 = 目标必须带齐所有填写栏目的词条
         obj  : 'steps' 先比配种次数 | 'depth' 先比世代数
       返回 : { ok, cost, depth, steps:[{no,a,b,c,mask}], alts:[{a,b,cost}], slots }
       --------------------------------------------------------------------- */
    function solve(store, targetSlug, mode, obj) {
      const tgt = P(targetSlug);
      if (!tgt) return { ok: false, reason: 'noTarget' };
      obj = obj === 'depth' ? 'depth' : 'steps';
      const wantMask = mode === 2;

      const owned = new Set();
      if (store.owned) store.owned.forEach(function (s) { const p = P(s); if (p) owned.add(p.i); });

      /* ---------- 词条栏目 ---------- */
      const slots = [];
      function pushSlot(name, pals) {
        if (slots.length >= MAX_SLOTS || !pals.length) return;
        slots.push({ name: name || ('词条' + (slots.length + 1)), pals: pals });
      }
      if (store.slots && store.slots.length) {
        for (let i = 0; i < store.slots.length; i++) {
          const sl = store.slots[i];
          if (!sl) continue;
          const pals = [];
          (sl.pals || []).forEach(function (s) { const p = P(s); if (p) { pals.push(p.i); owned.add(p.i); } });
          pushSlot(sl.name, pals);
        }
      } else if (store.rare && typeof store.rare.forEach === 'function') {
        // 旧存档：把所有标记过的帕鲁按词条名归到栏目里
        const groups = new Map();
        store.rare.forEach(function (name, s) {
          const p = P(s); if (!p) return;
          owned.add(p.i);
          const key = name || '词条';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(p.i);
        });
        groups.forEach(function (pals, name) { pushSlot(name, pals); });
      }
      if (!owned.size) return { ok: false, reason: 'empty' };
      if (wantMask && !slots.length) return { ok: false, reason: 'noTrait' };

      const K = slots.length;
      const requiredMask = K ? (1 << K) - 1 : 0;
      const sourceMask = new Map();
      slots.forEach(function (sl, i) {
        sl.pals.forEach(function (idx) { sourceMask.set(idx, (sourceMask.get(idx) || 0) | (1 << i)); });
      });
      const baseMask = function (idx) { return sourceMask.get(idx) || 0; };
      const KEEP = wantMask ? KEEP_MASK : KEEP_PLAIN;

      /* ---------- 方案集合 ---------- */
      const plans = new Array(N);
      for (let i = 0; i < N; i++) plans[i] = [];
      const EMPTY_MAP = new Map();

      const primary = function (p) { return obj === 'depth' ? p.depth : p.cost; };
      const secondary = function (p) { return obj === 'depth' ? p.cost : p.depth; };
      function better(x, y) {                       // 排序：主目标 -> 词条多 -> 次目标
        return (primary(x) - primary(y)) || (bitsOf(y.mask) - bitsOf(x.mask)) || (secondary(x) - secondary(y));
      }
      function dominates(x, y) {                    // x 完全不比 y 差
        return covers(x.mask, y.mask) && primary(x) <= primary(y) && secondary(x) <= secondary(y);
      }
      function sigOf(m) {
        const arr = [];
        m.forEach(function (v, k) { arr.push(k + ':' + v.a + ':' + v.b + ':' + v.mask); });
        arr.sort();
        return arr.join(',');
      }
      function addPlan(slot, plan) {
        const list = plans[slot];
        for (let i = 0; i < list.length; i++) {
          if (list[i].sig === plan.sig) {
            if (dominates(list[i], plan)) return false;
            list.splice(i, 1);
            break;
          }
          if (dominates(list[i], plan)) return false;
        }
        list.push(plan);
        list.sort(better);
        if (list.length > KEEP) {
          // 超限时先丢掉最差的，但保证「词条最全」的那条不被挤掉
          const maxPop = Math.max.apply(null, list.map(function (p) { return bitsOf(p.mask); }));
          while (list.length > KEEP) {
            let cut = -1;
            for (let i = list.length - 1; i >= 0; i--) {
              if (bitsOf(list[i].mask) < maxPop) { cut = i; break; }
            }
            if (cut < 0) cut = list.length - 1;
            list.splice(cut, 1);
          }
        }
        return list.indexOf(plan) >= 0;
      }
      function worthTrying(slot, cand) {
        const list = plans[slot];
        for (let i = 0; i < list.length; i++) if (dominates(list[i], cand)) return false;
        if (list.length < KEEP) return true;
        if (better(cand, list[list.length - 1]) < 0) return true;
        const maxPop = Math.max.apply(null, list.map(function (p) { return bitsOf(p.mask); }));
        return bitsOf(cand.mask) > maxPop;
      }
      function maskIn(m, x) { const e = m.get(x); return e ? e.mask : baseMask(x); }
      function depthIn(m, x) { const e = m.get(x); return e ? e.d : 0; }

      const inQueue = new Uint8Array(N);
      const queue = [];
      function enq(i) { if (!inQueue[i]) { inQueue[i] = 1; queue.push(i); } }
      owned.forEach(function (i) {
        addPlan(i, { m: EMPTY_MAP, cost: 0, depth: 0, mask: baseMask(i), sig: '' });
        enq(i);
      });

      /* ---------- 松弛迭代 ---------- */
      let guard = 0;
      while (queue.length && guard++ < 500000) {
        const a = queue.shift();
        inQueue[a] = 0;
        const la = plans[a];
        if (!la.length) continue;
        for (let b = 0; b < N; b++) {
          const lb = plans[b];
          if (!lb.length) continue;
          const c = childIdx(a, b);
          // 已经有这只、并且它的词条已经够用 → 不必再配
          if (owned.has(c) && covers(baseMask(c), requiredMask)) continue;
          for (let x = 0; x < la.length; x++) {
            const pa = la[x];
            for (let y = 0; y < lb.length; y++) {
              const pb = lb[y];
              const m = new Map(pa.m);
              pb.m.forEach(function (v, k) {
                const cur = m.get(k);
                if (!cur) { m.set(k, v); return; }
                if (cur.mask === v.mask) return;
                // 只保留词条是超集的那条，保证已有记录里的词条掩码始终成立
                if (covers(v.mask, cur.mask)) m.set(k, v);
              });
              let cmask, d;
              if (m.has(c)) {
                const e = m.get(c);
                cmask = e.mask;
                d = e.d;
              } else {
                cmask = maskIn(m, a) | maskIn(m, b);
                d = 1 + Math.max(depthIn(m, a), depthIn(m, b));
                if (!worthTrying(c, { m: m, cost: m.size + 1, depth: d, mask: cmask, sig: '' })) continue;
                m.set(c, { a: a, b: b, mask: cmask, d: d });
              }
              const plan = {
                m: m, cost: m.size, depth: Math.max(pa.depth, pb.depth, d),
                mask: cmask, sig: sigOf(m),
              };
              if (addPlan(c, plan)) enq(c);
            }
          }
        }
      }

      /* ---------- 取结果 ---------- */
      // 一条方案里「每只帕鲁到底能带哪些词条」沿生产记录重新算一遍：
      // 搜索过程中记录的是保守下界，这里算出真实值，保证判定和显示都准。
      function deliveredMasks(m) {
        const out = new Map();
        function calc(x) {
          if (out.has(x)) return out.get(x);
          const e = m.get(x);
          if (!e) { out.set(x, baseMask(x)); return out.get(x); }
          out.set(x, 0);                                   // 防环（正常方案不会出现）
          const v = calc(e.a) | calc(e.b);
          out.set(x, v);
          return v;
        }
        m.forEach(function (v, k) { calc(k); });
        return out;
      }
      const goal = [];
      plans[tgt.i].forEach(function (p) {
        const masks = deliveredMasks(p.m);
        const real = masks.has(tgt.i) ? masks.get(tgt.i) : baseMask(tgt.i);
        if (covers(real, requiredMask)) goal.push({ p: p, mask: real });
      });
      if (!goal.length) return { ok: false, reason: 'unreachable' };
      goal.sort(function (x, y) { return better(x.p, y.p); });
      const best = goal[0].p;
      const bestMasks = deliveredMasks(best.m);

      const prods = [];
      best.m.forEach(function (v, c) { prods.push({ c: c, a: v.a, b: v.b, mask: bestMasks.get(c) || 0 }); });
      const avail = new Set(owned);
      const steps = [];
      const left = prods.slice();
      while (left.length) {
        let idx = -1;
        for (let i = 0; i < left.length; i++) if (avail.has(left[i].a) && avail.has(left[i].b)) { idx = i; break; }
        if (idx < 0) break;                                // 理论上不会发生
        const p = left.splice(idx, 1)[0];
        avail.add(p.c);
        steps.push({ no: steps.length + 1, a: p.a, b: p.b, c: p.c, mask: p.mask });
      }

      // 最后一步的其它配方（用现有方案估成本）
      const alts = [];
      RECIPES[tgt.i].forEach(function (pr) {
        const a = pr[0], b = pr[1];
        const la = owned.has(a) ? [{ m: EMPTY_MAP, cost: 0, depth: 0, mask: baseMask(a), sig: '' }] : plans[a];
        const lb = owned.has(b) ? [{ m: EMPTY_MAP, cost: 0, depth: 0, mask: baseMask(b), sig: '' }] : plans[b];
        let bestCost = Infinity;
        for (let x = 0; x < la.length; x++) {
          for (let y = 0; y < lb.length; y++) {
            const m = new Map(la[x].m);
            lb[y].m.forEach(function (v, k) { const cur = m.get(k); if (!cur) m.set(k, v); else if (covers(v.mask, cur.mask)) m.set(k, v); });
            const masks = deliveredMasks(m);
            let cmask = (masks.get(a) || baseMask(a)) | (masks.get(b) || baseMask(b));
            let cost = m.size + 1;
            if (m.has(tgt.i)) { cost = m.size; cmask = masks.get(tgt.i) || 0; }
            if (!covers(cmask, requiredMask)) continue;
            if (cost < bestCost) bestCost = cost;
          }
        }
        if (bestCost < Infinity) alts.push({ a: a, b: b, cost: bestCost });
      });
      alts.sort(function (x, y) { return x.cost - y.cost; });

      return {
        ok: true, cost: best.cost, depth: best.depth, steps: steps, alts: alts.slice(0, 6),
        slotNames: slots.map(function (s) { return s.name; }),
      };
    }

    return {
      N: N, PALS: PALS, BY_SLUG: BY_SLUG, P: P, childIdx: childIdx, REV: REV, RECIPES: RECIPES,
      MAX_SLOTS: MAX_SLOTS, solve: solve,
    };
  }

  return { create: create, b64ToU16: b64ToU16 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PalCore;
