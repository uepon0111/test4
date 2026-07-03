import { cropRegion, recognizeText, preprocessCanvas } from './ocrEngine.js';
import { selectProfile } from './deviceProfiles.js';
import { findBestMatch } from '../musicDb/titleMatcher.js';
import { getMusics, getDiffs } from '../musicDb/masterData.js';

/**
 * Main entry: run full OCR pipeline on a result image.
 *
 * @param {HTMLImageElement} imgEl  - fully loaded result image
 * @param {object|null} profileOverride  - optional profile (uses auto-select if null)
 * @returns {Promise<OCRResult>}
 */
export async function parseResultImage(imgEl, profileOverride = null) {
  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;
  const profile = profileOverride ?? selectProfile(iw, ih);
  const R = profile.regions;

  const warnings   = [];
  const needsManual = {};

  /* ── Step 1: Difficulty ─────────────────────────────────────────────── */
  const diffCanvas = await cropRegion(imgEl, R.diff);
  const diffRaw    = await recognizeText(diffCanvas, 'eng');
  const difficulty = parseDifficulty(diffRaw);

  /* ── Step 2: Title ──────────────────────────────────────────────────── */
  const titleCanvas = preprocessCanvas(await cropRegion(imgEl, R.title), { contrast: 1.6 });
  const titleRaw    = await recognizeText(titleCanvas, 'jpn+eng');
  const musics      = getMusics();
  const matchResult = findBestMatch(titleRaw.trim(), musics);
  const matchedMusic = matchResult?.music ?? null;

  if (!matchedMusic) {
    warnings.push('曲名を自動認識できませんでした。手動で入力してください。');
    needsManual.title = true;
  }

  /* ── Step 3: Level ─────────────────────────────────────────────────── */
  const levelCanvas = await cropRegion(imgEl, R.level);
  const levelRaw    = await recognizeText(levelCanvas, 'eng');
  let   ocrLevel    = parseLevelNumber(levelRaw);
  let   validatedLevel = ocrLevel;
  let   dbDiffEntry = null;

  if (matchedMusic && ocrLevel !== null) {
    const diffs = getDiffs();
    dbDiffEntry = diffs.find(
      d => d.musicId === matchedMusic.id && d.musicDifficulty === difficulty,
    ) ?? null;

    if (dbDiffEntry && dbDiffEntry.playLevel !== ocrLevel) {
      // Retry level OCR once
      const lvl2Raw = await recognizeText(preprocessCanvas(levelCanvas), 'eng');
      const lvl2    = parseLevelNumber(lvl2Raw);

      if (dbDiffEntry.playLevel === lvl2) {
        validatedLevel = lvl2;
      } else {
        // Still mismatch – use DB value, flag warning
        validatedLevel = dbDiffEntry.playLevel;
        warnings.push(
          `楽曲レベルの読み取り結果（${ocrLevel}）がデータベース（${dbDiffEntry.playLevel}）と一致しません。DB値を使用しました。`,
        );
        needsManual.level = true;
      }
    } else if (dbDiffEntry) {
      validatedLevel = dbDiffEntry.playLevel;
    }
  } else if (ocrLevel === null) {
    warnings.push('楽曲レベルを読み取れませんでした。手動で入力してください。');
    needsManual.level = true;
  }

  /* ── Step 4: Result block (PERFECT / GREAT / GOOD / BAD / MISS) ───── */
  const resultCanvas = preprocessCanvas(await cropRegion(imgEl, R.result), { contrast: 1.8 });
  const resultRaw    = await recognizeText(resultCanvas, 'jpn+eng');
  let   judge        = parseJudgeBlock(resultRaw);
  let   totalNotes   = dbDiffEntry?.totalNoteCount ?? null;

  if (totalNotes !== null) {
    const ocrTotal = judge.perfect + judge.great + judge.good + judge.bad + judge.miss;
    if (ocrTotal !== totalNotes) {
      // Retry once
      const res2Raw = await recognizeText(preprocessCanvas(resultCanvas, { contrast: 2 }), 'jpn+eng');
      judge         = parseJudgeBlock(res2Raw);
      const ocrTotal2 = judge.perfect + judge.great + judge.good + judge.bad + judge.miss;
      if (ocrTotal2 !== totalNotes) {
        warnings.push(
          `リザルト合計ノーツ数（${ocrTotal}）がデータベース（${totalNotes}）と一致しません。内訳を手動で確認してください。`,
        );
        needsManual.judge = true;
      }
    }
  }

  /* ── Step 5: Combo ─────────────────────────────────────────────────── */
  const comboCanvas = await cropRegion(imgEl, R.combo);
  const comboRaw    = await recognizeText(comboCanvas, 'eng');
  const combo       = parseComboNumber(comboRaw);

  return {
    title:        matchedMusic?.title       ?? titleRaw.trim(),
    pronunciation: matchedMusic?.pronunciation ?? '',
    musicId:      matchedMusic?.id          ?? null,
    difficulty,
    level:        validatedLevel            ?? 0,
    judge,
    combo:        combo                     ?? 0,
    totalNoteCount: totalNotes,
    profileId:    profile.id,
    warnings,
    needsManual,
  };
}

/* ── Parsing helpers ────────────────────────────────────────────────────── */

function parseDifficulty(text) {
  const t = text.toUpperCase().replace(/\s/g, '');
  if (/APPEND|APD|A[-_]?PEN/.test(t)) return 'append';
  if (/MASTER/.test(t))               return 'master';
  if (/EXPERT/.test(t))               return 'expert';
  if (/HARD/.test(t))                 return 'hard';
  if (/NORMAL/.test(t))               return 'normal';
  if (/EASY/.test(t))                 return 'easy';
  return 'master'; // safest default
}

function parseLevelNumber(text) {
  // "楽曲Lv.APD35"  "楽曲Lv.33"  "35"  "APD35"
  const m = text.match(/(?:Lv\.?)?(?:APD)?(\d{1,2})/i);
  if (m) return parseInt(m[1], 10);
  const nums = text.match(/\d+/g);
  if (nums) return parseInt(nums[nums.length - 1], 10);
  return null;
}

function parseComboNumber(text) {
  // The combo number is the LAST multi-digit number after "COMBO"
  const afterCombo = text.replace(/^[\s\S]*?COMBO/i, '');
  const nums = (afterCombo || text).match(/\d+/g);
  if (!nums) return 0;
  // Filter out leading zeros pattern "0208" → 208
  return parseInt(nums[nums.length - 1], 10);
}

function parseJudgeBlock(text) {
  const judge = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
  const lines = text.split(/\n/);

  for (const line of lines) {
    const nums = line.match(/\d+/g);
    if (!nums) continue;
    // Take the last number on the line as the count
    const val = parseInt(nums[nums.length - 1], 10);
    const up  = line.toUpperCase();

    if (/PERF/.test(up))           { judge.perfect = val; }
    else if (/GREAT|GREA/.test(up)){ judge.great   = val; }
    else if (/G[O0Q]{2}D|GOOD/.test(up)) { judge.good = val; }
    else if (/BAD/.test(up))       { judge.bad     = val; }
    else if (/MISS|MIS/.test(up))  { judge.miss    = val; }
  }

  return judge;
}
