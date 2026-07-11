// 新熊记 service worker
// 策略：外壳/图片 = 缓存优先随后更新（快）；data/*.json = 网络优先（保证菜谱数据永远新，避免新旧版本打架）；/api/ 不缓存。
// 安装时预缓存全部菜图（从 recipes.json 动态取，不用手工维护清单）。
const CACHE = 'xiongji-v13';
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
  './assets/icons/tab_1_eggplant_512.png'
];
// 备用 tab 图标：tab_4_bear_scooter_512.png（采购）

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS).catch(() => {});
    // 预缓存全部菜图（失败不阻塞安装）
    try {
      const res = await fetch('./data/recipes.json', { cache: 'no-cache' });
      const data = await res.json();
      const photos = (data.recipes || []).map(r => r.photo).filter(p => p && p.indexOf('assets/') === 0);
      await Promise.all(photos.map(p => c.add('./' + p).catch(() => {})));
    } catch (err) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const path = new URL(e.request.url).pathname;
  if (path.startsWith('/api/')) return; // 同步接口永远直连网络

  // 外壳 + 数据（HTML/JS/CSS/JSON）：网络优先——在线必是最新版，离线回退缓存。
  // 只有图片走缓存优先。这样每次发版用户重开一次即生效，不再出现新旧文件错位。
  const isImage = path.indexOf('/assets/') >= 0;
  if (!isImage) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 图片：stale-while-revalidate（预缓存 + 秒开）
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
