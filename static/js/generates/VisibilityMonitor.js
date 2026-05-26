/**
 * VisibilityMonitor.js — visibilitychange 暂停/恢复
 *
 * 当标签页切换至后台时暂停管线，返回前台时恢复。
 */
export default class VisibilityMonitor {
  constructor() {
    /** @type {Function|null} 解绑 visibilitychange */
    this._unbind = null;

    /** @type {{ pause: function, resume: function }|null} 外部暂停/恢复回调 */
    this._target = null;
  }

  /**
   * 绑定目标对象（具备 pause/resume 方法）
   * @param {{ pause: function, resume: function }} target
   */
  setTarget(target) {
    this._target = target;
  }

  /**
   * 开始监听 visibilitychange
   */
  listen() {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        if (this._target) this._target.pause();
      } else if (document.visibilityState === 'visible') {
        if (this._target) this._target.resume();
      }
    };
    document.addEventListener('visibilitychange', handler);
    this._unbind = () => document.removeEventListener('visibilitychange', handler);
  }

  /**
   * 停止监听
   */
  unbind() {
    if (this._unbind) {
      this._unbind();
      this._unbind = null;
    }
  }
}
