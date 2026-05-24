# Kokoro Engine Starter Pack — Reference

**Date received:** 2026-05-24
**Source:** User-provided `kokoro_engine_starter_pack.zip` (moved to `~/.Trash/` after extraction)
**Status:** Phase 1 partially implemented (backend + frontend types/debug panel; chat-endpoint integration deferred to next session)
**Plan:** `~/.claude/plans/done-i-made-you-wondrous-conway.md`

## Why this file exists

The user dropped a 4-file starter pack at the repo root proposing a "Kokoro Engine" middleware layer between user message and LLM.  The pack's headline design overlaps heavily with existing waifu-rt3d systems (MoodEngine, bond progression, tiered memory, AIE, voice modulator, AnimationDirector), so we adopted only the genuinely new ideas:

1. **Structured per-turn JSON response** that fuses spoken reply with embodiment metadata (face/gesture/gaze/voice) and state deltas, instead of inferring them downstream.
2. **Multi-tier dial vector** beyond mood+affinity, organized by timescale (fast/slow/identity/scene) so the LLM is only asked to nudge dials whose movement makes sense per-turn.
3. **Tier F NSFW dials** that auto-engage when the existing NSFW master + M6 bond gate (bond >= 20) both pass — never inventing new content gates, always riding on top of the existing ones.

The pack is preserved verbatim below for posterity; the original zip is in `~/.Trash/`.

---

## File 1 — `Kokoro_Engine_Foolproof_Guide.md`

A 10-step walkthrough proposing a TypeScript-first implementation centered on `src/kokoro/` with five core files (types, defaults, scoreMemory, buildKokoroPrompt, applyStateDelta) and a "do not build yet" list (IIT, shadow modules, autonomous loops).  The full content was extracted to `/tmp/kokoro_pack/kokoro_engine_starter_pack/Kokoro_Engine_Foolproof_Guide.md` during this session; key excerpts captured in the plan file.

## File 2 — `COPY_PASTE_PROMPT_Kokoro_Engine_v1.md`

A self-contained agent prompt listing the required mind state, needs, relationship model, memory scoring, prompt builder, structured JSON output, avatar mapping, and debug panel.  Pack-specified JSON shape:

```json
{
  "reply": "...",
  "innerThought": "...",
  "emotion": "neutral | focused_warm | happy | soft | concerned | playful | shy | excited | sleepy | frustrated | proud",
  "facialExpression": "neutral | soft_smile | smile | concerned | surprised | smug | blush | sleepy | focused",
  "gesture": "idle | wave | thinking | point | hands_clasped | heart | small_nod | tilt_head",
  "gaze": "user | away | thinking | object | camera",
  "voiceStyle": "calm | warm | bright | sleepy | serious | teasing",
  "memoryWrite": { "shouldSave": false, "summary": "", "importance": 0.0, "emotionalSalience": 0.0 },
  "stateDelta": { "mood": 0.0, "arousal": 0.0, ... }
}
```

## File 3 — `Kokoro_Engine_Checklist.md`

Validation list — both "must have" implementation items and a manual 5-test script:

1. Character remembers user preference (e.g., "I like Dracula themes") after one unrelated message.
2. Character shifts tone when user is frustrated.
3. Character uses `facialExpression` field.
4. Character uses `gesture` field.
5. Mind state changes after response.
6. Memory is only saved when important.
7. Debug panel shows last state delta.

## File 4 — `README.txt`

Recommends starting in AnimeGirly first, then porting to waifu-rt3d.  We diverged: the user asked us to integrate directly into waifu-rt3d.  Reason — existing systems (bond/memory/AIE/MoodEngine) are already more mature here, so the integration is additive rather than greenfield.

---

## What we built (Phase 1)

### Backend
- **Migrations**: `migrate_to_v83` (character_mind_state + character_traits + thread_state), `migrate_to_v84` (Tier F NSFW columns).  Schema is now v84.
- **`backend/kokoro/`**: `mind_state.py`, `prompt_fragment.py`, `response_parser.py`, `service.py`, `__init__.py`.
- **`backend/llm/context_assembler.py`**: optional `kokoro_fragment` parameter (no-op when omitted).
- **`backend/config/app.json`**: `kokoro_enabled: false` flag (default off).
- **Tests**: 42 new pytest cases in `backend/tests/test_kokoro_{mind_state,parser,service}.py`.  All pass.

### Frontend
- **`frontends/sakura/src/lib/kokoro.ts`**: TS types mirroring the backend payload.
- **`frontends/sakura/src/components/KokoroDebugPanel.tsx`**: dev HUD showing Tier A/B/(C in plan)/F dials, parse status, embodiment fields, memory write.

### Deferred to next session
- `server.py` chat-endpoint integration (route through `kokoro.service.prepare_turn` → `assemble_context(..., kokoro_fragment=...)` → `kokoro.service.finalize_turn`).
- `frontends/sakura/src/lib/api.ts` mirror of the chat response.
- `viewerStore.ts` embodiment-event handler.
- Hooking the panel into the settings drawer behind `?debug=kokoro`.
- Running the manual 5-test script in Chrome.

### Expansion beyond the pack

The pack proposes 11 flat dials.  Our implementation organizes them by timescale to prevent the LLM from being asked to nudge slow-moving traits every turn:

- **Tier A — fast** (per-turn): mood, arousal, energy, curiosity, playfulness, confidence, vulnerability, agency, coherence, focus, tenderness, humor_charge, awe
- **Tier B — slow drift** (per-hour): loneliness, restedness, boredom_with_topic, anticipation, nostalgia
- **Tier C — identity traits** (almost constant): openness, warmth, dominance, mischief, melancholy_tendency
- **Tier D — per-relationship** (reuses existing bond tables, not duplicated)
- **Tier E — per-thread** (scene state, resets on new conversation): tension, intimacy_level, comedic_energy
- **Tier F — NSFW** (auto-gated by `kokoro_enabled AND nsfw AND bond >= 20`): desire_for_user, inhibition, boldness, modesty, tension_buildup, afterglow, consent_check_pending, kink_alignment_vector

Tier F never bypasses existing M6 bond-affinity content ceilings — the dials modulate *within* the ceiling.
