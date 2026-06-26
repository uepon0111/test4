'use strict';

/* ========== TRASH MANAGEMENT ========== */
const Trash = {
  /* Move a result to trash */
  async moveToTrash(record) {
    record.deleted   = true;
    record.deletedAt = new Date().toISOString();
    await DB.saveResult(record);
    return record;
  },

  /* Restore from trash */
  async restore(record) {
    record.deleted   = false;
    record.deletedAt = null;
    await DB.saveResult(record);
    return record;
  },

  /* Permanently delete: remove from DB and Drive */
  async permanentDelete(record) {
    if (record.driveFileId && Drive.isAvailable) {
      try { await Drive.deleteFile(record.driveFileId); } catch (_) { /* ignore */ }
    }
    await DB.deleteResult(record.id);
  },

  /* Auto-clean expired trash items (call on startup) */
  async autoClean(records) {
    const cutoff = Date.now() - CONFIG.TRASH_DAYS * 86400000;
    const expired = records.filter(r =>
      r.deleted && r.deletedAt && new Date(r.deletedAt).getTime() < cutoff
    );
    for (const r of expired) {
      await this.permanentDelete(r);
    }
    return expired.length;
  },

  /* Render trash view */
  render(records, onUpdate) {
    const trashItems = records.filter(r => r.deleted);
    const list   = document.getElementById('trash-list');
    const empty  = document.getElementById('trash-empty-state');
    const badge  = document.getElementById('trash-count-badge');

    if (!list) return;

    const count = trashItems.length;
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    if (count === 0) {
      list.innerHTML  = '';
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (empty) empty.style.display = 'none';

    /* Sort by deletedAt desc */
    const sorted = [...trashItems].sort(
      (a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0)
    );

    list.innerHTML = '';
    for (const r of sorted) {
      const daysLeft  = Utils.daysUntilDelete(r.deletedAt);
      const diffColor = CONFIG.DIFFICULTY_COLORS[r.difficulty] || '#999';

      const item = document.createElement('div');
      item.className = 'trash-item';
      item.innerHTML = `
        <div class="trash-item-thumb">
          ${r.imageDataUrl
            ? `<img src="${r.imageDataUrl}" alt="" loading="lazy">`
            : '<div style="width:100%;height:100%;background:var(--border-light);"></div>'}
        </div>
        <div class="trash-item-info">
          <div class="trash-item-title">${Utils.esc(r.title || '不明')}</div>
          <div class="trash-item-meta">
            <span class="diff-badge" style="background:${diffColor};color:${CONFIG.DIFFICULTY_DARK_TEXT[r.difficulty]?'#1A1A1A':'white'};font-size:9px;padding:0 5px">${r.difficulty || '-'}</span>
            Lv.${r.level ?? '-'} &nbsp;
            <span class="trash-days-left">あと${daysLeft}日</span>で完全削除
          </div>
        </div>
        <div class="trash-item-actions">
          <button class="trash-action-btn restore" data-id="${r.id}" title="元に戻す">
            <span style="font-size:12px;display:flex;align-items:center;gap:3px">
              <span class="material-icons-round" style="font-size:14px">restore</span>戻す
            </span>
          </button>
          <button class="trash-action-btn delete" data-id="${r.id}" title="完全削除">
            <span style="font-size:12px;display:flex;align-items:center;gap:3px">
              <span class="material-icons-round" style="font-size:14px">delete_forever</span>削除
            </span>
          </button>
        </div>
      `;

      item.querySelector('.restore').addEventListener('click', async () => {
        item.style.opacity = '0.5';
        await this.restore(r);
        Notification.show(`「${r.title}」を復元しました`, 'success');
        onUpdate();
      });

      item.querySelector('.delete').addEventListener('click', () => {
        App.showConfirm(
          '完全削除の確認',
          `「${r.title}」を完全削除します。この操作は取り消せません。`,
          async () => {
            item.style.opacity = '0.5';
            await this.permanentDelete(r);
            Notification.show(`「${r.title}」を完全削除しました`, 'info');
            onUpdate();
          }
        );
      });

      list.appendChild(item);
    }
  },

  /* Empty all trash */
  async emptyAll(records, onUpdate) {
    const trashItems = records.filter(r => r.deleted);
    if (!trashItems.length) return;

    App.showConfirm(
      'ゴミ箱を空にする',
      `${trashItems.length}件のリザルトをすべて完全削除します。この操作は取り消せません。`,
      async () => {
        for (const r of trashItems) {
          await this.permanentDelete(r);
        }
        Notification.show(`${trashItems.length}件を完全削除しました`, 'info');
        onUpdate();
      },
      'すべて削除'
    );
  },
};
