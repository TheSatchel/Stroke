/**
 * RetryHandler.js — 重试判断 + 指数退避
 *
 * 导出可重试错误集、重试次数上限和退避工具函数。
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const RETRYABLE_ERRORS = [
  'AbortError',
  'NetworkError',
  'TimeoutError',
  'TypeError',
];

/**
 * 判断是否为可重试错误
 * @param {Error} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (!err) return false;
  if (err.name && RETRYABLE_ERRORS.includes(err.name)) return true;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('abort') || msg.includes('timeout')) return true;
  if (err.status === 503 || (err.message && err.message.includes('503'))) return true;
  return false;
}

/**
 * 指数退避延迟
 * @param {number} attempt - 第几次重试 (1-based)
 * @returns {Promise<void>}
 */
function backoffDelay(attempt) {
  const ms = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { MAX_RETRIES, BASE_DELAY_MS, RETRYABLE_ERRORS, isRetryable, backoffDelay };
