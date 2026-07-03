/**
 * Find the closest music title in the master database using
 * normalized Levenshtein distance.
 * Also searches against pronunciation (読み方) for kana-based queries.
 */

/** Convert katakana to hiragana for comparison. */
function toHira(str) {
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function normalize(s) {
  return toHira(s.toLowerCase().replace(/\s/g, '').replace(/[　・]/g, ''));
}

/** Classic dynamic-programming Levenshtein distance. */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the best-matching music entry from master DB.
 *
 * @param {string} ocrText  - raw OCR text from title region
 * @param {object[]} musics - master musics array [{id, title, pronunciation}]
 * @returns {{ music: object, score: number, exact: boolean } | null}
 */
export function findBestMatch(ocrText, musics) {
  if (!musics || musics.length === 0) return null;

  const query = normalize(ocrText);
  if (!query) return null;

  let best = null;
  let bestDist = Infinity;

  for (const music of musics) {
    const t = normalize(music.title ?? '');
    const p = normalize(music.pronunciation ?? '');

    const dt = levenshtein(query, t);
    const dp = levenshtein(query, p);
    const dist = Math.min(dt, dp);

    if (dist < bestDist) {
      bestDist = dist;
      best = music;
    }
  }

  if (!best) return null;

  // Reject if distance is more than half the query length (very poor match)
  const maxAllowed = Math.max(4, Math.floor(query.length * 0.5));
  if (bestDist > maxAllowed) return null;

  return {
    music: best,
    score: bestDist,
    exact: bestDist === 0,
  };
}
