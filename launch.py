"""
launch.py — 统一启动入口

整合依赖安装、模型检测、服务器启动，替代 serve.bat

用法:
    python launch.py                    # 交互菜单
    python launch.py --dev              # 开发模式 (reload)
    python launch.py --asgi             # ASGI 生产模式
    python launch.py --wsgi             # WSGI 模式
    python launch.py --cdn              # CDN 模式 ASGI
    python launch.py --cdn --wsgi       # CDN 模式 WSGI
    python launch.py --install          # 安装依赖后启动
    python launch.py --download-model   # 仅下载 AI 分割模型
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MODEL_FILE = ROOT / "static" / "models" / "Xenova" / "segformer-b2-finetuned-ade-512-512" / "onnx" / "model_quantized.onnx"


def install_deps():
    print("\n正在安装 Python 依赖...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt",
             "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"],
        )
    except subprocess.CalledProcessError:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
        )
    print("依赖安装完成.\n")


def check_model():
    if MODEL_FILE.exists():
        return True
    print("\nAI 分割模型未找到，正在下载 (~190 MB)...")
    script = ROOT / "scripts" / "download_seg_model.py"
    if not script.exists():
        print("  下载脚本不存在，跳过.")
        return False
    try:
        subprocess.check_call([sys.executable, str(script)])
        return MODEL_FILE.exists()
    except subprocess.CalledProcessError:
        print("  模型下载失败，AI 分割功能将不可用.")
        return False


def start_server(mode: str, path_prefix: str = ""):
    env = dict(os.environ)
    if path_prefix:
        env["PATH_PREFIX"] = path_prefix

    args = [sys.executable]
    if mode == "dev":
        args.append(str(ROOT / "development.py"))
    else:
        args.append(str(ROOT / "serve.py"))
        if mode == "wsgi":
            args.append("--wsgi")
        else:
            args.append("--asgi")

    subprocess.run(args, env=env)


def show_menu():
    print("=" * 48)
    print("  Stroke — FastAPI Jinja2 PWA")
    print("=" * 48)
    print("  1. Dev 模式 (uvicorn --reload)")
    print("  2. 生产 ASGI (uvicorn)")
    print("  3. 生产 WSGI (waitress)")
    print("  4. CDN 模式 ASGI (prefix=/image)")
    print("  5. CDN 模式 WSGI (prefix=/image)")
    print("  6. 安装依赖")
    print("  7. 下载 AI 分割模型")
    print("  8. 退出")
    print("=" * 48)

    while True:
        try:
            choice = input("请选择 [1-8]: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if choice == "1":
            check_model()
            start_server("dev")
            break
        elif choice == "2":
            check_model()
            start_server("asgi")
            break
        elif choice == "3":
            check_model()
            start_server("wsgi")
            break
        elif choice == "4":
            check_model()
            start_server("asgi", "/image")
            break
        elif choice == "5":
            check_model()
            start_server("wsgi", "/image")
            break
        elif choice == "6":
            install_deps()
            show_menu()
            break
        elif choice == "7":
            check_model()
            show_menu()
            break
        elif choice == "8":
            print("再见!")
            return
        else:
            print("无效选择，请重新输入.")


def main():
    parser = argparse.ArgumentParser(description="Stroke 统一启动器")
    parser.add_argument("--install", action="store_true", help="启动前安装依赖")
    parser.add_argument("--dev", action="store_true", help="开发模式 (reload)")
    parser.add_argument("--asgi", action="store_true", help="ASGI 模式")
    parser.add_argument("--wsgi", action="store_true", help="WSGI 模式")
    parser.add_argument("--cdn", action="store_true", help="CDN 模式 (PATH_PREFIX=/image)")
    parser.add_argument("--download-model", action="store_true", help="仅下载 AI 分割模型后退出")
    args = parser.parse_args()

    # 纯下载模式
    if args.download_model:
        check_model()
        return

    # 命令行参数启动（跳过菜单）
    has_mode = args.dev or args.asgi or args.wsgi
    if has_mode:
        if args.install:
            install_deps()
        check_model()

        mode = "dev" if args.dev else ("wsgi" if args.wsgi else "asgi")
        prefix = "/image" if args.cdn else ""
        try:
            start_server(mode, prefix)
        except KeyboardInterrupt:
            print("\n服务器已停止.")
        return

    # 无参数 → 交互菜单
    show_menu()


if __name__ == "__main__":
    main()
