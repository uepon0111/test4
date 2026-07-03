/**
 * Low-level Google Drive v3 API helpers.
 * All functions assume gapi.client has been initialized and the user is authorized.
 */

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_JSON   = 'application/json';

/** List files matching a query. Returns array of file metadata. */
export async function listFiles(q, fields = 'files(id,name,thumbnailLink,modifiedTime)') {
  const resp = await gapi.client.drive.files.list({
    q,
    fields,
    spaces: 'drive',
    pageSize: 1000,
  });
  return resp.result.files ?? [];
}

/** Create a folder. Returns the new folder resource. */
export async function createFolder(name, parentId = null) {
  const metadata = { name, mimeType: MIME_FOLDER };
  if (parentId) metadata.parents = [parentId];
  const resp = await gapi.client.drive.files.create({
    resource: metadata,
    fields: 'id,name',
  });
  return resp.result;
}

/**
 * Find or create a folder by name under an optional parent.
 * Returns { id, created }.
 */
export async function getOrCreateFolder(name, parentId = null) {
  const q = parentId
    ? `name = '${name}' and mimeType = '${MIME_FOLDER}' and '${parentId}' in parents and trashed = false`
    : `name = '${name}' and mimeType = '${MIME_FOLDER}' and trashed = false`;

  const existing = await listFiles(q, 'files(id,name)');
  if (existing.length > 0) return { id: existing[0].id, created: false };

  const folder = await createFolder(name, parentId);
  return { id: folder.id, created: true };
}

/** Download a file's content as text. */
export async function getFileText(fileId) {
  const resp = await gapi.client.drive.files.get({
    fileId,
    alt: 'media',
  });
  // gapi returns the body as a string
  return typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.result);
}

/** Get file metadata. */
export async function getFileMeta(fileId, fields = 'id,name,thumbnailLink') {
  const resp = await gapi.client.drive.files.get({ fileId, fields });
  return resp.result;
}

/**
 * Create or update a JSON file in Drive.
 * If fileId is provided, updates that file. Otherwise creates a new one.
 * Returns the file resource.
 */
export async function upsertJsonFile(name, jsonData, parentId, fileId = null) {
  const token    = gapi.client.getToken().access_token;
  const content  = JSON.stringify(jsonData, null, 2);
  const boundary = '-------prsk-boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, mimeType: MIME_JSON, ...(fileId ? {} : { parents: [parentId] }) }),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`;

  const resp = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  return resp.json();
}

/**
 * Upload an image file to Drive.
 * @param {File|Blob} file
 * @param {string} fileName
 * @param {string} parentId
 * @returns {Promise<{ id: string, thumbnailLink: string }>}
 */
export async function uploadImageFile(file, fileName, parentId) {
  const token    = gapi.client.getToken().access_token;
  const boundary = '-------prsk-img-boundary';
  const mime     = file.type || 'image/jpeg';

  const blob = await file.arrayBuffer();
  const metaPart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: fileName, parents: [parentId] }),
    `--${boundary}`,
    `Content-Type: ${mime}`,
    '',
  ].join('\r\n');

  const ending = `\r\n--${boundary}--`;
  const metaBytes = new TextEncoder().encode(metaPart);
  const endBytes  = new TextEncoder().encode(ending);
  const combined  = new Uint8Array(metaBytes.length + blob.byteLength + endBytes.length);
  combined.set(metaBytes, 0);
  combined.set(new Uint8Array(blob), metaBytes.length);
  combined.set(endBytes, metaBytes.length + blob.byteLength);

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    },
  );
  return resp.json();
}

/** Permanently delete a Drive file. */
export async function deleteFile(fileId) {
  await gapi.client.drive.files.delete({ fileId });
}

/** Fetch image as object URL (for display). Returned URL must be revoked after use. */
export async function fetchImageAsObjectURL(fileId) {
  const token = gapi.client.getToken().access_token;
  const resp  = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
