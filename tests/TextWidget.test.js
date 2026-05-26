import { describe, it, expect, beforeEach } from 'vitest';
import TextWidget from '../static/js/components/widgets/TextWidget.js';

describe('TextWidget', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');
    config = {
      id: 'prompt',
      type: 'text',
      describe: 'Enter prompt',
      placeholder: 'Type here...',
      defaultValue: 'hello',
      multiline: false,
      maxLength: 100
    };
  });

  it('should render an input for single-line', () => {
    config.multiline = false;
    const w = new TextWidget(container, config);
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    expect(input.type).toBe('text');
    expect(input.value).toBe('hello');
  });

  it('should render a textarea for multiline', () => {
    config.multiline = true;
    const w = new TextWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
  });

  it('should set placeholder', () => {
    new TextWidget(container, config);
    const input = container.querySelector('input');
    expect(input.placeholder).toBe('Type here...');
  });

  it('should set maxLength', () => {
    new TextWidget(container, config);
    const input = container.querySelector('input');
    expect(parseInt(input.getAttribute('maxlength'))).toBe(100);
  });

  it('should not set maxLength when absent', () => {
    delete config.maxLength;
    new TextWidget(container, config);
    const input = container.querySelector('input');
    expect(input.getAttribute('maxlength')).toBeNull();
  });

  it('should set rows for textarea', () => {
    config.multiline = true;
    config.rows = 6;
    new TextWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(parseInt(textarea.getAttribute('rows'))).toBe(6);
  });

  it('should default rows to 4 for textarea', () => {
    config.multiline = true;
    new TextWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(parseInt(textarea.getAttribute('rows'))).toBe(4);
  });

  it('should render describe paragraph', () => {
    new TextWidget(container, config);
    const desc = container.querySelector('.widget-describe');
    expect(desc).not.toBeNull();
    expect(desc.textContent).toBe('Enter prompt');
  });

  it('should not render describe when absent', () => {
    delete config.describe;
    new TextWidget(container, config);
    expect(container.querySelector('.widget-describe')).toBeNull();
  });

  it('getValue should return trimmed input value', () => {
    const w = new TextWidget(container, config);
    w.el.value = '  test  ';
    expect(w.getValue()).toBe('test');
  });

  it('getValue with empty element should return default', () => {
    const w = new TextWidget(container, config);
    w.el = null;
    expect(w.getValue()).toBe('hello');
  });

  it('setValue should update input', () => {
    const w = new TextWidget(container, config);
    w.setValue('new value');
    expect(w.el.value).toBe('new value');
  });

  it('onChange should fire on input', () => {
    const w = new TextWidget(container, config);
    let changedValue = null;
    w.onChange(v => { changedValue = v; });
    w.el.value = 'updated';
    w.el.dispatchEvent(new Event('input'));
    expect(changedValue).toBe('updated');
  });

  it('should use empty string as default when no defaultValue', () => {
    config.defaultValue = undefined;
    new TextWidget(container, config);
    const input = container.querySelector('input');
    expect(input.value).toBe('');
  });
});
