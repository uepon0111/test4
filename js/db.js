// js/db.js
import { CONFIG } from './config.js';

export class DB {
  constructor() {
    this._db = null;
  }

  async init() {
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVer = e.oldVersion;

        if (oldVer < 1) {
          const recStore = db.createObjectStore('records', { keyPath: 'id' });
          recStore.createIndex('by_date',   'addedAt',              { unique: false });
          recStore.createIndex('by_song',   ['songId','difficulty'], { unique: false });
          recStore.createIndex('by_level',  'level',                { unique: false });
          recStore.createIndex('by_title',  'title',                { unique: false });

          const trashStore = db.createObjectStore('trash', { keyPath: 'id' });
          trashStore.createIndex('by_trashed', 'trashedAt', { unique: false });

          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess  = e => resolve(e.target.result);
      req.onerror    = ()  => reject(req.error);
      req.onblocked  = ()  => reject(new Error('DB ブロック中'));
    });
  }

  /* ─── 汎用ヘルパー ─── */
  _store(name, mode = 'readonly') {
    return this._db.transaction([name], mode).objectStore(name);
  }

  _req(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  _getAll(store) {
    return this._req(this._store(store).getAll());
  }

  _get(store, key) {
    return this._req(this._store(store).get(key));
  }

  _put(store, value) {
    return this._req(this._store(store, 'readwrite').put(value));
  }

  _delete(store, key) {
    return this._req(this._store(store, 'readwrite').delete(key));
  }

  /* ─── 記録 ─── */
  getAllRecords()         { return this._getAll('records'); }
  getRecord(id)          { return this._get('records', id); }
  putRecord(record)      { return this._put('records', record); }
  deleteRecord(id)       { return this._delete('records', id); }

  /* ─── ゴミ箱 ─── */
  getAllTrash()           { return this._getAll('trash'); }
  getTrashItem(id)       { return this._get('trash', id); }
  putTrashItem(item)     { return this._put('trash', item); }
  deleteTrashItem(id)    { return this._delete('trash', id); }

  /** 期限切れのゴミ箱アイテムIDを返す */
  async getExpiredTrashIds() {
    const items = await this.getAllTrash();
    const limit = Date.now() - CONFIG.TRASH_DAYS * 86400000;
    return items.filter(i => i.trashedAt < limit).map(i => i.id);
  }

  /* ─── 設定 ─── */
  async getSetting(key, defaultVal = null) {
    const row = await this._get('settings', key);
    return row ? row.value : defaultVal;
  }

  async setSetting(key, value) {
    return this._put('settings', { key, value });
  }

  async getAllSettings() {
    const rows = await this._getAll('settings');
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    return obj;
  }

  /* ─── ユーティリティ ─── */

  /** 記録 → ゴミ箱へ移動 */
  async moveToTrash(id) {
    const rec = await this.getRecord(id);
    if (!rec) return;
    await this.deleteRecord(id);
    await this.putTrashItem({ ...rec, trashedAt: Date.now() });
  }

  /** ゴミ箱 → 記録へ復元 */
  async restoreFromTrash(id) {
    const item = await this.getTrashItem(id);
    if (!item) return;
    const { trashedAt: _t, ...rec } = item;
    await this.putRecord(rec);
    await this.deleteTrashItem(id);
  }

  /** 全ゴミ箱を件数付きで返す */
  async getTrashCount() {
    const items = await this.getAllTrash();
    return items.length;
  }
}
