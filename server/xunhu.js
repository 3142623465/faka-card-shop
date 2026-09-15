/**
 * xunhu.js - 虎皮椒（xunhupay）第三方支付适配器
 * 个人免营业执照，云端监听，支持微信/支付宝收款码
 * 文档：https://www.xunhupay.com/doc/api/pay.html
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('./db');

function settings() {
  try { return db.load().settings || {}; } catch (e) { return {}; }
}

function config() {
  const s = settings();
  return {
    enabled: !!s.xunhuEnabled,
    appId: s.xunhuAppId || '',
    appSecret: s.xunhuAppSecret || '',
    gateway: s.xunhuGateway || 'https://api.xunhupay.com/payment/do.html'
  };
}

/** 是否配置了虎皮椒 */
function configured() {
  const c = config();
  return c.enabled && !!c.appId && !!c.appSecret;
}

/** 签名：非空参数按 ASCII 升序，拼接 key=value&...，末尾拼 AppSecret，MD5 32位小写 */
function sign(params, secret) {
  const keys = Object.keys(params).filter((k) => k !== 'hash' && params[k] !== undefined && params[k] !== '').sort();
  const str = keys.map((k) => k + '=' + params[k]).join('&') + secret;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/** 验证回调签名 */
function verifyNotify(params) {
  const c = config();
  if (!c.appSecret) return false;
  const hash = params.hash;
  if (!hash) return false;
  return sign(params, c.appSecret) === hash;
}

function httpPostJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('虎皮椒返回解析失败: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 创建虎皮椒支付订单
 * @param {Object} order - 订单对象
 * @param {string} method - 'wechat' | 'alipay'
 * @param {Object} req - express req（用于获取域名组装回调地址）
 * @returns {Promise<{url_qrcode:string, url:string, orderId:string}>}
 */
async function createPayment(order, method, req) {
  const c = config();
  if (!configured()) throw new Error('虎皮椒未配置');

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers.host;
  const baseUrl = proto + '://' + host;
  const notifyUrl = baseUrl + '/api/pay/notify/xunhu';
  const returnUrl = baseUrl + '/#/order/' + order.id;

  const params = {
    version: '1.1',
    appid: c.appId,
    trade_order_id: order.orderNo,
    total_fee: order.payAmount,
    title: (order.goods && order.goods[0] ? order.goods[0].name : '订单') + ' #' + order.orderNo,
    time: Math.floor(Date.now() / 1000),
    notify_url: notifyUrl,
    return_url: returnUrl,
    callback_url: baseUrl + '/#/orders',
    plugins: 'faka-system',
    attach: JSON.stringify({ orderId: order.id, method }),
    nonce_str: crypto.randomBytes(16).toString('hex')
  };
  params.hash = sign(params, c.appSecret);

  const r = await httpPostJson(c.gateway, params);
  if (r.errcode && r.errcode !== 0) {
    throw new Error('虎皮椒下单失败: ' + (r.errmsg || 'errcode=' + r.errcode));
  }
  return {
    channel: 'xunhu_' + method,
    payMode: 'qrcode',
    url_qrcode: r.url_qrcode || '',
    url: r.url || '',
    orderId: r.openid || ''
  };
}

module.exports = { configured, createPayment, verifyNotify, sign };
