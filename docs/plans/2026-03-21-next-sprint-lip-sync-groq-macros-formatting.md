# Next Sprint: Lip Sync + Breathing/Foley + Groq ASR + Macros + Output Formatting

**Date:** 2026-03-21
**Session type:** Fresh session after handoff
**Sprint items:** 4 tasks (lip sync+foley bundled, Groq ASR, macros, regex formatting)
**Estimated AI-assisted time:** ~1.5h total
**Handoff file:** `docs/plans/RESUME_PROMPT.md` (write before exiting this session)

## Context

Phase 12-P4 (anime shaders) is done. Sound design is split into two separate tasks:
- **This sprint:** Lip sync + breathing/foley (character sounds driven by TTS + ambient character audio)
- **Separate task:** Soundscape audio tracks (café/rain/lo-fi loops for SoundscapePlayer) — has its own plan at `.claude/plans/2026-03-21-soundscape-audio-tracks.md`

## Task 1: Lip Sync + Breathing/Foley (~40min)

### 1a: Lip Sync Controller
**What:** TTS audio → phoneme timeline → VRM mouth blend shapes (visemes). Character mouth moves when TTS speaks.

**Existing infrastructure:**
- `AudioLipSync` class stub exists in `viewer.html` (initialized at VRM load, line ~5229)
- TTS audio plays via `playAudio` postMessage → `lipSync.playAudioWithLipSync(audioUrl)`
- VRM expression manager handles blend shapes (`expressionManager.setValue()`)

**Implementation:**
- Enhance `AudioLipSync` in viewer.html with Web Audio API analysis:
  - `AudioContext` + `AnalyserNode` on audio playback
  - Per-frame: sample frequency bins → map amplitude bands to viseme weights
  - Visemes: `aa` (jaw open), `oh` (round), `ee` (spread), `sil` (closed)
  - Smoothstep transitions (~50ms)
- No new files needed — extend existing class

### 1b: Breathing + Foley Sounds
**What:** Subtle ambient character sounds — breathing cycle, clothing rustle on animation, small vocalizations.

**Implementation:**
- Add breathing audio loop: soft inhale/exhale, 2.3s cycle, -25dB
  - Modulated by emotion (faster when excited, deeper when tired)
- Clothing rustle: triggered by animation events (gesture/movement), -20dB
- Small vocalizations: "hmm" on thinking, "mm-hmm" on agreement
- All controlled by a `CharacterAudioController` in viewer.html
- Volume master control in EffectsPanel
- Audio assets: use Web Audio API oscillator/noise for breathing (no external files needed for MVP), or generate short clips

**Key files:**
- `frontends/shared/viewer/viewer.html` — AudioLipSync class, new CharacterAudioController
- `frontends/sakura/src/components/EffectsPanel.tsx` — volume control

## Task 2: Groq ASR Integration (~15min)

**What:** Add Groq's free Whisper API as a speech-to-text provider.

**Implementation:**
- Create `backend/asr/adapters/groq_asr.py` — POST to `api.groq.com/openai/v1/audio/transcriptions`
- Register in `backend/asr/registry.py`
- Add "Groq (Free)" to ASR dropdown in SettingsView.tsx
- Character name as Whisper `prompt` param for accuracy

**Key files:**
- `backend/asr/adapters/` — existing adapter pattern
- `backend/asr/registry.py`
- `frontends/sakura/src/views/SettingsView.tsx`

## Task 3: Prompt Template Macros (~15min)

**What:** `{{time}}`, `{{date}}`, `{{mood}}`, `{{char_name}}`, `{{trust_level}}` in system prompts.

**Implementation:**
- Create `backend/llm/macro_expander.py` — regex `{{key}}` replacement
- Call in server.py `_build_prompt_sections()` before sending to LLM
- Macros: char_name, user_name, time, date, day, mood, trust_level, message_count, relationship_days

**Key files:**
- `backend/server.py` — call site
- `backend/llm/macro_expander.py` — new

## Task 4: Regex Output Formatting Rules (~25min)

**What:** User-defined regex rules to clean/transform LLM output. Per-character.

**Implementation:**
- Create `backend/llm/output_formatter.py`
- Schema bump: `output_format_rules` table
- CRUD API endpoints
- Frontend: `FormatRulesEditor.tsx`
- Call after `_parse_emotion_gesture()` in server.py

**Key files:**
- `backend/llm/output_formatter.py` — new
- `backend/preflight.py` — migration
- `backend/server.py` — call site
- `frontends/sakura/src/components/FormatRulesEditor.tsx` — new

## Agent Decomposition

| Agent | Task | Files |
|-------|------|-------|
| senior-dev A | Task 2 (Groq ASR) | backend/asr/, SettingsView.tsx |
| senior-dev B | Task 3 (Macros) | backend/llm/macro_expander.py, server.py |
| senior-dev C | Task 4 (Output formatter) | backend/llm/output_formatter.py, preflight.py |
| Self | Task 1 (Lip sync + foley) | viewer.html, EffectsPanel.tsx |
| Self | Integration | server.py wiring for tasks 3+4 |

## Pre-Sprint Setup (first thing in next session)

Write the soundscape plan file to `.claude/plans/2026-03-21-soundscape-audio-tracks.md`:
- Source 8 CC0 ambient loops (café, rain, lo-fi, forest, city, library, ocean, night)
- Wire into existing SoundscapePlayer.tsx (5 of 8 tracks have `src: null`)
- Ensure seamless looping + volume slider + crossfade
- Medium priority — do after this sprint's 4 tasks, or in a future session
- This is T1-6 from the feature menu spec

## Verification

Per task: `.venv/bin/python -m pytest backend/tests/ -q --tb=line` + `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
Commit per task. Run `/checkpoint` after all 4 complete.
