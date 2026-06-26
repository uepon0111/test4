'use strict';

/* ========== INDEXED DB ========== */
const DB = (() => {
  const NAME    = 'proseka-result-db';
  const VERSION = 1;
  const RESULTS  = 'results';
  const SETTINGS = 'settings';

  let _db = null;

  /* Open (or reuse) database */
  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(RESULTS)) {
          const s = db.createObjectStore(RESULTS, { keyPath: 'id' });
          s.createIndex('addedAt',  'addedAt',  { unique: false });
          s.createIndex('deleted',  'deleted',  { unique: false });
          s.createIndex('musicId',  'musicId',  { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS)) {
          db.createObjectStore(SETTINGS, { keyPath: 'key' });
        }
      };

      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /* Generic store operation */
  function txOp(storeName, mode, opFn) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req   = opFn(store);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    }));
  }

  /* Bulk write in one transaction */
  function bulkPut(storeName, items) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve(items.length);
      tx.onerror    = e => reject(e.target.error);
    }));
  }

  return {
    /* ---- Results ---- */
    getAllResults() {
      return open().then(db => new Promise((resolve, reject) => {
        const tx  = db.transaction(RESULTS, 'readonly');
        const req = tx.objectStore(RESULTS).getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror   = e => reject(e.target.error);
      }));
    },

    getResult(id) {
      return txOp(RESULTS, 'readonly', s => s.get(id));
    },

    saveResult(result) {
      return txOp(RESULTS, 'readwrite', s => s.put(result));
    },

    deleteResult(id) {
      return txOp(RESULTS, 'readwrite', s => s.delete(id));
    },

    bulkSaveResults(results) {
      return bulkPut(RESULTS, results);
    },

    /* ---- Settings ---- */
    getSetting(key) {
      return txOp(SETTINGS, 'readonly', s => s.get(key))
        .then(rec => (rec ? rec.value : null))
        .catch(() => null);
    },

    setSetting(key, value) {
      return txOp(SETTINGS, 'readwrite', s => s.put({ key, value }));
    },

    deleteSetting(key) {
      return txOp(SETTINGS, 'readwrite', s => s.delete(key));
    },
  };
})();
