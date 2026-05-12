/**
 * GPTImageAdapter.js — DALL-E / GPT Image API 生成器
 *
 * 适用于 OpenAI /v1/images/generations 和 /v1/images/edits 端点。
 *
 * 子类（如 XianyuGPTAdapter）只需覆盖：
 *   static id, label, defaultEndpoint, models, configParams
 */

import { BaseAdapters } from './BaseAdapters.js';
import { showToast } from '../utils/Toast.js';

export class GPTImageAdapter extends BaseAdapters {
  static get id() { return 'gpt-image'; }
  static get label() { return 'OpenAI Image API'; }
  static get defaultModel() { return 'gpt-image-2'; }
  static get defaultEndpoint() { return 'https://api.openai.com/v1/images/generations'; }

  static get models() {
    return [
      { id: 'gpt-image-2', label: 'GPT Image 2' }
    ];
  }

  static get configParams() {
    return [
      {
        name: 'width',
        label: '宽度',
        type: 'slider',
        min: 256,
        max: 3840,
        step: 16,
        defaultValue: 1024,
        leftLabel: '256',
        rightLabel: '3840',
        unit: ' px',
        describe: '图像宽度 (16 的倍数)'
      },
      {
        name: 'height',
        label: '高度',
        type: 'slider',
        min: 256,
        max: 3840,
        step: 16,
        defaultValue: 1024,
        leftLabel: '256',
        rightLabel: '3840',
        unit: ' px',
        describe: '图像高度 (16 的倍数)'
      },
      {
        name: 'quality',
        label: '画质',
        type: 'choice',
        displayAs: 'dropdown',
        defaultValue: 'standard',
        options: ['standard', 'hd']
      },
      {
        name: 'output_format',
        label: '输出格式',
        type: 'choice',
        displayAs: 'dropdown',
        defaultValue: 'png',
        options: ['png', 'jpg', 'webp']
      },
      {
        name: 'background',
        label: '背景',
        type: 'choice',
        displayAs: 'dropdown',
        defaultValue: 'opaque',
        options: ['opaque', 'transparent']
      },

    ];
  }

  constructor(config = {}) {
    super(config);
    // 确保 endpoint 有默认值（在 super 之后才能使用 this.constructor）
    if (!this.config.endpoint) {
      this.config.endpoint = this.constructor.defaultEndpoint;
    }
  }

  /**
   * 执行一次图像生成
   */
  async generate({ prompt, imageBase64List, regionItems }) {
    return this._generateViaImageEndpoint({ prompt, imageBase64List, regionItems });
  }

  /**
   * 将 base64 data URL 转换为 Blob
   */
  _b64ToBlob(b64) {
    const arr = b64.split(',');
    const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const byteChars = atob(arr[1]);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  /**
   * 构建 Inpainting 专用 prompt
   */
  _buildInpaintingPrompt(region) {
    const userText = (region.prompt || '').trim();
    if (!userText) return '';
    return `仅修改白色蒙版区域内的内容：${userText}。蒙版以外（透明/黑色区域）必须与原图完全一致，边缘自然过渡。`;
  }

  // ================================================================
  //  _generateViaImageEndpoint
  // ================================================================

  async _generateViaImageEndpoint({ prompt, imageBase64List, regionItems }) {
    const label        = this.constructor.label;
    const model        = this.config.model || this.constructor.defaultModel;
    const width        = this.config.width || 1024;
    const height       = this.config.height || 1024;
    const size         = width + 'x' + height;
    const quality      = this.config.quality || 'standard';
    const outputFormat = this.config.output_format || 'png';
    const background   = this.config.background || 'opaque';
    const moderation   = 'low';
    const apiKey       = this.config.apiKey || '';
    const hasRefs      = imageBase64List && imageBase64List.length > 0;
    const hasRegions   = regionItems && regionItems.length > 0;

    // 支持自定义 endpoint
    const baseEndpoint = this.config.endpoint || this.constructor.defaultEndpoint;
    let endpoint = baseEndpoint;

    let body;
    let headers;

    if (hasRegions) {
      // ==================== Inpainting 模式 ====================
      endpoint = baseEndpoint.replace(/\/images\/generations$/, '/images/edits');
      const region = regionItems[0];  // v1: 单区域

      const fd = new FormData();
      fd.append('model', model);
      fd.append('prompt', this._buildInpaintingPrompt(region));
      fd.append('size', size);
      fd.append('quality', quality);
      fd.append('output_format', outputFormat);
      fd.append('background', background);

      // 原图
      if (region.imageDataUrl) {
        fd.append('image', this._b64ToBlob(region.imageDataUrl), 'image.png');
      }

      // 蒙版
      if (region.maskDataUrl) {
        fd.append('mask', this._b64ToBlob(region.maskDataUrl), 'mask.png');
      } else {
        console.warn('[GPTImageAdapter] 无蒙版数据，Inpainting 请求可能失败');
      }

      body = fd;
      headers = { 'Authorization': 'Bearer ' + apiKey };

    } else if (hasRefs) {
      // ==================== 有参考图但无选区（现有逻辑） ====================
      endpoint = baseEndpoint.replace(/\/images\/generations$/, '/images/edits');
      const fd = new FormData();
      fd.append('model', model);
      fd.append('prompt', prompt);
      fd.append('size', size);
      fd.append('quality', quality);
      fd.append('output_format', outputFormat);
      fd.append('background', background);

      for (const b64 of imageBase64List) {
        if (!b64) continue;
        const blob = this._b64ToBlob(b64);
        fd.append('image', blob, 'ref.png');
      }

      body = fd;
      headers = { 'Authorization': 'Bearer ' + apiKey };
    } else {
      // ==================== 纯文本生图 ====================
      body = JSON.stringify({
        model,
        prompt,
        size,
        quality,
        output_format: outputFormat,
        background,
        moderation,
        n: 1
      });
      headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
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
        throw new Error('API 请求失败，状态码: ' + resp.status);
      }

      return await this._processImageApiResponse(data, outputFormat);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('请求超时 (360s)');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 解析 Images API 响应, 统一处理 b64_json / url 两种格式
   * @param {Object} data - 解析后的 JSON 响应
   * @param {string} outputFormat - 默认图片格式 (png / jpg / webp)
   * @returns {{ type: 'raster', dataUrl: string }}
   */
  async _processImageApiResponse(data, outputFormat = 'png') {
    const label = this.constructor.label;

    const dataArr = data.data || [];
    if (!dataArr.length) {
      throw new Error('API 响应中未包含图片数据 (data 数组为空)');
    }

    const item  = dataArr[0];
    let b64 = item.b64_json;
    let dataUrl = null;

    if (b64) {
      dataUrl = 'data:image/' + outputFormat + ';base64,' + b64;
    } else if (item.url) {
      // 返回的是普通 URL，需要 fetch 转为 data URL
      try {
        const imgResp = await fetch(item.url);
        if (!imgResp.ok) throw new Error('下载图片失败，状态码: ' + imgResp.status);
        const blob = await imgResp.blob();
        const actualMime = blob.type || ('image/' + outputFormat);
        b64 = await new Promise((resolve, reject) => {
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
        dataUrl = 'data:' + actualMime + ';base64,' + b64;
      } catch (downloadErr) {
        throw new Error('从 URL 下载图片失败: ' + downloadErr.message);
      }
    } else {
      throw new Error('API 响应中未包含 b64_json 或 url 字段');
    }

    console.log(`[${this.constructor.id}] 生成结果: ${dataUrl.substring(0, 60)}...`);

    if (!this._isValidRasterDataUrl(dataUrl)) {
      showToast(`${label} 光栅图 data URL 无效`, 'error');
      throw new Error('API 返回的光栅图格式无效');
    }

    return { type: 'raster', dataUrl };
  }
}