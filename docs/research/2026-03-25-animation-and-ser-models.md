# AI Models Research: Animation Generation & Speech Emotion Recognition

**Date:** 2026-03-25
**Topic:** Models for desktop AI companion with 3D anime avatars (VRM/Live2D)
**Hardware targets:** Mac M2 Pro (24GB unified), Win RTX 5080 (16GB VRAM), Win RTX 3070 (8GB VRAM)

---

## Category 1: Animation Generation (Text/Emotion to Motion)

These models generate human motion sequences from text descriptions or emotion labels. The output is typically SMPL joint positions/rotations which must be converted through a pipeline: **SMPL -> BVH -> VRM retarget** (using tools like `smpl2bvh` + Three.js `SkeletonUtils.retargetClip()`).

### Summary Table

| Model | Params | Input -> Output | HW Reqs (Inference) | Speed | Quality | License | HF Link | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **MotionLCM** | ~50M (est.) | Text + control signals -> SMPL (nframes, 6890, 3) | ~4GB VRAM (latent space) | **~30ms** per sequence (~200 frames) = **real-time** | SOTA on HumanML3D; ECCV 2024 | MIT | [Blog](https://hf.co/blog/EvanTHU/motionlcm) / [GitHub](https://github.com/Dai-Wenxun/MotionLCM) | **TOP PICK** -- Real-time speed, high quality, active development (V2 Dec 2024) |
| **MDM** | ~20M (8 layers, dim 512) | Text/action -> joint positions (SMPL) | RTX 3080 sufficient; ~4GB VRAM | 2.5s (action) / 12.3s (text) per sequence | ICLR 2023; foundational; good quality | MIT | [Paper](https://hf.co/papers/2209.14916) / [GitHub](https://github.com/GuyTevet/motion-diffusion-model) | Good baseline but too slow for real-time. Use as reference. |
| **EMDM** | ~20M (est.) | Text/action -> SMPL joints | Similar to MDM | **0.02s** (action) / **0.05s** (text) = **real-time** | Comparable to MDM quality | MIT | [Paper](https://hf.co/papers/2312.02256) / [Project](https://frank-zy-dou.github.io/projects/EMDM/) | **STRONG PICK** -- 250x faster than MDM, near real-time |
| **MoMask** | **44.85M** | Text -> motion tokens -> joints (22 joints, 3D, 20fps) | Runs on **CPU** (no GPU needed); 2080Ti: 0.18s | **0.18s** per sequence | CVPR 2024; high fidelity via masked transformers | MIT | [GitHub](https://github.com/EricGuo5513/momask-codes) | **STRONG PICK** -- CPU-capable, fast, high quality, MIT license |
| **T2M-GPT** | ~40M (9 layers, dim 1024) | Text -> VQ-VAE motion tokens -> SMPL | ~4-6GB VRAM (est.) | ~1-2s per sequence | CVPR 2023; good diversity | MIT | [GitHub](https://github.com/Mael-zys/T2M-GPT) | Solid but slower than MoMask/MotionLCM |
| **MotionGPT** | ~200M (LLM-based) | Text (natural language) -> motion tokens | ~6-8GB VRAM | ~2-5s per sequence | NeurIPS 2023; unified language+motion | Apache-2.0 | [GitHub](https://github.com/OpenMotionLab/MotionGPT) | Interesting for NLP integration but heavy for real-time |
| **EDGE** | ~30M (est.) | Music audio -> dance motion (SMPL) | ~4GB VRAM | ~2-3s per 5s clip | CVPR 2023; editable, music-conditioned | MIT | [GitHub](https://github.com/Stanford-TML/EDGE) | Niche (dance only). Good for music-reactive idle animations. |
| **MotionDiffuse** | ~30M (est.) | Text -> SMPL params; supports body-part control | ~4-6GB VRAM | ~5-10s per sequence | IEEE TPAMI 2024; fine-grained body control | Apache-2.0 | [GitHub](https://github.com/mingyuan-zhang/MotionDiffuse) | Body-part control is unique; slow inference. |
| **AAMDM** | ~25M (est.) | Text -> motion (auto-regressive) | ~4GB VRAM | Faster than MDM (lower-dim space) | Good quality + diversity | MIT | [Paper](https://hf.co/papers/2401.06146) | Promising but less mature ecosystem |

### Key Findings

1. **MotionLCM is the clear winner** for real-time use. 30ms inference for 200 frames is fast enough for live avatar animation. V2 (Dec 2024) improves compression rate further.

2. **MoMask is the best CPU fallback.** Runs without GPU at all, 0.18s per sequence, MIT license. Perfect for the Mac M2 Pro where GPU memory competes with the LLM.

3. **All models output SMPL format**, not VRM-native. The conversion pipeline is:
   ```
   Model output (SMPL joints) -> smpl2bvh -> BVH file -> Three.js loader ->
   SkeletonUtils.retargetClip() with MIXAMO_BONE_MAP -> VRM avatar
   ```
   Libraries exist: [smpl2bvh](https://github.com/KosukeFukazawa/smpl2bvh), [vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter)

4. **None produce Live2D output.** For Live2D, the approach would be: extract upper-body pose from SMPL -> map to Live2D parameter IDs (ParamAngleX/Y/Z, ParamBodyAngleX, etc.).

5. **Training data is HumanML3D / KIT-ML** for all models. These contain ~14K motion clips with text annotations. Quality is biased toward walking/running/sports -- anime-style gestures (head tilt, peace sign, shy fidget) would require fine-tuning or a custom motion dataset.

---

## Category 2: Speech Emotion Recognition (SER)

These models detect emotion from audio input, which would feed into the companion's emotion-reactive system (VRM expressions, voice modulation, mood engine).

### Summary Table

| Model | Params | Emotions | Accuracy | Real-Time? | HW Reqs | License | HF Model ID | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **emotion2vec+ base** | **90M** | 9 classes: angry, disgusted, fearful, happy, neutral, other, sad, surprised, unknown | SOTA across 10+ languages on IEMOCAP | Yes (50Hz frame-level) | ~1GB VRAM / CPU viable | MIT | [`emotion2vec/emotion2vec_plus_base`](https://hf.co/emotion2vec/emotion2vec_plus_base) | **TOP PICK** -- Best accuracy, 9 emotions, multilingual, MIT |
| **emotion2vec+ large** | **300M** | Same 9 classes | Higher accuracy than base | Yes (slightly slower) | ~2-3GB VRAM | MIT | [`emotion2vec/emotion2vec_plus_large`](https://hf.co/emotion2vec/emotion2vec_plus_large) | Best accuracy if VRAM allows; overkill for companion app |
| **emotion2vec+ seed** | ~90M | Same 9 classes | Good (trained on academic data only) | Yes | ~1GB VRAM | MIT | [`emotion2vec/emotion2vec_plus_seed`](https://hf.co/emotion2vec/emotion2vec_plus_seed) | Baseline version of emotion2vec+ |
| **SpeechBrain wav2vec2** | **95M** (wav2vec2-base) | 4 classes: angry, happy, sad, neutral | 78.7% on IEMOCAP | Yes (~100ms) | ~1GB VRAM | Apache-2.0 | [`speechbrain/emotion-recognition-wav2vec2-IEMOCAP`](https://hf.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP) | **STRONG PICK** -- Battle-tested, 553K downloads, easy integration |
| **wav2vec2-xlsr (ehcalabres)** | **300M** (xlsr) | 4 classes | ~75% IEMOCAP | Yes | ~2GB VRAM | Apache-2.0 | [`ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`](https://hf.co/ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition) | Multilingual variant; 67K downloads |
| **HuBERT-base (Chinese)** | **95M** | 4-7 classes (varies) | ~75-80% | Yes | ~1GB VRAM | Apache-2.0 | [`xmj2002/hubert-base-ch-speech-emotion-recognition`](https://hf.co/xmj2002/hubert-base-ch-speech-emotion-recognition) | Good for CJK language support (66K downloads) |
| **HuBERT-large (Russian)** | **316M** | 4 classes | ~80% | Yes | ~2GB VRAM | Apache-2.0 | [`xbgoose/hubert-large-speech-emotion-recognition-russian-dusha-finetuned`](https://hf.co/xbgoose/hubert-large-speech-emotion-recognition-russian-dusha-finetuned) | High downloads (307K) but language-specific |
| **Whisper-large-v3 SER** | **1.55B** | 7 classes | 91-95% (RAVDESS/EMODB) | Slow (~1-2s) | ~6GB VRAM | Apache-2.0 | [`firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3`](https://hf.co/firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3) | Too heavy for real-time companion use |
| **Wav2Small** | **72K** (0.072M) | 3 dimensional (arousal/dominance/valence) | CCC 0.66 arousal (MSP Podcast) | **Ultra-fast** (120KB ONNX) | **CPU only** -- no GPU needed | MIT | [Paper](https://arxiv.org/abs/2408.13920) / [GitHub](https://github.com/dkounadis/wav2small) | **EDGE PICK** -- 72K params, runs anywhere, but dimensional not categorical |

### Key Findings

1. **emotion2vec+ base is the clear winner.** 9 emotion classes (vs. 4 for most wav2vec2 models), SOTA accuracy, MIT license, 90M params fits comfortably on all target hardware. The 9-class taxonomy maps directly to your existing VoiceModulator's 16-emotion system.

2. **SpeechBrain wav2vec2 is the safe fallback.** 553K downloads, Apache-2.0, well-documented, but only 4 emotion classes (angry/happy/sad/neutral) which limits expressiveness.

3. **Wav2Small is fascinating for always-on monitoring.** At 72K params (120KB ONNX), it could run continuously on CPU to detect arousal/valence shifts without any GPU cost. Good for detecting when the user is getting excited/bored/stressed.

4. **Whisper-based SER is too heavy.** 1.55B params and 6GB VRAM is not justified when emotion2vec+ base achieves better accuracy at 90M params.

5. **Real-time pipeline for your app:**
   ```
   User audio (from duplex voice) -> 16kHz resample ->
   emotion2vec+ base (90M, ~20ms) -> 9-class emotion ->
   MoodEngine.update_from_speech(emotion) -> VRM expression + voice modulation
   ```

---

## Integration Recommendations for Waifu-RT3D

### Tier 1: Implement Now (High Value, Low Risk)

| Component | Model | Why | Effort |
|---|---|---|---|
| **Speech Emotion** | emotion2vec+ base (90M) | 9 emotions, real-time, MIT, fits in existing voice pipeline | 4-6 hours |
| **Idle Animation** | MoMask (45M) | CPU-capable, fast, generate varied idle gestures from text prompts | 8-12 hours |

### Tier 2: Implement When Ready (High Value, Medium Risk)

| Component | Model | Why | Effort |
|---|---|---|---|
| **Real-time Gesture** | MotionLCM (50M) | 30ms inference, emotion-to-gesture during conversation | 12-16 hours |
| **Always-on Arousal** | Wav2Small (72K) | Background CPU monitor for user engagement level | 2-3 hours |

### Tier 3: Future Investigation

| Component | Model | Why | Effort |
|---|---|---|---|
| **Music-reactive Dance** | EDGE (30M) | Spotify/music detection -> dance animation | 8-12 hours |
| **Body-part Control** | MotionDiffuse (30M) | "Wave with right hand" level control | 12-16 hours |

### SMPL-to-VRM Pipeline (Required for All Animation Models)

```
[Motion Model] -> SMPL joints (numpy)
    -> smpl2bvh (Python script) -> BVH file
    -> Three.js BVHLoader -> AnimationClip
    -> SkeletonUtils.retargetClip(source, target, boneMap) -> VRM clip
    -> AnimationMixer.clipAction(clip).play()
```

Your existing `viewer.html` already has `MIXAMO_BONE_MAP` and `AnimationDirector` -- the retargeting step slots directly into the existing architecture.

For Live2D, the pipeline is different:
```
[Motion Model] -> SMPL upper-body angles
    -> Map to Live2D params (ParamAngleX/Y/Z, ParamBodyAngleX/Y/Z)
    -> cubism-web-framework setParameterValueById()
```

---

## Sources

### Animation Generation
- [MotionLCM Blog](https://huggingface.co/blog/EvanTHU/motionlcm)
- [MotionLCM Paper (ECCV 2024)](https://arxiv.org/abs/2404.19759)
- [MotionLCM GitHub](https://github.com/Dai-Wenxun/MotionLCM)
- [MDM Project Page](https://guytevet.github.io/mdm-page/)
- [MDM GitHub](https://github.com/GuyTevet/motion-diffusion-model)
- [MoMask GitHub (CVPR 2024)](https://github.com/EricGuo5513/momask-codes)
- [T2M-GPT GitHub (CVPR 2023)](https://github.com/Mael-zys/T2M-GPT)
- [MotionGPT GitHub (NeurIPS 2023)](https://github.com/OpenMotionLab/MotionGPT)
- [EDGE GitHub (CVPR 2023)](https://github.com/Stanford-TML/EDGE)
- [MotionDiffuse GitHub](https://github.com/mingyuan-zhang/MotionDiffuse)
- [EMDM Project](https://frank-zy-dou.github.io/projects/EMDM/)
- [smpl2bvh Converter](https://github.com/KosukeFukazawa/smpl2bvh)
- [vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter)

### Speech Emotion Recognition
- [emotion2vec Paper (ACL 2024)](https://arxiv.org/abs/2312.15185)
- [emotion2vec GitHub](https://github.com/ddlBoJack/emotion2vec)
- [emotion2vec+ base on HF](https://huggingface.co/emotion2vec/emotion2vec_plus_base)
- [emotion2vec+ large on HF](https://huggingface.co/emotion2vec/emotion2vec_plus_large)
- [SpeechBrain wav2vec2 IEMOCAP on HF](https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP)
- [Wav2Small Paper](https://arxiv.org/abs/2408.13920)
- [Wav2Small GitHub](https://github.com/dkounadis/wav2small)
- [Whisper SER on HF](https://huggingface.co/firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3)
- [VoxEmo Benchmark (2026)](https://hf.co/papers/2603.08936)
