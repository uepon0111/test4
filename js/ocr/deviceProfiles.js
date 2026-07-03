import { DEFAULT_DEVICE_PROFILE } from '../config.js';

const STORAGE_KEY = 'prsk_device_profiles';

/** Load all device profiles (default + user-saved). */
export function loadProfiles() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const user  = saved ? JSON.parse(saved) : [];
  // Default always first, never duplicate
  return [DEFAULT_DEVICE_PROFILE, ...user.filter(p => p.id !== 'default')];
}

/** Save a user-defined profile. Returns updated profiles list. */
export function saveProfile(profile) {
  const all  = loadProfiles();
  const idx  = all.findIndex(p => p.id === profile.id);
  if (idx >= 0) all[idx] = profile;
  else all.push(profile);
  // Persist only user profiles (not the default)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(all.filter(p => p.id !== 'default')),
  );
  return all;
}

/** Delete a user profile by id. Returns updated list. */
export function deleteProfile(id) {
  if (id === 'default') return loadProfiles();
  const all = loadProfiles().filter(p => p.id !== id);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(all.filter(p => p.id !== 'default')),
  );
  return all;
}

/**
 * Select the best-matching profile for an image aspect ratio.
 * Falls back to default if no profile matches.
 */
export function selectProfile(imageWidth, imageHeight) {
  const ratio   = imageWidth / imageHeight;
  const profiles = loadProfiles();
  const match   = profiles.find(
    p => ratio >= p.aspectRatioMin && ratio <= p.aspectRatioMax,
  );
  return match ?? profiles[0];
}

/**
 * Create a deep copy of a profile's regions object
 * so it can be modified without affecting the original.
 */
export function cloneRegions(profile) {
  return Object.fromEntries(
    Object.entries(profile.regions).map(([k, v]) => [k, { ...v }]),
  );
}
