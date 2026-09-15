/**
 * server/captcha.js - 图形验证码共享模块（注册/登录/找回/分站登录防人机）
 * 内存存储：5 分钟有效、用后即焚；本地演示环境返回 devCode 便于测试。
 */
const util = require('./util');

const captchas = new Map();
const CAPTCHA_TTL = 5 * 60 * 1000;
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildCaptchaSvg(code) {
  const w = 120, h = 44;
  const s = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#f3f5f9" rx="6"/>`
  ];
  for (let i = 0; i < 5; i++) {
    s.push(`<line x1="${(Math.random() * w).toFixed(0)}" y1="${(Math.random() * h).toFixed(0)}" x2="${(Math.random() * w).toFixed(0)}" y2="${(Math.random() * h).toFixed(0)}" stroke="#b6bfcc" stroke-width="1"/>`);
  }
  for (let i = 0; i < 40; i++) {
    s.push(`<circle cx="${(Math.random() * w).toFixed(0)}" cy="${(Math.random() * h).toFixed(0)}" r="${(Math.random() * 1.4 + 0.4).toFixed(1)}" fill="#aab3c2"/>`);
  }
  const colors = ['#e8590c', '#1c7ed6', '#2f9e44', '#e03131', '#7048e8', '#f08c00'];
  [...code].forEach((c, i) => {
    const x = 12 + i * 26, y = 30;
    const rot = (Math.random() * 40 - 20).toFixed(1);
    const fs = 24 + Math.floor(Math.random() * 4);
    s.push(`<text x="${x}" y="${y}" font-size="${fs}" font-family="Arial, sans-serif" font-weight="bold" fill="${colors[i % colors.length]}" transform="rotate(${rot} ${x} ${y})">${c}</text>`);
  });
  s.push('</svg>');
  return s.join('');
}

/** 生成一个图形验证码，返回 { token, svg, devCode } */
function getCaptcha() {
  for (const [k, v] of captchas) if (v.expiresAt < Date.now()) captchas.delete(k);
  let code = '';
  for (let i = 0; i < 4; i++) code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  const token = util.newToken();
  captchas.set(token, { code: code.toLowerCase(), expiresAt: Date.now() + CAPTCHA_TTL });
  const data = { token, svg: buildCaptchaSvg(code) };
  // 生产环境不返回 devCode（防人机验证码明文泄露）
  if (!util.isProd()) data.devCode = code.toLowerCase();
  return data;
}

/** 校验图形验证码（用后即焚） */
function verifyCaptcha(token, code) {
  if (!token || !code) return false;
  const rec = captchas.get(token);
  if (!rec || rec.expiresAt < Date.now()) { captchas.delete(token); return false; }
  captchas.delete(token);
  return rec.code === String(code).trim().toLowerCase();
}

module.exports = { getCaptcha, verifyCaptcha };
