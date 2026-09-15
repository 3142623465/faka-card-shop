const B = 'http://localhost:3000';
async function api(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(B + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
async function cap() { const r = await api('GET', '/api/auth/captcha'); return { t: r.j.data.token, c: r.j.data.devCode }; }
(async () => {
  const c0 = await cap();
  const al = await api('POST', '/api/auth/login', { account: 'admin', password: 'admin123', captchaToken: c0.t, captchaCode: c0.c });
  console.log('admin login', JSON.stringify(al).slice(0, 120));
  const at = al.j.data.token;
  const ts = Date.now();
  const email = 'zz' + ts + '@t.com';
  const c1 = await cap();
  const snd = await api('POST', '/api/auth/send-email-code', { email, scene: 'register', captchaToken: c1.t, captchaCode: c1.c });
  console.log('send', JSON.stringify(snd));
  const c2 = await cap();
  const reg = await api('POST', '/api/auth/register-email', { email, code: snd.j.data.devCode, password: 'pass1234', captchaToken: c2.t, captchaCode: c2.c });
  console.log('reg', JSON.stringify(reg));
  const ut = reg.j.data.token || (reg.j.data.user && reg.j.data.user.token);
  const me = await api('GET', '/api/auth/me', null, ut);
  const uid = me.j.data.user.id;
  const chg = await api('PUT', '/api/admin/users/' + uid + '/balance', { delta: 100 }, at);
  console.log('recharge', JSON.stringify(chg));
  const st = await api('GET', '/api/admin/stats', null, at);
  console.log('stats after recharge', JSON.stringify(st).slice(0, 80));
  const r = await api('POST', '/api/admin/branches', { name: 'HH', username: 'hh' + ts, password: 'norm1234', type: 'normal' }, at);
  console.log('create', JSON.stringify(r));
  const bid = r.j.data.id;
  await api('PUT', '/api/admin/branches/' + bid + '/balance', { amount: 100, desc: '充值' }, at);
  const c3 = await cap();
  const login = await api('POST', '/api/branch/login', { username: 'hh' + ts, password: 'norm1234', captchaToken: c3.t, captchaCode: c3.c });
  console.log('branch login', JSON.stringify(login));
  const bt = login.j.data.token;
  const up = await api('PUT', '/api/branch/upgrade', {}, bt);
  console.log('upgrade', JSON.stringify(up));
  const meB = await api('GET', '/api/branch/me', null, bt);
  console.log('me', JSON.stringify(meB.data));
  const stats = await api('GET', '/api/admin/stats', null, at);
  console.log('income', stats.data.platformIncome);
})().catch((e) => { console.error(e); process.exit(1); });
