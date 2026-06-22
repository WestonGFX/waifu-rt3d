# EMAGE co-speech gesture — stand-up scoping (Stage 3 Phase 6)

**Date:** 2026-06-22
**Plan:** [`docs/plans/2026-06-14-stage3-ai-motion.md`](../plans/2026-06-14-stage3-ai-motion.md) Phase 6.
**Companion design:** [`docs/research/2026-06-22-stage3-phase3-design.md`](2026-06-22-stage3-phase3-design.md).
**Status:** SCOPED — a deliberate next-session stand-up, not started in code. Reasons:
new model family (PantoMatrix/EMAGE), multi-GB weights, and a **licensing gate** that
must be cleared before any shipped use.

## Why EMAGE (and why it's worth a dedicated session)

Per the model survey, **gesture-while-she-talks, synced to the TTS audio** is the
single highest product value for a *voice* companion — it's the difference between a
talking head and a present body. DART (Phase 1–3) gives text→motion *clips*; EMAGE
gives *audio→full-body+hands+face* co-speech motion. It reuses our Phase-2 win: EMAGE
outputs **SMPL-X** (body + hands + face), so the **same `dart_to_glb.py` rotation
path applies** to the body+hands, and the **face** maps to the ARKit blendshapes the
viewer already consumes.

## ⚠ Licensing gate (resolve BEFORE any ship — do this first)

- EMAGE is trained on **BEAT2**, whose data is **CC BY-NC-SA (non-commercial)**. The
  code repo (PantoMatrix) carries a more permissive claim — **the conflict must be
  resolved**: confirm whether a commercially-usable checkpoint/data path exists, or
  treat EMAGE as **prototype-only** until retrained on a commercial corpus.
- This stacks on the existing SMPL-X non-commercial flag (Meshcapade licensing needed
  for commercial SMPL output regardless of model).
- **Action:** Chris confirms intent (prototype-only research vs ship path) before any
  weights are downloaded for product use. DiffSHEG is the real-time sibling to
  evaluate if a cleaner license / lower latency is needed.

## Stand-up plan (box-side, mirrors the DART Phase-1 playbook)

1. **Env** — new conda env on the box (or reuse `dart` if deps are compatible; EMAGE
   pins differ, so likely a separate `emage` env). torch cu128 for Blackwell, as with
   DART. Clone `github.com/PantoMatrix/PantoMatrix`.
2. **Weights** — download the EMAGE checkpoint(s) + SMPL-X (already on the box from
   DART: reuse `data/smplx_lockedhead_20230207/...`). Note BEAT2 sample data size.
3. **Smoke test** — run EMAGE inference on a short WAV → SMPL-X sequence; measure VRAM
   + latency on the 5080 (DART used 2.8 GB; EMAGE is larger — verify it fits 16 GB).
   Capture an output `.npz`/`.pkl` and confirm the body-pose layout.
4. **Body+hands → GLB** — adapt `dart_to_glb.py`: EMAGE drives **hands** too (DART
   zeroed joints 22+), so extend `SMPL_BONE_MAP` to the finger joints (25–54) →
   VRM finger bones, or keep body-only v1 and add fingers once the seam is proven.
   Render-gate as always.
5. **Face → ARKit** — map EMAGE's face params (FLAME/expression) to the viewer's
   existing ARKit blendshape channel (the lipsync/expression seam embodiment uses).
6. **Audio sync** — the runtime path is "TTS produces WAV → EMAGE → body+face motion
   played in lockstep with audio playback." This is a new live path (heavier than
   DART clip playback) — design alongside the Phase 3 networked service.

## Effort + sequencing

- **8–16 h + licensing resolution**, genuinely a separate session (new model, weights,
  env, the hands+face seam).
- **Sequence after** the Phase 3 networked service (shared transport/runner patterns)
  OR after Phase 5.1 (emotion→motion), since EMAGE is the co-speech specialization.
- **DiffSHEG** is the fallback/alternative if real-time or licensing pushes us off EMAGE.

## Open decisions for Chris

1. **License intent:** prototype-only research, or do we need a commercial path now
   (changes whether we invest in EMAGE vs a cleaner-licensed alternative)?
2. **Priority vs Phase 3 networked service + Phase 5.1:** which lands first? (Recommend
   Phase 3 service + Phase 5.1 emotion→motion before EMAGE, since the gesture library
   already gives static gestures and EMAGE is the bigger lift.)
