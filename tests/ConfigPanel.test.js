import { describe, it, expect } from 'vitest';
import ConfigPanel from '../static/js/components/config-panel/ConfigPanel.js';

function makeMockRegionWidget(userInput, formattedOutput) {
  return {
    getValue: () => formattedOutput,
    getUserInput: () => userInput,
    setValue: () => {},
    onChange: () => {},
  };
}

function makeMockTextWidget(value) {
  return {
    getValue: () => value,
    setValue: () => {},
    onChange: () => {},
  };
}

describe('ConfigPanel — restoreTabValues', () => {
  it('should restore raw user input for region_prompt widgets instead of formatted prompt', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockRegionWidget('换成红色的花', '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...');
    let receivedValue = null;
    mockWidget.setValue = (v) => { receivedValue = v; };

    panel.widgets = {
      region_a: { widget: mockWidget, def: { id: 'region_a', type: 'region_prompt' } },
    };

    const savedValues = {
      region_a: '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...',
      region_a__raw: '换成红色的花',
    };

    panel.restoreTabValues(savedValues);

    expect(receivedValue).toBe('换成红色的花');
  });

  it('should fall back to formatted value when __raw is not present', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockRegionWidget('', '');
    let receivedValue = null;
    mockWidget.setValue = (v) => { receivedValue = v; };

    panel.widgets = {
      region_a: { widget: mockWidget, def: { id: 'region_a', type: 'region_prompt' } },
    };

    const savedValues = {
      region_a: '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...',
    };

    panel.restoreTabValues(savedValues);

    expect(receivedValue).toBe('没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...');
  });

  it('should restore normal value for non-region_prompt widgets', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockTextWidget('');
    let receivedValue = null;
    mockWidget.setValue = (v) => { receivedValue = v; };

    panel.widgets = {
      prompt: { widget: mockWidget, def: { id: 'prompt', type: 'text' } },
    };

    const savedValues = {
      prompt: '一只橘猫坐在窗台上',
    };

    panel.restoreTabValues(savedValues);

    expect(receivedValue).toBe('一只橘猫坐在窗台上');
  });

  it('should handle mixed widgets (region_prompt + normal) correctly', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const regionWidget = makeMockRegionWidget('', '');
    let regionReceived = null;
    regionWidget.setValue = (v) => { regionReceived = v; };

    const textWidget = makeMockTextWidget('');
    let textReceived = null;
    textWidget.setValue = (v) => { textReceived = v; };

    panel.widgets = {
      region_a: { widget: regionWidget, def: { id: 'region_a', type: 'region_prompt' } },
      prompt: { widget: textWidget, def: { id: 'prompt', type: 'text' } },
    };

    const savedValues = {
      region_a: '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...',
      region_a__raw: '换成红色的花',
      prompt: '一只橘猫坐在窗台上',
    };

    panel.restoreTabValues(savedValues);

    expect(regionReceived).toBe('换成红色的花');
    expect(textReceived).toBe('一只橘猫坐在窗台上');
  });

  it('should do nothing when values is null/undefined', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockRegionWidget('', '');
    let setValueCalled = false;
    mockWidget.setValue = () => { setValueCalled = true; };

    panel.widgets = {
      region_a: { widget: mockWidget, def: { id: 'region_a', type: 'region_prompt' } },
    };

    panel.restoreTabValues(null);
    expect(setValueCalled).toBe(false);

    panel.restoreTabValues(undefined);
    expect(setValueCalled).toBe(false);
  });
});

describe('ConfigPanel — getTabValues', () => {
  it('should include both formatted value and __raw for region_prompt widgets', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockRegionWidget('换成红色的花', '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...');
    const mockTextWidget = makeMockTextWidget('hello');

    panel.widgets = {
      region_a: { widget: mockWidget, def: { id: 'region_a', type: 'region_prompt' } },
      prompt: { widget: mockTextWidget, def: { id: 'prompt', type: 'text' } },
    };

    const values = panel.getTabValues();

    expect(values.region_a).toBe('没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...');
    expect(values.region_a__raw).toBe('换成红色的花');
    expect(values.prompt).toBe('hello');
    expect(values.prompt__raw).toBeUndefined();
  });

  it('should round-trip save and restore correctly for region_prompt', () => {
    const container = document.createElement('div');
    const panel = new ConfigPanel(container, []);

    const mockWidget = makeMockRegionWidget('换成红色的花', '没有标号的前述参考图片即为原图。...请对该区域做如下修改：换成红色的花。...');
    let receivedValue = null;
    mockWidget.setValue = (v) => { receivedValue = v; };

    panel.widgets = {
      region_a: { widget: mockWidget, def: { id: 'region_a', type: 'region_prompt' } },
    };

    // 模拟保存
    const saved = panel.getTabValues();

    // 模拟恢复
    panel.restoreTabValues(saved);

    expect(receivedValue).toBe('换成红色的花');
  });
});
