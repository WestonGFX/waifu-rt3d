# Image URL + Image Prompt Not Persisted to messages Table

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P2
**Component:** `backend/preflight.py` (messages table schema), `backend/server.py` (`get_session_messages` + chat-stream tool_result persistence), `frontends/sakura/src/stores/chatStore.ts` (`loadHistory`)
**Discovered via:** session 29 wave 2 browser QA sweep + code audit

## Summary

When the LLM agent generates a portrait via `generate_image` tool call, the resulting URL + prompt land in the in-memory `ChatMessage` object (`imageUrl` + `imagePrompt`) and render correctly during the live session. They are NEVER written to the `messages` table on the backend. On page reload, `loadHistory` does not re-populate either field. Effects:

1. Regenerated images vanish on reload (the chat history shows text only).
2. The Regenerate button never appears on history messages, because it depends on `imagePrompt` being present.
3. `ChatImageLightbox` cannot open on history images (no `imageUrl`).
4. Image gallery and chat-image flow are out of sync — gallery has the file, chat does not have the link.

## Repro

1. Send a message that triggers `generate_image` (e.g. "send me a selfie").
2. Assistant replies, image renders inline.
3. Click Regenerate inside the lightbox — works.
4. **Reload the page (F5).**
5. **Expected:** image still rendered inline in the assistant bubble; regen button still present.
6. **Actual:** assistant bubble shows text only; image is gone; regen button is gone.

## Root Cause

Schema and read-path both lack the columns:

- `backend/preflight.py` `migrate_to_v3` (initial messages table) — no `image_url` or `image_prompt` columns.
- `backend/server.py` `get_session_messages` SELECT — does not project either column even if added.
- `chatStore.ts` `loadHistory` — does not assign `imageUrl` / `imagePrompt` from the API response.
- `chatStore.ts` `tool_result` SSE handler captures `imagePrompt` but only into the in-memory message; no backend persistence call.

## Suggested Fix Direction

One-shot migration v73 (or absorb into the v73 sibling-message migration in the retry/regen bug doc — both are messages-table edits):

1. **Schema:** add `image_url TEXT NULL`, `image_prompt TEXT NULL` to `messages` (idempotent ALTER guarded by `_column_exists` helper used in earlier migrations).
2. **Backend write path:** in the chat-stream tool_result handler, after an image is generated, INSERT/UPDATE the assistant message row with `image_url` + `image_prompt` populated. Same pattern used today for `content` + `meta`.
3. **Backend read path:** project both columns in `get_session_messages` SELECT.
4. **Frontend restore:** `loadHistory` in `chatStore.ts` assigns `imageUrl` + `imagePrompt` from each message row.

Effort estimate: ~2-3h. No new endpoints needed. Test additions: 1 backend pytest case (round-trip image fields through messages table), 1 vitest case (loadHistory restores imageUrl).

## Related

- Visual Content MVP execution plan `docs/plans/2026-05-06-visual-content-mvp-execution.md` — Phase 2 explicitly listed `imagePrompt` field on `ChatMessage` as deferred work. This is that work.
- Session 29 commit `5349b42` (`feat(viz-mvp-p2): chat image lightbox + regenerateImage`) shipped the in-session flow but explicitly deferred persistence: "Phase 2 (lightbox / `imagePrompt` field / regenerateImage — gated on Ultraplan PR merge)" — the field-on-message work was the gated piece.
- The "stuck-gen indicator" Phase 3 finisher in CURRENT_STATUS depends on this bug being fixed first (the planned signal `imagePrompt set + imageUrl absent` only works if both fields are persisted).
