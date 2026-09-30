// 静态检查：把成品 HTML 里的内联脚本抽出来做语法检查
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('帕鲁配种链计算器.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log('内联脚本数量:', scripts.length);
let bad = 0;
scripts.forEach((code, i) => {
  try {
    new vm.Script(code, { filename: 'inline-' + i + '.js' });
    console.log('  脚本 #' + i + ' 语法 OK (' + code.length + ' 字符)');
  } catch (e) {
    bad++;
    console.log('  脚本 #' + i + ' 语法错误: ' + e.message);
  }
});

// 检查占位符是否都已替换
['/*__DATA__*/', '/*__CORE__*/'].forEach((ph) => {
  if (html.includes(ph)) { console.log('占位符未替换:', ph); bad++; }
});

// 检查图标是否齐全
const data = JSON.parse(fs.readFileSync('data/pal-data.json', 'utf8'));
let miss = 0;
for (const p of data.pals) {
  if (!fs.existsSync('icons/' + p.s + '.webp')) { miss++; if (miss < 6) console.log('  缺图标:', p.s); }
}
console.log('缺失图标:', miss);
if (miss) bad++;

// 检查脚本里用到的 DOM id 是否都存在于 HTML
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const usedIds = new Set();
for (const code of scripts) {
  for (const m of code.matchAll(/\$\('([^']+)'\)|getElementById\('([^']+)'\)/g)) usedIds.add(m[1] || m[2]);
}
const missingIds = [...usedIds].filter((id) => !htmlIds.has(id));
console.log('脚本引用的 DOM id:', usedIds.size, '缺失:', missingIds.join(',') || '无');
if (missingIds.length) bad++;

console.log(bad ? '\n检查未通过' : '\n检查通过');
process.exit(bad ? 1 : 0);
