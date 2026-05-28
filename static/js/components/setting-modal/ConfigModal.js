/**
 * ConfigModal.js — 配置管理二级模态框
 *
 * 由 SettingsModal 中的「管理配置」按钮打开。
 * 管理所有模型配置：adapter 选择、动态参数、模型 ID 等。
 *
 * 拆分后：模型选择委托给 ModelSelectorModal，动态参数渲染委托给 DynamicParamsRenderer。
 */

import { el } from '../../utils/DOM.js';
import { loadConfigs, saveConfigs } from '../../locals/storage.js';
import { renderDynamicParams } from '../DynamicParamsRenderer.js';
import ModelSelectorModal from './ModelSelectorModal.js';

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
      onclick: () => self._openModelSelector()
    }));
    fModel.appendChild(modelRow);
    body.appendChild(fModel);

    // --- 动态参数区 （用共享渲染器）---
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
    const configs = loadConfigs();
    if (configs.length > 0 && !this._editingId) {
      this._loadConfig(configs[0]);
      this.configSelect.value = configs[0].id;
    } else if (configs.length === 0) {
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

    if (allModels.length > 0) {
      const defaultModel = Cls ? Cls.defaultModel : allModels[0].id;
      if (!this._currentModel) {
        this._currentModel = defaultModel;
      }
    } else {
      if (!this._currentModel) {
        this._currentModel = '';
      }
      if (!this._currentFallbackModel) {
        this._currentFallbackModel = null;
      }
    }
    this._updateModelHint();

    // 动态参数区 — 用共享渲染器
    this._renderDynamicParams(Cls);
  }

  // ================================================================
  //  模型选择
  // ================================================================
  _openModelSelector() {
    const provId = this.provSelect ? this.provSelect.value : '';
    const providers = this.generator ? this.generator.getProviders() : [];
    let allModels = [];
    for (let i = 0; i < providers.length; i++) {
      if (providers[i].id === provId) { allModels = providers[i].models || []; break; }
    }

    ModelSelectorModal.open({
      currentModel: this._currentModel,
      currentFallbackModel: this._currentFallbackModel,
      allModels,
      onConfirm: ({ model, fallbackModel }) => {
        this._currentModel = model;
        this._currentFallbackModel = fallbackModel;
        this._updateModelHint();
      }
    });
  }

  _updateModelHint() {
    if (!this.modelHint) return;
    let text = '当前：' + (this._currentModel || '未选择');
    if (this._currentFallbackModel) text += '  ·  备用：' + this._currentFallbackModel;
    this.modelHint.textContent = text;
  }

  // ================================================================
  //  动态参数渲染（委托给共享模块）
  // ================================================================
  _renderDynamicParams(Cls) {
    const configParams = Cls ? (Cls.configParams || []) : [];

    renderDynamicParams({
      container: this.dynamicParamsContainer,
      configParams,
      paramWidgets: this._paramWidgets,
      cssPrefix: 'sm',
      widgetIdPrefix: 'cfgparam_',
      suffix: '',
      summaryText: '动态参数',
      startExpanded: false
    });
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
    this._paramWidgets.clear();
    this.dynamicParamsContainer.innerHTML = '';
    this.dynamicParamsContainer.style.display = 'none';
    if (this.provSelect) this.provSelect.selectedIndex = 0;
    this._provChange();
  }

  _loadConfig(cfg) {
    this._editingId = cfg.id;
    if (this.nameInput) this.nameInput.value = cfg.name || '';
    if (this.provSelect) this.provSelect.value = cfg.adapter || '';
    if (this.apiKeyInput) this.apiKeyInput.value = cfg.apiKey || '';
    this._currentModel = cfg.model || '';
    this._currentFallbackModel = cfg.fallbackModel || null;
    this._updateModelHint();
    this._provChange();
    if (this.endpointInput) this.endpointInput.value = cfg.endpoint || '';
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
  //  对外获取值
  // ================================================================
  getActiveConfig() {
    const val = this.configSelect ? this.configSelect.value : '';
    if (!val) return null;
    return loadConfigs().find(c => c.id === val) || null;
  }
}