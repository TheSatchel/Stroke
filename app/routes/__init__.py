"""
Routes 包 — 动态发现并注册所有子路由模块。

用法：
    在此目录下新增任意 .py 文件，导出 `router: APIRouter` 对象，
    即可被自动发现并注册到主应用。

    如果子模块需要访问 Jinja2 templates，导出 `_set_templates(t)` 函数，
    init_templates() 会在应用启动时调用它。
"""

from fastapi import APIRouter
import importlib
import pkgutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI

router = APIRouter()


def init_templates(app: FastAPI):
    """
    由 create_app() 调用，初始化 templates 并将其注入所有子路由模块。
    """
    from app.templates import setup_templates

    templates = setup_templates(app)

    _package_dir = Path(__file__).resolve().parent
    for _, module_name, _ in pkgutil.iter_modules([str(_package_dir)]):
        if module_name.startswith('_'):
            continue
        mod = importlib.import_module(f'app.routes.{module_name}')
        if hasattr(mod, '_set_templates'):
            mod._set_templates(templates)


# --- 应用启动时，自动发现并注册本包内所有路由模块 ---
_package_dir = Path(__file__).resolve().parent
for _, _module_name, _ in pkgutil.iter_modules([str(_package_dir)]):
    if _module_name.startswith('_'):
        continue
    _mod = importlib.import_module(f'app.routes.{_module_name}')
    if hasattr(_mod, 'router'):
        router.include_router(_mod.router)