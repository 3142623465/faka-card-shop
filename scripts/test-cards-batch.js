/* test-cards-batch.js - 卡密批量删除回归：勾选批量删除 / 清空未使用 / 已售出跳过 */
const BASE = 'http://localhost:3000/api';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { passed++; console.log('PASS ' + name + (extra ? ' ' + extra : '')); } else { failed++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } };

async function j(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}

(async () => {
  const cap = await j('/auth/captcha');
  const login = await j('/auth/login', { method: 'POST', body: { email: 'admin', password: 'admin123', captchaToken: cap.data.token, captchaCode: cap.data.devCode } });
  const tk = login.data && login.data.token;
  ok('admin 登录', !!tk);

  // 建测试商品
  const cp = await j('/admin/products', { method: 'POST', token: tk, body: { categoryId: 1, name: '__test-batch__', price: 1, type: 'auto', status: 1 } });
  const pid = cp.data.id;
  ok('创建测试商品 id=' + pid, !!pid);
  await j('/admin/products/' + pid + '/cards', { method: 'POST', token: tk, body: { autoGenerate: true, count: 10, prefix: 'BATCH', startNo: 1 } });
  ok('生成 10 条', true);

  const all = await j('/admin/products/' + pid + '/cards?status=unused&page=1&size=50', { token: tk });
  const ids = all.data.list.map((c) => c.id);
  ok('拉取 10 条', ids.length === 10, 'n=' + ids.length);

  // 1) 批量删除 3 条
  const bd = await j('/admin/cards/batch-delete', { method: 'POST', token: tk, body: { ids: ids.slice(0, 3) } });
  ok('批量删除 3 条', bd.data && bd.data.deleted === 3, JSON.stringify(bd.data));
  const after1 = await j('/admin/products/' + pid + '/cards?status=all&page=1&size=50', { token: tk });
  ok('剩 7 条', after1.data.total === 7, 'total=' + after1.data.total);
  ok('库存同步 7', after1.data.unused === 7);

  // 2) 空 ids 拒绝
  const empty = await j('/admin/cards/batch-delete', { method: 'POST', token: tk, body: { ids: [] } });
  ok('空 ids 被拒', empty.code === 1, empty.msg);

  // 3) 模拟售出一条：直接把一条卡置为 used（模拟订单发货），再批量删应跳过
  // 3) 真实下单购买 1 件（自动发卡 → 1 条卡变已使用），再批量删除应跳过已售出
  const ucap = await j('/auth/captcha');
  const mail = 'batcht' + Date.now() + '@t.com';
  const sec = await j('/auth/send-email-code', { method: 'POST', body: { email: mail, scene: 'register', captchaToken: ucap.data.token, captchaCode: ucap.data.devCode } });
  ok('发送邮箱验证码', sec.code === 0, sec.msg);
  const reg = await j('/auth/register-email', { method: 'POST', body: { email: mail, code: sec.data.devCode, password: '12345678' } });
  ok('注册测试用户', reg.code === 0, reg.msg);
  const utk = reg.data.token;
  const addr = await j('/user/addresses', { method: 'POST', token: utk, body: { name: 'T', phone: '13800000000', region: '1', detail: '1' } });
  const order = await j('/user/orders', { method: 'POST', token: utk, body: { from: 'buynow', productId: pid, quantity: 1, addressId: addr.data.id } });
  ok('下单成功', order.code === 0);
  const pay = await j('/user/orders/' + order.data.orderId + '/pay', { method: 'POST', token: utk, body: { method: 'wechat' } });
  ok('支付并自动发卡', pay.code === 0, pay.msg);
  await new Promise((r) => setTimeout(r, 600));
  const before = await j('/admin/products/' + pid + '/cards?status=all&page=1&size=50', { token: tk });
  const usedCard = before.data.list.find((c) => c.status === 'used');
  const unusedCard = before.data.list.find((c) => c.status === 'unused');
  ok('存在 1 条已使用', !!usedCard, 'used=' + before.data.list.filter((c) => c.status === 'used').length + ' unused=' + before.data.list.filter((c) => c.status === 'unused').length);
  const bd2 = await j('/admin/cards/batch-delete', { method: 'POST', token: tk, body: { ids: [usedCard.id, unusedCard.id] } });
  ok('已售出跳过/未使用删除', bd2.data && bd2.data.deleted === 1 && bd2.data.skipped === 1, JSON.stringify(bd2.data));
  const after2 = await j('/admin/products/' + pid + '/cards?status=all&page=1&size=50', { token: tk });
  ok('剩 6 条（1 used + 5 unused）', after2.data.total === 6 && after2.data.unused === 5, 'total=' + after2.data.total + ' unused=' + after2.data.unused);

  // 4) 清空未使用
  const cl = await j('/admin/products/' + pid + '/cards/clear', { method: 'POST', token: tk, body: { status: 'all' } });
  ok('清空未使用 5 条', cl.data && cl.data.deleted === 5, JSON.stringify(cl.data));
  const after3 = await j('/admin/products/' + pid + '/cards?status=all&page=1&size=50', { token: tk });
  ok('只剩 1 条已使用', after3.data.total === 1 && after3.data.unused === 0, 'total=' + after3.data.total);
  ok('商品库存归零', (await j('/admin/products', { token: tk })).data.list.find((x) => x.id === pid).stock === 0);

  // 清理测试商品
  await j('/admin/products/' + pid, { method: 'DELETE', token: tk });
  ok('清理测试商品', true);

  console.log('\n===== RESULT: ' + passed + ' passed / ' + failed + ' failed =====');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
