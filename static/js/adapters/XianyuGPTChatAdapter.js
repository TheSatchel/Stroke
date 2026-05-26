/**
 * XianyuGPTChatAdapter.js — 咸鱼 API Gemini 生成器
 *
 * 使用 chat/completions 端点，支持 bad_response_status_code 时自动 fallback
 * 到用户在 SettingsModal 中选定的备用模型。
 */

import { GPTChatAdapter } from './GPTChatAdapter.js';
import { showToast } from '../utils/Toast.js';

export class XianyuGPTChatAdapter extends GPTChatAdapter {
  static get id() { return 'gptchat'; }
  static get label() { return '咸鱼API (ChatGPT 通用)'; }
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
    // 继承父级（GPTChatAdapter）的参数：temperature, top_p, max_tokens, mask_mode 等
    const base = super.configParams || [];
    return [
      {
        name: 'group',
        label: '用户组',
        type: 'text',
        defaultValue: 'allvip',
        placeholder: '用户组标识'
      },
      ...base
    ];
  }


}