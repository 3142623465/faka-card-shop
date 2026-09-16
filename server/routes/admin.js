/**
 * routes/admin.js - 后台管理端接口
 * 登录 / 仪表盘 / 商品 / 卡密 / 分类 / 轮播 / 订单 / 售后 / 用户 / 优惠券 / FAQ / 工单 / 客服 / 消息 / 设置
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const util = require('../util');
const shop = require('./shop');
const settle = require('../settle');
const branchSign = require('../branch-sign');

/** 管理员登录 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const s = db.load().settings;
  if (username !== s.adminUsername || !util.verifyPassword(password, s.adminPasswordHash)) {
    return res.json(util.fail('账号或密码错误'));
  }
  const token = await auth.createSession(0, 'admin');
  res.json(util.ok({ token, username: s.adminUsername, siteName: s.siteName }));
});

/* ================= 仪表盘 ================= */

router.get('/stats', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const t = util.now();
  const dayStart = t - (t % 86400) - 8 * 3600; // 粗略当日零点（东八区）
  const today = d.orders.filter((o) => ['paid', 'shipped', 'completed'].includes(o.status) && o.payAt >= dayStart);
  const paidOrders = d.orders.filter((o) => ['paid', 'shipped', 'completed', 'refunded'].includes(o.status));
  const totalSales = paidOrders.reduce((s, o) => s + o.payAmount, 0);
  const todaySales = today.reduce((s, o) => s + o.payAmount, 0);
  const autoCards = d.cards.filter((c) => c.status === 'unused').length;

  // 近 7 天销售趋势
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const start = dayStart - i * 86400;
    const end = start + 86400;
    const amount = paidOrders.filter((o) => o.payAt >= start && o.payAt < end).reduce((s, o) => s + o.payAmount, 0);
    const count = paidOrders.filter((o) => o.payAt >= start && o.payAt < end).length;
    const dt = new Date(start * 1000);
    trend.push({ date: `${dt.getMonth() + 1}/${dt.getDate()}`, amount: Math.round(amount * 100) / 100, count });
  }

  // 热销商品 TOP5
  const salesMap = {};
  for (const o of paidOrders) {
    for (const g of o.goods) salesMap[g.productId] = (salesMap[g.productId] || 0) + g.quantity;
  }
  const topProducts = Object.entries(salesMap)
    .map(([pid, qty]) => {
      const p = d.products.find((x) => x.id === Number(pid));
      return p ? { id: p.id, name: p.name, qty, image: (p.images || [])[0] || '' } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lowStock = d.products
    .filter((p) => p.status === 1)
    .map((p) => ({ id: p.id, name: p.name, stock: shop.stockOf(p, d) }))
    .filter((p) => p.stock < 10)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 10);

  res.json(util.ok({
    todaySales, todayOrders: today.length,
    totalSales: Math.round(totalSales * 100) / 100,
    totalOrders: d.orders.length,
    totalUsers: d.users.filter((u) => !u.userDeleted && (!u.isThird || u.phone)).length,
    totalProducts: d.products.filter((p) => p.status === 1).length,
    totalCards: autoCards,
    platformIncome: Math.round((d.settings.platformIncome || 0) * 100) / 100,
    branchCount: d.branches.length,
    pendingWithdrawals: d.withdrawals.filter((w) => w.status === 'pending').length,
    pendingOrders: d.orders.filter((o) => o.status === 'pending').length,
    pendingAftersales: d.aftersales.filter((a) => a.status === 'pending').length,
    trend, topProducts, lowStock
  }));
});

/* ================= 商品管理 ================= */

router.get('/products', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { keyword, page = 1, size = 10, categoryId } = req.query;
  let list = d.products;
  if (categoryId) list = list.filter((p) => p.categoryId === Number(categoryId));
  if (keyword) list = list.filter((p) => util.matchKeyword(p, ['name', 'subtitle'], keyword));
  list = list.map((p) => ({
    ...p,
    stock: shop.stockOf(p, d),
    cardCount: d.cards.filter((c) => c.productId === p.id).length,
    categoryName: (d.categories.find((c) => c.id === p.categoryId) || {}).name || ''
  }));
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok(util.paginate(list, page, size)));
});

router.post('/products', auth.requireAdmin, (req, res) => {
  const { categoryId, name, subtitle, price, originalPrice, images, type, stock, detail, isHot, sort, cardNote, cardPrefix, cardCodeLen, cardSecretLen, cardCharset, status, keywords, cardsText } = req.body || {};
  if (!categoryId || !name || price === undefined) return res.json(util.fail('请填写分类、名称、价格'));
  if (type !== 'manual' && type !== 'auto') return res.json(util.fail('发货类型不正确'));
  const pprice = Number(price);
  if (!isFinite(pprice) || pprice < 0) return res.json(util.fail('商品价格不能为负数'));
  const pOrig = originalPrice !== undefined ? Number(originalPrice) : 0;
  if (!isFinite(pOrig) || pOrig < 0) return res.json(util.fail('划线价不能为负数'));
  const p = {
    id: util.nextId('products'),
    categoryId: Number(categoryId),
    name, subtitle: subtitle || '',
    price: pprice,
    originalPrice: pOrig,
    images: Array.isArray(images) && images.length ? images : ['/img/placeholder.svg'],
    type,
    stock: Number(stock) || 0,
    detail: detail || '',
    isHot: !!isHot, sort: Number(sort) || 0,
    status: status === undefined ? 1 : (status ? 1 : 0),
    keywords: keywords || '',
    cardNote: cardNote || '',
    cardPrefix: cardPrefix || '',
    cardCodeLen: Math.min(32, Math.max(6, Number(cardCodeLen) || 16)),
    cardSecretLen: Math.min(32, Math.max(4, Number(cardSecretLen) || 8)),
    cardCharset: cardCharset || 'alnum',
    sales: 0, createdAt: util.now()
  };
  const stripH = (v) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().slice(0, 500);
  p.name = stripH(p.name); p.subtitle = stripH(p.subtitle); p.cardNote = stripH(p.cardNote); p.keywords = stripH(p.keywords);
  db.mutate((d) => d.products.push(p));
  // 新建商品时批量粘贴卡密：每行一条，自动计入库存（统一库存池）
  if (type === 'auto' && String(cardsText || '').trim()) {
    const add = addCardsToProduct(p.id, String(cardsText).trim());
    if (!add.ok) return res.json(util.ok(Object.assign({}, p, { cardsAdd: add })));
  }
  syncProductStock(p);
  res.json(util.ok(p));
});

/** 同步商品库存：auto 商品 stock = 未使用卡密数（统一库存池口径） */
function syncProductStock(p, d) {
  if (!p || p.type !== 'auto') return;
  const dd = d || db.load();
  p.stock = dd.cards.filter((c) => c.productId === p.id && c.status === 'unused').length;
  db.save();
}

/** 解析并添加卡密文本（每行一条），返回 {ok, added, duplicated, msg} */
function addCardsToProduct(pid, raw) {
  const d = db.load();
  const p = d.products.find((x) => x.id === pid);
  if (!p) return { ok: false, msg: '商品不存在' };
  if (!raw.trim()) return { ok: false, msg: '请输入卡密内容' };
  let entries = [];
  if (raw.trim().startsWith('[')) {
    try { entries = JSON.parse(raw.trim()).map((x) => ({ code: String(x.code || x[0] || '').trim(), secret: String(x.secret || x[1] || '').trim() })); }
    catch (e) { return { ok: false, msg: 'JSON 格式不正确' }; }
  } else {
    entries = raw.split(/\r?\n/).map((line) => {
      let [code, secret] = line.split(/----|,|\s+/);
      return { code: String(code || '').trim(), secret: String(secret || '').trim() };
    });
  }
  const now = util.now();
  const newCards = [];
  let duplicated = 0;
  const seenBatch = new Set();
  for (const e of entries) {
    if (!e.code) continue;
    const k = e.code;
    if (seenBatch.has(k) || d.cards.some((c) => c.productId === pid && c.code === k)) { duplicated++; continue; }
    seenBatch.add(k);
    newCards.push({ id: util.nextId('cards'), productId: pid, code: e.code, secret: e.secret, status: 'unused', orderId: 0, usedAt: 0, createdAt: now });
  }
  if (!newCards.length) return { ok: false, added: 0, duplicated, msg: duplicated ? '没有可添加的卡密：' + duplicated + ' 条已存在或本批重复' : '请输入卡密内容' };
  d.cards.push(...newCards);
  syncProductStock(p, d);
  db.save();
  return { ok: true, added: newCards.length, duplicated, msg: duplicated ? `成功添加 ${newCards.length} 条卡密，跳过 ${duplicated} 条重复` : `成功添加 ${newCards.length} 条卡密` };
}

router.put('/products/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const p = d.products.find((x) => x.id === Number(req.params.id));
  if (!p) return res.json(util.fail('商品不存在'));
  const { categoryId, name, subtitle, price, originalPrice, images, type, stock, detail, isHot, sort, cardNote, cardPrefix, cardCodeLen, cardSecretLen, cardCharset, status, keywords, cardsText } = req.body || {};
  if (price !== undefined) { const pv = Number(price); if (!isFinite(pv) || pv < 0) return res.json(util.fail('商品价格不能为负数')); }
  if (originalPrice !== undefined) { const ov = Number(originalPrice); if (!isFinite(ov) || ov < 0) return res.json(util.fail('划线价不能为负数')); }
  if (categoryId !== undefined) p.categoryId = Number(categoryId);
  if (name !== undefined) p.name = name;
  if (subtitle !== undefined) p.subtitle = subtitle;
  if (price !== undefined) p.price = Number(price) || 0;
  if (originalPrice !== undefined) p.originalPrice = Number(originalPrice) || 0;
  if (images !== undefined) p.images = Array.isArray(images) && images.length ? images : ['/img/placeholder.svg'];
  if (type !== undefined && ['auto', 'manual'].includes(type)) {
    // 切换发货类型不再清空库存：auto→manual 库存保留（此时 stock=剩余卡密数）；manual→auto 保留原库存，导入卡密后自动对齐
    p.type = type;
  }
  if (stock !== undefined && p.type === 'manual') p.stock = Math.max(0, Number(stock) || 0);
  if (detail !== undefined) p.detail = detail;
  if (isHot !== undefined) p.isHot = !!isHot;
  if (sort !== undefined) p.sort = Number(sort) || 0;
  if (status !== undefined) p.status = status ? 1 : 0;
  if (keywords !== undefined) p.keywords = keywords;
  if (cardNote !== undefined) p.cardNote = cardNote;
  if (cardPrefix !== undefined) p.cardPrefix = cardPrefix;
  if (cardCodeLen !== undefined) p.cardCodeLen = Math.min(32, Math.max(6, Number(cardCodeLen) || 16));
  if (cardSecretLen !== undefined) p.cardSecretLen = Math.min(32, Math.max(4, Number(cardSecretLen) || 8));
  if (cardCharset !== undefined) p.cardCharset = cardCharset || 'alnum';
  const stripH = (v) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().slice(0, 500);
  p.name = stripH(p.name); p.subtitle = stripH(p.subtitle); p.cardNote = stripH(p.cardNote); p.keywords = stripH(p.keywords);
  // 编辑时批量粘贴卡密
  if (p.type === 'auto' && String(cardsText || '').trim()) {
    const add = addCardsToProduct(p.id, String(cardsText).trim());
    if (!add.ok && !add.added) return res.json(util.ok(Object.assign({}, p, { cardsAdd: add })));
  }
  syncProductStock(p, d);
  db.save();
  res.json(util.ok(p));
});

router.delete('/products/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const orderCount = d.orders.filter((o) => o.goods.some((g) => g.productId === id)).length;
  db.mutate((d) => {
    d.products = d.products.filter((p) => p.id !== id);
    // 仅删除未使用的卡密；已发货（含售后中）卡密必须保留，保证历史订单的卡密追溯
    d.cards = d.cards.filter((c) => !(c.productId === id && !c.orderId && c.status === 'unused'));
    d.favorites = d.favorites.filter((f) => f.productId !== id);
    d.cart = d.cart.filter((c) => c.productId !== id);
  });
  res.json(util.ok({ msg: '已删除', historyOrders: orderCount }));
});

/* ================= 卡密管理 ================= */

/** 商品卡密列表 */
router.get('/products/:id/cards', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const pid = Number(req.params.id);
  const { status = 'all', page = 1, size = 20, keyword } = req.query;
  let list = d.cards.filter((c) => c.productId === pid);
  if (status !== 'all') list = list.filter((c) => c.status === status);
  if (keyword) list = list.filter((c) => c.code.indexOf(keyword) >= 0 || (c.secret || '').indexOf(keyword) >= 0);
  list.sort((a, b) => b.id - a.id);
  const pg = util.paginate(list, page, size);
  const all = d.cards.filter((c) => c.productId === pid);
  pg.unused = all.filter((c) => c.status === 'unused').length;
  pg.used = all.filter((c) => c.status === 'used').length;
  res.json(util.ok(pg));
});

/**
 * 批量添加卡密
 * text 每行一条，支持格式：
 *   CODE
 *   CODE----SECRET
 *   CODE,SECRET
 *   CODE SECRET
 * 或 JSON 数组 [{"code":"","secret":""}]
 * 也可 count + 自动生成
 */
router.post('/products/:id/cards', auth.requireAdmin, (req, res) => {
  const pid = Number(req.params.id);
  const { text, autoGenerate, count, prefix, startNo } = req.body || {};
  const d = db.load();
  const p = d.products.find((x) => x.id === pid);
  if (!p) return res.json(util.fail('商品不存在'));
  if (p.type !== 'auto') return res.json(util.fail('仅自动发货商品需要卡密'));

  const newCards = [];
  let duplicated = 0;
  const now = util.now();

  if (autoGenerate) {
    const n = Math.max(1, Math.min(10000, parseInt(count) || 1));
    const seqPrefix = String(prefix || '').trim();
    const seqStart = parseInt(startNo) || 0;
    // 连续编号模式：前缀 + 起始编号，每条卡号递增、密钥随机
    const genP = seqPrefix ? Object.assign({}, p, { _seq: { prefix: seqPrefix, startNo: seqStart } }) : p;
    const seenBatch = new Set();
    for (let i = 0; i < n; i++) {
      const code = util.genCardCode(genP, i);
      if (seenBatch.has(code)) { duplicated++; continue; } // 同批去重（连续编号或随机几乎不会撞）
      seenBatch.add(code);
      newCards.push({
        id: util.nextId('cards'), productId: pid,
        code, secret: util.genCardSecret(genP),
        status: 'unused', orderId: 0, usedAt: 0, createdAt: now
      });
    }
  } else {
    const raw = String(text || '').trim();
    if (!raw) return res.json(util.fail('请输入卡密内容'));
    let entries = [];
    // JSON 数组支持
    if (raw.startsWith('[')) {
      try {
        entries = JSON.parse(raw).map((x) => ({ code: String(x.code || x[0] || '').trim(), secret: String(x.secret || x[1] || '').trim() }));
      } catch (e) { return res.json(util.fail('JSON 格式不正确')); }
    } else {
      entries = raw.split(/\r?\n/).map((line) => {
        let [code, secret] = line.split(/----|,|\s+/);
        return { code: String(code || '').trim(), secret: String(secret || '').trim() };
      });
    }
    const seenBatch = new Set(); // L-10：同批次内重复检测
    for (const e of entries) {
      if (!e.code) continue;
      const k = e.code;
      if (seenBatch.has(k) || d.cards.some((c) => c.productId === pid && c.code === k)) { duplicated++; continue; } // 商品维度去重 + 本批去重
      seenBatch.add(k);
      newCards.push({
        id: util.nextId('cards'), productId: pid,
        code: e.code, secret: e.secret,
        status: 'unused', orderId: 0, usedAt: 0, createdAt: now
      });
    }
    if (!newCards.length) {
      return res.json(util.ok({ added: 0, duplicated, msg: duplicated ? '没有可添加的卡密：' + duplicated + ' 条已在当前商品中存在或本批重复' : '请输入卡密内容' }));
    }
  }

  if (!newCards.length) return res.json(util.fail('没有可添加的卡密（已存在或内容为空）'));
  d.cards.push(...newCards);
  syncProductStock(p, d);
  db.save();
  res.json(util.ok({ added: newCards.length, duplicated, msg: duplicated ? `成功添加 ${newCards.length} 条卡密，跳过 ${duplicated} 条重复` : `成功添加 ${newCards.length} 条卡密` }));
});

/** 删除单条卡密 */
router.delete('/cards/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const card = d.cards.find((c) => c.id === id);
  if (!card) return res.json(util.fail('卡密不存在'));
  if (card.status === 'used') return res.json(util.fail('该卡密已售出，无法删除'));
  db.mutate((d) => { d.cards = d.cards.filter((c) => c.id !== id); });
  const p = d.products.find((x) => x.id === card.productId);
  if (p) syncProductStock(p, d);
  res.json(util.ok({ msg: '已删除' }));
});

/** Excel/CSV 导入卡密（.xlsx/.xls/.csv，第一列卡号、第二列密钥，自动跳过表头与重复） */
router.post('/products/:id/cards/import', auth.requireAdmin, (req, res) => {
  const pid = Number(req.params.id);
  const { data, filename = '' } = req.body || {};
  const d = db.load();
  const p = d.products.find((x) => x.id === pid);
  if (!p) return res.json(util.fail('商品不存在'));
  if (p.type !== 'auto') return res.json(util.fail('仅自动发货商品需要卡密'));
  if (!data) return res.json(util.fail('请选择要导入的文件'));
  let XLSX;
  try { XLSX = require('xlsx'); } catch (e) { return res.json(util.fail('服务端缺少 xlsx 解析库，请先 npm install xlsx')); }
  let wb;
  try {
    const buf = Buffer.from(data, 'base64');
    const ext = String(filename).toLowerCase().split('.').pop();
    if (ext === 'csv') wb = XLSX.read(buf.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string' });
    else wb = XLSX.read(buf, { type: 'buffer' });
  } catch (e) { return res.json(util.fail('文件解析失败：' + e.message)); }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return res.json(util.fail('文件中没有数据'));
  let rows = [];
  try { rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); } catch (e) { return res.json(util.fail('表格解析失败：' + e.message)); }
  const newCards = [];
  let duplicated = 0;
  const now = util.now();
  const seenBatch = new Set();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const code = String(row[0] || '').trim();
    const secret = String(row[1] || '').trim();
    if (!code) continue;
    if (/^(卡号|卡密|卡号\/密钥|卡号,密钥|code|卡号\/卡密)$/i.test(code)) continue; // 跳过表头行
    if (seenBatch.has(code) || d.cards.some((c) => c.productId === pid && c.code === code)) { duplicated++; continue; }
    seenBatch.add(code);
    newCards.push({ id: util.nextId('cards'), productId: pid, code, secret, status: 'unused', orderId: 0, usedAt: 0, createdAt: now });
  }
  if (!newCards.length) {
    return res.json(util.ok({ added: 0, duplicated, msg: duplicated ? `没有可导入的卡密：${duplicated} 条重复或为空` : '文件中没有有效的卡密数据（第 1 列卡号、第 2 列密钥）' }));
  }
  d.cards.push(...newCards);
  syncProductStock(p, d);
  db.save();
  res.json(util.ok({ added: newCards.length, duplicated, msg: duplicated ? `成功导入 ${newCards.length} 条卡密，跳过 ${duplicated} 条重复` : `成功导入 ${newCards.length} 条卡密` }));
});

/** 导出卡密 CSV（Excel 可直接打开，含 BOM；按当前筛选状态） */
router.get('/products/:id/cards/export', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const pid = Number(req.params.id);
  const { status = 'all' } = req.query;
  let list = d.cards.filter((c) => c.productId === pid);
  if (status !== 'all') list = list.filter((c) => c.status === status);
  list.sort((a, b) => b.id - a.id);
  const lines = ['卡号,密钥,状态,售出时间'];
  for (const c of list) {
    const usedAt = c.usedAt ? new Date(c.usedAt).toLocaleString('zh-CN', { hour12: false }) : '';
    const line = [c.code, c.secret || '', c.status === 'unused' ? '未使用' : '已使用', usedAt];
    lines.push(line.join(','));
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  const p = d.products.find((x) => x.id === pid);
  const stName = status === 'all' ? '全部' : (status === 'used' ? '已使用' : '未使用');
  const name = encodeURIComponent((p ? p.name : '卡密') + '-' + stName);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}.csv`);
  res.send(csv);
});

/* ================= 分类管理 ================= */

router.get('/categories', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const parents = d.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort);
  const tree = parents.map((p) => ({
    ...p,
    children: d.categories.filter((c) => c.parentId === p.id).sort((a, b) => a.sort - b.sort)
  }));
  res.json(util.ok(tree));
});

router.post('/categories', auth.requireAdmin, (req, res) => {
  const { name, parentId, icon, sort = 0, status = 1 } = req.body || {};
  if (!name) return res.json(util.fail('请输入分类名称'));
  const c = {
    id: util.nextId('categories'), name,
    parentId: parentId ? Number(parentId) : null,
    icon: icon || '', sort: Number(sort) || 0, status: status ? 1 : 0
  };
  db.mutate((d) => d.categories.push(c));
  res.json(util.ok(c));
});

router.put('/categories/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const c = d.categories.find((x) => x.id === Number(req.params.id));
  if (!c) return res.json(util.fail('分类不存在'));
  const { name, parentId, icon, sort, status } = req.body || {};
  if (name !== undefined) c.name = name;
  if (parentId !== undefined) {
    const pid = parentId ? Number(parentId) : null;
    if (pid === c.id) return res.json(util.fail('上级分类不能是自己'));
    c.parentId = pid;
  }
  if (icon !== undefined) c.icon = icon;
  if (sort !== undefined) c.sort = Number(sort) || 0;
  if (status !== undefined) c.status = status ? 1 : 0;
  db.save();
  res.json(util.ok(c));
});

router.delete('/categories/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  if (d.products.some((p) => p.categoryId === id)) {
    return res.json(util.fail('该分类下存在商品，无法删除'));
  }
  const hasChild = d.categories.some((c) => c.parentId === id);
  if (hasChild && d.products.some((p) => d.categories.some((c) => c.parentId === id && c.id === p.categoryId))) {
    return res.json(util.fail('该分类的子分类下存在商品，无法删除'));
  }
  db.mutate((d) => {
    d.categories = d.categories.filter((c) => c.id !== id && c.parentId !== id);
  });
  res.json(util.ok({ msg: '已删除' }));
});

/* ================= 轮播图 ================= */

router.get('/banners', auth.requireAdmin, (req, res) => {
  const d = db.load();
  res.json(util.ok(d.banners.sort((a, b) => (a.sort || 0) - (b.sort || 0))));
});

router.post('/banners', auth.requireAdmin, (req, res) => {
  const { title, image, linkType = 'none', link = '', sort = 0, status = 1 } = req.body || {};
  if (!image) return res.json(util.fail('请上传轮播图片'));
  const b = {
    id: util.nextId('banners'), title: title || '', image,
    linkType, link, sort: Number(sort) || 0, status: status ? 1 : 0
  };
  db.mutate((d) => d.banners.push(b));
  res.json(util.ok(b));
});

router.put('/banners/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const b = d.banners.find((x) => x.id === Number(req.params.id));
  if (!b) return res.json(util.fail('轮播图不存在'));
  const { title, image, linkType, link, sort, status } = req.body || {};
  if (title !== undefined) b.title = title;
  if (image !== undefined) b.image = image;
  if (linkType !== undefined) b.linkType = linkType;
  if (link !== undefined) b.link = link;
  if (sort !== undefined) b.sort = Number(sort) || 0;
  if (status !== undefined) b.status = status ? 1 : 0;
  db.save();
  res.json(util.ok(b));
});

router.delete('/banners/:id', auth.requireAdmin, (req, res) => {
  db.mutate((d) => { d.banners = d.banners.filter((b) => b.id !== Number(req.params.id)); });
  res.json(util.ok({ msg: '已删除' }));
});

/* ================= 订单管理 ================= */

router.get('/orders', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { status = 'all', keyword, branch, page = 1, size = 10 } = req.query;
  let list = d.orders;
  if (status !== 'all') list = list.filter((o) => o.status === status);
  if (branch) {
    const b = d.branches.find((x) => x.username === String(branch).trim() || x.id === Number(branch));
    if (!b) return res.json(util.fail('分站不存在'));
    list = list.filter((o) => o.branchId === b.id);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((o) =>
      o.orderNo.toLowerCase().indexOf(kw) >= 0 ||
      (o.address.name || '').toLowerCase().indexOf(kw) >= 0 ||
      (o.address.phone || '').indexOf(kw) >= 0 ||
      o.goods.some((g) => g.name.toLowerCase().indexOf(kw) >= 0)
    );
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  const pg = util.paginate(list, page, size);
  pg.list = pg.list.map((o) => {
    const user = d.users.find((u) => u.id === o.userId);
    const br = o.branchId ? d.branches.find((x) => x.id === o.branchId) : null;
    return { ...o, userPhone: user ? (user.phone || user.nickname) : '', branchName: br ? br.name : '' };
  });
  res.json(util.ok(pg));
});

router.get('/orders/export', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { status = 'all', keyword, branch } = req.query;
  let list = d.orders;
  if (status !== 'all') list = list.filter((o) => o.status === status);
  if (branch) {
    const b = d.branches.find((x) => x.username === String(branch).trim() || x.id === Number(branch));
    if (!b) return res.json(util.fail('分站不存在'));
    list = list.filter((o) => o.branchId === b.id);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((o) =>
      o.orderNo.toLowerCase().indexOf(kw) >= 0 ||
      (o.address.name || '').toLowerCase().indexOf(kw) >= 0 ||
      (o.address.phone || '').indexOf(kw) >= 0 ||
      o.goods.some((g) => g.name.toLowerCase().indexOf(kw) >= 0)
    );
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  const STATUS_TEXT = { pending: '待付款', pending_confirm: '待确认收款', paid: '待发货', shipped: '待收货', completed: '已完成', cancelled: '已取消', refunded: '已退款' };
  const fmt = (ts) => { if (!ts) return ''; const t = new Date(ts * 1000); const p = (n) => String(n).padStart(2, '0'); return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes()); };
  const csvEscape = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['订单号', '状态', '用户', '商品', '数量', '实付金额', '支付渠道', '下单时间', '收货人', '电话', '地址', '备注', '分站'];
  const rows = list.map((o) => {
    const user = d.users.find((u) => u.id === o.userId);
    const br = o.branchId ? d.branches.find((x) => x.id === o.branchId) : null;
    return [
      o.orderNo, STATUS_TEXT[o.status] || o.status,
      user ? (user.nickname || user.email || user.phone || '') : '',
      o.goods.map((g) => g.name).join(' | '), o.goods.reduce((s, g) => s + (g.quantity || 1), 0),
      (o.payAmount != null ? o.payAmount : o.totalAmount), o.channel || 'simulate', fmt(o.createdAt),
      (o.address && o.address.name) || '', (o.address && o.address.phone) || '',
      (o.address && [o.address.region, o.address.detail].filter(Boolean).join(' ')) || '',
      o.remark || '', br ? br.name : ''
    ].map(csvEscape).join(',');
  });
  const csv = '\uFEFF' + head.map(csvEscape).join(',') + '\r\n' + rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders-' + new Date().toISOString().slice(0, 10) + '.csv"');
  res.send(csv);
});

router.get('/orders/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  const cards = d.cards.filter((c) => c.orderId === o.id);
  const user = d.users.find((u) => u.id === o.userId);
  res.json(util.ok({ ...o, userPhone: user ? (user.phone || user.nickname) : '', cards }));
});

/** 手动发货（填写物流单号） */
router.post('/orders/:id/ship', auth.requireAdmin, (req, res) => {
  const { trackingNo, logistics = '快递', cards } = req.body || {};
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'paid') return res.json(util.fail('仅待发货订单可发货'));
  const isVirtual = o.goods && o.goods.every((g) => g.type === 'auto');
  // 虚拟商品（自动发货）无需物流单号；实体/手动商品建议填写
  if (!isVirtual && !trackingNo) return res.json(util.fail('请填写物流单号'));
  o.status = 'shipped';
  o.shippedAt = util.now();
  if (trackingNo) { o.trackingNo = trackingNo; o.logistics = logistics; }
  else { o.trackingNo = '无需物流'; o.logistics = '虚拟商品'; }
  // 手动补发卡密（每行一条，发货时写入订单卡密记录）
  let cardsDelivered = 0;
  const cardText = String(cards || '').trim();
  if (cardText) {
    const t = util.now();
    for (const line of cardText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let [code, secret] = line.trim().split(/----|,|\s+/);
      if (!code) continue;
      d.cards.push({
        id: util.nextId('cards'), productId: (o.goods && o.goods[0] && o.goods[0].productId) || 0,
        code: String(code).trim(), secret: String(secret || '').trim(),
        status: 'used', orderId: o.id, usedAt: t, createdAt: t
      });
      cardsDelivered++;
    }
    o.cardsDelivered = (o.cardsDelivered || 0) + cardsDelivered;
    // 库存已在支付结算时扣减（settle），此处不再重复扣减
  }
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '订单已发货', content: `订单 ${o.orderNo} 已发货${trackingNo ? `，物流公司：${logistics}，单号：${trackingNo}` : '（虚拟商品，无需物流）'}${cardsDelivered ? `，卡密已发送 ${cardsDelivered} 条` : ''}`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  res.json(util.ok({ msg: '发货成功', cardsDelivered }));
});

/** 强制取消订单（退款） */
router.post('/orders/:id/refund', auth.requireAdmin, (req, res) => {
  const { reason = '商家退款' } = req.body || {};
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (!['paid', 'shipped'].includes(o.status)) return res.json(util.fail('当前状态不可退款'));
  const done = refundOrder(d, o, reason);
  if (!done) return res.json(util.fail('订单已退款，请勿重复操作'));
  db.save();
  res.json(util.ok({ msg: '已退款' }));
});

/** 确认手动转账收款（待确认 → 已支付 → 自动发卡） */
router.post('/orders/:id/confirm-pay', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'pending_confirm') return res.json(util.fail('仅待确认订单可确认收款'));
  o.payChannel = o.payChannel || 'manual';
  const r = settle.settlePaidOrder(d, o, o.payChannel || 'manual');
  if (!r.ok) return res.json(util.fail(r.error));
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '支付已确认', content: `订单 ${o.orderNo} 支付已确认，${r.autoShipped ? '卡密已自动发送' : '请等待发货'}`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  res.json(util.ok({ msg: '已确认收款', status: r.status, autoShipped: r.autoShipped }));
});

/** 修改订单价格（仅待付款订单可改） */
router.put('/orders/:id/price', auth.requireAdmin, (req, res) => {
  const { payAmount } = req.body || {};
  const amount = parseFloat(payAmount);
  if (isNaN(amount) || amount < 0) return res.json(util.fail('请输入正确的金额'));
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (o.status !== 'pending') return res.json(util.fail('仅待付款订单可修改价格'));
  // 记录调价差额（对账口径：销售额按实际 payAmount 统计，调价差额单独留痕）
  const prev = o.payAmount;
  o.payAmount = Math.round(amount * 100) / 100;
  o.priceAdjust = Math.round((o.payAmount - prev) * 100) / 100;
  o.priceModified = true;
  o.priceModifiedAt = util.now();
  db.save();
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '订单价格已调整', content: `订单 ${o.orderNo} 的应付金额已调整为 ¥${o.payAmount.toFixed(2)}，请尽快完成支付。`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  res.json(util.ok({ msg: '价格已修改', payAmount: o.payAmount }));
});

/** 删除订单（仅待付款/已取消/已退款可删） */
router.delete('/orders/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const o = d.orders.find((x) => x.id === Number(req.params.id));
  if (!o) return res.json(util.fail('订单不存在'));
  if (!['pending', 'cancelled', 'refunded'].includes(o.status)) {
    return res.json(util.fail('仅待付款、已取消、已退款订单可删除'));
  }
  // 恢复待付款订单的优惠券
  if (o.status === 'pending' && o.couponId) {
    const uc = d.userCoupons.find((x) => x.orderId === o.id && x.userId === o.userId && x.status === 'used');
    if (uc) { uc.status = 'unused'; uc.orderId = 0; uc.usedAt = 0; }
  }
  d.orders = d.orders.filter((x) => x.id !== o.id);
  db.save();
  res.json(util.ok({ msg: '订单已删除' }));
});

/** 退款公共逻辑：恢复库存/卡密、返还优惠券、冲正分站分成。
 *  返回 true=本次执行了退款；false=订单已退款/已取消，已幂等跳过，防止重复扣积分、重复回收卡密。 */
function refundOrder(d, o, reason) {
  // 幂等保护（资金安全）：已退款 / 已取消订单不得再次执行资产冲正。
  // 场景：订单先经「订单退款」退过，关联售后单又被点「同意退款」，会导致积分被重复扣回、消息重复推送。
  if (o.status === 'refunded' || o.status === 'cancelled') return false;
  o.status = 'refunded';
  o.cancelReason = reason;
  o.cancelledAt = util.now();
  // 恢复卡密：仅回收"总站卡池"的卡密；分站手动发货卡密（productId 指向分站商品）只作废展示不回收
  if (o.cardsDelivered > 0) {
    const isBranchOrder = (Array.isArray(o.branchIds) && o.branchIds.length > 0) || o.branchId > 0;
    d.cards.forEach((c) => {
      if (c.orderId !== o.id) return;
      const p = d.products.find((x) => x.id === c.productId);
      const branchCard = p ? (p.branchId > 0) : isBranchOrder;
      if (!branchCard) {
        // 总站卡池卡密：回滚为未使用，可重新发卡
        c.status = 'unused'; c.orderId = 0; c.usedAt = 0;
      } else {
        // 分站手动卡密：作废（保留 used 状态与订单关联，展示用），不重新入库
        c.status = 'invalid';
      }
    });
  }
  // 恢复手动库存 / 重算自动库存（统一库存池）
  for (const g of o.goods) {
    const p = d.products.find((x) => x.id === g.productId);
    if (!p) continue;
    if (p.type === 'manual') p.stock = (p.stock || 0) + g.quantity;
    else if (p.type === 'auto') p.stock = d.cards.filter((c) => c.productId === p.id && c.status === 'unused').length;
  }
  // 冲正分站分成（扣回已计入分站余额的差价）
  settle.revertBranchShare(d, o);
  // 返还优惠券
  const uc = d.userCoupons.find((x) => x.orderId === o.id && x.userId === o.userId && x.status === 'used');
  if (uc) { uc.status = 'unused'; uc.orderId = 0; uc.usedAt = 0; }
  // 扣回积分与消费额
  const user = d.users.find((u) => u.id === o.userId);
  if (user) {
    user.totalSpend = Math.max(0, (user.totalSpend || 0) - o.payAmount);
    const earn = Math.floor(o.payAmount * (d.settings.pointsRate || 1));
    if (earn > 0) {
      user.points = Math.max(0, (user.points || 0) - earn);
      d.pointsLogs.push({
        id: util.nextId('pointsLogs'), userId: user.id, change: -earn,
        balance: user.points, type: 'spend', desc: '退款扣回（订单 ' + o.orderNo + '）', createdAt: util.now()
      });
    }
  }
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'order',
    title: '订单已退款', content: `订单 ${o.orderNo} 已退款 ¥${o.payAmount.toFixed(2)}，款项将原路退回。原因：${reason}`,
    isRead: 0, createdAt: util.now()
  });
  return true;
}

/* ================= 售后管理 ================= */

router.get('/aftersales', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { status = 'all', page = 1, size = 10 } = req.query;
  let list = d.aftersales;
  if (status !== 'all') list = list.filter((a) => a.status === status);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const pg = util.paginate(list, page, size);
  pg.list = pg.list.map((a) => {
    const o = d.orders.find((x) => x.id === a.orderId);
    const u = d.users.find((x) => x.id === a.userId);
    return { ...a, orderNo: o ? o.orderNo : '', goods: o ? o.goods : [], userPhone: u ? (u.phone || u.nickname) : '' };
  });
  res.json(util.ok(pg));
});

/** 处理售后：approve 同意退款 / reject 驳回 */
router.post('/aftersales/:id/handle', auth.requireAdmin, (req, res) => {
  const { action, reply = '' } = req.body || {};
  const d = db.load();
  const a = d.aftersales.find((x) => x.id === Number(req.params.id));
  if (!a) return res.json(util.fail('售后单不存在'));
  if (a.status !== 'pending') return res.json(util.fail('该售后单已处理'));
  const o = d.orders.find((x) => x.id === a.orderId);
  if (!o) return res.json(util.fail('关联订单不存在'));

  if (action === 'approve') {
    // 资金安全：仅已付款后的订单（待发货/待收货/已完成）可走售后退款；
    // 待付款、待确认收款、已取消、已退款一律拦截，防止与「订单退款」重复执行导致积分/卡密重复冲正。
    const statusTextMap = { pending: '待付款', pending_confirm: '待确认收款', cancelled: '已取消', refunded: '已退款' };
    if (!['paid', 'shipped', 'completed'].includes(o.status)) {
      return res.json(util.fail('订单当前为「' + (statusTextMap[o.status] || o.status) + '」状态，不可退款，请勿重复操作'));
    }
    const done = refundOrder(d, o, '售后退款：' + (reply || a.reason));
    if (!done) return res.json(util.fail('订单已退款，请勿重复操作'));
    a.status = 'approved';
    a.reply = util.sanitizeHtml(reply).slice(0, 200) || '同意退款';
    a.handledAt = util.now();
  } else if (action === 'reject') {
    a.status = 'rejected';
    a.reply = util.sanitizeHtml(reply).slice(0, 200) || '不符合退款条件';
    a.handledAt = util.now();
    d.messages.push({
      id: util.nextId('messages'), userId: a.userId, type: 'order',
      title: '售后申请被驳回', content: `订单 ${o.orderNo} 的售后申请被驳回：${a.reply}。如有疑问请联系客服。`,
      isRead: 0, createdAt: util.now()
    });
  } else {
    return res.json(util.fail('参数不正确'));
  }
  db.save();
  db.flushNow(); // 退款/资金变更立即落盘
  res.json(util.ok({ msg: '处理完成' }));
});

/** 售后详情给客户发消息（站内消息+客服聊天） */
router.post('/aftersales/:id/message', auth.requireAdmin, (req, res) => {
  const { content } = req.body || {};
  if (!content || !String(content).trim()) return res.json(util.fail('消息内容不能为空'));
  const d = db.load();
  const a = d.aftersales.find((x) => x.id === Number(req.params.id));
  if (!a) return res.json(util.fail('售后单不存在'));
  const msg = util.sanitizeHtml(content).slice(0, 500);
  // 站内消息
  d.messages.push({
    id: util.nextId('messages'), userId: a.userId, type: 'service',
    title: '客服回复（售后 #' + a.id + '）', content: msg,
    isRead: 0, createdAt: util.now()
  });
  // 客服聊天记录
  d.chat.push({
    id: util.nextId('chat'), userId: a.userId, role: 'admin',
    content: '【售后 #' + a.id + '】' + msg,
    createdAt: util.now(), read: 0
  });
  db.save();
  res.json(util.ok({ msg: '已发送' }));
});

/** 订单详情：给客户发站内消息 + 客服对话记录 */
router.post('/orders/:id/message', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const msg = util.sanitizeHtml(String((req.body && req.body.content) || '')).slice(0, 500);
  if (!msg) return res.json(util.fail('请输入消息内容'));
  const d = db.load();
  const o = d.orders.find((x) => x.id === id);
  if (!o) return res.json(util.fail('订单不存在'));
  if (!o.userId) return res.json(util.fail('该订单无关联用户，无法发送站内消息'));
  d.messages.push({
    id: util.nextId('messages'), userId: o.userId, type: 'service',
    title: '客服回复（订单 ' + o.orderNo + '）', content: msg,
    isRead: 0, createdAt: util.now()
  });
  d.chat.push({
    id: util.nextId('chat'), userId: o.userId, role: 'admin',
    content: '【订单 ' + o.orderNo + '】' + msg,
    createdAt: util.now(), read: 0
  });
  db.save();
  res.json(util.ok({ msg: '已发送' }));
});

/* ================= 用户管理 ================= */

router.get('/users', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { keyword, page = 1, size = 10 } = req.query;
  // 已注销（软删除）用户不展示在列表
  let list = d.users.filter((u) => !u.userDeleted);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((u) => (u.phone || '').indexOf(kw) >= 0 || (u.email || '').toLowerCase().indexOf(kw) >= 0 || (u.nickname || '').toLowerCase().indexOf(kw) >= 0);
  }
  list = list.map((u) => ({
    id: u.id, phone: u.phone || '', email: u.email || '', nickname: u.nickname, avatar: u.avatar,
    points: u.points || 0, levelName: u.levelName || '普通会员',
    balance: u.balance || 0,
    totalSpend: u.totalSpend || 0, status: u.status, isThird: !!u.isThird,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    orderCount: d.orders.filter((o) => o.userId === u.id).length
  }));
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json(util.ok(util.paginate(list, page, size)));
});

router.put('/users/:id', auth.requireAdmin, async (req, res) => {
  const { status, points, nickname } = req.body || {};
  const d = db.load();
  const u = d.users.find((x) => x.id === Number(req.params.id));
  if (!u) return res.json(util.fail('用户不存在'));
  if (status !== undefined) {
    u.status = status ? 1 : 0;
    if (!u.status) {
      // 禁用时踢下线
      d.sessions = d.sessions.filter((s) => !(s.userId === u.id && s.role === 'user'));
    }
  }
  if (points !== undefined && Number(points) !== (u.points || 0)) {
    const diff = Math.max(0, Number(points) || 0) - (u.points || 0);
    u.points = Math.max(0, Number(points) || 0);
    d.pointsLogs.push({
      id: util.nextId('pointsLogs'), userId: u.id, change: diff,
      balance: u.points, type: diff > 0 ? 'earn' : 'spend',
      desc: '管理员调整积分', createdAt: util.now()
    });
  }
  if (nickname !== undefined) u.nickname = nickname;
  db.save();
  await db.flushNow(); // 禁用/改资料在 Serverless 下必须落库后再响应
  res.json(util.ok({ msg: '已保存' }));
});

/** 管理员调整用户余额（充值/扣款，用于开通分站支付） */
router.put('/users/:id/balance', auth.requireAdmin, async (req, res) => {
  const { delta, reason } = req.body || {};
  const diff = Number(delta);
  if (!isFinite(diff) || diff === 0) return res.json(util.fail('请输入有效的调整金额'));
  const d = db.load();
  const u = d.users.find((x) => x.id === Number(req.params.id));
  if (!u) return res.json(util.fail('用户不存在'));
  u.balance = Math.max(0, Math.round(((u.balance || 0) + diff) * 100) / 100);
  d.balanceLogs = d.balanceLogs || [];
  d.balanceLogs.push({
    id: util.nextId('balanceLogs'), userId: u.id, change: diff,
    balance: u.balance, type: diff > 0 ? 'recharge' : 'deduct',
    desc: String(reason || (diff > 0 ? '管理员充值' : '管理员扣款')),
    createdAt: util.now()
  });
  // 发送系统通知
  d.messages.push({
    id: util.nextId('messages'), userId: u.id, type: 'system',
    title: diff > 0 ? '余额充值成功' : '余额调整',
    content: `您的账户余额已${diff > 0 ? '充值' : '调整'} ¥${Math.abs(diff).toFixed(2)}，当前余额 ¥${u.balance.toFixed(2)}。${reason ? '原因：' + reason : ''}`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  await db.flushNow(); // 用户余额变更立即落盘
  res.json(util.ok({ balance: u.balance }));
});

/** 管理员修改用户密码 */
router.put('/users/:id/password', auth.requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.json(util.fail('密码至少 6 位'));
  const d = db.load();
  const u = d.users.find((x) => x.id === Number(req.params.id));
  if (!u) return res.json(util.fail('用户不存在'));
  u.passwordHash = util.hashPassword(String(password));
  // 踢下线，强制重新登录
  d.sessions = d.sessions.filter((s) => !(s.userId === u.id && s.role === 'user'));
  db.save();
  d.messages.push({
    id: util.nextId('messages'), userId: u.id, type: 'system',
    title: '密码已被管理员重置', content: '您的登录密码已被管理员重置，请使用新密码重新登录。',
    isRead: 0, createdAt: util.now()
  });
  db.save();
  await db.flushNow();
  res.json(util.ok({ msg: '密码已修改' }));
});

/** 删除用户 */
router.delete('/users/:id', auth.requireAdmin, async (req, res) => {
  const d = db.load();
  const u = d.users.find((x) => x.id === Number(req.params.id));
  if (!u) return res.json(util.fail('用户不存在'));
  // 自动取消该用户所有未完成订单
  d.orders.forEach((o) => {
    if (o.userId === u.id && ['pending', 'paid', 'shipped'].includes(o.status)) {
      o.status = 'cancelled';
      o.cancelReason = '用户被管理员删除';
      o.cancelledAt = util.now();
    }
  });
  // 级联删除该用户名下分站（含其下级，递归）
  const delBranchIds = new Set();
  const collectBranches = (pid) => {
    d.branches.filter((b) => b.parentId === pid).forEach((b) => { delBranchIds.add(b.id); collectBranches(b.id); });
  };
  d.branches.filter((b) => b.ownerId === u.id).forEach((b) => { delBranchIds.add(b.id); collectBranches(b.id); });
  if (delBranchIds.size) {
    d.branches = d.branches.filter((b) => !delBranchIds.has(b.id));
    d.products = d.products.filter((p) => !delBranchIds.has(p.branchId));
  }
  // 清理用户相关数据
  d.sessions = d.sessions.filter((s) => !(s.userId === u.id));
  d.cart = d.cart.filter((c) => c.userId !== u.id);
  d.favorites = d.favorites.filter((f) => f.userId !== u.id);
  d.addresses = d.addresses.filter((a) => a.userId !== u.id);
  d.userCoupons = d.userCoupons.filter((c) => c.userId !== u.id);
  d.messages = d.messages.filter((m) => m.userId !== u.id);
  d.pointsLogs = d.pointsLogs.filter((p) => p.userId !== u.id);
  d.chat = d.chat.filter((c) => c.userId !== u.id);
  d.tickets = d.tickets.filter((t) => t.userId !== u.id);
  d.aftersales = d.aftersales.filter((a) => a.userId !== u.id);
  // 保留历史订单但标记用户已删除
  d.orders.forEach((o) => { if (o.userId === u.id) o.userDeleted = true; });
  // 软删除：保留账号记录与邮箱（登录时可明确提示"该账号已注销"），清空密码与敏感资料；
  // 后台用户列表已过滤 userDeleted，效果等同删除，邮箱仍可被重新注册
  u.userDeleted = 1;
  u.status = 0;
  u.deletedAt = util.now();
  u.deletedBy = 'admin';
  u.passwordHash = '';
  u.phone = '';
  u.nickname = '已注销用户' + u.id;
  u.avatar = '/img/avatar.svg';
  db.save();
  await db.flushNow(); // 删除用户必须落库后再响应，否则 Serverless 上"刷新还在"
  res.json(util.ok({ msg: '用户已删除' }));
});

/* ================= 优惠券 ================= */

router.get('/coupons', auth.requireAdmin, (req, res) => {
  const d = db.load();
  res.json(util.ok(d.coupons.sort((a, b) => b.id - a.id)));
});

router.post('/coupons', auth.requireAdmin, (req, res) => {
  const { name, type, threshold, amount, discount, total, startAt, endAt, pointsCost, status = 1 } = req.body || {};
  if (!name || !['fullcut', 'discount'].includes(type)) return res.json(util.fail('参数不正确'));
  if (!startAt || !endAt || endAt <= startAt) return res.json(util.fail('时间范围不正确'));
  const c = {
    id: util.nextId('coupons'), name, type,
    threshold: Math.max(0, Number(threshold) || 0),
    amount: type === 'fullcut' ? Math.max(0, Number(amount) || 0) : 0,
    discount: type === 'discount' ? Math.min(0.99, Math.max(0.01, Number(discount) || 1)) : 1,
    total: Math.max(1, parseInt(total) || 1),
    claimed: 0,
    startAt: Number(startAt), endAt: Number(endAt),
    pointsCost: Math.max(0, Number(pointsCost) || 0),
    status: status ? 1 : 0
  };
  db.mutate((d) => d.coupons.push(c));
  res.json(util.ok(c));
});

router.put('/coupons/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const c = d.coupons.find((x) => x.id === Number(req.params.id));
  if (!c) return res.json(util.fail('优惠券不存在'));
  const { name, threshold, amount, discount, total, startAt, endAt, pointsCost, status } = req.body || {};
  if (name !== undefined) c.name = name;
  if (threshold !== undefined) c.threshold = Math.max(0, Number(threshold) || 0);
  if (amount !== undefined && c.type === 'fullcut') c.amount = Math.max(0, Number(amount) || 0);
  if (discount !== undefined && c.type === 'discount') c.discount = Math.min(0.99, Math.max(0.01, Number(discount) || 1));
  if (total !== undefined) c.total = Math.max(1, parseInt(total) || 1);
  if (startAt !== undefined) c.startAt = Number(startAt);
  if (endAt !== undefined) c.endAt = Number(endAt);
  if (pointsCost !== undefined) c.pointsCost = Math.max(0, Number(pointsCost) || 0);
  if (status !== undefined) c.status = status ? 1 : 0;
  db.save();
  res.json(util.ok(c));
});

router.delete('/coupons/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const claimedCount = d.userCoupons.filter((uc) => uc.couponId === id).length;
  db.mutate((d) => {
    d.coupons = d.coupons.filter((c) => c.id !== id);
    // 级联清理该券的领取记录（历史订单仅存金额快照，不受影响）
    d.userCoupons = d.userCoupons.filter((uc) => uc.couponId !== id);
  });
  res.json(util.ok({ msg: '已删除', claimedCount }));
});

/* ================= FAQ ================= */

router.post('/faqs', auth.requireAdmin, (req, res) => {
  const { category, question, answer, sort = 0 } = req.body || {};
  if (!question || !answer) return res.json(util.fail('请填写问题与答案'));
  const f = {
    id: util.nextId('faqs'), category: util.sanitizeHtml(category).slice(0, 50),
    question: util.sanitizeHtml(question).slice(0, 200), answer: util.sanitizeHtml(answer, { keepTags: true }).slice(0, 2000), sort: Number(sort) || 0
  };
  db.mutate((d) => d.faqs.push(f));
  res.json(util.ok(f));
});

router.put('/faqs/:id', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const f = d.faqs.find((x) => x.id === Number(req.params.id));
  if (!f) return res.json(util.fail('FAQ 不存在'));
  const { category, question, answer, sort } = req.body || {};
  if (category !== undefined) f.category = util.sanitizeHtml(category).slice(0, 50);
  if (question !== undefined) f.question = util.sanitizeHtml(question).slice(0, 200);
  if (answer !== undefined) f.answer = util.sanitizeHtml(answer, { keepTags: true }).slice(0, 2000);
  if (sort !== undefined) f.sort = Number(sort) || 0;
  db.save();
  res.json(util.ok(f));
});

router.delete('/faqs/:id', auth.requireAdmin, (req, res) => {
  db.mutate((d) => { d.faqs = d.faqs.filter((f) => f.id !== Number(req.params.id)); });
  res.json(util.ok({ msg: '已删除' }));
});

/* ================= 工单 ================= */

router.get('/tickets', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { status = 'all', page = 1, size = 10 } = req.query;
  let list = d.tickets;
  if (status !== 'all') list = list.filter((t) => t.status === status);
  list.sort((a, b) => b.createdAt - a.createdAt);
  const pg = util.paginate(list, page, size);
  pg.list = pg.list.map((t) => {
    const u = d.users.find((x) => x.id === t.userId);
    return { ...t, userPhone: u ? (u.phone || u.nickname) : '' };
  });
  res.json(util.ok(pg));
});

router.post('/tickets/:id/reply', auth.requireAdmin, (req, res) => {
  const { reply } = req.body || {};
  if (!reply) return res.json(util.fail('请输入回复内容'));
  const d = db.load();
  const t = d.tickets.find((x) => x.id === Number(req.params.id));
  if (!t) return res.json(util.fail('工单不存在'));
  t.reply = reply;
  t.status = 'closed';
  t.updatedAt = util.now();
  d.messages.push({
    id: util.nextId('messages'), userId: t.userId, type: 'system',
    title: '工单已回复', content: `您的工单「${t.type}」已得到回复：${reply}`,
    isRead: 0, createdAt: util.now()
  });
  db.save();
  res.json(util.ok({ msg: '已回复' }));
});

/* ================= 客服对话 ================= */

/** 全部对话（按用户聚合） */
router.get('/chat', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const groups = {};
  for (const c of d.chat) {
    if (!groups[c.userId]) groups[c.userId] = [];
    groups[c.userId].push(c);
  }
  const list = Object.keys(groups).map((uid) => {
    const msgs = groups[uid].sort((a, b) => a.createdAt - b.createdAt);
    const last = msgs[msgs.length - 1];
    const u = d.users.find((x) => x.id === Number(uid));
    return {
      userId: Number(uid),
      userLabel: u ? (u.phone || u.nickname) : '用户' + uid,
      lastMsg: last.content,
      lastTime: last.createdAt,
      unread: msgs.filter((m) => m.role === 'user' && !m.read).length,
      count: msgs.length
    };
  }).sort((a, b) => b.lastTime - a.lastTime);
  res.json(util.ok(list));
});

router.get('/chat/:userId', auth.requireAdmin, async (req, res) => {
  const d = db.load();
  const uid = Number(req.params.userId);
  const list = d.chat.filter((c) => c.userId === uid).sort((a, b) => a.createdAt - b.createdAt);
  // 标记用户消息已读
  d.chat.forEach((c) => { if (c.userId === uid && c.role === 'user') c.read = 1; });
  db.save();
  await db.flushNow();
  res.json(util.ok(list));
});

router.post('/chat/:userId/reply', auth.requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.json(util.fail('回复内容不能为空'));
  const d = db.load();
  d.chat.push({
    id: util.nextId('chat'), userId: Number(req.params.userId), role: 'admin',
    content: String(content).slice(0, 500), createdAt: util.now(), read: 1
  });
  db.save();
  await db.flushNow(); // 管理员回复立即落盘
  res.json(util.ok({ msg: '已发送' }));
});

/* ================= 消息广播 ================= */

router.post('/messages', auth.requireAdmin, (req, res) => {
  const { type = 'system', title, content, userId } = req.body || {};
  if (!title || !content) return res.json(util.fail('请填写标题与内容'));
  const d = db.load();
  const t = util.now();
  if (userId) {
    if (!d.users.some((u) => u.id === Number(userId))) return res.json(util.fail('用户不存在'));
    d.messages.push({ id: util.nextId('messages'), userId: Number(userId), type, title, content, isRead: 0, createdAt: t });
  } else {
    for (const u of d.users) {
      d.messages.push({ id: util.nextId('messages'), userId: u.id, type, title, content, isRead: 0, createdAt: t });
    }
  }
  db.save();
  res.json(util.ok({ msg: '消息已发送' }));
});

/* ================= 系统设置 ================= */

router.get('/settings', auth.requireAdmin, (req, res) => {
  const s = db.load().settings;
  res.json(util.ok({
    siteName: s.siteName, slogan: s.slogan, logo: s.logo, icp: s.icp || '',
    contactPhone: s.contactPhone || '', contactQQ: s.contactQQ || '', contactWechat: s.contactWechat || '',
    payWechat: s.payWechat, payAlipay: s.payAlipay, paySandbox: s.paySandbox !== false,
    wechatMchId: s.wechatMchId || '', wechatApiKey: s.wechatApiKey || '', wechatAppId: s.wechatAppId || '', wechatCertPath: s.wechatCertPath || '',
    wechatSerialNo: s.wechatSerialNo || '', wechatPrivateKey: s.wechatPrivateKey || '', wechatPlatformCert: s.wechatPlatformCert || '',
    alipayAppId: s.alipayAppId || '', alipayPrivateKey: s.alipayPrivateKey || '', alipayPublicKey: s.alipayPublicKey || '', alipayGateway: s.alipayGateway || 'openapi.alipay.com',
    xunhuEnabled: !!s.xunhuEnabled, xunhuAppId: s.xunhuAppId || '', xunhuAppSecret: s.xunhuAppSecret || '', xunhuGateway: s.xunhuGateway || 'https://api.xunhupay.com/payment/do.html',
    manualPayEnabled: !!s.manualPayEnabled, wechatQrcode: s.wechatQrcode || '', alipayQrcode: s.alipayQrcode || '', payNotice: s.payNotice || '',
    pointsRate: s.pointsRate, registerPoints: s.registerPoints,
    autoConfirmDays: s.autoConfirmDays, pendingCancelMinutes: s.pendingCancelMinutes,
    branchMaxDepth: s.branchMaxDepth === undefined ? 5 : s.branchMaxDepth,
    hotKeywords: s.hotKeywords || [],
    quickNav: s.quickNav && s.quickNav.length ? s.quickNav : util.defaultQuickNav(db.load().categories),
    adminUsername: s.adminUsername
  }));
});

router.put('/settings', auth.requireAdmin, (req, res) => {
  const s = db.load().settings;
  const { siteName, slogan, logo, icp, contactPhone, contactQQ, contactWechat, payWechat, payAlipay, paySandbox, wechatMchId, wechatApiKey, wechatAppId, wechatCertPath, wechatSerialNo, wechatPrivateKey, wechatPlatformCert, alipayAppId, alipayPrivateKey, alipayPublicKey, alipayGateway, xunhuEnabled, xunhuAppId, xunhuAppSecret, xunhuGateway, manualPayEnabled, wechatQrcode, alipayQrcode, payNotice, oauthWechatAppid, oauthWechatSecret, oauthQqAppid, oauthQqSecret, pointsRate, pointsExchangeRate, registerPoints, autoConfirmDays, pendingCancelMinutes, branchMaxDepth, hotKeywords, quickNav } = req.body || {};
  if (siteName !== undefined) s.siteName = String(siteName).slice(0, 30);
  if (slogan !== undefined) s.slogan = String(slogan).slice(0, 60);
  if (logo !== undefined) s.logo = logo;
  if (icp !== undefined) s.icp = String(icp).slice(0, 60);
  if (contactPhone !== undefined) s.contactPhone = String(contactPhone).slice(0, 20);
  if (contactQQ !== undefined) s.contactQQ = String(contactQQ).slice(0, 20);
  if (contactWechat !== undefined) s.contactWechat = String(contactWechat).slice(0, 30);
  if (payWechat !== undefined) s.payWechat = !!payWechat;
  if (payAlipay !== undefined) s.payAlipay = !!payAlipay;
  if (paySandbox !== undefined) s.paySandbox = !!paySandbox;
  if (wechatMchId !== undefined) s.wechatMchId = String(wechatMchId).slice(0, 50);
  if (wechatApiKey !== undefined) s.wechatApiKey = String(wechatApiKey).slice(0, 200);
  if (wechatAppId !== undefined) s.wechatAppId = String(wechatAppId).slice(0, 50);
  if (wechatCertPath !== undefined) s.wechatCertPath = String(wechatCertPath).slice(0, 200);
  if (wechatSerialNo !== undefined) s.wechatSerialNo = String(wechatSerialNo).slice(0, 100);
  if (wechatPrivateKey !== undefined) s.wechatPrivateKey = String(wechatPrivateKey).slice(0, 4096);
  if (wechatPlatformCert !== undefined) s.wechatPlatformCert = String(wechatPlatformCert).slice(0, 4096);
  if (alipayAppId !== undefined) s.alipayAppId = String(alipayAppId).slice(0, 50);
  if (alipayPrivateKey !== undefined) s.alipayPrivateKey = String(alipayPrivateKey).slice(0, 4096);
  if (alipayPublicKey !== undefined) s.alipayPublicKey = String(alipayPublicKey).slice(0, 4096);
  if (alipayGateway !== undefined) s.alipayGateway = String(alipayGateway).slice(0, 100);
  if (xunhuEnabled !== undefined) s.xunhuEnabled = !!xunhuEnabled;
  if (xunhuAppId !== undefined) s.xunhuAppId = String(xunhuAppId).slice(0, 50);
  if (xunhuAppSecret !== undefined) s.xunhuAppSecret = String(xunhuAppSecret).slice(0, 100);
  if (xunhuGateway !== undefined) s.xunhuGateway = String(xunhuGateway).slice(0, 200);
  if (manualPayEnabled !== undefined) s.manualPayEnabled = !!manualPayEnabled;
  if (wechatQrcode !== undefined) s.wechatQrcode = String(wechatQrcode).slice(0, 500);
  if (alipayQrcode !== undefined) s.alipayQrcode = String(alipayQrcode).slice(0, 500);
  if (payNotice !== undefined) s.payNotice = String(payNotice).slice(0, 500);
  if (oauthWechatAppid !== undefined) s.oauthWechatAppid = String(oauthWechatAppid).slice(0, 64);
  if (oauthWechatSecret !== undefined) s.oauthWechatSecret = String(oauthWechatSecret).slice(0, 128);
  if (oauthQqAppid !== undefined) s.oauthQqAppid = String(oauthQqAppid).slice(0, 64);
  if (oauthQqSecret !== undefined) s.oauthQqSecret = String(oauthQqSecret).slice(0, 128);
  if (pointsRate !== undefined) s.pointsRate = Math.max(0, Number(pointsRate) || 0);
  if (pointsExchangeRate !== undefined) s.pointsExchangeRate = Math.max(1, parseInt(pointsExchangeRate) || 100);
  if (registerPoints !== undefined) s.registerPoints = Math.max(0, parseInt(registerPoints) || 0);
  if (autoConfirmDays !== undefined) s.autoConfirmDays = Math.max(1, parseInt(autoConfirmDays) || 7);
  if (pendingCancelMinutes !== undefined) s.pendingCancelMinutes = Math.max(1, parseInt(pendingCancelMinutes) || 30);
  if (branchMaxDepth !== undefined) s.branchMaxDepth = Math.max(1, Math.min(10, parseInt(branchMaxDepth) || 5));
  if (hotKeywords !== undefined) s.hotKeywords = (Array.isArray(hotKeywords) ? hotKeywords : []).slice(0, 10);
  if (quickNav !== undefined) s.quickNav = util.sanitizeQuickNav(quickNav);
  db.save();
  res.json(util.ok({ msg: '设置已保存' }));
});

/** 修改管理员密码 */
router.put('/password', auth.requireAdmin, (req, res) => {
  const { old, next } = req.body || {};
  const s = db.load().settings;
  if (!util.verifyPassword(old, s.adminPasswordHash)) return res.json(util.fail('原密码错误'));
  if (!next || next.length < 6) return res.json(util.fail('新密码至少 6 位'));
  s.adminPasswordHash = util.hashPassword(next);
  db.save();
  res.json(util.ok({ msg: '密码已修改' }));
});

/** 文件上传（base64 图片，限制 3MB） */
router.post('/upload', auth.requireAdmin, (req, res) => {
  const { data, ext = 'png' } = req.body || {};
  if (!data) return res.json(util.fail('缺少图片数据'));
  const buf = Buffer.from(data, 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.json(util.fail('图片不能超过 3MB'));
  // 魔数嗅探真实类型（防伪装/存储型 XSS），仅允许 jpg/png/gif/webp（禁 svg）
  const real = util.detectImageType(buf);
  if (!real) return res.json(util.fail('图片内容与格式不符，仅支持 jpg/png/gif/webp'));
  const fs = require('fs');
  const path = require('path');
  const uploadDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const name = 'u_' + Date.now() + '_' + crypto.randomInt(1000000, 9999999) + '.' + real;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  const url = '/uploads/' + name;
  db.mutate((d) => d.uploads.push({ name, url, createdAt: util.now() }));
  res.json(util.ok({ url }));
});

/* ================= 分站管理（超级管理员） ================= */

/** 分站列表（全部：专业 + 普通，含上级与下级数量） */
router.get('/branches', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const s = d.settings || {};
  const list = d.branches
    .map((x) => {
      const parent = x.parentId ? d.branches.find((p) => p.id === x.parentId) : null;
      return {
        id: x.id, name: x.name, type: x.type, username: x.username,
        status: x.status, note: x.note || '', createdAt: x.createdAt, lastLoginAt: x.lastLoginAt || 0,
        balance: x.balance || 0,
        ownerId: x.ownerId || 0,
        parentId: x.parentId || 0,
        parentName: parent ? parent.name : '超级管理员',
        pricePro: x.pricePro === undefined ? (s.branchProPrice === undefined ? 10 : s.branchProPrice) : x.pricePro,
        priceNormal: x.priceNormal === undefined ? (s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice) : x.priceNormal,
        childCount: d.branches.filter((c) => c.parentId === x.id).length
      };
    })
    .sort((a, b) => b.id - a.id);
  res.json(util.ok(list));
});

/** 分站分销价格配置（超级管理员设置：一级专业分站/普通分站价格） */
router.get('/branch-prices', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const s = d.settings || {};
  res.json(util.ok({
    pro: s.branchProPrice === undefined ? 10 : s.branchProPrice,
    normal: s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice
  }));
});

router.put('/branch-prices', auth.requireAdmin, (req, res) => {
  const pro = Number(req.body && req.body.pro);
  const normal = Number(req.body && req.body.normal);
  if (!isFinite(pro) || pro < 0 || pro > 99999) return res.json(util.fail('专业分站价格无效'));
  if (!isFinite(normal) || normal < 0 || normal > 99999) return res.json(util.fail('普通分站价格无效'));
  const d = db.load();
  d.settings.branchProPrice = Math.round(pro * 100) / 100;
  d.settings.branchNormalPrice = Math.round(normal * 100) / 100;
  db.save();
  res.json(util.ok({ pro: d.settings.branchProPrice, normal: d.settings.branchNormalPrice }));
});

/** 专业分站下的普通分站列表 */
router.get('/branches/:id/children', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const pro = d.branches.find((x) => x.id === id && x.type === 'pro');
  if (!pro) return res.json(util.fail('专业分站不存在'));
  const list = d.branches
    .filter((x) => x.parentId === id)
    .map((x) => ({
      id: x.id, name: x.name, type: x.type, username: x.username,
      status: x.status, note: x.note || '', createdAt: x.createdAt, lastLoginAt: x.lastLoginAt || 0
    }))
    .sort((a, b) => b.id - a.id);
  res.json(util.ok({ pro: { id: pro.id, name: pro.name }, list }));
});

/** 超级管理员：开通分站（可选绑定用户账号；绑定后该用户账号可登录分站后台并可升级） */
router.post('/branches', auth.requireAdmin, (req, res) => {
  const { name, username, password, note, type, ownerEmail } = req.body || {};
  const un = String(username || '').trim();
  const nm = String(name || '').trim();
  const pw = String(password || '');
  const typ = type === 'normal' ? 'normal' : 'pro';
  if (!nm || !un || !pw) return res.json(util.fail('请填写分站名称、账号、密码'));
  if (pw.length < 4) return res.json(util.fail('密码至少 4 位'));
  const d = db.load();
  const s = d.settings || {};
  if (d.branches.some((x) => x.username === un)) return res.json(util.fail('该分站账号已被使用'));
  // 绑定用户（按邮箱/手机号/昵称精确匹配）
  let ownerId = 0;
  const oe = String(ownerEmail || '').trim();
  if (oe) {
    const u = d.users.find((x) =>
      (x.email || '').toLowerCase() === oe.toLowerCase() ||
      (x.phone || '') === oe ||
      (x.nickname || '').toLowerCase() === oe.toLowerCase());
    if (!u) return res.json(util.fail('未找到绑定用户，请确认邮箱/手机号/昵称正确'));
    if (d.branches.some((x) => x.ownerId === u.id)) return res.json(util.fail('该用户已开通分站，不能重复绑定'));
    ownerId = u.id;
  }
  const branch = {
    id: util.nextId('branches'),
    name: nm.slice(0, 20),
    type: typ,
    parentId: 0,
    username: un.slice(0, 20),
    passwordHash: util.hashPassword(pw),
    status: 1,
    note: String(note || '').slice(0, 100),
    ownerId,
    balance: 0,
    pricePro: s.branchProPrice === undefined ? 10 : s.branchProPrice,
    priceNormal: s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice,
    createdAt: util.now(), lastLoginAt: 0
  };
  d.branches.push(branch);
  if (ownerId) {
    d.messages.push({
      id: util.nextId('messages'), userId: ownerId, type: 'branch',
      title: '分站已开通', content: `管理员为您开通了${typ === 'pro' ? '专业' : '普通'}分站「${nm}」，登录账号：${un}，登录密码请咨询管理员。可在「我的-分站管理」或分站后台使用。`,
      isRead: 0, createdAt: util.now()
    });
  }
  db.save();
  res.json(util.ok({ id: branch.id, ownerId }));
});

/** 超级管理员：编辑分站/启用停用（停用级联子树并清理会话） */
router.put('/branches/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const b = d.branches.find((x) => x.id === id);
  if (!b) return res.json(util.fail('分站不存在'));
  const body = req.body || {};
  if (body.name !== undefined) b.name = String(body.name).trim().slice(0, 20) || b.name;
  if (body.note !== undefined) b.note = String(body.note).slice(0, 100);
  if (body.status !== undefined) {
    const status = body.status === 1 ? 1 : 0;
    if (status === 0) {
      // 级联停用子树
      const ids = new Set([b.id]);
      const collect = (bid) => d.branches.filter((x) => x.parentId === bid).forEach((x) => { ids.add(x.id); collect(x.id); });
      collect(b.id);
      d.branches.forEach((x) => { if (ids.has(x.id)) x.status = 0; });
      d.sessions = d.sessions.filter((x) => !(x.role === 'branch' && ids.has(x.userId)));
    } else {
      b.status = 1;
    }
  }
  db.save();
  res.json(util.ok({ id: b.id, name: b.name, note: b.note, status: b.status }));
});

/** 超级管理员：调整分站余额（正负均可，写流水） */
router.put('/branches/:id/balance', auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const amount = Math.round(Number(req.body && req.body.amount) * 100) / 100;
  const desc = String((req.body && req.body.desc) || '').trim();
  if (!isFinite(amount) || amount === 0) return res.json(util.fail('请输入非零的调整金额'));
  if (desc.length > 100) return res.json(util.fail('备注过长'));
  const d = db.load();
  const b = d.branches.find((x) => x.id === id);
  if (!b) return res.json(util.fail('分站不存在'));
  const nb = Math.round(((b.balance || 0) + amount) * 100) / 100;
  if (nb < 0) return res.json(util.fail('调整后余额不能为负'));
  b.balance = nb;
  d.branchBalanceLogs.push({
    id: util.nextId('branchBalanceLogs'), branchId: b.id,
    change: amount, balance: nb, type: amount > 0 ? 'adjust_in' : 'adjust_out',
    desc: (desc || (amount > 0 ? '管理员充值' : '管理员扣减')) + (amount > 0 ? ` ¥${amount.toFixed(2)}` : ` ¥${Math.abs(amount).toFixed(2)}`),
    relatedId: 0, createdAt: util.now()
  });
  // 给分站所有者发送系统通知
  if (b.ownerId) {
    d.messages.push({
      id: util.nextId('messages'), userId: b.ownerId, type: 'system',
      title: amount > 0 ? '分站余额充值成功' : '分站余额调整',
      content: `您的分站「${b.name}」余额已${amount > 0 ? '充值' : '调整'} ¥${Math.abs(amount).toFixed(2)}，当前分站余额 ¥${nb.toFixed(2)}。${desc ? '原因：' + desc : ''}`,
      isRead: 0, createdAt: util.now()
    });
  }
  db.save();
  await db.flushNow();
  res.json(util.ok({ balance: b.balance }));
});

/** 超级管理员：重置分站密码 */
router.put('/branches/:id/password', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const pw = String((req.body && req.body.password) || '');
  if (pw.length < 4) return res.json(util.fail('密码至少 4 位'));
  const d = db.load();
  const b = d.branches.find((x) => x.id === id);
  if (!b) return res.json(util.fail('分站不存在'));
  b.passwordHash = util.hashPassword(pw);
  db.save();
  res.json(util.ok({ msg: '密码已重置' }));
});

/** 超级管理员：删除分站（级联删除其名下分站、清理会话、校验未完成订单） */
router.delete('/branches/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const d = db.load();
  const b = d.branches.find((x) => x.id === id);
  if (!b) return res.json(util.fail('分站不存在'));
  // 递归收集自身及所有下级
  const removed = new Set();
  const collect = (bid) => {
    removed.add(bid);
    d.branches.filter((x) => x.parentId === bid).forEach((x) => collect(x.id));
  };
  collect(id);
  // 存在进行中订单禁止删除
  const active = d.orders.some((o) => removed.has(o.branchId) && ['pending', 'paid', 'shipped'].includes(o.status));
  if (active) return res.json(util.fail('该分站存在进行中的订单，请先处理后再删除'));
  d.branches = d.branches.filter((x) => !removed.has(x.id));
  d.products = d.products.filter((p) => !removed.has(p.branchId));
  d.sessions = d.sessions.filter((x) => !(x.role === 'branch' && removed.has(x.userId)));
  db.save();
  res.json(util.ok({ removed: removed.size }));
});

/* =============== 提现审核（分站提现） =============== */

/** 提现申请列表 */
router.get('/withdrawals', auth.requireAdmin, (req, res) => {
  const d = db.load();
  const { status = 'all', page = 1, size = 20 } = req.query;
  let list = d.withdrawals;
  if (status !== 'all') list = list.filter((w) => w.status === status);
  list.sort((a, b) => b.id - a.id);
  res.json(util.ok(util.paginate(list, page, size)));
});

/** 审核提现：approve 同意（扣分站余额） / reject 驳回 / pay 标记已打款 */
router.put('/withdrawals/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const action = String((req.body && req.body.action) || '');
  const reply = String((req.body && req.body.reply) || '');
  const d = db.load();
  const w = d.withdrawals.find((x) => x.id === id);
  if (!w) return res.json(util.fail('提现记录不存在'));
  const t = util.now();
  if (action === 'approve') {
    if (w.status !== 'pending') return res.json(util.fail('当前状态不可审核'));
    const b = d.branches.find((x) => x.id === w.branchId);
    if (!b) return res.json(util.fail('关联分站不存在'));
    if ((b.balance || 0) < w.amount) return res.json(util.fail('分站余额不足，无法通过该提现'));
    b.balance = Math.round(((b.balance || 0) - w.amount) * 100) / 100;
    d.branchBalanceLogs.push({
      id: util.nextId('branchBalanceLogs'), branchId: b.id,
      change: -w.amount, balance: b.balance, type: 'withdraw',
      desc: `提现 ¥${w.amount.toFixed(2)} 已审核通过（${w.account}）`, relatedId: w.id, createdAt: t
    });
    w.status = 'approved';
    w.reply = reply || '审核通过，等待打款';
    w.handledAt = t;
  } else if (action === 'pay') {
    if (w.status !== 'approved') return res.json(util.fail('仅审核通过的提现可标记打款'));
    w.status = 'paid';
    w.reply = reply || '已打款';
    w.handledAt = t;
  } else if (action === 'reject') {
    if (w.status !== 'pending') return res.json(util.fail('当前状态不可驳回'));
    w.status = 'rejected';
    w.reply = reply || '不符合提现条件';
    w.handledAt = t;
  } else {
    return res.json(util.fail('参数不正确'));
  }
  db.save();
  db.flushNow(); // 提现/余额变更立即落盘
  res.json(util.ok({ status: w.status }));
});

module.exports = router;
