# Script-style chat: labeled segments (speech / action / thought / memory / thinking)

Date: 2026-10-08 · Status: DRAFT — awaiting Chris's syntax decision · Origin: Rin chat test session, 2026-10-08

## Why

Chris's words: every reply should read like a script or TV interview — the girl *says something*, *something happens*, or both,
and it must be easy to see which part is which. Replies can carry speech, narration/action, thought, memory, and
non-speech things. The model's hidden thinking belongs in its own small card. Each category gets its own live colour,
for the user's messages as well as the AI's. Unformatted user text means plain spoken speech.

Triggering bug (same session): with `llama-3.2-1b-instruct`, Rin's whole reply was `[Memory] Rainy days are perfect for a good book`
— the app's internal `[Memory]` prefix leaked into the reply, got stored as a memory, was retrieved next turn, and was echoed again
(plus a `<quick_replies>` leak). With `qwen/qwen3.5-9b` (thinking model) the app got `reply: ""` because the answer
was empty while the text sat in `reasoning_content`. Both are failures of the *reply contract*, which this feature defines.

## What already exists (do not rebuild)

- `frontends/sakura/src/lib/parseActions.ts` — tokenizer: `**bold**`, `*italic/action*`, `(narration)`, code. Used for user AND assistant bubbles.
- `FormatRulesEditor.tsx`, `RichComposer.tsx`, setting `rp_style_preset` (server.py ~L211, L1849), prompt sections "RP Style Guide" and "Response Format".
- `backend/llm/adapters/openai_compat.py` + `tests/test_openai_compat_reasoning_models.py` — reasoning-model handling exists; the app path still returned empty.
- `_parse_quick_replies` (server.py L1428) — precedent for pulling a tagged block out of a reply.
- Kokoro per-turn structured contract (when `kokoro_enabled`) — currently OFF in config.

## Design

**Segment kinds:** `speech`, `action` (physical), `narration` (scene), `thought` (inner, unspoken), `memory` (recall, shown quiet),
`thinking` (model reasoning — collapsed card, never in history/memory). Unmarked text = `speech`.

**Parser:** one pure function `parseSegments(text) -> Segment[]` replacing/wrapping `parseActions`. Backwards compatible:
`*x*` → action, `(x)` → narration stay valid. New explicit tags win over shorthand.

**Composer:** typing a tag auto-transforms to the styled form live (the user sees a coloured chip, not raw tags). Unformatted text stays plain speech.

**Colours:** one CSS variable per kind (`--seg-speech`, `--seg-action`, …) defined for all 18 themes; check ≥1 light + ≥1 dark.
User-adjustable later in settings ("live colourisation").

**Model contract:** prompt tells the model to emit the same tags; a tolerant backend normaliser maps `*x*`, `(x)`, `<think>`, `reasoning_content`
into segments, strips internal labels (`[Memory]`, `<quick_replies>`) from stored replies, and falls back to a single `speech` segment on parse failure.

**Storage:** keep `messages.text` as tagged plain text (no migration needed for v1). Segment structure is derived at render time.

## Phases

1. **Reply hygiene (bug fixes, small):** strip `[Memory]` from stored assistant text and from memory writes; handle `reasoning_content` so thinking models never yield an empty reply; clean the poisoned rows. ~2–3 h.
2. **`parseSegments` + tests + colours/theme variables.** Renderer in assistant and user bubbles. ~4–6 h.
3. **Thinking card** (collapsed, distinct styling). ~2 h.
4. **Composer syntax + live transform**, syntax cheat-sheet. ~4–5 h.
5. **Prompt + model contract**, tolerant normaliser, small-model fallback. ~3–4 h.
6. **User colour customisation** in settings. ~2–3 h.

## Sensitive areas touched (from CLAUDE.md)

Theme colour inheritance (18 themes), no surprise UI elements (the thinking card and any syntax hint need Chris's approval of look),
Pydantic↔TS drift if the chat response model gains fields.

## Open decisions (Chris)

- Tag syntax (see below).
- Whether thought and narration are separate or one kind.
- First slice to build.

## Log

- 2026-10-08: drafted from the Rin test session.

## Decisions (Chris, 2026-10-08)

- Tag syntax: **short brackets** — `[a]…[/a]` action, `[t]…[/t]` thought, `[n]…[/n]` narration (speech = unmarked). Legacy `*x*` and `(x)` keep working.
- First slice: **Phase 1 + Phase 2 together** (reply hygiene + `parseSegments` + colours in both bubbles).
