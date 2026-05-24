/**
 * StorageManager.js — 统一存储网关 (Repository 模式)
 *
 * 修复后架构：
 *   - IDB app_state → 全量 lineage 数据（含 base64 图片、history 字段、fingerprint）
 *   - IDB binaries → 版本二进制（lineage_xxx/vN）
 *   - localStorage → 仅设定 + 指针
 */

import * as ls from './storage.js';
import * as idb from './IndexedDBRepo.js';
import Lineage from './Lineage.js';

// ================================================================
//  Lineage 全量存取（IDB）
// ================================================================

/**
 * 保存全量 lineage 数据到 IndexedDB
 */
export async function saveLineages(lineages) {
  const stripped = {};
  for (const [lid, lineage] of Object.entries(lineages)) {
    const instance = lineage instanceof Lineage ? lineage : new Lineage(lineage);
    stripped[lid] = instance.toStripped();
  }
  await idb.putState(stripped);
}

/**
 * 从 IndexedDB 加载全量 lineage 数据（返回 Lineage 实例）
 */
export async function loadLineages() {
  const raw = await idb.getState() || {};
  const result = {};
  for (const [lid, data] of Object.entries(raw)) {
    result[lid] = Lineage.fromStripped(data);
  }
  return result;
}

// ================================================================
//  二进制数据（委托 IndexedDBRepo）
// ================================================================

export async function saveVersionBinary(lineageId, versionIndex, binary) {
  await idb.putBinary(lineageId, versionIndex, {
    dataUrl: binary.dataUrl || '',
    thumbnail: binary.thumbnail || '',
    svg: binary.svg || ''
  });
}

export async function loadVersionBinary(lineageId, versionIndex) {
  return await idb.getBinary(lineageId, versionIndex);
}

export async function deleteLineageBinary(lineageId) {
  await idb.deleteLineageBinaries(lineageId);
}

export async function clearAllBinaries() {
  await idb.clearAllBinaries();
}

export async function getStorageEstimate() {
  return await idb.estimateStorage();
}

// ================================================================
//  批量保存 / 加载（高层 API）
// ================================================================

/**
 * 保存完整应用状态
 */
export async function saveFullState(state) {
  // 1. IDB: 全量 lineages（含 base64 图片）
  await saveLineages(state.lineages);

  // 2. LS: 仅设定 + 指针
  ls.safeSet(ls.KEYS.curLineage, state.currentLineageId || '');
  ls.safeSet(ls.KEYS.curVersion, String(state.currentVersionIndex ?? 0));
  ls.setJSON(ls.KEYS.tabState, { customTabs: state.customTabs || [], tabOrder: state.tabOrder || null });
  if (state.apiValues !== undefined) {
    ls.setJSON(ls.KEYS.apiSettings, state.apiValues);
  }

  // 3. IDB: 版本二进制
  if (state.newBinaries) {
    const { lineageId, versionIndex, binary } = state.newBinaries;
    await saveVersionBinary(lineageId, versionIndex, binary);
  }
}

/**
 * 加载完整应用状态
 */
export async function loadFullState() {
  const lineages = await loadLineages();
  const ts = ls.getJSON(ls.KEYS.tabState, { customTabs: [], tabOrder: null });
  return {
    lineages,
    currentLineageId:    ls.safeGet(ls.KEYS.curLineage) || null,
    currentVersionIndex: parseInt(ls.safeGet(ls.KEYS.curVersion)) || 0,
    customTabs:          ts.customTabs || [],
    tabOrder:            ts.tabOrder || null,
    apiValues:           ls.getJSON(ls.KEYS.apiSettings, null),
  };
}

/**
 * 彻底清空所有应用数据
 */
export async function clearAllData() {
  ls.clearAll();
  await idb.clearAllBinaries();
  await idb.deleteState();
}
