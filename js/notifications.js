// js/notifications.js

export class Notifications {
  constructor(containerId = 'toast-container') {
    this.container = document.getElementById(containerId);
  }

  /**
   * トースト通知を表示
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'|'best'} type
   * @param {number} duration ms
   */
  show(message, type = 'info', duration = 4000) {
    const icons = {
      success: 'check_circle',
      error:   'error',
      warning: 'warning',
      info:    'info',
      best:    'emoji_events',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-icons-round">${icons[type] || 'info'}</span>
      <span class="toast-text">${message}</span>
    `;

    this.container.appendChild(toast);

    // 自動削除
    const remove = () => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 500);
    };

    const timer = setTimeout(remove, duration);

    // クリックで早期閉じる
    toast.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
  }

  success(msg, dur)  { this.show(msg, 'success', dur); }
  error(msg, dur)    { this.show(msg, 'error',   dur || 6000); }
  warning(msg, dur)  { this.show(msg, 'warning', dur); }
  info(msg, dur)     { this.show(msg, 'info',    dur); }

  /** 自己ベスト更新通知（目立つ演出） */
  newBest(title, difficulty, modeLabel) {
    this.show(
      `自己ベスト更新！<br><b>${title}</b> [${difficulty}]<br>${modeLabel}`,
      'best',
      6000
    );
  }
}
