/**
 * ImageWidget.js — 图片上传控件
 * 支持拖拽 / 点击上传，base64 存储，缩略图预览
 *
 * 继承自 AbstractImageWidget，只添加文件上传逻辑。
 */

import { el } from '../utils.js';
import AbstractImageWidget from './AbstractImageWidget.js';

export default class ImageWidget extends AbstractImageWidget {
  constructor(container, config) {
    super(container, config);
    this._readonly = false;
  }

  _populateDropzone(dropzone) {
    dropzone.appendChild(el('span', 'widget-image-dz-text', { text: '📷 点击或拖拽上传参考图片' }));

    this.fileInput = el('input', '', {
      type: 'file',
      accept: 'image/*',
      style: 'display:none'
    });
    this.fileInput.addEventListener('change', (e) => this._handleFile(e.target.files[0]));
    dropzone.appendChild(this.fileInput);

    dropzone.addEventListener('click', () => this.fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0]);
    });
  }

  _handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB');
      return;
    }
    const fileName = file.name || '(未知)';
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
    console.log('[ImageWidget] 收到文件:', fileName, fileSizeMB + 'MB', file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const dataUrlMB = (dataUrl.length / 1024 / 1024).toFixed(1);
      console.log('[ImageWidget] base64 编码完成:', dataUrlMB + 'MB', '前缀:', dataUrl.substring(0, 50));
      // 若 base64 超过 3MB，自动压缩；否则直接用原图
      if (dataUrl && dataUrl.length > 3 * 1024 * 1024) {
        console.log('[ImageWidget] 图片过大 (' + dataUrlMB + 'MB)，自动压缩');
        this._compressAndStore(dataUrl);
      } else {
        this._value = dataUrl;
        console.log('[ImageWidget] 已存储，_value 长度:', this._value.length, 'this.config.id:', this.config?.id);
        this._showPreview(dataUrl);
        if (this._onChange) this._onChange(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * 压缩图片：长边限制 1920px，JPEG quality 0.85
   * 确保 base64 编码后的 data URL 不超过约 2–3MB
   */
  _compressAndStore(dataUrl) {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1920;
      let w = img.width;
      let h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.85);
      console.log('[ImageWidget] 压缩完成: ' + (compressed.length / 1024 / 1024).toFixed(1) + 'MB');
      this._value = compressed;
      this._showPreview(compressed);
      if (this._onChange) this._onChange(compressed);
    };
    img.src = dataUrl;
  }

  _clearImage() {
    super._clearImage();
    if (this.fileInput) this.fileInput.value = '';
  }
}