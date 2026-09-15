/**
 * api/index.js - Vercel Serverless 函数入口
 * 把 Express 应用包装成 Vercel 可部署的 handler
 * 优化：先创建app注册路由，db异步初始化，不阻塞简单接口
 */
const express = require('express');
const path = require('path');
const db = require('../server/db');
const seed = require('../server/seed');

let app = null;
let dbReady = false;
let dbInitPromise = null;

async function initDb() {
  if (dbReady) return;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    try {
      await db.init();
      if (!db.load().settings) {
        const fresh = seed.build();
        await db.seed(fresh);
      }
      dbReady = true;
      console.log('[vercel] 数据库初始化完成');
    } catch (e) {
      console.error('[vercel] 数据库初始化失败:', e.message);
      // 重置，下次重试
      dbInitPromise = null;
    }
  })();
  return dbInitPromise;
}

function createApp() {
  const application = express();
  application.use(express.json({ limit: '4mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  application.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 静态资源
  application.use(express.static(path.join(__dirname, '..', 'public')));

  // 验证码接口：不依赖db，直接响应
  const captcha = require('../server/captcha');
  const util = require('../server/util');
  application.get('/api/auth/captcha', (req, res) => {
    res.json(util.ok(captcha.getCaptcha()));
  });

  // 健康检查
  application.get('/api/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString(), dbReady } });
  });

  // 数据库就绪检查中间件
  application.use('/api', async (req, res, next) => {
    // 验证码和健康检查已经处理过了
    if (req.path === '/auth/captcha' || req.path === '/health') return next();
    if (!dbReady) {
      await initDb();
      if (!dbReady) {
        return res.status(503).json({ code: 1, msg: '系统初始化中，请稍后重试' });
      }
    }
    next();
  });

  // 路由
  application.use('/api/auth', require('../server/routes/auth'));
  application.use('/api/shop', require('../server/routes/shop'));
  application.use('/api/user', require('../server/routes/user'));
  application.use('/api/admin', require('../server/routes/admin'));
  application.use('/api/pay', require('../server/routes/pay'));

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

// 启动时异步初始化数据库（不阻塞冷启动）
initDb();

module.exports = async (req, res) => {
  if (!app) {
    app = createApp();
  }
  return app(req, res);
};
