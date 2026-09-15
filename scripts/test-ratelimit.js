/* 验证码自动刷新 + 频繁操作拦截测试 v2（随机账号避免锁残留） */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra ? JSON.stringify(extra).slice(0, 200) : ''); } }
async function getCaptcha() { return (await fetch(BASE + '/auth/captcha').then((x) => x.json())).data; }
const R = Date.now() % 1000000;

(async () => {
  // 1. 密码登录：连续 5 次错误 → 第 5 次提示操作频繁（每次取新图形码）
  console.log('— 密码登录频繁拦截 —');
  const acc = 'rl' + R + '@test.com';
  for (let i = 1; i <= 6; i++) {
    const cap = await getCaptcha();
    const r = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: acc, password: 'wrong' + i, captchaToken: cap.token, captchaCode: cap.devCode }) }).then((x) => x.json());
    console.log(`  第${i}次: ${r.msg}`);
    if (i === 4) ok('前4次为账号或密码错误', r.msg === '账号或密码错误', r);
    if (i === 5) ok('第5次提示操作频繁', /操作频繁/.test(r.msg), r);
    if (i === 6) ok('第6次仍被拦截', /操作频繁/.test(r.msg), r);
  }

  // 2. 验证码登录：验证码错误 5 次 → 拦截
  console.log('— 验证码登录频繁拦截 —');
  const ph = 'rl' + ((R + 7) % 1000000000) + '@test.com';
  for (let i = 1; i <= 6; i++) {
    const r = await fetch(BASE + '/auth/login-email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ph, code: '00000' + i }) }).then((x) => x.json());
    console.log(`  第${i}次: ${r.msg}`);
    if (i === 5) ok('验证码登录第5次拦截', /操作频繁/.test(r.msg), r);
  }

  // 3. 发送验证码：60s 内重复发送 → 发送过于频繁
  console.log('— 发送频率限制 —');
  const ph2 = 'rl' + ((R + 13) % 1000000000) + '@test.com';
  const c1 = await getCaptcha();
  const r1 = await fetch(BASE + '/auth/send-email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ph2, scene: 'login', captchaToken: c1.token, captchaCode: c1.devCode }) }).then((x) => x.json());
  ok('首次发送成功', r1.code === 0, r1);
  const c2 = await getCaptcha();
  const r2 = await fetch(BASE + '/auth/send-email-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ph2, scene: 'login', captchaToken: c2.token, captchaCode: c2.devCode }) }).then((x) => x.json());
  ok('60s 内重发被拦截', /发送过于频繁/.test(r2.msg), r2);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
