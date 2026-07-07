export const CLIENT_ID = '966636096862-8hrrm5heb4g5r469veoels7u6ifjguuk.apps.googleusercontent.com';
export const API_KEY = 'AIzaSyC-m1rkHuJTmNK2k-s89bJFshvXCS5MZZ0';
export const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
export const SCOPES = 'https://www.googleapis.com/auth/drive';

export const ROOT_FOLDER_NAME = 'プロセカリザルト';
export const FC_FOLDER_NAME = 'FC';

export const DIFFICULTY_DEFS = [
  { code: 'A', label: 'APPEND', key: 'append', rank: 6 },
  { code: 'M', label: 'MASTER', key: 'master', rank: 5 },
  { code: 'E', label: 'EXPERT', key: 'expert', rank: 4 },
  { code: 'H', label: 'HARD', key: 'hard', rank: 3 },
  { code: 'NM', label: 'NORMAL', key: 'normal', rank: 2 },
  { code: 'EZ', label: 'EASY', key: 'easy', rank: 1 },
];

export const DIFF_BY_CODE = Object.fromEntries(DIFFICULTY_DEFS.map((d) => [d.code, d]));
export const DIFF_BY_KEY = Object.fromEntries(DIFFICULTY_DEFS.map((d) => [d.key, d]));
export const DIFF_RANK = Object.fromEntries(DIFFICULTY_DEFS.map((d) => [d.code, d.rank]));

export const DEFAULT_SETTINGS = {
  diffCrop: { x: 0.20, y: 0.07, w: 0.10, h: 0.04, threshold: 180 },
  titleCrop: { x: 0.19, y: 0.01, w: 0.32, h: 0.05 },
  missCrop: { x: 0.10, y: 0.55, w: 0.20, h: 0.28 },
};

export const STORAGE_KEYS = {
  settings: 'prsk_result_viewer_settings_v2',
  pbSnapshot: 'prsk_result_viewer_pb_snapshot_v2',
};

export function normalizeDifficultyCode(code) {
  if (!code) return '';
  const value = String(code).toUpperCase();
  if (value === 'N') return 'NM';
  if (value === 'Y') return 'EZ';
  if (value === 'NORMAL') return 'NM';
  if (value === 'EASY') return 'EZ';
  if (DIFF_BY_CODE[value]) return value;
  return value;
}

export function difficultyLabel(code) {
  const item = DIFF_BY_CODE[normalizeDifficultyCode(code)];
  return item ? item.label : code || '';
}

export function difficultyKeyFromCode(code) {
  const item = DIFF_BY_CODE[normalizeDifficultyCode(code)];
  return item ? item.key : null;
}

export function difficultyCodeFromKey(key) {
  const item = DIFF_BY_KEY[key];
  return item ? item.code : null;
}

export function difficultyRank(code) {
  const item = DIFF_BY_CODE[normalizeDifficultyCode(code)];
  return item ? item.rank : 0;
}
