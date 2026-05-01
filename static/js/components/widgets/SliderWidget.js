/**
 * SliderWidget.js — 自定义拉杆控件
 * 轨道中间一个圆形把手，左右可拖动，两端显示自定义标签。
 *
 * 每个 widget 渲染结构：
 *   <div class="widget-body">
 *     <p class="widget-describe">描述文字</p>
 *     <div class="slider-row">
 *       <span class="slider-label slider-label-left">左标签</span>
 *       <div class="slider-track">
 *         <div class="slider-fill"></div>
 *         <div class="slider-thumb"></div>
 *       </div>
 *       <span class="slider-label slider-label-right">右标签</span>
 *       <span class="slider-value">当前值</span>
 *     </div>
 *   </div>
 */

import { el } from '../utils.js';

export default class SliderWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.min = config.min ?? 0;
    this.max = config.max ?? 100;
    this.step = config.step ?? 1;
    this._value = config.defaultValue ?? this.min;
    this._onChange = null;
    this._dragging = false;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    const body = el('div', 'widget-body');

    // ---- describe 字段 ----
    if (this.config.describe) {
      body.appendChild(el('p', 'widget-describe', { text: this.config.describe }));
    }

    // ---- 控件字段 ----
    const row = el('div', 'slider-row');

    // 左标签
    if (this.config.leftLabel) {
      row.appendChild(el('span', 'slider-label slider-label-left', { text: this.config.leftLabel }));
    }

    // 轨道 + 填充 + 把手
    this.track = el('div', 'slider-track');
    this.fill = el('div', 'slider-fill');
    this.thumb = el('div', 'slider-thumb');
    this.track.appendChild(this.fill);
    this.track.appendChild(this.thumb);
    row.appendChild(this.track);

    // 右标签
    if (this.config.rightLabel) {
      row.appendChild(el('span', 'slider-label slider-label-right', { text: this.config.rightLabel }));
    }

    // 当前值显示
    const unit = this.config.unit || '';
    this.valDisplay = el('span', 'slider-value', { text: this._value + unit });
    row.appendChild(this.valDisplay);

    this._bindDrag();
    body.appendChild(row);
    this.container.appendChild(body);

    requestAnimationFrame(() => this._updatePosition());
  }

  /* -------- 拖动逻辑 -------- */
  _bindDrag() {
    const onDown = (e) => {
      if (this._dragging) return;
      this._dragging = true;
      this.thumb.classList.add('active');
      this._move(e);
    };

    const onMove = (e) => {
      if (!this._dragging) return;
      this._move(e);
    };

    const onUp = () => {
      if (!this._dragging) return;
      this._dragging = false;
      this.thumb.classList.remove('active');
    };

    this.thumb.addEventListener('mousedown', onDown);
    this.thumb.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e.touches[0]); });
    this.track.addEventListener('mousedown', onDown);
    this.track.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e.touches[0]); });

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e.touches[0]); }, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
  }

  _move(e) {
    const rect = this.track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const raw = this.min + ratio * (this.max - this.min);
    const stepped = Math.round(raw / this.step) * this.step;
    const val = Math.max(this.min, Math.min(this.max, stepped));
    if (val !== this._value && !isNaN(val)) {
      this._value = val;
      this._updatePosition();
      if (this._onChange) this._onChange(val);
    }
  }

  _updatePosition() {
    const ratio = (this._value - this.min) / (this.max - this.min);
    const pct = ratio * 100;
    this.fill.style.width = pct + '%';
    this.thumb.style.left = pct + '%';
    const unit = this.config.unit || '';
    this.valDisplay.textContent = this._value + unit;
  }

  /* -------- 公共接口 -------- */
  getValue() {
    return this._value;
  }

  setValue(v) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    this._updatePosition();
  }

  onChange(fn) {
    this._onChange = fn;
  }
}