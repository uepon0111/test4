import { DEFAULT_CROP_REGIONS } from './constants.js';

let settingsState = {
  imageDataUrl: '',
  activeRegionKey: 'title',
  regions: JSON.parse(JSON.stringify(DEFAULT_CROP_REGIONS)),
  dragging: null,
  imageMetrics: null,
  pointerId: null,
  dirty: false
};

function getPreviewElements() {
  return {
    stage: document.getElementById('settings-preview-stage'),
    img: document.getElementById('settings-preview-image'),
    regionSelect: document.getElementById('settings-region-select')
  };
}

function cloneRegions(regions) {
  return JSON.parse(JSON.stringify(regions));
}

export function initSettingsUI(app) {
  const fileInput = document.getElementById('settings-sample-file');
  const regionSelect = document.getElementById('settings-region-select');

  regionSelect.addEventListener('change', () => {
    settingsState.activeRegionKey = regionSelect.value;
    syncInputsFromRegion();
    renderRegionBoxes();
  });

  ['settings-x','settings-y','settings-w','settings-h'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updateRegionFromInputs();
    });
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    settingsState.imageDataUrl = dataUrl;
    await loadPreviewImage(dataUrl);
    renderRegionBoxes();
  });

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  loadSettingsToUI(app.settings);
}

export function openSettingsModal(app) {
  const modal = document.getElementById('settingsModal');
  modal.style.display = 'flex';
  loadSettingsToUI(app.settings);
}

export function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

export function loadSettingsToUI(settings) {
  settingsState.regions = cloneRegions(settings.cropRegions);
  const regionKeys = Object.keys(settingsState.regions);
  settingsState.activeRegionKey = regionKeys[0] || 'title';
  const { regionSelect } = getPreviewElements();
  regionSelect.innerHTML = regionKeys.map(k => `<option value="${k}">${k}</option>`).join('');
  regionSelect.value = settingsState.activeRegionKey;

  if (settings.sampleImageDataUrl) {
    settingsState.imageDataUrl = settings.sampleImageDataUrl;
    loadPreviewImage(settings.sampleImageDataUrl);
  } else {
    document.getElementById('settings-preview-image').removeAttribute('src');
  }

  syncInputsFromRegion();
  renderRegionBoxes();
}

export function saveCropSettings(app) {
  app.settings.cropRegions = cloneRegions(settingsState.regions);
  if (settingsState.imageDataUrl) {
    app.settings.sampleImageDataUrl = settingsState.imageDataUrl;
  }
  app.persistSettings();
  window.showToast?.({ title: '設定を保存しました', message: '読み取り範囲を更新しました。', type: 'success', icon: 'check_circle' });
}

export function resetCropSettings(app) {
  settingsState.regions = cloneRegions(DEFAULT_CROP_REGIONS);
  settingsState.activeRegionKey = 'title';
  app.settings.cropRegions = cloneRegions(DEFAULT_CROP_REGIONS);
  app.settings.sampleImageDataUrl = '';
  document.getElementById('settings-sample-file').value = '';
  document.getElementById('settings-preview-image').removeAttribute('src');
  syncInputsFromRegion();
  renderRegionBoxes();
  app.persistSettings();
}

async function loadPreviewImage(dataUrl) {
  const img = document.getElementById('settings-preview-image');
  img.src = dataUrl;
  await new Promise((resolve) => {
    if (img.complete && img.naturalWidth) return resolve();
    img.onload = () => resolve();
  });
  settingsState.imageMetrics = computeImageMetrics();
}

function computeImageMetrics() {
  const stage = document.getElementById('settings-preview-stage');
  const img = document.getElementById('settings-preview-image');
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const stageRect = stage.getBoundingClientRect();
  const scale = Math.min(stageRect.width / img.naturalWidth, stageRect.height / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  const offsetX = (stageRect.width - width) / 2;
  const offsetY = (stageRect.height - height) / 2;
  return { scale, width, height, offsetX, offsetY, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

function renderRegionBoxes() {
  const stage = document.getElementById('settings-preview-stage');
  stage.querySelectorAll('.region-box').forEach(el => el.remove());
  if (!settingsState.imageDataUrl) return;

  settingsState.imageMetrics = computeImageMetrics();
  const metrics = settingsState.imageMetrics;
  if (!metrics) return;

  Object.entries(settingsState.regions).forEach(([key, region]) => {
    const box = document.createElement('div');
    box.className = 'region-box' + (key === settingsState.activeRegionKey ? ' active' : '');
    box.dataset.key = key;
    const left = metrics.offsetX + metrics.width * region.x;
    const top = metrics.offsetY + metrics.height * region.y;
    const width = metrics.width * region.w;
    const height = metrics.height * region.h;
    Object.assign(box.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });
    box.innerHTML = `
      <div class="region-handle nw" data-handle="nw"></div>
      <div class="region-handle ne" data-handle="ne"></div>
      <div class="region-handle sw" data-handle="sw"></div>
      <div class="region-handle se" data-handle="se"></div>
    `;
    box.addEventListener('pointerdown', onBoxPointerDown);
    stage.appendChild(box);
  });
}

function onBoxPointerDown(event) {
  const box = event.currentTarget;
  const handle = event.target.dataset.handle || 'move';
  const key = box.dataset.key;
  settingsState.activeRegionKey = key;
  document.getElementById('settings-region-select').value = key;
  syncInputsFromRegion();

  settingsState.dragging = {
    key,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...settingsState.regions[key] }
  };
  settingsState.pointerId = event.pointerId;
  box.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!settingsState.dragging || !settingsState.imageMetrics) return;
  const drag = settingsState.dragging;
  const metrics = settingsState.imageMetrics;
  const dx = (event.clientX - drag.startX) / metrics.width;
  const dy = (event.clientY - drag.startY) / metrics.height;
  const minSize = 0.03;
  const region = { ...drag.origin };

  if (drag.handle === 'move') {
    region.x = clamp01(drag.origin.x + dx, 0, 1 - region.w);
    region.y = clamp01(drag.origin.y + dy, 0, 1 - region.h);
  } else {
    if (drag.handle.includes('e')) region.w = clamp01(drag.origin.w + dx, minSize, 1 - region.x);
    if (drag.handle.includes('s')) region.h = clamp01(drag.origin.h + dy, minSize, 1 - region.y);
    if (drag.handle.includes('w')) {
      const newX = clamp01(drag.origin.x + dx, 0, drag.origin.x + drag.origin.w - minSize);
      region.w = clamp01(drag.origin.w - (newX - drag.origin.x), minSize, 1 - newX);
      region.x = newX;
    }
    if (drag.handle.includes('n')) {
      const newY = clamp01(drag.origin.y + dy, 0, drag.origin.y + drag.origin.h - minSize);
      region.h = clamp01(drag.origin.h - (newY - drag.origin.y), minSize, 1 - newY);
      region.y = newY;
    }
  }

  settingsState.regions[drag.key] = normalizeRegion(region);
  syncInputsFromRegion(false);
  renderRegionBoxes();
  settingsState.dirty = true;
}

function onPointerUp() {
  settingsState.dragging = null;
}

function syncInputsFromRegion(updateBoxes = false) {
  const region = settingsState.regions[settingsState.activeRegionKey];
  if (!region) return;
  document.getElementById('settings-x').value = (region.x * 100).toFixed(1);
  document.getElementById('settings-y').value = (region.y * 100).toFixed(1);
  document.getElementById('settings-w').value = (region.w * 100).toFixed(1);
  document.getElementById('settings-h').value = (region.h * 100).toFixed(1);
  if (updateBoxes) renderRegionBoxes();
}

function updateRegionFromInputs() {
  const region = settingsState.regions[settingsState.activeRegionKey];
  if (!region) return;
  const x = Number(document.getElementById('settings-x').value) / 100;
  const y = Number(document.getElementById('settings-y').value) / 100;
  const w = Number(document.getElementById('settings-w').value) / 100;
  const h = Number(document.getElementById('settings-h').value) / 100;
  settingsState.regions[settingsState.activeRegionKey] = normalizeRegion({ x, y, w, h });
  renderRegionBoxes();
}

function normalizeRegion(region) {
  const minSize = 0.03;
  let x = Number.isFinite(region.x) ? region.x : 0;
  let y = Number.isFinite(region.y) ? region.y : 0;
  let w = Number.isFinite(region.w) ? region.w : minSize;
  let h = Number.isFinite(region.h) ? region.h : minSize;
  w = Math.max(minSize, Math.min(w, 1));
  h = Math.max(minSize, Math.min(h, 1));
  x = Math.max(0, Math.min(x, 1 - w));
  y = Math.max(0, Math.min(y, 1 - h));
  return { x, y, w, h };
}

function clamp01(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getCropRegions() {
  return cloneRegions(settingsState.regions);
}

export function getSampleImageDataUrl() {
  return settingsState.imageDataUrl;
}
