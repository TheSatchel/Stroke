from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from fastapi.templating import Jinja2Templates
from fastapi import FastAPI

from app.config import settings


def setup_templates(app: FastAPI) -> Jinja2Templates:
    """配置 Jinja2 模板引擎"""
    template_dir = Path(__file__).resolve().parent.parent / settings.TEMPLATE_DIR
    template_dir.mkdir(parents=True, exist_ok=True)

    templates = Jinja2Templates(directory=str(template_dir))

    # 注入全局变量到模板
    templates.env.globals["APP_NAME"] = settings.APP_NAME
    templates.env.globals["APP_VERSION"] = settings.APP_VERSION
    templates.env.globals["PWA_NAME"] = settings.PWA_NAME
    templates.env.globals["PWA_THEME_COLOR"] = settings.PWA_THEME_COLOR
    templates.env.globals["DEBUG"] = settings.DEBUG

    return templates
