#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontends/v2"
BACKEND_LOG="${BACKEND_LOG:-/tmp/waifu_v2_hybrid_preflight_backend.log}"
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
curl --max-time 10 -fsS "http://127.0.0.1:8080/api/v2/telemetry/summary"
echo

echo "[hybrid-preflight] completed successfully"
