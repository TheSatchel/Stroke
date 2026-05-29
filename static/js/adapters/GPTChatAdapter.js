/**
 * — Chat Completions 风格生成器
 *
 * 适用于任何兼容 OpenAI /v1/chat/completions 的 API。
 * 支持 bad_response_status_code 时自动 fallback 到备用模型。
 *
 * 子类（如 XianyuGPTChatAdapter）只需覆盖：
 *   static id, label, defaultEndpoint, models, configParams
 */

import { BaseAdapters } from './BaseAdapters.js';
import { showToast } from '../utils/Toast.js';

export class GPTChatAdapter extends BaseAdapters {
  static get id() { return 'gpt-chat'; }
  static get label() { return 'OpenAI Chat API'; }
  static get defaultModel() { return 'gpt-4o'; }
  static get defaultEndpoint() { return 'https://api.openai.com/v1/chat/completions'; }
  static get defaultConcurrency() { return 3; }

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
      },
      {
        name: 'mask_mode',
        label: '蒙版模式',
        type: 'choice',
        options: ['transparent', 'white_bg', 'overlay'],
        defaultValue: 'transparent',
        displayAs: 'dropdown'
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

    // ★ 所有原图（image widget / canvas_ref_image / region 原图）
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

    if (/[^\x00-\xFF]/.test(apiKey)) {
      throw new Error('API Key 输入可能有误，请检查是否包含中文或特殊字符');
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
        const serverMsg = data?.error?.message || data?.message || '';
        const serverCode = data?.error?.code || data?.code || '';
        const errDetail = serverMsg
          ? `${serverCode ? `[${serverCode}] ` : ''}${serverMsg}`
          : `状态码 ${resp.status}`;
        showToast(`${label} API 请求失败: ${errDetail}`, 'error', 10000);

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

        throw new Error('API 请求失败: ' + errDetail);
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
        } else if (imageResult.type === 'url') {
          // 图片 URL → 下载转为 data URL
          console.log(`[${adapterId}] 生成结果类型: URL (${imageResult.url})`);
          const dataUrl = await this._downloadImageUrl(imageResult.url);
          if (!this._isValidRasterDataUrl(dataUrl)) {
            showToast(`${label} 下载的图片 data URL 无效`, 'error');
            throw new Error('下载的图片格式无效');
          }
          return { type: 'raster', dataUrl };
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
      if (isFallback || /API Key|ISO-8859|header/i.test(err.message)) {
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

  // ================================================================
  //  _downloadImageUrl — 下载普通图片 URL 并转为 data URL
  // ================================================================

  async _downloadImageUrl(url) {
    const imgResp = await fetch(url);
    if (!imgResp.ok) {
      throw new Error('下载图片失败，状态码: ' + imgResp.status);
    }
    const blob = await imgResp.blob();
    const mime = blob.type || 'image/png';
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const arr = result.split(',');
          resolve(arr.length > 1 ? arr[1] : arr[0]);
        } else {
          reject(new Error('FileReader 未返回字符串'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader 读取失败'));
      reader.readAsDataURL(blob);
    });
    return 'data:' + mime + ';base64,' + b64;
  }
}
