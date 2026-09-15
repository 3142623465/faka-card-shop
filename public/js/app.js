/**
 * app.js - 发卡网用户端（SPA）
 * 页面路由：#/home #/login #/category #/product/1 #/cart #/checkout ... 
 * 视图约定：每个视图返回 { html, mount }，mount 在注入后执行事件绑定。
 */
'use strict';

/* ==========================================
   分站店铺
   ============================================ */
async function vBranchShop(params, query) {
  const username = (params && params[0]) || (query && query.b) || '';
  let info = null, prods = { list: [] };
  if (username) {
    try { info = await API.get('/shop/branch-shop?username=' + encodeURIComponent(username)); } catch (e) {}
    try { prods = await API.get('/shop/products?branch=' + encodeURIComponent(username) + '&size=100'); } catch (e) {}
  }
  return {
    html: `${navBar(info && info.name ? esc(info.name) + ' 分站店铺' : '分站店铺')}
      <div class="branch-hero">
        <div class="branch-hero-icon">${icon('branch', 30)}</div>
        <div class="branch-hero-title">${info ? esc(info.name) : esc(username || '未知分站')}</div>
        <div class="branch-hero-desc">${info ? esc(info.siteName || '') + ' · ' + (info.type === 'pro' ? '专业分站' : '普通分站') + ' · 上级：' + esc(info.parentName || '-') + ' · 在售 ' + (info.productCount || 0) + ' 件' : (username ? '未获取到分站信息' : '缺少分站参数')}</div>
      </div>
      <div class="section">
        <div class="section-title"><span>${icon('box', 18, 'text-primary')} 在售商品</span></div>
        <div class="product-grid">${prods.list.length ? prods.list.map(productCard).join('') : '<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">该分站暂未上架商品</div></div>'}</div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
    }
  };
}

/* ============================================================
   全局状态
   ============================================================ */
const App = {
  site: null,        // 站点信息
  cartCount: 0,      // 购物车数量
  msgCount: 0,       // 未读消息数
  cartBadgeEl: null,
  msgBadgeEl: null
};

let pollTimer = null;   // 轮询定时器（客服聊天）
let swiperTimer = null; // 轮播定时器

/* ============================================================
   路由
   ============================================================ */
function parseQuery(s) {
  const q = {};
  if (!s) return q;
  for (const kv of s.split('&')) {
    const [k, v] = kv.split('=');
    if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return q;
}

const ROUTES = {
  'splash': { view: vSplash },
  'home': { view: vHome, tab: 'home' },
  'guide': { view: vGuide },
  'login': { view: vLogin },
  'register': { view: vRegister },
  'forgot': { view: vForgot },
  'reset': { view: vReset },
  'search': { view: vSearch },
  'category': { view: vCategory, tab: 'category' },
  'list': { view: vList },
  'product': { view: vProduct },
  'cart': { view: vCart, tab: 'cart', auth: true },
  'checkout': { view: vCheckout, auth: true },
  'pay': { view: vPay, auth: true },
  'orders': { view: vOrders, auth: true },
  'order': { view: vOrder, auth: true },
  'aftersale': { view: vAftersaleApply, auth: true },
  'aftersales': { view: vAftersales, auth: true },
  'user': { view: vUser, tab: 'user', auth: true },
  'open-branch': { view: vOpenBranch, auth: true },
  'join': { view: vJoinBranch, auth: true },
  'branch-manage': { view: vBranchManage, auth: true },
  'branch-shop': { view: vBranchShop },
  'profile': { view: vProfile, auth: true },
  'favorites': { view: vFavorites, auth: true },
  'addresses': { view: vAddresses, auth: true },
  'address': { view: vAddressEdit, auth: true },
  'points': { view: vPoints, auth: true },
  'coupons': { view: vCoupons, auth: true },
  'vip': { view: vVip, auth: true },
  'service': { view: vService, tab: 'service', auth: true },
  'messages': { view: vMessages, tab: 'messages', auth: true },
  'message': { view: vMessage, auth: true },
  'settings': { view: vSettings, auth: true },
  'security': { view: vSecurity, auth: true },
  'about': { view: vAbout }
};

async function render() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (swiperTimer) { clearInterval(swiperTimer); swiperTimer = null; }

  let hash = location.hash || '#/home';
  const qIdx = hash.indexOf('?');
  const queryStr = qIdx >= 0 ? hash.slice(qIdx + 1) : '';
  const path = (qIdx >= 0 ? hash.slice(0, qIdx) : hash).replace(/^#\/?/, '');
  const segs = path.split('/').filter(Boolean);
  const name = segs[0] || 'home';
  const params = segs.slice(1);
  const query = parseQuery(queryStr);
  const route = ROUTES[name] || ROUTES.home;

  if (route.auth && !Auth.loggedIn) {
    const redirect = segs.join('/') + (queryStr ? '?' + queryStr : '');
    location.hash = '#/login?r=' + encodeURIComponent(redirect);
    return;
  }
  if (!route.auth && Auth.loggedIn && (name === 'login' || name === 'register')) {
    location.hash = '#/home';
    return;
  }

  window.scrollTo(0, 0);
  const viewEl = $('#view');
  viewEl.innerHTML = '<div class="load-more">加载中...</div>';
  try {
    const v = await route.view(params, query);
    viewEl.innerHTML = v.html;
    if (v.mount) v.mount();
  } catch (e) {
    viewEl.innerHTML = `<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">${esc(e.message || '页面加载失败')}</div><button class="btn btn-primary" data-goto="#/home">返回首页</button></div>`;
    bindGoto();
  }
  renderTabbar(route.tab || null);
  refreshCartBadge();
  refreshMsgBadge();
}

function bindGoto(root) {
  $$('[data-goto]', root).forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-goto'); });
  });
}

function bindBack(root) {
  const btn = $('[data-back]', root);
  if (btn) btn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      location.hash = '#/home';
    }
  });
}

/* ============================================================
   底部导航栏
   ============================================================ */
const TABS = [
  { key: 'home', name: '首页', icon: 'home', hash: '#/home' },
  { key: 'category', name: '分类', icon: 'category', hash: '#/category' },
  { key: 'cart', name: '购物车', icon: 'cart', hash: '#/cart', badge: 'cart' },
  { key: 'messages', name: '消息', icon: 'msg', hash: '#/messages', badge: 'msg' },
  { key: 'user', name: '我的', icon: 'user', hash: '#/user' }
];

function renderTabbar(active) {
  let bar = $('.tabbar');
  if (!active) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'tabbar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = TABS.map((t) => {
    const badgeHtml = t.badge === 'cart'
      ? (App.cartCount > 0 ? `<span class="badge-dot">${App.cartCount > 99 ? '99+' : App.cartCount}</span>` : '')
      : t.badge === 'msg'
        ? (App.msgCount > 0 ? `<span class="badge-dot">${App.msgCount > 99 ? '99+' : App.msgCount}</span>` : '')
        : '';
    return `<div class="tab ${t.key === active ? 'active' : ''}" data-goto="${t.hash}">
      <span class="tab-icon">${icon(t.icon, 22)}${badgeHtml}</span>
      <span>${t.name}</span></div>`;
  }).join('');
  bindGoto(bar);
}

async function refreshCartBadge() {
  if (!Auth.loggedIn) { App.cartCount = 0; updateBadgeDoms(); return; }
  try {
    const items = await API.get('/user/cart');
    App.cartCount = items.length;
  } catch (e) { App.cartCount = 0; }
  updateBadgeDoms();
}
function updateBadgeDoms() {
  const bar = $('.tabbar');
  if (!bar) return;
  const cartTab = $$('.tab', bar).find((el) => el.getAttribute('data-goto') === '#/cart');
  if (cartTab) {
    let dot = $('.badge-dot', cartTab);
    if (App.cartCount > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'badge-dot'; $('.tab-icon', cartTab).appendChild(dot); }
      dot.textContent = App.cartCount > 99 ? '99+' : App.cartCount;
    } else if (dot) dot.remove();
  }
}

async function refreshMsgBadge() {
  if (!Auth.loggedIn) { App.msgCount = 0; updateMsgBadgeDoms(); return; }
  try {
    const r = await API.get('/user/messages/unread-count');
    App.msgCount = r.count;
  } catch (e) { App.msgCount = 0; }
  updateMsgBadgeDoms();
}
function updateMsgBadgeDoms() {
  const bar = $('.tabbar');
  if (!bar) return;
  const msgTab = $$('.tab', bar).find((el) => el.getAttribute('data-goto') === '#/messages');
  if (msgTab) {
    let dot = $('.badge-dot', msgTab);
    if (App.msgCount > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'badge-dot'; $('.tab-icon', msgTab).appendChild(dot); }
      dot.textContent = App.msgCount > 99 ? '99+' : App.msgCount;
    } else if (dot) dot.remove();
  }
}

/* ============================================================
   共享组件
   ============================================================ */
function navBar(title, right = '') {
  return `<div class="navbar"><button class="nav-btn" data-back>${icon('back', 20)}</button><div class="nav-title">${esc(title)}</div><div class="nav-right">${right}</div></div>`;
}

function productCard(p) {
  return `<div class="product-card" data-goto="#/product/${p.id}">
    <img class="p-img" src="${esc((p.images || ['/img/placeholder.svg'])[0])}" onerror="imgFallback(event)" loading="lazy" alt="">
    <div class="p-body">
      <div class="p-name">${esc(p.name)}</div>
      ${p.subtitle ? `<div class="p-sub">${esc(p.subtitle)}</div>` : ''}
      <div class="p-foot">
        <div class="p-price"><small>¥</small>${fmtPrice(p.price)}</div>
        <div class="p-sales">已售 ${p.sales || 0}</div>
      </div>
    </div></div>`;
}

function productRow(p) {
  return `<div class="product-list-card" data-goto="#/product/${p.id}">
    <img class="p-img" src="${esc((p.images || ['/img/placeholder.svg'])[0])}" onerror="imgFallback(event)" loading="lazy" alt="">
    <div class="p-body">
      <div class="p-name">${esc(p.name)}</div>
      ${p.subtitle ? `<div class="p-sub">${esc(p.subtitle)}</div>` : ''}
      <div class="p-foot">
        <div class="p-price"><small>¥</small>${fmtPrice(p.price)}</div>
        <span class="p-cart-btn" data-addcart="${p.id}">${icon('cartAdd', 20)}</span>
      </div>
    </div></div>`;
}

function emptyHtml(text = '暂无数据', btnText = '', hash = '#/home') {
  return `<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">${esc(text)}</div>
    ${btnText ? `<button class="btn btn-primary" data-goto="${hash}">${esc(btnText)}</button>` : ''}</div>`;
}

function loadMoreHtml(text = '加载更多') {
  return `<div class="load-more" data-more>${text}</div>`;
}

const money = (n) => '<span class="price"><small>¥</small>' + fmtPrice(n) + '</span>';

/* ============================================================
   启动页 / 引导页
   ============================================================ */
async function loadSite() {
  if (App.site) return App.site;
  try { App.site = await API.get('/shop/site'); } catch (e) { App.site = { siteName: '秒发卡', slogan: '卡密秒发 · 售后无忧', logo: '/img/logo.svg', guidePages: [] }; }
  return App.site;
}

function vSplash() {
  return {
    html: `<div class="splash"><img class="splash-logo" src="${esc(App.site ? App.site.logo : '/img/logo.svg')}" alt=""><div class="splash-name">${esc(App.site ? App.site.siteName : '秒发卡')}</div><div class="splash-slogan">${esc(App.site ? App.site.slogan : '')}</div></div>`,
    mount() {
      setTimeout(() => {
        location.hash = localStorage.getItem('guide_seen') ? '#/home' : '#/guide';
      }, 2000);
    }
  };
}

function vGuide() {
  const pages = (App.site && App.site.guidePages && App.site.guidePages.length >= 3)
    ? App.site.guidePages
    : [
      { title: '海量卡密', desc: '游戏点卡、话费、会员、激活码应有尽有', icon: 'gift' },
      { title: '自动发货', desc: '付款成功，卡密立即到账，无需等待', icon: 'zap' },
      { title: '安全可靠', desc: '正品保障，7×24 小时在线客服', icon: 'shield' }
    ];
  const colors = ['#FF6A00,#FF9A3D', '#0F6DFF,#5FB2FF', '#7C3AED,#B9A5FF'];
  let idx = 0;
  return {
    html: `<div class="guide-page" style="background:linear-gradient(160deg, ${colors[0]})">
      <div class="gp-icon">${icon(pages[0].icon, 110, '')}</div>
      <div class="gp-title">${esc(pages[0].title)}</div>
      <div class="gp-desc">${esc(pages[0].desc)}</div>
      <div class="gp-dots">${pages.map((_, i) => `<i class="${i === 0 ? 'active' : ''}"></i>`).join('')}</div>
      <button class="btn btn-round gp-btn" style="background:rgba(255,255,255,0.92);color:#1F2430">${pages.length > 1 ? '下一步' : '立即体验'}</button>
    </div>`,
    mount() {
      const page = $('.guide-page');
      const title = $('.gp-title', page), desc = $('.gp-desc', page), iconEl = $('.gp-icon', page);
      const btn = $('.gp-btn', page), dots = $$('.gp-dots i', page);
      const show = (i) => {
        idx = i;
        page.style.background = `linear-gradient(160deg, ${colors[i]})`;
        iconEl.innerHTML = icon(pages[i].icon, 110);
        title.textContent = pages[i].title;
        desc.textContent = pages[i].desc;
        dots.forEach((d, j) => d.classList.toggle('active', j === i));
        btn.textContent = i === pages.length - 1 ? '立即体验' : '下一步';
      };
      btn.addEventListener('click', () => {
        if (idx < pages.length - 1) show(idx + 1);
        else {
          localStorage.setItem('guide_seen', '1');
          location.hash = '#/home';
        }
      });
    }
  };
}

/* ============================================================
   登录 / 注册 / 找回密码
   ============================================================ */
function authLayout(content) {
  return `<div class="auth-hero">
    <img class="ah-logo" src="${esc(App.site ? App.site.logo : '/img/logo.svg')}" alt="">
    <div class="ah-title">${esc(App.site ? App.site.siteName : '秒发卡')}</div>
    <div class="ah-sub">${esc(App.site ? App.site.slogan : '')}</div>
  </div><div class="auth-form">${content}</div>`;
}

function codeBtnHtml(scene) {
  return `<button class="btn btn-outline btn-sm code-btn" data-code${scene ? ' data-scene="' + scene + '"' : ''}>获取验证码</button>`;
}

/* ---------- 图形验证码（防人机） ---------- */
let captchaToken = '';
function captchaRowHtml() {
  return `<div class="form-item">
    <input class="input" id="f-captcha" maxlength="4" placeholder="图形验证码" autocomplete="off" style="flex:1">
    <img id="captcha-img" class="captcha-img" alt="验证码" title="点击刷新" style="height:38px;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb;background:#f3f5f9">
  </div>`;
}
async function refreshCaptcha(imgEl) {
  try {
    const r = await API.get('/auth/captcha');
    captchaToken = r.token;
    if (imgEl && r.svg) imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(r.svg);
  } catch (e) { toast('图形验证码加载失败', 'error'); }
}
function mountCaptcha(root, { auto = true } = {}) {
  const img = $('#captcha-img', root);
  refreshCaptcha(img);
  if (img) img.addEventListener('click', () => refreshCaptcha(img));
  // 验证码自动刷新：60 秒后自动更换新图并清空输入，防止过期
  if (auto) {
    setInterval(() => {
      if (document.body.contains(img)) {
        const inp = $('#f-captcha', root);
        if (inp) inp.value = '';
        refreshCaptcha(img);
      }
    }, 60000);
  }
}
function captchaPayload() {
  const inp = $('#f-captcha');
  return { captchaToken, captchaCode: inp ? inp.value.trim() : '' };
}
function captchaNeeded() {
  const p = captchaPayload();
  if (!p.captchaCode) { toast('请先输入图形验证码', 'error'); return false; }
  if (!captchaToken) { toast('图形验证码未加载，请点击图片刷新', 'error'); return false; }
  return true;
}
function resetCaptchaField() {
  const inp = $('#f-captcha');
  if (inp) inp.value = '';
  refreshCaptcha($('#captcha-img'));
}

function bindSendCode(root) {
  const btn = $('[data-code]', root);
  if (!btn) return;
  const emailInput = $('#f-account', root) || $('#f-email', root);
  const codeInput = $('#f-code', root);
  const doSend = async (scene) => {
    const email = (emailInput ? emailInput.value : '').trim();
    if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) { toast('请输入正确的邮箱地址', 'error'); return; }
    if (!captchaNeeded()) return;
    if (codeInput) codeInput.placeholder = '邮箱验证码';
    btn.disabled = true;
    const cap = captchaPayload();
    try {
      const r = await API.post('/auth/send-email-code', { email, scene, ...cap });
      toast(r.tip || '验证码已发送至 ' + email + '，5 分钟内有效，请注意查收', 'success');
      resetCaptchaField();
      let sec = 60;
      const t = setInterval(() => {
        sec--;
        btn.textContent = sec + 's 后重发';
        if (sec <= 0) { clearInterval(t); btn.textContent = '获取验证码'; btn.disabled = false; }
      }, 1000);
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; resetCaptchaField(); }
  };
  btn.addEventListener('click', () => doSend(btn.getAttribute('data-scene') || 'login'));
}

function bindEmailCode(root) {
  const btn = $('[data-email-code]', root);
  if (!btn) return;
  const emailInput = $('#f-email', root);
  const doSend = async (scene) => {
    const email = (emailInput ? emailInput.value : '').trim();
    if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) { toast('请输入正确的邮箱地址', 'error'); return; }
    if (!captchaNeeded()) return;
    btn.disabled = true;
    const cap = captchaPayload();
    try {
      const r = await API.post('/auth/send-email-code', { email, scene, ...cap });
      toast(r.tip || '验证码已发送至 ' + email + '，5 分钟内有效，请注意查收', 'success');
      resetCaptchaField();
      let sec = 60;
      const t = setInterval(() => {
        sec--;
        btn.textContent = sec + 's 后重发';
        if (sec <= 0) { clearInterval(t); btn.textContent = '获取验证码'; btn.disabled = false; }
      }, 1000);
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; resetCaptchaField(); }
  };
  btn.addEventListener('click', () => doSend(btn.getAttribute('data-scene') || 'register'));
}

function vLogin(params, query) {
  let tab = 'code';
  return {
    html: authLayout(`
      <div class="tabs">
        <div class="tab-item active" data-tab="code">验证码登录</div>
        <div class="tab-item" data-tab="pwd">密码登录</div>
      </div>
      <div class="form">
        <div class="form-card">
          <div class="form-item">
            <input class="input" id="f-account" placeholder="请输入邮箱" type="email">
          </div>
          <div class="form-item" data-part="code">
            <input class="input" id="f-code" maxlength="6" placeholder="验证码" inputmode="numeric">
            ${codeBtnHtml()}
          </div>
          <div class="form-item" data-part="pwd" style="display:none">
            <input class="input" id="f-pwd" type="password" placeholder="请输入密码">
          </div>
          ${captchaRowHtml()}
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-login>登 录</button></div>
        <div class="auth-links">
          <span data-goto="#/register">注册账号</span>
          <span data-goto="#/forgot">找回密码</span>
        </div>
        
      </div>`),
    mount() {
      const root = $('#view');
      bindGoto(root);
      bindSendCode(root);
      mountCaptcha(root);
      $$('[data-tab]', root).forEach((el) => {
        el.addEventListener('click', () => {
          tab = el.getAttribute('data-tab');
          $$('[data-tab]', root).forEach((x) => x.classList.toggle('active', x === el));
          $('[data-part=code]', root).style.display = tab === 'code' ? '' : 'none';
          $('[data-part=pwd]', root).style.display = tab === 'pwd' ? '' : 'none';
        });
      });
      $('[data-login]', root).addEventListener('click', async () => {
        const account = $('#f-account', root).value.trim();
        if (!account) return toast('请输入邮箱', 'error');
        try {
          let data;
          if (tab === 'code') {
            const code = $('#f-code', root).value.trim();
            if (!/^\d{6}$/.test(code)) return toast('请输入6位验证码', 'error');
            if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(account)) return toast('请输入正确的邮箱地址', 'error');
            data = await API.post('/auth/login-email-code', { email: account, code });
          } else {
            if (!captchaNeeded()) return;
            data = await API.post('/auth/login', { account, password: $('#f-pwd', root).value, ...captchaPayload() });
          }
          Auth.token = data.token;
          Auth.user = data.user;
          App.cartCount = 0;
          if (data.role === 'admin') {
            localStorage.setItem('admin_token', data.token);
            toast('欢迎回来，超级管理员', 'success');
            setTimeout(() => { location.href = '/admin.html'; }, 600);
            return;
          }
          toast('登录成功', 'success');
          location.hash = query.r ? '#/' + query.r : '#/home';
        } catch (e) { toast(e.message, 'error'); resetCaptchaField(); }
      });
    }
  };
}

function vRegister() {
  return {
    html: authLayout(`
      <div class="form">
        <div class="form-card">
          <div class="form-item"><input class="input" id="f-email" placeholder="请输入邮箱（如 QQ 邮箱）"></div>
          <div class="form-item"><input class="input" id="f-code" maxlength="6" placeholder="邮箱验证码" inputmode="numeric"><button class="btn btn-outline btn-sm code-btn" data-email-code data-scene="register">获取验证码</button></div>
          <div class="form-item"><input class="input" id="f-pwd" type="password" placeholder="设置密码（至少6位）"></div>
          <div class="form-item"><input class="input" id="f-pwd2" type="password" placeholder="确认密码"></div>
          ${captchaRowHtml()}
        </div>
        <div class="form-tip"><label style="display:flex;align-items:center;gap:6px"><span class="checkbox round-s checked" id="agree">${icon('check', 12)}</span><span>我已阅读并同意 <a style="color:var(--primary)" data-goto="#/about">《用户协议》</a> 与 <a style="color:var(--primary)">《隐私政策》</a></span></label></div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-reg>注 册</button></div>
        <div class="auth-links"><span data-goto="#/login">已有账号？去登录</span></div>
      </div>`),
    mount() {
      const root = $('#view');
      bindGoto(root);
      bindEmailCode(root);
      mountCaptcha(root);
      $('.checkbox', root).addEventListener('click', function () { this.classList.toggle('checked'); });
      $('[data-reg]', root).addEventListener('click', async () => {
        const email = $('#f-email', root).value.trim();
        const code = $('#f-code', root).value.trim();
        const pwd = $('#f-pwd', root).value;
        const pwd2 = $('#f-pwd2', root).value;
        if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) return toast('请输入正确的邮箱地址', 'error');
        if (!/^\d{6}$/.test(code)) return toast('请输入6位验证码', 'error');
        if (pwd.length < 6) return toast('密码至少6位', 'error');
        if (pwd !== pwd2) return toast('两次密码不一致', 'error');
        if (!$('#agree', root).classList.contains('checked')) return toast('请先同意用户协议', 'error');
        try {
          const data = await API.post('/auth/register-email', { email, code, password: pwd });
          Auth.token = data.token;
          Auth.user = data.user;
          toast('注册成功，已自动登录', 'success');
          location.hash = '#/home';
        } catch (e) { toast(e.message, 'error'); resetCaptchaField(); }
      });
    }
  };
}

function vForgot() {
  let method = 'code';
  return {
    html: authLayout(`
      <div class="form">
        <div class="form-tip" style="text-align:center;color:var(--text-2)">通过绑定邮箱找回密码</div>
        <div class="form-card">
          <div class="form-item"><input class="input" id="f-email" placeholder="请输入绑定过的邮箱（如 QQ 邮箱）"></div>
          <div class="form-item" style="gap:10px">
            <button class="btn btn-sm" data-method="code" style="flex:1">邮箱验证码</button>
            <button class="btn btn-sm btn-outline" data-method="link" style="flex:1">点击链接</button>
          </div>
          <div data-mpanel="code">
            <div class="form-item"><input class="input" id="f-ecode" maxlength="6" placeholder="邮箱验证码" inputmode="numeric"><button class="btn btn-outline btn-sm code-btn" data-email-code data-scene="reset">获取验证码</button></div>
            <div class="form-item"><input class="input" id="f-epwd" type="password" placeholder="设置新密码（至少6位）"></div>
          </div>
          <div data-mpanel="link" style="display:none">
            <div class="form-tip">系统将向邮箱发送重置链接，点击链接进入重置页设置新密码。</div>
          </div>
          <div class="form-tip" id="email-tip" style="display:none;color:var(--success)"></div>
        </div>
        ${captchaRowHtml()}
        <div class="form-actions">
          <button class="btn btn-primary btn-block" data-act="email-code">验证码重置</button>
          <button class="btn btn-primary btn-block" data-act="email-link" style="display:none">发送重置链接</button>
        </div>
        <div class="auth-links"><span data-goto="#/login">返回登录</span></div>
      </div>`),
    mount() {
      const root = $('#view');
      bindGoto(root);
      bindEmailCode(root);
      mountCaptcha(root);
      $$('[data-method]', root).forEach((el) => {
        el.addEventListener('click', () => {
          method = el.getAttribute('data-method');
          $$('[data-method]', root).forEach((x) => {
            x.classList.toggle('btn-primary', x === el);
            x.classList.toggle('btn-outline', x !== el);
          });
          $('[data-mpanel=code]', root).style.display = method === 'code' ? '' : 'none';
          $('[data-mpanel=link]', root).style.display = method === 'link' ? '' : 'none';
          $('[data-act=email-code]', root).style.display = method === 'code' ? '' : 'none';
          $('[data-act=email-link]', root).style.display = method === 'link' ? '' : 'none';
          const tip = $('#email-tip', root);
          if (tip) { tip.style.display = 'none'; tip.innerHTML = ''; }
        });
      });
      // 方式一：邮箱验证码重置
      $('[data-act=email-code]', root).addEventListener('click', async () => {
        const email = $('#f-email', root).value.trim();
        const code = $('#f-ecode', root).value.trim();
        const pwd = $('#f-epwd', root).value;
        if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) return toast('请输入正确的邮箱地址', 'error');
        if (!/^\d{6}$/.test(code)) return toast('请输入6位验证码', 'error');
        if (pwd.length < 6) return toast('密码至少6位', 'error');
        try {
          await API.post('/auth/reset-email-code', { email, code, password: pwd });
          toast('重置成功，请重新登录', 'success');
          location.hash = '#/login';
        } catch (e) { toast(e.message, 'error'); resetCaptchaField(); }
      });
      // 方式二：点击链接重置
      $('[data-act=email-link]', root).addEventListener('click', async () => {
        const email = $('#f-email', root).value.trim();
        if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) return toast('请输入正确的邮箱地址', 'error');
        if (!captchaNeeded()) return;
        const btn = $('[data-act=email-link]', root);
        btn.disabled = true;
        try {
          const r = await API.post('/auth/send-reset-email', { email, ...captchaPayload() });
          const tip = $('#email-tip', root);
          tip.style.display = '';
          tip.innerHTML = `重置链接已发送至 ${esc(email)}。<br>链接 30 分钟内有效，请及时查收邮件并点击操作。`;
          toast('已发送', 'success');
          let sec = 60;
          const t = setInterval(() => {
            sec--;
            btn.textContent = sec + 's 后可重发';
            if (sec <= 0) { clearInterval(t); btn.textContent = '发送重置链接'; btn.disabled = false; }
          }, 1000);
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; resetCaptchaField(); }
      });
    }
  };
}

function vReset(params, query) {
  const token = query.token || '';
  return {
    html: authLayout(`
      <div class="form">
        <div class="form-card">
          <div class="form-item"><input class="input" id="f-pwd" type="password" placeholder="设置新密码（至少6位）"></div>
          <div class="form-item"><input class="input" id="f-pwd2" type="password" placeholder="确认新密码"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-reset>重置密码</button></div>
      </div>`),
    mount() {
      const root = $('#view');
      $('[data-reset]', root).addEventListener('click', async () => {
        const pwd = $('#f-pwd', root).value;
        const pwd2 = $('#f-pwd2', root).value;
        if (pwd.length < 6) return toast('密码至少6位', 'error');
        if (pwd !== pwd2) return toast('两次密码不一致', 'error');
        try {
          await API.post('/auth/reset-email', { token, password: pwd });
          toast('重置成功', 'success');
          location.hash = '#/login';
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

/* ---------- 已移除第三方登录（纯邮箱账号体系） ---------- */
/* ---------- 账号安全绑定弹层（绑定/换绑邮箱，用于找回密码） ---------- */
function openBindDialog() {
  const ts = Date.now();
  const mask = document.createElement('div');
  mask.className = 'qr-mask';
  mask.innerHTML = `
    <div class="qr-box" style="max-width:340px">
      <div class="qr-head"><span class="qr-title">绑定邮箱（用于找回密码）</span><span class="qr-close" data-c>&times;</span></div>
      <div class="qr-pane" style="padding:16px 18px 18px">
        <div class="form-item"><input class="input" id="bd-acc-${ts}" maxlength="50" placeholder="请输入要绑定的邮箱（如 QQ 邮箱）" inputmode="email"></div>
        <div class="form-item"><input class="input" id="bd-code-${ts}" maxlength="6" placeholder="邮箱验证码" inputmode="numeric" style="flex:1"><button class="btn btn-outline btn-sm code-btn" id="bd-send-${ts}">获取验证码</button></div>
        <div class="form-item"><input class="input" id="bd-cap-${ts}" maxlength="4" placeholder="图形验证码" autocomplete="off" style="flex:1"><img id="bd-cimg-${ts}" class="captcha-img" alt="验证码" title="点击刷新" style="height:38px;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb;background:#f3f5f9"></div>
        <button class="btn btn-primary btn-block" id="bd-ok-${ts}" style="margin-top:6px">确认绑定</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const q = (sel) => mask.querySelector(sel);
  const close = () => mask.remove();
  q('[data-c]').addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  let capToken = '';
  const img = q('#bd-cimg-' + ts);
  const refreshCap = async () => {
    try { const r = await API.get('/auth/captcha'); capToken = r.token; if (r.svg) img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(r.svg); } catch (e) { /* 忽略 */ }
  };
  refreshCap();
  img.addEventListener('click', refreshCap);
  const sendBtn = q('#bd-send-' + ts);
  sendBtn.addEventListener('click', async () => {
    const acc = q('#bd-acc-' + ts).value.trim();
    if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(acc)) return toast('请输入正确的邮箱地址', 'error');
    const cap = q('#bd-cap-' + ts).value.trim();
    if (!cap) return toast('请先输入图形验证码', 'error');
    sendBtn.disabled = true;
    try {
      const r = await API.post('/auth/send-email-code', { email: acc, scene: 'bind', captchaToken: capToken, captchaCode: cap });
      toast(r.tip || '验证码已发送至 ' + acc + '，5 分钟内有效，请注意查收', 'success');
      refreshCap(); q('#bd-cap-' + ts).value = '';
      let sec = 60;
      const t = setInterval(() => {
        sec--;
        if (sec <= 0) { clearInterval(t); sendBtn.textContent = '获取验证码'; sendBtn.disabled = false; }
        else sendBtn.textContent = sec + 's 后重发';
      }, 1000);
    } catch (e) { toast(e.message, 'error'); sendBtn.disabled = false; refreshCap(); }
  });
  q('#bd-ok-' + ts).addEventListener('click', async () => {
    const acc = q('#bd-acc-' + ts).value.trim();
    const code = q('#bd-code-' + ts).value.trim();
    if (!acc || !/^\d{6}$/.test(code)) return toast('请填写完整信息', 'error');
    try {
      await API.post('/auth/bind-email', { email: acc, code });
      const me = (await API.get('/auth/me')).user;
      Auth.user = me;
      close();
      toast('绑定成功', 'success');
      render();
    } catch (e) { toast(e.message, 'error'); refreshCap(); q('#bd-cap-' + ts).value = ''; }
  });
}

/* ============================================================
   首页
   ============================================================ */
async function vHome() {
  const site = await loadSite();
  const [banners, cats, prods] = await Promise.all([
    API.get('/shop/banners').catch(() => []),
    API.get('/shop/categories').catch(() => []),
    API.get('/shop/products?size=8&hot=1').catch(() => ({ list: [] }))
  ]);
  const quick = (site.quickNav && site.quickNav.length) ? site.quickNav : [
    { name: '话费充值', icon: 'phone', cls: 'c2', link: '#/list/' + (cats.find((c) => c.name === '话费充值') ? cats.find((c) => c.name === '话费充值').id : ''), enabled: true },
    { name: '游戏充值', icon: 'game', cls: 'c1', link: '#/list/' + (cats.find((c) => c.name === '游戏充值') ? cats.find((c) => c.name === '游戏充值').id : ''), enabled: true },
    { name: '视频会员', icon: 'video', cls: 'c3', link: '#/list/' + (cats.find((c) => c.name === '视频会员') ? cats.find((c) => c.name === '视频会员').id : ''), enabled: true },
    { name: '音乐会员', icon: 'music', cls: 'c4', link: '#/list/' + (cats.find((c) => c.name === '音乐会员') ? cats.find((c) => c.name === '音乐会员').id : ''), enabled: true },
    { name: '软件激活', icon: 'code', cls: 'c5', link: '#/list/' + (cats.find((c) => c.name === '软件激活') ? cats.find((c) => c.name === '软件激活').id : ''), enabled: true },
    { name: '领券中心', icon: 'ticket', cls: 'c6', link: '#/coupons', enabled: true },
    { name: '我的收藏', icon: 'heart', cls: 'c7', link: '#/favorites', enabled: true },
    { name: '联系客服', icon: 'service', cls: 'c8', link: '#/service/chat', enabled: true }
  ].filter((q) => q.link !== '#/list/');
  if (!quick.some((q) => q.name === '开通分站')) quick.push({ name: '开通分站', icon: 'branch', cls: 'c9', link: Auth.user ? '#/open-branch' : '#/register', enabled: true, fixed: true });
  // 快捷入口定位为「功能直达」，与底部导航重复的导航项（如“首页”）不显示
  return {
    html: `
      <div style="background:linear-gradient(180deg, #1F2430 0%, #1F2430 150px, var(--bg) 150px);padding-bottom:10px">
        <div style="padding:14px 12px 12px">
          <div class="search-bar" data-goto="#/search">${icon('search', 18)}<span>搜索商品，如：话费充值</span></div>
        </div>
        <div class="px-12">
          <div class="swiper">
            <div class="swiper-track">
              ${banners.map((b) => `<div class="swiper-slide" data-banner='${JSON.stringify({ linkType: b.linkType, link: b.link }).replace(/'/g, '&#39;')}'><img src="${esc(b.image)}" alt="${esc(b.title)}"></div>`).join('')}
            </div>
            <div class="swiper-dots">${banners.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
          </div>
        </div>
        <div class="card" style="margin:10px 12px 0">
          <div class="quick-grid">
            ${(() => {
              const qs = quick.filter((q) => !(q.enabled === false || q.enabled === 0 || q.enabled === '0' || q.enabled === 'false') && q.name !== '首页');
              const pad = qs.length % 4 === 0 ? 0 : 4 - (qs.length % 4);
              const items = qs.map((q) => {
                const iconHtml = q.img ? `<img class="quick-img" src="${esc(q.img)}" alt="${esc(q.name)}" onerror="imgFallback(event)">` : `<span class="quick-icon ${q.cls || 'c1'}">${icon(q.icon || 'gift', 22)}</span>`;
                return `<div class="quick-item" data-goto="${esc(q.link || '#/home')}">${iconHtml}<span class="quick-text">${esc(q.name)}</span></div>`;
              }).join('');
              return items + '<div class="quick-item quick-item-empty"></div>'.repeat(pad);
            })()}
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-title"><span>${icon('star', 18, 'text-primary')} 热门推荐</span><span class="more" data-goto="#/list?all=1">更多</span></div>
        <div class="product-grid" id="hot-grid">${prods.list.map(productCard).join('')}</div>
        <div class="load-more" data-hot-more>加载更多</div>
      </div>`,
    mount() {
      const root = $('#view');
      bindGoto(root);
      // 轮播
      const track = $('.swiper-track', root);
      if (track && track.children.length > 1) {
        let cur = 0;
        const slides = $$('.swiper-slide', root);
        const dots = $$('.swiper-dots .dot', root);
        const go = (i) => {
          cur = (i + slides.length) % slides.length;
          track.style.transform = `translateX(-${cur * 100}%)`;
          dots.forEach((d, j) => d.classList.toggle('active', j === cur));
        };
        swiperTimer = setInterval(() => go(cur + 1), 3500);
        $$('.swiper-slide', root).forEach((s, i) => s.addEventListener('click', () => {
          const d = JSON.parse(s.getAttribute('data-banner').replace(/&#39;/g, "'"));
          if (d.linkType === 'product') location.hash = '#/product/' + d.link;
          else if (d.linkType === 'category') location.hash = '#/list/' + d.link;
          else if (d.linkType === 'url' && d.link) window.open(d.link, '_blank');
        }));
      }
      // 热门加载更多
      const moreBtn = $('[data-hot-more]', root);
      let page = 1;
      let loading = false;
      moreBtn.addEventListener('click', async () => {
        if (loading) return;
        loading = true;
        moreBtn.textContent = '加载中...';
        page++;
        try {
          const r = await API.get('/shop/products?size=8&page=' + page + '&hot=1');
          if (r.list.length) {
            $('#hot-grid', root).insertAdjacentHTML('beforeend', r.list.map(productCard).join(''));
            bindGoto($('#hot-grid', root));
            if (page >= r.pages) moreBtn.textContent = '没有更多了';
            else moreBtn.textContent = '加载更多';
          } else moreBtn.textContent = '没有更多了';
        } catch (e) { moreBtn.textContent = '加载更多'; toast(e.message, 'error'); }
        loading = false;
      });
    }
  };
}

/* ============================================================
   搜索
   ============================================================ */
async function vSearch() {
  const history = JSON.parse(localStorage.getItem('search_history') || '[]');
  const hot = await API.get('/shop/hot-keywords').catch(() => []);
  return {
    html: `
      <div class="search-page-top">
        <div class="search-bar">${icon('search', 18)}<input class="search-input" id="s-input" placeholder="搜索商品" autocomplete="off"></div>
        <button class="btn btn-sm" data-cancel style="height:38px">取消</button>
      </div>
      <div class="section" id="search-default">
        ${history.length ? `
          <div class="section-title"><span>历史搜索</span><span class="more" data-clear-hist>${icon('trash', 16)} 清空</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${history.map((h) => `<span class="cate-chip" data-kw="${esc(h)}">${esc(h)}</span>`).join('')}</div>` : ''}
        <div class="section-title"><span>热门搜索</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${hot.map((h, i) => `<span class="cate-chip ${i < 3 ? 'text-primary fw-600' : ''}" data-kw="${esc(h)}">${i + 1}. ${esc(h)}</span>`).join('')}</div>
      </div>
      <div class="section" id="search-result" style="display:none">
        <div class="product-list" id="result-list"></div>
        <div class="load-more" id="result-more">加载更多</div>
      </div>`,
    mount() {
      const root = $('#view');
      const input = $('#s-input', root);
      const defaultBox = $('#search-default', root);
      const resultBox = $('#search-result', root);
      let page = 1, kw = '', loading = false;

      const doSearch = async (keyword, reset) => {
        kw = keyword;
        if (reset) page = 1;
        if (reset) { $('#result-list', root).innerHTML = ''; $('#result-more', root).textContent = '加载更多'; }
        loading = true;
        $('#result-more', root).textContent = '加载中...';
        try {
          const r = await API.get('/shop/products?keyword=' + encodeURIComponent(kw) + '&page=' + page + '&size=10');
          if (reset && !r.list.length) {
            $('#result-list', root).innerHTML = emptyHtml('未找到相关商品', '去首页逛逛', '#/home');
            bindGoto($('#result-list', root));
          } else {
            $('#result-list', root).insertAdjacentHTML('beforeend', r.list.map((p) => productRow(p)).join(''));
            bindGoto($('#result-list', root));
          }
          $('#result-more', root).textContent = page >= r.pages ? '没有更多了' : '加载更多';
        } catch (e) { toast(e.message, 'error'); $('#result-more', root).textContent = '加载更多'; }
        loading = false;
      };

      const run = debounce(() => {
        const v = input.value.trim();
        if (!v) { defaultBox.style.display = ''; resultBox.style.display = 'none'; return; }
        defaultBox.style.display = 'none';
        resultBox.style.display = '';
        doSearch(v, true);
      }, 350);
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = input.value.trim(); if (v) { saveHist(v); doSearch(v, true); } } });

      $$('[data-kw]', root).forEach((el) => el.addEventListener('click', () => {
        const v = el.getAttribute('data-kw');
        input.value = v;
        saveHist(v);
        defaultBox.style.display = 'none';
        resultBox.style.display = '';
        doSearch(v, true);
      }));
      $('[data-clear-hist]', root)?.addEventListener('click', () => {
        localStorage.removeItem('search_history');
        defaultBox.innerHTML = '';
        toast('已清空', 'success');
      });
      $('[data-cancel]', root).addEventListener('click', () => { location.hash = '#/home'; });
      $('#result-more', root).addEventListener('click', async () => {
        if (loading) return;
        if (!kw) return;
        page++;
        doSearch(kw, false);
      });
      setTimeout(() => input.focus(), 100);
    }
  };
}
function saveHist(kw) {
  let h = JSON.parse(localStorage.getItem('search_history') || '[]');
  h = [kw, ...h.filter((x) => x !== kw)].slice(0, 8);
  localStorage.setItem('search_history', JSON.stringify(h));
}

/* ============================================================
   分类 / 商品列表
   ============================================================ */
async function vCategory() {
  const tree = await API.get('/shop/categories').catch(() => []);
  if (!tree.length) return { html: emptyHtml('暂无分类', '去首页', '#/home'), mount() { bindGoto($('#view')); } };
  let active = 0;
  return {
    html: `
      <div class="cate-wrap">
        <div class="cate-left" id="cate-left">${tree.map((c, i) => `<div class="cate-item ${i === 0 ? 'active' : ''}" data-i="${i}">${esc(c.name)}</div>`).join('')}</div>
        <div class="cate-right" id="cate-right"></div>
      </div>`,
    mount() {
      const root = $('#view');
      const right = $('#cate-right', root);
      const renderRight = async (i) => {
        const c = tree[i];
        const child = c.children || [];
        right.innerHTML = `
          <div class="cate-chips">${child.map((x, j) => `<span class="cate-chip ${j === 0 ? 'active' : ''}" data-cid="${x.id}">${esc(x.name)}</span>`).join('')}</div>
          <div class="product-grid" id="cate-grid"></div>
          <div class="load-more" data-more>加载更多</div>`;
        let page = 1, loading = false, curCid = child.length ? child[0].id : c.id;
        const loadGrid = async (reset) => {
          if (reset) { page = 1; $('#cate-grid', right).innerHTML = ''; }
          loading = true;
          $('[data-more]', right).textContent = '加载中...';
          try {
            const r = await API.get('/shop/products?categoryId=' + curCid + '&page=' + page + '&size=8');
            if (reset && !r.list.length) $('#cate-grid', right).innerHTML = emptyHtml('该分类暂无商品', '', '');
            else {
              $('#cate-grid', right).insertAdjacentHTML('beforeend', r.list.map(productCard).join(''));
              bindGoto($('#cate-grid', right));
            }
            $('[data-more]', right).textContent = page >= r.pages ? '没有更多了' : '加载更多';
          } catch (e) { $('[data-more]', right).textContent = '加载更多'; }
          loading = false;
        };
        $$('[data-cid]', right).forEach((el) => el.addEventListener('click', () => {
          $$('[data-cid]', right).forEach((x) => x.classList.toggle('active', x === el));
          curCid = Number(el.getAttribute('data-cid'));
          loadGrid(true);
        }));
        $('[data-more]', right).addEventListener('click', () => { if (!loading) { page++; loadGrid(false); } });
        loadGrid(true);
      };
      $$('.cate-item', root).forEach((el) => el.addEventListener('click', () => {
        const i = Number(el.getAttribute('data-i'));
        if (i === active) return;
        active = i;
        $$('.cate-item', root).forEach((x) => x.classList.toggle('active', x === el));
        renderRight(i);
      }));
      renderRight(0);
    }
  };
}

async function vList(params, query) {
  const categoryId = params[0] || query.categoryId || (query.all ? '' : '');
  let catName = query.name ? decodeURIComponent(query.name) : '';
  if (categoryId && !catName) {
    const tree = await API.get('/shop/categories').catch(() => []);
    const all = [];
    tree.forEach((c) => { all.push(c); (c.children || []).forEach((x) => all.push(x)); });
    const c = all.find((x) => x.id === Number(categoryId));
    catName = c ? c.name : '商品列表';
  }
  let sort = 'default', viewMode = 'grid', page = 1, loading = false;
  return {
    html: `${navBar(catName || '商品列表')}
      <div class="filter-bar">
        <div class="filter-item active" data-sort="default">综合</div>
        <div class="filter-item" data-sort="sales">销量</div>
        <div class="filter-item" data-sort="price">价格</div>
        <div class="filter-item" data-sort="new">新品</div>
        <span class="view-toggle" data-view>${icon('category', 20)}</span>
      </div>
      <div class="section">
        <div id="list-box" class="product-grid"></div>
        <div class="load-more" data-more>加载更多</div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      const box = $('#list-box', root);
      const load = async (reset) => {
        if (reset) { page = 1; box.innerHTML = ''; }
        loading = true;
        $('[data-more]', root).textContent = '加载中...';
        const sortParam = sort === 'price' ? 'priceAsc' : sort;
        let url = '/shop/products?page=' + page + '&size=10&sort=' + sortParam;
        if (categoryId) url += '&categoryId=' + categoryId;
        try {
          const r = await API.get(url);
          const html = (viewMode === 'grid' ? r.list.map(productCard) : r.list.map(productRow)).join('');
          if (reset && !r.list.length) box.innerHTML = emptyHtml('暂无商品', '', '');
          else { box.insertAdjacentHTML('beforeend', html); bindGoto(box); bindAddCart(box); }
          $('[data-more]', root).textContent = page >= r.pages ? '没有更多了' : '加载更多';
        } catch (e) { $('[data-more]', root).textContent = '加载更多'; toast(e.message, 'error'); }
        loading = false;
      };
      $$('[data-sort]', root).forEach((el) => el.addEventListener('click', () => {
        sort = el.getAttribute('data-sort');
        $$('[data-sort]', root).forEach((x) => x.classList.toggle('active', x === el));
        load(true);
      }));
      $('[data-view]', root).addEventListener('click', () => {
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        box.className = viewMode === 'grid' ? 'product-grid' : 'product-list';
        load(true);
      });
      $('[data-more]', root).addEventListener('click', () => { if (!loading) { page++; load(false); } });
      load(true);
    }
  };
}

/* ============================================================
   商品详情
   ============================================================ */
async function vProduct(params) {
  const id = params[0];
  const p = await API.get('/shop/products/' + id);
  return {
    html: `
      <div class="pd-gallery">
        <div class="swiper" style="border-radius:0">
          <div class="swiper-track">
            ${p.images.map((img) => `<div class="swiper-slide"><img src="${esc(img)}" onerror="imgFallback(event)" alt=""></div>`).join('')}
          </div>
          <div class="swiper-dots">${p.images.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
        </div>
      </div>
      <div style="position:relative">
        <button class="nav-btn" data-back style="position:absolute;top:10px;left:10px;background:rgba(31,36,48,0.4);color:#fff;z-index:5">${icon('back', 20)}</button>
        <div class="pd-info">
          <div class="pd-price-row"><div class="pd-price"><small>¥</small>${fmtPrice(p.price)}</div>${p.originalPrice > p.price ? `<div class="pd-orig">¥${fmtPrice(p.originalPrice)}</div>` : ''}${p.isHot ? '<span class="tag tag-primary">热卖</span>' : ''}</div>
          <div class="pd-name">${esc(p.name)}</div>
          ${p.subtitle ? `<div class="pd-sub">${esc(p.subtitle)}</div>` : ''}
          <div class="pd-meta"><span>已售 ${p.sales || 0}</span><span>库存 ${p.stock}</span><span id="pd-fav-text">${p.favorited ? '已收藏' : '收藏'}</span></div>
          <div class="pd-spec">
            <div class="pd-spec-row"><span class="k">发货方式</span><span class="${p.type === 'auto' ? 'text-success' : 'text-info'}">${p.type === 'auto' ? '自动发货 · 付款秒到' : '手动发货'}</span></div>
            <div class="pd-spec-row"><span class="k">商品类型</span><span>${p.type === 'auto' ? '卡密商品' : '实物/服务'}</span></div>
            ${p.cardNote ? `<div class="pd-spec-row"><span class="k">卡密说明</span><span style="text-align:right">${esc(p.cardNote)}</span></div>` : ''}
            <div class="pd-spec-row"><span class="k">购买数量</span><span><span class="stepper"><button data-minus>${icon('minus', 14)}</button><input id="qty" value="1" inputmode="numeric"><button data-plus>${icon('plus', 14)}</button></span></span></div>
          </div>
        </div>
      </div>
      <div class="pd-detail">
        <div class="pd-detail-title">商品详情</div>
        <div class="pd-detail-body">${esc(p.detail || '暂无详情描述。')}</div>
      </div>
      <div class="pd-bar">
        <div class="pd-act" data-fav>${icon(p.favorited ? 'heartFill' : 'heart', 22)}<span>收藏</span></div>
        <div class="pd-act" data-share>${icon('share', 22)}<span>分享</span></div>
        <div class="pd-act" data-service>${icon('service', 22)}<span>客服</span></div>
        <button class="btn btn-buy" data-buynow>立即购买</button>
        <button class="btn btn-cart" data-addcart>加入购物车</button>
      </div>
      <div style="height:64px"></div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      // 轮播
      const track = $('.pd-gallery .swiper-track', root);
      if (track && track.children.length > 1) {
        let cur = 0;
        const slides = $$('.pd-gallery .swiper-slide', root);
        const dots = $$('.pd-gallery .swiper-dots .dot', root);
        swiperTimer = setInterval(() => {
          cur = (cur + 1) % slides.length;
          track.style.transform = `translateX(-${cur * 100}%)`;
          dots.forEach((d, j) => d.classList.toggle('active', j === cur));
        }, 3000);
      }
      // 数量
      const qtyInput = $('#qty', root);
      $('[data-minus]', root).addEventListener('click', () => { qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) - 1); });
      $('[data-plus]', root).addEventListener('click', () => { qtyInput.value = Math.min(p.stock || 999, (parseInt(qtyInput.value) || 1) + 1); });
      // 收藏
      let fav = !!p.favorited;
      const favBtn = $('[data-fav]', root);
      const setFav = (v) => {
        fav = v;
        favBtn.innerHTML = `${icon(v ? 'heartFill' : 'heart', 22)}<span>${v ? '已收藏' : '收藏'}</span>`;
        favBtn.classList.toggle('active', v);
      };
      favBtn.addEventListener('click', async () => {
        if (!Auth.loggedIn) return location.hash = '#/login';
        try {
          if (fav) { await API.del('/user/favorites/' + p.id); setFav(false); toast('已取消收藏'); }
          else { await API.post('/user/favorites/' + p.id); setFav(true); toast('收藏成功', 'success'); }
        } catch (e) { toast(e.message, 'error'); }
      });
      $('[data-service]', root).addEventListener('click', () => location.hash = '#/service/chat');
      // 分享（移动端原生分享，降级为复制链接）
      $('[data-share]', root).addEventListener('click', async () => {
        const shareData = { title: p.name, text: `${p.name} 仅售 ¥${fmtPrice(p.price)}，${p.type === 'auto' ? '付款秒发卡密' : '下单后发货'}`, url: location.href };
        try {
          if (navigator.share) { await navigator.share(shareData); }
          else {
            await copyText(location.href);
            toast('链接已复制，快去分享吧', 'success');
          }
        } catch (e) { if (e && e.name !== 'AbortError') toast('分享失败', 'error'); }
      });
      const addToCart = async () => {
        if (!Auth.loggedIn) return location.hash = '#/login';
        const q = parseInt(qtyInput.value) || 1;
        try { await API.post('/user/cart', { productId: p.id, quantity: q }); toast('已加入购物车', 'success'); refreshCartBadge(); }
        catch (e) { toast(e.message, 'error'); }
      };
      $('[data-addcart]', root).addEventListener('click', addToCart);
      $('[data-buynow]', root).addEventListener('click', async () => {
        if (!Auth.loggedIn) return location.hash = '#/login';
        const q = parseInt(qtyInput.value) || 1;
        if (q > p.stock) return toast('库存不足', 'error');
        location.hash = '#/checkout/buy/' + p.id + '/' + q;
      });
    }
  };
}

/* 列表页加入购物车（未登录跳登录） */
function bindAddCart(root) {
  $$('[data-addcart]', root).forEach((el) => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!Auth.loggedIn) return location.hash = '#/login';
    try {
      await API.post('/user/cart', { productId: Number(el.getAttribute('data-addcart')), quantity: 1 });
      toast('已加入购物车', 'success');
      refreshCartBadge();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

/* ============================================================
   购物车
   ============================================================ */
async function vCart() {
  const items = await API.get('/user/cart');
  let editMode = false;
  return {
    html: `${navBar('购物车', '<span data-edit style="font-size:13px;color:var(--text-2);padding:0 6px">管理</span>')}
      <div class="section" style="padding-top:4px" id="cart-list">
        ${items.length ? items.map(cartItemHtml).join('') : ''}
      </div>
      ${items.length ? `
        <div class="cart-settle">
          <div class="checkbox ${items.every((i) => i.checked) ? 'checked' : ''}" data-all>${icon('check', 14)}</div>
          <span style="font-size:13px" data-alltext>全选</span>
          <div class="settle-total">合计：<b>¥<span id="settle-total">0.00</span></b></div>
          <button class="btn btn-primary settle-btn" data-settle>结算(<span id="settle-count">0</span>)</button>
        </div>` : ''}
      ${items.length ? '' : emptyHtml('购物车空空如也', '去逛逛', '#/home')}`,
    mount() {
      const root = $('#view');
      bindBack(root);
      if (!items.length) { bindGoto(root); return; }
      const list = $('#cart-list', root);
      const refreshUI = () => {
        const rows = $$('.cart-item', list);
        const checkedItems = rows.filter((r) => r.getAttribute('data-checked') === '1');
        const total = checkedItems.reduce((s, r) => s + (parseFloat(r.getAttribute('data-price')) * parseInt(r.getAttribute('data-qty'))), 0);
        $('#settle-total', root).textContent = total.toFixed(2);
        $('#settle-count', root).textContent = checkedItems.length;
        const allBox = $('[data-all]', root);
        if (allBox) allBox.classList.toggle('checked', rows.length > 0 && checkedItems.length === rows.length);
      };
      // 勾选 / 数量
      list.addEventListener('click', async (e) => {
        const row = e.target.closest('.cart-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (e.target.closest('[data-check]')) {
          const checked = row.getAttribute('data-checked') === '1' ? 0 : 1;
          row.setAttribute('data-checked', checked);
          $('[data-check]', row).classList.toggle('checked', !!checked);
          refreshUI();
          try { await API.put('/user/cart/' + id, { checked }); } catch (err) {}
          return;
        }
        if (e.target.closest('[data-minus]') || e.target.closest('[data-plus]')) {
          const qtyEl = $('.stepper input', row);
          let q = parseInt(qtyEl.value) || 1;
          q = e.target.closest('[data-minus]') ? q - 1 : q + 1;
          q = Math.max(1, Math.min(999, q));
          qtyEl.value = q;
          row.setAttribute('data-qty', q);
          refreshUI();
          try { await API.put('/user/cart/' + id, { quantity: q }); } catch (err) { toast(err.message, 'error'); }
          return;
        }
        if (e.target.closest('[data-del]')) {
          try {
            await API.del('/user/cart/' + id);
            row.remove();
            refreshUI();
            refreshCartBadge();
            if (!$('.cart-item', list)) {
              const box = $('.cart-settle', root); if (box) box.remove();
              list.insertAdjacentHTML('beforeend', emptyHtml('购物车空空如也', '去逛逛', '#/home'));
              bindGoto(list);
            }
          } catch (err) { toast(err.message, 'error'); }
          return;
        }
      });
      // 管理按钮
      $('[data-edit]', root).addEventListener('click', function () {
        editMode = !editMode;
        this.textContent = editMode ? '完成' : '管理';
        $$('[data-del]', list).forEach((d) => d.style.display = editMode ? '' : 'none');
      });
      // 全选
      $('[data-all]', root).addEventListener('click', async (e) => {
        const checked = !$('[data-all]', root).classList.contains('checked');
        $('[data-all]', root).classList.toggle('checked', checked);
        $$('.cart-item', list).forEach((r) => {
          r.setAttribute('data-checked', checked ? '1' : '0');
          $('[data-check]', r).classList.toggle('checked', checked);
        });
        refreshUI();
        try { await API.put('/user/cart/check-all', { checked }); } catch (err) {}
      });
      // 结算
      $('[data-settle]', root).addEventListener('click', () => {
        const count = parseInt($('#settle-count', root).textContent);
        if (!count) return toast('请先选择商品', 'error');
        location.hash = '#/checkout/cart';
      });
      // 左滑删除
      let startX = 0;
      list.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      list.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const row = e.target.closest('.cart-item');
        if (!row) return;
        if (dx < -50) { $$('.cart-item', list).forEach((r) => r.classList.remove('swiped')); row.classList.add('swiped'); }
        else if (dx > 50) row.classList.remove('swiped');
        else if (row.classList.contains('swiped')) row.classList.remove('swiped');
      }, { passive: true });
      refreshUI();
    }
  };
}

function cartItemHtml(i) {
  return `<div class="cart-item" data-id="${i.id}" data-checked="${i.checked}" data-price="${i.product.price}" data-qty="${i.quantity}">
    <div class="cart-main">
      <div class="checkbox ${i.checked ? 'checked' : ''}" data-check>${icon('check', 14)}</div>
      <img class="cart-img" src="${esc((i.product.images || ['/img/placeholder.svg'])[0])}" onerror="imgFallback(event)" data-goto="#/product/${i.product.id}" alt="">
      <div class="cart-body">
        <div class="cart-name">${esc(i.product.name)}</div>
        <div class="cart-spec">${i.product.type === 'auto' ? '自动发货' : '手动发货'} · 库存${i.product.stock}</div>
        <div class="cart-foot">
          <div class="cart-price"><small>¥</small>${fmtPrice(i.product.price)}</div>
          <span class="stepper"><button data-minus>${icon('minus', 14)}</button><input value="${i.quantity}" readonly><button data-plus>${icon('plus', 14)}</button></span>
        </div>
      </div>
    </div>
    <div class="swipe-del" data-del style="display:none">${icon('trash', 18)} 删除</div>
  </div>`;
}

/* ============================================================
   结算页
   ============================================================ */
async function vCheckout(params) {
  const mode = params[0]; // cart / buy
  let orderItems = [];
  if (mode === 'buy') {
    const pid = Number(params[1]), qty = Number(params[2]) || 1;
    const p = await API.get('/shop/products/' + pid);
    orderItems = [{ productId: p.id, name: p.name, image: p.images[0], price: p.price, quantity: qty, type: p.type }];
  } else {
    const cart = await API.get('/user/cart');
    orderItems = cart.filter((c) => c.checked).map((c) => ({
      productId: c.productId, cartId: c.id, name: c.product.name,
      image: (c.product.images || ['/img/placeholder.svg'])[0], price: c.product.price, quantity: c.quantity, type: c.product.type
    }));
  }
  if (!orderItems.length) return { html: emptyHtml('没有可结算的商品', '去逛逛', '#/home'), mount() { bindGoto($('#view')); } };

  const [addresses, myCoupons] = await Promise.all([
    API.get('/user/addresses'),
    API.get('/user/coupons')
  ]);
  let address = addresses.find((a) => a.isDefault) || addresses[0] || null;
  let selectedCoupon = null;
  let remark = '';
  const site = await loadSite();

  const goodsAmount = () => orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const couponAmount = () => {
    if (!selectedCoupon) return 0;
    const c = selectedCoupon;
    const g = goodsAmount();
    if (c.type === 'fullcut') return Math.min(c.amount, g);
    return Math.round(g * (1 - c.discount) * 100) / 100;
  };
  const payAmount = () => Math.max(0, Math.round((goodsAmount() - couponAmount()) * 100) / 100);
  const usableCoupons = myCoupons.filter((c) => c.status === 'unused' && (c.type === 'fullcut' ? goodsAmount() >= c.threshold : goodsAmount() >= (c.threshold || 0)));

  const render = () => {
    const addrHtml = address
      ? `<div class="flex" style="gap:12px">${icon('location', 24)}<div style="flex:1;min-width:0"><div class="fw-600">${esc(address.name)} ${esc(address.phone)}</div><div class="text-sm text-2 mt-8">${esc(address.region + ' ' + address.detail)}</div></div>${icon('right', 18)}</div>`
      : `<div class="flex" style="gap:12px">${icon('location', 24)}<span class="text-2">请选择收货地址</span>${icon('right', 18)}</div>`;
    const couponHtml = selectedCoupon
      ? `<span class="tag tag-primary">-¥${fmtPrice(couponAmount())} ${esc(selectedCoupon.name)}</span>`
      : `<span class="text-3">${usableCoupons.length ? '有 ' + usableCoupons.length + ' 张可用' : '暂无可用'}</span>`;
    return `${navBar('确认订单')}
      <div class="section" style="padding-top:4px">
        <div class="card" style="padding:14px" data-addr>${addrHtml}</div>
        <div class="card mt-12">
          <div class="section-title" style="margin:0;padding:12px 12px 4px">商品清单</div>
          ${orderItems.map((it) => `
            <div class="flex gap-10" style="padding:10px 12px;border-top:1px solid var(--line)">
              <img src="${esc(it.image)}" onerror="imgFallback(event)" style="width:52px;height:52px;border-radius:8px;object-fit:cover" alt="">
              <div style="flex:1;min-width:0">
                <div class="text-sm">${esc(it.name)}</div>
                <div class="text-xs text-3 mt-8">${esc(it.type === 'auto' ? '自动发货' : '手动发货')} × ${it.quantity}</div>
              </div>
              <span class="price text-sm"><small>¥</small>${fmtPrice(it.price * it.quantity)}</span>
            </div>`).join('')}
        </div>
        <div class="card mt-12">
          <div class="cell" data-coupon><span class="cell-icon">${icon('ticket', 20)}</span><div class="cell-body cell-title">优惠券</div><div class="cell-value">${couponHtml}</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="form-item" style="padding:10px 16px"><input class="input" id="remark" placeholder="订单备注（选填）"></div>
        </div>
        <div class="card mt-12" style="padding:14px">
          <div class="flex between text-sm py-10"><span class="text-2">商品金额</span><span>¥${fmtPrice(goodsAmount())}</span></div>
          <div class="flex between text-sm py-10"><span class="text-2">优惠抵扣</span><span style="color:${couponAmount() ? 'var(--danger)' : 'var(--text-2)'}">-¥${fmtPrice(couponAmount())}</span></div>
          <div class="flex between py-10"><span class="text-2">实付金额</span><span class="price" style="font-size:20px"><small>¥</small>${fmtPrice(payAmount())}</span></div>
        </div>
      </div>
      <div class="pay-fixed-btn"><button class="btn btn-primary btn-block" data-submit>提交订单</button></div>`;
  };

  return {
    html: render(),
    mount() {
      const root = $('#view');
      bindBack(root);
      const refresh = () => { root.innerHTML = render(); bindAll(); };
      const bindAll = () => {
        bindBack(root);
        $('[data-addr]', root).addEventListener('click', () => {
          if (!addresses.length) { location.hash = '#/address/new'; return; }
          openSheet(`<div class="sheet-title">选择收货地址</div><button class="sheet-close">${icon('close', 18)}</button>
            ${addresses.map((a) => `<div class="cell" data-pick-addr="${a.id}"><div class="cell-body"><div class="cell-title">${esc(a.name)} ${esc(a.phone)} ${a.isDefault ? '<span class="tag tag-primary">默认</span>' : ''}</div><div class="cell-desc">${esc(a.region + ' ' + a.detail)}</div></div>${address && address.id === a.id ? `<span class="text-primary">${icon('check', 18)}</span>` : ''}</div>`).join('')}
            <div class="cell" data-new-addr><div class="cell-body cell-title" style="color:var(--primary)">+ 新增收货地址</div></div>`).el.addEventListener('click', async (e) => {
            const pick = e.target.closest('[data-pick-addr]');
            if (pick) {
              address = addresses.find((a) => a.id === Number(pick.getAttribute('data-pick-addr')));
              document.querySelector('.sheet-mask')?.click();
              refresh();
            }
            if (e.target.closest('[data-new-addr]')) { location.hash = '#/address/new'; }
          });
        });
        $('[data-coupon]', root).addEventListener('click', () => {
          openSheet(`<div class="sheet-title">选择优惠券</div><button class="sheet-close">${icon('close', 18)}</button>
            <div class="cell" data-pick-coupon=""><div class="cell-body cell-title">不使用优惠券</div>${!selectedCoupon ? `<span class="text-primary">${icon('check', 18)}</span>` : ''}</div>
            ${usableCoupons.map((c) => `<div class="cell" data-pick-coupon="${c.id}">
              <div class="cell-body"><div class="cell-title">${esc(c.name)}</div><div class="cell-desc">${c.type === 'fullcut' ? '满' + fmtPrice(c.threshold) + '减' + fmtPrice(c.amount) : fmtPrice(c.discount * 10).replace(/\.0$/, '') + '折（满' + fmtPrice(c.threshold) + '可用）'} · ${fmtDate(c.endAt)} 到期</div></div>
              ${selectedCoupon && selectedCoupon.id === c.id ? `<span class="text-primary">${icon('check', 18)}</span>` : ''}</div>`).join('')}`).el.addEventListener('click', (e) => {
            const pick = e.target.closest('[data-pick-coupon]');
            if (!pick) return;
            const cid = Number(pick.getAttribute('data-pick-coupon'));
            selectedCoupon = cid ? usableCoupons.find((c) => c.id === cid) : null;
            document.querySelector('.sheet-mask')?.click();
            refresh();
          });
        });
        $('[data-submit]', root).addEventListener('click', async () => {
          if (!address) return toast('请选择收货地址', 'error');
          remark = $('#remark', root).value.trim();
          const btn = $('[data-submit]', root);
          btn.disabled = true;
          btn.textContent = '提交中...';
          try {
            const body = { from: mode === 'buy' ? 'buynow' : 'cart', addressId: address.id, remark };
            if (mode === 'buy') { body.productId = orderItems[0].productId; body.quantity = orderItems[0].quantity; }
            else body.cartIds = orderItems.map((it) => it.cartId);
            if (selectedCoupon) body.couponId = selectedCoupon.id;
            const r = await API.post('/user/orders', body);
            toast('订单创建成功', 'success');
            refreshCartBadge();
            location.hash = '#/pay/' + r.orderId;
          } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '提交订单'; }
        });
      };
      bindAll();
    }
  };
}

/* ============================================================
   支付页
   ============================================================ */
async function vPay(params) {
  const orderId = params[0];
  const site = await loadSite();
  const order = await API.get('/user/orders/' + orderId);
  let method = site.payWechat ? 'wechat' : (site.payAlipay ? 'alipay' : 'wechat');
  let paid = false;
  let payResult = null;
  let onlinePay = null;   // {channel, codeUrl, form}

  const methods = [];
  if (site.payWechat) methods.push({ key: 'wechat', name: '微信支付', desc: '支持扫码支付', color: '#12A150', icon: 'msg' });
  if (site.payAlipay) methods.push({ key: 'alipay', name: '支付宝', desc: '数亿用户的选择', color: '#0F6DFF', icon: 'wallet' });
  if (site.xunhuEnabled) {
    methods.push({ key: 'xunhu_wechat', name: '微信码支付', desc: '个人收款，秒到账', color: '#07C160', icon: 'msg' });
    methods.push({ key: 'xunhu_alipay', name: '支付宝码支付', desc: '个人收款，秒到账', color: '#1677FF', icon: 'wallet' });
  }
  if (site.manualPayEnabled) {
    methods.push({ key: 'manual', name: '手动转账', desc: '扫码转账，客服确认后发卡', color: '#FF6B35', icon: 'wallet' });
  }
  if (!methods.length) methods.push({ key: 'wechat', name: '微信支付', desc: '模拟支付（沙箱）', color: '#12A150', icon: 'msg' });

  const payView = () => `
    <div class="pay-amount-box">
      <div class="pa-label">${order.status === 'pending' ? '订单金额' : '已支付金额'}</div>
      <div class="pa-num"><small>¥</small>${fmtPrice(order.payAmount)}</div>
      <div class="pa-label mt-8">订单号：${esc(order.orderNo)}</div>
    </div>
    <div class="pay-methods">
      <div class="section-title"><span>支付方式</span></div>
      ${methods.map((m) => `
        <div class="pay-method ${method === m.key ? 'active' : ''}" data-method="${m.key}">
          <span class="pm-icon" style="background:${m.color}">${icon(m.icon, 20)}</span>
          <div class="pm-body"><div class="pm-name">${m.name}</div><div class="pm-desc">${m.desc}</div></div>
          <div class="checkbox ${method === m.key ? 'checked' : ''}">${icon('check', 14)}</div>
        </div>`).join('')}
      <div class="card" style="padding:12px 14px">
        <div class="flex between text-sm py-10"><span class="text-2">商品金额</span><span>¥${fmtPrice(order.goodsAmount)}</span></div>
        ${order.couponAmount > 0 ? `<div class="flex between text-sm py-10"><span class="text-2">优惠抵扣</span><span style="color:var(--danger)">-¥${fmtPrice(order.couponAmount)}</span></div>` : ''}
        <div class="flex between text-sm py-10"><span class="text-2">支付方式</span><span class="text-2">${method === 'wechat' ? '微信支付' : method === 'alipay' ? '支付宝' : method === 'xunhu_wechat' ? '微信码支付' : method === 'xunhu_alipay' ? '支付宝码支付' : '手动转账'}</span></div>
      </div>
    </div>
    <div class="pay-fixed-btn"><button class="btn btn-primary btn-block" data-confirm>确认支付 ¥${fmtPrice(order.payAmount)}</button></div>`;

  // 在线支付视图：微信扫码 / 支付宝内嵌收银台 / 虎皮椒二维码
  const onlineView = () => {
    if (onlinePay.channel === 'alipay') {
      return `
        <div class="card" style="margin:16px;padding:0;overflow:hidden">
          <div style="padding:14px 16px;font-weight:600;border-bottom:1px solid var(--line)">支付宝收银台</div>
          <iframe data-alipay-frame style="width:100%;height:520px;border:0" sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"></iframe>
        </div>
        <div class="form-actions px-12"><button class="btn btn-outline btn-block" data-cancel-pay>返回</button></div>`;
    }
    if (onlinePay.payMode === 'qrcode' && onlinePay.url_qrcode) {
      const isWx = onlinePay.channel && onlinePay.channel.indexOf('wechat') >= 0;
      return `
        <div style="text-align:center;padding:24px 16px 0">
          <div style="font-size:17px;font-weight:700">请使用${isWx ? '微信' : '支付宝'}扫一扫支付</div>
          <div class="text-2 text-sm mt-8">订单 ${esc(order.orderNo)}</div>
          <div class="qr-wrap" style="background:#fff;border-radius:14px;margin:20px auto;padding:14px;width:fit-content">
            <img src="${esc(onlinePay.url_qrcode)}" alt="支付二维码" style="width:220px;height:220px;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
            <div class="text-2" style="padding:20px;display:none">二维码加载失败，请刷新重试</div>
          </div>
          <div class="text-2 text-sm">支付完成后自动跳转，请勿关闭页面</div>
          <div style="margin-top:16px" class="text-sm text-2">扫码支付倒计时 <span data-countdown>10:00</span></div>
        </div>
        <div class="form-actions px-12"><button class="btn btn-outline btn-block" data-cancel-pay>返回重新选择</button></div>`;
    }
    return `
      <div style="text-align:center;padding:24px 16px 0">
        <div style="font-size:17px;font-weight:700">请使用微信扫一扫支付</div>
        <div class="text-2 text-sm mt-8">订单 ${esc(order.orderNo)}</div>
        <div class="qr-wrap" style="background:#fff;border-radius:14px;margin:20px auto;padding:14px;width:fit-content">
          ${typeof QRCode !== 'undefined' ? QRCode.toSVG(onlinePay.codeUrl, { size: 5, margin: 4, dark: '#000' }) : `<div class="text-2" style="padding:20px">二维码生成失败</div>`}
        </div>
        <div class="text-2 text-sm">支付完成后自动跳转，请勿关闭页面</div>
        <div style="margin-top:16px" class="text-sm text-2">扫码支付倒计时 <span data-countdown>10:00</span></div>
      </div>
      <div class="form-actions px-12"><button class="btn btn-outline btn-block" data-cancel-pay>返回重新选择</button></div>`;
  };

  // 手动转账视图：显示收款码 + 上传凭证
  const manualView = () => {
    const wx = site.wechatQrcode;
    const ali = site.alipayQrcode;
    const notice = site.payNotice || '请转账时备注订单号，付款后上传截图，客服确认后自动发卡';
    return `
      <div style="padding:16px">
        <div class="pay-amount-box" style="margin-bottom:16px">
          <div class="pa-label">订单金额</div>
          <div class="pa-num"><small>¥</small>${fmtPrice(order.payAmount)}</div>
          <div class="pa-label mt-8">订单号：${esc(order.orderNo)}</div>
        </div>
        <div class="card" style="padding:16px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:12px">请扫码转账 ¥${fmtPrice(order.payAmount)}</div>
          <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
            ${wx ? `<div style="text-align:center"><div style="font-size:13px;color:#07C160;margin-bottom:6px">微信收款</div><img src="${esc(wx)}" style="width:140px;height:140px;border-radius:8px;border:1px solid #eee" alt="微信收款码"></div>` : ''}
            ${ali ? `<div style="text-align:center"><div style="font-size:13px;color:#1677FF;margin-bottom:6px">支付宝收款</div><img src="${esc(ali)}" style="width:140px;height:140px;border-radius:8px;border:1px solid #eee" alt="支付宝收款码"></div>` : ''}
          </div>
          <div class="text-2 text-sm" style="margin-top:12px;line-height:1.6">${esc(notice)}</div>
        </div>
        <div class="card" style="padding:16px">
          <div style="font-weight:600;margin-bottom:10px">上传付款截图</div>
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <input class="input" id="manual-proof" placeholder="粘贴图片URL，或点击右侧选择图片" style="flex:1;min-width:0">
            <button class="btn btn-outline" id="manual-pick" style="flex-shrink:0;white-space:nowrap">${icon('image', 16)} 选择图片</button>
          </div>
          <input type="file" id="manual-proof-file" accept="image/*" style="display:none">
          <img id="manual-proof-prev" hidden style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:1px solid var(--line);margin-bottom:10px" alt="付款截图预览">
          <button class="btn btn-primary btn-block" id="manual-submit">提交凭证，等待确认</button>
        </div>
        <div class="form-actions" style="padding:16px 0 30px">
          <button class="btn btn-outline btn-block" data-cancel-pay>返回重新选择</button>
        </div>
      </div>`;
  };

  const resultView = () => {
    const cards = (payResult && payResult.cards) || [];
    return `
      <div style="text-align:center;padding:0 16px">
        <div class="pay-result-icon">${icon('check', 40)}</div>
        <div style="font-size:18px;font-weight:700">支付成功</div>
        <div class="text-2 text-sm mt-8">订单 ${esc(order.orderNo)}</div>
        ${payResult.autoShipped ? `<div class="tag tag-success" style="margin-top:10px">卡密已自动发货</div>` : `<div class="tag tag-info" style="margin-top:10px">商家将尽快发货</div>`}
      </div>
      ${payResult.autoShipped && cards.length ? `
        <div class="section">
          <div class="section-title"><span>卡密信息</span></div>
          ${cards.map((c) => `<div class="card-secret">
            <div class="cs-row">
              <div><div class="cs-code">${esc(c.code)}</div>${c.secret ? `<div class="cs-secret">${esc(c.secret)}</div>` : ''}</div>
              <div class="cs-ops"><button class="btn btn-outline btn-sm" data-copy="${esc(c.code + (c.secret ? '----' + c.secret : ''))}">${icon('copy', 14)} 复制</button></div>
            </div></div>`).join('')}
        </div>` : ''}
      <div class="form-actions px-12" style="padding-bottom:30px">
        <button class="btn btn-outline btn-block" data-goto="#/orders/all">查看订单</button>
        <button class="btn btn-primary btn-block mt-12" data-goto="#/home">回到首页</button>
      </div>`;
  };

  function showResult(o) {
    paid = true;
    payResult = { orderId: o.id, status: o.status, autoShipped: o.status === 'shipped', cardsDelivered: (o.cards || []).length, cards: o.cards || [] };
    root.innerHTML = resultView();
    bindGoto(root);
    bindCopy(root);
    refreshMsgBadge();
  }

  async function pollPay() {
    // 超时与订单自动取消时间对齐（settings.pendingCancelMinutes，默认 30 分钟）
    const cancelMinutes = Math.max(1, parseInt(site.pendingCancelMinutes || 30) || 30);
    const deadline = Date.now() + cancelMinutes * 60 * 1000;
    const countdown = $('[data-countdown]');
    const timer = setInterval(() => {
      if (!countdown) return;
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      countdown.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      if (left <= 0) clearInterval(timer);
    }, 1000);
    while (Date.now() < deadline) {
      await sleep(2500);
      try {
        const o = await API.get('/user/orders/' + orderId);
        if (o.status !== 'pending' && o.status !== 'pending_confirm') { clearInterval(timer); showResult(o); return; }
      } catch (e) { /* 网络抖动忽略 */ }
    }
    clearInterval(timer);
    toast('支付超时，如已付款请刷新订单查看', 'info');
  }

  function bindManualUpload() {
    const file = $('#manual-proof-file', root);
    const pick = $('#manual-pick', root);
    if (!file || !pick || pick.dataset.bound) return;
    pick.dataset.bound = '1';
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) return toast('请选择图片文件', 'error');
      if (f.size > 3 * 1024 * 1024) return toast('图片不能超过 3MB', 'error');
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const r = await API.post('/user/upload', { data: fr.result.split(',')[1], ext });
          $('#manual-proof', root).value = r.url;
          const prev = $('#manual-proof-prev', root);
          if (prev) { prev.src = r.url; prev.hidden = false; }
          toast('图片已上传，请提交凭证', 'success');
        } catch (e) { toast(e.message, 'error'); }
      };
      fr.readAsDataURL(f);
      file.value = '';
    });
  }

  const root = $('#view');

  async function onConfirm(btn) {
    btn.disabled = true;
    btn.textContent = '支付处理中...';
    try {
      const r = await API.post('/user/orders/' + orderId + '/pay', { method });
      if (r.payMode === 'manual') {
        root.innerHTML = `${navBar('手动转账')}${manualView()}`;
        bindBack(root);
        bindManualUpload();
        $('#manual-submit').addEventListener('click', async () => {
          const proof = $('#manual-proof').value.trim();
          if (!proof) return toast('请粘贴付款截图链接', 'error');
          try {
            await API.post('/user/orders/' + orderId + '/pay-proof', { payProof: proof });
            toast('凭证已提交，请等待客服确认', 'success');
            setTimeout(() => { location.hash = '#/orders/all'; }, 1500);
          } catch (e) { toast(e.message, 'error'); }
        });
        $$('[data-cancel-pay]', root).forEach((el) => el.addEventListener('click', () => {
          root.innerHTML = `${navBar('收银台')}${payView()}`;
          bindBack(root);
          mountPay();
        }));
        return;
      }
      if (r.payMode === 'online' || r.payMode === 'qrcode') {
        onlinePay = r;
        root.innerHTML = `${navBar('收银台')}${onlineView()}`;
        bindBack(root);
        // 支付宝：iframe 自动提交表单
        if (r.channel === 'alipay') {
          const frame = $('[data-alipay-frame]', root);
          frame.srcdoc = r.form;
        }
        $$('[data-cancel-pay]', root).forEach((el) => el.addEventListener('click', () => {
          onlinePay = null;
          root.innerHTML = `${navBar('收银台')}${payView()}`;
          bindBack(root);
          mountPay();
        }));
        pollPay();
      } else {
        payResult = r;
        const updated = await API.get('/user/orders/' + orderId);
        payResult.cards = updated.cards;
        root.innerHTML = resultView();
        bindGoto(root);
        bindCopy(root);
        refreshMsgBadge();
        toast('支付成功', 'success');
      }
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = '确认支付 ¥' + fmtPrice(order.payAmount);
    }
  }

  function mountPay() {
    $$('[data-method]', root).forEach((el) => el.addEventListener('click', () => {
      method = el.getAttribute('data-method');
      $$('[data-method]', root).forEach((x) => {
        x.classList.toggle('active', x === el);
        $('.checkbox', x).classList.toggle('checked', x === el);
      });
    }));
    const confirmBtn = $('[data-confirm]', root);
    if (confirmBtn && !confirmBtn.dataset.bound) {
      confirmBtn.dataset.bound = '1';
      confirmBtn.addEventListener('click', () => onConfirm(confirmBtn));
    }
  }

  return {
    html: paid ? resultView() : (order.status === 'pending_confirm' ? `${navBar('手动转账')}${manualView()}` : `${navBar('收银台')}${payView()}`),
    mount() {
      bindBack(root);
      if (paid) { bindGoto(root); bindCopy(root); return; }
      if (order.status === 'pending_confirm') {
        bindManualUpload();
        $('#manual-submit').addEventListener('click', async () => {
          const proof = $('#manual-proof').value.trim();
          if (!proof) return toast('请粘贴付款截图链接', 'error');
          try {
            await API.post('/user/orders/' + orderId + '/pay-proof', { payProof: proof });
            toast('凭证已提交，请等待客服确认', 'success');
            setTimeout(() => { location.hash = '#/orders/all'; }, 1500);
          } catch (e) { toast(e.message, 'error'); }
        });
        return;
      }
      mountPay();
    }
  };
}

function bindCopy(root) {
  $$('[data-copy]', root).forEach((el) => el.addEventListener('click', () => copyText(el.getAttribute('data-copy'))));
}

/* ============================================================
   订单列表
   ============================================================ */
const ORDER_TABS = [
  { key: 'all', text: '全部' }, { key: 'pending', text: '待付款' },
  { key: 'paid', text: '待发货' }, { key: 'shipped', text: '待收货' },
  { key: 'completed', text: '已完成' }, { key: 'cancelled', text: '已取消' }
];

async function vOrders(params) {
  const status = params[0] || 'all';
  let page = 1, loading = false, list = [];
  return {
    html: `${navBar('我的订单')}
      <div class="tabs scrollable">
        ${ORDER_TABS.map((t) => `<div class="tab-item ${t.key === status ? 'active' : ''}" data-goto="#/orders/${t.key}">${t.text}</div>`).join('')}
      </div>
      <div class="section" style="padding-top:10px" id="order-list"></div>
      <div class="load-more" data-more>加载更多</div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      const box = $('#order-list', root);
      const load = async (reset) => {
        if (reset) { page = 1; box.innerHTML = ''; }
        loading = true;
        $('[data-more]', root).textContent = '加载中...';
        try {
          const r = await API.get('/user/orders?status=' + status + '&page=' + page + '&size=8');
          if (reset && !r.list.length) { box.innerHTML = emptyHtml('暂无订单', '去逛逛', '#/home'); bindGoto(box); }
          else {
            box.insertAdjacentHTML('beforeend', r.list.map(orderCardHtml).join(''));
            bindOrderActions(box);
          }
          $('[data-more]', root).textContent = page >= r.pages ? '没有更多了' : '加载更多';
        } catch (e) { toast(e.message, 'error'); $('[data-more]', root).textContent = '加载更多'; }
        loading = false;
      };
      $('[data-more]', root).addEventListener('click', () => { if (!loading) { page++; load(false); } });
      load(true);
    }
  };
}

function orderCardHtml(o) {
  const st = ORDER_STATUS[o.status] || { text: o.status, cls: '' };
  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn btn-plain btn-sm" data-act="cancel" data-id="${o.id}">取消订单</button>`);
    actions.push(`<button class="btn btn-primary btn-sm" data-goto="#/pay/${o.id}">去支付</button>`);
  }
  if (o.status === 'pending_confirm') {
    actions.push(`<button class="btn btn-plain btn-sm" data-act="cancel" data-id="${o.id}">取消订单</button>`);
    actions.push(`<button class="btn btn-outline btn-sm" data-goto="#/pay/${o.id}">查看收款码</button>`);
  }
  if (o.status === 'shipped') actions.push(`<button class="btn btn-primary btn-sm" data-act="confirm" data-id="${o.id}">确认收货</button>`);
  if (['paid', 'shipped', 'completed'].includes(o.status)) actions.push(`<button class="btn btn-plain btn-sm" data-goto="#/aftersale/${o.id}">申请售后</button>`);
  if (['completed', 'cancelled', 'refunded'].includes(o.status)) actions.push(`<button class="btn btn-outline btn-sm" data-goto="#/product/${o.goods[0].productId}">再次购买</button>`);
  return `<div class="order-card" data-goto="#/order/${o.id}">
    <div class="order-head"><span>${esc(o.orderNo)}</span><span class="order-status ${st.cls}">${st.text}</span></div>
    ${o.goods.map((g) => `
      <div class="order-goods">
        <img src="${esc(g.image)}" onerror="imgFallback(event)" alt="">
        <div class="og-body">
          <div class="og-name">${esc(g.name)}</div>
          <div class="og-spec">${g.type === 'auto' ? '自动发货' : '手动发货'} × ${g.quantity}</div>
        </div>
        <div class="og-price"><b>¥${fmtPrice(g.price * g.quantity)}</b></div>
      </div>`).join('')}
    <div class="order-amount">共${o.goods.reduce((s, g) => s + g.quantity, 0)}件 实付 <b>¥${fmtPrice(o.payAmount)}</b></div>
    <div class="order-actions">${actions.join('')}</div>
  </div>`;
}

function bindOrderActions(root) {
  bindGoto(root);
  $$('[data-act]', root).forEach((el) => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = el.getAttribute('data-id');
    const act = el.getAttribute('data-act');
    if (act === 'cancel') {
      if (!await confirmDlg('确定取消该订单吗？')) return;
      try { await API.post('/user/orders/' + id + '/cancel', { reason: '用户主动取消' }); toast('已取消', 'success'); el.closest('.order-card').remove(); }
      catch (err) { toast(err.message, 'error'); }
    } else if (act === 'confirm') {
      if (!await confirmDlg('确认已收到商品/卡密？')) return;
      try { await API.post('/user/orders/' + id + '/confirm'); toast('已确认收货', 'success'); el.closest('.order-card').remove(); }
      catch (err) { toast(err.message, 'error'); }
    }
  }));
}

/* ============================================================
   订单详情
   ============================================================ */
async function vOrder(params) {
  const id = params[0];
  const o = await API.get('/user/orders/' + id);
  const st = ORDER_STATUS[o.status] || { text: o.status, cls: '' };
  const steps = ['提交订单', '付款', '发货', '完成'];
  let stepIdx = -1;
  if (o.status === 'pending') stepIdx = 0;
  else if (o.status === 'pending_confirm') stepIdx = 0;
  else if (o.status === 'paid') stepIdx = 1;
  else if (o.status === 'shipped') stepIdx = 2;
  else if (o.status === 'completed') stepIdx = 3;
  const stepHtml = ['cancelled', 'refunded'].includes(o.status)
    ? `<div class="card" style="padding:20px;text-align:center"><div class="text-danger fw-600" style="font-size:16px">${st.text}</div><div class="text-sm text-2 mt-8">${esc(o.cancelReason || '')}</div></div>`
    : `<div class="steps" style="margin:10px 12px 0">
        ${steps.map((s, i) => `<div class="step ${i < stepIdx ? 'done' : ''} ${i === stepIdx ? 'active' : ''}"><div class="step-dot">${i < stepIdx ? icon('check', 11) : i + 1}</div>${s}</div>`).join('')}
      </div>`;

  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn btn-plain" data-act="cancel">取消订单</button>`);
    actions.push(`<button class="btn btn-primary" data-goto="#/pay/${o.id}">立即支付</button>`);
  }
  if (o.status === 'pending_confirm') {
    actions.push(`<button class="btn btn-plain" data-act="cancel">取消订单</button>`);
    actions.push(`<button class="btn btn-primary" data-goto="#/pay/${o.id}">查看收款码</button>`);
  }
  if (o.status === 'shipped') actions.push(`<button class="btn btn-primary" data-act="confirm">确认收货</button>`);
  if (['paid', 'shipped', 'completed'].includes(o.status)) actions.push(`<button class="btn btn-outline" data-goto="#/aftersale/${o.id}">申请售后</button>`);

  return {
    html: `${navBar('订单详情')}
      ${stepHtml}
      <div class="section" style="padding-top:12px">
        <div class="card" style="padding:14px">
          <div class="flex" style="gap:10px">${icon('location', 20, 'text-primary')}<div style="flex:1"><div class="fw-600">${esc(o.address.name)} ${esc(o.address.phone)}</div><div class="text-sm text-2 mt-8">${esc(o.address.region + ' ' + o.address.detail)}</div></div></div>
        </div>
        <div class="card mt-12">
          <div class="section-title" style="margin:0;padding:12px 12px 4px">商品信息</div>
          ${o.goods.map((g) => `
            <div class="flex gap-10" style="padding:10px 12px;border-top:1px solid var(--line)" data-goto="#/product/${g.productId}">
              <img src="${esc(g.image)}" onerror="imgFallback(event)" style="width:52px;height:52px;border-radius:8px;object-fit:cover" alt="">
              <div style="flex:1;min-width:0"><div class="text-sm">${esc(g.name)}</div><div class="text-xs text-3 mt-8">${g.type === 'auto' ? '自动发货' : '手动发货'} × ${g.quantity}</div></div>
              <span class="price text-sm"><small>¥</small>${fmtPrice(g.price * g.quantity)}</span>
            </div>`).join('')}
        </div>
        ${(o.cards && o.cards.length) ? `
          <div class="section-title" style="margin-top:12px"><span>卡密信息</span><span class="text-3 text-xs">${o.logistics || '自动发货'}</span></div>
          ${o.cards.map((c) => `<div class="card-secret">
            <div class="cs-row">
              <div><div class="cs-code">${esc(c.code)}</div>${c.secret ? `<div class="cs-secret">${esc(c.secret)}</div>` : ''}</div>
              <div class="cs-ops"><button class="btn btn-outline btn-sm" data-copy="${esc(c.code + (c.secret ? '----' + c.secret : ''))}">${icon('copy', 14)} 复制</button></div>
            </div></div>`).join('')}` : ''}
        <div class="card mt-12" style="padding:14px">
          <div class="flex between text-sm py-10"><span class="text-2">商品金额</span><span>¥${fmtPrice(o.goodsAmount)}</span></div>
          ${o.couponAmount > 0 ? `<div class="flex between text-sm py-10"><span class="text-2">优惠抵扣</span><span style="color:var(--danger)">-¥${fmtPrice(o.couponAmount)}</span></div>` : ''}
          <div class="flex between text-sm py-10"><span class="text-2">实付金额</span><span class="price">¥${fmtPrice(o.payAmount)}</span></div>
          ${o.payMethod ? `<div class="flex between text-sm py-10"><span class="text-2">支付方式</span><span>${o.payMethod === 'wechat' ? '微信支付' : '支付宝'}</span></div>` : ''}
          ${o.trackingNo && o.trackingNo !== '自动发货' ? `<div class="flex between text-sm py-10"><span class="text-2">物流信息</span><span>${esc(o.logistics)} ${esc(o.trackingNo)}</span></div>` : ''}
          <div class="flex between text-sm py-10"><span class="text-2">订单编号</span><span class="text-2">${esc(o.orderNo)}</span></div>
          <div class="flex between text-sm py-10"><span class="text-2">下单时间</span><span class="text-2">${fmtTime(o.createdAt)}</span></div>
          ${o.remark ? `<div class="flex between text-sm py-10"><span class="text-2">订单备注</span><span>${esc(o.remark)}</span></div>` : ''}
        </div>
      </div>
      ${actions.length ? `<div class="pay-fixed-btn"><div class="flex gap-10">${actions.join('')}</div></div>` : ''}`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      bindCopy(root);
      $$('[data-act]', root).forEach((el) => el.addEventListener('click', async () => {
        const act = el.getAttribute('data-act');
        if (act === 'cancel') {
          if (!await confirmDlg('确定取消该订单吗？')) return;
          try { await API.post('/user/orders/' + id + '/cancel', { reason: '用户主动取消' }); toast('已取消', 'success'); location.reload(); }
          catch (e) { toast(e.message, 'error'); }
        } else if (act === 'confirm') {
          if (!await confirmDlg('确认已收到商品/卡密？')) return;
          try { await API.post('/user/orders/' + id + '/confirm'); toast('已确认收货', 'success'); location.reload(); }
          catch (e) { toast(e.message, 'error'); }
        }
      }));
    }
  };
}

/* ============================================================
   售后
   ============================================================ */
async function vAftersaleApply(params) {
  const orderId = params[0];
  let images = [];
  return {
    html: `${navBar('申请售后')}
      <div class="form">
        <div class="form-card">
          <div class="form-item"><span class="form-label">售后类型</span>
            <div class="gender-options">
              <label><span class="checkbox round-s checked" data-type="refund">${icon('check', 12)}</span>仅退款</label>
              <label><span class="checkbox round-s" data-type="return">${icon('check', 12)}</span>退货退款</label>
            </div>
          </div>
          <div class="form-item" style="align-items:flex-start"><span class="form-label" style="padding-top:4px">原因说明</span><textarea class="input" id="reason" rows="3" placeholder="请详细描述售后原因" style="resize:none;line-height:1.7"></textarea></div>
          <div class="form-item" style="align-items:flex-start"><span class="form-label" style="padding-top:4px">上传凭证</span>
            <div style="flex:1">
              <div id="img-list" style="display:flex;gap:8px;flex-wrap:wrap"></div>
              <button class="btn btn-plain btn-sm mt-8" data-addimg>${icon('camera', 16)} 添加图片（最多3张）</button>
              <input type="file" id="img-input" accept="image/*" style="display:none">
            </div>
          </div>
        </div>
        <div class="form-tip">提交后请耐心等待，管理员将在 24 小时内处理。同意退款后卡密将回收。</div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-submit>提交申请</button></div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      let type = 'refund';
      $$('[data-type]', root).forEach((el) => el.addEventListener('click', () => {
        type = el.getAttribute('data-type');
        $$('[data-type]', root).forEach((x) => x.classList.toggle('checked', x === el));
      }));
      const imgInput = $('#img-input', root);
      $('[data-addimg]', root).addEventListener('click', () => imgInput.click());
      imgInput.addEventListener('change', async () => {
        const files = Array.from(imgInput.files || []).slice(0, 3 - images.length);
        for (const f of files) {
          if (!/^image\//.test(f.type)) { toast('请选择图片文件', 'error'); continue; }
          if (f.size > 3 * 1024 * 1024) { toast('图片不能超过3MB', 'error'); continue; }
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const data = String(reader.result).split(',')[1];
              const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
              const r = await API.post('/user/upload', { data, ext });
              images.push(r.url);
              $('#img-list', root).insertAdjacentHTML('beforeend', `<div style="position:relative"><img src="${esc(r.url)}" style="width:72px;height:72px;border-radius:8px;object-fit:cover" alt=""><button data-rm-img style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center">${icon('close', 12)}</button></div>`);
              $$('[data-rm-img]', $('#img-list', root)).forEach((b) => b.addEventListener('click', () => {
                images = images.filter((u) => u !== b.parentElement.querySelector('img').src.replace(location.origin, ''));
                b.parentElement.remove();
              }));
            } catch (e) { toast(e.message, 'error'); }
          };
          reader.readAsDataURL(f);
        }
        imgInput.value = '';
      });
      $('[data-submit]', root).addEventListener('click', async () => {
        const reason = $('#reason', root).value.trim();
        if (!reason) return toast('请填写售后原因', 'error');
        try {
          await API.post('/user/orders/' + orderId + '/aftersale', { type, reason, images });
          toast('提交成功', 'success');
          location.hash = '#/aftersales';
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

async function vAftersales() {
  const list = await API.get('/user/aftersales');
  return {
    html: `${navBar('售后记录')}
      <div class="section" style="padding-top:4px">
        ${list.length ? list.map((a) => {
          const st = AFTERSALE_STATUS[a.status] || { text: a.status, cls: '' };
          return `<div class="ticket-card">
            <div class="ticket-head"><span class="ticket-type">${a.type === 'refund' ? '仅退款' : '退货退款'} · ${esc(a.order ? a.order.orderNo : '')}</span><span class="tag ${st.cls === 'status-pending' ? 'tag-warning' : st.cls === 'status-completed' ? 'tag-success' : 'tag-gray'}">${st.text}</span></div>
            <div class="ticket-desc">${esc(a.reason)}</div>
            ${a.images && a.images.length ? `<div class="flex gap-8 mt-8">${a.images.map((img) => `<img src="${esc(img)}" style="width:56px;height:56px;border-radius:6px;object-fit:cover" alt="">`).join('')}</div>` : ''}
            ${a.status !== 'pending' ? `<div class="ticket-reply">管理员回复：${esc(a.reply || '')}</div>` : ''}
            <div class="ticket-meta">申请时间：${fmtTime(a.createdAt)}${a.handledAt ? ' · 处理时间：' + fmtTime(a.handledAt) : ''} · 金额 ¥${fmtPrice(a.amount)}</div>
          </div>`;
        }).join('') : emptyHtml('暂无售后记录', '去首页', '#/home')}
      </div>`,
    mount() { bindBack($('#view')); bindGoto($('#view')); }
  };
}

/* ============================================================
   个人中心
   ============================================================ */
async function vUser() {
  const [me, stats] = await Promise.all([
    API.get('/auth/me'),
    API.get('/user/order-stats')
  ]);
  Auth.user = me.user;
  const count = (st) => (stats[st] || 0);
  const nextLevel = me.user.level >= 5 ? null : (me.user.level === 1 ? 500 : me.user.level === 2 ? 2000 : me.user.level === 3 ? 5000 : 10000);
  const prevLevel = me.user.level === 1 ? 0 : (me.user.level === 2 ? 500 : me.user.level === 3 ? 2000 : me.user.level === 4 ? 5000 : 10000);
  const progress = nextLevel ? Math.min(100, Math.round((me.user.totalSpend - prevLevel) / (nextLevel - prevLevel) * 100)) : 100;
  return {
    html: `
      <div class="user-hero">
        <div class="u-top">
          <img class="u-avatar" src="${esc(me.user.avatar)}" onerror="imgFallback(event)" data-goto="#/profile" alt="">
          <div style="flex:1">
            <div class="u-name">${esc(me.user.nickname)}</div>
            <div class="u-phone">${esc(me.user.email || '未绑定邮箱')}</div>
            <div class="u-level">
              <span class="u-level-tag">${esc(me.user.levelName)}</span>
              <div class="u-level-bar"><i style="width:${progress}%"></i></div>
              <span class="u-points">${nextLevel ? '距下一级还差 ¥' + fmtPrice(nextLevel - me.user.totalSpend) : '已达最高等级'}</span>
            </div>
          </div>
          <div style="text-align:center" data-goto="#/points">
            <div class="fw-600" style="font-size:20px">${me.user.points}</div>
            <div class="u-points">积分</div>
          </div>
        </div>
      </div>
      <div class="section" style="margin-top:-14px;position:relative">
        <div class="user-order-short">
          <div class="uos-item" data-goto="#/orders/pending"><span class="uos-icon">${icon('wallet', 22)}${count('pending') ? `<span class="uos-num">${count('pending')}</span>` : ''}</span><div class="uos-text">待付款</div></div>
          <div class="uos-item" data-goto="#/orders/paid"><span class="uos-icon">${icon('box', 22)}${count('paid') ? `<span class="uos-num">${count('paid')}</span>` : ''}</span><div class="uos-text">待发货</div></div>
          <div class="uos-item" data-goto="#/orders/shipped"><span class="uos-icon">${icon('truck', 22)}${count('shipped') ? `<span class="uos-num">${count('shipped')}</span>` : ''}</span><div class="uos-text">待收货</div></div>
          <div class="uos-item" data-goto="#/aftersales"><span class="uos-icon">${icon('refresh', 22)}</span><div class="uos-text">售后</div></div>
          <div class="uos-item" data-goto="#/orders/all"><span class="uos-icon">${icon('order', 22)}</span><div class="uos-text">全部订单</div></div>
        </div>
      </div>
      <div class="section" style="padding-top:0">
        <div class="cell-group">
          <div class="cell" data-goto="#/favorites"><span class="cell-icon">${icon('heart', 20)}</span><div class="cell-body cell-title">我的收藏</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/addresses"><span class="cell-icon">${icon('location', 20)}</span><div class="cell-body cell-title">收货地址</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/coupons"><span class="cell-icon">${icon('ticket', 20)}</span><div class="cell-body cell-title">优惠券 / 领券中心</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
        <div class="cell-group">
          <div class="cell" data-goto="#/vip"><span class="cell-icon">${icon('vip', 20)}</span><div class="cell-body cell-title">会员中心</div><div class="cell-value">${esc(me.user.levelName)}</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/points"><span class="cell-icon">${icon('point', 20)}</span><div class="cell-body cell-title">我的积分</div><div class="cell-value">${me.user.points} 分</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/aftersales"><span class="cell-icon">${icon('refresh', 20)}</span><div class="cell-body cell-title">售后管理</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
        <div class="cell-group">
          <div class="cell" data-goto="#/open-branch"><span class="cell-icon" style="color:#7C3AED">${icon('branch', 20)}</span><div class="cell-body cell-title">开通分站</div><div class="cell-value" id="branch-state">成为代理商</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/service/chat"><span class="cell-icon">${icon('service', 20)}</span><div class="cell-body cell-title">联系客服</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-goto="#/settings"><span class="cell-icon">${icon('setting', 20)}</span><div class="cell-body cell-title">系统设置</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
      </div>`,
    mount() {
      const root = $('#view');
      bindGoto(root);
      refreshMsgBadge();
      API.get('/user/my-branch').then((r) => {
        const el = $('#branch-state', root);
        if (el) el.textContent = r ? '已开通：' + r.username : '成为代理商';
        if (r) {
          const cell = $('[data-goto="#/open-branch"]', root);
          if (cell) {
            cell.setAttribute('data-goto', '#/branch-manage');
            cell.addEventListener('click', () => { location.hash = '#/branch-manage'; });
          }
        }
      }).catch(() => {});
    }
  };
}

/* ============================================================
   分站管理（用户端内嵌，功能合二为一，无需跳转独立分站后台）
   ============================================================ */
async function vBranchManage(params) {
  const sub = params[0] || 'overview';
  let me = null;
  try { me = await API.get('/branch/me'); } catch (e) {
    return {
      html: `${navBar('分站管理')}<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">${esc((e && e.message) || '获取分站信息失败')}</div><div class="text-xs text-3" style="margin-top:6px">开通分站后即可在此管理</div><button class="btn btn-primary" style="margin-top:12px" data-goto="#/open-branch">去开通分站</button></div>`,
      mount() { bindBack($('#view')); bindGoto($('#view')); }
    };
  }
  const isPro = me.type === 'pro';
  const menu = `<div class="cell-group" style="margin-top:0">
      <div class="cell ${sub === 'overview' ? 'cell-on' : ''}" data-goto="#/branch-manage"><span class="cell-icon" style="color:#7C3AED">${icon('chart', 18)}</span><div class="cell-body cell-title">数据概览</div><span class="cell-arrow">${icon('right', 16)}</span></div>
      <div class="cell ${sub === 'orders' ? 'cell-on' : ''}" data-goto="#/branch-manage/orders"><span class="cell-icon" style="color:#7C3AED">${icon('order', 18)}</span><div class="cell-body cell-title">订单管理</div><div class="cell-value">${me.orderCount || 0} 笔</div><span class="cell-arrow">${icon('right', 16)}</span></div>
      <div class="cell ${sub === 'products' ? 'cell-on' : ''}" data-goto="#/branch-manage/products"><span class="cell-icon" style="color:#7C3AED">${icon('box', 18)}</span><div class="cell-body cell-title">商品管理</div><div class="cell-value">上架/改价/下架</div><span class="cell-arrow">${icon('right', 16)}</span></div>
      ${isPro ? `<div class="cell ${sub === 'sub' ? 'cell-on' : ''}" data-goto="#/branch-manage/sub"><span class="cell-icon" style="color:#7C3AED">${icon('users', 18)}</span><div class="cell-body cell-title">我的下级</div><div class="cell-value">${me.childCount || 0} 个</div><span class="cell-arrow">${icon('right', 16)}</span></div>` : ''}
      <div class="cell ${sub === 'withdraw' ? 'cell-on' : ''}" data-goto="#/branch-manage/withdraw"><span class="cell-icon" style="color:#7C3AED">${icon('wallet', 18)}</span><div class="cell-body cell-title">余额提现</div><div class="cell-value">¥${fmtPrice(me.balance || 0)}</div><span class="cell-arrow">${icon('right', 16)}</span></div>
      <div class="cell ${sub === 'password' ? 'cell-on' : ''}" data-goto="#/branch-manage/password"><span class="cell-icon" style="color:#7C3AED">${icon('lock', 18)}</span><div class="cell-body cell-title">修改密码</div><span class="cell-arrow">${icon('right', 16)}</span></div>
    </div>`;
  let body = '';
  if (sub === 'products') body = await bmProducts(me);
  else if (sub === 'orders') body = await bmOrders(me);
  else if (sub === 'withdraw') body = await bmWithdraw(me);
  else if (sub === 'password') body = bmPasswordHtml();
  else if (sub === 'sub' && isPro) body = await bmChildren(me);
  else body = bmOverview(me);
  return {
    html: `${navBar('分站管理')}
      <div class="form" style="padding-top:6px">
        <div class="branch-hero">
          <div class="branch-hero-icon">${icon('branch', 30)}</div>
          <div class="branch-hero-title">${esc(me.name)}</div>
          <div class="branch-hero-desc">${isPro ? '<span class="badge-ok">专业分站</span>' : '<span class="badge-warn">普通分站</span>'} · 上级：${esc(me.parentName || '超级管理员')} · 下级 ${me.childCount || 0} 个</div>
        </div>
        ${menu}
        <div class="section" style="padding-top:6px">${body}</div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      if (sub === 'products') bmProductsBind(root);
      else if (sub === 'orders') bmOrdersBind(root);
      else if (sub === 'withdraw') bmWithdrawBind(root);
      else if (sub === 'password') bmPasswordBind(root);
      else if (sub === 'sub' && isPro) bmChildrenBind(root);
      else bmOverviewBind(root);
    }
  };
}

function bmOverview(me) {
  const isPro = me.type === 'pro';
  const stat = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-card" style="padding:14px"><div class="text-xs text-3">账户余额</div><div style="font-size:20px;font-weight:700;color:#7C3AED">¥${fmtPrice(me.balance || 0)}</div></div>
      <div class="form-card" style="padding:14px"><div class="text-xs text-3">下级分站</div><div style="font-size:20px;font-weight:700;color:#D97706">${me.childCount || 0} 个</div></div>
    </div>`;
  const desc = isPro
    ? '<p>您是<b>专业分站</b>：可在「我的下级」设置下级价格、分享邀请链接，别人通过你的链接开通分站后，费用直接进入你的账户余额。</p>'
    : '<p>您是<b>普通分站</b>：无下级管理权限，可升级为专业分站后开通下级、获得分销收益。</p>';
  const up = !isPro && me.upgradePrice > 0 ? `<div style="margin-top:14px;padding:14px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div style="font-size:13px;color:#92400E">升级为专业分站：补差价 <b style="color:#FF6A00;font-size:15px">¥${fmtPrice(me.upgradePrice)}</b>（从账户余额扣除）</div>
      <button class="btn btn-primary btn-sm" data-upgrade>${icon('branch', 14)} 立即升级</button></div>` : '';
  return `${stat}
    <div class="form-card" style="margin-top:12px"><div style="font-size:13px;line-height:1.9;color:#555">${desc}</div>${up}</div>
    <div class="cell-group" style="margin-top:12px">
      <div class="cell" data-goto="#/branch-shop/${encodeURIComponent(me.username)}"><span class="cell-icon" style="color:#0E9F6E">${icon('eye', 18)}</span><div class="cell-body cell-title">查看我的分站店铺</div><span class="cell-arrow">${icon('right', 16)}</span></div>
    </div>`;
}

function bmOverviewBind(root) {
  $$('[data-upgrade]', root).forEach((b) => b.addEventListener('click', async () => {
    const me = await API.get('/branch/me').catch(() => null);
    const p = (me && me.upgradePrice) || 0;
    if (!confirm('升级为专业分站需补差价 ¥' + fmtPrice(p) + '（从账户余额扣除），确定升级？')) return;
    try { await API.put('/branch/upgrade', {}); toast('恭喜，已升级为专业分站！', 'success'); location.hash = '#/branch-manage'; } catch (err) { toast(err.message, 'error'); }
  }));
}

async function bmProducts(me) {
  let mine = [], catalog = [];
  try { mine = await API.get('/branch/products'); } catch (e) {}
  try { catalog = await API.get('/branch/catalog'); } catch (e) {}
  return `<div class="form-card">
      <div style="font-weight:600;margin-bottom:10px">${icon('plus', 15)} 上架总站商品 <span style="font-size:12px;color:#999;font-weight:400">（售价不能低于上级同款价，层层生效）</span></div>
      <div style="display:grid;gap:10px">
        <select class="input" id="bm-cat"><option value="">请选择总站商品</option>${catalog.map((p) => `<option value="${p.id}" data-price="${p.price}">${esc(p.name)}（¥${fmtPrice(p.price)}）</option>`).join('')}</select>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="input" id="bm-price" type="number" min="0" step="0.01" placeholder="售价（留空=总站价）" style="flex:1">
          <button class="btn btn-primary" id="bm-add">${icon('plus', 14)} 上架</button>
        </div>
      </div>
    </div>
    <div class="form-card" style="margin-top:12px">
      <div style="font-weight:600;margin-bottom:6px">${icon('box', 15)} 我的商品（${mine.length}）</div>
      ${mine.length ? mine.map((p) => `<div style="padding:10px 0;border-bottom:1px solid #F3F4F6">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div><div class="text-xs text-3">库存 ${p.stock} · ${p.status === 1 ? '<span style="color:#0E9F6E">在售</span>' : '<span style="color:#EF4444">已下架</span>'}</div></div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0"><input class="input" id="bm-price-${p.id}" type="number" step="0.01" value="${p.price}" style="width:76px;padding:6px 8px"><button class="btn btn-sm btn-outline" data-saveprice="${p.id}">改价</button></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-sm btn-outline" data-pstatus="${p.id}" style="flex:1">${p.status === 1 ? '下架' : '上架'}</button>
          <button class="btn btn-sm btn-outline-danger" data-pdel="${p.id}" style="flex:1">删除</button>
        </div>
      </div>`).join('') : '<div class="empty" style="padding:18px 0"><img src="/img/empty.svg" alt=""><div class="empty-text">暂未上架商品，请在上方选择总站商品上架</div></div>'}
    </div>`;
}

function bmProductsBind(root) {
  const rerender = () => { render(); };
  $('#bm-add', root).addEventListener('click', async () => {
    const sel = $('#bm-cat', root);
    const sourceId = Number(sel.value);
    if (!sourceId) return toast('请选择要上架的总站商品', 'error');
    const price = $('#bm-price', root).value.trim();
    try {
      await API.post('/branch/products', { sourceId, price: price === '' ? undefined : Number(price) });
      toast('上架成功', 'success');
      rerender();
    } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-saveprice]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-saveprice'));
    const price = Number($('#bm-price-' + id, root).value);
    try { await API.put('/branch/products/' + id, { price }); toast('价格已更新', 'success'); rerender(); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-pstatus]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-pstatus'));
    const target = b.textContent.trim().includes('上架') ? 1 : 0;
    try { await API.put('/branch/products/' + id, { status: target }); toast('已更新', 'success'); rerender(); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-pdel]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-pdel'));
    if (!confirm('确定删除该商品？')) return;
    try { await API.del('/branch/products/' + id); toast('已删除', 'success'); rerender(); } catch (e) { toast(e.message, 'error'); }
  }));
}

function bmPasswordHtml() {
  return `<div class="form-card">
    <div class="form-item"><span class="form-label">原密码</span><input class="input" id="bm-old" type="password"></div>
    <div class="form-item"><span class="form-label">新密码（至少 4 位）</span><input class="input" id="bm-new" type="password"></div>
    <div class="form-item"><span class="form-label">确认新密码</span><input class="input" id="bm-new2" type="password"></div>
    <div class="form-actions"><button class="btn btn-primary btn-block" id="bm-save">保存</button></div>
  </div>`;
}

function bmPasswordBind(root) {
  $('#bm-save', root).addEventListener('click', async () => {
    const oldPassword = $('#bm-old', root).value;
    const np = $('#bm-new', root).value;
    const np2 = $('#bm-new2', root).value;
    if (!np || np.length < 4) return toast('新密码至少 4 位', 'error');
    if (np !== np2) return toast('两次输入的新密码不一致', 'error');
    try { await API.put('/branch/password', { oldPassword, newPassword: np }); toast('密码已修改', 'success'); $('#bm-old', root).value = ''; $('#bm-new', root).value = ''; $('#bm-new2', root).value = ''; } catch (err) { toast(err.message, 'error'); }
  });
}

async function bmOrders(me) {
  let d = { list: [], total: 0 };
  try { d = await API.get('/branch/orders', { params: { status: 'all', page: 1, size: 20 } }); } catch (e) {}
  const rows = (d.list || []).map((o) => `<div style="padding:10px 0;border-bottom:1px solid #F3F4F6">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
      <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">${esc(o.orderNo)}</div><div class="text-xs text-3">${esc((o.goods || []).map((g) => g.name).join('、').slice(0, 18))} · 买家 ${esc(o.buyerName || '用户')}</div></div>
      <div style="text-align:right;flex-shrink:0"><div style="font-weight:700;color:#FF6A00">¥${fmtPrice(o.payAmount)}</div><div class="text-xs">${o.status === 'paid' ? '<span style="color:#0F6DFF">待发货</span>' : o.status === 'shipped' ? '<span style="color:#0E9F6E">已发货</span>' : o.status === 'completed' ? '<span style="color:#0E9F6E">已完成</span>' : o.status === 'cancelled' ? '<span style="color:#EF4444">已取消</span>' : o.status === 'refunded' ? '<span style="color:#EF4444">已退款</span>' : o.status === 'pending_confirm' ? '<span style="color:#8B5CF6">待确认收款</span>' : '<span style="color:#D97706">待付款</span>'}</div></div>
    </div>
    ${o.status === 'paid' ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-sm btn-primary" data-o-ship="${o.id}" style="flex:1">发货</button><button class="btn btn-sm btn-outline" data-o-view="${o.id}" style="flex:1">详情</button></div>` : `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-sm btn-outline" data-o-view="${o.id}" style="flex:1">详情</button></div>`}
  </div>`).join('');
  return `<div class="form-card">
    <div style="font-weight:600;margin-bottom:6px">${icon('order', 15)} 我的订单（${d.total || 0}）</div>
    ${rows || '<div class="empty" style="padding:18px 0"><img src="/img/empty.svg" alt=""><div class="empty-text">暂无订单</div></div>'}
  </div>`;
}

function bmOrdersBind(root) {
  $$('[data-o-ship]', root).forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.getAttribute('data-o-ship'));
    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `<div class="modal" style="max-width:520px">
      <div class="modal-head"><span>订单 #${id} 发货</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
      <div class="modal-body">
        <div class="form-item"><label>卡密内容（每行一条）</label><textarea class="input" id="m-ship-cards" rows="5" placeholder="每行一条卡密"></textarea></div>
        <div class="form-item"><label>或 物流单号</label><input class="input" id="m-ship-tracking" placeholder="如：SF1234567890"></div>
        <button class="btn btn-primary" id="m-ship-submit" style="width:100%">确认发货</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
    $('#m-ship-submit', modal).addEventListener('click', async () => {
      const cards = $('#m-ship-cards', modal).value;
      const trackingNo = $('#m-ship-tracking', modal).value.trim();
      if (!cards.trim() && !trackingNo) return toast('请填写卡密内容或物流单号', 'error');
      try { await API.post('/branch/orders/' + id + '/ship', { cards, trackingNo, logistics: '快递' }); toast('发货成功', 'success'); modal.remove(); render(); } catch (e) { toast(e.message, 'error'); }
    });
  }));
  $$('[data-o-view]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-o-view'));
    try {
      const o = await API.get('/branch/orders/' + id);
      const cardRows = (o.cards || []).map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.secret || '-')}</td></tr>`).join('');
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `<div class="modal" style="max-width:600px">
        <div class="modal-head"><span>订单 ${esc(o.orderNo)}</span><span data-close style="cursor:pointer">${icon('close', 18)}</span></div>
        <div class="modal-body">
          <div class="form-card" style="margin-bottom:10px">
            <div style="font-weight:600;margin-bottom:8px">买家信息</div>
            <div class="text-sm" style="line-height:1.9">收货人：${esc(o.address.name)}　电话：${esc(o.address.phone)}<br>地址：${esc((o.address.region || '') + ' ' + (o.address.detail || ''))}</div>
          </div>
          <div class="form-card" style="margin-bottom:10px"><div style="font-weight:600;margin-bottom:8px">金额：¥${fmtPrice(o.payAmount)}${o.couponAmount > 0 ? '（优惠 ¥' + fmtPrice(o.couponAmount) + '）' : ''}</div></div>
          ${cardRows ? `<div class="form-card"><div style="font-weight:600;margin-bottom:8px">卡密信息（${o.cards.length} 条）</div><div class="table-wrap"><table class="table"><thead><tr><th>卡密</th><th>密码</th></tr></thead><tbody>${cardRows}</tbody></table></div></div>` : ''}
          ${o.status === 'shipped' && o.trackingNo ? `<div class="form-card" style="margin-top:10px"><div class="text-sm">物流：${esc(o.logistics || '')}　单号：${esc(o.trackingNo)}</div></div>` : ''}
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-close]')) modal.remove(); });
    } catch (e) { toast(e.message, 'error'); }
  }));
}

async function bmWithdraw(me) {
  let logs = [], wds = [], pay = { payAccounts: {}, email: '' };
  try { const r = await API.get('/branch/balance-logs', { params: { page: 1, size: 20 } }); logs = r.list || []; } catch (e) {}
  try { wds = await API.get('/branch/withdrawals'); } catch (e) {}
  try { pay = await API.get('/branch/pay-accounts'); } catch (e) {}
  const pa = pay.payAccounts || {};
  const payEmail = pay.email || '';
  const frozen = me.pendingWithdraw || 0;
  const avail = Math.max(0, (me.balance || 0) - frozen);
  const wdRows = wds.map((w) => `<div style="padding:10px 0;border-bottom:1px solid #F3F4F6">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="min-width:0"><div style="font-weight:600;color:#FF6A00">¥${fmtPrice(w.amount)}</div><div class="text-xs text-3">${esc(w.account || '')}${w.qrcode ? `<img src="${esc(w.qrcode)}" style="width:48px;height:48px;object-fit:contain;border:1px solid #eee;border-radius:6px;display:block;margin-top:4px" alt="收款码">` : ''} · ${new Date(w.createdAt * 1000).toLocaleDateString('zh-CN')}</div></div>
      <div style="text-align:right;flex-shrink:0"><span style="font-size:12px">${w.status === 'pending' ? '<span style="color:#D97706">待审核</span>' : w.status === 'approved' ? '<span style="color:#0F6DFF">已通过</span>' : w.status === 'paid' ? '<span style="color:#0E9F6E">已打款</span>' : w.status === 'rejected' ? '<span style="color:#EF4444">已驳回</span>' : '<span style="color:#999">已取消</span>'}</span>${w.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger" data-wd-cancel="${w.id}" style="margin-left:6px">取消</button>` : ''}</div>
    </div>
  </div>`).join('');
  const logRows = logs.map((l) => `<div style="padding:8px 0;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;gap:8px">
    <div style="min-width:0"><div class="text-sm">${esc(l.desc)}</div><div class="text-xs text-3">${new Date(l.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</div></div>
    <div style="flex-shrink:0"><span style="font-weight:700;${l.change > 0 ? 'color:#0E9F6E' : 'color:#EF4444'}">${l.change > 0 ? '+' : ''}¥${fmtPrice(l.change)}</span><div class="text-xs text-3" style="text-align:right">余额 ¥${fmtPrice(l.balance)}</div></div>
  </div>`).join('');
  const bindState = (t) => (pa[t] ? '<span style="color:#0E9F6E">已绑定</span>' : '<span style="color:#EF4444">未绑定</span>');
  const methodCard = (t, label, iconSvg) => `<label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border:1.5px solid #e5e7eb;border-radius:12px;cursor:pointer;background:#fff" data-method="${t}">
      <input type="radio" name="bm-method" value="${t}" style="display:none">
      <span style="font-size:22px">${iconSvg}</span>
      <span style="font-size:13px;font-weight:600">${label}</span>
      <span class="text-xs" style="font-size:11px">${bindState(t)}</span>
    </label>`;
  // 绑定表单（按 tab 切换）
  const tabForm = (t) => {
    if (pa[t]) {
      let info = '';
      if (t === 'alipay') info = `昵称：${esc(pa[t].nickname)}<br>账号：${esc(pa[t].account)}`;
      else if (t === 'wechat') info = `昵称：${esc(pa[t].nickname)}<br>收款码：<img src="${esc(pa[t].qrcode)}" style="width:120px;height:120px;object-fit:contain;border:1px solid #eee;border-radius:8px;margin-top:4px;display:block">`;
      else info = `持卡人：${esc(pa[t].holder)}<br>开户行：${esc(pa[t].bankName)}<br>卡号：${esc(pa[t].account)}`;
      return `<div style="padding:10px 0;line-height:1.9;font-size:13px;color:#333">${info}<br><span class="text-xs text-3">绑定于 ${new Date((pa[t].updatedAt || 0) * 1000).toLocaleDateString('zh-CN')}</span></div>
        <button class="btn btn-sm btn-outline-danger" data-pa-unbind="${t}">解绑</button>`;
    }
    let fields = '';
    if (t === 'alipay') fields = `<div class="form-item"><span class="form-label">支付宝昵称</span><input class="input" id="pa-nickname" placeholder="收款人昵称"></div>
      <div class="form-item"><span class="form-label">支付宝账号</span><input class="input" id="pa-account" placeholder="手机号 / 邮箱 / 账号"></div>`;
    else if (t === 'wechat') fields = `<div class="form-item"><span class="form-label">微信昵称</span><input class="input" id="pa-nickname" placeholder="收款人昵称"></div>
      <div class="form-item"><span class="form-label">收款码图片</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" id="pa-qrcode-btn">选择图片</button><input type="file" accept="image/*" id="pa-qrcode-file" style="display:none">
        <img id="pa-qrcode-preview" style="width:90px;height:90px;object-fit:contain;border:1px solid #eee;border-radius:8px;display:none">
      </div><div class="text-xs text-3" style="margin-top:4px">支持 jpg/png/gif/webp，≤3MB</div></div>`;
    else fields = `<div class="form-item"><span class="form-label">持卡人姓名</span><input class="input" id="pa-holder" placeholder="银行卡持卡人"></div>
      <div class="form-item"><span class="form-label">完整开户行</span><input class="input" id="pa-bankName" placeholder="如：中国工商银行XX分行XX支行"></div>
      <div class="form-item"><span class="form-label">银行卡号</span><input class="input" id="pa-bankAccount" type="number" placeholder="12-24位卡号"></div>`;
    return `${fields}
      <div class="form-item" style="flex-direction:column;align-items:stretch;gap:4px"><span class="form-label" style="margin-bottom:2px">邮箱验证码（发送至 ${esc(payEmail || '分站账号邮箱')}）</span>
        <div style="display:flex;gap:8px"><input class="input" id="pa-code" maxlength="6" placeholder="邮箱验证码" autocomplete="off" style="flex:1"><button class="btn btn-primary btn-sm" id="pa-send">获取验证码</button></div>
        <div class="text-xs text-3" style="margin-top:2px">${payEmail ? '' : '当前分站账号未绑定邮箱，无法发送验证码'}</div>
      </div>
      <div class="form-item"><span class="form-label">图形验证码</span><input class="input" id="f-captcha" maxlength="4" placeholder="图形验证码" autocomplete="off" style="flex:1"><img id="captcha-img" class="captcha-img" alt="验证码" title="点击刷新" style="height:38px;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb;background:#f3f5f9"></div>
      <button class="btn btn-primary btn-block" id="pa-bind" data-bind-type="${t}">${icon('check', 14)} 绑定收款方式</button>`;
  };
  return `<div class="form-card">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-card" style="padding:14px;margin:0"><div class="text-xs text-3">账户余额</div><div style="font-size:20px;font-weight:700;color:#7C3AED">¥${fmtPrice(me.balance || 0)}</div></div>
      <div class="form-card" style="padding:14px;margin:0"><div class="text-xs text-3">可提现</div><div style="font-size:20px;font-weight:700;color:#0E9F6E">¥${fmtPrice(avail)}</div></div>
    </div>
    <div class="form-item"><span class="form-label">提现金额（¥，最低 1 元）</span><input class="input" id="bm-wd-amount" type="number" min="1" step="0.01" placeholder="0.00"></div>
    <div style="font-size:12px;color:#888;margin:8px 0 6px">选择收款方式</div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      ${methodCard('alipay', '支付宝', icon('wallet', 20))}
      ${methodCard('wechat', '微信', icon('image', 20))}
      ${methodCard('bank', '银行卡', icon('ticket', 20))}
    </div>
    <div class="form-actions"><button class="btn btn-primary btn-block" id="bm-wd-apply">${icon('wallet', 15)} 提交提现申请</button></div>
  </div>
  <div class="form-card" style="margin-top:12px">
    <div style="font-weight:600;margin-bottom:6px">${icon('setting', 15)} 收款方式绑定（需邮箱验证码验证）</div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      ${['alipay', 'wechat', 'bank'].map((t) => `<button class="btn btn-sm ${t === 'alipay' ? 'btn-primary' : 'btn-outline'}" data-pa-tab="${t}">${t === 'alipay' ? '支付宝' : t === 'wechat' ? '微信' : '银行卡'}</button>`).join('')}
    </div>
    <div data-pa-form>${tabForm('alipay')}</div>
  </div>
  <div class="form-card" style="margin-top:12px">
    <div style="font-weight:600;margin-bottom:6px">${icon('order', 15)} 提现记录（${wds.length}）</div>
    ${wdRows || '<div class="empty" style="padding:14px 0"><img src="/img/empty.svg" alt=""><div class="empty-text">暂无提现记录</div></div>'}
  </div>
  <div class="form-card" style="margin-top:12px">
    <div style="font-weight:600;margin-bottom:6px">${icon('chart', 15)} 资金流水（最近 ${logs.length} 条）</div>
    ${logRows || '<div class="empty" style="padding:14px 0"><img src="/img/empty.svg" alt=""><div class="empty-text">暂无流水记录</div></div>'}
  </div>`;
}

function bmWithdrawBind(root) {
  // 收款方式 tab 切换
  const tabBtn = (t) => root.querySelector('[data-pa-tab="' + t + '"]');
  const switchTab = (t) => {
    ['alipay', 'wechat', 'bank'].forEach((x) => {
      const b = tabBtn(x);
      if (b) b.className = 'btn btn-sm ' + (x === t ? 'btn-primary' : 'btn-outline');
    });
    root.querySelector('[data-pa-form]').innerHTML = tabFormHtml(t);
    mountPaCaptcha();
    bindPaActions(t);
  };
  // tab 表单 HTML（依赖当前已绑定状态，从 DOM 重新读太重，直接用缓存的初次渲染结果重算）
  let paCache = { accounts: {}, email: '' };
  const loadPa = async () => {
    try { const r = await API.get('/branch/pay-accounts'); paCache = r; } catch (e) {}
  };
  const renderForm = (t) => {
    const pa = paCache.payAccounts || {};
    if (pa[t]) {
      let info = '';
      if (t === 'alipay') info = `昵称：${esc(pa[t].nickname)}<br>账号：${esc(pa[t].account)}`;
      else if (t === 'wechat') info = `昵称：${esc(pa[t].nickname)}<br>收款码：<img src="${esc(pa[t].qrcode)}" style="width:120px;height:120px;object-fit:contain;border:1px solid #eee;border-radius:8px;margin-top:4px;display:block">`;
      else info = `持卡人：${esc(pa[t].holder)}<br>开户行：${esc(pa[t].bankName)}<br>卡号：${esc(pa[t].account)}`;
      return `<div style="padding:10px 0;line-height:1.9;font-size:13px;color:#333">${info}<br><span class="text-xs text-3">绑定于 ${new Date((pa[t].updatedAt || 0) * 1000).toLocaleDateString('zh-CN')}</span></div>
        <button class="btn btn-sm btn-outline-danger" data-pa-unbind="${t}">解绑</button>`;
    }
    let fields = '';
    if (t === 'alipay') fields = `<div class="form-item"><span class="form-label">支付宝昵称</span><input class="input" id="pa-nickname" placeholder="收款人昵称"></div>
      <div class="form-item"><span class="form-label">支付宝账号</span><input class="input" id="pa-account" placeholder="手机号 / 邮箱 / 账号"></div>`;
    else if (t === 'wechat') fields = `<div class="form-item"><span class="form-label">微信昵称</span><input class="input" id="pa-nickname" placeholder="收款人昵称"></div>
      <div class="form-item"><span class="form-label">收款码图片</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" id="pa-qrcode-btn">选择图片</button><input type="file" accept="image/*" id="pa-qrcode-file" style="display:none">
        <img id="pa-qrcode-preview" style="width:90px;height:90px;object-fit:contain;border:1px solid #eee;border-radius:8px;display:none">
      </div><div class="text-xs text-3" style="margin-top:4px">支持 jpg/png/gif/webp，≤3MB</div></div>`;
    else fields = `<div class="form-item"><span class="form-label">持卡人姓名</span><input class="input" id="pa-holder" placeholder="银行卡持卡人"></div>
      <div class="form-item"><span class="form-label">完整开户行</span><input class="input" id="pa-bankName" placeholder="如：中国工商银行XX分行XX支行"></div>
      <div class="form-item"><span class="form-label">银行卡号</span><input class="input" id="pa-bankAccount" type="number" placeholder="12-24位卡号"></div>`;
    return `${fields}
      <div class="form-item" style="flex-direction:column;align-items:stretch;gap:4px"><span class="form-label" style="margin-bottom:2px">邮箱验证码（发送至 ${esc(paCache.email || '分站账号邮箱')}）</span>
        <div style="display:flex;gap:8px"><input class="input" id="pa-code" maxlength="6" placeholder="邮箱验证码" autocomplete="off" style="flex:1"><button class="btn btn-primary btn-sm" id="pa-send">获取验证码</button></div>
        <div class="text-xs text-3" style="margin-top:2px">${paCache.email ? '' : '当前分站账号未绑定邮箱，无法发送验证码'}</div>
      </div>
      <div class="form-item"><span class="form-label">图形验证码</span><input class="input" id="f-captcha" maxlength="4" placeholder="图形验证码" autocomplete="off" style="flex:1"><img id="captcha-img" class="captcha-img" alt="验证码" title="点击刷新" style="height:38px;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb;background:#f3f5f9"></div>
      <button class="btn btn-primary btn-block" id="pa-bind" data-bind-type="${t}">${icon('check', 14)} 绑定收款方式</button>`;
  };
  const tabFormHtml = (t) => renderForm(t);
  const mountPaCaptcha = () => {
    const img = root.querySelector('#captcha-img');
    if (img) refreshCaptcha(img);
  };
  let qrcodeUrl = '';
  const bindPaActions = (t) => {
    const sendBtn = root.querySelector('#pa-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const email = paCache.email;
        if (!email) return toast('当前分站账号未绑定邮箱，无法发送验证码', 'error');
        if (!captchaNeeded()) return;
        const cap = captchaPayload();
        sendBtn.disabled = true;
        try {
          const r = await API.post('/auth/send-email-code', { email, scene: 'pay', ...cap });
          toast(r.tip || '验证码已发送至 ' + email, 'success');
          resetCaptchaField();
          let sec = 60;
          const timer = setInterval(() => {
            sec--;
            sendBtn.textContent = sec + 's 后重发';
            if (sec <= 0) { clearInterval(timer); sendBtn.textContent = '获取验证码'; sendBtn.disabled = false; }
          }, 1000);
        } catch (e) { toast(e.message, 'error'); sendBtn.disabled = false; resetCaptchaField(); }
      });
    }
    const qb = root.querySelector('#pa-qrcode-btn');
    const qf = root.querySelector('#pa-qrcode-file');
    if (qb && qf) {
      qb.addEventListener('click', () => qf.click());
      qf.addEventListener('change', async () => {
        const f = qf.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) return toast('图片不能超过 3MB', 'error');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = String(reader.result).split(',')[1];
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const r = await API.post('/branch/upload', { data, ext });
            qrcodeUrl = r.url;
            const prev = root.querySelector('#pa-qrcode-preview');
            if (prev) { prev.src = r.url; prev.style.display = 'block'; }
            toast('收款码已上传', 'success');
          } catch (e) { toast(e.message, 'error'); }
        };
        reader.readAsDataURL(f);
      });
    }
    const bindBtn = root.querySelector('#pa-bind');
    if (bindBtn) {
      bindBtn.addEventListener('click', async () => {
        const body = { type: t, email: paCache.email, emailCode: (root.querySelector('#pa-code') || {}).value || '' };
        if (!body.emailCode) return toast('请输入邮箱验证码', 'error');
        const val = (id) => (root.querySelector(id) || {}).value || '';
        if (t === 'alipay') { body.nickname = val('#pa-nickname').trim(); body.account = val('#pa-account').trim(); }
        else if (t === 'wechat') { body.nickname = val('#pa-nickname').trim(); if (!qrcodeUrl) return toast('请先上传微信收款码图片', 'error'); body.qrcode = qrcodeUrl; }
        else { body.holder = val('#pa-holder').trim(); body.bankName = val('#pa-bankName').trim(); body.account = val('#pa-bankAccount').trim(); }
        try {
          await API.post('/branch/pay-accounts', body);
          toast('收款方式已绑定', 'success');
          await loadPa();
          root.querySelector('[data-pa-form]').innerHTML = renderForm(t);
          mountPaCaptcha();
          bindPaActions(t);
          render();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
    const unbindBtn = root.querySelector('[data-pa-unbind]');
    if (unbindBtn) {
      unbindBtn.addEventListener('click', async () => {
        const ty = unbindBtn.getAttribute('data-pa-unbind');
        if (!confirm('确定解绑该收款方式？')) return;
        try {
          await API.del('/branch/pay-accounts/' + ty);
          toast('已解绑', 'success');
          await loadPa();
          root.querySelector('[data-pa-form]').innerHTML = renderForm(ty);
          mountPaCaptcha();
          bindPaActions(ty);
          render();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
  loadPa().then(() => {
    const form = root.querySelector('[data-pa-form]');
    if (form) form.innerHTML = renderForm('alipay');
    mountPaCaptcha();
    bindPaActions('alipay');
  });
  ['alipay', 'wechat', 'bank'].forEach((t) => {
    const b = tabBtn(t);
    if (b) b.addEventListener('click', () => switchTab(t));
  });
  // 提现方式卡片选择高亮
  $$('[data-method]', root).forEach((c) => {
    c.addEventListener('click', () => {
      $$('[data-method]', root).forEach((x) => { x.style.borderColor = '#e5e7eb'; x.style.background = '#fff'; });
      c.style.borderColor = '#7C3AED'; c.style.background = '#F6F2FF';
      const r = c.querySelector('input[type=radio]');
      if (r) r.checked = true;
    });
  });
  $('#bm-wd-apply', root).addEventListener('click', async () => {
    const amount = Number($('#bm-wd-amount', root).value);
    const methodEl = root.querySelector('input[name=bm-method]:checked');
    const method = methodEl ? methodEl.value : '';
    if (!isFinite(amount) || amount <= 0) return toast('请输入正确的提现金额', 'error');
    if (!method) return toast('请选择收款方式', 'error');
    if (!(paCache.payAccounts || {})[method]) return toast('该收款方式尚未绑定，请先到下方「收款方式绑定」完成绑定', 'error');
    try { await API.post('/branch/withdrawals', { amount, method }); toast('提现申请已提交', 'success'); render(); } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-wd-cancel]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-wd-cancel'));
    if (!confirm('确定取消该提现申请？')) return;
    try { await API.post('/branch/withdrawals/' + id + '/cancel', {}); toast('已取消', 'success'); render(); } catch (e) { toast(e.message, 'error'); }
  }));
}

async function bmChildren(me) {
  let list = [];
  try { list = await API.get('/branch/branches'); } catch (e) {}
  let invite = null;
  try { invite = await API.get('/branch/invite-link'); } catch (e) {}
  const inviteUrl = invite ? invite.url : (location.origin + '/index.html#/join?p=' + encodeURIComponent(me.username));
  return `<div class="form-card">
      <div style="font-weight:600;margin-bottom:6px">${icon('link', 15)} 分销邀请链接</div>
      <div class="text-xs text-3" style="margin-bottom:8px">把链接发给别人，他们开通的分站费用进入你的余额（当前 ¥${fmtPrice(me.balance || 0)}）；链接带防伪签名，30 天有效</div>
      <div style="display:flex;gap:8px"><div style="flex:1;background:#F9FAFB;border:1px solid #EEE;border-radius:10px;padding:10px;font-size:12px;color:#555;word-break:break-all">${esc(inviteUrl)}</div><button class="btn btn-primary btn-sm" data-copy>复制</button></div>
    </div>
    <div class="form-card" style="margin-top:12px">
      <div style="font-weight:600;margin-bottom:8px">${icon('setting', 15)} 设置下级分站价格</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input class="input" id="bm-pro" type="number" min="0" value="${me.pricePro || 0}" placeholder="专业价" style="flex:1;min-width:80px"><span class="text-xs text-3">专业</span>
        <input class="input" id="bm-normal" type="number" min="0" value="${me.priceNormal || 0}" placeholder="普通价" style="flex:1;min-width:80px"><span class="text-xs text-3">普通</span>
        <button class="btn btn-primary" id="bm-save-price">保存</button>
      </div>
    </div>
    <div class="form-card" style="margin-top:12px">
      <div style="font-weight:600;margin-bottom:6px">${icon('users', 15)} 我的下级分站（${list.length}）</div>
      ${list.length ? list.map((c) => `<div style="padding:10px 0;border-bottom:1px solid #F3F4F6">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0"><div style="font-weight:600;font-size:14px">${esc(c.name)}</div><div class="text-xs text-3">${esc(c.username)} · ${c.type === 'pro' ? '专业分站' : '普通分站'} · ${c.status === 1 ? '<span style="color:#0E9F6E">启用</span>' : '<span style="color:#EF4444">停用</span>'}</div></div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-sm btn-outline" data-cstatus="${c.id}">${c.status === 1 ? '停用' : '启用'}</button>
            <button class="btn btn-sm btn-outline-danger" data-cdel="${c.id}">删除</button>
          </div>
        </div>
      </div>`).join('') : '<div class="empty" style="padding:18px 0"><img src="/img/empty.svg" alt=""><div class="empty-text">暂无下级分站</div></div>'}
    </div>`;
}

function bmChildrenBind(root) {
  const rerender = () => { render(); };
  $$('[data-copy]', root).forEach((b) => b.addEventListener('click', async () => {
    try {
      const link = b.closest('div').querySelector('div').textContent.trim();
      await navigator.clipboard.writeText(link);
      toast('邀请链接已复制', 'success');
    } catch (e) { toast('复制失败，请手动复制链接', 'error'); }
  }));
  $('#bm-save-price', root).addEventListener('click', async () => {
    const pro = Number($('#bm-pro', root).value);
    const normal = Number($('#bm-normal', root).value);
    if (!isFinite(pro) || pro < 0 || !isFinite(normal) || normal < 0) return toast('价格无效', 'error');
    try { await API.put('/branch/price', { pricePro: pro, priceNormal: normal }); toast('价格已保存', 'success'); rerender(); } catch (err) { toast(err.message, 'error'); }
  });
  $$('[data-cstatus]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-cstatus'));
    const target = b.textContent.trim().includes('启用');
    try { await API.put('/branch/branches/' + id, { status: target ? 1 : 0 }); toast('已更新', 'success'); rerender(); } catch (err) { toast(err.message, 'error'); }
  }));
  $$('[data-cdel]', root).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.getAttribute('data-cdel'));
    if (!confirm('确定删除该下级分站？')) return;
    try { await API.del('/branch/branches/' + id); toast('已删除', 'success'); rerender(); } catch (err) { toast(err.message, 'error'); }
  }));
}

/* ============================================================
   开通分站（可选普通/专业，余额支付，价格由平台设置）
   ============================================================ */
async function vOpenBranch() {
  let mine = null, cfg = { prices: { pro: 10, normal: 0 }, balance: 0 };
  try { mine = await API.get('/user/my-branch'); } catch (e) {}
  try { cfg = await API.get('/user/branch-config'); } catch (e) {}
  const has = !!mine;
  let type = 'pro';
  return {
    html: `${navBar('开通分站')}
      <div class="form">
        <div class="branch-hero">
          <div class="branch-hero-icon">${icon('branch', 30)}</div>
          <div class="branch-hero-title">开通分站</div>
          <div class="branch-hero-desc">选择分站类型开通，成为代理商搭建自己的分销团队</div>
        </div>
        ${has ? `
        <div class="branch-done">
          <div class="form-card">
            <div class="form-item"><span class="form-label">分站名称</span><div class="form-static">${esc(mine.name)}</div></div>
            <div class="form-item"><span class="form-label">分站类型</span><div class="form-static">${mine.type === 'pro' ? '<span class="badge-ok">专业分站</span>' : '<span class="badge-warn">普通分站</span>'}</div></div>
            <div class="form-item"><span class="form-label">分站账号</span><div class="form-static">${esc(mine.username)}</div></div>
            <div class="form-item"><span class="form-label">状态</span><div class="form-static">${mine.status === 1 ? '<span class="badge-ok">已开通</span>' : '<span class="badge-off">已停用</span>'}</div></div>
          </div>
          <div class="form-tip">分站账号即您的注册账号，进入分站管理或登录独立分站后台均用同一账号密码。</div>
          <div class="form-actions" style="gap:8px">
            <button class="btn btn-primary btn-block" data-goto="#/branch-manage">${icon('branch', 16)} 进入分站管理</button>
            <a class="btn btn-outline btn-block" href="/branch.html" target="_blank" rel="noopener">打开独立分站后台</a>
          </div>
        </div>` : `
        <div class="branch-type-picker" id="type-picker">
          <div class="btp-item ${type === 'pro' ? 'active' : ''}" data-type="pro">
            <div class="btp-ico">${icon('branch', 18)}</div>
            <div class="btp-name">专业分站</div>
            <div class="btp-price">¥${fmtPrice(cfg.prices.pro)}</div>
            <div class="btp-desc">可开下级 · 自主定价</div>
          </div>
          <div class="btp-item ${type === 'normal' ? 'active' : ''}" data-type="normal">
            <div class="btp-ico">${icon('users', 18)}</div>
            <div class="btp-name">普通分站</div>
            <div class="btp-price">¥${fmtPrice(cfg.prices.normal)}</div>
            <div class="btp-desc">单站运营 · 可升级专业</div>
          </div>
        </div>
        <div class="balance-bar">当前余额 <b>¥${fmtPrice(cfg.balance)}</b><span id="price-tip" class="text-3 text-xs">开通专业分站需 ¥${fmtPrice(cfg.prices.pro)}</span></div>
        <div class="form-card">
          <div class="form-item"><span class="form-label">分站名称</span><input class="input" id="ob-name" placeholder="如：华南代理" maxlength="20"></div>
          <div class="form-item"><span class="form-label">分站账号</span><div class="form-static">${esc(Auth.user && (Auth.user.phone || Auth.user.email) || '当前账号')}</div></div>
        </div>
        <div class="form-tip">分站账号即您的注册账号，开通后用<b>同一账号密码</b>登录分站后台，无需二次注册。<br>开通费用从<b>账户余额</b>扣除；余额不足请联系客服充值。</div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-submit>${icon('branch', 16)} 立即开通</button></div>`}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      if (has) return;
      const picker = $('#type-picker', root);
      if (picker) {
        $$('[data-type]', picker).forEach((el) => el.addEventListener('click', () => {
          type = el.getAttribute('data-type');
          $$('[data-type]', picker).forEach((x) => x.classList.toggle('active', x === el));
          const tip = $('#price-tip', root);
          if (tip) tip.textContent = '开通' + (type === 'pro' ? '专业' : '普通') + '分站需 ¥' + fmtPrice(type === 'pro' ? cfg.prices.pro : cfg.prices.normal);
        }));
      }
      const btn = $('[data-submit]', root);
      btn.addEventListener('click', async () => {
        const name = $('#ob-name', root).value.trim();
        if (!name) return toast('请填写分站名称', 'error');
        const price = type === 'pro' ? cfg.prices.pro : cfg.prices.normal;
        if (cfg.balance < price) return toast('余额不足，需 ¥' + fmtPrice(price), 'error');
        btn.disabled = true;
        try {
          const r = await API.post('/user/open-branch', { name, type });
          toast('分站开通成功！', 'success');
          setTimeout(() => location.hash = '#/user', 600);
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
      });
    }
  };
}

/* ============================================================
   加入分站（在上级分站的邀请链接下开通下级，价格由上级设置）
   ============================================================ */
async function vJoinBranch(params, query) {
  const parentUn = (query && query.p) || '';
  const sign = (query && query.s) || '';
  let info = null, cfg = { balance: 0 };
  if (parentUn) { try { info = await API.get('/shop/branch-info?username=' + encodeURIComponent(parentUn)); } catch (e) { info = { error: e.message }; } }
  try { cfg = await API.get('/user/branch-config'); } catch (e) {}
  let type = 'normal';
  return {
    html: `${navBar('加入分站')}
      <div class="form">
        <div class="branch-hero">
          <div class="branch-hero-icon">${icon('link', 26)}</div>
          <div class="branch-hero-title">加入 ${info && info.name ? esc(info.name) : esc(parentUn)}</div>
          <div class="branch-hero-desc">在上级分站下开通你的分站，价格由其设置</div>
        </div>
        ${info && info.error ? `<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">${esc(info.error)}</div></div>` : info ? `
        <div class="branch-type-picker" id="type-picker">
          <div class="btp-item ${type === 'pro' ? 'active' : ''}" data-type="pro">
            <div class="btp-ico">${icon('branch', 18)}</div>
            <div class="btp-name">专业分站</div>
            <div class="btp-price">¥${fmtPrice(info.pricePro)}</div>
            <div class="btp-desc">可开下级 · 自主定价</div>
          </div>
          <div class="btp-item ${type === 'normal' ? 'active' : ''}" data-type="normal">
            <div class="btp-ico">${icon('users', 18)}</div>
            <div class="btp-name">普通分站</div>
            <div class="btp-price">¥${fmtPrice(info.priceNormal)}</div>
            <div class="btp-desc">单站运营 · 可升级专业</div>
          </div>
        </div>
        <div class="balance-bar">当前余额 <b>¥${fmtPrice(cfg.balance)}</b><span id="price-tip" class="text-3 text-xs">开通普通分站需 ¥${fmtPrice(info.priceNormal)}</span></div>
        <div class="form-card">
          <div class="form-item"><span class="form-label">分站名称</span><input class="input" id="ob-name" placeholder="如：广州代理" maxlength="20"></div>
          <div class="form-item"><span class="form-label">分站账号</span><div class="form-static">${esc(Auth.user && (Auth.user.phone || Auth.user.email) || '当前账号')}</div></div>
        </div>
        <div class="form-tip">分站账号即您的注册账号，开通后用<b>同一账号密码</b>登录分站后台，无需二次注册。<br>开通费用从<b>账户余额</b>扣除，直接结算给上级分站 ${esc(info.name)}。</div>
        <div class="form-actions" style="display:flex;gap:10px"><a class="btn btn-outline" style="flex:1" href="#/branch-shop/${esc(parentUn)}">${icon('store', 14)} 查看该分站店铺</a><button class="btn btn-primary" style="flex:1" data-submit>${icon('branch', 16)} 加入开通</button></div>` : '<div class="empty"><img src="/img/empty.svg" alt=""><div class="empty-text">缺少上级分站信息</div></div>'}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      if (!info || info.error) return;
      const picker = $('#type-picker', root);
      $$('[data-type]', picker).forEach((el) => el.addEventListener('click', () => {
        type = el.getAttribute('data-type');
        $$('[data-type]', picker).forEach((x) => x.classList.toggle('active', x === el));
        const tip = $('#price-tip', root);
        if (tip) tip.textContent = '开通' + (type === 'pro' ? '专业' : '普通') + '分站需 ¥' + fmtPrice(type === 'pro' ? info.pricePro : info.priceNormal);
      }));
      const btn = $('[data-submit]', root);
      btn.addEventListener('click', async () => {
        const name = $('#ob-name', root).value.trim();
        if (!name) return toast('请填写分站名称', 'error');
        const price = type === 'pro' ? info.pricePro : info.priceNormal;
        if (cfg.balance < price) return toast('余额不足，需 ¥' + fmtPrice(price), 'error');
        btn.disabled = true;
        try {
          const r = await API.post('/user/join-branch', { parent: parentUn, type, name, sign });
          toast('开通成功，已成为 ' + esc(info.name) + ' 的下级！', 'success');
          setTimeout(() => location.hash = '#/user', 700);
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
      });
    }
  };
}

/* ============================================================
   个人资料
   ============================================================ */
async function vProfile() {
  const me = (await API.get('/auth/me')).user;
  let avatar = me.avatar;
  return {
    html: `${navBar('个人资料')}
      <div class="form">
        <div class="form-card">
          <div class="form-item">
            <span class="form-label">头像</span>
            <div style="flex:1;display:flex;justify-content:flex-end">
              <img src="${esc(avatar)}" onerror="imgFallback(event)" id="avatar-preview" style="width:52px;height:52px;border-radius:50%;object-fit:cover;background:#F0F2F5" alt="">
            </div>
            <input type="file" id="avatar-input" accept="image/*" style="display:none">
          </div>
          <div class="form-item"><span class="form-label">昵称</span><input class="input" id="f-nickname" value="${esc(me.nickname)}" maxlength="20"></div>
          <div class="form-item"><span class="form-label">性别</span>
            <div class="gender-options">
              <label><span class="checkbox round-s ${me.gender === '男' ? 'checked' : ''}" data-g="男">${icon('check', 12)}</span>男</label>
              <label><span class="checkbox round-s ${me.gender === '女' ? 'checked' : ''}" data-g="女">${icon('check', 12)}</span>女</label>
              <label><span class="checkbox round-s ${!me.gender || me.gender === '保密' ? 'checked' : ''}" data-g="保密">${icon('check', 12)}</span>保密</label>
            </div>
          </div>
          <div class="form-item"><span class="form-label">生日</span><input class="input" id="f-birthday" type="date" value="${esc(me.birthday || '')}"></div>
          <div class="form-item"><span class="form-label">邮箱</span><input class="input" id="f-email" readonly placeholder="用于找回密码" value="${esc(me.email || '')}" style="background:#F4F6F9;color:#8A94A6"><span class="form-tip" style="margin-left:10px">修改邮箱请到「账号与安全 → 绑定邮箱」</span></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-save>保存</button></div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      let gender = me.gender || '保密';
      $$('[data-g]', root).forEach((el) => el.addEventListener('click', () => {
        gender = el.getAttribute('data-g');
        $$('[data-g]', root).forEach((x) => x.classList.toggle('checked', x === el));
      }));
      const avatarInput = $('#avatar-input', root);
      $('.form-item:first-child', root).addEventListener('click', (e) => { if (e.target.closest('#avatar-preview')) avatarInput.click(); });
      avatarInput.addEventListener('change', async () => {
        const f = avatarInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = String(reader.result).split(',')[1];
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const r = await API.post('/user/upload', { data, ext });
            avatar = r.url;
            $('#avatar-preview', root).src = r.url;
            toast('头像已上传', 'success');
          } catch (e) { toast(e.message, 'error'); }
        };
        reader.readAsDataURL(f);
      });
      $('[data-save]', root).addEventListener('click', async () => {
        const nickname = $('#f-nickname', root).value.trim();
        if (nickname.length < 2) return toast('昵称至少2个字符', 'error');
        try {
          const body = { nickname, gender, avatar };
          const birthday = $('#f-birthday', root).value;
          if (birthday) body.birthday = birthday;
          // 邮箱修改走「绑定邮箱」验证码流程（后端已拒绝 profile 直接改邮箱）
          const r = await API.put('/auth/profile', body);
          Auth.user = r.user;
          toast('保存成功', 'success');
          history.back();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

/* ============================================================
   收藏
   ============================================================ */
async function vFavorites() {
  const list = await API.get('/user/favorites');
  return {
    html: `${navBar('我的收藏')}
      <div class="section" style="padding-top:4px">
        <div class="product-grid" id="fav-grid">
          ${list.map((f) => `
            <div class="product-card" data-goto="#/product/${f.product.id}" style="position:relative">
              <button data-unfav="${f.favId}" data-pid="${f.product.id}" style="position:absolute;top:8px;right:8px;z-index:3;background:rgba(255,255,255,0.9);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:var(--danger);box-shadow:var(--shadow)">${icon('heartFill', 16)}</button>
              <img class="p-img" src="${esc((f.product.images || ['/img/placeholder.svg'])[0])}" onerror="imgFallback(event)" loading="lazy" alt="">
              <div class="p-body">
                <div class="p-name">${esc(f.product.name)}</div>
                <div class="p-foot"><div class="p-price"><small>¥</small>${fmtPrice(f.product.price)}</div><div class="p-sales">已售 ${f.product.sales || 0}</div></div>
              </div>
            </div>`).join('')}
        </div>
        ${list.length ? '' : emptyHtml('还没有收藏的商品', '去逛逛', '#/home')}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      $$('[data-unfav]', root).forEach((el) => el.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await API.del('/user/favorites/' + el.getAttribute('data-pid'));
          el.closest('.product-card').remove();
          toast('已取消收藏');
          if (!$('.product-card', root)) $('#fav-grid', root).innerHTML = emptyHtml('还没有收藏的商品', '去逛逛', '#/home');
          bindGoto(root);
        } catch (err) { toast(err.message, 'error'); }
      }));
    }
  };
}

/* ============================================================
   地址
   ============================================================ */
/* ============================================================
   省市区选择器（底部弹层，三级滚动点选）
   ============================================================ */
function regionPicker(initRegion, onPick) {
  const R = window.REGION_DATA || [];
  const sel = { prov: '', city: '', dist: '' };
  if (initRegion) {
    const parts = String(initRegion).split(/[\s\u3000]+/).filter(Boolean);
    const prov = R.find((p) => p.name === parts[0]);
    if (prov) {
      sel.prov = prov.name;
      if (parts[1]) {
        const city = prov.children.find((c) => c.name === parts[1]);
        if (city) { sel.city = city.name; if (parts[2]) sel.dist = parts[2]; }
      }
    }
  }
  const ui = openSheet(`<div class="sheet-title">选择所在地区</div><button class="sheet-close">${icon('close', 18)}</button><div class="region-picker"></div>`);
  const box = ui.el.querySelector('.region-picker');
  const renderList = () => {
    let items = [], lvl = 0;
    if (!sel.prov) lvl = 0;
    else if (!sel.city) lvl = 1;
    else lvl = 2;
    if (lvl === 0) items = R.map((p) => p.name);
    else if (lvl === 1) { const p = R.find((x) => x.name === sel.prov); items = (p.children || []).map((c) => c.name); }
    else { const p = R.find((x) => x.name === sel.prov); const c = (p.children || []).find((x) => x.name === sel.city); items = (c && c.children) ? c.children.slice() : []; }
    box.innerHTML = `
      <div class="region-tabs">
        <span class="rtab ${sel.prov ? 'done' : 'on'}" data-lvl="0">${esc(sel.prov || '请选择省')}</span>
        <span class="rtab ${sel.prov ? (sel.city ? 'done' : 'on') : 'disabled'}" data-lvl="1">${esc(sel.city || '请选择市')}</span>
        <span class="rtab ${sel.city ? (sel.dist ? 'done' : 'on') : 'disabled'}" data-lvl="2">${esc(sel.dist || '请选择区')}</span>
      </div>
      <div class="region-list">${items.map((n) => `<div class="region-item ${((lvl === 0 && n === sel.prov) || (lvl === 1 && n === sel.city) || (lvl === 2 && n === sel.dist)) ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}${((lvl === 0 && n === sel.prov) || (lvl === 1 && n === sel.city) || (lvl === 2 && n === sel.dist)) ? icon('check', 16) : ''}</div>`).join('')}</div>`;
    if (lvl === 1 && items.length === 1 && items[0] === '市辖区') { sel.city = '市辖区'; renderList(); return; }
    box.querySelectorAll('.rtab:not(.disabled)').forEach((t) => t.addEventListener('click', () => {
      const l = Number(t.getAttribute('data-lvl'));
      if (l === 0) { sel.city = ''; sel.dist = ''; }
      if (l === 1) { sel.dist = ''; }
      renderList();
    }));
    box.querySelectorAll('.region-item').forEach((it) => it.addEventListener('click', () => {
      const n = it.getAttribute('data-n');
      if (lvl === 0) { sel.prov = n; sel.city = ''; sel.dist = ''; }
      else if (lvl === 1) { sel.city = n; sel.dist = ''; }
      else { sel.dist = n; }
      if (lvl < 2) { renderList(); return; }
      ui.close();
      onPick(sel.prov + ' ' + sel.city + ' ' + sel.dist);
    }));
  };
  renderList();
}

async function vAddresses() {
  const list = await API.get('/user/addresses');
  return {
    html: `${navBar('收货地址')}
      <div class="section" style="padding-top:4px">
        ${list.map((a) => `
          <div class="address-card">
            <div class="addr-main">
              <div class="addr-name">${esc(a.name)} <span class="addr-phone">${esc(a.phone)}</span> ${a.isDefault ? '<span class="tag tag-primary">默认</span>' : ''}</div>
              <div class="addr-detail">${esc(a.region + ' ' + a.detail)}</div>
              <div class="addr-ops mt-8">
                <span data-edit="${a.id}">${icon('edit', 14)} 编辑</span>
                ${a.isDefault ? '' : `<span data-default="${a.id}">${icon('check', 14)} 设为默认</span>`}
                <span data-del="${a.id}" style="color:var(--danger)">${icon('trash', 14)} 删除</span>
              </div>
            </div>
          </div>`).join('')}
        ${list.length ? '' : emptyHtml('还没有收货地址', '新增地址', '#/address/new')}
      </div>
      <div class="form-actions px-12"><button class="btn btn-primary btn-block" data-goto="#/address/new">+ 新增收货地址</button></div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      $$('[data-edit]', root).forEach((el) => el.addEventListener('click', () => location.hash = '#/address/' + el.getAttribute('data-edit')));
      $$('[data-del]', root).forEach((el) => el.addEventListener('click', async () => {
        if (!await confirmDlg('确定删除该地址吗？')) return;
        try { await API.del('/user/addresses/' + el.getAttribute('data-del')); toast('已删除', 'success'); location.reload(); }
        catch (e) { toast(e.message, 'error'); }
      }));
      $$('[data-default]', root).forEach((el) => el.addEventListener('click', async () => {
        try { await API.put('/user/addresses/' + el.getAttribute('data-default') + '/default'); location.reload(); }
        catch (e) { toast(e.message, 'error'); }
      }));
    }
  };
}

async function vAddressEdit(params) {
  const id = params[0];
  let addr = null;
  if (id && id !== 'new') addr = (await API.get('/user/addresses')).find((a) => a.id === Number(id));
  return {
    html: `${navBar(addr ? '编辑地址' : '新增地址')}
      <div class="form">
        <div class="form-card">
          <div class="form-item"><span class="form-label">收货人</span><input class="input" id="f-name" value="${esc(addr ? addr.name : '')}" maxlength="20" placeholder="姓名"></div>
          <div class="form-item"><span class="form-label">手机号</span><input class="input" id="f-phone" maxlength="11" inputmode="numeric" value="${esc(addr ? addr.phone : '')}" placeholder="手机号"></div>
          <div class="form-item"><span class="form-label">所在地区</span><input class="input" id="f-region" readonly value="${esc(addr ? addr.region : '')}" placeholder="点击选择 省 市 区" style="background:var(--bg);cursor:pointer"></div>
          <div class="form-item"><span class="form-label">详细地址</span><input class="input" id="f-detail" value="${esc(addr ? addr.detail : '')}" placeholder="街道、门牌号等"></div>
          <div class="form-item"><span class="form-label">设为默认</span><div class="checkbox round-s ${addr && addr.isDefault ? 'checked' : ''}" id="f-default">${icon('check', 12)}</div></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-save>保存地址</button></div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      const defBox = $('#f-default', root);
      defBox.addEventListener('click', () => defBox.classList.toggle('checked'));
      const regionBox = $('#f-region', root);
      regionBox.addEventListener('click', () => regionPicker(regionBox.value, (v) => { regionBox.value = v; }));
      $('[data-save]', root).addEventListener('click', async () => {
        const name = $('#f-name', root).value.trim();
        const phone = $('#f-phone', root).value.trim();
        const region = $('#f-region', root).value.trim();
        const detail = $('#f-detail', root).value.trim();
        if (!name || !phone || !region || !detail) return toast('请填写完整信息', 'error');
        if (!/^1[3-9]\d{9}$/.test(phone)) return toast('手机号格式不正确', 'error');
        const body = { name, phone, region, detail, isDefault: defBox.classList.contains('checked') };
        try {
          if (addr) await API.put('/user/addresses/' + addr.id, body);
          else await API.post('/user/addresses', body);
          toast('已保存', 'success');
          history.back();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

/* ============================================================
   积分
   ============================================================ */
async function vPoints() {
  const [logs, coupons] = await Promise.all([
    API.get('/user/points-logs?size=50'),
    API.get('/shop/coupons')
  ]);
  const exchange = coupons.filter((c) => c.pointsCost > 0);
  return {
    html: `${navBar('我的积分')}
      <div class="pay-amount-box" style="border-radius:0">
        <div class="pa-label">当前积分</div>
        <div class="pa-num">${logs.balance}</div>
        <div class="pa-label mt-8" data-goto="#/vip">${icon('vip', 14)} 查看会员等级</div>
      </div>
      ${exchange.length ? `
        <div class="section">
          <div class="section-title"><span>积分兑换</span></div>
          ${exchange.map((c) => `
            <div class="coupon-card">
              <div class="coupon-left"><div class="c-amount">${c.pointsCost}<small> 积分</small></div><div class="c-type">积分兑换</div></div>
              <div class="coupon-body">
                <div class="coupon-name">${esc(c.name)}</div>
                <div class="coupon-threshold">${c.type === 'fullcut' ? '满' + fmtPrice(c.threshold) + '减' + fmtPrice(c.amount) : fmtPrice(c.discount * 10).replace(/\.0$/, '') + '折券'}</div>
                <div class="coupon-time">${fmtDate(c.endAt)} 到期</div>
              </div>
              <div class="coupon-right"><button class="btn btn-primary btn-sm" data-exchange="${c.id}">兑换</button></div>
            </div>`).join('')}
        </div>` : ''}
      <div class="section">
        <div class="section-title"><span>积分明细</span></div>
        ${logs.list.length ? logs.list.map((l) => `
          <div class="flex between" style="padding:10px 2px;border-bottom:1px solid var(--line)">
            <div><div class="text-sm">${esc(l.desc)}</div><div class="text-xs text-3 mt-8">${fmtTime(l.createdAt)}</div></div>
            <span class="${l.change > 0 ? 'text-success' : 'text-danger'} fw-600">${l.change > 0 ? '+' : ''}${l.change}</span>
          </div>`).join('') : emptyHtml('暂无积分记录', '', '')}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      $$('[data-exchange]', root).forEach((el) => el.addEventListener('click', async () => {
        if (!await confirmDlg('确定用积分兑换该优惠券吗？')) return;
        try { await API.post('/user/coupons/claim/' + el.getAttribute('data-exchange')); toast('兑换成功', 'success'); location.reload(); }
        catch (e) { toast(e.message, 'error'); }
      }));
    }
  };
}

/* ============================================================
   优惠券
   ============================================================ */
async function vCoupons() {
  const [claimable, mine] = await Promise.all([
    API.get('/shop/coupons'),
    API.get('/user/coupons')
  ]);
  let tab = 'claim';
  const claimHtml = claimable.map((c) => `
    <div class="coupon-card">
      <div class="coupon-left"><div class="c-amount">${c.type === 'fullcut' ? '¥' + fmtPrice(c.amount) : fmtPrice(c.discount * 10).replace(/\.0$/, '') + '折'}</div><div class="c-type">${c.type === 'fullcut' ? '满减券' : '折扣券'}</div></div>
      <div class="coupon-body">
        <div class="coupon-name">${esc(c.name)}</div>
        <div class="coupon-threshold">${c.type === 'fullcut' ? '满 ' + fmtPrice(c.threshold) + ' 可用' : '满 ' + fmtPrice(c.threshold) + ' 可用'}${c.pointsCost > 0 ? ' · ' + c.pointsCost + ' 积分' : ''}</div>
        <div class="coupon-time">${fmtDate(c.endAt)} 到期 · 剩余 ${c.total - c.claimed} 张</div>
      </div>
      <div class="coupon-right"><button class="btn btn-primary btn-sm" data-claim="${c.id}">立即领取</button></div>
    </div>`).join('');
  const mineHtml = mine.length ? mine.map((c) => {
    const gray = c.status === 'used' || c.status === 'expired';
    return `<div class="coupon-card ${gray ? 'gray' : ''}">
      <div class="coupon-left"><div class="c-amount">${c.type === 'fullcut' ? '¥' + fmtPrice(c.amount) : fmtPrice(c.discount * 10).replace(/\.0$/, '') + '折'}</div><div class="c-type">${c.type === 'fullcut' ? '满减券' : '折扣券'}</div></div>
      <div class="coupon-body">
        <div class="coupon-name">${esc(c.name)}</div>
        <div class="coupon-threshold">${c.status === 'unused' ? (c.type === 'fullcut' ? '满 ' + fmtPrice(c.threshold) + ' 可用' : '满 ' + fmtPrice(c.threshold) + ' 可用') : c.status === 'used' ? '已于 ' + fmtTime(c.usedAt) + ' 使用' : '已过期'}</div>
        <div class="coupon-time">${fmtDate(c.endAt)} 到期</div>
      </div>
      <div class="coupon-right">${c.status === 'unused' ? '<span class="tag tag-primary">可用</span>' : c.status === 'used' ? '<span class="tag tag-gray">已使用</span>' : '<span class="tag tag-gray">已过期</span>'}</div>
    </div>`;
  }).join('') : emptyHtml('暂无优惠券', '去领券', '');
  return {
    html: `${navBar('优惠券')}
      <div class="tabs">
        <div class="tab-item active" data-tab="claim">领券中心</div>
        <div class="tab-item" data-tab="mine">我的优惠券</div>
      </div>
      <div class="section" style="padding-top:10px" id="coupon-box">${claimHtml || emptyHtml('暂无可领取的优惠券', '', '')}</div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      $$('[data-tab]', root).forEach((el) => el.addEventListener('click', () => {
        tab = el.getAttribute('data-tab');
        $$('[data-tab]', root).forEach((x) => x.classList.toggle('active', x === el));
        $('#coupon-box', root).innerHTML = tab === 'claim' ? (claimHtml || emptyHtml('暂无可领取的优惠券', '', '')) : mineHtml;
        bindActions();
      }));
      const bindActions = () => {
        $$('[data-claim]', root).forEach((el) => el.addEventListener('click', async () => {
          try { await API.post('/user/coupons/claim/' + el.getAttribute('data-claim')); toast('领取成功', 'success'); el.textContent = '已领取'; el.disabled = true; refreshMsgBadge(); }
          catch (e) { toast(e.message, 'error'); }
        }));
      };
      bindActions();
    }
  };
}

/* ============================================================
   会员中心
   ============================================================ */
async function vVip() {
  const me = (await API.get('/auth/me')).user;
  const levels = [
    { lv: 1, name: '普通会员', min: 0, icon: 'user', perks: '基础购物权益' },
    { lv: 2, name: '白银会员', min: 500, icon: 'star', perks: '会员日专属折扣' },
    { lv: 3, name: '黄金会员', min: 2000, icon: 'vip', perks: '专属客服 + 生日礼包' },
    { lv: 4, name: '钻石会员', min: 5000, icon: 'crown', perks: '大额券优先领取' },
    { lv: 5, name: '至尊会员', min: 10000, icon: 'crown', perks: '一对一专属服务' }
  ];
  return {
    html: `${navBar('会员中心')}
      <div class="pay-amount-box" style="border-radius:0 0 20px 20px">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px">${icon('vip', 26)}<span style="font-size:22px;font-weight:800">${esc(me.levelName)}</span></div>
        <div class="pa-label mt-8">累计消费 ¥${fmtPrice(me.totalSpend)} · 当前积分 ${me.points}</div>
      </div>
      <div class="section">
        <div class="section-title"><span>等级体系</span></div>
        ${levels.map((l) => {
          const isReached = me.level >= l.lv;
          const isCur = me.level === l.lv;
          return `<div class="card" style="padding:14px;margin-bottom:10px;${isCur ? 'border:1.5px solid var(--primary)' : ''}">
            <div class="flex between">
              <div class="flex gap-10"><span style="color:${isReached ? 'var(--primary)' : 'var(--text-3)'}">${icon(l.icon === 'crown' ? 'vip' : l.icon, 24)}</span>
                <div><div class="fw-600">${esc(l.name)}${isCur ? ' <span class="tag tag-primary">当前等级</span>' : ''}${isReached && !isCur ? ' <span class="tag tag-success">已达成</span>' : ''}</div>
                <div class="text-sm text-3 mt-8">累计消费满 ¥${fmtPrice(l.min)} · ${esc(l.perks)}</div></div>
              </div>
              ${!isReached ? `<span class="text-3 text-sm">还差 ¥${fmtPrice(l.min - me.totalSpend)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`,
    mount() { bindBack($('#view')); }
  };
}

/* ============================================================
   客服中心（在线对话 / 工单 / FAQ）
   ============================================================ */
const SERVICE_TABS = [
  { key: 'chat', text: '在线客服' }, { key: 'ticket', text: '工单' }, { key: 'faq', text: '常见问题' }
];

async function vService(params) {
  const tab = params[0] || 'chat';
  const me = (await API.get('/auth/me')).user;
  const quickMsgs = ['怎么查看卡密', '如何申请退款', '优惠券怎么用', '人工客服'];

  const chatView = () => {
    const listHtml = `<div class="chat-list" id="chat-list"></div>
      <div class="chat-quick" id="chat-quick">${quickMsgs.map((q) => `<span data-quick="${esc(q)}">${esc(q)}</span>`).join('')}</div>
      <div class="chat-input-bar">
        <input id="chat-input" placeholder="请输入您的问题" maxlength="500">
        <button class="btn btn-primary btn-sm" id="chat-send" style="height:40px;border-radius:20px;padding:0 20px">发送</button>
      </div>`;
    return listHtml;
  };

  return {
    html: `${navBar('客服中心')}
      <div class="tabs">
        ${SERVICE_TABS.map((t) => `<div class="tab-item ${t.key === tab ? 'active' : ''}" data-goto="#/service/${t.key}">${t.text}</div>`).join('')}
      </div>
      <div id="service-body">
        ${tab === 'chat' ? chatView() : tab === 'ticket' ? '<div class="load-more">加载中...</div>' : '<div class="load-more">加载中...</div>'}
      </div>`,
    async mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      const body = $('#service-body', root);

      if (tab === 'chat') {
        const list = $('#chat-list', root);
        const loadMsgs = async (scrollBottom) => {
          try {
            const msgs = await API.get('/user/chat');
            list.innerHTML = msgs.map((m) => `
              <div class="chat-bubble ${m.role === 'user' ? 'me' : (m.role === 'admin' ? 'me' : 'bot')}">
                ${m.role === 'user' ? `<img class="chat-avatar" src="${esc(me.avatar)}" onerror="imgFallback(event)" alt="">` : `<img class="chat-avatar" src="/img/logo.svg" alt="">`}
                <div>
                  <div class="chat-content">${esc(m.content)}</div>
                  <div class="chat-time" style="${m.role === 'user' ? 'text-align:right' : ''}">${m.role === 'user' ? '我' : m.role === 'admin' ? '客服' : '智能助手'} · ${relTime(m.createdAt)}</div>
                </div>
              </div>`).join('');
            if (scrollBottom) list.scrollTop = list.scrollHeight;
          } catch (e) {}
        };
        await loadMsgs(true);
        const send = async () => {
          const input = $('#chat-input', root);
          const content = input.value.trim();
          if (!content) return;
          input.value = '';
          try {
            await API.post('/user/chat', { content });
            await loadMsgs(true);
          } catch (e) { toast(e.message, 'error'); }
        };
        $('#chat-send', root).addEventListener('click', send);
        $('#chat-input', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        $$('[data-quick]', root).forEach((el) => el.addEventListener('click', () => {
          $('#chat-input', root).value = el.getAttribute('data-quick');
          send();
        }));
        // 3 秒轮询新消息
        pollTimer = setInterval(() => loadMsgs(false), 3000);
      } else if (tab === 'ticket') {
        const list = await API.get('/user/tickets');
        body.innerHTML = `
          <div class="section" style="padding-top:4px" id="ticket-box">
            ${list.length ? list.map((t) => `
              <div class="ticket-card" data-ticket="${t.id}">
                <div class="ticket-head"><span class="ticket-type">${esc(t.type)}</span><span class="tag ${t.status === 'open' ? 'tag-warning' : t.status === 'processing' ? 'tag-info' : 'tag-gray'}">${t.status === 'open' ? '待处理' : t.status === 'processing' ? '处理中' : '已关闭'}</span></div>
                <div class="ticket-desc">${esc(t.description)}</div>
                ${t.reply ? `<div class="ticket-reply">客服回复：${esc(t.reply)}</div>` : ''}
                <div class="ticket-meta">提交时间：${fmtTime(t.createdAt)}</div>
              </div>`).join('') : emptyHtml('暂无工单', '提交工单', '')}
            <div class="form-actions">
              <button class="btn btn-primary btn-block" data-new-ticket>+ 提交工单</button>
            </div>
            <div id="ticket-form" style="display:none">
              <div class="form-card">
                <div class="form-item"><span class="form-label">问题类型</span>
                  <select id="t-type">
                    <option>卡密问题</option><option>未到账</option><option>退款申请</option><option>账户问题</option><option>其他</option>
                  </select>
                </div>
                <div class="form-item" style="align-items:flex-start"><span class="form-label" style="padding-top:4px">问题描述</span><textarea class="input" id="t-desc" rows="3" placeholder="请详细描述问题" style="resize:none;line-height:1.7"></textarea></div>
              </div>
              <div class="form-actions"><button class="btn btn-primary btn-block" data-submit-ticket>提交工单</button></div>
            </div>
          </div>`;
        bindGoto(body);
        $('[data-new-ticket]', body).addEventListener('click', () => {
          const f = $('#ticket-form', body);
          f.style.display = f.style.display === 'none' ? '' : 'none';
        });
        $('[data-submit-ticket]', body).addEventListener('click', async () => {
          const type = $('#t-type', body).value;
          const description = $('#t-desc', body).value.trim();
          if (!description) return toast('请填写问题描述', 'error');
          try {
            await API.post('/user/tickets', { type, description });
            toast('工单已提交', 'success');
            location.reload();
          } catch (e) { toast(e.message, 'error'); }
        });
      } else {
        const faqs = await API.get('/shop/faqs');
        body.innerHTML = `
          <div style="padding:12px">
            <div class="search-bar">${icon('search', 18)}<input class="search-input" id="faq-input" placeholder="搜索常见问题"></div>
          </div>
          <div class="section" style="padding-top:0" id="faq-box">
            ${faqs.map((f, i) => `
              <div class="faq-item" data-faq="${i}">
                <div class="faq-q"><span>${esc(f.question)}</span><span class="faq-arrow">${icon('down', 18)}</span></div>
                <div class="faq-a">${esc(f.answer)}</div>
                <div class="text-xs text-3" style="padding:0 14px 10px">分类：${esc(f.category)}</div>
              </div>`).join('')}
          </div>`;
        $$('[data-faq]', body).forEach((el) => el.addEventListener('click', () => el.classList.toggle('open')));
        $('#faq-input', body).addEventListener('input', debounce(() => {
          const kw = $('#faq-input', body).value.trim().toLowerCase();
          $$('[data-faq]', body).forEach((el) => {
            const match = el.textContent.toLowerCase().indexOf(kw) >= 0;
            el.style.display = match ? '' : 'none';
          });
        }, 200));
      }
    }
  };
}

/* ============================================================
   消息
   ============================================================ */
const MSG_TABS = [
  { key: 'all', text: '全部' }, { key: 'system', text: '系统' },
  { key: 'order', text: '订单' }, { key: 'activity', text: '活动' }
];
const MSG_ICON = {
  system: { icon: 'bell', color: '#0F6DFF' },
  order: { icon: 'order', color: '#FF6A00' },
  activity: { icon: 'gift', color: '#12A150' }
};

async function vMessages(params) {
  const type = params[0] || 'all';
  const r = await API.get('/user/messages?type=' + type + '&size=50');
  return {
    html: `${navBar('消息通知', '<span style="font-size:13px;color:var(--text-2);padding:0 6px" data-readall>全部已读</span>')}
      <div class="tabs">
        ${MSG_TABS.map((t) => `<div class="tab-item ${t.key === type ? 'active' : ''}" data-goto="#/messages/${t.key}">${t.text}</div>`).join('')}
      </div>
      <div class="section" style="padding-top:4px">
        ${r.list.length ? r.list.map((m) => {
          const ic = MSG_ICON[m.type] || MSG_ICON.system;
          return `<div class="msg-item" data-goto="#/message/${m.id}">
            <span class="msg-icon" style="background:${ic.color}">${icon(ic.icon, 20)}</span>
            <div class="msg-body">
              <div class="msg-title"><b>${esc(m.title)}</b><span class="msg-time">${relTime(m.createdAt)}</span></div>
              <div class="msg-summary">${esc(m.content)}</div>
            </div>
            ${m.isRead ? '' : '<span class="msg-dot"></span>'}
          </div>`;
        }).join('') : emptyHtml('暂无消息', '', '')}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      $('[data-readall]', root).addEventListener('click', async () => {
        try { await API.post('/user/messages/read-all'); toast('已全部标记为已读', 'success'); location.reload(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

async function vMessage(params) {
  const id = params[0];
  const r = await API.get('/user/messages?type=all&size=100');
  const m = r.list.find((x) => x.id === Number(id));
  if (!m) return { html: emptyHtml('消息不存在', '返回', '#/messages'), mount() { bindGoto($('#view')); } };
  if (!m.isRead) { try { await API.post('/user/messages/' + m.id + '/read'); refreshMsgBadge(); } catch (e) {} }
  return {
    html: `${navBar('消息详情')}
      <div class="msg-detail">
        <div class="md-title">${esc(m.title)}</div>
        <div class="md-time">${fmtTime(m.createdAt)}</div>
        <div class="md-content">${esc(m.content)}</div>
      </div>`,
    mount() { bindBack($('#view')); }
  };
}

/* ============================================================
   设置 / 账号安全 / 关于
   ============================================================ */
async function vSettings() {
  const me = (await API.get('/auth/me')).user;
  return {
    html: `${navBar('系统设置')}
      <div class="section" style="padding-top:4px">
        <div class="cell-group">
          <div class="cell" data-goto="#/security"><span class="cell-icon">${icon('lock', 20)}</span><div class="cell-body cell-title">账号安全</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell"><span class="cell-icon">${icon('msg', 20)}</span><div class="cell-body cell-title">消息推送</div><label class="switch" style="margin-left:auto"><input type="checkbox" id="push-toggle" ${localStorage.getItem('push_enabled') !== '0' ? 'checked' : ''}><i></i></label></div>
          <div class="cell"><span class="cell-icon">${icon('eye', 20)}</span><div class="cell-body cell-title">深色模式</div><label class="switch" style="margin-left:auto"><input type="checkbox" id="dark-toggle" ${document.body.classList.contains('dark') ? 'checked' : ''}><i></i></label></div>
          <div class="cell" data-clear-cache><span class="cell-icon">${icon('refresh', 20)}</span><div class="cell-body cell-title">清除缓存</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
        <div class="cell-group">
          <div class="cell" data-goto="#/about"><span class="cell-icon">${icon('info', 20)}</span><div class="cell-body cell-title">关于我们</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
        <div class="form-actions"><button class="btn btn-danger btn-block" data-logout>退出登录</button></div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      $('#dark-toggle', root).addEventListener('change', (e) => {
        document.body.classList.toggle('dark', e.target.checked);
        localStorage.setItem('dark_mode', e.target.checked ? '1' : '0');
      });
      $('#push-toggle', root).addEventListener('change', (e) => {
        localStorage.setItem('push_enabled', e.target.checked ? '1' : '0');
        toast(e.target.checked ? '已开启消息推送' : '已关闭消息推送', 'success');
      });
      $('[data-clear-cache]', root).addEventListener('click', async () => {
        if (!await confirmDlg('将清除本地搜索记录等缓存，确定？')) return;
        localStorage.removeItem('search_history');
        toast('缓存已清除', 'success');
      });
      $('[data-logout]', root).addEventListener('click', async () => {
        if (!await confirmDlg('确定退出登录吗？')) return;
        Auth.logout();
        location.hash = '#/home';
      });
    }
  };
}

async function vSecurity() {
  const me = (await API.get('/auth/me')).user;
  return {
    html: `${navBar('账号安全')}
      <div class="form">
        <div class="form-card">
          <div class="form-item"><span class="form-label">原密码</span><input class="input" id="f-old" type="password" placeholder="输入原密码"></div>
          <div class="form-item"><span class="form-label">新密码</span><input class="input" id="f-next" type="password" placeholder="至少6位"></div>
          <div class="form-item"><span class="form-label">确认新密码</span><input class="input" id="f-next2" type="password" placeholder="再次输入"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-block" data-changepwd>修改密码</button></div>
        <div class="cell-group" style="margin-top:12px">
          <div class="cell" data-bind-email><span class="cell-icon">${icon('msg', 20)}</span><div class="cell-body cell-title">绑定邮箱（用于找回密码）</div><div class="cell-value">${esc(me.email || '未绑定')}</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
        <div class="cell-group">
          <div class="cell" data-del-account style="color:var(--danger)"><span class="cell-icon" style="color:var(--danger)">${icon('trash', 20)}</span><div class="cell-body cell-title">注销账号</div><span class="cell-arrow">${icon('right', 16)}</span></div>
        </div>
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      bindGoto(root);
      const btn = $('[data-changepwd]', root);
      if (btn) btn.addEventListener('click', async () => {
        const old = $('#f-old', root).value;
        const next = $('#f-next', root).value;
        const next2 = $('#f-next2', root).value;
        if (!old || next.length < 6) return toast('请填写完整信息', 'error');
        if (next !== next2) return toast('两次密码不一致', 'error');
        try { await API.put('/auth/password', { old, next }); toast('修改成功，请重新登录', 'success'); Auth.logout(); location.hash = '#/login'; }
        catch (e) { toast(e.message, 'error'); }
      });
      const be = $('[data-bind-email]', root);
      if (be) be.addEventListener('click', () => openBindDialog());
      $('[data-del-account]', root).addEventListener('click', async () => {
        if (!await dialog({ title: '注销账号', text: '注销后账号数据将被删除且不可恢复，确定继续？', confirmText: '确定注销', cancelText: '再想想', danger: true })) return;
        try {
          await API.del('/user/account');
          Auth.logout();
          toast('账号已注销', 'success');
          location.hash = '#/home';
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

async function vAbout() {
  const site = await loadSite();
  return {
    html: `${navBar('关于我们')}
      <div style="text-align:center;padding:36px 20px 20px">
        <img src="${esc(site.logo)}" style="width:76px;height:76px;border-radius:20px" alt="">
        <div style="font-size:20px;font-weight:800;margin-top:12px">${esc(site.siteName)}</div>
        <div class="text-2 text-sm mt-8">${esc(site.slogan)}</div>
        <div class="text-3 text-xs mt-8">版本 v1.0.0</div>
      </div>
      <div class="section">
        <div class="cell-group">
          <div class="cell" data-agreement><span class="cell-icon">${icon('file', 20)}</span><div class="cell-body cell-title">用户协议</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          <div class="cell" data-privacy><span class="cell-icon">${icon('shield', 20)}</span><div class="cell-body cell-title">隐私政策</div><span class="cell-arrow">${icon('right', 16)}</span></div>
          ${site.contactPhone ? `<div class="cell"><span class="cell-icon">${icon('phone', 20)}</span><div class="cell-body cell-title">客服电话</div><div class="cell-value">${esc(site.contactPhone)}</div></div>` : ''}
          ${site.contactQQ ? `<div class="cell"><span class="cell-icon">${icon('msg', 20)}</span><div class="cell-body cell-title">客服QQ</div><div class="cell-value">${esc(site.contactQQ)}</div></div>` : ''}
          ${site.contactWechat ? `<div class="cell"><span class="cell-icon">${icon('users', 20)}</span><div class="cell-body cell-title">客服微信</div><div class="cell-value">${esc(site.contactWechat)}</div></div>` : ''}
        </div>
        ${site.icp ? `<div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">${esc(site.icp)}</div>` : ''}
      </div>`,
    mount() {
      const root = $('#view');
      bindBack(root);
      const showDoc = (title) => dialog({
        title,
        text: `${title}：\n1. 本站提供的卡密/激活码等数字商品，请在有效期内使用，虚拟商品一经发放原则上不支持退款，如有质量问题可在订单详情申请售后。\n2. 用户应合法合规使用本站服务，不得利用本站从事任何违法违规活动。\n3. 本站重视用户隐私保护，仅收集为提供服务所必需的信息。\n4. 本协议最终解释权归${esc(App.site ? App.site.siteName : '本站')}所有。`,
        confirmText: '我知道了'
      });
      $('[data-agreement]', root).addEventListener('click', () => showDoc('用户协议'));
      $('[data-privacy]', root).addEventListener('click', () => showDoc('隐私政策'));
    }
  };
}

/* ============================================================
   启动
   ============================================================ */
async function boot() {
  await loadSite();
  if (localStorage.getItem('dark_mode') === '1') document.body.classList.add('dark');
  if (!location.hash) {
    location.hash = '#/splash';
  } else {
    render();
  }
}

window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', boot);

