/**
 * test-all.js - 发卡网系统全功能自动化测试
 * 覆盖：商城公开接口 / 认证 / 用户中心 / 订单支付 / 管理后台 / 支付回调
 * 运行：node scripts/test-all.js  （服务需已启动在 localhost:3000）
 */
const BASE = 'http://localhost:3000';

let passed = 0, failed = 0;
const failures = [];
const results = [];

function record(name, ok, extra) {
  if (ok) { passed++; results.push(['PASS', name]); console.log(`  ✅ ${name}`); }
  else {
    failed++;
    const resp = extra && (extra.data || extra.body);
    const msg = (extra && extra.msg) || (resp ? JSON.stringify(resp).slice(0, 300) : '');
    failures.push({ name, extra });
    results.push(['FAIL', name, msg]);
    console.log(`  ❌ ${name} ${msg}`);
  }
}

async function req(method, path, { token, body, raw, contentType } = {}) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let b = body;
  // 需要图形验证码的接口自动附带（防人机改造后测试适配）
  if (['/auth/send-code', '/auth/send-email-code', '/auth/send-reset-email', '/auth/login'].some((p) => path.endsWith(p))) {
    try {
      const c = await fetch(BASE + '/api/auth/captcha').then((r) => r.json());
      b = Object.assign({}, body || {}, { captchaToken: c.data.token, captchaCode: c.data.devCode });
    } catch (e) { /* 保持原样 */ }
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw !== undefined ? raw : (b !== undefined ? JSON.stringify(b) : undefined)
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}

const ok = (r) => r.data && r.data.code === 0;
const msg = (r) => (r.data && (r.data.msg || r.data.error)) || '';

function section(title) { console.log(`\n===== ${title} =====`); }

/* 唯一手机号 */
const phone = '139' + String(Math.floor(10000000 + Math.random() * 89999999));
const email = 't' + Date.now() + '@test.com';
let userToken = '', adminToken = '', orderId = 0, manualOrderId = 0, productId = 0, manualProductId = 0, couponId = 0, ucId = 0, cardId = 0, pid = 0, couponThreshold = 0;

(async () => {
  /* ============ 1. 商城公开接口 ============ */
  section('商城公开接口');
  {
    let r = await req('GET', '/api/health');
    record('健康检查', ok(r) && r.data.data.status === 'ok');
    r = await req('GET', '/api/shop/site');
    record('站点信息', ok(r) && !!r.data.data.siteName);
    r = await req('GET', '/api/shop/banners');
    record('轮播图列表', ok(r) && Array.isArray(r.data.data));
    r = await req('GET', '/api/shop/categories');
    record('分类树', ok(r) && Array.isArray(r.data.data) && r.data.data.length > 0);
    r = await req('GET', '/api/shop/products');
    record('商品列表', ok(r) && Array.isArray(r.data.data.list) && r.data.data.list.length > 0);
    /* 用叶子分类测试筛选（父分类会返回子分类商品，断言需匹配子级） */
    const catTree = (await req('GET', '/api/shop/categories')).data.data;
    const firstParent = catTree.find((c) => c.children && c.children.length);
    const leafCat = firstParent ? firstParent.children[0].id : catTree[0].id;
    r = await req('GET', '/api/shop/products?categoryId=' + leafCat);
    record('按分类筛选商品', ok(r) && r.data.data.list.every((p) => p.categoryId === leafCat), r);
    r = await req('GET', '/api/shop/products?sort=sales');
    record('销量排序', ok(r) && r.data.data.list.every((p, i, a) => i === 0 || a[i - 1].sales >= p.sales));
    r = await req('GET', '/api/shop/products?sort=priceAsc');
    record('价格升序', ok(r) && r.data.data.list.every((p, i, a) => i === 0 || a[i - 1].price <= p.price));
    r = await req('GET', '/api/shop/products?keyword=' + encodeURIComponent('会员'));
    record('关键词搜索', ok(r));
    r = await req('GET', '/api/shop/products?hot=1');
    record('热门商品', ok(r) && r.data.data.list.every((p) => p.isHot));
    /* 选定库存充足的商品作为测试主商品（避免被历史测试吃光库存） */
    const stockRich = (await req('GET', '/api/shop/products?size=50')).data.data.list;
    productId = (stockRich.find((p) => p.stock >= 20) || stockRich[0]).id;
    pid = productId;
    r = await req('GET', '/api/shop/products/' + pid);
    record('商品详情', ok(r) && !!r.data.data.name);
    r = await req('GET', '/api/shop/hot-keywords');
    record('热门关键词', ok(r) && r.data.data.length > 0);
    r = await req('GET', '/api/shop/faqs');
    record('FAQ 列表', ok(r) && r.data.data.length > 0);
    r = await req('GET', '/api/shop/faqs?keyword=' + encodeURIComponent('退款'));
    record('FAQ 搜索', ok(r));
    r = await req('GET', '/api/shop/coupons');
    record('可领优惠券', ok(r) && Array.isArray(r.data.data));
    r = await req('GET', '/api/not-exist');
    record('404 兜底', r.status === 404);
  }

  /* ============ 2. 认证（纯邮箱账号体系） ============ */
  section('认证');
  {
    const capReg = await req('GET', '/api/auth/captcha');
    let r = await req('POST', '/api/auth/send-email-code', { body: { email, scene: 'register', captchaToken: capReg.data.data.token, captchaCode: capReg.data.data.devCode } });
    record('发送邮箱注册验证码', ok(r) && !!r.data.data.devCode, r);
    const regCode = r.data.data.devCode;
    r = await req('POST', '/api/auth/register-email', { body: { email, code: regCode, password: 'abc123' } });
    record('邮箱注册', ok(r) && !!r.data.data.token, r);
    userToken = r.data.data.token;

    r = await req('POST', '/api/auth/login', { body: { account: 'demo@example.com', password: '123456' } });
    record('密码登录(演示邮箱)', ok(r) && !!r.data.data.token, r);
    r = await req('POST', '/api/auth/login', { body: { account: email, password: 'abc123' } });
    record('密码登录(新注册邮箱)', ok(r) && !!r.data.data.token, r);
    r = await req('POST', '/api/auth/login', { body: { account: email, password: 'wrongxx' } });
    record('错误密码拒绝', !ok(r), r);
    r = await req('POST', '/api/auth/login', { body: { account: email } });
    record('缺密码拒绝', !ok(r), r);

    const emailB = 't2' + Date.now() + '@test.com';
    const capL = await req('GET', '/api/auth/captcha');
    r = await req('POST', '/api/auth/send-email-code', { body: { email: emailB, scene: 'login', captchaToken: capL.data.data.token, captchaCode: capL.data.data.devCode } });
    record('发送邮箱登录验证码', ok(r) && !!r.data.data.devCode, r);
    r = await req('POST', '/api/auth/login-email-code', { body: { email: emailB, code: r.data.data.devCode } });
    record('邮箱验证码登录(自动注册)', ok(r) && !!r.data.data.token, r);

    r = await req('GET', '/api/auth/me', { token: userToken });
    record('当前用户信息', ok(r) && !!r.data.data.user, r);

    // 邮箱找回密码（验证码）
    const capF = await req('GET', '/api/auth/captcha');
    r = await req('POST', '/api/auth/send-email-code', { body: { email: 'demo@example.com', scene: 'reset', captchaToken: capF.data.data.token, captchaCode: capF.data.data.devCode } });
    record('发送邮箱重置验证码', ok(r) && !!r.data.data.devCode, r);
    const resetCode = r.data.data.devCode;
    r = await req('POST', '/api/auth/reset-email-code', { body: { email: 'demo@example.com', code: resetCode, password: 'newpass1' } });
    record('邮箱验证码重置密码', ok(r), r);
    r = await req('POST', '/api/auth/login', { body: { account: 'demo@example.com', password: 'newpass1' } });
    record('重置后新密码登录', ok(r), r);

    // 绑定/换绑邮箱
    const capB = await req('GET', '/api/auth/captcha');
    const bindEmail = 'tb' + Date.now() + '@test.com';
    r = await req('POST', '/api/auth/send-email-code', { body: { email: bindEmail, scene: 'bind', captchaToken: capB.data.data.token, captchaCode: capB.data.data.devCode } });
    record('发送绑定邮箱验证码', ok(r) && !!r.data.data.devCode, r);
    r = await req('POST', '/api/auth/bind-email', { token: userToken, body: { email: bindEmail, code: r.data.data.devCode } });
    record('绑定/换绑邮箱', ok(r) && r.data.data.user.email === bindEmail, r);

    r = await req('PUT', '/api/auth/password', { token: userToken, body: { old: 'abc123', next: 'def456' } });
    record('修改密码', ok(r), r);
    r = await req('PUT', '/api/auth/profile', { token: userToken, body: { nickname: '新昵称', gender: '男' } });
    record('修改个人资料', ok(r) && r.data.data.user.nickname === '新昵称', r);

    // 邮箱重置链接（本地直显模式 devLink）
    const capR = await req('GET', '/api/auth/captcha');
    r = await req('POST', '/api/auth/send-reset-email', { body: { email: 'demo@example.com', captchaToken: capR.data.data.token, captchaCode: capR.data.data.devCode } });
    if (ok(r) && r.data.data.devLink) {
      const devLink = r.data.data.devLink;
      const token = devLink ? decodeURIComponent(devLink.split('token=')[1] || '') : '';
      r = await req('POST', '/api/auth/reset-email', { body: { token, password: 'resetlink1' } });
      record('邮箱令牌重置密码', ok(r), r);
      r = await req('POST', '/api/auth/login', { body: { account: 'demo@example.com', password: 'resetlink1' } });
      record('重置后新密码登录(链接)', ok(r), r);
      // 恢复演示账号密码 123456
      const capR2 = await req('GET', '/api/auth/captcha');
      const rr2 = await req('POST', '/api/auth/send-email-code', { body: { email: 'demo@example.com', scene: 'reset', captchaToken: capR2.data.data.token, captchaCode: capR2.data.data.devCode } });
      if (ok(rr2) && rr2.data.data.devCode) {
        await req('POST', '/api/auth/reset-email-code', { body: { email: 'demo@example.com', code: rr2.data.data.devCode, password: '123456' } });
      }
    } else {
      record('发送邮箱重置链接(SMTP模式)', ok(r), r);
      console.log('  ℹ️  已配置真实 SMTP，令牌重置闭环在「本地直显模式」专项测试中覆盖');
    }
  }

  /* ============ 3. 用户中心 ============ */
  section('用户中心');
  {
    let r = await req('GET', '/api/user/addresses', { token: userToken });
    record('地址列表', ok(r), r);
    r = await req('POST', '/api/user/addresses', { token: userToken, body: { name: '李四', phone, region: '江西省 赣州市', detail: '测试路 88 号', isDefault: 1 } });
    record('新增地址', ok(r) && !!r.data.data.id, r);
    const addrId = r.data.data.id;
    r = await req('PUT', '/api/user/addresses/' + addrId, { token: userToken, body: { detail: '测试路 99 号' } });
    record('修改地址', ok(r) && r.data.data.detail === '测试路 99 号', r);
    r = await req('POST', '/api/user/addresses', { token: userToken, body: { name: '王五', phone, region: '广东省 深圳市', detail: '科技园 1 号' } });
    record('新增第二地址', ok(r), r);
    r = await req('DELETE', '/api/user/addresses/' + addrId, { token: userToken });
    record('删除地址', ok(r), r);

    r = await req('POST', '/api/user/favorites/' + pid, { token: userToken });
    record('收藏商品', ok(r) && r.data.data.favorited === true, r);
    r = await req('GET', '/api/user/favorites', { token: userToken });
    record('收藏列表', ok(r) && r.data.data.length >= 1, r);
    r = await req('DELETE', '/api/user/favorites/' + pid, { token: userToken });
    record('取消收藏', ok(r) && r.data.data.favorited === false, r);

    r = await req('POST', '/api/user/cart', { token: userToken, body: { productId: pid, quantity: 2 } });
    record('加入购物车', ok(r) && r.data.data.cartCount >= 1, r);
    const cartItemId = (await req('GET', '/api/user/cart', { token: userToken })).data.data[0].id;
    r = await req('PUT', '/api/user/cart/' + cartItemId, { token: userToken, body: { quantity: 5, checked: 1 } });
    record('修改购物车数量', ok(r) && r.data.data.quantity === 5, r);
    r = await req('POST', '/api/user/cart', { token: userToken, body: { productId: pid, quantity: 1 } });
    record('重复加入合并数量', ok(r) && r.data.data.cartCount >= 1, r);
    r = await req('PUT', '/api/user/cart/check-all', { token: userToken, body: { checked: 0 } });
    record('全不选', ok(r), r);
    r = await req('PUT', '/api/user/cart/check-all', { token: userToken, body: { checked: 1 } });
    record('全选', ok(r), r);
    r = await req('DELETE', '/api/user/cart/' + cartItemId, { token: userToken });
    record('删除购物车项', ok(r), r);

    /* 优惠券 */
    const shopCoupons = (await req('GET', '/api/shop/coupons')).data.data;
    const freeCoupon = shopCoupons.find((c) => !c.pointsCost) || shopCoupons[0];
    if (freeCoupon) {
      couponId = freeCoupon.id;
      couponThreshold = freeCoupon.threshold || 0;
      r = await req('POST', '/api/user/coupons/claim/' + couponId, { token: userToken });
      record('领取优惠券', ok(r), r);
      r = await req('POST', '/api/user/coupons/claim/' + couponId, { token: userToken });
      record('重复领取被拒', !ok(r), r);
      r = await req('GET', '/api/user/coupons', { token: userToken });
      record('我的优惠券', ok(r) && r.data.data.length >= 1, r);
      ucId = r.data.data[0] ? r.data.data[0].id : 0;
    } else {
      record('领取优惠券', false, { msg: '无可领优惠券' });
      couponThreshold = 0;
    }

    /* 订单：buynow 自动发货商品 */
    const addrList = (await req('GET', '/api/user/addresses', { token: userToken })).data.data;
    if (addrList.length === 0) {
      r = await req('POST', '/api/user/addresses', { token: userToken, body: { name: '李四', phone, region: '江西省 赣州市', detail: '测试路 88 号', isDefault: 1 } });
    }
    const finalAddr = (await req('GET', '/api/user/addresses', { token: userToken })).data.data[0];
    r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId: pid, quantity: 1, addressId: finalAddr.id } });
    record('创建订单(buynow)', ok(r) && !!r.data.data.orderId, r);
    orderId = r.data.data.orderId;
    const orderNo = r.data.data.orderNo;
    r = await req('GET', '/api/user/orders/' + orderId, { token: userToken });
    record('订单详情', ok(r) && r.data.data.orderNo === orderNo, r);

    /* 优惠券下单：按门槛计算数量 */
    if (ucId) {
      const prodDetail = await req('GET', '/api/shop/products/' + pid);
      const unitPrice = ok(prodDetail) ? prodDetail.data.data.price : 1;
      const needQty = Math.max(1, Math.ceil(couponThreshold / unitPrice));
      r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId: pid, quantity: needQty, addressId: finalAddr.id, couponId: ucId } });
      record('使用优惠券下单', ok(r), r);
      const cOrderId = ok(r) ? r.data.data.orderId : 0;
      if (cOrderId) {
        r = await req('POST', '/api/user/orders/' + cOrderId + '/cancel', { token: userToken, body: { reason: '测试取消' } });
        record('取消订单(优惠券单)', ok(r), r);
        r = await req('GET', '/api/user/coupons', { token: userToken });
        const couponBack = r.data.data.find((c) => c.id === ucId);
        record('取消后优惠券应返还(unused)', couponBack && couponBack.status === 'unused', { msg: JSON.stringify(couponBack) });
      }
    }

    /* 支付：模拟支付 */
    r = await req('POST', '/api/user/orders/' + orderId + '/pay', { token: userToken, body: { method: 'wechat' } });
    record('模拟微信支付', ok(r) && r.data.data.payMode === 'mock', r);
    const shipped = r.data.data;
    r = await req('GET', '/api/user/orders/' + orderId, { token: userToken });
    record('支付后自动发货状态', ok(r) && r.data.data.status === 'shipped' && r.data.data.cards.length >= 1, r);
    r = await req('POST', '/api/user/orders/' + orderId + '/pay', { token: userToken, body: { method: 'alipay' } });
    record('重复支付被拒', !ok(r), r);
    r = await req('POST', '/api/user/orders/' + orderId + '/confirm', { token: userToken });
    record('确认收货', ok(r), r);

    /* 手动发货商品订单 + 售后 */
    const manual = (await req('GET', '/api/shop/products?size=50')).data.data.list.find((p) => p.type === 'manual');
    if (manual) {
      manualProductId = manual.id;
      r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId: manual.id, quantity: 1, addressId: finalAddr.id } });
      record('创建手动发货订单', ok(r), r);
      manualOrderId = r.data.data.orderId;
      r = await req('POST', '/api/user/orders/' + manualOrderId + '/pay', { token: userToken, body: { method: 'alipay' } });
      record('模拟支付宝支付(手动单)', ok(r) && r.data.data.status === 'paid', r);
      r = await req('POST', '/api/user/orders/' + manualOrderId + '/aftersale', { token: userToken, body: { type: 'refund', reason: '测试售后' } });
      record('提交售后申请', ok(r) && !!r.data.data.aftersaleId, r);
    } else {
      record('手动发货商品存在', false, { msg: '未找到手动发货商品' });
    }

    /* 消息 */
    r = await req('GET', '/api/user/messages', { token: userToken });
    record('消息列表', ok(r) && Array.isArray(r.data.data.list), r);
    r = await req('GET', '/api/user/messages/unread-count', { token: userToken });
    record('未读消息数', ok(r) && typeof r.data.data.count === 'number', r);
    const mid = (await req('GET', '/api/user/messages', { token: userToken })).data.data.list[0];
    if (mid) {
      r = await req('POST', '/api/user/messages/' + mid.id + '/read', { token: userToken });
      record('单条已读', ok(r), r);
    }
    r = await req('POST', '/api/user/messages/read-all', { token: userToken });
    record('全部已读', ok(r), r);

    /* 积分 */
    r = await req('GET', '/api/user/points-logs', { token: userToken });
    record('积分明细', ok(r) && typeof r.data.data.balance === 'number', r);

    /* 工单 */
    r = await req('POST', '/api/user/tickets', { token: userToken, body: { type: '其他', description: '测试工单' } });
    record('提交工单', ok(r) && !!r.data.data.ticketId, r);
    const ticketId = r.data.data.ticketId;
    r = await req('GET', '/api/user/tickets', { token: userToken });
    record('工单列表', ok(r) && r.data.data.length >= 1, r);
    r = await req('GET', '/api/user/tickets/' + ticketId, { token: userToken });
    record('工单详情', ok(r), r);

    /* 客服 */
    r = await req('POST', '/api/user/chat', { token: userToken, body: { content: '卡密没到账怎么办' } });
    record('客服自动回复', ok(r) && !!r.data.data.reply, r);
    r = await req('GET', '/api/user/chat', { token: userToken });
    record('对话记录', ok(r) && r.data.data.length >= 2, r);

    /* 上传 */
    r = await req('POST', '/api/user/upload', { token: userToken, body: { data: Buffer.from('iVBORw0KGgo=', 'base64').toString('base64'), ext: 'png' } });
    record('用户图片上传', ok(r) && !!r.data.data.url, r);
  }

  /* ============ 4. 管理后台 ============ */
  section('管理后台');
  {
    let r = await req('POST', '/api/admin/login', { body: { username: 'admin', password: 'admin123' } });
    record('管理员登录', ok(r) && !!r.data.data.token, r);
    adminToken = r.data.data.token;

    r = await req('POST', '/api/admin/login', { body: { username: 'admin', password: 'wrong' } });
    record('管理员错误密码拒绝', !ok(r), r);

    r = await req('GET', '/api/admin/stats', { token: adminToken });
    record('数据概览', ok(r) && typeof r.data.data.totalSales === 'number', r);

    /* 商品 CRUD */
    const prodBody = { categoryId: (await req('GET', '/api/admin/categories', { token: adminToken })).data.data[0].id, name: '测试商品-' + Date.now(), price: 9.9, type: 'auto', cardCodeLen: 12, cardSecretLen: 6 };
    r = await req('POST', '/api/admin/products', { token: adminToken, body: prodBody });
    record('新增商品', ok(r) && !!r.data.data.id, r);
    const newPid = r.data.data.id;
    r = await req('PUT', '/api/admin/products/' + newPid, { token: adminToken, body: { price: 8.8, isHot: 1 } });
    record('修改商品', ok(r) && r.data.data.price === 8.8, r);
    r = await req('GET', '/api/admin/products?keyword=' + encodeURIComponent('测试商品'), { token: adminToken });
    record('商品搜索', ok(r) && r.data.data.list.some((p) => p.id === newPid), r);

    /* 卡密 */
    const uniqTag = String(Date.now()).slice(-6);
    r = await req('POST', '/api/admin/products/' + newPid + '/cards', { token: adminToken, body: { autoGenerate: true, count: 5, prefix: 'TST' } });
    record('自动生成卡密', ok(r) && r.data.data.added === 5, r);
    r = await req('POST', '/api/admin/products/' + newPid + '/cards', { token: adminToken, body: { text: 'TX' + uniqTag + 'A----S1\nTX' + uniqTag + 'B, S2\nTX' + uniqTag + 'C S3' } });
    record('文本批量导入卡密', ok(r) && r.data.data.added === 3, r);
    const dup1 = await req('POST', '/api/admin/products/' + newPid + '/cards', { token: adminToken, body: { text: 'TX' + uniqTag + 'D----S4\nTX' + uniqTag + 'E----S5' } });
    record('卡密去重-新码导入', ok(dup1) && dup1.data.data.added === 2, dup1);
    const dup2 = await req('POST', '/api/admin/products/' + newPid + '/cards', { token: adminToken, body: { text: 'TX' + uniqTag + 'D----S4' } });
    const dup2Pass = (ok(dup2) && dup2.data.data.added === 0) || (!ok(dup2) && /已存在|没有可添加/.test(msg(dup2)));
    record('卡密去重-重复码不重复入库', dup2Pass, dup2);
    r = await req('GET', '/api/admin/products/' + newPid + '/cards?status=unused', { token: adminToken });
    record('卡密列表(未用)', ok(r) && r.data.data.unused >= 8, r);
    cardId = r.data.data.list[0] ? r.data.data.list[0].id : 0;
    if (cardId) {
      r = await req('DELETE', '/api/admin/cards/' + cardId, { token: adminToken });
      record('删除卡密', ok(r), r);
    }

    /* 分类 CRUD */
    r = await req('POST', '/api/admin/categories', { token: adminToken, body: { name: '测试分类' + Date.now(), parentId: null } });
    record('新增一级分类', ok(r), r);
    const newCatId = r.data.data.id;
    r = await req('POST', '/api/admin/categories', { token: adminToken, body: { name: '测试子分类', parentId: newCatId } });
    record('新增子分类', ok(r) && r.data.data.parentId === newCatId, r);
    const newSubCatId = r.data.data.id;
    r = await req('PUT', '/api/admin/categories/' + newCatId, { token: adminToken, body: { name: '测试分类改' } });
    record('修改分类', ok(r), r);
    r = await req('PUT', '/api/admin/categories/' + newCatId, { token: adminToken, body: { parentId: newCatId } });
    record('分类上级不能是自己', !ok(r), r);

    /* 轮播 CRUD */
    r = await req('POST', '/api/admin/banners', { token: adminToken, body: { title: '测试Banner', image: '/img/banner1.svg', linkType: 'none' } });
    record('新增轮播', ok(r), r);
    const bannerId = r.data.data.id;
    r = await req('PUT', '/api/admin/banners/' + bannerId, { token: adminToken, body: { sort: 9 } });
    record('修改轮播', ok(r), r);
    r = await req('DELETE', '/api/admin/banners/' + bannerId, { token: adminToken });
    record('删除轮播', ok(r), r);

    /* 订单管理 */
    r = await req('GET', '/api/admin/orders', { token: adminToken });
    record('订单列表', ok(r) && Array.isArray(r.data.data.list), r);
    r = await req('GET', '/api/admin/orders/' + orderId, { token: adminToken });
    record('订单详情(管理端)', ok(r), r);

    if (manualOrderId) {
      const mo = (await req('GET', '/api/admin/orders/' + manualOrderId, { token: adminToken })).data.data;
      if (mo.status === 'paid') {
        r = await req('POST', '/api/admin/orders/' + manualOrderId + '/ship', { token: adminToken, body: { trackingNo: 'SF123456', logistics: '顺丰' } });
        record('手动发货', ok(r), r);
      } else {
        record('手动发货', false, { msg: '订单状态非 paid: ' + mo.status });
      }
      r = await req('GET', '/api/user/orders/' + manualOrderId, { token: userToken });
      record('用户端看到物流', ok(r) && r.data.data.trackingNo === 'SF123456', r);
      const afs = (await req('GET', '/api/user/aftersales', { token: userToken })).data.data;
      if (afs.length) {
        const afId = afs[0].id;
        r = await req('POST', '/api/admin/aftersales/' + afId + '/handle', { token: adminToken, body: { action: 'approve', reply: '同意退款' } });
        record('售后同意退款', ok(r), r);
        r = await req('GET', '/api/admin/orders/' + manualOrderId, { token: adminToken });
        record('退款后订单状态 refunded', ok(r) && r.data.data.status === 'refunded', r);
        r = await req('GET', '/api/user/orders/' + manualOrderId, { token: userToken });
        record('退款后库存/卡密恢复(手动单看订单状态)', ok(r), r);
      } else {
        record('售后同意退款', false, { msg: '无售后单' });
      }
    }

    /* 优惠券 CRUD */
    const t = Math.floor(Date.now() / 1000);
    r = await req('POST', '/api/admin/coupons', { token: adminToken, body: { name: '测试券', type: 'fullcut', threshold: 20, amount: 5, total: 100, startAt: t - 3600, endAt: t + 86400 } });
    record('新增优惠券', ok(r) && !!r.data.data.id, r);
    const adminCouponId = r.data.data.id;
    r = await req('PUT', '/api/admin/coupons/' + adminCouponId, { token: adminToken, body: { amount: 6 } });
    record('修改优惠券', ok(r) && r.data.data.amount === 6, r);

    /* FAQ CRUD */
    r = await req('POST', '/api/admin/faqs', { token: adminToken, body: { category: '测试', question: '测试问题?', answer: '测试答案' } });
    record('新增FAQ', ok(r), r);
    const faqId = r.data.data.id;
    r = await req('PUT', '/api/admin/faqs/' + faqId, { token: adminToken, body: { answer: '新答案' } });
    record('修改FAQ', ok(r) && r.data.data.answer === '新答案', r);
    r = await req('DELETE', '/api/admin/faqs/' + faqId, { token: adminToken });
    record('删除FAQ', ok(r), r);

    /* 工单处理 */
    const openTickets = (await req('GET', '/api/admin/tickets', { token: adminToken })).data.data.list;
    if (openTickets.length) {
      r = await req('POST', '/api/admin/tickets/' + openTickets[0].id + '/reply', { token: adminToken, body: { reply: '已处理' } });
      record('回复工单', ok(r), r);
    } else {
      record('回复工单', false, { msg: '无待处理工单' });
    }

    /* 客服 */
    r = await req('GET', '/api/admin/chat', { token: adminToken });
    record('对话列表(按用户聚合)', ok(r) && Array.isArray(r.data.data), r);
    if (r.data.data.length) {
      const uid = r.data.data[0].userId;
      r = await req('GET', '/api/admin/chat/' + uid, { token: adminToken });
      record('对话详情', ok(r) && Array.isArray(r.data.data), r);
      r = await req('POST', '/api/admin/chat/' + uid + '/reply', { token: adminToken, body: { content: '人工回复测试' } });
      record('人工回复', ok(r), r);
    }

    /* 消息广播 */
    r = await req('POST', '/api/admin/messages', { token: adminToken, body: { type: 'system', title: '系统维护通知', content: '今晚 23:00 系统维护' } });
    record('全员消息广播', ok(r), r);

    /* 用户管理 */
    const meResp = await req('GET', '/api/auth/me', { token: userToken });
    const curEmail = meResp.data && meResp.data.data && meResp.data.data.user.email;
    const usersResp = await req('GET', '/api/admin/users?keyword=' + encodeURIComponent(curEmail || email), { token: adminToken });
    const users = usersResp.data.data;
    record('用户搜索', ok(usersResp) && users.list.some((u) => u.email === (curEmail || email)), { msg: 'found=' + users.total });
    if (users.list.length) {
      const uid = users.list[0].id;
      r = await req('PUT', '/api/admin/users/' + uid, { token: adminToken, body: { points: 666 } });
      record('调整用户积分', ok(r), r);
      r = await req('GET', '/api/user/points-logs', { token: userToken });
      record('积分变更生效', ok(r) && r.data.data.balance === 666, r);
      r = await req('PUT', '/api/admin/users/' + uid, { token: adminToken, body: { status: 0 } });
      record('禁用用户', ok(r), r);
      r = await req('GET', '/api/auth/me', { token: userToken });
      record('被禁用后 token 失效', !ok(r) && r.data.code === 401, r);
      r = await req('PUT', '/api/admin/users/' + uid + '/password', { token: adminToken, body: { password: 'newpass2' } });
      record('管理员重置用户密码', ok(r), r);
      r = await req('PUT', '/api/admin/users/' + uid, { token: adminToken, body: { status: 1 } });
      record('恢复用户', ok(r), r);
      r = await req('POST', '/api/auth/login', { body: { account: curEmail || email, password: 'newpass2' } });
      record('新密码可登录', ok(r) && !!r.data.data.token, r);
      if (ok(r)) userToken = r.data.data.token;
    }

    /* 设置 */
    r = await req('GET', '/api/admin/settings', { token: adminToken });
    record('读取设置', ok(r) && !!r.data.data.siteName, r);
    const oldSiteName = r.data.data.siteName;
    r = await req('PUT', '/api/admin/settings', { token: adminToken, body: { siteName: '测试站点名', pointsRate: 2 } });
    record('保存设置', ok(r), r);
    r = await req('GET', '/api/shop/site', {});
    record('设置生效(站点名)', ok(r) && r.data.data.siteName === '测试站点名', r);
    r = await req('PUT', '/api/admin/settings', { token: adminToken, body: { siteName: oldSiteName, pointsRate: 1 } });
    record('还原设置', ok(r), r);

    /* 管理员上传 */
    r = await req('POST', '/api/admin/upload', { token: adminToken, body: { data: Buffer.from('iVBORw0KGgo=', 'base64').toString('base64'), ext: 'png' } });
    record('管理员图片上传', ok(r) && !!r.data.data.url, r);

    /* 权限边界 */
    r = await req('GET', '/api/admin/stats', { token: userToken });
    record('用户token访问后台被拒', !ok(r) && r.data.code === 401, r);
    r = await req('GET', '/api/admin/stats');
    record('未登录访问后台被拒', !ok(r) && r.data.code === 401, r);
    r = await req('GET', '/api/user/profile');
    record('未登录访问用户接口被拒', !ok(r) && r.data.code === 401, r);
  }

  /* ============ 5. 支付回调与支付配置 ============ */
  section('支付回调与配置');
  {
    /* 新建订单用于支付测试 */
    const addrList = (await req('GET', '/api/user/addresses', { token: userToken })).data.data;
    let r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId, quantity: 1, addressId: addrList[0].id } });
    const payOrderId = r.data.data.orderId;
    const payOrderNo = r.data.data.orderNo;

    /* 模拟支付渠道 */
    r = await req('POST', '/api/user/orders/' + payOrderId + '/pay', { token: userToken, body: { method: 'wechat' } });
    record('未配置商户参数→微信模拟支付', ok(r) && r.data.data.payMode === 'mock' && r.data.data.status === 'shipped', r);
    r = await req('GET', '/api/user/orders/' + payOrderId, { token: userToken });
    record('模拟支付自动发卡', ok(r) && r.data.data.status === 'shipped' && r.data.data.cardsDelivered >= 1, r);
    record('模拟支付已记 payMethod', ok(r) && r.data.data.payMethod === 'wechat', r);

    /* 微信回调（未配置密钥时应安全拒绝） */
    const wxNotify = { id: 'x', create_time: '', event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext: 'fake', nonce: 'fake', associated_data: 'txn' } };
    r = await req('POST', '/api/pay/notify/wechat', { raw: JSON.stringify(wxNotify), body: undefined });
    record('微信回调(伪造数据)被拒绝', r.status === 400, { status: r.status, body: r.data });

    /* 支付宝回调 */
    r = await req('POST', '/api/pay/notify/alipay', { raw: 'out_trade_no=' + payOrderNo + '&trade_status=TRADE_SUCCESS&total_amount=9.90&sign=fake', body: undefined, contentType: 'application/x-www-form-urlencoded' });
    record('支付宝回调(伪造数据)被拒绝', r.data === 'failure' || !ok(r), { status: r.status, body: r.data });

    /* 虎皮椒回调验签 */
    const xunhuParams = { version: '1.1', appid: 'test', trade_order_id: payOrderNo, total_fee: '9.90', status: 'OD' };
    r = await req('POST', '/api/pay/notify/xunhu', { raw: new URLSearchParams(xunhuParams).toString(), body: undefined, contentType: 'application/x-www-form-urlencoded' });
    record('虎皮椒回调(无签名)被拒绝', r.data === 'fail' || r.data !== 'success', { status: r.status, body: r.data });

    /* 站点支付开关 */
    r = await req('GET', '/api/shop/site', {});
    record('站点支付信息返回', ok(r) && 'paySandbox' in r.data.data && 'payWechat' in r.data.data, r);
  }

  /* ============ 6. 退款完整逻辑专项 ============ */
  section('退款完整逻辑（库存/积分/优惠券/卡密）');
  {
    const addrList = (await req('GET', '/api/user/addresses', { token: userToken })).data.data;
    /* 有库存商品：下单2件 → 支付 → 库存变化 → 退款 → 恢复 */
    const stockBefore = (await req('GET', '/api/shop/products/' + pid)).data.data.stock;
    let r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId: pid, quantity: 2, addressId: addrList[0].id } });
    record('退款专项-创建订单', ok(r), r);
    const refOrderId = ok(r) ? r.data.data.orderId : 0;
    if (refOrderId) {
      r = await req('POST', '/api/user/orders/' + refOrderId + '/pay', { token: userToken, body: { method: 'alipay' } });
      record('退款专项-模拟支付', ok(r), r);
      const stockAfter = (await req('GET', '/api/shop/products/' + pid)).data.data.stock;
      record('退款专项-支付后库存减少', stockAfter === stockBefore - 2, { msg: stockBefore + ' -> ' + stockAfter });
      const myUcBefore = (await req('GET', '/api/user/coupons', { token: userToken })).data.data;
      let unusedNow = myUcBefore.find((c) => c.status === 'unused');
      if (!unusedNow) {
        /* 被取消/退款未返还的券占用时，再领一张门槛最低的券用于验证退款返还 */
        const avail = (await req('GET', '/api/shop/coupons')).data.data.filter((c) => !c.pointsCost).sort((a, b) => a.threshold - b.threshold)[0];
        if (avail) {
          const cr = await req('POST', '/api/user/coupons/claim/' + avail.id, { token: userToken });
          if (ok(cr)) unusedNow = (await req('GET', '/api/user/coupons', { token: userToken })).data.data.find((c) => c.status === 'unused');
        }
      }
      /* 用一张券再下一单并支付，验证退款返还 */
      if (unusedNow) {
        const prodPrice = (await req('GET', '/api/shop/products/' + pid)).data.data.price;
        const needQty = Math.max(1, Math.ceil((unusedNow.threshold || 0) / prodPrice));
        r = await req('POST', '/api/user/orders', { token: userToken, body: { from: 'buynow', productId: pid, quantity: needQty, addressId: addrList[0].id, couponId: unusedNow.id } });
        if (ok(r)) {
          const couponOrderId = r.data.data.orderId;
          const payR = await req('POST', '/api/user/orders/' + couponOrderId + '/pay', { token: userToken, body: { method: 'wechat' } });
          record('退款专项-带券订单支付', ok(payR), payR);
          r = await req('POST', '/api/admin/orders/' + couponOrderId + '/refund', { token: adminToken, body: { reason: '专项测试退款' } });
          record('退款专项-管理员强制退款', ok(r), r);
          const ucAfter = (await req('GET', '/api/user/coupons', { token: userToken })).data.data.find((c) => c.id === unusedNow.id);
          record('退款专项-优惠券返还 unused', ucAfter && ucAfter.status === 'unused', { msg: JSON.stringify(ucAfter) });
        } else {
          record('退款专项-带券订单支付', false, { msg: '创建带券订单失败: ' + msg(r) });
        }
      } else {
        record('退款专项-带券订单支付', false, { msg: '无可用优惠券' });
      }
      /* 自动发货订单退款后卡密应恢复 */
      r = await req('POST', '/api/admin/orders/' + refOrderId + '/refund', { token: adminToken, body: { reason: '专项测试退款' } });
      record('退款专项-自动发货订单退款', ok(r), r);
      const stockAfterRefund = (await req('GET', '/api/shop/products/' + pid)).data.data.stock;
      record('退款专项-退款后卡密恢复(库存回满)', stockAfterRefund === stockBefore, { msg: stockBefore + ' -> ' + stockAfterRefund });
    }
  }

  /* ============ 6. 静态资源 & PWA ============ */
  section('静态资源与前端');
  {
    const checks = [
      ['/index.html', '用户端入口'],
      ['/admin.html', '管理后台入口'],
      ['/css/base.css', '用户端样式'],
      ['/css/admin.css', '后台样式'],
      ['/js/api.js', '前端API封装'],
      ['/js/app.js', '用户端逻辑'],
      ['/js/admin.js', '后台逻辑'],
      ['/js/qrcode.js', '二维码库'],
      ['/manifest.webmanifest', 'PWA清单'],
      ['/sw.js', 'Service Worker'],
      ['/img/logo.svg', 'Logo'],
      ['/img/icon-192.png', 'APP图标192'],
      ['/img/icon-512.png', 'APP图标512']
    ];
    for (const [p, n] of checks) {
      try {
        const res = await fetch(BASE + p);
        record('静态资源 ' + n + ' (' + p + ')', res.status === 200, { status: res.status });
      } catch (e) { record('静态资源 ' + n + ' (' + p + ')', false, { msg: e.message }); }
    }
    /* 服务端渲染 JS 语法检查（node --check 只能本地做，这里检查前端文件可被 fetch） */
  }

  /* ============ 汇总 ============ */
  console.log('\n========================================');
  console.log(`测试完成：通过 ${passed} 项，失败 ${failed} 项`);
  console.log('========================================');
  if (failures.length) {
    console.log('\n失败明细：');
    failures.forEach((f) => console.log('  ❌ ' + f.name + ' | status=' + (f.extra && f.extra.status) + ' | ' + (f.extra && (f.extra.msg || JSON.stringify(f.extra.data || '').slice(0, 400)))));
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试脚本异常:', e); process.exit(2); });
