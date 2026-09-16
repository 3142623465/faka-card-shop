/**
 * [历史存档] 本脚本基于旧版手机号认证体系编写，已不适用于当前邮箱认证 API，仅供查阅。
 * 发卡网 API 功能测试 - 第三组：管理后台（登录/统计/商品/卡密/分类/轮播/订单/售后/用户/优惠券/FAQ/工单/客服/消息/设置/分站管理）
 */
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); }
  else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); }
}
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch (e) { json = { parseError: true }; }
  return { status: r.status, json };
}

(async () => {
  // ========== 管理员登录 ==========
  let r = await req('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  check('POST /admin/login 默认账号登录', r.json.code === 0 && r.json.data.token, r.json.msg || 'ok');
  const at = r.json.data.token;

  // 错误密码
  r = await req('POST', '/api/admin/login', { username: 'admin', password: 'wrong' });
  check('管理员错误密码被拒', r.json.code === 1, r.json.msg);

  // 未授权访问
  r = await req('GET', '/api/admin/stats');
  check('未授权访问 admin API 被拒', r.status === 401, 'status=' + r.status);

  // 用户 token 访问 admin API（角色提升攻击）
  const phone = '130' + String(Date.now()).slice(-8);
  const c = await req('GET', '/api/auth/captcha');
  const rs = await req('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken: c.json.data.token, captchaCode: c.json.data.devCode });
  const rr = await req('POST', '/api/auth/register', { phone, code: rs.json.data.devCode, password: 'test123' });
  const ut = rr.json.data.token;
  r = await req('GET', '/api/admin/stats', undefined, ut);
  check('用户 token 访问 admin API 被拒', r.status === 401, 'status=' + r.status);

  // ========== 仪表盘 ==========
  r = await req('GET', '/api/admin/stats', undefined, at);
  check('GET /admin/stats 仪表盘', r.json.code === 0 && r.json.data.totalOrders !== undefined, 'users=' + r.json.data.totalUsers + ' orders=' + r.json.data.totalOrders);
  check('仪表盘含近7天趋势', Array.isArray(r.json.data.trend) && r.json.data.trend.length === 7, 'trend=' + (r.json.data.trend || []).length);
  check('仪表盘含热销TOP5', Array.isArray(r.json.data.topProducts), 'top=' + (r.json.data.topProducts || []).length);

  // ========== 分类管理 ==========
  r = await req('POST', '/api/admin/categories', { name: '测试分类' + Date.now(), sort: 99 }, at);
  check('POST /admin/categories 新增分类', r.json.code === 0, r.json.msg);
  const catId = r.json.data.id;
  r = await req('POST', '/api/admin/categories', { name: '测试子分类', parentId: catId }, at);
  check('POST /admin/categories 新增子分类', r.json.code === 0);
  const subCatId = r.json.data.id;
  r = await req('PUT', '/api/admin/categories/' + catId, { name: '测试分类改', status: 1 }, at);
  check('PUT /admin/categories/:id 更新', r.json.code === 0 && r.json.data.name === '测试分类改');
  r = await req('PUT', '/api/admin/categories/' + catId, { parentId: catId }, at);
  check('分类上级不能是自己', r.json.code === 1, r.json.msg);

  // ========== 商品管理 ==========
  r = await req('POST', '/api/admin/products', { categoryId: catId, name: '测试商品' + Date.now(), price: 9.9, type: 'auto', stock: 0, cardCodeLen: 12 }, at);
  check('POST /admin/products 新增自动发货商品', r.json.code === 0, r.json.msg);
  const prodId = r.json.data.id;

  r = await req('POST', '/api/admin/products', { categoryId: catId, name: '手动商品', price: 5, type: 'manual', stock: 10 }, at);
  check('POST /admin/products 新增手动发货商品', r.json.code === 0);
  const manualId = r.json.data.id;

  // 非法参数：价格负数
  r = await req('POST', '/api/admin/products', { categoryId: catId, name: '负价商品', price: -100, type: 'manual', stock: 1 }, at);
  check('新增商品-负价格处理', r.json.code === 0 && r.json.data.price >= 0, 'price=' + r.json.data.price);

  r = await req('PUT', '/api/admin/products/' + prodId, { price: 19.9, isHot: true, status: 1 }, at);
  check('PUT /admin/products/:id 更新', r.json.code === 0 && r.json.data.price === 19.9);

  r = await req('GET', '/api/admin/products?keyword=测试商品', undefined, at);
  check('GET /admin/products 搜索', r.json.code === 0 && r.json.data.total >= 1);

  // ========== 卡密管理 ==========
  const cardPrefix = 'T' + Date.now().toString().slice(-6);
  r = await req('POST', '/api/admin/products/' + prodId + '/cards', { text: cardPrefix + '0001\n' + cardPrefix + '0002----SEC2\n' + cardPrefix + '0003,SEC3\n' + cardPrefix + '0004 SEC4' }, at);
  check('POST /admin/products/:id/cards 文本批量加卡密', r.json.code === 0 && r.json.data.added === 4, JSON.stringify(r.json).slice(0, 100));

  r = await req('POST', '/api/admin/products/' + prodId + '/cards', { text: cardPrefix + '0001' }, at);
  check('重复卡密去重(全部重复返回提示)', r.json.code === 1 && /已存在|没有可添加/.test(r.json.msg), JSON.stringify(r.json).slice(0, 80));

  r = await req('POST', '/api/admin/products/' + prodId + '/cards', { autoGenerate: true, count: 50 }, at);
  check('卡密自动生成50条', r.json.code === 0 && r.json.data.added === 50, 'added=' + r.json.data.added);

  // 自动生成超过上限
  r = await req('POST', '/api/admin/products/' + prodId + '/cards', { autoGenerate: true, count: 99999 }, at);
  check('卡密生成数量上限钳制(≤10000)', r.json.code === 0 && r.json.data.added <= 10000, 'added=' + r.json.data.added);

  r = await req('GET', '/api/admin/products/' + prodId + '/cards?status=unused', undefined, at);
  check('GET /admin/products/:id/cards 未用卡密', r.json.code === 0 && r.json.data.unused > 0, 'unused=' + r.json.data.unused);

  // 手动商品不能加卡密
  r = await req('POST', '/api/admin/products/' + manualId + '/cards', { text: 'X1' }, at);
  check('手动商品加卡密被拒', r.json.code === 1, r.json.msg);

  // ========== 轮播 ==========
  r = await req('POST', '/api/admin/banners', { title: '测试轮播', image: '/img/banner1.svg', linkType: 'none', sort: 1, status: 1 }, at);
  check('POST /admin/banners 新增', r.json.code === 0, r.json.msg);
  const bannerId = r.json.data.id;
  r = await req('PUT', '/api/admin/banners/' + bannerId, { title: '测试轮播改' }, at);
  check('PUT /admin/banners/:id 更新', r.json.code === 0);

  // ========== 优惠券 ==========
  const now = Math.floor(Date.now() / 1000);
  r = await req('POST', '/admin/'.length ? '/api/admin/coupons' : '', { name: '满10减5', type: 'fullcut', threshold: 10, amount: 5, total: 100, startAt: now - 1000, endAt: now + 86400 * 7 }, at);
  check('POST /admin/coupons 满减券', r.json.code === 0, r.json.msg);
  const couponId = r.json.data.id;
  r = await req('POST', '/api/admin/coupons', { name: '9折券', type: 'discount', discount: 0.9, total: 100, startAt: now - 1000, endAt: now + 86400 * 7 }, at);
  check('POST /admin/coupons 折扣券', r.json.code === 0);
  r = await req('POST', '/api/admin/coupons', { name: '坏券', type: 'fullcut', threshold: 10, amount: 5, total: 100, startAt: now + 1000, endAt: now - 1000 }, at);
  check('POST /admin/coupons 时间倒置被拒', r.json.code === 1, r.json.msg);

  // ========== FAQ ==========
  r = await req('POST', '/api/admin/faqs', { category: '发货', question: '什么时候发货？', answer: '自动发货商品付款秒发。' }, at);
  check('POST /admin/faqs 新增', r.json.code === 0);
  const faqId = r.json.data.id;
  r = await req('PUT', '/api/admin/faqs/' + faqId, { answer: '自动发货商品付款后立即到账。' }, at);
  check('PUT /admin/faqs/:id 更新', r.json.code === 0);

  // ========== 订单管理（用户下单后管理员发货/退款） ==========
  // 先让用户下单并支付（手动商品走发货流程）
  const c2 = await req('GET', '/api/auth/captcha');
  const rs2 = await req('POST', '/api/auth/send-code', { phone: phone, scene: 'login', captchaToken: c2.json.data.token, captchaCode: c2.json.data.devCode });
  // phone 注册过了，login 场景也行（但60s限频可能触发，用已有token）
  const addrR = await req('GET', '/api/user/addresses', undefined, ut);
  let addressId;
  if (addrR.json.data.length === 0) {
    const a = await req('POST', '/api/user/addresses', { name: '管理员测试', phone: '13800138000', region: '江西赣州', detail: '测试路1号', isDefault: true }, ut);
    addressId = a.json.data.id;
  } else addressId = addrR.json.data[0].id;
  const orderR = await req('POST', '/api/user/orders', { from: 'buynow', productId: manualId, quantity: 2, addressId }, ut);
  check('前置：用户下单手动商品', orderR.json.code === 0, orderR.json.msg || 'ok');
  const oid = orderR.json.data.orderId;
  await req('POST', '/api/user/orders/' + oid + '/pay', { method: 'wechat' }, ut);

  r = await req('GET', '/api/admin/orders?status=paid', undefined, at);
  check('GET /admin/orders 待发货列表', r.json.code === 0 && r.json.data.total >= 1, 'total=' + r.json.data.total);

  // 管理员发货
  r = await req('POST', '/api/admin/orders/' + oid + '/ship', { trackingNo: 'SF1234567890', logistics: '顺丰' }, at);
  check('POST /admin/orders/:id/ship 发货', r.json.code === 0, r.json.msg);
  r = await req('POST', '/api/admin/orders/' + oid + '/ship', { trackingNo: 'SF1' }, at);
  check('重复发货被拒', r.json.code === 1, r.json.msg);

  // 订单价格修改
  r = await req('PUT', '/api/admin/orders/' + oid + '/price', { payAmount: 1 }, at);
  check('已付款订单不能改价', r.json.code === 1, r.json.msg);

  // 退款
  r = await req('POST', '/api/admin/orders/' + oid + '/refund', { reason: '测试退款' }, at);
  check('POST /admin/orders/:id/refund 退款', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/admin/orders/' + oid, undefined, at);
  check('退款后状态 refunded', r.json.data.status === 'refunded', r.json.data.status);
  check('退款恢复手动库存', r.json.data.goods[0].quantity > 0, 'qty=' + r.json.data.goods[0].quantity);

  // 再退一次
  r = await req('POST', '/api/admin/orders/' + oid + '/refund', { reason: '重复退款' }, at);
  check('已退款订单不能再退', r.json.code === 1, r.json.msg);

  // ========== 售后处理 ==========
  // 用户申请售后（用之前的已完成订单？没有。新建订单支付确认收货再售后）
  const orderR2 = await req('POST', '/api/user/orders', { from: 'buynow', productId: manualId, quantity: 1, addressId }, ut);
  const oid2 = orderR2.json.data.orderId;
  await req('POST', '/api/user/orders/' + oid2 + '/pay', { method: 'alipay' }, ut);
  await req('POST', '/api/admin/orders/' + oid2 + '/ship', { trackingNo: 'SF2' }, at);
  await req('POST', '/api/user/orders/' + oid2 + '/confirm', undefined, ut);
  const afR = await req('POST', '/api/user/orders/' + oid2 + '/aftersale', { type: 'return', reason: '申请退货' }, ut);
  check('前置：用户提交售后', afR.json.code === 0);
  const afId = afR.json.data.aftersaleId;

  r = await req('GET', '/api/admin/aftersales?status=pending', undefined, at);
  check('GET /admin/aftersales 待处理列表', r.json.code === 0 && r.json.data.total >= 1);

  r = await req('POST', '/api/admin/aftersales/' + afId + '/handle', { action: 'approve', reply: '同意退货' }, at);
  check('POST /admin/aftersales/:id/handle 同意退款', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/admin/orders/' + oid2, undefined, at);
  check('售后同意后订单已退款', r.json.data.status === 'refunded', r.json.data.status);

  r = await req('POST', '/api/admin/aftersales/' + afId + '/handle', { action: 'approve' }, at);
  check('重复处理售后被拒', r.json.code === 1, r.json.msg);

  // ========== 用户管理 ==========
  r = await req('GET', '/api/admin/users?keyword=' + phone, undefined, at);
  check('GET /admin/users 搜索', r.json.code === 0 && r.json.data.total === 1, 'total=' + r.json.data.total);
  const uid = r.json.data.list[0].id;

  r = await req('PUT', '/api/admin/users/' + uid, { points: 500, nickname: '管理改名' }, at);
  check('PUT /admin/users/:id 调积分改昵称', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/auth/me', undefined, ut);
  check('用户积分已更新', r.json.data.user.points === 500, 'points=' + r.json.data.user.points);

  r = await req('PUT', '/api/admin/users/' + uid + '/balance', { delta: 100, reason: '测试充值' }, at);
  check('PUT /admin/users/:id/balance 余额调整', r.json.code === 0 && r.json.data.balance === 100, 'balance=' + r.json.data.balance);

  // 禁用用户 → 踢下线
  r = await req('PUT', '/api/admin/users/' + uid, { status: 0 }, at);
  check('PUT /admin/users/:id 禁用用户', r.json.code === 0);
  r = await req('GET', '/api/auth/me', undefined, ut);
  check('禁用后用户 token 失效', r.status === 401, 'status=' + r.status);
  r = await req('PUT', '/api/admin/users/' + uid, { status: 1 }, at);
  check('重新启用用户', r.json.code === 0);

  // ========== 消息广播 ==========
  r = await req('POST', '/api/admin/messages', { title: '系统公告', content: '欢迎使用发卡网', type: 'system' }, at);
  check('POST /admin/messages 全员广播', r.json.code === 0, r.json.msg);

  // ========== 系统设置 ==========
  r = await req('GET', '/api/admin/settings', undefined, at);
  check('GET /admin/settings', r.json.code === 0 && r.json.data.siteName);

  // 敏感信息泄露检查：settings 返回支付密钥明文
  const settings = r.json.data;
  check('设置接口不泄露支付私钥', !settings.wechatPrivateKey && !settings.alipayPrivateKey, 'wechatPrivateKey=' + (settings.wechatPrivateKey ? 'LEAK' : 'hidden'));
  check('设置接口不泄露 xunhu 密钥', !settings.xunhuAppSecret, 'xunhuAppSecret=' + (settings.xunhuAppSecret ? 'LEAK' : 'hidden'));

  r = await req('PUT', '/api/admin/settings', { pointsRate: 2, registerPoints: 100, pendingCancelMinutes: 15, autoConfirmDays: 3 }, at);
  check('PUT /admin/settings 更新', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/admin/settings', undefined, at);
  check('设置持久化验证', r.json.data.pointsRate === 2 && r.json.data.registerPoints === 100);

  // ========== 分站管理 ==========
  r = await req('GET', '/api/admin/branch-prices', undefined, at);
  check('GET /admin/branch-prices', r.json.code === 0);
  r = await req('PUT', '/api/admin/branch-prices', { pro: 10, normal: 0 }, at);
  check('PUT /admin/branch-prices', r.json.code === 0);
  r = await req('PUT', '/api/admin/branch-prices', { pro: -1, normal: 0 }, at);
  check('负价格被拒', r.json.code === 1, r.json.msg);

  // 管理员开分站
  r = await req('POST', '/api/admin/branches', { name: '测试专业分站', username: 'testbranch' + Date.now() % 100000, password: '123456', type: 'pro' }, at);
  check('POST /admin/branches 开通专业分站', r.json.code === 0, r.json.msg);
  const branchId = r.json.data.id;
  r = await req('GET', '/api/admin/branches', undefined, at);
  check('GET /admin/branches 列表', r.json.code === 0 && r.json.data.length >= 1);
  r = await req('PUT', '/api/admin/branches/' + branchId, { status: 0 }, at);
  check('PUT /admin/branches/:id 停用', r.json.code === 0);
  r = await req('PUT', '/api/admin/branches/' + branchId, { status: 1 }, at);
  check('PUT /admin/branches/:id 启用', r.json.code === 0);
  r = await req('DELETE', '/api/admin/branches/' + branchId, undefined, at);
  check('DELETE /admin/branches/:id 删除', r.json.code === 0);

  // ========== 清理测试数据 ==========
  r = await req('DELETE', '/api/admin/products/' + prodId, undefined, at);
  check('DELETE /admin/products/:id 删除商品', r.json.code === 0, r.json.msg);
  r = await req('DELETE', '/api/admin/products/' + manualId, undefined, at);
  check('DELETE /admin/products/:id 删除手动商品', r.json.code === 0);
  r = await req('DELETE', '/api/admin/categories/' + catId, undefined, at);
  check('DELETE /admin/categories/:id 删除分类(含子)', r.json.code === 0);
  r = await req('DELETE', '/api/admin/banners/' + bannerId, undefined, at);
  check('DELETE /admin/banners/:id', r.json.code === 0);
  r = await req('DELETE', '/api/admin/coupons/' + couponId, undefined, at);
  check('DELETE /admin/coupons/:id', r.json.code === 0);

  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
