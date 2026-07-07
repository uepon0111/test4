import { APP_CONFIG } from './constants.js';

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: APP_CONFIG.apiKey,
    discoveryDocs: [APP_CONFIG.discoveryDoc]
  });
}

export function initTokenClient(callback) {
  return google.accounts.oauth2.initTokenClient({
    client_id: APP_CONFIG.clientId,
    scope: APP_CONFIG.scopes,
    callback
  });
}

export async function fetchAllDriveItems(query, fields) {
  let items = [];
  let pageToken = null;
  do {
    const response = await gapi.client.drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken
    });
    if (response.result.files) items = items.concat(response.result.files);
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return items;
}

export async function getFolderByName(name, parentId = null) {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryValue(name)}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1
  });
  return response.result.files?.[0] || null;
}

export async function findOrCreateFolder(name, parentId = null, cache = new Map()) {
  const key = `${parentId || 'root'}::${name}`;
  if (cache.has(key)) return cache.get(key);

  const existing = await getFolderByName(name, parentId);
  if (existing) {
    cache.set(key, existing);
    return existing;
  }

  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) metadata.parents = [parentId];

  const response = await gapi.client.drive.files.create({
    resource: metadata,
    fields: 'id, name'
  });
  cache.set(key, response.result);
  return response.result;
}

export async function buildFolderCache(rootFolderId) {
  const cache = new Map();
  const allFolders = await fetchAllDriveItems(
    `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'id, name, parents'
  );
  for (const folder of allFolders) {
    const parentId = folder.parents?.[0] || rootFolderId;
    cache.set(`${parentId}::${folder.name}`, folder);
    cache.set(`id::${folder.id}`, folder);
  }
  return cache;
}

export async function fetchDriveRecords({ rootFolderName, subFolderName, parseFolderTitle, parseResultMeta }) {
  const rootFolder = await getFolderByName(rootFolderName);
  if (!rootFolder) return { records: [], folderCache: new Map(), rootFolder: null, subFolder: null };

  const subFolder = await getFolderByName(subFolderName, rootFolder.id);
  if (!subFolder) return { records: [], folderCache: new Map(), rootFolder, subFolder: null };

  const folderCache = await buildFolderCache(subFolder.id);

  const songFolders = await fetchAllDriveItems(
    `'${subFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'id, name, parents'
  );

  const folderMap = new Map();
  for (const folder of songFolders) {
    const metadata = parseFolderTitle(folder.name);
    if (metadata) folderMap.set(folder.id, { ...metadata, folderId: folder.id });
  }

  const candidateFiles = await fetchAllDriveItems(
    `name contains 'FC' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    'id, name, parents, thumbnailLink, createdTime, description'
  );

  const records = [];
  for (const file of candidateFiles) {
    if (!file.parents?.length) continue;
    const parentId = file.parents.find(parent => folderMap.has(parent));
    if (!parentId) continue;

    const songInfo = folderMap.get(parentId);
    const meta = parseResultMeta(file);

    records.push({
      id: file.id,
      parentId,
      title: songInfo.title,
      level: songInfo.level,
      difficulty: songInfo.difficulty,
      difficultyRaw: songInfo.rawDiff,
      missCount: meta.miss,
      perfectCount: meta.perfect,
      greatCount: meta.great,
      comboCount: meta.combo,
      isFC: meta.miss === 0,
      thumbnail: file.thumbnailLink || null,
      createdTime: file.createdTime || null,
      description: file.description || ''
    });
  }

  return { records, folderCache, rootFolder, subFolder };
}

export async function createDriveFile({ file, name, parents, description, accessToken }) {
  const metadata = { name, parents };
  if (description) metadata.description = description;

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
    body: form
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function updateDriveFile({ fileId, name, description, addParents, removeParents }) {
  const resource = {};
  if (name !== undefined) resource.name = name;
  if (description !== undefined) resource.description = description;
  const params = { fileId, resource };
  if (addParents) params.addParents = addParents;
  if (removeParents) params.removeParents = removeParents;
  return gapi.client.drive.files.update(params);
}

export async function deleteDriveFile(fileId) {
  return gapi.client.drive.files.delete({ fileId });
}

export function revokeToken() {
  const token = gapi.client.getToken();
  if (token?.access_token) {
    google.accounts.oauth2.revoke(token.access_token);
  }
  gapi.client.setToken('');
}
