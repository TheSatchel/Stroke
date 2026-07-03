"""
build.py — 静态站点构建脚本

读取 settings.yaml 配置，将模板变量注入 HTML，生成 manifest.json，
拷贝静态资源，输出到 dist/ 目录。

用法:
    python build.py                    # 构建 dist/
    python build.py --download-model   # 下载 AI 分割模型 + vendor js 后构建
    python build.py --serve            # 构建后启动本地开发服务器
    python build.py --serve --port 3000
    python build.py --prefix /image    # 设置路径前缀 (覆盖 settings.yaml)
"""
import argparse
import hashlib
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve

# ---------- 路径 ----------
ROOT = Path(__file__).resolve().parent
TEMPLATE_HTML = ROOT / "templates" / "index.html"
STATIC_DIR = ROOT / "static"
DIST_DIR = ROOT / "dist"
SETTINGS_YAML = ROOT / "settings.yaml"

# vendor
VENDOR_FILE = STATIC_DIR / "js" / "vendor" / "transformers-3.0.0.min.js"
TR_JS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js"
VENDOR_MD5 = "0EC705720DF86FCC95898D5D9571106A"


def load_yaml(path: Path) -> dict:
    try:
        import yaml
    except ImportError:
        print("[错误] 需要 PyYAML: pip install pyyaml")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _file_intact(path: Path, expected_md5: str) -> bool:
    if not path.exists():
        return False
    return hashlib.md5(path.read_bytes()).hexdigest().upper() == expected_md5


def download_vendor():
    if _file_intact(VENDOR_FILE, VENDOR_MD5):
        print("[vendor] transformers.js 已就绪")
        return True
    print("[vendor] 下载 transformers.js (~0.7 MB)...")
    VENDOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        urlretrieve(TR_JS_CDN, VENDOR_FILE)
        if _file_intact(VENDOR_FILE, VENDOR_MD5):
            print("[vendor] 下载完成")
            return True
        else:
            print("[vendor] 校验失败，前端将回退 CDN 加载")
            return False
    except Exception as e:
        print(f"[vendor] 下载失败: {e}")
        return False


def download_model():
    script = ROOT / "scripts" / "download_seg_model.py"
    if not script.exists():
        print("[model] 下载脚本不存在，跳过")
        return
    print("[model] 下载 AI 分割模型...")
    subprocess.run([sys.executable, str(script)])


def get_config(cfg: dict, cli_prefix: str) -> dict:
    app = cfg.get("app", {})
    pwa = cfg.get("pwa", {})
    pages = cfg.get("pages", {})
    home = pages.get("home", {})

    path_prefix = cli_prefix if cli_prefix else os.getenv("PATH_PREFIX", app.get("path_prefix", ""))

    return {
        "PATH_PREFIX": path_prefix,
        "APP_NAME": app.get("name", "Stroke"),
        "APP_VERSION": app.get("version", "0.1.0"),
        "DEBUG": app.get("debug", False),
        "TITLE": home.get("title", "Stroke"),
        "DESCRIPTION": home.get("description", ""),
        "PWA_NAME": pwa.get("name", "Stroke"),
        "PWA_SHORT_NAME": pwa.get("short_name", "Stroke"),
        "PWA_DESCRIPTION": pwa.get("description", ""),
        "PWA_THEME_COLOR": pwa.get("theme_color", "#000000"),
        "PWA_BACKGROUND_COLOR": pwa.get("background_color", "#ffffff"),
        "PWA_DISPLAY": pwa.get("display", "standalone"),
        "PWA_DISPLAY_OVERRIDE": pwa.get("display_override", []),
        "PWA_ORIENTATION": pwa.get("orientation", "portrait-primary"),
        "PWA_START_URL": pwa.get("start_url", "/"),
        "PWA_SCOPE": pwa.get("scope", "/"),
        "PWA_ICONS": pwa.get("icons", []),
        "PWA_SCREENSHOTS": pwa.get("screenshots", []),
    }


def render_html(config: dict) -> str:
    with open(TEMPLATE_HTML, encoding="utf-8") as f:
        html = f.read()

    html = html.replace("{{ PATH_PREFIX }}", config["PATH_PREFIX"])
    html = html.replace("{{ title }}", config["TITLE"])
    html = html.replace("{{ APP_NAME }}", config["APP_NAME"])
    html = html.replace("{{ description }}", config["DESCRIPTION"])
    html = html.replace("{{ PWA_THEME_COLOR }}", config["PWA_THEME_COLOR"])
    html = html.replace("{{ PWA_NAME }}", config["PWA_NAME"])
    html = html.replace("{{ APP_VERSION }}", config["APP_VERSION"])

    return html


def generate_manifest(config: dict) -> str:
    pfx = config["PATH_PREFIX"]
    data = {
        "name": config["PWA_NAME"],
        "short_name": config["PWA_SHORT_NAME"],
        "description": config["PWA_DESCRIPTION"],
        "start_url": pfx + config["PWA_START_URL"],
        "scope": pfx + config["PWA_SCOPE"],
        "id": pfx + config["PWA_START_URL"],
        "display": config["PWA_DISPLAY"],
        "display_override": config["PWA_DISPLAY_OVERRIDE"],
        "orientation": config["PWA_ORIENTATION"],
        "theme_color": config["PWA_THEME_COLOR"],
        "background_color": config["PWA_BACKGROUND_COLOR"],
        "icons": [{**i, "src": pfx + i["src"]} for i in config["PWA_ICONS"]],
        "screenshots": [{**s, "src": pfx + s["src"]} for s in config["PWA_SCREENSHOTS"]],
        "categories": ["productivity", "utilities"],
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def generate_devtools_json(config: dict) -> str:
    pfx = config["PATH_PREFIX"]
    data = {
        "customFormatters": [
            {
                "id": "stroke-devtools-formatters",
                "displayName": "Stroke DevTools Formatters",
                "formatter": f"{pfx}/static/js/devtools-formatters.js",
            }
        ]
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def build(config: dict):
    print("=" * 48)
    print(f"  {config['APP_NAME']} — 静态站点构建")
    print(f"  PATH_PREFIX = \"{config['PATH_PREFIX']}\"" if config["PATH_PREFIX"] else "  PATH_PREFIX = /")
    print("=" * 48)

    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)

    # 1. index.html
    print("[1/5] 生成 index.html")
    html = render_html(config)
    (DIST_DIR / "index.html").write_text(html, encoding="utf-8")

    # 2. manifest.json
    print("[2/5] 生成 manifest.json")
    manifest = generate_manifest(config)
    (DIST_DIR / "manifest.json").write_text(manifest, encoding="utf-8")

    # 3. sw.js
    print("[3/5] 拷贝 sw.js")
    sw_src = STATIC_DIR / "sw.js"
    if sw_src.exists():
        shutil.copy2(sw_src, DIST_DIR / "sw.js")

    # 4. static/
    print("[4/5] 拷贝 static/")
    shutil.copytree(STATIC_DIR, DIST_DIR / "static", dirs_exist_ok=True)

    # 5. .well-known/
    print("[5/5] 生成 .well-known/appspecific/com.chrome.devtools.json")
    well_known_dir = DIST_DIR / ".well-known" / "appspecific"
    well_known_dir.mkdir(parents=True, exist_ok=True)
    devtools = generate_devtools_json(config)
    (well_known_dir / "com.chrome.devtools.json").write_text(devtools, encoding="utf-8")

    print(f"\n[完成] dist/ 已生成 ({DIST_DIR.resolve()})")
    print("  使用任意静态服务器部署，例如:")
    print("    npx serve dist")
    print("    python -m http.server 8000 -d dist")


def serve_dist(host: str, port: int):
    os.chdir(str(DIST_DIR))

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    with socketserver.TCPServer((host, port), Handler) as httpd:
        print(f"\n  开发服务器: http://{host}:{port}")
        print(f"  按 Ctrl+C 停止\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止.")


def main():
    parser = argparse.ArgumentParser(description="静态站点构建工具")
    parser.add_argument("--download-model", action="store_true", help="下载 AI 分割模型 + vendor js")
    parser.add_argument("--serve", action="store_true", help="构建后启动本地开发服务器")
    parser.add_argument("--host", default="127.0.0.1", help="服务器地址 (默认 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="服务器端口 (默认 8000)")
    parser.add_argument("--prefix", default="", help="路径前缀 (覆盖 settings.yaml)")
    args = parser.parse_args()

    if not SETTINGS_YAML.exists():
        print(f"[错误] 配置文件不存在: {SETTINGS_YAML}")
        sys.exit(1)

    if not TEMPLATE_HTML.exists():
        print(f"[错误] 模板文件不存在: {TEMPLATE_HTML}")
        sys.exit(1)

    cfg = load_yaml(SETTINGS_YAML)
    config = get_config(cfg, args.prefix)

    if args.download_model:
        download_vendor()
        download_model()

    build(config)

    if args.serve:
        serve_dist(args.host, args.port)


if __name__ == "__main__":
    main()
