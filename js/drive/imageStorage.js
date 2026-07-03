import { state, setState } from '../state.js';
import { uploadImageFile, listFiles, deleteFile, fetchImageAsObjectURL } from './driveClient.js';

/**
 * Upload a result image File/Blob to the images/ Drive folder.
 * @param {File|Blob} file
 * @param {string} recordId  - used as filename
 * @returns {Promise<{ fileId: string, thumbnailLink: string|null }>}
 */
export async function uploadResultImage(file, recordId) {
  const ext      = file.name ? file.name.split('.').pop() : 'jpg';
  const fileName = `${recordId}.${ext}`;
  const folderId = state.imagesFolderId ?? localStorage.getItem('prsk_images_id');

  const result = await uploadImageFile(file, fileName, folderId);
  const fileId = result.id;
  const thumbLink = result.thumbnailLink ?? null;

  // Update in-memory thumbnail map
  const map = new Map(state.thumbnailMap);
  if (thumbLink) map.set(fileId, thumbLink);
  setState({ thumbnailMap: map });

  return { fileId, thumbnailLink: thumbLink };
}

/** Permanently delete an image file from Drive. */
export async function deleteResultImage(fileId) {
  await deleteFile(fileId);
  const map = new Map(state.thumbnailMap);
  map.delete(fileId);
  setState({ thumbnailMap: map });
}

/**
 * Fetch all thumbnail links for images in the images/ folder.
 * Populates state.thumbnailMap.
 */
export async function refreshThumbnailMap() {
  const folderId = state.imagesFolderId ?? localStorage.getItem('prsk_images_id');
  if (!folderId) return;

  const files = await listFiles(
    `'${folderId}' in parents and trashed = false`,
    'files(id,thumbnailLink)',
  );
  const map = new Map();
  for (const f of files) {
    if (f.thumbnailLink) map.set(f.id, f.thumbnailLink);
  }
  setState({ thumbnailMap: map });
}

/**
 * Get a displayable URL for a card thumbnail.
 * Uses cached thumbnailLink (via Google LH3 CDN) if available,
 * otherwise returns null (caller should show placeholder).
 */
export function getThumbnailSrc(fileId) {
  if (!fileId) return null;
  const link = state.thumbnailMap.get(fileId);
  if (link) {
    // Resize hint: replace Google's default size with a wider one
    return link.replace(/=s\d+/, '=w400');
  }
  return null;
}

/**
 * Fetch the full-size image as an object URL.
 * Caller is responsible for calling URL.revokeObjectURL when done.
 */
export async function getFullImageURL(fileId) {
  return fetchImageAsObjectURL(fileId);
}
