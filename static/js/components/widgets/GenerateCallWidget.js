/**
 * GenerateCallWidget.js — 生成调用触发器 + 结果预览控件
 *
 * 既是触发点也是生成结果容器。
 * 多个 generate_call 时，上一个的输出图自动传给下一个作为参考图。
 */

import { el } from '../utils.js';
import { loadConfigs, loadGcallConfigs, saveGcallConfigs } from '../../storage.js';
import { widgetRegistry } from '../ConfigTabs.js';
import { svgToBase64DataUrl } from '../../adapters/ResponseParser.js';
import { showWarningToast } from '../Toast.js';

export default class GenerateCallWidget {
  constructor(container, config, configId) {
    this.container = container;
    this.config = config;
    /** 当前选中的配置 ID */
    this._configId = configId || (config && config.configId) || null;
    // 如果没有指定配置，尝试从 localStorage 加载上次使用的配置
    if (!this._configId && config && config.id) {
      const savedMap = loadGcallConfigs();
      if (savedMap[config.id]) {
        this._configId = savedMap[config.id];
      }
    }
    this._onChange = null;
    /** 生成结果的 SVG 字符串 */
    this._svgOutput = '';
    /** 生成结果的 base64 图片 */
    this._resultBase64 = '';
    /** 动态参数 widget 实例 Map<paramName, widgetInstance> */
    this._paramWidgets = new Map();

    this.render();
    // 初次渲染后加载动态参数
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

    // --- 配置选择区（新架构：替换旧的预设选择器） ---
    this._buildConfigSelector(body);

    // --- 动态参数区（per-call 微调，折叠展开） ---
    this._buildDynamicParamsArea(body);

    // --- 触发分隔条 ---
    const callBar = el('div', 'generate-call-bar');
    const rightLine = el('div', 'generate-call-line');
    callBar.appendChild(rightLine);
    body.appendChild(callBar);

    // --- Prompt 汇总 ---
    if (this.config.showPromptSummary !== false) {
      this.summaryEl = el('div', 'generate-call-summary', { text: '(收集上游 prompt 值)' });
      body.appendChild(this.summaryEl);
    }

    // --- 结果预览区 ---
    this.resultPreview = el('div', 'generate-call-result-preview', { style: 'display:none' });
    this.resultImg = el('img', 'generate-call-result-img', { alt: '生成结果预览' });
    this.resultPreview.appendChild(this.resultImg);

    const statusRow = el('div', 'generate-call-status-row');
    this.statusIndicator = el('span', 'generate-call-status', { text: '● 就绪' });
    statusRow.appendChild(this.statusIndicator);

    this.removeBtn = el('button', 'generate-call-result-remove', {
      html: 'x',
      title: '清除结果',
      style: 'display:none',
      onclick: () => this._clearResult()
    });
    statusRow.appendChild(this.removeBtn);
    this.resultPreview.appendChild(statusRow);

    body.appendChild(this.resultPreview);
    this.container.appendChild(body);
  }

  // ================================================================
  //  结果管理
  // ================================================================
  /**
   * 接收生成结果并按类型显示预览
   * @param {ImageResult} imageResult - { type:'svg', svg } | { type:'raster', dataUrl }
   * @param {string} [base64] - 预编码的 data URL（光栅 = dataUrl，SVG = base64 data URL）
   */
  setResult(imageResult, base64) {
    this._svgOutput = (imageResult && imageResult.type === 'svg') ? imageResult.svg : '';
    this._resultBase64 = base64 || '';

    if (imageResult && imageResult.type === 'raster' && imageResult.dataUrl) {
      // 光栅图：直接使用 dataUrl
      this.resultImg.src = imageResult.dataUrl;
      this.resultPreview.style.display = 'block';
      this.statusIndicator.textContent = '● 已完成';
      this.removeBtn.style.display = '';
    } else if (base64) {
      this.resultImg.src = base64;
      this.resultPreview.style.display = 'block';
      this.statusIndicator.textContent = '● 已完成';
      this.removeBtn.style.display = '';
    } else if (imageResult && imageResult.type === 'svg' && imageResult.svg) {
      // SVG 字符串 → base64 内联预览（使用安全的 TextEncoder 方案）
      const dataUrl = svgToBase64DataUrl(imageResult.svg);
      if (dataUrl) {
        this.resultImg.src = dataUrl;
        this.resultPreview.style.display = 'block';
        this.statusIndicator.textContent = '● 已完成';
        this.removeBtn.style.display = '';
      } else {
        console.warn('[GenerateCallWidget] SVG 转 base64 失败，尝试直接使用');
        this.resultImg.src = imageResult.svg;
        this.resultPreview.style.display = 'block';
        this.statusIndicator.textContent = '⚠ 格式异常';
        this.removeBtn.style.display = '';
      }
    }
  }

  _clearResult() {
    this._svgOutput = '';
    this._resultBase64 = '';
    this.resultImg.src = '';
    this.resultPreview.style.display = 'none';
    this.statusIndicator.textContent = '● 就绪';
    this.removeBtn.style.display = 'none';
    if (this._onChange) this._onChange(null);
  }

  /** 设置生成中状态 */
  setGenerating() {
    this.statusIndicator.textContent = '◌ 生成中...';
    this.statusIndicator.classList.add('generating');
  }

  /** 设置完成状态 */
  setDone() {
    this.statusIndicator.textContent = '● 已完成';
    this.statusIndicator.classList.remove('generating');
  }

  // ================================================================
  //  公共 API
  // ================================================================
  /** 返回上次生成的 SVG 字符串 */
  getSvgOutput() {
    return this._svgOutput;
  }

  /** 返回上次生成的 base64（用于传递给下游） */
  getResultBase64() {
    return this._resultBase64;
  }

  // ================================================================
  //  配置选择器（新架构）
  // ================================================================
  _buildConfigSelector(body) {
    const row = el('div', 'generate-call-config-row');

    const labelEl = el('span', 'generate-call-config-label', { text: '配置' });
    row.appendChild(labelEl);

    this.configSelect = el('select', 'generate-call-config-select');
    this._populateConfigDropdown();
    this.configSelect.addEventListener('change', () => {
      this._configId = this.configSelect.value || null;
      this._saveLastConfig();
      this._loadConfigAndRender();
      if (this._onChange) this._onChange(this._configId);
    });
    row.appendChild(this.configSelect);

    body.appendChild(row);
  }

  _populateConfigDropdown() {
    if (!this.configSelect) return;
    const configs = loadConfigs();
    const curVal = this._configId || '';
    this.configSelect.innerHTML = '<option value="">— 无配置 —</option>';
    for (const c of configs) {
      const sel = c.id === this._configId ? ' selected' : '';
      const label = c.name + ' (' + c.adapter + ')';
      this.configSelect.innerHTML += '<option value="' + c.id + '"' + sel + '>' + label + '</option>';
    }
    this.configSelect.value = curVal;
  }

  // ================================================================
  //  动态参数区（per-call 覆盖，折叠展开）
  // ================================================================
  _buildDynamicParamsArea(body) {
    this.dynamicWrap = el('div', 'generate-call-dynamic-wrap', { style: 'display:none' });

    const summaryEl = el('div', 'generate-call-dynamic-summary', { text: '▸ 参数微调' });
    this.dynamicParamsInner = el('div', 'generate-call-dynamic-inner');

    summaryEl.addEventListener('click', () => {
      const collapsed = this.dynamicParamsInner.style.display === 'none';
      this.dynamicParamsInner.style.display = collapsed ? 'block' : 'none';
      summaryEl.textContent = collapsed ? '▾ 参数微调' : '▸ 参数微调';
    });

    this.dynamicWrap.appendChild(summaryEl);
    this.dynamicWrap.appendChild(this.dynamicParamsInner);
    body.appendChild(this.dynamicWrap);
  }

  /**
   * 加载当前选中配置并渲染其 adapter 对应的动态参数。
   * 由 ConfigModal 变更后通过 App._refreshAllCallWidgetConfigs() 桥接调用。
   */
  _loadConfigAndRender() {
    this._clearDynamicParamWidgets();

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

    // 获取 adapter class 以读取 configParams
    const app = window.__strokeApp || null;
    const Cls = app && app.generator ? app.generator.getProviderClass(cfg.adapter) : null;
    const configParams = Cls ? (Cls.configParams || []) : [];

    if (configParams.length === 0) {
      this.dynamicWrap.style.display = 'none';
      return;
    }

    this.dynamicWrap.style.display = 'block';
    // 默认展开，方便用户发现可微调参数
    this.dynamicParamsInner.style.display = 'block';
    const summaryEl = this.dynamicWrap.querySelector('.generate-call-dynamic-summary');
    if (summaryEl) summaryEl.textContent = '▾ 参数微调';

    for (const paramDef of configParams) {
      const paramRow = el('div', 'generate-call-param-row');

      const paramLabel = el('span', 'generate-call-param-label', {
        text: paramDef.label || paramDef.name
      });
      paramRow.appendChild(paramLabel);

      const widgetContainer = el('div', 'generate-call-param-widget');
      const WidgetClass = widgetRegistry[paramDef.type];

      if (WidgetClass) {
        // 初始值优先取配置中保存的值，否则用 adapter 默认值
        const initialValue = (cfg.params && cfg.params[paramDef.name] !== undefined)
          ? cfg.params[paramDef.name]
          : paramDef.defaultValue;

        const mockTabDef = {
          id: 'gcall_param_' + paramDef.name + '_' + (this.config.id || 'main'),
          title: paramDef.label || paramDef.name,
          describe: paramDef.describe || '',
          type: paramDef.type,
          defaultValue: initialValue,
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
        this._paramWidgets.set(paramDef.name, widget);
      } else {
        widgetContainer.appendChild(el('span', '', { text: '未知类型: ' + paramDef.type }));
      }

      paramRow.appendChild(widgetContainer);
      this.dynamicParamsInner.appendChild(paramRow);
    }
  }

  _clearDynamicParamWidgets() {
    this._paramWidgets.clear();
    if (this.dynamicParamsInner) {
      this.dynamicParamsInner.innerHTML = '';
    }
  }

  // ================================================================
  //  公共 API
  // ================================================================
  getConfigId() {
    return this._configId;
  }

  /** 保存当前选中的配置 ID 到 localStorage */
  _saveLastConfig() {
    if (!this.config || !this.config.id) return;
    const map = loadGcallConfigs();
    if (this._configId) {
      map[this.config.id] = this._configId;
    } else {
      delete map[this.config.id];
    }
    saveGcallConfigs(map);
  }

  setConfigId(value) {
    this._configId = value || null;
    if (this.configSelect) {
      this.configSelect.value = value || '';
    }
    this._saveLastConfig();
    if (this._onChange) this._onChange(value);
  }

  /**
   * 返回此调用 widget 的完整配置。
   * 由 uis/Generator.js 在 performGeneration() 中调用，
   * 每个 segment 使用自己的 configId + 动态参数覆盖。
   * @returns {{ configId: string|null, params: object }}
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

  /**
   * 刷新配置下拉列表（当 ConfigModal 中配置变更时由 uis 桥接调用）
   */
  refreshConfigs() {
    this._populateConfigDropdown();
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