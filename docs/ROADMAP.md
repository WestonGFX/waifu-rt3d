# Waifu-RT3D — Roadmap & Progress Map

**Generated:** 2026-04-20 (Session 15)
**Current state:** Schema v70 · 2,678 backend tests · 160 frontend tests · tsc clean · 445 commits since Dec 2025
**Pre-v1.0 completion:** ~85%
**Public v1.0 release status:** achievable within 3–6 focused sessions

This document tracks the project from initial commit through public v1.0 release. It is a living artifact — regenerate when major milestones shift.

---

## Timeline at a glance

```
2025-12-09                    2026-02                   2026-04-20 (now)        v1.0 public
  │                              │                              │                    │
  ├── v5.29 INITIAL COMMIT       ├── 16-Feature Roadmap         ├── Session 15       │
  │   Voice-first AI companion   │   ✅ Phases 1-20             │   ✅ CC hygiene    │
  │   3D VRM avatar              │   ✅ Bond Progression 1-6    │   ✅ Statusline    │
  │   Local LLM via LM Studio    │   ✅ NSFW Mega-Sprint         │      fix           │
  │   Backend: Python/FastAPI    │   ✅ AIE Phases A+B           │   ⬛ Memory UI     │
  │   Frontend: Sakura (React)   │   ✅ Scenarios + Quick       │   ⬛ Visual in chat │
  │                              │      Replies                  │   ⬛ QA sweeps     │
  │                              │   ✅ Desktop Pet             │   ⬛ Release polish │
  │                              │   ✅ 3D Pipeline             │                    │
  └──────────────────────────────┴──────────────────────────────┴────────────────────┘
   4.5 months · 445 commits · ~12-15 sessions
```

---

## Phase 1: Foundation (Dec 2025 — Jan 2026)

Initial commit was already a working voice-first 3D companion — v5.29 internally. Not a greenfield project; it carried forward personality, voice, and viewer architecture from prior iterations.

**Shipped in this era:**
- Full-duplex WebSocket voice (VAD + barge-in)
- Kokoro TTS with 16-emotion VoiceModulator
- Three.js VRM viewer with emotion-driven BlendShape mixing
- SQLite with preflight migrations (schema v3 baseline)
- Local-first LLM integration (LM Studio + OpenAI-compatible)

---

## Phase 2: Core Platform (Feb 2026)

The "16-Feature Core Roadmap" era — established the differentiators that make this more than a chat UI.

| Feature | Status | Schema |
|---|---|---|
| Tiered Episodic Memory (3-tier, sqlite-vec) | ✅ | v30 |
| Character Moods + Time-of-Day States | ✅ | v23 |
| Lorebook / World Info Injection | ✅ | v25 |
| Smart Tool Protocol Detection | ✅ | v26 |
| User Knowledge Graph | ✅ | v27 |
| Author's Note | ✅ | v28 |
| Mini Games (Trivia, 20Q) | ✅ | v29 |
| Context Assembler (token-budget aware) | ✅ | — |
| Companion Opening Greeting | ✅ | v24 |
| Smart LLM Endpoint Fallback | ✅ | — |
| Live2D Runtime | ✅ | — |
| Proactive AI Messages | ✅ | — |
| 3D Pipeline (VRM, shaders, animation) | ✅ | — |
| Desktop Pet (Electron 1–5) | ✅ | — |
| Director Mode (OOC stage directions) | ✅ | — |
| Create-a-Waifu character creator | ✅ | — |

**Result:** baseline feature parity with SillyTavern + unique 3D + voice-first differentiation.

---

## Phase 3: Differentiators & Polish (Feb 2026 — Mar 2026)

The era that made this app *competitive* as a retention product.

| Track | Outcome |
|---|---|
| **Adaptive Intelligence Engine (AIE Phases A+B)** | 10 adaptive modules — context classifier, param tuner, user model, reflector, trend analyzer, topic graph, milestones, memory behavior, self-critique. 279 tests. Schema v65–v66. |
| **NSFW Mega-Sprint** | 56 features across 10 phases. Content gating system, intimacy tracking, tier-aware prompts, boundaries, writing-style presets, pet-names/private vocabulary, sensory profiles, per-character maturity ceilings. 809+ tests. Schema v61–v65. |
| **3D Pipeline polish (12-P1 through P5)** | Breathing, blinking, saccades, hair physics, touch zones, cinematic camera, anime shaders + backgrounds + particles, procedural audio, environment poses + time-of-day lighting. |
| **Tiered Prompts** | CORE / EXTENDED / DEEP auto-selection by context budget. 13 characters enriched. Schema v52. |
| **Semantic Lore + Embeddings** | MiniLM + Gemma embedding providers, vector similarity matching. Schema v57. |
| **On-Device Learning** | Signal capture, behavior adaptation, privacy-safe local tuning. Schema v60. |
| **Model Catalog** | 24 LLMs, 10 TTS, 6 STT — content ratings + 4-axis quality (coherence, creativity, NSFW, speed). Hardware-aware recommendations. |
| **SillyTavern Character Card V1/V2** | Lossless import/export PNG with embedded CHARA JSON. |

---

## Phase 4: Retention & Bond (Apr 2026)

**Bond Progression System — all 6 phases complete.** Competitive research identified bond progression as the #1 retention driver across successful companion/game apps.

| Phase | Shipped | Detail |
|---|---|---|
| 1 — XP Engine | Apr 7 | Depth multiplier (1.0–2.5×), interest match, daily/session bonuses. `backend/bond/xp_engine.py` |
| 2 — Unlocks | Apr 7 | 46-entry UNLOCK_TABLE, 5-tier model, 100 levels, quadratic curve |
| 3 — Dialogue Gates | — | Context injection: bond tier shapes tone, vocabulary, sensory detail |
| 4 — UI Components | — | BondPanel + BondTimeline + BondStoryViewer |
| 5 — Memorial Scenes | Apr 14 | 39 tier-transition vignettes (13 chars × 3 boundaries). Schema v70. |
| 6 — Analytics | Apr 14 | XP-source breakdown, session counts, tier history. DevConsole panel. |

Also in this era:
- AI Quick Replies (two-phase heuristic→LLM chip system)
- CHARA V2 compliance (schema v68, lossless import/export, scenario + post-history-instructions injection)
- Per-Character Scenarios (65 builtin templates × 13 characters, ScenarioPicker modal, schema v69)
- Competitor Gap Analysis (60+ features across 30+ platforms — `docs/research/2026-04-07-competitor-gap-analysis.md`)

---

## Phase 5: Harness & Hygiene (Apr 18–20, Sessions 14–15)

Meta-work on the development workflow itself. Not user-facing, but compounds productivity.

| Session | Outcome |
|---|---|
| 14 (Apr 18) | CLAUDE.md verification gates, Agent Dispatch Policy, `/verify-servers`, `/go` phase gates, `/qa-sweep --chunked`, `regression-guard` agent |
| 15 (Apr 19–20) | Skill consolidation (delete `/dashboard` + `/sprint`, rename `/review` → `/ui-review`, refactor `/handoff` as thin wrapper), statusline fix (cumulative-token bug), Suggestion Triggers section, Preference Forks meta-rule, new-repo-setup ritual doc |

---

## Where we are right now (2026-04-20)

- **Feature count:** 49 of 56 core features done; 7 post-MVP (5 of those deprioritized, 2 already done). Effective: **100% of the core roadmap is shipped.**
- **Tests:** 2,678 backend passing · 160 frontend passing (4 pre-existing failures: OnboardingWizard × 1, SettingsView.exportImport × 3)
- **Schema:** v70 (from v3 baseline — 67 migrations shipped cleanly)
- **Themes:** 18 (9 light / 9 dark)
- **Characters:** 13 with tiered prompts (CORE / EXTENDED / DEEP)
- **Frontends:** 3 (Neon legacy, **Sakura active**, Nova/Girly siblings)
- **Automation:** 12 agents, 22 skills, 6 rules, 8 hooks, 3 MCP servers

**Effectively post-MVP.** The "next session priorities" in MEMORY.md are polish + UX, not missing core.

---

## Gap to v1.0 public release

Four tracks left before you cut a `git tag v1.0.0`. None of them are "core platform" work — all are polish, verification, or release-ops.

### Track A — Frontend polish (the "almost done" list)

| Item | Status | Effort | Reason |
|---|---|---|---|
| **Memory Browser UI** | Backend ready, UI missing | 4–8h | Highest-impact missing UX. Users can't see/edit what a character remembers. |
| **Visual Content in Chat** | Image-gen pipeline exists, UX flow missing | 4–8h | "Character sends you a picture" — conversion of existing backend into a usable chat affordance. |
| **Per-Character Scenarios QA** | ScenarioPicker shipped, not browser-QA'd | 1–2h | `/release-test --minor` pass or manual walkthrough. |
| **Known Sakura test failures (4)** | Pre-existing, not from recent sessions | 2–4h | OnboardingWizard × 1, SettingsView.exportImport × 3 |

**Subtotal: 11–22h / 1–3 sessions.**

### Track B — Release verification

| Item | Status | Effort | Reason |
|---|---|---|---|
| `/release-test --major` pass | Not run since sessions 13–15 changes | 30–60 min (Chrome computer-use) | Validates golden path in real browser with multiple user personas. |
| `/deploy-check` clean | — | 10 min | Bundle size, git status, all-green snapshot. |
| Native module rebuild check | Not run since any Node/Python version bumps | 15 min | Guards against ABI mismatch at distribution time. |
| First-time-user install walkthrough | — | 1h | Run `./setup.sh` on a clean environment; document any snags. |

**Subtotal: 2–4h / 1 session.**

### Track C — Public release polish

| Item | Status | Effort | Reason |
|---|---|---|---|
| README v1.0 pass | Last updated for schema v60, current is v70 | 1–2h | Update badges, feature list, screenshot gallery, install instructions. |
| `docs/FEATURES.md` | Exists | 1h | Verify accurate against current state. |
| Screenshot gallery refresh | — | 1–2h | Capture current Sakura UI against representative characters + themes. |
| LICENSE review | MIT in badge, verify file | 5 min | — |
| `CHANGELOG.md` for v1.0 | — | 1h | Summarize the 4.5-month arc into user-facing release notes. |

**Subtotal: 4–6h / 1 session.**

### Track D — Optional stretch (defer past v1.0 if tight on time)

| Item | Priority | Notes |
|---|---|---|
| AIE Phase C (LoRA training + DSPy prompt optimization) | Medium | Heavy, independent, experimental. Not required for v1.0. |
| Webcam Face/Hand Tracking (post-MVP P-5) | Medium | Real-time face → VRM morph driver. Needs webcam permissions UX. |
| Community Character Gallery (post-MVP P-6) | Low | Needs auth + moderation — big scope creep. |
| Extension API + Marketplace (post-MVP P-7) | Low | Plugin API. Big scope. |

---

## v1.0.0 release checklist (minimum bar)

```
[ ] Track A complete (Memory Browser UI + Visual Content in Chat + 4 test failures fixed)
[ ] Track B complete (/release-test --major passed, deploy-check clean, install walkthrough)
[ ] Track C complete (README + screenshots + CHANGELOG)
[ ] git tag v1.0.0 → GitHub release with CHANGELOG notes + screenshots
[ ] Optional: Electron binary distribution (macOS + Windows)
```

**Realistic path:** 3–6 focused sessions. 1–2 on Track A, 1 on Track B, 1 on Track C, 1 buffer for inevitable slippage.

---

## Recommended next-session order

1. **Next session:** Memory Browser UI (Track A item 1). Single-surface React build, backend ready, highest user-visible impact. Use Claude Design for the initial mockup if you want (GHF may be a better use of free runs though).
2. **Session after:** Visual Content in Chat UX flow (Track A item 2).
3. **Session after:** Fix the 4 pre-existing frontend test failures. Run `/qa-sweep` per the Suggestion Triggers risk signals.
4. **Session after:** Track B verification — `/release-test --major`, install walkthrough, ABI rebuild check.
5. **Session after:** Track C release polish — README + screenshots + CHANGELOG.
6. **Tag v1.0.0.**

---

## Post-v1.0 stretch roadmap

| Candidate | Rationale |
|---|---|
| AIE Phase C (LoRA + DSPy) | Differentiator — on-device personalization depth none of your competitors have. |
| Touch Interaction completion | VRM poke/touch via mouse — exists in plan, not fully shipped. |
| Mobile PWA full polish | Mentioned in README; needs QA on current state. |
| Remote GPU motion server polish | Mentioned in README; production-grade verification. |
| Streaming-mode improvements (OBS overlay v2) | Streamer audience growth. |
| Community Character Gallery (with moderation story) | Network-effect feature; scope-heavy but differentiates long-term. |

---

## Regeneration

This file is a snapshot. Regenerate when a major milestone ships. Keep the "Timeline at a glance" ASCII current — it's the visual summary most useful for context restoration. Historical phases (1–4) are frozen; only Phase 5 and "Where we are now" should change between regenerations.
