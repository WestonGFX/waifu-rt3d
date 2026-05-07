# Session Handoff — 2026-05-06 (Session 35)

## Branch: master · 24 ahead of origin/master
## Test Status: 2762 backend passed, 0 failed | TSC: clean | Frontend: 276/276 passed

## Completed This Session

### AIE Phase C MVP — Phase 0: Feedback Subsystem (COMPLETE — commit `6af30cc`)

**Schema v76 migration:**
- `message_feedback` table (message_id PK FK→messages, explicit_signal -1/+1/null, implicit_score, final_score, computed_at, signal_version)
- `aie_signal_weights` table (signal_name PK, weight, updated_at) + 6 seeded defaults (regenerate: -0.5, reply_length: +0.1, voice_toggle: +0.15, session_continuation: +0.1, abrupt_close: -0.05, llm_judge: +0.2)
- `privacy_settings` gains `explicit_signals_enabled INTEGER DEFAULT 1` + `implicit_signals_enabled INTEGER DEFAULT 1` columns

**Backend feedback module (`backend/adaptive/feedback/`):**
- `signal_collector.py` — collect implicit signals at session boundary (regenerate fraction, reply-length delta, session continuation, abrupt close). Read-only DB access, fail-soft.
- `scorer.py` — weighted-sum math: `final = alpha_explicit * s_explicit + alpha_implicit * s_implicit` (alpha_explicit=0.7 when present, else 0; alpha_implicit=0.3, normalises to 1.0 when no explicit click)
- `__init__.py` — exports `collect_implicit_signals`, `score_message`, `record_explicit_signal`

**API endpoints (server.py):**
- `POST /api/feedback/explicit/{message_id}` — record 👍/👎; body `{"signal": 1|-1|null}`. Pydantic `Literal[-1, 1] | None` validates, returns 422 on invalid signal.
- `GET /api/feedback/preferences` — read `explicit_signals_enabled`, `implicit_signals_enabled` from privacy_settings
- `PATCH /api/feedback/preferences` — update same flags

**Frontend:**
- `FeedbackButtons.tsx` — hover-only 👍/👎 buttons. 30% opacity until hover (via parent group), full when latched. Click latches (aria-pressed), second click clears. Optimistic update + rollback on network error.
- `DialogueBubble.tsx` — new `feedbackEnabled` prop. Slots `<FeedbackButtons messageId={message.serverMessageId}>` under assistant bubbles, gated by prop + message.role + serverMessageId presence.
- `ChatThread.tsx` — fetches `api.getFeedbackPreferences()` on mount, stores in `feedbackEnabled` state, passes down to each DialogueBubble.
- `SettingsView.tsx` (Safety tab) — "Feedback Signals" section with two toggles (show buttons / allow implicit), explainer paragraph. Calls `api.setFeedbackPreferences()` on toggle with error rollback.
- `api.ts` — `recordFeedback`, `getFeedbackPreferences`, `setFeedbackPreferences` typed wrappers
- `types.ts` — `FeedbackPreferences`, `MessageFeedback` interfaces

**Tests:**
- `backend/tests/test_feedback.py` — 37 new tests covering scorer math, signal weights fallback, all 3 API endpoints (2762 backend total)
- `frontends/sakura/src/test/FeedbackButtons.test.tsx` — 20 new tests (renders, click states, toggle/clear, onSignalChange, error rollback, pending guard) (276 frontend total)
- Fixed 2 pre-existing `MemoryBrowser.test.tsx` failures: `listMemories` 4th-arg assertion + tier-pill duplicate text

### Plan filed
- `docs/plans/2026-05-06-aie-phase-c-mvp-execution.md` — executable plan for all 3 phases (Phase 0 ✓, Phase 1 Strand A, Phase 2 basic DSPy)

## Work In Progress
None — all work committed.

## Known Issues / Bugs
- `backend/storage/images/glitch_portrait.png` and `seraph_pixel_portrait.png` deleted (Glitch moved to `backend/storage/avatars/Glitch.png`) — git shows D, no code refs
- `app.db` modified (DB is at v76 now; binary diff expected, do NOT commit)
- Untracked NSFW avatar assets in `backend/storage/avatars/` — intentionally not committed

## Files Modified (this session's commits)
```
6af30cc: feat(aie-phase-c-p0) — 15 files, +2373/-14
  backend/adaptive/feedback/__init__.py (NEW)
  backend/adaptive/feedback/scorer.py (NEW)
  backend/adaptive/feedback/signal_collector.py (NEW)
  backend/preflight.py (migrate_to_v76 + ensure_db update)
  backend/server.py (3 endpoints + Literal import)
  backend/tests/test_feedback.py (NEW — 37 tests)
  docs/plans/2026-05-06-aie-phase-c-mvp-execution.md (NEW)
  frontends/sakura/src/components/DialogueBubble.tsx
  frontends/sakura/src/components/FeedbackButtons.tsx (NEW)
  frontends/sakura/src/lib/api.ts
  frontends/sakura/src/lib/types.ts
  frontends/sakura/src/test/FeedbackButtons.test.tsx (NEW — 20 tests)
  frontends/sakura/src/test/MemoryBrowser.test.tsx (2 pre-existing fix)
  frontends/sakura/src/views/ChatThread.tsx
  frontends/sakura/src/views/SettingsView.tsx

8b4822d: docs(aie-phase-c-p0) — plan status line update
```

## Next Session Priorities

1. **Phase 1 — Strand A: LoRA corpus builder + training script** (24-30h total)
   - Plan: `docs/plans/2026-05-06-aie-phase-c-mvp-execution.md` Section "Phase 1"
   - Files to create: `backend/adaptive/finetune/corpus_builder.py` (filter/dedup/format messages → JSONL), `scripts/train_character_lora.py` (Unsloth wrapper, RTX 5080 target)
   - Schema v77: `character_loras(char_id, base_model, adapter_path, trained_at, eval_score, is_active)`
   - Base model: Qwen 2.5 7B Instruct (locked decision from scoping doc)
   - MVP scope: Sakura only (char_id for Sakura)

2. **Phase 2 — Basic DSPy** (8-12h, can interleave with Phase 1)
   - `backend/adaptive/dspy_modules/context_classifier_dspy.py`
   - `backend/adaptive/dspy_modules/optimizer_runner.py`
   - Schema v78: `dspy_compiled_programs` table
   - Consumes `message_feedback.final_score` as optimizer signal

3. **Push gate** — 24 commits ahead of origin. Gate is CLEAR — no active OPEN BUG / UNFIXED / BLOCKER markers. Push when user authorizes.

## Context for Next Session
- Schema is v76 in code AND live DB (v76 migration applied this session)
- FeedbackButtons are wired but opacity-on-hover relies on parent `.group` class being on the message wrapper in ChatThread — verify visually before claiming UI is correct (no browser test run this session due to time)
- Phase 1 requires Unsloth + torch + peft installed on the training rig (Windows with RTX). The Mac serves inference. `requirements.txt` currently has no ML deps — they go in commented as per the scoping doc.
- The implicit signal collection (`signal_collector.py`) runs at session boundary — NOT yet hooked into the server. That integration (calling `collect_session_signals` when a session ends) is the next backend integration step before scorer data flows.
- DSPy version: re-check via Context7 before implementing (DSPy ships fast, optimizer landscape changes quarterly)
