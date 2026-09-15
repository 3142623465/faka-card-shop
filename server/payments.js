/**
 * payments.js - 真实支付渠道适配器
 * - 微信支付：Native 下单（扫码支付，V3 API）+ 回调验签/解密（AES-256-GCM）
 * - 支付宝：电脑网站支付（alipay.trade.page.pay，RSA2 签名）+ 回调验签
 * - 未配置商户参数时自动回退「模拟支付」，本地离线功能不受影响
 *
 * 商户参数在 server/config.js 中填写（参考 server/config.example.js），
 * 全部字段也可用环境变量覆盖：WX_APPID / WX_MCHID / WX_SERIAL_NO / WX_PRIVATE_KEY /
 * WX_API_V3_KEY / WX_NOTIFY_URL / ALI_APP_ID / ALI_PRIVATE_KEY / ALI_PUBLIC_KEY / ALI_NOTIFY_URL
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('./db');

let cfg = {};
try { cfg = require('./config'); } catch (e) { /* 未配置 config.js，全部走模拟支付 */ }

function env(name, def) { return process.env[name] || def; }

/* 从后台设置（db.settings）读取支付配置，优先于 config.js */
function siteSettings() {
  try { return db.load().settings || {}; } catch (e) { return {}; }
}
function sandboxMode() {
  const s = siteSettings();
  return s.paySandbox !== false; // 默认开启沙箱
}

/* ================= 配置读取 ================= */
function wxConfig() {
  const s = siteSettings();
  const c = (cfg.pay && cfg.pay.wechat) || {};
  return {
    appid: env('WX_APPID', s.wechatAppId || c.appid || ''),
    mchid: env('WX_MCHID', s.wechatMchId || c.mchid || ''),
    serialNo: env('WX_SERIAL_NO', s.wechatSerialNo || c.serialNo || ''),
    privateKey: env('WX_PRIVATE_KEY', s.wechatPrivateKey || c.privateKey || ''),
    apiV3Key: env('WX_API_V3_KEY', s.wechatApiKey || c.apiV3Key || ''),
    platformCert: env('WX_PLATFORM_CERT', s.wechatPlatformCert || c.platformCert || ''),
    notifyUrl: env('WX_NOTIFY_URL', c.notifyUrl || ''),
    returnUrl: env('WX_RETURN_URL', c.returnUrl || '')
  };
}
function aliConfig() {
  const s = siteSettings();
  const c = (cfg.pay && cfg.pay.alipay) || {};
  return {
    appId: env('ALI_APP_ID', s.alipayAppId || c.appId || ''),
    privateKey: env('ALI_PRIVATE_KEY', s.alipayPrivateKey || c.privateKey || ''),
    publicKey: env('ALI_PUBLIC_KEY', s.alipayPublicKey || c.publicKey || ''),
    notifyUrl: env('ALI_NOTIFY_URL', c.notifyUrl || ''),
    returnUrl: env('ALI_RETURN_URL', c.returnUrl || '')
  };
}

/** 某渠道是否已配置真实商户参数（由密钥完整性决定；沙箱模式仅决定模拟支付是否可用） */
function configured(method) {
  if (method === 'wechat') {
    const w = wxConfig();
    return !!(w.appid && w.mchid && w.serialNo && w.privateKey && w.apiV3Key && w.notifyUrl);
  }
  if (method === 'alipay') {
    const a = aliConfig();
    return !!(a.appId && a.privateKey && a.publicKey && a.notifyUrl);
  }
  return false;
}

/** 站点基础地址（用于组装回调地址） */
function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return proto + '://' + req.headers.host;
}

/* ================= 微信支付（Native V3） ================= */
function wxSignature(method, urlPath, timestamp, nonce, body, privateKey) {
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createSign('RSA-SHA256').update(message).sign(privateKey, 'base64');
}

function httpsRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 微信 Native 下单，返回 code_url（二维码内容）
 */
async function wxCreateNativeOrder(order, req) {
  const w = wxConfig();
  const path = '/v3/pay/transactions/native';
  const bodyObj = {
    appid: w.appid,
    mchid: w.mchid,
    description: ('发卡网-订单' + order.orderNo).slice(0, 120),
    out_trade_no: order.orderNo,
    notify_url: w.notifyUrl || (baseUrl(req) + '/api/pay/notify/wechat'),
    amount: { total: Math.round(order.payAmount * 100), currency: 'CNY' }
  };
  const body = JSON.stringify(bodyObj);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = wxSignature('POST', path, timestamp, nonce, body, w.privateKey);
  const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${w.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${w.serialNo}",signature="${signature}"`;
  const res = await httpsRequest('https://api.mch.weixin.qq.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'card-shop/1.0', Authorization: auth }
  }, body);
  if (res.status >= 200 && res.status < 300) {
    const d = JSON.parse(res.data);
    if (!d.code_url) throw new Error('微信下单响应缺少 code_url: ' + res.data);
    return { codeUrl: d.code_url, payNo: d.prepay_id || '' };
  }
  throw new Error('微信下单失败(' + res.status + '): ' + res.data);
}

/** AES-256-GCM 解密微信回调 resource */
function wxDecryptResource(resource, apiV3Key) {
  const key = Buffer.from(apiV3Key, 'utf8');
  const iv = Buffer.from(resource.nonce, 'utf8');
  const tag = Buffer.from(resource.associated_data ? '' : '', 'utf8');
  const cipher = Buffer.from(resource.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  const text = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}

/** 微信回调验签（使用微信支付平台证书公钥做 RSA-SHA256 验签） */
function wxVerifyNotify(headers, rawBody, platformCert) {
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  if (!timestamp || !nonce || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 防重放
  try {
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    return verifier.verify(platformCert, signature, 'base64');
  } catch (e) {
    return false;
  }
}

/* ================= 支付宝（电脑网站支付） ================= */
function aliSign(params, privateKey) {
  const sorted = Object.keys(params).sort();
  const content = sorted.map((k) => (params[k] !== undefined && params[k] !== null && params[k] !== '' ? `${k}=${params[k]}` : '')).filter(Boolean).join('&');
  return crypto.createSign('RSA-SHA256').update(content, 'utf8').sign(privateKey, 'base64');
}

function aliVerify(params, publicKey) {
  const sign = params.sign;
  if (!sign) return false;
  const keys = Object.keys(params).filter((k) => k !== 'sign' && k !== 'sign_type');
  const content = keys.sort().map((k) => `${k}=${params[k]}`).join('&');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(content, 'utf8');
  return verifier.verify(publicKey, sign, 'base64');
}

function pad2(n) { return String(n).padStart(2, '0'); }
function aliTimestamp(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * 支付宝电脑网站支付下单，返回自动提交的 HTML 表单（POST 到支付宝网关）
 */
async function aliCreatePagePay(order, req) {
  const a = aliConfig();
  const biz = {
    out_trade_no: order.orderNo,
    total_amount: order.payAmount.toFixed(2),
    subject: ('发卡网-订单' + order.orderNo).slice(0, 100),
    product_code: 'FAST_INSTANT_TRADE_PAY'
  };
  const params = {
    app_id: a.appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: aliTimestamp(new Date()),
    version: '1.0',
    notify_url: a.notifyUrl || (baseUrl(req) + '/api/pay/notify/alipay'),
    return_url: a.returnUrl || (baseUrl(req) + '/index.html#/pay/' + order.id + '/result'),
    biz_content: JSON.stringify(biz)
  };
  params.sign = aliSign(params, a.privateKey);
  const formItems = Object.keys(params).map((k) => `<input type="hidden" name="${k}" value="${escHtml(params[k])}">`).join('\n');
  return {
    form: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>跳转支付宝...</title></head><body><form id="alipay" action="https://openapi.alipay.com/gateway.do" method="post">${formItems}</form><script>document.getElementById('alipay').submit();</script></body></html>`,
    orderNo: order.orderNo
  };
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ================= 对外接口 ================= */
/**
 * 创建支付：返回渠道支付参数。
 * - method 未配置真实参数时抛错（由路由回退模拟支付）
 */
async function createPayment(order, method, req) {
  if (method === 'wechat') {
    const r = await wxCreateNativeOrder(order, req);
    return { channel: 'wechat', codeUrl: r.codeUrl, payNo: r.payNo };
  }
  if (method === 'alipay') {
    const r = await aliCreatePagePay(order, req);
    return { channel: 'alipay', form: r.form };
  }
  throw new Error('不支持的支付方式');
}

/** 微信回调处理：返回 {ok, orderNo, paidAmount} */
function handleWechatNotify(rawBody, headers) {
  const w = wxConfig();
  const body = JSON.parse(rawBody);
  if (body.event_type === 'TRANSACTION.SUCCESS' && body.resource) {
    if (w.platformCert) {
      if (!wxVerifyNotify(headers, rawBody, w.platformCert)) return { ok: false, error: '验签失败' };
    } else {
      console.warn('[payments] 未配置 WX_PLATFORM_CERT，已拒绝微信回调（无法验签）');
      return { ok: false, error: '未配置平台证书，拒绝微信回调' };
    }
    const txn = wxDecryptResource(body.resource, w.apiV3Key);
    const paid = Number(txn.amount && txn.amount.total) / 100;
    return { ok: true, orderNo: txn.out_trade_no, paidAmount: paid, tradeNo: txn.transaction_id };
  }
  return { ok: false, error: '非支付成功事件' };
}

/** 支付宝回调处理：返回 {ok, orderNo, paidAmount} */
function handleAlipayNotify(params) {
  const a = aliConfig();
  if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') {
    return { ok: false, error: '非成功状态' };
  }
  if (a.publicKey) {
    if (!aliVerify(params, a.publicKey)) return { ok: false, error: '验签失败' };
  } else {
    console.warn('[payments] 未配置 ALI_PUBLIC_KEY，已拒绝支付宝回调（无法验签）');
    return { ok: false, error: '未配置支付宝公钥，拒绝回调' };
  }
  return { ok: true, orderNo: params.out_trade_no, paidAmount: Number(params.total_amount), tradeNo: params.trade_no };
}

module.exports = { configured, createPayment, handleWechatNotify, handleAlipayNotify, baseUrl };
