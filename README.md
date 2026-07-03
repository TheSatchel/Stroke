<p align="center">
  <img src="static/img/icon-512x512.png" width="120" alt="Stroke Logo" />
</p>

<h1 align="center">Stroke</h1>
<p align="center"><strong>Swift strokes, infinite creations. 一笔即画，创意无限。</strong></p>

<p align="center">
  <a href="https://github.com/TheSatchel/Stroke/releases"><img src="https://img.shields.io/github/v/release/TheSatchel/Stroke?style=flat-square" /></a>
  <a href="https://github.com/TheSatchel/Stroke/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-GPL%20v2-blue?style=flat-square" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square" /></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps"><img src="https://img.shields.io/badge/PWA-ready-5A0FC8?style=flat-square" /></a>
</p>

---

AI 图像生成工作台 — 套索/点选/SegFormer 分割标注，可拖拽配置面板，多版本历史回溯，PWA 离线可用。

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/TheSatchel/Stroke.git && cd Stroke

# 安装 PyYAML（构建所需唯一依赖）
pip install pyyaml

# 下载 AI 分割模型 + vendor 库，构建并启动开发服务器
python build.py --download-model --serve
```

启动后访问 `http://127.0.0.1:8000`。

AI 分割模型首次下载约 190 MB。可跳过该步骤（AI 分割功能不可用）：

```bash
python build.py --serve
```

```bash
npm install && npm test       # 前端测试（可选）
```

---

## 构建与部署

```bash
python build.py               # 构建 dist/ 静态站点
python build.py --prefix /app # 设置路径前缀（部署到子目录）
npm run build                 # 等价于 python build.py
npm run dev                   # 构建 + 本地开发服务器
```

产物 `dist/` 目录是完整的静态站点，可部署到任意静态服务器：

```bash
npx serve dist                # Node.js 静态服务器
python -m http.server 8000 -d dist
```

支持 CDN、Nginx、GitHub Pages、Vercel 等部署方式。

---

## 项目结构

```
├── build.py                   # 静态站点构建脚本
├── settings.yaml              # 应用 & PWA 配置
├── templates/index.html       # HTML 模板（构建时注入配置）
├── static/                    # 前端（Vanilla JS ES Modules, ITCSS）
├── scripts/                   # 模型下载等工具脚本
├── tests/                     # Vitest + jsdom
└── dist/                      # 构建产物（gitignore）
```

---

**技术栈**: Vanilla JS + ITCSS / PWA + Service Worker / IndexedDB + localStorage

**许可**: [GPL v2.0](LICENSE)
