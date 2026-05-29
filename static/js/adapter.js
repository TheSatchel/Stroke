/**
 * adapter.js — 生成器注册中心
 *
 * 统一管理所有平台生成器实现。
 * 不直接处理 HTTP 请求，只做注册、切换、协调。
 *
 * 使用示例：
 *   import { GeneratorService } from './adapter.js';
 *   const gen = new GeneratorService();
 *   gen.use('openai', { apiKey: 'sk-...', model: 'dall-e-3' });
 *   const svg = await gen.generate({ prompt, imageBase64 });
 */

import { GPTChatAdapter } from './adapters/GPTChatAdapter.js';
import { XianyuGPTChatAdapter } from './adapters/XianyuGPTChatAdapter.js';
import { showWarningToast } from './utils/Toast.js';

const BUILTIN = [
  XianyuGPTChatAdapter,
  GPTChatAdapter,
];

export class GeneratorService {
  constructor() {
    this._registry = new Map();
    this._active = null;
    this._activeId = '';

    for (const Cls of BUILTIN) {
      this.register(Cls);
    }
  }

  register(GeneratorClass) {
    this._registry.set(GeneratorClass.id, GeneratorClass);
  }

  getProviders() {
    const result = [];
    for (const [id, Cls] of this._registry) {
      result.push({
        id,
        label: Cls.label,
        defaultModel: Cls.defaultModel,
        models: Cls.models || []
      });
    }
    return result;
  }

  getProviderClass(id) {
    return this._registry.get(id) || null;
  }

  get activeId() {
    return this._activeId;
  }

  get activeConfig() {
    return this._active ? { ...this._active.config } : {};
  }

  use(id, config = {}) {
    const Cls = this._registry.get(id);
    if (!Cls) {
      console.warn('[Generator] 未知平台:', id);
      return false;
    }

    // 始终创建新实例，防止段间 config 残余
    if (this._active && this._activeId === id) {
      this._active = new Cls(config);
      console.log('[Generator] 同平台重建实例:', id, config);
      return true;
    }

    this._active = new Cls(config);
    this._activeId = id;
    console.log('[Generator] 切换到:', id, config);
    return true;
  }

  async generate(params) {
    if (!this._active) {
      throw new Error('[Generator] 没有活跃的生成器，请先调用 use()');
    }
    return this._active.generate(params);
  }
}