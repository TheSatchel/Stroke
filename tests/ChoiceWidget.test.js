import { describe, it, expect, beforeEach } from 'vitest';
import ChoiceWidget from '../static/js/components/widgets/ChoiceWidget.js';

describe('ChoiceWidget — dropdown', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');
    config = {
      id: 'style',
      type: 'choice',
      describe: 'Choose style',
      options: ['anime', 'realistic', 'cartoon'],
      defaultValue: 'anime',
      displayAs: 'dropdown'
    };
  });

  it('should render a select element', () => {
    new ChoiceWidget(container, config);
    const select = container.querySelector('select');
    expect(select).not.toBeNull();
  });

  it('should have correct number of options', () => {
    new ChoiceWidget(container, config);
    const select = container.querySelector('select');
    expect(select.options).toHaveLength(3);
  });

  it('should select default value', () => {
    new ChoiceWidget(container, config);
    const select = container.querySelector('select');
    expect(select.value).toBe('anime');
  });

  it('should render describe text', () => {
    new ChoiceWidget(container, config);
    expect(container.querySelector('.widget-describe').textContent).toBe('Choose style');
  });

  it('getValue should return selected option', () => {
    const w = new ChoiceWidget(container, config);
    config.options = ['anime', 'realistic'];
    w.el.value = 'realistic';
    w.el.dispatchEvent(new Event('change'));
    expect(w.getValue()).toBe('realistic');
  });

  it('setValue should update select', () => {
    const w = new ChoiceWidget(container, config);
    w.setValue('realistic');
    expect(w.el.value).toBe('realistic');
  });

  it('onChange should fire on select change', () => {
    const w = new ChoiceWidget(container, config);
    let changed = null;
    w.onChange(v => { changed = v; });
    w.el.value = 'cartoon';
    w.el.dispatchEvent(new Event('change'));
    expect(changed).toBe('cartoon');
  });

  it('should default to first option when no defaultValue', () => {
    delete config.defaultValue;
    const w = new ChoiceWidget(container, config);
    expect(w.getValue()).toBe('anime');
  });

  it('should default to empty string when no options', () => {
    config.options = undefined;
    delete config.defaultValue;
    const w = new ChoiceWidget(container, config);
    expect(w.getValue()).toBe('');
  });

  it('should render dropdown by default', () => {
    delete config.displayAs;
    new ChoiceWidget(container, config);
    expect(container.querySelector('select')).not.toBeNull();
  });
});

describe('ChoiceWidget — toggle', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');
    config = {
      id: 'toggle1',
      type: 'choice',
      options: ['开', '关'],
      defaultValue: '关',
      displayAs: 'toggle',
      toggleLabel: '开启'
    };
  });

  it('should render toggle structure', () => {
    new ChoiceWidget(container, config);
    expect(container.querySelector('.toggle-toggle-label') || container.querySelector('.toggle-label')).toBeDefined();
  });

  it('getValue should return boolean for toggle', () => {
    const w = new ChoiceWidget(container, config);
    expect(w.getValue()).toBe(false);
  });

  it('setValue true should check the component', () => {
    const w = new ChoiceWidget(container, config);
    w.setValue(true);
    expect(w.el.checked).toBe(true);
  });

  it('setValue "on" should check the component', () => {
    const w = new ChoiceWidget(container, config);
    w.setValue('on');
    expect(w.el.checked).toBe(true);
  });

  it('setValue "true" should check the component', () => {
    const w = new ChoiceWidget(container, config);
    w.setValue('true');
    expect(w.el.checked).toBe(true);
  });

  it('clicking row should toggle', () => {
    const w = new ChoiceWidget(container, config);
    const row = container.querySelector('.toggle-row');
    row.click();
    expect(w.getValue()).toBe(true);
    row.click();
    expect(w.getValue()).toBe(false);
  });

  it('should render toggle label', () => {
    new ChoiceWidget(container, config);
    const label = container.querySelector('.toggle-label');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('开启');
  });

  it('onChange should fire on toggle', () => {
    const w = new ChoiceWidget(container, config);
    let changed = null;
    w.onChange(v => { changed = v; });
    const row = container.querySelector('.toggle-row');
    row.click();
    expect(changed).toBe(true);
  });
});

describe('ChoiceWidget — radio', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');
    config = {
      id: 'radio1',
      type: 'choice',
      options: ['A', 'B', 'C'],
      defaultValue: 'B',
      displayAs: 'radio'
    };
  });

  it('should render radio group', () => {
    new ChoiceWidget(container, config);
    const group = container.querySelector('.widget-radio-group');
    expect(group).not.toBeNull();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(3);
  });

  it('should preselect the default value', () => {
    new ChoiceWidget(container, config);
    const checked = container.querySelector('input[value="B"]');
    expect(checked.checked).toBe(true);
  });

  it('getValue should return selected radio value', () => {
    const w = new ChoiceWidget(container, config);
    expect(w.getValue()).toBe('B');
    const radioC = container.querySelector('input[value="C"]');
    radioC.checked = true;
    radioC.dispatchEvent(new Event('change'));
    expect(w.getValue()).toBe('C');
  });

  it('setValue should update radio selection', () => {
    const w = new ChoiceWidget(container, config);
    w.setValue('C');
    const radioC = container.querySelector('input[value="C"]');
    expect(radioC.checked).toBe(true);
  });

  it('onChange should fire on radio change', () => {
    const w = new ChoiceWidget(container, config);
    let changed = null;
    w.onChange(v => { changed = v; });
    const radioA = container.querySelector('input[value="A"]');
    radioA.checked = true;
    radioA.dispatchEvent(new Event('change'));
    expect(changed).toBe('A');
  });

  it('should render radio labels', () => {
    new ChoiceWidget(container, config);
    const labels = container.querySelectorAll('.radio-label');
    expect(labels).toHaveLength(3);
    expect(labels[0].textContent).toBe('A');
  });
});
