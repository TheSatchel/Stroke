/**
 * PersistenceGuard.js — Observer 持久化守卫
 *
 * 职责：
 *   - 监听 visibilitychange / pagehide / 用户配置变更
 *   - 防抖保存（300ms）
 *   - visibilitychange → hidden 时：立即刷新（无防抖）
 *   - pagehide → 同步刷 localStorage（可靠的最后防线）
 *   - 兜底快照：保存前记录快照，写入失败可回滚
 *   - 驱动 StorageManager（不直接写存储）
 *
 * 不负责：
 *   - 二进制数据的存储策略（委托 StorageManager）
 *   - sendBeacon（PWA 场景无可靠后端端点）
 */

import { saveFullState, saveLineages } from './StorageManager.js';
import { saveAll, safeSet, KEYS } from './storage.js';
import { TEMPLATE_LINEAGE_ID, saveSettingsBarToLineage } from './Persistence.js';

const DEBOUNCE_MS = 300;

export default class PersistenceGuard {
  /**
   * @param {import('../uis/App.js').default} app
   */
  constructor(app) {
    /** @type {import('../uis/App.js').default} */
    this.app = app;

    /** @type {number|null} */
    this._debounceId = null;

    /** @type {string|null} 保存前的快照（JSON string）*/
    this._lastSnapshot = null;

    /** @type {boolean} */
    this._dirty = false;

    /** @type {boolean} */
    this._saving = false;

    // 绑定方法
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._onPageHide = this._onPageHide.bind(this);
    this._onBeforeUnload = this._onBeforeUnload.bind(this);
    this._onConfigChange = this._onConfigChange.bind(this);

    // 安装全局监听器（仅一次）
    this._installGlobalListeners();
  }

  // ================================================================
  //  公开 API
  // ================================================================

  /**
   * 标记脏状态，触发防抖保存
   */
  markDirty() {
    this._dirty = true;
    this._debounceSave();
  }

  /**
   * 立即保存（跳过防抖）
   * 用于：visibilitychange → hidden、pagehide、手动调用
   * @returns {Promise<void>}
   */
  async flush() {
    if (this._debounceId !== null) {
      clearTimeout(this._debounceId);
      this._debounceId = null;
    }
    if (!this._dirty) return;
    await this._doSave();
  }

  /**
   * 获取上次成功保存的快照
   * @returns {string|null}
   */
  getLastSnapshot() {
    return this._lastSnapshot;
  }

  /**
   * 从快照回滚（在写入失败后恢复）
   */
  rollbackFromSnapshot() {
    if (!this._lastSnapshot) return;
    try {
      const snap = JSON.parse(this._lastSnapshot);
      // 回滚 lineage 数据到 IDB
      if (snap.lineages) {
        saveLineages(snap.lineages).catch(e => console.warn('[PersistenceGuard] 回滚 saveLineages 失败:', e));
      }
      // 回滚 LS 指针
      if (snap.currentLineageId !== undefined) {
        safeSet(KEYS.curLineage, snap.currentLineageId || '');
      }
      if (snap.currentVersionIndex !== undefined) {
        safeSet(KEYS.curVersion, String(snap.currentVersionIndex));
      }
      if (snap.apiValues !== undefined) {
        safeSet(KEYS.apiSettings, JSON.stringify(snap.apiValues));
      }
      console.warn('[PersistenceGuard] 已从快照回滚');
    } catch (e) {
      console.error('[PersistenceGuard] 快照回滚失败:', e);
    }
  }

  /**
   * 销毁守卫，移除所有监听器
   */
  destroy() {
    if (this._debounceId !== null) {
      clearTimeout(this._debounceId);
      this._debounceId = null;
    }
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pagehide', this._onPageHide);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
  }

  // ================================================================
  //  内部方法
  // ================================================================

  _installGlobalListeners() {
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('pagehide', this._onPageHide);
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  _onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      console.log('[PersistenceGuard] 页面隐藏，立即刷新存储');
      this.flush();
    }
  }

  _onPageHide(event) {
    // pagehide 触发时页面即将销毁，同步写 localStorage 作为最后防线
    console.log('[PersistenceGuard] pagehide 触发，同步刷 localStorage');
    if (this._debounceId !== null) {
      clearTimeout(this._debounceId);
      this._debounceId = null;
    }
    if (this._dirty) {
      // 同步版本：只写 localStorage 部分（IDB 不支持同步）
      this._syncSaveLocalStorageOnly();
    }
  }

  _onBeforeUnload() {
    // beforeunload 作为额外保险（某些浏览器 pagehide 不稳定）
    if (this._debounceId !== null) {
      clearTimeout(this._debounceId);
      this._debounceId = null;
    }
    if (this._dirty) {
      this._syncSaveLocalStorageOnly();
    }
  }

  /**
   * 配置变更回调（由 App.js 的 onConfigChange 注册）
   */
  _onConfigChange() {
    this.markDirty();
    if (this.app.history && typeof this.app.history.render === 'function') {
      this.app.history.render();
    }
  }

  /**
   * 防抖保存
   */
  _debounceSave() {
    if (this._debounceId !== null) {
      clearTimeout(this._debounceId);
    }
    this._debounceId = setTimeout(() => {
      this._debounceId = null;
      this._doSave();
    }, DEBOUNCE_MS);
  }

  /**
   * 执行实际的保存操作
   */
  async _doSave() {
    if (this._saving) return;
    this._saving = true;

    try {
      const app = this.app;

      // 1. 先拍快照（用于回滚）
      this._lastSnapshot = JSON.stringify({
        lineages: app.versionLineages,
        currentLineageId: app.currentLineageId,
        currentVersionIndex: app.currentVersionIndex,
        apiValues: app.settings.getValues ? app.settings.getValues() : null
      });

      // 2. 收集需要保存的二进制数据
      let newBinaries = null;
      if (app.currentLineageId && app.versionLineages[app.currentLineageId]) {
        const lineage = app.versionLineages[app.currentLineageId];
        const v = lineage.versions[app.currentVersionIndex];
        if (v && (v.dataUrl || v.svg)) {
          newBinaries = {
            lineageId: app.currentLineageId,
            versionIndex: app.currentVersionIndex,
            binary: {
              dataUrl: v.dataUrl || '',
              thumbnail: v.thumbnail || '',
              svg: v.svg || ''
            }
          };
        }
      }

      // 3. 写入存储
      await saveFullState({
        lineages: app.versionLineages,
        currentLineageId: app.currentLineageId,
        currentVersionIndex: app.currentVersionIndex,
        customTabs: app.config.tabsConfig.filter(t => t.id.startsWith('custom_')),
        tabOrder: app.config.tabsConfig.map(t => t.id),
        apiValues: app.settings.getValues ? app.settings.getValues() : null,
        newBinaries
      });

      this._dirty = false;
      console.log('[PersistenceGuard] 保存成功');
    } catch (err) {
      console.error('[PersistenceGuard] 保存失败:', err);
      // 回滚到快照
      this.rollbackFromSnapshot();
    } finally {
      this._saving = false;
    }
  }

  /**
   * 同步保存仅 localStorage 部分（用于 pagehide / beforeunload）
   * 此时 IDB 异步写入不可靠，至少把元数据落盘
   */
  _syncSaveLocalStorageOnly() {
    try {
      const app = this.app;

      const targetId = app.currentLineageId || TEMPLATE_LINEAGE_ID;
      // 保存 setting bar 到 lineage
      saveSettingsBarToLineage(app, targetId);

      saveAll({
        currentLineageId: app.currentLineageId,
        currentVersionIndex: app.currentVersionIndex,
        customTabs: app.config.tabsConfig.filter(t => t.id.startsWith('custom_')),
        tabOrder: app.config.tabsConfig.map(t => t.id),
        apiValues: app.settings.getValues ? app.settings.getValues() : null
      });

      this._dirty = false;
      console.log('[PersistenceGuard] 同步刷 localStorage 成功');
    } catch (e) {
      console.error('[PersistenceGuard] 同步刷 localStorage 失败:', e);
    }
  }
}
