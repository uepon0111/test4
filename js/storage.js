import { uid, DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, formatDate, unique } from './utils.js';

const DB_NAME = 'audio_library_app';
const DB_VERSION = 1;
const DEFAULT_PLAYLIST_ID = 'all';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('DB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playlistItems')) db.createObjectStore('playlistItems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('artists')) db.createObjectStore('artists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playLogs')) db.createObjectStore('playLogs', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames) ? storeNames.map((name) => transaction.objectStore(name)) : [transaction.objectStore(storeNames)];
    let result;
    try {
      result = fn(stores.length === 1 ? stores[0] : stores, transaction);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
  }));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Request failed'));
  });
}

async function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => promisifyRequest(store.getAll()));
}

async function getOne(storeName, key) {
  return tx(storeName, 'readonly', (store) => promisifyRequest(store.get(key)));
}

async function putOne(storeName, value) {
  return tx(storeName, 'readwrite', (store) => promisifyRequest(store.put(value)));
}

async function deleteOne(storeName, key) {
  return tx(storeName, 'readwrite', (store) => promisifyRequest(store.delete(key)));
}

async function clearStore(storeName) {
  return tx(storeName, 'readwrite', (store) => promisifyRequest(store.clear()));
}

async function ensureDefaults() {
  const playlists = await getAll('playlists');
  if (!playlists.some((p) => p.id === DEFAULT_PLAYLIST_ID)) {
    await putOne('playlists', {
      id: DEFAULT_PLAYLIST_ID,
      name: 'すべての曲',
      isDefault: true,
      createdAt: Date.now(),
      order: 0,
    });
  }
  const artists = await getAll('artists');
  if (!artists.some((a) => a.name === DEFAULT_ARTIST_NAME)) {
    await putOne('artists', {
      id: 'unknown-artist',
      name: DEFAULT_ARTIST_NAME,
      icon: '',
      order: 0,
      createdAt: Date.now(),
      isSystem: true,
    });
  }
}

export async function initStorage() {
  await openDB();
  await ensureDefaults();
}

export async function loadAllData() {
  await initStorage();
  const [tracks, playlists, playlistItems, tags, artists, playLogs, settings] = await Promise.all([
    getAll('tracks'), getAll('playlists'), getAll('playlistItems'), getAll('tags'), getAll('artists'), getAll('playLogs'), getAll('settings'),
  ]);
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return { tracks, playlists, playlistItems, tags, artists, playLogs, settings: settingsMap };
}

export async function saveSettings(settingsObj) {
  const entries = Object.entries(settingsObj || {});
  await tx('settings', 'readwrite', (store) => {
    for (const [key, value] of entries) store.put({ key, value });
  });
}

export async function setSetting(key, value) {
  return putOne('settings', { key, value });
}

export async function getSettings() {
  const arr = await getAll('settings');
  return Object.fromEntries(arr.map((x) => [x.key, x.value]));
}

export async function addTracks(records) {
  const items = await getAll('playlistItems');
  const allMax = items.filter((x) => x.playlistId === DEFAULT_PLAYLIST_ID).reduce((m, x) => Math.max(m, x.order || 0), -1);
  let order = allMax;
  await tx(['tracks', 'playlistItems'], 'readwrite', ([tracksStore, itemsStore]) => {
    for (const track of records) {
      tracksStore.put(track);
      itemsStore.put({ id: `${DEFAULT_PLAYLIST_ID}__${track.id}`, playlistId: DEFAULT_PLAYLIST_ID, trackId: track.id, order: ++order, addedAt: Date.now() });
    }
  });
}

export async function updateTrack(id, patch) {
  const track = await getOne('tracks', id);
  if (!track) return;
  await putOne('tracks', { ...track, ...patch, updatedAt: Date.now() });
}

export async function deleteTrack(trackId) {
  const items = await getAll('playlistItems');
  const logs = await getAll('playLogs');
  await tx(['tracks', 'playlistItems', 'playLogs'], 'readwrite', ([tracksStore, itemsStore, logsStore]) => {
    tracksStore.delete(trackId);
    for (const item of items.filter((i) => i.trackId === trackId)) itemsStore.delete(item.id);
    for (const log of logs.filter((l) => l.trackId === trackId)) logsStore.delete(log.id);
  });
}

export async function createPlaylist(name) {
  const playlists = await getAll('playlists');
  const maxOrder = playlists.reduce((m, p) => Math.max(m, p.order || 0), 0);
  const playlist = { id: uid('pl'), name: name || '新しい再生リスト', createdAt: Date.now(), order: maxOrder + 1, isDefault: false };
  await putOne('playlists', playlist);
  return playlist;
}

export async function updatePlaylist(id, patch) {
  const playlist = await getOne('playlists', id);
  if (!playlist || playlist.isDefault) return;
  await putOne('playlists', { ...playlist, ...patch });
}

export async function deletePlaylist(id) {
  const playlist = await getOne('playlists', id);
  if (!playlist || playlist.isDefault) return;
  const items = await getAll('playlistItems');
  await tx('playlistItems', 'readwrite', (itemsStore) => {
    for (const item of items.filter((i) => i.playlistId === id)) itemsStore.delete(item.id);
  });
  await deleteOne('playlists', id);
}

export async function addTrackToPlaylist(playlistId, trackId) {
  const items = await getAll('playlistItems');
  const related = items.filter((i) => i.playlistId === playlistId);
  if (related.some((i) => i.trackId === trackId)) return;
  const maxOrder = related.reduce((m, i) => Math.max(m, i.order || 0), -1);
  await putOne('playlistItems', { id: `${playlistId}__${trackId}`, playlistId, trackId, order: maxOrder + 1, addedAt: Date.now() });
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  await deleteOne('playlistItems', `${playlistId}__${trackId}`);
}

export async function reorderPlaylist(playlistId, trackIds) {
  const items = await getAll('playlistItems');
  const map = new Map(items.filter((i) => i.playlistId === playlistId).map((i) => [i.trackId, i]));
  await tx('playlistItems', 'readwrite', (itemsStore) => {
    trackIds.forEach((trackId, index) => {
      const item = map.get(trackId);
      if (item) itemsStore.put({ ...item, order: index });
    });
  });
}

export async function createTag(tag) {
  const tags = await getAll('tags');
  const maxOrder = tags.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const record = { id: uid('tag'), name: tag.name || '新しいタグ', color: tag.color || '#2f6fed', order: maxOrder + 1, createdAt: Date.now() };
  await putOne('tags', record);
  return record;
}

export async function updateTag(id, patch) {
  const tag = await getOne('tags', id);
  if (!tag) return;
  await putOne('tags', { ...tag, ...patch });
}

export async function deleteTag(id) {
  const tracks = await getAll('tracks');
  await deleteOne('tags', id);
  await tx('tracks', 'readwrite', (tracksStore) => {
    for (const track of tracks) {
      if ((track.tagIds || []).includes(id)) {
        const next = { ...track, tagIds: (track.tagIds || []).filter((x) => x !== id), updatedAt: Date.now() };
        tracksStore.put(next);
      }
    }
  });
}

export async function createArtist(artist) {
  const artists = await getAll('artists');
  const maxOrder = artists.reduce((m, a) => Math.max(m, a.order || 0), 0);
  const record = { id: uid('artist'), name: artist.name || '新しいアーティスト', icon: artist.icon || '', order: maxOrder + 1, createdAt: Date.now() };
  await putOne('artists', record);
  return record;
}

export async function updateArtist(id, patch) {
  const artist = await getOne('artists', id);
  if (!artist || artist.isSystem) return;
  await putOne('artists', { ...artist, ...patch });
}

export async function deleteArtist(id) {
  const tracks = await getAll('tracks');
  await deleteOne('artists', id);
  await tx('tracks', 'readwrite', (tracksStore) => {
    for (const track of tracks) {
      if ((track.artistIds || []).includes(id)) {
        const next = { ...track, artistIds: (track.artistIds || []).filter((x) => x !== id), updatedAt: Date.now() };
        tracksStore.put(next);
      }
    }
  });
}

export async function setTrackArtists(trackId, artistIds = []) {
  const track = await getOne('tracks', trackId);
  if (!track) return;
  await putOne('tracks', { ...track, artistIds: unique(artistIds), updatedAt: Date.now() });
}

export async function setTrackTags(trackId, tagIds = []) {
  const track = await getOne('tracks', trackId);
  if (!track) return;
  await putOne('tracks', { ...track, tagIds: unique(tagIds), updatedAt: Date.now() });
}

export async function addPlayLog(log) {
  await tx('playLogs', 'readwrite', (store) => { store.add(log); });
}

export async function clearAllData() {
  await Promise.all(['tracks', 'playlists', 'playlistItems', 'tags', 'artists', 'playLogs', 'settings'].map(clearStore));
  await ensureDefaults();
}

export async function wipeDatabase() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('DB delete failed'));
    req.onblocked = () => resolve();
  });
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  return navigator.storage.estimate();
}

export { DEFAULT_PLAYLIST_ID };
