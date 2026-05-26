/**
 * WakeLockManager.js — Wake Lock 获取/释放
 *
 * 防止屏幕休眠，确保长时间生成任务不被中断。
 */
export default class WakeLockManager {
  constructor() {
    /** @type {WakeLockSentinel|null} */
    this._wakeLock = null;
  }

  /**
   * 请求 Wake Lock
   */
  async acquire() {
    if ('wakeLock' in navigator) {
      try {
        this._wakeLock = await navigator.wakeLock.request('screen');
        console.log('[GenerationPipeline] Wake Lock 已激活');
        this._wakeLock.addEventListener('release', () => {
          console.log('[GenerationPipeline] Wake Lock 已释放');
        });
      } catch (e) {
        console.warn('[GenerationPipeline] Wake Lock 不可用:', e.message);
      }
    }
  }

  /**
   * 释放 Wake Lock
   */
  async release() {
    if (this._wakeLock) {
      try {
        await this._wakeLock.release();
      } catch (e) {
        // ignore
      }
      this._wakeLock = null;
    }
  }
}
