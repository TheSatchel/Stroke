/**
 * Persistence.js — 持久化存取 + 历史删除
 * 将 App 状态序列化到 localStorage 或从中恢复。
 */

import { saveAll as storageSaveAll, loadAll as storageLoadAll, clearHistory, loadTabsConfigFull } from './storage.js';
import { deleteLineageBinary, clearAllBinaries } from './StorageManager.js';
import { defaultConfigTabs } from '../components/ConfigTabs.js';

export const HIDDEN_LINEAGE_ID = '__default__';

function createDefaultLineage() {
  return {
    versions: [],
    tabsConfig: defaultConfigTabs.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options })),
    tabOrder: defaultConfigTabs.map(t => t.id),
    tabValues: {}
  };
}

function ensureHiddenLineage(app) {
  if (!app.versionLineages[HIDDEN_LINEAGE_ID]) {
    app.versionLineages[HIDDEN_LINEAGE_ID] = createDefaultLineage();
  }
}

function migrateOldGlobalToHiddenLineage(app) {
  try {
    const old = loadTabsConfigFull();
    if (!old || !Array.isArray(old) || old.length === 0) return;
    ensureHiddenLineage(app);
    app.versionLineages[HIDDEN_LINEAGE_ID].tabsConfig = old.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options }));
    app.versionLineages[HIDDEN_LINEAGE_ID].tabOrder = old.map(t => t.id);
    localStorage.removeItem('stroke_tabs_config_full');
  } catch (e) { /* ignore */ }
}

/**
 * 序列化 App 当前状态并写入 localStorage
 * @param {import('../uis/App.js').default} app
 */
export function saveAppState(app) {
  const targetId = app.currentLineageId || HIDDEN_LINEAGE_ID;
  saveSettingsBarToLineage(app, targetId);

  storageSaveAll({
    historyItems: app.history.items,
    lineages: app.versionLineages,
    fingerprints: app.configFingerprints,
    currentLineageId: app.currentLineageId,
    currentVersionIndex: app.currentVersionIndex,
    customTabs: app.config.tabsConfig.filter(t => t.id.startsWith('custom_')),
    tabOrder: app.config.tabsConfig.map(t => t.id),
    tabValues: app.config.getTabValues(),
    apiValues: app.settings.getValues ? app.settings.getValues() : null,
    generatorState: {
      provider: app.generator.activeId,
      model: app.generator.activeConfig.model || '',
      apiKey: app.generator.activeConfig.apiKey || ''
    }
  });
}

// ================================================================
//  Lineage 级别的 Setting Bar 存取
// ================================================================

/**
 * 将当前 setting bar（tabsConfig + tabOrder + tabValues）存入指定 lineage
 * @param {import('../uis/App.js').default} app
 * @param {string} [lineageId] — 可选，默认使用 app.currentLineageId
 */
export function saveSettingsBarToLineage(app, lineageId) {
  const lid = lineageId || app.currentLineageId;
  if (!lid) return;
  if (!app.versionLineages[lid]) app.versionLineages[lid] = createDefaultLineage();
  const lineage = app.versionLineages[lid];

  const tabsToSave = app.config.tabsConfig.filter(tab => tab.unpersist !== true);
  lineage.tabsConfig = tabsToSave.map(t => ({ ...t }));

  lineage.tabOrder = app.config.tabsConfig.map(t => t.id);
  lineage.tabValues = app.config.getTabValues();
}

/**
 * 从指定 lineage 恢复 setting bar 到 app.config（会触发 re-render）
 * @param {import('../uis/App.js').default} app
 * @param {string} [lineageId] — 可选，默认使用 app.currentLineageId
 * @returns {boolean} 是否成功从 lineage 恢复
 */
export function loadSettingsBarFromLineage(app, lineageId) {
  const lid = lineageId || app.currentLineageId;
  if (!lid || !app.versionLineages[lid]) return false;

  const lineage = app.versionLineages[lid];
  if (!lineage.tabsConfig || !Array.isArray(lineage.tabsConfig)) return false;

  // 深拷贝恢复 tabsConfig
  app.config.tabsConfig = lineage.tabsConfig.map(t => {
    const copy = { ...t };
    if (Array.isArray(t.options)) copy.options = [...t.options];
    return copy;
  });

  // 恢复排序
  if (lineage.tabOrder && Array.isArray(lineage.tabOrder)) {
    const orderMap = {};
    lineage.tabOrder.forEach((id, idx) => { orderMap[id] = idx; });
    app.config.tabsConfig.sort((a, b) => {
      const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 999;
      const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 999;
      return oa - ob;
    });
  }

  // 重渲染
  app.config.render();

  // 延迟恢复 tab 值
  if (lineage.tabValues) {
    setTimeout(() => {
      app.config.restoreTabValues(lineage.tabValues);
    }, 80);
  }

  return true;
}

/**
 * 从 localStorage 恢复 App 状态
 * @param {import('../uis/App.js').default} app
 */
export function loadAppState(app) {
  const saved = storageLoadAll();
  if (saved.historyItems?.length) app.history.items = saved.historyItems;
  if (saved.lineages) app.versionLineages = saved.lineages;
  if (saved.fingerprints) app.configFingerprints = saved.fingerprints;
  app.currentLineageId = saved.currentLineageId || null;
  app.currentVersionIndex = saved.currentVersionIndex || 0;

  migrateOldGlobalToHiddenLineage(app);
  ensureHiddenLineage(app);

  const sourceId = (app.currentLineageId && app.versionLineages[app.currentLineageId]) ? app.currentLineageId : HIDDEN_LINEAGE_ID;
  if (!loadSettingsBarFromLineage(app, sourceId)) {
    app.config.tabsConfig = defaultConfigTabs.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options }));
    app.config.render();
    saveSettingsBarToLineage(app, HIDDEN_LINEAGE_ID);
  }

  if (saved.apiValues && app.settings.restoreValues) app.settings.restoreValues(saved.apiValues);
  if (saved.generatorState?.provider) app.generator.use(saved.generatorState.provider, { model: saved.generatorState.model || '' });

  app.history.render();
  if (app.currentLineageId && app.versionLineages[app.currentLineageId]) {
    const v = app.versionLineages[app.currentLineageId].versions[app.currentVersionIndex];
    if (v) setTimeout(() => app.canvas.loadVersion(v), 100);
  }
}

/**
 * 删除单个历史项
 * @param {import('../uis/App.js').default} app
 * @param {number} index
 */
export function deleteHistoryItem(app, index) {
  const items = app.history.items;
  if (index < 0 || index >= items.length) return;
  const item = items[index];
  const lineageId = item.lineageId;
  if (lineageId && app.versionLineages[lineageId]) {
    Object.keys(app.configFingerprints).forEach(fp => {
      if (app.configFingerprints[fp] === lineageId) {
        delete app.configFingerprints[fp];
      }
    });
    delete app.versionLineages[lineageId];

    // 异步清理 IndexedDB 中的二进制数据
    deleteLineageBinary(lineageId).catch(e => {
      console.warn('[Persistence] 删除 IDB 二进制失败:', e);
    });
  }
  items.splice(index, 1);
  if (app.currentLineageId === lineageId) {
    app.currentLineageId = null;
    app.currentVersionIndex = 0;
    // Clear canvas when deleting the currently-viewed history item
    app.canvas.clear();
    // Also remove canvas_ref_image widget if present
    const refEntry = app.config.widgets['canvas_ref_image'];
    if (refEntry) {
      app.config.removeTab('canvas_ref_image');
    }
  }
  app.history.render();
  saveAppState(app);
}

/**
 * 删除全部历史
 * @param {import('../uis/App.js').default} app
 */
export function deleteAllHistory(app) {
  app.history.items = [];
  app.versionLineages = {};
  app.configFingerprints = {};
  app.currentLineageId = null;
  app.currentVersionIndex = 0;
  app.history.render();
  clearHistory();

  // 异步清理所有 IndexedDB 二进制数据
  clearAllBinaries().catch(e => {
    console.warn('[Persistence] 清空 IDB 失败:', e);
  });

  saveAppState(app);
}