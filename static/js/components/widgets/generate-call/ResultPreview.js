/**
 * ResultPreview.js — 结果预览区 + 状态指示
 *
 * 从 GenerateCallWidget.setResult() / _clearResult() / setGenerating() / setDone() 抽取。
 */

import { el } from '../../../utils/DOM.js';
import { svgToBase64DataUrl } from '../../../adapters/ResponseParser.js';

export default class ResultPreview {
  /**
   * @param {object} widget - GenerateCallWidget 实例
   */
  constructor(widget) {
    this.widget = widget;
  }

  /**
   * 在 body 中渲染结果预览区
   * @param {HTMLElement} body
   */
  render(body) {
    this.widget.resultPreview = el('div', 'generate-call-result-preview', { style: 'display:none' });
    this.widget.resultImg = el('img', 'generate-call-result-img', { alt: '生成结果预览' });
    this.widget.resultPreview.appendChild(this.widget.resultImg);

    const statusRow = el('div', 'generate-call-status-row');
    this.widget.statusIndicator = el('span', 'generate-call-status', { text: '● 就绪' });
    statusRow.appendChild(this.widget.statusIndicator);

    this.widget.removeBtn = el('button', 'generate-call-result-remove', {
      html: 'x',
      title: '清除结果',
      style: 'display:none',
      onclick: () => this.clear()
    });
    statusRow.appendChild(this.widget.removeBtn);
    this.widget.resultPreview.appendChild(statusRow);

    body.appendChild(this.widget.resultPreview);
  }

  /**
   * 接收生成结果并按类型显示预览
   * @param {ImageResult} imageResult - { type:'svg', svg } | { type:'raster', dataUrl }
   * @param {string} [base64] - 预编码的 data URL
   */
  setResult(imageResult, base64) {
    this.widget._svgOutput = (imageResult && imageResult.type === 'svg') ? imageResult.svg : '';
    this.widget._resultBase64 = base64 || '';

    if (imageResult && imageResult.type === 'raster' && imageResult.dataUrl) {
      this.widget.resultImg.src = imageResult.dataUrl;
      this.widget.resultPreview.style.display = 'block';
      this.widget.statusIndicator.textContent = '● 已完成';
      this.widget.removeBtn.style.display = '';
    } else if (base64) {
      this.widget.resultImg.src = base64;
      this.widget.resultPreview.style.display = 'block';
      this.widget.statusIndicator.textContent = '● 已完成';
      this.widget.removeBtn.style.display = '';
    } else if (imageResult && imageResult.type === 'svg' && imageResult.svg) {
      const dataUrl = svgToBase64DataUrl(imageResult.svg);
      if (dataUrl) {
        this.widget.resultImg.src = dataUrl;
        this.widget.resultPreview.style.display = 'block';
        this.widget.statusIndicator.textContent = '● 已完成';
        this.widget.removeBtn.style.display = '';
      } else {
        console.warn('[GenerateCallWidget] SVG 转 base64 失败，尝试直接使用');
        this.widget.resultImg.src = imageResult.svg;
        this.widget.resultPreview.style.display = 'block';
        this.widget.statusIndicator.textContent = '⚠ 格式异常';
        this.widget.removeBtn.style.display = '';
      }
    }
  }

  clear() {
    this.widget._svgOutput = '';
    this.widget._resultBase64 = '';
    this.widget.resultImg.src = '';
    this.widget.resultPreview.style.display = 'none';
    this.widget.statusIndicator.textContent = '● 就绪';
    this.widget.removeBtn.style.display = 'none';
    if (this.widget._onChange) this.widget._onChange(null);
  }

  setGenerating() {
    this.widget.statusIndicator.textContent = '◌ 生成中...';
    this.widget.statusIndicator.classList.add('generating');
  }

  setProgress(segmentIndex, totalSegments) {
    this.widget.statusIndicator.textContent = '◌ 生成中 (' + (segmentIndex + 1) + '/' + totalSegments + ')...';
    this.widget.statusIndicator.classList.add('generating');
  }

  setRetrying(attempt, maxRetries) {
    this.widget.statusIndicator.textContent = '↻ 重试 (' + attempt + '/' + maxRetries + ')...';
    this.widget.statusIndicator.classList.add('generating');
  }

  setDone() {
    this.widget.statusIndicator.textContent = '● 已完成';
    this.widget.statusIndicator.classList.remove('generating');
  }
}