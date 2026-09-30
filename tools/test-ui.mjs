/* 用最小 DOM 模拟跑一遍成品 HTML 里的全部脚本：勾选/存档恢复/两种模式/词条栏目 */
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('帕鲁配种链计算器.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

function makeEl(id) {
  const e = {
    id: id, value: '', textContent: '', innerHTML: '', checked: false, files: [],
    dataset: {}, style: {}, children: [], classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    appendChild(c) { e.children.push(c); },
    querySelector() { return makeEl('q'); },
    querySelectorAll(sel) {
      if (sel === '.pcard') {
        if (!e._cards) e._cards = new Map();
        return [...e.innerHTML.matchAll(/class="pcard[^"]*" data-s="([^"]+)"/g)].map((m) => {
          if (!e._cards.has(m[1])) { const c = makeEl('card:' + m[1]); c.dataset.s = m[1]; e._cards.set(m[1], c); }
          return e._cards.get(m[1]);
        });
      }
      return [];
    },
    click() { if (e.onclick) e.onclick({ target: e, stopPropagation() {} }); },
    focus() {}, addEventListener() {},
  };
  return e;
}

function boot(storage) {
  const byId = new Map();
  const getEl = (id) => { if (!byId.has(id)) byId.set(id, makeEl(id)); return byId.get(id); };
  const modes = [makeEl('m1'), makeEl('m2')];
  modes[0].value = '1'; modes[1].value = '2';
  const tabs = ['plan', 'owned', 'calc', 'about'].map((t) => { const b = makeEl('tab-' + t); b.dataset.tab = t; return b; });
  const document = {
    getElementById: getEl,
    createElement: (t) => makeEl(t),
    querySelectorAll: (sel) => (sel.includes('name=mode') ? modes : sel.includes('.tabs button') ? tabs : []),
    querySelector: (sel) => (sel.includes('name=mode') ? modes[0] : sel.includes('data-tab=calc') ? tabs[2] : sel.includes('data-tab=owned') ? tabs[1] : makeEl('sel')),
    addEventListener() {},
  };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const sandbox = {
    console, setTimeout, performance, atob: globalThis.atob, document, localStorage,
    Blob: class { constructor(p) { this.parts = p; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: class {}, alert() {}, addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  scripts.forEach((code, i) => {
    try { vm.runInContext(code, ctx, { filename: 'inline-' + i + '.js' }); }
    catch (e) { fail++; console.log('  脚本#' + i + ' 运行报错: ' + e.message); }
  });
  return { api: sandbox.__palbreeder, getEl, storage, sandbox };
}

const storage = new Map();
const card = (app, slug) => app.getEl('palGrid').querySelectorAll('.pcard').find((c) => c.dataset.s === slug);
const POOL = ['Dumud_Gild', 'Mammorest', 'Helzephyr', 'Wispaw', 'Broncherry', 'Fuack', 'Sweepa'];

/* ================= 首次打开 ================= */
console.log('· 首次打开（无存档）');
let app = boot(storage);
let api = app.api;
check('脚本执行后暴露 __palbreeder', !!api);
if (!api) { console.log('通过 ' + pass + ' 失败 ' + fail); process.exit(1); }
check('初始没有已拥有帕鲁', api.store.owned.size === 0);
check('初始 4 个空词条栏目', Array.isArray(api.store.slots) && api.store.slots.length === 4 && api.store.slots.every((s) => !s));
check('卡片渲染出 299 张', app.getEl('palGrid').querySelectorAll('.pcard').length === 299);
check('卡片带图标路径', app.getEl('palGrid').innerHTML.includes('icons/Lamball.webp'));
check('词条栏目渲染出 4 行', (app.getEl('slotRows').innerHTML.match(/词条\d/g) || []).length === 4, app.getEl('slotRows').innerHTML.slice(0, 80));

/* ================= 勾选 + 存档 ================= */
console.log('· 勾选 7 只 + 建两个词条栏目');
POOL.forEach((s) => card(app, s).click());
check('点卡片后进入已拥有', api.store.owned.size === 7, String(api.store.owned.size));
check('勾选后立刻写入 localStorage', storage.has('palbreeder.v1'));
api.store.slots[0] = { name: '传说', pals: ['Helzephyr'] };
api.store.slots[1] = { name: '神圣', pals: ['Sweepa'] };
api.store.target = 'Anubis';
api.store.mode = 2;
api.save();

/* ================= 关闭再打开 ================= */
console.log('· 关闭后重新打开');
app = boot(storage);
api = app.api;
check('恢复了已拥有 7 只', api.store.owned.size === 7, String(api.store.owned.size));
check('恢复了词条栏目 1', !!api.store.slots[0] && api.store.slots[0].name === '传说' && api.store.slots[0].pals[0] === 'Helzephyr', JSON.stringify(api.store.slots[0]));
check('恢复了词条栏目 2', !!api.store.slots[1] && api.store.slots[1].name === '神圣', JSON.stringify(api.store.slots[1]));
check('恢复了目标与模式', api.store.target === 'Anubis' && api.store.mode === 2);
check('显示恢复提示', app.getEl('restoreNote').innerHTML.includes('已自动恢复上次的存档'), app.getEl('restoreNote').innerHTML.slice(0, 60));
check('板块显示带词条的卡片', app.getEl('palGrid').innerHTML.includes('class="trait">传说'));
check('栏目面板显示两只帕鲁', app.getEl('slotRows').innerHTML.includes('雷冥鸟') && app.getEl('slotRows').innerHTML.includes('毛老爹'));

/* ================= 计算 ================= */
console.log('· 模式一 / 模式二计算');
getEl(app, 'runBtn').onclick();
let out = app.getEl('planOut').innerHTML;
check('模式二输出含两条词条名', out.includes('传说') && out.includes('神圣'), out.slice(0, 200));
check('模式二输出含配种步骤', out.includes('配种步骤'));
check('模式二标出带词条步骤', out.includes('step rare'));
check('模式二提示同时带齐', out.includes('同时汇到目标身上'));

api.store.mode = 1;
getEl(app, 'runBtn').onclick();
out = app.getEl('planOut').innerHTML;
check('模式一有结果且不带词条', out.includes('所需配种次数') && !out.includes('class="tag"'), out.slice(0, 160));

api.store.mode = 2;
api.store.slots = [null, null, null, null];
getEl(app, 'runBtn').onclick();
check('没填词条栏目时提示', app.getEl('planOut').innerHTML.includes('先填一个词条栏目'), app.getEl('planOut').innerHTML.slice(0, 120));

/* ================= 单栏多只 ================= */
api.store.slots = [{ name: '传说', pals: ['Helzephyr', 'Sweepa'] }, null, null, null];
getEl(app, 'runBtn').onclick();
out = app.getEl('planOut').innerHTML;
check('单栏多只也能算（等于原模式二）', out.includes('配种步骤') && out.includes('传说'));

/* ================= 边界 ================= */
api.store.target = '';
getEl(app, 'runBtn').onclick();
check('未选目标时提示', app.getEl('planOut').innerHTML.includes('请先选择目标帕鲁'));
api.store.target = 'Sweepa';
api.store.slots = [null, null, null, null];
api.store.mode = 1;
getEl(app, 'runBtn').onclick();
check('目标已拥有 → 0 次', app.getEl('planOut').innerHTML.includes('不需要配种'), app.getEl('planOut').innerHTML.slice(0, 120));

/* ================= 取消勾选 + 查询 ================= */
card(app, 'Fuack').click();
check('取消勾选后立刻移除', !api.store.owned.has('Fuack') && api.store.owned.size === 6, String(api.store.owned.size));
app = boot(storage);
api = app.api;
check('再打开时取消状态被记住', !api.store.owned.has('Fuack') && api.store.owned.size === 6, String(api.store.owned.size));
check('父母→子代 数据正确', api.PALS[api.childIdx(api.P('Lamball').i, api.P('Cattiva').i)].s === 'Daedream');
app.getEl('selAll').onclick();
check('全选后 299 只', api.store.owned.size === 299, String(api.store.owned.size));
check('全选后存档同步', JSON.parse(storage.get('palbreeder.v1')).owned.length === 299);

function getEl(app, id) { return app.getEl(id); }
console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
