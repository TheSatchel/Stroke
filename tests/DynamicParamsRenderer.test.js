import { describe, it, expect, vi } from 'vitest';
import { renderDynamicParams } from '../static/js/components/DynamicParamsRenderer.js';

vi.mock('../static/js/components/widgets/TextWidget.js', () => ({
  default: class MockTextWidget {
    constructor(container, config) { this.container = container; this.config = config; this.render(); }
    render() { this.container.innerHTML = '<input data-widget="text" />'; }
    getValue() { return this.config.defaultValue; }
    setValue() {}
    onChange() {}
  }
}));

describe('renderDynamicParams', () => {
  const baseOpts = () => ({
    container: document.createElement('div'),
    configParams: [
      { name: 'temp', label: 'Temperature', type: 'text', defaultValue: '1.0', describe: 'Controls randomness' }
    ],
    paramWidgets: new Map(),
    cssPrefix: 'sm',
    widgetIdPrefix: 'cfgparam_',
    suffix: '',
    initialValues: {},
    summaryText: '动态参数',
    startExpanded: false,
    wrapClass: null
  });

  it('should return null and hide container for empty params', () => {
    const opts = baseOpts();
    opts.configParams = [];
    const result = renderDynamicParams(opts);
    expect(result).toBeNull();
    expect(opts.container.style.display).toBe('none');
  });

  it('should return null for null/undefined params', () => {
    const opts = baseOpts();
    opts.configParams = null;
    const result = renderDynamicParams(opts);
    expect(result).toBeNull();
  });

  it('should create summary element with correct text', () => {
    const opts = baseOpts();
    renderDynamicParams(opts);
    const summary = opts.container.querySelector('.sm-dynamic-summary');
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('动态参数');
  });

  it('should create params wrapper', () => {
    const opts = baseOpts();
    const result = renderDynamicParams(opts);
    const wrap = opts.container.querySelector('.sm-dynamic-wrap');
    expect(wrap).not.toBeNull();
  });

  it('should collapse params by default', () => {
    const opts = baseOpts();
    renderDynamicParams(opts);
    const wrap = opts.container.querySelector('.sm-dynamic-wrap');
    expect(wrap.style.display).toBe('none');
  });

  it('should expand when startExpanded=true', () => {
    const opts = baseOpts();
    opts.startExpanded = true;
    renderDynamicParams(opts);
    const wrap = opts.container.querySelector('.sm-dynamic-wrap');
    expect(wrap.style.display).toBe('block');
    const summary = opts.container.querySelector('.sm-dynamic-summary');
    expect(summary.textContent).toContain('▾');
  });

  it('should toggle on summary click', () => {
    const opts = baseOpts();
    renderDynamicParams(opts);
    const summary = opts.container.querySelector('.sm-dynamic-summary');
    const wrap = opts.container.querySelector('.sm-dynamic-wrap');
    expect(wrap.style.display).toBe('none');
    summary.click();
    expect(wrap.style.display).toBe('block');
    summary.click();
    expect(wrap.style.display).toBe('none');
  });

  it('should populate paramWidgets Map', () => {
    const opts = baseOpts();
    renderDynamicParams(opts);
    expect(opts.paramWidgets.size).toBe(1);
    expect(opts.paramWidgets.has('temp')).toBe(true);
  });

  it('should use initialValues over defaultValue', () => {
    const opts = baseOpts();
    opts.initialValues = { temp: '0.5' };
    renderDynamicParams(opts);
    const widget = opts.paramWidgets.get('temp');
    expect(widget.config.defaultValue).toBe('0.5');
  });

  it('should use widgetIdPrefix with suffix', () => {
    const opts = baseOpts();
    opts.suffix = 'cfg123';
    renderDynamicParams(opts);
    const widget = opts.paramWidgets.get('temp');
    expect(widget.config.id).toBe('cfgparam_temp_cfg123');
  });

  it('should use custom wrapClass', () => {
    const opts = baseOpts();
    opts.wrapClass = 'custom-wrap';
    renderDynamicParams(opts);
    const wrap = opts.container.querySelector('.custom-wrap');
    expect(wrap).not.toBeNull();
  });

  it('should handle multiple config params', () => {
    const opts = baseOpts();
    opts.configParams = [
      { name: 'temp', label: 'Temperature', type: 'text', defaultValue: '1.0' },
      { name: 'top_p', label: 'Top P', type: 'text', defaultValue: '0.9' },
    ];
    renderDynamicParams(opts);
    expect(opts.paramWidgets.size).toBe(2);
  });
});
