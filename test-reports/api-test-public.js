/**
 * 发卡网系统 API 功能测试 - 第一组：公开接口 + 认证模块
 * 输出 JSON 结果到 stdout
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
  const r = await fetch(BASE + path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await r.json(); } catch (e) { json = { parseError: true }; }
  return { status: r.status, json };
}

(async () => {
  // ========== 1. 公开接口 ==========
  let r = await req('GET', '/api/shop/banners');
  check('GET /shop/banners', r.status === 200 && r.json.code === 0 && Array.isArray(r.json.data), JSON.stringify(r.json.data).slice(0, 120));

  r = await req('GET', '/api/shop/categories');
  check('GET /shop/categories', r.status === 200 && r.json.code === 0 && Array.isArray(r.json.data), 'count=' + (r.json.data || []).length);

  r = await req('GET', '/api/shop/products?page=1&size=5');
  check('GET /shop/products 分页', r.status === 200 && r.json.code === 0 && r.json.data.list.length <= 5, 'total=' + (r.json.data && r.json.data.total));

  r = await req('GET', '/api/shop/products?sort=sales');
  check('GET /shop/products 按销量排序', r.status === 200 && r.json.code === 0);
  if (r.json.code === 0 && r.json.data.list.length > 1) {
    const arr = r.json.data.list;
    const okSort = arr.every((p, i) => i === 0 || arr[i - 1].sales >= p.sales);
    check('销量排序降序正确', okSort, arr.slice(0, 3).map(x => x.sales).join(','));
  }

  r = await req('GET', '/api/shop/products?keyword=话费');
  check('GET /shop/products 关键词搜索', r.status === 200 && r.json.code === 0, 'total=' + (r.json.data && r.json.data.total));

  // 商品详情
  const listR = await req('GET', '/api/shop/products?size=1');
  const pid = listR.json.data.list[0].id;
  r = await req('GET', '/api/shop/products/' + pid);
  check('GET /shop/products/:id', r.status === 200 && r.json.code === 0 && r.json.data.id === pid);
  r = await req('GET', '/api/shop/products/999999');
  check('GET /shop/products/:id 不存在', r.json.code === 1, r.json.msg);

  r = await req('GET', '/api/shop/hot-keywords');
  check('GET /shop/hot-keywords', r.status === 200 && r.json.code === 0);

  r = await req('GET', '/api/shop/faqs');
  check('GET /shop/faqs', r.status === 200 && r.json.code === 0, 'count=' + (r.json.data || []).length);

  r = await req('GET', '/api/shop/coupons');
  check('GET /shop/coupons', r.status === 200 && r.json.code === 0 && Array.isArray(r.json.data));

  r = await req('GET', '/api/shop/site');
  check('GET /shop/site', r.status === 200 && r.json.code === 0 && r.json.data.siteName, 'siteName=' + (r.json.data && r.json.data.siteName));

  // ========== 2. 图形验证码 ==========
  r = await req('GET', '/api/auth/captcha');
  check('GET /auth/captcha 返回svg+devCode', r.status === 200 && r.json.code === 0 && r.json.data.svg && r.json.data.devCode);

  // ========== 3. 短信验证码（本地直显） ==========
  r = await req('GET', '/api/auth/captcha');
  const captchaToken = r.json.data.token, captchaCode = r.json.data.devCode;
  const phone = '139' + String(Date.now()).slice(-8);
  r = await req('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken, captchaCode });
  check('POST /auth/send-code 注册场景', r.json.code === 0 && r.json.data.devCode, 'devCode=' + (r.json.data && r.json.data.devCode));
  const regCode = r.json.data.devCode;

  // 验证码错误
  r = await req('POST', '/api/auth/register', { phone, code: '000000', password: 'test123', nickname: '测试用户' });
  check('注册-错误验证码被拒', r.json.code === 1, r.json.msg);

  // 注册
  r = await req('POST', '/api/auth/register', { phone, code: regCode, password: 'test123', nickname: '测试用户' });
  check('POST /auth/register 成功注册', r.json.code === 0 && r.json.data.token, 'user=' + (r.json.data.user && r.json.data.user.nickname));
  const userToken = r.json.data.token;

  // 重复注册
  r = await req('POST', '/api/auth/register', { phone, code: regCode, password: 'test123', nickname: '测试用户2' });
  check('重复注册被拒', r.json.code === 1, r.json.msg);

  // 密码登录
  const cap = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login', { phone, password: 'test123', captchaToken: cap.token, captchaCode: cap.devCode });
  check('POST /auth/login 密码登录', r.json.code === 0 && r.json.data.token, r.json.msg || 'ok');

  // 错误密码登录
  const cap2 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login', { phone, password: 'wrongpass', captchaToken: cap2.token, captchaCode: cap2.devCode });
  check('登录-错误密码被拒', r.json.code === 1, r.json.msg);

  // 验证码登录（自动注册）
  const phone2 = '137' + String(Date.now()).slice(-8);
  const cap3 = (await req('GET', '/api/auth/captcha')).json.data;
  const rSend = await req('POST', '/api/auth/send-code', { phone: phone2, scene: 'login', captchaToken: cap3.token, captchaCode: cap3.devCode });
  const cap4 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login-code', { phone: phone2, code: rSend.json.data.devCode });
  check('POST /auth/login-code 验证码登录自动注册', r.json.code === 0 && r.json.data.token, 'user=' + (r.json.data.user && r.json.data.user.phone));

  // 验证码发送频率限制
  const cap5 = (await req('GET', '/api/auth/captcha')).json.data;
  const rSend2 = await req('POST', '/api/auth/send-code', { phone, scene: 'login', captchaToken: cap5.token, captchaCode: cap5.devCode });
  const cap6 = (await req('GET', '/api/auth/captcha')).json.data;
  const rSend3 = await req('POST', '/api/auth/send-code', { phone, scene: 'login', captchaToken: cap6.token, captchaCode: cap6.devCode });
  check('发送验证码 60 秒限频', rSend2.json.code === 0 && rSend3.json.code === 1, '第2次=' + rSend3.json.msg);

  // 手机号格式校验
  const cap7 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/send-code', { phone: '12345', scene: 'login', captchaToken: cap7.token, captchaCode: cap7.devCode });
  check('手机号格式校验', r.json.code === 1, r.json.msg);

  // 图形验证码错误
  r = await req('POST', '/api/auth/send-code', { phone: '13800138000', scene: 'login', captchaToken: 'bad', captchaCode: '0000' });
  check('图形验证码错误被拒', r.json.code === 1, r.json.msg);

  // ========== 4. /me 与改密 ==========
  r = await req('GET', '/api/auth/me', undefined, userToken);
  check('GET /auth/me', r.json.code === 0 && r.json.data.user.phone === phone, r.json.msg || 'ok');

  // 未登录访问受保护接口
  r = await req('GET', '/api/auth/me');
  check('未登录访问 /me 被拒', r.status === 401, 'status=' + r.status);

  // 改密
  r = await req('PUT', '/api/auth/password', { old: 'test123', next: 'newpass123' }, userToken);
  check('PUT /auth/password 修改密码', r.json.code === 0, r.json.msg);
  const cap8 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login', { phone, password: 'newpass123', captchaToken: cap8.token, captchaCode: cap8.devCode });
  check('新密码可登录', r.json.code === 0, r.json.msg || 'ok');

  // 改密后旧密码不可用
  const cap9 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login', { phone, password: 'test123', captchaToken: cap9.token, captchaCode: cap9.devCode });
  check('旧密码不可登录', r.json.code === 1, r.json.msg);

  // 改密时旧密码错误
  r = await req('PUT', '/api/auth/password', { old: 'wrong', next: 'xxx123456' }, userToken);
  check('改密-原密码错误被拒', r.json.code === 1, r.json.msg);

  // ========== 5. 找回密码（手机验证码） ==========
  // 注：同一手机号 60 秒限频，等待窗口过后再测（rateAllow 内存 Map，服务重启会清空）
  await new Promise(r => setTimeout(r, 70000));
  const cap10 = (await req('GET', '/api/auth/captcha')).json.data;
  const rResetSend = await req('POST', '/api/auth/send-code', { phone, scene: 'reset', captchaToken: cap10.token, captchaCode: cap10.devCode });
  check('send-code reset 场景', rResetSend.json.code === 0, rResetSend.json.msg);
  r = await req('POST', '/api/auth/reset', { phone, code: rResetSend.json.data.devCode, password: 'reset123' });
  check('POST /auth/reset 找回密码', r.json.code === 0, r.json.msg);
  const cap11 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login', { phone, password: 'reset123', captchaToken: cap11.token, captchaCode: cap11.devCode });
  check('重置后新密码可登录', r.json.code === 0, r.json.msg || 'ok');

  // ========== 6. 邮箱注册/登录/找回 ==========
  const email = 'test' + Date.now() + '@example.com';
  const capE1 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/send-email-code', { email, scene: 'register', captchaToken: capE1.token, captchaCode: capE1.devCode });
  check('POST /auth/send-email-code', r.json.code === 0 && r.json.data.devCode, 'devCode=' + (r.json.data && r.json.data.devCode));
  const emailCode = r.json.data.devCode;
  r = await req('POST', '/api/auth/register-email', { email, code: emailCode, password: 'test123' });
  check('POST /auth/register-email', r.json.code === 0 && r.json.data.token, r.json.msg || 'ok');

  // 邮箱验证码登录（同一邮箱 60 秒限频，先等待）
  await new Promise(r => setTimeout(r, 70000));
  const capE2 = (await req('GET', '/api/auth/captcha')).json.data;
  const rEmailSend = await req('POST', '/api/auth/send-email-code', { email, scene: 'login', captchaToken: capE2.token, captchaCode: capE2.devCode });
  const capE3 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/login-email-code', { email, code: rEmailSend.json.data.devCode });
  check('POST /auth/login-email-code', r.json.code === 0 && r.json.data.token, r.json.msg || 'ok');

  // 邮箱重置链接（60 秒限频，先等待）
  await new Promise(r => setTimeout(r, 70000));
  const capE4 = (await req('GET', '/api/auth/captcha')).json.data;
  r = await req('POST', '/api/auth/send-reset-email', { email, captchaToken: capE4.token, captchaCode: capE4.devCode });
  check('POST /auth/send-reset-email', r.json.code === 0 && r.json.data.devLink, 'devLink=' + (r.json.data && r.json.data.devLink));
  const devLink = r.json.data.devLink;
  const tokenMatch = /token=([0-9a-f]+)/.exec(devLink || '');
  if (tokenMatch) {
    r = await req('POST', '/api/auth/reset-email', { token: tokenMatch[1], password: 'email123' });
    check('POST /auth/reset-email 令牌重置', r.json.code === 0, r.json.msg);
    // 令牌用后即焚
    r = await req('POST', '/api/auth/reset-email', { token: tokenMatch[1], password: 'email456' });
    check('重置令牌用后即焚', r.json.code === 1, r.json.msg);
  } else {
    check('POST /auth/reset-email 令牌重置', false, '无法解析 devLink');
  }

  // ========== 7. 第三方登录与绑定 ==========
  r = await req('POST', '/api/auth/third-login', { provider: 'wechat' });
  check('POST /auth/third-login', r.json.code === 0 && r.json.data.needBind === true, r.json.msg || 'ok');
  const thirdToken = r.json.data.token;
  // 未绑定手机时没有手机号
  r = await req('GET', '/api/auth/me', undefined, thirdToken);
  check('第三方用户 needBind 状态', r.json.data.user.needBind === true, JSON.stringify(r.json.data.user).slice(0, 120));

  // 绑定手机（需先发验证码）
  const phone3 = '136' + String(Date.now()).slice(-8);
  const capB1 = (await req('GET', '/api/auth/captcha')).json.data;
  const rBindSend = await req('POST', '/api/auth/send-code', { phone: phone3, scene: 'bind', captchaToken: capB1.token, captchaCode: capB1.devCode });
  r = await req('POST', '/api/auth/bind-phone', { phone: phone3, code: rBindSend.json.data.devCode }, thirdToken);
  check('POST /auth/bind-phone 绑定手机', r.json.code === 0 && r.json.data.user.phone === phone3, r.json.msg || 'ok');

  // 绑定已注册手机号应拒绝
  const capB2 = (await req('GET', '/api/auth/captcha')).json.data;
  const rBindSend2 = await req('POST', '/api/auth/send-code', { phone, scene: 'bind', captchaToken: capB2.token, captchaCode: capB2.devCode });
  r = await req('POST', '/api/auth/bind-phone', { phone, code: rBindSend2.json.data.devCode }, thirdToken);
  check('绑定已注册手机号被拒', r.json.code === 1, r.json.msg);

  // ========== 8. 注销账号 ==========
  const phone4 = '135' + String(Date.now()).slice(-8);
  const capD1 = (await req('GET', '/api/auth/captcha')).json.data;
  const rSend4 = await req('POST', '/api/auth/send-code', { phone: phone4, scene: 'register', captchaToken: capD1.token, captchaCode: capD1.devCode });
  const rReg4 = await req('POST', '/api/auth/register', { phone: phone4, code: rSend4.json.data.devCode, password: 'test123' });
  r = await req('DELETE', '/api/user/account', undefined, rReg4.json.data.token);
  check('DELETE /user/account 注销账号', r.json.code === 0, r.json.msg);
  r = await req('GET', '/api/auth/me', undefined, rReg4.json.data.token);
  check('注销后 token 失效', r.status === 401, 'status=' + r.status);

  // ========== 输出 ==========
  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
