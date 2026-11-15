// sw.js 策略回归测试（Node 直接跑，无需浏览器）
//   node _test_sw.cjs
// 重点守住：① HTML 导航必须放行（APK 断网回退的命门）② 图片缓存优先且不阻塞渲染
//           ③ 离线且无缓存要快速返回 504，不能挂住 ④ 非图片资源仍网络优先
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

let fetchCount = 0;
let fetchShouldFail = false;
const store = new Map();          // url -> Response

const cacheObj = {
  match: async (req) => store.get(req.url) || undefined,
  put: async (req, res) => { store.set(req.url, res); return true; },
  addAll: async () => true,
};

globalThis.caches = {
  open: async () => cacheObj,
  keys: async () => ['poke-pwa-v1'],
  delete: async () => true,
  match: async (req) => store.get(req.url),
};

globalThis.fetch = async (req) => {
  fetchCount++;
  if (fetchShouldFail) throw new Error('offline');
  const url = typeof req === 'string' ? req : req.url;
  return new Response('IMG:' + url, {
    status: 200,
    headers: { 'date': new Date().toUTCString(), 'content-type': 'image/png' },
  });
};

const handlers = {};
globalThis.self = {
  addEventListener: (t, fn) => { handlers[t] = fn; },
  location: { origin: 'https://x.test' },
  skipWaiting: () => {},
  clients: { claim: async () => {} },
};

vm.runInThisContext(SRC);

const mk = (url, mode = 'no-cors', method = 'GET') => ({ method, mode, url });
let captured = null;
const fire = (req) => {
  captured = null;
  handlers.fetch({ request: req, respondWith: (p) => { captured = p; } });
  return captured;
};

(async () => {
  const results = [];
  const ok = (name, cond, extra = '') => results.push([cond ? 'PASS' : 'FAIL', name, extra]);

  // 1. navigate 不拦截
  const p1 = fire(mk('https://x.test/', 'navigate'));
  ok('navigate 放行（不调 respondWith）', p1 === null);

  // 2. 图片首次：无缓存 → 走网络，并回填
  fetchCount = 0;
  const r2 = await fire(mk('https://x.test/assets/sprites/home/25.png'));
  const t2 = await r2.text();
  ok('图片无缓存→走网络', fetchCount === 1 && t2.includes('25.png'), `fetch=${fetchCount}`);
  ok('图片首次已回填缓存', store.has('https://x.test/assets/sprites/home/25.png'));

  // 3. 图片第二次：缓存新鲜 → 不再发请求
  fetchCount = 0;
  const r3 = await fire(mk('https://x.test/assets/sprites/home/25.png'));
  const t3 = await r3.text();
  ok('图片命中缓存→零请求', fetchCount === 0 && t3.includes('25.png'), `fetch=${fetchCount}`);

  // 4. 缓存过期 → 仍立刻返回缓存，同时后台刷新
  const old = new Date(Date.now() - 10 * 864e5).toUTCString();
  store.set('https://x.test/assets/sprites/home/6.png',
    new Response('OLD', { status: 200, headers: { 'date': old } }));
  fetchCount = 0;
  const r4 = await fire(mk('https://x.test/assets/sprites/home/6.png'));
  const t4 = await r4.text();
  await new Promise(r => setTimeout(r, 30));   // 等后台刷新落地
  ok('过期仍返回旧图（不阻塞）', t4 === 'OLD', `body=${t4}`);
  ok('过期触发后台刷新', fetchCount === 1, `fetch=${fetchCount}`);

  // 5. 无缓存 + 离线 → 504，而不是挂住
  fetchShouldFail = true;
  const r5 = await fire(mk('https://x.test/assets/sprites/home/999.png'));
  ok('离线且无缓存→504', r5.status === 504, `status=${r5.status}`);
  fetchShouldFail = false;

  // 6. 非图片（manifest）仍走网络优先
  fetchCount = 0;
  const r6 = await fire(mk('https://x.test/manifest.webmanifest'));
  await r6.text();
  ok('manifest 仍网络优先', fetchCount === 1, `fetch=${fetchCount}`);

  // 7. 跨域请求不拦截
  const p7 = fire(mk('https://other.test/a.png'));
  ok('跨域不拦截', p7 === null);

  console.log('\n=== sw.js 策略测试 ===');
  let fail = 0;
  for (const [s, n, e] of results) {
    if (s === 'FAIL') fail++;
    console.log(`  [${s}] ${n}${e ? '  (' + e + ')' : ''}`);
  }
  console.log(`\n${results.length - fail}/${results.length} 通过`);
  process.exit(fail ? 1 : 0);
})();
