'use strict';
/* ============================================================
   app.js – アプリ起動・画面制御・向き検知
   ============================================================ */
const App = (() => {
  const SCREENS = ['player','info-edit','log','settings'];

  async function init() {
    try {
      await DB.open();
      await loadAllData();
      setupDefaultPlaylist();
      AudioEngine.init();
      setupNavigation();
      setupOrientation();
      PlayerUI.init();
      InfoEditUI.init();
      LogUI.init();
      SettingsUI.init();
      switchScreen('player');
      lucide.createIcons();
      // 設定の音量を反映
      const s = Store.get('settings');
      AudioEngine.setVolume(s.volume ?? 0.8);
      // ミニプレイヤー更新（ページリロード後も表示を維持）
      updateMiniPlayerDisplay();
    } catch(e) {
      console.error('App init error:', e);
      Utils.showToast('アプリの初期化に失敗しました','error');
    }
  }

  /* ======================== データ読み込み ======================== */
  async function loadAllData() {
    const [tracks, playlists, tags, artists, playLogs, settingRaw] = await Promise.all([
      DB.getAllTracks(),
      DB.getPlaylists(),
      DB.getTags(),
      DB.getArtists(),
      DB.getPlayLogs(),
      DB.getSetting('app'),
    ]);

    Store.setTracks(tracks);
    Store.setPlaylists(playlists.length ? playlists : []);
    Store.setTags(tags);
    Store.setArtists(artists);
    Store.setPlayLogs(playLogs);

    if (settingRaw) Store.updateSettings(settingRaw);
  }

  /* ======================== 初期プレイリスト ======================== */
  function setupDefaultPlaylist() {
    let defaultPl = Store.getPlaylist(Store.DEFAULT_PLAYLIST_ID);
    if (!defaultPl) {
      defaultPl = {
        id: Store.DEFAULT_PLAYLIST_ID,
        name: 'すべての曲',
        trackIds: Store.get('tracks').map(t=>t.id),
        createdAt: Date.now(),
        isDefault: true,
      };
      Store.upsertPlaylist(defaultPl);
      DB.savePlaylist(defaultPl);
    } else {
      // 新規追加されたトラックを同期
      const allIds   = new Set(Store.get('tracks').map(t=>t.id));
      const existing = new Set(defaultPl.trackIds);
      const toAdd    = [...allIds].filter(id=>!existing.has(id));
      if (toAdd.length) {
        const updated = { ...defaultPl, trackIds:[...defaultPl.trackIds,...toAdd] };
        Store.upsertPlaylist(updated);
        DB.savePlaylist(updated);
      }
    }
    // 存在しないトラックをプレイリストから除去
    const trackIds = new Set(Store.get('tracks').map(t=>t.id));
    Store.get('playlists').forEach(pl=>{
      const cleaned = pl.trackIds.filter(id=>trackIds.has(id));
      if (cleaned.length !== pl.trackIds.length) {
        const updated = {...pl, trackIds:cleaned};
        Store.upsertPlaylist(updated);
        DB.savePlaylist(updated);
      }
    });
    Store.set('currentPlaylistId', Store.DEFAULT_PLAYLIST_ID);
  }

  /* ======================== ナビゲーション ======================== */
  function setupNavigation() {
    // サイドバー (横) + ボトム (縦) 両方
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.onclick = () => switchScreen(btn.dataset.screen);
    });
  }

  function switchScreen(name) {
    if (!SCREENS.includes(name)) return;
    Store.set('currentScreen', name);
    document.body.dataset.screen = name;

    // タブのアクティブ状態
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.screen===name));

    // スクリーン表示切替
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id===`screen-${name}`));

    // ログ画面は遷移時にリフレッシュ
    if (name==='log') LogUI.refresh();

    // 設定画面はイコライザカーブを再描画
    if (name==='settings') setTimeout(()=>SettingsUI.drawEQCurve(), 100);
  }

  /* ======================== 向き検知 ======================== */
  function setupOrientation() {
    const mq = window.matchMedia('(orientation: landscape)');
    const handle = () => {
      const isLandscape = mq.matches;
      document.body.classList.toggle('landscape', isLandscape);
      document.body.classList.toggle('portrait',  !isLandscape);
      // 曲グリッドのデフォルトカラム数を向きに応じて設定
      Store.set('songCols', isLandscape ? 4 : 2);
    };
    handle();
    mq.addEventListener('change', handle);
  }

  /* ======================== ミニプレイヤー表示更新 ======================== */
  function updateMiniPlayerDisplay() {
    const id = Store.get('currentTrackId');
    if (!id) return;
    const track = Store.getTrack(id);
    if (!track) return;
    document.getElementById('mini-title').textContent = track.title;
    const artists = (track.artistIds||[]).map(i=>Store.getArtist(i)).filter(Boolean).map(a=>a.name);
    document.getElementById('mini-artist').textContent = artists.join(', ') || '不明のアーティスト';
    PlayerUI.loadThumbnailInto('mini-thumb','mini-thumb-placeholder', id);
  }

  /* ======================== 設定の永続化 ======================== */
  Store.subscribe('settings', async s => {
    await DB.saveSetting('app', s);
  });

  /* ======================== グローバルキーボードショートカット ======================== */
  document.addEventListener('keydown', e => {
    if (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
    if (e.code==='Space') { e.preventDefault(); if(AudioEngine.isPlaying()) AudioEngine.pause(); else AudioEngine.play(); }
    if (e.code==='ArrowRight') AudioEngine.next();
    if (e.code==='ArrowLeft')  AudioEngine.prev();
  });

  return { init, switchScreen };
})();

/* ======================== エントリポイント ======================== */
document.addEventListener('DOMContentLoaded', () => App.init());
