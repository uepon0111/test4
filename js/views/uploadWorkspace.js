import { state }            from '../state.js';
import { DIFFICULTIES, DIFFICULTY_LABELS, REGION_COLORS, REGION_LABELS } from '../config.js';
import { parseResultImage }  from '../ocr/ocrParser.js';
import { initOCRWorker, terminateOCRWorker, drawRegionOverlays } from '../ocr/ocrEngine.js';
import { selectProfile }     from '../ocr/deviceProfiles.js';
import { addRecord }         from '../drive/database.js';
import { uploadResultImage, getFullImageURL } from '../drive/imageStorage.js';
import { checkSelfBest }     from '../records/bestRecord.js';
import { uuid } from '../records/recordModel.js';
import { notify }            from '../notifications.js';
import { refreshCardList }   from './cardList.js';

let _modal      = null;
let _queue      = [];   // [{id, file, imgEl, blobUrl, result, status}]
let _activeIdx  = -1;
let _autoMode   = true;
let _processing = false;

/* ── Public API ──────────────────────────────────────────────────────── */

export function openUploadModal() {
  _modal = document.getElementById('modal-upload');
  _modal.hidden = false;
  _queue = [];
  _activeIdx = -1;
  _processing = false;
  renderSidebar();
  showPlaceholder();
}

export function initUploadModal() {
  _modal = document.getElementById('modal-upload');
  document.getElementById('upload-close')?.addEventListener('click', closeUploadModal);
  _modal?.addEventListener('click', e => { if (e.target === _modal) closeUploadModal(); });

  // Mode radio buttons
  document.querySelectorAll('[name="register-mode"]').forEach(r =>
    r.addEventListener('change', e => { _autoMode = e.target.value === 'auto'; })
  );

  // File drop zone
  const dropZone = document.getElementById('upload-drop');
  dropZone?.addEventListener('click', () => document.getElementById('upload-file-input').click());
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });
  document.getElementById('upload-file-input')?.addEventListener('change', e => {
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  });

  // Difficulty select in form
  const diffSel = document.getElementById('up-difficulty');
  if (diffSel && !diffSel.childElementCount) {
    for (const d of DIFFICULTIES) {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = DIFFICULTY_LABELS[d];
      diffSel.appendChild(opt);
    }
  }

  // Form judge fields → recompute preview
  ['up-perfect','up-great','up-good','up-bad','up-miss'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', updateFormComputed)
  );

  document.getElementById('up-save-item')?.addEventListener('click', confirmItem);
  document.getElementById('upload-all')?.addEventListener('click', uploadAll);
  document.getElementById('up-remove-item')?.addEventListener('click', removeCurrentItem);
}

export function closeUploadModal() {
  // Cleanup blob URLs
  for (const item of _queue) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  _queue = [];
  if (_modal) _modal.hidden = true;
  terminateOCRWorker().catch(() => {});
}

/* ── Full-size image preview (opened from card) ─────────────────────── */

export async function showImagePreview(fileId) {
  if (!fileId) return;
  const previewModal = document.getElementById('modal-image-preview');
  if (!previewModal) return;
  const img = previewModal.querySelector('img');
  const spinner = previewModal.querySelector('.preview-spinner');
  if (spinner) spinner.hidden = false;
  if (img) img.src = '';
  previewModal.hidden = false;

  try {
    const url = await getFullImageURL(fileId);
    if (img) {
      img.src = url;
      img.onload = () => { if (spinner) spinner.hidden = true; };
    }
    previewModal.dataset.blobUrl = url;
  } catch (e) {
    if (spinner) spinner.hidden = true;
    notify('error', '画像の読み込みに失敗しました');
  }
}

/* ── File handling ────────────────────────────────────────────────────── */

function handleFiles(files) {
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (!imgs.length) { notify('warning', '画像ファイルを選択してください'); return; }

  for (const file of imgs) {
    const blobUrl = URL.createObjectURL(file);
    const imgEl   = new Image();
    imgEl.src     = blobUrl;
    const item = { id: uuid(), file, imgEl, blobUrl, result: null, status: 'pending', confirmed: false };
    _queue.push(item);
  }

  renderSidebar();
  if (_activeIdx < 0) selectItem(0);
  if (_autoMode) startAutoProcess();
}

function renderSidebar() {
  const list = document.getElementById('upload-sidebar');
  if (!list) return;
  list.innerHTML = '';

  if (_queue.length === 0) {
    list.innerHTML = '<p class="upload-sidebar__empty">画像を追加してください</p>';
    updateUploadBtn();
    return;
  }

  _queue.forEach((item, idx) => {
    const li = document.createElement('div');
    li.className = 'upload-sidebar-item' + (idx === _activeIdx ? ' active' : '');
    li.dataset.idx = idx;

    const statusIcon = { pending:'schedule', analyzing:'autorenew', done:'check_circle', error:'error', confirmed:'check_circle' }[item.status] ?? 'help';
    const statusClass = item.status === 'done' || item.status === 'confirmed' ? 'status--ok' :
                        item.status === 'error' ? 'status--err' :
                        item.status === 'analyzing' ? 'status--spin' : 'status--wait';

    li.innerHTML = `
      <img src="${esc(item.blobUrl)}" alt="" class="upload-sidebar-item__thumb">
      <div class="upload-sidebar-item__info">
        <span class="upload-sidebar-item__name">${esc(item.file.name)}</span>
        <span class="upload-sidebar-item__status ${statusClass}">
          <span class="material-symbols-outlined" aria-hidden="true">${statusIcon}</span>
          ${statusText(item.status, item.result)}
        </span>
      </div>
    `;
    li.addEventListener('click', () => selectItem(idx));
    list.appendChild(li);
  });

  updateUploadBtn();
}

function statusText(status, result) {
  if (status === 'pending')   return '待機中';
  if (status === 'analyzing') return '解析中…';
  if (status === 'error')     return 'エラー';
  if (status === 'confirmed') return '確認済み';
  if (status === 'done' && result?.warnings?.length) return `確認が必要 (${result.warnings.length}件)`;
  return result?.title ? esc(result.title) : '完了';
}

function selectItem(idx) {
  if (idx < 0 || idx >= _queue.length) return;
  _activeIdx = idx;
  renderSidebar();
  const item = _queue[idx];
  showItemEditor(item);
}

/* ── Item editor ─────────────────────────────────────────────────────── */

function showPlaceholder() {
  const editor = document.getElementById('upload-editor');
  if (!editor) return;
  editor.innerHTML = `
    <div class="upload-placeholder">
      <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
      <p>画像を追加すると<br>ここに表示されます</p>
    </div>
  `;
}

async function showItemEditor(item) {
  const editor = document.getElementById('upload-editor');
  if (!editor) return;

  editor.innerHTML = `
    <div class="up-editor-layout">
      <div class="up-image-pane">
        <canvas id="up-canvas" class="up-canvas"></canvas>
        <div class="up-img-status" id="up-img-status">
          ${item.status === 'analyzing' ? '<span class="spinner"></span>解析中…' : ''}
        </div>
      </div>
      <div class="up-form-pane">
        <div class="up-warnings" id="up-warnings" hidden></div>
        <div class="up-form" id="up-form">
          <div class="form-group">
            <label for="up-title">曲名</label>
            <input type="text" id="up-title" placeholder="曲名">
          </div>
          <div class="form-group">
            <label for="up-pronunciation">読み方</label>
            <input type="text" id="up-pronunciation" placeholder="よみかた">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="up-difficulty">難易度</label>
              <select id="up-difficulty">
                ${DIFFICULTIES.map(d => `<option value="${d}">${DIFFICULTY_LABELS[d]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="up-level">レベル</label>
              <input type="number" id="up-level" min="1" max="50" placeholder="35">
            </div>
          </div>
          <div class="form-section-label">リザルト内訳</div>
          <div class="judge-grid">
            <label>PERFECT<input type="number" id="up-perfect" min="0" placeholder="0"></label>
            <label>GREAT<input type="number"   id="up-great"   min="0" placeholder="0"></label>
            <label>GOOD<input type="number"    id="up-good"    min="0" placeholder="0"></label>
            <label>BAD<input type="number"     id="up-bad"     min="0" placeholder="0"></label>
            <label>MISS<input type="number"    id="up-miss"    min="0" placeholder="0"></label>
            <label>COMBO<input type="number"   id="up-combo"   min="0" placeholder="0"></label>
          </div>
          <div class="up-computed" id="up-computed"></div>
          <div class="up-form-actions">
            <button class="btn btn--danger-text" id="up-remove-item">
              <span class="material-symbols-outlined" aria-hidden="true">delete</span>除外
            </button>
            <button class="btn btn--primary" id="up-save-item">
              <span class="material-symbols-outlined" aria-hidden="true">check</span>確認
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Re-wire form events (new DOM nodes)
  ['up-perfect','up-great','up-good','up-bad','up-miss'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', updateFormComputed)
  );
  document.getElementById('up-save-item')?.addEventListener('click', confirmItem);
  document.getElementById('up-remove-item')?.addEventListener('click', removeCurrentItem);

  // Draw image on canvas with region overlays
  await drawImageWithOverlays(item);

  // Fill form from result
  if (item.result) fillFormFromResult(item.result);
  showWarnings(item.result?.warnings ?? []);
  updateFormComputed();
}

async function drawImageWithOverlays(item) {
  const canvas = document.getElementById('up-canvas');
  if (!canvas) return;

  await new Promise(res => {
    if (item.imgEl.complete) { res(); return; }
    item.imgEl.onload = res; item.imgEl.onerror = res;
  });

  const iw = item.imgEl.naturalWidth;
  const ih = item.imgEl.naturalHeight;

  // Scale to fit pane
  const pane    = canvas.parentElement;
  const maxW    = pane.clientWidth  || 600;
  const maxH    = pane.clientHeight || 400;
  const scale   = Math.min(maxW / iw, maxH / ih, 1);
  canvas.width  = Math.round(iw * scale);
  canvas.height = Math.round(ih * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(item.imgEl, 0, 0, canvas.width, canvas.height);

  // Draw region overlays if image has been analyzed (or always show defaults)
  const profileId = item.result?.profileId;
  const profiles  = (await import('../ocr/deviceProfiles.js')).loadProfiles();
  const profile   = profiles.find(p => p.id === profileId) ?? selectProfile(iw, ih);

  drawRegionOverlays(ctx, canvas.width, canvas.height, profile.regions, REGION_COLORS, REGION_LABELS);
}

/* ── Auto OCR processing ─────────────────────────────────────────────── */

async function startAutoProcess() {
  if (_processing) return;
  _processing = true;

  try {
    await initOCRWorker();
    for (let i = 0; i < _queue.length; i++) {
      const item = _queue[i];
      if (item.status !== 'pending') continue;
      item.status = 'analyzing';
      renderSidebar();
      if (_activeIdx === i) {
        const statusEl = document.getElementById('up-img-status');
        if (statusEl) statusEl.innerHTML = '<span class="spinner"></span>解析中…';
      }

      try {
        await new Promise(res => {
          if (item.imgEl.complete) { res(); return; }
          item.imgEl.onload = res; item.imgEl.onerror = res;
        });

        const result   = await parseResultImage(item.imgEl);
        item.result    = result;
        item.status    = 'done';
      } catch (e) {
        console.error('[OCR]', e);
        item.status = 'error';
        item.result = null;
      }

      renderSidebar();
      if (_activeIdx === i) showItemEditor(item);
    }
  } finally {
    _processing = false;
  }
}

/* ── Form helpers ────────────────────────────────────────────────────── */

function fillFormFromResult(result) {
  setVal('up-title',         result.title         ?? '');
  setVal('up-pronunciation', result.pronunciation ?? '');
  setVal('up-difficulty',    result.difficulty    ?? 'master');
  setVal('up-level',         result.level         ?? '');
  setVal('up-perfect',       result.judge?.perfect ?? 0);
  setVal('up-great',         result.judge?.great   ?? 0);
  setVal('up-good',          result.judge?.good     ?? 0);
  setVal('up-bad',           result.judge?.bad      ?? 0);
  setVal('up-miss',          result.judge?.miss     ?? 0);
  setVal('up-combo',         result.combo          ?? 0);
  updateFormComputed();
}

function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}

function updateFormComputed() {
  const p = num('up-perfect'), g = num('up-great'),
        o = num('up-good'),    b = num('up-bad'), m = num('up-miss');
  const el = document.getElementById('up-computed');
  if (!el) return;
  el.innerHTML = `
    <span>AP: <strong>${g+o+b+m}</strong></span>
    <span>AP〔大会〕: <strong>${g+o*2+b*3+m*3}</strong></span>
    <span>FC: <strong>${o+b+m}</strong></span>
  `;
}

function num(id) { return parseInt(document.getElementById(id)?.value ?? '0', 10) || 0; }

function showWarnings(warnings) {
  const el = document.getElementById('up-warnings');
  if (!el) return;
  if (!warnings || warnings.length === 0) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = warnings.map(w =>
    `<div class="warning-item"><span class="material-symbols-outlined" aria-hidden="true">warning</span>${esc(w)}</div>`
  ).join('');
}

function confirmItem() {
  if (_activeIdx < 0 || _activeIdx >= _queue.length) return;
  const item = _queue[_activeIdx];

  // Read form values
  item.result = item.result ?? {};
  item.result.title         = document.getElementById('up-title')?.value.trim()         ?? '';
  item.result.pronunciation = document.getElementById('up-pronunciation')?.value.trim() ?? '';
  item.result.difficulty    = document.getElementById('up-difficulty')?.value           ?? 'master';
  item.result.level         = parseInt(document.getElementById('up-level')?.value, 10)  || 0;
  item.result.judge = {
    perfect: num('up-perfect'), great: num('up-great'),
    good:    num('up-good'),    bad:   num('up-bad'), miss: num('up-miss'),
  };
  item.result.combo = num('up-combo');
  item.status = 'confirmed';

  renderSidebar();

  // Move to next un-confirmed
  const next = _queue.findIndex((it, i) => i > _activeIdx && it.status !== 'confirmed');
  if (next >= 0) selectItem(next);
  updateUploadBtn();
}

function removeCurrentItem() {
  if (_activeIdx < 0) return;
  const item = _queue[_activeIdx];
  if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  _queue.splice(_activeIdx, 1);
  _activeIdx = Math.min(_activeIdx, _queue.length - 1);
  renderSidebar();
  if (_queue.length > 0) selectItem(_activeIdx); else showPlaceholder();
}

function updateUploadBtn() {
  const btn = document.getElementById('upload-all');
  if (!btn) return;
  const confirmed = _queue.filter(it => it.status === 'confirmed').length;
  const total     = _queue.length;
  btn.disabled    = confirmed === 0;
  btn.textContent = `${confirmed}/${total} 件をアップロード`;
}

/* ── Final upload ─────────────────────────────────────────────────────── */

async function uploadAll() {
  const toUpload = _queue.filter(it => it.status === 'confirmed');
  if (!toUpload.length) return;

  const btn = document.getElementById('upload-all');
  if (btn) { btn.disabled = true; btn.textContent = 'アップロード中…'; }

  let successCount = 0;
  const bestImproved = [];

  for (const item of toUpload) {
    try {
      const r       = item.result;
      const recordId = item.id;
      const { fileId } = await uploadResultImage(item.file, recordId);

      const record = {
        id: recordId,
        musicId:      r.musicId ?? null,
        title:        r.title,
        pronunciation: r.pronunciation ?? '',
        difficulty:   r.difficulty,
        level:        r.level,
        judge:        r.judge,
        combo:        r.combo,
        totalNoteCount: r.totalNoteCount ?? null,
        imageFileId:  fileId,
        deviceProfileId: r.profileId ?? 'default',
        registrationMode: _autoMode ? 'auto' : 'manual',
        addedAt:      new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
        deletedAt:    null,
      };

      // Self-best check
      const improved = checkSelfBest(record, state.records);
      if (improved.ap || improved.apt || improved.fc) {
        bestImproved.push({ title: r.title, difficulty: r.difficulty, improved });
      }

      await addRecord(record);
      successCount++;
      item.status = 'uploaded';
    } catch (e) {
      console.error('[Upload]', e);
      item.status = 'error';
      notify('error', `「${item.result?.title ?? item.file.name}」のアップロードに失敗しました`);
    }
  }

  refreshCardList();

  if (successCount > 0) notify('success', `${successCount}件をアップロードしました`);

  // Self-best notifications
  for (const { title, difficulty, improved } of bestImproved) {
    const kinds = [
      improved.ap  ? 'AP基準' : null,
      improved.apt ? 'AP〔大会〕' : null,
      improved.fc  ? 'FC基準' : null,
    ].filter(Boolean);
    notify('success', `自己ベスト更新！「${title} (${DIFFICULTY_LABELS[difficulty] ?? difficulty})」— ${kinds.join(' / ')}`, 7000);
  }

  if (successCount === toUpload.length) closeUploadModal();
  else { renderSidebar(); if (btn) btn.disabled = false; }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
