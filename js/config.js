'use strict';

/* ========== GLOBAL CONFIGURATION ========== */
const CONFIG = {
  /* Google OAuth Client ID - configured by user in Settings */
  GOOGLE_CLIENT_ID: '',

  /* Google Drive API scope */
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.file',

  /* Folder name in Google Drive */
  DRIVE_FOLDER_NAME: 'プロセカ リザルト',

  /* Music database endpoints */
  MUSIC_URL: 'https://sekai-world.github.io/sekai-master-db-diff/musics.json',
  MUSIC_DIFF_URL: 'https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json',

  /* Cache TTL for music DB (ms) */
  MUSIC_CACHE_TTL: 3600000, // 1 hour

  /* Difficulty definitions */
  DIFFICULTIES: ['EASY','NORMAL','HARD','EXPERT','MASTER','APPEND'],

  DIFFICULTY_COLORS: {
    EASY:   '#66DA7E',
    NORMAL: '#66C9F9',
    HARD:   '#F5CC44',
    EXPERT: '#EA5577',
    MASTER: '#BB40F5',
    APPEND: '#EE82E2',
  },

  DIFFICULTY_DARK_TEXT: { EASY: true, NORMAL: true, HARD: true },

  DIFFICULTY_ORDER: {
    EASY: 0, NORMAL: 1, HARD: 2, EXPERT: 3, MASTER: 4, APPEND: 5
  },

  /* Trash auto-delete after N days */
  TRASH_DAYS: 3,

  /* Virtual scroll: approximate card height (px) for each layout */
  CARD_HEIGHT_MOBILE: 110,
  CARD_HEIGHT_DESKTOP: 108,

  /* Virtual scroll buffer rows */
  VS_BUFFER: 4,

  /* Thumbnail max dimension (px) for local storage */
  THUMB_MAX: 400,

  /* Default OCR regions as fractions of image [x, y, w, h]
     Calibrated for standard 16:9 game screenshots.
     x,y = top-left corner; w,h = width/height (all as fraction 0-1) */
  DEFAULT_OCR_REGIONS: {
    title:      { x: 0.12, y: 0.02, w: 0.34, h: 0.09 },
    difficulty: { x: 0.12, y: 0.09, w: 0.15, h: 0.07 },
    level:      { x: 0.24, y: 0.09, w: 0.20, h: 0.07 },
    results:    { x: 0.05, y: 0.47, w: 0.32, h: 0.34 },
    combo:      { x: 0.32, y: 0.47, w: 0.24, h: 0.11 },
  },

  /* Color of debug overlay rectangles for each OCR region */
  OCR_REGION_COLORS: {
    title:      '#FF3333',
    difficulty: '#33AA33',
    level:      '#3366FF',
    results:    '#FF8800',
    combo:      '#AA00FF',
  },

  OCR_REGION_LABELS: {
    title:      'タイトル',
    difficulty: '難易度',
    level:      'レベル',
    results:    'リザルト',
    combo:      'コンボ',
  },
};
