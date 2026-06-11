# Kokoro parse_ok Rate — Live Validation (2026-05-29, session 50)

**Why:** Session-48 handoff priority #1 — confirm the Kokoro structured-JSON
contract parses at ≥80% against a real local LLM. Chrome HUD was never wired,
so this was driven via curl through the live backend.

## TL;DR — parse_ok = 0% in practice, and the metric is structurally broken for the real model

| Model | kokoro | parse_ok (per-run) | Note |
|---|---|---|---|
| llama-3.2-1b-instruct (loaded) | on | **0/1** | pure prose, ignores contract |
| llama-3.2-8x4b-moe-…-21b (capable, uncensored) | on | **0/20** | pure prose, ignores contract |
| qwen3.5-9b (user's real model, OFFLINE) | n/a | **N/A by design** | reasoning-model bypass skips the fragment |

## Findings

1. **Two-call pipeline.** `/api/chat/stream` injects the JSON-contract fragment
   (only when `kokoro_enabled` AND model is NOT a reasoning model). The frontend
   then POSTs the full reply to `/api/kokoro/finalize`, which parses + logs
   `parse_ok` to `kokoro_parse_log`. `chatStore.ts:443` passes
   `(data.reply || fullText)` as rawText.

2. **Metric is honest, not an artifact.** Empirically `done.reply === fullText`
   (raw token stream); the backend does not clean server-side. So parse_ok
   measures the model's true JSON compliance.

3. **`structured_output:"auto"` is NOT grammar-forcing JSON.** The 1B and the
   21B both emitted free prose. Output is not schema-constrained.

4. **0% on a capable model.** The 21B returns clean JSON when prompted directly
   (verified), but through the chat pipeline it emits roleplay prose every time.
   Root-cause hypothesis: the ~15KB persona bible + `rp_style_preset:"explicit_rp"`
   asterisk-action instructions dominate the tiny (~70-token) JSON contract
   appended at the very end. The model obeys the loud persona, ignores the
   quiet contract.

5. **Reasoning-model bypass disables Kokoro for the real model.** Regex
   `qwen-?3|qwen3|deepseek-r1|…|qwq` (openai_compat.py:27) → `qwen3.5-9b`
   matches → fragment never injected. So for the user's actual deployment,
   structured embodiment never runs.

6. **BUG — misleading HUD.** `finalizeKokoroTurn` (chatStore.ts:140) is NOT
   gated on the reasoning-model bypass. With kokoro on + qwen3.5-9b, every
   turn logs `parse_ok=False` → the session-48 HUD badge shows alarming RED
   for a model working exactly as designed.

## Recommendations

- **If structured embodiment is wanted:** force JSON via LM Studio's
  `response_format`/grammar (json_schema) on the kokoro turn, OR move the
  contract to the END as a hard `assistant`-prefix `{` nudge, OR drop the
  persona weight on kokoro turns. Without forcing, parse_ok will stay ~0% on
  any persona-heavy prompt.
- **Gate `finalizeKokoroTurn` on the same reasoning-model check** the stream
  uses, so the HUD doesn't log false negatives for bypassed models.
- **Reconsider whether Kokoro structured JSON is viable at all** given the app
  ships persona-heavy `explicit_rp` prompts + the user's model is always
  bypassed. The embodiment (facialExpression/gesture from JSON) currently
  never fires in practice.

## Files referenced
- backend/kokoro/{service,response_parser,prompt_fragment}.py
- backend/server.py:5920-5948 (stream injection + bypass), :20084-20231 (finalize + qa)
- backend/llm/adapters/openai_compat.py:27 (reasoning regex)
- frontends/sakura/src/stores/chatStore.ts:140-159, 443-444

## Method
Harness: `$CLAUDE_JOB_DIR/tmp/kokoro_parse_validate.py` — drives stream→finalize→qa,
20 varied-tone turns, config snapshotted + restored byte-exact. kokoro_enabled
temporarily true, model temporarily set to the 21B; both reverted.
