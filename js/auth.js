'use strict';

/* ========== GOOGLE AUTH (Identity Services) ========== */
const Auth = (() => {
  let _tokenClient = null;
  let _token       = null;  // { access_token, expires_at }
  let _userInfo    = null;  // { name, email }
  const _listeners = [];

  function notify() { _listeners.forEach(fn => fn(isSignedIn(), _userInfo)); }

  function isSignedIn() { return !!_token && _token.expires_at > Date.now(); }

  /* Initialise with the Google OAuth client */
  function init(clientId) {
    return new Promise(resolve => {
      if (!clientId) { resolve(); return; }
      if (typeof google === 'undefined' || !google.accounts) {
        // Retry once GIS script loads
        window.addEventListener('load', () => init(clientId).then(resolve));
        return;
      }
      try {
        _tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope:     CONFIG.DRIVE_SCOPE,
          callback:  _handleTokenResponse,
        });
      } catch (e) {
        console.warn('Auth: could not init token client:', e.message);
      }
      resolve();
    });
  }

  async function _handleTokenResponse(resp) {
    if (resp.error) {
      console.error('Auth error:', resp.error, resp.error_description);
      Notification.show('ログインに失敗しました: ' + resp.error_description, 'error');
      return;
    }
    _token = {
      access_token: resp.access_token,
      expires_at:   Date.now() + (resp.expires_in || 3600) * 1000,
    };
    await DB.setSetting('authToken', _token);
    _userInfo = await _fetchUserInfo(_token.access_token);
    await DB.setSetting('authUserInfo', _userInfo);
    notify();
    Notification.show('Googleアカウントでログインしました', 'success');
  }

  async function _fetchUserInfo(accessToken) {
    try {
      const res  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return { name: data.name || '', email: data.email || '' };
    } catch (_) { return null; }
  }

  return {
    async init(clientId) {
      CONFIG.GOOGLE_CLIENT_ID = clientId || '';
      await init(clientId);
      /* Try restoring persisted token */
      try {
        const saved = await DB.getSetting('authToken');
        if (saved && saved.expires_at > Date.now()) {
          _token    = saved;
          _userInfo = await DB.getSetting('authUserInfo');
          notify();
        }
      } catch (_) { /* ignore */ }
    },

    signIn() {
      if (!_tokenClient) {
        Notification.show('設定でGoogle Client IDを登録してください', 'warning', 4000);
        return;
      }
      _tokenClient.requestAccessToken({ prompt: 'consent' });
    },

    async signOut() {
      if (_token) {
        try { google.accounts.oauth2.revoke(_token.access_token, () => {}); } catch (_) {}
      }
      _token    = null;
      _userInfo = null;
      await DB.setSetting('authToken',    null);
      await DB.setSetting('authUserInfo', null);
      notify();
      Notification.show('ログアウトしました', 'info');
    },

    getToken()   { return isSignedIn() ? _token.access_token : null; },
    isSignedIn() { return isSignedIn(); },
    getUserInfo(){ return _userInfo; },

    onChange(fn) { _listeners.push(fn); },
  };
})();
