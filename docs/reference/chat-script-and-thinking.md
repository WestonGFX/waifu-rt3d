# Script-style chat, thinking card, reply animation — what shipped

**Date:** 2026-10-08 · **Branch:** `claude/busy-planck-rg90lh` (PR #5) · **Schema:** v90
**Living plan (history, decisions, what is next):** [`docs/plans/2026-10-08-script-style-chat-segments.md`](../plans/2026-10-08-script-style-chat-segments.md)
**Visual references (open in a browser):** [`docs/design/2026-10-08-script-chat-looks-mockup.html`](../design/2026-10-08-script-chat-looks-mockup.html), [`docs/design/2026-10-08-thinking-panel-options-mockup.html`](../design/2026-10-08-thinking-panel-options-mockup.html)
**Every setting + HUD element in the app:** [`settings-and-hud-inventory.md`](settings-and-hud-inventory.md) (frontend prefs, HUD, shortcuts) and [`docs/SETTINGS_REFERENCE.md`](../SETTINGS_REFERENCE.md) (backend `app.json`).

This file is the single place to learn how the three features fit together. If you change one of them, update this file in the same commit.

## 1. Script-style messages (speech / action / scene / thought / memory)

A message reads like a script. Unmarked text is **speech**. Parser: `frontends/sakura/src/lib/parseSegments.ts` (pure, tested in `src/test/parseSegments.test.ts`).

| You write | Becomes | Notes |
|---|---|---|
| plain text | speech | |
| `[a]…[/a]` | action | case-insensitive |
| `[n]…[/n]` | narration / scene | |
| `[t]…[/t]` | thought | |
| `[m]…[/m]` | memory ("Recall") | |
| `*…*` | action | legacy shorthand, still works |
| `(…)` (4+ chars) | narration | legacy shorthand |
| leaked `[Memory] …` line | memory | internal prompt label that small models copy; shown as Recall, never as literal text |
| code fences, `` `code` ``, `**bold**` | untouched, stay in speech | |
| unclosed tag | stays literal text | nothing is swallowed |

Rendering: `ScriptText` in `components/DialogueBubble.tsx` (used for both user and assistant bubbles). A message that is only speech renders exactly as before in every style (no extra chrome). Styles live in `styles/segments.css`; segment colours are `color-mix()`ed against each theme's text colour so they stay readable in all 23 themes.

**Chat style** (setting `chatStyle`, default **storybook**): `screenplay` (film-script blocks), `transcript` (Say / Do / Scene / Think / Recall tag gutter), `storybook` (speech bubbles, floating actions, cloud thoughts). Decided by Chris 2026-10-08: A screenplay was first pick, then C storybook became default; all three ship.

**Not built yet:** live colouring while typing in the composer (plan phase 4); telling the model to emit the tags (phase 5 — today only legacy `*action*` / `(narration)` appear from models).

## 2. Thinking card (model reasoning + raw output)

The model's reasoning is kept apart from Rin's reply and shown in a card **above** the reply (mock-up option **X**).

- **Adapter** (`backend/llm/adapters/openai_compat.py`): reasoning deltas (`delta.reasoning_content`) are yielded as `ReasoningChunk` (a `str` subclass, so plain-join consumers still work). Non-stream `chat()` returns `reasoning` separately.
- **Stream** (`/api/chat/stream` in `backend/server.py`): `ReasoningChunk`s become SSE event **`thinking`** `{t}`; they are never added to the reply. The `done` event carries `thinking` and `raw_output` (the reply exactly as typed, before parsing/stripping). The agentic/tool path is unchanged.
- **Storage:** schema **v90** adds nullable `messages.thinking` and `messages.raw_output` (`backend/preflight.py` `migrate_to_v90`, tests `backend/tests/test_preflight_v90.py`). `GET /api/sessions/{id}/messages` returns them when the columns exist.
- **Never** injected back into a prompt, and never written to memory.
- **Frontend:** `chatStore.ts` handles `thinking` + `done`; `components/ThinkingCard.tsx` + `styles/thinking.css`; `lib/thinkingSignals.ts` (`soundsLikeAssistant`, `thinkingPreview`) powers the "Reads like an assistant" notice (reasoning that reads like a generic assistant means the prompt/model is not holding the role-play).
- **Setting** `thoughtsMode` = `off` | `peek` (default) | `open`. No keyboard shortcut by design.
- **Planned, not built:** aggregate the assistant-voice signal per model in `tools/bench`; opt-in local export of thought+reply pairs for tuning (never leaves the machine); final look = pick one of *Quiet glass* (in the app now) / *Editorial* / *Pearl* from the polish comparison.

## 3. Reply animation

Setting `replyDelivery`: `live` (default; words stream as written), `fade` (wait for the whole reply, then fade it in), `beats` (wait, then script segments cascade in, 0.3 s stagger, capped). Implemented in `DialogueBubble.tsx` (held-back placeholder while streaming; reveal plays once, only for replies that arrived live — history never animates) and `styles/segments.css` (`replyReveal`). `prefers-reduced-motion` disables it. Not built: typewriter.

## 4. Reply hygiene (bug fixes found while testing)

- `backend/llm/reply_hygiene.py` `strip_internal_labels`: leaked `[Memory]` line prefixes and unterminated `<quick_replies>` tags are stripped before a reply is stored and when memories are recalled (both reply-finalize sites in `server.py` + `context_assembler.py`). Before this a small model's `[Memory] …` reply was stored, re-labelled on recall and echoed forever.
- `_merge_system_messages` (`openai_compat.py`, Qwen3-family only): Qwen's chat template rejects a system message after a user turn (LM Studio returned HTTP 500 and the reply came back empty). Leading system messages merge into one; late ones fold into the **final user turn** so a trailing instruction keeps its recency.

## 5. Settings added (all persisted in localStorage key `sakura-app`)

| Setting | Values | Default | UI |
|---|---|---|---|
| `chatStyle` | screenplay / transcript / storybook | storybook | Settings → General → Chat style |
| `thoughtsMode` | off / peek / open | peek | Settings → General → Model thinking |
| `replyDelivery` | live / fade / beats | live | Settings → General → Reply animation |

Dev-server-only default theme: **Blurple** (dark + blue) via `hooks/useTheme.ts` (`import.meta.env.DEV`, only when nothing is saved in `sakura-theme`; production keeps `sakura`).

## 6. Known issues / traps

- **Incognito mode never sends the user's message to the model** (the prompt is built from stored history and incognito stores nothing). Do not test chat with incognito.
- **Thinking models are slow:** `qwen/qwen3.5-9b` with `llm.thinking_mode: true` can reason for minutes (thousands of tokens) before answering; `max_tokens` is -1. Peek/Off in the UI helps display, not speed. If the whole budget goes to thinking, the reply is empty and only the card shows.
- **Live bubble can flash a leaked `[Memory]`** until the stored reply replaces it (label stripping happens at finalize).
- **Dev-server testing trap:** after HMR the app's modules are served as `…chatStore.ts?t=<n>`; a plain dynamic `import()` gets a *different* store instance. Reload, then import the exact URL from `performance.getEntriesByType('resource')`.
- **Schema v90 is taken** by the thinking columns. The earlier Kokoro plan reserved v90 for Emotional RAG (`memories.mind_state_snapshot`); that migration is now **v91**.
- Flaky under full-suite load (passes alone): two `MemoryBrowser.test.tsx` Facts-tab tests.

## 7. Rules these features follow

No single-letter keyboard shortcuts · Lucide icons only (no emoji) · theme CSS variables only (check 1 light + 1 dark) · no surprise visible UI without approval · thinking/raw output never re-enter prompts or memory · schema changes only via `preflight.py` (append-only).

## 8. Tests

Backend: `test_reply_hygiene.py`, `test_openai_compat_reasoning_models.py` (merge + ReasoningChunk), `test_preflight_v90.py`. Frontend: `parseSegments.test.ts`, `thinkingSignals.test.ts`, `appStore.chatPreferences.test.ts`. (Baseline after this work: 3,264 backend, 537 frontend.)

## 9. Code map

`lib/parseSegments.ts` · `components/DialogueBubble.tsx` (`ScriptText`, `ThinkingCard` mount, reply-delivery logic) · `components/ThinkingCard.tsx` · `styles/segments.css` · `styles/thinking.css` · `stores/appStore.ts` (`chatStyle`, `thoughtsMode`, `replyDelivery`) · `stores/chatStore.ts` (`thinking` SSE) · `views/SettingsView.tsx` (General tab) · backend: `llm/reply_hygiene.py`, `llm/adapters/openai_compat.py`, `server.py` (`chat_stream`, `get_session_messages`), `preflight.py` (`migrate_to_v90`).
