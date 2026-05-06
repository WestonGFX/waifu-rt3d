# Session Handoff — 2026-05-06 (Session 28)

## Branch: master · 0 ahead of `origin/master` · all session-28 work pushed
## Test status: 2703 backend pass · 215 frontend pass · tsc clean
## Schema: v72 (chain reserved through v74). Live DB still v71 — preflight will auto-apply v72 on next backend restart.
## Servers: backend uvicorn + sakura vite were started for browser QA. Still running in background — kill manually if not needed.

## Commits this session (3 new, in chronological order)

| Commit | Subject | Notes |
|---|---|---|
| `dbdac98` | feat(schema-v72): dedupe character_relationships + UNIQUE INDEX on char_id | Resolves P1 from session 27. Window-function dedupe keeps highest bond_xp row per char_id (ties → latest last_updated, then highest id). UNIQUE INDEX `uq_character_relationships_char_id` prevents recurrence. Verified with inline test: 6 → 3 rows, UNIQUE enforced, idempotent. Live DB at v71 — preflight will run v72 on next backend boot. |
| `eeaa2de` | refactor(viz-mvp-p2): extract ImageLightbox from GalleryOverlay | Self-contained component, props-driven. ~155 LOC moved out, reusable for the upcoming Phase 2 chat-image viewer. Delete-confirm stays caller-side. `formatSize` duplicated inline (6 lines, not worth a util). 215/215 frontend tests pass. |
| `c9b0dc4` | refactor(/go): port AnimeGirly's per-task strategy selection + waifu-specific guards | `.claude/skills/go/SKILL.md` 263 → 385 lines. Phase 0 plan-file bootstrap, Phase 2.5 strategy selection (8-axis), Hybrid pattern, token-budget rule, Step 4 preference forks, new `--seq`/`--ask` flags. Replaces "NEVER plan mode" with conditional plan mode. Adds waifu-specific 9th axis (sensitive area touched → pulls sequential), Pydantic↔TS api.ts mirror callout in Phase 5, push-gate scan in Phase 6, Co-Authored-By prohibition. |

Plus 1 push action (no commit): `efc766b..5a87385` — 14 prior session-27 commits authorized and pushed at session start.

## Completed this session

- **Pushed 14 session-27 commits** to origin/master.
- **Memory Browser browser QA** — found P2 bug (tab strip overflow at 1512w viewport → click on "About You" tab closes panel via backdrop). Filed `docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md` with repro, evidence, suggested fix.
- **v72 dedupe migration** committed (`dbdac98`). 2703 backend tests pass.
- **ImageLightbox extracted** (`eeaa2de`). Phase 2 of Viz MVP one step closer; chat-image viewer can now reuse the same component.
- **/go skill rewritten** to per-task strategy selection (`c9b0dc4`). MoE no longer the default; main Claude does small / sensitive-area / integration work itself.

## Work in progress

Nothing in progress. All session-28 work committed and pushed.

## Known issues / bugs

| Bug | Status | File |
|---|---|---|
| Memory Browser tab strip overflow + close-on-click | NEW (filed this session, P2) | `docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md` |
| `character_relationships` duplicate rows | RESOLVED — v72 migration committed; will apply to live DB on next backend restart | `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md` |
| BondPill XP overshoots level threshold | OPEN (P3, from session 27) | `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md` |

## Files modified (uncommitted, runtime/state — NOT session work)

- `backend/config/app.json` — server runtime saved settings (modified by browser QA)
- `backend/storage/app.db` — DB grew from running server (1.9MB → 4.4MB)
- `app.db` (root, untracked, 0 bytes) — stray test artifact, can `rm`
- `backend/storage/waifu.db.bak.20260506132609` — auto-backup, leave alone

None of these are session work; left uncommitted intentionally.

## Next session priorities

1. **Authorize live-DB v72 application** — when next backend restart happens, preflight will run `migrate_to_v72` on `backend/storage/app.db`. Watch the log for "Schema v72 migration complete (deduped character_relationships N → 11 rows; UNIQUE INDEX on char_id added)". If it fails, the migration rolls back and the existing data is intact.
2. **Fix Memory Browser tab overflow bug** (P2) — `docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md`. Suggested fix: `overflow-x: auto` on tab strip + `e.stopPropagation()` guard on backdrop. ~30 min.
3. **Viz MVP Phase 2 finishers** — lightbox is ready; remaining work is `imagePrompt` field on messages, `regenerateImage` flow, retention cleanup in `_run_scheduler_tick`, stuck-gen indicator on `DialogueBubble`, Settings retention slider. Still blocked on Ultraplan PR merge for `DialogueBubble.tsx` + `ChatThread.tsx`. Plan: `docs/plans/2026-05-06-visual-content-mvp-execution.md`.
4. **AIE Phase C scoping** — answer the 7 open questions in `docs/plans/2026-05-06-aie-phase-c-scoping.md` and pick a tier (MVP 24-30h / Standard 56-80h / Full 120-180h).
5. **Apply drafted character styles** — once `scripts/draft_character_styles.py` runs with a configured LLM and the user reviews `backend/characters/builtin_image_styles.draft.json`, author `scripts/apply_character_styles.py` (UPDATE characters table from approved JSON).

## Context for next session

- **Servers running in background:** backend (PID via `lsof -ti :8080`) + sakura (`lsof -ti :5175`). Started this session for Memory Browser QA. Not auto-started by /handoff. Kill if next session doesn't need them.
- **/go behavior changed.** Read `.claude/skills/go/SKILL.md` if you're about to invoke /go this session — old reflex was "dispatch up to 8 agents", new behavior is per-task strategy selection with sequential default. Sensitive-area edits force sequential (or `--ask`).
- **Push gate is wired into the new /go.** Phase 6 scans `docs/SESSION_HANDOFF.md` + `CURRENT_STATUS.md` for `OPEN BUG` / `UNFIXED` / `⚠ BLOCKER` markers before any push. Currently clean — no active blockers.
- **AnimeGirly /go was the source of the strategy-selection refactor.** If anything feels off in waifu's version, compare against `~/Code/AnimeGirly/.claude/skills/go/SKILL.md` — they are now structurally similar but with different agent rosters and different sensitive-area lists.
- **Schema migration discipline reminder:** `backend/storage/app.db` runs preflight on every boot. v72 will apply automatically. If you need to test the migration without restarting backend, use the inline test pattern from session 28 (sqlite3 in-memory, manual INSERT of dupes, call `migrate_to_v72`).

## Suggestion (per CLAUDE.md Suggestion Triggers)

This session committed a schema migration (v72). Repo CLAUDE.md "Suggestion Triggers" recommends `/qa-sweep` at the handoff boundary in this case. Suggested, not run — your call. Tests already passed (2703 backend + 215 frontend), so the sweep would mostly be Ruff lint + regression-hotspot scan.
