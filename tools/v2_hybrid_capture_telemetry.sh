#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TELEMETRY_DIR="$ROOT_DIR/docs/telemetry"
CSV_FILE="$TELEMETRY_DIR/v2_hybrid_daily_snapshots.csv"
REPORT_FILE="$TELEMETRY_DIR/V2_HYBRID_7DAY_REPORT.md"

TELEMETRY_URL="${WAIFU_TELEMETRY_URL:-http://127.0.0.1:8080/api/v2/telemetry/summary}"
MAX_API_ERROR_RATE="${WAIFU_CUTOVER_MAX_API_ERROR_RATE:-0.03}"
MAX_MEMORY_FALLBACK_RATE="${WAIFU_CUTOVER_MAX_MEMORY_FALLBACK_RATE:-0.35}"
MAX_CHAT_FAILURE_RATE="${WAIFU_CUTOVER_MAX_CHAT_FAILURE_RATE:-0.10}"
MIN_API_REQUESTS="${WAIFU_CUTOVER_MIN_API_REQUESTS:-200}"
MIN_MEMORY_GRAPH_REQUESTS="${WAIFU_CUTOVER_MIN_MEMORY_GRAPH_REQUESTS:-50}"
FAIL_ON_BREACH="${WAIFU_TELEMETRY_FAIL_ON_BREACH:-0}"

mkdir -p "$TELEMETRY_DIR"

if [[ ! -f "$CSV_FILE" ]]; then
  cat > "$CSV_FILE" <<'CSV'
captured_at_utc,window_started_at,api_requests_total,api_error_rate,memory_graph_requests_total,memory_fallback_rate,chat_requests_total,chat_failure_rate,pass,reason,telemetry_url
CSV
fi

TELEMETRY_JSON=""
for attempt in {1..5}; do
  if TELEMETRY_JSON="$(curl --max-time 10 -fsS "$TELEMETRY_URL")"; then
    break
  fi
  echo "[v2-hybrid-telemetry] telemetry fetch attempt ${attempt} failed; retrying..."
  sleep 2
done

if [[ -z "$TELEMETRY_JSON" ]]; then
  echo "[v2-hybrid-telemetry] failed to fetch telemetry summary from $TELEMETRY_URL"
  exit 1
fi

CAPTURED_AT_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

TELEMETRY_JSON="$TELEMETRY_JSON" \
CAPTURED_AT_UTC="$CAPTURED_AT_UTC" \
CSV_FILE="$CSV_FILE" \
REPORT_FILE="$REPORT_FILE" \
TELEMETRY_URL="$TELEMETRY_URL" \
MAX_API_ERROR_RATE="$MAX_API_ERROR_RATE" \
MAX_MEMORY_FALLBACK_RATE="$MAX_MEMORY_FALLBACK_RATE" \
MAX_CHAT_FAILURE_RATE="$MAX_CHAT_FAILURE_RATE" \
MIN_API_REQUESTS="$MIN_API_REQUESTS" \
MIN_MEMORY_GRAPH_REQUESTS="$MIN_MEMORY_GRAPH_REQUESTS" \
FAIL_ON_BREACH="$FAIL_ON_BREACH" \
python3 - <<'PY'
import csv
import json
import os
from pathlib import Path


def as_int(value) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def as_float(value) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


payload = json.loads(os.environ["TELEMETRY_JSON"])
captured_at = os.environ["CAPTURED_AT_UTC"]
csv_file = Path(os.environ["CSV_FILE"])
report_file = Path(os.environ["REPORT_FILE"])
telemetry_url = os.environ["TELEMETRY_URL"]

max_api_error = as_float(os.environ["MAX_API_ERROR_RATE"])
max_memory_fallback = as_float(os.environ["MAX_MEMORY_FALLBACK_RATE"])
max_chat_failure = as_float(os.environ["MAX_CHAT_FAILURE_RATE"])
min_api_requests = as_int(os.environ["MIN_API_REQUESTS"])
min_memory_requests = as_int(os.environ["MIN_MEMORY_GRAPH_REQUESTS"])
fail_on_breach = os.environ["FAIL_ON_BREACH"] == "1"

window_started_at = str(payload.get("window_started_at", ""))

api = payload.get("api", {})
chat = payload.get("chat", {})
memory = payload.get("memory", {})

api_requests_total = as_int(api.get("requests_total"))
api_error_rate = as_float(api.get("error_rate"))
chat_requests_total = as_int(chat.get("requests_total"))
chat_failure_rate = as_float(chat.get("failure_rate"))
memory_graph_requests_total = as_int(memory.get("graph_requests_total"))
memory_fallback_rate = as_float(memory.get("fallback_rate"))

failures: list[str] = []
if api_requests_total < min_api_requests:
    failures.append(
        f"api.requests_total={api_requests_total} < min {min_api_requests}"
    )
if memory_graph_requests_total < min_memory_requests:
    failures.append(
        "memory.graph_requests_total="
        f"{memory_graph_requests_total} < min {min_memory_requests}"
    )
if api_error_rate > max_api_error:
    failures.append(f"api.error_rate={api_error_rate:.4f} > max {max_api_error:.4f}")
if memory_fallback_rate > max_memory_fallback:
    failures.append(
        "memory.fallback_rate="
        f"{memory_fallback_rate:.4f} > max {max_memory_fallback:.4f}"
    )
if chat_failure_rate > max_chat_failure:
    failures.append(
        f"chat.failure_rate={chat_failure_rate:.4f} > max {max_chat_failure:.4f}"
    )

passed = len(failures) == 0
reason = "ok" if passed else " ; ".join(failures)

with csv_file.open("a", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(
        [
            captured_at,
            window_started_at,
            api_requests_total,
            f"{api_error_rate:.4f}",
            memory_graph_requests_total,
            f"{memory_fallback_rate:.4f}",
            chat_requests_total,
            f"{chat_failure_rate:.4f}",
            "true" if passed else "false",
            reason,
            telemetry_url,
        ]
    )

rows: list[dict[str, str]] = []
with csv_file.open("r", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

last7 = rows[-7:]
last7_pass_count = sum(1 for row in last7 if row["pass"] == "true")
last7_total = len(last7)
cutover_ready = last7_total == 7 and last7_pass_count == 7

consecutive_breaches = 0
for row in reversed(last7):
    if row["pass"] == "true":
        break
    consecutive_breaches += 1

lines = [
    "# V2 Hybrid 7-Day Telemetry Report",
    "",
    f"Generated at: `{captured_at}`",
    "",
    "## Thresholds",
    f"1. `api.error_rate <= {max_api_error:.4f}`",
    f"2. `memory.fallback_rate <= {max_memory_fallback:.4f}`",
    f"3. `chat.failure_rate <= {max_chat_failure:.4f}`",
    f"4. `api.requests_total >= {min_api_requests}`",
    f"5. `memory.graph_requests_total >= {min_memory_requests}`",
    "",
    "## Latest Snapshot",
    f"1. pass: `{str(passed).lower()}`",
    f"2. reason: `{reason}`",
    f"3. api.error_rate: `{api_error_rate:.4f}`",
    f"4. memory.fallback_rate: `{memory_fallback_rate:.4f}`",
    f"5. chat.failure_rate: `{chat_failure_rate:.4f}`",
    "",
    "## Rolling 7-Day Decision",
    f"1. snapshots_in_window: `{last7_total}`",
    f"2. pass_count: `{last7_pass_count}`",
    f"3. consecutive_breaches: `{consecutive_breaches}`",
    f"4. cutover_ready_by_telemetry: `{str(cutover_ready).lower()}`",
    "",
    "## Last 7 Snapshots",
    "| captured_at_utc | pass | api.error_rate | memory.fallback_rate | chat.failure_rate | api.requests_total | memory.graph_requests_total | reason |",
    "|---|---|---:|---:|---:|---:|---:|---|",
]

for row in last7:
    lines.append(
        "| "
        + row["captured_at_utc"]
        + " | "
        + row["pass"]
        + " | "
        + row["api_error_rate"]
        + " | "
        + row["memory_fallback_rate"]
        + " | "
        + row["chat_failure_rate"]
        + " | "
        + row["api_requests_total"]
        + " | "
        + row["memory_graph_requests_total"]
        + " | "
        + row["reason"].replace("\n", " ")
        + " |"
    )

lines.extend(
    [
        "",
        "## Notes",
        "1. This report is telemetry-only evidence for Hybrid cutover.",
        "2. P0/P1 defect window must still be reviewed separately.",
        f"3. Source endpoint: `{telemetry_url}`",
    ]
)

report_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"[v2-hybrid-telemetry] wrote snapshot to {csv_file}")
print(f"[v2-hybrid-telemetry] wrote report to {report_file}")
print(
    "[v2-hybrid-telemetry] latest pass="
    f"{str(passed).lower()} "
    f"(api_error_rate={api_error_rate:.4f}, "
    f"memory_fallback_rate={memory_fallback_rate:.4f}, "
    f"chat_failure_rate={chat_failure_rate:.4f})"
)
print(
    "[v2-hybrid-telemetry] rolling-7 pass_count="
    f"{last7_pass_count}/{last7_total} "
    f"cutover_ready_by_telemetry={str(cutover_ready).lower()}"
)

if fail_on_breach and not passed:
    raise SystemExit(2)
PY
