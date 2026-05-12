/**
 * GenerateCallWidget.js — 生成调用触发器 + 结果预览控件
 *
 * 既是触发点也是生成结果容器。
 * 多个 generate_call 时，上一个的输出图自动传给下一个作为参考图。
 *
 * 拆分后：配置选择委托给 ConfigSelector，结果预览委托给 ResultPreview，
 * 动态参数渲染委托给共享的 DynamicParamsRenderer。
 */

import { el } from '../../../utils/DOM.js';
import { loadConfigs, loadGcallConfigs } from '../../../locals/storage.js';
import { renderDynamicParams } from '../../DynamicParamsRenderer.js';
import ConfigSelector from './ConfigSelector.js';
import ResultPreview from './ResultPreview.js';

export default class GenerateCallWidget {
  constructor(container, config, configId) {
    this.container = container;
    this.config = config;
    /** 当前选中的配置 ID */
    this._configId = configId || (config && config.configId) || null;
    if (!this._configId && config && config.id) {
      const savedMap = loadGcallConfigs();
      if (savedMap[config.id]) {
        this._configId = savedMap[config.id];
      }
    }
    this._onChange = null;
    this._svgOutput = '';
    this._resultBase64 = '';
    this._paramWidgets = new Map();

    // 子模块
    this._configSelector = new ConfigSelector(this);
    this._resultPreview = new ResultPreview(this);

    this.render();
    if (this._configId) {
      this._loadConfigAndRender();
    }
  }

  render() {
    this.container.innerHTML = '';
    const body = el('div', 'widget-body');

    if (this.config.describe) {
      body.appendChild(el('p', 'widget-describe', { text: this.config.describe }));
    }

    // 配置选择区
    this._configSelector.render(body);

    // 动态参数区（per-call 微调，折叠展开）
    this._buildDynamicParamsArea(body);

    // 触发分隔条
    const callBar = el('div', 'generate-call-bar');
    const rightLine = el('div', 'generate-call-line');
    callBar.appendChild(rightLine);
    body.appendChild(callBar);

    // Prompt 汇总
    if (this.config.showPromptSummary !== false) {
      this.summaryEl = el('div', 'generate-call-summary', { text: '(收集上游 prompt 值)' });
      body.appendChild(this.summaryEl);
    }

    // 结果预览区
    this._resultPreview.render(body);

    this.container.appendChild(body);
  }

  // ================================================================
  //  动态参数区（委托给共享渲染器）
  // ================================================================
  _buildDynamicParamsArea(body) {
    this.dynamicWrap = el('div', 'generate-call-dynamic-wrap', { style: 'display:none' });
    this.dynamicParamsInner = el('div', 'generate-call-dynamic-inner');
    this.dynamicWrap.appendChild(this.dynamicParamsInner);
    body.appendChild(this.dynamicWrap);
  }

  _loadConfigAndRender() {
    // 清空现有 widgets
    this._paramWidgets.clear();
    if (this.dynamicParamsInner) this.dynamicParamsInner.innerHTML = '';

    if (!this._configId) {
      this.dynamicWrap.style.display = 'none';
      return;
    }

    const configs = loadConfigs();
    const cfg = configs.find(c => c.id === this._configId);
    if (!cfg) {
      this.dynamicWrap.style.display = 'none';
      return;
    }

    const app = window.__strokeApp || null;
    const Cls = app && app.generator ? app.generator.getProviderClass(cfg.adapter) : null;
    const configParams = Cls ? (Cls.configParams || []) : [];

    // 构建 initialValues
    const initialValues = {};
    if (cfg.params) {
      for (const pDef of configParams) {
        if (cfg.params[pDef.name] !== undefined) {
          initialValues[pDef.name] = cfg.params[pDef.name];
        }
      }
    }

    renderDynamicParams({
      container: this.dynamicWrap,
      configParams,
      paramWidgets: this._paramWidgets,
      cssPrefix: 'generate-call',
      widgetIdPrefix: 'gcall_param_',
      suffix: this.config.id || 'main',
      initialValues,
      summaryText: '参数微调',
      startExpanded: true,
      wrapClass: 'generate-call-dynamic-inner'
    });

    // renderDynamicParams 重建了 this.dynamicWrap 内部，需重新抓取 inner 引用
    this.dynamicParamsInner = this.dynamicWrap.querySelector('.generate-call-dynamic-inner');
  }

  // ================================================================
  //  结果管理（委托）
  // ================================================================
  setResult(imageResult, base64) {
    this._resultPreview.setResult(imageResult, base64);
  }

  setGenerating() {
    this._resultPreview.setGenerating();
  }

  setDone() {
    this._resultPreview.setDone();
  }

  // ================================================================
  //  公共 API
  // ================================================================
  getSvgOutput() {
    return this._svgOutput;
  }

  getResultBase64() {
    return this._resultBase64;
  }

  setConfigId(value) {
    this._configSelector.setConfigId(value);
  }

  getConfigId() {
    return this._configId;
  }

  /**
   * 返回此调用 widget 的完整配置
   */
  getConfig() {
    const params = {};
    for (const [name, widget] of this._paramWidgets) {
      params[name] = widget.getValue();
    }
    return {
      configId: this._configId,
      params
    };
  }

  refreshConfigs() {
    this._configSelector.populate();
  }

  updateSummary(summaryText) {
    if (this.summaryEl) {
      this.summaryEl.textContent = summaryText || '(收集上游 prompt 值)';
    }
  }

  getValue() {
    return null;
  }

  setValue(v) { /* no-op */ }

  onChange(fn) {
    this._onChange = fn;
  }
}