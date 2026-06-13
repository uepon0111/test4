import { icon } from './icons.js';
import { EQ_FREQS, EQ_PRESETS } from './equalizer.js';
import { formatBytes } from './utils.js';

const PRESET_LABELS = {
  normal: 'ノーマル', pop: 'ポップ', rock: 'ロック', classic: 'クラシック', jazz: 'ジャズ', bass: '低音強調', treble: '高音強調', voice: 'ボイス', custom: 'カスタム',
};

export function renderSettingsScreen(state, storage = { usage: 0, quota: 0 }) {
  const eq = state.eq || {};
  const usageText = storage.quota ? `${formatBytes(storage.usage || 0)} / ${formatBytes(storage.quota || 0)}` : '取得できませんでした';
  return `
    <div class="screen-body settings-screen">
      <div class="settings-layout">
        <div class="settings-col">
          <div class="storage-box">
            <div class="toolbar"><strong>保存領域</strong><span class="badge">${usageText}</span></div>
            <div class="progress"><span style="width:${storage.quota ? Math.min(100, ((storage.usage || 0) / storage.quota) * 100) : 0}%"></span></div>
            <div class="small muted">曲本体はIndexedDBに保存しています。ブラウザのストレージ容量が不足すると追加できなくなります。</div>
            <div class="toolbar-row">
              <button class="btn btn-danger" data-action="clear-app-data">${icon('trash')}データを全削除</button>
              <button class="btn" data-action="refresh-storage">${icon('clock')}再計測</button>
            </div>
          </div>
          <div class="storage-box">
            <div class="toolbar"><strong>イコライザ プリセット</strong><span class="badge">${PRESET_LABELS[eq.preset] || 'カスタム'}</span></div>
            <div class="simple-eq-presets">
              ${Object.entries(PRESET_LABELS).map(([key, label]) => `<button class="seg-btn ${eq.preset === key ? 'is-active' : ''}" data-action="eq-preset" data-value="${key}">${label}</button>`).join('')}
            </div>
            <div class="small muted">サンプル音源を聴き比べながら、最初はプリセットを選び、必要に応じて詳細設定で調整できます。</div>
          </div>
          <div class="storage-box">
            <div class="toolbar"><strong>サンプル再生</strong><span class="small muted">オフライン用の試聴音源</span></div>
            <div class="sample-row">
              <button class="btn" data-action="sample-play" data-sample="sample1">サンプル 1</button>
              <button class="btn" data-action="sample-play" data-sample="sample2">サンプル 2</button>
              <button class="btn" data-action="sample-play" data-sample="sample3">サンプル 3</button>
              <button class="btn btn-danger" data-action="sample-stop">停止</button>
            </div>
            <div class="small muted">再生中の曲は一時停止され、同じイコライザ設定で試聴できます。</div>
          </div>
        </div>
        <div class="eq-col">
          <div class="storage-box">
            <div class="toolbar"><strong>詳細イコライザ</strong><span class="badge">10バンド</span></div>
            <div class="eq-bars">
              ${EQ_FREQS.map((freq, i) => `
                <div class="eq-band">
                  <input type="range" min="-12" max="12" step="1" value="${eq.bands?.[i] ?? 0}" data-action="eq-band" data-index="${i}" />
                  <div class="tiny muted">${freq >= 1000 ? `${freq / 1000}k` : freq}Hz</div>
                  <div class="kbd">${eq.bands?.[i] ?? 0}</div>
                </div>`).join('')}
            </div>
            <div class="toolbar-row">
              <button class="btn" data-action="eq-reset">${icon('x')}フラットに戻す</button>
              <button class="btn" data-action="eq-toggle">${icon('volume')}イコライザ ${eq.enabled === false ? 'OFF' : 'ON'}</button>
            </div>
          </div>
          <div class="storage-box">
            <div class="toolbar"><strong>現在の設定</strong><span class="small muted">保存済み</span></div>
            <div class="row row-2">
              <div><label class="small muted">プリセット</label><div class="badge">${PRESET_LABELS[eq.preset] || 'カスタム'}</div></div>
              <div><label class="small muted">試聴モード</label><div class="badge">${state.player.sampleMode ? 'ON' : 'OFF'}</div></div>
            </div>
            <div class="small muted">設定は自動保存され、ページを閉じても保持されます。ストレージが逼迫した場合は警告が表示されます。</div>
          </div>
        </div>
      </div>
    </div>`;
}

export function getPresetBands(key) {
  return EQ_PRESETS[key] || EQ_PRESETS.normal;
}
