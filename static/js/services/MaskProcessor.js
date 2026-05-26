/**
 * MaskProcessor.js — 语义分割掩码处理算法
 *
 * 导出纯函数：点查找 + 轮廓提取（BFS 漫水 + 极坐标采样）
 */

/**
 * 在分割结果中查找点击位置对应的类别
 * @param {Array} results - 模型分割结果数组 [{ mask: { width, height, data }, label }]
 * @param {number} cx - 点击点 X（图像像素坐标）
 * @param {number} cy - 点击点 Y（图像像素坐标）
 * @param {number} imgW - 图像自然宽度
 * @param {number} imgH - 图像自然高度
 * @returns {Object|null} { res, px, py } 或 null
 */
export function findClassAtPoint(results, cx, cy, imgW, imgH) {
  if (!results || results.length === 0) return null;
  const maskW = results[0].mask.width;
  const maskH = results[0].mask.height;
  const px = Math.floor(cx / imgW * maskW);
  const py = Math.floor(cy / imgH * maskH);
  const idx = py * maskW + px;
  for (const res of results) {
    if (res.mask.data[idx] > 128) return { res, px, py };
  }
  return null;
}

/**
 * 从掩码中提取外轮廓点（BFS 漫水 + 极坐标采样）
 * @param {Object} mask - { width, height, data: Uint8Array }
 * @param {number} seedX - 种子点 X
 * @param {number} seedY - 种子点 Y
 * @returns {Array<{x:number, y:number}>} 轮廓点数组
 */
export function maskToContour(mask, seedX, seedY) {
  const { width, height, data } = mask;
  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return [];

  const visited = new Uint8Array(width * height);
  const queue = [{ x: seedX, y: seedY }];
  visited[seedY * width + seedX] = 1;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let head = 0;

  while (head < queue.length) {
    const { x, y } = queue[head++];
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;

    const n4 = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for (const [nx, ny] of n4) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (!visited[ni] && data[ni] > 128) {
        visited[ni] = 1;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  const pixelCount = queue.length;
  if (pixelCount === 0) return [];

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const numSteps = 72;
  const points = [];
  for (let i = 0; i < numSteps; i++) {
    const angle = (i / numSteps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let bestD = 0, bestX = cx, bestY = cy;
    const maxR = Math.max(width, height);
    for (let r = 0; r < maxR; r++) {
      const sx = Math.round(cx + dx * r);
      const sy = Math.round(cy + dy * r);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) break;
      if (visited[sy * width + sx]) { bestD = r; bestX = sx; bestY = sy; }
    }
    if (bestD > 0) points.push({ x: bestX, y: bestY });
  }
  return points;
}
