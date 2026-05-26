/**
 * SegmentationService.js — AI 语义分割服务（单例协调器）
 *
 * 状态机：DETECTING → IDLE/WASM_DISABLED → DOWNLOADING → READY/ERROR/TIMEOUT
 *
 * 使用方式：
 *   import SegmentationService from '../services/SegmentationService.js';
 *   const seg = SegmentationService.instance;
 *   await seg.load();
 *   const result = await seg.segmentAtPoint(dataUrl, x, y);
 */
import { detectWasm } from './WasmDetector.js';
import WorkerManager from './WorkerManager.js';
import { findClassAtPoint, maskToContour } from './MaskProcessor.js';
import ProgressTracker from './ProgressTracker.js';

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

const LS_MODEL_CACHED = 'stroke_seg_model_cached';

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
    this._useWorker = true;

    this._workerManager = new WorkerManager();
    this._progressTracker = new ProgressTracker();

    this._initWasm();
  }

  static get instance() {
    if (!_instance) new SegmentationService();
    return _instance;
  }

  get state() { return this._state; }
  get wasmAvailable() { return this._wasmAvailable; }

  // ================================================================
  //  WASM 检测
  // ================================================================
  _initWasm() {
    const result = detectWasm();
    this._wasmAvailable = result.available;
    this._state = result.state;
  }

  // ================================================================
  //  模型加载
  // ================================================================
  async load() {
    if (this._state === STATE.WASM_DISABLED) return false;
    if (this._state === STATE.READY) return true;
    if (this._state === STATE.DOWNLOADING && this._loadPromise) {
      return this._loadPromise;
    }
    if (this._state === STATE.ERROR || this._state === STATE.TIMEOUT) {
      this._loadPromise = null;
    }

    this._state = STATE.DOWNLOADING;

    const { showToast, dismissToast } = await import('../utils/Toast.js');
    this._progressTracker.setToastMod({ showToast, dismissToast });

    this._workerManager.ensureWorker();
    this._workerManager.setCallbacks({
      onProgress: (msg) => this._progressTracker.update(msg),
      onReady: () => {
        this._state = STATE.READY;
        this._markModelCached();
        this._progressTracker.dismiss();
        showToast('✅ AI 分割模型已就绪，点击图片即可自动识别区域', 'success', 5000);
        if (this._workerManager.pendingResolve) {
          this._workerManager.pendingResolve(true);
          this._workerManager.pendingResolve = null;
          this._workerManager.pendingReject = null;
        }
      },
      onError: (msg) => {
        console.error('[SegmentationService]', msg);
      }
    });

    this._progressTracker.update('📦 正在启动 AI 分割引擎…');

    this._loadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._workerManager.pendingReject) {
          this._workerManager.pendingReject(new Error('模型加载超时'));
          this._workerManager.pendingResolve = null;
          this._workerManager.pendingReject = null;
        }
        this._state = STATE.TIMEOUT;
        this._progressTracker.dismiss();
        showToast('⚠️ AI 分割模型加载超时，请刷新页面后重试', 'error', 8000);
        this._loadPromise = null;
      }, 300000);

      this._workerManager.pendingResolve = (ok) => {
        clearTimeout(timeout);
        resolve(ok);
      };
      this._workerManager.pendingReject = (err) => {
        clearTimeout(timeout);
        this._state = STATE.ERROR;
        this._progressTracker.dismiss();
        showToast(`⚠️ AI 分割模型加载失败 — ${err.message}`, 'error', 8000);
        this._loadPromise = null;
        reject(err);
      };

      this._workerManager.worker.postMessage({ type: 'load' });
    });

    try {
      return await this._loadPromise;
    } catch (_e) {
      return false;
    }
  }

  // ================================================================
  //  推理
  // ================================================================
  async segmentAtPoint(imageDataUrl, clickX, clickY) {
    if (this._state !== STATE.READY) return null;

    if (this._useWorker && this._workerManager.worker) {
      try {
        return await this._segmentViaWorker(imageDataUrl, clickX, clickY);
      } catch (e) {
        console.warn('[SegmentationService] Worker 推理失败，回退到主线程:', e.message);
        this._useWorker = false;
      }
    }

    return this._segmentInline(imageDataUrl, clickX, clickY);
  }

  async _segmentViaWorker(imageDataUrl, clickX, clickY) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._workerManager.segmentResolve = null;
        this._workerManager.segmentReject = null;
        reject(new Error('Worker 推理超时'));
      }, 30000);

      this._workerManager.segmentResolve = (msg) => {
        clearTimeout(timeout);
        resolve(msg.maskPoints && msg.maskPoints.length > 0 ? {
          maskPoints: msg.maskPoints,
          classLabel: msg.classLabel,
          maskWidth: msg.maskWidth,
          maskHeight: msg.maskHeight,
        } : null);
      };
      this._workerManager.segmentReject = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      const img = new Image();
      img.onload = () => {
        this._workerManager.worker.postMessage({
          type: 'segment',
          imageDataUrl, clickX, clickY,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      };
      img.onerror = () => {
        clearTimeout(timeout);
        this._workerManager.segmentResolve = null;
        this._workerManager.segmentReject = null;
        resolve(null);
      };
      img.src = imageDataUrl;
    });
  }

  async _segmentInline(imageDataUrl, clickX, clickY) {
    if (!this._pipeline) {
      console.log('[SegmentationService] 主线程加载模型…');
      const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js');
      this._pipeline = await mod.pipeline('image-segmentation', 'Xenova/segformer-b2-finetuned-ade-512-512');
    }

    let results;
    if (imageDataUrl === this._lastImageDataUrl && this._lastResults) {
      results = this._lastResults;
    } else {
      results = await this._pipeline(imageDataUrl);
      this._lastResults = results;
      this._lastImageDataUrl = imageDataUrl;
    }

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = imageDataUrl;
    });

    const found = findClassAtPoint(results, clickX, clickY, img.naturalWidth, img.naturalHeight);
    if (!found) return null;

    const maskPoints = maskToContour(found.res.mask, found.px, found.py);
    return {
      maskPoints,
      classLabel: found.res.label,
      maskWidth: found.res.mask.width,
      maskHeight: found.res.mask.height,
    };
  }

  // ================================================================
  //  localStorage 缓存标记
  // ================================================================
  _wasModelCached() {
    try { return localStorage.getItem(LS_MODEL_CACHED) === '1'; }
    catch (_e) { return false; }
  }

  _markModelCached() {
    try { localStorage.setItem(LS_MODEL_CACHED, '1'); }
    catch (_e) { /* ignore */ }
  }

  clearCache() {
    this._lastResults = null;
    this._lastImageDataUrl = null;
    if (this._workerManager.worker) {
      this._workerManager.worker.postMessage({ type: 'clear' });
    }
  }
}
