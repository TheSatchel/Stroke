/**
 * SelectionManager.js — 选区状态管理
 *
 * 管理活跃/已确认选区、确认/取消栏、sel-marker 与选区 CRUD。
 */
import { el } from '../../utils/DOM.js';

export default class SelectionManager {
  /**
   * @param {import('../Canvas.js').default} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;

    /** @type {Object<string, Object>} 已确认选区 */
    this._confirmedSelections = {};

    /** @type {Object|null} 当前活跃选区数据 */
    this._selectionData = null;

    /** @type {HTMLElement|null} */
    this._confirmBar = null;

    /** @type {HTMLElement|null} */
    this._selMarker = null;

    /** @type {HTMLElement|null} */
    this._btnConfirm = null;

    /** @type {HTMLElement|null} */
    this._btnCancel = null;

    /** @type {Object|null} 标记定位上下文（用于缩放跟随） */
    this._markerContext = null;
  }

  // ---- 确认栏 ----

  createConfirmBar() {
    const bar = el('div', 'canvas-confirm-bar', { style: 'display:none' });

    this._btnConfirm = el('button', 'canvas-confirm-btn canvas-confirm-btn--ok', {
      html: '✓',
      title: '确认选区',
      onclick: () => this._confirmSelection()
    });
    bar.appendChild(this._btnConfirm);

    this._btnCancel = el('button', 'canvas-confirm-btn canvas-confirm-btn--cancel', {
      html: '✗',
      title: '取消选区',
      onclick: () => this._cancelSelection()
    });
    bar.appendChild(this._btnCancel);

    this._confirmBar = bar;
    return bar;
  }

  showConfirmBar() { if (this._confirmBar) this._confirmBar.style.display = 'flex'; }
  hideConfirmBar() { if (this._confirmBar) this._confirmBar.style.display = 'none'; }

  // ---- 点击标记 ----

  createSelMarker() {
    const m = el('div', 'sel-marker', { style: 'display:none' });
    this._selMarker = m;
    return m;
  }

  showSelMarker(x, y, rect) {
    if (!this._selMarker) return;
    this._selMarker.style.display = 'block';
    this._selMarker.style.left = (x / rect.width * 100) + '%';
    this._selMarker.style.top = (y / rect.height * 100) + '%';

    const canvas = this._canvas;
    const imgEl = canvas.canvasImg.querySelector('img');
    this._markerContext = {
      x, y,
      containerW: rect.width,
      containerH: rect.height,
      natW: imgEl?.naturalWidth || rect.width,
      natH: imgEl?.naturalHeight || rect.height,
    };
  }

  hideSelMarker() {
    if (this._selMarker) this._selMarker.style.display = 'none';
    this._markerContext = null;
  }

  clearMarkerContext() {
    this._markerContext = null;
  }

  refreshMarker() {
    if (!this._selMarker || !this._markerContext) return;
    const mc = this._markerContext;
    const canvas = this._canvas;
    const currW = canvas.canvasImg.clientWidth;
    const currH = canvas.canvasImg.clientHeight;
    const svgOverlay = canvas._svgOverlay;
    if (!svgOverlay) return;
    const origArea = svgOverlay._computeRenderArea(mc.natW || 1, mc.natH || 1, mc.containerW || 1, mc.containerH || 1);
    const currArea = svgOverlay._computeRenderArea(mc.natW || 1, mc.natH || 1, currW, currH);
    const imgRelX = (mc.x - origArea.padLeft) / (origArea.renderedW || 1);
    const imgRelY = (mc.y - origArea.padTop) / (origArea.renderedH || 1);
    const newX = imgRelX * currArea.renderedW + currArea.padLeft;
    const newY = imgRelY * currArea.renderedH + currArea.padTop;
    this._selMarker.style.left = (newX / currW * 100) + '%';
    this._selMarker.style.top = (newY / currH * 100) + '%';
  }

  // ---- 选区数据读写 ----

  get selectionData() { return this._selectionData; }
  set selectionData(v) { this._selectionData = v; }

  get confirmedSelections() { return this._confirmedSelections; }

  // ---- 选区确认 / 取消 ----

  _confirmSelection() {
    if (!this._selectionData) return;
    const data = { ...this._selectionData };
    this.clearActiveSelection();
    this.hideConfirmBar();
    const canvas = this._canvas;
    if (canvas.onSelectionConfirm) {
      canvas.onSelectionConfirm(data);
    }
  }

  _cancelSelection() {
    this.clearActiveSelection();
    this.hideConfirmBar();
    const canvas = this._canvas;
    if (canvas._segOverlay) canvas._segOverlay.innerHTML = '';
    if (canvas.onSelectionCancel) canvas.onSelectionCancel();
  }

  clearActiveSelection() {
    this._selectionData = null;
    this.hideSelMarker();
    const canvas = this._canvas;
    canvas._lassoHandler.reset();
    canvas._svgOverlay.hideLassoPath();
    canvas._svgOverlay.hideLassoClose();
    canvas._svgOverlay.setLassoStrokeDash('4 3');
    canvas._svgOverlay.updateLassoPath([]);
    canvas._segCancelToken = (canvas._segCancelToken || 0) + 1;
    if (canvas._segOverlay) canvas._segOverlay.innerHTML = '';
    if (canvas._segHandler) canvas._segHandler.clearPreviewContext();
  }

  // ---- 已确认选区管理 ----

  addConfirmedSelection(label, data) {
    this._confirmedSelections[label] = data;
    this._canvas._svgOverlay.addConfirmedSelection(label, data);
  }

  removeConfirmedSelection(label) {
    delete this._confirmedSelections[label];
    this._canvas._svgOverlay.removeConfirmedSelection(label);
  }

  clearAllSelections() {
    this.clearActiveSelection();
    this._confirmedSelections = {};
    this._canvas._svgOverlay.clearAllSelections();
  }
}
