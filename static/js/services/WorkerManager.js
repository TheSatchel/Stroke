/**
 * WorkerManager.js — Web Worker 生命周期管理
 *
 * 负责 Worker 创建、消息路由分发、异常处理。
 * 公开 resolve/reject 属性供外部挂载 load/segment 的 Promise 控制。
 */
export default class WorkerManager {
  constructor() {
    /** @type {Worker|null} */
    this._worker = null;

    /** @type {Function|null} 模型加载 Promise resolve */
    this.pendingResolve = null;

    /** @type {Function|null} 模型加载 Promise reject */
    this.pendingReject = null;

    /** @type {Function|null} 推理 Promise resolve */
    this.segmentResolve = null;

    /** @type {Function|null} 推理 Promise reject */
    this.segmentReject = null;

    /** @type {Object} 外部回调 */
    this._callbacks = {};
  }

  get worker() { return this._worker; }

  /**
   * 设置消息处理回调
   * @param {{ onProgress?: function, onReady?: function, onError?: function }} callbacks
   */
  setCallbacks(callbacks) {
    this._callbacks = callbacks;
  }

  /**
   * 确保 Worker 已创建
   */
  ensureWorker() {
    if (this._worker) return;
    this._worker = new Worker(
      new URL('./SegmentationWorker.js', import.meta.url),
      { type: 'module' }
    );
    this._worker.onmessage = (e) => this._onWorkerMessage(e.data);
    this._worker.onerror = (err) => {
      console.error('[SegmentationService] Worker error:', err);
      if (this.segmentReject) {
        this.segmentReject(new Error('Worker 异常'));
        this.segmentResolve = null;
        this.segmentReject = null;
      }
      if (this.pendingReject) {
        this.pendingReject(new Error('Worker 异常'));
        this.pendingResolve = null;
        this.pendingReject = null;
      }
    };
  }

  /**
   * Worker 消息路由
   */
  _onWorkerMessage(msg) {
    switch (msg.type) {
      case 'progress':
        if (this._callbacks.onProgress) this._callbacks.onProgress(msg.message);
        break;
      case 'ready':
        if (this._callbacks.onReady) this._callbacks.onReady();
        break;
      case 'result':
        if (this.segmentResolve) {
          this.segmentResolve(msg);
          this.segmentResolve = null;
          this.segmentReject = null;
        } else {
          console.warn('[SegmentationService] 收到 Worker 结果但无等待者');
        }
        break;
      case 'error':
        console.error('[SegmentationService]', msg.message);
        if (this.segmentReject) {
          this.segmentReject(new Error(msg.message));
          this.segmentResolve = null;
          this.segmentReject = null;
        } else if (this.pendingReject) {
          this.pendingReject(new Error(msg.message));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
        if (this._callbacks.onError) this._callbacks.onError(msg.message);
        break;
    }
  }
}
