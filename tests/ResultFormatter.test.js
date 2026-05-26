import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  globalThis.Image = function () {
    const img = {};
    Object.defineProperties(img, {
      src: {
        set(value) {
          img._src = value;
          img.naturalWidth = 10;
          img.naturalHeight = 10;
          img.width = 10;
          img.height = 10;
          if (img.onload) img.onload();
        },
        get() { return img._src; }
      },
      _src: { value: '', writable: true },
      naturalWidth: { value: 0, writable: true },
      naturalHeight: { value: 0, writable: true },
      width: { value: 0, writable: true },
      height: { value: 0, writable: true },
      onload: { value: null, writable: true },
      onerror: { value: null, writable: true }
    });
    return img;
  };

  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockthumb');
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { formatResult } = await import('../static/js/generates/ResultFormatter.js');

describe('formatResult', () => {
  it('should format SVG result with base64 and thumbnail', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
    const result = await formatResult({ type: 'svg', svg }, 'call_tab_1');
    expect(result.callTabId).toBe('call_tab_1');
    expect(result.type).toBe('svg');
    expect(result.svg).toBe(svg);
    expect(result.base64).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(typeof result.thumbnail).toBe('string');
  });

  it('should format raster result', async () => {
    const result = await formatResult({ type: 'raster', dataUrl: 'data:image/png;base64,abc' }, 'call_raster');
    expect(result.callTabId).toBe('call_raster');
    expect(result.type).toBe('raster');
    expect(result.dataUrl).toContain('data:image/png;base64');
    expect(result.base64).toContain('data:image/png;base64');
    expect(result.svg).toBe('');
  });

  it('should handle missing type (default svg)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="5"/></svg>';
    const result = await formatResult({ svg }, 'default_call');
    expect(result.type).toBe('svg');
    expect(result.dataUrl).toBe('');
  });

  it('should handle empty svg', async () => {
    const result = await formatResult({ type: 'svg', svg: '' }, 'empty');
    expect(result.svg).toBe('');
    expect(result.base64).toMatch(/^data:image\/svg\+xml;base64/);
  });

  it('should handle empty dataUrl for raster', async () => {
    const result = await formatResult({ type: 'raster', dataUrl: '' }, 'empty_raster');
    expect(result.dataUrl).toBe('');
    expect(result.base64).toBe('');
  });
});
