'use strict';

/* ========== OCR MODULE ========== */
const OCR = (() => {
  let _worker    = null;
  let _ready     = false;
  let _initProm  = null;

  /* Pre-process canvas for better number recognition */
  function preprocess(canvas, mode = 'auto') {
    const ctx  = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px   = data.data;

    if (mode === 'invert-threshold') {
      // For light-on-dark (game numbers): invert then threshold
      for (let i = 0; i < px.length; i += 4) {
        const g = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
        const v = g > 120 ? 255 : 0; // bright pixels (numbers) become black after invert
        px[i] = px[i+1] = px[i+2] = 255 - v; // invert
        px[i+3] = 255;
      }
    } else if (mode === 'threshold') {
      for (let i = 0; i < px.length; i += 4) {
        const g = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
        const v = g > 140 ? 0 : 255; // dark text on white
        px[i] = px[i+1] = px[i+2] = v;
        px[i+3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  /* Scale-up canvas for better OCR accuracy */
  function upscale(canvas, factor = 3) {
    const c2  = document.createElement('canvas');
    c2.width  = canvas.width  * factor;
    c2.height = canvas.height * factor;
    const ctx = c2.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
    return c2;
  }

  /* Initialise Tesseract worker */
  async function ensureWorker(onProgress) {
    if (_ready && _worker) return;
    if (_initProm) { await _initProm; return; }

    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js が読み込まれていません');
    }

    _initProm = (async () => {
      _worker = await Tesseract.createWorker('jpn+eng', 1, {
        logger: m => {
          if (onProgress && m.status === 'loading tesseract core') onProgress(0.1);
          if (onProgress && m.status === 'loading language traineddata') onProgress(0.2 + (m.progress || 0) * 0.25);
          if (onProgress && m.status === 'initializing api') onProgress(0.45);
        },
      });
      _ready = true;
    })();

    await _initProm;
  }

  /* Recognize text from a canvas */
  async function recognize(canvas, psm = 7, whitelist = null) {
    const params = {};
    if (whitelist !== null) params.tessedit_char_whitelist = whitelist;
    await _worker.setParameters({ ...params, tessedit_pageseg_mode: String(psm) });
    const { data } = await _worker.recognize(canvas);
    return data.text.trim();
  }

  /* --- Parse helpers --- */
  function parseDifficulty(text) {
    const up = text.toUpperCase().replace(/\s/g, '');
    for (const d of CONFIG.DIFFICULTIES) {
      if (up.includes(d)) return d;
    }
    // Common OCR errors
    if (up.includes('MAST')) return 'MASTER';
    if (up.includes('EXPE')) return 'EXPERT';
    if (up.includes('APPN') || up.includes('APP')) return 'APPEND';
    return null;
  }

  function parseLevel(text) {
    // "楽曲Lv.APD35" → 35,  "楽曲Lv.33" → 33,  "35" → 35
    const m = text.match(/Lv\.(?:APD)?(\d+)/i) || text.match(/(\d{1,2})$/);
    return m ? parseInt(m[1], 10) : null;
  }

  function parseResultLine(text) {
    /* Parse a block containing PERFECT/GREAT/GOOD/BAD/MISS lines.
       Returns { perfect, great, good, bad, miss } (null if not found) */
    const find = (label) => {
      const re = new RegExp(label + '[\\s:]*([0O]?\\d+)', 'i');
      const m  = text.match(re);
      if (!m) return null;
      return parseInt(m[1].replace(/O/g, '0'), 10); // OCR often reads 0 as O
    };
    return {
      perfect: find('PERFECT') ?? find('PERF'),
      great:   find('GREAT')   ?? find('GREA'),
      good:    find('GOOD'),
      bad:     find('BAD'),
      miss:    find('MISS'),
    };
  }

  function parseCombo(text) {
    const m = text.match(/COMBO\s*([0O]\d+|\d+)/i);
    if (m) return parseInt(m[1].replace(/O/g, '0'), 10);
    const m2 = text.match(/(\d+)/);
    return m2 ? parseInt(m2[1], 10) : null;
  }

  /* ========== Public API ========== */
  return {
    /* Process one image.
       regions = { title, difficulty, level, results, combo } (each {x,y,w,h})
       Returns raw OCR data object.  onProgress(0-1) */
    async processImage(imageDataUrl, regions, onProgress) {
      const update = p => { if (onProgress) onProgress(p); };

      update(0.05);
      await ensureWorker(p => update(p));
      update(0.5);

      const img = await Utils.loadImage(imageDataUrl);
      const out = {
        titleText: '', difficulty: null, level: null,
        perfect: null, great: null, good: null, bad: null, miss: null,
        combo: null,
        _raw: {},
      };

      /* --- Title --- */
      try {
        const c = upscale(Utils.cropRegion(img, regions.title), 2);
        preprocess(c, 'invert-threshold');
        out.titleText = await recognize(c, 7, '');
        out._raw.title = out.titleText;
      } catch (e) { console.warn('OCR title:', e.message); }
      update(0.60);

      /* --- Difficulty --- */
      try {
        const c = upscale(Utils.cropRegion(img, regions.difficulty), 2);
        preprocess(c, 'invert-threshold');
        const text = await recognize(c, 7, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
        out.difficulty = parseDifficulty(text);
        out._raw.difficulty = text;
      } catch (e) { console.warn('OCR difficulty:', e.message); }
      update(0.68);

      /* --- Level --- */
      try {
        const c = upscale(Utils.cropRegion(img, regions.level), 2);
        preprocess(c, 'invert-threshold');
        const text = await recognize(c, 7, '0123456789LvAPD.');
        out.level = parseLevel(text);
        out._raw.level = text;
      } catch (e) { console.warn('OCR level:', e.message); }
      update(0.76);

      /* --- Results (PERFECT/GREAT/GOOD/BAD/MISS) --- */
      try {
        const c = upscale(Utils.cropRegion(img, regions.results), 2);
        preprocess(c, 'invert-threshold');
        // PSM 6 = assume uniform block of text
        const text = await recognize(c, 6, 'PERFCTGAODBISMperfctgaodismO0123456789 \n');
        const parsed = parseResultLine(text);
        Object.assign(out, parsed);
        out._raw.results = text;
      } catch (e) { console.warn('OCR results:', e.message); }
      update(0.88);

      /* --- Combo --- */
      try {
        const c = upscale(Utils.cropRegion(img, regions.combo), 2);
        preprocess(c, 'invert-threshold');
        const text = await recognize(c, 7, 'COMBO0123456789 ');
        out.combo = parseCombo(text);
        out._raw.combo = text;
      } catch (e) { console.warn('OCR combo:', e.message); }
      update(1.0);

      return out;
    },

    /* Terminate worker (call on page unload / when done) */
    async terminate() {
      if (_worker) { try { await _worker.terminate(); } catch(_){} }
      _worker   = null;
      _ready    = false;
      _initProm = null;
    },

    /* Draw debug overlay showing OCR regions on a canvas element */
    drawOverlay(canvas, img, regions) {
      Utils.drawOCROverlay(canvas, img, regions);
    },
  };
})();
