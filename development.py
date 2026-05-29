"""
开发服务器入口
用法: python development.py
"""
import uvicorn

from app.config import load_server_config


def main():
    server = load_server_config()
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
