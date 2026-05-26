/**
 * GenerationPipeline.js — 后台生成任务管线 (Command 模式)
 *
 * 职责：任务构建、队列执行、重试调度、adapter 切换、清理
 *
 * 不负责：
 *   - 具体 HTTP 请求（委托 GeneratorService）
 *   - 存储持久化（委托 PersistenceGuard）
 */
import { parse as parseSegments } from '../services/segmentparser.js';
import { loadConfigs } from '../locals/storage.js';
import { isRetryable, backoffDelay, MAX_RETRIES, BASE_DELAY_MS } from './RetryHandler.js';
import WakeLockManager from './WakeLockManager.js';
import VisibilityMonitor from './VisibilityMonitor.js';
import { formatResult } from './ResultFormatter.js';

/**
 * @typedef {Object} SegmentTask
 * @property {string} callTabId
 * @property {string} prompt
 * @property {string[]} imageBase64List
 * @property {Array} maskSpecs
 * @property {string} configId
 * @property {string} fingerprint
 * @property {number} retryCount
 * @property {string} status   - 'pending' | 'running' | 'done' | 'failed'
 * @property {Object} [result]
 */

/**
 * @typedef {Object} PipelineCallbacks
 * @property {function(SegmentTask, number, number):void} onSegmentStart
 * @property {function(SegmentTask, number, number, number, number):void} onSegmentRetry
 * @property {function(SegmentTask):void} onSegmentDone
 * @property {function(SegmentTask, Error):void} onSegmentFail
 * @property {function(number, number):void} onAllDone
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

    this._wakeLockManager = new WakeLockManager();
    this._visibilityMonitor = new VisibilityMonitor();
    this._visibilityMonitor.setTarget(this);
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
  async start(tabsConfig, tabValues, callWidgetConfigs) {
    if (this.running) {
      console.warn('[GenerationPipeline] 已有运行中的管线');
      return;
    }

    const configIds = {};
    for (const [k, v] of Object.entries(callWidgetConfigs)) {
      configIds[k] = v.configId;
    }
    const segments = parseSegments(tabsConfig, tabValues, configIds);

    const firstCallConfig = Object.values(callWidgetConfigs || {})[0];
    const maskMode = firstCallConfig?.params?.mask_mode || 'transparent';

    const taskPromises = segments.map(async (seg) => {
      const imageList = [...(seg.imageBase64List || [])];
      const originalImage = imageList.length > 0 ? imageList[0] : null;

      console.log(`[GenerationPipeline] 段 ${seg.callTabId} 基础图片 ${imageList.length} 张, 待生成蒙版 ${(seg.maskSpecs || []).length} 个`);

      for (const spec of (seg.maskSpecs || [])) {
        try {
          const { generateMaskDataUrl } = await import('../utils/MaskGenerator.js');
          const mask = await generateMaskDataUrl(
            spec.points,
            spec.displayWidth,
            spec.displayHeight,
            spec.outputWidth,
            spec.outputHeight,
            maskMode,
            originalImage,
            spec.type,
            spec.pointX,
            spec.pointY,
            spec.color,
            spec.label
          );
          if (mask) {
            imageList.push(mask);
            const lenKB = (mask.length / 1024).toFixed(1);
            console.log(`[GenerationPipeline] 蒙版生成成功: label=${spec.label} type=${spec.type} mode=${maskMode} size=${lenKB}KB`);
          }
        } catch (e) {
          console.error('[GenerationPipeline] 蒙版生成失败:', e);
        }
      }

      return {
        callTabId: seg.callTabId,
        prompt: seg.prompt,
        imageBase64List: imageList,
        maskSpecs: seg.maskSpecs || [],
        configId: seg.configId,
        fingerprint: seg.fingerprint || '',
        retryCount: 0,
        status: 'pending',
        result: null,
        _callWidgetConfig: callWidgetConfigs[seg.callTabId] || null
      };
    });

    this.tasks = await Promise.all(taskPromises);

    this.running = true;
    this.paused = false;

    await this._wakeLockManager.acquire();
    this._visibilityMonitor.listen();

    try {
      await this._executeAll();
    } finally {
      this._cleanup();
    }
  }

  pause() {
    if (this.running && !this.paused) {
      this.paused = true;
      console.log('[GenerationPipeline] 管线已暂停');
    }
  }

  resume() {
    if (this.running && this.paused) {
      this.paused = false;
      console.log('[GenerationPipeline] 管线已恢复');
    }
  }

  // ================================================================
  //  内部方法
  // ================================================================

  async _executeAll() {
    const totalSegments = this.tasks.length;

    // 按 fingerprint 分组，同 fp 的任务串行（共享 lastBase64），不同 fp 可并发
    const groups = [];
    const seen = new Set();
    for (let i = 0; i < totalSegments; i++) {
      const task = this.tasks[i];
      const fp = task.fingerprint || '__default__';
      if (!seen.has(fp)) {
        seen.add(fp);
        groups.push({
          fingerprint: fp,
          tasks: this.tasks.filter(t => (t.fingerprint || '__default__') === fp),
        });
      }
    }

    const concurrency = this._getConcurrency();
    console.log(`[GenerationPipeline] ${totalSegments} 段, ${groups.length} 指纹组, 并发=${concurrency}`);

    const resultMap = new Map();

    const runGroup = async (group) => {
      let lastBase64 = null;
      for (const task of group.tasks) {
        const origIndex = this.tasks.indexOf(task);

        while (this.paused) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const imageList = [...task.imageBase64List];
        if (lastBase64 && !imageList.includes(lastBase64)) {
          console.log(`[GenerationPipeline] 段(fp=${group.fingerprint}) 追加上游结果图`);
          imageList.push(lastBase64);
        }

        this._switchAdapter(task);

        task.status = 'running';
        if (this.callbacks.onSegmentStart) {
          this.callbacks.onSegmentStart(task, origIndex, totalSegments);
        }

        try {
          const result = await this._retryableGenerate(task, imageList, origIndex, totalSegments);
          lastBase64 = result.base64 || '';
          task.status = 'done';
          task.result = result;
          resultMap.set(origIndex, result);
          if (this.callbacks.onSegmentDone) {
            this.callbacks.onSegmentDone(task);
          }
        } catch (err) {
          task.status = 'failed';
          console.error(`[GenerationPipeline] 段(fp=${group.fingerprint}) 最终失败:`, err);
          if (this.callbacks.onSegmentFail) {
            this.callbacks.onSegmentFail(task, err);
          }
        }
      }
    };

    // 并发调度：限制同时运行的组数
    if (concurrency <= 1 || groups.length <= 1) {
      for (const group of groups) {
        await runGroup(group);
      }
    } else {
      const queue = [...groups];
      const inflight = [];
      while (queue.length > 0 || inflight.length > 0) {
        while (queue.length > 0 && inflight.length < concurrency) {
          const g = queue.shift();
          const p = runGroup(g).then(() => {
            const idx = inflight.indexOf(p);
            if (idx >= 0) inflight.splice(idx, 1);
          });
          inflight.push(p);
        }
        if (inflight.length > 0) {
          await Promise.race(inflight);
        }
      }
    }

    const segmentResults = [...resultMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, r]) => r);

    const succeeded = segmentResults.length;
    if (this.callbacks.onAllDone) {
      this.callbacks.onAllDone(succeeded, totalSegments);
    }

    return segmentResults;
  }

  async _retryableGenerate(task, imageList, segmentIndex = 0, totalSegments = 1) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[GenerationPipeline] 段 ${task.callTabId} 第 ${attempt} 次重试...`);
          if (this.callbacks.onSegmentRetry) {
            this.callbacks.onSegmentRetry(task, attempt, MAX_RETRIES, segmentIndex, totalSegments);
          }
          await backoffDelay(attempt);
        }

        while (this.paused) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const imageResult = await this.generator.generate({
          prompt: task.prompt,
          imageBase64List: imageList
        });

        return await formatResult(imageResult, task.callTabId);
      } catch (err) {
        lastError = err;

        if (!isRetryable(err)) {
          console.warn(`[GenerationPipeline] 不可重试的错误:`, err.name, err.message);
          throw err;
        }

        if (attempt < MAX_RETRIES) {
          console.warn(`[GenerationPipeline] 可重试错误 (${err.name}): ${err.message}，将在 ${BASE_DELAY_MS * Math.pow(2, attempt)}ms 后重试`);
        }
      }
    }

    throw lastError;
  }

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

  _getConcurrency() {
    const firstTask = this.tasks[0];
    if (!firstTask || !firstTask._callWidgetConfig || !firstTask._callWidgetConfig.configId) {
      return 1;
    }
    const allConfigs = loadConfigs();
    const cfg = allConfigs.find(c => c.id === firstTask._callWidgetConfig.configId);
    return (cfg && typeof cfg.concurrency === 'number' && cfg.concurrency > 0) ? cfg.concurrency : 1;
  }

  _cleanup() {
    this.running = false;
    this.paused = false;
    this._visibilityMonitor.unbind();
    this._wakeLockManager.release();
    console.log('[GenerationPipeline] 管线资源已清理');
  }
}
