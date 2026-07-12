/*
 * ocr-analyzer.js
 * -----------------------------------------------------------------------
 * リザルト画像から Tesseract.js (OCR) を使って情報を読み取る処理。
 * 以前よりも、項目ごとに前処理(二値化/コントラスト調整/拡大)を変え、
 * OCR結果の confidence と楽曲DB情報を組み合わせて最終結果を決めます。
 *
 * 読み取る項目:
 *   - 難易度 (EASY/NORMAL/HARD/EXPERT/MASTER/APPEND)
 *   - 曲名 (マスターDBとのファジーマッチングで補正)
 *   - 判定内訳 (PERFECT/GREAT/GOOD/BAD/MISS)
 *   - コンボ数
 * -----------------------------------------------------------------------
 */

const OCR_REGION_PRESETS = {
  difficulty: [
    { name: 'binary-dark', scale: 3.0, grayscale: true, contrast: 1.6, threshold: 'otsu', invert: true },
    { name: 'binary-soft', scale: 2.5, grayscale: true, contrast: 1.25, threshold: 185, invert: true },
  ],
  title: [
    { name: 'contrast', scale: 2.0, grayscale: true, contrast: 1.7 },
    { name: 'title-binary', scale: 2.2, grayscale: true, contrast: 1.35, threshold: 'otsu', invert: false },
  ],
  breakdown: [
    { name: 'breakdown-plain', scale: 2.6, grayscale: true, contrast: 1.45 },
    { name: 'breakdown-binary', scale: 2.8, grayscale: true, contrast: 1.4, threshold: 'otsu', invert: false },
    { name: 'breakdown-invert', scale: 2.8, grayscale: true, contrast: 1.35, threshold: 'otsu', invert: true },
  ],
  combo: [
    { name: 'combo-contrast', scale: 3.0, grayscale: true, contrast: 1.7 },
    { name: 'combo-binary', scale: 3.0, grayscale: true, contrast: 1.45, threshold: 'otsu', invert: false },
  ],
};

function clamp255(n) {
  return Math.max(0, Math.min(255, n));
}

function createCropCanvas(imageElement, xRatio, yRatio, wRatio, hRatio, scale = 1) {
  const canvas = document.createElement('canvas');
  const srcW = imageElement.naturalWidth || 0;
  const srcH = imageElement.naturalHeight || 0;
  const cropW = Math.max(1, Math.round(srcW * wRatio));
  const cropH = Math.max(1, Math.round(srcH * hRatio));
  canvas.width = Math.max(1, Math.round(cropW * scale));
  canvas.height = Math.max(1, Math.round(cropH * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    imageElement,
    Math.round(srcW * xRatio),
    Math.round(srcH * yRatio),
    cropW,
    cropH,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function toGray(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function computeOtsuThreshold(data) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    hist[Math.round(toGray(data[i], data[i + 1], data[i + 2]))]++;
  }

  let total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

function applySharpen(canvas) {
  const src = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = src.getImageData(0, 0, width, height);
  const data = imageData.data;
  const out = new Uint8ClampedArray(data.length);

  const get = (x, y, c) => data[(y * width + x) * 4 + c];
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const weight = kernel[(ky + 1) * 3 + (kx + 1)];
          r += get(px, py, 0) * weight;
          g += get(px, py, 1) * weight;
          b += get(px, py, 2) * weight;
        }
      }
      const idx = (y * width + x) * 4;
      out[idx] = clamp255(r);
      out[idx + 1] = clamp255(g);
      out[idx + 2] = clamp255(b);
      out[idx + 3] = data[idx + 3];
    }
  }

  imageData.data.set(out);
  src.putImageData(imageData, 0, 0);
}

function preprocessCanvas(baseCanvas, preset) {
  const srcCanvas = document.createElement('canvas');
  const scale = preset.scale || 1;
  srcCanvas.width = baseCanvas.width;
  srcCanvas.height = baseCanvas.height;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(baseCanvas, 0, 0);

  const w = Math.max(1, Math.round(baseCanvas.width * scale / 1));
  const h = Math.max(1, Math.round(baseCanvas.height * scale / 1));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(srcCanvas, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const doGray = preset.grayscale !== false;
  const contrast = typeof preset.contrast === 'number' ? preset.contrast : 1;
  const threshold = preset.threshold;
  const invert = !!preset.invert;

  let tValue = null;
  if (threshold === 'otsu') {
    tValue = computeOtsuThreshold(data);
  } else if (typeof threshold === 'number') {
    tValue = threshold;
  }

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (doGray) {
      const gray = toGray(r, g, b);
      r = g = b = gray;
    }

    if (contrast !== 1) {
      const factor = contrast;
      r = (r - 128) * factor + 128;
      g = (g - 128) * factor + 128;
      b = (b - 128) * factor + 128;
    }

    if (tValue !== null) {
      const gray = toGray(r, g, b);
      const bin = gray >= tValue ? 255 : 0;
      r = g = b = invert ? (255 - bin) : bin;
    } else if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas, threshold: tValue };
}

function buildRegionCropPreview(imageElement, region, preset) {
  const baseCanvas = createCropCanvas(imageElement, region.x, region.y, region.w, region.h, preset.scale || 1);
  const processed = preprocessCanvas(baseCanvas, preset);
  return {
    baseCanvas,
    processedCanvas: processed.canvas,
    threshold: processed.threshold,
  };
}

async function recognizeRegionCandidate(worker, imageElement, region, preset, lang) {
  const crop = buildRegionCropPreview(imageElement, region, preset);
  const ret = await worker.recognize(crop.processedCanvas, { lang });
  return {
    presetName: preset.name,
    threshold: crop.threshold,
    rawText: (ret && ret.data && ret.data.text) ? ret.data.text : '',
    confidence: (ret && ret.data && typeof ret.data.confidence === 'number') ? ret.data.confidence : 0,
    cropDataUrl: crop.baseCanvas.toDataURL('image/png'),
    processedDataUrl: crop.processedCanvas.toDataURL('image/png'),
  };
}

function detectDifficultyCode(diffText) {
  const cleaned = (diffText || '').toUpperCase().replace(/[^A-Z]/g, '');
  const words = Object.keys(DIFF_WORD_TO_CODE);
  if (!cleaned) return 'EX';

  for (const word of words) {
    if (cleaned.includes(word)) return DIFF_WORD_TO_CODE[word];
  }
  let bestWord = 'EXPERT', bestDist = Infinity;
  for (const word of words) {
    const dist = levenshtein(cleaned, word) / Math.max(cleaned.length, word.length);
    if (dist < bestDist) { bestDist = dist; bestWord = word; }
  }
  return DIFF_WORD_TO_CODE[bestWord];
}

const DIFF_WORD_TO_CODE = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MS', APPEND: 'AP' };

function parseBreakdownText(text) {
  const lines = (text || '').split('\n');
  let perfect = 0, great = 0, good = 0, bad = 0, miss = 0;
  const parseLine = (line, regex) => {
    if (regex.test(line)) {
      const nums = line.match(/\d+/g);
      if (nums) return parseInt(nums[nums.length - 1], 10);
    }
    return 0;
  };
  lines.forEach(line => {
    if (/PERFECT/i.test(line)) perfect = parseLine(line, /PERFECT/i);
    if (/GREAT/i.test(line)) great = parseLine(line, /GREAT/i);
    if (/G[O0QD]{2}D/i.test(line)) good = parseLine(line, /G[O0QD]{2}D/i);
    if (/BAD/i.test(line)) bad = parseLine(line, /BAD/i);
    if (/MISS/i.test(line)) miss = parseLine(line, /MISS/i);
  });
  return { perfect, great, good, bad, miss };
}

function parseComboText(text) {
  const matches = (text || '').match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  let best = matches[0];
  for (const m of matches) {
    if (m.length > best.length) best = m;
  }
  return parseInt(best, 10);
}

function normalizeOCRText(text) {
  return (text || '').replace(/\r/g, '').trim();
}

function getMusicMatchScore(ocrText, matchedMusic) {
  if (!matchedMusic) return 0;
  const a = normalizeString(ocrText);
  const b = normalizeString(matchedMusic.title);
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return Math.max(0, 100 - Math.round((dist / Math.max(a.length, b.length)) * 100));
}

function chooseBestCandidate(candidates, scorer) {
  let best = null;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const score = scorer(cand);
    cand.score = score;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

function buildRegionLog(regionKey, region, candidates, selected, extra = {}) {
  return {
    key: regionKey,
    region: { x: region.x, y: region.y, w: region.w, h: region.h },
    candidates: candidates.map(c => ({
      presetName: c.presetName,
      confidence: c.confidence,
      rawText: c.rawText,
      threshold: c.threshold,
      cropDataUrl: c.cropDataUrl,
      processedDataUrl: c.processedDataUrl,
      score: c.score,
      parsed: c.parsed || null,
      matchedTitle: c.matchedTitle || null,
      matchedMusicId: c.matchedMusicId || null,
      diffCode: c.diffCode || null,
    })),
    selected: selected ? {
      presetName: selected.presetName,
      confidence: selected.confidence,
      rawText: selected.rawText,
      parsed: selected.parsed || null,
      matchedTitle: selected.matchedTitle || null,
      matchedMusicId: selected.matchedMusicId || null,
      diffCode: selected.diffCode || null,
      score: selected.score,
    } : null,
    ...extra,
  };
}

async function analyzeLoadedImage(imgElement, worker, regions) {
  const r = regions || DEFAULT_REGIONS;
  try {
    const imageMeta = {
      width: imgElement.naturalWidth || 0,
      height: imgElement.naturalHeight || 0,
    };

    // 難易度
    const diffCandidatesRaw = [];
    for (const preset of OCR_REGION_PRESETS.difficulty) {
      diffCandidatesRaw.push(await recognizeRegionCandidate(worker, imgElement, r.difficulty, preset, 'eng'));
    }
    diffCandidatesRaw.forEach(c => {
      const code = detectDifficultyCode(c.rawText.toUpperCase());
      c.diffCode = code;
      c.parsed = { code, label: getDiffLabel(code) };
    });
    const bestDiff = chooseBestCandidate(diffCandidatesRaw, (c) => {
      const text = (c.rawText || '').toUpperCase();
      let score = c.confidence || 0;
      for (const word of Object.keys(DIFF_WORD_TO_CODE)) {
        if (text.includes(word)) score += 35;
      }
      if (c.diffCode) score += 10;
      return score;
    });
    const diffCode = bestDiff ? bestDiff.diffCode : 'EX';
    const dbKey = getDiffDbKey(diffCode);

    // 曲名
    const titleCandidatesRaw = [];
    for (const preset of OCR_REGION_PRESETS.title) {
      titleCandidatesRaw.push(await recognizeRegionCandidate(worker, imgElement, r.title, preset, 'jpn'));
    }
    titleCandidatesRaw.forEach(c => {
      const matchedMusic = findBestMatchMusic(normalizeOCRText(c.rawText));
      c.matchedMusicId = matchedMusic ? matchedMusic.id : null;
      c.matchedTitle = matchedMusic ? matchedMusic.title : null;
      c.parsed = { title: c.matchedTitle || normalizeOCRText(c.rawText), musicId: c.matchedMusicId };
    });
    const bestTitle = chooseBestCandidate(titleCandidatesRaw, (c) => {
      const matchedMusic = c.matchedTitle ? { title: c.matchedTitle } : null;
      let score = c.confidence || 0;
      score += getMusicMatchScore(c.rawText, matchedMusic);
      if (c.matchedMusicId) score += 25;
      return score;
    });
    const matchedMusic = bestTitle && bestTitle.matchedMusicId ? dbMusics.find(m => m.id === bestTitle.matchedMusicId) : findBestMatchMusic(normalizeOCRText(bestTitle ? bestTitle.rawText : ''));
    const finalTitle = matchedMusic ? matchedMusic.title : normalizeOCRText(bestTitle ? bestTitle.rawText : '');
    const musicId = matchedMusic ? matchedMusic.id : (bestTitle ? bestTitle.matchedMusicId : null);

    // レベル / API総ノーツ数
    let level = '';
    if (musicId) level = getLevelFromDb(musicId, dbKey) || '';
    const apiNotesTotal = (musicId ? getNotesTotalFromDb(musicId, dbKey) : null);

    // 判定内訳
    const breakdownCandidatesRaw = [];
    for (const preset of OCR_REGION_PRESETS.breakdown) {
      breakdownCandidatesRaw.push(await recognizeRegionCandidate(worker, imgElement, r.breakdown, preset, 'jpn'));
    }
    breakdownCandidatesRaw.forEach(c => {
      const parsed = parseBreakdownText(c.rawText);
      c.parsed = parsed;
      c.total = parsed.perfect + parsed.great + parsed.good + parsed.bad + parsed.miss;
      c.recognizedLabels = ['perfect', 'great', 'good', 'bad', 'miss'].filter(k => new RegExp(k.toUpperCase(), 'i').test(c.rawText || '')).length;
    });
    const bestBreakdown = chooseBestCandidate(breakdownCandidatesRaw, (c) => {
      let score = c.confidence || 0;
      score += (c.recognizedLabels || 0) * 18;
      if (apiNotesTotal !== null && c.total === apiNotesTotal) score += 80;
      if (c.total > 0) score += 10;
      return score;
    });
    const breakdown = bestBreakdown ? bestBreakdown.parsed : { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

    // コンボ数
    const comboCandidatesRaw = [];
    for (const preset of OCR_REGION_PRESETS.combo) {
      comboCandidatesRaw.push(await recognizeRegionCandidate(worker, imgElement, r.combo, preset, 'eng'));
    }
    comboCandidatesRaw.forEach(c => {
      c.parsed = { combo: parseComboText(c.rawText) };
    });
    const bestCombo = chooseBestCandidate(comboCandidatesRaw, (c) => {
      let score = c.confidence || 0;
      if ((c.parsed && c.parsed.combo > 0)) score += Math.min(20, String(c.parsed.combo).length * 4);
      if (/\d/.test(c.rawText || '')) score += 10;
      return score;
    });
    const combo = bestCombo && bestCombo.parsed ? bestCombo.parsed.combo : 0;

    const totalNotes = breakdown.perfect + breakdown.great + breakdown.good + breakdown.bad + breakdown.miss;

    const debug = {
      imageMeta,
      diff: buildRegionLog('difficulty', r.difficulty, diffCandidatesRaw, bestDiff, { diffCode, dbKey }),
      title: buildRegionLog('title', r.title, titleCandidatesRaw, bestTitle, { musicId, finalTitle, level }),
      breakdown: buildRegionLog('breakdown', r.breakdown, breakdownCandidatesRaw, bestBreakdown, { apiNotesTotal, totalNotes }),
      combo: buildRegionLog('combo', r.combo, comboCandidatesRaw, bestCombo, { combo }),
      summary: {
        title: finalTitle,
        level,
        diff: diffCode,
        totalNotes,
        apiNotesTotal,
        confidence: {
          difficulty: bestDiff ? bestDiff.confidence : 0,
          title: bestTitle ? bestTitle.confidence : 0,
          breakdown: bestBreakdown ? bestBreakdown.confidence : 0,
          combo: bestCombo ? bestCombo.confidence : 0,
        },
      },
    };

    const result = {
      title: finalTitle,
      level,
      diff: diffCode,
      perfect: breakdown.perfect,
      great: breakdown.great,
      good: breakdown.good,
      bad: breakdown.bad,
      miss: breakdown.miss,
      combo,
      musicId,
      analysisLog: debug,
    };

    return { result, debug };
  } catch (e) {
    console.error(e);
    return null;
  }
}
