# User Reply Assist — Plan

**Created:** 2026-04-29 (session 22)
**Owner:** chris + claude
**Status:** PLANNING — not started
**Estimate:** Tier 1 only ≈ 8–14h. Full feature (Tiers 1+2+3) ≈ 20–32h.
**Priority (per chris this session):** ABOVE Visual Content in Chat. This is the next major feature to ship after HUD work settles.

## Why this matters (chris's words, paraphrased)

> Chats stall. The user has to think of what to say next, and that friction
> kills retention. Competing apps (spicychat.ai, candy.ai) solve it by
> giving the user 2-3 short reply pills AND a full-message suggestion in
> the user's voice. They also make "actions" easy to express in roleplay
> (`*i hold sakura's hand and say*` style) so users don't have to manually
> indent + italic. I tried these in competitor apps and would use this app
> more / longer if we had it.

Translation:
- **Retention lever** — measured impact in competitor apps. User self-reports they'd use longer.
- **Roleplay quality** — actions vs spoken text styling is table-stakes in NSFW/RP companion apps.
- **Beats Visual Content in Chat in priority** — chris explicitly ranked this above the queued image-gen feature.

## What we're building (three sub-features, ship-able independently)

### Sub-feature A: Reply Suggestion Pills (quick chips for the USER)

2-3 short reply suggestions appear above the composer after the AI sends a message. Clicking a pill drops the text into the textarea (NOT auto-send) so the user can edit before sending. Symmetric to existing `quickChips` (which suggest character-side replies for the AI).

**UI surface:** new row above the composer, BELOW the existing AI quickChips row. Same pill style, slightly different color/border to distinguish "this is what YOU could say" vs "this is what the AI could say next."

**Generation:** lightweight LLM call against the same provider as chat. System prompt: "Suggest 2-3 short, in-voice replies the user could send next. Each ≤ 12 words. Match the conversation tone. Keep them distinct (e.g., curious / flirty / deflect)." Trigger after AI message arrives, throttle to once per AI turn.

**Persistence:** ephemeral. Don't store in DB. Drop on next message send.

### Sub-feature B: Full Message Generation Helper

A small button in the composer (icon: `Wand2` or `Sparkles`, near the mic icons) opens an inline panel showing a full multi-sentence draft message in the user's voice. User can: send as-is, edit, regenerate (different angle), or dismiss.

**Why separate from A:** pills are for "I know roughly what I want to say" friction-killing. Full draft is for "I have no idea what to say" total stall recovery. Different cognitive moment.

**Generation:** heavier LLM call. System prompt includes user's persona (from existing user profile if set), recent message history, character relationship context (Bond level, recent topics), and target draft length (~30-60 words). Stream the generation into the panel.

**UI states:**
- Idle: button visible, not pressed
- Loading: panel open with skeleton/spinner
- Drafted: panel shows text + [Send] [Edit] [Regenerate] [Dismiss] actions
- Edited: textarea takes over, panel closes

### Sub-feature C: Action Syntax with Styled Rendering

`*text in asterisks*` renders as italic with accent color in BOTH directions:
- User messages — `*i hold sakura's hand* it'll be okay.` → italic-accent for the asterisk-wrapped portion, plain for the rest.
- AI messages — same parsing applied to assistant role.

**Why both directions:** users learn by example. If the AI uses italic actions, users will copy the style. If only user side, the AI's plain prose feels lower-quality.

**Parser:** regex `/\*([^*]+)\*/g` → split into segments → render `[plain | italic-accent | plain | italic-accent | ...]`. Edge cases: nested asterisks (don't support), code blocks (skip parsing inside `` ` ``), markdown bold `**text**` (already double-asterisk, our single matches greedy — handle by parsing `**` first).

**Composer affordance:** add a small toolbar button or kbd shortcut (e.g., `Cmd+I`) that wraps selection with `*...*` so users don't need to type asterisks manually. Tooltip: "Add action (italics)".

**Theme contract:** italic + `var(--color-accent)` at 0.85 opacity. Verify on 1 light + 1 dark theme.

## Tier the work

| Tier | Scope | Effort | Ship-able? |
|---|---|---|---|
| **1 — Action Syntax** (Sub-feature C) | Parser + styled renderer + composer button. No LLM cost. | ~3–5h | YES. Highest UX impact per hour. Many users want this even without AI suggestions. |
| **2 — Reply Pills** (Sub-feature A) | New `/api/chat/{id}/user-suggestions` endpoint, async generation, pill row above composer, click-to-fill behavior. | ~5–9h | YES. Independent of Tier 3. |
| **3 — Full Message Draft** (Sub-feature B) | Streaming panel, regenerate flow, persona-aware prompt. Touches LLM context assembler. | ~8–14h | YES, but bigger scope. Defer if Tier 1+2 land smoothly. |

**Recommended order:** 1 → 2 → 3. Tier 1 is the safest free-win with no backend cost. Tier 2 establishes the backend pattern. Tier 3 builds on Tier 2's plumbing.

**Stop conditions per tier:** after each, use the app for ≥10 min of real chat. If the next tier doesn't feel needed, ship and stop. No mandatory escalation.

## Files affected (per tier)

### Tier 1 — Action Syntax

**New:**
- `frontends/sakura/src/lib/parseActions.ts` — pure function, regex parser → segment array. Unit testable in isolation.
- `frontends/sakura/src/test/parseActions.test.ts` — Vitest cases. Coverage: empty, no-actions, single-action, multi-action, nested-rejected, markdown-bold-not-treated-as-action, edge cases.

**Modified:**
- `frontends/sakura/src/components/ChatMessage.tsx` (or wherever message text renders — locate via grep) — call `parseActions()` and render segments with conditional italic+accent style.
- `frontends/sakura/src/views/ChatThread.tsx` — composer toolbar gets `*` toggle button. Wraps selection or inserts `**` and parks cursor between.
- `frontends/sakura/src/hooks/useKeyboardShortcuts.ts` — add `Cmd+I` (or `Ctrl+I`) → wrap-with-asterisks shortcut.

**No backend changes.** Pure frontend.

### Tier 2 — Reply Pills

**New (backend):**
- `backend/llm/user_reply_suggester.py` — module with one function `generate_user_replies(char_id, recent_messages, user_persona) -> list[str]`. Uses existing LLM adapter. Returns 2-3 strings ≤ 12 words each. Caches per-message-hash for 5 min.
- `backend/tests/test_user_reply_suggester.py` — 4-6 cases. Mock LLM, verify count + length cap + dedupe + persona injection.

**New (frontend):**
- New API method in `frontends/sakura/src/lib/api.ts`: `getUserReplySuggestions(charId, lastMessageId): Promise<string[]>`.
- New UI: `UserReplyPills.tsx` component. Renders pill row, click-to-fill behavior (sets `chatStore.draft`, clears pills).

**Modified:**
- `backend/server.py` — new endpoint `GET /api/chat/{char_id}/user-suggestions?after={message_id}`. Calls suggester. Returns `{ suggestions: string[] }`.
- `frontends/sakura/src/stores/chatStore.ts` — add `userSuggestions: string[]` state + `fetchUserSuggestions()` action + `clearUserSuggestions()`. Trigger fetch from `sendMessage` success path AFTER assistant reply lands.
- `frontends/sakura/src/views/ChatThread.tsx` — render `<UserReplyPills>` above composer, between AI quickChips and the textarea row.
- `frontends/sakura/src/test/userReplyPills.test.tsx` — 4 cases. Render with suggestions, click fills draft, clears on send, hidden when AI quickChips visible (don't show both at once — pick one).

**No DB changes.** Ephemeral feature, no persistence.

### Tier 3 — Full Message Draft

**New (backend):**
- `backend/llm/user_message_drafter.py` — heavier counterpart to suggester. Uses full context assembler with user-side framing prompt. Streams response.
- `backend/tests/test_user_message_drafter.py` — 6-8 cases including streaming, regeneration with seed offset, persona-aware tone.

**New (frontend):**
- `frontends/sakura/src/components/UserMessageDraftPanel.tsx` — overlay/inline panel. Streams draft text into a preview. Action buttons: Send, Edit, Regenerate, Dismiss.
- `frontends/sakura/src/hooks/useUserMessageDraft.ts` — encapsulates SSE stream consumption + state machine (idle/loading/drafted/edited).

**Modified:**
- `backend/server.py` — new endpoint `POST /api/chat/{char_id}/draft-message` returning SSE stream.
- `backend/llm/context_assembler.py` — add user-side rendering mode (flips perspective in prompt without changing relationship/lore context).
- `frontends/sakura/src/views/ChatThread.tsx` — composer toolbar gets `Wand2` button → opens `UserMessageDraftPanel`.

**Optional but recommended:**
- `backend/preflight.py` migrate to vNN — add `users.persona_text` column if not already present. Used by Tier 2 + 3 prompts. (Audit current schema first — may already exist as part of user profile.)

## Cross-cutting concerns

### LLM cost / token budget

Tier 2 fires per AI turn. Tier 3 fires on demand. Both add to the user's per-chat token spend. Add to Settings → AI:
- Toggle "Reply suggestions" (default ON)
- Toggle "Message drafts" (default ON)
- "Suggestion model" picker (default = same as chat, allow override to a smaller/faster model for cost)

### "Don't show both at once" rule

If AI quickChips (character-side suggestions for the AI's NEXT reply) are visible AND user reply pills are also visible AND a full draft panel is open — that's 3 competing affordances above one composer. Pick at most ONE visible at a time. Priority: open draft panel > AI quickChips (rare) > user reply pills.

### Action syntax interaction with TTS/voice mode

When TTS reads back a message containing `*action*` segments, do NOT speak the asterisks. Strip them in the TTS pipeline. Add to TTS preprocessor.

### Bond integration

Successful action-syntax usage could grant a small XP nudge ("user is engaging in roleplay"). Defer this — don't bundle with Tier 1. Open as separate post-Tier-1 task if user wants.

## Browser-test gates per tier

Per CLAUDE.md `Verification Before Claiming Success`, every tier requires hand-on browser exercise:

- **Tier 1:** type `i smile *and wink*` in composer, send, verify rendered message has italic accent on `and wink` portion. Repeat with AI response containing `*action*`. Test in 1 light + 1 dark theme.
- **Tier 2:** wait for AI reply, verify 2-3 pills appear above composer. Click one — verify text drops into textarea (NOT auto-sent). Type a different message and send — verify pills clear.
- **Tier 3:** click `Wand2` button, verify panel opens with streaming draft. Click Regenerate — verify new draft. Click Send — verify message goes through normal send pipeline.

## Research references

- **spicychat.ai** — has user reply pills + action syntax (chris source).
- **candy.ai** — same pattern (chris source).
- **Existing in-repo:**
  - `backend/llm/quick_replies.py` (or wherever AI quickChips are generated) — pattern reference for Tier 2 backend
  - `frontends/sakura/src/views/ChatThread.tsx:1167-1201` — pattern reference for pill rendering
  - `docs/research/2026-04-07-competitor-gap-analysis.md` — competitor inventory (likely has notes on this category already)

## Open questions (resolve before starting Tier 2)

1. **Where does user persona live?** Need to audit. If `users.persona_text` exists, use it. If not, do we add a Settings tab for "How would YOU describe your tone in roleplay?" or scrape from chat history (auto-extract from past user messages)?
2. **Pill count: 2 vs 3.** Competitor apps vary. Default 3, configurable in Settings → AI?
3. **Auto-fill vs auto-send on pill click.** Chris implied auto-send earlier in convo ("user can click to continue the convo"). But auto-send removes the edit-before-send safety. Recommend AUTO-FILL with optional Setting to switch to AUTO-SEND.
4. **Tier 3 stream model.** Use same provider as chat? Or always use a fast cheap model (e.g., Cerebras for low-latency draft generation, then user can regenerate with the bigger model)? Cost vs UX tradeoff.

## Stop conditions for the whole feature

After Tier 1 ships, use it for ≥1 day of normal chat. Decide:
- Tier 1 alone enough → done. Move to next priority.
- Tier 2 needed → continue.
- Tier 3 needed → continue (ideally after Tier 2 has soaked).

## Linked

- HUD redesign plan: `docs/plans/2026-04-27-hud-redesign-staged.md` (related: composer toolbar already getting Tier 3 HUD treatment, coordinate)
- Competitor research: `docs/research/2026-04-07-competitor-gap-analysis.md`
- Existing AI quickChips pattern: `frontends/sakura/src/views/ChatThread.tsx:1164-1201`

## Status log

- 2026-04-29 (session 22): plan written. Triggered by user message during Tier 5 wrap-up. NOT started. Blocking on user approval of tier order + answers to Open Questions 1-4.
