/**
 * GenerationPipeline.js — 后台生成任务管线 (Command 模式)
 *
 * 职责：
 *   - 将生成任务拆为 SegmentTask 队列
 *   - 指数退避重试：2s → 4s → 8s（共 4 次机会）
 *   - Wake Lock 防休眠（如果可用）
 *   - visibilitychange 暂停/恢复
 *   - 驱动 LineageManager 创建/追加版本
 *   - 每段完成后更新 UI（通过回调）
 *
 * 不负责：
 *   - 具体 HTTP 请求（委托 GeneratorService）
 *   - 存储持久化（委托 PersistenceGuard）
 */

import { parse as parseSegments } from './segmentparser.js';
import { svgToBase64DataUrl } from '../adapters/ResponseParser.js';
import { generateMaskDataUrl } from '../utils/MaskGenerator.js';
import { createThumbnail } from '../utils/Image.js';
import { loadConfigs } from '../locals/storage.js';

const MAX_RETRIES = 3;           // 最多重试 3 次 → 共 4 次机会
const BASE_DELAY_MS = 2000;      // 初始退避 2s
const RETRYABLE_ERRORS = [
  'AbortError',
  'NetworkError',
  'TimeoutError',
  'TypeError',                   // fetch() 失败
];

// 判断是否为可重试错误
function isRetryable(err) {
  if (!err) return false;
  // 检查错误名称
  if (err.name && RETRYABLE_ERRORS.includes(err.name)) return true;
  // 检查消息关键字
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('abort') || msg.includes('timeout')) return true;
  // 检查 HTTP 503 (SW 回退)
  if (err.status === 503 || (err.message && err.message.includes('503'))) return true;
  return false;
}

/**
 * 指数退避延迟
 * @param {number} attempt - 第几次重试 (1-based)
 * @returns {Promise<void>}
 */
function backoffDelay(attempt) {
  const ms = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @typedef {Object} SegmentTask
 * @property {string} callTabId
 * @property {string} prompt
 * @property {string[]} imageBase64List
 * @property {string} configId
 * @property {number} retryCount
 * @property {string} status   - 'pending' | 'running' | 'done' | 'failed'
 * @property {Object} [result]
 */

/**
 * @typedef {Object} PipelineCallbacks
 * @property {function(SegmentTask, number, number):void} onSegmentStart  - 段开始(task, segmentIndex, totalSegments)
 * @property {function(SegmentTask, number, number, number, number):void} onSegmentRetry - 重试中(task, attempt, maxRetries, segmentIndex, totalSegments)
 * @property {function(SegmentTask):void} onSegmentDone      - 段完成
 * @property {function(SegmentTask, Error):void} onSegmentFail - 段失败（最终）
 * @property {function(number, number):void} onAllDone       - 全部完成(succeeded, totalSegments)
 */

export default class GenerationPipeline {
  /**
   * @param {import('../Adapter.js').GeneratorService} generatorService
   * @param {import('../locals/LineageManager.js').default} lineageManager
   * @param {PipelineCallbacks} callbacks
   */
  constructor(generatorService, lineageManager, callbacks) {
    /** @type {import('../Adapter.js').GeneratorService} */
    this.generator = generatorService;

    /** @type {import('../locals/LineageManager.js').default} */
    this.lineageManager = lineageManager;

    /** @type {PipelineCallbacks} */
    this.callbacks = callbacks;

    /** @type {SegmentTask[]} */
    this.tasks = [];

    /** @type {boolean} */
    this.running = false;

    /** @type {boolean} */
    this.paused = false;

    /** @type {WakeLockSentinel|null} */
    this._wakeLock = null;

    /** @type {Function|null} 解绑 visibilitychange */
    this._visibilityUnbind = null;
  }

  // ================================================================
  //  公开 API
  // ================================================================

  /**
   * 构建段任务队列并开始执行
   * @param {Array} tabsConfig
   * @param {Object} tabValues
   * @param {Object} callWidgetConfigs - { [callTabId]: { configId, params } }
   */
  start(tabsConfig, tabValues, callWidgetConfigs) {
    if (this.running) {
      console.warn('[GenerationPipeline] 已有运行中的管线');
      return;
    }

    // 切分段
    const configIds = {};
    for (const [k, v] of Object.entries(callWidgetConfigs)) {
      configIds[k] = v.configId;
    }
    const segments = parseSegments(tabsConfig, tabValues, configIds);

    // 获取生成尺寸（来自第一个 call widget config，或默认 1024x1024）
    let outputWidth = 1024;
    let outputHeight = 1024;
    const firstCallConfig = Object.values(callWidgetConfigs || {})[0];
    if (firstCallConfig && firstCallConfig.params) {
      if (firstCallConfig.params.width) outputWidth = firstCallConfig.params.width;
      if (firstCallConfig.params.height) outputHeight = firstCallConfig.params.height;
    }

    // 构建任务列表
    this.tasks = segments.map(seg => ({
      callTabId: seg.callTabId,
      prompt: seg.prompt,
      imageBase64List: seg.imageBase64List || [],
      regionItems: (seg.regionItems || []).map(r => ({
        ...r,
        maskDataUrl: generateMaskDataUrl(
          r.points, r.displayWidth, r.displayHeight,
          outputWidth, outputHeight
        )
      })),
      configId: seg.configId,
      retryCount: 0,
      status: 'pending',
      result: null,
      _callWidgetConfig: callWidgetConfigs[seg.callTabId] || null
    }));

    this.running = true;
    this.paused = false;

    // 请求 Wake Lock
    this._acquireWakeLock();

    // 监听 visibilitychange
    this._listenVisibility();

    // 开始执行
    this._executeAll().finally(() => {
      this._cleanup();
    });
  }

  /**
   * 暂停管线（在 visibilitychange → hidden 时调用）
   */
  pause() {
    if (this.running && !this.paused) {
      this.paused = true;
      console.log('[GenerationPipeline] 管线已暂停');
    }
  }

  /**
   * 恢复管线（在 visibilitychange → visible 时调用）
   */
  resume() {
    if (this.running && this.paused) {
      this.paused = false;
      console.log('[GenerationPipeline] 管线已恢复');
    }
  }

  // ================================================================
  //  内部方法
  // ================================================================

  /**
   * 执行所有段任务
   */
  async _executeAll() {
    let lastBase64 = null;
    const segmentResults = [];
    const totalSegments = this.tasks.length;

    for (let si = 0; si < totalSegments; si++) {
      const task = this.tasks[si];

      // 等待暂停恢复
      while (this.paused) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 合并上游结果图
      const imageList = [...task.imageBase64List];
      if (lastBase64 && !imageList.includes(lastBase64)) {
        console.log(`[GenerationPipeline] 段${si} 追加上游结果图`);
        imageList.push(lastBase64);
      }

      // 切换 adapter 配置
      this._switchAdapter(task);

      // 通知段开始
      task.status = 'running';
      if (this.callbacks.onSegmentStart) {
        this.callbacks.onSegmentStart(task, si, totalSegments);
      }

      try {
        const result = await this._retryableGenerate(task, imageList, si, totalSegments);
        lastBase64 = result.base64 || '';
        task.status = 'done';
        task.result = result;
        segmentResults.push(result);

        if (this.callbacks.onSegmentDone) {
          this.callbacks.onSegmentDone(task);
        }
      } catch (err) {
        // 重试 4 次后仍失败
        task.status = 'failed';
        console.error(`[GenerationPipeline] 段${si} 最终失败:`, err);
        if (this.callbacks.onSegmentFail) {
          this.callbacks.onSegmentFail(task, err);
        }
        // 继续下一段
      }
    }

    // 全部完成回调 — 传成功段数和总段数
    const succeeded = segmentResults.length;
    if (this.callbacks.onAllDone) {
      this.callbacks.onAllDone(succeeded, totalSegments);
    }

    // 处理结果：创建/追加 lineage
    return segmentResults;
  }

  /**
   * 带重试的生成调用
   * @param {SegmentTask} task
   * @param {string[]} imageList
   * @returns {Promise<Object>} { callTabId, type, svg, dataUrl, base64, thumbnail }
   */
  async _retryableGenerate(task, imageList, segmentIndex = 0, totalSegments = 1) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[GenerationPipeline] 段 ${task.callTabId} 第 ${attempt} 次重试...`);
          // 通知重试（含上下文）
          if (this.callbacks.onSegmentRetry) {
            this.callbacks.onSegmentRetry(task, attempt, MAX_RETRIES, segmentIndex, totalSegments);
          }
          await backoffDelay(attempt);
        }

        // 等待暂停恢复（重试期间也可能被暂停）
        while (this.paused) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const imageResult = await this.generator.generate({
          prompt: task.prompt,
          imageBase64List: imageList,
          regionItems: task.regionItems
        });

        // 根据 ImageResult.type 分派
        let resultBase64 = '';
        if (imageResult.type === 'raster') {
          resultBase64 = imageResult.dataUrl || '';
        } else {
          // SVG → base64 data URL
          resultBase64 = svgToBase64DataUrl(imageResult.svg || '');
        }

        // 生成缩略图
        let thumbnail = '';
        if (resultBase64) {
          thumbnail = await createThumbnail(resultBase64, 128);
        }

        return {
          callTabId: task.callTabId,
          type: imageResult.type || 'svg',
          svg: imageResult.type === 'svg' ? imageResult.svg : '',
          dataUrl: imageResult.type === 'raster' ? imageResult.dataUrl : '',
          base64: resultBase64,
          thumbnail
        };
      } catch (err) {
        lastError = err;

        // 判断是否可重试
        if (!isRetryable(err)) {
          console.warn(`[GenerationPipeline] 不可重试的错误:`, err.name, err.message);
          throw err; // 不重试，直接失败
        }

        if (attempt < MAX_RETRIES) {
          console.warn(`[GenerationPipeline] 可重试错误 (${err.name}): ${err.message}，将在 ${BASE_DELAY_MS * Math.pow(2, attempt)}ms 后重试`);
        }
      }
    }

    // 所有重试都已用完
    throw lastError;
  }

  /**
   * 切换 adapter 配置
   */
  _switchAdapter(task) {
    const callCfg = task._callWidgetConfig;
    if (!callCfg || !callCfg.configId) return;

    const allConfigs = loadConfigs();
    const cfg = allConfigs.find(c => c.id === callCfg.configId);
    if (!cfg) return;

    const perCallCfg = {
      apiKey: cfg.apiKey,
      endpoint: cfg.endpoint,
      model: cfg.model,
      fallbackModel: cfg.fallbackModel,
      concurrency: cfg.concurrency,
      ...cfg.params,
      ...(callCfg.params || {})
    };
    this.generator.use(cfg.adapter, perCallCfg);
  }

  /**
   * 请求 Wake Lock（防休眠）
   */
  async _acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this._wakeLock = await navigator.wakeLock.request('screen');
        console.log('[GenerationPipeline] Wake Lock 已激活');
        this._wakeLock.addEventListener('release', () => {
          console.log('[GenerationPipeline] Wake Lock 已释放');
        });
      } catch (e) {
        // Wake Lock 可能被用户拒绝或浏览器不支持
        console.warn('[GenerationPipeline] Wake Lock 不可用:', e.message);
      }
    }
  }

  /**
   * 释放 Wake Lock
   */
  async _releaseWakeLock() {
    if (this._wakeLock) {
      try {
        await this._wakeLock.release();
      } catch (e) {
        // ignore
      }
      this._wakeLock = null;
    }
  }

  /**
   * 监听 visibilitychange
   */
  _listenVisibility() {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        this.pause();
      } else if (document.visibilityState === 'visible') {
        this.resume();
      }
    };
    document.addEventListener('visibilitychange', handler);
    this._visibilityUnbind = () => document.removeEventListener('visibilitychange', handler);
  }

  /**
   * 清理资源
   */
  _cleanup() {
    this.running = false;
    this.paused = false;
    if (this._visibilityUnbind) {
      this._visibilityUnbind();
      this._visibilityUnbind = null;
    }
    this._releaseWakeLock();
    console.log('[GenerationPipeline] 管线资源已清理');
  }
}
