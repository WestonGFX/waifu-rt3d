#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${WAIFU_TELEMETRY_OUTPUT_DIR:-$ROOT_DIR/docs/telemetry}"
AUTOSTART_BACKEND="${WAIFU_TELEMETRY_AUTOSTART_BACKEND:-1}"

echo "[v2-hybrid-evidence] running preflight gates"
"$ROOT_DIR/tools/v2_hybrid_preflight.sh"

echo "[v2-hybrid-evidence] capturing telemetry snapshot"
WAIFU_TELEMETRY_OUTPUT_DIR="$OUTPUT_DIR" \
WAIFU_TELEMETRY_AUTOSTART_BACKEND="$AUTOSTART_BACKEND" \
"$ROOT_DIR/tools/v2_hybrid_capture_telemetry.sh"

echo "[v2-hybrid-evidence] done"
echo "[v2-hybrid-evidence] artifacts:"
echo "  - $OUTPUT_DIR/v2_hybrid_daily_snapshots.csv"
echo "  - $OUTPUT_DIR/V2_HYBRID_7DAY_REPORT.md"
