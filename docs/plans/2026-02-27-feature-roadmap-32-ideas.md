# Waifu-RT3D: Feature Roadmap — 32 Ideas + Testing Strategy

> **Status:** Reference document — no code changes.
> **Date:** 2026-02-27
> **Context:** Follows completion of the Analytics Dashboard (AnalyticsPanel.tsx + /api/characters/{id}/analytics).

---

## Part 0 — Testing Strategy

### Recommendation: Use Claude in Chrome now. Enable Playwright if you want regression coverage.

**Claude in Chrome (already enabled):**
- Great for spot-checking UI after each feature: open the Sakura frontend,
  click the BarChart2 button, verify the AnalyticsPanel slides in, check each section renders.
- Best for one-off visual validation and exploratory testing during development.
- Limitation: manual, not automatable in CI.

**Playwright (plugin installed, not enabled):**
- Best for regression tests you want to run before every commit.
- Useful if the codebase grows to the point where one change can silently break another.
- At current scale (~85% complete, ~1 developer), the overhead of maintaining a full
  Playwright suite may not be worth it yet.

**Verdict:** Keep using Claude in Chrome for manual UI checks. Enable Playwright only
when you're ready to write regression tests for the chat stream, session creation,
and character CRUD flows — those are the highest-risk paths.

---

## Part 1 — Feature Rating System

Each feature is rated on:

| Field | Scale |
|-------|-------|
| **Effort** | S < 1 day · M 1–3 days · L 4–7 days · XL 1–2 weeks |
| **Impact** | ★ nice-to-have → ★★★★★ transformative |
| **Recommendation** | 🔥 Top priority · ✅ Do it · 📋 Backlog · 🔮 Ambitious |

**ROI** = Impact ÷ Effort. Tier 1 = highest ROI (quick wins, existing endpoints to leverage).

---

## Part 2 — The 32 Features

---

### TIER 1 — Quick Wins (high ROI, existing endpoints already built)

---

#### #1 — AI Session Summarizer Panel
**What:** Surface the existing `POST /api/sessions/{id}/summarize` endpoint as a
floating panel in ChatThread. Show the AI-generated summary of the current session
with a "Refresh" button and token count saved.
**Why it's easy:** The endpoint exists and works. Only frontend needed.
**Effort:** S · **Impact:** ★★★ · **Rec:** 🔥

---

#### #2 — Context Window Visualizer
**What:** A thin bar at the top of the chat (or in MessageMeta) showing how full the
context window is, sourced from `GET /api/context-budget/{session_id}`. Color shifts
green → yellow → red as it fills. Tooltip shows tokens used / max.
**Why it matters:** Power users hitting context limits have no warning today.
**Effort:** S · **Impact:** ★★★ · **Rec:** 🔥

---

#### #3 — Relationship Milestone Celebration
**What:** When affinity crosses a tier threshold (Neutral→Friendly→Close→Devoted→
Soulmate), trigger a full-screen confetti burst with a modal: "✨ You've reached
[Close]! [Character] trusts you more deeply now." Fired client-side after each
streaming `done` event when relationship tier changes.
**Why it matters:** Pure delight moment. Costs almost nothing to build.
**Effort:** S · **Impact:** ★★★★ · **Rec:** 🔥

---

#### #4 — Character Schedule Editor UI
**What:** `character_schedules` table exists (type, time_of_day, hours_away, enabled)
but there is NO Sakura UI to create or edit schedules. A simple panel (similar to
DiaryPanel) with a time picker and schedule type dropdown.
**Why it's easy:** Backend is fully built. Pure frontend work.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** 🔥

---

#### #5 — Conversation Export to Markdown
**What:** Extend the existing "Export conversation" button in StatusBar to offer
Markdown format: `## [Character] — 2026-02-27\n\n**You:** ...\n\n**Emi:** ...`
with metadata header (affinity tier, session length, top emotion). PDF via browser
print() as bonus.
**Why it's easy:** ChatThread already has `handleExport()`. Just change the format.
**Effort:** S · **Impact:** ★★★ · **Rec:** ✅

---

#### #6 — Character Backstory Generator
**What:** "Generate Backstory" button in the Character settings tab. Calls
`POST /api/llm/generate` with a prompt that builds a rich backstory from
`name + system_prompt + personality_traits`. Output drops into a new
`character.backstory` text field (one migration needed) and is prepended to the
system prompt on the next session.
**Why it's easy:** Uses existing LLM infrastructure. One new DB column.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** ✅

---

#### #7 — Webhook Configuration UI (Sakura)
**What:** `GET/POST /api/config/webhooks` already works in the backend. Neon has a
webhook UI; Sakura doesn't. Add a "Webhooks" sub-tab in Settings → System with fields
for on_message, on_session_start, on_emotion_change webhook URLs + a test-fire button.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** ✅

---

#### #8 — Smart Session Compression with Preview
**What:** `POST /api/sessions/{id}/compress` already exists but has no Sakura UI.
Add a "Compress Context" button in the session drawer with a pre-compression modal
showing: current token count → estimated tokens after → "messages that will be
removed" preview list. User confirms before firing.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** ✅

---

#### #9 — Session Tags & Folders
**What:** Add a `tags` TEXT column to `sessions` (e.g. `'["roleplay","fluff"]'`).
Render colored tag pills in SessionDrawer. Filter sidebar character list by tag.
No backend complexity — tags are client-managed and stored in the sessions row.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** ✅

---

#### #10 — Message Pinning / Favorites
**What:** Add a `pinned` boolean column to `messages`. Right-click / long-press a
message bubble → "Pin message". Pinned messages appear in a "Favorites" section at
the top of the session drawer and in a new `GET /api/sessions/{id}/pinned` endpoint.
**Effort:** S–M · **Impact:** ★★★ · **Rec:** ✅

---

### TIER 2 — Medium Complexity (strong impact, 1–3 days each)

---

#### #11 — Global Conversation Search
**What:** A full-text search bar in the sidebar that queries ALL sessions across ALL
characters using SQLite's existing FTS5 virtual table (`messages_fts`). Results group
by character, show a snippet with the matched words highlighted, and jump to the
relevant message on click.
**Effort:** M · **Impact:** ★★★★ · **Rec:** 🔥

---

#### #12 — Memory Graph Visual Explorer
**What:** `GET /api/v2/memory/graph` returns a DOT-format relationship graph. Render
this as an interactive force-directed graph in Sakura's MemoryPanel using D3.js or
the lightweight `elkjs` layout engine. Click a node to see the memory snippet.
This would replace the current plain list view.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #13 — Character Mood Board (expr_portraits Editor)
**What:** `expr_portraits` is currently a raw JSON text field in settings.
Build a visual grid: 6 emotion slots (happy, sad, love, angry, shock, neutral) each
with a drag-to-assign image, a "Generate" button (fires `/api/image-gen/expressions`),
and a preview. This makes the expression system actually usable.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #14 — Branching Conversation Visualizer
**What:** The backend fully supports message branching (`parent_id`, `is_active`
columns, `/api/sessions/{id}/messages?include_branches=true`) but there's no UI.
Show a mini tree diagram in SessionDrawer — branches shown as dotted paths, active
branch highlighted. Click to switch branches.
**Effort:** M–L · **Impact:** ★★★ · **Rec:** 📋

---

#### #15 — Custom Theme Builder (Sakura)
**What:** Neon has `ThemeEditor.js` for full color customization. Sakura only has
light/dark toggle. Add a palette editor that writes to CSS custom properties:
`--color-accent`, `--color-background`, `--color-surface`, etc. Show a live preview.
Save themes as named presets.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #16 — Soundscape / Ambient Audio
**What:** A small audio engine that plays looping ambient sounds (café, rain, lo-fi,
forest, city) matching the character's `world_description` or the current scene image.
A floating mini-player with volume control and category picker. Files served from
`/frontend/shared/audio/` (add a small pack of ~10 free loops).
**Why it's special:** Dramatically increases immersion with almost no backend work.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #17 — AI Model Arena (Prompt Comparison)
**What:** A dedicated "Arena" tab or overlay where you type a prompt once and send it
to 2–3 different LLM configurations simultaneously (different providers/models/temps).
Responses render side-by-side. Useful for tuning character voices.
**Effort:** M · **Impact:** ★★★★ · **Rec:** 📋

---

#### #18 — Streaming TTS Waveform Visualizer
**What:** While TTS audio is playing, show an animated bar-chart waveform (Web Audio
`AnalyserNode`) overlaid on the character avatar or in the status bar. Optionally
sync with a VRM lip-sync postMessage. Stops when audio ends.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #19 — Conversation Starters / Scenario Templates
**What:** A "Scenario Library" button in the chat composer. Pre-built prompts organized
by category ("First meeting", "Movie night", "Comforting after bad day", "Debate club").
Each scenario sets an opening user message and optionally a temporary system prompt
addition. Community-shareable via JSON import.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

#### #20 — Privacy / Full Data Export (GDPR-style)
**What:** "Export All My Data" in Settings → System. Server packages all characters,
sessions+messages, memory, vocabulary, config, and diary entries into a single
timestamped ZIP. Also includes a "Delete all data" confirmation flow that wipes
the SQLite DB and cache. Essential for user trust.
**Effort:** M · **Impact:** ★★★ · **Rec:** ✅

---

### TIER 3 — Polish & Depth (valuable but less urgent)

---

#### #21 — Adaptive Conversation Pacing
**What:** Track the user's recent typing speed (keystrokes per minute) and auto-tune
TTS playback rate and `max_tokens` to match their preferred pace. A "Fast Mode"
user gets shorter, snappier replies; a deliberate typist gets longer, thoughtful ones.
Stored as a user preference that can be overridden.
**Effort:** M · **Impact:** ★★★ · **Rec:** 📋

---

#### #22 — Message Reactions (Emoji)
**What:** Small emoji reaction bar on hover for each message bubble. Reactions stored
in a new `message_reactions (message_id, emoji, ts)` table. Stats panel can show
"most reacted messages" and "top emoji per character."
**Effort:** S–M · **Impact:** ★★ · **Rec:** 📋

---

#### #23 — Character "Universe" / Shared World Builder
**What:** Group multiple characters under a shared "Universe" with a lore document,
shared vocabulary, and consistent world rules. All characters in the universe
automatically receive the shared world context in their system prompt prefix.
New `universes` table + `universe_id` FK on characters.
**Effort:** L · **Impact:** ★★★★ · **Rec:** 📋

---

#### #24 — Custom Keyboard Shortcut Editor (Sakura)
**What:** Neon's `HotkeyEditor.js` allows full keyboard rebinding. Sakura has
hardcoded shortcuts in `App.tsx`. Build a rebinding UI in Settings → General that
persists user's shortcuts to `localStorage` and merges with the shortcut hook.
**Effort:** M · **Impact:** ★★ · **Rec:** 📋

---

#### #25 — Character Relationship Web
**What:** A visual graph showing all your characters as nodes, with edges weighted
by affinity (thicker = closer). Click a character node to jump to their chat.
Hover shows affinity %, last chat date, top emotion. Built with a lightweight
force-directed layout (no heavy library needed).
**Effort:** M–L · **Impact:** ★★★ · **Rec:** 📋

---

#### #26 — Incognito Mode Prominence
**What:** Incognito mode exists in ChatThread but is easy to forget. Add: (1) a
persistent purple "INCOGNITO" banner across the composer, (2) incognito sessions
shown with 🕵️ in SessionDrawer, (3) a filter to show/hide incognito sessions.
**Effort:** S · **Impact:** ★★ · **Rec:** ✅

---

#### #27 — Character Portfolio Generator
**What:** One-click "Generate Character Card" button that produces a shareable PNG
card (via HTML Canvas or html2canvas): character avatar, name, affinity tier,
personality traits, top emotion, favorite topics from word cloud, relationship
timeline start date. Share as image or export alongside character JSON.
**Effort:** M · **Impact:** ★★ · **Rec:** 📋

---

#### #28 — Session Replay Mode
**What:** "Replay" a past session as if it were live — messages appear one by one
with their original timestamps, TTS plays in sequence. Great for reliving memorable
conversations or showing the app to someone. Playback speed control (1×, 2×, skip).
**Effort:** M · **Impact:** ★★ · **Rec:** 📋

---

#### #29 — Proactive "Day Off" Mode
**What:** A per-character toggle in settings: "Day Off." When enabled, the character
won't respond to messages but will send one scheduled "I'm busy today, talk later! 🌸"
message at a random time. Adds personality and prevents user from feeling ignored when
they haven't chatted in a while.
**Effort:** S · **Impact:** ★★ · **Rec:** 📋

---

### TIER 4 — Ambitious / Long-Term

---

#### #30 — Multi-Language UI (i18n)
**What:** Full internationalization of the Sakura frontend. Priority languages:
English (done), Japanese (large anime fanbase), Simplified Chinese. Use `i18next`
(lightweight, compatible with React 19). All UI strings extracted to locale JSON files.
**Effort:** L · **Impact:** ★★★ · **Rec:** 🔮

---

#### #31 — Multi-Character Group Chat
**What:** Create a session with 2–3 characters. The backend manages turn-taking
(round-robin or affinity-weighted). Characters can address each other by name and
form relationships with each other over time. New `session_characters` join table.
Complex, but potentially the app's defining "wow" feature.
**Effort:** XL · **Impact:** ★★★★★ · **Rec:** 🔮

---

#### #32 — Live2D Expression Sync (Sakura)
**What:** Neon has mature Live2D Cubism 2 integration. Sakura only supports VRM (3D).
Port the Live2D manager and viewer bridge to Sakura so 2D model users can switch to
the modern UI without losing their avatar. Requires bundling the Cubism 2 runtime.
**Effort:** L–XL · **Impact:** ★★★ · **Rec:** 🔮

---

## Part 3 — Recommended Implementation Order

| Order | # | Feature | Effort | Impact | Why now |
|-------|---|---------|--------|--------|---------|
| 1 | #3 | Relationship Milestone Celebration | S | ★★★★ | Highest delight-per-line-of-code in the list |
| 2 | #2 | Context Window Visualizer | S | ★★★ | Existing endpoint, frequent user pain point |
| 3 | #1 | AI Session Summarizer Panel | S | ★★★ | Existing endpoint, one afternoon of work |
| 4 | #4 | Character Schedule Editor UI | S–M | ★★★ | Backend fully built; unlocks Feature C for real users |
| 5 | #26 | Incognito Mode Prominence | S | ★★ | Tiny but makes existing feature discoverable |
| 6 | #5 | Markdown/PDF Export | S | ★★★ | Tiny change, frequently requested in similar apps |
| 7 | #6 | Character Backstory Generator | S–M | ★★★ | Leverages existing LLM infra |
| 8 | #11 | Global Conversation Search | M | ★★★★ | FTS5 is already there — just needs a UI |
| 9 | #16 | Soundscape / Ambient Audio | M | ★★★ | Biggest immersion gain per effort |
| 10 | #9 | Session Tags | S–M | ★★★ | Small DB change, big organization gain |
| 11 | #13 | Character Mood Board UI | M | ★★★ | Makes expression system usable for first time |
| 12 | #15 | Custom Theme Builder | M | ★★★ | Sakura parity with Neon; personalization = retention |
| 13 | #8 | Smart Compression Preview | S–M | ★★★ | Backend done, users need this UX safety net |
| 14 | #20 | Privacy / Data Export | M | ★★★ | Trust-building; important as app matures |
| 15 | #19 | Conversation Starters | M | ★★★ | Removes the "blank page" problem for new users |
| 16 | #7 | Webhook Config UI | S–M | ★★★ | Sakura parity with Neon |
| 17 | #10 | Message Pinning | S–M | ★★★ | Small DB change, high daily-use value |
| 18 | #18 | TTS Waveform Visualizer | M | ★★★ | High polish, uses Web Audio API |
| 19 | #12 | Memory Graph Explorer | M | ★★★ | Makes memory system visual |
| 20 | #17 | AI Model Arena | M | ★★★★ | Developer/power-user value |
| 21 | #21 | Adaptive Pacing | M | ★★★ | Personalization depth |
| 22 | #26 | Incognito Improvements | S | ★★ | (if not done earlier) |
| 23 | #22 | Message Reactions | S–M | ★★ | Social layer |
| 24 | #29 | Day Off Mode | S | ★★ | Personality quirk |
| 25 | #24 | Keyboard Shortcut Editor | M | ★★ | Power user quality-of-life |
| 26 | #14 | Branching Visualizer | M–L | ★★★ | Makes branching usable |
| 27 | #25 | Character Relationship Web | M–L | ★★★ | Visual overview of all characters |
| 28 | #28 | Session Replay | M | ★★ | Fun / shareable |
| 29 | #27 | Character Portfolio Card | M | ★★ | Sharing / community |
| 30 | #30 | i18n (Japanese/Chinese) | L | ★★★ | Market expansion |
| 31 | #23 | Universe / Shared World | L | ★★★★ | Major architecture expansion |
| 32 | #31 | Multi-Character Group Chat | XL | ★★★★★ | Save for dedicated sprint |
| 33 | #32 | Live2D Sync to Sakura | L–XL | ★★★ | Only if 2D parity needed |
