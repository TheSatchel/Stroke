/**
 * LassoHandler.js — 自由多边形框选鼠标交互
 *
 * 处理 las 工具的 mousedown/mousemove/mouseup 事件。
 */
export default class LassoHandler {
  /**
   * @param {import('../Canvas.js').default} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;

    /** @type {Array<{x:number, y:number}>} */
    this._lassoPoints = [];

    /** @type {boolean} */
    this._isDrawing = false;

    /** @type {number} */
    this._lastSampleTime = 0;
  }

  get isDrawing() { return this._isDrawing; }

  /**
   * 重置框选状态
   */
  reset() {
    this._lassoPoints = [];
    this._isDrawing = false;
    this._lastSampleTime = 0;
  }

  /**
   * 开始框选
   * @param {number} x - 相对 canvasImg 的 X
   * @param {number} y - 相对 canvasImg 的 Y
   */
  onMouseDown(x, y) {
    const canvas = this._canvas;
    this._isDrawing = true;
    canvas._selManager.clearActiveSelection();
    this._lassoPoints = [{ x, y }];
    this._lastSampleTime = Date.now();
    canvas._svgOverlay.hideLassoClose();
    canvas._svgOverlay.updateLassoPath(this._lassoPoints);
  }

  /**
   * 框选移动中
   * @param {number} x
   * @param {number} y
   */
  onMouseMove(x, y) {
    if (!this._isDrawing) return;
    const now = Date.now();
    const last = this._lassoPoints[this._lassoPoints.length - 1];
    const dx = last ? x - last.x : 0;
    const dy = last ? y - last.y : 0;
    if (Math.sqrt(dx*dx + dy*dy) > 3 || now - this._lastSampleTime > 30) {
      this._lassoPoints.push({ x, y });
      this._lastSampleTime = now;
      this._canvas._svgOverlay.updateLassoPath(this._lassoPoints);
    }
    if (this._lassoPoints.length >= 1) {
      const first = this._lassoPoints[0];
      this._canvas._svgOverlay.setLassoClose(x, y, first.x, first.y);
    }
  }

  /**
   * 结束框选
   */
  onMouseUp() {
    if (!this._isDrawing) return;
    this._isDrawing = false;
    this._canvas._svgOverlay.hideLassoClose();
    if (this._lassoPoints.length >= 1) {
      this._lassoPoints.push({ ...this._lassoPoints[0] });
    }
    if (this._lassoPoints.length < 5 || this._calcPathLength() < 20) {
      this._canvas._selManager.clearActiveSelection();
      return;
    }
    const rect = this._canvas.canvasImg.getBoundingClientRect();
    const imgEl = this._canvas.canvasImg.querySelector('img');
    this._canvas._selManager.selectionData = {
      type: 'lasso',
      points: [...this._lassoPoints],
      imageDataUrl: this._canvas._userImageDataUrl,
      canvasWidth: rect.width, canvasHeight: rect.height,
      naturalWidth: imgEl?.naturalWidth || rect.width,
      naturalHeight: imgEl?.naturalHeight || rect.height,
    };
    this._canvas._selManager.showConfirmBar();
  }

  /**
   * 计算路径总长度
   * @returns {number}
   */
  _calcPathLength() {
    let len = 0;
    for (let i = 1; i < this._lassoPoints.length; i++) {
      const dx = this._lassoPoints[i].x - this._lassoPoints[i - 1].x;
      const dy = this._lassoPoints[i].y - this._lassoPoints[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }
}
