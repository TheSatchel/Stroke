/**
 * ImageManager.js — 图片加载/清除/历史版本加载
 *
 * 管理占位区、文件上传、setCanvasImage、clear、loadVersion、showHistory。
 */
import { el } from '../../utils/DOM.js';
import { isValidSvg } from '../../adapters/ResponseParser.js';
import { showWarningToast } from '../../utils/Toast.js';

export default class ImageManager {
  /**
   * @param {import('../Canvas.js').default} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
  }

  /**
   * 计算图片在容器中的实际渲染区域
   */
  computeImageRenderArea(natW, natH, containerW, containerH) {
    const imgRatio = natW / natH;
    const containerRatio = containerW / containerH;
    if (imgRatio > containerRatio) {
      const renderedW = containerW;
      const renderedH = containerW / imgRatio;
      return { renderedW, renderedH, padLeft: 0, padTop: (containerH - renderedH) / 2 };
    }
    const renderedH = containerH;
    const renderedW = containerH * imgRatio;
    return { renderedW, renderedH, padLeft: (containerW - renderedW) / 2, padTop: 0 };
  }

  /**
   * 创建占位区
   * @returns {HTMLElement}
   */
  createPlaceholder() {
    const canvas = this._canvas;
    const cph = el('div', 'canvas-placeholder', { id: 'cph' });
    const phInner = el('div', 'canvas-placeholder-inner');
    phInner.innerHTML = '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.4"><rect x="4" y="4" width="40" height="40" rx="6"/><circle cx="17" cy="17" r="5"/><path d="M4 34l12-10 8 6 7-8 14 12"/></svg>';
    phInner.appendChild(el('span', 'canvas-placeholder-label', { text: '点击或拖拽上传参考图，生成结果也显示在此处' }));
    cph.appendChild(phInner);

    const fileInput = el('input', '', { type: 'file', accept: 'image/*', style: 'display:none' });
    fileInput.addEventListener('change', (e) => this._handleImageFile(e.target.files[0]));
    cph.appendChild(fileInput);

    cph.addEventListener('click', () => fileInput.click());
    cph.addEventListener('dragover', (e) => { e.preventDefault(); cph.classList.add('canvas-placeholder--dragover'); });
    cph.addEventListener('dragleave', () => cph.classList.remove('canvas-placeholder--dragover'));
    cph.addEventListener('drop', (e) => {
      e.preventDefault();
      cph.classList.remove('canvas-placeholder--dragover');
      if (e.dataTransfer.files[0]) this._handleImageFile(e.dataTransfer.files[0]);
    });

    return cph;
  }

  _handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showWarningToast('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      this._canvas._selManager.clearAllSelections();
      this.setCanvasImage(dataUrl);
      const canvas = this._canvas;
      if (canvas.onCanvasImage) canvas.onCanvasImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 设置画布图片
   * @param {string} dataUrl
   */
  setCanvasImage(dataUrl) {
    if (!dataUrl) return;
    const canvas = this._canvas;
    canvas._isShowingUserImage = true;
    canvas._userImageDataUrl = dataUrl;
    canvas._selManager.clearAllSelections();

    if (canvas.cph) canvas.cph.style.display = 'none';
    canvas.canvasImg.style.backgroundImage = 'none';

    const svgOverlayEl = canvas._svgOverlay.getElement();
    const confirmBar = canvas._selManager._confirmBar;
    const selMarker = canvas._selManager._selMarker;

    canvas._segOverlay = null;
    canvas.canvasImg.innerHTML = '';
    canvas.canvasImg.innerHTML = `<img src="${dataUrl}" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:var(--border-radius-lg);-webkit-user-drag:none;user-select:none" />`;

    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (canvas.onClearCanvas) canvas.onClearCanvas();
      }
    });
    canvas.canvasImg.appendChild(delBtn);
    canvas.canvasImg.appendChild(svgOverlayEl);
    canvas.canvasImg.appendChild(confirmBar);
    canvas.canvasImg.appendChild(selMarker);

    canvas.cph = this.createPlaceholder();
    canvas.cph.style.display = 'none';
    canvas.canvasImg.appendChild(canvas.cph);
  }

  /**
   * 清除画布
   */
  clear() {
    const canvas = this._canvas;
    canvas._selManager.clearAllSelections();
    canvas._selManager.hideConfirmBar();
    canvas._segService.clearCache();

    const svgOverlayEl = canvas._svgOverlay.getElement();
    const confirmBar = canvas._selManager._confirmBar;
    const selMarker = canvas._selManager._selMarker;

    canvas._segOverlay = null;
    canvas.canvasImg.innerHTML = '';
    canvas.canvasImg.style.backgroundImage = 'none';
    canvas._isShowingUserImage = false;
    canvas._userImageDataUrl = '';

    canvas.canvasImg.appendChild(canvas.cph);
    canvas.cph.style.display = 'flex';
    canvas.canvasImg.appendChild(svgOverlayEl);
    canvas.canvasImg.appendChild(confirmBar);
    canvas.canvasImg.appendChild(selMarker);
  }

  /**
   * 加载历史版本到画布
   * @param {Object|string} imageResult
   */
  loadVersion(imageResult) {
    const canvas = this._canvas;
    canvas._isShowingUserImage = false;
    canvas._userImageDataUrl = '';
    canvas._selManager.clearAllSelections();
    canvas._selManager.hideConfirmBar();

    if (canvas.cph) canvas.cph.style.display = 'none';
    canvas.canvasImg.style.backgroundImage = 'none';
    canvas._segOverlay = null;

    const svgOverlayEl = canvas._svgOverlay.getElement();
    const confirmBar = canvas._selManager._confirmBar;
    const selMarker = canvas._selManager._selMarker;

    canvas.canvasImg.innerHTML = '';

    if (typeof imageResult === 'string') {
      imageResult = { type: 'svg', svg: imageResult };
    }

    if (imageResult && imageResult.type === 'raster' && imageResult.dataUrl) {
      canvas.canvasImg.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
        <img src="${imageResult.dataUrl}" draggable="false" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;-webkit-user-drag:none;user-select:none;pointer-events:none" />
      </div>`;
    } else if (imageResult && imageResult.svg && isValidSvg(imageResult.svg)) {
      canvas.canvasImg.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" preserveAspectRatio="xMidYMid meet">${imageResult.svg}</svg>`;
    } else {
      showWarningToast('生成结果无法显示，请检查 API 配置或模型');
      canvas.canvasImg.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-tertiary);font-size:12px;text-align:center;padding:16px">
        ⚠ 生成结果无法显示<br>请检查 API 配置或模型
      </div>`;
    }

    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (canvas.onClearCanvas) canvas.onClearCanvas();
      }
    });
    canvas.canvasImg.appendChild(delBtn);
    canvas.canvasImg.appendChild(svgOverlayEl);
    canvas.canvasImg.appendChild(confirmBar);
    canvas.canvasImg.appendChild(selMarker);

    canvas.cph = this.createPlaceholder();
    canvas.cph.style.display = 'none';
    canvas.canvasImg.appendChild(canvas.cph);
  }

  /**
   * 标记当前正在查看历史
   */
  showHistory(i) {
    this._canvas.currentHistory = i;
    if (i !== 0) {
      this._canvas._selManager.clearActiveSelection();
      this._canvas._selManager.hideConfirmBar();
    }
  }
}
