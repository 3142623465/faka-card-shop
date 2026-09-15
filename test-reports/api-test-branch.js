/**
 * 发卡网 API 功能测试 - 第四组：分站/分销模块（开通/加入/登录/商品上架/价格限制/升级）
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
  // 管理员
  const rl = await req('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  const at = rl.json.data.token;

  // 准备：给用户充值余额
  async function newUser() {
    const phone = '15' + String(Date.now()).slice(-9);
    const c = await cap();
    const rs = await req('POST', '/api/auth/send-code', { phone, scene: 'register', captchaToken: c.token, captchaCode: c.devCode });
    const rr = await req('POST', '/api/auth/register', { phone, code: rs.json.data.devCode, password: 'test123' });
    return { phone, token: rr.json.data.token, uid: rr.json.data.user.id };
  }
  const u1 = await newUser();
  // 充值余额 100
  await req('PUT', '/api/admin/users/' + u1.uid + '/balance', { delta: 100, reason: '测试' }, at);

  // ========== 开通一级分站 ==========
  let r = await req('GET', '/api/user/branch-config', undefined, u1.token);
  check('GET /user/branch-config 价格与余额', r.json.code === 0 && r.json.data.balance === 100, JSON.stringify(r.json.data).slice(0, 100));

  // 余额不足
  const u2 = await newUser();
  r = await req('POST', '/api/user/open-branch', { name: '没钱分站', type: 'pro' }, u2.token);
  check('余额不足开通被拒', r.json.code === 1, r.json.msg);

  // 成功开通专业分站
  r = await req('POST', '/api/user/open-branch', { name: '我的专业分站', type: 'pro' }, u1.token);
  check('POST /user/open-branch 开通专业分站', r.json.code === 0, JSON.stringify(r.json.data).slice(0, 120));
  const branchUn = u1.phone;

  // 重复开通
  r = await req('POST', '/api/user/open-branch', { name: '重复分站', type: 'pro' }, u1.token);
  check('重复开通被拒', r.json.code === 1, r.json.msg);

  // 查询我的分站
  r = await req('GET', '/api/user/my-branch', undefined, u1.token);
  check('GET /user/my-branch', r.json.code === 0 && r.json.data.username === branchUn, 'un=' + (r.json.data && r.json.data.username));

  // ========== 分站登录 ==========
  const cLogin = await cap();
  r = await req('POST', '/api/branch/login', { username: branchUn, password: 'test123', captchaToken: cLogin.token, captchaCode: cLogin.devCode });
  check('POST /branch/login 分站账号登录', r.json.code === 0 && r.json.data.role === 'branch', r.json.msg || 'ok');
  const bt = r.json.data.token;

  // 用户 token 访问分站接口（requireBranchOrUser 兼容）
  r = await req('GET', '/api/branch/me', undefined, u1.token);
  check('GET /branch/me 用户token访问', r.json.code === 0 && r.json.data.type === 'pro', r.json.msg || 'ok');

  r = await req('GET', '/api/branch/me', undefined, bt);
  check('GET /branch/me 分站token', r.json.code === 0, r.json.msg || 'ok');

  // 错误密码
  const cErr = await cap();
  r = await req('POST', '/api/branch/login', { username: branchUn, password: 'wrong', captchaToken: cErr.token, captchaCode: cErr.devCode });
  check('分站错误密码被拒', r.json.code === 1, r.json.msg);

  // ========== 分站商品上架 ==========
  // 获取总站商品目录
  r = await req('GET', '/api/branch/catalog', undefined, bt);
  check('GET /branch/catalog 总站商品目录', r.json.code === 0 && r.json.data.length > 0, 'count=' + (r.json.data || []).length);
  const srcProduct = r.json.data[0];

  // 上架（默认价）
  r = await req('POST', '/api/branch/products', { sourceId: srcProduct.id }, bt);
  check('POST /branch/products 上架总站商品', r.json.code === 0, JSON.stringify(r.json.data).slice(0, 100));
  const bpId = r.json.data.id;

  // 低价上架（低于总站价）
  r = await req('POST', '/api/branch/products', { sourceId: srcProduct.id }, bt);
  check('重复上架被拒', r.json.code === 1, r.json.msg);

  // 改价低于总站价被拒
  r = await req('PUT', '/api/branch/products/' + bpId, { price: 0.01 }, bt);
  check('分站商品价格不能低于总站', r.json.code === 1, r.json.msg);

  // 正常改价
  r = await req('PUT', '/api/branch/products/' + bpId, { price: srcProduct.price + 1 }, bt);
  check('PUT /branch/products/:id 正常改价', r.json.code === 0, JSON.stringify(r.json.data).slice(0, 100));

  // 我的商品列表
  r = await req('GET', '/api/branch/products', undefined, bt);
  check('GET /branch/products 我的商品', r.json.code === 0 && r.json.data.length === 1);

  // ========== 分站开设下级（专业分站） ==========
  r = await req('POST', '/api/branch/branches', { name: '我的下级', username: 'sub' + Date.now() % 1000000, password: '1234', note: '测试' }, bt);
  check('POST /branch/branches 专业分站开下级', r.json.code === 0, r.json.msg || JSON.stringify(r.json).slice(0, 100));
  const subId = r.json.data && r.json.data.id;

  r = await req('GET', '/api/branch/branches', undefined, bt);
  check('GET /branch/branches 下级列表', r.json.code === 0 && r.json.data.length === 1);

  // 设置下级价格
  r = await req('PUT', '/api/branch/price', { pricePro: 20, priceNormal: 5 }, bt);
  check('PUT /branch/price 设置下级价格', r.json.code === 0);

  // 停用/启用下级
  r = await req('PUT', '/api/branch/branches/' + subId, { status: 0 }, bt);
  check('PUT /branch/branches/:id 停用下级', r.json.code === 0);
  r = await req('PUT', '/api/branch/branches/' + subId, { status: 1 }, bt);
  check('PUT /branch/branches/:id 启用下级', r.json.code === 0);

  // ========== 加入分站（加入下级） ==========
  // 通过 API 获取下级实际用户名（避免直接读 db.json 的防抖落盘延迟）
  const subList = await req('GET', '/api/branch/branches', undefined, bt);
  const subBranch = subList.json.data.find(x => x.id === subId);
  const u3 = await newUser();
  await req('PUT', '/api/admin/users/' + u3.uid + '/balance', { delta: 50, reason: '测试' }, at);
  r = await req('POST', '/api/user/join-branch', { parent: branchUn, type: 'normal', name: '加入的分站' }, u3.token);
  check('POST /user/join-branch 加入分站', r.json.code === 0, r.json.msg || JSON.stringify(r.json.data).slice(0, 100));

  // 上级余额增加
  r = await req('GET', '/api/branch/me', undefined, bt);
  check('上级分站余额入账', r.json.code === 0 && r.json.data.balance > 0, 'balance=' + (r.json.data && r.json.data.balance));

  // 加入不存在的分站
  r = await req('POST', '/api/user/join-branch', { parent: 'notexist' + Date.now(), type: 'normal', name: 'x' }, u3.token);
  check('加入不存在分站被拒', r.json.code === 1, r.json.msg);

  // ========== 普通分站权限 ==========
  const normalUser = u3;
  const myBranch = await req('GET', '/api/user/my-branch', undefined, u3.token);
  const normalBranch = myBranch.json.data;
  const cN = await cap();
  r = await req('POST', '/api/branch/login', { username: normalBranch.username, password: 'test123', captchaToken: cN.token, captchaCode: cN.devCode });
  const nt = r.json.data.token;
  r = await req('GET', '/api/branch/branches', undefined, nt);
  check('普通分站无下级管理权限', r.json.code === 1, r.json.msg);
  r = await req('POST', '/api/branch/branches', { name: 'x', username: 'y', password: '1234' }, nt);
  check('普通分站不能开下级', r.json.code === 1, r.json.msg);

  // ========== 分站改密码 ==========
  r = await req('PUT', '/api/branch/password', { oldPassword: 'test123', newPassword: '5678' }, bt);
  check('PUT /branch/password 改密', r.json.code === 0, r.json.msg || 'ok');
  r = await req('PUT', '/api/branch/password', { oldPassword: 'wrong', newPassword: '5678' }, bt);
  check('分站改密-原密码错误被拒', r.json.code === 1, r.json.msg);

  // ========== 分站升级 ==========
  // 给普通分站 owner 充值，升级为专业
  await req('PUT', '/api/admin/users/' + u3.uid + '/balance', { delta: 100, reason: '测试' }, at);
  r = await req('PUT', '/api/branch/upgrade', undefined, nt);
  check('PUT /branch/upgrade 普通分站升级', r.json.code === 0, r.json.msg || JSON.stringify(r.json.data).slice(0, 100));

  // 已是专业再升级
  r = await req('PUT', '/api/branch/upgrade', undefined, nt);
  check('已专业分站不可再升级', r.json.code === 1, r.json.msg);

  // ========== 分站商品删除 ==========
  r = await req('DELETE', '/api/branch/products/' + bpId, undefined, bt);
  check('DELETE /branch/products/:id', r.json.code === 0);

  // 删除下级
  r = await req('DELETE', '/api/branch/branches/' + subId, undefined, bt);
  check('DELETE /branch/branches/:id', r.json.code === 0);

  console.log(JSON.stringify({ pass, fail, results }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
