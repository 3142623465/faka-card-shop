/**
 * 发卡网 API 安全测试 - 第五组：支付回调伪造/越权/竞态/注入/敏感信息/路径遍历/暴力破解限频
 */
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); }
  else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); }
}
async function req(method, path, body, token, rawBody) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)) });
  let json = null;
  try { json = await r.json(); } catch (e) { json = { parseError: true, raw: (await r.text().catch(() => '')) }; }
  return { status: r.status, json };
}
const cap = async () => (await req('GET', '/api/auth/captcha')).json.data;

(async () => {
  // 管理员登录
  const rl = await req('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  const at = rl.json.data.token;

  // 准备用户与商品
  async function newUser() {
    const phone = '18' + String(Date.now()).slice(-9);
    const c = await cap();
    const rs = await req('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken: c.token, captchaCode: c.devCode });
    const rr = await req('POST', '/api/auth/register', { phone, code: rs.json.data.devCode, password: 'test123' });
    return { phone, token: rr.json.data.token, uid: rr.json.data.user.id };
  }
  const u = await newUser();
  const ut = u.token;
  const addrR = await req('POST', '/api/user/addresses', { name: '安全测试', phone: '13800138000', region: '江西', detail: '测试路', isDefault: true }, ut);
  const addressId = addrR.json.data.id;

  // 创建库存商品（1 件卡密）
  const prodR = await req('POST', '/api/admin/products', { categoryId: 1, name: '安全测试商品' + Date.now(), price: 50, type: 'auto' }, at);
  const pid = prodR.json.data.id;
  await req('POST', '/api/admin/products/' + pid + '/cards', { text: 'SEC-CARD-' + Date.now() }, at);

  // ========== 1. 支付回调伪造（无验签） ==========
  // 创建订单但不支付
  const orderR = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId }, ut);
  const orderId = orderR.json.data.orderId;
  const orderNo = orderR.json.data.orderNo;

  // 伪造微信支付回调（模拟支付网关通知已支付）
  const fakeNotify = { orderNo, paidAmount: 50, transactionId: 'FAKE123' };
  let r = await req('POST', '/api/pay/notify/wechat', undefined, null, JSON.stringify(fakeNotify));
  // 无签名时：如果系统跳过验签，订单会被结算（严重漏洞）；应拒绝
  const afterFake = await req('GET', '/api/user/orders/' + orderId, undefined, ut);
  check('伪造微信回调未导致订单发货', afterFake.json.data.status === 'pending', 'status=' + afterFake.json.data.status);

  // 支付宝伪造
  const fakeAli = { out_trade_no: orderNo, trade_status: 'TRADE_SUCCESS', total_amount: '50.00', trade_no: 'FAKE_ALI' };
  r = await req('POST', '/api/pay/notify/alipay', undefined, null, new URLSearchParams(fakeAli).toString());
  const afterAli = await req('GET', '/api/user/orders/' + orderId, undefined, ut);
  check('伪造支付宝回调未导致订单发货', afterAli.json.data.status === 'pending', 'status=' + afterAli.json.data.status);

  // 虎皮椒伪造
  const fakeXh = { trade_order_id: orderNo, total_fee: '50.00', status: 'OD', transaction_id: 'FAKE_XH' };
  r = await req('POST', '/api/pay/notify/xunhu', undefined, null, new URLSearchParams(fakeXh).toString());
  const afterXh = await req('GET', '/api/user/orders/' + orderId, undefined, ut);
  check('伪造虎皮椒回调未导致订单发货', afterXh.json.data.status === 'pending', 'status=' + afterXh.json.data.status);

  // ========== 2. 金额不一致回调 ==========
  // 直接调模拟支付接口但传错误金额？模拟支付不受金额参数影响（服务端计算），验证订单金额为 50
  r = await req('POST', '/api/user/orders/' + orderId + '/pay', { method: 'wechat' }, ut);
  check('正常支付成功', r.json.code === 0, JSON.stringify(r.json.data).slice(0, 80));
  const afterPay = await req('GET', '/api/user/orders/' + orderId, undefined, ut);
  check('订单支付金额正确', afterPay.json.data.payAmount === 50, 'amount=' + afterPay.json.data.payAmount);

  // ========== 3. 越权 IDOR ==========
  const u2 = await newUser();
  const ut2 = u2.token;
  // 购物车越权
  r = await req('GET', '/api/user/cart', undefined, ut2);
  check('用户B购物车不含用户A商品', r.json.data.every(i => i.userId === u2.uid));
  // 用户B尝试修改用户A的购物车项
  const cartA = (await req('GET', '/api/user/cart', undefined, ut)).json.data[0];
  if (cartA) {
    r = await req('PUT', '/api/user/cart/' + cartA.id, { quantity: 99 }, ut2);
    check('越权-用户B不能改用户A购物车', r.json.code === 1, r.json.msg);
  }

  // 地址越权已测；消息越权
  const msgA = (await req('GET', '/api/user/messages', undefined, ut)).json.data.list[0];
  if (msgA) {
    r = await req('POST', '/api/user/messages/' + msgA.id + '/read', undefined, ut2);
    // 服务端 find 带 userId 条件，找不到则不修改（返回 ok 但无效果）
    const after = await req('GET', '/api/user/messages?size=100', undefined, ut);
    const m = after.json.data.list.find(x => x.id === msgA.id);
    check('越权-用户B不能读用户A消息', m && m.isRead === 0, 'isRead=' + (m && m.isRead));
  }

  // ========== 4. 管理员接口越权 ==========
  // 分站 token 访问管理接口
  const cB = await cap();
  const bLogin = await req('POST', '/api/branch/login', { username: u.phone, password: 'test123', captchaToken: cB.token, captchaCode: cB.devCode });
  // u 没有分站，先开通
  // 开通分站
  const myb = await req('GET', '/api/user/my-branch', undefined, ut);
  if (!myb.json.data) {
    await req('PUT', '/api/admin/users/' + u.uid + '/balance', { delta: 100, reason: 't' }, at);
    await req('POST', '/api/user/open-branch', { name: '安全测试分站', type: 'pro' }, ut);
  }
  const cB2 = await cap();
  const bLogin2 = await req('POST', '/api/branch/login', { username: u.phone, password: 'test123', captchaToken: cB2.token, captchaCode: cB2.devCode });
  const bt = bLogin2.json.data.token;
  r = await req('GET', '/api/admin/stats', undefined, bt);
  check('分站 token 访问 admin 被拒', r.status === 401, 'status=' + r.status);

  // ========== 5. 原型污染/注入 ==========
  r = await req('POST', '/api/user/tickets', { type: 'x', description: '{"__proto__":{"polluted":"yes"}}' }, ut);
  check('JSON 注入-工单创建正常', r.json.code === 0, r.json.msg || 'ok');
  r = await req('POST', '/api/user/chat', { content: '<script>alert(1)</script>' }, ut);
  check('XSS payload 存储', r.json.code === 0 && r.json.data.reply, 'reply ok');
  // 查询是否原样存储
  const chat = (await req('GET', '/api/user/chat', undefined, ut)).json.data;
  const stored = chat.find(c => c.content.includes('<script>'));
  check('XSS payload 原样存储（未过滤）', !!stored, 'stored=' + (stored ? 'yes' : 'no'));

  // 特殊字符订单备注
  r = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId, remark: '<img src=x onerror=alert(1)>' }, ut);
  check('含HTML的订单备注可创建', r.json.code === 0);

  // ========== 6. 登录暴力破解限频 ==========
  const c6a = await cap();
  let l1 = await req('POST', '/api/auth/login', { phone: u.phone, password: 'wrong1', captchaToken: c6a.token, captchaCode: c6a.devCode });
  const c6b = await cap();
  let l2 = await req('POST', '/api/auth/login', { phone: u.phone, password: 'wrong2', captchaToken: c6b.token, captchaCode: c6b.devCode });
  const c6c = await cap();
  let l3 = await req('POST', '/api/auth/login', { phone: u.phone, password: 'wrong3', captchaToken: c6c.token, captchaCode: c6c.devCode });
  const c6d = await cap();
  let l4 = await req('POST', '/api/auth/login', { phone: u.phone, password: 'wrong4', captchaToken: c6d.token, captchaCode: c6d.devCode });
  const c6e = await cap();
  let l5 = await req('POST', '/api/auth/login', { phone: u.phone, password: 'wrong5', captchaToken: c6e.token, captchaCode: c6e.devCode });
  check('第5次连续错误登录被限频', l5.json.code === 1 && /频繁/.test(l5.json.msg), 'l5=' + l5.json.msg);

  // ========== 7. 验证码爆破限频 ==========
  const c7 = await cap();
  const rs7 = await req('POST', '/api/auth/send-code', { phone: u2.phone, scene: 'login', captchaToken: c7.token, captchaCode: c7.devCode });
  let brute = null;
  for (let i = 0; i < 5; i++) {
    brute = await req('POST', '/api/auth/login-code', { phone: u2.phone, code: String(100000 + i) });
  }
  check('验证码错误5次后限频', brute.json.code === 1 && /频繁/.test(brute.json.msg), 'last=' + brute.json.msg);

  // ========== 8. 路径遍历 ==========
  const trav1 = await fetch(BASE + '/uploads/..%2f..%2fdata%2fdb.json');
  check('路径遍历被拦截或返回非敏感数据', trav1.status === 403 || trav1.status === 404 || trav1.status === 400, 'status=' + trav1.status);
  const trav2 = await fetch(BASE + '/uploads/....//....//data/db.json');
  check('路径遍历变体被拦截', trav2.status === 403 || trav2.status === 404 || trav2.status === 400, 'status=' + trav2.status);

  // ========== 9. 敏感信息泄露 ==========
  // 错误信息是否回显内部细节
  r = await req('POST', '/api/admin/products', { categoryId: 1, name: 'x', price: 1, type: 'badtype' }, at);
  check('非法参数返回友好错误', r.json.code === 1 && !/at /i.test(r.json.msg), r.json.msg);
  // 500 错误时是否泄露堆栈
  r = await req('GET', '/api/shop/products/abc/def/ghi');
  check('畸形路径友好404', r.status === 404, 'status=' + r.status);

  // ========== 10. 卡密并发购买（超卖） ==========
  // 新建库存 3 的商品，5 个用户并发购买 1 件，验证不超卖
  const prodR2 = await req('POST', '/api/admin/products', { categoryId: 1, name: '并发测试' + Date.now(), price: 10, type: 'auto' }, at);
  const pid2 = prodR2.json.data.id;
  await req('POST', '/api/admin/products/' + pid2 + '/cards', { text: ['CC1', 'CC2', 'CC3'].map(x => x + Date.now() % 10000).join('\n') }, at);
  const users = [];
  for (let i = 0; i < 5; i++) users.push(await newUser());
  // 每个用户建地址并下单
  const orders = [];
  for (const usr of users) {
    const a = await req('POST', '/api/user/addresses', { name: 'x', phone: '13800138000', region: 'x', detail: 'x', isDefault: true }, usr.token);
    const o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid2, quantity: 1, addressId: a.json.data.id }, usr.token);
    if (o.json.code === 0) orders.push({ ...o.json.data, token: usr.token });
  }
  // 并发支付
  const payResults = await Promise.all(orders.map(o => req('POST', '/api/user/orders/' + o.orderId + '/pay', { method: 'wechat' }, o.token)));
  const successCount = payResults.filter(p => p.json.code === 0 && p.json.data.status === 'shipped').length;
  check('库存3并发5购不超卖(最多3成功)', successCount <= 3, 'success=' + successCount);

  // ========== 11. CORS 检查 ==========
  const corsR = await fetch(BASE + '/api/shop/site', { headers: { 'Origin': 'http://evil.example.com' } });
  const acao = corsR.headers.get('access-control-allow-origin');
  check('CORS 未放开任意源', !acao || acao === 'null' || acao === '', 'acao=' + acao);

  // ========== 12. 响应头安全 ==========
  const headR = await fetch(BASE + '/index.html');
  check('存在 CSP 或至少基础安全头', !!headR.headers.get('content-security-policy'), 'csp=' + headR.headers.get('content-security-policy'));
  check('存在 X-Frame-Options', !!headR.headers.get('x-frame-options') || !!headR.headers.get('frame-ancestors'), 'xfo=' + headR.headers.get('x-frame-options'));

  // ========== 清理 ==========
  await req('DELETE', '/api/admin/products/' + pid, undefined, at);
  await req('DELETE', '/api/admin/products/' + pid2, undefined, at);

  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
