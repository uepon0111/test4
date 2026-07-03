import { computeMiss } from './recordModel.js';

/**
 * From a list of (already filtered, non-deleted) records,
 * return only the best record per (musicId, difficulty) group.
 *
 * "Best" is determined by the chapter-4 miss chain for the given mode.
 * Ties broken by: primaryMiss → secondaryChain → perfect(desc) → combo(desc) → addedAt(asc = older preferred)
 *
 * @param {object[]} records
 * @param {string} mode  'ap'|'apt'|'fc'
 * @returns {object[]}
 */
export function getBestRecords(records, mode) {
  const groups = new Map();
  for (const rec of records) {
    const key = `${rec.musicId ?? rec.title}__${rec.difficulty}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    const best = group.reduce((a, b) => compareForBest(a, b, mode) <= 0 ? a : b);
    result.push(best);
  }
  return result;
}

/**
 * Returns <0 if a is better, >0 if b is better.
 */
function compareForBest(a, b, mode) {
  const am = computeMiss(a.judge);
  const bm = computeMiss(b.judge);
  let d;

  if (mode === 'ap') {
    d = am.missAP - bm.missAP;   if (d) return d;
    d = am.missAPT - bm.missAPT; if (d) return d;
  } else if (mode === 'apt') {
    d = am.missAPT - bm.missAPT; if (d) return d;
  } else {
    d = am.missFC - bm.missFC;   if (d) return d;
    d = am.missAPT - bm.missAPT; if (d) return d;
  }
  d = bm.perfect - am.perfect; if (d) return d;
  d = (b.combo ?? 0) - (a.combo ?? 0); if (d) return d;
  // For same score, prefer the newer record
  return new Date(b.addedAt) - new Date(a.addedAt);
}

/**
 * Check if `newRecord` beats any existing record for the same (musicId, difficulty)
 * under ANY of the three modes.
 *
 * @param {object} newRecord
 * @param {object[]} existingRecords  non-deleted records
 * @returns {{ ap: boolean, apt: boolean, fc: boolean }}
 */
export function checkSelfBest(newRecord, existingRecords) {
  const peers = existingRecords.filter(r =>
    !r.deletedAt &&
    (r.musicId === newRecord.musicId || r.title === newRecord.title) &&
    r.difficulty === newRecord.difficulty &&
    r.id !== newRecord.id,
  );

  if (peers.length === 0) return { ap: true, apt: true, fc: true };

  const nm = computeMiss(newRecord.judge);
  const result = { ap: false, apt: false, fc: false };

  for (const mode of ['ap', 'apt', 'fc']) {
    const best = peers.reduce((a, b) => compareForBest(a, b, mode) <= 0 ? a : b);
    if (compareForBest(newRecord, best, mode) < 0) result[mode] = true;
  }
  return result;
}
