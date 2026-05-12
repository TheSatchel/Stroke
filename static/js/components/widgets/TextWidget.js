/**
 * TextWidget.js — 文本输入控件
 * 支持单行 (input) 和多行 (textarea)
 *
 * 每个 widget 渲染结构：
 *   <div class="widget-body">
 *     <p class="widget-describe">描述文字</p>
 *     <input class="widget-text" />  或  <textarea class="widget-text widget-textarea"></textarea>
 *   </div>
 */

import { el } from '../../utils/DOM.js';

export default class TextWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
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
    const isMulti = this.config.multiline === true;
    const tag = isMulti ? 'textarea' : 'input';
    const attrs = {
      placeholder: this.config.placeholder || '',
      value: this.config.defaultValue || '',
    };
    if (isMulti) {
      attrs.rows = this.config.rows || 4;
    } else {
      attrs.type = 'text';
    }
    if (this.config.maxLength) {
      attrs.maxlength = this.config.maxLength;
    }
    this.el = el(tag, isMulti ? 'widget-text widget-textarea' : 'widget-text', attrs);
    this.el.addEventListener('input', () => {
      if (this._onChange) this._onChange(this.getValue());
    });
    body.appendChild(this.el);

    this.container.appendChild(body);
  }

  getValue() {
    return this.el ? this.el.value.trim() : (this.config.defaultValue || '');
  }

  setValue(v) {
    if (this.el) this.el.value = v;
  }

  onChange(fn) {
    this._onChange = fn;
  }
}