'use strict';

/* ========== UTILITIES ========== */
const Utils = {
  /* --- UUID --- */
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },

  /* --- Levenshtein distance --- */
  levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  },

  /* Best fuzzy match: returns {item, score, ratio} or null */
  bestMatch(query, candidates, keyFn) {
    if (!candidates || candidates.length === 0) return null;
    const q = this.normalizeText(query);
    if (!q) return null;
    let best = null, bestScore = Infinity;
    for (const c of candidates) {
      const text = this.normalizeText(keyFn ? keyFn(c) : String(c));
      const score = this.levenshtein(q, text);
      if (score < bestScore) { bestScore = score; best = { item: c, score, ratio: score / Math.max(q.length, text.length || 1) }; }
    }
    return best;
  },

  /* Normalize for fuzzy comparison */
  normalizeText(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[ａ-ｚＡ-Ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)); // hira→kata
  },

  /* Hiragana ↔ Katakana */
  hiraToKata(s) {
    return (s || '').replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  },
  kataToHira(s) {
    return (s || '').replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  },

  /* --- Miss calculations --- */
  calcMissAP(r)         { return (r.great||0) + (r.good||0) + (r.bad||0) + (r.miss||0); },
  calcMissAPT(r)        { return (r.great||0)*1 + (r.good||0)*2 + (r.bad||0)*3 + (r.miss||0)*3; },
  calcMissFC(r)         { return (r.good||0) + (r.bad||0) + (r.miss||0); },
  calcAllMiss(r)        { return { missAP: this.calcMissAP(r), missAPT: this.calcMissAPT(r), missFC: this.calcMissFC(r) }; },

  getMissForMode(record, mode) {
    switch (mode) {
      case 'ap':            return record.missAP  ?? this.calcMissAP(record);
      case 'ap-tournament': return record.missAPT ?? this.calcMissAPT(record);
      case 'fc':            return record.missFC  ?? this.calcMissFC(record);
      default:              return record.missAP  ?? this.calcMissAP(record);
    }
  },

  calcAchievements(r) {
    const missAP  = this.calcMissAP(r);
    const missAPT = this.calcMissAPT(r);
    const missFC  = this.calcMissFC(r);
    return {
      missAP, missAPT, missFC,
      isAP:           missAP  === 0,
      isAPTournament: missAPT === 0,
      isFC:           missFC  === 0,
    };
  },

  /* Highest achievement for a record (for badge display) */
  highestAchievement(r) {
    if (r.isAP)           return 'ap';
    if (r.isAPTournament) return 'ap-tournament';
    if (r.isFC)           return 'fc';
    return 'none';
  },

  /* --- Date utilities --- */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${dd}`;
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${this.formatDate(dateStr)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  daysUntilDelete(deletedAt) {
    if (!deletedAt) return CONFIG.TRASH_DAYS;
    const deleteDate = new Date(new Date(deletedAt).getTime() + CONFIG.TRASH_DAYS * 86400000);
    const diff = deleteDate - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  },

  /* --- Image utilities --- */
  readFileAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  },

  readFileAsArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  },

  loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
  },

  /* Resize image to thumbnail, returns data URL */
  async makeThumbnail(src, maxDim = CONFIG.THUMB_MAX) {
    const img = await this.loadImage(src);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  },

  /* Crop a region from an image element, returns canvas */
  cropRegion(img, region, scale = 1) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const x = Math.floor(region.x * W);
    const y = Math.floor(region.y * H);
    const w = Math.ceil(region.w * W);
    const h = Math.ceil(region.h * H);
    const c = document.createElement('canvas');
    c.width  = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
    return c;
  },

  /* Draw debug overlay with colored region boxes on a canvas */
  drawOCROverlay(destCanvas, img, regions) {
    const W = img.naturalWidth, H = img.naturalHeight;
    destCanvas.width  = W;
    destCanvas.height = H;
    const ctx = destCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const colors = CONFIG.OCR_REGION_COLORS;
    const labels = CONFIG.OCR_REGION_LABELS;

    for (const [key, region] of Object.entries(regions)) {
      const x = region.x * W;
      const y = region.y * H;
      const w = region.w * W;
      const h = region.h * H;
      const color = colors[key] || '#FFF';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(2, W / 400);
      ctx.strokeRect(x, y, w, h);

      // Semi-transparent fill
      ctx.fillStyle = color + '22';
      ctx.fillRect(x, y, w, h);

      // Label background
      const fontSize = Math.max(12, W / 80);
      ctx.font = `bold ${fontSize}px sans-serif`;
      const labelW = ctx.measureText(labels[key] || key).width + 8;
      const labelH = fontSize + 6;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, labelW, labelH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labels[key] || key, x + 4, y + fontSize);
      ctx.restore();
    }
  },

  /* --- Debounce --- */
  debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },

  /* --- HTML escape --- */
  esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /* --- Search scoring --- */
  matchesQuery(record, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const qK = this.hiraToKata(q);
    const qH = this.kataToHira(q);
    const title  = (record.title || '').toLowerCase();
    const pron   = (record.pronunciation || '').toLowerCase();
    return title.includes(q) || pron.includes(q) ||
           title.includes(qK) || pron.includes(qK) ||
           title.includes(qH) || pron.includes(qH);
  },

  /* --- Mobile detection --- */
  isMobile() {
    return window.matchMedia('(max-width: 859px)').matches;
  },

  /* --- Columns for current layout --- */
  getColumns() {
    const w = window.innerWidth;
    if (w >= 1400) return 4;
    if (w >= 1100) return 3;
    if (w >= 860)  return 2;
    return 1;
  },
};
