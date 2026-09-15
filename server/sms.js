/**
 * sms.js - 真实短信服务适配器
 * - 阿里云短信（Dysmsapi SendSms，RPC 风格签名）
 * - 腾讯云短信（SmsSendSms，TC3-HMAC-SHA256 签名）
 * - 未配置 accessKey 时自动回退「本地直显验证码」（devCode），本地离线可用
 *
 * 配置在 server/config.js（参考 config.example.js），也可用环境变量：
 * 阿里云：ALI_SMS_AK / ALI_SMS_SK / ALI_SMS_SIGN / ALI_SMS_TMPL
 * 腾讯云：TENCENT_SMS_ID / TENCENT_SMS_KEY / TENCENT_SMS_APPID / TENCENT_SMS_SIGN / TENCENT_SMS_TMPL
 */
const crypto = require('crypto');
const https = require('https');

let cfg = {};
try { cfg = require('./config'); } catch (e) { /* 未配置 */ }

function env(name, def) { return process.env[name] || def; }

function smsCfg() {
  const c = (cfg.sms && cfg.sms) || {};
  return {
    aliyun: {
      ak: env('ALI_SMS_AK', c.aliyun && c.aliyun.accessKeyId || ''),
      sk: env('ALI_SMS_SK', c.aliyun && c.aliyun.accessKeySecret || ''),
      sign: env('ALI_SMS_SIGN', c.aliyun && c.aliyun.signName || ''),
      tmpl: env('ALI_SMS_TMPL', c.aliyun && c.aliyun.templateCode || '')
    },
    tencent: {
      id: env('TENCENT_SMS_ID', c.tencent && c.tencent.secretId || ''),
      key: env('TENCENT_SMS_KEY', c.tencent && c.tencent.secretKey || ''),
      appId: env('TENCENT_SMS_APPID', c.tencent && c.tencent.sdkAppId || ''),
      sign: env('TENCENT_SMS_SIGN', c.tencent && c.tencent.signName || ''),
      tmpl: env('TENCENT_SMS_TMPL', c.tencent && c.tencent.templateId || '')
    }
  };
}

function httpsPost(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode, data: out }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ================= 阿里云短信（RPC 签名） ================= */
function aliSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const canon = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const stringToSign = 'POST&%2F&' + encodeURIComponent(canon);
  return crypto.createHmac('sha1', secret + '&').update(stringToSign).digest('base64');
}

function q(s) { return encodeURIComponent(String(s)); }

async function sendByAliyun(phone, code, cfgA) {
  const params = {
    AccessKeyId: cfgA.ak,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: 'cn-hangzhou',
    SignName: cfgA.sign,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomBytes(16).toString('hex'),
    SignatureVersion: '1.0',
    TemplateCode: cfgA.tmpl,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25'
  };
  params.Signature = aliSign(params, cfgA.sk);
  const query = Object.keys(params).sort().map((k) => `${q(k)}=${q(params[k])}`).join('&');
  const res = await httpsPost('https://dysmsapi.aliyuncs.com/?' + query, '');
  let d = {};
  try { d = JSON.parse(res.data); } catch (e) {}
  if (res.status === 200 && d.Code === 'OK') return { ok: true, provider: 'aliyun' };
  return { ok: false, provider: 'aliyun', error: d.Message || res.data || ('HTTP ' + res.status) };
}

/* ================= 腾讯云短信（TC3-HMAC-SHA256） ================= */
function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hmac(key, s) { return crypto.createHmac('sha256', key).update(s).digest(); }

async function sendByTencent(phone, code, cfgT) {
  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const algorithm = 'TC3-HMAC-SHA256';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: cfgT.appId,
    SignName: cfgT.sign,
    TemplateId: cfgT.tmpl,
    TemplateParamSet: [String(code)]
  });
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256hex(payload)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${sha256hex(canonicalRequest)}`;
  const secretDate = hmac('TC3' + cfgT.key, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `${algorithm} Credential=${cfgT.id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await httpsPost('https://' + host, payload, {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    Host: host
  });
  let d = {};
  try { d = JSON.parse(res.data); } catch (e) {}
  const resp = d.Response || {};
  if (resp.Error) return { ok: false, provider: 'tencent', error: resp.Error.Message || resp.Error.Code };
  if (resp.SendStatusSet && resp.SendStatusSet[0] && resp.SendStatusSet[0].Code === 'Ok') return { ok: true, provider: 'tencent' };
  return { ok: false, provider: 'tencent', error: (resp.SendStatusSet && resp.SendStatusSet[0] && resp.SendStatusSet[0].Message) || res.data || ('HTTP ' + res.status) };
}

/* ================= 对外接口 ================= */
/**
 * 发送短信验证码。
 * @returns {Promise<{mode:'aliyun'|'tencent'|'local', devCode?:string, error?:string}>}
 * mode=local 表示未配置真实短信服务，验证码以 devCode 直显（本地/演示模式）。
 */
async function sendSms(phone, code) {
  const c = smsCfg();
  if (c.aliyun.ak && c.aliyun.sk && c.aliyun.sign && c.aliyun.tmpl) {
    const r = await sendByAliyun(phone, code, c.aliyun);
    if (r.ok) return { mode: 'aliyun' };
    return { mode: 'aliyun', error: r.error };
  }
  if (c.tencent.id && c.tencent.key && c.tencent.appId && c.tencent.sign && c.tencent.tmpl) {
    const r = await sendByTencent(phone, code, c.tencent);
    if (r.ok) return { mode: 'tencent' };
    return { mode: 'tencent', error: r.error };
  }
  return { mode: 'local', devCode: code };
}

module.exports = { sendSms };
