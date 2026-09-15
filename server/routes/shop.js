/**
 * routes/shop.js - 商城浏览类接口（游客可访问）
 * 轮播 / 分类 / 商品列表与详情 / 热门搜索 / FAQ / 可领优惠券
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const util = require('../util');

/** 计算商品实际库存（统一库存池：手动/自动商品都取 stock，auto 商品由卡密导入/发卡/退款时同步 stock） */
function stockOf(product, d) {
  return product.stock || 0;
}

/** 商品对外视图 */
function publicProduct(p, d) {
  const stock = stockOf(p, d);
  return {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    subtitle: p.subtitle || '',
    images: p.images || [],
    price: p.price,
    originalPrice: p.originalPrice || 0,
    sales: p.sales || 0,
    type: p.type,           // auto 自动发货 / manual 手动发货
    stock,
    status: p.status,
    detail: p.detail || '',
    isHot: !!p.isHot,
    sort: p.sort || 0,
    cardNote: p.cardNote || '',
    createdAt: p.createdAt
  };
}

/** 轮播图 */
router.get('/banners', (req, res) => {
  const d = db.load();
  const list = d.banners
    .filter((b) => b.status === 1)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  res.json(util.ok(list));
});

/** 分类树（两级） */
router.get('/categories', (req, res) => {
  const d = db.load();
  const parents = d.categories.filter((c) => !c.parentId && c.status === 1).sort((a, b) => a.sort - b.sort);
  const tree = parents.map((p) => ({
    ...p,
    children: d.categories
      .filter((c) => c.parentId === p.id && c.status === 1)
      .sort((a, b) => a.sort - b.sort)
  }));
  res.json(util.ok(tree));
});

/** 商品列表 */
router.get('/products', (req, res) => {
  const d = db.load();
  const { categoryId, keyword, sort = 'default', page = 1, size = 10, hot, branch } = req.query;
  let list = d.products.filter((p) => p.status === 1);
  if (branch) {
    const b = d.branches.find((x) => x.username === String(branch).trim());
    if (!b || b.status !== 1) return res.json(util.fail('分站不存在或已停用'));
    list = list.filter((p) => p.branchId === b.id);
  } else {
    list = list.filter((p) => !p.branchId);
  }
  if (categoryId) {
    const cid = Number(categoryId);
    const isParent = d.categories.some((c) => c.id === cid && !c.parentId);
    if (isParent) {
      const childIds = d.categories.filter((c) => c.parentId === cid).map((c) => c.id);
      list = list.filter((p) => childIds.includes(p.categoryId));
    } else {
      list = list.filter((p) => p.categoryId === cid);
    }
  }
  if (hot) list = list.filter((p) => p.isHot);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((p) => (p.name + ' ' + (p.subtitle || '') + ' ' + (p.keywords || '')).toLowerCase().indexOf(kw) >= 0);
  }
  list = list.map((p) => publicProduct(p, d));
  switch (sort) {
    case 'sales': list.sort((a, b) => b.sales - a.sales); break;
    case 'priceAsc': list.sort((a, b) => a.price - b.price); break;
    case 'priceDesc': list.sort((a, b) => b.price - a.price); break;
    case 'new': list.sort((a, b) => b.createdAt - a.createdAt); break;
    default: list.sort((a, b) => (b.isHot ? 1 : 0) - (a.isHot ? 1 : 0) || (a.sort || 0) - (b.sort || 0) || b.createdAt - a.createdAt);
  }
  res.json(util.ok(util.paginate(list, page, size)));
});

/** 商品详情 */
router.get('/products/:id', auth.optionalUser, (req, res) => {
  const d = db.load();
  const p = d.products.find((x) => x.id === Number(req.params.id));
  if (!p || p.status === 0) return res.json(util.fail('商品不存在或已下架'));
  const data = publicProduct(p, d);
  if (req.user) {
    data.favorited = d.favorites.some((f) => f.userId === req.user.id && f.productId === p.id);
  }
  res.json(util.ok(data));
});

/** 热门搜索关键词 */
router.get('/hot-keywords', (req, res) => {
  const d = db.load();
  res.json(util.ok((d.settings.hotKeywords || ['话费充值', '视频会员', '游戏点券', '激活码', '音乐会员']).slice(0, 10)));
});

/** FAQ 列表（支持关键词搜索） */
router.get('/faqs', (req, res) => {
  const d = db.load();
  const { keyword } = req.query;
  let list = d.faqs;
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((f) => (f.category + f.question + f.answer).toLowerCase().indexOf(kw) >= 0);
  }
  res.json(util.ok(list));
});

/** 可领取优惠券 */
router.get('/coupons', (req, res) => {
  const d = db.load();
  const t = util.now();
  const list = d.coupons
    .filter((c) => c.status === 1 && c.startAt <= t && c.endAt >= t && c.total > (c.claimed || 0))
    .sort((a, b) => a.endAt - b.endAt);
  res.json(util.ok(list));
});

/** 站点基础信息（公开） */
router.get('/site', (req, res) => {
  const d = db.load();
  const s = d.settings;
  res.json(util.ok({
    siteName: s.siteName,
    slogan: s.slogan,
    logo: s.logo,
    icp: s.icp || '',
    contactPhone: s.contactPhone || '',
    contactQQ: s.contactQQ || '',
    contactWechat: s.contactWechat || '',
    guidePages: s.guidePages || [],
    quickNav: s.quickNav && s.quickNav.length ? s.quickNav : util.defaultQuickNav(d.categories),
    payWechat: !!s.payWechat,
    payAlipay: !!s.payAlipay,
    paySandbox: s.paySandbox !== false,
    xunhuEnabled: !!s.xunhuEnabled,
    manualPayEnabled: !!s.manualPayEnabled,
    wechatQrcode: s.wechatQrcode || '',
    alipayQrcode: s.alipayQrcode || '',
    payNotice: s.payNotice || '',
    pointsExchangeRate: s.pointsExchangeRate || 100,
    pendingCancelMinutes: s.pendingCancelMinutes === undefined ? 30 : Number(s.pendingCancelMinutes) || 30
  }));
});


/** 分站店铺公开信息 */
router.get('/branch-shop', (req, res) => {
  const un = String(req.query.username || '').trim();
  if (!un) return res.json(util.fail('缺少分站账号'));
  const d = db.load();
  const s = d.settings || {};
  const b = d.branches.find((x) => x.username === un);
  if (!b || b.status !== 1) return res.json(util.fail('分站不存在或已停用'));
  const parent = b.parentId ? d.branches.find((x) => x.id === b.parentId) : null;
  res.json(util.ok({
    id: b.id, name: b.name, type: b.type, username: b.username,
    siteName: s.siteName, logo: s.logo || '',
    parentName: parent ? parent.name : '超级管理员',
    productCount: d.products.filter((x) => x.branchId === b.id && x.status === 1).length
  }));
});

/** 分站公开信息（加入分站页使用：上级分站名称/类型/价格） */
router.get('/branch-info', (req, res) => {
  const un = String(req.query.username || '').trim();
  if (!un) return res.json(util.fail('缺少分站账号'));
  const d = db.load();
  const s = d.settings || {};
  const b = d.branches.find((x) => x.username === un);
  if (!b || b.status !== 1) return res.json(util.fail('分站不存在或已停用'));
  if (b.type !== 'pro') return res.json(util.fail('该分站不能开通下级'));
  res.json(util.ok({
    name: b.name, type: b.type,
    pricePro: b.pricePro === undefined ? (s.branchProPrice === undefined ? 10 : s.branchProPrice) : b.pricePro,
    priceNormal: b.priceNormal === undefined ? (s.branchNormalPrice === undefined ? 0 : s.branchNormalPrice) : b.priceNormal
  }));
});

module.exports = router;
module.exports.stockOf = stockOf;
module.exports.publicProduct = publicProduct;
