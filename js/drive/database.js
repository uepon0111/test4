import { state, setState } from '../state.js';
import { getOrCreateFolder, listFiles, upsertJsonFile, getFileText, deleteFile } from './driveClient.js';
import { DRIVE_ROOT, DRIVE_IMAGES_FOLDER, DRIVE_DB_FILENAME, TRASH_DELETE_DAYS } from '../config.js';

const LS_ROOT   = 'prsk_root_id';
const LS_IMAGES = 'prsk_images_id';
const LS_DB     = 'prsk_db_id';

let _db = null; // in-memory database object

/* ── Drive structure initialization ────────────────────────────────────── */

/** Create or find the root and images folder; locate db.json. */
export async function initDriveStructure() {
  // Restore cached IDs from localStorage
  let rootId   = localStorage.getItem(LS_ROOT);
  let imagesId = localStorage.getItem(LS_IMAGES);
  let dbFileId = localStorage.getItem(LS_DB);

  // Verify root still exists (in case user deleted it)
  if (!rootId) {
    const root = await getOrCreateFolder(DRIVE_ROOT);
    rootId = root.id;
    localStorage.setItem(LS_ROOT, rootId);
  }
  if (!imagesId) {
    const imgs = await getOrCreateFolder(DRIVE_IMAGES_FOLDER, rootId);
    imagesId = imgs.id;
    localStorage.setItem(LS_IMAGES, imagesId);
  }

  // Find or create db.json
  if (!dbFileId) {
    const existing = await listFiles(
      `name = '${DRIVE_DB_FILENAME}' and '${rootId}' in parents and trashed = false`,
      'files(id)',
    );
    if (existing.length > 0) {
      dbFileId = existing[0].id;
    } else {
      const empty = { version: 1, records: [], deviceProfiles: [], updatedAt: new Date().toISOString() };
      const f = await upsertJsonFile(DRIVE_DB_FILENAME, empty, rootId);
      dbFileId = f.id;
    }
    localStorage.setItem(LS_DB, dbFileId);
  }

  setState({ rootFolderId: rootId, imagesFolderId: imagesId, dbFileId });
  return { rootId, imagesId, dbFileId };
}

/* ── Load / save ─────────────────────────────────────────────────────── */

export async function loadDb() {
  const dbFileId = state.dbFileId ?? localStorage.getItem(LS_DB);
  if (!dbFileId) throw new Error('db.json not initialized');

  let raw;
  try { raw = await getFileText(dbFileId); }
  catch (e) {
    console.warn('[DB] fetch failed, starting empty:', e);
    raw = '{"version":1,"records":[],"deviceProfiles":[]}';
  }
  _db = JSON.parse(raw);
  if (!Array.isArray(_db.records))       _db.records = [];
  if (!Array.isArray(_db.deviceProfiles)) _db.deviceProfiles = [];

  setState({ records: [..._db.records] });
  return _db;
}

async function saveDb() {
  const dbFileId = state.dbFileId ?? localStorage.getItem(LS_DB);
  _db.updatedAt = new Date().toISOString();
  await upsertJsonFile(DRIVE_DB_FILENAME, _db, state.rootFolderId, dbFileId);
  setState({ records: [..._db.records] });
}

/* ── Record CRUD ─────────────────────────────────────────────────────── */

export async function addRecord(record) {
  _db.records.push(record);
  await saveDb();
}

export async function updateRecord(id, changes) {
  const idx = _db.records.findIndex(r => r.id === id);
  if (idx < 0) throw new Error('Record not found: ' + id);
  _db.records[idx] = { ..._db.records[idx], ...changes, updatedAt: new Date().toISOString() };
  await saveDb();
  return _db.records[idx];
}

/** Soft-delete: sets deletedAt (move to trash). */
export async function trashRecord(id) {
  return updateRecord(id, { deletedAt: new Date().toISOString() });
}

/** Restore a soft-deleted record. */
export async function restoreRecord(id) {
  return updateRecord(id, { deletedAt: null });
}

/**
 * Permanently delete a record and its Drive image.
 * @param {string} id
 * @param {Function} deleteImageFn  async (imageFileId) => void
 */
export async function permanentDeleteRecord(id, deleteImageFn) {
  const rec = _db.records.find(r => r.id === id);
  if (rec?.imageFileId) {
    try { await deleteImageFn(rec.imageFileId); } catch (e) { /* ignore if already gone */ }
  }
  _db.records = _db.records.filter(r => r.id !== id);
  await saveDb();
}

/** Auto-delete records that have been in trash > TRASH_DELETE_DAYS. */
export async function autoDeleteExpiredTrash(deleteImageFn) {
  const cutoff = Date.now() - TRASH_DELETE_DAYS * 24 * 60 * 60 * 1000;
  const expired = _db.records.filter(
    r => r.deletedAt && new Date(r.deletedAt).getTime() < cutoff,
  );
  for (const r of expired) {
    if (r.imageFileId) {
      try { await deleteImageFn(r.imageFileId); } catch (_) {}
    }
  }
  const expiredIds = new Set(expired.map(r => r.id));
  if (expiredIds.size > 0) {
    _db.records = _db.records.filter(r => !expiredIds.has(r.id));
    await saveDb();
  }
  return expired.length;
}

/** Return current in-memory records (all, including deleted). */
export function getAllRecords() { return _db?.records ?? []; }
