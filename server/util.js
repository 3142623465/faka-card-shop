/**
 * util.js - 通用工具：响应封装、密码哈希、会话令牌、分页、订单号等
 */
const crypto = require('crypto');

/** 统一成功响应 */
function ok(data) {
  return { code: 0, data: data === undefined ? null : data };
}

/** 统一失败响应 */
function fail(msg, code) {
  return { code: code || 1, msg: msg || '操作失败' };
}

/**
 * 加盐哈希密码（scrypt 慢哈希，格式 scrypt$<salt>:<hash>）
 * 兼容校验旧版 SHA-256 格式（salt:sha256hex）
 */
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const h = crypto.scryptSync(password, s, 32).toString('hex');
  return 'scrypt$' + s + ':' + h;
}

/** 校验密码（兼容 scrypt 新格式与 sha256 旧格式） */
function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  if (stored.startsWith('scrypt$')) {
    const rest = stored.slice('scrypt$'.length);
    const sep = rest.indexOf(':');
    if (sep < 0) return false;
    const s = rest.slice(0, sep);
    const h = rest.slice(sep + 1);
    if (!s || !h) return false;
    const nh = crypto.scryptSync(password, s, 32).toString('hex');
    return nh === h;
  }
  const [s, h] = stored.split(':');
  if (!s || !h) return false;
  const oh = crypto.createHash('sha256').update(s + ':' + password).digest('hex');
  return oh === h;
}

/** 基于 crypto.randomBytes 的均匀随机取字符（代替 Math.random） */
function randPick(chars, len) {
  let s = '';
  const n = chars.length;
  while (s.length < len) {
    const buf = crypto.randomBytes(Math.max(1, Math.ceil(len * 2)));
    for (let i = 0; i < buf.length && s.length < len; i++) {
      const idx = Math.floor((buf[i] / 256) * n);
      s += chars[idx < n ? idx : n - 1];
    }
  }
  return s;
}

/** 生成随机令牌 */
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** 生成随机纯数字验证码（加密随机，防预测爆破） */
function genCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** 生成订单号：时间戳 + 加密随机（避免可预测枚举） */
function genOrderNo() {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  return ts + String(crypto.randomInt(100000, 1000000));
}

/** 图片魔数嗅探：返回 'png'|'jpg'|'gif'|'webp'|null（上传防存储型 XSS） */
function detectImageType(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return null;
}

/** 当前时间戳（秒） */
function now() {
  return Math.floor(Date.now() / 1000);
}

/** 是否生产环境（NODE_ENV === 'production'），用于阻断 devCode 等调试信息直显 */
function isProd() {
  return process.env.NODE_ENV === 'production';
}

/** 分页 */
function paginate(arr, page, size) {
  page = Math.max(1, parseInt(page) || 1);
  size = Math.min(50, Math.max(1, parseInt(size) || 10));
  const total = arr.length;
  const list = arr.slice((page - 1) * size, page * size);
  return { list, total, page, size, pages: Math.ceil(total / size) };
}

/** 简单关键字匹配 */
function matchKeyword(obj, keys, keyword) {
  if (!keyword) return true;
  const kw = String(keyword).toLowerCase();
  return keys.some((k) => String(obj[k] || '').toLowerCase().indexOf(kw) >= 0);
}

/** 深拷贝（用于快照） */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 生成卡密 code（按商品格式，crypto.randomBytes 加密安全随机） */
function genCardCode(product, idx) {
  const map = {
    'alnum': 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    'num': '0123456789'
  };
  const chars = map[product.cardCharset] || map.alnum;
  const len = product.cardCodeLen || 16;
  let s = randPick(chars, len);
  if (product.cardPrefix) s = product.cardPrefix + s;
  return s;
}

/** 生成卡密 secret（加密安全随机） */
function genCardSecret(product) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const len = product.cardSecretLen || 8;
  return randPick(chars, len);
}

/** 取下一个自增 ID（委托给 db 模块） */
function nextId(entity) {
  return require('./db').nextId(entity);
}

/** 隐藏敏感信息（中间打码） */
function mask(str, head = 4, tail = 4) {
  if (!str) return '';
  if (str.length <= head + tail) return str.slice(0, 2) + '****';
  return str.slice(0, head) + '****' + str.slice(-tail);
}

/** 首页快捷入口默认模板（后台可编辑保存后覆盖；联系客服为固定项） */
function defaultQuickNav(categories) {
  const cid = (name) => {
    const c = (categories || []).find((x) => x.name === name);
    return c ? '#/list/' + c.id : '#/list';
  };
  return [
    { name: '话费充值', icon: 'phone', cls: 'c2', img: '', link: cid('话费充值'), enabled: true, fixed: false },
    { name: '游戏充值', icon: 'game', cls: 'c1', img: '', link: cid('游戏充值'), enabled: true, fixed: false },
    { name: '视频会员', icon: 'video', cls: 'c3', img: '', link: cid('视频会员'), enabled: true, fixed: false },
    { name: '音乐会员', icon: 'music', cls: 'c4', img: '', link: cid('音乐会员'), enabled: true, fixed: false },
    { name: '软件激活', icon: 'code', cls: 'c5', img: '', link: cid('软件激活'), enabled: true, fixed: false },
    { name: '领券中心', icon: 'ticket', cls: 'c6', img: '', link: '#/coupons', enabled: true, fixed: false },
    { name: '我的收藏', icon: 'heart', cls: 'c7', img: '', link: '#/favorites', enabled: true, fixed: false },
    { name: '联系客服', icon: 'service', cls: 'c8', img: '', link: '#/service/chat', enabled: true, fixed: true }
  ];
}

/** 清洗快捷入口（保存时校验；固定项强制还原为联系客服） */
function sanitizeQuickNav(list) {
  const arr = (Array.isArray(list) ? list : []).slice(0, 12);
  let hasFixed = false;
  const out = arr.map((q) => {
    if (q && q.fixed) {
      hasFixed = true;
      return { name: '联系客服', icon: 'service', cls: 'c8', img: '', link: '#/service/chat', enabled: true, fixed: true };
    }
    return {
      name: String((q && q.name) || '').slice(0, 10) || '未命名',
      icon: String((q && q.icon) || 'gift').slice(0, 20),
      cls: String((q && q.cls) || 'c1').slice(0, 8),
      img: String((q && q.img) || '').slice(0, 300),
      link: String((q && q.link) || '#/home').slice(0, 200),
      enabled: !q || q.enabled !== false,
      fixed: false
    };
  });
  if (!hasFixed) out.push({ name: '联系客服', icon: 'service', cls: 'c8', img: '', link: '#/service/chat', enabled: true, fixed: true });
  return out;
}

module.exports = {
  ok, fail, hashPassword, verifyPassword, newToken, genCode, genOrderNo,
  now, isProd, paginate, matchKeyword, clone, genCardCode, genCardSecret, nextId, mask,
  defaultQuickNav, sanitizeQuickNav, detectImageType
};
