/**
 * AbstractImageWidget.js — 抽象图片控件基类
 *
 * 包含图片预览/移除/值的核心逻辑、粘贴支持。
 * 子类负责提供图片来源（用户上传 vs 生成输出）。
 *
 * 渲染结构：
 *   <div class="widget-body">
 *     <p class="widget-describe">描述文字</p>
 *     <div class="widget-image-dropzone">  ← 无图片时
 *       <span>提示文字</span>
 *       {子类可注入额外元素}
 *     </div>
 *     <div class="widget-image-preview">    ← 有图片时
 *       <img src="data:..." />
 *       <button class="widget-image-remove">×</button>
 *     </div>
 *   </div>
 */

import { el } from '../../utils/DOM.js';
import { showWarningToast } from '../../utils/Toast.js';

export default class AbstractImageWidget {
  /**
   * @param {HTMLElement} container
   * @param {Object} config - tab 定义
   * @param {string} [config.describe] - 描述文本
   * @param {string} [config.defaultValue] - 初始 base64 值
   */
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this._value = config.defaultValue || '';
    this._onChange = null;
    /** 子类可设为 true 禁用用户上传（如生成的图片） */
    this._readonly = false;
    /** 深集成回调：图片数据变更时触发 (dataUrl) */
    this._onImageData = null;
    this._setupPasteListener();
    this.render();
  }

  // ================================================================
  //  渲染
  // ================================================================
  render() {
    this.container.innerHTML = '';
    const body = el('div', 'widget-body');

    // describe
    if (this.config.describe) {
      body.appendChild(el('p', 'widget-describe', { text: this.config.describe }));
    }

    // dropzone
    this.dropzone = el('div', 'widget-image-dropzone');
    this._populateDropzone(this.dropzone);
    body.appendChild(this.dropzone);

    // preview
    this.preview = el('div', 'widget-image-preview', { style: 'display:none' });
    this.imgEl = el('img', 'widget-image-img', { alt: '预览', draggable: 'false', style: '-webkit-user-drag:none;user-select:none' });
    this.preview.appendChild(this.imgEl);

    this.removeBtn = el('button', 'widget-image-remove', {
      html: '×',
      title: '移除图片',
      onclick: () => this._clearImage()
    });
    this.preview.appendChild(this.removeBtn);
    body.appendChild(this.preview);

    this.container.appendChild(body);

    if (this._value) this._showPreview(this._value);
  }

  /**
   * 激活全局粘贴监听：Ctrl+V 图片 → 存入 widget & 推送 onImageData
   */
  _setupPasteListener() {
    this._pasteHandler = (e) => {
      if (this._readonly) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          this._processFile(file);
          return;
        }
      }
    };
    document.addEventListener('paste', this._pasteHandler);
  }

  /**
   * 子类可重写的文件处理（默认读为 data URL）
   */
  _processFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      showWarningToast('图片大小不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this._storeImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 子类可重写此方法以在 dropzone 中添加内容。
   * 默认实现只添加提示文字。
   */
  _populateDropzone(dropzone) {
    dropzone.appendChild(el('span', 'widget-image-dz-text', { text: '📷 点击或拖拽上传参考图片' }));
  }

  // ================================================================
  //  预览 / 清除
  // ================================================================
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
    if (this._onChange) this._onChange('');
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
      this._clearImage();
    }
  }

  onChange(fn) {
    this._onChange = fn;
  }

  /**
   * 注册深集成回调：图片数据变更时触发
   */
  onImageData(fn) {
    this._onImageData = fn;
  }

  /**
   * 存储图片 data URL（子类/外部可调用）
   */
  _storeImage(dataUrl) {
    this._value = dataUrl;
    this._showPreview(dataUrl);
    if (this._onImageData) this._onImageData(dataUrl);
    if (this._onChange) this._onChange(dataUrl);
  }

  /**
   * 卸载全局监听
   */
  destroy() {
    if (this._pasteHandler) {
      document.removeEventListener('paste', this._pasteHandler);
      this._pasteHandler = null;
    }
  }
}