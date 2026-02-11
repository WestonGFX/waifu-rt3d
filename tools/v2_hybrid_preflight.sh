#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontends/v2"
BACKEND_LOG="${BACKEND_LOG:-/tmp/waifu_v2_hybrid_preflight_backend.log}"
MAX_API_ERROR_RATE="${WAIFU_PREFLIGHT_MAX_API_ERROR_RATE:-0.05}"
MAX_MEMORY_FALLBACK_RATE="${WAIFU_PREFLIGHT_MAX_MEMORY_FALLBACK_RATE:-1.0}"
MAX_CHAT_FAILURE_RATE="${WAIFU_PREFLIGHT_MAX_CHAT_FAILURE_RATE:-1.0}"
MIN_API_REQUESTS="${WAIFU_PREFLIGHT_MIN_API_REQUESTS:-1}"
MIN_MEMORY_GRAPH_REQUESTS="${WAIFU_PREFLIGHT_MIN_MEMORY_GRAPH_REQUESTS:-1}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[hybrid-preflight] frontend lint/unit/build/mock-e2e"
(
  cd "$FRONTEND_DIR"
  npm run lint
  npm test
  npm run build
  npm run e2e
)

echo "[hybrid-preflight] backend contract + routing + telemetry tests"
(
  cd "$ROOT_DIR"
  pytest -q backend/tests
)

echo "[hybrid-preflight] starting backend for live smoke"
cd "$ROOT_DIR"
WAIFU_DISABLE_VECTOR_STORE=1 python backend/server.py >"$BACKEND_LOG" 2>&1 &
SERVER_PID=$!
cd - >/dev/null

for _ in {1..60}; do
  if curl --max-time 3 -fsS "http://127.0.0.1:8080/v2/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl --max-time 3 -fsS "http://127.0.0.1:8080/v2/" >/dev/null 2>&1; then
  echo "[hybrid-preflight] backend did not become ready; log follows:"
  cat "$BACKEND_LOG"
  exit 1
fi

echo "[hybrid-preflight] live backend smoke e2e"
(
  cd "$FRONTEND_DIR"
  npm run e2e:live
)

echo "[hybrid-preflight] telemetry summary snapshot"
TELEMETRY_JSON=""
for attempt in {1..5}; do
  if TELEMETRY_JSON="$(curl --max-time 10 -fsS "http://127.0.0.1:8080/api/v2/telemetry/summary")"; then
    break
  fi
  echo "[hybrid-preflight] telemetry fetch attempt ${attempt} failed; retrying..."
  sleep 1
done

if [[ -z "$TELEMETRY_JSON" ]]; then
  echo "[hybrid-preflight] telemetry summary unavailable after retries; backend log tail:"
  tail -n 120 "$BACKEND_LOG" || true
  exit 1
fi

echo "$TELEMETRY_JSON"
echo "[hybrid-preflight] telemetry gate check"
TELEMETRY_JSON="$TELEMETRY_JSON" python3 - "$MAX_API_ERROR_RATE" "$MAX_MEMORY_FALLBACK_RATE" "$MAX_CHAT_FAILURE_RATE" "$MIN_API_REQUESTS" "$MIN_MEMORY_GRAPH_REQUESTS" <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["TELEMETRY_JSON"])

max_api_error = float(sys.argv[1])
max_memory_fallback = float(sys.argv[2])
max_chat_failure = float(sys.argv[3])
min_api_requests = int(sys.argv[4])
min_memory_requests = int(sys.argv[5])

api_requests = int(payload["api"]["requests_total"])
api_error_rate = float(payload["api"]["error_rate"])
memory_requests = int(payload["memory"]["graph_requests_total"])
memory_fallback_rate = float(payload["memory"]["fallback_rate"])
chat_failure_rate = float(payload["chat"]["failure_rate"])

def fail(message: str) -> None:
    print(f"[hybrid-preflight] telemetry gate failed: {message}")
    raise SystemExit(1)

if api_requests < min_api_requests:
    fail(f"api.requests_total={api_requests} < min {min_api_requests}")

if memory_requests < min_memory_requests:
    fail(f"memory.graph_requests_total={memory_requests} < min {min_memory_requests}")

if api_error_rate > max_api_error:
    fail(f"api.error_rate={api_error_rate:.4f} > max {max_api_error:.4f}")

if memory_fallback_rate > max_memory_fallback:
    fail(f"memory.fallback_rate={memory_fallback_rate:.4f} > max {max_memory_fallback:.4f}")

if chat_failure_rate > max_chat_failure:
    fail(f"chat.failure_rate={chat_failure_rate:.4f} > max {max_chat_failure:.4f}")

print(
    "[hybrid-preflight] telemetry gates passed "
    f"(api_error_rate={api_error_rate:.4f}, "
    f"memory_fallback_rate={memory_fallback_rate:.4f}, "
    f"chat_failure_rate={chat_failure_rate:.4f})"
)
PY
echo

echo "[hybrid-preflight] completed successfully"
