# Session Handoff — 2026-05-06 (Session 26)

## Branch: master
## Test Status: 2703 backend passed | TSC: clean
## Commits this session: `d34f86f` (Visual Content MVP Phase 1)

## Completed This Session — Visual Content MVP Phase 1

Single-commit shipping session. Backend foundation for "character sends you a picture" UX. Image-gen infra was already ~80% built; this commit closes the per-character art-style drift gap.

- **Schema v70 → v71** — `characters.image_style TEXT` JSON column. Migration is idempotent + fail-soft. Plan reservation chain still: v71 ✅, v72 (AIE feedback Phase 0), v73 (LoRA), v74 (DSPy).
- **`resolve_character_style(char_id, db_path)` helper** in `backend/image_gen/registry.py`. Read-only short-lived sqlite (`?mode=ro` URI). Returns `("", "")` on every error path so callers can blindly prepend.
- **Endpoint wiring** in `backend/server.py` — `generate_portrait` + `generate_background` prepend positive style to prompt and thread negative style into `gen_cfg.negative_prompt` (composes with caller-supplied negative when both present).
- **Agent tool wiring** in `backend/agent/tools/image_gen.py` — `_execute` does the same prefix logic. `ToolResult.data["prompt"]` now carries the resolved full prompt so Phase 2 can populate `ChatMessage.imagePrompt` for regenerate.
- **Tests:** `backend/tests/test_image_gen_style.py` — 10 new (8 helper branch coverage + 2 endpoint integration). Backend: 2693 → **2703** passing, zero regressions.
- **Status sync:** `CURRENT_STATUS.md` + `MEMORY.md` schema badges bumped to v71, test count to 2703.

### Notable maneuver

Session-24's RichComposer follow-up WIP on `backend/server.py` was intermingled with Phase 1 edits. To extract a clean commit without disturbing the pre-existing WIP:

1. `git show HEAD:backend/server.py > /tmp/server_head.py`
2. Re-applied Phase 1 edits to the temp file via Edit
3. `git hash-object -w /tmp/server_head.py` → new blob SHA
4. `git update-index --cacheinfo 100644,$SHA,backend/server.py` — staged my-only diff without touching the working tree
5. Committed; working tree still has session-24 WIP exactly as inherited

`git diff HEAD backend/server.py` post-commit shows ONLY session-24 hunks (lines 1231 + 5524–6126) — Phase 1 hunks (14164+ in pre-commit numbering) are now in HEAD.

## Work In Progress

Nothing started by this session is incomplete. Phase 2 + Phase 3 are NOT started by design (Phase 2 merge-gated on Ultraplan PR; Phase 3 deferred).

## Known Issues / Bugs

None new this session. The following pre-existing items remain:

- **Empty-LLM-reply bug** — `docs/bugs/2026-04-29-empty-llm-reply.md` (5 fix options documented, not fixed; user runtime config reverted intentionally).
- **Cubism 2 error spam** — suppressed via console.error patch (long-standing).
- **Live2D runtime broken** — Cubism SDK fails to load; chars with `live2d_model` crash viewer.
- **Embedding model issue** — MLX-format model produces garbage; needs standard PyTorch format.
- **Pre-existing model picker no-preview-images bug** — `docs/bugs/2026-04-27-model-picker-no-preview-images.md` (P2, OPEN).

## Files Modified (this session's commit `d34f86f`)

```
 CURRENT_STATUS.md                     |  21 +++-
 backend/agent/tools/image_gen.py      |  28 ++++-
 backend/image_gen/registry.py         |  78 +++++++++++++
 backend/preflight.py                  |  75 ++++++++++++-
 backend/server.py                     |  29 ++++-
 backend/tests/test_image_gen_style.py | 199 ++++++++++++++++++++++++++++++++++
 6 files changed, 414 insertions(+), 16 deletions(-)
```

## Pre-existing Working Tree (NOT mine — session 24 WIP)

The following are session-24 RichComposer follow-up modifications, intentionally untouched:

- `backend/config/app.json`, `backend/storage/app.db`
- `backend/server.py` — chat_stream + `_parse_quick_replies` insertion at L1231 + chat_stream additions L5524–6126
- `frontends/sakura/src/components/DialogueBubble.tsx`
- `frontends/sakura/src/lib/api.ts`, `lib/types.ts`
- `frontends/sakura/src/stores/appStore.ts`, `chatStore.ts`
- `frontends/sakura/src/styles/components.css`
- `frontends/sakura/src/views/ChatThread.tsx`, `SettingsView.tsx`
- Deleted: `frontends/sakura/src/test/quickChips.llm.test.ts`

Untracked:
- `app.db` (root-level DB file)
- `backend/storage/waifu.db.bak.20260506132609` (DB backup from this session's preflight bump)
- `backend/tests/test_quick_replies_parser.py` (session-24 untracked test)
- `docs/research/2026-05-01-settings-dedup-audit.md` (session-24 untracked research)

## Next Session Priorities

1. **Check Ultraplan PR status** — beta-test MVP cloud session at https://claude.ai/code/session_018ZzrXgcHRkgKqsAtpxKbKJ. If merged: unblocks Phase 2 of Visual Content MVP (touches `DialogueBubble.tsx` + `ChatThread.tsx`). If still in flight: wait or pivot to a non-overlapping path.
2. **Visual Content MVP Phase 2** (~6–8h) once Ultraplan PR is on master — `docs/plans/2026-05-06-visual-content-mvp-execution.md` Phase 2. Adds `ImageLightbox.tsx`, `lib/downloadFile.ts`, `regenerateImage` chatStore action, `imagePrompt` field on `ChatMessage`, ImageLightbox.test.tsx (Pattern 4 Framer Motion stub). Phase 1's helper is already populating `ToolResult.data["prompt"]` so the upstream wiring is ready.
3. **Visual Content MVP Phase 3** (~4–6h) — `scripts/draft_character_styles.py` (LLM-drafts 13 builtin char styles to a reviewable JSON file), retention cleanup in `_run_scheduler_tick`, README schema-badge bump, stuck-generation UI in DialogueBubble (depends on Phase 2's `imagePrompt` field). Phase 3 draft step is unblocked from Phase 1; the stuck-gen sub-task waits for Phase 2.
4. **Memory Browser `updateUserFact` cleanup** (~30 min, autonomous) — `docs/plans/2026-05-06-memory-browser-api-unification.md`. Single PATCH wrapper at `MemoryBrowser.tsx:542`. Must run AFTER Ultraplan PR merge.
5. **Resolve session-24 WIP** — RichComposer follow-up working-tree mods need a decision (finish + commit, push as-is, or discard). Pre-existing `_parse_quick_replies` + `chat_stream` chunks have been sitting since session 25.
6. **AIE Phase C tier decision** — `docs/plans/2026-05-06-aie-phase-c-scoping.md` Section 6. User picks MVP / Standard / Full / Defer. Quick fork; unblocks LoRA + DSPy execution plan author.

## Context for Next Session

- **Schema v71 active.** New characters.image_style column is NULL for all 13 builtin chars. Phase 3's `draft_character_styles.py` is the natural follow-up to populate it.
- **Active plan files** (priority order): `docs/plans/2026-05-06-visual-content-mvp-execution.md` (Phase 2 next) → `docs/plans/2026-05-06-memory-browser-api-unification.md` → `docs/plans/2026-05-06-aie-phase-c-scoping.md`.
- **Session-24 WIP discipline:** the `git show HEAD: + hash-object + update-index` pattern works for surgical commits when working tree has unrelated unfinished work. Reuse this if Phase 2 needs to land alongside the still-WIP RichComposer mods.
- **Push gate:** clear (no OPEN BUG / UNFIXED / BLOCKER markers anywhere). Local commit only — user decides push.
- **Suggestion-trigger fired:** Schema migration committed this session → CLAUDE.md "Suggestion Triggers" rule recommends `/qa-sweep` at the commit/handoff boundary. User has previously vetoed `/qa-sweep` mid-flow but allows it at handoff. Suggested in final report below.
