/**
 * ResultFormatter.js — 生成结果格式化（含缩略图生成）
 *
 * 将 ImageResult 统一为管线内部的结果格式。
 */
import { svgToBase64DataUrl } from '../adapters/ResponseParser.js';
import { createThumbnail } from '../utils/Image.js';

/**
 * 将生成器返回的原始结果格式化为管线标准结果
 * @param {Object} imageResult - { type, svg, dataUrl }
 * @param {string} callTabId
 * @returns {Promise<{ callTabId: string, type: string, svg: string, dataUrl: string, base64: string, thumbnail: string }>}
 */
export async function formatResult(imageResult, callTabId) {
  let resultBase64 = '';
  if (imageResult.type === 'raster') {
    resultBase64 = imageResult.dataUrl || '';
  } else {
    resultBase64 = svgToBase64DataUrl(imageResult.svg || '');
  }

  let thumbnail = '';
  if (resultBase64) {
    thumbnail = await createThumbnail(resultBase64, 128);
  }

  return {
    callTabId,
    type: imageResult.type || 'svg',
    svg: imageResult.type === 'svg' ? imageResult.svg : '',
    dataUrl: imageResult.type === 'raster' ? imageResult.dataUrl : '',
    base64: resultBase64,
    thumbnail
  };
}
