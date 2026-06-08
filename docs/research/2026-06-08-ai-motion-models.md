# AI Human-Motion-Generation Models — State of the Art (mid-2026)

**Date:** 2026-06-08
**Purpose:** Survey the *current* (2025–2026) landscape of open-source AI human-motion-generation models and judge their fit for Waifu-RT3D's real-time 3D anime avatar pipeline (Three.js + `@pixiv/three-vrm`, VRM characters, existing SMPL/HumanML3D/BVH/Mixamo → VRM retarget pipeline, AnimationDirector playback).
**Hardware reality check (the spine of every recommendation below):** RTX 5080 = 16 GB · RTX 3070 = 8 GB · Mac M2 Pro = **no NVIDIA / no CUDA** (Metal/MPS only). The M2 Pro is the GPU floor.
**Prior picks (older plan):** MotionLCM (~30 ms/seq, the only thing fast enough to feel "live") and MoMask (generate-then-play). This report identifies what is newer/better and re-grades the old picks against current hardware constraints.

---

## Honesty notes up front

- **All published FPS/latency numbers in this survey are measured on an NVIDIA RTX 4090** (or V100). I found **zero verified Apple Silicon / MPS** numbers for any of these models. The "Mac/CPU fallback" recommendations are therefore *structural inferences* (smallest footprint → most likely to run), each flagged **"needs hands-on MPS test."** Do not read them as "confirmed runs on M2 Pro."
- "Open source" ≠ "downloadable today." I separate **code+weights available now** from **promised / paper-only / under review** (this drives prototype-first ordering).
- VRAM numbers, where the repo states them, are quoted. Where absent, I say "not published" rather than guess.

---

## Comparison Table

| Model | Date | License | Output format | Latency (RTX 4090 unless noted) | VRAM | Real-time? | Streaming? | Rotations direct? | Avail. now? | Link |
|---|---|---|---|---|---|---|---|---|---|---|
| **DART / DartControl** | ICLR 2025 (arXiv Oct 2024, v3 2025) | **Apache-2.0** ✅ | **SMPL-X / SMPL-H params** (`global_orient`, `body_pose` = axis-angle **rotations**) | **>300 FPS** gen; 240 FPS w/ RL control; ~0.02 s step | not published (4090-class) | **Yes** | **Yes (online text streams)** | **Yes (axis-angle)** | **Yes** | [GitHub](https://github.com/zkf1997/DART) · [page](https://zkf1997.github.io/DART/) |
| **MotionStreamer** | ICCV 2025 (arXiv Mar 2025) | **MIT** ✅ | 272-dim continuous (no-IK → joints/rot; BVH export) | not published | not published | **Yes (frame-by-frame)** | **Yes (causal AR, variable-length)** | Partial (272-dim, no IK needed) | Partial (some ckpts up; full code in TODO) | [GitHub](https://github.com/zju3dv/MotionStreamer) · [page](https://zju3dv.github.io/MotionStreamer/) |
| **MotionLCM (v1/v2)** | ECCV 2024; **v2 Dec 2024** | research code (MIT-ish; check repo) | HumanML3D-263 (position features → needs SMPL-fit/IK) | **~30 ms/seq (1-step)** | small (distilled LCM) | **Yes (fastest single-clip)** | No (fixed-length) | No (position features) | **Yes** | [GitHub](https://github.com/Dai-Wenxun/MotionLCM) · [v2 blog](https://huggingface.co/blog/wxDai/motionlcm-v2) |
| **MoMask** | CVPR 2024 | **MIT** ✅ | HumanML3D-263 (position features; manual bone-map/rot fitting) | **0.062 s AIT** (avg inference time) | small | Near-real-time (generate-then-play) | No | No (position features) | **Yes** | [GitHub](https://github.com/EricGuo5513/momask-codes) · [page](https://ericguo5513.github.io/momask/) |
| **MOGO** | arXiv Jun 2025 (v4 2026) | not stated (paper) | HumanML3D + RVQ; streamable | **0.37 s/sentence**; near-real-time, infinite-length | not published (830M params) | Near-real-time | **Yes (infinite-length AR)** | No (HumanML3D feats) | **No — "available upon acceptance"** | [arXiv](https://arxiv.org/abs/2506.05952) |
| **Kimodo** | NVIDIA, Mar 2026 (v1.1 Apr 2026) | Apache-2.0 (code); **NVIDIA Open / R&D Model License** (weights; SMPL-X variant **research-only**) | **NPZ with `local_rot_mats` / `global_rot_mats` directly** + joints; SMPL-X→AMASS npz | not published (offline; adjustable diffusion steps) | **~17 GB** full; **<3 GB** w/ CPU text-encoder offload | **No (offline)** | No | **Yes (rotation matrices)** | **Yes** | [GitHub](https://github.com/nv-tlabs/kimodo) · HF: `huggingface.co/nvidia/` |
| **HY-Motion 1.0** | Tencent, **Dec 30 2025** | `tencent-hunyuan-community` (commercial OK **but** EU/UK/KR excluded, 1M-MAU cap, no-train-on-outputs) | SMPL-H (22 joints) | not published | **24–26 GB** ❌ | No | No | unclear | **Yes** | [GitHub](https://github.com/Tencent-Hunyuan/HY-Motion-1.0) · [HF](https://huggingface.co/tencent/HY-Motion-1.0) |
| **OmniMotion-X** | arXiv Oct 2025 | not disclosed | SMPL-X @ 30fps; multimodal (text/music/speech) | not published | not published | unknown | partial (AR diffusion) | SMPL-X (has rot params) | **No (status undisclosed)** | [arXiv](https://arxiv.org/abs/2510.19789) |
| **SoulDance** | ICCV 2025 (ByteDance) | TBD | holistic 3D dance (body+hands+face), RVQ | not published | not published | No (offline dance) | No | — | **No (under ByteDance OSS review)** | [GitHub](https://github.com/xjli360/SoulDance-Official) |
| **CoCoGesture / BEAT2-LLM gesture** | 2024–2025 | dataset GES-X "soon" | SMPL-X co-speech gesture | not published | not published | varies | per-utterance | SMPL-X | dataset pending / partial | [arXiv](https://arxiv.org/abs/2405.16874) · [arXiv](https://arxiv.org/abs/2507.20220) |

---

## Per-model notes

### DART / DartControl — the standout *new* pick for us
- **License:** Apache-2.0 (code **and** model) — the cleanest commercial license in this list. Confirmed on the project page.
- **Why it fits our pipeline best:** it is autoregressive over short "motion primitives" conditioned on a **streaming text input**, so it's the closest thing to "type/think → avatar keeps moving continuously" rather than "generate a fixed clip, then play." Reported **>300 FPS** for generation and **240 FPS** with the RL control policy on a single RTX 4090. (The paper gives aggregate FPS, not a clean per-step ms; "~0.02 s" is a derived ballpark, treat as approximate.)
- **Output = rotations directly.** It emits SMPL-X / SMPL-H body parameters (`gender, betas, transl, global_orient, body_pose`), exportable to `.pkl`/`.npz`. `global_orient`/`body_pose` are **axis-angle joint rotations** → far easier to retarget onto a VRM humanoid rig than position-feature models (no IK fitting step).
- **Caveats:** VRAM not published (assume 4090-class training, but inference is a small AR model — likely fits 16 GB, **needs measurement**). No HF model hub link; weights via the GitHub repo. Trained on BABEL (30 fps) and HML3D (20 fps, SMPL-H).

### MotionStreamer — the streaming experiment
- **License:** MIT. **True streaming-continuous** generation (diffusion-based autoregressive in a *causal* latent space; predicts next pose from variable-length history + incoming text). This is exactly the "not just fixed-length clips" property the brief asks for.
- **Output:** a **272-dim** continuous representation that the authors state converts to joints **without IK** (and a BVH export tool exists). Continuous latents reduce the error-accumulation problem that plagues discrete-token AR models over long horizons.
- **Caveats:** **No latency or VRAM numbers published** anywhere I could find (README, paper page, arXiv) — flagged uncertain. Weights are *partially* up (evaluator, causal TAE, t2m model on HF: `huggingface.co/lxxiao/MotionStreamer`), but the README TODO still lists "Release complete code," so the full streaming pipeline may not be turnkey yet. Processed data is academic-use (AMASS license applies).

### MotionLCM (v1 + v2) — still the single-clip speed king
- **v2 released Dec 12 2024**, improved distillation/compression over v1. **~30 ms/seq in one-step inference** (the number from the older plan still holds and is still essentially unbeaten for single fixed-length clips). Implemented in PyTorch, trained on RTX 4090, tested on V100.
- **Output:** HumanML3D-263 **position features** → requires the repo's SMPL-fitting / IK step to get rotations for VRM retarget. This is the main friction vs DART/Kimodo.
- **Not streaming** (fixed-length). Best used as "instant single gesture/clip" generation, not continuous motion.

### MoMask — fast, mature, MIT
- CVPR 2024, residual VQ-VAE + masked + residual transformers. **0.062 s average inference time** (note: the project brief said "~0.18s/seq" — **discrepancy**; the source AIT is 0.062 s; the 0.18 may have been an end-to-end or older measurement). MIT license (but depends on SMPL/SMPL-X/PyTorch3D which carry their own licenses).
- **Output:** HumanML3D-263 position features; the repo lets you "manually fill in bone mapping and adjust rotations for your own character" — i.e. a manual fitting step, no direct rotation output.
- Small footprint, mature codebase, lots of community forks/colabs → good portability candidate.

### MOGO — promising but not downloadable
- Residual-quantized hierarchical causal transformer, **one forward pass**, **streamable / infinite-length**, **0.37 s/sentence**, **FID 0.038** (best-in-class quality claim among the methods it compares to), 830M params. Conceptually a strong streaming+quality combo.
- **Blocker:** code/weights are "to be made publicly available **upon acceptance**" — as of this survey I could not find a live repo with weights. **Do not plan around it yet;** re-check the arXiv page for a GitHub link.

### Kimodo (NVIDIA) — high-quality offline, rotations direct, but VRAM-tight
- Mar 2026, v1.1 Apr 2026. **Outputs rotation matrices directly** (`local_rot_mats`, `global_rot_mats` in the NPZ) plus posed joints — excellent for retargeting. SMPL-X variant also writes AMASS-compatible npz.
- **License is the catch:** Apache-2.0 code, but weights are under **NVIDIA Open Model License** (SOMA/G1) or **NVIDIA R&D Model License** for the **SMPL-X** variant — the SMPL-X one is **research-only**, not for commercial shipping. For a commercial app, the SOMA-skeleton variants under the Open Model License are the ones to scrutinize.
- **VRAM:** **~17 GB full** → **exceeds the RTX 5080's 16 GB.** But there's a real escape hatch: `TEXT_ENCODER_DEVICE=cpu` drops VRAM to **<3 GB**, which fits the 5080 *and* the 3070 comfortably (at some text-encode latency cost). **Offline (not real-time)** — generate-then-cache only.

### HY-Motion 1.0 (Tencent) — avoid for us (VRAM + license)
- Dec 30 2025, 1.0B-param DiT + flow matching, SMPL-H (22 joints). Genuinely strong quality reputation and handles vague prompts well.
- **Disqualified on hardware:** **24–26 GB VRAM** (Lite = 24 GB, 0.46B). That **does not fit any of our three tiers** even with the documented reductions (`--num_seeds=1`, <30-word prompt, <5 s motion only trim within that envelope). Offline only.
- **License friction:** `tencent-hunyuan-community` — commercial use *is* allowed, **but** the Territory **excludes EU/UK/South Korea**, there's a **1M-MAU** application threshold, a **no-train-on-outputs** clause, and distribution/notice requirements. For a privacy-first commercial companion app with potential EU users, this is a meaningful constraint.

### OmniMotion-X — watch, not usable yet
- Oct 2025. Unified multimodal whole-body generation (text-to-motion, **music-to-dance, speech-to-gesture**, in-betweening, completion, trajectory-guided) standardized to **SMPL-X @ 30 fps** via their OmniMoCap-X dataset (28 MoCap sources). Architecturally the most ambitious "one model for everything." **No code/weights/license disclosed** → paper-only for now.

### Music/audio-to-motion & speech-to-gesture (we have a voice pipeline)
- **SoulDance (ICCV 2025, ByteDance):** music-aligned holistic 3D dance (body+hands+face) via hierarchical residual VQ; builds on EDGE's lineage. **Code under ByteDance internal OSS-compliance review → not released.** Best dance candidate to watch.
- **CoCoGesture (2024–25)** and **Motion-example-controlled co-speech gesture (SIGGRAPH 2025)**: co-speech **gesture** generation in **SMPL-X**, the latter trained on **BEAT2** (60 h SMPL-X full-body, 25 speakers) and LLM-controllable. These map speech → upper-body/hand gestures — directly relevant to making the avatar *gesture while talking* over our voice pipeline. Datasets/weights partially pending (GES-X "soon").
- **Reminder:** these are motion-only; we already have TTS/STT, so the value is the *gesture stream*, not audio synthesis.

### Anime / stylized motion
- The "anime AI" results that surfaced (Anisora/Bilibili, Animon, Hailuo) are **2D image/video generators**, **not 3D skeletal motion** — not usable in a VRM rig. No notable *3D-skeleton* anime-specific generator found; the closest relevant idea is **RSMT (Real-time Stylized Motion Transition)** for stylizing transitions, but that's a 2023 style-transfer method, not a 2025–26 generator. **Practical takeaway:** generate realistic SMPL motion with the models above, then push "anime expressiveness" through our existing retarget/AnimationDirector layer (exaggeration, spring bones, easing) rather than expecting a stylized generator.

### In-browser (ONNX / WebGPU / transformers.js)
- Transformers.js v3 added WebGPU; v4 announced at Web AI Summit 2025. **But there is no published motion-generation model packaged for transformers.js / ONNX-Web today** — the supported task list is NLP/vision/audio/multimodal, not skeletal motion gen. **Conclusion:** in-browser generation is **not viable now**; keep generation server-side (Python backend) and stream results to the viewer iframe. Revisit if someone ports an LCM/MoMask-class model to ONNX.

---

## Recommendations for our pipeline

**Prototype FIRST on the RTX 5080 → DART (DartControl).**
It is the best-aligned *new* model: Apache-2.0 (clean commercial license), real-time (>300 FPS reported), **streaming from online text** (matches the "feel continuous/live" goal that drove the original MotionLCM pick), and — critically — it **outputs joint rotations (axis-angle) directly**, so it slots into our VRM retarget with no IK-fitting detour. First task: clone, measure actual VRAM + per-step latency on the 5080, and wire one SMPL-X→VRM rotation retarget path. This is the highest-leverage experiment.

**Second experiment → MotionStreamer (MIT).**
The only model offering *true* causal, variable-length streaming with a no-IK 272-dim representation. Use it to test "continuous ambient idle/reactive motion" vs DART's primitive-based approach. Risk: latency/VRAM unpublished and full code may not be turnkey yet — timebox it.

**Portable / Mac-M2-Pro fallback → MotionLCM (v2) and MoMask.** *(needs hands-on MPS test)*
These are the smallest, fastest, most mature single-clip generators (MotionLCM ~30 ms; MoMask 0.062 s AIT). They are the most *likely* to run on Apple Silicon / a CPU path, but **every benchmark is CUDA — MPS support is unverified.** Plan a hands-on MPS smoke test before committing. Downside vs DART/Kimodo: HumanML3D position-feature output → you pay the SMPL-fitting/IK step to get rotations for VRM. Best role: "instant one-shot gesture/clip," not continuous motion.

**High-quality offline / generate-then-cache → Kimodo (with caveats).**
Use for pre-baking a library of high-quality clips (rotation-matrix output is a retarget win). Two caveats: (1) **17 GB > 5080's 16 GB → use the `TEXT_ENCODER_DEVICE=cpu` offload (<3 GB)**; (2) for a **commercial** ship, avoid the **SMPL-X (R&D, research-only)** variant — evaluate the SOMA-skeleton Open-Model-License variants instead.

**Avoid for now:**
- **HY-Motion 1.0** — 24–26 GB VRAM fits none of our hardware; plus EU/UK/KR territory exclusion and 1M-MAU clause. Strong model, wrong fit.
- **MOGO, OmniMotion-X, SoulDance** — no public weights yet ("upon acceptance" / undisclosed / under review). Watchlist, not buildlist. MOGO and SoulDance are the two most worth re-checking quarterly (MOGO for streaming+quality, SoulDance for music-to-dance).
- **In-browser generation** — no ONNX/WebGPU motion model exists; keep generation server-side.

**Re-grade of the old picks:** MotionLCM stays valid as the speed/portability baseline. MoMask stays valid (and note the **0.062 s** AIT vs the "~0.18 s" in the old plan — the discrepancy should be reconciled by re-benchmarking on our hardware). The genuinely *new and better* entrant is **DART**, which beats both on the two axes that matter most for us: **streaming/continuous** and **direct rotation output**.

**Cross-cutting retarget insight (#3 in the brief):** the single biggest practical discriminator for our VRM pipeline is rotation-vs-position output.
- **Direct rotations (easy retarget):** DART (axis-angle), Kimodo (rotation matrices).
- **Position features (need SMPL-fit/IK first):** MotionLCM, MoMask, MOGO, MotionStreamer-272 (though MotionStreamer claims no-IK conversion).
Prefer rotation-output models to minimize a fragile IK stage in front of AnimationDirector.

---

## Raw sources (every URL used)

- HY-Motion 1.0 GitHub — https://github.com/Tencent-Hunyuan/HY-Motion-1.0
- HY-Motion 1.0 HuggingFace — https://huggingface.co/tencent/HY-Motion-1.0
- HY-Motion license/territory issue #49 — https://github.com/Tencent-Hunyuan/HY-Motion-1.0/issues/49
- HY-Motion arXiv — https://arxiv.org/pdf/2512.23464
- Kimodo GitHub (nv-tlabs) — https://github.com/nv-tlabs/kimodo
- MotionStreamer GitHub — https://github.com/zju3dv/MotionStreamer
- MotionStreamer README — https://github.com/zju3dv/MotionStreamer/blob/main/README.md
- MotionStreamer project page — https://zju3dv.github.io/MotionStreamer/
- MotionStreamer arXiv — https://arxiv.org/abs/2503.15451
- DART GitHub — https://github.com/zkf1997/DART
- DART project page — https://zkf1997.github.io/DART/
- DART arXiv — https://arxiv.org/abs/2410.05260
- MotionLCM GitHub — https://github.com/Dai-Wenxun/MotionLCM
- MotionLCM project page — https://dai-wenxun.github.io/MotionLCM-page/
- MotionLCM arXiv — https://arxiv.org/abs/2404.19759
- MotionLCM-V2 blog — https://huggingface.co/blog/wxDai/motionlcm-v2
- MoMask GitHub — https://github.com/EricGuo5513/momask-codes
- MoMask project page — https://ericguo5513.github.io/momask/
- MoMask arXiv — https://arxiv.org/abs/2312.00063
- MOGO arXiv (abs) — https://arxiv.org/abs/2506.05952
- MOGO arXiv (html) — https://arxiv.org/html/2506.05952
- OmniMotion-X arXiv — https://arxiv.org/abs/2510.19789
- SoulDance GitHub — https://github.com/xjli360/SoulDance-Official
- CoCoGesture arXiv — https://arxiv.org/abs/2405.16874
- Motion-example-controlled co-speech gesture (SIGGRAPH 2025) — https://arxiv.org/html/2507.20220v1
- Retargeting-free humanoid control (Language→Locomotion) — https://arxiv.org/pdf/2510.14952
- awesome-text-to-motion (survey list) — https://github.com/Zilize/awesome-text-to-motion
- Transformers.js v3 (WebGPU) blog — https://huggingface.co/blog/transformersjs-v3
- HY-Motion deep-dive (license caveats) — https://blog.greeden.me/en/2026/01/19/what-is-hy-motion-1-0-a-deep-dive-into-tencents-open-source-model

---

## Addendum (2026-06-08, deep+wide pass)

This addendum **extends** the report above (it does not replace it). It (1) cracks the "full body waifus" item from the AI Search video the user asked about, and (2) goes wider/deeper on the **MDM (Human Motion Diffusion Model) family** and **co-speech-gesture** models the first pass under-covered. New numbers are cited; uncertainty is flagged inline.

### Part A — The "full body waifus" YouTube segment (Job 1)

**Video:** *"Full body waifus, AI dreams, realtime AI music, open-source Gemini Omni: AI NEWS"* — channel **AI Search** (682K subs), published **June 6, 2026**, ~107K views, video id `CzxqQJOswvo`.

**How it was cracked:** raw youtube.com is JS-rendered (WebFetch returns only the footer); summarize.tech / youtubetotranscript / tactiq / kome / invidious instances all failed (403 / 404 / 502 / blank). The route that worked was the **Jina reader proxy** (`https://r.jina.ai/https://www.youtube.com/watch?v=CzxqQJOswvo`), which returned the full description with all chapter timestamps + links. Cross-checked against the AI Search Substack issue.

**What "full body waifus" actually is — honest framing:** It is AI Search's clickbait title label for the **Bernini** segment, which is the **first content chapter at 0:55**. There is no standalone "waifu" product. Two character-generation items appear:

- **Bernini (0:55)** — `https://bernini-ai.github.io/` · GitHub `https://github.com/bytedance/Bernini` · HF `https://huggingface.co/ByteDance/Bernini-R`. **ByteDance Research, released June 1 2026, Apache-2.0 (weights + inference code, commercial use OK).** A *unified video generation+editing* framework: an MLLM-based semantic **planner** + a **DiT renderer**. Its headline feature is **reference-to-video (R2V)** from up to **5 reference images** (character + outfit + background + props), with Segment-Aware 3D RoPE keeping inputs cleanly separated. The "full body" framing = it generates full-body character *video* from a reference image. **It is a 2D video generator, NOT 3D skeletal/VRM motion.**
- **StreamChar (37:44)** — `https://humanaigc.github.io/StreamChar_page/` · arXiv `2605.25659` (Alibaba HumanAIGC). **Long-horizon streaming character audio-video generation**: an LLM orchestrator emits frame-aligned audio conditions, a joint audio-video DiT does local bidirectional denoising; two-stage distillation; **runs real-time on a single H100**. Also a **2D audio-driven video** model, not a skeletal rig driver.

**Bottom line for us:** Both are **video pixel generators**, so they hit the *exact* disqualifier the first report applied to Anisora/Animon/Hailuo — they do not output VRM bone rotations and cannot drive our `@pixiv/three-vrm` rig. **Net new value for Waifu-RT3D: low** (Bernini could pre-render 2D promo/marketing clips of a character from a reference sheet; StreamChar's *streaming audio→character* orchestration pattern is conceptually interesting for our voice loop but is whole-frame video synthesis, not motion). Neither belongs on the motion-generation buildlist.

*Full chapter list recovered (for the record):* Bernini 0:55 · Deja View (NVIDIA video) 3:43 · PaGeR (3D pano) 5:24 · Magenta Realtime 2 (music) 7:07 · GPT Dreaming 9:46 · **MAMMA** (Max Planck markerless full-body mocap, `mamma.is.tue.mpg.de`) 11:30 · Reve 2 13:04 · Ideogram v4 16:00 · Gemma4 12B 20:24 · Qwen 3.7 Plus 22:43 · Cosmos 3 (NVIDIA world model) 24:50 · RTX Spark 26:37 · Stable Layers 28:14 · Minimax M3 31:19 · Majorana 2 34:17 · WavTTS 36:08 · StreamChar 37:44 · OmniDreams 39:55 · Nemotron 3 Ultra 41:29 · Higgs Audio v3 43:07 · NAVA 44:50 · MAI Thinking 46:43. *(MAMMA is the only other "full-body" item — but it's markerless mocap, not generation.)*

### Part B — MDM family + co-speech gesture (Job 2, expanded table)

All latency/VRAM are vendor/paper numbers on NVIDIA (4090/V100/3060 as noted); **zero verified Apple-Silicon/MPS numbers** exist for any of these — Mac notes are structural inferences flagged "needs MPS test." "Rotations direct?" = does it emit parent-relative joint rotations usable by a VRM humanoid rig without an IK-fit stage.

| Model | Date / venue | License (code / weights / data) | Output format | Speed (GPU noted) | VRAM | Real-time? | Streaming? | Rotations direct? | Avail. now? | Link |
|---|---|---|---|---|---|---|---|---|---|---|
| **MDM** (Tevet et al.) | NeurIPS '22 / ICLR '23 | **MIT** code; deps (SMPL/CLIP/PyTorch3D) own licenses | HumanML3D positions **OR** SMPL thetas (`sample_smpl_params.npy`) | ~0.4 s/sample (50-step model, "20× faster" than 1000-step) | not published | No (offline) | No | **Partial** — can dump SMPL θ (axis-angle) but default pipeline is positions | **Yes** | [repo](https://github.com/GuyTevet/motion-diffusion-model) |
| **MLD** (Motion Latent Diffusion) | CVPR '23 | **MIT** | NPY `(nframe,22,3)` **positions** + SMPL verts | "~2 orders of magnitude faster than MDM" (MDM≈24.7 s/seq on V100 → MLD sub-second) | not published (V100-class) | Near-RT single-clip | No | **No** (positions → IK) | **Yes** (download script + GDrive) | [repo](https://github.com/ChenFengYe/motion-latent-diffusion) |
| **PriorMDM** | SIGGRAPH '24 | research code (MDM-derived) | SMPL-family (uses MDM as prior) | not published | not published | No | No | inherits MDM | **Yes** | [page](https://priormdm.github.io/priorMDM-page/) |
| **OmniControl** | ICLR '24 | **MIT** | HumanML3D positions; **spatial control = joint POSITIONS, not rotations** | not published | not published | No | No | **No** (explicitly positions only) | **Yes** | [repo](https://github.com/neu-vi/OmniControl) |
| **FlowMDM** | CVPR '24 | repo (check; MDM-lineage) | HumanML3D positions; seamless multi-text composition (Blended Positional Encodings) | no postproc/redundant denoise (no clean ms) | not published | No | **Long-form composition** (not online streaming) | No (positions) | **Yes** | [repo](https://github.com/BarqueroGerman/FlowMDM) |
| **MotionDiffuse** | TPAMI '23 | repo (check) | HumanML3D positions | slow (iterative diffusion) | not published | No | No | No | Yes | (mingyuan-zhang) |
| **ReMoDiffuse** | ICCV '23 | repo has LICENSE (check) | HumanML3D positions (retrieval-augmented) | slow (diffusion) | not published | No | No | No | **Yes** | [repo](https://github.com/mingyuan-zhang/ReMoDiffuse) |
| **T2M-GPT** | CVPR '23 | repo (check) | HumanML3D positions (VQ-VAE+GPT) | fast-ish (AR tokens) | small | Near-RT | token-AR (not true online) | No | **Yes** | (Mael-zys) |
| **CAMDM** ⭐ | **SIGGRAPH '24** | **Apache-2.0 (core) / GPL-3 (Unity)** | Mixamo-skeleton character motion (drives a rig; **repr not explicitly documented** — likely local rotations) | **60+ FPS on RTX 3060** | modest (3060-class) | **Yes** | **Yes (autoregressive)** | **Likely yes** (rig-driving; verify) | **Yes** (Unity demo; "any character" inference TBA) | [repo](https://github.com/AIGAnimation/CAMDM) |
| **A-MDM** (Interactive AR MDM) | 2024 (Peng/SFU) | repo (check) | character motion, AR | real-time interactive | not published | **Yes** | **Yes (AR)** | rig-driving | Yes | [page](https://xbpeng.github.io/projects/AMDM/) |
| **CLoSD** ⭐ | **ICLR '25** (Tevet) | repo (MDM-lineage) | physics-sim character control; **DiP** = fast AR diffusion planner (text + target) + RL tracker | autoregressive, closed-loop | **~4 GB inference** (50 GB train) | **Yes** | **Yes (online text + target)** | rotations (physics rig) — but **needs a physics sim in the loop** | **Yes** | [repo](https://github.com/GuyTevet/CLoSD) |
| **ActionPlan** | 2026 | paper-only | streaming motion w/ frame-level action planning | — | — | (claims streaming) | **Yes** | — | **No** (arXiv 2603.13500) | arXiv |
| **EMAGE** ⭐ (co-speech) | **CVPR '24** | code (check); **weights on HF (downloadable)**; **BEAT2 data = CC BY-NC-SA → NON-COMMERCIAL ⚠** | **SMPL-X + FLAME params** (body+hands+**face**) → BVH / ARKit blendshapes | render sped up to ~25 s (offline); not a latency number | not published | No (offline) | per-utterance | **Yes (SMPL-X rotations)** | **Yes** | [repo](https://github.com/PantoMatrix/PantoMatrix) · [page](https://pantomatrix.github.io/EMAGE/) |
| **DiffSHEG** (co-speech) | CVPR '24 | repo (check) | **real-time** speech→holistic 3D expression+gesture (SMPL-X) | **real-time** (streaming, unidirectional) | not published | **Yes** | **Yes (per-frame streaming)** | **Yes (SMPL-X rotations)** | **Yes** | (JeremyCJM/DiffSHEG) |
| **GlobalDiff** (co-speech) | arXiv Nov '25 (2511.10076) | paper-only (no repo found) | co-speech motion in **GLOBAL joint rotations** (decouples hierarchy → less drift) | not published | not published | unclear | per-utterance | **Global** rotations (≠ VRM local — needs global→local convert) | **No** (paper-only) | [arXiv](https://arxiv.org/abs/2511.10076) |

### Per-model notes (new entries)

**CAMDM — the strongest *newly surfaced* real-time pick.** SIGGRAPH 2024, AIGAnimation. A Conditional Autoregressive Motion **Diffusion** model that does **interactive real-time character control at 60+ FPS on an RTX 3060** — and the README explicitly claims it "can be run efficiently on consumer-level GPUs **or Apple Silicon MacBooks**" (one of the *only* MPS-friendly claims in this entire survey — still **needs a hands-on M2 Pro test**, but it's the best Mac candidate found). It works on **any Mixamo-skeleton character** (our retarget pipeline already speaks Mixamo). **Catch:** control is **joystick/WASD + style switch, NOT text** — so it's an *idle/locomotion/ambient-motion* engine, not a "type a prompt → gesture" engine. Output representation isn't spelled out in the README (it drives a rig, so almost certainly local bone rotations — **verify before relying on it**). Unity demo ships; the "control any character" *inference* path is still marked TBA.

**CLoSD — best for goal-directed, physically-plausible motion; heaviest to integrate.** ICLR 2025 (Guy Tevet, MDM lineage). Closed loop: **DiP** (a *fast autoregressive diffusion planner* driven by **streaming text + target location**) feeds an **RL tracking controller** in a physics sim. **Inference needs only ~4 GB GPU RAM** — fits the 3070 (8 GB) and possibly M2 Pro. Streaming + text-driven + rotations: on paper a great match. **The catch the headline hides:** it requires a **physics simulator + trained RL imitator in the loop** — that is a heavy integration for a Three.js/`three-vrm` web viewer, not a drop-in like DART. Treat as "highest-quality goal-directed motion, but a real engineering project."

**EMAGE — the single highest-value model the first report MISSED, on *use-case fit*.** We are a **voice companion**; the motion we most need is **gesture *while the avatar talks*** over our existing TTS/STT pipeline — and the first report left that gap open (only CoCoGesture, dataset-pending). EMAGE (CVPR 2024) is a **released** holistic co-speech model: audio → **SMPL-X + FLAME** parameters covering **body + hands + face**, with **downloadable HF weights** (Full Body + Face checkpoint) and BVH/ARKit-blendshape export. SMPL-X params are **rotations**, which retarget onto a VRM humanoid + the face maps to ARKit blendshapes our viewer can consume. **The honesty flag (this is the real blocker):** the **BEAT2 training data is CC BY-NC-SA — non-commercial, research-only** per the EMAGE project page (a newer source claims Apache-2.0; **conflicting — must verify before any commercial ship**). For a *commercial* product the trained weights likely inherit that non-commercial constraint; the clean path is to use EMAGE's *architecture/code* and **retrain on a commercially-licensed gesture corpus**, or treat it as a prototype-only/offline-prebake tool.

**DiffSHEG — the real-time sibling of EMAGE.** CVPR 2024, **real-time** unidirectional speech→holistic 3D expression+gesture (SMPL-X rotations). If we want *live* gesture-while-talking (vs EMAGE's offline pass), DiffSHEG is the streaming candidate. Same SMPL-X→VRM retarget; verify its training-data license too (gesture corpora are the usual commercial trap).

**MLD / MDM / OmniControl / FlowMDM / ReMoDiffuse — the classic MDM lineage, mostly position-output + offline.** All MIT/clean-ish code, all mature, all **HumanML3D position features** (→ need an SMPL-fit/IK step for VRM rotations) and **none are streaming**. **MLD** (MIT) is the fastest of the classics (~100× MDM, sub-second) and the best "instant single clip" portable fallback alongside MoMask/MotionLCM from the first report. **MDM** can optionally dump SMPL θ (axis-angle rotations) but its default eval pipeline is positions. **OmniControl**'s spatial control is **positions only — explicitly not rotations** (per the paper), so its "control any joint" doesn't buy us a rotation shortcut. These are baselines, not new wins.

**GlobalDiff (2511.10076) — interesting idea, not a free rotation win.** It's the first co-speech model to diffuse in **global** joint-rotation space (decoupling the kinematic chain to kill end-effector drift). But **global rotations ≠ VRM-ready local/parent-relative bone rotations** — you'd add a global→local conversion. Paper-only (no repo found). Watchlist.

### Updated "what to prototype first"

The first report's ordering **still stands** — nothing here dethrones **DART** as the #1 *text-to-motion* pick (Apache-2.0, streaming-from-text, >300 FPS, axis-angle rotations direct, no physics sim needed). CAMDM/CLoSD are **same-lineage and complementary**, not strictly superior on our three axes (streaming text + direct rotations + clean commercial license). The genuinely new, additive findings:

1. **DART (unchanged) — prototype FIRST** for prompt/think → continuous motion. (See first report.)
2. **EMAGE / DiffSHEG — prototype SECOND, NEW track.** This is the biggest *gap* the first pass left: **co-speech gesture for our voice loop.** EMAGE for an offline "gesture-while-talking" prototype (released, SMPL-X rotations + face), DiffSHEG if we need it live. **Gate on the BEAT2 non-commercial license** — prototype freely, but plan to retrain on a commercial corpus before shipping. This track is higher product value for an *emotional voice companion* than another text-to-motion model.
3. **CAMDM — prototype for ambient/idle + the Mac story.** Best candidate for "always-moving idle/locomotion" and the **only model with an explicit Apple-Silicon claim** — schedule the M2 Pro smoke test here first. Note: joystick/style control, not text.
4. **CLoSD — watch / spike later.** Best goal-directed + physically-plausible motion (~4 GB inference), but the physics-sim+RL integration is a real project; defer until idle + gesture tracks land.
5. **MLD — add to the portable fallback set** (MIT, ~100× MDM) next to MotionLCM/MoMask.

**Cross-cutting (rotation-vs-position, updated):**
- **Direct rotations (easy VRM retarget):** DART (axis-angle), Kimodo (rot matrices), **EMAGE/DiffSHEG (SMPL-X)**, **CAMDM/CLoSD (rig-driving, verify repr)**.
- **Positions → need IK first:** MLD, MDM (default), MoMask, MotionLCM, OmniControl, FlowMDM, ReMoDiffuse, MOGO.
- **Global rotations → need global→local convert:** GlobalDiff.

### Raw sources (Addendum)

- AI Search video (id CzxqQJOswvo) — https://www.youtube.com/watch?v=CzxqQJOswvo
- AI Search video description via Jina reader — https://r.jina.ai/https://www.youtube.com/watch?v=CzxqQJOswvo
- AI Search Substack issue — https://aisearch.substack.com/p/minimax-m3-ideogram-v4-bernini-gemma4
- Bernini project page — https://bernini-ai.github.io/
- Bernini GitHub (ByteDance, Apache-2.0) — https://github.com/bytedance/Bernini
- Bernini-R weights (HF) — https://huggingface.co/ByteDance/Bernini-R
- StreamChar project page — https://humanaigc.github.io/StreamChar_page/
- StreamChar arXiv — https://arxiv.org/abs/2605.25659
- MAMMA (markerless mocap, Max Planck) — https://mamma.is.tue.mpg.de/
- MDM GitHub (MIT) — https://github.com/GuyTevet/motion-diffusion-model
- MDM arXiv — https://arxiv.org/abs/2209.14916
- MLD GitHub (MIT) — https://github.com/ChenFengYe/motion-latent-diffusion
- MLD arXiv — https://arxiv.org/abs/2212.04048
- PriorMDM page — https://priormdm.github.io/priorMDM-page/
- PriorMDM arXiv — https://arxiv.org/pdf/2303.01418
- OmniControl GitHub (MIT) — https://github.com/neu-vi/OmniControl
- OmniControl arXiv — https://arxiv.org/pdf/2310.08580
- FlowMDM GitHub — https://github.com/BarqueroGerman/FlowMDM
- FlowMDM arXiv — https://arxiv.org/html/2402.15509v1
- ReMoDiffuse GitHub — https://github.com/mingyuan-zhang/ReMoDiffuse
- CAMDM GitHub (Apache-2.0 / GPL-3) — https://github.com/AIGAnimation/CAMDM
- CAMDM project page — https://aiganimation.github.io/CAMDM/
- CAMDM arXiv — https://arxiv.org/abs/2404.15121
- A-MDM project page — https://xbpeng.github.io/projects/AMDM/index.html
- CLoSD GitHub (~4GB inference) — https://github.com/GuyTevet/CLoSD
- CLoSD arXiv (ICLR 2025) — https://arxiv.org/abs/2410.03441
- ActionPlan arXiv — https://arxiv.org/html/2603.13500
- EMAGE / PantoMatrix GitHub (weights on HF) — https://github.com/PantoMatrix/PantoMatrix
- EMAGE project page (BEAT2 CC BY-NC-SA) — https://pantomatrix.github.io/EMAGE/
- EMAGE arXiv — https://arxiv.org/html/2401.00374v5
- DiffSHEG (real-time co-speech) — https://arxiv.org/pdf/2503.09942 (Cosh-DiT context); DiffSHEG CVPR 2024
- GlobalDiff (global-rotation co-speech) arXiv — https://arxiv.org/abs/2511.10076
- Motion Generation survey (2026) — https://arxiv.org/pdf/2507.05419
