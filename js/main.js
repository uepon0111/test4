import { APP_CONFIG, DEFAULT_SETTINGS, DEFAULT_UI_STATE, DIFFICULTIES, DIFFICULTY_META, DIFF_ORDER } from './constants.js';
import { loadSettings, saveSettings, loadUiState, saveUiState } from './storage.js';
import { initializeGapiClient, initTokenClient, fetchDriveRecords, findOrCreateFolder, createDriveFile, updateDriveFile, deleteDriveFile, revokeToken } from './drive.js';
import { analyzeLoadedImage, buildSongKey, compareResults, normalizeDifficulty, normalizeString, parseFolderTitle, buildResultDescription, getDifficultyCode, getLevelFromDb } from './ocr.js';
import { renderGrid, updateSelectionUI, showToast, updateSortDirectionIcon, computeSortedRecords, applyRecordFilters, updateDiffOptionColors } from './render.js';
import { initSettingsUI, openSettingsModal, closeSettingsModal, saveCropSettings, resetCropSettings, getCropRegions, getSampleImageDataUrl } from './settings-ui.js';

const app = {
  gapiInited: false,
  gisInited: false,
  tokenClient: null,
  authToken: null,
  allRecords: [],
  filteredRecords: [],
  folderCache: new Map(),
  dbMusics: [],
  dbDiffs: [],
  isSelectMode: false,
  selectedIds: new Set(),
  editorQueue: [],
  activeItemId: null,
  currentMode: 'upload',
  sortDirection: 'desc',
  uiState: loadUiState(DEFAULT_UI_STATE),
  settings: loadSettings(DEFAULT_SETTINGS),
  selfBestMap: new Map(),
  recordIndex: new Map(),
  pendingBestToast: [],
  persistSettings() {
    saveSettings(this.settings);
  },
  persistUiState() {
    saveUiState(this.uiState);
  }
};

window.app = app;
window.showToast = (opts) => showToast(app, opts);

window.gapiLoaded = async function gapiLoaded() {
  try {
    await initializeGapiClient();
    app.gapiInited = true;
    maybeEnableLogin();
  } catch (e) {
    console.error(e);
    showToast(app, { title: 'Google API 初期化失敗', message: String(e.message || e), type: 'error', icon: 'error' });
  }
};

window.gisLoaded = function gisLoaded() {
  app.tokenClient = initTokenClient(async (resp) => {
    if (resp.error !== undefined) throw resp;
    await afterLogin();
  });
  app.gisInited = true;
  maybeEnableLogin();
};

window.handleAuthClick = function handleAuthClick() {
  if (!app.tokenClient) return;
  app.tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw resp;
    await afterLogin();
  };
  if (gapi.client.getToken() === null) app.tokenClient.requestAccessToken({ prompt: 'consent' });
  else app.tokenClient.requestAccessToken({ prompt: '' });
};

window.handleSignoutClick = function handleSignoutClick() {
  revokeToken();
  setAuthUI(false);
  document.getElementById('result-count').innerText = 'ログアウトしました';
  document.getElementById('grid').innerHTML = '';
  app.allRecords = [];
  app.filteredRecords = [];
  app.selectedIds.clear();
  updateSelectionUI(app);
};

window.openBatchModal = function openBatchModal(mode) {
  app.currentMode = mode;
  const modal = document.getElementById('batchModal');
  modal.style.display = 'flex';
  app.editorQueue = [];
  app.activeItemId = null;
  document.getElementById('batch-sidebar-list').innerHTML = '';
  document.getElementById('batch-editor-container').style.display = 'none';
  document.getElementById('batch-empty-msg').style.display = 'block';
  document.getElementById('batch-status-msg').innerText = '待機中...';
  document.getElementById('btn-exec-batch').disabled = true;

  if (mode === 'upload') {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">cloud_upload</span> 画像アップロード';
    document.getElementById('upload-initial').style.display = 'flex';
    document.getElementById('batch-workspace').style.display = 'none';
    document.getElementById('up-file').value = '';
    document.getElementById('btn-exec-batch').innerText = '全てアップロード';
  } else {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">edit_square</span> 編集・解析モード';
    document.getElementById('upload-initial').style.display = 'none';
    document.getElementById('batch-workspace').style.display = 'flex';
    document.getElementById('btn-exec-batch').innerText = '保存して反映';
  }
};

window.closeBatchModal = function closeBatchModal() {
  document.getElementById('batchModal').style.display = 'none';
};

window.openSettingsModal = function openSettingsModalProxy() {
  openSettingsModal(app);
};

window.closeSettingsModal = function closeSettingsModalProxy() {
  closeSettingsModal();
};

window.saveCropSettings = function saveCropSettingsProxy() {
  saveCropSettings(app);
};

window.resetCropSettings = function resetCropSettingsProxy() {
  resetCropSettings(app);
};

window.toggleSortDirection = function toggleSortDirection() {
  app.uiState.sortDirection = app.uiState.sortDirection === 'asc' ? 'desc' : 'asc';
  updateSortDirectionIcon(app.uiState.sortDirection);
  app.persistUiState();
  updateView();
};

window.toggleSelectMode = function toggleSelectMode() {
  app.isSelectMode = !app.isSelectMode;
  const btn = document.getElementById('btn-select-mode');
  if (app.isSelectMode) btn.classList.add('active');
  else {
    btn.classList.remove('active');
    app.selectedIds.clear();
    updateSelectionUI(app);
  }
  renderGrid(app, app.filteredRecords);
};

window.toggleSelection = function toggleSelection(id) {
  if (app.selectedIds.has(id)) app.selectedIds.delete(id);
  else app.selectedIds.add(id);
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.toggle('selected', app.selectedIds.has(id));
  updateSelectionUI(app);
};

window.clearSelection = function clearSelection() {
  app.selectedIds.clear();
  updateSelectionUI(app);
  renderGrid(app, app.filteredRecords);
};

window.individualEdit = function individualEdit(id) {
  app.selectedIds.clear();
  app.selectedIds.add(id);
  batchEdit();
};

window.individualDelete = async function individualDelete(id) {
  if (!confirm('このリザルトを削除しますか？')) return;
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('grid').innerHTML = '';
  try {
    await deleteDriveFile(id);
    showToast(app, { title: '削除しました', message: 'リザルトを削除しました。', type: 'success', icon: 'delete' });
    await fetchDataFromDrive();
  } catch (e) {
    showToast(app, { title: '削除エラー', message: String(e.message || e), type: 'error', icon: 'error' });
    await fetchDataFromDrive();
  }
};

window.batchDelete = async function batchDelete() {
  if (!confirm(`選択した ${app.selectedIds.size} 件を削除しますか？`)) return;
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('grid').innerHTML = '';
  try {
    for (const id of app.selectedIds) {
      await deleteDriveFile(id);
    }
    showToast(app, { title: '削除しました', message: `${app.selectedIds.size} 件を削除しました。`, type: 'success', icon: 'delete' });
    app.selectedIds.clear();
    updateSelectionUI(app);
    await fetchDataFromDrive();
  } catch (e) {
    showToast(app, { title: '削除エラー', message: String(e.message || e), type: 'error', icon: 'error' });
    await fetchDataFromDrive();
  }
};

window.batchEdit = batchEdit;
window.reanalyzeCurrentItem = async function reanalyzeCurrentItem() {
  if (!app.activeItemId) return;
  const item = app.editorQueue.find(q => q.id === app.activeItemId);
  if (item) await runBatchAnalysis([item]);
};

window.analyzeAllInBatch = async function analyzeAllInBatch() {
  if (app.editorQueue.length === 0) return;
  await runBatchAnalysis(app.editorQueue);
};

window.updateCurrentItem = function updateCurrentItem(field, value) {
  if (!app.activeItemId) return;
  const item = app.editorQueue.find(q => q.id === app.activeItemId);
  if (!item) return;

  if (['perfect', 'great', 'good', 'bad', 'missDetail', 'combo', 'level'].includes(field)) {
    item.data[field] = parseInt(value, 10) || 0;
  } else {
    item.data[field] = value;
  }

  if (field === 'diff' && item.data.musicId) {
    const newLvl = getLevelFromDb(item.data.musicId, value, app.dbDiffs);
    if (newLvl) {
      item.data.level = newLvl;
      document.getElementById('up-level').value = newLvl;
    }
  }

  if (['good', 'bad', 'missDetail'].includes(field)) {
    item.data.totalMiss = (item.data.good || 0) + (item.data.bad || 0) + (item.data.missDetail || 0);
    document.getElementById('up-total-miss').innerText = item.data.totalMiss;
  }

  if (field === 'title') document.getElementById(`sb-title-${app.activeItemId}`).innerText = value || '名称未設定';
  item.status = 'done';
  updateSidebarStatus(item.id);
};

window.handleBatchExecution = handleBatchExecution;

window.updateView = updateView;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;

function maybeEnableLogin() {
  if (app.gapiInited && app.gisInited) {
    document.getElementById('authorize_button').disabled = false;
  }
}

async function afterLogin() {
  setAuthUI(true);
  await fetchDataFromDrive();
}

function setAuthUI(isLoggedIn) {
  document.getElementById('signout_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('upload_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('authorize_button').style.display = isLoggedIn ? 'none' : 'inline-flex';
  document.getElementById('auth-status').innerText = isLoggedIn ? 'ログイン済み' : '未ログイン';
}

async function loadDb() {
  try {
    const [musicsResp, diffsResp] = await Promise.all([
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musics.json'),
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json')
    ]);
    app.dbMusics = await musicsResp.json();
    app.dbDiffs = await diffsResp.json();
  } catch (e) {
    console.error(e);
    showToast(app, { title: 'DB読み込み失敗', message: String(e.message || e), type: 'error', icon: 'error' });
  }
}


function parseResultMeta(file) {
  const description = file.description;
  if (description) {
    try {
      const obj = JSON.parse(description);
      return {
        miss: Number(obj.miss ?? 0) || 0,
        perfect: Number(obj.perfect ?? 0) || 0,
        great: Number(obj.great ?? 0) || 0,
        combo: Number(obj.combo ?? 0) || 0
      };
    } catch {}
  }
  const name = file.name || '';
  const missMatch = name.match(/FC(?:-(\d+))?/i);
  const perfect = name.match(/P(?:ERFECT)?(?:=|:)?(\d+)/i);
  const great = name.match(/G(?:REAT)?(?:=|:)?(\d+)/i);
  const combo = name.match(/C(?:OMBO)?(?:=|:)?(\d+)/i);
  return {
    miss: missMatch ? (missMatch[1] ? parseInt(missMatch[1], 10) : 0) : 0,
    perfect: perfect ? parseInt(perfect[1], 10) : 0,
    great: great ? parseInt(great[1], 10) : 0,
    combo: combo ? parseInt(combo[1], 10) : 0
  };
}

async function fetchDataFromDrive() {
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('result-count').innerText = 'データ取得中...';

  try {
    const { records, folderCache, rootFolder, subFolder } = await fetchDriveRecords({
      rootFolderName: APP_CONFIG.rootFolderName,
      subFolderName: APP_CONFIG.subFolderName,
      parseFolderTitle,
      parseResultMeta
    });

    app.allRecords = records;
    app.folderCache = folderCache;
    rebuildDerivedState();
    loader.style.display = 'none';
    updateView();
  } catch (e) {
    console.error(e);
    loader.style.display = 'none';
    showToast(app, { title: '読み込みエラー', message: String(e.message || e), type: 'error', icon: 'error' });
  }
}

function rebuildDerivedState() {
  app.recordIndex = new Map();
  const bestByKey = new Map();

  for (const rec of app.allRecords) {
    const key = buildSongKey(rec);
    if (!app.recordIndex.has(key)) app.recordIndex.set(key, []);
    app.recordIndex.get(key).push(rec);

    const currentBest = bestByKey.get(key);
    if (!currentBest || compareResults(rec, currentBest) < 0) {
      bestByKey.set(key, rec);
    }
  }

  app.selfBestMap = bestByKey;

  for (const rec of app.allRecords) {
    rec.isBest = bestByKey.get(buildSongKey(rec))?.id === rec.id;
  }
}

function getVisibleRecords() {
  const filtered = applyRecordFilters(app.allRecords, app.uiState);
  const sorted = computeSortedRecords(filtered, app.uiState);
  return sorted;
}

function updateView() {
  app.uiState.filterFc = document.getElementById('filter-fc').value;
  app.uiState.filterMissMin = document.getElementById('filter-miss-min').value;
  app.uiState.filterMissMax = document.getElementById('filter-miss-max').value;
  app.uiState.filterDiff = document.getElementById('filter-diff').value;
  app.uiState.filterTitle = document.getElementById('filter-title').value;
  app.uiState.filterLevel = document.getElementById('filter-level').value;
  app.uiState.selfBestOnly = document.getElementById('filter-self-best').checked;
  app.uiState.sortOrder = document.getElementById('sort-order').value;
  app.persistUiState();

  app.filteredRecords = getVisibleRecords();
  renderGrid(app, app.filteredRecords);
}

function syncUiFromState() {
  document.getElementById('sort-order').value = app.uiState.sortOrder || 'level';
  document.getElementById('filter-fc').value = app.uiState.filterFc || 'all';
  document.getElementById('filter-miss-min').value = app.uiState.filterMissMin || '';
  document.getElementById('filter-miss-max').value = app.uiState.filterMissMax || '';
  document.getElementById('filter-diff').value = app.uiState.filterDiff || 'all';
  document.getElementById('filter-title').value = app.uiState.filterTitle || '';
  document.getElementById('filter-level').value = app.uiState.filterLevel || '';
  document.getElementById('filter-self-best').checked = !!app.uiState.selfBestOnly;
  updateSortDirectionIcon(app.uiState.sortDirection || 'desc');
}

async function handleFiles(files) {
  if (!files.length) return;
  document.getElementById('upload-initial').style.display = 'none';
  document.getElementById('batch-workspace').style.display = 'flex';
  document.getElementById('batch-status-msg').innerText = '画像を処理中...';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const qId = `new_${Date.now()}_${i}`;
    app.editorQueue.push({
      id: qId,
      file,
      imgUrl: URL.createObjectURL(file),
      status: 'pending',
      data: {
        title: '',
        level: '',
        diff: 'EXPERT',
        perfect: 0,
        great: 0,
        good: 0,
        bad: 0,
        missDetail: 0,
        totalMiss: 0,
        combo: 0,
        musicId: null
      },
      originalId: null,
      originalParent: null
    });
    renderSidebarItem(qId);
  }

  await runBatchAnalysis(app.editorQueue.filter(i => i.status === 'pending'));
  if (!app.activeItemId && app.editorQueue.length > 0) selectItem(app.editorQueue[0].id);
  checkBatchButton();
}

window.handleFiles = handleFiles; // for debug if needed

function renderSidebarItem(id) {
  const item = app.editorQueue.find(q => q.id === id);
  const div = document.createElement('div');
  div.className = 'sidebar-item';
  div.id = `sb-${id}`;
  div.onclick = () => selectItem(id);
  div.innerHTML = `
    <img src="${item.imgUrl}" class="sidebar-thumb" crossorigin="anonymous" alt="thumb">
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
  document.getElementById('batch-sidebar-list').appendChild(div);
}

window.removeBatchItem = function removeBatchItem(e, id) {
  e.stopPropagation();
  app.editorQueue = app.editorQueue.filter(q => q.id !== id);
  document.getElementById(`sb-${id}`)?.remove();
  if (app.activeItemId === id) {
    document.getElementById('batch-editor-container').style.display = 'none';
    document.getElementById('batch-empty-msg').style.display = 'block';
    app.activeItemId = null;
  }
  checkBatchButton();
};

function selectItem(id) {
  app.activeItemId = id;
  const item = app.editorQueue.find(q => q.id === id);
  if (!item) return;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`sb-${id}`)?.classList.add('active');

  document.getElementById('batch-editor-container').style.display = 'flex';
  document.getElementById('batch-empty-msg').style.display = 'none';
  document.getElementById('batch-preview-img').src = item.imgUrl;

  document.getElementById('up-title').value = item.data.title || '';
  document.getElementById('up-level').value = item.data.level || '';
  document.getElementById('up-diff').value = item.data.diff || 'EXPERT';
  document.getElementById('up-perfect').value = item.data.perfect || 0;
  document.getElementById('up-great').value = item.data.great || 0;
  document.getElementById('up-good').value = item.data.good || 0;
  document.getElementById('up-bad').value = item.data.bad || 0;
  document.getElementById('up-miss-detail').value = item.data.missDetail || 0;
  document.getElementById('up-combo').value = item.data.combo || 0;
  document.getElementById('up-total-miss').innerText = item.data.totalMiss || 0;
}

function updateSidebarStatus(id) {
  const item = app.editorQueue.find(q => q.id === id);
  if (!item) return;
  const statusEl = document.getElementById(`sb-status-${id}`);
  if (!statusEl) return;
  statusEl.innerText = item.status === 'error' ? 'ERR' : 'OK';
  statusEl.className = `upload-status ${item.status === 'error' ? 'error' : 'done'}`;
}

function checkBatchButton() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = app.editorQueue.length === 0;
  const label = app.currentMode === 'upload' ? '全てアップロード' : '保存して反映';
  btn.innerText = app.editorQueue.length > 0 ? `${label} (${app.editorQueue.length}件)` : label;
}

async function runBatchAnalysis(itemsToAnalyze) {
  if (!itemsToAnalyze.length) return;
  const statusMsg = document.getElementById('batch-status-msg');
  statusMsg.innerText = '解析中... (しばらくお待ちください)';

  const worker = await Tesseract.createWorker(['jpn', 'eng']);

  for (const item of itemsToAnalyze) {
    const el = document.getElementById(`sb-status-${item.id}`);
    if (el) { el.innerText = '解析中'; el.className = 'upload-status processing'; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = item.imgUrl;

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const res = await analyzeLoadedImage(img, worker, {
        cropRegions: getCropRegions(),
        dbMusics: app.dbMusics,
        dbDiffs: app.dbDiffs
      });

      if (res) {
        item.data = {
          title: res.title,
          level: res.level,
          diff: res.diff,
          perfect: res.missDetail.perfect,
          great: res.missDetail.great,
          good: res.missDetail.good,
          bad: res.missDetail.bad,
          missDetail: res.missDetail.miss,
          totalMiss: res.miss,
          combo: res.combo,
          musicId: res.musicId
        };
        item.status = 'done';
      } else {
        item.status = 'error';
      }
    } catch (e) {
      console.error('Analysis Failed for ' + item.id, e);
      item.status = 'error';
    }

    updateSidebarStatus(item.id);
    if (item.status === 'done') {
      document.getElementById(`sb-title-${item.id}`).innerText = item.data.title;
      if (app.activeItemId === item.id) selectItem(item.id);
    }
  }

  await worker.terminate();
  statusMsg.innerText = '処理完了';
}

async function batchEdit() {
  if (app.selectedIds.size === 0) return;
  openBatchModal('edit');
  const targets = app.allRecords.filter(r => app.selectedIds.has(r.id));
  document.getElementById('batch-status-msg').innerText = '編集データを準備中...';

  for (const rec of targets) {
    const qId = `edit_${rec.id}`;
    const highResUrl = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
    app.editorQueue.push({
      id: qId,
      file: null,
      imgUrl: highResUrl,
      status: 'existing',
      data: {
        title: rec.title,
        level: rec.level,
        diff: rec.difficultyRaw,
        perfect: rec.perfectCount || 0,
        great: rec.greatCount || 0,
        good: 0,
        bad: 0,
        missDetail: rec.missCount || 0,
        totalMiss: rec.missCount || 0,
        combo: rec.comboCount || 0,
        musicId: null
      },
      originalId: rec.id,
      originalParent: rec.parentId
    });
    renderSidebarItem(qId);
  }

  if (app.editorQueue.length > 0) selectItem(app.editorQueue[0].id);
  checkBatchButton();
  document.getElementById('batch-status-msg').innerText = '編集準備完了';
}

async function handleBatchExecution() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = true;
  btn.innerText = '処理中...';
  if (app.currentMode === 'upload') await executeUploads();
  else await executeEdits();
}

function songFolderName(level, difficulty, title) {
  return `${level}${getDifficultyCode(difficulty)} ${title}`;
}

async function executeUploads() {
  let successCount = 0;
  const accessToken = gapi.client.getToken().access_token;
  const rootFolder = await findOrCreateFolder(APP_CONFIG.rootFolderName, null, app.folderCache);
  const fcFolder = await findOrCreateFolder(APP_CONFIG.subFolderName, rootFolder.id, app.folderCache);

  for (const item of [...app.editorQueue]) {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = '送信中'; sbStatus.className = 'upload-status processing'; }

    try {
      if (!item.data.title || !item.data.level) throw new Error('必須項目不足');

      const folderName = songFolderName(item.data.level, item.data.diff, item.data.title);
      const songFolder = await findOrCreateFolder(folderName, fcFolder.id, app.folderCache);
      const fileName = buildFileName(item.data);
      const description = buildResultDescription({
        miss: item.data.totalMiss,
        perfect: item.data.perfect,
        great: item.data.great,
        combo: item.data.combo
      });

      await createDriveFile({
        file: item.file,
        name: fileName,
        parents: [songFolder.id],
        description,
        accessToken
      });

      const bestNotice = maybeNotifyBest(item.data);
      if (bestNotice) app.pendingBestToast.push(bestNotice);

      app.editorQueue = app.editorQueue.filter(q => q.id !== item.id);
      document.getElementById(`sb-${item.id}`)?.remove();
      successCount++;
    } catch (e) {
      console.error(e);
      if (sbStatus) { sbStatus.innerText = '失敗'; sbStatus.className = 'upload-status error'; }
    }
  }
  finishExecution(successCount, 'アップロード');
}

async function executeEdits() {
  let successCount = 0;
  const rootFolder = await findOrCreateFolder(APP_CONFIG.rootFolderName, null, app.folderCache);
  const fcFolder = await findOrCreateFolder(APP_CONFIG.subFolderName, rootFolder.id, app.folderCache);

  for (const item of [...app.editorQueue]) {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = '保存中'; sbStatus.className = 'upload-status processing'; }

    try {
      if (!item.data.title || !item.data.level) throw new Error('必須項目不足');

      const newFolderName = songFolderName(item.data.level, item.data.diff, item.data.title);
      const newFileName = buildFileName(item.data);
      const description = buildResultDescription({
        miss: item.data.totalMiss,
        perfect: item.data.perfect,
        great: item.data.great,
        combo: item.data.combo
      });

      const targetFolder = await findOrCreateFolder(newFolderName, fcFolder.id, app.folderCache);
      const params = { fileId: item.originalId, name: newFileName, description };
      if (targetFolder.id !== item.originalParent) {
        params.addParents = targetFolder.id;
        params.removeParents = item.originalParent;
      }
      await updateDriveFile(params);

      app.editorQueue = app.editorQueue.filter(q => q.id !== item.id);
      document.getElementById(`sb-${item.id}`)?.remove();
      successCount++;
    } catch (e) {
      console.error(e);
      if (sbStatus) { sbStatus.innerText = '失敗'; sbStatus.className = 'upload-status error'; }
    }
  }
  finishExecution(successCount, '更新');
}

function buildFileName(data) {
  const miss = Number(data.totalMiss) || 0;
  return `FC-${miss}`;
}

function maybeNotifyBest(resultData) {
  const key = [normalizeString(resultData.title), normalizeDifficulty(resultData.diff), String(resultData.level ?? '')].join('|');
  const existing = app.selfBestMap.get(key);
  const newRecord = {
    missCount: Number(resultData.totalMiss) || 0,
    comboCount: Number(resultData.combo) || 0,
    perfectCount: Number(resultData.perfect) || 0,
    greatCount: Number(resultData.great) || 0
  };
  if (!existing) return null;
  const compare = compareResults(newRecord, existing);
  if (compare < 0) {
    app.selfBestMap.set(key, { ...newRecord, title: resultData.title, level: resultData.level, difficultyRaw: normalizeDifficulty(resultData.diff) });
    return {
      title: resultData.title,
      message: `自己ベスト更新: ${existing.missCount} → ${newRecord.missCount} miss / C${newRecord.comboCount}`,
      type: 'success',
      icon: 'workspace_premium'
    };
  }
  return null;
}

function finishExecution(count, actionName) {
  if (app.editorQueue.length === 0) {
    alert(`${actionName}完了 (${count}件)`);
    closeBatchModal();
    app.selectedIds.clear();
    updateSelectionUI(app);
    fetchDataFromDrive();
    for (const toast of app.pendingBestToast.splice(0)) {
      showToast(app, toast);
    }
  } else {
    alert(`${count}件 ${actionName}成功。エラー分を確認してください。`);
    checkBatchButton();
  }
}

function openImageModal(src) {
  if (src) {
    document.getElementById('imageModal').style.display = 'flex';
    document.getElementById('modalImg').src = src;
  }
}

function closeImageModal() {
  document.getElementById('imageModal').style.display = 'none';
}


async function main() {
  await loadDb();
  updateDiffOptionColors();
  initSettingsUI(app);
  syncUiFromState();
  setAuthUI(false);

  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); });
  document.getElementById('up-file').addEventListener('change', e => handleFiles(e.target.files));

  document.getElementById('settings-preview-stage').addEventListener('pointerdown', e => {
    if (e.target === document.getElementById('settings-preview-stage')) {
      // keep focus only
    }
  });
}

document.addEventListener('DOMContentLoaded', main);
window.fetchDataFromDrive = fetchDataFromDrive;
window.updateView = updateView;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
