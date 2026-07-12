/*
 * music-db.js
 * -----------------------------------------------------------------------
 * プロセカ非公式マスターDB(musics.json / musicDifficulties.json)の取得と、
 * OCRで読み取った曲名から最も近い楽曲を推定するファジーマッチング処理。
 * さらに、難易度・レベル・総ノーツ数を手がかりに「曲名が少し崩れていても
 * 候補を絞り込める」ように、補助インデックスとスコアリングを追加しています。
 * -----------------------------------------------------------------------
 */

let dbMusicsById = new Map();
let dbDiffsByMusicKey = new Map();

function buildMusicDbIndexes() {
  dbMusicsById = new Map();
  dbDiffsByMusicKey = new Map();

  if (Array.isArray(dbMusics)) {
    for (const music of dbMusics) {
      if (music && music.id !== undefined && music.id !== null) {
        dbMusicsById.set(music.id, music);
      }
    }
  }

  if (Array.isArray(dbDiffs)) {
    for (const entry of dbDiffs) {
      if (!entry || entry.musicId === undefined || entry.musicId === null) continue;
      const diffKey = entry.musicDifficulty || entry.difficulty || entry.diff || entry.difficultyRaw || '';
      if (!diffKey) continue;
      dbDiffsByMusicKey.set(`${entry.musicId}|${String(diffKey).toLowerCase()}`, entry);
    }
  }
}

function getMusicById(musicId) {
  return dbMusicsById.get(musicId) || null;
}

function getMusicDifficultyEntry(musicId, diffKey) {
  if (musicId === undefined || musicId === null || !diffKey) return null;
  return dbDiffsByMusicKey.get(`${musicId}|${String(diffKey).toLowerCase()}`) || null;
}

function getChartLevelFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const keys = ['playLevel', 'level', 'musicLevel', 'difficultyLevel'];
  for (const key of keys) {
    const value = entry[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function getChartNoteCount(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  const preferred = ['noteCount', 'notes', 'totalNotes', 'totalNoteCount', 'note_total', 'musicNotes'];
  for (const key of preferred) {
    const value = entry[key];
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  for (const [key, value] of Object.entries(entry)) {
    if (/note/i.test(key)) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  return 0;
}

function getChartLevelNumber(entry) {
  const value = getChartLevelFromEntry(entry);
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function titleSimilarity(a, b) {
  const x = normalizeString(a);
  const y = normalizeString(b);
  if (!x || !y) return 0;
  const dist = levenshtein(x, y);
  return 1 - (dist / Math.max(x.length, y.length, 1));
}

function numericSimilarity(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return 0;
  const denom = Math.max(Math.abs(na), Math.abs(nb), 1);
  return Math.max(0, 1 - (Math.abs(na - nb) / denom));
}

function getMusicDifficultyContextScore(entry, ctx) {
  if (!entry) return -1;
  let score = 0;

  const chartLevel = getChartLevelNumber(entry);
  const expectedLevel = ctx && ctx.level !== undefined && ctx.level !== null && ctx.level !== '' ? parseFloat(ctx.level) : null;
  if (expectedLevel !== null && Number.isFinite(expectedLevel)) {
    if (chartLevel !== null) score += numericSimilarity(chartLevel, expectedLevel) * 1.4;
    else score -= 0.35;
  }

  const chartNotes = getChartNoteCount(entry);
  const expectedNotes = ctx && ctx.totalNotes !== undefined && ctx.totalNotes !== null && ctx.totalNotes !== '' ? parseFloat(ctx.totalNotes) : null;
  if (expectedNotes !== null && Number.isFinite(expectedNotes)) {
    if (chartNotes > 0) score += numericSimilarity(chartNotes, expectedNotes) * 1.0;
    else score -= 0.2;
  }

  if (ctx && ctx.diffKey) {
    const expectedDiff = String(ctx.diffKey).toLowerCase();
    const entryDiff = String(entry.musicDifficulty || entry.difficulty || entry.diff || '').toLowerCase();
    if (entryDiff) {
      score += (entryDiff === expectedDiff ? 0.8 : -0.45);
    }
  }

  return score;
}

function getAttemptConfidence(attempt) {
  if (!attempt) return 0;
  const conf = Number(attempt.confidence ?? attempt.meanConfidence ?? attempt.ocrConfidence ?? attempt.scoreConfidence);
  return Number.isFinite(conf) ? conf : 0;
}

function buildMusicCandidateScore(music, attempt, ctx) {
  const text = attempt ? attempt.text || '' : '';
  const textScore = titleSimilarity(text, music.title || '');
  const confScore = Math.max(0, Math.min(1, getAttemptConfidence(attempt) / 100));
  const chartEntry = ctx && ctx.diffKey ? getMusicDifficultyEntry(music.id, ctx.diffKey) : null;
  const contextScore = getMusicDifficultyContextScore(chartEntry, ctx);
  const titleWeight = text ? 0.55 : 0.12;
  const confidenceWeight = text ? 0.18 : 0.08;
  const contextWeight = 0.27;
  const rawScore = (textScore * titleWeight) + (confScore * confidenceWeight) + (contextScore * contextWeight);
  return {
    music,
    score: rawScore,
    textScore,
    confidence: confScore,
    contextScore,
    chartEntry,
    matchedText: text,
  };
}

function collectBestMusicCandidates(attempts, ctx, limit = 5) {
  const list = Array.isArray(dbMusics) ? dbMusics : [];
  const results = [];
  const seen = new Set();

  for (const attempt of attempts || []) {
    const cleaned = normalizeString(attempt && attempt.text ? attempt.text : '');
    if (!cleaned && (!ctx || (!ctx.level && !ctx.totalNotes && !ctx.diffKey))) continue;
    for (const music of list) {
      if (!music || seen.has(`${attempt?.text || ''}|${music.id}`)) continue;
      const candidate = buildMusicCandidateScore(music, attempt, ctx);
      results.push(candidate);
      seen.add(`${attempt?.text || ''}|${music.id}`);
    }
  }

  if (results.length === 0 && list.length > 0) {
    const fallbackAttempt = attempts && attempts.length ? attempts[0] : { text: '' };
    for (const music of list) {
      results.push(buildMusicCandidateScore(music, fallbackAttempt, ctx));
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function inferBestMusicMatch({ attempts, diffKey, level, totalNotes }) {
  const top = collectBestMusicCandidates(attempts || [], { diffKey, level, totalNotes }, 5);
  if (!top.length) return null;
  const best = top[0];
  return {
    music: best.music,
    musicId: best.music ? best.music.id : null,
    title: best.music ? best.music.title : '',
    score: best.score,
    confidence: best.confidence,
    reason: best.contextScore > 0.4 ? 'context+ocr' : 'ocr',
    candidates: top,
  };
}

// ============================================================
// データ取得
// ============================================================

async function loadMusicDb() {
  try {
    const [musicsResp, diffsResp] = await Promise.all([
      fetch(MUSICS_URL),
      fetch(MUSIC_DIFFICULTIES_URL)
    ]);
    dbMusics = await musicsResp.json();
    dbDiffs = await diffsResp.json();
    buildMusicDbIndexes();
  } catch (e) {
    console.error("DB Error", e);
  }
}

function findBestMatchMusic(ocrText) {
  if (!dbMusics || dbMusics.length === 0) return null;
  const target = normalizeString(ocrText);
  if (target.length === 0) return null;
  let bestMatch = null, minScore = Infinity;
  for (const music of dbMusics) {
    const dbTitleNorm = normalizeString(music.title);
    const dist = levenshtein(target, dbTitleNorm);
    const score = dist / Math.max(target.length, dbTitleNorm.length);
    if (score < minScore) { minScore = score; bestMatch = music; }
  }
  return bestMatch;
}

function getLevelFromDb(musicId, diffKey) {
  const entry = getMusicDifficultyEntry(musicId, diffKey);
  if (!entry) return null;
  return getChartLevelFromEntry(entry);
}
