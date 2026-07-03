/**
 * Minimal reactive state store.
 * Call setState({key: value}) to update.
 * Call on('key', fn) or on('*', fn) to subscribe.
 */

const _listeners = new Map(); // key → Set<fn>

export const state = {
  // Auth
  isLoggedIn: false,
  userEmail: null,

  // App data (in-memory copy of Drive db.json)
  records: [],           // all records including soft-deleted
  deviceProfiles: [],    // OCR device profiles

  // image file thumbnails: Map<fileId, urlString>
  thumbnailMap: new Map(),

  // Music master data
  musics: [],
  diffs: [],
  musicDbLoaded: false,

  // Drive folder/file IDs (persisted in localStorage)
  rootFolderId: null,
  imagesFolderId: null,
  dbFileId: null,

  // --- UI state ---
  // Evaluation mode: 'ap' | 'apt' | 'fc'
  mode: 'ap',
  // Sort: key = 'title'|'level'|'miss'|'added', dir = 'asc'|'desc'
  sortKey: 'level',
  sortDir: 'desc',
  // Show only best record per (musicId, difficulty)
  showBestOnly: false,
  // Filter: AP/FC status: 'all'|'ap'|'fc'|'nofc'
  filterStatus: 'all',
  // Filter: difficulties Set<string>, empty = all
  filterDiffs: new Set(),
  // Filter: level exact match (null = any)
  filterLevel: null,
  // Filter: miss count range (null = no bound)
  filterMissMin: null,
  filterMissMax: null,
  // Filter: title/pronunciation text search
  filterTitle: '',
  // Active view: 'list'|'trash'|'settings'
  activeView: 'list',
};

export function setState(partial) {
  const changed = [];
  for (const [k, v] of Object.entries(partial)) {
    if (state[k] !== v) {
      state[k] = v;
      changed.push(k);
    }
  }
  if (changed.length === 0) return;
  for (const key of changed) {
    const s = _listeners.get(key);
    if (s) for (const fn of s) fn(state[key]);
  }
  const star = _listeners.get('*');
  if (star) for (const fn of star) fn(changed);
}

/** Subscribe to state changes. Returns unsubscribe function. */
export function on(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(fn);
  return () => _listeners.get(key).delete(fn);
}
