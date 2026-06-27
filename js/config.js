// js/config.js
export const CONFIG = {
  MUSICS_URL:      'https://sekai-world.github.io/sekai-master-db-diff/musics.json',
  DIFFICULTIES_URL:'https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json',

  DIFFICULTIES: ['EASY','NORMAL','HARD','EXPERT','MASTER','APPEND'],
  DIFFICULTY_COLORS: {
    EASY:   '#66DA7E',
    NORMAL: '#66C9F9',
    HARD:   '#F5CC44',
    EXPERT: '#EA5577',
    MASTER: '#BB40F5',
    APPEND: '#EE82E2',
  },
  DIFFICULTY_ORDER: { EASY:0, NORMAL:1, HARD:2, EXPERT:3, MASTER:4, APPEND:5 },

  // 難易度→表示文字列（APIはlowercase）
  DIFF_API_MAP: {
    easy:'EASY', normal:'NORMAL', hard:'HARD',
    expert:'EXPERT', master:'MASTER', append:'APPEND',
  },

  TRASH_DAYS:  3,
  DB_NAME:     'sekai-records',
  DB_VERSION:  2,
  THUMB_W:     480,
  THUMB_H:     270,

  // OCR領域カラー（要件4.1〜4.4）
  REGIONS: {
    title:      { color:'#ff3b30', label:'タイトル',   key:'title'      },
    difficulty: { color:'#34c759', label:'難易度',     key:'difficulty' },
    level:      { color:'#007aff', label:'レベル',     key:'level'      },
    results:    { color:'#ff9500', label:'リザルト',   key:'results'    },
    combo:      { color:'#af52de', label:'コンボ数',   key:'combo'      },
  },

  // デフォルトOCR領域（画像の比率）
  DEFAULT_REGION_COORDS: {
    title:      { x:0.13, y:0.01, w:0.29, h:0.09 },
    difficulty: { x:0.09, y:0.07, w:0.14, h:0.05 },
    level:      { x:0.22, y:0.07, w:0.18, h:0.05 },
    results:    { x:0.08, y:0.43, w:0.28, h:0.38 },
    combo:      { x:0.33, y:0.43, w:0.23, h:0.11 },
  },
};
