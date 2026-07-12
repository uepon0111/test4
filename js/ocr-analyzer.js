/*
 * ocr-analyzer.js
 * -----------------------------------------------------------------------
 * OCR解析の中心ロジック。
 *   - 項目ごとに別の前処理(二値化/拡大/切り出し)を適用
 *   - 曲名は OCR 結果だけでなく、難易度・レベル・総ノーツ数からも補正
 *   - 実測ログとして、座標範囲 / 前処理後画像 / OCR結果 / 採用理由 を保持
 * -----------------------------------------------------------------------
 */

function normalizeOcrText(text) {
  return (text || '').replace(/\r/g, '\n').replace(/[^\S\n]+/g, ' ').trim();
}

function safeParseInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getOcrConfidence(result) {
  if (!result || !result.data) return 0;
  const candidates = [
    result.data.confidence,
    result.data.meanConfidence,
    result.data.ocrConfidence
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

function expandRegion(region, padX = 0, padY = 0) {
  const x = clamp((region?.x || 0) - padX, 0, 1);
  const y = clamp((region?.y || 0) - padY, 0, 1);
  const w = clamp((region?.w || 0) + (padX * 2), 0.001, 1 - x);
  const h = clamp((region?.h || 0) + (padY * 2), 0.001, 1 - y);
  return { x, y, w, h };
}

function enhanceCanvas(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const threshold = opts.threshold;
  const contrast = opts.contrast ?? 1;
  const brightness = opts.brightness ?? 0;
  const invert = !!opts.invert;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (opts.grayscale !== false) {
      const gray = (0.299 * r) + (0.587 * g) + (0.114 * b);
      r = g = b = gray;
    }

    if (contrast !== 1) {
      r = ((r - 128) * contrast) + 128;
      g = ((g - 128) * contrast) + 128;
      b = ((b - 128) * contrast) + 128;
    }

    if (brightness) {
      r += brightness;
      g += brightness;
      b += brightness;
    }

    if (typeof threshold === 'number') {
      const gray = (r + g + b) / 3;
      const bw = gray >= threshold ? 255 : 0;
      r = g = b = invert ? (255 - bw) : bw;
    } else if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    data[i] = clamp(Math.round(r), 0, 255);
    data[i + 1] = clamp(Math.round(g), 0, 255);
    data[i + 2] = clamp(Math.round(b), 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cropImage(imageElement, xRatio, yRatio, wRatio, hRatio, type = 'standard', options = {}) {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const scale = options.scale || 2;
  const padX = options.padX || 0;
  const padY = options.padY || 0;
  const region = expandRegion({ x: xRatio, y: yRatio, w: wRatio, h: hRatio }, padX, padY);
  const sx = w * region.x;
  const sy = h * region.y;
  const sw = Math.max(1, w * region.w);
  const sh = Math.max(1, h * region.h);

  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(imageElement, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (type === 'raw') {
    return Promise.resolve(canvas);
  }

  if (type === 'binary' || type === 'threshold') {
    return Promise.resolve(enhanceCanvas(canvas, {
      grayscale: true,
      threshold: options.threshold ?? 180,
      contrast: options.contrast ?? 1.35,
      brightness: options.brightness ?? 0,
      invert: options.invert ?? false,
    }));
  }

  if (type === 'light') {
    ctx.filter = `grayscale(100%) contrast(${Math.round((options.contrast || 1.45) * 100)}%) brightness(${Math.round((options.brightness || 0) * 100)}%)`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return Promise.resolve(canvas);
  }

  return Promise.resolve(enhanceCanvas(canvas, {
    grayscale: true,
    contrast: options.contrast ?? 1.55,
    brightness: options.brightness ?? 0,
    invert: options.invert ?? false,
  }));
}

async function recognizeVariant(worker, blob, lang, params = {}) {
  try {
    if (worker && typeof worker.setParameters === 'function' && params && Object.keys(params).length > 0) {
      await worker.setParameters(params);
    }
  } catch (e) {
    console.warn('Tesseract params could not be set', e);
  }

  try {
    return await worker.recognize(blob, { lang });
  } catch (e) {
    console.error('OCR failed', e);
    return { data: { text: '', confidence: 0 } };
  }
}

function detectDifficultyCode(diffText) {
  const DIFF_WORD_TO_CODE = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MS', APPEND: 'AP' };
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

function parseBreakdownText(text) {
  const lines = normalizeOcrText(text).split('\n');
  let perfect = 0, great = 0, good = 0, bad = 0, miss = 0;

  const extract = (line) => {
    const nums = (line || '').match(/\d+/g);
    if (!nums || nums.length === 0) return 0;
    return parseInt(nums[nums.length - 1], 10);
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('PERFECT')) perfect = extract(line);
    else if (upper.includes('GREAT')) great = extract(line);
    else if (/G[O0QD]{2}D/i.test(line)) good = extract(line);
    else if (upper.includes('BAD')) bad = extract(line);
    else if (upper.includes('MISS')) miss = extract(line);
  }
  return { perfect, great, good, bad, miss };
}

function parseComboText(text) {
  const matches = normalizeOcrText(text).match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  let best = matches[0];
  for (const m of matches) {
    if (m.length > best.length) best = m;
  }
  return parseInt(best, 10);
}

function chooseBestTitleAttempt(attempts, diffCode, levelText, totalNotes) {
  const ctx = {
    diffKey: getDiffDbKey(diffCode),
    level: levelText,
    totalNotes,
  };
  const candidate = inferBestMusicMatch({ attempts, ...ctx });
  if (candidate && candidate.music) {
    return candidate;
  }

  const normalizedAttempts = (attempts || []).filter(a => normalizeOcrText(a.text));
  if (normalizedAttempts.length > 0) {
    const topAttempt = normalizedAttempts.sort((a, b) => (getOcrConfidence(b) - getOcrConfidence(a)))[0];
    const matched = findBestMatchMusic(topAttempt.text);
    if (matched) {
      return {
        music: matched,
        musicId: matched.id,
        title: matched.title,
        score: titleSimilarity(topAttempt.text, matched.title),
        confidence: getOcrConfidence(topAttempt),
        reason: 'ocr',
        candidates: [],
      };
    }
    return {
      music: null,
      musicId: null,
      title: normalizeOcrText(topAttempt.text),
      score: 0,
      confidence: getOcrConfidence(topAttempt),
      reason: 'raw',
      candidates: [],
    };
  }

  return null;
}

async function analyzeDifficultyStage(imgElement, worker, region) {
  const variants = [
    { name: 'binary-160', type: 'binary', threshold: 160, scale: 3.0, params: { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } },
    { name: 'binary-190', type: 'binary', threshold: 190, scale: 3.2, params: { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } },
    { name: 'binary-220', type: 'binary', threshold: 220, scale: 3.2, params: { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } },
  ];
  const results = [];
  for (const variant of variants) {
    const canvas = await cropImage(imgElement, region.x, region.y, region.w, region.h, variant.type, variant);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const ret = await recognizeVariant(worker, blob, 'eng', variant.params);
    const text = normalizeOcrText(ret.data?.text || '');
    results.push({
      name: variant.name,
      text,
      confidence: getOcrConfidence(ret),
      previewImage: await blobToDataUrl(blob),
    });
  }

  const best = results.map(r => ({
    ...r,
    diffCode: detectDifficultyCode(r.text),
  })).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const textLenA = (a.text || '').length;
    const textLenB = (b.text || '').length;
    if (textLenB !== textLenA) return textLenB - textLenA;
    return getDiffRank(b.diffCode) - getDiffRank(a.diffCode);
  })[0] || null;

  return { results, best };
}

async function analyzeTitleStage(imgElement, worker, region, ctx) {
  const variants = [
    { name: 'gray', type: 'light', scale: 2.4, contrast: 1.45, params: { preserve_interword_spaces: '1' } },
    { name: 'binary-180', type: 'binary', threshold: 180, scale: 2.6, padX: 0.015, padY: 0.02, params: { preserve_interword_spaces: '1' } },
    { name: 'binary-210', type: 'binary', threshold: 210, scale: 2.8, padX: 0.02, padY: 0.025, params: { preserve_interword_spaces: '1' } },
  ];

  const attempts = [];
  for (const variant of variants) {
    const canvas = await cropImage(imgElement, region.x, region.y, region.w, region.h, variant.type, variant);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const ret = await recognizeVariant(worker, blob, 'jpn', variant.params);
    attempts.push({
      name: variant.name,
      text: normalizeOcrText(ret.data?.text || ''),
      confidence: getOcrConfidence(ret),
      previewImage: await blobToDataUrl(blob),
    });
  }

  const bestMatch = chooseBestTitleAttempt(attempts, ctx.diffCode, ctx.levelText, ctx.totalNotes);
  const fallbackAttempt = attempts
    .filter(a => a.text)
    .sort((a, b) => (b.confidence - a.confidence) || (b.text.length - a.text.length))[0] || null;

  let title = '';
  let musicId = null;
  let source = 'raw';
  let reason = 'OCR結果を優先';

  if (bestMatch && bestMatch.music) {
    title = bestMatch.music.title;
    musicId = bestMatch.music.id;
    source = bestMatch.reason === 'context+ocr' ? 'context+ocr' : 'ocr';
    reason = bestMatch.reason === 'context+ocr'
      ? '曲名OCRが弱かったため、難易度・レベル・総ノーツ数で補正'
      : 'OCR結果とマスターDBの一致が十分';
  } else if (fallbackAttempt) {
    title = fallbackAttempt.text;
    source = 'raw';
    reason = 'マスターDB候補が弱かったため、OCR文字列をそのまま採用';
  }

  return {
    attempts,
    bestMatch,
    fallbackAttempt,
    title,
    musicId,
    source,
    reason,
  };
}

async function analyzeBreakdownStage(imgElement, worker, region) {
  const variants = [
    { name: 'binary-165', type: 'binary', threshold: 165, scale: 2.5, padX: 0.01, padY: 0.01, params: { tessedit_char_whitelist: 'PERFECTGREATGOODBADMISS0123456789' } },
    { name: 'binary-195', type: 'binary', threshold: 195, scale: 2.7, padX: 0.01, padY: 0.01, params: { tessedit_char_whitelist: 'PERFECTGREATGOODBADMISS0123456789' } },
    { name: 'gray', type: 'light', scale: 2.3, padX: 0.01, padY: 0.01, params: { tessedit_char_whitelist: 'PERFECTGREATGOODBADMISS0123456789' } },
  ];

  const results = [];
  for (const variant of variants) {
    const canvas = await cropImage(imgElement, region.x, region.y, region.w, region.h, variant.type, variant);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const ret = await recognizeVariant(worker, blob, 'jpn', variant.params);
    results.push({
      name: variant.name,
      text: normalizeOcrText(ret.data?.text || ''),
      confidence: getOcrConfidence(ret),
      previewImage: await blobToDataUrl(blob),
    });
  }

  const parsed = results.map(r => ({ ...r, parsed: parseBreakdownText(r.text) }));
  parsed.sort((a, b) => {
    const scoreA = a.parsed.perfect + a.parsed.great + a.parsed.good + a.parsed.bad + a.parsed.miss;
    const scoreB = b.parsed.perfect + b.parsed.great + b.parsed.good + b.parsed.bad + b.parsed.miss;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.confidence - a.confidence;
  });
  return { results: parsed, best: parsed[0] || null };
}

async function analyzeComboStage(imgElement, worker, region) {
  const variants = [
    { name: 'digits-165', type: 'binary', threshold: 165, scale: 3.0, params: { tessedit_char_whitelist: '0123456789' } },
    { name: 'digits-200', type: 'binary', threshold: 200, scale: 3.2, params: { tessedit_char_whitelist: '0123456789' } },
    { name: 'gray', type: 'light', scale: 2.8, params: { tessedit_char_whitelist: '0123456789' } },
  ];

  const results = [];
  for (const variant of variants) {
    const canvas = await cropImage(imgElement, region.x, region.y, region.w, region.h, variant.type, variant);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const ret = await recognizeVariant(worker, blob, 'eng', variant.params);
    const text = normalizeOcrText(ret.data?.text || '');
    const parsed = parseComboText(text);
    results.push({
      name: variant.name,
      text,
      parsed,
      confidence: getOcrConfidence(ret),
      previewImage: await blobToDataUrl(blob),
    });
  }

  results.sort((a, b) => {
    if (b.parsed !== a.parsed) return b.parsed - a.parsed;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (b.text.length || 0) - (a.text.length || 0);
  });
  return { results, best: results[0] || null };
}

async function analyzeLoadedImage(imgElement, worker, regions, meta = {}) {
  const r = regions || DEFAULT_REGIONS;
  const debug = {
    timestamp: new Date().toISOString(),
    profileId: meta.profileId || null,
    profileName: meta.profileName || '',
    imageSize: { width: imgElement.naturalWidth || 0, height: imgElement.naturalHeight || 0 },
    totalNotes: 0,
    titleSource: '',
    stages: [],
    warnings: [],
  };

  try {
    // 難易度
    const diffRegion = r.difficulty;
    const diffStage = await analyzeDifficultyStage(imgElement, worker, diffRegion);
    const bestDiff = diffStage.best || null;
    const diffCode = bestDiff ? bestDiff.diffCode : 'EX';
    debug.stages.push({
      key: 'difficulty',
      label: '難易度',
      meta: `領域 ${formatRectForDebug(diffRegion, debug.imageSize)} / 二値化×3`,
      previewImage: bestDiff ? bestDiff.previewImage : (diffStage.results[0]?.previewImage || ''),
      rawText: diffStage.results.map(v => `[${v.name}] ${v.text || '—'} (${Math.round(v.confidence)}%)`).join('\n'),
      finalText: `${getDiffLabel(diffCode)} (${diffCode})`,
      reason: bestDiff ? `OCR結果「${bestDiff.text || '—'}」から推定` : 'OCR未検出のため既定値',
      variants: diffStage.results,
    });

    // 曲名
    const titleRegion = r.title;
    const levelText = '';
    const totalNotesHint = null;
    const titleStage = await analyzeTitleStage(imgElement, worker, titleRegion, {
      diffCode,
      levelText,
      totalNotes: totalNotesHint,
    });

    const chosenTitle = titleStage.title || '';
    let musicId = titleStage.musicId || null;
    let finalTitle = chosenTitle.replace(/\r?\n/g, '').trim();
    let titleSource = titleStage.source;
    let titleReason = titleStage.reason;
    const matchedMusic = musicId ? getMusicById(musicId) : null;
    if (matchedMusic) finalTitle = matchedMusic.title;
    debug.titleSource = titleSource;

    debug.stages.push({
      key: 'title',
      label: '曲名',
      meta: `領域 ${formatRectForDebug(titleRegion, debug.imageSize)} / OCR×3`,
      previewImage: titleStage.bestMatch?.candidates?.[0]?.previewImage || titleStage.attempts[0]?.previewImage || '',
      rawText: titleStage.attempts.map(v => `[${v.name}] ${v.text || '—'} (${Math.round(v.confidence)}%)`).join('\n'),
      finalText: finalTitle || '—',
      reason: titleReason,
      extra: titleStage.bestMatch ? `採用候補: ${titleStage.bestMatch.title} / スコア ${titleStage.bestMatch.score.toFixed(3)}` : '候補不足',
      variants: titleStage.attempts.map((v, idx) => ({
        ...v,
        confidenceText: `${Math.round(v.confidence)}%`,
        selected: idx === 0,
      })),
    });

    // レベル
    let level = '';
    if (musicId) {
      level = getLevelFromDb(musicId, getDiffDbKey(diffCode)) || '';
    }

    // 判定内訳
    const breakdownRegion = r.breakdown;
    const breakdownStage = await analyzeBreakdownStage(imgElement, worker, breakdownRegion);
    const breakdownBest = breakdownStage.best || null;
    const breakdown = breakdownBest ? breakdownBest.parsed : { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    const totalNotes = breakdown.perfect + breakdown.great + breakdown.good + breakdown.bad + breakdown.miss;
    debug.totalNotes = totalNotes;
    debug.stages.push({
      key: 'breakdown',
      label: '判定内訳',
      meta: `領域 ${formatRectForDebug(breakdownRegion, debug.imageSize)} / 二値化×3`,
      previewImage: breakdownBest ? breakdownBest.previewImage : (breakdownStage.results[0]?.previewImage || ''),
      rawText: breakdownStage.results.map(v => `[${v.name}] ${v.text || '—'} (${Math.round(v.confidence)}%)`).join('\n'),
      finalText: `P${breakdown.perfect} / G${breakdown.great} / Go${breakdown.good} / B${breakdown.bad} / M${breakdown.miss}`,
      reason: breakdownBest ? '数字が最も安定した前処理を採用' : 'OCR未検出のため0扱い',
      extra: `合計 ${totalNotes}`,
      variants: breakdownStage.results.map((v, idx) => ({
        ...v,
        confidenceText: `${Math.round(v.confidence)}%`,
        selected: idx === 0,
      })),
    });

    // ここで総ノーツ数が確定したので、曲名候補を再評価する
    const refinedTitle = chooseBestTitleAttempt(titleStage.attempts, diffCode, level, totalNotes);
    if (refinedTitle && refinedTitle.music && (!musicId || refinedTitle.score > ((titleStage.bestMatch && titleStage.bestMatch.score) || 0) + 0.05)) {
      musicId = refinedTitle.music.id;
      finalTitle = refinedTitle.title || refinedTitle.music.title;
      titleSource = refinedTitle.reason === 'context+ocr' ? 'context+ocr' : 'ocr';
      titleReason = refinedTitle.reason === 'context+ocr'
        ? '難易度・レベル・総ノーツ数を使って曲名候補を補正'
        : 'OCR候補が十分一致したためそのまま採用';
      debug.titleSource = titleSource;
    }

    const titleDebugStage = debug.stages.find(s => s.key === 'title');
    if (titleDebugStage) {
      titleDebugStage.finalText = finalTitle || '—';
      titleDebugStage.reason = titleReason;
      titleDebugStage.extra = refinedTitle && refinedTitle.music
        ? `採用候補: ${refinedTitle.title} / スコア ${refinedTitle.score.toFixed(3)}`
        : (titleStage.bestMatch ? `採用候補: ${titleStage.bestMatch.title} / スコア ${titleStage.bestMatch.score.toFixed(3)}` : '候補不足');
    }

    if (musicId) {
      level = getLevelFromDb(musicId, getDiffDbKey(diffCode)) || level || '';
    }

    // コンボ数
    const comboRegion = r.combo;
    const comboStage = await analyzeComboStage(imgElement, worker, comboRegion);
    const comboBest = comboStage.best || null;
    const combo = comboBest ? comboBest.parsed : 0;
    debug.stages.push({
      key: 'combo',
      label: 'コンボ数',
      meta: `領域 ${formatRectForDebug(comboRegion, debug.imageSize)} / 数字専用OCR`,
      previewImage: comboBest ? comboBest.previewImage : (comboStage.results[0]?.previewImage || ''),
      rawText: comboStage.results.map(v => `[${v.name}] ${v.text || '—'} => ${v.parsed} (${Math.round(v.confidence)}%)`).join('\n'),
      finalText: String(combo || 0),
      reason: comboBest ? '数字が最も大きく安定した結果を採用' : 'OCR未検出のため0扱い',
      variants: comboStage.results.map((v, idx) => ({
        ...v,
        confidenceText: `${Math.round(v.confidence)}%`,
        selected: idx === 0,
      })),
    });

    if (!finalTitle) {
      debug.warnings.push('曲名の確信度が低く、空文字に近い結果でした');
    }

    const result = {
      title: finalTitle,
      level: level,
      diff: diffCode,
      perfect: breakdown.perfect,
      great: breakdown.great,
      good: breakdown.good,
      bad: breakdown.bad,
      miss: breakdown.miss,
      combo: combo,
      totalNotes: totalNotes,
      musicId: musicId,
      debug: debug,
    };

    // 実測ログを履歴に保存
    if (typeof pushOcrDebugLog === 'function') {
      pushOcrDebugLog({
        timestamp: debug.timestamp,
        profileId: debug.profileId,
        profileName: debug.profileName,
        imageSize: debug.imageSize,
        titleSource: debug.titleSource,
        totalNotes: debug.totalNotes,
        stages: debug.stages,
        warnings: debug.warnings,
      });
    }

    return result;
  } catch (e) {
    console.error(e);
    debug.warnings.push(e && e.message ? e.message : 'unknown error');
    if (typeof pushOcrDebugLog === 'function') {
      pushOcrDebugLog({
        timestamp: debug.timestamp,
        profileId: debug.profileId,
        profileName: debug.profileName,
        imageSize: debug.imageSize,
        titleSource: debug.titleSource,
        totalNotes: debug.totalNotes,
        stages: debug.stages,
        warnings: debug.warnings,
      });
    }
    return null;
  }
}
