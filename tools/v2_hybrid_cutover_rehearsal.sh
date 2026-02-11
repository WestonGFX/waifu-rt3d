#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontends/v2"
BACKEND_LOG="${BACKEND_LOG:-/tmp/waifu_v2_cutover_rehearsal_backend.log}"
RUN_PREFLIGHT="${WAIFU_CUTOVER_RUN_PREFLIGHT:-1}"
BACKEND_START_CMD="${WAIFU_CUTOVER_BACKEND_CMD:-}"
BACKEND_STARTUP_TIMEOUT_SEC="${WAIFU_CUTOVER_BACKEND_STARTUP_TIMEOUT_SEC:-90}"
SERVER_PID=""

usage() {
  cat <<'EOF'
Usage:
  ./tools/v2_hybrid_cutover_rehearsal.sh

Environment:
  WAIFU_CUTOVER_RUN_PREFLIGHT=1|0             Run full gate evidence first (default: 1)
  WAIFU_CUTOVER_BACKEND_CMD="<cmd>"           Backend start command override
  WAIFU_CUTOVER_BACKEND_STARTUP_TIMEOUT_SEC=90
  BACKEND_LOG=/tmp/waifu_v2_cutover_rehearsal_backend.log
EOF
}

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

python_runtime_ready() {
  local py_bin="$1"
  "$py_bin" - <<'PY' >/dev/null 2>&1
import importlib
for module in ("psutil", "fastapi", "uvicorn"):
    importlib.import_module(module)
PY
}

resolve_backend_start_cmd() {
  if [[ -n "$BACKEND_START_CMD" ]]; then
    echo "$BACKEND_START_CMD"
    return 0
  fi
  if command -v python >/dev/null 2>&1 && python_runtime_ready python; then
    echo "python backend/server.py"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1 && python_runtime_ready python3; then
    echo "python3 backend/server.py"
    return 0
  fi
  echo "python backend/server.py"
  return 0
}

wait_for_url() {
  local url="$1"
  for ((i=1; i<=BACKEND_STARTUP_TIMEOUT_SEC; i++)); do
    if curl --max-time 3 -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

assert_contains() {
  local payload="$1"
  local needle="$2"
  local label="$3"
  if [[ "$payload" != *"$needle"* ]]; then
    echo "[v2-cutover-rehearsal] assertion failed: $label does not contain '$needle'"
    return 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$RUN_PREFLIGHT" == "1" ]]; then
  echo "[v2-cutover-rehearsal] running gate evidence before cutover rehearsal"
  "$ROOT_DIR/tools/v2_hybrid_collect_gate_evidence.sh"
fi

if [[ ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
  echo "[v2-cutover-rehearsal] v2 dist missing, building frontend"
  (
    cd "$FRONTEND_DIR"
    npm run build
  )
fi

RESOLVED_BACKEND_CMD="$(resolve_backend_start_cmd)"
echo "[v2-cutover-rehearsal] starting backend in cutover mode with command: $RESOLVED_BACKEND_CMD"
(
  cd "$ROOT_DIR"
  WAIFU_DEFAULT_FRONTEND=v2 WAIFU_DISABLE_VECTOR_STORE=1 bash -lc "$RESOLVED_BACKEND_CMD" >"$BACKEND_LOG" 2>&1 &
  echo $! > /tmp/.waifu_v2_cutover_rehearsal.pid
)
SERVER_PID="$(cat /tmp/.waifu_v2_cutover_rehearsal.pid)"
rm -f /tmp/.waifu_v2_cutover_rehearsal.pid

if ! wait_for_url "http://127.0.0.1:8080/v2/"; then
  echo "[v2-cutover-rehearsal] backend did not become ready; log follows"
  cat "$BACKEND_LOG" || true
  exit 1
fi

ROOT_HTML="$(curl --max-time 10 -fsS "http://127.0.0.1:8080/")"
LEGACY_HTML="$(curl --max-time 10 -fsS "http://127.0.0.1:8080/legacy")"
TELEMETRY_JSON="$(curl --max-time 10 -fsS "http://127.0.0.1:8080/api/v2/telemetry/summary")"

assert_contains "$ROOT_HTML" "id=\"root\"" "root cutover route"
assert_contains "$ROOT_HTML" "/v2/assets/" "root cutover route"
assert_contains "$LEGACY_HTML" "WAIFU LINK // V4.0" "legacy rollback route"
assert_contains "$TELEMETRY_JSON" "\"api\"" "telemetry endpoint"

echo "[v2-cutover-rehearsal] running live e2e against cutover root route"
(
  cd "$FRONTEND_DIR"
  E2E_LIVE_BACKEND=1 E2E_LIVE_ENTRY_PATH=/ npm run e2e:live
)

echo "[v2-cutover-rehearsal] PASS"
echo "[v2-cutover-rehearsal] validated:"
echo "  1. / serves v2 when WAIFU_DEFAULT_FRONTEND=v2"
echo "  2. /legacy serves Neon for rollback"
echo "  3. live e2e passes through cutover entry route"
