import { DIFFICULTIES, DIFFICULTY_META, DIFF_ORDER } from './constants.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function normalizeString(str) {
  if (!str) return '';
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\s\-_〜~]+/g, '');
}

export function parseFolderTitle(folderName) {
  if (!folderName) return null;
  const regex = /^(\d+)\s*([A-Z]{1,2}|EASY|NORMAL|HARD|EXPERT|MASTER|APPEND)\s+(.+)$/i;
  const match = folderName.match(regex);
  if (!match) return null;
  const level = parseInt(match[1], 10);
  const raw = match[2].toUpperCase();
  const diff = normalizeDifficulty(raw);
  if (!diff) return null;
  return { level, rawDiff: diff, difficulty: diff, title: match[3].trim() };
}

export function normalizeDifficulty(value) {
  if (!value) return null;
  const v = String(value).toUpperCase();
  if (['EZ', 'EASY'].includes(v)) return 'EASY';
  if (['NM', 'NORMAL', 'N'].includes(v)) return 'NORMAL';
  if (['HD', 'HARD', 'H'].includes(v)) return 'HARD';
  if (['EX', 'EXPERT', 'E'].includes(v)) return 'EXPERT';
  if (['MS', 'MASTER', 'M'].includes(v)) return 'MASTER';
  if (['AP', 'APPEND', 'A'].includes(v)) return 'APPEND';
  return null;
}

export function getDifficultyColor(diff) {
  return DIFFICULTY_META[normalizeDifficulty(diff)]?.color || '#666';
}

export function getDifficultyCode(diff) {
  const normalized = normalizeDifficulty(diff);
  return DIFFICULTY_META[normalized]?.code || normalized || 'EX';
}

export function getDifficultyLabel(diff) {
  return normalizeDifficulty(diff) || 'EXPERT';
}

export function parseResultMeta(file) {
  const meta = {
    miss: null,
    perfect: null,
    great: null,
    combo: null
  };

  const fromDescription = tryParseDescription(file.description);
  if (fromDescription) {
    return {
      miss: numberOrNull(fromDescription.miss ?? fromDescription.totalMiss),
      perfect: numberOrNull(fromDescription.perfect),
      great: numberOrNull(fromDescription.great),
      combo: numberOrNull(fromDescription.combo)
    };
  }

  const name = file.name || '';
  const missMatch = name.match(/FC(?:-(\d+))?/i);
  meta.miss = missMatch ? (missMatch[1] ? parseInt(missMatch[1], 10) : 0) : null;
  const p = name.match(/P(?:ERFECT)?(?:=|:)?(\d+)/i);
  const g = name.match(/G(?:REAT)?(?:=|:)?(\d+)/i);
  const c = name.match(/C(?:OMBO)?(?:=|:)?(\d+)/i);
  meta.perfect = p ? parseInt(p[1], 10) : null;
  meta.great = g ? parseInt(g[1], 10) : null;
  meta.combo = c ? parseInt(c[1], 10) : null;
  return meta;
}

export function buildResultDescription(stats) {
  return JSON.stringify({
    miss: numberOrNull(stats.miss),
    perfect: numberOrNull(stats.perfect),
    great: numberOrNull(stats.great),
    combo: numberOrNull(stats.combo)
  });
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tryParseDescription(description) {
  if (!description) return null;
  try {
    const obj = JSON.parse(description);
    return typeof obj === 'object' && obj ? obj : null;
  } catch {
    return null;
  }
}

function sanitizeLineText(text) {
  return (text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function extractNumberByKeyword(lines, keywordRegex) {
  for (const line of lines) {
    if (keywordRegex.test(line)) {
      const numbers = line.match(/\d[\d,]*/g);
      if (numbers?.length) {
        const picked = numbers[numbers.length - 1].replace(/,/g, '');
        return parseInt(picked, 10);
      }
    }
  }
  return null;
}

function extractCombo(lines) {
  for (const line of lines) {
    const comboPatterns = [
      /(\d[\d,]*)\s*COMBO/i,
      /COMBO\s*(\d[\d,]*)/i,
      /(\d[\d,]*)\s*連/i
    ];
    for (const pattern of comboPatterns) {
      const match = line.match(pattern);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  const numbers = lines.flatMap(line => (line.match(/\d[\d,]*/g) || []).map(v => parseInt(v.replace(/,/g, ''), 10)));
  return numbers.length ? Math.max(...numbers) : null;
}

async function cropImage(imageElement, rect, mode = 'normal') {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const x = clamp(Math.round(w * rect.x), 0, w);
  const y = clamp(Math.round(h * rect.y), 0, h);
  const cw = clamp(Math.round(w * rect.w), 1, w - x);
  const ch = clamp(Math.round(h * rect.h), 1, h - y);
  const ctx = canvas.getContext('2d');

  if (mode === 'threshold') {
    const scale = 1.5;
    canvas.width = Math.max(1, Math.round(cw * scale));
    canvas.height = Math.max(1, Math.round(ch * scale));
    ctx.drawImage(imageElement, x, y, cw, ch, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const v = gray > 180 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  } else {
    canvas.width = cw;
    canvas.height = ch;
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imageElement, x, y, cw, ch, 0, 0, cw, ch);
  }

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function levenshtein(a, b) {
  if (a.length > b.length) [a, b] = [b, a];
  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 0; j < b.length; j++) {
    const cur = [j + 1];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[j]) cur.push(prev[i]);
      else cur.push(1 + Math.min(prev[i], prev[i + 1], cur[cur.length - 1]));
    }
    prev = cur;
  }
  return prev[prev.length - 1];
}

export function findBestMatchMusic(ocrText, dbMusics) {
  if (!dbMusics?.length) return null;
  const target = normalizeString(ocrText);
  if (!target) return null;
  let bestMatch = null;
  let minScore = Infinity;
  for (const music of dbMusics) {
    const title = normalizeString(music.title);
    const score = levenshtein(target, title) / Math.max(target.length, title.length);
    if (score < minScore) {
      minScore = score;
      bestMatch = music;
    }
  }
  return bestMatch;
}

export function getLevelFromDb(musicId, diffKey, dbDiffs) {
  if (!musicId || !diffKey || !Array.isArray(dbDiffs)) return null;
  const normalized = normalizeDifficulty(diffKey);
  const entry = dbDiffs.find(d => String(d.musicId) === String(musicId) && normalizeDifficulty(d.musicDifficulty) === normalized);
  return entry ? entry.playLevel : null;
}

export function buildSongKey(record) {
  return [
    normalizeString(record.title),
    normalizeDifficulty(record.difficultyRaw || record.difficulty),
    String(record.level ?? '')
  ].join('|');
}

export function compareResults(a, b) {
  const aMiss = numberOrNull(a.missCount) ?? 999999;
  const bMiss = numberOrNull(b.missCount) ?? 999999;
  if (aMiss !== bMiss) return aMiss - bMiss;

  const aCombo = numberOrNull(a.comboCount) ?? -1;
  const bCombo = numberOrNull(b.comboCount) ?? -1;
  if (aCombo !== bCombo) return bCombo - aCombo;

  const aPerfect = numberOrNull(a.perfectCount) ?? -1;
  const bPerfect = numberOrNull(b.perfectCount) ?? -1;
  if (aPerfect !== bPerfect) return bPerfect - aPerfect;

  const aGreat = numberOrNull(a.greatCount) ?? 999999;
  const bGreat = numberOrNull(b.greatCount) ?? 999999;
  if (aGreat !== bGreat) return aGreat - bGreat;

  return 0;
}

export async function analyzeLoadedImage(imgElement, worker, { cropRegions, dbMusics, dbDiffs }) {
  try {
    const diffBlob = await cropImage(imgElement, cropRegions.difficulty, 'threshold');
    const diffRet = await worker.recognize(diffBlob, { lang: 'eng' });
    const diffText = (diffRet?.data?.text || '').toUpperCase();

    let dKey = 'EXPERT';
    if (/E\s*ASY|EASY|E S Y/.test(diffText)) dKey = 'EASY';
    else if (/N\s*ORMAL|NORMAL/.test(diffText)) dKey = 'NORMAL';
    else if (/HARD/.test(diffText)) dKey = 'HARD';
    else if (/EXPERT/.test(diffText)) dKey = 'EXPERT';
    else if (/MASTER/.test(diffText)) dKey = 'MASTER';
    else if (/APPEND|A\s*PPEND/.test(diffText)) dKey = 'APPEND';

    const titleBlob = await cropImage(imgElement, cropRegions.title, 'normal');
    const titleRet = await worker.recognize(titleBlob, { lang: 'jpn' });
    const matchedMusic = findBestMatchMusic(titleRet?.data?.text || '', dbMusics);
    const finalTitle = matchedMusic ? matchedMusic.title : (titleRet?.data?.text || '').replace(/\r?\n/g, '').trim();
    const musicId = matchedMusic ? matchedMusic.id : null;

    let level = '';
    if (musicId) level = getLevelFromDb(musicId, dKey, dbDiffs) || '';

    const resultBlob = await cropImage(imgElement, cropRegions.result, 'normal');
    const resultRet = await worker.recognize(resultBlob, { lang: 'jpn+eng' });
    const resultLines = sanitizeLineText(resultRet?.data?.text || '');

    let perfect = extractNumberByKeyword(resultLines, /PERFECT/i);
    let great = extractNumberByKeyword(resultLines, /GREAT/i);
    let good = extractNumberByKeyword(resultLines, /GOOD/i);
    let bad = extractNumberByKeyword(resultLines, /BAD/i);
    let miss = extractNumberByKeyword(resultLines, /MISS/i);

    const resultText = resultLines.join(' ');
    if (perfect === null) perfect = numberOrNull(resultText.match(/PERFECT[^\d]*(\d[\d,]*)/i)?.[1]);
    if (great === null) great = numberOrNull(resultText.match(/GREAT[^\d]*(\d[\d,]*)/i)?.[1]);
    if (good === null) good = numberOrNull(resultText.match(/GOOD[^\d]*(\d[\d,]*)/i)?.[1]);
    if (bad === null) bad = numberOrNull(resultText.match(/BAD[^\d]*(\d[\d,]*)/i)?.[1]);
    if (miss === null) miss = numberOrNull(resultText.match(/MISS[^\d]*(\d[\d,]*)/i)?.[1]);

    if (miss === null) {
      const maybeNumbers = resultLines.flatMap(line => (line.match(/\d[\d,]*/g) || []).map(v => parseInt(v.replace(/,/g, ''), 10)));
      if (maybeNumbers.length) miss = maybeNumbers[maybeNumbers.length - 1];
    }

    const comboBlob = await cropImage(imgElement, cropRegions.combo, 'normal');
    const comboRet = await worker.recognize(comboBlob, { lang: 'jpn+eng' });
    let combo = extractCombo(sanitizeLineText(comboRet?.data?.text || ''));
    if (combo === null) {
      combo = extractCombo(resultLines);
    }

    const totalMiss = [good, bad, miss].filter(v => Number.isFinite(v)).reduce((sum, v) => sum + Number(v), 0);

    return {
      title: finalTitle,
      level,
      diff: dKey,
      miss: Number.isFinite(totalMiss) ? totalMiss : 0,
      missDetail: {
        perfect: Number.isFinite(perfect) ? perfect : 0,
        great: Number.isFinite(great) ? great : 0,
        good: Number.isFinite(good) ? good : 0,
        bad: Number.isFinite(bad) ? bad : 0,
        miss: Number.isFinite(miss) ? miss : 0
      },
      combo: Number.isFinite(combo) ? combo : 0,
      musicId
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}
