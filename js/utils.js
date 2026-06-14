'use strict';
const Utils = (() => {
  function generateId() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }
  function formatDuration(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  function formatReleaseDate(dateStr) {
    if (!dateStr) return '';
    if (/^\d{4}$/.test(dateStr)) return dateStr + '年';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  function formatRelative(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}日前`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}ヶ月前`;
    return `${Math.floor(mo/12)}年前`;
  }
  function debounce(fn, delay) {
    let timer;
    return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
  }
  function throttle(fn, limit) {
    let last = 0;
    return function(...args) { const now = Date.now(); if (now - last >= limit) { last = now; return fn.apply(this, args); } };
  }
  function fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }
  function pictureToDataUrl(picture) {
    if (!picture || !picture.data) return null;
    const { data, format } = picture;
    let binary = '';
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
    return `data:${format||'image/jpeg'};base64,${btoa(binary)}`;
  }
  let toastCont = null;
  function showToast(message, type = 'info', duration = 3000) {
    if (!toastCont) toastCont = document.getElementById('toast-container');
    if (!toastCont) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { info:'info', success:'check-circle', error:'x-circle', warning:'alert-triangle' };
    el.innerHTML = `<i data-lucide="${icons[type]||'info'}"></i><span>${escapeHtml(message)}</span>`;
    toastCont.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-visible'));
    if (window.lucide) lucide.createIcons({ nodes: [el] });
    const remove = () => { el.classList.remove('toast-visible'); setTimeout(() => el.remove(), 300); };
    setTimeout(remove, duration);
    el.addEventListener('click', remove);
  }
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  let modalStack = [];
  function showModal(htmlContent, opts = {}) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    if (!overlay || !container) return null;
    container.innerHTML = htmlContent;
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    if (window.lucide) lucide.createIcons({ nodes: [container] });
    if (opts.onOpen) opts.onOpen(container);
    const close = () => {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
      container.innerHTML = '';
      if (opts.onClose) opts.onClose();
      modalStack.pop();
    };
    modalStack.push(close);
    overlay.onclick = e => { if (e.target === overlay) close(); };
    return { close, container };
  }
  function closeModal() { if (modalStack.length > 0) modalStack[modalStack.length-1](); }
  function confirmDialog(message, title = '確認', okLabel = '削除', okClass = 'btn-danger') {
    return new Promise(resolve => {
      const html = `<div class="modal-dialog"><div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="modal-close" id="md-x"><i data-lucide="x"></i></button></div><div class="modal-body"><p>${escapeHtml(message)}</p></div><div class="modal-footer"><button class="btn btn-ghost" id="md-cancel">キャンセル</button><button class="btn ${okClass}" id="md-ok">${escapeHtml(okLabel)}</button></div></div>`;
      const m = showModal(html);
      m.container.querySelector('#md-cancel').onclick = () => { m.close(); resolve(false); };
      m.container.querySelector('#md-ok').onclick   = () => { m.close(); resolve(true);  };
      m.container.querySelector('#md-x').onclick    = () => { m.close(); resolve(false); };
    });
  }
  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
  }
  function colorIsDark(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return (0.299*rgb.r + 0.587*rgb.g + 0.114*rgb.b)/255 < 0.5;
  }
  function compareBy(key, asc = true) {
    return (a, b) => {
      let va = a[key] ?? '', vb = b[key] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? (asc?-1:1) : va > vb ? (asc?1:-1) : 0;
    };
  }
  const AUDIO_EXTS = ['mp3','m4a','aac','wav','ogg','flac','opus'];
  function isAudioFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return AUDIO_EXTS.includes(ext) || file.type.startsWith('audio/');
  }
  function refreshIcons(container) {
    if (window.lucide) { lucide.createIcons({ nodes: container ? [container] : undefined }); }
  }
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }
  function getAudioDuration(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      });
      audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(0); });
      audio.src = url;
    });
  }
  return {
    generateId, formatDuration, formatDate, formatReleaseDate, formatRelative,
    debounce, throttle, fileToArrayBuffer, fileToDataUrl, formatFileSize,
    pictureToDataUrl, showToast, escapeHtml, showModal, closeModal, confirmDialog,
    hexToRgb, colorIsDark, compareBy, isAudioFile, refreshIcons, clamp, shuffle,
    getAudioDuration,
  };
})();
