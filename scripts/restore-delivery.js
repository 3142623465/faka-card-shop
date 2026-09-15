/**
 * restore-delivery.js - 恢复交付态数据
 * 站点名 324云系统；清空业务数据；products 仅留总站商品；quickNav 7 项（无"首页"）
 * 用法：node scripts/restore-delivery.js （服务需先停止，改完重启服务）
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'db.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));

// 1. 清空业务表（保留：categories/products(总站)/banners/coupons/faqs/uploads/settings）
const EMPTY = ['users', 'orders', 'aftersales', 'cart', 'addresses', 'favorites',
  'messages', 'tickets', 'chat', 'pointsLogs', 'userCoupons', 'balanceLogs',
  'smsCodes', 'emailCodes', 'resetTokens', 'sessions', 'branches', 'cards'];
for (const k of EMPTY) if (Array.isArray(d[k])) d[k] = [];

// 2. products 仅保留总站商品（无 branchId）
if (Array.isArray(d.products)) {
  const before = d.products.length;
  d.products = d.products.filter((p) => !p.branchId);
  console.log(`products: ${before} -> ${d.products.length}`);
}

// 3. 站点信息
d.settings = d.settings || {};
d.settings.siteName = '324云系统';

// 4. quickNav 7 项（无"首页"；联系客服固定）
d.settings.quickNav = [
  { name: '全部分类', icon: 'category', cls: 'c1', img: '', link: '#/list?all=1', enabled: true, fixed: false },
  { name: '我的订单', icon: 'order', cls: 'c2', img: '', link: '#/orders', enabled: true, fixed: false },
  { name: '联系客服', icon: 'service', cls: 'c8', img: '', link: '#/service/chat', enabled: true, fixed: true },
  { name: '优惠券', icon: 'ticket', cls: 'c3', img: '', link: '#/coupons', enabled: true, fixed: false },
  { name: '开通分站', icon: 'branch', cls: 'c4', img: '', link: '#/open-branch', enabled: true, fixed: false },
  { name: '我的收藏', icon: 'heart', cls: 'c5', img: '', link: '#/favorites', enabled: true, fixed: false },
  { name: '个人资料', icon: 'user', cls: 'c6', img: '', link: '#/profile', enabled: true, fixed: false }
];

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf8');
console.log('交付态恢复完成：siteName=' + d.settings.siteName + ', users=' + d.users.length + ', branches=' + d.branches.length + ', orders=' + d.orders.length + ', products=' + d.products.length + ', quickNav=' + d.settings.quickNav.length);
