import { describe, it, expect } from 'vitest';
import {
  parse,
  computeStructuralFingerprint,
  computeFullFingerprint,
  computeContentFingerprint
} from '../static/js/services/segmentparser.js';

function makeTab(id, type, attrs = {}) {
  return { id, type, ...attrs };
}

function makeRegionTab(id, data) {
  return { id, type: 'region_prompt', data, promptFormat: '' };
}

describe('computeStructuralFingerprint', () => {
  it('should return a hex string', () => {
    const tabs = [makeTab('a', 'text'), makeTab('b', 'slider')];
    const fp = computeStructuralFingerprint(tabs);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic', () => {
    const tabs = [makeTab('a', 'text'), makeTab('b', 'slider')];
    expect(computeStructuralFingerprint(tabs)).toBe(computeStructuralFingerprint(tabs));
  });

  it('should differ when tab order changes', () => {
    const a = [makeTab('a', 'text'), makeTab('b', 'slider')];
    const b = [makeTab('b', 'slider'), makeTab('a', 'text')];
    expect(computeStructuralFingerprint(a)).not.toBe(computeStructuralFingerprint(b));
  });

  it('should differ when tab types differ', () => {
    const a = [makeTab('a', 'text')];
    const b = [makeTab('a', 'slider')];
    expect(computeStructuralFingerprint(a)).not.toBe(computeStructuralFingerprint(b));
  });

  it('should handle empty array', () => {
    const fp = computeStructuralFingerprint([]);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });
});

describe('computeFullFingerprint', () => {
  it('should return a hex string', () => {
    const fp = computeFullFingerprint({ prompt: 'hello', size: 100 });
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic', () => {
    const vals = { prompt: 'hello', size: 100 };
    expect(computeFullFingerprint(vals)).toBe(computeFullFingerprint(vals));
  });

  it('should ignore key order', () => {
    const a = { prompt: 'hello', size: 100 };
    const b = { size: 100, prompt: 'hello' };
    expect(computeFullFingerprint(a)).toBe(computeFullFingerprint(b));
  });
});

describe('computeContentFingerprint', () => {
  it('should return a hex string', () => {
    const tabs = [makeTab('prompt', 'text', { promptFormat: '{value}' })];
    const fp = computeContentFingerprint(tabs, { prompt: 'hello' });
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('should hash image data URLs', () => {
    const tabs = [makeTab('img', 'image')];
    const a = computeContentFingerprint(tabs, { img: 'data:image/png;base64,iVBORw0KGgo=' });
    const b = computeContentFingerprint(tabs, { img: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(a).toBe(b);
  });

  it('should skip generate_call tabs', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('gen', 'generate_call'),
    ];
    const fp = computeContentFingerprint(tabs, { prompt: 'hello', gen: null });
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('should treat empty/null/false values as empty string', () => {
    const tabs = [makeTab('a', 'text', { promptFormat: '{value}' })];
    const fp1 = computeContentFingerprint(tabs, { a: '' });
    const fp2 = computeContentFingerprint(tabs, { a: null });
    const fp3 = computeContentFingerprint(tabs, { a: false });
    const fp4 = computeContentFingerprint(tabs, { a: undefined });
    expect(fp1).toBe(fp2);
    expect(fp1).toBe(fp3);
    expect(fp1).toBe(fp4);
  });
});

describe('parse', () => {
  it('should return empty array for no generate_call tabs', () => {
    const tabs = [makeTab('prompt', 'text', { promptFormat: '{value}' })];
    const result = parse(tabs, { prompt: 'hello' });
    expect(result).toEqual([]);
  });

  it('should produce one segment per generate_call', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('gen1', 'generate_call'),
      makeTab('style', 'text', { promptFormat: '{value}' }),
      makeTab('gen2', 'generate_call'),
    ];
    const values = { prompt: 'hello', gen1: 'cfg1', style: 'cool', gen2: 'cfg2' };
    const result = parse(tabs, values, { gen1: 'cfg1', gen2: 'cfg2' });
    expect(result).toHaveLength(2);
  });

  it('should assign correct callTabId, startIndex, endIndex', () => {
    const tabs = [
      makeTab('a', 'text', { promptFormat: '{value}' }),
      makeTab('b', 'text', { promptFormat: '{value}' }),
      makeTab('call', 'generate_call'),
      makeTab('c', 'text', { promptFormat: '{value}' }),
      makeTab('call2', 'generate_call'),
    ];
    const values = { a: 'A', b: 'B', call: null, c: 'C', call2: null };
    const result = parse(tabs, values);
    expect(result[0].callTabId).toBe('call');
    expect(result[0].startIndex).toBe(0);
    expect(result[0].endIndex).toBe(2);
    expect(result[1].callTabId).toBe('call2');
    expect(result[1].startIndex).toBe(3);
    expect(result[1].endIndex).toBe(4);
  });

  it('should build prompt from tab values', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('size', 'slider', { promptFormat: '尺寸: {value}' }),
      makeTab('call', 'generate_call'),
    ];
    const values = { prompt: 'sunset', size: 1024 };
    const result = parse(tabs, values);
    expect(result[0].prompt).toContain('sunset');
    expect(result[0].prompt).toContain('1024');
  });

  it('should skip tabs without promptFormat', () => {
    const tabs = [
      makeTab('img', 'image'),
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('call', 'generate_call'),
    ];
    const values = { img: 'data:image/png;base64,abc', prompt: 'sunset' };
    const result = parse(tabs, values);
    expect(result[0].prompt).toBe('sunset');
    expect(result[0].prompt).not.toContain('base64');
  });

  it('should include region_prompt values directly in prompt', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeRegionTab('region1', { points: [{ x: 10, y: 20 }], type: 'lasso', color: '#ff0', label: 'A' }),
      makeTab('call', 'generate_call'),
    ];
    const values = { prompt: 'sunset', region1: '在选中的A区域添加红色花', region1__raw: '红色花' };
    const result = parse(tabs, values);
    expect(result[0].prompt).toContain('sunset');
    expect(result[0].prompt).toContain('在选中的A区域添加红色花');
  });

  it('should build maskSpecs from region_prompt tabs', () => {
    const tabs = [
      makeRegionTab('region1', {
        points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        type: 'lasso',
        canvasWidth: 800,
        canvasHeight: 600,
        naturalWidth: 1600,
        naturalHeight: 1200,
        x: 100,
        y: 200,
        color: '#ff0000',
        label: 'B',
      }),
      makeTab('call', 'generate_call'),
    ];
    const values = { region1: 'prompt text', region1__raw: 'prompt text' };
    const result = parse(tabs, values);
    expect(result[0].maskSpecs).toHaveLength(1);
    const spec = result[0].maskSpecs[0];
    expect(spec.points).toHaveLength(2);
    expect(spec.type).toBe('lasso');
    expect(spec.displayWidth).toBe(800);
    expect(spec.displayHeight).toBe(600);
    expect(spec.outputWidth).toBe(1600);
    expect(spec.outputHeight).toBe(1200);
    expect(spec.pointX).toBe(100);
    expect(spec.pointY).toBe(200);
    expect(spec.color).toBe('#ff0000');
    expect(spec.label).toBe('B');
  });

  it('should handle maskSpec defaults for missing data', () => {
    const tabs = [
      makeRegionTab('region1', null),
      makeTab('call', 'generate_call'),
    ];
    const result = parse(tabs, {});
    expect(result[0].maskSpecs).toHaveLength(0);
  });

  it('should set configId from callWidgetValues', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('call', 'generate_call'),
    ];
    const values = { prompt: 'test' };
    const callValues = { call: 'config-123' };
    const result = parse(tabs, values, callValues);
    expect(result[0].configId).toBe('config-123');
  });

  it('should default configId to null', () => {
    const tabs = [
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('call', 'generate_call'),
    ];
    const result = parse(tabs, { prompt: 'test' });
    expect(result[0].configId).toBeNull();
  });

  it('should collect imageBase64List for segments', () => {
    const tabs = [
      makeTab('img', 'image'),
      makeTab('prompt', 'text', { promptFormat: '{value}' }),
      makeTab('call', 'generate_call'),
    ];
    const values = {
      img: 'data:image/png;base64,iVBORw0KGgo=',
      prompt: 'test'
    };
    const result = parse(tabs, values);
    expect(result[0].imageBase64List).toHaveLength(1);
    expect(result[0].imageBase64List[0]).toContain('data:image/png');
  });
});
