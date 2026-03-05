# Rendering Engines & Model Formats Guide

> Comprehensive reference for developers and users working with 3D/2D avatar models in waifu-rt3d.

---

## Quick Start — Adding Your Own Models

### VRM Models (Recommended)

VRM is the recommended format for anime-style 3D avatars. It's an open standard built on glTF with humanoid avatar extensions.

1. **Get a VRM file** — Export from [VRoid Studio](https://vroid.com/en/studio), Blender (via [VRM Add-on](https://vrm-addon-for-blender.info/en/)), or download from [VRoid Hub](https://hub.vroid.com/)
2. **Place it** in `backend/storage/models/vrm/YourModel.vrm`
3. **Assign it** to a character via Settings → Character → 3D Model, or set `model_vrm` in the character's config
4. The viewer automatically detects VRM metadata (spring bones, expressions, humanoid armature)

**Supported versions:** VRM 0.x and VRM 1.0

### GLB/GLTF Models

Standard glTF Binary format. Works with any 3D model — doesn't require humanoid armature.

1. **Get a GLB file** — Export from Blender, download from [Sketchfab](https://sketchfab.com/), or use the built-in Model Browser
2. **Place it** in `backend/storage/models/glb/YourModel.glb`
3. **Assign it** the same way as VRM models
4. If the model has embedded animation clips, they'll be auto-discovered and playable

**Morph targets:** GLB models with blend shapes/morph targets are supported. The viewer exposes them via the `setGlbMorphTarget` command.

### Live2D / VTube Studio Models

Live2D Cubism 4.x models render in a dedicated PIXI.js canvas (not the Three.js iframe).

1. **Get model files** — You need a `.model3.json` entry point, `.moc3` binary, and texture PNGs
2. **Place the folder** in `backend/storage/live2d/your_model_name/`
   ```
   backend/storage/live2d/your_model/
   ├── your_model.model3.json    ← entry point
   ├── your_model.moc3           ← compiled Cubism model
   ├── textures/
   │   └── texture_00.png
   ├── motions/                  ← optional motion files
   │   ├── idle_01.motion3.json
   │   └── tap_body_01.motion3.json
   └── expressions/              ← optional expression files
       ├── happy.exp3.json
       └── angry.exp3.json
   ```
3. **Switch viewer mode** to Live2D in Settings → Display

**VTube Studio models** are standard Live2D Cubism models with extra tracking metadata. To use them:
1. Extract the `.vtube` archive (it's a renamed ZIP)
2. Place the contents in `backend/storage/live2d/{name}/`
3. The `.model3.json` and `.moc3` files work as-is — ignore the tracking config files

### MMD/PMX Models (Planned)

MikuMikuDance models from the massive community library. Support is planned via Three.js MMDLoader.

1. Place the model folder in `backend/storage/models/mmd/model_name/`
2. Include `model.pmx` plus any texture files

### Spine 2D Models (Planned)

Spine skeletal animation (common in indie/gacha games). Support is planned via pixi-spine.

1. Place skeleton (`.json` or `.skel`) and atlas (`.atlas` + PNGs) in `backend/storage/models/spine/`

---

## Supported Formats Reference

| Format | Extension | Engine | Expressions | Physics | Lip Sync | Animations | Status |
|--------|-----------|--------|-------------|---------|----------|------------|--------|
| VRM 0.x/1.x | `.vrm` | Three.js + three-vrm | Blend shapes | Spring bones | FFT audio | VRMA, BVH, Mixamo | **Working** |
| GLB/GLTF | `.glb`, `.gltf` | Three.js GLTFLoader | Morph targets | None (manual) | Via morphs | Embedded clips | **Working** |
| Live2D Cubism 4 | `.moc3` + `.model3.json` | PIXI + pixi-live2d-display | Cubism expressions | Cubism physics | ParamMouthOpenY | Motion groups | **Working** |
| VRMA | `.vrma` | Three.js VRMAnimation | N/A (anim only) | N/A | N/A | Humanoid clips | **Working** |
| BVH | `.bvh` | Inline parser + retarget | N/A | N/A | N/A | Mocap data | **Working** |
| FBX | `.fbx` | Three.js FBXLoader | N/A (anim only) | N/A | N/A | Mixamo exports | **Planned** |
| PMX/MMD | `.pmx`, `.pmd` | Three.js MMDLoader | JP morph names | Bullet physics | Morph あ/い/う | VMD clips | **Planned** |
| Spine 2D | `.json`/`.skel` + `.atlas` | pixi-spine | Skin attachments | IK constraints | Slot swaps | Spine timeline | **Planned** |
| Unity AssetBundle | `.unity3d` | Unity WebGL | C# scripts | Unity physics | AudioSource | Mecanim | **Partial** |

---

## Engine Deep Dives

### Three.js Engine (VRM + GLB + FBX + MMD)

**Architecture:** The Three.js renderer runs inside an iframe (`frontends/shared/viewer/viewer.html`, ~5100 lines). The main app communicates with it via `window.postMessage()`. This isolation prevents Three.js's global state from interfering with the React UI.

```
React App (Sakura)
    └── viewerStore.ts (mediator)
            └── postMessage() ──→ viewer.html (iframe)
                                      ├── THREE.Scene
                                      ├── AnimationDirector (6 layers)
                                      ├── EffectComposer (post-processing)
                                      └── ParticleSystem (500 budget)
```

#### AnimationDirector — 6-Layer Blended Animation

The `AnimationDirector` is a state machine that manages 6 animation layers, each responsible for a different aspect of character motion. Layers are activated/deactivated based on the current state (idle, talk, gesture, clip, mocap).

| Layer | Priority | Purpose | Blend Mode |
|-------|----------|---------|------------|
| **BasePoseLayer** | L1 | Breathing, weight shift, neutral posture | Base |
| **IdleBehaviorLayer** | L1 | Fidgets, facial tics, micro-animations | Additive |
| **EmotionLayer** | L2 | Posture bias from emotion state (spine/shoulders) | Additive |
| **TalkLayer** | L3 | Conversational body language, head nods | Additive |
| **GestureLayer** | L4 | Gesture playback (3-phase: ease-in → hold → ease-out) | Override |
| **LookAtLayer** | L5 | Eye gaze tracking + head IK from mouse position | Additive |

Plus the **ClipLayer** (mixer-based) for GLB/BVH/VRMA animation playback with crossfade support.

**State machine transitions:**
```
idle    → [basePose, idle, emotion]           (default resting state)
talk    → [basePose, emotion, talk]           (during speech)
gesture → [basePose, emotion, gesture]        (triggered gestures)
clip    → [] (ClipLayer runs independently)   (animation playback)
mocap   → [] (mocap runs independently)       (motion capture)
```

Crossfade duration between states: 0.2–0.3 seconds.

#### Expression / Blend Shape System

**VRM models** use the VRM expression system via `currentVrm.expressionManager.setValue(name, value)`. Standard blend shapes include:
- Emotions: `happy`, `angry`, `sad`, `surprised`, `relaxed`
- Visemes: `aa`, `ih`, `uh`, `ee`, `oh`
- Eye: `blink`, `blinkLeft`, `blinkRight`, `lookUp`, `lookDown`, `lookLeft`, `lookRight`

**GLB models** use Three.js morph targets via `mesh.morphTargetInfluences[index]`. Morph target names are model-dependent.

**Lip sync** uses `AudioLipSync` — a 512-point FFT analyzer running at ~86Hz per frequency bin. Audio volume drives mouth-open blend shapes in real-time.

#### Spring Bone Physics

VRM spring bones simulate hair, clothing, and accessory physics. The system provides:
- Per-joint tuning: `stiffness`, `drag`, `gravityPower`
- Wind force application across all joints
- Collider debug visualization (wireframe spheres)
- Real-time parameter adjustment via `setSpringBoneParams` command

#### Post-Processing Pipeline

```
Scene Render → RenderPass → UnrealBloomPass → ShaderPass (color grade) → Screen
```

| Effect | Parameters | Default |
|--------|-----------|---------|
| **Bloom** | strength, radius, threshold | 0.3, 0.4, 0.85 |
| **Color Grading** | brightness, contrast, saturation | 1.0, 1.0, 1.0 |

#### Particle System

Budget: 500 particles max. Six particle types with distinct physics:

| Type | Color | Use Case | Gravity |
|------|-------|----------|---------|
| Sakura | `#ffb7c5` | Ambient petals | Floats up |
| Dust | `#dddddd` | Ambient motes | None |
| Snow | `#ffffff` | Ambient snowfall | Floats up |
| Heart | `#ff4488` | Love/flirty emotion | Floats up |
| Sparkle | `#ffd700` | Happy/excited emotion | None |
| Anger | `#ff2222` | Angry emotion | None |

Emotions auto-trigger particles: happy/excited → sparkle, love/flirty → heart, angry → anger.

#### Bone Retargeting

Two bone maps are built-in for animation retargeting:

**MIXAMO_BONE_MAP** (22 bones) — Maps Mixamo rig names to VRM humanoid bones:
```
mixamorig:Hips        → hips
mixamorig:Spine        → spine
mixamorig:LeftArm      → leftUpperArm
mixamorig:RightHand    → rightHand
...
```

**BVH_BONE_MAP** (20 bones) — Maps CMU Motion Capture convention:
```
LHipJoint / LeftUpLeg  → leftUpperLeg
RightArm               → rightUpperArm
Head                    → head
...
```

The `ClipLayer.retargetClip()` method walks animation clip tracks, remaps bone names using the appropriate map, and modifies `THREE.AnimationClip` objects in-place.

#### postMessage API Reference

Commands sent to the VRM iframe via `postMessage()`:

| Command | Payload | Description |
|---------|---------|-------------|
| `setExpression` | `{ emotion, intensity }` | Set facial expression |
| `trigger_gesture` | `{ gesture, expression, intensity }` | Play gesture animation |
| `loadAnimation` | `{ url, name, retarget }` | Load VRMA/GLB/BVH clip |
| `playAnimation` | `{ name }` | Play loaded animation |
| `stopAnimation` | `{}` | Stop current animation |
| `setSpringBoneParams` | `{ jointIndex, stiffness, drag, gravityPower }` | Tune physics |
| `setWind` | `{ x, y, z, strength }` | Apply wind force |
| `setEffects` | `{ bloom, colorGrade, ... }` | Configure post-processing |
| `spawnParticles` | `{ type, count, color, origin }` | Emit particles |
| `loadModel` | `{ url }` | Load VRM/GLB model |
| `cameraPreset` | `{ preset }` | Switch camera angle |
| `screenshotRequest` | `{}` | Capture frame as PNG |
| `setEyeGaze` | `{ x, y }` | Set eye look target |

---

### PIXI.js Engine (Live2D + Spine)

**Architecture:** Live2D models render in a PIXI.js canvas managed by the `useLive2D` React hook. Unlike the Three.js iframe approach, Live2D runs in the same React process.

```
React App (Sakura)
    └── viewerStore.ts (mediator)
            └── lastCommand subscription ──→ useLive2D.ts (hook)
                                                 ├── PIXI.Application
                                                 ├── Live2DModel (pixi-live2d-display)
                                                 └── AudioContext (lip sync)
```

#### Model Loading

```typescript
import { Live2DModel } from 'pixi-live2d-display';
const model = await Live2DModel.from(modelUrl);  // model3.json URL
app.stage.addChild(model);
```

The model auto-registers with PIXI's ticker for frame updates.

#### Expression System

Cubism 4 expressions are loaded from `.exp3.json` files referenced in the model manifest:
```typescript
const exprMgr = model.internalModel?.motionManager?.expressionManager;
exprMgr?.setExpression('happy');
```

#### Motion / Gesture Mapping

A built-in `MOTION_MAP` translates app gesture names to Live2D motion groups:

```
wave      → tap_body
nod       → flick_head
idle      → idle
happy     → tap_body
thinking  → idle
```

Playback: `model.motion(groupName, motionIndex)`

#### Lip Sync

Volume-based approach using Web Audio API:
- `AudioContext` + `AnalyserNode` with 256-point FFT
- Drives the Cubism standard `ParamMouthOpenY` parameter
- Update loop via `requestAnimationFrame` at display refresh rate
- Volume normalized: `avg / 128`, clamped to `[0, 1]`

---

### Unity WebGL Engine

**Architecture:** Unity WebGL builds run in a separate iframe, communicating via a JavaScript-to-C# bridge.

```
React App (Sakura)
    └── viewerStore.ts (mediator)
            └── postMessage() ──→ Unity iframe
                                      └── WaifuBridge.cs (command router)
                                            ├── AvatarController.cs
                                            └── SpringBoneController.cs
```

#### Command Protocol

Commands are formatted as `"CommandName|{jsonData}"` and routed by `WaifuBridge.cs`:

| Command | Handler | Description |
|---------|---------|-------------|
| `SetExpression` | AvatarController | Set facial expression |
| `PlayGesture` | AvatarController | Trigger gesture animation |
| `LoadModel` | AvatarController | Load model asset |
| `PlayAudio` | AvatarController | Play audio for lip sync |
| `SetEntrance` | AvatarController | Configure entrance animation |
| `CaptureScreenshot` | WaifuBridge | Render to PNG, return base64 |
| `SetWind` | SpringBoneController | Apply wind physics |
| `SetSpringBoneParams` | SpringBoneController | Tune spring bone joints |

#### Shader Support

Unity builds use [lilToon](https://lilxyzw.github.io/lilToon/), an anime/toon shader optimized for VRM models in Unity. It provides:
- Outline rendering
- Emission maps
- Rim lighting
- Matcap support

#### Build & Deploy

1. Open the Unity project in `unity/waifurt3d-avatar/`
2. Set platform to WebGL in Build Settings
3. Build to `unity/Build/`
4. The app serves the build via the `/unity/` static mount

---

## Animation Formats

### VRMA — VRM Animation

Native animation format for VRM models. Contains humanoid bone keyframes that map directly to VRM humanoid bones without retargeting.

- **Extension:** `.vrma`
- **Loader:** Three.js `VRMAnimationLoaderPlugin`
- **Storage:** `backend/storage/animations/vrma/`
- **Features:** Direct bone mapping, expression keyframes, look-at targets

### GLB Animation Clips

Standard glTF animations embedded in or separate from model files. Used for Mixamo exports and custom animations.

- **Extension:** `.glb`
- **Loader:** Three.js `GLTFLoader`
- **Storage:** `backend/storage/animations/glb/`
- **Features:** Multiple clips per file, morph target animations, skeletal animations
- **Retargeting:** May need MIXAMO_BONE_MAP if exported from Mixamo

### FBX/Mixamo Animations (Planned)

Autodesk FBX format, primarily for importing Mixamo animation clips.

- **Extension:** `.fbx`
- **Loader:** Three.js `FBXLoader` (requires `fflate` decompression library)
- **Storage:** `backend/storage/animations/fbx/`
- **Retargeting:** Uses MIXAMO_BONE_MAP (22 bone mappings)

### BVH Motion Capture

Biovision Hierarchy format from motion capture databases (CMU, etc.).

- **Extension:** `.bvh`
- **Loader:** Inline BVH parser in viewer.html
- **Storage:** `backend/storage/animations/bvh/`
- **Retargeting:** Uses BVH_BONE_MAP (20 bone mappings for CMU convention)

### VMD — MikuMikuDance Animation (Planned)

MikuMikuDance's native animation format.

- **Extension:** `.vmd`
- **Loader:** Three.js `MMDLoader`
- **Features:** Bone keyframes, morph keyframes, camera motion, light keyframes

---

## Creating Models for This App

### Blender → VRM Export Workflow

1. **Install** the [VRM Add-on for Blender](https://vrm-addon-for-blender.info/en/)
2. **Model your character** with a humanoid armature
3. **Add blend shapes** for expressions (happy, sad, angry, etc.) and visemes (aa, ih, uh, ee, oh)
4. **Configure VRM metadata:**
   - Set humanoid bone mappings (required: hips, spine, chest, head, plus arms/legs)
   - Define blend shape groups for expressions
   - Configure spring bones for hair/clothing physics
   - Set first-person settings (head bone hiding for VR)
5. **Export** as VRM 1.0 (preferred) or VRM 0.x
6. **Place** in `backend/storage/models/vrm/`

**Tips:**
- Keep polycount under 30k triangles for smooth real-time rendering
- Use a single material with texture atlas for best performance
- Spring bone chains of 3–5 bones work well for hair strands
- Test in [VRM Viewer](https://vrm.dev/vrm_viewer/) before importing

### Blender → GLB Export Workflow

1. **Model your character** in Blender (no special add-ons needed)
2. **Add morph targets** (Shape Keys in Blender) for facial expressions
3. **Create animations** as Actions in Blender's Action Editor
4. **Export** via File → Export → glTF 2.0 (.glb)
   - Check "Include: Selected Objects" if only exporting the character
   - Enable "Animation: Shape Keys" to include morph targets
   - Enable "Animation: Animations" to embed clips
5. **Place** in `backend/storage/models/glb/`

### Unity → VRM Export (UniVRM)

1. **Install** [UniVRM](https://github.com/vrm-c/UniVRM) package in Unity
2. **Import** your character model
3. **Configure** the VRM components:
   - Humanoid bone mapping (Unity's Humanoid rig)
   - Blend shape proxy (expression definitions)
   - Spring bone (physics simulation)
   - First person (head rendering settings)
4. **Export** via VRM menu → Export
5. **Place** in `backend/storage/models/vrm/`

### VRoid Studio → Direct VRM

1. **Design** your character in VRoid Studio (free, beginner-friendly)
2. **Export** as VRM from the export menu
3. **Place** in `backend/storage/models/vrm/`
4. VRoid models come pre-configured with expressions, spring bones, and humanoid mapping

### MikuMikuDance → PMX (Planned)

1. **Download** PMX models from community sites (Bowlroll, DeviantArt, etc.)
2. **Place** the model folder (`.pmx` + textures) in `backend/storage/models/mmd/model_name/`
3. The app maps Japanese morph names to the expression system automatically

---

## ViewerStore — The Mediator

The `viewerStore` (Zustand) acts as a command router that abstracts away rendering engine differences. Application code calls generic methods like `dispatchExpression('happy', 0.8)`, and the store routes to the correct engine:

| App Command | VRM (iframe) | Live2D (hook) | Unity (iframe) |
|-------------|-------------|---------------|----------------|
| Set expression | `postMessage({ type: 'setExpression' })` | `exprMgr.setExpression()` | `SendMessage('SetExpression\|{}')` |
| Play gesture | `postMessage({ type: 'trigger_gesture' })` | `model.motion(group)` | `SendMessage('PlayGesture\|{}')` |
| Take screenshot | `postMessage({ type: 'screenshotRequest' })` | PIXI `extract.pixels()` | `RenderTexture → base64` |

This mediator pattern means adding a new rendering engine requires:
1. Adding a new `ViewerMode` value
2. Implementing the dispatch routing in viewerStore
3. Building the renderer (iframe, hook, or component)

---

## Directory Structure

```
backend/storage/
├── models/                          ← Organized by format
│   ├── vrm/                         ← VRM humanoid avatars
│   ├── glb/                         ← GLB/GLTF models
│   ├── mmd/                         ← PMX/PMD models (planned)
│   └── spine/                       ← Spine 2D models (planned)
├── live2d/                          ← Live2D Cubism models (subdirs per model)
├── animations/                      ← Animation clips by format
│   ├── vrma/                        ← VRM Animation files
│   ├── glb/                         ← GLB animation clips
│   ├── fbx/                         ← FBX animations (planned)
│   └── bvh/                         ← BVH motion capture
├── avatars/                         ← Legacy directory (kept for backwards compat)
└── images/                          ← Background images, portraits
```

---

## Troubleshooting

### Model loads but is invisible

- **Scale:** Some models are extremely large or small. The viewer auto-scales VRM models but not GLB. Try zooming out or check the model's scale in Blender.
- **Orientation:** VRM uses Y-up, Z-forward. If your model faces the wrong way, rotate it 180 degrees on Y in Blender before exporting.
- **Materials:** Models using unsupported shader features (SSS, displacement maps) may render as black. Stick to PBR metallic-roughness or unlit materials.

### Expressions not working

- **VRM:** Ensure blend shape groups are defined in the VRM metadata. The viewer looks for standard names: `happy`, `angry`, `sad`, `surprised`, `relaxed`, `blink`.
- **GLB:** Morph targets must be named. Unnamed morph targets can only be controlled by index via `setGlbMorphTarget`.
- **Live2D:** Expressions require `.exp3.json` files referenced in the model manifest.

### Physics jittering

- **Stiffness too high:** Reduce spring bone stiffness (try 0.5–2.0 range)
- **Frame rate dependent:** Physics simulation quality depends on frame rate. Low FPS causes instability.
- **Collider overlap:** Multiple colliders intersecting causes oscillation. Use the collider debug view (`toggleColliderDebug`) to visualize.

### Animation doesn't match the model

- **Bone naming:** Mixamo animations need retargeting via MIXAMO_BONE_MAP. Set `retarget: 'mixamo'` when loading.
- **BVH:** CMU motion capture uses different bone names. Set `retarget: 'bvh'` when loading.
- **Scale mismatch:** Animation and model may have different rest poses. The retargeting system handles rotation but not position offsets.
- **Missing bones:** If the animation targets bones that don't exist on the model, those tracks are silently skipped.
