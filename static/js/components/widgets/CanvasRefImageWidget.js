/*
 * CanvasRefImageWidget.js — 画布参考图控件
 *
 * 继承 AbstractImageWidget。不能手动上传（上传走画布），
 * 空状态显示提示文字而非上传区域。
 */

import AbstractImageWidget from './AbstractImageWidget.js';

export default class CanvasRefImageWidget extends AbstractImageWidget {
  constructor(container, config) {
    super(container, config);
    this._readonly = true; // 禁止用户直接上传
    // 空状态改为提示文字
    this.dropzone.style.display = 'none';
    this.emptyState = document.createElement('div');
    this.emptyState.className = 'canvas-ref-empty';
    this.emptyState.style.cssText =
      'padding:12px;text-align:center;font-size:11px;' +
      'color:var(--color-text-tertiary);' +
      'border:1px dashed var(--color-border-secondary);' +
      'border-radius:var(--border-radius-md)';
    this.emptyState.textContent = '画布上传的参考图将显示在这里';
    // 插入到 preview 前面
    const body = this.container.querySelector('.widget-body');
    if (body) body.insertBefore(this.emptyState, this.preview);

    this.removeBtn.remove();

    // 修正初始显示状态
    if (this._value && this._value.startsWith('data:image/')) {
      this.emptyState.style.display = 'none';
    } else {
      this.emptyState.style.display = 'block';
      this.preview.style.display = 'none';
    }
  }

  _showPreview(dataUrl) {
    super._showPreview(dataUrl);
    if (this.emptyState) this.emptyState.style.display = 'none';
  }

  _clearImage() {
    super._clearImage();
    if (this.emptyState) this.emptyState.style.display = 'block';
    this.preview.style.display = 'none';
  }
}
