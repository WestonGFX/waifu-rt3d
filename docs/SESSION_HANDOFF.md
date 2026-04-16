# Session Handoff — 2026-04-16

## Branch: master
## Test Status: 2678 backend passed, 0 failed | TSC: clean | Frontend: 160 passed, 4 pre-existing failures (unrelated)

## Completed This Session (sessions 12-13, merged)

### Per-Character Scenarios — shipped
- `migrate_to_v69` — 65 builtin scenario templates (13 chars × 5) via SELECT-before-INSERT idempotent guard
- 6 new REST endpoints under `/api/scenarios/templates` (GET list/active, POST create/activate, PUT, DELETE with 403-on-builtin)
- `ScenarioPicker.tsx` (497 lines, mood-grouped list, random, create-custom) + `useScenarios.ts` hook + 7 new API methods
- Sparkles button in ChatThread composer toolbar opens picker overlay
- Cross-boundary fix: deactivate uses `template_id=0` not `null`
- +46 tests (29 backend + 17 frontend)
- Commits: `e25aa7a`, `bd7e3dc`, `54e77af`, `0836dfb`

### Bond Phases 5 + 6 — shipped (Bond system ALL 6 PHASES DONE)
- `backend/bond/memorial_scenes.py` — 39 tier-transition vignettes (13 chars × 3 tiers at L15/L35/L65), `bond_scenes_seen` table (schema v70)
- Phase 5 endpoints: `GET /api/characters/{id}/bond/memorial-scene?level=N`, `POST /memorial-scene/complete`, `GET /first-memory`
- Phase 6 endpoint: `GET /api/characters/{id}/bond/analytics` (totals, days-active, source-breakdown, est-days-to-soulmate)
- `MemorialScene.tsx` (273 lines, framer fade overlay, beat-by-beat dialogue, postMessage expression hooks)
- `useMemorialScene.ts` hook — polls for pending scene after level changes
- `DevConsole.tsx` — added Bond tab with analytics summary + ASCII source bars + recent XP events
- +48 tests (22 + 10 + 16)
- Commits: `c87531a`, `25c551a`, `7323998`, `6ff7c30`

### Environment + Tooling Updates
- Caveman plugin installed via `JuliusBrussee/caveman` marketplace (invoke `/caveman` for token-saver mode)
- Global + project `defaultMode: bypassPermissions`
- Global env: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `_BRIEF=1`, `_CRON=1`, `_REMOTE_TRIGGER=1`
- Ghostty config: cursor `bar`→`underline` + blink, `shell-integration-features = no-cursor` (prevents shell override)

## Work In Progress
None. All sprint work committed.

## Known Issues / Bugs (pre-existing, not from this session)
- `frontends/sakura/src/test/OnboardingWizard.test.tsx` × 1 failure ("Get started" advance step)
- `frontends/sakura/src/test/SettingsView.exportImport.test.tsx` × 3 failures (export blob, import createCharacter, import missing fields)
- `.codex/` untracked directory — decide to ignore or archive
- `backend/storage/app.db` dirty (runtime state, expected)

## Files Modified (to commit at end of handoff)
- `.claude/settings.local.json` — `defaultMode: bypassPermissions`, added `waifu-rt3d-api` MCP server entry
- `docs/plans/RESUME_PROMPT.md` — rewritten for session 14 boot
- `frontends/sakura/package.json` + `package-lock.json` — `@biomejs/biome 2.4.10` dev dep
- Not committing: `backend/config/app.json`, `backend/storage/app.db` (runtime), `.codex/` (untracked)

## Next Session Priorities (execute via Agent Team — `TeamCreate`)

### 1. Memory Browser UI (P5) — ~4hr
Backend ready in `backend/memory/tiered_memory.py`. New React component to list/filter/edit/delete
character memories by tier (short/medium/long), search, confidence adjustment.

### 2. Visual Content in Chat — ~6hr
"Character sends you a picture" UX. Image gen pipeline already exists.
Needs: chat message type for inline image, intent recognition for "send me a pic"
requests, optional photo attachment from character's gallery.

### 3. Pre-existing test cleanup (low priority)
Fix the 4 OnboardingWizard + SettingsView.exportImport failures.

## Context for Next Session
- **Agent Teams enabled** — env flag set globally. Open with `/dashboard` then `TeamCreate` to spawn 2-3 teammates working on Memory Browser + Visual Content simultaneously.
- **Schema v70** is the new floor. Next migration = v71.
- **2678 backend tests** is the new baseline.
- **Bond is complete** — don't propose more bond phases. If user wants retention work next, pitch Memory Browser or Visual Content first.
- **Caveman mode** was active this session — can `/caveman` toggle or say "stop caveman".
- **Explanatory output style** active via `outputStyle: "Explanatory"` in project local — agent output includes `★ Insight` blocks.
