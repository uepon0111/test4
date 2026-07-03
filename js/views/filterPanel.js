import { state, setState } from '../state.js';
import { DIFFICULTIES, DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../config.js';

/* ── Mode toggle (AP / AP〔大会〕 / FC) ─────────────────────────────── */
export function initModeToggle() {
  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode;
    setState({ mode });
    updateModeUI(mode);
  });
  updateModeUI(state.mode);
}

function updateModeUI(mode) {
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('mode-btn--active', btn.dataset.mode === mode);
  });
}

/* ── Sort controls ────────────────────────────────────────────────────── */
export function initSortControls() {
  const sortSel = document.getElementById('sort-key');
  const sortDir = document.getElementById('sort-dir');

  sortSel.value = state.sortKey;
  sortDir.dataset.dir = state.sortDir;
  updateSortDirIcon(sortDir, state.sortDir);

  sortSel.addEventListener('change', () => setState({ sortKey: sortSel.value }));
  sortDir.addEventListener('click', () => {
    const newDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    setState({ sortDir: newDir });
    sortDir.dataset.dir = newDir;
    updateSortDirIcon(sortDir, newDir);
  });
}

function updateSortDirIcon(btn, dir) {
  btn.querySelector('.material-symbols-outlined').textContent =
    dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  btn.title = dir === 'asc' ? '昇順' : '降順';
  btn.setAttribute('aria-label', dir === 'asc' ? '昇順' : '降順');
}

/* ── Search bar ─────────────────────────────────────────────────────── */
export function initSearchBar() {
  const input = document.getElementById('search-input');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => setState({ filterTitle: input.value.trim() }), 200);
  });
  const clear = document.getElementById('search-clear');
  clear?.addEventListener('click', () => {
    input.value = '';
    setState({ filterTitle: '' });
  });
}

/* ── Filter panel (shared between sidebar and bottom sheet) ───────────── */
export function initFilterPanel() {
  // Build diff chips
  const diffWrap = document.getElementById('filter-diffs');
  if (diffWrap) {
    diffWrap.innerHTML = '';
    for (const d of DIFFICULTIES) {
      const chip = document.createElement('button');
      chip.className = 'diff-filter-chip';
      chip.dataset.diff = d;
      chip.style.setProperty('--diff-color', DIFFICULTY_COLORS[d]);
      chip.textContent = DIFFICULTY_LABELS[d];
      chip.setAttribute('aria-pressed', 'false');
      diffWrap.appendChild(chip);
    }
    diffWrap.addEventListener('click', e => {
      const chip = e.target.closest('[data-diff]');
      if (!chip) return;
      const d = chip.dataset.diff;
      const set = new Set(state.filterDiffs);
      set.has(d) ? set.delete(d) : set.add(d);
      setState({ filterDiffs: set });
      chip.setAttribute('aria-pressed', String(set.has(d)));
      chip.classList.toggle('diff-filter-chip--active', set.has(d));
    });
  }

  // Status select
  const statusSel = document.getElementById('filter-status');
  statusSel?.addEventListener('change', () => setState({ filterStatus: statusSel.value }));

  // Level
  const levelIn = document.getElementById('filter-level');
  levelIn?.addEventListener('input', () => {
    const v = levelIn.value.trim();
    setState({ filterLevel: v ? parseInt(v, 10) : null });
  });

  // Miss range
  const missMin = document.getElementById('filter-miss-min');
  const missMax = document.getElementById('filter-miss-max');
  missMin?.addEventListener('input', () =>
    setState({ filterMissMin: missMin.value ? Number(missMin.value) : null }));
  missMax?.addEventListener('input', () =>
    setState({ filterMissMax: missMax.value ? Number(missMax.value) : null }));

  // Best only toggle
  const bestToggle = document.getElementById('filter-best');
  bestToggle?.addEventListener('change', () => setState({ showBestOnly: bestToggle.checked }));

  // Reset button
  document.getElementById('filter-reset')?.addEventListener('click', resetFilters);

  // Mobile filter sheet toggle
  document.getElementById('btn-filter')?.addEventListener('click', openFilterSheet);
  document.getElementById('filter-sheet-close')?.addEventListener('click', closeFilterSheet);
  document.getElementById('filter-sheet-overlay')?.addEventListener('click', closeFilterSheet);
  document.getElementById('filter-sheet-apply')?.addEventListener('click', closeFilterSheet);
}

export function resetFilters() {
  setState({
    filterStatus: 'all',
    filterDiffs: new Set(),
    filterLevel: null,
    filterMissMin: null,
    filterMissMax: null,
    filterTitle: '',
    showBestOnly: false,
  });
  // Reset UI elements
  document.querySelectorAll('[data-diff]').forEach(c => {
    c.classList.remove('diff-filter-chip--active');
    c.setAttribute('aria-pressed', 'false');
  });
  const statusSel = document.getElementById('filter-status');
  if (statusSel) statusSel.value = 'all';
  const levelIn   = document.getElementById('filter-level');
  if (levelIn)   levelIn.value = '';
  const missMin   = document.getElementById('filter-miss-min');
  if (missMin)   missMin.value = '';
  const missMax   = document.getElementById('filter-miss-max');
  if (missMax)   missMax.value = '';
  const best      = document.getElementById('filter-best');
  if (best)      best.checked = false;
  const search    = document.getElementById('search-input');
  if (search)    search.value = '';
}

function openFilterSheet() {
  document.getElementById('filter-sidebar')?.classList.add('filter-sheet--open');
  document.getElementById('filter-sheet-overlay')?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeFilterSheet() {
  document.getElementById('filter-sidebar')?.classList.remove('filter-sheet--open');
  document.getElementById('filter-sheet-overlay')?.classList.remove('visible');
  document.body.style.overflow = '';
}
