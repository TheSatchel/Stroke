/**
 * ConfigModal.js — 配置管理二级模态框
 *
 * 由 SettingsModal 中的「管理配置」按钮打开。
 * 管理所有模型配置：adapter 选择、动态参数、模型 ID 等。
 *
 * 一份配置数据结构：
 *   { id, name, adapter, apiKey, endpoint, model, fallbackModel, params: {...} }
 */

import { el } from './utils.js';
import { loadConfigs, saveConfigs } from '../storage.js';
import { widgetRegistry } from './ConfigTabs.js';

export default class ConfigModal {
  constructor(generator) {
    this.generator = generator || null;
    /** 当前编辑的配置 id（null 表示新建） */
    this._editingId = null;
    /** 动态参数 widgets Map<paramName, widgetInstance> */
    this._paramWidgets = new Map();
    /** 当前选中的模型 */
    this._currentModel = '';
    this._currentFallbackModel = null;
    /** 外部通知：配置变更 */
    this.onConfigsChanged = null;
    this._render();
  }

  // ================================================================
  //  渲染（只执行一次）
  // ================================================================
  _render() {
    // overlay
    this.overlay = el('div', 'overlay hidden', { id: 'configModalOverlay', style: 'z-index:1002' });
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

    this.modal = el('div', 'settings-modal', { style: 'max-width:520px' });
    this.modal.addEventListener('click', e => e.stopPropagation());

    // header
    const hdr = el('div', 'sm-header');
    hdr.appendChild(el('span', 'sm-title', { text: '配置管理' }));
    hdr.appendChild(el('button', 'sm-close', { text: '×', onclick: () => this.close() }));
    this.modal.appendChild(hdr);

    const body = el('div', 'sm-body');
    const self = this;

    // --- 配置选择 ---
    const fCfg = el('div', 'sm-field');
    fCfg.appendChild(el('div', 'sm-label', { text: '配置' }));
    const cfgRow = el('div', 'sm-preset-row');
    this.configSelect = el('select', 'sm-input sm-preset-select');
    this.configSelect.innerHTML = '<option value="">— 新建配置 —</option>';
    this.configSelect.addEventListener('change', () => {
      const val = self.configSelect.value;
      if (val) {
        const configs = loadConfigs();
        const cfg = configs.find(c => c.id === val);
        if (cfg) self._loadConfig(cfg);
      } else {
        self._resetForm();
      }
    });
    cfgRow.appendChild(this.configSelect);
    cfgRow.appendChild(el('button', 'sm-preset-save-btn', {
      text: '保存',
      onclick: () => self._saveCurrentConfig()
    }));
    cfgRow.appendChild(el('button', 'sm-preset-del-btn', {
      text: '删除',
      onclick: () => {
        const val = self.configSelect.value;
        if (!val) return;
        if (!confirm('确定删除此配置？')) return;
        const configs = loadConfigs().filter(c => c.id !== val);
        saveConfigs(configs);
        self._refreshConfigSelect();
        self._resetForm();
        if (self.onConfigsChanged) self.onConfigsChanged(configs);
      }
    }));
    fCfg.appendChild(cfgRow);
    body.appendChild(fCfg);

    // --- 名称 ---
    const fName = el('div', 'sm-field');
    fName.appendChild(el('div', 'sm-label', { text: '配置名称' }));
    this.nameInput = el('input', 'sm-input', { type: 'text', placeholder: '例如：主力Banana' });
    fName.appendChild(this.nameInput);
    body.appendChild(fName);

    // --- API 提供商 ---
    const fProv = el('div', 'sm-field');
    fProv.appendChild(el('div', 'sm-label', { text: 'API 提供商' }));
    this.provSelect = el('select', 'sm-input');
    const providers = this.generator ? this.generator.getProviders() : [];
    if (providers.length === 0) {
      this.provSelect.innerHTML = '<option value="">无可用平台</option>';
    } else {
      this.provSelect.innerHTML = providers.map(p =>
        '<option value="' + p.id + '">' + p.label + '</option>'
      ).join('');
    }
    this.provSelect.addEventListener('change', () => self._provChange());
    fProv.appendChild(this.provSelect);
    body.appendChild(fProv);

    // --- API Key ---
    const fKey = el('div', 'sm-field');
    fKey.appendChild(el('div', 'sm-label', { text: 'API Key' }));
    this.apiKeyInput = el('input', 'sm-input', { type: 'password', placeholder: 'sk-...' });
    fKey.appendChild(this.apiKeyInput);
    body.appendChild(fKey);

    // --- 端点 URL ---
    const fEp = el('div', 'sm-field');
    fEp.appendChild(el('div', 'sm-label', { text: 'API 端点 URL' }));
    this.endpointInput = el('input', 'sm-input', { type: 'text', placeholder: 'https://api.example.com/v1' });
    fEp.appendChild(this.endpointInput);
    body.appendChild(fEp);

    // --- 模型设置（Hint + 按钮打开 SubModal） ---
    const fModel = el('div', 'sm-field');
    fModel.appendChild(el('div', 'sm-label', { text: '模型' }));
    const modelRow = el('div', '', { style: 'display:flex;align-items:center;gap:8px' });
    this.modelHint = el('div', 'sm-hint', { text: '当前：未选择', style: 'flex:1' });
    modelRow.appendChild(this.modelHint);
    modelRow.appendChild(el('button', 'sm-btn-sec', {
      text: '选择模型',
      style: 'white-space:nowrap',
      onclick: () => self._createModelSubModal()
    }));
    fModel.appendChild(modelRow);
    body.appendChild(fModel);

    // --- 动态参数区 ---
    this.dynamicParamsContainer = el('div', 'sm-dynamic-params', { style: 'display:none' });
    body.appendChild(this.dynamicParamsContainer);

    this.modal.appendChild(body);

    // footer
    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => self.close() }));
    footer.appendChild(el('button', 'sm-btn-pri', {
      text: '确定',
      onclick: () => {
        self._saveCurrentConfig();
        self.close();
      }
    }));
    this.modal.appendChild(footer);

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);
  }

  // ================================================================
  //  打开 / 关闭
  // ================================================================
  open() {
    this.overlay.classList.remove('hidden');
    this._refreshConfigSelect();
    // 如果已有配置，加载第一个；否则新建
    const configs = loadConfigs();
    if (configs.length > 0 && !this._editingId) {
      this._loadConfig(configs[0]);
      this.configSelect.value = configs[0].id;
    } else if (configs.length === 0) {
      // 无已有配置时，显式初始化表单（填充默认端点、模型等）
      this._resetForm();
    }
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  // ================================================================
  //  提供商变更 → 刷新动态参数区 & 模型
  // ================================================================
  _provChange() {
    const v = this.provSelect.value;
    const Cls = this.generator ? this.generator.getProviderClass(v) : null;

    // 端点默认值
    if (Cls && Cls.defaultEndpoint) {
      this.endpointInput.value = Cls.defaultEndpoint;
    } else {
      this.endpointInput.value = '';
    }

    // 模型列表
    const providers = this.generator ? this.generator.getProviders() : [];
    let allModels = [];
    for (let i = 0; i < providers.length; i++) {
      if (providers[i].id === v) { allModels = providers[i].models || []; break; }
    }

    // 更新当前模型默认值（仅当为空时才自动选择；保留用户自定义模型名）
    if (allModels.length > 0) {
      const defaultModel = Cls ? Cls.defaultModel : allModels[0].id;
      if (!this._currentModel) {
        this._currentModel = defaultModel;
      }
      // 不再清除不在列表中的 fallbackModel，因为它可能是用户自定义名称
    } else {
      // 无模型列表时，不清空已有值，允许用户继续使用自定义名称
      if (!this._currentModel) {
        this._currentModel = '';
      }
      if (!this._currentFallbackModel) {
        this._currentFallbackModel = null;
      }
    }
    this._updateModelHint();

    // 动态参数区
    this._renderDynamicParams(Cls);
  }

  // ================================================================
  //  模型 SubModal
  // ================================================================
  _createModelSubModal() {
    const existing = document.getElementById('configModelSubOverlay');
    if (existing) existing.remove();

    const self = this;
    const overlay = el('div', 'overlay', { id: 'configModelSubOverlay', style: 'z-index:1003' });
    overlay.classList.remove('hidden');

    const modal = el('div', 'settings-modal', { style: 'max-width:420px' });
    modal.addEventListener('click', e => e.stopPropagation());

    // header
    const hdr = el('div', 'sm-header');
    hdr.appendChild(el('span', 'sm-title', { text: '选择模型' }));
    hdr.appendChild(el('button', 'sm-close', { text: '×', onclick: () => overlay.remove() }));
    modal.appendChild(hdr);

    const body = el('div', 'sm-body');

    // 获取当前 provider 的模型
    const provId = self.provSelect ? self.provSelect.value : '';
    const providers = self.generator ? self.generator.getProviders() : [];
    let allModels = [];
    for (let i = 0; i < providers.length; i++) {
      if (providers[i].id === provId) { allModels = providers[i].models || []; break; }
    }

    // ---------- 主模型 ----------
    const fMain = el('div', 'sm-field');

    // 标签
    fMain.appendChild(el('div', 'sm-label', { text: '主模型' }));

    // radio 组
    const isMainPredefined = allModels.length > 0 && allModels.some(m => m.id === self._currentModel);
    const radioPredefined = el('input', '', { type: 'radio', name: 'mainModelType', value: 'predefined' });
    radioPredefined.checked = isMainPredefined;
    const radioCustom = el('input', '', { type: 'radio', name: 'mainModelType', value: 'custom' });
    radioCustom.checked = !isMainPredefined;

    const radioContainer = el('div', 'sm-radio-group');
    const labelPre = el('label', 'sm-radio-item');
    labelPre.appendChild(radioPredefined);
    labelPre.appendChild(el('span', '', { text: '从列表选择' }));
    const labelCus = el('label', 'sm-radio-item');
    labelCus.appendChild(radioCustom);
    labelCus.appendChild(el('span', '', { text: '自定义名称' }));
    radioContainer.appendChild(labelPre);
    radioContainer.appendChild(labelCus);
    fMain.appendChild(radioContainer);

    // 下拉菜单（predefined 时可见）
    const mainDropdown = el('select', 'sm-input sm-model-select-row');
    mainDropdown.style.display = isMainPredefined ? 'block' : 'none';
    mainDropdown.innerHTML = allModels.length === 0
      ? '<option value="">无可用模型</option>'
      : allModels.map(m => {
          const sel = (isMainPredefined && m.id === self._currentModel) ? ' selected' : '';
          return '<option value="' + m.id + '"' + sel + '>' + m.label + '</option>';
        }).join('');
    fMain.appendChild(mainDropdown);

    // 自定义输入（custom 时可见）
    const mainCustomInput = el('input', 'sm-input sm-model-select-row', {
      type: 'text',
      placeholder: '例如: gpt-4o-2024-11-20',
      value: !isMainPredefined && self._currentModel ? self._currentModel : ''
    });
    mainCustomInput.style.display = isMainPredefined ? 'none' : 'block';
    fMain.appendChild(mainCustomInput);

    // 切换逻辑
    radioPredefined.addEventListener('change', () => {
      mainDropdown.style.display = 'block';
      mainCustomInput.style.display = 'none';
    });
    radioCustom.addEventListener('change', () => {
      mainDropdown.style.display = 'none';
      mainCustomInput.style.display = 'block';
    });

    body.appendChild(fMain);

    // ---------- 备用模型 ----------
    const fFb = el('div', 'sm-field');

    fFb.appendChild(el('div', 'sm-label', { text: '备用模型 (Fallback)' }));

    const isFallbackPredefined = allModels.length > 0 && self._currentFallbackModel &&
      allModels.some(m => m.id === self._currentFallbackModel);
    const fbRadioPredefined = el('input', '', { type: 'radio', name: 'fbModelType', value: 'predefined' });
    fbRadioPredefined.checked = isFallbackPredefined || !self._currentFallbackModel;
    const fbRadioCustom = el('input', '', { type: 'radio', name: 'fbModelType', value: 'custom' });
    fbRadioCustom.checked = self._currentFallbackModel && !isFallbackPredefined;

    const fbRadioContainer = el('div', 'sm-radio-group');
    const fbLabelPre = el('label', 'sm-radio-item');
    fbLabelPre.appendChild(fbRadioPredefined);
    fbLabelPre.appendChild(el('span', '', { text: '从列表选择' }));
    const fbLabelCus = el('label', 'sm-radio-item');
    fbLabelCus.appendChild(fbRadioCustom);
    fbLabelCus.appendChild(el('span', '', { text: '自定义名称' }));
    fbRadioContainer.appendChild(fbLabelPre);
    fbRadioContainer.appendChild(fbLabelCus);
    fFb.appendChild(fbRadioContainer);

    // 下拉菜单
    const fbDropdown = el('select', 'sm-input sm-model-select-row');
    fbDropdown.style.display = fbRadioPredefined.checked ? 'block' : 'none';
    fbDropdown.innerHTML = '<option value="">无</option>' +
      allModels.map(m => {
        const sel = (isFallbackPredefined && m.id === self._currentFallbackModel) ? ' selected' : '';
        return '<option value="' + m.id + '"' + sel + '>' + m.label + '</option>';
      }).join('');
    fFb.appendChild(fbDropdown);

    // 自定义输入
    const fbCustomInput = el('input', 'sm-input sm-model-select-row', {
      type: 'text',
      placeholder: '例如: gpt-3.5-turbo',
      value: (!isFallbackPredefined && self._currentFallbackModel) ? self._currentFallbackModel : ''
    });
    fbCustomInput.style.display = fbRadioCustom.checked ? 'block' : 'none';
    fFb.appendChild(fbCustomInput);

    fbRadioPredefined.addEventListener('change', () => {
      fbDropdown.style.display = 'block';
      fbCustomInput.style.display = 'none';
    });
    fbRadioCustom.addEventListener('change', () => {
      fbDropdown.style.display = 'none';
      fbCustomInput.style.display = 'block';
    });

    fFb.appendChild(el('div', 'sm-hint', { text: '主模型出错时自动切换到备用模型重试' }));
    body.appendChild(fFb);

    // footer
    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => overlay.remove() }));
    footer.appendChild(el('button', 'sm-btn-pri', {
      text: '确定',
      onclick: () => {
        // 读取主模型
        if (radioPredefined.checked) {
          self._currentModel = mainDropdown.value;
        } else {
          self._currentModel = mainCustomInput.value.trim();
        }
        // 读取备用模型
        if (fbRadioPredefined.checked) {
          self._currentFallbackModel = fbDropdown.value || null;
        } else {
          const fbVal = fbCustomInput.value.trim();
          self._currentFallbackModel = fbVal || null;
        }
        self._updateModelHint();
        overlay.remove();
      }
    }));

    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  _updateModelHint() {
    if (!this.modelHint) return;
    let text = '当前：' + (this._currentModel || '未选择');
    if (this._currentFallbackModel) text += '  ·  备用：' + this._currentFallbackModel;
    this.modelHint.textContent = text;
  }

  // ================================================================
  //  动态参数渲染
  // ================================================================
  _renderDynamicParams(Cls) {
    this._clearDynamicParams();
    const configParams = Cls ? (Cls.configParams || []) : [];
    if (configParams.length === 0) {
      this.dynamicParamsContainer.style.display = 'none';
      return;
    }
    this.dynamicParamsContainer.style.display = 'block';

    // 折叠标签
    const summaryEl = el('div', 'sm-dynamic-summary', {
      text: '▸ 动态参数',
      style: 'cursor:pointer;font-weight:500;margin-bottom:8px;color:var(--color-text-secondary)'
    });
    const paramsWrap = el('div', 'sm-dynamic-wrap');
    summaryEl.addEventListener('click', () => {
      const collapsed = paramsWrap.style.display === 'none';
      paramsWrap.style.display = collapsed ? 'block' : 'none';
      summaryEl.textContent = collapsed ? '▾ 动态参数' : '▸ 动态参数';
    });
    this.dynamicParamsContainer.appendChild(summaryEl);
    this.dynamicParamsContainer.appendChild(paramsWrap);

    const self = this;
    for (const paramDef of configParams) {
      const wrapper = el('div', 'sm-field');
      wrapper.appendChild(el('div', 'sm-label', { text: paramDef.label || paramDef.name }));

      const widgetContainer = el('div', '');
      const WidgetClass = widgetRegistry[paramDef.type];
      if (WidgetClass) {
        const mockTabDef = {
          id: 'cfgparam_' + paramDef.name,
          title: paramDef.label || paramDef.name,
          describe: paramDef.describe || '',
          type: paramDef.type,
          defaultValue: paramDef.defaultValue,
          placeholder: paramDef.placeholder,
          min: paramDef.min,
          max: paramDef.max,
          step: paramDef.step,
          leftLabel: paramDef.leftLabel,
          rightLabel: paramDef.rightLabel,
          unit: paramDef.unit,
          options: paramDef.options,
          displayAs: paramDef.displayAs,
          multiline: paramDef.multiline,
          rows: paramDef.rows,
          maxLength: paramDef.maxLength
        };
        const widget = new WidgetClass(widgetContainer, mockTabDef);
        self._paramWidgets.set(paramDef.name, widget);
      } else {
        widgetContainer.appendChild(el('span', '', { text: '未知类型: ' + paramDef.type }));
      }
      wrapper.appendChild(widgetContainer);
      paramsWrap.appendChild(wrapper);
    }
  }

  _clearDynamicParams() {
    this._paramWidgets.clear();
    if (this.dynamicParamsContainer) this.dynamicParamsContainer.innerHTML = '';
  }

  // ================================================================
  //  配置 CRUD
  // ================================================================
  _resetForm() {
    this._editingId = null;
    if (this.nameInput) this.nameInput.value = '';
    if (this.apiKeyInput) this.apiKeyInput.value = '';
    if (this.endpointInput) this.endpointInput.value = '';
    this._currentModel = '';
    this._currentFallbackModel = null;
    this._updateModelHint();
    this._clearDynamicParams();
    this.dynamicParamsContainer.style.display = 'none';
    if (this.provSelect) this.provSelect.selectedIndex = 0;
    // 触发一次 provChange 填充默认端点
    this._provChange();
  }

  _loadConfig(cfg) {
    this._editingId = cfg.id;
    if (this.nameInput) this.nameInput.value = cfg.name || '';
    if (this.provSelect) this.provSelect.value = cfg.adapter || '';
    if (this.apiKeyInput) this.apiKeyInput.value = cfg.apiKey || '';
    if (this.endpointInput) this.endpointInput.value = cfg.endpoint || '';
    this._currentModel = cfg.model || '';
    this._currentFallbackModel = cfg.fallbackModel || null;
    this._updateModelHint();
    // 触发动态参数渲染，然后恢复值
    this._provChange();
    const self = this;
    setTimeout(() => {
      if (cfg.params) {
        for (const [name, widget] of self._paramWidgets) {
          if (cfg.params[name] !== undefined) {
            widget.setValue(cfg.params[name]);
          }
        }
      }
    }, 50);
  }

  _saveCurrentConfig() {
    const name = (this.nameInput ? this.nameInput.value.trim() : '') || '未命名配置';

    // 收集动态参数值
    const params = {};
    for (const [name, widget] of this._paramWidgets) {
      params[name] = widget.getValue();
    }

    const cfg = {
      id: this._editingId || ('cfg_' + Date.now()),
      name: name,
      adapter: this.provSelect ? this.provSelect.value : '',
      apiKey: this.apiKeyInput ? this.apiKeyInput.value : '',
      endpoint: this.endpointInput ? this.endpointInput.value : '',
      model: this._currentModel,
      fallbackModel: this._currentFallbackModel || null,
      params: params
    };

    const configs = loadConfigs();
    const idx = configs.findIndex(c => c.id === cfg.id);
    if (idx >= 0) {
      configs[idx] = cfg;
    } else {
      configs.push(cfg);
    }
    saveConfigs(configs);
    this._editingId = cfg.id;
    this._refreshConfigSelect();
    this.configSelect.value = cfg.id;

    if (this.onConfigsChanged) this.onConfigsChanged(configs);
  }

  _refreshConfigSelect() {
    if (!this.configSelect) return;
    const curVal = this.configSelect.value;
    this.configSelect.innerHTML = '<option value="">— 新建配置 —</option>';
    for (const c of loadConfigs()) {
      const sel = c.id === curVal ? ' selected' : '';
      this.configSelect.innerHTML += '<option value="' + c.id + '"' + sel + '>' + c.name + '</option>';
    }
  }

  // ================================================================
  //  对外获取值（给 SettingsModal / uis 统一读取）
  // ================================================================
  getActiveConfig() {
    const val = this.configSelect ? this.configSelect.value : '';
    if (!val) return null;
    return loadConfigs().find(c => c.id === val) || null;
  }
}