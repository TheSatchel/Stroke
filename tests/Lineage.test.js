import { describe, it, expect, vi } from 'vitest';
import Lineage from '../static/js/locals/Lineage.js';

describe('Lineage construction', () => {
  it('should create with default values', () => {
    const l = new Lineage();
    expect(l.name).toBe('');
    expect(l.fingerprint).toBe('');
    expect(l.tabValues).toEqual({});
    expect(l.tabsConfig).toEqual([]);
    expect(l.tabOrder).toEqual([]);
    expect(l.versions).toEqual([]);
    expect(l.versionCount).toBe(0);
    expect(l.activeVersion).toBeNull();
  });

  it('should create with provided values', () => {
    const l = new Lineage({
      name: 'test',
      fingerprint: 'abc123',
      tabValues: { prompt: 'hello' },
      tabsConfig: [{ id: 'a', type: 'text' }],
      tabOrder: ['a'],
      versions: [{ index: 0, type: 'svg', svg: '<svg></svg>', dataUrl: '', thumbnail: '', time: '12:00' }],
      history: { time: '12:00', versionCount: 1, versionActive: 0, type: 'svg', svg: '<svg></svg>', thumbnail: '' }
    });
    expect(l.name).toBe('test');
    expect(l.fingerprint).toBe('abc123');
    expect(l.versionCount).toBe(1);
  });
});

describe('Lineage.toStripped', () => {
  it('should produce a JSON-serializable object without binary', () => {
    const l = new Lineage({
      name: 'test',
      fingerprint: 'fp123',
      versions: [
        { index: 0, type: 'svg', svg: '<svg>x</svg>', dataUrl: 'data:img;base64,xxx', thumbnail: 'thumb', time: '12:00' }
      ],
    });
    const stripped = l.toStripped();
    expect(stripped.name).toBe('test');
    expect(stripped.fingerprint).toBe('fp123');
    expect(stripped.versions).toHaveLength(1);
    expect(stripped.versions[0].hasBinary).toBe(true);
    expect(stripped.versions[0].index).toBe(0);
    expect(stripped.versions[0].svg).toBeUndefined();
    expect(stripped.versions[0].dataUrl).toBeUndefined();
  });

  it('should mark hasBinary=false when no binary data', () => {
    const l = new Lineage({
      versions: [{ index: 0, type: 'svg', svg: '', dataUrl: '', thumbnail: '', time: '' }]
    });
    const stripped = l.toStripped();
    expect(stripped.versions[0].hasBinary).toBe(false);
  });

  it('should handle empty history', () => {
    const l = new Lineage();
    const stripped = l.toStripped();
    expect(stripped.history.time).toBe('');
    expect(stripped.history.versionCount).toBe(0);
  });
});

describe('Lineage.fromStripped', () => {
  it('should reconstruct Lineage from stripped data', () => {
    const original = new Lineage({
      name: 'test',
      fingerprint: 'fp123',
      tabValues: { prompt: 'hello' },
      versions: [
        { index: 0, type: 'svg', svg: '<svg>x</svg>', dataUrl: 'binary', thumbnail: 'thumb', time: '12:00' }
      ],
    });
    const stripped = original.toStripped();
    const restored = Lineage.fromStripped(stripped);

    expect(restored.name).toBe('test');
    expect(restored.fingerprint).toBe('fp123');
    expect(restored.versions).toHaveLength(1);
    expect(restored.versions[0].type).toBe('svg');
    expect(restored.versions[0].dataUrl).toBe('');
    expect(restored.versions[0].svg).toBe('');
  });

  it('should handle null/undefined input', () => {
    const l1 = Lineage.fromStripped(null);
    expect(l1).toBeInstanceOf(Lineage);
    const l2 = Lineage.fromStripped(undefined);
    expect(l2).toBeInstanceOf(Lineage);
    const l3 = Lineage.fromStripped('invalid');
    expect(l3).toBeInstanceOf(Lineage);
  });
});

describe('Lineage.addVersion', () => {
  it('should add version and return index', () => {
    const l = new Lineage();
    const idx = l.addVersion({ type: 'svg', svg: '<svg></svg>', dataUrl: '', thumbnail: '', time: '12:00' });
    expect(idx).toBe(0);
    expect(l.versionCount).toBe(1);
  });

  it('should increment index for each version', () => {
    const l = new Lineage();
    expect(l.addVersion({ type: 'svg' })).toBe(0);
    expect(l.addVersion({ type: 'raster' })).toBe(1);
    expect(l.addVersion({ type: 'svg' })).toBe(2);
    expect(l.versionCount).toBe(3);
  });

  it('should default type to svg', () => {
    const l = new Lineage();
    l.addVersion({});
    expect(l.getVersion(0).type).toBe('svg');
  });
});

describe('Lineage.getVersion', () => {
  it('should return version at index', () => {
    const l = new Lineage();
    l.addVersion({ type: 'svg', svg: '<svg>v0</svg>' });
    l.addVersion({ type: 'raster', dataUrl: 'data:...' });
    expect(l.getVersion(0).svg).toBe('<svg>v0</svg>');
    expect(l.getVersion(1).type).toBe('raster');
  });

  it('should return null for out-of-bounds', () => {
    const l = new Lineage();
    expect(l.getVersion(99)).toBeNull();
  });
});

describe('Lineage.activeVersion', () => {
  it('should return last version', () => {
    const l = new Lineage();
    l.addVersion({ type: 'svg', svg: '<svg>v0</svg>' });
    l.addVersion({ type: 'svg', svg: '<svg>v1</svg>' });
    expect(l.activeVersion.svg).toBe('<svg>v1</svg>');
  });

  it('should return null for no versions', () => {
    const l = new Lineage();
    expect(l.activeVersion).toBeNull();
  });
});

describe('Lineage.updateHistory', () => {
  it('should update history fields', () => {
    const l = new Lineage();
    l.updateHistory(2, 'svg', '<svg>x</svg>', '14:30', 'thumb64');
    expect(l.history.versionCount).toBe(3);
    expect(l.history.versionActive).toBe(2);
    expect(l.history.type).toBe('svg');
    expect(l.history.svg).toBe('<svg>x</svg>');
    expect(l.history.time).toBe('14:30');
    expect(l.history.thumbnail).toBe('thumb64');
  });
});

describe('Lineage.setHistoryVersionActive', () => {
  it('should update versionActive', () => {
    const l = new Lineage();
    l.setHistoryVersionActive(5);
    expect(l.history.versionActive).toBe(5);
  });

  it('should ignore non-number or negative', () => {
    const l = new Lineage();
    l.setHistoryVersionActive(3);
    l.setHistoryVersionActive('abc');
    expect(l.history.versionActive).toBe(3);
    l.setHistoryVersionActive(-1);
    expect(l.history.versionActive).toBe(3);
  });
});

describe('Lineage.hydrateVersion', () => {
  it('should hydrate version from loader', async () => {
    const l = new Lineage();
    l.addVersion({ type: 'svg', svg: '', dataUrl: '', thumbnail: '' });
    const loadFn = vi.fn().mockResolvedValue({ dataUrl: 'data:...', svg: '<svg>x</svg>', thumbnail: 'thumb' });
    const result = await l.hydrateVersion(0, loadFn, 'lineage_1');
    expect(result).toBe(true);
    expect(l.getVersion(0).dataUrl).toBe('data:...');
    expect(l.getVersion(0).svg).toBe('<svg>x</svg>');
    expect(l.hydrateVersion._hydrated).toBeUndefined();
  });

  it('should return false for non-existent version', async () => {
    const l = new Lineage();
    const result = await l.hydrateVersion(0, vi.fn(), 'lineage_1');
    expect(result).toBe(false);
  });

  it('should return true if already hydrated', async () => {
    const l = new Lineage();
    l.addVersion({ type: 'svg' });
    const loadFn = vi.fn().mockResolvedValue({ dataUrl: 'd', svg: 's', thumbnail: 't' });
    await l.hydrateVersion(0, loadFn, 'lineage_1');
    const callsBefore = loadFn.mock.calls.length;
    const result = await l.hydrateVersion(0, loadFn, 'lineage_1');
    expect(result).toBe(true);
    expect(loadFn.mock.calls.length).toBe(callsBefore);
  });

  it('should return false if loader returns nothing', async () => {
    const l = new Lineage();
    l.addVersion({ type: 'svg' });
    const result = await l.hydrateVersion(0, vi.fn().mockResolvedValue(undefined), 'lineage_1');
    expect(result).toBe(false);
  });
});
