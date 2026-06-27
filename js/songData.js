// js/songData.js
import { CONFIG } from './config.js';
import { normalizeStr, findBestMatches } from './utils.js';

export class SongData {
  constructor() {
    this.musics       = [];   // {id, title, pronunciation, ...}
    this.difficulties = [];   // {musicId, musicDifficulty, playLevel, totalNoteCount, ...}
    this.loaded       = false;
    this._loading     = null;
  }

  /** 楽曲データを読み込む（セッションキャッシュ使用） */
  async load() {
    if (this.loaded) return;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      // セッションキャッシュ確認
      const cached = sessionStorage.getItem('sekai_song_cache');
      if (cached) {
        try {
          const data = JSON.parse(cached);
          if (data.ts && Date.now() - data.ts < 3600000) { // 1時間有効
            this.musics       = data.musics;
            this.difficulties = data.difficulties;
            this.loaded       = true;
            return;
          }
        } catch {}
      }

      try {
        const [mRes, dRes] = await Promise.all([
          fetch(CONFIG.MUSICS_URL),
          fetch(CONFIG.DIFFICULTIES_URL),
        ]);
        if (!mRes.ok || !dRes.ok) throw new Error('API取得エラー');
        this.musics       = await mRes.json();
        this.difficulties = await dRes.json();
        this.loaded       = true;

        sessionStorage.setItem('sekai_song_cache', JSON.stringify({
          ts: Date.now(),
          musics:       this.musics,
          difficulties: this.difficulties,
        }));
      } catch (err) {
        console.warn('楽曲データの読み込みに失敗しました:', err);
        // 失敗してもアプリは動かす
      }
    })();

    return this._loading;
  }

  /** タイトルから楽曲を検索（ファジーマッチ） */
  findByTitle(query) {
    if (!this.loaded || !query) return [];
    return findBestMatches(query, this.musics, 5);
  }

  /** musicId + 難易度から難易度情報を取得 */
  getDifficultyInfo(musicId, difficulty) {
    if (!this.loaded) return null;
    const diffKey = (difficulty || '').toLowerCase();
    return this.difficulties.find(
      d => d.musicId === musicId && d.musicDifficulty === diffKey
    ) || null;
  }

  /** 楽曲ID + 難易度 → 総ノーツ数 */
  getTotalNotes(musicId, difficulty) {
    const info = this.getDifficultyInfo(musicId, difficulty);
    return info ? info.totalNoteCount : null;
  }

  /** 楽曲ID + 難易度 → プレイレベル */
  getLevel(musicId, difficulty) {
    const info = this.getDifficultyInfo(musicId, difficulty);
    return info ? info.playLevel : null;
  }

  /**
   * OCR結果の整合性チェック
   * @returns { valid, reason }
   */
  validateResult({ musicId, difficulty, level, perfect, great, good, bad, miss }) {
    if (!this.loaded) return { valid: true, reason: null };

    const info = this.getDifficultyInfo(musicId, difficulty);
    if (!info) return { valid: false, reason: '該当する難易度が見つかりません' };

    // レベルチェック
    if (level !== null && level !== undefined && info.playLevel !== level) {
      return { valid: false, reason: `レベル不一致: DB=${info.playLevel}, 読み取り=${level}` };
    }

    // 総ノーツ数チェック
    const total = (perfect || 0) + (great || 0) + (good || 0) + (bad || 0) + (miss || 0);
    if (info.totalNoteCount && total !== info.totalNoteCount) {
      return {
        valid: false,
        reason: `ノーツ数不一致: DB=${info.totalNoteCount}, 読み取り合計=${total}`
      };
    }

    return { valid: true, reason: null };
  }

  /** musics一覧をそのまま返す */
  getMusics() { return this.musics; }

  /** 全難易度情報を返す */
  getDifficulties() { return this.difficulties; }
}
