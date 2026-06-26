'use strict';

/* ========== GOOGLE DRIVE API ========== */
const Drive = (() => {
  const API  = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  let _folderId = null;

  /* Base fetch with auth header */
  async function req(url, opts = {}) {
    const token = Auth.getToken();
    if (!token) throw new Error('未ログイン');
    const resp = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      throw new Error(`Drive API error ${resp.status}: ${msg.substring(0, 120)}`);
    }
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) return resp.json();
    return resp;
  }

  /* Get or create the app folder in Drive */
  async function getFolder() {
    if (_folderId) return _folderId;

    /* Look for existing */
    const q = encodeURIComponent(
      `name='${CONFIG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const res = await req(`${API}/files?q=${q}&fields=files(id,name)&spaces=drive`);
    if (res.files && res.files.length > 0) {
      _folderId = res.files[0].id;
      return _folderId;
    }

    /* Create */
    const folder = await req(`${API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: CONFIG.DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    _folderId = folder.id;
    return _folderId;
  }

  return {
    /* Upload image file to Drive, returns { id, name } */
    async uploadImage(file, fileName) {
      const fid  = await getFolder();
      const meta = { name: fileName, parents: [fid] };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', file);

      const result = await req(
        `${UPLOAD}/files?uploadType=multipart&fields=id,name`,
        { method: 'POST', body: form }
      );
      return result;
    },

    /* Download file content as blob URL */
    async downloadFile(fileId) {
      const resp = await req(`${API}/files/${fileId}?alt=media`);
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    },

    /* Permanently delete a file */
    async deleteFile(fileId) {
      const token = Auth.getToken();
      if (!token) return;
      await fetch(`${API}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },

    /* Save metadata JSON (upsert) */
    async saveMetadata(data) {
      const fid    = await getFolder();
      const fname  = 'metadata.json';
      const q = encodeURIComponent(`name='${fname}' and '${fid}' in parents and trashed=false`);
      const existing = await req(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);

      const content = JSON.stringify(data, null, 0);
      const blob    = new Blob([content], { type: 'application/json' });

      if (existing.files && existing.files.length > 0) {
        const fileId = existing.files[0].id;
        await req(`${UPLOAD}/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: blob,
        });
      } else {
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: fname, parents: [fid] })], { type: 'application/json' }));
        form.append('file', blob);
        await req(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', body: form });
      }
    },

    /* Load metadata JSON */
    async loadMetadata() {
      const fid = await getFolder();
      const q   = encodeURIComponent(`name='metadata.json' and '${fid}' in parents and trashed=false`);
      const res = await req(`${API}/files?q=${q}&fields=files(id)&spaces=drive`);
      if (!res.files || res.files.length === 0) return null;
      const fileResp = await req(`${API}/files/${res.files[0].id}?alt=media`);
      const text     = await fileResp.text();
      return JSON.parse(text);
    },

    /* Clear cached folder ID (call after sign-out) */
    clearCache() { _folderId = null; },

    get isAvailable() { return Auth.isSignedIn(); },
  };
})();
