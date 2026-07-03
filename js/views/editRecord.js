import { DIFFICULTIES, DIFFICULTY_LABELS } from '../config.js';
import { updateRecord }     from '../drive/database.js';
import { notify }           from '../notifications.js';
import { refreshCardList }  from './cardList.js';

let _modal = null;
let _currentRec = null;

export function openEditModal(rec) {
  _currentRec = rec;
  _modal = document.getElementById('modal-edit');

  // Populate fields
  _f('edit-title').value       = rec.title ?? '';
  _f('edit-pronunciation').value = rec.pronunciation ?? '';
  _f('edit-difficulty').value  = rec.difficulty ?? 'master';
  _f('edit-level').value       = rec.level ?? '';
  _f('edit-perfect').value     = rec.judge?.perfect ?? 0;
  _f('edit-great').value       = rec.judge?.great   ?? 0;
  _f('edit-good').value        = rec.judge?.good     ?? 0;
  _f('edit-bad').value         = rec.judge?.bad      ?? 0;
  _f('edit-miss').value        = rec.judge?.miss     ?? 0;
  _f('edit-combo').value       = rec.combo           ?? 0;

  // Update computed preview
  updateComputedPreview();

  _modal.hidden = false;
  _modal.querySelector('.modal-content').scrollTop = 0;
  _f('edit-title').focus();
}

export function closeEditModal() {
  if (_modal) _modal.hidden = true;
  _currentRec = null;
}

/** Wire up all edit modal events (call once). */
export function initEditModal() {
  // Build difficulty select
  const diffSel = _f('edit-difficulty');
  if (diffSel && !diffSel.childElementCount) {
    for (const d of DIFFICULTIES) {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = DIFFICULTY_LABELS[d];
      diffSel.appendChild(opt);
    }
  }

  _f('edit-cancel')?.addEventListener('click', closeEditModal);
  document.getElementById('modal-edit')?.addEventListener('click', e => {
    if (e.target.id === 'modal-edit') closeEditModal();
  });

  // Recompute preview on any judge field change
  ['perfect','great','good','bad','miss'].forEach(name => {
    _f(`edit-${name}`)?.addEventListener('input', updateComputedPreview);
  });

  _f('edit-save')?.addEventListener('click', saveEdit);
}

async function saveEdit() {
  if (!_currentRec) return;
  const btn = _f('edit-save');
  btn.disabled = true;
  btn.textContent = '保存中…';

  try {
    const changes = {
      title:         _f('edit-title').value.trim(),
      pronunciation: _f('edit-pronunciation').value.trim(),
      difficulty:    _f('edit-difficulty').value,
      level:         parseInt(_f('edit-level').value, 10) || 0,
      judge: {
        perfect: parseInt(_f('edit-perfect').value, 10) || 0,
        great:   parseInt(_f('edit-great').value,   10) || 0,
        good:    parseInt(_f('edit-good').value,     10) || 0,
        bad:     parseInt(_f('edit-bad').value,      10) || 0,
        miss:    parseInt(_f('edit-miss').value,     10) || 0,
      },
      combo: parseInt(_f('edit-combo').value, 10) || 0,
    };
    await updateRecord(_currentRec.id, changes);
    closeEditModal();
    refreshCardList();
    notify('success', '記録を更新しました');
  } catch (e) {
    notify('error', '更新に失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '保存';
  }
}

function updateComputedPreview() {
  const p = parseInt(_f('edit-perfect')?.value, 10) || 0;
  const g = parseInt(_f('edit-great')?.value,   10) || 0;
  const o = parseInt(_f('edit-good')?.value,     10) || 0;
  const b = parseInt(_f('edit-bad')?.value,      10) || 0;
  const m = parseInt(_f('edit-miss')?.value,     10) || 0;

  const missAP  = g + o + b + m;
  const missAPT = g * 1 + o * 2 + b * 3 + m * 3;
  const missFC  = o + b + m;

  const el = document.getElementById('edit-computed');
  if (el) {
    el.innerHTML = `
      <span>AP: <strong>${missAP}</strong></span>
      <span>AP〔大会〕: <strong>${missAPT}</strong></span>
      <span>FC: <strong>${missFC}</strong></span>
    `;
  }
}

function _f(id) { return document.getElementById(id); }
