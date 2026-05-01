/**
 * ChoiceWidget.js — 选择控件
 * 支持 dropdown（下拉）、toggle（开关）、radio（单选组）三种展示形式。
 *
 * 每个 widget 渲染结构：
 *   <div class="widget-body">
 *     <p class="widget-describe">描述文字</p>
 *     <select class="widget-choice" />          ← dropdown
 *     或  <input type="checkbox" class="widget-toggle" />  ← toggle（开关）
 *     或  <div class="widget-radio-group">...labels+radios</div>
 *   </div>
 */

import { el } from '../utils.js';

export default class ChoiceWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this._value = config.defaultValue ?? (config.options?.[0] ?? '');
    this._onChange = null;
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
    const display = this.config.displayAs || 'dropdown';

    if (display === 'toggle') {
      this._renderToggle(body);
    } else if (display === 'radio') {
      this._renderRadio(body);
    } else {
      this._renderDropdown(body);
    }

    this.container.appendChild(body);
  }

  /* -------- dropdown -------- */
  _renderDropdown(body) {
    this.el = el('select', 'widget-choice');
    (this.config.options || []).forEach((opt) => {
      const oe = el('option', '', { value: opt, text: opt });
      if (opt === this._value) oe.selected = true;
      this.el.appendChild(oe);
    });
    this.el.addEventListener('change', () => {
      this._value = this.el.value;
      if (this._onChange) this._onChange(this._value);
    });
    body.appendChild(this.el);
  }

  /* -------- toggle 开关 -------- */
  _renderToggle(body) {
    const row = el('label', 'toggle-row');

    this.labelEl = el('span', 'toggle-label', { text: this.config.toggleLabel || '开启' });
    row.appendChild(this.labelEl);

    const sw = el('span', 'toggle-switch');
    this.track = el('span', 'toggle-track');
    this.knob = el('span', 'toggle-knob');
    this.track.appendChild(this.knob);
    sw.appendChild(this.track);

    this.el = el('input', '', { type: 'checkbox', style: 'display:none' });
    if (this._value === true || this._value === 'on' || this._value === 'true') {
      this.el.checked = true;
      this.track.classList.add('on');
    }
    this.el.addEventListener('change', () => {
      this._value = this.el.checked;
      this.track.classList.toggle('on', this.el.checked);
      if (this._onChange) this._onChange(this._value);
    });
    sw.addEventListener('click', () => this.el.click());

    row.appendChild(this.el);
    row.appendChild(sw);
    body.appendChild(row);
  }

  /* -------- radio 组 -------- */
  _renderRadio(body) {
    const group = el('div', 'widget-radio-group');
    this.radios = [];
    (this.config.options || []).forEach((opt) => {
      const label = el('label', 'radio-item');
      const input = el('input', '', { type: 'radio', name: 'choice_' + this.config.id || 'choice_radio', value: opt });
      if (opt === this._value) input.checked = true;
      input.addEventListener('change', () => {
        if (input.checked) {
          this._value = opt;
          if (this._onChange) this._onChange(this._value);
        }
      });
      label.appendChild(input);
      label.appendChild(el('span', 'radio-label', { text: opt }));
      group.appendChild(label);
      this.radios.push(input);
    });
    this.el = group;
    body.appendChild(group);
  }

  /* -------- 公共接口 -------- */
  getValue() {
    if (this.config.displayAs === 'toggle') {
      return this.el ? this.el.checked : false;
    }
    if (this.config.displayAs === 'radio') {
      return this._value;
    }
    return this.el ? this.el.value : this._value;
  }

  setValue(v) {
    this._value = v;
    if (!this.el) return;
    if (this.config.displayAs === 'toggle') {
      this.el.checked = !!(v === true || v === 'on' || v === 'true');
      this.track?.classList.toggle('on', this.el.checked);
    } else if (this.config.displayAs === 'radio') {
      this.radios?.forEach((r) => { r.checked = (r.value === v); });
    } else {
      this.el.value = v;
    }
  }

  onChange(fn) {
    this._onChange = fn;
  }
}