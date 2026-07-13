/*
 * music-db.js
 * -----------------------------------------------------------------------
 * プロセカ非公式マスターDB(musics.json / musicDifficulties.json)の取得と、
 * OCRで読み取った曲名から最も近い楽曲を推定するファジーマッチング処理。
 * さらに、楽曲タイトル・難易度・レベル・総ノーツ数を総合した
 * 候補推定ロジックを提供します。
 * -----------------------------------------------------------------------
 */

let dbMusicsById = new Map();
let dbDiffsByMusicId = new Map();
let musicDbLoadPromise = null;

function normalizeForMatch(str) {
  return normalizeString(str || '').replace(/[^\p{L}\p{N}]/gu, '');
}

function similarityScore(a, b) {
  a = normalizeForMatch(a);
  b = normalizeForMatch(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.max(0.75, ratio);
  }
  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}

function rebuildMusicIndexes() {
  dbMusicsById = new Map();
  dbDiffsByMusicId = new Map();
  for (const music of (dbMusics || [])) {
    dbMusicsById.set(music.id, music);
  }
  for (const diff of (dbDiffs || [])) {
    const list = dbDiffsByMusicId.get(diff.musicId) || [];
    list.push(diff);
    dbDiffsByMusicId.set(diff.musicId, list);
  }
}

async function loadMusicDb() {
  musicDbLoadPromise = (async () => {
    try {
      const [musicsResp, diffsResp] = await Promise.all([
        fetch(MUSICS_URL),
        fetch(MUSIC_DIFFICULTIES_URL)
      ]);
      dbMusics = await musicsResp.json();
      dbDiffs = await diffsResp.json();
      rebuildMusicIndexes();
    } catch (e) {
      console.error("DB Error", e);
      dbMusics = [];
      dbDiffs = [];
      rebuildMusicIndexes();
    }
  })();
  return musicDbLoadPromise;
}

function ensureMusicDbReady() {
  return musicDbLoadPromise || Promise.resolve();
}

function scoreMusicTitleCandidate(music, ocrText) {
  const normalized = normalizeForMatch(ocrText);
  if (!normalized) return 0;
  const titleScore = similarityScore(normalized, music.title || '');
  const pronunciationScore = music.pronunciation ? similarityScore(normalized, music.pronunciation) : 0;
  return Math.max(titleScore, pronunciationScore);
}

function findBestMatchMusic(ocrText) {
  if (!dbMusics || dbMusics.length === 0) return null;
  const target = normalizeString(ocrText);
  if (target.length === 0) return null;
  let bestMatch = null, bestScore = -Infinity;
  for (const music of dbMusics) {
    const score = scoreMusicTitleCandidate(music, target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = music;
    }
  }
  return bestMatch;
}

function getLevelFromDb(musicId, diffKey) {
  if (!musicId || !diffKey || !dbDiffs) return null;
  const entry = dbDiffs.find(d => d.musicId === musicId && d.musicDifficulty === diffKey);
  return entry ? entry.playLevel : null;
}

function getNoteCountFromDb(musicId, diffKey) {
  if (!musicId || !diffKey || !dbDiffs) return null;
  const entry = dbDiffs.find(d => d.musicId === musicId && d.musicDifficulty === diffKey);
  return entry ? entry.totalNoteCount : null;
}

function getDiffEntry(musicId, diffKey) {
  if (!musicId || !diffKey) return null;
  const list = dbDiffsByMusicId.get(musicId) || [];
  return list.find(d => d.musicDifficulty === diffKey) || null;
}

function scoreDiffEvidence(entry, evidence) {
  if (!entry) return -Infinity;
  const {
    titleText = '',
    titleConfidence = 0,
    diffCode = '',
    level = null,
    totalNotes = null,
    combo = null,
  } = evidence || {};

  const music = dbMusicsById.get(entry.musicId);
  if (!music) return -Infinity;

  const titleSim = scoreMusicTitleCandidate(music, titleText);
  const confFactor = clamp((titleConfidence || 0) / 100, 0, 1);
  const titleWeight = titleText ? (0.10 + 0.40 * confFactor) : 0.0;

  const diffKey = getDiffDbKey(diffCode);
  const diffScore = diffCode
    ? (entry.musicDifficulty === diffKey ? 1 : 0.12)
    : 0.45;

  const levelScore = (typeof level === 'number' && Number.isFinite(level))
    ? Math.max(0, 1 - Math.min(Math.abs(entry.playLevel - level) / 8, 1))
    : 0.45;

  const notesScore = (typeof totalNotes === 'number' && Number.isFinite(totalNotes) && totalNotes > 0)
    ? Math.max(0, 1 - Math.min(Math.abs(entry.totalNoteCount - totalNotes) / Math.max(totalNotes, entry.totalNoteCount, 1), 1))
    : 0.45;

  let comboScore = 0.20;
  let comboPenalty = 0;
  if (typeof combo === 'number' && Number.isFinite(combo) && combo > 0) {
    if (combo > entry.totalNoteCount) comboPenalty = 1.5;
    else comboScore = Math.max(0, 1 - Math.min((entry.totalNoteCount - combo) / Math.max(entry.totalNoteCount, 1), 1));
  }

  return (titleSim * titleWeight * 3.2) + (diffScore * 1.2) + (levelScore * 1.0) + (notesScore * 1.4) + (comboScore * 0.2) - comboPenalty;
}

function resolveMusicByEvidence(evidence) {
  if (!dbMusics || !dbDiffs || dbDiffs.length === 0) return null;

  const entries = dbDiffs.slice();
  let bestEntry = null;
  let bestScore = -Infinity;
  for (const entry of entries) {
    const score = scoreDiffEvidence(entry, evidence);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  if (!bestEntry) return null;

  const music = dbMusicsById.get(bestEntry.musicId);
  return {
    musicId: bestEntry.musicId,
    title: music ? music.title : '',
    pronunciation: music ? music.pronunciation || '' : '',
    diff: bestEntry.musicDifficulty,
    level: bestEntry.playLevel,
    totalNotes: bestEntry.totalNoteCount,
    score: bestScore,
  };
}

function getCandidateSongsByDiffAndNotes(diffKey, totalNotes) {
  if (!dbDiffs || dbDiffs.length === 0) return [];
  const list = dbDiffs
    .filter(d => !diffKey || d.musicDifficulty === diffKey)
    .map(d => {
      const music = dbMusicsById.get(d.musicId) || {};
      const noteDelta = (typeof totalNotes === 'number' && Number.isFinite(totalNotes))
        ? Math.abs(d.totalNoteCount - totalNotes)
        : 0;
      return {
        musicId: d.musicId,
        title: music.title || '',
        diff: d.musicDifficulty,
        level: d.playLevel,
        totalNotes: d.totalNoteCount,
        noteDelta,
      };
    })
    .sort((a, b) => a.noteDelta - b.noteDelta || a.level - b.level || a.title.localeCompare(b.title, 'ja'));
  return list;
}
