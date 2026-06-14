'use strict';
/* ============================================================
   metadata.js – 音声メタデータ抽出
   ============================================================ */
const Metadata = (() => {

  /* jsmediatags でメタデータ読み取り */
  function readTags(file) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) { resolve({}); return; }
      window.jsmediatags.read(file, {
        onSuccess(tag) { resolve(tag.tags || {}); },
        onError()      { resolve({}); }
      });
    });
  }

  /* ファイル名からタイトルを推測 */
  function titleFromFilename(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
  }

  /* 年文字列を正規化 */
  function normalizeYear(year) {
    if (!year) return null;
    const str = String(year).trim();
    const match = str.match(/\d{4}/);
    return match ? match[0] : null;
  }

  /* メイン抽出関数 */
  async function extract(file) {
    const [tags, duration] = await Promise.all([
      readTags(file),
      Utils.getAudioDuration(file),
    ]);

    const title     = (tags.title   || titleFromFilename(file.name)).trim();
    const artist    = (tags.artist  || '').trim() || null;
    const year      = normalizeYear(tags.year || tags.TDRC);
    const thumbnail = tags.picture ? Utils.pictureToDataUrl(tags.picture) : null;

    return { title, artist, releaseDate: year, thumbnail, duration };
  }

  return { extract };
})();
