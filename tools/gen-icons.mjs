// 生成 curl 配置，用于批量下载 299 个帕鲁图标（pals.wiki 公开图片）
import fs from 'node:fs';

const palsSrc = fs.readFileSync('data/raw/pals.generated.js', 'utf8');
const pals = JSON.parse(
  palsSrc
    .slice(palsSrc.indexOf('['), palsSrc.lastIndexOf(']') + 1)
    .replace(/`/g, '"')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":'),
);

const lines = [];
for (const p of pals) {
  const file = p.image.replace(/^\/images\/pals\//, '');
  lines.push('url = "https://pals.wiki/images/pals/' + file + '"');
  lines.push('output = "icons/' + p.slug + '.webp"');
}
fs.writeFileSync('tools/icons.curl', lines.join('\n') + '\n');
console.log('生成 ' + pals.length + ' 条下载任务');
