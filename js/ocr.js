// js/ocr.js
import { CONFIG } from './config.js';
import { cropToCanvas, safeInt } from './utils.js';

export class OCRProcessor {
  constructor() {
    this._worker  = null;
    this._loading = false;
    this.onProgress = null;   // (percent, text) => void
  }

  async _getWorker() {
    if (this._worker) return this._worker;
    if (this._loading) {
      // 既に初期化中 - 待つ
      await new Promise(r => setTimeout(r, 500));
      return this._getWorker();
    }
    if (!window.Tesseract) throw new Error('Tesseract.js が読み込まれていません');

    this._loading = true;
    this._report(5, 'OCRエンジン初期化中...');
    try {
      this._worker = await Tesseract.createWorker(['jpn', 'eng'], 1, {
        logger: m => {
          if (m.status === 'loading tesseract core') this._report(10, 'OCRコア読み込み中...');
          if (m.status === 'loading language traineddata') this._report(30, '言語データ読み込み中...');
          if (m.status === 'initialized api')             this._report(60, 'OCR準備完了');
        },
      });
    } finally {
      this._loading = false;
    }
    this._report(100, '準備完了');
    return this._worker;
  }

  _report(pct, text) {
    if (this.onProgress) this.onProgress(pct, text);
  }

  /** 画像ファイルを処理してOCR結果を返す */
  async processImage(imgEl, regionCoords) {
    const worker = await this._getWorker();
    const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
    const results = {};

    // 各領域を順番にOCR
    const regions = [
      { key: 'title',      lang: 'jpn+eng' },
      { key: 'difficulty', lang: 'eng'     },
      { key: 'level',      lang: 'eng'     },
      { key: 'results',    lang: 'eng'     },
      { key: 'combo',      lang: 'eng'     },
    ];

    for (let i = 0; i < regions.length; i++) {
      const { key } = regions[i];
      const reg = regionCoords[key];
      if (!reg) continue;

      this._report(
        60 + Math.floor((i / regions.length) * 35),
        `${CONFIG.REGIONS[key].label}を読み取り中...`
      );

      const canvas = cropToCanvas(imgEl, reg);
      const rect = {
        left:   0, top:    0,
        width:  canvas.width,
        height: canvas.height,
      };

      try {
        const { data: { text } } = await worker.recognize(canvas, { rectangle: rect });
        results[key] = text.trim();
      } catch (e) {
        console.warn(`OCR失敗 [${key}]:`, e);
        results[key] = '';
      }
    }

    this._report(98, 'OCR完了');
    return this._parseOCRResults(results);
  }

  /** OCRテキストをパースして構造化データへ */
  _parseOCRResults(raw) {
    return {
      rawTitle:      raw.title     || '',
      title:         this._parseTitle(raw.title),
      difficulty:    this._parseDifficulty(raw.difficulty),
      level:         this._parseLevel(raw.level),
      ...this._parseResultNumbers(raw.results),
      combo:         this._parseCombo(raw.combo),
    };
  }

  _parseTitle(text) {
    if (!text) return '';
    // 不要な文字除去・整形
    return text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  _parseDifficulty(text) {
    if (!text) return null;
    const upper = text.toUpperCase();
    for (const diff of CONFIG.DIFFICULTIES) {
      if (upper.includes(diff)) return diff;
    }
    return null;
  }

  _parseLevel(text) {
    if (!text) return null;
    // "楽曲Lv.APD35" "楽曲Lv.33" などから数値を抽出
    const m = text.match(/lv\.?(?:apd)?(\d+)|(\d{2,})/i);
    if (m) return safeInt(m[1] ?? m[2]);
    // 末尾の数字
    const nums = text.match(/\d+/g);
    if (nums) return safeInt(nums[nums.length - 1]);
    return null;
  }

  _parseResultNumbers(text) {
    if (!text) return { perfect:0, great:0, good:0, bad:0, miss:0 };
    const extract = (label) => {
      const m = text.match(new RegExp(`${label}[^\\d]*(\\d+)`, 'i'));
      return m ? safeInt(m[1]) : null;
    };
    return {
      perfect: extract('PERFECT') ?? 0,
      great:   extract('GREAT')   ?? 0,
      good:    extract('GOOD')    ?? 0,
      bad:     extract('BAD')     ?? 0,
      miss:    extract('MISS')    ?? 0,
    };
  }

  _parseCombo(text) {
    if (!text) return 0;
    const m = text.match(/combo[^0-9]*([0-9]+)/i) || text.match(/([0-9]+)/);
    return m ? safeInt(m[1]) : 0;
  }

  /** OCR領域を画像上にキャンバスで可視化（要件4.1〜4.4） */
  static drawRegions(canvas, displayW, displayH, regionCoords) {
    const ctx = canvas.getContext('2d');
    canvas.width  = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    for (const [key, coords] of Object.entries(regionCoords)) {
      const info = CONFIG.REGIONS[key];
      if (!info || !coords) continue;

      const x = coords.x * displayW;
      const y = coords.y * displayH;
      const w = coords.w * displayW;
      const h = coords.h * displayH;

      // 半透明塗り
      ctx.fillStyle = info.color + '22';
      ctx.fillRect(x, y, w, h);

      // 枠線
      ctx.strokeStyle = info.color;
      ctx.lineWidth   = 2;
      ctx.strokeRect(x, y, w, h);

      // ラベル背景
      ctx.fillStyle = info.color;
      const labelW = ctx.measureText(info.label).width + 10;
      ctx.fillRect(x, y - 20, labelW, 20);

      // ラベルテキスト
      ctx.fillStyle   = '#fff';
      ctx.font        = 'bold 12px sans-serif';
      ctx.fillText(info.label, x + 5, y - 5);
    }
  }

  /** ワーカー解放 */
  async terminate() {
    if (this._worker) {
      await this._worker.terminate();
      this._worker = null;
    }
  }
}

/* ─── 領域エディタ（デバイス校正UI用） ─── */
export class RegionEditor {
  constructor(canvasEl, imgEl, regions, onUpdate) {
    this.canvas   = canvasEl;
    this.img      = imgEl;
    this.regions  = JSON.parse(JSON.stringify(regions)); // ディープコピー
    this.onUpdate = onUpdate;
    this._drag    = null;
    this._scale   = 1;

    this._resize();
    this._bind();

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const maxW = this.canvas.parentElement?.offsetWidth || 600;
    this._scale = maxW / this.img.naturalWidth;
    this.canvas.width  = maxW;
    this.canvas.height = this.img.naturalHeight * this._scale;
    this._draw();
  }

  _canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ev   = e.touches ? e.touches[0] : e;
    return {
      x: (ev.clientX - rect.left) * (this.canvas.width  / rect.width),
      y: (ev.clientY - rect.top)  * (this.canvas.height / rect.height),
    };
  }

  _hitTest(px, py) {
    const cw = this.canvas.width, ch = this.canvas.height;
    for (const [key, region] of Object.entries(this.regions)) {
      const rx = region.x * cw, ry = region.y * ch;
      const rw = region.w * cw, rh = region.h * ch;
      const HS = 12;
      // リサイズハンドル
      if (Math.abs(px - (rx + rw)) < HS && Math.abs(py - (ry + rh)) < HS)
        return { key, type: 'resize' };
      // 移動エリア
      if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh)
        return { key, type: 'move', ox: px - rx, oy: py - ry };
    }
    return null;
  }

  _bind() {
    const el = this.canvas;
    el.addEventListener('mousedown',  e => this._start(e));
    el.addEventListener('mousemove',  e => this._move(e));
    el.addEventListener('mouseup',    e => this._end(e));
    el.addEventListener('mouseleave', e => this._end(e));
    el.addEventListener('touchstart', e => { e.preventDefault(); this._start(e.touches[0]); }, { passive: false });
    el.addEventListener('touchmove',  e => { e.preventDefault(); this._move(e.touches[0]);  }, { passive: false });
    el.addEventListener('touchend',   e => this._end(e));
  }

  _start(e) {
    const p = this._canvasPos(e);
    const hit = this._hitTest(p.x, p.y);
    if (hit) {
      this._drag = { ...hit, startPos: p };
      this.canvas.style.cursor = hit.type === 'resize' ? 'se-resize' : 'grab';
    }
  }

  _move(e) {
    const p = this._canvasPos(e);
    if (!this._drag) {
      const hit = this._hitTest(p.x, p.y);
      this.canvas.style.cursor = hit
        ? (hit.type === 'resize' ? 'se-resize' : 'grab')
        : 'crosshair';
      return;
    }

    const cw = this.canvas.width, ch = this.canvas.height;
    const region = this.regions[this._drag.key];

    if (this._drag.type === 'move') {
      region.x = Math.max(0, Math.min(1 - region.w, (p.x - this._drag.ox) / cw));
      region.y = Math.max(0, Math.min(1 - region.h, (p.y - this._drag.oy) / ch));
    } else {
      region.w = Math.max(0.05, Math.min(1 - region.x, p.x / cw - region.x));
      region.h = Math.max(0.03, Math.min(1 - region.y, p.y / ch - region.y));
    }

    this._draw();
    if (this.onUpdate) this.onUpdate(this._drag.key, { ...region });
  }

  _end() {
    this._drag = null;
    this.canvas.style.cursor = 'crosshair';
  }

  _draw() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    OCRProcessor.drawRegions(this.canvas, this.canvas.width, this.canvas.height, this.regions);

    // リサイズハンドルを描画
    for (const [key, region] of Object.entries(this.regions)) {
      const info = CONFIG.REGIONS[key];
      if (!info) continue;
      const rx = region.x * this.canvas.width,  ry = region.y * this.canvas.height;
      const rw = region.w * this.canvas.width,   rh = region.h * this.canvas.height;
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = info.color;
      ctx.lineWidth   = 2;
      ctx.fillRect(rx + rw - 8, ry + rh - 8, 10, 10);
      ctx.strokeRect(rx + rw - 8, ry + rh - 8, 10, 10);
    }
  }

  getRegions() { return JSON.parse(JSON.stringify(this.regions)); }
}
