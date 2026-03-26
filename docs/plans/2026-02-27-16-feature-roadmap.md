# 16-Feature Roadmap — Waifu-RT3D (Revised)

> **Research basis:** Deep codebase audit, competitive analysis (SillyTavern, Kindroid, Character.AI,
> riko_project, Open-LLM-VTuber), and OSS AI model survey (Kokoro, faster-whisper, sqlite-vec,
> MediaPipe, wLipSync, pixi-live2d-display).
>
> **Revision:** User-reviewed. A4/A5/C4 removed; A2 replaced with Mini Games; 3 new features added.

Priority tiers:
- **A — NEW LARGE FEATURES** (8 features, highest priority)
- **B — UX/UI IMPROVEMENTS** (4 features)
- **C — PLATFORM / INFRASTRUCTURE** (4 features)

---

## A1 — Full-Duplex Voice Conversation Mode ✅

### What It Is
A dedicated "voice mode" where the user speaks and the character responds with synthesized voice, creating a continuous low-latency conversational loop. Think: a real phone call with your AI companion — no typing, no buttons, just talking.

### Why It Matters
Every major competitor (Kindroid, Character.AI+, Replika) has voice. It is the #1 requested feature in AI companion communities. The app has 8 TTS engines and an `/api/asr` endpoint stub but zero end-to-end voice conversation flow. This closes that gap.

### How It Works
```
Browser:
  getUserMedia() → MediaRecorder (Opus/WebM)
  → WebSocket audio chunks (100ms frames)
FastAPI:
  Silero VAD → detect end-of-speech
  faster-whisper → transcribe text
  → existing /api/chat/stream pipeline (character, session, full context)
  → TTS adapter (sentence-by-sentence chunked)
  → SSE audio URLs back
Browser:
  Audio playback queue → wLipSync → VRM lip sync
```

Voice modulation — when TTS is active, the AI adjusts **voice parameters only** (speed, pitch, expressiveness) to match the emotional context of what it's saying. The user sets the voice; the AI cannot switch to a different voice, only modulate delivery. This makes speech feel naturally expressive rather than monotone robotic.

### OSS Libraries
- `faster-whisper` (Python) — CTranslate2-accelerated Whisper, 4× faster than OpenAI Whisper
- `silero-vad` (Python/ONNX) — accurate end-of-speech detection
- WebRTC `getUserMedia` + `MediaRecorder` (browser) — audio capture
- `wLipSync` (npm) — browser-side phoneme→viseme lip sync from audio

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/asr/adapters/faster_whisper.py` | New: adapter implementing `transcribe(audio_bytes) → str` |
| `backend/asr/adapters/silero_vad.py` | New: VAD wrapper with end-of-utterance detection |
| `backend/asr/manager.py` | New: ASRManager (mirrors TTSModelManager pattern) |
| `backend/server.py` | Implement `/api/asr` (stub exists); add `/ws/voice` WebSocket endpoint |
| `frontends/sakura/src/components/VoiceConversationMode.tsx` | New: full-screen voice UI — waveform, live transcript, character face close-up |
| `frontends/sakura/src/components/VoiceButton.tsx` | New: mic button in ChatThread composer |
| `frontends/shared/viewer/viewer.html` | Wire `wLipSync` to audio playback queue |
| `frontends/sakura/src/lib/api.ts` | Add WebSocket voice client helper |
| `backend/tts/voice_modulator.py` | New: maps emotion → TTS parameter overrides (speed, pitch delta, expressiveness) |

### Tasks
1. Install `faster-whisper`, `silero-vad`
2. Build ASRManager + faster-whisper adapter + tests
3. Implement Silero VAD with end-of-utterance detection
4. Implement `/ws/voice` WebSocket (audio in → transcript → chat stream → TTS back)
5. Build voice modulation layer (emotion → TTS parameter map)
6. Implement `wLipSync` phoneme pipeline in viewer.html
7. Build `VoiceButton.tsx` + `VoiceConversationMode.tsx` with waveform animation

### Complexity: Large (5–7 days). Highest ROI feature on the list.

---

## A2 — In-App Mini Games with AI Companion ✅ (replaces Webcam Mirroring)

### What It Is
A mini-game framework where users play simple games WITH their AI companion — not relying on the LLM to track game state (which it does poorly), but using actual coded game logic. The character provides personality, commentary, trash talk, encouragement, and emotional reactions. Scores are tracked in the database. Characters reference game history in regular conversation ("you beat me at trivia yesterday!").

**Phase 1 — Text/Logic Games:**
- **Trivia** (multiple choice, character picks a topic): 10 rounds, DB-tracked win/loss/score per character
- **20 Questions** (AI is thinking of something, player guesses): coded game state machine
- **Word Association**: both player and character respond, a judge LLM call scores creativity
- **Riddles**: character poses riddles, difficulty scales with relationship tier

**Phase 2 — Simple 2D Browser Games:**
- **Tic-tac-toe** (canvas, unbeatable AI option or easy mode)
- **Memory card match** (character-themed card art)
- **Simple reaction game** (character tosses objects, user catches — tests reflexes)

All wins, losses, and streaks are stored per character. Characters celebrate wins with VRM expressions + voice lines.

### Why It Matters
Text-based "play 20 questions" via pure LLM is janky — it loses count, cheats, forgets rules. Purpose-built game logic makes the experience actually reliable and fun. Score tracking adds a competitive dimension and gives characters things to reference in future conversations. No other AI companion app does this with actual code backing it.

### Architecture
```
Game session: { type, state, score, character_id, session_id }
Game engine: TypeScript class per game type (TriviaGame, TwentyQGame, etc.)
  - deterministic state machine (no LLM for game rules)
  - LLM call only for: question generation, dialogue, reactions, hints
Character reactions: SSE emotion events + VRM expressions on win/loss/hint
Score storage: game_sessions table in SQLite
```

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Schema: `game_sessions` table (id, character_id, game_type, result, score, duration, played_at) |
| `backend/games/trivia.py` | New: question generation via LLM, answer validation, score tracking |
| `backend/games/twenty_questions.py` | New: game state machine (thing_chosen → yes/no responses → guess tracking) |
| `backend/server.py` | Add `POST /api/games/start`, `POST /api/games/{id}/move`, `GET /api/games/history` |
| `frontends/sakura/src/components/GamePanel.tsx` | New: game launcher, in-progress game UI, score display |
| `frontends/sakura/src/components/TriviaGame.tsx` | New: multiple choice UI, timer, score tally |
| `frontends/sakura/src/components/TwentyQGame.tsx` | New: yes/no question UI, guess count display |
| `frontends/sakura/src/components/Sidebar.tsx` | Add "Games" section to sidebar |
| `frontends/sakura/src/lib/types.ts` | Add `GameSession`, `GameMove`, `GameType` types |

### Tasks
1. Design DB schema + `game_sessions` table
2. Build `trivia.py` backend (LLM question gen, answer validation, score)
3. Build `twenty_questions.py` state machine
4. Add game API endpoints (`/api/games/*`)
5. Build `GamePanel.tsx` launcher + `TriviaGame.tsx` UI
6. Build `TwentyQGame.tsx` UI
7. Wire character reactions (emotion SSE → VRM expression on win/loss/correct)
8. Add game history to character stats panel ("Played 12 games, won 7")

### Complexity: Medium-Large (3–5 days). Game logic is simple; the React UIs + character reaction wiring take time.

---

## A3 — Tiered Episodic Memory with sqlite-vec ✅

### What It Is
A three-tier memory architecture that gives characters genuine long-term memory. The key difference from the current flat ChromaDB store: emotional salience determines longevity, and users have full control over persistence.

**Memory tiers:**
- **Tier 1 – Fleeting** (session scope): Everything said this session, auto-indexed
- **Tier 2 – Recent** (default: 4 weeks): Emotionally significant moments, stated user facts
- **Tier 3 – Permanent**: Core memories — flagged by LLM or manually by user as "keep forever"

**User-configurable decay options:**
- `Decay off`: All memories stay at T2 weight indefinitely (no forgetting)
- `Decay on, keep forever`: Old memories demote from T2 to T3 (lower retrieval weight) but are never deleted — they can still surface if highly relevant, just rank lower than recent memories
- `Decay on, prune`: Old T2 memories eventually drop out of the index (default behavior)

Before each LLM inference, top-K similar memories are retrieved via vector similarity and injected into context. Older T3 memories use a lower K and rank lower in the combined result set.

### How It Works
```
Every message → sentence-transformers embed → store in memories table
Before LLM inference:
  Embed user message → query memories_vec → top-5 T1/T2 + top-2 T3 memories
  Inject as "Relevant memories:" block in system prompt

Background job (nightly):
  Demote T2 memories per user's decay setting
  LLM classifies recent T1 memories for T3 promotion (rare)
```

sqlite-vec is strictly better than ChromaDB here: single .so extension, lives inside existing SQLite connection, no separate process, no file locking. Query latency <1ms for 100K vectors.

### OSS Libraries
- `sqlite-vec` (Python, pip install sqlite-vec) — vector similarity inside SQLite
- `sentence-transformers/all-MiniLM-L6-v2` — already installed, 384-dim embeddings

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Schema v23: `memories` table + `memories_vec` virtual table; add decay settings to config |
| `backend/memory/vector_store.py` | Rewrite to use sqlite-vec; keep same `add_memory`/`search_memories` API |
| `backend/memory/tiered_memory.py` | New: `TieredMemoryManager` — tier assignment, decay, salience scoring, promotion |
| `backend/agent/tools/memory_search.py` | Update to use `TieredMemoryManager.search()` |
| `backend/server.py` | Wire memory injection into pre-inference context; add nightly decay job |
| `frontends/sakura/src/components/MemoryPanel.tsx` | Show tier badges (Recent/Permanent/Fleeting); manual T3 promotion; decay setting toggle |
| `backend/config/app.json` | Add `memory.decay_mode` (off/keep/prune), `memory.top_k`, `memory.salience_threshold` |

### Tasks
1. Install `sqlite-vec`; write DB migration (preflight.py v23)
2. Rewrite `vector_store.py` to use sqlite-vec
3. Build `TieredMemoryManager` with salience scoring + decay logic
4. Add decay mode config + user-facing setting in SettingsView
5. Update `memory_search` agent tool
6. Wire memory injection into chat pipeline context builder
7. Update MemoryPanel UI with tier indicators, manual promotion, decay toggle

### Complexity: Large (4–5 days). sqlite-vec migration is 1–2 days; tiering logic is the creative challenge.

---

## A4 — Character Moods & Time-of-Day Behavioral States ✅ (new, replaces Group Chat)

### What It Is
Characters have a daily rhythm that makes them feel genuinely alive. Their personality, energy level, and conversational style subtly shift based on time of day and recent context:

- **Morning** (6–10am): groggy/warm, slower responses, coffee references, asks how you slept
- **Afternoon** (10am–5pm): energetic, curious, more playful, best mood for complex topics
- **Evening** (5–9pm): relaxed, reflective, more intimate/vulnerable, suggests activities
- **Night** (9pm–1am): introspective, slightly tired, romantic or philosophical depending on personality
- **Late Night** (1–6am): surprised you're still up, protective/concerned, more hushed tone

Mood is also affected by: recent affinity changes, whether the user has been away for days, recent diary entries, and the character's base personality traits (a shy character is still shy at all hours, but differently shy).

The mood state is injected as a small prefix into the system prompt ("It is evening and [character] is feeling warm and reflective after a long day"). Users can see the current mood state as a small badge.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/mood/engine.py` | New: `MoodEngine` — computes current mood from time, affinity delta, last session gap, personality |
| `backend/server.py` | Call `MoodEngine.get_mood()` and inject into system prompt prefix before inference |
| `backend/preflight.py` | Add `mood_enabled` and `mood_intensity` (0–1 float) columns to `characters` table |
| `frontends/sakura/src/components/StatusBar.tsx` | Add subtle mood indicator badge (small emoji + label) near character name |
| `frontends/sakura/src/views/SettingsView.tsx` | Character tab: mood enable/disable toggle, intensity slider |
| `backend/config/mood_profiles.json` | New: maps time-of-day + personality traits → mood descriptor text + expression hints |

### Tasks
1. Design mood profile JSON (time slots × personality trait combinations)
2. Build `MoodEngine` with time + affinity + session-gap inputs
3. Wire mood prefix injection into chat pipeline
4. Add mood indicator badge to StatusBar
5. Add mood enable/intensity controls to SettingsView
6. Write unit tests for MoodEngine across time/affinity edge cases

### Complexity: Small-Medium (1.5–2 days). Mostly config + prompt engineering.

---

## A5 — AI-Generated Character Expression Portraits ✅ (new, replaces SadTalker)

### What It Is
For characters that lack a portrait image, or to expand the existing portrait set, use the configured image generator (EasyDiffusion or ComfyUI) to generate a set of expression portraits from the character's text description.

A "Generate Portraits" button in Settings → Character pulls the character description, visual traits, and art style preference → builds a prompt → calls the active image gen backend → produces 6 expression variants (neutral, happy, sad, surprised, embarrassed, angry) in the style specified (e.g., "anime, soft lighting, 2D illustration").

Generated portraits auto-populate the character's expression portrait mapping. Users can regenerate individual expressions or all at once. The existing `expression_portraits` system in the backend already expects these images — this just automates creation for users who can't draw or find existing art.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/image_gen/portrait_generator.py` | New: builds expression-specific prompts from character data; calls active image gen adapter |
| `backend/server.py` | Add `POST /api/characters/{id}/generate-expressions` → triggers generation of 6 expression portraits |
| `frontends/sakura/src/views/SettingsView.tsx` | Character tab: "Generate Portraits" button with expression preview grid |
| `frontends/sakura/src/components/ExpressionPortraitGrid.tsx` | New: 6-slot grid showing current/generated portraits with regenerate-per-slot buttons |
| `backend/config/expression_prompts.json` | New: per-expression prompt suffixes ("bright smile, happy eyes" for happy, etc.) |

### Tasks
1. Build `portrait_generator.py` with prompt builder (char description + art style + expression suffix)
2. Add API endpoint for batch expression generation
3. Build `ExpressionPortraitGrid.tsx` — 6-slot grid, loading state, individual regen
4. Wire generated images into character expression portrait map
5. Add art style selector (anime/realistic/cartoon) to the generation UI
6. Test with both EasyDiffusion and ComfyUI adapters

### Complexity: Medium (2–3 days). Mostly wiring existing image gen infrastructure to the portrait system.

---

## A6 — Lorebook / World Info Injection System ✅

### What It Is
A keyword-triggered context injection system — the most-praised feature in SillyTavern's community. Users define "lore entries" (facts about the world, NPCs, places, events) with associated trigger words. When those keywords appear in conversation, the matching lore is silently injected into the LLM's context before inference. The character "knows" these things without them being part of the visible chat.

**Example:** User creates a lore entry:
- **Title:** "Akira"
- **Keywords:** `akira, childhood friend, the one who moved away`
- **Content:** "Akira is [character]'s childhood friend, a shy boy who moved to Kyoto at age 12. [Character] still keeps a photo of them together and wonders about him sometimes."
- **Injection position:** after system prompt

Now whenever "Akira" appears in conversation, the character knows exactly who he is — without you having to re-explain every session.

**Why users love this:** It makes a fictional world feel consistent and alive. Characters seem to have genuine backstory knowledge. Long-running stories feel coherent. It removes the "the AI forgot the lore again" frustration that plagues every AI companion app.

**Practical uses:**
- World lore for RP scenarios ("The Academy is a magic school in the northern district…")
- NPC definitions ("Sensei Haruki: strict but secretly kind math teacher…")
- Rules for the world ("In this world, magic costs emotional energy — sadness drains power")
- User facts they want the character to always remember (overlaps with A3 but user-curated)
- Conversation guidelines the character should silently follow ("When the topic of her parents comes up, [character] always gets quiet and changes the subject")

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Schema v23+: `lore_entries` table (id, character_id, title, content, keywords JSON, injection_position, priority, enabled) |
| `backend/lore/matcher.py` | New: `LoreMatcher.match(text) → [LoreEntry]` — case-insensitive keyword scanning |
| `backend/server.py` | Inject matching lore into context builder before LLM call; add CRUD `/api/characters/{id}/lore` |
| `frontends/sakura/src/components/LorePanel.tsx` | New: entry list + editor with title, keyword tags, content, position picker |
| `frontends/sakura/src/components/Sidebar.tsx` | Add "Lore" button to sidebar nav |
| `frontends/sakura/src/lib/api.ts` | Add lore CRUD methods |
| `frontends/sakura/src/lib/types.ts` | Add `LoreEntry` interface |

**Injection positions:** `before_system_prompt` | `after_system_prompt` | `before_last_message` | `after_last_2_messages`

### Tasks
1. Add `lore_entries` table to DB (preflight.py)
2. Build `LoreMatcher` (keyword scan → entries, priority ordering, dedup)
3. Wire lore injection into chat pipeline context builder
4. Add CRUD API endpoints
5. Build `LorePanel.tsx` — list, editor, keyword tag input, enable/disable per entry
6. Add SillyTavern World Info JSON import (optional but useful for existing users)
7. Add "test keywords" tool in UI (shows which lore activates for given sample text)

### Complexity: Medium (2–3 days). The concept is simple once understood; UI takes most of the time.

---

## A7 — Kokoro TTS + Voice Parameter Modulation ✅

### What It Is
Add **Kokoro** as a new TTS engine option (not a replacement — all existing engines remain available). Kokoro is 82M parameters, Apache 2.0 licensed, and produces quality comparable to much larger models. It runs locally on CPU.

**Female-voice-first design:** All preset voices are female (appropriate for an AI girlfriend app). Male voices are only achievable via voice cloning — the app doesn't know or care what gender the cloned voice is.

**Voice cloning via KVoiceWalk:** Upload a 5–30 second audio clip → Kokoro adopts that voice style for the character. No fine-tuning, no training — it uses a voice style walk algorithm to find the closest matching style vector. Each character can have a unique cloned voice saved.

**Voice Parameter Modulation (new idea from your feedback):** When TTS is active in voice conversation mode, the AI adjusts delivery parameters to match emotional context:
- Excited response → slightly faster speed, higher pitch
- Sad/comforting → slower, softer, lower energy
- Playful → slightly higher pitch, lighter
- Serious → steady pace, measured

The user always controls **which voice** — the AI only controls **how** that voice delivers the line. These parameters stay within human-sounding ranges (no cartoonish effects).

### OSS Libraries
- `kokoro-onnx` (pip) — ONNX-accelerated Kokoro inference, runs on CPU, 54 voices
- `KVoiceWalk` (GitHub: RobViren/kvoicewalk) — voice style cloning for Kokoro
- `phonemizer` (pip) — G2P conversion for Kokoro text input

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/tts/adapters/kokoro_adapter.py` | New: KokoroAdapter implementing TTSAdapter interface |
| `backend/tts/adapters/kvoicewalk.py` | New: KVoiceWalk wrapper for voice fingerprint extraction + storage |
| `backend/tts/voice_modulator.py` | New (also referenced in A1): emotion → parameter map (speed, pitch_delta, energy) |
| `backend/tts/model_manager.py` | Add Kokoro to installable model catalog |
| `backend/server.py` | Add `POST /api/tts/voice-clone` (upload → fingerprint_id); `GET /api/tts/kokoro/voices` |
| `frontends/sakura/src/views/SettingsView.tsx` | Voice tab: Kokoro voice picker (female presets only) + upload voice sample section |
| `frontends/sakura/src/components/VoiceSampleUploader.tsx` | New: drag-drop audio upload, recording widget, clone status display |

### Tasks
1. Install `kokoro-onnx`, `phonemizer`
2. Build `KokoroAdapter` implementing standard TTS interface (with 54 female preset voices)
3. Build voice modulator (`emotion + context → parameter adjustments`)
4. Build `KVoiceWalk` wrapper + voice fingerprint storage per character
5. Add voice clone API endpoint
6. Update TTS model catalog + SettingsView Voice tab
7. Build `VoiceSampleUploader.tsx` with recording + upload flow

### Complexity: Medium-Large (3–4 days).

---

## B1 — Cinematic Immersion Mode ✅ (lower priority)

### What It Is
Full-screen toggle (`Ctrl+I`) that hides all UI chrome and expands the 3D viewer to fill the screen. Chat messages appear as translucent, animated dialogue bubbles floating over the scene. ESC to exit. Think: watching an anime, not using an app.

### Files to Create/Modify
| File | Change |
|------|--------|
| `frontends/sakura/src/components/CinematicOverlay.tsx` | New: fixed overlay with VN-style text box, animated message reveal |
| `frontends/sakura/src/components/ModelPanel.tsx` | Expand to full screen in cinematic mode |
| `frontends/sakura/src/stores/appStore.ts` | Add `cinematicMode: boolean` |
| `frontends/sakura/src/App.tsx` | `Ctrl+I` keybind; conditionally render `CinematicOverlay` |
| `frontends/sakura/src/styles/components.css` | `.cinematic-text-box` styles |
| `frontends/sakura/src/components/StatusBar.tsx` | Hide in cinematic mode |
| `frontends/sakura/src/components/Sidebar.tsx` | Hide in cinematic mode |

### Tasks
1. Add `cinematicMode` to appStore + keybind
2. Build `CinematicOverlay.tsx` (VN text box, message history, minimal input)
3. Full-screen ModelPanel expansion
4. Hide all other layout components
5. Exit via ESC + corner X

### Complexity: Medium (2 days).

---

## B2 — Emotion-Driven VRM Expression Automation ✅

### What It Is
After each LLM response, a fast emotion tag is extracted and automatically drives the character's VRM face via blend shape morphing — without any manual `scene_control` tool calls. Every response gets an expression. The character feels emotionally present at all times, not just when the tool randomly fires.

### How It Works
```
After LLM response generated:
  Structured output suffix: "EMOTION: happy|sad|neutral|surprised|confused|affectionate|playful, INTENSITY: 0.0–1.0"
  (OR: fast secondary prompt <10 tokens for models that can't do structured output)
  → SSE event: { type: 'emotion', value, intensity }
Frontend:
  → postMessage({ type: 'setExpression', emotion, intensity }) → viewer.html
viewer.html:
  Map emotion → VRM blend shape names → lerp over 300ms
```

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/server.py` | Add emotion extraction post-generation; emit `emotion` SSE event |
| `frontends/sakura/src/stores/chatStore.ts` | Parse `emotion` SSE event; store `currentEmotion` |
| `frontends/shared/viewer/viewer.html` | Handle `setExpression` postMessage with blendshape lerp |
| `frontends/sakura/src/components/ModelPanel.tsx` | Show current emotion label badge in top overlay |
| `backend/config/emotion_expressions.json` | New: maps emotion names → VRM blend shape IDs + intensities |

### Tasks
1. Build emotion extraction (structured suffix or fast secondary call)
2. Emit `emotion` SSE event in chat stream pipeline
3. Parse emotion in chatStore → postMessage to viewer
4. Build `setExpression` handler in viewer.html with blendshape lerp
5. Create `emotion_expressions.json` config (standard VRM expression mappings)
6. Add emotion badge to ModelPanel overlay
7. Add emotion intensity + transition speed controls to SettingsView

### Complexity: Small-Medium (1.5–2 days). Very high ROI for the effort.

---

## B3 — Visual Novel Reader Layout (low priority) ✅

### What It Is
Alternative chat rendering that recreates the visual novel aesthetic. Background fills the chat pane, character portrait positioned left or right, dialogue in a styled text box at the bottom with typewriter animation. Toggle via button or keybind.

### Files to Create/Modify
| File | Change |
|------|--------|
| `frontends/sakura/src/views/ChatThread.tsx` | Add `vnMode` rendering path |
| `frontends/sakura/src/components/VNTextBox.tsx` | New: VN dialogue box with typewriter animation, name tag |
| `frontends/sakura/src/components/VNPortrait.tsx` | New: character portrait, slide-in animation |
| `frontends/sakura/src/stores/appStore.ts` | Add `vnMode: boolean`, `vnPortraitPosition` |
| `frontends/sakura/src/styles/dialogue.css` | `.vn-textbox`, `.vn-name-tag`, `.vn-portrait` styles |

### Tasks
1. Design + build VNTextBox (typewriter, gradient bg, name tag)
2. Build VNPortrait component
3. Add `vnMode` layout path to ChatThread
4. Wire to existing background image + character data
5. Add toggle button + keybind

### Complexity: Medium (2 days). Mostly CSS/UI.

---

## B4 — Author's Note / Soft Prompt Injection ✅

### What It Is
A hidden "director's note" field that silently injects text into the context window at a specified position — no visible message, no break in immersion. Used to steer tone, add narrative context, or set a scene.

The field is **collapsible by default** (collapsed = hidden from casual view, not hidden from the LLM). Users who want to see what's injected can expand it. A small badge in the UI indicates "Author's Note active" so users don't forget they have one set.

**Example author's note:** *"[Scenario: late night, both tired. Write in shorter, more hushed sentences. Avoid long paragraphs. Focus on quiet warmth.]"*

**Injection positions:** before system prompt / after system prompt / after last 2 messages / after last 4 messages.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Add `author_note`, `author_note_position`, `author_note_enabled` to `sessions` table |
| `backend/server.py` | Inject author note at specified position in context builder |
| `frontends/sakura/src/components/AuthorNoteEditor.tsx` | New: collapsible textarea + position selector, enabled toggle |
| `frontends/sakura/src/components/SessionDrawer.tsx` | Add Author's Note section (collapsed by default) |
| `frontends/sakura/src/components/StatusBar.tsx` | Add "AN" badge when author note is active |
| `frontends/sakura/src/lib/api.ts` | Add `updateAuthorNote(sessionId, note, position, enabled)` |

### Tasks
1. Add `author_note` columns to sessions DB
2. Wire injection into context builder
3. Build `AuthorNoteEditor.tsx` (collapsible, position picker, active badge)
4. Add to SessionDrawer + StatusBar badge
5. Add per-character default author note in SettingsView → Character tab

### Complexity: Small (1 day). Architecturally trivial; high user value for power users.

---

## C1 — Live2D Runtime Support ✅

### What It Is
Activate the dead Live2D backend code with a proper frontend runtime. Users can use Live2D Cubism 2/3/4 models as their avatar type instead of VRM. The app already has `/api/scan/live2d` and avatar upload — this lights up the frontend playback.

Live2D models are far more common than VRM in the anime companion space (most VTuber models are Live2D). This doubles the compatible model library overnight.

### OSS Libraries
- `pixi-live2d-display` (npm) — community standard Live2D renderer, supports Cubism 2/3/4
- `pixi.js@7` (npm) — required by pixi-live2d-display
- Cubism Core WASM — already present in `/frontends/neon/lib/cubism/`

### Files to Create/Modify
| File | Change |
|------|--------|
| `frontends/shared/viewer/live2d.html` | New: Live2D viewer (mirrors viewer.html structure, uses pixi-live2d-display) |
| `frontends/sakura/src/components/ModelPanel.tsx` | Detect model type (VRM vs Live2D); load correct iframe |
| `backend/server.py` | Verify `/api/scan/live2d` returns full model paths + type detection |
| `frontends/sakura/src/views/SettingsView.tsx` | Character tab: show Live2D motion/expression list |
| `frontends/sakura/src/lib/types.ts` | Add `AvatarType: 'vrm' | 'live2d' | 'none'` |

### Tasks
1. Install `pixi.js@7`, `pixi-live2d-display`
2. Build `live2d.html` viewer (pixi canvas, model load, expression/motion API)
3. Implement matching postMessage protocol (setExpression, gesture, fpsUpdate, etc.)
4. Update ModelPanel to detect avatar type + load correct iframe
5. Test with Cubism 2 (`.moc`), Cubism 3/4 (`.moc3`) model files
6. Add Live2D motion/expression picker to SettingsView Character tab

### Complexity: Large (4–5 days). Well-documented but requires careful iframe plumbing.

---

## C2 — Smart Tool Use Protocol Detection for Local LLMs ✅

### What It Is
Extends the existing model capabilities system to automatically detect whether a local LLM supports OpenAI-format function calling (native JSON), and selects the right tool protocol accordingly. Results are cached in SQLite so detection happens only once per model.

**Three protocols:**
- `openai_functions` — standard OpenAI `tools` array + `tool_calls` response (Qwen2.5, Llama 3.1/3.2/3.3, Phi-4, DeepSeek)
- `xml_fallback` — XML-tagged tool invocation for models that understand instructions but not structured tool schemas (older Llama, Mistral 7B, etc.)
- `none` — disable tools entirely for models confirmed incapable (SmolLM, tiny models)

**Detection sources (in priority order):**
1. Known model family registry (hardcoded patterns: `qwen2.5`, `llama-3.1`, `llama-3.2`, `llama-3.3`, `phi-4`, `mistral-nemo`, `deepseek-r1` → `openai_functions`)
2. HuggingFace model card tags (existing `/api/models/capabilities` scrape already does this — extend to check `tool_use`, `function-calling` tags)
3. Manual override in Settings (user can force a protocol)
4. Default: `xml_fallback` (safe for unknown models)

**Also improves:** The agent runner uses the detected protocol to build the correct system prompt format and parse responses correctly. The ModelPanel shows a small badge ("Tools: OpenAI" / "Tools: XML" / "Tools: Off") so users know what's active.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Schema: `model_capability_cache` table (model_id, tool_protocol, reasoning_capable, cached_at, source) |
| `backend/llm/capability_detector.py` | New: `CapabilityDetector` — known patterns + HF card check + cache read/write |
| `backend/llm/adapters/openai_compat.py` | Replace `native_tools_guaranteed()` with `get_tool_protocol(model_id)` using detector |
| `backend/agent/runner.py` | Use `get_tool_protocol()` to choose system prompt format + response parser |
| `backend/server.py` | Extend `/api/models/capabilities` to include `tool_protocol`; add `POST /api/models/{id}/tool-protocol` for manual override |
| `frontends/sakura/src/components/ModelPanel.tsx` | Show tool protocol badge in model info overlay |
| `frontends/sakura/src/views/SettingsView.tsx` | Brain tab: manual tool protocol override selector per model |

### Tasks
1. Add `model_capability_cache` table to preflight.py (schema migration)
2. Build `CapabilityDetector` — known patterns registry + HF tag check + SQLite cache
3. Update `openai_compat.py` adapter: replace boolean `native_tools_guaranteed` with `get_tool_protocol(model_id) → Literal['openai_functions', 'xml_fallback', 'none']`
4. Update `agent/runner.py` to select system prompt format + response parser based on protocol
5. Extend `/api/models/capabilities` endpoint + add manual override endpoint
6. Add tool protocol badge to ModelPanel + manual override selector in SettingsView Brain tab

### Complexity: Medium (2–3 days). High leverage — makes tools work reliably for all the RTX 5080 local models the user runs.

---

## C3 — Companion User Knowledge Graph ✅

### What It Is
A persistent, editable "User Profile" that each character maintains — not a raw message log, but structured knowledge: your name, preferences, life events, relationships, running jokes. Characters reference this before responding. Users can view, add, and delete entries.

Distinct from memory (A3): memories are conversation recollections. The Knowledge Graph is **curated facts** — the character's mental model of the user. The visibility of this panel builds trust: users can see and control exactly what the character "knows" about them.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/preflight.py` | Schema: `user_facts` table (id, character_id, category, fact_text, source, confidence, created_at) |
| `backend/knowledge/extractor.py` | New: `FactExtractor` — after each exchange, LLM extracts user facts |
| `backend/server.py` | Inject top user facts into system prompt prefix; CRUD `/api/characters/{id}/user-facts` |
| `frontends/sakura/src/components/UserKnowledgePanel.tsx` | New: fact list by category, manual add, delete, confidence indicator |
| `frontends/sakura/src/components/Sidebar.tsx` | Add "About Me" section |
| `frontends/sakura/src/lib/types.ts` | Add `UserFact` interface |

**Fact categories:** identity (name, age, location), preferences (food, media, hobbies), history (key life events), relationship (inside jokes, shared memories, emotional moments)

**Sources:** auto-detected (AI extracted) vs manually added (user) — displayed differently so users know where facts came from.

### Tasks
1. Add `user_facts` table to DB schema
2. Build `FactExtractor` (LLM: "What did we learn about the user in this exchange?")
3. Wire fact injection into system prompt (top 10 most confident facts)
4. Add CRUD API endpoints
5. Build `UserKnowledgePanel.tsx` — categorized, source-tagged, delete/edit per fact
6. Add onboarding step: "Tell [character] a few things about yourself"

### Complexity: Medium (2–3 days).

---

## C4 — Companion Opening Greeting System ✅ (new, replaces Push Notifications — no push notifications ever)

### What It Is
When the user opens the app and selects a character, the character greets them contextually based on:
- **Time since last chat**: "It's been three days…I was wondering about you"
- **Time of day**: morning warmth vs evening intimacy
- **Current character mood** (from A4 Mood Engine)
- **Recent shared memory**: references the last conversation topic naturally
- **Special dates**: anniversary of first chat, custom dates the user has set

This is NOT a push notification — it fires only when the user opens the app. It uses the existing session data, mood engine (A4), and diary system to generate a contextual, personalized greeting. No background processes, no OS interruption.

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/greeting/generator.py` | New: `GreetingGenerator` — assembles context (last session, time gap, mood, memories, special dates) → greeting prompt → LLM call |
| `backend/server.py` | Add `GET /api/characters/{id}/greeting` → generated greeting text + emotion tag |
| `frontends/sakura/src/views/ChatThread.tsx` | On character load, if `greetingEnabled`, fetch + display greeting before input |
| `frontends/sakura/src/components/GreetingCard.tsx` | New: subtle animated card showing contextual greeting (fades after read or first user message) |
| `frontends/sakura/src/views/SettingsView.tsx` | Add "Opening Greeting" toggle + intensity (brief/full) to Character tab |
| `backend/preflight.py` | Add `greeting_enabled`, `greeting_intensity` columns to `characters` |

### Tasks
1. Build `GreetingGenerator` (context assembly + prompt + LLM call, cached for 30 min so re-opening doesn't re-generate)
2. Add `/api/characters/{id}/greeting` endpoint
3. Build `GreetingCard.tsx` with fade-in animation + emotion expression
4. Wire into ChatThread character load flow
5. Add special date tracking (user can mark dates like "anniversary", "her birthday")
6. Add greeting settings to SettingsView Character tab

### Complexity: Small-Medium (1.5–2 days). Uses existing infrastructure throughout.

---

## Feature Summary

| # | Feature | Tier | Complexity | Key OSS |
|---|---------|------|-----------|---------|
| A1 | Full-Duplex Voice Conversation | NEW LARGE | 5–7 days | faster-whisper, silero-vad, wLipSync |
| A2 | In-App Mini Games with AI | NEW LARGE | 3–5 days | None (coded game logic) |
| A3 | Tiered Episodic Memory (sqlite-vec) | NEW LARGE | 4–5 days | sqlite-vec |
| A4 | Character Moods & Daily States | NEW LARGE | 1.5–2 days | None |
| A5 | AI-Generated Expression Portraits | NEW LARGE | 2–3 days | EasyDiffusion/ComfyUI (existing) |
| A6 | Lorebook / World Info Injection | NEW LARGE | 2–3 days | None |
| A7 | Kokoro TTS + Voice Modulation | NEW LARGE | 3–4 days | kokoro-onnx, KVoiceWalk |
| B1 | Cinematic Immersion Mode | UX/UI | 2 days | None |
| B2 | Emotion-Driven VRM Expressions | UX/UI | 1.5–2 days | None |
| B3 | Visual Novel Reader Layout | UX/UI (low pri) | 2 days | None |
| B4 | Author's Note / Soft Prompt | UX/UI | 1 day | None |
| C1 | Live2D Runtime Support | PLATFORM | 4–5 days | pixi-live2d-display |
| C2 | Plugin Extension System | PLATFORM (maybe) | 4–5 days | None |
| C3 | User Knowledge Graph | PLATFORM | 2–3 days | None |
| A8 | SillyTavern Character Card Import/Export | NEW LARGE | 2–3 days | Pillow (pip) |
| C4 | Companion Opening Greeting | PLATFORM | 1.5–2 days | None |

---

## A8 — SillyTavern Character Card Import & Export ✅

### What It Is
Users can import SillyTavern character cards (PNG files with CHARA v2 JSON embedded in EXIF metadata) and export their characters in the same format. Thousands of community-made cards exist; this lets users bring them into the app instantly. Export lets users share characters or back them up in the universal format.

**CHARA v2 fields mapped to app schema:**
- `name` → `characters.name`
- `description` + `personality` + `scenario` → `characters.background`
- `first_mes` → `characters.greeting_message`
- `mes_example` → stored as example dialogue in backstory
- `system_prompt` → `characters.system_prompt`
- `creator_notes` → stored in character notes field

### OSS Libraries
- `Pillow` (pip) — read/write PNG EXIF metadata (the `UserComment` field holds base64-encoded CHARA JSON)
- No new npm packages needed

### Files to Create/Modify
| File | Change |
|------|--------|
| `backend/characters/chara_card.py` | New: `CharaCardReader.read(png_path) → dict`, `CharaCardWriter.write(char_data, output_path)` |
| `backend/server.py` | `POST /api/characters/import-card` (multipart PNG upload → create character); `GET /api/characters/{id}/export-card` (→ PNG download) |
| `frontends/sakura/src/views/CreateView.tsx` | Add "Import Card" tab alongside manual create |
| `frontends/sakura/src/components/CharacterCardImporter.tsx` | New: drag-drop PNG upload, extracted field preview, field mapping editor before import |

### Tasks
1. Install `Pillow`; build `CharaCardReader` (read PNG EXIF UserComment → base64 decode → JSON)
2. Build `CharaCardWriter` (character data → CHARA v2 JSON → embed in PNG EXIF)
3. Add import/export API endpoints
4. Build `CharacterCardImporter.tsx` — drag-drop, field preview, confirm + import
5. Add export button to character settings panel
6. Test with 5+ community character card PNGs for compatibility

### Complexity: Small-Medium (2–3 days). Well-specified format; mostly plumbing.

## Suggested Implementation Order

**Fastest visible wins (1–2 days each):**
B4 → B2 → A4 → C4

**Core differentiators (2–5 days each):**
A6 (Lorebook) → A3 (Memory) → A7 (Kokoro) → A2 (Games)

**Heavy lifts (4–7 days each):**
A1 (Voice) → C1 (Live2D) → A5 (Portraits) → C2 (Plugins)
