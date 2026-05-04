/**
 * storage.js — localStorage 统一管理
 *
 * tab 状态与值分离存储：
 *   tabState  = { customTabs, tabOrder }  ← 自定义/排序
 *   tabValues = { [tabId]: value }         ← 用户输入的值
 * 默认 tab 的定义始终从 ConfigTabs.js 读取，不持久化。
 */

export const KEYS = Object.freeze({
  history:      'stroke_history',
  lineages:     'stroke_lineages',
  fingerprints: 'stroke_fingerprints',
  curLineage:   'stroke_cur_lineage',
  curVersion:   'stroke_cur_version',
  tabState:     'stroke_tab_state',
  tabValues:    'stroke_tab_values',
  apiSettings:  'stroke_api_settings',
  presets:      'stroke_presets',
  configs:      'stroke_configs',
  gcallConfigs: 'stroke_gcall_configs',
  tabsConfigFull: 'stroke_tabs_config_full',
  hasInitialized: 'stroke_has_initialized',
  themeAccent:    'stroke_theme_accent',
  themeMode:      'stroke_theme_mode',
  panelSizes:     'stroke_panel_sizes',
});

function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeRemove(k) { try { localStorage.removeItem(k); } catch (e) {} }
function setJSON(k, o) { try { safeSet(k, JSON.stringify(o)); } catch (e) {} }
function getJSON(k, def) {
  const r = safeGet(k);
  if (!r) return def;
  try { return JSON.parse(r); } catch (e) { return def; }
}

export function saveAll(d) {
  setJSON(KEYS.history,      d.historyItems);
  setJSON(KEYS.lineages,     d.lineages);
  setJSON(KEYS.fingerprints, d.fingerprints);
  safeSet(KEYS.curLineage,   d.currentLineageId || '');
  safeSet(KEYS.curVersion,   String(d.currentVersionIndex ?? 0));
  setJSON(KEYS.tabState,     { customTabs: d.customTabs, tabOrder: d.tabOrder });
  setJSON(KEYS.tabValues,    d.tabValues);
  setJSON(KEYS.apiSettings,  d.apiValues);
}

export function loadAll() {
  const ts = getJSON(KEYS.tabState, { customTabs: [], tabOrder: null });
  return {
    historyItems:        getJSON(KEYS.history, []),
    lineages:            getJSON(KEYS.lineages, {}),
    fingerprints:        getJSON(KEYS.fingerprints, {}),
    currentLineageId:    safeGet(KEYS.curLineage) || null,
    currentVersionIndex: parseInt(safeGet(KEYS.curVersion)) || 0,
    customTabs:          ts.customTabs || [],
    tabOrder:            ts.tabOrder || null,
    tabValues:           getJSON(KEYS.tabValues, {}),
    apiValues:           getJSON(KEYS.apiSettings, null),
  };
}

export function clearHistory() {
  safeRemove(KEYS.history);
  safeRemove(KEYS.lineages);
  safeRemove(KEYS.fingerprints);
  safeRemove(KEYS.curLineage);
  safeRemove(KEYS.curVersion);
}

export function clearAll() {
  Object.values(KEYS).forEach(k => safeRemove(k));
}

export function saveApiSettings(v) { setJSON(KEYS.apiSettings, v); }
export function loadApiSettings() { return getJSON(KEYS.apiSettings, null); }
export function loadPresets() { return getJSON(KEYS.presets, []); }
export function savePreset(presets) { setJSON(KEYS.presets, presets); }
export function deletePreset(presets) { setJSON(KEYS.presets, presets); }

// ================================================================
//  配置管理（替代旧的预设系统）
//  配置结构: { id, name, adapter, apiKey, endpoint, model, fallbackModel, concurrency, params: {...} }
// ================================================================
export function loadConfigs() { return getJSON(KEYS.configs, []); }
export function saveConfigs(configs) { setJSON(KEYS.configs, configs); }

/** 从旧预设格式迁移到新配置格式 */
export function migrateLegacyPresets() {
  const oldPresets = loadPresets();
  if (!oldPresets || oldPresets.length === 0) return loadConfigs();
  const configs = loadConfigs();
  let changed = false;
  for (const p of oldPresets) {
    if (!p.params || !p.params.provider) continue;
    const cfg = {
      id: p.id,
      name: p.name,
      adapter: p.params.provider,
      apiKey: p.params.apiKey || '',
      endpoint: p.params.endpoint || '',
      model: p.params.model || '',
      fallbackModel: p.params.fallbackModel || null,
      concurrency: p.params.concurrency || 3,
      params: {}
    };
    const fixedKeys = ['provider', 'apiKey', 'endpoint', 'model', 'fallbackModel', 'concurrency'];
    for (const [k, v] of Object.entries(p.params)) {
      if (!fixedKeys.includes(k)) {
        cfg.params[k] = v;
      }
    }
    if (!configs.some(c => c.id === cfg.id)) {
      configs.push(cfg);
      changed = true;
    }
  }
  if (changed) {
    saveConfigs(configs);
    deletePreset([]);
  }
  return configs;
}

// ================================================================
//   GenerateCallWidget 上次使用的配置映射  { [callTabId]: configId }
// ================================================================
export function loadGcallConfigs() { return getJSON(KEYS.gcallConfigs, {}); }
export function saveGcallConfigs(map) { setJSON(KEYS.gcallConfigs, map); }

// ================================================================
//  完整 tabsConfig 持久化（替代仅存储自定义 tab 的模式）
// ================================================================
export function saveTabsConfigFull(tabsConfig) {
  setJSON(KEYS.tabsConfigFull, tabsConfig);
}

export function loadTabsConfigFull() {
  return getJSON(KEYS.tabsConfigFull, null);
}

// ================================================================
//  首次初始化标记
// ================================================================
export function hasInitialized() {
  try { return localStorage.getItem(KEYS.hasInitialized) === '1'; } catch (e) { return false; }
}

export function markInitialized() {
  try { localStorage.setItem(KEYS.hasInitialized, '1'); } catch (e) { /* ignore */ }
}
