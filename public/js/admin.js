/**
 * admin.js - 发卡网后台管理端（SPA）
 * 路由：#/login #/dashboard #/products #/categories #/orders #/aftersales
 *       #/users #/coupons #/banners #/service #/chat #/messages #/settings
 */
'use strict';

/* ============================================================
   状态与路由
   ============================================================ */
const Admin = {
  username: localStorage.getItem('admin_username') || '',
  siteName: localStorage.getItem('admin_siteName') || '发卡网'
};

const MENU = [
  { group: '概览' },
  { key: 'dashboard', title: '数据概览', icon: 'chart' },
  { group: '商品' },
  { key: 'products', title: '商品管理', icon: 'box' },
  { key: 'categories', title: '分类管理', icon: 'category' },
  { group: '交易' },
  { key: 'orders', title: '订单管理', icon: 'order' },
  { key: 'aftersales', title: '售后管理', icon: 'refresh' },
  { group: '用户' },
  { key: 'users', title: '用户管理', icon: 'users' },
  { group: '分站' },
  { key: 'branches', title: '分站管理', icon: 'branch' },
  { key: 'withdrawals', title: '提现审核', icon: 'wallet' },
  { group: '营销' },
  { key: 'coupons', title: '优惠券', icon: 'ticket' },
  { key: 'banners', title: '轮播图', icon: 'image' },
  { key: 'quicknav', title: '首页快捷入口', icon: 'link' },
  { group: '客服' },
  { key: 'service', title: 'FAQ / 工单', icon: 'service' },
  { key: 'chat', title: '在线对话', icon: 'msg' },
  { key: 'messages', title: '消息通知', icon: 'bell' },
  { group: '系统' },
  { key: 'settings', title: '系统设置', icon: 'setting' }
];

const VIEWS = {
  dashboard: { view: aDashboard, title: '数据概览' },
  products: { view: aProducts, title: '商品管理' },
  categories: { view: aCategories, title: '分类管理' },
  orders: { view: aOrders, title: '订单管理' },
  aftersales: { view: aAftersales, title: '售后管理' },
  users: { view: aUsers, title: '用户管理' },
  branches: { view: aBranches, title: '分站管理' },
  withdrawals: { view: aWithdrawals, title: '提现审核' },
  coupons: { view: aCoupons, title: '优惠券' },
  banners: { view: aBanners, title: '轮播图' },
  quicknav: { view: aQuickNav, title: '首页快捷入口' },
  service: { view: aService, title: 'FAQ / 工单' },
  chat: { view: aChat, title: '在线对话' },
  messages: { view: aMessages, title: '消息通知' },
  settings: { view: aSettings, title: '系统设置' }
};

let chatPoll = null;

function adminToken() { return localStorage.getItem('admin_token'); }
function adminAuthed() { return !!adminToken(); }

async function aRender() {
  if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
  let hash = location.hash || '#/dashboard';
  const name = hash.replace(/^#\/?/, '').split('/')[0] || 'dashboard';

  const main = $('#admin-main');
  if (!adminAuthed()) {
    document.body.className = 'admin-body';
    main.innerHTML = await aLoginView();
    bindLogin();
    return;
  }
  const route = VIEWS[name] || VIEWS.dashboard;
  const [title, html, viewBind] = await route.view();
  document.body.className = 'admin-body';
  main.innerHTML = layout(title, html);
  bindLayout(name);
  try { await (typeof viewBind === 'function' ? viewBind() : Promise.resolve()); } catch (e) { console.error(e); }
  window.scrollTo(0, 0);
}

function layout(title, content) {
  return `
    <div class="admin-app">
      <aside class="admin-sidebar">
        <div class="as-logo"><img src="/img/logo.svg" alt=""><div><div class="as-name">${esc(Admin.siteName)}</div><div class="as-sub">管理后台</div></div></div>
        <nav>
          ${MENU.map((m) => m.group
            ? `<div class="nav-group">${m.group}</div>`
            : `<div class="nav-item ${location.hash.replace(/^#\/?/, '') === m.key ? 'active' : ''}" data-goto="#/${m.key}">${icon(m.icon, 18)}${m.title}</div>`).join('')}
        </nav>
        <div class="as-foot">${esc(Admin.username)} · <span data-logout style="cursor:pointer;color:#C7CED9">退出登录</span></div>
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

function bindLayout(activeKey) {
  const root = $('#admin-main');
  $$('[data-goto]', root).forEach((el) => el.addEventListener('click', () => { location.hash = el.getAttribute('data-goto'); }));
  $('[data-logout]', root).addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    location.hash = '#/login';
    aRender();
  });
}

/* ============================================================
   登录
   ============================================================ */
async function aLoginView() {
  return `<div class="admin-login-wrap">
    <div class="admin-login-card">
      <div class="al-logo"><img src="/img/logo.svg" alt=""><div><div class="al-title">${esc(Admin.siteName)}</div><div class="al-sub">发卡网管理后台</div></div></div>
      <div class="af-item"><label>管理员账号</label><input class="input" id="lg-user" value="" placeholder="请输入账号"></div>
      <div class="af-item"><label>登录密码</label><input class="input" id="lg-pwd" type="password" value="" placeholder="请输入密码"></div>
      <button class="btn btn-primary" id="lg-btn">登 录</button>
    </div>
  </div>`;
}

function bindLogin() {
  const btn = $('#lg-btn');
  const doLogin = async () => {
    const username = $('#lg-user').value.trim();
    const password = $('#lg-pwd').value;
    if (!username || !password) return toast('请输入账号和密码', 'error');
    btn.disabled = true;
    btn.textContent = '登录中...';
    try {
      const r = await API.post('/admin/login', { username, password });
      localStorage.setItem('admin_token', r.token);
      localStorage.setItem('admin_username', r.username);
      localStorage.setItem('admin_siteName', r.siteName);
      Admin.username = r.username;
      Admin.siteName = r.siteName;
      location.hash = '#/dashboard';
      aRender(); // hash 未变化时手动刷新视图
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = '登 录';
    }
  };
  btn.addEventListener('click', doLogin);
  $('#lg-pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

/* ============================================================
   通用：弹窗 / 上传 / 分页
   ============================================================ */
function openModal(title, bodyHtml, footHtml = '', wide = false) {
  const mask = document.createElement('div');
  mask.className = 'admin-modal-mask';
  mask.innerHTML = `<div class="admin-modal ${wide ? 'wide' : ''}">
    <div class="am-head"><span class="am-title">${title}</span><span class="am-close">${icon('close', 20)}</span></div>
    <div class="am-body">${bodyHtml}</div>
    ${footHtml ? `<div class="am-foot">${footHtml}</div>` : ''}
  </div>`;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  $('.am-close', mask).addEventListener('click', close);
  document.body.appendChild(mask);
  return { mask, close, body: $('.am-body', mask) };
}

/** 图片上传组件：返回 {html, getUrls} */
function imgUploader({ value = [], max = 3, single = false } = {}) {
  let urls = single ? (value ? [value] : []) : [...value];
  const boxId = 'iup-' + Math.random().toString(36).slice(2, 8);
  const render = () => {
    const el = document.getElementById(boxId);
    if (!el) return;
    const showAdd = single ? true : urls.length < max;
    el.innerHTML = urls.map((u) => `<div class="iup"><img src="${esc(u)}" alt=""><span class="rm" data-rm="${esc(u)}">${icon('close', 12)}</span></div>`).join('')
      + (showAdd ? `<div class="img-add-btn" data-add>${single && urls.length ? icon('refresh', 20) : icon('upload', 20)}<span class="img-add-text">${single && urls.length ? '替换' : '上传'}</span></div>` : '');
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => {
      urls = urls.filter((u) => u !== b.getAttribute('data-rm'));
      render();
    }));
    $('[data-add]', el)?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = String(reader.result).split(',')[1];
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const r = await API.post('/admin/upload', { data, ext }, { admin: true });
            if (single) urls = [];
            urls.push(r.url);
            render();
          } catch (e) { toast(e.message, 'error'); }
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  };
  return {
    html: `<div class="img-upload-preview" id="${boxId}"></div>`,
    mount: render,
    getUrls: () => (single ? (urls[0] || '') : urls)
  };
}

function pagerHtml(page, pages, total) {
  return `<div class="pager">
    <span>共 ${total} 条</span>
    <button data-pg="prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
    <span>${page} / ${pages || 1}</span>
    <button data-pg="next" ${page >= pages ? 'disabled' : ''}>下一页</button>
  </div>`;
}
function bindPager(root, cb) {
  $$('[data-pg]', root).forEach((b) => b.addEventListener('click', () => cb(b.getAttribute('data-pg') === 'prev' ? -1 : 1)));
}

const ORDER_STATUS_MAP = {
  pending: ['待付款', 'tag-warning'], pending_confirm: ['待确认收款', 'tag-purple'], paid: ['待发货', 'tag-info'],
  shipped: ['待收货', 'tag-primary'], completed: ['已完成', 'tag-success'],
  cancelled: ['已取消', 'tag-gray'], refunded: ['已退款', 'tag-danger']
};

/* ============================================================
   数据概览
   ============================================================ */
async function aDashboard() {
  const s = await API.get('/admin/stats', { admin: true });
  const cards = [
    { label: '今日销售额', value: '¥' + fmtPrice(s.todaySales), icon: 'wallet', color: '#FF6A00', goto: '#/orders' },
    { label: '今日订单', value: s.todayOrders, icon: 'order', color: '#0F6DFF', goto: '#/orders' },
    { label: '总销售额', value: '¥' + fmtPrice(s.totalSales), icon: 'chart', color: '#12A150', goto: '#/orders' },
    { label: '总订单数', value: s.totalOrders, icon: 'file', color: '#7C3AED', goto: '#/orders' },
    { label: '注册用户', value: s.totalUsers, icon: 'users', color: '#0E9F6E', goto: '#/users' },
    { label: '在售商品', value: s.totalProducts, icon: 'box', color: '#D97706', goto: '#/products' },
    { label: '库存卡密', value: s.totalCards, icon: 'gift', color: '#0369A1', goto: '#/products' },
    { label: '待办处理', value: (s.pendingOrders || 0) + (s.pendingAftersales || 0), icon: 'bell', color: '#E5484D', goto: (s.pendingAftersales || 0) > 0 ? '#/aftersales' : '#/orders' }
  ];
  const chartSvg = trendSvg(s.trend);
  return [
    '数据概览',
    `
    <div class="stat-grid">
      ${cards.map((c) => `<div class="stat-card" data-goto="${c.goto}" style="cursor:pointer" title="点击查看${c.label}">
        <span class="sc-icon" style="background:${c.color}">${icon(c.icon, 20)}</span>
        <div class="sc-label">${c.label}</div>
        <div class="sc-value">${c.value}</div>
      </div>`).join('')}
    </div>
    <div class="panel">
      <div class="panel-head"><span class="ph-title">近 7 天销售趋势</span><span class="trend-legend"><span><i class="dot" style="background:var(--primary)"></i>销售额（元）</span><span><i class="dot" style="background:#94A3B8"></i>订单数</span></span></div>
      <div class="panel-body">${chartSvg}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="panel">
        <div class="panel-head"><span class="ph-title">热销商品 TOP5</span></div>
        <table class="table">
          <thead><tr><th>商品</th><th>销量</th></tr></thead>
          <tbody>${s.topProducts.length ? s.topProducts.map((p) => `<tr><td><div style="display:flex;align-items:center;gap:10px"><img class="t-img" src="${esc(p.image || '/img/placeholder.svg')}" onerror="imgFallback(event)" alt=""><span>${esc(p.name)}</span></div></td><td class="fw-600">${p.qty} 件</td></tr>`).join('') : '<tr><td colspan="2" class="text-3" style="text-align:center;padding:24px">暂无销售数据</td></tr>'}</tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-head"><span class="ph-title">库存预警（&lt;10）</span><a style="font-size:12px;color:var(--text-3)" href="#/products">去补卡密 →</a></div>
        <table class="table">
          <thead><tr><th>商品</th><th>库存</th></tr></thead>
          <tbody>${s.lowStock.length ? s.lowStock.map((p) => `<tr><td>${esc(p.name)}</td><td><span class="tag ${p.stock === 0 ? 'tag-danger' : 'tag-warning'}">${p.stock} 件</span></td></tr>`).join('') : '<tr><td colspan="2" class="text-3" style="text-align:center;padding:24px">库存充足</td></tr>'}</tbody>
        </table>
      </div>
    </div>`
  ];
}

function trendSvg(trend) {
  const W = 860, H = 200, PL = 40, PR = 16, PT = 16, PB = 34;
  const maxV = Math.max(1, ...trend.map((t) => t.amount));
  const iw = W - PL - PR;
  const x = (i) => PL + (trend.length === 1 ? iw / 2 : i * iw / (trend.length - 1));
  const y = (v) => H - PB - (v / maxV) * (H - PT - PB);
  const pts = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.amount).toFixed(1)}`);
  const area = `M${PL},${H - PB} L${pts.join(' L')} L${x(trend.length - 1)},${H - PB} Z`;
  return `<svg class="trend-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${[0.25, 0.5, 0.75, 1].map((r) => `<line x1="${PL}" y1="${(H - PB - (H - PT - PB) * r).toFixed(0)}" x2="${W - PR}" y2="${(H - PB - (H - PT - PB) * r).toFixed(0)}" stroke="#ECEEF2" stroke-width="1"/>`).join('')}
    <path d="${area}" fill="#FF6A00" opacity="0.08"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="#FF6A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${trend.map((t, i) => `<g><circle cx="${x(i)}" cy="${y(t.amount)}" r="3.5" fill="#fff" stroke="#FF6A00" stroke-width="2"/><text x="${x(i)}" y="${y(t.amount) - 10}" text-anchor="middle" font-size="11" fill="#6B7280">${fmtPrice(t.amount)}</text></g>`).join('')}
    ${trend.map((t, i) => `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#9AA3AF">${t.date}</text>`).join('')}
  </svg>`;
}

/* ============================================================
   商品管理
   ============================================================ */
async function aProducts() {
  let page = 1, keyword = '', categoryId = '';
  const cats = await API.get('/admin/categories', { admin: true }).catch(() => []);
  const flatCats = [];
  cats.forEach((c) => { flatCats.push(c); (c.children || []).forEach((x) => flatCats.push({ ...x, parentName: c.name })); });

  const load = async () => {
    const box = $('#p-box');
    box.innerHTML = '<div class="load-more">加载中...</div>';
    let url = '/admin/products?page=' + page + '&size=10';
    if (keyword) url += '&keyword=' + encodeURIComponent(keyword);
    if (categoryId) url += '&categoryId=' + categoryId;
    const r = await API.get(url, { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>商品</th><th>分类</th><th>价格</th><th>库存</th><th>销量</th><th>类型</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${r.list.map((p) => `
            <tr>
              <td><div style="display:flex;align-items:center;gap:10px"><img class="t-img" src="${esc((p.images || ['/img/placeholder.svg'])[0])}" onerror="imgFallback(event)" alt=""><div><div style="font-weight:500">${esc(p.name)}</div><div class="text-3 text-xs">${esc(p.subtitle || '')}</div></div></div></td>
              <td>${esc(p.categoryName || '-')}</td>
              <td class="price">¥${fmtPrice(p.price)}</td>
              <td><span class="tag ${p.stock === 0 ? 'tag-danger' : p.stock < 10 ? 'tag-warning' : 'tag-success'}">${p.stock}</span></td>
              <td>${p.sales || 0}</td>
              <td>${p.type === 'auto' ? '<span class="tag tag-primary">自动发</span>' : '<span class="tag tag-gray">手动</span>'}</td>
              <td><label class="toggle"><input type="checkbox" data-status="${p.id}" ${p.status === 1 ? 'checked' : ''}><i></i></label></td>
              <td><div class="t-actions">
                <button class="btn btn-sm btn-outline" data-edit="${p.id}">编辑</button>
                ${p.type === 'auto' ? `<button class="btn btn-sm btn-primary" data-cards="${p.id}">卡密(${p.cardCount})</button>` : ''}
                <button class="btn btn-sm btn-plain" data-del="${p.id}">删除</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${pagerHtml(r.page, r.pages, r.total)}`;
    $$('[data-status]', box).forEach((t) => t.addEventListener('change', async () => {
      try { await API.put('/admin/products/' + t.getAttribute('data-status'), { status: t.checked ? 1 : 0 }, { admin: true }); toast(t.checked ? '已上架' : '已下架', 'success'); }
      catch (e) { toast(e.message, 'error'); t.checked = !t.checked; }
    }));
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => productModal(r.list.find((x) => x.id === Number(b.getAttribute('data-edit'))))));
    $$('[data-cards]', box).forEach((b) => b.addEventListener('click', () => cardsModal(r.list.find((x) => x.id === Number(b.getAttribute('data-cards'))))));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await dialog({ title: '删除商品', text: '确定删除该商品？历史订单不受影响（保留商品快照与已发货卡密），该商品未使用的卡密、购物车与收藏将被清理。', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { const rr = await API.del('/admin/products/' + b.getAttribute('data-del'), { admin: true }); toast(rr && rr.historyOrders ? '已删除（保留 ' + rr.historyOrders + ' 条历史订单）' : '已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    bindPager(box, (d) => { page += d; load(); });
  };

  function productModal(p) {
    const isEdit = !!p;
    const up = imgUploader({ value: p ? p.images : [], max: 5 });
    const stockText = (p && p.type === 'auto')
      ? `<div class="af-item" id="pf-stock-wrap"><label>当前库存</label><div class="input" style="background:#F7F8FA;display:flex;align-items:center;justify-content:space-between">${p.stock || 0} 条卡密${isEdit ? `<a href="javascript:;" id="pf-gocards" style="color:var(--primary);font-size:13px">卡密管理</a>` : ''}</div></div>`
      : `<div class="af-item" id="pf-stock-wrap"><label>库存（手动发货商品）</label><input class="input" id="pf-stock" type="number" min="0" value="${p ? p.stock || 0 : 0}"></div>`;
    const { close, body, mask } = openModal(isEdit ? '编辑商品' : '新增商品', `
      <div class="admin-form-grid">
        <div class="af-item full"><label>商品名称 *</label><input class="input" id="pf-name" value="${esc(p ? p.name : '')}"></div>
        <div class="af-item full"><label>副标题</label><input class="input" id="pf-sub" value="${esc(p ? p.subtitle || '' : '')}"></div>
        <div class="af-item"><label>所属分类 *</label><select id="pf-cat"><option value="">请选择分类</option>${flatCats.map((c) => `<option value="${c.id}" ${p && p.categoryId === c.id ? 'selected' : ''}>${esc(c.parentName ? c.parentName + ' / ' + c.name : c.name)}</option>`).join('')}</select></div>
        <div class="af-item"><label>发货类型 *</label><select id="pf-type"><option value="auto" ${!p || p.type === 'auto' ? 'selected' : ''}>自动发货（卡密）</option><option value="manual" ${p && p.type === 'manual' ? 'selected' : ''}>手动发货</option></select></div>
        <div class="af-item"><label>售价（元）*</label><input class="input" id="pf-price" type="number" step="0.01" min="0" value="${p ? p.price : ''}"></div>
        <div class="af-item"><label>划线价（元）</label><input class="input" id="pf-oprice" type="number" step="0.01" min="0" value="${p ? p.originalPrice || '' : ''}"></div>
        ${stockText}
        <div class="af-item"><label>排序</label><input class="input" id="pf-sort" type="number" value="${p ? p.sort || 0 : 0}"></div>
        <div class="af-item full"><label>商品图片（最多5张）</label>${up.html}</div>
        <div class="af-item full"><label>搜索关键词（逗号分隔）</label><input class="input" id="pf-kw" value="${esc(p ? p.keywords || '' : '')}"></div>
        <div class="af-item full"><label>商品详情</label><textarea class="input" id="pf-detail" rows="4">${esc(p ? p.detail || '' : '')}</textarea></div>
        <div id="auto-config" class="full">
          <div class="admin-form-grid" style="grid-column:1/-1;padding:12px;background:#F7F8FA;border-radius:8px">
            <div class="af-item full"><label>批量添加卡密（每行一条，库存将自动按行数计入；支持 CODE 或 CODE----SECRET）</label><textarea class="input" id="pf-cards" rows="5" placeholder="WZ1234ABCD5678----sEcRet999&#10;WZ2234ABCD5678"></textarea></div>
            <div class="af-item full"><label>卡密说明（展示给买家）</label><input class="input" id="pf-cardnote" value="${esc(p ? p.cardNote || '' : '')}" placeholder="如：卡密为兑换码，需在官网兑换"></div>
            <div class="af-item"><label>卡密前缀</label><input class="input" id="pf-prefix" value="${esc(p ? p.cardPrefix || '' : '')}"></div>
            <div class="af-item"><label>卡密长度</label><input class="input" id="pf-codelen" type="number" value="${p ? p.cardCodeLen || 16 : 16}"></div>
            <div class="af-item"><label>密码长度</label><input class="input" id="pf-seclen" type="number" value="${p ? p.cardSecretLen || 8 : 8}"></div>
            <div class="af-item full"><label>卡密字符集</label><select id="pf-charset"><option value="alnum" ${!p || p.cardCharset === 'alnum' ? 'selected' : ''}>大写字母+数字</option><option value="num" ${p && p.cardCharset === 'num' ? 'selected' : ''}>纯数字</option></select></div>
          </div>
        </div>
        <div class="af-item"><label><span class="checkbox round-s ${p && p.isHot ? 'checked' : ''}" id="pf-hot">${icon('check', 12)}</span> 热门推荐</label></div>
        <div class="af-item"><label><span class="checkbox round-s ${!p || p.status === 1 ? 'checked' : ''}" id="pf-status">${icon('check', 12)}</span> 上架销售</label></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('#pf-gocards', mask)?.addEventListener('click', () => { close(); cardsModal(p); });
    const refreshTypeUi = () => {
      const t = $('#pf-type', body).value;
      $('#auto-config', body).style.display = t === 'auto' ? '' : 'none';
      const wrap = $('#pf-stock-wrap', body);
      if (wrap && t === 'auto') {
        wrap.innerHTML = `<label>当前库存</label><div class="input" style="background:#F7F8FA;display:flex;align-items:center;justify-content:space-between">${p ? (p.stock || 0) : 0} 条卡密（下方粘贴卡密自动入库）${isEdit ? `<a href="javascript:;" id="pf-gocards" style="color:var(--primary);font-size:13px">卡密管理</a>` : ''}</div>`;
        $('#pf-gocards', body)?.addEventListener('click', () => { close(); cardsModal(p); });
      } else if (wrap && t === 'manual') {
        wrap.innerHTML = `<label>库存（手动发货商品）</label><input class="input" id="pf-stock" type="number" min="0" value="${p ? p.stock || 0 : 0}">`;
      }
    };
    $('#pf-type', mask).addEventListener('change', refreshTypeUi);
    refreshTypeUi();
    $('#pf-hot', mask).addEventListener('click', function () { this.classList.toggle('checked'); });
    $('#pf-status', mask).addEventListener('click', function () { this.classList.toggle('checked'); });
    up.mount();
    $('[data-save]', mask).addEventListener('click', async () => {
      const name = $('#pf-name', body).value.trim();
      const price = parseFloat($('#pf-price', body).value);
      const catId = Number($('#pf-cat', body).value);
      if (!name || isNaN(price)) return toast('请填写商品名称和价格', 'error');
  if (price < 0) return toast('商品价格不能为负数', 'error');
      if (!catId) return toast('请选择分类', 'error');
      const type = $('#pf-type', body).value;
      const data = {
        categoryId: catId,
        name,
        subtitle: $('#pf-sub', body).value.trim(),
        price,
        originalPrice: parseFloat($('#pf-oprice', body).value) || 0,
        images: up.getUrls(),
        type,
        stock: type === 'auto' ? 0 : (parseInt($('#pf-stock', body).value) || 0),
        detail: $('#pf-detail', body).value,
        keywords: $('#pf-kw', body).value.trim(),
        isHot: $('#pf-hot', body).classList.contains('checked'),
        status: $('#pf-status', body).classList.contains('checked') ? 1 : 0,
        sort: parseInt($('#pf-sort', body).value) || 0,
        cardNote: $('#pf-cardnote', body).value.trim(),
        cardPrefix: $('#pf-prefix', body).value.trim(),
        cardCodeLen: parseInt($('#pf-codelen', body).value) || 16,
        cardSecretLen: parseInt($('#pf-seclen', body).value) || 8,
        cardCharset: $('#pf-charset', body).value
      };
      const cardsText = type === 'auto' ? $('#pf-cards', body).value.trim() : '';
      if (cardsText) data.cardsText = cardsText;
      try {
        let res;
        if (isEdit) res = await API.put('/admin/products/' + p.id, data, { admin: true });
        else res = await API.post('/admin/products', data, { admin: true });
        if (res && res.cardsAdd && !res.cardsAdd.ok && res.cardsAdd.msg) toast(res.cardsAdd.msg, 'info');
        toast('已保存', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function cardsModal(p) {
    let status = 'unused', cpage = 1, cpSize = 15;
    const selected = new Set();
    const { close, body } = openModal('卡密管理 - ' + p.name, '<div class="load-more">加载中...</div>', '', true);
    const renderSelected = () => {
      const el = $('#cf-sel-count', body);
      const btn = $('[data-del-selected]', body);
      if (el) el.textContent = selected.size;
      if (btn) btn.disabled = selected.size === 0;
    };
    const loadCards = async () => {
      body.innerHTML = `
        <div class="admin-form-grid" style="grid-column:1/-1;padding:12px;background:#F7F8FA;border-radius:8px;margin-bottom:12px">
          <div class="af-item"><label>批量添加卡密（每行一条，支持 CODE 或 CODE----SECRET 或 CODE,SECRET）</label><textarea class="input" id="cf-text" rows="4" placeholder="WZ1234ABCD5678----sEcRet999&#10;WZ2234ABCD5678"></textarea></div>
          <div class="af-item"><label>自动生成（填前缀和起始编号可生成连续卡号，密钥随机）</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="input" id="cf-prefix" placeholder="前缀，如 WZ3345ABCD" style="width:150px"><input class="input" id="cf-start" type="number" placeholder="起始编号" min="0" style="width:100px"><input class="input" id="cf-count" type="number" value="100" min="1" max="10000" style="width:80px"> <button class="btn btn-sm btn-primary" data-gen>自动生成</button></div></div>
          <div class="af-item" style="grid-column:1/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button class="btn btn-sm btn-primary" data-add>添加卡密</button><button class="btn btn-sm btn-outline" data-import>导入 Excel</button><input type="file" id="cf-file" accept=".xlsx,.xls,.csv" style="display:none"><button class="btn btn-sm btn-outline" data-export>导出 CSV</button><button class="btn btn-sm btn-danger" data-del-selected disabled>删除选中（<span id="cf-sel-count">0</span>）</button><button class="btn btn-sm btn-outline" data-clear-unused>清空未使用</button><span class="text-3 text-sm">当前库存：<b class="text-primary" id="cf-stock">${p.stock}</b> 条未使用</span></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm ${status === 'unused' ? 'btn-primary' : 'btn-plain'}" data-st="unused">未使用</button>
          <button class="btn btn-sm ${status === 'used' ? 'btn-primary' : 'btn-plain'}" data-st="used">已使用</button>
          <button class="btn btn-sm ${status === 'all' ? 'btn-primary' : 'btn-plain'}" data-st="all">全部</button>
        </div>
        <div id="cf-list"></div>`;
      $$('[data-st]', body).forEach((b) => b.addEventListener('click', () => { status = b.getAttribute('data-st'); cpage = 1; loadCards(); }));
      $('[data-add]', body).addEventListener('click', async () => {
        const text = $('#cf-text', body).value;
        if (!text.trim()) return toast('请输入卡密内容', 'error');
        try {
          const r = await API.post('/admin/products/' + p.id + '/cards', { text }, { admin: true });
          toast(r.msg, 'success');
          loadCards();
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('[data-gen]', body).addEventListener('click', async () => {
        const count = parseInt($('#cf-count', body).value) || 100;
        const prefix = ($('#cf-prefix', body)?.value || '').trim();
        const startNo = parseInt($('#cf-start', body)?.value) || 0;
        try {
          const r = await API.post('/admin/products/' + p.id + '/cards', { autoGenerate: true, count, prefix, startNo }, { admin: true });
          toast(r.msg, 'success');
          loadCards();
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
      $('[data-import]', body).addEventListener('click', () => $('#cf-file', body).click());
      $('#cf-file', body).addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) return toast('请选择 .xlsx / .xls / .csv 文件', 'error');
        const fr = new FileReader();
        fr.onload = async () => {
          try {
            const data = String(fr.result).split(',')[1] || '';
            const r = await API.post('/admin/products/' + p.id + '/cards/import', { data, filename: f.name }, { admin: true });
            toast(r.msg, 'success');
            loadCards();
            load();
          } catch (err) { toast(err.message, 'error'); }
        };
        fr.readAsDataURL(f);
        e.target.value = '';
      });
      $('[data-export]', body).addEventListener('click', async () => {
        try {
          const tk = localStorage.getItem('admin_token');
          const resp = await fetch('/api/admin/products/' + p.id + '/cards/export?status=' + status, { headers: { Authorization: 'Bearer ' + tk } });
          if (!resp.ok) throw new Error('导出失败');
          const blob = await resp.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (p.name || '卡密') + '-' + (status === 'all' ? '全部' : status === 'used' ? '已使用' : '未使用') + '.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
          toast('已导出', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      // 删除选中（跨页累计勾选）
      $('[data-del-selected]', body).addEventListener('click', async () => {
        const ids = [...selected];
        if (!ids.length) return;
        if (!await dialog({ title: '批量删除卡密', text: `确定删除选中的 ${ids.length} 条卡密？（已售出的会自动跳过）`, confirmText: '删除', cancelText: '取消', danger: true })) return;
        try {
          const r = await API.post('/admin/cards/batch-delete', { ids }, { admin: true });
          toast(r.msg, 'success');
          selected.clear();
          loadCards();
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
      // 清空当前商品全部未使用卡密
      $('[data-clear-unused]', body).addEventListener('click', async () => {
        if (!await dialog({ title: '清空未使用卡密', text: `确定删除「${p.name}」全部未使用卡密？（已售出的保留）此操作不可恢复！`, confirmText: '清空', cancelText: '取消', danger: true })) return;
        if (!await dialog({ title: '再次确认', text: '请再次确认：将删除全部未使用卡密，库存将清零。', confirmText: '确认清空', cancelText: '取消', danger: true })) return;
        try {
          const r = await API.post('/admin/products/' + p.id + '/cards/clear', { status }, { admin: true });
          toast(r.msg, 'success');
          selected.clear();
          loadCards();
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
      const listBox = $('#cf-list', body);
      const r = await API.get('/admin/products/' + p.id + '/cards?status=' + status + '&page=' + cpage + '&size=' + cpSize, { admin: true });
      // 库存数字实时刷新（取自接口返回的未使用计数，而非打开弹窗时的快照）
      const stockEl = $('#cf-stock', body);
      if (stockEl) stockEl.textContent = r.unused;
      renderSelected();
      listBox.innerHTML = `
        <table class="table">
          <thead><tr><th style="width:36px"><input type="checkbox" id="cf-chk-all" title="全选本页"></th><th>#</th><th>卡号</th><th>密码/密钥</th><th>状态</th><th>售出时间</th><th>操作</th></tr></thead>
          <tbody>${r.list.map((c) => `
            <tr>
              <td><input type="checkbox" class="cf-chk" data-id="${c.id}" ${c.status === 'unused' ? '' : 'disabled'} ${selected.has(c.id) ? 'checked' : ''}></td>
              <td>${c.id}</td>
              <td style="font-family:monospace">${esc(c.code)}</td>
              <td style="font-family:monospace">${esc(c.secret || '-')}</td>
              <td><span class="cell-status ${c.status}"></span>${c.status === 'unused' ? '未使用' : '已使用'}</td>
              <td class="text-3">${c.usedAt ? fmtTime(c.usedAt) : '-'}</td>
              <td>${c.status === 'unused' ? `<button class="btn btn-sm btn-plain" data-delcard="${c.id}">删除</button>` : '-'}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="text-3" style="text-align:center;padding:24px">暂无卡密</td></tr>'}</tbody>
        </table>
        ${pagerHtml(r.page, r.pages, r.total)}`;
      bindPager(listBox, (d) => { cpage += d; loadCards(); });
      // 本页全选
      const chkAll = $('#cf-chk-all', listBox);
      if (chkAll) chkAll.addEventListener('change', () => {
        $$('.cf-chk', listBox).forEach((cb) => {
          if (cb.disabled) return;
          cb.checked = chkAll.checked;
          const id = Number(cb.getAttribute('data-id'));
          if (chkAll.checked) selected.add(id); else selected.delete(id);
        });
        renderSelected();
      });
      // 行勾选
      $$('.cf-chk', listBox).forEach((cb) => cb.addEventListener('change', () => {
        const id = Number(cb.getAttribute('data-id'));
        if (cb.checked) selected.add(id); else selected.delete(id);
        renderSelected();
      }));
      $$('[data-delcard]', listBox).forEach((b) => b.addEventListener('click', async () => {
        if (!await dialog({ title: '删除卡密', text: '确定删除该卡密？', confirmText: '删除', cancelText: '取消', danger: true })) return;
        try { await API.del('/admin/cards/' + b.getAttribute('data-delcard'), { admin: true }); selected.delete(Number(b.getAttribute('data-delcard'))); toast('已删除', 'success'); loadCards(); load(); }
        catch (e) { toast(e.message, 'error'); }
      }));
    };
    loadCards();
  }

  return [
    '商品管理',
    `<div class="panel">
      <div class="panel-tools">
        <input class="input" id="p-kw" placeholder="搜索商品名称" style="width:220px">
        <select id="p-cat"><option value="">全部分类</option>${flatCats.filter((c) => c.parentId).map((c) => `<option value="${c.id}">${esc(c.parentName + ' / ' + c.name)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-outline" data-search>搜索</button>
        <button class="btn btn-sm btn-primary" data-add style="margin-left:auto">+ 新增商品</button>
      </div>
      <div id="p-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => {
      $('#p-kw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { keyword = $('#p-kw').value.trim(); page = 1; load(); } });
      $('[data-search]').addEventListener('click', () => { keyword = $('#p-kw').value.trim(); page = 1; load(); });
      $('#p-cat').addEventListener('change', () => { categoryId = $('#p-cat').value; page = 1; load(); });
      $('[data-add]').addEventListener('click', () => productModal(null));
      load();
    }
  ];
}

/* ============================================================
   分类管理
   ============================================================ */
async function aCategories() {
  const load = async () => {
    const box = $('#c-box');
    const cats = await API.get('/admin/categories', { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>ID</th><th>名称</th><th>类型</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${cats.map((c) => `
            <tr><td>${c.id}</td><td><b>${esc(c.name)}</b></td><td>一级分类</td><td>${c.sort}</td><td>${c.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-gray">停用</span>'}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-edit="${c.id}">编辑</button><button class="btn btn-sm btn-plain" data-del="${c.id}">删除</button></div></td></tr>
            ${(c.children || []).map((x) => `
              <tr><td>${x.id}</td><td style="padding-left:34px">└ ${esc(x.name)}</td><td>二级分类</td><td>${x.sort}</td><td>${x.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-gray">停用</span>'}</td>
                <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-edit="${x.id}">编辑</button><button class="btn btn-sm btn-plain" data-del="${x.id}">删除</button></div></td></tr>`).join('')}
          `).join('')}
        </tbody>
      </table>`;
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => catModal(cats.flatMap((c) => [c, ...(c.children || [])]).find((x) => x.id === Number(b.getAttribute('data-edit'))))));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await dialog({ title: '删除分类', text: '确定删除该分类？', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { await API.del('/admin/categories/' + b.getAttribute('data-del'), { admin: true }); toast('已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };
  function catModal(c) {
    const { close, body, mask } = openModal(c ? '编辑分类' : '新增分类', `
      <div class="admin-form-grid">
        <div class="af-item"><label>分类名称 *</label><input class="input" id="cf-name" value="${esc(c ? c.name : '')}"></div>
        <div class="af-item"><label>上级分类</label><select id="cf-parent"><option value="">一级分类</option>${catsCache.filter((x) => !x.parentId && (!c || x.id !== c.id)).map((x) => `<option value="${x.id}" ${c && c.parentId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="af-item"><label>排序</label><input class="input" id="cf-sort" type="number" value="${c ? c.sort || 0 : 0}"></div>
        <div class="af-item"><label>状态</label><select id="cf-status"><option value="1" ${!c || c.status === 1 ? 'selected' : ''}>启用</option><option value="0" ${c && c.status === 0 ? 'selected' : ''}>停用</option></select></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const name = $('#cf-name', body).value.trim();
      if (!name) return toast('请输入分类名称', 'error');
      const data = { name, parentId: $('#cf-parent', body).value || null, sort: parseInt($('#cf-sort', body).value) || 0, status: $('#cf-status', body).value === '1' ? 1 : 0 };
      try {
        if (c) await API.put('/admin/categories/' + c.id, data, { admin: true });
        else await API.post('/admin/categories', data, { admin: true });
        toast('已保存', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  let catsCache = [];
  return [
    '分类管理',
    `<div class="panel">
      <div class="panel-tools"><button class="btn btn-sm btn-primary" data-add>+ 新增分类</button></div>
      <div id="c-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => {
      catsCache = await API.get('/admin/categories', { admin: true });
      $('[data-add]').addEventListener('click', () => catModal(null));
      load();
    }
  ];
}

/* ============================================================
   订单管理
   ============================================================ */
async function aOrders() {
  let page = 1, status = 'all', keyword = '';
  const load = async () => {
    const box = $('#o-box');
    box.innerHTML = '<div class="load-more">加载中...</div>';
    let url = '/admin/orders?page=' + page + '&size=10&status=' + status;
    if (keyword) url += '&keyword=' + encodeURIComponent(keyword);
    const r = await API.get(url, { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>订单号</th><th>买家</th><th>商品</th><th>金额</th><th>状态</th><th>下单时间</th><th>操作</th></tr></thead>
        <tbody>
          ${r.list.map((o) => {
            const st = ORDER_STATUS_MAP[o.status] || [o.status, 'tag-gray'];
            return `<tr>
              <td style="font-family:monospace">${esc(o.orderNo)}</td>
              <td>${esc(o.userPhone)}</td>
              <td><div class="text-sm" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.goods.map((g) => g.name + '×' + g.quantity).join('、'))}</div></td>
              <td class="price">¥${fmtPrice(o.payAmount)}</td>
              <td><span class="tag ${st[1]}">${st[0]}</span></td>
              <td class="text-3">${fmtTime(o.createdAt)}</td>
              <td><div class="t-actions">
                <button class="btn btn-sm btn-outline" data-view="${o.id}">详情</button>
                ${o.status === 'pending_confirm' ? `<button class="btn btn-sm btn-primary" data-confirm="${o.id}">确认收款</button>` : ''}
                ${o.status === 'paid' ? `<button class="btn btn-sm btn-primary" data-ship="${o.id}">发货</button>` : ''}
                ${['paid', 'shipped'].includes(o.status) ? `<button class="btn btn-sm btn-plain" data-refund="${o.id}">退款</button>` : ''}
                ${['pending', 'pending_confirm', 'cancelled', 'refunded'].includes(o.status) ? `<button class="btn btn-sm btn-plain" data-del="${o.id}" style="color:#E5484D">删除</button>` : ''}
              </div></td></tr>`;
          }).join('') || '<tr><td colspan="7" class="text-3" style="text-align:center;padding:30px">暂无订单</td></tr>'}
        </tbody>
      </table>
      ${pagerHtml(r.page, r.pages, r.total)}`;

    $$('[data-view]', box).forEach((b) => b.addEventListener('click', () => orderDetail(r.list.find((x) => x.id === Number(b.getAttribute('data-view'))))));
    $$('[data-ship]', box).forEach((b) => b.addEventListener('click', () => shipModal(r.list.find((x) => x.id === Number(b.getAttribute('data-ship'))))));
    $$('[data-confirm]', box).forEach((b) => b.addEventListener('click', async () => {
      const o = r.list.find((x) => x.id === Number(b.getAttribute('data-confirm')));
      if (!await dialog({ title: '确认收款', text: '确认订单 ' + o.orderNo + ' 已收到 ¥' + fmtPrice(o.payAmount) + ' ？确认后将自动发卡。', confirmText: '确认收款并发卡', cancelText: '取消' })) return;
      try { await API.post('/admin/orders/' + o.id + '/confirm-pay', {}, { admin: true }); toast('已确认收款，卡密已发送', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-refund]', box).forEach((b) => b.addEventListener('click', async () => {
      const o = r.list.find((x) => x.id === Number(b.getAttribute('data-refund')));
      if (!await dialog({ title: '订单退款', text: '确定对订单 ' + o.orderNo + ' 退款 ¥' + fmtPrice(o.payAmount) + ' 吗？', confirmText: '确认退款', cancelText: '取消', danger: true })) return;
      try { await API.post('/admin/orders/' + o.id + '/refund', { reason: '管理员操作退款' }, { admin: true }); toast('已退款', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      const o = r.list.find((x) => x.id === Number(b.getAttribute('data-del')));
      if (!await dialog({ title: '删除订单', text: '确定删除订单 ' + o.orderNo + ' 吗？删除后不可恢复。', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { await API.del('/admin/orders/' + o.id, { admin: true }); toast('已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    bindPager(box, (d) => { page += d; load(); });
  };

  function orderDetail(o) {
    const { close, body } = openModal('订单详情 - ' + o.orderNo, '<div class="load-more">加载中...</div>', '', true);
    (async () => {
      const full = await API.get('/admin/orders/' + o.id, { admin: true });
      const st = ORDER_STATUS_MAP[full.status] || [full.status, 'tag-gray'];
      body.innerHTML = `
        <div style="margin-bottom:14px"><span class="tag ${st[1]}" style="font-size:14px">${st[0]}</span> <span class="text-3 text-sm">买家：${esc(full.userPhone)}</span></div>
        <div class="detail-rows">
          <div class="dr"><span class="k">订单编号</span><span class="v" style="font-family:monospace">${esc(full.orderNo)}</span></div>
          <div class="dr"><span class="k">下单时间</span><span class="v">${fmtTime(full.createdAt)}</span></div>
          <div class="dr"><span class="k">支付方式</span><span class="v">${full.payMethod === 'wechat' ? '微信支付' : full.payMethod === 'alipay' ? '支付宝' : '未支付'}</span></div>
          ${full.payAt ? `<div class="dr"><span class="k">支付时间</span><span class="v">${fmtTime(full.payAt)}</span></div>` : ''}
          <div class="dr"><span class="k">收货信息</span><span class="v">${esc(full.address ? full.address.name + ' ' + full.address.phone + ' / ' + full.address.region + full.address.detail : '-')}</span></div>
          <div class="dr"><span class="k">商品金额</span><span class="v">¥${fmtPrice(full.goodsAmount)}</span></div>
          ${full.couponAmount > 0 ? `<div class="dr"><span class="k">优惠抵扣</span><span class="v">-¥${fmtPrice(full.couponAmount)}</span></div>` : ''}
          <div class="dr"><span class="k">实付金额</span><span class="v price">¥${fmtPrice(full.payAmount)}</span></div>
          ${full.trackingNo ? `<div class="dr"><span class="k">物流信息</span><span class="v">${esc(full.logistics || '')} ${esc(full.trackingNo)}</span></div>` : ''}
          ${full.cancelReason ? `<div class="dr"><span class="k">取消/退款原因</span><span class="v">${esc(full.cancelReason)}</span></div>` : ''}
          ${full.payProof ? `<div class="dr"><span class="k">付款凭证</span><span class="v"><a href="javascript:;" id="od-view-proof" style="color:var(--primary)">查看截图</a></span></div>` : ''}
        </div>
        <div style="margin-top:14px;font-weight:600;margin-bottom:8px">商品明细</div>
        <table class="table">
          <thead><tr><th>商品</th><th>单价</th><th>数量</th><th>小计</th></tr></thead>
          <tbody>${full.goods.map((g) => `<tr><td>${esc(g.name)}</td><td>¥${fmtPrice(g.price)}</td><td>${g.quantity}</td><td>¥${fmtPrice(g.price * g.quantity)}</td></tr>`).join('')}</tbody>
        </table>
        ${full.cards && full.cards.length ? `
          <div style="margin-top:14px;font-weight:600;margin-bottom:8px">发放卡密（${full.cards.length} 条）</div>
          <table class="table">
            <thead><tr><th>卡号</th><th>密码/密钥</th><th>发放时间</th></tr></thead>
            <tbody>${full.cards.map((c) => `<tr><td style="font-family:monospace">${esc(c.code)}</td><td style="font-family:monospace">${esc(c.secret || '-')}</td><td class="text-3">${fmtTime(c.usedAt)}</td></tr>`).join('')}</tbody>
          </table>` : ''}
        ${full.status === 'pending' ? `
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid #EEF0F4">
            <div style="font-weight:600;margin-bottom:8px">修改订单价格</div>
            <div style="display:flex;gap:10px;align-items:center">
              <input class="input" id="od-price" type="number" step="0.01" value="${full.payAmount}" style="width:160px" placeholder="新金额">
              <button class="btn btn-primary btn-sm" id="od-save-price">保存新价格</button>
              <span class="text-3 text-sm">仅待付款订单可改价，买家会收到通知</span>
            </div>
          </div>` : ''}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #EEF0F4">
          <div style="font-weight:600;margin-bottom:8px">给客户发消息</div>
          <div style="display:flex;gap:10px">
            <input class="input" id="od-msg" placeholder="输入要发送给客户的消息..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="od-send-msg">发送</button>
          </div>
          <div class="text-3 text-sm" style="margin-top:6px">消息会同时发送到客户的站内消息和客服对话中</div>
        </div>`;
      $('#od-send-msg', body).addEventListener('click', async () => {
        const content = $('#od-msg', body).value.trim();
        if (!content) return toast('请输入消息内容', 'error');
        try {
          await API.post('/admin/orders/' + full.id + '/message', { content }, { admin: true });
          toast('已发送给客户', 'success');
          $('#od-msg', body).value = '';
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#od-view-proof', body)?.addEventListener('click', () => {
        const url = full.payProof;
        const { body: pb } = openModal('付款截图', `<div style="display:flex;justify-content:center"><img src="${esc(url)}" onerror="this.outerHTML='<div style=text-align:center;padding:30px;color:#888>图片加载失败：' + escape(this.src) + '</div>'" style="max-width:100%;max-height:70vh;border-radius:10px" alt="付款截图"></div>`);
        pb.addEventListener('click', () => {});
      });
      $('#od-save-price', body)?.addEventListener('click', async () => {
        const price = parseFloat($('#od-price', body).value);
        if (isNaN(price) || price < 0) return toast('请输入正确的金额', 'error');
        try {
          await API.put('/admin/orders/' + full.id + '/price', { payAmount: price }, { admin: true });
          toast('价格已修改', 'success');
          close();
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
    })();
  }

  function shipModal(o) {
    const isVirtual = o.goods && o.goods.every((g) => g.type === 'auto');
    const { close, body, mask } = openModal('订单发货 - ' + o.orderNo, `
      <div class="admin-form-grid">
        ${isVirtual ? `<div class="af-item full"><div class="text-3 text-sm" style="padding:4px 0">虚拟商品（自动发货），无需物流单号，可直接确认发货；如需补发卡密可在下方粘贴。</div></div>`
          : `<div class="af-item"><label>物流公司</label><input class="input" id="sf-log" value="顺丰速运" placeholder="如：顺丰速运 / 中通快递"></div>
             <div class="af-item"><label>物流单号</label><input class="input" id="sf-no" placeholder="请输入快递单号（实体商品必填）"></div>`}
        <div class="af-item full"><label>补发卡密（选填，每行一条）</label><textarea class="input" id="sf-cards" rows="3" placeholder="WZ1234ABCD5678----sEcRet999"></textarea></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>确认发货</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const trackingNo = isVirtual ? '' : $('#sf-no', body).value.trim();
      if (!isVirtual && !trackingNo) return toast('请输入物流单号', 'error');
      try {
        await API.post('/admin/orders/' + o.id + '/ship', {
          trackingNo,
          logistics: isVirtual ? '' : $('#sf-log', body).value.trim(),
          cards: $('#sf-cards', body).value
        }, { admin: true });
        toast('发货成功', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  return [
    '订单管理',
    `<div class="panel">
      <div class="panel-tools">
        <select id="o-status">
          <option value="all">全部状态</option>
          ${Object.entries(ORDER_STATUS_MAP).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}
        </select>
        <input class="input" id="o-kw" placeholder="订单号 / 买家手机号 / 商品名" style="width:240px">
        <button class="btn btn-sm btn-outline" data-search>搜索</button>
        <button class="btn btn-sm btn-primary" data-export>导出 CSV</button>
      </div>
      <div id="o-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => {
      $('#o-status').addEventListener('change', () => { status = $('#o-status').value; page = 1; load(); });
      $('[data-search]').addEventListener('click', () => { keyword = $('#o-kw').value.trim(); page = 1; load(); });
      $('#o-kw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { keyword = $('#o-kw').value.trim(); page = 1; load(); } });
      $('[data-export]').addEventListener('click', async () => {
        let url = '/api/admin/orders/export?status=' + encodeURIComponent(status);
        if (keyword) url += '&keyword=' + encodeURIComponent(keyword);
        try {
          const tk = localStorage.getItem('admin_token');
          const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (tk || '') } });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j && j.msg) || '导出失败'); }
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          toast('订单已导出', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      load();
    }
  ];
}

/* ============================================================
   售后管理
   ============================================================ */
async function aAftersales() {
  let page = 1, status = 'all';
  const load = async () => {
    const box = $('#a-box');
    box.innerHTML = '<div class="load-more">加载中...</div>';
    const r = await API.get('/admin/aftersales?page=' + page + '&size=10&status=' + status, { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>ID</th><th>订单号</th><th>买家</th><th>类型</th><th>金额</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
        <tbody>
          ${r.list.map((a) => `
            <tr>
              <td>${a.id}</td><td style="font-family:monospace">${esc(a.orderNo)}</td><td>${esc(a.userPhone)}</td>
              <td>${a.type === 'refund' ? '仅退款' : '退货退款'}</td><td class="price">¥${fmtPrice(a.amount)}</td>
              <td><span class="tag ${a.status === 'pending' ? 'tag-warning' : a.status === 'approved' ? 'tag-success' : 'tag-gray'}">${a.status === 'pending' ? '待处理' : a.status === 'approved' ? '已同意' : '已驳回'}</span></td>
              <td class="text-3">${fmtTime(a.createdAt)}</td>
              <td><div class="t-actions">
                <button class="btn btn-sm btn-outline" data-view="${a.id}">详情</button>
                ${a.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-ok="${a.id}">同意退款</button><button class="btn btn-sm btn-plain" data-no="${a.id}">驳回</button>` : ''}
              </div></td></tr>`).join('') || '<tr><td colspan="8" class="text-3" style="text-align:center;padding:30px">暂无售后申请</td></tr>'}
        </tbody>
      </table>
      ${pagerHtml(r.page, r.pages, r.total)}`;
    $$('[data-view]', box).forEach((b) => b.addEventListener('click', () => {
      const a = r.list.find((x) => x.id === Number(b.getAttribute('data-view')));
      const { body, mask } = openModal('售后详情 #' + a.id, `
        <div class="detail-rows">
          <div class="dr"><span class="k">订单号</span><span class="v" style="font-family:monospace">${esc(a.orderNo)}</span></div>
          <div class="dr"><span class="k">买家</span><span class="v">${esc(a.userPhone)}</span></div>
          <div class="dr"><span class="k">售后类型</span><span class="v">${a.type === 'refund' ? '仅退款' : '退货退款'}</span></div>
          <div class="dr"><span class="k">申请金额</span><span class="v price">¥${fmtPrice(a.amount)}</span></div>
          <div class="dr"><span class="k">申请原因</span><span class="v">${esc(a.reason)}</span></div>
          ${a.images && a.images.length ? `<div class="dr"><span class="k">凭证图片</span><span class="v"><div style="display:flex;gap:8px">${a.images.map((img) => `<img src="${esc(img)}" style="width:70px;height:70px;border-radius:8px;object-fit:cover" alt="">`).join('')}</div></span></div>` : ''}
          ${a.reply ? `<div class="dr"><span class="k">处理回复</span><span class="v">${esc(a.reply)}</span></div>` : ''}
        </div>
        <div style="margin-top:12px;font-weight:600;margin-bottom:6px">商品</div>
        ${a.goods.map((g) => `<div class="text-sm" style="padding:4px 0">${esc(g.name)} × ${g.quantity}</div>`).join('')}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #EEF0F4">
          <div style="font-weight:600;margin-bottom:8px">给客户发消息</div>
          <div style="display:flex;gap:10px">
            <input class="input" id="af-msg" placeholder="输入要发送给客户的消息..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="af-send-msg">发送</button>
          </div>
          <div class="text-3 text-sm" style="margin-top:6px">消息会同时发送到客户的站内消息和客服对话中</div>
        </div>`, '<button class="btn btn-primary" data-close>关闭</button>');
      $('[data-close]', mask).addEventListener('click', () => mask.remove());
      $('#af-send-msg', body).addEventListener('click', async () => {
        const content = $('#af-msg', body).value.trim();
        if (!content) return toast('请输入消息内容', 'error');
        try {
          await API.post('/admin/aftersales/' + a.id + '/message', { content }, { admin: true });
          toast('已发送给客户', 'success');
          $('#af-msg', body).value = '';
        } catch (e) { toast(e.message, 'error'); }
      });
    }));
    $$('[data-ok]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await dialog({ title: '同意退款', text: '确认同意该售后申请并退款？', confirmText: '同意', cancelText: '取消', danger: true })) return;
      try { await API.post('/admin/aftersales/' + b.getAttribute('data-ok') + '/handle', { action: 'approve' }, { admin: true }); toast('已同意退款', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-no]', box).forEach((b) => b.addEventListener('click', async () => {
      // 先确认，取消则不提交
      const ok = await dialog({ title: '驳回售后', text: '确定要驳回该售后申请吗？', confirmText: '确定驳回', cancelText: '取消' });
      if (!ok) return;
      // 再输入驳回理由；取消输入则放弃
      const reason = prompt('请输入驳回理由：', '不符合退款条件');
      if (reason === null) return;
      try { await API.post('/admin/aftersales/' + b.getAttribute('data-no') + '/handle', { action: 'reject', reply: reason.trim() || '不符合退款条件' }, { admin: true }); toast('已驳回', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    bindPager(box, (d) => { page += d; load(); });
  };
  return [
    '售后管理',
    `<div class="panel">
      <div class="panel-tools">
        <select id="a-status">
          <option value="all">全部</option><option value="pending">待处理</option><option value="approved">已同意</option><option value="rejected">已驳回</option>
        </select>
      </div>
      <div id="a-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => { $('#a-status').addEventListener('change', () => { status = $('#a-status').value; page = 1; load(); }); load(); }
  ];
}

/* ============================================================
   用户管理
   ============================================================ */
async function aUsers() {
  let page = 1, keyword = '';
  const load = async () => {
    const box = $('#u-box');
    box.innerHTML = '<div class="load-more">加载中...</div>';
    let url = '/admin/users?page=' + page + '&size=10';
    if (keyword) url += '&keyword=' + encodeURIComponent(keyword);
    const r = await API.get(url, { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>ID</th><th>用户</th><th>等级</th><th>积分</th><th>余额</th><th>累计消费</th><th>订单数</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
        <tbody>
          ${r.list.map((u) => `
            <tr>
              <td>${u.id}</td>
              <td><div style="display:flex;align-items:center;gap:10px"><img src="${esc(u.avatar)}" onerror="imgFallback(event)" style="width:34px;height:34px;border-radius:50%;object-fit:cover" alt=""><div><div>${esc(u.nickname)}</div><div class="text-3 text-xs">${esc(u.email || u.phone)}</div></div></div></td>
              <td>${esc(u.levelName)}</td><td>${u.points}</td><td><b style="color:#FF6A00">¥${fmtPrice(u.balance || 0)}</b></td><td class="price">¥${fmtPrice(u.totalSpend)}</td><td>${u.orderCount}</td>
              <td>${u.status === 1 ? '<span class="tag tag-success">正常</span>' : '<span class="tag tag-danger">已禁用</span>'}</td>
              <td class="text-3">${fmtDate(u.createdAt)}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-edit="${u.id}">编辑</button><button class="btn btn-sm btn-outline" data-balance="${u.id}" style="color:#FF6A00;border-color:#FFD9A8">充值</button><button class="btn btn-sm btn-outline" data-pwd="${u.id}">改密码</button><button class="btn btn-sm btn-plain" data-del="${u.id}" style="color:#E5484D">删除</button></div></td>
            </tr>`).join('') || '<tr><td colspan="10" class="text-3" style="text-align:center;padding:30px">暂无用户</td></tr>'}
        </tbody>
      </table>
      ${pagerHtml(r.page, r.pages, r.total)}`;
    $$('[data-balance]', box).forEach((b) => b.addEventListener('click', () => balanceModal(r.list.find((x) => x.id === Number(b.getAttribute('data-balance'))))));
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => userModal(r.list.find((x) => x.id === Number(b.getAttribute('data-edit'))))));
    $$('[data-pwd]', box).forEach((b) => b.addEventListener('click', () => pwdModal(r.list.find((x) => x.id === Number(b.getAttribute('data-pwd'))))));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      const u = r.list.find((x) => x.id === Number(b.getAttribute('data-del')));
      if (!await dialog({ title: '删除用户', text: '确定删除用户 ' + u.nickname + '（' + (u.email || u.phone) + '）吗？该用户的历史订单会保留，其他数据会被清除。', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { await API.del('/admin/users/' + u.id, { admin: true }); toast('用户已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    bindPager(box, (d) => { page += d; load(); });
  };
  function pwdModal(u) {
    const { close, mask } = openModal('修改密码 - ' + u.nickname, `
      <div class="admin-form-grid">
        <div class="af-item full"><label>新密码（至少6位）</label><input class="input" id="pf-new" type="password" placeholder="请输入新密码"></div>
        <div class="af-item full"><label>确认新密码</label><input class="input" id="pf-new2" type="password" placeholder="请再次输入新密码"></div>
      </div>
      <div class="text-3 text-sm" style="margin-top:8px">修改后该用户会被强制下线，需用新密码重新登录。</div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>确认修改</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const p1 = $('#pf-new', mask).value;
      const p2 = $('#pf-new2', mask).value;
      if (p1.length < 6) return toast('密码至少 6 位', 'error');
      if (p1 !== p2) return toast('两次密码不一致', 'error');
      try {
        await API.put('/admin/users/' + u.id + '/password', { password: p1 }, { admin: true });
        toast('密码已修改', 'success');
        close();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  function balanceModal(u) {
    const { close, mask } = openModal('余额调整 - ' + u.nickname, `
      <div class="admin-form-grid">
        <div class="af-item full"><label>当前余额</label><div style="font-size:16px;font-weight:700;color:#FF6A00">¥${fmtPrice(u.balance || 0)}</div></div>
        <div class="af-item full"><label>调整金额（正数充值 / 负数扣款）</label><input class="input" id="bf-delta" type="number" step="0.01" placeholder="如：50 或 -20"></div>
        <div class="af-item full"><label>备注（选填）</label><input class="input" id="bf-reason" placeholder="如：线下收款充值"></div>
      </div>
      <div class="text-3 text-sm" style="margin-top:8px">开通分站费用将从用户余额扣除，线下收款后在此充值。</div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>确认调整</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const delta = Number($('#bf-delta', mask).value);
      if (!isFinite(delta) || delta === 0) return toast('请输入有效的调整金额', 'error');
      try {
        const r = await API.put('/admin/users/' + u.id + '/balance', { delta, reason: $('#bf-reason', mask).value.trim() }, { admin: true });
        toast('余额已调整，当前 ¥' + fmtPrice(r.balance), 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  
  function userModal(u) {
    const { close, mask } = openModal('编辑用户 - ' + u.nickname, `
      <div class="admin-form-grid">
        <div class="af-item"><label>昵称</label><input class="input" id="uf-nick" value="${esc(u.nickname)}"></div>
        <div class="af-item"><label>积分</label><input class="input" id="uf-points" type="number" value="${u.points}"></div>
        <div class="af-item" style="grid-column:1/-1"><label>账号状态</label><label class="toggle"><input type="checkbox" id="uf-status" ${u.status === 1 ? 'checked' : ''}><i></i></label> <span id="uf-status-text">${u.status === 1 ? '正常' : '已禁用'}</span></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('#uf-status', mask).addEventListener('change', () => { $('#uf-status-text', mask).textContent = $('#uf-status', mask).checked ? '正常' : '已禁用'; });
    $('[data-save]', mask).addEventListener('click', async () => {
      try {
        await API.put('/admin/users/' + u.id, {
          nickname: $('#uf-nick', mask).value.trim(),
          points: parseInt($('#uf-points', mask).value) || 0,
          status: $('#uf-status', mask).checked ? 1 : 0
        }, { admin: true });
        toast('已保存', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  return [
    '用户管理',
    `<div class="panel">
      <div class="panel-tools">
        <input class="input" id="u-kw" placeholder="邮箱 / 昵称" style="width:220px">
        <button class="btn btn-sm btn-outline" data-search>搜索</button>
      </div>
      <div id="u-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => {
      $('[data-search]').addEventListener('click', () => { keyword = $('#u-kw').value.trim(); page = 1; load(); });
      $('#u-kw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { keyword = $('#u-kw').value.trim(); page = 1; load(); } });
      load();
    }
  ];
}

/* ============================================================
   优惠券
   ============================================================ */
async function aCoupons() {
  const load = async () => {
    const box = $('#co-box');
    const list = await API.get('/admin/coupons', { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>名称</th><th>类型</th><th>门槛/面额</th><th>总量/已领</th><th>有效期</th><th>积分兑换</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${list.map((c) => `
            <tr>
              <td><b>${esc(c.name)}</b></td>
              <td>${c.type === 'fullcut' ? '满减' : '折扣'}</td>
              <td>${c.type === 'fullcut' ? '满 ' + fmtPrice(c.threshold) + ' 减 ' + fmtPrice(c.amount) : fmtPrice(c.discount * 10).replace(/\.0$/, '') + ' 折（满 ' + fmtPrice(c.threshold) + '）'}</td>
              <td>${c.total} / ${c.claimed}</td>
              <td class="text-3">${fmtDate(c.startAt)} ~ ${fmtDate(c.endAt)}</td>
              <td>${c.pointsCost > 0 ? c.pointsCost + ' 分' : '-'}</td>
              <td>${c.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-gray">停用</span>'}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-edit="${c.id}">编辑</button><button class="btn btn-sm btn-plain" data-del="${c.id}">删除</button></div></td>
            </tr>`).join('') || '<tr><td colspan="8" class="text-3" style="text-align:center;padding:30px">暂无优惠券</td></tr>'}
        </tbody>
      </table>`;
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => couponModal(list.find((x) => x.id === Number(b.getAttribute('data-edit'))))));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await dialog({ title: '删除优惠券', text: '确定删除该优惠券？已领取的券将被一并清理，历史订单不受影响（仅保留金额记录）。', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { const rr = await API.del('/admin/coupons/' + b.getAttribute('data-del'), { admin: true }); toast(rr && rr.claimedCount ? '已删除（清理 ' + rr.claimedCount + ' 张已领取）' : '已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };
  function couponModal(c) {
    const isEdit = !!c;
    const { close, body, mask } = openModal(isEdit ? '编辑优惠券' : '新增优惠券', `
      <div class="admin-form-grid">
        <div class="af-item full"><label>优惠券名称 *</label><input class="input" id="cf-name" value="${esc(c ? c.name : '')}"></div>
        <div class="af-item"><label>类型 *</label><select id="cf-type"><option value="fullcut" ${!c || c.type === 'fullcut' ? 'selected' : ''}>满减券</option><option value="discount" ${c && c.type === 'discount' ? 'selected' : ''}>折扣券</option></select></div>
        <div class="af-item"><label>满（元）</label><input class="input" id="cf-th" type="number" step="0.01" value="${c ? c.threshold : 0}"></div>
        <div class="af-item"><label>减（元，满减券）</label><input class="input" id="cf-amt" type="number" step="0.01" value="${c && c.type === 'fullcut' ? c.amount : 10}"></div>
        <div class="af-item"><label>折扣（0.01-0.99，折扣券）</label><input class="input" id="cf-disc" type="number" step="0.01" value="${c && c.type === 'discount' ? c.discount : 0.9}"></div>
        <div class="af-item"><label>发行总量 *</label><input class="input" id="cf-total" type="number" value="${c ? c.total : 100}"></div>
        <div class="af-item"><label>兑换所需积分（0=免费领取）</label><input class="input" id="cf-pts" type="number" value="${c ? c.pointsCost || 0 : 0}"></div>
        <div class="af-item"><label>生效时间 *</label><input class="input" id="cf-start" type="date" value="${c ? fmtDate(c.startAt) : fmtDate(Math.floor(Date.now() / 1000))}"></div>
        <div class="af-item"><label>失效时间 *</label><input class="input" id="cf-end" type="date" value="${c ? fmtDate(c.endAt) : fmtDate(Math.floor(Date.now() / 1000) + 30 * 86400)}"></div>
        <div class="af-item" style="grid-column:1/-1"><label>状态</label><label class="toggle"><input type="checkbox" id="cf-status" ${!c || c.status === 1 ? 'checked' : ''}><i></i></label> <span class="text-2">启用（可领取）</span></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const name = $('#cf-name', body).value.trim();
      if (!name) return toast('请输入名称', 'error');
      const type = $('#cf-type', body).value;
      const startAt = Math.floor(new Date($('#cf-start', body).value + 'T00:00:00').getTime() / 1000);
      const endAt = Math.floor(new Date($('#cf-end', body).value + 'T23:59:59').getTime() / 1000);
      if (!startAt || !endAt || endAt <= startAt) return toast('时间范围不正确', 'error');
      const data = {
        name, type,
        threshold: parseFloat($('#cf-th', body).value) || 0,
        amount: type === 'fullcut' ? parseFloat($('#cf-amt', body).value) || 0 : 0,
        discount: type === 'discount' ? parseFloat($('#cf-disc', body).value) || 1 : 1,
        total: parseInt($('#cf-total', body).value) || 1,
        pointsCost: parseInt($('#cf-pts', body).value) || 0,
        startAt, endAt,
        status: $('#cf-status', body).checked ? 1 : 0
      };
      try {
        if (isEdit) await API.put('/admin/coupons/' + c.id, data, { admin: true });
        else await API.post('/admin/coupons', data, { admin: true });
        toast('已保存', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  return [
    '优惠券',
    `<div class="panel">
      <div class="panel-tools"><button class="btn btn-sm btn-primary" data-add>+ 新增优惠券</button></div>
      <div id="co-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => { $('[data-add]').addEventListener('click', () => couponModal(null)); load(); }
  ];
}

/* ============================================================
   轮播图
   ============================================================ */
async function aBanners() {
  const load = async () => {
    const box = $('#b-box');
    const list = await API.get('/admin/banners', { admin: true });
    box.innerHTML = `
      <table class="table">
        <thead><tr><th>预览</th><th>标题</th><th>跳转</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${list.map((b) => `
            <tr>
              <td><img src="${esc(b.image)}" style="width:96px;height:42px;border-radius:6px;object-fit:cover" alt=""></td>
              <td>${esc(b.title || '-')}</td>
              <td class="text-3">${b.linkType === 'product' ? '商品#' + b.link : b.linkType === 'category' ? '分类#' + b.link : b.linkType === 'url' ? esc(b.link) : '无'}</td>
              <td>${b.sort}</td>
              <td>${b.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-gray">停用</span>'}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-edit="${b.id}">编辑</button><button class="btn btn-sm btn-plain" data-del="${b.id}">删除</button></div></td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-3" style="text-align:center;padding:30px">暂无轮播图</td></tr>'}
        </tbody>
      </table>`;
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => bannerModal(list.find((x) => x.id === Number(b.getAttribute('data-edit'))))));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await dialog({ title: '删除轮播图', text: '确定删除？', confirmText: '删除', cancelText: '取消', danger: true })) return;
      try { await API.del('/admin/banners/' + b.getAttribute('data-del'), { admin: true }); toast('已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };
  function bannerModal(b) {
    const up = imgUploader({ value: b ? [b.image] : [], max: 1, single: true });
    const { close, body, mask } = openModal(b ? '编辑轮播图' : '新增轮播图', `
      <div class="admin-form-grid">
        <div class="af-item full"><label>轮播图片（建议 750×320）*</label>${up.html}</div>
        <div class="af-item full"><label>标题</label><input class="input" id="bf-title" value="${esc(b ? b.title || '' : '')}"></div>
        <div class="af-item"><label>跳转类型</label><select id="bf-type"><option value="none" ${!b || b.linkType === 'none' ? 'selected' : ''}>无</option><option value="product" ${b && b.linkType === 'product' ? 'selected' : ''}>商品</option><option value="category" ${b && b.linkType === 'category' ? 'selected' : ''}>分类</option><option value="url" ${b && b.linkType === 'url' ? 'selected' : ''}>外部链接</option></select></div>
        <div class="af-item"><label>跳转目标</label><input class="input" id="bf-link" value="${esc(b ? b.link || '' : '')}" placeholder="商品/分类 ID 或 URL"></div>
        <div class="af-item"><label>排序</label><input class="input" id="bf-sort" type="number" value="${b ? b.sort || 0 : 0}"></div>
        <div class="af-item"><label>状态</label><label class="toggle"><input type="checkbox" id="bf-status" ${!b || b.status === 1 ? 'checked' : ''}><i></i></label></div>
      </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
    up.mount();
    $('[data-cancel]', mask).addEventListener('click', close);
    $('[data-save]', mask).addEventListener('click', async () => {
      const image = up.getUrls();
      if (!image) return toast('请上传图片', 'error');
      const data = {
        title: $('#bf-title', body).value.trim(),
        image,
        linkType: $('#bf-type', body).value,
        link: $('#bf-link', body).value.trim(),
        sort: parseInt($('#bf-sort', body).value) || 0,
        status: $('#bf-status', body).checked ? 1 : 0
      };
      try {
        if (b) await API.put('/admin/banners/' + b.id, data, { admin: true });
        else await API.post('/admin/banners', data, { admin: true });
        toast('已保存', 'success');
        close();
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  return [
    '轮播图',
    `<div class="panel">
      <div class="panel-tools"><button class="btn btn-sm btn-primary" data-add>+ 新增轮播图</button></div>
      <div id="b-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => { $('[data-add]').addEventListener('click', () => bannerModal(null)); load(); }
  ];
}

/* ============================================================
   FAQ / 工单
   ============================================================ */
async function aService() {
  let tab = 'faq';
  return [
    'FAQ / 工单',
    `<div class="panel">
      <div class="panel-tools">
        <button class="btn btn-sm ${tab === 'faq' ? 'btn-primary' : 'btn-plain'}" data-tab="faq">常见问题 FAQ</button>
        <button class="btn btn-sm ${tab === 'ticket' ? 'btn-primary' : 'btn-plain'}" data-tab="ticket">用户工单</button>
        ${tab === 'faq' ? '<button class="btn btn-sm btn-outline" data-addfaq style="margin-left:auto">+ 新增 FAQ</button>' : ''}
      </div>
      <div id="s-box"><div class="load-more">加载中...</div></div>
    </div>`,
    async () => {
      const box = $('#s-box');
      const loadFaq = async () => {
        const list = await API.get('/shop/faqs');
        box.innerHTML = `
          <table class="table">
            <thead><tr><th>分类</th><th>问题</th><th>答案</th><th>排序</th><th>操作</th></tr></thead>
            <tbody>${list.map((f) => `
              <tr><td><span class="tag tag-info">${esc(f.category)}</span></td><td style="max-width:260px">${esc(f.question)}</td><td class="text-3" style="max-width:320px"><div style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(f.answer)}</div></td><td>${f.sort}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-editfaq="${f.id}">编辑</button><button class="btn btn-sm btn-plain" data-delfaq="${f.id}">删除</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="text-3" style="text-align:center;padding:30px">暂无 FAQ</td></tr>'}
            </tbody>
          </table>`;
        $$('[data-editfaq]', box).forEach((b) => b.addEventListener('click', () => faqModal(list.find((x) => x.id === Number(b.getAttribute('data-editfaq'))))));
        $$('[data-delfaq]', box).forEach((b) => b.addEventListener('click', async () => {
          if (!await dialog({ title: '删除 FAQ', text: '确定删除？', confirmText: '删除', cancelText: '取消', danger: true })) return;
          try { await API.del('/admin/faqs/' + b.getAttribute('data-delfaq'), { admin: true }); toast('已删除', 'success'); loadFaq(); }
          catch (e) { toast(e.message, 'error'); }
        }));
      };
      const loadTicket = async () => {
        const r = await API.get('/admin/tickets?status=all&size=100', { admin: true });
        box.innerHTML = `
          <table class="table">
            <thead><tr><th>ID</th><th>用户</th><th>类型</th><th>描述</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
            <tbody>${r.list.map((t) => `
              <tr><td>${t.id}</td><td>${esc(t.userPhone)}</td><td><span class="tag tag-info">${esc(t.type)}</span></td>
              <td class="text-3" style="max-width:300px"><div style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(t.description)}</div></td>
              <td><span class="tag ${t.status === 'open' ? 'tag-warning' : 'tag-gray'}">${t.status === 'open' ? '待处理' : '已关闭'}</span></td>
              <td class="text-3">${fmtTime(t.createdAt)}</td>
              <td><div class="t-actions"><button class="btn btn-sm btn-outline" data-viewticket="${t.id}">查看/回复</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="text-3" style="text-align:center;padding:30px">暂无工单</td></tr>'}
            </tbody>
          </table>`;
        $$('[data-viewticket]', box).forEach((b) => b.addEventListener('click', () => {
          const t = r.list.find((x) => x.id === Number(b.getAttribute('data-viewticket')));
          const { close, body, mask } = openModal('工单 #' + t.id, `
            <div class="detail-rows">
              <div class="dr"><span class="k">用户</span><span class="v">${esc(t.userPhone)}</span></div>
              <div class="dr"><span class="k">类型</span><span class="v">${esc(t.type)}</span></div>
              <div class="dr"><span class="k">描述</span><span class="v">${esc(t.description)}</span></div>
              ${t.images && t.images.length ? `<div class="dr"><span class="k">图片</span><span class="v"><div style="display:flex;gap:8px">${t.images.map((img) => `<img src="${esc(img)}" style="width:70px;height:70px;border-radius:8px;object-fit:cover" alt="">`).join('')}</div></span></div>` : ''}
              ${t.reply ? `<div class="dr"><span class="k">已回复</span><span class="v" style="color:var(--success)">${esc(t.reply)}</span></div>` : ''}
            </div>
            <div class="af-item" style="margin-top:14px"><label>回复内容</label><textarea class="input" id="tf-reply" rows="3">${esc(t.reply || '')}</textarea></div>`,
            `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-reply>提交回复</button>`);
          $('[data-cancel]', mask).addEventListener('click', close);
          $('[data-reply]', mask).addEventListener('click', async () => {
            const reply = $('#tf-reply', body).value.trim();
            if (!reply) return toast('请输入回复内容', 'error');
            try { await API.post('/admin/tickets/' + t.id + '/reply', { reply }, { admin: true }); toast('已回复', 'success'); close(); loadTicket(); }
            catch (e) { toast(e.message, 'error'); }
          });
        }));
      };
      function faqModal(f) {
        const { close, body, mask } = openModal(f ? '编辑 FAQ' : '新增 FAQ', `
          <div class="admin-form-grid">
            <div class="af-item"><label>分类</label><input class="input" id="ff-cat" value="${esc(f ? f.category : '常见问题')}"></div>
            <div class="af-item"><label>排序</label><input class="input" id="ff-sort" type="number" value="${f ? f.sort || 0 : 0}"></div>
            <div class="af-item full"><label>问题 *</label><input class="input" id="ff-q" value="${esc(f ? f.question : '')}"></div>
            <div class="af-item full"><label>答案 *</label><textarea class="input" id="ff-a" rows="4">${esc(f ? f.answer : '')}</textarea></div>
          </div>`, `<button class="btn btn-plain" data-cancel>取消</button><button class="btn btn-primary" data-save>保存</button>`);
        $('[data-cancel]', mask).addEventListener('click', close);
        $('[data-save]', mask).addEventListener('click', async () => {
          const question = $('#ff-q', body).value.trim();
          const answer = $('#ff-a', body).value.trim();
          if (!question || !answer) return toast('请填写问题和答案', 'error');
          const data = { category: $('#ff-cat', body).value.trim() || '常见问题', question, answer, sort: parseInt($('#ff-sort', body).value) || 0 };
          try {
            if (f) await API.put('/admin/faqs/' + f.id, data, { admin: true });
            else await API.post('/admin/faqs', data, { admin: true });
            toast('已保存', 'success');
            close();
            loadFaq();
          } catch (e) { toast(e.message, 'error'); }
        });
      }
      const renderTab = () => {
        $$('[data-tab]').forEach((b) => b.classList.toggle('btn-primary', b.getAttribute('data-tab') === tab));
        $$('[data-tab]').forEach((b) => b.classList.toggle('btn-plain', b.getAttribute('data-tab') !== tab));
        $('[data-addfaq]').style.display = tab === 'faq' ? '' : 'none';
        if (tab === 'faq') loadFaq(); else loadTicket();
      };
      $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.getAttribute('data-tab'); renderTab(); }));
      $('[data-addfaq]').addEventListener('click', () => faqModal(null));
      renderTab();
    }
  ];
}

/* ============================================================
   在线对话
   ============================================================ */
async function aChat() {
  let activeUid = null;
  return [
    '在线对话',
    `<div class="admin-chat-box">
      <div class="admin-chat-list" id="chat-list"><div class="load-more">加载中...</div></div>
      <div class="admin-chat-main">
        <div id="chat-thread" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-3)">${icon('msg', 40)}<div style="text-align:center;margin-top:10px"><div>选择左侧对话</div><div class="text-xs">用户消息将自动显示（3 秒刷新）</div></div></div>
      </div>
    </div>`,
    async () => {
      const listBox = $('#chat-list');
      const thread = $('#chat-thread');
      const loadList = async () => {
        const list = await API.get('/admin/chat', { admin: true });
        listBox.innerHTML = list.length ? list.map((c) => `
          <div class="acl-item ${activeUid === c.userId ? 'active' : ''}" data-uid="${c.userId}">
            <div class="acl-name"><span>${esc(c.userLabel)}</span>${c.unread ? `<span class="tag tag-danger" style="border-radius:10px;padding:0 7px">${c.unread}</span>` : ''}</div>
            <div class="acl-last">${esc(c.lastMsg)}</div>
            <div class="text-xs text-3 mt-8">${relTime(c.lastTime)} · ${c.count} 条</div>
          </div>`).join('') : '<div class="load-more">暂无对话</div>';
        $$('[data-uid]', listBox).forEach((el) => el.addEventListener('click', () => {
          activeUid = Number(el.getAttribute('data-uid'));
          loadThread(activeUid);
          loadList();
        }));
        if (activeUid) {
          const cur = list.find((c) => c.userId === activeUid);
          if (!cur) activeUid = null;
        }
        if (!activeUid && list.length) { activeUid = list[0].userId; loadThread(activeUid); }
      };
      const loadThread = async (uid) => {
        const msgs = await API.get('/admin/chat/' + uid, { admin: true });
        thread.innerHTML = `
          <div class="admin-chat-msgs" id="th-msgs">
            ${msgs.map((m) => `
              <div style="display:flex;${m.role === 'user' ? '' : 'justify-content:flex-end'};margin-bottom:12px">
                <div style="max-width:70%;padding:9px 13px;border-radius:10px;${m.role === 'user' ? 'background:#F0F2F5' : 'background:var(--primary);color:#fff'};font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(m.content)}</div>
              </div>`).join('')}
          </div>
          <div class="admin-chat-input">
            <input id="chat-reply" placeholder="输入回复内容，回车发送">
            <button class="btn btn-primary btn-sm" id="chat-send">发送</button>
          </div>`;
        $('#th-msgs', thread).scrollTop = $('#th-msgs', thread).scrollHeight;
        const send = async () => {
          const input = $('#chat-reply', thread);
          const content = input.value.trim();
          if (!content) return;
          input.value = '';
          try {
            await API.post('/admin/chat/' + uid + '/reply', { content }, { admin: true });
            loadThread(uid);
          } catch (e) { toast(e.message, 'error'); }
        };
        $('#chat-send', thread).addEventListener('click', send);
        $('#chat-reply', thread).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      };
      await loadList();
      chatPoll = setInterval(async () => {
        if (document.hidden) return;
        try {
          const list = await API.get('/admin/chat', { admin: true });
          const current = list.find((c) => c.userId === activeUid);
          const box = $('#th-msgs');
          const count = box ? box.children.length : 0;
          if (current && current.count !== count) loadThread(activeUid);
          loadList();
        } catch (e) {}
      }, 3000);
    }
  ];
}

/* ============================================================
   消息通知
   ============================================================ */
async function aMessages() {
  let users = [];
  const loadUsers = async (kw) => {
    const q = kw ? ('&keyword=' + encodeURIComponent(kw)) : '';
    try { users = (await API.get('/admin/users?page=1&size=20' + q, { admin: true })).list; } catch (e) { users = []; }
    const sel = $('#m-target');
    if (sel) sel.innerHTML = '<option value="all">全部用户</option>' + users.map((u) => `<option value="${u.id}">${esc(u.nickname)}（${esc(u.email || u.phone || u.id)}）</option>`).join('');
  };
  try { await loadUsers(''); } catch (e) {}
  return [
    '消息通知',
    `<div class="panel" style="max-width:680px">
      <div class="panel-head"><span class="ph-title">发送消息</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>消息类型</label><select id="m-type"><option value="system">系统通知</option><option value="order">订单通知</option><option value="activity">活动通知</option></select></div>
          <div class="af-item"><label>发送对象</label><select id="m-target"><option value="all">全部用户</option></select></div>
          <div class="af-item full"><label>搜索用户（按昵称/邮箱/手机号，结果实时刷新下方列表）</label><input class="input" id="m-search" placeholder="输入关键词搜索，留空显示全部"></div>
          <div class="af-item full"><label>标题 *</label><input class="input" id="m-title" placeholder="如：双十一大促活动开启"></div>
          <div class="af-item full"><label>内容 *</label><textarea class="input" id="m-content" rows="4" placeholder="消息正文"></textarea></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary" id="m-send">发送消息</button></div>
        <div class="form-tip">发送后用户端「消息中心」将实时收到通知，未读会有角标提醒。</div>
      </div>
    </div>`,
    async () => {
      let timer = null;
      $('#m-search').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => loadUsers($('#m-search').value.trim()), 300);
      });
      $('#m-send').addEventListener('click', async () => {
        const title = $('#m-title').value.trim();
        const content = $('#m-content').value.trim();
        if (!title || !content) return toast('请填写标题和内容', 'error');
        const target = $('#m-target').value;
        try {
          await API.post('/admin/messages', {
            type: $('#m-type').value,
            title, content,
            userId: target === 'all' ? null : Number(target)
          }, { admin: true });
          toast('消息已发送', 'success');
          $('#m-title').value = '';
          $('#m-content').value = '';
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  ];
}

/* ============================================================
   分站管理（超级管理员 → 专业分站；专业分站 → 普通分站）
   ============================================================ */
async function aBranches() {
  let list = [];
  const load = async () => {
    list = await API.get('/admin/branches', { admin: true });
    const prices = await API.get('/admin/branch-prices', { admin: true });
    const totalPro = list.filter((b) => b.type === 'pro').length;
    const totalChild = list.filter((b) => b.type === 'normal').length;
    const activePro = list.filter((b) => b.status === 1 && b.type === 'pro').length;
    const stats = [
      { num: totalPro, lb: '专业分站', color: '#7C3AED', bg: 'rgba(124,58,237,.12)', icon: 'branch' },
      { num: totalChild, lb: '普通分站（下级）', color: '#0E9F6E', bg: 'rgba(14,159,110,.12)', icon: 'users' },
      { num: activePro, lb: '启用中的专业分站', color: '#0F6DFF', bg: 'rgba(15,109,255,.12)', icon: 'shield' }
    ];
    const statsHtml = `<div class="stats-row">${stats.map((s) => `<div class="stat-card">
      <div class="sc-ico" style="background:${s.bg};color:${s.color}">${icon(s.icon, 22)}</div>
      <div><div class="sc-num">${s.num}</div><div class="sc-lb">${s.lb}</div></div>
    </div>`).join('')}</div>`;
    const rows = list.map((b) => `
      <tr>
        <td><div class="fw-600">${esc(b.name)}</div><div class="text-3 text-xs">${esc(b.username)}${b.ownerId ? ' · 已绑用户' : ''}</div></td>
        <td><span class="tag ${b.type === 'pro' ? 'tag-primary' : 'tag-success'}">${b.type === 'pro' ? '专业分站' : '普通分站'}</span></td>
        <td>${esc(b.parentName || '超级管理员')}</td>
        <td>${b.type === 'pro' ? b.childCount + ' 个' : '-'}</td>
        <td class="fw-600" style="color:#FF6A00">¥${fmtPrice(b.balance || 0)}</td>
        <td>${b.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-danger">停用</span>'}</td>
        <td>${new Date(b.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
        <td>
          ${b.type === 'pro' ? `<button class="btn btn-sm btn-outline" data-child="${b.id}">${icon('users', 14)} 下级 ${b.childCount}</button>` : ''}
          <button class="btn btn-sm btn-outline" data-edit="${b.id}">${icon('setting', 13)} 编辑</button>
          <button class="btn btn-sm btn-outline" data-balance="${b.id}">${icon('wallet', 13)} 余额</button>
          <button class="btn btn-sm btn-outline" data-pwd="${b.id}">${icon('lock', 13)} 重置密码</button>
          <button class="btn btn-sm btn-outline" data-status="${b.id}">${b.status === 1 ? '停用' : '启用'}</button>
          <button class="btn btn-sm btn-outline-danger" data-del="${b.id}">${icon('trash', 14)}</button>
        </td>
      </tr>`).join('');
    return `${statsHtml}<div class="card" style="margin-bottom:16px">
      <div class="card-head"><span class="am-title">${icon('wallet', 16)} 分站分销价格设置</span><span class="branch-hero-tip">用户在前端开通一级分站时按此价格从余额扣款</span></div>
      <div class="card-body">
        <div class="form-grid" style="grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
          <div><label>专业分站价格（¥）</label><input class="input" id="bp-pro" type="number" min="0" step="0.01" value="${prices.pro}"></div>
          <div><label>普通分站价格（¥）</label><input class="input" id="bp-normal" type="number" min="0" step="0.01" value="${prices.normal}"></div>
          <button class="btn btn-primary" id="bp-save">${icon('check', 16)} 保存价格</button>
        </div>
      </div>
    </div>
      <div class="card-head"><span class="am-title">${icon('branch', 16)} 开通分站</span><span class="branch-hero-tip">开通后分站可用该账号登录分站后台（/branch.html）；绑定用户后，该用户账号也可直接登录并在前端管理</span></div>
      <div class="card-body">
        <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end">
          <div><label>分站名称</label><input class="input" id="b-name" placeholder="如：华南代理"></div>
          <div><label>类型</label><select class="input" id="b-type"><option value="pro">专业分站</option><option value="normal">普通分站</option></select></div>
          <div><label>登录账号</label><input class="input" id="b-user" placeholder="代理登录账号"></div>
          <div><label>登录密码</label><input class="input" id="b-pwd" placeholder="至少 4 位"></div>
          <button class="btn btn-primary" id="b-add">${icon('plus', 16)} 开通</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
          <input class="input" id="b-owner" placeholder="绑定用户（邮箱/手机号/昵称，选填；绑定后该用户账号可登录分站后台并升级）" style="flex:1">
          <input class="input" id="b-note" placeholder="备注（选填）" style="flex:1">
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span class="am-title">${icon('users', 16)} 分站列表</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>名称/账号</th><th>类型</th><th>上级</th><th>下级</th><th>余额</th><th>状态</th><th>开通时间</th><th>操作</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:34px"><div class="text-3">暂无分站</div><div class="text-xs text-3" style="margin-top:6px">在上方表单填写信息，点击「开通」创建第一个分站</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  };
  const body = await load();

  const bind = () => {
    const root = $('#admin-main');
    $('#bp-save', root)?.addEventListener('click', async () => {
      const pro = Number($('#bp-pro', root).value);
      const normal = Number($('#bp-normal', root).value);
      if (!isFinite(pro) || pro < 0 || !isFinite(normal) || normal < 0) return toast('价格无效', 'error');
      try {
        await API.put('/admin/branch-prices', { pro, normal }, { admin: true });
        toast('价格已保存', 'success');
        await aRender();
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#b-add', root)?.addEventListener('click', async () => {
      const name = $('#b-name', root).value.trim();
      const username = $('#b-user', root).value.trim();
      const password = $('#b-pwd', root).value.trim();
      const note = $('#b-note', root).value.trim();
      const ownerEmail = $('#b-owner', root).value.trim();
      if (!name || !username || !password) return toast('请填写分站名称、账号、密码', 'error');
      try {
        const r = await API.post('/admin/branches', { name, type: $('#b-type', root).value, username, password, note, ownerEmail }, { admin: true });
        toast(r.ownerId ? '分站已开通并绑定用户' : '分站已开通', 'success');
        await aRender();
      } catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-edit'));
      const row = list.find((x) => x.id === id);
      if (!row) return;
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `<div class="modal" style="max-width:480px">
        <div class="modal-head"><span>编辑分站「${esc(row.name)}」</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
        <div class="modal-body">
          <div class="form-item"><label>分站名称</label><input class="input" id="ed-name" value="${esc(row.name)}"></div>
          <div class="form-item"><label>备注</label><input class="input" id="ed-note" value="${esc(row.note || '')}"></div>
          <button class="btn btn-primary" id="ed-save" style="width:100%">保存</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
      $('#ed-save', modal).addEventListener('click', async () => {
        const name = $('#ed-name', modal).value.trim();
        const note = $('#ed-note', modal).value.trim();
        if (!name) return toast('请填写分站名称', 'error');
        try { await API.put('/admin/branches/' + id, { name, note }, { admin: true }); toast('已保存', 'success'); modal.remove(); await aRender(); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    $$('[data-balance]', root).forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-balance'));
      const row = list.find((x) => x.id === id);
      if (!row) return;
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `<div class="modal" style="max-width:480px">
        <div class="modal-head"><span>调整余额 - ${esc(row.name)}（当前 ¥${fmtPrice(row.balance || 0)}）</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
        <div class="modal-body">
          <div class="form-item"><label>调整金额（正数充值 / 负数扣减）</label><input class="input" id="bl-amount" type="number" step="0.01" placeholder="如：100 或 -50"></div>
          <div class="form-item"><label>备注</label><input class="input" id="bl-desc" placeholder="如：线下收款充值 / 违规扣款"></div>
          <button class="btn btn-primary" id="bl-save" style="width:100%">确认调整</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
      $('#bl-save', modal).addEventListener('click', async () => {
        const amount = Number($('#bl-amount', modal).value);
        const desc = $('#bl-desc', modal).value.trim();
        if (!isFinite(amount) || amount === 0) return toast('请输入非零金额', 'error');
        try { await API.put('/admin/branches/' + id + '/balance', { amount, desc }, { admin: true }); toast('余额已调整', 'success'); modal.remove(); await aRender(); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    $$('[data-pwd]', root).forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-pwd'));
      const row = list.find((x) => x.id === id);
      if (!row) return;
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `<div class="modal" style="max-width:480px">
        <div class="modal-head"><span>重置密码 - ${esc(row.name)}</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
        <div class="modal-body">
          <div class="form-item"><label>新密码（至少 4 位）</label><input class="input" id="pw-new" type="text"></div>
          <button class="btn btn-primary" id="pw-save" style="width:100%">确认重置</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
      $('#pw-save', modal).addEventListener('click', async () => {
        const password = $('#pw-new', modal).value.trim();
        if (password.length < 4) return toast('密码至少 4 位', 'error');
        try { await API.put('/admin/branches/' + id + '/password', { password }, { admin: true }); toast('密码已重置', 'success'); modal.remove(); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    $$('[data-status]', root).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.getAttribute('data-status'));
      const target = b.textContent.trim().includes('启用');
      try { await API.put('/admin/branches/' + id, { status: target ? 1 : 0 }, { admin: true }); toast('已更新', 'success'); await aRender(); } catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.getAttribute('data-del'));
      if (!confirm('确定删除该分站？其名下普通分站将一并删除！')) return;
      try { await API.del('/admin/branches/' + id, { admin: true }); toast('已删除', 'success'); await aRender(); } catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-child]', root).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.getAttribute('data-child'));
      try {
        const r = await API.get('/admin/branches/' + id + '/children', { admin: true });
        const rows = r.list.map((c) => `<tr>
          <td><div class="fw-600">${esc(c.name)}</div><div class="text-3 text-xs">${esc(c.username)}</div></td>
          <td><span class="tag tag-success">普通分站</span></td>
          <td>${c.status === 1 ? '<span class="tag tag-success">启用</span>' : '<span class="tag tag-danger">停用</span>'}</td>
          <td>${new Date(c.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
        </tr>`).join('');
        const modal = document.createElement('div');
        modal.className = 'modal-mask';
        modal.innerHTML = `<div class="modal" style="max-width:640px">
          <div class="modal-head"><span>${esc(r.pro.name)} 的普通分站</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
          <div class="modal-body"><div class="table-wrap"><table class="table"><thead><tr><th>名称/账号</th><th>类型</th><th>状态</th><th>开通时间</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="text-3" style="text-align:center;padding:20px">暂无普通分站</td></tr>'}</tbody></table></div></div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
      } catch (e) { toast(e.message, 'error'); }
    }));
  };

  return ['分站管理', body, bind];
}

/* ============================================================
   提现审核（分站提现）
   ============================================================ */
async function aWithdrawals() {
  const load = async (status) => {
    const d = await API.get('/admin/withdrawals', { admin: true, params: { status, page: 1, size: 50 } });
    const rows = (d.list || []).map((w) => `<tr>
      <td><div class="fw-600">${esc(w.branchName)}</div><div class="text-3 text-xs">${esc(w.branchUsername || '')}</div></td>
      <td class="fw-600" style="color:#FF6A00">¥${fmtPrice(w.amount)}</td>
      <td class="text-sm">${esc(w.account)}${w.qrcode ? `<div style="margin-top:4px"><img src="${esc(w.qrcode)}" style="width:56px;height:56px;object-fit:contain;border:1px solid #eee;border-radius:6px" alt="收款码"></div>` : ''}</td>
      <td>${w.status === 'pending' ? '<span class="tag tag-warn">待审核</span>' : w.status === 'approved' ? '<span class="tag tag-primary">已通过</span>' : w.status === 'paid' ? '<span class="tag tag-success">已打款</span>' : w.status === 'rejected' ? '<span class="tag tag-danger">已驳回</span>' : '<span class="tag tag-danger">已取消</span>'}</td>
      <td class="text-xs text-3">${w.reply || '-'}<br>${new Date(w.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
      <td>
        ${w.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-ok="${w.id}">通过</button><button class="btn btn-sm btn-outline-danger" data-no="${w.id}">驳回</button>` : ''}
        ${w.status === 'approved' ? `<button class="btn btn-sm btn-outline" data-pay="${w.id}">标记已打款</button>` : ''}
      </td>
    </tr>`).join('');
    const tabs = [['all', '全部'], ['pending', '待审核'], ['approved', '已通过'], ['paid', '已打款'], ['rejected', '已驳回']].map(([k, v]) => `<button class="btn btn-sm ${k === status ? 'btn-primary' : 'btn-outline'}" data-wd-status="${k}">${v}</button>`).join('');
    return `<div class="stats-row">
      <div class="stat-card"><div class="sc-ico" style="background:rgba(255,106,0,.12);color:#FF6A00">${icon('wallet', 22)}</div><div><div class="sc-num">${d.total || 0}</div><div class="sc-lb">提现记录</div></div></div>
    </div>
    <div class="card">
      <div class="card-head"><span class="am-title">${icon('wallet', 16)} 提现审核</span><span class="branch-hero-tip">通过后从分站余额扣款，线下打款后标记「已打款」</span></div>
      <div class="card-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>分站</th><th>金额</th><th>收款方式</th><th>状态</th><th>备注/时间</th><th>操作</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:34px"><div class="text-3">暂无提现记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  };
  let status = 'all';
  const body = await load(status);

  const bind = () => {
    const root = $('#admin-main');
    $$('[data-wd-status]', root).forEach((b) => b.addEventListener('click', async () => {
      status = b.getAttribute('data-wd-status');
      const main = $('#admin-main');
      main.innerHTML = await load(status);
      aRender();
    }));
    $$('[data-ok]', root).forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-ok'));
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `<div class="modal" style="max-width:440px">
        <div class="modal-head"><span>通过提现 #${id}</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
        <div class="modal-body">
          <div class="form-item"><label>审核备注（选填）</label><input class="input" id="wd-reply" placeholder="如：已核实，等待打款"></div>
          <button class="btn btn-primary" id="wd-ok" style="width:100%">确认通过（扣减分站余额）</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
      $('#wd-ok', modal).addEventListener('click', async () => {
        try { await API.put('/admin/withdrawals/' + id, { action: 'approve', reply: $('#wd-reply', modal).value.trim() }, { admin: true }); toast('已通过', 'success'); modal.remove(); await aRender(); } catch (e) { toast(e.message, 'error'); }
      });
    }));
    $$('[data-no]', root).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.getAttribute('data-no'));
      const reply = prompt('驳回原因：', '不符合提现条件');
      if (reply === null) return;
      try { await API.put('/admin/withdrawals/' + id, { action: 'reject', reply }, { admin: true }); toast('已驳回', 'success'); await aRender(); } catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-pay]', root).forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.getAttribute('data-pay'));
      if (!confirm('确认已线下打款？')) return;
      try { await API.put('/admin/withdrawals/' + id, { action: 'pay', reply: '已打款' }, { admin: true }); toast('已标记打款', 'success'); await aRender(); } catch (e) { toast(e.message, 'error'); }
    }));
  };

  return ['提现审核', body, bind];
}

/* ============================================================
   系统设置
   ============================================================ */
async function aSettings() {
  const s = await API.get('/admin/settings', { admin: true });
  const up = imgUploader({ value: s.logo ? [s.logo] : [], max: 1, single: true });
  return [
    '系统设置',
    `<div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">站点信息</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>站点名称</label><input class="input" id="s-name" value="${esc(s.siteName)}"></div>
          <div class="af-item"><label>站点 Slogan</label><input class="input" id="s-slogan" value="${esc(s.slogan)}"></div>
          <div class="af-item"><label>站点 Logo</label>${up.html}</div>
          <div class="af-item"><label>ICP 备案号</label><input class="input" id="s-icp" value="${esc(s.icp)}"></div>
          <div class="af-item"><label>客服电话</label><input class="input" id="s-phone" value="${esc(s.contactPhone)}"></div>
          <div class="af-item"><label>客服 QQ</label><input class="input" id="s-qq" value="${esc(s.contactQQ)}"></div>
          <div class="af-item"><label>客服微信</label><input class="input" id="s-wechat" value="${esc(s.contactWechat)}"></div>
          <div class="af-item"><label>热门搜索词（逗号分隔）</label><input class="input" id="s-hot" value="${esc((s.hotKeywords || []).join(','))}"></div>
        </div>
      </div>
    </div>
    <div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">交易与营销</span></div>      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>积分比例（1元=?积分）</label><input class="input" id="s-rate" type="number" value="${s.pointsRate}"></div>
          <div class="af-item"><label>积分兑换比例（?积分=1元）</label><input class="input" id="s-exrate" type="number" value="${s.pointsExchangeRate || 100}" title="多少积分可以兑换1元余额"></div>
          <div class="af-item"><label>注册赠送积分</label><input class="input" id="s-regpts" type="number" value="${s.registerPoints}"></div>
          <div class="af-item"><label>自动确认收货（天）</label><input class="input" id="s-confirm" type="number" value="${s.autoConfirmDays}"></div>
          <div class="af-item"><label>未支付自动取消（分钟）</label><input class="input" id="s-cancel" type="number" value="${s.pendingCancelMinutes}"></div>
          <div class="af-item"><label>分站最大层级（1-10）</label><input class="input" id="s-maxdepth" type="number" min="1" max="10" value="${s.branchMaxDepth === undefined ? 5 : s.branchMaxDepth}" title="分站可向下发展的最大层级数"></div>
          <div class="af-item"><label>微信支付</label><label class="toggle"><input type="checkbox" id="s-wechatpay" ${s.payWechat ? 'checked' : ''}><i></i></label></div>
          <div class="af-item"><label>支付宝</label><label class="toggle"><input type="checkbox" id="s-alipay" ${s.payAlipay ? 'checked' : ''}><i></i></label></div>
        </div>
      </div>
    </div>
    <div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">支付设置</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>沙箱模式（测试用，不真实扣款）</label><label class="toggle"><input type="checkbox" id="s-sandbox" ${s.paySandbox ? 'checked' : ''}><i></i></label></div>
          <div class="af-item full" style="font-weight:600;color:var(--text-2);margin-top:4px">微信支付</div>
          <div class="af-item"><label>商户号 (mch_id)</label><input class="input" id="s-wx-mch" value="${esc(s.wechatMchId)}" placeholder="如：1600000000"></div>
          <div class="af-item"><label>公众号 AppID</label><input class="input" id="s-wx-appid" value="${esc(s.wechatAppId)}" placeholder="如：wx1234567890abcdef"></div>
          <div class="af-item full"><label>API 密钥 (APIv3 密钥)</label><input class="input" id="s-wx-key" value="${esc(s.wechatApiKey)}" placeholder="在微信商户平台设置的32位密钥"></div>
          <div class="af-item"><label>商户证书序列号</label><input class="input" id="s-wx-serial" value="${esc(s.wechatSerialNo)}" placeholder="如：3B7B8A1C..."></div>
          <div class="af-item full"><label>商户私钥 (PKCS8 PEM，退款/签名用)</label><textarea class="input" id="s-wx-priv" rows="2" placeholder="以 -----BEGIN PRIVATE KEY----- 开头">${esc(s.wechatPrivateKey)}</textarea></div>
          <div class="af-item full"><label>微信支付平台证书 (PEM，回调验签用)</label><textarea class="input" id="s-wx-cert2" rows="2" placeholder="以 -----BEGIN CERTIFICATE----- 开头">${esc(s.wechatPlatformCert)}</textarea></div>
          <div class="af-item full" style="font-weight:600;color:var(--text-2);margin-top:8px">支付宝</div>
          <div class="af-item"><label>应用 AppID</label><input class="input" id="s-ali-appid" value="${esc(s.alipayAppId)}" placeholder="如：2021000000000000"></div>
          <div class="af-item"><label>网关</label><input class="input" id="s-ali-gw" value="${esc(s.alipayGateway)}" placeholder="openapi.alipay.com"></div>
          <div class="af-item full"><label>应用私钥</label><textarea class="input" id="s-ali-priv" rows="2" placeholder="以 -----BEGIN RSA PRIVATE KEY----- 开头">${esc(s.alipayPrivateKey)}</textarea></div>
          <div class="af-item full"><label>支付宝公钥</label><textarea class="input" id="s-ali-pub" rows="2" placeholder="以 -----BEGIN PUBLIC KEY----- 开头">${esc(s.alipayPublicKey)}</textarea></div>
        </div>
        <div class="text-3 text-sm" style="margin-top:10px">沙箱模式开启时，支付不会真实扣款，订单直接标记为已支付，方便测试。正式上线前请关闭沙箱模式并填写真实密钥。</div>
      </div>
    </div>
    <div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">虎皮椒码支付（个人免营业执照，云端监听）</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>启用虎皮椒</label><label class="toggle"><input type="checkbox" id="s-xh-enable" ${s.xunhuEnabled ? 'checked' : ''}><i></i></label></div>
          <div class="af-item"><label>APP ID</label><input class="input" id="s-xh-appid" value="${esc(s.xunhuAppId)}" placeholder="虎皮椒后台的 APPID"></div>
          <div class="af-item full"><label>APP Secret（接口密钥）</label><input class="input" id="s-xh-secret" value="${esc(s.xunhuAppSecret)}" placeholder="虎皮椒后台的接口密钥"></div>
          <div class="af-item full"><label>API 网关（默认即可）</label><input class="input" id="s-xh-gw" value="${esc(s.xunhuGateway)}" placeholder="https://api.xunhupay.com/payment/do.html"></div>
        </div>
        <div class="text-3 text-sm" style="margin-top:10px">虎皮椒是个人码支付平台，不需要营业执照。注册地址：<a href="https://www.xunhupay.com/" target="_blank">xunhupay.com</a>。买家扫码付款到你个人微信/支付宝，虎皮椒云端监听到账后自动回调系统发货。回调地址：<code style="background:#f0f0f0;padding:2px 6px;border-radius:4px">http://你的域名/api/pay/notify/xunhu</code>（填到虎皮椒后台）。</div>
      </div>
    </div>
    <div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">手动转账支付（个人收款，0费用）</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>启用手动转账</label><label class="toggle"><input type="checkbox" id="s-mp-enable" ${s.manualPayEnabled ? 'checked' : ''}><i></i></label></div>
          <div class="af-item full">
            <label>微信收款码</label>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <input class="input" id="s-mp-wx" value="${esc(s.wechatQrcode)}" placeholder="点击右侧上传图片，或粘贴图片URL" style="flex:1">
              <button class="btn btn-outline btn-sm" id="s-mp-wx-up" style="flex-shrink:0">${icon('upload', 14)} 上传</button>
            </div>
            <div id="s-mp-wx-preview" style="margin-top:8px"></div>
          </div>
          <div class="af-item full">
            <label>支付宝收款码</label>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <input class="input" id="s-mp-ali" value="${esc(s.alipayQrcode)}" placeholder="点击右侧上传图片，或粘贴图片URL" style="flex:1">
              <button class="btn btn-outline btn-sm" id="s-mp-ali-up" style="flex-shrink:0">${icon('upload', 14)} 上传</button>
            </div>
            <div id="s-mp-ali-preview" style="margin-top:8px"></div>
          </div>
          <div class="af-item full"><label>付款说明（显示给买家）</label><textarea class="input" id="s-mp-notice" rows="2" placeholder="如：请转账时备注订单号，付款后上传截图，客服确认后自动发货">${esc(s.payNotice)}</textarea></div>
        </div>
        <div class="text-3 text-sm" style="margin-top:10px">启用后，买家可选择「手动转账」支付，扫码付款到你个人微信/支付宝，上传付款截图后订单变为待确认状态，你在订单管理中点「确认收款」即可自动发卡。完全免费，无需任何支付接口。</div>
      </div>
    </div>
    <div class="panel" style="max-width:820px">
      <div class="panel-head"><span class="ph-title">管理员账号（${esc(s.adminUsername)}）</span></div>
      <div class="panel-body">
        <div class="admin-form-grid">
          <div class="af-item"><label>原密码</label><input class="input" id="s-old" type="password" placeholder="请输入原密码"></div>
          <div class="af-item"><label>新密码（至少6位）</label><input class="input" id="s-next" type="password" placeholder="请输入新密码"></div>
        </div>
      </div>
    </div>
    <div class="form-actions" style="padding:0 0 30px;max-width:820px"><button class="btn btn-primary" id="s-save" style="width:160px">保存全部设置</button></div>`,
    async () => {
      up.mount();
      // 微信/支付宝收款码：一键上传图片并回填 URL + 预览
      const bindQrUpload = (upBtnId, inputId, previewId) => {
        const upBtn = $(upBtnId);
        const input = $(inputId);
        const preview = $(previewId);
        const renderPreview = () => {
          const u = (input.value || '').trim();
          preview.innerHTML = u ? `<img src="${esc(u)}" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" onerror="this.style.display='none'">` : '';
        };
        renderPreview();
        input.addEventListener('input', renderPreview);
        upBtn.addEventListener('click', () => {
          const fi = document.createElement('input');
          fi.type = 'file';
          fi.accept = 'image/*';
          fi.onchange = async () => {
            const f = fi.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const data = String(reader.result).split(',')[1];
                const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                const r = await API.post('/admin/upload', { data, ext }, { admin: true });
                input.value = r.url;
                renderPreview();
                toast('收款码已上传', 'success');
              } catch (e) { toast(e.message, 'error'); }
            };
            reader.readAsDataURL(f);
          };
          fi.click();
        });
      };
      bindQrUpload('#s-mp-wx-up', '#s-mp-wx', '#s-mp-wx-preview');
      bindQrUpload('#s-mp-ali-up', '#s-mp-ali', '#s-mp-ali-preview');
      $('#s-save').addEventListener('click', async () => {
        try {
          const newName = $('#s-name').value.trim();
          await API.put('/admin/settings', {
            siteName: newName,
            slogan: $('#s-slogan').value.trim(),
            logo: up.getUrls() || '/img/logo.svg',
            icp: $('#s-icp').value.trim(),
            contactPhone: $('#s-phone').value.trim(),
            contactQQ: $('#s-qq').value.trim(),
            contactWechat: $('#s-wechat').value.trim(),
            hotKeywords: $('#s-hot').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
            pointsRate: parseFloat($('#s-rate').value) || 0,
            pointsExchangeRate: parseInt($('#s-exrate').value) || 100,
            registerPoints: parseInt($('#s-regpts').value) || 0,
            autoConfirmDays: parseInt($('#s-confirm').value) || 7,
            pendingCancelMinutes: parseInt($('#s-cancel').value) || 30,
            branchMaxDepth: Math.min(10, Math.max(1, parseInt($('#s-maxdepth').value) || 5)),
            payWechat: $('#s-wechatpay').checked,
            payAlipay: $('#s-alipay').checked,
            paySandbox: $('#s-sandbox').checked,
            wechatMchId: $('#s-wx-mch').value.trim(),
            wechatApiKey: $('#s-wx-key').value.trim(),
            wechatAppId: $('#s-wx-appid').value.trim(),
            wechatSerialNo: $('#s-wx-serial').value.trim(),
            wechatPrivateKey: $('#s-wx-priv').value.trim(),
            wechatPlatformCert: $('#s-wx-cert2').value.trim(),
            alipayAppId: $('#s-ali-appid').value.trim(),
            alipayPrivateKey: $('#s-ali-priv').value.trim(),
            alipayPublicKey: $('#s-ali-pub').value.trim(),
            alipayGateway: $('#s-ali-gw').value.trim(),
            xunhuEnabled: $('#s-xh-enable').checked,
            xunhuAppId: $('#s-xh-appid').value.trim(),
            xunhuAppSecret: $('#s-xh-secret').value.trim(),
            xunhuGateway: $('#s-xh-gw').value.trim(),
            manualPayEnabled: $('#s-mp-enable').checked,
            wechatQrcode: $('#s-mp-wx').value.trim(),
            alipayQrcode: $('#s-mp-ali').value.trim(),
            payNotice: $('#s-mp-notice').value.trim(),
          }, { admin: true });
          const old = $('#s-old').value;
          const next = $('#s-next').value;
          if (old || next) {
            if (!old || next.length < 6) return toast('修改密码需填写原密码且新密码至少6位', 'error');
            await API.put('/admin/password', { old, next }, { admin: true });
          }
          localStorage.setItem('admin_siteName', newName);
          document.title = newName + ' - 管理后台';
          toast('设置已保存', 'success');
          // 局部刷新（重新拉取站点配置），避免整页刷新打断操作
          try {
            const fresh = await API.get('/admin/settings', { admin: true });
            const navTitle = $('#s-nav-title');
            if (navTitle) navTitle.textContent = fresh.siteName || newName;
            Admin.siteName = fresh.siteName || newName;
          } catch (e) { /* 忽略 */ }
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  ];
}

async function aQuickNav() {
  const s = await API.get('/admin/settings', { admin: true });
  const qn = (s.quickNav && s.quickNav.length) ? s.quickNav : [{ name: '联系客服', icon: 'service', cls: 'c8', img: '', link: '#/service/chat', enabled: true, fixed: true }];
  const qnUps = qn.map((q) => imgUploader({ value: q.img ? [q.img] : [], max: 1, single: true }));
  let qnSeq = qn.length;
  const html = `
    <div class="panel" style="max-width:860px">
      <div class="panel-head"><span class="ph-title">首页快捷入口（可上传图片图标，联系客服为固定项）</span></div>
      <div class="panel-body" id="qn-list">
        ${qn.map((q, i) => `
          <div class="qn-row" data-qn="${i}" style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border,#eee)">
            <div style="flex:1.1"><label>名称</label><input class="input" id="qn-name-${i}" value="${esc(q.name)}" ${q.fixed ? 'disabled style="background:#f5f6fa;color:#999"' : ''}></div>
            <div style="flex:1.4"><label>图标（上传图片，留空用内置图标）</label>${qnUps[i].html}</div>
            <div style="flex:1.3"><label>跳转链接</label><input class="input" id="qn-link-${i}" value="${esc(q.link)}" ${q.fixed ? 'disabled style="background:#f5f6fa;color:#999"' : ''} placeholder="如 #/list/3 或 #/coupons"></div>
            <div style="width:88px"><label>显示</label><label class="toggle"><input type="checkbox" id="qn-en-${i}" ${q.enabled !== false ? 'checked' : ''} ${q.fixed ? 'disabled' : ''}><i></i></label></div>
            <div style="width:66px"><label>${q.fixed ? '状态' : '操作'}</label>${q.fixed ? '<span class="text-3 text-sm" style="white-space:nowrap">固定</span>' : `<button class="btn btn-sm btn-outline-danger" data-qn-del="${i}">${icon('trash', 14)}</button>`}</div>
            <input type="hidden" id="qn-fixed-${i}" value="${q.fixed ? '1' : '0'}">
          </div>`).join('')}
      </div>
      <div class="form-actions" style="padding:12px 0 0;display:flex;gap:10px;align-items:center">
        <button class="btn btn-sm btn-outline" id="qn-add">${icon('plus', 14)} 添加入口</button>
        <button class="btn btn-primary" id="qn-save">${icon('check', 16)} 保存快捷入口</button>
        <span class="text-3 text-sm">最多 12 个；图片会保存到 /uploads，图标留空则显示内置图标。</span>
      </div>
    </div>`;
  return ['首页快捷入口', html, async function () {
    const root = $('#admin-main');
    qnUps.forEach((u) => u.mount());
    $$('[data-qn-del]', root).forEach((b) => b.addEventListener('click', () => { const row = b.closest('.qn-row'); if (row) row.remove(); }));
    $('#qn-add', root).addEventListener('click', () => {
      if (qnUps.length >= 12) return toast('最多 12 个快捷入口', 'error');
      const i = qnSeq++;
      const up2 = imgUploader({ value: [], max: 1, single: true });
      const row = document.createElement('div');
      row.className = 'qn-row';
      row.setAttribute('data-qn', i);
      row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border,#eee)';
      row.innerHTML = `
        <div style="flex:1.1"><label>名称</label><input class="input" id="qn-name-${i}" placeholder="入口名称"></div>
        <div style="flex:1.4"><label>图标（上传图片）</label>${up2.html}</div>
        <div style="flex:1.3"><label>跳转链接</label><input class="input" id="qn-link-${i}" placeholder="如 #/list/3 或 #/coupons"></div>
        <div style="width:88px"><label>显示</label><label class="toggle"><input type="checkbox" id="qn-en-${i}" checked><i></i></label></div>
        <div style="width:66px"><label>操作</label><button class="btn btn-sm btn-outline-danger" data-qn-del="${i}">${icon('trash', 14)}</button></div>
        <input type="hidden" id="qn-fixed-${i}" value="0">`;
      $('#qn-list', root).appendChild(row);
      up2.mount();
      qnUps[i] = up2;
      row.querySelector('[data-qn-del]').addEventListener('click', () => row.remove());
    });
    $('#qn-save', root).addEventListener('click', async () => {
      try {
        const quickNav = [];
        $$('#qn-list .qn-row').forEach((row) => {
          const i = row.getAttribute('data-qn');
          const fixed = $('#qn-fixed-' + i, row).value === '1';
          quickNav.push({
            name: ($('#qn-name-' + i, row).value || '').trim(),
            img: (qnUps[i] ? qnUps[i].getUrls() : '') || '',
            icon: 'gift',
            cls: 'c1',
            link: ($('#qn-link-' + i, row).value || '').trim(),
            enabled: $('#qn-en-' + i, row).checked,
            fixed
          });
        });
        await API.put('/admin/settings', { quickNav }, { admin: true });
        toast('快捷入口已保存', 'success');
        // 前台（index.html）下次打开自动生效，无需整页刷新
      } catch (e) { toast(e.message, 'error'); }
    });
  }];
}

/* ============================================================
   启动
   ============================================================ */
window.addEventListener('hashchange', aRender);
document.addEventListener('DOMContentLoaded', () => {
  document.title = (Admin.siteName || '发卡网') + ' - 管理后台';
  if (!location.hash) location.hash = '#/dashboard';
  aRender();
});
