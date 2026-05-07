# Session Handoff — 2026-05-06

## Branch: master
## Test Status: 2843 passed | TSC: clean

## Completed This Session

### AIE Phase C — Phase 1: LoRA Fine-Tuning Pipeline (Strand A)
- `backend/adaptive/finetune/corpus_builder.py` — ShareGPT JSONL corpus builder with quality filtering
- `backend/adaptive/finetune/trainer.py` — Unsloth/SFTTrainer wrapper, graceful degradation when ML deps absent
- `backend/adaptive/finetune/eval_harness.py` — heuristic LoRA eval with character-specific prompts
- `backend/llm/adapters/peft_local.py` — PEFT LoRA adapter implementing LLMAdapter interface
- `scripts/train_character_lora.py` — CLI orchestrator: corpus → train → eval → DB write
- `backend/preflight.py` — `migrate_to_v77()` adds `character_loras` table (schema v77)
- `backend/server.py` — 3 endpoints: `GET /api/training/status/{char_id}`, `DELETE /api/training/loras/{char_id}`, `POST /api/training/retrain/{char_id}`
- `backend/tests/test_finetune.py` — 28 new tests (2762 → 2790 passing)
- **CRITICAL FIX:** real messages table uses `char_id` (not `character_id`) and `text` (not `content`) — fixed in corpus_builder, server.py, and test fixtures

### AIE Phase C — Phase 2: Basic DSPy (Strand B)
- `backend/adaptive/dspy_modules/__init__.py` — exports public API
- `backend/adaptive/dspy_modules/context_classifier_dspy.py` — DSPy Signature + ChainOfThought module with graceful fallback
- `backend/adaptive/dspy_modules/optimizer_runner.py` — BootstrapFewShot optimizer runner, DB record writer, `maybe_run_optimizer()` safe wrapper
- `backend/preflight.py` — `migrate_to_v78()` adds `dspy_compiled_programs` table (schema v78)
- `backend/adaptive/context_classifier.py` — `configure_dspy_classifier(enabled, compiled_json_path)` feature flag + `_classify_rule_based()` private helper to prevent infinite recursion when DSPy fallback calls back into classifier
- `backend/tests/test_dspy_modules.py` — 53 new tests (2790 → 2843 passing)

## Work In Progress
- None. All three AIE Phase C MVP phases complete and committed.

## Known Issues / Bugs
- None introduced this session. Pre-existing: `character_relationships` duplicate rows (P1 filed in `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md`), BondPill XP overshoot display (P3 filed in `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`).

## Files Modified
```
backend/adaptive/context_classifier.py          +205 lines
backend/adaptive/dspy_modules/__init__.py        NEW
backend/adaptive/dspy_modules/context_classifier_dspy.py  NEW
backend/adaptive/dspy_modules/optimizer_runner.py         NEW
backend/adaptive/finetune/__init__.py            NEW
backend/adaptive/finetune/corpus_builder.py      NEW
backend/adaptive/finetune/eval_harness.py        NEW
backend/adaptive/finetune/trainer.py             NEW
backend/llm/adapters/peft_local.py               NEW
backend/preflight.py                             +185 lines (v77 + v78 migrations)
backend/server.py                                +165 lines (3 training endpoints)
backend/tests/test_dspy_modules.py               NEW (53 tests)
backend/tests/test_finetune.py                   NEW (28 tests)
scripts/train_character_lora.py                  NEW
docs/plans/2026-05-06-aie-phase-c-mvp-execution.md  status lines appended
```

## Next Session Priorities

1. **Authorize push** — 27+ local commits ahead of `origin/master`. User authorization required before push.
2. **Memory Browser browser QA** — Ctrl+M overlay, all 4 tabs against real backend, file bugs as `docs/bugs/2026-05-*-memory-browser-*.md`. ~1-2h.
3. **Visual Content in Chat Phase 2** — lightbox, `imagePrompt` field, `regenerateImage`. Plan: `docs/plans/2026-05-06-visual-content-mvp-execution.md`.
4. **Apply drafted character styles** — run draft script with LLM, review JSON, write apply script.
5. **AIE Phase C decision gate** — train Sakura LoRA on Windows RTX 5080, run 30 manual eval prompts.

## Context for Next Session

- **Schema:** v78. Migrations v77 (character_loras) + v78 (dspy_compiled_programs) in `backend/preflight.py`.
- **DSPy feature flag:** Off by default. Enable via `configure_dspy_classifier(True, path)` in server lifespan after compiling. NOT yet wired into server startup — needs a compiled JSON first.
- **LoRA training:** Requires Windows + Unsloth. Mac raises `ImportError` gracefully. CLI: `python scripts/train_character_lora.py --char-name Sakura --db-path backend/storage/app.db --output-dir /path/to/loras`.
- **AIE Phase C plan:** `docs/plans/2026-05-06-aie-phase-c-mvp-execution.md` — all 3 phases (0/1/2) marked DONE.
- **Recursion guard:** `context_classifier_dspy.py` fallback imports `_classify_rule_based` (private), NOT `classify_context` (public) — prevents infinite recursion when flag is enabled and DSPy is absent.
