import { computeMiss, primaryMiss } from './recordModel.js';

/**
 * Filter records according to the current UI state.
 * Excludes soft-deleted records automatically.
 *
 * @param {object[]} records - all records
 * @param {object} uiState - { mode, filterStatus, filterDiffs, filterLevel,
 *                             filterMissMin, filterMissMax, filterTitle }
 * @returns {object[]} filtered records (new array)
 */
export function filterRecords(records, uiState) {
  const {
    mode, filterStatus, filterDiffs, filterLevel,
    filterMissMin, filterMissMax, filterTitle,
  } = uiState;

  return records.filter(rec => {
    // Always exclude trash
    if (rec.deletedAt) return false;

    const m = computeMiss(rec.judge);

    // ── 2.3 AP済み / FC済みで絞り込み ──────────────────────────────────
    if (filterStatus === 'ap'   && !m.isAP)  return false;
    if (filterStatus === 'fc'   && !m.isFC)  return false;
    if (filterStatus === 'nofc' &&  m.isFC)  return false;

    // ── 2.5 楽曲難易度で絞り込み ──────────────────────────────────────
    if (filterDiffs.size > 0 && !filterDiffs.has(rec.difficulty)) return false;

    // ── 2.6 楽曲レベルで検索 (exact match) ────────────────────────────
    if (filterLevel !== null && rec.level !== filterLevel) return false;

    // ── 2.4 ミス数 範囲絞り込み (current mode) ─────────────────────────
    const missVal = primaryMiss(m, mode);
    if (filterMissMin !== null && missVal < filterMissMin) return false;
    if (filterMissMax !== null && missVal > filterMissMax) return false;

    // ── 2.7 楽曲名 / 読み方で検索 ──────────────────────────────────────
    if (filterTitle) {
      const q = filterTitle.toLowerCase().replace(/\s/g, '');
      const inTitle = rec.title.toLowerCase().replace(/\s/g, '').includes(q);
      const inPron  = rec.pronunciation
        ? rec.pronunciation.toLowerCase().replace(/\s/g, '').includes(q)
        : false;
      if (!inTitle && !inPron) return false;
    }

    return true;
  });
}
