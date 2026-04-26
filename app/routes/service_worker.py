"""Service Worker 脚本服务"""

from fastapi import APIRouter
from fastapi.responses import Response
from pathlib import Path

router = APIRouter()


@router.get("/sw.js")
async def service_worker():
    sw_path = Path(__file__).resolve().parent.parent.parent / "static" / "sw.js"
    if not sw_path.exists():
        return Response(status_code=404)
    content = sw_path.read_text(encoding="utf-8")
    return Response(
        content=content,
        media_type="application/javascript",
        headers={
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-cache",
        },
    )