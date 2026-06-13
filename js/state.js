import { DEFAULT_PLAYLIST_ID } from './storage.js';

export const state = {
  ready: false,
  tab: 'player',
  orientation: 'landscape',
  data: { tracks: [], playlists: [], playlistItems: [], tags: [], artists: [], playLogs: [], settings: {} },
  filters: {
    player: { query: '', playlistSearch: '', sort: 'manual', asc: true, columns: 4, selection: [] },
    editor: { view: 'tracks', query: '', sort: 'updatedAt', asc: false, columns: 4 },
    log: { period: 'month' },
  },
  ui: {
    modal: null,
    toast: '',
    uploading: null,
    playlistId: DEFAULT_PLAYLIST_ID,
    simplePlayerOpen: false,
    trackSelection: [],
    editorSelection: [],
  },
  player: {
    currentTrackId: null,
    isPlaying: false,
    shuffle: false,
    loop: false,
    rate: 1,
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: -1,
    sampleMode: false,
  },
  eq: {
    enabled: true,
    preset: 'normal',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    custom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sample: 'sample1',
  },
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) fn(state);
}

export function setState(patch = {}) {
  Object.assign(state, patch);
  emit();
}

export function setDeep(path, value) {
  let obj = state;
  for (let i = 0; i < path.length - 1; i += 1) obj = obj[path[i]];
  obj[path[path.length - 1]] = value;
  emit();
}

export function getPlaylistById(id) {
  return state.data.playlists.find((p) => p.id === id);
}
