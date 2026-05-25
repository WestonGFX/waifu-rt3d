# Completed Features — Waifu-RT3D

Historical archive of all implemented features. For active tracking, see [CURRENT_STATUS.md](../CURRENT_STATUS.md).

**Total completed:** 80+ features and phases
**Schema version:** v80 (from v3)
**Date range:** Dec 2025 — May 2026

---

## May 2026 (Session 38/39 — 2026-05-08)

### BUG-1 — Chat History Loads on Character Select
- Schema v80 backfills `sessions.character_id` from `messages.char_id` for all pre-v79 sessions
- Session resume logic: `GET /api/sessions?character_id=N` returns most recent session; frontend loads it instead of creating blank
- Commit: `9b07e86`

### BUG-2 — LLM Timeout Configurable
- `httpx.Timeout(read=N)` reads `llm.timeout_seconds` from `config/app.json` (default 30s, range 10–120s)
- Settings > Brain tab: slider exposes the setting to users
- Commit: `2504b5b`

### BUG-3 — Italic Text Visibility Fix
- `DialogueBubble.tsx`: italic spans changed from `var(--color-action)` to `var(--color-text-secondary)`
- Fixes invisible italic in multiple themes (pop-bubblegum, neon-dark, etc.)
- Commit: `6fed8c2`

### BUG-4 — 3D Idle Animation Smoothing
- `viewer.html`: weight_shift amplitude reduced, shoulder_roll snap removed (sine smoothing), look_around slowed + head tilt correlation added
- Commit: `3bfe893`

### UX Cleanup — 9 Bloat Overlays Removed
- Removed from menu/shortcuts: universes, relweb, moodboard, portfolio, arena, memorialscene, bondstory, schedule, games
- Dev-gated: contextviewer, compression, photomode, gallery (accessible via `--dev` flag)
- Commit: `1a9cfa2`

### Phase A — Message Reactions + Session Resume UX
- Hover reactions (👍 ❤️ 😂 😮 😢) on all chat messages via `MessageReactions.tsx`
- Scroll-to-bottom on session resume with smooth animation
- Commit: `fb7e162`

### Phase B — Character Content Polish
- 13 character bibles applied (personality, speech patterns, backstory)
- 11 characters with missing TTS providers set to `edge-tts`
- VRM model assignments corrected for 14 characters
- Brittney stub prompt expanded from 58 chars to full personality
- Commit: `391cc9f`

### Phase D — Electron v1.0 Packaging Prep
- `AboutOverlay.tsx`: app version, build info, acknowledgments overlay (Alt+Shift+A)
- Dev-mode gating via `effectiveDevMode = devMode || !!window.electronAPI?.isDev`
- `window.__openOverlay` exposed for Electron tray IPC → `mainWindow.webContents.executeJavaScript()`
- macOS `icon.icns` (6 sizes, 226KB) + Windows `icon.ico` (6 sizes, 36KB) generated
- Tray menu "About Waifu RT3D" item wired
- Commit: `894c609`

---

## March 2026

### Phase 20A — Model Catalog & Workflow Research (Mar 25)
- Cataloged 24 LLMs, 10 TTS, 6 STT models with VRAM tiers and quality ratings
- `get_model_recommendation()` in `link_manager.py`; hardware-aware tier selection
- Workflow comparison research (n8n vs LangGraph vs raw Python)
- Commit: `426f48f`

### Phase 19 — On-Device Learning (Mar 25)
- Learning signals capture, behavior adaptation engine, privacy controls
- User interaction patterns feed into automatic response tuning
- Schema v60
- Commit: `b03fcae`

### Phase 17 — Animation Library Expansion (Mar 25)
- Extended animation clip library + sequencer system
- State machine v2 for viewer — richer idle/talk/gesture/clip transitions
- Commit: `9fe3bf1`

### Phase 18C-D — Content Gating Frontend + Legacy Migration (Mar 21)
- Settings UI for content tier selection (SFW / Soft / Explicit)
- Legacy character migration tool to assign default tiers
- Schema v59
- Commit: `7d394ce`

### Smart LLM Endpoint Fallback (Mar 21)
- Automatic failover when primary LLM endpoint is unavailable
- Stream post-processing hooks for provider-specific output normalization
- Commit: `ff64154`

### Phase 18B — Content Gating Chat Pipeline (Mar 21)
- Content gating wired into the live chat endpoint
- Per-turn intimacy tracking with tier enforcement
- Schema v58
- Commit: `9ab6605`

### Phase 18A — Content Gating System (Mar 21)
- Core types: content tiers, ceiling resolver, intimacy tracker
- Prompt builders that inject appropriate content framing per tier
- Commit: `4a93b2d`

### Phase 15C — Semantic Topic-Shift Detection (Mar 21)
- Server integration wiring for embedding-based lore matching
- Topic-shift detection triggers context refreshes mid-conversation
- Commit: `fbec7d6`

### Phase 15A-B — Embedding Provider Abstraction + Semantic Lore (Mar 21)
- `EmbeddingProvider` protocol with MiniLM and Gemma backends
- Semantic similarity matching for lorebook entry injection
- Schema v57
- Commit: `7121ae0`

### Phase 14B — Research Cycle 2A Deep-Dives (Mar 21)
- 12-source deep-dive: mature/18+ AI apps, Steam games, 3D companion sims
- Findings documented in `docs/design/competitive-research-2026-03-18.md`
- Commit: `ffe4a20`

### Phase 14A — Research Cycle 2 Source Collection (Mar 21)
- 24 mature/18+ sources ranked by relevance and market position
- Identified content gating, embedding lore, and animation gaps
- Commit: `4d5409c`

### Phase 3B — Hair Anisotropic + Eye Sparkle Shaders (Mar 21)
- Anisotropic hair shading via `onBeforeCompile` injection in Three.js
- Procedural eye sparkle with time-uniform driven animation
- Commit: `ed6a7f0` / fix: `4b932c7`

### Phase 11A — Environment Poses + Time-of-Day Lighting (Mar 21)
- Procedural pose system with scene context (sitting, standing, lying)
- Time-of-day lighting presets driven by system clock
- Commit: `ac316e6`

### Phase 12-P5 — Procedural Character Audio Engine (Mar 21)
- Ambient soundscapes generated procedurally per scene context
- Settings UI with per-character audio personality controls
- Commit: `466f0e9`

### Phase 12-P4 — Anime Shaders + Backgrounds + Particles (Mar 20)
- Toon/cel-shading with `onBeforeCompile` injection
- Anime outline pass, rim glow, god rays post-processing
- Emotion-driven color grading, gradient backgrounds, enhanced particle system
- Commits: `57814bb`, `db5584e`, `4e74b48`

### Phase 12-P3 — Touch Interaction + Cinematic Camera (Mar 20)
- Touch raycasting on VRM model surfaces
- Camera preset system (portrait / bust / full-body / dramatic)
- Commit: `8990eaf`

### Phase 13B — Character Journal + Memory Transparency (Mar 20)
- Characters write first-person diary entries after sessions
- Memory transparency API: users can inspect what the AI "remembers"
- Commit: `004164a`

### Phase 9D-E — Engagement Trust + Topic Steering (Mar 20)
- Engagement-based trust scoring — conversation quality affects affinity
- Topic steering: character subtly guides conversations toward preferred subjects
- Commit: `fe6b4fd`

### Phase 12-P2 — Micro-Expressions + Emotion Body Language (Mar 20)
- Random micro-expression twitches for lifelike feel
- Emotion-mapped body language gestures (shy lean, confident stance, etc.)
- Commit: `81f86a3`

### Phase 12-P1 — Enhanced Character Aliveness (Mar 19)
- Procedural saccades (eye micro-movements), smart blinks, micro-tremor
- Breathing animation, hair physics simulation in viewer
- Commit: `44ed169`

### Phase 13A — Bond Progression System (Mar 19)
- XP-based bond levels (0 → 100) with named relationship tiers
- Gift system, story unlocks at milestone levels
- Commit: `5846453`

### Phase 9A-C — Adaptive Intelligence Engine (Mar 19)
- Reflector, tuner, and journal modules in `backend/adaptive/`
- Advisor agent that surfaces personalization insights
- Edge case fixes across mood + memory pipeline
- Commit: `301009c`

### Character Depth Enrichment — Dae, Genki, Alana, Luna (Mar 18)
- Expanded system prompts: Dae 27→42 lines, Genki 35→44, Alana 36→44, Luna 41→46
- Richer personality traits, speech patterns, scenario responses
- Commit: `3b15ae8`

### Girly Character Bridge (Mar 18)
- Girly frontend synced to backend's 13 characters
- Bridge layer maps backend personas to Girly's provider format
- Commits: `f0b7b56`, `080c8a4`

### Tiered Prompt System (Mar 17)
- Schema v52: `system_prompt_lite` column for short-tier prompts
- Auto-tier selection based on model context window size
- Extraction script populates lite prompts from existing character docs
- TIER markers added to all 13 character prompt packs
- Settings UI for manual tier override; 23 backend tests
- Commits: `e3edae9`, `c525e39`, `52a8a20`, `82661af`, `a2cb916`

### Girly Frontend — AnimeGirly Port (Mar 17)
- Ported AnimeGirly as a standalone Girly frontend
- Service-layer adapters for Ollama/OpenAI direct providers
- Restored to standalone mode (bypasses backend for LLM calls)
- Commits: `f8d9ac7`, `9522e19`, `689ee54`

### JSON Export + Procedural Soundscapes + Feature Menu (Mar 17)
- Character JSON export for external tool compatibility
- Procedural ambient soundscapes (rain, forest, city, etc.)
- Feature menu overlay showing available capabilities
- Commit: `38fa6a8`

### Sprint Quick Wins — Floating Bubbles + Navigation (Mar 17)
- Floating message bubbles above chat composer
- Cross-frontend 4-pill navigation switcher
- FOV slider added to EffectsPanel (B4 remediation)
- Custom camera X-to-delete fix
- Commits: `182fef8`, `c0477f1`, `087068b`, `77487d3`

### Director Mode — Dual-Layer OOC Stage Directions (Mar 15)
- Out-of-character stage direction layer for RP scenarios
- Director commands inject into context without appearing as user messages
- Commit: `ed1e03e`

### AI Character Generator (Mar 16)
- LLM-powered character creation wizard (T2-15)
- "Create with AI" entry points in CreateView and Sidebar
- Commits: `826e8a0`, `d1847fd`

### Camera Controls Overhaul + Floating Chat (Mar 16)
- Full 3D viewer camera controls overhaul (PRD 2)
- Floating chat composer embedded in 3D viewer (PRD 1)
- Commits: `c18fb96`, `984d9f3`

### Photo Mode — Full System (Mar 16)
- Gallery backend: schema v51, `GalleryManager`, 6 API endpoints
- Viewer extensions: enter/exit photo mode, hold gesture, quality capture
- Photo Mode overlay: expression, pose, camera, background, capture controls
- Gallery overlay: thumbnail grid, lightbox, tag filtering, `useGallery` hook
- Photo Mode polish: global hotkeys, watermark utility, quick capture
- Photo Mode camera button in status bar toolbar
- Commits: `64ab9e9`, `3ea4481`, `5aef474`, `92454c6`, `124444b`, `922f846`

### Game Win Celebration (Mar 16)
- Confetti burst + animated banner on all 7 mini-games
- 20 Questions: wrong guess no longer ends game immediately
- Commits: `9b985e5`, `d3bba13`

### Inline Fact Editing — Knowledge Graph (Mar 16)
- Inline editing of extracted user facts in the Knowledge Graph panel
- Commit: `471c429`

### Sprint Quick Wins — Notification Polish (Mar 16)
- Subtler toast notifications, removed popup tips
- Removed What's New modal
- Commit: `1a21a29`

### RP Narration + NSFW Toggle + Scene Context (Mar 15)
- RP narration formatting: visual distinction for `(parenthetical)` text
- NSFW default setting + in-chat content filter toggle
- Persistent scene/setting context: RP location and atmosphere
- Commits: `171e5af`, `b127411`, `60c8007`

### Sprint Quick Wins — Sprint Blitz Features (Mar 15)
- Hardware-aware model catalog with HF links (30 → 45 models)
- Daily interaction rewards: streaks, XP, relationship tiers
- Message branch navigation: regenerate + arrow browse history
- Prompt template macros: `{{char_name}}`, `{{time}}`, `{{mood}}`, etc.
- Regex output formatting rules: user-defined LLM output cleanup
- Groq ASR integration: free cloud Whisper STT
- Streak badge + format rules editor + Groq ASR dropdown
- Share as CHARA v2 card from portfolio overlay
- Conversation bookmarks: star messages for easy retrieval
- Connection profiles: one-click LLM backend switching
- Full-text message search: FTS5 index + dual-frontend UI
- Conversation forking: branch from any message
- Commits: `b8822c0`, `5d9f786`, `43ad059`, `905f6a7`, `434dc0c`, `3966fd1`, `ba29897`, `57ce9dd`, `ba29996`, `4b62a0b`, `bc02f81`, `d55e57b`, `a9dca47`, `8fb5250`

---

## 16-Feature Core Roadmap (Feb–Mar 2026)

All 16 planned roadmap features shipped. Listed in completion order.

### A7 — Kokoro TTS + Voice Modulation
- 16-emotion `VoiceModulator` mapping emotion → TTS parameter sets
- Provider-aware parameter injection (Kokoro, GPT-SoVITS, Coqui)
- Voice settings UI with per-emotion preview

### A1 — Full-Duplex Voice Conversation
- WebSocket duplex session with VAD (voice activity detection)
- Barge-in support: user can interrupt AI mid-speech
- `VoiceOrb` UI with state-driven animation
- `useFullDuplexVoice` hook; `VoiceDuplexSession` state machine in `backend/voice/duplex.py`

### C1 — Live2D Runtime
- `viewerStore.ts` mediator dispatching to VRM (iframe) or Live2D (PIXI)
- pixi-live2d-display integration, `useLive2D` hook
- Live2D model picker in settings

### A5 — AI-Generated Expression Portraits
- Stable Diffusion / image gen integration for character expression images
- Expression portrait gallery per character

### A8 — SillyTavern Character Card Import/Export
- CHARA v2 JSON card import wizard
- Export to CHARA v2 format from character portfolio

### B3 — Visual Novel Reader Layout
- VN-mode layout: dialogue box, speaker label, expression portrait
- Toggle between chat and VN display modes

### B1 — Cinematic Immersion Mode
- Letterbox bars, dimmed UI, focused camera framing
- Triggered by in-character dramatic moments

### A3 — Tiered Episodic Memory (sqlite-vec)
- Three-tier memory: working / episodic / long-term
- sqlite-vec for semantic similarity recall
- Memory in `backend/memory/tiered_memory.py`

### A2 — Mini Games (7 games)
- Trivia, 20 Questions, word games, and 4 additional mini-games
- Games in `backend/games/`; win celebration system added later

### B4 — Author's Note
- Persistent author note injected at fixed position in context window
- Configurable injection depth

### C3 — User Knowledge Graph
- `FactExtractor` in `backend/knowledge/extractor.py`
- Automatically extracts and stores user facts from conversation
- Schema v27

### C2 — Smart Tool Protocol Detection
- `get_tool_protocol()` in `backend/llm/capability_detector.py`
- Returns `openai_functions` | `xml_fallback` | `none` per model
- Schema v26

### A6 — Lorebook / World Info Injection
- `LoreMatcher` in `backend/lore/matcher.py`
- Keyword-triggered context injection from world-building entries
- Schema v25

### C4 — Companion Opening Greeting
- `GreetingGenerator` in `backend/greeting/generator.py`
- Contextual greeting on app open based on time, mood, last session
- Schema v24

### A4 — Character Moods + Time-of-Day States
- `MoodEngine` in `backend/mood/engine.py`
- Time-of-day affinity modifiers: morning/afternoon/evening/night states
- Schema v23

### B2 — Emotion-Driven VRM Expression Automation
- LLM emotion tags → VRM morph target mappings
- Automatic expression changes during conversation

---

## February 2026

### Nova Frontend — Full Build (Mar 14)
- Glass-design React frontend (Nova) as alternative to Sakura
- Phase 1: project scaffold + glass foundation
- Phase 2: companion mode chat UI
- Phase 3: focused mode + mode transition + command palette
- Phase 4: settings, emotion display, greeting, expression portraits, game spectator
- Panels: chat history, characters, memory, games, lorebook
- UX polish: toast notifications, error boundary, loading states
- One-click app launchers: macOS .app bundle + Electron backend manager
- Commits: `7ab7a2c`, `d6fee8d`, `fd7607b`, `6396c74`, `0e01c44`, `45f5829`, `c56610c`, `dd2d793`, `c7985e2`

### Character Bible Upgrades — All 13 Characters (Mar 10)
- Yuki: full 10-file spec upgrade + expanded system prompt
- Batch 1: Rin, Raine, Hana — full spec upgrade + expanded prompts
- Batch 2: Shiori, Mika, Luna, Sable, Kaede, Ayane — full spec upgrade
- Commits: `4519f02`, `8c6f0f9`, `2cda684`

### TypeScript Error Resolution (Mar 9)
- Resolved all 31 TypeScript errors across 14 frontend files
- Commit: `8c8b1c0`

### Agentic Characters — Phase 10 (Feb 23)
- `AgentRunner` agentic loop with XML + native tool-use support
- `ToolRegistry`, `ToolDef`, `ToolResult` data classes
- XML tool-call parser with native fallback
- XML tool prompt generator for local models
- 4 core tools: image gen, memory, web search, scene control
- 4 Tier 1 tools: diary, relationship, modify_self, webhook
- 3 Tier 2 tools: voice generation, mood analysis, knowledge search
- `message_character` tool for cross-character communication
- All 12 tools registered in default registry; wired into streaming chat
- Frontend tool card rendering for in-chat tool results
- `supports_tools()` on all LLM adapters
- Commit: `fb8fe0f`

### Phase 9 — Capability-Aware Characters (Feb 23)
- Smart tool protocol detection per model capability
- Generate icon button for image gen from chat
- Schema v15
- Commit: `78ee867`

### Phase 12 — Create-a-Waifu Character Creator (Feb 23)
- Full-page character creator with LLM-assisted fields
- Persona templates, trait sliders, prompt preview
- Commit: `fe2b7e5`

### Phase 11 — Token Budget Visualization (Feb 22)
- Token budget bar showing context window consumption
- Prompt deduplication to reduce redundant token usage
- UX fixes across settings and chat panels
- Commit: `03d91aa`

### Character Diary — LLM Session Reflections (Feb 22)
- Characters write first-person reflections after each conversation session
- Stored in DB; accessible via memory transparency panel
- Commit: `cd9802b`

### Phases 7A-E + 8A — UX & Backend Improvements (Feb 22)
- 30+ improvements across chat UX, settings, and backend stability
- LLM repetitive output fix; slow response fix; is_daily_first crash fix
- Commit: `7cca323`

### Phase 6 — Voice + TTS Overhaul (Feb 22)
- Lip sync animation driven by audio envelope
- TTS preprocessor (cleans LLM output before speech)
- Streaming TTS for lower latency
- GPT-SoVITS integration
- Faster-Whisper ASR integration
- OBS overlay mode for streaming setups
- Commit: `a7cc6a7`

### Phase 4A-B — Viewer Fixes + Metrics Dashboard (Feb 20)
- VRM flickering fix and jitter cap
- Error log panel; glow intensity control; FPS cap
- postMessage extensions for viewer control
- Codebase audit, docs overhaul, code cleanup
- Commits: `99c4ae4`, `d43ee89`, `345a13c`

### Phase 3E-G — Animation + Lip Sync + Themes (Feb 19–20)
- Animation overhaul: idle, talk, gesture sequences
- Phoneme-based lip sync
- Auto-gesture system (gestures matched to speech content)
- Token persistence across sessions
- VRM animation system
- 18 visual themes (9 light / 9 dark)
- UI polish pass
- Commits: `229cea4`, `4ae249d`, `5b3c2d4`

### v2 Preview React Frontend (Feb 10–23)
- Preview-gated React frontend with memory APIs
- HUD settings persistence via `/api/config`
- Chat retry flow and voice visualizer fallbacks
- Memory panel with refresh states
- Playwright e2e coverage + live-backend smoke tests
- Hybrid preflight + telemetry gates for cutover
- Commits: `7bf7edd`, `f752dcd`, `33ce9f0`, `3c26a5a`, `643c350`, `0c91073`

---

## Foundation (Dec 2025 — Feb 2026)

### v5.31 Hybrid Architecture (Feb 2)
- Merged modern backend with multiple frontend options
- Hybrid architecture allowing frontend choice without destructive migration
- Commit: `866901e`

### v5.30 — Initial Full Build (Dec 26, 2025)
- Comprehensive backend services: FastAPI, SQLite, LLM adapters
- VRM 3D avatar viewer (Three.js iframe)
- Initial character roster, chat, TTS/ASR pipeline
- Commit: `9cbe61e`

### v5.29 — Project Initialization (Dec 9, 2025)
- Voice-first AI companion with 3D avatar
- Core architecture: Python backend + React frontend + Three.js viewer
- Commit: `0cb294f`

---

## Schema Version History

| Version | Feature |
|---------|---------|
| v3 | Initial schema |
| v23 | Character moods + time-of-day states (A4) |
| v24 | Companion opening greeting (C4) |
| v25 | Lorebook / world info (A6) |
| v26 | Smart tool protocol detection (C2) |
| v27 | User knowledge graph (C3) |
| v28 | Author's note (B4) |
| v29 | Mini-games (A2) |
| v30 | Tiered episodic memory / sqlite-vec (A3) |
| v51 | Photo Mode gallery (GalleryManager) |
| v52 | Tiered prompt system (system_prompt_lite) |
| v57 | Embedding provider abstraction (Phase 15A-B) |
| v58 | Content gating chat pipeline (Phase 18B) |
| v59 | Content gating frontend + legacy migration (Phase 18C-D) |
| v60 | On-device learning (Phase 19) |

---

## May 2026 (Session 40 — 2026-05-08, same-day continuation of session 38/39)

### Apply Character Styles
- `scripts/draft_character_styles.py` bug fix: `.format()` → `.replace()` (literal `{`/`}` collision in instruction text); `max_tokens` 400→4096 (thinking-model `reasoning_content` budget). Commit: `1d71b62`.
- All 14 builtin characters now have populated `image_style` JSON in DB. Drafted via LM Studio (qwen3.5-9b), reviewed, applied via existing `apply_character_styles.py` (session 29).

### 4 Polish Plans Drafted
- `docs/plans/2026-05-08-animation-polish.md` (~24h AI-eq, FIRST TICKET) — 4 phases: spring-bone fixes, JigglePhysicsManager, saccade + mood-driven idle, VRMA + clip cycling.
- `docs/plans/2026-05-08-hud-polish.md` (~11-16h) — viewer Tier 6 advanced sheet, density/minimal Tier 7, Cmd+K palette, Cmd+? hotkey sheet. Tier 8 dropped.
- `docs/plans/2026-05-08-chat-polish.md` (~11h) — code-block markdown, TTFT telemetry, stuck-gen indicator re-spec, failed-card retry + timestamps + pin UI.
- `docs/plans/2026-05-08-voice-audio-polish.md` (~13-17h) — TTS A/B benchmark, latency telemetry, voice cloning sample UX, VoiceOrb error state + live transcript.
- 9 open questions surfaced + locked. Codebase verifications: `backend/storage/animations/vrma/` empty (Phase 4 prereq), voice gallery has no dedicated table (one sample per character), `ai_token` frames present in duplex.
- Commits: `2c00bc6` + `d98f7dd`.

---

## May 2026 (Session 47 — 2026-05-25, v1-Lite execution sprint + bond burn-down)

### Creative angle (session opened with user's "try new things")
- **LLM probe wired as character-voiced inline aside** (`906a9f6`): instead of the speced banner, surfaces probe warnings (reasoning_only, slow_first_token, endpoint_unreachable, …) as a quiet italic in-character aside ("*tilts head* The model you're running thinks out loud…"). Lives inside the chat scroll area + above WelcomeScreen, dismissable per warning+model in localStorage. New: `useLLMProbe` hook, `LLMProbeAside` component, `api.llmProbe()` wrapper. +8 vitest.

### Background-cost master flags
- **`aie_enabled` master flag, OFF by default** (`9a6991c`): single switch gates the 12-module Adaptive Intelligence Engine at every per-turn call site (server.py chat handlers + context_assembler.py memory post-processors). User-triggered endpoints (trends, topics, milestones, journal, self-critique, feedback, finetune) intentionally NOT gated. +10 pytest.
- **`bond_xp_enabled` master flag, OFF by default** (`7042dd9`): gates per-turn `add_bond_xp` / `record_xp_event` / `check_and_record_unlocks` grants in non-stream + stream chat handlers via a `_BondGateClosed` sentinel exception. Prevents surprise milestone modals if the BondPill UI is ever re-enabled. +10 pytest.

### v1-Lite declutter cuts
- **Footer chrome strip** (`e536c3e`, −194 LOC): segmented chip pill (Brief/Off/18+RP), Italic icon, Web Speech dictation, Voice-First Radio, Full-duplex Phone all deleted from the chat composer. Final footer = composer input + push-to-talk Mic + Send. Ctrl+I + Ctrl+Shift+V keyboard shortcuts still work.
- **Theme picker 27 → 4** (`78796ee`): `FEATURED_THEME_IDS = ['dark', 'light', 'sakura-custom', 'midnight']` shown by default in the picker, the other 23 behind a "Show N more themes" expander. Auto-expand when active preset is non-featured.
- **Girly + Neon archive (light-touch)** (`e7f4786`): `/api/frontend` GET advertises only Sakura + Nova; `default_frontend` flipped to ``sakura`` at all three call sites. Route handlers + dist directories left in place per CLAUDE.md "never delete endpoints". `test_root_defaults_to_neon` → `test_root_defaults_to_sakura` + new fallback test.

### Settings 3-layout refactor
- **Settings — 3 user-selectable layouts** (`9732f44`, +335/−74 LOC): replaced the 11-tab bar with three layouts the user can switch between live: Anchor (sticky pill nav + collapsible section column, default), Collapsibles (no nav, vertical list), Sidebar (2-column flex). Switcher lives in General → "Settings Layout". `renderSectionContent(id)` extracted as the shared content renderer so adding a section is one switch case, not three branches.

### Regression-test pins
- **Overlay mutex contract** (`6dffef7`, +65 LOC): 5 vitest cases pinning that Settings + Memory Browser can never both be open at once. The `activeOverlay` state machine already enforced this; the tests prevent future refactors from silently re-introducing parallel side drawers.

### Bond burn-down (~−4,750 LOC across 3 commits)
- **`f121280` — BondPill component** deleted. The Lv/XP/tier/streak strip from the chat header was already hidden behind `false &&` since session 46. Deletion cascade: BondPill.tsx (485 LOC), BondPill.format.test.tsx (103 LOC), the import + JSX in StatusBar.tsx, the unused IDLE_PHRASES + idlePhrase rotation effect + bondLevel/bondXp/bondTier/bondXpToNext/bondNextUnlock useAppStore destructure.
- **`7a38ce8` — 3 celebration popups** deleted: MilestoneCelebration (affinity-tier-advance), LevelUpCelebration (bond-level-up), AchievementToast (XP/streak toast). Also removed: affinity polling block + useMilestoneDetection hook from App.tsx + MobileApp.tsx. −1,244 LOC.
- **`6ebbed0` — 6 bond panels** deleted: BondPanel + 5 children (BondProgressBar, BondTimeline, BondStoryCard, BondStoryViewer, MilestoneTimeline). Alt+Shift+H keyboard shortcut + the "Bond Panel" / "Milestones" CommandPalette entries removed. −2,897 LOC.

### Held back (intentional)
- Bond store fields + `useBondProgress` hook STAY — Kokoro NSFW Tier F gate reads `bondLevel` (≥20).
- `pendingLevelUp` / `pendingAchievement` store fields stay dormant — producers in chatStore / DialogueBubble / useFullDuplexVoice / useBondProgress still write to them; removing is a cross-file refactor for its own commit.
- Backend bond modules + `/api/bond/*` endpoints stay per CLAUDE.md rule.

### Skipped (with reason)
- #5 Settings drawer clipping — needs Chrome to reproduce.
- #9 Rin-chan post-process regex — conditional ("only if model still ignores the identity rule"); no fresh observation this session.
- #11 AIE 12 modules architecture rethink — half-day exploratory, deferred.
- #13 NSFW endpoint cleanup — conflicts with CLAUDE.md "never delete existing endpoints"; needs explicit override.
- #14 server.py refactor — multi-session, sensitive, plan first.

### Session totals
- **11 commits**, all pushed to origin/master. HEAD = `6ebbed0`.
- Net diff: **+1,951 / −5,287 LOC** across 35 files. **21 new pytest** (2956 → 2977), final vitest 326 (was 317; +13 added, −4 from BondPill deletion). TSC clean.
- No schema migration. v85 unchanged.
