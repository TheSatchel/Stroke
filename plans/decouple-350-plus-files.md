# 解耦 350+ 行文件计划

## 目标

将 5 个超过 350 行的项目文件拆分为小型、单一职责模块。每个新文件控制在 80-150 行，拆分后原文件作为瘦协调器。

| # | 文件 | 当前行数 | 目标行数 | 拆分文件数 |
|---|------|----------|----------|------------|
| 1 | `SegmentationService.js` | 415 | <150 | 4 |
| 2 | `GenerationPipeline.js` | 439 | <150 | 4 |
| 3 | `ConfigPanel.js` | 468 | <200 | 3 |
| 4 | `Canvas.js` | 684 | <150 | 5 |
| 5 | `App.js` | 409 | <120 | 2 |

---

## 1. SegmentationService.js (415 → <150)

### 现状
- `services/SegmentationService.js` — 单例，含 WASM 检测、Worker 管理、模型加载、推理、掩码处理、进度 Toast

### 拆分

| 新文件 | 职责 | 抽离内容 |
|--------|------|----------|
| `services/WasmDetector.js` | WASM 可用性检测 | `_detectWasm` → 纯函数 `detectWasm()`，返回 `{ available, state }` |
| `services/WorkerManager.js` | Worker 创建、消息路由、超时处理 | `_ensureWorker`, `_onWorkerMessage`, `_worker`, `_segmentResolve`/`_segmentReject`, `_pendingResolve`/`_pendingReject` |
| `services/MaskProcessor.js` | 掩码查找与轮廓提取算法 | `_findClassAtPoint`, `_maskToContour` → 导出纯函数 |
| `services/ProgressTracker.js` | 进度 Toast 显示/关闭 | `_updateProgressToast`, `_dismissProgressToast`, `_progressToast`, `_toastMod` |
| **SegmentationService.js** | 单例协调、模型加载、推理入口、缓存、localStorage 标记 | `constructor`, `load`, `segmentAtPoint`, `_segmentViaWorker`, `_segmentInline`, `clearCache`, `_wasModelCached`, `_markModelCached` |

### 约束
- 不改变 `SegmentationService.instance` 和 `segmentAtPoint(dataUrl, x, y)` API
- Worker 和主线程回退逻辑不变

---

## 2. GenerationPipeline.js (439 → <150)

### 现状
- `generates/GenerationPipeline.js` — 任务队列、重试退避、Wake Lock、visibility 监控、adapter 切换、结果格式化

### 拆分

| 新文件 | 职责 | 抽离内容 |
|--------|------|----------|
| `generates/RetryHandler.js` | 重试判断 + 指数退避 | `isRetryable()`, `backoffDelay()`, `RETRYABLE_ERRORS`, `MAX_RETRIES`, `BASE_DELAY_MS` |
| `generates/WakeLockManager.js` | Wake Lock 获取/释放 | `_acquireWakeLock`, `_releaseWakeLock`, `_wakeLock` |
| `generates/VisibilityMonitor.js` | visibilitychange 暂停/恢复 | `_listenVisibility`, `_visibilityUnbind`, `pause`/`resume` 委托 |
| `generates/ResultFormatter.js` | 结果格式化（含缩略图生成） | imageResult → `{ callTabId, type, svg, dataUrl, base64, thumbnail }` |
| **GenerationPipeline.js** | 任务构建、队列执行、adapter 切换、清理 | `start`, `_executeAll`, `_retryableGenerate`, `_switchAdapter`, `_cleanup` |

### 约束
- 外部 API (`start(tabsConfig, tabValues, callWidgetConfigs)`) 不变
- `PipelineCallbacks` 接口不变

---

## 3. ConfigPanel.js (468 → <200)

### 现状
- `components/config-panel/ConfigPanel.js` — 已有 `DragManager.js`, `TabEditModal.js`, `TabContextMenu.js` 子模块

### 拆分

| 新文件 | 职责 | 抽离内容 |
|--------|------|----------|
| `config-panel/TabSectionBuilder.js` | 根据 tabDef 生成 DOM section + 旗标按钮 | `_makeTabSection`, `_makeSectionFlagBtn` |
| `config-panel/RegionPromptManager.js` | 区域 prompt 实例 CRUD | `addRegionPrompt`, `removeAllRegionPrompts`, `_regionCount`, `_onRegionRemove`, `setOnRegionRemove` |
| `config-panel/ExportManager.js` | 导出下载逻辑 | `_downloadResult`, `setDownloadLineage`, `_dlLineageId`/`_dlVersionIndex` |
| **ConfigPanel.js** | 全量渲染、tab 增删、值收集、生成触发、恢复 | `render`, `addCustomTab`, `removeTab`, `getTabValues`, `getFullPrompt`, `getSegmentPrompts`, `doGen`, `onGenComplete`, `showPostGen`, `restoreTabValues`, `_notifyConfigChange` |

### 约束
- 外部 API（`addCustomTab`, `removeTab`, `getFullPrompt`, `doGen` 等）不变
- `widgets` 映射、`tabsConfig` 数组仍归 ConfigPanel 管理

---

## 4. Canvas.js (684 → <150)

### 现状
- `components/Canvas.js` — 已有 `canvas/SvgOverlay.js` 负责 SVG 叠加渲染

### 拆分

| 新文件 | 职责 | 抽离内容 |
|--------|------|----------|
| `canvas/ToolManager.js` | 工具切换、工具栏渲染、提示文本、按钮状态 | `_buildToolbar`, `setTool`, `_updateSelectButtonState`, `btnSel`/`btnLas`/`tHint` |
| `canvas/SelectionManager.js` | 活跃/已确认选区、确认/取消栏、sel-marker、选区 CRUD | `_confirmSelection`, `_cancelSelection`, `_clearActiveSelection`, `_showConfirmBar`/`_hideConfirmBar`, `_createConfirmBar`, `_createSelMarker`, `_showSelMarker`/`_hideSelMarker`, `addConfirmedSelection`, `removeConfirmedSelection`, `_clearAllSelections` |
| `canvas/ImageManager.js` | 图片加载/清除/历史版本加载、占位区、文件上传、渲染区计算 | `_createPlaceholder`, `_handleCanvasImageFile`, `setCanvasImage`, `clear`, `loadVersion`, `showHistory`, `isShowingUserImage`, `getUserImageDataUrl`, `_computeImageRenderArea` |
| `canvas/SegmentationHandler.js` | AI 分割点选、分割预览渲染 | `_handlePointSelect`, `_handlePointSelectFallback`, `_showSegmentationPreview`, `updateAllMasks` |
| `canvas/LassoHandler.js` | 自由多边形框选鼠标交互 | `_onMouseDown`(las 分支), `_onMouseMove`, `_onMouseUp`, `_calcPathLength` |
| **Canvas.js** | 薄协调器：初始化+事件路由 | `constructor`, `render`, `_onMouseDown`(路由), `_onDblClick`, resize 监听 |

### 约束
- 外部回调 API（`onSelectionConfirm`, `onSelectionCancel`, `onCanvasImage`, `onClearCanvas`）不变
- `setCanvasImage`, `loadVersion`, `clear` 等公开方法签名不变
- 鼠标事件分发路由到各 Handler

---

## 5. App.js (409 → <120)

### 现状
- `uis/App.js` — 根协调器，组件实例化 + 事件连线

### 拆分

| 新文件 | 职责 | 抽离内容 |
|--------|------|----------|
| `uis/EventWirer.js` | 所有组件间事件连线 | `_wireEvents`（~192 行）, `_refreshAllCallWidgetConfigs`, `_notifyConfigChangeSafe`, `_rebuildHistoryItems` |
| `uis/CanvasImageCoordinator.js` | 画布参考图 widget ↔ Canvas 双向同步 | `_rewireImageSync`, `onCanvasImage` 回调, `onClearCanvas` 回调, `onTabRemove` 回调（canvas_ref_image 相关） |
| **App.js** | 依赖注入、组件实例化、拖拽手柄、颜色/代号轮转 | `constructor`, `_createResizeHandle`, `_initResizeHandles`, `_nextRegionColor`, `_nextRegionLabel` |

### 约束
- `window.StrokeApp = App` 保持不变
- 所有组件 API 不变

---

## 执行顺序

| 序号 | 文件 | 理由 |
|------|------|------|
| 1 | `SegmentationService.js` | 算法与基础设施分离，无 DOM 依赖，改动面最小 |
| 2 | `GenerationPipeline.js` | 纯功能抽取，无 DOM 依赖 |
| 3 | `ConfigPanel.js` | 已有子模块基础（DragManager 等），扩展即可 |
| 4 | `Canvas.js` | 行数最多、逻辑最复杂，积累前三步经验后再处理 |
| 5 | `App.js` | 根协调器，抽走事件线后自然变瘦 |

---

## 实施规则

- 每完成一个文件，运行一次构建验证
- 不改变任何外部 API 签名
- 新文件遵循现有 JSDoc 注释风格（中文描述 + @param/@returns）
- 使用 ES module `import/export`，与现有风格一致
- 拆分后立即从原文件移除已迁移代码
