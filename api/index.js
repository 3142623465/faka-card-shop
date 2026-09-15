/**
 * api/index.js - Vercel Serverless 函数入口
 * 把 Express 应用包装成 Vercel 可部署的 handler
 */
const express = require('express');
const path = require('path');
const db = require('../server/db');
const seed = require('../server/seed');

let app = null;
let initialized = false;

async function initApp() {
  if (app) return app;

  await db.init();
  if (!db.load().settings) {
    const fresh = seed.build();
    await db.seed(fresh);
  }

  app = express();
  app.use(express.json({ limit: '4mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 静态资源
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // 路由
  app.use('/api/auth', require('../server/routes/auth'));
  app.use('/api/shop', require('../server/routes/shop'));
  app.use('/api/user', require('../server/routes/user'));
  app.use('/api/admin', require('../server/routes/admin'));
  app.use('/api/pay', require('../server/routes/pay'));

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString(), mongo: db.USE_MONGO } });
  });

  // SPA 前端路由回退
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // 错误兜底
  app.use((err, req, res, next) => {
    console.error('[server] 异常:', err.message);
    res.status(500).json({ code: 1, msg: '服务器内部错误：' + err.message });
  });

  initialized = true;
  return app;
}

module.exports = async (req, res) => {
  try {
    const application = await initApp();
    return application(req, res);
  } catch (e) {
    console.error('[vercel] 初始化失败:', e.message);
    res.status(500).json({ code: 1, msg: '服务器初始化失败：' + e.message });
  }
};
