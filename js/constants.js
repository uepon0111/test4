export const APP_CONFIG = {
  rootFolderName: 'プロセカリザルト',
  subFolderName: 'FC',
  clientId: '966636096862-8hrrm5heb4g5r469veoels7u6ifjguuk.apps.googleusercontent.com',
  apiKey: 'AIzaSyC-m1rkHuJTmNK2k-s89bJFshvXCS5MZZ0',
  discoveryDoc: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  scopes: 'https://www.googleapis.com/auth/drive'
};

export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT', 'MASTER', 'APPEND'];

export const DIFFICULTY_META = {
  EASY:   { code: 'EZ', color: '#66DA7E', legacyCodes: ['E'] },
  NORMAL: { code: 'NM', color: '#66C9F9', legacyCodes: ['N'] },
  HARD:   { code: 'HD', color: '#F5CC44', legacyCodes: ['H'] },
  EXPERT: { code: 'EX', color: '#EA5577', legacyCodes: ['E'] },
  MASTER: { code: 'MS', color: '#BB40F5', legacyCodes: ['M'] },
  APPEND: { code: 'AP', color: '#EE82E2', legacyCodes: ['A'] }
};

export const DIFF_ORDER = {
  EASY: 0,
  NORMAL: 1,
  HARD: 2,
  EXPERT: 3,
  MASTER: 4,
  APPEND: 5
};

export const SORT_DIRECTIONS = {
  asc: 1,
  desc: -1
};

export const DEFAULT_CROP_REGIONS = {
  title:   { x: 0.19, y: 0.01, w: 0.32, h: 0.05 },
  difficulty: { x: 0.20, y: 0.07, w: 0.10, h: 0.04 },
  result:  { x: 0.08, y: 0.48, w: 0.34, h: 0.26 },
  combo:   { x: 0.52, y: 0.44, w: 0.20, h: 0.10 }
};

export const DEFAULT_UI_STATE = {
  sortOrder: 'level',
  sortDirection: 'desc',
  filterFc: 'all',
  filterMissMin: '',
  filterMissMax: '',
  filterDiff: 'all',
  filterTitle: '',
  filterLevel: '',
  selfBestOnly: false
};

export const DEFAULT_SETTINGS = {
  cropRegions: DEFAULT_CROP_REGIONS,
  sampleImageDataUrl: '',
  keepBestOnlyDefault: false
};
