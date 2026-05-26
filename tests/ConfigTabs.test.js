import { describe, it, expect } from 'vitest';
import {
  defaultConfigTabs,
  availableTabPool,
  widgetRegistry,
  tabsToPrompt,
  getGenerateCallSegments,
  getTabTemplate
} from '../static/js/components/ConfigTabs.js';
import TextWidget from '../static/js/components/widgets/TextWidget.js';
import SliderWidget from '../static/js/components/widgets/SliderWidget.js';
import ChoiceWidget from '../static/js/components/widgets/ChoiceWidget.js';
import ImageWidget from '../static/js/components/widgets/ImageWidget.js';
import CanvasRefImageWidget from '../static/js/components/widgets/CanvasRefImageWidget.js';
import GenerateCallWidget from '../static/js/components/widgets/generate-call/GenerateCallWidget.js';
import RegionPromptWidget from '../static/js/components/widgets/RegionPromptWidget.js';

describe('defaultConfigTabs', () => {
  it('should include prompt, image, and generate_call', () => {
    const ids = defaultConfigTabs.map(t => t.id);
    expect(ids).toContain('prompt');
    expect(ids).toContain('image');
    expect(ids).toContain('generate_call');
  });

  it('prompt should be non-removable and multiline', () => {
    const prompt = defaultConfigTabs.find(t => t.id === 'prompt');
    expect(prompt.removable).toBe(false);
    expect(prompt.multiline).toBe(true);
    expect(prompt.type).toBe('text');
  });

  it('generate_call should be non-removable', () => {
    const gc = defaultConfigTabs.find(t => t.id === 'generate_call');
    expect(gc.removable).toBe(false);
    expect(gc.type).toBe('generate_call');
  });
});

describe('availableTabPool', () => {
  it('should contain text, slider, choice, and image templates', () => {
    const types = availableTabPool.map(t => t.type);
    expect(types).toContain('text');
    expect(types).toContain('slider');
    expect(types).toContain('choice');
    expect(types).toContain('image');
  });

  it('should have removable=true for all templates', () => {
    for (const t of availableTabPool) {
      expect(t.removable).toBe(true);
    }
  });

  it('should have null id for all pool items', () => {
    for (const t of availableTabPool) {
      expect(t.id).toBeNull();
    }
  });
});

describe('widgetRegistry', () => {
  it('should map all types to widget classes', () => {
    expect(widgetRegistry.text).toBe(TextWidget);
    expect(widgetRegistry.slider).toBe(SliderWidget);
    expect(widgetRegistry.choice).toBe(ChoiceWidget);
    expect(widgetRegistry.image).toBe(ImageWidget);
    expect(widgetRegistry.canvas_ref_image).toBe(CanvasRefImageWidget);
    expect(widgetRegistry.generate_call).toBe(GenerateCallWidget);
    expect(widgetRegistry.region_prompt).toBe(RegionPromptWidget);
  });
});

describe('tabsToPrompt', () => {
  const sampleDefs = [
    { id: 'prompt', type: 'text', promptFormat: '{value}' },
    { id: 'img', type: 'image', promptFormat: '' },
    { id: 'style', type: 'choice', promptFormat: '风格: {value}' },
    { id: 'call', type: 'generate_call', promptFormat: '' },
    { id: 'extra', type: 'text', promptFormat: '{value}' },
  ];

  it('should join non-empty tab values with comma', () => {
    const vals = { prompt: 'hello', style: 'anime' };
    const result = tabsToPrompt(vals, sampleDefs);
    expect(result).toBe('hello, 风格: anime');
  });

  it('should skip tabs without promptFormat', () => {
    const vals = { prompt: 'hello', img: 'data:image/png;base64,abc', style: 'anime' };
    const result = tabsToPrompt(vals, sampleDefs);
    expect(result).toBe('hello, 风格: anime');
  });

  it('should skip generate_call tabs', () => {
    const vals = { prompt: 'hello', call: 'cfg1', extra: 'more' };
    const result = tabsToPrompt(vals, sampleDefs);
    expect(result).toBe('hello, more');
  });

  it('should skip undefined/null/empty/false values', () => {
    const vals = { prompt: '', img: null, style: false };
    const result = tabsToPrompt(vals, sampleDefs);
    expect(result).toBe('');
  });

  it('should respect endIndex', () => {
    const vals = { prompt: 'hello', style: 'anime' };
    const result = tabsToPrompt(vals, sampleDefs, 3);
    expect(result).toBe('hello, 风格: anime');
  });

  it('should handle region_prompt type with direct value inclusion', () => {
    const defs = [
      { id: 'prompt', type: 'text', promptFormat: '{value}' },
      { id: 'region1', type: 'region_prompt', promptFormat: '' },
      { id: 'call', type: 'generate_call', promptFormat: '' },
    ];
    const vals = { prompt: 'sunset', region1: '选中的A区域: 添加花' };
    const result = tabsToPrompt(vals, defs);
    expect(result).toContain('sunset');
    expect(result).toContain('选中的A区域: 添加花');
  });
});

describe('getGenerateCallSegments', () => {
  it('should return empty for no generate_calls', () => {
    const tabs = [
      { id: 'a', type: 'text' },
      { id: 'b', type: 'text' },
    ];
    expect(getGenerateCallSegments(tabs)).toEqual([]);
  });

  it('should return correct segments', () => {
    const tabs = [
      { id: 'a', type: 'text' },
      { id: 'b', type: 'text' },
      { id: 'call1', type: 'generate_call' },
      { id: 'c', type: 'text' },
      { id: 'call2', type: 'generate_call' },
    ];
    const segs = getGenerateCallSegments(tabs);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ callTabId: 'call1', startIndex: 0, endIndex: 2 });
    expect(segs[1]).toEqual({ callTabId: 'call2', startIndex: 3, endIndex: 4 });
  });

  it('should handle leading generate_call', () => {
    const tabs = [
      { id: 'call', type: 'generate_call' },
      { id: 'a', type: 'text' },
    ];
    const segs = getGenerateCallSegments(tabs);
    expect(segs[0]).toEqual({ callTabId: 'call', startIndex: 0, endIndex: 0 });
  });
});

describe('getTabTemplate', () => {
  it('should return a copy of matching type from pool', () => {
    const tmpl = getTabTemplate('text');
    expect(tmpl).not.toBeNull();
    expect(tmpl.type).toBe('text');
    expect(tmpl.removable).toBe(true);
  });

  it('should return null for unknown type', () => {
    expect(getTabTemplate('unknown_type')).toBeNull();
  });

  it('should return a shallow copy (not the pool item itself)', () => {
    const tmpl = getTabTemplate('slider');
    tmpl.min = 999;
    const poolItem = availableTabPool.find(t => t.type === 'slider' && t.id === null);
    expect(poolItem.min).not.toBe(999);
  });

  it('should prefer single-line text template', () => {
    const tmpl = getTabTemplate('text');
    expect(tmpl.multiline).toBe(false);
  });
});
