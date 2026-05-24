/**
 * Canvas.js — 中栏画布
 *
 * 支持：点选工具 (sel) + 自由多边形框选 (las)
 * 确认/取消按钮、多选区叠加、双击清画布
 */

import { el, svgEl, iconSvg } from '../utils/DOM.js';
import { isValidSvg } from '../adapters/ResponseParser.js';
import { showWarningToast, showToast, dismissToast } from '../utils/Toast.js';
import SvgOverlay from './canvas/SvgOverlay.js';
import SegmentationService from '../services/SegmentationService.js';

export default class Canvas {
  constructor(container) {
    this.container = container;
    this.tool = 'las';
    this.currentHistory = 0;
    this.onSelectionConfirm = null;    // (data) => void
    this.onSelectionCancel = null;     // () => void
    this.onCanvasImage = null;
    this.onClearCanvas = null;
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';

    // 选区状态
    this._selectionData = null;
    this._confirmedSelections = {};
    this._lassoPoints = [];
    this._isDrawing = false;
    this._lastSampleTime = 0;

    // AI 分割服务
    this._segService = SegmentationService.instance;
    this._segOverlay = null;
    this._segmentationInProgress = false;

    // WASM 被禁用时弹 Toast（仅首次）
    if (this._segService.state === 'WASM_DISABLED' && !this._segService._wasmDisabledToastShown) {
      this._segService._wasmDisabledToastShown = true;
      showToast('WebAssembly 被禁用，AI 分割模型将被禁用', 'error', 10000);
    }

    // 如果 WASM 可用，预热模型（App.js 可能已触发，load() 内部会去重）
    if (this._segService.state !== 'WASM_DISABLED') {
      this._segService.load().then(() => this._updateSelectButtonState());
    }
    this._updateSelectButtonState();

    this.render();
  }

  _updateSelectButtonState() {
    const state = this._segService.state;
    const disabled = (state === 'WASM_DISABLED' || state === 'DOWNLOADING' || state === 'IDLE');
    if (this.btnSel) {
      this.btnSel.disabled = disabled;
      if (state === 'WASM_DISABLED') {
        this.btnSel.title = 'WebAssembly 被禁用，AI 选择不可用';
      } else if (state === 'DOWNLOADING' || state === 'IDLE') {
        this.btnSel.title = 'AI 分割模型加载中…';
      } else if (state === 'READY') {
        this.btnSel.title = '点击选择区域 (AI 分割)';
      } else {
        this.btnSel.title = 'AI 分割模型未就绪';
      }
    }
  }

  render() {
    this.container.className = 'col-mid';
    this.container.innerHTML = '';

    this.canvasArea = el('div', 'canvas-area');
    this.canvasImg = el('div', 'canvas-img', { id: 'canvas' });

    this.canvasImg.addEventListener('mousedown', e => this._onMouseDown(e));
    this.canvasImg.addEventListener('mousemove', e => this._onMouseMove(e));
    this.canvasImg.addEventListener('mouseup', e => this._onMouseUp(e));

    this.cph = this._createPlaceholder();
    this.canvasImg.appendChild(this.cph);

    this._svgOverlay = new SvgOverlay(this.canvasImg);
    this.canvasImg.appendChild(this._svgOverlay.getElement());

    this._confirmBar = this._createConfirmBar();
    this.canvasImg.appendChild(this._confirmBar);

    this._selMarker = this._createSelMarker();
    this.canvasImg.appendChild(this._selMarker);

    this.canvasArea.appendChild(this.canvasImg);
    this.container.appendChild(this.canvasArea);

    this._buildToolbar();

    this._resizeObserver = new ResizeObserver(() => {
      if (this._svgOverlay) this._svgOverlay.refreshAllSelections();
    });
    this._resizeObserver.observe(this.canvasImg);
  }

  // ================================================================
  //  确认栏
  // ================================================================
  _createConfirmBar() {
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

    return bar;
  }

  _showConfirmBar() { this._confirmBar.style.display = 'flex'; }
  _hideConfirmBar() { this._confirmBar.style.display = 'none'; }

  _createSelMarker() {
    const m = el('div', 'sel-marker', { style: 'display:none' });
    return m;
  }

  _showSelMarker(x, y) {
    this._selMarker.style.display = 'block';
    this._selMarker.style.left = x + 'px';
    this._selMarker.style.top = y + 'px';
  }
  _hideSelMarker() { this._selMarker.style.display = 'none'; }

  _computeImageRenderArea(natW, natH, containerW, containerH) {
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

  // ================================================================
  //  AI 分割点选处理
  // ================================================================
  async _handlePointSelect(clientX, clientY, rect) {
    if (this._segmentationInProgress) return;
    this._clearActiveSelection();

    const state = this._segService.state;

    if (state === 'WASM_DISABLED' || state === 'ERROR') {
      this._handlePointSelectFallback(clientX, clientY, rect);
      return;
    }

    if (state === 'DOWNLOADING') {
      showToast('⏳ AI 分割模型还在下载中，请稍后再试…', 'warning', 4000);
      return;
    }

    if (state === 'IDLE') {
      showToast('⏳ AI 分割模型下载中，请稍后重试…', 'warning', 4000);
      this._segService.load().then(() => this._updateSelectButtonState());
      return;
    }

    // READY — 执行 AI 分割
    const imgDataUrl = this._userImageDataUrl;
    const imgEl = this.canvasImg.querySelector('img');
    if (!imgEl) {
      this._handlePointSelectFallback(clientX, clientY, rect);
      return;
    }

    this._segmentationInProgress = true;

    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    const containerW = rect.width;
    const containerH = rect.height;

    const { renderedW, renderedH, padLeft, padTop } =
      this._computeImageRenderArea(natW, natH, containerW, containerH);

    const imgX = (clientX - padLeft) / renderedW * natW;
    const imgY = (clientY - padTop) / renderedH * natH;
    const cx = Math.max(0, Math.min(natW - 1, imgX));
    const cy = Math.max(0, Math.min(natH - 1, imgY));

    const progressToast = showToast('🔍 AI 正在识别点击区域…', 'warning', 15000);

    try {
      const result = await this._segService.segmentAtPoint(imgDataUrl, cx, cy);
      dismissToast(progressToast);

      if (result) {
        const displayPoints = result.maskPoints.map(p => ({
          x: p.x / result.maskWidth * renderedW + padLeft,
          y: p.y / result.maskHeight * renderedH + padTop,
        }));

        this._selectionData = {
              type: 'segmentation',
              points: displayPoints,
              classLabel: result.classLabel,
              imageDataUrl: imgDataUrl,
              canvasWidth: rect.width,
              canvasHeight: rect.height,
              naturalWidth: imgEl.naturalWidth || rect.width,
              naturalHeight: imgEl.naturalHeight || rect.height,
            };
        this._showSegmentationPreview(displayPoints);
        this._showConfirmBar();
      } else {
        showToast('⚠️ AI 未识别到区域，请尝试点击其他位置', 'warning', 4000);
      }
    } catch (err) {
      dismissToast(progressToast);
      console.error('[Canvas] 分割推理失败:', err);
      showToast('⚠️ AI 分割失败: ' + (err.message || '未知错误'), 'error', 5000);
    } finally {
      this._segmentationInProgress = false;
    }
  }

  _handlePointSelectFallback(clientX, clientY, rect) {
    const imgEl = this.canvasImg.querySelector('img');
    this._selectionData = {
      type: 'point',
      x: clientX, y: clientY,
      imageDataUrl: this._userImageDataUrl,
      canvasWidth: rect.width, canvasHeight: rect.height,
      naturalWidth: imgEl?.naturalWidth || rect.width,
      naturalHeight: imgEl?.naturalHeight || rect.height,
    };
    this._showSelMarker(clientX, clientY);
    this._showConfirmBar();
  }

  _showSegmentationPreview(maskPoints, color = '#3B82F6') {
    if (!this._segOverlay) {
      this._segOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._segOverlay.setAttribute('class', 'lasso-svg');
      this.canvasImg.appendChild(this._segOverlay);
    }
    this._segOverlay.innerHTML = '';

    const pointsStr = maskPoints.map(p => `${p.x},${p.y}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', pointsStr);
    poly.setAttribute('fill', color);
    poly.setAttribute('fill-opacity', '0.35');
    poly.setAttribute('stroke', color);
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-dasharray', '4 2');
    this._segOverlay.appendChild(poly);
  }

  /**
   * 更新所有已确认选区的叠加层
   */
  updateAllMasks(confirmedRegions) {
    if (!this._segOverlay) {
      this._segOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._segOverlay.setAttribute('class', 'lasso-svg');
      this.canvasImg.appendChild(this._segOverlay);
    }
    this._segOverlay.innerHTML = '';

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

      this._segOverlay.appendChild(group);
    }
  }

  // ================================================================
  //  鼠标事件
  // ================================================================
  _onMouseDown(e) {
    // 排除确认/取消按钮的点击冒泡，避免 _selectionData 被提前清空
    if (e.target.closest('.canvas-confirm-btn')) return;

    if (!this._isShowingUserImage) return;
    const rect = this.canvasImg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.tool === 'sel') {
      e.preventDefault();
      this._handlePointSelect(x, y, rect);
    } else if (this.tool === 'las') {
      this._isDrawing = true;
      this._clearActiveSelection();
      this._lassoPoints = [{ x, y }];
      this._lastSampleTime = Date.now();
      this._svgOverlay.hideLassoClose();
      this._svgOverlay.updateLassoPath(this._lassoPoints);
    }
  }

  _onMouseMove(e) {
    // 排除确认/取消按钮的悬停冒泡，防止意外触发绘制逻辑
    if (e.target.closest('.canvas-confirm-btn')) return;

    if (this.tool === 'las' && this._isDrawing) {
      const rect = this.canvasImg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = Date.now();
      const last = this._lassoPoints[this._lassoPoints.length - 1];
      const dx = last ? x - last.x : 0;
      const dy = last ? y - last.y : 0;
      if (Math.sqrt(dx*dx + dy*dy) > 3 || now - this._lastSampleTime > 30) {
        this._lassoPoints.push({ x, y });
        this._lastSampleTime = now;
        this._svgOverlay.updateLassoPath(this._lassoPoints);
      }
      if (this._lassoPoints.length >= 1) {
        const first = this._lassoPoints[0];
        this._svgOverlay.setLassoClose(x, y, first.x, first.y);
      }
    }
  }

  _onMouseUp(e) {
    // 排除确认/取消按钮的点击冒泡
    if (e.target.closest('.canvas-confirm-btn')) return;

    if (this.tool !== 'las' || !this._isDrawing) return;
    this._isDrawing = false;
    this._svgOverlay.hideLassoClose();
    if (this._lassoPoints.length >= 1) {
      this._lassoPoints.push({ ...this._lassoPoints[0] });
    }
    if (this._lassoPoints.length < 5 || this._calcPathLength() < 20) {
      this._clearActiveSelection();
      return;
    }
    const rect = this.canvasImg.getBoundingClientRect();
    const imgEl3 = this.canvasImg.querySelector('img');
    this._selectionData = {
      type: 'lasso',
      points: [...this._lassoPoints],
      imageDataUrl: this._userImageDataUrl,
      canvasWidth: rect.width, canvasHeight: rect.height,
      naturalWidth: imgEl3?.naturalWidth || rect.width,
      naturalHeight: imgEl3?.naturalHeight || rect.height,
    };
    this._showConfirmBar();
  }


  // ================================================================
  //  Lasso 路径 — 委托给 SvgOverlay
  // ================================================================
  _calcPathLength() {
    let len = 0;
    for (let i = 1; i < this._lassoPoints.length; i++) {
      const dx = this._lassoPoints[i].x - this._lassoPoints[i - 1].x;
      const dy = this._lassoPoints[i].y - this._lassoPoints[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  // ================================================================
  //  选区确认 / 取消
  // ================================================================
  _confirmSelection() {
    if (!this._selectionData) return;
    const data = { ...this._selectionData };
    this._clearActiveSelection();
    this._hideConfirmBar();
    if (this.onSelectionConfirm) {
      this.onSelectionConfirm(data);
    }
  }

  _cancelSelection() {
    this._clearActiveSelection();
    this._hideConfirmBar();
    if (this._segOverlay) this._segOverlay.innerHTML = '';
    if (this.onSelectionCancel) this.onSelectionCancel();
  }

  _clearActiveSelection() {
    this._selectionData = null;
    this._lassoPoints = [];
    this._hideSelMarker();
    this._svgOverlay.hideLassoPath();
    this._svgOverlay.hideLassoClose();
    this._svgOverlay.setLassoStrokeDash('4 3');
    this._svgOverlay.updateLassoPath([]);
    if (this._segOverlay) this._segOverlay.innerHTML = '';
  }

  // ================================================================
  //  已确认选区管理
  // ================================================================
  addConfirmedSelection(label, data) {
    this._confirmedSelections[label] = data;
    this._svgOverlay.addConfirmedSelection(label, data);
  }

  removeConfirmedSelection(label) {
    delete this._confirmedSelections[label];
    this._svgOverlay.removeConfirmedSelection(label);
  }

  _clearAllSelections() {
    this._clearActiveSelection();
    this._confirmedSelections = {};
    this._svgOverlay.clearAllSelections();
  }

  // ================================================================
  //  工具栏
  // ================================================================
  _buildToolbar() {
    this.toolbar = el('div', 'canvas-toolbar');

    const wasmDisabled = this._segService.state === 'WASM_DISABLED';
    this.btnSel = el('button', 'tool-btn', {
      id: 'btnSel',
      disabled: wasmDisabled,
      title: wasmDisabled
        ? 'WebAssembly 被禁用，AI 选择不可用'
        : '点击选择区域 (AI 分割)',
      onclick: () => {
        if (wasmDisabled) return;
        this.setTool('sel');
      }
    });
    const selIcon = iconSvg(13, 13, [
      svgEl('path', { d: 'M2 2l4 10 2-4 4-2L2 2z', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnSel.appendChild(selIcon);
    this.btnSel.appendChild(document.createTextNode('选择'));

    this.btnLas = el('button', 'tool-btn active', { id: 'btnLas', onclick: () => this.setTool('las') });
    const lasIcon = iconSvg(13, 13, [
      svgEl('path', { d: 'M2 2h9l-2 3 2 3H2V2z', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-dasharray': '2 1.5' })
    ]);
    this.btnLas.appendChild(lasIcon);
    this.btnLas.appendChild(document.createTextNode('框选'));

    this.toolbar.appendChild(this.btnSel);
    this.toolbar.appendChild(this.btnLas);
    this.toolbar.appendChild(el('div', 'sflex'));
    this.tHint = el('span', '', {
      id: 'tHint',
      text: '拖拽绘制多边形选区',
      style: 'font-size:11px;color:var(--color-text-tertiary)'
    });
    this.toolbar.appendChild(this.tHint);
    this.container.appendChild(this.toolbar);
  }

  setTool(t) {
    this.tool = t;
    this.btnSel.classList.toggle('active', t === 'sel');
    this.btnLas.classList.toggle('active', t === 'las');
    this.tHint.textContent = t === 'las' ? '拖拽绘制多边形选区' : '点击图片选择区域';
    this.canvasImg.style.cursor = t === 'las' ? 'crosshair' : 'default';
    this._clearActiveSelection();
    this._hideConfirmBar();
  }

  // ================================================================
  //  占位区
  // ================================================================
  _createPlaceholder() {
    const cph = el('div', 'canvas-placeholder', { id: 'cph' });
    const phInner = el('div', 'canvas-placeholder-inner');
    phInner.innerHTML = '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.4"><rect x="4" y="4" width="40" height="40" rx="6"/><circle cx="17" cy="17" r="5"/><path d="M4 34l12-10 8 6 7-8 14 12"/></svg>';
    phInner.appendChild(el('span', 'canvas-placeholder-label', { text: '点击或拖拽上传参考图，生成结果也显示在此处' }));
    cph.appendChild(phInner);

    const fileInput = el('input', '', { type: 'file', accept: 'image/*', style: 'display:none' });
    fileInput.addEventListener('change', (e) => this._handleCanvasImageFile(e.target.files[0]));
    cph.appendChild(fileInput);

    cph.addEventListener('click', () => fileInput.click());
    cph.addEventListener('dragover', (e) => { e.preventDefault(); cph.classList.add('canvas-placeholder--dragover'); });
    cph.addEventListener('dragleave', () => cph.classList.remove('canvas-placeholder--dragover'));
    cph.addEventListener('drop', (e) => {
      e.preventDefault();
      cph.classList.remove('canvas-placeholder--dragover');
      if (e.dataTransfer.files[0]) this._handleCanvasImageFile(e.dataTransfer.files[0]);
    });

    return cph;
  }

  // ================================================================
  //  图片管理
  // ================================================================
  _handleCanvasImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showWarningToast('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      this._clearAllSelections();
      this.setCanvasImage(dataUrl);
      if (this.onCanvasImage) this.onCanvasImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  setCanvasImage(dataUrl) {
    if (!dataUrl) return;
    this._isShowingUserImage = true;
    this._userImageDataUrl = dataUrl;
    this._clearAllSelections();

    if (this.cph) this.cph.style.display = 'none';
    this.canvasImg.style.backgroundImage = 'none';

    const svgOverlayEl = this._svgOverlay.getElement();
    const confirmBar = this._confirmBar;
    const selMarker = this._selMarker;

    this._segOverlay = null;
    this.canvasImg.innerHTML = '';
    this.canvasImg.innerHTML = `<img src="${dataUrl}" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:var(--border-radius-lg);-webkit-user-drag:none;user-select:none" />`;

    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (this.onClearCanvas) this.onClearCanvas();
      }
    });
    this.canvasImg.appendChild(delBtn);

    this.canvasImg.appendChild(svgOverlayEl);
    this.canvasImg.appendChild(confirmBar);
    this.canvasImg.appendChild(selMarker);

    this.cph = this._createPlaceholder();
    this.cph.style.display = 'none';
    this.canvasImg.appendChild(this.cph);
  }

  isShowingUserImage() {
    return this._isShowingUserImage;
  }

  getUserImageDataUrl() {
    return this._userImageDataUrl;
  }

  clear() {
    this._clearAllSelections();
    this._hideConfirmBar();
    this._segService.clearCache();

    const svgOverlayEl = this._svgOverlay.getElement();
    const confirmBar = this._confirmBar;
    const selMarker = this._selMarker;

    this._segOverlay = null;
    this.canvasImg.innerHTML = '';
    this.canvasImg.style.backgroundImage = 'none';
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';

    this.canvasImg.appendChild(this.cph);
    this.cph.style.display = 'flex';

    this.canvasImg.appendChild(svgOverlayEl);
    this.canvasImg.appendChild(confirmBar);
    this.canvasImg.appendChild(selMarker);
  }

  showHistory(i) {
    this.currentHistory = i;
    if (i !== 0) {
      this._clearActiveSelection();
      this._hideConfirmBar();
    }
  }

  loadVersion(imageResult) {
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';
    this._clearAllSelections();
    this._hideConfirmBar();

    if (this.cph) this.cph.style.display = 'none';
    this.canvasImg.style.backgroundImage = 'none';
    this._segOverlay = null;

    const svgOverlayEl = this._svgOverlay.getElement();
    const confirmBar = this._confirmBar;
    const selMarker = this._selMarker;

    this.canvasImg.innerHTML = '';

    if (typeof imageResult === 'string') {
      imageResult = { type: 'svg', svg: imageResult };
    }

    if (imageResult && imageResult.type === 'raster' && imageResult.dataUrl) {
      this.canvasImg.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
        <img src="${imageResult.dataUrl}" draggable="false" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;-webkit-user-drag:none;user-select:none;pointer-events:none" />
      </div>`;
    } else if (imageResult && imageResult.svg && isValidSvg(imageResult.svg)) {
      this.canvasImg.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" preserveAspectRatio="xMidYMid meet">${imageResult.svg}</svg>`;
    } else {
      showWarningToast('生成结果无法显示，请检查 API 配置或模型');
      this.canvasImg.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-tertiary);font-size:12px;text-align:center;padding:16px">
        ⚠ 生成结果无法显示<br>请检查 API 配置或模型
      </div>`;
    }

    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (this.onClearCanvas) this.onClearCanvas();
      }
    });
    this.canvasImg.appendChild(delBtn);

    this.canvasImg.appendChild(svgOverlayEl);
    this.canvasImg.appendChild(confirmBar);
    this.canvasImg.appendChild(selMarker);

    this.cph = this._createPlaceholder();
    this.cph.style.display = 'none';
    this.canvasImg.appendChild(this.cph);
  }
}