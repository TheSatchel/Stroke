/**
 * GenerationScheduler.js — 生成调用任务调度器
 *
 * 统一管理：
 *   - 按配置的并发槽位占用追踪
 *   - 活跃管线计数
 *   - 启动前并发可用性检查
 *
 * 由 App 创建实例，通过 app.scheduler 注入到 Generator / ConfigPanel 等消费者。
 */

import { loadConfigs } from '../locals/storage.js';

export default class GenerationScheduler {
  constructor() {
    this._usage = {};       // { [configId]: number }
    this._activeCount = 0;
  }

  /** 当前活跃的生成管线数 */
  get activeCount() {
    return this._activeCount;
  }

  /**
   * 检查给定 call widget 配置集是否可启动新管线
   * @param {Object<string, {configId:string}>} callWidgetConfigs
   * @returns {{ canStart: boolean, blocked: Array, available: Array, configIds: string[] }}
   */
  checkConcurrency(callWidgetConfigs) {
    const allConfigs = loadConfigs();
    const configIds = new Set();
    for (const v of Object.values(callWidgetConfigs)) {
      if (v && v.configId) configIds.add(v.configId);
    }

    const blocked = [];
    const available = [];

    for (const configId of configIds) {
      const cfg = allConfigs.find(c => c.id === configId);
      const limit = (cfg && typeof cfg.concurrency === 'number' && cfg.concurrency > 0) ? cfg.concurrency : 1;
      const used = this._usage[configId] || 0;
      if (used >= limit) {
        blocked.push({ name: cfg?.name || configId, configId, limit, used });
      } else {
        available.push({ name: cfg?.name || configId, configId, limit, used });
      }
    }

    return { canStart: blocked.length === 0, blocked, available, configIds: [...configIds] };
  }

  /** 占用指定配置的并发槽位，活跃计数 +1 */
  acquire(configIds) {
    for (const configId of configIds) {
      this._usage[configId] = (this._usage[configId] || 0) + 1;
    }
    this._activeCount++;
  }

  /** 释放指定配置的并发槽位，活跃计数 -1 */
  release(configIds) {
    for (const configId of configIds) {
      if (this._usage[configId] > 0) this._usage[configId]--;
      if (this._usage[configId] === 0) delete this._usage[configId];
    }
    this._activeCount = Math.max(0, this._activeCount - 1);
  }
}
