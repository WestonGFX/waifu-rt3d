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

    dash|dashboard)
        # Open the dashboard — start server if needed, no tests
        RESULTS_DIR="${SCRIPT_DIR}/artifacts"
        if [[ ! -f "$RESULTS_DIR/dashboard.html" ]]; then
            printf "\e[31m[ERROR]\e[0m No dashboard yet. Run ./run.sh check first.\n"
            exit 1
        fi
        DASH_PORT=3333
        PIDFILE="$RESULTS_DIR/.dash.pid"
        if [[ -f "$PIDFILE" ]]; then
            kill "$(cat "$PIDFILE")" 2>/dev/null || true
        fi
        "$VENV_PYTHON" -m http.server $DASH_PORT --directory "$RESULTS_DIR" &>/dev/null &
        echo $! > "$PIDFILE"
        sleep 0.3
        printf "\e[36m🌐 Dashboard:\e[0m\n   http://localhost:${DASH_PORT}/dashboard.html\n"
        open "http://localhost:${DASH_PORT}/dashboard.html"
        ;;

    check)
        # ── One-command smoke test: backend pytest + frontend tsc ──
        printf "\e[36m╔══════════════════════════════════════════════════╗\e[0m\n"
        printf "\e[36m║        Waifu-RT3D — Full Smoke Test             ║\e[0m\n"
        printf "\e[36m╚══════════════════════════════════════════════════╝\e[0m\n\n"
        cd "$SCRIPT_DIR"
        FAIL=0
        RESULTS_DIR="${SCRIPT_DIR}/artifacts"
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

        # --- Generate HTML dev dashboard ---
        NOW=$(date '+%Y-%m-%d %H:%M:%S')
        SCHEMA_VER=$(grep -oE 'v[0-9]+' "$SCRIPT_DIR/CURRENT_STATUS.md" | head -1 || echo "v??")
        GIT_BRANCH=$(git -C "$SCRIPT_DIR" branch --show-current 2>/dev/null || echo "?")
        GIT_HASH=$(git -C "$SCRIPT_DIR" log --oneline -1 2>/dev/null || echo "?")
        GIT_DIRTY=$(git -C "$SCRIPT_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

        cat > "$RESULTS_DIR/dashboard.html" <<HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waifu-RT3D Dev Panel</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --green: #3fb950; --red: #f85149; --yellow: #d29922; --blue: #58a6ff; --purple: #bc8cff; --pink: #f778ba; --text: #e6edf3; --muted: #8b949e; --accent: #f778ba; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 0; min-height: 100vh; }

  /* Hero */
  .hero { padding: 2.5rem 3rem 1.5rem; background: linear-gradient(135deg, #161b22 0%, #1a1025 50%, #161b22 100%); border-bottom: 1px solid var(--border); }
  .hero h1 { font-size: 1.75rem; font-weight: 700; background: linear-gradient(90deg, var(--pink), var(--purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.25rem; }
  .hero-sub { color: var(--muted); font-size: 0.85rem; }

  /* Quick Actions */
  .actions { display: flex; gap: 0.75rem; padding: 1.5rem 3rem; flex-wrap: wrap; }
  .action-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem; border-radius: 10px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-size: 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.15s; }
  .action-btn:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(247,120,186,0.15); }
  .action-btn.primary { background: linear-gradient(135deg, #f778ba, #bc8cff); border-color: transparent; color: #fff; }
  .action-btn.primary:hover { box-shadow: 0 4px 20px rgba(247,120,186,0.3); }
  .action-btn .icon { font-size: 1.1rem; }

  /* Content */
  .content { padding: 1.5rem 3rem 3rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
  .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.5rem; }
  .card-value { font-size: 1.5rem; font-weight: 700; }
  .card-value.green { color: var(--green); }
  .card-value.red { color: var(--red); }
  .card-value.blue { color: var(--blue); }
  .card-value.purple { color: var(--purple); }
  .card-value.pink { color: var(--pink); }
  .card-meta { color: var(--muted); font-size: 0.8rem; margin-top: 0.35rem; }

  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
  .badge.pass { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge.fail { background: rgba(248,81,73,0.15); color: var(--red); }

  /* Links section */
  .links { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 2rem; }
  .link-card { display: flex; align-items: center; gap: 0.75rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 0.85rem 1rem; text-decoration: none; color: var(--text); transition: all 0.15s; }
  .link-card:hover { border-color: var(--blue); background: rgba(88,166,255,0.05); }
  .link-icon { font-size: 1.2rem; }
  .link-label { font-size: 0.85rem; font-weight: 500; }
  .link-desc { font-size: 0.7rem; color: var(--muted); }

  /* Collapsible sections */
  details { margin-bottom: 1rem; }
  summary { cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--muted); padding: 0.5rem 0; user-select: none; }
  summary:hover { color: var(--text); }
  pre { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 0.5rem; overflow-x: auto; font-size: 0.78rem; max-height: 300px; overflow-y: auto; color: var(--muted); line-height: 1.5; }

  /* Section headers */
  .section-title { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.75rem; font-weight: 600; }

  /* Shortcuts table */
  .shortcuts { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .shortcuts td { padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--border); }
  .shortcuts td:first-child { font-family: 'SF Mono', 'Fira Code', monospace; color: var(--blue); white-space: nowrap; font-size: 0.78rem; }
  .shortcuts td:last-child { color: var(--muted); }
</style>
</head>
<body>

<!-- HERO -->
<div class="hero">
  <h1>Waifu-RT3D</h1>
  <div class="hero-sub">Dev Panel &middot; ${NOW}</div>
</div>

<!-- QUICK ACTIONS -->
<div class="actions">
  <a class="action-btn primary" href="http://localhost:8080" target="_blank">
    <span class="icon">&#9654;</span> Open App
  </a>
  <a class="action-btn" href="http://localhost:8080/sakura" target="_blank">
    <span class="icon">&#127800;</span> Sakura UI
  </a>
  <a class="action-btn" href="http://localhost:5173" target="_blank">
    <span class="icon">&#9889;</span> Dev Server
  </a>
  <a class="action-btn" href="http://localhost:8080/api/health" target="_blank">
    <span class="icon">&#128154;</span> Health Check
  </a>
  <a class="action-btn" href="http://localhost:8080/viewer/viewer.html" target="_blank">
    <span class="icon">&#127916;</span> 3D Viewer
  </a>
  <a class="action-btn" href="http://localhost:8080/neon" target="_blank">
    <span class="icon">&#128302;</span> Neon UI
  </a>
</div>

<div class="content">

  <!-- STATUS CARDS -->
  <div class="section-title">Status</div>
  <div class="grid">
    <div class="card">
      <div class="card-label">Backend Tests</div>
      <div class="card-value $([ $PYTEST_RC -eq 0 ] && echo green || echo red)">${PYTEST_COUNT} <span class="badge $([ $PYTEST_RC -eq 0 ] && echo pass || echo fail)">$([ $PYTEST_RC -eq 0 ] && echo PASS || echo FAIL)</span></div>
      <div class="card-meta">${PYTEST_TIME}s runtime</div>
    </div>
    <div class="card">
      <div class="card-label">Frontend Types</div>
      <div class="card-value $([ $TSC_RC -eq 0 ] && echo green || echo red)">$([ $TSC_RC -eq 0 ] && echo "Clean" || echo "${TSC_ERRORS} errors") <span class="badge $([ $TSC_RC -eq 0 ] && echo pass || echo fail)">$([ $TSC_RC -eq 0 ] && echo PASS || echo FAIL)</span></div>
      <div class="card-meta">${TSC_TIME}s runtime</div>
    </div>
    <div class="card">
      <div class="card-label">Branch</div>
      <div class="card-value blue">${GIT_BRANCH}</div>
      <div class="card-meta">${GIT_HASH}</div>
    </div>
    <div class="card">
      <div class="card-label">Schema</div>
      <div class="card-value purple">${SCHEMA_VER}</div>
      <div class="card-meta">${GIT_DIRTY} uncommitted files</div>
    </div>
  </div>

  <!-- QUICK LINKS -->
  <div class="section-title">Quick Links</div>
  <div class="links">
    <a class="link-card" href="http://localhost:8080/api/config" target="_blank">
      <span class="link-icon">&#9881;</span>
      <div><div class="link-label">App Config</div><div class="link-desc">View live configuration JSON</div></div>
    </a>
    <a class="link-card" href="http://localhost:8080/viewer/overlay.html" target="_blank">
      <span class="link-icon">&#127909;</span>
      <div><div class="link-label">OBS Overlay</div><div class="link-desc">Transparent streaming overlay</div></div>
    </a>
    <a class="link-card" href="http://localhost:8080/api/hardware" target="_blank">
      <span class="link-icon">&#128187;</span>
      <div><div class="link-label">Hardware Info</div><div class="link-desc">GPU, VRAM, platform detection</div></div>
    </a>
    <a class="link-card" href="http://localhost:8080/api/models/installed" target="_blank">
      <span class="link-icon">&#129302;</span>
      <div><div class="link-label">Installed Models</div><div class="link-desc">LM Studio / Ollama models</div></div>
    </a>
  </div>

  <!-- KEYBOARD SHORTCUTS -->
  <div class="section-title">Keyboard Shortcuts</div>
  <div class="card" style="margin-bottom: 2rem;">
    <table class="shortcuts">
      <tr><td>Ctrl+,</td><td>Settings</td></tr>
      <tr><td>Ctrl+M</td><td>Memory Browser</td></tr>
      <tr><td>Alt+C</td><td>Context Viewer</td></tr>
      <tr><td>Alt+Shift+B</td><td>Boundaries</td></tr>
      <tr><td>Alt+Shift+V</td><td>Private Vocabulary</td></tr>
      <tr><td>Alt+A</td><td>Analytics</td></tr>
      <tr><td>Alt+G</td><td>Games</td></tr>
      <tr><td>Alt+S</td><td>Session Summary</td></tr>
      <tr><td>Ctrl+I</td><td>Cinematic Mode</td></tr>
      <tr><td>Esc</td><td>Close Overlay</td></tr>
      <tr><td>?</td><td>Show All Shortcuts</td></tr>
    </table>
  </div>

  <!-- TERMINAL COMMANDS -->
  <div class="section-title">Terminal Commands</div>
  <div class="card" style="margin-bottom: 2rem;">
    <table class="shortcuts">
      <tr><td>./run.sh</td><td>Start backend server</td></tr>
      <tr><td>./run.sh both</td><td>Start backend + frontend</td></tr>
      <tr><td>./run.sh dev</td><td>Start with hot-reload</td></tr>
      <tr><td>./run.sh check</td><td>Run all tests + open this page</td></tr>
      <tr><td>./run.sh test</td><td>Backend tests only</td></tr>
    </table>
  </div>

  <!-- TEST OUTPUT (collapsed) -->
  <div class="section-title">Test Output</div>
  <details>
    <summary>pytest output (${PYTEST_COUNT}, ${PYTEST_TIME}s)</summary>
    <pre>$(cat "$RESULTS_DIR/pytest.txt" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</pre>
  </details>
  <details>
    <summary>tsc output ($([ $TSC_RC -eq 0 ] && echo "clean" || echo "${TSC_ERRORS} errors"), ${TSC_TIME}s)</summary>
    <pre>$(cat "$RESULTS_DIR/tsc.txt" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</pre>
  </details>

</div>
</body>
</html>
HTMLEOF
        # Dashboard available two ways:
        # 1. File: artifacts/dashboard.html (always there, open from Finder)
        # 2. Server: localhost on a random port (links work, no Chrome warnings)
        printf "\n\e[36m📄 File:\e[0m\n   %s/dashboard.html\n" "$RESULTS_DIR"

        PIDFILE="$RESULTS_DIR/.dash.pid"
        if [[ -f "$PIDFILE" ]]; then
            kill "$(cat "$PIDFILE")" 2>/dev/null || true
        fi
        DASH_PORT=3333
        "$VENV_PYTHON" -m http.server $DASH_PORT --directory "$RESULTS_DIR" &>/dev/null &
        echo $! > "$PIDFILE"
        sleep 0.3
        DASH_URL="http://localhost:${DASH_PORT}/dashboard.html"
        printf "\e[36m🌐 Server:\e[0m\n   %s\n" "$DASH_URL"

        if command -v open &>/dev/null; then
            open "$DASH_URL"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "$DASH_URL"
        fi

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
        printf "  ./run.sh dash         Open the dev dashboard (no tests)\n"
        printf "  ./run.sh check        Run ALL checks (pytest + tsc) with dashboard\n"
        printf "  ./run.sh frontend     Start Sakura dev server (port 5173)\n"
        printf "  ./run.sh both         Start backend + Sakura concurrently\n"
        exit 1
        ;;
esac
