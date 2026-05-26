import { describe, it, expect } from 'vitest';
import { findClassAtPoint, maskToContour } from '../static/js/services/MaskProcessor.js';

describe('findClassAtPoint', () => {
  function makeMaskData(w, h, fill) {
    const data = new Uint8Array(w * h);
    if (fill) data.fill(fill);
    return data;
  }

  it('should return null for empty results', () => {
    expect(findClassAtPoint([], 10, 10, 100, 100)).toBeNull();
    expect(findClassAtPoint(null, 10, 10, 100, 100)).toBeNull();
  });

  it('should find the correct class at a point', () => {
    const data = makeMaskData(10, 10, 0);
    // fill a small region at (3, 3)
    data[3 * 10 + 3] = 200;
    data[3 * 10 + 4] = 200;
    data[4 * 10 + 3] = 200;
    data[4 * 10 + 4] = 200;

    const results = [
      { mask: { width: 10, height: 10, data }, label: 'person' }
    ];

    // click at image coords that map to mask region
    // image is 100x100, mask is 10x10 → scale factor 10
    const found = findClassAtPoint(results, 35, 35, 100, 100);
    expect(found).not.toBeNull();
    expect(found.res.label).toBe('person');
    expect(found.px).toBe(3);
    expect(found.py).toBe(3);
  });

  it('should return null when clicking outside detected area', () => {
    const data = makeMaskData(10, 10, 0);
    data[8 * 10 + 8] = 200;

    const results = [
      { mask: { width: 10, height: 10, data }, label: 'person' }
    ];

    // click at (0, 0) on image → maps to (0, 0) on mask
    const found = findClassAtPoint(results, 5, 5, 100, 100);
    expect(found).toBeNull();
  });

  it('should find first matching class among multiple results', () => {
    const dataA = makeMaskData(10, 10, 0);
    dataA[5 * 10 + 5] = 200;
    const dataB = makeMaskData(10, 10, 0);
    dataB[5 * 10 + 5] = 255;

    const results = [
      { mask: { width: 10, height: 10, data: dataA }, label: 'sky' },
      { mask: { width: 10, height: 10, data: dataB }, label: 'person' },
    ];

    const found = findClassAtPoint(results, 55, 55, 100, 100);
    expect(found.res.label).toBe('sky');
  });
});

describe('maskToContour', () => {
  function makeMask(w, h, filled) {
    const data = new Uint8Array(w * h);
    if (filled) {
      for (const { x, y } of filled) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          data[y * w + x] = 255;
        }
      }
    }
    return { width: w, height: h, data };
  }

  it('should return empty array for out-of-bounds seed', () => {
    const mask = makeMask(10, 10, [{ x: 5, y: 5 }]);
    expect(maskToContour({ width: 10, height: 10, data: mask.data }, -1, 5)).toEqual([]);
    expect(maskToContour({ width: 10, height: 10, data: mask.data }, 10, 5)).toEqual([]);
  });

  it('should return empty array for seed on empty region', () => {
    const mask = makeMask(10, 10, []);
    expect(maskToContour(mask, 5, 5)).toEqual([]);
  });

  it('should produce contour points for a filled blob', () => {
    // fill a 4x4 block in center of 10x10 mask
    const pts = [];
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        pts.push({ x, y });
      }
    }
    const mask = makeMask(10, 10, pts);

    const contour = maskToContour(mask, 5, 5);
    expect(contour.length).toBeGreaterThan(0);
    // each point should be within mask bounds
    for (const p of contour) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(10);
    }
    // a 4x4 block should produce a roughly circular contour with 72 steps
    expect(contour.length).toBeLessThanOrEqual(72);
  });

  it('should work with single-pixel blobs', () => {
    const mask = makeMask(5, 5, [{ x: 2, y: 2 }]);
    const contour = maskToContour(mask, 2, 2);
    expect(contour.length).toBeGreaterThanOrEqual(0);
  });
});
