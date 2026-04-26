"""
生产服务器入口 (ASGI / WSGI) — Windows / Linux 通用

用法:
  python serve.py              # 默认 ASGI (uvicorn)
  python serve.py --asgi       # ASGI 模式 (uvicorn)
  python serve.py --wsgi       # WSGI 模式 (waitress + a2wsgi)
  python serve.py --debug      # 调试模式 (仅 ASGI, 开启 reload 单 worker)
"""
import argparse
import yaml
from pathlib import Path


def load_server_config():
    yaml_path = Path(__file__).resolve().parent / "settings.yaml"
    with open(yaml_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg.get("server", {})


def run_asgi(host: str, port: int, workers: int, debug: bool = False):
    """ASGI 模式: uvicorn（跨平台）"""
    import uvicorn
    actual_workers = 1 if debug else workers
    print(f"  [ASGI] uvicorn  ->  http://{host}:{port}  (workers={actual_workers}, reload={debug})")
    uvicorn.run(
        "app:create_app",
        host=host,
        port=port,
        workers=actual_workers,
        reload=debug,
        log_level="info",
        factory=True,
    )


def run_wsgi(host: str, port: int):
    """WSGI 模式: waitress + a2wsgi（Windows / Linux 通用）"""
    from a2wsgi import ASGIMiddleware
    from waitress import serve as wsgi_serve

    from app import create_app
    asgi_app = create_app()
    wsgi_app = ASGIMiddleware(asgi_app)

    print(f"  [WSGI] waitress  ->  http://{host}:{port}")
    print("  按 Ctrl+C 停止")
    wsgi_serve(wsgi_app, host=host, port=port, threads=4)


def main():
    parser = argparse.ArgumentParser(description="FastAPI 生产服务器 (ASGI/WSGI)")
    parser.add_argument("--asgi", action="store_true", help="ASGI 模式 (uvicorn)")
    parser.add_argument("--wsgi", action="store_true", help="WSGI 模式 (waitress + a2wsgi)")
    parser.add_argument("--debug", action="store_true", help="调试模式 (仅 ASGI, reload + 单 worker)")
    args = parser.parse_args()

    cfg = load_server_config()
    host = cfg.get("host", "0.0.0.0")
    port = cfg.get("port", 8000)
    workers = cfg.get("workers", 4)

    if args.wsgi:
        run_wsgi(host, port)
    else:
        run_asgi(host, port, workers, debug=args.debug)


if __name__ == "__main__":
    main()
