#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Waifu-RT3D — Development Runner
#
# Usage:
#   ./run.sh            Start the backend server (port 8080)
#   ./run.sh dev        Start with --reload for hot-reload development
#   ./run.sh test       Run backend unit tests
#   ./run.sh check      Run ALL checks (pytest + tsc) + generate HTML dashboard
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

    check)
        # ── One-command smoke test: backend pytest + frontend tsc ──
        printf "\e[36m╔══════════════════════════════════════════════════╗\e[0m\n"
        printf "\e[36m║        Waifu-RT3D — Full Smoke Test             ║\e[0m\n"
        printf "\e[36m╚══════════════════════════════════════════════════╝\e[0m\n\n"
        cd "$SCRIPT_DIR"
        FAIL=0
        RESULTS_DIR="${SCRIPT_DIR}/.test-results"
        mkdir -p "$RESULTS_DIR"

        # --- Backend pytest ---
        printf "\e[33m▶ [1/2] Backend pytest\e[0m\n"
        PYTEST_START=$(date +%s)
        if "$VENV_PYTHON" -m pytest backend/tests/ -q --tb=line "${@:2}" \
            2>&1 | tee "$RESULTS_DIR/pytest.txt"; then
            PYTEST_RC=0
            printf "\e[32m✓ Backend tests PASSED\e[0m\n\n"
        else
            PYTEST_RC=1
            FAIL=1
            printf "\e[31m✗ Backend tests FAILED\e[0m\n\n"
        fi
        PYTEST_END=$(date +%s)
        PYTEST_TIME=$((PYTEST_END - PYTEST_START))

        # --- Frontend tsc ---
        printf "\e[33m▶ [2/2] Frontend TypeScript check\e[0m\n"
        TSC_START=$(date +%s)
        if (cd "$SAKURA_DIR" && npx tsc --project tsconfig.app.json --noEmit 2>&1) \
            | tee "$RESULTS_DIR/tsc.txt"; then
            TSC_RC=0
            printf "\e[32m✓ TypeScript check PASSED\e[0m\n\n"
        else
            TSC_RC=1
            FAIL=1
            printf "\e[31m✗ TypeScript check FAILED\e[0m\n\n"
        fi
        TSC_END=$(date +%s)
        TSC_TIME=$((TSC_END - TSC_START))

        # --- Extract test count from pytest output ---
        PYTEST_COUNT=$(grep -oE '[0-9]+ passed' "$RESULTS_DIR/pytest.txt" | head -1 || echo "? passed")
        TSC_ERRORS=$(wc -l < "$RESULTS_DIR/tsc.txt" | tr -d ' ')

        # --- Summary ---
        printf "\e[36m┌──────────────────────────────────────────────────┐\e[0m\n"
        printf "\e[36m│             SMOKE TEST RESULTS                   │\e[0m\n"
        printf "\e[36m├──────────────────────────────────────────────────┤\e[0m\n"
        if [[ $PYTEST_RC -eq 0 ]]; then
            printf "\e[36m│\e[0m  \e[32m✓\e[0m Backend pytest   %s  (%ss)      \e[36m│\e[0m\n" "$PYTEST_COUNT" "$PYTEST_TIME"
        else
            printf "\e[36m│\e[0m  \e[31m✗\e[0m Backend pytest   FAILED  (%ss)         \e[36m│\e[0m\n" "$PYTEST_TIME"
        fi
        if [[ $TSC_RC -eq 0 ]]; then
            printf "\e[36m│\e[0m  \e[32m✓\e[0m Frontend tsc     clean  (%ss)          \e[36m│\e[0m\n" "$TSC_TIME"
        else
            printf "\e[36m│\e[0m  \e[31m✗\e[0m Frontend tsc     %s errors  (%ss)  \e[36m│\e[0m\n" "$TSC_ERRORS" "$TSC_TIME"
        fi
        printf "\e[36m└──────────────────────────────────────────────────┘\e[0m\n"

        # --- Generate HTML dashboard ---
        NOW=$(date '+%Y-%m-%d %H:%M:%S')
        cat > "$RESULTS_DIR/dashboard.html" <<HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waifu-RT3D Test Dashboard</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --green: #3fb950; --red: #f85149; --yellow: #d29922; --text: #e6edf3; --muted: #8b949e; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); margin-bottom: 2rem; font-size: 0.875rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 800px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
  .card h2 { font-size: 1rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge.pass { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge.fail { background: rgba(248,81,73,0.15); color: var(--red); }
  .stat { font-size: 2rem; font-weight: 700; }
  .stat.green { color: var(--green); }
  .stat.red { color: var(--red); }
  .meta { color: var(--muted); font-size: 0.8rem; margin-top: 0.5rem; }
  pre { background: #0d1117; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 1rem; overflow-x: auto; font-size: 0.8rem; max-height: 300px; overflow-y: auto; color: var(--muted); }
  .full-width { grid-column: 1 / -1; }
  .refresh-btn { background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem; }
  .refresh-btn:hover { border-color: var(--green); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Waifu-RT3D Test Dashboard</h1>
    <div class="subtitle">Last run: ${NOW}</div>
  </div>
  <button class="refresh-btn" onclick="location.reload()">Refresh</button>
</div>
<div class="grid">
  <div class="card">
    <h2>Backend (pytest) <span class="badge $([ $PYTEST_RC -eq 0 ] && echo pass || echo fail)">$([ $PYTEST_RC -eq 0 ] && echo PASS || echo FAIL)</span></h2>
    <div class="stat $([ $PYTEST_RC -eq 0 ] && echo green || echo red)">${PYTEST_COUNT}</div>
    <div class="meta">${PYTEST_TIME}s runtime</div>
  </div>
  <div class="card">
    <h2>Frontend (tsc) <span class="badge $([ $TSC_RC -eq 0 ] && echo pass || echo fail)">$([ $TSC_RC -eq 0 ] && echo PASS || echo FAIL)</span></h2>
    <div class="stat $([ $TSC_RC -eq 0 ] && echo green || echo red)">$([ $TSC_RC -eq 0 ] && echo "Clean" || echo "${TSC_ERRORS} errors")</div>
    <div class="meta">${TSC_TIME}s runtime</div>
  </div>
  <div class="card full-width">
    <h2>pytest output</h2>
    <pre>$(cat "$RESULTS_DIR/pytest.txt" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</pre>
  </div>
  <div class="card full-width">
    <h2>tsc output</h2>
    <pre>$(cat "$RESULTS_DIR/tsc.txt" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g' || echo "(clean — no errors)")</pre>
  </div>
</div>
</body>
</html>
HTMLEOF
        printf "\n\e[36m📊 Dashboard: file://%s/dashboard.html\e[0m\n" "$RESULTS_DIR"

        if [[ $FAIL -eq 0 ]]; then
            printf "\n\e[32m══════════════════════════════════════════════════\e[0m\n"
            printf "\e[32m  ALL CHECKS PASSED\e[0m\n"
            printf "\e[32m══════════════════════════════════════════════════\e[0m\n"
        else
            printf "\n\e[31m══════════════════════════════════════════════════\e[0m\n"
            printf "\e[31m  SOME CHECKS FAILED — see details above\e[0m\n"
            printf "\e[31m══════════════════════════════════════════════════\e[0m\n"
        fi
        exit $FAIL
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
        printf "  ./run.sh check        Run ALL checks (pytest + tsc) with dashboard\n"
        printf "  ./run.sh frontend     Start Sakura dev server (port 5173)\n"
        printf "  ./run.sh both         Start backend + Sakura concurrently\n"
        exit 1
        ;;
esac
