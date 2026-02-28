# Changelog — Waifu-RT3D

All notable changes to this project are documented here. Phases are listed in reverse chronological order.

---

## [v8.1.0] - Feb 28, 2026 — Wizard System + Code Quality Sprint

### Setup Wizards & Feature Discovery

New guided onboarding and progressive feature discovery system in Sakura frontend:

- **OnboardingWizard**: 7-step first-run wizard (Welcome → Hardware Scan → LLM Setup → Character Create → Voice Setup → Feature Tour → Done)
- **WizardShell**: reusable multi-step wizard container with animated step transitions, progress bar, skip/back/next, keyboard nav (ESC to close)
- **5 setup wizards**: LLMSetupWizard, VoiceSetupWizard, ExpressionSetupWizard, ImageGenSetupWizard, CardImportWizard — each a multi-step modal with validation
- **FeatureDiscovery hooks**: `useFeatureDiscovery` triggers contextual tips based on message count, session count, and idle time
- **FeatureTipQueue**: toast-style queue for discovery tooltips with snooze/dismiss
- **WhatsNewModal**: shows new features after version updates with direct links to setup wizards
- **Setup Guides**: card grid in Settings showing configuration completion status with pulsing dot indicators
- **wizardStore**: Zustand store for wizard state, feature discovery flags, and snooze/dismiss persistence
- **Responsive**: fullscreen variant on desktop, bottom-sheet drawer on mobile

New files: `wizard/WizardShell.tsx`, `wizard/WizardProgress.tsx`, `wizard/WizardStepCard.tsx`, `wizards/*.tsx` (5 wizards), `onboarding/*.tsx` (6 step components + shell), `discovery/FeatureSpotlight.tsx`, `discovery/FeatureTipQueue.tsx`, `hooks/useFeatureDiscovery.ts`, `stores/wizardStore.ts`, `components/WhatsNewModal.tsx`

### Kokoro TTS Completion (A7)

- **TTSModelsPanel**: fixed live preview bug (was reading `data.filename` instead of `data.url` from `/api/tts` endpoint)
- **TTSModelsPanel**: fixed active voice indicator (was returning empty string for `activeTtsVoiceId` in new config shape)
- **Kokoro adapter**: added speed parameter passthrough — reads `speed`, `speech_rate`, and Edge-TTS-style `tts_rate` strings (e.g. `"+10%"`)
- **Voice catalog**: 11+ Kokoro voices with correct metadata (CPU-only, streaming, no cloning)
- **End-to-end verified**: adapter → registry → server endpoints → VoicePicker → TTSModelsPanel

### TypeScript Error Fixes (14 → 0)

- `CinematicOverlay.tsx`: `Message` → `ChatMessage`, removed unused `draft`, fixed `sendMessage()` to require text arg
- `VNTextBox.tsx`: `Message` → `ChatMessage` type
- `TTSModelsPanel.tsx`: removed unused `Star` import
- `UserKnowledgePanel.tsx`: `JSX.Element` → `ReactNode`, `setOverlay` → `closeOverlay`
- `CreateView.tsx`: removed unused `charName` param
- `SettingsView.tsx`: `editChar` → `activeCharacter`, added `id`/`voice_sample_path` to state, fixed `mood_enabled` boolean type
- `types.ts`: added `voice_sample_path` to Character interface

### Test Coverage

- **55 new tests** across 4 test files:
  - `wizardStore.test.ts` (23 tests) — store logic, hydration, persistence
  - `WizardShell.test.tsx` (16 tests) — navigation, variants, keyboard, data passing
  - `useFeatureDiscovery.test.ts` (10 tests) — trigger logic, gating, snooze
  - `WhatsNewModal.test.tsx` (6 tests) — rendering, dismiss, wizard links
- **Fixed 3 pre-existing test failures** in `SettingsView.exportImport.test.tsx` (missing mocks, ambiguous selectors)

### Critical Code Review Fixes

- **FactExtractor** (`backend/knowledge/extractor.py`): fixed broken config key path — `cfg.get("model")` → `cfg.get("llm", {}).get("model")` (feature C3 was completely non-functional)
- **Tiered Memory** (`backend/memory/tiered_memory.py`): fixed SQL injection in `run_decay` — f-string `datetime('now', '-{weeks} weeks')` → parameterized `datetime('now', ?)`
- **Twenty Questions** (`backend/games/twenty_questions.py`): min thing length (3 chars), replaced substring fuzzy match with word-level subset matching to prevent false positives
- **Character Card** (`backend/characters/chara_card.py`): added `Image.MAX_IMAGE_PIXELS = 50_000_000` decompression bomb guard, fixed base64 padding formula

---

## [v7.0.0] - Feb 27, 2026 — 32-Feature Sprint + UX Design Pass

### 32-Feature Sprint — Phases 1–3 (Feb 27, 2026)

Largest feature batch to date: 32 companion features across three phases, all implemented in a single agent sprint.

#### Phase 1 (#1–#10, #26)
- **Session Summary Panel** (alt+s) — auto-generated session recap with token usage, message count, and highlights
- **Context Budget Bar** — live token usage indicator in ChatThread, color-coded green/yellow/red
- **Milestone Celebration** — full-screen confetti overlay on affinity tier advancement
- **Schedule Editor** (alt+h) — UI to set character availability windows, day-off toggles, and schedule rules
- **Markdown Export** — export conversation as formatted Markdown
- **Backstory Generator** — AI-generates character backstory from existing traits
- **Webhook Config UI** — in-app editor for outbound webhook URLs and event filters
- **Compression Preview** — shows what context will be removed before compression fires
- **Session Tags** — tag sessions for filtering and search
- **Message Pinning** — pin important messages to a character's permanent record
- **Incognito Mode Prominence** — incognito toggle promoted to primary visibility in ChatThread

#### Phase 2 (#11–#20, #24)
- **Global Search Panel** (alt+f) — full-text message search using FTS5 with LIKE fallback
- **Soundscape Player** — ambient audio loops (rain, café, forest, etc.) controllable per-character
- **Scenario Library** (alt+i) — browse and load pre-written scenario prompts into any conversation
- **Waveform Visualizer** — live audio waveform display during TTS playback
- **Mood Board Editor** (alt+b) — pin and annotate images to set visual context for conversations
- **Branching Visualizer** — interactive tree view of branched conversation paths
- **Model Arena** (alt+p) — compare responses from two different LLM configs side-by-side
- **Theme Customization** — additional theme customization controls in Settings
- **Data Export ZIP** — export all sessions, characters, and media as a ZIP archive
- **Custom Keyboard Shortcuts** (#24) — user-configurable alt+* hotkeys for all panels

#### Phase 3 (#22–#29)
- **Message Reactions Bar** — emoji reactions on individual messages (GET/POST/DELETE endpoints)
- **Character Portfolio Cards** (alt+o) — full-page portfolio view of character stats and history
- **Session Replay Modal** (alt+r) — replay any previous session as a scrolling read-only timeline
- **Character Relationship Web** (alt+w) — visual affinity graph across all characters
- **Day-Off Toggle** — set characters to be "unavailable" via PATCH /api/characters/{id}/day-off
- **Schema v21** — added `message_reactions` table and `day_off` column to characters

**New API endpoints (Phase 1–3):**
- `GET/POST/DELETE /api/messages/{id}/reactions`
- `GET /api/characters/{id}/portfolio`
- `PATCH /api/characters/{id}/day-off`
- `GET /api/search/messages` (FTS5 + LIKE fallback)
- `GET /api/data/export` (ZIP, BackgroundTask cleanup)
- `POST /api/arena/compare` (sequential LLM, per-config error isolation)

### UI/UX Design Pass — "Intimate Luxury Digital" Aesthetic (Feb 27, 2026)

Complete visual language pass applied to all Sakura components:

- **Typography**: Nunito (warm rounded body) + Fraunces italic weight-300 (editorial display serif) via Google Fonts
  - `char-name-display` CSS class applied in StatusBar, DialogueBubble, Sidebar
  - CSS vars: `--font-body`, `--font-display` across all 4 themes
- **Film grain overlay**: `body::after` SVG feTurbulence at 2–3.5% opacity per theme (all 4 themes)
- **Dialogue bubbles**: blur-in entrance animation (`bubbleIn` now includes `filter: blur(3px) → 0`), tinted assistant card background via `color-mix()`
- **WelcomeScreen**: full redesign — kanji backdrop, petal drift CSS animation, Heart icon brand mark, staggered card entrance
- **ChatThread empty state**: greeting card with avatar, Fraunces character name, quoted greeting message
- **Composer textarea**: auto-resize via `useEffect + scrollHeight` (max 80px), personalized placeholder `Message {name}…`
- **Petal + panel-enter animations** added to components.css
- **"● Auto-saves" flash chip**: persistent save confirmation replaces transient toast

### Bug Fixes (Feb 27, 2026)

- **VRM loading fixed**: illegal `break` statement replaced with `return` in viewer.html message handler (lines 2965, 2968) — models now load correctly
- **Relationship URL 404 fixed**: `/api/characters/relationship` → `/api/characters/{id}/relationship` across App.tsx, MobileApp.tsx, and CharacterRelationshipWeb.tsx
- **Pydantic BaseModel import**: added missing import in server.py that caused startup failure after Phase 3 additions
- **Remote GPU wizard**: 7-state machine in ModelPanel (`idle → scanning → found/not_found → connecting → connected/error`) with LAN subnet scan
- **FPS badge**: 3D viewport FPS overlay in ModelPanel, posted from viewer.html via `fpsUpdate` postMessage

### Feature K — Mobile PWA (Feb 27, 2026)

Full Sakura UI as an installable Progressive Web App:

- **MobileApp.tsx**: separate root component for mobile with bottom tab navigation
- **TabBar**: fixed bottom bar with Chats, Discover, Create, Memory, Settings tabs
- **ChatsView / DiscoverView**: mobile-optimized list and discovery views
- **PWA manifest** (`manifest.json`) and service worker (`sw.js`) for offline capability and home screen installation
- **Device detection** (`deviceDetect.ts`) routes mobile visitors to MobileApp automatically

### Feature L — Character Discovery Hub (Feb 27, 2026)

- **DiscoverView**: grid of character portfolio cards for browsing and importing community characters
- **CharacterPortfolioCard**: full stats card with affinity tier, message count, and quick-start button

---

## [v6.1.0-dev] - Feb 25, 2026 — Phase 6F

### Phase 6F — Layered Procedural Animation System (Feb 25, 2026)

Replaced 5 independent animation controllers with a unified 6-layer personality-driven pipeline. Characters now move differently based on personality profiles.

- **AnimationDirector**: orchestrates 6 layers per frame with suppression rules (Talk suppresses Idle, Gesture suppresses Idle+Talk)
- **L0 BasePose**: breathing rhythm scaled by energy/nervousness personality traits
- **L1 IdleBehavior**: 22 personality-gated fidgets (hair twirl, hip cock, peace sign, etc.) with random timers
- **L2 Emotion**: additive posture bias from current mood (happy bounce, sad slouch, pouty sway)
- **L3 Talk**: illustrative hand gestures and head nods during speech, scaled by confidence
- **L4 Gesture**: 14 triggered animations with improved 3-phase blend envelope
- **L5 LookAt**: absorbed MouseTrackingController + IdleHeadMovement; mouse active → track cursor, mouse idle → gaze wander
- **Schema v16**: added `animation_profile TEXT` column to characters table
- **Personality sliders**: 5 range sliders in WaifuCreator (energy, confidence, nervousness, expressiveness, playfulness) with live 3D preview
- **ViewerBridge**: `setPersonality()` method posts profile to viewer iframe
- Legacy controllers (ProceduralAnimator, IdleHeadMovement, MouseTrackingController, GestureController) deprecated and nulled at model load

---

## [v6.0.0] - Feb 23, 2026 — Phases 5–12 Merge

Massive feature merge covering Phases 5 through 12. Brought the app from basic chat to a full AI companion platform.

### Phase 12 — Create-a-Waifu (Feb 22, 2026)

Full-page character creator with tabbed wizard UI.

- **WaifuCreator component**: 4-tab wizard (Identity, Appearance, Voice, Personality)
- **Identity tab**: name, greeting, system prompt, personality traits
- **Appearance tab**: VRM model selector, background mode, portrait upload
- **Voice tab**: TTS provider, voice ID, rate/pitch sliders, preview button
- **Personality tab**: animation profile sliders for 3D behavior
- Direct save to database via character CRUD endpoints

### Phase 11 — Token Budget & UX Fixes (Feb 22, 2026)

- **Token budget visualization**: shows estimated context usage before sending
- **Prompt deduplication**: prevents duplicate system prompts in context
- **History auto-summarization**: fires at 90% of history_limit via background task
- UI polish: scroll behavior, panel toggles, layout fixes

### Phase 10 — Agentic Characters (Feb 21–22, 2026)

Characters with agentic mode enabled can autonomously use tools during conversation.

- **AgentRunner**: agentic loop with XML tool-call parser + native function calling fallback
- **ToolRegistry**: centralized tool registration with `ToolDef` and `ToolResult` data classes
- **12 agent tools** across 3 tiers:
  - **Core (Tier 0)**: image generation, memory search, web search, scene control
  - **Tier 1**: diary writing, relationship tracking, self-modification, webhook events
  - **Tier 2**: voice generation, mood analysis, knowledge base search
  - **Special**: cross-character messaging (`message_character`)
- **Frontend tool cards**: renders tool use/result in chat as styled cards
- **LLM adapter `supports_tools()`**: per-adapter capability detection
- **XML tool prompt generator**: injects tool descriptions for local models that lack native tool use

### Phase 9 — Capability-Aware Characters (Feb 21, 2026)

- **Schema v15**: added `capability_profile TEXT` column to characters table
- **Model tier estimation**: auto-detects model size (small/medium/large/xl) from model name
- **Per-character capability profiles**: LLM requirements, context budget, feature flags
- **Capability warnings**: frontend shows warning when model may be underpowered for character
- **Generate icon button**: AI-powered character icon generation

### Phase 8A — AI Image Generation (Feb 21, 2026)

- Image generation adapters (ComfyUI, Stable Diffusion)
- Settings panel for image gen configuration
- Generate buttons in character creator and chat

### Character Diary (#57) (Feb 21, 2026)

- LLM writes first-person session diary entries that persist across sessions
- Diary entries injected into future conversation context
- Diary management UI

### Phases 7A–7E — 30+ UX/Backend Improvements (Feb 20–21, 2026)

#### 7A — Quick Wins
- Token counter fix (holds final stats instead of resetting to 0)
- Chat bubble separator styling
- History compression (#5)
- Font size control S/M/L (#30)
- Backend timeout banner (#50)
- Timestamps toggle (#93)
- DB vacuum command (#106)

#### 7B — More Quick Wins
- Per-character temperature slider (#3)
- Daily greeting injection (#54)
- Mood persistence across sessions (#56)
- TTS queue status pill (#79)
- Avatar tooltip in chat (#94)
- Voice preview button (#12)
- VAD threshold slider (#83) + VAD.js config integration
- Scroll position memory (#92)

#### 7C — Operations & Backend
- TTS cache UI widget — view/clear synthesized audio cache (#76)
- Webhook outbound events — `_fire_webhooks()` for Zapier/n8n (#62)
- JSON logging mode — `WAIFU_LOG_JSON=1` (#114)
- Config schema validator (#117)
- `/api/healthcheck` alias

#### 7D — 3D Viewer & Voice
- Camera preset buttons — Full Body / Bust / Face with smooth tween (#27)
- Disco/party lighting — RGB PointLights with hue cycling (#25)
- Shadow quality toggle — Off / Soft / Sharp (#26)
- VRM scale/position editor (#86)
- Live transcription preview via SpeechRecognition API (#81)
- ASR confidence display + minimum threshold (#20)

### Phase 6 — Audio Pipeline & OBS (Feb 20, 2026)

- **Multi-band lip sync**: 3-band FFT spectral analysis drives 3 visemes (aa/ou/ee)
- **TTS text preprocessor**: cleans markdown, URLs, code blocks before synthesis
- **Sentence-chunked streaming TTS**: first audio in ~1–2s instead of 8–15s
- **Content-addressed audio cache**: instant repeat phrases
- **GPT-SoVITS adapter**: voice cloning TTS for anime-optimized voices
- **Faster-Whisper STT adapter**: fully offline speech-to-text with VAD filter
- **OBS Browser Source overlay**: transparent background + live subtitles via WebSocket (`/ws/overlay`)
- **Edge-TTS adapter**: 400+ Microsoft neural voices, no API key
- **Kokoro TTS adapter**: local ONNX inference, 15+ voices
- **Chatterbox TTS adapter**: zero-shot voice cloning
- **Piper TTS adapter**: fully offline ONNX voice packs
- **XTTS adapter**: local server with voice cloning
- **ElevenLabs adapter**: premium cloud TTS
- **Fish Audio adapter**: cloud or self-hosted TTS
- **Pinokio/Generic adapter**: any REST TTS server
- Unit test suite (98 tests covering API, CRUD, agent tools, capabilities, telemetry, memory, routing, chat)

---

## [v5.32.0] - Feb 2026 — Phases 3A–4B

### Phase 4B — Codebase Audit & Cleanup (Feb 20, 2026)

- Documentation overhaul and code fixes from audit
- Dead code removal and import cleanup

### Phase 4A-2 — Error Console, Glow, FPS Cap (Feb 20, 2026)

- **DevConsole ERRORS tab**: JS `window.onerror` hook + backend `/api/logs` poll surfaces runtime errors in a dedicated tab
- **Settings "Open Error Log"** button: opens DevConsole directly on ERRORS tab
- **Glow intensity CSS wiring**: `glow_intensity` setting (0–100) drives `--glow-intensity` CSS custom property
- **FPS cap + overlay toggle**: configurable FPS cap persists in `app.json`; overlay toggle hides/shows the stat
- **PostMessage handlers in viewer**: viewer iframe handles `setGlowIntensity`, `setFPSCap`, `toggleFPSOverlay` messages
- **Visual settings on page load**: CSS vars for radius, blur, font size, glow now applied at boot

### Phase 4A-1 — Metrics Dashboard Polish (Feb 20, 2026)

- **CSS GPU layer fix**: `will-change: transform` on Three.js canvas eliminates flickering on Apple Silicon
- **VRM delta cap**: bone rotation delta capped at 0.1 rad/frame to smooth jitter from large animation jumps
- **LLM provider in sidebar**: live label shows provider name and active model
- **RAM total + color**: RAM widget shows used/total GB and changes color at >75% / >90% usage
- **FPS counter** (right panel): real requestAnimationFrame-based counter
- **TTFT** (Time To First Token): measured client-side from request send to first `token` SSE event
- **GPU/VRAM in stats endpoint**: reads Apple Silicon `ioreg` and NVIDIA `py3nvml`

### Phase 3G — Animation Overhaul (Feb 2026)

- **Phoneme lip sync**: 3-band FFT analysis (low/mid/high) drives VRM blendshapes in real time
- **Auto-gesture system**: mood/emotion state machine triggers idle gestures contextually
- **PostMessage API expansion**: viewer accepts `setExpression`, `playGesture`, `setBackground`, `captureScreenshot`
- **Backend fixes**: memory query signature fix, vocab injection in streaming endpoint

### Phase 3F — Token Persistence, Themes, UI Polish (Feb 2026)

- **Schema V8**: `messages` table gains `token_count`, `input_token_count`, `generation_time_ms`, `tokens_per_second` columns
- **VRM A-pose fix**: correct Z rotation convention; normalized bone names
- **Mouse tracking**: VRM head follows mouse cursor via `lookAt` in viewer iframe
- **Breathing animation**: VRM chest/spine procedural idle breathing loop
- **Hacker Green + Blurple themes**: two new built-in CSS theme presets
- **Session highlight**: active session highlighted in sidebar session list
- **Sidebar LLM status**: connection dot + provider name shown below character grid

### Phase 3E — Config Persistence, LLM Auto-detect, Portraits (Feb 2026)

- Config values persist across page refreshes via `GET /api/config` on load
- LLM auto-detect: `/api/lm-studio/models` probes for running models on startup
- Character portrait images served from `backend/storage/images/`
- Character card shows portrait with fallback to avatar VRM thumbnail

### Phase 3D — Memory & Multi-character (Feb 2026)

- **Memory Graph RAG**: vector store with graph-based re-ranking (`/api/memory/`)
- **`/api/chat/multi`**: round-table endpoint — multiple characters respond to same user message
- Memory Manager UI: browse, delete, and inspect stored memories per character

### Phase 3C — Right-Panel Widgets (Feb 2026)

- Draggable right panel with resizable sections
- Relationship widget: affinity / mood / trust bars
- Emotion timeline: recent emotion history graph
- Vocabulary panel: live vocab injection stats

### Phase 3B — Session Management (Feb 2026)

- Pin sessions (stay at top of list)
- Archive sessions (hidden from default view)
- Duplicate session with full message history
- Export session as JSON or plain text
- Session search by title

### Phase 3A — Foundation Fixes (Feb 2026)

- Token counter reset bug fixed (held display on reply completion)
- Character switching mid-session preserves history correctly
- Chat deduplication: `client_message_id` prevents double-submit on retry

---

## [v5.31.0] - Hybrid & Rin - 2026-02-02

### Added

- **Hybrid Architecture**: Unified backend serving both active frontends
  - Neon Glass UI (Default): `frontends/neon`
  - Classic Dashboard (Legacy): `frontends/classic`
- **Character: Rin (Fox)**: deep Tsundere personality profile with "Fiery Racer" system prompt
- **Frontend Switching**: "Switch to Classic Dashboard" button in Neon System Settings
- **Documentation**: established `docs/` folder structure

### Changed

- **3D Viewer Upgrade**: refactored `viewer.html` to support `three-vrm` v1.0, replaced deprecated `VRM.from` with `VRMLoaderPlugin`, enforced A-Pose arm rotation, added body idle animation
- **Neon UI Repairs**: fixed ConfigUI init timing, VRM loading, chat input connection logic

### Fixed

- Database: patched schema to include `tts_pitch` and `tts_rate` columns
- Scripts: updated `tools/init_personas.py` to support new character schema

---

## [v5.30.0] - Retro Modernization (Archived)

- Attempted modernization of Classic frontend
- *Status*: Deemed unstable; pivot to Hybrid model

## [v4.0.0] - Baseline

- Original working version (Classic)
