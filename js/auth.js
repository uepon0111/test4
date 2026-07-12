/*
 * auth.js
 * -----------------------------------------------------------------------
 * Google へのログイン/ログアウト処理。
 * ログイン状態は sessionStorage にも保持して、settings.html への移動/復帰で
 * 画面をまたいでも再読み込み後に復元できるようにしています。
 * -----------------------------------------------------------------------
 */

const AUTH_TOKEN_STORAGE_KEY = 'prsk_drive_access_token_v1';
let authSessionRestoreDone = false;

function readStoredAuthToken() {
  try {
    const raw = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.warn('保存済み認証トークンの読み込みに失敗しました', e);
    return null;
  }
}

function saveAuthToken(token) {
  try {
    if (!token) return;
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch (e) {
    console.warn('認証トークンの保存に失敗しました', e);
  }
}

function clearStoredAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch (e) {
    console.warn('認証トークンの削除に失敗しました', e);
  }
}

function restoreAuthSessionIfAvailable() {
  try {
    if (authSessionRestoreDone) return true;
    const token = readStoredAuthToken();
    if (!token || !gapi || !gapi.client || typeof gapi.client.setToken !== 'function') return false;
    gapi.client.setToken(token);
    setAuthUI(true);
    if (typeof fetchDataFromDrive === 'function') {
      authSessionRestoreDone = true;
      fetchDataFromDrive();
      return true;
    }
    return false;
  } catch (e) {
    console.warn('保存済みセッションの復元に失敗しました', e);
    return false;
  }
}

function gapiLoaded() { gapi.load('client', initializeGapiClient); }

async function initializeGapiClient() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
  gapiInited = true;
  restoreAuthSessionIfAvailable();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '' });
  gisInited = true;
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    if (resp.access_token) gapi.client.setToken({ access_token: resp.access_token });
    setAuthUI(true);
    saveAuthToken(gapi.client.getToken() || (resp.access_token ? { access_token: resp.access_token } : null));
    await fetchDataFromDrive();
  };
  if (gapi.client.getToken() === null) tokenClient.requestAccessToken({ prompt: 'consent' });
  else tokenClient.requestAccessToken({ prompt: '' });
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(null);
    setAuthUI(false);
    document.getElementById('result-count').innerText = 'ログアウトしました';
    document.getElementById('grid').innerHTML = '';
    allRecords = [];
    selectedIds.clear();
    updateSelectionUI();
    resetDriveFolderCache();
    hideNotificationArea();
    clearStoredAuthToken();
  }
}

function setAuthUI(isLoggedIn) {
  document.getElementById('signout_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('upload_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('authorize_button').style.display = isLoggedIn ? 'none' : 'inline-flex';
  document.getElementById('auth-status').innerText = isLoggedIn ? 'ログイン済み' : '未ログイン';
}
