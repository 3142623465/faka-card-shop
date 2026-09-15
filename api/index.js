/**
 * api/index.js - Vercel Serverless 函数入口
 * 优化：极简启动，路由懒加载，db异步初始化
 */
const express = require('express');
const path = require('path');

let app = null;
let dbReady = false;
let dbInitPromise = null;

async function initDb() {
  if (dbReady) return;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    try {
      const db = require('../server/db');
      const seed = require('../server/seed');
      await db.init();
      if (!db.load().settings) {
        const fresh = seed.build();
        await db.seed(fresh);
      }
      dbReady = true;
      console.log('[vercel] 数据库初始化完成');
    } catch (e) {
      console.error('[vercel] 数据库初始化失败:', e.message);
      dbInitPromise = null;
    }
  })();
  return dbInitPromise;
}

function createApp() {
  const application = express();
  // 捕获原始请求体（微信支付 v3 回调验签必须使用原始字节，JSON 重新序列化会导致签名不一致）
  application.use(express.json({ limit: '4mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  application.use(express.urlencoded({ extended: true, limit: '1mb', verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf.toString('utf8'); } }));

  // 安全响应头（与 server/server.js 对齐，M-2）
  application.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
    next();
  });

  // 禁止API缓存
  application.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // 验证码接口：不依赖db，直接响应
  application.get('/api/auth/captcha', (req, res) => {
    const captcha = require('../server/captcha');
    const util = require('../server/util');
    res.json(util.ok(captcha.getCaptcha()));
  });

  // 健康检查
  application.get('/api/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString(), dbReady } });
  });

  // 数据库就绪检查
  application.use('/api', async (req, res, next) => {
    if (req.path === '/auth/captcha' || req.path === '/health') return next();
    if (!dbReady) {
      await initDb();
      if (!dbReady) {
        return res.status(503).json({ code: 1, msg: '系统初始化中，请刷新页面重试' });
      }
    }
    next();
  });

  // 路由（懒加载）
  application.use('/api/auth', (req, res, next) => require('../server/routes/auth')(req, res, next));
  application.use('/api/shop', (req, res, next) => require('../server/routes/shop')(req, res, next));
  application.use('/api/user', (req, res, next) => require('../server/routes/user')(req, res, next));
  application.use('/api/admin', (req, res, next) => require('../server/routes/admin')(req, res, next));
  application.use('/api/pay', (req, res, next) => require('../server/routes/pay')(req, res, next));

  // SPA 前端路由回退
  application.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // 错误兜底
  application.use((err, req, res, next) => {
    console.error('[server] 异常:', err.message);
    res.status(500).json({ code: 1, msg: '服务器内部错误：' + err.message });
  });

  return application;
}

// 启动时异步初始化数据库
initDb();

module.exports = async (req, res) => {
  if (!app) {
    app = createApp();
  }
  return app(req, res);
};
