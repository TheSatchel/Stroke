/**
 * SegmentationHandler.js — AI 分割点选处理
 *
 * 处理点选触发 AI 分割、预览渲染和已确认选区叠加。
 */
import { showToast, dismissToast } from '../../utils/Toast.js';

export default class SegmentationHandler {
  /**
   * @param {import('../Canvas.js').default} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
  }

  /**
   * AI 分割点选入口
   * @param {number} clientX - 相对 canvasImg 的 X
   * @param {number} clientY - 相对 canvasImg 的 Y
   * @param {DOMRect} rect
   */
  async handlePointSelect(clientX, clientY, rect) {
    const canvas = this._canvas;
    if (canvas._segmentationInProgress) return;
    canvas._selManager.clearActiveSelection();

    const state = canvas._segService.state;

    if (state === 'WASM_DISABLED' || state === 'ERROR') {
      this.handlePointSelectFallback(clientX, clientY, rect);
      return;
    }

    if (state === 'DOWNLOADING') {
      showToast('⏳ AI 分割模型还在下载中，请稍后再试…', 'warning', 4000);
      return;
    }

    if (state === 'IDLE') {
      showToast('⏳ AI 分割模型下载中，请稍后重试…', 'warning', 4000);
      canvas._segService.load().then(() => canvas._toolManager.updateSelectButtonState());
      return;
    }

    const imgDataUrl = canvas._userImageDataUrl;
    const imgEl = canvas.canvasImg.querySelector('img');
    if (!imgEl) {
      this.handlePointSelectFallback(clientX, clientY, rect);
      return;
    }

    canvas._selManager.showSelMarker(clientX, clientY, rect);

    canvas._segmentationInProgress = true;
    canvas._segCancelToken = (canvas._segCancelToken || 0) + 1;
    const token = canvas._segCancelToken;

    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    const containerW = rect.width;
    const containerH = rect.height;

    const { renderedW, renderedH, padLeft, padTop } =
      canvas._imageManager.computeImageRenderArea(natW, natH, containerW, containerH);

    const imgX = (clientX - padLeft) / renderedW * natW;
    const imgY = (clientY - padTop) / renderedH * natH;
    const cx = Math.max(0, Math.min(natW - 1, imgX));
    const cy = Math.max(0, Math.min(natH - 1, imgY));

    const progressToast = showToast('🔍 AI 正在识别点击区域…', 'warning', 15000);

    try {
      const result = await canvas._segService.segmentAtPoint(imgDataUrl, cx, cy);
      dismissToast(progressToast);
      if (token !== canvas._segCancelToken) return;

      if (result) {
        canvas._selManager.hideSelMarker();
        const displayPoints = result.maskPoints.map(p => ({
          x: p.x / result.maskWidth * renderedW + padLeft,
          y: p.y / result.maskHeight * renderedH + padTop,
        }));

        canvas._selManager.selectionData = {
          type: 'segmentation',
          points: displayPoints,
          classLabel: result.classLabel,
          imageDataUrl: imgDataUrl,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
          naturalWidth: imgEl.naturalWidth || rect.width,
          naturalHeight: imgEl.naturalHeight || rect.height,
        };
        this.showSegmentationPreview(displayPoints);
        canvas._selManager.showConfirmBar();
      } else {
        showToast('⚠️ AI 未识别到区域，请尝试点击其他位置', 'warning', 4000);
      }
    } catch (err) {
      if (token !== canvas._segCancelToken) return;
      dismissToast(progressToast);
      console.error('[Canvas] 分割推理失败:', err);
      showToast('⚠️ AI 分割失败: ' + (err.message || '未知错误'), 'error', 5000);
    } finally {
      if (token === canvas._segCancelToken) {
        canvas._segmentationInProgress = false;
      }
    }
  }

  /**
   * 分割不可用时的回退点选
   */
  handlePointSelectFallback(clientX, clientY, rect) {
    const canvas = this._canvas;
    const imgEl = canvas.canvasImg.querySelector('img');
    canvas._selManager.selectionData = {
      type: 'point',
      x: clientX, y: clientY,
      imageDataUrl: canvas._userImageDataUrl,
      canvasWidth: rect.width, canvasHeight: rect.height,
      naturalWidth: imgEl?.naturalWidth || rect.width,
      naturalHeight: imgEl?.naturalHeight || rect.height,
    };
    canvas._selManager.showSelMarker(clientX, clientY, rect);
    canvas._selManager.showConfirmBar();
  }

  /**
   * 渲染分割预览（临时叠加层）
   */
  showSegmentationPreview(maskPoints, color = '#3B82F6') {
    const canvas = this._canvas;
    if (!canvas._segOverlay) {
      canvas._segOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      canvas._segOverlay.setAttribute('class', 'lasso-svg');
      canvas.canvasImg.appendChild(canvas._segOverlay);
    }
    canvas._segOverlay.innerHTML = '';

    const pointsStr = maskPoints.map(p => `${p.x},${p.y}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', pointsStr);
    poly.setAttribute('fill', color);
    poly.setAttribute('fill-opacity', '0.35');
    poly.setAttribute('stroke', color);
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-dasharray', '4 2');
    canvas._segOverlay.appendChild(poly);
  }

  /**
   * 更新所有已确认选区的叠加层
   * @param {Array} confirmedRegions
   */
  updateAllMasks(confirmedRegions) {
    const canvas = this._canvas;
    if (!canvas._segOverlay) {
      canvas._segOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      canvas._segOverlay.setAttribute('class', 'lasso-svg');
      canvas.canvasImg.appendChild(canvas._segOverlay);
    }
    canvas._segOverlay.innerHTML = '';

    for (const region of confirmedRegions) {
      const { points, color, label } = region;
      if (!points || points.length < 3) continue;

      const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pointsStr);
      poly.setAttribute('fill', color);
      poly.setAttribute('fill-opacity', '0.35');
      poly.setAttribute('stroke', color);
      poly.setAttribute('stroke-width', '1.5');
      group.appendChild(poly);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const minX = Math.min(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      text.setAttribute('x', minX);
      text.setAttribute('y', minY - 4);
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.textContent = label;
      group.appendChild(text);

      canvas._segOverlay.appendChild(group);
    }
  }
}
