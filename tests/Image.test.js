import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMockImage = (shouldFail) => {
  const img = {};
  Object.defineProperties(img, {
    _src: { value: '', writable: true },
    src: {
      set(value) {
        img._src = value;
        if (shouldFail) {
          if (img.onerror) img.onerror(new Error('load error'));
        } else {
          img.naturalWidth = 1;
          img.naturalHeight = 1;
          img.width = 1;
          img.height = 1;
          if (img.onload) img.onload();
        }
      },
      get() { return img._src; }
    },
    naturalWidth: { value: 0, writable: true },
    naturalHeight: { value: 0, writable: true },
    width: { value: 0, writable: true },
    height: { value: 0, writable: true },
    onload: { value: null, writable: true },
    onerror: { value: null, writable: true }
  });
  return img;
};

beforeEach(() => {
  globalThis.Image = function () {
    return createMockImage(false);
  };

  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockjpegdata');
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { svgDataUrlToJpeg, convertSvgToJpegIfNeeded, createThumbnail } = await import('../static/js/utils/Image.js');

describe('svgDataUrlToJpeg', () => {
  it('should resolve with a data URL', async () => {
    const result = await svgDataUrlToJpeg('data:image/svg+xml,<svg></svg>');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^data:image\//);
  });

  it('should fallback on error', async () => {
    globalThis.Image = function () { return createMockImage(true); };
    const result = await svgDataUrlToJpeg('data:image/svg+xml,<svg></svg>');
    expect(result).toMatch(/^data:image\/svg\+xml/);
  });
});

describe('convertSvgToJpegIfNeeded', () => {
  it('should return non-SVG data URLs as-is', async () => {
    const result = await convertSvgToJpegIfNeeded('data:image/png;base64,abc123');
    expect(result).toBe('data:image/png;base64,abc123');
  });

  it('should convert SVG data URLs', async () => {
    const result = await convertSvgToJpegIfNeeded('data:image/svg+xml,<svg></svg>');
    expect(result).toMatch(/^data:image\//);
  });

  it('should return non-string values as-is', async () => {
    expect(await convertSvgToJpegIfNeeded(null)).toBeNull();
    expect(await convertSvgToJpegIfNeeded(undefined)).toBeUndefined();
  });
});

describe('createThumbnail', () => {
  it('should create a thumbnail JPEG', async () => {
    const result = await createThumbnail('data:image/png;base64,abc', 64);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should use default maxWidth of 128', async () => {
    const result = await createThumbnail('data:image/png;base64,abc');
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should fallback on error', async () => {
    globalThis.Image = function () { return createMockImage(true); };
    const result = await createThumbnail('invalid://url');
    expect(result).toBe('invalid://url');
  });
});
