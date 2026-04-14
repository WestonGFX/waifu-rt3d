# Current Project Status

**Last updated:** 2026-04-14 (per-character scenarios backend)
**Branch:** master
**Schema version:** v69
**Tests:** 2650 passing (backend pytest), tsc clean (frontend)
**Automation:** 11 agents, 24 skills, 6 rules, 8 hooks, 3 MCP servers

## Active Work

**AI Quick Replies + CHARA V2 compliance complete.** Next priorities: message swipe/regeneration (highest-impact gap), P2 character scenarios, Bond Phase 3 (dialogue gates).

## Completed This Session (Apr 7, session 11 — Quick Replies + CHARA V2 + Competitor Research)

| What | Details |
|------|---------|
| **P0: AI Quick Replies** | Two-phase heuristic→LLM chip system in ChatThread.tsx. 11 vitest tests. No backend changes. |
| **P1: CHARA V2 Compliance** | Schema v68 (7 new columns). Lossless import/export of all V2 fields. Scenario + post_history_instructions context injection. 15 pytest tests. |
| **P3: Competitor Gap Analysis** | 577-line research doc. 60+ features, 30+ platforms. Top gaps: message swipe, visual content, memory UI. |
| **Bug Fix** | test_bond_phase1 UTC date flake fixed |

## Completed This Session (Apr 7, session 10 — QA Fixes + Bond Phases 1-2)

| What | Details |
|------|---------|
| **QA Bug Fixes (4)** | I3: message copy/edit/delete actions, I8: GlobalSearch Escape, I9: motion stats fields, I10: name tooltip |
| **Bond Phase 1: XP Engine** | `backend/bond/xp_engine.py` — depth multiplier (1.0-2.5x), interest match, session/daily bonuses |
| **Bond Phase 1: Progression** | Quadratic XP curve (growth=0.3, ~361k total), 5-tier model (stranger/acquaintance/friend/close_friend/soulmate) |
| **Bond Phase 1: Unlocks** | `backend/bond/unlocks.py` — 46-entry UNLOCK_TABLE, 9 unlock types across 100 levels |
| **Bond Phase 1: Milestones** | `backend/bond/milestones.py` — record/query milestones, XP event logging |
| **Schema v67** | bond_xp_events + bond_milestones tables, daily/session tracking columns |
| **3 API endpoints** | GET milestones, GET unlocks, GET xp-history |
| **Bond Phase 2: UI** | BondProgressBar, LevelUpCelebration, useBondProgress hook, tier badge in StatusBar |
| **Tests** | +82 new (2556 total): XP engine, unlocks, milestones, progression curve |

## Completed This Session (Apr 6, session 9 — AIE Phase B)

| What | Details |
|------|---------|
| **B1: Trend Analyzer** | `backend/adaptive/trend_analyzer.py` — EMA + linear regression over preference_history, engagement pattern detection |
| **B2: Memory Decay** | `backend/memory/decay.py` — Ebbinghaus forgetting curve, recall reinforcement, decay passes |
| **B3: Memory→Behavior** | `backend/adaptive/memory_behavior.py` — 4-channel behavioral derivation (emotional, priming, references, continuity) |
| **B4: Self-Critique** | `backend/adaptive/self_critique.py` — LLM self-review on engagement regression |
| **B5: Topic Graph** | `backend/adaptive/topic_graph.py` — TF-IDF extraction, sentiment tracking, emerging detection |
| **B6: Milestones** | `backend/adaptive/milestones.py` — 10-type relationship milestone detection |
| **Schema v66** | Memory decay columns + topic_tracking table + relationship_milestones table |
| **Integration** | B1+B6→reflector, B2→tiered_memory, B3→context_assembler, B4→reflector, B5→signals |
| **5 API endpoints** | GET trends, POST decay-pass, GET topics, GET milestones, POST self-critique |
| **Tests** | +114 new (2474 total): 20 trend, 20 decay, 19 topic, 17 milestone, 15 behavior, 23 critique |

## Completed This Session (Apr 6, session 8 — Release Testing & Automation Deep Dive)

| What | Details |
|------|---------|
| **/release-test skill** | Browser acceptance testing via Chrome computer-use. 5 user personas, 3 tiers (--major/--minor/--quick) |
| **Automation analysis** | 31 recommendations across 6 categories from 3-agent parallel research (30+ web sources) |
| **4 new hooks** | SessionStart context inject, Stop desktop notification, _BACKUP_ROOT hard-block, Biome TS/TSX format |
| **FastMCP API bridge** | `backend/mcp_bridge.py` — 12 API endpoints as native MCP tools |
| **SQLite MCP** | Read-only direct DB access via mcp-server-sqlite |
| **3 new skills** | /vrm-animation, /new-component, /diff-impact |
| **2 new agents** | frontend-tester (Vitest/RTL), theme-auditor (CSS variable audit) |
| **2 new rules** | preflight-migrations (chain safety), testing-conventions (7 patterns) |
| **Biome config** | `frontends/sakura/biome.json` — TS/TSX auto-format on every edit |

## Completed This Session (Apr 4, session 7 — Claude Code setup)

| What | Details |
|------|---------|
| **14 Claude Code improvements** | Applied all recommendations from /insights report (57 sessions, 611h analyzed) |
| **New skills (3)** | `/handoff` (session save), `/pre-session` (health check), `/qa-sweep` (parallel QA) |
| **New agent** | `perf-reviewer` — Three.js/VRM + Python + React performance review |
| **New hooks** | Pre-commit blocking (pytest + tsc), path-scoped rules (4 files) |
| **CLAUDE.md sections (4)** | Working Style, Known Sensitive Areas, Phase Gate Testing, Protected Paths |
| **/go upgrades** | Model routing (Haiku/Sonnet/Opus), OWNS/READS file ownership, self-healing test loop |
| **/research-to-action** | TDD test scaffolding + autonomous implementation pipeline |

## Completed This Session (Apr 1, session 5)

| What | Details |
|------|---------|
| **A1: Context Classifier** | Rule-based 7-type conversation classification (emotional_support, casual_chat, creative_roleplay, deep_philosophical, playful_flirty, factual_qa, comfort_reassurance) + confidence scoring |
| **A2: Dynamic Param Tuner** | Context-aware LLM sampling params replace static temperature. Engagement drift, character blending, safe ranges |
| **A3: Extended User Model** | 11 new user_profiles columns (communication style, emotional patterns, interaction patterns) + v65 migration |
| **A4: Personalization Gate** | 3-gate memory filter (relevance, repetition, appropriateness) with 9 sensitivity categories. Wired into context_assembler RAG path |
| **Integration** | All 4 modules wired into server.py (streaming + non-streaming), signals.py, reflector.py, context_assembler.py |
| **Tests** | +165 new (2360 total): 40 classifier, 38 tuner, 44 user model, 43 gate |
| **QA Questionnaire** | `docs/testing/qa-questionnaire.html` — guided walkthrough, auto-save, Markdown export |
| **Lines added** | ~4,200 across 15 files |

## Completed This Session (Mar 31, session 4)

| What | Details |
|------|---------|
| **12 NSFW frontend components** | NsfwSettingsTab, IntimateScenarioBrowser, DesireTree, FantasyJournal, MilestoneTimeline, IntimateMemoryBrowser, SceneBookmarks, IntimateGallery, LoveLetterModal, AudioStoryPlayer, IntimateQuizPanel, SharedFantasyBuilder |
| **Settings: Intimacy tab** | New tab in SettingsView with power dynamics, jealousy, spontaneity, time features |
| **App integration** | 11 new overlay types in appStore, all components rendered in App.tsx |
| **Keyboard shortcuts** | Alt+Shift+K (bookmarks), Alt+Shift+M (milestones), Alt+Shift+D (desires) |
| **Lines added** | 6,434 lines across 15 files |
| **Chat toolbar** | WhisperModeToggle (F27), QuickFireToggle (F36), TemperatureMeter (F21) |
| **P9+P10 context injection** | 7 blocks wired into server.py: Clothing, Dual Track, Negotiation, Spontaneity, Physical Tells, Recovery, Desire Arcs |
| **Final 3 components** | useAmbientAtmosphere hook (F23), PersonaPicker (F37), SceneReplayViewer (F35) |
| **Total** | 18 components + 1 hook, 13 overlay types, ~7,500 lines added |

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
| **Phase 9: Polish & Extras** | ✅ COMPLETE | F24 Clothing, F26 Scene Scoring, F20 Bookmarks, F48 Playlist | +14 |
| **Phase 10: Advanced Features** | ✅ COMPLETE | F49 Dual Track, F50 Negotiation, F51 Recovery, F52 Spontaneity, F53 Soundscapes, F54 Physical Tells, F55 Desire Arcs, F56 Mini-Games | +37 |

## Completed This Session (Mar 30, session 2)

| What | Details |
|------|---------|
| **NSFW Phase 5: Emotional Continuity** | F3 Morning After, F34 Confessions, F45 Midnight Mode, F39 Desires, F43 Post-Scene Mood, F11 Fantasy Journal — schema v63 |
| **NSFW Phase 6: Voice & Audio** | F4 Voice Intimacy, F33 Audio Stories, F36 Quickfire, F46 Love Letters |
| **NSFW Phase 7: Visual & Image Gen** | F29 Image Gen, F42 Gallery, F28 NSFW Portraits, F19 Arousal Visuals, F27 Whisper Mode — schema v64 |
| **NSFW Phase 8: Deep Personalization** | F35 Scene Replay, F37 Fantasy Personas, F47 Shared Fantasy, F31 Jealousy, F41 Body Language, F44 Erogenous Map, F22 Intimate Quiz |
| **NSFW Phase 9: Polish** | F24 Clothing, F26 Scene Scoring, F20 Bookmarks, F48 Playlist |
| **NSFW Phase 10: Advanced** | F49 Dual Track, F50 Negotiation, F51 Recovery, F52 Spontaneity, F53 Soundscapes, F54 Physical Tells, F55 Desire Arcs, F56 Mini-Games |
| **Tests** | +318 new (2195 total), all passing, tsc clean |

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

1. ~~**AIE Phase B: Deep Learning**~~ ✅ DONE — 6 modules, v66, 114 tests. Commit `02529cd`.
2. ~~**Bond Progression Phases 1-2**~~ ✅ DONE — XP engine, unlocks, milestones, v67, BondProgressBar, LevelUpCelebration, 82 tests. Commits `0c64708`→`cdae599`.
3. **Bond Phase 3: Dialogue Style Shifts** — Bond-gated system prompt injection per tier. `backend/bond/dialogue_gates.py` + per-character templates → `context_assembler.py`. Spec: `docs/plans/2026-03-29-bond-progression-spec.md` Phase 3.
4. **Bond Phase 4: Milestone Timeline + Story Viewer** — Frontend: BondTimeline, BondStoryViewer, BondPanel. Spec: same file Phase 4.
5. **QA Browser Testing** — Run `docs/testing/qa-questionnaire.html` alongside the app. Phases 8-16 remaining.
4. **Humanoid Motion Quality** — Springs/easing, follow-through, VRMLookAt, bone masks, procedural gestures, CoG. Spec: `docs/plans/2026-03-29-humanoid-motion-spec.md` (83-130h, 6 phases).
5. **Spring Bones 3D** — Quick win: strip Mixamo spring bone tracks + delta time clamp (1.5h). Spec: `docs/plans/2026-03-29-spring-bones-spec.md` (16.5h, 5 phases).
6. **Jiggle Physics** — VRM spring bones physics. Spec: `docs/plans/2026-03-29-jiggle-physics-spec.md` (15-21h, 6 phases).
7. **Model Marketplace Expansion** — Spec: `docs/plans/2026-03-29-model-marketplace-spec.md` (25-32h, 6 phases).
8. **Privacy-First Sync** — Spec: `docs/plans/2026-03-29-privacy-sync-spec.md` (~6h, 2 phases).
9. **AIE Phase C: Advanced** — LoRA training pipeline, DSPy prompt optimization. Heavy, independent. Spec: same file (Phase C: 54-76h).

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
