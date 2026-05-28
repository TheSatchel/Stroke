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
# Python 3.10+, 克隆后直接启动
git clone https://github.com/TheSatchel/Stroke.git && cd Stroke
pip install -r requirements.txt
python launch.py
```

启动后访问 `http://127.0.0.1:8000`，首次运行会自动下载 AI 分割模型（~190 MB）。

```bash
npm install && npm test       # 前端测试（可选）
```

---

## 项目结构

```
├── launch.py                  # 统一启动器（菜单 / CLI 参数）
├── serve.py / development.py  # 服务器入口
├── settings.yaml              # 应用 & PWA 配置
├── app/                       # FastAPI 后端（Jinja2 SSR）
├── static/                    # 前端（Vanilla JS ES Modules, ITCSS）
├── scripts/                   # 模型下载等工具脚本
├── tests/                     # Vitest + jsdom
└── templates/                 # Jinja2 HTML 模板
```

---

**技术栈**: FastAPI + Jinja2 / Vanilla JS + ITCSS / PWA + Service Worker / IndexedDB + localStorage

**许可**: [GPL v2.0](LICENSE)
