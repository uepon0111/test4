'use strict';
/* ============================================================
   player-engine.js – 再生エンジン・イコライザ・BGMシンセ
   ============================================================ */
const AudioEngine = (() => {
  /* ---- EQ バンド定義 ---- */
  const EQ_BANDS = [
    { freq:60,    type:'lowshelf',  Q:1,   label:'サブベース',   shortLabel:'60Hz'  },
    { freq:170,   type:'peaking',   Q:1.4, label:'ベース',       shortLabel:'170Hz' },
    { freq:310,   type:'peaking',   Q:1.4, label:'ローミッド',   shortLabel:'310Hz' },
    { freq:1000,  type:'peaking',   Q:1.4, label:'ミッド',       shortLabel:'1kHz'  },
    { freq:3000,  type:'peaking',   Q:1.4, label:'ハイミッド',   shortLabel:'3kHz'  },
    { freq:6000,  type:'peaking',   Q:1.4, label:'プレゼンス',   shortLabel:'6kHz'  },
    { freq:14000, type:'highshelf', Q:1,   label:'ブリリアンス', shortLabel:'14kHz' },
  ];

  const EQ_PRESETS = {
    'フラット':     [ 0,  0,  0,  0,  0,  0,  0],
    'ロック':       [ 4,  3, -1, -1,  2,  3,  4],
    'ポップ':       [-1,  2,  4,  4,  2, -1, -2],
    'クラシック':   [ 4,  2, -1, -2, -1,  2,  4],
    'ジャズ':       [ 3,  2,  1, -1,  1,  2,  3],
    'バスブースト': [ 6,  5,  3,  0,  0,  0,  0],
    'ボーカル':     [-2, -2,  0,  3,  4,  3,  0],
    'ダンス':       [ 5,  4,  0, -1,  0,  3,  4],
  };

  /* ---- 内部状態 ---- */
  let audioCtx   = null;
  let audio      = null;
  let srcNode    = null;
  let gainNode   = null;
  let eqNodes    = [];
  let curBlobUrl = null;
  let curTrackId = null;
  let logStart   = 0;
  let ctxReady   = false;
  const handlers = {};

  /* ---- BGM シンセ状態 ---- */
  let bgmBuffer  = null;
  let bgmSrcNode = null;
  let bgmGain    = null;
  let bgmReady   = false;
  let bgmRendering = false;

  /* ======================== 初期化 ======================== */
  function init() {
    audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    audio.addEventListener('timeupdate', () => {
      Store.set('currentTime', audio.currentTime || 0);
      emit('timeupdate', audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
      Store.set('duration', audio.duration || 0);
      emit('loadedmetadata', audio.duration);
    });
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', () => emit('error', 'load-failed'));

    // ユーザー操作時に AudioContext を初期化
    const initCtx = () => { ensureAudioContext(); };
    document.addEventListener('click',      initCtx, { once:true });
    document.addEventListener('touchstart', initCtx, { once:true });
    document.addEventListener('keydown',    initCtx, { once:true });
  }

  function ensureAudioContext() {
    if (ctxReady) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      srcNode  = audioCtx.createMediaElementSource(audio);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = Store.get('settings').volume ?? 0.8;

      // EQ ノード生成・接続
      eqNodes = EQ_BANDS.map(b => {
        const f = audioCtx.createBiquadFilter();
        f.type = b.type;
        f.frequency.value = b.freq;
        f.Q.value = b.Q;
        f.gain.value = 0;
        return f;
      });

      let node = srcNode;
      for (const eq of eqNodes) { node.connect(eq); node = eq; }
      node.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const s = Store.get('settings');
      if (s.eqEnabled) s.eqBands.forEach((g, i) => setEQBand(i, g));
      ctxReady = true;
    } catch(e) { console.warn('AudioContext init failed:', e); }
  }

  /* ======================== イベント ======================== */
  function on(event, fn) {
    if (!handlers[event]) handlers[event] = [];
    handlers[event].push(fn);
  }
  function off(event, fn) {
    if (!handlers[event]) return;
    handlers[event] = handlers[event].filter(h => h !== fn);
  }
  function emit(event, ...args) {
    (handlers[event] || []).forEach(fn => fn(...args));
  }

  /* ======================== トラック読み込み ======================== */
  async function loadTrack(trackId) {
    savePlayLog();
    const track = Store.getTrack(trackId);
    if (!track) return;

    try {
      const blob = await DB.getAudioBlob(trackId);
      if (!blob) { Utils.showToast('音声データが見つかりません', 'error'); return; }

      if (curBlobUrl) URL.revokeObjectURL(curBlobUrl);
      curBlobUrl = URL.createObjectURL(blob);
      curTrackId = trackId;

      audio.src = curBlobUrl;
      audio.playbackRate = Store.get('speed');
      Store.set('currentTrackId', trackId);
      Store.set('currentTime', 0);
      Store.set('duration', 0);
      emit('trackloaded', track);
    } catch(e) {
      console.error('loadTrack error:', e);
      Utils.showToast('曲の読み込みに失敗しました', 'error');
    }
  }

  /* ======================== 再生制御 ======================== */
  async function play() {
    if (!audio.src) return;
    ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
    try {
      await audio.play();
      Store.set('isPlaying', true);
      logStart = Date.now();
      emit('play');
    } catch(e) { console.warn('play error:', e); }
  }

  function pause() {
    audio.pause();
    Store.set('isPlaying', false);
    savePlayLog();
    emit('pause');
  }

  function seek(time) {
    savePlayLog();
    audio.currentTime = time;
    if (Store.get('isPlaying')) logStart = Date.now();
  }

  async function playTrack(trackId) {
    await loadTrack(trackId);
    await play();
  }

  async function next() {
    const id = Store.getNextTrackId();
    if (id) await playTrack(id);
    else { pause(); seek(0); }
  }

  async function prev() {
    if (audio.currentTime > 3) { seek(0); return; }
    const id = Store.getPrevTrackId();
    if (id) await playTrack(id);
    else seek(0);
  }

  async function onEnded() {
    savePlayLog();
    const loop = Store.get('loopMode');
    if (loop === 'one') {
      seek(0); await play();
    } else if (loop === 'all') {
      await next();
    } else {
      const id = Store.getNextTrackId();
      if (id && id !== curTrackId) await playTrack(id);
      else { Store.set('isPlaying', false); seek(0); emit('ended'); }
    }
  }

  /* ======================== プロパティ設定 ======================== */
  function setSpeed(rate) {
    audio.playbackRate = rate;
    Store.set('speed', rate);
  }

  function setVolume(vol) {
    if (gainNode) gainNode.gain.value = vol;
    else audio.volume = vol;
    Store.updateSettings({ volume: vol });
  }

  function setLoopMode(mode) { Store.set('loopMode', mode); }

  function setShuffle(enabled) {
    Store.set('shuffle', enabled);
    if (enabled) Store.rebuildShuffleQueue();
  }

  /* ======================== イコライザ ======================== */
  function setEQBand(i, gainDb) {
    if (eqNodes[i]) eqNodes[i].gain.value = gainDb;
    const bands = [...Store.get('settings').eqBands];
    bands[i] = gainDb;
    Store.updateSettings({ eqBands: bands });
  }

  function setEQEnabled(enabled) {
    Store.updateSettings({ eqEnabled: enabled });
    const s = Store.get('settings');
    eqNodes.forEach((node, i) => {
      node.gain.value = enabled ? s.eqBands[i] : 0;
    });
    emit('eqchange');
  }

  function applyEQPreset(name) {
    const bands = EQ_PRESETS[name];
    if (!bands) return;
    bands.forEach((g, i) => setEQBand(i, g));
    Store.updateSettings({ eqPreset: name });
    emit('eqchange');
  }

  function getEQBands() { return EQ_BANDS; }
  function getEQPresets() { return EQ_PRESETS; }
  function getEQBandValues() { return eqNodes.map(n => n ? n.gain.value : 0); }

  /* ======================== プレイログ ======================== */
  function savePlayLog() {
    if (!curTrackId || !logStart) return;
    const dur = (Date.now() - logStart) / 1000;
    logStart = 0;
    if (dur < 2) return;
    const log = { id: Utils.generateId(), trackId: curTrackId, startedAt: Date.now() - dur*1000, duration: dur };
    Store.addPlayLog(log);
    DB.savePlayLog(log).catch(() => {});
  }

  /* ======================== BGM シンセサイザー ======================== */
  async function renderBGM() {
    if (bgmRendering || bgmReady) return;
    if (!window.OfflineAudioContext && !window.webkitOfflineAudioContext) {
      console.warn('OfflineAudioContext not supported');
      return;
    }
    bgmRendering = true;
    try {
      const BPM=120, beat=60/BPM, bar=beat*4, total=bar*8;
      const sr = 44100;
      const OffCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offline = new OffCtx(2, Math.ceil(sr * total), sr);
      const master = offline.createGain(); master.gain.value = 0.35; master.connect(offline.destination);

      const N={
        C3:130.81,F3:174.61,G3:196.00,A3:220.00,B3:246.94,
        C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392.00,A4:440.00,B4:493.88,
        C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,
      };

      const piano=(freq,t,dur)=>{
        const o=offline.createOscillator(), g=offline.createGain(), f=offline.createBiquadFilter();
        f.type='lowpass'; f.frequency.value=3000; o.type='triangle'; o.frequency.value=freq;
        g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.55,t+0.01);
        g.gain.setValueAtTime(0.35,t+0.08); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
        const o2=offline.createOscillator(),g2=offline.createGain();
        o2.type='sine'; o2.frequency.value=freq*2;
        g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(0.12,t+0.01);
        g2.gain.exponentialRampToValueAtTime(0.001,t+dur*0.6);
        o2.connect(g2); g2.connect(master); o2.start(t); o2.stop(t+dur*0.6+0.05);
      };

      const bass=(freq,t,dur)=>{
        const o=offline.createOscillator(),g=offline.createGain(),f=offline.createBiquadFilter();
        f.type='lowpass'; f.frequency.value=220; f.Q.value=2; o.type='sawtooth'; o.frequency.value=freq/2;
        g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.55,t+0.03);
        g.gain.setValueAtTime(0.4,t+dur-0.1); g.gain.linearRampToValueAtTime(0,t+dur);
        o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
      };

      const pad=(freqs,t,dur)=>{
        freqs.forEach(freq=>{
          [0,5,-4].forEach(det=>{
            const o=offline.createOscillator(),g=offline.createGain(),f=offline.createBiquadFilter();
            f.type='lowpass'; f.frequency.value=700; o.type='sawtooth'; o.frequency.value=freq;
            o.detune.value=det;
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.09,t+0.6);
            g.gain.setValueAtTime(0.09,t+dur-0.5); g.gain.linearRampToValueAtTime(0,t+dur);
            o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.1);
          });
        });
      };

      const hihat=(t,v=0.3)=>{
        const buf=offline.createBuffer(1,2048,sr), data=buf.getChannelData(0);
        for(let i=0;i<2048;i++) data[i]=(Math.random()*2-1)*(1-i/2048);
        const src=offline.createBufferSource(); src.buffer=buf;
        const g=offline.createGain(); g.gain.value=v*0.12;
        const f=offline.createBiquadFilter(); f.type='highpass'; f.frequency.value=7000;
        src.connect(f); f.connect(g); g.connect(master); src.start(t);
      };

      const kick=(t)=>{
        const o=offline.createOscillator(),g=offline.createGain();
        o.type='sine'; o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(40,t+0.15);
        g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
        o.connect(g); g.connect(master); o.start(t); o.stop(t+0.35);
        const noise=offline.createBuffer(1,512,sr), nd=noise.getChannelData(0);
        for(let i=0;i<512;i++) nd[i]=(Math.random()*2-1)*(1-i/512);
        const ns=offline.createBufferSource(); ns.buffer=noise;
        const ng=offline.createGain(); ng.gain.value=0.25;
        const nf=offline.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=200; nf.Q.value=0.5;
        ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t);
      };

      const prog=[
        {chord:[N.C4,N.E4,N.G4], bass:N.C3, mel:[N.E5,N.G5,N.E5,N.C5]},
        {chord:[N.A3,N.C4,N.E4], bass:N.A3, mel:[N.A4,N.C5,N.E5,N.D5]},
        {chord:[N.F3,N.A3,N.C4], bass:N.F3, mel:[N.F4,N.A4,N.C5,N.A4]},
        {chord:[N.G3,N.B3,N.D4], bass:N.G3, mel:[N.G4,N.B4,N.D5,N.B4]},
      ];

      for(let rep=0;rep<2;rep++){
        prog.forEach((sec,i)=>{
          const t=rep*(total/2)+i*bar*2;
          pad(sec.chord,t,bar*2-0.1);
          bass(sec.bass,t,bar-0.05); bass(sec.bass,t+bar,bar-0.05);
          sec.mel.forEach((f,ni)=>{ piano(f,t+ni*beat,beat*0.82); piano(f*0.998,t+bar+ni*beat,beat*0.75); });
          for(let b=0;b<8;b++){
            const bt=t+b*beat;
            if(b%4===0||b%4===2) kick(bt);
            hihat(bt,0.5); hihat(bt+beat*0.5,0.2);
          }
        });
      }

      bgmBuffer = await offline.startRendering();
      bgmReady = true;
    } catch(e) { console.warn('BGM render failed:', e); }
    bgmRendering = false;
  }

  function startBGM(outputNode) {
    if (!bgmReady || !outputNode) return false;
    stopBGM();
    bgmSrcNode = audioCtx.createBufferSource();
    bgmSrcNode.buffer = bgmBuffer;
    bgmSrcNode.loop = true;
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.7;
    bgmSrcNode.connect(bgmGain);
    bgmGain.connect(outputNode);
    bgmSrcNode.start();
    return true;
  }

  function stopBGM() {
    if (bgmSrcNode) {
      try { bgmSrcNode.stop(); } catch(e) {}
      bgmSrcNode.disconnect();
      bgmSrcNode = null;
    }
  }

  function isBGMReady() { return bgmReady; }
  function isBGMRendering() { return bgmRendering; }
  function getAudioContext() { return audioCtx; }
  function getEQNodes() { return eqNodes; }
  function getGainNode() { return gainNode; }

  function isPlaying() { return !audio.paused; }
  function getCurrentTime() { return audio.currentTime || 0; }
  function getDuration() { return audio.duration || 0; }

  /* ======================== トラック削除時のクリーンアップ ======================== */
  function onTrackDeleted(trackId) {
    if (curTrackId === trackId) {
      pause();
      audio.src = '';
      if (curBlobUrl) { URL.revokeObjectURL(curBlobUrl); curBlobUrl = null; }
      curTrackId = null;
      Store.set('currentTrackId', null);
    }
  }

  return {
    init, play, pause, seek, next, prev, playTrack, loadTrack,
    setSpeed, setVolume, setLoopMode, setShuffle,
    setEQBand, setEQEnabled, applyEQPreset,
    getEQBands, getEQPresets, getEQBandValues,
    isPlaying, getCurrentTime, getDuration,
    on, off,
    renderBGM, startBGM, stopBGM, isBGMReady, isBGMRendering,
    getAudioContext, getEQNodes, getGainNode,
    ensureAudioContext,
    onTrackDeleted,
    EQ_PRESETS,
  };
})();
