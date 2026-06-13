import { icon } from './icons.js';
import { DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, formatDate, formatDateTime, formatDuration, normalizeText, sortBy } from './utils.js';
import { DEFAULT_PLAYLIST_ID } from './storage.js';

function tagMap(state) { return new Map(state.data.tags.map((t) => [t.id, t])); }
function artistMap(state) { return new Map(state.data.artists.map((a) => [a.id, a])); }
function trackMap(state) { return new Map(state.data.tracks.map((t) => [t.id, t])); }
function itemMap(state, playlistId) { return new Map(state.data.playlistItems.filter((i) => i.playlistId === playlistId).map((i) => [i.trackId, i])); }

export function getPlaylistTracks(state, playlistId, query = '', sort = 'manual', asc = true) {
  const tracks = trackMap(state);
  const items = state.data.playlistItems.filter((i) => i.playlistId === playlistId);
  const list = items.map((item) => ({ item, track: tracks.get(item.trackId) })).filter((x) => x.track);
  const tmap = tagMap(state);
  const amap = artistMap(state);
  const q = normalizeText(query);
  const filtered = list.filter(({ track }) => {
    if (!q) return true;
    const tags = (track.tagIds || []).map((id) => tmap.get(id)?.name || '').join(' ');
    const artists = (track.artistIds || []).map((id) => amap.get(id)?.name || '').join(' ');
    const hay = `${track.title || ''} ${artists} ${tags} ${formatDate(track.releasedAt)}`.toLowerCase();
    return hay.includes(q);
  });
  const sortable = [...filtered];
  if (sort === 'manual') sortable.sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0));
  if (sort === 'addedAt') sortable.sort((a, b) => (a.item.addedAt ?? 0) - (b.item.addedAt ?? 0));
  if (sort === 'title') sortable.sort((a, b) => String(a.track.title || '').localeCompare(String(b.track.title || ''), 'ja'));
  if (sort === 'releasedAt') sortable.sort((a, b) => String(a.track.releasedAt || '').localeCompare(String(b.track.releasedAt || '')));
  if (!asc) sortable.reverse();
  return sortable;
}

export function getPlaylistNames(state) {
  return [...state.data.playlists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderTagChips(state, track) {
  const tmap = tagMap(state);
  return (track.tagIds || []).map((id) => {
    const tag = tmap.get(id);
    if (!tag) return '';
    return `<span class="tag-dot-chip"><span class="color-dot" style="background:${tag.color || '#2f6fed'}"></span>${tag.name}</span>`;
  }).join('');
}

function artistsText(state, track) {
  const amap = artistMap(state);
  const names = (track.artistIds || []).map((id) => amap.get(id)?.name).filter(Boolean);
  return names.length ? names.join(' / ') : DEFAULT_ARTIST_NAME;
}

function currentTrackRecord(state) {
  const track = state.data.tracks.find((t) => t.id === state.player.currentTrackId) || state.data.tracks[0] || null;
  return track;
}

function playerWidget(state, compact = false) {
  const track = currentTrackRecord(state);
  const title = track?.title || '再生する曲を選択してください';
  const artist = track ? artistsText(state, track) : 'ライブラリが空です';
  const thumb = track?.thumbnail || DEFAULT_THUMBNAIL;
  const progress = state.player.duration > 0 ? (state.player.currentTime / state.player.duration) * 100 : 0;
  const status = `${formatDuration(state.player.currentTime || 0)} / ${formatDuration(state.player.duration || track?.duration || 0)}`;
  const body = compact
    ? `
      <div class="player-mini card card-pad" data-action="expand-player">
        <img class="thumb" src="${thumb}" alt="" />
        <div class="meta">
          <div class="title truncate">${title}</div>
          <div class="artist truncate">${artist}</div>
        </div>
        <div class="mini-actions">
          <button class="icon-btn" data-action="player-prev" aria-label="戻る">${icon('prev')}</button>
          <button class="icon-btn" data-action="player-toggle" aria-label="再生/停止">${icon(state.player.isPlaying ? 'pause' : 'play')}</button>
          <button class="icon-btn" data-action="player-next" aria-label="進む">${icon('next')}</button>
        </div>
      </div>`
    : `
      <div class="player-widget card card-pad">
        <div class="player-now">
          <img class="now-cover" src="${thumb}" alt="再生中のサムネイル" />
          <div class="title truncate">${title}</div>
          <div class="artist truncate">${artist}</div>
        </div>
        <div class="stack">
          <div class="progress"><span style="width:${progress.toFixed(1)}%"></span></div>
          <div class="toolbar"><span class="small muted">${status}</span><span class="small muted">${state.player.sampleMode ? '試聴モード' : ''}</span></div>
        </div>
        <div class="player-controls">
          <button class="btn" data-action="player-shuffle" data-on="${state.player.shuffle ? '1' : '0'}">${icon('shuffle')}ランダム ${state.player.shuffle ? 'ON' : 'OFF'}</button>
          <button class="icon-btn" data-action="player-prev" aria-label="戻る">${icon('prev')}</button>
          <button class="btn btn-primary" data-action="player-toggle">${icon(state.player.isPlaying ? 'pause' : 'play')}${state.player.isPlaying ? '停止' : '再生'}</button>
          <button class="icon-btn" data-action="player-next" aria-label="進む">${icon('next')}</button>
          <button class="btn" data-action="player-loop" data-on="${state.player.loop ? '1' : '0'}">${icon('repeat')}ループ ${state.player.loop ? 'ON' : 'OFF'}</button>
        </div>
        <div class="toolbar-row">
          <button class="seg-btn ${state.player.rate === 0.75 ? 'is-active' : ''}" data-action="player-rate" data-value="0.75">0.75x</button>
          <button class="seg-btn ${state.player.rate === 1 ? 'is-active' : ''}" data-action="player-rate" data-value="1">1.0x</button>
          <button class="seg-btn ${state.player.rate === 1.25 ? 'is-active' : ''}" data-action="player-rate" data-value="1.25">1.25x</button>
          <button class="seg-btn ${state.player.rate === 1.5 ? 'is-active' : ''}" data-action="player-rate" data-value="1.5">1.5x</button>
          <button class="seg-btn ${state.player.rate === 2 ? 'is-active' : ''}" data-action="player-rate" data-value="2">2.0x</button>
        </div>
      </div>`;
  return body;
}

function playlistTabs(state) {
  return getPlaylistNames(state).map((pl) => `<button class="playlist-tab ${state.ui.playlistId === pl.id ? 'is-active' : ''}" data-action="select-playlist" data-id="${pl.id}">${pl.name}${pl.isDefault ? '' : ''}</button>`).join('');
}

export function renderPlayerTrackRow(state, pair, index) {
  const { track, item } = pair;
  const tmap = tagMap(state);
  const tags = (track.tagIds || []).map((id) => tmap.get(id)).filter(Boolean);
  const artists = artistsText(state, track);
  const selected = state.ui.trackSelection.includes(track.id);
  const manual = state.filters.player.sort === 'manual';
  return `
    <div class="list-item track-row ${selected ? 'is-selected' : ''}" data-action="play-track" data-track-id="${track.id}">
      <label class="icon-btn" style="margin:0" title="選択">
        <input class="sr-only" type="checkbox" data-action="toggle-track-select" data-track-id="${track.id}" ${selected ? 'checked' : ''} />
        ${icon(selected ? 'check' : 'album')}
      </label>
      <img class="thumb" src="${track.thumbnail || DEFAULT_THUMBNAIL}" alt="" />
      <div class="track-main meta">
        <div class="stack">
          <div class="truncate"><strong>${track.title || '無題'}</strong></div>
          <div class="truncate small muted">${artists}</div>
        </div>
        <div class="tag-row">${renderTagChips(state, track)}</div>
      </div>
      <div class="duration">${formatDuration(track.duration || 0)}</div>
      <div class="track-actions">
        <button class="btn btn-sm" data-action="add-to-playlist" data-track-id="${track.id}">${icon('plus')}追加</button>
        <button class="btn btn-sm" data-action="edit-track" data-track-id="${track.id}">${icon('edit')}編集</button>
        <button class="btn btn-sm btn-danger" data-action="delete-track" data-track-id="${track.id}">${icon('trash')}削除</button>
      </div>
      <div class="manual-controls ${manual ? '' : 'hidden'}">
        <button class="icon-btn" data-action="move-track" data-track-id="${track.id}" data-dir="up">${icon('arrowUp')}</button>
        <button class="icon-btn" data-action="move-track" data-track-id="${track.id}" data-dir="down">${icon('arrowDown')}</button>
      </div>
      <div class="small muted">${formatDate(track.releasedAt) || '—'}</div>
    </div>`;
}

function selectedBulkBar(state) {
  const count = state.ui.trackSelection.length;
  if (!count) return '';
  return `
    <div class="bulk-bar card card-pad">
      <span class="badge">${count} 件選択中</span>
      <button class="btn btn-sm" data-action="select-visible-tracks">全選択</button>
      <button class="btn btn-sm" data-action="clear-track-selection">選択解除</button>
      <button class="btn btn-sm" data-action="bulk-add-to-playlist">再生リストに追加</button>
      <button class="btn btn-sm" data-action="bulk-add-tags">タグを追加</button>
      <button class="btn btn-sm btn-danger" data-action="bulk-delete-tracks">削除</button>
    </div>`;
}

export function renderPlayerScreen(state) {
  const playlistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
  const selectedPlaylist = state.data.playlists.find((p) => p.id === playlistId) || state.data.playlists[0];
  const query = state.filters.player.query || '';
  const sort = state.filters.player.sort || 'manual';
  const asc = state.filters.player.asc !== false;
  const tracks = selectedPlaylist ? getPlaylistTracks(state, selectedPlaylist.id, query, sort, asc) : [];
  return `
    <div class="screen-body player-screen">
      <div class="player-layout ${state.orientation === 'portrait' ? 'is-portrait' : 'is-landscape'}">
        <div class="player-core">
          ${state.orientation === 'portrait' ? playerWidget(state, true) : playerWidget(state, false)}
        </div>
        <div class="playlist-wrap panel panel-pad">
          <div class="playlist-bar">
            <label class="input-wrap"><span class="sr-only">検索</span><input class="input" placeholder="タイトル / アーティスト / タグ / 投稿日" value="${state.filters.player.query || ''}" data-action="player-search" /></label>
            <button class="btn btn-primary" data-action="create-playlist">${icon('plus')}再生リスト作成</button>
            <button class="btn" data-action="open-upload">${icon('upload')}ファイル追加</button>
          </div>
          <div class="playlist-tabs">${playlistTabs(state)}</div>
          <div class="toolbar-row">
            <button class="btn" data-action="trigger-file-picker">${icon('folder')}ファイル選択</button>
            <button class="btn" data-action="edit-playlist">${icon('edit')}編集</button>
            <button class="btn btn-danger" data-action="delete-playlist">${icon('trash')}削除</button>
            <button class="btn" data-action="player-sort" data-value="${sort}">${icon('list')}${sort === 'manual' ? '手動順' : sort === 'addedAt' ? '追加日順' : sort === 'title' ? 'タイトル順' : '投稿日順'}</button>
            <button class="btn" data-action="player-toggle-order">${icon('arrowDown')}${asc ? '昇順' : '降順'}</button>
            <button class="btn" data-action="player-selection-mode">${icon('check')}選択</button>
          </div>
          ${selectedBulkBar(state)}
          <div class="player-track-list list scroll" id="playerTrackList">
            ${tracks.length ? tracks.map((pair, i) => renderPlayerTrackRow(state, pair, i)).join('') : `<div class="card card-pad muted">曲がありません。ファイルを追加してください。</div>`}
          </div>
        </div>
      </div>
    </div>`;
}

export function renderExpandedPlayer(state) {
  if (state.orientation === 'landscape' && !state.ui.simplePlayerOpen) return '';
  return `<div class="panel panel-pad" style="position:absolute; inset:16px; z-index:20; background:rgba(255,255,255,0.98); display:${state.ui.simplePlayerOpen ? 'block' : 'none'};">${playerWidget(state, false)}</div>`;
}

export function getVisiblePlayerTrackIds(state) {
  const playlistId = state.ui.playlistId || DEFAULT_PLAYLIST_ID;
  const selectedPlaylist = state.data.playlists.find((p) => p.id === playlistId) || state.data.playlists[0];
  if (!selectedPlaylist) return [];
  return getPlaylistTracks(state, selectedPlaylist.id, state.filters.player.query || '', state.filters.player.sort || 'manual', state.filters.player.asc !== false).map(({ track }) => track.id);
}
