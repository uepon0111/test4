import { DIFFICULTY_RANK } from '../config.js';
import { computeMiss } from './recordModel.js';

/**
 * Sort records according to sort key + direction + evaluation mode.
 *
 * Chapter 3 priority chains:
 *  3.1 title: title(dir) → diffRank(desc) → missChain → addedAt(desc)
 *  3.2 level: level(dir) → diffRank(desc) → title(asc) → missChain → addedAt(desc)
 *  3.3 miss:  primaryMiss(dir) → restChain → level(desc) → diffRank(desc) → title(asc) → addedAt(desc)
 *  3.4 added: addedAt(dir)
 *
 * Chapter 4 miss chains (ascending = fewer misses = better):
 *  ap:  missAP  → missAPT → perfect(desc) → combo(desc)
 *  apt: missAPT → perfect(desc) → combo(desc)
 *  fc:  missFC  → missAPT → perfect(desc) → combo(desc)
 */
export function sortRecords(records, { sortKey, sortDir, mode }) {
  const dir = sortDir === 'asc' ? 1 : -1;

  // Precompute miss values once per sort call (O(n))
  const mv = new Map(records.map(r => [r.id, computeMiss(r.judge)]));

  return [...records].sort((a, b) => {
    const am = mv.get(a.id);
    const bm = mv.get(b.id);
    let d;

    /* ── 3.1 名前順 ─────────────────────────────────────────────────── */
    if (sortKey === 'title') {
      d = a.title.localeCompare(b.title, 'ja') * dir; if (d) return d;
      d = DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty]; if (d) return d;
      d = _missChain(am, bm, a, b, mode); if (d) return d;
      return _dateDesc(a, b);
    }

    /* ── 3.2 楽曲レベル順 ─────────────────────────────────────────── */
    if (sortKey === 'level') {
      d = (a.level - b.level) * dir; if (d) return d;
      d = DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty]; if (d) return d;
      d = a.title.localeCompare(b.title, 'ja'); if (d) return d;
      d = _missChain(am, bm, a, b, mode); if (d) return d;
      return _dateDesc(a, b);
    }

    /* ── 3.3 ミス数順 ──────────────────────────────────────────────── */
    if (sortKey === 'miss') {
      // Primary key: first element of the chapter-4 chain, direction applied
      const aPri = mode === 'ap' ? am.missAP : (mode === 'apt' ? am.missAPT : am.missFC);
      const bPri = mode === 'ap' ? bm.missAP : (mode === 'apt' ? bm.missAPT : bm.missFC);
      d = (aPri - bPri) * dir; if (d) return d;

      // Rest of chapter-4 chain (secondary onward, natural direction)
      if (mode === 'ap' || mode === 'fc') {
        d = am.missAPT - bm.missAPT; if (d) return d;
      }
      d = bm.perfect - am.perfect;         if (d) return d;
      d = (b.combo ?? 0) - (a.combo ?? 0); if (d) return d;

      // 3.3 secondary: level desc → diffRank desc → title asc → addedAt desc
      d = b.level - a.level; if (d) return d;
      d = DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty]; if (d) return d;
      d = a.title.localeCompare(b.title, 'ja'); if (d) return d;
      return _dateDesc(a, b);
    }

    /* ── 3.4 追加日順 ──────────────────────────────────────────────── */
    if (sortKey === 'added') {
      return (new Date(a.addedAt) - new Date(b.addedAt)) * dir;
    }

    return 0;
  });
}

/**
 * Full chapter-4 miss chain used as secondary sort in 3.1 and 3.2.
 * am/bm = computeMiss results; a/b = full record objects (for .combo).
 */
function _missChain(am, bm, a, b, mode) {
  let d;
  if (mode === 'ap') {
    d = am.missAP - bm.missAP;   if (d) return d;
    d = am.missAPT - bm.missAPT; if (d) return d;
  } else if (mode === 'apt') {
    d = am.missAPT - bm.missAPT; if (d) return d;
  } else { // 'fc'
    d = am.missFC - bm.missFC;   if (d) return d;
    d = am.missAPT - bm.missAPT; if (d) return d;
  }
  d = bm.perfect - am.perfect;         if (d) return d;
  return (b.combo ?? 0) - (a.combo ?? 0); // more combo = better
}

function _dateDesc(a, b) {
  return new Date(b.addedAt) - new Date(a.addedAt);
}
