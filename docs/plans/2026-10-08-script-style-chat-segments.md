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

## Addendum 2026-10-08 — keep the model's thinking as a feature + as tuning data (Chris)

Chris: the thinking transcript should be viewable by the user (some will want it) and the raw thoughts should be kept as analytical
data — to tune models, and as a signal: if a local model's thoughts read like a generic assistant ("Thinking Process: 1. Analyze the
Request…") instead of the character, the roleplay prompt/model is off. Observed live today: `qwen/qwen3.5-9b` thought in assistant-voice
for ~4.6k tokens (see commit 49c65a3b notes).

Plan (ordered, nothing built yet):
1. **Thinking card (phase 3):** adapter returns `reasoning` separately from `reply` (no more mixing); SSE gets a `thinking` field; stored in a new
   `messages.thinking` column via a `preflight.py` migration (append-only, v89 → v90). Collapsed card in the bubble. Never injected into future prompts or memory.
2. **Persona-drift signal:** cheap heuristic on stored thinking (assistant-voice openers, "the user", numbered analysis headers, no first-person character voice) →
   a per-model "in character" rate. Same style as the Kokoro bench harness (`tools/bench`), reusable as a new metric.
3. **Opt-in, local-only training export:** thinking + reply pairs written to a local file only if the user turns it on. These are private chats —
   never leave the machine (privacy-first rule). Consent switch + a "forget" that also deletes exported rows.
4. **Model choice (decide with data, not now):** first measure existing open models with the bench harness; only then consider a LoRA. Format: GGUF runs on
   both the Mac and the Windows GPUs through LM Studio; MLX is Mac-only. Verify current model availability and licences live before picking a base (these change fast).

## Known limitation (phase 1) — live bubble (PR #5 review, item 5)

Label stripping happens when a reply is finalized/stored, not while tokens stream. During streaming the user may briefly see a leaked
`[Memory] …` in the live bubble until the stored version replaces it. The phase-2 `parseSegments` normaliser should also strip internal labels on the live path.
