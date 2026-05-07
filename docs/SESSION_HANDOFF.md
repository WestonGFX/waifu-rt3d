# Session Handoff — 2026-05-06 (Session 30)

## Branch: master · 2 ahead of `origin/master` (local) · pure planning session, no code touched
## Test status: 2703 backend pass · TSC clean · frontend test count unchanged from session 29 (226)
## Schema: v72 in code, live DB still v71 (preflight applies v72 on next backend boot)
## Servers: backend uvicorn was running at session start (curl /api/health = ok); frontend not started this session.

## Commits this session (1 new)

| Commit | Subject | Notes |
|---|---|---|
| `cb5f8aa` | docs(session-30): planning sprint — 6 bug docs + 4 PRDs + competitor refresh + master roadmap | 12 files, +3140 / -0. Pure planning session — zero production code touched. |

Plus session 29 wave 2 commit `c9e327d` is also still local-only (from previous handoff).

**Local commits ahead of origin/master:** `c9e327d` (wave 2) + `cb5f8aa` (this session) = **2 unpushed.** Push gate: clear (no active OPEN BUG / UNFIXED / BLOCKER markers anywhere).

## Completed this session

User redirected at session start: this was supposed to be a **planning-only Opus session**, not code work. CURRENT_STATUS line 22 from wave 2 had specified it; pre-session pass missed it.

Four task tracks landed sequentially:

1. **Bug triage (6 docs filed in `docs/bugs/2026-05-06-*.md`).** Wave-2 list-items in CURRENT_STATUS were not formal tracked bugs — fixed:
   - P1 `header-ui-occlusion-narrow-widths.md` — header overlap below ~1100px chat-column.
   - P1 `retry-regenerate-and-message-edit-missing.md` — *feature gap (later finding: actually scaffolded).*
   - P2 `animation-packs-dead-urls.md` — 0/36 VRMA clips on disk; both source URLs return 404.
   - P2 `image-url-not-persisted-to-messages.md` — image_url + image_prompt never written to messages table.
   - P3 `viewer-zero-fps-on-first-open.md` — black canvas until any camera preset clicked.
   - P3 `viewer-narrow-panel-grounding-off.md` — VRM clips right edge when viewer panel narrow (sensitive area).

2. **Competitor refresh research** (`docs/research/2026-05-06-competitor-refresh-delta.md`, ~395 lines, 40 sources). Top 5 deltas vs April 7 baseline:
   - Char.AI face-scan lockouts → strengthens local-first moat (publish privacy comparison page).
   - Char.AI shipped Memory Visualization on April 14 → Memory Browser is now table stakes, not differentiator.
   - OSS voice cloning hit ElevenLabs parity (Voxtral / Voicebox 22K stars / Fish S2 Pro / Chatterbox) → T2-13 promotion candidate.
   - VRM desktop-companion category got crowded (HoloWaifu / MateEngine / CielChan / Oshikoi) → VRM substrate no longer unique.
   - SpicyChat shipped 2-10 char group chats; Grok ships affinity-gated NSFW → re-litigation candidates.

3. **4 PRDs in parallel via prd-writer agents** (each dual-audience Why/How):
   - `prd-header-overflow.md` ~4h — 2-phase fix; bug doc had wrong filename (StatusBar.tsx not AppHeader.tsx).
   - `prd-retry-regenerate.md` ~3h — finding: `DialogueBubble.tsx:95-107` already declares `onRegenerate` props, never wired in `ChatThread.tsx:826`.
   - `prd-message-editing.md` ~8h — schema v73 (`edited_at` + `edit_history`); existing `PUT /api/messages/{id}` upgrade.
   - `prd-previous-generations-browser.md` ~10h — **biggest finding: feature ~80% already shipped** (`messages.parent_id` + `is_active` columns + `/regenerate` `/branches` `/activate` endpoints + pager UI in `DialogueBubble.tsx:769-812`). Work is hardening orphan-grouping bug + sibling_group_id UUID complement + zero test coverage today.

4. **Master roadmap synthesis** (`docs/plans/2026-05-06-opus-planning-roadmap.md`). 8 milestones, 54 items, 7 open questions blocking `/go`:
   - **Q1** AIE Phase C tier choice (MVP 24-30h / Standard 56-80h / Full 120-180h).
   - **Q2** Re-litigate group chat? (SpicyChat shipped 2-10).
   - **Q3** Steam distribution? (CielChan / MateEngine / HoloWaifu use it).
   - **Q4** Affinity-gated NSFW unlocks (steal from Grok)?
   - **Q5** Memory Browser graph view priority — jump ahead of M1 retry/regen?
   - **Q6** Voice cloning timing — this 3-month plan or next?
   - **Q7** Re-title `2026-05-06-retry-regenerate-and-message-edit-missing.md` (features scaffolded, not missing).

Suggested execution order if all questions resolve favorably: **M1 → M2 → M3 → M4 → M6 → M8 → M5 → M7**. M1-M6+M8 ≈ 74h calibrated AI-assisted (~3-4 calendar weeks at normal overhead).

## Work in progress

Nothing in progress. All session-30 work committed in `cb5f8aa`.

**Critical pre-`/go` gate:** the user must answer Q1-Q7 in `docs/plans/2026-05-06-opus-planning-roadmap.md` before any execution starts. The roadmap explicitly notes this.

## Known issues / bugs

| Bug | Status | File |
|---|---|---|
| Header UI occlusion at narrow widths | NEW (filed this session, P1, PRD ready) | `docs/bugs/2026-05-06-header-ui-occlusion-narrow-widths.md` |
| Retry/regenerate + msg edit + prev-gens browser | NEW (filed this session, P1, **but features actually scaffolded** — see Q7; 3 PRDs ready) | `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md` |
| Animation packs dead URLs | NEW (filed this session, P2) | `docs/bugs/2026-05-06-animation-packs-dead-urls.md` |
| image_url not persisted | NEW (filed this session, P2) | `docs/bugs/2026-05-06-image-url-not-persisted-to-messages.md` |
| 3D viewer 0 FPS first-open | NEW (filed this session, P3) | `docs/bugs/2026-05-06-viewer-zero-fps-on-first-open.md` |
| 3D viewer narrow-panel grounding | NEW (filed this session, P3) | `docs/bugs/2026-05-06-viewer-narrow-panel-grounding-off.md` |
| Memory Browser tab strip overflow | OPEN (P2, from session 28) | `docs/bugs/2026-05-06-memory-browser-tab-overflow-and-close-on-click.md` |
| BondPill XP overshoots | RESOLVED session 29 — close ticket | `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md` |
| character_relationships duplicate rows | RESOLVED v72 committed session 28; live DB still v71, applies on next backend restart | `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md` |
| Character avatar URLs point to VRM files | OPEN (P?, from session 29) | `docs/bugs/2026-05-06-character-avatar-urls-point-to-vrm-files.md` |
| Model picker no preview images | OPEN (P2, from April) | `docs/bugs/2026-04-27-model-picker-no-preview-images.md` |

## Files modified (uncommitted, runtime/state — NOT session work)

- `backend/config/app.json` — server runtime saved settings (modified before session start, left as is)
- `backend/storage/app.db` — DB grew during session (1.9MB → 4.4MB) from active backend
- `backend/storage/images/glitch_portrait.png`, `seraph_pixel_portrait.png` — deleted on disk (pre-session)
- Untracked: `app.db` (root, 0 bytes), `backend/storage/avatars/Glitch.png`, `melon_*.png` (3 files), `backend/storage/waifu.db.bak.20260506132609`

None of these are session work; left uncommitted intentionally per session 28 convention.

## Next session priorities

1. **User: answer Q1-Q7 in `docs/plans/2026-05-06-opus-planning-roadmap.md`.** This is the gate — `/go` against M1 cannot start until at least Q1, Q5, Q6, Q7 are answered. Q2/Q3/Q4 can be deferred but tighten the roadmap.

2. **Authorize push for 2 unpushed commits** (`c9e327d` wave 2 + `cb5f8aa` planning). Push gate clear.

3. **Authorize live-DB v72 application** — same as session 28's note. Next backend restart auto-applies `migrate_to_v72` on `backend/storage/app.db`.

4. **Decide M1 first-item start.** Suggested in roadmap: item 5 (image url persistence) — simplest schema-touching item, validates v73 column-add path. From there M1 is mostly wiring scaffolded code, not greenfield. Total M1 calibrated effort ~24h AI-assisted.

5. **Re-title bug doc 2026-05-06-retry-regenerate-and-message-edit-missing.md** (Q7) — current title implies features missing, actual state is "scaffolded but unwired."

## Context for next session

- **Servers running in background:** backend (PID via `lsof -ti :8080`) was running before session start and still is. Sakura frontend was not started this session.
- **CURRENT_STATUS.md is the authoritative roadmap pointer.** Add the new master roadmap (`docs/plans/2026-05-06-opus-planning-roadmap.md`) to its Quick Reference table during status sync below.
- **The 4 wave-2 bugs in the QA report at `docs/testing/qa-sweep-2026-05-06-wave1.md` had been informally listed in CURRENT_STATUS but NOT filed as `docs/bugs/` files.** This session formalized them. Future sessions should rely on the bug docs as the source of truth, not CURRENT_STATUS bullet text.
- **The /go skill rewrite (session 28 commit `c9b0dc4`) is now in effect.** Next session's `/go` invocation will use per-task strategy selection — sensitive-area edits force sequential. v73 migration touches a sensitive area (preflight chain) → expect sequential, not parallel agents.
- **v73 migration consolidates 6 columns** from 3 separate features (`edited_at`, `edit_history`, `sibling_group_id`, `sibling_index`, `image_url`, `image_prompt`). Roadmap M1 sequence makes this explicit: ship one preflight v72 → v73 function with all 6 columns.

## Suggestion (per CLAUDE.md Suggestion Triggers)

Pure planning session, no production code touched. **No `/qa-sweep` suggestion** — no risk-signal triggers fired.
