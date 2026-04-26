import os
from pathlib import Path
from typing import Any
import yaml


class Settings:
    """从 YAML 文件加载配置，也可通过环境变量覆盖"""

    def __init__(self, yaml_path: str | Path | None = None):
        if yaml_path is None:
            yaml_path = Path(__file__).resolve().parent.parent / "settings.yaml"
        self._data: dict[str, Any] = {}
        self._load_yaml(yaml_path)

    def _load_yaml(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(f"配置文件不存在: {path}")
        with open(path, encoding="utf-8") as f:
            self._data = yaml.safe_load(f) or {}
        # 环境变量覆盖 debug
        env_debug = os.getenv("DEBUG")
        if env_debug is not None:
            self._data.setdefault("app", {})["debug"] = env_debug.lower() in ("true", "1", "yes")

    # --- 快捷属性 ---
    @property
    def raw(self) -> dict:
        return self._data

    @property
    def APP_NAME(self) -> str:
        return self._data.get("app", {}).get("name", "App")

    @property
    def APP_VERSION(self) -> str:
        return self._data.get("app", {}).get("version", "0.1.0")

    @property
    def DEBUG(self) -> bool:
        return self._data.get("app", {}).get("debug", False)

    @property
    def TEMPLATE_DIR(self) -> str:
        return "templates"

    # PWA
    @property
    def PWA_NAME(self) -> str:
        return self._data.get("pwa", {}).get("name", "PWA App")

    @property
    def PWA_SHORT_NAME(self) -> str:
        return self._data.get("pwa", {}).get("short_name", "App")

    @property
    def PWA_DESCRIPTION(self) -> str:
        return self._data.get("pwa", {}).get("description", "")

    @property
    def PWA_THEME_COLOR(self) -> str:
        return self._data.get("pwa", {}).get("theme_color", "#000000")

    @property
    def PWA_BACKGROUND_COLOR(self) -> str:
        return self._data.get("pwa", {}).get("background_color", "#ffffff")

    @property
    def PWA_DISPLAY(self) -> str:
        return self._data.get("pwa", {}).get("display", "standalone")

    @property
    def PWA_ORIENTATION(self) -> str:
        return self._data.get("pwa", {}).get("orientation", "portrait-primary")

    @property
    def PWA_START_URL(self) -> str:
        return self._data.get("pwa", {}).get("start_url", "/")

    @property
    def PWA_SCOPE(self) -> str:
        return self._data.get("pwa", {}).get("scope", "/")

    @property
    def PWA_ICONS(self) -> list[dict]:
        return self._data.get("pwa", {}).get("icons", [])

    # pages
    @property
    def PAGES(self) -> dict:
        return self._data.get("pages", {})


settings = Settings()
