import { DEFAULT_SETTINGS } from './config.js';
import { saveSettings, state } from './state.js';
import { requestBrowserNotificationPermission, showToast } from './notify.js';

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getInputNumber(id, fallback) {
  const el = document.getElementById(id);
  const value = el ? parseFloat(el.value) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

export function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  syncSettingsToForm();
  modal.style.display = 'flex';
}

export function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
}

export function syncSettingsToForm() {
  const s = state.settings || DEFAULT_SETTINGS;

  setInputValue('settings-diff-x', s.diffCrop.x);
  setInputValue('settings-diff-y', s.diffCrop.y);
  setInputValue('settings-diff-w', s.diffCrop.w);
  setInputValue('settings-diff-h', s.diffCrop.h);
  setInputValue('settings-diff-threshold', s.diffCrop.threshold);

  setInputValue('settings-title-x', s.titleCrop.x);
  setInputValue('settings-title-y', s.titleCrop.y);
  setInputValue('settings-title-w', s.titleCrop.w);
  setInputValue('settings-title-h', s.titleCrop.h);

  setInputValue('settings-miss-x', s.missCrop.x);
  setInputValue('settings-miss-y', s.missCrop.y);
  setInputValue('settings-miss-w', s.missCrop.w);
  setInputValue('settings-miss-h', s.missCrop.h);
}

export function readSettingsFromForm() {
  return {
    diffCrop: {
      x: getInputNumber('settings-diff-x', DEFAULT_SETTINGS.diffCrop.x),
      y: getInputNumber('settings-diff-y', DEFAULT_SETTINGS.diffCrop.y),
      w: getInputNumber('settings-diff-w', DEFAULT_SETTINGS.diffCrop.w),
      h: getInputNumber('settings-diff-h', DEFAULT_SETTINGS.diffCrop.h),
      threshold: getInputNumber('settings-diff-threshold', DEFAULT_SETTINGS.diffCrop.threshold),
    },
    titleCrop: {
      x: getInputNumber('settings-title-x', DEFAULT_SETTINGS.titleCrop.x),
      y: getInputNumber('settings-title-y', DEFAULT_SETTINGS.titleCrop.y),
      w: getInputNumber('settings-title-w', DEFAULT_SETTINGS.titleCrop.w),
      h: getInputNumber('settings-title-h', DEFAULT_SETTINGS.titleCrop.h),
    },
    missCrop: {
      x: getInputNumber('settings-miss-x', DEFAULT_SETTINGS.missCrop.x),
      y: getInputNumber('settings-miss-y', DEFAULT_SETTINGS.missCrop.y),
      w: getInputNumber('settings-miss-w', DEFAULT_SETTINGS.missCrop.w),
      h: getInputNumber('settings-miss-h', DEFAULT_SETTINGS.missCrop.h),
    },
  };
}

export function saveSettingsFromForm() {
  const nextSettings = readSettingsFromForm();
  saveSettings(nextSettings);
  showToast('読み取り範囲を保存しました。', 'success');
  closeSettingsModal();
}

export function resetSettingsToDefault() {
  saveSettings(DEFAULT_SETTINGS);
  syncSettingsToForm();
  showToast('読み取り範囲を初期値に戻しました。', 'success');
}

export async function requestNotificationPermission() {
  await requestBrowserNotificationPermission();
}

export function bindSettingsUI() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  syncSettingsToForm();
}
