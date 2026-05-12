# GPT Image Inpainting 管线实施计划

> 状态: 待实施  
> 日期: 2026-05  
> 范围: 仅 GPTImageAdapter 实现基于 `image` + `mask` + `prompt` 的 Inpainting 调用  
> 非目标: Gemini / Chat API 不做 Inpainting，仍走原路子（把带标注的原图+prompt 发给模型，让模型看图理解）

---

## 1. 背景与现状

### 1.1 用户流程

```
Canvas 拖拽/点选区域 → AI 分割/手动确认选区
    → ConfigPanel.addRegionPrompt(data) 
    → RegionPromptWidget　(右侧面板显示预览图叠加半透明色块 + 文本输入框)
    → 用户输入处理方式 (如"换成红色的花")
    → 点击"开始生成"
    → GenerationPipeline 按段切割 prompt
    → Adapter.generate() 发送请求
```

### 1.2 目前 GPTImageAdapter 有问题

当存在参考图 (`imageBase64List.length > 0`) 时，现有代码做的是：

```js
// 当前错误行为
fd.append('image', blob, 'ref.png');  // 把每张图都当 image 字段 append
// 没有 mask
// 没有区分原图和蒙版
```

OpenAI `/v1/images/edits` 实际需要的请求体:

| 字段 | 说明 |
|------|------|
| `image` | **一张** 原始图片 (PNG, <4MB) |
| `mask`  | **一张** 蒙版图片 (PNG, <4MB)，白色=编辑区域，透明/黑色=保留区域 |
| `prompt`| 描述蒙版区域应该变成什么样子 |

### 1.3 RegionPromptWidget 当前存储的数据

```js
// widget 实例上的关键属性
this.label        // 'A', 'B', ...
this.color        // '#3B82F6'
this.points       // [{x, y}, ...] — display 坐标系
this.imageDataUrl // 原图 base64
this.type         // 'point' | 'lasso' | 'segmentation'
this.canvasWidth  // 显示区域宽
this.canvasHeight // 显示区域高
```

这些数据来自 `Canvas.onSelectionConfirm` → `App._wireEvents` → `ConfigPanel.addRegionPrompt(data)` → `RegionPromptWidget` 构造函数。

---

## 2. 需要修改的文件和改动

### 2.1 新建: `static/js/utils/MaskGenerator.js`

一个纯工具函数，不依赖 DOM/widget：

```js
/**
 * generateMaskDataUrl(points, displayWidth, displayHeight, outputWidth, outputHeight)
 * 根据多边形顶点生成白色蒙版 PNG 的 base64 data URL
 * - canvas 用 outputWidth x outputHeight (应与 API 请求的 size 一致)
 * - 背景全透明 (rgba(0,0,0,0))
 * - 多边形区域填充白色 (#FFFFFF)
 * @returns {string} data:image/png;base64,...
 */
```

关键点:
- 缩放: `display → output` 的坐标映射
- 透明背景 (蒙版语义: 透明=保留，白色=编辑)
- 不需要任何 DOM 中的 canvas 元素，创建 off-screen canvas

---

### 2.2 修改: `static/js/components/widgets/RegionPromptWidget.js`

#### 2.2.1 `getValue()` 改进

**改动前:**

```js
return [
  `图片左上角标注了代号 ${label}，`,  // 不够明确说明图片=原图
  `代号 ${label} 在图片中所覆盖的封闭区域内部...`,
  `请对该区域做如下修改：${userText}。`,
  // ... 没有强调"没有代号的部分原封不动"
].join('');
```

**改动后:**

```
参考图片即为原图。  
图片左上角标注了代号 {label}，  
代号 {label} 所覆盖的半透明 {colorName} 色蒙版区域即为需要修改的区域，  
请对该区域做如下修改：{userText}。  
要求：仅修改该代号所覆盖的区域内部，没有代号的部分（即蒙版未覆盖的区域）保持与原图完全一致；  
修改后的区域边缘与原图的过渡应自然，看不出拼接痕迹；  
原图上不能出现任何蒙版、色块、文字、箭头、标记框等覆盖物；  
最终输出为一张干净的完整图片。
```

核心改动:
- 第一句明确"参考图片即为原图"
- 强调"没有代号的部分保持与原图完全一致"
- 明确蒙版区域=修改区域

#### 2.2.2 新增 `getMaskDataUrl(outputWidth, outputHeight)` 方法

```js
getMaskDataUrl(outputWidth = 1024, outputHeight = 1024) {
  // 调用 MaskGenerator.generateMaskDataUrl()
  // 用 this.points + this.canvasWidth + this.canvasHeight
  // 返回蒙版的 data:image/png;base64
}
```

#### 2.2.3 (可选) `getIntroPrompt()` — 全局引导语

为有蒙版的管线提供一段前置说明：

```js
getIntroPrompt() {
  return '你将收到一张原图（image）和一张蒙版图（mask），' +
         '蒙版图中的白色区域是需要重新生成的部分，黑色/透明区域必须完全保持不变。' +
         '请根据 prompt 描述仅修改白色蒙版区域内的内容。';
}
```

---

### 2.3 修改: `static/js/generates/segmentparser.js`

在 `parse()` 函数中，为每个 segment 新增 `regionItems` 数组。

由于 `parse()` 只能访问 `tabValues` (字符串) 和 `tabsConfig` (定义)，不能直接拿到 widget 实例，所以需要:
- 从 `tabsConfig` 中拿到 `def.data` (即 raw points + imageDataUrl)
- `maskDataUrl` 的生成推迟到 `GenerationPipeline` 中（那里可以拿到 output size）

segment 对象新增:

```js
segments.push({
  callTabId: ...,
  prompt: ...,
  imageBase64List: [], // 保持原样（不再用于 inpainting）
  regionItems: [...],  // 新增
  fingerprint: ...,
  configId: ...
});
```

其中 `regionItems[i]`:

```js
{
  prompt: '用户输入的纯文本',          // 来自 tabValues[id + '__raw']
  imageDataUrl: '原图 base64',        // 来自 def.data.imageDataUrl
  points: [{x,y}, ...],              // 来自 def.data.points (display 坐标)
  displayWidth: ...,                  // def.data.canvasWidth
  displayHeight: ...,                 // def.data.canvasHeight
  type: 'lasso' | 'segmentation' | 'point',
  label: 'A',
  color: '#3B82F6',
}
```

---

### 2.4 修改: `static/js/adapters/BaseAdapters.js`

`generate()` 方法的参数签名扩展:

```js
/**
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string[]} [params.imageBase64List] — 无蒙版场景的参考图
 * @param {Array} [params.regionItems] — 有蒙版场景 [{ prompt, imageDataUrl, maskDataUrl, ... }]
 */
async generate({ prompt, imageBase64List, regionItems }) { ... }
```

默认实现（在 `BaseAdapters` 中不用改，因为它是抽象的、子类实现）在文档中标注即可。

---

### 2.5 修改: `static/js/adapters/GPTImageAdapter.js`

这是 **唯一** 需要实现 inpainting 的 adapter。Gemini / Chat 等不受影响。

#### 2.5.1 `_generateViaImageEndpoint` 方法改法

```js
async _generateViaImageEndpoint({ prompt, imageBase64List, regionItems }) {
  // ... 参数解构 ...

  const hasRegions = regionItems && regionItems.length > 0;

  if (hasRegions) {
    // ==================== Inpainting 模式 ====================
    const region = regionItems[0];  // 第一个版本处理单区域
    const fd = new FormData();
    fd.append('model', model);
    // 用于 inpainting 的 prompt: 全局引导 + 用户具体描述
    fd.append('prompt', this._buildInpaintingPrompt(region));
    fd.append('size', size);

    // 原图
    fd.append('image', this._b64ToBlob(region.imageDataUrl), 'image.png');

    // 蒙版
    fd.append('mask', this._b64ToBlob(region.maskDataUrl), 'mask.png');

    body = fd;
    headers = { 'Authorization': 'Bearer ' + apiKey };
    // quality, output_format, background 仍然 append
    fd.append('quality', quality);
    fd.append('output_format', outputFormat);
    fd.append('background', background);

  } else if (hasRefs) {
    // ==================== 有参考图但无选区（现有逻辑） ====================
    // ... 保持不变 ...

  } else {
    // ==================== 纯文本生图 ====================
    // ... 保持不变 ...
  }

  // ... fetch 和解析逻辑不变 ...
}
```

#### 2.5.2 新增 `_buildInpaintingPrompt(region)` 方法

将用户对区域的描述包装为 inpainting 专用 prompt。

区域描述已经在 `region.prompt` 中（例如："换成红色的花"），但可以加上引导：

```
你将收到一张原图（image）和一张蒙版图（mask），蒙版图中的白色区域是需要重新生成的部分。请仅修改白色蒙版区域内的内容：换成红色的花。蒙版以外（透明/黑色区域）必须与原图完全一致，边缘自然过渡。
```

实际上提示词应该简洁直接，因为 API 本身已经通过 mask 明确了编辑区域。直接传用户输入的描述即可，加上 `仅修改蒙版区域，其余部分与原图完全一致` 的前后缀。

#### 2.5.3 新增辅助方法 `_b64ToBlob(b64)`

```js
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
```

（把现有 FormData 循环里的 b64→blob 逻辑提取出来）

---

### 2.6 修改: `static/js/generates/GenerationPipeline.js`

#### 2.6.1 `start()` 方法改动

在构建 `SegmentTask` 时，对 `regionItems` 中的每一项生成 `maskDataUrl`（这里才能拿到生成尺寸）：

```js
// 在 start() 中，segment.regionItems → task.regionItems
this.tasks = segments.map(seg => ({
  callTabId: seg.callTabId,
  prompt: seg.prompt,
  imageBase64List: seg.imageBase64List || [],
  regionItems: (seg.regionItems || []).map(r => ({
    ...r,
    maskDataUrl: generateMaskDataUrl(
      r.points, r.displayWidth, r.displayHeight,
      width, height  // 来自 call widget config
    )
  })),
  configId: seg.configId,
  retryCount: 0,
  status: 'pending',
  result: null,
  _callWidgetConfig: callWidgetConfigs[seg.callTabId] || null
}));
```

这里需要访问 `callWidgetConfig` 中的 `width`/`height` 参数来确定 mask 的输出尺寸。如果 config 没设置，用 1024×1024 默认。

#### 2.6.2 `_retryableGenerate()` 方法改动

```js
const imageResult = await this.generator.generate({
  prompt: task.prompt,
  imageBase64List: imageList,
  regionItems: task.regionItems  // 新增传递
});
```

---

## 3. 管线总结

### 3.1 有选区（GPT Image Inpainting）

```
Canvas 选区
  → RegionPromptWidget
    → getValue() 输出完整文本 (给 ConfigTabs.tabsToPrompt 用，但 inpainting 路径不一定用它)
    → getMaskDataUrl() 生成蒙版 PNG
  → ConfigPanel.getTabValues() 收值
  → segmentparser.parse()
    → segment.regionItems = [{ prompt: userInput, imageDataUrl, points, ... }]
  → GenerationPipeline.start()
    → 生成 maskDataUrl (用 output size)
    → task.regionItems = [{ prompt, imageDataUrl, maskDataUrl }]
  → GPTImageAdapter._generateViaImageEndpoint()
    → FormData: image=原图, mask=蒙版, prompt=描述
    → POST /v1/images/edits
```

### 3.2 无选区（现有逻辑，GPT Image generations）

```
Prompt tabs
  → imageBase64List (参考图)
  → GPTImageAdapter
    → hasRefs → 原逻辑 FormData 多图
    → POST /v1/images/generations or /v1/images/edits
```

### 3.3 Gemini / Chat Adapter（不受影响）

```
Prompt tabs
  → imageBase64List (参考图)
  → GPTChatAdapter / XianyuGeminiAdapter
    → 参照原图+带有半透明蒙版标记+代号的参考图
    → region_prompt 的 getValue() 输出文本
    → POST /v1/chat/completions (multimodal)
```

---

## 4. 实施顺序

| # | 文件 | 动作 | 依赖 |
|---|------|------|------|
| 1 | `utils/MaskGenerator.js` | **新建** | 无 |
| 2 | `widgets/RegionPromptWidget.js` | 修改 `getValue()` 措辞 | 无 |
| 3 | `widgets/RegionPromptWidget.js` | 新增 `getMaskDataUrl()` | 1 |
| 4 | `generates/segmentparser.js` | segment 对象新增 `regionItems` | 无 |
| 5 | `adapters/GPTImageAdapter.js` | 实现 `hasRegions` 分支 | 无 |
| 6 | `adapters/GPTImageAdapter.js` | 新增 `_buildInpaintingPrompt()` | 5 |
| 7 | `adapters/GPTImageAdapter.js` | 提取 `_b64ToBlob()` | 5 |
| 8 | `generates/GenerationPipeline.js` | 生成 mask + 传递 regionItems | 3, 4 |
| 9 | 集成测试 | 端到端验证 | 全部 |

---

## 5. Gemini 不参与 Inpainting 的理由

- Gemini API 不支持 `/v1/images/edits` 端点，没有 `image+mask` 的图片编辑接口。
- Gemini 只能走 Chat Completions 路线，把图片作为多模态输入的 `image_url` 部分。
- 因此 Gemini 管线继续保持原有行为:
  - `RegionPromptWidget.getValue()` 输出带代号+蒙版区域描述的完整格式化文本
  - `tabsToPrompt()` 拼接所有 widget 值
  - `GPTChatAdapter` 把所有 prompt + 参考图打包发给 `/v1/chat/completions`
- 两种管线通过 `regionItems` 是否有值来分流：有值 → GPTImageAdapter inpainting；无值 → 走各自原有逻辑。

---

## 6. 风险与后续

- **单区域限制**: 当前 plan 只处理 `regionItems[0]`（第一个区域）。多区域 inpainting 可通过:
  - 多次调用 API（每区域一次，上一张结果做下一张原图）
  - 或合并多区域 mask 一次调用（把多个白色多边形画到同一张蒙版上）
- **Mask 缩放精度**: 显示坐标 → output 坐标的映射要精确，否则蒙版漂移
- **性能**: 蒙版生成在 `GenerationPipeline.start()` 阶段，不影响请求延迟
- **回退**: 如果 inpainting API 失败且错误可重试，现有的重试逻辑不受影响
- **Gemini 管线的 prompt 质量**: `getValue()` 措辞改进后，Gemini 管线也能受益（明确了原图和蒙版关系）