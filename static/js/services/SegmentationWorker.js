/**
 * SegmentationWorker.js — AI 分割推理 Worker
 *
 * 在独立线程中运行 Transformers.js 推理，避免阻塞主线程 UI。
 * 协议：
 *   Main → Worker: { type: 'load' }
 *   Main → Worker: { type: 'segment', imageDataUrl, clickX, clickY,
 *                     naturalWidth, naturalHeight }
 *   Worker → Main: { type: 'progress', message }
 *   Worker → Main: { type: 'ready' }
 *   Worker → Main: { type: 'result', maskPoints, classLabel, maskWidth, maskHeight }
 *   Worker → Main: { type: 'error', message }
 */

const MODEL_NAME = 'Xenova/segformer-b2-finetuned-ade-512-512';

let _pipeline = null;
let _lastImageDataUrl = null;
let _lastResults = null;

async function loadModel() {
  let TR_JS;
  const LOCAL_URL = new URL('../vendor/transformers-3.0.0.min.js', import.meta.url).href;
  const CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js';

  try {
    TR_JS = await import(LOCAL_URL);
  } catch (_e) {
    TR_JS = await import(CDN_URL);
  }

  const { pipeline, env } = TR_JS;

  const MODELS_BASE = new URL('../../models/', import.meta.url).href;
  env.remoteHost = MODELS_BASE;
  env.remotePathTemplate = '{model}/';

  self.postMessage({ type: 'progress', message: '⬇️ 正在加载 / 验证 AI 分割模型…' });
  _pipeline = await pipeline('image-segmentation', MODEL_NAME);
}

function findClassAtPoint(results, cx, cy, imgW, imgH) {
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

function maskToContour(mask, seedX, seedY) {
  const { width, height, data } = mask;
  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return [];

  // Flood-fill 从点击点出发，取连通分量
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

  // 径向扫描连通分量轮廓
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

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      if (!_pipeline) {
        await loadModel();
      }
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'clear') {
      _lastImageDataUrl = null;
      _lastResults = null;
    } else if (msg.type === 'segment') {
      if (!_pipeline) {
        self.postMessage({ type: 'error', message: '模型未加载' });
        return;
      }
      const { imageDataUrl, clickX, clickY, naturalWidth, naturalHeight } = msg;

      let results;
      if (imageDataUrl === _lastImageDataUrl && _lastResults) {
        results = _lastResults;
      } else {
        results = await _pipeline(imageDataUrl);
        _lastResults = results;
        _lastImageDataUrl = imageDataUrl;
      }

      const found = findClassAtPoint(results, clickX, clickY, naturalWidth, naturalHeight);
      if (!found) {
        self.postMessage({ type: 'result', maskPoints: [], classLabel: null, maskWidth: 0, maskHeight: 0 });
        return;
      }

      const maskPoints = maskToContour(found.res.mask, found.px, found.py);
      self.postMessage({
        type: 'result',
        maskPoints,
        classLabel: found.res.label,
        maskWidth: found.res.mask.width,
        maskHeight: found.res.mask.height,
      });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker 错误' });
  }
};
