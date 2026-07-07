import { CLIENT_ID, API_KEY, DISCOVERY_DOC, FC_FOLDER_NAME, ROOT_FOLDER_NAME, SCOPES, normalizeDifficultyCode } from './config.js';
import { state, resetDriveCaches } from './state.js';
import { handlePersonalBestUpdates, showToast } from './notify.js';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_FILE_FIELDS = 'id, name, parents, thumbnailLink, modifiedTime';

function escapeDriveQueryValue(value) {
  return String(value).replace(/'/g, "\\'");
}

export function gapiLoaded() {
  if (!window.gapi) return;
  window.gapi.load('client', initializeGapiClient);
}

export async function initializeGapiClient() {
  await window.gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  state.gapiInited = true;
}

export function gisLoaded() {
  if (!window.google?.accounts?.oauth2) return;
  state.tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  state.gisInited = true;
}

export function setAuthUI(isLoggedIn) {
  const signoutButton = document.getElementById('signout_button');
  const uploadButton = document.getElementById('upload_button');
  const authorizeButton = document.getElementById('authorize_button');
  const authStatus = document.getElementById('auth-status');

  if (signoutButton) signoutButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
  if (uploadButton) uploadButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
  if (authorizeButton) authorizeButton.style.display = isLoggedIn ? 'none' : 'inline-flex';
  if (authStatus) authStatus.textContent = isLoggedIn ? 'ログイン済み' : '未ログイン';
}

export function handleAuthClick() {
  if (!state.tokenClient) {
    showToast('Google 認証の初期化中です。少し待ってから再度お試しください。', 'warning');
    return;
  }
  state.tokenClient.callback = async (resp) => {
    if (resp?.error !== undefined) throw resp;
    setAuthUI(true);
    await fetchDataFromDrive();
  };
  const token = window.gapi.client.getToken();
  if (token === null) state.tokenClient.requestAccessToken({ prompt: 'consent' });
  else state.tokenClient.requestAccessToken({ prompt: '' });
}

export function handleSignoutClick() {
  const token = window.gapi?.client?.getToken?.();
  if (token !== null && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token.access_token);
    window.gapi.client.setToken('');
    setAuthUI(false);
    resetDriveCaches();
    state.allRecords = [];
    state.filteredRecords = [];
    state.selectedIds.clear();
    const resultCount = document.getElementById('result-count');
    const grid = document.getElementById('grid');
    if (resultCount) resultCount.textContent = 'ログアウトしました';
    if (grid) grid.innerHTML = '';
    if (window.updateSelectionUI) window.updateSelectionUI();
    if (window.renderGrid) window.renderGrid([]);
  }
}

export async function listAllDriveItems(query, fields) {
  const items = [];
  let pageToken = null;
  do {
    const response = await window.gapi.client.drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
    });
    if (response.result.files) items.push(...response.result.files);
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return items;
}

export async function getFolderByName(name, parentId = null) {
  const cacheKey = `${parentId || 'root'}::${name}`;
  if (state.folderCache.has(cacheKey)) return state.folderCache.get(cacheKey);

  let query = `mimeType = '${DRIVE_FOLDER_MIME}' and name = '${escapeDriveQueryValue(name)}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await window.gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const folder = response.result.files && response.result.files.length > 0 ? response.result.files[0] : null;
  state.folderCache.set(cacheKey, folder);
  return folder;
}

export async function findOrCreateFolder(name, parentId = null) {
  const cacheKey = `${parentId || 'root'}::${name}`;
  if (state.folderCache.has(cacheKey)) return state.folderCache.get(cacheKey);

  const existing = await getFolderByName(name, parentId);
  if (existing) {
    state.folderCache.set(cacheKey, existing);
    return existing;
  }
  const metadata = { name, mimeType: DRIVE_FOLDER_MIME };
  if (parentId) metadata.parents = [parentId];
  const response = await window.gapi.client.drive.files.create({
    resource: metadata,
    fields: 'id, name',
  });
  state.folderCache.set(cacheKey, response.result);
  return response.result;
}

async function ensureRootFolders() {
  const rootFolder = await findOrCreateFolder(ROOT_FOLDER_NAME);
  const fcFolder = await findOrCreateFolder(FC_FOLDER_NAME, rootFolder.id);
  state.rootFolderCache = rootFolder;
  state.fcFolderCache = fcFolder;
  return { rootFolder, fcFolder };
}

async function warmSongFolderIndex(fcFolderId) {
  state.folderIndex = new Map();
  const songFolders = await listAllDriveItems(
    `'${fcFolderId}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`,
    'id, name',
  );
  for (const folder of songFolders) {
    state.folderIndex.set(folder.name, folder);
    state.folderCache.set(`${fcFolderId}::${folder.name}`, folder);
  }
  return songFolders;
}

export async function fetchDataFromDrive() {
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loader-text');
  const resultCount = document.getElementById('result-count');
  if (loader) loader.style.display = 'flex';
  if (resultCount) resultCount.textContent = 'データ取得中...';

  try {
    const rootFolder = await getFolderByName(ROOT_FOLDER_NAME);
    if (!rootFolder) {
      state.allRecords = [];
      state.lastFetchAt = new Date();
      if (window.onDataLoaded) window.onDataLoaded([]);
      return;
    }

    const fcFolder = await getFolderByName(FC_FOLDER_NAME, rootFolder.id);
    if (!fcFolder) {
      state.allRecords = [];
      state.lastFetchAt = new Date();
      if (window.onDataLoaded) window.onDataLoaded([]);
      return;
    }

    state.rootFolderCache = rootFolder;
    state.fcFolderCache = fcFolder;

    if (loaderText) loaderText.textContent = '楽曲フォルダを取得中...';
    await warmSongFolderIndex(fcFolder.id);

    if (state.folderIndex.size === 0) {
      state.allRecords = [];
      state.lastFetchAt = new Date();
      if (window.onDataLoaded) window.onDataLoaded([]);
      return;
    }

    if (loaderText) loaderText.textContent = 'リザルト画像を処理中...';
    const candidateFiles = await listAllDriveItems(
      `name contains 'FC' and mimeType != '${DRIVE_FOLDER_MIME}' and trashed = false`,
      DRIVE_FILE_FIELDS,
    );

    const records = [];
    for (const file of candidateFiles) {
      if (!file.parents || file.parents.length === 0) continue;
      const parentFolder = file.parents.map((id) => state.folderIndex.get(id)).find(Boolean);
      if (!parentFolder) continue;

      const parsed = parseFolderTitle(parentFolder.name);
      if (!parsed) continue;

      const missCount = parseScore(file.name);
      if (missCount === null) continue;

      records.push({
        id: file.id,
        parentId: parentFolder.id,
        title: parsed.title,
        level: parsed.level,
        difficulty: parsed.label,
        difficultyRaw: parsed.code,
        missCount,
        isFC: missCount === 0,
        thumbnail: file.thumbnailLink || null,
        modifiedTime: file.modifiedTime || null,
      });
    }

    state.allRecords = records;
    state.lastFetchAt = new Date();
    if (window.onDataLoaded) window.onDataLoaded(records);
    handlePersonalBestUpdates(records);
  } catch (error) {
    console.error(error);
    if (resultCount) resultCount.textContent = `取得失敗: ${error.message || error}`;
    showToast('Drive データの取得に失敗しました。', 'error');
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

export async function saveUploadBatch(editorQueue) {
  let successCount = 0;
  const accessToken = window.gapi.client.getToken()?.access_token;
  if (!accessToken) throw new Error('アクセストークンがありません');

  const { fcFolder } = await ensureRootFolders();

  const folderLookup = new Map();
  for (const item of editorQueue) {
    const key = `${item.data.level}${item.data.diff} ${item.data.title}`;
    folderLookup.set(key, item);
  }

  for (const item of [...editorQueue]) {
    const statusEl = document.getElementById(`sb-status-${item.id}`);
    if (statusEl) {
      statusEl.textContent = '送信中';
      statusEl.className = 'upload-status processing';
    }

    try {
      if (!item.data.title || !item.data.level) throw new Error('必須項目不足');

      const folderName = `${item.data.level}${item.data.diff} ${item.data.title}`;
      const songFolder = await findOrCreateFolder(folderName, fcFolder.id);
      const fileName = item.data.totalMiss === 0 ? 'FC' : `FC-${item.data.totalMiss}`;

      const meta = { name: fileName, parents: [songFolder.id] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', item.file);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
        body: form,
      });

      if (!response.ok) throw new Error(response.statusText);

      state.folderIndex.set(songFolder.name, songFolder);
      const indexKey = `${fcFolder.id}::${songFolder.name}`;
      state.folderCache.set(indexKey, songFolder);

      successCount += 1;
    } catch (error) {
      console.error(error);
      if (statusEl) {
        statusEl.textContent = '失敗';
        statusEl.className = 'upload-status error';
      }
      continue;
    }

    removeEditorQueueItem(item.id);
  }

  return successCount;
}

export async function saveEditBatch(editorQueue) {
  let successCount = 0;
  const { fcFolder } = await ensureRootFolders();

  for (const item of [...editorQueue]) {
    const statusEl = document.getElementById(`sb-status-${item.id}`);
    if (statusEl) {
      statusEl.textContent = '保存中';
      statusEl.className = 'upload-status processing';
    }

    try {
      if (!item.data.title || !item.data.level) throw new Error('必須項目不足');

      const newFolderName = `${item.data.level}${item.data.diff} ${item.data.title}`;
      const newFileName = item.data.totalMiss === 0 ? 'FC' : `FC-${item.data.totalMiss}`;
      const targetFolder = await findOrCreateFolder(newFolderName, fcFolder.id);

      const params = { fileId: item.originalId, resource: { name: newFileName } };
      if (targetFolder.id !== item.originalParent) {
        params.addParents = targetFolder.id;
        params.removeParents = item.originalParent;
      }
      await window.gapi.client.drive.files.update(params);

      successCount += 1;
    } catch (error) {
      console.error(error);
      if (statusEl) {
        statusEl.textContent = '失敗';
        statusEl.className = 'upload-status error';
      }
      continue;
    }

    removeEditorQueueItem(item.id);
  }

  return successCount;
}

function removeEditorQueueItem(id) {
  state.editorQueue = state.editorQueue.filter((item) => item.id !== id);
  const sidebar = document.getElementById(`sb-${id}`);
  if (sidebar) sidebar.remove();
  if (state.activeItemId === id) {
    state.activeItemId = null;
  }
}

export async function deleteDriveFiles(ids) {
  for (const id of ids) {
    await window.gapi.client.drive.files.delete({ fileId: id });
  }
}

export function parseFolderTitle(folderName) {
  if (!folderName) return null;
  const patterns = [
    /^(\d+)\s*(APPEND|MASTER|EXPERT|HARD|NORMAL|EASY)\s+(.+)$/i,
    /^(\d+)(EZ|NM|A|M|E|H)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (!match) continue;
    const level = parseInt(match[1], 10);
    const raw = String(match[2]).toUpperCase();
    const title = match[3];

    const map = {
      A: { code: 'A', label: 'APPEND', key: 'append' },
      APPEND: { code: 'A', label: 'APPEND', key: 'append' },
      M: { code: 'M', label: 'MASTER', key: 'master' },
      MASTER: { code: 'M', label: 'MASTER', key: 'master' },
      E: { code: 'E', label: 'EXPERT', key: 'expert' },
      EXPERT: { code: 'E', label: 'EXPERT', key: 'expert' },
      H: { code: 'H', label: 'HARD', key: 'hard' },
      HARD: { code: 'H', label: 'HARD', key: 'hard' },
      NM: { code: 'NM', label: 'NORMAL', key: 'normal' },
      NORMAL: { code: 'NM', label: 'NORMAL', key: 'normal' },
      EZ: { code: 'EZ', label: 'EASY', key: 'easy' },
      EASY: { code: 'EZ', label: 'EASY', key: 'easy' },
    };

    const diff = map[raw];
    if (!diff) continue;

    return {
      level,
      code: diff.code,
      label: diff.label,
      key: diff.key,
      title,
    };
  }

  return null;
}

export function parseScore(fileName) {
  const match = String(fileName || '').match(/^FC(?:-(\d+))?/);
  if (!match) return null;
  return match[1] === undefined ? 0 : parseInt(match[1], 10);
}

export function resetFetchedRecords() {
  state.allRecords = [];
  state.filteredRecords = [];
  state.lastFetchAt = null;
  resetDriveCaches();
}
