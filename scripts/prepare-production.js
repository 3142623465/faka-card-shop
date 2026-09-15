/**
 * prepare-production.js - 上线部署前数据清理
 * 用途：将项目从「演示/测试状态」一键切换到「可上线部署状态」：
 *   - 保留：站点全部配置 settings（站点名/管理员账号密码/支付配置/积分比例/自动取消参数/快捷导航等）
 *   - 清空：商品、分类、卡密（种子卡密为随机假码，绝不可上线出售）、演示用户、优惠券、FAQ、轮播、
 *           热搜词、订单、地址、购物车、收藏、消息、积分/余额流水、工单、客服对话、售后、会话、分站
 *   - 重置：id 计数器 seq（从 1 重新开始，无冲突风险）
 *   - 执行前自动备份当前数据库到 backups/
 * 用法：node scripts/prepare-production.js
 * 注意：清空操作不可逆（备份可恢复）；FAQ/轮播/热搜为演示内容，上线后请在后台重新配置。
 */
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

(async () => {
  const dataFile = path.join(__dirname, '..', 'data', 'db.json');
  const bakDir = path.join(__dirname, '..', 'backups');

  // 1. 备份当前数据库
  if (fs.existsSync(dataFile)) {
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
    const bakName = 'db-before-prod-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19).replace(/-/g, '') + '.json';
    fs.copyFileSync(dataFile, path.join(bakDir, bakName));
    console.log('[clean] 已备份当前数据 -> backups/' + bakName);
  }

  await db.init();
  const d = db.load();

  // 2. 保留 settings，清空全部业务集合
  const settings = d.settings;
  const seq = {}; // id 计数器重置，从 1 重新分配

  // 清空清单（若未来新增集合未列入，会被 JSON 覆盖删除，故在此显式声明保留字段）
  const clean = {
    settings, seq,
    users: [], products: [], categories: [], cards: [], orders: [],
    branches: [], coupons: [], userCoupons: [], cart: [], favorites: [],
    addresses: [], messages: [], pointsLogs: [], balanceLogs: [],
    tickets: [], chat: [], aftersales: [], sessions: [],
    faqs: [], banners: [], hotKeywords: [], guidePages: []
  };
  // 补全可能存在的其他集合为空数组，防止结构缺失
  for (const k of Object.keys(d)) {
    if (clean[k] === undefined) clean[k] = Array.isArray(d[k]) ? [] : d[k];
  }

  // 3. 落盘
  await db.seed(clean);
  await db.flushNow();

  // 4. 输出清理报告
  const after = db.load();
  const count = (arr) => (Array.isArray(arr) ? arr.length : '-');
  console.log('[clean] 清理完成，站点配置已保留：');
  console.log('  - 站点名称 : ' + after.settings.siteName);
  console.log('  - 管理员   : ' + after.settings.adminUsername + '（密码保持原样，请勿外泄）');
  console.log('  - 支付配置 : ' + (after.settings.payEnabled ? '已开启' : '未开启') + '（渠道密钥原样保留）');
  console.log('  - 商品/分类/卡密/订单/用户: ' + [after.products, after.categories, after.cards, after.orders, after.users].map((x) => count(x)).join(' / '));
  console.log('  - 优惠券/FAQ/轮播/热搜: ' + [after.coupons, after.faqs, after.banners, after.hotKeywords].map((x) => count(x)).join(' / '));
  console.log('  - 分站/地址/购物车/收藏/消息/流水/工单/会话: ' + [after.branches, after.addresses, after.cart, after.favorites, after.messages, after.pointsLogs, after.tickets, after.sessions].map((x) => count(x)).join(' / '));
  console.log('[clean] 数据库已满足上线部署要求（演示账号 demo@example.com 已移除）。');
})();
