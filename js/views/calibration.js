import { REGION_COLORS, REGION_LABELS, DEFAULT_DEVICE_PROFILE } from '../config.js';
import { loadProfiles, saveProfile, deleteProfile, cloneRegions } from '../ocr/deviceProfiles.js';
import { notify }  from '../notifications.js';
import { uuid }    from '../records/recordModel.js';

let _modal         = null;
let _imgEl         = null;
let _regions       = {};     // { title, diff, level, result, combo }
let _boxes         = {};     // { title: BoxEl, ... }
let _editingProfile = null;

export function openCalibration(profile = null) {
  _modal = document.getElementById('modal-calibration');
  _editingProfile = profile;
  renderProfileList();
  clearCanvas();
  _modal.hidden = false;
}

export function initCalibration() {
  _modal = document.getElementById('modal-calibration');

  document.getElementById('cal-close')?.addEventListener('click', () => { _modal.hidden = true; });
  _modal?.addEventListener('click', e => { if (e.target === _modal) _modal.hidden = true; });

  document.getElementById('cal-img-input')?.addEventListener('change', handleImageUpload);
  document.getElementById('cal-save')?.addEventListener('click', saveCalibration);
  document.getElementById('cal-cancel')?.addEventListener('click', () => { _modal.hidden = true; });
  document.getElementById('cal-new')?.addEventListener('click', () => startNewProfile());
  document.getElementById('cal-reset-regions')?.addEventListener('click', resetToDefault);
}

function renderProfileList() {
  const list = document.getElementById('cal-profile-list');
  if (!list) return;
  list.innerHTML = '';
  const profiles = loadProfiles();
  for (const p of profiles) {
    const row = document.createElement('div');
    row.className = 'cal-profile-row';
    row.innerHTML = `
      <span class="cal-profile-name">${esc(p.name)}</span>
      <div class="cal-profile-actions">
        <button class="btn btn--sm btn--outline" data-action="edit" data-id="${p.id}" title="編集">
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        </button>
        ${p.id !== 'default' ? `<button class="btn btn--sm btn--danger" data-action="delete" data-id="${p.id}" title="削除">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>` : ''}
      </div>
    `;
    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => editProfile(p));
    row.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      if (!confirm(`「${p.name}」を削除しますか？`)) return;
      deleteProfile(p.id);
      renderProfileList();
      notify('success', 'プロファイルを削除しました');
    });
    list.appendChild(row);
  }
}

function startNewProfile() {
  _editingProfile = {
    id: uuid(),
    name: '新しい機種',
    aspectRatioMin: 1.3,
    aspectRatioMax: 1.5,
    regions: cloneRegions(DEFAULT_DEVICE_PROFILE),
  };
  showEditor();
}

function editProfile(p) {
  _editingProfile = { ...p, regions: cloneRegions(p) };
  showEditor();
}

function showEditor() {
  document.getElementById('cal-list-view').hidden = true;
  document.getElementById('cal-edit-view').hidden = false;
  document.getElementById('cal-profile-name-input').value = _editingProfile.name;
  document.getElementById('cal-ratio-min').value = _editingProfile.aspectRatioMin;
  document.getElementById('cal-ratio-max').value = _editingProfile.aspectRatioMax;
  _regions = cloneRegions(_editingProfile);
  clearCanvas();
  document.getElementById('cal-img-prompt').hidden = false;
}

function clearCanvas() {
  const stage = document.getElementById('cal-stage');
  if (!stage) return;
  // Remove existing boxes
  Object.values(_boxes).forEach(b => b.el?.remove());
  _boxes = {};
  stage.innerHTML = '';
  const imgPlaceholder = document.createElement('div');
  imgPlaceholder.id = 'cal-img-prompt';
  imgPlaceholder.className = 'cal-img-prompt';
  imgPlaceholder.innerHTML = `
    <span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>
    <span>サンプル画像をアップロードして範囲を調整</span>
    <label class="btn btn--outline">
      画像を選択
      <input type="file" accept="image/*" id="cal-img-input" hidden>
    </label>
  `;
  stage.appendChild(imgPlaceholder);
  imgPlaceholder.querySelector('input').addEventListener('change', handleImageUpload);
}

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url  = URL.createObjectURL(file);
  const img  = new Image();
  img.onload = () => {
    _imgEl = img;
    buildStage(img, url);
  };
  img.src = url;
}

function buildStage(img, url) {
  const stage = document.getElementById('cal-stage');
  stage.innerHTML = '';

  const imgEl = document.createElement('img');
  imgEl.src = url;
  imgEl.className = 'cal-stage-img';
  imgEl.draggable = false;
  stage.appendChild(imgEl);

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.className = 'cal-overlay';
  stage.appendChild(overlay);

  // Create draggable boxes
  const keys = Object.keys(REGION_COLORS);
  for (const key of keys) {
    _boxes[key] = createRegionBox(overlay, key, _regions[key]);
  }

  // Update positions after image loads
  imgEl.addEventListener('load', () => refreshBoxPositions(), { once: true });
  if (imgEl.complete) refreshBoxPositions();
}

function refreshBoxPositions() {
  for (const [key, box] of Object.entries(_boxes)) {
    box.update(_regions[key]);
  }
}

function createRegionBox(container, key, region) {
  const color = REGION_COLORS[key];
  const label = REGION_LABELS[key];

  const el = document.createElement('div');
  el.className = 'cal-box';
  el.style.cssText = `border-color:${color};background:${color}22;`;
  el.innerHTML = `
    <span class="cal-box__label" style="background:${color}">${label}</span>
    <div class="cal-box__handle cal-box__handle--se" aria-hidden="true"></div>
  `;
  container.appendChild(el);

  const obj = {
    el,
    r: { ...region },
    update(r) {
      obj.r = { ...r };
      const img = container.parentElement.querySelector('.cal-stage-img');
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const offX  = rect.left  - cRect.left;
      const offY  = rect.top   - cRect.top;
      el.style.left   = (offX + r.x * rect.width) + 'px';
      el.style.top    = (offY + r.y * rect.height) + 'px';
      el.style.width  = (r.w * rect.width) + 'px';
      el.style.height = (r.h * rect.height) + 'px';
    },
    getRegion() { return { ...obj.r }; },
  };

  // Drag to move
  setupDrag(el, container, (dx, dy) => {
    const img = container.parentElement.querySelector('.cal-stage-img');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    obj.r.x = Math.max(0, Math.min(1 - obj.r.w, obj.r.x + dx / rect.width));
    obj.r.y = Math.max(0, Math.min(1 - obj.r.h, obj.r.y + dy / rect.height));
    _regions[key] = { ...obj.r };
    obj.update(obj.r);
  }, el.querySelector('.cal-box__handle--se'));

  // Resize SE handle
  const handle = el.querySelector('.cal-box__handle--se');
  setupDrag(handle, container, (dx, dy) => {
    const img = container.parentElement.querySelector('.cal-stage-img');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    obj.r.w = Math.max(0.01, Math.min(1 - obj.r.x, obj.r.w + dx / rect.width));
    obj.r.h = Math.max(0.01, Math.min(1 - obj.r.y, obj.r.h + dy / rect.height));
    _regions[key] = { ...obj.r };
    obj.update(obj.r);
  }, null, true);

  obj.update(region);
  return obj;
}

function setupDrag(el, _container, onMove, excludeEl, resizeMode = false) {
  let startX, startY;
  el.addEventListener('pointerdown', e => {
    if (!resizeMode && excludeEl && e.target === excludeEl) return;
    startX = e.clientX; startY = e.clientY;
    el.setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  });
  el.addEventListener('pointermove', e => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    onMove(e.clientX - startX, e.clientY - startY);
    startX = e.clientX; startY = e.clientY;
  });
}

function resetToDefault() {
  _regions = cloneRegions(DEFAULT_DEVICE_PROFILE);
  refreshBoxPositions();
}

async function saveCalibration() {
  if (!_editingProfile) return;
  const name     = document.getElementById('cal-profile-name-input')?.value.trim();
  const ratioMin = parseFloat(document.getElementById('cal-ratio-min')?.value) || 1.2;
  const ratioMax = parseFloat(document.getElementById('cal-ratio-max')?.value) || 1.8;

  if (!name) { notify('warning', 'プロファイル名を入力してください'); return; }

  const profile = {
    ..._editingProfile,
    name,
    aspectRatioMin: ratioMin,
    aspectRatioMax: ratioMax,
    regions: { ..._regions },
  };
  saveProfile(profile);
  renderProfileList();
  backToList();
  notify('success', `「${name}」を保存しました`);
}

function backToList() {
  document.getElementById('cal-list-view').hidden = false;
  document.getElementById('cal-edit-view').hidden = true;
  _editingProfile = null;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
