# Feature Masterlist — Waifu-RT3D

**Last updated:** 2026-05-25 (session 47 — v1-Lite execution sprint + bond burn-down)
**Schema version:** v85
**Tests:** 2,977 backend pytest + 326 vitest passing, tsc clean
**Total features:** 56 (49 complete, 7 post-MVP); session-47 added 2 master kill-flags + deleted 10 bond UI components

---

## Tier S — Core Platform

*Chat, voice, memory, and LLM infrastructure. Without these, nothing else works.*

| # | Feature | Status | Phase | Schema | Commit | Notes |
|---|---------|--------|-------|--------|--------|-------|
| S-1 | Full-Duplex Voice Conversation | ✅ Done | A1 | — | `master` | WebSocket duplex, VAD, barge-in, VoiceOrb UI; `backend/voice/duplex.py` |
| S-2 | Kokoro TTS + Voice Modulation | ✅ Done | A7 | — | `master` | 16-emotion VoiceModulator, provider-aware params; `backend/tts/voice_modulator.py` |
| S-3 | Tiered Episodic Memory / sqlite-vec | ✅ Done | A3 | v30 | `master` | Three-tier memory with vector search; `backend/memory/tiered_memory.py` |
| S-4 | Context Assembler (token-budget aware) | ✅ Done | Phase 2 | — | `301009c` | Wired into production chat pipeline; `backend/llm/context_assembler.py` |
| S-5 | Smart Tool Protocol Detection | ✅ Done | C2 | v26 | `master` | `get_tool_protocol()` → openai_functions / xml_fallback / none; `backend/llm/capability_detector.py` |
| S-6 | Character Moods & Time-of-Day States | ✅ Done | A4 | v23 | `master` | MoodEngine; `backend/mood/engine.py` |
| S-7 | Companion Opening Greeting | ✅ Done | C4 | v24 | `master` | Contextual greetings on session start; `backend/greeting/generator.py` |
| S-8 | Live2D Runtime | ✅ Done | C1 | — | `master` | viewerStore mediator, pixi-live2d-display, Live2DCanvas, model picker |
| S-9 | Proactive AI Messages | ✅ Done | Phase 1 | — | `301009c` | Scheduler-driven messages without user prompt; `backend/proactive/` |
| S-10 | Smart LLM Endpoint Fallback | ✅ Done | Phase 6 | — | `ff64154` | Auto-failover between LLM providers + stream post-processing hooks |

---

## Tier A — Differentiators

*Features that make this platform meaningfully different from generic chat interfaces.*

| # | Feature | Status | Phase | Schema | Commit | Notes |
|---|---------|--------|-------|--------|--------|-------|
| A-1 | Bond Progression System | ✅ Backend / 🗑 UI gone | 13A | — | `5846453` · `7042dd9` · `f121280` `7a38ce8` `6ebbed0` | XP, tiers, gifts, story scene unlocks; `backend/bond/` exists but grants are gated behind ``bond_xp_enabled`` flag (session 47). Frontend pill / panel / 3 celebration popups deleted (session 47). bondLevel still drives Kokoro NSFW Tier F gate. |
| A-2 | Adaptive Intelligence Engine | ✅ Backend / behind flag | 9A-E | — | `301009c` · `9a6991c` | Trust model, mood updates, topic steering, behavior reflection; `backend/adaptive/`. All per-turn invocations gated behind ``aie_enabled`` master flag, OFF by default (session 47). User-triggered endpoints (trends/topics/milestones/journal) unaffected. |
| A-3 | On-Device Learning | ✅ Done | 19 | v60 | `b03fcae` | Signal capture, behavior adaptation, privacy-safe local tuning |
| A-4 | Content Gating System | ✅ Done | 18A-D | v58–59 | `9ab6605`, `7d394ce` | Types, ceiling resolver, intimacy tracking, frontend UI, legacy migration; `backend/content/` |
| A-5 | Lorebook / World Info Injection | ✅ Done | A6 | v25 | `master` | Keyword-triggered context injection; `backend/lore/matcher.py` |
| A-6 | Semantic Lore Matching | ✅ Done | 15 | v57 | `7121ae0` | Embedding provider abstraction + vector similarity lore lookup; `backend/embeddings/` |
| A-7 | User Knowledge Graph | ✅ Done | C3 | v27 | `master` | Fact extraction + persistent user model; `backend/knowledge/extractor.py` |
| A-8 | Character Journal + Memory Transparency | ✅ Done | 13B | — | `004164a` | API for inspecting what the character remembers; `backend/bond/` |
| A-9 | SillyTavern Character Card Import/Export | ✅ Done | A8 | — | `master` | PNG card read/write (V1 + V2 spec); CardImportWizard component |
| A-10 | AI-Generated Expression Portraits | ✅ Done | A5 | — | `master` | Per-emotion portrait generation via image backend |
| A-11 | Director Mode (OOC Stage Directions) | ✅ Done | T1-27 | — | `ed1e03e` | Dual-layer out-of-character stage direction injection |
| A-12 | Tiered Prompt System | ✅ Done | — | v52 | `c525e39` | CORE/EXTENDED/DEEP auto-selection by context budget; 13 characters enriched |
| A-13 | Model Catalog | ✅ Done | 20A | — | `426f48f` | 24 LLMs, 10 TTS, 6 STT with content ratings + 4-axis quality ratings |

---

## Tier B — Polish & Immersion

*Visual, audio, and interaction features that elevate the feel of the experience.*

| # | Feature | Status | Phase | Schema | Commit | Notes |
|---|---------|--------|-------|--------|--------|-------|
| B-1 | Animation Library + Sequencer + State Machine v2 | ✅ Done | 17 | — | `9fe3bf1` | Clip library, chained sequences, idle/talk/gesture/mocap states |
| B-2 | Emotion-Driven VRM Expression Automation | ✅ Done | B2 | — | `master` | LLM emotion tag → VRM morph target mapping |
| B-3 | Breathing / Blinking / Saccades / Hair Physics | ✅ Done | 12-P1 | — | `44ed169` | Procedural idle animation layer |
| B-4 | Micro-Expressions + Emotion Body Language | ✅ Done | 12-P2 | — | `81f86a3` | Random facial twitches, emotion postures |
| B-5 | Touch Interaction + Cinematic Camera | ✅ Done | 12-P3 | — | `8990eaf` | Raycasting touch zones + camera preset system |
| B-6 | Anime Shaders + Backgrounds + Particles | ✅ Done | 12-P4 | — | `57814bb`, `db5584e`, `4e74b48` | Toon/cel shading, outline, rim glow, god rays, gradient BGs, particles |
| B-7 | Procedural Character Audio + Sound Design | ✅ Done | 12-P5 | — | `466f0e9` | Ambient soundscapes, reaction SFX, per-character audio profiles |
| B-8 | Environment Poses + Time-of-Day Lighting | ✅ Done | 11A | — | `ac316e6` | Three.js procedural pose system, sunrise/day/dusk/night lighting |
| B-9 | Hair Anisotropic + Eye Sparkle Shaders | ✅ Done | 3B | — | `ed6a7f0` | Specialty VRM material shaders injected via `onBeforeCompile` |
| B-10 | Cinematic Immersion Mode | ✅ Done | B1 | — | `master` | Fullscreen no-UI mode; keyboard shortcut toggle |
| B-11 | Visual Novel Reader Layout | ✅ Done | B3 | — | `master` | Bottom-bar dialogue box layout, VN-style text rendering |
| B-12 | Author's Note | ✅ Done | B4 | v28 | `master` | Injected context note at configurable token depth |
| B-13 | Desktop Pet Mute State | ✅ Done | T0-1 | — | `a4361dc` | Electron store wired to TTS mute toggle |
| B-14 | Character Portfolio Card Export | ✅ Done | T0-2 | — | `cfd9c78` | html2canvas-based PNG export with character stats |

---

## Tier C — Infrastructure

*Migrations, tooling, detection, and developer experience.*

| # | Feature | Status | Phase | Schema | Commit | Notes |
|---|---------|--------|-------|--------|--------|-------|
| C-1 | DB Schema Migrations v3 → v60 | ✅ Done | All | v3–v60 | cumulative | `backend/preflight.py`; migrate_to_vN() chain |
| C-2 | Advisor Agent + AGENTS.md | ✅ Done | Phase 3 | — | `301009c` | Meta-agent for feature planning; `backend/agent/runner.py` |
| C-3 | Competitive Research (34 sources) | ✅ Done | 14A-B | — | `ffe4a20` | Bond patterns, content gating, animation benchmarks; `docs/design/competitive-research-2026-03-18.md` |
| C-4 | GGUF Quantization Reference Table | ✅ Done | T0-24 | — | `1c293af` | MODEL_GUIDE.md — Q4/Q5/Q8 tradeoff reference |
| C-5 | Content Ratings on All 30 Models | ✅ Done | T0-22+23 | — | `35d89c5` | 4-axis quality matrix: coherence, creativity, NSFW, speed |
| C-6 | Cross-Frontend Navigation Switcher | ✅ Done | — | — | `c18fb96` | 4-pill nav bar shared across Sakura/Girly frontends |
| C-7 | LM Studio Link + Smart Routing | ✅ Done | — | — | `master` | Multi-device discovery; `backend/llm/link_manager.py` |
| C-8 | Documentation Infrastructure | ✅ Done | — | — | `80d3ca9` | Plan naming conventions, session handoff rules, checkpoint workflow |

---

## Mini Games

*Standalone interactive experiences within the companion UI.*

| # | Feature | Status | Phase | Schema | Notes |
|---|---------|--------|-------|--------|-------|
| G-1 | Trivia Game | ✅ Done | A2 | v29 | `backend/games/trivia.py` |
| G-2 | Twenty Questions | ✅ Done | A2 | v29 | `backend/games/twenty_questions.py` |

---

## Post-MVP (Planned)

*Deprioritized or blocked. Not started unless user explicitly asks.*

| # | Feature | Priority | Dependency | Phase | Notes |
|---|---------|----------|------------|-------|-------|
| P-1 | /plan Skill + Workflow Polish | Low | — | 4 | Agentic planning mode inside companion chat |
| P-2 | Outfit System UI | Low | Schema exists (v52) | 5 | Schema-only done; picker UI deprioritized — users upload own models |
| P-3 | Model Asset Spec Document | Low | — | 10 | Formal VRM/Live2D asset requirements doc |
| P-4 | Unity Premium Renderer | Low | Phase 11A | 11B | High-fidelity render pipeline; blocked on Unity integration work |
| P-5 | Webcam Face/Hand Tracking | Medium | Phase 12 | 12-P6 | Real-time face tracking → VRM morph driver |
| P-6 | Community Character Gallery | Low | Bond system | 13C | Public character sharing; needs auth + moderation |
| P-7 | Extension API + Marketplace | Low | Phase 13C | 13D | Plugin API for third-party character/tool extensions |
| P-8 | AI Model Ecosystem Analysis | ✅ Done | Phase 20A | 16 | 5-category survey: animation, SER, RP models, physics, personalization; `docs/design/ai-model-ecosystem-analysis-2026-03-25.md` |
| P-9 | README Updates + FEATURES.md | ✅ Done | Phase 20A | 20B | Public-facing `docs/FEATURES.md` + README updates |

---

## Feature Count Summary

| Tier | Total | Done | Post-MVP / Planned |
|------|-------|------|--------------------|
| S — Core Platform | 10 | 10 | 0 |
| A — Differentiators | 13 | 13 | 0 |
| B — Polish & Immersion | 14 | 14 | 0 |
| C — Infrastructure | 8 | 8 | 0 |
| Mini Games | 2 | 2 | 0 |
| Post-MVP | 9 | 2 | 7 |
| **Total** | **56** | **49** | **7** |

---

## Schema Version Timeline

| Schema | Feature Added |
|--------|---------------|
| v23 | Character Moods + Time-of-Day States |
| v24 | Companion Opening Greeting |
| v25 | Lorebook / World Info Injection |
| v26 | Smart Tool Protocol Detection |
| v27 | User Knowledge Graph |
| v28 | Author's Note |
| v29 | Mini Games |
| v30 | Tiered Episodic Memory |
| v52 | Tiered Prompt System (system_prompt_lite column) |
| v57 | Embedding Provider Abstraction + Semantic Lore |
| v58 | Content Gating backend (types, ceiling, intimacy) |
| v59 | Content Gating frontend UI + legacy migration |
| v60 | On-Device Learning signals + behavior adaptation |

---

## Key Source Files

| Area | Primary Files |
|------|---------------|
| Backend server | `backend/server.py` (~13K lines) |
| DB migrations | `backend/preflight.py` (v3 → v60) |
| LLM adapters | `backend/llm/` — adapters, context_assembler, token_counter, capability_detector, link_manager |
| Voice | `backend/voice/duplex.py`, `backend/tts/voice_modulator.py` |
| Memory | `backend/memory/tiered_memory.py` |
| Bond | `backend/bond/progression.py`, `gifts.py`, `seed_data.py` |
| Adaptive | `backend/adaptive/reflector.py`, `tuner.py`, `journal.py` |
| Content gating | `backend/content/types.py`, `gating.py`, `intimacy.py`, `prompts.py`, `bridge.py` |
| Embeddings | `backend/embeddings/provider.py` |
| 3D viewer | `frontends/shared/viewer/viewer.html` (5,700+ lines) |
| Frontend stores | `frontends/sakura/src/stores/` — appStore, chatStore, viewerStore, wizardStore |
