# Resume Prompt — Next Session

**Last updated:** 2026-05-08 (session 40, post-handoff)
**Branch:** master — pushed to `origin/master` at `d98f7dd`

## Last Completed Work

Session 40 was a same-day continuation of session 38/39. Three things shipped:

1. **Pushed 17 commits** that were sitting unpushed from sessions 36–37 + 38/39. origin/master is current.
2. **Applied character styles to all 14 characters** — fixed `scripts/draft_character_styles.py` (Python `.format()` brace collision + `max_tokens` 400→4096 for thinking-model `reasoning_content` budget). Drafted via LM Studio (10.0.0.17 / qwen3.5-9b). Reviewed JSON. Applied via existing `scripts/apply_character_styles.py`. DB column `characters.image_style` now populated for all 14.
3. **Drafted 4 polish plans** via 4 parallel `prd-writer` agents (sonnet) — animation, HUD, chat, voice/audio. 9 open questions surfaced + locked.

Schema v80 (unchanged). Tests: 2,843 backend + 276 frontend, tsc clean.

## Next 3 Tasks

**Animation Polish is the locked first ticket.** All 4 plans are ready in `docs/plans/2026-05-08-*.md`.

1. **Animation Polish Phase 1 (~2h AI-eq)** — Two one-liner spring-bone fixes in `frontends/shared/viewer/viewer.html`:
   - Clamp delta time from 100ms → 50ms so spring bones don't explode after a tab switch.
   - Strip spring bone tracks from Mixamo clips so hair moves during animations.
   - Agent flagged these as outsized-ROI: "make everything else visible." Ship first.
   - Plan: `docs/plans/2026-05-08-animation-polish.md` Phase 1.

2. **Animation Polish Phase 2 (~6h AI-eq)** — `JigglePhysicsManager` class.
   - **Locked default: auto-on at low intensity** (override agent's default-OFF assumption).
   - Settings > Physics tab + 5-position intensity dial (off / subtle / medium / lively / extreme).
   - Files: `viewer.html` (manager class), `frontends/sakura/src/views/SettingsView.tsx` (Physics tab), `appStore.ts` or `settingsStore.ts` (state).

3. **Animation Polish Phase 4 prereq — VRMA sourcing list** — Can run in parallel with Phase 2/3.
   - `backend/storage/animations/{vrma,bvh,fbx,glb,vrm-expression-library}/` are all 0-file directories.
   - Research Anata animation store, vroidhub.com, community packs.
   - Output: curated download list + license notes for user review.
   - Phase 4 can't ship until vrma/ is populated.

## In-Flight Context

- **All 14 characters now have `image_style`** populated — image generation inherits per-character art-style prefixes via `resolve_character_style` (shipped session 26 commit `d34f86f`). Test: `curl -X POST /api/image-gen/portrait -d '{"prompt":"selfie","character_id":1}'` should produce Rin-flavored output.
- **Polish plan inventory:** animation (~24h, FIRST), HUD (~11-16h), chat (~11h), voice (~13-17h). Total ~59-68h AI-eq across the 4 plans. Each has a "Locked Decisions — Post-Draft Session 2026-05-08" appendix capturing the 9 user decisions made during drafting.
- **AIE Phase C (LoRA + DSPy)** complete since session 36 — no open work there. Schema v78.
- **Visual Content MVP** complete since session 29 — RESUME_PROMPT had listed Phase 2 as TODO, but it shipped (`5349b42` + `99f4043`). Don't re-plan.
- **Phase A leftovers** RESUME_PROMPT mentioned (response regeneration, typing indicator, search) all already shipped. The genuinely open chat work is in `2026-05-08-chat-polish.md` (code-block markdown, TTFT telemetry, stuck-gen indicator re-spec, failed-card retry, per-message timestamps, pin UI).

## Key Files to Read First

1. `CURRENT_STATUS.md` — current state
2. `docs/plans/2026-05-08-animation-polish.md` — first ticket, all phases + locked decisions
3. `docs/SESSION_HANDOFF.md` — this session's full handoff (more detail than RESUME_PROMPT)
4. `docs/conventions/3d-viewer-and-animation.md` — viewer.html conventions before Phase 1 edits
5. `frontends/shared/viewer/viewer.html` — sensitive area, regressed 10+ times. Read carefully before editing.

## Context Health

This session ran apply-character-styles + dispatched 4 prd-writer agents in parallel + locked 9 questions + handoff. Multi-step. **Recommend `/clear` before starting Phase 1.**

The animation plan touches `viewer.html` which is in the Known Sensitive Areas list. Consider `--isolation worktree` when dispatching `senior-dev` for Phase 1. CLAUDE.md "Suggestion Triggers" recommends `/qa-sweep` at the next handoff if `viewer.html` is touched.
