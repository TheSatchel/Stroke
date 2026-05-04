/**
 * XianyuAdapter.js — 鲜鱼 API 生成器
 *
 * 基于 api_caller.py 逻辑翻译为 JS，继承 BaseAdapters。
 * 支持 bad_response_status_code 时自动 fallback 到用户在 SettingsModal 中选定的备用模型。
 */

import { BaseAdapters } from './BaseAdapters.js';
import { showToast } from '../components/Toast.js';

export class XianyuAdapter extends BaseAdapters {
  static get id() { return 'xianyu'; }
  static get label() { return '咸鱼 API (allgpt)'; }
  static get defaultModel() { return 'gemini-3.0-pro-image'; }
  static get defaultEndpoint() { return 'https://allgpt.xianyuw.cn/v1/chat/completions'; }

  static get models() {
    return [
      { id: 'gemini-3.0-pro-image', label: 'Nano Banana Pro' },
      { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' }
    ];
  }

  /**
   * 生成器专属的配置参数定义列表
   * 这些参数会动态渲染到 SettingsModal 中
   */
  static get configParams() {
    return [
      {
        name: 'group',
        label: '用户组',
        type: 'text',
        defaultValue: 'allvip',
        placeholder: '用户组标识'
      },
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
      }
    ];
  }

  constructor(config = {}) {
    // 确保 endpoint 有默认值
    const mergedConfig = {
      endpoint: XianyuAdapter.defaultEndpoint,
      ...config
    };
    super(mergedConfig);
  }

  /**
   * 执行一次图像生成
   * @param {Object} params
   * @param {string} params.prompt            - 拼接后的 prompt 字符串
   * @param {string[]} [params.imageBase64List] - 参考图 base64 列表
   * @returns {Promise<ImageResult>}
   */
  async generate({ prompt, imageBase64List }) {
    const endpoint = this.config.endpoint || XianyuAdapter.defaultEndpoint;
    const model = this.config.model || XianyuAdapter.defaultModel;
    const apiKey = this.config.apiKey || '';
    const group = this.config.group || 'allvip';
    const temperature = this.config.temperature ?? 0.7;
    const top_p = this.config.top_p ?? 0.9;

    // 构建 messages（multimodal 格式，支持多图）
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
      isFallback: false
    });
  }

  /**
   * 内部请求方法，支持自动 fallback
   */
  async _callWithFallback({
    endpoint,
    model,
    apiKey,
    group,
    messages,
    temperature,
    top_p,
    isFallback
  }) {
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

    const headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000); // 360s 超时

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
        showToast('Xianyu JSON 解析失败: ' + e.message, 'error', 10000);
        throw new Error('API 返回的不是有效的 JSON 格式');
      }

      if (resp.status !== 200) {
        showToast('Xianyu API 请求失败 (状态码 ' + resp.status + ')', 'error', 10000);

        // 检测 bad_response_status_code → fallback
        if (
          data &&
          data.error &&
          data.error.code === 'bad_response_status_code' &&
          !isFallback
        ) {
          showToast('Xianyu 主模型异常，自动切换到备用模型', 'warning', 6000);
          return this._callWithFallback({
            endpoint,
            model,
            apiKey,
            group,
            messages,
            temperature,
            top_p,
            isFallback: true
          });
        }

        throw new Error('API 请求失败，状态码: ' + resp.status);
      }

      // 解析响应内容 → ImageResult（{ type:'svg', svg } | { type:'raster', dataUrl }）
      try {
        const rawText = data.choices[0].message.content;

        // 清洗响应（优先级：data URL > Markdown 图片语法 > 代码块 > 原始 SVG）
        const imageResult = this._cleanToImage(rawText);

        // 二次验证
        if (imageResult.type === 'svg') {
          if (!this._isValidSvg(imageResult.svg)) {
            showToast('Xianyu 清洗后仍不是有效 SVG', 'error');
            throw new Error('API 返回的不是有效 SVG');
          }
          console.log('[Xianyu] 生成结果类型: SVG');
        } else {
          if (!this._isValidRasterDataUrl(imageResult.dataUrl)) {
            showToast('Xianyu 光栅图 data URL 无效', 'error');
            throw new Error('API 返回的光栅图格式无效');
          }
          console.log('[Xianyu] 生成结果类型: 光栅图 (' +
            (imageResult.dataUrl || '').substring(0, 50) + '...)');
        }

        return imageResult;
      } catch (e) {
        // 清洗/解析错误不 fallback，直接抛出
        if (e.message && e.message.startsWith('[xianyu]')) {
          throw e;
        }
        showToast('Xianyu API 响应结构错误: ' + e.message, 'error');
        throw new Error('API 响应格式异常: ' + e.message);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('请求超时 (360s)');
      }
      // 如果已经尝试过 fallback，直接抛出
      if (isFallback) {
        throw err;
      }
      // 网络错误也尝试 fallback
      showToast('Xianyu 网络错误，尝试 fallback: ' + err.message, 'warning', 6000);
      return this._callWithFallback({
        endpoint,
        model,
        apiKey,
        group,
        messages,
        temperature,
        top_p,
        isFallback: true
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}