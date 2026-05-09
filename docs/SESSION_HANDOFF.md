# Session Handoff — 2026-05-08 (session 40 continuation)

## Branch: master
## Test Status: 2843 passed | TSC: clean

## Completed This Session

Session 40 was a continuation of the same calendar day as session 38/39 — picked up from a `/pre-session` cold start finding 8 unpushed commits + stale RESUME_PROMPT, then pivoted into apply-character-styles + 4 polish-plan drafting.

### Push + ship leftover work
- Pushed 17 commits from sessions 36-37/38/39 + this session (`261fa1e..fd7bd71` then `..d98f7dd`). origin/master is current.

### Apply character styles (RESUME_PROMPT task #2)
- Bug fix: `scripts/draft_character_styles.py` `.format()` collided with literal `{` / `}` braces in instruction text → KeyError on first non-dry-run invocation since session 27. Switched to `.replace()`. Bumped `max_tokens` 400 → 4096 (Qwen3.5 burns budget on `reasoning_content`, finish_reason=length, empty content). Commit `1d71b62`.
- Drafted styles for all 14 characters via LM Studio at 10.0.0.17 / qwen3.5-9b. Reviewed JSON. Applied via `scripts/apply_character_styles.py` (existed already from session 29 commit `05bf460`). All 14 rows have populated `characters.image_style`.

### Verification of stale RESUME_PROMPT items
- Visual Content Phase 2 (RESUME_PROMPT task #3) — already shipped session 29 commits `5349b42` + `99f4043`. `ChatImageLightbox.tsx`, `downloadFile.ts`, `chatStore.regenerateImage`, `imagePrompt` field on `ChatMessage` all present.
- Phase A leftovers: response regeneration + branch switching + search-within-thread + scroll-to-bottom + message editing + reactions + image lightbox + export-to-md + timeout retry — ALL already shipped (per chat-polish prd-writer agent grep audit).

### 4 polish plan drafts (today's main work)
- 4 `prd-writer` agents dispatched in parallel (sonnet) — each grepped the codebase to verify shipped state. All four files written + committed `2c00bc6`:
  - `docs/plans/2026-05-08-animation-polish.md` (~24h AI-eq, FIRST TICKET to execute next session) — 4 phases. Phase 1 = two one-liner outsized-ROI fixes (spring-bone delta clamp + Mixamo clip spring-bone strip). Then JigglePhysicsManager. Then saccade upgrade + mood-driven idle. Then VRMA + clip cycling.
  - `docs/plans/2026-05-08-hud-polish.md` (~11-16h) — 4 phases. Viewer Tier 6 advanced sheet, density/minimal Tier 7, Cmd+K palette, Cmd+? hotkey sheet. Tier 8 dropped.
  - `docs/plans/2026-05-08-chat-polish.md` (~11h after pin fold-in) — 4 phases. Code-block markdown, TTFT telemetry, stuck-gen indicator (`regenStartedAt` re-spec), failed-card retry + per-message timestamps + pin UI.
  - `docs/plans/2026-05-08-voice-audio-polish.md` (~13-17h after Phase 3 re-scope) — 4 phases. TTS A/B benchmark, latency telemetry, voice cloning sample UX (1-per-character, NOT multi-row gallery — that was a misframe), VoiceOrb error state + live transcript.
- 9 open questions surfaced by agents → all 9 locked by user via `AskUserQuestion`. Locked decisions appended as a "Locked Decisions — Post-Draft Session 2026-05-08" section to each plan, plus codebase-verification notes (e.g. `backend/storage/animations/vrma/` exists but is EMPTY → Phase 4 sourcing-list step is a hard prereq). Commit `d98f7dd`.

## Work In Progress
- None. Plans drafted + locked + pushed. Animation Polish Phase 1 is the next action item.

## Known Issues / Bugs
- None introduced this session. Pre-existing P2 bug `docs/bugs/2026-04-27-model-picker-no-preview-images.md` still open — not addressed.

## Files Modified

```
scripts/draft_character_styles.py             |    4 +-     (bug fix)
docs/plans/2026-05-08-animation-polish.md     | 738 +++  (NEW)
docs/plans/2026-05-08-chat-polish.md          | 696 +++  (NEW)
docs/plans/2026-05-08-hud-polish.md           | 571 +++  (NEW)
docs/plans/2026-05-08-voice-audio-polish.md   | 527 +++  (NEW)
backend/characters/builtin_image_styles.draft.json  | (gitignored, NEW, runtime artifact)
DB: 14 rows in `characters.image_style` populated  | (runtime, not tracked)
```

Plus the still-uncommitted CURRENT_STATUS.md / RESUME_PROMPT.md / COMPLETED_FEATURES.md / SESSION_2026-05-08.md updates that this handoff commit will land.

## Next Session Priorities

1. **Animation Polish Phase 1** — two one-liner spring-bone fixes per `docs/plans/2026-05-08-animation-polish.md` Phase 1. Estimated 2h AI-eq. Outsized-ROI flagged by drafting agent ("makes everything else visible"). Files: `frontends/shared/viewer/viewer.html` (delta clamp + Mixamo strip).
2. **Animation Polish Phase 2** — `JigglePhysicsManager` class. Locked default = auto-on at low intensity, dial in Settings. ~6h AI-eq. Files: `frontends/shared/viewer/viewer.html` (manager class), `frontends/sakura/src/views/SettingsView.tsx` (Physics tab + dial).
3. **Animation Polish Phase 3 prep** — saccade upgrade (typing-burst trigger, debounced 2s) + mood-driven idle. ~8h AI-eq. Schema v81 reservation for per-character spring-bone presets.
4. **Animation Polish Phase 4 prereq** — draft VRMA sourcing list. `backend/storage/animations/vrma/` is empty; user has no VRMAs locally. Research Anata animation store, vroidhub.com, community packs; output curated list with download URLs + license notes. User reviews + downloads before Phase 4.

After animation ships, the next plan to execute is whichever pain area is still top of mind — **HUD**, **chat**, or **voice** plans are all queued and locked.

## Context for Next Session

- **Schema:** v80 (unchanged this session). Phase 3 of animation plan reserves v81.
- **Push state:** clean. origin/master at `d98f7dd`. Push gate clear.
- **LLM endpoint:** 10.0.0.17:1234 (qwen3.5-9b) — confirmed reachable this session. If thinking model burns reasoning_content, bump `max_tokens` past 1500 (the apply-character-styles fix is precedent).
- **All 14 builtin characters now have `image_style` populated** — image generation will inherit per-character art-style prefixes via `resolve_character_style` (shipped session 26 commit `d34f86f`).
- **Sensitive area touched:** none in code this session. Plans target `viewer.html` (sensitive — 10+ regressions). Animation Phase 1 should be dispatched with extra care; consider a worktree.
- **Hardware:** Mac M2 Pro is GPU floor + dev box. Win RTX 5080 available remote (claude-code-on-PC, claude.ai/code session, or Chrome remote desktop) — not needed for animation polish.
- **Context heaviness:** today's session was multi-step (apply char styles + 4 parallel agents + lock-in + handoff). Recommend `/clear` before starting Phase 1 work.

## Plan files referenced

- `docs/plans/2026-05-08-animation-polish.md` (NEW, FIRST TICKET)
- `docs/plans/2026-05-08-hud-polish.md` (NEW, queued)
- `docs/plans/2026-05-08-chat-polish.md` (NEW, queued)
- `docs/plans/2026-05-08-voice-audio-polish.md` (NEW, queued)
- `docs/plans/2026-03-29-spring-bones-spec.md` (referenced by animation plan)
- `docs/plans/2026-03-29-jiggle-physics-spec.md` (referenced)
- `docs/plans/2026-03-29-humanoid-motion-spec.md` (referenced; full scope deferred)
- `docs/plans/2026-04-27-hud-redesign-staged.md` (referenced by HUD plan)
