# Plan: Stage 3 — On-the-Fly AI Motion (Claude-driven, remote GPU)

**Date:** 2026-06-14
**Branch off:** `master` (fresh `feat/stage3-ai-motion` when Phase 1 starts touching code)
**Parent plan:** [`docs/plans/2026-05-31-avatar-motion-staged.md`](2026-05-31-avatar-motion-staged.md) — Stage 3 section (lines 98–104). This file is the dedicated execution plan for that stage.
**Author intent (user, 2026-06-14):** "plan out stage three so that *you* (Claude, not me) can get it done" — agentically, on the RTX box, with the user doing as little hands-on as possible.

---

## Soul / Why

Stage 1 gave the avatar real mocap clips. Stage 2 put her in a room and let her walk it. Stage 3 is the leap from *replaying* canned motion to *generating* motion on the fly — she moves in response to what's happening in the conversation, never frozen, never looping the same 28 clips. For an emotional companion this is the difference between a puppet and a presence. The motion must be **conditioned on her psychology** (Kokoro dials → how big, how fast, how reachy the movement is), not random.

This stage is **GPU-gated**: the M2 Pro has no CUDA, so generation runs on the **RTX 5080 (16 GB)**. The whole point of this plan is to make *Claude* able to do that work on a machine Claude can't normally touch.

---

## Decisions locked (2026-06-14 planning session)

1. **Execution mechanism: escalation ladder.**
   - **Bootstrap (one-time, GUI-gated): Chrome Remote Desktop**, driven by Claude over CDP where possible (precedent: `tools/mixamo_grab.mjs` drove the user's logged-in Chrome over CDP :9222). Used only to perform the GUI clicks that enable a CLI path (turn on OpenSSH Server, approve any GPU-driver / firewall dialog).
   - **Primary dev path: SSH from THIS Mac session.** Once OpenSSH Server is up on the Windows box, Claude runs git / Python / CUDA / Blender on the 5080 directly from this chat via `ssh rtx5080 "<cmd>"`. CLI-native, scriptable, free, single session.
   - **Fallback: Claude Code installed on the Windows box.** If SSH can't be made to work, the user launches `claude` on the RTX machine and Claude works natively there from a task brief.
   - **NOT chosen: cloud GPU** — staying on local hardware (privacy-first ethos; the box already exists).
2. **First prototype target: DART** (then EMAGE, then CAMDM — user priority `1>2>3`). DART is Apache-2.0 (clean commercial license), streaming text→motion, >300 FPS reported, and **outputs joint rotations directly (axis-angle SMPL-X/SMPL-H)** — no IK-fitting detour. It de-risks the *entire* server + rotation-injection + hardware-routing path with the cleanest-licensed model. The rotation-injection harness it forces us to build is **reused by EMAGE and CAMDM**.
3. **Integration order: generate-then-play FIRST, true-streaming SECOND.** Phase 3 ships an MVP that generates a DART clip → converts to a normalized VRM GLB → plays through the **already-proven** `loadAnimation`/`playAnimation` path (zero new viewer surface). Only after that works do we add the continuous-streaming viewer path (Phase 5). This reuses the Bug-2 normalized-rotation pipeline and keeps the #1 sensitive area (viewer.html) untouched for as long as possible.
4. **Runtime stays the existing motion-server architecture.** `backend/motion/motion_server.py` already runs on the Windows box, auto-discovered by the Mac over UDP (`beacon.py` + `remote_client.py`). The AI backend is a stub today (`_try_load_ai_backend`, line 275; `/generate` AI branch commented at line 237). Stage 3 fills that stub — it does **not** invent new transport.

---

## Non-negotiable constraints

- **Bug-2 dependency is the spine.** Every AI model here (DART, EMAGE, CAMDM, Kimodo…) outputs bone rotations that must land on the VRM **normalized** rig. That conversion was solved in Stage 1 Bug-2 (CLOSED 2026-06-11, commit `7885320`): `tools/convert_to_normalized.py` + `VRM_BONE_MAP` in viewer.html + the `tools/verify/ground_truth.mjs` harness. **Reuse it. Do not re-derive the normalized↔raw contract by guessing** (that produced three broken bakes before — see retarget-pipeline.md Findings 7–10).
- **Avatar grounding / foot-slide / camera framing is the #1 Known Sensitive Area** (regressed 10+ times). Every generated motion MUST be visually verified via a render gate (`tools/verify/render_clip.mjs --frames N`, or a new `render_motion.mjs`) — never "the math is right."
- **Never edit `viewer.html` and `viewerStore.ts` in the same commit** (tightly coupled — repo rule).
- **No new visible UI chrome** without explicit user approval (dev-gated toggles like the Stage 2b 🚶 walk button are fine).
- **No secrets in the repo.** SSH host config lives in `~/.ssh/config` (user-global), never committed. No box IP / hostname / key in tracked files.
- One commit per sub-step; `pytest` + `tsc` green between steps.

---

## Execution Harness — How Claude Reaches the GPU Box

This is the part the user explicitly asked for. The harness is an **escalation ladder**: each rung is tried in order; we climb only if the rung below fails.

```
┌─ Rung 1: SSH from this session ──────────────────────────┐  ← PRIMARY (target steady state)
│  Mac (this chat) ── ssh rtx5080 "<cmd>" ──▶ Windows 5080  │
│  Claude runs git/python/cuda/blender directly. Free.      │
└───────────────────────────────────────────────────────────┘
        ▲ requires OpenSSH Server enabled on Windows
        │
┌─ Rung 0: Chrome Remote Desktop (CDP-driven) ─────────────┐  ← BOOTSTRAP ONLY (one-time)
│  Claude drives the CRD web client over Chrome CDP to do   │
│  the GUI clicks that enable SSH + approve driver dialogs. │
└───────────────────────────────────────────────────────────┘
        │ if SSH can never be made to work ▼
┌─ Rung 2: Claude Code on the box ─────────────────────────┐  ← FALLBACK
│  User runs `claude` on the 5080; Claude works natively    │
│  there from a handoff brief. Most powerful, two sessions. │
└───────────────────────────────────────────────────────────┘
```

**What Claude can do autonomously vs. what needs the user (honest split):**

| Step | Claude (this session) | User (one-time) |
|---|---|---|
| Power on + network-reachable RTX box | — | ✅ ensure box is on, on the LAN |
| Enable OpenSSH Server on Windows | ✅ via CRD-over-CDP clicks **or** paste-ready PowerShell | ✅ approve UAC/firewall prompt (or paste the one-liner) |
| Add `~/.ssh/config` host + key auth | ✅ writes Mac-side config; generates keypair | ✅ approve the public key on the box once |
| Everything after SSH works | ✅ git clone, conda/venv, CUDA deps, DART run, benchmarks, bakes, wiring | — |

The user's realistic involvement after Phase 0 is **near zero** — power + the one SSH-enable approval. That satisfies "you do it, not me."

---

## Research & Documentation References

- [`docs/research/2026-06-08-ai-motion-models.md`](../research/2026-06-08-ai-motion-models.md) — the model survey driving every pick here (DART/EMAGE/CAMDM/Kimodo, rotation-vs-position, hardware fit). **Read first.**
- [`docs/research/2026-05-31-retarget-pipeline.md`](../research/2026-05-31-retarget-pipeline.md) — Findings 7–10: the normalized-rotation injection contract (Bug-2). The shared prerequisite for all AI motion.
- [`docs/plans/2026-05-31-avatar-motion-staged.md`](2026-05-31-avatar-motion-staged.md) — parent staged plan (Stages 1–4); Stage 1 proved retarget+grounding, this stage rides on it.
- DART: <https://github.com/zkf1997/DART> · <https://zkf1997.github.io/DART/> · arXiv 2410.05260
- EMAGE: <https://github.com/PantoMatrix/PantoMatrix> · <https://pantomatrix.github.io/EMAGE/> (⚠ BEAT2 = CC BY-NC-SA, verify before ship)
- CAMDM: <https://github.com/AIGAnimation/CAMDM> (Apache-2.0 core; Apple-Silicon claim to verify)
- Existing runtime: `backend/motion/motion_server.py`, `beacon.py`, `remote_client.py`, `setup_windows.bat`; hardware detect at `backend/server.py` `/api/hardware` (~1710–1753).

---

## PHASE 0 — Remote Access Bootstrap *(no app code; pure access)*

**Outcome:** Claude can run arbitrary commands on the RTX 5080 from this session and confirm the GPU is visible.

- **0.1 — Establish a CLI path.** Preferred: enable Windows OpenSSH Server. Claude provides the exact elevated PowerShell:
  `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0; Start-Service sshd; Set-Service -Name sshd -StartupType Automatic; New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22`
  Executed either by the user pasting it, or by Claude driving CRD over CDP (Rung 0). The `.agent/skills/powershell-windows` skill may assist command shaping.
- **0.2 — Key auth + host entry.** Generate an ed25519 keypair on the Mac, install the public key into the box's `%ProgramData%\ssh\administrators_authorized_keys` (or user `authorized_keys`), write a `~/.ssh/config` `Host rtx5080` block (HostName = LAN IP, User, IdentityFile). **Not committed.**
- **0.3 — Smoke test (gate).** From this session:
  `ssh rtx5080 "nvidia-smi; python --version; git --version; nvcc --version"` →
  confirm **RTX 5080 / 16 GB visible**, a working Python, CUDA toolkit present (or note we install it), git present. Paste the real output — this is the proof that Rung 1 works.
- **0.4 — Workspace.** Clone the repo on the box (so `backend/motion/` + `setup_windows.bat` are present) to e.g. `C:\waifu-rt3d`, OR a lean `C:\waifu-motion-dev` if a full clone is heavy. Decide based on disk. Set up an isolated env (conda or venv) for DART's deps — **do not** pollute the box's system Python.
- **Gate:** do not start Phase 1 until `ssh rtx5080 "nvidia-smi"` returns the 5080 from this session (or Rung 2 fallback is active with an equivalent proof).
- **Effort (calibrated, AI-assisted):** 1–3 h (Windows SSH cooperation is the variable).

---

## PHASE 1 — DART Prototype on the 5080 *(the highest-leverage experiment)*

**Outcome:** DART generates one motion sequence from a text prompt on the 5080, and we know its real VRAM + per-step latency on *our* hardware (every published number is RTX 4090 — unverified on the 5080).

- **1.1 — Clone + env.** `git clone https://github.com/zkf1997/DART` on the box. Create the conda/venv, install torch+CUDA matched to the 5080 (Blackwell — verify the CUDA/torch build supports it; this is a known sharp edge for new GPUs), install DART requirements, fetch weights per the repo (note: weights via GitHub, no HF hub link).
- **1.2 — Run the reference inference.** Generate a sample motion with the repo's own demo/script. Capture: actual VRAM (`nvidia-smi` during run), wall-clock per-step latency, output file (`.pkl`/`.npz` SMPL-X/SMPL-H params: `global_orient`, `body_pose` axis-angle).
- **1.3 — Record reality.** Write `docs/research/2026-06-14-dart-on-5080.md`: does it fit 16 GB? Real latency vs the >300 FPS claim? Does Blackwell/CUDA cooperate? Any patches needed? This decides whether DART is the runtime engine or a generate-then-cache tool on our box.
- **Gate:** one DART `.npz` of recognizable motion on disk + measured VRAM/latency. If it won't fit 16 GB or Blackwell is unworkable → fall back to MLD/MoMask (portable) for the harness work and re-evaluate DART, **do not spiral** (hypothesis limit).
- **Effort:** 4–10 h (CUDA/Blackwell dep setup is the dominant unknown).

---

## PHASE 2 — Rotation-Injection Harness: SMPL-X → Normalized VRM *(reuses Bug-2)*

**Outcome:** a DART `.npz` becomes a normalized-VRM GLB that the viewer plays grounded, arms tracking, zero eversion — proven by the render gate.

- **2.1 — Map SMPL-X/SMPL-H joints → VRM humanoid bones.** SMPL-X body joints → VRoid `J_Bip_*` names (the space our baked clips already use). Reuse `MIXAMO_BONE_MAP`/`VRM_BONE_MAP` patterns; add an `SMPL_BONE_MAP` if needed.
- **2.2 — Axis-angle → quaternion → normalized space.** DART emits axis-angle; convert to per-bone local quaternions, then through the **proven** normalized conversion (`tools/convert_to_normalized.py` algebra / `VRM_BONE_MAP`). New tool: `tools/dart_to_glb.py` (npz → GLB with normalized `J_Bip_*` tracks, non-humanoid channels stripped) — mirror `convert_to_normalized.py`’s pure-Python GLB approach. Handle root translation/grounding (glue y to floor like the Stage 2b walk).
- **2.3 — Render gate (mandatory).** Run the generated GLB through `tools/verify/render_clip.mjs --frames 4 --retarget` (or extend it): distinct frames, upright, grounded, arms track, **zero red-backface eversion**. Screenshots → `docs/testing/screenshots/2026-06-14-stage3-dart/`. If eversion appears, the normalized conversion is wrong — re-check against `ground_truth.mjs`, **don't guess** (Finding 9 lesson).
- **2.4 — Pytest** for `dart_to_glb.py` (track count, humanoid-node filter, no NaN quats), mirroring `test ` patterns for `convert_to_normalized.py`.
- **Gate:** one DART-generated motion renders clean in the viewer. This proves the whole AI→avatar path end-to-end.
- **Effort:** 4–8 h.

---

## PHASE 3 — Wire DART into the Motion Server (generate-then-play MVP) *(fills the stub)*

**Outcome:** the Mac app asks the Windows motion server for a motion by text/emotion; the server runs DART, returns a normalized GLB (or a URL to it); the viewer plays it via the existing path. No new viewer surface yet.

- **3.1 — DART runner module** on the box: `backend/motion/dart_runner.py` — `load_model(dir)` + `generate_clip(prompt|emotion, duration, params) -> npz`, called from the `_try_load_ai_backend` / `/generate` hooks that are stubbed today (`motion_server.py:237`, `:275`). Keep procedural as the instant fallback (architecture already does this).
- **3.2 — Extend `/generate`** to return either keyframes (procedural, today) **or** a generated GLB artifact (DART). Define the response contract once; mirror any Pydantic shape the Mac consumes into `frontends/sakura/src/lib/api.ts` (Pydantic↔TS drift trap). Serve the GLB over the motion server's HTTP, or stream the npz to the Mac and convert there — decide by latency in 1.3/2.2.
- **3.3 — Mac-side client.** Extend `backend/motion/remote_client.py` + the main server's `/api/motion/generate` to request a DART clip when a GPU server advertises the `dart` capability (extend the `/status` capability report — `motion_server.py:163`). Fall back to local clip library when no GPU server is discovered.
- **3.4 — Playback.** Reuse `viewerStore.dispatchLoadAnimation` → viewer `loadAnimation`/`playAnimation` (proven in Stage 2/Phase B). The generated GLB is just another clip URL. **No viewer.html change in this phase** if the artifact is a normalized GLB.
- **Gate:** chat/emotion event → motion server runs DART → avatar plays a freshly generated, grounded clip. Verified live with the box up.
- **Effort:** 4–8 h.

---

## PHASE 4 — Hardware-Tier Routing

**Outcome:** the app automatically picks the right motion source per machine — no manual config.

- **4.1 — Tier-match logic** (detection exists at `/api/hardware` ~`server.py:1710`; the matching does not): **RTX (≥12 GB) → DART live/cache · mid GPU → generate-and-cache · M2 Pro / no GPU → Stage 1 clip library (+ CAMDM idle if Phase 7 lands).**
- **4.2 — Graceful degradation:** GPU server discovered → use it; none → local clips; DART OOM/error → procedural. All paths already exist as fallbacks; wire the selection.
- **4.3 — Surface the active source** in the existing motion stats (Settings), no new chrome.
- **Effort:** 2–4 h.

---

## PHASE 5 — Kokoro Conditioning + (optional) True Streaming *(viewer.html — sensitive, sequential)*

**Outcome:** generated motion is shaped by her psychology, and (stretch) motion can stream continuously instead of clip-at-a-time.

- **5.1 — Dials → motion params.** Map Kokoro Tier-A dials to DART conditioning: energy → amplitude/speed, arousal → gesture reach, confidence/nervousness → posture. Hook where Kokoro embodiment is dispatched (`viewerStore.dispatchKokoroEmbodiment`).
- **5.2 — (stretch) Streaming path.** Add a `StreamLayer` to the AnimationDirector + a postMessage channel that applies per-frame normalized rotations as they arrive (DART is autoregressive/streamable). **This is the only phase that meaningfully touches viewer.html — do it last, alone, with render gates, separate commit from viewerStore.** Generate-then-play (Phase 3) remains the fallback.
- **Gate:** energy-high vs energy-low prompts produce visibly bigger/smaller motion; streaming (if built) holds 60 fps and stays grounded.
- **Effort:** 4–8 h (5.1) + 6–12 h (5.2 streaming, stretch).

---

## PHASE 6 — EMAGE Co-Speech Gesture *(track 2; gated on Phase 2 harness + licensing)*

Gesture *while she talks*, synced to the TTS audio — the highest product value for a voice companion (per research). SMPL-X body+hands+face → reuses the Phase 2 injection harness + maps face to ARKit blendshapes the viewer already consumes.
- **⚠ Licensing gate:** BEAT2 training data is CC BY-NC-SA (non-commercial). **Prototype only** until retrained on a commercial corpus, OR confirm the conflicting Apache-2.0 claim. Resolve before any ship. DiffSHEG is the real-time sibling if live gesture is needed.
- **Effort:** 8–16 h + licensing resolution. Separate session.

---

## PHASE 7 — CAMDM Ambient Idle / M2-Pro Story *(track 3)*

Always-alive idle/locomotion at 60+ FPS; the **only** surveyed model claiming Apple-Silicon support → schedule the M2-Pro MPS smoke test here (could run idle generation on the Mac itself, no GPU box needed for ambient motion). Control is joystick/style, not text → ambient layer, not reactive.
- **Effort:** 4–8 h + the MPS smoke test. Separate session.

---

## Verification (per phase)

Each phase: `pytest backend/tests/ -q` green · `tsc` clean · **render gate** for any motion that reaches the avatar (screenshots committed) · live check with the box up where the phase spans Mac↔box. Phase-end status line appended to this file (append-only).

## Open risks

- **Blackwell (5080) + CUDA/torch** — newest-GPU dep friction is the top Phase-1 risk; may need nightly torch / specific CUDA. Budget for it; cloud-GPU is the escape hatch *only* if the local box proves unworkable (revisit with user).
- **DART VRAM on 16 GB** — inference is a small AR model (likely fits) but unmeasured. Phase 1.2 settles it.
- **Normalized-rotation eversion** — the recurring trap. Mitigated by reusing Bug-2 tooling + the render gate; never guess the constant.
- **Latency for "live" feel** — generate-then-play may feel laggy; true streaming (5.2) is the fix but touches the sensitive viewer. Measure before committing to streaming.
- **EMAGE license** — non-commercial data; prototype-only until resolved.
- **SSH on Windows** — if it can't be enabled, fall back to Rung 2 (Claude Code on the box).

## Total calibrated effort (AI-assisted ~12×)

Core path P0–P5.1: **~20–40 h**. With streaming (5.2): +6–12 h. Tracks 2–3 (EMAGE, CAMDM): +12–24 h, separate sessions. These are calibrated estimates per the project's AI-assisted-velocity convention, not wall-clock.

## Status log

- **2026-06-14 — Stage 3 planned.** Mechanism = CRD-bootstrap → SSH-primary → Claude-Code-on-box fallback (user pick: "4 for now while trying 1 first, 2 as fallback"). First target = DART (user priority 1>2>3: DART→EMAGE→CAMDM). Generate-then-play before streaming. Reuses Bug-2 normalized-rotation harness.
- **2026-06-14 — Phase 0 ✓ DONE. SSH access to the RTX 5080 established, fully agentically.** Drove the Mac → Chrome Remote Desktop → the PC with no user hand-off except a one-time macOS Accessibility toggle for Ghostty (the irreducible OS-security atom). Box identified on the LAN as **`10.0.0.2` / hostname WHITE-TIMBER / user `Eco_5`** (the LLM endpoint `10.0.0.17` is the Mac itself). Enabled OpenSSH Server + firewall + installed key via a self-served PowerShell one-liner run in an elevated shell over CRD. Mac-side `~/.ssh/config` host **`rtx5080`** (User Eco_5, IdentityFile `~/.ssh/rtx5080_ed25519`, both user-global/uncommitted). **Gate proof — `ssh rtx5080` from this session returns: NVIDIA GeForce RTX 5080, 16303 MiB, driver 591.86; Python 3.13.7; git 2.51.0.** Caveats for Phase 1: (a) CUDA `nvcc` dev-toolkit NOT on PATH (driver-only) → use a CUDA-bundled PyTorch wheel; (b) **Blackwell (sm_120) needs cu128+ torch**; (c) system Python is **3.13** (very new — may be too new for DART's pinned deps; plan an isolated env, possibly a 3.10/3.11); (d) no conda (venv it is); (e) default SSH shell is **cmd.exe** (use `&` separators or wrap `powershell -Command`). **NEXT: Phase 1 — clone DART on the box, read its requirements, build an isolated env, measure VRAM/latency on the 5080.**
- **2026-06-14 — Phase 1 IN PROGRESS — Blackwell de-risked (the #1 plan risk, eliminated).** User chose the local WSL2 path. DART's `environment.yml` is Linux/Py3.8/CUDA-11.8 (can't drive Blackwell) so a rebuilt env was required. Steps done on the box, all over SSH: WSL2 Ubuntu-24.04 was registered-but-disk-deleted → `wsl --unregister` + `wsl --install -d Ubuntu-24.04 --no-launch` (fresh). **WSL2 launches over SSH and the 5080 passes through** (`nvidia-smi` in WSL shows it; kernel 6.6 WSL2) — Session-0 worry moot. Installed Miniconda (conda 26.3.2) + build-essential/git; accepted Anaconda channel TOS; conda env **`dart` (Python 3.10.20)**; `pip install torch torchvision --index-url .../cu128`. **GPU proof in WSL: torch 2.11.0+cu128, cuda_available=True, device=RTX 5080, capability=(12,0)=sm_120, 4000×4000 matmul on GPU OK.** Working as root in WSL (single-user dev box). DART repo cloned at Windows `C:\dev\DART` (also reachable from WSL via `/mnt/c/dev/DART`). **NEXT: install `pytorch3d` (easy on Linux) + DART's remaining deps (adapt for torch 2.11 vs its 2.0-era pins), fetch DART weights, run a demo inference → measure VRAM/latency, then Phase 2 (SMPL-X→normalized-VRM via the Bug-2 harness).**
- **2026-06-14 — Phase 1 DART recon + external gate found.** DART cloned to WSL `/root/DART`. Setup = `conda env create -f environment.yml` (CUDA-11.8 pinned → must install deps selectively over the cu128 env). Runtime needs: (1) **model checkpoints + data** from a Google Drive folder (gdown-able, several GB); (2) **SMPL-X + SMPL-H body models** from `is.tue.mpg.de` — **gated behind an MPI account login + license acceptance, NOT present on the box** (searched Downloads/Documents/Desktop/dev). ⚠ **Commercial-license flag:** SMPL-X and the AMASS/BABEL/HumanML3D training data are **non-commercial research licenses** — fine for PROTOTYPING, but a shipped commercial product needs commercial SMPL licensing (Meshcapade) + data-license review. This applies broadly to nearly all SMPL-output motion models (DART/EMAGE/MoMask…), not just DART. **BLOCKER for running DART end-to-end: the SMPL-X/SMPL-H models (need user's MPI account or user download).** Autonomous prep still possible meanwhile: install pytorch3d + DART pip deps, gdown the checkpoints.
- **Agentic-access runbook (for future sessions):** the box is reachable from this Mac via `ssh rtx5080 "<cmd>"` once it's powered on + on the LAN. If SSH ever breaks, re-bootstrap by driving CRD (see [[feedback-drive-mac-agentically-workaround]] memory): macOS Accessibility must be effective for Ghostty (toggle off/on if "not allowed assistive access"); use `cliclick` for mouse, chunked `osascript ... keystroke` (≤8 chars/chunk) or right-click-paste for text; `screencapture` + Read = the vision loop. Codex Computer Use is the fallback driver if Ghostty input is blocked ([[feedback-use-codex-for-agentic-driving]]).
- **2026-06-20 — Phase 1 env ~90% stood up over SSH; only blocker left is user-gated SMPL-X/SMPL-H.** Full reality report: [`docs/research/2026-06-14-dart-on-5080.md`](../research/2026-06-14-dart-on-5080.md). Done autonomously in the `dart` conda env (torch 2.11+cu128): **(a)** installed all 25 demo pip deps clean (smplx, openai-CLIP, einops, hydra, tyro, trimesh, transformers, pytorch-lightning, torch-dct, torchmetrics, scipy, imageio, loralib, pyrender, moviepy, tensorboard, fvcore/iopath, gdown…); **(b)** modern **spacy 3.8.14** + `en_core_web_sm` (dropped the 2.3.4 pin — usage is just `spacy.load()`+`nlp()`, 3.x-clean); **(c)** **pytorch3d full build FAILS** (CPU C++ link error on `gather_scatter_cpu.o`, the flagged Blackwell C++ friction) → sidestepped with a **transforms-only shim** (vendored `pytorch3d/transforms`+`common`, no `_C`; verified `axis_angle_to_matrix`/`matrix_to_quaternion` run). DART's rollout path uses only `pytorch3d.transforms`; `pytorch3d.structures`/`_C` appear only in scene-collision code, not `run_demo`. Shim is also exactly what Phase 2 rotation-injection needs. **(d)** Downloaded + placed model checkpoints: denoiser `checkpoint_300000.pt` (82 MB, **23.13 M params, verified loads under torch 2.11**, num_steps=300000) + mvae `checkpoint_200000.pt` (48 MB) + args.yaml, in the canonical tree (`args.yaml` confirms `mvae_path: ./mvae/mvae_fps_clip/checkpoint_200000.pt`). **(e)** Pre-created the body-model drop-in dirs.
  - **BLOCKER (user):** `utils/smpl_utils.py` calls `smplx.build_layer(body_model_dir=data/smplx_lockedhead_20230207/models_lockedhead/, model_type='smplx', ext='npz')` **at import time** → every demo import dies without the `.npz`/`.pkl` body models, which are MPI-login-gated. User must supply **SMPL-X** (`smplx_lockedhead_20230207.zip`) + **SMPL-H** (`smplh.tar.xz`) → drop into `models_lockedhead/{smplx,smplh}/`. Non-commercial license = prototype-only. **VRAM/latency on the 5080 remain UNMEASURED until then.**
  - **Also pending:** `data/seq_data_zero_male` (norm stats) — public Drive item, gdown-able next session.
  - **Access lessons logged:** WSL cmds need the base64-pipe with **escaped double quotes** (cmd.exe eats `|` inside single quotes); detached box jobs **must** use `nohup` (else SIGHUP on `bash -lc` return); `gdown --folder` chokes on the big `policy_train/` tree → download checkpoints **by file-ID** instead. Harvested file-IDs: denoiser ckpt `1YqWbBEoMCXLvt3CT4yJMFxtuFSCiEnpE`, denoiser args `1_mktoa64Gc8-Mcf3G4u_WeDXxjszj-qE`/`1Gu500bquKUkg35XKTv1vfPVrSS2dJXkx`, mvae ckpt `1s_KsP7CqCd5s8Y2NQ4qQv6xw_jeAEFbx`, mvae args `1MfWZnB1_U1wdrMNJoO-bOc44vMUkmcM7`. **NEXT: user supplies SMPL-X/H → `bash demos/run_demo.sh` → measure VRAM/latency → Phase 2.**
- **2026-06-22 — ✅ PHASE 1 COMPLETE. DART generates text→motion on the RTX 5080.** Full results: [`docs/research/2026-06-14-dart-on-5080.md`](../research/2026-06-14-dart-on-5080.md). **Chris** supplied the one user-gated piece — the MPI SMPL-X body model (`smplx_lockedhead_20230207.zip`, the "removed head bun / locked head" NPZ — NOT the v1.1 models). **Claude** did the rest over SSH: scp'd + extracted the model → `models_lockedhead/smplx/SMPLX_*.npz` (`smplx.build_layer()` verified); patched **numpy-2** removed-alias breaks (`np.float`/`np.int`/… → builtins, 6 files — the last import blocker); downloaded + placed `data/seq_data_zero_male` norm stats + `stand.pkl` by file-ID; ran `mld.rollout_mld` (prompt `"walk in circles*20"`). **Result — measured on the 5080:** peak VRAM **2.8 GB / 16** (huge headroom; the "won't fit 16 GB" risk is dead), 20-primitive diffusion rollout in **~1.3 s (~17 it/s)**, full run 15.8 s incl. one-time model load + CLIP-ViT-B/32 (338 MB) download + SMPL-X export. Output `sample_0_smplx.npz` = `poses (162,165)` axis-angle + `trans (162,3)`, 30 fps, no NaN, real locomotion — **exactly Phase 2's input format**. **SMPL-H NOT needed for the default BABEL/SMPL-X demo** (HML3D variant only; Chris grabbed `smplh.tar.xz` for later). pytorch3d **transforms-shim** sufficed (no `_C` needed in the rollout path). **NEXT → Phase 2:** `tools/dart_to_glb.py` — SMPL-X axis-angle `.npz` → normalized-VRM GLB via the Bug-2 harness, render-gated.
</content>
</invoke>
- **2026-06-22 — ✅ PHASE 2 COMPLETE. DART SMPL-X → normalized-VRM GLB, render-gated end-to-end.** New tool `tools/dart_to_glb.py` + 20 pytest (`backend/tests/test_dart_to_glb.py`). Pulled DART's `sample_0_smplx.npz` (`poses (162,165)` + `trans`, 30fps) to the Mac; measured the SMPL frame from a real SMPL-X forward pass on the box (not guessed): rest is **Y-up template**, posed sequence is **Z-up** (AMASS) because `global_orient` lays the body head-toward +Z. **Conversion (reuses the Bug-2 measured normalized contract):** SMPL-X axis-angle → per-VRM-bone normalized quaternion, with a rigid stand-up `G_pre = Rx(-90°)` applied to the **ROOT (hips) only** (left-multiply); every child bone keeps its raw SMPL local (the rigid root rotation cancels in `W'(parent)⁻¹·W'(child)`). The first attempt conjugated *every* bone by `G_pre` → laid her on her side; the render gate caught it, fixed to root-only. Maps all 22 SMPL body joints (0–21) → 22 `J_Bip_*` humanoid bones; output is an animations-only GLB the viewer's `retargetClip` path ingests directly (rotation-only — root `trans` dropped by that path, so motion is in-place, feet grounded by the VRM rest). **Render gate PASS** (`tools/verify/render_clip.mjs --frames 6 --retarget`): 22/22 tracks, 6/6 distinct frames, upright, grounded, arms track naturally, **zero red-backface eversion** — clean recognizable walk-in-circles. Proof: `docs/testing/screenshots/2026-06-22-stage3-dart/`. SMPL's ~16°-down rest arms vs VRM-horizontal T-pose is a known residual (pure rotation-copy) but renders natural; revisit only if a future clip shows arm drift. `--yaw` exposes the one ambiguous facing DOF (default 0 = data's natural facing). Generated GLBs are gitignored (per-machine runtime assets). 3141 pytest + tsc clean. **NEXT → Phase 3:** wire `dart_runner.py` into the motion server's stubbed `/generate` AI branch (generate-then-play MVP).
- **2026-06-22 — Phase 2 hardening: converter generalizes across motion types.** Generated 2 more DART clips on the box (`wave*8`, `turn left*8`, via `mld.rollout_mld --text_prompt <file> --export_smpl 1`, ~20 it/s) and ran them through `dart_to_glb.py` + the render gate. **wave** = a clean natural arm-wave (hand up beside head, correct reach — the ~16° SMPL-rest-arm offset is empirically a non-issue, no under/over-shoot); **turn** = upright facing-camera rotation. Both: upright, grounded, arms track, zero eversion, 6/6 distinct frames. Confirms the root-only transform + raw-child-local is correct beyond walk-in-circles (locomotion + gesture + yaw). Proof: `docs/testing/screenshots/2026-06-22-stage3-dart/{wave,turn}/`. Note: per-clip facing is arbitrary (set by the clip's `global_orient`) — see the `--face-camera` follow-up.
