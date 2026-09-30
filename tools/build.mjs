// 生成最终成品：帕鲁配种计算器.html（自包含，双击即可离线运行）
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RAW = path.join(root, 'data', 'raw');
const readPals = () => {
  const src = fs.readFileSync(path.join(RAW, 'pals.generated.js'), 'utf8');
  const json = src
    .slice(src.indexOf('['), src.lastIndexOf(']') + 1)
    .replace(/`/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  return JSON.parse(json);
};

const pals = readPals();
const N = pals.length;
const idxOf = new Map(pals.map((p, i) => [p.slug, i]));

const pairs = JSON.parse(fs.readFileSync(path.join(RAW, 'breeding-pairs.json'), 'utf8'));
const table = new Uint16Array(N * N).fill(65535);
for (const [a, b, c] of pairs) {
  const ia = idxOf.get(a);
  const ib = idxOf.get(b);
  const ic = idxOf.get(c);
  if (ia == null || ib == null || ic == null) throw new Error('unknown pal: ' + a + '/' + b + '/' + c);
  const lo = Math.min(ia, ib);
  const hi = Math.max(ia, ib);
  table[lo * N + hi] = ic;
}
let missing = 0;
for (let a = 0; a < N; a++) for (let b = a; b < N; b++) if (table[a * N + b] === 65535) missing++;
if (missing) throw new Error('配种表不完整，缺 ' + missing + ' 组');

// base64（小端序 Uint16）
const buf = Buffer.from(table.buffer, table.byteOffset, table.byteLength);
const b64 = buf.toString('base64');

const compactPals = pals.map((p) => ({
  s: p.slug,
  n: p.name,
  num: p.number || '',
  el: p.elements || [],
}));

const data = { pals: compactPals, child: b64 };
const tpl = fs.readFileSync(path.join(root, 'src', 'app.template.html'), 'utf8');
if (!tpl.includes('/*__DATA__*/')) throw new Error('模板缺少 /*__DATA__*/ 占位符');
if (!tpl.includes('/*__CORE__*/')) throw new Error('模板缺少 /*__CORE__*/ 占位符');
const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
const out = tpl.replace('/*__DATA__*/', JSON.stringify(data)).replace('/*__CORE__*/', core);
const outPath = path.join(root, '帕鲁配种链计算器.html');
fs.writeFileSync(outPath, out);

// 同时导出归一化数据，方便以后做别的工具
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'pals.json'), JSON.stringify(compactPals, null, 1));
fs.writeFileSync(path.join(root, 'data', 'pal-data.json'), JSON.stringify(data));

console.log('帕鲁数量:', N);
console.log('配种组合:', pairs.length);
console.log('数据体积: ' + (b64.length / 1024).toFixed(0) + ' KB (base64)');
console.log('输出:', outPath, (out.length / 1024).toFixed(0) + ' KB');
