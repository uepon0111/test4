'use strict';
/* ============================================================
   info-edit-ui.js – 情報編集画面 UI
   ============================================================ */
const InfoEditUI = (() => {
  let songVS   = null;
  let tagVS    = null;
  let artistVS = null;
  let songCols = 4;

  function init() {
    setupSubNav();
    setupSongToolbar();
    setupSongGrid();
    setupTagView();
    setupArtistView();

    Store.subscribe('tracks',   () => refreshSongs());
    Store.subscribe('tags',     () => { refreshSongs(); refreshTags(); });
    Store.subscribe('artists',  () => { refreshSongs(); refreshArtists(); });
    Store.subscribe('songSearch', () => refreshSongs());
    Store.subscribe('songSort',   () => refreshSongs());
    Store.subscribe('songSortAsc',() => refreshSongs());

    // 初期レンダリング（画面が非表示でも setItems しておくことで ResizeObserver が有効化する）
    setTimeout(() => { refreshSongs(); refreshTags(); refreshArtists(); }, 0);
  }

  /* ======================== サブナビ ======================== */
  function setupSubNav() {
    document.querySelectorAll('.info-tab').forEach(btn => {
      btn.onclick = () => switchInfoView(btn.dataset.view);
    });
  }

  function switchInfoView(view) {
    Store.set('infoView', view);
    document.querySelectorAll('.info-tab').forEach(b => b.classList.toggle('active', b.dataset.view===view));
    document.querySelectorAll('.info-view').forEach(v => v.classList.toggle('active', v.id===`view-${view}`));
    if (view==='songs')   refreshSongs();
    if (view==='tags')    refreshTags();
    if (view==='artists') refreshArtists();
  }

  /* ======================== 曲一覧ツールバー ======================== */
  function setupSongToolbar() {
    const search = document.getElementById('song-search');
    search.addEventListener('input', Utils.debounce(() => Store.set('songSearch', search.value), 200));

    const sortBtn = document.getElementById('btn-song-sort');
    const sortMenu = document.getElementById('song-sort-menu');
    sortBtn.onclick = e => { e.stopPropagation(); sortMenu.classList.toggle('hidden'); };
    sortMenu.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        Store.set('songSort', b.dataset.sort);
        document.getElementById('song-sort-label').textContent = b.textContent;
        sortMenu.classList.add('hidden');
      };
    });
    document.addEventListener('click', () => sortMenu.classList.add('hidden'));

    document.getElementById('btn-song-order').onclick = () => {
      const asc = !Store.get('songSortAsc');
      Store.set('songSortAsc', asc);
      updateSongOrderBtn(asc);
    };

    document.getElementById('btn-song-cols').onclick = () => {
      const isLandscape = window.matchMedia('(orientation:landscape)').matches;
      const opts = isLandscape ? [4,6] : [2,3];
      const cur = Store.get('songCols');
      const idx = opts.indexOf(cur);
      const next = opts[(idx+1)%opts.length];
      Store.set('songCols', next);
      songVS?.setCols(next);
      updateColsBtn(next);
    };

    const savedCols = Store.get('songCols');
    updateColsBtn(savedCols);
    if (songVS) songVS.setCols(savedCols);

    Store.subscribe('songCols', v => { songVS?.setCols(v); updateColsBtn(v); });
  }

  function updateSongOrderBtn(asc) {
    const btn = document.getElementById('btn-song-order');
    if (!btn) return;
    btn.innerHTML = asc ? '<i data-lucide="arrow-up"></i>' : '<i data-lucide="arrow-down"></i>';
    Utils.refreshIcons(btn);
  }

  function updateColsBtn(cols) {
    const btn = document.getElementById('btn-song-cols');
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="layout-grid"></i><span>${cols}</span>`;
    Utils.refreshIcons(btn);
  }

  /* ======================== 曲グリッド (21) ======================== */
  function setupSongGrid() {
    const container = document.getElementById('songs-grid');
    if (!container) return;
    const isLandscape = window.matchMedia('(orientation:landscape)').matches;
    const defaultCols = isLandscape ? 4 : 2;
    songCols = Store.get('songCols') || defaultCols;

    songVS = new GridVirtualScroll(container, {
      itemHeight: 250,
      cols: songCols,
      gap: 12,
      buffer: 2,
      renderItem: renderSongCard,
      onEmpty: () => {
        const div = document.createElement('div');
        div.className = 'list-empty';
        div.innerHTML = '<i data-lucide="music"></i><p>曲がありません</p>';
        Utils.refreshIcons(div);
        return div;
      }
    });
  }

  function getFilteredSortedSongs() {
    const all = Store.get('tracks');
    const q   = Store.get('songSearch').toLowerCase().trim();
    const filtered = q ? all.filter(t => {
      const artists = (t.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean).map(a=>a.name);
      const tags    = (t.tagIds||[]).map(id=>Store.getTag(id)).filter(Boolean).map(tg=>tg.name);
      return t.title.toLowerCase().includes(q)
          || artists.some(a=>a.toLowerCase().includes(q))
          || tags.some(tg=>tg.toLowerCase().includes(q))
          || (t.releaseDate||'').includes(q);
    }) : all;
    return Store.applySort(filtered, Store.get('songSort'), Store.get('songSortAsc'), null);
  }

  function refreshSongs() {
    if (!songVS) return;
    songVS.setItems(getFilteredSortedSongs());
  }

  function renderSongCard(track) {
    const el = document.createElement('div');
    el.className = 'song-card';
    const artists = (track.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean).map(a=>a.name);
    const artistStr = artists.length ? artists.join(', ') : (track.artistName||'不明のアーティスト');
    const tags = (track.tagIds||[]).slice(0,3).map(id=>Store.getTag(id)).filter(Boolean);

    el.innerHTML = `
      <div class="song-card-thumb-wrap">
        <img class="song-card-thumb" src="" alt="" style="display:none">
        <div class="song-card-thumb-ph"><i data-lucide="music"></i></div>
      </div>
      <div class="song-card-info">
        <div class="song-card-title">${Utils.escapeHtml(track.title)}</div>
        <div class="song-card-artist">${Utils.escapeHtml(artistStr)}</div>
        ${track.releaseDate ? `<div class="song-card-date">${Utils.escapeHtml(Utils.formatReleaseDate(track.releaseDate))}</div>` : ''}
        <div class="song-card-tags">${tags.map(t=>`<span class="tag-chip" style="background:${t.color};color:${Utils.colorIsDark(t.color)?'#fff':'#222'}">${Utils.escapeHtml(t.name)}</span>`).join('')}</div>
      </div>`;

    Utils.refreshIcons(el);
    PlayerUI.lazyLoadThumbnail(el.querySelector('.song-card-thumb'), el.querySelector('.song-card-thumb-ph'), track.id);
    el.onclick = () => openTrackEditModal(track.id);
    return el;
  }

  /* ======================== 曲編集モーダル ======================== */
  function openTrackEditModal(trackId) {
    const track = Store.getTrack(trackId);
    if (!track) return;
    const artists = Store.get('artists');
    const tags    = Store.get('tags');
    const selArtists = (track.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean);
    const selTags    = (track.tagIds||[]).map(id=>Store.getTag(id)).filter(Boolean);

    let newThumb = null; // base64 if changed

    const artistsHtml = artists.map(a=>`
      <div class="multi-select-item ${selArtists.some(sa=>sa.id===a.id)?'selected':''}" data-type="artist" data-id="${a.id}">
        <div class="multi-item-icon artist-icon-sm">${a.hasIcon?`<img data-artist-icon="${a.id}">` :'<i data-lucide="user"></i>'}</div>
        <span>${Utils.escapeHtml(a.name)}</span>
        <i data-lucide="check" class="check-icon"></i>
      </div>`).join('');

    const tagsHtml = tags.map(t=>`
      <div class="multi-select-item ${selTags.some(st=>st.id===t.id)?'selected':''}" data-type="tag" data-id="${t.id}">
        <span class="tag-dot" style="background:${t.color}"></span>
        <span>${Utils.escapeHtml(t.name)}</span>
        <i data-lucide="check" class="check-icon"></i>
      </div>`).join('');

    const html = `
    <div class="modal-dialog modal-lg">
      <div class="modal-header"><h3>曲を編集</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body modal-scroll">
        <div class="edit-thumb-section">
          <div class="edit-thumb-wrap" id="edit-thumb-wrap">
            <img id="edit-thumb-img" src="" alt="" style="display:none">
            <div id="edit-thumb-ph" class="edit-thumb-ph"><i data-lucide="image"></i><span>クリックして変更</span></div>
          </div>
          <input type="file" id="edit-thumb-input" accept="image/*" style="display:none">
        </div>
        <div class="form-group">
          <label class="form-label">タイトル</label>
          <input type="text" id="edit-title" class="form-input" value="${Utils.escapeHtml(track.title)}" maxlength="200">
        </div>
        <div class="form-group">
          <label class="form-label">投稿日（リリース日）</label>
          <input type="text" id="edit-date" class="form-input" placeholder="例: 2023 または 2023-01-15" value="${Utils.escapeHtml(track.releaseDate||'')}">
        </div>
        <div class="form-group">
          <label class="form-label">アーティスト</label>
          ${artists.length ? `<div class="multi-select-grid">${artistsHtml}</div>` : '<p class="text-muted-sm">アーティストがありません</p>'}
        </div>
        <div class="form-group">
          <label class="form-label">タグ</label>
          ${tags.length ? `<div class="multi-select-grid">${tagsHtml}</div>` : '<p class="text-muted-sm">タグがありません</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-edit-save">保存</button>
      </div>
    </div>`;

    const m = Utils.showModal(html, {
      onOpen: async c => {
        // サムネイル表示
        const url = await DB.getThumbnail(trackId);
        if (url) { c.querySelector('#edit-thumb-img').src=url; c.querySelector('#edit-thumb-img').style.display=''; c.querySelector('#edit-thumb-ph').style.display='none'; }
        // アーティストアイコン
        for (const a of artists) {
          if (a.hasIcon) {
            const icon = await DB.getArtistIcon(a.id);
            const img = c.querySelector(`[data-artist-icon="${a.id}"]`);
            if (img && icon) img.src = icon;
          }
        }

        // サムネイル変更
        const thumbWrap = c.querySelector('#edit-thumb-wrap');
        const thumbInput = c.querySelector('#edit-thumb-input');
        thumbWrap.onclick = () => thumbInput.click();
        thumbInput.onchange = async () => {
          const f = thumbInput.files[0];
          if (!f) return;
          newThumb = await Utils.fileToDataUrl(f);
          c.querySelector('#edit-thumb-img').src = newThumb;
          c.querySelector('#edit-thumb-img').style.display = '';
          c.querySelector('#edit-thumb-ph').style.display = 'none';
        };

        // マルチ選択トグル
        c.querySelectorAll('.multi-select-item').forEach(item => {
          item.onclick = () => item.classList.toggle('selected');
        });

        // 保存
        c.querySelector('#btn-edit-save').onclick = async () => {
          const title = c.querySelector('#edit-title').value.trim();
          if (!title) { c.querySelector('#edit-title').classList.add('invalid'); return; }
          const releaseDate = c.querySelector('#edit-date').value.trim() || null;
          const artistIds = [...c.querySelectorAll('.multi-select-item[data-type="artist"].selected')].map(el=>el.dataset.id);
          const tagIds    = [...c.querySelectorAll('.multi-select-item[data-type="tag"].selected')].map(el=>el.dataset.id);

          if (!artistIds.length) {
            const unk = Store.get('artists').find(a=>a.name==='不明のアーティスト');
            if (unk) artistIds.push(unk.id);
          }

          const updated = { ...track, title, releaseDate, artistIds, tagIds };
          Store.upsertTrack(updated);
          await DB.saveTrack(updated);

          if (newThumb) {
            await DB.saveThumbnail(trackId, newThumb);
            PlayerUI.invalidateThumbCache(trackId);
          }

          m.close();
          Utils.showToast('情報を保存しました','success');
        };
      }
    });
  }

  /* ======================== タグ一覧 (23) ======================== */
  function setupTagView() {
    document.getElementById('btn-create-tag').onclick = openCreateTagModal;
    const container = document.getElementById('tags-list');
    if (!container) return;
    tagVS = new VirtualScroll(container, {
      itemHeight: 60,
      buffer: 5,
      renderItem: renderTagItem,
      onEmpty: () => {
        const div = document.createElement('div');
        div.className = 'list-empty';
        div.innerHTML = '<i data-lucide="tag"></i><p>タグがありません</p>';
        Utils.refreshIcons(div);
        return div;
      }
    });
  }

  function refreshTags() {
    if (!tagVS) return;
    tagVS.setItems([...Store.get('tags')].sort((a,b)=>a.order-b.order));
  }

  function renderTagItem(tag, index) {
    const el = document.createElement('div');
    el.className = 'tag-list-item';
    el.innerHTML = `
      <span class="tag-color-dot" style="background:${tag.color}"></span>
      <span class="tag-name">${Utils.escapeHtml(tag.name)}</span>
      <span class="tag-count text-muted">${Store.get('tracks').filter(t=>t.tagIds?.includes(tag.id)).length}曲</span>
      <button class="icon-btn btn-edit-tag" title="編集"><i data-lucide="pencil"></i></button>
      <button class="icon-btn btn-del-tag"  title="削除"><i data-lucide="trash-2"></i></button>
      <div class="reorder-btns">
        <button class="reorder-btn btn-tag-up"><i data-lucide="chevron-up"></i></button>
        <button class="reorder-btn btn-tag-down"><i data-lucide="chevron-down"></i></button>
      </div>`;
    Utils.refreshIcons(el);

    el.querySelector('.btn-edit-tag').onclick = () => openEditTagModal(tag.id);
    el.querySelector('.btn-del-tag').onclick  = async () => {
      const ok = await Utils.confirmDialog(`タグ「${tag.name}」を削除しますか？\n全ての曲から削除されます。`,'タグ削除');
      if (!ok) return;
      Store.removeTag(tag.id);
      await DB.deleteTag(tag.id);
      await Store.persistTracks();
      Utils.showToast('タグを削除しました','success');
    };
    el.querySelector('.btn-tag-up').onclick   = () => moveTag(tag.id, -1);
    el.querySelector('.btn-tag-down').onclick = () => moveTag(tag.id, 1);
    return el;
  }

  function moveTag(tagId, dir) {
    const tags = [...Store.get('tags')].sort((a,b)=>a.order-b.order);
    const idx  = tags.findIndex(t=>t.id===tagId);
    if (idx<0) return;
    const newIdx = idx+dir;
    if (newIdx<0 || newIdx>=tags.length) return;
    // 新しいオブジェクトを作成して order を交換（ミューテーション防止）
    const newTags = tags.map((t,i) => {
      if (i===idx)    return { ...t, order: tags[newIdx].order };
      if (i===newIdx) return { ...t, order: tags[idx].order };
      return { ...t };
    });
    Store.setTags(newTags);
    DB.saveTags(newTags);
  }

  function openCreateTagModal() {
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280','#14b8a6','#f59e0b'];
    let selColor = '#6C63FF';
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>タグを作成</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">タグ名</label>
          <input type="text" id="tag-name-input" class="form-input" placeholder="例: お気に入り" maxlength="30">
        </div>
        <div class="form-group">
          <label class="form-label">色</label>
          <div class="color-swatches">${colors.map(c=>`<button class="swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
          <div class="color-custom-wrap">
            <label class="form-label-sm">カスタムカラー</label>
            <input type="color" id="tag-color-picker" value="${selColor}" class="color-picker-input">
          </div>
          <div class="color-preview-wrap">
            <span>プレビュー:</span>
            <span class="tag-chip-preview" id="tag-preview" style="background:${selColor};color:#fff">タグ名</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-tag-create">作成</button>
      </div>
    </div>`;

    const m = Utils.showModal(html, {
      onOpen: c => {
        const nameInput = c.querySelector('#tag-name-input'); nameInput.focus();
        const picker    = c.querySelector('#tag-color-picker');
        const preview   = c.querySelector('#tag-preview');
        const swatches  = c.querySelectorAll('.swatch');

        const updateColor = color => {
          selColor = color; picker.value = color;
          preview.style.background = color;
          preview.style.color = Utils.colorIsDark(color) ? '#fff' : '#222';
          swatches.forEach(s => s.classList.toggle('active', s.dataset.color===color));
        };
        swatches.forEach(s => s.onclick = () => updateColor(s.dataset.color));
        picker.oninput = () => updateColor(picker.value);
        nameInput.oninput = () => preview.textContent = nameInput.value || 'タグ名';

        c.querySelector('#btn-tag-create').onclick = async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.classList.add('invalid'); return; }
          const tags = Store.get('tags');
          const tag  = { id:Utils.generateId(), name, color:selColor, order:tags.length };
          Store.upsertTag(tag);
          await DB.saveTag(tag);
          m.close(); Utils.showToast('タグを作成しました','success');
        };
      }
    });
  }

  function openEditTagModal(tagId) {
    const tag = Store.getTag(tagId);
    if (!tag) return;
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280','#14b8a6','#f59e0b'];
    let selColor = tag.color;
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>タグを編集</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">タグ名</label>
          <input type="text" id="tag-name-input" class="form-input" value="${Utils.escapeHtml(tag.name)}" maxlength="30">
        </div>
        <div class="form-group">
          <label class="form-label">色</label>
          <div class="color-swatches">${colors.map(c=>`<button class="swatch ${c===tag.color?'active':''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
          <div class="color-custom-wrap"><label class="form-label-sm">カスタムカラー</label><input type="color" id="tag-color-picker" value="${tag.color}" class="color-picker-input"></div>
          <div class="color-preview-wrap"><span>プレビュー:</span><span class="tag-chip-preview" id="tag-preview" style="background:${tag.color};color:${Utils.colorIsDark(tag.color)?'#fff':'#222'}">${Utils.escapeHtml(tag.name)}</span></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button><button class="btn btn-primary" id="btn-tag-save">保存</button></div>
    </div>`;

    const m = Utils.showModal(html, {
      onOpen: c => {
        const nameInput = c.querySelector('#tag-name-input');
        const picker    = c.querySelector('#tag-color-picker');
        const preview   = c.querySelector('#tag-preview');
        const updateColor = color => {
          selColor=color; picker.value=color; preview.style.background=color;
          preview.style.color=Utils.colorIsDark(color)?'#fff':'#222';
          c.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===color));
        };
        c.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>updateColor(s.dataset.color));
        picker.oninput=()=>updateColor(picker.value);
        nameInput.oninput=()=>preview.textContent=nameInput.value||'タグ名';

        c.querySelector('#btn-tag-save').onclick = async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.classList.add('invalid'); return; }
          const updated = { ...tag, name, color:selColor };
          Store.upsertTag(updated);
          await DB.saveTag(updated);
          // 全トラックのキャッシュを無効化（タグ色が変わったため）
          m.close(); Utils.showToast('タグを更新しました','success');
        };
      }
    });
  }

  /* ======================== アーティスト一覧 (25) ======================== */
  function setupArtistView() {
    document.getElementById('btn-create-artist').onclick = openCreateArtistModal;
    const container = document.getElementById('artists-list');
    if (!container) return;
    artistVS = new VirtualScroll(container, {
      itemHeight: 64,
      buffer: 5,
      renderItem: renderArtistItem,
      onEmpty: () => {
        const div = document.createElement('div');
        div.className = 'list-empty';
        div.innerHTML = '<i data-lucide="user"></i><p>アーティストがありません</p>';
        Utils.refreshIcons(div);
        return div;
      }
    });
  }

  function refreshArtists() {
    if (!artistVS) return;
    artistVS.setItems(Store.get('artists'));
  }

  function renderArtistItem(artist) {
    const el = document.createElement('div');
    el.className = 'artist-list-item';
    el.innerHTML = `
      <div class="artist-icon-wrap" id="aicon-${artist.id}">
        ${artist.hasIcon ? `<img data-artist-load="${artist.id}" class="artist-icon-img">` : '<div class="artist-icon-ph"><i data-lucide="user"></i></div>'}
      </div>
      <span class="artist-name">${Utils.escapeHtml(artist.name)}</span>
      <span class="artist-count text-muted">${Store.get('tracks').filter(t=>t.artistIds?.includes(artist.id)).length}曲</span>
      <button class="icon-btn btn-edit-artist" title="編集"><i data-lucide="pencil"></i></button>
      <button class="icon-btn btn-del-artist"  title="削除"><i data-lucide="trash-2"></i></button>`;
    Utils.refreshIcons(el);

    if (artist.hasIcon) {
      DB.getArtistIcon(artist.id).then(url => {
        const img = el.querySelector(`[data-artist-load="${artist.id}"]`);
        if (img && url) img.src = url;
      });
    }

    el.querySelector('.btn-edit-artist').onclick = () => openEditArtistModal(artist.id);
    el.querySelector('.btn-del-artist').onclick  = async () => {
      const ok = await Utils.confirmDialog(`アーティスト「${artist.name}」を削除しますか？\n全ての曲から削除されます。`,'アーティスト削除');
      if (!ok) return;
      Store.removeArtist(artist.id);
      await DB.deleteArtist(artist.id);
      if (artist.hasIcon) await DB.deleteArtistIcon(artist.id);
      await Store.persistTracks();
      Utils.showToast('アーティストを削除しました','success');
    };
    return el;
  }

  function openCreateArtistModal() {
    let iconDataUrl = null;
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>アーティストを追加</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <div class="artist-icon-edit-wrap">
          <div class="artist-icon-edit-preview" id="artist-icon-preview"><i data-lucide="user"></i></div>
          <label class="btn btn-sm btn-secondary" for="artist-icon-input">アイコンを選択</label>
          <input type="file" id="artist-icon-input" accept="image/*" style="display:none">
        </div>
        <div class="form-group">
          <label class="form-label">アーティスト名</label>
          <input type="text" id="artist-name-input" class="form-input" placeholder="アーティスト名" maxlength="100">
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button><button class="btn btn-primary" id="btn-artist-create">追加</button></div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        Utils.refreshIcons(c);
        const nameInput = c.querySelector('#artist-name-input'); nameInput.focus();
        const iconInput = c.querySelector('#artist-icon-input');
        const preview   = c.querySelector('#artist-icon-preview');
        iconInput.onchange = async () => {
          const f = iconInput.files[0]; if (!f) return;
          iconDataUrl = await Utils.fileToDataUrl(f);
          preview.innerHTML = `<img src="${iconDataUrl}" class="artist-icon-img">`;
        };
        c.querySelector('#btn-artist-create').onclick = async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.classList.add('invalid'); return; }
          const artist = { id:Utils.generateId(), name, hasIcon:!!iconDataUrl };
          Store.upsertArtist(artist);
          await DB.saveArtist(artist);
          if (iconDataUrl) await DB.saveArtistIcon(artist.id, iconDataUrl);
          m.close(); Utils.showToast('アーティストを追加しました','success');
        };
      }
    });
  }

  function openEditArtistModal(artistId) {
    const artist = Store.getArtist(artistId);
    if (!artist) return;
    let iconDataUrl = null;
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>アーティストを編集</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <div class="artist-icon-edit-wrap">
          <div class="artist-icon-edit-preview" id="artist-icon-preview">${artist.hasIcon?`<img id="artist-cur-icon" class="artist-icon-img">`:'<i data-lucide="user"></i>'}</div>
          <label class="btn btn-sm btn-secondary" for="artist-icon-input">アイコンを変更</label>
          <input type="file" id="artist-icon-input" accept="image/*" style="display:none">
        </div>
        <div class="form-group">
          <label class="form-label">アーティスト名</label>
          <input type="text" id="artist-name-input" class="form-input" value="${Utils.escapeHtml(artist.name)}" maxlength="100">
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button><button class="btn btn-primary" id="btn-artist-save">保存</button></div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: async c => {
        Utils.refreshIcons(c);
        const nameInput = c.querySelector('#artist-name-input');
        const iconInput = c.querySelector('#artist-icon-input');
        const preview   = c.querySelector('#artist-icon-preview');
        if (artist.hasIcon) {
          const url = await DB.getArtistIcon(artist.id);
          const img = c.querySelector('#artist-cur-icon');
          if (img && url) img.src = url;
        }
        iconInput.onchange = async () => {
          const f = iconInput.files[0]; if (!f) return;
          iconDataUrl = await Utils.fileToDataUrl(f);
          preview.innerHTML = `<img src="${iconDataUrl}" class="artist-icon-img">`;
        };
        c.querySelector('#btn-artist-save').onclick = async () => {
          const name = nameInput.value.trim();
          if (!name) { nameInput.classList.add('invalid'); return; }
          const updated = { ...artist, name, hasIcon: iconDataUrl ? true : artist.hasIcon };
          Store.upsertArtist(updated);
          await DB.saveArtist(updated);
          if (iconDataUrl) await DB.saveArtistIcon(artistId, iconDataUrl);
          // 全トラックの表示名更新
          await Store.persistTracks();
          m.close(); Utils.showToast('アーティスト情報を更新しました','success');
        };
      }
    });
  }

  return { init, openTrackEditModal, refreshSongs, refreshTags, refreshArtists, switchInfoView };
})();
