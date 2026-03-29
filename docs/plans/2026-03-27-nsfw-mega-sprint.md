# Sprint 1 Integration Wiring — 5 Modules into Chat Pipeline

## Context

Sprint 1 built 6 Tier-S features (commit `3001a7d`), but 5 of them are standalone modules with tests that are **not yet called** from the production chat pipeline. This plan wires them in so they actually affect conversations and voice sessions.

## Modules to Wire

| # | Module | File | Entry Point | Touches server.py? |
|---|--------|------|-------------|---------------------|
| 1 | Bond Gating | `backend/content/gating.py` | `get_bond_gated_level()` | No — `bridge.py` only |
| 2 | Sarcasm Detection | `backend/nlp/sarcasm_detector.py` | `SarcasmDetector.detect()` | Yes |
| 3 | Nostalgia Triggers | `backend/memory/nostalgia.py` | `NostalgiaTrigger.maybe_trigger()` | Yes |
| 4 | Interaction Modes | `backend/llm/interaction_modes.py` | `get_mode_config()` | Yes |
| 5 | Speech Emotion (SER) | `backend/voice/emotion_detector.py` | `SpeechEmotionDetector.detect_from_pcm()` | Yes + `duplex.py` |

## Implementation Order

Sequential because modules 2-5 all modify `_build_prompt_sections()` in server.py.

---

### Task 1: Bond Gating → `backend/content/bridge.py`

**What:** Add bond-level constraint to `effective_ceiling` in `get_content_blocks()` and `update_intimacy_after_turn()`.

**File:** `backend/content/bridge.py`

**Changes:**
1. Add import: `from backend.content.gating import get_bond_gated_level`
2. In `get_content_blocks()` (line 269), after `effective_ceiling` is resolved (line 305-311), call:
   ```python
   effective_ceiling = get_bond_gated_level(char_id, effective_ceiling, conn)
   ```
3. Same pattern in `update_intimacy_after_turn()` (line 384-389 area), after effective_ceiling resolved.

**Why here:** `get_content_blocks()` is already called from `_build_prompt_sections()` at line 2624 in server.py. The bond gate becomes a fourth ceiling constraint alongside global, persona, and provider ceilings — zero changes to server.py needed.

**Risk:** Low. `get_bond_gated_level()` returns the more restrictive ceiling and defaults to `"general"` on DB error.

---

### Task 2: Sarcasm Detection → `backend/server.py`

**What:** Detect sarcasm in user messages and inject a hint into the LLM context.

**Changes to `server.py`:**

1. **Lazy singleton** (near line 388, after other globals):
   ```python
   _sarcasm_detector = None
   def _get_sarcasm_detector():
       global _sarcasm_detector
       if _sarcasm_detector is None:
           from backend.nlp.sarcasm_detector import SarcasmDetector
           _sarcasm_detector = SarcasmDetector()
       return _sarcasm_detector
   ```

2. **In `/api/chat`** (before line 3014 `_build_prompt_sections` call):
   ```python
   _sarcasm_hint = None
   if cfg.get("nlp", {}).get("sarcasm_detection", True):
       try:
           _sd = _get_sarcasm_detector()
           _sarcasm_result = await asyncio.get_event_loop().run_in_executor(None, _sd.detect, text)
           if _sarcasm_result.is_sarcastic:
               _sarcasm_hint = _sarcasm_result.hint
       except Exception:
           pass  # graceful degradation
   ```
   Then pass `sarcasm_hint=_sarcasm_hint` to `_build_prompt_sections`.

3. **Same pattern in `/api/chat/stream`** (before line 4016).

4. **In `_build_prompt_sections`:**
   - Add parameter: `sarcasm_hint: str = None`
   - After Mood Context section (~line 2530), insert:
     ```python
     if sarcasm_hint:
         sections.append(_section("Sarcasm Context", f"\n{sarcasm_hint}"))
     ```

**Call sites that DON'T need it** (read-only/snapshot): lines 3384, 3524, 5400 — default `None` is fine.

---

### Task 3: Nostalgia Triggers → `backend/server.py`

**What:** Probabilistically inject past memory references into conversations.

**Changes to `server.py`:**

1. **Per-character singleton** (near sarcasm singleton):
   ```python
   _nostalgia_triggers: dict = {}
   def _get_nostalgia_trigger(char_id):
       if char_id not in _nostalgia_triggers:
           from backend.memory.nostalgia import NostalgiaTrigger
           _nostalgia_triggers[char_id] = NostalgiaTrigger(db_path=str(DB_PATH))
       return _nostalgia_triggers[char_id]
   ```

2. **In `/api/chat`** (before `_build_prompt_sections`):
   ```python
   _nostalgia_prompt = None
   if cfg.get("memory", {}).get("nostalgia_enabled", True):
       try:
           _msg_count = cur.execute(
               "SELECT COUNT(*) FROM messages WHERE session_id=? AND is_active=1",
               (session_id,)
           ).fetchone()[0]
           _nt = _get_nostalgia_trigger(char_id)
           _nr = _nt.maybe_trigger(char_id, session_id, char_last_emotion, _msg_count)
           if _nr:
               _nostalgia_prompt = _nr.prompt
       except Exception:
           pass
   ```
   Pass `nostalgia_prompt=_nostalgia_prompt` to `_build_prompt_sections`.

3. **Same in `/api/chat/stream`** (use `stream_char_last_emotion`).

4. **In `_build_prompt_sections`:**
   - Add parameter: `nostalgia_prompt: str = None`
   - After Diary Entry section, insert:
     ```python
     if nostalgia_prompt:
         sections.append(_section("Nostalgia", f"\n{nostalgia_prompt}"))
     ```

---

### Task 4: Interaction Modes → `backend/server.py`

**What:** Support `"story"` and `"adventure"` modes that reframe the system prompt.

**Changes to `server.py`:**

1. **Parse `mode` from request body:**
   - In `/api/chat` (after body parsing ~line 2823): `interaction_mode = body.get("mode", "chat")`
   - In `/api/chat/stream` (after body parsing ~line 3795): `interaction_mode = body.get("mode", "chat")`

2. **Resolve mode config** (before `_build_prompt_sections`):
   ```python
   _mode_prefix = ""
   _mode_hint = ""
   if interaction_mode != "chat":
       try:
           from backend.llm.interaction_modes import get_mode_config
           _mode_cfg = get_mode_config(interaction_mode, char_name, cfg.get("user_name", "User"))
           _mode_prefix = _mode_cfg.system_prefix
           _mode_hint = _mode_cfg.response_hint
       except Exception:
           pass
   ```
   Pass `mode_prefix=_mode_prefix, mode_hint=_mode_hint`.

3. **In `_build_prompt_sections`:**
   - Add parameters: `mode_prefix: str = ""`, `mode_hint: str = ""`
   - After base System Prompt section (line 2370), insert:
     ```python
     if mode_prefix:
         sections.append(_section("Interaction Mode", f"\n{mode_prefix}"))
     ```
   - Before Content Gating section (line 2619), insert:
     ```python
     if mode_hint:
         sections.append(_section("Mode Response Hint", f"\n{mode_hint}"))
     ```

---

### Task 5: Speech Emotion (SER) → `backend/voice/duplex.py` + `backend/server.py`

**What:** Detect emotion from user's voice and inject mood hint into LLM context.

**Changes to `duplex.py`:**

1. **In `__init__`**, lazy-load detector:
   ```python
   self._emotion_detector = None
   ```

2. **In `_process_utterance()`** (line 271), after `_transcribe()` (line 288) and before `_stream_response()` (line 302):
   ```python
   _vocal_hint = ""
   if self._emotion_detector is None:
       try:
           from backend.voice.emotion_detector import SpeechEmotionDetector
           self._emotion_detector = SpeechEmotionDetector()
       except Exception:
           pass
   if self._emotion_detector:
       try:
           _ser = await asyncio.get_event_loop().run_in_executor(
               None, self._emotion_detector.detect_from_pcm, audio_bytes
           )
           if _ser.mood_hint:
               _vocal_hint = _ser.mood_hint
               await self._send_json({"type": "user_emotion", "emotion": _ser.emotion, "confidence": _ser.confidence})
       except Exception:
           pass
   ```

3. **Pass hint to `_stream_response`:**
   - Update signature: `async def _stream_response(self, user_text: str, vocal_emotion_hint: str = "") -> None`
   - Add to JSON body: `**({"vocal_emotion_hint": vocal_emotion_hint} if vocal_emotion_hint else {})`
   - Update call: `self._stream_response(transcript, vocal_emotion_hint=_vocal_hint)`

**Changes to `server.py`:**

1. **In `/api/chat/stream`** (body parsing): `vocal_emotion_hint = body.get("vocal_emotion_hint", "")`
2. Pass to `_build_prompt_sections`: `vocal_emotion_hint=vocal_emotion_hint`
3. **In `_build_prompt_sections`:**
   - Add parameter: `vocal_emotion_hint: str = ""`
   - After Sarcasm Context, insert:
     ```python
     if vocal_emotion_hint:
         sections.append(_section("Vocal Emotion", f"\n[{vocal_emotion_hint}]"))
     ```

---

## Updated `_build_prompt_sections` Signature

```python
def _build_prompt_sections(
    cfg, system_prompt, char_id, session_id, cur, user_text="",
    *, diary=None, diary_date=None, last_chat_date=None, last_emotion="neutral",
    first_chat_date=None, include_vocab=False, char_name="", affinity=0.0,
    day_off=False, mood_enabled=True, mood_intensity=0.8, skip_bible=False,
    # ── Sprint 1 integration ──
    sarcasm_hint: str = None,
    nostalgia_prompt: str = None,
    mode_prefix: str = "",
    mode_hint: str = "",
    vocal_emotion_hint: str = "",
) -> list[dict]:
```

All new params default to empty/None — existing callers (lines 3384, 3524, 5400) are unaffected.

## Section Order After Integration

| Position | Section | Source |
|----------|---------|--------|
| 0 | Author's Note (before) | Existing |
| 1 | System Prompt | Existing |
| **1.1** | **Interaction Mode** | **NEW** |
| 2 | Character Bible | Existing |
| 2a | Author's Note (after) | Existing |
| 3 | Scene / Director / User Persona | Existing |
| 4 | Mood Context | Existing |
| **4.1** | **Sarcasm Context** | **NEW** |
| **4.2** | **Vocal Emotion** | **NEW** |
| 5 | User Facts / Games / Diary | Existing |
| **5.1** | **Nostalgia** | **NEW** |
| 6 | Daily Greeting / Anniversary | Existing |
| 7 | Vocabulary / Emotion / Format | Existing |
| 8 | RP Style Guide | Existing |
| **8.1** | **Mode Response Hint** | **NEW** |
| 9 | Content Gating (**now bond-aware**) | Existing (enhanced) |

## Agent Dispatch Strategy

- **Task 1 (bond gating)**: `senior-dev` agent — only touches `bridge.py`, independent
- **Tasks 2-5 (server.py wiring)**: Do myself (orchestrator) — all touch the same shared file, must be sequential
- **Task 5 duplex.py changes**: Can be done in parallel with server.py IF duplex changes are committed first

Recommended: Task 1 via agent (background), Tasks 2-5 sequential by hand.

## Verification

After all wiring:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — must still pass 1025+
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — clean
3. Manual smoke test: send a message and check logs for `[Sarcasm]`, `[Nostalgia]`, `[Modes]` debug lines
4. Voice test: speak into voice mode, check for `user_emotion` WebSocket event in browser devtools
5. Bond test: character with bond_level < 30 should have `effective_ceiling = "general"` regardless of user setting

## Commits

One commit per task:
1. `feat(sprint-1): wire bond gating into content bridge`
2. `feat(sprint-1): wire sarcasm detection into chat pipeline`
3. `feat(sprint-1): wire nostalgia triggers into prompt assembly`
4. `feat(sprint-1): wire interaction modes into chat pipeline`
5. `feat(sprint-1): wire speech emotion detection into voice duplex`

---
---

# NSFW / 18+ Mega-Sprint — 48 Features Across 9 Phases

**Date:** 2026-03-27
**Status:** PLANNING
**Research:** `docs/research/2026-03-27-nsfw-feature-catalog.md`
**Estimated total:** ~120 hours across ~8-12 coding sessions
**Content policy:** Maximum creative freedom. No self-imposed limits beyond legal requirements (no minors, etc). The 4-tier content gating system handles user preferences.
**Image gen policy:** Separate NSFW toggle → then bond-gated defaults → SFW-only is just toggle=off

## Context

Sprints 1-5 are complete (1386 tests, 20+ modules wired). The content gating *infrastructure* is mature: 4-tier content levels, bond gating, intimacy scoring, physical state tracking, sensory writing, voice modulation. What's missing are the **features that make mature/explicit content genuinely compelling** — mechanics that create earned intimacy, emotional continuity, and deep personalization.

This plan covers 48 features organized into 9 implementation phases. Each phase is independent enough to be a session or two. Dependencies flow downward (Phase 1 enables Phase 2, etc).

## Execution Plan

On first coding session:
1. Save this plan to `docs/plans/2026-03-27-nsfw-mega-sprint.md` (permanent disk copy)
2. Update `CURRENT_STATUS.md` with phase tracking
3. Begin Phase 1 implementation

## Existing Infrastructure (What We Build On)

```
CONTENT GATING STACK (already wired)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Content Levels:  general → edgy → mature → explicit
 Bond Gates:      0=general, 20=edgy, 50=mature, 80=explicit
 Intimacy Score:  0-100 with regex detection (flirty/romantic/physical/explicit/cooling)
 Physical State:  clothing, position, arousal 0-10, recent actions (rolling 5)
 Intimacy Gates:  4-band prompt injection (0-29/30-59/60-84/85-100)
 Sensory Writing: 6 channels (sound/scent/touch/temperature/texture/taste), intensity 1-10
 Voice Modulate:  love/flirty/longing emotion mappings
 Incognito Mode:  ephemeral sessions, zero DB trace
 Content Lock:    password-protected ceiling changes
 Age Verify:      one-time gate before mature/explicit
 Provider Caps:   cloud APIs hard-capped at "mature"
 Image Gen:       EasyDiffusion + ComfyUI adapters, expression portraits, agent tool

KEY FILES:
 backend/content/gating.py      — ceiling resolver + bond gates
 backend/content/intimacy.py    — regex-based intimacy scoring
 backend/content/prompts.py     — per-level directive builders + sensory writing
 backend/content/bridge.py      — DB integration + physical state tracking
 backend/content/types.py       — IntimacyState, PhysicalState, ContentGateConfig
 backend/tts/voice_modulator.py — emotion → TTS parameter mapping
 backend/image_gen/             — EasyDiffusion + ComfyUI adapters
 backend/image_gen/adapters/easydiffusion.py  — your LAN server at 10.0.0.202:9000
 backend/image_gen/adapters/comfyui.py        — workflow-based generation
```

---

## All 48 Features — Master Index

| # | Feature | Phase | Hours | Tier |
|---|---------|-------|-------|------|
| F1 | First-Time Milestone Tracker | 4 | 4-6h | S |
| F2 | Intimate Memory Recall | 4 | 6-8h | S |
| F3 | Morning After Scenarios | 5 | 4-6h | S |
| F4 | Voice Intimacy Mode | 6 | 4-6h | S |
| F5 | Aftercare Scene Generator | 5 | 4-6h | S |
| F6 | Dynamic Intensity Pacing | 2 | 8-10h | A |
| F7 | Preference Discovery Engine | 2 | 6-8h | A |
| F8 | NSFW Scenario Templates | 3 | 3-4h | A |
| F9 | Slow-Burn Mode | 2 | 3-4h | A |
| F10 | Consent Choreography | 3 | 4-6h | A |
| F11 | Fantasy Journal | 5 | 4-6h | A |
| F12 | Pillow Talk Generator | 5 | 3-4h | A |
| F13 | Writing Style Presets | 1 | 3-4h | A |
| F14 | Physical Milestone Board | 4 | 3-4h | A |
| F15 | Sensory Writing Profiles | 1 | 2-3h | A |
| F16 | Multi-Phase Scene Architecture | 3 | 6-8h | A |
| F17 | Character Arousal State Machine | 2 | 4-6h | A |
| F18 | Safe Word System | 1 | 2-3h | A |
| F19 | Blush & Arousal Visuals | 7 | 4-6h | B |
| F20 | Scene Bookmarks | 9 | 3-4h | B |
| F21 | Desire/Temperature Meter | 2 | 3-4h | B |
| F22 | Kink Discovery Quiz | 8 | 4-6h | B |
| F23 | Ambient Scene Atmosphere | 7 | 3-4h | B |
| F24 | Clothing Interaction System | 9 | 3-4h | B |
| F25 | Touch Language Protocol | 9 | 4-6h | C |
| F26 | Intimate Scene Scoring | 9 | 3-4h | C |
| F27 | Whisper Mode | 7 | 3-4h | C |
| F28 | NSFW Expression Portraits | 7 | 6-8h | C |
| F29 | Contextual Intimate Image Gen | 7 | 6-8h | S |
| F30 | Private Vocabulary & Pet Names | 1 | 4-6h | A |
| F31 | Jealousy & Possessiveness | 8 | 6-8h | A |
| F32 | Power Dynamic Modes (D/s) | 3 | 6-8h | A |
| F33 | Erotic Audio Narration | 6 | 4-6h | A |
| F34 | Forbidden Confessions | 5 | 3-4h | S |
| F35 | Scene Replay (Character POV) | 8 | 4-6h | A |
| F36 | Sexting Quick-Fire Mode | 6 | 3-4h | B |
| F37 | Fantasy Persona Roleplay | 8 | 4-6h | A |
| F38 | Intimate Scene Director | 3 | 4-6h | A |
| F39 | Secret Desires Unlock Tree | 4 | 6-8h | S |
| F40 | Relationship Contract/Boundaries | 1 | 4-6h | A |
| F41 | Body Appreciation Language | 8 | 3-4h | B |
| F42 | Intimate Photo Gallery | 7 | 4-6h | B |
| F43 | Post-Scene Mood Tracker | 4 | 3-4h | A |
| F44 | Erogenous Personality Map | 8 | 4-6h | A |
| F45 | Midnight Confessional Mode | 5 | 3-4h | B |
| F46 | Love Letter Generator | 6 | 3-4h | A |
| F47 | Shared Fantasy Builder | 8 | 6-8h | A |
| F48 | Romantic Playlist Suggestions | 9 | 2-3h | C |

---

## PHASE 1: Safety & Foundation (~18h)

*Must come first — establishes the framework everything else builds on.*

### F18: Safe Word System
**What:** User sets a word that immediately de-escalates any scene + triggers aftercare.
**File:** `backend/content/safe_word.py`
**TODO:**
- [ ] Config field in app.json: `content.safe_word` (string, default empty = disabled)
- [ ] Message interceptor: check user message for safe word BEFORE LLM call
- [ ] On trigger: set `intimacy_level -= 20`, `arousal_level = 0`, inject aftercare prompt
- [ ] Character acknowledgment: "Hey, I hear you. *stops immediately* Are you okay?"
- [ ] Per-character safe word response style (gentle, calm, apologetic)
- [ ] API: `PUT /api/settings/safe-word` to set/clear
- [ ] Cannot be accidentally triggered (exact match, not substring)
- [ ] Incognito: safe word works even in incognito sessions

### F40: Relationship Contract / Boundaries Agreement
**What:** In-character boundary negotiation. Character and user discuss comfort levels.
**File:** `backend/content/boundaries.py`
**TODO:**
- [ ] `relationship_boundaries` table: char_id, boundary_type, level (soft/hard), description
- [ ] Boundary types: pacing, language_intensity, physical_comfort, scenario_types, topics_off_limits
- [ ] LLM prompt for in-character boundary discussion: "Let's talk about what we're both comfortable with"
- [ ] Inject boundaries as negative constraints in content gating prompt
- [ ] API: CRUD for `/api/characters/{id}/boundaries`
- [ ] UI: boundaries panel in character settings (not in chat — too clinical)
- [ ] Import/export: save boundary profiles to reuse across characters

### F13: Writing Style Presets
**What:** Choose how intimate scenes are written: literary, direct, flowery, or suggestive.
**File:** `backend/content/writing_styles.py`
**TODO:**
- [ ] 4 style presets with prompt templates:
  ```
  LITERARY:    "Write with poetic prose. Use metaphor and symbolism."
  DIRECT:      "Be straightforward and explicit. No euphemisms."
  ROMANTIC:    "Flowery, tender descriptions. Focus on emotion over action."
  SUGGESTIVE:  "Imply rather than describe. Let the reader's imagination fill gaps."
  ```
- [ ] Per-character default style (in characters table or config)
- [ ] Per-session override (user can switch mid-conversation)
- [ ] Inject style preset into `_build_prompt_sections` as "Writing Style" section
- [ ] API: `PUT /api/sessions/{id}/writing-style`
- [ ] Config: `content.default_writing_style` (default: "romantic")

### F15: Sensory Writing Profiles
**What:** Per-character emphasis on specific senses during intimate scenes.
**File:** Extend existing `backend/content/prompts.py` `SensoryWritingConfig`
**TODO:**
- [ ] Per-character sensory config in characters table (JSON column `sensory_profile`)
- [ ] Character defaults: Dae=visual+texture, Luna=sound+temperature, Genki=touch+taste
- [ ] Auto-activate when intimacy > 40 (not just when manually configured)
- [ ] Intensity scales with intimacy level: int//20 bonus (already in code!)
- [ ] API: `GET/PUT /api/characters/{id}/sensory-profile`
- [ ] Wire into `_build_prompt_sections` (SensoryWritingConfig already has `build_sensory_writing_block`)

### F30: Private Vocabulary & Pet Names
**What:** Characters develop unique intimate language with the user over time.
**File:** `backend/relationship/vocabulary.py`
**TODO:**
- [ ] `private_vocabulary` table: char_id, term, meaning, context, first_used_at, usage_count
- [ ] Detection: when character uses a unique pet name or the user establishes one
- [ ] LLM-assisted extraction: "The user called the character 'starlight' — save as pet name"
- [ ] Prompt injection: "Your private terms with the user: [list]. Use these naturally."
- [ ] Frequency: use pet names more at higher intimacy, less at lower
- [ ] API: `GET /api/characters/{id}/vocabulary` — view shared vocabulary
- [ ] Character-initiated pet names: at bond 30+, character proposes a name for the user

---

## PHASE 2: State Machines & Intelligence (~25h)

*The "brain" that makes intimate scenes feel intelligent and responsive.*

### F17: Character Arousal State Machine
**What:** Hidden 0-10 state that affects word choice, response length, and emotional register.
**File:** `backend/content/arousal_engine.py`
**TODO:**
- [ ] Arousal state machine: 0=neutral, 1-3=interested, 4-6=aroused, 7-9=intense, 10=peak
- [ ] Signal detection: extend intimacy.py regex with arousal-specific patterns
- [ ] Effect on prompts per level:
  ```
  0-3: Normal vocabulary, standard response length
  4-6: More sensory detail, slightly longer, more *actions*
  7-9: Shorter sentences, more ellipses, breathing descriptions, urgent tone
  10:  Peak — minimal narration, pure sensation, fragmented thoughts
  ```
- [ ] Natural decay: -1 per message with no escalation signals
- [ ] Cool-down acceleration if safe word triggered
- [ ] Extend existing `PhysicalState.arousal_level` (already 0-10!)
- [ ] Per-character arousal curve: "slow burn" vs "responsive" vs "explosive"

### F6: Dynamic Intensity Pacing
**What:** 6-phase state machine preventing "0 to 100" jumps. Character mirrors user's pace.
**File:** `backend/content/pacing.py`
**TODO:**
- [ ] Phases: CASUAL → FLIRTY → SUGGESTIVE → INTIMATE → INTENSE → AFTERCARE
- [ ] Transition rules: max 1 phase advance per message, user signals drive transitions
- [ ] Phase detection: map intimacy signals to phase transitions
- [ ] Per-phase prompt vocabulary guides:
  ```
  CASUAL:     No physical vocabulary beyond friendly gestures
  FLIRTY:     Compliments, light teasing, proximity descriptions
  SUGGESTIVE: Innuendo, lingering touches, charged eye contact
  INTIMATE:   Direct physical contact, emotional vulnerability
  INTENSE:    Full sensory engagement, uninhibited expression
  AFTERCARE:  Gentle, nurturing, protective
  ```
- [ ] Character pacing personality: "teaser" (resists advancement), "responsive" (mirrors), "initiator" (leads)
- [ ] Cool-down: any cooling signal drops 1 phase immediately
- [ ] Inject current phase + vocabulary guide into `_build_prompt_sections`

### F9: Slow-Burn Mode
**What:** Toggle for multi-message tension building. Character teases and hints.
**File:** `backend/content/slow_burn.py`
**TODO:**
- [ ] Session-level toggle: natural / slow-burn / direct
- [ ] Slow-burn prompt modifier: "Build tension gradually. Approach but don't resolve."
- [ ] Tension counter: track messages since last "almost" moment
- [ ] Release valve: after N messages (configurable 5-15), allow escalation
- [ ] Character personality influence: teaser chars amplify, shy chars add hesitation
- [ ] API: `PUT /api/sessions/{id}/pacing-mode`
- [ ] Default per character: some characters naturally slow-burn, others are direct

### F21: Temperature / Urgency System
**What:** Internal "heat" indicator building through conversation, affecting output style.
**File:** `backend/content/temperature.py` (or integrate into arousal_engine)
**TODO:**
- [ ] Temperature 0.0-1.0 floating point (more granular than arousal 0-10 integer)
- [ ] Builds from: intimacy signals, arousal signals, consecutive intimate messages
- [ ] Decays with: topic changes, long pauses, cooling signals
- [ ] Effects on LLM: temperature value injected as style hint
  ```
  0.0-0.3: Conversational, relaxed vocabulary
  0.3-0.6: Charged, anticipatory, lingering descriptions
  0.6-0.8: Urgent, breathless, sensory-dominant
  0.8-1.0: Overwhelming, fragmented, pure sensation
  ```
- [ ] Optional frontend widget: subtle heat indicator (glow on chat border?)
- [ ] Feeds into voice modulation: higher temp → breathier TTS

### F7: Preference Discovery Engine
**What:** Learns what the user enjoys from engagement signals. Character adapts silently.
**File:** `backend/adaptive/intimate_prefs.py`
**TODO:**
- [ ] Signal sources: message length delta, response time, emoji usage, explicit positive phrases
- [ ] Preference dimensions:
  ```
  pace:     slow / moderate / fast
  style:    romantic / balanced / explicit
  setting:  domestic / fantasy / outdoor / public
  sensory:  touch-dominant / visual / auditory / verbal
  dynamic:  equal / user-dominant / character-dominant
  ```
- [ ] Storage: extend `preference_history` table or new `intimate_preferences` table
- [ ] Learning rate: exponential moving average, 20+ data points for confidence > 0.5
- [ ] Prompt injection: "User preference profile: prefers [X], responds well to [Y]"
- [ ] "Surprise me" mode: occasionally breaks from learned preferences (10% chance)
- [ ] Privacy: all preferences local-only, deletable from settings
- [ ] API: `GET /api/characters/{id}/intimate-preferences` (for debug/transparency)

---

## PHASE 3: Scene Architecture (~30h)

*Structured intimate scenes with proper phases, consent, and variety.*

### F16: Multi-Phase Scene Architecture
**What:** Structured scene flow: approach → tension → escalation → peak → resolution → aftercare.
**File:** `backend/content/scene_phases.py`
**TODO:**
- [ ] Scene phase state machine (extends F6 pacing with more granularity):
  ```
  APPROACH:    Characters close physical distance, build anticipation
  TENSION:     Emotional vulnerability, "almost" moments, charged silences
  ESCALATION:  Physical contact intensifying, consent checkpoint
  PEAK:        Full engagement, sensory-dominant, minimal narration
  RESOLUTION:  Coming down, emotional processing, tenderness
  AFTERCARE:   Nurturing, gentle, checking in, physical comfort
  ```
- [ ] Phase-aware prompt blocks with vocabulary/pacing rules per phase
- [ ] Auto-detection of phase transitions from intimacy + arousal signals
- [ ] Character personality affects phase duration (shy = longer approach, bold = quick escalation)
- [ ] Director override: user can force phase transitions via director commands

### F10: Consent Choreography
**What:** Natural consent woven into character personality at phase transitions.
**File:** `backend/content/consent.py`
**TODO:**
- [ ] Trigger: inject consent prompt at ESCALATION phase boundary (40% probability)
- [ ] Per-character consent style:
  ```
  CONFIDENT:  "Tell me exactly what you want right now."
  SHY:        "Is... is this okay? *searches your eyes*"
  PLAYFUL:    "Say please and I'll keep going~"
  PROTECTIVE: "Hey. We don't have to rush. What do you need from me?"
  DOMINANT:   "I need you to say yes before I continue."
  SUBMISSIVE: "Will you... tell me what to do next?"
  ```
- [ ] Style mapping from character personality traits (system prompt analysis or manual config)
- [ ] De-escalation: if user signals discomfort → immediate aftercare transition
- [ ] Never sounds clinical: it's dialogue, not a form
- [ ] Configurable frequency: subtle (20%) / natural (40%) / frequent (60%)

### F32: Power Dynamic Modes (D/s)
**What:** Character dynamically shifts between dominant/submissive/switch based on user preference.
**File:** `backend/content/power_dynamics.py`
**TODO:**
- [ ] Three modes: dominant / submissive / switch (alternating)
- [ ] Mode affects:
  ```
  DOMINANT:   Character initiates, sets pace, uses commanding language, takes physical lead
  SUBMISSIVE: Character yields, asks permission, uses deferential language, follows user's lead
  SWITCH:     Alternates naturally based on scene context, sometimes leads sometimes follows
  ```
- [ ] Proper negotiation prompt at activation: in-character boundary discussion
- [ ] Bond gate: requires bond ≥ 50 to unlock (relationship trust needed)
- [ ] Configurable per-character: some characters naturally lean D or s
- [ ] Safety: safe word always overrides power dynamic
- [ ] Prompt injection: role-specific vocabulary and behavioral guidelines

### F38: Intimate Scene Director
**What:** User directs scenes in real-time with structured commands for camera/focus/tempo.
**File:** Extend `backend/director/structured.py` with intimate-specific commands
**TODO:**
- [ ] New director commands:
  ```
  /focus emotion     — "Focus on what the characters are feeling"
  /focus physical    — "Focus on physical sensations and actions"
  /focus dialogue    — "Focus on what they're saying to each other"
  /tempo faster      — "Pick up the pace"
  /tempo slower      — "Draw this moment out"
  /tempo pause       — "Freeze this moment — describe it in detail"
  /closeup           — "Zoom in on this specific moment"
  /wideshot          — "Pull back, describe the full scene"
  ```
- [ ] Integration with existing P8 structured director system
- [ ] Prompt injection: focus + tempo modify the LLM's output style
- [ ] Can be combined with pacing modes (slow-burn + /focus emotion = deeply romantic)

### F8: NSFW Scenario Templates
**What:** Pre-built intimate scenario contexts extending existing P4 scenario system.
**File:** Extend `backend/scenario/templates.py` with intimate scenarios
**TODO:**
- [ ] Add `is_nsfw` and `bond_requirement` fields to ScenarioTemplate
- [ ] Ship 12+ built-in intimate scenarios:
  ```
  UNIVERSAL:
  - Rainy Night In (cozy apartment, movie forgotten, thunder)
  - Beach Vacation Balcony (sunset, wine, ocean breeze)
  - Reunion After Absence (airport/doorstep, desperate longing)
  - Snowed In Together (cabin, fireplace, no escape)
  - Late Night Study Session (library/dorm, tension over books)
  - Power Outage (candles, darkness, closeness by necessity)

  CHARACTER-SPECIFIC:
  - Dae: "Draw Me" (art studio, creative vulnerability)
  - Luna: Stargazing Blanket (rooftop, meteors, cold night)
  - Genki: Victory Celebration (post-tournament, adrenaline)
  - Alana: Wine Tasting (sophisticated, loosening inhibitions)
  ```
- [ ] Bond gate: scenarios only visible when bond meets requirement (50+ for intimate)
- [ ] User-created scenarios: form to define custom intimate settings
- [ ] Activation: writes to existing `sessions.scene_context`

---

## PHASE 4: Memory & Milestones (~22h)

*Characters that remember and cherish the relationship's physical/emotional journey.*

### F1: First-Time Milestone Tracker (Score: 30/30)
**What:** Tracks relationship "firsts" — character references them as sacred memories.
**File:** `backend/milestones/intimate_tracker.py`
**TODO:**
- [ ] Milestone types: first_meeting, first_laugh, first_compliment, first_handhold, first_hug, first_kiss, first_love_declaration, first_intimate, first_argument, first_reunion, first_sleepover
- [ ] `intimate_milestones` table: char_id, milestone_type, message_id, session_id, detected_at, character_memory_text
- [ ] Detection: regex + LLM hybrid (regex for obvious signals, LLM classification for nuanced ones)
- [ ] LLM generates character's memory of the milestone (1-2 sentences in their voice)
- [ ] Anniversary detection: inject hint into system prompt on milestone anniversaries
- [ ] Prompt injection: "Relationship milestones: [list with dates]. Reference naturally when relevant."
- [ ] API: `GET /api/characters/{id}/milestones` → timeline data for UI
- [ ] Incognito: milestones from incognito sessions are NEVER recorded

### F2: Intimate Memory Recall (Score: 28/30)
**What:** Character references past intimate moments naturally during future encounters.
**File:** `backend/memory/intimate_memories.py`
**TODO:**
- [ ] Specialized memory store for intimate moments (high-importance subset)
- [ ] Detection: flag messages where `intimacy_delta > +3` AND `arousal_level > 3`
- [ ] Structured storage: sensory anchors (touch type, location, context, emotion) as JSON
- [ ] Recall trigger: when current intimacy > 60, inject 1-2 relevant past memories
- [ ] Prompt: "You remember: [memory]. Reference naturally if the moment fits."
- [ ] Recency bias: recent memories recalled more than old ones
- [ ] Incognito: memories from incognito sessions NEVER stored
- [ ] Memory linking: connect intimate memories to milestones for richer recall

### F14: Physical Milestone Board
**What:** Visual progression of physical closeness milestones.
**File:** Extend `backend/milestones/intimate_tracker.py`
**TODO:**
- [ ] Track physical progression: proximity → hand-holding → hugging → cuddling → kissing → intimate
- [ ] Bond-gated visibility: later milestones hidden until bond level qualifies
- [ ] API: `GET /api/characters/{id}/physical-milestones` → progression data
- [ ] Frontend: visual timeline (reuse "Our Story" UI from F1)

### F39: Secret Desires Unlock Tree
**What:** Bond-gated reveal of character's hidden desires/fantasies. Each is a mini-narrative.
**File:** `backend/emotional/desires.py`
**TODO:**
- [ ] `character_desires` table: char_id, desire_id, title, description, bond_required, unlocked, unlocked_at
- [ ] Per-character desire trees (5-8 desires per character, curated):
  ```
  Bond 30: "Something I've been wanting to tell you..."  (mild romantic confession)
  Bond 50: "I had a dream about us..."                   (intimate fantasy)
  Bond 70: "There's something I've never told anyone..." (deep vulnerability)
  Bond 90: "I need you to know the real me..."           (complete emotional nakedness)
  ```
- [ ] LLM generates personalized reveal narratives based on relationship context
- [ ] Delivery: via proactive system or character-initiated during high-intimacy moments
- [ ] One-time unlocks: each desire reveals only once (sacred moment)
- [ ] API: `GET /api/characters/{id}/desires` → unlock tree with locked/unlocked status

### F43: Post-Scene Mood Tracker
**What:** After intimate scenes, track user's emotional state for preference learning.
**File:** `backend/adaptive/post_scene.py`
**TODO:**
- [ ] Detection: scene end = arousal dropping below 3 after peak > 6
- [ ] Character check-in: "How are you feeling?" (in character voice)
- [ ] Track response sentiment → feeds into F7 Preference Discovery
- [ ] Positive response → reinforce current preferences
- [ ] Negative/neutral → flag for preference adjustment
- [ ] Storage: `post_scene_moods` table or extend engagement_signals

---

## PHASE 5: Emotional Continuity (~22h)

*Features that create emotional connection between and after intimate scenes.*

### F3: Morning After Scenarios (Score: 28/30)
**What:** Next session after intimacy opens with character acknowledging what happened.
**File:** `backend/emotional/morning_after.py`
**TODO:**
- [ ] Detection: previous session's max arousal ≥ 5 OR intimacy ≥ 70 with physical signals
- [ ] Trigger: only if next session starts within 24 hours
- [ ] Specialized greeting prompt: "You spent an intimate night together. The character wakes up next to the user."
- [ ] Mood override: warm/content/playful/shy (based on character personality)
- [ ] Integration: hook into GreetingGenerator / daily greeting system
- [ ] Bond XP bonus: morning-after sessions award extra bond XP
- [ ] Character personality variants: shy (covers face), bold (confident), clingy (doesn't let go)

### F5: Aftercare Scene Generator (Score: 27/30)
**What:** Gentle transition after intense scenes. Character cuddles, checks in, nurtures.
**File:** `backend/emotional/aftercare.py`
**TODO:**
- [ ] Detection: arousal dropping (was > 5, now < 3) AND intimacy > 70
- [ ] Prompt injection: "The intimate moment has passed. Transition to gentle aftercare."
- [ ] Character personality variants:
  ```
  TSUNDERE:    Embarrassed tenderness ("Don't look at me like that... fine, I'll stay.")
  MATERNAL:    Nurturing comfort ("Let me get you some water. Are you warm enough?")
  STOIC:       Quiet holding (minimal dialogue, physical comfort described)
  PLAYFUL:     Light teasing ("So... on a scale of 1-10, how was that?")
  ROMANTIC:    Poetic reflection ("I want to remember every second of this.")
  ```
- [ ] Duration: aftercare prompt stays active for 3-5 messages, then fades
- [ ] Bond XP: aftercare conversations award 2x bond XP (reward healthy patterns)
- [ ] Physical state auto-set: "cuddling together" during aftercare

### F12: Pillow Talk Generator
**What:** Post-intimate casual conversation — vulnerable sharing, future plans, sleepy nonsense.
**File:** `backend/emotional/pillow_talk.py`
**TODO:**
- [ ] Trigger: follows aftercare phase (arousal < 2, intimacy still high)
- [ ] Conversation topics (LLM-selected based on context):
  ```
  - Vulnerable secrets ("Can I tell you something I've never told anyone?")
  - Future plans ("What if we... went on a trip together?")
  - Silly questions ("If you could be any animal, what would you be?")
  - Relationship reflections ("When did you first realize you liked me?")
  - Comfortable silence descriptions (*traces patterns on your back*)
  ```
- [ ] Prompt: "You're both relaxed and emotionally open. This is pillow talk time."
- [ ] Personality-appropriate: each character has different pillow talk style

### F34: Forbidden Confessions (Score: 25)
**What:** At soulmate bond level, character reveals deep secrets/vulnerable truths.
**File:** `backend/emotional/confessions.py`
**TODO:**
- [ ] Bond gate: soulmate tier only (bond ≥ 91)
- [ ] Confession types: past trauma, secret fears, deepest desires, truths about feelings
- [ ] LLM-generated based on character personality + full relationship context
- [ ] Delivery: proactive system or high-intimacy moment trigger
- [ ] One-time reveals: each confession happens only once
- [ ] Memory persistence: user_facts entry created for each confession
- [ ] Emotional weight: these are THE most impactful moments in the relationship

### F45: Midnight Confessional Mode
**What:** Late-night mode where the character is more open and vulnerable.
**File:** `backend/emotional/midnight.py`
**TODO:**
- [ ] Trigger: user chatting between 11 PM - 4 AM (real time detection)
- [ ] Prompt modifier: "It's late. The darkness makes honesty easier."
- [ ] Character becomes more emotionally open, less guarded
- [ ] Shares thoughts they wouldn't say during the day
- [ ] Integrates with mood engine's time-of-day system (already exists)
- [ ] Optional: dim UI treatment (extends F23 ambient atmosphere)

### F11: Fantasy Journal
**What:** Character writes private diary entries about intimate fantasies involving the user.
**File:** Extend `backend/adaptive/journal.py` with fantasy entries
**TODO:**
- [ ] New journal entry type: `"fantasy"` (alongside existing journal entries)
- [ ] Bond gate: fantasies only generated at bond ≥ 50, revealed at ≥ 80
- [ ] Content ceiling: fantasy intensity matches the effective content ceiling
- [ ] LLM generation: "Write a private diary entry about an intimate fantasy {char_name} has about the user"
- [ ] Delivery: user discovers entries in character diary UI (not pushed)
- [ ] Frequency: max 1 fantasy entry per 3 journal entries (keep it special)

---

## PHASE 6: Voice & Audio (~14h)

*Immersive audio experiences for intimate moments.*

### F4: Voice Intimacy Mode (Score: 27/30)
**What:** Breathy, slower TTS with paralinguistic tags during intimate scenes.
**File:** `backend/voice/intimacy_mode.py`
**TODO:**
- [ ] Detection: intimacy > 70 AND arousal > 3 → activate intimate voice
- [ ] TTS parameter overrides:
  ```
  speed:        0.85 (15% slower, measured delivery)
  pitch:        -1 semitone (deeper, warmer)
  energy:       -30% (softer, closer)
  exaggeration: 0.3-0.5 (Chatterbox: calm, not theatrical)
  ```
- [ ] Paralinguistic tag injection: LLM prompted to use [sigh], [gasp], [laugh]
- [ ] Gradual transition: ramp over 2-3 messages (not snap change)
- [ ] Per-character profiles: some whisper, some stay breathy, some get commanding
- [ ] Integration: modify TTS parameter resolution in server.py
- [ ] Intensity slider: subtle → moderate → expressive

### F33: Erotic Audio Narration
**What:** Character narrates intimate scenarios as personal audio stories using TTS.
**File:** `backend/voice/audio_stories.py`
**TODO:**
- [ ] Trigger: user requests "tell me a story" during intimate context, or dedicated UI button
- [ ] LLM generates 200-400 word intimate narrative in character's voice
- [ ] TTS renders with voice intimacy mode active
- [ ] Slower pacing than normal TTS: deliberate pauses between sentences
- [ ] Story types: memory retelling, fantasy narration, guided scenario
- [ ] Audio file saved to private gallery (F42)
- [ ] Bond gate: requires bond ≥ 50

### F36: Sexting Quick-Fire Mode
**What:** Short, rapid messages with fast pacing — feels like texting back and forth.
**File:** `backend/content/quickfire.py`
**TODO:**
- [ ] Session toggle: normal / quickfire
- [ ] Prompt modifier: "Keep responses SHORT (1-3 sentences max). Be spontaneous, use emoji."
- [ ] Max token override: cap at 80 tokens per response
- [ ] Response format: more *actions*, less narration, more emoji
- [ ] Disable TTS in quickfire mode (text-only, like real texting)
- [ ] UI treatment: messages appear faster, typing indicator quicker

### F46: Love Letter Generator
**What:** Character writes longer-form love letters — deeply personal prose.
**File:** `backend/emotional/love_letters.py`
**TODO:**
- [ ] Trigger: proactive system (monthly at bond ≥ 40) or user request
- [ ] LLM generates 300-500 word letter in character's unique voice
- [ ] References real relationship history (memories, milestones, shared moments)
- [ ] Special message type with handwriting-style UI treatment
- [ ] Bond-gated depth: stranger=friendly note, close friend=warm letter, soulmate=deeply intimate
- [ ] Saveable: user can bookmark love letters to a private collection

---

## PHASE 7: Visual & Image Generation (~30h)

*AI-generated visual content and UI atmosphere changes.*

### F29: Contextual Intimate Image Generation
**What:** Characters generate scene-aware intimate images via EasyDiffusion/ComfyUI.
**File:** `backend/image_gen/intimate_gen.py`
**TODO:**
- [ ] NSFW toggle: separate setting, requires age verification + content lock password
- [ ] Default: bond-gated (bond ≥ 80 for explicit, ≥ 50 for suggestive, any for SFW)
- [ ] Prompt builder: construct SD prompt from current scene context:
  ```python
  def build_intimate_prompt(char_name, scene_context, intimacy_level, clothing_state, mood):
      # Maps conversation state to SD prompt
      # Example: "anime girl, blushing, bedroom, nightgown, warm lighting, looking at viewer"
  ```
- [ ] Negative prompt: quality tags + content exclusions based on user boundaries
- [ ] Integration: extend existing `/api/image-gen/portrait` with `nsfw_level` parameter
- [ ] Chat trigger: character says "Want to see?" or user says "show me"
- [ ] LoRA support: character-specific LoRA for consistent face/style
- [ ] Storage: encrypted directory for NSFW images (separate from SFW portraits)
- [ ] Uses existing EasyDiffusion adapter at 10.0.0.202:9000

### F42: Intimate Photo Gallery
**What:** Private encrypted gallery of AI-generated intimate portraits.
**File:** `backend/image_gen/gallery.py`
**TODO:**
- [ ] `intimate_gallery` table: char_id, image_path, prompt_used, scene_context, created_at, is_favorite
- [ ] Gallery organized by: character, mood, scene, date
- [ ] Encryption: images stored in encrypted directory (age-verified access only)
- [ ] API: CRUD for `/api/characters/{id}/gallery`
- [ ] Frontend: masonry grid with lightbox, favorite/delete controls
- [ ] Content lock: gallery requires content lock password if enabled
- [ ] Auto-cleanup: configurable max gallery size per character

### F28: NSFW Expression Portraits
**What:** Bond-gated intimate expression portrait sets per character.
**File:** Extend existing expression portrait system
**TODO:**
- [ ] New intimate emotions: `aroused`, `vulnerable`, `afterglow`, `desperate`, `teasing`
- [ ] Bond gate: intimate portraits only visible at bond ≥ 50
- [ ] Generation: use existing `/api/image-gen/expressions/{char_id}` with NSFW checkpoint
- [ ] Per-character prompt tuning: character-specific intimate expression descriptions
- [ ] Storage: separate from SFW portraits, requires NSFW toggle enabled

### F19: Blush & Arousal Visuals
**What:** VRM/Live2D blend shapes for blush intensity, half-lidded eyes, lip bite.
**File:** `frontends/shared/viewer/viewer.html` + `backend/emotion/arousal_visuals.py`
**TODO:**
- [ ] VRM blend shape mapping: arousal level → blend shape weights
  ```
  arousal 0-3:  normal expression
  arousal 4-5:  light blush (cheek tint 0.3), eyes slightly wider
  arousal 6-7:  deeper blush (0.6), half-lidded eyes, subtle lip bite
  arousal 8-9:  full blush (0.9), heavily lidded, parted lips
  arousal 10:   intense expression, closed eyes, full immersion
  ```
- [ ] Live2D: parameter mapping for blush/eye/mouth parameters
- [ ] Smooth transitions: lerp between expression states over 500ms
- [ ] WebSocket: server sends arousal visual updates to viewer

### F23: Ambient Scene Atmosphere
**What:** UI theme shifts during intimate scenes — warm colors, dimmed sidebar, soft particles.
**File:** Frontend: `frontends/sakura/src/hooks/useIntimateAtmosphere.ts`
**TODO:**
- [ ] Detect intimate scene from chat state (intimacy > 60 + arousal > 3)
- [ ] Theme overrides:
  ```
  background:  Darken 20%, warm color shift (+10 red, +5 warmth)
  sidebar:     Fade to 60% opacity
  chat area:   Subtle warm glow border
  particles:   Soft firefly/sparkle effect (reuse existing particle system)
  font:        Slightly reduce size, increase letter-spacing (intimate feel)
  ```
- [ ] Gradual transition: CSS transitions over 2-3 seconds
- [ ] Respect user preference: toggle in settings to disable
- [ ] Restore: atmosphere fades back to normal when intimacy drops below 40

### F27: Whisper Mode
**What:** Full UI + voice + style shift for intimate whispered communication.
**File:** Frontend hook + backend prompt modifier
**TODO:**
- [ ] UI: messages in slightly smaller, italic font. Chat background darkens.
- [ ] Voice: TTS shifts to whisper parameters (very low energy, close-mic feel)
- [ ] LLM: prompt modifier for whispered, intimate vocabulary
- [ ] Trigger: manual toggle or auto-detect from scene context
- [ ] Character personality: some characters whisper naturally, others use it sparingly

---

## PHASE 8: Deep Personalization (~36h)

*The endgame — deeply personal, character-specific features.*

### F35: Scene Replay (Character's POV)
**What:** After intimate scenes, character narrates their perspective of what happened.
**File:** `backend/emotional/scene_replay.py`
**TODO:**
- [ ] Trigger: user requests "what were you thinking?" or automatic 1-session-later offer
- [ ] LLM generates 2nd-person POV narrative of the scene from character's perspective
- [ ] Includes: what they noticed about the user, what they felt, what surprised them
- [ ] Special message type with distinct UI treatment
- [ ] Feeds into intimate memory system (F2)

### F37: Fantasy Persona Roleplay
**What:** Character temporarily adopts a different role within a scene for novelty.
**File:** `backend/content/fantasy_personas.py`
**TODO:**
- [ ] Persona types: stranger_at_bar, authority_figure, mysterious_visitor, childhood_friend_reunion, rival_turned_lover
- [ ] Activation: user suggests or character proposes ("What if I pretended to be someone you just met?")
- [ ] Temporary prompt override: character maintains core personality but adds persona layer
- [ ] Safe return: "/end persona" or natural scene conclusion returns to normal
- [ ] Bond gate: requires bond ≥ 40 (trust needed for roleplay)
- [ ] Memory: persona scenes recorded as special memories

### F47: Shared Fantasy Builder
**What:** User and character collaboratively build a fantasy scenario over multiple sessions.
**File:** `backend/emotional/shared_fantasy.py`
**TODO:**
- [ ] `shared_fantasies` table: char_id, title, description_so_far, contributions (JSON array), status
- [ ] Contribution model: user adds an element, character adds an element, alternating
- [ ] LLM maintains narrative coherence across contributions
- [ ] Can be "played out" — the built fantasy becomes a scenario template
- [ ] Bond gate: bond ≥ 30 to start building
- [ ] API: CRUD + play endpoint

### F31: Jealousy & Possessiveness Dynamics
**What:** Opt-in emotional complexity. Character shows realistic jealousy at configurable intensity.
**File:** `backend/emotional/jealousy.py`
**TODO:**
- [ ] Opt-in toggle (OFF by default): `characters.jealousy_enabled`
- [ ] Intensity levels: subtle (hints) / moderate (pouts) / dramatic (confrontation)
- [ ] Triggers: user mentions other people, extended absence, evasive responses
- [ ] Character personality affects jealousy style:
  ```
  TSUNDERE:    "I don't care who you were with. *clearly cares*"
  CLINGY:      "You weren't talking to someone else, were you? Promise me."
  COOL:        "...Who's Sarah? *maintains composure but voice is tight*"
  DRAMATIC:    "*throws pillow* Fine! Go hang out with whoever that is!"
  ```
- [ ] Reconciliation: jealousy episodes → reconciliation → deeper bond (XP bonus)
- [ ] Safety: never genuinely toxic. Character always capable of reasonable discussion.

### F41: Body Appreciation Language
**What:** Specialized vocabulary for physical descriptions with genuine admiration.
**File:** `backend/content/body_language.py`
**TODO:**
- [ ] Vocabulary sets per intimacy level and content ceiling
- [ ] Character-specific appreciation style (poetic vs direct vs shy vs bold)
- [ ] Prompt injection: vocabulary guide for physical descriptions
- [ ] Ties into preference discovery: character emphasizes what user responds to

### F44: Erogenous Personality Map
**What:** Per-character map of what physical interactions they respond most strongly to.
**File:** `backend/content/erogenous_map.py`
**TODO:**
- [ ] Per-character response maps: neck (high), hands (medium), hair (high), etc.
- [ ] Discovered through interaction: character shows stronger reactions to certain touches
- [ ] LLM uses map to generate appropriate physical responses
- [ ] User discovers the map naturally through play (not shown explicitly)
- [ ] Creates personalized intimate experience per character

### F22: Kink Discovery Quiz
**What:** Private preference profiling via natural character conversation.
**File:** Extend `backend/emotional/quiz.py` with intimate question set
**TODO:**
- [ ] Separate question bank (15-20 questions) for intimate preferences
- [ ] Bond gate: quiz only available at bond ≥ 50
- [ ] Questions asked naturally by character in conversation (not a form)
- [ ] Results feed into F7 Preference Discovery Engine
- [ ] All data encrypted, local-only, deletable
- [ ] Never explicitly labeled "kink quiz" — just natural conversation

---

## PHASE 9: Polish & Extras (~16h)

### F24: Clothing Interaction System
**TODO:** Enhanced outfit changes with rich character descriptions. Extend PhysicalState regex.

### F25: Touch Language Protocol
**TODO:** Structured physical interaction format with body-region awareness and reaction generation.

### F26: Intimate Scene Scoring
**TODO:** Post-scene quality rating (hidden) for preference learning. Was it rushed? Tender? Intense?

### F20: Scene Bookmarks
**TODO:** Private bookmark gallery of favorite intimate moments. `messages.bookmarked` column.

### F48: Romantic Playlist Suggestions
**TODO:** Character suggests mood music with track names. Low-effort, high-charm feature.

---

## Verification & Testing Strategy

After each phase:
1. `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — must pass
2. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — must be clean
3. Each feature gets 10-20 tests (targeting 500+ new tests across all phases)
4. Browser smoke test after Phase 3 and Phase 7 (visible UI changes)

**Content testing:**
- Verify content gating at each level (general should never see explicit)
- Verify bond gating (stranger can't access mature features)
- Verify incognito mode doesn't record intimate memories
- Verify safe word works at every phase

**Integration testing:**
- Scene flow: casual → flirty → intimate → aftercare (full lifecycle)
- Memory continuity: intimate memory created → recalled in future session
- Voice mode: TTS parameters change during intimate scenes
- Image gen: NSFW toggle respected, bond gate enforced

## Dependency Map

```
PHASE 1 (Safety + Foundation)
   │
   ├── PHASE 2 (State Machines) ──── PHASE 3 (Scene Architecture)
   │        │                              │
   │        └──── PHASE 4 (Memory) ────────┘
   │                    │
   │        PHASE 5 (Emotional Continuity)
   │                    │
   │        PHASE 6 (Voice & Audio)
   │
   ├── PHASE 7 (Visual & Image Gen) ← can start after Phase 1
   │
   └── PHASE 8 (Deep Personalization) ← needs Phases 2-5
              │
              └── PHASE 9 (Polish)
```

**Parallelizable:** Phase 7 can run alongside Phases 2-6 (independent visual work).
**Critical path:** Phase 1 → 2 → 3 → 4 → 5 (each builds on previous).
**Estimated sessions:** 8-12 coding sessions, 2-3 phases per session.

---

## Enhanced Version (v2)

**The deep enhancement pass has been completed.** See the enhanced spec at:

`docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` (3,335 lines)

The enhanced version adds:
- Cohesive design philosophy and 7 UX principles
- Intimacy lifecycle framework mapping all 48 features
- Character personality matrix for all 13 characters
- Friction analysis framework (discovery/activation/recovery)
- Visual design language for intimate UI states
- Per-feature: user journeys, ASCII UI mockups, pre-written LLM prompts, cross-feature integration maps
- Pre-written content: safe word responses, consent dialogue, pet name proposals, sensory profiles, scenario templates, aftercare variants
- 2-3x more TODOs per feature
- Cross-feature dependency web

**This file (v1) is preserved as the original plan. The enhanced version is the implementation reference.**
