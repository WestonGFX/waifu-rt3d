# Session Handoff — 2026-10-04 (cloud session → local Mac session)

## Branch: `claude/busy-planck-rg90lh` · PR #5 (draft) · ALL PUSHED
## Test Status (cloud, CI-style Python 3.12 venv): 3233 backend pytest passed (+7 skipped) · 514 sakura vitest · tsc: 6 known errors (see below)

Push gate: no active blocking markers in this file or `CURRENT_STATUS.md` at the time of writing.

## Why this handoff exists
The cloud session built everything that can be built without real models. The next step (benchmarking models) needs LM Studio / Ollama on Chris's Mac, which a cloud container cannot reach. Continue **locally**, on this branch.

## Completed This Session
- **Phase 0 — re-baseline.** Verified the suites after the 3.5-month pause. Fixed stale schema numerals (v89) in CLAUDE.md, README, migration rules, status header. Gotcha: run vitest/tsc from `frontends/sakura/`, never the repo root (root run reports a false "60 failed").
- **Phase 1 — `tools/bench` (code done, NOT yet run on real models).** Sweeps every installed chat model on LM Studio (`:1234/v1`) or Ollama (`:11434`) across four fixes for the "Kokoro parse_ok ≈ 0%" problem: S0 baseline, S1 server-forced `json_schema`, S2 prose reply + schema-forced annotation call, S3 `{` prefill. Real persona prompt (~3.9K tokens) + the app's real RP preset + real Kokoro contract. Resumable JSONL, fail-fast guard, Markdown report + reply sample sheet. Entry: `./run.sh bench`. Docs: `tools/bench/README.md`.
- `backend/kokoro/response_schema.py` — JSON schema generated from the parser's own enums (pure data, no behaviour change).
- **One production bug fix:** `parse_companion_response` raised on non-numeric / NaN / Infinity `memoryWrite` weights despite its "never raises" contract. Fixed with `_safe_float`, regression-tested.
- Plan: `docs/plans/2026-10-04-kokoro-model-bench-and-fix.md` (status log inside).

## Work In Progress / Next (in order)
1. **Run the benchmark on the Mac** (LM Studio first, then a shorter Ollama pass). Steps in `tools/bench/README.md`. LM Studio needs context length ≥ 8192 and Just-in-time model loading on.
2. Build the report (`./run.sh bench report <file>.jsonl`), commit ONLY the `.md` (raw `.jsonl` is gitignored — it holds roleplay transcripts).
3. Choose the winning model + fix together → **Phase 2**: wire it into the real chat path (`backend/server.py` stream/finalize ~6021-6048, `openai_compat.py` reasoning bypass, gate `finalizeKokoroTurn` in `chatStore.ts` ~140). Gate: live parse_ok ≥ 80% via `/api/kokoro/qa`.
4. **Phase 3**: Kokoro v2 Emotional RAG (schema v90) — only after Phase 2.

## Why it matters (one paragraph)
`docs/research/2026-05-29-kokoro-parse-ok-validation.md` measured Kokoro parse_ok at 0% on real models, and the user's real model (qwen3.5-9b, no longer installed) hits a reasoning-model bypass (`backend/server.py` ~6034) so the JSON contract is never injected. Mood dials, gestures, memory writes and the Stage-3 emotion→gesture hook are therefore mostly dormant until this is fixed.

## Decisions still owed by Chris
1. Which character to benchmark with (default Rin; `--persona PATH`).
2. Add `@types/node` as a sakura devDependency to restore a clean `tsc` gate? (touches `package.json`; suggest `/verify-servers` after.)
3. Canonical Python: 3.12 (CI) or 3.14 (CLAUDE.md says Homebrew 3.14 `.venv`)? The cloud baseline used 3.12; 3.14 is unverified.

## Known Issues
- 6 `tsc` errors: `node:fs` / `node:path` / `__dirname` unresolved in `src/test/viewer.{blinkController,retargetClip}.test.ts` (no `@types/node`). Pre-existing environment gap, not a regression.
- `backend/llm/adapters/lmstudio.py` (`LMStudioAdapter`) is dead code: never returned by `registry.get_client`, and references undefined `retries`/`backoff`. Left untouched on purpose.
- README "Database Schema" table list for v72–v89 is unreviewed (numerals were bumped, tables not).

## Files Modified (this session, all committed + pushed)
`tools/bench/*` (new), `backend/kokoro/response_schema.py` (new), `backend/kokoro/response_parser.py`, `backend/tests/{test_bench_harness,test_kokoro_response_schema,test_kokoro_parser}.py`, `run.sh` (`bench` subcommand), `.gitignore` (bench `.jsonl`), `CLAUDE.md` + `README.md` + `.claude/rules/preflight-migrations.md` (numerals), `CURRENT_STATUS.md`, `docs/plans/2026-10-04-kokoro-model-bench-and-fix.md`.

## Context for the next session
- Read order: `CURRENT_STATUS.md` (top block) → `docs/plans/RESUME_PROMPT.md` (top section) → `docs/plans/2026-10-04-kokoro-model-bench-and-fix.md` → `tools/bench/README.md`.
- PR #5 is a draft; keep it draft until real-model results are reviewed. Bot reviews on it are noisy — act on failing CI and genuine bugs, not repeats.
- Chris is not deeply technical with LLM tooling: explain GUI steps plainly, no jargon walls.
- Local box DART service from the June sprint is still torn down (see the 2026-06-22 handoff entries in `CURRENT_STATUS.md`); not needed for this work.
