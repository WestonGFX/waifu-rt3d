#!/usr/bin/env bash
set -euo pipefail
source .venv/bin/activate
exec uvicorn backend.server:app --host 127.0.0.1 --port 8000 --reload
