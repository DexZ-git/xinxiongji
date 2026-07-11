// 新熊记 service worker —— 缓存外壳，断网可开
const CACHE = 'xiongji-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/recipes.json',
  './data/ingredients.json',
  './assets/icons/APP_icon.png',
  './assets/icons/tab_2_panda_basket_512.png',
  './assets/icons/tab_3_bear_chef_512.png',
  './assets/icons/tab_4_bear_scooter_512.png'
];
// 备用第 4 个 tab 图标：tab_1_eggplant_512.png（灵感）

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// stale-while-revalidate
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.startsWith('/api/')) return; // 同步接口永远走网络、不缓存
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
