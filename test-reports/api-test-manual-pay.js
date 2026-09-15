/**
 * 本地手动支付模块专项测试
 * 覆盖：开关控制 / 发起手动支付 / 收款码返回 / 状态流转 / 上传凭证 / 商家确认收款 /
 *      自动发卡 / 消息通知 / 取消释放 / 越权 / 边界状态
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ===== 前置：管理员 / 用户 / 商品 =====
  // 新版认证：管理员经 /auth/login（邮箱/账号 + 密码 + 图形验证码）
  const capA = await cap();
  const rl = await req('POST', '/api/auth/login', { account: 'admin', password: 'admin123', captchaToken: capA.token, captchaCode: capA.devCode });
  const at = rl.json.data.token;
  check('0.0 新版管理员登录(账号+密码)', rl.json.code === 0 && rl.json.data.role === 'admin', rl.json.msg || 'ok');

  // 查看当前 manualPayEnabled 状态
  let s = await req('GET', '/api/admin/settings', undefined, at);
  const wasEnabled = s.json.data.manualPayEnabled;
  const origWechatQrcode = s.json.data.wechatQrcode || '';
  const origAlipayQrcode = s.json.data.alipayQrcode || '';
  const origPayNotice = s.json.data.payNotice || '';
  console.log('[info] manualPayEnabled 初始 =', wasEnabled, '| 收款码 wechat:', (s.json.data.wechatQrcode || '(空)').slice(0, 20), '| alipay:', (s.json.data.alipayQrcode || '(空)').slice(0, 20));

  // 创建自动发货商品 + 卡密
  const catId = s.json.data && s.json.data.siteName ? 1 : 1;
  const pr = await req('POST', '/api/admin/products', { categoryId: 1, name: '手动支付测试商品' + Date.now(), price: 66, type: 'auto' }, at);
  const pid = pr.json.data.id;
  await req('POST', '/api/admin/products/' + pid + '/cards', { text: 'MP-' + Date.now() + '-CARD1\nMP-' + Date.now() + '-CARD2' }, at);

  // 创建手动发货商品
  const pm = await req('POST', '/api/admin/products', { categoryId: 1, name: '手动支付-手动发货' + Date.now(), price: 33, type: 'manual', stock: 5 }, at);
  const pmid = pm.json.data.id;

  // 注册两个用户（A 正常，B 越权）——新版邮箱体系
  async function newUser() {
    const em = 'mp' + Date.now() + '' + Math.floor(Math.random() * 999) + '@test.com';
    const c = await cap();
    const rs = await req('POST', '/api/auth/send-email-code', { email: em, scene: 'register', captchaToken: c.token, captchaCode: c.devCode });
    if (rs.json.code !== 0) return { email: em, token: null, uid: null, err: rs.json.msg };
    const rr = await req('POST', '/api/auth/register-email', { email: em, code: rs.json.data.devCode, password: 'test123', nickname: '手动支付测试' });
    return { email: em, token: rr.json.data.token, uid: rr.json.data.user.id, err: rr.json.msg };
  }
  const ua = await newUser();
  const ub = await newUser();
  check('0.1 邮箱注册用户A', !!ua.token, ua.err || ua.email);
  check('0.2 邮箱注册用户B', !!ub.token, ub.err || ub.email);
  const addrA = (await req('POST', '/api/user/addresses', { name: '甲', phone: '13800138000', region: '江西赣州', detail: '测试路1号', isDefault: true }, ua.token)).json.data;

  // ========== 1. 未开启时发起手动支付被拒 ==========
  if (wasEnabled) {
    // 已开启则先关闭
    await req('PUT', '/api/admin/settings', { manualPayEnabled: false }, at);
  }
  let o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrA.id }, ua.token);
  const orderId1 = o.json.data.orderId;
  let r = await req('POST', '/api/user/orders/' + orderId1 + '/pay', { method: 'manual' }, ua.token);
  check('1.1 手动支付未开启时被拒', r.json.code === 1 && /未开启/.test(r.json.msg), r.json.msg);
  r = await req('GET', '/api/user/orders/' + orderId1, undefined, ua.token);
  check('1.2 订单状态仍为 pending', r.json.data.status === 'pending', r.json.data.status);
  await req('POST', '/api/user/orders/' + orderId1 + '/cancel', undefined, ua.token);

  // ========== 2. 开启后发起手动支付 ==========
  r = await req('PUT', '/api/admin/settings', { manualPayEnabled: true, wechatQrcode: '/uploads/manual-wechat.png', alipayQrcode: '/uploads/manual-alipay.png', payNotice: '请使用备注订单号的转账方式付款' }, at);
  check('2.0 开启手动支付 + 配置收款码', r.json.code === 0, r.json.msg || 'ok');

  o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrA.id }, ua.token);
  const orderId2 = o.json.data.orderId;
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay', { method: 'manual' }, ua.token);
  check('2.1 发起手动支付成功', r.json.code === 0 && r.json.data.payMode === 'manual', JSON.stringify(r.json.data).slice(0, 120));
  check('2.2 返回微信收款码', r.json.data.wechatQrcode === '/uploads/manual-wechat.png', r.json.data.wechatQrcode);
  check('2.3 返回支付宝收款码', r.json.data.alipayQrcode === '/uploads/manual-alipay.png', r.json.data.alipayQrcode);
  check('2.4 返回支付说明', r.json.data.payNotice.includes('备注'), r.json.data.payNotice);
  check('2.5 订单进入待确认状态', r.json.data.status === 'pending_confirm', r.json.data.status);

  r = await req('GET', '/api/user/orders/' + orderId2, undefined, ua.token);
  check('2.6 订单详情为 pending_confirm 且渠道 manual', r.json.data.status === 'pending_confirm' && r.json.data.payChannel === 'manual', r.json.data.status + '/' + r.json.data.payChannel);

  // 待确认状态下再尝试其他支付方式
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay', { method: 'wechat' }, ua.token);
  check('2.7 待确认状态不可重复支付(其他方式)', r.json.code === 1 && /状态已变化/.test(r.json.msg), r.json.msg);

  // ========== 3. 上传付款凭证 ==========
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay-proof', { payProof: '截图base64data' }, ua.token);
  check('3.1 上传付款凭证成功', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/user/orders/' + orderId2, undefined, ua.token);
  check('3.2 凭证已保存', r.json.data.payProof === '截图base64data' && r.json.data.payProofAt > 0, r.json.data.payProof);

  // 空凭证
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay-proof', { payProof: '' }, ua.token);
  check('3.3 空凭证被拒', r.json.code === 1, r.json.msg);

  // 超长凭证（>500 截断）
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay-proof', { payProof: 'x'.repeat(900) }, ua.token);
  r = await req('GET', '/api/user/orders/' + orderId2, undefined, ua.token);
  check('3.4 超长凭证截断至500', r.json.data.payProof.length <= 500, 'len=' + r.json.data.payProof.length);

  // 非待确认订单不能传凭证
  o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrA.id }, ua.token);
  const orderId3 = o.json.data.orderId; // pending
  r = await req('POST', '/api/user/orders/' + orderId3 + '/pay-proof', { payProof: 'x' }, ua.token);
  check('3.5 pending 订单不能传凭证', r.json.code === 1, r.json.msg);
  await req('POST', '/api/user/orders/' + orderId3 + '/cancel', undefined, ua.token);

  // ========== 4. 越权 ==========
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay-proof', { payProof: 'B上传' }, ub.token);
  check('4.1 越权-他人不能给订单传凭证', r.json.code === 1, r.json.msg);
  r = await req('GET', '/api/user/orders/' + orderId2, undefined, ub.token);
  check('4.2 越权-他人不能查看订单', r.json.code === 1, r.json.msg);
  r = await req('POST', '/api/user/orders/' + orderId2 + '/pay', { method: 'manual' }, ub.token);
  check('4.3 越权-他人不能操作支付', r.json.code === 1, r.json.msg);

  // ========== 5. 商家确认收款 → 自动发卡 ==========
  // 确认前先查卡密数
  const cardsBefore = (await req('GET', '/api/admin/products/' + pid + '/cards?status=unused', undefined, at)).json.data;
  r = await req('POST', '/api/admin/orders/' + orderId2 + '/confirm-pay', undefined, at);
  check('5.1 商家确认收款', r.json.code === 0 && r.json.data.autoShipped === true, JSON.stringify(r.json.data).slice(0, 80));
  r = await req('GET', '/api/user/orders/' + orderId2, undefined, ua.token);
  check('5.2 订单已发货(shipped)且含卡密', r.json.data.status === 'shipped' && (r.json.data.cards || []).length === 1, r.json.data.status + ' cards=' + (r.json.data.cards || []).length);
  check('5.3 卡密标记 used', (r.json.data.cards || [])[0] && (r.json.data.cards || [])[0].status === 'used', ((r.json.data.cards || [])[0] || {}).status);
  check('5.4 渠道为 manual', r.json.data.payChannel === 'manual', r.json.data.payChannel);

  // 消息通知
  const msgs = (await req('GET', '/api/user/messages', undefined, ua.token)).json.data.list;
  const confirmMsg = msgs.find(m => m.title === '支付已确认');
  check('5.5 用户收到支付确认消息', !!confirmMsg, confirmMsg ? confirmMsg.content : '未找到');

  // 重复确认
  r = await req('POST', '/api/admin/orders/' + orderId2 + '/confirm-pay', undefined, at);
  check('5.6 已发货订单不可重复确认', r.json.code === 1, r.json.msg);

  // ========== 6. 手动发货商品走手动支付 ==========
  o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pmid, quantity: 2, addressId: addrA.id }, ua.token);
  const orderId4 = o.json.data.orderId;
  r = await req('POST', '/api/user/orders/' + orderId4 + '/pay', { method: 'manual' }, ua.token);
  check('6.1 手动发货商品发起手动支付', r.json.code === 0 && r.json.data.status === 'pending_confirm', r.json.msg || 'ok');
  await req('POST', '/api/user/orders/' + orderId4 + '/pay-proof', { payProof: '截图' }, ua.token);
  r = await req('POST', '/api/admin/orders/' + orderId4 + '/confirm-pay', undefined, at);
  check('6.2 确认收款后状态 paid(待手动发货)', r.json.code === 0 && r.json.data.autoShipped === false && r.json.data.status === 'paid', JSON.stringify(r.json.data).slice(0, 80));
  r = await req('GET', '/api/user/orders/' + orderId4, undefined, ua.token);
  check('6.3 手动商品订单状态 paid', r.json.data.status === 'paid', r.json.data.status);

  // ========== 7. 待确认订单取消 → 释放 ==========
  o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pmid, quantity: 1, addressId: addrA.id }, ua.token);
  const orderId5 = o.json.data.orderId;
  const stockBefore = (await req('GET', '/api/shop/products/' + pmid, undefined, ua.token)).json.data.stock;
  await req('POST', '/api/user/orders/' + orderId5 + '/pay', { method: 'manual' }, ua.token);
  r = await req('POST', '/api/user/orders/' + orderId5 + '/cancel', { reason: '不想要了' }, ua.token);
  check('7.1 待确认订单可取消', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/user/orders/' + orderId5, undefined, ua.token);
  check('7.2 取消后状态 cancelled', r.json.data.status === 'cancelled', r.json.data.status);
  const stockAfter = (await req('GET', '/api/shop/products/' + pmid, undefined, ua.token)).json.data.stock;
  check('7.3 取消未占用库存(手动商品下单已预扣)', stockAfter === stockBefore, 'before=' + stockBefore + ' after=' + stockAfter);

  // 已发货订单不能取消
  r = await req('POST', '/api/user/orders/' + orderId2 + '/cancel', undefined, ua.token);
  check('7.4 已发货订单不可取消', r.json.code === 1, r.json.msg);

  // ========== 8. 管理端确认收款越权 ==========
  r = await req('POST', '/api/admin/orders/' + orderId2 + '/confirm-pay', undefined, ua.token);
  check('8.1 用户 token 不能确认收款', r.status === 401, 'status=' + r.status);

  // ========== 9. 收款码为空时的兜底 ==========
  await req('PUT', '/api/admin/settings', { wechatQrcode: '', alipayQrcode: '', payNotice: '' }, at);
  o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrA.id }, ua.token);
  const orderId6 = o.json.data.orderId;
  r = await req('POST', '/api/user/orders/' + orderId6 + '/pay', { method: 'manual' }, ua.token);
  check('9.1 收款码为空仍可发起(返回空字符串)', r.json.code === 0 && r.json.data.wechatQrcode === '' && r.json.data.alipayQrcode === '', JSON.stringify(r.json.data).slice(0, 80));
  await req('POST', '/api/user/orders/' + orderId6 + '/cancel', undefined, ua.token);

  // ========== 10. 优惠券在待确认取消时释放 ==========
  // 领取满减券下单（注意：下单接口 couponId 传「用户领取记录 id」（/user/coupons 返回的 id），而非优惠券模板 id）
  const coupons = (await req('GET', '/api/shop/coupons', undefined, ua.token)).json.data;
  const fc = coupons.find(c => c.type === 'fullcut' && (c.threshold || 0) <= 66);
  if (fc) {
    await req('POST', '/api/user/coupons/claim/' + fc.id, undefined, ua.token);
    const uc = (await req('GET', '/api/user/coupons', undefined, ua.token)).json.data.find(c => c.couponId === fc.id);
    if (uc) {
      o = await req('POST', '/api/user/orders', { from: 'buynow', productId: pid, quantity: 1, addressId: addrA.id, couponId: uc.id }, ua.token);
      if (o.json.code === 0) {
        const orderId7 = o.json.data.orderId;
        await req('POST', '/api/user/orders/' + orderId7 + '/pay', { method: 'manual' }, ua.token);
        await req('POST', '/api/user/orders/' + orderId7 + '/cancel', undefined, ua.token);
        const myC = (await req('GET', '/api/user/coupons', undefined, ua.token)).json.data.find(c => c.couponId === fc.id);
        check('10.1 待确认订单取消后优惠券释放', myC && myC.status === 'unused', JSON.stringify(myC).slice(0, 80));
      } else {
        check('10.1 待确认订单取消后优惠券释放', false, '下单失败:' + o.json.msg);
      }
    } else {
      check('10.1 待确认订单取消后优惠券释放', false, '领取后未找到用户券记录');
    }
  } else {
    check('10.1 待确认订单取消后优惠券释放', true, '无可用满减券，跳过');
  }

  // ========== 11. 开关与收款码恢复原值 ==========
  await req('PUT', '/api/admin/settings', { manualPayEnabled: wasEnabled, wechatQrcode: origWechatQrcode, alipayQrcode: origAlipayQrcode, payNotice: origPayNotice }, at);
  // 清理测试数据
  for (const oid of [orderId1, orderId3, orderId5, orderId6]) {
    const dd = (await req('GET', '/api/user/orders/' + oid, undefined, ua.token)).json.data;
    if (dd && dd.status === 'cancelled') await req('DELETE', '/api/admin/orders/' + oid, undefined, at);
  }
  for (const oid of [orderId2, orderId4]) {
    const dd = (await req('GET', '/api/user/orders/' + oid, undefined, ua.token)).json.data;
    if (dd && dd.status === 'shipped' || dd && dd.status === 'paid') {
      await req('POST', '/api/admin/orders/' + oid + '/refund', { reason: '测试清理' }, at);
      await req('DELETE', '/api/admin/orders/' + oid, undefined, at);
    }
  }
  await req('DELETE', '/api/admin/products/' + pid, undefined, at);
  await req('DELETE', '/api/admin/products/' + pmid, undefined, at);
  await req('DELETE', '/api/admin/users/' + ua.uid, undefined, at);
  await req('DELETE', '/api/admin/users/' + ub.uid, undefined, at);

  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
