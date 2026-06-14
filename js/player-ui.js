'use strict';
/* ============================================================
   player-ui.js – プレイヤー画面 UI
   ============================================================ */
const PlayerUI = (() => {
  /* ---- 仮想スクロールインスタンス ---- */
  let trackVS = null;

  /* ---- 状態 ---- */
  let thumbCache = new Map(); // trackId -> dataUrl

  /* ======================== 初期化 ======================== */
  function init() {
    setupPlayerWidget();
    setupMiniPlayer();
    setupPlaylistTabs();
    setupToolbar();
    setupSortRow();
    setupFileList();
    setupSpeedMenu();

    AudioEngine.on('timeupdate', updateProgressUI);
    AudioEngine.on('trackloaded', onTrackLoaded);
    AudioEngine.on('play',   () => updatePlayBtn(true));
    AudioEngine.on('pause',  () => updatePlayBtn(false));
    AudioEngine.on('ended',  () => updatePlayBtn(false));

    Store.subscribe('currentTrackId', onTrackChanged);
    Store.subscribe('isPlaying',      v => updatePlayBtn(v));
    Store.subscribe('shuffle',        v => updateShuffleBtn(v));
    Store.subscribe('loopMode',       v => updateLoopBtn(v));
    Store.subscribe('speed',          v => updateSpeedBtn(v));
    Store.subscribe('tracks',         () => refreshTrackList());
    Store.subscribe('playlists',      () => { renderPlaylistTabs(); refreshTrackList(); });
    Store.subscribe('currentPlaylistId', () => { renderPlaylistTabs(); refreshTrackList(); });
    Store.subscribe('playerSearch',   () => refreshTrackList());
    Store.subscribe('playerSort',     () => refreshTrackList());
    Store.subscribe('playerSortAsc',  () => refreshTrackList());
    Store.subscribe('isSelectMode',   v => toggleSelectMode(v));
    Store.subscribe('selectedTrackIds', () => updateSelectBar());
    Store.subscribe('tags',           () => refreshTrackList());
    Store.subscribe('artists',        () => refreshTrackList());

    // 検索クリアボタン
    const _si = document.getElementById('track-search');
    const _cb = document.getElementById('track-search-clear');
    if (_si && _cb) {
      _si.addEventListener('input', () => _cb.classList.toggle('hidden', !_si.value));
      _cb.addEventListener('click', () => { _si.value=''; Store.set('playerSearch',''); _cb.classList.add('hidden'); });
    }

    // 初期レンダリング（データは loadAllData で読み込み済み）
    renderPlaylistTabs();
    refreshTrackList();
  }

  /* ======================== プレイヤーウィジェット (2) ======================== */
  function setupPlayerWidget() {
    document.getElementById('btn-play').onclick  = togglePlayPause;
    document.getElementById('btn-next').onclick  = () => AudioEngine.next();
    document.getElementById('btn-prev').onclick  = () => AudioEngine.prev();

    document.getElementById('btn-shuffle').onclick = () => {
      const s = !Store.get('shuffle');
      AudioEngine.setShuffle(s);
    };

    document.getElementById('btn-loop').onclick = () => {
      const modes = ['none','all','one'];
      const cur = Store.get('loopMode');
      const next = modes[(modes.indexOf(cur)+1) % modes.length];
      AudioEngine.setLoopMode(next);
    };

    const seek = document.getElementById('player-seek');
    let isSeeking = false;
    seek.addEventListener('mousedown',  () => { isSeeking=true; });
    seek.addEventListener('touchstart', () => { isSeeking=true; });
    seek.addEventListener('input',      () => { if(isSeeking){ document.getElementById('player-time-current').textContent = Utils.formatDuration(+seek.value); } });
    seek.addEventListener('change',     () => { AudioEngine.seek(+seek.value); isSeeking=false; });
  }

  function updateProgressUI(time) {
    const dur = Store.get('duration') || 0;
    const seek = document.getElementById('player-seek');
    if (!seek) return;
    seek.max = dur || 100;
    if (!seek.matches(':active') && !seek.matches(':focus')) seek.value = time;
    document.getElementById('player-time-current').textContent = Utils.formatDuration(time);
    document.getElementById('player-time-total').textContent   = Utils.formatDuration(dur);
  }

  function onTrackLoaded(track) {
    document.getElementById('player-title').textContent  = track.title || '不明なタイトル';
    const artists = (track.artistIds||[]).map(id => Store.getArtist(id)).filter(Boolean).map(a=>a.name);
    const artistStr = artists.length ? artists.join(', ') : (track.artistName || '不明のアーティスト');
    document.getElementById('player-artist').textContent = artistStr;
    // ミニプレイヤーのテキストも更新
    const mt = document.getElementById('mini-title');
    const ma = document.getElementById('mini-artist');
    if (mt) mt.textContent = track.title || '不明なタイトル';
    if (ma) ma.textContent = artistStr;
    loadThumbnailInto('player-thumbnail', 'player-thumbnail-placeholder', track.id);
    loadThumbnailInto('mini-thumb', 'mini-thumb-placeholder', track.id);
    document.getElementById('player-seek').value = 0;
    document.getElementById('player-time-current').textContent = '0:00';
    document.getElementById('player-time-total').textContent   = Utils.formatDuration(track.duration);
  }

  function onTrackChanged(id) {
    if (!id) {
      document.getElementById('player-title').textContent  = '曲を選択してください';
      document.getElementById('player-artist').textContent = '';
      document.getElementById('mini-title').textContent    = '再生停止中';
      document.getElementById('mini-artist').textContent   = '---';
    }
    refreshTrackList();
  }

  function togglePlayPause() {
    if (AudioEngine.isPlaying()) AudioEngine.pause();
    else {
      const cur = Store.get('currentTrackId');
      if (cur) AudioEngine.play();
      else {
        const tracks = getFilteredSortedTracks();
        if (tracks.length) AudioEngine.playTrack(tracks[0].id);
      }
    }
  }

  function updatePlayBtn(playing) {
    const btn = document.getElementById('btn-play');
    if (!btn) return;
    btn.innerHTML = playing
      ? '<i data-lucide="pause"></i>'
      : '<i data-lucide="play"></i>';
    Utils.refreshIcons(btn);
    // Mini player
    const mb = document.getElementById('mini-btn-play');
    if (mb) { mb.innerHTML = btn.innerHTML; Utils.refreshIcons(mb); }
  }

  function updateShuffleBtn(on) {
    document.getElementById('btn-shuffle')?.classList.toggle('active', on);
  }

  function updateLoopBtn(mode) {
    const btn = document.getElementById('btn-loop');
    if (!btn) return;
    btn.classList.toggle('active', mode !== 'none');
    if (mode === 'one') btn.innerHTML = '<i data-lucide="repeat-1"></i>';
    else btn.innerHTML = '<i data-lucide="repeat"></i>';
    Utils.refreshIcons(btn);
  }

  function updateSpeedBtn(rate) {
    const btn = document.getElementById('btn-speed');
    if (btn) btn.textContent = rate + 'x';
    document.querySelectorAll('#speed-menu button').forEach(b => {
      b.classList.toggle('active', +b.dataset.speed === rate);
    });
  }

  /* ======================== ミニプレイヤー (12) ======================== */
  function setupMiniPlayer() {
    document.getElementById('mini-btn-play').onclick = togglePlayPause;
    document.getElementById('mini-btn-next').onclick = () => AudioEngine.next();
    document.getElementById('mini-btn-prev').onclick = () => AudioEngine.prev();
    document.getElementById('mini-player').onclick = e => {
      if (e.target.closest('button')) return;
      openFullPlayerModal();
    };
  }

  function openFullPlayerModal() {
    const track = Store.getTrack(Store.get('currentTrackId'));
    const dur = Store.get('duration') || 0;
    const cur = AudioEngine.getCurrentTime();
    const shuffle = Store.get('shuffle');
    const loop = Store.get('loopMode');
    const speed = Store.get('speed');
    const html = `
    <div class="modal-dialog modal-player">
      <div class="modal-header">
        <h3>再生中</h3>
        <button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button>
      </div>
      <div class="full-player-body">
        <div class="fp-thumb-wrap" id="fp-thumb-wrap">
          <img id="fp-thumb" src="" alt="" style="display:none">
          <div class="fp-thumb-placeholder" id="fp-thumb-ph"><i data-lucide="music"></i></div>
        </div>
        <div class="fp-title" id="fp-title">${Utils.escapeHtml(track?.title || '不明なタイトル')}</div>
        <div class="fp-artist" id="fp-artist">${Utils.escapeHtml(getTrackArtistName(track))}</div>
        <div class="fp-progress-wrap">
          <span id="fp-cur">${Utils.formatDuration(cur)}</span>
          <input type="range" id="fp-seek" min="0" max="${dur}" value="${cur}" step="0.1">
          <span id="fp-dur">${Utils.formatDuration(dur)}</span>
        </div>
        <div class="fp-controls">
          <button class="ctrl-btn ${shuffle?'active':''}" id="fp-shuffle"><i data-lucide="shuffle"></i></button>
          <button class="ctrl-btn" onclick="AudioEngine.prev()"><i data-lucide="skip-back"></i></button>
          <button class="ctrl-btn ctrl-btn-main" id="fp-play">${AudioEngine.isPlaying()?'<i data-lucide="pause"></i>':'<i data-lucide="play"></i>'}</button>
          <button class="ctrl-btn" onclick="AudioEngine.next()"><i data-lucide="skip-forward"></i></button>
          <button class="ctrl-btn ${loop!=='none'?'active':''}" id="fp-loop">${loop==='one'?'<i data-lucide="repeat-1"></i>':'<i data-lucide="repeat"></i>'}</button>
        </div>
        <div class="fp-speed-wrap">
          <span class="fp-speed-label">速度</span>
          <div class="fp-speed-btns">
            ${[0.5,0.75,1,1.25,1.5,2].map(s=>`<button class="speed-preset-btn ${s===speed?'active':''}" data-speed="${s}">${s}x</button>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        if (track) loadThumbnailInto('fp-thumb','fp-thumb-ph',track.id);
        c.querySelector('#fp-shuffle').onclick = () => {
          const s=!Store.get('shuffle'); AudioEngine.setShuffle(s);
          c.querySelector('#fp-shuffle').classList.toggle('active',s);
        };
        c.querySelector('#fp-play').onclick = () => { togglePlayPause(); };
        c.querySelector('#fp-loop').onclick = () => {
          const modes=['none','all','one'], cur=Store.get('loopMode');
          const next=modes[(modes.indexOf(cur)+1)%modes.length];
          AudioEngine.setLoopMode(next);
        };
        const fpSeek = c.querySelector('#fp-seek');
        fpSeek.addEventListener('change', () => AudioEngine.seek(+fpSeek.value));
        // live update
        const tid = setInterval(() => {
          const t=AudioEngine.getCurrentTime(), d=Store.get('duration')||0;
          if(c.isConnected){
            fpSeek.max=d; if(!fpSeek.matches(':active')) fpSeek.value=t;
            const cc=c.querySelector('#fp-cur'); if(cc) cc.textContent=Utils.formatDuration(t);
          } else clearInterval(tid);
        }, 500);
        c.querySelectorAll('.fp-speed-btns button').forEach(b => {
          b.onclick = () => {
            AudioEngine.setSpeed(+b.dataset.speed);
            c.querySelectorAll('.fp-speed-btns button').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
          };
        });
      }
    });
  }

  /* ======================== 速度メニュー ======================== */
  function setupSpeedMenu() {
    const btn = document.getElementById('btn-speed');
    const menu = document.getElementById('speed-menu');
    btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); };
    menu.querySelectorAll('button').forEach(b => {
      b.onclick = () => { AudioEngine.setSpeed(+b.dataset.speed); menu.classList.add('hidden'); };
    });
    document.addEventListener('click', () => menu.classList.add('hidden'));
  }

  /* ======================== ツールバー ======================== */
  function setupToolbar() {
    const search = document.getElementById('track-search');
    search.addEventListener('input', Utils.debounce(() => {
      Store.set('playerSearch', search.value);
    }, 200));

    document.getElementById('btn-create-playlist').onclick = openCreatePlaylistModal;
    document.getElementById('btn-add-file').onclick        = openFileAddModal;
    document.getElementById('btn-file-select').onclick     = () => {
      const mode = !Store.get('isSelectMode');
      Store.set('isSelectMode', mode);
      Store.set('selectedTrackIds', new Set());
    };
  }

  /* ======================== ソート行 ======================== */
  function setupSortRow() {
    const sortBtn = document.getElementById('btn-sort');
    const sortMenu = document.getElementById('sort-menu');
    sortBtn.onclick = e => { e.stopPropagation(); sortMenu.classList.toggle('hidden'); };
    sortMenu.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        Store.set('playerSort', b.dataset.sort);
        document.getElementById('sort-label').textContent = b.textContent;
        sortMenu.classList.add('hidden');
        updateSortLabel();
      };
    });
    document.addEventListener('click', () => sortMenu.classList.add('hidden'));

    document.getElementById('btn-order').onclick = () => {
      const asc = !Store.get('playerSortAsc');
      Store.set('playerSortAsc', asc);
      updateOrderBtn(asc);
    };

    // Multi-select actions
    document.getElementById('btn-select-all').onclick = () => {
      const tracks = getFilteredSortedTracks();
      Store.set('selectedTrackIds', new Set(tracks.map(t=>t.id)));
    };
    document.getElementById('btn-select-none').onclick = () => {
      Store.set('selectedTrackIds', new Set());
      Store.set('isSelectMode', false);
    };
    document.getElementById('btn-multi-add').onclick    = openMultiAddModal;
    document.getElementById('btn-multi-tag').onclick    = openMultiTagModal;
    document.getElementById('btn-multi-delete').onclick = multiDeleteTracks;
  }

  function updateSortLabel() {
    const labels = { manual:'手動順', added:'追加日順', title:'タイトル順', release:'投稿日順' };
    document.getElementById('sort-label').textContent = labels[Store.get('playerSort')] || '手動順';
  }

  function updateOrderBtn(asc) {
    const btn = document.getElementById('btn-order');
    if (!btn) return;
    btn.innerHTML = asc ? '<i data-lucide="arrow-up"></i>' : '<i data-lucide="arrow-down"></i>';
    btn.title = asc ? '昇順' : '降順';
    Utils.refreshIcons(btn);
  }

  function toggleSelectMode(enabled) {
    document.getElementById('sort-row').classList.toggle('select-mode', enabled);
    document.getElementById('multi-select-bar').classList.toggle('hidden', !enabled);
    document.getElementById('btn-file-select').classList.toggle('active', enabled);
    refreshTrackList();
  }

  function updateSelectBar() {
    const sel = Store.get('selectedTrackIds');
    document.getElementById('select-count').textContent = `${sel.size}件選択`;
  }

  /* ======================== プレイリストタブ ======================== */
  function setupPlaylistTabs() { /* delegated to renderPlaylistTabs */ }

  function renderPlaylistTabs() {
    const container = document.getElementById('playlist-tabs');
    if (!container) return;
    const playlists = Store.get('playlists');
    const curId = Store.get('currentPlaylistId');
    container.innerHTML = playlists.map(pl => `
      <div class="pl-tab ${pl.id===curId?'active':''}" data-id="${pl.id}">
        <span>${Utils.escapeHtml(pl.name)}</span>
        ${!pl.isDefault ? `
          <button class="pl-tab-edit"  data-id="${pl.id}" title="編集"><i data-lucide="pencil"></i></button>
          <button class="pl-tab-del"   data-id="${pl.id}" title="削除"><i data-lucide="trash-2"></i></button>` : ''}
      </div>`).join('');
    Utils.refreshIcons(container);

    container.querySelectorAll('.pl-tab').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        Store.set('currentPlaylistId', el.dataset.id);
      });
    });
    container.querySelectorAll('.pl-tab-edit').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); openEditPlaylistModal(btn.dataset.id); };
    });
    container.querySelectorAll('.pl-tab-del').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const pl = Store.getPlaylist(btn.dataset.id);
        if (!pl) return;
        const ok = await Utils.confirmDialog(`「${pl.name}」を削除しますか？\n曲自体は削除されません。`,'プレイリスト削除','削除','btn-danger');
        if (!ok) return;
        Store.removePlaylist(btn.dataset.id);
        await DB.deletePlaylist(btn.dataset.id);
        Utils.showToast('プレイリストを削除しました','success');
      };
    });
  }

  /* ======================== ファイル一覧 (11) ======================== */
  function setupFileList() {
    const container = document.getElementById('file-list');
    if (!container) return;
    trackVS = new VirtualScroll(container, {
      itemHeight: 76,
      buffer: 6,
      renderItem: renderTrackItem,
      onEmpty: () => {
        const div = document.createElement('div');
        div.className = 'list-empty';
        div.innerHTML = '<i data-lucide="music"></i><p>曲がありません</p><p class="hint">右上の + ボタンから曲を追加してください</p>';
        Utils.refreshIcons(div);
        return div;
      }
    });
  }

  function getFilteredSortedTracks() {
    const plId = Store.get('currentPlaylistId');
    const raw  = plId === Store.DEFAULT_PLAYLIST_ID
      ? Store.get('tracks')
      : Store.getPlaylistTracks(plId);
    const q = Store.get('playerSearch').toLowerCase().trim();
    let filtered = q ? raw.filter(t => {
      const artists = (t.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean).map(a=>a.name);
      const tags    = (t.tagIds||[]).map(id=>Store.getTag(id)).filter(Boolean).map(tg=>tg.name);
      return t.title.toLowerCase().includes(q)
          || artists.some(a=>a.toLowerCase().includes(q))
          || tags.some(tg=>tg.toLowerCase().includes(q))
          || (t.releaseDate||'').includes(q);
    }) : raw;
    return Store.applySort(filtered, Store.get('playerSort'), Store.get('playerSortAsc'), plId);
  }

  function refreshTrackList() {
    if (!trackVS) return;
    trackVS.setItems(getFilteredSortedTracks());
  }

  function renderTrackItem(track, index) {
    const el = document.createElement('div');
    el.className = 'track-item';
    el.dataset.id = track.id;
    const isPlaying = Store.get('currentTrackId') === track.id;
    if (isPlaying) el.classList.add('playing');

    const isSelectMode = Store.get('isSelectMode');
    const isSelected   = Store.get('selectedTrackIds').has(track.id);
    const isSorted     = Store.get('playerSort') === 'manual';

    const artists = (track.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean).map(a=>a.name);
    const artistStr = artists.length ? artists.join(', ') : (track.artistName||'不明のアーティスト');

    const tags = (track.tagIds||[]).slice(0,4).map(id=>Store.getTag(id)).filter(Boolean);
    const tagsHtml = tags.map(t=>`<span class="track-tag-dot" style="background:${t.color}" title="${Utils.escapeHtml(t.name)}"></span>`).join('')
                  + (track.tagIds && track.tagIds.length > 4 ? `<span class="track-tag-more">+${track.tagIds.length-4}</span>` : '');

    el.innerHTML = `
      ${isSelectMode ? `<div class="track-check-wrap"><div class="track-check ${isSelected?'checked':''}"><i data-lucide="check"></i></div></div>` : ''}
      <div class="track-thumb-wrap">
        <img class="track-thumb" data-track-id="${track.id}" src="" alt="" style="display:none">
        <div class="track-thumb-ph"><i data-lucide="music"></i></div>
        ${isPlaying ? '<div class="track-playing-indicator"><span></span><span></span><span></span></div>' : ''}
      </div>
      <div class="track-info">
        <div class="track-title">${Utils.escapeHtml(track.title)}</div>
        <div class="track-artist">${Utils.escapeHtml(artistStr)}</div>
        <div class="track-tags">${tagsHtml}</div>
      </div>
      <div class="track-duration">${Utils.formatDuration(track.duration)}</div>
      <div class="track-actions">
        <button class="track-action-btn btn-add-pl" title="プレイリストに追加"><i data-lucide="list-plus"></i></button>
        <button class="track-action-btn btn-edit" title="編集"><i data-lucide="pencil"></i></button>
        <button class="track-action-btn btn-del" title="削除"><i data-lucide="trash-2"></i></button>
        ${isSorted ? '<div class="track-reorder"><button class="reorder-btn btn-up"><i data-lucide="chevron-up"></i></button><button class="reorder-btn btn-down"><i data-lucide="chevron-down"></i></button></div>' : ''}
      </div>`;

    Utils.refreshIcons(el);

    // サムネイル遅延ロード
    lazyLoadThumbnail(el.querySelector('.track-thumb'), el.querySelector('.track-thumb-ph'), track.id);

    // イベント
    el.addEventListener('click', e => {
      if (e.target.closest('.track-actions') || e.target.closest('.track-check-wrap')) return;
      if (isSelectMode) { toggleSelectTrack(track.id); return; }
      AudioEngine.playTrack(track.id);
    });

    if (isSelectMode) {
      el.querySelector('.track-check-wrap').onclick = () => toggleSelectTrack(track.id);
    }

    el.querySelector('.btn-add-pl').onclick = e => { e.stopPropagation(); openAddToPlaylistModal([track.id]); };
    el.querySelector('.btn-edit').onclick   = e => { e.stopPropagation(); openTrackEditModal(track.id); };
    el.querySelector('.btn-del').onclick    = async e => {
      e.stopPropagation();
      const ok = await Utils.confirmDialog(`「${track.title}」を削除しますか？`,'曲の削除');
      if (!ok) return;
      await deleteTrack(track.id);
    };

    if (isSorted) {
      el.querySelector('.btn-up').onclick   = e => { e.stopPropagation(); moveTrackInPlaylist(track.id, -1); };
      el.querySelector('.btn-down').onclick = e => { e.stopPropagation(); moveTrackInPlaylist(track.id, 1); };
    }

    return el;
  }

  function toggleSelectTrack(id) {
    const sel = new Set(Store.get('selectedTrackIds'));
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    Store.set('selectedTrackIds', sel);
    refreshTrackList();
  }

  function moveTrackInPlaylist(trackId, dir) {
    const plId = Store.get('currentPlaylistId');
    const pl = Store.getPlaylist(plId);
    if (!pl) return;
    const ids = [...pl.trackIds];
    const idx = ids.indexOf(trackId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    Store.upsertPlaylist({ ...pl, trackIds: ids });
    DB.savePlaylist({ ...pl, trackIds: ids });
    refreshTrackList();
  }

  /* ======================== サムネイル ======================== */
  async function lazyLoadThumbnail(img, placeholder, trackId) {
    if (!img || !trackId) return;
    if (thumbCache.has(trackId)) {
      const url = thumbCache.get(trackId);
      if (url) { img.src = url; img.style.display=''; if(placeholder) placeholder.style.display='none'; }
      return;
    }
    const url = await DB.getThumbnail(trackId);
    thumbCache.set(trackId, url || null);
    if (url && img.isConnected) {
      img.src = url; img.style.display='';
      if (placeholder) placeholder.style.display='none';
    }
  }

  async function loadThumbnailInto(imgId, phId, trackId) {
    const img = document.getElementById(imgId);
    const ph  = document.getElementById(phId);
    if (!img) return;
    if (!trackId) { img.style.display='none'; if(ph) ph.style.display=''; return; }
    if (thumbCache.has(trackId)) {
      const url = thumbCache.get(trackId);
      if (url) {
        img.src=url; img.style.display=''; if(ph) ph.style.display='none';
        if (imgId === 'player-thumbnail') _updateBlurBg(url);
      } else { img.style.display='none'; if(ph) ph.style.display=''; }
      return;
    }
    const url = await DB.getThumbnail(trackId);
    thumbCache.set(trackId, url || null);
    if (url) {
      img.src=url; img.style.display=''; if(ph) ph.style.display='none';
      if (imgId === 'player-thumbnail') _updateBlurBg(url);
    } else { img.style.display='none'; if(ph) ph.style.display=''; }
  }

  function _updateBlurBg(url) {
    const blur = document.getElementById('pw-bg-blur');
    if (blur) { blur.style.backgroundImage=`url(${url})`; blur.style.backgroundSize='cover'; blur.style.backgroundPosition='center'; }
  }

  function invalidateThumbCache(trackId) {
    thumbCache.delete(trackId);
  }

  /* ======================== トラック削除 ======================== */
  async function deleteTrack(id) {
    AudioEngine.onTrackDeleted(id);
    Store.removeTrack(id);
    thumbCache.delete(id);
    await DB.deleteTrack(id);
    await DB.deleteAudioBlob(id);
    await DB.deleteThumbnail(id);
    await Store.persistPlaylists();
    Utils.showToast('曲を削除しました', 'success');
  }

  /* ======================== ヘルパー ======================== */
  function getTrackArtistName(track) {
    if (!track) return '';
    const artists = (track.artistIds||[]).map(id=>Store.getArtist(id)).filter(Boolean).map(a=>a.name);
    return artists.length ? artists.join(', ') : (track.artistName||'不明のアーティスト');
  }

  /* ======================== ファイル追加モーダル (6) ======================== */
  function openFileAddModal() {
    const html = `
    <div class="modal-dialog modal-file-add">
      <div class="modal-header">
        <h3>ファイルを追加</h3>
        <button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <div class="drop-zone" id="drop-zone">
          <i data-lucide="upload-cloud"></i>
          <p>ここにファイルをドラッグ＆ドロップ</p>
          <p class="hint">または</p>
          <label class="btn btn-secondary" for="file-input-hidden">ファイルを選択</label>
          <input type="file" id="file-input-hidden" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" style="display:none">
        </div>
        <div id="pending-list" class="pending-list" style="display:none"></div>
        <div id="upload-progress" class="upload-progress" style="display:none">
          <div class="progress-bar-wrap"><div class="progress-bar" id="prog-bar"></div></div>
          <div id="prog-label" class="prog-label">読み込み中...</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-start-add" disabled>追加する</button>
      </div>
    </div>`;

    let pendingFiles = [];
    const m = Utils.showModal(html, {
      onOpen: c => {
        const dropZone = c.querySelector('#drop-zone');
        const fileInput = c.querySelector('#file-input-hidden');
        const pendingList = c.querySelector('#pending-list');
        const startBtn = c.querySelector('#btn-start-add');

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
          e.preventDefault(); dropZone.classList.remove('drag-over');
          addFiles([...e.dataTransfer.files].filter(Utils.isAudioFile));
        });
        fileInput.addEventListener('change', () => addFiles([...fileInput.files].filter(Utils.isAudioFile)));

        function addFiles(files) {
          files.forEach(f => { if (!pendingFiles.some(p=>p.file.name===f.name && p.file.size===f.size)) pendingFiles.push({ file:f, meta:null, previewUrl:null }); });
          renderPendingList();
          if (pendingFiles.length) { pendingList.style.display=''; startBtn.disabled=false; }
        }

        async function renderPendingList() {
          pendingList.innerHTML = '';
          for (const p of pendingFiles) {
            if (!p.meta) p.meta = await Metadata.extract(p.file).catch(()=>({ title:p.file.name.replace(/\.[^.]+$/,''), artist:null, releaseDate:null, thumbnail:null, duration:0 }));
          }
          pendingFiles.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'pending-item';
            row.innerHTML = `
              <div class="pending-thumb-wrap">
                ${p.meta?.thumbnail ? `<img src="${p.meta.thumbnail}" class="pending-thumb">` : '<div class="pending-thumb-ph"><i data-lucide="music"></i></div>'}
              </div>
              <div class="pending-info">
                <div class="pending-title">${Utils.escapeHtml(p.meta?.title||p.file.name)}</div>
                <div class="pending-artist">${Utils.escapeHtml(p.meta?.artist||'不明のアーティスト')}</div>
                <div class="pending-meta">${Utils.formatFileSize(p.file.size)} ${p.meta?.releaseDate||''}</div>
              </div>
              <button class="pending-del icon-btn" data-idx="${i}" title="削除"><i data-lucide="x"></i></button>`;
            Utils.refreshIcons(row);
            row.querySelector('.pending-del').onclick = () => {
              pendingFiles.splice(i,1); renderPendingList();
              if (!pendingFiles.length) { pendingList.style.display='none'; startBtn.disabled=true; }
            };
            pendingList.appendChild(row);
          });
        }

        startBtn.onclick = async () => {
          if (!pendingFiles.length) return;
          startBtn.disabled = true;
          c.querySelector('#upload-progress').style.display = '';
          const bar = c.querySelector('#prog-bar');
          const label = c.querySelector('#prog-label');

          // ensure artist for "unknown"
          let unknownArtist = Store.get('artists').find(a=>a.name==='不明のアーティスト');
          if (!unknownArtist) {
            unknownArtist = { id: Utils.generateId(), name:'不明のアーティスト', hasIcon:false };
            Store.upsertArtist(unknownArtist);
            await DB.saveArtist(unknownArtist);
          }

          for (let i=0; i<pendingFiles.length; i++) {
            const { file, meta } = pendingFiles[i];
            bar.style.width = Math.round((i/pendingFiles.length)*100)+'%';
            label.textContent = `${i+1}/${pendingFiles.length} 読み込み中: ${file.name}`;

            const id = Utils.generateId();
            const blob = new Blob([await Utils.fileToArrayBuffer(file)], { type: file.type || 'audio/mpeg' });

            // アーティスト処理
            let artistIds = [];
            if (meta?.artist && meta.artist.trim()) {
              const artistName = meta.artist.trim();
              let artist = Store.get('artists').find(a=>a.name===artistName);
              if (!artist) {
                artist = { id:Utils.generateId(), name:artistName, hasIcon:false };
                Store.upsertArtist(artist);
                await DB.saveArtist(artist);
              }
              artistIds = [artist.id];
            } else {
              artistIds = [unknownArtist.id];
            }

            const track = {
              id, fileName: file.name, title: meta?.title||file.name.replace(/\.[^.]+$/,''),
              artistIds, tagIds: [], releaseDate: meta?.releaseDate||null,
              duration: meta?.duration||0, hasThumbnail: !!meta?.thumbnail,
              addedAt: Date.now(),
            };

            await DB.saveAudioBlob(id, blob);
            if (meta?.thumbnail) await DB.saveThumbnail(id, meta.thumbnail);
            await DB.saveTrack(track);
            Store.upsertTrack(track);
            thumbCache.set(id, meta?.thumbnail||null);

            // 全曲リストと現在のリストに追加
            Store.addTracksToPlaylist(Store.DEFAULT_PLAYLIST_ID, [id]);
            const curId = Store.get('currentPlaylistId');
            if (curId !== Store.DEFAULT_PLAYLIST_ID) Store.addTracksToPlaylist(curId, [id]);
          }

          await Store.persistPlaylists();
          bar.style.width = '100%';
          label.textContent = '完了！';
          setTimeout(() => { Utils.closeModal(); Utils.showToast(`${pendingFiles.length}曲を追加しました`,'success'); }, 500);
        };
      }
    });
  }

  /* ======================== プレイリスト作成/編集モーダル (5) ======================== */
  function openCreatePlaylistModal() {
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>プレイリストを作成</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <label class="form-label">プレイリスト名</label>
        <input type="text" id="pl-name-input" class="form-input" placeholder="例: お気に入り" maxlength="50">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-pl-create">作成</button>
      </div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        const input = c.querySelector('#pl-name-input');
        input.focus();
        const create = async () => {
          const name = input.value.trim();
          if (!name) { input.classList.add('invalid'); return; }
          const pl = { id: Utils.generateId(), name, trackIds:[], createdAt:Date.now(), isDefault:false };
          Store.upsertPlaylist(pl);
          await DB.savePlaylist(pl);
          m.close();
          Utils.showToast('プレイリストを作成しました','success');
        };
        c.querySelector('#btn-pl-create').onclick = create;
        input.onkeydown = e => { if(e.key==='Enter') create(); };
      }
    });
  }

  function openEditPlaylistModal(plId) {
    const pl = Store.getPlaylist(plId);
    if (!pl) return;
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>プレイリストを編集</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        <label class="form-label">プレイリスト名</label>
        <input type="text" id="pl-edit-input" class="form-input" value="${Utils.escapeHtml(pl.name)}" maxlength="50">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-pl-save">保存</button>
      </div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        const input = c.querySelector('#pl-edit-input'); input.focus(); input.select();
        const save = async () => {
          const name = input.value.trim();
          if (!name) { input.classList.add('invalid'); return; }
          const updated = { ...pl, name };
          Store.upsertPlaylist(updated);
          await DB.savePlaylist(updated);
          m.close();
          Utils.showToast('プレイリスト名を変更しました','success');
        };
        c.querySelector('#btn-pl-save').onclick = save;
        input.onkeydown = e => { if(e.key==='Enter') save(); };
      }
    });
  }

  /* ======================== プレイリストに追加 モーダル ======================== */
  function openAddToPlaylistModal(trackIds) {
    const playlists = Store.get('playlists').filter(p=>!p.isDefault);
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>プレイリストに追加</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        ${playlists.length ? `<div class="pl-select-list">${playlists.map(p=>`<button class="pl-select-item" data-id="${p.id}"><i data-lucide="list-music"></i>${Utils.escapeHtml(p.name)}</button>`).join('')}</div>`
          : '<p class="text-muted">プレイリストがありません。先にプレイリストを作成してください。</p>'}
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button></div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        Utils.refreshIcons(c);
        c.querySelectorAll('.pl-select-item').forEach(btn => {
          btn.onclick = async () => {
            Store.addTracksToPlaylist(btn.dataset.id, trackIds);
            await Store.persistPlaylists();
            m.close();
            Utils.showToast(`${trackIds.length}曲をプレイリストに追加しました`,'success');
          };
        });
      }
    });
  }

  /* ======================== 複数選択操作 ======================== */
  async function openMultiAddModal() {
    const ids = [...Store.get('selectedTrackIds')];
    if (!ids.length) return;
    openAddToPlaylistModal(ids);
  }

  function openMultiTagModal() {
    const sel = [...Store.get('selectedTrackIds')];
    if (!sel.length) return;
    const tags = Store.get('tags');
    const html = `
    <div class="modal-dialog modal-sm">
      <div class="modal-header"><h3>タグを一括付与 (${sel.length}曲)</h3><button class="modal-close" onclick="Utils.closeModal()"><i data-lucide="x"></i></button></div>
      <div class="modal-body">
        ${tags.length ? `<div class="tag-select-list">${tags.map(t=>`<button class="tag-select-btn" data-id="${t.id}"><span class="tag-dot" style="background:${t.color}"></span>${Utils.escapeHtml(t.name)}</button>`).join('')}</div>`
          : '<p class="text-muted">タグがありません。情報編集画面からタグを作成してください。</p>'}
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="Utils.closeModal()">キャンセル</button></div>
    </div>`;
    const m = Utils.showModal(html, {
      onOpen: c => {
        c.querySelectorAll('.tag-select-btn').forEach(btn => {
          btn.onclick = async () => {
            for (const tid of sel) {
              const track = Store.getTrack(tid);
              if (!track) continue;
              if (!track.tagIds.includes(btn.dataset.id)) {
                Store.upsertTrack({ ...track, tagIds:[...track.tagIds, btn.dataset.id] });
                await DB.saveTrack({ ...track, tagIds:[...track.tagIds, btn.dataset.id] });
              }
            }
            m.close(); Utils.showToast('タグを付与しました','success');
          };
        });
      }
    });
  }

  async function multiDeleteTracks() {
    const sel = [...Store.get('selectedTrackIds')];
    if (!sel.length) return;
    const ok = await Utils.confirmDialog(`${sel.length}曲を削除しますか？`,'複数削除');
    if (!ok) return;
    for (const id of sel) await deleteTrack(id);
    Store.set('isSelectMode', false);
    Store.set('selectedTrackIds', new Set());
  }

  /* ======================== 曲編集モーダル（プレイヤー側のショートカット） ======================== */
  function openTrackEditModal(trackId) {
    // 情報編集UIに委譲
    if (window.InfoEditUI) InfoEditUI.openTrackEditModal(trackId);
  }

  return {
    init,
    renderPlaylistTabs,
    refreshTrackList,
    loadThumbnailInto,
    lazyLoadThumbnail,
    invalidateThumbCache,
    openAddToPlaylistModal,
    openFileAddModal,
  };
})();
