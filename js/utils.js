// js/utils.js

/** ユニークID生成 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Levenshtein距離 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, (_, i) => [i]);
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[la][lb];
}

/** 文字列正規化（検索用） */
export function normalizeStr(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[　\s]+/g, '')          // 全角スペース・空白除去
    .replace(/[ァ-ン]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); // 全角→半角
}

/** 楽曲リストからクエリに最も近いものを探す（上位3件） */
export function findBestMatches(query, musics, limit = 3) {
  const q = normalizeStr(query);
  if (!q) return [];

  const scored = musics.map(m => {
    const t  = normalizeStr(m.title || '');
    const pr = normalizeStr(m.pronunciation || '');
    const dist = Math.min(
      levenshtein(q, t),
      levenshtein(q, pr),
      // 部分一致ボーナス
      t.includes(q) ? 0 : Infinity,
      pr.includes(q) ? 0 : Infinity,
    );
    return { music: m, dist };
  });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit).filter(s => s.dist < Math.max(5, q.length * 0.6));
}

/** ミス数の算出 */
export function calcMisses(great, good, bad, miss) {
  const g = great || 0, go = good || 0, b = bad || 0, m = miss || 0;
  return {
    ap:           g + go + b + m,                       // AP基準
    apTournament: g * 1 + go * 2 + b * 3 + m * 3,      // AP基準(大会)
    fc:           go + b + m,                            // FC基準
  };
}

/** 達成状況判定 */
export function calcStatus(great, good, bad, miss) {
  const { apTournament, fc } = calcMisses(great, good, bad, miss);
  return {
    isAP: apTournament === 0,
    isFC: fc === 0,
  };
}

/** モードに対応するミス数を返す */
export function getMissCount(record, mode) {
  switch (mode) {
    case 'ap':           return record.missAP;
    case 'ap_tournament':return record.missAPTournament;
    case 'fc':           return record.missFC;
    default:             return record.missAP;
  }
}

/** 日付フォーマット */
export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** 相対日付 */
export function relativeDate(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor(diff / 60000);
  if (days > 0) return `${days}日前`;
  if (hours > 0) return `${hours}時間前`;
  if (mins > 0) return `${mins}分前`;
  return 'たった今';
}

/** Blob → Object URL (使用後は revokeBlobURL で解放) */
export function createBlobURL(blob) {
  return URL.createObjectURL(blob);
}
export function revokeBlobURL(url) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** サムネイル生成 */
export async function generateThumbnail(blob, maxW = 480, maxH = 270) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob生成失敗')), 'image/jpeg', 0.82);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** 画像領域をキャンバスに切り出す（OCR用） */
export function cropToCanvas(imgEl, region) {
  const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
  const x = Math.floor(region.x * iw);
  const y = Math.floor(region.y * ih);
  const w = Math.max(1, Math.floor(region.w * iw));
  const h = Math.max(1, Math.floor(region.h * ih));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // OCRの精度向上のためにアップスケール
  const scale = Math.max(1, 200 / Math.min(w, h));
  canvas.width  = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imgEl, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** ファイルをData URLに変換 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 数値の安全なパース */
export function safeInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

/** エスケープ */
export function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** 現在のモードのラベルを返す */
export function modeLabel(mode) {
  return { ap:'AP基準', ap_tournament:'大会基準', fc:'FC基準' }[mode] || mode;
}
