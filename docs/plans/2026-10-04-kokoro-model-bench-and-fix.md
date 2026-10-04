# Kokoro: benchmark models, fix structured output, then Emotional RAG

**Created:** 2026-10-04 (post-pause restart) · **Branch:** `claude/busy-planck-rg90lh` · **Decision owner:** Chris
**Why:** `docs/research/2026-05-29-kokoro-parse-ok-validation.md` measured Kokoro `parse_ok` at **0%** on a 1B and a 21B model, and the user's real model (`qwen3.5-9b`) hits the reasoning-model bypass (`backend/server.py` ~6034, `openai_compat._is_reasoning_model`) so the JSON contract is never injected. Mood dials, gestures, memory writes — and the Stage-3 Phase-5.1 emotion→gesture hook — are therefore mostly dormant on a real setup. Nothing since May addressed it.

**Chosen order (Chris, 2026-10-04):** Re-baseline → Fix Kokoro → Emotional RAG (Kokoro v2 Phase 2). Motion work stays paused. Checkpoint after each phase. Local models only; benchmark runs on the Mac (M2 Pro 32 GB).

## Phase 0 — Re-baseline ✅ DONE (PR #5)
Verified in a CI-style py3.12 venv: 3,159 pytest passed (+7 skipped), 514 vitest passed (48 files). `tsc`: 6 errors, all missing `@types/node` in two viewer test files (open decision: add devDependency). Stale schema/test numerals fixed in CLAUDE.md, README, status header. Gotcha: run vitest/tsc from `frontends/sakura/`, never repo root.

## Phase 1 — `tools/bench` model benchmark harness ✅ CODE DONE / ⏳ AWAITING REAL-MODEL RUN
Built and unit-tested (29 new tests, run against a fake OpenAI-compatible server; mutation-checked). **No real model has been benchmarked yet** — real models live on Chris's Mac, not the cloud container.
- `python -m tools.bench` / `./run.sh bench`: sweeps every installed chat model on LM Studio (`:1234/v1`) or Ollama (`:11434`) — same tool, same test — across four strategies: `S0_baseline` (today), `S1_schema` (server-forced `json_schema`), `S2_split` (prose reply then a schema-forced annotation call), `S3_prefill` (experimental). Resumable JSONL; fail-fast after 3 consecutive failures; `report` subcommand renders Markdown + a reply sample sheet for judging voice.
- Fidelity: uses the app's real persona prompt pack (~3.9K tokens), `_get_rp_style_injection`, `build_kokoro_fragment`, `parse_companion_response`, and `OpenAICompatAdapter` (the adapter the registry actually returns for `provider: openai`/LM Studio).
- New shared module `backend/kokoro/response_schema.py` (schema generated from parser enums; Tier F dials only when NSFW-gated). No runtime behaviour change.
- Finding: `backend/llm/adapters/lmstudio.py` (`LMStudioAdapter`) is never returned by `registry.get_client` and references undefined `retries`/`backoff` (would NameError) — dead code, left untouched.
- **Next action (Chris):** `./run.sh bench --dry-run`, then the sweep; keep the raw `.jsonl` local (git-ignored; it contains full RP transcripts) and commit/paste the generated `.md` report. See `tools/bench/README.md`.

## Phase 2 — Fix Kokoro with the winning strategy ⏸ BLOCKED on Phase 1 numbers
Pick strategy + model shortlist from results. Touch points: `backend/server.py` stream/finalize path, `openai_compat.py` bypass logic, gate `finalizeKokoroTurn` (`chatStore.ts:140`) so the HUD stops showing a false red for bypassed models. Gate: live parse_ok ≥ 80% via `/api/kokoro/qa`. One hypothesis at a time; 3-strike rule.

## Phase 3 — Emotional RAG (Kokoro v2 Phase 2) ⏸ BLOCKED on Phase 2
Schema v90 `memories.mind_state_snapshot`; dial-cosine rerank behind `emotional_rag_enabled` (byte-identical when off). Agents: `kokoro-mind-engineer`, `memory-architect`, `psych-qa-hunter`, `companion-safety-reviewer`. `/qa-sweep` at handoff (migration trigger).

## Status log
- 2026-10-04 — Plan created. Phase 0 done (PR #5). Phase 1 harness built + tested; 3,188 backend pytest pass.
