/**
 * server.js - 发卡网系统主服务
 * 启动方式：node server/server.js   （默认端口 3000，可用 PORT 环境变量覆盖）
 * 云部署：设置 MONGODB_URI 环境变量，数据持久化到 MongoDB，重启不丢失
 */
const express = require('express');
const path = require('path');
const db = require('./db');
const seed = require('./seed');

async function main() {
  /* ---------- 初始化数据库 ---------- */
  await db.init();

  /* ---------- 首次启动自动初始化种子数据 ---------- */
  if (!db.load().settings) {
    console.log('[server] 检测到首次启动，正在初始化演示数据...');
    const fresh = seed.build();
    await db.seed(fresh);
    console.log('[server] 初始化完成。管理后台账号 admin / admin123');
  }

  const app = express();
  app.set('trust proxy', 1); // 反代（Nginx 等）后正确识别 x-forwarded-proto / req.ip
  app.use(express.json({ limit: '4mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  /* ---------- 安全响应头（M-2）---------- */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'");
    next();
  });

  /* ---------- 静态资源 ---------- */
  app.use((req, res, next) => { if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css')) res.setHeader('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  /* ---------- 路由 ---------- */
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/shop', require('./routes/shop'));
  app.use('/api/user', require('./routes/user'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/pay', require('./routes/pay'));
  app.use('/api/branch', require('./routes/branch'));

  /* ---------- 健康检查 ---------- */
  app.get('/api/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString(), mongo: db.USE_MONGO } });
  });

  /* ---------- 404 ---------- */
  app.use((req, res) => {
    res.status(404).json({ code: 1, msg: '接口不存在' });
  });

  /* ---------- 错误兜底 ---------- */
  app.use((err, req, res, next) => {
    console.error('[server] 异常:', err.message);
    res.status(500).json({ code: 1, msg: '服务器内部错误：' + err.message });
  });

  const PORT = process.env.PORT || 3000;

  /* ---------- L-9：数据库自动备份（每日首次启动备份一次，保留最近 14 份） ---------- */
  (function autoBackupDb() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dataFile = path.join(__dirname, '..', 'data', 'db.json');
      const bakDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(dataFile)) return;
      if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const target = path.join(bakDir, 'db-auto-' + today + '.json');
      if (fs.existsSync(target)) return; // 当日已备份
      fs.copyFileSync(dataFile, target);
      // 清理 14 天前的自动备份
      const keep = 14;
      fs.readdirSync(bakDir)
        .filter((f) => /^db-auto-\d{8}\.json$/.test(f))
        .sort()
        .reverse()
        .slice(keep)
        .forEach((f) => { try { fs.unlinkSync(path.join(bakDir, f)); } catch (e) { /* 忽略 */ } });
      console.log('[backup] 数据库已自动备份: ' + target);
    } catch (e) {
      console.warn('[backup] 自动备份失败（不影响启动）:', e.message);
    }
  })();

  app.listen(PORT, () => {
    console.log('==============================================');
    console.log('  发卡网系统已启动');
    console.log('  数据库    : ' + (db.USE_MONGO ? 'MongoDB (云端持久化)' : '本地 JSON 文件'));
    console.log('  用户端    : http://localhost:' + PORT + '/index.html');
    console.log('  管理后台  : http://localhost:' + PORT + '/admin.html');
    console.log('  管理账号  : admin / admin123');
    console.log('  用户测试号: demo@example.com / 123456');
    // M-6：生产模式启动强校验 —— 阻断验证码 devCode 直显；开发模式明确提示
    if (process.env.NODE_ENV === 'production') {
      if (process.env.ALLOW_DEVCODE === '1') {
        console.log('  [安全警告] NODE_ENV=production 且 ALLOW_DEVCODE=1：验证码 devCode 直显已显式开启，仅限内部调试，上线前务必关闭！');
      } else {
        console.log('  安全模式  : NODE_ENV=production，验证码 devCode 直显已阻断');
      }
    } else {
      console.log('  开发模式  : 验证码 devCode 直显已开启（本地调试用），生产部署请设置 NODE_ENV=production 以自动阻断');
    }
    console.log('==============================================');
  });

  /* ---------- 定时任务：每 5 分钟扫描，超时订单自动取消 / 超期订单自动确认（不依赖接口触发） ---------- */
  setInterval(() => {
    try {
      const d = db.load();
      require('./routes/user').autoProcessOrders(d);
    } catch (e) {
      console.error('[scheduler] 订单自动处理失败:', e.message);
    }
  }, 5 * 60 * 1000).unref();
}

main().catch((e) => {
  console.error('[server] 启动失败:', e.message);
  process.exit(1);
});
