# Session Handoff — 2026-10-04 (cloud session → local Mac session)

## Branch: `claude/busy-planck-rg90lh` · PR #5 (draft) · ALL PUSHED
## Test Status (cloud, CI-style Python 3.12 venv): 3233 backend pytest passed (+7 skipped) · 514 sakura vitest · tsc: clean (fixed 2026-10-07 by adding @types/node)

Push gate: no active blocking markers in this file or `CURRENT_STATUS.md` at the time of writing.

## Addendum 2026-10-08 — UI session on the same branch

**UI session (2026-10-08) — script-style chat, thinking card, reply animation. Same branch/PR #5; committed locally, NOT pushed since `be18607e` + the commits listed below.** Entry point for all docs: `docs/INDEX.md`. How it works: `docs/reference/chat-script-and-thinking.md`. Plan + decisions: `docs/plans/2026-10-08-script-style-chat-segments.md`. Every setting/HUD element: `docs/reference/settings-and-hud-inventory.md`.
- **Shipped:** reply hygiene (`[Memory]` label loop, Qwen3 system-message merge → no more empty 9B replies); `[a][n][t][m]` script segments with 3 selectable looks (default **storybook**); thinking card above the reply (reasoning separated via `ReasoningChunk` + SSE `thinking`; **schema v90** `messages.thinking`/`raw_output`); settings `chatStyle`, `thoughtsMode`, `replyDelivery` (Settings → General). Dev server defaults to the dark **Blurple** theme.
- **Schema:** now **v90**. The Kokoro Phase-3 Emotional-RAG migration that was planned as v90 must be written as **v91**.
- **Pending (Chris decides):** pick the thinking-card polish (Quiet glass / Editorial / Pearl); composer live-colouring of `[a]…[/a]` (phase 4); prompt telling the model to use the tags (phase 5); opt-in local training export of thought+reply pairs; typewriter reply animation.
- **Known issues:** incognito never sends the user's message to the model; leaked `[Memory]` can flash in the live bubble before the stored reply replaces it; a 9B thinking model can reason for minutes; two MemoryBrowser vitest tests flake only under full-suite load (task chip raised).
- **Tests:** 3,264 backend pytest, 537 vitest, tsc clean. Rules honoured: no single-letter shortcuts, Lucide icons only, theme variables only.

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
4. **Phase 3**: Kokoro v2 Emotional RAG (schema v91 — v90 taken 2026-10-08) — only after Phase 2.

## Why it matters (one paragraph)
`docs/research/2026-05-29-kokoro-parse-ok-validation.md` measured Kokoro parse_ok at 0% on real models, and the user's real model (qwen3.5-9b, no longer installed) hits a reasoning-model bypass (`backend/server.py` ~6034) so the JSON contract is never injected. Mood dials, gestures, memory writes and the Stage-3 emotion→gesture hook are therefore mostly dormant until this is fixed.

## Decisions (answered by Chris, 2026-10-07)
1. Benchmark character: **Rin** (default; `--persona PATH` still available). ✅
2. `@types/node`: **added** (`^20`, matches CI) in commit `8bd4ba7`; tsc exit 0, vitest 514 passed, `npm ci` verified. ✅ It touched `package.json` → run `/verify-servers` on the Mac before relying on dev servers.
3. Canonical Python: **Chris is not sure.** Don't edit CLAUDE.md yet — first run `.venv/bin/python --version` on the Mac, report what it finds (CLAUDE.md claims Homebrew 3.14; CI/cloud used 3.12), run the backend tests on it, THEN decide together.

## Known Issues
- ~~6 `tsc` errors from missing `@types/node`~~ — fixed 2026-10-07 (`8bd4ba7`).
- `backend/llm/adapters/lmstudio.py` (`LMStudioAdapter`) is dead code: never returned by `registry.get_client`, and references undefined `retries`/`backoff`. Left untouched on purpose.
- README "Database Schema" table list for v72–v89 is unreviewed (numerals were bumped, tables not).

## Files Modified (this session, all committed + pushed)
`tools/bench/*` (new), `backend/kokoro/response_schema.py` (new), `backend/kokoro/response_parser.py`, `backend/tests/{test_bench_harness,test_kokoro_response_schema,test_kokoro_parser}.py`, `run.sh` (`bench` subcommand), `.gitignore` (bench `.jsonl`), `CLAUDE.md` + `README.md` + `.claude/rules/preflight-migrations.md` (numerals), `CURRENT_STATUS.md`, `docs/plans/2026-10-04-kokoro-model-bench-and-fix.md`.

## Context for the next session
- Read order: `CURRENT_STATUS.md` (top block) → `docs/plans/RESUME_PROMPT.md` (top section) → `docs/plans/2026-10-04-kokoro-model-bench-and-fix.md` → `tools/bench/README.md`.
- PR #5 is a draft; keep it draft until real-model results are reviewed. Bot reviews on it are noisy — act on failing CI and genuine bugs, not repeats. The cloud session has **stopped watching** the PR (2026-10-07), so only the local session reacts to it now.
- Chris is not deeply technical with LLM tooling: explain GUI steps plainly, no jargon walls.
- Local box DART service from the June sprint is still torn down (see the 2026-06-22 handoff entries in `CURRENT_STATUS.md`); not needed for this work.
