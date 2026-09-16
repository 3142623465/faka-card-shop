// 注销账号邮箱验证 + 已注销登录提示 端到端验证
const BASE = 'http://localhost:3000/api';
const j = async (p, opt = {}) => {
  const r = await fetch(BASE + p, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  return r.json();
};
const cap = async () => { const c = await j('/auth/captcha'); return { captchaToken: c.data.token, captchaCode: c.data.devCode }; };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra); } };

(async () => {
  const email = 'demo@example.com', password = '123456';

  // 1. 密码登录
  let c = await cap();
  let r = await j('/auth/login', { method: 'POST', body: { email, password, ...c } });
  ok('demo 正常登录', r.code === 0, JSON.stringify(r));
  const token = r.data && r.data.token;

  // 2. 无验证码注销 → 拒绝
  r = await j('/user/account', { method: 'DELETE', token, body: {} });
  ok('无验证码注销被拒', r.code === 1 && /验证码/.test(r.msg), JSON.stringify(r));

  // 3. 错误验证码注销 → 拒绝
  r = await j('/user/account', { method: 'DELETE', token, body: { code: '000000' } });
  ok('错误验证码注销被拒', r.code === 1 && /验证码错误或已过期/.test(r.msg), JSON.stringify(r));

  // 4. 发送注销验证码（登录后，免图形验证码）
  r = await j('/auth/send-email-code-authed', { method: 'POST', token, body: { purpose: 'cancel_account' } });
  ok('发送注销验证码成功', r.code === 0 && r.data && r.data.devCode, JSON.stringify(r));
  const cancelCode = r.data && r.data.devCode;

  // 5. 正确验证码注销 → 成功
  r = await j('/user/account', { method: 'DELETE', token, body: { code: cancelCode } });
  ok('正确验证码注销成功', r.code === 0 && /已注销/.test(r.msg || (r.data && r.data.msg)), JSON.stringify(r));

  // 6. 注销后旧 token 访问用户信息 → 应 401/被踢
  r = await j('/auth/me', { token });
  ok('注销后旧会话失效', r.code !== 0, JSON.stringify(r));

  // 7. 密码再登录 → 提示"该账号已注销"
  c = await cap();
  r = await j('/auth/login', { method: 'POST', body: { email, password, ...c } });
  ok('密码登录提示已注销', r.code === 1 && /已注销/.test(r.msg), JSON.stringify(r));

  // 8. 验证码登录 → 也提示已注销（先发 scene=login 的码，需图形验证码）
  c = await cap();
  const sr = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'login', ...c } });
  if (sr.code === 0 && sr.data && sr.data.devCode) {
    r = await j('/auth/login-email-code', { method: 'POST', body: { email, code: sr.data.devCode } });
    ok('验证码登录提示已注销', r.code === 1 && /已注销/.test(r.msg), JSON.stringify(r));
  } else {
    ok('验证码登录提示已注销(发码)', false, JSON.stringify(sr));
  }

  // 9. 同邮箱重新注册 → 应放行（邮箱已释放）
  c = await cap();
  const reg = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'register', ...c } });
  if (reg.code === 0 && reg.data && reg.data.devCode) {
    c = await cap();
    r = await j('/auth/register-email', { method: 'POST', body: { email, code: reg.data.devCode, password: 'newpass123', nickname: '重新注册', captchaToken: c.captchaToken, captchaCode: c.captchaCode } });
    ok('同邮箱可重新注册', r.code === 0, JSON.stringify(r));
    // 新账号能登录
    c = await cap();
    const lr = await j('/auth/login', { method: 'POST', body: { email, password: 'newpass123', ...c } });
    ok('重新注册后可正常登录', lr.code === 0 && lr.data && !lr.data.user.userDeleted, JSON.stringify(lr).slice(0, 120));
  } else {
    ok('同邮箱可重新注册(发码)', false, JSON.stringify(reg));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
