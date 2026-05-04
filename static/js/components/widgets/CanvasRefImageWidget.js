/**
 * CanvasRefImageWidget.js — 画布参考图控件
 *
 * 显示用户从画布上传的参考图。与画布双向同步。
 * 不能手动上传（上传走画布），只能查看、移除、onChange 通知画布。
 */

import { el } from '../utils.js';

export default class CanvasRefImageWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this._value = config.defaultValue || '';
    this._onChange = null;
    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const body = el('div', 'widget-body');

    // describe
    if (this.config.describe) {
      body.appendChild(el('p', 'widget-describe', { text: this.config.describe }));
    }

    // 空状态：提示文字
    this.emptyState = el('div', 'canvas-ref-empty', {
      text: '画布上传的参考图将显示在这里',
      style: 'padding:12px;text-align:center;font-size:11px;color:var(--color-text-tertiary);border:1px dashed var(--color-border-secondary);border-radius:var(--border-radius-md)'
    });
    body.appendChild(this.emptyState);

    // 预览区（有图片时显示，不提供单独的删除按钮——删除由 tab ⋮ 菜单或画布 × 触发）
    this.preview = el('div', 'widget-image-preview', { style: 'display:none' });
    this.imgEl = el('img', 'widget-image-img', { alt: '画布参考图' });
    this.preview.appendChild(this.imgEl);
    body.appendChild(this.preview);

    this.container.appendChild(body);

    if (this._value) this._showPreview(this._value);
  }

  _showPreview(dataUrl) {
    this.imgEl.src = dataUrl;
    this.emptyState.style.display = 'none';
    this.preview.style.display = 'block';
  }

  _hidePreview() {
    this.imgEl.src = '';
    this.emptyState.style.display = 'block';
    this.preview.style.display = 'none';
  }

  // ================================================================
  //  公共 API
  // ================================================================
  getValue() {
    return this._value;
  }

  setValue(v) {
    this._value = v || '';
    if (this._value && this._value.startsWith('data:image/')) {
      this._showPreview(this._value);
    } else {
      this._hidePreview();
    }
  }

  onChange(fn) {
    this._onChange = fn;
  }
}