# Empty AI Reply — Backend Returns Blank Message

**Filed:** 2026-04-29 (session 23)
**Reporter:** chris
**Status:** OPEN — root cause identified, fix-options proposed
**Severity:** P0 — chat is the core product loop and is broken

## Symptom

User sends a chat message. Character bubble appears with avatar + name but **no text content**. Backend health endpoint reports `llm: connected`, sidebar shows `OpenAI` with green dot.

Screenshot evidence: session 23 user report, both `*waves*` and `wink hello` test sends produced empty assistant bubbles.

## Root Cause(s)

Two independent issues compound to produce the empty bubble.

### 1. Configured endpoint hangs on inference

`backend/config/app.json` (or wherever the LLM block lives) has:

```json
"endpoint": "http://10.0.0.17:1234/v1"
```

Probe results:

| Probe | Result |
|---|---|
| `GET http://10.0.0.17:1234/v1/models` | HTTP 200, lists qwen/qwen3.5-9b + others |
| `POST http://10.0.0.17:1234/v1/chat/completions` | **timeout after 30s, no response, HTTP 000** |
| `POST http://localhost:1234/v1/chat/completions` | HTTP 200 in 6.2s, returns content |

Interpretation: LM Studio at `10.0.0.17` (likely the Windows / GPU PC) responds to model-listing metadata calls but is **not actually serving inference**. Likely causes: the model is not loaded into memory there, the LM Studio backend tab is set to a different model, or the LM Studio server tab is stopped despite the listing being cached.

### 2. Thinking mode eats the entire token budget

`backend/config/app.json`:

```json
"thinking_mode": true,
"model": "qwen/qwen3.5-9b"
```

qwen3.5 is a reasoning-capable model. With `thinking_mode: true`, LM Studio exposes reasoning content separately from final content. Direct probe with `max_tokens: 40`:

```json
{
  "choices": [{
    "message": {
      "content": "",
      "reasoning_content": "Thinking Process: ...",
      "tool_calls": []
    },
    "finish_reason": "length"
  }],
  "usage": {
    "completion_tokens": 40,
    "completion_tokens_details": { "reasoning_tokens": 39 }
  }
}
```

**`content: ""`** — the assistant ran out of budget mid-thinking and never produced a final reply. With a 40-token cap, 39 tokens went to reasoning. Even at 200-300 tokens, qwen3.5 9B can blow the budget reasoning before answering.

If backend code only forwards `content` to the frontend (and discards `reasoning_content`), an answer that finishes at `length` mid-thinking is rendered as the **empty bubble** the user sees.

## Where to look in code

- `backend/llm/` — the LLM adapter classes. Specifically the OpenAI-compatible adapter parsing `choices[0].message.content`. Check whether `reasoning_content` is being captured at all.
- `backend/llm/context_assembler.py` — token budget allocation. If thinking mode is on, the answer-budget needs to leave headroom for the reasoning portion.
- `backend/server.py` — the SSE chat endpoint. Confirm what gets streamed to the frontend when `content` is empty but `reasoning_content` is non-empty.
- `frontends/sakura/src/stores/chatStore.ts` — `sendMessage` SSE consumer. May silently render empty `content` deltas.

## Fix Options (pick one or combine)

| # | Fix | Effort | Tradeoff |
|---|---|---|---|
| **A** | Switch endpoint to `http://localhost:1234/v1` | 2 min | Disqualifies the GPU PC. Local Mac M2 Pro inference is slower than RTX 5080. |
| **B** | Restart / re-load the model in LM Studio on 10.0.0.17 | external | Doesn't fix the underlying root cause — bound to recur. |
| **C** | Disable `thinking_mode` in the config | 2 min | Loses reasoning quality on tasks that benefit from it. Tradeoff: instant content output. |
| **D** | Bump `max_tokens` significantly (e.g., 1024+) and/or expose `reasoning_content` to the frontend (collapsed-by-default disclosure) | ~2-3h | Best UX. Honors user's choice of thinking mode + ensures the answer always lands. Requires adapter + chat-store + ChatThread render changes. |
| **E** | Add a backend retry/timeout guard so a hung 10.0.0.17 falls through to `localhost:1234` (the existing `link.auto_route` path may already cover this — needs verification) | ~1h | Resilience. Doesn't fix the budget bug. |

**Recommended combination:** A + D. Switch endpoint locally for unblocked chat; ship D as proper fix in next session. Or A + C if user wants thinking_mode off entirely.

## How to reproduce

1. With current `app.json` endpoint set to `10.0.0.17:1234/v1` AND `thinking_mode: true`:
2. Open the app, send any message.
3. Observe empty assistant bubble.
4. Curl-probe the configured endpoint with a small `max_tokens` to see thinking burn the budget.

## Not caused by

Tier 1 (`*action*` syntax) commit `fbe6eaf` — that commit only modified rendering + composer affordance. SSE/LLM adapter code untouched.
