import { icon } from './icons.js';
import { state, emit } from './state.js';
import {
  initStorage, loadAllData, addTracks, updateTrack, deleteTrack, createPlaylist, updatePlaylist, deletePlaylist,
  addTrackToPlaylist, reorderPlaylist, createTag, updateTag, deleteTag, createArtist, updateArtist, deleteArtist,
  setTrackArtists, setTrackTags, addPlayLog, clearAllData, estimateStorage, saveSettings, DEFAULT_PLAYLIST_ID,
} from './storage.js';
import { readMetadata, getDuration } from './metadata.js';
import { createAudioEngine } from './audio.js';
import { renderPlayerScreen, getPlaylistTracks, renderPlayerTrackRow, getVisiblePlayerTrackIds } from './player.js';
import { renderEditorScreen, getEditorTracks, renderEditorTrackCard } from './editor.js';
import { renderLogScreen } from './log.js';
import { renderSettingsScreen, getPresetBands } from './settings.js';
import { bindVirtualList } from './virtual-scroll.js';
import { renderModals } from './modals.js';
import { DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, uid, readFileAsDataURL, normalizeText } from './utils.js';

const tabs = [
  { id: 'player', label: 'プレイヤー', icon: 'player' },
  { id: 'editor', label: '編集', icon: 'edit' },
  { id: 'log', label: 'ログ', icon: 'log' },
  { id: 'settings', label: '設定', icon: 'settings' },
];

const app = document.getElementById('app');
const tabRail = document.getElementById('tabRail');
const modalRoot = document.getElementById('modal-root');
const screens = {
  player: document.getElementById('screen-player'),
  editor: document.getElementById('screen-editor'),
  log: document.getElementById('screen-log'),
  settings: document.getElementById('screen-settings'),
};

let storageEstimate = { usage: 0, quota: 0 };
let renderQueued = false;
let audioEngine = null;

function orientationFromWindow() {
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

function syncSettingsFromStorage(settings) {
  state.eq.enabled = settings.eqEnabled !== false;
  state.eq.preset = settings.eqPreset || 'normal';
  state.eq.bands = Array.isArray(settings.eqBands) ? settings.eqBands : getPresetBands(state.eq.preset);
  state.eq.custom = Array.isArray(settings.eqCustom) ? settings.eqCustom : state.eq.bands.slice();
  state.eq.sample = settings.eqSample || 'sample1';
  state.filters.player.columns = settings.playerColumns || (state.orientation === 'portrait' ? 2 : 4);
  state.filters.editor.columns = settings.editorColumns || (state.orientation === 'portrait' ? 2 : 4);
}

async function refreshData() {
  const data = await loadAllData();
  state.data = data;
  syncSettingsFromStorage(data.settings || {});
  if (!state.ui.playlistId || !state.data.playlists.some((p) => p.id === state.ui.playlistId)) {
    state.ui.playlistId = DEFAULT_PLAYLIST_ID;
  }
  const validTrackIds = new Set(state.data.tracks.map((t) => t.id));
  state.ui.trackSelection = (state.ui.trackSelection || []).filter((id) => validTrackIds.has(id));
  storageEstimate = await estimateStorage();
  state.ui.storageEstimate = storageEstimate;
  emit();
}

function persistUiSettings() {
  return saveSettings({
    eqEnabled: state.eq.enabled,
    eqPreset: state.eq.preset,
    eqBands: state.eq.bands,
    eqCustom: state.eq.custom,
    eqSample: state.eq.sample,
    playerColumns: state.filters.player.columns,
    editorColumns: state.filters.editor.columns,
  });
}

function setModal(modal) {
  state.ui.modal = modal;
  emit();
}

function showToast(text) {
  state.ui.toast = text;
  emit();
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    if (state.ui.toast === text) {
      state.ui.toast = '';
      emit();
    }
  }, 1800);
}

function renderTabs() {
  tabRail.innerHTML = tabs.map((t) => `
    <button class="tab-btn ${state.tab === t.id ? 'is-active' : ''}" data-action="tab-switch" data-tab="${t.id}">
      ${icon(t.icon)}
      <span>${t.label}</span>
    </button>`).join('');
}

function renderScreens() {
  Object.entries(screens).forEach(([id, el]) => {
    el.classList.toggle('is-active', state.tab === id);
  });
  screens.player.innerHTML = renderPlayerScreen(state);
  screens.editor.innerHTML = renderEditorScreen(state);
  screens.log.innerHTML = renderLogScreen(state);
  screens.settings.innerHTML = renderSettingsScreen(state, storageEstimate);
  modalRoot.innerHTML = renderModals(state);
  if (state.ui.toast) {
    const existing = document.getElementById('toast-node');
    if (!existing) {
      const toast = document.createElement('div');
      toast.id = 'toast-node';
      toast.className = 'toast';
      toast.textContent = state.ui.toast;
      app.appendChild(toast);
      setTimeout(() => toast.remove(), 1700);
    } else {
      existing.textContent = state.ui.toast;
    }
  } else {
    document.getElementById('toast-node')?.remove();
  }
  bindLists();
}

function bindLists() {
  const playlistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
  const selectedPlaylist = state.data.playlists.find((p) => p.id === playlistId) || state.data.playlists[0];
  const playerList = document.getElementById('playerTrackList');
  if (playerList && selectedPlaylist) {
    const tracks = getPlaylistTracks(state, selectedPlaylist.id, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false);
    bindVirtualList(playerList, tracks, (pair, index) => renderPlayerTrackRow(state, pair, index), { key: 'player', itemHeight: 126 });
  }
  const editorList = document.getElementById('editorTrackList');
  if (editorList && state.filters.editor.view === 'tracks') {
    const tracks = getEditorTracks(state);
    bindVirtualList(editorList, tracks, (track) => renderEditorTrackCard(state, track), { key: 'editor', itemHeight: 216 });
  }
}

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderTabs();
    renderScreens();
    applyPlayerSettingsToEngine();
  });
}

function updateOrientation() {
  state.orientation = orientationFromWindow();
  state.filters.player.columns = state.orientation === 'portrait' ? (state.filters.player.columns > 2 ? 2 : state.filters.player.columns || 2) : (state.filters.player.columns < 4 ? 4 : state.filters.player.columns || 4);
  state.filters.editor.columns = state.orientation === 'portrait' ? (state.filters.editor.columns > 3 ? 2 : state.filters.editor.columns || 2) : (state.filters.editor.columns < 4 ? 4 : state.filters.editor.columns || 4);
  app.classList.toggle('portrait', state.orientation === 'portrait');
  app.classList.toggle('landscape', state.orientation === 'landscape');
  requestRender();
}

function applyPlayerSettingsToEngine() {
  if (!audioEngine) return;
  audioEngine.setEqBands(state.eq.bands || []);
  audioEngine.eq.setEnabled(state.eq.enabled !== false);
  audioEngine.setRate(state.player.rate || 1);
  audioEngine.setLoop(!!state.player.loop);
  audioEngine.setShuffle(!!state.player.shuffle);
  const currentPlaylistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
  const selectedPlaylist = state.data.playlists.find((p) => p.id === currentPlaylistId) || state.data.playlists[0];
  if (selectedPlaylist) {
    const tracks = getPlaylistTracks(state, selectedPlaylist.id, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false).map((p) => p.track);
    audioEngine.setQueue(tracks, state.player.currentTrackId, selectedPlaylist.id, !!state.player.shuffle);
  }
}

async function handleUpload(files) {
  const valid = [...files].filter((f) => f && f.type.startsWith('audio/'));
  if (!valid.length) return;
  const upload = { type: 'upload', files: valid.map((file) => ({ name: file.name, meta: {}, progress: 0 })), progress: Array(valid.length).fill(0), current: 0, done: false };
  setModal(upload);
  const created = [];
  for (let i = 0; i < valid.length; i += 1) {
    const file = valid[i];
    state.ui.modal = { ...state.ui.modal, current: i, files: state.ui.modal.files.map((item, idx) => idx === i ? { ...item, progress: 0.1 } : item), progress: [...state.ui.modal.progress] };
    emit();
    const meta = await readMetadata(file, (ratio) => {
      if (!state.ui.modal || state.ui.modal.type !== 'upload') return;
      const progress = [...state.ui.modal.progress];
      progress[i] = Math.max(progress[i] || 0, ratio * 0.6);
      const filesState = state.ui.modal.files.map((item, idx) => idx === i ? { ...item, progress: progress[i] } : item);
      state.ui.modal = { ...state.ui.modal, progress, files: filesState };
      emit();
    });
    const duration = await getDuration(file);
    const track = {
      id: uid('track'),
      fileBlob: file,
      fileName: file.name,
      mime: file.type,
      size: file.size,
      duration,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
      artistIds: [],
      artistName: meta.artist || DEFAULT_ARTIST_NAME,
      tagIds: [],
      releasedAt: meta.releasedAt || '',
      thumbnail: meta.thumbnail || DEFAULT_THUMBNAIL,
    };
    if (track.artistName && track.artistName !== DEFAULT_ARTIST_NAME) {
      let artist = state.data.artists.find((a) => normalizeText(a.name) === normalizeText(track.artistName));
      if (!artist) artist = await createArtist({ name: track.artistName, icon: '' });
      track.artistIds = [artist.id];
    }
    await addTracks([track]);
    created.push(track);
    state.ui.modal.progress[i] = 1;
    state.ui.modal.files[i] = { ...state.ui.modal.files[i], progress: 1, meta: { ...meta, title: track.title, artist: track.artistName } };
    emit();
  }
  state.ui.modal.done = true;
  emit();
  await refreshData();
  showToast(`${created.length} 件のファイルを追加しました`);
  setModal(null);
}

async function handleSaveTrack(form) {
  const fd = new FormData(form);
  const trackId = String(fd.get('trackId') || '');
  if (!trackId) return;
  const track = state.data.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const title = String(fd.get('title') || '').trim() || track.title;
  const releasedAt = String(fd.get('releasedAt') || '').trim();
  const artistText = String(fd.get('artistText') || '').trim();
  const selectedArtistIds = fd.getAll('artistIds').map(String).filter(Boolean);
  const selectedTagIds = fd.getAll('tagIds').map(String).filter(Boolean);
  let thumbnail = track.thumbnail || DEFAULT_THUMBNAIL;
  const file = form.querySelector('input[name="thumbnailFile"]')?.files?.[0];
  if (file) thumbnail = await readFileAsDataURL(file);
  else {
    const text = String(fd.get('thumbnailText') || '').trim();
    if (text) thumbnail = text;
  }
  const finalArtistIds = [...selectedArtistIds];
  if (artistText) {
    let artist = state.data.artists.find((a) => normalizeText(a.name) === normalizeText(artistText));
    if (!artist) artist = await createArtist({ name: artistText, icon: '' });
    if (!finalArtistIds.includes(artist.id)) finalArtistIds.push(artist.id);
  }
  await updateTrack(trackId, { title, releasedAt, thumbnail });
  await setTrackArtists(trackId, finalArtistIds);
  await setTrackTags(trackId, selectedTagIds);
  await refreshData();
  showToast('曲情報を保存しました');
  setModal(null);
}

async function handleSaveTag(form) {
  const fd = new FormData(form);
  const id = String(fd.get('tagId') || '');
  const name = String(fd.get('name') || '').trim();
  const color = String(fd.get('color') || '#2f6fed');
  if (id) await updateTag(id, { name, color }); else await createTag({ name, color });
  await refreshData();
  setModal(null);
  showToast('タグを保存しました');
}

async function handleSaveArtist(form) {
  const fd = new FormData(form);
  const id = String(fd.get('artistId') || '');
  const name = String(fd.get('name') || '').trim();
  let iconUrl = String(fd.get('iconText') || '').trim();
  const file = form.querySelector('input[name="iconFile"]')?.files?.[0];
  if (file) iconUrl = await readFileAsDataURL(file);
  if (id) await updateArtist(id, { name, icon: iconUrl }); else await createArtist({ name, icon: iconUrl });
  await refreshData();
  setModal(null);
  showToast('アーティストを保存しました');
}

async function handleSavePlaylist(form) {
  const fd = new FormData(form);
  const id = String(fd.get('playlistId') || '');
  const name = String(fd.get('name') || '').trim();
  if (id) await updatePlaylist(id, { name }); else await createPlaylist(name);
  await refreshData();
  setModal(null);
  showToast('再生リストを保存しました');
}

async function handleBulkPlaylist(form) {
  const fd = new FormData(form);
  const playlistId = String(fd.get('playlistId') || '');
  const trackIds = state.ui.modal?.trackIds || state.ui.trackSelection || [];
  for (const trackId of trackIds) await addTrackToPlaylist(playlistId, trackId);
  await refreshData();
  setModal(null);
  showToast('再生リストに追加しました');
}

async function handleBulkTags(form) {
  const fd = new FormData(form);
  const tagIds = fd.getAll('tagIds').map(String).filter(Boolean);
  const trackIds = state.ui.modal?.trackIds || state.ui.trackSelection || [];
  for (const trackId of trackIds) {
    const track = state.data.tracks.find((t) => t.id === trackId);
    if (!track) continue;
    await setTrackTags(trackId, [...new Set([...(track.tagIds || []), ...tagIds])]);
  }
  await refreshData();
  setModal(null);
  showToast('タグを付与しました');
}

async function deleteSelectedTracks(ids) {
  const currentDeleted = ids.includes(state.player.currentTrackId);
  for (const id of ids) await deleteTrack(id);
  if (currentDeleted) {
    try { audioEngine.stop(); } catch {}
    state.player.currentTrackId = null;
  }
  state.ui.trackSelection = [];
  await refreshData();
  showToast('削除しました');
}

function cycle(list, current, dir = 1) {
  const idx = Math.max(0, list.indexOf(current));
  return list[(idx + dir + list.length) % list.length];
}

function visiblePlayerIds() {
  return getVisiblePlayerTrackIds(state);
}

async function restoreAfterSample() {
  const restore = state.ui.sampleRestore;
  if (!restore) return;
  state.player.sampleMode = false;
  state.ui.sampleRestore = null;
  const track = state.data.tracks.find((t) => t.id === restore.trackId);
  if (track) {
    const playlistId = restore.playlistId || state.ui.playlistId || DEFAULT_PLAYLIST_ID;
    const playlistTracks = getPlaylistTracks(state, playlistId, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false).map((p) => p.track);
    await audioEngine.playTrack(track, playlistTracks, restore.index ?? playlistTracks.findIndex((t) => t.id === track.id), playlistId);
    if (!restore.isPlaying) audioEngine.pause();
  }
}

async function handleClick(actionEl, event) {
  const action = actionEl.dataset.action;
  const trackId = actionEl.dataset.trackId;
  const tagId = actionEl.dataset.tagId;
  const artistId = actionEl.dataset.artistId;
  const dir = actionEl.dataset.dir;
  const value = actionEl.dataset.value;
  switch (action) {
    case 'tab-switch':
      state.tab = actionEl.dataset.tab || 'player';
      break;
    case 'player-toggle':
      await audioEngine.togglePlay();
      break;
    case 'player-prev':
      await audioEngine.prev();
      break;
    case 'player-next':
      await audioEngine.next();
      break;
    case 'player-shuffle':
      state.player.shuffle = !state.player.shuffle;
      audioEngine.setShuffle(state.player.shuffle);
      break;
    case 'player-loop':
      state.player.loop = !state.player.loop;
      audioEngine.setLoop(state.player.loop);
      break;
    case 'player-rate':
      state.player.rate = Number(value || 1);
      audioEngine.setRate(state.player.rate);
      break;
    case 'player-sort':
      state.filters.player.sort = cycle(['manual', 'addedAt', 'title', 'releasedAt'], state.filters.player.sort || 'manual');
      break;
    case 'player-toggle-order':
      state.filters.player.asc = !(state.filters.player.asc !== false);
      break;
    case 'player-selection-mode': {
      const ids = visiblePlayerIds();
      const allSelected = ids.length && ids.every((id) => state.ui.trackSelection.includes(id));
      state.ui.trackSelection = allSelected ? [] : ids;
      break;
    }
    case 'select-visible-tracks':
      state.ui.trackSelection = visiblePlayerIds();
      break;
    case 'clear-track-selection':
      state.ui.trackSelection = [];
      break;
    case 'select-playlist':
      state.ui.playlistId = actionEl.dataset.id || DEFAULT_PLAYLIST_ID;
      state.ui.trackSelection = [];
      break;
    case 'create-playlist':
      setModal({ type: 'playlist', playlist: null });
      return;
    case 'edit-playlist': {
      const playlist = state.data.playlists.find((p) => p.id === (state.ui.playlistId || DEFAULT_PLAYLIST_ID));
      if (!playlist || playlist.isDefault) { showToast('既定リストは編集できません'); return; }
      setModal({ type: 'playlist', playlist });
      return;
    }
    case 'delete-playlist': {
      const playlist = state.data.playlists.find((p) => p.id === (state.ui.playlistId || DEFAULT_PLAYLIST_ID));
      if (!playlist || playlist.isDefault) { showToast('既定リストは削除できません'); return; }
      if (confirm('この再生リストを削除しますか？')) { await deletePlaylist(playlist.id); if (state.ui.playlistId === playlist.id) state.ui.playlistId = DEFAULT_PLAYLIST_ID; await refreshData(); showToast('再生リストを削除しました'); }
      return;
    }
    case 'open-upload':
      setModal({ type: 'upload', files: [], progress: [], current: 0, done: false });
      pickFiles();
      return;
    case 'trigger-file-picker':
      pickFiles();
      return;
    case 'play-track': {
      const playlistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
      const selectedPlaylist = state.data.playlists.find((p) => p.id === playlistId) || state.data.playlists[0];
      if (!selectedPlaylist) return;
      const pairs = getPlaylistTracks(state, selectedPlaylist.id, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false);
      const idx = pairs.findIndex((p) => p.track.id === trackId);
      if (idx >= 0) await audioEngine.playTrack(pairs[idx].track, pairs.map((p) => p.track), idx, selectedPlaylist.id);
      return;
    }
    case 'add-to-playlist':
      setModal({ type: 'bulk-playlist', trackIds: [trackId] });
      return;
    case 'bulk-add-to-playlist':
      setModal({ type: 'bulk-playlist', trackIds: state.ui.trackSelection.slice() });
      return;
    case 'bulk-add-tags':
      setModal({ type: 'bulk-tags', trackIds: state.ui.trackSelection.slice() });
      return;
    case 'bulk-delete-tracks':
      if (state.ui.trackSelection.length) {
        if (confirm('選択中の曲を削除しますか？')) await deleteSelectedTracks(state.ui.trackSelection.slice());
      }
      return;
    case 'edit-track':
      setModal({ type: 'track', track: state.data.tracks.find((t) => t.id === trackId) });
      return;
    case 'delete-track':
      if (confirm('この曲を削除しますか？')) await deleteSelectedTracks([trackId]);
      return;
    case 'move-track': {
      const playlistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
      const pairs = getPlaylistTracks(state, playlistId, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false).map((p) => p.track.id);
      const idx = pairs.indexOf(trackId);
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= pairs.length) return;
      [pairs[idx], pairs[target]] = [pairs[target], pairs[idx]];
      await reorderPlaylist(playlistId, pairs);
      await refreshData();
      return;
    }
    case 'editor-view':
      state.filters.editor.view = actionEl.dataset.view || 'tracks';
      break;
    case 'editor-sort':
      state.filters.editor.sort = cycle(['updatedAt', 'title', 'releasedAt'], state.filters.editor.sort || 'updatedAt');
      break;
    case 'editor-toggle-order':
      state.filters.editor.asc = !(state.filters.editor.asc !== false);
      break;
    case 'editor-toggle-columns':
      state.filters.editor.columns = state.orientation === 'portrait' ? (state.filters.editor.columns === 2 ? 3 : 2) : (state.filters.editor.columns === 4 ? 6 : 4);
      break;
    case 'create-tag':
      setModal({ type: 'tag', tag: null });
      return;
    case 'create-artist':
      setModal({ type: 'artist', artist: null });
      return;
    case 'edit-tag':
      setModal({ type: 'tag', tag: state.data.tags.find((t) => t.id === tagId) });
      return;
    case 'edit-artist':
      setModal({ type: 'artist', artist: state.data.artists.find((a) => a.id === artistId) });
      return;
    case 'delete-tag':
      if (confirm('このタグを削除しますか？関連曲からも外れます。')) { await deleteTag(tagId); await refreshData(); }
      return;
    case 'delete-artist':
      if (confirm('このアーティストを削除しますか？関連曲からも外れます。')) { await deleteArtist(artistId); await refreshData(); }
      return;
    case 'move-tag': {
      const tags = [...state.data.tags].sort((a,b)=>(a.order??0)-(b.order??0));
      const idx = tags.findIndex((t) => t.id === tagId);
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= tags.length) return;
      [tags[idx].order, tags[target].order] = [tags[target].order, tags[idx].order];
      for (const tag of tags) await updateTag(tag.id, { order: tag.order });
      await refreshData();
      return;
    }
    case 'move-artist': {
      const artists = [...state.data.artists].filter((a) => !a.isSystem).sort((a,b)=>(a.order??0)-(b.order??0));
      const idx = artists.findIndex((a) => a.id === artistId);
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= artists.length) return;
      [artists[idx].order, artists[target].order] = [artists[target].order, artists[idx].order];
      for (const artist of artists) await updateArtist(artist.id, { order: artist.order });
      await refreshData();
      return;
    }
    case 'log-period':
      state.filters.log.period = value;
      break;
    case 'clear-app-data':
      setModal({ type: 'confirm-clear' });
      return;
    case 'confirm-clear-data':
      await clearAllData();
      state.player.currentTrackId = null;
      state.ui.trackSelection = [];
      state.ui.modal = null;
      state.player.sampleMode = false;
      await refreshData();
      showToast('データを削除しました');
      return;
    case 'refresh-storage':
      storageEstimate = await estimateStorage();
      state.ui.storageEstimate = storageEstimate;
      break;
    case 'eq-preset': {
      const preset = value || 'normal';
      state.eq.preset = preset;
      state.eq.bands = getPresetBands(preset).slice();
      state.eq.custom = state.eq.bands.slice();
      await persistUiSettings();
      break;
    }
    case 'eq-reset':
      state.eq.preset = 'normal';
      state.eq.bands = getPresetBands('normal').slice();
      state.eq.custom = state.eq.bands.slice();
      await persistUiSettings();
      break;
    case 'eq-toggle':
      state.eq.enabled = !state.eq.enabled;
      await persistUiSettings();
      break;
    case 'sample-play': {
      const sample = value || actionEl.dataset.sample || 'sample1';
      state.ui.sampleRestore = {
        trackId: state.player.currentTrackId,
        isPlaying: state.player.isPlaying,
        playlistId: state.ui.playlistId,
        index: audioEngine?.getQueueIndex?.() ?? -1,
      };
      state.player.sampleMode = true;
      state.eq.sample = sample;
      audioEngine.loadSample(`./assets/samples/${sample}.wav`, sample);
      await persistUiSettings();
      break;
    }
    case 'sample-stop':
      await audioEngine.stop();
      await restoreAfterSample();
      break;
    case 'expand-player':
      state.ui.simplePlayerOpen = true;
      break;
    case 'close-modal':
      setModal(null);
      return;
    default:
      return;
  }
  emit();
}

async function handleChange(el) {
  const action = el.dataset.action;
  if (action === 'toggle-track-select') {
    const id = el.dataset.trackId;
    if (el.checked) {
      if (!state.ui.trackSelection.includes(id)) state.ui.trackSelection.push(id);
    } else {
      state.ui.trackSelection = state.ui.trackSelection.filter((x) => x !== id);
    }
    emit();
    return;
  }
  if (action === 'eq-band') {
    const idx = Number(el.dataset.index);
    const value = Number(el.value);
    state.eq.bands[idx] = value;
    state.eq.preset = 'custom';
    state.eq.custom = state.eq.bands.slice();
    audioEngine.setEqBands(state.eq.bands);
    await persistUiSettings();
    emit();
    return;
  }
  if (action === 'player-search') {
    state.filters.player.query = el.value;
    state.ui.trackSelection = [];
    emit();
    return;
  }
  if (action === 'editor-search') {
    state.filters.editor.query = el.value;
    emit();
    return;
  }
}

async function handleSubmit(form) {
  const action = form.dataset.action;
  if (action === 'save-track') return handleSaveTrack(form);
  if (action === 'save-tag') return handleSaveTag(form);
  if (action === 'save-artist') return handleSaveArtist(form);
  if (action === 'save-playlist') return handleSavePlaylist(form);
  if (action === 'bulk-save-playlist') return handleBulkPlaylist(form);
  if (action === 'bulk-save-tags') return handleBulkTags(form);
}

async function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'audio/*';
  input.onchange = () => handleUpload(input.files || []);
  input.click();
}

function ensureDropHandlers() {
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    await handleUpload(e.dataTransfer.files);
  });
}

function updatePlayerStateFromEngine(payload) {
  state.player.currentTrackId = payload.currentTrackId ?? state.player.currentTrackId;
  state.player.isPlaying = payload.isPlaying;
  state.player.currentTime = payload.currentTime ?? state.player.currentTime;
  state.player.duration = payload.duration ?? state.player.duration;
  state.player.rate = payload.rate ?? state.player.rate;
  emit();
}

async function init() {
  await initStorage();
  await refreshData();
  state.orientation = orientationFromWindow();
  app.classList.toggle('portrait', state.orientation === 'portrait');
  app.classList.toggle('landscape', state.orientation === 'landscape');
  audioEngine = createAudioEngine({
    onChange: updatePlayerStateFromEngine,
    onEnded: async () => {
      if (state.player.sampleMode) {
        await restoreAfterSample();
      }
    },
    onTime: ({ currentTime, duration }) => {
      state.player.currentTime = currentTime;
      state.player.duration = duration;
      emit();
    },
    onCommit: async (track, playMs, playlistId) => {
      if (!track || String(track.id || '').startsWith('sample:')) return;
      const log = { trackId: track.id, playedAt: Date.now(), playMs, playlistId };
      await addPlayLog(log);
      state.data.playLogs.push(log);
      emit();
    },
  });
  audioEngine.setEqBands(state.eq.bands || []);
  audioEngine.eq.setEnabled(state.eq.enabled !== false);
  audioEngine.setRate(state.player.rate || 1);
  audioEngine.setLoop(!!state.player.loop);
  audioEngine.setShuffle(!!state.player.shuffle);
  ensureDropHandlers();
  updateOrientation();
  window.addEventListener('resize', updateOrientation);
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    e.preventDefault();
    handleClick(actionEl, e).catch((err) => { console.error(err); showToast('操作に失敗しました'); });
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    handleChange(el).catch((err) => { console.error(err); showToast('変更を反映できませんでした'); });
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    handleChange(el).catch((err) => { console.error(err); });
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-action]');
    if (!form) return;
    e.preventDefault();
    handleSubmit(form).catch((err) => { console.error(err); showToast('保存に失敗しました'); });
  });
  requestRender();
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:20px;color:#c00;white-space:pre-wrap">起動に失敗しました\n${err.stack || err.message}</pre>`;
});
