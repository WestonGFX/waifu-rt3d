# AIE Phase C — Scoping Doc

**Title:** Adaptive Intelligence Engine, Phase C — Per-Character Voice Fine-Tuning + DSPy Prompt Optimization
**Date:** 2026-05-06
**Status:** Scoping with 3 architecture decisions locked (2026-05-06); pending final tier selection
**Author:** Strategy thread (assistant), at user request

> **THIS IS A SCOPING DOC, NOT AN EXECUTABLE PLAN.** It exists so the user can choose a scope tier (MVP / Standard / Full / defer) and then commission a real plan with file-level instructions. Nothing here authorizes implementation.

## Locked Architecture Decisions (2026-05-06)

| # | Decision | Pick | Implications |
|---|---|---|---|
| 1 | Base-model strategy for LoRA | **Single locked base model** (recommend Qwen 2.5 7B) | All 13 character LoRAs trained against the same model. Simpler training pipeline. User must use this model whenever fine-tuned voice is wanted. Reconsider in Standard tier if voice quality is insufficient. |
| 2 | Mac (M2 Pro) feature parity | **Full feature — train on Windows, serve everywhere** | Training jobs run on RTX 5080 / 3070; trained LoRA files served on Mac via PEFT. Cross-machine setup is one-time. The user (primary dev on M2 Pro) sees the feature working day-to-day. |
| 3 | DSPy training signal | **Hybrid: explicit 👍/👎 UI + implicit signals, weighted, with user-controlled per-source toggles** | See **Section 3.4** for full architecture. UI is a Phase 0 prereq across all tiers (was Full-tier-only in the original draft). Three privacy modes: both signal sources on / explicit only / implicit only / both off. |

These decisions are non-negotiable for the eventual executable plan. The remaining variables (tier choice, exact tooling) are still open.

## Inputs Read

- `MEMORY.md` (AIE Phases A+B section — 10 modules, schema v66, 279 tests)
- `backend/adaptive/` (full file listing, 16 modules)
- `backend/llm/` + `backend/llm/adapters/` (5 adapters: lmstudio, lmstudio_rest, ollama, openai_compat, claude_api, gemini)
- `backend/llm/context_assembler.py` (single point of message-list assembly; token-budget aware)
- `backend/llm/link_manager.py` (LM Studio Link device discovery, hardware-aware routing)
- `requirements.txt` (no ML libs installed; only fastapi/chromadb/edge-tts/pytest baseline)
- `.venv/bin/pip list` (confirmed: no torch / transformers / peft / dspy / unsloth / accelerate)
- `docs/research/2026-03-29-adaptive-intelligence-research-part-{1,2,3}.md` (prior AIE deep dive — already covers DSPy/GEPA, on-device fine-tuning options, eval metrics)
- `docs/plans/2026-03-29-adaptive-intelligence-spec.md` (existing spec; references "Phase C — Advanced" as out-of-scope at the time)
- `CLAUDE.md` + `MEMORY.md` (project conventions, hardware reality, user preferences)

---

## 1. Context

### 1.1 What AIE A+B Already Does

AIE A+B turned the system from a static character template into a **runtime adaptive** companion. The 10 modules in `backend/adaptive/` operate at three timescales:

- **Per-turn** (`signals.py`, `context_classifier.py`, `param_tuner.py`) — every user message is scored for sentiment, emoji density, length, question count, then classified into one of seven conversation contexts (emotional_support, casual_chat, playful_flirty, etc). Sampling parameters (temperature, top_p, presence_penalty) are nudged per context before the LLM call.
- **Per-session / multi-turn** (`behavior.py`, `personalization_gate.py`, `self_critique.py`, `memory_behavior.py`) — engagement trends rolling over recent turns produce a `BehaviorModifier` block injected into the system prompt; a self-critique loop occasionally re-scores responses; a personalization gate guards against over-eager adaptation.
- **Cross-session / long-horizon** (`reflector.py`, `journal.py`, `user_model.py`, `trend_analyzer.py`, `topic_graph.py`, `milestones.py`, `post_scene.py`, `scene_scoring.py`) — periodic LLM-driven reflection writes float preferences into `user_profiles`, multi-session trends update topic graphs, and bond milestones detect relationship inflection points.

All of A+B is **adaptive at inference time** — prompts and parameters are mutated based on observed signals — but the underlying LLM weights and DSPy-style prompt programs do not change. That's Phase C.

### 1.2 The Two Strands of Phase C

Phase C bundles two distinct technical strands that share one underlying premise — *learned* personalization rather than *adaptive* personalization:

- **Strand A — Per-character LoRA fine-tuning.** Train a small low-rank adapter (LoRA) on each character's accumulated chat history. At inference, load the active character's LoRA on top of the base model. Goal: voice, slang, in-jokes, idiosyncrasies sharpen over time without modifying the base model or shipping per-character full-weight checkpoints.
- **Strand B — DSPy prompt optimization.** Replace hand-tuned prompt strings inside the prompt-heavy adaptive modules (`context_classifier`, `param_tuner`, `personalization_gate`, `self_critique`, plus the reflection prompts in `reflector.py`) with DSPy `Module`s and let an optimizer (likely MIPROv2 as of 2026) tune their few-shot examples and instructions against an objective.

### 1.3 Why Bundle A and B Into One Phase

Both strands flip the system from "we wrote the rules" to "the system learned the rules." They share the same prerequisites:

- A feedback signal pipeline (so A has eval data and B has an optimization target).
- A privacy/consent surface (chat history → training data is the same trust ask in both cases).
- Local-only ML compute (so neither sends user data anywhere).

They don't, however, share a single library or runtime — Strand A is a Python training script that runs occasionally; Strand B is a Python module that runs continuously inside `backend/adaptive/`. We can do one without the other; we should not skip the shared scaffolding.

### 1.4 Hardware Reality Check

Per `MEMORY.md` (User Hardware): M2 Pro 32GB (no CUDA, MPS available but limited), RTX 3070 8GB VRAM (entry-level training viable), RTX 5080 16GB VRAM (comfortable training). LM Studio Link can route inference between the three.

- **M2 Pro (Mac)**: inference + DSPy optimization are fine. LoRA *training* on Apple Silicon via MLX or PEFT-on-MPS is technically possible but slow and quirky for instruction-tuning (KV cache + gradient memory chew through unified memory). **Recommend: Mac is eval/optimization-only for Strand A.** Training jobs must run on a CUDA box.
- **RTX 3070 (8GB)**: LoRA on 7B-class base models is the comfortable ceiling. 13B requires aggressive QLoRA + 4-bit quant + small batch + grad checkpoint. Unsloth helps a lot here; vanilla PEFT marginal.
- **RTX 5080 (16GB)**: 13B LoRA comfortable; 14B-class doable; 30B+ needs QLoRA tricks. This is the recommended training rig.

---

## 2. Strand A — LoRA Fine-Tuning Per Character

### 2.1 Goal

Each of the 13 builtin characters gets its own LoRA adapter trained on the user's accumulated chat history with that character. At inference time, the active character's adapter is hot-loaded onto a shared base model. Result: Sakura's LoRA captures Sakura's voice; Yuki's captures Yuki's. Idiosyncrasies (preferred sentence length, signature phrases, in-jokes with the user) sharpen over weeks of use.

This is the *learned-voice* feature — qualitatively distinct from prompt engineering or RAG.

### 2.2 Tooling Comparison

| Tool | Pros | Cons | Verdict |
|---|---|---|---|
| **PEFT (HuggingFace)** | De facto standard, broadest model support, well-documented, easy `model.load_adapter()` for serving | Slow on small VRAM without extra tricks; not optimized for batch fine-tunes | Fallback if Unsloth doesn't cover our chosen base |
| **Unsloth** | 2-5x faster, ~half the VRAM of vanilla PEFT, supports Llama / Qwen / Mistral / Gemma families through 2026, "Unsloth dynamic quants" land well on RTX 3070 | Single-GPU only, smaller model coverage than PEFT, has a coupling between trainer and inference path that can bite us | **Recommended for Strand A** — RTX 3070 is the bottleneck; Unsloth's VRAM savings make 7B QLoRA pleasant |
| **axolotl** | Config-driven YAML pipeline, good for batch jobs, multi-GPU friendly | Heavyweight setup, opinionated, more friction for "13 quick LoRAs" workflow | Defer — overkill for this scope |
| **LoRAX (Predibase)** | Multi-LoRA serving — load N adapters and route per request — directly relevant since we have 13 characters | Inference server, not a trainer; would replace LM Studio for Strand A inference path | Worth a serious look in **Standard / Full** tiers if hot-swap latency in LM Studio Link proves bad |
| **LM Studio Link (existing repo)** | Already integrated, hardware-aware routing, no new infra | LM Studio's REST API does not expose adapter loading; the `lms` CLI hints at LoRA support but is not stable for programmatic per-request adapter switching as of early 2026 | Use for inference **only** if we accept restarting / reloading the model when characters switch — bad UX for fast switching |

**Recommendation:** **Unsloth for training** (write LoRA weight files to disk), **PEFT-on-vLLM or LoRAX for serving** during real use, with LM Studio falling back to "load base, prepend stronger system prompt" when the user is on Mac-only or Link can't reach a training-rig peer. This split lets us decouple "where do we train" from "where do we serve."

### 2.3 Base Model Lock-In

LoRAs are bound to the exact base model they were trained against — sometimes even tokenizer revision matters. We have three strategies:

| Strategy | Effort | UX | Verdict |
|---|---|---|---|
| **A. Lock to one base** (e.g., Qwen 2.5 7B Instruct or Llama 3.1 8B Instruct) | Low | User must keep that model installed. "Voice mode" requires it. | **Recommended for MVP and Standard.** Honest about the constraint. |
| **B. Per-(character × base model) Cartesian** | Catastrophic — 13 chars × N bases × hours each | Best UX, no constraint | Reject. The arithmetic is unacceptable. |
| **C. Lock for voice, free for content** | Medium | Two-mode UX: "voice-faithful" (locked base + LoRA) vs "general" (any base, no LoRA) | **Recommended for Full tier.** Settings toggle, default voice-faithful. |

Choosing the locked base is itself a research call. As of 2026: Qwen 2.5 7B Instruct is the leading open model in the 7B class for instruction following + multilingual; Llama 3.1 8B is the best-supported. Either is a reasonable lock. **Recommendation: Qwen 2.5 7B Instruct** (smaller VRAM, better at character voice in early A+B logs, per the user's hardware mix).

### 2.4 Data Pipeline

Source: `messages` table in `app.db` (already exists, populated by every chat session). Pipeline:

1. **Filter** by `char_id`. Drop OOC turns, system messages, low-importance turns (we have an importance score from A+B).
2. **Pair** consecutive `(user, assistant)` turns into instruction-tuning samples. Optionally include the prior turn as context.
3. **Format** as `chat_template`-compliant JSONL (Qwen / Llama chat format).
4. **De-duplicate** near-identical pairs (Levenshtein or embedding cosine). Heavy dedup matters — repeated "good morning / good morning" pairs will dominate gradient.
5. **Hold out** ~5% for the eval set (see 2.6).
6. **Privacy gate** — pipeline runs only if `privacy_settings.allow_finetune = 1`. Default OFF. Visible UI toggle.

Estimate: a heavy user with 6 months of daily Sakura chats might have 5K-15K turn pairs. After filter+dedup, 1K-5K usable. That's enough for a small LoRA (rank 16-32) — not enough to train from scratch, plenty to nudge a base toward a voice.

### 2.5 Inference Integration Seam

The integration question depends on serving choice:

- **PEFT path** (Python): `transformers` + `peft.PeftModel.from_pretrained(base, adapter_path)` inside a FastAPI worker. Add a new adapter `backend/llm/adapters/peft_local.py`. Hot-swap = swap PEFT adapter object.
- **LoRAX path**: stand up LoRAX server alongside LM Studio. Existing `openai_compat.py` adapter can hit it with an extra `model=<character_id>` header.
- **LM Studio path**: deferred until LM Studio's runtime exposes per-request adapter loading. We'd serve the same "voice mode" by reloading models, which is too slow for real chat. **Do not assume this works.**

The cleanest seam is to add a new adapter file rather than modify existing ones (rules say no refactoring `server.py`).

### 2.6 Evaluation

How do we know a LoRA is *better*, not worse?

- **Held-out next-turn perplexity** — automatic, fast, but rewards memorization, not voice quality.
- **LLM-judge "voice match"** — write 30 prompts ("Sakura, what would you wear today?"), run base+LoRA vs base-only, ask a stronger judge model (Claude or GPT-4) to pick the more in-character response. Cheap, noisy, but actionable.
- **Catastrophic forgetting probe** — run base capability suite (e.g., MMLU 100-question slice, simple math, code completion). If the LoRA tanks general capability by >5%, reject it.
- **User-felt** — opt-in A/B in chat: 10% of turns secretly come from base-only; user upvotes/downvotes; long-run win rate is the truth.

Recommend: perplexity + LLM-judge gate for promotion, catastrophic-forgetting probe as a hard guardrail, user-felt A/B as the long-run signal in the Full tier.

### 2.7 Cost Estimate (1 character, RTX 3070, Qwen 2.5 7B QLoRA)

- **Disk**: ~50-200 MB per adapter (rank 16-32, fp16). 13 chars = 1-3 GB total.
- **VRAM during training**: ~6-7 GB peak with Unsloth + 4-bit base + grad checkpointing.
- **Wall-clock**: 30-90 minutes for 1-3K turn pairs, 3 epochs, batch 1-2 with grad accum 8. RTX 5080 cuts this in half.
- **Re-train cadence**: Standard tier suggests weekly. 13 chars × 60 min × 1/wk = ~13 GPU-hours/week. Low on a dedicated rig.

---

## 3. Strand B — DSPy Prompt Optimization

### 3.1 Goal

Replace hand-written prompt strings inside the prompt-heavy adaptive modules with DSPy `Module`s. Compile them with an optimizer against a feedback objective. The system literally rewrites its own internal prompts to maximize whichever signal we choose.

### 3.2 Where DSPy Plugs In

`backend/llm/context_assembler.py` is the natural assembly point but is *not* the right wrapping target — it's already non-prompty. The right targets are the modules that *call* an LLM with a templated prompt:

- `backend/adaptive/context_classifier.py` — currently rule-based; a DSPy `Predict` module would be a clean upgrade.
- `backend/adaptive/self_critique.py` — has the most explicit critique-prompt; obvious DSPy `ChainOfThought` candidate.
- `backend/adaptive/reflector.py` — periodic reflection; large templated prompt; high payoff but high cost (runs less often).
- `backend/adaptive/personalization_gate.py` — judging when to *not* personalize; great DSPy use case (small structured output).
- `backend/adaptive/param_tuner.py` — currently rule-based; a DSPy Predict could replace heuristics if we have feedback data.

Recommendation: start DSPy on `context_classifier` only — small, focused, easy to evaluate.

### 3.3 Optimizer Choice

| Optimizer | Strengths | Weaknesses | Recommended For |
|---|---|---|---|
| **BootstrapFewShot** | Simple, fast, low compute | Plateaus quickly | Sanity-check / first run only |
| **MIPROv2** | Joint instructions + few-shot search, current SOTA in DSPy 2.5+ as of late 2025 | More compute, more hyper-parameters | **Standard tier default** |
| **COPRO** | Instruction-only, lighter than MIPRO | No few-shot tuning | Useful when feedback dataset is tiny |
| **GEPA** (gradient-free + evolutionary, 2025 paper) | Better when budget is tight | Newer, less proven in DSPy mainline | Watch list — likely the right choice in Full tier if it's stable in DSPy by build time |

> **Verify before commit:** DSPy ships fast. The plan should re-check the optimizer landscape with Context7 the week implementation starts.

### 3.4 Training Signal — Hybrid Architecture (Locked Decision)

**The user has locked the design here:** combine explicit (UI) and implicit (behavioral) signals, weight them against each other, and let the user toggle each source independently for privacy preference. This means the feedback subsystem becomes a first-class part of the platform — not a Strand-B-only add-on.

#### 3.4.1 Signal Sources

| Source | Signal type | Strength | Cost | When recorded |
|---|---|---|---|---|
| **Explicit 👍** under message | Positive | Strong (intentional click) | Low (one row to DB) | On click |
| **Explicit 👎** under message | Negative | Strong | Low | On click |
| **Regenerate-rate** | Negative (implicit) | Strong | Free (already recorded) | On user-initiated regenerate |
| **Reply length / turn after** | Mild positive | Weak (confounded) | Free | On next user message |
| **Conversation continuation** | Mild positive | Weak | Free | At session boundary |
| **Voice-mode toggle on** | Mild positive (engagement) | Weak | Free | On voice-mode entry |
| **Session length delta vs baseline** | Positive | Medium | Free | At session end |
| **Session-end abrupt close** | Mild negative | Weak | Free | At session end |
| **LLM judge** | Either | Medium (calibration drifts) | Local-LLM compute | Async batch job |

#### 3.4.2 Weighting

Per-message scalar score `s ∈ [-1.0, +1.0]` computed as a weighted sum, then normalized:

```
s_explicit  =   +1.0 if 👍 clicked
                -1.0 if 👎 clicked
                 0.0 otherwise
s_implicit  =   sum_over_implicit_signals( weight_i * value_i )
                where weight_i and value_i are per-signal calibrated constants
                stored in `aie_signal_weights` table

s_final     =   alpha_explicit * s_explicit  +  alpha_implicit * s_implicit
```

Default weights at MVP launch (subject to revision after first DSPy optimizer run):
- `alpha_explicit = 0.7` (when explicit signal present)
- `alpha_implicit = 0.3` (always present)
- Per-implicit-signal weights: regenerate -0.5, reply length +0.1, voice toggle +0.15, session continuation +0.1, abrupt close -0.05, judge ±0.2

When the user has not clicked 👍/👎 on a message, `alpha_explicit = 0` and the score relies entirely on implicit signals.

#### 3.4.3 Privacy Modes (User-Controlled)

Stored in `config.feedback_signals` as a single object with two booleans + a metadata field:

```typescript
{
  explicit_signals_enabled: true,   // show 👍/👎 UI + record clicks
  implicit_signals_enabled: true,   // record regenerate, length, etc.
  // derived: if both false → DSPy optimizer disabled, prompts stay hand-tuned
}
```

Four resulting modes:

| Mode | Explicit | Implicit | DSPy active? | Notes |
|---|---|---|---|---|
| **Full feedback (recommended default)** | ON | ON | YES | UI visible, behavioral data also used. Best optimizer signal. |
| **Explicit-only (high-privacy)** | ON | OFF | YES | UI visible, no behavioral tracking. Slightly noisier optimizer (clicks are sparse). |
| **Implicit-only (low-friction)** | OFF | ON | YES | UI hidden, behavioral data still used silently. Optimizer functional but slower convergence. UX is uncluttered. |
| **Off** | OFF | OFF | NO | No feedback collected. Adaptive prompts remain hand-tuned. Phase B Strand B yields no benefit; user has explicitly opted out of personalization-via-prompts. |

**Privacy stance**: implicit signals are ON by default (consistent with existing AIE A+B implicit data — `signals.py`, `user_model.py` already record behavioral patterns). The new UI toggle in Settings → Privacy makes this transparent and reversible. **No new implicit signals are silently added beyond what AIE A+B already records.**

#### 3.4.4 Storage Schema (proposed v72 migration)

```sql
-- Per-message feedback (explicit + computed implicit score)
CREATE TABLE IF NOT EXISTS message_feedback (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  explicit_signal INTEGER,             -- nullable: -1 (👎), 0 (neutral seen), +1 (👍), NULL (no interaction)
  implicit_score REAL,                 -- computed at session end, range [-1.0, +1.0]
  final_score REAL,                    -- weighted combination
  computed_at TEXT NOT NULL,
  signal_version INTEGER NOT NULL DEFAULT 1
);

-- Tunable per-implicit-signal weights (admin-editable, not user-facing)
CREATE TABLE IF NOT EXISTS aie_signal_weights (
  signal_name TEXT PRIMARY KEY,
  weight REAL NOT NULL,
  updated_at TEXT NOT NULL
);
```

`config` table gains `feedback_signals` JSON column for the per-user privacy mode.

#### 3.4.5 UI Surface

- **Hover-only icons** under each AI message bubble (👍 / 👎). Visual weight: ghosted at 30% opacity until hover, full opacity on hover, persisted at full opacity once clicked.
- **Click latches** (single-click toggles, second click clears). User can change mind.
- Settings → Privacy pane gets a new "Feedback Signals" subsection w/ two switches: "Show feedback buttons" (controls explicit) + "Allow implicit feedback collection" (controls implicit), plus a clear explainer paragraph.
- No badges, no nag, no "rate this conversation" overlay. Feedback is opt-in-by-clicking, not solicited.

#### 3.4.6 Why This Is the Right Architecture

1. **Defense in depth**: explicit signals are clean but sparse; implicit signals are abundant but noisy. Combining them gets the best of both. Industry-standard recsys pattern (YouTube, Spotify, Netflix all do this).
2. **User control over data flow**: privacy-conscious users can show only the UI buttons; minimal-friction users can hide the UI but keep the behavioral data flowing. Both modes still give DSPy a working signal.
3. **Backward-compatible with AIE A+B**: implicit signals already collected by `backend/adaptive/signals.py` get a clean home in `message_feedback.implicit_score`. No new tracking is invented; existing tracking is *surfaced* and made toggleable.
4. **Per-message resolution**: the score lives on `message_id`, not `session_id` — DSPy can train against fine-grained pairs of (input_context, response, score), the canonical training shape.

#### 3.4.7 Implementation order across tiers

- **Phase 0 (prereq for ANY tier)**: build the feedback subsystem — schema, UI, settings, weighting math. ~2-3 days. This is now part of Phase 0 across MVP / Standard / Full because all three rely on the optimizer signal.
- **MVP**: collect signals; defer DSPy optimizer until Standard tier. Just record + display the data on a debug dashboard.
- **Standard**: wire DSPy to consume `message_feedback.final_score` for `context_classifier` only. First optimizer run.
- **Full**: extend DSPy to all 5 prompt-heavy adaptive modules + add weight calibration pass.

### 3.5 Tooling

DSPy is Python-only and lives entirely in `backend/`. **This is not a frontend feature.** The frontend's only Strand B touch is the optional 👍/👎 UI in Full tier.

### 3.6 Cost

DSPy optimizer runs are LLM-inference-heavy, not GPU-training-heavy. MIPROv2 with default budget on a `context_classifier`-sized task burns ~5K-50K LLM calls. With local Qwen 2.5 7B at ~30 tok/s on the 5080, a single optimizer run is ~30-90 minutes of wall-clock and ~$0 in cash. Re-running monthly is cheap.

---

## 4. Three Scope Tiers

> **Phase 0 (prereq for ALL tiers, ~2-3 days, 16-24h):** build the hybrid feedback subsystem from Section 3.4 — `message_feedback` + `aie_signal_weights` tables (schema v72; Visual Content MVP holds v71), `config.feedback_signals` JSON column, hover 👍/👎 UI under AI message bubbles, Settings → Privacy "Feedback Signals" subsection with two toggles, weighting math in `backend/adaptive/feedback.py`. This must ship before any tier that consumes a DSPy signal can train. The MVP tier below uses Phase 0 only to *collect* data for later tiers; Standard and Full tiers consume the score.

### MVP — ~3 days (24-30h, plus Phase 0)

- Strand A only.
- One character (Sakura).
- One locked base (Qwen 2.5 7B Instruct).
- Manual training script (`scripts/train_character_lora.py`); no scheduler.
- Hand-run eval (perplexity + 30-prompt LLM-judge).
- New `peft_local` adapter, gated by a config flag.
- No DSPy.
- **Decision gate after MVP:** does Sakura's voice audibly sharpen? If yes, expand to Standard. If no, kill the strand and reroute to memory-side improvements.

### Standard — ~7-10 days (56-80h, plus Phase 0)

- Strand A: all 13 characters, locked base, automated weekly retrain via a backend scheduler.
- Strand A inference: hot-swap LoRA on character switch (PEFT path).
- Strand A eval harness with regression detection (catastrophic-forgetting probe).
- Strand A consent UI (Settings → Privacy → "Use chat history to fine-tune voice" toggle, default OFF; separate from feedback-signal toggle).
- Strand B: DSPy on `context_classifier` only, MIPROv2, **trained against `message_feedback.final_score`** (the hybrid signal from Phase 0).
- Telemetry dashboard for both strands (training timestamps, win-rates, regression flags, signal-source breakdown).

### Full — ~3-4 weeks (120-180h, plus Phase 0)

- Strand A: per-(character × locked-base) for 2 base models (lets users on smaller GPUs use a 3B-class base while bigger rigs use 7B). **NOTE:** locked-decision-1 picked single base for MVP/Standard; Full tier optionally relaxes that.
- Strand A: LoRAX-based serving for sub-second character switches.
- Strand A: online RL signal collection wired to retrain priority (re-train chars whose recent win rate slipped).
- Strand B: DSPy across all 5 prompt-heavy adaptive modules.
- Strand B: weight calibration pass — refine `alpha_explicit` / `alpha_implicit` and per-implicit-signal weights against held-out validation set.
- Strand B: held-out replay set for regression detection.
- Eval harness for both strands integrated into release-test pipeline.

---

## 5. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Catastrophic forgetting** — LoRA degrades base capabilities | High | Capability probe gate before promotion; reject any LoRA that drops MMLU-slice >5% |
| **Voice drift across characters** — mid-session character switch shows seams | Medium | Hot-swap path (PEFT or LoRAX), or fall back to base when switching |
| **Privacy / consent** — chat history → training | High | Default-OFF toggle, explicit copy ("Your chats stay local; training also stays local"), one-click data wipe re-run |
| **Hardware fragmentation** — Mac users get worse experience | Medium | Mac path = inference-only on a peer-trained LoRA via Link; if no peer, base-only with prompt-heavier voice instructions |
| **DSPy optimizer overfits** | Medium | Held-out validation set; regression check vs current rule-based baseline; rollback path |
| **Retraining cost as data grows** | Low | Cap training data per char at recent N turns (e.g., last 5K); incremental adapters not full retrains in Full tier |
| **LM Studio Link can't hot-swap LoRAs** | Medium | Confirmed: serving LoRAs via LM Studio is not viable for fast switching — bypass it for voice mode and use PEFT/LoRAX |
| **User installs new "favorite" base model** | Medium | Document the lock-in clearly; offer "bake to base" tool that mid-merges LoRA into a single full-weight checkpoint for power users |
| **Optimizer / DSPy version churn** | Low | Pin DSPy version; re-validate before each release |

---

## 6. Open Questions

### Resolved (2026-05-06)

1. ~~**Single locked base, or two-base split?**~~ → **Single locked base** (Qwen 2.5 7B). See Section 3.3.
2. ~~**How aggressive on M2 Pro?**~~ → **Full feature** — train on Windows, serve everywhere via PEFT. See Section 1.4 + Section 2.5.
3. ~~**Add 👍/👎 buttons (Phase 0 prereq)?**~~ → **Yes**, plus hybrid implicit-signal architecture with user-controlled per-source toggles. See Section 3.4 in full.

### Still Open

1. **Tier preference?** MVP (3d, prove it works), Standard (7-10d, real feature), Full (3-4w, flagship), or Defer (ship Visual Content in Chat first).
2. **Data consent — opt-in or default-on with opt-out?** Recommend opt-in for Strand A (using chat history for training is sensitive). Note: implicit-signal collection for Strand B is governed by the new `feedback_signals` privacy mode (Section 3.4.3) and is default-on (consistent with existing AIE A+B).
3. **Pause AIE A+B follow-up work while Phase C is built, or run in parallel?** (Memory Browser cleanup + Visual Content in Chat are the next-up items per `MEMORY.md`.)
4. **Strand B: start with `context_classifier` (current rule-based), or `self_critique` (already LLM-driven, easier signal)?** Both are defensible; default to `context_classifier` for MVP-of-B.

---

## 7. Critical Files (For The Future Implementer, Not For This Doc)

### Strand A

| Action | Path |
|---|---|
| NEW | `backend/adaptive/finetune/__init__.py` |
| NEW | `backend/adaptive/finetune/corpus_builder.py` (filter + dedup + format from `messages`) |
| NEW | `backend/adaptive/finetune/trainer.py` (Unsloth wrapper) |
| NEW | `backend/adaptive/finetune/eval_harness.py` (perplexity + judge + capability probe) |
| NEW | `backend/llm/adapters/peft_local.py` |
| NEW | `scripts/train_character_lora.py` |
| MODIFY | `backend/preflight.py` — `migrate_to_v73()`: `character_loras(char_id, base_model, adapter_path, trained_at, eval_score)`. NOTE: v71 reserved by Visual Content MVP; v72 reserved by Phase 0 feedback subsystem (`message_feedback`, `aie_signal_weights`, `config.feedback_signals`); Strand A's character_loras table = v73. |
| MODIFY | `backend/server.py` — append endpoints under `# --- ADAPTIVE INTELLIGENCE ---`: training-status, wipe-loras, force-retrain |
| MODIFY | `requirements.txt` — add commented-out `# torch`, `# transformers`, `# peft`, `# unsloth`, `# datasets` (Strand A is opt-in install) |

### Phase 0 — Feedback Subsystem (prereq for Strand B at any tier)

| Action | Path |
|---|---|
| NEW | `backend/adaptive/feedback/__init__.py` |
| NEW | `backend/adaptive/feedback/signal_collector.py` — collect explicit clicks + implicit signals (regenerate-rate, reply length, voice toggle, session length, abrupt close) |
| NEW | `backend/adaptive/feedback/scorer.py` — weighted-sum math from Section 3.4.2; reads `aie_signal_weights` |
| NEW | `backend/adaptive/feedback/judge.py` — async LLM-judge job (optional, off by default) |
| MODIFY | `backend/preflight.py` — `migrate_to_v72()`: `message_feedback`, `aie_signal_weights` tables + `config.feedback_signals` JSON column. NOTE: this is the FIRST Phase C migration and lands BEFORE Strand A (whose v73 follows). |
| MODIFY | `backend/server.py` — POST `/api/feedback/explicit/{message_id}` (record 👍/👎); GET/POST `/api/feedback/preferences` (read/write privacy mode) |
| NEW | `frontends/sakura/src/components/FeedbackButtons.tsx` — hover-only 👍/👎 under message bubble; latches; calls api.recordFeedback |
| MODIFY | `frontends/sakura/src/components/DialogueBubble.tsx` — slot FeedbackButtons under each AI message, gated by `config.feedback_signals.explicit_signals_enabled` |
| MODIFY | `frontends/sakura/src/views/SettingsView.tsx` — Privacy pane: "Feedback Signals" subsection w/ two switches + explainer |
| MODIFY | `frontends/sakura/src/lib/api.ts` — `recordFeedback`, `getFeedbackPreferences`, `setFeedbackPreferences` typed wrappers |
| MODIFY | `frontends/sakura/src/lib/types.ts` — `FeedbackSignals` config type, `MessageFeedback` record type |

### Strand B (after Phase 0)

| Action | Path |
|---|---|
| NEW | `backend/adaptive/dspy_modules/__init__.py` |
| NEW | `backend/adaptive/dspy_modules/context_classifier_dspy.py` |
| NEW | `backend/adaptive/dspy_modules/optimizer_runner.py` (run MIPROv2 against `message_feedback.final_score`; save compiled program) |
| MODIFY | `backend/adaptive/context_classifier.py` — feature-flagged switch between rule-based and DSPy versions |
| MODIFY | `backend/preflight.py` — `migrate_to_v74()`: `dspy_compiled_programs(module_name, version, signature_json, fewshot_json, compiled_at, optimizer, score)`. (v72 = feedback Phase 0; v73 = Strand A character_loras; v74 = DSPy compiled programs.) |
| MODIFY | `requirements.txt` — add commented-out `# dspy-ai` |

---

## 8. Research & Documentation References

- Prior research baseline: `docs/research/2026-03-29-adaptive-intelligence-research-part-1.md` (Section 1 "On-Device Fine-Tuning", Section 6 "DSPy Deep Dive with GEPA Optimizer", Section 18 "Implementation Priority Matrix").
- Existing AIE spec: `docs/plans/2026-03-29-adaptive-intelligence-spec.md` — declares "Phase C — Advanced (no schema changes)" placeholder; this scoping doc is the long-form follow-up.
- Hardware reality: `MEMORY.md` → User Hardware section.
- Privacy precedent: `backend/preflight.py` v60 `privacy_settings` table — Strand A's consent toggle should land here, not as a new table.
- Bidirectional link: add to `MEMORY.md` AIE section after this doc is reviewed:
  `Phase C scoping: docs/plans/2026-05-06-aie-phase-c-scoping.md (pending tier selection)`.

---

## 9. Honest Uncertainties

The doc commits where it can and flags where it can't:

- **Unsloth coverage in 2026** — recommendation depends on Unsloth still leading on RTX 3070 QLoRA at implementation time. Re-check before commit.
- **MIPROv2 vs GEPA vs whatever ships next** — DSPy moves quickly; the actual optimizer choice should be re-verified via Context7 the week we start Strand B.
- **LM Studio adapter loading** — claim "not viable for hot-swap" is based on Q1 2026 state. If LM Studio ships per-request adapter loading by the time we build, the LoRAX path becomes optional, not required.
- **Catastrophic-forgetting threshold** — "5% MMLU drop" is a placeholder. Real threshold should be set after MVP eval data lands.
- **Strand B objective function** — the recommended signal mix is plausible, not proven. MVP-of-B should probably ship two signal-mix variants and let A/B data decide.
