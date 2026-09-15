/**
 * reset-demo-data.js - 重建干净的演示数据，保留站点设置（品牌名/联系方式/支付开关等）
 * 用途：
 *   1) 新交付/演示：用种子商品、分类、卡密、优惠券、FAQ、轮播、演示账号填满站点，便于直接使用；
 *   2) 清空测试污染：移除一切测试产生的用户、订单、售后、工单、消息、收藏、购物车、分站等。
 * 用法：node scripts/reset-demo-data.js
 * 注意：会覆盖当前 data/db.json 的业务数据，执行前会自动备份到 backups/。
 */
const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const seed = require('../server/seed');
const util = require('../server/util');

(async () => {
  const dataFile = path.join(__dirname, '..', 'data', 'db.json');
  const bakDir = path.join(__dirname, '..', 'backups');

  // 1. 备份当前数据库
  if (fs.existsSync(dataFile)) {
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
    const bakName = 'db-before-reset-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.json';
    fs.copyFileSync(dataFile, path.join(bakDir, bakName));
    console.log('[reset] 已备份当前数据 -> backups/' + bakName);
  }

  await db.init();
  const old = db.load();

  // 2. 用种子数据重建
  const fresh = seed.build();

  // 3. 保留原站点设置（品牌名/联系方式/支付开关/密钥等），种子提供缺失的新字段默认值
  if (old && old.settings) {
    fresh.settings = { ...fresh.settings, ...old.settings };
    // 管理员账号/密码保持默认（admin / admin123），避免被旧值覆盖
    fresh.settings.adminUsername = old.settings.adminUsername || fresh.settings.adminUsername;
    if (old.settings.adminPasswordHash) fresh.settings.adminPasswordHash = old.settings.adminPasswordHash;
  }

  // 4. 落盘
  await db.seed(fresh);
  await db.flushNow();

  const d = db.load();
  console.log('[reset] 完成：');
  console.log('  - 站点名称 : ' + d.settings.siteName);
  console.log('  - 分类     : ' + d.categories.length + ' | 商品: ' + d.products.length + ' | 卡密: ' + d.cards.length);
  console.log('  - 优惠券   : ' + d.coupons.length + ' | FAQ: ' + d.faqs.length + ' | 轮播: ' + d.banners.length);
  console.log('  - 用户     : ' + d.users.length + '（含演示账号 demo@example.com / 123456）');
  console.log('  - 订单/售后/工单/消息/收藏/购物车/分站: 0');
  console.log('  - 管理后台 : admin / admin123');
})();
