// js/sortFilter.js
import { CONFIG } from './config.js';
import { getMissCount, normalizeStr } from './utils.js';

const DO = CONFIG.DIFFICULTY_ORDER;

/* ─── ソート ─── */

function cmpName(a, b, mode) {
  // 2.14.1: 名前→難易度→ミス数→追加日
  const n = a.title.localeCompare(b.title, 'ja');
  if (n !== 0) return n;
  const d = (DO[a.difficulty] ?? 99) - (DO[b.difficulty] ?? 99);
  if (d !== 0) return d;
  const ms = getMissCount(a, mode) - getMissCount(b, mode);
  if (ms !== 0) return ms;
  return a.addedAt - b.addedAt;
}

function cmpLevel(a, b, mode) {
  // 2.14.2: レベル→難易度→名前→ミス数→追加日
  const lv = (a.level ?? 0) - (b.level ?? 0);
  if (lv !== 0) return lv;
  const d  = (DO[a.difficulty] ?? 99) - (DO[b.difficulty] ?? 99);
  if (d !== 0) return d;
  const n  = a.title.localeCompare(b.title, 'ja');
  if (n !== 0) return n;
  const ms = getMissCount(a, mode) - getMissCount(b, mode);
  if (ms !== 0) return ms;
  return a.addedAt - b.addedAt;
}

function cmpMiss(a, b, mode) {
  // 2.14.3: ミス数→レベル→難易度→名前→追加日
  const ms = getMissCount(a, mode) - getMissCount(b, mode);
  if (ms !== 0) return ms;
  const lv = (a.level ?? 0) - (b.level ?? 0);
  if (lv !== 0) return lv;
  const d  = (DO[a.difficulty] ?? 99) - (DO[b.difficulty] ?? 99);
  if (d !== 0) return d;
  const n  = a.title.localeCompare(b.title, 'ja');
  if (n !== 0) return n;
  return a.addedAt - b.addedAt;
}

function cmpDate(a, b) {
  // 2.14.4: 追加日
  return a.addedAt - b.addedAt;
}

export function sortRecords(records, sortBy, sortOrder, mode) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    switch (sortBy) {
      case 'name':  return dir * cmpName(a, b, mode);
      case 'level': return dir * cmpLevel(a, b, mode);
      case 'miss':  return dir * cmpMiss(a, b, mode);
      case 'date':
      default:      return dir * cmpDate(a, b);
    }
  });
}

/* ─── フィルター ─── */

export function filterRecords(records, filters, mode) {
  let result = records;

  // AP済み絞り込み
  if (filters.ap)  result = result.filter(r => r.isAP);
  // FC済み絞り込み
  if (filters.fc)  result = result.filter(r => r.isFC);

  // 難易度絞り込み
  if (filters.difficulties && filters.difficulties.length > 0) {
    result = result.filter(r => filters.difficulties.includes(r.difficulty));
  }

  // レベル検索
  if (filters.level !== null && filters.level !== undefined) {
    result = result.filter(r => r.level === filters.level);
  }

  // 楽曲名・読み検索
  if (filters.name && filters.name.trim()) {
    const q = normalizeStr(filters.name);
    result = result.filter(r => {
      const t  = normalizeStr(r.title || '');
      const pr = normalizeStr(r.pronunciation || '');
      return t.includes(q) || pr.includes(q);
    });
  }

  // ミス数範囲
  if (filters.missMin !== null && filters.missMin !== undefined) {
    result = result.filter(r => getMissCount(r, mode) >= filters.missMin);
  }
  if (filters.missMax !== null && filters.missMax !== undefined) {
    result = result.filter(r => getMissCount(r, mode) <= filters.missMax);
  }

  return result;
}

/* ─── 自己ベスト ─── */

/**
 * 2.15: モードに応じた自己ベスト比較
 * @returns true if newRec が oldRec より良い
 */
export function isBetterRecord(newRec, oldRec, mode) {
  if (!oldRec) return true;

  switch (mode) {
    case 'ap': {
      // AP: missAP → missAPTournament → perfect(大) → combo(大)
      if (newRec.missAP           !== oldRec.missAP)           return newRec.missAP           < oldRec.missAP;
      if (newRec.missAPTournament !== oldRec.missAPTournament) return newRec.missAPTournament < oldRec.missAPTournament;
      if (newRec.perfect          !== oldRec.perfect)          return newRec.perfect          > oldRec.perfect;
      return newRec.combo > oldRec.combo;
    }
    case 'ap_tournament': {
      // 大会: missAPTournament → perfect(大) → combo(大)
      if (newRec.missAPTournament !== oldRec.missAPTournament) return newRec.missAPTournament < oldRec.missAPTournament;
      if (newRec.perfect          !== oldRec.perfect)          return newRec.perfect          > oldRec.perfect;
      return newRec.combo > oldRec.combo;
    }
    case 'fc': {
      // FC: missFC → missAPTournament → perfect(大) → combo(大)
      if (newRec.missFC           !== oldRec.missFC)           return newRec.missFC           < oldRec.missFC;
      if (newRec.missAPTournament !== oldRec.missAPTournament) return newRec.missAPTournament < oldRec.missAPTournament;
      if (newRec.perfect          !== oldRec.perfect)          return newRec.perfect          > oldRec.perfect;
      return newRec.combo > oldRec.combo;
    }
    default: return false;
  }
}

/**
 * 各(songId,difficulty)ペアの自己ベストのみを返す
 * songIdがない場合はtitleで代替
 */
export function getBestRecords(records, mode) {
  const bestMap = new Map();

  for (const rec of records) {
    const key = `${rec.songId ?? rec.title}:${rec.difficulty}`;
    const cur = bestMap.get(key);
    if (isBetterRecord(rec, cur, mode)) {
      bestMap.set(key, rec);
    }
  }

  return Array.from(bestMap.values());
}

/**
 * 特定曲・難易度の自己ベストレコードを取得
 */
export function getPersonalBest(records, newRec, mode) {
  const key = rec => `${rec.songId ?? rec.title}:${rec.difficulty}`;
  const candidates = records.filter(r => key(r) === key(newRec) && r.id !== newRec.id);
  if (!candidates.length) return null;

  return candidates.reduce((best, r) => isBetterRecord(r, best, mode) ? r : best, candidates[0]);
}

/** アクティブフィルターの数を返す */
export function countActiveFilters(filters) {
  let count = 0;
  if (filters.ap) count++;
  if (filters.fc) count++;
  if (filters.difficulties && filters.difficulties.length) count += filters.difficulties.length;
  if (filters.level) count++;
  if (filters.name && filters.name.trim()) count++;
  if (filters.missMin !== null && filters.missMin !== undefined) count++;
  if (filters.missMax !== null && filters.missMax !== undefined) count++;
  return count;
}
