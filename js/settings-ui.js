'use strict';
/* ============================================================
   settings-ui.js – 設定画面 UI
   ============================================================ */
const SettingsUI = (() => {
  let eqAdvanced = false;
  let bgmPlaying = false;
  let eqCanvas = null;
  let eqCtx = null;
  let volumeInit = false;

  function init() {
    renderSettingsScreen();
    Store.subscribe('settings', () => syncEQUI());
  }

  function renderSettingsScreen() {
    const area = document.getElementById('settings-area');
    if (!area) return;
    const s = Store.get('settings');
    const presets = Object.keys(AudioEngine.EQ_PRESETS);
    area.innerHTML = `
      <div class="settings-scroll">
        <div class="settings-section">
          <h3 class="settings-section-title"><i data-lucide="sliders"></i>イコライザ</h3>
          <div class="eq-toggle-row">
            <span class="toggle-label">イコライザを有効にする</span>
            <label class="toggle-switch">
              <input type="checkbox" id="eq-enabled" ${s.eqEnabled?'checked':''}>
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="eq-mode-row">
            <button class="eq-mode-btn ${!eqAdvanced?'active':''}" id="btn-eq-beginner">かんたん設定</button>
            <button class="eq-mode-btn ${eqAdvanced?'active':''}" id="btn-eq-advanced">詳細設定</button>
          </div>

          <!-- かんたん設定 -->
          <div id="eq-beginner-panel" class="${eqAdvanced?'hidden':''}">
            <div class="eq-presets-grid">
              ${presets.map(p=>`<button class="eq-preset-btn ${s.eqPreset===p?'active':''}" data-preset="${p}">${p}</button>`).join('')}
            </div>
          </div>

          <!-- 詳細設定 -->
          <div id="eq-advanced-panel" class="${!eqAdvanced?'hidden':''}">
            <div class="eq-curve-wrap">
              <canvas id="eq-curve-canvas" width="600" height="120"></canvas>
            </div>
            <div class="eq-sliders-wrap" id="eq-sliders">
              ${AudioEngine.getEQBands().map((band,i)=>`
                <div class="eq-band">
                  <div class="eq-band-label">${band.shortLabel}</div>
                  <div class="eq-slider-wrap">
                    <span class="eq-val" id="eq-val-${i}">${s.eqBands[i]>0?'+':''}${s.eqBands[i]}dB</span>
                    <input type="range" class="eq-slider" id="eq-slider-${i}" min="-12" max="12" step="0.5" value="${s.eqBands[i]}" orient="vertical">
                  </div>
                  <div class="eq-band-freq">${band.label}</div>
                </div>`).join('')}
            </div>
            <button class="btn btn-sm btn-ghost" id="btn-eq-reset">フラットに戻す</button>
          </div>

          <!-- サンプルBGM -->
          <div class="eq-sample-wrap">
            <div class="sample-label"><i data-lucide="headphones"></i>サンプル音源でイコライザを試聴</div>
            <div class="sample-controls">
              <button class="btn btn-secondary" id="btn-bgm-play">
                <i data-lucide="play"></i>再生
              </button>
              <label class="toggle-switch-sm">
                <input type="checkbox" id="eq-compare" ${s.eqEnabled?'checked':''}>
                <span class="toggle-track-sm"></span>
              </label>
              <span class="sample-eq-label">EQを適用</span>
            </div>
            <div class="sample-hint" id="bgm-hint">※ 初回再生時に音声を生成します（数秒かかります）</div>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title"><i data-lucide="volume-2"></i>音量</h3>
          <div class="volume-row">
            <i data-lucide="volume-1"></i>
            <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="${s.volume}" class="volume-slider">
            <i data-lucide="volume-2"></i>
            <span id="volume-label">${Math.round(s.volume*100)}%</span>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title"><i data-lucide="trash-2"></i>データ管理</h3>
          <div class="cache-info" id="cache-info">
            <i data-lucide="database"></i><span>登録曲数: ${Store.get('tracks').length}曲</span>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-title">再生ログをクリア</div>
              <div class="settings-row-desc">再生履歴・ログ画面のデータを削除します</div>
            </div>
            <button class="btn btn-outline-danger" id="btn-clear-logs">ログを削除</button>
          </div>
          <div class="settings-row danger-zone">
            <div>
              <div class="settings-row-title">全データをクリア</div>
              <div class="settings-row-desc">追加した曲・プレイリスト・タグ・アーティスト・設定を全て削除します。この操作は取り消せません。</div>
            </div>
            <button class="btn btn-danger" id="btn-clear-all">全て削除</button>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title"><i data-lucide="info"></i>このアプリについて</h3>
          <div class="about-info">
            <div class="about-row"><span>アプリ名</span><span>Tune Vault</span></div>
            <div class="about-row"><span>データ保存先</span><span>ブラウザ (IndexedDB)</span></div>
            <div class="about-row"><span>対応フォーマット</span><span>MP3, M4A, WAV, OGG, FLAC</span></div>
          </div>
        </div>
      </div>`;

    Utils.refreshIcons(area);
    setupEQHandlers(area);
    setupVolumeHandler(area);
    setupCacheHandlers(area);
    drawEQCurve();
  }

  /* ======================== EQ ハンドラー ======================== */
  function setupEQHandlers(area) {
    const s = Store.get('settings');

    // ON/OFF toggle
    area.querySelector('#eq-enabled').onchange = e => {
      AudioEngine.setEQEnabled(e.target.checked);
      syncEQCompareToggle(area);
    };

    // モード切替
    area.querySelector('#btn-eq-beginner').onclick = () => {
      eqAdvanced = false;
      area.querySelector('#eq-beginner-panel').classList.remove('hidden');
      area.querySelector('#eq-advanced-panel').classList.add('hidden');
      area.querySelector('#btn-eq-beginner').classList.add('active');
      area.querySelector('#btn-eq-advanced').classList.remove('active');
    };
    area.querySelector('#btn-eq-advanced').onclick = () => {
      eqAdvanced = true;
      area.querySelector('#eq-beginner-panel').classList.add('hidden');
      area.querySelector('#eq-advanced-panel').classList.remove('hidden');
      area.querySelector('#btn-eq-beginner').classList.remove('active');
      area.querySelector('#btn-eq-advanced').classList.add('active');
      eqCanvas = area.querySelector('#eq-curve-canvas');
      eqCtx    = eqCanvas ? eqCanvas.getContext('2d') : null;
      drawEQCurve();
    };

    // プリセット
    area.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.onclick = () => {
        AudioEngine.applyEQPreset(btn.dataset.preset);
        area.querySelectorAll('.eq-preset-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        syncEQSliders(area);
        drawEQCurve();
      };
    });

    // 詳細スライダー
    AudioEngine.getEQBands().forEach((_, i) => {
      const sl = area.querySelector(`#eq-slider-${i}`);
      if (!sl) return;
      sl.oninput = () => {
        const v = parseFloat(sl.value);
        AudioEngine.setEQBand(i, v);
        const valEl = area.querySelector(`#eq-val-${i}`);
        if (valEl) valEl.textContent = (v>0?'+':'')+v+'dB';
        drawEQCurve();
        area.querySelectorAll('.eq-preset-btn').forEach(b=>b.classList.remove('active'));
      };
    });

    // リセット
    const resetBtn = area.querySelector('#btn-eq-reset');
    if (resetBtn) resetBtn.onclick = () => {
      AudioEngine.applyEQPreset('フラット');
      syncEQSliders(area);
      area.querySelectorAll('.eq-preset-btn').forEach(b=>b.classList.toggle('active',b.dataset.preset==='フラット'));
      drawEQCurve();
    };

    // サンプルBGM
    const bgmBtn = area.querySelector('#btn-bgm-play');
    if (bgmBtn) bgmBtn.onclick = () => toggleBGM(bgmBtn, area);

    const compareToggle = area.querySelector('#eq-compare');
    if (compareToggle) {
      compareToggle.checked = s.eqEnabled;
      compareToggle.onchange = e => AudioEngine.setEQEnabled(e.target.checked);
    }
  }

  function syncEQSliders(area) {
    const bands = Store.get('settings').eqBands;
    bands.forEach((v,i)=>{
      const sl = area.querySelector(`#eq-slider-${i}`);
      const vl = area.querySelector(`#eq-val-${i}`);
      if (sl) sl.value = v;
      if (vl) vl.textContent = (v>0?'+':'')+v+'dB';
    });
  }

  function syncEQUI() {
    const area = document.getElementById('settings-area');
    if (!area) return;
    const s = Store.get('settings');
    const toggle = area.querySelector('#eq-enabled');
    if (toggle) toggle.checked = s.eqEnabled;
    syncEQSliders(area);
    drawEQCurve();
  }

  function syncEQCompareToggle(area) {
    const s = Store.get('settings');
    const t = area.querySelector('#eq-compare');
    if (t) t.checked = s.eqEnabled;
  }

  /* ======================== EQ カーブ描画 ======================== */
  function drawEQCurve() {
    if (!eqCanvas || !eqCtx) {
      eqCanvas = document.getElementById('eq-curve-canvas');
      eqCtx    = eqCanvas ? eqCanvas.getContext('2d') : null;
    }
    if (!eqCanvas || !eqCtx) return;
    const W = eqCanvas.offsetWidth;
    if (W === 0) return; // まだ非表示
    const H = eqCanvas.offsetHeight || 120;
    eqCanvas.width  = W;
    eqCanvas.height = H;
    const ctx = eqCtx;
    ctx.clearRect(0,0,W,H);

    const bands  = Store.get('settings').eqBands;
    const maxG   = 12;
    const eqData = AudioEngine.getEQBands();

    // グリッド
    ctx.strokeStyle = 'rgba(108,99,255,0.1)';
    ctx.lineWidth   = 1;
    for (let g=-12; g<=12; g+=6) {
      const y = H/2 - (g/maxG)*(H/2-10);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }

    // 0dB ライン
    ctx.strokeStyle = 'rgba(108,99,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();

    // 周波数軸のラベル位置
    const freqLog  = (f) => (Math.log10(f)-Math.log10(20))/(Math.log10(20000)-Math.log10(20));
    const freqToX  = (f) => freqLog(f)*W;
    const gainToY  = (g) => H/2 - (g/maxG)*(H/2-10);

    // EQ バンドの寄与を計算 (近似)
    const N = 200;
    const xs=[], ys=[];
    for (let i=0;i<N;i++) {
      const f = Math.pow(10, Math.log10(20) + (i/(N-1))*(Math.log10(20000)-Math.log10(20)));
      let totalDb = 0;
      eqData.forEach((band, bi) => {
        const g = bands[bi] || 0;
        if (g === 0) return;
        const lf = Math.log(f/band.freq);
        if (band.type==='lowshelf')  totalDb += g/(1+Math.exp( 3*lf));
        else if (band.type==='highshelf') totalDb += g/(1+Math.exp(-3*lf));
        else totalDb += g*Math.exp(-0.5*Math.pow(lf*band.Q,2));
      });
      xs.push(freqToX(f)); ys.push(gainToY(Utils.clamp(totalDb,-12,12)));
    }

    // 塗りつぶし曲線
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'rgba(108,99,255,0.3)');
    grad.addColorStop(1,'rgba(108,99,255,0.02)');
    ctx.beginPath();
    ctx.moveTo(xs[0],H/2);
    xs.forEach((x,i)=>ctx.lineTo(x,ys[i]));
    ctx.lineTo(xs[N-1],H/2);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // 曲線
    ctx.beginPath();
    ctx.moveTo(xs[0],ys[0]);
    for (let i=1;i<N;i++) { const mx=(xs[i-1]+xs[i])/2; ctx.quadraticCurveTo(xs[i-1],ys[i-1],mx,(ys[i-1]+ys[i])/2); }
    ctx.lineTo(xs[N-1],ys[N-1]);
    ctx.strokeStyle='#6C63FF'; ctx.lineWidth=2.5; ctx.stroke();

    // バンド点
    eqData.forEach((band,i) => {
      const g=bands[i]||0; if(g===0) return;
      const x=freqToX(band.freq), y=gainToY(g);
      ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2);
      ctx.fillStyle='#6C63FF'; ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
  }

  /* ======================== BGM ======================== */
  async function toggleBGM(btn, area) {
    // ユーザー操作で AudioContext を初期化（autoplay ポリシー対応）
    AudioEngine.ensureAudioContext();
    const ctx = AudioEngine.getAudioContext();
    if (!ctx) {
      Utils.showToast('音声機能が利用できません。ページを再読み込みしてください','error');
      return;
    }
    if (bgmPlaying) {
      AudioEngine.stopBGM();
      bgmPlaying = false;
      btn.innerHTML = '<i data-lucide="play"></i>再生';
      Utils.refreshIcons(btn);
      return;
    }
    if (!AudioEngine.isBGMReady()) {
      if (AudioEngine.isBGMRendering()) { Utils.showToast('音声を生成中です...','info'); return; }
      btn.innerHTML = '<i data-lucide="loader"></i>生成中...';
      Utils.refreshIcons(btn);
      btn.disabled = true;
      await AudioEngine.renderBGM();
      btn.disabled = false;
      if (!AudioEngine.isBGMReady()) {
        Utils.showToast('音声の生成に失敗しました','error');
        btn.innerHTML='<i data-lucide="play"></i>再生'; Utils.refreshIcons(btn); return;
      }
      const hint = area.querySelector('#bgm-hint');
      if (hint) hint.style.display='none';
    }
    // EQ チェーンの先頭ノード経由で出力（EQ デモのため）
    const eqNodes = AudioEngine.getEQNodes();
    const outputNode = eqNodes.length > 0 ? eqNodes[0] : AudioEngine.getGainNode() || ctx.destination;
    const ok = AudioEngine.startBGM(outputNode);
    if (ok) {
      bgmPlaying = true;
      btn.innerHTML = '<i data-lucide="square"></i>停止';
      Utils.refreshIcons(btn);
    }
  }

  /* ======================== 音量 ======================== */
  function setupVolumeHandler(area) {
    const sl = area.querySelector('#volume-slider');
    const lb = area.querySelector('#volume-label');
    if (!sl) return;
    sl.oninput = () => {
      const v = parseFloat(sl.value);
      lb.textContent = Math.round(v*100)+'%';
      AudioEngine.setVolume(v);
    };
  }

  /* ======================== キャッシュ ======================== */
  function setupCacheHandlers(area) {
    area.querySelector('#btn-clear-logs').onclick = async () => {
      const ok = await Utils.confirmDialog('再生ログを全て削除しますか？','ログを削除','削除');
      if (!ok) return;
      await DB.clearPlayLogs();
      Store.setPlayLogs([]);
      Utils.showToast('再生ログを削除しました','success');
    };
    area.querySelector('#btn-clear-all').onclick = async () => {
      const ok = await Utils.confirmDialog('全てのデータ（曲、プレイリスト、タグ、アーティスト）を削除します。\nこの操作は取り消せません。本当に削除しますか？','全データ削除','削除');
      if (!ok) return;
      AudioEngine.pause();
      await DB.clearAll();
      // ページをリロードして初期化
      Utils.showToast('全データを削除しました。ページを再読み込みします...','info',2000);
      setTimeout(()=>location.reload(), 2000);
    };
  }

  return { init, drawEQCurve };
})();
