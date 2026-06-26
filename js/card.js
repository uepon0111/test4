'use strict';

/* ========== CARD COMPONENT ========== */
const Card = {
  /**
   * Create a result card DOM element.
   * @param {Object} record  - result record
   * @param {string} mode    - judge mode ('ap' | 'ap-tournament' | 'fc')
   * @returns HTMLElement
   */
  create(record, mode) {
    const el = document.createElement('div');
    el.className = 'result-card animate-in';
    el.dataset.id = record.id;

    const miss    = Utils.getMissForMode(record, mode);
    const diffColor = CONFIG.DIFFICULTY_COLORS[record.difficulty] || '#999';
    const darkText  = CONFIG.DIFFICULTY_DARK_TEXT[record.difficulty];

    /* Badges */
    const badges = [];
    if (record.isAP) {
      badges.push('<span class="badge-ap">AP</span>');
      if (record.isAPTournament) badges.push('<span class="badge-ap-tournament">大会</span>');
    } else if (record.isAPTournament) {
      badges.push('<span class="badge-ap-tournament">大会AP</span>');
    } else if (record.isFC) {
      badges.push('<span class="badge-fc">FC</span>');
    }

    /* Mode label for miss display */
    const modeLabel = { ap: 'AP', 'ap-tournament': '大会', fc: 'FC' }[mode] || 'AP';

    /* Thumbnail */
    const thumbHtml = record.imageDataUrl
      ? `<img src="${record.imageDataUrl}" alt="" loading="lazy">`
      : `<div class="card-thumb-placeholder"><span class="material-icons-round">image</span></div>`;

    /* Per-mode miss display */
    const missHtml = this._buildMissRow(record, mode, miss);

    el.innerHTML = `
      <div class="card-thumb" role="button" tabindex="0" aria-label="画像を拡大">
        ${thumbHtml}
        <div class="card-thumb-overlay">
          <span class="material-icons-round">zoom_in</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title" title="${Utils.esc(record.title)}">${Utils.esc(record.title || '不明')}</span>
          <div class="card-badges">${badges.join('')}</div>
        </div>
        <div class="card-meta">
          <span class="diff-badge"
            style="background:${diffColor};color:${darkText ? '#1A1A1A' : 'white'}"
          >${record.difficulty || '-'}</span>
          <span class="level-badge">Lv.${record.level ?? '-'}</span>
          <span class="card-date">${Utils.formatDate(record.addedAt)}</span>
        </div>
        ${missHtml}
      </div>
      <div class="card-actions">
        <button class="card-action-btn" data-action="edit" title="編集" aria-label="編集">
          <span class="material-icons-round">edit</span>
        </button>
        <button class="card-action-btn danger" data-action="delete" title="削除" aria-label="削除">
          <span class="material-icons-round">delete</span>
        </button>
      </div>
    `;

    /* Accessibility for thumbnail */
    const thumb = el.querySelector('.card-thumb');
    thumb.addEventListener('click', () => App.openViewer(record.id));
    thumb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') App.openViewer(record.id); });

    /* Action buttons */
    el.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      App.openEditModal(record.id);
    });
    el.querySelector('[data-action="delete"]').addEventListener('click', e => {
      e.stopPropagation();
      App.confirmTrash(record.id);
    });

    return el;
  },

  _buildMissRow(record, mode, miss) {
    const isZero = miss === 0;
    const modeKey = { ap: 'missAP', 'ap-tournament': 'missAPT', fc: 'missFC' }[mode] || 'missAP';
    const modeLabel = { ap: 'AP', 'ap-tournament': '大会AP', fc: 'FC' }[mode] || 'AP';

    const missClass = isZero ? 'miss-value perfect-score' : 'miss-value';

    /* Show AP, AP(大会), FC miss counts compactly */
    const parts = [];
    parts.push(`<span class="miss-item">
      <span class="miss-label">${modeLabel}:</span>
      <span class="${missClass}">${miss}</span>
    </span>`);

    /* PERFECT count hint */
    if (record.perfect != null) {
      parts.push(`<span class="miss-item">
        <span class="miss-label">P:</span>
        <span class="miss-value">${record.perfect}</span>
      </span>`);
    }

    return `<div class="card-miss-row">${parts.join('')}</div>`;
  },

  /* Update an existing card's miss display only (quick update) */
  updateMode(el, record, mode) {
    if (!el) return;
    const miss    = Utils.getMissForMode(record, mode);
    const missRow = el.querySelector('.card-miss-row');
    if (missRow) missRow.outerHTML = this._buildMissRow(record, mode, miss);

    /* Update badges */
    const badgesEl = el.querySelector('.card-badges');
    if (badgesEl) {
      const badges = [];
      if (record.isAP) {
        badges.push('<span class="badge-ap">AP</span>');
        if (record.isAPTournament) badges.push('<span class="badge-ap-tournament">大会</span>');
      } else if (record.isAPTournament) {
        badges.push('<span class="badge-ap-tournament">大会AP</span>');
      } else if (record.isFC) {
        badges.push('<span class="badge-fc">FC</span>');
      }
      badgesEl.innerHTML = badges.join('');
    }
  },
};

/* Inline style helper for card date */
const styleEl = document.createElement('style');
styleEl.textContent = `.card-date { font-size:10px; color:var(--text-hint); margin-left:auto; white-space:nowrap; }`;
document.head.appendChild(styleEl);
