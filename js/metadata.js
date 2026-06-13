import { DEFAULT_ARTIST_NAME, DEFAULT_THUMBNAIL, fileBaseName, splitArtistTitle, readFileAsArrayBuffer } from './utils.js';

function readSyncString(view, offset, length) {
  let str = '';
  for (let i = 0; i < length; i += 1) str += String.fromCharCode(view.getUint8(offset + i));
  return str;
}

function decodeText(bytes, encoding = 0) {
  try {
    if (encoding === 1) return new TextDecoder('utf-16').decode(bytes).replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

async function parseMp3Tags(file, onProgress) {
  const buffer = await readFileAsArrayBuffer(file, onProgress);
  const view = new DataView(buffer);
  if (readSyncString(view, 0, 3) !== 'ID3') return {};
  const version = view.getUint8(3);
  let size = 0;
  for (let i = 0; i < 4; i += 1) size = (size << 7) | view.getUint8(6 + i);
  let offset = 10;
  const meta = {};
  while (offset + 10 <= size + 10) {
    const frameId = readSyncString(view, offset, 4);
    const frameSize = version === 4
      ? ((view.getUint8(offset + 4) << 21) | (view.getUint8(offset + 5) << 14) | (view.getUint8(offset + 6) << 7) | view.getUint8(offset + 7))
      : view.getUint32(offset + 4, false);
    if (!frameId.trim() || frameSize <= 0) break;
    const contentOffset = offset + 10;
    const data = new Uint8Array(buffer, contentOffset, frameSize);
    if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TDRC' || frameId === 'TYER') {
      const encoding = data[0];
      const text = decodeText(data.slice(1), encoding);
      if (frameId === 'TIT2') meta.title = text;
      if (frameId === 'TPE1') meta.artist = text;
      if ((frameId === 'TDRC' || frameId === 'TYER') && text) meta.releasedAt = text.slice(0, 10).replace(/\./g, '-');
    } else if (frameId === 'APIC' && !meta.thumbnail) {
      const encoding = data[0];
      let idx = 1;
      while (idx < data.length && data[idx] !== 0) idx += 1;
      idx += 1; // mime null
      idx += 1; // picture type
      while (idx < data.length && data[idx] !== 0) idx += 1;
      idx += 1;
      const imageBytes = data.slice(idx);
      try {
        const mimeMatch = /([a-z0-9/+.-]+)/i.exec(decodeText(data.slice(1, idx - 2), encoding));
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const blob = new Blob([imageBytes], { type: mime });
        meta.thumbnail = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || DEFAULT_THUMBNAIL));
          reader.readAsDataURL(blob);
        });
      } catch {
        meta.thumbnail = DEFAULT_THUMBNAIL;
      }
    }
    offset += 10 + frameSize;
  }
  return meta;
}

export async function readMetadata(file, onProgress) {
  const ext = file.name.split('.').pop().toLowerCase();
  let meta = {};
  if (ext === 'mp3' || (file.type || '').includes('mpeg')) {
    try { meta = await parseMp3Tags(file, onProgress); } catch { meta = {}; }
  }
  const fallback = splitArtistTitle(file.name);
  return {
    title: meta.title || fallback.title || fileBaseName(file.name),
    artist: meta.artist || fallback.artist || DEFAULT_ARTIST_NAME,
    releasedAt: meta.releasedAt || '',
    thumbnail: meta.thumbnail || DEFAULT_THUMBNAIL,
  };
}

export async function getDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}
