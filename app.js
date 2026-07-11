/* 新熊记 —— 家庭菜谱 / 备菜 / 菜单 App
   纯前端、无框架、本地优先。结构化数据存 localStorage，图片存 IndexedDB。 */

'use strict';

const KEY = 'xiongji_data_v1';
const CAT_EMOJI = { '海鲜': '🦐', '肉禽': '🍖', '蔬菜': '🥬', '汤羹': '🍲', '凉菜': '🥗' };
const GROUP_ORDER = ['生鲜主料', '香料配菜', '常备调料'];

let DB = null;
const state = {
  tab: 'recipes',
  screen: 'recipes',        // recipes | recipe-detail | menus | menu-detail | menu-op | more
  recipeId: null,
  menuId: null,
  menuOp: 'prep',           // prep | cook | memory
  catFilter: '全部',
  selecting: false,         // 点菜模式
  cart: [],
  cartOpen: false,
  cookMode: 'accordion',    // accordion | tabs | check
  cookTab: 0,
  openDishes: {},
  _ret: null,               // 打开菜谱详情前的返回上下文
};
let pendingUpload = null;

/* ---------------- persistence ---------------- */
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }
function rebuildRecipes() { DB.recipes = DB._builtin.concat(DB.userRecipes || []); }
// 用户改动走 mutate：打时间戳 + 存本地 + 防抖上云
function mutate() { DB.updatedAt = Date.now(); save(); schedulePush(); }

/* ---------------- cloud sync（jsonbin，经 CF Function /api/data 代理） ---------------- */
const SYNC = { endpoint: './api/data', tokenKey: 'xiongji_sync_token', status: 'idle', timer: null };
function syncToken() { try { return localStorage.getItem(SYNC.tokenKey) || ''; } catch (e) { return ''; } }
function setSyncToken(t) { try { localStorage.setItem(SYNC.tokenKey, t); } catch (e) {} }
function updateSyncUI() { const el = document.getElementById('sync-status'); if (el) el.textContent = '☁️ ' + syncStatusText(); }
function syncStatusText() {
  if (!syncToken()) return '未连接（打开下方「同步设置」粘口令）';
  const map = { idle: '已连接', saving: '同步中…', ok: '已同步 ✓', error: '同步失败（检查口令/网络）', pulled: '已同步 ✓' };
  return map[SYNC.status] || SYNC.status;
}
function schedulePush() { if (!syncToken()) return; clearTimeout(SYNC.timer); SYNC.timer = setTimeout(cloudPush, 1500); }
async function cloudPull() {
  const t = syncToken(); if (!t) return null;
  try { const r = await fetch(SYNC.endpoint, { headers: { 'x-sync-token': t } }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; }
}
async function cloudPush() {
  const t = syncToken(); if (!t) return;
  SYNC.status = 'saving'; updateSyncUI();
  try {
    const r = await fetch(SYNC.endpoint, { method: 'PUT', headers: { 'x-sync-token': t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ menus: DB.menus, userRecipes: DB.userRecipes || [], updatedAt: DB.updatedAt }) });
    SYNC.status = r.ok ? 'ok' : 'error';
  } catch (e) { SYNC.status = 'error'; }
  updateSyncUI();
}
// 按时间戳双向对账：云更新→覆盖本地；本地更新→上传备份
async function cloudSync() {
  if (!syncToken()) return;
  const cloud = await cloudPull();
  if (cloud === null) { SYNC.status = 'error'; updateSyncUI(); return; }
  const cloudAt = cloud.updatedAt || 0, localAt = DB.updatedAt || 0;
  if (Array.isArray(cloud.menus) && cloudAt > localAt) {
    DB.menus = cloud.menus;
    if (Array.isArray(cloud.userRecipes)) { DB.userRecipes = cloud.userRecipes; rebuildRecipes(); }
    DB.updatedAt = cloudAt; save(); SYNC.status = 'pulled'; render();
  } else if (localAt > cloudAt) { await cloudPush(); }
  else { SYNC.status = 'ok'; updateSyncUI(); }
}

/* ---------------- 主题（明亮/夜晚/跟随系统；设备偏好，存本机不入同步） ---------------- */
const THEME_KEY = 'xiongji_theme';
function themePref() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function setThemePref(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} applyTheme(); }
function applyTheme() {
  const t = themePref();
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#241a13' : '#FFF7EA');
}
if (window.matchMedia) {
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref() === 'auto') applyTheme(); }); } catch (e) {}
}

/* ---------------- 访问门禁（口令 = SYNC_TOKEN，服务端校验，前端不存明文） ---------------- */
const UNLOCK_KEY = 'xiongji_unlocked';
function unlocked() { try { return localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { return false; } }
function setUnlocked(v) { try { v ? localStorage.setItem(UNLOCK_KEY, '1') : localStorage.removeItem(UNLOCK_KEY); } catch (e) {} }
async function probeStatus() { try { const r = await fetch(SYNC.endpoint, { cache: 'no-store' }); return r.status; } catch (e) { return 0; } }
function renderGate(msg) {
  document.body.classList.add('gated');
  document.getElementById('app').innerHTML = `<div class="gate"><div class="gate-card">
    <img class="gate-icon" src="assets/icons/APP_icon.png" alt="新熊记" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'gate-emoji',textContent:'🐻‍❄️'}))">
    <div class="gate-title">新熊记</div>
    <div class="gate-sub">输入口令进入</div>
    <input id="gate-input" class="sync-input" type="password" autocomplete="off" placeholder="访问口令">
    <button class="btn primary block" data-action="gate-enter">进入</button>
    <div class="gate-msg" id="gate-msg">${msg ? esc(msg) : ''}</div>
  </div></div>`;
  const inp = document.getElementById('gate-input');
  if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector('[data-action="gate-enter"]').click(); }); }
}

async function boot() {
  applyTheme();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}

  const [ingRes, recRes] = await Promise.all([
    fetch('./data/ingredients.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('./data/recipes.json', { cache: 'no-cache' }).then(r => r.json()),
  ]);

  // 只保留“用户手动上传”的图（IndexedDB key）；内置 assets/ 路径永远以最新 recipes.json 为准
  // （否则 localStorage 里的旧路径会把新路径钉死——v0.7.1 png→jpg 后真机白图的根因）
  const photoMap = {};
  if (saved && saved.recipes) saved.recipes.forEach(r => { if (r.photo && String(r.photo).indexOf('assets/') !== 0) photoMap[r.id] = r.photo; });

  DB = {
    categories: ingRes.categories,
    purchaseGroups: ingRes.purchaseGroups,
    ingredients: ingRes.ingredients,
    _builtin: recRes.recipes.map(r => ({ ...r, photo: photoMap[r.id] || r.photo || null })),
    userRecipes: (saved && saved.userRecipes) || [],
    menus: (saved && saved.menus) || [],
    updatedAt: (saved && saved.updatedAt) || 0,
  };
  rebuildRecipes();
  save();

  document.body.addEventListener('click', onClick);
  document.getElementById('filepick').addEventListener('change', onFile);
  registerSW();

  if (unlocked()) { render(); cloudSync(); return; }   // 本机已解锁 → 直接进（支持离线）
  const st = await probeStatus();                       // 探后端：401=已设口令需验证；其余=本地/未配置/无需口令
  if (st === 401) renderGate();
  else { setUnlocked(true); render(); cloudSync(); }
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ---------------- IndexedDB (images) ---------------- */
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('xiongji', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('images');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbPut(k, blob) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('images', 'readwrite'); t.objectStore('images').put(blob, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('images', 'readonly'); const r = t.objectStore('images').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

// data-img 可以是 IndexedDB key（用户上传）或内置图片路径（assets/dishes/...）。
// 内置图策略（对弱网/大陆访问 pages.dev 关键）：下载成功一次 → 存 IndexedDB 永久复用，
// 以后不再走网络；失败自动重试 3 次。每张图每台设备只需成功一次。
const IMG_URLS = {}; // key -> objectURL（本次会话复用，避免重复建 URL）
async function imgUrlFor(k) {
  if (IMG_URLS[k]) return IMG_URLS[k];
  const isAsset = k.indexOf('assets/') === 0;
  const idbKey = isAsset ? 'asset:' + k : k;
  try { const b = await idbGet(idbKey); if (b) return (IMG_URLS[k] = URL.createObjectURL(b)); } catch (e) {}
  if (!isAsset) return null; // 用户上传图只存在 IDB，取不到就显示占位
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(k, { cache: 'force-cache' });
      if (res && res.ok) {
        const blob = await res.blob();
        try { await idbPut(idbKey, blob); } catch (e) {}
        return (IMG_URLS[k] = URL.createObjectURL(blob));
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}
async function hydrateImages(root) {
  const els = [...root.querySelectorAll('[data-img]')];
  await Promise.all(els.map(async el => {
    const k = el.getAttribute('data-img');
    if (!k) return;
    const url = await imgUrlFor(k);
    if (url && el.isConnected) { el.style.backgroundImage = `url("${url}")`; el.classList.add('has-img'); }
  }));
}

/* ---------------- lookups ---------------- */
const ing = id => DB.ingredients.find(i => i.id === id);
const recipe = id => DB.recipes.find(r => r.id === id);
const menu = id => DB.menus.find(m => m.id === id);
const esc = s => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function defaultMenuName() { const d = new Date(); return (d.getMonth() + 1) + '月' + d.getDate() + '日家宴'; }

/* ---------------- render ---------------- */
function render() {
  document.body.classList.remove('gated');
  const app = document.getElementById('app');
  let html = '';
  switch (state.screen) {
    case 'recipes': html = viewRecipes(); break;
    case 'recipe-detail': html = viewRecipeDetail(); break;
    case 'menus': html = viewMenusList(); break;
    case 'menu-detail': html = viewMenuDetail(); break;
    case 'menu-op': html = viewMenuOp(); break;
    case 'more': html = viewMore(); break;
    case 'recipe-edit': html = viewRecipeEdit(); break;
  }
  app.innerHTML = html;
  hydrateImages(app);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === state.tab));
}

function catChips(active, action) {
  const cats = ['全部', ...DB.categories];
  return `<div class="chips-row">` + cats.map(c =>
    `<button class="fchip ${c === active ? 'on' : ''}" data-action="${action}" data-cat="${c}">${c}</button>`).join('') + `</div>`;
}

/* ---------- 菜谱 tab（浏览 + 点菜合一，按图选） ---------- */
function viewRecipes() {
  const sel = state.selecting;
  let h = `<div class="rowbar hd-row">
    <h1>菜谱</h1>
    ${sel
      ? `<button class="btn sm ghost" data-action="stop-select">取消</button>`
      : `<button class="btn sm primary" data-action="start-select">🧺 点菜</button>`}
  </div>`;
  h += catChips(state.catFilter, 'filter-cat');

  const list = DB.recipes.filter(r => state.catFilter === '全部' || r.category === state.catFilter);
  h += `<div class="grid">`;
  for (const r of list) {
    const picked = state.cart.includes(r.id);
    h += `<div class="card ${sel && picked ? 'sel' : ''}" data-action="${sel ? 'toggle-pick' : 'open-recipe'}" data-id="${r.id}">
      <div class="thumb" ${r.photo ? `data-img="${r.photo}"` : ''}>${r.photo ? '' : (CAT_EMOJI[r.category] || '🍽️')}
        ${sel ? `<span class="selbadge ${picked ? 'on' : ''}">${picked ? '✓' : ''}</span>` : ''}</div>
      <div class="name">${esc(r.name)}</div></div>`;
  }
  h += `</div>`;
  if (sel) { h += `<div style="height:130px"></div>` + selectBar(); }
  return h;
}

function selectBar() {
  const n = state.cart.length;
  let h = `<div class="selectbar">`;
  if (state.cartOpen && n) {
    h += `<div class="sel-list">` + state.cart.map(id => {
      const r = recipe(id);
      return `<div class="sel-item"><span>${esc(r ? r.name : id)}</span><button data-action="toggle-pick" data-id="${id}">✕</button></div>`;
    }).join('') + `</div>`;
  }
  const names = state.cart.map(id => { const r = recipe(id); return r ? r.name : ''; }).filter(Boolean).join('、');
  h += `<div class="selectbar-main">
    <button class="sel-count" data-action="toggle-cartopen">已选 ${n} 道 ${state.cartOpen ? '▾' : '▴'}
      ${!state.cartOpen && n ? `<span class="peek">${esc(names)}</span>` : ''}</button>
    <button class="btn primary sm" data-action="confirm-menu" ${n ? '' : 'disabled'}>确认成单 ›</button>
  </div></div>`;
  return h;
}

/* ---------- 菜谱详情 ---------- */
function usesChips(r) {
  const chip = (id, form) => { const it = ing(id); return `<span class="chip">${it && it.emoji ? it.emoji + ' ' : ''}${esc(it ? it.name : id)}${form ? ` <span class="form">${esc(form)}</span>` : ''}</span>`; };
  let h = '';
  if ((r.main || []).length) h += `<div class="sec-title">主料 / 要买</div><div>${r.main.map(u => chip(u.ing, u.form)).join('')}</div>`;
  if ((r.aromatics || []).length) h += `<div class="sec-title">香料配菜（形态）</div><div>${r.aromatics.map(u => chip(u.ing, u.form)).join('')}</div>`;
  if ((r.seasonings || []).length) h += `<div class="sec-title">常备调料</div><div>${r.seasonings.map(id => chip(id, '')).join('')}</div>`;
  return h;
}
function stepsHtml(r) {
  return (r.steps || []).map(g =>
    `<div class="steps-group"><h4>${esc(g.group)}</h4><ol>${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div>`).join('');
}
function viewRecipeDetail() {
  const r = recipe(state.recipeId);
  if (!r) { state.screen = 'recipes'; return viewRecipes(); }
  return `<div class="rowbar"><button class="back" data-action="back-recipe">‹ 返回</button>
      ${r.user ? `<button class="btn ghost sm danger" data-action="del-user-recipe" data-id="${r.id}">删除</button>` : ''}</div>
    <div class="rowbar"><h1 style="font-size:24px;margin:2px 0 12px;font-weight:800">${esc(r.name)}</h1>
      <span class="chip">${CAT_EMOJI[r.category] || ''} ${r.category}</span></div>
    <div class="hero dish" ${r.photo ? `data-img="${r.photo}"` : ''}>${r.photo ? '' : (CAT_EMOJI[r.category] || '🍽️')}
      <button class="cam" data-action="upload-recipe" data-id="${r.id}">📷 ${r.photo ? '换图' : '加成品图'}</button></div>
    ${usesChips(r)}
    <div class="sec-title">做法</div>
    ${stepsHtml(r)}`;
}

/* ---------- 菜单列表 ---------- */
function viewMenusList() {
  let h = `<div class="rowbar hd-row"><h1>菜单</h1>
    <button class="btn sm primary" data-action="go-select">🧺 去点菜</button></div>`;
  if (!DB.menus.length) {
    h += `<div class="empty"><div class="big">🍽️</div>还没有菜单。<br>去「菜谱」页点右上角「点菜」，照着图挑几道，就有第一桌啦。</div>`;
    return h;
  }
  const sorted = [...DB.menus].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const m of sorted) {
    h += `<div class="menu-card" data-action="open-menu" data-id="${m.id}">
      <div class="cov" ${m.cover ? `data-img="${m.cover}"` : ''}>${m.cover ? '' : '📷'}</div>
      <div><div class="mt">${esc(m.name || '未命名')}</div>
      <div class="ms">${esc(m.date || '')} · ${m.recipeIds.length} 道菜</div></div>
      <span class="chev">›</span></div>`;
  }
  return h;
}

/* ---------- 菜单详情：3 个操作 ---------- */
function viewMenuDetail() {
  const m = menu(state.menuId);
  if (!m) { state.screen = 'menus'; return viewMenusList(); }
  return `<button class="back" data-action="back-menus">‹ 菜单</button>
    <div class="rowbar"><h1 style="font-size:24px;margin:2px 0 2px;font-weight:800">${esc(m.name || '未命名')}</h1>
      <button class="btn ghost sm danger" data-action="delete-menu" data-id="${m.id}">删除</button></div>
    <div class="msub" style="margin-bottom:16px">${esc(m.date || '')} · ${m.recipeIds.length} 道菜</div>
    <div class="op-cards">
      <button class="op-card prep" data-action="menu-op" data-op="prep"><span class="oe">🧺</span>
        <span class="ob"><span class="ot">备菜</span><span class="od">买菜 & 备料一览，聚合形态、可勾</span></span><span class="chev">›</span></button>
      <button class="op-card cook" data-action="menu-op" data-op="cook"><span class="oe">🍳</span>
        <span class="ob"><span class="ot">烹制</span><span class="od">边做边看这一餐所有做法</span></span><span class="chev">›</span></button>
      <button class="op-card mem" data-action="menu-op" data-op="memory"><span class="oe">📷</span>
        <span class="ob"><span class="ot">留念</span><span class="od">合照 & 这一桌的菜，留个念想</span></span><span class="chev">›</span></button>
    </div>`;
}

/* ---------- 操作页 ---------- */
function viewMenuOp() {
  const m = menu(state.menuId);
  if (!m) { state.screen = 'menus'; return viewMenusList(); }
  const titles = { prep: '🧺 备菜', cook: '🍳 烹制', memory: '📷 留念' };
  let h = `<button class="back" data-action="back-menu-detail">‹ ${esc(m.name || '菜单')}</button>
    <h1 class="op-h1">${titles[state.menuOp]}</h1>`;
  if (state.menuOp === 'prep') h += menuPrep(m);
  else if (state.menuOp === 'cook') h += menuCook(m);
  else if (state.menuOp === 'memory') h += menuMemory(m);
  return h;
}

// 聚合备料
function aggregate(recipeIds) {
  const groups = {}; GROUP_ORDER.forEach(g => groups[g] = {});
  for (const rid of recipeIds) {
    const r = recipe(rid); if (!r) continue;
    const push = (id, form) => {
      const it = ing(id); const g = (it && it.group) || '常备调料';
      if (!groups[g]) groups[g] = {};
      if (!groups[g][id]) groups[g][id] = { id, entries: [] };
      groups[g][id].entries.push({ dish: r.name, form: form || '' });
    };
    (r.main || []).forEach(u => push(u.ing, u.form));
    (r.aromatics || []).forEach(u => push(u.ing, u.form));
    (r.seasonings || []).forEach(id => push(id, ''));
  }
  return groups;
}
function menuPrep(m) {
  const groups = aggregate(m.recipeIds);
  m.checked = m.checked || {};
  const rowsFor = g => Object.values(groups[g] || {}).map(item => {
    const it = ing(item.id);
    const uses = item.entries.map(e => e.form ? `<b>${esc(e.form)}</b>《${esc(e.dish)}》` : `《${esc(e.dish)}》`).join(' · ');
    const done = !!m.checked[item.id];
    return `<div class="prep-row ${done ? 'done' : ''}">
      <input type="checkbox" ${done ? 'checked' : ''} data-action="toggle-prep" data-ing="${item.id}">
      <div class="body"><div class="nm">${it && it.emoji ? it.emoji + ' ' : ''}${esc(it ? it.name : item.id)}</div>
      <div class="uses">${uses}</div></div></div>`;
  }).join('');
  let h = `<div class="prep-group"><div class="lbl">要买 / 要备（生鲜 + 香料）</div>`;
  h += (['生鲜主料', '香料配菜'].map(rowsFor).join('')) || `<div class="hint">这桌没有生鲜/香料。</div>`;
  h += `</div>`;
  const season = rowsFor('常备调料');
  if (season) h += `<details class="fold"><summary>常备调料（家里应该有，点开自查）</summary>${season}</details>`;
  return h;
}

/* 烹制：手风琴（展开后顶部一张柔化边缘的成品图） */
function menuCook(m) {
  const rs = m.recipeIds.map(recipe).filter(Boolean);
  if (!rs.length) return `<div class="hint">这桌还没有菜。</div>`;
  let h = '';
  for (const r of rs) {
    const open = !!state.openDishes[r.id];
    const head = r.photo ? `<span class="dish-thumb" data-img="${r.photo}"></span>` : `<span class="em">${CAT_EMOJI[r.category] || '🍽️'}</span>`;
    const banner = (open && r.photo) ? `<div class="cook-banner" data-img="${r.photo}"></div>` : '';
    h += `<div class="acc ${open ? 'open' : ''}">
      <div class="head" data-action="toggle-dish" data-id="${r.id}">${head}${esc(r.name)}<span class="arr">›</span></div>
      <div class="body">${banner}${stepsHtml(r)}</div></div>`;
  }
  h += `<div class="hint">点标题就地展开/收起，可同时展开多道对照着做。</div>`;
  return h;
}

/* 留念 */
function menuMemory(m) {
  let h = `<div class="hero" ${m.cover ? `data-img="${m.cover}"` : ''}>${m.cover ? '' : '📷 传一张合照'}
    <button class="cam" data-action="upload-menu" data-id="${m.id}">📷 ${m.cover ? '换合照' : '传合照'}</button></div>
    <div class="rowbar"><div><div class="mem-name">${esc(m.name || '未命名')}</div><div class="msub">${esc(m.date || '')}</div></div>
      <button class="btn sm" data-action="rename-menu" data-id="${m.id}">改名</button></div>
    <div class="sec-title">这一桌 · ${m.recipeIds.length} 道菜</div><div class="grid">`;
  h += m.recipeIds.map(id => {
    const r = recipe(id); if (!r) return '';
    return `<div class="card" data-action="open-recipe" data-id="${r.id}">
      <div class="thumb" ${r.photo ? `data-img="${r.photo}"` : ''}>${r.photo ? '' : (CAT_EMOJI[r.category] || '🍽️')}</div>
      <div class="name">${esc(r.name)}</div></div>`;
  }).join('');
  h += `</div>`;
  return h;
}

/* ---------- 更多 ---------- */
function viewMore() {
  return `<div class="hd"><h1>更多</h1></div>
    <button class="btn primary block" data-action="new-recipe" style="margin-bottom:16px">➕ 添加菜谱</button>
    <div class="sec-title" style="margin-top:0">显示</div>
    <div class="chips-row" style="position:static;padding-bottom:2px">
      <button class="fchip ${themePref() === 'light' ? 'on' : ''}" data-action="set-theme" data-theme="light">☀️ 明亮</button>
      <button class="fchip ${themePref() === 'dark' ? 'on' : ''}" data-action="set-theme" data-theme="dark">🌙 夜晚</button>
      <button class="fchip ${themePref() === 'auto' ? 'on' : ''}" data-action="set-theme" data-theme="auto">🔁 跟随系统</button>
    </div>
    <div class="hint" id="sync-status" style="margin:14px 0 4px">☁️ ${esc(syncStatusText())}</div>
    <details class="fold">
      <summary>同步设置</summary>
      <input id="sync-token-input" class="sync-input" type="text" autocomplete="off" placeholder="同步口令" value="${esc(syncToken())}">
      <button class="btn block secondary" data-action="save-token" style="margin-bottom:10px">🔗 连接 / 保存口令</button>
      <div class="rowbar" style="gap:10px;margin-bottom:10px">
        <button class="btn" style="flex:1" data-action="cloud-pull-now">⬇️ 从云拉取</button>
        <button class="btn" style="flex:1" data-action="cloud-push-now">⬆️ 上传到云</button>
      </div>
      <button class="btn block" data-action="lock-device" style="margin-bottom:12px">🔒 锁定本机</button>
    </details>
    <div class="hint" style="margin-top:16px">新熊记 v0.7 · 菜单与自建菜谱自动同步，图片留本机。</div>`;
}

/* ---------- 添加菜谱（本地解析：材料提炼 + 步骤排版） ---------- */
const FORMS = ['大段', '小段', '颗粒', '片', '末', '蓉', '粒', '段', '丝', '块', '圈', '泥', '花', '结', '碎'];
const ING_ALIAS = {
  garlic: ['大蒜', '蒜头', '蒜'], 'garlic-sprout': ['蒜苗', '大蒜叶'],
  scallion: ['小葱', '香葱', '葱白', '葱绿', '葱'], 'da-cong': ['大葱'],
  ginger: ['生姜', '老姜', '姜'], shallot: ['红葱头'], onion: ['洋葱'],
  butter: ['黄油'], sesame: ['芝麻'], 'coarse-salt': ['粗海盐', '粗盐'],
  'dried-chili': ['干辣椒'], 'birdseye-chili': ['小米椒', '小米辣'], 'pickled-chili': ['泡椒'],
  salt: ['食用盐', '盐巴', '海盐', '盐'], 'light-soy': ['生抽'], 'dark-soy': ['老抽'],
  sugar: ['白糖', '冰糖', '糖'], 'oyster-sauce': ['耗油', '蚝油'], starch: ['生粉', '淀粉'],
  pepper: ['白胡椒粉', '胡椒粉', '白胡椒', '胡椒'], 'black-pepper': ['黑胡椒'],
  'sesame-oil': ['芝麻油', '香油'], 'cooking-wine': ['料酒', '米酒', '黄酒'],
  vinegar: ['白醋', '米醋', '陈醋', '醋'], 'steamed-fish-soy': ['蒸鱼豉油'],
  lard: ['猪油'], oil: ['食用油'], 'bay-leaf': ['香叶'], 'sichuan-pepper': ['花椒'],
  'white-peppercorn': ['白胡椒粒'], 'garlic-oil': ['蒜头油'],
  crab: ['螃蟹', '蟹'], seafish: ['海鱼', '杂鱼'], shrimp: ['虾'], 'pork-belly': ['五花肉'],
  'rice-cake': ['年糕'], beef: ['牛肉'], 'beef-shank': ['牛腱子', '牛腱'], 'chicken-wing': ['鸡翅'],
  'pork-rib': ['排骨'], 'razor-clam': ['蛏子'], hairtail: ['带鱼'], abalone: ['鲍鱼'],
  'sea-snail': ['花螺'], 'fish-ball': ['鱼丸'], egg: ['鸡蛋'], yam: ['山药'], morel: ['羊肚菌'],
  asparagus: ['芦笋'], 'water-spinach': ['通菜', '空心菜'], 'choy-sum': ['菜心'], chives: ['韭菜'],
  spinach: ['菠菜'], celery: ['西芹', '芹菜'], 'dried-tofu': ['香干'], seaweed: ['紫菜'], zhacai: ['榨菜', '虾皮'],
};

// 备料库比对：最长别名优先、占位防串词（"白胡椒粒"不会再被记成"胡椒"）
function matchIngredients(raw) {
  const list = [];
  for (const it of DB.ingredients) {
    const aliases = new Set();
    String(it.name).split(/[／/（）()]/).forEach(a => { a = a.trim(); if (a) aliases.add(a); });
    (ING_ALIAS[it.id] || []).forEach(a => aliases.add(a));
    aliases.forEach(a => list.push({ a, id: it.id }));
  }
  list.sort((x, y) => y.a.length - x.a.length);
  const used = new Array(raw.length).fill(false);
  const hits = {};
  for (const { a, id } of list) {
    let idx = raw.indexOf(a);
    while (idx >= 0) {
      let free = true;
      for (let k = idx; k < idx + a.length; k++) if (used[k]) { free = false; break; }
      if (free) {
        for (let k = idx; k < idx + a.length; k++) used[k] = true;
        const rest = raw.slice(idx + a.length, idx + a.length + 2);
        let form = '';
        for (const f of FORMS) { if (rest.startsWith(f)) { form = f; break; } }
        if (!hits[id]) hits[id] = new Set();
        if (form) hits[id].add(form);
      }
      idx = raw.indexOf(a, idx + a.length);
    }
  }
  const out = { main: [], aromatics: [], seasonings: [] };
  for (const id in hits) {
    const it = ing(id); if (!it) continue;
    const form = [...hits[id]].join('/');
    if (it.group === '生鲜主料') out.main.push(form ? { ing: id, form } : { ing: id });
    else if (it.group === '香料配菜') out.aromatics.push(form ? { ing: id, form } : { ing: id });
    else out.seasonings.push({ ing: id });
  }
  return out;
}

// 步骤排版：短标题行（1、备菜 / 【备菜】）开新组，1）2）行做条目；没有组则归入「做法」
function parseStepsText(raw) {
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const groups = []; let cur = null;
  const header = l => {
    const m = l.match(/^(?:\d{1,2}|[一二三四五六七八九十])\s*[、.．]\s*(.{1,8})$/);
    if (m && !/[，。；,;（(]/.test(m[1])) return m[1].replace(/[：:]$/, '');
    const b = l.match(/^【(.{1,10})】$/);
    return b ? b[1] : null;
  };
  for (const l of lines) {
    const h = header(l);
    if (h !== null) { cur = { group: h, items: [] }; groups.push(cur); continue; }
    const item = l.replace(/^\d{1,2}\s*[）)]\s*/, '').replace(/^[-•·]\s*/, '').replace(/^\d{1,2}\s*[、.．]\s*/, '');
    if (!cur) { cur = { group: '做法', items: [] }; groups.push(cur); }
    if (item) cur.items.push(item);
  }
  return groups.filter(g => g.items.length);
}

function captureDraft() {
  const d = state.draft; if (!d) return;
  const n = document.getElementById('d-name'); if (n) d.name = n.value;
  const r = document.getElementById('d-raw'); if (r) d.raw = r.value;
}

function viewRecipeEdit() {
  const d = state.draft;
  let h = `<button class="back" data-action="back-more">‹ 更多</button>
    <h1 class="op-h1">➕ 添加菜谱</h1>
    <div class="form-label">菜名</div>
    <input id="d-name" class="sync-input" type="text" autocomplete="off" placeholder="如：清炒西兰花" value="${esc(d.name)}">
    <div class="form-label">分类</div>
    <div class="chips-row" style="position:static">${DB.categories.map(c =>
      `<button class="fchip ${c === d.category ? 'on' : ''}" data-action="draft-cat" data-cat="${c}">${c}</button>`).join('')}</div>
    <div class="form-label">成品图（可选）</div>
    <div class="photo-pick" data-action="draft-photo" ${d.photo ? `data-img="${d.photo}"` : ''}>${d.photo ? '' : '📷 点击选图'}</div>
    <div class="form-label">做法原文（按备忘录的写法直接粘）</div>
    <textarea id="d-raw" class="raw" placeholder="1、备菜
1）葱切大段，蒜切片
2）酱汁：半勺盐、1勺生抽…
2、炒制
1）热油下蒜片爆香
2）大火翻炒出锅">${esc(d.raw)}</textarea>
    <button class="btn block secondary" data-action="draft-parse" style="margin:12px 0 4px">🔍 解析并预览</button>`;
  if (d.parsed) {
    const chip = (u, g, i) => { const it = ing(u.ing); return `<span class="chip">${it && it.emoji ? it.emoji + ' ' : ''}${esc(it ? it.name : u.ing)}${u.form ? ` <span class="form">${esc(u.form)}</span>` : ''}<span class="x" data-action="draft-del-ing" data-g="${g}" data-i="${i}">✕</span></span>`; };
    const sec = (arr, g, label) => arr.length ? `<div class="form-label">${label}</div><div>${arr.map((u, i) => chip(u, g, i)).join('')}</div>` : '';
    h += `<div class="sec-title">识别出的材料（点 ✕ 去掉误识别）</div>
      ${sec(d.parsed.main, 'main', '主料 / 要买')}
      ${sec(d.parsed.aromatics, 'aromatics', '香料配菜（形态）')}
      ${sec(d.parsed.seasonings, 'seasonings', '常备调料')}
      ${(!d.parsed.main.length && !d.parsed.aromatics.length && !d.parsed.seasonings.length) ? '<div class="hint">没识别出材料——检查原文，或直接保存（材料以后可补）。</div>' : ''}
      <div class="sec-title">步骤排版预览</div>
      ${d.parsed.steps.length ? stepsHtml({ steps: d.parsed.steps }) : '<div class="hint">没解析出步骤，检查原文分行。</div>'}
      <button class="btn primary block" data-action="draft-save" style="margin:10px 0 24px">✅ 保存菜谱</button>`;
  }
  return h;
}

/* ---------------- events ---------------- */
function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action, id = btn.dataset.id;
  switch (a) {
    case 'go-tab': gotoTab(btn.dataset.tab); break;
    // 菜谱 tab
    case 'start-select': state.selecting = true; state.cart = []; state.cartOpen = false; render(); break;
    case 'stop-select': state.selecting = false; state.cart = []; state.cartOpen = false; render(); break;
    case 'go-select': case 'go-select-recipes': gotoTab('recipes'); state.selecting = true; state.cart = []; render(); break;
    case 'filter-cat': state.catFilter = btn.dataset.cat; render(); break;
    case 'toggle-pick': { const i = state.cart.indexOf(id); if (i >= 0) state.cart.splice(i, 1); else state.cart.push(id); render(); break; }
    case 'toggle-cartopen': state.cartOpen = !state.cartOpen; render(); break;
    case 'confirm-menu': confirmMenu(); break;
    // 菜谱详情
    case 'open-recipe': state._ret = { screen: state.screen, menuOp: state.menuOp }; state.recipeId = id; state.screen = 'recipe-detail'; window.scrollTo(0, 0); render(); break;
    case 'back-recipe': state.screen = (state._ret && state._ret.screen) || 'recipes'; if (state._ret) state.menuOp = state._ret.menuOp; state._ret = null; window.scrollTo(0, 0); render(); break;
    // 菜单
    case 'open-menu': state.menuId = id; state.screen = 'menu-detail'; window.scrollTo(0, 0); render(); break;
    case 'back-menus': state.screen = 'menus'; window.scrollTo(0, 0); render(); break;
    case 'menu-op': state.menuOp = btn.dataset.op; state.screen = 'menu-op'; window.scrollTo(0, 0); render(); break;
    case 'back-menu-detail': state.screen = 'menu-detail'; window.scrollTo(0, 0); render(); break;
    case 'delete-menu': if (confirm('删除这桌菜单？')) { DB.menus = DB.menus.filter(x => x.id !== id); mutate(); state.screen = 'menus'; render(); } break;
    case 'rename-menu': { const m = menu(id); const nn = prompt('改个名：', m.name || ''); if (nn !== null) { m.name = nn.trim(); mutate(); render(); } break; }
    // 烹制
    case 'cook-mode': state.cookMode = btn.dataset.mode; render(); break;
    case 'cook-tab': state.cookTab = +btn.dataset.i; render(); break;
    case 'toggle-dish': state.openDishes[id] = !state.openDishes[id]; render(); break;
    // 勾选
    case 'toggle-prep': { const m = menu(state.menuId); m.checked = m.checked || {}; m.checked[btn.dataset.ing] = !m.checked[btn.dataset.ing]; mutate(); render(); break; }
    case 'toggle-cook': { const m = menu(state.menuId); m.cookChecked = m.cookChecked || {}; const k = btn.dataset.key; m.cookChecked[k] = !m.cookChecked[k]; mutate(); render(); break; }
    // 图片
    case 'upload-recipe': pendingUpload = { type: 'recipe', id }; document.getElementById('filepick').click(); break;
    case 'upload-menu': pendingUpload = { type: 'menu', id }; document.getElementById('filepick').click(); break;
    // 添加菜谱
    case 'new-recipe': state.draft = { name: '', category: DB.categories[0], photo: null, raw: '', parsed: null }; state.screen = 'recipe-edit'; window.scrollTo(0, 0); render(); break;
    case 'back-more': state.screen = 'more'; window.scrollTo(0, 0); render(); break;
    case 'draft-cat': captureDraft(); state.draft.category = btn.dataset.cat; render(); break;
    case 'draft-photo': captureDraft(); pendingUpload = { type: 'draft' }; document.getElementById('filepick').click(); break;
    case 'draft-parse': captureDraft(); state.draft.parsed = { ...matchIngredients(state.draft.raw), steps: parseStepsText(state.draft.raw) }; render(); break;
    case 'draft-del-ing': captureDraft(); state.draft.parsed[btn.dataset.g].splice(+btn.dataset.i, 1); render(); break;
    case 'draft-save': {
      captureDraft();
      const d = state.draft;
      if (!d.name.trim()) { alert('先填菜名'); break; }
      if (!d.parsed || !d.parsed.steps.length) { alert('先点「解析并预览」'); break; }
      const r = { id: 'u' + Date.now(), name: d.name.trim(), category: d.category, photo: d.photo || null,
        main: d.parsed.main, aromatics: d.parsed.aromatics, seasonings: d.parsed.seasonings.map(s => s.ing),
        steps: d.parsed.steps, user: true };
      DB.userRecipes.push(r); rebuildRecipes(); mutate();
      state.draft = null; state.tab = 'recipes'; state.catFilter = '全部';
      state.recipeId = r.id; state.screen = 'recipe-detail'; state._ret = { screen: 'recipes' };
      window.scrollTo(0, 0); render(); break;
    }
    case 'del-user-recipe': if (confirm('删除这道自建菜谱？')) {
      DB.userRecipes = DB.userRecipes.filter(x => x.id !== id); rebuildRecipes();
      DB.menus.forEach(m => { m.recipeIds = m.recipeIds.filter(rid => rid !== id); });
      mutate(); state.screen = 'recipes'; render();
    } break;
    // 云同步
    case 'save-token': { const v = document.getElementById('sync-token-input').value.trim(); setSyncToken(v); cloudSync(); render(); break; }
    case 'cloud-pull-now': (async () => { const c = await cloudPull(); if (c && Array.isArray(c.menus)) { DB.menus = c.menus; if (Array.isArray(c.userRecipes)) { DB.userRecipes = c.userRecipes; rebuildRecipes(); } DB.updatedAt = c.updatedAt || Date.now(); save(); SYNC.status = 'pulled'; render(); } else { alert('拉取失败或云端为空（先确认已连接、已部署）'); } })(); break;
    case 'cloud-push-now': cloudPush(); break;
    case 'lock-device': if (confirm('锁定本机？会清除口令，下次打开需重新输入。')) { setUnlocked(false); setSyncToken(''); location.reload(); } break;
    case 'set-theme': setThemePref(btn.dataset.theme); render(); break;
    // 门禁
    case 'gate-enter': (async () => {
      const key = (document.getElementById('gate-input').value || '').trim();
      if (!key) { renderGate('请输入口令'); return; }
      const m = document.getElementById('gate-msg'); if (m) m.textContent = '验证中…';
      try {
        const r = await fetch(SYNC.endpoint, { headers: { 'x-sync-token': key }, cache: 'no-store' });
        if (r.status === 200) { setSyncToken(key); setUnlocked(true); render(); cloudSync(); }
        else if (r.status === 401) renderGate('口令不对，再试一次');
        else renderGate('后端异常（' + r.status + '），稍后再试');
      } catch (e) { renderGate('网络不通，检查连接'); }
    })(); break;
  }
}

function gotoTab(tab) {
  state.tab = tab;
  state.selecting = false; state.cartOpen = false;
  state.screen = tab === 'recipes' ? 'recipes' : tab === 'menus' ? 'menus' : 'more';
  window.scrollTo(0, 0);
  render();
}

function confirmMenu() {
  if (!state.cart.length) return;
  const name = prompt('给这桌起个名：', defaultMenuName());
  if (name === null) return; // 取消
  const m = { id: 'm' + Date.now(), name: name.trim() || defaultMenuName(), date: todayISO(), cover: null, recipeIds: [...state.cart], checked: {}, cookChecked: {} };
  DB.menus.push(m); mutate();
  state.selecting = false; state.cart = []; state.cartOpen = false;
  state.tab = 'menus'; state.menuId = m.id; state.screen = 'menu-detail';
  window.scrollTo(0, 0); render();
}

async function onFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file || !pendingUpload) return;
  const up = pendingUpload; pendingUpload = null;
  const k = up.type + '-' + (up.id || 'x') + '-' + Date.now();
  try {
    await idbPut(k, file);
    if (up.type === 'recipe') { const r = recipe(up.id); if (r) { r.photo = k; if (r.user) mutate(); else save(); } }
    if (up.type === 'menu') { const m = menu(up.id); if (m) { m.cover = k; mutate(); } }
    if (up.type === 'draft') { state.draft.photo = k; }
    render();
  } catch (err) { alert('图片保存失败：' + err.message); }
}

boot();
