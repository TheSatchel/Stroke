/**
 * segmentparser.js — 按 generate_call 将配置切分为独立调用段
 *
 * 每段包含该段专属的 prompt、参考图来源、config 指纹、所选配置预设 ID。
 * 指纹基于该段输入 widget 的原始值（JSON 序列化 + djb2 hash），不涉及生成结果。
 */

/**
 * djb2 hash
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

/**
 * 拼接单个段的 prompt
 */
function buildPrompt(tabDefs, tabValues, startIndex, endIndex) {
  const parts = [];
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    if (def.type === 'generate_call') continue;
    const val = tabValues[def.id];
    if (val === undefined || val === null || val === '' || val === false) continue;
    const fmt = def.promptFormat;
    if (!fmt) continue;
    parts.push(fmt.replace('{value}', String(val)));
  }
  return parts.join(', ');
}

/**
 * 计算单段输入 config 的指纹
 * 仅包含 [startIndex, endIndex) 范围的 widget 值，跳过 generate_call
 */
function buildFingerprint(tabDefs, tabValues, startIndex, endIndex) {
  const slice = {};
  const keys = [];
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    if (def.type === 'generate_call') continue;
    keys.push(def.id);
  }
  keys.sort();
  for (const k of keys) {
    slice[k] = tabValues[k];
  }
  return simpleHash(JSON.stringify(slice));
}

/**
 * 查找该段范围内所有图片 base64
 */
function findImageBase64List(tabDefs, tabValues, startIndex, endIndex) {
  const list = [];
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    if (def.type === 'image') {
      const v = tabValues[def.id];
      if (v && typeof v === 'string' && v.startsWith('data:image/')) {
        const lenKB = (v.length / 1024).toFixed(1);
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 找到图片: widget=${def.id} size=${lenKB}KB prefix=${v.substring(0, 40)}`);
        list.push(v);
      } else {
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) widget=${def.id} 无有效图片 (value=${typeof v}: ${String(v).substring(0, 30)})`);
      }
    }
  }
  console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 共收集 ${list.length} 张图片`);
  return list;
}

/**
 * 主入口：解析所有调用段
 *
 * @param {Array}  tabsConfig       - 已按 order 排序的 tab 定义数组
 * @param {Object} tabValues        - { [tabId]: currentValue }
 * @param {Object} callWidgetValues - { [callTabId]: configId }
 * @returns {Array<Segment>}
 */
export function parse(tabsConfig, tabValues, callWidgetValues = {}) {
  const segments = [];
  let segmentStart = 0;

  for (let i = 0; i < tabsConfig.length; i++) {
    const def = tabsConfig[i];
    if (def.type === 'generate_call') {
      const endIndex = i;
      const prompt = buildPrompt(tabsConfig, tabValues, segmentStart, endIndex);
      const fingerprint = buildFingerprint(tabsConfig, tabValues, segmentStart, endIndex);
      const configId = callWidgetValues[def.id] || null;

      segments.push({
        callTabId: def.id,
        startIndex: segmentStart,
        endIndex,
        prompt,
        imageBase64List: [], // 稍后填
        fingerprint,
        configId
      });

      segmentStart = i + 1;
    }
  }

  // 为每个段查找其范围内的图片参考（而不只是第一段）
  for (const seg of segments) {
    seg.imageBase64List = findImageBase64List(tabsConfig, tabValues, seg.startIndex, seg.endIndex);
  }

  return segments;
}

/**
 * 计算结构指纹（仅基于 tab id、类型和顺序，不含值）
 * 用于判断是否应开新 lineage（结构变了 → 新 lineage）
 * @param {Array} tabsConfig - 已排序的 tab 定义数组
 * @returns {string} 结构指纹 hex 字符串
 */
export function computeStructuralFingerprint(tabsConfig) {
  const structure = tabsConfig.map(t => ({
    id: t.id,
    type: t.type
  }));
  return simpleHash(JSON.stringify(structure));
}

/**
 * 计算整体 config 指纹（用于 lineage 匹配）
 */
export function computeFullFingerprint(tabValues) {
  const keys = Object.keys(tabValues).sort();
  const stable = {};
  for (const k of keys) {
    stable[k] = tabValues[k];
  }
  return simpleHash(JSON.stringify(stable));
}