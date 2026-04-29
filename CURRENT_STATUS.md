# Current Project Status

**Last updated:** 2026-04-28 (session 19 — Tier 4 turn end)
**Branch:** master (clean, all pushed)
**Schema version:** v70
**Tests:** **2,684 backend** (pytest, 0 known failures) + 203 frontend (vitest) passing, tsc clean
**Automation:** 12 agents, 22 skills, 6 rules, 8 hooks, 3 MCP servers

**Archive:** Sessions 1-11 + NSFW sprint detail + Mar 29 research expansion moved to [`docs/sessions/ARCHIVE.md`](docs/sessions/ARCHIVE.md) during session 16 token-budget prune. Nothing deleted — relocated.

## Active Work

**Session 19 (2026-04-28) — 10 commits, all pushed to origin/master.**
Pre-restart: `aef220a` Tier 0 audit · `3a1c60f` Tier 1 deletes · `b6485d8` db autocommit · `af39c53` handoff.
Post-restart: `5ccf89a` date test fix · `62923e4` HUD Tier 2 (top toolbar 9→4 + ⋯ overflow) · `3bb8cce` `db_ctx` migration of 193 sites (**FD leak CLOSED**) · `fb77235` FD-leak regression test · `cc93e88` HUD Tier 3 (bottom toolbar 3 rows → 1) · `c4fadc5` HUD Tier 1b (sidebar 5-col → 6-col, fixes Help-orphan-row) · `fc3588a` mid-session handoff · `6120377` HUD Tier 4 (bond strip 4 rows → 1-line click-to-expand pill, +469/-180 lines).

**Open bug — UNFIXED, blocks Tier 4 declared-shipped:** at user's actual Chrome window (innerWH 1440x900, dpr 1, zoom 100%) the app renders top-left-anchored with significant void below + right. Diagnostic shows `root.height=900` matching `innerHeight=900` — yet user's screenshots clearly show the app NOT filling the Chrome viewport. Could not reproduce in Playwright at any viewport (998×624, 1440×900, 1995×1248). Hypothesis to chase first next session: stale service worker (`/sw.js`) serving cached pre-Tier-4 bundle. See `docs/SESSION_HANDOFF.md` "Open bug" section for the full investigation plan.

**Next session priority:** debug + fix the Tier 4 layout regression above. Then pause + evaluate Tier 4 per plan, then decide between Tier 5 / 6 / pill size bump / right-cluster overflow fix.

## Completed This Session (Session 18 — Memory Browser unification + 3D viewer crash fix + HUD redesign plan)

| What | Details |
|------|---------|
| **MemoryBrowser raw-fetch → `api.*` unification** | Added `MemoryItem` interface + 4 typed methods to `api.ts` (`listMemories`/`searchMemories`/`deleteMemory`/`promoteMemory`). Refactored `MemoryBrowser.tsx` Memories tab — 4 raw `fetch()` calls replaced. Test suite collapsed: removed `makeFetchStub` URL+method router (~50 lines); 7 Memories cases now use Pattern 2. Commit `7b7bce1`. |
| **db-lock 500s on `/api/characters/{id}/relationship`** | `db()` helper now sets `PRAGMA busy_timeout = 30000` per connection — fixes the *class* of WAL-writer-contention bug across all `db()` users. `get_relationship` switched to SELECT-first / INSERT-on-miss. `reset_relationship` wrapped in `with conn:`. New regression test `test_relationship_endpoint.py` (5 tests). Commit `8a1f3f5`. |
| **3D viewer crash + greeting endpoint chain** | THE viewer crash: `BlinkController` constructor in `viewer.html` called `_poissonDelay()` BEFORE initializing `_emotionMod` → `TypeError: Cannot read properties of undefined (reading 'rateMul')` *inside* GLTFLoader success callback. Crash happened AFTER VRM downloaded — viewer never sent `modelLoaded`, parent React stuck on "Loading 3D model..." forever. Fixed by reordering. Bumped `?v=7`→`?v=8`. Also fixed three phantom-column SQL bugs in `get_character_greeting` (`greeting_message` → `greeting_text`, `sessions.updated_at` → `MAX(messages.ts) WHERE char_id`, `sessions.character_id` → `messages.session_id WHERE char_id`). Same `sessions.character_id` bug in diary endpoint fixed in passing. New regression `viewer.blinkController.test.ts` (3 tests). Verification: Playwright drove app → VRM (Panicandy) renders at 118 FPS with `motion_neutral` animation playing. Commit `643bd24`. |
| **HUD redesign plan written (deferred)** | `docs/plans/2026-04-27-hud-redesign-staged.md` (262 lines). 8-tier intensity ladder, escalate only when previous tier is judged insufficient. Recommended order: 0 → 1 → 2 → pause → 4 → pause → 3 → 6 → 5 → 7 → 8. Hard constraints baked in: no new chrome, theme test per tier, one commit per tier, 10-min real-use evaluation gates. Commit `6255578`. |
| **4 bug docs filed in `docs/bugs/`** | `2026-04-27-character-relationship-db-lock.md` ✅FIXED · `2026-04-27-viewer-or-model-assignment-broken.md` ✅FIXED · `2026-04-27-model-picker-no-preview-images.md` (open, P2) · `2026-04-27-hud-cramped-overcrowded.md` (open, P1, has plan above) |
| **Verification** | pytest 2683 passed (+5 new) · vitest 203 passed (+3 new BlinkController structural tests) · tsc clean. Live verification via Playwright agentic drive — 3D viewer renders the avatar successfully. |

## Completed This Session (Session 17 — MemoryBrowser test closeout + 4 pre-existing failures cleared)

| What | Details |
|------|---------|
| **MemoryBrowser Memories + Journal + integration coverage** | +16 Vitest cases in `frontends/sakura/src/test/MemoryBrowser.test.tsx`. Memories tab (7): list with `char_id`, role/tier badges, empty, 500 error, search→Go, DELETE, PATCH `/promote`, pagination. Journal tab (5): entries render, count singularization, empty, expand/collapse, session#. Integration (3): close button, tab persistence, Overview-reset on reopen. Used a per-suite `makeFetchStub()` URL+method router for raw-fetch endpoints. Commit `bc71397`. |
| **Cleared 4 pre-existing frontend test failures** | OnboardingWizard "Get started → System Scan" was multi-matching `getByText` on the h2 + WizardProgress label — scoped to `getByRole('heading')`. SettingsView export/import × 3 were crashing because `FormatRulesEditor` mounted with an unstubbed `api.getFormatRules` — added the missing CRUD methods to the api mock. Test-only changes, zero production code touched. Commit `9c17540`. |
| **Verification** | pytest 2678 passed (backend untouched) · vitest 196 → 200 passed (+16 new + 4 unbroken) · tsc clean. The "4 pre-existing failures" footnote that has been carried forward since session 13 is now retired. |

## Completed This Session (Session 16 — Memory Browser audit + Vitest coverage + token-budget prune)

| What | Details |
|------|---------|
| **Audit discovery** | `MemoryBrowser.tsx` (commit `9592dcf`, 1197 lines, 4 tabs) was already shipped — prior handoff's "backend ready, needs React UI" claim was stale memory. Actual gap = zero test coverage. |
| **Vitest coverage** | 20 new cases in `frontends/sakura/src/test/MemoryBrowser.test.tsx`. Covers top-level overlay (open/close, tab switching, no-character guard), Overview tab (stats, category breakdown, journal preview, error fallback), and Facts tab (add/create/delete, source badges, category grouping). Memories + Journal tabs deferred to session 17. |
| **CURRENT_STATUS.md prune** | 290 → 153 lines. Sessions 1-11 + Mar 29 research expansion relocated to new `docs/sessions/ARCHIVE.md`. Saves ~2k tokens per `/pre-session` cold start. |
| **Stale-claim fixes** | `MEMORY.md` + `SESSION_HANDOFF.md` updated to reflect shipped-but-untested Memory Browser status. |
| **New feedback memory** | `feedback_pre_session_token_budget.md` — user directive: prune CURRENT_STATUS/MEMORY/CLAUDE.md aggressively; additions should land with equivalent prune in same commit. |
| **Verification** | pytest 2678 passed (backend untouched) · vitest 180 passed (+20) · 4 pre-existing failures unchanged · tsc clean. |

## Completed This Session (Apr 19–20, session 15 — CC Harness Hygiene Sweep)

Meta-work only — no product code or tests touched. Mirror-applied to AnimeGirly.

| What | Details |
|------|---------|
| **Permission mode** | `.claude/settings.local.json` `bypassPermissions` → `auto`. Dropped `skipDangerousModePermissionPrompt` from `~/.claude/settings.json`. |
| **Env flag** | Added `CLAUDE_CODE_NO_FLICKER=1` to `.claude/settings.json` env block. Restart CC to activate. |
| **Skill deletions** | `/dashboard` (subset of `/pre-session`), `/sprint` (→ `/go --preset=sprint`), `/review` renamed → `/ui-review` (disambiguate from `/audit`). |
| **Skill refactor** | `/handoff` rewritten as thin wrapper around `/checkpoint` — names shared status-sync steps instead of duplicating them. |
| **Skill flag** | `/go` gained `--preset=sprint`; `/go` agent roster updated to include `frontend-tester` + `advisor` + `regression-guard`, orchestrator row removed. |
| **Agent deletion** | `orchestrator.md` — phantom role (main Claude IS the orchestrator during /go). |
| **Agent demotion** | `production-readiness-auditor.md` moved from `~/.claude/agents/` → `.claude/agents/` (repo-local). |
| **Agent descriptions** | `advisor` vs `prd-writer` boundary clarified (light vs formal PRDs); `qa-hunter` scoped to backend-only (vs `frontend-tester`). |
| **Repo CLAUDE.md** | New "Suggestion Triggers" section — risk-signal mode for `/qa-sweep` + `/verify-servers` with 4 alternative modes documented inline. |
| **Global ~/.claude/CLAUDE.md** | New "Preference Forks — Offer Options, Don't Pick Silently" rule — extends AskUserQuestion with preference/aesthetic/layout fork coverage. |
| **Global new-repo ritual** | Wrote `~/.claude/docs/new-repo-setup.md` — manual decision-tree reference for future repos. NOT auto-applied. |
| **Statusline** | Fixed cumulative-vs-current-tokens bug ([CC #13783](https://github.com/anthropics/claude-code/issues/13783)). Added `SEP_PAD` tunable, dynamic model-suffix shortening, balanced separator spacing. |
| **AGENTS.md** | Full rewrite — 12 agents, orchestrator removed, role boundaries spelled out. |
| **AnimeGirly mirror** | Same cleanups applied in AG working tree (deleted /dashboard, /implement-feature, orchestrator; /go got --mode=roadmap; Suggestion Triggers section appended, AG-tailored). |
| **New feedback memory** | `feedback_no_qa_sweep_in_go.md`, `feedback_new_repo_setup_manual.md`, `feedback_tool_per_repo_no_mixing.md`, `project_statusline_review_due.md` (2026-05-19 rebuild reminder). |
| **Verification** | pytest 2678 passed · tsc clean — no product-code or test changes, all green baseline preserved. |

## Completed This Session (Apr 18, session 14 — Harness Upgrades, Tier 1+2)

Meta-work on the dev workflow itself. Repo-local-only.

| What | Details |
|------|---------|
| **14.1 CLAUDE.md verification gates** | Added `## Verification Before Claiming Success` (work-type → required evidence) and `## Agent Dispatch Policy`. Expanded `## Known Sensitive Areas` with context-provider mock drift + Pydantic↔TS type drift. Commit `0b08397`. |
| **14.2 Biome hook upgrade** | PostToolUse hook swapped `biome format --write` → `biome check --write` (format + safe-autofix lint). |
| **14.3 /verify-servers skill** | New `.claude/skills/verify-servers/SKILL.md` — probes backend 8080, sakura 5175, dashboard 3333, viewer iframe. Curl + body-content sanity + log scan for ABI/ImportError/segfault keywords. |
| **14.4 /go phase gates** | `/go` gained `Phase-End Gates`: test-subset tail paste, `/verify-servers` when phase starts a service, one-line plan status append. |
| **14.5 /qa-sweep chunked mode** | `/qa-sweep --chunked`: batches of 50, per-batch commit to `docs/testing/qa-findings-*.md`, P0/P1/P2 categorization. |
| **14.6 regression-guard agent** | New `.claude/agents/regression-guard.md` — scans `git log --grep='fix'` for repeat patterns, writes locked-in tests citing commit hashes. |
| **14.7 verification** | pytest 2678 passed, tsc clean, vitest 160 passed + 4 pre-existing failures unchanged. |
| **New feedback memory** | `feedback_batch_work_prefer_momentum.md`, `feedback_no_global_config_changes.md`, `feedback_scope_definitions.md`. |

## Completed This Session (Apr 14, session 13 — Bond Phases 5+6)

| What | Details |
|------|---------|
| **Bond Phase 5: Memorial Scenes** | 39 tier-transition vignettes (13 chars × 3 tier boundaries). `bond_scenes_seen` table (schema v70). 5 backend endpoints. `MemorialScene.tsx` overlay + `useMemorialScene` hook. |
| **Bond Phase 6: Analytics** | `GET /api/characters/{id}/bond/analytics` — XP source breakdown, session counts, tier history. DevConsole Bond tab. |
| **Tests** | +32 new (2678 backend total, 160 frontend total). |

## Completed This Session (Apr 14, session 12 — Per-Character Scenarios)

| What | Details |
|------|---------|
| **Per-Character Scenario Templates** | schema v69 seeds 65 builtin templates (13 chars × 5). 6 REST endpoints under `/api/scenarios/templates`. |
| **ScenarioPicker UI** | `ScenarioPicker.tsx` (497 lines) — modal with mood-grouped list, activate/random/create-custom. `useScenarios.ts` hook (186 lines). |
| **Tests** | +46 new (2650 total): 29 backend + 17 vitest. |

## Previous Sessions (detail in [ARCHIVE.md](docs/sessions/ARCHIVE.md))

| Session | Date | Key work |
|---------|------|----------|
| 11 | Apr 7 | AI Quick Replies + CHARA V2 Compliance (v68) + Competitor Gap Analysis |
| 10 | Apr 7 | QA Fixes (4) + Bond P1-2 (v67, BondProgressBar, LevelUpCelebration, +82 tests) |
| 9 | Apr 6 | AIE Phase B (6 modules: trend, decay, memory→behavior, critique, topic graph, milestones; v66, +114 tests) |
| 8 | Apr 6 | /release-test skill + 31 automation recs + 4 hooks + FastMCP bridge + SQLite MCP + 3 skills + 2 agents + 2 rules + Biome |
| 7 | Apr 4 | 14 CC improvements (/handoff, /pre-session, /qa-sweep, perf-reviewer, pre-commit hook, CLAUDE.md sections) |
| 5 | Apr 1 | AIE Phase A (4 modules: classifier, tuner, user model, gate; v65, +165 tests) |
| 4 | Mar 31 | 12 NSFW frontend components + Intimacy tab + 11 overlays + +3 toolbar buttons + 3 shortcuts |
| 3 | Mar 28 | NSFW Phases 1-3 (Foundation + State Machines + Scene Architecture) |
| 2 | Mar 30 | NSFW Phases 5-10 (Emotional, Voice, Visual, Personalization, Polish, Advanced; +318 tests) |
| 1 | Mar 30 | NSFW Phase 4 (Milestones, Intimate Memory, Aftercare, Pillow Talk; v62, +120 tests) |

## NSFW Mega-Sprint Summary (detail per phase in ARCHIVE.md)

| Phase | Status | Features | Tests Added |
|-------|--------|----------|-------------|
| **Phase 1: Foundation** | ✅ COMPLETE | F40, F13, F15, F30 | +146 |
| **Phase 2: State Machines** | ✅ COMPLETE | F17, F6, F16, F10 | +113 |
| **Phase 3: Scene Architecture** | ✅ COMPLETE | F32, F38, F8, F25 | +112 |
| **Phase 4: Memory & Milestones** | ✅ COMPLETE | F1, F2, F5, F12 | +120 |
| **Phase 5: Emotional Continuity** | ✅ COMPLETE | F3, F34, F43, F45, F11, F39 | +126 |
| **Phase 6: Voice & Audio** | ✅ COMPLETE | F4, F33, F36, F46 | +70 |
| **Phase 7: Visual & Image Gen** | ✅ COMPLETE | F29, F42, F28, F19, F27 | +34 |
| **Phase 8: Deep Personalization** | ✅ COMPLETE | F35, F37, F47, F31, F41, F44, F22 | +37 |
| **Phase 9: Polish & Extras** | ✅ COMPLETE | F24, F26, F20, F48 | +14 |
| **Phase 10: Advanced Features** | ✅ COMPLETE | F49–F56 (8 features) | +37 |

## Next Tasks (Priority Order — updated Session 16)

1. ~~**AIE Phase B**~~ · ~~**Bond Phases 1-2**~~ · ~~**Bond Phases 3+4**~~ · ~~**Bond Phases 5+6**~~ · ~~**Per-Character Scenarios**~~ — all ✅ DONE
2. ~~**Memory Browser UI (P5)**~~ — discovered SHIPPED in commit `9592dcf` during session 16 audit. 1197-line 4-tab component fully wired. **New active gap: zero Vitest coverage.**
3. **Memory Browser test coverage** (session 16+17) — Vitest suite for all 4 tabs. Session 16: Overview + Facts. Session 17: Memories + Journal + top-level. 3–5h total.
4. **Memory Browser browser QA** (session 17) — exercise tabs in Sakura, file `docs/bugs/*.md`. 1–2h.
5. **Memory Browser polish** (session 18) — apply QA findings, unify raw-fetch `/api/v2/memory/*` calls vs `api.getUserFacts()` client. 2–4h.
6. **Visual Content in Chat** — "Character sends you a picture" UX. Image-gen pipeline exists in backend. ~4–8h.
7. **Fix 4 pre-existing frontend test failures** — OnboardingWizard × 1, SettingsView.exportImport × 3. 2–4h.
8. **Humanoid Motion Quality** — Springs/easing, follow-through, VRMLookAt, bone masks, procedural gestures, CoG. Spec: `docs/plans/2026-03-29-humanoid-motion-spec.md` (83-130h).
9. **Spring Bones 3D** — Quick win: strip Mixamo spring bone tracks + delta time clamp. Spec: `docs/plans/2026-03-29-spring-bones-spec.md` (16.5h).
10. **Jiggle Physics** — VRM spring bones. Spec: `docs/plans/2026-03-29-jiggle-physics-spec.md` (15-21h).
11. **Model Marketplace Expansion** — Spec: `docs/plans/2026-03-29-model-marketplace-spec.md` (25-32h).
12. **Privacy-First Sync** — Spec: `docs/plans/2026-03-29-privacy-sync-spec.md` (~6h).
13. **AIE Phase C: Advanced** — LoRA training pipeline, DSPy prompt optimization. Heavy, independent.

## Browser Test Sweep Checklist

| Feature | Area | What to verify |
|---------|------|---------------|
| NSFW Phase 1-3 panels | Settings/Chat | Boundaries panel, writing style picker, sensory vocab, pet names |
| **Memory Browser (session 17)** | Ctrl+M overlay | All 4 tabs render, Facts CRUD works, Memory search returns, Promote/Delete update UI, Journal expand/collapse |
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

## Quick Reference

| Resource | Path |
|----------|------|
| Session Archive | `docs/sessions/ARCHIVE.md` |
| NSFW plan | `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` |
| Adaptive intelligence spec | `docs/plans/2026-03-29-adaptive-intelligence-spec.md` |
| Bond progression spec | `docs/plans/2026-03-29-bond-progression-spec.md` |
| Spring bones spec | `docs/plans/2026-03-29-spring-bones-spec.md` |
| Model marketplace spec | `docs/plans/2026-03-29-model-marketplace-spec.md` |
| Privacy sync spec | `docs/plans/2026-03-29-privacy-sync-spec.md` |
| Humanoid motion spec | `docs/plans/2026-03-29-humanoid-motion-spec.md` |
| Jiggle physics spec | `docs/plans/2026-03-29-jiggle-physics-spec.md` |
| Research docs (26 files, ~142k words) | `docs/research/2026-03-29-*-part-*.md` |
| NSFW Phase 4 research | `docs/research/2026-03-29-nsfw-phase4-research-part-*.md` |
| NSFW Frontend UX research | `docs/research/2026-03-29-nsfw-frontend-ux-research-part-*.md` |
| Dev dashboard | `http://localhost:3333/dashboard.html` |
| Quickstart cheatsheet | `docs/QUICKSTART.md` |
| Convention guides | `docs/conventions/*.md` |
| v1.0 roadmap (uncommitted) | `docs/ROADMAP.md` |
