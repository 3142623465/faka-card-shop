/**
 * util.js - 前端工具函数与 SVG 图标库
 * 注意：项目界面一律使用内联 SVG 图标（stroke 风格，currentColor 着色），不使用 emoji。
 */

/* ---------- DOM 快捷方法 ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** HTML 转义（防 XSS） */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 异步等待 */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 价格格式化 */
function fmtPrice(n) {
  n = Number(n) || 0;
  return n.toFixed(2).replace(/\.00$/, '');
}

/** 时间戳（秒）→ 时间字符串 */
function fmtTime(ts) {
  if (!ts) return '';
  const t = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** 时间戳 → 日期字符串 */
function fmtDate(ts) {
  if (!ts) return '';
  const t = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** 相对时间（刚刚/x分钟前/x小时前/x天前） */
function relTime(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return fmtDate(ts);
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = '') {
  let wrap = $('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  wrap.innerHTML = '';
  wrap.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { wrap.innerHTML = ''; }, 2200);
}

/* ---------- 对话框（Promise） ---------- */
function dialog({ title = '提示', text = '', confirmText = '确定', cancelText = '', danger = false }) {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'mask';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.innerHTML = `
      <div class="dialog-title">${esc(title)}</div>
      ${text ? `<div class="dialog-text"></div>` : ''}
      <div class="dialog-actions">
        ${cancelText ? `<button class="btn btn-plain" data-act="cancel">${esc(cancelText)}</button>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>
      </div>`;
    if (text) $('.dialog-text', box).textContent = text;
    const close = (val) => { mask.remove(); box.remove(); resolve(val); };
    $('[data-act=cancel]', box)?.addEventListener('click', () => close(false));
    $('[data-act=ok]', box).addEventListener('click', () => close(true));
    mask.addEventListener('click', () => close(false));
    document.body.appendChild(mask);
    document.body.appendChild(box);
  });
}

/** 确认框快捷方法 */
const confirmDlg = (text, title = '提示') => dialog({ title, text, confirmText: '确定', cancelText: '取消' });

/* ---------- 底部弹层 ---------- */
function openSheet(html) {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = html;
  const close = () => { mask.remove(); sheet.remove(); };
  mask.addEventListener('click', close);
  $('.sheet-close', sheet)?.addEventListener('click', close);
  document.body.appendChild(mask);
  document.body.appendChild(sheet);
  return { el: sheet, close };
}

/* ---------- 复制文本 ---------- */
function copyText(text, tip = '已复制') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast(tip, 'success'), () => fallbackCopy(text, tip));
  } else {
    fallbackCopy(text, tip);
  }
}
function fallbackCopy(text, tip) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast(tip, 'success'); } catch (e) { toast('复制失败，请手动复制', 'error'); }
  ta.remove();
}

/* ---------- 防抖 ---------- */
function debounce(fn, wait = 300) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ---------- SVG 图标库（stroke 风格 24x24） ---------- */
const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  category: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11.2a1.6 1.6 0 001.6 1.3h7.6a1.6 1.6 0 001.6-1.3L20 8H6"/>',
  msg: '<path d="M21 12a8 8 0 01-8 8H4l2.2-2.6A8 8 0 1121 12z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.3 0 3.9-4 7.2-9 11.2z"/>',
  heartFill: '<path fill="currentColor" d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.3 0 3.9-4 7.2-9 11.2z"/>',
  star: '<path d="M12 3l2.7 5.6 6.3.8-4.6 4.3 1.2 6.1L12 16.9 6.4 19.8l1.2-6.1L3 9.4l6.3-.8z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  shield: '<path d="M12 3l8 3v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M12 10v10M4 14h16M12 10c-4 0-6-2-6-4s1.6-2.6 3.4-1.6C11 5.4 12 10 12 10zm0 0c4 0 6-2 6-4s-1.6-2.6-3.4-1.6C13 5.4 12 10 12 10z"/>',
  zap: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  camera: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7l2-3h4l2 3"/><circle cx="12" cy="14" r="4"/>',
  location: '<path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  service: '<path d="M4 11a8 8 0 0116 0"/><rect x="3" y="11" width="4" height="6" rx="2"/><rect x="17" y="11" width="4" height="6" rx="2"/><path d="M20 17v1a3 3 0 01-3 3h-3"/>',
  setting: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.5-1-2 3.5 2 1.5A7 7 0 006 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.5-1a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/>',
  ticket: '<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12"/>',
  point: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  vip: '<path d="M3 6l4.5 12L12 8l4.5 10L21 6"/><path d="M7 6l5 8 5-8"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M10.5 6.2A10.6 10.6 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-2.6 3.2M6.2 6.4C3.4 8.2 2 12 2 12s3.5 6.5 10 6.5c1.6 0 3-.3 4.2-.9"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L20 8a2.1 2.1 0 00-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
  bell: '<path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2.2 2.2 0 004 0"/>',
  refresh: '<path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 3v4h-4"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  box: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v7h6V9"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 15c2.6.3 5.5 1.8 5.5 5"/>',
  order: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  giftCard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M12 9v10"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/>',
  warn: '<path d="M12 3L2 20h20z"/><path d="M12 9v5M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  gift2: '<path d="M20 12v8h-16v-8"/><path d="M2 7h20v5H2zM12 7v13"/>',
  cartAdd: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11.2a1.6 1.6 0 001.6 1.3h7.6a1.6 1.6 0 001.6-1.3L20 8H6"/><path d="M13 4v6M10 7h6"/>',
  phoneCard: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M10 18h4"/>',
  music: '<circle cx="8" cy="17" r="4"/><path d="M12 17V5l8-2v12"/><circle cx="16" cy="15" r="3"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
  game: '<rect x="2" y="7" width="20" height="10" rx="4"/><path d="M7 10v4M5 12h4M15.5 11.5h.01M18 14h.01"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
  headset: '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/><path d="M20 20v1a2 2 0 01-2 2h-4"/>',
  video: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2.5v9L17 14"/>',
  code: '<path d="M8.5 8L4 12l4.5 4M15.5 8L20 12l-4.5 4"/><path d="M13.5 5l-3 14"/>',
  truck: '<rect x="2" y="6" width="14" height="11" rx="1.5"/><path d="M16 10h4l2 3v4h-6"/><circle cx="6.5" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/><path d="M9 19h6"/>',
  branch: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 6.5h2a3 3 0 013 3v4.5M10 17.5h1a3 3 0 003-3V13"/>',
  link: '<path d="M10 14a5 5 0 007.1 0l2.9-2.9a5 5 0 00-7.1-7.1L11 5.6"/><path d="M14 10a5 5 0 00-7.1 0L4 12.9a5 5 0 007.1 7.1L13 18"/>'
};

function icon(name, size = 22, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

/* ---------- 登录态 ---------- */
const Auth = {
  get token() { return localStorage.getItem('token'); },
  set token(v) { v ? localStorage.setItem('token', v) : localStorage.removeItem('token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; }
  },
  set user(v) { v ? localStorage.setItem('user', JSON.stringify(v)) : localStorage.removeItem('user'); },
  get loggedIn() { return !!this.token; },
  logout() { this.token = null; this.user = null; }
};

/* ---------- 订单状态中文映射 ---------- */
const ORDER_STATUS = {
  pending: { text: '待付款', cls: 'status-pending' },
  pending_confirm: { text: '待确认收款', cls: 'status-pending' },
  paid: { text: '待发货', cls: 'status-paid' },
  shipped: { text: '待收货', cls: 'status-shipped' },
  completed: { text: '已完成', cls: 'status-completed' },
  cancelled: { text: '已取消', cls: 'status-cancelled' },
  refunded: { text: '已退款', cls: 'status-refunded' }
};

const AFTERSALE_STATUS = {
  pending: { text: '待处理', cls: 'status-pending' },
  approved: { text: '已同意', cls: 'status-completed' },
  rejected: { text: '已驳回', cls: 'status-cancelled' }
};

/* ---------- 图片加载失败兜底 ---------- */
function imgFallback(e) {
  if (e.target.src.indexOf('/img/placeholder.svg') < 0) e.target.src = '/img/placeholder.svg';
}
