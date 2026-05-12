/**
 * Fingerprint.js — 哈希与配置指纹纯函数
 */

/**
 * djb2 哈希，用于图片指纹压缩
 */
export function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

/**
 * 计算配置指纹（图片用哈希替代原始 base64，保持指纹紧凑）
 * @param {Object} tabValues - { [tabId]: value }
 * @returns {string} JSON 序列化后的字符串
 */
export function computeConfigFingerprint(tabValues) {
  const stable = {};
  Object.keys(tabValues).sort().forEach(k => {
    let v = tabValues[k];
    if (typeof v === 'string' && v.startsWith('data:image/')) {
      v = 'img:' + simpleHash(v);
    }
    stable[k] = v;
  });
  return JSON.stringify(stable);
}