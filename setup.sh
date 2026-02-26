#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Waifu-RT3D — Interactive Setup & Installer
#
# Usage:
#   ./setup.sh            Interactive guided setup (fresh or existing)
#   ./setup.sh --repair   Repair mode: re-run migrations, verify config
#   ./setup.sh --minimal  Core deps only, skip TTS extras & frontend build
#
# Supports macOS and Linux. Requires Python 3.10+ and pip.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Color helpers ─────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info()    { printf "${CYAN}[INFO]${RESET}  %s\n" "$1"; }
success() { printf "${GREEN}[  OK]${RESET}  %s\n" "$1"; }
warn()    { printf "${YELLOW}[WARN]${RESET}  %s\n" "$1"; }
error()   { printf "${RED}[FAIL]${RESET}  %s\n" "$1"; }

# ── Globals ───────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
BACKEND_DIR="${SCRIPT_DIR}/backend"
CONFIG_FILE="${BACKEND_DIR}/config/app.json"
DB_FILE="${BACKEND_DIR}/storage/app.db"
SAKURA_DIR="${SCRIPT_DIR}/frontends/sakura"
REQUIREMENTS="${SCRIPT_DIR}/requirements.txt"

MODE="interactive"       # interactive | repair | minimal
IS_FRESH=false
INSTALLED_TTS=false
BUILT_SAKURA=false
PYTHON_CMD=""

# ── Parse CLI flags ──────────────────────────────────────────────────────────

for arg in "$@"; do
    case "$arg" in
        --repair)  MODE="repair"  ;;
        --minimal) MODE="minimal" ;;
        --help|-h)
            printf "${BOLD}Waifu-RT3D Setup${RESET}\n\n"
            printf "Usage:\n"
            printf "  ./setup.sh            Interactive guided setup\n"
            printf "  ./setup.sh --repair   Repair existing installation\n"
            printf "  ./setup.sh --minimal  Core deps only (no TTS/frontend)\n"
            printf "  ./setup.sh --help     Show this help\n"
            exit 0
            ;;
        *)
            error "Unknown flag: $arg (try --help)"
            exit 1
            ;;
    esac
done

# ── Banner ────────────────────────────────────────────────────────────────────

print_banner() {
    printf "\n"
    printf "${BOLD}${CYAN}"
    printf "  ╔══════════════════════════════════════════════╗\n"
    printf "  ║          Waifu-RT3D  Setup  Wizard           ║\n"
    printf "  ║                                              ║\n"
    printf "  ║   3D AI Companion Platform — Installer       ║\n"
    printf "  ╚══════════════════════════════════════════════╝\n"
    printf "${RESET}\n"
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# Prompt user with a yes/no question. Default is $2 (y or n).
ask_yn() {
    local prompt="$1"
    local default="${2:-y}"
    local hint="[Y/n]"
    [[ "$default" == "n" ]] && hint="[y/N]"

    while true; do
        printf "${BOLD}  ? ${RESET}%s %s " "$prompt" "$hint"
        read -r answer
        answer="${answer:-$default}"
        case "${answer,,}" in
            y|yes) return 0 ;;
            n|no)  return 1 ;;
            *)     warn "Please answer y or n." ;;
        esac
    done
}

# Compare two version strings (e.g. "3.10" <= "3.12").
# Returns 0 if $1 >= $2.
version_gte() {
    printf '%s\n%s' "$2" "$1" | sort -V | head -n1 | grep -qF "$2"
}

# ── Step 1: Detect install state ─────────────────────────────────────────────

detect_state() {
    info "Detecting installation state..."

    if [[ ! -d "$VENV_DIR" && ! -f "$DB_FILE" ]]; then
        IS_FRESH=true
        success "Fresh install detected"
    else
        IS_FRESH=false
        if [[ "$MODE" == "repair" ]]; then
            success "Existing install detected — repair mode"
        else
            success "Existing install detected — will update in place"
        fi
    fi

    if [[ "$MODE" == "repair" ]]; then
        printf "\n${YELLOW}  Repair mode:${RESET} will re-install deps, re-run migrations, verify config.\n\n"
    elif [[ "$MODE" == "minimal" ]]; then
        printf "\n${YELLOW}  Minimal mode:${RESET} core deps only, skipping TTS extras & frontend build.\n\n"
    fi
}

# ── Step 2: Check Python version ─────────────────────────────────────────────

check_python() {
    info "Checking Python installation..."

    # Try common Python 3 commands in priority order
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local ver
            ver="$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
            local major_minor
            major_minor="$(echo "$ver" | cut -d. -f1,2)"

            if version_gte "$major_minor" "3.10"; then
                PYTHON_CMD="$cmd"
                success "Found $cmd $ver (>= 3.10 required)"
                return 0
            else
                warn "$cmd is version $ver (need 3.10+), trying next..."
            fi
        fi
    done

    error "Python 3.10+ is required but not found."
    printf "  Install Python from https://www.python.org/downloads/\n"
    printf "  macOS: brew install python@3.12\n"
    printf "  Linux: sudo apt install python3.12 python3.12-venv\n"
    exit 1
}

# ── Step 3: Create / reuse virtual environment ───────────────────────────────

setup_venv() {
    if [[ -d "$VENV_DIR" ]]; then
        if [[ "$MODE" == "repair" ]]; then
            info "Reusing existing virtual environment at .venv/"
        else
            success "Virtual environment already exists at .venv/"
        fi
    else
        info "Creating virtual environment..."
        "$PYTHON_CMD" -m venv "$VENV_DIR"
        success "Created virtual environment at .venv/"
    fi

    # Activate the venv for the rest of this script
    # shellcheck disable=SC1091
    source "${VENV_DIR}/bin/activate"

    # Upgrade pip quietly
    info "Upgrading pip..."
    pip install --upgrade pip --quiet 2>/dev/null
    success "pip is up to date"
}

# ── Step 4: Install core dependencies ────────────────────────────────────────

install_core_deps() {
    if [[ ! -f "$REQUIREMENTS" ]]; then
        error "requirements.txt not found at $REQUIREMENTS"
        exit 1
    fi

    info "Installing core Python dependencies from requirements.txt..."
    if pip install -r "$REQUIREMENTS" --quiet 2>&1 | tail -n5; then
        success "Core dependencies installed"
    else
        error "Failed to install core dependencies. Check output above."
        exit 1
    fi
}

# ── Step 5: Optional TTS extras ─────────────────────────────────────────────

install_tts_extras() {
    if [[ "$MODE" == "minimal" ]]; then
        info "Skipping TTS extras (minimal mode)"
        return 0
    fi

    printf "\n"
    printf "${BOLD}  ── TTS (Text-to-Speech) Extras ──${RESET}\n\n"
    printf "  ${DIM}edge-tts   — Microsoft Edge voices (free, lightweight, needs internet)${RESET}\n"
    printf "  ${DIM}kokoro     — Local neural TTS (needs ~2GB disk, optional torch/GPU)${RESET}\n\n"

    if [[ "$MODE" == "repair" ]] || [[ "$IS_FRESH" == true ]]; then
        # edge-tts is already in requirements.txt, but kokoro is the optional extra
        if ask_yn "Install Kokoro TTS (local neural voices)?" "n"; then
            info "Installing kokoro..."
            if pip install kokoro --quiet 2>&1 | tail -n3; then
                success "Kokoro TTS installed"
                INSTALLED_TTS=true
            else
                warn "Kokoro installation failed — you can try manually later: pip install kokoro"
            fi
        else
            info "Skipping Kokoro TTS (edge-tts is already included in core deps)"
        fi
    fi
}

# ── Step 6: Optional Sakura frontend build ───────────────────────────────────

build_sakura_frontend() {
    if [[ "$MODE" == "minimal" ]]; then
        info "Skipping Sakura frontend build (minimal mode)"
        return 0
    fi

    if [[ ! -d "$SAKURA_DIR" ]]; then
        warn "Sakura frontend directory not found — skipping"
        return 0
    fi

    printf "\n"
    printf "${BOLD}  ── Sakura Frontend (React) ──${RESET}\n\n"
    printf "  ${DIM}The Neon frontend (vanilla JS) works without a build step.${RESET}\n"
    printf "  ${DIM}Sakura is an optional React frontend that requires Node.js 18+.${RESET}\n\n"

    if ! ask_yn "Build the Sakura frontend?" "n"; then
        info "Skipping Sakura frontend build"
        return 0
    fi

    # Check Node.js
    if ! command -v node &>/dev/null; then
        warn "Node.js not found — cannot build Sakura frontend."
        printf "  Install from https://nodejs.org/ or: brew install node\n"
        return 0
    fi

    local node_ver
    node_ver="$(node --version | grep -oE '[0-9]+' | head -n1)"
    if [[ "$node_ver" -lt 18 ]]; then
        warn "Node.js v${node_ver} found but v18+ is required for Sakura."
        return 0
    fi
    success "Node.js v$(node --version | tr -d 'v') found"

    info "Installing Sakura npm dependencies..."
    (cd "$SAKURA_DIR" && npm install --silent 2>&1 | tail -n3)

    info "Building Sakura frontend..."
    if (cd "$SAKURA_DIR" && npm run build 2>&1 | tail -n5); then
        success "Sakura frontend built successfully"
        BUILT_SAKURA=true
    else
        warn "Sakura build failed — the Neon frontend still works fine."
    fi
}

# ── Step 7: Ensure storage directories ───────────────────────────────────────

ensure_directories() {
    info "Ensuring storage directories exist..."

    local dirs=(
        "${BACKEND_DIR}/storage"
        "${BACKEND_DIR}/storage/avatars"
        "${BACKEND_DIR}/storage/audio"
        "${BACKEND_DIR}/storage/images"
        "${BACKEND_DIR}/config"
    )

    for d in "${dirs[@]}"; do
        mkdir -p "$d"
    done

    success "Storage directories verified"
}

# ── Step 8: Run database preflight / migrations ─────────────────────────────

run_preflight() {
    info "Running database preflight checks and migrations..."

    # Run from the project root so imports resolve correctly
    if (cd "$SCRIPT_DIR" && "${VENV_DIR}/bin/python" -c "
from backend.preflight import ensure_db
ensure_db()
" 2>&1); then
        success "Database is ready (migrations applied)"
    else
        error "Database preflight failed — check the error above."
        printf "  You can try manually: cd %s && python -c 'from backend.preflight import ensure_db; ensure_db()'\n" "$SCRIPT_DIR"
        # Don't exit — continue with the rest of setup
        warn "Continuing setup despite database error..."
    fi
}

# ── Step 9: Verify configuration ─────────────────────────────────────────────

verify_config() {
    info "Verifying configuration..."

    if [[ -f "$CONFIG_FILE" ]]; then
        # Validate JSON syntax
        if "${VENV_DIR}/bin/python" -c "import json; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
            success "Config file exists and is valid JSON"
        else
            warn "Config file exists but has invalid JSON — preflight will recreate defaults"
            local backup="${CONFIG_FILE}.bak.$(date +%s)"
            cp "$CONFIG_FILE" "$backup"
            warn "Backed up broken config to $(basename "$backup")"
            rm "$CONFIG_FILE"
            # Re-run preflight to regenerate config
            (cd "$SCRIPT_DIR" && "${VENV_DIR}/bin/python" -c "
from backend.preflight import ensure_config
ensure_config()
") 2>/dev/null
            success "Default config regenerated"
        fi
    else
        info "No config file found — preflight will create defaults"
        (cd "$SCRIPT_DIR" && "${VENV_DIR}/bin/python" -c "
from backend.preflight import ensure_config
ensure_config()
") 2>/dev/null
        success "Default config created at backend/config/app.json"
    fi
}

# ── Step 10: Print summary ───────────────────────────────────────────────────

print_summary() {
    local py_ver
    py_ver="$("${VENV_DIR}/bin/python" --version 2>&1)"

    printf "\n"
    printf "${BOLD}${GREEN}"
    printf "  ╔══════════════════════════════════════════════╗\n"
    printf "  ║            Setup Complete!                   ║\n"
    printf "  ╚══════════════════════════════════════════════╝\n"
    printf "${RESET}\n"

    printf "  ${BOLD}Summary:${RESET}\n"
    printf "  ─────────────────────────────────────────────\n"
    printf "  Python:        %s\n" "$py_ver"
    printf "  Virtual env:   .venv/\n"
    printf "  Database:      %s\n" "$(if [[ -f "$DB_FILE" ]]; then echo "${GREEN}ready${RESET}"; else echo "${YELLOW}not yet created${RESET}"; fi)"
    printf "  Config:        %s\n" "$(if [[ -f "$CONFIG_FILE" ]]; then echo "${GREEN}verified${RESET}"; else echo "${YELLOW}missing${RESET}"; fi)"
    if [[ "$INSTALLED_TTS" == true ]]; then
        printf "  Kokoro TTS:    ${GREEN}installed${RESET}\n"
    fi
    if [[ "$BUILT_SAKURA" == true ]]; then
        printf "  Sakura build:  ${GREEN}built${RESET}\n"
    fi
    printf "\n"

    printf "  ${BOLD}To start the server:${RESET}\n"
    printf "  ─────────────────────────────────────────────\n"
    printf "  ${CYAN}source .venv/bin/activate${RESET}\n"
    printf "  ${CYAN}python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080${RESET}\n"
    printf "\n"
    printf "  Then open: ${BOLD}http://localhost:8080${RESET}\n"
    printf "\n"

    if [[ "$IS_FRESH" == true ]]; then
        printf "  ${BOLD}${YELLOW}First-time tips:${RESET}\n"
        printf "  - Make sure LM Studio is running with a model loaded\n"
        printf "  - Default LLM endpoint: http://localhost:1234/v1\n"
        printf "  - The Neon frontend loads automatically (no build needed)\n"
        printf "\n"
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    print_banner
    detect_state
    check_python
    setup_venv
    install_core_deps
    install_tts_extras
    build_sakura_frontend
    ensure_directories
    run_preflight
    verify_config
    print_summary
}

main
