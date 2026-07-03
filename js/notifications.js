/**
 * Toast notification system.
 * Usage: notify('success', 'メッセージ')
 *        notify('error', 'エラー', 8000)
 *        notify('warning', '警告', 0)  // 0 = stay until dismissed
 */

let _container = null;

export function initNotifications() {
  _container = document.getElementById('toast-container');
  if (!_container) {
    _container = document.createElement('div');
    _container.id = 'toast-container';
    document.body.appendChild(_container);
  }
}

/**
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} message
 * @param {number} duration  ms (0 = permanent until dismissed)
 */
export function notify(type, message, duration = 4500) {
  if (!_container) initNotifications();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const iconMap = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  toast.innerHTML = `
    <span class="toast__icon material-symbols-outlined" aria-hidden="true">${iconMap[type] ?? 'info'}</span>
    <span class="toast__msg">${escHtml(message)}</span>
    <button class="toast__close" aria-label="閉じる">
      <span class="material-symbols-outlined" aria-hidden="true">close</span>
    </button>
  `;

  toast.querySelector('.toast__close').addEventListener('click', () => dismiss(toast));
  _container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  if (duration > 0) setTimeout(() => dismiss(toast), duration);
  return toast;
}

function dismiss(toast) {
  toast.classList.remove('toast--visible');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
