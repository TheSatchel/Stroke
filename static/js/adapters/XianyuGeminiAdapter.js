/**
 * XianyuGeminiAdapter.js — 咸鱼 API Gemini 生成器
 *
 * 使用 chat/completions 端点，支持 bad_response_status_code 时自动 fallback
 * 到用户在 SettingsModal 中选定的备用模型。
 */

import { GPTChatAdapter } from './GeminiAdapter.js';
import { showToast } from '../utils/Toast.js';

export class XianyuGeminiAdapter extends GPTChatAdapter {
  static get id() { return 'xianyu-gemini'; }
  static get label() { return '咸鱼 API (Gemini)'; }
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


}