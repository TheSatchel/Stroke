/** *
 * ImageWidget.js — 图片上传控件
 * 支持拖拽 / 点击上传 / Ctrl+V 粘贴，base64 存储，缩略图预览
 *
 * 继承自 AbstractImageWidget，添加压缩逻辑。
 */

import { el } from '../../utils/DOM.js';
import { showWarningToast } from '../../utils/Toast.js';
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
    this.fileInput.addEventListener('change', (e) => this._processFile(e.target.files[0]));
    dropzone.appendChild(this.fileInput);

    dropzone.addEventListener('click', () => this.fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('widget-image-dropzone--dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('widget-image-dropzone--dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('widget-image-dropzone--dragover');
      if (e.dataTransfer.files[0]) this._processFile(e.dataTransfer.files[0]);
    });
  }

  /**
   * 覆盖父类 _processFile：先读取为 data URL，超过阈值则压缩，再存储
   */
  _processFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showWarningToast('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (dataUrl && dataUrl.length > 3 * 1024 * 1024) {
        this._compressAndStore(dataUrl);
      } else {
        this._storeImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * 压缩图片：长边限制 1920px，JPEG quality 0.85
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
      this._storeImage(compressed);
    };
    img.src = dataUrl;
  }

  /**
   * 覆盖父类 _storeImage：存储图片但不推送 onImageData（去除 canvas 联动）
   */
  _storeImage(dataUrl) {
    this._value = dataUrl;
    this._showPreview(dataUrl);
    if (this._onChange) this._onChange(dataUrl);
  }

  _clearImage() {
    super._clearImage();
    if (this.fileInput) this.fileInput.value = '';
  }
}
