# Stage 3 Phase 3+ — design, grounded in the real motion-server code

**Date:** 2026-06-22
**Author intent:** Chris asked Claude to "maybe do all these things and also ask me questions and also think of more things we can research or do or suggest."
**Plan:** [`docs/plans/2026-06-14-stage3-ai-motion.md`](../plans/2026-06-14-stage3-ai-motion.md) (Phases 3–7). This doc deepens Phase 3 now that Phase 2 is shipped, and surfaces roadmap options + a pragmatic bridge.
**Prereq read:** [`docs/research/2026-06-14-dart-on-5080.md`](2026-06-14-dart-on-5080.md) (DART on the 5080: 2.8 GB VRAM, ~1.3 s/rollout).

## Where we are after Phase 2

DART text→motion runs on the RTX 5080 and `tools/dart_to_glb.py` turns its SMPL-X
`.npz` into a normalized-VRM GLB the viewer plays through the proven `retargetClip`
path. Render-gated on **walk / wave / turn** — upright, grounded, arms track, zero
eversion. `--face-camera` orients generated clips at the user. **The AI→avatar
pipeline is proven end-to-end, offline.** What's missing is the *live wiring*: the
Mac app asking the box for a motion on demand.

## The existing motion-server reality (read 2026-06-22)

- `backend/motion/motion_server.py` (runs on the box): FastAPI. `_ai_backend`
  global (None = procedural; the old placeholder string was `"motionlcm"`).
  - `POST /generate` (`GenerateRequest`: emotion, duration, intensity, loop, label,
    context) → returns **`{label, backend, duration, loop, keyframes, latency_ms}`**,
    where `keyframes` is a list of per-frame **euler bone** dicts from
    `_procedural_keyframes()`. The AI branch is commented out at ~line 238.
  - `GET /status` → capability report `{backend, procedural, motionlcm, ...}`.
  - `_try_load_ai_backend()` startup task — stub; "MotionLCM runner not yet wired".
- `backend/motion/remote_client.py` (runs on the Mac, inside the main server):
  `forward_generate(remote_url, payload)` proxies to the box `/generate` and expects
  the **same keyframe response**; `probe()` / `connect_and_verify()` hit `/status`;
  `MOTION_STATS` feeds the Settings panel.
- `beacon.py`: UDP auto-discovery of the box.

**Key mismatch:** the live contract speaks *euler keyframes*; Phase 2 produces a
*normalized GLB clip*. Phase 3 must reconcile these.

## Decision 1 — response shape: clip artifact, not keyframes (recommended)

Two ways to return DART motion:

- **(A) Clip artifact** — `/generate` returns a normalized GLB (or a URL/npz to one);
  the Mac plays it via the **proven** `viewerStore.dispatchLoadAnimation` clip path
  (same route Phase 2 render-gated). Diverges from the keyframe response → new
  response `kind` + Mac handling, but it is the path we *know* renders clean.
- **(B) Euler keyframes** — convert DART → the existing per-bone euler keyframe
  schema, reuse the transport untouched. BUT the keyframe playback path is the
  procedural one (not the normalized `retargetClip` path), so it re-opens the Bug-2
  eversion risk on full-body AI motion, and euler-per-bone is a lossy detour from
  quaternions. Worse fit.

**Recommend (A).** Phase 2 already produces the clean artifact; reuse the gate-proven
clip path. Extend the response to a tagged union:
`{kind: "clip", format: "glb", url|glb_b64, name, duration, loop, backend, latency_ms}`
and keep `kind: "keyframes"` for the procedural fallback. **Mirror the new fields
into `frontends/sakura/src/lib/api.ts`** in the same change (Pydantic↔TS drift trap).

## Decision 2 — transport: where the SMPL→GLB conversion runs (the plan's fork)

- **(A1) Convert on the box**, serve the GLB over the box's HTTP, return a URL. Mac
  just `loadAnimation(url)`. Needs `numpy` + `dart_to_glb.py` on the box (both present)
  and the box serving files.
- **(A2) Box returns the npz; the Mac runs `dart_to_glb.py`** and serves/loads it
  locally (the Mac already mounts `/files`). **Recommended:** reuses the Mac-side
  tool verbatim (instant, pure-Python), keeps the SMPL/license-encumbered machinery
  on the box, npz is tiny (~45–110 KB), and conversion correctness lives in one place
  we already test. Latency is dominated by DART generation (~1.3 s) either way.

**Recommend (A2).**

## Decision 3 — is live DART a persistent service or a generate-and-cache?

Live DART means the box runs a **persistent** process holding the model in VRAM
(~2.8 GB) after a one-time ~14 s load, then ~1.3 s per clip. Options:

- **Persistent DART inside `motion_server.py`** — `_try_load_ai_backend()` imports the
  DART rollout machinery once; `/generate` AI branch calls a new
  `backend/motion/dart_runner.py::generate_clip(prompt, duration, seed) -> npz_bytes`.
  Clean, matches the existing architecture. Caveat: DART lives in the WSL `dart`
  conda env (Python 3.10 + cu128 + the pytorch3d shim) — the motion server must run
  *inside that env on the box*, not the repo `.venv`.
- **Cache layer** — key generated clips by `(prompt, duration, seed)`; the second ask
  is free. Cheap to add and very effective for a companion (a small recurring gesture
  vocabulary). Recommended regardless.

## Decision 4 — emotion/Kokoro → DART prompt mapping

`/generate` takes `emotion`; DART takes a BABEL/HML3D **text prompt**. Need a mapping
layer: `emotion/intent → DART text` (e.g. "happy" → "wave"/"jump for joy"; "thinking"
→ "scratch head"; "greeting" → "wave"). This is Phase 5.1 (Kokoro conditioning)
territory and is a **product/taste decision** (which emotions map to which motions).

---

## 🌉 Pragmatic bridge (strong recommendation): a pre-baked DART gesture library

We do **not** need the live networked service to get value. DART generation is cheap
and `dart_to_glb.py` works. So:

1. Generate a curated set of companion gestures **once** on the box (wave, nod-yes,
   shake-no, shrug, think, point, clap, bow, idle weight-shift, …).
2. Convert each → normalized GLB with `--face-camera`, render-gate each.
3. Ship them as the avatar's **gesture vocabulary**, played through the existing clip
   path — **zero runtime GPU dependency** for these.

This delivers a usable expansion of the avatar's motion *this week*, validates the
converter at library scale, and de-risks Phase 3 (whose live path then handles only
*novel/dynamic* motion). It mirrors how the Stage-1 Mixamo clips already ship. The
only open input is **which gestures** + how they bind to Kokoro/embodiment triggers.

---

## Roadmap options (from the plan, re-prioritised with what we now know)

| Option | Value | Effort | Notes |
|---|---|---|---|
| **Pre-baked gesture library** (bridge above) | High, immediate | Low (2–4 h) | No live service; needs gesture list from Chris |
| **Phase 3 live wiring** (A2 + persistent DART + cache) | High | Med (4–8 h) | Networked contract; needs box-live verification; Decisions 1–3 |
| **Phase 5.1 Kokoro conditioning** | High (the "soul") | Med | emotion→prompt + dials→amplitude/speed; product taste |
| **Phase 6 EMAGE co-speech gesture** | Highest per research | High | ⚠ BEAT2 CC BY-NC-SA license gate — prototype only |
| **Phase 7 CAMDM idle on M2 MPS** | Med (ambient life) | Med | Only surveyed model claiming Apple-Silicon; could run on the Mac itself |
| **Phase 5.2 true streaming** | Med (latency feel) | High | Touches viewer.html (sensitive); do last, alone |

## ⚠ Commercial-licensing flag (product-level, unchanged)

SMPL-X / SMPL-H + AMASS/BABEL/HML3D are **non-commercial research licenses**. Fine
for prototyping; a shipped commercial product needs commercial SMPL licensing
(Meshcapade) + a data-license review. Applies to essentially every SMPL-output model
(DART/EMAGE/MoMask…). The pre-baked-library and live paths both inherit this — worth
resolving before any motion generated this way ships commercially.

## Open decisions for Chris

1. **Build the pre-baked gesture library next?** (recommended quick win) — if so,
   which gestures? (Claude can propose a starter set of ~8.)
2. **Phase 3 live wiring** — approve response-shape (A: clip artifact) + transport
   (A2: npz→Mac) + persistent-DART-service-in-motion_server? Needs the box up for the
   live round-trip.
3. **Phase 5.1 emotion→motion mapping** — Claude drafts a table, Chris tunes.
4. **EMAGE** — pursue co-speech gesture (highest research value) despite the license
   gate (prototype-only until resolved)?
