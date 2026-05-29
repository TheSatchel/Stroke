/**
 * Canvas.js — 中栏画布（瘦协调器）
 *
 * 初始化子模块：ToolManager, SelectionManager, ImageManager,
 * SegmentationHandler, LassoHandler, SvgOverlay。
 * 同时处理 mouse 和 touch 事件路由。
 */
import { el } from '../utils/DOM.js';
import { showToast } from '../utils/Toast.js';
import SvgOverlay from './canvas/SvgOverlay.js';
import SegmentationService from '../services/SegmentationService.js';
import ToolManager from './canvas/ToolManager.js';
import SelectionManager from './canvas/SelectionManager.js';
import ImageManager from './canvas/ImageManager.js';
import SegmentationHandler from './canvas/SegmentationHandler.js';
import LassoHandler from './canvas/LassoHandler.js';

export default class Canvas {
  constructor(container) {
    this.container = container;
    this.tool = 'las';
    this.currentHistory = 0;
    this.onSelectionConfirm = null;
    this.onSelectionCancel = null;
    this.onCanvasImage = null;
    this.onClearCanvas = null;
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';
    this._generatedImageDataUrl = null;

    this._segService = SegmentationService.instance;
    this._segOverlay = null;
    this._segmentationInProgress = false;
    this._segCancelToken = 0;

    this._toolManager = new ToolManager(this);
    this._selManager = new SelectionManager(this);
    this._imageManager = new ImageManager(this);
    this._segHandler = new SegmentationHandler(this);
    this._lassoHandler = new LassoHandler(this);
    this._touchId = null;

    if (this._segService.state === 'WASM_DISABLED' && !this._segService._wasmDisabledToastShown) {
      this._segService._wasmDisabledToastShown = true;
      showToast('WebAssembly 被禁用，AI 分割模型将被禁用', 'error', 10000);
    }

    if (this._segService.state !== 'WASM_DISABLED') {
      this._segService.load().then(() => this._toolManager.updateSelectButtonState());
    }
    this._toolManager.updateSelectButtonState();

    this.render();
  }

  // ================================================================
  //  公开 API（保持兼容）
  // ================================================================
  isShowingUserImage() { return this._isShowingUserImage; }
  getUserImageDataUrl() { return this._userImageDataUrl; }

  setCanvasImage(dataUrl) { this._imageManager.setCanvasImage(dataUrl); }
  clear() { this._imageManager.clear(); }
  loadVersion(r) { this._imageManager.loadVersion(r); }
  showHistory(i) { this._imageManager.showHistory(i); }

  addConfirmedSelection(label, data) { this._selManager.addConfirmedSelection(label, data); }
  removeConfirmedSelection(label) { this._selManager.removeConfirmedSelection(label); }
  updateAllMasks(regions) { this._segHandler.updateAllMasks(regions); }

  // ================================================================
  //  渲染
  // ================================================================
  render() {
    this.container.className = 'col-mid';
    this.container.innerHTML = '';

    this.canvasArea = el('div', 'canvas-area');
    this.canvasImg = el('div', 'canvas-img', { id: 'canvas' });

    this.canvasImg.addEventListener('mousedown', e => this._onDown(e));
    this.canvasImg.addEventListener('mousemove', e => this._onMove(e));
    this.canvasImg.addEventListener('mouseup', e => this._onUp(e));

    this.canvasImg.addEventListener('touchstart', e => this._onDown(e), { passive: false });
    this.canvasImg.addEventListener('touchmove', e => this._onMove(e), { passive: false });
    this.canvasImg.addEventListener('touchend', e => this._onUp(e));
    this.canvasImg.addEventListener('touchcancel', () => { this._touchId = null; });

    this.cph = this._imageManager.createPlaceholder();
    this.canvasImg.appendChild(this.cph);

    this._svgOverlay = new SvgOverlay(this.canvasImg);
    this.canvasImg.appendChild(this._svgOverlay.getElement());

    this._selManager._confirmBar = this._selManager.createConfirmBar();
    this.canvasImg.appendChild(this._selManager._confirmBar);

    this._selManager._selMarker = this._selManager.createSelMarker();
    this.canvasImg.appendChild(this._selManager._selMarker);

    this.canvasArea.appendChild(this.canvasImg);
    this.container.appendChild(this.canvasArea);

    this.container.appendChild(this._toolManager.buildToolbar());

    this._resizeObserver = new ResizeObserver(() => {
      if (this._svgOverlay) {
        this._svgOverlay.refreshAllSelections();
        this._svgOverlay.refreshLassoPath();
      }
      if (this._selManager) this._selManager.refreshMarker();
      if (this._segHandler) this._segHandler.refreshPreview();
    });
    this._resizeObserver.observe(this.canvasImg);
  }

  // ================================================================
  //  统一坐标提取 (mouse + touch)
  // ================================================================
  _extractXY(e) {
    if (e.touches) {
      if (e.type === 'touchend' || e.type === 'touchcancel') return null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this._touchId) {
          return { clientX: e.touches[i].clientX, clientY: e.touches[i].clientY };
        }
      }
      return null;
    }
    return { clientX: e.clientX, clientY: e.clientY };
  }

  // ================================================================
  //  事件路由
  // ================================================================
  _onDown(e) {
    if (e.target.closest('.canvas-confirm-btn, .canvas-img-delete, .canvas-placeholder')) return;

    if (e.touches) {
      e.preventDefault();
      if (this._touchId !== null) return;
      this._touchId = e.touches[0] ? e.touches[0].identifier : null;
    }

    if (!this._isShowingUserImage) {
      if (!this._generatedImageDataUrl) return;
      this._isShowingUserImage = true;
      this._userImageDataUrl = this._generatedImageDataUrl;
    }

    const xy = this._extractXY(e);
    if (!xy) return;
    const rect = this.canvasImg.getBoundingClientRect();
    const x = xy.clientX - rect.left;
    const y = xy.clientY - rect.top;

    if (this.tool === 'sel') {
      this._segHandler.handlePointSelect(x, y, rect);
    } else if (this.tool === 'las') {
      this._lassoHandler.onMouseDown(x, y);
    }
  }

  _onMove(e) {
    if (e.touches) {
      e.preventDefault();
    }

    if (e.target.closest('.canvas-confirm-btn')) return;
    if (this.tool !== 'las' || !this._lassoHandler.isDrawing) return;

    const xy = this._extractXY(e);
    if (!xy) return;
    const rect = this.canvasImg.getBoundingClientRect();
    const x = xy.clientX - rect.left;
    const y = xy.clientY - rect.top;
    this._lassoHandler.onMouseMove(x, y);
  }

  _onUp(e) {
    if (e.touches) {
      if (this._touchId !== null) {
        let found = false;
        if (e.changedTouches) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this._touchId) {
              found = true;
              break;
            }
          }
        }
        if (!found) return;
        this._touchId = null;
      }
    }

    if (e.target.closest('.canvas-confirm-btn')) return;
    if (this.tool !== 'las' || !this._lassoHandler.isDrawing) return;
    this._lassoHandler.onMouseUp();
  }
}
