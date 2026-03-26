# Computer Vision, Image Generation & Multimodal AI Techniques

**Date:** 2026-03-25
**Topic:** Actionable CV/ImageGen/Multimodal features for Waifu-RT3D
**Hardware Targets:** Mac M2 Pro (24GB unified), Win RTX 5080 (16GB VRAM), Win RTX 3070 (8GB VRAM)

---

## Summary Table

| # | Feature | Model / Library | Params | VRAM | Real-Time? | Complexity | License | User Benefit |
|---|---------|----------------|--------|------|------------|------------|---------|--------------|
| 1 | Face Tracking -> Avatar Puppeting | MediaPipe Face Landmarker + Kalidokit | ~2 MB (WASM) | CPU only | Yes (30+ FPS) | Low | Apache-2.0 | Webcam drives VRM expressions -- user becomes the character |
| 2 | Hand Gesture Recognition | MediaPipe Gesture Recognizer | ~5 MB (WASM) | CPU only | Yes (30+ FPS) | Low | Apache-2.0 | Peace sign, thumbs up, wave trigger companion reactions |
| 3 | Background Removal | RMBG-2.0 (BiRefNet) | 221M | ~4-6 GB | Near-RT (~200ms) | Medium | CC-BY-NC-4.0 | Composite avatar over user's desktop / green-screen-free pet mode |
| 4 | Image-to-3D Avatar | TripoSR | ~300M | ~6-8 GB | No (0.5-2s) | High | MIT | Generate 3D meshes from 2D character art for custom avatars |
| 5 | Anime Image Generation | Animagine XL 4.0 | ~3.5B (SDXL) | ~10 GB FP16 | No (5-15s/img) | Medium | CreativeML RAIL++ | Generate character art, scene backgrounds, gift images |
| 6 | Visual Question Answering | Moondream 2B | 1.86B | ~4 GB (FP16) | Near-RT (~1-2s) | Low | Apache-2.0 | Character "sees" and comments on shared screenshots/photos |
| 7 | OCR + Screen Reading | Florence-2-base | 230M | ~0.5 GB | Yes (<500ms) | Low | MIT | Read text in screenshots for contextual companion responses |
| 8 | Audio-Driven Lip Sync | Wawa-Lipsync / Web Audio API viseme | ~0 (audio analysis) | CPU only | Yes (60 FPS) | Low | MIT | VRM mouth moves in sync with TTS audio output |
| 9 | Pose Estimation | MediaPipe Pose / MoveNet Lightning | ~3 MB (WASM) | CPU only | Yes (50+ FPS) | Low | Apache-2.0 | Mirror user posture, react to slouching or stretching |
| 10 | Image Captioning | Florence-2-large | 770M | ~1.5 GB | Near-RT (~1s) | Low | MIT | Describe user-shared images so character can react naturally |
| 11 | Depth Estimation | Depth Anything V2 Small | 24.8M | <1 GB | Yes (30+ FPS) | Low | Apache-2.0 | Parallax effects, AR-like depth overlay, 3D photo effects |
| 12 | Style Transfer (Anime) | AnimeGANv3 | ~8.6 MB | <1 GB | Yes (~115ms/frame) | Low | Apache-2.0 | Turn user selfies into anime style as a fun companion gift |

---

## Detailed Analysis

### 1. Face Tracking -> Avatar Puppeting

**Models:** Google MediaPipe Face Landmarker + [Kalidokit](https://github.com/yeemachine/kalidokit)

**How it works:**
- MediaPipe Face Landmarker detects 478 3D face landmarks + 52 ARKit-compatible blendshapes from webcam video
- Kalidokit (`npm install kalidokit`) translates landmarks into VRM-compatible bone rotations and blendshape values
- Already proven in [Kalidoface-3D](https://github.com/yeemachine/kalidoface-3d) for VRM and Live2D

**Integration path for Waifu-RT3D:**
- Kalidokit outputs are directly compatible with VRM blendshapes that `viewer.html` already uses
- Add webcam capture in Sakura frontend, pipe MediaPipe results through Kalidokit, send to viewer via postMessage
- Can coexist with existing emotion-driven expressions (blend between AI emotion state and face tracking)

**Performance:** 30+ FPS in browser via WASM/WebGL. No GPU needed. Works on all target hardware.

**VRAM:** None (CPU/WASM). MediaPipe tasks bundle is ~2 MB.

**License:** Apache-2.0 (MediaPipe), MIT (Kalidokit)

**User benefit:** The companion mirrors the user's facial expressions in real-time -- smiling makes the avatar smile, head tilts are reflected. Creates a powerful "she's looking at me" feeling.

**Complexity:** LOW -- npm packages, browser-native, well-documented. Kalidokit was literally built for VRM puppeting.

---

### 2. Hand Gesture Recognition

**Model:** [MediaPipe Gesture Recognizer](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js) (`@mediapipe/tasks-vision`)

**How it works:**
- Detects 21 hand landmarks per hand + classifies 7 built-in gestures: Closed Fist, Open Palm, Pointing Up, Thumbs Down, Thumbs Up, Victory, Love
- Custom gesture training supported via MediaPipe Model Maker
- Runs entirely in-browser via WASM

**Integration path:**
- Share webcam stream with face tracking (single MediaPipe Holistic session)
- Map gestures to companion reactions: peace sign -> avatar does peace sign back, thumbs up -> happy reaction, wave -> greeting animation
- Custom gestures: heart shape -> bond XP bonus, pointing -> companion looks in that direction

**Performance:** 30+ FPS in-browser. Can run alongside face tracking.

**VRAM:** None (CPU/WASM)

**License:** Apache-2.0

**User benefit:** Non-verbal communication with the companion. Wave hello, give thumbs up after a good conversation, throw a peace sign for a photo moment.

**Complexity:** LOW -- same MediaPipe ecosystem as face tracking, can share the webcam pipeline.

---

### 3. Background Removal / Segmentation

**Model:** [RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) by BRIA AI

- **HF ID:** `briaai/RMBG-2.0`
- **Architecture:** BiRefNet (bilateral reference network)
- **Parameters:** 221M
- **Training data:** 15,000+ high-quality manually labeled images

**Integration path:**
- Backend Python endpoint: load model, accept image, return alpha mask
- Use for: green-screen-free desktop pet compositing, user photo background swap, scene generation with character overlay
- Alternative: browser-based `@imgly/background-removal` (runs ONNX in WebAssembly, ~40MB model, slower but no backend needed)

**Performance:** ~200ms per 1024x1024 image on GPU. Not real-time for video but fine for snapshots and periodic updates.

**VRAM:** ~4-6 GB on GPU

**License:** CC-BY-NC-4.0 (non-commercial free; commercial requires BRIA license). **Note:** For commercial use, consider `u2net` (MIT) or the browser-based alternative.

**User benefit:** Remove backgrounds from user photos so the companion can be composited into them. Enable clean desktop pet overlay without OBS chroma-key.

**Complexity:** MEDIUM -- requires backend Python inference, model download (~800 MB), and alpha compositing pipeline.

---

### 4. Image-to-3D / Avatar Generation

**Model:** [TripoSR](https://huggingface.co/stabilityai/TripoSR) by Stability AI + Tripo AI

- **HF ID:** `stabilityai/TripoSR`
- **Parameters:** ~300M
- **Output:** Textured 3D mesh (OBJ/GLB)

**Integration path:**
- Backend Python endpoint: accept 2D character image, generate 3D mesh
- Post-process: auto-rig with Mixamo or convert to VRM format (requires additional tooling)
- Use case: "Draw your waifu" feature -- user uploads anime art, gets a basic 3D model
- **Critical caveat:** Output is raw mesh, NOT a rigged VRM. Auto-rigging pipeline (Mixamo API or AccuRIG) adds significant complexity

**Performance:** 0.5s on A100, ~2-5s on RTX 3070/5080. Not real-time but fast enough for a "generate avatar" wizard.

**VRAM:** ~6-8 GB (default resolution). Higher quality needs 12+ GB.

**License:** MIT

**User benefit:** Generate custom 3D avatars from 2D art. "Upload a picture of your character and bring them to life in 3D."

**Complexity:** HIGH -- mesh generation is easy, but VRM conversion + rigging + blendshape setup is a multi-step pipeline. Consider as a Phase 16+ feature.

---

### 5. Anime-Style Image Generation

**Model:** [Animagine XL 4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0) by Cagliostro Lab

- **HF ID:** `cagliostrolab/animagine-xl-4.0`
- **Architecture:** SDXL (Stable Diffusion XL 1.0 fine-tune)
- **Parameters:** ~3.5B (SDXL U-Net + text encoders)
- **Training:** 8.4M anime images, ~2650 GPU hours

**Integration path:**
- Already partially implemented via AI-Generated Expression Portraits feature (A5)
- Extend to: scene background generation, gift art (companion draws something for the user), memory illustrations
- Run via `diffusers` library in backend, or connect to local ComfyUI/A1111 instance
- ControlNet support for pose-guided generation (companion in specific poses)

**Performance:** 5-15s per image on RTX 3070 (8GB, needs FP16 or NF4 quantization). 3-8s on RTX 5080. M2 Pro: 15-30s via MPS.

**VRAM:** ~10 GB FP16 (fits RTX 5080, tight on RTX 3070 with optimizations). Quantized INT4: ~6 GB.

**License:** CreativeML Open RAIL++-M (allows commercial use with restrictions on harmful content)

**User benefit:** Companion creates personalized anime art: "I drew this for you!" scene illustrations, gift images, memory snapshots.

**Complexity:** MEDIUM -- `diffusers` integration is straightforward, but prompt engineering and quality control need iteration. VRAM management on 8GB GPU needs attention.

---

### 6. Visual Question Answering (VQA)

**Model:** [Moondream 2B](https://huggingface.co/vikhyatk/moondream2)

- **HF ID:** `vikhyatk/moondream2`
- **Parameters:** 1.86B
- **Architecture:** SigLIP vision encoder + Phi-2 language model

**Integration path:**
- Backend endpoint: accept image + question, return text answer
- User shares screenshot -> moondream describes it -> feed description into LLM context -> companion comments naturally
- Already fits the Spectator/FrameAnalyzer pattern in `backend/spectator/analyzer.py`
- Can replace or complement the existing VLM frame analysis

**Performance:** ~1-2s per image on GPU. Fast enough for "show companion a photo" interactions.

**VRAM:** ~4 GB FP16, ~2.5 GB INT4. Fits comfortably on all target hardware.

**License:** Apache-2.0

**User benefit:** Share a photo and the companion actually "sees" it: "Oh, is that a cat? So cute!" or "That sunset looks amazing, where is that?"

**Complexity:** LOW -- `transformers` library, simple API, lightweight model. Can run alongside the main LLM.

**Also consider:** Florence-2 (see #10) handles this too with even less VRAM.

---

### 7. OCR + Screen Reading

**Model:** [Florence-2-base](https://huggingface.co/microsoft/Florence-2-base)

- **HF ID:** `microsoft/Florence-2-base`
- **Parameters:** 230M
- **Architecture:** DaViT vision encoder + sequence-to-sequence decoder

**Integration path:**
- Use Florence-2's `<OCR>` and `<OCR_WITH_REGION>` task prompts
- Backend endpoint: accept screenshot, return extracted text with bounding boxes
- Feed extracted text into LLM context so companion can discuss what's on screen
- Combine with Spectator mode: read game UI text, quest objectives, chat messages

**Performance:** <500ms per image on GPU. Real-time enough for periodic screen captures.

**VRAM:** ~0.5 GB (base model). Extremely lightweight.

**License:** MIT

**User benefit:** Companion reads what's on your screen: "Oh, you got an A on that test? Congrats!" or "That error message says your API key expired."

**Complexity:** LOW -- single model handles OCR, captioning, and detection. Transformers library, standard inference.

---

### 8. Audio-Driven Lip Sync for VRM/Live2D

**Approach:** Browser-native audio analysis (NOT Wav2Lip/SadTalker -- those are for 2D video, not 3D avatars)

**Libraries:**
- [Wawa-Lipsync](https://github.com/wass80/wawa-lipsync) -- browser-native, real-time lipsync from audio
- [rhubarb-lip-sync](https://github.com/DanielSWolf/rhubarb-lip-sync) -- offline audio-to-viseme (for pre-recorded TTS)
- Web Audio API + MFCC analysis -> viseme mapping (custom, most flexible)

**Integration path for Waifu-RT3D:**
- The VRM viewer already has `morphTargetInfluences` for mouth shapes (aa, ih, ou, ee, oh)
- Tap into Web Audio API `AnalyserNode` on TTS audio output
- Map frequency bands / amplitude to the 5 VRM viseme blendshapes
- For higher quality: use Oculus viseme set (15 visemes) with MFCC classification
- Viewer.html's `AnimationDirector` already has a `talk` state -- extend it with viseme data

**Performance:** 60 FPS, pure audio analysis, no ML model needed for basic implementation.

**VRAM:** None (CPU audio processing)

**License:** MIT (Wawa-Lipsync), various (Web Audio API is browser-native)

**User benefit:** Character's mouth moves naturally when speaking instead of a simple open/close animation. Dramatically increases believability of voice conversations.

**Complexity:** LOW for basic (amplitude-based), MEDIUM for high-quality (MFCC viseme classification). Basic version could ship in 2-3 hours.

---

### 9. Pose Estimation

**Models:**
- [MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) -- 33 body landmarks, browser-native
- [MoveNet Lightning](https://www.tensorflow.org/hub/tutorials/movenet) -- 17 keypoints, ~7ms on mobile

**Integration path:**
- Share webcam stream with face/hand tracking (MediaPipe Holistic does all three)
- Detect user posture: slouching -> companion says "sit up straight!"; stretching -> companion stretches too
- Mirror mode: avatar mirrors user's upper body pose (arms, head tilt, lean)
- Exercise/dance mode: companion leads stretches, user follows, pose estimation scores accuracy

**Performance:** 30-50+ FPS in-browser via WASM. MoveNet Lightning: 50+ FPS.

**VRAM:** None (CPU/WASM)

**License:** Apache-2.0

**User benefit:** Companion is spatially aware of the user. Creates "she can actually see me" moments. Enables interactive activities (stretching together, dance mimicry).

**Complexity:** LOW -- same MediaPipe ecosystem. Data is just `{x, y, z, visibility}` per landmark.

---

### 10. Image Captioning

**Model:** [Florence-2-large](https://huggingface.co/microsoft/Florence-2-large)

- **HF ID:** `microsoft/Florence-2-large`
- **Parameters:** 770M
- **Architecture:** DaViT vision encoder + seq2seq decoder

**Integration path:**
- Same model as OCR (#7) but using `<CAPTION>` / `<DETAILED_CAPTION>` / `<MORE_DETAILED_CAPTION>` prompts
- Single model handles BOTH OCR and captioning -- efficient deployment
- Feed caption into LLM context: `[The user shared an image: "A cozy bedroom with fairy lights and a cat on the bed"]`
- Companion responds naturally to the visual content

**Performance:** ~1s per image on GPU.

**VRAM:** ~1.5 GB. Can run alongside main LLM.

**License:** MIT

**User benefit:** Share any image and the companion understands it contextually. More natural than asking the user to describe what they're sharing.

**Complexity:** LOW -- same Florence-2 deployment as OCR. One model, multiple capabilities.

**Recommendation:** Deploy Florence-2-large as the unified vision backbone. It handles captioning, OCR, object detection, and grounding in a single 770M model at 1.5 GB VRAM.

---

### 11. Depth Estimation

**Model:** [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)

- **HF ID:** `depth-anything/Depth-Anything-V2-Small-hf`
- **Parameters:** 24.8M
- **Architecture:** DPT head + DINOv2 ViT-S backbone

**Integration path:**
- Backend or browser (ONNX) inference on webcam frames or shared images
- Parallax effect: depth map drives subtle 3D parallax on 2D character art or backgrounds
- AR-like overlay: use depth to place avatar "in" the user's room via webcam
- Photo depth effect: Ken Burns zoom on shared photos using depth map
- CoreML version available for M2 Pro: `apple/coreml-depth-anything-v2-small`

**Performance:** 30+ FPS on GPU (Small variant). CoreML version runs natively on M2.

**VRAM:** <1 GB. Tiny model.

**License:** Apache-2.0 (Small variant only; Base/Large/Giant are CC-BY-NC-4.0)

**User benefit:** Adds depth and spatial awareness to flat content. Photo parallax effects, AR placement of avatar in user's room. Subtle but impressive visual polish.

**Complexity:** LOW -- standard `transformers` pipeline. Output is a single-channel depth map.

---

### 12. Style Transfer (Anime)

**Model:** [AnimeGANv3](https://huggingface.co/spaces/TachibanaYoshino/AnimeGANv3) / AnimeGANv2

- **Architecture:** Double-tail GAN with LADE normalization
- **Parameters:** ~8.6 MB (AnimeGANv2 generator)
- **Styles:** Multiple anime styles (Hayao Miyazaki, Shinkai, Paprika, etc.)

**Integration path:**
- Backend endpoint: accept user selfie, return anime-styled version
- "Companion gift" feature: "I drew you in anime style!"
- Profile picture generator: user uploads photo, gets anime avatar
- Can also stylize scene backgrounds for immersive effect
- ONNX runtime available for cross-platform deployment

**Performance:** ~115ms per 1080p frame on GPU. Real-time capable for video.

**VRAM:** <1 GB. Extremely lightweight GAN.

**License:** Apache-2.0 (AnimeGANv2). AnimeGANv3 license varies by version.

**User benefit:** Fun, shareable feature. "My companion turned my selfie into anime!" High engagement, low implementation cost. Natural fit for the anime companion theme.

**Complexity:** LOW -- tiny model, fast inference, well-documented. Could ship in 1-2 hours for basic implementation.

---

## Implementation Priority Recommendations

### Tier 1: Ship This Week (Low effort, high impact)

| Feature | Est. Hours | Why First |
|---------|-----------|-----------|
| 8. Audio Lip Sync (basic) | 2-3h | Voice conversations already exist; lip sync makes them 10x more immersive |
| 12. Style Transfer | 1-2h | Fun, shareable, tiny model, instant gratification |
| 1. Face Tracking | 4-6h | VRM puppeting is the killer feature for "she sees me" feeling |

### Tier 2: Next Sprint (Medium effort, high impact)

| Feature | Est. Hours | Why Next |
|---------|-----------|----------|
| 7+10. Florence-2 (OCR + Captioning) | 4-6h | Single model, dual capability, makes companion visually aware |
| 6. Moondream VQA | 3-4h | Deeper visual understanding than captioning alone |
| 2. Hand Gestures | 2-3h | Shares webcam pipeline with face tracking, low marginal cost |
| 9. Pose Estimation | 2-3h | Also shares webcam pipeline, enables physical interaction |

### Tier 3: Future Phases (Higher effort or niche)

| Feature | Est. Hours | Notes |
|---------|-----------|-------|
| 11. Depth Estimation | 3-4h | Polish feature, not core. Nice for AR overlay mode |
| 3. Background Removal | 6-8h | Useful but OBS chroma-key is "acceptable friction" per user preference |
| 5. Anime Image Gen | 8-12h | Already partially built (A5). VRAM management complex on 8GB GPU |
| 4. Image-to-3D | 20-30h | Mesh is easy, rigging pipeline is a project unto itself |

---

## Unified Architecture Recommendation

Deploy a **shared vision pipeline** with three tiers:

```
Browser Layer (WASM, 0 VRAM):
  - MediaPipe Holistic (face + hands + pose)
  - Web Audio API lip sync
  - AnimeGANv2 (ONNX/WASM)

Light Backend (< 2 GB VRAM):
  - Florence-2-large (captioning + OCR + detection)
  - Depth Anything V2 Small (depth maps)

Heavy Backend (4-10 GB VRAM, on-demand):
  - Moondream 2B (deep VQA)
  - Animagine XL 4.0 (image generation)
  - RMBG-2.0 (background removal)
  - TripoSR (3D generation)
```

The browser layer runs constantly with zero GPU cost. The light backend loads on startup (~2 GB total). Heavy models load on-demand and unload when not needed to share VRAM with the main LLM.

---

## Sources

- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
- [Kalidokit (VRM puppeting)](https://github.com/yeemachine/kalidokit)
- [MediaPipe Gesture Recognizer](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)
- [RMBG-2.0 (briaai)](https://huggingface.co/briaai/RMBG-2.0)
- [TripoSR (Stability AI)](https://huggingface.co/stabilityai/TripoSR)
- [Animagine XL 4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0)
- [Moondream 2B](https://huggingface.co/vikhyatk/moondream2)
- [Florence-2](https://huggingface.co/microsoft/Florence-2-base)
- [Wawa-Lipsync](https://wawasensei.dev/tuto/real-time-lipsync-web)
- [TalkingHead 3D](https://github.com/met4citizen/TalkingHead)
- [MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
- [MoveNet (TensorFlow)](https://www.tensorflow.org/hub/tutorials/movenet)
- [Depth Anything V2](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)
- [AnimeGANv3](https://tachibanayoshino.github.io/AnimeGANv3/)
- [VTuber Studio Tutorial (Wawa Sensei)](https://wawasensei.dev/tuto/vrm-avatar-with-threejs-react-three-fiber-and-mediapipe)
- [Best Open-Source Image Gen Models 2026](https://www.pixazo.ai/blog/top-open-source-image-generation-models)
- [Best Open-Source Lip-Sync Models 2026](https://www.pixazo.ai/blog/best-open-source-lip-sync-models)
