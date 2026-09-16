/**
 * routes/user.js - 用户中心接口（需登录）
 * 资料 / 地址 / 收藏 / 购物车 / 优惠券 / 订单 / 支付 / 卡密 / 售后 / 消息 / 积分 / 工单 / 客服对话
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const util = require('../util');
const shop = require('./shop');
const settle = require('../settle');
const payments = require('../payments');
const xunhu = require('../xunhu');
const branchSign = require('../branch-sign');

/* ================= 资料 ================= */

router.get('/profile', auth.requireUser, (req, res) => {
  res.json(util.ok({
    id: req.user.id, phone: req.user.phone, email: req.user.email || '',
    nickname: req.user.nickname, avatar: req.user.avatar,
    gender: req.user.gender || '', birthday: req.user.birthday || '',
    points: req.user.points || 0, level: req.user.level || 1,
    levelName: req.user.levelName || '普通会员',
    totalSpend: req.user.totalSpend || 0, isThird: !!req.user.isThird,
    createdAt: req.user.createdAt
  }));
});

/* ================= 收货地址 ================= */

router.get('/addresses', auth.requireUser, (req, res) => {
  const d = db.load();
  const list = d.addresses.filter((a) => a.userId === req.user.id).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  res.json(util.ok(list));
});

router.post('/addresses', auth.requireUser, (req, res) => {
  const { name, phone, region, detail, isDefault } = req.body || {};
  if (!name || !phone || !region || !detail) return res.json(util.fail('请填写完整的收货信息'));
  const d = db.load();
  if (isDefault || d.addresses.filter((a) => a.userId === req.user.id).length === 0) {
    d.addresses.forEach((a) => { if (a.userId === req.user.id) a.isDefault = 0; });
  }
  const addr = {
    id: util.nextId('addresses'), userId: req.user.id,
    name, phone, region, detail,
    isDefault: isDefault ? 1 : (d.addresses.filter((a) => a.userId === req.user.id).length === 0 ? 1 : 0),
    createdAt: util.now()
  };
  d.addresses.push(addr);
  db.save();
  res.json(util.ok(addr));
});

router.put('/addresses/:id', auth.requireUser, (req, res) => {
  const { name, phone, region, detail, isDefault } = req.body || {};
  const d = db.load();
  const a = d.addresses.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!a) return res.json(util.fail('地址不存在'));
  if (name) a.name = name;
  if (phone) a.phone = phone;
  if (region) a.region = region;
  if (detail) a.detail = detail;
  if (isDefault) {
    d.addresses.forEach((x) => { if (x.userId === req.user.id) x.isDefault = 0; });
    a.isDefault = 1;
  }
  db.save();
  res.json(util.ok(a));
});

router.delete('/addresses/:id', auth.requireUser, (req, res) => {
  const d = db.load();
  const idx = d.addresses.findIndex((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (idx < 0) return res.json(util.fail('地址不存在'));
  const [removed] = d.addresses.splice(idx, 1);
  if (removed.isDefault && d.addresses.some((x) => x.userId === req.user.id)) {
    d.addresses.find((x) => x.userId === req.user.id).isDefault = 1;
  }
  db.save();
  res.json(util.ok({ msg: '已删除' }));
});

router.put('/addresses/:id/default', auth.requireUser, (req, res) => {
  const d = db.load();
  const a = d.addresses.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!a) return res.json(util.fail('地址不存在'));
  d.addresses.forEach((x) => { if (x.userId === req.user.id) x.isDefault = 0; });
  a.isDefault = 1;
  db.save();
  res.json(util.ok(a));
});

/* ================= 收藏 ================= */

router.get('/favorites', auth.requireUser, (req, res) => {
  const d = db.load();
  const list = d.favorites
    .filter((f) => f.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((f) => {
      const p = d.products.find((x) => x.id === f.productId);
      return p ? { favId: f.id, product: shop.publicProduct(p, d) } : null;
    })
    .filter(Boolean);
  res.json(util.ok(list));
});

router.post('/favorites/:pid', auth.requireUser, (req, res) => {
  const pid = Number(req.params.pid);
  const d = db.load();
  if (!d.products.some((p) => p.id === pid)) return res.json(util.fail('商品不存在'));
  if (!d.favorites.some((f) => f.userId === req.user.id && f.productId === pid)) {
    d.favorites.push({ id: util.nextId('favorites'), userId: req.user.id, productId: pid, createdAt: util.now() });
    db.save();
  }
  res.json(util.ok({ favorited: true }));
});

router.delete('/favorites/:pid', auth.requireUser, (req, res) => {
  const pid = Number(req.params.pid);
  db.mutate((d) => {
    d.favorites = d.favorites.filter((f) => !(f.userId === req.user.id && f.productId === pid));
  });
  res.json(util.ok({ favorited: false }));
});

/* ================= 购物车 ================= */

router.get('/cart', auth.requireUser, (req, res) => {
  const d = db.load();
  const items = d.cart
    .filter((c) => c.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => {
      const p = d.products.find((x) => x.id === c.productId);
      return p ? { ...c, product: shop.publicProduct(p, d) } : null;
    })
    .filter(Boolean);
  res.json(util.ok(items));
});

router.post('/cart', auth.requireUser, (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const d = db.load();
  const p = d.products.find((x) => x.id === Number(productId));
  if (!p || p.status === 0) return res.json(util.fail('商品不存在或已下架'));
  const q = Math.max(1, Math.min(999, parseInt(quantity) || 1));
  if (q > shop.stockOf(p, d)) return res.json(util.fail('库存不足'));
  const exist = d.cart.find((c) => c.userId === req.user.id && c.productId === p.id);
  if (exist) {
    exist.quantity = Math.min(exist.quantity + q, 999);
    exist.checked = 1;
  } else {
    d.cart.push({
      id: util.nextId('cart'), userId: req.user.id, productId: p.id,
      quantity: q, checked: 1, createdAt: util.now()
    });
  }
  db.save();
  res.json(util.ok({ msg: '已加入购物车', cartCount: d.cart.filter((c) => c.userId === req.user.id).length }));
});

router.put('/cart/check-all', auth.requireUser, (req, res) => {
  const { checked } = req.body || {};
  db.mutate((d) => {
    d.cart.forEach((c) => { if (c.userId === req.user.id) c.checked = checked ? 1 : 0; });
  });
  res.json(util.ok({ msg: 'ok' }));
});

router.put('/cart/:id', auth.requireUser, (req, res) => {
  const { quantity, checked } = req.body || {};
  const d = db.load();
  const c = d.cart.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!c) return res.json(util.fail('购物车项不存在'));
  const p = d.products.find((x) => x.id === c.productId);
  if (quantity !== undefined) {
    const q = Math.max(1, Math.min(999, parseInt(quantity) || 1));
    if (p && q > shop.stockOf(p, d)) return res.json(util.fail('库存不足'));
    c.quantity = q;
  }
  if (checked !== undefined) c.checked = checked ? 1 : 0;
  db.save();
  res.json(util.ok(c));
});

router.delete('/cart/checked', auth.requireUser, (req, res) => {
  db.mutate((d) => {
    d.cart = d.cart.filter((x) => !(x.userId === req.user.id && x.checked));
  });
  res.json(util.ok({ msg: '已删除' }));
});

router.delete('/cart/:id', auth.requireUser, (req, res) => {
  db.mutate((d) => {
    d.cart = d.cart.filter((x) => !(x.id === Number(req.params.id) && x.userId === req.user.id));
  });
  res.json(util.ok({ msg: '已删除' }));
});

/* ================= 优惠券 ================= */

/** 我的优惠券 */
router.get('/coupons', auth.requireUser, (req, res) => {
  const d = db.load();
  const t = util.now();
  const list = d.userCoupons
    .filter((uc) => uc.userId === req.user.id)
    .map((uc) => {
      const c = d.coupons.find((x) => x.id === uc.couponId);
      if (!c) return null;
      let status = uc.status;
      if (status === 'unused' && c.endAt < t) status = 'expired';
      return { id: uc.id, couponId: c.id, name: c.name, type: c.type, threshold: c.threshold, amount: c.amount, discount: c.discount, endAt: c.endAt, startAt: c.startAt, status, claimedAt: uc.claimedAt, usedAt: uc.usedAt };
    })
    .filter(Boolean);
  res.json(util.ok(list));
});

/** 领取优惠券 */
router.post('/coupons/claim/:couponId', auth.requireUser, (req, res) => {
  const d = db.load();
  const c = d.coupons.find((x) => x.id === Number(req.params.couponId));
  if (!c || c.status !== 1) return res.json(util.fail('优惠券不存在'));
  const t = util.now();
  if (c.startAt > t || c.endAt < t) return res.json(util.fail('不在领取时间范围内'));
  if (c.claimed >= c.total) return res.json(util.fail('已抢光'));
  if (d.userCoupons.some((uc) => uc.userId === req.user.id && uc.couponId === c.id && uc.status === 'unused')) {
    return res.json(util.fail('你已领取过该优惠券'));
  }
  // 积分兑换型优惠券
  if (c.pointsCost > 0) {
    if ((req.user.points || 0) < c.pointsCost) return res.json(util.fail('积分不足'));
    req.user.points -= c.pointsCost;
    d.pointsLogs.push({
      id: util.nextId('pointsLogs'), userId: req.user.id, change: -c.pointsCost,
      balance: req.user.points, type: 'spend', desc: '积分兑换「' + c.name + '」', createdAt: t
    });
  }
  c.claimed = (c.claimed || 0) + 1;
  d.userCoupons.push({
    id: util.nextId('userCoupons'), couponId: c.id, userId: req.user.id,
    status: 'unused', claimedAt: t, usedAt: 0, orderId: 0
  });
  // 即将到期提醒
  if (c.endAt - t <= 3 * 86400) {
    d.messages.push({
      id: util.nextId('messages'), userId: req.user.id, type: 'activity',
      title: '优惠券即将到期', content: `您领取的「${c.name}」将于 ${fmtDate(c.endAt)} 到期，请尽快使用。`,
      isRead: 0, createdAt: t
    });
  }
  db.save();
  res.json(util.ok({ msg: '领取成功' }));
});

function fmtDate(ts) {
  const t = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/* ================= 订单 ================= */

/* ---------- 下单并发控制（BUG-001 修复：防并发超卖）----------
   进程内串行锁：同一时刻只允许一个下单事务执行「库存校验 + 订单创建」，
   配合 calcOrder 内的「未付款订单库存占用」校验，保证库存=1 的商品在高并发下也只成一单。
   说明：本系统数据在内存中同步读改写，锁内临界区天然原子；锁主要用于杜绝未来引入异步
   （Mongo 实时读写等）后出现的检查-扣减竞态。多实例部署需改用 Redis 等分布式锁。 */
let orderChain = Promise.resolve();
function withOrderLock(task) {
  const run = orderChain.then(() => task());
  orderChain = run.then(() => {}, () => {}); // 成败都续链，避免一次异常导致后续永久挂起
  return run;
}

/** 某商品被「待付款 / 待确认收款」订单占用的数量（已下单未最终成交，需预留库存） */
function pendingOccupiedQty(d, productId, excludeOrderId) {
  let n = 0;
  for (const o of d.orders) {
    if (o.status !== 'pending' && o.status !== 'pending_confirm') continue;
    if (excludeOrderId && o.id === excludeOrderId) continue;
    for (const g of (o.goods || [])) {
      if (g.productId === productId) n += g.quantity;
    }
  }
  return n;
}

/** 结算前试算（前端也可自行计算，这里供校验用） */
function calcOrder(d, items, coupon) {
  let goodsAmount = 0;
  const goods = [];
  for (const it of items) {
    const p = d.products.find((x) => x.id === it.productId);
    if (!p || p.status === 0) return { error: '部分商品已下架' };
    // 数量硬上限：1 ≤ qty ≤ min(库存-未付款占用, 999)，防 URL 手改绕过前端限制
    const q = it.quantity;
    if (!Number.isInteger(q) || q < 1 || q > 999) return { error: '购买数量不合法' };
    // BUG-001：可售量需扣除其它未付款订单已占用的部分，防止并发/连续下单超卖
    const available = shop.stockOf(p, d) - pendingOccupiedQty(d, p.id);
    if (q > available) return { error: `「${p.name}」库存不足` };
    goodsAmount += p.price * q;
    goods.push({
      productId: p.id, name: p.name, subtitle: p.subtitle || '', image: (p.images || [])[0] || '/img/placeholder.svg',
      price: p.price, quantity: q, type: p.type,
      branchId: p.branchId || 0,
      costPrice: (p.costPrice !== undefined && p.costPrice !== null && p.costPrice > 0) ? p.costPrice : p.price
    });
  }
  let couponAmount = 0;
  let usedCouponId = 0;
  if (coupon) {
    const valid = coupon.type === 'fullcut'
      ? goodsAmount >= coupon.threshold
      : goodsAmount >= (coupon.threshold || 0);
    if (!valid) return { error: '优惠券不满足使用条件' };
    usedCouponId = coupon.id;
    couponAmount = coupon.type === 'fullcut'
      ? Math.min(coupon.amount, goodsAmount)
      : Math.round(goodsAmount * (1 - coupon.discount) * 100) / 100;
  }
  const payAmount = Math.max(0, Math.round((goodsAmount - couponAmount) * 100) / 100);
  return { goodsAmount: Math.round(goodsAmount * 100) / 100, couponAmount, payAmount, goods, usedCouponId };
}

/** 创建订单：from=cart（购物车勾选项）或 buynow（直接购买） */
router.post('/orders', auth.requireUser, (req, res) => {
  const { from = 'cart', cartIds = [], productId, quantity = 1, addressId, couponId, remark } = req.body || {};

  // —— 锁外参数校验（不依赖共享数据）——
  const d0 = db.load();
  const addr0 = d0.addresses.find((a) => a.id === Number(addressId) && a.userId === req.user.id);
  if (!addr0) return res.json(util.fail('请选择收货地址'));

  // BUG-003 / BUG-004：buynow 数量必须是 1-999 的整数，负数 / 0 / 非数字 / 超限一律拒绝，
  // 不再用 Math.max(1, parseInt(q)||1) 静默钳制，避免业务歧义和异常订单。
  let buyItems = null;
  if (from === 'buynow') {
    const rawQty = parseInt(quantity, 10);
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999) {
      return res.json(util.fail('购买数量不合法（需为 1-999 的整数）'));
    }
    buyItems = [{ productId: Number(productId), quantity: rawQty }];
  } else {
    const ids = (Array.isArray(cartIds) ? cartIds : []).map(Number);
    if (!ids.length) return res.json(util.fail('请选择要结算的商品'));
  }

  // —— 锁内事务：库存校验（含未付款占用）+ 订单创建，串行化杜绝并发超卖（BUG-001）——
  withOrderLock(() => {
    const d = db.load();
    const addr = d.addresses.find((a) => a.id === Number(addressId) && a.userId === req.user.id);
    if (!addr) return { error: '请选择收货地址' };

    // 锁内重新读取购物车条目（防止锁外快照过期）
    let items;
    if (from === 'buynow') {
      items = buyItems;
    } else {
      const ids = (Array.isArray(cartIds) ? cartIds : []).map(Number);
      items = d.cart
        .filter((c) => c.userId === req.user.id && ids.includes(c.id))
        .map((c) => ({ productId: c.productId, quantity: c.quantity }));
      if (!items.length) return { error: '购物车商品不存在' };
    }

    // 优惠券（锁内读取最新状态，避免并发重复占用）
    let coupon = null;
    if (couponId) {
      const uc = d.userCoupons.find((x) => x.id === Number(couponId) && x.userId === req.user.id && x.status === 'unused');
      if (!uc) return { error: '优惠券不可用' };
      coupon = d.coupons.find((x) => x.id === uc.couponId);
    }

    const calc = calcOrder(d, items, coupon);
    if (calc.error) return { error: calc.error };
    if (!isFinite(calc.payAmount) || calc.payAmount < 0) return { error: '订单金额异常，请联系客服' };

    const order = {
      id: util.nextId('orders'),
      orderNo: util.genOrderNo(),
      userId: req.user.id,
      branchId: calc.goods.find((g) => g.branchId) ? calc.goods.find((g) => g.branchId).branchId : 0,
      branchIds: Array.from(new Set(calc.goods.map((g) => g.branchId || 0).filter((x) => x > 0))),
      goods: calc.goods,
      goodsAmount: calc.goodsAmount,
      couponId: calc.usedCouponId,
      couponAmount: calc.couponAmount,
      payAmount: calc.payAmount,
      address: { name: addr.name, phone: addr.phone, region: addr.region, detail: addr.detail },
      remark: util.sanitizeHtml(remark).slice(0, 200),
      status: 'pending',       // pending/paid/shipped/completed/cancelled/refunded
      payMethod: '', payChannel: '', payAt: 0,
      shippedAt: 0, completedAt: 0, cancelledAt: 0,
      cancelReason: '',
      trackingNo: '', logistics: '',
      cardsDelivered: 0,
      createdAt: util.now()
    };
    d.orders.push(order);

    // 占用优惠券
    if (coupon) {
      const uc = d.userCoupons.find((x) => x.id === Number(couponId) && x.userId === req.user.id && x.status === 'unused');
      if (uc) { uc.status = 'used'; uc.orderId = order.id; uc.usedAt = util.now(); }
    }

    // 购物车来源：移除已结算项
    if (from !== 'buynow') {
      d.cart = d.cart.filter((c) => !(c.userId === req.user.id && (Array.isArray(cartIds) ? cartIds : []).map(Number).includes(c.id)));
    }

    db.save();
    return { ok: { orderId: order.id, payAmount: order.payAmount, orderNo: order.orderNo } };
  }).then((r) => {
    if (!r || r.error) return res.json(util.fail((r && r.error) || '下单失败，请稍后重试'));
    res.json(util.ok(r.ok));
  }).catch((e) => {
    console.error('[order] 创建订单失败:', e.message);
    try { require('../logger').error('order-create', e); } catch (e2) { /* 忽略 */ }
    res.json(util.fail('下单失败，请稍后重试'));
  });
});

/** 自动处理超时订单（挂起 30 分钟自动取消 / 发货 7 天自动确认） */
function autoProcessOrders(d) {
  const t = util.now();
  const settings = d.settings;
  const cancelAfter = (settings.pendingCancelMinutes || 30) * 60;
  const confirmAfter = (settings.autoConfirmDays || 7) * 86400;
  let changed = false;
  for (const o of d.orders) {
    if (o.status === 'pending' && t - o.createdAt > cancelAfter) {
      o.status = 'cancelled';
      o.cancelledAt = t;
      o.cancelReason = '超时未支付，系统自动取消';
      releaseCoupon(d, o);
      changed = true;
    } else if (o.status === 'shipped' && o.shippedAt && t - o.shippedAt > confirmAfter) {
      o.status = 'completed';
      o.completedAt = t;
      changed = true;
    }
  }
  if (changed) db.save();
}

function releaseCoupon(d, order) {
  if (order.couponId) {
    const uc = d.userCoupons.find((x) => x.orderId === order.id && x.userId === order.userId && x.status === 'used');
    if (uc) { uc.status = 'unused'; uc.orderId = 0; uc.usedAt = 0; }
  }
}

/** 订单列表 */
router.get('/orders', auth.requireUser, (req, res) => {
  const d = db.load();
  autoProcessOrders(d);
  const { status, page = 1, size = 10 } = req.query;
  let list = d.orders.filter((o) => o.userId === req.user.id);
  if (status && status !== 'all') list = list.filter((o) => o.status === status);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const pg = util.paginate(list, page, size);
  pg.list = pg.list.map(orderView);
  res.json(util.ok(pg));
});

/** 订单详情 */
router.get('/orders/:id', auth.requireUser, (req, res) => {
  const d = db.load();
  autoProcessOrders(d);
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  res.json(util.ok(orderView(o)));
});

/** 订单视图（含卡密摘要） */
function orderView(o) {
  const d = db.load();
  const cards = d.cards.filter((c) => c.orderId === o.id);
  return {
    ...o,
    cards: cards.map((c) => ({ code: c.code, secret: c.secret, status: c.status }))
  };
}

/** 支付（本地模拟微信/支付宝支付，支付成功自动发卡） */
router.post('/orders/:id/pay', auth.requireUser, async (req, res) => {
  const { method = 'wechat' } = req.body || {};
  const d = db.load();
  autoProcessOrders(d);
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'pending') return res.json(util.fail('订单状态已变化，无法支付'));

  // 手动转账支付（显示收款码，用户付款后待商家确认）
  if (method === 'manual') {
    const s = d.settings || {};
    if (!s.manualPayEnabled) {
      return res.json(util.fail('手动转账支付未开启，请联系管理员'));
    }
    o.payChannel = 'manual';
    o.status = 'pending_confirm';
    o.pendingConfirmAt = util.now();
    const { payProof } = req.body || {};
    if (payProof) o.payProof = String(payProof).slice(0, 500);
    db.save();
    return res.json(util.ok({
      orderId: o.id,
      payMode: 'manual',
      status: 'pending_confirm',
      wechatQrcode: s.wechatQrcode || '',
      alipayQrcode: s.alipayQrcode || '',
      payNotice: s.payNotice || ''
    }));
  }

  // 虎皮椒支付（个人码支付，云端监听）
  if (method === 'xunhu_wechat' || method === 'xunhu_alipay') {
    if (xunhu.configured()) {
      try {
        o.payChannel = method;
        db.save();
        const pay = await xunhu.createPayment(o, method === 'xunhu_wechat' ? 'wechat' : 'alipay', req);
        return res.json(util.ok({ orderId: o.id, payMode: 'qrcode', channel: method, ...pay }));
      } catch (e) {
        // 下单失败返回错误，禁止回退模拟支付（防白嫖）
        console.error('[pay] 虎皮椒下单失败:', e.message);
        return res.json(util.fail('支付下单失败，请稍后重试或更换支付方式'));
      }
    }
  }

  // 渠道已配置真实商户参数 → 走真实支付下单
  if (payments.configured(method)) {
    try {
      o.payChannel = method;
      db.save();
      const pay = await payments.createPayment(o, method, req);
      return res.json(util.ok({ orderId: o.id, payMode: 'online', channel: method, ...pay }));
    } catch (e) {
      // 下单失败返回错误，禁止回退模拟支付（防白嫖）
      console.error('[pay] 真实支付下单失败:', e.message);
      return res.json(util.fail('支付下单失败，请稍后重试或更换支付方式'));
    }
  }

  // 模拟支付：仅当沙箱模式开启时允许（立即结算并发卡）
  const s = d.settings || {};
  if (s.paySandbox !== true) {
    return res.json(util.fail('支付未配置（沙箱模式已关闭），请联系管理员'));
  }
  o.payChannel = method;
  db.save();
  const r = settle.settlePaidOrder(d, o, method);
  if (!r.ok) return res.json(util.fail(r.error));
  res.json(util.ok({ orderId: o.id, payMode: 'mock', status: r.status, autoShipped: r.autoShipped, cardsDelivered: r.cardsDelivered }));
});

/** 取消订单 */
router.post('/orders/:id/cancel', auth.requireUser, (req, res) => {
  const { reason = '用户主动取消' } = req.body || {};
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (!['pending', 'pending_confirm'].includes(o.status)) return res.json(util.fail('当前状态不可取消'));
  o.status = 'cancelled';
  o.cancelledAt = util.now();
  o.cancelReason = util.sanitizeHtml(reason).slice(0, 200);
  releaseCoupon(d, o);
  db.save();
  res.json(util.ok({ msg: '订单已取消' }));
});

/** 上传付款凭证（手动转账） */
router.post('/orders/:id/pay-proof', auth.requireUser, (req, res) => {
  const { payProof } = req.body || {};
  if (!payProof) return res.json(util.fail('请上传付款截图'));
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'pending_confirm') return res.json(util.fail('当前状态不可上传凭证'));
  o.payProof = String(payProof).slice(0, 500);
  o.payProofAt = util.now();
  db.save();
  res.json(util.ok({ msg: '凭证已上传，等待商家确认' }));
});

/** 确认收货 */
router.post('/orders/:id/confirm', auth.requireUser, (req, res) => {
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'shipped') return res.json(util.fail('当前状态不可确认收货'));
  o.status = 'completed';
  o.completedAt = util.now();
  db.save();
  res.json(util.ok({ msg: '已确认收货' }));
});

/* ================= 售后 ================= */

/** 我的售后列表 */
router.get('/aftersales', auth.requireUser, (req, res) => {
  const d = db.load();
  const list = d.aftersales
    .filter((a) => a.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => {
      const o = d.orders.find((x) => x.id === a.orderId);
      return { ...a, order: o ? { id: o.id, orderNo: o.orderNo, goods: o.goods } : null };
    });
  res.json(util.ok(list));
});

/** 提交售后申请 */
router.post('/orders/:id/aftersale', auth.requireUser, (req, res) => {
  const { type = 'refund', reason, images = [] } = req.body || {};
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (!['paid', 'shipped', 'completed'].includes(o.status)) return res.json(util.fail('当前订单状态不可申请售后'));
  // 去重：同一订单仅允许一条售后记录（处理中/已同意/已驳回均不可重复提交；已退款订单无需再申请）
  if (d.aftersales.some((a) => a.orderId === o.id)) {
    return res.json(util.fail('该订单已提交过售后申请，请勿重复提交'));
  }
  if (o.status === 'refunded') return res.json(util.fail('该订单已退款，无需再申请售后'));
  if (!reason) return res.json(util.fail('请填写售后原因'));
  const af = {
    id: util.nextId('aftersales'), orderId: o.id, userId: req.user.id,
    type: type === 'return' ? 'return' : 'refund',
    reason: util.sanitizeHtml(reason).slice(0, 200), images: (Array.isArray(images) ? images : []).slice(0, 6),
    amount: o.payAmount,
    status: 'pending', reply: '', createdAt: util.now(), handledAt: 0
  };
  d.aftersales.push(af);
  db.save();
  res.json(util.ok({ aftersaleId: af.id, msg: '售后申请已提交，请等待处理' }));
});

/* ================= 消息 ================= */

router.get('/messages', auth.requireUser, (req, res) => {
  const d = db.load();
  const { type = 'all', page = 1, size = 20 } = req.query;
  let list = d.messages.filter((m) => m.userId === req.user.id);
  if (type !== 'all') list = list.filter((m) => m.type === type);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok(util.paginate(list, page, size)));
});

router.get('/messages/unread-count', auth.requireUser, (req, res) => {
  const d = db.load();
  const count = d.messages.filter((m) => m.userId === req.user.id && !m.isRead).length;
  res.json(util.ok({ count }));
});

router.post('/messages/:id/read', auth.requireUser, (req, res) => {
  const d = db.load();
  const m = d.messages.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (m) { m.isRead = 1; db.save(); }
  res.json(util.ok({ msg: 'ok' }));
});

router.post('/messages/read-all', auth.requireUser, (req, res) => {
  db.mutate((d) => {
    d.messages.forEach((m) => { if (m.userId === req.user.id) m.isRead = 1; });
  });
  res.json(util.ok({ msg: 'ok' }));
});

/* ================= 积分 ================= */

router.get('/points-logs', auth.requireUser, (req, res) => {
  const d = db.load();
  const { page = 1, size = 20 } = req.query;
  const list = d.pointsLogs
    .filter((p) => p.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok({ ...util.paginate(list, page, size), balance: req.user.points || 0 }));
});

/** 积分兑换余额 */
router.post('/points/exchange', auth.requireUser, async (req, res) => {
  const { points } = req.body || {};
  const pts = parseInt(points);
  if (!pts || pts <= 0) return res.json(util.fail('请输入有效的积分数量'));
  if (pts % 100 !== 0) return res.json(util.fail('积分需为100的整数倍'));
  const d = db.load();
  const s = d.settings || {};
  const rate = s.pointsExchangeRate || 100;
  if (req.user.points < pts) return res.json(util.fail('积分不足，当前 ' + req.user.points + ' 积分'));
  const amount = Math.round((pts / rate) * 100) / 100;
  if (amount <= 0) return res.json(util.fail('兑换金额无效'));
  req.user.points -= pts;
  req.user.balance = Math.round(((req.user.balance || 0) + amount) * 100) / 100;
  d.pointsLogs.push({
    id: util.nextId('pointsLogs'), userId: req.user.id, change: -pts,
    balance: req.user.points, type: 'exchange', desc: '积分兑换余额 ' + pts + ' 积分 → ¥' + amount.toFixed(2),
    createdAt: util.now()
  });
  d.balanceLogs = d.balanceLogs || [];
  d.balanceLogs.push({
    id: util.nextId('balanceLogs'), userId: req.user.id, change: amount,
    balance: req.user.balance, type: 'exchange', desc: '积分兑换余额 ' + pts + ' 积分 → ¥' + amount.toFixed(2),
    createdAt: util.now()
  });
  db.save();
  await db.flushNow(); // 积分兑换立即落盘，防止serverless环境丢失
  res.json(util.ok({ points: req.user.points, balance: req.user.balance, amount, msg: '兑换成功，' + pts + ' 积分 → ¥' + amount.toFixed(2) }));
});

/* ================= 工单 ================= */

router.get('/tickets', auth.requireUser, (req, res) => {
  const d = db.load();
  const list = d.tickets
    .filter((t) => t.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok(list));
});

router.post('/tickets', auth.requireUser, (req, res) => {
  const { type, description, images = [] } = req.body || {};
  if (!type || !description) return res.json(util.fail('请填写问题类型与描述'));
  const t = {
    id: util.nextId('tickets'), userId: req.user.id, type,
    description: util.sanitizeHtml(description).slice(0, 500), images: (Array.isArray(images) ? images : []).slice(0, 6),
    status: 'open', reply: '', createdAt: util.now(), updatedAt: util.now()
  };
  db.mutate((d) => d.tickets.push(t));
  res.json(util.ok({ ticketId: t.id, msg: '工单已提交，我们会尽快处理' }));
});

router.get('/tickets/:id', auth.requireUser, (req, res) => {
  const d = db.load();
  const t = d.tickets.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!t) return res.json(util.fail('工单不存在'));
  res.json(util.ok(t));
});

/* ================= 客服对话 ================= */

/** 我的对话记录 */
router.get('/chat', auth.requireUser, (req, res) => {
  const d = db.load();
  const list = d.chat.filter((c) => c.userId === req.user.id).sort((a, b) => a.createdAt - b.createdAt);
  res.json(util.ok(list));
});

/** 发送消息（规则自动回复） */
router.post('/chat', auth.requireUser, async (req, res) => {
  const { content } = req.body || {};
  const msg = util.sanitizeHtml(String(content || '')).trim();
  if (!msg) return res.json(util.fail('消息不能为空'));
  if (msg.length > 500) return res.json(util.fail('消息过长'));
  const d = db.load();
  const t = util.now();
  d.chat.push({ id: util.nextId('chat'), userId: req.user.id, role: 'user', content: msg, createdAt: t, read: 0 });
  const reply = botReply(msg);
  d.chat.push({ id: util.nextId('chat'), userId: req.user.id, role: 'bot', content: reply, createdAt: t + 1, read: 1 });
  db.save();
  await db.flushNow(); // 聊天记录立即落盘
  res.json(util.ok({ reply, replyRole: 'bot' }));
});

/** 规则自动回复 */
function botReply(msg) {
  const m = msg.toLowerCase();
  if (/(人工|转接|客服人员|真人)/.test(m)) return '已为您转接人工客服，请稍候。您也可以提交工单，我们会尽快跟进处理。';
  if (/(卡密|发货|没收到|没到|怎么用|如何查看)/.test(m)) return '本站商品多为自动发货：付款成功后，卡密会立即发放，请到「我的订单-订单详情-卡密信息」中查看并复制使用。若未到账，请提交工单或联系人工客服。';
  if (/(退款|退货|售后|赔偿)/.test(m)) return '如需退款/退货，请在「订单详情-申请售后」中提交申请（仅退款/退货退款），并填写原因与凭证，管理员会在 24 小时内处理。';
  if (/(优惠券|优惠|折扣)/.test(m)) return '您可以在「我的-优惠券」或「领券中心」领取优惠券，结算时选择符合条件的优惠券即可抵扣。';
  if (/(积分|会员|等级|成长)/.test(m)) return '购物实付金额会按比例累计积分与成长值，积分可在积分明细中查看，会员等级随累计消费自动提升。';
  if (/(你好|您好|在吗|hi|hello|hey)/.test(m)) return '您好，欢迎光临！请问有什么可以帮您？您可以咨询发货、卡密、售后、优惠券等问题。';
  if (/(商品|买|价格|怎么购买)/.test(m)) return '选购商品后点击「加入购物车」或「立即购买」，提交订单并完成支付即可，自动发货商品付款后卡密立即到账。';
  return '感谢您的咨询！您可以回复关键词了解：卡密/发货、退款/售后、优惠券、积分/会员。如需人工帮助，请输入「人工客服」。';
}

/* ================= 用户文件上传（售后凭证/头像/工单图） ================= */

router.post('/upload', auth.requireUser, (req, res) => {
  const { data, ext = 'png' } = req.body || {};
  if (!data) return res.json(util.fail('缺少图片数据'));
  const buf = Buffer.from(data, 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.json(util.fail('图片不能超过 3MB'));
  // 魔数嗅探真实类型（防伪装/存储型 XSS），仅允许 jpg/png/gif/webp
  const real = util.detectImageType(buf);
  if (!real) return res.json(util.fail('图片内容与格式不符，仅支持 jpg/png/gif/webp'));
  const fs = require('fs');
  const path = require('path');
  const uploadDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const name = 'u_' + Date.now() + '_' + crypto.randomInt(1000000, 9999999) + '.' + real;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  const url = '/uploads/' + name;
  db.mutate((d) => d.uploads.push({ name, url, userId: req.user.id, createdAt: util.now() }));
  res.json(util.ok({ url }));
});

/* ================= 注销账号 ================= */

router.delete('/account', auth.requireUser, async (req, res) => {
  const uid = req.user.id;
  const { code } = req.body || {};
  const d = db.load();
  // 必须验证绑定邮箱（验证码由 /api/auth/send-email-code-authed?purpose=cancel_account 发送）
  const em = (req.user.email || '').trim().toLowerCase();
  if (!em) return res.json(util.fail('账号未绑定邮箱，无法自助注销，请联系客服'));
  if (!code) return res.json(util.fail('请输入邮箱验证码'));
  const nowT = util.now();
  const rec = (d.emailCodes || []).find((x) => x.email === em && x.scene === 'cancel_account' && String(x.code) === String(code) && x.expiresAt >= nowT);
  if (!rec) return res.json(util.fail('验证码错误或已过期'));
  d.emailCodes = (d.emailCodes || []).filter((x) => x !== rec); // 用后即焚
  if (d.orders.some((o) => o.userId === uid && ['pending', 'paid', 'shipped'].includes(o.status))) {
    return res.json(util.fail('存在进行中的订单，请先处理后再注销'));
  }
  const u = d.users.find((x) => x.id === uid);
  if (!u) return res.json(util.fail('账号不存在'));
  // 软删除：保留订单/售后/对话快照供对账；保留 email 用于登录时识别并提示"已注销"
  u.userDeleted = 1;
  u.status = 0;
  u.deletedAt = nowT;
  u.phone = '';
  u.passwordHash = '';
  u.nickname = '已注销用户' + uid;
  u.avatar = '/img/avatar.svg';
  d.sessions = d.sessions.filter((s) => !(s.userId === uid && s.role === 'user'));
  d.cart = d.cart.filter((c) => c.userId !== uid);
  d.addresses = d.addresses.filter((a) => a.userId !== uid);
  d.favorites = d.favorites.filter((f) => f.userId !== uid);
  d.userCoupons = d.userCoupons.filter((c) => c.userId !== uid);
  db.save();
  await db.flushNow(); // Serverless 下必须落库后再响应
  res.json(util.ok({ msg: '账号已注销' }));
});

/* ================= 分站（分销：余额 + 价格 + 自助开通/加入） ================= */

/** 开通配置：分站价格 + 我的余额 */
router.get('/branch-config', auth.requireUser, (req, res) => {
  const d = db.load();
  const s = d.settings || {};
  res.json(util.ok({
    prices: {
      pro: s.branchProPrice === undefined ? 10 : s.branchProPrice,
      normal: s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice
    },
    balance: req.user.balance || 0
  }));
});

/** 查询当前用户的分站 */
router.get('/my-branch', auth.requireUser, (req, res) => {
  const d = db.load();
  const branch = d.branches.find((b) => b.ownerId === req.user.id);
  if (!branch) return res.json(util.ok(null));
  const parent = branch.parentId ? d.branches.find((x) => x.id === branch.parentId) : null;
  res.json(util.ok({
    id: branch.id, name: branch.name, type: branch.type, username: branch.username,
    status: branch.status, createdAt: branch.createdAt, balance: branch.balance || 0,
    parentName: parent ? parent.name : '超级管理员',
    parentUsername: parent ? parent.username : '',
    pricePro: branch.pricePro === undefined ? (d.settings.branchProPrice === undefined ? 10 : d.settings.branchProPrice) : branch.pricePro,
    priceNormal: branch.priceNormal === undefined ? (d.settings.branchNormalPrice === undefined ? 0 : d.settings.branchNormalPrice) : branch.priceNormal
  }));
});

/** 用户余额流水（统一记录：开通/加入分站、升级补差价、管理员调整、退款等） */
function pushUserBalanceLog(d, userId, change, balance, type, desc, relatedId) {
  d.balanceLogs.push({
    id: util.nextId('balanceLogs'), userId, change, balance,
    type: type || 'other', desc: desc || '', relatedId: relatedId || 0, createdAt: util.now()
  });
}

/** 前端自助开通一级分站（可选普通/专业，余额支付，价格由超级管理员设置） */
router.post('/open-branch', auth.requireUser, async (req, res) => {
  const { name, type } = req.body || {};
  const nm = String(name || '').trim();
  const typ = type === 'normal' ? 'normal' : 'pro';
  if (!nm) return res.json(util.fail('请填写分站名称'));
  // 同账号开通：分站账号 = 注册邮箱，登录分站后台用同一账号密码
  const un = (req.user.email || req.user.phone || '').trim();
  if (!un) return res.json(util.fail('当前账号缺少邮箱，无法开通分站'));
  const d = db.load();
  const s = d.settings || {};
  const proPrice = s.branchProPrice === undefined ? 10 : s.branchProPrice;
  const normalPrice = s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice;
  const price = typ === 'pro' ? proPrice : normalPrice;
  if (d.branches.some((b) => b.ownerId === req.user.id)) return res.json(util.fail('您已开通分站，不能重复开通'));
  if (d.branches.some((b) => b.username === un)) return res.json(util.fail('该账号已开通分站，请直接登录分站后台'));
  const balance = req.user.balance || 0;
  if (balance < price) return res.json(util.fail('余额不足，开通' + (typ === 'pro' ? '专业' : '普通') + '分站需 ¥' + price + '，当前余额 ¥' + balance));
  req.user.balance = Math.round((balance - price) * 100) / 100;
  const branch = {
    id: util.nextId('branches'),
    name: nm.slice(0, 20),
    type: typ,
    parentId: 0,
    username: un.slice(0, 30),
    passwordHash: req.user.passwordHash,
    status: 1,
    note: '同账号自助开通',
    ownerId: req.user.id,
    balance: 0,
    pricePro: proPrice,
    priceNormal: normalPrice,
    createdAt: util.now(), lastLoginAt: 0
  };
  d.branches.push(branch);
  // 用户余额流水（扣款）
  if (price > 0) pushUserBalanceLog(d, req.user.id, -price, req.user.balance, 'branch_open', `开通${typ === 'pro' ? '专业' : '普通'}分站「${nm}」扣款 ¥${price.toFixed(2)}`, branch.id);
  // 平台收入流水（一级开通费）
  if (price > 0) {
    s.platformIncome = Math.round(((s.platformIncome || 0) + price) * 100) / 100;
    d.platformLogs.push({
      id: util.nextId('platformLogs'), change: price, balance: s.platformIncome,
      type: 'branch_open', desc: `开通一级${typ === 'pro' ? '专业' : '普通'}分站「${nm}」收入 ¥${price.toFixed(2)}`,
      relatedId: branch.id, createdAt: util.now()
    });
  }
  // 站内通知
  d.messages.push({
    id: util.nextId('messages'), userId: req.user.id, type: 'branch',
    title: '分站开通成功', content: `您已开通${typ === 'pro' ? '专业' : '普通'}分站「${nm}」，支付 ¥${price.toFixed(2)}。登录账号：${un}，可在分站后台管理商品与提现。`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  await db.flushNow(); // 分站开通扣款立即落盘
  res.json(util.ok({ id: branch.id, username: branch.username, paid: price, balance: req.user.balance }));
});

/** 加入分站（在专业分站的邀请链接下开通下级分站，价格由该专业分站设置，付款进入该分站余额） */
router.post('/join-branch', auth.requireUser, async (req, res) => {
  const { parent, type, name, sign } = req.body || {};
  const nm = String(name || '').trim();
  let typ = type === 'pro' ? 'pro' : 'normal';
  let parentUn = String(parent || '').trim();
  // 校验邀请签名：提供了签名但无效/过期 → 拒绝（防止伪造上级）
  const parsed = branchSign.parseInvite(sign);
  if (sign) {
    if (!parsed) return res.json(util.fail('邀请链接无效或已过期，请重新获取'));
    parentUn = parsed.parent;
  } else if (!parentUn) {
    return res.json(util.fail('缺少上级分站信息或邀请链接无效'));
  }
  if (!nm) return res.json(util.fail('请填写分站名称'));
  const un = (req.user.email || req.user.phone || '').trim();
  if (!un) return res.json(util.fail('当前账号缺少邮箱，无法开通分站'));
  const d = db.load();
  const s = d.settings || {};
  const p = d.branches.find((x) => x.username === parentUn);
  if (!p || p.status !== 1) return res.json(util.fail('上级分站不存在或已停用'));
  if (p.type !== 'pro') return res.json(util.fail('该分站不能开通下级'));
  // 层级上限：下级分站深度不得超过系统上限
  const maxDepth = s.branchMaxDepth === undefined ? 5 : Number(s.branchMaxDepth);
  if (branchSign.depthOf(d, p) + 1 > maxDepth) return res.json(util.fail('分站层级已达系统上限，无法继续开通下级'));
  const proPrice = branchSign.priceOf(p, 'pricePro', s);
  const normalPrice = branchSign.priceOf(p, 'priceNormal', s);
  const price = typ === 'pro' ? proPrice : normalPrice;
  if (d.branches.some((b) => b.ownerId === req.user.id)) return res.json(util.fail('您已开通分站，不能重复开通'));
  if (d.branches.some((b) => b.username === un)) return res.json(util.fail('该账号已开通分站，请直接登录分站后台'));
  const balance = req.user.balance || 0;
  if (balance < price) return res.json(util.fail('余额不足，开通' + (typ === 'pro' ? '专业' : '普通') + '分站需 ¥' + price + '，当前余额 ¥' + balance));
  req.user.balance = Math.round((balance - price) * 100) / 100;
  // 用户余额流水（扣款）
  if (price > 0) pushUserBalanceLog(d, req.user.id, -price, req.user.balance, 'branch_join', `加入上级分站「${p.name}」开通${typ === 'pro' ? '专业' : '普通'}分站扣款 ¥${price.toFixed(2)}`, 0);
  // 上级分站入账 + 流水
  if (price > 0) {
    p.balance = Math.round(((p.balance || 0) + price) * 100) / 100;
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: p.id,
      change: price, balance: p.balance, type: 'income',
      desc: `下级${typ === 'pro' ? '专业' : '普通'}分站「${nm}」开通费用 ¥${price.toFixed(2)}`,
      relatedId: 0, createdAt: util.now()
    });
  }
  const branch = {
    id: util.nextId('branches'),
    name: nm.slice(0, 20),
    type: typ,
    parentId: p.id,
    username: un.slice(0, 30),
    passwordHash: req.user.passwordHash,
    status: 1,
    note: '同账号加入开通',
    ownerId: req.user.id,
    balance: 0,
    pricePro: proPrice,
    priceNormal: normalPrice,
    createdAt: util.now(), lastLoginAt: 0
  };
  d.branches.push(branch);
  // 站内通知
  d.messages.push({
    id: util.nextId('messages'), userId: req.user.id, type: 'branch',
    title: '分站开通成功', content: `您已开通${typ === 'pro' ? '专业' : '普通'}分站「${nm}」，上级：${p.name}，支付 ¥${price.toFixed(2)}。登录账号：${un}。`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  await db.flushNow(); // 分站开通扣款立即落盘
  res.json(util.ok({ id: branch.id, username: branch.username, paid: price, balance: req.user.balance }));
});

/** 用户余额流水（分页） */
router.get('/balance-logs', auth.requireUser, (req, res) => {
  const d = db.load();
  const { page = 1, size = 20 } = req.query;
  const list = (d.balanceLogs || []).filter((x) => x.userId === req.user.id);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok(util.paginate(list, page, size)));
});

/** 用户订单状态统计（个人中心角标，替代前端 size=100 拉全量统计） */
router.get('/order-stats', auth.requireUser, (req, res) => {
  const d = db.load();
  const mine = d.orders.filter((o) => o.userId === req.user.id);
  const stats = {
    pending: mine.filter((o) => o.status === 'pending').length,
    paid: mine.filter((o) => o.status === 'paid').length,
    shipped: mine.filter((o) => o.status === 'shipped').length,
    completed: mine.filter((o) => o.status === 'completed').length,
    cancelled: mine.filter((o) => o.status === 'cancelled').length,
    refunded: mine.filter((o) => o.status === 'refunded').length
  };
  res.json(util.ok(stats));
});

// 供 server.js 定时任务调用（超时订单自动取消 / 超期订单自动确认）
router.autoProcessOrders = autoProcessOrders;

module.exports = router;
