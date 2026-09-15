/**
 * settle.js - 订单支付成功后的统一结算逻辑
 * 被「模拟支付」「微信/支付宝回调」复用：扣库存 → 自动发卡 → 积分/消费累计 → 消息通知 → 分站分成
 */
const crypto = require('crypto');
const db = require('./db');
const util = require('./util');
const shop = require('./routes/shop');

/** 计算单个商品的成本价（分站上架时的下限价快照；无快照时取上级同款价/总站价） */
function costOfProduct(p, d) {
  if (p.costPrice !== undefined && p.costPrice !== null && p.costPrice > 0) return p.costPrice;
  return p.price;
}

/** 订单商品分成入账：差价（售价 - 成本）计入所属分站余额并写流水 */
function creditBranchShare(d, o) {
  const t = util.now();
  for (const g of o.goods || []) {
    const bid = g.branchId;
    if (!bid) continue;
    const branch = d.branches.find((x) => x.id === bid);
    if (!branch) continue;
    const cost = (g.costPrice !== undefined && g.costPrice !== null && g.costPrice > 0) ? g.costPrice : 0;
    const diff = Math.max(0, Math.round((g.price - cost) * 100) / 100);
    if (diff <= 0) continue;
    branch.balance = Math.round(((branch.balance || 0) + diff) * 100) / 100;
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: bid,
      change: diff, balance: branch.balance, type: 'income',
      desc: `订单 ${o.orderNo}「${g.name}」差价分成 ¥${diff.toFixed(2)}`,
      relatedId: o.id, createdAt: t
    });
  }
}

/** 退款冲正：扣回该订单已计入分站的差价分成并写流水 */
function revertBranchShare(d, o) {
  const t = util.now();
  for (const g of o.goods || []) {
    const bid = g.branchId;
    if (!bid) continue;
    const branch = d.branches.find((x) => x.id === bid);
    if (!branch) continue;
    const cost = (g.costPrice !== undefined && g.costPrice !== null && g.costPrice > 0) ? g.costPrice : 0;
    const diff = Math.max(0, Math.round((g.price - cost) * 100) / 100);
    if (diff <= 0) continue;
    const bal = Math.max(0, Math.round(((branch.balance || 0) - diff) * 100) / 100);
    branch.balance = bal;
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: bid,
      change: -diff, balance: bal, type: 'expense',
      desc: `订单 ${o.orderNo} 退款冲正 ¥${diff.toFixed(2)}`,
      relatedId: o.id, createdAt: t
    });
  }
}

/**
 * 执行支付成功结算。
 * @param {object} d     数据库对象
 * @param {object} o     订单对象（status 须为 pending）
 * @param {string} payMethod wechat | alipay
 * @returns {{ok:boolean, error?:string, status?:string, autoShipped?:boolean, cardsDelivered?:number}}
 */
function settlePaidOrder(d, o, payMethod) {
  // 幂等保护：已结算订单（paid/shipped/refunded/cancelled/completed）直接返回当前状态。
  // pending_confirm（手动转账待确认）视为可结算订单，恢复「确认收款 = 结算发货」语义（H-3）。
  if (o.status !== 'pending' && o.status !== 'pending_confirm') {
    return { ok: true, status: o.status, autoShipped: o.status === 'shipped' && o.cardsDelivered > 0, cardsDelivered: o.cardsDelivered || 0 };
  }

  // 校验库存并扣减（统一库存池：manual 扣 stock；auto 发卡后按剩余卡密重算）
  for (const g of o.goods) {
    const p = d.products.find((x) => x.id === g.productId);
    if (!p || p.status === 0) return { ok: false, error: `「${g.name}」已下架` };
    if (g.quantity > shop.stockOf(p, d)) return { ok: false, error: `「${g.name}」库存不足` };
    p.sales = (p.sales || 0) + g.quantity;
    if (p.type === 'manual') p.stock = (p.stock || 0) - g.quantity;
  }

  o.status = 'paid';
  o.payMethod = payMethod;
  o.payAt = util.now();

  // 自动发货：分配卡密（随机取卡，避免顺序取卡导致批次耗尽/极端并发重复）
  let autoShipped = false;
  const t = util.now();
  if (o.goods.every((g) => g.type === 'auto')) {
    for (const g of o.goods) {
      for (let i = 0; i < g.quantity; i++) {
        const pool = d.cards.filter((c) => c.productId === g.productId && c.status === 'unused');
        if (!pool.length) return { ok: false, error: `「${g.name}」卡密库存不足` };
        const card = pool[crypto.randomInt(pool.length)];
        card.status = 'used';
        card.orderId = o.id;
        card.usedAt = t;
      }
    }
    o.status = 'shipped';
    o.shippedAt = t;
    o.trackingNo = '自动发货';
    o.logistics = '卡密自动发货';
    o.cardsDelivered = o.goods.reduce((s, g) => s + g.quantity, 0);
    autoShipped = true;
    // 统一库存池：自动发卡后按剩余未使用卡密重算商品库存
    for (const g of o.goods) {
      const p = d.products.find((x) => x.id === g.productId);
      if (p) p.stock = d.cards.filter((c) => c.productId === p.id && c.status === 'unused').length;
    }
  }

  // 分站差价分成（分站商品收益进入分站余额）
  creditBranchShare(d, o);

  // 累计消费 / 积分
  const user = d.users.find((u) => u.id === o.userId);
  if (user) {
    user.totalSpend = (user.totalSpend || 0) + o.payAmount;
    const rate = d.settings.pointsRate || 1;
    const earn = Math.floor(o.payAmount * rate);
    if (earn > 0) {
      user.points = (user.points || 0) + earn;
      d.pointsLogs.push({
        id: util.nextId('pointsLogs'), userId: user.id, change: earn,
        balance: user.points, type: 'earn', desc: '订单 ' + o.orderNo + ' 获得积分', createdAt: t
      });
    }
  }

  // 消息通知
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '支付成功', content: `订单 ${o.orderNo} 支付成功，金额 ¥${o.payAmount.toFixed(2)}${autoShipped ? '，卡密已自动发货' : '，商家将尽快发货'}。`,
    isRead: 0, createdAt: t
  });

  db.save();
  db.flushNow(); // 资金关键路径立即落盘，防崩溃丢单
  return { ok: true, status: o.status, autoShipped, cardsDelivered: o.cardsDelivered };
}

module.exports = { settlePaidOrder, creditBranchShare, revertBranchShare, costOfProduct };
