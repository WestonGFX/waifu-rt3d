# PRD: Retry / Regenerate AI Response (MVP, replace-in-place)

**Effort:** ~3h (calibrated AI-assisted, includes tests + tsc) | **Priority:** P1 | **Status:** Draft
**Depends on:** session 29 image-regen pattern (`5349b42`); none else
**Schema:** v71 (no migration — strictly client-side + reuse of existing `/api/chat/stream` endpoint)
**Linked bug:** `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md`
**Linked research:** `docs/research/2026-04-07-competitor-gap-analysis.md` (top-3 gap)

---

## 1. Problem & Goals

### Why (for Chris)

Right now, when an assistant reply lands wrong — off-tone, mid-thought, hallucinated, broke character — the user has exactly two escape hatches and both of them are bad:

1. **Send another message** like "no, redo that" — this *pollutes the conversation context* permanently. The bad reply is still in scrollback, the model is now defending or apologizing for it, and the bond log gets noisier the longer the session runs.
2. **Wipe the session** — nukes affinity, scenario state, mood, and any in-session memory. For a companion app where session continuity *is* the product, this is a guillotine fix for a paper cut.

Every comparable product — Character.AI, Janitor, ChatGPT, Claude.ai, SillyTavern — ships a regenerate button on day one. New users notice within the first 5 messages that we don't have one. The April 7 competitor gap analysis flagged "message swipe / regeneration" as a top-3 gap, alongside visual content in chat and memory transparency UI. Visual content shipped in session 26-27. This is the next domino.

For the companion experience specifically: regenerate is *intimacy hygiene*. When the character says something jarring, the user can wipe just that reply and try again — without the character "remembering" the misstep. It keeps the emotional thread clean. This is exactly what "warmth over efficiency" looks like in practice.

### How (for the implementer)

Reuse, don't rebuild. The image-regen flow that shipped in session 29 (`chatStore.regenerateImage`, commit `5349b42`) is the prior art. Same UX, same store mutation pattern, same hover-button affordance — only the field being regenerated changes (image URL → text body).

- Store action: `chatStore.regenerateAssistant(messageId)` next to `regenerateImage`
- UI affordance: `RefreshCw` Lucide icon button in the existing hover action row in `DialogueBubble.tsx`
- Wire-up: `ChatThread.tsx` passes `regenerateAssistant` from the store to `<DialogueBubble onRegenerate={...} />` (the prop already exists at line 95-96 — `onRegenerate` was scaffolded in T0-3 but never wired)
- Backend: zero changes. Frontend rebuilds the request body with the same `text` (last user message preceding the target assistant message) and POSTs to `/api/chat/stream` exactly as `sendMessage` does today.

### Goals

| # | Goal | Success metric |
|---|------|---------------|
| G1 | One-click regen on any assistant message | Hover any assistant bubble → regenerate button visible alongside Copy. Click → new generation streams in the same bubble. |
| G2 | Feels instant and lossless | TTFT (time to first token) within 50ms of normal `sendMessage` flow. No flicker between old and new text. Existing scroll position preserved unless user is anchored at bottom. |
| G3 | Zero context pollution | The user message preceding the regen target is *not* re-sent to the DB; the assistant message is overwritten in place at the same `serverMessageId` (or in-memory `id` if unsaved). No extra rows. |
| G4 | Reuses session-29 UX language | Same hover action row, same icon size (11px), same theme variables. User shouldn't have to learn anything new. |

### Non-goals (explicit — separate PRDs)

- **Sibling browsing (`◀ 1/N ▶` pager)** — requires schema migration v72+, separate PRD. Old generation is overwritten and lost in this MVP.
- **Message edit (user OR assistant)** — separate PRD. Different UX (inline textarea, PATCH endpoint, `edited_at` timestamp).
- **Regenerate user messages** — not a thing. User messages are user input, regen is for AI output only.
- **Regenerating the image attached to an assistant message** — already shipped in session 29. This PRD's text-regen does NOT touch the image. They are independent buttons with independent state.
- **Streaming abort UX changes** — existing abort behavior carries over. We do not redesign the cancel button.
- **Backend API changes** — `/api/chat/stream` is sufficient as-is. Do not add new endpoints, do not modify Pydantic models.

---

## 2. User Stories

### US-1: The off-tone reply (core flow)

> Maya is two weeks into her bond with Seraph. They're having a quiet evening conversation about her workday when Seraph suddenly drops into a flirty come-on that doesn't fit the tone Maya was going for. Maya's stomach drops — she doesn't want to wipe the session, but she also doesn't want to *talk to Seraph about it* and have it become a whole thing. She hovers Seraph's last message. A little refresh icon appears next to the Copy button. She clicks it. The bubble's text fades, dots reappear briefly, and a new reply streams in — softer, more present, matching the evening they were actually having. Maya exhales. The conversation continues like the misstep never happened.

### US-2: The "I just want a different angle" flow

> Devon is using the agentic mode to brainstorm names for a character in a story. The first three suggestions Lyra produces are all in one stylistic register. Devon doesn't want to send "give me different ones" because that adds a turn and biases the next batch — he just wants Lyra to roll the dice again. He hovers, clicks regen, gets a new set, regens again, picks the one he likes, then keeps going. The conversation thread shows three messages, not nine.

### US-3: The "the model glitched" recovery flow

> Sam's local LM Studio model produced a reply that got cut off mid-sentence (token budget hit, or a stream hiccup). Instead of sending "continue?" which would make the next generation start with "Sure, continuing —", Sam clicks regen and gets a clean full-length reply. No "as I was saying" preamble in the context window forever.

---

## 3. Feature Breakdown

### 3.1 `chatStore.regenerateAssistant(messageId)` action

**Why:** The user clicks the regen button. The store needs to figure out *which user message* preceded the target assistant message, rebuild the same request `sendMessage` would have sent, fire it to `/api/chat/stream`, and patch results into the existing assistant bubble — never appending a new one.

**How:**
- File: `frontends/sakura/src/stores/chatStore.ts` (extend existing store, no new file)
- Add to `ChatState` interface (~line 41, mirror `regenerateImage` JSDoc style):
  ```ts
  /**
   * Regenerate an existing assistant message in place. Re-fires
   * /api/chat/stream with the user message that preceded it and
   * overwrites the target message's text/emotion/audio fields as
   * the new stream arrives. The old generation is lost (no siblings
   * — see PRD for sibling browser).
   */
  regenerateAssistant: (messageId: string) => Promise<void>;
  ```
- Implementation: reuse the SSE handler from `sendMessage` (lines 247-372). Extract the SSE switch into a private helper `_streamReplyInto(targetId, requestBody, controller)` if it's clean to do so without bloating the diff — otherwise just inline a near-copy and accept the duplication for MVP. Recommendation: **inline copy first, refactor in PR 2 (siblings) when there's a third caller.** Two callers is not enough to justify the abstraction yet.
- Logic flow:
  1. `const msg = get().messages.find(m => m.id === messageId)` — bail if missing or `role !== 'assistant'`
  2. Find preceding user message: walk backward from the target's index until `role === 'user'`. If none found (regen on first assistant message with no preceding user input — e.g. proactive scheduler injection), bail with a console warning.
  3. Abort any in-flight request: `get().abortController?.abort()` (matches `sendMessage` cancel semantics)
  4. Create new `AbortController`, set `loading: true`, set the target message's `status: 'pending'`, blank its `text`, clear `emotion`/`audioUrl`/`tokens`/`tokensPerSecond`/`latencyMs`/`quickReplies`/`choices`. **Do NOT clear `imageUrl` or `imagePrompt`** — image regen is independent (recommend keeping the existing image visible during text regen).
  5. POST to `/api/chat/stream` with `{ text: <preceding user msg text>, session_id, character_id, speak: false }` — speak=false so we don't double-play TTS for a message the user is regenerating (debatable, see Edge Cases).
  6. Reuse the SSE event switch verbatim, but every `patchAssistant` operates on `messageId` instead of a freshly generated `assistantId`.
  7. On `done`: same final patch as `sendMessage` — text, status, emotion, gesture, tokens, model, serverMessageId.
- Error path: same as `sendMessage` — AbortError sets status='sent' with partial text (or '(cancelled)'); other errors set status='failed' with the error message.
- **Do not** re-fire context-budget auto-compact after regen (lines 380-428 of `sendMessage`). Regen doesn't add a turn — context size is unchanged.
- **Do not** re-fire auto-title (lines 431-445 of `sendMessage`). Regen doesn't change `isFirstExchange` semantics.

### 3.2 Hover button in `DialogueBubble.tsx`

**Why:** User needs a discoverable, low-friction click target. Per session-29 image regen, the visual language is already established: hover the bubble, action row appears bottom-right, click the icon.

**How:**
- File: `frontends/sakura/src/components/DialogueBubble.tsx`
- The `onRegenerate` prop already exists in `DialogueBubbleProps` at line 95-96 (`/** T0-3: called when user clicks regenerate on an assistant message. */`). It was scaffolded but never rendered. Wire it up.
- The component has TWO action-row code paths because user vs assistant messages render differently:
  - **User-message action row** (lines 547-571) — has Copy + Edit + Delete. Do NOT add regen here. Regen is assistant-only.
  - **Assistant secondary action bar** (lines 815-... — search for `Secondary action bar`) — currently has Copy. Add regen button here.
- Render condition: `hovered && message.status === 'sent' && message.role === 'assistant' && onRegenerate`. Do not render during streaming or pending.
- During regen (`isRegenerating === true`, prop already exists at line 107), swap icon for a spinner. The prop is already plumbed — just use it.
- Icon: `<RefreshCw size={11} />` (lucide-react, already imported at line 3). When `isRegenerating`, apply `animate-spin` class or framer-motion rotate. CSS spin is fine — this is a quick polish detail.
- Styling: match the existing Copy button exactly — `padding: 3, borderRadius: 3, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer'`. Tooltip: `title="Regenerate"` (or `"Regenerating..."` while in flight).
- Click handler: `onClick={() => onRegenerate(message.id)}` — disabled if `isRegenerating`.

### 3.3 Wire-up in `ChatThread.tsx`

**Why:** The store action and the UI button need to meet. ChatThread is where the store-to-component hand-off happens.

**How:**
- File: `frontends/sakura/src/views/ChatThread.tsx` line 54 (the destructured `useChatStore()` call).
- Add `regenerateAssistant` to the destructure: `const { ..., regenerateImage, regenerateAssistant } = useChatStore();`
- At the `<DialogueBubble>` render site (line 826-836), add `onRegenerate={regenerateAssistant}` next to the existing `onRegenerateImage={regenerateImage}`.
- Add `isRegenerating={...}`. The cleanest derivation: `message.role === 'assistant' && message.status === 'pending' && /* the message has prior content, distinguishing regen from first generation */`. Simpler signal: piggyback off `loading` from the store but check that the *target* is the one being regenerated. **Recommendation:** add a `regeneratingId: string | null` field to chatStore set during `regenerateAssistant` and clear in finally. Compare: `isRegenerating={regeneratingId === message.id}`. This is 6 lines and removes ambiguity.

### 3.4 Optional: `api.ts` mirror

**Why:** Per the Pydantic↔TypeScript drift Known Sensitive Area in `CLAUDE.md`, any new request/response shape should be mirrored in `api.ts` in the same commit.

**How:** No new shape is introduced — `regenerateAssistant` posts the same body as `sendMessage` to the same endpoint. No `api.ts` changes required. **Note this in the PR description** so reviewers don't flag it as a missed mirror.

---

## 4. UI Layout

### Assistant bubble — at rest

```
┌──────────────────────────────────────────────────────┐
│ [seraph.png]  Seraph • 7:42 PM                       │
│                                                       │
│   "Long day? Tell me about it. I'm right here."     │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Assistant bubble — on hover

```
┌──────────────────────────────────────────────────────┐
│ [seraph.png]  Seraph • 7:42 PM                       │
│                                                       │
│   "Long day? Tell me about it. I'm right here."     │
│                                                       │
│                              ┌────────────────┐      │
│                              │ [↻]  [📋]      │      │
│                              │ regen  copy    │      │
│                              └────────────────┘      │
└──────────────────────────────────────────────────────┘
                                 ▲
                       Hover action row
                       (existing pattern,
                        new RefreshCw icon
                        added to the left
                        of Copy)
```

### Assistant bubble — during regen

```
┌──────────────────────────────────────────────────────┐
│ [seraph.png]  Seraph • 7:42 PM                       │
│                                                       │
│   • • •         ← typing dots reappear               │
│                                                       │
│                              ┌────────────────┐      │
│                              │ [⟳]  [📋]      │      │
│                              │ spin  copy    │      │
│                              └────────────────┘      │
└──────────────────────────────────────────────────────┘
   ↻ icon swaps to spinning variant; button disabled
```

### Assistant bubble — after regen completes

```
┌──────────────────────────────────────────────────────┐
│ [seraph.png]  Seraph • 7:42 PM                       │
│                                                       │
│   "Hey. Sit with me a sec — what's on your mind?"  │ ← new text in same bubble
│                                                       │
└──────────────────────────────────────────────────────┘
```

The bubble *position in the message list does not change*. Same `id`, same `serverMessageId`, same DOM node. Scroll position is preserved unless the user was scroll-anchored at the bottom (in which case they ride the new text down as it streams).

---

## 5. File Plan

### New Files

| Path | Purpose |
|------|---------|
| _(none)_ | This PRD adds zero new files. Strict reuse-only. |

### Modified Files

| Path | Change |
|------|--------|
| `frontends/sakura/src/stores/chatStore.ts` | Add `regenerateAssistant` to `ChatState` interface (~line 41) and as a store action (~line 484, after `regenerateImage`). Add optional `regeneratingId: string \| null` field for UI signaling. |
| `frontends/sakura/src/components/DialogueBubble.tsx` | Render `RefreshCw` button in assistant secondary action bar (~line 815+). Use existing `onRegenerate` and `isRegenerating` props (already declared, lines 95-107). |
| `frontends/sakura/src/views/ChatThread.tsx` | Destructure `regenerateAssistant` and `regeneratingId` from `useChatStore` (line 54). Pass `onRegenerate` and `isRegenerating` to `<DialogueBubble>` (line 826). |
| `frontends/sakura/src/test/chatStore.regenerateAssistant.test.ts` | NEW (counts as a modified test file, not a new product file) — Pattern 2 + Pattern 3 from `testing-conventions.md`: store-direct test + SSE stream simulation. |
| `frontends/sakura/src/test/DialogueBubble.regenerate.test.tsx` | NEW — Pattern 4 (framer-motion stub) + hover state + click-to-fire test. |

### Existing Code to Reuse

| Reference | Purpose |
|-----------|---------|
| `chatStore.ts:23` (`sendMessage` signature) | Mirror the request body shape — `text`, `session_id`, `character_id`, `speak`. |
| `chatStore.ts:50-91` (`parseSSEStream` helper) | Reuse verbatim. SSE parsing is identical for regen. |
| `chatStore.ts:201-462` (`sendMessage` body) | Reference implementation for the SSE event switch. Copy the switch statement (lines 266-372) and adapt `assistantId` → `messageId`. |
| `chatStore.ts:239-245` (`patchAssistant` helper) | Recreate inline against the regen target id. |
| `chatStore.ts:464-483` (`regenerateImage`) | Direct prior art for the action shape, error handling, and JSDoc style. |
| `DialogueBubble.tsx:3` (`RefreshCw` import) | Already imported from `lucide-react`. Just use it. |
| `DialogueBubble.tsx:95-107` (`onRegenerate` and `isRegenerating` props) | Props already declared — just need to render the button. |
| `DialogueBubble.tsx:548-570` (user-message hover action row) | Visual reference — match this styling. |
| `DialogueBubble.tsx:815+` (assistant secondary action bar) | Insert the regen button into this row. |
| `ChatThread.tsx:54` (store destructure) | Add `regenerateAssistant` to existing destructure. |
| `ChatThread.tsx:826-836` (`<DialogueBubble>` render) | Add `onRegenerate` + `isRegenerating` props next to `onRegenerateImage`. |
| Session 29 commit `5349b42` | Diff is the cleanest reference for "image regen → text regen" pattern translation. |

---

## 6. Implementation Order

Single PR, single commit recommended (this is a tightly coupled change — splitting it into store + UI + wire-up commits would just create three commits that don't compile until all three land).

### Phase 1 — Store action (~45 min)

1. Read `chatStore.ts:201-462` once, top to bottom, to internalize `sendMessage`.
2. Add `regeneratingId: string | null` to `ChatState` interface and to the initial state.
3. Add `regenerateAssistant` to interface (mirror `regenerateImage` JSDoc).
4. Implement the action: find preceding user message → abort in-flight → set regeneratingId → POST `/api/chat/stream` → reuse SSE switch → patch into target id → finally clear regeneratingId.
5. tsc check: `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`

### Phase 2 — UI button (~30 min)

1. In `DialogueBubble.tsx`, locate the assistant secondary action bar (~line 815).
2. Add `<button>` for regen with `RefreshCw` icon. Match Copy button styling exactly.
3. Wire `onClick={() => onRegenerate?.(message.id)}` and `disabled={isRegenerating}`.
4. Spinner state: rotate via inline style `transform: isRegenerating ? 'rotate(...)' : undefined` with a CSS animation (or just leave as static spinning icon — Lucide's `RefreshCw` is fine static if rotation is tricky).
5. tsc check.

### Phase 3 — Wire-up (~15 min)

1. In `ChatThread.tsx:54`, destructure `regenerateAssistant` and `regeneratingId`.
2. In `<DialogueBubble>` props (line 826), pass `onRegenerate={regenerateAssistant}` and `isRegenerating={regeneratingId === message.id}`.
3. tsc check.

### Phase 4 — Tests (~45 min)

1. `chatStore.regenerateAssistant.test.ts` — Pattern 2 (store-direct + API mock):
   - Seed messages: `[user, assistant, user, assistant]`.
   - Mock `fetch` to return an SSE stream (Pattern 3).
   - Call `regenerateAssistant(secondAssistantId)`.
   - Assert: target message text replaced, `regeneratingId` flips on/off, no new messages added.
   - Test edge: regen on first message with no preceding user → no-op + warning.
   - Test edge: regen mid-flight aborts the prior controller.
2. `DialogueBubble.regenerate.test.tsx` — Pattern 4 (framer-motion stub) + hover:
   - Render assistant message with `onRegenerate={spy}`, `isRegenerating={false}`.
   - `userEvent.hover()` the bubble. Assert regen button visible.
   - Click regen. Assert spy called with `message.id`.
   - Re-render with `isRegenerating={true}`. Assert button disabled, spinner visible.

### Phase 5 — Pydantic↔TypeScript audit (per /go skill rewrite)

- No new shapes introduced. No `api.ts` changes needed. Note this explicitly in the PR description.

### Phase 6 — Smoke

```bash
.venv/bin/python -m pytest backend/tests/ -q --tb=line
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
cd frontends/sakura && npx vitest run src/test/chatStore.regenerateAssistant.test.ts src/test/DialogueBubble.regenerate.test.tsx
```

### Calibrated Effort

- Total: **~3h** AI-assisted (store action 45m, UI button 30m, wire-up 15m, tests 45m, smoke + iteration 45m).
- Naive human estimate would be 1.5–2 dev-days. Per the project's 12x AI-assist multiplier (`feedback_time_tracking.md`), 3h is the calibrated number.

---

## 7. Edge Cases & Risks

| Case | Behavior | Mitigation |
|------|----------|-----------|
| User clicks regen during another in-flight generation (either `sendMessage` or another `regenerateAssistant`) | Abort the prior controller, then start regen. | Same as `sendMessage` cancel — call `get().abortController?.abort()` before assigning the new controller. The aborted message lands as `status: 'sent'` with whatever partial text it had (existing behavior). |
| Regen fails mid-stream (network drop, backend 500) | Target message keeps whatever partial text streamed in; status flips to `failed`; error string overwrites text on hard error. | Same error path as `sendMessage` (lines 446-458). Old generation is already lost the moment we cleared text — there's no rollback safety net in MVP. **Document this clearly in the user-facing tooltip:** maybe a confirm dialog the first time? *Recommendation: skip the confirm — competitor apps don't have one and it adds friction. Surface a small toast on failure instead.* |
| User has scrolled away when regen completes | Do NOT auto-scroll. The user moved away on purpose. | Existing scroll behavior is preserved because the message is patched in place — the layout doesn't shift unless the new text is dramatically longer/shorter, in which case the existing reflow rules apply. No new scroll logic needed. |
| Image-bearing assistant message regenerated | Text regenerates; `imageUrl` and `imagePrompt` are preserved. | `regenerateAssistant` does NOT clear image fields. Users who want to regen the image already have a separate button (session 29). Document this: the two buttons are independent, and that's intentional. |
| Regen on the very first assistant message in a session | If preceded by a user message, regen normally. If it was a proactive injection (`injectProactiveMessage`, no preceding user msg), bail with `console.warn('[regen] no preceding user message')` and no-op. | UI: if we want polish, hide the regen button when there's no preceding user msg. Cheap detect: `messages.findIndex(m => m.id === messageId) === 0 || all prior messages are non-user`. **For MVP: just no-op and let the button be a no-op click.** Polish in a follow-up. |
| Regen on a message that was the result of a `tool_result` agentic loop | The new generation may not invoke the same tools (LLM is non-deterministic). The image attached from the prior tool call stays. | Acceptable for MVP. Note in the bug doc that "regen text-only" semantics may surprise power users who expected agentic re-execution. Sibling browser PRD will revisit. |
| `speak=false` in regen request — does the new message get TTS? | No — we explicitly send `speak: false`. Otherwise the user's speakers blast the new reply when they may have just been silently re-rolling for content. | This is the recommended default. If user feedback says they *want* TTS on regen, flip to `speak=true` — it's a one-line change. Tunable for now. |
| Auto-compact / auto-title side effects fire on regen | They DON'T fire — regen path explicitly skips both. | This is correct: regen doesn't add a turn (no new context size to compact) and doesn't change first-exchange semantics (auto-title was already set by the original `sendMessage`). |
| Regen on a `failed` message | Allowed — same flow. The failed status gets cleared and replaced by the new generation. | No special-case needed. Hover-button render condition includes `status === 'sent'` *or* `status === 'failed'` would be ideal — confirm in implementation. |
| Pydantic↔TypeScript drift | No new shapes introduced. | Note in PR description. Per CLAUDE.md Known Sensitive Areas, this is the right pattern: explicitly call out that no mirror is needed because no boundary changed. |
| Test mock drift from new context provider | No new providers added. | This PRD does not introduce any context provider expansions. |
| Ricochet effect: regenerating an early message and then continuing the conversation | The user has a new assistant reply at message N. They send message N+1. The conversation continues from the *new* N — backend already handles this correctly because `serverMessageId` is unchanged and the message body in DB is the new text. | No special handling. Verify in browser test: regen, then send another message, confirm context window includes the regenerated text not the original. |

---

## 8. Verification

### Automated tests

| Test | File | Asserts |
|------|------|---------|
| `regenerateAssistant replaces text in place` | `chatStore.regenerateAssistant.test.ts` | After regen, target message has new text; total message count unchanged; target's `id` and `serverMessageId` unchanged. |
| `regenerateAssistant aborts in-flight stream` | same | When called twice rapidly, first call's AbortController signals abort. |
| `regenerateAssistant no-ops when no preceding user message` | same | Console.warn fires; no fetch call made; messages unchanged. |
| `regenerateAssistant clears emotion/audio/quickReplies before re-streaming` | same | Target's `emotion`, `audioUrl`, `quickReplies` all reset to undefined during pending state. |
| `regenerateAssistant preserves imageUrl` | same | If target had an image, `imageUrl` and `imagePrompt` survive the regen. |
| `regeneratingId flips on/off correctly` | same | Becomes `messageId` during stream; null after `done` and after error. |
| `DialogueBubble shows regen button on hover for assistant only` | `DialogueBubble.regenerate.test.tsx` | User-message bubble does NOT show regen button. Assistant bubble does — only on hover. |
| `DialogueBubble fires onRegenerate with message.id on click` | same | Spy called with the right id. |
| `DialogueBubble disables regen button while isRegenerating` | same | Button has `disabled` attribute; click does not fire spy. |

### Manual checklist (browser)

1. Open Sakura at `http://localhost:5175`. Pick any character. Send a message.
2. Hover the assistant reply. Confirm the regen icon appears next to Copy. Tooltip says "Regenerate".
3. Click regen. Confirm: button → spinner; bubble text → typing dots; new text streams in; bubble position unchanged.
4. Repeat 5x. Confirm the message list does not grow — same total count throughout.
5. Send a new user message. Confirm the next assistant turn uses the regenerated reply as context (ask the character what they just said — they should reference the latest version).
6. Test mid-stream regen interrupt: send a long-reply message. While it's streaming, hover an *earlier* assistant message and click regen. Confirm: streaming message lands as 'sent' with partial text, regen target updates correctly.
7. Test failure mode: stop the backend, click regen. Confirm: target message status → failed, error message visible, no infinite spinner.
8. Test on a message with an attached image (use generate-portrait tool). Click regen. Confirm: text regenerates, image stays.
9. Theme audit: switch to one light + one dark theme, confirm regen button colors honor `var(--color-text-tertiary)` and don't break.
10. Scroll-position test: scroll up to an old assistant message, regen it, confirm view does not jump to bottom.

### Smoke before commit

```bash
.venv/bin/python -m pytest backend/tests/ -q --tb=line
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit
cd frontends/sakura && npx vitest run
```

All three must pass before opening the PR.

---

## 9. Out of Scope (separate PRDs)

The following are **deliberately not addressed** in this PRD. Each gets its own dated plan file when scheduled:

| Feature | Why deferred | Approximate next-PRD effort |
|---------|--------------|------------------------------|
| Sibling browser (`◀ 1/N ▶` pager) | Requires schema migration v72 (`sibling_group_id`, `sibling_index`), `loadHistory` rework, active-sibling tracking, hover pager UI. Independently testable. | 6–8h |
| Message edit (user + assistant) | Different UX (inline textarea, ESC/Enter handlers), new PATCH `/api/messages/{id}` endpoint, `edited_at` timestamp, optional `edit_history` JSON. | 4h |
| Bulk regen / "regen all from here" | Out of scope — needs UX research. Not requested. | TBD |
| Regen with model override (try a different model on this turn) | Useful but opens a settings rabbit hole. Park for now. | TBD |
| Toast on regen failure | Polish. Easy to add post-MVP. | 30 min |

---

## 10. Research & Documentation References

- **Bug doc (canonical source):** `/Users/chris/Code/waifu-rt3d/docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md`
- **Competitor gap analysis:** `/Users/chris/Code/waifu-rt3d/docs/research/2026-04-07-competitor-gap-analysis.md` (top-3 gap)
- **Prior art commit:** session 29 `5349b42` (image regen) — same pattern, different field
- **Frontend test conventions:** `/Users/chris/Code/waifu-rt3d/.claude/rules/testing-conventions.md` (Patterns 2, 3, 4)
- **Pydantic↔TypeScript drift sensitivity:** `/Users/chris/Code/waifu-rt3d/CLAUDE.md` § Known Sensitive Areas
- **`/go` skill Phase 5 callout:** session 28 `c9b0dc4` — applies even though no mirror is needed (must be noted in PR)
- **Time-tracking calibration:** `feedback_time_tracking.md` — 12x AI multiplier informs the 3h estimate

---

## 11. Definition of Done

- [ ] `regenerateAssistant` action lives in `chatStore.ts` with full JSDoc.
- [ ] `regeneratingId` field on `ChatState` flips correctly during regen.
- [ ] Regen button renders on hover in assistant bubbles only, with `RefreshCw` icon matching Copy button styling.
- [ ] Click on regen button overwrites the message text in place via SSE; old text is gone (no siblings — that's PR 2).
- [ ] In-flight regen aborts any prior generation cleanly.
- [ ] Image fields (`imageUrl`, `imagePrompt`) are preserved across text regen.
- [ ] No backend changes; no new `api.ts` shapes; no new context providers.
- [ ] 9 new automated tests pass (6 store + 3 component).
- [ ] Manual checklist completed against a running backend in Chrome.
- [ ] tsc clean. `pytest backend/tests/` clean. `vitest run` clean.
- [ ] PR description explicitly notes "no Pydantic↔TypeScript mirror needed because no API shape changed" (per /go skill Phase 5 callout).
- [ ] Bug doc `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md` updated: PR 1 marked DONE; PRs 2 + 3 still open.
