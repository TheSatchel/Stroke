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