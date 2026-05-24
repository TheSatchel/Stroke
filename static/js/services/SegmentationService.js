/**
 * SegmentationService.js — AI 语义分割服务
 *
 * 单例模式。通过 Web Worker 运行 Hugging Face Transformers.js 的 SegFormer B2 模型，
 * 避免 WASM 推理阻塞主线程 UI。
 *
 * 生命周期：WASM 检测 → Worker 创建 → 模型下载 → 推理 → 缓存管理。
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

const LS_MODEL_CACHED = 'stroke_seg_model_cached';

export default class SegmentationService {
  constructor() {
    if (_instance) return _instance;
    _instance = this;

    this._state = STATE.DETECTING;
    this._wasmAvailable = false;
    this._worker = null;
    this._pipeline = null;
    this._loadPromise = null;
    this._lastResults = null;
    this._lastImageDataUrl = null;
    this._wasmDisabledToastShown = false;
    this._progressToast = null;
    this._pendingResolve = null;
    this._pendingReject = null;
    this._segmentResolve = null;
    this._segmentReject = null;
    this._useWorker = true;

    this._detectWasm();
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
  //  Worker 管理
  // ================================================================
  _ensureWorker() {
    if (this._worker) return;
    this._worker = new Worker(
      new URL('./SegmentationWorker.js', import.meta.url),
      { type: 'module' }
    );
    this._worker.onmessage = (e) => this._onWorkerMessage(e.data);
    this._worker.onerror = (err) => {
      console.error('[SegmentationService] Worker error:', err);
      if (this._segmentReject) {
        this._segmentReject(new Error('Worker 异常'));
        this._segmentResolve = null;
        this._segmentReject = null;
      }
      if (this._pendingReject) {
        this._pendingReject(new Error('Worker 异常'));
        this._pendingResolve = null;
        this._pendingReject = null;
      }
    };
  }

  _onWorkerMessage(msg) {
    switch (msg.type) {
      case 'progress':
        this._updateProgressToast(msg.message);
        break;
      case 'ready':
        this._state = STATE.READY;
        this._markModelCached();
        this._dismissProgressToast();
        this._toastMod?.showToast('✅ AI 分割模型已就绪，点击图片即可自动识别区域', 'success', 5000);
        if (this._pendingResolve) {
          this._pendingResolve(true);
          this._pendingResolve = null;
          this._pendingReject = null;
        }
        break;
      case 'result':
        if (this._segmentResolve) {
          this._segmentResolve(msg);
          this._segmentResolve = null;
          this._segmentReject = null;
        } else {
          console.warn('[SegmentationService] 收到 Worker 结果但无等待者');
        }
        break;
      case 'error':
        console.error('[SegmentationService]', msg.message);
        if (this._segmentReject) {
          this._segmentReject(new Error(msg.message));
          this._segmentResolve = null;
          this._segmentReject = null;
        } else if (this._pendingReject) {
          this._pendingReject(new Error(msg.message));
          this._pendingResolve = null;
          this._pendingReject = null;
        }
        break;
    }
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

    // 先导入 Toast（在 Worker 可发消息前完成），避免 race
    const { showToast, dismissToast } = await import('../utils/Toast.js');
    this._toastMod = { showToast, dismissToast };
    this._ensureWorker();
    this._updateProgressToast('📦 正在启动 AI 分割引擎…');

    this._loadPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._pendingReject) {
          this._pendingReject(new Error('模型加载超时'));
          this._pendingResolve = null;
          this._pendingReject = null;
        }
        this._state = STATE.TIMEOUT;
        this._dismissProgressToast();
        showToast('⚠️ AI 分割模型加载超时，请刷新页面后重试', 'error', 8000);
        this._loadPromise = null;
      }, 300000);

      this._pendingResolve = (ok) => {
        clearTimeout(timeout);
        resolve(ok);
      };
      this._pendingReject = (err) => {
        clearTimeout(timeout);
        this._state = STATE.ERROR;
        this._dismissProgressToast();
        showToast(`⚠️ AI 分割模型加载失败 — ${err.message}`, 'error', 8000);
        this._loadPromise = null;
        reject(err);
      };

      this._worker.postMessage({ type: 'load' });
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

    // Worker 优先
    if (this._useWorker && this._worker) {
      try {
        return await this._segmentViaWorker(imageDataUrl, clickX, clickY);
      } catch (e) {
        console.warn('[SegmentationService] Worker 推理失败，回退到主线程:', e.message);
        this._useWorker = false;
      }
    }

    // 回退：主线程 inline 推理
    return this._segmentInline(imageDataUrl, clickX, clickY);
  }

  async _segmentViaWorker(imageDataUrl, clickX, clickY) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._segmentResolve = null;
        this._segmentReject = null;
        reject(new Error('Worker 推理超时'));
      }, 30000);

      this._segmentResolve = (msg) => {
        clearTimeout(timeout);
        resolve(msg.maskPoints && msg.maskPoints.length > 0 ? {
          maskPoints: msg.maskPoints,
          classLabel: msg.classLabel,
          maskWidth: msg.maskWidth,
          maskHeight: msg.maskHeight,
        } : null);
      };
      this._segmentReject = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      const img = new Image();
      img.onload = () => {
        this._worker.postMessage({
          type: 'segment',
          imageDataUrl, clickX, clickY,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      };
      img.onerror = () => {
        clearTimeout(timeout);
        this._segmentResolve = null;
        this._segmentReject = null;
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

    const found = this._findClassAtPoint(results, clickX, clickY, img.naturalWidth, img.naturalHeight);
    if (!found) return null;

    const maskPoints = this._maskToContour(found.res.mask, found.px, found.py);
    return {
      maskPoints,
      classLabel: found.res.label,
      maskWidth: found.res.mask.width,
      maskHeight: found.res.mask.height,
    };
  }

  _findClassAtPoint(results, cx, cy, imgW, imgH) {
    if (!results || results.length === 0) return null;
    const maskW = results[0].mask.width;
    const maskH = results[0].mask.height;
    const px = Math.floor(cx / imgW * maskW);
    const py = Math.floor(cy / imgH * maskH);
    const idx = py * maskW + px;
    for (const res of results) {
      if (res.mask.data[idx] > 128) return { res, px, py };
    }
    return null;
  }

  _maskToContour(mask, seedX, seedY) {
    const { width, height, data } = mask;
    if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return [];

    const visited = new Uint8Array(width * height);
    const queue = [{ x: seedX, y: seedY }];
    visited[seedY * width + seedX] = 1;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let head = 0;

    while (head < queue.length) {
      const { x, y } = queue[head++];
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;

      const n4 = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for (const [nx, ny] of n4) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (!visited[ni] && data[ni] > 128) {
          visited[ni] = 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }

    const pixelCount = queue.length;
    if (pixelCount === 0) return [];

    const areaRatio = pixelCount / (width * height);
    if (areaRatio >= 0.25) {
      const margin = 32;
      const rminX = Math.max(0, seedX - margin);
      const rminY = Math.max(0, seedY - margin);
      const rmaxX = Math.min(width - 1, seedX + margin);
      const rmaxY = Math.min(height - 1, seedY + margin);
      return [
        { x: rminX, y: rminY }, { x: rmaxX, y: rminY },
        { x: rmaxX, y: rmaxY }, { x: rminX, y: rmaxY },
      ];
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const numSteps = 72;
    const points = [];
    for (let i = 0; i < numSteps; i++) {
      const angle = (i / numSteps) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let bestD = 0, bestX = cx, bestY = cy;
      const maxR = Math.max(width, height);
      for (let r = 0; r < maxR; r++) {
        const sx = Math.round(cx + dx * r);
        const sy = Math.round(cy + dy * r);
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) break;
        if (visited[sy * width + sx]) { bestD = r; bestX = sx; bestY = sy; }
      }
      if (bestD > 0) points.push({ x: bestX, y: bestY });
    }
    return points;
  }

  // ================================================================
  //  进度 Toast
  // ================================================================
  _updateProgressToast(message) {
    if (this._progressToast && this._progressToast.parentNode) {
      this._progressToast.textContent = message;
    } else {
      this._progressToast = this._toastMod.showToast(message, 'warning', 300000);
    }
  }

  _dismissProgressToast() {
    if (this._progressToast && this._toastMod?.dismissToast) {
      this._toastMod.dismissToast(this._progressToast);
    }
    this._progressToast = null;
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
    if (this._worker) {
      this._worker.postMessage({ type: 'clear' });
    }
  }
}
