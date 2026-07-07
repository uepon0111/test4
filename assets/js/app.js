import { setDbData as saveDbData } from './state.js';
import {
  gapiLoaded,
  gisLoaded,
  handleAuthClick,
  handleSignoutClick,
  setAuthUI,
  fetchDataFromDrive,
} from './drive.js';
import {
  renderGrid,
  renderVirtualGrid,
  onDataLoaded,
  openImageModal,
  closeImageModal,
  openBatchModal,
  closeBatchModal,
  handleFiles,
  batchEdit,
  renderSidebarItem,
  selectItem,
  updateCurrentItem,
  updateView,
  updateSidebarStatus,
  removeBatchItem,
  checkBatchButton,
  runBatchAnalysis,
  reanalyzeCurrentItem,
  analyzeAllInBatch,
  handleBatchExecution,
  toggleSelectMode,
  toggleSelection,
  updateSelectionUI,
  clearSelection,
  individualEdit,
  individualDelete,
  batchDelete,
  updateDiffOptions,
} from './render.js';
import {
  openSettingsModal,
  closeSettingsModal,
  saveSettingsFromForm,
  resetSettingsToDefault,
  requestNotificationPermission,
  bindSettingsUI,
} from './settings.js';
import { showToast } from './notify.js';

async function loadSongDatabase() {
  try {
    const [musicsResp, diffsResp] = await Promise.all([
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musics.json'),
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json'),
    ]);
    const musics = await musicsResp.json();
    const diffs = await diffsResp.json();
    saveDbData(musics, diffs);
  } catch (error) {
    console.error('DB Error', error);
    showToast('楽曲DBの読み込みに失敗しました。', 'warning');
  }
}

function bindDomEvents() {
  const dropZone = document.getElementById('drop-zone');
  const upFile = document.getElementById('up-file');
  const grid = document.getElementById('grid');

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });
  }

  if (upFile) {
    upFile.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  if (grid) {
    grid.addEventListener('scroll', () => renderVirtualGrid());
    window.addEventListener('resize', () => renderVirtualGrid());
  }

  [
    'filter-fc',
    'filter-miss-min',
    'filter-miss-max',
    'filter-diff',
    'filter-level',
    'filter-title',
    'sort-order',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateView);
    if (el && el.tagName === 'INPUT') el.addEventListener('input', updateView);
  });

  updateDiffOptions();
  bindSettingsUI();
}

function exposeGlobals() {
  Object.assign(window, {
    handleAuthClick,
    handleSignoutClick,
    fetchDataFromDrive,
    onDataLoaded,
    openImageModal,
    closeImageModal,
    openBatchModal,
    closeBatchModal,
    handleFiles,
    batchEdit,
    renderSidebarItem,
    selectItem,
    updateCurrentItem,
    updateView,
    updateSidebarStatus,
    removeBatchItem,
    checkBatchButton,
    runBatchAnalysis,
    reanalyzeCurrentItem,
    analyzeAllInBatch,
    handleBatchExecution,
    toggleSelectMode,
    toggleSelection,
    updateSelectionUI,
    clearSelection,
    individualEdit,
    individualDelete,
    batchDelete,
    openSettingsModal,
    closeSettingsModal,
    saveSettingsFromForm,
    resetSettingsToDefault,
    requestNotificationPermission,
  });
  window.fetchDataFromDrive = fetchDataFromDrive;
  window.__gapiLoadedImpl = gapiLoaded;
  window.__gisLoadedImpl = gisLoaded;
  if (window.__pendingGapiInit) gapiLoaded();
  if (window.__pendingGisInit) gisLoaded();
}

function bindActionButtons() {
  const settingsButton = document.getElementById('btn-open-settings');
  const saveSettingsButton = document.getElementById('btn-save-settings');
  const resetSettingsButton = document.getElementById('btn-reset-settings');
  const notifButton = document.getElementById('btn-request-notification');
  const closeSettingsButtons = document.querySelectorAll('[data-close-settings]');
  const grid = document.getElementById('grid');

  settingsButton?.addEventListener('click', openSettingsModal);
  saveSettingsButton?.addEventListener('click', saveSettingsFromForm);
  resetSettingsButton?.addEventListener('click', resetSettingsToDefault);
  notifButton?.addEventListener('click', requestNotificationPermission);
  closeSettingsButtons.forEach((button) => button.addEventListener('click', closeSettingsModal));

}

async function init() {
  exposeGlobals();
  bindDomEvents();
  bindActionButtons();
  setAuthUI(false);
  renderGrid([]);
  await loadSongDatabase();
  updateDiffOptions();
}

document.addEventListener('DOMContentLoaded', init);
