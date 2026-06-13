import { icon } from './icons.js';
import { DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, formatDate, normalizeText, sortBy } from './utils.js';

function tagMap(state) { return new Map(state.data.tags.map((t) => [t.id, t])); }
function artistMap(state) { return new Map(state.data.artists.map((a) => [a.id, a])); }

function trackSearch(state, query) {
  const q = normalizeText(query);
  const tmap = tagMap(state);
  const amap = artistMap(state);
  return state.data.tracks.filter((track) => {
    if (!q) return true;
    const tags = (track.tagIds || []).map((id) => tmap.get(id)?.name || '').join(' ');
    const artists = (track.artistIds || []).map((id) => amap.get(id)?.name || '').join(' ');
    return `${track.title || ''} ${artists} ${tags} ${track.releasedAt || ''}`.toLowerCase().includes(q);
  });
}

function trackArtistText(state, track) {
  const amap = artistMap(state);
  const names = (track.artistIds || []).map((id) => amap.get(id)?.name).filter(Boolean);
  return names.length ? names.join(' / ') : DEFAULT_ARTIST_NAME;
}

function trackTagText(state, track) {
  const tmap = tagMap(state);
  return (track.tagIds || []).map((id) => tmap.get(id)?.name).filter(Boolean).join(' / ');
}

export function renderEditorTrackCard(state, track) {
  return `
    <button class="list-item track-card card" data-action="edit-track" data-track-id="${track.id}">
      <img class="cover" src="${track.thumbnail || DEFAULT_THUMBNAIL}" alt="" />
      <div class="meta">
        <div class="truncate"><strong>${track.title || '無題'}</strong></div>
        <div class="truncate small muted">${trackArtistText(state, track)}</div>
        <div class="truncate tiny muted">${formatDate(track.releasedAt) || '投稿日未設定'}</div>
        <div class="truncate tiny muted">${trackTagText(state, track) || 'タグなし'}</div>
      </div>
    </button>`;
}

function tagRow(tag) {
  return `
    <div class="list-item tag-item">
      <div class="color-dot" style="background:${tag.color || '#2f6fed'}"></div>
      <div class="label stack"><strong>${tag.name}</strong><span class="small muted">${tag.color || '#2f6fed'}</span></div>
      <button class="btn btn-sm" data-action="edit-tag" data-tag-id="${tag.id}">${icon('edit')}編集</button>
      <button class="btn btn-sm btn-danger" data-action="delete-tag" data-tag-id="${tag.id}">${icon('trash')}削除</button>
      <div class="mini-actions">
        <button class="icon-btn" data-action="move-tag" data-tag-id="${tag.id}" data-dir="up">${icon('arrowUp')}</button>
        <button class="icon-btn" data-action="move-tag" data-tag-id="${tag.id}" data-dir="down">${icon('arrowDown')}</button>
      </div>
    </div>`;
}

function artistRow(artist) {
  const img = artist.icon || DEFAULT_THUMBNAIL;
  return `
    <div class="list-item artist-item">
      <div class="icon-box"><img src="${img}" alt="" /></div>
      <div class="label stack"><strong>${artist.name}</strong><span class="small muted">${artist.icon ? 'アイコン設定あり' : '既定アイコン'}</span></div>
      <button class="btn btn-sm" data-action="edit-artist" data-artist-id="${artist.id}">${icon('edit')}編集</button>
      <button class="btn btn-sm btn-danger" data-action="delete-artist" data-artist-id="${artist.id}">${icon('trash')}削除</button>
      <div class="mini-actions">
        <button class="icon-btn" data-action="move-artist" data-artist-id="${artist.id}" data-dir="up">${icon('arrowUp')}</button>
        <button class="icon-btn" data-action="move-artist" data-artist-id="${artist.id}" data-dir="down">${icon('arrowDown')}</button>
      </div>
    </div>`;
}

export function renderEditorScreen(state) {
  const view = state.filters.editor.view || 'tracks';
  const orientation = state.orientation;
  const columns = state.filters.editor.columns || (orientation === 'portrait' ? 2 : 4);
  const tracks = sortBy(trackSearch(state, state.filters.editor.query || ''), (t) => {
    if (state.filters.editor.sort === 'updatedAt') return t.updatedAt || t.createdAt || 0;
    if (state.filters.editor.sort === 'title') return t.title || '';
    if (state.filters.editor.sort === 'releasedAt') return t.releasedAt || '';
    return t.updatedAt || 0;
  }, state.filters.editor.asc !== false);
  const tags = sortBy([...state.data.tags], (t) => t.order ?? 0, true);
  const artists = sortBy([...state.data.artists], (a) => a.order ?? 0, true);
  return `
    <div class="screen-body editor-screen">
      <div class="editor-layout">
        <div class="editor-side panel panel-pad">
          <div class="editor-top-tabs">
            <button class="seg-btn ${view === 'tracks' ? 'is-active' : ''}" data-action="editor-view" data-view="tracks">${icon('album')}曲一覧</button>
            <button class="seg-btn ${view === 'tags' ? 'is-active' : ''}" data-action="editor-view" data-view="tags">${icon('tag')}タグ管理</button>
            <button class="seg-btn ${view === 'artists' ? 'is-active' : ''}" data-action="editor-view" data-view="artists">${icon('user')}アーティスト管理</button>
          </div>
          <div class="editor-subview">
            ${view === 'tracks' ? `
              <div class="editor-toolbar">
                <input class="input search" placeholder="タイトル / アーティスト / タグ / 投稿日" value="${state.filters.editor.query || ''}" data-action="editor-search" />
                <button class="btn" data-action="editor-sort" data-value="${state.filters.editor.sort}">${icon('list')}並べ替え</button>
                <button class="btn" data-action="editor-toggle-order">${icon('arrowDown')}${state.filters.editor.asc === false ? '降順' : '昇順'}</button>
                <button class="btn" data-action="editor-toggle-columns">${icon('grid')} ${columns} 列</button>
              </div>
              <div class="editor-list list scroll" id="editorTrackList">
                <div class="track-card-grid" style="grid-template-columns:repeat(${columns}, minmax(0, 1fr));">${tracks.map((t) => renderEditorTrackCard(state, t)).join('')}</div>
              </div>
            ` : view === 'tags' ? `
              <div class="editor-toolbar">
                <button class="btn btn-primary" data-action="create-tag">${icon('plus')}タグ作成</button>
              </div>
              <div class="editor-list list scroll">${tags.map(tagRow).join('') || '<div class="card card-pad muted">タグがありません。</div>'}</div>
            ` : `
              <div class="editor-toolbar">
                <button class="btn btn-primary" data-action="create-artist">${icon('plus')}アーティスト追加</button>
              </div>
              <div class="editor-list list scroll">${artists.map(artistRow).join('') || '<div class="card card-pad muted">アーティストがありません。</div>'}</div>
            `}
          </div>
        </div>
        <div class="editor-main panel panel-pad">
          <div class="card card-pad card-soft">
            <div class="stack">
              <div class="badge">編集のコツ</div>
              <div>曲はタイトル・サムネイル・アーティスト・投稿日・タグをまとめて編集できます。タグとアーティストは変更すると関連曲へ即時反映されます。</div>
            </div>
          </div>
          <div class="card card-pad">
            <div class="stack">
              <div class="badge">表示列</div>
              <div class="small muted">横画面では4列/6列、縦画面では2列/3列を切り替えできます。</div>
            </div>
          </div>
          <div class="spacer"></div>
          <div class="small muted">選択した項目の編集は、一覧の各カードにある編集ボタンから開きます。</div>
        </div>
      </div>
    </div>`;
}

export function getEditorTracks(state) { return trackSearch(state, state.filters.editor.query || ''); }
