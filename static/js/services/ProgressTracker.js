/**
 * ProgressTracker.js — 进度 Toast 管理
 *
 * 管理长时间运行操作的进度提示显示和关闭。
 */
export default class ProgressTracker {
  constructor() {
    /** @type {HTMLElement|null} */
    this._progressToast = null;

    /** @type {{ showToast: function, dismissToast: function }|null} */
    this._toastMod = null;
  }

  /**
   * 注入 Toast 模块引用
   * @param {{ showToast: function, dismissToast: function }} toastMod
   */
  setToastMod(toastMod) {
    this._toastMod = toastMod;
  }

  /**
   * 更新或创建进度 Toast
   * @param {string} message
   */
  update(message) {
    if (this._progressToast && this._progressToast.parentNode) {
      this._progressToast.textContent = message;
    } else if (this._toastMod) {
      this._progressToast = this._toastMod.showToast(message, 'warning', 300000);
    }
  }

  /**
   * 关闭进度 Toast
   */
  dismiss() {
    if (this._progressToast && this._toastMod?.dismissToast) {
      this._toastMod.dismissToast(this._progressToast);
    }
    this._progressToast = null;
  }
}
