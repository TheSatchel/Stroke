"""Chrome DevTools 自定义格式化器配置"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/.well-known/appspecific/com.chrome.devtools.json")
async def devtools_config():
    data = {
        "customFormatters": [
            {
                "id": "stroke-devtools-formatters",
                "displayName": "Stroke DevTools Formatters",
                "formatter": "/static/js/devtools-formatters.js",
            }
        ]
    }
    return JSONResponse(content=data)
