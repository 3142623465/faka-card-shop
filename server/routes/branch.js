/**
 * routes/branch.js - 分站（代理商）认证与管理
 * - 分站登录（图形验证码防人机）
 * - 专业分站可开通/管理自己的普通分站
 * - 普通分站仅有个人信息（无下级管理权）
 * - 资金闭环：商品差价分成入余额 → 流水可查 → 申请提现
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const util = require('../util');
const captcha = require('../captcha');
const branchSign = require('../branch-sign');
const crypto = require('crypto');

/** 分站登录（支持分站账号或用户注册账号，图形验证码防人机，5 次错误拦截 60 秒） */
const branchRate = new Map();
function branchRateAllow(key) {
  const now = Date.now();
  let rec = branchRate.get(key);
  if (!rec || (rec.lockUntil <= now && now - rec.firstAt >= 60000)) rec = { count: 0, firstAt: now, lockUntil: 0 };
  if (rec.lockUntil > now) return false;
  if (rec.count >= 4) { rec.lockUntil = now + 60000; branchRate.set(key, rec); return false; }
  rec.count++;
  branchRate.set(key, rec);
  return true;
}
router.post('/login', (req, res) => {
  const { username, password, captchaToken, captchaCode } = req.body || {};
  if (!username || !password) return res.json(util.fail('请输入账号和密码'));
  if (!captcha.verifyCaptcha(captchaToken, captchaCode)) return res.json(util.fail('图形验证码错误，请刷新后重试'));
  const rk = (req.ip || 'x') + '|' + String(username).trim();
  if (!branchRateAllow(rk)) return res.json(util.fail('操作频繁，请 60 秒后再试'));
  const d = db.load();
  const un = String(username).trim();
  let branch = d.branches.find((b) => b.username === un);
  if (!branch) {
    // 兼容：用注册账号（邮箱）登录分站后台
    const u = d.users.find((x) => (x.email || '').toLowerCase() === un.toLowerCase() || x.phone === un);
    if (u) branch = d.branches.find((b) => b.ownerId === u.id);
  }
  if (!branch || !util.verifyPassword(password, branch.passwordHash)) {
    return res.json(util.fail('账号或密码错误'));
  }
  branchRate.delete(rk);
  if (branch.status === 0) return res.json(util.fail('分站已被停用，请联系上级'));
  branch.lastLoginAt = util.now();
  db.save();
  const token = auth.createSession(branch.id, 'branch');
  res.json(util.ok({
    token, role: 'branch',
    branch: { id: branch.id, name: branch.name, type: branch.type, username: branch.username }
  }));
});

/** 分站信息 */
router.get('/me', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const s = d.settings || {};
  const children = d.branches.filter((x) => x.parentId === b.id);
  const parent = b.parentId ? d.branches.find((x) => x.id === b.parentId) : null;
  const proPrice = branchSign.priceOf(b, 'pricePro', s);
  const normalPrice = branchSign.priceOf(b, 'priceNormal', s);
  const pendingWithdraw = d.withdrawals
    .filter((w) => w.branchId === b.id && ['pending', 'approved'].includes(w.status))
    .reduce((s2, w) => s2 + (w.amount || 0), 0);
  const orderCount = d.orders.filter((o) => o.branchId === b.id).length;
  const balanceLogCount = d.branchBalanceLogs.filter((l) => l.branchId === b.id).length;
  res.json(util.ok({
    id: b.id, name: b.name, type: b.type, username: b.username, status: b.status,
    note: b.note || '', createdAt: b.createdAt, lastLoginAt: b.lastLoginAt || 0,
    balance: Math.round((b.balance || 0) * 100) / 100,
    pendingWithdraw,
    childCount: children.length,
    orderCount,
    balanceLogCount,
    parentId: b.parentId,
    parentName: parent ? parent.name : '超级管理员',
    parentType: parent ? parent.type : 'admin',
    siteName: s.siteName,
    pricePro: proPrice, priceNormal: normalPrice,
    parentProPrice: parent ? branchSign.priceOf(parent, 'pricePro', s) : (s.branchProPrice === undefined ? 10 : s.branchProPrice),
    parentNormalPrice: parent ? branchSign.priceOf(parent, 'priceNormal', s) : (s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice),
    // 升级价格：普通分站 → 专业分站 = 上级专业价 - 上级普通价
    upgradePrice: b.type === 'normal'
      ? Math.max(0, Math.round((branchSign.priceOf(parent, 'pricePro', s) - branchSign.priceOf(parent, 'priceNormal', s)) * 100) / 100)
      : 0
  }));
});

/* =============== 专业分站管理下级 =============== */

router.get('/branches', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站无下级管理权限'));
  const d = db.load();
  const list = d.branches
    .filter((x) => x.parentId === b.id)
    .map((x) => ({
      id: x.id, name: x.name, type: x.type, username: x.username,
      status: x.status, note: x.note || '', createdAt: x.createdAt, lastLoginAt: x.lastLoginAt || 0,
      balance: Math.round((x.balance || 0) * 100) / 100
    }))
    .sort((a, b2) => b2.id - a.id);
  res.json(util.ok(list));
});

/** 专业分站：开通普通/专业分站（价格继承上级，层级受上限约束） */
router.post('/branches', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站无开通下级权限'));
  const { name, username, password, note, type } = req.body || {};
  const un = String(username || '').trim();
  const nm = String(name || '').trim();
  const pw = String(password || '');
  const typ = type === 'pro' ? 'pro' : 'normal';
  if (!nm || !un || !pw) return res.json(util.fail('请填写分站名称、账号、密码'));
  if (pw.length < 4) return res.json(util.fail('密码至少 4 位'));
  const d = db.load();
  const s = d.settings || {};
  const maxDepth = s.branchMaxDepth === undefined ? 5 : Number(s.branchMaxDepth);
  if (branchSign.depthOf(d, b) + 1 > maxDepth) return res.json(util.fail('分站层级已达系统上限，无法继续开通下级'));
  if (d.branches.some((x) => x.username === un)) return res.json(util.fail('该分站账号已被使用'));
  const branch = {
    id: util.nextId('branches'),
    name: nm.slice(0, 20),
    type: typ,
    parentId: b.id,
    username: un.slice(0, 20),
    passwordHash: util.hashPassword(pw),
    status: 1,
    note: String(note || '').slice(0, 100),
    ownerId: 0,
    balance: 0,
    pricePro: branchSign.priceOf(b, 'pricePro', s),
    priceNormal: branchSign.priceOf(b, 'priceNormal', s),
    createdAt: util.now(), lastLoginAt: 0
  };
  d.branches.push(branch);
  db.save();
  res.json(util.ok({ id: branch.id }));
});

/** 专业分站：启用/停用普通分站（停用级联子树并清理分站会话） */
router.put('/branches/:id', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站无下级管理权限'));
  const id = Number(req.params.id);
  const d = db.load();
  const child = d.branches.find((x) => x.id === id && x.parentId === b.id);
  if (!child) return res.json(util.fail('分站不存在或不是您的下级'));
  const status = req.body && req.body.status === 1 ? 1 : 0;
  if (status === 0) {
    // 级联停用子树
    const ids = new Set([child.id]);
    const collect = (bid) => d.branches.filter((x) => x.parentId === bid).forEach((x) => { ids.add(x.id); collect(x.id); });
    collect(child.id);
    d.branches.forEach((x) => { if (ids.has(x.id)) x.status = 0; });
    d.sessions = d.sessions.filter((x) => !(x.role === 'branch' && ids.has(x.userId)));
  } else {
    child.status = 1;
  }
  db.save();
  res.json(util.ok({ status: child.status }));
});

/** 专业分站：删除普通分站（级联子树 + 清理会话 + 校验未完成订单） */
router.delete('/branches/:id', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站无下级管理权限'));
  const id = Number(req.params.id);
  const d = db.load();
  const child = d.branches.find((x) => x.id === id && x.parentId === b.id);
  if (!child) return res.json(util.fail('分站不存在或不是您的下级'));
  const ids = new Set([child.id]);
  const collect = (bid) => d.branches.filter((x) => x.parentId === bid).forEach((x) => { ids.add(x.id); collect(x.id); });
  collect(child.id);
  // 有进行中订单的分站不允许删除
  const active = d.orders.some((o) => ids.has(o.branchId) && ['pending', 'paid', 'shipped'].includes(o.status));
  if (active) return res.json(util.fail('该分站存在进行中的订单，请先处理后再删除'));
  d.branches = d.branches.filter((x) => !ids.has(x.id));
  d.products = d.products.filter((p) => !ids.has(p.branchId));
  d.sessions = d.sessions.filter((x) => !(x.role === 'branch' && ids.has(x.userId)));
  db.save();
  res.json(util.ok({ removed: ids.size }));
});

/** 分站修改密码（双向同步：绑定用户账号同步更新为同一密码并清理其会话，保证"同一账号同一密码"） */
router.put('/password', auth.requireBranchOrUser, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const b = req.branch;
  if (!util.verifyPassword(oldPassword || '', b.passwordHash)) return res.json(util.fail('原密码错误'));
  const np = String(newPassword || '');
  if (np.length < 4) return res.json(util.fail('新密码至少 4 位'));
  b.passwordHash = util.hashPassword(np);
  // 双向同步：绑定了用户账号则回写用户密码并清理其会话
  const d = db.load();
  if (b.ownerId) {
    const u = d.users.find((x) => x.id === b.ownerId);
    if (u) {
      u.passwordHash = b.passwordHash;
      d.sessions = d.sessions.filter((x) => !(x.role === 'user' && x.userId === u.id));
      d.messages.push({
        id: util.nextId('messages'), userId: u.id, type: 'branch',
        title: '分站密码已更新', content: `您的分站「${b.name}」登录密码已修改，同一账号（${u.email}）的登录密码已同步更新，请使用新密码登录。`,
        isRead: 0, createdAt: util.now()
      });
    }
  }
  db.save();
  res.json(util.ok({ synced: !!b.ownerId }));
});

/** 专业分站：设置下级分站价格（专业价 / 普通价，不得低于上级同款） */
router.put('/price', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站无下级，不能设置价格'));
  const pro = Number(req.body && req.body.pricePro);
  const normal = Number(req.body && req.body.priceNormal);
  if (!isFinite(pro) || pro < 0 || pro > 99999) return res.json(util.fail('专业分站价格无效'));
  if (!isFinite(normal) || normal < 0 || normal > 99999) return res.json(util.fail('普通分站价格无效'));
  const d = db.load();
  const s = d.settings || {};
  const parent = b.parentId ? d.branches.find((x) => x.id === b.parentId) : null;
  const err = branchSign.validatePriceBelow(parent, pro, normal, s);
  if (err) return res.json(util.fail(err));
  b.pricePro = Math.round(pro * 100) / 100;
  b.priceNormal = Math.round(normal * 100) / 100;
  db.save();
  res.json(util.ok({ pricePro: b.pricePro, priceNormal: b.priceNormal }));
});

/** 普通分站升级为专业分站（补差价；上级=超级管理员时差价进入平台） */
router.put('/upgrade', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type === 'pro') return res.json(util.fail('您已是专业分站'));
  const d = db.load();
  const s = d.settings || {};
  const parent = b.parentId ? d.branches.find((x) => x.id === b.parentId) : null;
  const price = Math.max(0, Math.round((branchSign.priceOf(parent, 'pricePro', s) - branchSign.priceOf(parent, 'priceNormal', s)) * 100) / 100);
  // 优先从分站余额扣（管理员建站无绑定用户）；绑定了用户则兼容原逻辑从用户余额扣
  const owner = b.ownerId ? d.users.find((u) => u.id === b.ownerId) : null;
  let bal = 0;
  let payFrom = '';
  if (owner) {
    bal = owner.balance || 0;
    if (bal < price) return res.json(util.fail('余额不足，升级需补差价 ¥' + price + '，当前余额 ¥' + bal));
    owner.balance = Math.round((bal - price) * 100) / 100;
    payFrom = 'user';
    // 用户余额流水（补差价升级）
    if (price > 0) {
      d.balanceLogs.push({
        id: util.nextId('balanceLogs'), userId: owner.id, change: -price, balance: owner.balance,
        type: 'branch_upgrade', desc: `分站「${b.name}」升级专业分站补差价 ¥${price.toFixed(2)}`, relatedId: b.id, createdAt: util.now()
      });
    }
    d.messages.push({
      id: util.nextId('messages'), userId: owner.id, type: 'branch',
      title: '分站升级成功', content: `您的分站「${b.name}」已升级为专业分站，补差价 ¥${price.toFixed(2)}（从账户余额扣除）。`,
      isRead: 0, createdAt: util.now()
    });
  } else {
    bal = b.balance || 0;
    if (bal < price) return res.json(util.fail('余额不足，升级需补差价 ¥' + price + '，当前分站余额 ¥' + bal + '，请先通过商品分销获得收益'));
    b.balance = Math.round((bal - price) * 100) / 100;
    payFrom = 'branch';
  }
  // 差价去向：有上级 → 进上级分站余额；无上级（一级分站） → 平台收入
  if (parent) {
    parent.balance = Math.round(((parent.balance || 0) + price) * 100) / 100;
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: parent.id,
      change: price, balance: parent.balance, type: 'income',
      desc: `下级分站「${b.name}」升级专业分站补差价 ¥${price.toFixed(2)}`,
      relatedId: b.id, createdAt: util.now()
    });
  } else if (price > 0) {
    s.platformIncome = Math.round(((s.platformIncome || 0) + price) * 100) / 100;
    d.platformLogs.push({
      id: util.nextId('platformLogs'), change: price, balance: s.platformIncome,
      type: 'branch_upgrade', desc: `一级分站「${b.name}」升级专业分站收入 ¥${price.toFixed(2)}`,
      relatedId: b.id, createdAt: util.now()
    });
  }
  // 分站余额支付记录流水
  if (payFrom === 'branch' && price > 0) {
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: b.id,
      change: -price, balance: b.balance, type: 'expense',
      desc: `升级专业分站补差价 ¥${price.toFixed(2)}`,
      relatedId: b.id, createdAt: util.now()
    });
  }
  b.type = 'pro';
  db.save();
  db.flushNow(); // 升级扣款/分成立即落盘
  res.json(util.ok({ balance: payFrom === 'user' ? owner.balance : b.balance, paid: price }));
});

/* =============== 邀请链接 =============== */

/** 专业分站：生成带签名的邀请链接 */
router.get('/invite-link', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  if (b.type !== 'pro') return res.json(util.fail('普通分站不能生成邀请链接'));
  const d = db.load();
  const s = d.settings || {};
  const exp = util.now() + 30 * 86400;
  const sign = branchSign.signInvite(b.username, exp);
  // 优先取 x-forwarded-proto（反代后保持 https）；trust proxy 已开启
  const proto = (req.headers['x-forwarded-proto'] && String(req.headers['x-forwarded-proto']).split(',')[0].trim()) || req.protocol || 'http';
  const url = proto + '://' + (req.get('host') || 'localhost:3000') + '/index.html#/join?p=' + encodeURIComponent(b.username) + '&s=' + encodeURIComponent(sign);
  res.json(util.ok({
    url,
    sign,
    pricePro: branchSign.priceOf(b, 'pricePro', s),
    priceNormal: branchSign.priceOf(b, 'priceNormal', s),
    exp
  }));
});

/* =============== 分站订单 =============== */

/** 判断订单是否包含本分站商品（兼容旧数据：无 branchIds 时退化为 branchId 单归属） */
function orderBelongsToBranch(o, branchId) {
  if (Array.isArray(o.branchIds) && o.branchIds.length) return o.branchIds.includes(branchId);
  return o.branchId === branchId;
}

/** 本分站订单列表（含本级与下级分站商品订单按 branchIds 归属） */
router.get('/orders', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const { status = 'all', page = 1, size = 10 } = req.query;
  let list = d.orders.filter((o) => orderBelongsToBranch(o, b.id));
  if (status !== 'all') list = list.filter((o) => o.status === status);
  list.sort((a, b2) => b2.createdAt - a.createdAt);
  const pg = util.paginate(list, page, size);
  pg.list = pg.list.map((o) => {
    const u = d.users.find((x) => x.id === o.userId);
    const cards = d.cards.filter((c) => c.orderId === o.id);
    return {
      ...o,
      buyerName: u ? (u.nickname || u.email || u.phone || '用户') : '用户',
      cards: cards.map((c) => ({ code: c.code, secret: c.secret, status: c.status }))
    };
  });
  res.json(util.ok(pg));
});

/** 本分站订单详情 */
router.get('/orders/:id', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && orderBelongsToBranch(x, b.id));
  if (!o) return res.json(util.fail('订单不存在'));
  const cards = d.cards.filter((c) => c.orderId === o.id);
  const u = d.users.find((x) => x.id === o.userId);
  res.json(util.ok({
    ...o,
    buyerName: u ? (u.nickname || u.email || u.phone || '用户') : '用户',
    buyerEmail: u ? (u.email || '') : '',
    cards: cards.map((c) => ({ code: c.code, secret: c.secret, status: c.status }))
  }));
});

/** 本分站订单发货：手动发货（填卡密或物流单号）；只允许操作本分站商品行 */
router.post('/orders/:id/ship', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const { cards, trackingNo, logistics = '快递' } = req.body || {};
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && orderBelongsToBranch(x, b.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'paid') return res.json(util.fail('仅待发货订单可发货'));
  const cardText = String(cards || '').trim();
  if (!cardText && !String(trackingNo || '').trim()) return res.json(util.fail('请填写卡密内容或物流单号'));
  // 取本分站商品行（用于卡密归属）
  const myGood = (o.goods || []).find((g) => g.branchId === b.id) || (o.goods || [])[0];
  const t = util.now();
  let cardsDelivered = 0;
  if (cardText) {
    // 卡密按行拆分，写入卡密表（标记已使用）
    const lines = cardText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return res.json(util.fail('卡密内容为空'));
    for (const line of lines) {
      const [code, secret] = line.split(/[\s,，|]+/);
      d.cards.push({
        id: util.nextId('cards'), productId: myGood ? myGood.productId : 0,
        code: (code || line).slice(0, 100), secret: (secret || '').slice(0, 100),
        status: 'used', orderId: o.id, usedAt: t, createdAt: t
      });
      cardsDelivered++;
    }
    o.cardsDelivered = (o.cardsDelivered || 0) + cardsDelivered;
  }
  o.status = 'shipped';
  o.shippedAt = t;
  if (cardText) {
    o.trackingNo = '卡密发货';
    o.logistics = '卡密已发放';
  } else {
    o.trackingNo = String(trackingNo).trim();
    o.logistics = logistics;
  }
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '订单已发货', content: `订单 ${o.orderNo} 已由分站「${b.name}」发货${cardText ? '，卡密请到订单详情查看' : '，物流公司：' + logistics + '，单号：' + o.trackingNo}。`,
    isRead: 0, createdAt: t
  });
  db.save();
  res.json(util.ok({ status: o.status, cardsDelivered }));
});

/* =============== 分站资金流水 =============== */

router.get('/balance-logs', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const { page = 1, size = 20 } = req.query;
  let list = d.branchBalanceLogs.filter((l) => l.branchId === b.id).sort((a, b2) => b2.id - a.id);
  res.json(util.ok({ ...util.paginate(list, page, size), balance: Math.round((b.balance || 0) * 100) / 100 }));
});

/* =============== 分站收款方式绑定（邮箱验证码） =============== */

/** 分站绑定邮箱：优先 owner 用户邮箱，其次分站账号本身为邮箱 */
function branchPayEmail(b, d) {
  if (b.ownerId > 0) {
    const u = d.users.find((x) => x.id === b.ownerId);
    if (u && u.email) return String(u.email).toLowerCase();
  }
  const un = String(b.username || '').trim();
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(un) ? un.toLowerCase() : '';
}

/** 收款账号打码展示（前3后4，中间*） */
function maskAccount(acc) {
  const s = String(acc || '');
  if (s.length <= 7) return s.slice(0, 2) + '***';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

/** 我的收款方式（脱敏返回） */
router.get('/pay-accounts', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const pa = b.payAccounts || {};
  const out = {};
  if (pa.alipay) out.alipay = { nickname: pa.alipay.nickname || '', account: maskAccount(pa.alipay.account || ''), updatedAt: pa.alipay.updatedAt || 0 };
  if (pa.wechat) out.wechat = { nickname: pa.wechat.nickname || '', qrcode: pa.wechat.qrcode || '', updatedAt: pa.wechat.updatedAt || 0 };
  if (pa.bank) out.bank = { holder: pa.bank.holder || '', bankName: pa.bank.bankName || '', account: maskAccount(pa.bank.account || ''), updatedAt: pa.bank.updatedAt || 0 };
  res.json(util.ok({ payAccounts: out, email: branchPayEmail(b, db.load()) }));
});

/** 绑定/更新收款方式（需邮箱验证码：发送到分站账号邮箱，scene=pay） */
router.post('/pay-accounts', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const { type, email, emailCode } = req.body || {};
  const em = branchPayEmail(b, d);
  if (!em) return res.json(util.fail('当前分站账号不是邮箱且未绑定用户，无法进行邮箱验证，请联系管理员绑定账号'));
  const reqEmail = String(email || '').trim().toLowerCase();
  if (reqEmail !== em) return res.json(util.fail('请使用分站账号邮箱 ' + em + ' 接收验证码'));
  // 邮箱验证码校验（scene=pay，一次性消费）
  const codeStr = String(emailCode || '').trim();
  const recIdx = (d.emailCodes || []).findIndex((x) => x.email === em && x.scene === 'pay' && x.code === codeStr);
  if (recIdx < 0 || !d.emailCodes[recIdx] || d.emailCodes[recIdx].expiresAt < util.now()) {
    return res.json(util.fail('邮箱验证码错误或已过期'));
  }
  d.emailCodes.splice(recIdx, 1); // 用后即焚
  if (!['alipay', 'wechat', 'bank'].includes(type)) return res.json(util.fail('收款方式不正确'));

  const pa = b.payAccounts || (b.payAccounts = {});
  const now = util.now();
  const body = req.body || {};
  if (type === 'alipay') {
    const nickname = String(body.nickname || '').trim();
    const account = String(body.account || '').trim();
    if (!nickname) return res.json(util.fail('请填写支付宝昵称'));
    if (account.length < 6 || !/^[0-9A-Za-z@.\-_]+$/.test(account)) return res.json(util.fail('支付宝账号格式不正确（6位以上，支持手机号/邮箱/账号）'));
    pa.alipay = { nickname, account, updatedAt: now };
  } else if (type === 'wechat') {
    const nickname = String(body.nickname || '').trim();
    const qrcode = String(body.qrcode || '').trim();
    if (!nickname) return res.json(util.fail('请填写微信昵称'));
    if (!qrcode) return res.json(util.fail('请上传微信收款码图片'));
    pa.wechat = { nickname, qrcode, updatedAt: now };
  } else {
    const holder = String(body.holder || '').trim();
    const bankName = String(body.bankName || '').trim();
    const account = String(body.account || '').trim();
    if (!holder) return res.json(util.fail('请填写持卡人姓名'));
    if (bankName.length < 4) return res.json(util.fail('请填写完整的开户行（如：中国工商银行XX分行XX支行）'));
    if (!/^\d{12,24}$/.test(account)) return res.json(util.fail('银行卡号格式不正确（12-24位数字）'));
    pa.bank = { holder, bankName, account, updatedAt: now };
  }
  db.save();
  db.flushNow();
  res.json(util.ok({ msg: '收款方式已绑定' }));
});

/** 解绑收款方式 */
router.delete('/pay-accounts/:type', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const type = String(req.params.type || '');
  if (!['alipay', 'wechat', 'bank'].includes(type)) return res.json(util.fail('收款方式不正确'));
  if (!b.payAccounts || !b.payAccounts[type]) return res.json(util.fail('该收款方式未绑定'));
  delete b.payAccounts[type];
  db.save();
  db.flushNow();
  res.json(util.ok({ msg: '已解绑' }));
});

/* =============== 分站提现 =============== */

/** 分站上传图片（收款码等；魔数嗅探防存储型 XSS） */
router.post('/upload', auth.requireBranchOrUser, (req, res) => {
  const { data } = req.body || {};
  if (!data) return res.json(util.fail('缺少图片数据'));
  const buf = Buffer.from(data, 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.json(util.fail('图片不能超过 3MB'));
  const real = util.detectImageType(buf);
  if (!real) return res.json(util.fail('图片内容与格式不符，仅支持 jpg/png/gif/webp'));
  const fs = require('fs');
  const path = require('path');
  const uploadDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const name = 'b_' + Date.now() + '_' + crypto.randomInt(1000000, 9999999) + '.' + real;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  const url = '/uploads/' + name;
  res.json(util.ok({ url }));
});

/** 我的提现记录 */
router.get('/withdrawals', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const list = d.withdrawals
    .filter((w) => w.branchId === b.id)
    .sort((a, b2) => b2.id - a.id);
  res.json(util.ok(list));
});

/** 申请提现（使用已绑定的收款方式：alipay / wechat / bank） */
router.post('/withdrawals', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const amount = Math.round(Number(req.body && req.body.amount) * 100) / 100;
  const method = String((req.body && req.body.method) || '').trim();
  if (!isFinite(amount) || amount <= 0) return res.json(util.fail('请输入正确的提现金额'));
  if (amount < 1) return res.json(util.fail('单次提现金额不能低于 ¥1'));
  if (!['alipay', 'wechat', 'bank'].includes(method)) return res.json(util.fail('请选择收款方式（支付宝/微信/银行卡）'));
  const pa = (b.payAccounts || {})[method];
  if (!pa) return res.json(util.fail('请先在「收款方式」中绑定 ' + (method === 'alipay' ? '支付宝' : method === 'wechat' ? '微信' : '银行卡') + ' 收款信息'));
  // 收款信息快照（提现记录可见）
  const account = method === 'alipay' ? '支付宝（' + pa.nickname + '）：' + pa.account
    : method === 'wechat' ? '微信收款码（' + pa.nickname + '）'
    : '银行卡（' + (pa.holder || '') + '）：' + (pa.bankName || '') + ' ' + pa.account;
  const d = db.load();
  // 冻结金额 = 处理中提现
  const frozen = d.withdrawals
    .filter((w) => w.branchId === b.id && ['pending', 'approved'].includes(w.status))
    .reduce((s, w) => s + (w.amount || 0), 0);
  const avail = Math.round((((b.balance || 0) - frozen) * 100) / 100);
  if (amount > avail) return res.json(util.fail('可提现余额不足（含处理中的提现），当前可提现 ¥' + avail.toFixed(2)));
  const w = {
    id: util.nextId('withdrawals'),
    branchId: b.id, branchName: b.name, branchUsername: b.username,
    amount, account, method, status: 'pending', reply: '',
    qrcode: method === 'wechat' ? pa.qrcode : '',
    createdAt: util.now(), handledAt: 0, handledBy: ''
  };
  d.withdrawals.push(w);
  d.branchBalanceLogs.push({
    id: util.nextId('branchBalanceLogs'), branchId: b.id,
    change: 0, balance: Math.round((b.balance || 0) * 100) / 100, type: 'withdraw_pending',
    desc: `申请提现 ¥${amount.toFixed(2)}（待审核，冻结中）`, relatedId: w.id, createdAt: util.now()
  });
  db.save();
  db.flushNow(); // 提现申请立即落盘
  res.json(util.ok({ id: w.id, msg: '提现申请已提交，等待管理员审核' }));
});

/** 取消提现申请 */
router.post('/withdrawals/:id/cancel', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const id = Number(req.params.id);
  const d = db.load();
  const w = d.withdrawals.find((x) => x.id === id && x.branchId === b.id);
  if (!w) return res.json(util.fail('提现记录不存在'));
  if (w.status !== 'pending') return res.json(util.fail('当前状态不可取消'));
  w.status = 'cancelled';
  w.reply = '用户取消';
  db.save();
  res.json(util.ok({ msg: '已取消提现申请' }));
});

/* =============== 分站商品管理（可上架总站商品，价格不得低于上级同款） =============== */

/** 逐级上溯查找上级同款商品价格（父站同款 → 总站价） */
function findParentPrice(d, sourceId, branch) {
  let pid = branch.parentId;
  while (pid !== undefined && pid !== null) {
    if (pid === 0) {
      const t = d.products.find((x) => (!x.branchId || x.branchId === 0) && x.id === Number(sourceId));
      return t ? t.price : null;
    }
    const owner = d.branches.find((x) => x.id === pid);
    if (!owner) return null;
    const t = d.products.find((x) => x.branchId === owner.id && x.sourceId === Number(sourceId) && x.status === 1);
    if (t) return t.price;
    pid = owner.parentId;
  }
  return null;
}

/** 我的商品列表 */
router.get('/products', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  const list = d.products
    .filter((x) => x.branchId === b.id)
    .map((x) => ({
      id: x.id, name: x.name, subtitle: x.subtitle || '', price: x.price,
      originalPrice: x.originalPrice || 0, images: x.images || [], type: x.type,
      stock: x.stock || 0, sales: x.sales || 0, status: x.status, sourceId: x.sourceId || 0,
      floor: findParentPrice(d, x.sourceId, b),
      createdAt: x.createdAt
    }))
    .sort((a, b2) => b2.id - a.id);
  res.json(util.ok(list));
});

/** 总站可上架商品（目录） */
router.get('/catalog', auth.requireBranchOrUser, (req, res) => {
  const d = db.load();
  const list = d.products
    .filter((x) => (!x.branchId || (!x.branchId || x.branchId === 0)) && x.status === 1)
    .map((x) => ({
      id: x.id, name: x.name, subtitle: x.subtitle || '', price: x.price, images: x.images || [],
      stock: x.type === 'auto'
        ? d.cards.filter((c) => c.productId === x.id && c.status === 'unused').length
        : (x.stock || 0)
    }))
    .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
  res.json(util.ok(list));
});

/** 上架总站商品（复制到本分站；价格不能低于上级同款价） */
router.post('/products', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const { sourceId, price } = req.body || {};
  const sid = Number(sourceId);
  if (!sid) return res.json(util.fail('请选择要上架的总站商品'));
  const d = db.load();
  const src = d.products.find((x) => x.id === sid && (!x.branchId || (!x.branchId || x.branchId === 0)) && x.status === 1);
  if (!src) return res.json(util.fail('总站商品不存在或已下架'));
  if (d.products.some((x) => x.branchId === b.id && x.sourceId === sid)) return res.json(util.fail('该商品已在您的分站上架'));
  const floor = findParentPrice(d, sid, b);
  const min = floor === null ? src.price : floor;
  let p = price === undefined || price === '' ? src.price : Number(price);
  if (!isFinite(p) || p <= 0) return res.json(util.fail('价格无效'));
  if (p < min) return res.json(util.fail('价格不能低于上级同款价格 ¥' + min));
  // 分站商品为手动发货，库存按源商品当前可售库存复制
  const srcStock = src.type === 'auto'
    ? d.cards.filter((c) => c.productId === src.id && c.status === 'unused').length
    : (src.stock || 0);
  const np = {
    id: util.nextId('products'),
    categoryId: src.categoryId,
    name: src.name,
    subtitle: src.subtitle || '',
    price: Math.round(p * 100) / 100,
    originalPrice: src.originalPrice || 0,
    images: src.images || [],
    type: 'manual',          // 分站商品统一手动发货（卡密由分站自行处理）
    stock: srcStock,
    detail: src.detail || '',
    isHot: false,
    sort: 0,
    status: 1,
    keywords: src.keywords || '',
    cardNote: src.cardNote || '',
    branchId: b.id,
    sourceId: sid,
    costPrice: min,          // 成本价 = 上级同款价（差价 = 售价 - 成本，计入分站余额）
    floorPrice: min,         // 价格下限快照
    sales: 0,
    createdAt: util.now()
  };
  d.products.push(np);
  db.save();
  res.json(util.ok({ id: np.id, price: np.price, floor: min }));
});

/** 修改分站商品价格/上下架（价格不能低于上级同款价） */
router.put('/products/:id', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const id = Number(req.params.id);
  const d = db.load();
  const p = d.products.find((x) => x.id === id && x.branchId === b.id);
  if (!p) return res.json(util.fail('商品不存在'));
  if (req.body && req.body.price !== undefined) {
    const price = Number(req.body.price);
    if (!isFinite(price) || price <= 0) return res.json(util.fail('价格无效'));
    const floor = findParentPrice(d, p.sourceId, b);
    const src = d.products.find((x) => x.id === p.sourceId && (!x.branchId || x.branchId === 0));
    // 下限 = 实时上级同款价（存在时）→ 否则用已固化快照 floorPrice（源商品删除/上级变更后约束仍生效）
    const min = floor === null
      ? (p.floorPrice !== undefined && p.floorPrice !== null ? p.floorPrice : (src ? src.price : price))
      : floor;
    if (price < min) return res.json(util.fail('价格不能低于上级同款价格 ¥' + min));
    p.price = Math.round(price * 100) / 100;
    p.floorPrice = min;
  }
  if (req.body && req.body.status !== undefined) {
    p.status = req.body.status === 1 ? 1 : 0;
  }
  db.save();
  const floorNow = findParentPrice(d, p.sourceId, b);
  res.json(util.ok({ price: p.price, status: p.status, floor: floorNow === null ? p.floorPrice : floorNow }));
});

/** 删除分站商品（有进行中订单时禁止删除） */
router.delete('/products/:id', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const id = Number(req.params.id);
  const d = db.load();
  const p = d.products.find((x) => x.id === id && x.branchId === b.id);
  if (!p) return res.json(util.fail('商品不存在'));
  if (d.orders.some((o) => o.branchId === b.id && ['pending', 'paid', 'shipped'].includes(o.status) && o.goods.some((g) => g.productId === p.id))) {
    return res.json(util.fail('该商品存在进行中的订单，无法删除，请先处理订单'));
  }
  d.products = d.products.filter((x) => x.id !== id);
  db.save();
  res.json(util.ok({}));
});

/** 一键同步：从总站源商品同步名称/图片/详情等展示字段（价格保持分站设置） */
router.post('/sync-products', auth.requireBranchOrUser, (req, res) => {
  const b = req.branch;
  const d = db.load();
  let changed = 0;
  d.products.filter((x) => x.branchId === b.id && x.sourceId).forEach((p) => {
    const src = d.products.find((x) => x.id === p.sourceId && (!x.branchId || x.branchId === 0));
    if (!src) return;
    p.name = src.name;
    p.subtitle = src.subtitle || '';
    p.images = src.images || [];
    p.detail = src.detail || '';
    p.keywords = src.keywords || '';
    p.cardNote = src.cardNote || '';
    // 同步时刷新价格下限快照（上级同款价或总站价），防止源商品后续删除后约束失效
    const floor = findParentPrice(d, p.sourceId, b);
    if (floor !== null) {
      p.floorPrice = floor;
      p.costPrice = floor;
    } else if (p.floorPrice === undefined || p.floorPrice === null) {
      p.floorPrice = src.price;
      p.costPrice = src.price;
    }
    changed++;
  });
  db.save();
  res.json(util.ok({ changed, msg: changed ? `已同步 ${changed} 个商品` : '无需同步' }));
});

module.exports = router;
