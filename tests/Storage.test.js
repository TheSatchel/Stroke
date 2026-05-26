import { describe, it, expect, beforeEach } from 'vitest';
import {
  KEYS,
  safeSet,
  safeGet,
  safeRemove,
  setJSON,
  getJSON,
  saveAll,
  loadAll,
  clearHistory,
  clearAll,
  saveApiSettings,
  loadApiSettings,
  loadPresets,
  savePreset,
  loadConfigs,
  saveConfigs,
  migrateLegacyPresets,
  loadGcallConfigs,
  saveGcallConfigs,
  saveTabsConfigFull,
  loadTabsConfigFull,
  hasInitialized,
  markInitialized
} from '../static/js/locals/storage.js';

describe('storage KEYS', () => {
  it('should be frozen and contain expected keys', () => {
    expect(Object.isFrozen(KEYS)).toBe(true);
    expect(KEYS.curLineage).toBe('stroke_cur_lineage');
    expect(KEYS.curVersion).toBe('stroke_cur_version');
    expect(KEYS.tabState).toBe('stroke_tab_state');
    expect(KEYS.tabValues).toBe('stroke_tab_values');
    expect(KEYS.apiSettings).toBe('stroke_api_settings');
    expect(KEYS.configs).toBe('stroke_configs');
  });
});

describe('safeSet / safeGet / safeRemove', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should set and get a value', () => {
    safeSet('test_key', 'test_value');
    expect(safeGet('test_key')).toBe('test_value');
  });

  it('should return null for missing key', () => {
    expect(safeGet('nonexistent')).toBeNull();
  });

  it('should remove a value', () => {
    safeSet('test_key', 'value');
    safeRemove('test_key');
    expect(safeGet('test_key')).toBeNull();
  });
});

describe('setJSON / getJSON', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store and retrieve JSON', () => {
    setJSON('json_key', { a: 1, b: [2, 3] });
    expect(getJSON('json_key')).toEqual({ a: 1, b: [2, 3] });
  });

  it('should return default for missing key', () => {
    expect(getJSON('missing', 'default')).toBe('default');
  });

  it('should return default for invalid JSON', () => {
    safeSet('bad_json', '{invalid');
    expect(getJSON('bad_json', 'fallback')).toBe('fallback');
  });
});

describe('saveAll / loadAll', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load all app state', () => {
    saveAll({
      currentLineageId: 'lineage_1',
      currentVersionIndex: 3,
      customTabs: [{ id: 'tab1', type: 'text' }],
      tabOrder: ['tab1'],
      apiValues: { apiKey: 'xxx' }
    });

    const loaded = loadAll();
    expect(loaded.currentLineageId).toBe('lineage_1');
    expect(loaded.currentVersionIndex).toBe(3);
    expect(loaded.customTabs).toEqual([{ id: 'tab1', type: 'text' }]);
    expect(loaded.apiValues).toEqual({ apiKey: 'xxx' });
  });

  it('should handle empty apiValues', () => {
    saveAll({});
    const loaded = loadAll();
    expect(loaded.apiValues).toBeNull();
  });

  it('should return defaults for empty storage', () => {
    const loaded = loadAll();
    expect(loaded.currentLineageId).toBeNull();
    expect(loaded.currentVersionIndex).toBe(0);
    expect(loaded.customTabs).toEqual([]);
    expect(loaded.tabOrder).toBeNull();
  });
});

describe('clearHistory / clearAll', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should clear history keys', () => {
    safeSet(KEYS.curLineage, 'lineage_1');
    safeSet(KEYS.curVersion, '3');
    clearHistory();
    expect(safeGet(KEYS.curLineage)).toBeNull();
    expect(safeGet(KEYS.curVersion)).toBeNull();
  });

  it('should clear all keys', () => {
    safeSet(KEYS.curLineage, 'lineage_1');
    safeSet(KEYS.apiSettings, '{"key":"val"}');
    clearAll();
    expect(safeGet(KEYS.curLineage)).toBeNull();
    expect(safeGet(KEYS.apiSettings)).toBeNull();
  });
});

describe('api settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load api settings', () => {
    const settings = { apiKey: 'sk-xxx', model: 'gpt-4o' };
    saveApiSettings(settings);
    const loaded = loadApiSettings();
    expect(loaded).toEqual(settings);
  });
});

describe('presets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to empty array', () => {
    expect(loadPresets()).toEqual([]);
  });

  it('should save and load presets', () => {
    const presets = [{ id: 'p1', name: 'Preset 1' }];
    savePreset(presets);
    expect(loadPresets()).toEqual(presets);
  });
});

describe('configs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to empty array', () => {
    expect(loadConfigs()).toEqual([]);
  });

  it('should save and load configs', () => {
    const configs = [
      { id: 'c1', name: 'Config 1', adapter: 'gpt-chat', apiKey: 'sk-xxx', endpoint: '', model: 'gpt-4o', fallbackModel: null, concurrency: 3, params: {} }
    ];
    saveConfigs(configs);
    expect(loadConfigs()).toEqual(configs);
  });
});

describe('migrateLegacyPresets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return empty if no presets', () => {
    expect(migrateLegacyPresets()).toEqual([]);
  });

  it('should migrate preset data to config format', () => {
    savePreset([
      {
        id: 'p1',
        name: 'Old Preset',
        params: {
          provider: 'gpt-chat',
          apiKey: 'sk-xxx',
          endpoint: 'https://api.example.com',
          model: 'gpt-4o',
          fallbackModel: null,
          concurrency: 3,
          extraParam: 'extraValue'
        }
      }
    ]);
    const configs = migrateLegacyPresets();
    expect(configs).toHaveLength(1);
    expect(configs[0].adapter).toBe('gpt-chat');
    expect(configs[0].params.extraParam).toBe('extraValue');
  });

  it('should skip presets without provider', () => {
    savePreset([
      { id: 'p1', name: 'No Provider', params: { apiKey: 'xx' } },
      { id: 'p2', name: 'Has Provider', params: { provider: 'gpt-chat', apiKey: 'sk-xxx' } }
    ]);
    const configs = migrateLegacyPresets();
    expect(configs).toHaveLength(1);
  });

  it('should not duplicate existing configs', () => {
    saveConfigs([{ id: 'p1', name: 'Existing', adapter: 'gpt-chat' }]);
    savePreset([{ id: 'p1', name: 'Old', params: { provider: 'gpt-chat', apiKey: 'sk' } }]);
    const configs = migrateLegacyPresets();
    expect(configs).toHaveLength(1);
  });
});

describe('gcallConfigs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to empty object', () => {
    expect(loadGcallConfigs()).toEqual({});
  });

  it('should save and load map', () => {
    const map = { callTab1: 'config1', callTab2: 'config2' };
    saveGcallConfigs(map);
    expect(loadGcallConfigs()).toEqual(map);
  });
});

describe('tabsConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load full tabs config', () => {
    const tabs = [{ id: 'prompt', type: 'text' }];
    saveTabsConfigFull(tabs);
    expect(loadTabsConfigFull()).toEqual(tabs);
  });

  it('should return null when not saved', () => {
    expect(loadTabsConfigFull()).toBeNull();
  });
});

describe('initialized flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return false initially', () => {
    expect(hasInitialized()).toBe(false);
  });

  it('should return true after marking', () => {
    markInitialized();
    expect(hasInitialized()).toBe(true);
  });
});
