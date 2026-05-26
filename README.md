<p align="center">
  <img src="static/img/icon-512x512.png" width="200" alt="Stroke Logo" />
</p>

<h1 align="center">Stroke</h1>
<p align="center">
  <strong>Swift strokes, infinite creations. &nbsp;一笔即画，创意无限。</strong>
</p>

<p align="center">
  <a href="https://github.com/TheSatchel/Stroke/actions"><img src="https://img.shields.io/github/actions/workflow/status/TheSatchel/Stroke/ci.yml?branch=master&label=build&style=flat-square" alt="Build" /></a>
  <a href="https://github.com/TheSatchel/Stroke/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL%20v2-blue?style=flat-square" alt="GPL v2" /></a>
  <a href="https://github.com/TheSatchel/Stroke/releases"><img src="https://img.shields.io/github/v/release/TheSatchel/Stroke?style=flat-square" alt="Release" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square" alt="Python" /></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi" alt="FastAPI" /></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps"><img src="https://img.shields.io/badge/PWA-ready-5A0FC8?style=flat-square&logo=pwa" alt="PWA" /></a>
  <a href="https://github.com/TheSatchel/Stroke/stargazers"><img src="https://img.shields.io/github/stars/TheSatchel/Stroke?style=flat-square" alt="Stars" /></a>
</p>

---

## 概述 / Overview

**Stroke** 是一个 AI 图像生成工作区，将可拖拽排序的配置面板、套索 / 点选 / SAM 分割标注与多版本历史回溯融为一体。
你可以在画布上框选区域，为每个区域添加独立的处理提示词；所有生成参数均通过可视化的 config-tab 体系管理，支持用户当场设计自定义字段。

### 核心亮点

- **画布标注** — 套索框选、点选圆形、SAM 语义分割，即时标注区域 prompt
- **参数化配置面板** — 文本 · 拉杆 · 下拉 · 开关 · 图片上传 · 生成调用，全部可拖拽排序与增删
- **区域性 Prompt** — 每个选框自动生成蒙版图，连同格式化指令一并提交给 AI，实现局部修改
- **多版本历史** — 每次生成存储多个微调版本，左侧面板快速切换，支持 IndexedDB 持久化
- **跟随系统的深色主题** — 明暗自适应，accent 色系统覆盖所有组件
- **PWA 支持** — 可安装到桌面，Service Worker 离线缓存
- **双模式部署** — ASGI（uvicorn）或 WSGI（waitress），Windows / Linux 通用

---

## 快速开始 / Quick Start

### 环境要求

- Python **3.10** 或更高版本
- pip（已包含在 Python 中）
- Node.js（仅用于运行前端测试，非必须）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/TheSatchel/Stroke.git
cd stroke

# 创建虚拟环境（推荐）
python -m venv .venv

# 激活虚拟环境
.venv\Scripts\activate     # Windows
source .venv/bin/activate   # Linux / macOS

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器（单 worker，自动重载）
python serve.py --debug
```

启动后访问 `http://127.0.0.1:8000`。

其他启动方式：

```bash
python serve.py --asgi       # ASGI 生产模式 (uvicorn)
python serve.py --wsgi       # WSGI 模式 (waitress，Windows 友好)
```

### 运行测试

```bash
npm install          # 安装测试依赖
npm test             # 运行全部单测
npm run test:watch   # watch 模式
```

---

## 项目结构 / Project Structure

```
stroke/
├── app/
│   ├── __init__.py              # FastAPI 应用工厂
│   ├── config.py                # YAML 配置加载器
│   ├── templates.py             # Jinja2 模板初始化
│   └── routes/                  # 动态路由发现
│       ├── home.py              # 首页 SSR
│       ├── health.py            # 健康检查
│       ├── manifest.py          # PWA manifest 端点
│       └── service_worker.py    # SW 脚本端点
├── static/
│   ├── sw.js                    # Service Worker
│   ├── img/                     # PWA 图标 & 截图
│   ├── css/
│   │   ├── main.css             # 主入口（ITCSS 架构）
│   │   ├── settings/variables.css
│   │   ├── generic/reset.css
│   │   ├── elements/            # body, scrollbar
│   │   ├── objects/             # 布局 & 拖拽手柄
│   │   ├── components/          # 22 个组件样式
│   │   └── utilities/
│   └── js/
│       ├── main.js              # 入口
│       ├── Adapter.js           # 适配器工厂
│       ├── adapters/            # GPT Chat / 兼容 adapter
│       │   ├── GPTChatAdapter.js
│       │   ├── XianyuGPTChatAdapter.js
│       │   └── ResponseParser.js
│       ├── components/
│       │   ├── Canvas.js        # 画布主体
│       │   ├── ConfigTabs.js    # Tab 注册 & prompt 拼接
│       │   ├── DynamicParamsRenderer.js
│       │   ├── HistoryPanel.js  # 历史版本列表
│       │   ├── canvas/          # 画布子系统
│       │   │   ├── ImageManager.js
│       │   │   ├── LassoHandler.js
│       │   │   ├── SegmentationHandler.js
│       │   │   ├── SelectionManager.js
│       │   │   ├── SvgOverlay.js
│       │   │   └── ToolManager.js
│       │   ├── config-panel/    # 配置面板子系统
│       │   │   ├── ConfigPanel.js
│       │   │   ├── DragManager.js
│       │   │   ├── ExportManager.js
│       │   │   ├── RegionPromptManager.js
│       │   │   ├── TabContextMenu.js
│       │   │   ├── TabEditModal.js
│       │   │   └── TabSectionBuilder.js
│       │   ├── setting-modal/   # 设置弹窗
│       │   │   ├── SettingsModal.js
│       │   │   ├── ConfigModal.js
│       │   │   └── ModelSelectorModal.js
│       │   └── widgets/         # 控件实现
│       │       ├── TextWidget.js
│       │       ├── SliderWidget.js
│       │       ├── ChoiceWidget.js
│       │       ├── ImageWidget.js
│       │       ├── AbstractImageWidget.js
│       │       ├── CanvasRefImageWidget.js
│       │       ├── RegionPromptWidget.js
│       │       └── generate-call/
│       │           ├── GenerateCallWidget.js
│       │           ├── ConfigSelector.js
│       │           └── ResultPreview.js
│       ├── generates/           # 生成管线
│       │   ├── Generator.js
│       │   ├── GenerationPipeline.js
│       │   ├── ResultFormatter.js
│       │   ├── RetryHandler.js
│       │   ├── VisibilityMonitor.js
│       │   └── WakeLockManager.js
│       ├── locals/              # 持久化层
│       │   ├── Lineage.js
│       │   ├── LineageManager.js
│       │   ├── Persistence.js
│       │   ├── PersistenceGuard.js
│       │   ├── StorageManager.js
│       │   ├── IndexedDBRepo.js
│       │   └── storage.js
│       ├── services/            # 后端服务
│       │   ├── segmentparser.js
│       │   ├── MaskProcessor.js
│       │   ├── SegmentationService.js
│       │   ├── SegmentationWorker.js
│       │   ├── ProgressTracker.js
│       │   ├── WorkerManager.js
│       │   └── WasmDetector.js
│       ├── uis/                 # App 核心 & 事件连线
│       │   ├── App.js
│       │   ├── EventWirer.js
│       │   ├── CanvasImageCoordinator.js
│       │   └── PWA.js
│       └── utils/               # 工具函数
│           ├── DOM.js
│           ├── Fingerprint.js
│           ├── Image.js
│           ├── MaskGenerator.js
│           └── Toast.js
├── tests/                       # 19 个测试文件 (Vitest + jsdom)
│   ├── ConfigPanel.test.js
│   ├── ConfigTabs.test.js
│   ├── Lineage.test.js
│   ├── SegmentParser.test.js
│   └── ...
├── templates/
│   └── index.html               # Jinja2 主模板
├── settings.yaml                # 应用配置
├── serve.py                     # 生产服务器入口
├── development.py               # 开发服务器入口
├── requirements.txt             # Python 依赖
├── package.json                 # Node 测试依赖
└── vitest.config.js             # 测试配置
```

---

## 配置 / Settings

编辑 `settings.yaml` 即可调整应用名称、PWA 元数据、服务端口等：

```yaml
app:
  name: "Stroke"
  version: "0.1.0"
  debug: true

server:
  host: "127.0.0.1"
  port: 8000
  workers: 4

pwa:
  name: "Stroke"
  short_name: "Stroke"
  description: "..."
  theme_color: "#000000"
  background_color: "#000000"
  display: "standalone"
```

---

## 技术栈 / Tech Stack

| 层级 | 技术 |
|------|------|
| 后端框架 | [FastAPI](https://fastapi.tiangolo.com/) |
| 模板引擎 | [Jinja2](https://jinja.palletsprojects.com/) |
| ASGI 服务器 | [Uvicorn](https://www.uvicorn.org/) |
| WSGI 服务器 | [Waitress](https://docs.pylonsproject.org/projects/waitress/) + [a2wsgi](https://github.com/abersheeran/a2wsgi) |
| 前端 | Vanilla JS（ES Modules，零构建工具） |
| CSS | ITCSS 分层架构 |
| PWA | Service Worker + Web App Manifest |
| 持久化 | IndexedDB + localStorage |
| 配置 | YAML + 环境变量覆盖 |
| 测试 | Vitest + jsdom |

---

## 许可 / License

[GNU General Public License v2.0](LICENSE) — 你可以自由使用、修改和分发本项目，但必须保持开源并沿用相同许可证。
