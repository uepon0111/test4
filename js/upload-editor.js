/*
 * upload-editor.js
 * -----------------------------------------------------------------------
 * 「画像アップロード・編集」モーダルのロジック全体。
 *   - ドロップゾーン/ファイル選択でのキュー追加
 *   - 画像ごとの機種プロファイル自動選択(解像度・アスペクト比から)
 *   - OCR解析の実行 (PERFECT/GREAT/GOOD/BAD/MISS + コンボ数を含む)
 *   - フォーム編集 (曲名・レベル・難易度・判定内訳・コンボ・機種)
 *   - 保存実行 (新規アップロード / 既存レコードの更新) と自己ベスト通知への橋渡し
 * -----------------------------------------------------------------------
 */

// ============================================================
// モーダルの開閉
// ============================================================

function openBatchModal(mode) {
  currentMode = mode;
  const modal = document.getElementById('batchModal');
  modal.style.display = 'flex';

  editorQueue = [];
  activeItemId = null;
  document.getElementById('batch-sidebar-list').innerHTML = "";
  document.getElementById('batch-editor-container').style.display = 'none';
  document.getElementById('batch-empty-msg').style.display = 'block';
  document.getElementById('batch-status-msg').innerText = "待機中...";
  document.getElementById('btn-exec-batch').disabled = true;

  if (mode === 'upload') {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">cloud_upload</span> 画像アップロード';
    document.getElementById('upload-initial').style.display = 'flex';
    document.getElementById('batch-workspace').style.display = 'none';
    document.getElementById('up-file').value = "";
    document.getElementById('btn-exec-batch').innerText = "全てアップロード";
  } else {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">edit_square</span> 編集・解析モード';
    document.getElementById('upload-initial').style.display = 'none';
    document.getElementById('batch-workspace').style.display = 'flex';
    document.getElementById('btn-exec-batch').innerText = "保存して反映";
  }
}

function closeBatchModal() {
  document.getElementById('batchModal').style.display = 'none';
}

// ============================================================
// ドロップゾーン/ファイル選択
// ============================================================

function initUploadEditor() {
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); });
  document.getElementById('up-file').addEventListener('change', (e) => handleFiles(e.target.files));

  populateDifficultySelect(document.getElementById('up-diff'), { defaultValue: 'MS' });
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

async function handleFiles(files) {
  if (files.length === 0) return;
  document.getElementById('upload-initial').style.display = 'none';
  document.getElementById('batch-workspace').style.display = 'flex';
  document.getElementById('batch-status-msg').innerText = "画像を処理中...";

  const profiles = getDeviceProfiles();
  const newItems = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const qId = "new_" + Date.now() + "_" + i;
    const imgUrl = URL.createObjectURL(file);

    // 画像の画素数・アスペクト比から、保存済みの機種プロファイルを自動選択する
    const dims = await getImageDimensions(imgUrl);
    const profile = findBestProfileForImage(dims.width, dims.height, profiles);

    const item = {
      id: qId,
      file: file,
      imgUrl: imgUrl,
      mimeType: file.type,
      status: 'pending',
      schema: null,
      data: {
        title: '', level: '', diff: 'MS',
        perfect: 0, great: 0, good: 0, bad: 0, missDetail: 0, totalMiss: 0,
        combo: 0, musicId: null,
        deviceProfileId: profile ? profile.id : null,
      },
      originalId: null,
      originalParent: null,
    };
    editorQueue.push(item);
    newItems.push(item);
    renderSidebarItem(qId);
  }

  await runBatchAnalysis(newItems);

  if (!activeItemId && editorQueue.length > 0) selectItem(editorQueue[0].id);
  checkBatchButton();
}

// ============================================================
// 編集モードのキュー初期化 (選択済みレコードから)
// ============================================================

// 記録済みの device(機種名)から一致するプロファイルを探す。見つからなければ先頭のプロファイルを使う。
function resolveDeviceProfileForRecord(rec) {
  const profiles = getDeviceProfiles();
  if (rec.device) {
    const byName = profiles.find(p => p.name === rec.device);
    if (byName) return byName;
  }
  return profiles[0] || null;
}

async function batchEdit() {
  if (selectedIds.size === 0) return;
  openBatchModal('edit');

  const targets = allRecords.filter(r => selectedIds.has(r.id));
  document.getElementById('batch-status-msg').innerText = "編集データを準備中...";

  for (const rec of targets) {
    const qId = "edit_" + rec.id;
    const highResUrl = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
    const profile = resolveDeviceProfileForRecord(rec);

    editorQueue.push({
      id: qId,
      file: null,
      imgUrl: highResUrl,
      mimeType: rec.mimeType || '',
      status: 'existing',
      schema: rec.schema,
      data: {
        title: rec.title, level: rec.level, diff: rec.difficultyRaw,
        // 新方式のレコードは実際の内訳が分かっているのでそのまま使う。
        // 旧方式のレコードは元々内訳を記録していないため0になる(rec側で既に0が入っている)。
        perfect: rec.perfect, great: rec.great, good: rec.good, bad: rec.bad, missDetail: rec.miss,
        totalMiss: rec.missCount,
        combo: rec.combo,
        musicId: rec.musicId,
        deviceProfileId: profile ? profile.id : null,
      },
      originalId: rec.id,
      originalParent: rec.parentId,
    });
    renderSidebarItem(qId);
  }
  if (editorQueue.length > 0) selectItem(editorQueue[0].id);
  checkBatchButton();
  document.getElementById('batch-status-msg').innerText = "編集準備完了";
}

// ============================================================
// サイドバー / フォーム表示
// ============================================================

function renderSidebarItem(id) {
  const item = editorQueue.find(q => q.id === id);
  const div = document.createElement('div');
  div.className = 'sidebar-item';
  div.id = `sb-${id}`;
  div.onclick = () => selectItem(id);

  div.innerHTML = `
      <img src="${item.imgUrl}" class="sidebar-thumb" crossorigin="anonymous">
      <div class="sidebar-info">
          <div class="sidebar-title" id="sb-title-${id}">${escapeHtml(item.data.title) || "名称未設定"}</div>
          <div class="sidebar-status">
              <span id="sb-status-${id}" class="upload-status ${item.status === 'existing' ? 'done' : item.status}">${item.status === 'existing' ? 'EXIST' : item.status}</span>
              <button class="btn-remove-side" onclick="removeBatchItem(event, '${id}')">
                  <span class="material-symbols-outlined" style="font-size:1rem;">delete</span>
              </button>
          </div>
      </div>
  `;
  document.getElementById('batch-sidebar-list').appendChild(div);
}

function populateDeviceSelect(selectedId) {
  const sel = document.getElementById('up-device');
  const profiles = getDeviceProfiles();
  sel.innerHTML = profiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if (selectedId && profiles.some(p => p.id === selectedId)) sel.value = selectedId;
}

function selectItem(id) {
  activeItemId = id;
  const item = editorQueue.find(q => q.id === id);
  if (!item) return;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const sbEl = document.getElementById(`sb-${id}`);
  if (sbEl) sbEl.classList.add('active');

  document.getElementById('batch-editor-container').style.display = 'flex';
  document.getElementById('batch-empty-msg').style.display = 'none';

  document.getElementById('batch-preview-img').src = item.imgUrl;

  document.getElementById('up-title').value = item.data.title;
  document.getElementById('up-level').value = item.data.level;
  document.getElementById('up-diff').value = item.data.diff;

  document.getElementById('up-perfect').value = item.data.perfect;
  document.getElementById('up-great').value = item.data.great;
  document.getElementById('up-good').value = item.data.good;
  document.getElementById('up-bad').value = item.data.bad;
  document.getElementById('up-miss-detail').value = item.data.missDetail;
  document.getElementById('up-total-miss').innerText = item.data.totalMiss;
  document.getElementById('up-combo').value = item.data.combo;

  populateDeviceSelect(item.data.deviceProfileId);
  renderAnalysisLog(item);
}

function updateCurrentItem(field, value) {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (!item) return;

  if (['good', 'bad', 'missDetail', 'perfect', 'great', 'combo', 'level'].includes(field)) {
    item.data[field] = parseInt(value) || 0;
  } else {
    item.data[field] = value;
  }

  if (field === 'diff' && item.data.musicId) {
    const dbKey = getDiffDbKey(value);
    const newLvl = getLevelFromDb(item.data.musicId, dbKey);
    if (newLvl) { item.data.level = newLvl; document.getElementById('up-level').value = newLvl; }
  }

  if (['good', 'bad', 'missDetail'].includes(field)) {
    item.data.totalMiss = item.data.good + item.data.bad + item.data.missDetail;
    document.getElementById('up-total-miss').innerText = item.data.totalMiss;
  }

  if (field === 'title') {
    document.getElementById(`sb-title-${activeItemId}`).innerText = value || "名称未設定";
  }

  item.status = 'done';
  updateSidebarStatus(activeItemId);
}

// 機種プロファイルを切り替えたら、その場で新しい読み取り範囲を使って再解析する
async function onDeviceProfileChange(newProfileId) {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (!item) return;
  item.data.deviceProfileId = newProfileId;
  await reanalyzeCurrentItem();
}


function renderAnalysisLog(item) {
  const panel = document.getElementById('analysis-log-content');
  const meta = document.getElementById('analysis-log-meta');
  if (!panel || !meta) return;

  if (!item || !item.analysisLog) {
    meta.innerHTML = '<span>解析ログはまだありません。</span>';
    panel.innerHTML = '<div class="analysis-log-empty">画像を再解析すると、座標範囲・二値化後の画像・OCR結果がここに表示されます。</div>';
    return;
  }

  const log = item.analysisLog;
  const summary = log.summary || {};
  meta.innerHTML = `
    <span>画像 ${log.imageMeta?.width || '-'}×${log.imageMeta?.height || '-'}</span>
    <span>判定内訳合計 ${summary.totalNotes ?? '-'}</span>
    <span>API総ノーツ ${summary.apiNotesTotal ?? '未取得'}</span>
  `;

  const regionHtml = (section, label) => {
    const region = section || {};
    const coords = region.region ? `x:${Math.round(region.region.x * 1000) / 1000}, y:${Math.round(region.region.y * 1000) / 1000}, w:${Math.round(region.region.w * 1000) / 1000}, h:${Math.round(region.region.h * 1000) / 1000}` : '-';
    const selected = region.selected || {};
    const candidates = Array.isArray(region.candidates) ? region.candidates : [];
    const candidateList = candidates.map((cand, idx) => `
      <div class="analysis-candidate">
        <div class="analysis-candidate-head">
          <strong>${idx === 0 ? '最有力' : `候補 ${idx + 1}`}</strong>
          <span>score:${cand.score ?? '-'}</span>
          <span>conf:${cand.confidence ?? '-'}</span>
        </div>
        <div class="analysis-candidate-text"><pre>${escapeHtml((cand.rawText || '').trim() || '（空）')}</pre></div>
        <div class="analysis-candidate-images">
          <figure><img src="${cand.cropDataUrl || ''}" alt="${label} crop"><figcaption>切り出し</figcaption></figure>
          <figure><img src="${cand.processedDataUrl || ''}" alt="${label} processed"><figcaption>二値化/前処理後</figcaption></figure>
        </div>
        <div class="analysis-candidate-meta">
          <span>前処理: ${escapeHtml(cand.presetName || '-')}</span>
          ${cand.threshold !== null && cand.threshold !== undefined ? `<span>閾値: ${Math.round(cand.threshold)}</span>` : ''}
          ${cand.diffCode ? `<span>判定: ${escapeHtml(cand.diffCode)}</span>` : ''}
          ${cand.matchedTitle ? `<span>曲名候補: ${escapeHtml(cand.matchedTitle)}</span>` : ''}
          ${cand.parsed ? `<span>解析値: ${escapeHtml(JSON.stringify(cand.parsed))}</span>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <section class="analysis-section">
        <div class="analysis-section-head">
          <h4>${label}</h4>
          <span>${coords}</span>
        </div>
        <div class="analysis-section-summary">
          <span>選択: ${escapeHtml(selected.presetName || '-')}</span>
          <span>OCR: ${escapeHtml((selected.rawText || '').trim() || '（空）')}</span>
        </div>
        <div class="analysis-candidate-list">${candidateList}</div>
      </section>
    `;
  };

  panel.innerHTML = `
    <details class="analysis-summary" open>
      <summary>全体サマリー</summary>
      <div class="analysis-summary-grid">
        <div><span class="k">曲名</span><span class="v">${escapeHtml(summary.title || item.data.title || '-')}</span></div>
        <div><span class="k">レベル</span><span class="v">${escapeHtml(summary.level || item.data.level || '-')}</span></div>
        <div><span class="k">難易度</span><span class="v">${escapeHtml(summary.diff || item.data.diff || '-')}</span></div>
        <div><span class="k">総ミス数</span><span class="v">${item.data.totalMiss ?? '-'}</span></div>
        <div><span class="k">コンボ</span><span class="v">${item.data.combo ?? '-'}</span></div>
        <div><span class="k">楽曲ID</span><span class="v">${summary.musicId ?? item.data.musicId ?? '-'}</span></div>
        <div><span class="k">API総ノーツ</span><span class="v">${summary.apiNotesTotal ?? '未取得'}</span></div>
      </div>
    </details>
    ${regionHtml(log.diff, '難易度')}
    ${regionHtml(log.title, '曲名')}
    ${regionHtml(log.breakdown, '判定内訳')}
    ${regionHtml(log.combo, 'コンボ数')}
  `;
}
function updateSidebarStatus(id) {
  const item = editorQueue.find(q => q.id === id);
  if (!item) return;
  const statusEl = document.getElementById(`sb-status-${id}`);
  statusEl.innerText = "OK";
  statusEl.className = "upload-status done";
}

function removeBatchItem(e, id) {
  e.stopPropagation();
  editorQueue = editorQueue.filter(q => q.id !== id);
  document.getElementById(`sb-${id}`).remove();
  if (activeItemId === id) {
    document.getElementById('batch-editor-container').style.display = 'none';
    document.getElementById('batch-empty-msg').style.display = 'block';
    activeItemId = null;
  }
  checkBatchButton();
}

function checkBatchButton() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = editorQueue.length === 0;
  const label = currentMode === 'upload' ? '全てアップロード' : '保存して反映';
  btn.innerText = editorQueue.length > 0 ? `${label} (${editorQueue.length}件)` : label;
}

// ============================================================
// OCR解析
// ============================================================

async function runBatchAnalysis(itemsToAnalyze) {
  if (itemsToAnalyze.length === 0) return;
  const statusMsg = document.getElementById('batch-status-msg');
  statusMsg.innerText = "解析中... (しばらくお待ちください)";

  const worker = await Tesseract.createWorker(['jpn', 'eng']);

  for (const item of itemsToAnalyze) {
    const el = document.getElementById(`sb-status-${item.id}`);
    if (el) { el.innerText = "解析中"; el.className = "upload-status processing"; }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = item.imgUrl;
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const profile = getDeviceProfileById(item.data.deviceProfileId) || getDeviceProfiles()[0];
      const regions = getRegionsForProfile(profile);
      const res = await analyzeLoadedImage(img, worker, regions);
      if (res) {
        item.data.title = res.result.title;
        item.data.level = res.result.level;
        item.data.diff = res.result.diff;
        item.data.perfect = res.result.perfect;
        item.data.great = res.result.great;
        item.data.good = res.result.good;
        item.data.bad = res.result.bad;
        item.data.missDetail = res.result.miss;
        item.data.totalMiss = res.result.good + res.result.bad + res.result.miss;
        item.data.combo = res.result.combo;
        item.data.musicId = res.result.musicId;
        item.analysisLog = res.debug || res.result.analysisLog || null;
        item.status = 'done';
      } else {
        item.status = 'error';
      }
    } catch (e) {
      console.error("Analysis Failed for " + item.id, e);
      item.status = 'error';
    }

    updateSidebarStatus(item.id);
    if (item.status === 'done') {
      document.getElementById(`sb-title-${item.id}`).innerText = item.data.title;
      if (activeItemId === item.id) selectItem(item.id);
    } else {
      const statEl = document.getElementById(`sb-status-${item.id}`);
      if (statEl) { statEl.innerText = "ERR"; statEl.className = "upload-status error"; }
    }
  }
  await worker.terminate();
  statusMsg.innerText = "処理完了";
}

async function reanalyzeCurrentItem() {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (item) await runBatchAnalysis([item]);
}

async function analyzeAllInBatch() {
  if (editorQueue.length === 0) return;
  await runBatchAnalysis(editorQueue);
}

// ============================================================
// 保存実行 (アップロード / 編集)
// ============================================================

async function handleBatchExecution() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = true;
  btn.innerText = "処理中...";

  if (currentMode === 'upload') {
    await executeUploads();
  } else {
    await executeEdits();
  }
}

// アップロード/編集した内容から、自己ベスト判定用の軽量なレコード情報を作る
function buildAchievementCandidate(data) {
  return {
    musicId: data.musicId,
    title: data.title,
    difficultyRaw: data.diff,
    missCount: data.totalMiss,
    combo: data.combo,
    createdTime: new Date().toISOString(),
  };
}

async function executeUploads() {
  let successCount = 0;
  const beforeSnapshot = allRecords.slice();
  const newlyAdded = [];

  for (const item of [...editorQueue]) {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = "送信中"; sbStatus.className = "upload-status processing"; }

    try {
      if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

      await createNewRecord(item.file, item.data);
      newlyAdded.push(buildAchievementCandidate(item.data));

      editorQueue = editorQueue.filter(q => q.id !== item.id);
      document.getElementById(`sb-${item.id}`).remove();
      successCount++;
    } catch (e) {
      console.error(e);
      if (sbStatus) { sbStatus.innerText = "失敗"; sbStatus.className = "upload-status error"; }
    }
  }
  finishExecution(successCount, "アップロード", beforeSnapshot, newlyAdded);
}

async function executeEdits() {
  let successCount = 0;
  const beforeSnapshot = allRecords.slice();
  const newlyAdded = [];

  for (const item of [...editorQueue]) {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = "保存中"; sbStatus.className = "upload-status processing"; }

    try {
      if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

      await updateExistingRecord(item);
      newlyAdded.push(buildAchievementCandidate(item.data));

      editorQueue = editorQueue.filter(q => q.id !== item.id);
      document.getElementById(`sb-${item.id}`).remove();
      successCount++;
    } catch (e) {
      console.error(e);
      if (sbStatus) { sbStatus.innerText = "失敗"; sbStatus.className = "upload-status error"; }
    }
  }
  finishExecution(successCount, "更新", beforeSnapshot, newlyAdded);
}

function finishExecution(count, actionName, beforeSnapshot, newlyAdded) {
  const achievements = detectNewBests(beforeSnapshot, newlyAdded);
  if (editorQueue.length === 0) {
    alert(`${actionName}完了 (${count}件)`);
    closeBatchModal();
    selectedIds.clear();
    updateSelectionUI();
    fetchDataFromDrive().then(() => showNewBestNotifications(achievements));
  } else {
    alert(`${count}件 ${actionName}成功。エラー分を確認してください。`);
    checkBatchButton();
  }
}
