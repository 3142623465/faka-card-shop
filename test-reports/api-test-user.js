/**
 * 发卡网 API 功能测试 - 第二组：用户业务链路（地址/收藏/购物车/优惠券/下单/支付/售后/消息/工单/客服/上传）
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
const cap = async () => (await req('GET', '/api/auth/captcha')).json.data;

(async () => {
  // 注册测试用户
  const phone = '132' + String(Date.now()).slice(-8);
  const c1 = await cap();
  const rs = await req('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken: c1.token, captchaCode: c1.devCode });
  const rr = await req('POST', '/api/auth/register', { phone, code: rs.json.data.devCode, password: 'test123', nickname: '业务测试' });
  const token = rr.json.data.token;
  check('前置：注册测试用户', rr.json.code === 0, rr.json.msg || 'ok');
  const uid = rr.json.data.user.id;

  // ========== 地址管理 ==========
  let r = await req('GET', '/api/user/addresses', undefined, token);
  check('GET /user/addresses 初始为空', r.json.code === 0 && r.json.data.length === 0);

  r = await req('POST', '/api/user/addresses', { name: '张三', phone: '13800138000', region: '江西省赣州市', detail: '章贡区测试路1号', isDefault: true }, token);
  check('POST /user/addresses 新增默认地址', r.json.code === 0 && r.json.data.isDefault === 1, r.json.msg || 'ok');
  const addrId = r.json.data.id;

  r = await req('POST', '/api/user/addresses', { name: '李四', phone: '13900139000', region: '广东省深圳市', detail: '南山区测试路2号' }, token);
  check('POST /user/addresses 新增第二个地址', r.json.code === 0);
  const addrId2 = r.json.data.id;
  check('默认地址唯一', r.json.data.isDefault === 0, 'isDefault=' + r.json.data.isDefault);

  r = await req('PUT', '/api/user/addresses/' + addrId2 + '/default', undefined, token);
  check('PUT /user/addresses/:id/default 切换默认', r.json.code === 0);

  r = await req('PUT', '/api/user/addresses/' + addrId, { name: '张三丰' }, token);
  check('PUT /user/addresses/:id 更新', r.json.code === 0 && r.json.data.name === '张三丰');

  // 越权：其他用户 token 改本用户地址应失败
  const phone2 = '131' + String(Date.now()).slice(-8);
  const c2 = await cap();
  const rs2 = await req('POST', '/api/auth/send-code', { phone: phone2, scene: 'register', captchaToken: c2.token, captchaCode: c2.devCode });
  const rr2 = await req('POST', '/api/auth/register', { phone: phone2, code: rs2.json.data.devCode, password: 'test123' });
  const token2 = rr2.json.data.token;
  r = await req('PUT', '/api/user/addresses/' + addrId, { name: '黑客' }, token2);
  check('越权-他人无法修改我的地址', r.json.code === 1, r.json.msg);
  r = await req('DELETE', '/api/user/addresses/' + addrId, undefined, token2);
  check('越权-他人无法删除我的地址', r.json.code === 1, r.json.msg);

  // ========== 收藏 ==========
  const prodR = await req('GET', '/api/shop/products?size=1');
  const pid = prodR.json.data.list[0].id;
  r = await req('POST', '/api/user/favorites/' + pid, undefined, token);
  check('POST /user/favorites/:pid 收藏', r.json.code === 0);
  r = await req('POST', '/api/user/favorites/' + pid, undefined, token);
  check('重复收藏幂等', r.json.code === 0);
  r = await req('GET', '/api/user/favorites', undefined, token);
  check('GET /user/favorites 列表', r.json.code === 0 && r.json.data.length === 1);
  r = await req('DELETE', '/api/user/favorites/' + pid, undefined, token);
  check('DELETE /user/favorites/:pid 取消收藏', r.json.code === 0);

  // ========== 购物车 ==========
  r = await req('POST', '/api/user/cart', { productId: pid, quantity: 2 }, token);
  check('POST /user/cart 加购', r.json.code === 0, r.json.msg);
  r = await req('POST', '/api/user/cart', { productId: pid, quantity: 3 }, token);
  check('加购同商品数量累加', r.json.code === 0);
  r = await req('GET', '/api/user/cart', undefined, token);
  const cartItem = r.json.data[0];
  check('GET /user/cart 数量累加正确', r.json.data.length === 1 && cartItem.quantity === 5, 'qty=' + cartItem.quantity);

  r = await req('PUT', '/api/user/cart/' + cartItem.id, { quantity: 1 }, token);
  check('PUT /user/cart/:id 改数量', r.json.code === 0 && r.json.data.quantity === 1);
  r = await req('PUT', '/api/user/cart/' + cartItem.id, { checked: 0 }, token);
  check('PUT /user/cart/:id 取消勾选', r.json.code === 0 && r.json.data.checked === 0);

  // 超量购买：库存上限
  r = await req('POST', '/api/user/cart', { productId: pid, quantity: 99999 }, token);
  check('加购数量上限钳制', r.json.code === 0, 'qty cap: ' + (r.json.data && r.json.data.msg));

  // 商品不存在
  r = await req('POST', '/api/user/cart', { productId: 999999, quantity: 1 }, token);
  check('加购不存在商品被拒', r.json.code === 1, r.json.msg);

  // ========== 优惠券 ==========
  const coupR = await req('GET', '/api/shop/coupons', undefined, token);
  const coupon = coupR.json.data[0];
  if (coupon) {
    r = await req('POST', '/api/user/coupons/claim/' + coupon.id, undefined, token);
    check('POST /user/coupons/claim 领取优惠券', r.json.code === 0, r.json.msg);
    r = await req('POST', '/api/user/coupons/claim/' + coupon.id, undefined, token);
    check('重复领取被拒', r.json.code === 1, r.json.msg);
    r = await req('GET', '/api/user/coupons', undefined, token);
    check('GET /user/coupons 我的券', r.json.code === 0 && r.json.data.length >= 1);
    const uc = r.json.data[0];
    check('领券后 claimed 计数+1', coupon.claimed + 1 === (await req('GET', '/api/shop/coupons')).json.data.find(x=>x.id===coupon.id).claimed, 'claimed=' + (await req('GET', '/api/shop/coupons')).json.data.find(x=>x.id===coupon.id).claimed);
  } else {
    check('POST /user/coupons/claim 领取优惠券', false, '无可用优惠券');
  }

  // ========== 下单（buynow） ==========
  r = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrId2 }, token);
  check('POST /user/orders 立即购买下单', r.json.code === 0, r.json.msg || 'ok');
  const orderId = r.json.data.orderId;
  const orderNo = r.json.data.orderNo;

  // 无地址下单
  r = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: 999999 }, token);
  check('无有效地址下单被拒', r.json.code === 1, r.json.msg);

  // 库存不足（数量超库存）
  r = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 999999, addressId: addrId2 }, token);
  check('超库存下单被拒', r.json.code === 1, r.json.msg);

  // 购物车结算
  r = await req('POST', '/api/user/orders', { from: 'cart', cartIds: [cartItem.id], addressId: addrId2 }, token);
  check('POST /user/orders 购物车结算', r.json.code === 0, r.json.msg || 'ok');
  const orderId2 = r.json.data.orderId;

  // ========== 支付 ==========
  r = await req('POST', '/api/user/orders/' + orderId + '/pay', { method: 'wechat' }, token);
  check('POST /user/orders/:id/pay 模拟支付', r.json.code === 0 && r.json.data.payMode === 'mock', JSON.stringify(r.json.data).slice(0, 150));
  check('模拟支付自动发货', r.json.data.autoShipped === true, 'status=' + r.json.data.status);

  // 重复支付
  r = await req('POST', '/api/user/orders/' + orderId + '/pay', { method: 'alipay' }, token);
  check('重复支付被拒', r.json.code === 1, r.json.msg);

  // ========== 订单查询（卡密查看） ==========
  r = await req('GET', '/api/user/orders/' + orderId, undefined, token);
  check('GET /user/orders/:id 详情含卡密', r.json.code === 0 && r.json.data.cards.length > 0, 'cards=' + r.json.data.cards.length);
  check('卡密已标记使用', r.json.data.cards[0].status === 'used', r.json.data.cards[0].status);

  r = await req('GET', '/api/user/orders', undefined, token);
  check('GET /user/orders 列表', r.json.code === 0 && r.json.data.total >= 2, 'total=' + r.json.data.total);

  // 订单状态筛选
  r = await req('GET', '/api/user/orders?status=paid', undefined, token);
  check('订单按状态筛选', r.json.code === 0);

  // 越权：他人查看我的订单
  r = await req('GET', '/api/user/orders/' + orderId, undefined, token2);
  check('越权-他人无法查看我的订单', r.json.code === 1, r.json.msg);

  // 确认收货
  r = await req('POST', '/api/user/orders/' + orderId + '/confirm', undefined, token);
  check('POST /user/orders/:id/confirm 确认收货', r.json.code === 0, r.json.msg);

  // 取消：已完成的订单不能取消
  r = await req('POST', '/api/user/orders/' + orderId + '/cancel', undefined, token);
  check('已完成订单不可取消', r.json.code === 1, r.json.msg);

  // 待付款订单取消
  r = await req('POST', '/api/user/orders/' + orderId2 + '/cancel', { reason: '不想要了' }, token);
  check('POST /user/orders/:id/cancel 取消待付款订单', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/user/orders/' + orderId2, undefined, token);
  check('取消后状态 cancelled', r.json.data.status === 'cancelled', r.json.data.status);

  // ========== 售后 ==========
  // 未支付订单不可售后
  r = await req('POST', '/api/user/orders/' + orderId2 + '/aftersale', { type: 'refund', reason: '测试' }, token);
  check('已取消订单不可申请售后', r.json.code === 1, r.json.msg);

  // 用 orderId（已完成）申请售后
  r = await req('POST', '/api/user/orders/' + orderId + '/aftersale', { type: 'refund', reason: '卡密无法使用' }, token);
  check('POST /user/orders/:id/aftersale 申请售后', r.json.code === 0, r.json.msg);
  const afId = r.json.data.aftersaleId;

  r = await req('POST', '/api/user/orders/' + orderId + '/aftersale', { type: 'refund', reason: '重复申请' }, token);
  check('重复申请售后被拒', r.json.code === 1, r.json.msg);

  r = await req('GET', '/api/user/aftersales', undefined, token);
  check('GET /user/aftersales 列表', r.json.code === 0 && r.json.data.length === 1);

  // ========== 消息 ==========
  r = await req('GET', '/api/user/messages', undefined, token);
  check('GET /user/messages 列表', r.json.code === 0 && r.json.data.total >= 1, 'total=' + r.json.data.total);
  const msg = r.json.data.list[0];
  r = await req('POST', '/api/user/messages/' + msg.id + '/read', undefined, token);
  check('POST /user/messages/:id/read 已读', r.json.code === 0);
  r = await req('GET', '/api/user/messages/unread-count', undefined, token);
  check('GET /user/messages/unread-count', r.json.code === 0);
  r = await req('POST', '/api/user/messages/read-all', undefined, token);
  check('POST /user/messages/read-all 全部已读', r.json.code === 0);

  // ========== 积分 ==========
  r = await req('GET', '/api/user/points-logs', undefined, token);
  check('GET /user/points-logs 积分明细', r.json.code === 0 && r.json.data.balance !== undefined, 'balance=' + r.json.data.balance);

  // ========== 工单 ==========
  r = await req('POST', '/api/user/tickets', { type: '售后问题', description: '订单卡密无法使用，请协助' }, token);
  check('POST /user/tickets 提交工单', r.json.code === 0, r.json.msg);
  const ticketId = r.json.data.ticketId;
  r = await req('GET', '/api/user/tickets/' + ticketId, undefined, token);
  check('GET /user/tickets/:id', r.json.code === 0 && r.json.data.id === ticketId);

  // 越权：他人查我的工单
  r = await req('GET', '/api/user/tickets/' + ticketId, undefined, token2);
  check('越权-他人无法查看我的工单', r.json.code === 1, r.json.msg);

  // ========== 客服对话 ==========
  r = await req('POST', '/api/user/chat', { content: '卡密怎么使用？' }, token);
  check('POST /user/chat 发送消息自动回复', r.json.code === 0 && r.json.data.reply, r.json.data.reply);
  r = await req('GET', '/api/user/chat', undefined, token);
  check('GET /user/chat 对话记录', r.json.code === 0 && r.json.data.length >= 2, 'count=' + r.json.data.length);
  // 空消息
  r = await req('POST', '/api/user/chat', { content: '   ' }, token);
  check('空消息被拒', r.json.code === 1, r.json.msg);
  // 超长消息
  r = await req('POST', '/api/user/chat', { content: 'x'.repeat(600) }, token);
  check('超长消息被拒', r.json.code === 1, r.json.msg);

  // ========== 上传 ==========
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  r = await req('POST', '/api/user/upload', { data: pngBase64, ext: 'png' }, token);
  check('POST /user/upload 上传图片', r.json.code === 0 && r.json.data.url.startsWith('/uploads/'), r.json.data.url);
  r = await req('POST', '/api/user/upload', { data: pngBase64, ext: 'exe' }, token);
  check('上传非法格式被拒', r.json.code === 1, r.json.msg);

  // ========== 积分兑换/余额 ==========
  r = await req('GET', '/api/user/branch-config', undefined, token);
  check('GET /user/branch-config', r.json.code === 0 && r.json.data.prices, JSON.stringify(r.json.data).slice(0, 120));

  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
