/**
 * test-branch-full.js - 分站模块全量测试（覆盖分站审查报告 17 项问题核心验收）
 * 运行前提：服务已启动（localhost:3000）、当前 db 为交付态或空态（测试自建数据，末尾清理）
 * 运行：node scripts/test-branch-full.js
 */
const B = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra || ''); } };

async function api(method, url, body, token) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}

async function getCap() {
  const r = await api('GET', '/api/auth/captcha', null);
  return { t: r.j.data.token, c: r.j.data.devCode };
}

async function regUser(email, password) {
  const cap = await getCap();
  let r = await api('POST', '/api/auth/send-email-code', { email, scene: 'register', captchaToken: cap.t, captchaCode: cap.c });
  const code = r.j.data ? r.j.data.devCode : null;
  r = await api('POST', '/api/auth/register-email', { email, code, password });
  const token = r.j.data && (r.j.data.token || (r.j.data.user && r.j.data.user.token));
  return { token, code, r };
}

async function login(account, password) {
  const cap = await getCap();
  const r = await api('POST', '/api/auth/login', { account, password, captchaToken: cap.t, captchaCode: cap.c });
  return r.j.data ? r.j.data.token : null;
}

async function userBalance(token) {
  const r = await api('GET', '/api/user/branch-config', null, token);
  return r.j.data ? r.j.data.balance : -1;
}

async function branchMe(token) {
  const r = await api('GET', '/api/branch/me', null, token);
  return r.j.data;
}

(async () => {
  const ts = Date.now();
  const e1 = 't1' + ts + '@t.com', e2 = 't2' + ts + '@t.com', e3 = 't3' + ts + '@t.com', e4 = 't4' + ts + '@t.com', e5 = 't5' + ts + '@t.com';
  const pw = 'pass1234';

  // 0. 超管登录
  const cap0 = await getCap();
  let r = await api('POST', '/api/auth/login', { account: 'admin', password: 'admin123', captchaToken: cap0.t, captchaCode: cap0.c });
  const at = r.j.data && r.j.data.token;
  ok('超管登录', !!at);

  // 1. 注册用户并充值
  const u1 = await regUser(e1, pw); ok('注册U1', !!u1.token, JSON.stringify(u1.r.j));
  const u2 = await regUser(e2, pw); ok('注册U2', !!u2.token, JSON.stringify(u2.r.j));
  const u3 = await regUser(e3, pw); ok('注册U3', !!u3.token, JSON.stringify(u3.r.j));
  const u4 = await regUser(e4, pw); ok('注册U4', !!u4.token, JSON.stringify(u4.r.j));
  const u5 = await regUser(e5, pw); ok('注册U5(绑定测试)', !!u5.token, JSON.stringify(u5.r.j));
  const ut1 = u1.token, ut2 = u2.token, ut3 = u3.token, ut4 = u4.token, ut5 = u5.token;
  // 充值余额（通过 admin 用户余额接口，取用户 id）
  const me1 = await api('GET', '/api/auth/me', null, ut1);
  const uid1 = me1.j.data.user.id;
  const me2 = await api('GET', '/api/auth/me', null, ut2);
  const uid2 = me2.j.data.user.id;
  const me3 = await api('GET', '/api/auth/me', null, ut3);
  const uid3 = me3.j.data.user.id;
  const me4 = await api('GET', '/api/auth/me', null, ut4);
  const uid4 = me4.j.data.user.id;
  const me5 = await api('GET', '/api/auth/me', null, ut5);
  const uid5 = me5.j.data.user.id;
  for (const uid of [uid1, uid2, uid3, uid4, uid5]) {
    await api('PUT', '/api/admin/users/' + uid + '/balance', { delta: 1000 }, at);
  }
  ok('用户充值1000', (await userBalance(ut1)) === 1000);

  // ============ P0-3/P1-7/P2-13: 一级开通 ============
  r = await api('POST', '/api/user/open-branch', { name: '总代理A', type: 'pro' }, ut1);
  ok('U1开通一级专业分站', r.j && r.j.code === 0 && r.j.data.paid === 10, JSON.stringify(r.j));
  ok('U1扣款后余额990', (await userBalance(ut1)) === 990);
  const me1b = await api('GET', '/api/branch/me', null, ut1); // user token 访问 branch/me
  ok('user token 可访问 branch/me', !!me1b.j.data && me1b.j.data.type === 'pro', JSON.stringify(me1b.j));
  const bA = me1b.j.data;

  // 平台收入（admin stats）
  r = await api('GET', '/api/admin/stats', null, at);
  ok('平台收入含开通费10', r.j.data.platformIncome === 10, 'income=' + r.j.data.platformIncome);

  // 分站登录用邮箱账号
  const cap1 = await getCap();
  r = await api('POST', '/api/branch/login', { username: e1, password: pw, captchaToken: cap1.t, captchaCode: cap1.c });
  const bt1 = r.j.data && r.j.data.token;
  ok('分站用邮箱账号登录', !!bt1, JSON.stringify(r.j));

  // 设置下级价格
  r = await api('PUT', '/api/branch/price', { pricePro: 10, priceNormal: 5 }, bt1);
  ok('A设置下级价格 pro10/normal5', r.j && r.j.code === 0 && r.j.data.pricePro === 10, JSON.stringify(r.j));

  // 邀请链接带签名
  r = await api('GET', '/api/branch/invite-link', null, bt1);
  ok('邀请链接带签名', r.j && r.j.code === 0 && r.j.data.url.indexOf('s=') >= 0 && r.j.data.pricePro === 10, JSON.stringify(r.j && r.j.data));
  const inviteUrl = r.j.data.url;
  const sign = r.j.data.sign;

  // ============ P1-8/P2-14/P2-15: 加入分站（签名、层级、价格继承） ============
  // U2 用签名链接加入 normal
  r = await api('POST', '/api/user/join-branch', { parent: e1, type: 'normal', name: '省代理B', sign }, ut2);
  ok('U2签名加入普通分站(付5)', r.j && r.j.code === 0 && r.j.data.paid === 5, JSON.stringify(r.j));
  ok('U2扣款后余额995', (await userBalance(ut2)) === 995);
  const meB = await api('GET', '/api/branch/me', null, ut2);
  const bB = meB.j.data;
  ok('B为normal且继承上级价格', bB.type === 'normal' && bB.pricePro === 10 && bB.priceNormal === 5, JSON.stringify(bB));
  // 上级A入账+流水
  r = await api('GET', '/api/branch/balance-logs', null, bt1);
  ok('A分站入账流水+5', r.j && r.j.code === 0 && r.j.data.list.length >= 1 && r.j.data.list[0].change === 5, JSON.stringify(r.j && r.j.data.list && r.j.data.list[0]));
  const meA2 = await branchMe(bt1);
  ok('A分站余额5', meA2.balance === 5, 'bal=' + meA2.balance);

  // 伪造签名加入被拒
  r = await api('POST', '/api/user/join-branch', { parent: e1, type: 'normal', name: '伪造站', sign: 'fake.sign' }, ut3);
  ok('伪造签名被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  // 无签名手动加入（合法降级路径）
  r = await api('POST', '/api/user/join-branch', { parent: e1, type: 'pro', name: '省代理C' }, ut3);
  ok('无签名手动加入专业(付10)', r.j && r.j.code === 0 && r.j.data.paid === 10, JSON.stringify(r.j));
  const meC = await api('GET', '/api/branch/me', null, ut3);
  const bC = meC.j.data;
  ok('C为pro', bC.type === 'pro');

  // 层级上限：把全局层级设为 2，A(1) → B(2) → D(3) 拒绝
  r = await api('PUT', '/api/admin/settings', { branchMaxDepth: 2 }, at);
  ok('设置层级上限2', r.j && r.j.code === 0, JSON.stringify(r.j));
  // B 是 normal 不能开下级；用 A 开 pro 子站 C' 到第 2 层，再让 C' 开下级被拒
  // 直接：U4 加入 A（深度2）成功，再 U4（A 的 pro 子站）开下级 → 应拒绝
  r = await api('POST', '/api/user/join-branch', { parent: e1, type: 'pro', name: '二级专业D', sign }, ut4);
  ok('U4加入A为pro(深度2)', r.j && r.j.code === 0, JSON.stringify(r.j));
  const bt4 = await login(e4, pw);
  // U4 已开通 pro（深度2），再开下级 → 层级 3 > 2 拒绝（用 admin 开？不行；U4 是 pro 可以开下级）
  // U4 作为 pro 直接开普通下级（branch API POST /branches）
  r = await api('POST', '/api/branch/branches', { name: '三层站E', username: 'three' + ts, password: '1234' }, bt4);
  ok('深度3开通下级被拒', r.j && r.j.code === 1 && r.j.msg.indexOf('层级') >= 0, JSON.stringify(r.j));
  // 恢复层级上限
  r = await api('PUT', '/api/admin/settings', { branchMaxDepth: 5 }, at);

  // ============ P1-6: 下级价格不得低于上级 / 一级分站不得低于平台开通价 ============
  r = await api('PUT', '/api/branch/price', { pricePro: 12, priceNormal: 5 }, bt1);
  ok('A设 pro12/normal5 合法(顶层)', r.j && r.j.code === 0, JSON.stringify(r.j));
  r = await api('PUT', '/api/branch/price', { pricePro: 8, priceNormal: 5 }, bt1);
  ok('A设 pro8 低于平台开通价10 被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  r = await api('PUT', '/api/branch/price', { pricePro: 5, priceNormal: 8 }, bt1);
  ok('A设 pro5<normal8 被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  r = await api('PUT', '/api/branch/price', { pricePro: 10, priceNormal: 5 }, bt1); // 恢复
  // C（A 的下级 pro）设置价格低于上级 → 拒
  const bt3 = await login(e3, pw);
  r = await api('PUT', '/api/branch/price', { pricePro: 9, priceNormal: 5 }, bt3);
  ok('C设置 pro9 < 上级10 被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  r = await api('PUT', '/api/branch/price', { pricePro: 12, priceNormal: 6 }, bt3);
  ok('C设置 pro12/normal6 成功', r.j && r.j.code === 0, JSON.stringify(r.j));

  // ============ P0-1/P2-11/P2-12: 商品上架/价格下限/同步 ============
  r = await api('GET', '/api/branch/catalog', null, bt1);
  const catalog = r.j.data || [];
  ok('A取总站商品目录', catalog.length >= 1);
  const src = catalog.find((p) => p.stock > 0) || catalog[0];
  ok('目录含库存>0商品(可上架)', !!src && src.stock > 0, 'catalog[0]=' + JSON.stringify(catalog[0]));
  // A 上架（默认总站价）
  r = await api('POST', '/api/branch/products', { sourceId: src.id }, bt1);
  ok('A上架总站商品', r.j && r.j.code === 0, JSON.stringify(r.j));
  const pidA = r.j.data.id;
  // A 改价高于总站价（用于差价分成）
  const higherA = Math.round((src.price + 8) * 100) / 100;
  r = await api('PUT', '/api/branch/products/' + pidA, { price: higherA }, bt1);
  ok('A改价+8成功且返回floor', r.j && r.j.code === 0 && r.j.data.floor === src.price, JSON.stringify(r.j));
  // B（A 的下级）上架同款：下限 = A 的同款价（higherA）
  r = await api('GET', '/api/branch/products', null, bt1); // A 的列表（含 floor）
  // B 登录
  const bt2 = await login(e2, pw);
  r = await api('POST', '/api/branch/products', { sourceId: src.id, price: higherA - 1 }, bt2);
  ok('B上架低于A同款价被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  r = await api('POST', '/api/branch/products', { sourceId: src.id, price: higherA }, bt2);
  ok('B上架=A同款价成功', r.j && r.j.code === 0 && r.j.data.floor === higherA, JSON.stringify(r.j));
  const pidB = r.j.data.id;
  // B 改价高于下限 → 分成空间
  const higherB = Math.round((higherA + 5) * 100) / 100;
  r = await api('PUT', '/api/branch/products/' + pidB, { price: higherB }, bt2);
  ok('B改价+5成功 floor=higherA', r.j && r.j.code === 0 && r.j.data.floor === higherA, JSON.stringify(r.j));
  // 同步接口
  r = await api('POST', '/api/branch/sync-products', {}, bt2);
  ok('B同步商品信息', r.j && r.j.code === 0 && r.j.data.changed >= 1, JSON.stringify(r.j));

  // ============ P0-1/P0-2: 订单归属 + 分成 ============
  // 用户 U1（同时也是 A 分站主）用另一账号买 B 分站商品？—— U1 已开分站，仍可购物。用 U4 购买 B 的商品。
  const ut4b = await login(e4, pw);
  r = await api('POST', '/api/user/orders', { from: 'buynow', productId: pidB, quantity: 1, addressId: 0, remark: '' }, ut4b);
  ok('无地址下单被拒(先建地址)', r.j && r.j.code === 1, JSON.stringify(r.j));
  r = await api('POST', '/api/user/addresses', { name: '测试', phone: '13800000000', region: '江西省赣州市', detail: 'xx路1号', isDefault: true }, ut4b);
  const addressId = r.j.data.id;
  r = await api('POST', '/api/user/orders', { from: 'buynow', productId: pidB, quantity: 1, addressId, remark: '' }, ut4b);  ok('U4下单B分站商品', r.j && r.j.code === 0, JSON.stringify(r.j));
  const orderId = r.j.data.orderId;
  // 订单归属校验（admin 订单详情含 branchName）
  r = await api('GET', '/api/admin/orders/' + orderId, null, at);
  ok('订单归属B分站(branchId)', r.j.data.branchId === bB.id, 'branchId=' + r.j.data.branchId + ' goods=' + JSON.stringify(r.j.data.goods[0]));
  ok('订单商品快照含branchId/costPrice', r.j.data.goods[0].branchId === bB.id && r.j.data.goods[0].costPrice === higherA, JSON.stringify(r.j.data.goods[0]));

  // 支付 → 分成入 B 分站余额（差价 = higherB - higherA = 5）
  r = await api('POST', '/api/user/orders/' + orderId + '/pay', { method: 'wechat' }, ut4b);
  ok('U4模拟支付成功', r.j && r.j.code === 0, JSON.stringify(r.j));
  const meB2 = await branchMe(bt2);
  ok('B分站余额 +=5(差价分成)', meB2.balance === 5, 'bal=' + meB2.balance);
  r = await api('GET', '/api/branch/balance-logs', null, bt2);
  ok('B分站分成流水存在', r.j && r.j.code === 0 && r.j.data.list.some((l) => l.type === 'income' && l.change === 5), JSON.stringify(r.j.data.list && r.j.data.list[0]));

  // ============ P0-2/P2-16: 分站订单列表 + 发货 ============
  r = await api('GET', '/api/branch/orders', null, bt2);
  ok('B分站订单列表含该订单', r.j && r.j.code === 0 && r.j.data.total === 1 && r.j.data.list[0].id === orderId, JSON.stringify(r.j && r.j.data));
  // 发货（卡密）
  r = await api('POST', '/api/branch/orders/' + orderId + '/ship', { cards: 'CARD-001\nSEC-1\nCARD-002' }, bt2);
  ok('B发货(卡密)成功', r.j && r.j.code === 0 && r.j.data.cardsDelivered === 3, JSON.stringify(r.j));
  r = await api('GET', '/api/branch/orders/' + orderId, null, bt2);
  ok('订单已发货且含卡密', r.j.data.status === 'shipped' && r.j.data.cards.length === 3, JSON.stringify(r.j.data.status + ' cards=' + (r.j.data.cards || []).length));
  // 买家侧订单卡密可见
  r = await api('GET', '/api/user/orders/' + orderId, null, ut4b);
  ok('买家可见卡密', r.j.data.cards && r.j.data.cards.length === 3 && r.j.data.cards[0].code === 'CARD-001', JSON.stringify(r.j.data.cards));

  // ============ P0-2: 提现流程 ============
  // B 申请提现 3 元
  r = await api('POST', '/api/branch/withdrawals', { amount: 3, account: '支付宝 13800000000' }, bt2);
  ok('B申请提现3元', r.j && r.j.code === 0, JSON.stringify(r.j));
  const wdId = r.j.data.id;
  // 冻结后可用余额 = 5-3 = 2；申请 4 元应被拒
  r = await api('POST', '/api/branch/withdrawals', { amount: 4, account: '支付宝 13800000000' }, bt2);
  ok('超可提现余额被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  // admin 提现列表
  r = await api('GET', '/api/admin/withdrawals', null, at);
  ok('admin提现列表含申请', r.j && r.j.code === 0 && r.j.data.list.some((w) => w.id === wdId), JSON.stringify(r.j.data.list && r.j.data.list[0]));
  // admin 通过 → 扣余额
  r = await api('PUT', '/api/admin/withdrawals/' + wdId, { action: 'approve', reply: 'ok' }, at);
  ok('admin通过提现', r.j && r.j.code === 0 && r.j.data.status === 'approved', JSON.stringify(r.j));
  const meB3 = await branchMe(bt2);
  ok('B余额扣3后为2', meB3.balance === 2, 'bal=' + meB3.balance);
  // admin 标记打款
  r = await api('PUT', '/api/admin/withdrawals/' + wdId, { action: 'pay' }, at);
  ok('admin标记打款', r.j && r.j.code === 0 && r.j.data.status === 'paid', JSON.stringify(r.j));
  // 再申请提现 2 元然后取消
  r = await api('POST', '/api/branch/withdrawals', { amount: 2, account: '银行卡 6222' }, bt2);
  const wd2 = r.j.data.id;
  r = await api('POST', '/api/branch/withdrawals/' + wd2 + '/cancel', {}, bt2);
  ok('取消提现申请', r.j && r.j.code === 0, JSON.stringify(r.j));
  r = await api('GET', '/api/branch/withdrawals', null, bt2);
  ok('提现记录含cancelled', r.j.data.some((w) => w.id === wd2 && w.status === 'cancelled'));

  // ============ P0-2/P2-16: 管理端余额调整 ============
  r = await api('PUT', '/api/admin/branches/' + bB.id + '/balance', { amount: 50, desc: '测试充值' }, at);
  ok('admin调整分站余额+50', r.j && r.j.code === 0 && r.j.data.balance === 52, JSON.stringify(r.j));
  r = await api('GET', '/api/branch/balance-logs', null, bt2);
  ok('调整流水存在(adjust_in)', r.j.data.list.some((l) => l.type === 'adjust_in' && l.change === 50), JSON.stringify(r.j.data.list[0]));

  // ============ P1-9: 分站密码双向同步（同一账号同一密码） ============
  r = await api('PUT', '/api/branch/password', { oldPassword: pw, newPassword: 'branch88' }, bt2);
  ok('B分站改密码', r.j && r.j.code === 0, JSON.stringify(r.j));
  // 用户账号密码同步更新：旧密码失效，新密码可登录
  const cap2 = await getCap();
  r = await api('POST', '/api/auth/login', { account: e2, password: pw, captchaToken: cap2.t, captchaCode: cap2.c });
  ok('分站改密后用户旧密码失效(已同步)', !(r.j && r.j.data && r.j.data.token), JSON.stringify(r.j));
  const cap2b = await getCap();
  r = await api('POST', '/api/auth/login', { account: e2, password: 'branch88', captchaToken: cap2b.t, captchaCode: cap2b.c });
  ok('用户用分站新密码可登录(双向同步)', !!(r.j.data && r.j.data.token), JSON.stringify(r.j));
  // 分站新密码登录
  const cap3 = await getCap();
  r = await api('POST', '/api/branch/login', { username: e2, password: 'branch88', captchaToken: cap3.t, captchaCode: cap3.c });
  ok('分站新密码可登录', !!(r.j.data && r.j.data.token), JSON.stringify(r.j));

  // ============ P0-3/P2-16: 管理员建站绑定用户 + 重置密码 ============
  r = await api('POST', '/api/admin/branches', { name: '绑站F', username: 'bind' + ts, password: 'bind1234', type: 'pro', ownerEmail: e5 }, at);
  ok('admin建站绑定用户U5', r.j && r.j.code === 0 && r.j.data.ownerId === uid5, JSON.stringify(r.j));
  const bFid = r.j.data.id;
  // 绑定后该用户可用自己账号登录分站后台（密码为建站密码 bind1234）
  const cap4 = await getCap();
  r = await api('POST', '/api/branch/login', { username: e5, password: 'bind1234', captchaToken: cap4.t, captchaCode: cap4.c });
  ok('绑定用户可用分站密码登录', !!(r.j.data && r.j.data.token), JSON.stringify(r.j));
  // 重置密码
  r = await api('PUT', '/api/admin/branches/' + bFid + '/password', { password: 'newpass99' }, at);
  ok('admin重置分站密码', r.j && r.j.code === 0, JSON.stringify(r.j));
  const cap5 = await getCap();
  r = await api('POST', '/api/branch/login', { username: e5, password: 'newpass99', captchaToken: cap5.t, captchaCode: cap5.c });
  ok('重置后新密码可登录', !!(r.j.data && r.j.data.token), JSON.stringify(r.j));
  // 绑定用户重复建站拦截
  r = await api('POST', '/api/admin/branches', { name: '重复绑F', username: 'bind2' + ts, password: 'bind1234', type: 'pro', ownerEmail: e5 }, at);
  ok('同用户重复建站被拒', r.j && r.j.code === 1, JSON.stringify(r.j));
  // 绑定不存在用户
  r = await api('POST', '/api/admin/branches', { name: '无主G', username: 'bind3' + ts, password: 'bind1234', type: 'pro', ownerEmail: 'nobody' + ts + '@x.com' }, at);
  ok('绑定不存在用户被拒', r.j && r.j.code === 1, JSON.stringify(r.j));

  // ============ P1-4/P1-5: 停用级联 + 会话失效 ============
  // 停用 A（专业，含下级 B/C/D 与绑定站 F 无关）→ B/C/D 全部停用；B 的分站 token 失效
  r = await api('PUT', '/api/admin/branches/' + bA.id, { status: 0 }, at);
  ok('admin停用A', r.j && r.j.code === 0 && r.j.data.status === 0, JSON.stringify(r.j));
  r = await api('GET', '/api/admin/branches', null, at);
  const all = r.j.data;
  const bBrow = all.find((x) => x.id === bB.id);
  const bCrow = all.find((x) => x.id === bC.id);
  ok('停用级联B/C', bBrow.status === 0 && bCrow.status === 0, JSON.stringify({ bB: bBrow.status, bC: bCrow.status }));
  r = await api('GET', '/api/branch/orders', null, bt2);
  ok('停用后分站token失效401', r.status === 401 || (r.j && r.j.code === 401), 'status=' + r.status + ' ' + JSON.stringify(r.j));
  // 恢复启用 A（仅自身）
  r = await api('PUT', '/api/admin/branches/' + bA.id, { status: 1 }, at);
  ok('admin启用A', r.j && r.j.code === 0 && r.j.data.status === 1, JSON.stringify(r.j));
  r = await api('GET', '/api/admin/branches', null, at);
  const all2 = r.j.data;
  ok('启用不自动级联(B仍停用)', all2.find((x) => x.id === bB.id).status === 0);
  // B 重新启用（专业分站 A 可管理下级：A 是上级，用 bt1？—— bt1 也失效了。重新登录 A）
  const cap6 = await getCap();
  r = await api('POST', '/api/branch/login', { username: e1, password: pw, captchaToken: cap6.t, captchaCode: cap6.c });
  const bt1b = r.j.data && r.j.data.token;
  ok('A重新登录', !!bt1b);
  r = await api('PUT', '/api/branch/branches/' + bB.id, { status: 1 }, bt1b);
  ok('A启用B', r.j && r.j.code === 0 && r.j.data.status === 1, JSON.stringify(r.j));
  const bt2b = await login(e2, 'branch88'); // 分站改密后用户密码已同步为 branch88
  r = await api('GET', '/api/branch/me', null, bt2b);
  ok('B重新可访问', r.j && r.j.code === 0, JSON.stringify(r.j));

  // ============ P2-16: 删除校验 ============
  // C 有进行中订单吗？无。删 C（admin）应成功；但先测"有订单分站禁删"：F 无订单可删，B 有订单不能删
  r = await api('DELETE', '/api/admin/branches/' + bB.id, null, at);
  ok('有订单分站禁删', r.j && r.j.code === 1 && r.j.msg.indexOf('订单') >= 0, JSON.stringify(r.j));
  // 删 F（无订单，但 F 下无子树）
  r = await api('DELETE', '/api/admin/branches/' + bFid, null, at);
  ok('无订单分站可删', r.j && r.j.code === 0, JSON.stringify(r.j));
  r = await api('GET', '/api/admin/branches', null, at);
  ok('F已删除', !r.j.data.some((x) => x.id === bFid));

  // ============ P1-7: 一级普通分站升级专业 → 差价入平台 ============
  // 用 U4 已开 pro 无普通。建一个一级普通：admin 建站（普通）绑定 U4？U4 已有 pro 不能绑。用 U1 再开？U1 已有。直接 admin 建普通站绑定 U2？U2 已有 B（normal）。用新用户 U4 已 pro...
  // 简化：admin 直接建站 type=normal 不绑用户 → 该分站升级用分站余额支付
  r = await api('POST', '/api/admin/branches', { name: '普通站H', username: 'norm' + ts, password: 'norm1234', type: 'normal' }, at);
  const bHid = r.j.data.id;
  // 给 H 充值（余额支付升级）
  r = await api('PUT', '/api/admin/branches/' + bHid + '/balance', { amount: 100, desc: '充值' }, at);
  const cap7 = await getCap();
  r = await api('POST', '/api/branch/login', { username: 'norm' + ts, password: 'norm1234', captchaToken: cap7.t, captchaCode: cap7.c });
  const btH = r.j.data && r.j.data.token;
  // 升级（一级差价 = pro10 - normal0 = 10，从分站余额扣，入平台）
  r = await api('PUT', '/api/branch/upgrade', {}, btH);
  ok('普通站升级专业(分站余额付10)', r.j && r.j.code === 0 && r.j.data.paid === 10, JSON.stringify(r.j));
  const meH = await branchMe(btH);
  ok('H余额90且为pro', meH.balance === 90 && meH.type === 'pro', JSON.stringify(meH));
  r = await api('GET', '/api/admin/stats', null, at);
  ok('平台收入累计20(10+10)', r.j.data.platformIncome === 20, 'income=' + r.j.data.platformIncome);

  // ============ 清理：删除测试数据（admin 用户删除 + 分站删除） ============
  // 先删有订单的 B → 拒绝；先把订单完结（退款）→ 再删
  r = await api('POST', '/api/admin/orders/' + orderId + '/refund', { reason: '测试清理' }, at);
  ok('退款订单(清理)', r.j && r.j.code === 0, JSON.stringify(r.j));
  const meB4 = await branchMe(bt2b);
  ok('退款冲正B分成(bal回47)', meB4.balance === 47, 'bal=' + meB4.balance);
  r = await api('GET', '/api/branch/balance-logs', null, bt2b);
  ok('退款冲正流水(expense)', r.j.data.list.some((l) => l.type === 'expense' && l.desc.indexOf('退款冲正') >= 0), JSON.stringify(r.j.data.list[0]));
  // 删除 B、C、D、H、A（A 停用过的）
  for (const id of [bB.id, bC.id, bHid]) {
    await api('DELETE', '/api/admin/branches/' + id, null, at);
  }
  r = await api('GET', '/api/admin/branches', null, at);
  // 删除 A（其下级 B/C/D 已被删？D 还在）—— 先删 D（U4 的分站，无订单）
  const bDrow = r.j.data.find((x) => x.username === e4);
  if (bDrow) await api('DELETE', '/api/admin/branches/' + bDrow.id, null, at);
  r = await api('DELETE', '/api/admin/branches/' + bA.id, null, at);
  ok('清理A成功', r.j && r.j.code === 0, JSON.stringify(r.j));
  // 删除用户
  for (const uid of [uid1, uid2, uid3, uid4, uid5]) {
    await api('DELETE', '/api/admin/users/' + uid, null, at);
  }
  r = await api('GET', '/api/admin/branches', null, at);
  ok('分站已全部清理', r.j.data.length === 0, 'branches=' + r.j.data.length);

  console.log('\n结果:', pass, '通过 /', fail, '失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('脚本错误', e); process.exit(1); });
