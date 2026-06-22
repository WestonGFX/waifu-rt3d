# Session Handoff — 2026-06-22

## Branch: master · HEAD `96a9feb` · ALL PUSHED (0 unpushed)
## Test Status: 3154 backend pytest (+33 this session) · 498 vitest · tsc clean

No active `OPEN BUG` / `UNFIXED` / `BLOCKER` markers. Push gate clear.

## What this session did — Stage 3 AI Motion (DART)

Picked up the active in-repo thread (Stage 3 Phase 2) via `/go` and went broad at
Chris's request ("do all these things"). 9 commits, all pushed.

1. **Phase 2 COMPLETE — `tools/dart_to_glb.py`** (`1214e09`). DART SMPL-X `.npz`
   (axis-angle `poses (162,165)` + `trans`, 30fps) → per-VRM-bone three-vrm
   **normalized** quaternion GLB, played via the viewer's proven `retargetClip` path.
   - Frame **measured**, not guessed: ran a real SMPL-X forward pass on the box →
     SMPL rest is Y-up template, the posed sequence is Z-up (AMASS) via `global_orient`.
   - Conversion = rigid stand-up `G_pre=Rx(-90°)` on the **root (hips) only**;
     children keep their raw SMPL local (the rigid root rotation cancels in the FK
     chain). **The first attempt conjugated every bone → she rendered lying on her
     side; the render gate caught it** → fixed to root-only + a regression test.
   - Render gate PASS: 22/22 tracks, upright, grounded, arms track, zero eversion.
2. **Hardening** (`4e7f9e7`): generated + gated **wave** (clean arm-wave, correct
   reach — the 16° SMPL-rest-arm offset is empirically a non-issue) and **turn**.
   Converter generalizes across locomotion / gesture / yaw.
3. **`--face-camera`** (`c9369dd`): auto-yaw so generated clips face the user.
4. **Pre-baked gesture library** (`7eaa2e5`): `backend/motion/dart_gesture_library.json`
   (8 gestures mapped to Kokoro emotion/intent triggers) + `tools/build_dart_gestures.py`.
   All 8 render-gated clean. **Zero runtime GPU** — the pragmatic bridge to usable
   AI gestures now. GLBs gitignored/regenerable.
5. **Phase 3 ENGINE** (`9ec261e`): `backend/motion/dart_runner.py` — resident-model
   DART wrapper (load once, ~1.3s/clip), DART imports lazy so it's Mac-importable.
   **Live-verified on the box** (nod-head clip → npz → GLB → gate). +4 Mac pytest.
6. **Docs** (`a2a9489`, `96a9feb`): Phase 3 networked-service design grounded in
   `motion_server.py`/`remote_client.py`; Phase 6 EMAGE stand-up scoping (license-gated).

## Verification done
- `dart_to_glb` render-gated on 11 clips total (walk/wave/turn/nod + 8 gestures):
  upright, grounded, arms track, zero eversion. Screenshots in
  `docs/testing/screenshots/2026-06-22-stage3-dart/`.
- `dart_runner` generation live-verified on the RTX 5080 (resident model).
- 3154 backend pytest green; tsc clean.

## Next session (gated)
1. **Phase 3 networked service** — needs the waifu repo deployed to the box as a
   persistent daemon in the `dart` conda env (waifu + DART both importable). Then wire
   `motion_server` AI branch → `DartRunner` → clip-artifact, `remote_client` decode →
   `dart_to_glb` → `/files` URL, `api.ts` mirror, `/status` advert, live round-trip.
   Full design: `docs/research/2026-06-22-stage3-phase3-design.md`.
2. **Phase 5.1 emotion→motion** — wire `dart_gesture_library.json` triggers into the
   Kokoro/embodiment seam.
3. **Phase 6 EMAGE** — resolve CC BY-NC-SA license intent, then stand up (separate
   session). Plan: `docs/research/2026-06-22-emage-cospeech-scoping.md`.

## Box access (reusable)
`ssh rtx5080 "<cmd>"` (cmd.exe). WSL: base64-pipe with escaped double quotes, OR
`scp file rtx5080:C:/dev/` then WSL reads `/mnt/c/dev/`. cmd line-length limit (~8KB)
kills large base64 inline → use scp for files. conda: `source
/root/miniconda3/etc/profile.d/conda.sh; conda activate dart; cd /root/DART`.
DART generate: `python -m mld.rollout_mld --text_prompt <file|"action*N"> --export_smpl 1
--use_predicted_joints 1 --denoiser_checkpoint ./mld_denoiser/.../checkpoint_300000.pt`.
