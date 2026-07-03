import { MUSICS_URL, DIFFS_URL } from '../config.js';
import { setState } from '../state.js';

let _musics = null;
let _diffs  = null;

/** Fetch both master data JSON files and store in state. Returns { musics, diffs }. */
export async function loadMasterData() {
  if (_musics && _diffs) return { musics: _musics, diffs: _diffs };

  try {
    const [musicsRes, diffsRes] = await Promise.all([
      fetch(MUSICS_URL),
      fetch(DIFFS_URL),
    ]);
    _musics = await musicsRes.json();
    _diffs  = await diffsRes.json();

    setState({ musics: _musics, diffs: _diffs, musicDbLoaded: true });
    return { musics: _musics, diffs: _diffs };
  } catch (e) {
    console.error('[MasterData] fetch failed:', e);
    _musics = [];
    _diffs  = [];
    setState({ musics: [], diffs: [], musicDbLoaded: true });
    return { musics: [], diffs: [] };
  }
}

/** Return cached musics array (may be empty before load completes). */
export function getMusics() { return _musics ?? []; }

/** Return cached diffs array. */
export function getDiffs()  { return _diffs  ?? []; }

/**
 * Look up the DB entry for (musicId, difficulty).
 * Returns null if not found.
 */
export function getDiffEntry(musicId, difficulty) {
  if (!_diffs) return null;
  return _diffs.find(
    d => d.musicId === musicId && d.musicDifficulty === difficulty,
  ) ?? null;
}
