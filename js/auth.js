import { CLIENT_ID, API_KEY, SCOPES, DISCOVERY_DOC } from './config.js';

let _onLogin  = null;
let _onLogout = null;
let _tokenClient = null;

/**
 * Initialize Google auth.
 * @param {{ onLogin: (email:string)=>void, onLogout: ()=>void }} callbacks
 */
export async function initAuth({ onLogin, onLogout }) {
  _onLogin  = onLogin;
  _onLogout = onLogout;

  // Wait for gapi to be available
  await gapiLoad();
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });

  // Wait for GIS (google.accounts) if not yet loaded
  await new Promise(resolve => {
    if (typeof google !== 'undefined' && google.accounts) { resolve(); return; }
    let n = 0;
    const t = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts) { clearInterval(t); resolve(); }
      else if (++n > 100) { clearInterval(t); resolve(); }
    }, 100);
  });

  // GIS token client
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleTokenResponse,
  });

  // Check for existing token in sessionStorage
  const saved = sessionStorage.getItem('prsk_token');
  if (saved) {
    try {
      const tok = JSON.parse(saved);
      if (tok.expiry_date > Date.now()) {
        gapi.client.setToken(tok);
        await fetchUserEmail();
        return;
      }
    } catch (_) {}
  }
}

function gapiLoad() {
  return new Promise(resolve => {
    // gapi script might not have loaded yet if network is slow
    if (typeof gapi !== 'undefined') {
      gapi.load('client', resolve);
    } else {
      // Poll until gapi is available (max 10s)
      let attempts = 0;
      const check = setInterval(() => {
        if (typeof gapi !== 'undefined') {
          clearInterval(check);
          gapi.load('client', resolve);
        } else if (++attempts > 100) {
          clearInterval(check);
          console.error('[Auth] gapi script failed to load');
          resolve(); // continue anyway to show error
        }
      }, 100);
    }
  });
}

async function handleTokenResponse(resp) {
  if (resp.error) {
    console.error('Auth error:', resp.error);
    return;
  }
  // Store token with expiry
  const tok = gapi.client.getToken();
  tok.expiry_date = Date.now() + (resp.expires_in ?? 3600) * 1000;
  sessionStorage.setItem('prsk_token', JSON.stringify(tok));
  await fetchUserEmail();
}

async function fetchUserEmail() {
  try {
    const resp = await gapi.client.request({
      path: 'https://www.googleapis.com/oauth2/v1/userinfo',
    });
    const email = resp.result.email ?? '';
    _onLogin?.(email);
  } catch (_) {
    _onLogin?.('');
  }
}

/** Trigger the Google login popup. */
export function signIn() {
  if (!_tokenClient) { console.error('Auth not initialized'); return; }
  _tokenClient.requestAccessToken({ prompt: 'consent' });
}

/** Sign out the current user. */
export function signOut() {
  const tok = gapi.client.getToken();
  if (tok) {
    google.accounts.oauth2.revoke(tok.access_token);
    gapi.client.setToken(null);
  }
  sessionStorage.removeItem('prsk_token');
  _onLogout?.();
}

/** Returns true if a valid, non-expired token exists. */
export function isAuthorized() {
  const tok = gapi.client.getToken();
  if (!tok) return false;
  const saved = sessionStorage.getItem('prsk_token');
  if (!saved) return false;
  try {
    const { expiry_date } = JSON.parse(saved);
    return expiry_date > Date.now();
  } catch (_) { return false; }
}
