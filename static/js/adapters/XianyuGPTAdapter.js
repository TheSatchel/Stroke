/**
 * XianyuGPTAdapter.js — 咸鱼 API GPT Image 生成器
 *
 * 使用 /v1/images/generations 和 /v1/images/edits 端点。
 * 继承 GPTImageAdapter 的全部参数化逻辑 (width/height slider、quality、output_format、background、moderation)。
 */

import { GPTImageAdapter } from './GPTImageAdapter.js';

export class XianyuGPTAdapter extends GPTImageAdapter {
  static get id() { return 'xianyu-gpt'; }
  static get label() { return '咸鱼 API (GPT Image)'; }
  static get defaultModel() { return 'gpt-image-2'; }
  static get defaultEndpoint() { return 'https://allgpt.xianyuw.cn/v1/images/generations'; }

  // GPT 专用端点（参考图编辑用）
  static get defaultImageGenEndpoint() { return 'https://allgpt.xianyuw.cn/v1/images/generations'; }
  static get defaultImageEditEndpoint() { return 'https://allgpt.xianyuw.cn/v1/images/edits'; }

  static get models() {
    return [
      { id: 'gpt-image-2', label: 'GPT Image 2' }
    ];
  }
}