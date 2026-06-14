'use strict';
/* ============================================================
   store.js – アプリケーション状態管理
   ============================================================ */
const Store = (() => {
  const DEFAULT_PLAYLIST_ID = 'all-tracks';

  const state = {
    /* データ */
    tracks: [],         // Track[]
    playlists: [],      // Playlist[]
    tags: [],           // Tag[] (ordered by tag.order)
    artists: [],        // Artist[]
    playLogs: [],       // PlayLog[]

    /* プレイヤー状態 */
    currentTrackId: null,
    currentPlaylistId: DEFAULT_PLAYLIST_ID,
    isPlaying: false,
    shuffle: false,
    loopMode: 'none',   // 'none' | 'one' | 'all'
    speed: 1,
    shuffleQueue: [],   // シャッフル時の再生順 (trackId[])
    shuffleIndex: 0,
    currentTime: 0,
    duration: 0,

    /* UI 状態 */
    currentScreen: 'player',
    orientation: 'landscape',

    /* プレイヤー画面 */
    playerSearch: '',
    playerSort: 'manual',
    playerSortAsc: true,
    isSelectMode: false,
    selectedTrackIds: new Set(),

    /* 情報編集画面 */
    infoView: 'songs',
    songSearch: '',
    songSort: 'added',
    songSortAsc: true,
    songCols: 4,

    /* ログ画面 */
    logPeriod: 'month',

    /* 設定 */
    settings: {
      eqEnabled: false,
      eqBands: [0,0,0,0,0,0,0],
      eqPreset: 'フラット',
      volume: 0.8,
    },
  };

  /* ======================== リスナー管理 ======================== */
  const listeners = new Map(); // key -> Set<fn>

  function subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  }

  function notify(key) {
    if (listeners.has(key)) listeners.get(key).forEach(fn => fn(state[key]));
    if (listeners.has('*')) listeners.get('*').forEach(fn => fn(key, state[key]));
  }

  function set(key, value) {
    state[key] = value;
    notify(key);
  }

  function get(key) { return state[key]; }

  /* ======================== トラック ======================== */
  function setTracks(tracks) { set('tracks', tracks); }
  function getTrack(id) { return state.tracks.find(t => t.id === id) || null; }
  function upsertTrack(track) {
    const idx = state.tracks.findIndex(t => t.id === track.id);
    const newTracks = [...state.tracks];
    if (idx >= 0) newTracks[idx] = { ...newTracks[idx], ...track };
    else newTracks.push(track);
    setTracks(newTracks);
  }
  function removeTrack(id) {
    setTracks(state.tracks.filter(t => t.id !== id));
    // プレイリストからも削除
    const newPlaylists = state.playlists.map(pl => ({
      ...pl, trackIds: pl.trackIds.filter(tid => tid !== id)
    }));
    setPlaylists(newPlaylists);
    if (state.currentTrackId === id) set('currentTrackId', null);
  }

  /* ======================== プレイリスト ======================== */
  function setPlaylists(playlists) { set('playlists', playlists); }
  function getPlaylist(id) { return state.playlists.find(pl => pl.id === id) || null; }
  function getCurrentPlaylist() { return getPlaylist(state.currentPlaylistId) || getPlaylist(DEFAULT_PLAYLIST_ID); }

  function upsertPlaylist(playlist) {
    const idx = state.playlists.findIndex(pl => pl.id === playlist.id);
    const newPls = [...state.playlists];
    if (idx >= 0) newPls[idx] = { ...newPls[idx], ...playlist };
    else newPls.push(playlist);
    setPlaylists(newPls);
  }

  function removePlaylist(id) {
    if (id === DEFAULT_PLAYLIST_ID) return;
    setPlaylists(state.playlists.filter(pl => pl.id !== id));
    if (state.currentPlaylistId === id) set('currentPlaylistId', DEFAULT_PLAYLIST_ID);
  }

  function addTracksToPlaylist(playlistId, trackIds) {
    const pl = getPlaylist(playlistId);
    if (!pl) return;
    const existing = new Set(pl.trackIds);
    const toAdd = trackIds.filter(id => !existing.has(id));
    upsertPlaylist({ ...pl, trackIds: [...pl.trackIds, ...toAdd] });
  }

  function removeTracksFromPlaylist(playlistId, trackIds) {
    const pl = getPlaylist(playlistId);
    if (!pl) return;
    const removeSet = new Set(trackIds);
    upsertPlaylist({ ...pl, trackIds: pl.trackIds.filter(id => !removeSet.has(id)) });
  }

  /* ======================== タグ ======================== */
  function setTags(tags) { set('tags', [...tags].sort((a,b) => a.order - b.order)); }
  function getTag(id) { return state.tags.find(t => t.id === id) || null; }
  function upsertTag(tag) {
    const idx = state.tags.findIndex(t => t.id === tag.id);
    const newTags = [...state.tags];
    if (idx >= 0) newTags[idx] = { ...newTags[idx], ...tag };
    else newTags.push({ ...tag, order: newTags.length });
    setTags(newTags);
  }
  function removeTag(id) {
    setTags(state.tags.filter(t => t.id !== id));
    // 全トラックからも削除
    const newTracks = state.tracks.map(t => ({
      ...t, tagIds: t.tagIds.filter(tid => tid !== id)
    }));
    setTracks(newTracks);
  }

  /* ======================== アーティスト ======================== */
  function setArtists(artists) { set('artists', artists); }
  function getArtist(id) { return state.artists.find(a => a.id === id) || null; }
  function upsertArtist(artist) {
    const idx = state.artists.findIndex(a => a.id === artist.id);
    const newArtists = [...state.artists];
    if (idx >= 0) newArtists[idx] = { ...newArtists[idx], ...artist };
    else newArtists.push(artist);
    setArtists(newArtists);
  }
  function removeArtist(id) {
    setArtists(state.artists.filter(a => a.id !== id));
    const newTracks = state.tracks.map(t => ({
      ...t, artistIds: t.artistIds.filter(aid => aid !== id)
    }));
    setTracks(newTracks);
  }

  /* ======================== プレイログ ======================== */
  function addPlayLog(log) {
    const newLogs = [...state.playLogs, log];
    set('playLogs', newLogs);
  }
  function setPlayLogs(logs) { set('playLogs', logs); }

  /* ======================== 設定 ======================== */
  function updateSettings(partial) {
    set('settings', { ...state.settings, ...partial });
  }

  /* ======================== 再生リスト内の表示用トラック取得 ======================== */
  function getPlaylistTracks(playlistId) {
    const pl = getPlaylist(playlistId || state.currentPlaylistId);
    if (!pl) return [];
    const trackMap = new Map(state.tracks.map(t => [t.id, t]));
    return pl.trackIds.map(id => trackMap.get(id)).filter(Boolean);
  }

  function getSortedTracks(playlistId) {
    const raw = playlistId === DEFAULT_PLAYLIST_ID
      ? state.tracks
      : getPlaylistTracks(playlistId);
    return applySort(raw, state.playerSort, state.playerSortAsc, playlistId);
  }

  function applySort(tracks, sortKey, asc, playlistId) {
    if (sortKey === 'manual') {
      const pl = getPlaylist(playlistId || state.currentPlaylistId);
      if (!pl) return [...tracks];
      const order = new Map(pl.trackIds.map((id,i) => [id,i]));
      return [...tracks].sort((a,b) => {
        const oa = order.has(a.id) ? order.get(a.id) : Infinity;
        const ob = order.has(b.id) ? order.get(b.id) : Infinity;
        return asc ? oa - ob : ob - oa;
      });
    }
    const keyMap = { added: 'addedAt', title: 'title', release: 'releaseDate' };
    const key = keyMap[sortKey] || 'addedAt';
    return [...tracks].sort(Utils.compareBy(key, asc));
  }

  /* ======================== ナビゲーション ======================== */
  function getNextTrackId() {
    const tracks = getSortedTracks(state.currentPlaylistId);
    if (!tracks.length) return null;
    if (state.shuffle && state.shuffleQueue.length) {
      const nextIdx = (state.shuffleIndex + 1) % state.shuffleQueue.length;
      set('shuffleIndex', nextIdx);
      return state.shuffleQueue[nextIdx];
    }
    const idx = tracks.findIndex(t => t.id === state.currentTrackId);
    const nextIdx = (idx + 1) % tracks.length;
    return tracks[nextIdx]?.id || null;
  }

  function getPrevTrackId() {
    const tracks = getSortedTracks(state.currentPlaylistId);
    if (!tracks.length) return null;
    if (state.shuffle && state.shuffleQueue.length) {
      const prevIdx = (state.shuffleIndex - 1 + state.shuffleQueue.length) % state.shuffleQueue.length;
      set('shuffleIndex', prevIdx);
      return state.shuffleQueue[prevIdx];
    }
    const idx = tracks.findIndex(t => t.id === state.currentTrackId);
    const prevIdx = (idx - 1 + tracks.length) % tracks.length;
    return tracks[prevIdx]?.id || null;
  }

  function rebuildShuffleQueue() {
    const tracks = getSortedTracks(state.currentPlaylistId);
    const ids = tracks.map(t => t.id);
    const shuffled = Utils.shuffle(ids);
    // 現在のトラックを先頭に
    const cur = state.currentTrackId;
    if (cur) {
      const idx = shuffled.indexOf(cur);
      if (idx > 0) { shuffled.splice(idx, 1); shuffled.unshift(cur); }
    }
    set('shuffleQueue', shuffled);
    set('shuffleIndex', 0);
  }

  /* ======================== 永続化ヘルパー ======================== */
  async function persistTracks() {
    for (const t of state.tracks) await DB.saveTrack(t);
  }
  async function persistPlaylists() {
    await DB.savePlaylists(state.playlists);
  }
  async function persistTags() {
    await DB.saveTags(state.tags);
  }
  async function persistArtists() {
    await DB.saveArtists(state.artists);
  }

  return {
    get, set, subscribe, notify,
    DEFAULT_PLAYLIST_ID,

    setTracks, getTrack, upsertTrack, removeTrack,
    setPlaylists, getPlaylist, getCurrentPlaylist, upsertPlaylist, removePlaylist,
    addTracksToPlaylist, removeTracksFromPlaylist,
    setTags, getTag, upsertTag, removeTag,
    setArtists, getArtist, upsertArtist, removeArtist,
    addPlayLog, setPlayLogs,
    updateSettings,

    getPlaylistTracks, getSortedTracks, applySort,
    getNextTrackId, getPrevTrackId, rebuildShuffleQueue,
    persistTracks, persistPlaylists, persistTags, persistArtists,
  };
})();
