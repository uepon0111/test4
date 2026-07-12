/*
 * ocr-analyzer.js
 * -----------------------------------------------------------------------
 * リザルト画像から Tesseract.js (OCR) を使って情報を読み取る処理。
 * 読み取る範囲(座標)は「機種プロファイル」(device-profiles.js)から与えられ、
 * 設定ページで自由に調整できます。
 *
 * 読み取る項目:
 *   - 難易度 (EASY/NORMAL/HARD/EXPERT/MASTER/APPEND)
 *   - 曲名 (マスターDBとのファジーマッチングで補正)
 *   - 判定内訳 (PERFECT/GREAT/GOOD/BAD/MISS) ※元のGOOD/BAD/MISS読み取り範囲を拡張
 *   - コンボ数 ※新規追加(暫定の読み取り範囲。設定画面で調整してください)
 * -----------------------------------------------------------------------
 */

// 画像の指定範囲(比率 x,y,w,h ∈ [0,1])を切り出してCanvas化する。処理内容は元のindex.htmlと同じ。
async function cropImage(imageElement, xRatio, yRatio, wRatio, hRatio, type = 'filter-standard') {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d');

  if (type === 'threshold-diff') {
    const scale = 1.5;
    canvas.width = w * wRatio * scale;
    canvas.height = h * hRatio * scale;
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = (gray > 180) ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);
  } else {
    canvas.width = w * wRatio;
    canvas.height = h * hRatio;
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// OCRで読み取った文字列から難易度を判定する。
// 完全一致(部分文字列として含む)を優先し、見つからない場合はレーベンシュタイン距離で
// 最も近い難易度名を採用する(6種類すべてに対して一貫した精度で判定するため)。
const DIFF_WORD_TO_CODE = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MS', APPEND: 'AP' };

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

// 判定内訳のテキストから PERFECT/GREAT/GOOD/BAD/MISS の数値を読み取る。
// GOOD/BAD/MISS部分の処理は元のindex.htmlのロジックを踏襲し、PERFECT/GREATを追加しています。
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

// コンボ数のテキストから最も桁数の多い数値を採用する(ラベル文字等の誤検出を避けるため)。
function parseComboText(text) {
  const matches = (text || '').match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  let best = matches[0];
  for (const m of matches) { if (m.length > best.length) best = m; }
  return parseInt(best, 10);
}

// 画像1枚を解析する。regions には { difficulty, title, breakdown, combo } (各 {x,y,w,h}) を渡す。
async function analyzeLoadedImage(imgElement, worker, regions) {
  const r = regions || DEFAULT_REGIONS;
  try {
    // 難易度
    const diffR = r.difficulty;
    const diffBlob = await cropImage(imgElement, diffR.x, diffR.y, diffR.w, diffR.h, 'threshold-diff');
    const diffRet = await worker.recognize(diffBlob, { lang: 'eng' });
    const diffCode = detectDifficultyCode(diffRet.data.text.toUpperCase());
    const dbKey = getDiffDbKey(diffCode);

    // 曲名
    const titleR = r.title;
    const titleBlob = await cropImage(imgElement, titleR.x, titleR.y, titleR.w, titleR.h, 'filter-standard');
    const titleRet = await worker.recognize(titleBlob, { lang: 'jpn' });
    const matchedMusic = findBestMatchMusic(titleRet.data.text);
    const finalTitle = matchedMusic ? matchedMusic.title : titleRet.data.text.replace(/\r?\n/g, '').trim();
    const musicId = matchedMusic ? matchedMusic.id : null;

    // レベル
    let level = "";
    if (musicId) level = getLevelFromDb(musicId, dbKey) || "";

    // 判定内訳 (PERFECT/GREAT/GOOD/BAD/MISS)
    const bdR = r.breakdown;
    const bdBlob = await cropImage(imgElement, bdR.x, bdR.y, bdR.w, bdR.h, 'filter-standard');
    const bdRet = await worker.recognize(bdBlob, { lang: 'jpn' });
    const breakdown = parseBreakdownText(bdRet.data.text);

    // コンボ数
    const cbR = r.combo;
    const cbBlob = await cropImage(imgElement, cbR.x, cbR.y, cbR.w, cbR.h, 'filter-standard');
    const cbRet = await worker.recognize(cbBlob, { lang: 'eng' });
    const combo = parseComboText(cbRet.data.text);

    return {
      title: finalTitle, level: level, diff: diffCode,
      perfect: breakdown.perfect, great: breakdown.great,
      good: breakdown.good, bad: breakdown.bad, miss: breakdown.miss,
      combo: combo,
      musicId: musicId
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}
