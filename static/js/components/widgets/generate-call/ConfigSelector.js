/**
 * ConfigSelector.js — 配置选择下拉 + 记忆上次所选
 *
 * 从 GenerateCallWidget._buildConfigSelector() / _populateConfigDropdown() / _saveLastConfig() 抽取。
 */

import { el } from '../../../utils/DOM.js';
import { loadConfigs, loadGcallConfigs, saveGcallConfigs } from '../../../locals/storage.js';

export default class ConfigSelector {
  /**
   * @param {object} widget - GenerateCallWidget 实例
   */
  constructor(widget) {
    this.widget = widget;
  }

  /**
   * 在 body 中渲染配置选择行
   * @param {HTMLElement} body
   */
  render(body) {
    const row = el('div', 'generate-call-config-row');

    const labelEl = el('span', 'generate-call-config-label', { text: '配置' });
    row.appendChild(labelEl);

    this.widget.configSelect = el('select', 'generate-call-config-select');
    this.populate();
    this.widget.configSelect.addEventListener('change', () => {
      this.widget._configId = this.widget.configSelect.value || null;
      this._saveLastConfig();
      this.widget._loadConfigAndRender();
      if (this.widget._onChange) this.widget._onChange(this.widget._configId);
    });
    row.appendChild(this.widget.configSelect);

    body.appendChild(row);
  }

  /**
   * 填充下拉选项
   */
  populate() {
    if (!this.widget.configSelect) return;
    const configs = loadConfigs();
    const curVal = this.widget._configId || '';
    this.widget.configSelect.innerHTML = '<option value="">— 无配置 —</option>';
    for (const c of configs) {
      const sel = c.id === this.widget._configId ? ' selected' : '';
      const label = c.name + ' (' + c.adapter + ')';
      this.widget.configSelect.innerHTML += '<option value="' + c.id + '"' + sel + '>' + label + '</option>';
    }
    this.widget.configSelect.value = curVal;
  }

  /**
   * 保存当前选中的配置 ID 到 localStorage
   */
  _saveLastConfig() {
    if (!this.widget.config || !this.widget.config.id) return;
    const map = loadGcallConfigs();
    if (this.widget._configId) {
      map[this.widget.config.id] = this.widget._configId;
    } else {
      delete map[this.widget.config.id];
    }
    saveGcallConfigs(map);
  }

  /**
   * 更新选中的配置 ID（外部调用）
   */
  setConfigId(value) {
    this.widget._configId = value || null;
    if (this.widget.configSelect) {
      this.widget.configSelect.value = value || '';
    }
    this._saveLastConfig();
    if (this.widget._onChange) this.widget._onChange(value);
  }
}