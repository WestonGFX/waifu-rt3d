#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAN_FILE="$ROOT_DIR/docs/V2_HYBRID_EXECUTION_PLAN.md"
TELEMETRY_REPORT_FILE="$ROOT_DIR/docs/telemetry/V2_HYBRID_7DAY_REPORT.md"
OUT_FILE="${WAIFU_READINESS_REPORT_FILE:-$ROOT_DIR/docs/V2_HYBRID_READINESS_REPORT.md}"

RUN_REHEARSAL="${WAIFU_READINESS_RUN_REHEARSAL:-1}"
RUN_REHEARSAL_PREFLIGHT="${WAIFU_READINESS_RUN_REHEARSAL_PREFLIGHT:-0}"
REHEARSAL_OK="skipped"

if [[ "$RUN_REHEARSAL" == "1" ]]; then
  echo "[v2-cutover-decision] running cutover rehearsal"
  if WAIFU_CUTOVER_RUN_PREFLIGHT="$RUN_REHEARSAL_PREFLIGHT" "$ROOT_DIR/tools/v2_hybrid_cutover_rehearsal.sh"; then
    REHEARSAL_OK="true"
  else
    REHEARSAL_OK="false"
  fi
fi

mkdir -p "$(dirname "$OUT_FILE")"

PLAN_FILE="$PLAN_FILE" \
TELEMETRY_REPORT_FILE="$TELEMETRY_REPORT_FILE" \
OUT_FILE="$OUT_FILE" \
REHEARSAL_OK="$REHEARSAL_OK" \
python3 - <<'PY'
import os
import re
from datetime import datetime, timezone
from pathlib import Path

plan_file = Path(os.environ["PLAN_FILE"])
telemetry_file = Path(os.environ["TELEMETRY_REPORT_FILE"])
out_file = Path(os.environ["OUT_FILE"])
rehearsal_ok = os.environ["REHEARSAL_OK"]

plan_text = plan_file.read_text(encoding="utf-8") if plan_file.exists() else ""
telemetry_text = telemetry_file.read_text(encoding="utf-8") if telemetry_file.exists() else ""

owner_placeholders = len(re.findall(r":\s*`<name>`", plan_text))
owners_ready = owner_placeholders == 0 and "Release owner:" in plan_text

telemetry_ready = False
telemetry_ready_match = re.search(r"cutover_ready_by_telemetry:\s*`(true|false)`", telemetry_text)
if telemetry_ready_match:
    telemetry_ready = telemetry_ready_match.group(1) == "true"

latest_reason = "unavailable"
latest_reason_match = re.search(r"reason:\s*`([^`]+)`", telemetry_text)
if latest_reason_match:
    latest_reason = latest_reason_match.group(1)

pass_count = "unknown"
pass_count_match = re.search(r"pass_count:\s*`([^`]+)`", telemetry_text)
if pass_count_match:
    pass_count = pass_count_match.group(1)

required_gates = []

required_gates.append(
    {
        "name": "Owners assigned in execution plan",
        "status": owners_ready,
        "detail": (
            "All owners are set."
            if owners_ready
            else f"Found {owner_placeholders} owner placeholder(s) still set to <name>."
        ),
    }
)

required_gates.append(
    {
        "name": "Telemetry 7-day readiness",
        "status": telemetry_ready,
        "detail": (
            "Telemetry window passed thresholds."
            if telemetry_ready
            else (
                "Telemetry cutover gate is false. "
                f"Rolling pass_count={pass_count}. Latest reason: {latest_reason}."
            )
        ),
    }
)

if rehearsal_ok != "skipped":
    required_gates.append(
        {
            "name": "Cutover route rehearsal",
            "status": rehearsal_ok == "true",
            "detail": (
                "Route switch + rollback rehearsal passed."
                if rehearsal_ok == "true"
                else "Cutover rehearsal command failed."
            ),
        }
    )

go = all(gate["status"] for gate in required_gates)

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
lines = [
    "# V2 Hybrid Cutover Readiness Report",
    "",
    f"Generated at: `{now}`",
    "",
    f"Decision: `{'GO' if go else 'NO-GO'}`",
    "",
    "## Required Gates",
]

for idx, gate in enumerate(required_gates, start=1):
    state = "PASS" if gate["status"] else "FAIL"
    lines.append(f"{idx}. {gate['name']}: `{state}`")
    lines.append(f"- {gate['detail']}")

lines.extend(
    [
        "",
        "## Inputs",
        f"1. Execution plan: `{plan_file}`",
        f"2. Telemetry report: `{telemetry_file}`",
        f"3. Rehearsal run: `{rehearsal_ok}`",
        "",
        "## Next Step",
        "1. If NO-GO, fix every FAIL gate and rerun `./tools/v2_hybrid_cutover_decision.sh`.",
        "2. If GO, execute cutover ticket and start 72-hour watch window.",
    ]
)

out_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"[v2-cutover-decision] wrote report: {out_file}")
print(f"[v2-cutover-decision] decision={'GO' if go else 'NO-GO'}")

if not go:
    raise SystemExit(2)
PY
