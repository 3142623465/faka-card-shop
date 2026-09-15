/**
 * branch-sign.js - 分站邀请链接签名
 * 邀请链接携带 HMAC 签名，防止他人伪造上级分站账号开分站。
 * 签名载荷：`parentUsername|exp`（base64url），附 HMAC-SHA256 前 24 位。
 */
const crypto = require('crypto');
const db = require('./db');

function secretOf(d) {
  return (d.settings && d.settings.branchInviteSecret) || 'faka-branch-invite-secret';
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24);
}

/** 生成签名（exp 秒时间戳，默认 30 天有效） */
function signInvite(parentUsername, exp) {
  const d = db.load();
  const payload = Buffer.from(`${parentUsername}|${exp || 0}`).toString('base64url');
  return payload + '.' + hmac(secretOf(d), payload);
}

/** 校验并解析签名；非法/过期返回 null */
function parseInvite(sign) {
  if (!sign || String(sign).indexOf('.') < 0) return null;
  const d = db.load();
  const [payload, sig] = String(sign).split('.');
  if (!payload || !sig) return null;
  if (hmac(secretOf(d), payload) !== sig) return null;
  try {
    const raw = Buffer.from(payload, 'base64url').toString('utf8');
    const parts = raw.split('|');
    if (parts.length !== 2) return null;
    const [parent, exp] = parts;
    if (!parent) return null;
    const expN = Number(exp);
    if (expN && expN < Math.floor(Date.now() / 1000)) return null;
    return { parent };
  } catch (e) {
    return null;
  }
}

/** 取分站价格（未设置时回退全局默认）。key 为 'pricePro' 或 'priceNormal' */
function priceOf(branch, key, settings) {
  const defs = {
    pricePro: settings.branchProPrice === undefined ? 10 : settings.branchProPrice,
    priceNormal: settings.branchNormalPrice === undefined ? 0 : settings.branchNormalPrice
  };
  return (branch && branch[key] !== undefined && branch[key] !== null) ? branch[key] : defs[key];
}

/** 校验下级价格设置是否合法：下级专业价 ≥ 上级专业价，普通价 ≥ 上级普通价；
 *  一级分站（无上级）下限取平台统一开通价 settings.branchProPrice / branchNormalPrice */
function validatePriceBelow(parent, pro, normal, settings) {
  if (parent) {
    const pPro = priceOf(parent, 'pricePro', settings);
    if (pro < pPro) return `专业分站价格不能低于上级的 ¥${pPro}`;
    const pNormal = priceOf(parent, 'priceNormal', settings);
    if (normal < pNormal) return `普通分站价格不能低于上级的 ¥${pNormal}`;
  } else {
    // 一级分站：不能低于平台统一开通价（防击穿平台定价）
    const platformPro = settings && settings.branchProPrice !== undefined ? Number(settings.branchProPrice) : 10;
    const platformNormal = settings && settings.branchNormalPrice !== undefined ? Number(settings.branchNormalPrice) : 0;
    if (pro < platformPro) return `专业分站价格不能低于平台开通价 ¥${platformPro}`;
    if (normal < platformNormal) return `普通分站价格不能低于平台开通价 ¥${platformNormal}`;
  }
  if (pro < normal) return '专业分站价格不能低于普通分站价格';
  return null;
}

/** 计算分站所在层级深度（超级管理员直接下级为第 1 层） */
function depthOf(d, branch) {
  let depth = 1;
  let pid = branch.parentId;
  while (pid) {
    depth++;
    const p = d.branches.find((x) => x.id === pid);
    if (!p) break;
    pid = p.parentId;
    if (depth > 50) break;
  }
  return depth;
}

module.exports = { signInvite, parseInvite, validatePriceBelow, depthOf, priceOf };
