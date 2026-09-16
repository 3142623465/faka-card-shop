/**
 * verify-fixes.js - 本轮 8 个报告缺陷 + 1 个重复退款资金漏洞的专项回归
 * 运行：node test-reports/verify-fixes.js（需先启动服务并重建演示数据）
 */
const BASE = process.env.TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: String(detail || '').slice(0, 160) }); }
  else { fail++; results.push({ name, status: 'FAIL', detail: String(detail || '').slice(0, 160) }); }
}
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let r;
  try { r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { return { status: 0, json: { code: 1, msg: '网络错误:' + e.message }, text: '' }; }
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { json = null; }
  return { status: r.status, json: json || { code: 1, msg: '非JSON' }, text };
}
/** 发送原始字符串 body（用于制造非法 JSON / 误标 Content-Type） */
async function raw(method, path, rawBody, contentType) {
  let r;
  try { r = await fetch(BASE + path, { method, headers: { 'Content-Type': contentType }, body: rawBody }); }
  catch (e) { return { status: 0, text: '网络错误:' + e.message }; }
  return { status: r.status, text: await r.text() };
}
const cap = async () => (await req('GET', '/api/auth/captcha')).json.data || {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    /* ---------- BUG-008 全局 JSON 解析错误：400 且不泄漏内部信息 ---------- */
    const badJson = await raw('POST', '/api/auth/login', '{bad json,,,', 'application/json');
    check('BUG-008 非法JSON返回400', badJson.status === 400, 'status=' + badJson.status);
    check('BUG-008 提示友好且不泄漏SyntaxError', /请求格式错误/.test(badJson.text) && !/SyntaxError|Unexpected token|JSON/i.test(badJson.text), badJson.text.slice(0, 80));

    /* ---------- BUG-002 支付回调：表单串误标 application/json 不得 500 ---------- */
    const cb1 = await raw('POST', '/api/pay/notify/alipay', 'out_trade_no=x&trade_status=TRADE_SUCCESS', 'application/json');
    check('BUG-002 误标JSON的表单回调不回500', cb1.status !== 500, 'status=' + cb1.status);
    check('BUG-002 回调优雅应答failure', cb1.status === 400 && /failure/i.test(cb1.text), 'status=' + cb1.status + ' body=' + cb1.text);
    const cb2 = await raw('POST', '/api/pay/notify/xunhu', 'a=1&b=2', 'application/x-www-form-urlencoded');
    check('BUG-002 正常表单编码回调不500(验签失败failure)', cb2.status !== 500, 'status=' + cb2.status + ' body=' + cb2.text);

    /* ---------- 登录 demo 与管理员 ---------- */
    const cD = await cap();
    const demoLg = await req('POST', '/api/auth/login', { account: 'demo@example.com', password: '123456', captchaToken: cD.token, captchaCode: cD.devCode });
    check('登录演示用户', demoLg.json.code === 0, demoLg.json.msg || '');
    const demoToken = demoLg.json.data && demoLg.json.data.token;

    const admLg = await req('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
    check('登录管理员', admLg.json.code === 0, admLg.json.msg || '');
    const adminToken = admLg.json.data && admLg.json.data.token;

    /* ---------- BUG-001 并发下单超卖 ---------- */
    const cats = (await req('GET', '/api/shop/categories')).json.data || [];
    const catId = cats[0].id;
    const stock1Name = '并发超卖验证商品' + Date.now();
    const cp = await req('POST', '/api/admin/products', { categoryId: catId, name: stock1Name, price: 1, type: 'manual', stock: 1, status: 1 }, adminToken);
    const stock1Id = cp.json.data && cp.json.data.id;
    check('BUG-001 准备库存=1商品', cp.json.code === 0 && stock1Id, 'pid=' + stock1Id);
    // 地址
    const addr = await req('POST', '/api/user/addresses', { name: '测试', phone: '13800000000', region: '江西省赣州市', detail: '测试地址1号' }, demoToken);
    const addressId = addr.json.data && addr.json.data.id;
    check('准备收货地址', addr.json.code === 0 && addressId, 'aid=' + addressId);
    // 并发 6 单
    const concur = await Promise.all(Array.from({ length: 6 }, () =>
      req('POST', '/api/user/orders', { from: 'buynow', productId: stock1Id, quantity: 1, addressId }, demoToken)));
    const okCount = concur.filter((r) => r.json.code === 0).length;
    const rejectMsgs = concur.filter((r) => r.json.code !== 0).map((r) => r.json.msg);
    check('BUG-001 库存1并发6单仅1单成功', okCount === 1, '成功=' + okCount + ' 拒绝原因=' + JSON.stringify([...new Set(rejectMsgs)]));

    /* ---------- BUG-003/004 非法数量严格拒绝（不依赖库存，参数层即拒） ---------- */
    for (const q of [-1, -100, 0, 1000, 'abc', null]) {
      const r = await req('POST', '/api/user/orders', { from: 'buynow', productId: stock1Id, quantity: q, addressId }, demoToken);
      check('BUG-003/004 数量' + JSON.stringify(q) + '被拒', r.json.code === 1 && /数量不合法/.test(r.json.msg || ''), r.json.msg || '');
    }

    /* ---------- BUG-005 注册昵称存储型XSS ---------- */
    const emX = 'xss' + Date.now() + '@test.com';
    const c1 = await cap();
    const send1 = await req('POST', '/api/auth/send-email-code', { email: emX, scene: 'register', captchaToken: c1.token, captchaCode: c1.devCode });
    const emailCode = send1.json.data && send1.json.data.devCode;
    const rg = await req('POST', '/api/auth/register-email', { email: emX, code: emailCode, password: 'test123', nickname: '<script>alert(1)</script>小明<b>粗' });
    const regNick = rg.json.data && rg.json.data.user && rg.json.data.user.nickname;
    check('BUG-005 注册昵称剥离脚本标签', rg.json.code === 0 && regNick && regNick.indexOf('<') === -1 && regNick.indexOf('小明') >= 0, 'nickname=' + regNick);

    /* ---------- BUG-006 修改资料昵称 XSS ---------- */
    const pf = await req('PUT', '/api/auth/profile', { nickname: '<img src=x onerror=alert(1)>测试昵称' }, demoToken);
    const newNick = pf.json.data && pf.json.data.user && pf.json.data.user.nickname;
    check('BUG-006 改资料昵称净化', pf.json.code === 0 && newNick && newNick.indexOf('<') === -1 && newNick.indexOf('测试昵称') >= 0, 'nickname=' + newNick);
    await req('PUT', '/api/auth/profile', { nickname: '演示用户' }, demoToken); // 还原

    /* ---------- BUG-007 logout 后 Token 立即失效 ---------- */
    const cL = await cap();
    const lg2 = await req('POST', '/api/auth/login', { account: 'demo@example.com', password: '123456', captchaToken: cL.token, captchaCode: cL.devCode });
    const tmpToken = lg2.json.data && lg2.json.data.token;
    const before = await req('GET', '/api/user/profile', undefined, tmpToken);
    const lo = await req('POST', '/api/auth/logout', {}, tmpToken);
    const after = await req('GET', '/api/user/profile', undefined, tmpToken);
    check('BUG-007 登出前Token有效', before.json.code === 0, 'code=' + before.json.code);
    check('BUG-007 登出接口成功', lo.json.code === 0, lo.json.msg || '');
    check('BUG-007 登出后旧Token失效(401)', after.status === 401, 'status=' + after.status);

    /* ---------- 额外资金漏洞：订单退款后售后不得重复退款（积分不重复扣） ---------- */
    // 取一个 auto 商品
    const pl = (await req('GET', '/api/shop/products?page=1&size=50')).json.data.list || [];
    const autoP = pl.find((p) => p.type === 'auto' && p.stock > 2) || pl.find((p) => p.type === 'auto');
    check('重复退款-准备auto商品', !!autoP, autoP ? autoP.id + '/stock=' + autoP.stock : '无');
    const order = await req('POST', '/api/user/orders', { from: 'buynow', productId: autoP.id, quantity: 1, addressId }, demoToken);
    const orderId = order.json.data && order.json.data.orderId;
    check('重复退款-下单成功', order.json.code === 0 && orderId, order.json.msg || 'oid=' + orderId);
    const pay = await req('POST', '/api/user/orders/' + orderId + '/pay', { method: 'wechat' }, demoToken);
    check('重复退款-模拟支付自动发货', pay.json.code === 0 && pay.json.data && (pay.json.data.status === 'shipped'), JSON.stringify(pay.json).slice(0, 120));
    const af = await req('POST', '/api/user/orders/' + orderId + '/aftersale', { type: 'refund', reason: '重复退款防护验证' }, demoToken);
    check('重复退款-支付后提交售后成功', af.json.code === 0, af.json.msg || '');
    // 管理员先在订单管理退款
    const rf1 = await req('POST', '/api/admin/orders/' + orderId + '/refund', { reason: '订单退款' }, adminToken);
    check('重复退款-首次订单退款成功', rf1.json.code === 0, rf1.json.msg || '');
    // 记录退款扣回积分日志条数
    const logsBefore = ((await req('GET', '/api/user/points-logs?page=1&size=200', undefined, demoToken)).json.data.list || [])
      .filter((l) => (l.desc || '').indexOf('退款扣回') >= 0 && (l.desc || '').indexOf(order.json.data.orderNo) >= 0).length;
    // 找到该订单的售后单
    const afList = ((await req('GET', '/api/admin/aftersales?status=pending&page=1&size=100', undefined, adminToken)).json.data.list || []);
    const afRow = afList.find((a) => a.orderId === orderId);
    check('重复退款-找到待处理售后单', !!afRow, 'afid=' + (afRow && afRow.id));
    // 再次通过售后同意退款 —— 应被拒绝
    const rf2 = await req('POST', '/api/admin/aftersales/' + (afRow && afRow.id) + '/handle', { action: 'approve', reply: '' }, adminToken);
    check('重复退款-售后二次同意被拦截', rf2.json.code === 1 && /不可退款|已退款|重复/.test(rf2.json.msg || ''), rf2.json.msg || '');
    const logsAfter = ((await req('GET', '/api/user/points-logs?page=1&size=200', undefined, demoToken)).json.data.list || [])
      .filter((l) => (l.desc || '').indexOf('退款扣回') >= 0 && (l.desc || '').indexOf(order.json.data.orderNo) >= 0).length;
    check('重复退款-积分仅扣回一次', logsBefore === 1 && logsAfter === 1, 'before=' + logsBefore + ' after=' + logsAfter);

  } catch (e) {
    fail++; results.push({ name: '脚本异常', status: 'FAIL', detail: e.message + '\n' + (e.stack || '').slice(0, 300) });
  }
  console.log(JSON.stringify({ summary: { total: pass + fail, pass, fail, rate: (100 * pass / Math.max(1, pass + fail)).toFixed(1) + '%' }, results }, null, 2));
  process.exit(fail ? 1 : 0);
})();
