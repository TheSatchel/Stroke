"""健康检查"""

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}