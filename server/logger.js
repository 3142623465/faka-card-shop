/**
 * logger.js - 轻量日志模块（生产排障）
 * 约定：error-YYYYMMDD.log 按天滚动；日志目录 logs/ 自动创建。
 * 用法：const log = require('./logger'); log.error('模块', 错误对象/消息);
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureDir() {
  try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { /* 忽略 */ }
}

function fileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'error-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.log';
}

function ts() {
  return new Date().toISOString();
}

/** 写错误日志（自动附带调用栈） */
function error(tag, err) {
  try {
    ensureDir();
    const msg = err && err.stack ? err.stack : String(err);
    fs.appendFileSync(path.join(LOG_DIR, fileName()), `[${ts()}] [${tag}] ${msg}\n`);
  } catch (e) { /* 日志写入失败不阻断业务 */ }
}

/** 写普通运行日志（同日文件） */
function info(tag, msg) {
  try {
    ensureDir();
    fs.appendFileSync(path.join(LOG_DIR, fileName()), `[${ts()}] [${tag}] ${msg}\n`);
  } catch (e) { /* 忽略 */ }
}

module.exports = { error, info, LOG_DIR };
