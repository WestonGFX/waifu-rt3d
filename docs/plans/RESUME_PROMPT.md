# Resume: Waifu-RT3D — Post-12-P4 Session (Mar 21, 2026)

## WHO I AM

I'm Chris. Sole developer of Waifu-RT3D, a commercial AI companion platform with 3D anime avatars + local LLM integration. I run 3 flagship AI subscriptions (Anthropic Opus, OpenAI, Google) in parallel. AI-assisted implementation is ~12x faster than traditional estimates. Desktop-only app.

**3 dev machines:** Mac M2 Pro (32GB), Win RTX 5080 (16GB), Win RTX 3070 (8GB). M2 Pro is the GPU floor.

## WHAT HAPPENED LAST SESSION

Phase 12-P4 (Anime Shaders + Gradient Backgrounds + Emotion Particles) — completed in ~45min across 3 waves:

| Commit | What |
|--------|------|
| `4acb87f` | Plan hygiene rules + /checkpoint skill + session handoff rules |
| `57814bb` | Wave 1: Emotion color grading (11 presets), gradient bg shader plane, 4 new particle types |
| `db5584e` | Wave 2: Anime outline pass, emotion rim glow, god rays post-processing |
| `4e74b48` | Wave 3: Toon cel-shading via onBeforeCompile injection |
| `c22a8a6` | Checkpoint: status files updated, phase marked done |
| `3737978` | Estimate vs actual time tracking table |
| `8a90355` | Session handoff rules added to CLAUDE.md |

**New files created:** `OutlineShader.js`, `GodRaysShader.js`, `ToonShader.js`
**Modified:** `viewer.html` (+920 lines), `EffectsPanel.tsx` (+170 lines)
**10 new togglable effects** in EffectsPanel — all work via postMessage API

**Process improvements this session:**
- `/checkpoint` skill created — auto-updates CURRENT_STATUS.md + master plan
- Plan files now use `YYYY-MM-DD-description.md` naming
- Commit messages reference plan phases: `feat(12-P4): ...`
- Session handoff rules in CLAUDE.md
- Actual time tracking in CURRENT_STATUS.md

## WHAT TO DO NOW

**Sprint plan:** `.claude/plans/2026-03-21-next-sprint-lip-sync-groq-macros-formatting.md`

Execute these 4 tasks using `/go`:

1. **Lip Sync + Breathing/Foley** (~40min) — Enhance AudioLipSync in viewer.html with Web Audio API frequency analysis → viseme mapping. Add CharacterAudioController for breathing + foley.
2. **Groq ASR** (~15min) — New `backend/asr/adapters/groq_asr.py`, register provider, add to settings UI.
3. **Prompt Template Macros** (~15min) — New `backend/llm/macro_expander.py`, wire into `_build_prompt_sections()`.
4. **Regex Output Formatting** (~25min) — New `backend/llm/output_formatter.py`, schema bump, CRUD endpoints, FormatRulesEditor.tsx.

**After sprint:** Write soundscape plan file (`.claude/plans/2026-03-21-soundscape-audio-tracks.md` already exists with spec).

## DEFERRED ITEMS (do NOT implement unless asked)

- What's New Modal / Changelog — defer indefinitely
- Swipe for Alternatives — low priority
- Character Generator Wizard — low priority
- Floating Chat Mode — low priority
- Director Mode Browser Test — low priority
- Specialty Shaders hair/eyes — low priority
- Native OS Notifications — NEVER
- See full list: memory file `project_deferred_items.md`

## KEY RULES

- **Resume = implement immediately.** Use `/go` to execute the sprint plan.
- **Desktop-only app** — no mobile, no swipe gestures
- **Use `.venv/bin/python`** for ALL Python commands
- **Commit after each task** with phase reference: `feat(12-P5): lip sync controller`
- **Run `/checkpoint`** after completing the sprint
- **Track actual time** — add to the estimate vs actual table in CURRENT_STATUS.md
- **NEVER add "Co-Authored-By: Claude"** to commits

## ARCHITECTURE

| Component | Stack | Key Files |
|-----------|-------|-----------|
| Backend | FastAPI, SQLite v56, Python 3.14 | `backend/server.py` (~13K lines) |
| Frontend | React 19, Zustand, Vite | `frontends/sakura/src/` |
| 3D Viewer | Three.js, VRM (iframe) | `frontends/shared/viewer/viewer.html` (~6.7K lines) |
| TTS | Kokoro 82M + VoiceModulator | `backend/tts/voice_modulator.py` |
| Voice | Full-duplex WebSocket | `backend/voice/duplex.py` |
| Tests | 525 pytest, tsc clean | `backend/tests/`, `tsconfig.app.json` |

**13 characters, 18 themes, schema v56, 525 tests.**
