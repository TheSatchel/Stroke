"""PWA manifest.json 动态生成"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter()


@router.get("/manifest.json")
async def manifest():
    data = {
        "name": settings.PWA_NAME,
        "short_name": settings.PWA_SHORT_NAME,
        "description": settings.PWA_DESCRIPTION,
        "start_url": settings.PWA_START_URL,
        "scope": settings.PWA_SCOPE,
        "id": settings.PWA_START_URL,
        "display": settings.PWA_DISPLAY,
        "display_override": settings.PWA_DISPLAY_OVERRIDE,
        "orientation": settings.PWA_ORIENTATION,
        "theme_color": settings.PWA_THEME_COLOR,
        "background_color": settings.PWA_BACKGROUND_COLOR,
        "icons": settings.PWA_ICONS,
        "screenshots": settings.PWA_SCREENSHOTS,
        "categories": ["productivity", "utilities"],
    }
    return JSONResponse(content=data, media_type="application/manifest+json")