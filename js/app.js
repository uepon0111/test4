'use strict';

/* ========== MAIN APPLICATION ========== */
const App = (() => {
  /* ---- State ---- */
  let _results       = [];   // all records from DB
  let _filtered      = [];   // after filter+sort
  let _mode          = 'ap'; // judge mode
  let _currentView   = 'list';
  let _vs            = null; // VirtualScroll instance
  let _editRecordId  = null; // record being edited
  let _viewerRecordId = null;// record being viewed
  let _confirmCb     = null; // pending confirm callback

  /* ---- Init ---- */
  async function init() {
    showLoading(true, '起動中...');

    try {
      /* Load settings */
      const clientId = await DB.getSetting('googleClientId') || '';
      CONFIG.GOOGLE_CLIENT_ID = clientId;

      /* Default mode from settings */
      const savedMode = localStorage.getItem('defaultMode') || 'ap';
      _mode = savedMode;
      FilterSort.setMode(savedMode);

      /* Google Auth */
      await Auth.init(clientId);

      /* Music DB */
      try { await MusicDB.load(); } catch (e) { console.warn('MusicDB load warning:', e.message); }

      /* Load local results */
      _results = await DB.getAllResults();

      /* Auto-clean trash */
      const cleaned = await Trash.autoClean(_results);
      if (cleaned > 0) {
        _results = await DB.getAllResults();
        Notification.show(`${cleaned}件のゴミ箱アイテムを自動削除しました`, 'info', 2500);
      }

      /* Auth change listener */
      Auth.onChange((signedIn, user) => {
        updateAuthUI(signedIn, user);
        Settings.render(); // refresh settings if open
      });

      /* Setup UI */
      _setupUI();
      _bindEvents();

      /* Initial render */
      await _refreshAll();

    } catch (e) {
      console.error('App init error:', e);
      Notification.show('起動エラー: ' + e.message, 'error');
    }

    showLoading(false);
  }

  /* ---- UI Setup ---- */
  function _setupUI() {
    /* Virtual scroll */
    const container = document.getElementById('card-list-container');
    const cols      = Utils.getColumns();
    const height    = Utils.isMobile() ? CONFIG.CARD_HEIGHT_MOBILE : CONFIG.CARD_HEIGHT_DESKTOP;

    _vs = new VirtualScroll(container, {
      itemHeight: height + 8,  // card height + row gap
      columns:    cols,
      buffer:     CONFIG.VS_BUFFER,
      renderItem: (item, _idx) => Card.create(item, _mode),
    });

    /* Respond to window resize → update columns */
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        const newCols = Utils.getColumns();
        const newH    = (Utils.isMobile() ? CONFIG.CARD_HEIGHT_MOBILE : CONFIG.CARD_HEIGHT_DESKTOP) + 8;
        _vs.setColumns(newCols);
        _vs.setItemHeight(newH);
      }, 200);
    });

    /* Sync difficulty chips with filter state */
    _syncDiffChips();
    _updateModeUI();
    updateAuthUI(Auth.isSignedIn(), Auth.getUserInfo());
  }

  /* ---- Event Binding ---- */
  function _bindEvents() {
    /* Sidebar toggle */
    const sidebar        = document.getElementById('sidebar');
    const overlay        = document.getElementById('sidebar-overlay');
    const menuToggle     = document.getElementById('menu-toggle');
    const sidebarClose   = document.getElementById('sidebar-close');

    menuToggle?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('active'); });
    sidebarClose?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);

    /* Nav items */
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        closeSidebar();
      });
    });

    /* Auth button (header) */
    document.getElementById('auth-btn')?.addEventListener('click', () => {
      if (Auth.isSignedIn()) switchView('settings');
      else                   Auth.signIn();
    });

    /* Mode pill (header) */
    document.getElementById('mode-pill-btn')?.addEventListener('click', () => {
      document.getElementById('mode-overlay').style.display = 'flex';
    });
    document.getElementById('mode-close')?.addEventListener('click', () => {
      document.getElementById('mode-overlay').style.display = 'none';
    });
    document.querySelectorAll('.mode-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
        document.getElementById('mode-overlay').style.display = 'none';
      });
    });

    /* Mode chips in control bar */
    document.querySelectorAll('.mode-chip').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    /* Search */
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    searchInput?.addEventListener('input', Utils.debounce(e => {
      FilterSort.setQuery(e.target.value.trim());
      searchClear.style.display = e.target.value ? 'flex' : 'none';
      _applyAndRender();
    }, 250));
    searchClear?.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      FilterSort.setQuery('');
      _applyAndRender();
    });

    /* Filter toggle */
    const filterPanel = document.getElementById('filter-panel');
    document.getElementById('filter-toggle-btn')?.addEventListener('click', () => {
      const open = filterPanel.style.display !== 'none';
      filterPanel.style.display = open ? 'none' : 'flex';
      document.getElementById('filter-toggle-btn').classList.toggle('active', !open);
    });

    /* Difficulty chips */
    document.querySelectorAll('.diff-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        FilterSort.toggleDifficulty(chip.dataset.diff);
        chip.classList.toggle('active');
        _applyAndRender();
      });
    });

    /* Level range */
    document.getElementById('level-min')?.addEventListener('input', Utils.debounce(e => {
      FilterSort.setLevelMin(e.target.value); _applyAndRender();
    }, 300));
    document.getElementById('level-max')?.addEventListener('input', Utils.debounce(e => {
      FilterSort.setLevelMax(e.target.value); _applyAndRender();
    }, 300));

    /* Achievement chips */
    document.querySelectorAll('#achievement-chips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#achievement-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        FilterSort.setAchievement(chip.dataset.ach);
        _applyAndRender();
      });
    });

    /* Miss range */
    document.getElementById('miss-min')?.addEventListener('input', Utils.debounce(e => {
      FilterSort.setMissMin(e.target.value); _applyAndRender();
    }, 300));
    document.getElementById('miss-max')?.addEventListener('input', Utils.debounce(e => {
      FilterSort.setMissMax(e.target.value); _applyAndRender();
    }, 300));

    /* Filter reset */
    document.getElementById('filter-reset-btn')?.addEventListener('click', () => {
      FilterSort.resetFilters();
      /* Reset UI */
      document.getElementById('search-input').value = '';
      document.getElementById('search-clear').style.display = 'none';
      document.querySelectorAll('.diff-chip').forEach(c => c.classList.add('active'));
      document.querySelectorAll('#achievement-chips .chip').forEach(c => c.classList.remove('active'));
      document.querySelector('#achievement-chips [data-ach="all"]')?.classList.add('active');
      document.getElementById('level-min').value = '';
      document.getElementById('level-max').value = '';
      document.getElementById('miss-min').value  = '';
      document.getElementById('miss-max').value  = '';
      _applyAndRender();
    });

    /* Sort */
    document.getElementById('sort-by')?.addEventListener('change', e => {
      FilterSort.setSortBy(e.target.value); _applyAndRender();
    });
    document.getElementById('sort-order-btn')?.addEventListener('click', () => {
      const asc  = FilterSort.toggleSortOrder();
      const icon = document.getElementById('sort-order-icon');
      if (icon) icon.textContent = asc ? 'arrow_upward' : 'arrow_downward';
      _applyAndRender();
    });

    /* Show best toggle */
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        FilterSort.setShowBest(btn.dataset.show);
        _applyAndRender();
      });
    });

    /* FAB */
    document.getElementById('upload-fab')?.addEventListener('click', () => {
      if (_currentView !== 'list') switchView('list');
      Upload.openModal();
    });

    /* Upload modal (init) */
    Upload.init();

    /* Viewer modal */
    document.getElementById('viewer-close')?.addEventListener('click', closeViewer);
    document.getElementById('viewer-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('viewer-overlay')) closeViewer();
    });
    document.getElementById('viewer-edit-btn')?.addEventListener('click', () => {
      closeViewer();
      if (_viewerRecordId) openEditModal(_viewerRecordId);
    });
    document.getElementById('viewer-delete-btn')?.addEventListener('click', () => {
      closeViewer();
      if (_viewerRecordId) confirmTrash(_viewerRecordId);
    });

    /* Edit modal */
    document.getElementById('edit-close')?.addEventListener('click',  closeEditModal);
    document.getElementById('edit-cancel-btn')?.addEventListener('click', closeEditModal);
    document.getElementById('edit-save-btn')?.addEventListener('click', saveEdit);

    /* Confirm dialog */
    document.getElementById('confirm-cancel')?.addEventListener('click', () => {
      document.getElementById('confirm-overlay').style.display = 'none';
      _confirmCb = null;
    });
    document.getElementById('confirm-ok')?.addEventListener('click', () => {
      document.getElementById('confirm-overlay').style.display = 'none';
      if (_confirmCb) { _confirmCb(); _confirmCb = null; }
    });
    document.getElementById('confirm-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('confirm-overlay')) {
        document.getElementById('confirm-overlay').style.display = 'none';
        _confirmCb = null;
      }
    });

    /* Trash view */
    document.getElementById('empty-all-trash-btn')?.addEventListener('click', () => {
      Trash.emptyAll(_results, () => { refreshResults(); });
    });

    /* Modal overlays: close on bg click */
    document.getElementById('mode-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('mode-overlay'))
        document.getElementById('mode-overlay').style.display = 'none';
    });
    document.getElementById('upload-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('upload-overlay')) Upload.closeModal();
    });
    document.getElementById('edit-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('edit-overlay')) closeEditModal();
    });
  }

  /* ---- View Switching ---- */
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  }

  function switchView(view) {
    _currentView = view;
    const views  = ['list', 'trash', 'settings'];

    views.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.style.display = (v === view) ? 'flex' : 'none';
    });

    /* Nav highlight */
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'trash')    { refreshResults(); }
    if (view === 'settings') { Settings.render(); }
    if (view === 'list')     { _applyAndRender(); }
  }

  /* ---- Mode ---- */
  function setMode(mode) {
    _mode = mode;
    FilterSort.setMode(mode);
    localStorage.setItem('defaultMode', mode);
    _updateModeUI();
    _applyAndRender();
  }

  function _updateModeUI() {
    const labels = { ap: 'AP基準', 'ap-tournament': 'AP大会基準', fc: 'FC基準' };
    const pill   = document.getElementById('mode-pill-label');
    if (pill) pill.textContent = labels[_mode] || _mode;

    document.querySelectorAll('.mode-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.mode === _mode);
    });

    /* Miss range hint */
    const hint = document.getElementById('miss-range-mode-hint');
    if (hint) hint.textContent = `(${labels[_mode] || _mode})`;

    /* Update mode option buttons highlight */
    document.querySelectorAll('.mode-option-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === _mode);
    });
  }

  function _syncDiffChips() {
    const state = FilterSort.state;
    document.querySelectorAll('.diff-chip').forEach(c => {
      c.classList.toggle('active', state.difficulties.has(c.dataset.diff));
    });
  }

  /* ---- Filter + Render ---- */
  function _applyAndRender() {
    _filtered = FilterSort.apply(_results);
    _renderList();
    _updateStats();
    _updateTrashBadge();
  }

  function _renderList() {
    if (!_vs) return;
    const nonDeleted = _filtered.filter(r => !r.deleted);
    const hasItems   = nonDeleted.length > 0;

    const emptyEl     = document.getElementById('empty-state');
    const containerEl = document.getElementById('card-list-container');
    if (emptyEl)     emptyEl.style.display     = hasItems ? 'none'  : 'flex';
    if (containerEl) containerEl.style.display = hasItems ? 'block' : 'none';

    _vs.setItems(nonDeleted);
  }

  function _updateStats() {
    const total    = _results.filter(r => !r.deleted).length;
    const filtered = _filtered.filter(r => !r.deleted).length;
    const statsEl  = document.getElementById('stats-text');
    if (statsEl) {
      statsEl.textContent = total === filtered
        ? `${total}件`
        : `${filtered}件 / ${total}件中`;
    }
  }

  function _updateTrashBadge() {
    const trashCount = _results.filter(r => r.deleted).length;
    const badge = document.getElementById('trash-count-badge');
    if (badge) {
      badge.textContent   = trashCount;
      badge.style.display = trashCount > 0 ? 'inline-block' : 'none';
    }
  }

  /* ---- Auth UI ---- */
  function updateAuthUI(signedIn, user) {
    const icon = document.getElementById('auth-icon');
    if (icon) icon.textContent = signedIn ? 'account_circle' : 'account_circle';
    if (icon) icon.style.color = signedIn ? 'var(--primary)' : '';

    const sidebarLabel = document.getElementById('auth-label-sidebar');
    if (sidebarLabel) {
      sidebarLabel.textContent = signedIn && user
        ? (user.name || user.email || 'ログイン済み')
        : '未ログイン';
    }
  }

  /* ---- Refresh ---- */
  async function refreshResults() {
    _results = await DB.getAllResults();
    _applyAndRender();
    _updateTrashBadge();

    /* Render trash view if currently showing */
    if (_currentView === 'trash') {
      Trash.render(_results, () => refreshResults());
    }
  }

  async function _refreshAll() {
    await refreshResults();
    _currentView = 'list';  // ensure view-list is shown on startup
    switchView('list');
  }

  /* ---- Image Viewer ---- */
  function openViewer(recordId) {
    const record = _results.find(r => r.id === recordId);
    if (!record) return;
    _viewerRecordId = recordId;

    const img = document.getElementById('viewer-img');
    if (img) img.src = record.imageDataUrl || '';

    const info = document.getElementById('viewer-info');
    if (info) {
      const diffColor = CONFIG.DIFFICULTY_COLORS[record.difficulty] || '#999';
      const ach       = Utils.calcAchievements(record);
      info.innerHTML = `
        <div class="viewer-title">${Utils.esc(record.title || '不明')}</div>
        <div class="confirm-meta" style="margin-bottom:10px">
          <span class="diff-badge" style="background:${diffColor};color:${CONFIG.DIFFICULTY_DARK_TEXT[record.difficulty]?'#1A1A1A':'white'}">${record.difficulty || '-'}</span>
          <span class="level-badge">Lv.${record.level ?? '-'}</span>
          ${record.isAP ? '<span class="badge-ap">AP</span>' : record.isFC ? '<span class="badge-fc">FC</span>' : ''}
          <span style="font-size:11px;color:var(--text-hint);margin-left:auto">${Utils.formatDateTime(record.addedAt)}</span>
        </div>
        <div class="viewer-meta-grid">
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">PERFECT</div>
            <div class="viewer-meta-value">${record.perfect ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">GREAT</div>
            <div class="viewer-meta-value">${record.great ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">GOOD</div>
            <div class="viewer-meta-value">${record.good ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">BAD</div>
            <div class="viewer-meta-value">${record.bad ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">MISS</div>
            <div class="viewer-meta-value">${record.miss ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">COMBO</div>
            <div class="viewer-meta-value">${record.combo ?? '-'}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">APミス</div>
            <div class="viewer-meta-value ${ach.isAP ? 'ap-value' : ''}">${ach.missAP}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">大会ミス</div>
            <div class="viewer-meta-value ${ach.isAPTournament ? 'ap-value' : ''}">${ach.missAPT}</div>
          </div>
          <div class="viewer-meta-cell">
            <div class="viewer-meta-label">FCミス</div>
            <div class="viewer-meta-value ${ach.isFC ? 'fc-value' : ''}">${ach.missFC}</div>
          </div>
        </div>
      `;
    }

    document.getElementById('viewer-overlay').style.display = 'flex';
  }

  function closeViewer() {
    document.getElementById('viewer-overlay').style.display = 'none';
    _viewerRecordId = null;
  }

  /* ---- Edit Modal ---- */
  function openEditModal(recordId) {
    const record = _results.find(r => r.id === recordId);
    if (!record) return;
    _editRecordId = recordId;

    const body = document.getElementById('edit-body');
    if (!body) return;

    const diffOptions = CONFIG.DIFFICULTIES.map(d =>
      `<option value="${d}" ${record.difficulty === d ? 'selected' : ''}>${d}</option>`
    ).join('');

    body.innerHTML = `
      <div class="edit-form">
        <div class="form-group">
          <label class="form-label">楽曲タイトル</label>
          <input class="form-input" id="edit-title" value="${Utils.esc(record.title || '')}" placeholder="楽曲タイトル">
        </div>
        <div class="form-group">
          <label class="form-label">読み方</label>
          <input class="form-input" id="edit-pron" value="${Utils.esc(record.pronunciation || '')}" placeholder="よみがな">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">難易度</label>
            <select class="form-select" id="edit-diff">${diffOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">楽曲レベル</label>
            <input class="form-input" id="edit-level" type="number" value="${record.level ?? ''}" min="1" max="50">
          </div>
        </div>
        <div class="form-section-title" style="margin-top:4px">リザルト</div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label" style="color:#7C9">PERFECT</label>
            <input class="form-input" id="edit-perfect" type="number" value="${record.perfect ?? ''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:#FA8">GREAT</label>
            <input class="form-input" id="edit-great" type="number" value="${record.great ?? ''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:#69F">GOOD</label>
            <input class="form-input" id="edit-good" type="number" value="${record.good ?? ''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:#F86">BAD</label>
            <input class="form-input" id="edit-bad" type="number" value="${record.bad ?? ''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:#F66">MISS</label>
            <input class="form-input" id="edit-miss" type="number" value="${record.miss ?? ''}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">COMBO</label>
            <input class="form-input" id="edit-combo" type="number" value="${record.combo ?? ''}" min="0">
          </div>
        </div>
        <div style="margin-top:8px;padding:10px;background:var(--surface);border-radius:var(--radius-sm);font-size:12px;color:var(--text-hint);">
          <strong>現在のミス数:</strong>
          AP: ${record.missAP ?? '-'} &nbsp;|&nbsp;
          大会AP: ${record.missAPT ?? '-'} &nbsp;|&nbsp;
          FC: ${record.missFC ?? '-'}
        </div>
      </div>
    `;

    document.getElementById('edit-overlay').style.display = 'flex';
  }

  async function saveEdit() {
    const record = _results.find(r => r.id === _editRecordId);
    if (!record) return;

    const g = id => document.getElementById(id)?.value;
    const gi = id => { const v = g(id); return (v !== undefined && v !== '') ? parseInt(v, 10) : null; };

    record.title         = g('edit-title')?.trim()  || record.title;
    record.pronunciation = g('edit-pron')?.trim()   || record.pronunciation;
    record.difficulty    = g('edit-diff')            || record.difficulty;
    record.level         = gi('edit-level')          ?? record.level;
    record.perfect       = gi('edit-perfect')        ?? record.perfect;
    record.great         = gi('edit-great')          ?? record.great;
    record.good          = gi('edit-good')           ?? record.good;
    record.bad           = gi('edit-bad')            ?? record.bad;
    record.miss          = gi('edit-miss')           ?? record.miss;
    record.combo         = gi('edit-combo')          ?? record.combo;
    record.updatedAt     = new Date().toISOString();

    /* Recalculate miss counts & achievements */
    const ach = Utils.calcAchievements(record);
    Object.assign(record, ach);

    await DB.saveResult(record);

    /* Update in-memory array */
    const idx = _results.findIndex(r => r.id === record.id);
    if (idx >= 0) _results[idx] = record;

    closeEditModal();
    _applyAndRender();
    Notification.show('リザルトを更新しました', 'success');
  }

  function closeEditModal() {
    document.getElementById('edit-overlay').style.display = 'none';
    _editRecordId = null;
  }

  /* ---- Trash Actions ---- */
  async function confirmTrash(recordId) {
    const record = _results.find(r => r.id === recordId);
    if (!record) return;

    showConfirm(
      'ゴミ箱に移動',
      `「${record.title}」をゴミ箱に移動します。${CONFIG.TRASH_DAYS}日後に自動で完全削除されます。`,
      async () => {
        await Trash.moveToTrash(record);
        const idx = _results.findIndex(r => r.id === record.id);
        if (idx >= 0) _results[idx] = record;
        _applyAndRender();
        Notification.show(`「${record.title}」をゴミ箱に移動しました`, 'info');
      }
    );
  }

  /* ---- Confirm Dialog ---- */
  function showConfirm(title, message, onOk, okLabel = '削除') {
    _confirmCb = onOk;
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok');
    if (okBtn) okBtn.textContent = okLabel;
    document.getElementById('confirm-overlay').style.display = 'flex';
  }

  /* ---- Loading ---- */
  function showLoading(show, text = '読み込み中...') {
    const overlay = document.getElementById('loading-overlay');
    const label   = document.getElementById('loading-text');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
    if (label)   label.textContent = text;
  }

  /* ---- Start ---- */
  document.addEventListener('DOMContentLoaded', () => init());

  return {
    init,
    setMode,
    refreshResults,
    openViewer,
    openEditModal,
    confirmTrash,
    showConfirm,
    showLoading,
    updateAuthUI,
  };
})();
