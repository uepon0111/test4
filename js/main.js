import { initAuth, signIn }    from './auth.js';
import {
  initDriveStructure, loadDb, autoDeleteExpiredTrash,
} from './drive/database.js';
import { refreshThumbnailMap, deleteResultImage } from './drive/imageStorage.js';
import { loadMasterData }        from './musicDb/masterData.js';
import { initNotifications, notify } from './notifications.js';
import { initCardList, refreshCardList } from './views/cardList.js';
import { initFilterPanel, initModeToggle, initSortControls, initSearchBar } from './views/filterPanel.js';
import { initUploadModal, openUploadModal, closeUploadModal } from './views/uploadWorkspace.js';
import { initEditModal }         from './views/editRecord.js';
import { initTrashView, openTrash } from './views/trashView.js';
import { initSettingsView, openSettings } from './views/settingsView.js';
import { initCalibration }       from './views/calibration.js';

async function boot() {
  initNotifications();

  // Start loading master data in background (doesn't block login)
  loadMasterData().catch(e => console.warn('[MasterData]', e));

  // Init auth (may auto-login from session)
  await initAuth({ onLogin: handleLogin, onLogout: handleLogout });

  // Global event listeners (always available)
  document.getElementById('btn-signin')?.addEventListener('click', signIn);
  document.getElementById('btn-upload')?.addEventListener('click', openUploadModal);
  document.getElementById('btn-trash')?.addEventListener('click', openTrash);
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);

  // Init modals (build DOM event wiring once)
  initUploadModal();
  initEditModal();
  initTrashView();
  initSettingsView();
  initCalibration();

  // Image preview modal close
  document.getElementById('preview-close')?.addEventListener('click', () => {
    const m = document.getElementById('modal-image-preview');
    if (m) {
      const url = m.dataset.blobUrl;
      if (url) URL.revokeObjectURL(url);
      delete m.dataset.blobUrl;
      m.hidden = true;
    }
  });
  document.getElementById('modal-image-preview')?.addEventListener('click', e => {
    if (e.target.id === 'modal-image-preview') {
      const url = e.target.dataset.blobUrl;
      if (url) URL.revokeObjectURL(url);
      e.target.hidden = true;
    }
  });

  // Filter panel, sort, search
  initModeToggle();
  initSortControls();
  initSearchBar();
  initFilterPanel();
}

async function handleLogin(email) {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('user-email').textContent = email || '';

  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) loadingEl.hidden = false;

  try {
    await initDriveStructure();
    await loadDb();
    await autoDeleteExpiredTrash(deleteResultImage);
    await refreshThumbnailMap();
    initCardList();
    refreshCardList();
  } catch (e) {
    console.error('[Boot]', e);
    notify('error', '初期化に失敗しました: ' + (e.message ?? e));
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }
}

function handleLogout() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

boot();
