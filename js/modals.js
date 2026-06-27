// js/modals.js
import { CONFIG }        from './config.js';
import { OCRProcessor, RegionEditor } from './ocr.js';
import {
  calcMisses, calcStatus, generateId,
  escapeHtml, safeInt, formatDate,
  fileToDataURL, generateThumbnail
} from './utils.js';

/* =========================================================
   Modals クラス
   ========================================================= */
export class Modals {
  constructor(app) {
    this.app     = app;
    this.overlay = document.getElementById('modal-overlay');
    this.box     = document.getElementById('modal-box');
    this.content = document.getElementById('modal-content');
    this.closeBtn = document.getElementById('modal-close');

    this._onClose     = null;
    this._uploadQueue = null;

    this.closeBtn.addEventListener('click',   () => this.close());
    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) this.close();
    });
  }

  /* ─── モーダルの開閉 ─── */
  _open(html, opts = {}) {
    this.content.innerHTML = html;
    const cls = ['modal-box'];
    if (opts.wide)       cls.push('wide');
    if (opts.fullscreen) cls.push('fullscreen');
    this.box.className = cls.join(' ');
    this.closeBtn.classList.toggle('hidden', !!opts.noClose);
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
    this.content.innerHTML = '';
    this._uploadQueue = null;
    const cb = this._onClose;
    this._onClose = null;
    if (cb) cb();
  }

  onClose(fn) { this._onClose = fn; }
  isOpen()    { return !this.overlay.classList.contains('hidden'); }
  _q(sel)     { return this.content.querySelector(sel); }

  /* =========================================================
     アップロードモーダル（要件2.18）
     ========================================================= */
  async showUpload() {
    const devices = await this.app.db.getSetting('devices', []);
    const devOpts = devices.map(d =>
      `<option value="${d.id}">${escapeHtml(d.name)}</option>`
    ).join('');

    this._open(`
      <h2 class="modal-title">記録を追加</h2>

      <div class="upload-mode-select" id="upload-mode-btns">
        <button class="upload-mode-btn active" data-mode="auto">
          <span class="material-icons-round">auto_fix_high</span>
          <span>自動登録</span>
          <small>画像から自動で読み取り</small>
        </button>
        <button class="upload-mode-btn" data-mode="manual">
          <span class="material-icons-round">edit_note</span>
          <span>手動登録</span>
          <small>データを直接入力</small>
        </button>
      </div>

      <div id="device-selector-wrap" style="margin-bottom:12px">
        <label class="form-label" style="display:block;margin-bottom:4px">
          機種・読み取り設定
        </label>
        <select id="device-select" class="form-input form-select">
          <option value="">デフォルト設定</option>
          ${devOpts}
        </select>
      </div>

      <div class="upload-zone" id="upload-zone">
        <span class="material-icons-round">upload_file</span>
        <div class="upload-zone-title">ここにドロップ、またはタップして選択</div>
        <div class="upload-zone-sub">PNG・JPG・WEBP 対応 ／ 複数選択可</div>
      </div>
      <input type="file" id="file-input" accept="image/*" multiple hidden>
    `, { wide: true });

    let autoMode = true;

    this._q('#upload-mode-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      autoMode = btn.dataset.mode === 'auto';
      this._q('#upload-mode-btns').querySelectorAll('.upload-mode-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.mode === btn.dataset.mode));
      const wrap = this._q('#device-selector-wrap');
      if (wrap) wrap.style.display = autoMode ? '' : 'none';
    });

    const fileInput = this._q('#file-input');
    const zone      = this._q('#upload-zone');

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragging');
      this._startUpload(e.dataTransfer.files, autoMode);
    });
    fileInput.addEventListener('change', () => this._startUpload(fileInput.files, autoMode));
  }

  async _startUpload(fileList, autoMode) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) { this.app.notify.error('画像ファイルを選択してください'); return; }

    const deviceId = this._q('#device-select')?.value || null;
    const devices  = await this.app.db.getSetting('devices', []);
    const device   = devices.find(d => d.id === deviceId);
    const regions  = device?.regions
      ? JSON.parse(JSON.stringify(device.regions))
      : JSON.parse(JSON.stringify(CONFIG.DEFAULT_REGION_COORDS));

    this._uploadQueue = { files, autoMode, regions, idx: 0, saved: 0 };
    await this._processNextInQueue();
  }

  async _processNextInQueue() {
    const q = this._uploadQueue;
    if (!q) return;

    if (q.idx >= q.files.length) {
      this.close();
      if (q.saved > 0) {
        this.app.notify.success(`${q.saved}件の記録を追加しました`);
        await this.app.refreshRecords();
      }
      return;
    }

    const file  = q.files[q.idx];
    const total = q.files.length;
    const cur   = q.idx + 1;

    if (q.autoMode) {
      await this._showAutoStep(file, cur, total, q.regions);
    } else {
      await this._showManualStep(file, cur, total, {});
    }
  }

  /* ─── 自動登録ステップ（OCR）─── */
  async _showAutoStep(file, cur, total, regions) {
    const dataURL = await fileToDataURL(file);

    this._open(`
      <div class="upload-step-header">
        <h2 class="modal-title" style="margin-bottom:0">記録を追加</h2>
        <span class="upload-counter">${cur} / ${total}</span>
      </div>

      <div class="ocr-preview-wrap">
        <img id="ocr-img" class="ocr-preview-img" alt="" src="${dataURL}">
        <canvas id="ocr-canvas" class="ocr-canvas-overlay"></canvas>
      </div>

      <div class="ocr-legend">
        ${Object.values(CONFIG.REGIONS).map(r =>
          `<span class="legend-item">
            <span class="legend-dot" style="color:${r.color}"></span>${r.label}
          </span>`
        ).join('')}
      </div>

      <div class="ocr-progress" id="ocr-progress">
        <div class="spinner"></div>
        <span id="ocr-progress-text">OCRエンジンを準備中...</span>
      </div>

      <div id="form-wrap" class="hidden"></div>

      <div class="form-actions">
        <button class="btn-secondary" id="btn-skip">スキップ</button>
        <button class="btn-secondary hidden" id="btn-switch-manual">手動入力に切り替え</button>
        <button class="btn-secondary hidden" id="btn-reocr">再読み取り</button>
        <button class="btn-primary   hidden" id="btn-register">登録</button>
      </div>
    `, { wide: true });

    /* OCR領域を描画（要件4.1〜4.4） */
    const imgEl  = this._q('#ocr-img');
    const canvas = this._q('#ocr-canvas');

    const drawOverlay = () => {
      requestAnimationFrame(() => {
        if (imgEl && canvas && imgEl.clientWidth > 0) {
          OCRProcessor.drawRegions(canvas, imgEl.clientWidth, imgEl.clientHeight, regions);
        }
      });
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      drawOverlay();
    } else {
      imgEl.addEventListener('load', drawOverlay, { once: true });
    }

    /* スキップ */
    this._q('#btn-skip').addEventListener('click', () => {
      if (this._uploadQueue) this._uploadQueue.idx++;
      this._processNextInQueue();
    });

    /* 手動入力に切り替え */
    this._q('#btn-switch-manual')?.addEventListener('click', async () => {
      const formData = this._q('#form-wrap').classList.contains('hidden')
        ? {} : readFormValues(this._q('#form-wrap'));
      await this._showManualStep(file, cur, total, formData);
    });

    /* OCR進捗コールバック */
    this.app.ocr.onProgress = (pct, txt) => {
      const el = this._q('#ocr-progress-text');
      if (el) el.textContent = txt;
    };

    /* 画像ロード待ち */
    await new Promise(r => {
      if (imgEl.complete && imgEl.naturalWidth > 0) r();
      else imgEl.addEventListener('load', r, { once: true });
    });

    if (!this.isOpen()) return;

    /* OCR実行（5.2〜5.4: 整合性チェック & 自動リトライ） */
    const runOCR = async () => {
      return await this.app.ocr.processImage(imgEl, regions);
    };

    let ocrData = null;
    let validationMsg = '';

    try {
      /* 1回目OCR */
      ocrData = await runOCR();
      if (!this.isOpen()) return;

      /* タイトルマッチング（5.2） */
      ocrData = this._matchSong(ocrData);

      /* 整合性チェック（5.3 / 5.4） */
      const check = this._validateOCR(ocrData);

      if (!check.valid) {
        /* 自動リトライ1回（5.3 / 5.4） */
        const el = this._q('#ocr-progress-text');
        if (el) el.textContent = '不一致を検出、再読み取り中...';

        ocrData = await runOCR();
        if (!this.isOpen()) return;
        ocrData = this._matchSong(ocrData);

        const check2 = this._validateOCR(ocrData);
        if (!check2.valid) {
          validationMsg = `警告: ${check2.reason}。手動で確認してください。`;
        }
      }
    } catch (e) {
      console.error('OCR エラー:', e);
      validationMsg = '警告: 読み取りに失敗しました。手動で入力してください。';
      ocrData = ocrData || {};
    }

    if (!this.isOpen()) return;
    this._showOCRForm(file, ocrData, validationMsg, regions);
  }

  /* タイトルを楽曲DBとマッチング */
  _matchSong(ocrData) {
    const raw = ocrData.rawTitle || ocrData.title || '';
    if (!raw) return ocrData;

    const matches = this.app.songData.findByTitle(raw);
    if (matches.length) {
      const best = matches[0].music;
      ocrData._songMatch   = best;
      ocrData.title        = best.title;
      ocrData.pronunciation = best.pronunciation || ocrData.pronunciation || '';
    }
    return ocrData;
  }

  /* 整合性チェック */
  _validateOCR(ocrData) {
    if (!ocrData._songMatch || !ocrData.difficulty) {
      return { valid: true, reason: null }; // データ不足では判断しない
    }

    const info = this.app.songData.getDifficultyInfo(
      ocrData._songMatch.id, ocrData.difficulty
    );
    if (!info) return { valid: false, reason: '該当難易度がDBにありません' };

    /* レベルチェック（5.3） */
    if (ocrData.level != null && info.playLevel != null && ocrData.level !== info.playLevel) {
      ocrData.level = info.playLevel; // DB値で上書き
    }

    /* ノーツ数チェック（5.4） */
    const total = (ocrData.perfect||0)+(ocrData.great||0)+(ocrData.good||0)+(ocrData.bad||0)+(ocrData.miss||0);
    if (info.totalNoteCount && total > 0 && total !== info.totalNoteCount) {
      return { valid: false, reason: `ノーツ合計(${total})がDB(${info.totalNoteCount})と不一致` };
    }

    return { valid: true, reason: null };
  }

  /* OCR完了後のフォーム表示 */
  _showOCRForm(file, ocrData, validationMsg, regions) {
    const progressEl = this._q('#ocr-progress');
    if (progressEl) progressEl.classList.add('hidden');

    const wrap = this._q('#form-wrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    wrap.innerHTML = `
      ${validationMsg
        ? `<div class="form-warning">${escapeHtml(validationMsg)}</div>`
        : ''}
      ${buildRecordFormHTML(ocrData)}
    `;
    setupFormListeners(wrap, this.app.songData);

    /* ボタン表示 */
    const $s = s => this._q(s);
    $s('#btn-switch-manual')?.classList.remove('hidden');
    $s('#btn-reocr')?.classList.remove('hidden');
    $s('#btn-register')?.classList.remove('hidden');

    /* 再読み取り */
    $s('#btn-reocr')?.addEventListener('click', async () => {
      wrap.innerHTML = '';
      wrap.classList.add('hidden');
      ['#btn-switch-manual','#btn-reocr','#btn-register'].forEach(s => $s(s)?.classList.add('hidden'));
      const prog = $s('#ocr-progress');
      if (prog) { prog.classList.remove('hidden'); }
      const el = $s('#ocr-progress-text');
      if (el) el.textContent = '再読み取り中...';

      const imgEl = $s('#ocr-img');
      let ocrData2 = {};
      try {
        ocrData2 = await this.app.ocr.processImage(imgEl, regions);
        ocrData2 = this._matchSong(ocrData2);
      } catch {}
      if (this.isOpen()) {
        this._showOCRForm(file, ocrData2, '', regions);
      }
    });

    /* 登録 */
    $s('#btn-register')?.addEventListener('click', async () => {
      const formData = readFormValues(wrap);
      if (!formData.title) { this.app.notify.error('楽曲名を入力してください'); return; }
      await this._saveRecord(file, formData);
    });
  }

  /* ─── 手動登録ステップ ─── */
  async _showManualStep(file, cur, total, prefill) {
    const dataURL = await fileToDataURL(file);
    this._open(`
      <div class="upload-step-header">
        <h2 class="modal-title" style="margin-bottom:0">手動登録</h2>
        <span class="upload-counter">${cur} / ${total}</span>
      </div>
      <div class="ocr-preview-wrap" style="margin-bottom:12px">
        <img class="ocr-preview-img" src="${dataURL}" alt="" style="max-height:200px;object-fit:contain">
      </div>
      ${buildRecordFormHTML(prefill || {})}
      <div class="form-actions">
        <button class="btn-secondary" id="btn-skip">スキップ</button>
        <button class="btn-primary"   id="btn-register">登録</button>
      </div>
    `, { wide: true });

    setupFormListeners(this.content, this.app.songData);

    this._q('#btn-skip').addEventListener('click', () => {
      if (this._uploadQueue) this._uploadQueue.idx++;
      this._processNextInQueue();
    });
    this._q('#btn-register').addEventListener('click', async () => {
      const formData = readFormValues(this.content);
      if (!formData.title) { this.app.notify.error('楽曲名を入力してください'); return; }
      await this._saveRecord(file, formData);
    });
  }

  /* ─── レコード保存 ─── */
  async _saveRecord(file, formData) {
    try {
      this.app.showLoading('保存中...');
      const blob  = new Blob([await file.arrayBuffer()], { type: file.type });
      const thumb = await generateThumbnail(blob);
      await this.app.addRecord(formData, blob, thumb);
      if (this._uploadQueue) this._uploadQueue.saved++;
      if (this._uploadQueue) this._uploadQueue.idx++;
      this.app.hideLoading();
      await this._processNextInQueue();
    } catch (e) {
      this.app.hideLoading();
      this.app.notify.error('保存に失敗しました: ' + e.message);
      console.error(e);
    }
  }

  /* =========================================================
     編集モーダル
     ========================================================= */
  showEdit(record, imgURL, onSave) {
    const data = {
      title: record.title, pronunciation: record.pronunciation,
      difficulty: record.difficulty, level: record.level,
      perfect: record.perfect, great: record.great,
      good: record.good, bad: record.bad, miss: record.miss, combo: record.combo,
    };
    this._open(`
      <h2 class="modal-title">記録を編集</h2>
      ${imgURL
        ? `<img src="${imgURL}" alt="" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-bottom:12px">`
        : ''}
      ${buildRecordFormHTML(data)}
      <div class="form-actions">
        <button class="btn-secondary" id="btn-cancel">キャンセル</button>
        <button class="btn-primary"   id="btn-save">保存</button>
      </div>
    `, { wide: true });

    setupFormListeners(this.content, this.app.songData);
    this._q('#btn-cancel').addEventListener('click', () => this.close());
    this._q('#btn-save').addEventListener('click', () => {
      const formData = readFormValues(this.content);
      if (!formData.title) { this.app.notify.error('楽曲名を入力してください'); return; }
      if (onSave) onSave(formData);
      this.close();
    });
  }

  /* =========================================================
     画像ビューア
     ========================================================= */
  showViewer(record, imgURL) {
    const { missAP, missAPTournament, missFC, isAP, isFC } = record;
    this._open(`
      <div class="image-viewer">
        <img class="image-viewer-img"
          src="${imgURL || ''}"
          alt="${escapeHtml(record.title)}"
          loading="eager">
        <div class="image-viewer-meta">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="diff-badge" data-diff="${record.difficulty}">${record.difficulty}</span>
            <span class="lv-badge">Lv.${record.level ?? '?'}</span>
            ${isAP ? '<span class="badge-ap">AP</span>' : ''}
            ${isFC ? '<span class="badge-fc">FC</span>' : ''}
          </div>
          <div style="flex:1;font-size:0.88rem;font-weight:700;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(record.title)}
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">
            AP ${missAP} ／ 大会 ${missAPTournament} ／ FC ${missFC}
          </div>
        </div>
      </div>
    `, { wide: true });
  }

  /* =========================================================
     削除確認（ゴミ箱へ）
     ========================================================= */
  showDeleteConfirm(record, onConfirm) {
    this._open(`
      <h2 class="modal-title">記録を削除</h2>
      <p style="color:var(--text-secondary);margin-bottom:var(--sp-md);line-height:1.6">
        「<strong>${escapeHtml(record.title)}</strong>」[${escapeHtml(record.difficulty)}]
        をゴミ箱に移動しますか？<br>
        <span style="font-size:0.82rem;color:var(--text-muted)">3日後に自動で完全削除されます</span>
      </p>
      <div class="form-actions">
        <button class="btn-secondary" id="btn-cancel">キャンセル</button>
        <button class="btn-danger"    id="btn-confirm">
          <span class="material-icons-round">delete_outline</span>ゴミ箱に移動
        </button>
      </div>
    `);
    this._q('#btn-cancel').addEventListener('click', () => this.close());
    this._q('#btn-confirm').addEventListener('click', () => {
      if (onConfirm) onConfirm();
      this.close();
    });
  }

  /* =========================================================
     完全削除確認
     ========================================================= */
  showPermanentDeleteConfirm(label, onConfirm) {
    this._open(`
      <h2 class="modal-title">完全削除の確認</h2>
      <p style="color:var(--text-secondary);margin-bottom:var(--sp-md);line-height:1.6">
        ${escapeHtml(label)}<br>
        <span style="font-size:0.82rem;color:var(--danger);font-weight:600">
          この操作は元に戻せません。Driveからも削除されます。
        </span>
      </p>
      <div class="form-actions">
        <button class="btn-secondary" id="btn-cancel">キャンセル</button>
        <button class="btn-danger"    id="btn-confirm">
          <span class="material-icons-round">delete_forever</span>完全削除
        </button>
      </div>
    `);
    this._q('#btn-cancel').addEventListener('click', () => this.close());
    this._q('#btn-confirm').addEventListener('click', () => {
      if (onConfirm) onConfirm();
      this.close();
    });
  }

  /* =========================================================
     機種校正モーダル（要件4.6）
     ========================================================= */
  showDeviceCalibration(existingDevice, onSave) {
    const name    = existingDevice?.name || '';
    const regions = JSON.parse(JSON.stringify(
      existingDevice?.regions || CONFIG.DEFAULT_REGION_COORDS
    ));

    this._open(`
      <h2 class="modal-title">${existingDevice ? '機種設定を編集' : '機種を追加'}</h2>

      <div class="form-field" style="margin-bottom:12px">
        <label class="form-label">機種名</label>
        <input type="text" id="device-name" class="form-input"
          value="${escapeHtml(name)}" placeholder="例: iPhone 15 Pro">
      </div>

      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px">
        サンプル画像をアップロードして、読み取り範囲のボックスをドラッグ・リサイズしてください
      </p>

      <div class="upload-zone" id="cal-zone" style="margin-bottom:12px">
        <span class="material-icons-round">image</span>
        <div class="upload-zone-title">サンプル画像をドロップ / タップして選択</div>
      </div>
      <input type="file" id="cal-file" accept="image/*" hidden>

      <div id="cal-editor-wrap" class="hidden">
        <canvas id="cal-canvas"
          style="max-width:100%;display:block;cursor:crosshair;border-radius:8px;border:1px solid var(--border)">
        </canvas>
        <div class="ocr-legend" style="margin-top:8px">
          ${Object.values(CONFIG.REGIONS).map(r =>
            `<span class="legend-item">
              <span class="legend-dot" style="color:${r.color}"></span>${r.label}
            </span>`
          ).join('')}
        </div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin:4px 0">
          ボックスをドラッグで移動、右下角をドラッグでリサイズ
        </p>
        <button class="btn-secondary" id="cal-test" style="margin-top:8px">
          <span class="material-icons-round">play_arrow</span>テスト読み取り
        </button>
        <div id="cal-result" class="hidden"
          style="margin-top:8px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:0.82rem;line-height:1.7">
        </div>
      </div>

      <div class="form-actions">
        <button class="btn-secondary" id="cal-cancel">キャンセル</button>
        <button class="btn-primary"   id="cal-save">保存</button>
      </div>
    `, { wide: true });

    let _editor = null;

    const loadCalImage = file => {
      fileToDataURL(file).then(dataURL => {
        const img = new Image();
        img.onload = () => {
          const wrap   = this._q('#cal-editor-wrap');
          const canvas = this._q('#cal-canvas');
          if (wrap) wrap.classList.remove('hidden');
          this._q('#cal-zone')?.classList.add('hidden');
          if (canvas) {
            _editor = new RegionEditor(canvas, img, regions, (key, r) => {
              regions[key] = r;
            });
          }
        };
        img.src = dataURL;
      });
    };

    const calFile = this._q('#cal-file');
    this._q('#cal-zone')?.addEventListener('click', () => calFile?.click());
    this._q('#cal-zone')?.addEventListener('dragover', e => e.preventDefault());
    this._q('#cal-zone')?.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith('image/')) loadCalImage(f);
    });
    calFile?.addEventListener('change', () => {
      if (calFile.files[0]) loadCalImage(calFile.files[0]);
    });

    this._q('#cal-test')?.addEventListener('click', async () => {
      if (!_editor) { this.app.notify.warning('先にサンプル画像を読み込んでください'); return; }
      const resultDiv = this._q('#cal-result');
      if (resultDiv) {
        resultDiv.classList.remove('hidden');
        resultDiv.textContent = '読み取り中...';
      }
      try {
        const curRegions = _editor.getRegions();
        const ocrData = await this.app.ocr.processImage(_editor.img, curRegions);
        const matched = this._matchSong(ocrData);

        if (resultDiv) resultDiv.innerHTML = `
          <b>タイトル:</b> ${escapeHtml(matched.title || '(未検出)')}<br>
          <b>難易度:</b>   ${matched.difficulty || '(未検出)'}<br>
          <b>レベル:</b>   ${matched.level ?? '(未検出)'}<br>
          <b>PERFECT:</b>  ${matched.perfect ?? 0}&emsp;
          <b>GREAT:</b>    ${matched.great ?? 0}&emsp;
          <b>GOOD:</b>     ${matched.good ?? 0}&emsp;
          <b>BAD:</b>      ${matched.bad ?? 0}&emsp;
          <b>MISS:</b>     ${matched.miss ?? 0}<br>
          <b>COMBO:</b>    ${matched.combo ?? 0}
        `;
      } catch (e) {
        if (resultDiv) resultDiv.textContent = 'エラー: ' + e.message;
      }
    });

    this._q('#cal-cancel')?.addEventListener('click', () => this.close());
    this._q('#cal-save')?.addEventListener('click', () => {
      const devName = this._q('#device-name')?.value.trim();
      if (!devName) { this.app.notify.error('機種名を入力してください'); return; }
      const device = {
        id:        existingDevice?.id || generateId(),
        name:      devName,
        regions:   _editor ? _editor.getRegions() : regions,
        createdAt: existingDevice?.createdAt || Date.now(),
      };
      if (onSave) onSave(device);
      this.close();
    });
  }
}

/* =========================================================
   フォームHTML生成（共通ヘルパー）
   ========================================================= */
function buildRecordFormHTML(data = {}) {
  const d = (k, fb = '') => escapeHtml(String(data[k] ?? fb));
  const n = k => data[k] != null ? Number(data[k]) : '';

  const great = n('great') || 0, good = n('good') || 0,
        bad   = n('bad')   || 0, miss = n('miss') || 0;
  const perfect = n('perfect') || 0;
  const total   = perfect + great + good + bad + miss;
  const misses  = calcMisses(great, good, bad, miss);
  const status  = calcStatus(great, good, bad, miss);

  const diffOpts = CONFIG.DIFFICULTIES.map(v =>
    `<option value="${v}"${data.difficulty === v ? ' selected' : ''}>${v}</option>`
  ).join('');

  return `
    <div class="record-form">
      <div class="form-grid">

        <div class="form-field full">
          <label class="form-label">楽曲名</label>
          <input type="text" id="f-title" class="form-input"
            value="${d('title')}"
            placeholder="楽曲名（入力すると候補が表示されます）"
            autocomplete="off" list="title-suggestions">
          <datalist id="title-suggestions"></datalist>
        </div>

        <div class="form-field full">
          <label class="form-label">読み（ひらがな）</label>
          <input type="text" id="f-pronunciation" class="form-input"
            value="${d('pronunciation')}"
            placeholder="ひらがな・カタカナ">
        </div>

        <div class="form-field">
          <label class="form-label">難易度</label>
          <select id="f-difficulty" class="form-input form-select">
            <option value="">選択してください</option>
            ${diffOpts}
          </select>
        </div>

        <div class="form-field">
          <label class="form-label">レベル</label>
          <input type="number" id="f-level" class="form-input"
            value="${n('level')}" min="1" max="46">
        </div>

        <div class="form-field">
          <label class="form-label" style="color:#a855f7">PERFECT</label>
          <input type="number" id="f-perfect" class="form-input" value="${n('perfect')}" min="0">
        </div>
        <div class="form-field">
          <label class="form-label" style="color:#f59e0b">GREAT</label>
          <input type="number" id="f-great" class="form-input" value="${n('great')}" min="0">
        </div>
        <div class="form-field">
          <label class="form-label" style="color:#22c55e">GOOD</label>
          <input type="number" id="f-good" class="form-input" value="${n('good')}" min="0">
        </div>
        <div class="form-field">
          <label class="form-label" style="color:#3b82f6">BAD</label>
          <input type="number" id="f-bad" class="form-input" value="${n('bad')}" min="0">
        </div>
        <div class="form-field">
          <label class="form-label" style="color:#ef4444">MISS</label>
          <input type="number" id="f-miss" class="form-input" value="${n('miss')}" min="0">
        </div>
        <div class="form-field">
          <label class="form-label">COMBO</label>
          <input type="number" id="f-combo" class="form-input" value="${n('combo')}" min="0">
        </div>
      </div>

      <!-- 自動計算サマリー -->
      <div class="calc-summary">
        <div class="calc-row-inner">
          <div class="calc-item">
            <span class="calc-label">合計</span>
            <span class="calc-val" id="c-total">${total}</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">AP</span>
            <span class="calc-val" id="c-ap">${misses.ap}</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">大会</span>
            <span class="calc-val" id="c-tournament">${misses.apTournament}</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">FC</span>
            <span class="calc-val" id="c-fc">${misses.fc}</span>
          </div>
        </div>
        <div class="calc-badges">
          <span class="badge-ap${status.isAP ? '' : ' hidden'}" id="c-badge-ap">AP済み</span>
          <span class="badge-fc${status.isFC ? '' : ' hidden'}" id="c-badge-fc">FC済み</span>
        </div>
      </div>
    </div>
  `;
}

/** フォームのリアルタイム計算・オートコンプリート設定 */
function setupFormListeners(scope, songData) {
  const $  = s => scope.querySelector(s);
  const $$ = s => scope.querySelectorAll(s);

  const update = () => {
    const g  = safeInt($('#f-great')?.value);
    const go = safeInt($('#f-good')?.value);
    const b  = safeInt($('#f-bad')?.value);
    const m  = safeInt($('#f-miss')?.value);
    const p  = safeInt($('#f-perfect')?.value);
    const ms = calcMisses(g, go, b, m);
    const st = calcStatus(g, go, b, m);
    const tot = p + g + go + b + m;

    if ($('#c-total'))      $('#c-total').textContent      = tot;
    if ($('#c-ap'))         $('#c-ap').textContent         = ms.ap;
    if ($('#c-tournament')) $('#c-tournament').textContent = ms.apTournament;
    if ($('#c-fc'))         $('#c-fc').textContent         = ms.fc;
    if ($('#c-badge-ap'))   $('#c-badge-ap').classList.toggle('hidden', !st.isAP);
    if ($('#c-badge-fc'))   $('#c-badge-fc').classList.toggle('hidden', !st.isFC);
  };

  ['#f-perfect','#f-great','#f-good','#f-bad','#f-miss'].forEach(sel => {
    $(sel)?.addEventListener('input', update);
  });

  /* タイトル候補オートコンプリート */
  const titleEl   = $('#f-title');
  const datalistEl = $('#title-suggestions');
  if (titleEl && datalistEl && songData?.loaded) {
    titleEl.addEventListener('input', () => {
      const q = titleEl.value.trim();
      if (!q || q.length < 1) { datalistEl.innerHTML = ''; return; }
      const matches = songData.findByTitle(q);
      datalistEl.innerHTML = matches.map(({ music: m }) =>
        `<option value="${escapeHtml(m.title)}"
          data-pron="${escapeHtml(m.pronunciation || '')}">`
      ).join('');
    });
    titleEl.addEventListener('change', () => {
      const opts  = datalistEl.querySelectorAll('option');
      const found = Array.from(opts).find(o => o.value === titleEl.value);
      const pronEl = $('#f-pronunciation');
      if (found && pronEl && !pronEl.value) {
        pronEl.value = found.dataset.pron || '';
      }
    });
  }
}

/** フォームの値を読み取る */
function readFormValues(scope) {
  const $  = s => scope.querySelector(s);
  const sv = s => ($(`${s}`)?.value ?? '').trim();
  const nv = s => safeInt($(`${s}`)?.value);

  const great = nv('#f-great'), good = nv('#f-good'),
        bad   = nv('#f-bad'),   miss = nv('#f-miss');
  const { ap, apTournament, fc } = calcMisses(great, good, bad, miss);
  const { isAP, isFC }           = calcStatus(great, good, bad, miss);

  return {
    title:            sv('#f-title'),
    pronunciation:    sv('#f-pronunciation'),
    difficulty:       sv('#f-difficulty'),
    level:            nv('#f-level'),
    perfect:          nv('#f-perfect'),
    great, good, bad, miss,
    combo:            nv('#f-combo'),
    missAP:           ap,
    missAPTournament: apTournament,
    missFC:           fc,
    isAP,
    isFC,
  };
}
