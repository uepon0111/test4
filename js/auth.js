/*
 * auth.js
 * -----------------------------------------------------------------------
 * Google へのログイン/ログアウト処理。
 * 追加点:
 *   - access token を sessionStorage に短期保存し、ページ移動後も同一セッションで復帰
 *   - settings.html との行き来で再ログインを要求されにくくする
 * -----------------------------------------------------------------------
 */

const SESSION_KEY_AUTH_TOKEN = 'prsk_auth_token_v1';

function saveAuthTokenToSession(token) {
  try {
    if (!token || !token.access_token) return;
    const payload = { ...token, savedAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY_AUTH_TOKEN, JSON.stringify(payload));
  } catch (e) {
    console.warn('認証情報の保存に失敗しました', e);
  }
}

function loadAuthTokenFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_AUTH_TOKEN);
    if (!raw) return null;
    const token = JSON.parse(raw);
    if (!token || !token.access_token) return null;
    const savedAt = Number(token.savedAt || 0);
    const expiresIn = Number(token.expires_in || 0);
    if (savedAt && expiresIn) {
      const ageMs = Date.now() - savedAt;
      if (ageMs > Math.max(0, (expiresIn - 120)) * 1000) {
        sessionStorage.removeItem(SESSION_KEY_AUTH_TOKEN);
        return null;
      }
    }
    return token;
  } catch (e) {
    console.warn('認証情報の読み込みに失敗しました', e);
    return null;
  }
}

function clearAuthTokenFromSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY_AUTH_TOKEN);
  } catch (e) {
    console.warn('認証情報の削除に失敗しました', e);
  }
}

async function restoreSavedAuthSession() {
  try {
    if (!window.__prskAppReady) {
      window.__prskPendingRestore = true;
      return false;
    }
    const token = loadAuthTokenFromSession();
    if (!token || !token.access_token || !gapiInited || !window.gapi || !gapi.client) return false;
    gapi.client.setToken(token);
    setAuthUI(true);
    if (typeof fetchDataFromDrive === 'function') {
      await fetchDataFromDrive();
    }
    return true;
  } catch (e) {
    console.warn('保存済みセッションの復元に失敗しました', e);
    return false;
  }
}

function gapiLoaded() { gapi.load('client', initializeGapiClient); }

async function initializeGapiClient() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
  gapiInited = true;
  await restoreSavedAuthSession();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '' });
  gisInited = true;
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    saveAuthTokenToSession(resp);
    setAuthUI(true);
    await fetchDataFromDrive();
  };
  if (gapi.client.getToken() === null) tokenClient.requestAccessToken({ prompt: 'consent' });
  else tokenClient.requestAccessToken({ prompt: '' });
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    clearAuthTokenFromSession();
    setAuthUI(false);
    document.getElementById('result-count').innerText = 'ログアウトしました';
    document.getElementById('grid').innerHTML = '';
    allRecords = [];
    selectedIds.clear();
    updateSelectionUI();
    resetDriveFolderCache();
    hideNotificationArea();
  }
}

function setAuthUI(isLoggedIn) {
  document.getElementById('signout_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('upload_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('authorize_button').style.display = isLoggedIn ? 'none' : 'inline-flex';
  document.getElementById('auth-status').innerText = isLoggedIn ? 'ログイン済み' : '未ログイン';
}
