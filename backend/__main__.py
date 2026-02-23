"""Entry point for ``python -m backend``.

This allows running the Waifu-RT3D backend as a proper Python module::

    python -m backend          # start on default port 8080
    python -m backend --port 9090  # custom port

Using ``-m`` ensures ``sys.path`` includes the project root, so all
``from backend.xxx import ...`` imports resolve without the sys.path
hack in server.py.
"""

import uvicorn

from backend.server import app, load_config

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Waifu-RT3D Backend Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080, help="Bind port (default: 8080)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    uvicorn.run(
        "backend.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
