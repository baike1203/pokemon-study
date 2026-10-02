// 宝可梦学习工作台 PWA Service Worker（配合 v3.50.4）
// 设计原则：绝不影响 APK 壳的断网回退。
//  - 导航请求（HTML）一律不拦截：断网时 WebView 照常报错 → APK 自动回退内置副本
//  - 仅预缓存 manifest / 图标等静态小资源，满足浏览器「可安装」标准并加速二次加载
//  - 缓存名带版本号，后续发版时 +1（如 poke-pwa-v2）即强制刷新旧缓存
const CACHE = 'poke-pwa-v1';
const PRECACHE = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(PRECACHE);
  }).catch(function () { /* 预缓存失败不阻断安装，后续 fetch 走网络 */ }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k !== CACHE) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  // 关键：HTML 导航放行，交由网络 / APK 壳回退逻辑处理，SW 不掺和
  if (req.mode === 'navigate') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 静态资源：网络优先，成功回填缓存；离线时回退缓存
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return caches.match(req); }));
});
