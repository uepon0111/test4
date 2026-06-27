// js/drive.js

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'セカイ記録帳';

export class Drive {
  constructor(auth) {
    this.auth     = auth;
    this.folderId = null;
  }

  async _headers() {
    const token = await this.auth.getToken();
    if (!token) throw new Error('Googleにサインインしていません');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    };
  }

  async _json(method, path, body) {
    const headers = await this._headers();
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`Drive API ${r.status}: ${err.error?.message || r.statusText}`);
    }
    if (r.status === 204) return null;
    return r.json();
  }

  /** フォルダの確保（なければ作成） */
  async ensureFolder() {
    if (this.folderId) return this.folderId;

    const q = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const res = await this._json('GET', `/files?q=${q}&fields=files(id,name)`);
    if (res.files?.length) {
      this.folderId = res.files[0].id;
      return this.folderId;
    }

    const folder = await this._json('POST', '/files', {
      name:     FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    });
    this.folderId = folder.id;
    return this.folderId;
  }

  /**
   * 画像Blobをアップロード
   * @returns {id, name} Drive ファイル情報
   */
  async uploadImage(blob, filename) {
    const folderId = await this.ensureFolder();
    const token    = await this.auth.getToken();
    if (!token) throw new Error('未認証');

    const metadata = JSON.stringify({ name: filename, parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file',     blob);

    const r = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
    });
    if (!r.ok) throw new Error(`アップロード失敗: ${r.statusText}`);
    return r.json();
  }

  /** ファイルを削除（ゴミ箱へ移動） */
  async deleteFile(fileId) {
    if (!fileId) return;
    try {
      await this._json('DELETE', `/files/${fileId}`);
    } catch (e) {
      console.warn('Drive削除エラー:', e);
    }
  }

  /** ファイル一覧取得 */
  async listFiles() {
    const folderId = await this.ensureFolder();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await this._json('GET', `/files?q=${q}&fields=files(id,name,size,createdTime)&pageSize=1000`);
    return res.files || [];
  }

  isAvailable() { return this.auth.isSignedIn(); }
}
