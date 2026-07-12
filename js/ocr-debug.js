/*
 * ocr-debug.js
 * -----------------------------------------------------------------------
 * OCRの実測ログを見やすくするための補助関数。
 *   - 最新ログの履歴を localStorage に保存
 *   - 画像 crop / 二値化結果 / OCR結果 を UI で確認
 *   - 重い画像は保存せず、画面表示用の現在ログだけ保持する
 * -----------------------------------------------------------------------
 */

function getOcrDebugLogList() {
  try {
    const raw = localStorage.getItem(LS_KEY_OCR_DEBUG_LOGS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('OCRログの読み込みに失敗しました', e);
    return [];
  }
}

function stripOcrDebugHeavyFields(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const clone = JSON.parse(JSON.stringify(entry));
  if (clone.stages && Array.isArray(clone.stages)) {
    clone.stages = clone.stages.map(stage => {
      const s = { ...stage };
      delete s.previewImage;
      if (Array.isArray(s.variants)) {
        s.variants = s.variants.map(v => {
          const vv = { ...v };
          delete vv.previewImage;
          return vv;
        });
      }
      return s;
    });
  }
  return clone;
}

function saveOcrDebugLogList(list) {
  try {
    localStorage.setItem(LS_KEY_OCR_DEBUG_LOGS, JSON.stringify(list.slice(0, OCR_DEBUG_LOG_LIMIT)));
  } catch (e) {
    console.error('OCRログの保存に失敗しました', e);
  }
}

function pushOcrDebugLog(entry) {
  const list = getOcrDebugLogList();
  list.unshift(stripOcrDebugHeavyFields(entry));
  saveOcrDebugLogList(list);
}

function clearOcrDebugLogs() {
  try {
    localStorage.removeItem(LS_KEY_OCR_DEBUG_LOGS);
  } catch (e) {
    console.error('OCRログの削除に失敗しました', e);
  }
}

function formatRectForDebug(region, imageSize) {
  if (!region || !imageSize) return '';
  const x = Math.round((region.x || 0) * imageSize.width);
  const y = Math.round((region.y || 0) * imageSize.height);
  const w = Math.round((region.w || 0) * imageSize.width);
  const h = Math.round((region.h || 0) * imageSize.height);
  return `${x}, ${y}, ${w}, ${h}`;
}

function renderOcrDebugPanel(item) {
  const panel = document.getElementById('ocr-debug-panel');
  const content = document.getElementById('ocr-debug-content');
  if (!panel || !content) return;

  const debug = item && item.debugLog ? item.debugLog : null;
  if (!debug) {
    panel.classList.remove('has-data');
    content.innerHTML = `
      <div class="ocr-debug-empty">
        <span class="material-symbols-outlined">analytics</span>
        解析後にここへ実測ログを表示します
      </div>
    `;
    return;
  }

  panel.classList.add('has-data');

  const stageHtml = (debug.stages || []).map(stage => {
    const variantsHtml = (stage.variants || []).map(v => `
      <div class="ocr-debug-variant">
        <div class="ocr-debug-variant-head">
          <span>${escapeHtml(v.name || 'variant')}</span>
          <strong>${escapeHtml(v.confidenceText || '')}</strong>
        </div>
        ${v.previewImage ? `<img src="${v.previewImage}" alt="${escapeHtml(v.name || 'variant')}">` : ''}
        <div class="ocr-debug-variant-text">${escapeHtml(v.text || '')}</div>
        ${v.selected ? '<div class="ocr-debug-variant-selected">採用候補</div>' : ''}
      </div>
    `).join('');

    return `
      <section class="ocr-debug-stage">
        <div class="ocr-debug-stage-head">
          <h4>${escapeHtml(stage.label || stage.key || '')}</h4>
          <span class="ocr-debug-stage-meta">${escapeHtml(stage.meta || '')}</span>
        </div>
        <div class="ocr-debug-stage-body">
          ${stage.previewImage ? `<img class="ocr-debug-stage-image" src="${stage.previewImage}" alt="${escapeHtml(stage.label || stage.key || '')}">` : ''}
          <div class="ocr-debug-stage-text">
            <div><strong>OCR:</strong> ${escapeHtml(stage.rawText || '—')}</div>
            <div><strong>採用:</strong> ${escapeHtml(stage.finalText || '—')}</div>
            ${stage.reason ? `<div><strong>理由:</strong> ${escapeHtml(stage.reason)}</div>` : ''}
            ${stage.extra ? `<div><strong>補足:</strong> ${escapeHtml(stage.extra)}</div>` : ''}
          </div>
        </div>
        ${variantsHtml ? `<div class="ocr-debug-variant-grid">${variantsHtml}</div>` : ''}
      </section>
    `;
  }).join('');

  content.innerHTML = `
    <div class="ocr-debug-summary">
      <div class="ocr-debug-summary-item">
        <span>プロファイル</span>
        <strong>${escapeHtml(debug.profileName || '—')}</strong>
      </div>
      <div class="ocr-debug-summary-item">
        <span>画像サイズ</span>
        <strong>${escapeHtml(debug.imageSize ? `${debug.imageSize.width}×${debug.imageSize.height}` : '—')}</strong>
      </div>
      <div class="ocr-debug-summary-item">
        <span>総ノーツ数</span>
        <strong>${escapeHtml(debug.totalNotes !== undefined ? String(debug.totalNotes) : '—')}</strong>
      </div>
      <div class="ocr-debug-summary-item">
        <span>推定ソース</span>
        <strong>${escapeHtml(debug.titleSource || '—')}</strong>
      </div>
    </div>
    <div class="ocr-debug-stage-list">
      ${stageHtml || '<div class="ocr-debug-empty">ログがありません</div>'}
    </div>
  `;

  const exportBtn = document.getElementById('btn-export-ocr-debug');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(debug, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocr-debug-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  const clearBtn = document.getElementById('btn-clear-ocr-debug');
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!confirm('保存済みのOCR実測ログを削除しますか？')) return;
      clearOcrDebugLogs();
      content.innerHTML = '<div class="ocr-debug-empty">保存済みログを削除しました</div>';
    };
  }
}
