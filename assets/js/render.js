import { DIFF_BY_CODE, DIFF_RANK, difficultyCodeFromKey, difficultyKeyFromCode, difficultyLabel, normalizeDifficultyCode } from './config.js';
import { state, resetSelection } from './state.js';
import { analyzeLoadedImage, getLevelFromDb } from './ocr.js';
import { deleteDriveFiles, saveEditBatch, saveUploadBatch } from './drive.js';
import { showToast } from './notify.js';

const CARD_WIDTH = 240;
const CARD_HEIGHT = 332;
const CARD_GAP = 20;
const OVERSCAN_ROWS = 2;

let virtualRenderPending = false;

function getGridViewport() {
  return document.getElementById('grid');
}

function getGridInner() {
  return document.getElementById('grid-inner');
}

function getGridMetrics() {
  const viewport = getGridViewport();
  const width = Math.max(320, viewport?.clientWidth || 1200);
  const cols = Math.max(1, Math.floor((width + CARD_GAP) / (CARD_WIDTH + CARD_GAP)));
  const rowHeight = CARD_HEIGHT + CARD_GAP;
  return { cols, rowHeight };
}

function escapeHtml(t) {
  return t ? t.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
}

function buildCardHtml(rec, isSelectMode, isSelected) {
  const thumb = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w600') : '';
  const large = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
  const missDisplay = rec.isFC
    ? `<span class="miss-val zero">FC-0</span>`
    : `FC -<span class="miss-val">${rec.missCount}</span>`;
  const badge = rec.isFC
    ? `<div class="fc-badge"><span class="material-symbols-outlined" style="font-size:1rem;">crown</span> FULL COMBO</div>`
    : '';
  const overlayActions = isSelectMode ? '' : `
    <div class="card-overlay-actions">
      <div class="btn-overlay" onclick="event.stopPropagation(); individualEdit('${rec.id}')" title="編集"><span class="material-symbols-outlined">edit</span></div>
      <div class="btn-overlay del" onclick="event.stopPropagation(); individualDelete('${rec.id}')" title="削除"><span class="material-symbols-outlined">delete</span></div>
    </div>
  `;
  const clickAction = isSelectMode
    ? `toggleSelection('${rec.id}')`
    : `openImageModal('${large}')`;

  return `
    <div class="card ${rec.isFC ? 'is-fc' : ''} ${isSelected ? 'selected' : ''} ${isSelectMode ? 'select-mode-active' : ''}" id="card-${rec.id}" onclick="${clickAction}">
      <div class="card-img-container">
        ${badge}
        ${overlayActions}
        <div class="img-loader-spinner"></div>
        ${thumb ? `<img src="${thumb}" class="card-img" loading="lazy" onload="this.style.opacity=1; this.previousElementSibling.style.display='none';">` : '<span style="color:#aaa;">NO IMAGE</span>'}
      </div>
      <div class="card-body">
        <div class="song-meta">
          <span class="tag lvl">Lv.${rec.level}</span>
          <span class="tag diff-${rec.difficultyRaw}">${escapeHtml(rec.difficulty)}</span>
        </div>
        <div class="song-title">${escapeHtml(rec.title)}</div>
        <div class="score-info">
          <span style="display:flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:1rem;">bar_chart</span> Result</span>
          ${missDisplay}
        </div>
      </div>
    </div>
  `;
}

function scheduleVirtualRender() {
  if (virtualRenderPending) return;
  virtualRenderPending = true;
  window.requestAnimationFrame(() => {
    virtualRenderPending = false;
    renderVirtualGrid();
  });
}

export function renderGrid(records) {
  state.filteredRecords = records || [];
  const resultCount = document.getElementById('result-count');
  if (resultCount) resultCount.textContent = `表示: ${state.filteredRecords.length} 件`;
  const viewport = getGridViewport();
  if (viewport) viewport.scrollTop = 0;
  scheduleVirtualRender();
  updateSelectionUI();
}

export function renderVirtualGrid() {
  const viewport = getGridViewport();
  const inner = getGridInner();
  if (!viewport || !inner) return;

  const records = state.filteredRecords || [];
  const isSelectMode = state.isSelectMode;

  if (records.length === 0) {
    inner.innerHTML = `
      <div style="position:absolute; inset:0; display:flex; align-items:flex-start; justify-content:center; padding-top:24px; color:#666;">
        データなし
      </div>
    `;
    inner.style.height = '120px';
    return;
  }

  const { cols, rowHeight } = getGridMetrics();
  const totalRows = Math.ceil(records.length / cols);
  const viewportHeight = viewport.clientHeight || 800;
  const scrollTop = viewport.scrollTop || 0;
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(totalRows - 1, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS);
  const startIdx = startRow * cols;
  const endIdx = Math.min(records.length, (endRow + 1) * cols);

  inner.style.position = 'relative';
  inner.style.height = `${totalRows * rowHeight + 12}px`;

  const items = [];
  for (let i = startIdx; i < endIdx; i += 1) {
    const rec = records[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * (CARD_WIDTH + CARD_GAP);
    const y = row * rowHeight;
    const isSelected = state.selectedIds.has(rec.id);
    items.push(`
      <div class="virtual-card-shell" style="position:absolute; left:${x}px; top:${y}px; width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px;">
        ${buildCardHtml(rec, isSelectMode, isSelected)}
      </div>
    `);
  }

  inner.innerHTML = items.join('');
}

export function updateView() {
  if (!state.allRecords) return;

  const fcF = document.getElementById('filter-fc')?.value || 'all';
  const msMin = document.getElementById('filter-miss-min')?.value || '';
  const msMax = document.getElementById('filter-miss-max')?.value || '';
  const dfF = normalizeDifficultyCode(document.getElementById('filter-diff')?.value || 'all');
  const lvF = document.getElementById('filter-level')?.value || '';
  const tiF = (document.getElementById('filter-title')?.value || '').trim().toLowerCase();

  let list = state.allRecords.filter((r) => {
    if (fcF === 'fc' && !r.isFC) return false;
    if (fcF === 'unfc' && r.isFC) return false;
    if (!r.isFC) {
      const mVal = Number(r.missCount);
      if (msMin !== '' && mVal < parseInt(msMin, 10)) return false;
      if (msMax !== '' && mVal > parseInt(msMax, 10)) return false;
    } else if (msMin !== '' && 0 < parseInt(msMin, 10)) {
      return false;
    }
    if (dfF !== 'ALL' && dfF !== 'all' && normalizeDifficultyCode(r.difficultyRaw) !== dfF) return false;
    if (lvF && String(r.level) !== String(lvF)) return false;
    if (tiF && !String(r.title).toLowerCase().includes(tiF)) return false;
    return true;
  });

  const sOrder = document.getElementById('sort-order')?.value || 'level_desc';
  list.sort((a, b) => {
    const tAsc = a.title.localeCompare(b.title, 'ja');
    const tDesc = b.title.localeCompare(a.title, 'ja');
    const lDiff = Number(b.level) - Number(a.level);
    const lAsc = Number(a.level) - Number(b.level);
    const dDiff = (DIFF_RANK[normalizeDifficultyCode(b.difficultyRaw)] || 0) - (DIFF_RANK[normalizeDifficultyCode(a.difficultyRaw)] || 0);
    const mAsc = Number(a.missCount) - Number(b.missCount);
    const mDesc = Number(b.missCount) - Number(a.missCount);

    if (sOrder === 'title_asc') return tAsc || dDiff || mAsc;
    if (sOrder === 'title_desc') return tDesc || dDiff || mAsc;
    if (sOrder === 'level_desc') return lDiff || tAsc || dDiff || mAsc;
    if (sOrder === 'level_asc') return lAsc || tAsc || dDiff || mAsc;
    if (sOrder === 'miss_asc') return mAsc || lDiff || dDiff;
    return mDesc || lDiff || dDiff;
  });

  state.filteredRecords = list;
  renderGrid(list);
}

export function openImageModal(src) {
  if (!src) return;
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('modalImg');
  if (modal && img) {
    modal.style.display = 'flex';
    img.src = src;
  }
}

export function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (modal) modal.style.display = 'none';
}

export function onDataLoaded() {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
  updateView();
}

export function openBatchModal(mode) {
  state.currentMode = mode;
  state.editorQueue = [];
  state.activeItemId = null;

  const modal = document.getElementById('batchModal');
  const sidebar = document.getElementById('batch-sidebar-list');
  const editor = document.getElementById('batch-editor-container');
  const emptyMsg = document.getElementById('batch-empty-msg');
  const statusMsg = document.getElementById('batch-status-msg');
  const execBtn = document.getElementById('btn-exec-batch');
  const uploadInitial = document.getElementById('upload-initial');
  const workspace = document.getElementById('batch-workspace');

  if (modal) modal.style.display = 'flex';
  if (sidebar) sidebar.innerHTML = '';
  if (editor) editor.style.display = 'none';
  if (emptyMsg) emptyMsg.style.display = 'block';
  if (statusMsg) statusMsg.textContent = '待機中...';
  if (execBtn) execBtn.disabled = true;

  if (mode === 'upload') {
    const title = document.getElementById('batch-modal-title');
    if (title) title.innerHTML = '<span class="material-symbols-outlined">cloud_upload</span> 画像アップロード';
    if (uploadInitial) uploadInitial.style.display = 'flex';
    if (workspace) workspace.style.display = 'none';
    const fileInput = document.getElementById('up-file');
    if (fileInput) fileInput.value = '';
    if (execBtn) execBtn.textContent = '全てアップロード';
  } else {
    const title = document.getElementById('batch-modal-title');
    if (title) title.innerHTML = '<span class="material-symbols-outlined">edit_square</span> 編集・解析モード';
    if (uploadInitial) uploadInitial.style.display = 'none';
    if (workspace) workspace.style.display = 'flex';
    if (execBtn) execBtn.textContent = '保存して反映';
  }
}

export function closeBatchModal() {
  const modal = document.getElementById('batchModal');
  if (modal) modal.style.display = 'none';
}

export async function handleFiles(files) {
  if (!files || files.length === 0) return;

  const uploadInitial = document.getElementById('upload-initial');
  const workspace = document.getElementById('batch-workspace');
  const statusMsg = document.getElementById('batch-status-msg');

  if (uploadInitial) uploadInitial.style.display = 'none';
  if (workspace) workspace.style.display = 'flex';
  if (statusMsg) statusMsg.textContent = '画像を処理中...';

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const qId = `new_${Date.now()}_${i}`;
    state.editorQueue.push({
      id: qId,
      file,
      imgUrl: URL.createObjectURL(file),
      status: 'pending',
      data: { title: '', level: '', diff: 'M', good: 0, bad: 0, missDetail: 0, totalMiss: 0, musicId: null },
      originalId: null,
      originalParent: null,
    });
    renderSidebarItem(qId);
  }

  await runBatchAnalysis(state.editorQueue.filter((item) => item.status === 'pending'));
  if (!state.activeItemId && state.editorQueue.length > 0) selectItem(state.editorQueue[0].id);
  checkBatchButton();
}

export async function batchEdit() {
  if (state.selectedIds.size === 0) return;
  openBatchModal('edit');

  const targets = state.allRecords.filter((record) => state.selectedIds.has(record.id));
  const statusMsg = document.getElementById('batch-status-msg');
  if (statusMsg) statusMsg.textContent = '編集データを準備中...';

  for (const rec of targets) {
    const qId = `edit_${rec.id}`;
    const highResUrl = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
    state.editorQueue.push({
      id: qId,
      file: null,
      imgUrl: highResUrl,
      status: 'existing',
      data: {
        title: rec.title,
        level: rec.level,
        diff: normalizeDifficultyCode(rec.difficultyRaw),
        good: 0,
        bad: 0,
        missDetail: 0,
        totalMiss: rec.missCount,
        musicId: null,
      },
      originalId: rec.id,
      originalParent: rec.parentId,
    });
    renderSidebarItem(qId);
  }

  if (state.editorQueue.length > 0) selectItem(state.editorQueue[0].id);
  checkBatchButton();
  if (statusMsg) statusMsg.textContent = '編集準備完了';
}

export function renderSidebarItem(id) {
  const item = state.editorQueue.find((q) => q.id === id);
  if (!item) return;
  const list = document.getElementById('batch-sidebar-list');
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'sidebar-item';
  div.id = `sb-${id}`;
  div.onclick = () => selectItem(id);
  const thumbUrl = item.imgUrl;

  div.innerHTML = `
    <img src="${thumbUrl}" class="sidebar-thumb" crossorigin="anonymous">
    <div class="sidebar-info">
      <div class="sidebar-title" id="sb-title-${id}">${item.data.title || '名称未設定'}</div>
      <div class="sidebar-status">
        <span id="sb-status-${id}" class="upload-status ${item.status === 'existing' ? 'done' : item.status}">${item.status === 'existing' ? 'EXIST' : item.status}</span>
        <button class="btn-remove-side" onclick="removeBatchItem(event, '${id}')">
          <span class="material-symbols-outlined" style="font-size:1rem;">delete</span>
        </button>
      </div>
    </div>
  `;
  list.appendChild(div);
}

export function selectItem(id) {
  state.activeItemId = id;
  const item = state.editorQueue.find((q) => q.id === id);
  if (!item) return;

  document.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('active'));
  const sidebar = document.getElementById(`sb-${id}`);
  if (sidebar) sidebar.classList.add('active');

  const editor = document.getElementById('batch-editor-container');
  const emptyMsg = document.getElementById('batch-empty-msg');
  if (editor) editor.style.display = 'flex';
  if (emptyMsg) emptyMsg.style.display = 'none';

  const imgEl = document.getElementById('batch-preview-img');
  if (imgEl) imgEl.src = item.imgUrl;

  const setValue = (idName, value) => {
    const el = document.getElementById(idName);
    if (el) el.value = value;
  };

  setValue('up-title', item.data.title);
  setValue('up-level', item.data.level);
  setValue('up-diff', normalizeDifficultyCode(item.data.diff));
  setValue('up-good', item.data.good);
  setValue('up-bad', item.data.bad);
  setValue('up-miss-detail', item.data.missDetail);

  const totalMissEl = document.getElementById('up-total-miss');
  if (totalMissEl) totalMissEl.textContent = item.data.totalMiss;
}

export function updateCurrentItem(field, value) {
  if (!state.activeItemId) return;
  const item = state.editorQueue.find((q) => q.id === state.activeItemId);
  if (!item) return;

  if (['good', 'bad', 'missDetail', 'level'].includes(field)) {
    item.data[field] = parseInt(value, 10) || 0;
  } else if (field === 'diff') {
    item.data[field] = normalizeDifficultyCode(value);
  } else {
    item.data[field] = value;
  }

  if (field === 'diff' && item.data.musicId) {
    const diffKey = difficultyKeyFromCode(item.data.diff);
    const newLvl = getLevelFromDb(item.data.musicId, diffKey);
    if (newLvl) {
      item.data.level = newLvl;
      const levelEl = document.getElementById('up-level');
      if (levelEl) levelEl.value = newLvl;
    }
  }

  if (['good', 'bad', 'missDetail'].includes(field)) {
    item.data.totalMiss = Number(item.data.good) + Number(item.data.bad) + Number(item.data.missDetail);
    const totalMissEl = document.getElementById('up-total-miss');
    if (totalMissEl) totalMissEl.textContent = item.data.totalMiss;
  }

  if (field === 'title') {
    const titleEl = document.getElementById(`sb-title-${state.activeItemId}`);
    if (titleEl) titleEl.textContent = value || '名称未設定';
  }

  item.status = 'done';
  updateSidebarStatus(state.activeItemId);
  checkBatchButton();
}

export function updateSidebarStatus(id) {
  const item = state.editorQueue.find((q) => q.id === id);
  if (!item) return;
  const statusEl = document.getElementById(`sb-status-${id}`);
  if (!statusEl) return;

  if (item.status === 'error') {
    statusEl.textContent = 'ERR';
    statusEl.className = 'upload-status error';
  } else if (item.status === 'existing') {
    statusEl.textContent = 'EXIST';
    statusEl.className = 'upload-status done';
  } else if (item.status === 'pending') {
    statusEl.textContent = '待機';
    statusEl.className = 'upload-status pending';
  } else {
    statusEl.textContent = 'OK';
    statusEl.className = 'upload-status done';
  }
}

export function removeBatchItem(e, id) {
  e?.stopPropagation?.();
  state.editorQueue = state.editorQueue.filter((q) => q.id !== id);
  const sb = document.getElementById(`sb-${id}`);
  if (sb) sb.remove();

  if (state.activeItemId === id) {
    state.activeItemId = null;
    const editor = document.getElementById('batch-editor-container');
    const emptyMsg = document.getElementById('batch-empty-msg');
    if (editor) editor.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
  }

  checkBatchButton();
}

export function checkBatchButton() {
  const btn = document.getElementById('btn-exec-batch');
  if (!btn) return;
  btn.disabled = state.editorQueue.length === 0;
  const label = state.currentMode === 'upload' ? '全てアップロード' : '保存して反映';
  btn.textContent = state.editorQueue.length > 0 ? `${label} (${state.editorQueue.length}件)` : label;
}

export async function runBatchAnalysis(itemsToAnalyze) {
  if (!itemsToAnalyze || itemsToAnalyze.length === 0) return;
  const statusMsg = document.getElementById('batch-status-msg');
  if (statusMsg) statusMsg.textContent = '解析中... (しばらくお待ちください)';

  if (!window.Tesseract) {
    showToast('Tesseract の読み込みに失敗しています。', 'error');
    return;
  }

  const worker = await window.Tesseract.createWorker(['jpn', 'eng']);

  for (const item of itemsToAnalyze) {
    const el = document.getElementById(`sb-status-${item.id}`);
    if (el) {
      el.textContent = '解析中';
      el.className = 'upload-status processing';
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = item.imgUrl;

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const res = await analyzeLoadedImage(img, worker);
      if (res) {
        item.data = {
          title: res.title,
          level: res.level,
          diff: normalizeDifficultyCode(res.diff),
          good: res.missDetail.good,
          bad: res.missDetail.bad,
          missDetail: res.missDetail.miss,
          totalMiss: res.miss,
          musicId: res.musicId,
        };
        item.status = 'done';
      } else {
        item.status = 'error';
      }
    } catch (error) {
      console.error('Analysis Failed for ' + item.id, error);
      item.status = 'error';
    }

    updateSidebarStatus(item.id);
    if (item.status === 'done') {
      const titleEl = document.getElementById(`sb-title-${item.id}`);
      if (titleEl) titleEl.textContent = item.data.title;
      if (state.activeItemId === item.id) selectItem(item.id);
    } else {
      const statEl = document.getElementById(`sb-status-${item.id}`);
      if (statEl) {
        statEl.textContent = 'ERR';
        statEl.className = 'upload-status error';
      }
    }
  }

  await worker.terminate();
  if (statusMsg) statusMsg.textContent = '処理完了';
}

export async function reanalyzeCurrentItem() {
  if (!state.activeItemId) return;
  const item = state.editorQueue.find((q) => q.id === state.activeItemId);
  if (item) await runBatchAnalysis([item]);
}

export async function analyzeAllInBatch() {
  if (state.editorQueue.length === 0) return;
  await runBatchAnalysis(state.editorQueue);
}

export async function handleBatchExecution() {
  const btn = document.getElementById('btn-exec-batch');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '処理中...';
  }

  try {
    const count = state.currentMode === 'upload'
      ? await saveUploadBatch(state.editorQueue)
      : await saveEditBatch(state.editorQueue);

    finishExecution(count, state.currentMode === 'upload' ? 'アップロード' : '更新');
  } catch (error) {
    console.error(error);
    showToast(error.message || '処理に失敗しました。', 'error');
    checkBatchButton();
  }
}

function finishExecution(count, actionName) {
  if (state.editorQueue.length === 0) {
    alert(`${actionName}完了 (${count}件)`);
    closeBatchModal();
    state.selectedIds.clear();
    updateSelectionUI();
    if (window.fetchDataFromDrive) window.fetchDataFromDrive();
  } else {
    alert(`${count}件 ${actionName}成功。エラー分を確認してください。`);
    checkBatchButton();
  }
}

export function toggleSelectMode() {
  state.isSelectMode = !state.isSelectMode;
  const btn = document.getElementById('btn-select-mode');
  if (btn) btn.classList.toggle('active', state.isSelectMode);
  if (!state.isSelectMode) {
    state.selectedIds.clear();
    updateSelectionUI();
  }
  updateView();
}

export function toggleSelection(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);

  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.toggle('selected', state.selectedIds.has(id));
  updateSelectionUI();
}

export function updateSelectionUI() {
  const bar = document.getElementById('batch-actions');
  const countSpan = document.getElementById('selected-count');
  if (countSpan) countSpan.textContent = state.selectedIds.size;
  if (bar) bar.style.display = state.selectedIds.size > 0 ? 'flex' : 'none';
}

export function clearSelection() {
  state.selectedIds.clear();
  updateSelectionUI();
  updateView();
}

export function individualEdit(id) {
  state.selectedIds.clear();
  state.selectedIds.add(id);
  batchEdit();
}

export async function individualDelete(id) {
  if (!confirm('このリザルトを削除しますか？')) return;
  const loader = document.getElementById('loader');
  const grid = document.getElementById('grid');
  if (loader) loader.style.display = 'flex';
  if (grid) grid.innerHTML = '';
  try {
    await deleteDriveFiles([id]);
    alert('削除しました');
    if (window.fetchDataFromDrive) await window.fetchDataFromDrive();
  } catch (error) {
    alert(`エラー: ${error.message}`);
    if (window.fetchDataFromDrive) await window.fetchDataFromDrive();
  }
}

export async function batchDelete() {
  if (!confirm(`選択した ${state.selectedIds.size} 件を削除しますか？`)) return;
  const loader = document.getElementById('loader');
  const grid = document.getElementById('grid');
  if (loader) loader.style.display = 'flex';
  if (grid) grid.innerHTML = '';
  try {
    await deleteDriveFiles([...state.selectedIds]);
    alert('削除しました');
    state.selectedIds.clear();
    updateSelectionUI();
    if (window.fetchDataFromDrive) await window.fetchDataFromDrive();
  } catch (error) {
    alert(`削除エラー: ${error.message}`);
    if (window.fetchDataFromDrive) await window.fetchDataFromDrive();
  }
}


export function updateDiffOptions() {
  const filter = document.getElementById('filter-diff');
  const editor = document.getElementById('up-diff');
  const options = [
    { value: 'all', label: 'すべて' },
    ...Object.values(DIFF_BY_CODE).map((item) => ({ value: item.code, label: item.label })),
  ];

  const html = options.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  if (filter) filter.innerHTML = html;
  if (editor) editor.innerHTML = options.filter((opt) => opt.value !== 'all').map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
}
