'use strict';

/* ========== UPLOAD FLOW ========== */
const Upload = (() => {
  let _overlay, _body, _footer, _nextBtn, _backBtn, _titleEl;
  let _step      = 0;      // 0=mode,1=drop,2=ocr,3=review
  let _autoMode  = true;
  let _queue     = [];     // [{file, dataUrl, thumbUrl, ocrData, editData, status}]
  let _queueIdx  = 0;      // index in review step
  let _regions   = null;   // OCR regions currently in use

  /* ---- Init ---- */
  function init() {
    _overlay = document.getElementById('upload-overlay');
    _body    = document.getElementById('upload-body');
    _footer  = document.getElementById('upload-footer');
    _nextBtn = document.getElementById('upload-next-btn');
    _backBtn = document.getElementById('upload-back-btn');
    _titleEl = document.getElementById('upload-modal-title');

    document.getElementById('upload-close').addEventListener('click', closeModal);
    _nextBtn.addEventListener('click', onNext);
    _backBtn.addEventListener('click', onBack);
  }

  function openModal() {
    _step   = 0;
    _queue  = [];
    _queueIdx = 0;
    _regions = getActiveRegions();
    renderStep();
    _overlay.style.display = 'flex';
  }

  function closeModal() {
    _overlay.style.display = 'none';
    _queue  = [];
    _regions = null;
  }

  function getActiveRegions() {
    const profiles = JSON.parse(localStorage.getItem('ocrProfiles') || '[]');
    const activeId = localStorage.getItem('activeOcrProfile');
    const active   = profiles.find(p => p.id === activeId);
    return (active && active.regions) ? active.regions : CONFIG.DEFAULT_OCR_REGIONS;
  }

  /* ---- Step rendering ---- */
  function renderStep() {
    _body.innerHTML = '';
    _footer.style.display = 'none';
    _backBtn.style.display = 'none';
    _nextBtn.style.display = 'inline-flex';
    _nextBtn.textContent = '次へ';
    _nextBtn.innerHTML = '次へ <span class="material-icons-round">arrow_forward</span>';
    _nextBtn.disabled = false;
    _nextBtn.className = 'btn primary';

    _titleEl.textContent = 'リザルト追加';

    switch (_step) {
      case 0: renderModeStep(); break;
      case 1: renderDropStep(); break;
      case 2: renderOCRStep(); break;
      case 3: renderReviewStep(); break;
    }
  }

  /* Step 0: Choose mode */
  function renderModeStep() {
    _titleEl.textContent = '追加方法を選択';
    _body.innerHTML = `
      <div class="step-indicator">
        <div class="step-dot active"></div>
        <div class="step-dot"></div>
        <div class="step-dot"></div>
        <div class="step-dot"></div>
      </div>
      <div class="upload-mode-grid" style="margin-top:16px">
        <div class="upload-mode-card ${_autoMode ? 'selected' : ''}" id="mode-auto">
          <span class="material-icons-round">auto_awesome</span>
          <div class="upload-mode-card-title">自動登録</div>
          <div class="upload-mode-card-desc">画像から情報を自動で読み取ります</div>
        </div>
        <div class="upload-mode-card ${!_autoMode ? 'selected' : ''}" id="mode-manual">
          <span class="material-icons-round">edit_note</span>
          <div class="upload-mode-card-title">手動登録</div>
          <div class="upload-mode-card-desc">情報を自分で入力します</div>
        </div>
      </div>
    `;
    _footer.style.display = 'flex';

    document.getElementById('mode-auto').addEventListener('click', () => {
      _autoMode = true;
      document.getElementById('mode-auto').classList.add('selected');
      document.getElementById('mode-manual').classList.remove('selected');
    });
    document.getElementById('mode-manual').addEventListener('click', () => {
      _autoMode = false;
      document.getElementById('mode-manual').classList.add('selected');
      document.getElementById('mode-auto').classList.remove('selected');
    });
  }

  /* Step 1: Drop zone */
  function renderDropStep() {
    _titleEl.textContent = '画像を選択';
    _body.innerHTML = `
      <div class="step-indicator">
        <div class="step-dot done"></div>
        <div class="step-dot active"></div>
        <div class="step-dot"></div>
        <div class="step-dot"></div>
      </div>
      <input type="file" id="file-input" accept="image/*" multiple style="display:none">
      <div class="drop-zone" id="drop-zone">
        <span class="material-icons-round">cloud_upload</span>
        <p>画像をここにドロップ<br>または下のボタンから選択</p>
        <div class="drop-zone-btn" id="file-pick-btn">ファイルを選択</div>
      </div>
      <div class="upload-queue" id="upload-queue"></div>
    `;
    _footer.style.display = 'flex';
    _backBtn.style.display = 'inline-flex';
    updateNextBtn();

    const fileInput = document.getElementById('file-input');
    const dropZone  = document.getElementById('drop-zone');

    document.getElementById('file-pick-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => addFiles(e.target.files));

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });
  }

  async function addFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await Utils.readFileAsDataURL(file);
      const thumbUrl = await Utils.makeThumbnail(dataUrl, 400);
      _queue.push({ file, dataUrl, thumbUrl, ocrData: null, editData: null, status: 'pending' });
    }
    renderQueue();
    updateNextBtn();
  }

  function renderQueue() {
    const qEl = document.getElementById('upload-queue');
    if (!qEl) return;
    qEl.innerHTML = '';
    _queue.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'queue-item';
      div.innerHTML = `
        <div class="queue-thumb"><img src="${item.thumbUrl}" alt=""></div>
        <div class="queue-info">
          <div class="queue-filename">${Utils.esc(item.file.name)}</div>
          <div class="queue-status ${item.status}">${_statusLabel(item.status)}</div>
        </div>
        <button class="queue-remove-btn" data-i="${i}" title="削除">
          <span class="material-icons-round">close</span>
        </button>
      `;
      div.querySelector('.queue-remove-btn').addEventListener('click', () => {
        _queue.splice(i, 1);
        renderQueue();
        updateNextBtn();
      });
      qEl.appendChild(div);
    });
  }

  function _statusLabel(s) {
    return { pending: '待機中', processing: 'OCR処理中...', done: '読み取り完了', error: '読み取り失敗', warning: '要確認', manual: '手動入力' }[s] || s;
  }

  function updateNextBtn() {
    if (_nextBtn) _nextBtn.disabled = _queue.length === 0;
  }

  /* Step 2: OCR processing */
  async function renderOCRStep() {
    _titleEl.textContent = '画像を解析中';
    _body.innerHTML = `
      <div class="step-indicator">
        <div class="step-dot done"></div>
        <div class="step-dot done"></div>
        <div class="step-dot active"></div>
        <div class="step-dot"></div>
      </div>
      <div id="ocr-list"></div>
    `;
    _footer.style.display = 'none';

    const ocrList = document.getElementById('ocr-list');

    for (let i = 0; i < _queue.length; i++) {
      const item = _queue[i];

      /* Create per-item progress UI */
      const itemEl = document.createElement('div');
      itemEl.style.cssText = 'margin:12px 0;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;';

      /* Debug image with OCR region overlay */
      const canvas = document.createElement('canvas');
      canvas.className = 'ocr-debug-canvas';
      canvas.style.cssText = 'width:100%;height:auto;display:block;max-height:160px;object-fit:contain;';

      const progressWrap = document.createElement('div');
      progressWrap.className = 'ocr-progress-wrap';
      progressWrap.innerHTML = `
        <div class="ocr-spinner"></div>
        <div class="ocr-progress-label" id="ocr-label-${i}">${item.file.name} を処理中...</div>
        <div class="ocr-progress-bar-wrap"><div class="ocr-progress-bar" id="ocr-bar-${i}" style="width:0%"></div></div>
      `;

      itemEl.appendChild(canvas);
      itemEl.appendChild(progressWrap);
      ocrList.appendChild(itemEl);

      /* Draw OCR overlay before recognizing */
      try {
        const img = await Utils.loadImage(item.dataUrl);
        OCR.drawOverlay(canvas, img, _regions);
      } catch (_) {}

      if (_autoMode) {
        item.status = 'processing';
        try {
          const raw = await OCR.processImage(item.dataUrl, _regions, p => {
            const bar = document.getElementById(`ocr-bar-${i}`);
            if (bar) bar.style.width = `${Math.round(p * 100)}%`;
            const lbl = document.getElementById(`ocr-label-${i}`);
            if (lbl) lbl.textContent = p < 0.5 ? 'モデルを読み込み中...' : `${item.file.name} を解析中...`;
          });

          /* Match title against music DB */
          const matched = await _matchOCRData(raw, item.dataUrl);
          item.ocrData  = raw;
          item.editData = matched;
          item.status   = matched._hasWarning ? 'warning' : 'done';

        } catch (e) {
          console.error('OCR error:', e);
          item.status   = 'error';
          item.editData = _emptyEditData();
          item.ocrData  = {};
        }
      } else {
        item.status   = 'manual';
        item.editData = _emptyEditData();
      }

      const lbl = document.getElementById(`ocr-label-${i}`);
      if (lbl) {
        lbl.textContent = { done: '完了', warning: '要確認', error: '読み取り失敗', manual: '手動入力へ' }[item.status] || '完了';
        lbl.className = `ocr-progress-label queue-status ${item.status}`;
      }
    }

    /* Proceed automatically */
    _step = 3;
    _queueIdx = 0;
    renderStep();
  }

  async function _matchOCRData(raw, imageDataUrl) {
    const ed = _emptyEditData();
    ed._hasWarning = false;

    /* Match title */
    const titleMatch = MusicDB.findTitle(raw.titleText || '');
    if (titleMatch && titleMatch.ratio < 0.65) {
      ed.title         = titleMatch.item.title;
      ed.pronunciation = titleMatch.item.pronunciation || '';
      ed.musicId       = titleMatch.item.id;
    } else {
      ed.title     = raw.titleText || '';
      ed._hasWarning = true;
    }

    /* Difficulty & level */
    ed.difficulty = raw.difficulty || '';
    ed.level      = raw.level      ?? '';

    /* Validate level+difficulty against DB */
    if (ed.musicId && ed.difficulty && ed.level !== '') {
      const validated = MusicDB.validate(ed.musicId, ed.difficulty, ed.level);
      if (!validated) {
        /* Retry: maybe level was misread, get from DB */
        const lvFromDB = MusicDB.getPlayLevel(ed.musicId, ed.difficulty);
        if (lvFromDB) {
          ed.level = lvFromDB;
        } else {
          ed._hasWarning = true;
        }
      }
    }

    /* PERFECT/GREAT/GOOD/BAD/MISS */
    ed.perfect = raw.perfect ?? '';
    ed.great   = raw.great   ?? '';
    ed.good    = raw.good    ?? '';
    ed.bad     = raw.bad     ?? '';
    ed.miss    = raw.miss    ?? '';
    ed.combo   = raw.combo   ?? '';

    /* Validate total notes */
    if (ed.musicId && ed.difficulty) {
      const totalNotes = MusicDB.getTotalNotes(ed.musicId, ed.difficulty);
      if (totalNotes !== null) {
        const sum = (ed.perfect || 0) + (ed.great || 0) + (ed.good || 0) + (ed.bad || 0) + (ed.miss || 0);
        if (sum !== 0 && Math.abs(sum - totalNotes) > 3) {
          ed._hasWarning = true;
          ed._totalNotesWarning = `合計ノーツ数 ${sum} (DB: ${totalNotes})`;
        } else {
          ed.totalNotes = totalNotes;
        }
      }
    }

    /* Store imageDataUrl thumbnail */
    ed._thumbUrl = await Utils.makeThumbnail(imageDataUrl, 400);

    return ed;
  }

  function _emptyEditData() {
    return {
      title: '', pronunciation: '', musicId: null,
      difficulty: '', level: '', perfect: '', great: '', good: '', bad: '', miss: '', combo: '',
      totalNotes: null, _hasWarning: false, _thumbUrl: null,
    };
  }

  /* Step 3: Review / edit each item */
  function renderReviewStep() {
    if (_queue.length === 0) { closeModal(); return; }

    const item = _queue[_queueIdx];
    const ed   = item.editData || _emptyEditData();
    _titleEl.textContent = 'リザルトを確認';

    _body.innerHTML = `
      <div class="step-indicator">
        <div class="step-dot done"></div>
        <div class="step-dot done"></div>
        <div class="step-dot done"></div>
        <div class="step-dot active"></div>
      </div>

      <div class="review-nav" style="margin-top:8px">
        <button class="review-nav-btn" id="rev-prev" ${_queueIdx === 0 ? 'disabled' : ''}>
          <span class="material-icons-round" style="font-size:14px;vertical-align:middle">chevron_left</span>前へ
        </button>
        <span class="review-counter">${_queueIdx + 1} / ${_queue.length}</span>
        <button class="review-nav-btn" id="rev-next" ${_queueIdx >= _queue.length - 1 ? 'disabled' : ''}>
          次へ<span class="material-icons-round" style="font-size:14px;vertical-align:middle">chevron_right</span>
        </button>
      </div>

      ${ed._hasWarning ? `<div class="review-result-badge warn">
        <span class="material-icons-round">warning</span>要確認: 自動読み取りの内容を確認してください
        ${ed._totalNotesWarning ? `<br><small>${Utils.esc(ed._totalNotesWarning)}</small>` : ''}
      </div>` : `<div class="review-result-badge ok">
        <span class="material-icons-round">check_circle</span>自動読み取り成功
      </div>`}

      <div class="confirm-header">
        <div class="confirm-thumb">
          ${ed._thumbUrl ? `<img src="${ed._thumbUrl}" alt="">` : ''}
        </div>
        <div>
          <div class="confirm-title-text">${Utils.esc(item.file.name)}</div>
          <div class="confirm-meta" style="margin-top:6px">
            ${_statusBadge(item.status)}
          </div>
        </div>
      </div>

      <div class="edit-form" id="review-form">
        ${renderEditForm(ed)}
      </div>
    `;

    _footer.style.display = 'flex';
    _backBtn.style.display = 'inline-flex';
    _backBtn.innerHTML = '<span class="material-icons-round">arrow_back</span> 戻る';

    const isLast = _queueIdx >= _queue.length - 1;
    _nextBtn.innerHTML = isLast
      ? 'アップロード <span class="material-icons-round">cloud_upload</span>'
      : '次の画像 <span class="material-icons-round">arrow_forward</span>';

    /* Navigation */
    document.getElementById('rev-prev').addEventListener('click', () => {
      collectFormData(item);
      _queueIdx--;
      renderReviewStep();
    });
    document.getElementById('rev-next').addEventListener('click', () => {
      collectFormData(item);
      _queueIdx++;
      renderReviewStep();
    });

    /* Autocomplete for title */
    _bindTitleAutocomplete();
  }

  function _statusBadge(s) {
    const map = {
      done:    'ok|check_circle|読み取り完了',
      warning: 'warn|warning|要確認',
      error:   'error-badge|error|読み取り失敗',
      manual:  'ok|edit|手動入力',
    };
    const [cls, icon, label] = (map[s] || 'ok|info|').split('|');
    return `<span class="review-result-badge ${cls}"><span class="material-icons-round">${icon}</span>${label}</span>`;
  }

  function renderEditForm(ed) {
    const diffOptions = CONFIG.DIFFICULTIES.map(d =>
      `<option value="${d}" ${ed.difficulty === d ? 'selected' : ''}>${d}</option>`
    ).join('');

    return `
      <div class="form-section-title">楽曲情報</div>

      <div class="form-group autocomplete-wrap">
        <label class="form-label">楽曲タイトル</label>
        <input class="form-input" id="ef-title" value="${Utils.esc(ed.title)}" placeholder="楽曲タイトル" autocomplete="off">
        <div class="autocomplete-dropdown" id="ef-title-ac" style="display:none"></div>
      </div>
      <div class="form-group">
        <label class="form-label">読み方 (よみがな)</label>
        <input class="form-input" id="ef-pron" value="${Utils.esc(ed.pronunciation)}" placeholder="よみがな">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">難易度</label>
          <select class="form-select" id="ef-diff">${diffOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">楽曲レベル</label>
          <input class="form-input" id="ef-level" type="number" value="${Utils.esc(String(ed.level))}" placeholder="例: 33" min="1" max="50">
        </div>
      </div>

      <div class="form-section-title" style="margin-top:4px">リザルト</div>
      <div class="form-row-3">
        <div class="form-group">
          <label class="form-label" style="color:#7C9">PERFECT</label>
          <input class="form-input" id="ef-perfect" type="number" value="${Utils.esc(String(ed.perfect))}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label" style="color:#FA8">GREAT</label>
          <input class="form-input" id="ef-great" type="number" value="${Utils.esc(String(ed.great))}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label" style="color:#69F">GOOD</label>
          <input class="form-input" id="ef-good" type="number" value="${Utils.esc(String(ed.good))}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label" style="color:#F86">BAD</label>
          <input class="form-input" id="ef-bad" type="number" value="${Utils.esc(String(ed.bad))}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label" style="color:#F66">MISS</label>
          <input class="form-input" id="ef-miss" type="number" value="${Utils.esc(String(ed.miss))}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">COMBO</label>
          <input class="form-input" id="ef-combo" type="number" value="${Utils.esc(String(ed.combo))}" min="0">
        </div>
      </div>
    `;
  }

  function collectFormData(item) {
    const g = id => document.getElementById(id);
    if (!g('ef-title')) return;
    const ed = item.editData || _emptyEditData();
    ed.title        = g('ef-title')?.value?.trim()   || '';
    ed.pronunciation= g('ef-pron')?.value?.trim()    || '';
    ed.difficulty   = g('ef-diff')?.value            || '';
    ed.level        = g('ef-level')?.value ? parseInt(g('ef-level').value, 10) : null;
    ed.perfect      = g('ef-perfect')?.value !== '' ? parseInt(g('ef-perfect').value, 10) : null;
    ed.great        = g('ef-great')?.value  !== '' ? parseInt(g('ef-great').value,  10) : null;
    ed.good         = g('ef-good')?.value   !== '' ? parseInt(g('ef-good').value,   10) : null;
    ed.bad          = g('ef-bad')?.value    !== '' ? parseInt(g('ef-bad').value,    10) : null;
    ed.miss         = g('ef-miss')?.value   !== '' ? parseInt(g('ef-miss').value,   10) : null;
    ed.combo        = g('ef-combo')?.value  !== '' ? parseInt(g('ef-combo').value,  10) : null;
    item.editData   = ed;
  }

  function _bindTitleAutocomplete() {
    const input = document.getElementById('ef-title');
    const ac    = document.getElementById('ef-title-ac');
    if (!input || !ac) return;

    const doSearch = Utils.debounce(q => {
      const results = MusicDB.searchTitles(q);
      if (!results.length) { ac.style.display = 'none'; return; }
      ac.innerHTML = results.map(m =>
        `<div class="autocomplete-item" data-id="${m.id}" data-title="${Utils.esc(m.title)}" data-pron="${Utils.esc(m.pronunciation || '')}">
          <div>${Utils.esc(m.title)}</div>
          <div class="autocomplete-item-sub">${Utils.esc(m.pronunciation || '')}</div>
        </div>`
      ).join('');
      ac.style.display = 'block';

      ac.querySelectorAll('.autocomplete-item').forEach(item2 => {
        item2.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = item2.dataset.title;
          const pron = document.getElementById('ef-pron');
          if (pron) pron.value = item2.dataset.pron;
          /* Store musicId in hidden field */
          const queueItem = _queue[_queueIdx];
          if (queueItem && queueItem.editData) queueItem.editData.musicId = parseInt(item2.dataset.id, 10);
          ac.style.display = 'none';
        });
      });
    }, 200);

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length < 1) { ac.style.display = 'none'; return; }
      doSearch(q);
    });
    input.addEventListener('blur', () => { setTimeout(() => { ac.style.display = 'none'; }, 150); });
  }

  /* ---- Navigation ---- */
  async function onNext() {
    switch (_step) {
      case 0:
        _step = 1;
        renderStep();
        break;
      case 1:
        if (_queue.length === 0) return;
        _step = _autoMode ? 2 : 3;
        renderStep(); // for auto mode, renderStep() triggers renderOCRStep() internally
        break;
      case 2:
        /* OCR step auto-proceeds */
        break;
      case 3: {
        collectFormData(_queue[_queueIdx]);
        const isLast = _queueIdx >= _queue.length - 1;
        if (isLast) {
          await doUpload();
        } else {
          _queueIdx++;
          renderStep();
        }
        break;
      }
    }
  }

  function onBack() {
    switch (_step) {
      case 1: _step = 0; break;
      case 2: _step = 1; break;
      case 3:
        if (_queueIdx > 0) { _queueIdx--; return renderReviewStep(); }
        _step = _autoMode ? 1 : 1;
        break;
    }
    renderStep();
  }

  /* ---- Upload to DB / Drive ---- */
  async function doUpload() {
    _body.innerHTML = `
      <div class="ocr-progress-wrap" style="padding:40px 0">
        <div class="ocr-spinner"></div>
        <div class="ocr-progress-label" id="upload-progress-label">アップロード中...</div>
        <div class="ocr-progress-bar-wrap"><div class="ocr-progress-bar" id="upload-bar" style="width:0%"></div></div>
      </div>
    `;
    _footer.style.display = 'none';

    const newRecords = [];
    for (let i = 0; i < _queue.length; i++) {
      const item = _queue[i];
      const ed   = item.editData || _emptyEditData();

      const updateProg = (p, label) => {
        const bar = document.getElementById('upload-bar');
        const lbl = document.getElementById('upload-progress-label');
        const overall = ((i + p) / _queue.length) * 100;
        if (bar) bar.style.width = `${overall}%`;
        if (lbl) lbl.textContent = label || `${i + 1}/${_queue.length} をアップロード中...`;
      };
      updateProg(0);

      /* Build record */
      const achiev = Utils.calcAchievements({
        great: ed.great || 0, good: ed.good || 0, bad: ed.bad || 0, miss: ed.miss || 0
      });

      /* If musicId not set, attempt one more lookup */
      if (!ed.musicId && ed.title) {
        const m = MusicDB.findTitle(ed.title);
        if (m && m.ratio < 0.6) ed.musicId = m.item.id;
      }

      /* Get totalNotes if not already set */
      if (!ed.totalNotes && ed.musicId && ed.difficulty) {
        ed.totalNotes = MusicDB.getTotalNotes(ed.musicId, ed.difficulty) || null;
      }

      const record = {
        id:            Utils.uuid(),
        title:         ed.title || '不明',
        pronunciation: ed.pronunciation || '',
        musicId:       ed.musicId || null,
        difficulty:    ed.difficulty || '',
        level:         ed.level    || null,
        perfect:       ed.perfect  ?? null,
        great:         ed.great    ?? null,
        good:          ed.good     ?? null,
        bad:           ed.bad      ?? null,
        miss:          ed.miss     ?? null,
        combo:         ed.combo    ?? null,
        totalNotes:    ed.totalNotes || null,
        ...achiev,
        imageDataUrl:  ed._thumbUrl || null,
        driveFileId:   null,
        addedAt:       new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        deleted:       false,
        deletedAt:     null,
      };

      /* Upload to Drive */
      if (Drive.isAvailable) {
        try {
          updateProg(0.3, `Google Driveにアップロード中... (${i+1}/${_queue.length})`);
          const fname  = `${record.id}_${item.file.name}`;
          const result = await Drive.uploadImage(item.file, fname);
          record.driveFileId = result.id;
          updateProg(0.8);
        } catch (e) {
          console.warn('Drive upload failed:', e.message);
          Notification.show(`Drive アップロードに失敗: ${e.message.substring(0,60)}`, 'warning', 5000);
        }
      }

      await DB.saveResult(record);
      newRecords.push(record);
      updateProg(1);
    }

    /* Notify self-bests */
    await _checkPersonalBests(newRecords);

    closeModal();
    Notification.show(`${newRecords.length}件のリザルトを追加しました`, 'success');
    App.refreshResults();
  }

  async function _checkPersonalBests(newRecords) {
    const allRecords = await DB.getAllResults();
    for (const r of newRecords) {
      const prev = allRecords.filter(x =>
        x.id !== r.id &&
        !x.deleted &&
        x.musicId === r.musicId &&
        x.difficulty === r.difficulty
      );
      if (!prev.length) continue;

      const oldBestAP  = Math.min(...prev.map(x => x.missAP  ?? Infinity));
      const oldBestAPT = Math.min(...prev.map(x => x.missAPT ?? Infinity));
      const oldBestFC  = Math.min(...prev.map(x => x.missFC  ?? Infinity));

      const msgs = [];
      if (r.missAP  < oldBestAP)  msgs.push(`AP基準: ${oldBestAP} → ${r.missAP}`);
      if (r.missAPT < oldBestAPT) msgs.push(`大会基準: ${oldBestAPT} → ${r.missAPT}`);
      if (r.missFC  < oldBestFC)  msgs.push(`FC基準: ${oldBestFC} → ${r.missFC}`);

      if (msgs.length) {
        Notification.show(
          `自己ベスト更新！「${r.title}」\n${msgs.join(' / ')}`,
          'record', 6000
        );
      }
    }
  }

  return { init, openModal, closeModal, renderEditForm, collectFormData };
})();
