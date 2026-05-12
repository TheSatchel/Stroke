/**
 * StorageManager.js — 统一存储网关 (Repository 模式)
 *
 * 职责：
 *   - localStorage → 配置、元数据、设定（小文本）
 *   - IndexedDBRepo → 全尺寸 base64、缩略图、SVG（大二进制）
 *   - 对外暴露统一的 save/load 接口
 *   - 内部处理存储分离决策
 *
 * 存储分布：
 *   localStorage:                     IndexedDB (binaries):
 *   ────────────────────────          ──────────────────────────
 *   stroke_api_settings              {lineageId}/v0
 *   stroke_configs                     ├── dataUrl
 *   stroke_fingerprints                ├── thumbnail
 *   stroke_tab_values                  └── svg
 *   stroke_cur_lineage               {lineageId}/v1
 *   stroke_cur_version                 ├── ...
 *   stroke_tab_state                 {anotherLineageId}/v0
 *   stroke_has_initialized             └── ...
 *   stroke_theme_*
 *   stroke_panel_sizes
 */

import * as ls from './storage.js';
import * as idb from './IndexedDBRepo.js';

// ================================================================
//  Lineage 元数据（localStorage 部分）
// ================================================================

/**
 * 保存 lineage 元数据到 localStorage
 * @param {Object} lineages - { [lineageId]: { fingerprint, tabValues, tabsConfig, tabOrder, versions (不含二进制) } }
 */
export function saveLineagesMeta(lineages) {
  // 深拷贝并剥离二进制字段（dataUrl/thumbnail/svg 不进 LS）
  const stripped = {};
  for (const [lid, lineage] of Object.entries(lineages)) {
    stripped[lid] = {
      fingerprint: lineage.fingerprint,
      tabValues: lineage.tabValues || {},
      tabsConfig: lineage.tabsConfig || [],
      tabOrder: lineage.tabOrder || [],
      versions: (lineage.versions || []).map(v => ({
        index: v.index,
        type: v.type || 'svg',
        time: v.time || '',
        // 二进制引用标记，不存实际数据
        hasBinary: !!(v.dataUrl || v.svg)
      }))
    };
  }
  ls.setJSON(ls.KEYS.lineages, stripped);
}

/**
 * 从 localStorage 加载 lineage 元数据
 * @returns {Object}
 */
export function loadLineagesMeta() {
  return ls.getJSON(ls.KEYS.lineages, {});
}

// ================================================================
//  指纹映射
// ================================================================

export function saveFingerprints(fingerprints) {
  ls.setJSON(ls.KEYS.fingerprints, fingerprints);
}

export function loadFingerprints() {
  return ls.getJSON(ls.KEYS.fingerprints, {});
}

// ================================================================
//  当前 lineage / version 指针
// ================================================================

export function saveCurrentPointer(lineageId, versionIndex) {
  ls.safeSet(ls.KEYS.curLineage, lineageId || '');
  ls.safeSet(ls.KEYS.curVersion, String(versionIndex ?? 0));
}

export function loadCurrentPointer() {
  return {
    lineageId: ls.safeGet(ls.KEYS.curLineage) || null,
    versionIndex: parseInt(ls.safeGet(ls.KEYS.curVersion)) || 0
  };
}

// ================================================================
//  历史项
// ================================================================

export function saveHistory(items) {
  ls.setJSON(ls.KEYS.history, items);
}

export function loadHistory() {
  return ls.getJSON(ls.KEYS.history, []);
}

// ================================================================
//  Tab 状态 & 值
// ================================================================

export function saveTabState(customTabs, tabOrder) {
  ls.setJSON(ls.KEYS.tabState, { customTabs, tabOrder });
}

export function loadTabState() {
  return ls.getJSON(ls.KEYS.tabState, { customTabs: [], tabOrder: null });
}

export function saveTabValues(tabValues) {
  ls.setJSON(ls.KEYS.tabValues, tabValues);
}

export function loadTabValues() {
  return ls.getJSON(ls.KEYS.tabValues, {});
}

// ================================================================
//  API Settings
// ================================================================

export function saveApiSettings(values) {
  ls.setJSON(ls.KEYS.apiSettings, values);
}

export function loadApiSettings() {
  return ls.getJSON(ls.KEYS.apiSettings, null);
}

// ================================================================
//  二进制数据（委托 IndexedDBRepo）
// ================================================================

/**
 * 保存一个版本的二进制数据
 * @param {string} lineageId
 * @param {number} versionIndex
 * @param {{ dataUrl: string, thumbnail: string, svg: string }} binary
 */
export async function saveVersionBinary(lineageId, versionIndex, binary) {
  await idb.putBinary(lineageId, versionIndex, {
    dataUrl: binary.dataUrl || '',
    thumbnail: binary.thumbnail || '',
    svg: binary.svg || ''
  });
}

/**
 * 加载一个版本的二进制数据
 * @param {string} lineageId
 * @param {number} versionIndex
 * @returns {Promise<{ dataUrl: string, thumbnail: string, svg: string }|undefined>}
 */
export async function loadVersionBinary(lineageId, versionIndex) {
  return await idb.getBinary(lineageId, versionIndex);
}

/**
 * 删除指定 lineage 的所有二进制数据
 * @param {string} lineageId
 */
export async function deleteLineageBinary(lineageId) {
  await idb.deleteLineageBinaries(lineageId);
}

/**
 * 清空所有二进制数据
 */
export async function clearAllBinaries() {
  await idb.clearAllBinaries();
}

/**
 * 获取存储配额信息
 * @returns {Promise<{ usage: number, quota: number }|null>}
 */
export async function getStorageEstimate() {
  return await idb.estimateStorage();
}

// ================================================================
//  批量保存 / 加载（高层 API，供 PersistenceGuard 使用）
// ================================================================

/**
 * 保存完整应用状态到 LS + IDB
 * @param {Object} state
 * @param {Array}   state.historyItems
 * @param {Object}  state.lineages
 * @param {Object}  state.fingerprints
 * @param {string}  state.currentLineageId
 * @param {number}  state.currentVersionIndex
 * @param {Object}  state.tabValues
 * @param {Object}  state.apiValues
 * @param {Object}  [state.newBinaries] - { lineageId, versionIndex, binary } 本次新增的二进制
 */
export async function saveFullState(state) {
  // 1. 写 localStorage（同步，快速）
  saveHistory(state.historyItems);
  saveLineagesMeta(state.lineages);
  saveFingerprints(state.fingerprints);
  saveCurrentPointer(state.currentLineageId, state.currentVersionIndex);
  saveTabValues(state.tabValues);
  if (state.apiValues !== undefined) {
    saveApiSettings(state.apiValues);
  }

  // 2. 写 IndexedDB（异步，仅本次新增的二进制）
  if (state.newBinaries) {
    const { lineageId, versionIndex, binary } = state.newBinaries;
    await saveVersionBinary(lineageId, versionIndex, binary);
  }
}

/**
 * 加载完整应用状态
 * @returns {Promise<Object>}
 */
export async function loadFullState() {
  const state = {
    historyItems: loadHistory(),
    lineages: loadLineagesMeta(),
    fingerprints: loadFingerprints(),
    ...loadCurrentPointer(),
    tabValues: loadTabValues(),
    apiValues: loadApiSettings(),
  };
  return state;
}

/**
 * 彻底清空所有应用数据
 */
export async function clearAllData() {
  ls.clearAll();
  await idb.clearAllBinaries();
}
