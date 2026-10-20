import { allRecords, saveRecord, deleteRecord, clearRecords, importRecords } from './db.js';

/* ---------------- Constants ---------------- */

const TYPES = ['汤面', '拌面', '炒面', '米粉', '米线', '其他'];
const TYPE_EMOJI = {
  汤面: '🍜', 拌面: '🥢', 炒面: '🍝', 米粉: '🍲', 米线: '🍲', 其他: '🥣',
};
const RATING_LABELS = { 1: '踩雷', 2: '一般', 3: '还行', 4: '推荐', 5: '封神' };

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------- State ---------------- */

const state = {
  records: [],
  filter: '全部',
  query: '',
  view: 'list',
  editing: null,
  photo: null,
  geo: null,
  rating: 4,
  type: '汤面',
};

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  const now = new Date();
  if (Number(y) === now.getFullYear()) return `${Number(m)}月${Number(d)}日`;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function bowlsHtml(rating) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<svg class="${i <= rating ? 'on' : ''}"><use href="#i-bowl"/></svg>`;
  }
  return `<span class="bowls">${out}</span>`;
}

function toast(msg, ms = 1900) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------------- Data ---------------- */

async function loadRecords() {
  try {
    state.records = await allRecords();
  } catch (err) {
    console.error(err);
    state.records = [];
    toast('无法读取本地数据，请检查浏览器设置');
  }
}

function sortedRecords() {
  return state.records.slice().sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

function filteredRecords() {
  let list = sortedRecords();
  if (state.filter !== '全部') list = list.filter(r => r.type === state.filter);
  const q = state.query.trim().toLowerCase();
  if (q) {
    list = list.filter(r =>
      [r.shop, r.dish, r.city, r.notes, r.type].join(' ').toLowerCase().includes(q)
    );
  }
  return list;
}

/* ---------------- List view ---------------- */

function renderFilterChips() {
  const wrap = $('#type-filter');
  const all = ['全部', ...TYPES];
  wrap.innerHTML = all.map(t =>
    `<button class="chip ${t === state.filter ? 'active' : ''}" data-type="${t}">${t}</button>`
  ).join('');
}

function renderList() {
  const list = filteredRecords();
  const cards = $('#cards');
  const empty = $('#empty-list');

  empty.hidden = list.length > 0;
  if (!list.length && state.records.length) {
    empty.querySelector('h2').textContent = '没有找到这一碗';
    empty.querySelector('p').textContent = '换个关键词或类型试试。';
    $('#empty-add').hidden = true;
  } else {
    empty.querySelector('h2').textContent = '还没有第一碗';
    empty.querySelector('p').textContent = '吃过的好面，值得记下来。';
    $('#empty-add').hidden = false;
  }
  cards.innerHTML = list.map(cardHtml).join('');

  const total = filteredRecords().length;
  const shops = new Set(list.map(r => r.shop)).size;
  const spent = list.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const parts = [`${total} 碗`];
  if (shops && total) parts.push(`${shops} 家店`);
  if (spent) parts.push(`¥${spent}`);
  $('#list-summary').textContent = total ? parts.join(' · ') : '';

  cards.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      const rec = state.records.find(r => r.id === el.dataset.id);
      if (rec) openForm(rec);
    });
  });
}

function cardHtml(r) {
  const title = r.dish || r.type || '一碗面';
  const emoji = TYPE_EMOJI[r.type] || '🍜';
  const mediaStyle = r.photo ? ` style="background-image:url('${r.photo}')"` : '';
  const meta = [];
  if (r.type) meta.push(`<span class="type-tag">${escapeHtml(r.type)}</span>`);
  if (r.city) meta.push(`<span>${escapeHtml(r.city)}</span>`);
  meta.push(`<span>${formatDate(r.date)}</span>`);
  if (r.price != null && r.price !== '') meta.push(`<span class="sep">·</span><span>¥${escapeHtml(r.price)}</span>`);

  return `
    <article class="card" data-id="${escapeHtml(r.id)}">
      <div class="card-media${r.photo ? '' : ' no-photo'}"${mediaStyle}>${r.photo ? '' : emoji}</div>
      <div class="card-body">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            <div class="card-sub">@${escapeHtml(r.shop)}</div>
          </div>
          ${bowlsHtml(Number(r.rating) || 0)}
        </div>
        <div class="card-meta">${meta.join('')}</div>
        ${r.notes ? `<p class="card-note">${escapeHtml(r.notes)}</p>` : ''}
      </div>
    </article>`;
}

/* ---------------- Views ---------------- */

function showView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('#tabbar [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));

  if (name === 'map') {
    initMap();
    renderMap();
    setTimeout(() => map && map.invalidateSize(), 60);
  }
  if (name === 'stats') renderStats();
  if (name === 'list') renderList();
}

/* ---------------- Map ---------------- */

let map = null;
let markerLayer = null;

function initMap() {
  if (map || typeof L === 'undefined') return;
  map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([34.5, 104], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function renderMap() {
  if (!map) {
    $('#map-empty').hidden = false;
    return;
  }
  const located = state.records.filter(r =>
    r.lat != null && r.lng != null &&
    Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
  );
  $('#map-empty').hidden = located.length > 0;
  markerLayer.clearLayers();
  if (!located.length) return;

  const bounds = [];
  located.forEach(r => {
    const icon = L.divIcon({
      className: 'pin-wrap',
      html: '<div class="pin"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 20],
      popupAnchor: [0, -18],
    });
    const pop = `
      <div class="map-popup">
        <div class="p-title">${escapeHtml(r.dish || r.shop)}</div>
        <div class="p-meta">@${escapeHtml(r.shop)} · ${formatDate(r.date)}</div>
        ${r.notes ? `<div class="p-note">${escapeHtml(r.notes)}</div>` : ''}
      </div>`;
    L.marker([Number(r.lat), Number(r.lng)], { icon }).addTo(markerLayer).bindPopup(pop);
    bounds.push([Number(r.lat), Number(r.lng)]);
  });
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
}

/* ---------------- Stats ---------------- */

function renderStats() {
  const el = $('#stats');
  const records = state.records;
  if (!records.length) {
    el.innerHTML = `<div class="stats-empty">吃过一碗之后，这里就会有数字。</div>`;
    return;
  }

  const shops = new Set(records.map(r => r.shop)).size;
  const cities = new Set(records.map(r => r.city).filter(Boolean)).size;
  const spent = records.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const rated = records.filter(r => Number(r.rating) > 0);
  const avg = rated.length
    ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1)
    : '—';

  const typeCount = {};
  records.forEach(r => { if (r.type) typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
  const typeRows = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  const typeMax = Math.max(1, ...typeRows.map(t => t[1]));

  // Last 12 months, oldest first
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: `${d.getMonth() + 1}月`, count: 0 });
  }
  records.forEach(r => {
    const m = (r.date || '').slice(0, 7);
    const hit = months.find(x => x.key === m);
    if (hit) hit.count++;
  });
  const monthMax = Math.max(1, ...months.map(m => m.count));

  const shopCount = {};
  records.forEach(r => { shopCount[r.shop] = (shopCount[r.shop] || 0) + 1; });
  const topShops = Object.entries(shopCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topRated = records
    .filter(r => Number(r.rating) > 0)
    .slice()
    .sort((a, b) => Number(b.rating) - Number(a.rating) || (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><div class="k">碗数</div><div class="v">${records.length}<small>碗</small></div></div>
      <div class="stat-tile"><div class="k">去过的店</div><div class="v">${shops}<small>家</small></div></div>
      <div class="stat-tile"><div class="k">城市</div><div class="v">${cities}<small>座</small></div></div>
      <div class="stat-tile"><div class="k">面条花费</div><div class="v">¥${spent}</div></div>
    </div>

    <div class="panel">
      <h3>吃什么面最多</h3>
      <div class="bars">
        ${typeRows.map(([type, n]) => `
          <div class="bar-row">
            <span class="b-label">${escapeHtml(type)}</span>
            <span class="b-track"><span class="b-fill" style="width:${Math.round(n / typeMax * 100)}%"></span></span>
            <span class="b-val">${n}</span>
          </div>`).join('') || '<div class="stats-empty">还没填类型</div>'}
      </div>
    </div>

    <div class="panel">
      <h3>最近一年</h3>
      <div class="month-chart">
        ${months.map(m => `
          <div class="month-col" title="${m.key} · ${m.count} 碗">
            <div class="m-bar" style="height:${Math.max(3, Math.round(m.count / monthMax * 78))}px"></div>
            <span class="m-label">${m.label}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="panel">
      <h3>常去的店</h3>
      <div class="rank">
        ${topShops.map(([shop, n], i) => `
          <div class="rank-row">
            <span class="idx">${i + 1}</span>
            <span class="name">${escapeHtml(shop)}</span>
            <span class="count">${n} 碗</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="panel">
      <h3>最好吃的几碗 <span class="h3-note">平均 ${avg} 分</span></h3>
      <div class="rank">
        ${topRated.map(r => `
          <div class="rank-row">
            ${bowlsHtml(Number(r.rating))}
            <span class="name">${escapeHtml(r.dish || r.type)} <span class="count">@${escapeHtml(r.shop)}</span></span>
          </div>`).join('') || '<div class="stats-empty">还没有评分</div>'}
      </div>
    </div>
  `;
}

/* ---------------- Form ---------------- */

let formOpen = false;

function renderTypePicker() {
  $('#type-picker').innerHTML = TYPES.map(t =>
    `<button type="button" class="chip ${t === state.type ? 'active' : ''}" data-type="${t}">${t}</button>`
  ).join('');
}

function renderRatingPicker() {
  $('#rating-picker').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" data-rating="${n}" class="${n <= state.rating ? 'on' : ''}" aria-label="${RATING_LABELS[n]}">
       <svg><use href="#i-bowl"/></svg>
     </button>`
  ).join('');
  $('#rating-label').textContent = RATING_LABELS[state.rating] || '';
}

function renderPhoto() {
  const add = $('#photo-add');
  const prev = $('#photo-preview');
  if (state.photo) {
    add.hidden = true;
    prev.hidden = false;
    $('#photo-img').src = state.photo;
  } else {
    add.hidden = false;
    prev.hidden = true;
    $('#photo-img').removeAttribute('src');
  }
}

function renderGeoHint() {
  $('#geo-hint').hidden = !state.geo;
}

function renderGeoButton() {
  const btn = $('#btn-geo');
  btn.disabled = false;
  btn.innerHTML = state.geo
    ? '<svg><use href="#i-pin"/></svg>已定位'
    : '<svg><use href="#i-pin"/></svg>定位';
}

function openForm(record) {
  state.editing = record || null;
  state.photo = record?.photo || null;
  state.geo = (record && record.lat != null && record.lng != null)
    ? { lat: Number(record.lat), lng: Number(record.lng) }
    : null;
  state.rating = record ? (Number(record.rating) || 0) : 4;
  state.type = record?.type || '汤面';

  $('#form-title').textContent = record ? '编辑这碗' : '记一碗';
  $('#form-delete').hidden = !record;
  $('#f-id').value = record?.id || '';
  $('#f-shop').value = record?.shop || '';
  $('#f-dish').value = record?.dish || '';
  $('#f-price').value = record?.price != null ? record.price : '';
  $('#f-date').value = record?.date || todayStr();
  $('#f-city').value = record?.city || '';
  $('#f-notes').value = record?.notes || '';

  renderTypePicker();
  renderRatingPicker();
  renderPhoto();
  renderGeoHint();
  renderGeoButton();

  $('#form-sheet').hidden = false;
  $('#form-sheet .form-body').scrollTop = 0;
  formOpen = true;
  try { history.pushState({ form: true }, ''); } catch (_) { /* file:// */ }
}

function hideForm() {
  $('#form-sheet').hidden = true;
  formOpen = false;
  state.editing = null;
  $('#f-photo').value = '';
}

function closeForm() {
  if (history.state && history.state.form) history.back();
  else hideForm();
}

async function handleSave() {
  const shop = $('#f-shop').value.trim();
  if (!shop) {
    toast('店名是必填的');
    $('#f-shop').focus();
    return;
  }

  const priceRaw = $('#f-price').value.trim();
  const rec = {
    id: state.editing?.id || uuid(),
    shop,
    dish: $('#f-dish').value.trim(),
    type: state.type,
    rating: state.rating,
    price: priceRaw === '' ? null : Number(priceRaw),
    city: $('#f-city').value.trim(),
    lat: state.geo?.lat ?? null,
    lng: state.geo?.lng ?? null,
    date: $('#f-date').value || todayStr(),
    notes: $('#f-notes').value.trim(),
    photo: state.photo,
    createdAt: state.editing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const isEdit = !!state.editing;
  try {
    await saveRecord(rec);
    await loadRecords();
    renderList();
    closeForm();
    toast(isEdit ? '已更新' : '已记下这一碗');
  } catch (err) {
    console.error(err);
    toast('保存失败，存储空间可能已满');
  }
}

async function handleDelete() {
  const id = state.editing?.id;
  if (!id) return;
  if (!confirm('删除这碗面？')) return;
  try {
    await deleteRecord(id);
    await loadRecords();
    renderList();
    closeForm();
    toast('已删除');
  } catch (err) {
    console.error(err);
    toast('删除失败');
  }
}

/* ---------------- Photo ---------------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

async function compressPhoto(file, max = 1400, quality = 0.82) {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/* ---------------- Geo ---------------- */

function captureGeo() {
  const btn = $('#btn-geo');
  if (!navigator.geolocation) { toast('这个浏览器不支持定位'); return; }
  btn.disabled = true;
  btn.textContent = '定位中…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      state.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      renderGeoHint();
      renderGeoButton();
      toast('位置已记下');
    },
    err => {
      console.warn(err);
      renderGeoButton();
      toast('定位失败：请在 HTTPS 下使用并允许定位');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/* ---------------- Menu / backup ---------------- */

function openMenu() {
  $('#menu-sheet').hidden = false;
  $('#backdrop').hidden = false;
}
function closeMenu() {
  $('#menu-sheet').hidden = true;
  $('#backdrop').hidden = true;
}

async function exportBackup() {
  const data = {
    app: '面迹',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: state.records,
  };
  const text = JSON.stringify(data, null, 2);
  const filename = `面迹备份-${todayStr()}.json`;

  // iOS standalone has no reliable blob download — share the file instead.
  try {
    const file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '面迹备份' });
      closeMenu();
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn(err);
  }

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  closeMenu();
  toast('备份已导出');
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(list)) throw new Error('bad format');

    const clean = list
      .filter(r => r && typeof r === 'object' && r.shop)
      .map(r => ({
        id: r.id || uuid(),
        shop: String(r.shop),
        dish: String(r.dish || ''),
        type: TYPES.includes(r.type) ? r.type : '其他',
        rating: Math.min(5, Math.max(0, Number(r.rating) || 0)),
        price: r.price == null || r.price === '' ? null : Number(r.price),
        city: String(r.city || ''),
        lat: r.lat == null ? null : Number(r.lat),
        lng: r.lng == null ? null : Number(r.lng),
        date: r.date || todayStr(),
        notes: String(r.notes || ''),
        photo: r.photo || null,
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: r.updatedAt || new Date().toISOString(),
      }));

    const added = await importRecords(clean);
    await loadRecords();
    renderList();
    closeMenu();
    toast(`导入 ${added} 条记录`);
  } catch (err) {
    console.error(err);
    toast('导入失败：文件格式不对');
  }
}

async function clearAll() {
  if (!confirm('清空所有记录？此操作无法撤销，建议先导出备份。')) return;
  try {
    await clearRecords();
    await loadRecords();
    renderList();
    renderStats();
    closeMenu();
    toast('已清空');
  } catch (err) {
    console.error(err);
    toast('清空失败');
  }
}

/* ---------------- Events ---------------- */

function bindEvents() {
  // Tabs
  $$('#tabbar [data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Add
  $('#btn-add').addEventListener('click', () => openForm(null));
  $('#empty-add').addEventListener('click', () => openForm(null));

  // Search & filters
  $('#search').addEventListener('input', e => {
    state.query = e.target.value;
    renderList();
  });
  $('#type-filter').addEventListener('click', e => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    state.filter = chip.dataset.type;
    renderFilterChips();
    renderList();
  });

  // Form header
  $('#form-cancel').addEventListener('click', closeForm);
  $('#form-save').addEventListener('click', handleSave);
  $('#form-delete').addEventListener('click', handleDelete);

  // Type & rating pickers
  $('#type-picker').addEventListener('click', e => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    state.type = chip.dataset.type;
    renderTypePicker();
  });
  $('#rating-picker').addEventListener('click', e => {
    const btn = e.target.closest('[data-rating]');
    if (!btn) return;
    state.rating = Number(btn.dataset.rating);
    renderRatingPicker();
  });

  // Photo
  $('#photo-add').addEventListener('click', () => $('#f-photo').click());
  $('#f-photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      state.photo = await compressPhoto(file);
      renderPhoto();
    } catch (err) {
      console.error(err);
      toast('这张照片读不出来');
    }
    e.target.value = '';
  });
  $('#photo-remove').addEventListener('click', () => {
    state.photo = null;
    renderPhoto();
  });

  // Geo
  $('#btn-geo').addEventListener('click', captureGeo);

  // Menu
  $('#btn-menu').addEventListener('click', openMenu);
  $('#backdrop').addEventListener('click', closeMenu);
  $('#btn-export').addEventListener('click', exportBackup);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (file) await importBackup(file);
    e.target.value = '';
  });
  $('#btn-clear').addEventListener('click', clearAll);

  // Back button closes the form
  window.addEventListener('popstate', () => {
    if (formOpen) hideForm();
  });

  // Refresh map when records change while on map

  // Keyboard escape
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#menu-sheet').hidden) closeMenu();
      else if (formOpen) closeForm();
    }
  });
}

/* ---------------- Init ---------------- */

async function init() {
  renderFilterChips();
  renderTypePicker();
  renderRatingPicker();
  bindEvents();
  await loadRecords();
  renderList();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
