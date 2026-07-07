import { DEFAULT_SETTINGS, STORAGE_KEYS } from './config.js';

export const state = {
  gapiInited: false,
  gisInited: false,
  tokenClient: null,
  allRecords: [],
  filteredRecords: [],
  isSelectMode: false,
  selectedIds: new Set(),
  editorQueue: [],
  activeItemId: null,
  currentMode: 'upload',
  dbMusics: [],
  dbDiffs: [],
  settings: loadSettings(),
  pbSnapshot: loadPbSnapshot(),
  bestUpdateQueue: [],
  rootFolderCache: null,
  fcFolderCache: null,
  folderCache: new Map(),
  folderIndex: new Map(),
  folderPromise: null,
  currentFetchRevision: 0,
  lastFetchAt: null,
};

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeParseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cloneDefaults(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function loadSettings() {
  if (!canUseStorage()) return cloneDefaults(DEFAULT_SETTINGS);
  const stored = safeParseJSON(localStorage.getItem(STORAGE_KEYS.settings), null);
  if (!stored) return cloneDefaults(DEFAULT_SETTINGS);
  return {
    diffCrop: { ...DEFAULT_SETTINGS.diffCrop, ...(stored.diffCrop || {}) },
    titleCrop: { ...DEFAULT_SETTINGS.titleCrop, ...(stored.titleCrop || {}) },
    missCrop: { ...DEFAULT_SETTINGS.missCrop, ...(stored.missCrop || {}) },
  };
}

export function saveSettings(nextSettings) {
  state.settings = {
    diffCrop: { ...DEFAULT_SETTINGS.diffCrop, ...(nextSettings.diffCrop || {}) },
    titleCrop: { ...DEFAULT_SETTINGS.titleCrop, ...(nextSettings.titleCrop || {}) },
    missCrop: { ...DEFAULT_SETTINGS.missCrop, ...(nextSettings.missCrop || {}) },
  };
  if (canUseStorage()) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

export function loadPbSnapshot() {
  if (!canUseStorage()) return {};
  return safeParseJSON(localStorage.getItem(STORAGE_KEYS.pbSnapshot), {});
}

export function savePbSnapshot(snapshot) {
  state.pbSnapshot = snapshot;
  if (canUseStorage()) localStorage.setItem(STORAGE_KEYS.pbSnapshot, JSON.stringify(snapshot));
}

export function resetDriveCaches() {
  state.rootFolderCache = null;
  state.fcFolderCache = null;
  state.folderCache = new Map();
  state.folderIndex = new Map();
  state.folderPromise = null;
}

export function resetEditorState() {
  state.editorQueue = [];
  state.activeItemId = null;
  state.currentMode = 'upload';
}

export function resetSelection() {
  state.isSelectMode = false;
  state.selectedIds.clear();
}

export function setDbData(musics, diffs) {
  state.dbMusics = musics || [];
  state.dbDiffs = diffs || [];
}

export function getSettingPath(path) {
  return path.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), state.settings);
}

export function setSettingPath(path, value) {
  const keys = path.split('.');
  let target = state.settings;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!(keys[i] in target)) target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
  if (canUseStorage()) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}
