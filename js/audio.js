'use strict';

/* ============================================================
   AUDIO ENGINE  —  再生エンジン
   ============================================================ */

const AudioEngine = (() => {
  const audio = new Audio();
  audio.preload = 'metadata';
  /* ピッチ保持: 作成直後に設定しておく */
  audio.preservesPitch      = true;
  audio.mozPreservesPitch   = true;
  audio.webkitPreservesPitch = true;

  let ctx          = null;
  let mediaSource  = null;
  let normGainNode = null;  // 音量一定化モード用のゲイン
  let gainNode     = null;
  let currentURL   = null;
  let loadGen      = 0;

  /* play log */
  let logStart    = null;
  let logTrackId  = null;

  /* shuffle queue */
  let shuffleQueue  = [];
  let shuffleIndex  = -1;

  /* 音量一定化／無音削除モード用の解析結果キャッシュ
     { [trackId]: { peak, startTrim, endTrim } } */
  const _dspCache        = {};
  let   _currentStartTrim = null;  // 先頭の無音スキップ終点（秒）
  let   _currentEndTrim   = null;  // 末尾の無音区間開始点（秒）
  let   _trimTriggered    = false;
  let   _startTrimApplied = false; // 先頭スキップ適用済みフラグ

  const NORMALIZE_TARGET_PEAK = 0.95;
  const NORMALIZE_MAX_GAIN    = 4;
  const SILENCE_THRESHOLD     = 0.015; // 末尾フェードアウト検知を少し敏感に

  /* ─── AudioContext init (user gesture 後に呼ぶ) ─── */
  async function _initCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    mediaSource  = ctx.createMediaElementSource(audio);
    normGainNode = ctx.createGain();
    normGainNode.gain.value = 1;
    gainNode     = ctx.createGain();
    gainNode.gain.value = AppState.volume / 100;

    Equalizer.init(ctx);
    mediaSource.connect(normGainNode);
    normGainNode.connect(gainNode);
    gainNode.connect(Equalizer.getInput());
    Equalizer.getOutput().connect(ctx.destination);

    await Equalizer.loadSettings();

    /* AudioContext がバックグラウンドでサスペンドされた場合、
       再生中であれば自動的に再開を試みる */
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'suspended' && AppState.isPlaying) {
        ctx.resume().catch(() => {});
      }
    });

    // 既に解析済みのデータがあれば即座に反映
    _applyDspForCurrentTrack();
  }

  /* ─── ファイル読み込み ─── */
  async function _loadTrack(trackId) {
    const gen = ++loadGen;
    const track = AppState.getTrack(trackId);
    if (!track) return false;

    if (currentURL) { URL.revokeObjectURL(currentURL); currentURL = null; }

    const buf = await Storage.getAudioFile(trackId);
    if (!buf) { Toast.error(`"${track.title}" のファイルが見つかりません`); return false; }
    if (gen !== loadGen) return false;

    currentURL = URL.createObjectURL(new Blob([buf]));
    audio.src  = currentURL;
    /* ピッチ保持: レート設定の前に必ず付与する */
    _applyPreservesPitch();
    audio.playbackRate = AppState.playbackRate;
    AppState.setCurrentTrack(trackId);

    // 音量一定化／無音削除モード: 新しい曲用にリセットしてから解析
    _currentStartTrim  = null;
    _currentEndTrim    = null;
    _trimTriggered     = false;
    _startTrimApplied  = false;
    if (normGainNode) normGainNode.gain.value = 1;
    _scheduleDspAnalysis(trackId, buf.slice(0));

    _updateMediaSessionMetadata(track);
    return true;
  }

  /* ─── 再生速度変更時もピッチを保つ ─── */
  function _applyPreservesPitch() {
    audio.preservesPitch       = true;
    audio.mozPreservesPitch    = true;
    audio.webkitPreservesPitch = true;
  }

  /* ─── 再生 ─── */
  async function play(trackId) {
    if (trackId !== undefined && trackId !== AppState.currentTrackId) {
      const ok = await _loadTrack(trackId);
      if (!ok) return;
    }
    if (!AppState.currentTrackId) return;

    await _initCtx();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) {}
    }

    try {
      await audio.play();
      AppState.setPlaying(true);
      _startLog();
      _setMediaSessionPlaybackState('playing');
    } catch (e) {
      console.error('Play error:', e);
      Toast.error('再生できませんでした');
    }
  }

  /* ─── 一時停止 ─── */
  function pause() {
    audio.pause();
    AppState.setPlaying(false);
    _endLog();
    _setMediaSessionPlaybackState('paused');
  }

  /* ─── 再生・停止トグル ─── */
  async function togglePlay() {
    if (AppState.isPlaying) {
      pause();
    } else {
      if (AppState.currentTrackId) {
        await play();
      } else {
        const tracks = AppState.getCurrentListTracks();
        if (tracks.length) await play(tracks[0].id);
      }
    }
  }

  /* ─── 次の曲 ─── */
  async function next(fromEnded = false) {
    _endLog();
    const tracks = AppState.getCurrentListTracks();
    if (!tracks.length) return;

    /* repeat one */
    if (AppState.repeat === 'one' && fromEnded) {
      audio.currentTime = 0;
      await audio.play();
      AppState.setPlaying(true);
      _startLog();
      return;
    }

    let nextId = null;
    if (AppState.shuffle) {
      nextId = _nextShuffle(tracks);
    } else {
      const idx = tracks.findIndex(t => t.id === AppState.currentTrackId);
      if (idx < tracks.length - 1) {
        nextId = tracks[idx + 1].id;
      } else if (AppState.repeat === 'all' || !fromEnded) {
        nextId = tracks[0].id;
      }
    }

    if (nextId) {
      await play(nextId);
    } else {
      AppState.setPlaying(false);
      audio.currentTime = 0;
    }
  }

  /* ─── 前の曲 ─── */
  async function prev() {
    _endLog();
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      if (AppState.isPlaying) { await audio.play(); _startLog(); }
      return;
    }

    const tracks = AppState.getCurrentListTracks();
    if (!tracks.length) return;

    let prevId = null;
    if (AppState.shuffle) {
      prevId = _prevShuffle(tracks);
    } else {
      const idx = tracks.findIndex(t => t.id === AppState.currentTrackId);
      prevId = idx > 0 ? tracks[idx - 1].id : tracks[tracks.length - 1].id;
    }
    if (prevId) await play(prevId);
  }

  /* ─── シーク ─── */
  function seek(pct) {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = (clamp(pct, 0, 100) / 100) * audio.duration;
    _trimTriggered = false;
    _updateMediaPositionState();
  }

  /* ─── 音量 ─── */
  function setVolume(v) {
    AppState.setVolume(v);
    if (gainNode) gainNode.gain.value = v / 100;
  }

  /* ─── 速度（ピッチは変えない） ─── */
  function setSpeed(v) {
    AppState.setSpeed(v);
    /* ピッチ保持: レート変更の前に設定することで確実に適用 */
    _applyPreservesPitch();
    audio.playbackRate = v;
    _updateMediaPositionState();
  }

  /* ─── シャッフル ─── */
  function setShuffle(v) {
    AppState.setShuffle(v);
    if (v) _buildQueue(AppState.getCurrentListTracks());
  }

  /* ─── リピート ─── */
  function setRepeat(v) {
    AppState.setRepeat(v);
  }

  /* ─── シャッフルキュー ─── */
  function _buildQueue(tracks) {
    shuffleQueue = [...tracks].sort(() => Math.random() - 0.5);
    const cur = AppState.currentTrackId;
    if (cur) {
      const i = shuffleQueue.findIndex(t => t.id === cur);
      if (i > 0) { [shuffleQueue[0], shuffleQueue[i]] = [shuffleQueue[i], shuffleQueue[0]]; }
    }
    shuffleIndex = 0;
  }
  function _nextShuffle(tracks) {
    if (!shuffleQueue.length) _buildQueue(tracks);
    shuffleIndex++;
    if (shuffleIndex >= shuffleQueue.length) {
      if (AppState.repeat === 'all') { _buildQueue(tracks); shuffleIndex = 0; }
      else return null;
    }
    return shuffleQueue[shuffleIndex]?.id || null;
  }
  function _prevShuffle(tracks) {
    if (shuffleIndex > 0) { shuffleIndex--; return shuffleQueue[shuffleIndex]?.id || null; }
    return tracks.length ? tracks[0].id : null;
  }

  /* ─── 再生ログ ─── */
  function _startLog() {
    logStart   = Date.now();
    logTrackId = AppState.currentTrackId;
  }
  async function _endLog() {
    if (!logStart || !logTrackId) return;
    const duration = (Date.now() - logStart) / 1000;
    if (duration >= 3) {
      await Storage.addPlayLog({ id: generateId(), trackId: logTrackId, playedAt: logStart, duration });
    }
    logStart = null; logTrackId = null;
  }

  /* ============================================================
     音量一定化モード／無音削除モード（DSP）
     ============================================================ */

  /**
   * 波形を解析し、ピーク音量と先頭・末尾の無音区間の境界（秒）を求める。
   *
   * 改善点:
   *  - endTrim: 最後の有音ウィンドウの後に 0.5 秒のバッファを追加し、
   *    フェードアウト末尾が早期カットされるのを防ぐ。
   *  - SILENCE_THRESHOLD を少し下げてフェードアウト検知を改善。
   */
  function _analyzeBuffer(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const length    = audioBuffer.length;
    const sr        = audioBuffer.sampleRate;
    const chans     = [];
    for (let c = 0; c < channels; c++) chans.push(audioBuffer.getChannelData(c));

    let peak = 0;
    for (let c = 0; c < channels; c++) {
      const data = chans[c];
      for (let i = 0; i < length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }

    const WINDOW = Math.max(1, Math.floor(sr * 0.02)); // 20ms 単位で走査
    function windowMax(start, count) {
      let m = 0;
      const end = Math.min(length, start + count);
      for (let c = 0; c < channels; c++) {
        const data = chans[c];
        for (let i = start; i < end; i++) {
          const v = Math.abs(data[i]);
          if (v > m) m = v;
        }
      }
      return m;
    }

    /* 先頭無音: 最初に閾値を超えるウィンドウを探す */
    let startTrim = 0;
    for (let s = 0; s < length; s += WINDOW) {
      if (windowMax(s, WINDOW) > SILENCE_THRESHOLD) { startTrim = s / sr; break; }
    }

    /* 末尾無音: 末尾から逆走し最後の有音ウィンドウを探す。
       その後に 0.5 秒バッファを追加し、フェードアウト末尾の誤切りを防ぐ。 */
    const END_BUFFER_SEC = 0.5;
    let endTrim = length / sr;
    for (let s = length - WINDOW; s >= 0; s -= WINDOW) {
      if (windowMax(s, WINDOW) > SILENCE_THRESHOLD) {
        endTrim = Math.min(length / sr, (s + WINDOW) / sr + END_BUFFER_SEC);
        break;
      }
    }

    // 安全策: 全体が無音、または範囲が矛盾する場合はトリムしない
    if (startTrim >= endTrim) { startTrim = 0; endTrim = length / sr; }

    return { peak, startTrim, endTrim };
  }

  /** トラックのバイト列を解析し、結果をキャッシュ。現在再生中の曲なら即座に反映する */
  async function _scheduleDspAnalysis(trackId, arrayBuffer) {
    if (!AppState.normalizeVolume && !AppState.trimSilence) return;
    if (_dspCache[trackId]) { _applyDspForCurrentTrack(); return; }
    try {
      const DecodeCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const decodeCtx = ctx || (DecodeCtxClass ? new DecodeCtxClass(1, 1, 44100) : null);
      if (!decodeCtx) return;
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
      _dspCache[trackId] = _analyzeBuffer(audioBuffer);
      if (AppState.currentTrackId === trackId) _applyDspForCurrentTrack();
    } catch (e) {
      console.warn('DSP analysis failed:', e);
    }
  }

  /**
   * 現在の曲に対して、解析済みのキャッシュがあればゲイン・トリムを適用する。
   *
   * 改善点:
   *  - startTrim: 解析完了時点で再生位置が startTrim + 2 秒以内ならシークする。
   *    解析に時間がかかって無音が再生されてしまうケースを低減。
   *  - _startTrimApplied フラグで二重シークを防止。
   */
  function _applyDspForCurrentTrack() {
    const trackId = AppState.currentTrackId;
    const info = trackId ? _dspCache[trackId] : null;

    if (normGainNode && ctx) {
      if (AppState.normalizeVolume && info && info.peak > 0.0001) {
        const gain = Math.min(NORMALIZE_TARGET_PEAK / info.peak, NORMALIZE_MAX_GAIN);
        normGainNode.gain.setValueAtTime(gain, ctx.currentTime);
      } else {
        normGainNode.gain.setValueAtTime(1, ctx.currentTime);
      }
    }

    if (AppState.trimSilence && info) {
      _currentStartTrim = info.startTrim;
      _currentEndTrim   = info.endTrim;

      /* 先頭スキップ: 未適用かつ現在位置が startTrim + 2 秒以内の場合のみシーク */
      if (!_startTrimApplied && info.startTrim > 0 &&
          audio.currentTime < info.startTrim + 2.0) {
        audio.currentTime = info.startTrim;
        _startTrimApplied = true;
      }
    } else {
      _currentStartTrim = null;
      _currentEndTrim   = null;
    }
  }

  /** 設定画面でモードが切り替わった時に呼ばれる。現在の曲に再適用する */
  async function applyDspSettings() {
    const trackId = AppState.currentTrackId;
    if (!trackId) {
      if (normGainNode && ctx) normGainNode.gain.setValueAtTime(1, ctx.currentTime);
      _currentStartTrim = null;
      _currentEndTrim   = null;
      return;
    }
    if ((AppState.normalizeVolume || AppState.trimSilence) && !_dspCache[trackId]) {
      const buf = await Storage.getAudioFile(trackId);
      if (buf) await _scheduleDspAnalysis(trackId, buf.slice(0));
    } else {
      _applyDspForCurrentTrack();
    }
  }

  /* ============================================================
     MediaSession API（バックグラウンド再生・ロック画面サムネイル）
     ============================================================ */

  function _updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || !track) return;
    let artwork = [];
    if (track.thumbnail) {
      const m = /^data:([^;]+);/.exec(track.thumbnail);
      const type = m ? m[1] : 'image/jpeg';
      artwork = [
        { src: track.thumbnail, sizes: '512x512', type },
        { src: track.thumbnail, sizes: '256x256', type },
        { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ];
    } else {
      artwork = [
        { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ];
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:  track.title  || '不明のタイトル',
        artist: getArtistNames(track) || '不明のアーティスト',
        album:  '',
        artwork,
      });
    } catch (e) { /* 一部の古いブラウザでは MediaMetadata 未対応 */ }
  }

  function _setMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = state; } catch (e) {}
    }
  }

  function _updateMediaPositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration:     audio.duration,
        playbackRate: audio.playbackRate || 1,
        position:     Math.min(audio.currentTime, audio.duration),
      });
    } catch (e) {}
  }

  function _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play',  async () => {
        /* バックグラウンドからの再生: AudioContext を確実に再開してから play() */
        if (ctx && ctx.state === 'suspended') {
          try { await ctx.resume(); } catch (e) {}
        }
        await play();
      });
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('previoustrack', () => prev());
      ms.setActionHandler('nexttrack',     () => next());
      ms.setActionHandler('stop', () => pause());
      ms.setActionHandler('seekto', details => {
        if (details.fastSeek && 'fastSeek' in audio) { audio.fastSeek(details.seekTime); return; }
        audio.currentTime = details.seekTime;
        _trimTriggered = false;
        _updateMediaPositionState();
      });
      ms.setActionHandler('seekbackward', details => {
        audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
        _trimTriggered = false;
        _updateMediaPositionState();
      });
      ms.setActionHandler('seekforward', details => {
        audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10));
        _trimTriggered = false;
        _updateMediaPositionState();
      });
    } catch (e) { /* 一部のアクションが未対応のブラウザでも他は動作させる */ }
  }
  _setupMediaSession();

  /* ─── バックグラウンド再生: ページ表示状態の変化に対応 ─── */
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'visible') {
      /* フォアグラウンド復帰時: サスペンドを解除 */
      if (ctx.state === 'suspended' && AppState.isPlaying) {
        ctx.resume().catch(() => {});
      }
    } else {
      /* バックグラウンド移行時: 再生中なら AudioContext の維持を試みる */
      if (AppState.isPlaying && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }
  });

  /* ─── Audio element イベント ─── */
  audio.addEventListener('timeupdate', throttle(() => {
    AppState.setProgress(audio.currentTime, isFinite(audio.duration) ? audio.duration : 0);
    _updateMediaPositionState();

    /* 無音削除モード: 先頭の無音区間をスキップ（解析完了前に再生が始まった場合の保険） */
    if (_currentStartTrim !== null && !_startTrimApplied &&
        audio.currentTime < _currentStartTrim) {
      audio.currentTime = _currentStartTrim;
      _startTrimApplied = true;
      return;
    }

    /* 無音削除モード: 末尾の無音区間に入ったら次の曲へ */
    if (_currentEndTrim !== null && !_trimTriggered && AppState.isPlaying &&
        audio.currentTime >= _currentEndTrim) {
      _trimTriggered = true;
      next(true);
    }
  }, 200));

  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('error', () => {
    AppState.setPlaying(false);
    Toast.error('再生エラーが発生しました');
  });
  audio.addEventListener('loadedmetadata', () => {
    AppState.setProgress(0, isFinite(audio.duration) ? audio.duration : 0);
    _updateMediaPositionState();
  });

  /* ─── 公開 API ─── */
  return {
    play, pause, togglePlay, next, prev, seek,
    setVolume, setSpeed, setShuffle, setRepeat,
    applyDspSettings,
    /**
     * 特定トラックのDSPキャッシュをメモリから削除する。
     * ファイル削除時に呼び出してページ内キャッシュを解放する。
     */
    clearTrackCache(trackId) {
      delete _dspCache[trackId];
    },
    /**
     * すべてのDSPキャッシュを解放し、現在のObject URLを破棄する。
     * 全データクリア時に呼び出す。
     */
    clearAllCaches() {
      const keys = Object.keys(_dspCache);
      keys.forEach(k => delete _dspCache[k]);
      if (currentURL) {
        URL.revokeObjectURL(currentURL);
        currentURL = null;
      }
    },
    buildShuffleQueue: (tracks) => _buildQueue(tracks || AppState.getCurrentListTracks()),
    getCtx: () => ctx,
  };
})();
