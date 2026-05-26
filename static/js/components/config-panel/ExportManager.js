/**
 * ExportManager.js — 导出下载逻辑
 *
 * 从 IndexedDB 或 widget 缓存取结果，触发浏览器下载。
 */
import { showToast } from '../../utils/Toast.js';
import { loadVersionBinary } from '../../locals/StorageManager.js';

export default class ExportManager {
  constructor() {
    this._lineageId = null;
    this._versionIndex = 0;
  }

  /**
   * 设置下载来源
   * @param {string|null} lineageId
   * @param {number} versionIndex
   */
  setSource(lineageId, versionIndex) {
    this._lineageId = lineageId;
    this._versionIndex = versionIndex;
  }

  /**
   * 执行下载
   * @param {Object<string, {widget, def}>} widgets - ConfigPanel 的 widgets 映射
   */
  async download(widgets) {
    let dataUrl = '';
    let svgRaw = '';

    if (this._lineageId) {
      try {
        const bin = await loadVersionBinary(this._lineageId, this._versionIndex);
        if (bin) {
          dataUrl = bin.dataUrl || '';
          svgRaw = bin.svg || '';
        }
      } catch (e) {
        console.warn('[ConfigPanel] 从 IndexedDB 加载下载源失败:', e);
      }
    }

    if (!dataUrl && !svgRaw) {
      const genCalls = Object.entries(widgets)
        .filter(([_, entry]) => entry.def.type === 'generate_call')
        .sort((a, b) => (a[1].def.order || 0) - (b[1].def.order || 0));

      const last = genCalls[genCalls.length - 1];
      if (!last) {
        showToast('没有可导出的结果', 'warning');
        return;
      }

      const widget = last[1].widget;
      dataUrl = widget._resultBase64 || (typeof widget.getResultBase64 === 'function' ? widget.getResultBase64() : '');
      svgRaw = widget._svgOutput || (typeof widget.getSvgOutput === 'function' ? widget.getSvgOutput() : '');
    }

    if (!dataUrl && !svgRaw) {
      showToast('没有可下载的图片数据', 'warning');
      return;
    }

    let ext = 'png';
    let downloadUrl;
    let needsRevoke = false;

    if (svgRaw) {
      ext = 'svg';
      const blob = new Blob([svgRaw], { type: 'image/svg+xml' });
      downloadUrl = URL.createObjectURL(blob);
      needsRevoke = true;
    } else if (dataUrl) {
      downloadUrl = dataUrl;
      if (dataUrl.startsWith('data:image/svg+xml')) ext = 'svg';
      else if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) ext = 'jpg';
      else if (dataUrl.startsWith('data:image/webp')) ext = 'webp';
      else if (dataUrl.startsWith('data:image/png')) ext = 'png';
    } else {
      showToast('没有可下载的图片数据', 'warning');
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `generated_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (needsRevoke) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
    }

    showToast(`图片已导出为 ${a.download}`, 'success', 3000);
  }
}
