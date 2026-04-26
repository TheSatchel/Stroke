"""
开发服务器入口
用法: python development.py
"""
import uvicorn
import yaml
from pathlib import Path


def main():
    # 读取配置
    yaml_path = Path(__file__).resolve().parent / "settings.yaml"
    with open(yaml_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    server = cfg.get("server", {})
    host = server.get("host", "127.0.0.1")
    port = server.get("port", 8000)

    print(f" 开发服务器启动: http://{host}:{port}")
    print(f" 访问 /manifest.json 查看 PWA manifest")
    print(f" 访问 /health 健康检查")

    uvicorn.run(
        "app:create_app",
        host=host,
        port=port,
        reload=True,
        log_level="info",
        factory=True,
    )


if __name__ == "__main__":
    main()
