/**
 * MaskGenerator.js — 根据多边形顶点生成白色蒙版 PNG
 *
 * 纯工具函数，不依赖 DOM/widget 实例。
 * 生成 OffscreenCanvas 绘制白色多边形区域，返回 base64 Data URL。
 */

/**
 * @param {Array<{x: number, y: number}>} points        - display 坐标系的顶点
 * @param {number} displayWidth  - canvas 容器显示宽度
 * @param {number} displayHeight - canvas 容器显示高度
 * @param {number} outputWidth   - 输出蒙版宽度 (默认 1024)
 * @param {number} outputHeight  - 输出蒙版高度 (默认 1024)
 * @param {number} imageWidth    - 原图自然宽度 (用于 contain 计算)
 * @param {number} imageHeight   - 原图自然高度 (用于 contain 计算)
 * @returns {string} data:image/png;base64,...
 *   透明背景 (=保留区域)，多边形填充白色 (=编辑区域)
 */
export function generateMaskDataUrl(points, displayWidth, displayHeight, outputWidth = 1024, outputHeight = 1024, imageWidth = 0, imageHeight = 0) {
  if (!points || points.length === 0) {
    return _emptyMask(outputWidth, outputHeight);
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, outputWidth, outputHeight);

  // 计算 canvas 容器内图像的实际绘制区域 (object-fit:contain)
  const imgW = imageWidth || displayWidth;
  const imgH = imageHeight || displayHeight;
  const imgAspect = imgW / imgH;
  const containerAspect = displayWidth / displayHeight;
  let drawW, drawH, offsetX, offsetY;
  if (imgAspect > containerAspect) {
    drawW = displayWidth;
    drawH = displayWidth / imgAspect;
    offsetX = 0;
    offsetY = (displayHeight - drawH) / 2;
  } else {
    drawH = displayHeight;
    drawW = displayHeight * imgAspect;
    offsetX = (displayWidth - drawW) / 2;
    offsetY = 0;
  }

  const scaleX = outputWidth / drawW;
  const scaleY = outputHeight / drawH;

  if (points.length === 1) {
    // 点选：生成以该点为中心的圆形蒙版
    const px = points[0].x;
    const py = points[0].y;
    const cx = (px - offsetX) * scaleX;
    const cy = (py - offsetY) * scaleY;
    const r = 40 * Math.min(scaleX, scaleY);

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(r, 16), 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  } else if (points.length >= 3) {
    // 多边形：映射到输出坐标（减去letterboxing偏移）
    ctx.beginPath();
    ctx.moveTo((points[0].x - offsetX) * scaleX, (points[0].y - offsetY) * scaleY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo((points[i].x - offsetX) * scaleX, (points[i].y - offsetY) * scaleY);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  } else {
    return _emptyMask(outputWidth, outputHeight);
  }

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