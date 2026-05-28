"""健康检查"""

import os
import platform
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter

from app.config import settings

router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent.parent
MODEL_FILE = (
    ROOT / "static" / "models" / "Xenova" / "segformer-b2-finetuned-ade-512-512"
    / "onnx" / "model_quantized.onnx"
)
START_TIME = time.time()


def _git_info():
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT), stderr=subprocess.DEVNULL
        ).decode().strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(ROOT), stderr=subprocess.DEVNULL
        ).decode().strip()
        return commit, branch
    except Exception:
        return None, None


def _model_size():
    if not MODEL_FILE.exists():
        return None
    total = sum(
        f.stat().st_size
        for f in MODEL_FILE.parent.parent.rglob("*")
        if f.is_file()
    )
    return round(total / (1024 * 1024), 1)


@router.get("/health")
async def health():
    commit, branch = _git_info()
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "git_commit": commit,
        "git_branch": branch,
        "debug": settings.DEBUG,
        "path_prefix": settings.PATH_PREFIX or "/",
        "python": platform.python_version(),
        "platform": platform.system(),
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "model_available": MODEL_FILE.exists(),
        "model_size_mb": _model_size(),
    }