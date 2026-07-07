import { DIFFICULTY_META, DIFF_ORDER } from './constants.js';
import { normalizeString } from './ocr.js';

export function showToast(app, { title, message, type = 'info', icon = 'info' }) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="material-symbols-outlined">${icon}</span>
    <div><strong>${title}</strong><div>${message}</div></div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    el.style.transition = 'all 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3500);
}

export function updateSelectionUI(app) {
  const bar = document.getElementById('batch-actions');
  const countSpan = document.getElementById('selected-count');
  countSpan.innerText = app.selectedIds.size;
  bar.style.display = app.selectedIds.size > 0 ? 'flex' : 'none';
}

export function updateSortDirectionIcon(direction) {
  const icon = document.getElementById('sort-direction-icon');
  if (icon) icon.textContent = direction === 'asc' ? 'north' : 'south';
}

export function renderGrid(app, records) {
  const grid = document.getElementById('grid');
  const count = document.getElementById('result-count');
  const bestSummary = document.getElementById('best-summary');
  count.innerText = `表示: ${records.length} 件`;
  bestSummary.innerText = app.uiState.selfBestOnly ? '自己ベストのみ表示中' : '';
  grid.innerHTML = '';

  if (records.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#666;">データなし</div>';
    return;
  }

  for (const rec of records) {
    const thumb = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w600') : '';
    const large = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
    const missDisplay = rec.isFC
      ? `<span class="miss-val zero">FC-0</span>`
      : `FC -<span class="miss-val">${rec.missCount}</span>`;
    const badge = rec.isFC ? `<div class="fc-badge"><span class="material-symbols-outlined" style="font-size:1rem;">crown</span> FULL COMBO</div>` : '';
    const bestBadge = rec.isBest ? `<div class="best-badge"><span class="material-symbols-outlined" style="font-size:1rem;">workspace_premium</span> BEST</div>` : '';
    const isSel = app.selectedIds.has(rec.id) ? 'selected' : '';

    let clickAction = '';
    let overlayActions = '';
    if (app.isSelectMode) {
      clickAction = `toggleSelection('${rec.id}')`;
    } else {
      clickAction = `openImageModal('${large}')`;
      overlayActions = `
        <div class="card-overlay-actions">
          <div class="btn-overlay" onclick="event.stopPropagation(); individualEdit('${rec.id}')" title="編集"><span class="material-symbols-outlined">edit</span></div>
          <div class="btn-overlay del" onclick="event.stopPropagation(); individualDelete('${rec.id}')" title="削除"><span class="material-symbols-outlined">delete</span></div>
        </div>
      `;
    }

    const diffClass = `diff-${rec.difficultyRaw}`;
    const perfect = rec.perfectCount ?? '';
    const great = rec.greatCount ?? '';
    const combo = rec.comboCount ?? '';

    grid.innerHTML += `
      <div class="card ${rec.isFC ? 'is-fc' : ''} ${rec.isBest ? 'best-record' : ''} ${isSel} ${app.isSelectMode ? 'select-mode-active' : ''}" id="card-${rec.id}" onclick="${clickAction}">
        <div class="card-img-container">
          ${badge}
          ${bestBadge}
          ${overlayActions}
          <div class="img-loader-spinner"></div>
          ${thumb ? `<img src="${thumb}" class="card-img" loading="lazy" onload="this.style.opacity=1; this.previousElementSibling.style.display='none';">` : '<span style="color:#aaa;">NO IMAGE</span>'}
        </div>
        <div class="card-body">
          <div class="song-meta">
            <span class="tag lvl">Lv.${rec.level}</span>
            <span class="tag ${diffClass}">${rec.difficulty}</span>
          </div>
          <div class="song-title">${escapeHtml(rec.title)}</div>
          <div class="score-info">
            <span style="display:flex; align-items:center; gap:2px;"><span class="material-symbols-outlined" style="font-size:1rem;">bar_chart</span> Result</span>
            ${missDisplay}
          </div>
          <div class="mini-stats">
            <span>P:${perfect === '' ? '-' : perfect}</span>
            <span>G:${great === '' ? '-' : great}</span>
            <span>C:${combo === '' ? '-' : combo}</span>
          </div>
        </div>
      </div>
    `;
  }
}

export function updateDiffOptionColors() {
  for (const [key, meta] of Object.entries(DIFFICULTY_META)) {
    const option = document.querySelector(`#filter-diff option[value="${key}"]`);
    if (option) option.style.color = meta.color;
  }
}

export function renderSettingsRegionOptions(regions, selectedKey) {
  const select = document.getElementById('settings-region-select');
  select.innerHTML = Object.keys(regions).map(key => `<option value="${key}">${key}</option>`).join('');
  select.value = selectedKey;
}

export function updateSettingsInputs(region) {
  document.getElementById('settings-x').value = (region.x * 100).toFixed(1);
  document.getElementById('settings-y').value = (region.y * 100).toFixed(1);
  document.getElementById('settings-w').value = (region.w * 100).toFixed(1);
  document.getElementById('settings-h').value = (region.h * 100).toFixed(1);
}

export function escapeHtml(t) {
  return t ? t.toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m])) : '';
}

export function computeSortedRecords(records, uiState) {
  const orderMap = { asc: 1, desc: -1 };
  const dir = orderMap[uiState.sortDirection] || 1;
  const diffAsc = (a, b) => (DIFF_ORDER[a] ?? 999) - (DIFF_ORDER[b] ?? 999);
  const missValue = r => Number.isFinite(Number(r.missCount)) ? Number(r.missCount) : 999999;
  const titleCmp = (a, b) => normalizeString(a.title).localeCompare(normalizeString(b.title), 'ja');
  const levelCmp = (a, b) => (Number(a.level) || 0) - (Number(b.level) || 0);
  const dateCmp = (a, b) => new Date(a.createdTime || 0) - new Date(b.createdTime || 0);

  const list = [...records];
  list.sort((a, b) => {
    const title = titleCmp(a, b);
    const level = levelCmp(a, b);
    const miss = missValue(a) - missValue(b);
    const date = dateCmp(a, b);
    const diff = diffAsc(a.difficultyRaw, b.difficultyRaw);

    let primary = 0;
    if (uiState.sortOrder === 'name') primary = title * dir;
    else if (uiState.sortOrder === 'level') primary = level * dir;
    else if (uiState.sortOrder === 'miss') primary = miss * dir;
    else primary = date * dir;

    if (primary !== 0) return primary;

    if (uiState.sortOrder === 'name') return diff || miss || date;
    if (uiState.sortOrder === 'level') return diff || title || miss || date;
    if (uiState.sortOrder === 'miss') return level || diff || title || date;
    return 0;
  });
  return list;
}

export function applyRecordFilters(records, uiState) {
  const fcF = uiState.filterFc;
  const msMin = uiState.filterMissMin;
  const msMax = uiState.filterMissMax;
  const dfF = uiState.filterDiff;
  const lvF = uiState.filterLevel;
  const tiF = (uiState.filterTitle || '').trim().toLowerCase();

  let list = records.filter(r => {
    if (fcF === 'fc' && !r.isFC) return false;
    if (fcF === 'unfc' && r.isFC) return false;

    if (!r.isFC) {
      const mVal = Number(r.missCount) || 0;
      if (msMin !== '' && mVal < parseInt(msMin, 10)) return false;
      if (msMax !== '' && mVal > parseInt(msMax, 10)) return false;
    } else {
      if (msMin !== '' && 0 < parseInt(msMin, 10)) return false;
    }

    if (dfF !== 'all' && r.difficultyRaw !== dfF) return false;
    if (lvF && String(r.level) !== String(lvF)) return false;
    if (tiF && !r.title.toLowerCase().includes(tiF)) return false;
    if (uiState.selfBestOnly && !r.isBest) return false;
    return true;
  });

  return list;
}
