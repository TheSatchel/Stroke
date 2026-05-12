/**
 * RegionPromptWidget.js — 区域 Prompt 控件
 *
 * 渲染结构：
 *   widget-body
 *   ├── widget-describe          "选区 A — 输入该区域的处理方式"
 *   ├── 预览图区 (原图叠加半透明颜色 mask + 左上角代号)
 *   │   ├── <img> 原始图片
 *   │   ├── <canvas> mask 覆盖层
 *   │   └── × 移除按钮 (删除此 region_prompt)
 *   └── multiline <textarea>    用户输入
 *
 * getValue() 返回完整 prompt 段
 * getUserInput() 返回原始用户输入（供 segmentparser 指纹计算）
 */

import { el } from '../../utils/DOM.js';
import { generateMaskDataUrl } from '../../utils/MaskGenerator.js';

// hex → 中文颜色名映射
const COLOR_MAP = {
  '#3B82F6': '蓝色',
  '#E11D48': '红色',
  '#F59E0B': '橙色',
  '#10B981': '绿色',
  '#8B5CF6': '紫色',
  '#F97316': '橘色',
};

// 代号 → 序号映射
const LABEL_ORDINAL = {
  'A': '一', 'B': '二', 'C': '三', 'D': '四', 'E': '五',
  'F': '六', 'G': '七', 'H': '八', 'I': '九', 'J': '十',
};

export default class RegionPromptWidget {
  /**
   * @param {HTMLElement} container
   * @param {Object} config - tab 定义
   * @param {string} config.describe
   * @param {Object} config.data   - 自定义数据
   * @param {string} config.data.imageDataUrl
   * @param {Array}  config.data.points
   * @param {string} config.data.color
   * @param {string} config.data.label
   * @param {string} config.data.type - 'point' | 'lasso'
   * @param {number} config.data.canvasWidth
   * @param {number} config.data.canvasHeight
   */
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.label = config.data?.label || 'A';
    this.color = config.data?.color || '#3B82F6';
    this.points = config.data?.points || [];
    this._pointX = config.data?.x;
    this._pointY = config.data?.y;
    this.imageDataUrl = config.data?.imageDataUrl || '';
    this.type = config.data?.type || 'point';
    this.canvasWidth = config.data?.canvasWidth || 512;
    this.canvasHeight = config.data?.canvasHeight || 512;
    this._onChange = null;
    this._onRemove = null; // 被移除时的回调
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

    // 预览图区（原图 + mask 叠加）
    this._previewArea = el('div', 'region-preview-area', {
      style: 'position:relative;display:inline-block;max-width:100%;margin-bottom:8px;border-radius:6px;overflow:hidden;cursor:default;'
    });

    // 原图
    this._origImg = el('img', 'region-preview-img', {
      src: this.imageDataUrl,
      alt: '区域参考图',
      style: 'max-width:100%;max-height:200px;object-fit:contain;display:block;'
    });
    this._previewArea.appendChild(this._origImg);

    // mask canvas 覆盖层
    this._maskCanvas = el('canvas', 'region-preview-mask', {
      style: 'position:absolute;inset:0;pointer-events:none;'
    });
    this._previewArea.appendChild(this._maskCanvas);

    // 移除按钮
    const removeBtn = el('button', 'widget-image-remove region-preview-remove', {
      html: '×',
      title: '删除此选区',
      style: 'position:absolute;top:4px;right:4px;z-index:5;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;',
      onclick: () => {
        if (this._onRemove) this._onRemove();
      }
    });
    this._previewArea.appendChild(removeBtn);

    body.appendChild(this._previewArea);

    // multiline textarea
    this.textareaEl = el('textarea', 'widget-textarea region-prompt-textarea', {
      placeholder: '例如：换成红色的花',
      rows: 3,
      oninput: () => {
        if (this._onChange) this._onChange();
      }
    });
    this.textareaEl.style.cssText =
      'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--color-border-secondary);border-radius:var(--border-radius-md);background:var(--color-input-bg);color:var(--color-text);font-size:12px;resize:vertical;' +
      'min-height:56px;';
    body.appendChild(this.textareaEl);

    this.container.appendChild(body);

    // 延迟渲染 mask（等原图加载）
    if (this.imageDataUrl) {
      this._origImg.onload = () => this._renderMask();
      // 如果图片已缓存，onload 可能不触发
      if (this._origImg.complete) this._renderMask();
    }
  }

  // ================================================================
  //  Mask 渲染
  // ================================================================
  _renderMask() {
    const canvas = this._maskCanvas;
    const img = this._origImg;
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;

    if (!displayWidth || !displayHeight) return;

    canvas.width = displayWidth;
    canvas.height = displayHeight;
    const ctx = canvas.getContext('2d');

    // 缩放比例：从 canvas 容器坐标系 → 当前显示坐标系
    const scaleX = displayWidth / this.canvasWidth;
    const scaleY = displayHeight / this.canvasHeight;

    if (this.type === 'point') {
      // 圆形区域（以点为中心，半径 30px 缩放）
      const cx = (this._pointX ?? this.points[0]?.x ?? 0) * scaleX;
      const cy = (this._pointY ?? this.points[0]?.y ?? 0) * scaleY;
      const r = 30 * Math.min(scaleX, scaleY);

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(r, 8), 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = this.color + '59'; // alpha ~0.35
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 左上角标签
      this._drawLabel(ctx, this.label);

    } else if ((this.type === 'lasso' || this.type === 'segmentation') && this.points.length >= 3) {
      // 多边形
      ctx.beginPath();
      const p0 = this.points[0];
      ctx.moveTo(p0.x * scaleX, p0.y * scaleY);
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x * scaleX, this.points[i].y * scaleY);
      }
      ctx.closePath();
      ctx.fillStyle = this.color + '59';
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 左上角标签
      this._drawLabel(ctx, this.label);
    }
  }

  /**
   * 在 canvas 左上角绘制白色底 + 标签文字
   */
  _drawLabel(ctx, label) {
    const text = label;
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    const metrics = ctx.measureText(text);
    const tw = metrics.width;
    const th = 14;
    const pad = 6;
    const x = pad;
    const y = pad + th;

    // 白色背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(x - 2, y - th - 2, tw + 4, th + 6);

    // 文字
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(text, x, y);
  }

  // ================================================================
  //  颜色名翻译
  // ================================================================
  _colorToName(hex) {
    const upper = hex?.toUpperCase() || '';
    return COLOR_MAP[upper] || '蓝色';
  }

  // ================================================================
  //  形状描述（用于 prompt 生成）
  // ================================================================
  _buildShapeDescription() {
    if (this.type === 'segmentation') {
      return `代号 ${this.label} 所覆盖的"${this.config.data?.classLabel || '目标'}"类别区域`;
    }
    if (this.type === 'lasso') {
      return `代号 ${this.label} 在图片中所覆盖的封闭区域`;
    }
    if (this.type === 'point') {
      return `代号 ${this.label} 以该点为中心的小圆形区域`;
    }
    return `代号 ${this.label} 在图片中所覆盖的区域`;
  }

  // ================================================================
  //  公共 API
  // ================================================================
  /**
   * 返回完整的 prompt 段（用于发送给 AI）
   */
  getValue() {
    const userText = this.textareaEl?.value?.trim() || '';
    if (!userText) return '';

    const colorName = this._colorToName(this.color);
    const label = this.label;
    const shapeDesc = this._buildShapeDescription();

    return [
      `参考图片即为原图。`,
      `图片左上角标注了代号 ${label}，`,
      `代号 ${label} 所覆盖的半透明 ${colorName} 色蒙版区域即为需要修改的区域，`,
      `请对该区域做如下修改：${userText}。`,
      `要求：仅修改该代号所覆盖的区域内部，没有代号的部分（即蒙版未覆盖的区域）保持与原图完全一致；`,
      `修改后的区域边缘与原图的过渡应自然，看不出拼接痕迹；`,
      `原图上不能出现任何蒙版、色块、文字、箭头、标记框等覆盖物；`,
      `最终输出为一张干净的完整图片。`,
    ].join('');
  }

  /**
   * 返回原始用户输入（供 segmentparser 指纹计算）
   */
  getUserInput() {
    return this.textareaEl?.value?.trim() || '';
  }

  /**
   * 生成蒙版 PNG Data URL（用于 GPT Image Inpainting）
   * @param {number} [outputWidth=1024]
   * @param {number} [outputHeight=1024]
   * @returns {string} data:image/png;base64,...
   */
  getMaskDataUrl(outputWidth = 1024, outputHeight = 1024) {
    const pts = this.points && this.points.length >= 3 ? this.points : (this._pointX != null ? [{ x: this._pointX, y: this._pointY }] : []);
    return generateMaskDataUrl(
      pts,
      this.canvasWidth,
      this.canvasHeight,
      outputWidth,
      outputHeight
    );
  }

  /**
   * 全局引导语（用于 Inpainting 模式的 System/前置说明，可选）
   * 若 adapter 需要包装用户 prompt，可在此提供
   */
  getIntroPrompt() {
    return '你将收到一张原图（image）和一张蒙版图（mask），' +
      '蒙版图中的白色区域是需要重新生成的部分，黑色/透明区域必须完全保持不变。' +
      '请根据 prompt 描述仅修改白色蒙版区域内的内容。';
  }

  setValue(v) {
    if (this.textareaEl) {
      this.textareaEl.value = v || '';
    }
  }

  onChange(fn) {
    this._onChange = fn;
  }

  onRemove(fn) {
    this._onRemove = fn;
  }

  /**
   * 更新图片引用（当同一区域刷新图时）
   */
  updateImage(dataUrl) {
    this.imageDataUrl = dataUrl;
    if (this._origImg) {
      this._origImg.src = dataUrl;
      this._origImg.onload = () => this._renderMask();
      if (this._origImg.complete) this._renderMask();
    }
  }
}