"""
下载 AI 分割模型文件到 static/models/segformer-b2/

从 HuggingFace 下载 Xenova/segformer-b2-finetuned-ade-512-512 的 ONNX 模型文件，
自动尝试多个镜像源。

用法：
    python scripts/download_seg_model.py

文件大小约 85MB，请确保网络连接稳定。
"""

import os
import sys
import hashlib
from pathlib import Path
from urllib.request import urlretrieve, urlopen, Request
from urllib.error import URLError, HTTPError

# ---------- 配置 ----------
HF_REPO = "Xenova/segformer-b2-finetuned-ade-512-512"
HF_BRANCH = "main"

MODEL_DIR = Path(__file__).resolve().parent.parent / "static" / "models" / HF_REPO

MIRRORS = [
    # 1. HuggingFace 直连（可能被墙）
    ("https://huggingface.co", False),
    # 2. hf-mirror.com（中文镜像）
    ("https://hf-mirror.com", False),
    # 3. 通过 jsDelivr CDN（模型文件可能缓存在此）
    ("https://cdn.jsdelivr.net/gh/huggingface/hub@{repo}@main", True),
]

REQUIRED_FILES = [
    "config.json",
    "preprocessor_config.json",
    "onnx/model.onnx",
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) transformers.js/3.0.0"


def build_urls(filename: str):
    """为每个镜像源生成下载 URL"""
    urls = []
    for base, is_cdn in MIRRORS:
        if is_cdn:
            # jsDelivr GitHub 映射
            url = base.replace("{repo}", HF_REPO.replace("/", "-"))
            url = f"{url}/{filename}"
        else:
            url = f"{base}/{HF_REPO}/resolve/{HF_BRANCH}/{filename}"
        urls.append((url, base))
    return urls


def download_file(filename: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  [跳过] {filename} ({size_mb:.1f} MB, 已存在)")
        return True

    urls = build_urls(filename)
    for url, source in urls:
        try:
            print(f"  [{source}] 尝试 {filename} ...", end=" ", flush=True)
            req = Request(url, headers={"User-Agent": UA})
            urlretrieve(req.url if hasattr(req, 'url') else url, dest)
            size_mb = dest.stat().st_size / (1024 * 1024)
            print(f"完成 ({size_mb:.1f} MB)")
            return True
        except (URLError, HTTPError, OSError) as e:
            print(f"失败: {e}")
            continue

    return False


def main():
    print("=" * 56)
    print("AI 分割模型下载工具")
    print(f"仓库: {HF_REPO}")
    print(f"目标: {MODEL_DIR}")
    print("=" * 56)
    print()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    failed = []
    for fname in REQUIRED_FILES:
        if not download_file(fname, MODEL_DIR / fname):
            failed.append(fname)

    if failed:
        print(f"\n[错误] 以下文件下载失败: {', '.join(failed)}")
        print("请检查网络，或手动下载后放入:")
        print(f"  {MODEL_DIR.resolve()}")
        sys.exit(1)

    print(f"\n[完成] 模型文件已就绪: {MODEL_DIR.resolve()}")
    print(f"        共 {len(list(MODEL_DIR.glob('*')))} 个文件")
    print(f"\n服务端访问路径: /static/models/{HF_REPO}/")


if __name__ == "__main__":
    main()
