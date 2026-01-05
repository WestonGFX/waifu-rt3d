#!/bin/bash
set -e

# Colors for "Soulful" Output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}--- WAIFU-RT3D SMART INSTALLER v1.1 ---${NC}"
echo -e "${CYAN}Usage: ./install.sh [--interactive]${NC}"

INTERACTIVE=false
if [[ "$1" == "--interactive" ]]; then
    INTERACTIVE=true
fi

# 1. Smart Homebrew Detection & Auto-Install (Mac-Specific)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}[!] Homebrew not found.${NC}"
        if [ "$INTERACTIVE" = true ]; then
            read -p "Install Homebrew now? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${CYAN}[!] Skipping Homebrew. Manual dependency check required.${NC}"
                SKIP_BREW=true
            fi
        else
            echo -e "${GREEN}[+] Auto-installing Homebrew (Fast Mode)...${NC}"
            # Automated install might require sudo password, so we warn
            echo -e "${RED}[!] Sudo password may be required.${NC}"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi

        if [[ -z "$SKIP_BREW" ]]; then
             if [[ -f /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
             if [[ -f /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)"; fi
        fi
    else
        echo -e "${GREEN}[+] Homebrew detected.${NC}"
    fi

    # 2. System Dependencies via Brew
    if command -v brew &> /dev/null; then
        echo -e "${CYAN}[*] Checking system dependencies...${NC}"
        # Quiet install unless interactive
        brew install python@3.10 ffmpeg git || echo -e "${RED}[!] Brew install warning. Continuing...${NC}"
    fi
fi

# 3. Python Environment
echo -e "${CYAN}[*] Setting up Python environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}[+] Created venv.${NC}"
fi

source venv/bin/activate

# 4. Install Requirements
if [ -f "requirements.txt" ]; then
    echo -e "${CYAN}[*] Installing Python packages...${NC}"
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo -e "${RED}[!] requirements.txt not found!${NC}"
fi

echo -e "${GREEN}--- INSTALLATION COMPLETE ---${NC}"
echo -e "Run the app with: ${CYAN}python3 -m backend.server${NC}"
