#!/usr/bin/env bash
set -euo pipefail
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python backend/preflight.py
python tools/fetch_offline_libs.py || true
echo "Install complete. Next: ./run.sh"
