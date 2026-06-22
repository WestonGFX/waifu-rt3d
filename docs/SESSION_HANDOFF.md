# Session Handoff — 2026-06-22 (session "b" — Stage 3 Phase 5.1 + Phase 3)

## Branch: master · HEAD `8c642d5` · ALL PUSHED (0 unpushed)
## Test Status: 3166 backend pytest (+12) · 514 sakura vitest (+4) · tsc clean

No active `OPEN BUG` / `UNFIXED` / `BLOCKER` markers. Push gate clear.

## Completed This Session

### Stage 3 Phase 5.1 — emotion→motion gap-fill gestures (pushed `f0bf3bd..96328a4`)
- New `frontends/sakura/src/lib/dartGestures.ts`: maps Kokoro per-turn `emotion` →
  a pre-baked DART gesture (excited/proud→cheer, frustrated→cross_arms, sleepy→
  stretch, playful→shrug; gentle/common emotions intentionally unmapped). Tunable
  map + `DART_GESTURE_COOLDOWN_TURNS=3` + `dartGestureUrl`/`resolveDartGesture`.
- `viewerStore.dispatchDartGesture(name)` — load-then-play the normalized-VRM GLB
  via the gate-proven `loadAnimation`/`playAnimation` retarget path (`dart_`-prefix,
  VRM-only, cleared on model load).
- **Firing policy (Chris chose): gap-fill + throttled** — `dispatchKokoroEmbodiment`
  Step 4 fires ONLY when the LLM picked no explicit gesture, the emotion maps, and
  the cooldown elapsed. Explicit Kokoro gestures keep using the proven Mixamo clips.
- No viewer.html change. +12 vitest. Render-gated `cheer` upright/grounded.

### Stage 3 Phase 3 — DART networked service, LIVE round-trip verified (pushed `96328a4..8c642d5`)
- `57948fc` contract: box `motion_server` `/generate` AI branch → resident
  `DartRunner` → clip artifact `{kind:"clip",format:"npz",npz_b64,…}`;
  `_try_load_ai_backend` loads DART once (lazy import → Mac-importable); `/status`
  advertises `dart`; emotion→prompt + duration→primitives maps + `(prompt,
  primitives,seed)` cache. Mac `remote_client.forward_generate` decodes npz →
  `tools/dart_to_glb` → `/files/animations/dart-generated/<stem>_<sha1>.glb`
  (content-hash dedup) → `{kind:"clip",format:"glb",url,…}`. `server.py` forwards
  prompt/seed + passes either union arm through. `api.ts` mirrors
  `MotionGenerateResponse`; `viewerStore.dispatchClip`/`dispatchMotionResponse`.
  +12 pytest +4 vitest.
- `3f22503` LIVE PROOF: deployed `backend.motion` to the box (`/root/DART/backend/`),
  ran `motion_server` in WSL `dart` env (DART loaded, `/status` `dart:true`),
  round-tripped from the Mac: wave (cached 234ms) + cheer (fresh 818ms), both
  render-gated upright/grounded/22-track/6-of-6-frames
  (`docs/testing/screenshots/2026-06-22-stage3-phase3/`).

### Decision (Chris, this session)
- **Phase 3 is closed as a proven, OPTIONAL capability — do NOT harden the box
  daemon now.** Rationale: live DART is plumbing with no production consumer yet,
  and an always-on RTX box is a heavy dependency for a privacy-first desktop app;
  the pre-baked Phase 5.1 library (GPU-free, offline, instant) is the shipping path.
  Revisit the daemon only if/when novel-motion-on-demand becomes a committed feature.

## Work In Progress
- None. Both phases complete, committed, pushed, tree effectively clean.

## Known Issues / Bugs
- None introduced. Pre-existing: see CURRENT_STATUS "Known Issues" (Live2D runtime,
  embedding model format, Cubism error spam).

## Files Modified (this session, all committed)
- `frontends/sakura/src/lib/dartGestures.ts` (new), `frontends/sakura/src/lib/api.ts`
- `frontends/sakura/src/stores/viewerStore.ts`, `frontends/sakura/src/components/ModelPanel.tsx`
- `backend/motion/motion_server.py`, `backend/motion/remote_client.py`, `backend/server.py`
- tests: `backend/tests/test_motion_phase3.py`, `frontends/sakura/src/test/{dartGestures,viewerStore.dartGesture,viewerStore.clip}.test.ts`
- docs: `docs/plans/2026-06-14-stage3-ai-motion.md`, `CURRENT_STATUS.md`, screenshots

## Uncommitted (intentionally left)
- `.claude/skills/go/SKILL.md` — modified EXTERNALLY (not this session's work; do not commit blind).
- `docs/testing/screenshots/2026-05-31-retarget-proof/*` — transient render-gate scratch output.
- `tools/smplx_grab.mjs` — untracked since the prior session (unused MPI downloader).

## Next Session Priorities (Chris said "move on" — pick by appetite)
1. **Phase 7 CAMDM ambient idle** — the one motion idea that runs ON the M2 itself
   (no box), always-alive idle motion; fits privacy-first ethos. Separate standup.
2. **Phase 6 EMAGE co-speech gesture** — highest research value, but GATED on a
   CC-BY-NC-SA license decision from Chris (prototype-only until resolved).
   Scoping: `docs/research/2026-06-22-emage-cospeech-scoping.md`.
3. **Step out of motion entirely** — core companion surface (Kokoro depth, memory,
   chat UX). No specific task queued; would need fresh scoping.

## Context for Next Session
- **Box DART service is NOT running** — torn down at session end (it was foreground
  inside a held-open ssh; not a durable daemon). The Windows portproxy
  (`0.0.0.0:8081 → <wsl-ip>:8081`) + firewall rule PERSIST, but the WSL IP is
  dynamic (re-point on reboot via `wsl hostname -I`). Full reproducible setup +
  daemon-hardening notes are in the plan status log (2026-06-22 Phase 3 entry).
- The `dart` conda env on the box now also has `fastapi`/`uvicorn`/`pydantic`
  installed (was inference-only).
- Active plan: `docs/plans/2026-06-14-stage3-ai-motion.md` — Phases 1/2/3/5.1 ✓ DONE;
  Phases 5.2 (streaming, sensitive viewer), 6 (EMAGE, gated), 7 (CAMDM) remain.
- Suggested `/clear` before the next (unrelated) task — context is heavy with
  DART/box/WSL detail.
