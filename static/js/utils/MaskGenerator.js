/**
 * MaskGenerator.js — 根据多边形顶点生成白色蒙版 PNG
 *
 * 纯工具函数，不依赖 DOM/widget 实例。
 * 生成 OffscreenCanvas 绘制白色多边形区域，返回 base64 Data URL。
 */

/**
 * @param {Array<{x: number, y: number}>} points        - display 坐标系的顶点
 * @param {number} displayWidth  - 显示区域宽度
 * @param {number} displayHeight - 显示区域高度
 * @param {number} outputWidth   - 输出蒙版宽度 (默认 1024)
 * @param {number} outputHeight  - 输出蒙版高度 (默认 1024)
 * @returns {string} data:image/png;base64,...
 *   透明背景 (=保留区域)，多边形填充白色 (=编辑区域)
 */
export function generateMaskDataUrl(points, displayWidth, displayHeight, outputWidth = 1024, outputHeight = 1024) {
  if (!points || points.length < 3) {
    // 最小 3 点才能形成封闭区域，返回全透明蒙版（不编辑任何内容）
    console.warn('[MaskGenerator] 点数不足 3，返回全透明蒙版');
    return _emptyMask(outputWidth, outputHeight);
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  // 透明背景（OpenAI Images API 语义：透明/黑色 = 保留不变）
  ctx.clearRect(0, 0, outputWidth, outputHeight);

  // 缩放比例: display → output
  const scaleX = outputWidth / (displayWidth || 1);
  const scaleY = outputHeight / (displayHeight || 1);

  // 绘制白色多边形（白色 = 需要重新生成/编辑的区域）
  ctx.beginPath();
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  return canvas.toDataURL('image/png');
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {string} 全透明蒙版 data URL
 */
function _emptyMask(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas.toDataURL('image/png');
}