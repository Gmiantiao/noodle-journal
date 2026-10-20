import { allRecords, saveRecord, deleteRecord, clearRecords, importRecords } from './db.js';

/* ---------------- Constants ---------------- */

const DEFAULT_TYPES = ['汤面', '拌面', '炒面', '米粉', '米线', '其他'];
const TYPE_EMOJI = {
  汤面: '🍜', 拌面: '🥢', 炒面: '🍝', 米粉: '🍲', 米线: '🍲', 其他: '🥣',
};
const RATING_LABELS = { 1: '踩雷', 2: '一般', 3: '还行', 4: '推荐', 5: '封神' };
const TYPES_KEY = 'mianji:custom-types';
const MAX_TAGS = 8;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------- State ---------------- */

const state = {
  records: [],
  filter: { kind: 'all', value: '' },
  query: '',
  view: 'list',
  editing: null,
  photo: null,
  geo: null,
  rating: 4,
  type: '汤面',
  tags: [],
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

/* ---------------- Types & tags ---------------- */

function customTypes() {
  try {
    const list = JSON.parse(localStorage.getItem(TYPES_KEY) || '[]');
    return Array.isArray(list) ? list.filter(t => typeof t === 'string' && t) : [];
  } catch (_) {
    return [];
  }
}

function rememberType(name) {
  const list = customTypes();
  if (!list.includes(name)) {
    list.push(name);
    localStorage.setItem(TYPES_KEY, JSON.stringify(list));
  }
}

function allTypes() {
  const seen = new Set(DEFAULT_TYPES);
  customTypes().forEach(t => seen.add(t));
  state.records.forEach(r => { if (r.type) seen.add(r.type); });
  // Defaults first, then everything else in insertion order.
  return Array.from(seen);
}

function allTags() {
  const counts = {};
  state.records.forEach(r => (r.tags || []).forEach(t => {
    counts[t] = (counts[t] || 0) + 1;
  }));
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function cleanTag(name) {
  return String(name || '').trim().replace(/^#+/, '').trim().slice(0, 16);
}

/* ---------------- Data ---------------- */

async function loadRecords() {
  try {
    const rows = await allRecords();
    // Migration: records created before tags existed have no tags array.
    state.records = rows.map(r => ({
      ...r,
      tags: Array.isArray(r.tags) ? r.tags.filter(Boolean) : [],
    }));
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
  if (state.filter.kind === 'type') list = list.filter(r => r.type === state.filter.value);
  if (state.filter.kind === 'tag') list = list.filter(r => (r.tags || []).includes(state.filter.value));
  const q = state.query.trim().toLowerCase();
  if (q) {
    list = list.filter(r =>
      [r.shop, r.dish, r.city, r.notes, r.type, ...(r.tags || [])].join(' ').toLowerCase().includes(q)
    );
  }
  return list;
}

/* ---------------- List view ---------------- */

function renderFilterChips() {
  const wrap = $('#type-filter');
  const chips = [
    `<button class="filter-tab ${state.filter.kind === 'all' ? 'active' : ''}" data-kind="all" data-value="">全部</button>`,
  ];
  allTypes().forEach(t => {
    const on = state.filter.kind === 'type' && state.filter.value === t;
    chips.push(`<button class="filter-tab ${on ? 'active' : ''}" data-kind="type" data-value="${escapeHtml(t)}">${escapeHtml(t)}</button>`);
  });
  const shownTags = allTags().slice(0, 8);
  // Keep an active tag visible even if it fell out of the top list.
  if (state.filter.kind === 'tag' && !shownTags.some(t => t.name === state.filter.value)) {
    shownTags.push({ name: state.filter.value, count: 0 });
  }
  shownTags.forEach(({ name }) => {
    const on = state.filter.kind === 'tag' && state.filter.value === name;
    chips.push(`<button class="filter-tab ${on ? 'active' : ''}" data-kind="tag" data-value="${escapeHtml(name)}">#${escapeHtml(name)}</button>`);
  });
  wrap.innerHTML = chips.join('');
}

const CN_DIGITS = '〇一二三四五六七八九';
const CN_MONTHS = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

function cnYear(year) {
  return String(year).split('').map(d => CN_DIGITS[Number(d)] ?? d).join('') + '年';
}

function cnMonth(month) {
  return CN_MONTHS[Number(month)] || `${Number(month)}月`;
}

function entryDate(dateStr) {
  if (!dateStr) return { md: '——', wd: '' };
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()] || '';
  return { md: `${m}.${d}`, wd };
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

  if (!list.length) {
    cards.innerHTML = '';
    $('#list-summary').textContent = '';
    return;
  }

  const groups = new Map();
  list.forEach(r => {
    const key = (r.date || '').slice(0, 7) || '0000-00';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  cards.innerHTML = Array.from(groups.entries()).map(([key, rows]) => {
    const [y, m] = key.split('-');
    const title = key === '0000-00'
      ? '未记日期'
      : `${cnYear(y)} <span>${cnMonth(m)}</span>`;
    return `
      <section class="month">
        <h2 class="month-title">${title}</h2>
        <div class="entries">${rows.map(entryHtml).join('')}</div>
      </section>`;
  }).join('');

  const shops = new Set(list.map(r => r.shop)).size;
  const spent = list.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const parts = [`共 ${list.length} 碗`];
  if (shops) parts.push(`${shops} 家店`);
  if (spent) parts.push(`¥${spent}`);
  $('#list-summary').textContent = parts.join(' · ');

  cards.querySelectorAll('.entry').forEach(el => {
    el.addEventListener('click', e => {
      const rec = state.records.find(r => r.id === el.dataset.id);
      if (!rec) return;
      if (e.target.closest('[data-share]')) {
        openBowlCard(rec);
        return;
      }
      openForm(rec);
    });
  });

  requestAnimationFrame(drawNoodleStrand);
}

function entryHtml(r) {
  const title = r.dish || r.type || '一碗面';
  const { md, wd } = entryDate(r.date);
  const meta = [`<span>@${escapeHtml(r.shop)}</span>`];
  if (r.city) meta.push(`<span>${escapeHtml(r.city)}</span>`);
  if (r.price != null && r.price !== '') meta.push(`<span>¥${escapeHtml(r.price)}</span>`);

  const tagLine = (r.tags || []).slice(0, 5).map(t => `#${escapeHtml(t)}`).join('  ');
  const thumb = r.photo ? `<img class="entry-thumb" src="${r.photo}" alt="" loading="lazy">` : '';

  return `
    <article class="entry" data-id="${escapeHtml(r.id)}">
      <div class="entry-body">
        <div class="entry-top">
          <span class="entry-date">${md}${wd ? `<span class="wd">${wd}</span>` : ''}</span>
          <span class="entry-top-right">
            ${bowlsHtml(Number(r.rating) || 0)}
            <button class="entry-share" data-share="${escapeHtml(r.id)}" aria-label="分享这碗">
              <svg><use href="#i-share"/></svg>
            </button>
          </span>
        </div>
        <div class="entry-head">
          <h3 class="entry-title">${escapeHtml(title)}</h3>
        </div>
        <div class="entry-meta">${meta.join('<span class="dot">·</span>')}</div>
        ${tagLine ? `<div class="entry-tags">${tagLine}</div>` : ''}
        ${r.notes ? `<p class="entry-note">${escapeHtml(r.notes)}</p>` : ''}
      </div>
      ${thumb}
    </article>`;
}

/* ---------------- Noodle strand ---------------- */

function drawNoodleStrand() {
  const cards = $('#cards');
  if (!cards) return;
  cards.querySelectorAll('.noodle-strand').forEach(el => el.remove());

  const entries = Array.from(cards.querySelectorAll('.entry'));
  const months = Array.from(cards.querySelectorAll('.month-title'));
  if (!entries.length) return;

  const cardsRect = cards.getBoundingClientRect();
  if (cardsRect.height < 10) return;

  const nodes = [];
  entries.forEach(el => {
    const r = el.getBoundingClientRect();
    nodes.push({
      y: r.top - cardsRect.top + 26,
      kind: el.querySelector('.entry-thumb') ? 'drop' : 'ring',
    });
  });
  months.forEach(el => {
    const r = el.getBoundingClientRect();
    nodes.push({ y: r.top - cardsRect.top + 18, kind: 'month' });
  });
  nodes.sort((a, b) => a.y - b.y);

  const height = Math.max(120, Math.max(...nodes.map(n => n.y)) + 64);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'noodle-strand');
  svg.setAttribute('width', '60');
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 60 ${height}`);
  svg.setAttribute('aria-hidden', 'true');

  const X = 26;
  const xAt = y => X
    + 5.5 * Math.sin(y / 118 * Math.PI * 2 + 0.8)
    + 2.2 * Math.sin(y / 47 * Math.PI * 2 + 2.1);

  let d = '';
  for (let y = 0; y <= height; y += 5) {
    d += `${y === 0 ? 'M' : 'L'}${xAt(y).toFixed(2)} ${y} `;
  }
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d.trim());
  path.setAttribute('class', 'strand');
  svg.appendChild(path);

  nodes.forEach(node => {
    const x = xAt(node.y);

    const link = document.createElementNS(NS, 'path');
    link.setAttribute('d',
      `M ${x.toFixed(2)} ${node.y} C ${(x + 10).toFixed(2)} ${node.y - 3}, 46 ${node.y + 3}, 58 ${node.y}`);
    link.setAttribute('class', node.kind === 'month' ? 'strand-link month' : 'strand-link');
    svg.appendChild(link);

    if (node.kind === 'month') {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(x - 3.5));
      rect.setAttribute('y', String(node.y - 3.5));
      rect.setAttribute('width', '7');
      rect.setAttribute('height', '7');
      rect.setAttribute('class', 'strand-month');
      svg.appendChild(rect);
    } else {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', String(node.y));
      dot.setAttribute('r', '3.2');
      dot.setAttribute('class', node.kind === 'drop' ? 'strand-drop' : 'strand-ring');
      svg.appendChild(dot);
    }
  });

  cards.prepend(svg);
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
  const located = state.records.filter(r =>
    r.lat != null && r.lng != null &&
    Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
  );

  if (!map) {
    const empty = $('#map-empty');
    empty.hidden = false;
    if (located.length) {
      empty.querySelector('h2').textContent = '地图需要联网';
      empty.querySelector('p').textContent = '记录和坐标都在，联网后就能看到。';
    } else {
      empty.querySelector('h2').textContent = '还没有带位置的面';
      empty.querySelector('p').textContent = '记录时点「用当前位置」，就能在地图上点亮它。';
    }
    return;
  }

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

  const tagCount = {};
  records.forEach(r => (r.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const tagRows = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tagMax = Math.max(1, ...tagRows.map(t => t[1]));

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

    <button class="poster-btn" id="btn-poster">生成 ${posterYear()} 年度海报</button>

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

    ${tagRows.length ? `
    <div class="panel">
      <h3>常用标签</h3>
      <div class="bars">
        ${tagRows.map(([tag, n]) => `
          <div class="bar-row">
            <span class="b-label">#${escapeHtml(tag)}</span>
            <span class="b-track"><span class="b-fill" style="width:${Math.round(n / tagMax * 100)}%"></span></span>
            <span class="b-val">${n}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

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
  const chips = allTypes().map(t =>
    `<button type="button" class="chip ${t === state.type ? 'active' : ''}" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  );
  chips.push('<button type="button" class="chip add" data-add-type="1">＋ 自定义</button>');
  $('#type-picker').innerHTML = chips.join('');
}

function renderTags() {
  $('#tag-selected').innerHTML = state.tags.map(t =>
    `<span class="tag-pill">#${escapeHtml(t)}<button type="button" data-remove-tag="${escapeHtml(t)}" aria-label="移除 ${escapeHtml(t)}">×</button></span>`
  ).join('');

  const suggestions = allTags()
    .filter(t => !state.tags.includes(t.name))
    .slice(0, 12);
  $('#tag-suggest').innerHTML = suggestions.map(t =>
    `<button type="button" class="chip" data-suggest-tag="${escapeHtml(t.name)}">#${escapeHtml(t.name)}</button>`
  ).join('');
}

function addTag(name) {
  const tag = cleanTag(name);
  if (!tag) return;
  if (state.tags.includes(tag)) { toast('这个标签已经有了'); return; }
  if (state.tags.length >= MAX_TAGS) { toast(`最多 ${MAX_TAGS} 个标签`); return; }
  state.tags.push(tag);
  renderTags();
}

function addCustomType() {
  const input = $('#f-custom-type');
  const name = cleanTag(input.value);
  if (!name) { input.focus(); return; }
  rememberType(name);
  state.type = name;
  input.value = '';
  $('#custom-type-row').hidden = true;
  renderTypePicker();
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
  state.tags = Array.isArray(record?.tags) ? [...record.tags] : [];

  $('#form-title').textContent = record ? '编辑这碗' : '记一碗';
  $('#form-delete').hidden = !record;
  $('#f-id').value = record?.id || '';
  $('#f-shop').value = record?.shop || '';
  $('#f-dish').value = record?.dish || '';
  $('#f-price').value = record?.price != null ? record.price : '';
  $('#f-date').value = record?.date || todayStr();
  $('#f-city').value = record?.city || '';
  $('#f-notes').value = record?.notes || '';

  $('#custom-type-row').hidden = true;
  $('#f-custom-type').value = '';
  $('#f-tag-input').value = '';
  renderTypePicker();
  renderTags();
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
    tags: state.tags.slice(),
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
    renderFilterChips();
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

/* ---------------- Custom location ---------------- */

let locMap = null;
let locMarker = null;
let locCoords = null;

function locPinIcon() {
  return L.divIcon({
    className: 'pin-wrap',
    html: '<div class="pin"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 20],
  });
}

function initLocMap() {
  locMap = L.map('loc-map', { zoomControl: true }).setView([34.5, 104], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(locMap);
  locMap.on('click', e => placeLocMarker(e.latlng.lat, e.latlng.lng));
}

function syncLocFields() {
  if (!locCoords) return;
  $('#loc-lat').value = Number(locCoords.lat).toFixed(6);
  $('#loc-lng').value = Number(locCoords.lng).toFixed(6);
}

function updateLocReadout() {
  $('#loc-readout').textContent = locCoords
    ? `已选 ${Number(locCoords.lat).toFixed(6)}, ${Number(locCoords.lng).toFixed(6)}`
    : '点地图选一个点，或直接填经纬度';
}

function placeLocMarker(lat, lng, syncFields = true) {
  locCoords = { lat, lng };
  if (!locMarker) {
    locMarker = L.marker([lat, lng], { draggable: true, icon: locPinIcon() }).addTo(locMap);
    locMarker.on('dragend', () => {
      const p = locMarker.getLatLng();
      locCoords = { lat: p.lat, lng: p.lng };
      syncLocFields();
      updateLocReadout();
    });
  } else {
    locMarker.setLatLng([lat, lng]);
  }
  if (syncFields) syncLocFields();
  updateLocReadout();
}

function readLocInputs() {
  const lat = Number($('#loc-lat').value);
  const lng = Number($('#loc-lng').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      $('#loc-lat').value === '' || $('#loc-lng').value === '') {
    locCoords = null;
    updateLocReadout();
    return;
  }
  locCoords = { lat, lng };
  if (locMap) {
    if (locMarker) locMarker.setLatLng([lat, lng]);
    else placeLocMarker(lat, lng, false);
    locMap.setView([lat, lng], Math.max(locMap.getZoom(), 8));
  }
  updateLocReadout();
}

function openLocPicker() {
  $('#loc-sheet').hidden = false;
  locCoords = state.geo ? { lat: Number(state.geo.lat), lng: Number(state.geo.lng) } : null;
  $('#loc-lat').value = locCoords ? Number(locCoords.lat).toFixed(6) : '';
  $('#loc-lng').value = locCoords ? Number(locCoords.lng).toFixed(6) : '';
  updateLocReadout();

  if (typeof L === 'undefined') {
    $('#loc-map').hidden = true;
    $('#loc-map-hint').hidden = false;
    return;
  }

  $('#loc-map').hidden = false;
  $('#loc-map-hint').hidden = true;
  if (!locMap) initLocMap();

  setTimeout(() => {
    locMap.invalidateSize();
    if (locCoords) {
      locMap.setView([locCoords.lat, locCoords.lng], 13);
      placeLocMarker(locCoords.lat, locCoords.lng);
    } else {
      locMap.setView([34.5, 104], 4);
      if (locMarker) { locMap.removeLayer(locMarker); locMarker = null; }
    }
  }, 80);
}

function closeLocPicker() {
  $('#loc-sheet').hidden = true;
  locCoords = null;
}

function confirmLoc() {
  if (!locCoords) { toast('先在地图上点一个位置'); return; }
  state.geo = { ...locCoords };
  renderGeoHint();
  renderGeoButton();
  $('#loc-sheet').hidden = true;
  toast('位置已记下');
}

/* ---------------- Annual poster ---------------- */

let posterCanvas = null;
let posterFileName = '';

function posterYear() {
  const years = state.records
    .map(r => (r.date || '').slice(0, 4))
    .filter(y => /^\d{4}$/.test(y));
  if (!years.length) return String(new Date().getFullYear());
  years.sort();
  return years[years.length - 1];
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = String(text);
  while (t.length && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function drawPoster(year, recs) {
  const W = 1080, H = 1440, M = 84;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sans = (size, weight = '400') =>
    `${weight} ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
  const serif = (size, weight = '400') =>
    `${weight} ${size}px "Songti SC","STSong","Noto Serif SC",serif`;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f7f1e6');
  bg.addColorStop(1, '#ece2d3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // watermark
  ctx.fillStyle = 'rgba(178,58,43,.05)';
  ctx.font = serif(380, '700');
  ctx.textAlign = 'right';
  ctx.fillText('面', W - 40, 420);
  ctx.textAlign = 'left';

  // header
  ctx.fillStyle = '#b23a2b';
  ctx.font = sans(26, '600');
  ctx.fillText('面迹 · NOODLE JOURNAL', M, 104);

  ctx.fillStyle = '#26221d';
  ctx.font = serif(150, '700');
  ctx.fillText(year, M - 4, 268);

  ctx.fillStyle = '#6b6257';
  ctx.font = serif(44);
  ctx.fillText('我的吃面年报', M, 332);

  ctx.fillStyle = '#b23a2b';
  ctx.fillRect(M, 366, 120, 6);

  // headline stats
  const shops = new Set(recs.map(r => r.shop)).size;
  const cities = new Set(recs.map(r => r.city).filter(Boolean)).size;
  const spent = recs.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const stats = [
    ['吃过的面', `${recs.length}`, '碗'],
    ['去过的店', `${shops}`, '家'],
    ['走过的城市', `${cities}`, '座'],
    ['面条花费', `¥${spent}`, ''],
  ];
  const colW = (W - 2 * M) / 4;
  stats.forEach(([label, value, unit], i) => {
    const x = M + i * colW;
    ctx.fillStyle = '#26221d';
    ctx.font = serif(58, '700');
    ctx.fillText(value, x, 488);
    const vw = ctx.measureText(value).width;
    if (unit) {
      ctx.fillStyle = '#9a9083';
      ctx.font = sans(24);
      ctx.fillText(unit, x + vw + 6, 488);
    }
    ctx.fillStyle = '#9a9083';
    ctx.font = sans(23);
    ctx.fillText(label, x, 528);
  });

  // section helper
  const section = (title, y) => {
    ctx.fillStyle = '#b23a2b';
    ctx.font = serif(25, '600');
    ctx.fillText(title, M, y);
    ctx.strokeStyle = '#d8cec0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y + 24);
    ctx.lineTo(W - M, y + 24);
    ctx.stroke();
  };

  // top shops
  const shopCount = {};
  recs.forEach(r => { shopCount[r.shop] = (shopCount[r.shop] || 0) + 1; });
  const topShops = Object.entries(shopCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  section('最常去的店', 612);
  topShops.forEach(([shop, n], i) => {
    const y = 676 + i * 54;
    ctx.fillStyle = '#b8ada2';
    ctx.font = serif(23, '600');
    ctx.fillText(String(i + 1).padStart(2, '0'), M, y);
    ctx.fillStyle = '#26221d';
    ctx.font = serif(32, '600');
    ctx.fillText(fitText(ctx, shop, 600), M + 56, y);
    ctx.fillStyle = '#9a9083';
    ctx.font = sans(23);
    ctx.textAlign = 'right';
    ctx.fillText(`${n} 碗`, W - M, y);
    ctx.textAlign = 'left';
  });

  // top types
  const typeCount = {};
  recs.forEach(r => { typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
  const topTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  section('最爱的面型', 874);
  topTypes.forEach(([type, n], i) => {
    const y = 936 + i * 50;
    ctx.fillStyle = '#26221d';
    ctx.font = serif(30, '600');
    ctx.fillText(fitText(ctx, type, 620), M, y);
    ctx.fillStyle = '#9a9083';
    ctx.font = sans(23);
    ctx.textAlign = 'right';
    ctx.fillText(`${n} 碗`, W - M, y);
    ctx.textAlign = 'left';
  });

  // top tags
  const tagCount = {};
  recs.forEach(r => (r.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => `#${t}`);

  section('常用标签', 1104);
  ctx.fillStyle = '#6b6257';
  ctx.font = sans(27);
  ctx.fillText(fitText(ctx, topTags.join('   ') || '还没有标签', W - 2 * M), M, 1152);

  // best bowl
  const best = recs
    .filter(r => Number(r.rating) > 0)
    .slice()
    .sort((a, b) => Number(b.rating) - Number(a.rating) || (b.date || '').localeCompare(a.date || ''))[0];

  section('年度最佳一碗', 1216);
  if (best) {
    ctx.fillStyle = '#26221d';
    ctx.font = serif(40, '700');
    ctx.fillText(fitText(ctx, best.dish || best.type, 700), M, 1286);
    ctx.fillStyle = '#6b6257';
    ctx.font = sans(25);
    ctx.fillText(fitText(ctx, `@${best.shop} · 评分 ${best.rating}/5`, 700), M, 1326);
  } else {
    ctx.fillStyle = '#9a9083';
    ctx.font = sans(26);
    ctx.fillText('还没有评分', M, 1286);
  }

  // footer
  ctx.fillStyle = '#b23a2b';
  ctx.fillRect(M, 1372, 52, 3);
  ctx.fillStyle = '#9a9083';
  ctx.font = sans(23);
  ctx.fillText('一碗好面，一段路。', M, 1412);
  ctx.textAlign = 'right';
  ctx.fillText('面迹 · 一碗面的手帐', W - M, 1412);
  ctx.textAlign = 'left';

  return canvas;
}

/* ---------------- Single bowl card ---------------- */

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  const chars = Array.from(String(text || ''));
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = chars[i];
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawBowlCard(rec) {
  const W = 1080, H = 1440, M = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sans = (size, weight = '400') =>
    `${weight} ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
  const serif = (size, weight = '400') =>
    `${weight} ${size}px "Songti SC","STSong","Noto Serif SC",serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f7f1e6');
  bg.addColorStop(1, '#ece2d3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  let img = null;
  if (rec.photo) {
    try { img = await loadImageFromSrc(rec.photo); } catch (_) { img = null; }
  }

  const pad = M;
  const photoW = W - 2 * M;
  const photoH = img ? 600 : 440;

  if (img) {
    drawCover(ctx, img, pad, pad, photoW, photoH, 28);
  } else {
    ctx.save();
    roundRectPath(ctx, pad, pad, photoW, photoH, 28);
    ctx.clip();
    const g = ctx.createLinearGradient(pad, pad, pad + photoW, pad + photoH);
    g.addColorStop(0, '#f2e4d8');
    g.addColorStop(1, '#e7cdb8');
    ctx.fillStyle = g;
    ctx.fillRect(pad, pad, photoW, photoH);
    ctx.font = sans(130);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TYPE_EMOJI[rec.type] || '🍜', W / 2, pad + photoH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    // faint watermark fills the lower empty space
    ctx.fillStyle = 'rgba(178,58,43,.045)';
    ctx.font = serif(360, '700');
    ctx.textAlign = 'right';
    ctx.fillText('面', W - 36, H - 110);
    ctx.textAlign = 'left';
  }

  const y0 = pad + photoH;

  // date · type
  ctx.fillStyle = '#9a9083';
  ctx.font = sans(25);
  const dateText = (rec.date || '').replace(/-/g, '.');
  ctx.fillText([dateText, rec.type].filter(Boolean).join('  ·  '), M, y0 + 56);

  // dish
  ctx.fillStyle = '#26221d';
  ctx.font = serif(64, '700');
  ctx.fillText(fitText(ctx, rec.dish || rec.type || '一碗面', W - 2 * M), M, y0 + 136);

  // shop
  ctx.fillStyle = '#b23a2b';
  ctx.font = serif(32, '600');
  ctx.fillText(fitText(ctx, `@${rec.shop}`, W - 2 * M), M, y0 + 192);

  // rating bowls
  const rating = Number(rec.rating) || 0;
  const ry = y0 + 250;
  for (let i = 0; i < 5; i++) {
    const x = M + i * 44;
    ctx.beginPath();
    ctx.arc(x + 14, ry, 14, 0, Math.PI, false);
    ctx.fillStyle = i < rating ? '#b23a2b' : '#ddd3c5';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + 28, ry);
    ctx.strokeStyle = i < rating ? '#b23a2b' : '#ddd3c5';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = '#9a9083';
  ctx.font = sans(24);
  ctx.fillText(rating ? `${rating}/5` : '未评分', M + 5 * 44 + 12, ry + 2);

  // tags
  const tags = (rec.tags || []).map(t => `#${t}`).join('   ');
  if (tags) {
    ctx.fillStyle = '#6b6257';
    ctx.font = sans(27);
    ctx.fillText(fitText(ctx, tags, W - 2 * M), M, y0 + 314);
  }

  // divider
  const divY = y0 + (tags ? 356 : 300);
  ctx.strokeStyle = '#d8cec0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, divY);
  ctx.lineTo(W - M, divY);
  ctx.stroke();

  // notes
  if (rec.notes) {
    ctx.fillStyle = '#3f382f';
    ctx.font = sans(31);
    const lines = wrapText(ctx, rec.notes, W - 2 * M, img ? 4 : 5);
    lines.forEach((line, i) => ctx.fillText(line, M, divY + 62 + i * 50));
  }

  // price / place
  const metaY = 1300;
  if (rec.price != null && rec.price !== '') {
    ctx.fillStyle = '#26221d';
    ctx.font = serif(32, '700');
    ctx.fillText(`¥${rec.price}`, M, metaY);
  }
  const place = [rec.city, (rec.lat != null && rec.lng != null) ? '已定位' : ''].filter(Boolean).join(' · ');
  if (place) {
    ctx.fillStyle = '#9a9083';
    ctx.font = sans(25);
    ctx.textAlign = 'right';
    ctx.fillText(place, W - M, metaY);
    ctx.textAlign = 'left';
  }

  // footer
  ctx.fillStyle = '#b23a2b';
  ctx.fillRect(M, 1372, 52, 3);
  ctx.fillStyle = '#9a9083';
  ctx.font = sans(23);
  ctx.fillText('一碗好面，一段路。', M, 1412);
  ctx.textAlign = 'right';
  ctx.fillText('面迹 · 一碗面的手帐', W - M, 1412);
  ctx.textAlign = 'left';

  return canvas;
}

async function openBowlCard(rec) {
  try {
    posterCanvas = await drawBowlCard(rec);
    const name = [rec.dish || rec.shop, rec.date].filter(Boolean).join('-');
    posterFileName = `面迹-${name}.png`;
    $('#poster-sheet .sheet-head h2').textContent = '分享这碗';
    $('#poster-img').src = posterCanvas.toDataURL('image/png');
    $('#poster-sheet').hidden = false;
  } catch (err) {
    console.error(err);
    toast('生成分享图失败');
  }
}

function openPoster() {
  const year = posterYear();
  const recs = state.records.filter(r => (r.date || '').startsWith(year));
  if (!recs.length) { toast('还没有可生成海报的记录'); return; }

  posterCanvas = drawPoster(year, recs);
  posterFileName = `面迹-${year}-年度海报.png`;
  $('#poster-sheet .sheet-head h2').textContent = '年度海报';
  $('#poster-img').src = posterCanvas.toDataURL('image/png');
  $('#poster-sheet').hidden = false;
}

async function sharePoster() {
  if (!posterCanvas) return;
  const blob = await new Promise(resolve => posterCanvas.toBlob(resolve, 'image/png'));
  if (!blob) { toast('海报生成失败'); return; }

  const file = new File([blob], posterFileName, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '面迹年度海报' });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn(err);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = posterFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('海报已保存');
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
        type: String(r.type || '其他').slice(0, 16),
        tags: Array.isArray(r.tags)
          ? r.tags.map(t => cleanTag(t)).filter(Boolean).slice(0, MAX_TAGS)
          : [],
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
    renderFilterChips();
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
    renderFilterChips();
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
    const chip = e.target.closest('[data-kind]');
    if (!chip) return;
    state.filter = { kind: chip.dataset.kind, value: chip.dataset.value || '' };
    renderFilterChips();
    renderList();
  });

  // Form header
  $('#record-form').addEventListener('submit', e => e.preventDefault());
  $('#form-cancel').addEventListener('click', closeForm);
  $('#form-save').addEventListener('click', handleSave);
  $('#form-delete').addEventListener('click', handleDelete);

  // Type & rating pickers
  $('#type-picker').addEventListener('click', e => {
    if (e.target.closest('[data-add-type]')) {
      const row = $('#custom-type-row');
      row.hidden = false;
      $('#f-custom-type').focus();
      return;
    }
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    state.type = chip.dataset.type;
    renderTypePicker();
  });
  $('#btn-custom-type').addEventListener('click', addCustomType);
  $('#f-custom-type').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomType(); }
  });

  // Tags
  $('#btn-add-tag').addEventListener('click', () => {
    addTag($('#f-tag-input').value);
    $('#f-tag-input').value = '';
  });
  $('#f-tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(e.target.value);
      e.target.value = '';
    }
  });
  $('#tag-selected').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-tag]');
    if (!btn) return;
    state.tags = state.tags.filter(t => t !== btn.dataset.removeTag);
    renderTags();
  });
  $('#tag-suggest').addEventListener('click', e => {
    const chip = e.target.closest('[data-suggest-tag]');
    if (!chip) return;
    addTag(chip.dataset.suggestTag);
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

  // Geo / custom location
  $('#btn-geo').addEventListener('click', captureGeo);
  $('#btn-pick-loc').addEventListener('click', openLocPicker);
  $('#loc-cancel').addEventListener('click', closeLocPicker);
  $('#loc-confirm').addEventListener('click', confirmLoc);
  $('#loc-lat').addEventListener('input', readLocInputs);
  $('#loc-lng').addEventListener('input', readLocInputs);

  // Poster
  $('#stats').addEventListener('click', e => {
    if (e.target.closest('#btn-poster')) openPoster();
  });
  $('#poster-close').addEventListener('click', () => { $('#poster-sheet').hidden = true; });
  $('#poster-share').addEventListener('click', sharePoster);

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
    if (!$('#loc-sheet').hidden) closeLocPicker();
    if (!$('#poster-sheet').hidden) $('#poster-sheet').hidden = true;
    if (formOpen) hideForm();
  });

  // Refresh map when records change while on map

  // Keyboard escape
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#loc-sheet').hidden) closeLocPicker();
    else if (!$('#poster-sheet').hidden) $('#poster-sheet').hidden = true;
    else if (!$('#menu-sheet').hidden) closeMenu();
    else if (formOpen) closeForm();
  });
}

/* ---------------- Init ---------------- */

async function init() {
  renderFilterChips();
  renderTypePicker();
  renderRatingPicker();
  bindEvents();
  await loadRecords();
  renderFilterChips();
  renderTypePicker();
  renderList();

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (state.view === 'list') drawNoodleStrand();
    }).observe($('#cards'));
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.view === 'list') drawNoodleStrand();
    });
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
