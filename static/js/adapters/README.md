# Stroke · Adapter 接口协议 & 开发指南

---

## 一、架构总览

```
用户界面 (ConfigPanel / GenerateCallWidget)
        │
        ▼
  GeneratorService (Adapter.js)          ← 注册中心，切换 adapter
        │
        ▼
  BaseAdapters  (抽象基类)               ← 定义 generate() 契约
        │
        ├── XianyuGeminiAdapter  (咸鱼 Gemini)
        ├── XianyuGPTAdapter     (咸鱼 GPT Image)
        ├── (未来: OpenAIAdapter)
        └── (未来: ReplicateAdapter)
        │
        ▼
  ResponseParser (响应清洗)              ← 原始文本 → 统一 ImageResult
```

---

## 二、ImageResult 接口协议

**所有 Adapter 的 `generate()` 必须返回 `Promise<ImageResult>`：**

```ts
type ImageResult =
  | { type: 'svg';    svg: string }        // 纯 SVG 字符串
  | { type: 'raster'; dataUrl: string };   // JPEG / PNG / GIF / WebP 等光栅图 data URL
```

### 上层消费分派

| `type` | Canvas 显示 | Widget 预览 | 历史缩略图 |
|---|---|---|---|
| `'svg'` | 内嵌 `<svg>` 标签 | 编码为 `data:image/svg+xml;base64,...` → `<img>` | 实时缩小渲染 |
| `'raster'` | `<img src="dataUrl">` | 直接用 `dataUrl` → `<img>` | `<img>` 缩略 |

### 参考图传递

- 多个 `generate_call` 时，上一段结果的 `base64` 自动传给下一段作为 `imageBase64`
- 第一段若无上传图片，则 `imageBase64` 为空字符串

---

## 三、ResponseParser · 响应清洗管线

```
API 原始文本
    │
    ├── 1. 整体是 data URL? ──→ 按 MIME 分 SVG / raster
    │
    ├── 2. 普通 URL? ──→ 抛出错误（暂不支持直接下载）
    │
    ├── 3. Markdown 图片语法? ![alt](data:image/jpeg;base64,...)
    │       ──→ 提取括号内 data URL，返回 { type:'raster', dataUrl }
    │
    ├── 4. Markdown 代码块? ```svg ... ```
    │       ──→ 递归解析内容（可能嵌套 data URL 或 SVG）
    │
    ├── 5. 原始 <svg> 标签存在于文本中?
    │       ──→ 提取并返回 { type:'svg', svg }
    │
    └── 6. 全部失败 ──→ 抛出 Error
```

### 公开导出

| 函数 | 用途 |
|---|---|
| `cleanResponse(rawText, opts?)` | 主入口，返回 `ImageResult` |
| `cleanResponseToImage(rawText, opts?)` | `cleanResponse` 的别名 |
| `isValidSvg(str)` | 判断字符串是否包含合法 `<svg>...</svg>` |
| `isValidRasterDataUrl(url)` | 判断是否为 JPEG/PNG/GIF/WebP data URL |
| `svgToBase64DataUrl(svgString)` | SVG 字符串 → 安全 base64 data URL |

---

## 四、如何编写自定义 Adapter

### 最小实现

```js
// static/js/adapters/MyAdapter.js

import { BaseAdapters } from './BaseAdapters.js';

export class MyAdapter extends BaseAdapters {

  // ────────── 静态元信息（必填）──────────

  static get id() { return 'my-adapter'; }           // 唯一标识
  static get label() { return '我的 API'; }            // UI 显示名
  static get defaultModel() { return 'my-model-v1'; } // 默认模型

  // ────────── 模型列表（给 UI 下拉用）──────────

  static get models() {
    return [
      { id: 'my-model-v1', label: 'My Model v1' },
      { id: 'my-model-v2', label: 'My Model v2 (高精度)' },
    ];
  }

  // ────────── 可配置的动态参数（可选）──────────

  static get configParams() {
    return [
      {
        name: 'quality',        // 参数键名
        label: '输出质量',       // UI 标签
        type: 'choice-dropdown', // 控件类型（复用 ConfigTabs 的 widgetRegistry）
        defaultValue: 'standard',
        options: ['standard', 'hd'],
      },
      {
        name: 'steps',
        label: '采样步数',
        type: 'slider',
        defaultValue: 20,
        min: 10,
        max: 50,
        step: 1,
        unit: '步',
      },
    ];
  }

  // ────────── 核心生成方法（必填）──────────

  /**
   * @param {Object} params
   * @param {string} params.prompt       - 拼接后的 prompt
   * @param {string} [params.imageBase64] - 参考图 data URL
   * @returns {Promise<ImageResult>}
   */
  async generate({ prompt, imageBase64 }) {
    const { apiKey, endpoint, model, fallbackModel } = this.config;

    // 1. 构造请求
    const payload = {
      model: model || this.constructor.defaultModel,
      messages: [
        { role: 'user', content: prompt }
      ],
    };

    // 2. 发起 HTTP 请求
    const resp = await fetch(endpoint || 'https://api.example.com/v1/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error('API 请求失败: ' + resp.status);
    }

    const data = await resp.json();

    // 3. 提取原始文本
    const rawText = data.choices[0].message.content;

    // 4. 清洗响应 → ImageResult
    const imageResult = this._cleanToImage(rawText);

    // 5. 二次验证 + 返回
    if (imageResult.type === 'svg') {
      if (!this._isValidSvg(imageResult.svg)) {
        throw new Error('API 返回的不是有效 SVG');
      }
    } else {
      if (!this._isValidRasterDataUrl(imageResult.dataUrl)) {
        throw new Error('API 返回的光栅图格式无效');
      }
    }

    return imageResult;
  }
}
```

### 注册到系统

```js
// static/js/Adapter.js

import { MyAdapter } from './adapters/MyAdapter.js';

const BUILTIN = [
  MyAdapter,                // ← 新增
  GPTChatAdapter,
  GPTImageAdapter,
  XianyuGeminiAdapter,
  XianyuGPTAdapter,
];
```

完成！`ConfigModal` 和 `GenerateCallWidget` 会**自动**：
- 在配置面板的提供商下拉中显示你的 adapter
- 读取 `models` 渲染模型选择器
- 读取 `configParams` 生成动态参数控件

---

## 五、BaseAdapters 提供的内置工具

| 方法 | 说明 |
|---|---|
| `this._cleanToImage(rawText)` | 调用 `ResponseParser.cleanResponseToImage()`，返回 `ImageResult` |
| `this._svgToDataUrl(svg)` | 调用 `ResponseParser.svgToBase64DataUrl()` |
| `this._isValidSvg(str)` | 调用 `ResponseParser.isValidSvg()` |
| `this._isValidRasterDataUrl(url)` | 调用 `ResponseParser.isValidRasterDataUrl()` |
| `this.config` | 当前合并后的配置对象（含 API Key、endpoint、model 等） |
| `this.updateConfig(partial)` | 运行时更新配置 |

---

## 六、基类约定

| 约定 | 说明 |
|---|---|
| `generate()` 必须返回 `ImageResult` | `{ type:'svg', svg }` 或 `{ type:'raster', dataUrl }` |
| 不要手动调用 ResponseParser | 用 `this._cleanToImage()` 即可 |
| 解析/格式错误不要 fallback | `throw new Error('[adapter-id] ...')` 开头的错误不会被 retry |
| `configParams` 可选 | 不声明则 GenerateCallWidget 不显示参数微调面板 |
| 文件放 `adapters/` | 保持命名 `XxxAdapter.js`，首字母大写 |