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
*(filled after audit workflow synthesis — see §4)*

## 4. Chosen Feature + Rationale
*(filled after synthesis)*

## 5. Implementation Plan / Patch Summary
*(filled during implementation)*

## 6. Verification
*(filled after running checks)*

## 7. Risks / Rollback / Next Action
*(filled at end)*

---

### For the next agent
This doc is the running record of the 2026-05-30 repo-surgeon pass. Sections 1–2 are complete and cited. Sections 3–7 are filled as the audit workflow (`wf_16c925cd-628`) returns and the chosen feature lands. Key gotcha discovered: **VRMA is dead code AND has no test assets — do not pick it as a "shippable" feature without first vendoring `@pixiv/three-vrm-animation` (matched to three r157 / three-vrm-core 2.0.6) AND adding a sample `.vrma`.**
