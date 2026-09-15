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

async function smsCode(phone) {
  const cap = await getCap();
  const r = await api('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken: cap.t, captchaCode: cap.c });
  return r.j.data ? r.j.data.devCode : null;
}

(async () => {
  // 0. 超管登录
  let cap = await getCap();
  let r = await api('POST', '/api/auth/login', { account: 'admin', password: 'admin123', captchaToken: cap.t, captchaCode: cap.c });
  const at = r.j.data && r.j.data.token;
  ok('超管登录', !!at);

  // 1. admin /branches 全量 + parentName/type
  r = await api('GET', '/api/admin/branches', null, at);
  const bs = (r.j && r.j.data) || [];
  ok('branches 全量含 parentName/type', bs.length >= 1 && bs.every((b) => 'parentName' in b && (b.type === 'pro' || b.type === 'normal')), JSON.stringify(bs.map((b) => b.username + ':' + b.type + ':' + b.parentName)));
  const hasNormal = bs.some((b) => b.type === 'normal');
  ok('普通分站不显示为专业', hasNormal, '');

  // 2. 注册新手机用户
  const phone = '139' + String(Date.now()).slice(-8);
  const code = await smsCode(phone);
  ok('发送短信码(devCode)', !!code, 'code=' + code);
  r = await api('POST', '/api/auth/register', { phone, code, password: 'test1234' });
  ok('注册测试用户', r.status === 200 && r.j.data && (r.j.data.token || r.j.data.user), JSON.stringify(r.j));
  const ut = r.j.data ? (r.j.data.token || null) : null;

  // 3. 同账号开通普通分站
  r = await api('POST', '/api/user/open-branch', { name: '回归测试分站', type: 'normal' }, ut);
  ok('同账号开通分站(无账号密码)', r.status === 200 && r.j.data && r.j.data.ok !== false, JSON.stringify(r.j));
  const branchId = r.j.data && r.j.data.branch && r.j.data.branch.id;

  // 4. 分站登录用注册账号
  cap = await getCap();
  r = await api('POST', '/api/branch/login', { username: phone, password: 'test1234', captchaToken: cap.t, captchaCode: cap.c });
  const bt = r.j.data && r.j.data.token;
  ok('分站用注册账号登录', !!bt, JSON.stringify(r.j));

  // 5. 重复开通拦截
  r = await api('POST', '/api/user/open-branch', { name: '再来一个', type: 'pro' }, ut);
  ok('重复开通拦截', r.status === 400 || (r.j && r.j.code === 1), JSON.stringify(r.j));

  // 6. 分站 catalog（总站商品）
  r = await api('GET', '/api/branch/catalog', null, bt);
  const catalog = (r.j && r.j.data) || [];
  ok('分站目录取总站商品', catalog.length >= 1, 'catalog=' + catalog.length);
  if (!catalog.length) { console.log('\n结果:', pass, '通过 /', fail, '失败'); process.exit(fail ? 1 : 0); }
  const src = catalog[0];

  // 7. 上架（默认价格=总站价）
  r = await api('POST', '/api/branch/products', { sourceId: src.id }, bt);
  ok('上架总站商品', r.status === 200 && r.j.data && r.j.data.ok !== false, JSON.stringify(r.j));
  const pid = r.j.data && r.j.data.id;

  // 8. 价格下限：改低于总站价拦截
  r = await api('PUT', '/api/branch/products/' + pid, { price: src.price - 1 }, bt);
  ok('低于总站价拦截', r.status === 400 || (r.j && r.j.code === 1), JSON.stringify(r.j));

  // 9. 改价=总站价成功
  r = await api('PUT', '/api/branch/products/' + pid, { price: src.price }, bt);
  ok('改价=总站价成功', r.status === 200 && r.j.data && r.j.data.ok !== false, JSON.stringify(r.j));

  // 10. 上下架
  r = await api('PUT', '/api/branch/products/' + pid, { status: 0 }, bt);
  ok('下架成功', r.status === 200, JSON.stringify(r.j));
  r = await api('PUT', '/api/branch/products/' + pid, { status: 1 }, bt);
  ok('上架成功', r.status === 200, JSON.stringify(r.j));

  // 11. 重复上架拦截
  r = await api('POST', '/api/branch/products', { sourceId: src.id }, bt);
  ok('重复上架拦截', r.status === 400 || (r.j && r.j.code === 1), JSON.stringify(r.j));

  // 12. shop 分站商品 + 分站店铺
  r = await api('GET', '/api/shop/products?branch=' + encodeURIComponent(phone), null);
  const sl = (r.j && r.j.data && r.j.data.list) || [];
  ok('shop 分站商品可见', sl.some((p) => p.id === pid), 'list=' + sl.length);
  r = await api('GET', '/api/shop/branch-shop?username=' + encodeURIComponent(phone), null);
  ok('分站店铺信息', r.status === 200 && r.j.data && r.j.data.name === '回归测试分站', JSON.stringify(r.j));

  // 13. 改密码同步分站
  r = await api('PUT', '/api/auth/password', { old: 'test1234', next: 'newpwd88' }, ut);
  ok('改用户密码', r.status === 200, JSON.stringify(r.j));
  cap = await getCap();
  r = await api('POST', '/api/branch/login', { username: phone, password: 'newpwd88', captchaToken: cap.t, captchaCode: cap.c });
  ok('分站密码已同步(新密码可登录)', !!(r.j.data && r.j.data.token), JSON.stringify(r.j));
  cap = await getCap();
  r = await api('POST', '/api/branch/login', { username: phone, password: 'test1234', captchaToken: cap.t, captchaCode: cap.c });
  ok('旧密码失效', !(r.j.data && r.j.data.token), JSON.stringify(r.j));

  // 14. 分站商品删除
  r = await api('DELETE', '/api/branch/products/' + pid, null, bt);
  ok('删除分站商品', r.status === 200, JSON.stringify(r.j));

  // 15. 订单发消息路由（不存在订单 → 404 而非 500）
  r = await api('POST', '/api/admin/orders/99999999/message', { content: 'test' }, at);
  ok('订单发消息(无订单报错)', r.j && r.j.code === 1, JSON.stringify(r.j));

  // 16. 验证码接口
  r = await api('GET', '/api/auth/captcha', null);
  ok('验证码接口', r.status === 200 && r.j.data && r.j.data.token);

  // 17. 分站店铺列表字段完整
  r = await api('GET', '/api/shop/products?branch=' + encodeURIComponent(phone) + '&size=10', null);
  ok('分站店铺列表接口', r.status === 200 && Array.isArray(r.j.data.list), '');

  // 清理：删除测试用户
  const me = await api('GET', '/api/auth/me', null, ut);
  const uid = me.j.data && me.j.data.user && me.j.data.user.id;
  if (uid) await api('DELETE', '/api/admin/users/' + uid, null, at).catch(() => {});
  console.log('\n结果:', pass, '通过 /', fail, '失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('脚本错误', e); process.exit(1); });
