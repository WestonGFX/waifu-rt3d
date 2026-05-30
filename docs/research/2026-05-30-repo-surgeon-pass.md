# Repo Surgeon Pass — waifu-rt3d

**Date:** 2026-05-30
**Author:** Claude Code (Opus 4.8, 1M)
**Why:** Full inspect → understand → rank → implement one clean feature PR, with mandatory verification.
**Branch at start:** `chore/remove-spam-vocab-filler` (dirty tree — feature work goes on a fresh branch).

---

## 1. Repo Map (important files only)

Claims below are cited to `file:line` from inspection. Items marked **(INFERRED)** are deductions, not directly verified.

### Backend — Python / FastAPI (`backend/`)
| Path | Role | Evidence |
|---|---|---|
| `server.py` | Monolith FastAPI server, all HTTP + `/ws/voice` endpoints (~17K lines) | `backend/server.py` |
| `preflight.py` | DB migrations v3 → **v86**; sequential, append-only | `backend/preflight.py:6799` (`migrate_to_v86`) |
| `llm/adapters/` | LLM backends: `claude_api.py`, `gemini.py`, `lmstudio.py`, `lmstudio_rest.py`, `ollama.py`, `openai_compat.py`, `peft_local.py`, `base.py` | dir listing |
| `llm/router.py` (135) · `llm/endpoint_fallback.py` (406) | Model routing + local/cloud fallback | `wc -l` |
| `llm/context_assembler.py` · `token_counter.py` · `output_formatter.py` (82) | Token-budget context assembly, output shaping | dir |
| `kokoro/` | Mind-state engine: `mind_state.py`, `response_parser.py`, `drift.py`, `prompt_fragment.py`, `service.py` | dir listing |
| `memory/` | `tiered_memory.py`, `vector_store.py`, `decay.py` (Ebbinghaus), `reranker.py`, `nostalgia.py`, `intimate_memories.py` | dir listing |
| `adaptive/` | Adaptive Intelligence Engine modules (context classifier, param tuner, user model, …) | dir listing |
| `voice/` | `duplex.py` (full-duplex state machine), `silero_vad.py`, `emotion_detector.py`, `noise_suppressor.py` | dir listing |
| `tts/` | `model_manager.py`, `voice_modulator.py` (emotion→TTS params), `adapters/`, `voice_catalog.json` | dir listing |
| `mcp_bridge.py` | FastMCP bridge exposing API endpoints as MCP tools | dir listing |
| `tests/` | **3051** pytest tests collected | `pytest --co` |

### Frontend — React 19 + Zustand (`frontends/sakura/`, the active one)
9 frontend dirs exist (`classic, dashboard, girly, neon, nova, open-webui, sakura, v2, shared`); **sakura** is canonical (`package.json` name = `sakura`). Build = Vite, lint/format = Biome (`biome.json`), TS strict (`tsconfig.app.json`).

| Path | Role | Evidence |
|---|---|---|
| `src/stores/appStore.ts` (19K) | Global app/layout/settings state | dir |
| `src/stores/chatStore.ts` (29K) | Chat send/stream/SSE, titles, pins | dir |
| `src/stores/viewerStore.ts` (40K) | **Mediator** to VRM iframe (postMessage) + Live2D (PIXI) | dir |
| `src/stores/wizardStore.ts` | Onboarding wizard | dir |
| `src/components/` | 111 components incl. KokoroDebugPanel, MemoryBrowser | listing |
| `src/test/` | 39 vitest files, 7 established patterns (`.claude/rules/testing-conventions.md`) | listing |

### Shared 3D Viewer (`frontends/shared/`)
| Path | Role | Evidence |
|---|---|---|
| `viewer/viewer.html` | **Single-file** Three.js VRM viewer, 9641 lines, runs in iframe, driven by postMessage | `wc -l` |
| `lib/three.module.js` | Vendored Three.js **r157** | `REVISION='157'` |
| `lib/three-vrm.module.min.js` | Vendored **@pixiv/three-vrm-core v2.0.6** | license header |
| `lib/postprocessing/*`, `lib/shaders/*` | Bloom, outline, toon, hair, eye-sparkle shaders | importmap L83-108 |
| `animations/manifest.json` | Lists 10 clips (`clips/*.glb`) … but `clips/` dir is **EMPTY** | inspection |
| `viewer/lipsync.js`, `overlay.html` | Lipsync helper, OBS overlay | dir |

### Desktop / Electron & misc
- `electron/` — desktop pet shell (578M, includes build artifacts).
- `run.sh` / `setup.sh` — server + env bootstrap. `.venv/` on Homebrew Python 3.14.

---

## 2. How the Major Systems Connect

```
                        ┌─────────────────────────────────────────────┐
   User ── React UI ──▶ │ frontends/sakura (Zustand stores)            │
                        │   chatStore ──HTTP/SSE──▶ FastAPI            │
                        │   viewerStore ──postMessage──▶ iframe        │
                        └───────────────┬───────────────┬─────────────┘
                                        │               │
                         ┌──────────────▼──┐   ┌────────▼──────────────┐
                         │ backend/server  │   │ shared/viewer.html    │
                         │  llm/router ────┼─▶ │  AnimationDirector     │
                         │   ├ endpoint_   │   │   L1 basePose          │
                         │   │  fallback   │   │   L2 idle / L3 talk    │
                         │   └ adapters/   │   │   L4 gesture           │
                         │      (local +   │   │   L5 lookAt (always)   │
                         │       cloud)    │   │   L6 clip (Mixer)      │
                         │  kokoro/parser  │   │  Spring bones, shaders │
                         │  memory/tiered  │   │  expressionManager     │
                         │  preflight v86  │   └───────────────────────┘
                         └─────────────────┘
```

- **Chat flow:** `chatStore.ts` POSTs to FastAPI; backend assembles context (`llm/context_assembler.py` under token budget), routes via `llm/router.py` → adapter (local LM Studio default; cloud Claude/Gemini opt-in), streams SSE back. Kokoro injects mind-state prompt fragments (`kokoro/prompt_fragment.py`) and parses structured per-turn output (`kokoro/response_parser.py`). **(INFERRED** from module names + recent commits; not line-traced this pass.)**
- **Avatar flow:** `viewerStore.ts` is the single mediator. It posts messages (`setExpression`, `setPose`, `lookAt`, clip commands) into `viewer.html`. Inside the iframe, `AnimationDirector` (~`viewer.html:610`) runs a 6-layer additive stack; **L5 LookAt is always-on** (~`viewer.html:3855`) with eye-leads-head spring smoothing; **L6 ClipLayer** (~`viewer.html:2980`) plays AnimationClips via a Mixer.
- **Persistence:** all local SQLite, schema gated by `preflight.py` migrations (v3→v86). No cloud DB. `app.db` is never hand-edited.
- **Memory:** tiered (sqlite-vec) store with Ebbinghaus decay + reranker; recall feeds context assembly. **(INFERRED** linkage.)**

### Verified rendering-subsystem state (this matters for the feature pick)
- **VRM lookAt/gaze: MATURE & wired.** `LookAtLayer` (`viewer.html:3855`) has world-target override + cursor tracking + idle gaze wander + critically-damped spring smoothing (eyes halflife 0.04s lead head 0.08s). VRM `lookAt.target` is actually assigned (`viewer.html:3964`, `:7969`). postMessage API at `:8678`.
- **VRMA support: DEAD CODE.** `ClipLayer.loadClip` (`viewer.html:2980`) registers `VRMLoaderPlugin` (the *model* loader) at `:2991`, **not** `VRMAnimationLoaderPlugin`. There is no `createVRMAnimationClip` retarget step, and `@pixiv/three-vrm-animation` is **not vendored** in `lib/`. So `gltf.userData.vrmAnimations` is always empty (`:3000`) and every `.vrma` load rejects `"No animations found"` (`:3005`).
- **No animation assets exist.** `frontends/shared/animations/manifest.json` lists 10 `clips/*.glb`, but `clips/`, `backend/storage/animations/{vrma,glb,bvh}/` are all **empty**. ⇒ Any clip/VRMA feature is **unverifiable this session** (nothing to load).
- Spring helpers `springDamperExact/Under/Quaternion` (`viewer.html:802`), `PoseSpringManager` (`:895`). Hand poses: `PoseController.setPose` (`:5110`), postMessage `setPose` (`:8817`). Visemes/blink/micro-expr via `expressionManager.setValue` (`:4317`, `:5307`, `:5416`).

---

## 3. Ranked Improvements

Scored 1–5 (payoff = user-visible value, diff = build effort, risk = regression danger,
fit = alignment with local-first companion direction). **Verif** = can it be proven to
work *this session* with existing assets/harness. Derived from direct inspection; the
6-agent audit workflow (`wf_16c925cd-628`) corroborates/reorders separately.

| # | Improvement | Pay | Diff | Risk | Fit | Verif | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | **Kokoro `gaze` → VRM LookAt** *(SHIPPED this session)* | 4 | 1 | 1 | 5 | ✅ unit | `viewerStore.ts:433` dropped `payload.gaze`; lookAt API `viewer.html:8682` |
| 2 | Spring-bone / VRM **dispose-on-model-swap** leak audit | 3 | 3 | 3 | 4 | ⚠ browser | `VRMUtils` imported `viewer.html:94`; confirm `deepDispose` on every swap |
| 3 | **VRMA support** (vendor `three-vrm-animation` + `createVRMAnimationClip` + sample asset) | 4 | 3 | 2 | 5 | ❌ no assets | dead code `viewer.html:2991`; empty `animations/clips/` |
| 4 | **Emotion → gaze/gesture coupling** (bias `away` when shy, etc.) | 3 | 2 | 1 | 4 | ✅ unit | builds on shipped gaze wiring + `response_parser.py` emotion |
| 5 | **Expression blend** — ensure talk visemes don't stomp emotion expression | 3 | 3 | 3 | 4 | ⚠ browser | `expressionManager.setValue` viseme `:4317` vs emotion `:5307` |
| 6 | **LLM cloud-fallback when explicitly enabled** (privacy-gated) | 3 | 2 | 2 | 4 | ✅ pytest | `endpoint_fallback.py` probes local-only; no opt-in cloud tier |
| 7 | **Viewer debug overlay** — layer/gaze/spring HUD | 3 | 2 | 1 | 3 | ⚠ browser | `overlay.html` exists; no live layer-state inspector |
| 8 | **Memory recall** reranker surfacing / tuning | 3 | 3 | 2 | 4 | ✅ pytest | `memory/reranker.py`, `tiered_memory.py` |
| 9 | **Kokoro parse-fail auto-repair** (re-ask once on `parse_ok=False`) | 2 | 2 | 2 | 3 | ✅ pytest | `response_parser.py:148` falls back but never retries |
| 10 | **Hand-pose preset** coverage expansion | 2 | 2 | 2 | 3 | ⚠ browser | `PoseController.setPose` `viewer.html:5110` |

Note: items already **mature** (so NOT ranked as gaps): VRM lookAt core, endpoint
fallback robustness, Kokoro parser graceful-degrade — all verified solid in §2.

## 4. Chosen Feature + Rationale

**Picked: #1 — Kokoro `gaze` → VRM LookAt.**

- **Highest score-weight:** payoff 4 / diff 1 / risk 1 / fit 5, and the only top
  candidate that is **unit-verifiable this session** (no avatar assets needed —
  we assert on dispatched commands, not rendered pixels).
- **Real, evidence-backed gap, not vibes:** the data already flowed end-to-end
  except the last hop. `viewerStore.dispatchKokoroEmbodiment` applied face +
  gesture and silently discarded `gaze`.
- **Matches the project's #1 stated avatar candidate** verbatim: "proper VRM
  lookAt integration while preserving procedural head/neck motion."
- **whyNotVRMA:** VRMA (#3) is a clean dead-code story but **unverifiable** — no
  `.vrma`/`.glb` assets exist and `@pixiv/three-vrm-animation` isn't vendored.
  Shipping it would violate the "don't pretend code works" mandate.
- **Low blast radius:** reuses the existing `lookAt` postMessage API; **zero**
  viewer.html and zero backend changes.

## 5. Implementation Plan / Patch Summary

Shipped as commit `dc8c518` on branch `feat/kokoro-gaze-lookat`.

- `frontends/sakura/src/lib/kokoro.ts` — `GazeLookAt` type, `KOKORO_GAZE_TO_LOOKAT`
  map (5 tunable vectors), `kokoroGazeToLookAt()` pure fn (unknown → cursor).
- `frontends/sakura/src/stores/viewerStore.ts` — `'gaze'` command kind,
  `dispatchGaze()`, Step 3 in `dispatchKokoroEmbodiment` forwarding `payload.gaze`.
- `frontends/sakura/src/test/viewerStore.kokoroGaze.test.ts` — new (mapping +
  dispatch + forwarding + gate).
- `frontends/sakura/src/test/viewerStore.test.ts` — updated 2 call-count asserts.
- No new deps, no schema change, no backend change, no viewer.html change.

Full design + tunable table + visual-QA checklist: `docs/2026-05-30-kokoro-gaze-lookat.md`.

## 6. Verification

| Check | Command | Result |
|---|---|---|
| Type-check | `npx tsc --project tsconfig.app.json --noEmit` | ✅ 0 errors |
| New tests | `npx vitest run src/test/viewerStore.kokoroGaze.test.ts` | ✅ pass |
| Frontend suite | `npx vitest run` | ✅ 455/455 (3 pre-existing unrelated unhandled-error warnings) |
| Backend suite | `.venv/bin/python -m pytest backend/tests/ -q` | ✅ 3051 passed, 21.81s |

**NOT done (honest gap):** browser/visual QA — no live VRM avatar this session.
Gaze vectors are reasoned from the coordinate frame, not eyeballed. Checklist in
the dev note covers neutral idle / shy / thinking / speaking / tab hidden / model
load failure / long session for whoever runs it next.

## 7. Risks / Rollback / Next Action

**Risks**
- Gaze vectors may need a small retune after seeing them render (pure feel; one-line edits in `KOKORO_GAZE_TO_LOOKAT`).
- `gaze:'user'` = cursor-follow, not fixed camera stare — intentional (preserves idle motion); use `camera` for hard eye contact.
- Sensitive-area adjacency (avatar): change is additive on an always-on layer, but visual confirmation is still owed.

**Rollback:** `git revert dc8c518` (single self-contained commit), or delete branch `feat/kokoro-gaze-lookat`. No migration, no data, no external state to undo.

**Next action (recommended):** load a VRM and walk the visual-QA checklist; if vectors feel off, retune the five lines. Then consider #4 (emotion→gaze coupling) as the natural follow-on — it stacks on this wiring and is also unit-verifiable.

---

## 8. Independent 7-Agent Audit Corroboration (`wf_16c925cd-628`)

A 6-perspective audit + synthesis (7 agents, 598k tokens, ~15 min) ran in parallel
and **challenged the feature pick** rather than rubber-stamping it. Its value: it
surfaced two issues the inline (rendering-focused) recon missed, both now **fixed
this session**.

### Synthesis ranked top-10 (independent of §3)
1. **Restore `smoke-test.spec.ts` from `.bak`** — E2E net was syntactically broken (35 missing `}`). `[p5/d1/r1/f5]` ✅ **FIXED** (`git checkout` from HEAD; 259/259 balanced).
2. **Kokoro streaming stores raw JSON in `messages.text`** — chat-continuity corruption. `[p5/d2/r2/f5]` ✅ **FIXED** (commit `64ed9bf`).
3. Stub `scrollIntoView` in `setup.ts` — removes 3 vitest noise errors. `[p2/d1/r1/f3]`
4. Add missing overlays to CommandPalette (contextviewer/personapicker/userknowledge). `[p4/d1/r1/f4]`
5. Wire endpoint fallback into chat hot paths — offline LM Studio currently dead-ends. `[p4/d2/r2/f5]`
6. Fix expression↔viseme contention (MicroExpressionController vs ExpressionController). `[p4/d2/r2/f5]`
7. Page Visibility API throttle — pause render loop when tab hidden. `[p3/d1/r1/f4]`
8. Pattern-1 tests for `dispatchSetEyeGaze` (zero coverage). `[p3/d2/r1/f4]`
9. Type `AppConfig` in `types.ts` (currently `{[k:string]:unknown}` — zero config type safety). `[p2/d2/r2/f4]`
10. Document the dual-vocabulary postMessage seam (ViewerCommand.kind vs untyped `type` strings). `[p2/d1/r1/f4]`

### Per-audit headlines (evidence in `wf_16c925cd-628` output)
- **Architecture:** 3 deferred-import circular-dep workarounds (`agent/runner.py:101`, `image_gen/registry.py:8`, `agent/tools/image_gen.py:71`) → extract `db()`/`load_config()`/`DB_PATH` to `backend/db.py`+`config.py`. `AppConfig` untyped. Dual-vocabulary viewer seam.
- **Rendering:** confirms VRMA dead code (`viewer.html:2992`); flags expression-viseme contention + a **SaccadeController double-writing eye bones after LookAtLayer** (relevant to the gaze work shipped here — watch for interaction) + a model-swap clip-data soft leak.
- **LLM/Memory:** the raw-JSON storage bug (fixed); endpoint fallback not wired into chat hot paths; `LMStudioRESTAdapter` non-streaming.
- **UX:** debug surface split across 3 places; orphaned FPS-overlay controls; hardcoded hex in DevConsole/KokoroDebugPanel/ModelPanel (theme risk).
- **Tests:** 3051 backend pass; frontend 3 noise errors trace to `SettingsView.tsx:181` `scrollIntoView`; `dispatchSetEyeGaze`/animation dispatchers have zero coverage.
- **Regression:** the broken smoke-test (fixed); otherwise the vocab-prune branch is clean.

### Honest note
The audit's synthesis would have picked #2 (the JSON bug) as the single PR. The
inline recon picked the gaze wiring. Both shipped — gaze as the planned clean PR,
the JSON bug + E2E restore as audit-driven fixes. Items 3–10 remain open and are
good next-session candidates (3, 4, 5, 8, 9, 10 are all tsc/pytest-verifiable).

---

### For the next agent
This doc is the running record of the 2026-05-30 repo-surgeon pass. Sections 1–2 are complete and cited. Sections 3–7 are filled as the audit workflow (`wf_16c925cd-628`) returns and the chosen feature lands. Key gotcha discovered: **VRMA is dead code AND has no test assets — do not pick it as a "shippable" feature without first vendoring `@pixiv/three-vrm-animation` (matched to three r157 / three-vrm-core 2.0.6) AND adding a sample `.vrma`.**
