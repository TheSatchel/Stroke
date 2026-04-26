"""首页 — 图像生成工作台"""

from fastapi import APIRouter, Request

from app.config import settings

router = APIRouter()

_templates = None


def _set_templates(t):
    global _templates
    _templates = t


@router.get("/")
async def index(request: Request):
    page = settings.PAGES.get("home", {})
    ctx = {
        "request": request,
        "title": page.get("title", "Stroke"),
        "description": page.get("description", ""),
        "debug": settings.DEBUG,
    }
    return _templates.TemplateResponse("index.html", ctx)