from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.routes import init_templates, router


def create_app() -> FastAPI:
    """FastAPI 应用工厂"""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
    )

    # 挂载静态文件
    static_dir = Path(__file__).resolve().parent.parent / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # 初始化 Jinja2 模板（必须在 include_router 之前）
    init_templates(app)

    # 注册路由
    app.include_router(router)

    return app
