/**
 * LineageManager.js — Lineage CRUD 领域逻辑
 *
 * 职责：
 *   - matchOrCreate(contentFp) → 基于内容指纹匹配已有 lineage 或创建新的
 *   - addVersion(lineageId, version) → 追加新版，返回 versionIndex
 *   - getActiveVersion(lineageId) → 获取当前活跃版本
 *   - evictOldest() → 淘汰最旧的 lineage（存储配额管理）
 *   - deleteLineage(lineageId) → 删除 lineage 及关联二进制
 *
 * 所有二进制数据通过 StorageManager 存取。
 * 不依赖 App 实例，可独立测试。
 */

import {
  saveVersionBinary,
  loadVersionBinary,
  deleteLineageBinary,
  saveLineagesMeta,
  saveFingerprints
} from './StorageManager.js';

/**
 * @typedef {Object} LineageVersion
 * @property {number}  index
 * @property {string}  type     - 'raster' | 'svg'
 * @property {string}  svg      - SVG 源码
 * @property {string}  dataUrl  - 全尺寸 base64（存 IndexedDB）
 * @property {string}  thumbnail - 缩略图
 * @property {string}  time     - 创建时间 HH:mm
 */

/**
 * @typedef {Object} Lineage
 * @property {string}           fingerprint - 完整内容指纹
 * @property {LineageVersion[]} versions
 * @property {Object}           tabValues
 * @property {Array}            tabsConfig
 * @property {Array}            tabOrder
 */

export default class LineageManager {
  /**
   * @param {Object<string, Lineage>} lineages - 引用 App.versionLineages
   * @param {Object<string, string>} fingerprints - 引用 App.configFingerprints ({ contentFp: lineageId })
   */
  constructor(lineages, fingerprints) {
    /** @type {Object<string, Lineage>} */
    this.lineages = lineages;

    /** @type {Object<string, string>} */
    this.fingerprints = fingerprints;

    /** @type {number} 最大保留 lineage 数量 */
    this.maxLineages = 50;
  }

  // ================================================================
  //  公开 API
  // ================================================================

  /**
   * 基于内容指纹匹配已有 lineage 或创建新的
   * @param {string} contentFp - 完整内容指纹（含 prompt 值）
   * @param {Object} initialData - { tabValues, tabsConfig, tabOrder }
   * @returns {{ lineageId: string, isNew: boolean }}
   */
  matchOrCreate(contentFp, initialData = {}) {
    // 1. 精确匹配内容指纹
    const existingId = this.fingerprints[contentFp];
    if (existingId && this.lineages[existingId]) {
      return { lineageId: existingId, isNew: false };
    }

    // 2. 创建新的 lineage
    const lineageId = 'lineage_' + Date.now();
    this.lineages[lineageId] = {
      fingerprint: contentFp,
      versions: [],
      tabValues: initialData.tabValues || {},
      tabsConfig: initialData.tabsConfig || [],
      tabOrder: initialData.tabOrder || []
    };
    this.fingerprints[contentFp] = lineageId;

    return { lineageId, isNew: true };
  }

  /**
   * 追加一个新版本到指定 lineage
   * @param {string} lineageId
   * @param {Object} versionData
   * @param {string} versionData.type - 'raster' | 'svg'
   * @param {string} versionData.svg
   * @param {string} versionData.dataUrl - 全尺寸 base64
   * @param {string} versionData.thumbnail - 缩略图
   * @param {string} versionData.time - HH:mm
   * @returns {number} 新版本索引
   */
  addVersion(lineageId, versionData) {
    const lineage = this.lineages[lineageId];
    if (!lineage) throw new Error(`[LineageManager] lineage ${lineageId} not found`);

    const versionIndex = lineage.versions.length;
    const version = {
      index: versionIndex,
      type: versionData.type || 'svg',
      svg: versionData.svg || '',
      dataUrl: versionData.dataUrl || '',
      thumbnail: versionData.thumbnail || '',
      time: versionData.time || ''
    };
    lineage.versions.push(version);

    return versionIndex;
  }

  /**
   * 获取指定版本
   * @param {string} lineageId
   * @param {number} versionIndex
   * @returns {LineageVersion | undefined}
   */
  getVersion(lineageId, versionIndex) {
    const lineage = this.lineages[lineageId];
    if (!lineage) return undefined;
    return lineage.versions[versionIndex];
  }

  /**
   * 获取当前活跃版本（最后一个版本）
   * @param {string} lineageId
   * @returns {LineageVersion | undefined}
   */
  getActiveVersion(lineageId) {
    const lineage = this.lineages[lineageId];
    if (!lineage || lineage.versions.length === 0) return undefined;
    return lineage.versions[lineage.versions.length - 1];
  }

  /**
   * 加载版本的完整二进制数据（从 IndexedDB）
   * @param {string} lineageId
   * @param {number} versionIndex
   * @returns {Promise<{ dataUrl: string, thumbnail: string, svg: string }|undefined>}
   */
  async loadVersionBinary(lineageId, versionIndex) {
    return await loadVersionBinary(lineageId, versionIndex);
  }

  /**
   * 保存版本的完整二进制数据到 IndexedDB
   * @param {string} lineageId
   * @param {number} versionIndex
   * @param {{ dataUrl: string, thumbnail: string, svg: string }} binary
   */
  async saveVersionBinary(lineageId, versionIndex, binary) {
    await saveVersionBinary(lineageId, versionIndex, binary);
  }

  /**
   * 更新 lineage 的 tabValues
   * @param {string} lineageId
   * @param {Object} tabValues
   */
  updateTabValues(lineageId, tabValues) {
    const lineage = this.lineages[lineageId];
    if (lineage) {
      lineage.tabValues = tabValues;
    }
  }

  /**
   * 更新 lineage 的 tabsConfig 和 tabOrder
   * @param {string} lineageId
   * @param {Array} tabsConfig
   * @param {Array} tabOrder
   */
  updateTabsConfig(lineageId, tabsConfig, tabOrder) {
    const lineage = this.lineages[lineageId];
    if (lineage) {
      lineage.tabsConfig = tabsConfig;
      lineage.tabOrder = tabOrder;
    }
  }

  /**
   * 删除整个 lineage（包括二进制数据）
   * @param {string} lineageId
   * @returns {Promise<void>}
   */
  async deleteLineage(lineageId) {
    // 1. 移除指纹映射
    const lineage = this.lineages[lineageId];
    if (lineage && lineage.fingerprint) {
      for (const [fp, lid] of Object.entries(this.fingerprints)) {
        if (lid === lineageId) {
          delete this.fingerprints[fp];
          break;
        }
      }
    }

    // 2. 移除 lineage 数据
    delete this.lineages[lineageId];

    // 3. 删除 IndexedDB 中的二进制数据
    await deleteLineageBinary(lineageId);
  }

  /**
   * 淘汰最旧的 lineage（当超过最大数量时）
   * 保留当前活跃的 lineage，只淘汰历史 lineage。
   * @param {string} activeLineageId - 当前活跃的 lineage（不淘汰）
   * @returns {Promise<number>} 淘汰的数量
   */
  async evictOldest(activeLineageId) {
    const ids = Object.keys(this.lineages);
    if (ids.length <= this.maxLineages) return 0;

    // 按第一个版本的创建时间排序（从 lineageId 的 Date.now() 推导）
    const sorted = ids
      .filter(id => id !== activeLineageId)
      .sort((a, b) => {
        const timeA = parseInt(a.replace('lineage_', '')) || 0;
        const timeB = parseInt(b.replace('lineage_', '')) || 0;
        return timeA - timeB; // 升序：旧的在前
      });

    const toEvict = sorted.slice(0, ids.length - this.maxLineages);
    for (const id of toEvict) {
      await this.deleteLineage(id);
    }

    console.log(`[LineageManager] 淘汰 ${toEvict.length} 条旧 lineage`);
    return toEvict.length;
  }

  /**
   * 持久化元数据到 localStorage
   */
  persistMeta() {
    saveLineagesMeta(this.lineages);
    saveFingerprints(this.fingerprints);
  }
}
