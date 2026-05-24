/**
 * MaskGenerator.js — 根据多边形顶点/点选坐标生成蒙版合成图
 *
 * 纯工具函数，不依赖 DOM/widget 实例。
 * 支持三种蒙版模式：transparent / white_bg / overlay。
 * 所有模式的编辑区域叠加层完全一致：半透明彩色 polygon + 代号标签。
 * 区别仅在于底图（透明 / 白色 / 原图）。
 */

/**
 * 在 canvas 上异步绘制原图（供 overlay 模式使用）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} dataUrl
 * @param {number} w
 * @param {number} h
 */
async function drawOriginalImage(ctx, dataUrl, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      resolve();
    };
    img.onerror = () => reject(new Error('overlay 模式：原图加载失败'));
    img.src = dataUrl;
  });
}

/**
 * 绘制圆形区域（point 类型）
 */
function drawCircleRegion(ctx, cx, cy, scaleX, scaleY) {
  const x = cx * scaleX;
  const y = cy * scaleY;
  const r = Math.max(30 * Math.min(scaleX, scaleY), 8);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * 绘制多边形区域（lasso / segmentation 类型）
 */
function drawPolygonRegion(ctx, points, scaleX, scaleY) {
  if (!points || points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * 绘制代号标签
 */
function drawLabel(ctx, text, outputWidth) {
  if (!text) return;
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  const metrics = ctx.measureText(text);
  const th = 14;
  const pad = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(pad - 2, pad - 2, metrics.width + 4, th + 6);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(text, pad, pad + th);
}

/**
 * 生成蒙版/合成图 Data URL
 *
 * @param {Array<{x: number, y: number}>} points        - display 坐标系的顶点
 * @param {number} displayWidth  - 显示区域宽度
 * @param {number} displayHeight - 显示区域高度
 * @param {number} outputWidth   - 输出尺寸 (= naturalWidth 或 1024)
 * @param {number} outputHeight  - 输出尺寸 (= naturalHeight 或 1024)
 * @param {string} [maskMode='transparent'] - 'transparent' | 'white_bg' | 'overlay'
 * @param {string} [originalImageDataUrl]   - overlay 模式需要的原图 base64
 * @param {string} [type='lasso']           - 'point' | 'lasso' | 'segmentation'
 * @param {number} [pointX=0]               - point 类型的中心 x (display 坐标系)
 * @param {number} [pointY=0]               - point 类型的中心 y (display 坐标系)
 * @param {string} [color='#3B82F6']        - 编辑区域叠加颜色
 * @param {string} [label='A']              - 代号标签
 * @returns {Promise<string>} 蒙版/合成图 data URL
 */
export async function generateMaskDataUrl(
  points,
  displayWidth,
  displayHeight,
  outputWidth = 1024,
  outputHeight = 1024,
  maskMode = 'transparent',
  originalImageDataUrl = null,
  type = 'lasso',
  pointX = 0,
  pointY = 0,
  color = '#3B82F6',
  label = 'A'
) {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  const scaleX = outputWidth / (displayWidth || 1);
  const scaleY = outputHeight / (displayHeight || 1);

  // 1. 绘制底图（三种模式唯一区别）
  if (maskMode === 'white_bg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  } else if (maskMode === 'overlay') {
    if (originalImageDataUrl) {
      try {
        await drawOriginalImage(ctx, originalImageDataUrl, outputWidth, outputHeight);
      } catch (e) {
        console.warn('[MaskGenerator] overlay 模式原图加载失败，降级为 transparent:', e.message);
      }
    } else {
      console.warn('[MaskGenerator] overlay 模式缺少 originalImageDataUrl，降级为 transparent');
    }
  }
  // transparent: 什么也不画，保持透明

  // 2. 绘制编辑区域叠加层（所有模式通用）
  //    半透明彩色填充 + 描边
  const alpha = color.length === 7 ? '59' : '59'; // ~0.35 opacity
  ctx.fillStyle = color + alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  if (type === 'point') {
    drawCircleRegion(ctx, pointX, pointY, scaleX, scaleY);
  } else if (points && points.length >= 3) {
    drawPolygonRegion(ctx, points, scaleX, scaleY);
  } else {
    // 点数不足 3 又不是 point 类型 → 返回仅含底图的画布
    console.warn('[MaskGenerator] 有效编辑区域数据不足');
  }

  // 3. 绘制代号标签（所有模式通用）
  drawLabel(ctx, label, outputWidth);

  return canvas.toDataURL('image/png');
}