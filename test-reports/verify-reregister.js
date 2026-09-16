// 验证：注销状态落库持久化 + 同邮箱可重新注册
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
const ok = (n, cond, extra = '') => { if (cond) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, extra); } };

(async () => {
  const email = 'demo@example.com';
  // 1. 重启后登录仍提示已注销（落库持久化）
  let c = await cap();
  let r = await j('/auth/login', { method: 'POST', body: { email, password: '123456', ...c } });
  ok('重启后仍提示账号已注销(落库生效)', r.code === 1 && /已注销/.test(r.msg), JSON.stringify(r));

  // 2. 发注册码（查重应排除已注销账号，放行）
  c = await cap();
  const sr = await j('/auth/send-email-code', { method: 'POST', body: { email, scene: 'register', ...c } });
  ok('已注销邮箱可发送注册码', sr.code === 0 && sr.data && sr.data.devCode, JSON.stringify(sr));

  // 3. 重新注册
  c = await cap();
  r = await j('/auth/register-email', { method: 'POST', body: { email, code: sr.data.devCode, password: 'newpass123', nickname: '重新注册用户', ...c } });
  ok('同邮箱重新注册成功', r.code === 0, JSON.stringify(r));

  // 4. 新账号登录正常、非注销态
  c = await cap();
  const lr = await j('/auth/login', { method: 'POST', body: { email, password: 'newpass123', ...c } });
  ok('重新注册后可正常登录', lr.code === 0 && lr.data && lr.data.user && !lr.data.user.userDeleted, JSON.stringify(lr).slice(0, 150));

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
