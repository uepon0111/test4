'use strict';

/* ========== SETTINGS ========== */
const Settings = (() => {
  const PROFILES_KEY    = 'ocrProfiles';
  const ACTIVE_KEY      = 'activeOcrProfile';
  let _editorModal      = null;
  let _editorProfile    = null; // profile being edited
  let _editorImg        = null; // HTMLImageElement for calibration
  let _editorRegions    = null; // copy of regions being edited
  let _dragState        = null; // {key, mode, startX, startY, startR, containerRect}

  /* ---- Profile storage (localStorage) ---- */
  function loadProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; }
  }
  function saveProfiles(profiles) { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }
  function getActiveId()       { return localStorage.getItem(ACTIVE_KEY) || null; }
  function setActiveId(id)     { localStorage.setItem(ACTIVE_KEY, id || ''); }

  function getActiveRegions() {
    const profiles = loadProfiles();
    const id       = getActiveId();
    const p        = profiles.find(x => x.id === id);
    return (p && p.regions) ? p.regions : CONFIG.DEFAULT_OCR_REGIONS;
  }

  /* ---- Render Settings Page ---- */
  function render() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const clientId  = CONFIG.GOOGLE_CLIENT_ID || '';
    const profiles  = loadProfiles();
    const activeId  = getActiveId();
    const isSignedIn = Auth.isSignedIn();
    const user      = Auth.getUserInfo();

    container.innerHTML = `
      <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;">設定</h2>

      <!-- Google連携 -->
      <div class="settings-section">
        <div class="settings-section-header">
          <span class="material-icons-round">account_circle</span> Google連携
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-title">Client ID</div>
            <div class="settings-row-desc">Google Cloud ConsoleでOAuth 2.0クライアントIDを取得してください</div>
          </div>
          <input class="settings-input" id="client-id-input" type="text"
            placeholder="xxx.apps.googleusercontent.com" value="${Utils.esc(clientId)}"
            style="font-size:11px;max-width:200px">
          <button class="settings-save-btn" id="client-id-save">保存</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-title">アカウント</div>
            <div class="settings-row-desc">${isSignedIn && user ? Utils.esc(user.email || user.name || '') : 'ログインしていません'}</div>
          </div>
          ${isSignedIn
            ? `<button class="auth-banner-btn sign-out" id="settings-signout-btn">ログアウト</button>`
            : `<button class="auth-banner-btn sign-in" id="settings-signin-btn">Googleでログイン</button>`
          }
        </div>
      </div>

      <!-- 判定モード -->
      <div class="settings-section">
        <div class="settings-section-header">
          <span class="material-icons-round">tune</span> 判定モード
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-title">デフォルト判定モード</div>
            <div class="settings-row-desc">リザルト一覧に表示するミス数の計算方法</div>
          </div>
          <select class="settings-input" id="default-mode-select" style="max-width:140px">
            <option value="ap"           ${(localStorage.getItem('defaultMode')||'ap')==='ap'           ? 'selected':''}>AP基準</option>
            <option value="ap-tournament"${(localStorage.getItem('defaultMode')||'ap')==='ap-tournament'? 'selected':''}>AP大会基準</option>
            <option value="fc"           ${(localStorage.getItem('defaultMode')||'ap')==='fc'           ? 'selected':''}>FC基準</option>
          </select>
        </div>
      </div>

      <!-- OCR プロファイル -->
      <div class="settings-section">
        <div class="settings-section-header">
          <span class="material-icons-round">photo_camera</span> OCR読み取りプロファイル
        </div>
        <div style="padding:10px 16px;font-size:12px;color:var(--text-hint);">
          機種ごとにリザルト画像の読み取り範囲を設定できます。サンプル画像をアップロードして範囲を調整してください。
        </div>

        <div class="profile-list" id="profile-list">
          ${_renderProfileList(profiles, activeId)}
        </div>

        <div style="padding:10px 16px;border-top:1px solid var(--border-light);">
          <button class="btn secondary" id="add-profile-btn" style="font-size:13px;padding:7px 14px;">
            <span class="material-icons-round" style="font-size:16px">add</span> プロファイルを追加
          </button>
        </div>
      </div>

      <!-- データ管理 -->
      <div class="settings-section">
        <div class="settings-section-header">
          <span class="material-icons-round">storage</span> データ管理
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-title">音楽データベースキャッシュをクリア</div>
            <div class="settings-row-desc">楽曲情報キャッシュを削除して再取得します</div>
          </div>
          <button class="settings-save-btn" id="clear-cache-btn">クリア</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-title">ローカルデータを全削除</div>
            <div class="settings-row-desc" style="color:#D32F2F;">すべてのリザルトと設定を削除します (取り消し不可)</div>
          </div>
          <button class="settings-save-btn" id="clear-all-btn" style="background:#D32F2F;">全削除</button>
        </div>
      </div>

      <!-- About -->
      <div style="text-align:center;padding:20px 0;color:var(--text-hint);font-size:12px;">
        プロセカ リザルト管理 v1.0<br>
        データはブラウザのローカルストレージとGoogle Driveに保存されます
      </div>
    `;

    _bindSettingsEvents(profiles, activeId);
  }

  function _renderProfileList(profiles, activeId) {
    if (!profiles.length) {
      return `<div style="padding:12px 16px;font-size:13px;color:var(--text-hint);">プロファイルがありません。「プロファイルを追加」から追加してください。</div>`;
    }
    return profiles.map(p => `
      <div class="profile-item" data-id="${p.id}">
        <div class="profile-name">${Utils.esc(p.name)}</div>
        ${p.id === activeId ? '<span class="profile-active-badge">使用中</span>' : ''}
        <div class="profile-actions">
          ${p.id !== activeId ? `<button class="profile-action-btn select" data-id="${p.id}">選択</button>` : ''}
          <button class="profile-action-btn edit" data-id="${p.id}">編集</button>
          <button class="profile-action-btn delete" data-id="${p.id}">削除</button>
        </div>
      </div>
    `).join('');
  }

  function _bindSettingsEvents(profiles, activeId) {
    /* Client ID save */
    document.getElementById('client-id-save')?.addEventListener('click', async () => {
      const val = document.getElementById('client-id-input')?.value?.trim() || '';
      CONFIG.GOOGLE_CLIENT_ID = val;
      await DB.setSetting('googleClientId', val);
      await Auth.init(val);
      Notification.show('Client IDを保存しました', 'success');
    });

    /* Sign in / out */
    document.getElementById('settings-signin-btn')?.addEventListener('click', () => Auth.signIn());
    document.getElementById('settings-signout-btn')?.addEventListener('click', () => {
      Auth.signOut();
      render();
    });

    /* Default mode */
    document.getElementById('default-mode-select')?.addEventListener('change', e => {
      localStorage.setItem('defaultMode', e.target.value);
      App.setMode(e.target.value);
    });

    /* Cache clear */
    document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
      await DB.deleteSetting('musicDbCache');
      Notification.show('キャッシュをクリアしました', 'success');
    });

    /* Clear all */
    document.getElementById('clear-all-btn')?.addEventListener('click', () => {
      App.showConfirm(
        'ローカルデータの全削除',
        'すべてのリザルト、設定、キャッシュを削除します。この操作は取り消せません。',
        async () => {
          const all = await DB.getAllResults();
          for (const r of all) await DB.deleteResult(r.id);
          await DB.deleteSetting('musicDbCache');
          await DB.deleteSetting('googleClientId');
          localStorage.clear();
          Notification.show('すべてのデータを削除しました', 'info');
          App.refreshResults();
          render();
        },
        'すべて削除'
      );
    });

    /* Add profile */
    document.getElementById('add-profile-btn')?.addEventListener('click', () => {
      const newProfile = {
        id:      Utils.uuid(),
        name:    `プロファイル ${loadProfiles().length + 1}`,
        regions: JSON.parse(JSON.stringify(CONFIG.DEFAULT_OCR_REGIONS)),
        sampleDataUrl: null,
      };
      openEditor(newProfile, true);
    });

    /* Profile list actions */
    document.querySelectorAll('.profile-action-btn.select').forEach(btn => {
      btn.addEventListener('click', () => {
        setActiveId(btn.dataset.id);
        Notification.show('プロファイルを変更しました', 'success');
        render();
      });
    });
    document.querySelectorAll('.profile-action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const profiles2 = loadProfiles();
        const p = profiles2.find(x => x.id === btn.dataset.id);
        if (p) openEditor(p, false);
      });
    });
    document.querySelectorAll('.profile-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const profiles2 = loadProfiles();
        const p = profiles2.find(x => x.id === btn.dataset.id);
        App.showConfirm(
          'プロファイルの削除',
          `「${p?.name || btn.dataset.id}」を削除しますか？`,
          () => {
            const updated = loadProfiles().filter(x => x.id !== btn.dataset.id);
            saveProfiles(updated);
            if (getActiveId() === btn.dataset.id) setActiveId(null);
            render();
          }
        );
      });
    });
  }

  /* ==============================
     OCR Region Editor Modal
  ============================== */
  function openEditor(profile, isNew) {
    _editorProfile = JSON.parse(JSON.stringify(profile));
    _editorRegions = JSON.parse(JSON.stringify(profile.regions || CONFIG.DEFAULT_OCR_REGIONS));
    _editorImg     = null;

    /* Build modal HTML */
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'ocr-editor-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-height:95vh;max-width:640px">
        <div class="modal-header">
          <h3 class="modal-title">${isNew ? 'プロファイルを作成' : 'プロファイルを編集'}</h3>
          <button class="modal-close-btn" id="editor-close"><span class="material-icons-round">close</span></button>
        </div>
        <div class="modal-body" style="padding:12px 16px;overflow-y:auto;">
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">プロファイル名</label>
            <input class="form-input" id="editor-profile-name" value="${Utils.esc(_editorProfile.name)}" placeholder="例: iPhone15">
          </div>

          <div class="form-section-title">サンプル画像</div>
          <p style="font-size:12px;color:var(--text-hint);margin:6px 0 10px;">
            リザルト画像をアップロードして、各情報の読み取り範囲（色付き枠）をドラッグで調整してください。
          </p>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
            <input type="file" id="editor-file-input" accept="image/*" style="display:none">
            <button class="btn secondary" id="editor-file-btn" style="font-size:13px;padding:7px 14px">
              <span class="material-icons-round" style="font-size:16px">upload</span> 画像を選択
            </button>
            <button class="btn secondary" id="editor-reset-btn" style="font-size:13px;padding:7px 14px">
              <span class="material-icons-round" style="font-size:16px">refresh</span> デフォルトに戻す
            </button>
          </div>

          <!-- Legend -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            ${Object.entries(CONFIG.OCR_REGION_COLORS).map(([key, color]) =>
              `<span style="display:flex;align-items:center;gap:4px;font-size:11px;">
                <span style="width:12px;height:12px;background:${color};border-radius:2px;display:inline-block;"></span>
                ${CONFIG.OCR_REGION_LABELS[key]}
              </span>`
            ).join('')}
          </div>

          <!-- Editor canvas area -->
          <div id="ocr-editor-area" style="position:relative;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;background:#111;min-height:120px;user-select:none;touch-action:none;">
            <p id="editor-placeholder" style="text-align:center;color:#666;padding:40px 20px;font-size:13px;">
              画像をアップロードすると範囲を調整できます
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn secondary" id="editor-cancel">キャンセル</button>
          <button class="btn primary" id="editor-save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    _editorModal = modal;

    modal.getElementById = id => modal.querySelector('#' + id);

    modal.querySelector('#editor-close').addEventListener('click', closeEditor);
    modal.querySelector('#editor-cancel').addEventListener('click', closeEditor);
    modal.querySelector('#editor-save').addEventListener('click', () => saveEditor(isNew));
    modal.querySelector('#editor-reset-btn').addEventListener('click', () => {
      _editorRegions = JSON.parse(JSON.stringify(CONFIG.DEFAULT_OCR_REGIONS));
      if (_editorImg) _renderEditor();
    });

    /* File upload */
    const fileInput = modal.querySelector('#editor-file-input');
    modal.querySelector('#editor-file-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await Utils.readFileAsDataURL(file);
      _editorProfile.sampleDataUrl = dataUrl;
      _editorImg = await Utils.loadImage(dataUrl);
      _renderEditor();
    });

    /* If profile already has a sample image */
    if (_editorProfile.sampleDataUrl) {
      Utils.loadImage(_editorProfile.sampleDataUrl).then(img => {
        _editorImg = img;
        _renderEditor();
      }).catch(() => {});
    }
  }

  function _renderEditor() {
    const area = _editorModal.querySelector('#ocr-editor-area');
    if (!area || !_editorImg) return;

    area.innerHTML = '';

    /* Background image */
    const bgImg = document.createElement('img');
    bgImg.src = _editorImg.src;
    bgImg.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;';
    area.appendChild(bgImg);

    /* Region handles (absolute divs) */
    const imgAspect = _editorImg.naturalHeight / _editorImg.naturalWidth;

    // We'll measure actual rendered size after appending
    requestAnimationFrame(() => {
      const areaW = area.clientWidth;
      const areaH = areaW * imgAspect;
      area.style.height = areaH + 'px';

      for (const [key, region] of Object.entries(_editorRegions)) {
        _createHandle(area, key, region, areaW, areaH);
      }
    });
  }

  function _createHandle(area, key, region, areaW, areaH) {
    const color = CONFIG.OCR_REGION_COLORS[key] || '#FFF';
    const label = CONFIG.OCR_REGION_LABELS[key] || key;

    const handle = document.createElement('div');
    handle.dataset.key = key;
    handle.style.cssText = `
      position:absolute;
      border:2px solid ${color};
      background:${color}20;
      box-sizing:border-box;
      cursor:move;
      left:${region.x * 100}%;
      top:${region.y * 100}%;
      width:${region.w * 100}%;
      height:${region.h * 100}%;
    `;

    /* Label */
    const lbl = document.createElement('div');
    lbl.style.cssText = `
      position:absolute;top:0;left:0;
      background:${color};color:white;
      font-size:10px;font-weight:700;
      padding:1px 4px;border-radius:0 0 3px 0;
      pointer-events:none;white-space:nowrap;
      text-shadow:0 1px 2px rgba(0,0,0,0.4);
    `;
    lbl.textContent = label;
    handle.appendChild(lbl);

    /* Resize corner */
    const resizer = document.createElement('div');
    resizer.style.cssText = `
      position:absolute;bottom:-4px;right:-4px;
      width:12px;height:12px;
      background:white;border:2px solid ${color};
      border-radius:2px;cursor:se-resize;
    `;
    handle.appendChild(resizer);

    /* Drag handlers */
    const onPointerDown = (e) => {
      e.preventDefault();
      const isResize = e.target === resizer;
      const rect = area.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      _dragState = {
        key,
        mode:   isResize ? 'resize' : 'move',
        startX: (clientX - rect.left) / areaW,
        startY: (clientY - rect.top)  / areaH,
        startR: { ...region },
        area,
        areaW, areaH,
      };
    };

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: false });

    area.appendChild(handle);
  }

  /* Global pointer move/up handlers (set once) */
  function _onPointerMove(e) {
    if (!_dragState) return;
    e.preventDefault();
    const rect    = _dragState.area.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const cx      = (clientX - rect.left) / _dragState.areaW;
    const cy      = (clientY - rect.top)  / _dragState.areaH;
    const dx      = cx - _dragState.startX;
    const dy      = cy - _dragState.startY;
    const sr      = _dragState.startR;
    const region  = _editorRegions[_dragState.key];

    if (_dragState.mode === 'move') {
      region.x = Math.max(0, Math.min(1 - region.w, sr.x + dx));
      region.y = Math.max(0, Math.min(1 - region.h, sr.y + dy));
    } else {
      region.w = Math.max(0.05, Math.min(1 - region.x, sr.w + dx));
      region.h = Math.max(0.03, Math.min(1 - region.y, sr.h + dy));
    }

    /* Update handle style live */
    const handle = _dragState.area.querySelector(`[data-key="${_dragState.key}"]`);
    if (handle) {
      handle.style.left   = `${region.x * 100}%`;
      handle.style.top    = `${region.y * 100}%`;
      handle.style.width  = `${region.w * 100}%`;
      handle.style.height = `${region.h * 100}%`;
    }
  }

  function _onPointerUp() {
    _dragState = null;
  }

  document.addEventListener('mousemove', _onPointerMove);
  document.addEventListener('mouseup',   _onPointerUp);
  document.addEventListener('touchmove', _onPointerMove, { passive: false });
  document.addEventListener('touchend',  _onPointerUp);

  function closeEditor() {
    if (_editorModal) {
      _editorModal.remove();
      _editorModal = null;
    }
    _editorProfile = null;
    _editorImg     = null;
    _dragState     = null;
  }

  function saveEditor(isNew) {
    const nameInput = _editorModal.querySelector('#editor-profile-name');
    if (nameInput) _editorProfile.name = nameInput.value.trim() || _editorProfile.name;
    _editorProfile.regions = JSON.parse(JSON.stringify(_editorRegions));

    const profiles = loadProfiles();
    if (isNew) {
      profiles.push(_editorProfile);
      if (!getActiveId()) setActiveId(_editorProfile.id); // auto-activate first profile
    } else {
      const idx = profiles.findIndex(x => x.id === _editorProfile.id);
      if (idx >= 0) profiles[idx] = _editorProfile;
      else           profiles.push(_editorProfile);
    }
    saveProfiles(profiles);
    Notification.show(`プロファイル「${_editorProfile.name}」を保存しました`, 'success');
    closeEditor();
    render();
  }

  return {
    render,
    getActiveRegions,
  };
})();
