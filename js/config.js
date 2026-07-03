// Google OAuth credentials (set your own from Google Cloud Console)
export const CLIENT_ID = '966636096862-8hrrm5heb4g5r469veoels7u6ifjguuk.apps.googleusercontent.com';
export const API_KEY = 'AIzaSyC-m1rkHuJTmNK2k-s89bJFshvXCS5MZZ0';
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Drive structure
export const DRIVE_ROOT = 'プロセカリザルト';
export const DRIVE_IMAGES_FOLDER = 'images';
export const DRIVE_DB_FILENAME = 'db.json';

// External data sources
export const MUSICS_URL = 'https://sekai-world.github.io/sekai-master-db-diff/musics.json';
export const DIFFS_URL = 'https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json';

// Trash auto-delete after N days
export const TRASH_DELETE_DAYS = 3;

// Difficulties in rank order
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'master', 'append'];

export const DIFFICULTY_LABELS = {
  easy: 'EASY', normal: 'NORMAL', hard: 'HARD',
  expert: 'EXPERT', master: 'MASTER', append: 'APPEND',
};

// Per-spec: #66DA7E, #66C9F9, #F5CC44, #EA5577, #BB40F5, #EE82E2
export const DIFFICULTY_COLORS = {
  easy:   '#66DA7E',
  normal: '#66C9F9',
  hard:   '#F5CC44',
  expert: '#EA5577',
  master: '#BB40F5',
  append: '#EE82E2',
};

export const DIFFICULTY_RANK = {
  easy: 0, normal: 1, hard: 2, expert: 3, master: 4, append: 5,
};

// OCR region colors and labels (shown as overlays on result image)
export const REGION_COLORS = {
  title:  '#e52222',
  diff:   '#1db34b',
  level:  '#2255e5',
  result: '#e57a22',
  combo:  '#9922e5',
};
export const REGION_LABELS = {
  title: 'タイトル', diff: '難易度', level: 'レベル',
  result: 'リザルト内訳', combo: 'コンボ数',
};

// Default OCR device profile — calibrated for ProSeka on iPad (~2388×1668, ratio ≈1.43)
// x, y, w, h are all fractions of image width/height
export const DEFAULT_DEVICE_PROFILE = {
  id: 'default',
  name: 'デフォルト (iPad / タブレット横)',
  aspectRatioMin: 1.25,
  aspectRatioMax: 1.6,
  regions: {
    title:  { x: 0.19,  y: 0.010, w: 0.32,  h: 0.050 },
    diff:   { x: 0.195, y: 0.063, w: 0.100, h: 0.052 },
    level:  { x: 0.300, y: 0.065, w: 0.14,  h: 0.050 },
    result: { x: 0.085, y: 0.515, w: 0.235, h: 0.345 },
    combo:  { x: 0.335, y: 0.515, w: 0.185, h: 0.075 },
  },
};
