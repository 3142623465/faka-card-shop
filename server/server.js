/**
 * server.js - 发卡网系统主服务
 * 启动方式：node server/server.js   （默认端口 3000，可用 PORT 环境变量覆盖）
 * 云部署：设置 MONGODB_URI 环境变量，数据持久化到 MongoDB，重启不丢失
 */

/* ---------- .env 加载（零依赖，须在任何读取环境变量的模块之前执行） ---------- */
(function loadEnvFile() {
  try {
    const fs = require('fs');
    const path = require('path');
    const envFile = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envFile)) return;
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
    console.log('[env] 已加载 .env 配置文件');
  } catch (e) { /* .env 读取失败不阻断启动 */ }
})();

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
    try { require('./logger').error('http', err); } catch (e) { /* 忽略 */ }
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
    // H-2：敏感配置环境变量校验 —— 生产环境必须显式提供 SMTP_PASS，避免明文密钥随代码分发
    try {
      const cfg = require('./config');
      const isProd = process.env.NODE_ENV === 'production';
      const hasSmtpPass = !!(process.env.SMTP_PASS && process.env.SMTP_PASS.trim());
      if (!hasSmtpPass) {
        console.log('  [安全警告] 未设置 SMTP_PASS 环境变量：邮箱验证码/找回密码发信将使用 config.js 内置默认值。');
        console.log('             生产环境请务必在 .env 或平台环境变量中配置 SMTP_USER / SMTP_PASS，避免授权码明文泄露（H-2）。');
      }
      const smtpUser = cfg.mail && cfg.mail.user ? cfg.mail.user : '(未配置)';
      console.log('  邮件服务  : ' + smtpUser + (hasSmtpPass ? '' : '（未注入 SMTP_PASS）'));
      if (isProd && !hasSmtpPass) {
        console.log('  [安全警告] 当前为生产模式且未注入 SMTP_PASS，邮件服务存在密钥泄露风险，请立即配置环境变量。');
      }
    } catch (e) { /* config 读取失败不影响启动 */ }
    console.log('==============================================');
  });

  /* ---------- 定时任务：每 5 分钟扫描，超时订单自动取消 / 超期订单自动确认（不依赖接口触发） ---------- */
  setInterval(() => {
    try {
      const d = db.load();
      require('./routes/user').autoProcessOrders(d);
    } catch (e) {
      console.error('[scheduler] 订单自动处理失败:', e.message);
      try { require('./logger').error('scheduler', e); } catch (e2) { /* 忽略 */ }
    }
  }, 5 * 60 * 1000).unref();
}

/* ---------- 全局未捕获异常/拒绝：写日志，避免静默崩溃 ---------- */
process.on('uncaughtException', (err) => {
  console.error('[server] 未捕获异常:', err.message);
  try { require('./logger').error('uncaught', err); } catch (e) { /* 忽略 */ }
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] 未处理的 Promise 拒绝:', reason && reason.message ? reason.message : reason);
  try { require('./logger').error('unhandledRejection', reason); } catch (e) { /* 忽略 */ }
});

main().catch((e) => {
  console.error('[server] 启动失败:', e.message);
  try { require('./logger').error('startup', e); } catch (e2) { /* 忽略 */ }
  process.exit(1);
});
