#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.waifu.v2-hybrid-telemetry"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_PATH_DEFAULT="/tmp/v2_hybrid_telemetry_launchd.log"

usage() {
  cat <<'EOF'
Usage:
  ./tools/v2_hybrid_launchd.sh install [--hour 18] [--minute 0] [--log /tmp/file.log]
  ./tools/v2_hybrid_launchd.sh uninstall
  ./tools/v2_hybrid_launchd.sh status
  ./tools/v2_hybrid_launchd.sh run-now

Notes:
  - install writes and loads: ~/Library/LaunchAgents/com.waifu.v2-hybrid-telemetry.plist
  - schedule defaults to daily at 18:00 local time
EOF
}

ensure_launchagents_dir() {
  mkdir -p "$HOME/Library/LaunchAgents"
}

write_plist() {
  local hour="$1"
  local minute="$2"
  local log_path="$3"

  ensure_launchagents_dir

  cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd '${ROOT_DIR}' && ./tools/v2_hybrid_capture_telemetry.sh >> '${log_path}' 2>&1</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${log_path}</string>
  <key>StandardErrorPath</key>
  <string>${log_path}</string>
</dict>
</plist>
EOF
}

launchd_unload() {
  if [[ -f "$PLIST_PATH" ]]; then
    launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  fi
}

launchd_load() {
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  launchctl enable "gui/$(id -u)/${LABEL}" || true
}

cmd_install() {
  local hour=18
  local minute=0
  local log_path="$LOG_PATH_DEFAULT"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hour)
        hour="$2"
        shift 2
        ;;
      --minute)
        minute="$2"
        shift 2
        ;;
      --log)
        log_path="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 2
        ;;
    esac
  done

  if ! [[ "$hour" =~ ^[0-9]+$ ]] || ! [[ "$minute" =~ ^[0-9]+$ ]]; then
    echo "hour and minute must be integers"
    exit 2
  fi
  if (( hour < 0 || hour > 23 )); then
    echo "hour must be between 0 and 23"
    exit 2
  fi
  if (( minute < 0 || minute > 59 )); then
    echo "minute must be between 0 and 59"
    exit 2
  fi

  write_plist "$hour" "$minute" "$log_path"
  launchd_unload
  launchd_load

  echo "Installed launchd job: ${LABEL}"
  echo "Plist: ${PLIST_PATH}"
  echo "Schedule: daily at $(printf "%02d:%02d" "$hour" "$minute") (local time)"
  echo "Log file: ${log_path}"
}

cmd_uninstall() {
  launchd_unload
  if [[ -f "$PLIST_PATH" ]]; then
    rm -f "$PLIST_PATH"
  fi
  echo "Uninstalled launchd job: ${LABEL}"
}

cmd_status() {
  if [[ -f "$PLIST_PATH" ]]; then
    echo "Plist present: ${PLIST_PATH}"
  else
    echo "Plist missing: ${PLIST_PATH}"
  fi

  launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 && {
    echo "launchd status: loaded"
    launchctl print "gui/$(id -u)/${LABEL}" | sed -n '1,40p'
    return 0
  }

  echo "launchd status: not loaded"
}

cmd_run_now() {
  if [[ ! -f "$PLIST_PATH" ]]; then
    echo "Plist not found. Install first:"
    echo "  ./tools/v2_hybrid_launchd.sh install"
    exit 1
  fi
  launchctl kickstart -k "gui/$(id -u)/${LABEL}"
  echo "Triggered run-now for ${LABEL}"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    install)
      shift
      cmd_install "$@"
      ;;
    uninstall)
      cmd_uninstall
      ;;
    status)
      cmd_status
      ;;
    run-now)
      cmd_run_now
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
