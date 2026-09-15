/**
 * sw.js - 发卡网 PWA 离线缓存
 * 策略：核心静态资源「缓存优先+后台更新」；API 与上传文件一律网络优先（不缓存动态数据）
 */
const CACHE = 'cardshop-v3';
const CORE = [
  '/index.html',
  '/admin.html',
  '/manifest.webmanifest',
  '/css/base.css',
  '/css/admin.css',
  '/js/api.js',
  '/js/util.js',
  '/js/qrcode.js',
  '/js/app.js',
  '/branch.html',
  '/js/branch.js',
  '/js/admin.js',
  '/img/logo.svg',
  '/img/avatar.svg',
  '/img/empty.svg',
  '/img/placeholder.svg',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 仅处理同源 GET
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // API 与上传文件走网络（失败时尝试缓存兜底，保证已访问过的页面离线可用）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // 静态资源：网络优先（失败回退缓存）——保证更新即时生效，离线时用缓存兜底
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
