# Current Project Status

**Last updated:** 2026-03-21 01:00 PST
**Branch:** master
**Schema version:** v56
**Tests:** 525 passing (backend pytest), tsc clean (frontend)

## Completed This Session (Mar 20-21, 2026) — 13 commits

| Commit | Phase | What |
|--------|-------|------|
| `301009c` | 3+6+9A-C | Adaptive intelligence engine + advisor agent + edge fixes |
| `5846453` | 13A | Bond progression — XP, tiers, gifts, story unlocks |
| `c7d934e` | bugfix | is_favorite == 1 instead of bool() |
| `44ed169` | 12-P1 | Saccades, smart blinks, micro-tremor |
| `fe6b4fd` | 9D-E | Engagement-based trust + topic steering |
| `004164a` | 13B | Character journal + memory transparency API |
| `81f86a3` | 12-P2 | Micro-expressions (random facial twitches) |
| `8990eaf` | 12-P3 | Touch raycasting + 5 camera presets |
| `4acb87f` | chore | Plan hygiene rules + /checkpoint skill |
| `57814bb` | 12-P4 | Emotion color grading, gradient backgrounds, enhanced particles |
| `db5584e` | 12-P4 | Anime outline, rim glow, god rays post-processing |
| `4e74b48` | 12-P4 | Toon/cel-shading via onBeforeCompile injection |

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
| Phase 11A | NOT STARTED [MVP] | Environment poses + lighting (Three.js) |
| Phase 11B | NOT STARTED [POST-MVP] | Unity Premium renderer |
| Phase 12-P1 | ✅ DONE | Breathing, blinking, saccades, hair physics |
| Phase 12-P2 | ✅ DONE | Micro-expressions, emotion body language |
| Phase 12-P3 | ✅ DONE | Touch interaction, cinematic camera |
| Phase 12-P4 | ✅ DONE | Anime shaders, backgrounds, particles |
| Phase 12-P5 | NOT STARTED [MVP] | Sound design, lip sync |
| Phase 12-P6 | NOT STARTED [POST-MVP] | Webcam face/hand tracking |
| Phase 13A | ✅ DONE | Bond progression + gifts + story scenes |
| Phase 13B | ✅ DONE | Character journal + memory transparency |
| Phase 13C | NOT STARTED [POST-MVP] | Community character gallery |
| Phase 13D | NOT STARTED [POST-MVP] | Extension API + marketplace |
| Phase 14 | NOT STARTED [POST-MVP] | Research Cycle 2 |

## Next 3 Tasks (Priority Order)

1. **Phase 12-P5** [MVP] — Sound design + lip sync in viewer.html + new frontend hook
2. **Phase 11A** [MVP] — Environment poses + time-of-day lighting (needs Blender assets)
3. **Task 3B** [STRETCH] — Specialty shaders (hair anisotropic, eye sparkle, skin SSS)

## Estimate vs Actual (AI-Assisted Dev)

| Phase | Plan Estimate | Actual | Ratio | Notes |
|-------|--------------|--------|-------|-------|
| 12-P1 | 1.5w (11h proto) | ~1h | 1/11 | Breathing, blinks, saccades |
| 12-P2 | 1.5w (10.5h proto) | ~40min | 1/16 | Micro-expressions |
| 12-P3 | 1.5w (11h proto) | ~1h | 1/11 | Touch + camera presets |
| 12-P4 | 2w (21h proto) | ~45min | 1/28 | Shaders, gradients, particles |
| 13A | 3.2d (19h proto) | ~1.5h | 1/13 | Bond progression |
| 13B | 1.4d (8.5h proto) | ~30min | 1/17 | Character journal |

**Calibration factor: divide traditional estimates by ~12 for AI-assisted time.**

## Plan File Location

**Full master plan:** `.claude/plans/replicated-foraging-nebula.md` (~3,400 lines, all details)

## Key Architecture

- `backend/adaptive/` — reflector.py, tuner.py, journal.py (Adaptive Intelligence)
- `backend/bond/` — progression.py, gifts.py, seed_data.py (Bond Progression)
- `backend/proactive/` — triggers.py, generator.py (Proactive Messages)
- `frontends/shared/viewer/viewer.html` — 3D viewer (5,700+ lines, all animation controllers)
- `backend/server.py` — FastAPI server (~13K lines, all API endpoints)
- `.claude/agents/` — 8 specialized agent definitions
- `docs/design/competitive-research-2026-03-18.md` — 34-source competitive analysis
