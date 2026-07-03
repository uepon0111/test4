import { state }             from '../state.js';
import { trashRecord, restoreRecord, permanentDeleteRecord } from '../drive/database.js';
import { deleteResultImage } from '../drive/imageStorage.js';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, TRASH_DELETE_DAYS } from '../config.js';
import { notify }            from '../notifications.js';
import { refreshCardList }   from './cardList.js';

export function initTrashView() {
  document.getElementById('trash-close')?.addEventListener('click', closeTrash);
  document.getElementById('modal-trash')?.addEventListener('click', e => {
    if (e.target.id === 'modal-trash') closeTrash();
  });
  document.getElementById('trash-empty')?.addEventListener('click', emptyTrash);
}

export function openTrash() {
  renderTrashList();
  document.getElementById('modal-trash').hidden = false;
}

export function closeTrash() {
  document.getElementById('modal-trash').hidden = true;
}

function renderTrashList() {
  const deleted  = state.records.filter(r => r.deletedAt);
  const list     = document.getElementById('trash-list');
  const emptyBtn = document.getElementById('trash-empty');

  if (!list) return;
  list.innerHTML = '';

  if (deleted.length === 0) {
    list.appendChild(Object.assign(document.createElement('p'), {
      className: 'trash-empty', textContent: 'ゴミ箱は空です',
    }));
    if (emptyBtn) emptyBtn.hidden = true;
    return;
  }

  if (emptyBtn) emptyBtn.hidden = false;

  const now = Date.now();
  for (const rec of deleted) {
    const deletedMs  = rec.deletedAt ? new Date(rec.deletedAt).getTime() : now;
    const remainDays = Math.max(0, TRASH_DELETE_DAYS - (now - deletedMs) / 86400000);
    const color      = DIFFICULTY_COLORS[rec.difficulty] ?? '#aaa';
    const label      = DIFFICULTY_LABELS[rec.difficulty] ?? rec.difficulty.toUpperCase();

    const row = document.createElement('div');
    row.className = 'trash-row';
    row.dataset.id = rec.id;
    row.innerHTML = `
      <div class="trash-row__info">
        <span class="diff-chip diff-chip--sm" style="--diff-color:${color}">${label}</span>
        <span class="trash-row__lv">Lv.${rec.level}</span>
        <span class="trash-row__title">${esc(rec.title)}</span>
      </div>
      <div class="trash-row__meta">
        <span class="trash-row__expire">あと約 ${remainDays.toFixed(1)} 日で自動削除</span>
        <button class="btn btn--sm btn--outline" data-action="restore" aria-label="復元">
          <span class="material-symbols-outlined" aria-hidden="true">restore</span>復元
        </button>
        <button class="btn btn--sm btn--danger" data-action="perm-delete" aria-label="完全削除">
          <span class="material-symbols-outlined" aria-hidden="true">delete_forever</span>完全削除
        </button>
      </div>
    `;

    row.querySelector('[data-action="restore"]').addEventListener('click', () => restore(rec.id));
    row.querySelector('[data-action="perm-delete"]').addEventListener('click', () => permDelete(rec.id));
    list.appendChild(row);
  }
}

export async function confirmTrash(rec) {
  if (!confirm(`「${rec.title}」をゴミ箱に移動しますか？\n（${TRASH_DELETE_DAYS}日後に自動的に完全削除されます）`)) return;
  try {
    await trashRecord(rec.id);
    refreshCardList();
    notify('info', `「${rec.title}」をゴミ箱に移動しました`);
  } catch (e) {
    notify('error', '削除に失敗しました: ' + e.message);
  }
}

async function restore(id) {
  const rec = state.records.find(r => r.id === id);
  try {
    await restoreRecord(id);
    renderTrashList();
    refreshCardList();
    notify('success', `「${rec?.title ?? '記録'}」を復元しました`);
  } catch (e) {
    notify('error', '復元に失敗しました: ' + e.message);
  }
}

async function permDelete(id) {
  const rec = state.records.find(r => r.id === id);
  if (!confirm(`「${rec?.title ?? '記録'}」を完全削除します。\nDriveからも削除され、元に戻せません。`)) return;
  try {
    await permanentDeleteRecord(id, deleteResultImage);
    renderTrashList();
    refreshCardList();
    notify('success', '完全削除しました');
  } catch (e) {
    notify('error', '削除に失敗しました: ' + e.message);
  }
}

async function emptyTrash() {
  const deleted = state.records.filter(r => r.deletedAt);
  if (deleted.length === 0) return;
  if (!confirm(`ゴミ箱の ${deleted.length} 件を全て完全削除します。元に戻せません。`)) return;
  for (const rec of deleted) {
    try { await permanentDeleteRecord(rec.id, deleteResultImage); } catch (_) {}
  }
  renderTrashList();
  refreshCardList();
  notify('success', 'ゴミ箱を空にしました');
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
