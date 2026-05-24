/**
 * Lineage.js — 生成历史的最小单位
 *
 * 提供：
 *   - 数据 & 二进制分离           → toStripped() 自动脱敏
 *   - 懒加载版本二进制            → hydrateVersion(index)
 *   - 版本 CRUD
 *   - 内嵌 history 摘要
 */

export default class Lineage {
  constructor(opts = {}) {
    this.name        = opts.name || '';
    this.fingerprint = opts.fingerprint || '';
    this.tabValues   = opts.tabValues || {};
    this.tabsConfig  = opts.tabsConfig || [];
    this.tabOrder    = opts.tabOrder || [];
    this.versions    = opts.versions || [];
    this.history     = opts.history || { time: '', versionCount: 0, versionActive: 0, type: 'svg', svg: '', thumbnail: '' };
  }

  // ================================================================
  //   序列化
  // ================================================================

  /**
   * 去二进制 → 写入 IDB app_state
   */
  toStripped() {
    return {
      name:        this.name || '',
      fingerprint: this.fingerprint,
      tabValues:   this.tabValues,
      tabsConfig:  this.tabsConfig,
      tabOrder:    this.tabOrder,
      versions: this.versions.map(v => ({
        index: v.index,
        type:  v.type || 'svg',
        time:  v.time || '',
        hasBinary: !!(v.dataUrl || v.svg)
      })),
      history: {
        time: this.history.time || '',
        versionCount: this.history.versionCount || 0,
        versionActive: this.history.versionActive || 0,
        type: this.history.type || 'svg',
        svg: this.history.svg || '',
        thumbnail: this.history.thumbnail || ''
      }
    };
  }

  /**
   * 从脱敏快照重建 Lineage 实例
   */
  static fromStripped(data) {
    if (!data || typeof data !== 'object') return new Lineage();
    const versions = (data.versions || []).map(v => ({
      index: v.index,
      type:  v.type || 'svg',
      time:  v.time || '',
      dataUrl:   '',
      svg:       '',
      thumbnail: ''
    }));
    return new Lineage({
      name:        data.name || '',
      fingerprint: data.fingerprint || '',
      tabValues:   data.tabValues || {},
      tabsConfig:  data.tabsConfig || [],
      tabOrder:    data.tabOrder || [],
      versions,
      history: data.history || { time: '', versionCount: 0, versionActive: 0, type: 'svg', svg: '', thumbnail: '' }
    });
  }

  // ================================================================
  //   版本操作
  // ================================================================

  /**
   * 追加版本到对象内并返回 index
   */
  addVersion(v) {
    const idx = this.versions.length;
    this.versions.push({
      index: idx,
      type:  v.type || 'svg',
      svg:   v.svg || '',
      dataUrl: v.dataUrl || '',
      thumbnail: v.thumbnail || '',
      time:  v.time || ''
    });
    return idx;
  }

  /**
   * 获取版本（内存中已有二进制，不能保证一定有）
   */
  getVersion(index) {
    return this.versions[index] || null;
  }

  get activeVersion() {
    return this.versions[this.versions.length - 1] || null;
  }

  get versionCount() {
    return this.versions.length;
  }

  // ================================================================
  //   history 摘要
  // ================================================================

  updateHistory(vIndex, vType, vSvg, vTime, vThumbnail) {
    this.history.versionCount  = vIndex + 1;
    this.history.versionActive = vIndex;
    this.history.type      = vType || 'svg';
    this.history.svg       = vSvg || '';
    this.history.time      = vTime || '';
    this.history.thumbnail = vThumbnail || '';
  }

  /**
   * 仅更新 history 中当前活跃版本索引（版本步进器用）
   * @param {number} index
   */
  setHistoryVersionActive(index) {
    if (typeof index === 'number' && index >= 0) {
      this.history.versionActive = index;
    }
  }

  /**
   * 懒加载版本二进制 → 注入到内存版本对象里
   * @param {number} index
   * @param {Function} loadFn — (lineageId, versionIndex) => Promise<BinaryEntry|undefined>
   */
  async hydrateVersion(index, loadFn, lineageId) {
    const v = this.versions[index];
    if (!v) return false;
    // 已水合
    if (v._hydrated) return true;
    const bin = await loadFn(lineageId, index);
    if (!bin) return false;
    v.dataUrl   = bin.dataUrl   || '';
    v.svg       = bin.svg       || '';
    v.thumbnail = bin.thumbnail || '';
    v._hydrated = true;
    return true;
  }
}