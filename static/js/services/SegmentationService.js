/**
 * SegmentationService.js — AI 语义分割服务
 *
 * 单例模式。管理 Hugging Face Transformers.js 的 SegFormer B2 模型
 * 生命周期：WASM 检测 → 模型下载 → 推理 → 缓存管理。
 *
 * Transformers.js 内部使用浏览器 Cache API / IndexedDB 缓存模型文件，
 * 成功加载一次后刷新页面无需重新下载，验证缓存即可。
 *
 * Toast：下载/加载期间动态更新文字 + 超时自动消失。
 *
 * 状态机：DETECTING → IDLE/WASM_DISABLED → DOWNLOADING → READY/ERROR/TIMEOUT
 *
 * 使用方式：
 *   import SegmentationService from '../services/SegmentationService.js';
 *   const seg = SegmentationService.instance;
 *   await seg.load();
 *   const result = await seg.segmentAtPoint(dataUrl, x, y);
 */

let _instance = null;

const STATE = {
  DETECTING:     'DETECTING',
  WASM_DISABLED: 'WASM_DISABLED',
  IDLE:          'IDLE',
  DOWNLOADING:   'DOWNLOADING',
  READY:         'READY',
  ERROR:         'ERROR',
  TIMEOUT:       'TIMEOUT',
};

// localStorage key — 标记模型是否曾经成功加载过
const LS_MODEL_CACHED = 'stroke_seg_model_cached';

// 超时阈值（毫秒）
const CDN_IMPORT_TIMEOUT = 30000;        // CDN 拉 JS 库 30s
const MODEL_LOAD_TIMEOUT_CACHED = 20000; // 模型已在 IndexedDB 缓存 → 20s 验证
const MODEL_LOAD_TIMEOUT_FRESH = 300000; // 首次下载模型 49MB → 5min

export default class SegmentationService {
  constructor() {
    if (_instance) return _instance;
    _instance = this;

    this._state = STATE.DETECTING;
    this._wasmAvailable = false;
    this._pipeline = null;
    this._loadPromise = null;
    this._lastResults = null;
    this._lastImageDataUrl = null;
    this._wasmDisabledToastShown = false;
    this._progressToast = null;

    this._detectWasm();
  }

  // ================================================================
  //  单例访问
  // ================================================================
  static get instance() {
    if (!_instance) new SegmentationService();
    return _instance;
  }

  get state() { return this._state; }
  get wasmAvailable() { return this._wasmAvailable; }

  // ================================================================
  //  WASM 检测
  // ================================================================
  _detectWasm() {
    try {
      if (typeof WebAssembly === 'undefined') {
        this._wasmAvailable = false;
      } else {
        const mod = new WebAssembly.Module(
          Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
        );
        this._wasmAvailable = (mod instanceof WebAssembly.Module);
      }
    } catch (e) {
      this._wasmAvailable = false;
    }

    this._state = this._wasmAvailable ? STATE.IDLE : STATE.WASM_DISABLED;
  }

  // ================================================================
  //  模型加载（动态 Toast + 超时 + 重试）
  // ================================================================
  async load() {
    if (this._state === STATE.WASM_DISABLED) return false;
    if (this._state === STATE.READY) return true;

    // 正在下载 → 复用已有 Promise
    if (this._state === STATE.DOWNLOADING && this._loadPromise) {
      return this._loadPromise;
    }

    // 之前失败 / 超时 → 清理旧 Promise，允许重试
    if (this._state === STATE.ERROR || this._state === STATE.TIMEOUT) {
      this._loadPromise = null;
    }

    this._state = STATE.DOWNLOADING;
    this._loadPromise = this._doLoad();
    try {
      const ok = await this._loadPromise;
      return ok;
    } catch (_e) {
      return false;
    }
  }

  async _doLoad() {
    const { showToast, dismissToast } = await import('../utils/Toast.js');

    const wasCached = this._wasModelCached();
    const modelTimeout = wasCached ? MODEL_LOAD_TIMEOUT_CACHED : MODEL_LOAD_TIMEOUT_FRESH;

    try {
      // ====== 阶段 1: 加载 JS 库（CDN） ======
      this._updateProgressToast(showToast, '📦 正在加载 AI 分割引擎…');

      const module = await this._withTimeout(
        import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js'),
        CDN_IMPORT_TIMEOUT,
        'CDN 加载超时，请检查网络环境'
      );
      const { pipeline } = module;

      // ====== 阶段 2: 加载 / 验证模型 ======
      this._updateProgressToast(
        showToast,
        wasCached
          ? '🔍 正在验证本地缓存的 AI 分割模型…'
          : '⬇️ 正在下载 AI 分割模型（约 49MB），首次下载较慢…'
      );

      this._pipeline = await this._withTimeout(
        pipeline('image-segmentation', 'Xenova/segformer-b2-finetuned-ade-512-512'),
        modelTimeout,
        wasCached
          ? '模型验证超时，请刷新页面后重试'
          : '模型下载超时，请检查网络后刷新重试'
      );

      // ====== 成功 ======
      this._state = STATE.READY;
      this._markModelCached();
      this._dismissProgressToast(dismissToast);
      showToast('✅ AI 分割模型已就绪，点击图片即可自动识别区域', 'success', 5000);
      return true;

    } catch (err) {
      this._dismissProgressToast(dismissToast);

      const isTimeout = err?.message && err.message.includes('超时');
      this._state = isTimeout ? STATE.TIMEOUT : STATE.ERROR;
      this._loadPromise = null;

      console.error('[SegmentationService] 模型加载失败:', err);
      const detail = err?.message || '未知错误';
      showToast(`⚠️ AI 分割模型加载失败 — ${detail}`, 'error', 8000);
      return false;
    }
  }

  // ================================================================
  //  进度 Toast
  // ================================================================
  _updateProgressToast(showToast, message) {
    if (this._progressToast && this._progressToast.parentNode) {
      this._progressToast.textContent = message;
    } else {
      this._progressToast = showToast(message, 'warning', MODEL_LOAD_TIMEOUT_FRESH);
    }
  }

  _dismissProgressToast(dismissToast) {
    if (this._progressToast) {
      dismissToast(this._progressToast);
      this._progressToast = null;
    }
  }

  // ================================================================
  //  超时工具
  // ================================================================
  _withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message || '操作超时')), ms)
      ),
    ]);
  }

  // ================================================================
  //  localStorage 缓存标记
  //  模型文件本身由 Transformers.js 存入浏览器 Cache / IndexedDB；
  //  这里仅记录"曾成功加载过"的布尔标记。
  // ================================================================
  _wasModelCached() {
    try {
      return localStorage.getItem(LS_MODEL_CACHED) === '1';
    } catch (_e) {
      return false;
    }
  }

  _markModelCached() {
    try {
      localStorage.setItem(LS_MODEL_CACHED, '1');
    } catch (_e) { /* ignore */ }
  }

  // ================================================================
  //  推理
  // ================================================================
  async segmentAtPoint(imageDataUrl, clickX, clickY) {
    if (this._state !== STATE.READY) return null;

    const img = await this._dataUrlToImage(imageDataUrl);

    let results;
    if (imageDataUrl === this._lastImageDataUrl && this._lastResults) {
      results = this._lastResults;
    } else {
      results = await this._pipeline(img);
      this._lastResults = results;
      this._lastImageDataUrl = imageDataUrl;
    }

    const selected = this._findClassAtPoint(
      results, clickX, clickY,
      img.naturalWidth, img.naturalHeight
    );
    if (!selected) return null;

    const maskPoints = this._maskToContourPoints(selected.mask);

    return {
      maskPoints,
      classLabel: selected.label,
    };
  }

  // ================================================================
  //  辅助
  // ================================================================
  _dataUrlToImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  _findClassAtPoint(results, cx, cy, imgW, imgH) {
    if (!results || results.length === 0) return null;

    const maskW = results[0].mask.width;
    const maskH = results[0].mask.height;
    const px = Math.floor(cx / imgW * maskW);
    const py = Math.floor(cy / imgH * maskH);
    const idx = py * maskW + px;

    for (const res of results) {
      const maskData = res.mask.data;
      if (maskData[idx] > 128) {
        return res;
      }
    }
    return null;
  }

  _maskToContourPoints(mask) {
    const { width, height, data } = mask;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4] > 128) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  }

  clearCache() {
    this._lastResults = null;
    this._lastImageDataUrl = null;
  }
}
