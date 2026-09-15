/**
 * mail.js - 邮件发送适配器（默认支持 QQ 邮箱 SMTP，也可用任意 SMTP）
 * - 配置了 SMTP 账号后，邮箱找回密码会真正发送重置邮件
 * - 未配置时自动回退「本地直显重置链接」（devLink），本地离线可用
 *
 * 配置在 server/config.js 的 mail 节（参考 config.example.js），也可用环境变量：
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / SMTP_SECURE
 *
 * QQ 邮箱配置要点（必须使用授权码，不是 QQ 密码）：
 *   1. 登录 QQ 邮箱 → 设置 → 账户 → 开启「POP3/SMTP 服务」→ 获取授权码
 *   2. host = smtp.qq.com，port = 465，user = 你的QQ邮箱，pass = 16 位授权码
 */
const nodemailer = require('nodemailer');

let cfg = {};
try { cfg = require('./config'); } catch (e) { /* 未配置 */ }

function env(name, def) { return process.env[name] || def; }

function mailConfig() {
  const m = (cfg.mail && cfg.mail) || {};
  const host = env('SMTP_HOST', m.host || '');
  const user = env('SMTP_USER', m.user || '');
  const pass = env('SMTP_PASS', m.pass || '');
  const from = env('SMTP_FROM', m.from || user);
  const secure = env('SMTP_SECURE', m.secure === undefined ? '' : String(m.secure));
  let port = Number(env('SMTP_PORT', m.port || (secure === '0' ? 25 : 465)));
  if (!port) port = secure === '0' ? 25 : 465;
  return { host, port, user, pass, from, secure: secure === '' ? port === 465 : secure !== '0' };
}

/** 是否已配置 SMTP（可发送真实邮件） */
function configured() {
  const c = mailConfig();
  return !!(c.host && c.user && c.pass);
}

/**
 * 发送一封邮件。
 * @returns {Promise<{mode:'smtp'|'local', error?:string}>}
 * mode=local 表示未配置 SMTP，调用方应回退 devLink 直显。
 */
async function sendMail({ to, subject, html, text }) {
  const c = mailConfig();
  if (!configured()) return { mode: 'local' };
  try {
    const transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({
      from: c.from ? `"发卡网" <${c.from}>` : c.user,
      to,
      subject: subject || '发卡网',
      text: text || '',
      html
    });
    return { mode: 'smtp' };
  } catch (e) {
    return { mode: 'smtp', error: e && e.message ? e.message : String(e) };
  }
}

/**
 * 发送邮箱找回密码重置邮件。
 * @param {string} toEmail 收件邮箱
 * @param {string} resetUrl 重置链接（如 http://localhost:3000/#/reset?token=xxx）
 */
function sendResetLink(toEmail, resetUrl) {
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f5;font-family:'Microsoft YaHei',sans-serif;padding:30px">
    <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
      <div style="background:#ff7d00;padding:20px 24px;color:#fff;font-size:18px;font-weight:700">发卡网 · 重置密码</div>
      <div style="padding:28px 24px;color:#333;font-size:14px;line-height:1.8">
        <p>您好：</p>
        <p>您正在使用邮箱找回密码，请点击下方按钮重置登录密码（链接 30 分钟内有效，请勿转发）：</p>
        <p style="text-align:center;margin:26px 0">
          <a href="${resetUrl}" style="display:inline-block;background:#ff7d00;color:#fff;text-decoration:none;padding:11px 34px;border-radius:6px;font-size:15px">重置密码</a>
        </p>
        <p style="word-break:break-all;color:#888;font-size:12px">如按钮无法点击，请复制以下链接到浏览器打开：<br><a href="${resetUrl}" style="color:#409eff">${resetUrl}</a></p>
        <p style="color:#999;font-size:12px;margin-top:22px">如果这不是您本人的操作，请忽略本邮件，您的账号不会受到影响。</p>
      </div>
    </div></body></html>`;
  return sendMail({
    to: toEmail,
    subject: '【发卡网】重置密码验证',
    html,
    text: '您正在重置发卡网登录密码，请访问：' + resetUrl + '（30 分钟内有效）'
  });
}

module.exports = { sendMail, sendResetLink, configured };
