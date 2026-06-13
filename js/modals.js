import { icon } from './icons.js';
import { DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, formatDate, safeDateInput } from './utils.js';

function modalShell(title, body, footer = '') {
  return `
    <div class="modal-layer is-open">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-head">
          <strong>${title}</strong>
          <button class="icon-btn" data-action="close-modal" aria-label="閉じる">${icon('x')}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-body" style="padding-top:0">${footer}</div>` : ''}
      </div>
    </div>`;
}

function artistOptions(state, selected = []) {
  return state.data.artists.filter((a) => !a.isSystem).map((a) => `
    <label class="chip ${selected.includes(a.id) ? 'is-active' : ''}" style="display:inline-flex; gap:8px; align-items:center;">
      <input class="sr-only" type="checkbox" name="artistIds" value="${a.id}" ${selected.includes(a.id) ? 'checked' : ''} />
      ${a.icon ? `<img src="${a.icon}" alt="" class="thumb" style="width:22px;height:22px;border-radius:999px;"/>` : `<span class="color-dot" style="background:#2f6fed"></span>`}
      ${a.name}
    </label>`).join('');
}

function tagOptions(state, selected = []) {
  return [...state.data.tags].sort((a,b)=>(a.order??0)-(b.order??0)).map((t) => `
    <label class="chip ${selected.includes(t.id) ? 'is-active' : ''}" style="display:inline-flex; gap:8px; align-items:center;">
      <input class="sr-only" type="checkbox" name="tagIds" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''} />
      <span class="color-dot" style="background:${t.color || '#2f6fed'}"></span>
      ${t.name}
    </label>`).join('');
}

export function renderModals(state) {
  const m = state.ui.modal;
  if (!m) return '';
  if (m.type === 'upload') {
    const files = m.files || [];
    return modalShell('ファイル追加', `
      <div class="upload-zone ${m.dragging ? 'upload-drop' : ''}">
        <div class="stack">
          <div class="badge">${m.done ? '保存完了' : `${m.current || 0}/${files.length || 0} 件処理中`}</div>
          <div class="small muted">ドラッグ＆ドロップ、またはファイル選択で追加できます。ファイルごとの読み込み進捗も表示します。</div>
          <div class="list">
            ${files.map((f, i) => `<div class="card card-pad"><div class="toolbar"><strong class="truncate">${f.name}</strong><span class="small muted">${Math.round((m.progress?.[i] || 0) * 100)}%</span></div><div class="progress slim"><span style="width:${Math.round((m.progress?.[i] || 0) * 100)}%"></span></div><div class="small muted">${f.meta?.title || '読み込み中'} / ${f.meta?.artist || ''}</div></div>`).join('') || '<div class="muted">ファイルがありません。</div>'}
          </div>
          <div class="toolbar-row">
            <button class="btn" data-action="close-modal">閉じる</button>
          </div>
        </div>
      </div>`);
  }
  if (m.type === 'playlist') {
    const value = m.playlist?.name || '';
    return modalShell(m.playlist?.id ? '再生リストを編集' : '再生リストを作成', `
      <form data-action="save-playlist" class="stack">
        <input type="hidden" name="playlistId" value="${m.playlist?.id || ''}" />
        <label class="stack"><span class="small muted">名前</span><input class="input" name="name" value="${value}" placeholder="再生リスト名" /></label>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`);
  }
  if (m.type === 'track') {
    const t = m.track || {};
    return modalShell(m.track ? '曲を編集' : '曲を新規作成', `
      <form data-action="save-track" class="modal-grid">
        <input type="hidden" name="trackId" value="${t.id || ''}" />
        <div class="row row-2">
          <label class="stack"><span class="small muted">タイトル</span><input class="input" name="title" value="${t.title || ''}" /></label>
          <label class="stack"><span class="small muted">投稿日</span><input class="input" type="date" name="releasedAt" value="${safeDateInput(t.releasedAt)}" /></label>
        </div>
        <label class="stack"><span class="small muted">アーティスト名（任意の入力）</span><input class="input" name="artistText" value="${(t.artistText || '')}" placeholder="${DEFAULT_ARTIST_NAME}" /></label>
        <div class="stack"><span class="small muted">既存アーティスト</span><div class="tag-row">${artistOptions(state, t.artistIds || [])}</div></div>
        <div class="stack"><span class="small muted">タグ</span><div class="tag-row">${tagOptions(state, t.tagIds || [])}</div></div>
        <label class="stack"><span class="small muted">サムネイル画像</span><input class="input" type="file" name="thumbnailFile" accept="image/*" /></label>
        <label class="stack"><span class="small muted">サムネイルURL（未選択時のみ使用）</span><input class="input" name="thumbnailText" value="${t.thumbnail && t.thumbnail !== DEFAULT_THUMBNAIL ? t.thumbnail : ''}" placeholder="https://... または空欄" /></label>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`, `<div class="small muted">アーティストやタグは既存項目を選べます。テキスト入力は補助用です。</div>`);
  }
  if (m.type === 'tag') {
    const tag = m.tag || {};
    return modalShell(tag.id ? 'タグを編集' : 'タグを作成', `
      <form data-action="save-tag" class="modal-grid">
        <input type="hidden" name="tagId" value="${tag.id || ''}" />
        <div class="row row-2">
          <label class="stack"><span class="small muted">名前</span><input class="input" name="name" value="${tag.name || ''}" placeholder="タグ名" /></label>
          <label class="stack"><span class="small muted">色</span><input class="input" type="color" name="color" value="${tag.color || '#2f6fed'}" /></label>
        </div>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`);
  }
  if (m.type === 'artist') {
    const artist = m.artist || {};
    return modalShell(artist.id ? 'アーティストを編集' : 'アーティストを作成', `
      <form data-action="save-artist" class="modal-grid">
        <input type="hidden" name="artistId" value="${artist.id || ''}" />
        <div class="row row-2">
          <label class="stack"><span class="small muted">名前</span><input class="input" name="name" value="${artist.name || ''}" placeholder="アーティスト名" /></label>
          <label class="stack"><span class="small muted">アイコン画像</span><input class="input" type="file" name="iconFile" accept="image/*" /></label>
        </div>
        <label class="stack"><span class="small muted">アイコンURL（未選択時のみ使用）</span><input class="input" name="iconText" value="${artist.icon || ''}" placeholder="https://... または空欄" /></label>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`, `<div class="small muted">アイコンが未設定の場合は既定の画像を使います。</div>`);
  }
  if (m.type === 'bulk-playlist') {
    return modalShell('再生リストに追加', `
      <form data-action="bulk-save-playlist" class="stack">
        <label class="stack"><span class="small muted">追加先</span>
          <select class="select" name="playlistId">${state.data.playlists.filter((p) => !p.isDefault).map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        </label>
        <div class="small muted">選択中の曲をコピー方式で追加します。</div>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">追加</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`);
  }
  if (m.type === 'bulk-tags') {
    return modalShell('タグを付与', `
      <form data-action="bulk-save-tags" class="stack">
        <div class="tag-row">${tagOptions(state, m.tagIds || [])}</div>
        <div class="small muted">選択中の曲すべてにタグを付与します。</div>
        <div class="toolbar-row">
          <button class="btn btn-primary" type="submit">反映</button>
          <button class="btn" type="button" data-action="close-modal">キャンセル</button>
        </div>
      </form>`);
  }
  if (m.type === 'confirm-clear') {
    return modalShell('データを全削除', `
      <div class="stack">
        <div>IndexedDBに保存された曲本体、プレイリスト、タグ、アーティスト、ログを全削除します。</div>
        <div class="toolbar-row">
          <button class="btn btn-danger" data-action="confirm-clear-data">削除する</button>
          <button class="btn" data-action="close-modal">キャンセル</button>
        </div>
      </div>`);
  }
  return '';
}
