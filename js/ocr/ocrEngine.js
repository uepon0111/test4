/**
 * Thin wrapper around Tesseract.js (loaded globally via CDN).
 * Provides image cropping and text recognition helpers.
 */

let _worker = null;
let _workerReady = false;

/** Initialize the Tesseract worker (call once). */
export async function initOCRWorker() {
  if (_workerReady) return;
  // Tesseract is available as window.Tesseract from CDN script tag
  _worker = await Tesseract.createWorker(['jpn', 'eng'], 1, {
    logger: () => {}, // silence progress logs
  });
  _workerReady = true;
}

/** Tear down the worker. */
export async function terminateOCRWorker() {
  if (_worker) { await _worker.terminate(); _worker = null; _workerReady = false; }
}

/**
 * Crop a region from an HTMLImageElement and return it as an ImageBitmap.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imgEl
 * @param {{ x, y, w, h }} region  - fractions of image width/height
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function cropRegion(imgEl, region) {
  const iw = imgEl.naturalWidth  ?? imgEl.width;
  const ih = imgEl.naturalHeight ?? imgEl.height;
  const x  = Math.round(region.x * iw);
  const y  = Math.round(region.y * ih);
  const w  = Math.round(region.w * iw);
  const h  = Math.round(region.h * ih);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/**
 * Recognize text from a canvas or image element.
 *
 * @param {HTMLCanvasElement|HTMLImageElement} source
 * @param {string} lang  'jpn'|'eng'|'jpn+eng'
 * @returns {Promise<string>} recognized text
 */
export async function recognizeText(source, lang = 'eng') {
  if (!_workerReady) await initOCRWorker();

  // Convert to data URL for Tesseract
  let dataUrl;
  if (source instanceof HTMLCanvasElement) {
    dataUrl = source.toDataURL('image/png');
  } else {
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = source.naturalWidth  || source.width;
    tmpCanvas.height = source.naturalHeight || source.height;
    tmpCanvas.getContext('2d').drawImage(source, 0, 0);
    dataUrl = tmpCanvas.toDataURL('image/png');
  }

  const { data } = await _worker.recognize(dataUrl);
  return data.text;
}

/**
 * Preprocess a canvas for OCR (increase contrast, optional threshold).
 * Returns a new canvas with the processed image.
 */
export function preprocessCanvas(canvas, { invert = false, contrast = 1.5 } = {}) {
  const out = document.createElement('canvas');
  out.width  = canvas.width;
  out.height = canvas.height;
  const ctx  = out.getContext('2d');
  ctx.filter = `contrast(${contrast}) brightness(${invert ? 0 : 1.1})`;
  ctx.drawImage(canvas, 0, 0);
  if (invert) {
    // pixel invert for dark text on dark bg
    const id = ctx.getImageData(0, 0, out.width, out.height);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(id, 0, 0);
  }
  return out;
}

/** Draw colored region overlays on a canvas that already shows the image. */
export function drawRegionOverlays(ctx, imgW, imgH, regions, colors, labels) {
  const fSize = Math.max(14, Math.round(imgW * 0.012));
  ctx.lineWidth = Math.max(2, Math.round(imgW * 0.002));

  for (const [key, r] of Object.entries(regions)) {
    const color = colors[key];
    const label = labels[key];
    const rx = r.x * imgW;
    const ry = r.y * imgH;
    const rw = r.w * imgW;
    const rh = r.h * imgH;

    // Border
    ctx.strokeStyle = color;
    ctx.strokeRect(rx, ry, rw, rh);
    // Fill
    ctx.fillStyle   = color + '28';
    ctx.fillRect(rx, ry, rw, rh);
    // Label background
    ctx.font        = `bold ${fSize}px sans-serif`;
    const tw        = ctx.measureText(label).width;
    const labelY    = ry > fSize + 6 ? ry - fSize - 4 : ry + rh + 4;
    ctx.fillStyle   = color;
    ctx.fillRect(rx, labelY, tw + 10, fSize + 6);
    // Label text
    ctx.fillStyle   = '#fff';
    ctx.fillText(label, rx + 5, labelY + fSize + 1);
  }
}
