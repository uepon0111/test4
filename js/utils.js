export const DEFAULT_ARTIST_NAME = '不明のアーティスト';
export const DEFAULT_THUMBNAIL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#dfeaff"/>
      <stop offset="1" stop-color="#f8fbff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#g)"/>
  <circle cx="256" cy="212" r="88" fill="#2f6fed" fill-opacity="0.18"/>
  <path d="M150 338c24-46 76-74 106-74s82 28 106 74" fill="#2f6fed" fill-opacity="0.18"/>
  <circle cx="256" cy="212" r="26" fill="#2f6fed" fill-opacity="0.4"/>
</svg>`);

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const copy = (obj) => JSON.parse(JSON.stringify(obj));
export const n = (v, fallback = 0) => (Number.isFinite(+v) ? +v : fallback);

export function formatBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let u = 0;
  let size = bytes || 0;
  while (size >= 1024 && u < units.length - 1) { size /= 1024; u += 1; }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[u]}`;
}

export function formatDuration(sec = 0) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function formatDate(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatDateTime(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function escapeRegExp(text = '') { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function normalizeText(text = '') {
  return String(text).trim().toLowerCase();
}

export function slugify(text = '') {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g, '-').replace(/^-+|-+$/g, '') || uid('item');
}

export function fileBaseName(fileName = '') {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

export function splitArtistTitle(fileName = '') {
  const base = fileBaseName(fileName);
  const m = base.match(/^(.+?)\s*[-_—–]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}

export function safeDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function readFileAsArrayBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('読み込み失敗'));
    reader.onprogress = (e) => onProgress?.(e.loaded / (e.total || file.size || 1));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('画像読み込み失敗'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export function sortBy(items, keyFn, asc = true) {
  const arr = [...items];
  arr.sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const aNum = typeof av === 'number' ? av : Number(av);
    const bNum = typeof bv === 'number' ? bv : Number(bv);
    let cmp;
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && String(av).match(/^\d+(\.\d+)?$/) && String(bv).match(/^\d+(\.\d+)?$/)) {
      cmp = aNum - bNum;
    } else {
      cmp = String(av).localeCompare(String(bv), 'ja');
    }
    return asc ? cmp : -cmp;
  });
  return arr;
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function unique(arr) { return [...new Set(arr)]; }
export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function isLandscape() { return window.matchMedia('(max-aspect-ratio: 1/1)').matches ? false : true; }

export function ensureArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
