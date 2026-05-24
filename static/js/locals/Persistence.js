/**
 * Persistence.js — 持久化存取 + 历史删除
 * 将 App 状态序列化到 localStorage 或从中恢复。
 */

import { saveAll as storageSaveAll, loadAll as storageLoadAll, clearHistory, getJSON, KEYS, safeRemove } from './storage.js';
import { deleteLineageBinary, clearAllBinaries, saveLineages, loadLineages, loadVersionBinary } from './StorageManager.js';
import { defaultConfigTabs } from '../components/ConfigTabs.js';
import Lineage from './Lineage.js';

export const TEMPLATE_LINEAGE_ID = 'lineage_0';

function createTemplateLineage() {
  return new Lineage({
    fingerprint: '',
    tabValues: {},
    tabsConfig: defaultConfigTabs.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options })),
    tabOrder: defaultConfigTabs.map(t => t.id),
    versions: [],
    history: { time: '', versionCount: 0, versionActive: 0, type: 'svg', svg: '', thumbnail: '' }
  });
}

function ensureTemplateLineage(lineages) {
  if (!lineages[TEMPLATE_LINEAGE_ID]) {
    lineages[TEMPLATE_LINEAGE_ID] = createTemplateLineage();
  }
}

function migrateOldGlobalToTemplateLineage(app) {
  try {
    const old = getJSON(KEYS.tabsConfigFull, null);
    if (!old || !Array.isArray(old) || old.length === 0) return;
    ensureTemplateLineage(app.versionLineages);
    app.versionLineages[TEMPLATE_LINEAGE_ID].tabsConfig = old.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options }));
    app.versionLineages[TEMPLATE_LINEAGE_ID].tabOrder = old.map(t => t.id);
    safeRemove(KEYS.tabsConfigFull);
  } catch (e) { /* ignore */ }
}

/**
 * 序列化 App 当前状态并写入 localStorage
 * @param {import('../uis/App.js').default} app
 */
export function saveAppState(app) {
  const targetId = app.currentLineageId || TEMPLATE_LINEAGE_ID;
  saveSettingsBarToLineage(app, targetId);

  storageSaveAll({
    currentLineageId: app.currentLineageId,
    currentVersionIndex: app.currentVersionIndex,
    customTabs: app.config.tabsConfig.filter(t => t.id.startsWith('custom_')),
    tabOrder: app.config.tabsConfig.map(t => t.id),
    apiValues: app.settings.getValues ? app.settings.getValues() : null
  });

  saveLineages(app.versionLineages).catch(e => {
    console.warn('[Persistence] saveLineages 失败:', e);
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
  if (!app.versionLineages[lid]) app.versionLineages[lid] = createTemplateLineage();
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
export async function loadAppState(app) {
  // 1. 先尝试从 IDB 加载
  let lineages = await loadLineages();

  ensureTemplateLineage(lineages);
  app.versionLineages = lineages;
  if (app._lineageManager) app._lineageManager.lineages = lineages;

  const saved = storageLoadAll();
  app.currentLineageId = saved.currentLineageId || null;
  app.currentVersionIndex = saved.currentVersionIndex || 0;

  migrateOldGlobalToTemplateLineage(app);

  const sourceId = (app.currentLineageId && app.versionLineages[app.currentLineageId]) ? app.currentLineageId : TEMPLATE_LINEAGE_ID;
  if (!loadSettingsBarFromLineage(app, sourceId)) {
    app.config.tabsConfig = defaultConfigTabs.map(t => ({ ...t, options: Array.isArray(t.options) ? [...t.options] : t.options }));
    app.config.render();
    saveSettingsBarToLineage(app, TEMPLATE_LINEAGE_ID);
  }

  if (saved.apiValues && app.settings.restoreValues) app.settings.restoreValues(saved.apiValues);

  app._rebuildHistoryItems();
  app.history.render();
  if (app.currentLineageId && app.versionLineages[app.currentLineageId]) {
    const lineage = app.versionLineages[app.currentLineageId];
    const vIdx = app.currentVersionIndex;
    // 懒水合当前版本
    lineage.hydrateVersion(vIdx, loadVersionBinary, app.currentLineageId).then(() => {
      const v = lineage.getVersion(vIdx);
      if (v) app.canvas.loadVersion(v);
    });
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
  if (lineageId && app.versionLineages[lineageId] && lineageId !== TEMPLATE_LINEAGE_ID) {
    delete app.versionLineages[lineageId];

    // 异步清理 IndexedDB 中的二进制数据
    deleteLineageBinary(lineageId).catch(e => {
      console.warn('[Persistence] 删除 IDB 二进制失败:', e);
    });
  }
  items.splice(index, 1);
  if (app.currentLineageId === lineageId) {
    app.currentLineageId = TEMPLATE_LINEAGE_ID;
    app.currentVersionIndex = 0;
    app.canvas.clear();
    const refEntry = app.config.widgets['canvas_ref_image'];
    if (refEntry) {
      app.config.removeTab('canvas_ref_image');
    }
    loadSettingsBarFromLineage(app, TEMPLATE_LINEAGE_ID);
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
  // Keep lineage_0, remove all others
  const template = app.versionLineages[TEMPLATE_LINEAGE_ID] || createTemplateLineage();
  app.versionLineages = {};
  app.versionLineages[TEMPLATE_LINEAGE_ID] = template;
  if (app._lineageManager) app._lineageManager.lineages = app.versionLineages;
  app.currentLineageId = TEMPLATE_LINEAGE_ID;
  app.currentVersionIndex = 0;
  app.history.render();
  clearHistory();

  // Step 1: 清空所有 IDB 二进制数据（含 app_state 和所有版本二进制）
  clearAllBinaries().catch(e => {
    console.warn('[Persistence] 清空 IDB 失败:', e);
  });

  // Step 2: 重新写入仅含 lineage_0 的最小 app_state
  saveLineages(app.versionLineages).catch(e => {
    console.warn('[Persistence] 重新保存 app_state 失败:', e);
  });

  // Step 3: 更新 LS 指针
  saveAppState(app);
}