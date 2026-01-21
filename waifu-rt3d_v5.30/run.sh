#!/usr/bin/env bash
set -euo pipefail
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "No virtual environment found!"
    exit 1
fi
exec uvicorn backend.server:app --host 127.0.0.1 --port 8000 --reload
