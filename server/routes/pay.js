/**
 * routes/pay.js - 支付回调（微信 / 支付宝 / 虎皮椒异步通知）
 * 支付渠道回调结算：验签 → 幂等结算 → 应答渠道
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const util = require('../util');
const payments = require('../payments');
const settle = require('../settle');
const xunhu = require('../xunhu');

/** 结算失败统一处理：不假装退款，标记异常 + 站内告警 + 服务端告警日志，由人工介入 */
function handleSettleFailure(d, o, channel, err) {
  o.status = 'paid';
  o.settleFailed = true;
  o.settleFailedAt = util.now();
  o.settleFailedReason = err || '';
  db.save();
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '订单结算异常', content: `订单 ${o.orderNo} 已支付成功但自动发货/结算失败（${err || '未知原因'}），系统已暂停发货并通知管理员人工处理，请勿重复支付。`,
    isRead: 0, createdAt: util.now()
  });
  console.error(`[pay] ${channel} 回调结算失败（订单 ${o.orderNo}，已标记待人工处理）:`, err);
}

/**
 * 解析回调参数（BUG-002 第二层容错）。
 * 优先用中间件已解析的 req.body；当其为空但存在 rawBody 时，兼容两种编码自行恢复：
 * 表单串（a=1&b=2）走 URLSearchParams，JSON 走 JSON.parse，避免渠道误标 Content-Type 时拿不到参数。
 */
function parseNotifyParams(req) {
  let params = { ...((req.body && typeof req.body === 'object') ? req.body : {}) };
  if (!Object.keys(params).length && req.rawBody) {
    const raw = String(req.rawBody).trim();
    if (raw) {
      try {
        if (raw.charAt(0) === '{') params = JSON.parse(raw);
        else params = Object.fromEntries(new URLSearchParams(raw));
      } catch (e) {
        params = {};
      }
    }
  }
  return params;
}

/** 微信支付回调（body 为 JSON 明文，头带签名；应答一律 HTTP 200 + JSON） */
router.post('/notify/wechat', (req, res) => {
  const raw = req.rawBody || JSON.stringify(req.body || {});
  const headers = req.headers;
  let result;
  try {
    result = payments.handleWechatNotify(raw, headers);
  } catch (e) {
    console.error('[pay] 微信回调解析失败:', e.message);
    return res.status(400).json({ code: 'FAIL', message: '解析失败' });
  }
  if (!result.ok) {
    console.warn('[pay] 微信回调校验未通过:', result.error);
    return res.status(400).json({ code: 'FAIL', message: result.error || '验签失败' });
  }
  const d = db.load();
  const o = d.orders.find((x) => x.orderNo === result.orderNo);
  if (!o) {
    console.warn('[pay] 微信回调订单不存在:', result.orderNo);
    return res.json({ code: 'FAIL', message: '订单不存在' });
  }
  // 幂等：非 pending 订单直接返回成功，避免重复结算
  if (o.status !== 'pending') {
    return res.json({ code: 'SUCCESS', message: '已处理' });
  }
  // 金额核对（分）
  if (Math.round(o.payAmount * 100) !== Math.round(result.paidAmount * 100)) {
    console.warn('[pay] 微信回调金额不一致:', result.orderNo);
    return res.json({ code: 'FAIL', message: '金额不一致' });
  }
  const r = settle.settlePaidOrder(d, o, 'wechat');
  if (!r.ok) {
    handleSettleFailure(d, o, 'wechat', r.error);
  }
  res.json({ code: 'SUCCESS', message: '成功' });
});

/** 支付宝回调（application/x-www-form-urlencoded，RSA2 验签） */
router.post('/notify/alipay', (req, res) => {
  const params = parseNotifyParams(req);
  let result;
  try {
    result = payments.handleAlipayNotify(params);
  } catch (e) {
    console.error('[pay] 支付宝回调解析失败:', e.message);
    return res.send('failure');
  }
  if (!result.ok) {
    console.warn('[pay] 支付宝回调校验未通过:', result.error);
    return res.send('failure');
  }
  const d = db.load();
  const o = d.orders.find((x) => x.orderNo === result.orderNo);
  if (!o) {
    console.warn('[pay] 支付宝回调订单不存在:', result.orderNo);
    return res.send('failure');
  }
  // 幂等
  if (o.status !== 'pending') {
    return res.send('success');
  }
  if (Math.abs(o.payAmount - result.paidAmount) > 0.01) {
    console.warn('[pay] 支付宝回调金额不一致:', result.orderNo);
    return res.send('failure');
  }
  const r = settle.settlePaidOrder(d, o, 'alipay');
  if (!r.ok) {
    handleSettleFailure(d, o, 'alipay', r.error);
  }
  res.send('success'); // 支付宝要求应答纯文本 success
});

/** 虎皮椒回调（application/x-www-form-urlencoded，MD5 验签） */
router.post('/notify/xunhu', (req, res) => {
  const params = parseNotifyParams(req);
  if (!xunhu.verifyNotify(params)) {
    console.warn('[pay] 虎皮椒回调验签失败');
    return res.status(400).send('fail');
  }
  if (params.status !== 'OD') {
    // 非已支付状态（退款等），暂不处理
    return res.send('success');
  }
  const d = db.load();
  const o = d.orders.find((x) => x.orderNo === params.trade_order_id);
  if (!o) {
    console.warn('[pay] 虎皮椒回调订单不存在:', params.trade_order_id);
    return res.status(404).send('fail');
  }
  if (o.status !== 'pending') {
    // 已处理过，幂等返回
    return res.send('success');
  }
  if (Math.abs(Number(o.payAmount) - Number(params.total_fee)) > 0.01) {
    console.warn('[pay] 虎皮椒回调金额不一致:', params.trade_order_id, o.payAmount, params.total_fee);
    return res.status(400).send('fail');
  }
  o.payChannel = 'xunhu';
  o.transactionId = params.transaction_id || '';
  const r = settle.settlePaidOrder(d, o, 'xunhu');
  if (!r.ok) {
    handleSettleFailure(d, o, 'xunhu', r.error);
  }
  res.send('success'); // 虎皮椒要求返回 success
});

module.exports = router;
