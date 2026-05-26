# Local-LLM Dispatch MCP (`lm-mcp`) — Design Spec

**Date:** 2026-05-25
**Author:** Chris Lord + Claude (brainstorming session)
**Status:** Design — awaiting user review before implementation plan

---

## 1. Why

Today: Claude Code (paid Anthropic Opus/Sonnet) handles every task in this workflow, from architecture decisions down to "summarize this log file" — even when a local 9B model could do the latter for free.

User has:
- **LM Studio** on Windows box at `10.0.0.17:1234`, serving `qwen/qwen3.5-9b`
- **Free electricity** + idle GPU when not actively gaming
- **Claude Code subscription** that bills tokens for every turn

Goal: cheap tier (local Qwen) absorbs the long tail of mechanical / summarization / lookup / boilerplate-draft work; expensive tier (Claude) reserved for genuine reasoning, architecture, multi-file refactors, taste calls, and anything safety-critical.

**Long-term north star** (architecture #4): a larger local model (Qwen-Coder-32B or equivalent) eventually replaces Claude as the orchestrator for most work, with Claude reserved for the hardest tasks only. This spec is the on-ramp.

---

## 2. Architecture

### 2.1 Tier model

```
USER
 │
 ▼
CLAUDE CODE (orchestrator, paid)
 ├─ Hard tasks (architecture, multi-file, security, taste, debug) → handles directly
 │
 ├─ Mechanical / summarize / lookup / draft → MCP tool call ──┐
 │                                                            │
 │                                                            ▼
 │                                                LM-MCP server (this spec)
 │                                                            │
 │                                                            ▼
 │                                                LM Studio @ 10.0.0.17
 │                                                Qwen 3.5 9B (free)
 │
 └─ (Future) Free cloud LLMs (DeepSeek/Gemini web) via Claude-in-Chrome MCP
     when a task exceeds Qwen but doesn't warrant Claude tokens
```

### 2.2 Components

| Component | Role |
|---|---|
| **`lm-mcp` server** | MCP server registered with Claude Code. Exposes `lm_dispatch` (generic) + 3 hot-path tools (`lm_summarize`, `lm_commit_message`, `lm_lookup`). Implements policy, verification, caching, logging. |
| **Router** | Decision engine inside `lm-mcp`. Reads policy config + task metadata, picks: dispatch / reject / escalate. |
| **Verifiers** | Per-category cheap output checks (parse, spot-grep, AST, line budget, etc.) that gate acceptance. |
| **Policy module** | Two implementations: `standard` (v2) and `deep` (v3). Hot-reloaded from `~/.config/lm-mcp/config.json`. |
| **Privacy filter** | Redacts secrets/keys/PII from prompts before they leave Claude. |
| **Cache** | SQLite (bun:sqlite) at `~/.cache/lm-mcp/cache.db`, prompt-hash → result, 7d TTL, 500MB LRU cap. |
| **Log** | JSONL append at `~/.cache/lm-mcp/dispatch.log` — every dispatch + outcome + token estimate. |
| **Shadow eval** (v3) | 5% of dispatches also run on Haiku for calibration; outputs compared via semantic similarity. |
| **Claude-side rules** | `~/.claude/rules/lm-mcp-routing.md` — short directive telling Claude WHEN to consider dispatching. |

### 2.3 Data flow (single dispatch)

```
1. User prompt → Claude
2. Claude classifies task category, checks hard-blockers + rules.md
3. If eligible: Claude calls lm_dispatch / lm_summarize / lm_commit_message / lm_lookup
4. MCP server: privacy redaction → cache lookup → (miss) → route to endpoint
5. LM Studio (Qwen) returns output (streamed for long outputs)
6. MCP: verifier runs → pass = return to Claude; fail = retry (max 2) or escalate (throw)
7. MCP: log entry written; cache populated on pass
8. Claude: shows result to user (or, on escalation throw, handles task itself)
9. (v3, 5% of dispatches): shadow eval against Haiku, logged silently
```

---

## 3. Tool Surface

Hybrid: generic dispatcher + 3 hot-path shortcuts.

### 3.1 `lm_dispatch` (generic)

```ts
lm_dispatch({
  task_type: "summarize" | "transform" | "draft" | "lookup" |
             "search_summarize" | "memory_review" | "qa_oneshot",
  prompt: string,
  input?: string,
  max_tokens?: number,          // default 2000
  verify?: VerifierName,        // default: chosen by task_type
  no_cache?: boolean,           // skip cache for this call
  policy_override?: "standard" | "deep" | "off"
}) → {
  result: string,
  verified: boolean,
  attempts: number,
  cached: boolean,
  latency_ms: number,
  tokens_used: { input: number, output: number },
  tokens_saved_est: number,
  confidence?: "low" | "medium" | "high",   // v3 only
  notice?: string                            // e.g. "retried, verifier flagged X"
}
```

### 3.2 Hot-path tools

```ts
lm_summarize({ text, max_words?, focus? })
lm_commit_message({ diff, style?: "conventional" | "descriptive" })
lm_lookup({ topic, framework?, version? })
```

Each has a locked schema, dedicated system prompt, and category-specific verifier built in.

---

## 4. Delegation Policy

Two policies coexist. User picks default via config; switchable runtime.

### 4.1 Policy: `standard` (v2)

#### Hard blockers — Claude always handles
| Blocker | Example trigger |
|---|---|
| Auth / security / crypto | "add JWT refresh", "review password hashing" |
| DB schema / migration | any edit to `backend/preflight.py`, ALTER TABLE |
| Multi-file refactor (shared state) | "rename X across stores + components + API" |
| Context-dependent (needs prior turns) | "apply the same fix to the other handler" |
| Aesthetic / UI / UX taste | "is this layout good", "pick a color palette" |
| Architecture decision | "should we use Zustand or context" |
| Subtle bug hunt | "why does this race", "find the memory leak" |
| Anything under `_BACKUP_ROOT/` | project rule — sacred path |

#### Privacy filter (always-on)
Before any prompt leaves Claude → LM Studio:
- Strip lines matching `(?i)(api[_-]?key|token|secret|password|bearer|authorization)\s*[:=]`
- Strip `.env*`, `auth.json`, `credentials.*` contents
- Replace email-shaped strings with `<email>`, phone numbers with `<phone>`
- Strip user-message bodies from `app.db` dumps (shape only, not content)

#### Cost / size gates
| Condition | Action |
|---|---|
| Total task < 200 tokens in + out | Claude does it (overhead > savings) |
| Input > 5,000 tokens AND summarize/extract/grep-summary | Always delegate (max savings) |
| Input 200–5,000 tokens AND category matches | Delegate by default |
| Output expected > 2,000 tokens | Delegate only if pure-mechanical |
| Streaming UI / partial output needed (v2 only) | Claude (v2 has no streaming) |

#### Category → Verifier matrix
| Category | Verifier | Checks |
|---|---|---|
| A. Summarize | `spot_grep` | 1 random claim appears in source |
| B. Transform (JSON/YAML) | `parse_roundtrip` | Valid output; line/key counts match |
| B. Transform (code) | `tree_sitter_parse` | AST parses; same language |
| D. Draft (commit msg) | `line_budget` | Subject ≤ 72 chars, body ≤ 100/line, no emoji |
| D. Draft (code) | `syntax_check` | `ast.parse` / `tsc --noEmit` on temp file |
| D. Draft (types from JSON) | `roundtrip_validate` | Generated type validates source JSON |
| G. Lookup | `context7_crosscheck` (async) | Compare key terms to Context7 result |
| E-lite. JSON/YAML validity | `self_parse` | Parser agrees with Qwen's verdict |
| H. Search summary | `spot_grep + count_match` | Claimed counts == `rg --count` |
| I. Memory hygiene | `diff_review` | Claude approves edit before write |
| J. One-shot Q&A | `none` / `manual` | Low-stakes |

#### Retry & escalation
- Max 2 retries (3 total attempts)
- Retry 1: same prompt, temp 0.0, "Output ONLY the result, no preamble"
- Retry 2: prepend 1-shot example
- Verifier fails after retry 2 → throw → Claude takes over
- Timeout 30s per attempt → hard fail → Claude (don't retry on timeout)

#### Transparency
| Event | User sees |
|---|---|
| Silent dispatch (verifier pass first try) | Nothing |
| Retry once | `[Qwen retry, verifier flagged: parse error]` |
| Escalation | `[Qwen failed verification 2x — handling directly]` |
| End-of-session summary | `This session: 14 dispatched, 12 passed, 2 escalated. Est. tokens saved: ~24k.` |

#### User overrides (in-prompt commands)
| Command | Effect |
|---|---|
| `/local <task>` | Force this task to Qwen even if normally Claude |
| `/cloud <task>` | Force Claude (skip dispatch consideration) |
| `/dryrun <task>` | Show what would dispatch, don't execute |
| `/lmstats` | Print session dispatch stats |
| `/lmpolicy {standard\|deep\|off}` | Switch policy |

#### Log schema (every dispatch)
```jsonl
{
  "ts": "2026-05-25T14:32:18Z",
  "task_type": "summarize",
  "tool": "lm_summarize",
  "input_tokens": 4821,
  "output_tokens": 312,
  "latency_ms": 6210,
  "attempts": 1,
  "verified": true,
  "verifier": "spot_grep",
  "verifier_detail": null,
  "escalated": false,
  "estimated_claude_tokens_saved": 5133,
  "session_id": "uuid",
  "prompt_hash": "sha256:abc...",
  "model": "qwen/qwen3.5-9b"
}
```

#### Parallel dispatch
Up to 4 concurrent dispatches (configurable). LM Studio + GPU thrash mitigation.

#### Mid-task salvage
If verifier soft-passes (e.g., parses but stylistically off), Claude edits in place rather than re-dispatching. Logged as `salvaged: true`.

#### Quality review cadence
- Weekly: Claude reads last 7 days of `dispatch.log`, summarizes pass rate per category.
- After 100 dispatches: any category < 70% pass → demote to manual-only.
- After 500 dispatches: re-evaluate local model upgrade (signal Qwen 9B hit ceiling).

---

### 4.2 Policy: `deep` (v3, default) — extends standard with:

#### A. Streaming output
Long outputs (> 500 tokens) stream via SSE through MCP to Claude Code. First token in < 500ms. Verifier runs on final. Stream stalls > 5s → abort + escalate.

#### B. Per-task / per-session budget caps
| Cap | Default | At limit |
|---|---|---|
| Per-task wall time | 30s | Escalate |
| Per-task input tokens | 30,000 | Reject (too big for 9B context) |
| Per-task output tokens | 4,000 | Truncate, mark `truncated: true`, Claude reviews |
| Per-session dispatch count | 200 | Warn user, ask before #201 |
| Per-day GPU wall time | 4 hours | Soft log "heavy day" mark |
| Per-task est. dollar-equiv savings | $0.005 | Skip delegation (overhead > savings) |

#### C. Shadow evaluation (5%, default)
Every Nth dispatch also runs on Haiku silently. Outputs compared via semantic similarity (cosine over embeddings if available, else Levenshtein fallback). Logged to `shadow_eval.log`. Cost: ~$0.0001/task. Calibrates routing quality.

#### D. Self-reported confidence
Qwen prompt ends with: "Output `CONFIDENCE: low|medium|high` on final line." Server parses, strips, uses:
- `high` + verifier pass → silent accept
- `medium` + verifier pass → accept with notice
- `low` → treat as failed verifier, immediate escalate (skip retry)

#### E. Bayesian demotion
Each category tracks Beta(α, β) posterior. Pass updates α, fail updates β.
- Demote when posterior mean < 0.75 AND 95% CI excludes 0.85.
- Promote when CI includes 0.9.
- Avoids whipsaw on small samples.

#### F. Cold-start safety
First 20 dispatches per new task type run in **shadow-only**: Claude does it (user sees Claude), Qwen runs in parallel for calibration. After 20, if pass rate ≥ 80%, promote to normal delegation.

#### G. Result caching
SQLite, key = `sha256(model + prompt + input)`. TTL 7d. Skip for `no_cache: true` or randomness-required tasks. Cache hit logged as `cached: true`, counts 100% of token savings. Model version change auto-invalidates.

#### H. Multi-model routing
Config can list multiple endpoints with capacity + priority. Router picks smallest model that fits.
```jsonc
"endpoints": [
  { "name": "mac-small",  "url": "http://localhost:1234/v1",  "model": "qwen-2.5-3b", "max_input": 2000,   "priority": "low_latency" },
  { "name": "win-medium", "url": "http://10.0.0.17:1234/v1",  "model": "qwen-3.5-9b", "max_input": 30000,  "priority": "default" },
  { "name": "win-large",  "url": "http://10.0.0.17:1235/v1",  "model": "qwen-3-32b",  "max_input": 100000, "priority": "high_capability" }
]
```
This is the on-ramp to architecture #4.

#### I. Outage auto-bypass
Endpoint unreachable → bypass mode: dispatches return `{ delegated: false }` instantly, Claude transparently handles all work. User notified once. Background health-check every 60s; auto-resume.

#### J. Per-category overrides
Config carries per-category tuning:
```jsonc
"category_overrides": {
  "lookup":     { "cache_ttl_days": 30, "retries": 3, "model_pref": "win-medium" },
  "commit_msg": { "shadow_eval_rate": 0.20, "no_cache": true },
  "transform":  { "verifier": "strict_ast", "timeout_s": 15 }
}
```

---

### 4.3 Policy switch

Config: `~/.config/lm-mcp/config.json`. Read at MCP startup AND on every dispatch (hot-reload — no restart).

```jsonc
{
  "policy": "deep",                 // "standard" | "deep" | "off"
  "endpoint": "http://10.0.0.17:1234/v1",
  "model": "qwen/qwen3.5-9b",
  "shadow_eval_rate": 0.05,
  "cache_enabled": true,
  "streaming": true,
  "concurrency": 4,
  "outage_bypass": true,
  "budget_caps": { /* see §4.2 B */ },
  "category_overrides": { /* see §4.2 J */ }
}
```

How user switches:
- Edit file directly — hot-reloaded
- `/lmpolicy {standard|deep|off}` slash command (Claude writes the file)
- Per-task: `/local --policy=standard` overrides for that call only

`"off"` = MCP returns `{ delegated: false, reason: "policy=off" }` immediately for all calls. Useful for A/B comparison of a whole session.

**Default policy:** `deep`. Fallback to `standard` is one slash command (`/lmpolicy standard`).

---

## 5. Error Handling

| Failure | Behavior |
|---|---|
| Endpoint unreachable | Auto-bypass mode (v3); v2 returns error → Claude does it |
| Privacy filter rejects all input | Throw error to Claude, don't dispatch |
| Verifier fails 2x | Escalate to Claude (don't infinite-retry) |
| Timeout 30s | Hard fail, escalate (don't retry — model stuck) |
| Self-confidence `low` (v3) | Immediate escalate |
| Budget cap hit | Reject with reason, Claude handles |
| Cache corruption | Drop cache, log warning, continue |
| Stats DB corruption | Drop stats, restart with priors, log warning |
| Log file unwriteable | Continue without logging, single warning to user |
| Shadow eval API failure (v3) | Skip eval, dispatch succeeds normally |

**Principle:** No work is ever blocked by `lm-mcp` failure. Worst case = invisible quality degradation (Claude handles everything as if MCP didn't exist).

---

## 6. Testing Strategy

| Test | Tooling | Scope |
|---|---|---|
| Verifier correctness | Bun test | Each verifier against good + bad inputs |
| Privacy redaction | Bun test | Synthetic prompts with keys, emails, env vars |
| Router decision | Bun test | Table-driven: (task, policy) → expected (delegate/reject/escalate) |
| Cache hit/miss | Bun test | Insert + retrieve + TTL expiry + invalidate-on-model-change |
| Bayesian demotion | Bun test | Simulate pass/fail sequences, assert promotion/demotion firing |
| Outage bypass | Integration | Kill endpoint mid-test, assert bypass mode + auto-resume |
| Streaming | Integration | Long output, assert first-token < 1s |
| End-to-end | Manual | Real Claude Code session, dispatch real tasks, verify behavior |
| Shadow eval | Manual | Trigger forced shadow run, verify log entry shape |

Target: ≥ 80% line coverage on `router.ts`, `verifiers/`, `privacy/`, `policy/` modules. Integration tests run against a mock LM Studio fixture for CI; manual tests against real endpoint before each release.

---

## 7. File Layout

```
~/Code/lm-mcp/                          # Own repo, version-controlled
├── package.json                        # Bun-runnable
├── tsconfig.json
├── README.md / CHANGELOG.md / LICENSE
├── src/
│   ├── server.ts                       # MCP entry
│   ├── router.ts                       # Decision engine
│   ├── tools/
│   │   ├── lm_dispatch.ts
│   │   ├── lm_summarize.ts
│   │   ├── lm_commit_message.ts
│   │   └── lm_lookup.ts
│   ├── verifiers/
│   │   ├── spot_grep.ts
│   │   ├── parse_roundtrip.ts
│   │   ├── tree_sitter_parse.ts
│   │   ├── syntax_check.ts
│   │   ├── line_budget.ts
│   │   ├── context7_crosscheck.ts
│   │   └── index.ts                    # category → verifier registry
│   ├── privacy/
│   │   ├── redact.ts
│   │   └── redact.test.ts
│   ├── storage/
│   │   ├── cache.ts                    # bun:sqlite
│   │   ├── log.ts                      # JSONL writer
│   │   └── stats.ts                    # Bayesian posteriors
│   ├── policy/
│   │   ├── standard.ts                 # v2
│   │   ├── deep.ts                     # v3 extends standard
│   │   ├── off.ts
│   │   └── switch.ts                   # hot-reload config
│   ├── routing/
│   │   ├── endpoint_picker.ts          # multi-model router (v3 H)
│   │   └── health_check.ts             # outage bypass (v3 I)
│   ├── shadow/
│   │   └── eval.ts                     # v3 C
│   └── cli/
│       └── lmstats.ts                  # `lm-mcp stats`
├── tests/
│   ├── router.test.ts
│   ├── verifiers.test.ts
│   ├── privacy.test.ts
│   ├── cache.test.ts
│   └── fixtures/
└── examples/
    └── claude-mcp-config.json

~/.config/lm-mcp/
├── config.json                          # User policy + caps (hot-reloaded)
└── config.example.json

~/.cache/lm-mcp/
├── cache.db                             # SQLite, 7d TTL, 500MB LRU
├── dispatch.log                         # JSONL append
├── stats.db                             # Bayesian posteriors
└── shadow_eval.log                      # JSONL, v3-only

~/.claude/mcp-servers/
└── lm-mcp → /Users/chris/Code/lm-mcp/   # symlink for discovery
```

---

## 8. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Bun + TypeScript | Fast cold start, native SQLite, matches OpenCode stack |
| MCP SDK | `@modelcontextprotocol/sdk` (TS) | Official, streaming support |
| LM Studio client | OpenAI SDK (compat mode) | LM Studio is OpenAI-compatible |
| Cache | `bun:sqlite` | Zero-dep, embedded |
| Parsing (verifiers) | tree-sitter (wasm) | Language-agnostic AST checks |
| Embedding (shadow sim) | `nomic-embed-text-v1.5` via LM Studio if loaded; else Levenshtein-bag-of-words fallback | Free, on-device |
| Test runner | Bun test | Built in |

---

## 9. Claude Code Registration

```jsonc
// ~/.claude/settings.json
{
  "mcpServers": {
    "lm-mcp": {
      "command": "bun",
      "args": ["run", "/Users/chris/Code/lm-mcp/src/server.ts"],
      "env": {
        "LM_MCP_CONFIG": "/Users/chris/.config/lm-mcp/config.json"
      }
    }
  }
}
```

Claude-side routing instructions live at `~/.claude/rules/lm-mcp-routing.md` (short directive, declarative, read once per context). Per user's `feedback_rules_over_hooks`: no SessionStart auto-fire. Claude decides per-task using the rule + the tool descriptions.

---

## 10. Build Phases

| Phase | Scope | Est. focused hrs | Slice |
|---|---|---|---|
| 0 | Skeleton: MCP boilerplate, one `lm_dispatch` summarize-only | 1–2 | Claude can call it, get Qwen summary |
| 1 | Verifiers + 4 task types (A/B/D/G) + privacy module | 3–4 | Real category routing works |
| 2 | Hot-path tools + cache + log + `lmstats` CLI | 2–3 | End-of-session summary works |
| 3 | Policy v2 (`standard`) + `/lmpolicy` slash | 2 | v2 live, switchable to off |
| 4 | Policy v3 (`deep`) — streaming, caps, confidence, Bayesian, outage, multi-endpoint | 4–5 | v3 default, full spec |
| 5 | Shadow eval + cold start | 2–3 | Calibration data flowing |
| 6 | Docs + rules + slash commands | 1–2 | Cold-installable |

Total: 15–22 hours focused; ~1.5–2 hours wall time with AI-assisted dev (per `feedback_time_tracking` memory).

---

## 11. Future — Roadmap to Architecture #4 (Local Orchestrator)

When you stand up a 32B-class local model (Qwen-Coder-32B, DeepSeek-Coder-V2, Devstral-32B, or similar), the path to making it the orchestrator instead of Claude:

| Milestone | Trigger | Action |
|---|---|---|
| 32B model running locally | Whenever GPU + storage allow | Add as `win-large` endpoint in `lm-mcp` config, priority `high_capability` |
| First 50 dispatches at 32B level | Run-rate established | Review shadow eval log: is 32B output ≈ Claude output for medium-hard tasks? |
| 32B passes 80%+ shadow-eval similarity on "transform" + "draft" categories | Calibration trust | Begin shadow-orchestration: 32B drafts response, Claude reviews/edits |
| Shadow-orchestration trusted across 200+ tasks | Quality gate | Flip 32B to primary orchestrator; Claude becomes the "escalate-to" tier |
| Claude usage drops to < 20% of tasks | Cost milestone | Consider downgrading Claude subscription tier; archive as on-demand only |

The MCP server's multi-endpoint router (§4.2 H) is what makes this transition smooth — same infrastructure, different routing weights.

---

## 12. Open Questions (resolve before implementation plan)

1. **MCP SDK choice** — TS official SDK vs FastMCP (Python). TS picked for Bun consistency; flag if Python is preferred.
2. **Tree-sitter wasm bundle size** — confirm acceptable for bun startup; fallback to language-specific parsers if not.
3. **Embedding model availability on Mac** — `nomic-embed-text-v1.5` ~270MB; confirm OK to add to LM Studio (or use Levenshtein-only).
4. **Slash command implementation** — Claude Code slash commands typically go in `~/.claude/commands/` as `.md` files; confirm path + format for this user.
5. **CI plans** — does this repo need GitHub Actions or is local-only sufficient?

---

## 13. Out of Scope (intentionally)

- Free-cloud LLM bridge (DeepSeek, Gemini browser) — added reactively when a real task gap shows up (decision §Q6 of brainstorming)
- OpenCode integration as a subagent — explicitly rejected (two stateful TUIs over same repo = fragile, conflicts with `feedback_tool_per_repo_no_mixing`)
- Web UI for log review — `lmstats` CLI sufficient; web UI can come later if data volume warrants
- Multi-user / shared cache — single-user tool; if shared, add later

---

## 14. References

- Brainstorming session: this conversation, 2026-05-25
- User feedback memory: `feedback_tool_per_repo_no_mixing`, `feedback_rules_over_hooks`, `feedback_time_tracking`, `feedback_full_autonomy_always`
- Existing MCP servers in this project: Context7, SQLite (read-only), FastMCP API bridge (12 endpoints)
- LM Studio REST API (v0) docs
- MCP TypeScript SDK: `@modelcontextprotocol/sdk`
