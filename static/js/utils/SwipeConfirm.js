/**
 * SwipeConfirm.js — 移动端滑动确认组件
 * 
 * 用法:
 *   new SwipeConfirm(container, {
 *     label: '删除全部历史',
 *     hint: '此操作不可撤销',
 *     danger: true,
 *     onConfirm: () => { ... }
 *   });
 */

import { el } from './DOM.js';

const THRESHOLD = 0.70; // 滑块需拖动到 70% 位置才触发
const SNAP_DURATION = 280; // 回弹动画时长 ms

export default class SwipeConfirm {
  /**
   * @param {HTMLElement} container - 父容器，会将组件 append 到其中
   * @param {object} opts
   * @param {string} opts.label - 操作名称（如 "删除全部历史"）
   * @param {string} [opts.hint] - 底部提示文字
   * @param {boolean} [opts.danger] - 是否为危险操作（影响配色）
   * @param {() => void} opts.onConfirm - 确认回调
   */
  constructor(container, opts) {
    this.opts = opts;
    this.confirmed = false;
    this.trackWidth = 0;
    this.startX = 0;
    this.currentX = 0;
    this.dragging = false;

    this._build(container);
    this._bindEvents();
  }

  _build(container) {
    const { label, hint, danger } = this.opts;
    const wrapper = el('div', 'swipe-confirm-wrapper');

    // 轨道
    this.track = el('div', `swipe-confirm-track${danger ? ' swipe-confirm-track--danger' : ''}`);
    this.track.innerHTML = `<span class="swipe-confirm-text">滑动确认${label}</span>`;

    // 滑块/把手
    this.handle = el('div', 'swipe-confirm-handle');
    this.handle.innerHTML = '<span class="swipe-confirm-arrow">&gt;&gt;</span>';

    this.track.appendChild(this.handle);
    wrapper.appendChild(this.track);

    if (hint) {
      const hintEl = el('div', 'sm-danger-hint', { text: hint });
      wrapper.appendChild(hintEl);
    }

    container.appendChild(wrapper);
    this.wrapper = wrapper;
  }

  _bindEvents() {
    this.track.addEventListener('touchstart', this._onStart, { passive: false });
    this.track.addEventListener('mousedown', this._onStart);

    this.track.addEventListener('touchmove', this._onMove, { passive: false });
    this.track.addEventListener('mousemove', this._onMove);

    document.addEventListener('touchend', this._onEnd);
    document.addEventListener('mouseup', this._onEnd);
  }

  _getClientX(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return e.clientX;
  }

  _onStart = (e) => {
    if (this.confirmed) return;
    if (e.type === 'mousedown' && e.which !== 1) return;
    this.dragging = true;
    const trackRect = this.track.getBoundingClientRect();
    this.trackWidth = trackRect.width;
    this.handleWidth = this.handle.clientWidth;
    this.startX = this._getClientX(e) - this.handle.offsetLeft;
    this.handle.style.transition = 'none';
  };

  _onMove = (e) => {
    if (!this.dragging) return;
    e.preventDefault();
    this.currentX = this._getClientX(e) - this.startX;
    const maxX = this.trackWidth - this.handleWidth;
    const clamped = Math.max(0, Math.min(maxX, this.currentX));
    this.handle.style.transform = `translateX(${clamped}px)`;

    const progress = clamped / maxX;
    this.track.style.setProperty('--swipe-progress', progress);
  };

  _onEnd = (e) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.handle.style.transition = `transform ${SNAP_DURATION}ms ease-out`;

    const maxX = this.trackWidth - this.handleWidth;
    const progress = this.currentX / maxX;

    if (progress >= THRESHOLD) {
      this.confirmed = true;
      this.handle.style.transform = `translateX(${maxX}px)`;
      this.track.style.setProperty('--swipe-progress', 1);

      setTimeout(() => { if (this.opts.onConfirm) this.opts.onConfirm(); }, SNAP_DURATION + 50);
    } else {
      this.handle.style.transform = 'translateX(0)';
      this.track.style.setProperty('--swipe-progress', 0);
    }
  };

  /** 销毁组件，移除事件监听 */
  destroy() {
    this.track.removeEventListener('touchmove', this._onMove);
    this.track.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
    document.removeEventListener('mouseup', this._onEnd);
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }
}
