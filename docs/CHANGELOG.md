# Changelog - Waifu-RT3D

## [v5.32.0-dev] - Feb 2026 — Phases 3A–4A-2

### Phase 4A-2 — Error Console, Glow, FPS Cap (Feb 20, 2026)

- **DevConsole ERRORS tab**: JS `window.onerror` hook + backend `/api/logs` poll surfaces runtime errors in a dedicated tab.
- **Settings "Open Error Log"** button: opens DevConsole directly on ERRORS tab.
- **Glow intensity CSS wiring**: `glow_intensity` setting (0–100) drives `--glow-intensity` CSS custom property.
- **FPS cap + overlay toggle**: configurable FPS cap persists in `app.json`; overlay toggle hides/shows the stat.
- **PostMessage handlers in viewer**: viewer iframe handles `setGlowIntensity`, `setFPSCap`, `toggleFPSOverlay` messages.
- **Visual settings on page load**: CSS vars for radius, blur, font size, glow now applied at boot (not only after settings save).

### Phase 4A-1 — Metrics Dashboard Polish (Feb 20, 2026)

- **CSS GPU layer fix**: `will-change: transform` on Three.js canvas eliminates flickering on Apple Silicon.
- **VRM delta cap**: bone rotation delta capped at 0.1 rad/frame to smooth jitter from large animation jumps.
- **LLM provider in sidebar**: live label shows provider name (e.g. "LM Studio (local)") and active model.
- **RAM total + color**: RAM widget shows used/total GB and changes color at >75% / >90% usage.
- **FPS counter** (right panel): real requestAnimationFrame-based counter, not synthetic.
- **TTFT** (Time To First Token): measured client-side from request send to first `token` SSE event.
- **GPU/VRAM in stats endpoint**: `_get_gpu_info()` reads Apple Silicon `ioreg` and NVIDIA `py3nvml`.

### Phase 3G — Animation Overhaul (Feb 2026)

- **Phoneme lip sync**: 3-band FFT analysis (low/mid/high) drives VRM blendshapes in real time.
- **Auto-gesture system**: mood/emotion state machine triggers idle gestures (nod, wave, shrug) contextually.
- **PostMessage API expansion**: viewer accepts `setExpression`, `playGesture`, `setBackground`, `captureScreenshot`.
- **Backend fixes**: memory query signature fix, vocab injection in streaming endpoint.

### Phase 3F — Token Persistence, Themes, UI Polish (Feb 2026)

- **Schema V8**: `messages` table gains `token_count`, `input_token_count`, `generation_time_ms`, `tokens_per_second` columns.
- **VRM A-pose fix**: correct Z rotation convention (+Z raises arm for right-hand rule); normalized bone names.
- **Mouse tracking**: VRM head follows mouse cursor via `lookAt` in viewer iframe.
- **Breathing animation**: VRM chest/spine procedural idle breathing loop.
- **Hacker Green + Blurple themes**: two new built-in CSS theme presets.
- **Session highlight**: active session highlighted in sidebar session list.
- **Sidebar LLM status**: connection dot + provider name shown below character grid.

### Phase 3E — Config Persistence, LLM Auto-detect, Portraits (Feb 2026)

- Config values persist across page refreshes via `GET /api/config` on load.
- LLM auto-detect: `/api/lm-studio/models` probes for running models on startup.
- Character portrait images served from `backend/storage/images/`.
- Character card shows portrait with fallback to avatar VRM thumbnail.

### Phase 3D — Memory & Multi-character (Feb 2026)

- **Memory Graph RAG**: ChromaDB vector store with graph-based re-ranking (`/api/memory/`).
- **`/api/chat/multi`**: round-table endpoint — multiple characters respond to same user message.
- Memory Manager UI: browse, delete, and inspect stored memories per character.

### Phase 3C — Right-Panel Widgets (Feb 2026)

- Draggable right panel with resizable sections.
- Relationship widget: affinity / mood / trust bars.
- Emotion timeline: recent emotion history graph.
- Vocabulary panel: live vocab injection stats.

### Phase 3B — Session Management (Feb 2026)

- Pin sessions (stay at top of list).
- Archive sessions (hidden from default view).
- Duplicate session with full message history.
- Export session as JSON or plain text.
- Session search by title.

### Phase 3A — Foundation Fixes (Feb 2026)

- Token counter reset bug fixed (held display on reply completion).
- Character switching mid-session preserves history correctly.
- Chat deduplication: `client_message_id` prevents double-submit on retry.

---

## [v5.31.0] - Hybrid & Rin - 2026-02-02

### Added

- **Hybrid Architecture**: Unified backend serving both active frontends.
  - Neon Glass UI (Default): `frontends/neon`
  - Classic Dashboard (Legacy): `frontends/classic`
- **Character: Rin (Fox)**:
  - Replaced generic "Friendly Assistant".
  - Deep Tsundere personality profile installed.
  - Custom system prompt with "Fiery Racer" vibe.
- **Frontend Switching**: Added "Switch to Classic Dashboard" button in Neon System Settings.
- **Documentation**: Established `docs/` folder structure.

### Changed

- **3D Viewer Upgrade**:
  - Refactored `viewer.html` to support `three-vrm` v1.0.
  - Replaced usage of deprecated `VRM.from` with `VRMLoaderPlugin`.
  - **Fixed T-Pose**: Enforced "A-Pose" arm rotation on load.
  - Added "Body Idle" animation (breathing + sway) to replace static pose.
- **Neon UI Repairs**:
  - Fixed `ConfigUI` initialization timing (Buttons now work).
  - Fixed `VRM` loading issues.
  - Fixed Chat Input connection logic (`llmConnected` flag).

### Fixed

- **Database**: Patched schema to include `tts_pitch` and `tts_rate` columns.
- **Scripts**: Updated `tools/init_personas.py` to support new character schema.

## [v5.30.0] - Retro Modernization (Archived)

- Attempted modernization of Classic frontend.
- *Status*: Deemed unstable; pivot to Hybrid model.

## [v4.0.0] - Baseline

- Original working version (Classic).
