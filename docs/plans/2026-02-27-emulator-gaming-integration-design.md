# Emulator Gaming Integration — Design Document

> **Status:** Design complete. Build in two phases — Phase 1 (EmulatorJS, PS1, browser-native)
> can be done quickly. Phase 2 (PCSX2 + ViGEm, PS2, AI plays) requires user installation.
>
> **Scope:** PS1 + PS2 emulation inside the app, with the AI companion either playing alongside
> you (ViGEm virtual controller) or acting as a strategic coach with real game-state awareness.
> Guided in-app setup wizard walks users through installation step by step.

---

## Vision

Play classic PS1 and PS2 games inside the app with your AI companion actively involved —
not as a narrator you have to brief, but as a player who reads the game state directly,
injects controller inputs, reacts to events in real time, and remembers shared game history
in future conversations.

Two tiers of integration:

| Tier | Technology | Platform | AI Role |
|------|-----------|----------|---------|
| **1 — Quick Play** | EmulatorJS (browser WASM) | Mac + Windows | AI reads memory via JS, injects virtual controller, plays co-op or coaches |
| **2 — Full Play** | PCSX2 / DuckStation native | Windows preferred | AI reads memory via Lua, injects via ViGEm virtual Xbox controller |

---

## Architecture

```
App (React frontend)
  └─ EmulatorPanel.tsx
       ├─ Tier 1: <iframe src="/frontends/shared/emulator/emulator.html">
       │           └─ EmulatorJS (WASM PS1/PS2 core)
       │                ├─ JS memory reader → postMessage → React
       │                └─ JS controller injector ← postMessage ← React AI agent
       │
       └─ Tier 2: Native bridge (app connects to locally running PCSX2/DuckStation)
                   ├─ PCSX2 Lua script → WebSocket → FastAPI backend
                   │    └─ game state stream (health, position, weapon, enemy state)
                   └─ ViGEm Python client → writes virtual Xbox controller state
                        └─ PCSX2 sees it as Player 2 gamepad input

FastAPI backend (already running on port 8080):
  ├─ GET  /api/emulator/games          → supported game library
  ├─ POST /api/emulator/start          → launch emulator with ROM path + game type
  ├─ WS   /ws/emulator/state           → real-time game state stream from Lua script
  ├─ POST /api/emulator/ai-action      → trigger AI decision cycle → ViGEm output
  └─ GET  /api/emulator/setup-status   → detect installed emulators + ViGEm
```

The postMessage bridge and iframe pattern are identical to the existing VRM viewer
(`frontends/shared/viewer/viewer.html`). No new patterns introduced.

---

## Supported Games

### PS1 Games (Tier 1 + Tier 2)

#### Vigilante 8: Second Offense (Luxoflux / Activision, 1999)
```
Genre:       Vehicular combat arena
AI role:     AI drives and fights — Player 1 co-op or Player 1 vs AI
AI model:    State machine: navigate toward nearest enemy, fire when ±20° aligned,
             use defensive weapon when HP < 40%, retreat and repair when HP < 20%
Memory map:  Player HP @ 0x80XXXX, enemy positions, weapon slots, arena bounds
             (addresses from Vigilante 8 speedrun community documentation)
Co-op:       Both players select different characters, fight CPU enemies together
Versus:      Player vs AI character — natural competitive arc with affinity effects
Controller:  Player 1 = physical Xbox controller, Player 2 = ViGEm virtual
Commentary:  AI reacts to: kills, being destroyed, low HP, victory, defeat
Character fit: Rin would absolutely drive a muscle truck and trash-talk
```

#### Twisted Metal 2 (SingleTrac / Sony, 1996)
```
Genre:       Vehicular combat (darker, more urban than V8)
AI role:     AI drives and fights — co-op or versus
AI model:    Similar to V8 but with character-specific special weapon logic
             Sweet Tooth (clown), Axel, Warthog each have distinct playstyles
Memory map:  Community-documented for speedrunning (HP, ammo, position)
Notes:       Different feel from V8 — more chaotic, faster weapons, tighter arenas
             Good variety alongside V8 so users have two vehicular combat options
```

#### Twisted Metal: Black (Incognito / Sony, 2001) — PS2 TIER 2 ONLY
```
Genre:       Vehicular combat (considered the best in the series)
Platform:    PS2 — requires PCSX2 + ViGEm
Notes:       Darker tone, longer story, more complex arenas. Target this as the
             "definitive vehicular combat" experience once Tier 2 is set up.
```

#### Monster Rancher 2 (Tecmo, 1999)
```
Genre:       Monster raising + combat (semi-turn-based commands)
AI role:     Strategic COACH — AI reads battle state and suggests commands in real time
             AI also raises her OWN monster and challenges you to tournaments
AI model:    Battle: reads monster HP, fatigue, enemy action → suggests best command
             Training: tracks stat growth curves, advises weekly training schedule
             Emotional: reacts to monster aging milestones, retirement, death
Disc mechanic: Disc ID database lookup (see Resources) — AI can suggest which
              "discs" to use to generate specific monster types she wants to fight
Memory map:  Monster stats, battle HP/fatigue, tournament standing, monster age
Notes:       The mortality mechanic (monsters age and die) is perfect for the
             app's memory system — the character can reference deceased monsters
             in conversation months later. Genuine emotional continuity.
Commentary:  Fires on: level-up, tournament win/loss, monster aging milestone,
             monster retirement (long emotional reaction), monster death (very long)
```

#### Crash Team Racing (Naughty Dog / Sony, 1999)
```
Genre:       Kart racing — faster and tighter than Mario Kart, more skill-based
AI role:     AI races as a competitor — separate instance via Netplay or ViGEm
             Also coaches: "take the inside line here", "hold nitro for the straight"
AI model:    Waypoint-following with boost management + item usage logic
Notes:       Lighter tone than the combat games — good variety in the library
             The companion character would genuinely love CTR (it fits a playful personality)
```

#### Street Fighter Alpha 3 (Capcom, 1998)
```
Genre:       2D fighting
AI role:     AI plays as your opponent (versus) or tag partner (co-op vs CPU)
AI model:    Frame-data-aware state machine: reads player position, HP, current move
             Selects counter-moves from a weighted table per character
             Adjusts aggression based on affinity score (low affinity = tries harder)
Notes:       Fighting games have the clearest "AI plays" memory structure of any genre
             Health bars are trivially readable; inputs are discrete and mappable
             Character choice matters — AI picks a character that fits her personality
```

#### Need for Speed: Underground 2 (EA Black Box, 2004) — PS2 TIER 2 ONLY
```
Genre:       Open-world street racing, tuner culture
AI role:     Co-driver / rival — AI races in parallel events, compares times
             In free-roam, AI suggests routes, calls out police
Platform:    PS2 — requires PCSX2 + ViGEm
Notes:       The open world means the AI can have opinions about the city,
             suggest which car to tune next, react to race wins/losses over time
```

#### Destruction Derby: Arenas (Reflections / Arenas, 2004) — PS2 TIER 2 ONLY
```
Genre:       Pure demolition derby
AI role:     AI competes — drives its own car, targets other competitors
Notes:       The chaos of a derby makes this perfect for reactive commentary
             even without sophisticated AI logic — random collisions are still funny
Platform:    PS2 — requires PCSX2 + ViGEm
```

---

## Installation Guide (what the in-app wizard walks users through)

### Tier 1 — EmulatorJS (Zero Installation)

No software to install. User provides a disc image (`.bin`/`.cue` for PS1).
The app loads it directly in the browser iframe.

```
Step 1: Go to Settings → Games → Emulator Games
Step 2: Click "Add Game" → select your disc image file (.bin / .cue / .iso)
Step 3: The app detects the game automatically from the disc header
Step 4: Hit Play — the emulator loads in the app window
Step 5: Your AI companion connects automatically
```

**Note on ROM/disc images:** Users must provide disc images from discs they legally own.
The app does not provide or link to ROM downloads. A guide for ripping your own discs
using ImgBurn (Windows) or cdrdao (Mac/Linux) is included in the in-app docs.

---

### Tier 2 — Native Emulator + ViGEm (Full AI Play)

#### Windows Installation Steps

**Step 1: Install PCSX2 (PS2 + PS1 via PS2 compatibility)**
```
1. Download PCSX2 from: https://pcsx2.net/downloads/
2. Run the installer — choose "Portable" install to a folder you choose
3. Launch PCSX2 → it will prompt for a PS2 BIOS file
   (BIOS must be dumped from a PS2 you own — see in-app guide for how to do this)
4. In PCSX2 Settings → Controllers: configure your Xbox controller
5. Note the PCSX2 install path — the app needs this
```

**Step 2: Install DuckStation (PS1 — better PS1 accuracy than PCSX2)**
```
1. Download DuckStation from: https://www.duckstation.org/
2. Extract to a folder — no installer needed (portable app)
3. Launch once to set up controller and BIOS (same BIOS procedure as PCSX2
   but using a PS1 BIOS — dump from your own PS1)
4. Note the DuckStation install path
```

**Step 3: Install ViGEm Bus Driver (enables virtual Xbox controller)**
```
1. Download ViGEm Bus from:
   https://github.com/ViGEm/ViGEmBus/releases
   (look for ViGEmBus_Setup_x64.exe — latest release)
2. Run the installer — requires admin. Installs a Windows kernel driver.
3. Restart if prompted.
4. Verify in Device Manager: "Xbox 360 Peripherals" → "Xbox 360 Controller for Windows"
   should now appear when the app creates a virtual controller
```

**Step 4: Install Python dependencies (the app does this automatically)**
```
The app runs: .venv/bin/pip install vigemclient
vigemclient is the Python binding for ViGEm Bus.
Verified compatible: Python 3.9+, Windows 10/11
```

**Step 5: Configure in the app**
```
Settings → Games → Emulator Setup → Native Emulators
  ☑ PCSX2 path: [Browse...]
  ☑ DuckStation path: [Browse...]
  ☑ ViGEm status: Detected ✓ (auto-detected after driver install)
  ☑ Test AI Controller: [Click to verify] → creates virtual controller for 5s
```

---

#### macOS Installation Steps

**Note on ViGEm:** ViGEm is Windows-only. On Mac, AI virtual controller injection
uses a different approach: **Karabiner-Elements virtual HID device** (macOS) or the
**EmulatorJS JS controller injection** (Tier 1, no native install needed).

For Mac users, **Tier 1 (EmulatorJS) is the recommended path** — it works without
any installation and supports all PS1 games. PS2 games on Mac require:

**Step 1: Install PCSX2 for macOS**
```
1. Download PCSX2 macOS build from: https://pcsx2.net/downloads/
   (look for "macOS" tab — Apple Silicon native build available)
2. Move PCSX2.app to /Applications
3. First launch: macOS will prompt for security approval
   System Settings → Privacy & Security → "Open Anyway" for PCSX2
4. Configure PS2 BIOS (same as Windows — dump from your own console)
```

**Step 2: Virtual controller on Mac (for AI play)**
```
Option A: Use Tier 1 EmulatorJS (recommended — no extra install)
Option B: Install Karabiner-Elements (https://karabiner-elements.pqrs.org/)
          and use its virtual HID device API — more complex, documented in
          backend/games/emulator/mac_controller.py
```

---

### Monster Rancher Disc Database Setup

Monster Rancher 2 generates monsters from disc IDs. The community database
maps ~50,000 disc IDs to monster results.

```
1. The app downloads the disc ID database automatically on first MR2 launch
   (JSON file, ~2MB, stored in backend/games/emulator/mr2_disc_db.json)
2. Source: LegendCup community database (legendcup.com) — the most complete
   and actively maintained disc ID collection
3. In the app: Monster Rancher 2 → "Summon Monster" → type any album/game/movie
   title → the app looks up the disc ID and generates the corresponding monster
4. No physical disc swapping needed in emulation — pure database lookup
```

---

## Backend Components

### New files to create

```
backend/games/emulator/
  __init__.py
  memory_maps/
    vigilante8_so_ps1.py     — RAM addresses: HP, position, weapon, enemy state
    twisted_metal2_ps1.py    — RAM addresses for TM2
    monster_rancher2_ps1.py  — RAM addresses: monster stats, battle state, age
    street_fighter_a3_ps1.py — RAM addresses: HP bars, round state
    twisted_metal_black_ps2.py
    nfs_underground2_ps2.py
  vigem_controller.py        — ViGEm virtual Xbox controller wrapper
  mac_controller.py          — macOS virtual HID fallback
  emulatorjs_bridge.py       — reads game state from EmulatorJS postMessage stream
  game_agents/
    vigilante8_agent.py      — drives truck, fires weapons, avoids walls
    monster_rancher_coach.py — reads battle state, generates command suggestions
    street_fighter_agent.py  — fighting game move selection per character
    racing_agent.py          — generic racing agent (CTR, NFS)
    arena_combat_agent.py    — generic arena agent (TM2, TMBlack, DD:Arenas)
```

### New API endpoints

```python
GET  /api/emulator/games
     → list of supported games with tier, platform, ai_role, cover_art_url

POST /api/emulator/start
     body: { game_id, rom_path, tier, character_id, ai_mode: 'play'|'coach'|'off' }
     → { session_id, emulator_pid, ws_state_url }

WS   /ws/emulator/state/{session_id}
     → stream of GameStateEvent { game_id, state, timestamp }
     (Lua script in PCSX2 sends these; EmulatorJS postMessage bridge for Tier 1)

POST /api/emulator/ai-action/{session_id}
     → triggers one AI decision cycle
     → reads current game state → runs agent → writes ViGEm controller state
     → returns { action_taken, commentary_trigger: null | moment_type }

GET  /api/emulator/setup-status
     → { pcsx2: bool, duckstation: bool, vigem: bool, tier1_available: bool,
         tier2_available: bool, missing: [string] }
```

### PCSX2 Lua Bridge Script

PCSX2 has a built-in Lua scripting engine. The app installs this script into
PCSX2's scripts folder during setup:

```lua
-- waifu_bridge.lua
-- Runs inside PCSX2, reads game memory, sends state to app via HTTP

local socket = require("socket")
local json = require("json")  -- bundled with PCSX2 Lua
local GAME_ID = "vigilante8_so"  -- set per game

local function read_state()
  -- Vigilante 8: Second Offense PS1 memory addresses
  local p1_hp    = mainMemory.readByte(0x801A3C20)
  local p1_x     = mainMemory.readFloat(0x801A3C40)
  local p1_y     = mainMemory.readFloat(0x801A3C44)
  local p1_weapon = mainMemory.readByte(0x801A3C60)
  local enemy_hp = mainMemory.readByte(0x801A4020)
  return {
    game_id = GAME_ID,
    p1 = { hp=p1_hp, x=p1_x, y=p1_y, weapon=p1_weapon },
    enemy = { hp=enemy_hp }
  }
end

-- Poll every 100ms, POST to app backend
while true do
  local state = read_state()
  local body = json.encode(state)
  local req = socket.http.request {
    url = "http://127.0.0.1:8080/api/emulator/state-update",
    method = "POST",
    headers = { ["Content-Type"]="application/json", ["Content-Length"]=tostring(#body) },
    source = socket.source("by-length", body, #body)
  }
  socket.sleep(0.1)
end
```

### ViGEm Python Controller

```python
# backend/games/emulator/vigem_controller.py
"""
Virtual Xbox 360 controller via ViGEm Bus Driver.

Wraps the vigemclient library to provide a clean interface for the AI agents.
One virtual controller per AI player — up to 4 supported by ViGEm.
"""

from vigemclient import ViGEmClient, Xbox360Controller
from dataclasses import dataclass

@dataclass
class ControllerState:
    left_x: float = 0.0      # -1.0 to 1.0
    left_y: float = 0.0      # -1.0 to 1.0
    right_x: float = 0.0
    right_y: float = 0.0
    lt: float = 0.0           # 0.0 to 1.0
    rt: float = 0.0
    a: bool = False
    b: bool = False
    x: bool = False
    y: bool = False
    lb: bool = False
    rb: bool = False

class AIVirtualController:
    """One virtual Xbox 360 controller for AI player input injection."""

    def __init__(self):
        self._client = ViGEmClient()
        self._controller = Xbox360Controller(self._client)
        self._controller.connect()

    def set_state(self, state: ControllerState) -> None:
        """Push a new controller state to the OS immediately."""
        axes = self._controller.axes
        axes.left_x.value = int(state.left_x * 32767)
        axes.left_y.value = int(state.left_y * 32767)
        axes.right_x.value = int(state.right_x * 32767)
        axes.right_y.value = int(state.right_y * 32767)
        axes.left_trigger.value = int(state.lt * 255)
        axes.right_trigger.value = int(state.rt * 255)
        self._controller.buttons.A.value = state.a
        self._controller.buttons.B.value = state.b
        self._controller.buttons.X.value = state.x
        self._controller.buttons.Y.value = state.y
        self._controller.update()

    def release(self) -> None:
        self._controller.disconnect()
```

---

## In-App Setup Wizard

A new `EmulatorSetupWizard.tsx` component (accessible from Settings → Games → Emulator Setup)
walks the user through installation with:

```
Step 1: Platform detection (Windows vs Mac → different paths shown)
Step 2: Choose tier
        ○ Quick Play (Tier 1 — EmulatorJS, works now, PS1 only)
        ○ Full AI Play (Tier 2 — native install, PS1 + PS2, AI plays)
Step 3: Tier 2 only — download links for PCSX2 / DuckStation
Step 4: Tier 2 Windows only — ViGEm installation guide + auto-detection
Step 5: BIOS setup guide (how to dump from your own console — legal requirement)
Step 6: ROM/disc image setup (how to rip from your own discs)
Step 7: Test — app creates virtual controller, verifies emulator connection
Step 8: Add your first game → Play
```

Each step has:
- Clear illustrations (ASCII diagrams or simple SVG)
- Direct links to download pages
- "Check" button that verifies the step completed correctly before moving on
- "Skip to Quick Play" escape hatch at any point

---

## In-App Game Library

`GameLibrary.tsx` — the games panel shows:

```
┌─────────────────────────────────────────────────────────┐
│  EMULATOR GAMES                          [+ Add Game]   │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Vigilante 8 │  │ Twisted     │  │  Monster    │    │
│  │ 2nd Offense │  │ Metal: Black│  │  Rancher 2  │    │
│  │   PS1  T1✓  │  │  PS2  T2   │  │  PS1   T1✓  │    │
│  │  [Play]     │  │ [Setup T2] │  │  [Play]     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  THREE.JS GAMES (built-in, no setup)                   │
│  ┌─────────────┐  ┌─────────────┐                      │
│  │ Super Off-  │  │  [Add more] │                      │
│  │ Road (soon) │  │             │                      │
│  └─────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

Clicking a game card with T2 but T2 not installed → shows inline setup prompt.
T1 games with a ROM present → Play button active immediately.

---

## Per-Game AI Commentary Triggers

Shared across all emulator games — the AI companion generates a voiced/text reaction
at these moments (same rate-limiting as the racing game: max 1 call per 8s, priority queue):

```
universal_triggers:
  game_start          → opening trash talk or encouragement
  player_low_hp       → concern or taunting depending on who's leading
  ai_low_hp           → "Okay I need to focus..."
  kill_scored         → celebration (player) or "got you!" (AI)
  player_destroyed    → sympathy or teasing
  ai_destroyed        → embarrassed acknowledgement
  match_end_win       → genuine congratulations (2–3 sentences)
  match_end_loss      → graceful defeat + "rematch?"
  close_finish        → "That was so close!"

monster_rancher_specific:
  monster_level_up    → excited
  battle_command_now  → real-time suggestion (unique to MR)
  monster_aging       → reflective
  monster_retirement  → longer, emotional (permanent memory stored)
  monster_death       → extended reaction, memory flagged as Tier 3 permanent
```

---

## Roadmap

### Phase 1 — EmulatorJS + PS1 (no user install required)
1. Build `emulator.html` iframe wrapper (EmulatorJS, PCSX-ReARMed core)
2. Build `EmulatorPanel.tsx` + postMessage bridge
3. JS memory reader for Vigilante 8 Second Offense
4. JS controller injector for AI play in V8:SO
5. Game library UI + ROM file picker
6. Commentary system integration
7. **Games playable: V8:SO, TM2, CTR, MR2, Street Fighter Alpha 3**

### Phase 2 — Native PCSX2 + ViGEm (Windows)
8. Build ViGEm Python controller wrapper
9. PCSX2 Lua bridge script + installer
10. `EmulatorSetupWizard.tsx` (step-by-step guided setup)
11. AI game agents for V8:SO, TM2, arena_combat generic
12. Monster Rancher 2 coach agent + disc ID database
13. **Games added: Twisted Metal: Black (PS2), NFS:U2 (PS2), DD:Arenas (PS2)**

### Phase 3 — Three.js Arena Brawler (built-in, no emulator needed)
14. Custom Vigilante 8-inspired arena combat in Three.js
15. Shares weapon system from Super Off-Road design doc
16. Full companion AI integration, affinity-driven difficulty
17. Optionally replaces emulator version when quality matches

---

## Resources

| Resource | URL | Notes |
|----------|-----|-------|
| PCSX2 (PS2 emulator) | https://pcsx2.net/downloads/ | Windows + macOS builds |
| DuckStation (PS1 emulator) | https://www.duckstation.org/ | Best PS1 accuracy |
| EmulatorJS | https://emulatorjs.org/ | Browser-based WASM emulation |
| ViGEm Bus Driver | https://github.com/ViGEm/ViGEmBus/releases | Windows only, kernel driver |
| vigemclient Python | `pip install vigemclient` | Python ViGEm bindings |
| RetroArch | https://www.retroarch.com/ | Alternative unified frontend |
| LegendCup (MR2 community) | https://legendcup.com/ | Monster Rancher disc database |
| ImgBurn (disc ripping) | https://www.imgburn.com/ | Windows disc image creation |
| Karabiner-Elements | https://karabiner-elements.pqrs.org/ | macOS virtual HID (for Mac AI controller) |
| PCSX2 Lua scripting docs | https://pcsx2.net/docs/ | Memory read API reference |

> **Legal note:** The app does not distribute ROMs, BIOS files, or disc images.
> All emulation requires software legally owned by the user. The setup wizard
> explains how to create disc images and BIOS dumps from hardware you own.

---

> **When ready to build:** Start with Phase 1 — EmulatorJS requires no installation
> from the user and delivers immediate value. Get V8:SO playable with AI in the browser
> first. Phase 2 (native) can follow once the iframe pattern is proven.
