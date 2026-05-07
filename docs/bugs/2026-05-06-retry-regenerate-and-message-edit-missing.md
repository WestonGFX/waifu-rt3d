# Retry/Regenerate AI Response + Message Edit Missing

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P1
**Component:** `frontends/sakura/src/components/ChatThread.tsx`, `DialogueBubble.tsx`, `chatStore.ts`, backend `messages` table + `/api/messages/*` endpoints
**Type:** Missing feature (filed as bug because users hit it daily and there's no escape hatch)

## Summary

There is currently no way for the user to:

1. **Regenerate an AI response** at a conversation point (the most common user action in every comparable product — Character.AI, Janitor, ChatGPT, Claude, SillyTavern all ship this on day one).
2. **Browse previous generations** at a conversation point (sibling-message browser / "swipe right" to see N alternatives).
3. **Edit a previously sent message** (either side — user or assistant) to fix a typo, redirect tone, or correct a hallucination.

If the assistant generates something off-tone, the user must either send a new message ("can you redo that") that pollutes context, or wipe the session. Both are bad escape hatches.

Note: in-session image regeneration DOES exist (`chatStore.regenerateImage`, session 29 commit `5349b42`). This bug is about the **text reply** regeneration / sibling browsing / edit flows, which are not implemented.

## Repro

1. Send any message to any character.
2. AI replies.
3. Hover the assistant bubble.
4. **Expected:** Regenerate button + sibling-pager (◀ 1/3 ▶) + Edit button.
5. **Actual:** Only Copy and image-regen (when image present). No retry, no swipe, no edit.

## Schema Implications

To support sibling messages cleanly, the `messages` table needs one of:

1. **Sibling group column:** `sibling_group_id` (UUID) + `sibling_index` (int) — siblings share the group, "active" is whichever is referenced from `sessions.last_active_message`. Cheap to add.
2. **Parent-pointer column:** `parent_message_id` — siblings all point to the same parent user message. Active sibling tracked via `messages.is_active_sibling` boolean. Slightly more flexible (allows trees, not just sibling sets).
3. **Message versions table:** separate `message_versions` table joined on `message_id` — keeps `messages` clean but doubles the read query for every message render.

Recommend option (1) for MVP — minimal schema change, matches Character.AI / Janitor model, no extra join in hot path.

For edit, the simpler approach is in-place mutation + an `edited_at` timestamp + an optional `edit_history JSON` column for audit (matches Slack / Discord pattern).

## Suggested Fix Direction

Stage the work into three PRs:

1. **PR 1 — Regenerate button (text):** new `chatStore.regenerateAssistant(messageId)` action; reuses existing `/api/chat/stream` SSE path with the regenerated message replacing the current one in place. No schema change. Single hover button on assistant bubble. ~3h.
2. **PR 2 — Sibling browser:** schema migration v73 (`sibling_group_id`, `sibling_index`); `regenerateAssistant` now appends to siblings rather than replacing in place; bubble shows `◀ 1/N ▶` pager when N > 1. ~6-8h, includes load-history changes.
3. **PR 3 — Message edit:** edit button on user + assistant bubbles → inline textarea → PATCH `/api/messages/{id}` → mutate in place + set `edited_at`. ~4h.

PR 1 unblocks the user's #1 daily pain point with no schema change. PRs 2+3 are higher-leverage but can ship later.

## Related

- Image regeneration shipped session 29 (`5349b42`) — same UX pattern, just for the `image_url` field. Reuse the hover-button + click-to-regen interaction.
- Competitor gap analysis (`docs/research/2026-04-07-competitor-gap-analysis.md`) flagged "message swipe/regeneration" as a top-3 gap. This bug closes it.
- Session 28's /go skill rewrite explicitly added Pydantic↔TypeScript api.ts mirror callout — that callout applies here (regenerate / patch endpoints both need api.ts wrappers).
