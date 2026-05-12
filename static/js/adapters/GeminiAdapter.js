/**
 * — Chat Completions 风格生成器
 *
 * 适用于任何兼容 OpenAI /v1/chat/completions 的 API。
 * 支持 bad_response_status_code 时自动 fallback 到备用模型。
 *
 * 子类（如 XianyuGeminiAdapter）只需覆盖：
 *   static id, label, defaultEndpoint, models, configParams
 */

import { BaseAdapters } from './BaseAdapters.js';
import { showToast } from '../utils/Toast.js';

export class GPTChatAdapter extends BaseAdapters {
  static get id() { return 'gpt-chat'; }
  static get label() { return 'OpenAI Chat API'; }
  static get defaultModel() { return 'gpt-4o'; }
  static get defaultEndpoint() { return 'https://api.openai.com/v1/chat/completions'; }

  static get models() {
    return [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
    ];
  }
  /**
   * 官方 OpenAI Chat 参数
   */
  static get configParams() {
    return [
      {
        name: 'temperature',
        label: 'Temperature',
        type: 'slider',
        defaultValue: 0.7,
        min: 0,
        max: 2,
        step: 0.1,
        leftLabel: '0',
        rightLabel: '2',
        unit: ''
      },
      {
        name: 'top_p',
        label: 'Top P',
        type: 'slider',
        defaultValue: 0.9,
        min: 0,
        max: 1,
        step: 0.05,
        leftLabel: '0',
        rightLabel: '1',
        unit: ''
      },
      {
        name: 'max_tokens',
        label: 'Max Tokens',
        type: 'text',
        defaultValue: '4096',
        placeholder: '最大输出 token 数'
      }
    ];
  }

  constructor(config = {}) {
    super(config);
    if (!this.config.endpoint) {
      this.config.endpoint = this.constructor.defaultEndpoint;
    }
  }

  async generate({ prompt, imageBase64List }) {
    return this._generateViaChatEndpoint({ prompt, imageBase64List });
  }

  // ================================================================
  //  _generateViaChatEndpoint
  // ================================================================

  async _generateViaChatEndpoint({ prompt, imageBase64List }) {
    const endpoint    = this.config.endpoint || this.constructor.defaultEndpoint;
    const model       = this.config.model || this.constructor.defaultModel;
    const apiKey      = this.config.apiKey || '';
    const group       = this.config.group || 'allvip';
    const temperature = this.config.temperature ?? 0.7;
    const top_p       = this.config.top_p ?? 0.9;
    const maxTokens   = this.config.max_tokens ? parseInt(this.config.max_tokens, 10) : null;

    const messages = [];
    const contentParts = [{ type: 'text', text: prompt }];
    for (const b64 of (imageBase64List || [])) {
      if (b64) {
        contentParts.push({ type: 'image_url', image_url: { url: b64 } });
      }
    }
    messages.push({ role: 'user', content: contentParts });

    return this._callWithFallback({
      endpoint,
      model,
      apiKey,
      group,
      messages,
      temperature,
      top_p,
      maxTokens,
      isFallback: false
    });
  }

  // ================================================================
  //  _callWithFallback — 自动 fallback 逻辑
  // ================================================================

  async _callWithFallback({
    endpoint,
    model,
    apiKey,
    group,
    messages,
    temperature,
    top_p,
    maxTokens,
    isFallback
  }) {
    const label     = this.constructor.label;
    const adapterId = this.constructor.id;

    const effectiveModel = isFallback
      ? (this.config.fallbackModel || null)
      : model;

    if (!effectiveModel) {
      throw new Error('没有可用的模型（主模型和备用模型均为空）');
    }

    const payload = {
      model: effectiveModel,
      group: group,
      messages: messages,
      stream: false,
      temperature: temperature,
      top_p: top_p
    };
    if (maxTokens) {
      payload.max_tokens = maxTokens;
    }

    const headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const responseText = await resp.text();

      if (!responseText || responseText.trim() === '') {
        throw new Error('API 返回空响应');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        showToast(`${label} JSON 解析失败: ${e.message}`, 'error', 10000);
        throw new Error('API 返回的不是有效的 JSON 格式');
      }

      if (resp.status !== 200) {
        showToast(`${label} API 请求失败 (状态码 ${resp.status})`, 'error', 10000);

        // bad_response_status_code → fallback
        if (
          data &&
          data.error &&
          data.error.code === 'bad_response_status_code' &&
          !isFallback
        ) {
          showToast(`${label} 主模型异常，自动切换到备用模型`, 'warning', 6000);
          return this._callWithFallback({
            endpoint,
            model,
            apiKey,
            group,
            messages,
            temperature,
            top_p,
            maxTokens,
            isFallback: true
          });
        }

        throw new Error('API 请求失败，状态码: ' + resp.status);
      }

      // 解析响应 → ImageResult
      try {
        const rawText = data.choices[0].message.content;
        const imageResult = this._cleanToImage(rawText);

        if (imageResult.type === 'svg') {
          if (!this._isValidSvg(imageResult.svg)) {
            showToast(`${label} 清洗后仍不是有效 SVG`, 'error');
            throw new Error('API 返回的不是有效 SVG');
          }
          console.log(`[${adapterId}] 生成结果类型: SVG`);
        } else {
          if (!this._isValidRasterDataUrl(imageResult.dataUrl)) {
            showToast(`${label} 光栅图 data URL 无效`, 'error');
            throw new Error('API 返回的光栅图格式无效');
          }
          console.log(`[${adapterId}] 生成结果类型: 光栅图 (${(imageResult.dataUrl || '').substring(0, 50)}...)`);
        }

        return imageResult;
      } catch (e) {
        if (e.message && e.message.startsWith(`[${adapterId}]`)) {
          throw e;
        }
        showToast(`${label} API 响应结构错误: ${e.message}`, 'error');
        throw new Error('API 响应格式异常: ' + e.message);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('请求超时 (360s)');
      }
      if (isFallback) {
        throw err;
      }
      showToast(`${label} 网络错误，尝试 fallback: ${err.message}`, 'warning', 6000);
      return this._callWithFallback({
        endpoint,
        model,
        apiKey,
        group,
        messages,
        temperature,
        top_p,
        maxTokens,
        isFallback: true
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
