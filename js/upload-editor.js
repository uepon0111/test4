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
  renderAnalysisDebug(null);

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

function renderAnalysisDebug(item) {
  const statusEl = document.getElementById('debug-status');
  const summaryEl = document.getElementById('debug-summary');
  const gridEl = document.getElementById('debug-grid');
  if (!statusEl || !summaryEl || !gridEl) return;

  const log = item && item.data ? item.data.debugLog : null;
  if (!log) {
    statusEl.innerText = 'ログなし';
    summaryEl.innerText = 'この画像の解析ログはまだありません。';
    gridEl.innerHTML = '';
    return;
  }

  const warnings = (log.inference && log.inference.warnings && log.inference.warnings.length)
    ? `\n警告: ${log.inference.warnings.join(' / ')}`
    : '';

  statusEl.innerText = 'OCR結果の詳細';
  summaryEl.innerText = [
    `曲名: ${log.title?.raw || ''}`,
    `難易度: ${detectDifficultyLabel(log.difficulty?.diffCode || '')} (${log.difficulty?.raw || ''})`,
    `楽曲Lv.: ${log.level?.parsed ?? log.level?.raw ?? ''}`,
    `総ノーツ数: ${log.breakdown?.totalNotes ?? ''}`,
    `総ミス数: ${log.breakdown?.totalMiss ?? ''}`,
    `コンボ: ${log.combo?.parsed ?? ''}`,
    `補正後の候補: ${log.inference?.bestMusic ? `${log.inference.bestMusic.title} / ${log.inference.bestMusic.diff} Lv.${log.inference.bestMusic.level}` : '未確定'}${warnings}`,
  ].join('\n');

  const card = (title, meta, text, images = []) => `
    <div class="ocr-debug-card">
      <h5>${escapeHtml(title)}</h5>
      <div class="ocr-debug-meta">${escapeHtml(meta)}</div>
      ${images.length ? `<div class="ocr-debug-images">${images.map(src => `<img src="${src}" alt="${escapeHtml(title)}">`).join('')}</div>` : ''}
      <p class="ocr-debug-text">${escapeHtml(text || '')}</p>
    </div>
  `;

  const titleImages = [];
  if (log.title?.standard?.processedImage) titleImages.push(log.title.standard.processedImage);
  if (log.title?.threshold?.processedImage) titleImages.push(log.title.threshold.processedImage);

  const cards = [
    card('曲名', `範囲: ${JSON.stringify(log.title?.region || {})}\n信頼度: ${log.title?.confidence ?? ''}\n採用: ${log.title?.chosen || ''}`, log.title?.raw || '', titleImages),
    card('難易度', `範囲: ${JSON.stringify(log.difficulty?.region || {})}\n信頼度: ${log.difficulty?.confidence ?? ''}`, `${log.difficulty?.raw || ''}`, [log.difficulty?.cropImage, log.difficulty?.processedImage].filter(Boolean)),
    card('楽曲Lv.', `範囲: ${JSON.stringify(log.level?.region || {})}\n信頼度: ${log.level?.confidence ?? ''}`, `${log.level?.raw || ''}`, [log.level?.cropImage, log.level?.processedImage].filter(Boolean)),
    card('判定内訳', `範囲: ${JSON.stringify(log.breakdown?.region || {})}\n信頼度: ${log.breakdown?.confidence ?? ''}`, `${log.breakdown?.raw || ''}`, [log.breakdown?.cropImage, log.breakdown?.processedImage].filter(Boolean)),
    card('コンボ数', `範囲: ${JSON.stringify(log.combo?.region || {})}\n信頼度: ${log.combo?.confidence ?? ''}`, `${log.combo?.raw || ''}`, [log.combo?.cropImage, log.combo?.processedImage].filter(Boolean)),
  ];
  gridEl.innerHTML = cards.join('');
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
  const totalNotes = item.data.totalNotes || (item.data.perfect + item.data.great + item.data.good + item.data.bad + item.data.missDetail);
  document.getElementById('up-total-notes').innerText = totalNotes;
  document.getElementById('up-combo').value = item.data.combo;

  populateDeviceSelect(item.data.deviceProfileId);
  renderAnalysisDebug(item);
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

  if (['good', 'bad', 'missDetail', 'perfect', 'great'].includes(field)) {
    item.data.totalMiss = item.data.good + item.data.bad + item.data.missDetail;
    item.data.totalNotes = item.data.perfect + item.data.great + item.data.good + item.data.bad + item.data.missDetail;
    document.getElementById('up-total-miss').innerText = item.data.totalMiss;
    document.getElementById('up-total-notes').innerText = item.data.totalNotes;
  }

  if (field === 'diff' && item.data.musicId) {
    const dbKey = getDiffDbKey(value);
    const newLvl = getLevelFromDb(item.data.musicId, dbKey);
    if (newLvl) { item.data.level = newLvl; document.getElementById('up-level').value = newLvl; }
  }

  if (field === 'title') {
    document.getElementById(`sb-title-${activeItemId}`).innerText = value || "名称未設定";
  }

  item.status = 'done';
  updateSidebarStatus(activeItemId);
  renderAnalysisDebug(item);
}

// 機種プロファイルを切り替えたら、その場で新しい読み取り範囲を使って再解析する
async function onDeviceProfileChange(newProfileId) {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (!item) return;
  item.data.deviceProfileId = newProfileId;
  await reanalyzeCurrentItem();
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
        item.data.title = res.title;
        item.data.level = res.level;
        item.data.diff = res.diff;
        item.data.perfect = res.perfect;
        item.data.great = res.great;
        item.data.good = res.good;
        item.data.bad = res.bad;
        item.data.missDetail = res.miss;
        item.data.totalMiss = res.good + res.bad + res.miss;
        item.data.totalNotes = res.totalNotes || (res.perfect + res.great + res.good + res.bad + res.miss);
        item.data.combo = res.combo;
        item.data.musicId = res.musicId;
        item.data.debugLog = res.debugLog || null;
        item.status = 'done';
      } else {
        item.status = 'error';
        item.data.debugLog = null;
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
      if (activeItemId === item.id) renderAnalysisDebug(item);
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
    totalNotes: data.totalNotes,
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
