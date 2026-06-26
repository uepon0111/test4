'use strict';

/* ========== FILTER & SORT ========== */
const FilterSort = (() => {
  const _state = {
    query:        '',
    difficulties: new Set(CONFIG.DIFFICULTIES),
    levelMin:     null,
    levelMax:     null,
    achievement:  'all',   // 'all' | 'ap' | 'ap-tournament' | 'fc' | 'none'
    missMin:      null,
    missMax:      null,
    showBest:     'all',   // 'all' | 'ap' | 'fc'
    sortBy:       'date',  // 'date' | 'name' | 'level' | 'miss'
    sortAsc:      false,
    mode:         'ap',    // current judge mode (for miss display and sorting)
  };

  /* ---- Filtering ---- */
  function filter(records) {
    let items = records.filter(r => !r.deleted);

    /* Text search */
    if (_state.query) {
      items = items.filter(r => Utils.matchesQuery(r, _state.query));
    }

    /* Difficulty filter */
    if (_state.difficulties.size < CONFIG.DIFFICULTIES.length) {
      items = items.filter(r => _state.difficulties.has(r.difficulty));
    }

    /* Level range */
    if (_state.levelMin !== null && _state.levelMin !== '') {
      items = items.filter(r => (r.level || 0) >= Number(_state.levelMin));
    }
    if (_state.levelMax !== null && _state.levelMax !== '') {
      items = items.filter(r => (r.level || 0) <= Number(_state.levelMax));
    }

    /* Achievement filter */
    switch (_state.achievement) {
      case 'ap':           items = items.filter(r => r.isAP); break;
      case 'ap-tournament':items = items.filter(r => r.isAPTournament); break;
      case 'fc':           items = items.filter(r => r.isFC); break;
      case 'none':         items = items.filter(r => !r.isFC); break;
    }

    /* Miss range filter (applied in current mode) */
    const getMiss = r => Utils.getMissForMode(r, _state.mode);
    if (_state.missMin !== null && _state.missMin !== '') {
      items = items.filter(r => getMiss(r) >= Number(_state.missMin));
    }
    if (_state.missMax !== null && _state.missMax !== '') {
      items = items.filter(r => getMiss(r) <= Number(_state.missMax));
    }

    /* Self-best filter */
    if (_state.showBest !== 'all') {
      items = applyBestFilter(items, _state.showBest, _state.mode);
    }

    return items;
  }

  /* Keep only the personal best per (musicId + difficulty) */
  function applyBestFilter(items, bestMode, mode) {
    const map = {};
    for (const r of items) {
      const key  = `${r.musicId}_${r.difficulty}`;
      const miss = bestMode === 'ap'
        ? Utils.getMissForMode(r, mode)
        : Utils.getMissForMode(r, 'fc');
      if (!(key in map) || miss < Utils.getMissForMode(map[key], bestMode === 'ap' ? mode : 'fc')) {
        map[key] = r;
      }
    }
    return Object.values(map);
  }

  /* ---- Sorting ---- */
  function sort(items) {
    const asc   = _state.sortAsc ? 1 : -1;
    const mode  = _state.mode;
    const getMiss = r => Utils.getMissForMode(r, mode);
    const getDiff = r => CONFIG.DIFFICULTY_ORDER[r.difficulty] ?? 99;
    const cmpStr  = (a, b) => (a || '').localeCompare(b || '', 'ja') * asc;
    const cmpNum  = (a, b) => ((a || 0) - (b || 0)) * asc;
    const cmpDate = (a, b) => (new Date(a.addedAt) - new Date(b.addedAt)) * asc;

    const sorted = [...items];

    switch (_state.sortBy) {
      case 'name':
        /* 名前→難易度→ミス数→追加日 */
        sorted.sort((a, b) => {
          let c = cmpStr(a.title, b.title);      if (c) return c;
          c = cmpNum(getDiff(a), getDiff(b));     if (c) return c;
          c = cmpNum(getMiss(a), getMiss(b));     if (c) return c;
          return cmpDate(a, b);
        });
        break;

      case 'level':
        /* レベル→難易度→名前→ミス数→追加日 */
        sorted.sort((a, b) => {
          let c = cmpNum(a.level, b.level);      if (c) return c;
          c = cmpNum(getDiff(a), getDiff(b));    if (c) return c;
          c = cmpStr(a.title, b.title);          if (c) return c;
          c = cmpNum(getMiss(a), getMiss(b));    if (c) return c;
          return cmpDate(a, b);
        });
        break;

      case 'miss':
        /* ミス数→レベル→難易度→名前→追加日 */
        sorted.sort((a, b) => {
          let c = cmpNum(getMiss(a), getMiss(b)); if (c) return c;
          c = cmpNum(a.level, b.level);           if (c) return c;
          c = cmpNum(getDiff(a), getDiff(b));     if (c) return c;
          c = cmpStr(a.title, b.title);           if (c) return c;
          return cmpDate(a, b);
        });
        break;

      case 'date':
      default:
        sorted.sort((a, b) => cmpDate(a, b));
        break;
    }

    return sorted;
  }

  return {
    /* Run filter + sort on a result array */
    apply(records) {
      return sort(filter(records));
    },

    /* Get filtered-only (for stats) */
    filtered(records) {
      return filter(records);
    },

    /* State setters */
    setQuery(q)           { _state.query       = q; },
    toggleDifficulty(d)   {
      if (_state.difficulties.has(d)) _state.difficulties.delete(d);
      else                            _state.difficulties.add(d);
    },
    setAllDifficulties(on){ _state.difficulties = on ? new Set(CONFIG.DIFFICULTIES) : new Set(); },
    setLevelMin(v)        { _state.levelMin     = v === '' ? null : v; },
    setLevelMax(v)        { _state.levelMax     = v === '' ? null : v; },
    setAchievement(v)     { _state.achievement  = v; },
    setMissMin(v)         { _state.missMin       = v === '' ? null : v; },
    setMissMax(v)         { _state.missMax       = v === '' ? null : v; },
    setShowBest(v)        { _state.showBest      = v; },
    setSortBy(v)          { _state.sortBy        = v; },
    toggleSortOrder()     { _state.sortAsc       = !_state.sortAsc; return _state.sortAsc; },
    setSortAsc(v)         { _state.sortAsc       = v; },
    setMode(v)            { _state.mode          = v; },

    /* Reset filters */
    resetFilters() {
      _state.query        = '';
      _state.difficulties = new Set(CONFIG.DIFFICULTIES);
      _state.levelMin     = null;
      _state.levelMax     = null;
      _state.achievement  = 'all';
      _state.missMin      = null;
      _state.missMax      = null;
      _state.showBest     = 'all';
    },

    get state()  { return { ..._state, difficulties: new Set(_state.difficulties) }; },
    get mode()   { return _state.mode; },
    get sortAsc(){ return _state.sortAsc; },
  };
})();
