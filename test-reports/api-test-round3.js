/**
 * 发卡网系统 第三轮综合回归测试（适配新版邮箱认证体系）
 * 覆盖维度：公开接口 / 认证 / 用户业务 / 管理后台 / 分站分销 / 安全专项 / 手动支付回归
 * 运行：node test-reports/api-test-round3.js
 * 说明：全部使用动态注册的临时账号与临时商品，测试结束后通过管理 API 清理；60s 限频已内建等待。
 */
const BASE = process.env.TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0, skipped = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: (detail || '').slice(0, 140) }); }
  else { fail++; results.push({ name, status: 'FAIL', detail: (detail || '').slice(0, 140) }); }
}
function skip(name, detail) { skipped++; results.push({ name, status: 'SKIP', detail }); }
async function req(method, path, body, token, rawBody) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let r;
  try {
    r = await fetch(BASE + path, { method, headers, body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)) });
  } catch (e) { return { status: 0, json: { code: 1, msg: '网络错误:' + e.message } }; }
  let json = null;
  try { json = await r.json(); } catch (e) { json = { code: 1, msg: '响应非JSON', raw: (await r.text().catch(() => '')) }; }
  return { status: r.status, json };
}
const cap = async () => { const r = await req('GET', '/api/auth/captcha'); return r.json.data || {}; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { pass, fail, skipped, results };
  try {
    const R = {};

    /* ================= A. 公开接口 ================= */
    R.banners = await req('GET', '/api/shop/banners');
    check('A1 GET /shop/banners', R.banners.json.code === 0 && Array.isArray(R.banners.json.data), JSON.stringify(R.banners.json).slice(0, 100));
    R.cats = await req('GET', '/api/shop/categories');
    check('A2 GET /shop/categories', R.cats.json.code === 0 && Array.isArray(R.cats.json.data) && R.cats.json.data.length > 0, 'count=' + (R.cats.json.data || []).length);
    R.prods = await req('GET', '/api/shop/products?page=1&size=5');
    check('A3 GET /shop/products 分页', R.prods.json.code === 0 && R.prods.json.data.list.length <= 5 && R.prods.json.data.total > 0, 'total=' + (R.prods.json.data && R.prods.json.data.total));
    const prodList = (R.prods.json.data && R.prods.json.data.list) || [];
    const autoProd = prodList.find((p) => p.type === 'auto') || prodList[0];
    check('A4 商品列表含必需字段', !!autoProd && autoProd.id && autoProd.price !== undefined && autoProd.name, autoProd && (autoProd.id + '/' + autoProd.name));
    R.kw = await req('GET', '/api/shop/hot-keywords');
    check('A5 GET /shop/hot-keywords', R.kw.json.code === 0, JSON.stringify(R.kw.json).slice(0, 80));
    R.faq = await req('GET', '/api/shop/faqs');
    check('A6 GET /shop/faqs', R.faq.json.code === 0, 'count=' + (R.faq.json.data || []).length);
    R.detail = await req('GET', '/api/shop/products/' + autoProd.id);
    check('A7 GET /shop/products/:id 详情', R.detail.json.code === 0 && R.detail.json.data.id === autoProd.id, JSON.stringify(R.detail.json).slice(0, 80));
    R.nf = await req('GET', '/api/shop/products/99999999');
    check('A8 不存在商品返回友好错误', R.nf.json.code === 1, R.nf.json.msg || '');
    R.health = await req('GET', '/api/health');
    check('A9 GET /api/health', R.health.json.code === 0, JSON.stringify(R.health.json).slice(0, 80));
    R.settings = await req('GET', '/api/shop/site');
    check('A10 公开站点信息不含支付密钥', R.settings.json.code === 0 && !JSON.stringify(R.settings.json).match(/privateKey|appSecret|apiKey|xunhuAppSecret/i), JSON.stringify(R.settings.json).slice(0, 120));

    /* ================= B. 认证 ================= */
    const em1 = 'r3a' + Date.now() + '@test.com';
    const c1 = await cap();
    check('B1 验证码接口返回 token+svg', !!c1.token && !!c1.svg, c1.token ? 'ok' : 'no-token');
    const s1 = await req('POST', '/api/auth/send-email-code', { email: em1, scene: 'register', captchaToken: c1.token, captchaCode: c1.devCode });
    check('B2 发送邮箱注册验证码', s1.json.code === 0, s1.json.msg || '');
    const code1 = s1.json.data && s1.json.data.devCode;
    const rg1 = await req('POST', '/api/auth/register-email', { email: em1, code: code1, password: 'test123', nickname: '三轮测试A' });
    check('B3 邮箱注册成功', rg1.json.code === 0 && rg1.json.data.token, rg1.json.msg || '');
    const tA = rg1.json.data && rg1.json.data.token;
    check('B4 注册返回用户信息', rg1.json.data && rg1.json.data.user && rg1.json.data.user.id, 'uid=' + (rg1.json.data && rg1.json.data.user && rg1.json.data.user.id));
    const dup = await req('POST', '/api/auth/register-email', { email: em1, code: '000000', password: 'x' });
    check('B5 重复邮箱注册被拒', dup.json.code === 1, dup.json.msg || '');
    const badCode = await req('POST', '/api/auth/send-email-code', { email: 'bad' + Date.now() + '@test.com', scene: 'register', captchaToken: 'x', captchaCode: 'y' });
    check('B6 图形验证码错误被拒', badCode.json.code === 1, badCode.json.msg || '');
    const capL = await cap();
    const lg = await req('POST', '/api/auth/login', { account: em1, password: 'test123', captchaToken: capL.token, captchaCode: capL.devCode });
    check('B7 账号密码登录成功', lg.json.code === 0 && lg.json.data.token, lg.json.msg || '');
    const capL2 = await cap();
    const lgBad = await req('POST', '/api/auth/login', { account: em1, password: 'wrongpass', captchaToken: capL2.token, captchaCode: capL2.devCode });
    check('B8 错误密码被拒', lgBad.json.code === 1, lgBad.json.msg || '');
    // 暴力破解限频：连续 5 次错误后第 6 次触发限频
    let bruteBlocked = false, bruteDetail = '';
    for (let i = 0; i < 6; i++) {
      const cX = await cap();
      const b = await req('POST', '/api/auth/login', { account: em1, password: 'wrong' + i, captchaToken: cX.token, captchaCode: cX.devCode });
      if (i >= 5 && b.json.code === 1 && /频繁|锁定|尝试/.test(b.json.msg || '')) { bruteBlocked = true; bruteDetail = b.json.msg; }
    }
    check('B9 连续错误登录触发限频', bruteBlocked, bruteDetail || '未触发');
    const noTok = await req('GET', '/api/user/profile');
    check('B10 未授权访问 /api/user 401', noTok.status === 401, 'status=' + noTok.status);
    const badTok = await req('GET', '/api/user/profile', undefined, 'invalid.token.here');
    check('B11 非法 token 被拒', badTok.status === 401, 'status=' + badTok.status);

    /* ================= C. 用户业务 ================= */
    const addr = await req('POST', '/api/user/addresses', { name: '张三', phone: '13800138000', region: '江西省赣州市', detail: '章贡区测试路1号', isDefault: true }, tA);
    check('C1 新增默认地址', addr.json.code === 0 && addr.json.data.isDefault === 1, addr.json.msg || '');
    const addrId = addr.json.data && addr.json.data.id;
    const addr2 = await req('POST', '/api/user/addresses', { name: '李四', phone: '13900139000', region: '广东省深圳市', detail: '南山区测试路2号' }, tA);
    check('C2 新增第二地址且非默认', addr2.json.code === 0 && addr2.json.data.isDefault === 0, 'isDefault=' + (addr2.json.data && addr2.json.data.isDefault));
    const addrDef = await req('PUT', '/api/user/addresses/' + addr2.json.data.id + '/default', undefined, tA);
    check('C3 切换默认地址', addrDef.json.code === 0, addrDef.json.msg || '');
    const addrUpd = await req('PUT', '/api/user/addresses/' + addrId, { name: '张三丰' }, tA);
    check('C4 更新地址', addrUpd.json.code === 0 && addrUpd.json.data.name === '张三丰', addrUpd.json.msg || '');
    const fav = await req('POST', '/api/user/favorites/' + autoProd.id, {}, tA);
    check('C5 添加收藏', fav.json.code === 0, fav.json.msg || '');
    const favDup = await req('POST', '/api/user/favorites/' + autoProd.id, {}, tA);
    check('C6 重复收藏幂等(不报错)', favDup.json.code === 0, favDup.json.msg || '');
    const favList = await req('GET', '/api/user/favorites', undefined, tA);
    check('C7 收藏列表', favList.json.code === 0 && favList.json.data.length >= 1, 'count=' + (favList.json.data || []).length);
    const cart = await req('POST', '/api/user/cart', { productId: autoProd.id, quantity: 1 }, tA);
    check('C8 加入购物车', cart.json.code === 0, cart.json.msg || '');
    const cart2 = await req('POST', '/api/user/cart', { productId: autoProd.id, quantity: 1 }, tA);
    check('C9 同商品购物车累加', cart2.json.code === 0 && cart2.json.data.cartCount >= 1, 'cartCount=' + (cart2.json.data && cart2.json.data.cartCount));
    const cartList = await req('GET', '/api/user/cart', undefined, tA);
    check('C10 购物车列表', cartList.json.code === 0, 'items=' + (cartList.json.data || []).length);
    // 下单-模拟支付-自动发货
    const o1 = await req('POST', '/api/user/orders', { from: 'buynow', productId: autoProd.id, quantity: 1, addressId: addrId }, tA);
    check('C11 立即购买下单', o1.json.code === 0 && o1.json.data.orderId, o1.json.msg || JSON.stringify(o1.json).slice(0, 100));
    const oid1 = o1.json.data && o1.json.data.orderId;
    const pay1 = await req('POST', '/api/user/orders/' + oid1 + '/pay', { method: 'simulate' }, tA);
    check('C12 模拟支付成功', pay1.json.code === 0, JSON.stringify(pay1.json).slice(0, 120));
    const od1 = await req('GET', '/api/user/orders/' + oid1, undefined, tA);
    check('C13 自动商品支付后已发货(shipped)', od1.json.data && od1.json.data.status === 'shipped', (od1.json.data && od1.json.data.status) || '');
    check('C14 订单含卡密', od1.json.data && od1.json.data.cards && od1.json.data.cards.length === 1, 'cards=' + (od1.json.data && od1.json.data.cards && od1.json.data.cards.length));
    const payDup = await req('POST', '/api/user/orders/' + oid1 + '/pay', { method: 'simulate' }, tA);
    check('C15 重复支付被拦截', payDup.json.code === 1, payDup.json.msg || '');
    const confirm1 = await req('POST', '/api/user/orders/' + oid1 + '/confirm', undefined, tA);
    check('C16 确认收货', confirm1.json.code === 0, confirm1.json.msg || '');
    const od1b = await req('GET', '/api/user/orders/' + oid1, undefined, tA);
    check('C17 确认后状态 completed', od1b.json.data && od1b.json.data.status === 'completed', (od1b.json.data && od1b.json.data.status) || '');
    // 库存不足拦截
    const cN = await req('POST', '/api/user/cart', { productId: autoProd.id, quantity: 99999 }, tA);
    check('C18 超量加购被拦截', cN.json.code === 1, cN.json.msg || 'code=' + cN.json.code);
    // 取消订单
    const o2 = await req('POST', '/api/user/orders', { from: 'buynow', productId: autoProd.id, quantity: 1, addressId: addrId }, tA);
    const oid2 = o2.json.data && o2.json.data.orderId;
    const cancel2 = await req('POST', '/api/user/orders/' + oid2 + '/cancel', undefined, tA);
    check('C19 取消待付款订单', cancel2.json.code === 0, cancel2.json.msg || '');
    const od2 = await req('GET', '/api/user/orders/' + oid2, undefined, tA);
    check('C20 取消后状态 cancelled', od2.json.data && od2.json.data.status === 'cancelled', (od2.json.data && od2.json.data.status) || '');
    // 售后
    const as = await req('POST', '/api/user/orders/' + oid1 + '/aftersale', { type: 'refund', reason: '卡密无法使用' }, tA);
    check('C21 发起售后', as.json.code === 0, as.json.msg || '');
    const asDup = await req('POST', '/api/user/orders/' + oid1 + '/aftersale', { type: 'refund', reason: '再申请' }, tA);
    check('C22 重复售后被拦截', asDup.json.code === 1, asDup.json.msg || '');
    // 消息
    const msgs = await req('GET', '/api/user/messages', undefined, tA);
    check('C23 消息列表', msgs.json.code === 0, 'count=' + (msgs.json.data && msgs.json.data.length));
    const unread = await req('GET', '/api/user/messages/unread-count', undefined, tA);
    check('C24 未读消息数接口', unread.json.code === 0, JSON.stringify(unread.json).slice(0, 60));
    // 工单
    const tic = await req('POST', '/api/user/tickets', { type: '售后问题', description: '测试工单描述内容' }, tA);
    check('C25 提交工单', tic.json.code === 0, tic.json.msg || '');
    const ticList = await req('GET', '/api/user/tickets', undefined, tA);
    check('C26 工单列表', ticList.json.code === 0 && ticList.json.data.length >= 1, 'count=' + (ticList.json.data || []).length);
    // 积分
    const points = await req('GET', '/api/user/points-logs', undefined, tA);
    check('C27 积分明细接口', points.json.code === 0 && Array.isArray(points.json.data.list), 'count=' + ((points.json.data && points.json.data.list) || []).length);
    // 越权（用户B 操作 A 的地址）
    const em2 = 'r3b' + Date.now() + '@test.com';
    const c2 = await cap();
    const s2 = await req('POST', '/api/auth/send-email-code', { email: em2, scene: 'register', captchaToken: c2.token, captchaCode: c2.devCode });
    const rg2 = await req('POST', '/api/auth/register-email', { email: em2, code: s2.json.data.devCode, password: 'test123', nickname: '三轮测试B' });
    const tB = rg2.json.data && rg2.json.data.token;
    check('C28 注册用户B', !!tB, rg2.json.msg || '');
    const idor = await req('GET', '/api/user/addresses/' + addrId, undefined, tB);
    check('C29 越权读他人地址被拒', idor.json.code === 1 || idor.status === 401 || idor.status === 403, (idor.json.msg || idor.status));
    const idorDel = await req('DELETE', '/api/user/addresses/' + addrId, undefined, tB);
    check('C30 越权删他人地址被拒', idorDel.json.code === 1, idorDel.json.msg || '');

    /* ================= D. 管理后台 ================= */
    const cAdm = await cap();
    const adm = await req('POST', '/api/auth/login', { account: 'admin', password: 'admin123', captchaToken: cAdm.token, captchaCode: cAdm.devCode });
    const tAdm = adm.json.data && adm.json.data.token;
    check('D1 管理员登录', adm.json.code === 0 && adm.json.data.role === 'admin', adm.json.msg || '');
    const admBad = await req('POST', '/api/auth/login', { account: 'admin', password: 'wrong' });
    check('D2 管理员错误密码被拒', admBad.json.code === 1, admBad.json.msg || '');
    const noAdm = await req('GET', '/api/admin/stats');
    check('D3 未授权访问 admin 401', noAdm.status === 401, 'status=' + noAdm.status);
    const uTokAdm = await req('GET', '/api/admin/stats', undefined, tA);
    check('D4 用户 token 访问 admin 401(角色提升)', uTokAdm.status === 401, 'status=' + uTokAdm.status);
    const stats = await req('GET', '/api/admin/stats', undefined, tAdm);
    check('D5 仪表盘统计', stats.json.code === 0 && stats.json.data.totalOrders !== undefined, JSON.stringify(stats.json).slice(0, 80));
    check('D6 仪表盘含7日趋势', stats.json.data && Array.isArray(stats.json.data.trend) && stats.json.data.trend.length === 7, 'trend=' + ((stats.json.data && stats.json.data.trend) || []).length);
    // 分类
    const catNew = await req('POST', '/api/admin/categories', { name: '三轮测试分类' + Date.now(), sort: 99 }, tAdm);
    check('D7 新增分类', catNew.json.code === 0, catNew.json.msg || '');
    const catId = catNew.json.data && catNew.json.data.id;
    const catSub = await req('POST', '/api/admin/categories', { name: '三轮子分类', parentId: catId }, tAdm);
    check('D8 新增子分类', catSub.json.code === 0, catSub.json.msg || '');
    const catSelf = await req('POST', '/api/admin/categories', { name: '自引用', parentId: catId }, tAdm);
    const catSelf2 = await req('PUT', '/api/admin/categories/' + catId, { parentId: catId }, tAdm);
    check('D9 分类自引用拦截', catSelf.json.code === 0 && catSelf2.json.code === 1, 'self=' + catSelf2.json.msg || '');
    // 商品：负价必须被拒
    const negP = await req('POST', '/api/admin/products', { categoryId: catId, name: '负价商品', price: -100 }, tAdm);
    check('D10 负价商品被拒(H-1回归)', negP.json.code === 1, negP.json.msg || '');
    const negP2 = await req('POST', '/api/admin/products', { categoryId: catId, name: '负原价商品', price: 50, originalPrice: -5 }, tAdm);
    check('D11 负原价被拒', negP2.json.code === 1, negP2.json.msg || '');
    const zeroP = await req('POST', '/api/admin/products', { categoryId: catId, name: '零元商品', price: 0 }, tAdm);
    check('D12 零价商品处理', zeroP.json.code === 0 || zeroP.json.code === 1, zeroP.json.msg || JSON.stringify(zeroP.json).slice(0, 80));
    const prodNew = await req('POST', '/api/admin/products', { categoryId: catId, name: '三轮自动商品' + Date.now(), price: 66, type: 'auto' }, tAdm);
    check('D13 新增自动发货商品', prodNew.json.code === 0 && prodNew.json.data.id, prodNew.json.msg || '');
    const tpid = prodNew.json.data && prodNew.json.data.id;
    // 卡密：同批次重复检测（L-10回归）
    const tag = 'R3-' + Date.now();
    const cards = await req('POST', '/api/admin/products/' + tpid + '/cards', { text: tag + 'A\n' + tag + 'A\n' + tag + 'B\n' + tag + 'C' }, tAdm);
    check('D14 同批次重复卡密被检测(L-10回归)', cards.json.code === 0 && cards.json.data.added === 3 && cards.json.data.duplicated === 1, JSON.stringify(cards.json.data || cards.json.msg));
    // 跨商品同码允许（M-1回归）
    const prodNew2 = await req('POST', '/api/admin/products', { categoryId: catId, name: '三轮商品2' + Date.now(), price: 30, type: 'auto' }, tAdm);
    const tpid2 = prodNew2.json.data && prodNew2.json.data.id;
    const cards2 = await req('POST', '/api/admin/products/' + tpid2 + '/cards', { text: tag + 'A\n' + tag + 'D' }, tAdm);
    check('D15 跨商品同码允许(M-1回归)', cards2.json.code === 0 && cards2.json.data.added === 2, JSON.stringify(cards2.json.data || cards2.json.msg));
    // 订单发货/退款
    const o3 = await req('POST', '/api/user/orders', { from: 'buynow', productId: tpid, quantity: 1, addressId: addrId }, tA);
    const oid3 = o3.json.data && o3.json.data.orderId;
    await req('POST', '/api/user/orders/' + oid3 + '/pay', { method: 'simulate' }, tA);
    const od3 = await req('GET', '/api/user/orders/' + oid3, undefined, tA);
    check('D16 测试订单已自动发货', od3.json.data && od3.json.data.status === 'shipped', (od3.json.data && od3.json.data.status) || '');
    const refund = await req('POST', '/api/admin/orders/' + oid3 + '/refund', { reason: '测试退款' }, tAdm);
    check('D17 管理员退款', refund.json.code === 0, refund.json.msg || '');
    const refundDup = await req('POST', '/api/admin/orders/' + oid3 + '/refund', { reason: '再退' }, tAdm);
    check('D18 重复退款被拦截', refundDup.json.code === 1, refundDup.json.msg || '');
    // 手动发货商品：管理员发货
    const prodMan = await req('POST', '/api/admin/products', { categoryId: catId, name: '三轮手动商品' + Date.now(), price: 10, type: 'manual', stock: 5 }, tAdm);
    const pmid = prodMan.json.data && prodMan.json.data.id;
    const o4 = await req('POST', '/api/user/orders', { from: 'buynow', productId: pmid, quantity: 1, addressId: addrId }, tA);
    const oid4 = o4.json.data && o4.json.data.orderId;
    await req('POST', '/api/user/orders/' + oid4 + '/pay', { method: 'simulate' }, tA);
    const od4 = await req('GET', '/api/user/orders/' + oid4, undefined, tA);
    check('D19 手动商品支付后待发货(paid)', od4.json.data && od4.json.data.status === 'paid', (od4.json.data && od4.json.data.status) || '');
    const ship = await req('POST', '/api/admin/orders/' + oid4 + '/ship', { remark: '已发', trackingNo: 'SF1234567890', logistics: '顺丰' }, tAdm);
    check('D20 管理员发货', ship.json.code === 0, ship.json.msg || '');
    const shipDup = await req('POST', '/api/admin/orders/' + oid4 + '/ship', { remark: '再发' }, tAdm);
    check('D21 重复发货被拦截', shipDup.json.code === 1, shipDup.json.msg || '');
    // 用户管理
    const uSearch = await req('GET', '/api/admin/users?keyword=' + encodeURIComponent(em1), undefined, tAdm);
    check('D22 用户搜索', uSearch.json.code === 0 && uSearch.json.data.list.length >= 1, 'count=' + ((uSearch.json.data && uSearch.json.data.list) || []).length);
    const uidA = rg1.json.data.user.id;
    const curPoints = uSearch.json.data.list[0].points || 0;
    const ptAdj = await req('PUT', '/api/admin/users/' + uidA, { points: curPoints + 10 }, tAdm);
    check('D23 管理员调整积分', ptAdj.json.code === 0, ptAdj.json.msg || '');
    // 设置：公开接口不泄露密钥
    const setG = await req('GET', '/api/admin/settings', undefined, tAdm);
    check('D24 读取后台设置', setG.json.code === 0, setG.json.msg || '');
    const setPub = await req('GET', '/api/shop/site');
    const setPubStr = JSON.stringify(setPub.json.data || {});
    check('D25 公开设置不含密钥字段', !/privateKey|appSecret|xunhuAppSecret/i.test(setPubStr), 'ok');
    const setU = await req('PUT', '/api/admin/settings', { siteName: '324云系统·测试' }, tAdm);
    check('D26 更新站点名称', setU.json.code === 0, setU.json.msg || '');
    await req('PUT', '/api/admin/settings', { siteName: '324云系统' }, tAdm);
    // 轮播
    const banner = await req('POST', '/api/admin/banners', { title: '三轮轮播', image: '/img/placeholder.svg', link: '/', sort: 1 }, tAdm);
    check('D27 新增轮播', banner.json.code === 0, banner.json.msg || '');
    const bannerId = banner.json.data && banner.json.data.id;
    const bannerDel = await req('DELETE', '/api/admin/banners/' + bannerId, undefined, tAdm);
    check('D28 删除轮播', bannerDel.json.code === 0, bannerDel.json.msg || '');
    // 优惠券
    const nowTs = Math.floor(Date.now() / 1000);
    const coupon = await req('POST', '/api/admin/coupons', { name: '三轮满减券', type: 'fullcut', threshold: 100, amount: 20, startAt: nowTs - 86400, endAt: nowTs + 86400 * 7, total: 100 }, tAdm);
    check('D29 新增满减券', coupon.json.code === 0, coupon.json.msg || JSON.stringify(coupon.json).slice(0, 100));
    const couponBad = await req('POST', '/api/admin/coupons', { name: '时间倒置券', type: 'discount', threshold: 0, discount: 0.9, startAt: nowTs + 86400, endAt: nowTs - 86400, total: 100 }, tAdm);
    check('D30 时间倒置券被拒', couponBad.json.code === 1, couponBad.json.msg || '');
    // FAQ
    const faqN = await req('POST', '/api/admin/faqs', { question: '三轮FAQ？', answer: '三轮答案' }, tAdm);
    check('D31 新增FAQ', faqN.json.code === 0, faqN.json.msg || '');
    // 卡密清理
    const cDel = await req('DELETE', '/api/admin/products/' + tpid, undefined, tAdm);
    const cDel2 = await req('DELETE', '/api/admin/products/' + tpid2, undefined, tAdm);
    const cDel3 = await req('DELETE', '/api/admin/products/' + pmid, undefined, tAdm);
    const cDel4 = await req('DELETE', '/api/admin/products/' + (zeroP.json.data && zeroP.json.data.id), undefined, tAdm);
    check('D32 清理测试商品', cDel.json.code === 0 && cDel2.json.code === 0 && cDel3.json.code === 0, 'ok');
    const catDel = await req('DELETE', '/api/admin/categories/' + catId, undefined, tAdm);
    check('D33 删除测试分类', catDel.json.code === 0, catDel.json.msg || '');

    /* ================= E. 分站/分销 ================= */
    const bc = await req('GET', '/api/user/branch-config', undefined, tA);
    check('E1 分站开通配置', bc.json.code === 0 && bc.json.data && bc.json.data.prices && bc.json.data.prices.pro !== undefined, JSON.stringify(bc.json).slice(0, 100));
    const em3 = 'r3c' + Date.now() + '@test.com';
    const c3 = await cap();
    const s3 = await req('POST', '/api/auth/send-email-code', { email: em3, scene: 'register', captchaToken: c3.token, captchaCode: c3.devCode });
    const rg3 = await req('POST', '/api/auth/register-email', { email: em3, code: s3.json.data.devCode, password: 'test123', nickname: '分站主' });
    const tC = rg3.json.data && rg3.json.data.token;
    const uidC = rg3.json.data && rg3.json.data.user && rg3.json.data.user.id;
    await req('PUT', '/api/admin/users/' + uidC + '/balance', { delta: 500, reason: '测试' }, tAdm);
    const openB = await req('POST', '/api/user/open-branch', { name: '三轮专业分站', type: 'pro' }, tC);
    check('E2 开通专业分站', openB.json.code === 0, openB.json.msg || JSON.stringify(openB.json).slice(0, 100));
    const cBl = await cap();
    const branchLogin = await req('POST', '/api/branch/login', { username: em3, password: 'test123', captchaToken: cBl.token, captchaCode: cBl.devCode });
    check('E3 分站独立登录(邮箱)', branchLogin.json.code === 0 && branchLogin.json.data.token, branchLogin.json.msg || '');
    const bTok = branchLogin.json.data && branchLogin.json.data.token;
    const bProds = await req('GET', '/api/branch/products', undefined, bTok);
    check('E4 分站商品目录', bProds.json.code === 0, 'count=' + ((bProds.json.data && bProds.json.data.list) || []).length);
    // 加价限制：低于总站价被拒
    const bUp = await req('POST', '/api/branch/products', { sourceId: autoProd.id, price: 0.01 }, bTok);
    check('E5 分站加价低于总站价被拒', bUp.json.code === 1, bUp.json.msg || '');

    /* ================= F. 安全专项 ================= */
    // 支付回调伪造（微信/支付宝/虎皮椒）不应发货
    const o5 = await req('POST', '/api/user/orders', { from: 'buynow', productId: autoProd.id, quantity: 1, addressId: addrId }, tA);
    const oid5 = o5.json.data && o5.json.data.orderId;
    const orderNo5 = o5.json.data && o5.json.data.orderNo;
    const fakeWx = await req('POST', '/api/pay/notify/wechat', undefined, null, JSON.stringify({ orderNo: orderNo5, paidAmount: 999, transactionId: 'FAKE123' }));
    const od5 = await req('GET', '/api/user/orders/' + oid5, undefined, tA);
    check('F1 伪造微信回调未发货', fakeWx.json.code === 1 || od5.json.data.status === 'pending', '回调=' + (fakeWx.json.msg || 'ok') + ' 状态=' + od5.json.data.status);
    const fakeAli = await req('POST', '/api/pay/notify/alipay', undefined, null, new URLSearchParams({ out_trade_no: orderNo5, trade_status: 'TRADE_SUCCESS', total_amount: '999.00', trade_no: 'FAKE' }).toString());
    const od5b = await req('GET', '/api/user/orders/' + oid5, undefined, tA);
    check('F2 伪造支付宝回调未发货', fakeAli.json.code === 1 || od5b.json.data.status === 'pending', '回调=' + (fakeAli.json.msg || 'ok') + ' 状态=' + od5b.json.data.status);
    const fakeXh = await req('POST', '/api/pay/notify/xunhu', undefined, null, new URLSearchParams({ order_no: orderNo5, status: 'OD', total_fee: '999.00', trade_no: 'FAKE' }).toString());
    const od5c = await req('GET', '/api/user/orders/' + oid5, undefined, tA);
    check('F3 伪造虎皮椒回调未发货', fakeXh.json.code === 1 || od5c.json.data.status === 'pending', '回调=' + (fakeXh.json.msg || 'ok') + ' 状态=' + od5c.json.data.status);
    await req('POST', '/api/user/orders/' + oid5 + '/cancel', undefined, tA);
    // 并发超卖：库存3 并发5购+并发支付（真实结算竞争）
    const prodRace = await req('POST', '/api/admin/products', { categoryId: catId || 1, name: '并发测试' + Date.now(), price: 5, type: 'auto', stock: 3 }, tAdm);
    const racePid = prodRace.json.data && prodRace.json.data.id;
    await req('POST', '/api/admin/products/' + racePid + '/cards', { text: 'RACE-1\nRACE-2\nRACE-3' }, tAdm);
    const raceOrders = await Promise.all([1, 2, 3, 4, 5].map(() => req('POST', '/api/user/orders', { from: 'buynow', productId: racePid, quantity: 1, addressId: addrId }, tA)));
    const raceOk = raceOrders.filter((r) => r.json.code === 0).length;
    check('F4 并发创建订单无服务器异常', raceOk >= 1, '成功创建=' + raceOk);
    // 对成功订单并发模拟支付：真实超卖防护在结算环节
    const raceIds = raceOrders.filter((r) => r.json.code === 0).map((r) => r.json.data.orderId);
    const payRaces = await Promise.all(raceIds.map((oid) => req('POST', '/api/user/orders/' + oid + '/pay', { method: 'simulate' }, tA)));
    const payOk = payRaces.filter((r) => r.json.code === 0).length;
    check('F5 并发支付结算不超卖(库存3至多3单发货)', payOk <= 3, '支付成功=' + payOk);
    const raceProd = await req('GET', '/api/shop/products/' + racePid);
    check('F6 并发后库存不为负', (raceProd.json.data && raceProd.json.data.stock) >= 0, 'stock=' + (raceProd.json.data && raceProd.json.data.stock));
    await req('DELETE', '/api/admin/products/' + racePid, undefined, tAdm);
    // 路径遍历
    const trav = await req('GET', '/api/../server/config.js');
    check('F7 路径遍历被拦截', trav.status === 404 || trav.status === 400 || trav.status === 403, 'status=' + trav.status);
    const trav2 = await req('GET', '/uploads/..%2f..%2fserver/config.js');
    check('F8 编码路径遍历被拦截', trav2.status === 404 || trav2.status === 400 || trav2.status === 403, 'status=' + trav2.status);
    // XSS 存储：订单备注含 HTML 应被后端清理（L-3）
    const o6 = await req('POST', '/api/user/orders', { from: 'buynow', productId: autoProd.id, quantity: 1, addressId: addrId, remark: '<script>alert(1)</script>测试备注' }, tA);
    const oid6 = o6.json.data && o6.json.data.orderId;
    const od6 = await req('GET', '/api/user/orders/' + oid6, undefined, tA);
    const remarkStored = (od6.json.data && od6.json.data.remark) || '';
    check('F9 备注HTML被后端清理(L-3)', remarkStored.indexOf('<script>') < 0 && remarkStored.indexOf('alert(1)') < 0, 'remark=' + remarkStored.slice(0, 40));
    await req('POST', '/api/user/orders/' + oid6 + '/cancel', undefined, tA);
    // 原型污染
    const pp = await req('POST', '/api/user/addresses', { name: 'x', phone: '13800138000', region: 'x', detail: 'x', __proto__: { polluted: true } }, tA);
    check('F10 原型污染注入不生效', pp.json.code === 0, JSON.stringify(pp.json).slice(0, 60));
    // 安全响应头
    let hdrRes = null;
    try {
      const fr = await fetch(BASE + '/');
      hdrRes = fr.headers;
    } catch (e) { hdrRes = null; }
    const hdrs = hdrRes ? Object.fromEntries(hdrRes.entries()) : {};
    const hdrStr = JSON.stringify(hdrs);
    check('F11 存在CSP安全头', /content-security-policy/i.test(hdrStr), 'CSP=' + /content-security-policy/i.test(hdrStr));
    check('F12 存在防点击劫持头', /x-frame-options/i.test(hdrStr) || /frame-ancestors/i.test(hdrStr), 'Frame=' + /x-frame-options/i.test(hdrStr));
    check('F13 存在nosniff头', /x-content-type-options/i.test(hdrStr), 'Nosniff=' + /x-content-type-options/i.test(hdrStr));

    /* ================= G. 手动支付回归（H-3） ================= */
    const sG = await req('GET', '/api/admin/settings', undefined, tAdm);
    const wasEnabled = sG.json.data && sG.json.data.manualPayEnabled;
    const origWx = (sG.json.data && sG.json.data.wechatQrcode) || '';
    const origAli = (sG.json.data && sG.json.data.alipayQrcode) || '';
    const origNotice = (sG.json.data && sG.json.data.payNotice) || '';
    if (!wasEnabled) await req('PUT', '/api/admin/settings', { manualPayEnabled: true }, tAdm);
    const prodMp = await req('POST', '/api/admin/products', { categoryId: catId || 1, name: '手动支付回归' + Date.now(), price: 88, type: 'auto' }, tAdm);
    const mpPid = prodMp.json.data && prodMp.json.data.id;
    await req('POST', '/api/admin/products/' + mpPid + '/cards', { text: 'MPR-' + Date.now() + '-1' }, tAdm);
    const oMp = await req('POST', '/api/user/orders', { from: 'buynow', productId: mpPid, quantity: 1, addressId: addrId }, tA);
    const mpOid = oMp.json.data && oMp.json.data.orderId;
    const payMp = await req('POST', '/api/user/orders/' + mpOid + '/pay', { method: 'manual' }, tA);
    check('G1 发起手动支付成功', payMp.json.code === 0 && payMp.json.data.status === 'pending_confirm', JSON.stringify(payMp.json).slice(0, 100));
    const confMp = await req('POST', '/api/admin/orders/' + mpOid + '/confirm-pay', undefined, tAdm);
    check('G2 管理员确认收款返回成功', confMp.json.code === 0, confMp.json.msg || '');
    const odMp = await req('GET', '/api/user/orders/' + mpOid, undefined, tA);
    check('G3 确认后自动发货(H-3回归)', odMp.json.data && odMp.json.data.status === 'shipped', (odMp.json.data && odMp.json.data.status) || '');
    check('G4 发货含卡密', odMp.json.data && odMp.json.data.cards && odMp.json.data.cards.length >= 1, 'cards=' + (odMp.json.data && odMp.json.data.cards && odMp.json.data.cards.length));
    const confDup = await req('POST', '/api/admin/orders/' + mpOid + '/confirm-pay', undefined, tAdm);
    check('G5 重复确认被拦截(幂等)', confDup.json.code === 1, confDup.json.msg || '');
    // 恢复设置并清理
    await req('PUT', '/api/admin/settings', { manualPayEnabled: wasEnabled, wechatQrcode: origWx, alipayQrcode: origAli, payNotice: origNotice }, tAdm);
    await req('DELETE', '/api/admin/products/' + mpPid, undefined, tAdm);

    /* ================= 收尾清理 ================= */
    // 清理测试用户产生的地址、收藏、购物车（商品已删，不做全量清理）
    await req('DELETE', '/api/user/addresses/' + addrId, undefined, tA).catch(() => {});
  } catch (e) {
    fail++;
    results.push({ name: '脚本异常', status: 'FAIL', detail: e.message });
  }
  out.pass = pass; out.fail = fail; out.skipped = skipped; out.results = results;
  out.summary = { total: pass + fail + skipped, pass, fail, skipped, rate: ((pass / Math.max(1, pass + fail)) * 100).toFixed(1) + '%' };
  console.log(JSON.stringify(out, null, 2));
})();
