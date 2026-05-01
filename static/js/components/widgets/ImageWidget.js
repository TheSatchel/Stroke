/**
 * ImageWidget.js — 图片上传控件
 * 支持拖拽 / 点击上传，base64 存储，缩略图预览
 *
 * 渲染结构：
 *   <div class="widget-body">
 *     <p class="widget-describe">描述文字</p>
 *     <div class="widget-image-dropzone">  ← 无图片时
 *       <span>点击或拖拽上传</span>
 *       <input type="file" hidden />
 *     </div>
 *     <div class="widget-image-preview">    ← 有图片时
 *       <img src="data:..." />
 *       <button class="widget-image-remove">×</button>
 *     </div>
 *   </div>
 */

import { el } from '../utils.js';

export default class ImageWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this._value = config.defaultValue || '';  // base64 data URL
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

    // dropzone (shown when no image)
    this.dropzone = el('div', 'widget-image-dropzone');
    const dzText = el('span', 'widget-image-dz-text', { text: '📷 点击或拖拽上传参考图片' });
    this.dropzone.appendChild(dzText);

    this.fileInput = el('input', '', {
      type: 'file',
      accept: 'image/*',
      style: 'display:none'
    });
    this.fileInput.addEventListener('change', (e) => this._handleFile(e.target.files[0]));
    this.dropzone.appendChild(this.fileInput);

    this.dropzone.addEventListener('click', () => this.fileInput.click());
    this.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropzone.classList.add('drag-over'); });
    this.dropzone.addEventListener('dragleave', () => this.dropzone.classList.remove('drag-over'));
    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0]);
    });

    body.appendChild(this.dropzone);

    // preview (shown when image loaded)
    this.preview = el('div', 'widget-image-preview', { style: 'display:none' });
    this.imgEl = el('img', 'widget-image-img', { alt: '预览' });
    this.preview.appendChild(this.imgEl);

    this.removeBtn = el('button', 'widget-image-remove', {
      html: '×',
      title: '移除图片',
      onclick: () => this._clearImage()
    });
    this.preview.appendChild(this.removeBtn);
    body.appendChild(this.preview);

    this.container.appendChild(body);

    // restore existing value
    if (this._value) this._showPreview(this._value);
  }

  _handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    // 限制 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this._value = reader.result;
      this._showPreview(this._value);
      if (this._onChange) this._onChange(this._value);
    };
    reader.readAsDataURL(file);
  }

  _showPreview(dataUrl) {
    this.imgEl.src = dataUrl;
    this.dropzone.style.display = 'none';
    this.preview.style.display = 'block';
  }

  _clearImage() {
    this._value = '';
    this.imgEl.src = '';
    this.dropzone.style.display = 'flex';
    this.preview.style.display = 'none';
    this.fileInput.value = '';
    if (this._onChange) this._onChange('');
  }

  getValue() {
    return this._value;
  }

  setValue(v) {
    this._value = v || '';
    if (this._value && this._value.startsWith('data:image/')) {
      this._showPreview(this._value);
    } else {
      this._clearImage();
    }
  }

  onChange(fn) {
    this._onChange = fn;
  }
}