/**
 * ResponseParser.js — 响应清洗工具
 *
 * 将各平台返回的原始文本标准化为纯净的 SVG 字符串。
 * 所有 Adapter 在 generate() 返回前必须调用 cleanResponse()。
 *
 * 同时提供安全的 SVG → Base64 Data URL 编码方案，
 * 替代已废弃的 btoa(unescape(encodeURIComponent()))。
 */

import { showToast, showWarningToast } from '../components/Toast.js';

/**
 * 检测并提取 markdown 代码块中的内容
 * 支持: ```svg ... ```, ```xml ... ```, ```html ... ```, ```image ... ```
 */
function extractFromMarkdownFence(text) {
  const fencePattern = /```(?:svg|xml|html|image)(?:\s+\S*)?\s*\n?([\s\S]*?)```/i;
  const match = text.match(fencePattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * 检测并提取 markdown 图片语法 ![alt](data:image/...)
 * 有些模型 (Gemini 等) 返回光栅图嵌入在 markdown 图片标签中
 */
function extractFromMarkdownImage(text) {
  const imgPattern = /!\[[^\]]*\]\((data:image\/[^)]+)\)/i;
  const match = text.match(imgPattern);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * 将光栅图片 data URL (JPEG/PNG/GIF/WEBP) 包裹在 SVG <image> 标签中
 * 这样整个管线（Canvas、历史版本、Widget 预览）都能统一用 SVG 处理
 *
 * @param {string} dataUrl — 光栅图片 data URL
 * @returns {string} 包裹后的 SVG 字符串
 */
function wrapRasterAsSvg(dataUrl) {
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ' width="100%" height="100%" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet">' +
    '<image width="1024" height="1024" href="' + dataUrl + '"/>' +
    '</svg>';
}

/**
 * 检测是否为 data URL (base64 图片)
 */
function isDataUrl(text) {
  return /^data:image\//i.test(text.trim());
}

/**
 * 检测是否为光栅图片 data URL (非 SVG)
 */
function isRasterDataUrl(dataUrl) {
  return /^data:image\/(jpeg|png|gif|webp|bmp)/i.test(dataUrl);
}

function isSvgDataUrl(dataUrl) {
  return /^data:image\/svg\+xml/i.test((dataUrl || '').trim());
}

/**
 * 验证是否为合法的光栅图 data URL
 */
export function isValidRasterDataUrl(dataUrl) {
  return isRasterDataUrl(dataUrl);
}

/**
 * 检测是否为普通 URL
 */
function isUrl(text) {
  return /^https?:\/\//i.test(text.trim());
}

/**
 * 从文本中提取原始 SVG (<svg>...</svg>)
 */
function extractRawSvg(text) {
  const svgMatch = text.match(/<svg[\s>][\s\S]*?<\/svg>/i);
  return svgMatch ? svgMatch[0] : null;
}

/**
 * 检测是否包含 SVG 命名空间的 <svg> 标签
 */
export function isValidSvg(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  // 检测 SVG 标签（兼容标准版和极简版），并检查闭合标签
  return /<svg[\s>]/.test(trimmed) && /<\/svg>/.test(trimmed);
}

/**
 * 将 SVG 字符串转为安全的 base64 Data URL
 * 使用 TextEncoder 替代已废弃的 unescape(encodeURIComponent())
 *
 * @param {string} svgString - 纯净的 SVG 字符串
 * @returns {string|null} Data URL 或 null（编码失败时）
 */
export function svgToBase64DataUrl(svgString) {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(svgString);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:image/svg+xml;base64,' + btoa(binary);
  } catch (e) {
    showToast('SVG base64 编码失败', 'error');
    return null;
  }
}

/**
 * 主入口：清洗响应文本，返回纯净 SVG 字符串
 *
 * 处理链路：
 *   1. 空值检查
 *   2. data URL → 解码提取
 *   3. 普通 URL → 标记为需要特殊处理
 *   4. markdown 代码块 → 提取内容
 *   5. 原始 <svg> 标签 → 提取
 *   6. 全部失败 → 抛出错误
 *
 * @param {string} rawText - API 返回的原始文本
 * @param {Object} [opts]
 * @param {string} [opts.adapterName] - adapter 名称，用于日志
 * @returns {{ type: 'svg', svg: string } | { type: 'dataUrl', url: string } | { type: 'url', url: string }}
 * @throws {Error} 如果无法提取任何有效内容
 */
export function cleanResponse(rawText, opts = {}) {
  const name = opts.adapterName || 'unknown';
  if (!rawText || typeof rawText !== 'string') {
    throw new Error(`[${name}] 响应为空或非文本`);
  }

  let text = rawText.trim();

  // ── 1. 整体是 data URL ──
  if (isDataUrl(text)) {
    console.log(`[${name}] 响应整体是 data URL`);
    if (isSvgDataUrl(text)) {
      try {
        const base64Part = text.split(',')[1];
        const decoded = atob(base64Part);
        if (isValidSvg(decoded)) {
          return { type: 'svg', svg: decoded };
        }
      } catch (e) { /* fall through */ }
    }
    if (isRasterDataUrl(text)) {
      return { type: 'raster', dataUrl: text };
    }
    // 未知 image/ MIME，当 raster 处理
    return { type: 'raster', dataUrl: text };
  }

  // ── 2. 普通 URL ──
  if (isUrl(text)) {
    showWarningToast('响应是图片 URL（暂不支持直接下载使用）');
    throw new Error(`[${name}] 响应是图片 URL（非 data URL），暂不支持直接下载使用`);
  }

  // ── 3. Markdown 图片语法 ![alt](data:image/...) ──
  const mdImage = extractFromMarkdownImage(text);
  if (mdImage) {
    console.log(`[${name}] 从 markdown 图片语法中提取到 data URL`);
    if (isRasterDataUrl(mdImage)) {
      return { type: 'raster', dataUrl: mdImage };
    }
    if (isSvgDataUrl(mdImage)) {
      try {
        const base64Part = mdImage.split(',')[1];
        const decoded = atob(base64Part);
        if (isValidSvg(decoded)) {
          return { type: 'svg', svg: decoded };
        }
      } catch (e) { /* fall through */ }
    }
    return { type: 'raster', dataUrl: mdImage };
  }

  // ── 4. Markdown 代码块 ──
  const fenceContent = extractFromMarkdownFence(text);
  if (fenceContent) {
    try {
      return cleanResponse(fenceContent, opts);
    } catch (innerErr) {
    // 递归解析失败，尝试本层原始 <svg> 标签
    }
  }

  // ── 5. 原始 <svg> 标签 ──
  const rawSvg = extractRawSvg(text);
  if (rawSvg) {
    console.log(`[${name}] 从响应中提取到原始 SVG`);
    return { type: 'svg', svg: rawSvg };
  }

  // ── 6. 失败 ──
  showToast('响应中未找到有效的图片或 SVG 内容', 'error');
  throw new Error(`[${name}] 响应中未找到有效的图片或 SVG 内容`);
}

/**
 * 清洗并返回 ImageResult（cleanResponse 的别名，命名更直白）
 */
export function cleanResponseToImage(rawText, opts = {}) {
  return cleanResponse(rawText, opts);
}