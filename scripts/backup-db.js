/**
 * backup-db.js - 数据库备份脚本
 * 用法：node scripts/backup-db.js
 * 将 data/db.json 备份到 backups/db-YYYYMMDD-HHmmss.json（保留最近 30 份）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'data', 'db.json');
const dir = path.join(root, 'backups');

if (!fs.existsSync(src)) {
  console.error('未找到 data/db.json，请先启动服务生成数据');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const name = `db-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
const dest = path.join(dir, name);
fs.copyFileSync(src, dest);

// 只保留最近 30 份
const files = fs.readdirSync(dir).filter((f) => /^db-\d{8}-\d{6}\.json$/.test(f)).sort();
while (files.length > 30) {
  const f = files.shift();
  fs.unlinkSync(path.join(dir, f));
  console.log('清理旧备份:', f);
}

const stat = fs.statSync(src);
console.log(`备份完成: ${dest}（${(stat.size / 1024).toFixed(1)} KB）`);
