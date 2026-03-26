# Actionable Implementation Specs — Research → Plans

> **Date:** 2026-03-15
> **Status:** Implementation-ready specs. Each section is a buildable plan.
> **Source:** HuggingFace model discoveries, competitor analysis, codebase stubs, Riko project analysis.
> **Companion doc:** `2026-03-15-feature-menu.md` (priority tiers), `2026-03-15-competitor-analysis-feature-gaps.md` (raw research)

---

## How to Read This Document

Each spec follows this format:
- **What:** One-sentence description
- **Why:** Value proposition / competitive gap it fills
- **Files to Create/Modify:** Exact paths
- **Schema Changes:** Migration SQL (if any)
- **API Endpoints:** REST/WS specs
- **Frontend UI:** Component placement
- **Implementation Steps:** Ordered build sequence
- **Testing:** Backend pytest + frontend tsc + manual smoke
- **Effort:** T-shirt size with day estimate

---

## TIER 0: Quick Wins (< 1 day each)

---

### T0-1: Desktop Pet Mute State Fix

**What:** Wire the hardcoded `isMuted: false` in PetView to the React store + Electron IPC.

**Why:** Desktop pet users can't mute TTS — the TODO has been there since Phase 2.

**Files to Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/views/PetView.tsx:213` | Replace `isMuted: false` with store read |
| `frontends/sakura/src/stores/settingsStore.ts` | Add `petMuted: boolean` + `togglePetMute()` |
| `electron/preload.js` | Add `getPetMuted` / `setPetMuted` IPC bridge methods |
| `electron/main.js` | Add `get-pet-muted` / `set-pet-muted` IPC handlers (persist to electron-store) |
| `frontends/sakura/src/types/electron.d.ts` | Add `getPetMuted(): Promise<boolean>`, `setPetMuted(v: boolean): void` |

**Implementation Steps:**
1. Add `petMuted` field to settingsStore with `togglePetMute()` action
2. In PetView.tsx, read `petMuted` from store, pass to iframe via `postMessage`
3. Add IPC handlers in electron/main.js that persist to electron-store
4. Wire preload.js bridge methods
5. Update TypeScript declarations

**Testing:**
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: open pet mode, toggle mute, verify TTS stops/starts

**Effort:** XS (30 min)

---

### T0-2: Character Portfolio Export (html2canvas)

**What:** Make `handleExport()` in CharacterPortfolioCard actually export the card as a PNG image.

**Why:** "Coming soon!" placeholder — users expect export to work.

**Files to Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/components/CharacterPortfolioCard.tsx:248-252` | Replace placeholder with html2canvas capture |
| `frontends/sakura/package.json` | Add `html2canvas` dependency |

**Implementation Steps:**
1. `cd frontends/sakura && npm install html2canvas`
2. Import `html2canvas` in CharacterPortfolioCard.tsx
3. Replace `handleExport()` body:
   ```tsx
   const handleExport = async () => {
     const cardEl = cardRef.current;
     if (!cardEl) return;
     setExportMsg('Generating...');
     const canvas = await html2canvas(cardEl, { useCORS: true, scale: 2 });
     const link = document.createElement('a');
     link.download = `${character.name}_card.png`;
     link.href = canvas.toDataURL('image/png');
     link.click();
     setExportMsg('');
   };
   ```
4. Add `const cardRef = useRef<HTMLDivElement>(null)` and attach to card wrapper

**Testing:**
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: open character portfolio, click export, verify PNG downloads

**Effort:** XS (2–3 hours)

---

### T0-3: Swipe for Alternatives (Message Regeneration UI)

**What:** Add swipe L/R UI to browse regenerated AI messages. Backend already supports branching via `/api/messages/{id}/regenerate`.

**Why:** Character.AI and SillyTavern both have this — it's a top user expectation for roleplay apps. The backend endpoint already exists (server.py:4300-4410), we just need frontend UI.

**Files to Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/components/ChatBubble.tsx` | Add swipe arrows + branch indicator for assistant messages |
| `frontends/sakura/src/stores/chatStore.ts` | Add `regenerateMessage(msgId)`, `swipeBranch(msgId, direction)` actions |
| `backend/server.py` | Add `GET /api/messages/{id}/branches` endpoint to list all branches |

**New API Endpoint:**
```
GET /api/messages/{message_id}/branches
Response: {
  "branches": [
    { "id": 101, "text": "...", "emotion": "happy", "created_at": "..." },
    { "id": 105, "text": "...", "emotion": "curious", "created_at": "..." }
  ],
  "active_index": 0,
  "total": 2
}
```

**Implementation Steps:**
1. Add `/api/messages/{id}/branches` — query messages sharing same `parent_id` (or same position in conversation)
2. In ChatBubble.tsx, for assistant messages: show `◄ 1/3 ►` indicator + swipe arrows when branches > 1
3. Add "Regenerate" button (🔄) to assistant message context menu
4. chatStore: `regenerateMessage()` calls `POST /api/messages/{id}/regenerate`, then refreshes branch list
5. chatStore: `swipeBranch()` calls `PATCH /api/messages/{id}/activate` to toggle `is_active`
6. On swipe, update displayed message without full reload

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (add test for branches endpoint)
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: send message → click regenerate → verify swipe arrows appear → swipe between versions

**Effort:** S (1 day)

---

### T0-4: Prompt Template Macros

**What:** Support `{{time}}`, `{{date}}`, `{{mood}}`, `{{trust_level}}`, `{{user_name}}`, `{{char_name}}` placeholders in character system prompts.

**Why:** RisuAI and SillyTavern both have this. Users writing custom system prompts want dynamic values without hardcoding. This is a pure backend change — expand macros before sending to LLM.

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/llm/macro_expander.py` | **NEW** — macro expansion function |
| `backend/server.py` (in `_build_prompt_sections()`) | Call `expand_macros()` on system prompt text |

**Supported Macros:**
```
{{char_name}}      → character name
{{user_name}}      → user display name (from config)
{{time}}           → current time (HH:MM)
{{date}}           → current date (YYYY-MM-DD)
{{day}}            → day of week (Monday, Tuesday, ...)
{{mood}}           → character's current mood
{{trust_level}}    → affinity tier (stranger/acquaintance/friend/close_friend/soulmate)
{{message_count}}  → total messages in session
{{relationship_days}} → days since first_chat_date
```

**Implementation Steps:**
1. Create `backend/llm/macro_expander.py`:
   ```python
   import re
   from datetime import datetime

   def expand_macros(text: str, context: dict) -> str:
       """Expand {{macro}} placeholders in system prompt text.

       Args:
           text: Raw system prompt with {{macro}} placeholders
           context: Dict with keys matching macro names

       Returns:
           Text with all recognized macros expanded, unknown macros left as-is
       """
       def replacer(match: re.Match) -> str:
           key = match.group(1).strip().lower()
           return str(context.get(key, match.group(0)))
       return re.sub(r'\{\{(\w+)\}\}', replacer, text)
   ```
2. In `_build_prompt_sections()`, build context dict from character data + datetime
3. Call `expand_macros(system_prompt, ctx)` before creating the section
4. Document supported macros in settings UI tooltip

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (add test for macro_expander)
- Test edge cases: unknown macros left as-is, empty values, nested braces

**Effort:** S (0.5–1 day)

---

## TIER 1: High Impact, Medium Effort (1–3 days)

---

### T1-5: Groq ASR Integration (Free Cloud STT)

**What:** Add Groq's free Whisper API as an ASR provider. Zero cost, fast, supports context hints for name accuracy.

**Why:** Discovered from Riko project analysis. Currently the only cloud STT option is paid OpenAI Whisper. Groq offers free Whisper large-v3 with ~200ms latency. Perfect fallback when local faster-whisper is too slow or unavailable.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/asr/adapters/groq_asr.py` | **NEW** — Groq Whisper adapter |
| `backend/asr/registry.py` | Register `"groq"` provider type |
| `frontends/sakura/src/views/SettingsView.tsx` | Add "Groq (Free)" to ASR provider dropdown |
| `frontends/nova/src/views/SettingsView.tsx` | Same |

**Implementation Steps:**
1. Create `backend/asr/adapters/groq_asr.py`:
   ```python
   class GroqASRAdapter(ASRAdapter):
       """Groq cloud Whisper — free tier, ~200ms latency.

       Uses Groq's OpenAI-compatible /v1/audio/transcriptions endpoint.
       Supports context hints via the 'prompt' parameter for name accuracy.
       """
       async def transcribe(self, audio_bytes: bytes, language: str = None) -> dict:
           # POST to https://api.groq.com/openai/v1/audio/transcriptions
           # model: "whisper-large-v3-turbo"
           # Headers: Authorization: Bearer {GROQ_API_KEY}
           # Multipart: file=audio.wav, model=..., prompt=character_name
           ...
   ```
2. Register in `backend/asr/registry.py`: `if provider == "groq": return GroqASRAdapter(cfg)`
3. Add Groq API key field to settings (stored in services config, never committed)
4. Add context hints: pass character name as Whisper `prompt` param for better name recognition
5. Frontend: add `<option value="groq">Groq (Free Cloud)</option>` to ASR dropdown

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Manual: set ASR to Groq, speak character's name, verify it's recognized correctly

**Effort:** S (1–2 days)

---

### T1-6: Soundscape Player — Source Audio Assets

**What:** Source or generate 8 ambient audio tracks and wire them into SoundscapePlayer.

**Why:** 5 of 8 tracks have `src: null` (Café, Rain, Lo-Fi, Forest, City). The player UI exists and works — it just has no audio.

**Files to Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/components/SoundscapePlayer.tsx:31-35` | Replace `src: null` with actual URLs |
| `frontends/shared/audio/soundscapes/` | **NEW DIR** — store local audio files |

**Audio Sources (all need to be royalty-free / CC0):**
| Track | Source Strategy |
|-------|----------------|
| Café | freesound.org CC0 café ambience loop |
| Rain | freesound.org CC0 rain on window loop |
| Lo-Fi | Generate via Stable Audio or use CC0 lo-fi beat |
| Forest | freesound.org CC0 forest birds + wind loop |
| City | freesound.org CC0 urban traffic ambience loop |
| Library | freesound.org CC0 quiet room with page turns |
| Ocean | freesound.org CC0 waves on shore loop |
| Night | freesound.org CC0 crickets + night ambience loop |

**Implementation Steps:**
1. Download 8 CC0 ambient loops (MP3, ~2-5MB each, 2-5 min loops)
2. Place in `frontends/shared/audio/soundscapes/` (or serve from backend static)
3. Update `src` fields in SoundscapePlayer.tsx tracks array
4. Ensure seamless looping (Audio element `loop=true`)
5. Test volume slider + crossfade between tracks

**Testing:**
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: open soundscape player, play each track, verify loop + volume

**Effort:** S (1–2 days, mostly sourcing audio)

---

### T1-7: Regex Output Formatting Rules

**What:** User-defined regex rules that clean/transform LLM output before display. Stored per-character.

**Why:** SillyTavern and RisuAI both have this. Users want to strip `*narrator voice*`, enforce `{{char}}` replacement, remove OOC markers, etc. Currently `_parse_emotion_gesture()` (server.py:946-989) does hardcoded cleanup — this makes it user-configurable.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/llm/output_formatter.py` | **NEW** — apply user regex rules to LLM output |
| `backend/server.py` | Call `apply_format_rules()` after `_parse_emotion_gesture()` |
| `backend/preflight.py` | Schema v48: `output_format_rules` table |
| `frontends/sakura/src/components/FormatRulesEditor.tsx` | **NEW** — CRUD UI for regex rules |
| `frontends/sakura/src/views/SettingsView.tsx` | Add FormatRulesEditor to character settings |

**Schema (v48):**
```sql
CREATE TABLE output_format_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    pattern TEXT NOT NULL,        -- regex pattern
    replacement TEXT NOT NULL,    -- replacement string (supports \1 groups)
    is_enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,  -- lower = applied first
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_format_rules_char ON output_format_rules(character_id, is_enabled);
```

**API Endpoints:**
```
GET    /api/characters/{id}/format-rules        → list rules
POST   /api/characters/{id}/format-rules        → create rule
PATCH  /api/format-rules/{rule_id}              → update rule
DELETE /api/format-rules/{rule_id}              → delete rule
```

**Implementation Steps:**
1. Add migration `migrate_to_v48()` in preflight.py
2. Create `backend/llm/output_formatter.py`:
   ```python
   def apply_format_rules(text: str, rules: list[dict]) -> str:
       """Apply user-defined regex rules to LLM output.

       Args:
           text: Raw LLM output (after emotion/gesture extraction)
           rules: List of {pattern, replacement, is_enabled} dicts, sorted by priority

       Returns:
           Formatted text with all enabled rules applied
       """
       for rule in rules:
           if not rule.get("is_enabled"):
               continue
           try:
               text = re.sub(rule["pattern"], rule["replacement"], text)
           except re.error:
               continue  # Skip invalid regex
       return text.strip()
   ```
3. In server.py, after `_parse_emotion_gesture()`, fetch rules and call `apply_format_rules()`
4. Add CRUD endpoints for rules
5. Build FormatRulesEditor.tsx with test input preview
6. Ship with 3 built-in presets: "Strip OOC", "Remove narrator", "Clean asterisks"

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (test output_formatter with various patterns)
- Manual: add rule `*action text*` → empty, send message, verify actions stripped

**Effort:** M (2–3 days)

---

### T1-8: Daily Interaction Rewards & Relationship Milestones

**What:** Track daily interaction streaks, relationship XP, and milestone events. Character acknowledges streaks and milestones in conversation.

**Why:** Moescape uses this for retention. Creates emotional investment — "Day 30 with Kitsune!" feels meaningful. Leverages existing mood engine + greeting system.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/rewards/tracker.py` | **NEW** — streak tracking, XP calculation, milestone detection |
| `backend/server.py` | Inject reward context into `_build_prompt_sections()` |
| `backend/preflight.py` | Schema v49: `interaction_rewards` table |
| `frontends/sakura/src/components/StreakBadge.tsx` | **NEW** — streak flame icon in chat header |

**Schema (v49):**
```sql
CREATE TABLE interaction_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    interaction_date TEXT NOT NULL,     -- YYYY-MM-DD
    message_count INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    streak_day INTEGER DEFAULT 1,
    milestone_hit TEXT,                 -- NULL or milestone name
    UNIQUE(character_id, interaction_date)
);
CREATE INDEX idx_rewards_char_date ON interaction_rewards(character_id, interaction_date DESC);

-- Also add columns to characters table:
ALTER TABLE characters ADD COLUMN current_streak INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN total_xp INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN relationship_tier TEXT DEFAULT 'stranger';
```

**Relationship Tiers:**
```
stranger     (0 XP)      → acquaintance (100 XP)
acquaintance (100 XP)     → friend       (500 XP)
friend       (500 XP)     → close_friend (2000 XP)
close_friend (2000 XP)    → soulmate     (10000 XP)
```

**Milestones:** Day 7, Day 30, Day 100, Day 365, tier-up events, 1000 messages, etc.

**Implementation Steps:**
1. Schema migration v49
2. Create `backend/rewards/tracker.py` with `record_interaction()`, `get_streak()`, `check_milestones()`
3. Call `record_interaction()` in chat endpoint after successful response
4. Inject milestone context into `_build_prompt_sections()` (like anniversary system)
5. Add `StreakBadge.tsx` showing 🔥 7 in chat header
6. When tier changes, inject special system message: `[MILESTONE: You've reached 'close_friend' tier!]`

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (test streak logic, XP calc, tier boundaries)
- Manual: chat multiple days, verify streak counter increments

**Effort:** S-M (1–2 days)

---

### T1-9: Character Card PNG Export (SillyTavern Standard)

**What:** Export character as PNG with embedded JSON in tEXt chunk — the standard SillyTavern sharing format.

**Why:** We already import SillyTavern cards (`CharaCardReader`/`CharaCardWriter` in `backend/characters/chara_card.py`). Export endpoint exists (`GET /api/characters/{id}/export-card`). But CharacterPortfolioCard's "Export" button (T0-2) exports a screenshot — this is the machine-readable format for sharing.

**Files to Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/components/CharacterPortfolioCard.tsx` | Add "Share as Card (PNG)" option alongside visual export |
| `backend/characters/chara_card.py` | Already has `CharaCardWriter` — verify it embeds all v2 fields |

**Implementation Steps:**
1. Verify `CharaCardWriter.write()` includes all CHARA v2 fields (personality, scenario, mes_example, etc.)
2. Add "Share as Card" button to portfolio card that calls `GET /api/characters/{id}/export-card`
3. Download the returned PNG (avatar image with embedded JSON)
4. Add import drag-and-drop: detect PNG files dropped on chat, check for tEXt 'chara' chunk

**Testing:**
- Export card → import in SillyTavern → verify all fields survive round-trip
- Export card → import back in our app → verify identical character created

**Effort:** S (1 day — mostly testing round-trip)

---

### T1-10: Local STT with Qwen3-ASR or whisper.cpp

**What:** Add lightweight local ASR options beyond faster-whisper. Qwen3-ASR-0.6B runs on CPU at near-real-time speed. whisper.cpp is C++ optimized Whisper.

**Why:** faster-whisper large-v3 needs ~4GB RAM. Qwen3-ASR-0.6B needs ~1.2GB and is faster. whisper.cpp is even lighter. Users want fully offline voice without heavy RAM usage.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/asr/adapters/qwen_asr.py` | **NEW** — Qwen3-ASR adapter via transformers pipeline |
| `backend/asr/adapters/whisper_cpp.py` | **NEW** — whisper.cpp subprocess adapter |
| `backend/asr/registry.py` | Register `"qwen_asr"` and `"whisper_cpp"` providers |
| `frontends/sakura/src/views/SettingsView.tsx` | Add to ASR dropdown |

**Implementation Steps:**
1. Create `backend/asr/adapters/qwen_asr.py`:
   ```python
   class QwenASRAdapter(ASRAdapter):
       """Qwen3-ASR-0.6B — tiny, fast, CPU-friendly local ASR.

       Uses HuggingFace transformers pipeline. ~1.2GB RAM.
       Model: Qwen/Qwen3-ASR-0.6B
       """
       def __init__(self, cfg: dict):
           self.model_id = cfg.get("asr_model", "Qwen/Qwen3-ASR-0.6B")
           self._pipeline = None  # lazy load

       async def transcribe(self, audio_bytes: bytes, language: str = None) -> dict:
           if self._pipeline is None:
               from transformers import pipeline
               self._pipeline = pipeline("automatic-speech-recognition", model=self.model_id)
           result = await asyncio.to_thread(self._pipeline, audio_bytes)
           return {"text": result["text"], "confidence": 1.0}
   ```
2. Create `backend/asr/adapters/whisper_cpp.py`:
   ```python
   class WhisperCppAdapter(ASRAdapter):
       """whisper.cpp — C++ optimized Whisper, very fast on CPU.

       Requires whisper.cpp binary installed. Model files in backend/models/whisper/.
       """
       async def transcribe(self, audio_bytes: bytes, language: str = None) -> dict:
           # Write temp WAV, call whisper.cpp subprocess, parse stdout
           ...
   ```
3. Register both in `backend/asr/registry.py`
4. Add to frontend ASR dropdown with model size info

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Manual: set ASR to Qwen, speak, verify transcription accuracy

**Effort:** M (3–4 days including model download + testing)

---

## TIER 2: Major Features (3–7 days)

---

### T2-11: Proactive AI Messages

**What:** Character initiates conversation based on time-of-day, mood state, relationship tier, or silence duration. Not just responds — reaches out.

**Why:** Open LLM VTuber has this. It's the single biggest differentiator between "chatbot" and "companion." A character that says "Good morning! I was thinking about what you said yesterday about..." feels alive.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/proactive/scheduler.py` | **NEW** — event scheduler, trigger evaluation, message generation |
| `backend/proactive/triggers.py` | **NEW** — trigger definitions (time, silence, mood, milestone) |
| `backend/server.py` | Background task + WebSocket push for proactive messages |
| `backend/preflight.py` | Schema v50: `proactive_messages` table, `proactive_config` on characters |
| `frontends/sakura/src/hooks/useProactiveMessages.ts` | **NEW** — WebSocket listener for incoming proactive messages |
| `frontends/sakura/src/components/ProactiveNotification.tsx` | **NEW** — toast/bubble UI for proactive messages |
| `frontends/sakura/src/views/SettingsView.tsx` | Add proactive message settings |

**Schema (v50):**
```sql
CREATE TABLE proactive_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,        -- 'morning_greeting', 'check_in', 'mood_share', 'milestone'
    message_text TEXT NOT NULL,
    delivered_at TEXT,
    dismissed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Config columns on characters:
ALTER TABLE characters ADD COLUMN proactive_enabled INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN proactive_frequency TEXT DEFAULT 'normal';  -- quiet, normal, chatty
ALTER TABLE characters ADD COLUMN proactive_hours TEXT DEFAULT '9-22';        -- active hours range
```

**Trigger Types:**
| Trigger | Condition | Example Message |
|---------|-----------|-----------------|
| `morning_greeting` | First check-in after 6 AM, no chat today | "Good morning! ☀️ How did you sleep?" |
| `check_in` | 4+ hours silence during active hours | "Hey, just thinking about you. How's your day going?" |
| `mood_share` | Random, 1-2x per day | "I've been feeling [mood] today... [reason from recent context]" |
| `milestone` | Streak/XP milestone hit | "Can you believe it's been 30 days? 🎉" |
| `night_wish` | Between 21:00-23:00, hasn't chatted in 2h | "Getting sleepy... Sweet dreams when you head to bed 🌙" |

**Implementation Steps:**
1. Schema migration v50
2. Create trigger evaluation engine (checks conditions every 15 min via background task)
3. When trigger fires: generate message via LLM (short, in-character, contextual)
4. Push via WebSocket to connected clients
5. Frontend shows toast notification with character avatar
6. Clicking notification opens chat with the proactive message already in history
7. Settings: enable/disable per character, frequency, active hours
8. Rate limiting: max 3 proactive messages per day per character

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line` (test trigger logic with mocked time)
- Manual: enable proactive, wait for trigger, verify notification appears

**Effort:** M-L (3–4 days)

---

### T2-12: Emotion Mirroring via Webcam (Future Vision #4)

**What:** Use MediaPipe Face Mesh to detect user's facial expression via webcam and mirror it on the avatar. Zero cloud, fully local.

**Why:** This is the "magic moment" feature — your avatar smiles when you smile. No competitor does this with a local 3D avatar. MediaPipe runs entirely in the browser (WASM), no server needed.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/hooks/useEmotionMirror.ts` | **NEW** — MediaPipe face mesh + expression classification |
| `frontends/sakura/src/stores/viewerStore.ts` | Add `setMirroredExpression()` dispatch |
| `frontends/shared/viewer/viewer.html` | Handle `mirrorExpression` message type for VRM blend shapes |
| `frontends/sakura/src/views/SettingsView.tsx` | Add webcam toggle + sensitivity slider |
| `frontends/sakura/package.json` | Add `@mediapipe/face_mesh`, `@mediapipe/camera_utils` |

**Expression Mapping:**
```
MediaPipe blendshapes → VRM expressions:
  mouthSmile(L+R)  > 0.5  → happy
  browDown(L+R)    > 0.6  → angry
  eyeSquint(L+R)   > 0.4  → happy (crinkle)
  jawOpen           > 0.3  → surprised
  mouthFrown(L+R)  > 0.4  → sad
  browInnerUp      > 0.5  → worried
```

**Implementation Steps:**
1. Install MediaPipe face mesh (browser-side, ~4MB WASM)
2. Create `useEmotionMirror` hook: request webcam, run face mesh at 10fps, classify expression
3. Debounce expression changes (hold for 500ms before switching)
4. Send expression to viewerStore → dispatch to VRM iframe or Live2D canvas
5. viewer.html: handle `mirrorExpression` postMessage, apply VRM blend shape weights
6. Settings: webcam permission toggle, sensitivity slider, mirror rate (5-30fps)
7. Privacy: webcam stream stays local, never sent to server, no recording

**Testing:**
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- Manual: enable mirror, smile at camera, verify avatar expression changes

**Effort:** M-L (5–8 days)

---

### T2-13: Local TTS Expansion — Fish Audio, Dia, F5-TTS

**What:** Add 3 new TTS providers to the existing 18-provider adapter system.

**Why:** HuggingFace discoveries. Fish Audio s2-pro enables voice cloning, Dia-1.6B has dialogue-aware intonation, F5-TTS is a strong general-purpose option. The adapter pattern makes this straightforward.

**Files to Create:**
| File | Provider |
|------|----------|
| `backend/tts/adapters/fish_audio.py` | Fish Audio s2-pro (already registered in registry but may need local mode) |
| `backend/tts/adapters/dia.py` | **NEW** — Dia-1.6B adapter |
| `backend/tts/adapters/f5tts.py` | **NEW** — F5-TTS adapter (may already exist — verify) |

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/tts/registry.py` | Register new adapters |
| `backend/tts/voice_modulator.py` | Add provider-specific output formats |
| `frontends/sakura/src/views/SettingsView.tsx` | Already has categories — add options |

**Implementation Pattern (same for each):**
```python
class DiaAdapter(TTSAdapter):
    """Dia-1.6B — dialogue-aware TTS with per-speaker intonation.

    Runs locally via HTTP API. Model: nari-labs/Dia-1.6B
    Special feature: different intonation per speaker role.
    """
    def speak(self, text: str, tts_cfg: dict) -> dict:
        endpoint = tts_cfg.get("endpoint", "http://localhost:8005")
        voice_id = tts_cfg.get("voice_id", "default")
        speed = tts_cfg.get("speed_factor", 1.0)
        resp = httpx.post(f"{endpoint}/v1/audio/speech", json={
            "input": text, "voice": voice_id, "speed": speed
        })
        if resp.status_code != 200:
            return {"ok": False, "error": resp.text}
        name = self._mk_name()
        (self.audio_dir / name).write_bytes(resp.content)
        return {"ok": True, "filename": name, "meta": {"provider": "dia"}}
```

**Voice Modulator Integration:**
```python
# In voice_modulator.py _format_for_provider():
if p in ("dia", "f5tts"):
    out = {"speed_factor": speed}
    return out
```

**Implementation Steps:**
1. Verify Fish Audio adapter status (may already exist as cloud adapter — add local mode)
2. Create Dia adapter following TTSAdapter pattern
3. Create F5-TTS adapter following same pattern
4. Register in registry.py
5. Add voice modulator format entries
6. Test each provider independently

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Manual: select each provider in settings, generate speech, verify playback

**Effort:** M (3–4 days, 1 day per provider + integration testing)

---

### T2-14: Emotion-Aware TTS (HumeAI TADA-1B)

**What:** Instead of modulating pitch/rate parameters, use a TTS model that inherently generates emotional speech from text + emotion tag.

**Why:** HumeAI's TADA-1B generates speech that *sounds* sad/happy/etc. without post-processing. This supplements the existing VoiceModulator approach — for providers that support it, skip parameter tweaking and let the model handle emotion natively.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/tts/adapters/hume_tada.py` | **NEW** — TADA-1B adapter with emotion-aware synthesis |
| `backend/tts/registry.py` | Register `"hume_tada"` provider |
| `backend/tts/voice_modulator.py` | Add bypass logic: if provider supports native emotion, pass emotion tag instead of params |
| `backend/server.py` | Pass detected emotion to TTS adapter when using emotion-native providers |

**Implementation Steps:**
1. Create `hume_tada.py` adapter with emotion parameter in speak():
   ```python
   class HumeTadaAdapter(TTSAdapter):
       """HumeAI TADA-1B — emotion-aware speech synthesis.

       Instead of pitch/rate modulation, emotion is conveyed through vocal quality.
       Accepts emotion tag directly and generates appropriate prosody.
       """
       def speak(self, text: str, tts_cfg: dict) -> dict:
           emotion = tts_cfg.get("emotion", "neutral")
           # Pass emotion directly to model inference
           ...
   ```
2. In voice_modulator.py, add `NATIVE_EMOTION_PROVIDERS = {"hume_tada"}` — skip param modulation
3. In `_apply_emotion_tts()`, if provider in NATIVE_EMOTION_PROVIDERS, set `tts_cfg["emotion"] = emotion` directly
4. Register in registry, add to settings dropdown

**Effort:** S-M (2–3 days)

---

### T2-15: AI Character Card Generator (personaplex-7b)

**What:** "Create Character" wizard powered by NVIDIA's personaplex-7b. User provides a few traits → model generates full character bible.

**Why:** Creating detailed characters is the biggest friction point for new users. "I want a shy bookworm who secretly loves punk rock" → full system prompt, personality, greeting, backstory, example messages.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/characters/generator.py` | **NEW** — character generation pipeline |
| `backend/server.py` | Add `POST /api/characters/generate` endpoint |
| `frontends/sakura/src/components/CharacterWizard.tsx` | **NEW** — step-by-step wizard UI |
| `frontends/sakura/src/views/SettingsView.tsx` | Add "Create with AI" button to character list |

**API Endpoint:**
```
POST /api/characters/generate
Body: {
  "traits": ["shy", "bookworm", "secretly loves punk rock"],
  "name": "Luna",                    // optional
  "gender": "female",               // optional
  "age_range": "young adult",       // optional
  "setting": "modern day college"   // optional
}
Response: {
  "ok": true,
  "character": {
    "name": "Luna Ashford",
    "system_prompt": "...",
    "personality": "...",
    "greeting_message": "...",
    "backstory": "...",
    "example_messages": "...",
    "suggested_avatar_prompt": "..."  // for image generation
  }
}
```

**Implementation Steps:**
1. Create `backend/characters/generator.py`:
   - Build meta-prompt that instructs the LLM to generate a CHARA v2-compatible character
   - Use the user's connected LLM (not hardcoded to personaplex) — personaplex is the ideal model but any capable LLM works
   - Parse structured output into character fields
2. Add `/api/characters/generate` endpoint
3. Build CharacterWizard.tsx: trait input → preview → edit → save
4. Wizard shows generated character for editing before saving to DB
5. Optional: suggest avatar search terms for ModelBrowser

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Manual: open wizard, enter traits, verify generated character is coherent and complete

**Effort:** M (3–4 days)

---

### T2-16: Memory Visualization (Editable "Memory Book")

**What:** Visual panel showing what the AI remembers about you — facts, memories, conversation summaries. User can view, edit, or delete entries.

**Why:** Agnai's "book" view. Users want transparency into AI memory. Currently memories are invisible — you can't see what the knowledge graph extracted or what tiered memory retained. Also builds trust: "the AI knows X about me, and I can correct it."

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `frontends/sakura/src/components/MemoryBook.tsx` | **NEW** — tabbed memory viewer/editor |
| `frontends/sakura/src/stores/memoryStore.ts` | **NEW** — Zustand store for memory CRUD |
| `backend/server.py` | Add `GET /api/characters/{id}/memory-book`, `PATCH /api/memories/{id}`, `DELETE /api/memories/{id}` |

**API Endpoints:**
```
GET /api/characters/{id}/memory-book
Response: {
  "facts": [
    { "id": 1, "fact": "User likes tea", "confidence": 0.92, "source": "conv_42", "created_at": "..." },
    ...
  ],
  "memories": [
    { "id": 1, "content": "...", "tier": "long_term", "importance": 0.85, "created_at": "..." },
    ...
  ],
  "summaries": [
    { "id": 1, "summary_text": "...", "msg_range": "1-50", "created_at": "..." },
    ...
  ]
}

PATCH /api/memories/{id}   → edit memory content
DELETE /api/memories/{id}  → delete memory
PATCH /api/user-facts/{id} → edit fact
DELETE /api/user-facts/{id} → delete fact
```

**UI Layout:**
```
┌─ Memory Book ──────────────────────────────┐
│ [Facts] [Memories] [Summaries]             │
│                                            │
│ 📌 User likes Earl Grey tea         [✏️][🗑️] │
│    Confidence: 92% · Source: Mar 5         │
│                                            │
│ 📌 User is a software engineer     [✏️][🗑️] │
│    Confidence: 88% · Source: Mar 1         │
│                                            │
│ 📌 User has a cat named Mochi     [✏️][🗑️] │
│    Confidence: 95% · Source: Feb 28        │
│                                            │
│ [+ Add Fact Manually]                      │
└────────────────────────────────────────────┘
```

**Implementation Steps:**
1. Add memory book API endpoints (read from existing `user_facts`, `memories`, `session_summaries` tables)
2. Add PATCH/DELETE endpoints for editing
3. Create `MemoryBook.tsx` with 3 tabs: Facts, Memories, Summaries
4. Each entry: inline edit, delete button, metadata (confidence, source, date)
5. "Add Fact Manually" button for user-provided facts
6. Place in side panel or as a tab in character settings

**Testing:**
- `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Manual: open memory book, verify facts appear, edit one, delete one, verify changes persist

**Effort:** S-M (2–3 days)

---

### T2-17: Super Off-Road Racing Game

**What:** Canvas 2D top-down racer. AI companion races against you and provides commentary.

**Why:** Design doc fully written at `docs/plans/2026-02-27-super-offroad-racing-game-design.md`. 10 weapons, 3 tiers, mystery boxes, upgrade shop. Self-contained in `frontends/shared/racing/racing.html`.

**Implementation:** Follow the existing design doc. No additional planning needed.

**Effort:** L (5–7 days)

---

## TIER 3: Major Projects (1–2 weeks)

---

### T3-18: Phone Companion PWA (Future Vision #7)

**What:** Progressive Web App with mobile-optimized layout, service worker for offline caching, push notifications.

**Why:** Access your companion from phone without installing an app. Service worker caches UI assets for fast load on mobile networks.

**Key Work:**
- Responsive layout (already partially done in Sakura)
- Service worker for asset caching + offline mode indicator
- Touch-optimized chat input + gesture support
- Reduced 3D quality preset for mobile GPUs
- Push notifications for proactive messages (T2-11)
- `manifest.json` for "Add to Home Screen"

**Effort:** L (6–9 days)

---

### T3-19: VTuber Co-Host Mode (Future Vision #6)

**What:** Character acts as Twitch stream co-host. Reads chat, reacts to events, provides commentary via OBS overlay.

**Key Work:**
- Twitch IRC bot (read chat messages, sub events, raids)
- OBS WebSocket integration (scene switching, overlay text)
- Stream persona mode (different system prompt for streaming)
- Viewer interaction (character responds to chat commands)
- Alert overlay (new sub → character reaction)

**Effort:** XL (6–8 days)

---

### T3-20: Emulator Integration

**What:** PS1/PS2 games playable in-app via EmulatorJS (browser WASM).

**Why:** Design doc at `docs/plans/2026-02-27-emulator-gaming-integration-design.md`.

**Implementation:** Follow existing design doc.

**Effort:** XL (8–12 days)

---

### T3-21: Character Marketplace

**What:** Community hub for sharing/downloading character cards with ratings, search, and categories.

**Key Work:**
- Character card server (upload/download/search)
- Rating + review system
- Category tags + search
- Preview cards before importing
- Report/moderation system
- Could use HuggingFace Hub as backend (free hosting for card files)

**Effort:** XL (8–12 days)

---

## Appendix A: Voice Cloning Pipeline (Fish Audio s2-pro)

**What:** Upload a voice sample → clone the voice for TTS. Fish Audio s2-pro enables this locally.

**Integration Point:** Extends existing `ChatterboxAdapter` voice cloning pattern:
```python
# Chatterbox already does this (chatterbox.py:95-110):
# 1. User provides voice_sample_path
# 2. Adapter base64-encodes reference audio
# 3. Sends to model for zero-shot cloning
#
# Fish Audio s2-pro follows same pattern but with:
# - Higher quality output
# - FP8 quantization (fits in 8GB VRAM)
# - Faster inference
```

**UI Addition:**
- "Clone Voice" button in VoicePicker
- Upload WAV/MP3 (5–30 seconds of clean speech)
- Preview cloned voice before saving
- Store reference audio path in character config

---

## Appendix B: Conversation Forking

**What:** Fork from any message to explore alternate story paths.

**Schema:**
```sql
ALTER TABLE sessions ADD COLUMN forked_from_session_id INTEGER REFERENCES sessions(id);
ALTER TABLE sessions ADD COLUMN forked_at_message_id INTEGER REFERENCES messages(id);
```

**Endpoint:** `POST /api/sessions/fork`
```json
{
  "session_id": 1,
  "message_id": 42
}
→ Creates new session with messages 1–42 copied, returns new session_id
```

**UI:** "Fork" button in message context menu → opens new chat tab with history up to that point.

---

## Appendix C: Web Search Integration

**What:** LLM can search the web during conversation via tool calling.

**Integration Points:**
- `backend/llm/capability_detector.py` — add `web_search` tool definition
- `backend/agent/runner.py` — handle `web_search` tool call in agentic loop
- `backend/tools/web_search.py` — **NEW** — call SearXNG/Brave/Google API
- `backend/llm/context_assembler.py` — inject search snippets as system messages
- Settings: "Allow web search" toggle + API key + provider selection

---

## Appendix D: Document Upload to Chat (RAG-Lite)

**What:** Drag PDF/TXT into chat. Extract text, chunk, inject into context.

**Integration Points:**
- `backend/documents/extractor.py` — **NEW** — PDF/TXT/DOCX text extraction
- `backend/llm/context_assembler.py` — inject document chunks at medium priority
- Frontend: drag-and-drop zone on chat input + file picker button
- Schema: `chat_documents` table (session_id, filename, content, chunk_count)
- Libraries: `pymupdf` for PDF, `python-docx` for DOCX, plain read for TXT

---

## ADDENDUM: AnimeGirly Handoff Research (2026-03-15)

Source: `/Users/chris/Code/AnimeGirly/docs/CLAUDE_CODE_HANDOFF.md`

---

### T0-22: Content Rating System for Model Recommendations

**What:** Add `content_rating` (general/edgy/mature) field to model recommendations and filter UI.

**Why:** AnimeGirly handoff has a content rating system that lets users filter models by content policy. Our `model_recommendations.json` has no content filtering — users can't tell which models are uncensored vs safe.

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/data/model_recommendations.json` | Add `content_rating` field to every model entry |
| `frontends/sakura/src/components/LinkStatusPanel.tsx` | Add content rating filter dropdown to model browser |

**Implementation Steps:**
1. Add `"content_rating": "general" | "edgy" | "mature"` to each model in `model_recommendations.json`
2. Add filter dropdown in model recommendation UI
3. Default to showing all; user can restrict to "general only"

**Effort:** XS (2–3 hours)

---

### T0-23: Quality Ratings per Model (4-Axis)

**What:** Add per-axis quality ratings (creativeWriting, characterVoice, instructionFollowing, roleplayImmersion) to model recommendations.

**Why:** Our current `quality_tier` is just "good"/"great"/"excellent" — a single axis. The AnimeGirly schema rates each model on 4 dimensions (1-10 scale), which helps users pick the right model for their use case.

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/data/model_recommendations.json` | Add `quality_ratings` object to each model |
| `docs/MODEL_GUIDE.md` | Add quality comparison table |

**Schema Addition:**
```json
"quality_ratings": {
  "creative_writing": 8,
  "character_voice": 9,
  "instruction_following": 7,
  "roleplay_immersion": 9
}
```

**Effort:** XS (1–2 hours — data entry from handoff doc)

---

### T0-24: GGUF Quantization Reference in MODEL_GUIDE

**What:** Add quantization quick-reference table to `docs/MODEL_GUIDE.md`.

**Why:** Users don't know the difference between Q4_K_M, Q5_K_M, Q8_0, FP16. The handoff doc has a clean reference table mapping quant level → quality → size for 7B/13B/70B.

**Files to Modify:**
| File | Change |
|------|--------|
| `docs/MODEL_GUIDE.md` | Add "GGUF Quantization Quick Reference" section |

**Content to Add:**
```markdown
| Quant | Quality | Size (7B) | Size (13B) | Size (70B) | Notes |
|-------|---------|-----------|------------|------------|-------|
| Q4_K_M | Good | ~4.1GB | ~7.9GB | ~40GB | Best balance of quality/size |
| Q5_K_M | Better | ~4.8GB | ~9.2GB | ~48GB | Recommended for ≤14B |
| Q8_0 | Near-FP16 | ~7.2GB | ~13.8GB | ~72GB | Best for ≤8B on 16GB VRAM |
| FP16 | Lossless | ~14GB | ~26GB | ~140GB | Only for tiny models or massive VRAM |
```

**Effort:** XS (15 min)

---

### T0-25: Stream Reset Sentinel for Provider Failover

**What:** When an LLM provider fails mid-stream, clear partial content before trying fallback provider.

**Why:** AnimeGirly has a `STREAM_RESET_SENTINEL` pattern. Our streaming endpoint (`/api/chat/stream`) has NO mid-stream failover — if a provider dies mid-response, the user sees a partial broken message. This is a robustness fix.

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/server.py` (streaming SSE loop) | Add try/catch around stream iterator, on failure: send reset event, try next adapter |
| `frontends/sakura/src/stores/chatStore.ts` | Handle `stream_reset` SSE event type — clear accumulated text |

**Implementation Steps:**
1. In `/api/chat/stream`, wrap the token iteration in try/except
2. On exception: send SSE event `{"type": "stream_reset"}` to frontend
3. If fallback adapter available (via link_manager routing), retry with next adapter
4. Frontend chatStore: on `stream_reset` event, clear the current streaming message content
5. If no fallback: send error event as usual

**Effort:** S (0.5–1 day)

---

### T1-26: Expanded Model Catalog (30+ RP/Anime Models)

**What:** Merge AnimeGirly's 30+ model database into our `model_recommendations.json`, including anime-specialized models and abliterated variants.

**Why:** Our catalog has ~15 models across 4 tiers. The handoff doc has 30+ models organized into 5 tiers including anime-specialized models (WaifuAI, MoE Girl, Gemma Waifu, Neural Dark Waifu) and abliterated variants (Dolphin3, DeepSeek R1, Gemma 27B abliterated) that our users would want.

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/data/model_recommendations.json` | Add ~20 new model entries with content_rating + quality_ratings |
| `docs/MODEL_GUIDE.md` | Update model count, add anime-specialized section |

**New Models to Add:**
| Category | Models |
|----------|--------|
| Premium RP | Violet Lotus 12B, Mag Mell R1 12B, Stheno v3.4 8B, Noromaid 20B |
| Anime-Specialized | WaifuAI L3 8B, MoE Girl 3B, Gemma 3 Waifu 4B, Anime Qwen3 14B, Neural Dark Waifu 7B |
| Abliterated | Dolphin3 Abliterated 8B, Eva Qwen 2.5 14B, DeepSeek R1 Abliterated 14B, Gemma 27B Abliterated |
| General Uncensored | Natsumura RP 8B, MythoMax L2 13B, Qwen 2.5 7B Uncensored |

**Implementation Steps:**
1. For each model: add entry with id, hf_id, name, architecture, quant, vram_gb, capabilities, content_rating, quality_ratings, ollama pull command
2. Organize into existing tier structure (vram-8gb, vram-12gb, vram-16gb, cloud)
3. Add new tier: "anime-specialized" for waifu/anime-tuned models
4. Update MODEL_GUIDE.md with new model count + anime section

**Effort:** S-M (1–2 days — mostly data entry + verification)

---

### T1-27: Director Mode (Dual-Layer OOC Stage Directions)

**What:** Add a "Director Mode" toggle that lets users send out-of-character stage directions without triggering an LLM response. Directions are injected into the prompt as cumulative (persistent) + immediate (next-reply-only) layers.

**Why:** Different from our Author's Note (B4). Author's Note is a persistent text block at a fixed prompt position. Director Mode is per-message notes that accumulate over the conversation — "she should be shy now", "the scene changes to a rainy café" — and a separate immediate instruction layer for the next reply only. AnimeGirly shipped this as their first feature.

**Files to Create/Modify:**
| File | Change |
|------|--------|
| `backend/server.py` (`_build_prompt_sections()`) | Add director note collection + injection at two positions |
| `backend/preflight.py` | Schema v48+: add `role` value 'director' to messages |
| `frontends/sakura/src/components/ChatInputBar.tsx` | Add director mode toggle (🎬 icon) |
| `frontends/sakura/src/components/ChatBubble.tsx` | Render director messages as distinct styled cards |

**Implementation Steps:**
1. Allow `role = 'director'` in messages table (no schema change needed — role is TEXT)
2. In `_build_prompt_sections()`:
   - Collect ALL director messages in visible window → inject as cumulative block after system prompt
   - Collect director messages AFTER last assistant message → inject as immediate block before LLM response
   - Skip director messages from conversation turns (they're metadata, not dialogue)
3. Frontend: add 🎬 toggle in ChatInputBar — when active, message is sent as director note (no LLM call)
4. Render director messages as amber/gold centered cards (distinct from user/assistant bubbles)

**Effort:** S-M (1–2 days)

---

### T1-28: Anime-Specific TTS/STT Adapters

**What:** Add anime-optimized TTS and STT models from the handoff research.

**Why:** General-purpose TTS/STT models aren't optimized for anime speech patterns. Anime Whisper beats Whisper-v3 on anime content (CER 13.0 vs 16.5). Orpheus AnimeSpeech and Anime Llasa produce anime-style voices natively.

**New Adapters:**
| Model | Type | File | Key Feature |
|-------|------|------|-------------|
| Anime Whisper | STT | `backend/asr/adapters/anime_whisper.py` | Beats Whisper-v3 on anime CER |
| Voxtral Mini 4B | STT | `backend/asr/adapters/voxtral.py` | Sub-500ms, infinite audio, sliding window |
| Orpheus AnimeSpeech 3B | TTS | `backend/tts/adapters/orpheus.py` | Anime-trained voice synthesis |
| Anime Llasa 3B | TTS | `backend/tts/adapters/anime_llasa.py` | Anime voice cloning in 3 seconds |

**Files to Modify:**
| File | Change |
|------|--------|
| `backend/asr/registry.py` | Register anime_whisper, voxtral |
| `backend/tts/registry.py` | Register orpheus, anime_llasa |
| `backend/tts/voice_modulator.py` | Add provider format entries |
| `frontends/sakura/src/views/SettingsView.tsx` | Add to dropdowns |

**Implementation:** Follow existing TTSAdapter / ASRAdapter pattern (see T1-10, T2-13).

**Effort:** M (2–3 days — 0.5 day per adapter)

---

### UPDATE: T2-14 Correction — TADA is 3B, Not 1B

The AnimeGirly handoff corrects our earlier spec: **HumeAI TADA is 3B parameters, not 1B**. Key additional detail: TADA uses **1:1 token alignment** — each text token maps to exactly one audio token, eliminating TTS hallucination entirely. This is a more significant model than we originally estimated.

Updated VRAM requirement: ~6GB at FP16, ~3GB at Q4.

---

## Index: All Specs by Source

### From HuggingFace Discoveries
- T1-10: Local STT (Qwen3-ASR, whisper.cpp)
- T2-13: Local TTS Expansion (Fish Audio, Dia, F5-TTS)
- T2-14: Emotion-Aware TTS (HumeAI TADA-1B)
- T2-15: AI Character Card Generator (personaplex-7b)
- Appendix A: Voice Cloning (Fish Audio s2-pro)

### From Competitor Analysis
- T0-3: Swipe for Alternatives (Character.AI, SillyTavern)
- T0-4: Prompt Template Macros (RisuAI)
- T1-5: Groq ASR (Riko Project)
- T1-7: Regex Output Formatting (SillyTavern, RisuAI)
- T1-8: Daily Interaction Rewards (Moescape)
- T1-9: Character Card PNG Export (SillyTavern)
- T2-11: Proactive AI Messages (Open LLM VTuber)
- T2-16: Memory Visualization (Agnai)
- Appendix B: Conversation Forking (LibreChat)
- Appendix C: Web Search Integration (Open WebUI)
- Appendix D: Document Upload (Open WebUI, SillyTavern)

### From Codebase Stubs
- T0-1: Desktop Pet Mute State
- T0-2: Character Portfolio Export
- T1-6: Soundscape Player Assets

### From Future Vision Ideas
- T2-12: Emotion Mirroring via Webcam (#4)
- T3-18: Phone Companion PWA (#7)
- T3-19: VTuber Co-Host Mode (#6)
- T3-21: Character Marketplace (#9)

### From Design Docs (Ready to Build)
- T2-17: Super Off-Road Racing Game
- T3-20: Emulator Integration

### From AnimeGirly Handoff Research
- T0-22: Content Rating System for Model Recommendations
- T0-23: Quality Ratings per Model (4-Axis)
- T0-24: GGUF Quantization Reference in MODEL_GUIDE
- T0-25: Stream Reset Sentinel for Provider Failover
- T1-26: Expanded Model Catalog (30+ RP/Anime Models)
- T1-27: Director Mode (Dual-Layer OOC Stage Directions)
- T1-28: Anime-Specific TTS/STT Adapters
- UPDATE: T2-14 corrected — TADA is 3B not 1B
