// js/trash.js
import { CONFIG } from './config.js';
import { relativeDate } from './utils.js';

export class Trash {
  constructor(db, drive, notify) {
    this.db     = db;
    this.drive  = drive;
    this.notify = notify;
  }

  /** ゴミ箱に移動 */
  async moveToTrash(recordId) {
    await this.db.moveToTrash(recordId);
  }

  /** ゴミ箱から復元 */
  async restore(recordId) {
    await this.db.restoreFromTrash(recordId);
    this.notify.success('記録を復元しました');
  }

  /** 完全削除（Drive含む） */
  async permanentDelete(recordId) {
    const item = await this.db.getTrashItem(recordId);
    if (!item) return;
    if (item.driveFileId && this.drive.isAvailable()) {
      await this.drive.deleteFile(item.driveFileId).catch(e => console.warn('Drive削除失敗:', e));
    }
    await this.db.deleteTrashItem(recordId);
  }

  /** ゴミ箱を全て完全削除 */
  async permanentDeleteAll() {
    const items = await this.db.getAllTrash();
    for (const item of items) {
      if (item.driveFileId && this.drive.isAvailable()) {
        await this.drive.deleteFile(item.driveFileId).catch(() => {});
      }
      await this.db.deleteTrashItem(item.id);
    }
    return items.length;
  }

  /** 期限切れ（3日超）のアイテムを自動削除 */
  async cleanExpired() {
    const ids = await this.db.getExpiredTrashIds();
    for (const id of ids) {
      await this.permanentDelete(id);
    }
    return ids.length;
  }

  async getAll() { return this.db.getAllTrash(); }

  /** 残り日数テキスト */
  static remainingText(trashedAt) {
    const expiry = trashedAt + CONFIG.TRASH_DAYS * 86400000;
    const diff = expiry - Date.now();
    if (diff <= 0) return '期限切れ';
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (days > 0) return `あと${days}日`;
    if (hours > 0) return `あと${hours}時間`;
    return 'まもなく削除';
  }
}
