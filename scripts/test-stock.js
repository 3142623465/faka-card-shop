/* 库存统一 / 多行卡密 / 虚拟商品免物流 回归测试 */
const BASE = 'http://localhost:3000/api';
async function j(path, { method = 'GET', token, body, params = {} } = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(BASE + path + (q ? '?' + q : ''), {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const jj = await r.json();
  return jj.data !== undefined ? jj.data : jj;
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const at = (await j('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123', code: '', captchaCode: 'bypass' } })).token || (await j('/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123', code: '', captchaCode: 'bypass' } })).token;
  ok('管理员登录', !!at);

  // 用户注册
  const email = 's' + Date.now() + '@qq.com';
  const cap = await j('/auth/captcha');
  const send = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'register', captchaToken: cap.token, captchaCode: cap.devCode } });
  ok('发送注册验证码', !!send.devCode, send);
  const reg = await j('/auth/register-email', { method: 'POST', body: { email, code: send.devCode, password: 'Test1234!' } });
  ok('注册用户', !!reg.token, reg);
  const token = reg.token;
  ok('用户登录', !!token);

  // 添加地址
  const addr = await j('/user/addresses', { method: 'POST', token, body: { name: '测试', phone: '13800138000', region: '江西省 赣州市 南康区', detail: '东山街道1号', isDefault: true } });
  ok('添加地址', !!addr.id, addr);
  const addrId = addr.id;

  // 分类
  const cats = await j('/admin/categories', { token: at });
  let catId = (cats.find((c) => !c.parentId) || {}).id;
  if (!catId) { const c = await j('/admin/categories', { method: 'POST', token: at, body: { name: '测试分类', status: 1 } }); catId = c.id; }
  ok('有分类', !!catId);

  // 1. 创建 auto 商品 + 3 行卡密 → 库存 3
  const auto = await j('/admin/products', { method: 'POST', token: at, body: {
    categoryId: catId, name: '回归-自动卡', price: 1, type: 'auto',
    cardsText: 'AAA111\nBBB222----s1\nCCC333'
  } });
  ok('创建auto商品带3行卡密', !!auto.id, auto);
  ok('auto库存=3', auto.stock === 3, auto.stock);
  const autoId = auto.id;

  // 2. 切换 manual 不清零
  const sw1 = await j('/admin/products/' + autoId, { method: 'PUT', token: at, body: { type: 'manual' } });
  ok('切manual库存仍3', sw1.stock === 3, sw1.stock);
  // 3. 切回 auto，库存=卡密数
  const sw2 = await j('/admin/products/' + autoId, { method: 'PUT', token: at, body: { type: 'auto' } });
  ok('切回auto库存3', sw2.stock === 3, sw2.stock);

  // 4. 追加卡密 2 条 → 库存 5
  const add = await j('/admin/products/' + autoId + '/cards', { method: 'POST', token: at, body: { text: 'DDD444\nEEE555' } });
  ok('追加2条卡密', add.added === 2, add);
  const p1 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-自动卡'), { token: at })).list[0];
  ok('追加后库存5', p1.stock === 5, p1.stock);

  // 5. 下单购买 auto 商品 1 件 → 自动发卡 → 库存 4
  const o1 = await j('/user/orders', { method: 'POST', token, body: { from: 'buynow', productId: autoId, quantity: 1, addressId: addrId } });
  ok('下单auto商品', !!o1.orderId, o1);
  const pay1 = await j('/user/orders/' + o1.orderId + '/pay', { method: 'POST', token, body: { method: 'wechat' } });
  ok('支付成功自动发货', pay1.status === 'shipped' && pay1.autoShipped === true, pay1);
  const p2 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-自动卡'), { token: at })).list[0];
  ok('自动发卡后库存4', p2.stock === 4, p2.stock);

  // 6. 删除一条卡密 → 库存 3
  const cardList = await j('/admin/products/' + autoId + '/cards?status=unused', { token: at });
  const first = cardList.list[0];
  const del = await j('/admin/cards/' + first.id, { method: 'DELETE', token: at });
  ok('删除卡密', !!del.msg, del);
  const p3 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-自动卡'), { token: at })).list[0];
  ok('删除后库存3', p3.stock === 3, p3.stock);

  // 7. manual 商品：库存5 → 下单 → 4
  const man = await j('/admin/products', { method: 'POST', token: at, body: { categoryId: catId, name: '回归-手动卡', price: 2, type: 'manual', stock: 5 } });
  ok('创建manual商品库存5', !!man.id && man.stock === 5, man);
  const manId = man.id;
  const o2 = await j('/user/orders', { method: 'POST', token, body: { from: 'buynow', productId: manId, quantity: 1, addressId: addrId } });
  const pay2 = await j('/user/orders/' + o2.orderId + '/pay', { method: 'POST', token, body: { method: 'wechat' } });
  ok('手动商品支付成功', pay2.status === 'paid' && pay2.autoShipped === false, pay2);
  const m1 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-手动卡'), { token: at })).list[0];
  ok('手动结算后库存4', m1.stock === 4, m1.stock);

  // 8. 手动订单 ship 无单号 → 拒绝；有单号 → 成功
  const shipBad = await j('/admin/orders/' + o2.orderId + '/ship', { method: 'POST', token: at, body: {} });
  ok('手动订单无单号被拒', !shipBad.ok && /单号/.test(shipBad.msg || ''), shipBad);
  const shipOk = await j('/admin/orders/' + o2.orderId + '/ship', { method: 'POST', token: at, body: { trackingNo: 'SF123456', logistics: '顺丰速运' } });
  ok('手动订单发货成功', !!shipOk.msg, shipOk);

  // 9. 退款 auto 订单 → 库存恢复 3+1=4；manual → 4+1=5
  const refund1 = await j('/admin/orders/' + o1.orderId + '/refund', { method: 'POST', token: at, body: { reason: '回归测试' } });
  ok('auto订单退款', !!refund1.msg, refund1);
  const p4 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-自动卡'), { token: at })).list[0];
  ok('退款后auto库存4', p4.stock === 4, p4.stock);
  const refund2 = await j('/admin/orders/' + o2.orderId + '/refund', { method: 'POST', token: at, body: { reason: '回归测试' } });
  ok('manual订单退款', !!refund2.msg, refund2);
  const m2 = (await j('/admin/products?keyword=' + encodeURIComponent('回归-手动卡'), { token: at })).list[0];
  ok('退款后manual库存5', m2.stock === 5, m2.stock);

  // 10. auto 商品无卡密（库存0）→ 下单即被拒（库存不足），避免卖出后无卡可发
  const autoEmpty = await j('/admin/products', { method: 'POST', token: at, body: { categoryId: catId, name: '回归-无卡密', price: 1, type: 'auto' } });
  const o4 = await j('/user/orders', { method: 'POST', token, body: { from: 'buynow', productId: autoEmpty.id, quantity: 1, addressId: addrId } });
  ok('auto无卡密下单被拒', !o4.orderId && /库存不足/.test(o4.msg || ''), o4);

  console.log('\n======== 测试完成：通过 ' + pass + ' 项，失败 ' + fail + ' 项 ========');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
