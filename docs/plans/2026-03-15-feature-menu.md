# Feature Menu — Everything We Can Build Next

> **Date:** 2026-03-15 (Updated 2026-03-17)
> **Status:** Reference document — no code changes.
> **Context:** 16-feature roadmap complete, 3D pipeline complete, desktop pet complete, all competitive analysis done. This is the consolidated decision menu for what to build next.

---

## Quick Reference — Priority Tiers

| Tier | Description | Total | Done | Remaining |
|------|-------------|-------|------|-----------|
| **T0** | Quick Wins (< 1 day, high impact) | 8 | **8** | 0 |
| **T1** | High Impact, Medium Effort (1–3 days) | 9 | **6** | 3 |
| **T2** | Major Features (3–7 days) | 7 | **1** | 5 |
| **T3** | Major Projects (1–2 weeks) | 4 | 0 | 3 |
| **Design-Ready** | Design doc exists, no planning needed | 2 | 0 | 2 |
| **Stubbed** | Partial code exists, needs finishing | 5 | **3** | 2 |
| **Killed/Deferred** | User rejected or paused | 6 | — | — |

---

## Section 1: The 13 Future-Vision Ideas — Status Dashboard

Source: `docs/plans/2026-02-28-future-vision-ideas.md`

| # | Idea | Status | Effort | User Notes |
|---|------|--------|--------|------------|
| 1 | AI Music Generation | ⏸️ Deferred | L (8–9d) | "not right now" |
| 2 | ASMR & Ambient Voice | ❌ Killed | M-L (5–8d) | "not important" |
| 3 | Music Listening Together | ✅ Available | L (7–10d) | Spotify/local, avatar reacts to beats |
| 4 | Emotion Mirroring via Webcam | ❌ **KILLED** | — | User rejected permanently (2026-03-17). Never implement. |
| 5 | Game Spectator & Coach | ✅ **DONE** (Part 9) | — | Schema v37, `backend/spectator/*` |
| 6 | VTuber Co-Host Mode | ✅ Available | XL (6–8d) | Twitch IRC, OBS overlay |
| 7 | Phone Companion (PWA) | ❌ **KILLED** | — | Desktop-only app. No mobile/tablet. |
| 8 | Smart Home Integration | ✅ Available | M (5–7d) | Home Assistant REST API |
| 9 | Character Marketplace | ✅ Available | XL (8–12d) | Community hub, card sharing |
| 10 | Multi-Character Group Chat | ⏸️ Deferred | XL | "only if specifically asked" |
| 11 | Character Visiting | ✅ Available | L (7–10d) | Cross-user character exchange |
| 12 | Dynamic Scene Backgrounds | ⏸️ Deferred | M | "meh" |
| 13 | Seasonal Events | ❌ Killed | — | "bad idea" |

**Available to build now: #3, #6, #8, #9, #11** (5 of 13)

---

## Section 2: Incomplete / Stubbed Features in the Codebase

These have existing code that's partially done or disabled:

| Feature | Location | What's Missing | Effort |
|---------|----------|---------------|--------|
| **Soundscape Player** | `SoundscapePlayer.tsx`, `ambientAudio.ts` | ✅ **DONE** — Procedural Web Audio API generation for all 5 tracks (Café, Rain, Lo-Fi, Forest, City). No audio files needed. | — |
| **Character Portfolio Export** | `CharacterPortfolioCard.tsx` | ✅ **DONE** — html2canvas export implemented. | — |
| **VRoid Hub Integration** | `avatar_browser.py:6` | Phase 2 stub — OAuth 2.0 flow for VRoid Hub VRM downloads not implemented. | M (2–3d) |
| **MotionLCM AI Animation** | `motion_server.py:237` | AI motion generation commented out, falls back to procedural keyframes. Needs model download + inference wiring. | M (2–3d) |
| **Desktop Pet Mute State** | `PetView.tsx` | ✅ **DONE** — Mute state wired through appStore + IPC. | — |

---

## Section 3: New Feature Ideas from HuggingFace Discoveries

### A. Local TTS Provider Expansion (M, 3–4 days)
Add new TTS backends beyond Kokoro and Chatterbox:
- **Fish Audio s2-pro** — high-quality voice cloning, FP8 available
- **Dia-1.6B** (nari-labs) — dialogue-aware TTS with different intonation per speaker
- **Qwen3-TTS-12Hz-1.7B** — Qwen's TTS with custom voice design capabilities
- **F5-TTS** (SWivid) — strong open-source TTS
- **IndexTTS-2** — another quality option

Files: `backend/tts/providers/`, `backend/server.py`, settings UI

### B. Local STT / Offline Voice (M, 3–4 days)
Replace cloud-dependent Whisper with local models for fully offline voice:
- **Qwen3-ASR-0.6B** — tiny (0.6B), fast, runs on CPU
- **nvidia/parakeet-tdt-0.6b-v3** — NVIDIA's streaming ASR
- **whisper.cpp** (ggerganov) — C++ whisper, very fast on CPU
- **faster-whisper** (Systran) — CTranslate2 optimized Whisper

Files: `backend/voice/stt_local.py`, `backend/voice/duplex.py`

### C. Emotion-Aware TTS (S-M, 2–3 days)
- **HumeAI/tada-1b** — speech synthesis that conveys emotion through vocal quality
- Could replace or supplement the existing VoiceModulator's parameter-based approach
- Instead of just adjusting pitch/rate, generate speech that inherently *sounds* sad/happy/etc.

### D. AI Character Card Generator (M, 3–4 days)
- **nvidia/personaplex-7b** — generates detailed persona descriptions from a few traits
- "I want a shy bookworm who secretly loves punk rock" → full character bible
- Could power a "Create Character" wizard in the app

### E. Local Image Generation (L, 5–7 days)
- **SDXL** or **Z-Image-Turbo** (Tongyi-MAI) for generating:
  - Expression portraits (A5 feature uses cloud API currently)
  - Scene backgrounds
  - Character art from description
- **LTX-2.3** — video generation for short character animation clips

### F. Speaker Diarization for Multi-Voice (S, 1–2 days)
- **pyannote/speaker-diarization-3.1** — distinguish who's speaking
- Useful if Multi-Character Group Chat (#10) ever gets built
- Also useful for voice conversations where user has background noise/other people

---

## Section 4: Competitor-Inspired Features Worth Stealing

Source: `docs/plans/2026-03-15-competitor-analysis-feature-gaps.md`

| Feature | From | Effort | Value |
|---------|------|--------|-------|
| **Regex Scripts / Output Formatting** | SillyTavern, RisuAI | — | ✅ **DONE** — `backend/llm/output_formatter.py` |
| **Swipe for Alternatives** | Character.AI, SillyTavern | — | ✅ **DONE** — Branch navigation (click-based, desktop-only) |
| **Character Card PNG Export** | SillyTavern/TavernAI | — | ✅ **DONE** — PNG-embedded character card export |
| **Proactive AI Messages** | Open LLM VTuber | M (3–4d) | Character initiates conversation based on time, mood, or events |
| **Daily Interaction Rewards** | Moescape | — | ✅ **DONE** — `StreakBadge.tsx`, streak tracking in StatusBar |
| **Outfit / Costume System** | Moescape, VTuber apps | M (3–4d) | Multiple outfits per character, unlock/switch, seasonal costumes |
| **Voice Cloning from Sample** | Moescape, ElevenLabs | M (3–4d) | Upload voice sample → clone for TTS (Fish Audio s2-pro enables this locally) |
| **Prompt Template Macros** | RisuAI | — | ✅ **DONE** — `backend/llm/macro_expander.py` |
| **Multi-User / Friend Sharing** | Agnai | L (5–7d) | Multiple users can share a server, each with their own characters/conversations |
| **Memory Visualization** | Agnai "book" view | S-M (2–3d) | Visual representation of what the AI remembers about you, editable |
| **Groq ASR (free STT fallback)** | Riko Project | S (1–2d) | Free cloud Whisper API with context hints for name accuracy |

---

## Section 5: Design Docs Ready to Build (No Planning Needed)

| Feature | Design Doc | Effort | Description |
|---------|-----------|--------|-------------|
| **Super Off-Road Racing** | `2026-02-27-super-offroad-racing-game-design.md` | L (5–7d) | Canvas 2D racer, AI opponent, commentary, upgrades |
| **Emulator Integration** | `2026-02-27-emulator-gaming-integration-design.md` | XL (8–12d) | PS1/PS2 in-app via EmulatorJS, AI reads game memory |

---

## Section 6: Specific Project Status

### PokeRogue — DONE (via Game Spectator, Part 9)

PokeRogue is the **example target game** for the Game Spectator system. The system works with ANY browser game:
- `backend/spectator/analyzer.py` — VLM frame analysis
- `backend/spectator/input_controller.py` — Playwright browser automation for AI-plays mode
- `backend/spectator/memory.py` — Game session history + memorable moments
- `frontends/sakura/src/components/SpectatorPanel.tsx` — Game Companion tab UI
- `frontends/sakura/src/components/SpectatorBubble.tsx` — Floating reaction bubbles

There is NO dedicated PokeRogue mini-game. The spectator watches you play via screen capture + VLM.

### Racing Game — DESIGN ONLY, NOT BUILT

Design doc: `docs/plans/2026-02-27-super-offroad-racing-game-design.md`
- Super Off-Road spiritual successor, Canvas 2D + vanilla JS
- Self-contained in `frontends/shared/racing/racing.html`
- AI companion races against you + provides commentary
- 10 weapons, 3 tiers, mystery boxes, upgrade shop
- **Status: implementation deferred — build as a dedicated session**

### three.js-animation-blending Project — ARCHIVED

Located at `/Users/chris/Code/three.js-animation-blending`. Earlier standalone prototype for AI-driven VRM animation. Key unrealized value is the **MoMask inference pipeline** (AI motion generation from text), which maps to the MotionLCM stub in `motion_server.py:237`. Low priority — procedural animation works well for companion use.

---

## Section 7: Priority Tiers — What to Build Next

### Tier 0: Quick Wins — ALL COMPLETE

| # | Feature | Source | Status |
|---|---------|--------|--------|
| 1 | Desktop Pet Mute State | Codebase stub | ✅ DONE |
| 2 | Character Portfolio Export | Codebase stub | ✅ DONE (html2canvas) |
| 3 | Swipe for Alternatives (Branch Nav) | Competitor (Character.AI) | ✅ DONE (click-based) |
| 4 | Prompt Template Macros | Competitor (RisuAI) | ✅ DONE (`macro_expander.py`) |
| 22 | Content Rating System for Models | AnimeGirly handoff | ✅ DONE |
| 23 | Quality Ratings per Model (4-Axis) | AnimeGirly handoff | ✅ DONE |
| 24 | GGUF Quantization Reference | AnimeGirly handoff | ✅ DONE |
| 25 | Stream Reset Sentinel | AnimeGirly handoff | ✅ DONE |

### Tier 1: High Impact, Medium Effort (1–3 days)

| # | Feature | Source | Status |
|---|---------|--------|--------|
| 5 | Groq ASR Integration | Riko analysis | Available (1–2d) |
| 6 | Soundscape Player Assets | Codebase stub | ✅ DONE (Web Audio API procedural) |
| 7 | Regex Output Formatting | Competitor (SillyTavern) | ✅ DONE (`output_formatter.py`) |
| 8 | Daily Interaction Rewards | Competitor (Moescape) | ✅ DONE (`StreakBadge.tsx`) |
| 9 | Character Card PNG Export | Competitor (SillyTavern) | ✅ DONE |
| 10 | Local STT (whisper.cpp / Qwen3-ASR) | HuggingFace | Available (3–4d) |
| 26 | Expanded Model Catalog (30+ RP/Anime Models) | AnimeGirly handoff | ✅ DONE (36 models) |
| 27 | Director Mode (Dual-Layer OOC Directions) | AnimeGirly handoff | ✅ DONE |
| 28 | Anime-Specific TTS/STT Adapters | AnimeGirly handoff | Available (2–3d) |

### Tier 2: Major Features (3–7 days)

| # | Feature | Source | Status |
|---|---------|--------|--------|
| 11 | Proactive AI Messages | Competitor (Open LLM VTuber) | Available (3–4d) |
| 12 | Emotion Mirroring via Webcam | Future Vision #4 | ❌ **KILLED** — user rejected permanently |
| 13 | Local TTS Expansion | HuggingFace | Available (3–4d) |
| 14 | Super Off-Road Racing Game | Design doc ready | Available (5–7d) |
| 15 | Smart Home Integration | Future Vision #8 | Available (5–7d) |
| 16 | AI Character Card Generator | HuggingFace (personaplex-7b) | ✅ DONE (T2-15, LLM-powered wizard) |
| 17 | Music Listening Together | Future Vision #3 | Available (7–10d) |

### Tier 3: Major Projects (1–2 weeks)

| # | Feature | Source | Status |
|---|---------|--------|--------|
| 18 | Phone Companion PWA | Future Vision #7 | ❌ **KILLED** — desktop-only app, no mobile/tablet |
| 19 | VTuber Co-Host Mode | Future Vision #6 | Available (6–8d) |
| 20 | Emulator Integration | Design doc ready | Available (8–12d) |
| 21 | Character Marketplace | Future Vision #9 | Available (8–12d) |

---

## Section 8: Our Competitive Advantages (Nobody Else Has)

These are unique differentiators — no direct competitor offers all of these together:

- 3D VRM + Live2D avatar rendering with expression automation
- Game spectator mode (screen capture + AI commentary)
- Full-duplex voice chat with VAD + barge-in
- Desktop pet mode (Electron transparent overlay)
- Emotion-driven expression portraits
- 18 built-in themes across 4 frontends (Neon, Sakura, Nova, Girly)
- Cross-frontend navigation (4-pill switcher in every frontend)
- Token-budget-aware context assembly with visual debugger
- Cinematic immersion mode + visual novel reader layout
- Mini-games (trivia, twenty questions) with in-character play
- Procedural ambient soundscapes (Web Audio API, no files needed)
- Director Mode (OOC steering of AI behavior mid-conversation)
- AI Character Generator wizard (LLM-powered character creation)

---

## Appendix: Killed / Deferred Ideas (Do Not Build Without Asking)

| Idea | Status | User Quote |
|------|--------|------------|
| ASMR & Ambient Voice | ❌ Killed | "not important" |
| Seasonal Events | ❌ Killed | "bad idea" |
| Emotion Mirroring via Webcam | ❌ Killed (2026-03-17) | User rejected permanently — never implement |
| Phone Companion PWA | ❌ Killed | Desktop-only app — no mobile/tablet, no swipe gestures |
| Native OS Notifications | ❌ Killed | User has been "very clear" about never implementing this |
| AI Music Generation | ⏸️ Deferred | "not right now" |
| Multi-Character Group Chat | ⏸️ Deferred | "only if specifically asked" |
| Dynamic Scene Backgrounds | ⏸️ Deferred | "meh" |
