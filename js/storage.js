const SETTINGS_KEY = 'prsk-result-viewer.settings.v2';
const UI_KEY = 'prsk-result-viewer.ui.v2';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadSettings(defaultSettings) {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return deepClone(defaultSettings);
  try {
    const parsed = JSON.parse(raw);
    return {
      ...deepClone(defaultSettings),
      ...parsed,
      cropRegions: {
        ...deepClone(defaultSettings.cropRegions),
        ...(parsed.cropRegions || {})
      }
    };
  } catch {
    return deepClone(defaultSettings);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadUiState(defaultState) {
  const raw = localStorage.getItem(UI_KEY);
  if (!raw) return deepClone(defaultState);
  try {
    return { ...deepClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return deepClone(defaultState);
  }
}

export function saveUiState(state) {
  localStorage.setItem(UI_KEY, JSON.stringify(state));
}
