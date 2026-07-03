import { state }     from '../state.js';
import { signOut }   from '../auth.js';
import { TRASH_DELETE_DAYS } from '../config.js';
import { notify }    from '../notifications.js';

export function initSettingsView() {
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('modal-settings')?.addEventListener('click', e => {
    if (e.target.id === 'modal-settings') closeSettings();
  });
  document.getElementById('settings-signout')?.addEventListener('click', async () => {
    if (!confirm('サインアウトしますか？')) return;
    signOut();
    closeSettings();
  });
  document.getElementById('settings-calibration')?.addEventListener('click', () => {
    closeSettings();
    import('./calibration.js').then(m => m.openCalibration());
  });
}

export function openSettings() {
  // Populate user info
  const emailEl = document.getElementById('settings-email');
  if (emailEl) emailEl.textContent = state.userEmail ?? '不明';

  const infoEl = document.getElementById('settings-info');
  if (infoEl) {
    const total   = state.records.filter(r => !r.deletedAt).length;
    const trashed = state.records.filter(r =>  r.deletedAt).length;
    infoEl.innerHTML = `
      <div class="settings-stat">
        <span class="settings-stat__label">登録件数</span>
        <span class="settings-stat__value">${total} 件</span>
      </div>
      <div class="settings-stat">
        <span class="settings-stat__label">ゴミ箱</span>
        <span class="settings-stat__value">${trashed} 件（${TRASH_DELETE_DAYS}日後に自動削除）</span>
      </div>
    `;
  }
  document.getElementById('modal-settings').hidden = false;
}

export function closeSettings() {
  document.getElementById('modal-settings').hidden = true;
}
