import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js').create(JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8')));
const { PALS, P, solve, childIdx, REV } = core;
const slug = (i) => PALS[i].s;

function run(label, ownedSlugs, target) {
  const owned = new Set(ownedSlugs);
  const r = solve({ owned, rare: new Map(), required: new Set() }, target, 1, 'steps');
  const rd = solve({ owned, rare: new Map(), required: new Set() }, target, 1, 'depth');
  console.log(label + ' → ' + target + ': ' +
    (r.ok ? r.cost + ' 次配种 / ' + r.depth + ' 代' : '不可达(' + r.reason + ')') +
    '   [最少世代模式: ' + (rd.ok ? rd.cost + ' 次 / ' + rd.depth + ' 代' : '-') + ']');
  return r;
}

// 经典：两只指定帕鲁一步出目标
console.log('Anubis 的配方数量:', REV[P('Anubis').i].length);
const one = REV[P('Anubis').i][0];
console.log('  例: ' + slug(one[0]) + ' + ' + slug(one[1]) + ' = Anubis');
run('任意一对', [slug(one[0]), slug(one[1])], 'Anubis');

// 现实的配种池：随机 80 只
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pool80 = [];
for (let i = 0; i < 80; i++) pool80.push(PALS[Math.floor(rnd() * PALS.length)].s);
console.log('\n随机 80 只配种池，抽查目标：');
for (const t of ['Anubis', 'Jetragon', 'Frostallion', 'Orserk', 'Lyleen', 'Grizzbolt', 'Astralym', 'Bellanoir', 'Selyne']) {
  run('  pool80', pool80, t);
}

// 只有开局弱帕鲁
console.log('\n只有 6 只初始弱帕鲁：');
for (const t of ['Anubis', 'Verdash', 'Katress', 'Dazzi', 'Faleris']) {
  run('  starter', ['Lamball', 'Cattiva', 'Chikipi', 'Lifmunk', 'Vixy', 'Mau'], t);
}

// 只有一只 Jetragon 能不能造出别的
console.log('\n只有 Jetragon 一只：');
for (const t of ['Frostallion', 'Anubis', 'Lamball']) run('  jet', ['Jetragon'], t);
