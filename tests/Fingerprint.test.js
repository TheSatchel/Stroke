import { describe, it, expect } from 'vitest';
import { simpleHash, computeConfigFingerprint } from '../static/js/utils/Fingerprint.js';

describe('simpleHash', () => {
  it('should return a hex string for empty input', () => {
    const h = simpleHash('');
    expect(typeof h).toBe('string');
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic', () => {
    expect(simpleHash('hello')).toBe(simpleHash('hello'));
  });

  it('should produce different hashes for different inputs', () => {
    expect(simpleHash('hello')).not.toBe(simpleHash('world'));
  });

  it('should handle unicode strings', () => {
    const h = simpleHash('中文测试');
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });

  it('should handle long strings', () => {
    const long = 'a'.repeat(10000);
    const h = simpleHash(long);
    expect(typeof h).toBe('string');
    expect(h.length).toBeLessThanOrEqual(8);
  });
});

describe('computeConfigFingerprint', () => {
  it('should produce stable JSON for simple values', () => {
    const fp = computeConfigFingerprint({ prompt: 'hello', size: 100 });
    expect(typeof fp).toBe('string');
    const parsed = JSON.parse(fp);
    expect(parsed.prompt).toBe('hello');
    expect(parsed.size).toBe(100);
  });

  it('should hash image data URLs', () => {
    const fp = computeConfigFingerprint({
      img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    });
    const parsed = JSON.parse(fp);
    expect(parsed.img).toMatch(/^img:[0-9a-f]+$/);
  });

  it('should generate the same fingerprint for same config', () => {
    const a = computeConfigFingerprint({ prompt: 'test', scale: 7 });
    const b = computeConfigFingerprint({ scale: 7, prompt: 'test' });
    expect(a).toBe(b);
  });

  it('should generate different fingerprints for different configs', () => {
    const a = computeConfigFingerprint({ prompt: 'hello' });
    const b = computeConfigFingerprint({ prompt: 'world' });
    expect(a).not.toBe(b);
  });
});
