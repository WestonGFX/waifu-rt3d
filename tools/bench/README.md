# tools/bench — "Which model + which fix makes Kokoro actually work?"

## The problem in one paragraph

Each chat turn the app asks the AI to also hand back a small machine-readable note:
*"she's feeling playful, make this face, do this gesture, remember this, nudge these moods."*
That note drives her avatar, her mood over time, and her memory writes. In May we measured how often
the model actually produced a note the app could read (**parse_ok**): **0%**. So most of that machinery
never ran on a real setup. This tool measures — for *every model you have installed* — how often each
candidate fix makes it work, **without opening the app**.

## The four fixes it compares

| Code | What happens | Why it might work |
|---|---|---|
| `S0_baseline` | Today's behaviour: the format is *described* in the prompt | Reproduces the problem (control group) |
| `S1_schema` | Same prompt, but the server is **forced** to emit exactly the right JSON shape | The server can't ignore it |
| `S2_split` | She replies normally (voice untouched), then a **second small call** annotates mood/gesture/memory | Keeps her personality intact; works even on "thinking" models |
| `S3_prefill` | The reply is pre-started with `{` | Nudges the model into JSON (experimental; some models mishandle it) |

## What it measures (automatic)

* **parse_ok** — could the app read the note? Target ≥ 80%.
* **clean JSON** — model returned *only* JSON, no chatter.
* **schema ok** — every field valid (real expression/gesture names).
* **nudges in range** — mood changes stayed within ±0.05.
* **leak** — JSON-looking junk showed up in what you'd read (bad).
* **answered** — it replied at all (errors/timeouts count against it).
* speed: seconds per turn and tokens/sec.

Note: even with `S1`/`S2`, LM Studio and Ollama honour the schema's number limits to different degrees — a
forced reply can still contain out-of-range mood nudges (shown as the **nudges in range** column); the app hard-caps them anyway.

It **cannot** judge whether she still *sounds like her* — so the report ends with a **sample sheet** of real replies
for you to skim.

The prompt is the app's real one: Rin's full persona (~3.9K tokens) + the app's explicit-RP style block + the real Kokoro contract appended
at the end, exactly as `context_assembler` does it. A toy prompt would hide the problem.

## Run it (Mac, zsh)

```bash
# 0. Start LM Studio's local server (GUI: Developer tab → Start Server), or headless:
lms server start

# 1. IMPORTANT: models need a context length of at least 8192 (the persona alone is ~3.9K tokens).
#    LM Studio: model settings → Context Length → 8192+.  Also enable "Just-in-time model loading"
#    so the sweep can load each model by itself.

# 2. Dry run — lists the models it found, no model is called:
./run.sh bench --dry-run

# 3. The real sweep (all installed chat models, all 4 fixes, 20 turns each). Long; safe to stop.
./run.sh bench --between-models-cmd "lms unload --all"

# 4. Build the readable report:
./run.sh bench report docs/research/data/bench/<date>-lmstudio.jsonl
```

**Interrupt any time** (`Ctrl-C`). Every result is saved the moment it finishes — re-run the *same command* and it resumes.

### Useful options

| Option | Meaning |
|---|---|
| `--models a,b,c` | Only these model ids (default `all`) |
| `--include REGEX` / `--exclude REGEX` | Filter the model list (e.g. `--exclude "70b"` ) |
| `--strategies S0_baseline,S1_schema` | Only some fixes (S2 makes 2 calls/turn, S3 is experimental) |
| `--turns 5` | Quick smoke test with 5 of the 20 turns |
| `--repeats 3` | Repeat each turn to see how consistent a model is |
| `--temperature 0.8` | Sampling temperature (change here — **no model files to edit**) |
| `--base-url http://localhost:11434` | Test Ollama instead (same tool, same test) |
| `--persona PATH` | Use another character's prompt pack |
| `--rp-style none` | Try without the explicit-RP block (is *that* the culprit?) |

### Ollama

```bash
ollama serve                      # if not already running
./run.sh bench --base-url http://localhost:11434 --dry-run
./run.sh bench --base-url http://localhost:11434
```
Ollama unloads idle models on its own, so no `--between-models-cmd` is needed. Results are labelled `ollama` so the same model name on both backends is compared side by side in the report.

### Sizing for a 32 GB M2 Pro

Roughly: ≤ 14B at 4–6 bit is comfortable; ~20–24B at 4 bit works; 30B+ will swap. A faster first pass:
`--exclude "(30b|32b|70b|72b)" --turns 5`, then the full run on the survivors.

## Files

* `scenarios.py` — the 20 fixed SFW turns · `prompts.py` — builds the app-real prompts
* `client.py` — talks to LM Studio/Ollama through the app's own `OpenAICompatAdapter`
* `metrics.py` — scoring (uses the app's own parser) · `runner.py` — sweep, resume, fail-fast
* `report.py` — Markdown report · tests: `backend/tests/test_bench_harness.py` (run against a fake server)
* Schema used by `S1`/`S2`: `backend/kokoro/response_schema.py` (generated from the parser's own enums)
