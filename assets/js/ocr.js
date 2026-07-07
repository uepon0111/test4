import { state } from './state.js';
import { difficultyCodeFromKey, difficultyKeyFromCode, normalizeDifficultyCode } from './config.js';

export function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .replace(/[\-_]/g, '')
    .toLowerCase();
}

export function findBestMatchMusic(ocrText) {
  if (!state.dbMusics || state.dbMusics.length === 0) return null;
  const target = normalizeString(ocrText);
  if (!target) return null;

  let bestMatch = null;
  let minScore = Infinity;

  const levenshtein = (s1, s2) => {
    if (s1.length > s2.length) [s1, s2] = [s2, s1];
    let dist = Array.from({ length: s1.length + 1 }, (_, i) => i);
    for (let i2 = 0; i2 < s2.length; i2 += 1) {
      const newDist = [i2 + 1];
      for (let i1 = 0; i1 < s1.length; i1 += 1) {
        if (s1[i1] === s2[i2]) newDist.push(dist[i1]);
        else newDist.push(1 + Math.min(dist[i1], dist[i1 + 1], newDist[newDist.length - 1]));
      }
      dist = newDist;
    }
    return dist[dist.length - 1];
  };

  for (const music of state.dbMusics) {
    const dbTitleNorm = normalizeString(music.title);
    if (!dbTitleNorm) continue;
    const dist = levenshtein(target, dbTitleNorm);
    const score = dist / Math.max(target.length, dbTitleNorm.length);
    if (score < minScore) {
      minScore = score;
      bestMatch = music;
    }
  }

  return bestMatch;
}

export function getLevelFromDb(musicId, diffKey) {
  if (!musicId || !diffKey || !state.dbDiffs) return null;
  const key = String(diffKey).toLowerCase();
  const entry = state.dbDiffs.find((d) => String(d.musicId) === String(musicId) && String(d.musicDifficulty).toLowerCase() === key);
  return entry ? entry.playLevel : null;
}

function detectDifficultyCode(diffText) {
  const text = String(diffText || '').toUpperCase().replace(/\s+/g, '');
  if (/APPEND|APD|A?P{2}E?N?D?/.test(text)) return 'A';
  if (/MASTER|MST|MAS/.test(text)) return 'M';
  if (/EXPERT|EXP/.test(text)) return 'E';
  if (/HARD|HRD|H/.test(text)) return 'H';
  if (/NORMAL|NORM|NML|N/.test(text)) return 'NM';
  if (/EASY|EAS|EZ/.test(text)) return 'EZ';
  return 'E';
}

export async function cropImage(imageElement, xRatio, yRatio, wRatio, hRatio, type = 'filter-standard') {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d');

  if (type === 'threshold-diff') {
    const threshold = Number(state.settings?.diffCrop?.threshold ?? 180);
    const scale = 1.5;
    canvas.width = Math.max(1, Math.round(w * wRatio * scale));
    canvas.height = Math.max(1, Math.round(h * hRatio * scale));
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = gray > threshold ? 0 : 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
  } else {
    canvas.width = Math.max(1, Math.round(w * wRatio));
    canvas.height = Math.max(1, Math.round(h * hRatio));
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function analyzeLoadedImage(imgElement, worker) {
  try {
    const settings = state.settings || {};
    const diffCrop = settings.diffCrop || {};
    const titleCrop = settings.titleCrop || {};
    const missCrop = settings.missCrop || {};

    const diffBlob = await cropImage(
      imgElement,
      diffCrop.x ?? 0.2,
      diffCrop.y ?? 0.07,
      diffCrop.w ?? 0.1,
      diffCrop.h ?? 0.04,
      'threshold-diff',
    );
    const diffRet = await worker.recognize(diffBlob, { lang: 'eng' });
    const dCode = detectDifficultyCode(diffRet.data.text);

    const titleBlob = await cropImage(
      imgElement,
      titleCrop.x ?? 0.19,
      titleCrop.y ?? 0.01,
      titleCrop.w ?? 0.32,
      titleCrop.h ?? 0.05,
      'filter-standard',
    );
    const titleRet = await worker.recognize(titleBlob, { lang: 'jpn' });
    const matchedMusic = findBestMatchMusic(titleRet.data.text);
    const finalTitle = matchedMusic ? matchedMusic.title : String(titleRet.data.text || '').replace(/\r?\n/g, '').trim();
    const musicId = matchedMusic ? matchedMusic.id : null;

    let level = '';
    if (musicId) {
      const diffKey = difficultyKeyFromCode(dCode);
      level = getLevelFromDb(musicId, diffKey) || '';
    }

    const missBlob = await cropImage(
      imgElement,
      missCrop.x ?? 0.10,
      missCrop.y ?? 0.55,
      missCrop.w ?? 0.20,
      missCrop.h ?? 0.28,
      'filter-standard',
    );
    const missRet = await worker.recognize(missBlob, { lang: 'jpn' });
    const lines = String(missRet.data.text || '').split('\n');
    let cGood = 0;
    let cBad = 0;
    let cMiss = 0;

    const parseLine = (line, regex) => {
      if (regex.test(line)) {
        const nums = line.match(/\d+/g);
        if (nums) return parseInt(nums[nums.length - 1], 10);
      }
      return 0;
    };

    lines.forEach((line) => {
      if (/G[O0QD]{2}D/i.test(line)) cGood = parseLine(line, /G[O0QD]{2}D/i);
      if (/BAD/i.test(line)) cBad = parseLine(line, /BAD/i);
      if (/MISS/i.test(line)) cMiss = parseLine(line, /MISS/i);
    });

    return {
      title: finalTitle,
      level,
      diff: normalizeDifficultyCode(dCode),
      miss: cGood + cBad + cMiss,
      missDetail: { good: cGood, bad: cBad, miss: cMiss },
      musicId,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
