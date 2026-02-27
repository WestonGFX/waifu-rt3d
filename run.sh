#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Waifu-RT3D — Development Runner
#
# Usage:
#   ./run.sh            Start the backend server (port 8080)
#   ./run.sh dev        Start with --reload for hot-reload development
#   ./run.sh test       Run backend unit tests
#   ./run.sh frontend   Start Sakura frontend dev server (port 5173)
#   ./run.sh both       Start backend + Sakura frontend concurrently
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/.venv/bin/python"
SAKURA_DIR="${SCRIPT_DIR}/frontends/sakura"

# Verify the venv exists — if not, tell the user to run setup.sh first
if [[ ! -x "$VENV_PYTHON" ]]; then
    printf "\e[31m[ERROR]\e[0m .venv not found. Run ./setup.sh first.\n"
    exit 1
fi

MODE="${1:-server}"

case "$MODE" in
    server)
        printf "\e[36m[INFO]\e[0m  Starting Waifu-RT3D backend on http://localhost:8080\n"
        cd "$SCRIPT_DIR"
        exec "$VENV_PYTHON" -m uvicorn backend.server:app \
            --host 0.0.0.0 --port 8080
        ;;

    dev)
        printf "\e[36m[INFO]\e[0m  Starting backend with hot-reload on http://localhost:8080\n"
        cd "$SCRIPT_DIR"
        exec "$VENV_PYTHON" -m uvicorn backend.server:app \
            --host 0.0.0.0 --port 8080 --reload
        ;;

    test)
        printf "\e[36m[INFO]\e[0m  Running backend unit tests...\n"
        cd "$SCRIPT_DIR"
        exec "$VENV_PYTHON" -m pytest backend/tests/ -v --tb=short "${@:2}"
        ;;

    frontend)
        printf "\e[36m[INFO]\e[0m  Starting Sakura frontend dev server on http://localhost:5173\n"
        cd "$SAKURA_DIR"
        exec npm run dev
        ;;

    both)
        printf "\e[36m[INFO]\e[0m  Starting backend + Sakura frontend...\n"
        cd "$SCRIPT_DIR"
        # Start backend in background
        "$VENV_PYTHON" -m uvicorn backend.server:app --host 0.0.0.0 --port 8080 &
        BACKEND_PID=$!
        printf "\e[32m[  OK]\e[0m  Backend PID %s started\n" "$BACKEND_PID"

        # Start Sakura dev server
        trap "kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM
        cd "$SAKURA_DIR"
        npm run dev
        ;;

    *)
        printf "\e[31m[ERROR]\e[0m Unknown command: %s\n\n" "$MODE"
        printf "Usage:\n"
        printf "  ./run.sh              Start server (port 8080)\n"
        printf "  ./run.sh dev          Start with hot-reload\n"
        printf "  ./run.sh test         Run backend tests\n"
        printf "  ./run.sh frontend     Start Sakura dev server (port 5173)\n"
        printf "  ./run.sh both         Start backend + Sakura concurrently\n"
        exit 1
        ;;
esac
