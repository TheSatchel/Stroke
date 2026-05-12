/**
 * Toast.js — 全局错误/警告提示系统
 *
 * 在屏幕左下角以浮动气泡形式展示错误、警告信息。
 * 颜色基于主题 warning 色，自动适配深色/浅色模式。
 * 点击或超时自动消失。
 *
 * 使用方式：
 *   import { showToast, showWarningToast } from '../components/Toast.js';
 *   showToast('网络请求失败');
 *   showWarningToast('SVG 转码失败，已使用原始数据');
 */

let _container = null;
let _toastId = 0;
const MAX_VISIBLE = 5;

function getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.className = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-label', '通知消息');
    document.body.appendChild(_container);
  }
  return _container;
}

/**
 * 显示一条通知
 * @param {string}  message   - 消息正文
 * @param {'error'|'warning'} [type='error'] - 类型
 * @param {number}  [duration=8000] - 自动消失毫秒数，0 表示不自动消失
 * @returns {HTMLElement} 创建的 toast DOM 元素
 */
export function showToast(message, type = 'error', duration = 8000) {
  const container = getContainer();
  const id = ++_toastId;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-item--${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;

  // 点击关闭
  toast.addEventListener('click', () => dismiss(toast));

  container.appendChild(toast);

  // 触发入场动画（下一帧添加 visible 类）
  requestAnimationFrame(() => {
    toast.classList.add('toast-item--visible');
  });

  // 超出上限时移除最早的一条
  const items = container.querySelectorAll('.toast-item');
  if (items.length > MAX_VISIBLE) {
    dismiss(items[0]);
  }

  // 自动消失
  if (duration > 0) {
    toast._timer = setTimeout(() => dismiss(toast), duration);
  }

  return toast;
}

/**
 * 显示一条警告（便捷方法）
 * @param {string} message
 * @param {number} [duration=6000]
 */
export function showWarningToast(message, duration = 6000) {
  return showToast(message, 'warning', duration);
}

export function dismissToast(toast) {
  dismiss(toast);
}

function dismiss(toast) {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  if (toast._timer) clearTimeout(toast._timer);
  toast.classList.remove('toast-item--visible');
  toast.addEventListener('transitionend', () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, { once: true });
  // 兜底：800ms 后强制移除
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 800);
}

// ================================================================
//  全局未捕获异常监听
// ================================================================

let _globalHandlersInstalled = false;

export function installGlobalErrorHandlers() {
  if (_globalHandlersInstalled) return;
  _globalHandlersInstalled = true;

  // 同步抛出的未捕获异常
  window.addEventListener('error', (event) => {
    const msg = event.error
      ? (event.error.message || String(event.error))
      : (event.message || '未知运行时错误');
    // 忽略来自外部脚本（如浏览器扩展）的错误
    if (event.filename && event.filename.startsWith('chrome-extension://')) return;
    showToast('未捕获错误: ' + msg, 'error', 12000);
  });

  // 异步 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? reason.message
      : (typeof reason === 'string' ? reason : '未处理的 Promise 拒绝');
    showToast('异步错误: ' + msg, 'error', 12000);
  });
}