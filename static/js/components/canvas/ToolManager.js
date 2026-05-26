/**
 * ToolManager.js — 画布工具切换与工具栏渲染
 *
 * 管理工具栏按钮（选择/框选）、工具切换和提示文本。
 */
import { el, svgEl, iconSvg } from '../../utils/DOM.js';

export default class ToolManager {
  /**
   * @param {import('../Canvas.js').default} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;

    /** @type {HTMLButtonElement|null} */
    this.btnSel = null;

    /** @type {HTMLButtonElement|null} */
    this.btnLas = null;

    /** @type {HTMLElement|null} */
    this.tHint = null;

    /** @type {HTMLElement|null} */
    this.toolbar = null;
  }

  /**
   * 构建工具栏 DOM
   * @returns {HTMLElement}
   */
  buildToolbar() {
    const canvas = this._canvas;
    const wasmDisabled = canvas._segService.state === 'WASM_DISABLED';
    this.toolbar = el('div', 'canvas-toolbar');

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

    return this.toolbar;
  }

  /**
   * 切换当前工具
   * @param {string} t - 'sel' 或 'las'
   */
  setTool(t) {
    const canvas = this._canvas;
    canvas.tool = t;
    this.btnSel.classList.toggle('active', t === 'sel');
    this.btnLas.classList.toggle('active', t === 'las');
    this.tHint.textContent = t === 'las' ? '拖拽绘制多边形选区' : '点击图片选择区域';
    canvas.canvasImg.style.cursor = t === 'las' ? 'crosshair' : 'default';
    canvas._selManager.clearActiveSelection();
    canvas._selManager.hideConfirmBar();
  }

  /**
   * 更新选择按钮状态（根据分割服务状态）
   */
  updateSelectButtonState() {
    const canvas = this._canvas;
    const state = canvas._segService.state;
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
}
