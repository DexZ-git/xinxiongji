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
// 用户改动走 mutate：打时间戳 + 存本地 + 防抖上云
function mutate() { DB.updatedAt = Date.now(); save(); schedulePush(); }

/* ---------------- cloud sync（jsonbin，经 CF Function /api/data 代理） ---------------- */
const SYNC = { endpoint: './api/data', tokenKey: 'xiongji_sync_token', status: 'idle', timer: null };
function syncToken() { try { return localStorage.getItem(SYNC.tokenKey) || ''; } catch (e) { return ''; } }
function setSyncToken(t) { try { localStorage.setItem(SYNC.tokenKey, t); } catch (e) {} }
function updateSyncUI() { const el = document.getElementById('sync-status'); if (el) el.textContent = syncStatusText(); }
function syncStatusText() {
  if (!syncToken()) return '未连接：粘贴同步口令并「连接」后，改动自动上传、打开自动拉取。';
  const map = { idle: '已连接 · 待同步', saving: '上传中…', ok: '已同步 ✓', error: '同步失败（检查口令/网络/是否已部署）', pulled: '已从云拉取 ✓' };
  return '状态：' + (map[SYNC.status] || SYNC.status);
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
      body: JSON.stringify({ menus: DB.menus, updatedAt: DB.updatedAt }) });
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
    DB.menus = cloud.menus; DB.updatedAt = cloudAt; save(); SYNC.status = 'pulled'; render();
  } else if (localAt > cloudAt) { await cloudPush(); }
  else { SYNC.status = 'ok'; updateSyncUI(); }
}

/* ---------------- 访问门禁（口令 = SYNC_TOKEN，服务端校验，前端不存明文） ---------------- */
const UNLOCK_KEY = 'xiongji_unlocked';
function unlocked() { try { return localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { return false; } }
function setUnlocked(v) { try { v ? localStorage.setItem(UNLOCK_KEY, '1') : localStorage.removeItem(UNLOCK_KEY); } catch (e) {} }
async function probeStatus() { try { const r = await fetch(SYNC.endpoint, { cache: 'no-store' }); return r.status; } catch (e) { return 0; } }
function renderGate(msg) {
  document.body.classList.add('gated');
  document.getElementById('app').innerHTML = `<div class="gate"><div class="gate-card">
    <div class="gate-emoji">🐻‍❄️🔒</div>
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
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}

  const [ingRes, recRes] = await Promise.all([
    fetch('./data/ingredients.json').then(r => r.json()),
    fetch('./data/recipes.json').then(r => r.json()),
  ]);

  const photoMap = {};
  if (saved && saved.recipes) saved.recipes.forEach(r => { if (r.photo) photoMap[r.id] = r.photo; });

  DB = {
    categories: ingRes.categories,
    purchaseGroups: ingRes.purchaseGroups,
    ingredients: ingRes.ingredients,
    recipes: recRes.recipes.map(r => ({ ...r, photo: photoMap[r.id] || r.photo || null })),
    menus: (saved && saved.menus) || [],
    updatedAt: (saved && saved.updatedAt) || 0,
  };
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

// data-img 可以是 IndexedDB key（用户上传）或内置图片路径（assets/dishes/...）
async function hydrateImages(root) {
  const els = root.querySelectorAll('[data-img]');
  for (const el of els) {
    const k = el.getAttribute('data-img');
    if (!k) continue;
    if (/[\/.]/.test(k) && (k.startsWith('assets/') || k.includes('.'))) {
      el.style.backgroundImage = `url("${k}")`; el.classList.add('has-img'); continue;
    }
    try { const b = await idbGet(k); if (b) { el.style.backgroundImage = `url(${URL.createObjectURL(b)})`; el.classList.add('has-img'); } } catch (e) {}
  }
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
      : `<button class="btn sm secondary" data-action="start-select">🧺 点菜</button>`}
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
  return `<button class="back" data-action="back-recipe">‹ 返回</button>
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
    <button class="btn sm secondary" data-action="go-select">🧺 去点菜</button></div>`;
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
    <div class="sec-title">云同步 / 口令</div>
    <div class="hint" id="sync-status">${esc(syncStatusText())}</div>
    <input id="sync-token-input" class="sync-input" type="text" autocomplete="off" placeholder="同步口令（Cloudflare 里设的 SYNC_TOKEN）" value="${esc(syncToken())}">
    <button class="btn block secondary" data-action="save-token" style="margin-bottom:10px">🔗 连接 / 保存口令</button>
    <div class="rowbar" style="gap:10px;margin-bottom:10px">
      <button class="btn" style="flex:1" data-action="cloud-pull-now">⬇️ 从云拉取</button>
      <button class="btn" style="flex:1" data-action="cloud-push-now">⬆️ 上传到云</button>
    </div>
    <button class="btn block" data-action="lock-device" style="margin-bottom:14px">🔒 锁定本机（清除口令，下次需重新输入）</button>
    <div class="hint">同步口令 = 进入 app 的口令（Cloudflare 里的 <b>SYNC_TOKEN</b>）。输对才进得来，同时开启同步。云同步只传「菜单」文本；成品图/合照留本机、不上云。改动自动上传、打开自动按时间戳拉取。</div>
    <div class="sec-title">本地备份文件（兜底，不依赖云）</div>
    <button class="btn block" data-action="export" style="margin-bottom:10px">⬇️ 导出菜单备份（.json）</button>
    <button class="btn block" data-action="import" style="margin-bottom:10px">⬆️ 导入菜单备份</button>
    <div class="hint">新熊记 · 本地优先 + 可选云备份 + 口令门禁。v0.5</div>`;
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
    // 备份
    case 'export': exportBackup(); break;
    case 'import': pendingUpload = { type: 'import' }; document.getElementById('filepick').click(); break;
    // 云同步
    case 'save-token': { const v = document.getElementById('sync-token-input').value.trim(); setSyncToken(v); cloudSync(); render(); break; }
    case 'cloud-pull-now': (async () => { const c = await cloudPull(); if (c && Array.isArray(c.menus)) { DB.menus = c.menus; DB.updatedAt = c.updatedAt || Date.now(); save(); SYNC.status = 'pulled'; render(); } else { alert('拉取失败或云端为空（先确认已连接、已部署）'); } })(); break;
    case 'cloud-push-now': cloudPush(); break;
    case 'lock-device': if (confirm('锁定本机？会清除口令，下次打开需重新输入。')) { setUnlocked(false); setSyncToken(''); location.reload(); } break;
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
  if (up.type === 'import') {
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.menus)) {
        const have = new Set(DB.menus.map(m => m.id));
        data.menus.forEach(m => { if (!have.has(m.id)) DB.menus.push(m); });
        mutate(); alert('已导入 ' + data.menus.length + ' 桌菜单'); render();
      } else alert('文件格式不对（缺 menus）');
    } catch (err) { alert('导入失败：' + err.message); }
    return;
  }
  const k = up.type + '-' + up.id + '-' + Date.now();
  try {
    await idbPut(k, file);
    if (up.type === 'recipe') { const r = recipe(up.id); if (r) r.photo = k; }
    if (up.type === 'menu') { const m = menu(up.id); if (m) m.cover = k; }
    mutate(); render();
  } catch (err) { alert('图片保存失败：' + err.message); }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ menus: DB.menus }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '新熊记_菜单备份_' + todayISO() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

boot();
