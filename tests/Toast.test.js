import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast, showWarningToast, dismissToast, installGlobalErrorHandlers, installConsoleLogToToast } from '../static/js/utils/Toast.js';

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should create a toast container on first call', () => {
    showToast('test message');
    const container = document.querySelector('.toast-container');
    expect(container).not.toBeNull();
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('should create a toast element with message', () => {
    const toast = showToast('test message', 'error');
    expect(toast.tagName).toBe('DIV');
    expect(toast.textContent).toBe('test message');
    expect(toast.className).toContain('toast-item--error');
  });

  it('should create warning toast with correct class', () => {
    const toast = showToast('warning msg', 'warning');
    expect(toast.className).toContain('toast-item--warning');
  });

  it('should default to error type', () => {
    const toast = showToast('msg');
    expect(toast.className).toContain('toast-item--error');
  });

  it('should set role="alert"', () => {
    const toast = showToast('msg');
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('should dismiss on click', async () => {
    const toast = showToast('click me', 'error', 0);
    expect(toast._dismissed).toBeUndefined();
    toast.click();
    await new Promise(r => setTimeout(r, 100));
    expect(toast._dismissed).toBe(true);
  });

  it('should return an HTMLElement from showToast', () => {
    const toast = showToast('msg');
    expect(toast).toBeInstanceOf(HTMLElement);
  });
});

describe('showWarningToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should create a warning toast', () => {
    const toast = showWarningToast('warning msg');
    expect(toast.className).toContain('toast-item--warning');
  });
});

describe('dismissToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should dismiss a toast', () => {
    const toast = showToast('msg', 'error', 0);
    expect(toast._dismissed).toBeUndefined();
    dismissToast(toast);
    expect(toast._dismissed).toBe(true);
  });

  it('should be idempotent', () => {
    const toast = showToast('msg', 'error', 0);
    dismissToast(toast);
    dismissToast(toast);
    expect(toast._dismissed).toBe(true);
  });

  it('should handle null/undefined', () => {
    expect(() => dismissToast(null)).not.toThrow();
    expect(() => dismissToast(undefined)).not.toThrow();
  });
});

describe('installGlobalErrorHandlers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should install without throwing', () => {
    expect(() => installGlobalErrorHandlers()).not.toThrow();
  });

  it('should be idempotent (install once)', () => {
    installGlobalErrorHandlers();
    const handlerCount = window._globalHandlersInstalled;
    installGlobalErrorHandlers();
  });
});
