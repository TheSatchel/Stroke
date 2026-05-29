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
import hashlib
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve


ROOT = Path(__file__).resolve().parent
MODEL_FILE = ROOT / "static" / "models" / "Xenova" / "segformer-b2-finetuned-ade-512-512" / "onnx" / "model_quantized.onnx"
VENDOR_FILE = ROOT / "static" / "js" / "vendor" / "transformers-3.0.0.min.js"
TR_JS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js"
VENDOR_MD5 = "0EC705720DF86FCC95898D5D9571106A"
MODEL_MD5 = "4DAD0B17A4EE37EDB4E12EE50D6971A3"


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


def _file_intact(path: Path, expected_md5: str) -> bool:
    if not path.exists():
        return False
    return hashlib.md5(path.read_bytes()).hexdigest().upper() == expected_md5


def check_vendor():
    if _file_intact(VENDOR_FILE, VENDOR_MD5):
        return True
    if VENDOR_FILE.exists():
        print("Transformers.js 文件不完整，重新下载...")
    else:
        print("Transformers.js 库未找到，正在下载 (~0.7 MB)...")
    VENDOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        urlretrieve(TR_JS_CDN, VENDOR_FILE)
        if _file_intact(VENDOR_FILE, VENDOR_MD5):
            print("  下载完成.")
            return True
        else:
            print("  下载后校验失败，前端将回退到 CDN 加载.")
            return False
    except Exception as e:
        print(f"  下载失败: {e}")
        print("  前端将自动回退到 CDN 加载，不影响使用.")
        return False


def check_model():
    if _file_intact(MODEL_FILE, MODEL_MD5):
        return True
    if MODEL_FILE.exists():
        print("\nAI 分割模型不完整，重新下载...")
    else:
        print("\nAI 分割模型未找到，正在下载 (~190 MB)...")
    script = ROOT / "scripts" / "download_seg_model.py"
    if not script.exists():
        print("  下载脚本不存在，跳过.")
        return False
    try:
        subprocess.check_call([sys.executable, str(script)])
        return _file_intact(MODEL_FILE, MODEL_MD5)
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
    print("  7. 下载 AI 分割模型 & 库文件")
    print("  8. 退出")
    print("=" * 48)

    while True:
        try:
            choice = input("请选择 [1-8]: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if choice in ("1", "2", "3", "4", "5"):
            check_vendor()
            check_model()
            if choice == "1":
                start_server("dev")
            elif choice == "2":
                start_server("asgi")
            elif choice == "3":
                start_server("wsgi")
            elif choice == "4":
                start_server("asgi", "/image")
            elif choice == "5":
                start_server("wsgi", "/image")
            break
        elif choice == "6":
            install_deps()
            show_menu()
            break
        elif choice == "7":
            check_vendor()
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

    if args.download_model:
        check_vendor()
        check_model()
        return

    has_mode = args.dev or args.asgi or args.wsgi
    if has_mode:
        if args.install:
            install_deps()
        check_vendor()
        check_model()

        mode = "dev" if args.dev else ("wsgi" if args.wsgi else "asgi")
        prefix = "/image" if args.cdn else ""
        try:
            start_server(mode, prefix)
        except KeyboardInterrupt:
            print("\n服务器已停止.")
        return

    show_menu()


if __name__ == "__main__":
    main()
