/**
 * DynamicParamsRenderer.js — 动态参数渲染器（共享模块）
 *
 * ConfigModal._renderDynamicParams() 和 GenerateCallWidget._loadConfigAndRender()
 * 共享同一套逻辑：遍历 adapter.configParams，为每个参数创建 widget，提供折叠/展开交互。
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container       - 容纳动态参数区的父容器
 * @param {Array}       opts.configParams     - adapter 的 configParams 定义数组
 * @param {Map}         opts.paramWidgets     - 存储 widget 实例的 Map
 * @param {string}      opts.cssPrefix        - CSS 类名前缀，如 'sm' 或 'generate-call'
 * @param {string}      opts.widgetIdPrefix   - widget id 前缀，如 'cfgparam_' 或 'gcall_param_'
 * @param {string}      opts.suffix           - widget id 后缀（如 generate_call 的 config.id），默认 ''
 * @param {object}      [opts.initialValues]  - 初始值映射 { paramName: value }，来自配置保存的参数
 * @param {string}      [opts.summaryText]     - 折叠标签文字，默认 '动态参数'
 * @param {boolean}     [opts.startExpanded]   - 是否默认展开，默认 false
 * @param {string}      [opts.wrapClass]       - 参数包裹层的 CSS 类名。不传则自动用 cssPrefix + '-dynamic-wrap'
 * @returns {HTMLElement|null} 动态参数区的包裹元素，如果无参数则返回 null
 */
import { el } from '../utils/DOM.js';
import { widgetRegistry } from './ConfigTabs.js';

export function renderDynamicParams(opts) {
  const {
    container,
    configParams,
    paramWidgets,
    cssPrefix,
    widgetIdPrefix,
    suffix = '',
    initialValues = {},
    summaryText = '动态参数',
    startExpanded = false,
    wrapClass = null
  } = opts;

  // 清空现有内容
  paramWidgets.clear();
  container.innerHTML = '';

  if (!configParams || configParams.length === 0) {
    container.style.display = 'none';
    return null;
  }

  container.style.display = 'block';

  // 折叠标签
  const summaryEl = el('div', cssPrefix + '-dynamic-summary', {
    text: (startExpanded ? '▾ ' : '▸ ') + summaryText,
    style: 'cursor:pointer;font-weight:500;margin-bottom:8px;color:var(--color-text-secondary)'
  });
  const paramsWrap = el('div', wrapClass || (cssPrefix + '-dynamic-wrap'));

  summaryEl.addEventListener('click', () => {
    const collapsed = paramsWrap.style.display === 'none';
    paramsWrap.style.display = collapsed ? 'block' : 'none';
    summaryEl.textContent = (collapsed ? '▾ ' : '▸ ') + summaryText;
  });
  container.appendChild(summaryEl);
  container.appendChild(paramsWrap);

  // 默认状态
  paramsWrap.style.display = startExpanded ? 'block' : 'none';

  // 渲染每个参数
  for (const paramDef of configParams) {
    const wrapper = el('div', cssPrefix + '-field');
    wrapper.appendChild(el('div', cssPrefix + '-label', { text: paramDef.label || paramDef.name }));

    const widgetContainer = el('div', '');
    const WidgetClass = widgetRegistry[paramDef.type];

    if (WidgetClass) {
      // 初始值：优先取 initialValues，否则用 adapter 默认值
      const initialValue = (initialValues[paramDef.name] !== undefined)
        ? initialValues[paramDef.name]
        : paramDef.defaultValue;

      const mockTabDef = {
        id: widgetIdPrefix + paramDef.name + (suffix ? '_' + suffix : ''),
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
      paramWidgets.set(paramDef.name, widget);
    } else {
      widgetContainer.appendChild(el('span', '', { text: '未知类型: ' + paramDef.type }));
    }

    wrapper.appendChild(widgetContainer);
    paramsWrap.appendChild(wrapper);
  }

  return container;
}