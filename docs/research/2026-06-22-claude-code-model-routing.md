# Model Routing for Claude Code + cheap open-source APIs (DeepSeek) — research

**Date:** 2026-06-22 · **Why:** Chris has $5 CAD DeepSeek credit (key in OpenCode on the Mac) and wants a *smart*, well-informed routing setup (cheap tasks → DeepSeek, important work → Claude), based on how routing is actually done — not a hand-rolled heuristic.

## The three mechanisms (how people route Claude Code → cheaper models)

### 1. `claude-code-router` (`ccr`) — the dominant, purpose-built option
Open-source local **proxy** that sits in front of Claude Code and routes **each request by type** to whatever provider you configure (DeepSeek, Qwen/Ollama, Gemini, OpenRouter, GLM…). This is the popular "task-aware" setup.
- Install: `npm i -g @musistudio/claude-code-router`; config `~/.claude-code-router/config.json`; launch with `ccr code`.
- **Router block routes by request characteristics** (this is the key feature):
  | rule | fires for | typical target |
  |---|---|---|
  | `default` | everything unmatched | mid model |
  | `background` | background/lightweight calls (summaries, title-gen, etc.) | **cheap model** |
  | `think` | reasoning / Plan Mode | reasoner |
  | `longContext` | requests over `longContextThreshold` (default 60k tok) | long-context model |
  | `webSearch` | web-search calls | search-capable model |
- DeepSeek provider: `api_base_url: https://api.deepseek.com/chat/completions`, `models`, `transformer: {use:["deepseek"]}`.
- **Subagent routing:** prepend `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` to a subagent prompt, or route via config → subagents go to the cheap model automatically.
- **Mid-session override:** `/model provider,model` (bump up when a task turns hard, drop back after). Custom logic via `CUSTOM_ROUTER_PATH`.
- Trade-off "nobody mentions": you're now running through a proxy — another moving part; some Anthropic-native features/updates can lag or need transformer shims.

### 2. `ANTHROPIC_BASE_URL` — simplest, all-or-nothing per session
DeepSeek speaks the **Anthropic Messages format**, so you can point Claude Code straight at it: set `ANTHROPIC_BASE_URL` + key and the whole session runs on DeepSeek. No proxy.
- **Tier-mapping pattern (the slick version):** map Claude *tiers* to DeepSeek models via env — **Opus/Sonnet tier → `deepseek-v4-pro[1m]`, Haiku + subagent slots → `deepseek-v4-flash`.** Routing Haiku/subagent calls to Flash while keeping the "premium" tier on Pro cuts **subagent cost 80–90%** with little quality loss.
- Downside: it's per-session/all-or-nothing unless you use the tier env vars; no per-request type routing like ccr.

### 3. OpenCode native routing — where Chris's key already is
OpenCode (separate agent CLI) has its **own** provider + per-agent model config with **fallback chains** (`escalationPolicy: "on-failure"`). DeepSeek publishes an **official OpenCode integration guide**. Popular community config: "Oh My OpenAgent." Pattern is the same: heavy reasoning → capable model; lightweight subagent calls → Flash.
- Pro: key is already here; no new proxy. Con: it's a *different harness* from Claude Code — context doesn't carry between them; you choose the tool per task.

## Best-practice patterns (consistent across sources)

- **~80% of routine work → cheap model, ~20% hard problems → frontier** ⇒ 60–90% cost cut, little quality loss.
- **Flash as the default cheap tier; Pro only when needed** (Pro ≈ 3× Flash output cost). Or **Pro primary + Flash fallback** for straightforward calls.
- **Escalate on the fly** with `/model`, then drop back.
- **Fallback/escalation routing** so an overloaded/failed cheap call bumps to a better model automatically.
- Volume reality: $ on V4-Flash buys ~30× the requests of a premium open model — Chris's $5 on Flash is *thousands* of cheap-task turns.

## Pricing (official, api-docs.deepseek.com, Jun 2026)
- `deepseek-v4-flash`: $0.14 in / $0.28 out per 1M (cache-miss). `deepseek-v4-pro`: $0.435 in / $0.87 out per 1M. 1M ctx, 384K out. Legacy `deepseek-chat`/`deepseek-reasoner` deprecate 2026-07-24.

## Recommendation for Chris's setup (to validate via brainstorming)
- His key is in **OpenCode** already → zero-setup path = **run cheap/independent tasks in OpenCode (Flash)**, keep Claude Code for the main thread. Good when the cheap task is *self-contained* (no shared Claude context).
- For *seamless in-Claude-Code* auto-offload (background/subagent → Flash without leaving the session), **`ccr`** is the better-fit tool — but it's a proxy layer to install + maintain, and it'd want the DeepSeek key in ccr's config too.
- `ANTHROPIC_BASE_URL` tier-mapping is the lightest "run a whole cheap session on DeepSeek" path.
- These compose with the existing **lm-mcp local-Qwen** route: trivial/throwaway → Qwen (free) · small–medium independent → DeepSeek Flash · medium-large/important/shared-context → Claude.

## 6-Agent Council Review — Verdict (2026-06-22)

A 6-lens review council (Sonnet, web-researched) pressure-tested the proposed "subagents default to DeepSeek Flash" design. It **substantially revised** it. Convergent findings:

1. **Privacy is the dominant constraint (headline).** DeepSeek's policy: data stored in **PRC**, **used for training** (no API opt-out outside EEA/UK/CH), **no zero-retention/enterprise tier**, PRC law (CSL/DSL/PIPL) compels gov access; poor breach record (exposed DB w/ live keys, Jan 2025). waifu-rt3d is **privacy-first/local-first** — sending its proprietary source (Kokoro, NSFW, memory, bond logic, `server.py`) to DeepSeek is **high IP risk + a values contradiction**. → **Never send file contents / proprietary code to any cloud-cheap route.** File-context tasks → local-Qwen or Claude.
2. **The subagent-anchor is unsafe for this repo.** A cheap model hasn't read CLAUDE.md/rules → convention blindness (bare `python3`, wrong migration pattern, Pydantic↔TS drift); **context-poisoning** (confident-wrong output becomes Claude's premise); V4 tool-call bugs (booleans as strings → validation fails); 64K context truncation on big files; **no model-attribution** to debug later. Guardrail "never route": preflight/schema, viewer.html, auth/security, cross-file refactors, `_BACKUP_ROOT`, anything feeding Claude's context.
3. **Don't install a proxy (ccr) for $5.** A proxy sits in front of **every** Claude Code call — total-failure blast radius; not justified by a $3.65 budget.
4. **lm-mcp already covers the safe cheap band** (free + private). DeepSeek's only *additive* safe niche is **generic, zero-project-context** tasks where Qwen-9B isn't strong enough (research in unfamiliar tech, generic boilerplate from a spec, public-API questions).
5. **Mechanics reality:** Claude **cannot** `/model` itself; subagent `model` field accepts only Claude tiers/IDs — "main=Claude + subagents=DeepSeek" is **impossible without a proxy**. DeepSeek's official env-var pattern routes the **whole session** to DeepSeek (all-or-nothing).
6. **Cost/quality:** $5 ≈ 2,000–4,000 Flash turns (proof-of-concept, not production). Flash > Haiku on SWE-bench (79 vs 73.3) & 10–18× cheaper, but trails on agentic Terminal-Bench (compound errors past ~10 tool calls). **Claude Haiku is the simpler in-harness "cheap" option** (shares cache/context, no privacy export). Bigger lever already wired: **Sonnet-vs-Opus** (Model Fit rule) saves more than the whole $5.
7. **If in-Claude-Code DeepSeek is ever wanted:** consensus best = **extend lm-mcp with a `ds_dispatch` tool** (assistant-decides, key isolated in the MCP env so it never lands in transcripts, native DeepSeek caching via `/v1`). Novel alt surfaced: a ~30-line micro-proxy routing on the `X-Claude-Code-Parent-Agent-Id` header (main absent → Anthropic, subagent present → DeepSeek).

**Revised recommended design:** keep lm-mcp + Claude as-is; DeepSeek **only** for generic zero-context tasks via **OpenCode (manual)** now — **no proxy, no subagent-routing, hard privacy guardrail (never send proprietary/file-context code)**; build the lm-mcp `ds_dispatch` extension only if the niche proves real; V4-Pro as a manual Opus-class escalation. The earlier `~/.claude/rules/deepseek-routing.md` (subagent-anchored, privacy-light) **needs revising to this** narrower/privacy-first scope.

Key extra sources: DeepSeek privacy policy (cdn.deepseek.com), Wiz DeepSeek DB leak, DeepSeek official Claude Code integration (api-docs.deepseek.com/quick_start/agent_integrations/claude_code), LiteLLM + Claude Code, X-Claude-Code-Parent-Agent-Id headers (Claude Code v2.1.139+).

## Sources
- claude-code-router: <https://github.com/musistudio/claude-code-router> · <https://musistudio.github.io/claude-code-router/>
- Guides: morphllm.com/claude-code-router · polyskill.ai/blog/claude-code-router · tokenmix.ai/blog/claude-code-router-guide-2026
- OpenRouter/cheaper-models: mindstudio.ai (several 2026 posts)
- DeepSeek official: api-docs.deepseek.com/quick_start/pricing · /guides/agent_integrations/opencode
- OpenCode routing: opencode.ai/docs/providers · "Oh My OpenAgent" (devanshtiwari.com, dev.to, May 2026) · therouter.ai DeepSeek V4 integration guide
