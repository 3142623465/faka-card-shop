/* ============================================================
   branch.js - 分站后台（代理商后台）
   超级管理员开通专业分站 → 专业分站登录后可开通/管理普通分站
   ============================================================ */
(function () {
  'use strict';

  // API 为 api.js 的全局词法绑定（不在 window 上）；$、$$、esc、icon、toast 同理；confirm 为浏览器原生

  /* ---------- 分站会话 ---------- */
  function bToken() { return localStorage.getItem('branch_token'); }
  function bAuthed() { return !!bToken(); }
  function bLogout() {
    // BUG-007：通知后端使分站 Token 立即失效，再清本地态
    try {
      const tk = bToken();
      if (tk) fetch('/api/auth/logout', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }
      }).catch(() => {});
    } catch (e) { /* 忽略 */ }
    localStorage.removeItem('branch_token'); bRender();
  }

  /* ---------- 图形验证码（复用 /api/auth/captcha 共享模块） ---------- */
  let captchaToken = '';
  function refreshCaptcha() {
    API.get('/auth/captcha').then((r) => {
      captchaToken = r.token;
      const img = $('#b-cap-img');
      if (img) { img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(r.svg))); }
      const hint = $('#b-cap-dev');
      if (hint) hint.textContent = r.devCode ? '开发码：' + r.devCode : '';
    }).catch(() => {});
  }
  function captchaPayload() { return { captchaToken, captchaCode: $('#b-cap').value.trim() }; }

  /* ---------- 登录视图 ---------- */
  function bLoginView() {
    const root = $('#branch-root');
    root.innerHTML = `
      <div class="branch-login-wrap">
        <div class="branch-login-card">
          <div class="bl-logo"><img src="/img/logo.svg" alt=""><h2>分站后台</h2><p id="b-site-name">代理商管理系统</p></div>
          <div class="form-item"><label>分站账号</label><input class="input" id="b-user" placeholder="请输入分站登录账号" autocomplete="username"></div>
          <div class="form-item"><label>登录密码</label><input class="input" id="b-pwd" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
          <div class="form-item"><label>图形验证码</label>
            <div class="cap-row">
              <input class="input" id="b-cap" maxlength="4" placeholder="验证码" autocomplete="off">
              <img id="b-cap-img" alt="验证码" title="点击刷新">
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="b-login" style="width:100%">登 录</button>
          <div class="text-center text-3 text-sm" style="margin-top:14px"><a href="/index.html" style="color:var(--primary)">← 返回前台</a></div>
        </div>
      </div>`;
    refreshCaptcha();
    $('#b-cap-img').addEventListener('click', refreshCaptcha);
    // 验证码自动刷新：60 秒自动更换并清空输入
    setInterval(() => {
      if (document.body.contains($('#b-cap-img'))) {
        const inp = $('#b-cap');
        if (inp) inp.value = '';
        refreshCaptcha();
      }
    }, 60000);
    API.get('/shop/site').then((r) => {
      const el = $('#b-site-name');
      if (el) el.textContent = (r.siteName ? r.siteName + ' · ' : '') + '代理商管理系统';
    }).catch(() => {});
    $('#b-login').addEventListener('click', async () => {
      const username = $('#b-user').value.trim();
      const password = $('#b-pwd').value;
      if (!username || !password) return toast('请输入账号和密码', 'error');
      if (!captchaToken) return toast('图形验证码未加载，请点击图片刷新', 'error');
      try {
        const data = await API.post('/branch/login', { username, password, ...captchaPayload() });
        localStorage.setItem('branch_token', data.token);
        toast('登录成功', 'success');
        bRender();
      } catch (e) {
        toast(e.message, 'error');
        refreshCaptcha();
      }
    });
  }

  /* ---------- 分站后台视图 ---------- */
  let bState = { me: null, children: [] };

  function bLayout(title, content) {
    const me = bState.me || {};
    const isPro = me.type === 'pro';
    return `
      <div class="admin-app">
        <aside class="admin-sidebar">
          <div class="as-logo"><img src="/img/logo.svg" alt=""><div><div class="as-name">${esc(me.siteName || '分站后台')}</div><div class="as-sub">${isPro ? '专业分站' : '普通分站'} · ${esc(me.name || '')}</div></div></div>
          <nav>
            <div class="nav-group">分站</div>
            <div class="nav-item ${location.hash === '#/overview' || !location.hash ? 'active' : ''}" data-goto="#/overview">${icon('chart', 18)}数据概览</div>
            <div class="nav-item ${location.hash === '#/orders' ? 'active' : ''}" data-goto="#/orders">${icon('order', 18)}订单管理</div>
            <div class="nav-item ${location.hash === '#/products' ? 'active' : ''}" data-goto="#/products">${icon('box', 18)}商品管理</div>
            <div class="nav-item ${location.hash === '#/withdraw' ? 'active' : ''}" data-goto="#/withdraw">${icon('wallet', 18)}余额提现</div>
            ${isPro ? `<div class="nav-item ${location.hash === '#/children' ? 'active' : ''}" data-goto="#/children">${icon('branch', 18)}我的分站</div>` : ''}
            <div class="nav-item ${location.hash === '#/password' ? 'active' : ''}" data-goto="#/password">${icon('lock', 18)}修改密码</div>
          </nav>
          <div class="as-foot">${esc(me.username || '')} · <span data-blogout style="cursor:pointer;color:#C7CED9">退出登录</span></div>
        </aside>
        <div class="admin-main">
          <div class="admin-topbar">
            <div class="at-title">${esc(title)}</div>
            <div class="at-right">
              <span>${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span>
              <a class="btn btn-outline btn-sm" href="/index.html" target="_blank">${icon('eye', 14)} 查看前台</a>
            </div>
          </div>
          <div class="admin-content">${content}</div>
        </div>
      </div>`;
  }

  async function bOverview() {
    const me = bState.me;
    const cards = [
      { label: '分站名称', value: me.name, color: '#0F6DFF', icon: 'shield' },
      { label: '分站类型', value: me.type === 'pro' ? '专业分站' : '普通分站', color: me.type === 'pro' ? '#7C3AED' : '#0E9F6E', icon: 'branch' },
      { label: '上级', value: me.parentName || '超级管理员', color: '#D97706', icon: 'star' },
      { label: '下级分站', value: me.childCount + ' 个', color: '#0369A1', icon: 'users' },
      { label: '商品订单', value: (me.orderCount || 0) + ' 笔', color: '#0E9F6E', icon: 'order' },
      { label: '账户余额', value: '¥' + fmtPrice(me.balance || 0), color: '#FF6A00', icon: 'wallet' }
    ];
    const content = `
      <div class="branch-stat">${cards.map((c) => `<div class="bs-card"><div class="lb">${icon(c.icon, 14)} ${c.label}</div><div class="v" style="color:${c.color}">${esc(c.value)}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><span class="am-title">${icon('wallet', 16)} 余额操作</span></div>
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <span class="text-sm text-3">可提现 ¥${fmtPrice(Math.max(0, (me.balance || 0) - (me.pendingWithdraw || 0)))}${(me.pendingWithdraw || 0) > 0 ? '（含处理中 ¥' + fmtPrice(me.pendingWithdraw) + '）' : ''}，商品差价收益实时计入余额，可申请提现。</span>
            <a class="btn btn-primary btn-sm" href="#/withdraw" data-goto="#/withdraw">${icon('wallet', 14)} 申请提现</a>
            <a class="btn btn-outline btn-sm" href="#/orders" data-goto="#/orders">${icon('order', 14)} 订单管理</a>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="am-title">分站说明</span></div>
        <div class="card-body text-2 text-sm" style="line-height:1.8">
          ${me.type === 'pro'
            ? '<p>您是<b>专业分站</b>：可在「我的分站」设置下级价格、分享邀请链接，别人通过你的链接开通分站后，费用直接进入你的账户余额。</p>'
            : '<p>您是<b>普通分站</b>：无下级管理权限，可升级为专业分站后开通下级、获得分销收益。</p>'}
          ${me.type === 'normal' && me.upgradePrice > 0 ? `
          <div style="margin-top:14px;padding:14px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-size:13px;color:#92400E">升级为专业分站：补差价 <b style="color:#FF6A00;font-size:15px">¥${fmtPrice(me.upgradePrice)}</b>（从账户余额扣除）</div>
            <button class="btn btn-primary btn-sm" data-upgrade>${icon('branch', 14)} 立即升级</button>
          </div>` : ''}
        </div>
      </div>`;
    return content;
  }

  async function bChildren() {
    const me = bState.me;
    const list = bState.children;
    let invite = null;
    try { invite = await API.get('/branch/invite-link', { branch: true }); } catch (e) {}
    const inviteUrl = invite ? invite.url : (location.origin + '/index.html#/join?p=' + encodeURIComponent(me.username));
    const content = `
      <div class="branch-invite">
        <b>分销邀请链接</b>：把下面链接发给别人，他们通过链接开通的分站费用将直接进入你的账户余额（当前 ¥${fmtPrice(me.balance || 0)}）
        <div class="bi-link"><span>${esc(inviteUrl)}</span><button class="btn btn-primary btn-sm" data-copy>复制</button></div>
        <div class="text-3 text-xs" style="margin-top:6px">链接带防伪签名，有效期 30 天；对方按链接中的价格（专业 ¥${fmtPrice(me.pricePro)} / 普通 ¥${fmtPrice(me.priceNormal)}）开通</div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><span class="am-title">${icon('setting', 16)} 设置下级分站价格</span><span class="branch-hero-tip">不能低于上级价格（专业 ¥${fmtPrice(me.parentProPrice !== undefined ? me.parentProPrice : 0)} / 普通 ¥${fmtPrice(me.parentNormalPrice !== undefined ? me.parentNormalPrice : 0)}）</span></div>
        <div class="card-body">
          <div class="form-grid" style="grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
            <div><label>专业分站价格（¥）</label><input class="input" id="p-pro" type="number" min="0" value="${me.pricePro || 0}"></div>
            <div><label>普通分站价格（¥）</label><input class="input" id="p-normal" type="number" min="0" value="${me.priceNormal || 0}"></div>
            <button class="btn btn-primary" id="p-save-price">保存</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="am-title">${icon('users', 16)} 我的下级分站（${list.length}）</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>名称/账号</th><th>类型</th><th>状态</th><th>余额</th><th>开通时间</th><th>操作</th></tr></thead>
            <tbody>${list.length ? list.map((c) => `<tr>
              <td><div class="fw-600">${esc(c.name)}</div><div class="text-3 text-xs">${esc(c.username)}</div></td>
              <td><span class="tag ${c.type === 'pro' ? 'tag-pro' : 'tag-success'}">${c.type === 'pro' ? '专业分站' : '普通分站'}</span></td>
              <td>${c.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-danger">停用</span>'}</td>
              <td class="fw-600" style="color:#FF6A00">¥${fmtPrice(c.balance || 0)}</td>
              <td>${new Date(c.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-cstatus="${c.id}">${c.status === 1 ? '停用' : '启用'}</button>
                <button class="btn btn-sm btn-outline-danger" data-cdel="${c.id}">${icon('trash', 14)}</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:28px"><div class="text-3">暂无下级分站</div><div class="text-xs text-3" style="margin-top:6px">分享上方邀请链接，别人开通后自动成为你的下级</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    return content;
  }

  async function bProducts() {
    const me = bState.me;
    let mine = [], catalog = [];
    try { mine = await API.get('/branch/products', { branch: true }); } catch (e) { toast(e.message, 'error'); }
    try { catalog = await API.get('/branch/catalog', { branch: true }); } catch (e) {}
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><span class="am-title">${icon('plus', 16)} 上架总站商品</span><span class="branch-hero-tip">售价不能低于上级同款价格，层层生效</span></div>
        <div class="card-body">
          <div class="form-grid" style="grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
            <div><label>选择总站商品</label><select class="input" id="bp-cat"><option value="">请选择</option>${catalog.map((p) => `<option value="${p.id}" data-price="${p.price}">${esc(p.name)}（¥${fmtPrice(p.price)}）</option>`).join('')}</select></div>
            <div><label>售价（¥，留空默认总站价）</label><input class="input" id="bp-price" type="number" min="0" step="0.01" placeholder="不填默认总站价"></div>
            <button class="btn btn-primary" id="bp-add">${icon('plus', 14)} 上架</button>
          </div>
          ${!catalog.length ? '<div class="text-3 text-sm" style="margin-top:8px">总站暂无可上架商品</div>' : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="am-title">${icon('box', 16)} 我的商品（${mine.length}）</span><button class="btn btn-outline btn-sm" id="bp-sync">${icon('refresh', 14)} 同步总站信息</button></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>商品</th><th>售价</th><th>下限价</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>${mine.length ? mine.map((p) => `<tr>
              <td><div class="fw-600">${esc(p.name)}</div><div class="text-3 text-xs">${esc(p.subtitle || '')}</div></td>
              <td><input class="input" id="bp-price-${p.id}" type="number" min="0" step="0.01" value="${p.price}" style="width:96px"></td>
              <td class="text-sm text-3">¥${fmtPrice(p.floor !== null && p.floor !== undefined ? p.floor : 0)}</td>
              <td>${p.stock}</td>
              <td>${p.status === 1 ? '<span class="tag tag-success">在售</span>' : '<span class="tag tag-danger">已下架</span>'}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-saveprice="${p.id}">改价</button>
                <button class="btn btn-sm btn-outline" data-pstatus="${p.id}">${p.status === 1 ? '下架' : '上架'}</button>
                <button class="btn btn-sm btn-outline-danger" data-pdel="${p.id}">${icon('trash', 14)}</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px"><div class="text-3">暂未上架商品，请在上方选择总站商品上架</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function bOrders() {
    const me = bState.me;
    const status = (location.hash.match(/orders\/([a-z]+)/) || [])[1] || 'all';
    const d = await API.get('/branch/orders', { branch: true, params: { status, page: 1, size: 20 } });
    const statusTabs = [['all', '全部'], ['pending', '待付款'], ['paid', '待发货'], ['shipped', '已发货'], ['completed', '已完成'], ['cancelled', '已取消'], ['refunded', '已退款']];
    const tabs = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${statusTabs.map(([k, v]) => `<button class="btn btn-sm ${k === status ? 'btn-primary' : 'btn-outline'}" data-o-status="${k}">${v}</button>`).join('')}</div>`;
    const rows = (d.list || []).map((o) => `<tr>
      <td><div class="fw-600">${esc(o.orderNo)}</div><div class="text-3 text-xs">${new Date(o.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</div></td>
      <td><div class="fw-600">${esc((o.goods || []).map((g) => g.name).join('、').slice(0, 24))}</div><div class="text-3 text-xs">买家：${esc(o.buyerName || '用户')} · 共 ${(o.goods || []).reduce((s, g) => s + g.quantity, 0)} 件</div></td>
      <td class="fw-600" style="color:#FF6A00">¥${fmtPrice(o.payAmount)}</td>
      <td>${o.status === 'pending' ? '<span class="tag tag-warn">待付款</span>' : o.status === 'paid' ? '<span class="tag tag-primary">待发货</span>' : o.status === 'shipped' ? '<span class="tag tag-success">已发货</span>' : o.status === 'completed' ? '<span class="tag tag-success">已完成</span>' : o.status === 'cancelled' ? '<span class="tag tag-danger">已取消</span>' : o.status === 'refunded' ? '<span class="tag tag-danger">已退款</span>' : ''}</td>
      <td>
        <button class="btn btn-sm btn-outline" data-o-view="${o.id}">详情</button>
        ${o.status === 'paid' ? `<button class="btn btn-sm btn-primary" data-o-ship="${o.id}">发货</button>` : ''}
      </td>
    </tr>`).join('');
    return `
      <div class="card">
        <div class="card-head"><span class="am-title">${icon('order', 16)} 我的订单（共 ${d.total || 0} 笔）</span><span class="branch-hero-tip">仅统计通过您分站商品产生的订单</span></div>
        <div class="card-body">
          ${tabs}
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>订单号/时间</th><th>商品/买家</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:34px"><div class="text-3">暂无订单</div></td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  async function bWithdraw() {
    const me = bState.me;
    let logs = [];
    let wds = [];
    try { const r = await API.get('/branch/balance-logs', { branch: true, params: { page: 1, size: 20 } }); logs = r.list || []; } catch (e) {}
    try { wds = await API.get('/branch/withdrawals', { branch: true }); } catch (e) {}
    const frozen = (me.pendingWithdraw || 0);
    const avail = Math.max(0, (me.balance || 0) - frozen);
    const wdRows = wds.map((w) => `<tr>
      <td>${new Date(w.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
      <td class="fw-600" style="color:#FF6A00">¥${fmtPrice(w.amount)}</td>
      <td>${esc(w.account)}</td>
      <td>${w.status === 'pending' ? '<span class="tag tag-warn">待审核</span>' : w.status === 'approved' ? '<span class="tag tag-primary">已通过</span>' : w.status === 'paid' ? '<span class="tag tag-success">已打款</span>' : w.status === 'rejected' ? '<span class="tag tag-danger">已驳回</span>' : '<span class="tag tag-danger">已取消</span>'}</td>
      <td class="text-xs text-3">${esc(w.reply || '-')}</td>
      ${w.status === 'pending' ? `<td><button class="btn btn-sm btn-outline-danger" data-wd-cancel="${w.id}">取消</button></td>` : '<td>-</td>'}
    </tr>`).join('');
    const logRows = logs.map((l) => `<tr>
      <td>${new Date(l.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
      <td>${l.type === 'income' ? '<span class="tag tag-success">收入</span>' : l.type === 'expense' || l.type === 'adjust_out' || l.type === 'withdraw' ? '<span class="tag tag-danger">支出</span>' : '<span class="tag tag-warn">冻结/调整</span>'}</td>
      <td class="${l.change > 0 ? 'text-success' : 'text-danger'} fw-600">${l.change > 0 ? '+' : ''}¥${fmtPrice(l.change)}</td>
      <td class="text-sm">${esc(l.desc)}</td>
      <td class="text-xs text-3">余额 ¥${fmtPrice(l.balance)}</td>
    </tr>`).join('');
    return `
      <div class="branch-stat" style="grid-template-columns:repeat(3,1fr)">
        <div class="bs-card"><div class="lb">${icon('wallet', 14)} 账户余额</div><div class="v" style="color:#FF6A00">¥${fmtPrice(me.balance || 0)}</div></div>
        <div class="bs-card"><div class="lb">${icon('lock', 14)} 处理中（冻结）</div><div class="v" style="color:#D97706">¥${fmtPrice(frozen)}</div></div>
        <div class="bs-card"><div class="lb">${icon('check', 14)} 可提现</div><div class="v" style="color:#0E9F6E">¥${fmtPrice(avail)}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><span class="am-title">${icon('wallet', 16)} 申请提现</span><span class="branch-hero-tip">提现需管理员审核，通过后扣除余额并由管理员打款</span></div>
        <div class="card-body">
          <div class="form-grid" style="grid-template-columns:1fr 2fr auto;gap:10px;align-items:end">
            <div><label>提现金额（¥，最低 1 元）</label><input class="input" id="wd-amount" type="number" min="1" step="0.01" placeholder="0.00"></div>
            <div><label>收款方式（支付宝账号 / 银行卡号及开户行）</label><input class="input" id="wd-account" placeholder="如：支付宝 138****8888 或 工行 6222 **** **** 8888"></div>
            <button class="btn btn-primary" id="wd-apply">${icon('wallet', 14)} 提交申请</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><span class="am-title">${icon('order', 16)} 提现记录（${wds.length}）</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>申请时间</th><th>金额</th><th>收款方式</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>${wdRows || '<tr><td colspan="6" style="text-align:center;padding:26px"><div class="text-3">暂无提现记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="am-title">${icon('chart', 16)} 资金流水（最近 ${logs.length} 条）</span><a class="btn btn-outline btn-sm" href="/branch.html#/withdraw" style="display:none"></a></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>时间</th><th>类型</th><th>金额</th><th>说明</th><th>余额</th></tr></thead>
            <tbody>${logRows || '<tr><td colspan="5" style="text-align:center;padding:26px"><div class="text-3">暂无流水记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function bPassword() {
    return `
      <div class="card" style="max-width:520px">
        <div class="card-head"><span class="am-title">修改登录密码</span></div>
        <div class="card-body">
          <div class="form-item"><label>原密码</label><input class="input" id="p-old" type="password"></div>
          <div class="form-item"><label>新密码（至少 4 位）</label><input class="input" id="p-new" type="password"></div>
          <div class="form-item"><label>确认新密码</label><input class="input" id="p-new2" type="password"></div>
          <button class="btn btn-primary" id="p-save">保存</button>
        </div>
      </div>`;
  }

  async function bRender() {
    const root = $('#branch-root');
    if (!bAuthed()) { bLoginView(); return; }
    try {
      bState.me = await API.get('/branch/me', { branch: true });
      if (bState.me.type === 'pro') bState.children = await API.get('/branch/branches', { branch: true });
    } catch (e) {
      if (e && e.code === 401) { bLogout(); return; }
      toast(e.message, 'error');
    }
    const name = (location.hash || '#/overview').replace(/^#\/?/, '').split('/')[0];
    let title = '数据概览', content = '';
    if (name === 'orders') { title = '订单管理'; content = await bOrders(); }
    else if (name === 'children' && bState.me.type === 'pro') { title = '我的分站'; content = await bChildren(); }
    else if (name === 'products') { title = '商品管理'; content = await bProducts(); }
    else if (name === 'withdraw') { title = '余额提现'; content = await bWithdraw(); }
    else if (name === 'password') { title = '修改密码'; content = bPassword(); }
    else { title = '数据概览'; content = await bOverview(); }
    root.innerHTML = bLayout(title, content);

    $$('[data-goto]', root).forEach((el) => el.addEventListener('click', () => { location.hash = el.getAttribute('data-goto'); bRender(); }));
    $$('[data-blogout]', root).forEach((el) => el.addEventListener('click', bLogout));

    if (name === 'orders') {
      $$('[data-o-status]', root).forEach((b) => b.addEventListener('click', () => { location.hash = b.getAttribute('data-o-status') === 'all' ? '#/orders' : '#/orders/' + b.getAttribute('data-o-status'); bRender(); }));
      $$('[data-o-view]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-o-view'));
        try {
          const o = await API.get('/branch/orders/' + id, { branch: true });
          const gRows = (o.goods || []).map((g) => `<tr><td>${esc(g.name)}</td><td>¥${fmtPrice(g.price)}</td><td>${g.quantity}</td><td>¥${fmtPrice(g.price * g.quantity)}</td></tr>`).join('');
          const cardRows = (o.cards || []).map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.secret || '-')}</td></tr>`).join('');
          const modal = document.createElement('div');
          modal.className = 'modal-mask';
          modal.innerHTML = `<div class="modal" style="max-width:640px">
            <div class="modal-head"><span>订单 ${esc(o.orderNo)}</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
            <div class="modal-body">
              <div class="form-card" style="margin-bottom:10px">
                <div style="font-weight:600;margin-bottom:8px">买家信息</div>
                <div class="text-sm" style="line-height:1.9">收货人：${esc(o.address.name)}　电话：${esc(o.address.phone)}<br>地址：${esc((o.address.region || '') + ' ' + (o.address.detail || ''))}${o.buyerEmail ? '<br>邮箱：' + esc(o.buyerEmail) : ''}${o.remark ? '<br>备注：' + esc(o.remark) : ''}</div>
              </div>
              <div class="form-card" style="margin-bottom:10px">
                <div style="font-weight:600;margin-bottom:8px">商品明细（应付 ¥${fmtPrice(o.payAmount)}${o.couponAmount > 0 ? '，优惠 ¥' + fmtPrice(o.couponAmount) : ''}）</div>
                <div class="table-wrap"><table class="table"><thead><tr><th>商品</th><th>单价</th><th>数量</th><th>小计</th></tr></thead><tbody>${gRows}</tbody></table></div>
              </div>
              ${o.cards && o.cards.length ? `<div class="form-card">
                <div style="font-weight:600;margin-bottom:8px">卡密信息（${o.cards.length} 条）</div>
                <div class="table-wrap"><table class="table"><thead><tr><th>卡密</th><th>密码</th></tr></thead><tbody>${cardRows}</tbody></table></div>
              </div>` : ''}
              ${o.status === 'shipped' && o.trackingNo ? `<div class="form-card" style="margin-top:10px"><div class="text-sm">物流：${esc(o.logistics || '')}　单号：${esc(o.trackingNo)}</div></div>` : ''}
            </div>
          </div>`;
          document.body.appendChild(modal);
          modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
        } catch (err) { toast(err.message, 'error'); }
      }));
      $$('[data-o-ship]', root).forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.getAttribute('data-o-ship'));
        const modal = document.createElement('div');
        modal.className = 'modal-mask';
        modal.innerHTML = `<div class="modal" style="max-width:560px">
          <div class="modal-head"><span>订单 #${id} 发货</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
          <div class="modal-body">
            <div class="form-item"><label>卡密内容（每行一条，填了则按卡密发货）</label><textarea class="input" id="ship-cards" rows="6" placeholder="每行一条卡密，可用空格/逗号分隔卡密与密码"></textarea></div>
            <div class="form-item"><label>或 物流单号（填了则按物流发货）</label><input class="input" id="ship-tracking" placeholder="如：SF1234567890"></div>
            <div class="form-item"><label>物流公司（物流发货时可选）</label><input class="input" id="ship-logistics" placeholder="顺丰/中通/圆通…" value="快递"></div>
            <button class="btn btn-primary" id="ship-submit" style="width:100%">确认发货</button>
          </div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
        $('#ship-submit', modal).addEventListener('click', async () => {
          const cards = $('#ship-cards', modal).value;
          const trackingNo = $('#ship-tracking', modal).value.trim();
          const logistics = $('#ship-logistics', modal).value.trim() || '快递';
          if (!cards.trim() && !trackingNo) return toast('请填写卡密内容或物流单号', 'error');
          try {
            await API.post('/branch/orders/' + id + '/ship', { cards, trackingNo, logistics }, { branch: true });
            toast('发货成功', 'success');
            modal.remove();
            bRender();
          } catch (e) { toast(e.message, 'error'); }
        });
      }));
    }
    if (name === 'withdraw') {
      $('#wd-apply', root).addEventListener('click', async () => {
        const amount = Number($('#wd-amount', root).value);
        const account = $('#wd-account', root).value.trim();
        if (!isFinite(amount) || amount <= 0) return toast('请输入正确的提现金额', 'error');
        if (account.length < 4) return toast('请填写收款方式', 'error');
        try {
          await API.post('/branch/withdrawals', { amount, account }, { branch: true });
          toast('提现申请已提交', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      });
      $$('[data-wd-cancel]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-wd-cancel'));
        if (!confirm('确定取消该提现申请？')) return;
        try { await API.post('/branch/withdrawals/' + id + '/cancel', {}, { branch: true }); toast('已取消', 'success'); bRender(); } catch (e) { toast(e.message, 'error'); }
      }));
    }

    if (name === 'children') {
      $$('[data-copy]', root).forEach((b) => b.addEventListener('click', async () => {
        try {
          const link = b.closest('.bi-link').querySelector('span').textContent.trim();
          await navigator.clipboard.writeText(link);
          toast('邀请链接已复制', 'success');
        } catch (e) { toast('复制失败，请手动复制链接', 'error'); }
      }));
      $('#p-save-price', root).addEventListener('click', async () => {
        const pro = Number($('#p-pro', root).value);
        const normal = Number($('#p-normal', root).value);
        if (!isFinite(pro) || pro < 0 || !isFinite(normal) || normal < 0) return toast('价格无效', 'error');
        try {
          await API.put('/branch/price', { pricePro: pro, priceNormal: normal }, { branch: true });
          toast('价格已保存', 'success');
          bRender();
        } catch (err) { toast(err.message, 'error'); }
      });
      $$('[data-cstatus]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-cstatus'));
        const target = b.textContent.trim().includes('启用');
        try { await API.put('/branch/branches/' + id, { status: target ? 1 : 0 }, { branch: true }); toast('已更新', 'success'); bRender(); } catch (err) { toast(err.message, 'error'); }
      }));
      $$('[data-cdel]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-cdel'));
        if (!confirm('确定删除该下级分站？')) return;
        try { await API.del('/branch/branches/' + id, { branch: true }); toast('已删除', 'success'); bRender(); } catch (err) { toast(err.message, 'error'); }
      }));
    }
    if (name === 'overview') {
      $$('[data-upgrade]', root).forEach((b) => b.addEventListener('click', async () => {
        const price = bState.me.upgradePrice || 0;
        if (!confirm('升级为专业分站需补差价 ¥' + fmtPrice(price) + '（从账户余额扣除），确定升级？')) return;
        try {
          await API.put('/branch/upgrade', {}, { branch: true });
          toast('恭喜，已升级为专业分站！', 'success');
          bRender();
        } catch (err) { toast(err.message, 'error'); }
      }));
    }
    if (name === 'products') {
      $('#bp-sync', root).addEventListener('click', async () => {
        try {
          const r = await API.post('/branch/sync-products', {}, { branch: true });
          toast(r.msg || '同步完成', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#bp-add', root).addEventListener('click', async () => {
        const sel = $('#bp-cat', root);
        const sourceId = Number(sel.value);
        if (!sourceId) return toast('请选择要上架的总站商品', 'error');
        const price = $('#bp-price', root).value.trim();
        try {
          await API.post('/branch/products', { sourceId, price: price === '' ? undefined : Number(price) }, { branch: true });
          toast('上架成功', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      });
      $$('[data-saveprice]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-saveprice'));
        const price = Number($('#bp-price-' + id, root).value);
        try {
          await API.put('/branch/products/' + id, { price }, { branch: true });
          toast('价格已更新', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      }));
      $$('[data-pstatus]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-pstatus'));
        const target = b.textContent.trim().includes('上架') ? 1 : 0;
        try {
          await API.put('/branch/products/' + id, { status: target }, { branch: true });
          toast('已更新', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      }));
      $$('[data-pdel]', root).forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-pdel'));
        if (!confirm('确定删除该商品？')) return;
        try {
          await API.del('/branch/products/' + id, { branch: true });
          toast('已删除', 'success');
          bRender();
        } catch (e) { toast(e.message, 'error'); }
      }));
    }
    if (name === 'password') {
      $('#p-save', root).addEventListener('click', async () => {
        const oldPassword = $('#p-old', root).value;
        const np = $('#p-new', root).value;
        const np2 = $('#p-new2', root).value;
        if (np !== np2) return toast('两次输入的新密码不一致', 'error');
        try { await API.put('/branch/password', { oldPassword, newPassword: np }, { branch: true }); toast('密码已修改', 'success'); $('#p-old', root).value = ''; $('#p-new', root).value = ''; $('#p-new2', root).value = ''; } catch (err) { toast(err.message, 'error'); }
      });
    }
  }

  window.addEventListener('hashchange', bRender);
  bRender();
})();
