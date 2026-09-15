/** 分站提现收款方式绑定全流程测试（模拟浏览器 API 调用） */
const BASE = 'http://127.0.0.1:3000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' :: ' + extra : '')); }
};
async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const raw = await r.json();
  // 解包 {code:0,data} / {code:1,msg}
  if (raw && typeof raw === 'object' && 'code' in raw) {
    return { ok: raw.code === 0, data: raw.data, msg: raw.msg, ...(raw.data && typeof raw.data === 'object' ? raw.data : {}), ...(Array.isArray(raw.data) ? { list: raw.data } : {}) };
  }
  return raw;
}
async function cap() {
  const c = await j('/auth/captcha');
  return { captchaToken: c.token, captchaCode: c.devCode };
}
(async () => {
  // 1. 用用户账号注册 + 升级分站（复用已有测试分站：直接找 seed 分站）
  const adminLogin = await j('/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123', ...(await cap()) } });
  ok('管理员登录', adminLogin.ok);
  const at = adminLogin.token;

  // 总是新建一个独立分站（账号即邮箱），避免命中历史测试数据
  const un = 'pt' + Math.random().toString(36).slice(2, 8) + Date.now().toString().slice(-4) + '@qq.com';
  const create = await j('/admin/branches', { method: 'POST', token: at, body: { name: '提现测试站', username: un, password: 'Branch123!', type: 'normal', pricePro: 10, priceNormal: 0 } });
  ok('管理员开通分站', create.ok, JSON.stringify(create));
  const br = { id: create.id, username: un, name: '提现测试站', email: un };
  // 分站登录
  const bl = await j('/branch/login', { method: 'POST', body: { username: br.username, password: 'Branch123!', ...(await cap()) } });
  ok('分站登录', bl.ok, JSON.stringify(bl));
  const bt = bl.token;
  const email = br.email || br.username;

  // 2. 查询初始收款方式
  const pa0 = await j('/branch/pay-accounts', { token: bt });
  ok('GET pay-accounts', pa0.ok && typeof pa0.payAccounts === 'object' && pa0.email);
  ok('返回分站邮箱', pa0.email === email, 'email=' + pa0.email);

  // 3. 未绑定时提现被拒
  const wd0 = await j('/branch/withdrawals', { method: 'POST', token: bt, body: { amount: 1, method: 'alipay' } });
  ok('未绑定提现被拒', !wd0.ok && /绑定/.test(wd0.msg), wd0.msg);

  // 4. 发送绑定邮箱验证码（scene=pay）
  const sc = await cap();
  const send = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'pay', ...sc } });
  ok('发送pay验证码', send.ok && send.devCode, JSON.stringify(send));
  const payCode = send.devCode;

  // 5. 邮箱不匹配拒绝
  const bad = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'alipay', email: 'other@x.com', emailCode: payCode, nickname: '张三', account: '13800138000' } });
  ok('邮箱不匹配拒绝', !bad.ok, bad.msg);

  // 6. 绑定支付宝（昵称+账号）
  const alipay = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'alipay', email, emailCode: payCode, nickname: '张三', account: '13800138000' } });
  ok('绑定支付宝', alipay.ok, alipay.msg);
  // 验证码一次性：再次使用被拒
  const reuse = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'wechat', email, emailCode: payCode, nickname: 'wx', qrcode: '/uploads/x.png' } });
  ok('验证码一次性消费', !reuse.ok, reuse.msg);

  // 7. 绑定微信（昵称+收款码图）—— 邮箱验证码限流 60 秒/次，等待后重新发码
  await new Promise((r) => setTimeout(r, 62000));
  const sc2 = await cap();
  const send2 = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'pay', ...sc2 } });
  ok('发送微信绑定验证码', send2.ok && send2.devCode, JSON.stringify(send2));
  const wx = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'wechat', email, emailCode: send2.devCode, nickname: '李四', qrcode: '/uploads/qr.png' } });
  ok('绑定微信收款码', wx.ok, wx.msg);

  // 8. 绑定银行卡（持卡人+完整开户行+卡号）—— 再等限流窗口
  await new Promise((r) => setTimeout(r, 62000));
  const sc3 = await cap();
  const send3 = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'pay', ...sc3 } });
  ok('发送银行卡绑定验证码', send3.ok && send3.devCode, JSON.stringify(send3));
  const bank = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'bank', email, emailCode: send3.devCode, holder: '王五', bankName: '中国工商银行北京分行海淀支行', account: '6222020200112233445' } });
  ok('绑定银行卡', bank.ok, bank.msg);

  // 9. 校验字段：短开户行 / 错误卡号被拒（等待限流后）
  await new Promise((r) => setTimeout(r, 62000));
  const sc4 = await cap();
  const send4 = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'pay', ...sc4 } });
  const badBank = await j('/branch/pay-accounts', { method: 'POST', token: bt, body: { type: 'bank', email, emailCode: send4.devCode, holder: '王五', bankName: '银行', account: '123' } });
  ok('银行卡字段校验', !badBank.ok, badBank.msg);

  // 10. 查询脱敏
  const pa1 = await j('/branch/pay-accounts', { token: bt });
  ok('脱敏返回', pa1.payAccounts.alipay && /138\*\*\*\*8000|13800138000/.test(pa1.payAccounts.alipay.account) && !/^13800138000$/.test(pa1.payAccounts.alipay.account));
  console.log('    → alipay:', JSON.stringify(pa1.payAccounts.alipay));

  // 11. 管理员给分站加余额 → 提现（alipay）
  const bal = await j('/admin/branches/' + br.id + '/balance', { method: 'PUT', token: at, body: { amount: 50, desc: '测试充值' } });
  ok('管理员调整分站余额', bal.ok && bal.balance >= 50, JSON.stringify(bal));
  const wd1 = await j('/branch/withdrawals', { method: 'POST', token: bt, body: { amount: 1, method: 'alipay' } });
  ok('支付宝提现申请', wd1.ok, wd1.msg);
  const wds = await j('/branch/withdrawals', { token: bt });
  const w1 = (wds.list || wds || []).find((x) => x.id === wd1.id);
  ok('提现记录含收款快照', !!w1 && /支付宝（张三）/.test(w1.account), w1 && w1.account);

  // 12. 微信提现（余额充足应成功）
  const wd2 = await j('/branch/withdrawals', { method: 'POST', token: bt, body: { amount: 1, method: 'wechat' } });
  ok('微信提现申请', wd2.ok, wd2.msg);

  // 13. 未绑定类型拒绝（用不存在的类型）
  const wd3 = await j('/branch/withdrawals', { method: 'POST', token: bt, body: { amount: 1, method: 'paypal' } });
  ok('非法方式拒绝', !wd3.ok, wd3.msg);

  // 14. 解绑支付宝
  const ub = await j('/branch/pay-accounts/alipay', { method: 'DELETE', token: bt });
  ok('解绑支付宝', ub.ok, ub.msg);
  const pa2 = await j('/branch/pay-accounts', { token: bt });
  ok('解绑后不再返回', !pa2.payAccounts.alipay);

  console.log('\n======== 测试完成：通过 ' + pass + ' 项，失败 ' + fail + ' 项 ========');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
