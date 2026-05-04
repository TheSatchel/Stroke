/**
 * Canvas.js — 中栏画布
 */

import { el, svgEl, iconSvg } from './utils.js';
import { isValidSvg } from '../adapters/ResponseParser.js';
import { showWarningToast } from './Toast.js';

export default class Canvas {
  constructor(container) {
    this.container = container;
    this.tool = 'las';
    this.lassoing = false;
    this.lx = 0;
    this.ly = 0;
    this.currentHistory = 0;
    this.onLassoDone = null;
    this.onCanvasImage = null;
    this.onClearCanvas = null;
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';
    this.render();
  }

  render() {
    this.container.className = 'col-mid';
    this.container.innerHTML = '';

    this.canvasArea = el('div', 'canvas-area');
    this.canvasImg = el('div', 'canvas-img', { id: 'canvas' });
    this.canvasImg.addEventListener('mousedown', e => this.startL(e));
    this.canvasImg.addEventListener('mousemove', e => this.moveL(e));
    this.canvasImg.addEventListener('mouseup', e => this.endL(e));

    // 画布占位区：整块可点击上传 / 拖拽
    this.cph = this._createPlaceholder();
    this.canvasImg.appendChild(this.cph);

    this.lEl = el('div', 'lasso-ring', { id: 'lEl', style: 'display:none' });
    this.lLbl = el('div', 'lasso-lbl', { id: 'lLbl', text: '区域 prompt', style: 'display:none' });
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);

    this.canvasArea.appendChild(this.canvasImg);
    this.container.appendChild(this.canvasArea);

    this.toolbar = el('div', 'canvas-toolbar');

    this.btnSel = el('button', 'tool-btn', { id: 'btnSel', onclick: () => this.setTool('sel') });
    const selIcon = iconSvg(13, 13, [
      svgEl('path', { d: 'M2 2l4 10 2-4 4-2L2 2z', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnSel.appendChild(selIcon);
    this.btnSel.appendChild(document.createTextNode('选择'));

    this.btnLas = el('button', 'tool-btn active', { id: 'btnLas', onclick: () => this.setTool('las') });
    const lasIcon = iconSvg(13, 13, [
      svgEl('circle', { cx: '7', cy: '7', r: '5', 'stroke-dasharray': '2 1.5', stroke: 'currentColor', 'stroke-width': '1.5' }),
      svgEl('path', { d: 'M7 12v1.5M11 7h1.5', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnLas.appendChild(lasIcon);
    this.btnLas.appendChild(document.createTextNode('画圈'));

    this.toolbar.appendChild(this.btnSel);
    this.toolbar.appendChild(this.btnLas);
    this.toolbar.appendChild(el('div', 'sflex'));
    this.tHint = el('span', '', {
      id: 'tHint',
      text: '拖拽画圈以标注区域',
      style: 'font-size:11px;color:var(--color-text-tertiary)'
    });
    this.toolbar.appendChild(this.tHint);
    this.container.appendChild(this.toolbar);
  }

  /**
   * Create the full placeholder element (with icon, text, and file input).
   * Returns the cph element (hidden by default).
   */
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
    cph.addEventListener('dragover', (e) => { e.preventDefault(); cph.classList.add('drag-over'); });
    cph.addEventListener('dragleave', () => cph.classList.remove('drag-over'));
    cph.addEventListener('drop', (e) => {
      e.preventDefault();
      cph.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this._handleCanvasImageFile(e.dataTransfer.files[0]);
    });

    return cph;
  }

  setTool(t) {
    this.tool = t;
    this.btnSel.classList.toggle('active', t === 'sel');
    this.btnLas.classList.toggle('active', t === 'las');
    this.tHint.textContent = t === 'las' ? '拖拽画圈以标注区域' : '点击选择区域';
    this.canvasImg.style.cursor = t === 'las' ? 'crosshair' : 'default';
  }

  startL(e) {
    if (this.tool !== 'las') return;
    this.lassoing = true;
    const r = this.canvasImg.getBoundingClientRect();
    this.lx = e.clientX - r.left;
    this.ly = e.clientY - r.top;
    this.lEl.style.display = 'block';
    this.lEl.style.left = this.lx + 'px';
    this.lEl.style.top = this.ly + 'px';
    this.lEl.style.width = '0';
    this.lEl.style.height = '0';
    this.lLbl.style.display = 'none';
  }

  moveL(e) {
    if (!this.lassoing) return;
    const r = this.canvasImg.getBoundingClientRect();
    const sz = Math.max(
      Math.abs(e.clientX - r.left - this.lx),
      Math.abs(e.clientY - r.top - this.ly)
    );
    this.lEl.style.left = (this.lx - sz / 2) + 'px';
    this.lEl.style.top = (this.ly - sz / 2) + 'px';
    this.lEl.style.width = sz + 'px';
    this.lEl.style.height = sz + 'px';
  }

  endL(_e) {
    if (!this.lassoing) return;
    this.lassoing = false;
    if (parseFloat(this.lEl.style.width) > 20) {
      this.lLbl.style.display = 'block';
      this.lLbl.style.left = (parseFloat(this.lEl.style.left) + parseFloat(this.lEl.style.width) / 2 - 30) + 'px';
      this.lLbl.style.top = (parseFloat(this.lEl.style.top) - 20) + 'px';
      if (this.onLassoDone) this.onLassoDone();
    } else {
      this.lEl.style.display = 'none';
    }
  }

  _handleCanvasImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showWarningToast('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      this.setCanvasImage(dataUrl);
      if (this.onCanvasImage) this.onCanvasImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  setCanvasImage(dataUrl) {
    if (!dataUrl) return;
    this._isShowingUserImage = true;
    this._userImageDataUrl = dataUrl;
    if (this.cph) this.cph.style.display = 'none';
    this.canvasImg.style.backgroundImage = 'none';
    this.canvasImg.innerHTML = '';
    this.canvasImg.innerHTML = `<img src="${dataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:var(--border-radius-lg)" />`;

    // Delete button
    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (this.onClearCanvas) this.onClearCanvas();
      }
    });
    this.canvasImg.appendChild(delBtn);

    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);
    this.cph = this._createPlaceholder();
    this.cph.style.display = 'none';  // 已有图片，占位区隐藏
    this.canvasImg.appendChild(this.cph);
  }

  isShowingUserImage() {
    return this._isShowingUserImage;
  }

  getUserImageDataUrl() {
    return this._userImageDataUrl;
  }

  clear() {
    this.canvasImg.innerHTML = '';
    this.canvasImg.style.backgroundImage = 'none';
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';
    this.canvasImg.appendChild(this.cph);
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);
    this.cph.style.display = 'flex';
    this.lEl.style.display = 'none';
    this.lLbl.style.display = 'none';
  }

  showHistory(i) {
    this.currentHistory = i;
    if (i !== 0) {
      this.lEl.style.display = 'none';
      this.lLbl.style.display = 'none';
    }
  }

  /**
   * 加载版本内容到画布
   * @param {ImageResult|Object|string} imageResult
   *   - { type:'svg', svg:string } → 内嵌 SVG
   *   - { type:'raster', dataUrl:string } → 内嵌 <img>
   *   - 纯字符串（向后兼容） → 当作 SVG 处理
   */
  loadVersion(imageResult) {
    this._isShowingUserImage = false;
    this._userImageDataUrl = '';
    if (this.cph) this.cph.style.display = 'none';
    this.canvasImg.style.backgroundImage = 'none';
    this.canvasImg.innerHTML = '';

    // 类型判断（向后兼容纯 SVG 字符串）
    if (typeof imageResult === 'string') {
      imageResult = { type: 'svg', svg: imageResult };
    }

    if (imageResult && imageResult.type === 'raster' && imageResult.dataUrl) {
      // 光栅图：用 <img> 标签内嵌
      this.canvasImg.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
        <img src="${imageResult.dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px" />
      </div>`;
    } else if (imageResult && imageResult.svg && isValidSvg(imageResult.svg)) {
      this.canvasImg.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" preserveAspectRatio="xMidYMid meet">${imageResult.svg}</svg>`;
    } else {
      showWarningToast('生成结果无法显示，请检查 API 配置或模型');
      this.canvasImg.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-tertiary);font-size:12px;text-align:center;padding:16px">
        ⚠ 生成结果无法显示<br>请检查 API 配置或模型
      </div>`;
    }

    // Delete button (for all display types)
    const delBtn = el('button', 'canvas-img-delete', {
      html: '×',
      title: '清除画布图片',
      onclick: () => {
        this.clear();
        if (this.onClearCanvas) this.onClearCanvas();
      }
    });
    this.canvasImg.appendChild(delBtn);

    // 重新挂载套索层 + 占位符
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);
    this.cph = this._createPlaceholder();
    this.cph.style.display = 'none';  // loadVersion 已有内容，占位区隐藏
    this.canvasImg.appendChild(this.cph);
  }
}