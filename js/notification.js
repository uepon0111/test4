'use strict';

/* ========== NOTIFICATION ========== */
const Notification = (() => {
  const ICONS = {
    info:    'info',
    success: 'check_circle',
    error:   'error',
    warning: 'warning',
    record:  'emoji_events',
  };

  function show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('notification-container');
    if (!container) { console.warn('Notification:', message); return; }

    const el   = document.createElement('div');
    el.className = `notification ${type}`;
    const icon = ICONS[type] || 'info';

    el.innerHTML = `
      <span class="material-icons-round notif-icon">${icon}</span>
      <span class="notif-message">${Utils.esc(message)}</span>
      <button class="notif-close" aria-label="閉じる">
        <span class="material-icons-round">close</span>
      </button>
    `;

    const dismiss = () => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };

    el.querySelector('.notif-close').addEventListener('click', dismiss);
    container.appendChild(el);

    /* Animate in */
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

    if (duration > 0) {
      const t = setTimeout(dismiss, duration);
      el._clearTimer = () => clearTimeout(t);
    }

    return { dismiss };
  }

  return { show };
})();
