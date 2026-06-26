'use strict';

/* ========== MUSIC DATABASE ========== */
const MusicDB = (() => {
  let musics     = null; // [{id, title, pronunciation, ...}]
  let diffData   = null; // [{musicId, musicDifficulty, playLevel, totalNoteCount, ...}]
  let diffMap    = null; // musicId -> [{...}]
  let titleIndex = [];   // [{norm, item}] for fast matching

  /* Build look-up structures */
  function build() {
    diffMap = {};
    for (const d of diffData) {
      if (!diffMap[d.musicId]) diffMap[d.musicId] = [];
      diffMap[d.musicId].push(d);
    }

    titleIndex = musics.map(m => ({
      normTitle: Utils.normalizeText(m.title || ''),
      normPron:  Utils.normalizeText(m.pronunciation || ''),
      item: m,
    }));
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }

  return {
    /* Load (from cache if fresh, else fetch) */
    async load() {
      if (musics && diffData) return;

      try {
        /* Try cached copy */
        const cached = await DB.getSetting('musicDbCache');
        if (cached && cached.ts && (Date.now() - cached.ts < CONFIG.MUSIC_CACHE_TTL)) {
          musics   = cached.musics;
          diffData = cached.diffData;
          build();
          return;
        }
      } catch (_) { /* ignore */ }

      try {
        [musics, diffData] = await Promise.all([
          fetchJSON(CONFIG.MUSIC_URL),
          fetchJSON(CONFIG.MUSIC_DIFF_URL),
        ]);
        build();
        await DB.setSetting('musicDbCache', { musics, diffData, ts: Date.now() });
      } catch (e) {
        console.warn('MusicDB: could not fetch from network:', e.message);
        musics   = musics   || [];
        diffData = diffData || [];
        if (musics.length) build();
      }
    },

    get loaded() { return !!(musics && musics.length > 0); },

    /* ---- Fuzzy title search ---- */
    findBestTitle(query, topN = 3) {
      if (!titleIndex.length) return [];
      const q = Utils.normalizeText(query);
      if (!q) return [];

      const scored = titleIndex.map(entry => {
        const s1 = Utils.levenshtein(q, entry.normTitle);
        const s2 = Utils.levenshtein(q, entry.normPron);
        const score = Math.min(s1, s2);
        const ratio = score / Math.max(q.length, Math.min(entry.normTitle.length, entry.normPron.length) || 1);
        return { item: entry.item, score, ratio };
      });

      scored.sort((a, b) => a.score - b.score || a.ratio - b.ratio);
      return scored.slice(0, topN);
    },

    /* Find single best match */
    findTitle(query) {
      const results = this.findBestTitle(query, 1);
      return results.length ? results[0] : null;
    },

    /* Search by prefix (for autocomplete in manual entry) */
    searchTitles(query, limit = 8) {
      if (!musics || !query.trim()) return [];
      const q = query.toLowerCase();
      const qK = Utils.hiraToKata(q);
      const qH = Utils.kataToHira(q);
      return musics
        .filter(m =>
          (m.title || '').toLowerCase().includes(q) ||
          (m.pronunciation || '').toLowerCase().includes(q) ||
          (m.title || '').toLowerCase().includes(qK) ||
          (m.title || '').toLowerCase().includes(qH)
        )
        .slice(0, limit);
    },

    /* Get all difficulties for a music ID */
    getDifficulties(musicId) {
      if (!diffMap) return [];
      return diffMap[musicId] || [];
    },

    /* Validate that level + difficulty is consistent with DB */
    validate(musicId, difficulty, level) {
      const diffs = this.getDifficulties(musicId);
      const diffName = (difficulty || '').toUpperCase();
      return diffs.find(d =>
        d.musicDifficulty.toUpperCase() === diffName &&
        d.playLevel === level
      ) || null;
    },

    /* Get total note count for musicId + difficulty */
    getTotalNotes(musicId, difficulty) {
      const diffs = this.getDifficulties(musicId);
      const diffName = (difficulty || '').toUpperCase();
      const match = diffs.find(d => d.musicDifficulty.toUpperCase() === diffName);
      return match ? match.totalNoteCount : null;
    },

    /* Get play level for musicId + difficulty */
    getPlayLevel(musicId, difficulty) {
      const diffs = this.getDifficulties(musicId);
      const diffName = (difficulty || '').toUpperCase();
      const match = diffs.find(d => d.musicDifficulty.toUpperCase() === diffName);
      return match ? match.playLevel : null;
    },

    /* Get full difficulty record */
    getDiffRecord(musicId, difficulty) {
      const diffs = this.getDifficulties(musicId);
      const diffName = (difficulty || '').toUpperCase();
      return diffs.find(d => d.musicDifficulty.toUpperCase() === diffName) || null;
    },

    /* Get music by ID */
    getMusic(id) {
      if (!musics) return null;
      return musics.find(m => m.id === id) || null;
    },

    get musics()   { return musics   || []; },
    get diffData() { return diffData || []; },
  };
})();
