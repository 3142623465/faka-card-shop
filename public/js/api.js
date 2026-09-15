/**
 * api.js - 前端 API 请求封装
 * 自动携带登录令牌，401 时跳转登录页
 */
const API = (() => {
  function token(admin, branch) {
    if (branch) return localStorage.getItem('branch_token');
    return localStorage.getItem(admin ? 'admin_token' : 'token');
  }

  async function request(path, { method = 'GET', body, admin = false, branch = false, raw = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tk = token(admin, branch);
    if (tk) headers['Authorization'] = 'Bearer ' + tk;
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('网络异常，请确认服务已启动');
    }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('服务器返回异常'); }
    if (j.code !== 0) {
      if (j.code === 401) {
        localStorage.removeItem(branch ? 'branch_token' : (admin ? 'admin_token' : 'token'));
        if (branch) { if (!location.hash.startsWith('#/login')) location.hash = '#/login'; }
        else if (admin) { location.hash = '#/login'; }
        else if (!location.hash.startsWith('#/login')) { location.hash = '#/login'; }
      }
      const err = new Error(j.msg || '请求失败');
      err.code = j.code;
      throw err;
    }
    return j.data;
  }

  return {
    get: (path, opts) => request(path, { ...opts, method: 'GET' }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
    put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
    del: (path, opts) => request(path, { ...opts, method: 'DELETE' })
  };
})();
