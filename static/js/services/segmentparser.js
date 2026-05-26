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
  let regionCount = 0;
  let regionSkipped = 0;
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    if (def.type === 'generate_call') continue;

    // region_prompt 类型：val 已经包含完整格式化文本，直接加入
    if (def.type === 'region_prompt') {
      const val = tabValues[def.id];
      if (val && typeof val === 'string' && val.trim()) {
        parts.push(val.trim());
        regionCount++;
      } else {
        regionSkipped++;
        console.log(`[segmentparser] region_prompt widget=${def.id} 值为空, 已跳过 (是否未填写内容?)`);
      }
      continue;
    }

    const val = tabValues[def.id];
    if (val === undefined || val === null || val === '' || val === false) continue;
    const fmt = def.promptFormat;
    if (!fmt) continue;
    parts.push(fmt.replace('{value}', String(val)));
  }
  console.log(`[segmentparser] buildPrompt 段[${startIndex}-${endIndex}): 找到 ${regionCount + regionSkipped} 个选区 (${regionCount} 有效, ${regionSkipped} 跳过), 总片段 ${parts.length}`);
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
    // 对于 region_prompt 类型，使用原始用户输入（__raw）计算指纹，而非完整 prompt
    const defForId = tabDefs.find(d => d.id === k);
    if (defForId && defForId.type === 'region_prompt') {
      slice[k] = tabValues[k + '__raw'] || '';
    } else {
      slice[k] = tabValues[k];
    }
  }
  return simpleHash(JSON.stringify(slice));
}

/**
 * 查找该段范围内所有图片 base64
 */
function findImageBase64List(tabDefs, tabValues, startIndex, endIndex) {
  const list = [];
  const seen = new Set();
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    // 标准图片/画布参考图 类型
    if (def.type === 'image' || def.type === 'canvas_ref_image') {
      const v = tabValues[def.id];
      if (v && typeof v === 'string' && v.startsWith('data:image/')) {
        const lenKB = (v.length / 1024).toFixed(1);
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 找到图片: widget=${def.id} size=${lenKB}KB prefix=${v.substring(0, 40)}`);
        list.push(v);
        seen.add(v);
      } else {
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) widget=${def.id} 无有效图片 (value=${typeof v}: ${String(v).substring(0, 30)})`);
      }
    }
    // 选区图片（region_prompt 的 data.imageDataUrl）
    if (def.type === 'region_prompt' && def.data && def.data.imageDataUrl) {
      const v = def.data.imageDataUrl;
      if (v && typeof v === 'string' && v.startsWith('data:image/') && !seen.has(v)) {
        const lenKB = (v.length / 1024).toFixed(1);
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 找到选区图片: widget=${def.id} size=${lenKB}KB prefix=${v.substring(0, 40)}`);
        list.push(v);
        seen.add(v);
      } else if (seen.has(v)) {
        console.log(`[segmentparser] 段[${startIndex}-${endIndex}) widget=${def.id} 选区图片与已有图片重复，已跳过`);
      }
    }
  }
  console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 共收集 ${list.length} 张图片`);
  return list;
}

/**
 * 查找段范围内所有 region_prompt 的原始数据，构建 maskSpecs（替代 findRegionItems）
 * 只收集几何元数据，不在此处生成蒙版图。
 * 蒙版生成推迟到 GenerationPipeline，以便从 adapter config 读取 mask_mode。
 * @returns {Array<{points, type, displayWidth, displayHeight, outputWidth, outputHeight, pointX, pointY, color, label}>}
 */
function buildMaskSpecs(tabDefs, tabValues, startIndex, endIndex) {
  const specs = [];
  for (let i = startIndex; i < endIndex && i < tabDefs.length; i++) {
    const def = tabDefs[i];
    if (def.type !== 'region_prompt' || !def.data) continue;
    const d = def.data;
    const pointsLen = (d.points || []).length;
    console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 发现选区蒙版: widget=${def.id} label=${d.label || '?'} type=${d.type || 'lasso'} points=${pointsLen}`);
    specs.push({
      points:        d.points || [],
      type:          d.type || 'lasso',
      displayWidth:  d.canvasWidth || 512,
      displayHeight: d.canvasHeight || 512,
      outputWidth:   d.naturalWidth || d.canvasWidth || 512,
      outputHeight:  d.naturalHeight || d.canvasHeight || 512,
      pointX:        d.x ?? d.points?.[0]?.x ?? 0,
      pointY:        d.y ?? d.points?.[0]?.y ?? 0,
      color:         d.color || '#3B82F6',
      label:         d.label || 'A',
    });
  }
  console.log(`[segmentparser] 段[${startIndex}-${endIndex}) 共收集 ${specs.length} 个选区蒙版规格`);
  return specs;
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
  // 前提：tabsConfig 已在源头按 order 排序（addCustomTab / _syncTabOrder / loadAppState）
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
        maskSpecs: buildMaskSpecs(tabsConfig, tabValues, segmentStart, endIndex),
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

/**
 * 计算完整内容指纹（含所有 widget 值和 prompt），用于 lineage 匹配
 * 与 computeStructuralFingerprint 的区别：
 *   - 包含 prompt 值（即所有 widget 的格式化后的值）
 *   - 同一结构下不同参数配置能匹配到不同 lineage
 *
 * @param {Array} tabsConfig - 已排序的 tab 定义数组
 * @param {Object} tabValues - { [tabId]: currentValue }
 * @returns {string} 内容指纹 hex 字符串
 */
export function computeContentFingerprint(tabsConfig, tabValues) {
  const stable = {};
  for (const tab of tabsConfig) {
    if (tab.type === 'generate_call') continue; // 跳过段分隔符
    let v = tabValues[tab.id];
    if (v === undefined || v === null || v === '' || v === false) {
      v = '';
    }
    // 对于 region_prompt，使用原始用户输入而非完整格式化文本
    if (tab.type === 'region_prompt') {
      v = tabValues[tab.id + '__raw'] || '';
    }
    // 图片值用哈希替代，保持指纹紧凑
    if (typeof v === 'string' && v.startsWith('data:image/')) {
      v = 'img:' + simpleHash(v);
    }
    stable[tab.id] = v;
  }
  return simpleHash(JSON.stringify(stable));
}
