import { describe, it, expect, beforeEach } from 'vitest';
import RegionPromptWidget from '../static/js/components/widgets/RegionPromptWidget.js';

describe('RegionPromptWidget', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');

    config = {
      describe: '\u9009\u533a A \u2014 \u8f93\u5165\u8be5\u533a\u57df\u7684\u5904\u7406\u65b9\u5f0f',
      data: {
        imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        points: [{ x: 20, y: 20 }, { x: 80, y: 30 }, { x: 60, y: 80 }],
        color: '#3B82F6',
        label: 'A',
        type: 'lasso',
        canvasWidth: 512,
        canvasHeight: 512,
      },
    };
  });

  it('should render a textarea with widget-text and widget-textarea classes', () => {
    new RegionPromptWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea.classList.contains('widget-text')).toBe(true);
    expect(textarea.classList.contains('widget-textarea')).toBe(true);
    expect(textarea.classList.contains('region-prompt-textarea')).toBe(true);
  });

  it('should set textarea rows to 4 matching the main prompt', () => {
    new RegionPromptWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(parseInt(textarea.getAttribute('rows'))).toBe(4);
  });

  it('should apply border-left color matching region color', () => {
    new RegionPromptWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(textarea.style.borderLeft).toBe('3px solid rgb(59, 130, 246)');
  });

  it('should apply border-left color for different region colors', () => {
    config.data.color = '#E11D48';
    new RegionPromptWidget(container, config);
    const textarea = container.querySelector('textarea');
    expect(textarea.style.borderLeft).toBe('3px solid rgb(225, 29, 72)');
  });

  it('should render describe paragraph', () => {
    new RegionPromptWidget(container, config);
    const desc = container.querySelector('.widget-describe');
    expect(desc).not.toBeNull();
    expect(desc.textContent).toBe('\u9009\u533a A \u2014 \u8f93\u5165\u8be5\u533a\u57df\u7684\u5904\u7406\u65b9\u5f0f');
  });

  it('should render preview area with original image', () => {
    new RegionPromptWidget(container, config);
    const img = container.querySelector('.region-preview-img');
    expect(img).not.toBeNull();
    expect(img.tagName).toBe('IMG');
  });

  it('should render preview area with mask canvas overlay', () => {
    new RegionPromptWidget(container, config);
    const maskCanvas = container.querySelector('.region-preview-mask');
    expect(maskCanvas).not.toBeNull();
    expect(maskCanvas.tagName).toBe('CANVAS');
  });

  it('should render remove button', () => {
    new RegionPromptWidget(container, config);
    const removeBtn = container.querySelector('.region-preview-remove');
    expect(removeBtn).not.toBeNull();
  });

  it('getValue should return empty string when textarea is empty', () => {
    const widget = new RegionPromptWidget(container, config);
    widget.textareaEl.value = '';
    expect(widget.getValue()).toBe('');
  });

  it('getValue should return formatted prompt with user input', () => {
    const widget = new RegionPromptWidget(container, config);
    widget.textareaEl.value = '\u6362\u6210\u7ea2\u8272\u7684\u82b1';
    const value = widget.getValue();
    expect(value).toContain('\u6362\u6210\u7ea2\u8272\u7684\u82b1');
    expect(value).toContain('\u4ee3\u53f7 A');
    expect(value).toContain('\u84dd\u8272');
  });

  it('getUserInput should return trimmed textarea value', () => {
    const widget = new RegionPromptWidget(container, config);
    widget.textareaEl.value = '  \u6d4b\u8bd5\u8f93\u5165  ';
    expect(widget.getUserInput()).toBe('\u6d4b\u8bd5\u8f93\u5165');
  });

  it('setValue should update textarea value', () => {
    const widget = new RegionPromptWidget(container, config);
    widget.setValue('\u6dfb\u52a0\u4e00\u68f5\u6811');
    expect(widget.textareaEl.value).toBe('\u6dfb\u52a0\u4e00\u68f5\u6811');
  });

  it('onChange should fire on textarea input', () => {
    const widget = new RegionPromptWidget(container, config);
    let fired = false;
    widget.onChange(() => { fired = true; });
    widget.textareaEl.value = 'changed';
    widget.textareaEl.dispatchEvent(new Event('input'));
    expect(fired).toBe(true);
  });

  it('onRemove should fire on remove button click', () => {
    const widget = new RegionPromptWidget(container, config);
    let removed = false;
    widget.onRemove(() => { removed = true; });
    const removeBtn = container.querySelector('.region-preview-remove');
    removeBtn.click();
    expect(removed).toBe(true);
  });

  it('should render without describe when absent', () => {
    delete config.describe;
    new RegionPromptWidget(container, config);
    expect(container.querySelector('.widget-describe')).toBeNull();
  });

  it('should handle point type data', () => {
    config.data.type = 'point';
    config.data.x = 30;
    config.data.y = 40;
    config.data.points = [];
    new RegionPromptWidget(container, config);
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('should handle segmentation type with classLabel', () => {
    config.data.type = 'segmentation';
    config.data.classLabel = '\u732b';
    const widget = new RegionPromptWidget(container, config);
    widget.textareaEl.value = '\u6362\u6210\u72d7';
    const value = widget.getValue();
    expect(value).toContain('\u6362\u6210\u72d7');
    expect(value).toContain('\u4ee3\u53f7 A');
  });

  it('getValue returns empty string when user input is only whitespace', () => {
    const widget = new RegionPromptWidget(container, config);
    widget.textareaEl.value = '   ';
    expect(widget.getValue()).toBe('');
  });
});
