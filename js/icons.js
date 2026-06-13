const S = {
  tabs: '<path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  player: '<path d="M6 5.5h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9Z" fill="currentColor"/>',
  edit: '<path d="M4 16.2V20h3.8L18.2 9.6l-3.8-3.8L4 16.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14.4 5.4l3.8 3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  log: '<path d="M5 4.8h14v14.4H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.2h8M8 11.8h8M8 15.4h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  settings: '<path d="M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0-3.2 1 2.4 2.6.5 1.8-1.9 2 1.2-.5 2.6 1.8 1.9-1.8 1.9.5 2.6-2 1.2-1.8-1.9-2.6.5-1 2.4h-2l-1-2.4-2.6-.5-1.8 1.9-2-1.2.5-2.6L2 12 3.8 10.1l-.5-2.6 2-1.2 1.8 1.9 2.6-.5 1-2.4h2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  music: '<path d="M9 18.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm7-1.2a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm-4-9.5 6-1.2v6.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M8.5 6.5 18 12l-9.5 5.5V6.5Z" fill="currentColor"/>',
  pause: '<path d="M7 6.5h3v11H7v-11Zm7 0h3v11h-3v-11Z" fill="currentColor"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor"/>',
  next: '<path d="M7 7v10l7-5-7-5Zm10 0v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  prev: '<path d="M17 7v10l-7-5 7-5ZM7 7v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  shuffle: '<path d="M4 7h3.5l2.2 3.2 2.4-3.2H16M4 17h3.5l7.8-10H16m0 10h-3.2l-1.8-2.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  repeat: '<path d="M7 7h8a3 3 0 0 1 3 3v1M17 17H9a3 3 0 0 1-3-3v-1m0 0-2 2m2-2 2 2m8-10-2-2m2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  upload: '<path d="M12 4.5v9M8.5 8l3.5-3.5L15.5 8M6 17.5h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  folder: '<path d="M4 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2H19a1 1 0 0 1 1 1v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  search: '<circle cx="11" cy="11" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m15.2 15.2 3.1 3.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  trash: '<path d="M6.5 8h11M9 8V6.6A1.6 1.6 0 0 1 10.6 5h2.8A1.6 1.6 0 0 1 15 6.6V8m-5 0v9m4-9v9M7.5 8l.7 10.5a1.4 1.4 0 0 0 1.4 1.3h4.8a1.4 1.4 0 0 0 1.4-1.3L16.5 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowUp: '<path d="m7 13 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowDown: '<path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  grid: '<path d="M6 6h4v4H6V6Zm8 0h4v4h-4V6ZM6 14h4v4H6v-4Zm8 0h4v4h-4v-4Z" fill="currentColor"/>',
  list: '<path d="M7 7h10M7 12h10M7 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  check: '<path d="m6.8 12.4 3 3.1 7.4-7.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  volume: '<path d="M6.5 14h2.7l3.8 3V5l-3.8 3H6.5a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 6.5 14Zm10-5.2a4.5 4.5 0 0 1 0 6.4M15.1 7.5a7 7 0 0 1 0 9.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<path d="M12 6v6l4 2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  tag: '<path d="M5 12.2 12.2 5H18v5.8L10.8 18H5v-5.8Zm11-4.2h.01" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  user: '<path d="M12 12.1a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.6-3.7 3.8-6 7-6s6.4 2.3 7 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  hash: '<path d="M8.5 5 7.2 19M16.8 5l-1.3 14M5 9h14M4.3 15h14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  album: '<path d="M6 5h12v14H6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'
};

export function icon(name, size = 18, cls = '') {
  const body = S[name] || S.album;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
