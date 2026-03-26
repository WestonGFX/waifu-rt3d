# Waifu-RT3D: Code Review + Feature Roadmap

## Context

Full audit of backend, Sakura frontend, and feature landscape (Feb 27 2026).
Goal: identify real bugs to fix + surface the most impactful new features.

---

## Part 1: Confirmed Bugs to Fix

### 🔴 CRITICAL — Privacy / Data Integrity

#### Bug 1: Incognito mode leaks relationship updates
- **File:** `backend/server.py`
- **Problem:** When `incognito=True` the message is not saved, but `_update_relationship()` is still called on both the agentic path (~line 2505) and non-agentic path (~line 2723). Incognito should suppress ALL side-effects including affinity/mood/trust changes.
- **Fix:** Add `if not incognito:` guard before both `_update_relationship()` calls.

#### Bug 2: `import_session` drops `char_id`
- **File:** `backend/server.py` ~line 3273
- **Problem:** When importing a session from JSON, the INSERT for messages doesn't include `char_id` — it defaults to NULL. Imported chat history loses its character association.
- **Fix:** Pass `char_id` from the import payload to the message INSERT.

---

### 🟠 HIGH — Broken Functionality

#### Bug 3: `lmstudio_rest.py` adapter is non-functional
- **File:** `backend/llm/adapters/lmstudio_rest.py`
- **Problems:**
  - Line 33-51: Only sends the last user message, not full conversation history — breaks multi-turn chat
  - Lines 75-93: Response parsing has cascading fallbacks that succeed silently on garbage responses
  - URL construction is fragile
- **Fix:** Either rewrite using `OpenAICompatAdapter` as base (same as how `OllamaAdapter` was fixed), OR remove from the registry since LM Studio already works perfectly via `openai` provider.
- **Recommendation:** Remove from `registry.py` — users should use `provider: openai` with LM Studio.

#### Bug 4: Agent runner has no timeout
- **File:** `backend/agent/runner.py`
- **Problem:** If the LLM adapter hangs (LM Studio unresponsive), the agent loop runs `max_rounds=3` with no wall-clock timeout. The entire request hangs forever, blocking the connection.
- **Fix:** Wrap `adapter.chat_stream()` call in `asyncio.wait_for(coro, timeout=cfg.get("llm_timeout", 90))`.

#### Bug 5: Webhook call outside try-except in streaming path
- **File:** `backend/server.py` ~line 2782
- **Problem:** `_fire_webhooks()` is called after the `try` block in the streaming generator, meaning a webhook exception crashes the entire stream response mid-flight.
- **Fix:** Wrap webhook calls in their own `try/except Exception`.

---

### 🟡 MEDIUM — UX Issues

#### Issue 6: CreateView shows no loading state
- **File:** `frontends/sakura/src/views/CreateView.tsx` ~line 360
- **Problem:** `creating` state is set to `true` when creating a character but never rendered — user gets no spinner or feedback; looks like the button didn't work.
- **Fix:** Show a spinner / disable the button when `creating === true`.

#### Issue 7: SettingsView saves silently fail
- **File:** `frontends/sakura/src/views/SettingsView.tsx` ~line 338+
- **Problem:** `saveConfig()` errors are caught and logged but no toast or UI feedback is shown. User doesn't know if their settings saved.
- **Fix:** Add a brief toast or success indicator ("Saved ✓") after `saveConfig()` resolves.

#### Issue 8: `useProactive` hook is defined but never called
- **File:** `frontends/sakura/src/hooks/useProactive.ts`
- **Problem:** The idle message hook (5-min silence → character sends message) is fully implemented but never imported in `ChatThread.tsx`.
- **Fix:** Import and wire `useProactive()` into `ChatThread`.

#### Issue 9: VocabPanel breaks on mobile screens < 520px
- **File:** `frontends/sakura/src/components/VocabPanel.tsx` ~line 490
- **Problem:** Fixed `width: '520px'` overflows viewport on phones.
- **Fix:** Change to `maxWidth: 'min(520px, 94vw)'`.

---

## Part 2: Feature Improvements (No New Features)

These improve existing features without adding new backend routes:

| # | Change | File(s) | Impact |
|---|--------|---------|--------|
| P1 | Add `aria-label` + `aria-pressed` to all icon buttons | All components | Accessibility |
| P2 | Add `role="dialog"` + `aria-modal` to VocabPanel, MemoryPanel overlays | `VocabPanel.tsx`, `MemoryPanel.tsx` | Accessibility |
| P3 | Relationship tier badge in ChatThread header (Devoted/Close/Friendly/etc.) | `ChatThread.tsx` | Surface existing data |
| P4 | Diary snippet shown at session start ("Last time, [character] wrote...") | `ChatThread.tsx` + `/api/characters/{id}/diary` | Immersion |
| P5 | Voice input quick-toggle mic button in chat composer | `ChatThread.tsx` | Discoverability of STT |
| P6 | OBS overlay "Getting Started" tooltip in Neon/Sakura settings | Settings | Feature discovery |

---

## Part 3: Major New Features

### Tier 1 — High Impact, Moderate Effort (1–3 days each)

#### Feature A: **Voice-First Conversation Mode** 🎤
> "Hands-free chat — just talk and she responds."

The STT + TTS pipeline is already fully built. This just needs a UI mode that wires them together seamlessly.

- **UX:** Mic icon in ChatThread → toggles "voice mode" — continuous Faster-Whisper transcription, auto-sends on silence, character responds with audio-first (text as subtitle)
- **Backend:** No new endpoints needed. `/api/asr/transcribe` + `/api/chat/stream` already exist.
- **Frontend:** New voice mode state in `chatStore`, VAD indicator, live transcription preview in composer
- **Files:** `ChatThread.tsx`, `chatStore.ts`, new `useVoiceMode.ts` hook
- **Why it's huge:** Differentiates from every text chat UI; makes the companion feel real

---

#### Feature B: **Relationship Timeline** 📅
> "A visual story of your relationship — milestones, diary, affinity arc."

The data already exists (timestamps, affinity scores, diary entries). This surfaces it beautifully.

- **UX:** New tab in the Memory/Relationship panel — a vertical timeline showing: first message, affinity unlocks (Neutral → Friendly → Close → Devoted), diary entry excerpts, session milestones ("100th conversation"), anniversary markers
- **Backend:** New `GET /api/characters/{id}/timeline` that joins sessions, relationship log, diary table by date
- **Frontend:** New `TimelinePanel.tsx` component; accessible from CharacterCard or chat header
- **Files:** `server.py` (new endpoint), `TimelinePanel.tsx`, `CharacterCard.tsx`
- **Why it's huge:** Transforms abstract numbers into emotional narrative; huge driver of long-term retention

---

#### Feature C: **Scheduled Messages / "Thinking of You"** ⏰
> "She sends you a morning message. She checks in when you've been away."

Makes the character feel autonomous and persistent even when you're not in the app.

- **UX:** Character settings → "Proactive Messages" toggle + schedule picker (morning, evening, after X hours away). Frontend shows notification badge when a scheduled message arrives.
- **Backend:** New `character_schedules` table + background scheduler task (`_schedule_loop` runs every 5 min). Uses existing agentic `send_message` capability.
- **Frontend:** Toast/badge when new message; click opens chat directly
- **Files:** `server.py` (scheduler + endpoint), `preflight.py` (schema migration), `appStore.ts` (notification state), `ChatThread.tsx`
- **Why it's huge:** App feels like a real relationship vs. a tool you open; dramatically increases DAU

---

#### Feature D: **In-Chat Expression & Gesture Picker** 🎭
> "Tell her to wave. Make her do a peace sign. Preview your personality settings live."

The 6-layer animation pipeline is fully built but invisible to users.

- **UX:** Floating toolbar above chat composer with quick-trigger buttons: wave 👋, dance 💃, think 🤔, laugh 😄 + expression picker (smile, angry, surprised, blush). Clicking sends a gesture event directly to the VRM viewer.
- **Backend:** New `POST /api/viewer/gesture` endpoint → emits WebSocket event to VRM viewer
- **Frontend:** `GesturePicker.tsx` component in `ChatThread.tsx`; connects to existing `postMessage` API on the embedded viewer iframe
- **Files:** `server.py` (gesture endpoint), `ChatThread.tsx`, new `GesturePicker.tsx`
- **Why it's huge:** Makes the 3D model interactive instead of passive; immediately "wow" factor for new users

---

#### Feature E: **Chat Branching / Dialogue Choices** 🔀
> "A visual novel feel — she offers you choices sometimes."

Adds a narrative dimension to conversation without requiring new infrastructure.

- **UX:** When LLM response contains `[CHOICES: A) ... | B) ... | C) ...]` syntax, the frontend renders choice buttons instead of free-text input. Clicking a button sends it as the user's reply.
- **Backend:** Add choice-block detection in streaming SSE parser; emit `event: choices` with options array
- **Frontend:** `DialogueBubble.tsx` renders choice buttons; `chatStore.ts` handles selection
- **System prompt injection:** When character has "branching_enabled" flag, inject: *"When appropriate, offer the user 2–3 dialogue choices formatted as [CHOICES: A) ... | B) ... ]"*
- **Files:** `server.py` (SSE parser), `DialogueBubble.tsx`, `chatStore.ts`, character settings
- **Why it's huge:** Visual novel genre has massive overlap with VRM/anime audience; minimal backend work

---

### Tier 2 — Medium Impact, Lower Effort (few hours each)

#### Feature F: **Diary Browser**
Full searchable UI for character diary entries (already written by the agent tool but buried in Settings).
- New tab in MemoryPanel: chronological diary with date, mood icon, full text on expand
- Backend: `GET /api/characters/{id}/diary/entries?page=&search=`

#### Feature G: **Character Stats Dashboard**
New Settings tab: lifetime message count, session count, affinity history graph (sparkline), emotional breakdown pie chart (% time happy/sad/love/etc.), longest streak.
- Uses existing data from `messages`, `relationship` tables
- Frontend: simple `<StatsTab>` with chart.js or recharts sparklines

#### Feature H: **Voice Per Emotion**
Different TTS voice for different moods (happy voice vs sad voice vs angry voice).
- Character settings: emotion → voice_id mapping JSON
- Backend: `_pick_tts_voice()` checks `char.voice_overrides` before defaulting
- Makes speech dramatically more expressive with zero architecture change

#### Feature I: **Scene Background Generator (Auto)**
When affinity or conversation topic changes significantly, auto-generate a matching background via ComfyUI — e.g., rainy window for a sad conversation, sunny park for a happy one.
- Backend: add `scene_background_trigger` logic in `_update_relationship()`
- Uses existing `generate_background` endpoint

---

### Tier 3 — Ambitious / Long-Term

#### Feature J: **Multi-Character Scenes**
2–4 characters in one chat session; round-robin LLM calls with shared context; multiple VRM models in the viewer.
- Requires multi-avatar rendering in `frontends/shared/` viewer
- New `scene_characters` join table

#### Feature K: **Mobile PWA**
`manifest.json` + service worker → installable on iOS/Android from browser.
- Cache chat history + audio for offline viewing
- Push notifications for scheduled messages

#### Feature L: **Character Discovery Hub**
Export character as shareable JSON card (sanitized — no private data). Import from URL or file. Community character library page.
- One-click share button on CharacterCard
- Optional central hub website (out of scope for this repo)

#### Feature M: **Story Mode / Campaigns**
Pre-scripted narrative arcs with branching outcomes based on relationship choices. Each campaign has acts, scenes, and consequences that modify character personality over time.

---

## Part 4: Recommended Execution Order

```
Sprint 1 (bugs first):  Bug1 (incognito) → Bug2 (import_session) → Bug3 (lmstudio_rest) → Bug4 (agent timeout) → Issue6 (CreateView spinner) → Issue8 (useProactive)

Sprint 2 (quick polish): P3 (tier badge) → P4 (diary snippet) → P5 (mic button) → Issue7 (settings save feedback) → Issue9 (VocabPanel mobile)

Sprint 3 (Feature A): Voice-First Mode — biggest differentiator
Sprint 4 (Feature D): Gesture Picker — most immediately visible
Sprint 5 (Feature B): Relationship Timeline — best for retention
Sprint 6 (Feature C): Scheduled Messages — deepens companion feeling
Sprint 7 (Feature E): Dialogue Choices — visual novel hook
```

---

## Key Files Referenced

| File | Role |
|------|------|
| `backend/server.py` | All backend fixes (incognito, import, webhooks) |
| `backend/agent/runner.py` | Timeout fix |
| `backend/llm/adapters/lmstudio_rest.py` | Remove or rewrite |
| `backend/llm/registry.py` | Remove lmstudio-rest from routing |
| `frontends/sakura/src/views/CreateView.tsx` | Loading state |
| `frontends/sakura/src/views/SettingsView.tsx` | Save feedback |
| `frontends/sakura/src/hooks/useProactive.ts` | Wire into ChatThread |
| `frontends/sakura/src/components/VocabPanel.tsx` | Mobile width fix |
| `frontends/sakura/src/views/ChatThread.tsx` | Voice mode, gesture picker, choice buttons, tier badge |
| `frontends/sakura/src/stores/chatStore.ts` | Voice mode state |
