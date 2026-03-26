# Current Project Status

**Last updated:** 2026-03-25 16:00 PDT
**Branch:** master
**Schema version:** v60
**Tests:** 887 passing (backend pytest), tsc clean (frontend)
**Plan file:** `/Users/chris/.claude/plans/woolly-foraging-globe.md` (Workflow overhaul + Phase 20B)

## Completed This Session (Mar 25) — 5 commits

| Commit | Phase | What |
|--------|-------|------|
| `7d394ce` | 18C-D | Content gating frontend UI + legacy migration (schema v59) |
| `9fe3bf1` | 17 | Animation library expansion + sequencer + state machine v2 |
| `b03fcae` | 19 | On-device learning — signals, behavior, privacy (schema v60) |
| `426f48f` | 20A | Model catalog (24 LLMs, 10 TTS, 6 STT) + workflow research |

## Completed Previous Sessions

| Commit | Phase | What |
|--------|-------|------|
| `7121ae0` | 15A-B | Embedding provider abstraction + semantic lore matching (schema v57) |
| `fbec7d6` | 15C | Server integration wiring + semantic topic-shift detection |
| `4a93b2d` | 18A | Content gating — types, ceiling resolver, intimacy tracking, prompts |
| `9ab6605` | 18B | Wire content gating into chat pipeline + intimacy per turn (schema v58) |

## Completed Previous Sessions (Mar 20-21, 2026)

See `git log` for full history. Key highlights: Phases 1-3, 6, 9A-E, 11A, 12-P1 through P5, 13A-B, 14A-B, 3B all complete.

## Phase Completion Status

| Phase | Status | Category |
|-------|--------|----------|
| Phase 1 | ✅ DONE | Proactive AI Messages |
| Phase 2 | ✅ DONE | Context Assembler improvements |
| Phase 3 | ✅ DONE | Advisor agent + AGENTS.md overhaul |
| Phase 4 | NOT STARTED [POST-MVP] | /plan skill + workflow polish |
| Phase 5 | SCHEMA ONLY [POST-MVP] | Outfit system (UI deprioritized) |
| Phase 6 | ✅ DONE | Edge case fixes (5 bugs) |
| Phase 7 | RESEARCH ONLY | 3D Immersion research + roadmap |
| Phase 8 | RESEARCH ONLY | Retention + immersion gap analysis |
| Phase 9A-C | ✅ DONE | Adaptive Intelligence Engine |
| Phase 9D-E | ✅ DONE | Trust/mood updates + topic steering |
| Phase 10 | NOT STARTED [POST-MVP] | Model Asset Spec document |
| Phase 11A | ✅ DONE | Environment poses + lighting (Three.js) |
| Phase 11B | NOT STARTED [POST-MVP] | Unity Premium renderer |
| Phase 12-P1 | ✅ DONE | Breathing, blinking, saccades, hair physics |
| Phase 12-P2 | ✅ DONE | Micro-expressions, emotion body language |
| Phase 12-P3 | ✅ DONE | Touch interaction, cinematic camera |
| Phase 12-P4 | ✅ DONE | Anime shaders, backgrounds, particles |
| Phase 12-P5 | ✅ DONE | Sound design + ambient audio |
| Phase 12-P6 | NOT STARTED [POST-MVP] | Webcam face/hand tracking |
| Phase 13A | ✅ DONE | Bond progression + gifts + story scenes |
| Phase 13B | ✅ DONE | Character journal + memory transparency |
| Phase 13C | NOT STARTED [POST-MVP] | Community character gallery |
| Phase 13D | NOT STARTED [POST-MVP] | Extension API + marketplace |
| Phase 14A | ✅ DONE | Research Cycle 2 source collection (24 ranked) |
| Phase 14B | ✅ DONE | Research Cycle 2A deep-dives (12 sources) |
| Phase 15 | ✅ DONE | Embedding provider abstraction + semantic lore |
| Phase 16 | NOT STARTED | AI model ecosystem analysis |
| Phase 17 | ✅ DONE | Animation library + sequencer + state machine v2 |
| Phase 18A-B | ✅ DONE | Content gating backend (types + pipeline + intimacy) |
| Phase 18C-D | ✅ DONE | Content gating frontend UI + legacy migration (schema v59) |
| Phase 19 | ✅ DONE | On-device learning — signals, behavior, privacy (schema v60) |
| Phase 20A | ✅ DONE | Model catalog (24 LLMs, 10 TTS, 6 STT) + model recommendations |
| Phase 20B | NOT STARTED | README updates + FEATURES.md |

## Next 3 Tasks (Priority Order)

1. **Workflow Overhaul** — Domain rules, feature masterlist, enhanced checkpoint, research policy (plan: woolly-foraging-globe.md)
2. **Phase 16** — AI model ecosystem analysis
3. **Phase 4** — /plan skill + workflow polish (POST-MVP)

## Estimate vs Actual (AI-Assisted Dev)

| Phase | Plan Estimate | Actual | Ratio | Notes |
|-------|--------------|--------|-------|-------|
| 12-P1 | 1.5w (11h proto) | ~1h | 1/11 | Breathing, blinks, saccades |
| 12-P2 | 1.5w (10.5h proto) | ~40min | 1/16 | Micro-expressions |
| 12-P3 | 1.5w (11h proto) | ~1h | 1/11 | Touch + camera presets |
| 12-P4 | 2w (21h proto) | ~45min | 1/28 | Shaders, gradients, particles |
| 13A | 3.2d (19h proto) | ~1.5h | 1/13 | Bond progression |
| 13B | 1.4d (8.5h proto) | ~30min | 1/17 | Character journal |
| 12-P5 | 1w (8h proto) | ~15min | 1/32 | Procedural audio engine |
| 11A | 3w (14h proto) | ~20min | 1/42 | Poses + lighting (no Blender!) |
| 3B | 1.5d (5h proto) | ~10min | 1/30 | Hair + eye shaders |

**Calibration factor: divide traditional estimates by ~12 for AI-assisted time.**

## Key Architecture

- `backend/embeddings/` — provider.py (EmbeddingProvider protocol, MiniLM + Gemma)
- `backend/content/` — types.py, gating.py, intimacy.py, prompts.py, bridge.py (Content Gating)
- `backend/adaptive/` — reflector.py, tuner.py, journal.py (Adaptive Intelligence)
- `backend/bond/` — progression.py, gifts.py, seed_data.py (Bond Progression)
- `backend/server.py` — FastAPI server (~13K lines, all API endpoints)
- `frontends/shared/viewer/viewer.html` — 3D viewer (5,700+ lines)
- `docs/design/competitive-research-2026-03-18.md` — 34-source competitive analysis
