/**
 * Image.js — 图片格式转换工具
 * 将 SVG data URL 转换为 JPEG，用于确保输入图片格式兼容 AI API。
 */

import { showWarningToast } from './Toast.js';

/**
 * 将一个 SVG data URL 转换为 JPEG data URL。
 * 如果转换失败（如损坏的 SVG），则回退为返回原 data URL，不中断流程。
 * @param {string} svgDataUrl - SVG 格式的 data URL (data:image/svg+xml;base64,... 或 data:image/svg+xml,...)
 * @param {number} [quality=0.92] - JPEG 质量 0–1
 * @returns {Promise<string>} JPEG data URL
 */
export async function svgDataUrlToJpeg(svgDataUrl, quality = 0.92) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      // 白色背景，防止透明区域变黑
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (err) => {
      console.warn('[imageUtils] SVG 转 JPEG 失败，保留原始 data URL', err);
      resolve(svgDataUrl);
    };
    img.src = svgDataUrl;
  });
}

/**
 * 如果 data URL 是 SVG，则转换为 JPEG；否则原样返回。
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
export async function convertSvgToJpegIfNeeded(dataUrl) {
  if (typeof dataUrl !== 'string') return dataUrl;
  if (dataUrl.startsWith('data:image/svg+xml')) {
    console.log('[imageUtils] 检测到 SVG 图片，转换为 JPEG...');
    return await svgDataUrlToJpeg(dataUrl);
  }
  return dataUrl;
}
/**
 * 从 data URL 或 SVG 生成缩略图
 * @param {string} source - data URL 或 SVG 字符串
 * @param {number} [maxWidth=128] - 缩略图最大宽度
 * @returns {Promise<string>} JPEG data URL 缩略图
 */
export async function createThumbnail(source, maxWidth = 128) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.naturalWidth;
      canvas.width = maxWidth;
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = (err) => {
      console.warn('[imageUtils] 缩略图生成失败', err);
      resolve(source);
    };
    img.src = source;
  });
}
