// js/app.js
import { CONFIG }        from './config.js';
import { DB }            from './db.js';
import { SongData }      from './songData.js';
import { Auth }          from './auth.js';
import { Drive }         from './drive.js';
import { OCRProcessor }  from './ocr.js';
import { VirtualScroll } from './virtualScroll.js';
import { Notifications } from './notifications.js';
import { Trash }         from './trash.js';
import { Modals }        from './modals.js';
import {
  sortRecords, filterRecords, getBestRecords,
  isBetterRecord, countActiveFilters
} from './sortFilter.js';
import {
  generateId, calcMisses, calcStatus,
  formatDate, relativeDate, escapeHtml,
  createBlobURL, revokeBlobURL
} from './utils.js';

/* =========================================================
   App クラス
   ========================================================= */
class App {
  constructor() {
    this.db       = new DB();
    this.songData = new SongData();
    this.auth     = new Auth();
    this.drive    = new Drive(this.auth);
    this.ocr      = new OCRProcessor();
    this.notify   = new Notifications();
    this.vs       = new VirtualScroll('vs-container', 'vs-content');
    this.trash    = new Trash(this.db, this.drive, this.notify);
    this.modals   = new Modals(this);

    this.records   = [];
    this._urlCache = new Map(); // id -> { thumb, image }
    this._debTimer = null;

    this.state = {
      view:        'list',
      mode:        'ap',          // 'ap' | 'ap_tournament' | 'fc'
      displayMode: 'all',         // 'all' | 'best'
      sortBy:      'date',
      sortOrder:   'desc',
      filters: {
        ap: false, fc: false,
        difficulties: [],
        level: null, name: '',
        missMin: null, missMax: null,
      },
    };
  }

  /* =========================================================
     初期化
     ========================================================= */
  async init() {
    this.showLoading('初期化中...');
    try {
      await this.db.init();
      this.records = await this.db.getAllRecords();

      // 保存済み状態を復元
      const saved = await this.db.getSetting('app_state');
      if (saved) {
        this.state.mode        = saved.mode        ?? this.state.mode;
        this.state.displayMode = saved.displayMode ?? this.state.displayMode;
        this.state.sortBy      = saved.sortBy      ?? this.state.sortBy;
        this.state.sortOrder   = saved.sortOrder   ?? this.state.sortOrder;
        if (saved.filters) {
          Object.assign(this.state.filters, saved.filters);
        }
      }

      // 楽曲データ（非同期、失敗してもOK）
      this.songData.load().catch(() => {});

      // Google認証
      const clientId = await this.db.getSetting('google_client_id', '');
      if (clientId) {
        this.auth.init(clientId).then(() => this.updateAuthUI()).catch(() => {});
      }
      this.auth.onStateChange = () => this.updateAuthUI();

      // ゴミ箱クリーン
      const cleaned = await this.trash.cleanExpired();
      if (cleaned > 0) this.notify.info(`ゴミ箱から${cleaned}件を自動削除しました`);

      this._setupListeners();
      this._applyStateToUI();
      this.hideLoading();
      this.navigate(this.state.view || 'list');
      this.updateTrashBadge();
      this.updateSidebarStats();
    } catch (e) {
      this.hideLoading();
      this.notify.error('起動エラー: ' + e.message);
      console.error(e);
    }
  }

  /* =========================================================
     イベントリスナー設定
     ========================================================= */
  _setupListeners() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

    /* ナビゲーション */
    document.querySelectorAll('.nav-item[data-view]').forEach(el =>
      el.addEventListener('click', () => this.navigate(el.dataset.view))
    );

    /* ヘッダーボタン */
    on('btn-upload-header',   'click', () => this.modals.showUpload());
    on('btn-trash-header',    'click', () => this.navigate('trash'));
    on('btn-settings-header', 'click', () => this.navigate('settings'));
    on('btn-upload-empty',    'click', () => this.modals.showUpload());
    on('btn-refresh',         'click', () => this.refreshRecords());

    /* サイドバートグル */
    on('btn-sidebar-toggle', 'click', () => this._toggleSidebar());

    /* モード切り替え（2.13） */
    document.querySelectorAll('.seg-btn[data-mode]').forEach(btn =>
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode))
    );

    /* 表示切り替え（2.8） */
    document.querySelectorAll('.seg-btn[data-display]').forEach(btn =>
      btn.addEventListener('click', () => this.setDisplayMode(btn.dataset.display))
    );

    /* フィルターパネル開閉 */
    on('filter-toggle', 'click', () => this._toggleFilterPanel());

    /* 並び替え（2.2） */
    document.querySelectorAll('.sort-pill[data-sort]').forEach(btn =>
      btn.addEventListener('click', () => this.setSort(btn.dataset.sort))
    );

    /* AP/FC絞り込み（2.3） */
    on('chip-ap', 'click', () => this.toggleFilter('ap'));
    on('chip-fc', 'click', () => this.toggleFilter('fc'));

    /* 難易度絞り込み（2.5） */
    document.querySelectorAll('.diff-chip[data-diff]').forEach(chip =>
      chip.addEventListener('click', () => this.toggleDiffFilter(chip.dataset.diff))
    );

    /* 楽曲名検索（2.7） */
    const nameEl  = document.getElementById('search-name');
    const clearEl = document.getElementById('clear-name');
    nameEl?.addEventListener('input', e => {
      this.state.filters.name = e.target.value;
      clearEl?.classList.toggle('hidden', !e.target.value);
      this._debouncedUpdate();
    });
    clearEl?.addEventListener('click', () => {
      if (nameEl) nameEl.value = '';
      this.state.filters.name = '';
      clearEl.classList.add('hidden');
      this.updateView();
    });

    /* レベル検索（2.6） */
    document.getElementById('search-level')?.addEventListener('input', e => {
      this.state.filters.level = e.target.value ? parseInt(e.target.value, 10) : null;
      this._debouncedUpdate();
    });

    /* ミス数範囲（2.4） */
    document.getElementById('miss-min')?.addEventListener('input', e => {
      this.state.filters.missMin = e.target.value !== '' ? parseInt(e.target.value, 10) : null;
      this._debouncedUpdate();
    });
    document.getElementById('miss-max')?.addEventListener('input', e => {
      this.state.filters.missMax = e.target.value !== '' ? parseInt(e.target.value, 10) : null;
      this._debouncedUpdate();
    });
    on('clear-range', 'click', () => {
      const minEl = document.getElementById('miss-min');
      const maxEl = document.getElementById('miss-max');
      if (minEl) minEl.value = '';
      if (maxEl) maxEl.value = '';
      this.state.filters.missMin = null;
      this.state.filters.missMax = null;
      this.updateView();
    });

    /* 認証 */
    on('btn-signin', 'click', () => this._handleSignIn());
    on('user-btn',   'click', () => this._handleSignOut());
  }

  /* =========================================================
     ナビゲーション
     ========================================================= */
  navigate(view) {
    if (!['list','settings','trash'].includes(view)) view = 'list';
    this.state.view = view;
    this._saveState();

    document.querySelectorAll('.view').forEach(el =>
      el.classList.toggle('active', el.id === `view-${view}`)
    );
    document.querySelectorAll('.nav-item[data-view]').forEach(el =>
      el.classList.toggle('active', el.dataset.view === view)
    );

    if (view === 'list')     this.updateView();
    if (view === 'settings') this.renderSettingsPage();
    if (view === 'trash')    this.renderTrashPage();
  }

  /* =========================================================
     モード・表示切り替え
     ========================================================= */
  setMode(mode) {
    this.state.mode = mode;
    document.querySelectorAll('.seg-btn[data-mode]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.mode === mode)
    );
    this.updateView();
    this._saveState();
  }

  setDisplayMode(dm) {
    this.state.displayMode = dm;
    document.querySelectorAll('.seg-btn[data-display]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.display === dm)
    );
    this.updateView();
    this._saveState();
  }

  setSort(sortBy) {
    if (this.state.sortBy === sortBy) {
      this.state.sortOrder = this.state.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.state.sortBy    = sortBy;
      this.state.sortOrder = 'desc';
    }
    this._updateSortUI();
    this.updateView();
    this._saveState();
  }

  toggleFilter(type) {
    this.state.filters[type] = !this.state.filters[type];
    document.getElementById(`chip-${type}`)
      ?.classList.toggle('active', this.state.filters[type]);
    this.updateView();
    this._saveState();
  }

  toggleDiffFilter(diff) {
    const arr = this.state.filters.difficulties;
    const idx = arr.indexOf(diff);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(diff);
    document.querySelectorAll(`.diff-chip[data-diff="${diff}"]`).forEach(el =>
      el.classList.toggle('active', arr.includes(diff))
    );
    this.updateView();
    this._saveState();
  }

  /* =========================================================
     メインビュー更新
     ========================================================= */
  updateView() {
    let recs = [...this.records];

    // 自己ベストのみ（2.8）
    if (this.state.displayMode === 'best') {
      recs = getBestRecords(recs, this.state.mode);
    }

    // フィルター
    recs = filterRecords(recs, this.state.filters, this.state.mode);

    // ソート
    recs = sortRecords(recs, this.state.sortBy, this.state.sortOrder, this.state.mode);

    // 件数表示
    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = `${recs.length}件`;

    // フィルターカウント
    const cnt   = countActiveFilters(this.state.filters);
    const cntEl = document.getElementById('filter-count');
    if (cntEl) {
      cntEl.textContent = cnt;
      cntEl.classList.toggle('hidden', cnt === 0);
    }

    // 空状態
    const emptyEl = document.getElementById('empty-state');
    const vsEl    = document.getElementById('vs-container');
    if (this.records.length === 0) {
      emptyEl?.classList.remove('hidden');
      vsEl?.classList.add('hidden');
    } else {
      emptyEl?.classList.toggle('hidden', recs.length > 0);
      vsEl?.classList.toggle('hidden', recs.length === 0);
    }

    // 仮想スクロール更新
    if (recs.length > 0) {
      this.vs.setItems(recs, rec => this._renderCard(rec));
    }

    this.updateSidebarStats();
  }

  /* =========================================================
     カードレンダリング（2.10）
     ========================================================= */
  _renderCard(record) {
    const thumbURL = this._getThumbURL(record);
    const mode     = this.state.mode;

    const card = document.createElement('div');
    card.className  = 'result-card';
    card.dataset.id = record.id;

    card.innerHTML = `
      <div class="card-image-wrap">
        ${thumbURL
          ? `<img class="card-image" src="${thumbURL}"
               alt="${escapeHtml(record.title)}" loading="lazy">`
          : `<div class="card-image-placeholder">
               <span class="material-icons-round">image</span>
             </div>`}
        <div class="card-badges">
          ${record.isAP ? '<span class="badge-ap">AP</span>' : ''}
          ${record.isFC ? '<span class="badge-fc">FC</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title">${escapeHtml(record.title)}</div>
          <div class="card-actions">
            <button class="card-action-btn" data-action="edit"
              title="編集" aria-label="編集">
              <span class="material-icons-round">edit</span>
            </button>
            <button class="card-action-btn delete" data-action="delete"
              title="削除" aria-label="削除">
              <span class="material-icons-round">delete_outline</span>
            </button>
          </div>
        </div>
        <div class="card-meta">
          <span class="diff-badge" data-diff="${record.difficulty}">${record.difficulty}</span>
          <span class="lv-badge">Lv.${record.level ?? '?'}</span>
        </div>
        <div class="card-stats">
          <div class="stat-item ${mode === 'ap'           ? 'highlight' : ''}">
            <span class="stat-label">AP</span>
            <span class="stat-value">${record.missAP}</span>
          </div>
          <div class="stat-item ${mode === 'ap_tournament' ? 'highlight' : ''}">
            <span class="stat-label">大会</span>
            <span class="stat-value">${record.missAPTournament}</span>
          </div>
          <div class="stat-item ${mode === 'fc'           ? 'highlight' : ''}">
            <span class="stat-label">FC</span>
            <span class="stat-value">${record.missFC}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">COMBO</span>
            <span class="stat-value">${record.combo ?? 0}</span>
          </div>
        </div>
      </div>
    `;

    // 画像クリック → 拡大（2.9）
    card.querySelector('.card-image-wrap').addEventListener('click', () => {
      this.modals.showViewer(record, this._getImageURL(record));
    });

    // 編集（2.14）
    card.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      this.modals.showEdit(record, this._getImageURL(record), async data => {
        await this.updateRecord(record.id, data);
      });
    });

    // 削除→ゴミ箱（2.14 / 2.15）
    card.querySelector('[data-action="delete"]').addEventListener('click', e => {
      e.stopPropagation();
      this.modals.showDeleteConfirm(record, async () => {
        await this.deleteRecord(record.id);
      });
    });

    return card;
  }

  /* =========================================================
     記録CRUD
     ========================================================= */
  async addRecord(formData, imageBlob, thumbBlob) {
    // 楽曲DB照合
    let songId = null, totalNotes = null;
    if (this.songData.loaded && formData.title) {
      const matches = this.songData.findByTitle(formData.title);
      const m = matches.find(x => x.music.title === formData.title)?.music
             ?? matches[0]?.music;
      if (m) {
        songId = m.id;
        const info = this.songData.getDifficultyInfo(songId, formData.difficulty);
        if (info) totalNotes = info.totalNoteCount;
      }
    }

    const record = {
      id:               generateId(),
      title:            formData.title,
      pronunciation:    formData.pronunciation || '',
      songId,
      difficulty:       formData.difficulty,
      level:            formData.level,
      perfect:          formData.perfect          || 0,
      great:            formData.great            || 0,
      good:             formData.good             || 0,
      bad:              formData.bad              || 0,
      miss:             formData.miss             || 0,
      combo:            formData.combo            || 0,
      totalNotes,
      missAP:           formData.missAP           ?? 0,
      missAPTournament: formData.missAPTournament  ?? 0,
      missFC:           formData.missFC           ?? 0,
      isAP:             formData.isAP             ?? false,
      isFC:             formData.isFC             ?? false,
      imageBlob:        imageBlob  || null,
      thumbBlob:        thumbBlob  || null,
      driveFileId:      null,
      addedAt:          Date.now(),
      updatedAt:        Date.now(),
    };

    await this.db.putRecord(record);
    this.records.push(record);

    // Drive非同期アップロード（2.1 / 2.17）
    if (this.drive.isAvailable() && imageBlob) {
      const fname = `${record.id}_${record.difficulty}.jpg`;
      this.drive.uploadImage(imageBlob, fname)
        .then(f => {
          if (f?.id) {
            record.driveFileId = f.id;
            return this.db.putRecord(record);
          }
        })
        .catch(e => console.warn('Drive upload失敗:', e));
    }

    this._checkPersonalBest(record); // 2.19
    this.updateView();
    this.updateTrashBadge();
    this.updateSidebarStats();
  }

  async updateRecord(id, formData) {
    const existing = this.records.find(r => r.id === id);
    if (!existing) return;

    const updated = {
      ...existing,
      title:            formData.title,
      pronunciation:    formData.pronunciation || '',
      difficulty:       formData.difficulty,
      level:            formData.level,
      perfect:          formData.perfect          || 0,
      great:            formData.great            || 0,
      good:             formData.good             || 0,
      bad:              formData.bad              || 0,
      miss:             formData.miss             || 0,
      combo:            formData.combo            || 0,
      missAP:           formData.missAP           ?? 0,
      missAPTournament: formData.missAPTournament  ?? 0,
      missFC:           formData.missFC           ?? 0,
      isAP:             formData.isAP             ?? false,
      isFC:             formData.isFC             ?? false,
      updatedAt:        Date.now(),
    };

    await this.db.putRecord(updated);
    const idx = this.records.findIndex(r => r.id === id);
    if (idx >= 0) this.records[idx] = updated;

    this.notify.success('記録を更新しました');
    this.updateView();
  }

  async deleteRecord(id) {
    await this.trash.moveToTrash(id);
    this._revokeURL(id);
    this.records = this.records.filter(r => r.id !== id);
    this.notify.info('ゴミ箱に移動しました');
    this.updateView();
    this.updateTrashBadge();
    this.updateSidebarStats();
  }

  async refreshRecords() {
    for (const id of this._urlCache.keys()) this._revokeURL(id);
    this.records = await this.db.getAllRecords();
    this.updateView();
    this.notify.success('更新しました');
  }

  /* =========================================================
     自己ベストチェック（要件2.19）
     ========================================================= */
  _checkPersonalBest(newRec) {
    const sameKey = r =>
      (newRec.songId ? r.songId === newRec.songId : r.title === newRec.title)
      && r.difficulty === newRec.difficulty;

    const existing = this.records.filter(r => r.id !== newRec.id && sameKey(r));

    if (!existing.length) {
      this.notify.info(`「${escapeHtml(newRec.title)}」[${newRec.difficulty}] を初登録しました！`);
      return;
    }

    const improved = [];
    const modes = [
      { key: 'ap',            label: 'AP基準'  },
      { key: 'ap_tournament', label: '大会基準' },
      { key: 'fc',            label: 'FC基準'  },
    ];
    for (const { key, label } of modes) {
      const oldBest = existing.reduce(
        (best, r) => isBetterRecord(r, best, key) ? r : best, existing[0]
      );
      if (isBetterRecord(newRec, oldBest, key)) improved.push(label);
    }

    if (improved.length) {
      this.notify.newBest(newRec.title, newRec.difficulty, improved.join(' / '));
    }
  }

  /* =========================================================
     設定ページ
     ========================================================= */
  async renderSettingsPage() {
    const el = document.getElementById('settings-content');
    if (!el) return;

    const clientId = await this.db.getSetting('google_client_id', '');
    const devices  = await this.db.getSetting('devices', []);
    const isAuth   = this.auth.isSignedIn();

    const devListHTML = devices.length
      ? devices.map(d => `
          <div class="device-item" data-device-id="${d.id}">
            <span class="material-icons-round" style="color:var(--accent)">smartphone</span>
            <div style="flex:1;min-width:0">
              <div class="device-name">${escapeHtml(d.name)}</div>
              <div class="device-meta">${formatDate(d.createdAt)}</div>
            </div>
            <button class="btn-secondary"
              style="padding:5px 10px;font-size:0.78rem;white-space:nowrap"
              data-action="edit-device" data-id="${d.id}">
              <span class="material-icons-round" style="font-size:15px">edit</span>
            </button>
            <button class="btn-danger"
              style="padding:5px 10px;font-size:0.78rem"
              data-action="del-device" data-id="${d.id}">
              <span class="material-icons-round" style="font-size:15px">delete</span>
            </button>
          </div>`)
        .join('')
      : `<p style="color:var(--text-muted);padding:12px 0;font-size:0.85rem">
           登録されている機種はありません
         </p>`;

    el.innerHTML = `
      <!-- Google Drive -->
      <div class="settings-section">
        <div class="settings-section-title">Google Drive 連携（2.1）</div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">接続状態</div>
            <div class="settings-row-desc" id="drive-status-text">
              ${isAuth
                ? '<span style="color:var(--success);font-weight:600">接続済み</span>'
                : '<span style="color:var(--text-muted)">未接続</span>'
              }
            </div>
          </div>
          <button class="btn-secondary" id="btn-drive-toggle">
            <span class="material-icons-round">${isAuth ? 'link_off' : 'link'}</span>
            ${isAuth ? '切断' : '接続'}
          </button>
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <div class="settings-row-label">Google APIクライアントID</div>
          <input type="text" id="client-id-input" class="settings-input"
            value="${escapeHtml(clientId)}"
            placeholder="例: XXXXXXXX.apps.googleusercontent.com">
          <p style="font-size:0.75rem;color:var(--text-muted);margin:0">
            Google Cloud Console でOAuth 2.0クライアントIDを作成し、
            このページのURLを「承認済みのJavaScriptオリジン」に追加してください
          </p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn-primary" id="btn-save-client-id"
              style="padding:8px 16px;font-size:0.85rem">
              <span class="material-icons-round" style="font-size:16px">save</span>保存
            </button>
          </div>
        </div>
      </div>

      <!-- 機種設定（4.6） -->
      <div class="settings-section">
        <div class="settings-section-title">OCR機種設定（4.6）</div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch">
          <p style="font-size:0.82rem;color:var(--text-muted);padding:4px 0 8px">
            機種ごとに読み取り範囲を調整すると認識精度が向上します。
            未設定の場合はデフォルト設定で動作します。
          </p>
          <div class="device-list" id="device-list">${devListHTML}</div>
          <div style="padding:8px 0">
            <button class="btn-primary" id="btn-add-device">
              <span class="material-icons-round">add</span>機種を追加
            </button>
          </div>
        </div>
      </div>

      <!-- データ管理 -->
      <div class="settings-section">
        <div class="settings-section-title">データ管理</div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">登録記録数</div>
            <div class="settings-row-desc">${this.records.length}件</div>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">全データを消去</div>
            <div class="settings-row-desc">
              全記録・設定をブラウザから削除します（Driveのデータは残ります）
            </div>
          </div>
          <button class="btn-danger" id="btn-clear-all">消去</button>
        </div>
      </div>
    `;

    /* イベント */
    el.querySelector('#btn-drive-toggle')
      ?.addEventListener('click', () => this._handleDriveToggle());

    el.querySelector('#btn-save-client-id')?.addEventListener('click', async () => {
      const id = el.querySelector('#client-id-input')?.value.trim();
      await this.db.setSetting('google_client_id', id);
      if (id) await this.auth.init(id).catch(() => {});
      this.notify.success('クライアントIDを保存しました。再接続してください。');
    });

    el.querySelector('#btn-add-device')?.addEventListener('click', () => {
      this.modals.showDeviceCalibration(null, async device => {
        const devs = await this.db.getSetting('devices', []);
        devs.push(device);
        await this.db.setSetting('devices', devs);
        this.notify.success(`「${device.name}」を追加しました`);
        this.renderSettingsPage();
      });
    });

    el.querySelectorAll('[data-action="edit-device"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const devs = await this.db.getSetting('devices', []);
        const dev  = devs.find(d => d.id === btn.dataset.id);
        if (!dev) return;
        this.modals.showDeviceCalibration(dev, async updated => {
          const idx = devs.findIndex(d => d.id === updated.id);
          if (idx >= 0) devs[idx] = updated; else devs.push(updated);
          await this.db.setSetting('devices', devs);
          this.notify.success('機種設定を更新しました');
          this.renderSettingsPage();
        });
      });
    });

    el.querySelectorAll('[data-action="del-device"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const devs = await this.db.getSetting('devices', []);
        const dev  = devs.find(d => d.id === btn.dataset.id);
        if (!dev) return;
        this.modals.showDeleteConfirm(
          { title: dev.name, difficulty: '機種設定' },
          async () => {
            await this.db.setSetting('devices', devs.filter(d => d.id !== btn.dataset.id));
            this.notify.info('機種設定を削除しました');
            this.renderSettingsPage();
          }
        );
      });
    });

    el.querySelector('#btn-clear-all')?.addEventListener('click', () => {
      this.modals.showPermanentDeleteConfirm(
        '全ての記録と設定を消去しますか？',
        async () => {
          try {
            for (const r of [...this.records]) {
              this._revokeURL(r.id);
              await this.db.deleteRecord(r.id);
            }
            const trash = await this.db.getAllTrash();
            for (const t of trash) await this.db.deleteTrashItem(t.id);
            await this.db.setSetting('devices', []);
            await this.db.setSetting('app_state', null);
            this.records = [];
            this.updateView();
            this.updateTrashBadge();
            this.updateSidebarStats();
            this.notify.success('全データを消去しました');
          } catch (e) {
            this.notify.error('消去に失敗: ' + e.message);
          }
        }
      );
    });
  }

  /* =========================================================
     ゴミ箱ページ（2.15 / 2.16）
     ========================================================= */
  async renderTrashPage() {
    const actionsEl = document.getElementById('trash-actions');
    const listEl    = document.getElementById('trash-list');
    if (!actionsEl || !listEl) return;

    const items = await this.trash.getAll();
    items.sort((a, b) => b.trashedAt - a.trashedAt);

    actionsEl.innerHTML = items.length
      ? `<button class="btn-danger" id="btn-empty-trash">
           <span class="material-icons-round">delete_forever</span>全て完全削除
         </button>`
      : '';

    if (!items.length) {
      listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;gap:12px">
          <span class="material-icons-round" style="font-size:64px;color:var(--text-muted);opacity:0.4">
            delete_outline
          </span>
          <p style="color:var(--text-secondary);font-weight:700">ゴミ箱は空です</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(item => {
      const thumbURL = this._getThumbURL(item);
      const remaining = Trash.remainingText(item.trashedAt);
      const isUrgent  = (item.trashedAt + CONFIG.TRASH_DAYS * 86400000 - Date.now()) < 86400000;
      return `
        <div class="trash-item" data-id="${item.id}">
          ${thumbURL
            ? `<img class="trash-item-thumb" src="${thumbURL}" alt="">`
            : `<div class="trash-item-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--surface-2)">
                <span class="material-icons-round" style="color:var(--text-muted)">image</span>
               </div>`}
          <div class="trash-item-info">
            <div class="trash-item-title">${escapeHtml(item.title)}</div>
            <div style="display:flex;gap:5px;margin:3px 0;flex-wrap:wrap">
              <span class="diff-badge" data-diff="${item.difficulty}"
                style="font-size:0.68rem;padding:2px 6px">${item.difficulty}</span>
              <span class="lv-badge" style="font-size:0.68rem;padding:2px 6px">Lv.${item.level ?? '?'}</span>
            </div>
            <div class="trash-item-date">
              削除日: ${formatDate(item.trashedAt)}
              <span class="trash-remaining${isUrgent ? ' urgent' : ''}">${remaining}</span>
            </div>
          </div>
          <div class="trash-item-actions">
            <button class="btn-secondary" style="padding:6px 10px;font-size:0.78rem"
              data-action="restore" title="復元" aria-label="復元">
              <span class="material-icons-round" style="font-size:16px">restore</span>
            </button>
            <button class="btn-danger" style="padding:6px 10px;font-size:0.78rem"
              data-action="perm-delete" title="完全削除" aria-label="完全削除">
              <span class="material-icons-round" style="font-size:16px">delete_forever</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    /* 全削除ボタン（2.16） */
    document.getElementById('btn-empty-trash')?.addEventListener('click', () => {
      this.modals.showPermanentDeleteConfirm(
        `ゴミ箱の${items.length}件を全て完全削除しますか？`,
        async () => {
          const cnt = await this.trash.permanentDeleteAll();
          for (const item of items) this._revokeURL(item.id);
          this.notify.success(`${cnt}件を完全削除しました`);
          this.updateTrashBadge();
          this.renderTrashPage();
        }
      );
    });

    /* 復元ボタン */
    listEl.querySelectorAll('[data-action="restore"]').forEach(btn => {
      const id = btn.closest('.trash-item')?.dataset.id;
      btn.addEventListener('click', async () => {
        await this.trash.restore(id);
        this.records = await this.db.getAllRecords();
        this.updateView();
        this.updateTrashBadge();
        this.updateSidebarStats();
        this.renderTrashPage();
      });
    });

    /* 個別完全削除ボタン（2.16 / 2.17） */
    listEl.querySelectorAll('[data-action="perm-delete"]').forEach(btn => {
      const id   = btn.closest('.trash-item')?.dataset.id;
      const item = items.find(i => i.id === id);
      btn.addEventListener('click', () => {
        this.modals.showPermanentDeleteConfirm(
          `「${escapeHtml(item?.title || id)}」を完全削除しますか？`,
          async () => {
            await this.trash.permanentDelete(id);
            this._revokeURL(id);
            this.updateTrashBadge();
            this.renderTrashPage();
          }
        );
      });
    });
  }

  /* =========================================================
     UI補助メソッド
     ========================================================= */
  _toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      const isOpen = sidebar.classList.toggle('open');
      let overlay  = document.getElementById('sidebar-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => this._toggleSidebar());
      }
      overlay.classList.toggle('open', isOpen);
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }

  _toggleFilterPanel() {
    const body   = document.getElementById('filter-body');
    const toggle = document.getElementById('filter-toggle');
    if (!body) return;
    body.classList.toggle('collapsed');
    toggle?.classList.toggle('open', !body.classList.contains('collapsed'));
  }

  _updateSortUI() {
    const { sortBy, sortOrder } = this.state;
    document.querySelectorAll('.sort-pill[data-sort]').forEach(btn => {
      const active = btn.dataset.sort === sortBy;
      btn.classList.toggle('active', active);
      const arrow = btn.querySelector('.sort-arrow');
      if (!arrow) return;
      if (active) {
        arrow.textContent = sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
      } else {
        arrow.textContent = 'unfold_more';
      }
    });
  }

  _applyStateToUI() {
    const { mode, displayMode, filters } = this.state;
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode)
    );
    document.querySelectorAll('.seg-btn[data-display]').forEach(b =>
      b.classList.toggle('active', b.dataset.display === displayMode)
    );
    this._updateSortUI();

    if (filters.ap) document.getElementById('chip-ap')?.classList.add('active');
    if (filters.fc) document.getElementById('chip-fc')?.classList.add('active');
    (filters.difficulties || []).forEach(d => {
      document.querySelectorAll(`.diff-chip[data-diff="${d}"]`)
        .forEach(el => el.classList.add('active'));
    });
    const nameEl = document.getElementById('search-name');
    if (nameEl && filters.name) {
      nameEl.value = filters.name;
      document.getElementById('clear-name')?.classList.remove('hidden');
    }
    if (filters.level) {
      const el = document.getElementById('search-level');
      if (el) el.value = filters.level;
    }
    if (filters.missMin != null) {
      const el = document.getElementById('miss-min');
      if (el) el.value = filters.missMin;
    }
    if (filters.missMax != null) {
      const el = document.getElementById('miss-max');
      if (el) el.value = filters.missMax;
    }
  }

  async updateTrashBadge() {
    const cnt     = await this.db.getTrashCount();
    const badgeEl = document.getElementById('trash-badge');
    if (!badgeEl) return;
    badgeEl.textContent = cnt;
    badgeEl.classList.toggle('hidden', cnt === 0);
  }

  updateSidebarStats() {
    const el = document.getElementById('sidebar-stats');
    if (!el) return;
    const ap = this.records.filter(r => r.isAP).length;
    const fc = this.records.filter(r => r.isFC).length;
    el.innerHTML = `
      <div>総記録: <b>${this.records.length}</b>件</div>
      <div>AP済み: <b>${ap}</b>件</div>
      <div>FC済み: <b>${fc}</b>件</div>
    `;
  }

  /* =========================================================
     認証
     ========================================================= */
  updateAuthUI() {
    const isAuth = this.auth.isSignedIn();
    document.getElementById('btn-signin')?.classList.toggle('hidden',  isAuth);
    document.getElementById('user-btn')?.classList.toggle('hidden',   !isAuth);
  }

  async _handleSignIn() {
    const clientId = await this.db.getSetting('google_client_id', '');
    if (!clientId) {
      this.navigate('settings');
      this.notify.warning('設定でGoogle APIクライアントIDを入力してください');
      return;
    }
    await this.auth.init(clientId).catch(() => {});
    const token = await this.auth.signIn();
    if (token) {
      this.notify.success('Google Driveに接続しました');
      this.updateAuthUI();
    }
  }

  _handleSignOut() {
    this.auth.signOut();
    this.notify.info('Google Driveから切断しました');
    this.updateAuthUI();
  }

  async _handleDriveToggle() {
    if (this.auth.isSignedIn()) this._handleSignOut();
    else await this._handleSignIn();
    this.renderSettingsPage();
  }

  /* =========================================================
     BlobURLキャッシュ
     ========================================================= */
  _getThumbURL(record) {
    if (!record?.thumbBlob) return null;
    const entry = this._urlCache.get(record.id) || {};
    if (!entry.thumb) {
      entry.thumb = createBlobURL(record.thumbBlob);
      this._urlCache.set(record.id, entry);
    }
    return entry.thumb;
  }

  _getImageURL(record) {
    if (!record?.imageBlob) return null;
    const entry = this._urlCache.get(record.id) || {};
    if (!entry.image) {
      entry.image = createBlobURL(record.imageBlob);
      this._urlCache.set(record.id, entry);
    }
    return entry.image;
  }

  _revokeURL(id) {
    const entry = this._urlCache.get(id);
    if (!entry) return;
    if (entry.thumb) revokeBlobURL(entry.thumb);
    if (entry.image) revokeBlobURL(entry.image);
    this._urlCache.delete(id);
  }

  /* =========================================================
     ローディング
     ========================================================= */
  showLoading(text = '処理中...') {
    const el  = document.getElementById('loading-overlay');
    const txt = document.getElementById('loading-text');
    if (txt) txt.textContent = text;
    el?.classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
  }

  /* =========================================================
     状態保存
     ========================================================= */
  _saveState() {
    this.db.setSetting('app_state', {
      view:        this.state.view,
      mode:        this.state.mode,
      displayMode: this.state.displayMode,
      sortBy:      this.state.sortBy,
      sortOrder:   this.state.sortOrder,
      filters:     this.state.filters,
    }).catch(() => {});
  }

  _debouncedUpdate() {
    clearTimeout(this._debTimer);
    this._debTimer = setTimeout(() => { this.updateView(); this._saveState(); }, 250);
  }
}

/* =========================================================
   アプリ起動
   ========================================================= */
const app = new App();
app.init().catch(e => {
  console.error('アプリ起動エラー:', e);
  document.getElementById('loading-overlay')?.classList.add('hidden');
});
