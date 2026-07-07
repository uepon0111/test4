import { savePbSnapshot, state } from './state.js';
import { difficultyLabel } from './config.js';

const TOAST_ID = 'prsk-toast-container';

function ensureToastContainer() {
  let container = document.getElementById(TOAST_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_ID;
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', duration = 4200) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

export async function requestBrowserNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('このブラウザは通知に対応していません。', 'warning');
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    showToast(result === 'granted' ? '通知を有効にしました。' : '通知は有効になっていません。', result === 'granted' ? 'success' : 'warning');
    return result;
  } catch (error) {
    console.error(error);
    showToast('通知の許可に失敗しました。', 'error');
    return 'denied';
  }
}

function recordKey(record) {
  return `${record.level}|${record.difficultyRaw}|${record.title}`;
}

function buildBestMap(records) {
  const map = new Map();
  for (const record of records || []) {
    const key = recordKey(record);
    const current = map.get(key);
    if (!current || Number(record.missCount) < Number(current.missCount)) {
      map.set(key, { ...record, missCount: Number(record.missCount) });
    }
  }
  return map;
}

function summarizeBest(record) {
  return `${record.title} / Lv.${record.level} ${difficultyLabel(record.difficultyRaw)} : FC-${record.missCount}`;
}

export function handlePersonalBestUpdates(records) {
  const bestMap = buildBestMap(records);
  const previousSnapshot = state.pbSnapshot || {};
  const nextSnapshot = {};
  const improvements = [];

  for (const [key, bestRecord] of bestMap.entries()) {
    nextSnapshot[key] = Number(bestRecord.missCount);
    const prev = previousSnapshot[key];
    if (typeof prev === 'number' && Number(bestRecord.missCount) < prev) {
      improvements.push({ key, record: bestRecord, previous: prev });
    }
  }

  savePbSnapshot(nextSnapshot);

  if (improvements.length === 0) return [];

  const title = improvements.length === 1
    ? '自己ベストを更新しました'
    : `自己ベスト更新が ${improvements.length} 件あります`;

  const body = improvements.slice(0, 3).map((item) => summarizeBest(item.record)).join('\n');
  const extra = improvements.length > 3 ? `\n他 ${improvements.length - 3} 件` : '';

  showToast(title, 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body + extra,
        silent: true,
      });
    } catch (error) {
      console.error(error);
    }
  }

  return improvements;
}
