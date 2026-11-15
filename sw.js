// 宝可梦学习工作台 PWA Service Worker（图片缓存优先）
// 设计原则：绝不影响 APK 壳的断网回退。
//  - 导航请求（HTML）一律不拦截：断网时 WebView 照常报错 → APK 自动回退内置副本
//    ★ 这条是本文件的命门，任何改动都不许碰。
//  - 图片：缓存优先 + 后台静默更新（stale-while-revalidate），并带 7 天新鲜期。
//    图鉴一册 100~150 张、平均 120KB，网络优先时每次进入都要等这一百多个请求，
//    弱网更糟（要等超时才回退）。改成缓存优先后，第二次进图鉴是立刻出图。
//  - 其余静态资源（manifest / 图标）：保持网络优先，保证改配置能及时生效。
//  - 缓存名带版本号；改动「缓存内容结构」时才 +1。
//    本次只是换了取用策略（network-first → cache-first），缓存里存的还是同一批图片，
//    所以刻意不 +1 —— +1 会触发 activate 清空旧缓存，用户要白白重下一册约 18MB 的图。
const CACHE = 'poke-pwa-v1';
const PRECACHE = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 资源类型判定：图鉴精灵图 / 属性图标 / favicon 等
const IMG_RE = /\.(png|jpe?g|webp|gif|svg|ico)$/i;
// 图片新鲜期：7 天内直接用缓存、连后台请求都不发；超过才去校验更新。
// 精灵图内容基本不变，这个值可以放心给长。取不到响应 Date 头时按「需更新」处理（降级安全）。
const IMG_TTL = 7 * 24 * 60 * 60 * 1000;

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

  // ---------- 图片：缓存优先 ----------
  if (IMG_RE.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (cached) {
        if (cached) {
          // 命中缓存：立刻返回，本次渲染不等网络。
          // 只有过了新鲜期才在后台补一次校验更新（fire-and-forget，不影响本次出图）。
          var dateStr = cached.headers.get('date');
          var age = dateStr ? (Date.now() - new Date(dateStr).getTime()) : Infinity;
          if (!(age < IMG_TTL)) {
            fetch(req).then(function (res) {
              if (res && res.ok) c.put(req, res.clone());
            }).catch(function () { /* 后台刷新失败无所谓，旧图继续用 */ });
          }
          return cached;
        }
        // 没缓存：等网络；失败给明确的 504，让页面显示裂图而不是一直挂着
        return fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone()).catch(function () { /* 存不进就算了 */ });
          return res;
        }).catch(function () {
          return new Response('', { status: 504, statusText: 'offline' });
        });
      });
    }).catch(function () {
      // 极端情况（Cache Storage 打不开 / 配额异常）：退回纯网络，绝不让图片直接失败
      return fetch(req);
    }));
    return;
  }

  // ---------- 其余静态资源：网络优先，失败回退缓存 ----------
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return caches.match(req); }));
});
