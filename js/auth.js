// js/auth.js

export class Auth {
  constructor() {
    this.accessToken    = null;
    this.tokenExpiry    = 0;
    this.tokenClient    = null;
    this.clientId       = null;
    this.initialized    = false;
    this.onStateChange  = null;   // (isSignedIn) => void
    this._resolveToken  = null;
  }

  /** Google APIクライアントIDをセットして初期化 */
  async init(clientId) {
    if (!clientId || !clientId.trim()) return;
    this.clientId = clientId.trim();

    // GIS ライブラリの読み込み待ち
    await this._waitForGIS();
    if (!window.google?.accounts?.oauth2) return;

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.error) {
          console.error('Google OAuth エラー:', resp.error);
          if (this._resolveToken) { this._resolveToken(null); this._resolveToken = null; }
          if (this.onStateChange) this.onStateChange(false);
          return;
        }
        this.accessToken = resp.access_token;
        this.tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000 - 60000;
        if (this._resolveToken) { this._resolveToken(this.accessToken); this._resolveToken = null; }
        if (this.onStateChange) this.onStateChange(true);
      },
    });

    this.initialized = true;
  }

  _waitForGIS() {
    return new Promise(resolve => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const t = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(t); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(t); resolve(); }, 8000);
    });
  }

  /** サインイン（Drive API アクセストークン取得） */
  signIn() {
    if (!this.initialized || !this.tokenClient) return Promise.resolve(null);
    return new Promise(resolve => {
      this._resolveToken = resolve;
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  /** サイレントトークン取得（すでに認証済みの場合） */
  silentSignIn() {
    if (!this.initialized || !this.tokenClient) return Promise.resolve(null);
    return new Promise(resolve => {
      this._resolveToken = resolve;
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  /** サインアウト */
  signOut() {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = null;
    this.tokenExpiry = 0;
    if (this.onStateChange) this.onStateChange(false);
  }

  isSignedIn()    { return !!this.accessToken && Date.now() < this.tokenExpiry; }
  isInitialized() { return this.initialized; }

  /** 有効なアクセストークンを取得（期限切れなら再取得） */
  async getToken() {
    if (this.isSignedIn()) return this.accessToken;
    if (this.initialized) return this.silentSignIn();
    return null;
  }
}
