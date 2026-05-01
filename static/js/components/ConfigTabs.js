/**
 * ConfigTabs.js — Tab 总管
 *
 * 职责：
 *   1. 定义默认 tab 参数化配置
 *   2. 提供可选 tab 模板池（用户"当场设计"时可选用）
 *   3. widget 类型 → 类 的注册表
 *   4. tabsToPrompt() — 所有 tab 值 → 最终 prompt 字符串的转换
 *
 * 每个 tab 定义结构：
 *   {
 *     id: string           - 唯一标识
 *     title: string         - 显示在 drag-header 的标题
 *     describe: string      - 每个 dragger 的描述字段（必填，仅此一个）
 *     type: 'text'|'slider'|'choice'
 *     order: number         - 默认排序
 *     removable: boolean    - 是否允许用户删除
 *     promptFormat: string  - 在 prompt 中的呈现方式，{value} 会被替换为实际值
 *
 *     // type: 'text'
 *     multiline: boolean
 *     placeholder: string
 *     defaultValue: string
 *     rows: number          - 仅 multiline，默认 4
 *     maxLength: number
 *
 *     // type: 'slider'
 *     min: number
 *     max: number
 *     step: number
 *     defaultValue: number
 *     leftLabel: string     - 左端标签
 *     rightLabel: string    - 右端标签
 *     unit: string          - 值单位，如 px / % / ''
 *
 *     // type: 'choice'
 *     options: string[]
 *     defaultValue: string
 *     displayAs: 'dropdown'|'toggle'|'radio'
 *     toggleLabel: string   - 仅 toggle，开关旁的文字
 *   }
 */

import TextWidget from './widgets/TextWidget.js';
import SliderWidget from './widgets/SliderWidget.js';
import ChoiceWidget from './widgets/ChoiceWidget.js';
import ImageWidget from './widgets/ImageWidget.js';

// ============================================================
// 默认 Tab 配置
// ============================================================
export const defaultConfigTabs = [
  {
    id: 'prompt',
    title: 'Prompt',
    describe: '描述你想生成的图像内容',
    type: 'text',
    order: 0,
    removable: false,
    multiline: true,
    rows: 4,
    placeholder: '例如：一只橘猫坐在窗台上，阳光透过百叶窗洒下条纹光影...',
    defaultValue: '',
    promptFormat: '{value}',
  },
  {
    id: 'image',
    title: '参考图片',
    describe: '上传一张参考图片作为生成基础（可选）',
    type: 'image',
    order: 1,
    removable: true,
    defaultValue: '',
    promptFormat: '',
  },
  {
    id: 'size',
    title: '图像尺寸',
    describe: '选择输出图像的分辨率',
    type: 'choice',
    order: 2,
    removable: true,
    options: ['1024×1024', '1024×512', '512×1024', '768×768', '1280×720'],
    defaultValue: '1024×1024',
    displayAs: 'dropdown',
    promptFormat: '尺寸: {value}',
  },
  {
    id: 'region_prompt',
    title: '区域 Prompt',
    describe: '针对画圈区域的补充描述',
    type: 'text',
    order: 99,
    removable: false,
    hidden: true,
    multiline: true,
    rows: 2,
    placeholder: '针对画圈区域的补充描述...',
    defaultValue: '',
    promptFormat: '区域: {value}',
  },
];

// ============================================================
// 可选 Tab 模板池（供用户"当场设计"时选用）
// ============================================================
export const availableTabPool = [
  {
    id: null,
    title: '自定义文本',
    describe: '',
    type: 'text',
    order: 999,
    removable: true,
    multiline: false,
    placeholder: '输入内容...',
    defaultValue: '',
    promptFormat: '{value}',
  },
  {
    id: null,
    title: '自定义文本（多行）',
    describe: '',
    type: 'text',
    order: 999,
    removable: true,
    multiline: true,
    rows: 3,
    placeholder: '输入内容...',
    defaultValue: '',
    promptFormat: '{value}',
  },
  {
    id: null,
    title: '自定义拉杆',
    describe: '',
    type: 'slider',
    order: 999,
    removable: true,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 50,
    leftLabel: '0',
    rightLabel: '100',
    unit: '',
    promptFormat: '自定义: {value}',
  },
  {
    id: null,
    title: '自定义开关',
    describe: '',
    type: 'choice',
    order: 999,
    removable: true,
    options: ['开', '关'],
    defaultValue: '关',
    displayAs: 'toggle',
    toggleLabel: '开启',
    promptFormat: '自定义开关: {value}',
  },
  {
    id: null,
    title: '自定义下拉',
    describe: '',
    type: 'choice',
    order: 999,
    removable: true,
    options: ['选项 A', '选项 B', '选项 C'],
    defaultValue: '选项 A',
    displayAs: 'dropdown',
    promptFormat: '自定义: {value}',
  },
  {
    id: null,
    title: '自定义图片',
    describe: '',
    type: 'image',
    order: 999,
    removable: true,
    defaultValue: '',
    promptFormat: '',
  },
];

// ============================================================
// Widget 类型注册表
// ============================================================
export const widgetRegistry = {
  text: TextWidget,
  slider: SliderWidget,
  choice: ChoiceWidget,
  image: ImageWidget,
};

// ============================================================
// 值 → Prompt 转换
// ============================================================
/**
 * 将所有 tab 的当前值转换为最终 prompt 字符串。
 * 只拼接有非空值的 tab。
 *
 * @param {Object} tabValues  - { tabId: currentValue, ... }
 * @param {Array}  tabDefs    - 当前有效的 tab 定义数组
 * @returns {string} 拼接后的 prompt
 */
export function tabsToPrompt(tabValues, tabDefs) {
  const parts = [];
  for (const def of tabDefs) {
    const val = tabValues[def.id];
    // 跳过空值
    if (val === undefined || val === null || val === '' || val === false) continue;
    // 跳过默认值恰好与 defaultValue 相同且无意义的项（按需可扩展）
    const fmt = def.promptFormat;
    if (!fmt) continue;
    parts.push(fmt.replace('{value}', String(val)));
  }
  return parts.join(', ');
}

/**
 * 从 availableTabPool 中找到指定 type 的默认模板。
 *
 * @param {string} type - 'text' | 'slider' | 'choice'
 * @returns {Object|null} 模板定义（浅拷贝）
 */
export function getTabTemplate(type) {
  // 优先匹配 type；对于 text 类型，默认给单行
  const match = availableTabPool.find(t => t.type === type);
  return match ? { ...match } : null;
}
