import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanResponse,
  cleanResponseToImage,
  isValidSvg,
  isValidRasterDataUrl,
  svgToBase64DataUrl
} from '../static/js/adapters/ResponseParser.js';

vi.mock('../static/js/utils/Toast.js', () => ({
  showToast: vi.fn(),
  showWarningToast: vi.fn()
}));

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
const MINIMAL_SVG = '<svg><circle r="50"/></svg>';

describe('isValidSvg', () => {
  it('should return false for empty or non-string', () => {
    expect(isValidSvg('')).toBe(false);
    expect(isValidSvg(null)).toBe(false);
    expect(isValidSvg(undefined)).toBe(false);
    expect(isValidSvg(123)).toBe(false);
  });

  it('should return true for valid SVG with open and close tags', () => {
    expect(isValidSvg(VALID_SVG)).toBe(true);
    expect(isValidSvg(MINIMAL_SVG)).toBe(true);
  });

  it('should handle SVG fragments inside HTML', () => {
    const html = '<!DOCTYPE html><html><body>' + VALID_SVG + '</body></html>';
    expect(isValidSvg(html)).toBe(true);
  });

  it('should return false for text without closing tag', () => {
    expect(isValidSvg('<svg>')).toBe(false);
  });

  it('should return false for plain text', () => {
    expect(isValidSvg('hello world')).toBe(false);
  });

  it('should trim whitespace before check', () => {
    expect(isValidSvg('  ' + VALID_SVG + '\n')).toBe(true);
  });
});

describe('isValidRasterDataUrl', () => {
  it('should return true for JPEG data URL', () => {
    expect(isValidRasterDataUrl('data:image/jpeg;base64,abc')).toBe(true);
  });

  it('should return true for PNG data URL', () => {
    expect(isValidRasterDataUrl('data:image/png;base64,abc')).toBe(true);
  });

  it('should return true for WebP data URL', () => {
    expect(isValidRasterDataUrl('data:image/webp;base64,abc')).toBe(true);
  });

  it('should return false for SVG data URL', () => {
    expect(isValidRasterDataUrl('data:image/svg+xml;base64,abc')).toBe(false);
  });

  it('should return false for non-data-URL', () => {
    expect(isValidRasterDataUrl('not a url')).toBe(false);
  });
});

describe('svgToBase64DataUrl', () => {
  it('should produce a valid base64 data URL', () => {
    const result = svgToBase64DataUrl(VALID_SVG);
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('should be decodable back to original SVG', () => {
    const result = svgToBase64DataUrl(VALID_SVG);
    const base64Part = result.split(',')[1];
    const decoded = atob(base64Part);
    expect(decoded).toBe(VALID_SVG);
  });

  it('should handle empty SVG', () => {
    const result = svgToBase64DataUrl('<svg></svg>');
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('cleanResponse', () => {
  it('should extract raw SVG from text', () => {
    const result = cleanResponse(VALID_SVG);
    expect(result.type).toBe('svg');
    expect(result.svg).toBe(VALID_SVG);
  });

  it('should extract SVG from markdown code fence', () => {
    const result = cleanResponse('```svg\n' + VALID_SVG + '\n```');
    expect(result.type).toBe('svg');
    expect(result.svg).toBe(VALID_SVG);
  });

  it('should handle xml code fence', () => {
    const result = cleanResponse('```xml\n' + VALID_SVG + '\n```');
    expect(result.type).toBe('svg');
  });

  it('should handle html code fence', () => {
    const result = cleanResponse('```html\n' + VALID_SVG + '\n```');
    expect(result.type).toBe('svg');
  });

  it('should handle image code fence', () => {
    const result = cleanResponse('```image\n' + VALID_SVG + '\n```');
    expect(result.type).toBe('svg');
  });

  it('should extract SVG with surrounding text', () => {
    const result = cleanResponse('Here is your result:\n' + VALID_SVG + '\nDone.');
    expect(result.type).toBe('svg');
    expect(result.svg).toBe(VALID_SVG);
  });

  it('should handle markdown image with raster data URL', () => {
    const result = cleanResponse('![alt](data:image/png;base64,abc123)');
    expect(result.type).toBe('raster');
    expect(result.dataUrl).toBe('data:image/png;base64,abc123');
  });

  it('should handle raw raster data URL', () => {
    const result = cleanResponse('data:image/jpeg;base64,abc');
    expect(result.type).toBe('raster');
    expect(result.dataUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('should handle markdown image URL', () => {
    const result = cleanResponse('![alt](https://example.com/img.png)');
    expect(result.type).toBe('url');
    expect(result.url).toBe('https://example.com/img.png');
  });

  it('should decode SVG data URL', () => {
    const encoded = svgToBase64DataUrl(VALID_SVG);
    const result = cleanResponse(encoded);
    expect(result.type).toBe('svg');
    expect(result.svg).toBe(VALID_SVG);
  });

  it('should throw for empty input', () => {
    expect(() => cleanResponse('')).toThrow();
    expect(() => cleanResponse(null)).toThrow();
    expect(() => cleanResponse(undefined)).toThrow();
  });

  it('should throw for plain text without SVG', () => {
    expect(() => cleanResponse('just some text')).toThrow();
  });

  it('should throw for plain URL', () => {
    expect(() => cleanResponse('https://example.com/img.png')).toThrow();
  });

  it('should include adapter name in error message', () => {
    try {
      cleanResponse('', { adapterName: 'test-adapter' });
    } catch (e) {
      expect(e.message).toContain('test-adapter');
    }
  });

  it('should handle whitespace-only input', () => {
    expect(() => cleanResponse('   \n  ')).toThrow();
  });

  it('should handle SVG inside markdown fence nested with surrounding text', () => {
    const md = '```xml\n' + VALID_SVG + '\n```\nExtra text';
    const result = cleanResponse(md);
    expect(result.type).toBe('svg');
  });

  it('should handle unknown image data URL as raster', () => {
    const result = cleanResponse('data:image/bmp;base64,abc');
    expect(result.type).toBe('raster');
    expect(result.dataUrl).toBe('data:image/bmp;base64,abc');
  });
});

describe('cleanResponseToImage', () => {
  it('should be alias of cleanResponse', () => {
    const a = cleanResponse(VALID_SVG);
    const b = cleanResponseToImage(VALID_SVG);
    expect(a).toEqual(b);
  });
});
