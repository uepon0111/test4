import { state, on }      from '../state.js';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, DIFFICULTY_RANK } from '../config.js';
import { computeMiss }   from '../records/recordModel.js';
import { sortRecords }   from '../records/sortRules.js';
import { filterRecords } from '../records/filterRules.js';
import { getBestRecords } from '../records/bestRecord.js';
import { VirtualGridScroll } from '../virtualScroll.js';
import { getThumbnailSrc }   from '../drive/imageStorage.js';

let _vs = null;

/** Initialize the card list; call once after DOM is ready. */
export function initCardList() {
  const container = document.getElementById('card-scroll');
  const gridEl    = document.getElementById('card-grid');

  _vs = new VirtualGridScroll({
    container,
    gridEl,
    renderItem: buildCard,
    cardHeight: 280,
    gap: 16,
    buffer: 3,
  });

  // Re-render on any relevant state change
  on('*', (changed) => {
    const keys = ['records','thumbnailMap','mode','sortKey','sortDir',
                  'showBestOnly','filterStatus','filterDiffs','filterLevel',
                  'filterMissMin','filterMissMax','filterTitle'];
    if (changed.some(k => keys.includes(k))) refreshCardList();
  });
}

export function refreshCardList() {
  if (!_vs) return;
  const { records, mode, sortKey, sortDir, showBestOnly } = state;
  let visible = filterRecords(records, state);
  if (showBestOnly) visible = getBestRecords(visible, mode);
  visible = sortRecords(visible, { sortKey, sortDir, mode });

  // Status bar
  const bar = document.getElementById('status-bar');
  if (bar) bar.textContent = `${visible.length} 件`;

  _vs.update(visible);
}

/* ── Card builder ─────────────────────────────────────────────────────── */

function buildCard(rec) {
  const { mode } = state;
  const m = computeMiss(rec.judge);
  const color = DIFFICULTY_COLORS[rec.difficulty] ?? '#aaa';
  const label = DIFFICULTY_LABELS[rec.difficulty] ?? rec.difficulty.toUpperCase();
  const thumb = getThumbnailSrc(rec.imageFileId);

  // Miss display values
  let apLabel, apVal, fcLabel, fcVal, apEmph, fcEmph;
  if (mode === 'apt') {
    apLabel = 'AP〔大会〕'; apVal = m.missAPT; apEmph = true;
    fcLabel = 'FC';        fcVal = m.missFC;  fcEmph = false;
  } else if (mode === 'fc') {
    apLabel = 'AP';        apVal = m.missAP;  apEmph = false;
    fcLabel = 'FC';        fcVal = m.missFC;  fcEmph = true;
  } else {
    apLabel = 'AP';        apVal = m.missAP;  apEmph = true;
    fcLabel = 'FC';        fcVal = m.missFC;  fcEmph = false;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = rec.id;

  card.innerHTML = `
    <div class="card-img" role="button" tabindex="0" aria-label="${esc(rec.title)}のリザルト画像を表示">
      ${thumb
        ? `<img src="${esc(thumb)}" alt="${esc(rec.title)} リザルト" loading="lazy" decoding="async">`
        : `<div class="card-img__placeholder"><span class="material-symbols-outlined">image</span></div>`
      }
      <div class="card-badges">
        ${m.isAP ? '<span class="badge badge--ap">AP</span>' : (m.isFC ? '<span class="badge badge--fc">FC</span>' : '')}
      </div>
      <div class="card-actions" role="group">
        <button class="card-action-btn" data-action="edit" aria-label="編集" title="編集">
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        </button>
        <button class="card-action-btn card-action-btn--danger" data-action="delete" aria-label="ゴミ箱へ" title="ゴミ箱へ移動">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-tags">
        <span class="diff-chip" style="--diff-color:${color}">${esc(label)}</span>
        <span class="level-chip">Lv.<strong>${rec.level}</strong></span>
      </div>
      <p class="card-title" title="${esc(rec.title)}">${esc(rec.title)}</p>
      <div class="card-scores">
        <div class="score-item ${apEmph ? 'score-item--emph' : ''}">
          <span class="score-label">${esc(apLabel)}</span>
          <span class="score-value ${apVal === 0 ? 'score-value--zero' : ''}">${apVal === 0 ? '達成' : apVal}</span>
        </div>
        <div class="score-divider"></div>
        <div class="score-item ${fcEmph ? 'score-item--emph' : ''}">
          <span class="score-label">${esc(fcLabel)}</span>
          <span class="score-value ${fcVal === 0 ? 'score-value--zero' : ''}">${fcVal === 0 ? '達成' : fcVal}</span>
        </div>
      </div>
    </div>
  `;

  // Image click → preview
  card.querySelector('.card-img').addEventListener('click', e => {
    if (e.target.closest('[data-action]')) return;
    import('./uploadWorkspace.js').then(m => m.showImagePreview(rec.imageFileId));
  });
  card.querySelector('.card-img').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      import('./uploadWorkspace.js').then(m => m.showImagePreview(rec.imageFileId));
    }
  });

  // Edit / delete buttons
  card.querySelector('[data-action="edit"]').addEventListener('click', e => {
    e.stopPropagation();
    import('./editRecord.js').then(m => m.openEditModal(rec));
  });
  card.querySelector('[data-action="delete"]').addEventListener('click', e => {
    e.stopPropagation();
    import('./trashView.js').then(m => m.confirmTrash(rec));
  });

  return card;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
