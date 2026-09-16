/**
 * auth.js - 会话与登录态管理
 * - createSession(userId, role)：创建会话，返回 token（role: 'user' | 'admin' | 'branch'）
 * - requireUser / requireAdmin / requireBranch：校验请求头 Bearer token 的中间件
 * - optionalUser：可选登录（有有效 token 则挂 req.user，否则放行）
 */
const crypto = require('crypto');
const db = require('./db');
const util = require('./util');

const TTL = 7 * 86400; // 会话有效期 7 天

async function createSession(userId, role) {
  const d = db.load();
  const token = crypto.randomBytes(24).toString('hex');
  const now = util.now();
  d.sessions = d.sessions || [];
  // 清理过期会话
  d.sessions = d.sessions.filter((s) => s.expiresAt > now);
  d.sessions.push({ token, userId, role, createdAt: now, expiresAt: now + TTL });
  db.save();
  // Serverless(Mongo) 下必须在返回 token 前把会话落库，否则下一请求（可能落在新实例）
  // 从数据库读不到该会话，表现为"登录成功却进不去/被弹回登录页"
  await db.flushNow();
  return token;
}

async function sessionFromReq(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const token = m[1];
  const find = (d) => (d.sessions || []).find((x) => x.token === token && x.expiresAt > util.now());
  let s = find(db.load());
  // Serverless 多实例：本实例内存快照可能早于登录创建，找不到时回数据库重读一次再判定
  if (!s && db.USE_MONGO) {
    try { await db.reload(); s = find(db.load()); } catch (e) { /* 忽略重读异常，按未登录处理 */ }
  }
  return s || null;
}

function makeRequire(role, attach, checkDisabled) {
  return async (req, res, next) => {
    const s = await sessionFromReq(req);
    if (!s || s.role !== role) return res.status(401).json(util.fail('未登录或登录已过期', 401));
    const d = db.load();
    let obj = null;
    if (role === 'user') obj = d.users.find((u) => u.id === s.userId);
    else if (role === 'branch') obj = d.branches.find((b) => b.id === s.userId);
    else if (role === 'admin') obj = { id: 0, role: 'admin' };
    if (!obj) return res.status(401).json(util.fail('账号不存在或已被删除', 401));
    if (checkDisabled && obj.status === 0) return res.status(401).json(util.fail('账号已被禁用', 401));
    attach(req, obj, s);
    next();
  };
}

const requireUser = makeRequire('user', (req, u) => { req.user = u; }, true);
const requireAdmin = makeRequire('admin', (req, u, s) => { req.user = u; req.session = s; });
const requireBranch = makeRequire('branch', (req, b) => { req.branch = b; }, true);

/**
 * 分站接口兼容中间件：分站 token 或「已开通分站的用户 token」均可访问。
 * 用于用户端内嵌分站管理（无需跳转独立分站后台）。
 */
async function requireBranchOrUser(req, res, next) {
  const s = await sessionFromReq(req);
  if (!s) return res.status(401).json(util.fail('未登录或登录已过期', 401));
  const d = db.load();
  if (s.role === 'branch') {
    const b = d.branches.find((x) => x.id === s.userId);
    if (!b) return res.status(401).json(util.fail('分站不存在或已被删除', 401));
    if (b.status === 0) return res.status(401).json(util.fail('分站已被停用，请联系上级', 401));
    req.branch = b;
    return next();
  }
  if (s.role === 'user') {
    const u = d.users.find((x) => x.id === s.userId);
    if (!u) return res.status(401).json(util.fail('账号不存在或已被删除', 401));
    if (u.status === 0) return res.status(401).json(util.fail('账号已被禁用', 401));
    const un = u.phone || u.email || '';
    const b = d.branches.find((x) => x.ownerId === u.id || (x.username && x.username === un));
    if (!b) return res.status(403).json(util.fail('您还没有开通分站', 403));
    if (b.status === 0) return res.status(401).json(util.fail('分站已被停用，请联系上级', 401));
    req.branch = b;
    req.user = u;
    return next();
  }
  return res.status(401).json(util.fail('未登录或登录已过期', 401));
}

async function optionalUser(req, res, next) {
  const s = await sessionFromReq(req);
  if (s && s.role === 'user') {
    const d = db.load();
    const user = d.users.find((u) => u.id === s.userId);
    if (user) req.user = user;
  }
  next();
}

module.exports = { createSession, requireUser, requireAdmin, requireBranch, requireBranchOrUser, optionalUser };
