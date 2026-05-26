import { describe, it, expect, beforeEach } from 'vitest';
import SliderWidget from '../static/js/components/widgets/SliderWidget.js';

describe('SliderWidget', () => {
  let container;
  let config;

  beforeEach(() => {
    container = document.createElement('div');
    config = {
      id: 'size',
      type: 'slider',
      describe: 'Image size',
      min: 64,
      max: 1024,
      step: 64,
      defaultValue: 512,
      leftLabel: 'Small',
      rightLabel: 'Large',
      unit: 'px'
    };
  });

  it('should render slider structure', () => {
    new SliderWidget(container, config);
    expect(container.querySelector('.slider-track')).not.toBeNull();
    expect(container.querySelector('.slider-fill')).not.toBeNull();
    expect(container.querySelector('.slider-thumb')).not.toBeNull();
  });

  it('should render left and right labels', () => {
    new SliderWidget(container, config);
    expect(container.querySelector('.slider-label-left').textContent).toBe('Small');
    expect(container.querySelector('.slider-label-right').textContent).toBe('Large');
  });

  it('should render describe paragraph', () => {
    new SliderWidget(container, config);
    expect(container.querySelector('.widget-describe').textContent).toBe('Image size');
  });

  it('should not render describe when absent', () => {
    delete config.describe;
    new SliderWidget(container, config);
    expect(container.querySelector('.widget-describe')).toBeNull();
  });

  it('should render value display with unit', () => {
    new SliderWidget(container, config);
    expect(container.querySelector('.slider-value').textContent).toBe('512px');
  });

  it('should render value display without unit', () => {
    delete config.unit;
    new SliderWidget(container, config);
    expect(container.querySelector('.slider-value').textContent).toBe('512');
  });

  it('getValue should return current value', () => {
    const w = new SliderWidget(container, config);
    expect(w.getValue()).toBe(512);
  });

  it('setValue should clamp and update', () => {
    const w = new SliderWidget(container, config);
    w.setValue(256);
    expect(w.getValue()).toBe(256);
    w.setValue(9999);
    expect(w.getValue()).toBe(1024);
    w.setValue(-100);
    expect(w.getValue()).toBe(64);
  });

  it('onChange should fire with value', () => {
    const w = new SliderWidget(container, config);
    let changedVal = null;
    w.onChange(v => { changedVal = v; });
    w._value = 128;
    w._updatePosition();
    expect(changedVal).toBeNull();
    w._onChange(128);
    expect(changedVal).toBe(128);
  });

  it('should default min/max/step', () => {
    const c = { id: 's', type: 'slider', defaultValue: 50 };
    const w = new SliderWidget(container, c);
    expect(w.min).toBe(0);
    expect(w.max).toBe(100);
    expect(w.step).toBe(1);
  });

  it('should not render labels when absent', () => {
    const c = { id: 's', type: 'slider', defaultValue: 50 };
    new SliderWidget(container, c);
    expect(container.querySelector('.slider-label-left')).toBeNull();
    expect(container.querySelector('.slider-label-right')).toBeNull();
  });
});
