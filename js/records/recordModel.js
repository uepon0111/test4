/**
 * Derived values for a record's judge object.
 * judge = { perfect, great, good, bad, miss }
 *
 * Per spec §5:
 *  missAP  = great + good + bad + miss                       (AP基準)
 *  missAPT = great×1 + good×2 + bad×3 + miss×3              (AP基準 大会基準)
 *  missFC  = good + bad + miss                               (FC基準)
 *  isAP    = (great×1 + good×2 + bad×3 + miss×3) === 0
 *           ⟺ great=good=bad=miss=0                         (全PERFECT)
 *  isFC    = good + bad + miss === 0                        (ノーブレイク)
 */
export function computeMiss(judge) {
  const { perfect = 0, great = 0, good = 0, bad = 0, miss = 0 } = judge;
  const missAP  = great + good + bad + miss;
  const missAPT = great * 1 + good * 2 + bad * 3 + miss * 3;
  const missFC  = good + bad + miss;
  return {
    perfect,
    great,
    good,
    bad,
    miss,
    missAP,
    missAPT,
    missFC,
    isAP: missAP === 0,
    isFC: missFC === 0,
  };
}

/**
 * Get the "primary" miss count for the current mode.
 */
export function primaryMiss(m, mode) {
  if (mode === 'ap')  return m.missAP;
  if (mode === 'apt') return m.missAPT;
  return m.missFC; // 'fc'
}

/**
 * Generate a UUID v4.
 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
