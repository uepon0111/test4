/*
 * ocr-analyzer.js
 * -----------------------------------------------------------------------
 * リザルト画像から Tesseract.js (OCR) を使って情報を読み取る処理。
 * 項目ごとに前処理を変え、読み取った文字列・信頼度・二値化後画像を
 * 解析ログとして残します。
 * -----------------------------------------------------------------------
 */

function createCanvasFromCrop(imageElement, xRatio, yRatio, wRatio, hRatio, scale = 1) {
  const canvas = document.createElement('canvas');
  const imgW = imageElement.naturalWidth;
  const imgH = imageElement.naturalHeight;
  const cropW = Math.max(1, Math.round(imgW * wRatio));
  const cropH = Math.max(1, Math.round(imgH * hRatio));
  canvas.width = Math.max(1, Math.round(cropW * scale));
  canvas.height = Math.max(1, Math.round(cropH * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(imageElement, imgW * xRatio, imgH * yRatio, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function computeOtsuThreshold(source) {
  const hist = new Array(256).fill(0);
  let imageData = source;
  if (source && typeof source.getContext === 'function') {
    const ctx = source.getContext('2d', { willReadFrequently: true });
    imageData = ctx.getImageData(0, 0, source.width, source.height);
  }
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[gray]++;
  }
  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) {
      varMax = between;
      threshold = t;
    }
  }
  return threshold;
}

function applySharpen(ctx, canvas) {
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const src = new Uint8ClampedArray(img.data);
  const dst = img.data;
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += src[idx] * kernel[ki++];
          }
        }
        const di = (y * width + x) * 4 + c;
        dst[di] = clamp(Math.round(sum), 0, 255);
      }
      dst[(y * width + x) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function preprocessCanvas(canvas, opts = {}) {
  const {
    grayscale = true,
    contrast = 1.8,
    threshold = null,
    invert = false,
    sharpen = false,
  } = opts;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }
    if (contrast !== 1) {
      const v = (r - 128) * contrast + 128;
      r = g = b = v;
    }
    if (threshold !== null) {
      const thr = threshold;
      const isDarkText = (r > thr);
      const val = isDarkText ? 0 : 255;
      r = g = b = invert ? (255 - val) : val;
    } else if (invert) {
      r = 255 - r; g = 255 - g; b = 255 - b;
    }
    data[i] = clamp(Math.round(r), 0, 255);
    data[i + 1] = clamp(Math.round(g), 0, 255);
    data[i + 2] = clamp(Math.round(b), 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
  if (sharpen) applySharpen(ctx, canvas);
  return canvas;
}

function canvasToDataUrl(canvas) {
  try { return canvas.toDataURL('image/png'); }
  catch (e) { return ''; }
}

function makeRegionLog(key, region, variant, canvas, ocr) {
  return {
    key,
    variant,
    coords: { ...region },
    text: (ocr?.data?.text || '').trim(),
    confidence: typeof ocr?.data?.confidence === 'number' ? ocr.data.confidence : null,
    image: canvasToDataUrl(canvas),
  };
}

async function recognizeRegion(worker, imageElement, region, key, opts = {}) {
  const scale = opts.scale || 2;
  const canvas = createCanvasFromCrop(imageElement, region.x, region.y, region.w, region.h, scale);
  const processed = preprocessCanvas(canvas, opts.preprocess || {});
  const ocr = await worker.recognize(processed, opts.recognize || {});
  return {
    text: (ocr?.data?.text || '').replace(/\r/g, '').trim(),
    confidence: typeof ocr?.data?.confidence === 'number' ? ocr.data.confidence : 0,
    raw: ocr,
    cropImage: canvasToDataUrl(createCanvasFromCrop(imageElement, region.x, region.y, region.w, region.h, 1)),
    processedImage: canvasToDataUrl(processed),
    log: makeRegionLog(key, region, opts.variant || 'default', processed, ocr),
  };
}

function parseLevelText(text) {
  const cleaned = (text || '').replace(/[^\d]/g, ' ');
  const m = cleaned.match(/\b(\d{1,2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function parseBreakdownText(text) {
  const lines = (text || '').split('\n').map(v => v.trim()).filter(Boolean);
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
  for (const m of matches) { if (m.length > best.length) best = m; }
  return parseInt(best, 10);
}

function detectDifficultyCode(diffText) {
  const DIFF_WORD_TO_CODE = {
    EASY: 'EZ',
    NORMAL: 'NM',
    HARD: 'HD',
    EXPERT: 'EX',
    MASTER: 'MS',
    APPEND: 'AP',
  };
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

function detectDifficultyLabel(code) {
  return getDiffLabel(code || '');
}

function normalizeTitleResult(text) {
  return (text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildAnalysisDebug(regionData) {
  return {
    title: regionData.title,
    level: regionData.level,
    difficulty: regionData.difficulty,
    breakdown: regionData.breakdown,
    combo: regionData.combo,
    inference: regionData.inference,
  };
}

async function analyzeLoadedImage(imgElement, worker, regions) {
  const r = regions || DEFAULT_REGIONS;
  try {
    const diffRegion = r.difficulty;
    const titleRegion = r.title;
    const levelRegion = r.level || r.title;
    const breakdownRegion = r.breakdown;
    const comboRegion = r.combo;

    const diffResult = await recognizeRegion(worker, imgElement, diffRegion, 'difficulty', {
      scale: 3,
      preprocess: { grayscale: true, contrast: 2.2, threshold: computeOtsuThreshold(createCanvasFromCrop(imgElement, diffRegion.x, diffRegion.y, diffRegion.w, diffRegion.h, 2)), invert: false, sharpen: true },
      recognize: { lang: 'eng' },
      variant: 'threshold',
    });
    const diffCode = detectDifficultyCode(diffResult.text);
    const diffConfidence = diffResult.confidence;

    const titleStandard = await recognizeRegion(worker, imgElement, titleRegion, 'title', {
      scale: 2,
      preprocess: { grayscale: true, contrast: 1.9, threshold: null, invert: false, sharpen: true },
      recognize: { lang: 'jpn' },
      variant: 'grayscale',
    });
    const titleThreshold = await recognizeRegion(worker, imgElement, titleRegion, 'title', {
      scale: 2,
      preprocess: { grayscale: true, contrast: 2.1, threshold: computeOtsuThreshold(createCanvasFromCrop(imgElement, titleRegion.x, titleRegion.y, titleRegion.w, titleRegion.h, 2)), invert: false, sharpen: false },
      recognize: { lang: 'jpn' },
      variant: 'threshold',
    });
    const titleResult = (titleThreshold.confidence > titleStandard.confidence + 8) ? titleThreshold : titleStandard;
    const ocrTitle = normalizeTitleResult(titleResult.text);

    const levelResult = await recognizeRegion(worker, imgElement, levelRegion, 'level', {
      scale: 3,
      preprocess: { grayscale: true, contrast: 2.2, threshold: computeOtsuThreshold(createCanvasFromCrop(imgElement, levelRegion.x, levelRegion.y, levelRegion.w, levelRegion.h, 2)), invert: false, sharpen: true },
      recognize: { lang: 'eng' },
      variant: 'threshold',
    });
    const ocrLevel = parseLevelText(levelResult.text);

    const breakdownResult = await recognizeRegion(worker, imgElement, breakdownRegion, 'breakdown', {
      scale: 2,
      preprocess: { grayscale: true, contrast: 2.0, threshold: computeOtsuThreshold(createCanvasFromCrop(imgElement, breakdownRegion.x, breakdownRegion.y, breakdownRegion.w, breakdownRegion.h, 2)), invert: false, sharpen: false },
      recognize: { lang: 'jpn' },
      variant: 'threshold',
    });
    const breakdown = parseBreakdownText(breakdownResult.text);

    const comboResult = await recognizeRegion(worker, imgElement, comboRegion, 'combo', {
      scale: 3,
      preprocess: { grayscale: true, contrast: 2.4, threshold: computeOtsuThreshold(createCanvasFromCrop(imgElement, comboRegion.x, comboRegion.y, comboRegion.w, comboRegion.h, 2)), invert: false, sharpen: true },
      recognize: { lang: 'eng' },
      variant: 'digits',
    });
    const combo = parseComboText(comboResult.text);

    const totalMiss = breakdown.good + breakdown.bad + breakdown.miss;
    const totalNotes = breakdown.perfect + breakdown.great + breakdown.good + breakdown.bad + breakdown.miss;

    const evidence = {
      titleText: ocrTitle,
      titleConfidence: titleResult.confidence || titleStandard.confidence || 0,
      diffCode,
      level: ocrLevel,
      totalNotes,
      combo,
    };

    const bestMusic = resolveMusicByEvidence(evidence);
    const titleMatch = findBestMatchMusic(ocrTitle);
    const warningList = [];
    if (combo > 0 && totalNotes > 0 && combo > totalNotes) {
      warningList.push(`コンボ数(${combo})が総ノーツ数(${totalNotes})を超えています`);
    }
    if (titleResult.confidence && titleResult.confidence < 55 && bestMusic) {
      warningList.push('曲名の信頼度が低いため、難易度・レベル・ノーツ数から補正しました');
    }

    const finalTitle = bestMusic ? bestMusic.title : (titleMatch ? titleMatch.title : ocrTitle);
    const finalMusicId = bestMusic ? bestMusic.musicId : (titleMatch ? titleMatch.id : null);
    const finalDiffCode = bestMusic ? getDiffDbKey(bestMusic.diff) || diffCode : diffCode;
    const finalLevel = bestMusic ? bestMusic.level : (ocrLevel || (finalMusicId ? getLevelFromDb(finalMusicId, getDiffDbKey(finalDiffCode)) : ''));
    const finalTotalNotes = bestMusic ? bestMusic.totalNotes : totalNotes;

    return {
      title: finalTitle,
      level: finalLevel || '',
      diff: finalDiffCode,
      perfect: breakdown.perfect,
      great: breakdown.great,
      good: breakdown.good,
      bad: breakdown.bad,
      miss: breakdown.miss,
      combo: combo,
      musicId: finalMusicId,
      totalNotes: finalTotalNotes,
      debugLog: buildAnalysisDebug({
        title: {
          region: titleRegion,
          raw: ocrTitle,
          confidence: titleResult.confidence,
          standard: { text: titleStandard.text, confidence: titleStandard.confidence, cropImage: titleStandard.cropImage, processedImage: titleStandard.processedImage },
          threshold: { text: titleThreshold.text, confidence: titleThreshold.confidence, cropImage: titleThreshold.cropImage, processedImage: titleThreshold.processedImage },
          chosen: titleResult.variant,
        },
        difficulty: {
          region: diffRegion,
          raw: diffResult.text,
          confidence: diffConfidence,
          diffCode,
          cropImage: diffResult.cropImage,
          processedImage: diffResult.processedImage,
        },
        level: {
          region: levelRegion,
          raw: levelResult.text,
          confidence: levelResult.confidence,
          parsed: ocrLevel,
          cropImage: levelResult.cropImage,
          processedImage: levelResult.processedImage,
        },
        breakdown: {
          region: breakdownRegion,
          raw: breakdownResult.text,
          confidence: breakdownResult.confidence,
          parsed: breakdown,
          totalMiss,
          totalNotes,
          cropImage: breakdownResult.cropImage,
          processedImage: breakdownResult.processedImage,
        },
        combo: {
          region: comboRegion,
          raw: comboResult.text,
          confidence: comboResult.confidence,
          parsed: combo,
          cropImage: comboResult.cropImage,
          processedImage: comboResult.processedImage,
        },
        inference: {
          bestMusic: bestMusic ? {
            musicId: bestMusic.musicId,
            title: bestMusic.title,
            diff: bestMusic.diff,
            level: bestMusic.level,
            totalNotes: bestMusic.totalNotes,
            score: bestMusic.score,
          } : null,
          warnings: warningList,
          ocrTitle,
          titleConfidence: titleResult.confidence || 0,
          diffConfidence,
          evidence,
        }
      }),
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}
