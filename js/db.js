'use strict';
/* ============================================================
   db.js – IndexedDB ラッパー
   ============================================================ */
const DB = (() => {
  const DB_NAME = 'TuneVaultDB';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks'))
          db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audioBlobs'))
          db.createObjectStore('audioBlobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('thumbnails'))
          db.createObjectStore('thumbnails', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('playlists'))
          db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tags'))
          db.createObjectStore('tags', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('artists'))
          db.createObjectStore('artists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('playLogs'))
          db.createObjectStore('playLogs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings'))
          db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror  = e => reject(e.target.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function getAllFrom(storeName) {
    return reqToPromise(tx(storeName).getAll());
  }

  function putTo(storeName, value) {
    return reqToPromise(tx(storeName, 'readwrite').put(value));
  }

  function deleteFrom(storeName, key) {
    return reqToPromise(tx(storeName, 'readwrite').delete(key));
  }

  function getFrom(storeName, key) {
    return reqToPromise(tx(storeName).get(key));
  }

  /* --- Tracks --- */
  async function saveTrack(track) { return putTo('tracks', track); }
  async function getTrack(id) { return getFrom('tracks', id); }
  async function getAllTracks() { return getAllFrom('tracks'); }
  async function deleteTrack(id) { return deleteFrom('tracks', id); }

  /* --- Audio Blobs --- */
  async function saveAudioBlob(id, blob) { return putTo('audioBlobs', { id, blob }); }
  async function getAudioBlob(id) {
    const rec = await getFrom('audioBlobs', id);
    return rec ? rec.blob : null;
  }
  async function deleteAudioBlob(id) { return deleteFrom('audioBlobs', id); }

  /* --- Thumbnails --- */
  async function saveThumbnail(id, dataUrl) { return putTo('thumbnails', { id, dataUrl }); }
  async function getThumbnail(id) {
    const rec = await getFrom('thumbnails', id);
    return rec ? rec.dataUrl : null;
  }
  async function deleteThumbnail(id) { return deleteFrom('thumbnails', id); }

  /* --- Playlists --- */
  async function savePlaylists(playlists) {
    const store = _db.transaction('playlists', 'readwrite').objectStore('playlists');
    for (const pl of playlists) store.put(pl);
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = resolve;
      store.transaction.onerror = e => reject(e.target.error);
    });
  }
  async function getPlaylists() { return getAllFrom('playlists'); }
  async function savePlaylist(pl) { return putTo('playlists', pl); }
  async function deletePlaylist(id) { return deleteFrom('playlists', id); }

  /* --- Tags --- */
  async function saveTags(tags) {
    const store = _db.transaction('tags', 'readwrite').objectStore('tags');
    const clearReq = store.clear();
    return new Promise((resolve, reject) => {
      clearReq.onsuccess = () => {
        for (const t of tags) store.put(t);
        store.transaction.oncomplete = resolve;
        store.transaction.onerror = e => reject(e.target.error);
      };
    });
  }
  async function saveTag(tag) { return putTo('tags', tag); }
  async function getTags() { return getAllFrom('tags'); }
  async function deleteTag(id) { return deleteFrom('tags', id); }

  /* --- Artists --- */
  async function saveArtists(artists) {
    const store = _db.transaction('artists', 'readwrite').objectStore('artists');
    const clearReq = store.clear();
    return new Promise((resolve, reject) => {
      clearReq.onsuccess = () => {
        for (const a of artists) store.put(a);
        store.transaction.oncomplete = resolve;
        store.transaction.onerror = e => reject(e.target.error);
      };
    });
  }
  async function saveArtist(artist) { return putTo('artists', artist); }
  async function getArtists() { return getAllFrom('artists'); }
  async function deleteArtist(id) { return deleteFrom('artists', id); }
  async function saveArtistIcon(id, dataUrl) { return putTo('thumbnails', { id: 'artist_' + id, dataUrl }); }
  async function getArtistIcon(id) {
    const rec = await getFrom('thumbnails', 'artist_' + id);
    return rec ? rec.dataUrl : null;
  }
  async function deleteArtistIcon(id) { return deleteFrom('thumbnails', 'artist_' + id); }

  /* --- Play Logs --- */
  async function savePlayLog(log) { return putTo('playLogs', log); }
  async function getPlayLogs() { return getAllFrom('playLogs'); }
  async function clearPlayLogs() {
    return reqToPromise(_db.transaction('playLogs','readwrite').objectStore('playLogs').clear());
  }

  /* --- Settings --- */
  async function saveSetting(key, value) { return putTo('settings', { key, value }); }
  async function getSetting(key) {
    const rec = await getFrom('settings', key);
    return rec ? rec.value : null;
  }

  /* --- キャッシュ全クリア --- */
  async function clearAll() {
    const stores = ['tracks','audioBlobs','thumbnails','playlists','tags','artists','playLogs','settings'];
    for (const s of stores) {
      await reqToPromise(_db.transaction(s,'readwrite').objectStore(s).clear());
    }
  }

  return {
    open,
    saveTrack, getTrack, getAllTracks, deleteTrack,
    saveAudioBlob, getAudioBlob, deleteAudioBlob,
    saveThumbnail, getThumbnail, deleteThumbnail,
    savePlaylists, getPlaylists, savePlaylist, deletePlaylist,
    saveTags, saveTag, getTags, deleteTag,
    saveArtists, saveArtist, getArtists, deleteArtist,
    saveArtistIcon, getArtistIcon, deleteArtistIcon,
    savePlayLog, getPlayLogs, clearPlayLogs,
    saveSetting, getSetting,
    clearAll,
  };
})();
