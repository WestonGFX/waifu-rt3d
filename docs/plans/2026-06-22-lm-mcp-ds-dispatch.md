# Plan: lm-mcp `ds_dispatch` — DeepSeek cloud dispatch tool (privacy-gated)

**Date:** 2026-06-22 · **Repo to edit:** `~/Code/lm-mcp/` (TypeScript / Bun — NOT Python) · **Approved by Chris** (2026-06-22).
**Design source:** [`docs/research/2026-06-22-claude-code-model-routing.md`](../research/2026-06-22-claude-code-model-routing.md) (6-agent council verdict) · global rule `~/.claude/rules/model-routing.md` (the broader local/DeepSeek/Claude policy — read it first; Claude-Max-is-already-paid reframe means DeepSeek is a *narrow, spend-only-when-it-adds-value* tool, and `ds_dispatch` should expect Claude to pass an already-sanitized/summarized brief, with the privacy gate as the backstop).

## Goal

Add an MCP tool `ds_dispatch` that sends a **generic, zero-project-context** task to the **DeepSeek cloud API** (`https://api.deepseek.com/v1/chat/completions`, model `deepseek-v4-flash`), mirroring the existing local-Qwen dispatch but with a **hard privacy gate**. It composes with the existing lm-mcp router (cache, verifier, retry, escalation-to-Claude on failure). Key isolated in lm-mcp config (never logged/transcribed). No proxy.

## Non-negotiables (from the council)

- **🔒 Privacy gate is the heart of this.** `ds_dispatch` MUST refuse any payload that looks like file contents / proprietary code / secrets, and tell the caller to use Qwen/Claude instead. Conservative bias: when unsure, REFUSE (a false refusal just routes to Claude; a false accept leaks IP to the PRC). Legit ds_dispatch payloads are generic natural-language / spec text, so a strict gate is acceptable.
- **Key never logged.** Lives in `~/.config/lm-mcp/config.json` `providers.deepseek.apiKey` (0600). Router already logs only provider id, not creds — keep it that way.
- **Model-agnostic.** Default `deepseek-v4-flash`; allow `deepseek-v4-pro` as the escalation tier. Don't hard-code anywhere a future model rename would break; read model from provider def/config.

## Build steps (file:line anchors from the repo map)

1. **Provider defs** — `src/llm/provider.ts` `PROVIDER_DEFS` (~L99–151): add
   - `deepseek-v4-flash`: `defaultBaseURL: "https://api.deepseek.com/v1"`, `defaultModel: "deepseek-v4-flash"`, `isLocal: false`, sane `quotaLimits`, `parseQuotaHeaders` (DeepSeek may not send day headers → null).
   - `deepseek-v4-pro`: same baseURL, `defaultModel: "deepseek-v4-pro"` (escalation tier).
2. **Privacy gate** — `src/privacy/redact.ts` (~L15–20) OR (cleaner) a dedicated `isProprietaryOrCode(text): {blocked, reason}` helper. Block when the payload contains: absolute paths (`/Users/`, `/home/`), code-syntax markers at line starts (`import `, `require(`, `class `, `def `, `function `, `export `, `const `, `} `), multi-line code-shaped blocks, or known secret patterns (reuse existing SECRET_LINE regex). Keep the existing `redact()` too (defense in depth). Unit-test this helper hard — it's the security boundary.
3. **Tool** — NEW `src/tools/ds_dispatch.ts` mirroring `src/tools/lm_dispatch.ts` (L13–68):
   - Tool def `{ name: "ds_dispatch", description: "...generic, NON-proprietary, zero-file-context tasks only; refuses code/file payloads...", inputSchema }`.
   - Handler: **GATE FIRST** (`isProprietaryOrCode(prompt+input)` → if blocked, return `isError` with a message telling Claude to use Qwen/Claude). Then `dispatch(args, makeDeps({ providers: ["deepseek-v4-flash","deepseek-v4-pro"] }))` so the chain is DeepSeek-only with Flash→Pro escalation, verifier on, then escalate-to-Claude (throw) on exhaustion.
4. **Server wiring** — `src/server.ts`: import (L14–17), add to ListTools array (L25), add `if (name === "ds_dispatch") return dsDispatchHandler(args)` (after L42).
5. **Config example** — `examples/lm-mcp-config.example.json`: add `providers.deepseek` entry `{ "apiKey": "", "enabled": false, "endpoint": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash" }` (disabled until Chris pastes his key). Optionally extend `set-cloud-keys.sh` to read `DEEPSEEK_API_KEY`.
6. **Tests** — NEW `tests/ds_dispatch.test.ts` mirroring `tests/router.test.ts` (fetch mock at L39–57): (a) gate BLOCKS code/file/secret payloads (the critical security test — several cases); (b) gate ALLOWS a generic NL prompt; (c) happy path hits `api.deepseek.com/v1` + parses response; (d) verifier-fail → escalation throw. No real API calls.
7. **Docs** — `ROUTING.md`: add DeepSeek to the provider/tier table + note the privacy gate + the `/local`/`/cloud` composition.

## Verify

`cd ~/Code/lm-mcp && bun test` (all green, incl. the new gate tests). Confirm the key is read from config and never appears in logs/test output. Smoke: a generic prompt dispatches; a code-shaped prompt is refused.

## Out of scope (deferred per council)

No routing proxy (ccr/LiteLLM). No subagent→DeepSeek routing. No automatic 3-tier escalation beyond Flash→Pro→throw-to-Claude. DeepSeek stays the narrow "generic, non-proprietary, too-hard-for-Qwen" slot.
