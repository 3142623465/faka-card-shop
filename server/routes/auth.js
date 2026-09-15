/**
 * routes/auth.js - 用户认证相关接口
 * 注册 / 登录 / 第三方登录 / 找回密码 / 绑定手机 / 个人信息
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const util = require('../util');
const mail = require('../mail');

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

/* ========== 操作频率限制（防爆破） ========== */
const rateLimits = new Map();
/** 计数并判定：返回 false 表示本次操作被拦截（达到次数或已锁定） */
function rateAllow(key, max, windowMs) {
  const now = Date.now();
  let rec = rateLimits.get(key);
  if (!rec || (rec.lockUntil <= now && now - rec.firstAt >= windowMs)) rec = { count: 0, firstAt: now, lockUntil: 0 };
  if (rec.lockUntil > now) return false;
  if (rec.count >= max) { rec.lockUntil = now + windowMs; rateLimits.set(key, rec); return false; }
  rec.count++;
  rateLimits.set(key, rec);
  return true;
}
function rateClear(key) { rateLimits.delete(key); }
/** 同步分站登录密码：用户改/重置密码后，其名下分站使用同一密码 */
function syncBranchPassword(userId, plainPwd) {
  const d2 = db.load();
  const hash = util.hashPassword(plainPwd);
  d2.branches.forEach((b) => { if (b.ownerId === userId) b.passwordHash = hash; });
  db.save();
}
function clientKey(req, suffix) { return ((req && req.ip) || 'x') + '|' + suffix; }

const captcha = require('../captcha');
/** 获取图形验证码 */
router.get('/captcha', (req, res) => {
  res.json(util.ok(captcha.getCaptcha()));
});

/** 登录安全提醒（原短信提醒已随手机号体系移除，保留空实现兼容调用） */
function notifyLoginSecurity() {}

/** 生成并发送短信验证码（本地环境直接返回，方便离线测试） */
/** 生成邮箱验证码（本地环境直接返回，方便离线测试） */
function issueEmailCode(email, scene) {
  const code = util.genCode();
  db.mutate((d) => {
    d.emailCodes = (d.emailCodes || []).filter((x) => x.email !== email);
    d.emailCodes.push({ email, code, scene, createdAt: util.now(), expiresAt: util.now() + 10 * 60 * 1000 });
  });
  return code;
}
function verifyEmailCode(email, code, scene) {
  const d = db.load();
  const t = util.now();
  const rec = (d.emailCodes || []).find((x) => x.email === email && x.scene === scene);
  if (!rec || rec.code !== code || rec.expiresAt < t) return false;
  db.mutate((dd) => { dd.emailCodes = (dd.emailCodes || []).filter((x) => x !== rec); });
  db.save();
  return true;
}

function issueCode(phone, scene) {
  const code = util.genCode();
  db.mutate((d) => {
    d.smsCodes = d.smsCodes.filter((c) => c.phone !== phone);
    d.smsCodes.push({ phone, code, scene, createdAt: util.now(), expiresAt: util.now() + 600 });
  });
  return code;
}

function verifyCode(phone, code, scene) {
  const d = db.load();
  const t = util.now();
  const rec = d.smsCodes.find((c) => c.phone === phone && c.scene === scene);
  if (!rec || rec.code !== code || rec.expiresAt < t) return false;
  d.smsCodes = d.smsCodes.filter((c) => c !== rec);
  db.save();
  return true;
}

/** 对外暴露的用户信息（脱敏） */
function publicUser(u) {
  return {
    id: u.id, phone: u.phone, nickname: u.nickname, avatar: u.avatar,
    gender: u.gender, birthday: u.birthday, email: u.email || '',
    points: u.points || 0, level: u.level || 1, levelName: u.levelName || '普通会员',
    totalSpend: u.totalSpend || 0, status: u.status, createdAt: u.createdAt,
    needBind: !!u.needBind, isThird: !!u.isThird, provider: u.provider || '', oauthSource: u.oauthSource || ''
  };
}

/** 发送验证码 */
router.post('/login', (req, res) => {
  const bd = req.body || {};
  const { password, captchaToken, captchaCode } = bd;
  const acc = ((bd.email || bd.account || '') + '').trim().toLowerCase();
  if (!acc) return res.json(util.fail('请输入邮箱'));
  if (!captcha.verifyCaptcha(captchaToken, captchaCode)) return res.json(util.fail('图形验证码错误，请刷新后重试'));
  const d = db.load();
  const user = d.users.find((u) => (u.email || '').toLowerCase() === acc);
  const pwdKey = 'pwd|' + acc;
  if (!user) {
    // 超级管理员：在前端登录页直接用后台账号登录 → 直接进入管理后台
    const s = d.settings;
    if (acc.toLowerCase() === (s.adminUsername || '').toLowerCase() && util.verifyPassword(password, s.adminPasswordHash)) {
      const token = auth.createSession(0, 'admin');
      rateClear(clientKey(req, pwdKey));
      return res.json(util.ok({ token, role: 'admin', isAdmin: true, username: s.adminUsername, siteName: s.siteName }));
    }
    if (!rateAllow(clientKey(req, pwdKey), 4, 60000)) return res.json(util.fail('操作频繁，请 60 秒后再试'));
    return res.json(util.fail('账号或密码错误'));
  }
  if (!util.verifyPassword(password, user.passwordHash)) {
    if (!rateAllow(clientKey(req, pwdKey), 4, 60000)) return res.json(util.fail('操作频繁，请 60 秒后再试'));
    return res.json(util.fail('账号或密码错误'));
  }
  rateClear(clientKey(req, pwdKey));
  if (user.status === 0) return res.json(util.fail('账号已被禁用，请联系客服'));
  user.lastLoginAt = util.now();
  db.save();
  const token = auth.createSession(user.id, 'user');
  notifyLoginSecurity(user.id, token);
  res.json(util.ok({ token, user: publicUser(user), role: 'user' }));
});

/** 登录（验证码登录，未注册自动注册） */
router.post('/login-email-code', (req, res) => {
  const { email, code } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.json(util.fail('邮箱格式不正确'));
  if (!verifyEmailCode(em, code, 'login')) {
    if (!rateAllow(clientKey(req, 'lcode|' + em), 4, 60000)) return res.json(util.fail('操作频繁，请 60 秒后再试'));
    return res.json(util.fail('验证码错误或已过期'));
  }
  rateClear(clientKey(req, 'lcode|' + em));
  const d = db.load();
  let user = d.users.find((u) => (u.email || '').toLowerCase() === em);
  const settings = d.settings;
  if (!user) {
    // 邮箱验证码登录自动注册
    user = {
      id: util.nextId('users'),
      phone: '',
      email: em,
      passwordHash: '',
      nickname: '用户' + em.split('@')[0],
      avatar: settings.defaultAvatar || '/img/avatar.svg',
      gender: '', birthday: '',
      points: settings.registerPoints || 50,
    balance: 0,
      level: 1, levelName: '普通会员',
      totalSpend: 0,
      status: 1, needBind: false, isThird: false,
      createdAt: util.now(), lastLoginAt: util.now()
    };
    d.users.push(user);
    if (user.points > 0) {
      d.pointsLogs.push({
        id: util.nextId('pointsLogs'), userId: user.id, change: user.points,
        balance: user.points, type: 'earn', desc: '注册赠送积分', createdAt: util.now()
      });
    }
    d.messages.push({
      id: util.nextId('messages'), userId: user.id, type: 'system',
      title: '欢迎加入' + settings.siteName,
      content: `亲爱的 ${user.nickname}，欢迎来到${settings.siteName}！本站所有卡密均为自动发货，付款后立即到账。`,
      isRead: 0, createdAt: util.now()
    });
  }
  if (user.status === 0) return res.json(util.fail('账号已被禁用，请联系客服'));
  user.lastLoginAt = util.now();
  db.save();
  const token = auth.createSession(user.id, 'user');
  notifyLoginSecurity(user.id, token);
  res.json(util.ok({ token, user: publicUser(user) }));
});

/** 登录后绑定/换绑邮箱（用于找回密码） */
router.post('/bind-email', auth.requireUser, (req, res) => {
  const { email, code } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.json(util.fail('邮箱格式不正确'));
  if (!verifyEmailCode(em, code, 'bind')) return res.json(util.fail('验证码错误或已过期'));
  const d = db.load();
  const dup = d.users.find((u) => (u.email || '').toLowerCase() === em && u.id !== req.user.id);
  if (dup) return res.json(util.fail('该邮箱已被其他账号绑定'));
  const u = d.users.find((x) => x.id === req.user.id);
  if (!u) return res.json(util.fail('账号不存在'));
  u.email = em;
  db.save();
  res.json(util.ok({ user: publicUser(u) }));
});

/** 第三方登录后绑定手机号 */
router.post('/send-email-code', async (req, res) => {
  const { email, scene = 'login', captchaToken, captchaCode } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.json(util.fail('邮箱格式不正确'));
  if (!captcha.verifyCaptcha(captchaToken, captchaCode)) return res.json(util.fail('图形验证码错误，请刷新后重试'));
  if (!rateAllow(clientKey(req, 'email|' + em), 1, 60000)) return res.json(util.fail('发送过于频繁，请稍后再试'));
  const d = db.load();
  const exists = d.users.some((u) => (u.email || '').toLowerCase() === em);
  if (scene === 'register' && exists) return res.json(util.fail('该邮箱已注册'));
  if (scene === 'reset' && !exists) return res.json(util.fail('该邮箱未注册'));
  if (scene === 'bind' && exists) return res.json(util.fail('该邮箱已被绑定，请更换邮箱'));
  const code = issueEmailCode(em, scene);
  const siteName = (d.settings && d.settings.siteName) || '发卡网';
  const r = await mail.sendMail({
    to: em,
    subject: `【${siteName}】验证码 ${code}`,
    html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06)">
      <div style="background:#ff7d00;padding:18px 24px;color:#fff;font-size:16px;font-weight:700">${siteName} · 邮箱验证</div>
      <div style="padding:24px;color:#333;font-size:14px;line-height:1.8">
        <p>您好：</p>
        <p>您正在进行${scene === 'register' ? '注册账号' : scene === 'reset' ? '重置密码' : '登录验证'}操作，验证码为：</p>
        <div style="font-size:30px;font-weight:bold;color:#ff7d00;letter-spacing:8px;padding:14px;background:#fff7f0;border-radius:8px;text-align:center;margin:16px 0">${code}</div>
        <p style="color:#999;font-size:12px">验证码 10 分钟内有效，请勿泄露给他人。如非本人操作请忽略。</p>
      </div>
    </div>`,
    text: `您的${siteName}验证码是 ${code}，10分钟内有效。`
  });
  if (r.mode === 'local' || r.error) {
    if (util.isProd()) return res.json(util.fail(r.error ? ('邮件发送失败：' + r.error) : '邮箱服务未配置，生产环境无法发送验证码，请配置邮箱服务（见 config.example.js）'));
    res.json(util.ok({ email, devCode: code, tip: r.error ? ('邮件发送失败（' + r.error + '），验证码已本地返回，请直接在输入框填写') : '本地演示环境验证码已直接返回，配置邮箱后将发送邮件' }));
  } else {
    // 真实 SMTP 发送成功：前端只提示已发送；本地开发环境额外返回 devCode 仅供自动化测试使用（前端不展示）
    res.json(util.ok({ email, tip: '验证码已发送至 ' + email + '，请注意查收', ...(!util.isProd() ? { devCode: code } : {}) }));
  }
});

/** 邮箱注册（邮箱+验证码+密码） */
router.post('/register-email', (req, res) => {
  const { email, code, password, nickname } = req.body || {};
  const mail = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return res.json(util.fail('邮箱格式不正确'));
  if (!verifyEmailCode(mail, code, 'register')) return res.json(util.fail('验证码错误或已过期'));
  if (!password || password.length < 6) return res.json(util.fail('密码至少 6 位'));
  const d = db.load();
  if (d.users.some((u) => (u.email || '').toLowerCase() === mail)) return res.json(util.fail('该邮箱已注册'));
  const settings = d.settings;
  const user = {
    id: util.nextId('users'),
    phone: '',
    email: mail,
    passwordHash: util.hashPassword(password),
    nickname: nickname || '用户' + mail.split('@')[0],
    avatar: settings.defaultAvatar || '/img/avatar.svg',
    gender: '', birthday: '',
    points: settings.registerPoints || 50,
    balance: 0,
    level: 1, levelName: '普通会员',
    totalSpend: 0,
    status: 1, needBind: false, isThird: false,
    createdAt: util.now(), lastLoginAt: util.now()
  };
  d.users.push(user);
  if (user.points > 0) {
    d.pointsLogs.push({ id: util.nextId('pointsLogs'), userId: user.id, change: user.points, balance: user.points, type: 'earn', desc: '注册赠送积分', createdAt: util.now() });
  }
  d.messages.push({ id: util.nextId('messages'), userId: user.id, type: 'system', title: '欢迎加入' + settings.siteName, content: `亲爱的 ${user.nickname}，欢迎来到${settings.siteName}！本站所有卡密均为自动发货，付款后立即到账。如有疑问请联系在线客服。`, isRead: 0, createdAt: util.now() });
  db.save();
  const token = auth.createSession(user.id, 'user');
  res.json(util.ok({ token, user: publicUser(user) }));
});

/** 邮箱发送重置链接（配置 SMTP 后真正发信；未配置回退本地直显 devLink） */
router.post('/send-reset-email', async (req, res) => {
  const { email, captchaToken, captchaCode } = req.body || {};
  if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) return res.json(util.fail('邮箱格式不正确'));
  if (!captcha.verifyCaptcha(captchaToken, captchaCode)) return res.json(util.fail('图形验证码错误，请刷新后重试'));
  const d = db.load();
  const user = d.users.find((u) => (u.email || '').toLowerCase() === String(email || '').trim().toLowerCase());
  if (!user) return res.json(util.fail('该邮箱未绑定账号'));
  const token = util.newToken();
  d.resetTokens = d.resetTokens.filter((r) => r.userId !== user.id);
  d.resetTokens.push({ token, userId: user.id, expiresAt: util.now() + 1800 });
  db.save();
  // 组装重置链接（优先用前端回跳地址，本地为 #/reset?token=...）
  const devLink = '#/reset?token=' + token;
  const host = req.headers.host ? (req.headers['x-forwarded-proto'] || req.protocol || 'http') + '://' + req.headers.host : '';
  const resetUrl = host ? host + '/index.html#' + devLink.slice(1) : devLink;
  const r = await mail.sendResetLink(email, resetUrl);
  if (r.mode === 'smtp' && !r.error) {
    res.json(util.ok({ tip: '重置邮件已发送到 ' + email + '，请查收（30 分钟内有效）' }));
  } else {
    if (util.isProd()) return res.json(util.fail(r.error ? ('邮件发送失败：' + r.error) : '邮箱服务未配置，生产环境无法发送重置邮件，请配置邮箱服务（见 config.example.js）'));
    res.json(util.ok({ devLink, tip: r.error ? ('邮件发送失败（' + r.error + '），已本地返回重置链接') : '本地演示环境：重置链接已生成（配置 SMTP 后会自动发送邮件）' }));
  }
});

/** 邮箱令牌重置密码 */
router.post('/reset-email', (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.json(util.fail('链接无效'));
  if (!password || password.length < 6) return res.json(util.fail('密码至少 6 位'));
  const d = db.load();
  const rec = d.resetTokens.find((r) => r.token === token);
  if (!rec || rec.expiresAt < util.now()) return res.json(util.fail('链接已失效，请重新发送'));
  const user = d.users.find((u) => u.id === rec.userId);
  if (!user) return res.json(util.fail('账号不存在'));
  user.passwordHash = util.hashPassword(password);
  syncBranchPassword(user.id, password);
  d.resetTokens = d.resetTokens.filter((r) => r.token !== token);
  db.save();
  res.json(util.ok({ msg: '密码重置成功，请重新登录' }));
});

/** 邮箱验证码重置密码（找回密码-验证码方式） */
router.post('/reset-email-code', (req, res) => {
  const { email, code, password } = req.body || {};
  const em = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.json(util.fail('邮箱格式不正确'));
  if (!verifyEmailCode(em, code, 'reset')) return res.json(util.fail('验证码错误或已过期'));
  if (!password || password.length < 6) return res.json(util.fail('密码至少 6 位'));
  const d = db.load();
  const user = d.users.find((u) => (u.email || '').toLowerCase() === em);
  if (!user) return res.json(util.fail('该邮箱未注册'));
  user.passwordHash = util.hashPassword(password);
  syncBranchPassword(user.id, password);
  res.json(util.ok({ msg: '密码重置成功，请重新登录' }));
});

/** 当前登录用户信息 */
router.get('/me', auth.requireUser, (req, res) => {
  refreshLevel(req.user);
  res.json(util.ok({ user: publicUser(req.user) }));
});

/** 根据累计消费刷新会员等级 */
function refreshLevel(user) {
  const spend = user.totalSpend || 0;
  let level = 1, name = '普通会员';
  if (spend >= 10000) { level = 5; name = '至尊会员'; }
  else if (spend >= 5000) { level = 4; name = '钻石会员'; }
  else if (spend >= 2000) { level = 3; name = '黄金会员'; }
  else if (spend >= 500) { level = 2; name = '白银会员'; }
  if (user.level !== level) {
    user.level = level;
    user.levelName = name;
    db.save();
  }
}

/** 修改登录密码 */
router.put('/password', auth.requireUser, (req, res) => {
  const { old, next } = req.body || {};
  if (!old || !next) return res.json(util.fail('参数不完整'));
  if (next.length < 6) return res.json(util.fail('新密码至少 6 位'));
  if (!util.verifyPassword(old, req.user.passwordHash)) return res.json(util.fail('原密码不正确'));
  req.user.passwordHash = util.hashPassword(next);
  syncBranchPassword(req.user.id, next);
  res.json(util.ok({ msg: '密码修改成功' }));
});

/** 更新个人资料 */
router.put('/profile', auth.requireUser, (req, res) => {
  const { nickname, avatar, gender, birthday, email } = req.body || {};
  const u = req.user;
  if (nickname !== undefined) {
    const n = String(nickname).trim();
    if (n.length < 2 || n.length > 20) return res.json(util.fail('昵称需 2-20 个字符'));
    u.nickname = n;
  }
  if (avatar !== undefined) u.avatar = avatar;
  if (gender !== undefined) u.gender = ['男', '女', '保密'].includes(gender) ? gender : u.gender;
  if (birthday !== undefined) u.birthday = birthday;
  // 邮箱不可通过个人资料直接修改（防账号混淆/被盗）；必须走 /bind-email 验证码+查重流程
  if (email !== undefined) return res.json(util.fail('修改邮箱请使用「绑定邮箱」功能（需邮箱验证码验证）'));
  db.save();
  res.json(util.ok({ user: publicUser(u) }));
});

module.exports = router;
