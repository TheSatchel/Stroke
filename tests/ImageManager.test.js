import { describe, it, expect, beforeEach } from 'vitest';
import ImageManager from '../static/js/components/canvas/ImageManager.js';

function createMockCanvas() {
  const canvasImg = document.createElement('div');
  canvasImg.id = 'canvasImg';

  const cph = document.createElement('div');
  cph.className = 'canvas-placeholder';
  cph.style.display = 'flex';

  const svgOverlayEl = document.createElement('div');
  const confirmBar = document.createElement('div');
  const selMarker = document.createElement('div');

  const segService = { clearCache() {} };

  const selManager = {
    _confirmBar: confirmBar,
    _selMarker: selMarker,
    clearAllSelections() {},
    hideConfirmBar() {},
  };

  return {
    _isShowingUserImage: false,
    _userImageDataUrl: '',
    _generatedImageDataUrl: null,
    canvasImg,
    cph,
    _svgOverlay: { getElement: () => svgOverlayEl },
    _selManager: selManager,
    _segService: segService,
    _segOverlay: null,
    onClearCanvas: null,
  };
}

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><circle cx="28" cy="28" r="20" fill="red"/></svg>';

describe('ImageManager', () => {
  let canvas;
  let imageManager;

  beforeEach(() => {
    canvas = createMockCanvas();
    imageManager = new ImageManager(canvas);
  });

  describe('loadVersion', () => {
    it('should set _isShowingUserImage to false', () => {
      canvas._isShowingUserImage = true;
      imageManager.loadVersion({ type: 'raster', dataUrl: 'data:image/png;base64,abc' });
      expect(canvas._isShowingUserImage).toBe(false);
    });

    it('should clear _userImageDataUrl', () => {
      canvas._userImageDataUrl = 'old';
      imageManager.loadVersion({ type: 'raster', dataUrl: 'data:image/png;base64,abc' });
      expect(canvas._userImageDataUrl).toBe('');
    });

    it('should store _generatedImageDataUrl for raster images', () => {
      imageManager.loadVersion({ type: 'raster', dataUrl: 'data:image/png;base64,abc123' });
      expect(canvas._generatedImageDataUrl).toBe('data:image/png;base64,abc123');
    });

    it('should store SVG data URL for SVG images', () => {
      imageManager.loadVersion({ svg: VALID_SVG });
      expect(canvas._generatedImageDataUrl).not.toBeNull();
      expect(canvas._generatedImageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should set _generatedImageDataUrl to null for invalid results', () => {
      canvas._generatedImageDataUrl = 'previous';
      imageManager.loadVersion(null);
      expect(canvas._generatedImageDataUrl).toBeNull();
    });

    it('should handle string input by converting to SVG object', () => {
      imageManager.loadVersion(VALID_SVG);
      expect(canvas._generatedImageDataUrl).not.toBeNull();
      expect(canvas._generatedImageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should hide placeholder when loading version', () => {
      imageManager.loadVersion({ type: 'raster', dataUrl: 'data:image/png;base64,abc' });
      expect(canvas.cph.style.display).toBe('none');
    });

    it('should clear background-image style', () => {
      canvas.canvasImg.style.backgroundImage = 'url(test.png)';
      imageManager.loadVersion({ type: 'raster', dataUrl: 'data:image/png;base64,abc' });
      expect(canvas.canvasImg.style.backgroundImage).toBe('none');
    });
  });

  describe('clear', () => {
    it('should reset _generatedImageDataUrl to null', () => {
      canvas._generatedImageDataUrl = 'some-url';
      imageManager.clear();
      expect(canvas._generatedImageDataUrl).toBeNull();
    });

    it('should reset _isShowingUserImage to false', () => {
      canvas._isShowingUserImage = true;
      imageManager.clear();
      expect(canvas._isShowingUserImage).toBe(false);
    });

    it('should reset _userImageDataUrl to empty', () => {
      canvas._userImageDataUrl = 'some-url';
      imageManager.clear();
      expect(canvas._userImageDataUrl).toBe('');
    });

    it('should show placeholder after clear', () => {
      imageManager.clear();
      expect(canvas.cph.style.display).toBe('flex');
    });
  });

  describe('setCanvasImage', () => {
    it('should set _isShowingUserImage to true', () => {
      imageManager.setCanvasImage('data:image/png;base64,abc');
      expect(canvas._isShowingUserImage).toBe(true);
    });

    it('should set _userImageDataUrl', () => {
      imageManager.setCanvasImage('data:image/png;base64,user');
      expect(canvas._userImageDataUrl).toBe('data:image/png;base64,user');
    });

    it('should hide placeholder', () => {
      imageManager.setCanvasImage('data:image/png;base64,abc');
      expect(canvas.cph.style.display).toBe('none');
    });

    it('should not do anything for falsy dataUrl', () => {
      imageManager.setCanvasImage(null);
      expect(canvas._isShowingUserImage).toBe(false);
    });
  });
});
