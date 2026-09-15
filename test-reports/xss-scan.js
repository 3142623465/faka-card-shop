// 前端 XSS 风险静态扫描
const fs = require('fs');
const files = {
  'app.js': 'D:/faka/public/js/app.js',
  'admin.js': 'D:/faka/public/js/admin.js',
  'branch.js': 'D:/faka/public/js/branch.js'
};
const FIELD_RE = /\$\{[a-zA-Z]+\.(name|title|content|nickname|remark|detail|subtitle|reason|reply|desc|address|region|question|answer|code|secret|msg|text|note|type|status|link|siteName|slogan)\}/;
for (const [f, p] of Object.entries(files)) {
  const s = fs.readFileSync(p, 'utf8');
  const lines = s.split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    // 出现在 innerHTML 赋值或 HTML 拼接中的未转义字段插值
    if (FIELD_RE.test(l) && !/esc\(/.test(l)) {
      hits.push((i + 1) + ': ' + l.trim().slice(0, 200));
    }
  });
  console.log('===== ' + f + ' 疑似未转义插值: ' + hits.length + ' 处 =====');
  hits.slice(0, 50).forEach(h => console.log(h));
  console.log('');
}
