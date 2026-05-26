import { describe, it, expect, vi, beforeEach } from 'vitest';
import LineageManager from '../static/js/locals/LineageManager.js';
import Lineage from '../static/js/locals/Lineage.js';

vi.mock('../static/js/locals/StorageManager.js', () => ({
  saveVersionBinary: vi.fn().mockResolvedValue(),
  loadVersionBinary: vi.fn().mockResolvedValue({ dataUrl: '', svg: '', thumbnail: '' }),
  deleteLineageBinary: vi.fn().mockResolvedValue(),
  saveLineages: vi.fn()
}));

function makeLineage(opts) {
  return new Lineage({
    name: opts.name || '',
    fingerprint: opts.fingerprint || 'fp_default',
    tabValues: opts.tabValues || {},
    tabsConfig: opts.tabsConfig || [],
    tabOrder: opts.tabOrder || [],
    versions: opts.versions || [],
    history: opts.history || {}
  });
}

describe('LineageManager — matchOrCreate', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
  });

  it('should create new lineage when no match', () => {
    const result = manager.matchOrCreate('fp_abc', {
      tabValues: { prompt: 'hello' },
      tabsConfig: [{ id: 'prompt', type: 'text' }],
      tabOrder: ['prompt']
    });
    expect(result.isNew).toBe(true);
    expect(result.lineageId).toMatch(/^lineage_\d+$/);
    expect(lineages[result.lineageId]).toBeInstanceOf(Lineage);
  });

  it('should return existing lineage when fingerprint matches', () => {
    const existing = makeLineage({ fingerprint: 'fp_match' });
    lineages['lineage_1'] = existing;
    const result = manager.matchOrCreate('fp_match');
    expect(result.isNew).toBe(false);
    expect(result.lineageId).toBe('lineage_1');
  });

  it('should skip lineage_0', () => {
    const l0 = makeLineage({ fingerprint: 'fp_match' });
    lineages['lineage_0'] = l0;
    const result = manager.matchOrCreate('fp_match');
    expect(result.isNew).toBe(true);
  });
});

describe('LineageManager — addVersion', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
  });

  it('should add version to lineage', () => {
    const lineage = makeLineage({ fingerprint: 'fp1' });
    lineages['lineage_1'] = lineage;
    const idx = manager.addVersion('lineage_1', {
      type: 'svg',
      svg: '<svg></svg>',
      dataUrl: 'data:img;base64,xxx',
      thumbnail: 'thumb',
      time: '12:00'
    });
    expect(idx).toBe(0);
    expect(lineage.versions).toHaveLength(1);
    expect(lineage.versions[0].svg).toBe('<svg></svg>');
  });

  it('should throw for unknown lineage', () => {
    expect(() => manager.addVersion('nonexistent', { type: 'svg' })).toThrow();
  });

  it('should default type to svg', () => {
    lineages['lineage_1'] = makeLineage({});
    manager.addVersion('lineage_1', {});
    expect(lineages['lineage_1'].versions[0].type).toBe('svg');
  });
});

describe('LineageManager — getVersion / getActiveVersion', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
  });

  it('should get version by index', () => {
    const lineage = makeLineage({});
    lineage.versions = [{ index: 0, type: 'svg', svg: '<svg>v0</svg>' }];
    lineages['l1'] = lineage;
    expect(manager.getVersion('l1', 0).svg).toBe('<svg>v0</svg>');
  });

  it('should return undefined for missing lineage', () => {
    expect(manager.getVersion('nonexistent', 0)).toBeUndefined();
  });

  it('should get active version (last)', () => {
    const lineage = makeLineage({});
    lineage.versions = [
      { index: 0, type: 'svg', svg: '<svg>v0</svg>' },
      { index: 1, type: 'svg', svg: '<svg>v1</svg>' }
    ];
    lineages['l1'] = lineage;
    const active = manager.getActiveVersion('l1');
    expect(active.svg).toBe('<svg>v1</svg>');
  });

  it('should return undefined for empty lineage', () => {
    lineages['l1'] = makeLineage({});
    expect(manager.getActiveVersion('l1')).toBeUndefined();
  });

  it('should return undefined for missing lineage', () => {
    expect(manager.getActiveVersion('nonexistent')).toBeUndefined();
  });
});

describe('LineageManager — updateTabValues / updateTabsConfig', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
  });

  it('should update tabValues', () => {
    const lineage = makeLineage({});
    lineages['l1'] = lineage;
    manager.updateTabValues('l1', { prompt: 'updated' });
    expect(lineage.tabValues.prompt).toBe('updated');
  });

  it('should update tabsConfig and tabOrder', () => {
    const lineage = makeLineage({});
    lineages['l1'] = lineage;
    const newConfig = [{ id: 'a', type: 'text' }];
    const newOrder = ['a'];
    manager.updateTabsConfig('l1', newConfig, newOrder);
    expect(lineage.tabsConfig).toEqual(newConfig);
    expect(lineage.tabOrder).toEqual(newOrder);
  });

  it('should not throw for missing lineage', () => {
    expect(() => manager.updateTabValues('nonexistent', {})).not.toThrow();
    expect(() => manager.updateTabsConfig('nonexistent', [], [])).not.toThrow();
  });
});

describe('LineageManager — deleteLineage', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
  });

  it('should delete lineage', async () => {
    lineages['lineage_1'] = makeLineage({});
    await manager.deleteLineage('lineage_1');
    expect(lineages['lineage_1']).toBeUndefined();
  });

  it('should not delete lineage_0', async () => {
    lineages['lineage_0'] = makeLineage({});
    await manager.deleteLineage('lineage_0');
    expect(lineages['lineage_0']).toBeDefined();
  });
});

describe('LineageManager — evictOldest', () => {
  let manager;
  let lineages;

  beforeEach(() => {
    lineages = {};
    manager = new LineageManager(lineages);
    manager.maxLineages = 2;
  });

  it('should not evict when under limit', async () => {
    lineages['lineage_1'] = makeLineage({});
    lineages['lineage_2'] = makeLineage({});
    const count = await manager.evictOldest('lineage_1');
    expect(count).toBe(0);
  });

  it('should evict oldest when over limit', async () => {
    lineages['lineage_1000'] = makeLineage({}); // oldest
    lineages['lineage_2000'] = makeLineage({});
    lineages['lineage_3000'] = makeLineage({}); // active
    const count = await manager.evictOldest('lineage_3000');
    expect(count).toBe(1);
    expect(lineages['lineage_1000']).toBeUndefined();
  });

  it('should not evict active lineage', async () => {
    lineages['lineage_1000'] = makeLineage({}); // active
    lineages['lineage_2000'] = makeLineage({});
    lineages['lineage_3000'] = makeLineage({});
    manager.maxLineages = 1;
    await manager.evictOldest('lineage_1000');
    expect(lineages['lineage_1000']).toBeDefined();
  });

  it('should not evict lineage_0', async () => {
    lineages['lineage_0'] = makeLineage({});
    lineages['lineage_1000'] = makeLineage({});
    lineages['lineage_2000'] = makeLineage({});
    manager.maxLineages = 1;
    await manager.evictOldest('lineage_2000');
    expect(lineages['lineage_0']).toBeDefined();
  });
});

describe('LineageManager — persistMeta', () => {
  it('should call saveLineages', () => {
    const lineages = { 'lineage_1': makeLineage({}) };
    const manager = new LineageManager(lineages);
    expect(() => manager.persistMeta()).not.toThrow();
  });
});
