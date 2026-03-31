# Current Project Status

**Last updated:** 2026-03-30
**Branch:** master
**Schema version:** v63
**Tests:** 2144 passing (backend pytest), tsc clean (frontend)

## Active Work

NSFW Phases 1-8 shipped. Phase 9 (Polish & Extras) or frontend components next.

## Completed This Session (Mar 28, session 3)

| What | Details |
|------|---------|
| **NSFW Phase 1: Foundation** | F40 Boundaries, F13 Writing Styles, F15 Sensory Profiles, F30 Pet Names — full stack (backend + migration v61 + API + context wiring + frontend) |
| **NSFW Phase 2: State Machines** | F17 Arousal Engine, F6 Pacing Engine, F16 Scene Phases, F10 Consent — backend + context wiring |
| **NSFW Phase 3: Scene Architecture** | F32 Power Dynamics, F38 Intimate Director, F8 NSFW Scenarios (19 templates), F25 Touch Protocol — backend + API + context wiring |
| **Dev Tooling** | `./run.sh check` (one-command smoke test), `./run.sh dash` (open dashboard), dev panel on localhost:3333 |
| **Favicon** | Pixel waifu favicon deployed to Sakura + Neon frontends |
| **Settings cleanup** | Local settings.json trimmed from 148 → 0 permissions (global wildcards cover all) |
| **QUICKSTART.md** | One-page dev cheatsheet at docs/QUICKSTART.md |

## NSFW Mega-Sprint Progress

| Phase | Status | Features | Tests Added |
|-------|--------|----------|-------------|
| **Phase 1: Foundation** | ✅ COMPLETE | F40 Boundaries, F13 Writing Styles, F15 Sensory, F30 Pet Names | +146 |
| **Phase 2: State Machines** | ✅ COMPLETE | F17 Arousal, F6 Pacing, F16 Scene Phases, F10 Consent | +113 |
| **Phase 3: Scene Architecture** | ✅ COMPLETE | F32 Power Dynamics, F38 Director, F8 Scenarios, F25 Touch | +112 |
| **Phase 4: Memory & Milestones** | ✅ COMPLETE | F1 Milestones, F2 Intimate Memory, F5 Aftercare, F12 Pillow Talk | +120 |
| **Phase 5: Emotional Continuity** | ✅ COMPLETE | F3 Morning After, F34 Confessions, F43 Post-Scene Mood, F45 Midnight Mode, F11 Fantasy Journal, F39 Desires | +126 |
| **Phase 6: Voice & Audio** | ✅ COMPLETE | F4 Voice Intimacy, F33 Audio Stories, F36 Quickfire, F46 Love Letters | +70 |
| **Phase 7: Visual & Image Gen** | ✅ COMPLETE | F29 Image Gen, F42 Gallery, F28 NSFW Portraits, F19 Arousal Visuals, F27 Whisper Mode | +34 |
| **Phase 8: Deep Personalization** | ✅ COMPLETE | F35 Scene Replay, F37 Fantasy Personas, F47 Shared Fantasy, F31 Jealousy, F41 Body Language, F44 Erogenous Map, F22 Intimate Quiz | +37 |
| **Phase 9** | PLANNED | Clothing system, preference discovery, multi-session arcs, advanced features | — |

## Completed This Session (Mar 30, session 2)

| What | Details |
|------|---------|
| **NSFW Phase 5: Emotional Continuity** | F3 Morning After, F34 Confessions, F45 Midnight Mode, F39 Desires, F43 Post-Scene Mood, F11 Fantasy Journal — schema v63 |
| **NSFW Phase 6: Voice & Audio** | F4 Voice Intimacy, F33 Audio Stories, F36 Quickfire, F46 Love Letters |
| **NSFW Phase 7: Visual & Image Gen** | F29 Image Gen, F42 Gallery, F28 NSFW Portraits, F19 Arousal Visuals, F27 Whisper Mode — schema v64 |
| **NSFW Phase 8: Deep Personalization** | F35 Scene Replay, F37 Fantasy Personas, F47 Shared Fantasy, F31 Jealousy, F41 Body Language, F44 Erogenous Map, F22 Intimate Quiz |
| **Tests** | +267 new (2144 total), all passing, tsc clean |

## Completed This Session (Mar 30, session 1)

| What | Details |
|------|---------|
| **NSFW Phase 4: Memory & Milestones** | F1 Milestone Tracker (11 types, regex detection, 13 character voices, anniversary schedule), F2 Intimate Memory (sensory anchors, context-matched recall, frequency limiting), F5 Aftercare Engine (6 personality variants, 5-phase dialogue, phrase banks), F12 Pillow Talk (9-topic taxonomy, whispered register, character prefs, sleepiness fade) |
| **Schema v62** | 3 new tables: intimate_milestones, intimate_memories, post_scene_states |
| **Context injection** | 4 new blocks in server.py (milestones, memory, aftercare, pillow talk) |
| **API endpoints** | GET milestones, GET/DELETE intimate-memories, GET post-scene-status |
| **Tests** | +120 new (1877 total), all passing, tsc clean |
| **Workflow improvement** | New memory rule: plans MUST include Research & Documentation References section |

## Previous Sessions

| Session | What |
|---------|------|
| Mar 29 session 3 | Research expansion (142k words, 26 part files), NSFW Phase 4 + Frontend UX research |
| Mar 28 session 2 | P5 Memory Browser, P2 Context Viewer |
| Mar 27-28 session 1 | NSFW plan v2 + v3 enhancement (6,006 lines) |

## Next Tasks (Priority Order)

1. **NSFW Phase 9: Polish & Extras** — F24 Clothing System, F7 Preference Discovery, F26 Progressive Reveal, etc. Plan at `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` line ~4380.
2. **Frontend components for Phases 1-8** — All NSFW backend features need UI. Pacing picker, scenario browser, power dynamics, desire tree, fantasy journal, morning-after, voice intimacy, quickfire toggle, love letter card, audio story player, gallery viewer, persona picker, jealousy settings, whisper mode toggle. Build UI before testing.
3. **Adaptive Intelligence Engine** — #1 priority new feature. Context classifier, dynamic LLM param tuning, extended user model, over-personalization gate. Spec: `docs/plans/2026-03-29-adaptive-intelligence-spec.md` (Phase A: 23-34h, Phase B: 52-72h, Phase C: 54-76h).
4. **Bond Progression System** — #1 retention driver. Quadratic XP curve, 5-tier unlocks, milestone celebrations, bond-gated dialogue shifts. Existing v56 schema to extend. Spec: `docs/plans/2026-03-29-bond-progression-spec.md` (42-58h, 6 phases).
5. **Humanoid Motion Quality** — Springs/easing, follow-through, VRMLookAt, bone masks, procedural gestures, CoG. The "character feels alive" system. Spec: `docs/plans/2026-03-29-humanoid-motion-spec.md` (83-130h, 6 phases). Research: `docs/research/2026-03-29-humanoid-motion-research.md`.
6. **Spring Bones 3D** — Quick win: strip Mixamo spring bone tracks + delta time clamp (1.5h). Full: capsule colliders, per-character presets, tuning UI, emotion-reactive physics. Spec: `docs/plans/2026-03-29-spring-bones-spec.md` (16.5h, 5 phases).
7. **Jiggle Physics** — Breast/butt/thigh physics via VRM spring bones. 5 intensity tiers, per-character profiles, content-gated by NSFW mode. Spec: `docs/plans/2026-03-29-jiggle-physics-spec.md` (15-21h, 6 phases). Research: `docs/research/2026-03-29-jiggle-physics-research.md`.
8. **Model Marketplace Expansion** — CC0 VRM catalog, drag-and-drop import, VRoid Hub API, license badges, Cubism Core auto-download. Builds on existing ModelBrowser. Spec: `docs/plans/2026-03-29-model-marketplace-spec.md` (25-32h, 6 phases).
9. **Privacy-First Sync** — WAL checkpoint on shutdown, Syncthing + .stignore, restic encrypted backups. Spec: `docs/plans/2026-03-29-privacy-sync-spec.md` (~6h, 2 phases).
10. **Full browser test sweep** — One big pass after all UI is built. Test list below.

### Browser Test Sweep Checklist

| Feature | Area | What to verify |
|---------|------|---------------|
| NSFW Phase 1-3 panels | Settings/Chat | Boundaries panel, writing style picker, sensory vocab, pet names |
| P5 Memory Browser | Panel | View/edit/delete character memories |
| P2 Context Assembly Viewer | Dev panel | Token counts, color-coded sections |
| Phase 2-3 frontend (new) | Settings/Chat | Pacing mode picker, scenario templates, power dynamics |
| Director Mode commands | Chat input | `/direct` commands parse and execute |
| Scenario Templates | Chat picker | Template browser, selection, generation |
| Relationship State display | Sidebar | Bond level, mood, affinity rendering |
| Voice Pipeline (VoiceOrb) | Chat area | Record, send, playback, barge-in |
| Live2D model picker | Viewer | Browse, select, load Live2D models |
| Expression Portraits | Chat/sidebar | AI-generated portraits display correctly |
| Character Card Import/Export | Settings | SillyTavern card import + export |
| Model Browser (avatar download) | Overlay | Browse, download, manage VRM avatars |
| Settings modal (all tabs) | Modal | Every tab renders, saves, persists |
| 18 themes switching | Global | All 9 light + 9 dark themes apply correctly |

## Completed This Session (Mar 29, session 3)

| What | Details |
|------|---------|
| **Research expansion** | All 8 research files expanded to 15-20k words each (~142k total). Split into 26 part files (<1000 lines each) for Claude Code compatibility. |
| **New research (2 files)** | NSFW Phase 4 (milestones, intimate memory, aftercare, pillow talk) + NSFW Frontend UX (pacing picker, scenario browser, power dynamics, ambient effects, safety) |
| **Workflow rule** | Research ↔ spec bidirectional linking enforced — saved to memory |
| **Memory rule** | `_BACKUP_ROOT/` is sacred — never delete contents, only move files into it |

## Completed Session (Mar 29, session 2)

| What | Details |
|------|---------|
| **Git cleanup** | 6 commits: gitignore expansion, frontend rebuild, Alana + Dae docs, proactive module, plans/research/design docs, status update |
| **Disk cleanup** | ~1.29 GB freed (pycache, stale worktree, pytest cache) |
| **Gitignore expansion** | 8 new rules: db backups, user images, tsbuildinfo, root package-lock, unity, e2e screenshots, character zips, artifacts/ |
| **Research (5 topics)** | Adaptive intelligence, bond progression, model marketplaces, privacy sync, spring bones 3D |
| **Implementation specs (5)** | Actionable specs with phases, file paths, schema SQL, API routes, effort estimates for all 5 research topics |

## Quick Reference

| Resource | Path |
|----------|------|
| NSFW plan (implementation ref) | `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` |
| Adaptive intelligence spec | `docs/plans/2026-03-29-adaptive-intelligence-spec.md` |
| Bond progression spec | `docs/plans/2026-03-29-bond-progression-spec.md` |
| Spring bones spec | `docs/plans/2026-03-29-spring-bones-spec.md` |
| Model marketplace spec | `docs/plans/2026-03-29-model-marketplace-spec.md` |
| Privacy sync spec | `docs/plans/2026-03-29-privacy-sync-spec.md` |
| Humanoid motion spec | `docs/plans/2026-03-29-humanoid-motion-spec.md` |
| Jiggle physics spec | `docs/plans/2026-03-29-jiggle-physics-spec.md` |
| Research docs | `docs/research/2026-03-29-*-part-*.md` (26 files, ~142k words) |
| NSFW Phase 4 research | `docs/research/2026-03-29-nsfw-phase4-research-part-*.md` (3 parts) |
| NSFW Frontend UX research | `docs/research/2026-03-29-nsfw-frontend-ux-research-part-*.md` (3 parts) |
| Dev dashboard | `http://localhost:3333/dashboard.html` or `./run.sh dash` |
| Quickstart cheatsheet | `docs/QUICKSTART.md` |
| Convention guides | `docs/conventions/*.md` |
