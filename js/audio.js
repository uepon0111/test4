import { createEqualizer, EQ_PRESETS } from './equalizer.js';
import { formatDuration } from './utils.js';

export function createAudioEngine({ onChange = () => {}, onEnded = () => {}, onTime = () => {}, onCommit = () => {} } = {}) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  const eq = createEqualizer(audio);
  let currentObjectUrl = '';
  let currentSourceKind = 'blob';
  let queue = [];
  let queueIndex = -1;
  let shuffleOrder = [];
  let currentTrack = null;
  let currentPlaylistId = 'all';
  let playingSince = 0;
  let currentRate = 1;
  let lastVolume = 1;
  let suppressCommit = false;

  function emit(extra = {}) {
    onChange({
      currentTrackId: currentTrack?.id || null,
      isPlaying: !audio.paused && !audio.ended,
      currentTime: audio.currentTime || 0,
      duration: audio.duration || 0,
      rate: audio.playbackRate || currentRate,
      queue,
      queueIndex,
      ...extra,
    });
  }

  function revoke() {
    if (currentSourceKind === 'blob' && currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = '';
  }

  async function setBlobSource(blob) {
    revoke();
    currentSourceKind = 'blob';
    currentObjectUrl = URL.createObjectURL(blob);
    audio.src = currentObjectUrl;
  }

  async function setUrlSource(url) {
    revoke();
    currentSourceKind = 'url';
    currentObjectUrl = url;
    audio.src = url;
  }

  function rebuildShuffle() {
    shuffleOrder = queue.map((_, i) => i);
    for (let i = shuffleOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
    if (queueIndex >= 0) {
      const idx = shuffleOrder.indexOf(queueIndex);
      if (idx >= 0) queueIndex = shuffleOrder[idx];
    }
  }

  function resolveIndexByTrackId(trackId) {
    return queue.findIndex((t) => t.id === trackId);
  }

  function setQueue(tracks, currentTrackId = null, playlistId = 'all', shuffle = false) {
    queue = [...tracks];
    currentPlaylistId = playlistId;
    queueIndex = currentTrackId ? resolveIndexByTrackId(currentTrackId) : (queue.length ? 0 : -1);
    if (shuffle) rebuildShuffle();
  }

  async function loadTrack(track, autoPlay = true) {
    if (!track) return;
    currentTrack = track;
    await setBlobSource(track.fileBlob);
    audio.playbackRate = currentRate;
    await eq.resume().catch(() => {});
    if (autoPlay) {
      await play();
    } else {
      emit();
    }
  }

  async function loadSample(url, label = '') {
    currentTrack = { id: `sample:${label}`, title: label || url, artistName: '試聴サンプル' };
    await setUrlSource(url);
    audio.loop = false;
    audio.playbackRate = currentRate;
    await eq.resume().catch(() => {});
    await play();
  }

  async function play() {
    await eq.resume().catch(() => {});
    if (!audio.src) return;
    try {
      await audio.play();
      playingSince = Date.now();
      emit();
    } catch (e) {
      emit({ error: e?.message || '再生できませんでした' });
    }
  }

  function pause() {
    audio.pause();
    const elapsed = Date.now() - playingSince;
    if (!suppressCommit && currentTrack?.id && elapsed > 1500) onCommit(currentTrack, elapsed, currentPlaylistId);
    emit();
  }

  function stop() {
    audio.pause();
    audio.currentTime = 0;
    revoke();
    audio.removeAttribute('src');
    audio.load();
    const elapsed = Date.now() - playingSince;
    if (!suppressCommit && currentTrack?.id && elapsed > 1500) onCommit(currentTrack, elapsed, currentPlaylistId);
    emit();
  }

  function togglePlay() { return audio.paused ? play() : pause(); }

  async function playTrack(track, tracks = queue, index = null, playlistId = currentPlaylistId) {
    if (Array.isArray(tracks) && tracks.length) setQueue(tracks, track?.id || null, playlistId, false);
    else setQueue(queue, track?.id || null, playlistId, false);
    if (index != null) queueIndex = index;
    await loadTrack(track, true);
  }

  async function next() {
    if (!queue.length) return;
    if (shuffleOrder.length === queue.length && shuffleOrder.length) {
      const idx = shuffleOrder.indexOf(queueIndex);
      const nextIdx = idx < shuffleOrder.length - 1 ? shuffleOrder[idx + 1] : -1;
      if (nextIdx >= 0) queueIndex = nextIdx;
      else if (audio.loop) queueIndex = shuffleOrder[0];
      else return stop();
    } else {
      if (queueIndex < queue.length - 1) queueIndex += 1;
      else if (audio.loop) queueIndex = 0;
      else return stop();
    }
    currentTrack = queue[queueIndex];
    await loadTrack(currentTrack, true);
  }

  async function prev() {
    if (!queue.length) return;
    if (audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    if (queueIndex > 0) queueIndex -= 1;
    else if (audio.loop) queueIndex = queue.length - 1;
    else return;
    currentTrack = queue[queueIndex];
    await loadTrack(currentTrack, true);
  }

  function setRate(rate) {
    currentRate = rate;
    audio.playbackRate = rate;
  }

  function setLoop(loop) { audio.loop = !!loop; }
  function setShuffle(shuffle) { if (shuffle) rebuildShuffle(); }
  function setVolume(v) { audio.volume = v; lastVolume = v; }

  function setEqBands(bands) { eq.applyBands(bands); }

  audio.addEventListener('timeupdate', () => onTime({ currentTime: audio.currentTime || 0, duration: audio.duration || 0 }));
  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  audio.addEventListener('ended', async () => {
    const elapsed = Date.now() - playingSince;
    if (currentTrack?.id && elapsed > 1500) onCommit(currentTrack, elapsed, currentPlaylistId);
    onEnded(currentTrack);
    emit();
    if (!audio.loop) {
      const prevSuppress = suppressCommit;
      suppressCommit = true;
      await next();
      suppressCommit = prevSuppress;
    }
  });
  audio.addEventListener('loadedmetadata', emit);
  audio.addEventListener('ratechange', emit);

  return {
    audio,
    eq,
    setQueue,
    playTrack,
    play,
    pause,
    stop,
    togglePlay,
    next,
    prev,
    setRate,
    setLoop,
    setShuffle,
    setVolume,
    setEqBands,
    setBlobSource,
    loadSample,
    formatStatus() {
      const dur = Number.isFinite(audio.duration) ? formatDuration(audio.duration) : '0:00';
      const cur = formatDuration(audio.currentTime || 0);
      return `${cur} / ${dur}`;
    },
    getCurrentTrack() { return currentTrack; },
    getQueue() { return queue; },
    getQueueIndex() { return queueIndex; },
    setCurrentFromQueue(trackId) { queueIndex = resolveIndexByTrackId(trackId); currentTrack = queue[queueIndex] || currentTrack; },
    setCurrentTrack(track) { currentTrack = track; },
    get currentTrack() { return currentTrack; },
    get shuffle() { return shuffleOrder.length > 0; },
    get loop() { return audio.loop; },
    get rate() { return currentRate; },
    get volume() { return lastVolume; },
  };
}
