/* BaseAdapters.js — 生成器基类
 *
 * 所有平台实现必须继承此类，并实现 generate() 方法。
 * 约定：generate() 返回 Promise<string>，resolve 为 SVG 字符串。
 */

import { cleanResponseToImage, svgToBase64DataUrl, isValidSvg, isValidRasterDataUrl } from './ResponseParser.js';

export class BaseAdapters {
  /**
   * @param {Object} config - 平台配置
   * @param {string} config.apiKey   - API 密钥
   * @param {string} config.model    - 模型名称
   * @param {string} [config.endpoint] - 自定义端点 URL
   */
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * 平台标识（子类必须覆盖）
   * @returns {string}
   */
  static get id() {
    throw new Error('子类必须实现 static get id()');
  }

  /**
   * 平台显示名称（子类必须覆盖）
   * @returns {string}
   */
  static get label() {
    throw new Error('子类必须实现 static get label()');
  }

  /**
   * 默认模型（子类应覆盖）
   * @returns {string}
   */
  static get defaultModel() {
    return '';
  }

  /**
   * 该平台支持的模型列表
   * @returns {Array<{id: string, label: string}>}
   */
  static get models() {
    return [];
  }

  /**
   * 生成器专属的配置参数定义列表
   * 子类重写以暴露可配置参数，如 quality, style, num_outputs 等
   * @returns {Array<{name: string, label: string, type: string, defaultValue: *, placeholder?: string, options?: string[]}>}
   */
  static get configParams() {
    return [];
  }

  /**
   * 更新配置
   * @param {Object} config
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // ================================================================
  //  响应清洗工具（子类在 generate() 返回前调用）
  // ================================================================

  /**
   * 清洗 API 返回的原始文本，返回统一 ImageResult
   * @param {string} rawText
   * @returns {ImageResult} { type: 'svg', svg } | { type: 'raster', dataUrl }
   * @throws {Error} 如果无法提取任何有效内容
   */
  _cleanToImage(rawText) {
    return cleanResponseToImage(rawText, { adapterName: this.constructor.id || 'unknown' });
  }

  /**
   * 将 SVG 字符串转为安全的 Base64 Data URL
   * @param {string} svgString
   * @returns {string|null}
   */
  _svgToDataUrl(svgString) {
    return svgToBase64DataUrl(svgString);
  }

  /**
   * 验证是否为合法 SVG 字符串
   * @param {string} str
   * @returns {boolean}
   */
  _isValidSvg(str) {
    return isValidSvg(str);
  }

  /**
   * 验证是否为合法光栅图 data URL
   * @param {string} dataUrl
   * @returns {boolean}
   */
  _isValidRasterDataUrl(dataUrl) {
    return isValidRasterDataUrl(dataUrl);
  }

  /**
   * 执行一次图像生成（子类必须实现）
   * @param {Object} params
   * @param {string} params.prompt              - 拼接后的 prompt 字符串
   * @param {string[]} [params.imageBase64List] - 参考图 base64 列表
   * @returns {Promise<ImageResult>}
   *    { type: 'svg', svg: string } | { type: 'raster', dataUrl: string }
   */
  async generate({ prompt, imageBase64List }) {
    throw new Error('子类必须实现 generate()');
  }
}
