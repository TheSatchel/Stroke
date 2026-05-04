/**
 * persistence.js — 持久化存取 + 历史删除
 * 将 App 状态序列化到 localStorage 或从中恢复。
 */

import { saveAll as storageSaveAll, loadAll as storageLoadAll, clearHistory, loadConfigs, saveTabsConfigFull, loadTabsConfigFull, hasInitialized, markInitialized } from '../storage.js';

/**
 * 序列化 App 当前状态并写入 localStorage
 * @param {import('./App.js').default} app
 */
export function saveAppState(app) {
  // 不再每次调用 saveAppState 都写入 lineage，由手动"💾 保存"按钮触发

  const customTabs = app.config.tabsConfig.filter(t => t.id.startsWith('custom_'));
  const tabOrder = app.config.tabsConfig.map(t => t.id);
  const tabValues = app.config.getTabValues();
  const apiValues = app.settings.getValues ? app.settings.getValues() : null;
  const generatorState = {
    provider: app.generator.activeId,
    model: app.generator.activeConfig.model || '',
    apiKey: app.generator.activeConfig.apiKey || ''
  };

  // 持久化完整的 tabsConfig（用于恢复时直接替换，不再合并默认）
  saveTabsConfigFull(app.config.tabsConfig);

  storageSaveAll({
    historyItems: app.history.items,
    lineages: app.versionLineages,
    fingerprints: app.configFingerprints,
    currentLineageId: app.currentLineageId,
    currentVersionIndex: app.currentVersionIndex,
    customTabs: customTabs,
    tabOrder: tabOrder,
    tabValues: tabValues,
    apiValues: apiValues,
    generatorState: generatorState
  });
}

// ================================================================
//  Lineage 级别的 Setting Bar 存取
// ================================================================

/**
 * 将当前 setting bar（tabsConfig + tabOrder + tabValues）存入指定 lineage
 * @param {import('./App.js').default} app
 * @param {string} [lineageId] — 可选，默认使用 app.currentLineageId
 */
export function saveSettingsBarToLineage(app, lineageId) {
  const lid = lineageId || app.currentLineageId;
  if (!lid || !app.versionLineages[lid]) return;

  const lineage = app.versionLineages[lid];
  lineage.tabsConfig = app.config.tabsConfig.map(t => {
    const copy = { ...t };
    if (Array.isArray(t.options)) copy.options = [...t.options];
    return copy;
  });
  lineage.tabOrder = app.config.tabsConfig.map(t => t.id);
  lineage.tabValues = app.config.getTabValues();
}

/**
 * 从指定 lineage 恢复 setting bar 到 app.config（会触发 re-render）
 * @param {import('./App.js').default} app
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
 * @param {import('./App.js').default} app
 */
export function loadAppState(app) {
  const saved = storageLoadAll();

  if (saved.historyItems && saved.historyItems.length > 0) {
    app.history.items = saved.historyItems;
  }
  if (saved.lineages) {
    app.versionLineages = saved.lineages;
  }
  if (saved.fingerprints) {
    app.configFingerprints = saved.fingerprints;
  }
  app.currentLineageId = saved.currentLineageId || null;
  app.currentVersionIndex = saved.currentVersionIndex || 0;

  // 恢复完整的 tabsConfig：优先从持久化的完整版本恢复，回退到旧版合并逻辑
  // 仅在首次打开（无持久化数据）时使用默认 tabs
  const persistedTabsConfig = loadTabsConfigFull();
  let lineageRestored = false;

  if (persistedTabsConfig && Array.isArray(persistedTabsConfig) && persistedTabsConfig.length > 0) {
    // 已有持久化数据 → 直接替换 tabsConfig（不再合并默认值）
    app.config.tabsConfig = persistedTabsConfig.map(t => {
      const copy = { ...t };
      if (Array.isArray(t.options)) copy.options = [...t.options];
      return copy;
    });

    // 恢复排序
    if (saved.tabOrder && Array.isArray(saved.tabOrder)) {
      const orderMap = {};
      saved.tabOrder.forEach((id, idx) => { orderMap[id] = idx; });
      app.config.tabsConfig.sort((a, b) => {
        const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 999;
        const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 999;
        return oa - ob;
      });
    }

    // 恢复 tab 值（延迟等 widget 就绪）
    if (saved.tabValues) {
      setTimeout(() => {
        app.config.restoreTabValues(saved.tabValues);
      }, 50);
    }
  } else if (!hasInitialized()) {
    // 首次打开 → 使用默认 tabs，并立即持久化
    markInitialized();
    saveTabsConfigFull(app.config.tabsConfig);
    // 恢复排序
    if (saved.tabOrder && Array.isArray(saved.tabOrder)) {
      const orderMap = {};
      saved.tabOrder.forEach((id, idx) => { orderMap[id] = idx; });
      app.config.tabsConfig.sort((a, b) => {
        const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 999;
        const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 999;
        return oa - ob;
      });
    }
    // 恢复 tab 值（延迟等 widget 就绪）
    if (saved.tabValues) {
      setTimeout(() => {
        app.config.restoreTabValues(saved.tabValues);
      }, 50);
    }
  } else {
    // 从 lineage 恢复或旧版数据迁移
    lineageRestored = loadSettingsBarFromLineage(app);
    if (!lineageRestored) {
      // 回退：从旧版自定义 tab 存储恢复
      if (saved.customTabs && saved.customTabs.length > 0) {
        app.config.tabsConfig = app.config.tabsConfig.filter(t => !t.id.startsWith('custom_'));
        for (const ct of saved.customTabs) {
          app.config.tabsConfig.push(ct);
        }
      }

      // 恢复排序
      if (saved.tabOrder && Array.isArray(saved.tabOrder)) {
        const orderMap = {};
        saved.tabOrder.forEach((id, idx) => { orderMap[id] = idx; });
        app.config.tabsConfig.sort((a, b) => {
          const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 999;
          const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 999;
          return oa - ob;
        });
      }

      // 恢复 tab 值（延迟等 widget 就绪）
      if (saved.tabValues) {
        setTimeout(() => {
          app.config.restoreTabValues(saved.tabValues);
        }, 50);
      }
    }
  }

  // 恢复 API 设置
  if (saved.apiValues && app.settings.restoreValues) {
    app.settings.restoreValues(saved.apiValues);
  }

  // 恢复生成器状态
  if (saved.generatorState && saved.generatorState.provider) {
    const gs = saved.generatorState;
    const cfg = { model: gs.model || '' };
    app.generator.use(gs.provider, cfg);
  }

  app.history.render();
  // 注意：lineage 恢复时已调用 render，全局回退时还没调用
  if (!lineageRestored) {
    app.config.render();
  }

  // 恢复当前版本画布
  if (app.currentLineageId && app.versionLineages[app.currentLineageId]) {
    const lineage = app.versionLineages[app.currentLineageId];
    const v = lineage.versions[app.currentVersionIndex];
    if (v) {
      setTimeout(() => {
        app.canvas.loadVersion(v);
      }, 100);
    }
  }
}

/**
 * 删除单个历史项
 * @param {import('./App.js').default} app
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
 * @param {import('./App.js').default} app
 */
export function deleteAllHistory(app) {
  app.history.items = [];
  app.versionLineages = {};
  app.configFingerprints = {};
  app.currentLineageId = null;
  app.currentVersionIndex = 0;
  app.history.render();
  clearHistory();
  saveAppState(app);
}