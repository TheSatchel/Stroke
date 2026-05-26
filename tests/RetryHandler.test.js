import { describe, it, expect, vi } from 'vitest';
import { isRetryable, backoffDelay, MAX_RETRIES, BASE_DELAY_MS } from '../static/js/generates/RetryHandler.js';

describe('isRetryable', () => {
  it('should return false for null/undefined', () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });

  it('should recognise known error names', () => {
    expect(isRetryable({ name: 'AbortError' })).toBe(true);
    expect(isRetryable({ name: 'NetworkError' })).toBe(true);
    expect(isRetryable({ name: 'TimeoutError' })).toBe(true);
    expect(isRetryable({ name: 'TypeError' })).toBe(true);
  });

  it('should recognise error message keywords', () => {
    expect(isRetryable({ name: 'Error', message: 'Failed to fetch' })).toBe(true);
    expect(isRetryable({ name: 'Error', message: 'Network error occurred' })).toBe(true);
    expect(isRetryable({ name: 'Error', message: 'Request was aborted' })).toBe(true);
    expect(isRetryable({ name: 'Error', message: 'Connection timeout' })).toBe(true);
  });

  it('should recognise HTTP 503 status', () => {
    expect(isRetryable({ name: 'Error', status: 503 })).toBe(true);
    expect(isRetryable({ name: 'Error', message: 'Server returned 503' })).toBe(true);
  });

  it('should return false for unrecoverable errors', () => {
    expect(isRetryable({ name: 'SyntaxError', message: 'Invalid JSON' })).toBe(false);
    expect(isRetryable({ name: 'Error', message: 'Unauthorized' })).toBe(false);
    expect(isRetryable({ name: 'Error', status: 401 })).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('should multiply by powers of 2', async () => {
    vi.useFakeTimers();
    const p1 = backoffDelay(1);
    const p2 = backoffDelay(2);
    const p3 = backoffDelay(3);

    // advance past 2s
    vi.advanceTimersByTime(1999);
    expect(vi.getTimerCount()).toBeGreaterThan(0); // p1 not yet done

    vi.advanceTimersByTime(1);
    await p1; // p1 resolves at 2s

    // p2 resolves at 4s
    vi.advanceTimersByTime(2000);
    await p2;

    // p3 resolves at 8s
    vi.advanceTimersByTime(4000);
    await p3;

    vi.useRealTimers();
  });

  it('should use BASE_DELAY_MS as base', async () => {
    vi.useFakeTimers();
    const p = backoffDelay(1);
    vi.advanceTimersByTime(BASE_DELAY_MS);
    await p;
    vi.useRealTimers();
  });
});

describe('constants', () => {
  it('MAX_RETRIES should be 3', () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it('BASE_DELAY_MS should be 2000', () => {
    expect(BASE_DELAY_MS).toBe(2000);
  });
});
