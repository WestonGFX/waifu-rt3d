> **This is Part 4 of 4.** See also: [Part 1](2026-03-29-model-marketplace-research-part-1.md), [Part 2](2026-03-29-model-marketplace-research-part-2.md), [Part 3](2026-03-29-model-marketplace-research-part-3.md)

## 8. Conversion Pipelines

### 8.1 PMX to VRM

PMX (MikuMikuDance/MMD format) is a popular format with thousands of free anime models. Converting to VRM opens this library for our app.

**Method 1: Blender Pipeline (Recommended)**

```
PMX File
  -> Import into Blender (CATS Blender Plugin or mmd_tools addon)
  -> Fix armature orientation (MMD uses different axis)
  -> Map bones to VRM humanoid names
  -> Set up VRM materials (MToon shader)
  -> Configure blend shapes as VRM expressions
  -> Export VRM (VRM Addon for Blender)
```

Required Blender addons:
- **CATS Blender Plugin** (cats-blender-plugin) -- MMD import, bone fixing, auto-atlas
- **mmd_tools** -- Alternative MMD importer
- **VRM Addon for Blender** (saturday06/VRM-Addon-for-Blender) -- VRM export

Steps:
1. Install both addons in Blender
2. File > Import > MikuMikuDance Model (.pmx)
3. Use CATS "Fix Model" to clean up the armature
4. Use CATS "Convert to VRM" or manually map bones via VRM Addon
5. Set up expressions: Map MMD morph targets to VRM preset names
6. Configure MToon materials
7. File > Export > VRM (.vrm)

**Method 2: MMD to VRM Converter Tool**

Available on itch.io: "MMD to VROID Converter" by VTuber Shop
- Supports PMX to VRM conversion
- Also handles VMD (motion data) to VRM animation
- Windows and Mac supported
- Paid tool ($5-10)

**Method 3: Online Converters**

- Convert.Guru (convert.guru/pmx-converter) -- Simple web-based conversion
- AnyConv (anyconv.com/pmx-converter) -- Converts PMX to OBJ/FBX intermediate
- Quality varies significantly; manual cleanup usually needed

**Common Issues:**
- MMD models use different bone naming (Japanese names)
- MMD physics (rigid bodies + joints) don't map directly to VRM spring bones
- MMD materials need manual conversion to MToon
- Some MMD models have extremely high poly counts (100K+) and need decimation
- License: Many MMD models are "personal use only" -- check before converting

### 8.2 FBX to VRM

FBX is the most common interchange format for 3D models from Maya, 3ds Max, and other professional tools.

**Method 1: Blender Pipeline**

```
FBX File
  -> Import into Blender (built-in FBX importer)
  -> Check/fix humanoid rig (rename bones if needed)
  -> Add VRM humanoid mapping
  -> Set up MToon materials
  -> Configure expressions
  -> Export VRM
```

**Method 2: Unity Pipeline**

```
FBX File
  -> Import into Unity
  -> Install UniVRM package
  -> Configure humanoid avatar (Unity Humanoid rig)
  -> Add VRM components (Meta, BlendShapeProxy, etc.)
  -> Export VRM via UniVRM menu
```

This is often more reliable than Blender for FBX models that were designed for Unity.

**Method 3: RapidPipeline**

RapidPipeline (rapidpipeline.com) offers automated FBX-to-VRM conversion at scale. It handles bone mapping, material conversion, and optimization automatically. Commercial tool, primarily for studios.

**Method 4: AccuRIG + VRM Export**

AccuRIG (by Reallusion) can auto-rig any 3D mesh and export as VRM. Good for converting static models into rigged VRM avatars.

### 8.3 GLB/glTF to VRM

GLB is the binary form of glTF 2.0 -- which is the same base format as VRM. Converting GLB to VRM mainly requires adding VRM-specific extensions.

**Method 1: Blender**

```
GLB/glTF File
  -> Import into Blender (built-in)
  -> Add humanoid bone mapping (if not already humanoid)
  -> Add VRM metadata (license, author, etc.)
  -> Configure expressions
  -> Export VRM
```

**Method 2: Programmatic (three-vrm + custom script)**

Since VRM is just glTF + extensions, you can theoretically add VRM extensions to a GLB file programmatically. This requires:
1. Parse the GLB binary
2. Decode the JSON chunk
3. Identify humanoid bones in the skeleton
4. Add `VRMC_vrm` extension with humanoid mapping, meta, expressions
5. Optionally add `VRMC_springBone` and `VRMC_materials_mtoon`
6. Re-encode as GLB with .vrm extension

This is advanced but could enable in-app "convert to VRM" functionality.

### 8.4 Blender VRM Addon

The **VRM Addon for Blender** (saturday06/VRM-Addon-for-Blender) is the primary tool for VRM editing in Blender.

| Feature | Supported |
|---------|-----------|
| VRM Import (0.x + 1.0) | Yes |
| VRM Export (0.x + 1.0) | Yes |
| Blender versions | 2.93 to 5.0+ |
| Humanoid bone auto-detection | Yes |
| MToon material preview | Yes |
| Spring bone preview | Yes (in "Beyond" fork) |
| Expression editing | Yes |
| License metadata editing | Yes |
| Batch processing API | Yes (Python scripting) |

**Installation:**
- Blender Extensions (extensions.blender.org/add-ons/vrm/) -- recommended
- GitHub releases (saturday06/VRM-Addon-for-Blender)
- "Beyond" fork (tdw46/VRM-Addon-for-Blender-Beyond) adds: VRM upgrade/downgrade, spring bone viewport preview, picker tools, automation features

**Import Workflow:**
1. File > Import > VRM (.vrm)
2. Model loads with all VRM data preserved (expressions, spring bones, materials)
3. Edit as needed in Blender
4. File > Export > VRM (.vrm) -- re-exports with VRM extensions intact

**Export Validation:**
The addon validates the model before export:
- Checks all required humanoid bones are mapped
- Validates spring bone configuration
- Checks material compatibility
- Warns about texture size and polygon count

### 8.5 VRM Version Migration (0.x to 1.0)

**Method 1: UniVRM (Unity)**

UniVRM includes a built-in migration tool:
1. Import VRM 0.x file into Unity with UniVRM installed
2. Use "VRM0 > Migrate to VRM1" menu option
3. Handles bone renaming, expression migration, material conversion
4. Export as VRM 1.0

**Method 2: VRM Addon for Blender "Beyond" Fork**

The "Beyond" fork adds VRM upgrade/downgrade capability:
1. Import VRM 0.x
2. Use the addon's upgrade feature
3. Automatically maps old expression names to new ones
4. Export as VRM 1.0

**What Changes During Migration:**

| Aspect | VRM 0.x | VRM 1.0 |
|--------|---------|---------|
| Coordinate forward | Z- | Z+ (rotation applied) |
| Expression names | joy, sorrow, fun | happy, sad, relaxed |
| Spring bone spelling | stiffiness | stiffness |
| Collider shapes | Sphere only | Sphere + Capsule |
| License fields | 8 fields | 14 fields |
| Material extension | VRM.materialProperties | VRMC_materials_mtoon |

`@pixiv/three-vrm` handles both versions transparently, so migration is not strictly necessary for our app. However, VRM 1.0 is the future standard.

---

## 9. VRoid Studio Deep Dive

### 9.1 Feature Overview

| Attribute | Details |
|-----------|---------|
| **Platform** | Windows 10+, macOS 10.15+, Steam (all platforms) |
| **Price** | Free (no feature restrictions) |
| **Latest Version** | v1.29+ (as of 2026) |
| **Output Formats** | VRM 0.0 and VRM 1.0 |
| **Style** | Anime/manga exclusively |
| **Skill Required** | Low -- character creator UI, no 3D modeling knowledge |

**Character Customization Areas:**
- Face: shape, proportions, skin color, makeup
- Eyes: shape, iris pattern, color, pupil, highlights
- Eyebrows: shape, color, thickness
- Hair: style (presets + custom editing), color, highlights
- Body: height, proportions, build
- Clothing: presets, custom textures, layering
- Accessories: glasses, headwear, etc.

### 9.2 Export Pipeline Details

**Export Steps:**
1. File > Export > VRM
2. Choose format: VRM 0.0 or VRM 1.0
3. Set metadata:
   - Avatar Name (required for VRM 1.0)
   - Creator Name (required for VRM 1.0)
   - Contact Information (optional)
4. Set license permissions:
   - Who can use this avatar (Only Author / Licensed Persons / Everyone)
   - Commercial use (Allow / Disallow)
   - Violence (Allow / Disallow)
   - Sexual content (Allow / Disallow)
   - Modification (Allow / Disallow)
   - Redistribution (Allow / Disallow)
   - Credit required (Yes / No)
5. Adjust export settings:
   - Polygon reduction level
   - Texture quality (resolution)
   - Delete transparent meshes (recommended)
   - Material count reduction
6. Export .vrm file

**Export Optimization Options:**

| Option | Effect | Recommendation |
|--------|--------|----------------|
| Delete transparent meshes | Removes triangles with no visible texture | Always enable |
| Reduce polygons | Decimates mesh | Use for mobile/web targets |
| Texture quality | Reduces texture resolution | Use "Normal" for desktop apps |
| Reduce materials | Combines material slots | Enable for performance |

### 9.3 Polygon Reduction System

VRoid Studio includes an automatic polygon reduction system during export:

| Setting | Approx Triangle Count | Use Case |
|---------|----------------------|----------|
| No reduction | 50,000-100,000+ | High-end desktop, close-up |
| Light reduction | 30,000-50,000 | Desktop apps |
| Medium reduction | 15,000-30,000 | WebGL, mixed use |
| Heavy reduction | 7,500-15,000 | Mobile, VR Quest |

The reduction algorithm:
- Prioritizes visible areas (face, eyes) over hidden areas (under clothing)
- Reduces hair mesh complexity (hair is often 50%+ of total polygons)
- Merges UV islands where possible
- "Delete transparent meshes" is the single most effective optimization

**Post-Export Optimization:**

For further optimization beyond what VRoid Studio offers:
1. Import into Blender
2. Use Blender's Decimate modifier for fine-tuned control
3. Use CATS plugin "Atlas" feature to merge textures into a single material
4. Re-export as VRM

### 9.4 Limitations and Workarounds

| Limitation | Workaround |
|------------|------------|
| Anime style only | Use Blender or other tools for realistic models |
| Cannot import external .vrm for editing | Edit in Blender instead; VRoid uses .vroid project format |
| Hair customization limits | Export from VRoid, edit hair in Blender, re-export |
| Clothing limited to presets + custom textures | Model custom clothing in Blender, add to VRM |
| Models look "VRoid-ish" | Post-process in Blender (adjust proportions, materials) |
| No custom bone addition | Add bones in Blender post-export |
| No custom spring bone config | Configure spring bones in Blender or Unity |

### 9.5 Integration with Our App

VRoid Studio is the recommended path for users who want custom avatars. Our app should:

1. **Accept any .vrm file** -- drag-and-drop import
2. **Link to VRoid Studio download** in the model browser ("Create Your Own")
3. **Support both VRM 0.0 and 1.0** exports from VRoid
4. **Show a "Made with VRoid" badge** if detected (optional, for UI polish)
5. **Recommend export settings:** "Normal" texture quality, "Delete transparent meshes" enabled

---

## 10. Live2D Cubism Editor Deep Dive

### 10.1 Free vs Pro Feature Matrix

| Feature | FREE | PRO |
|---------|------|-----|
| **Price** | Free (< 10M JPY/yr revenue) | ~$200/year (indie) |
| **Art Parts Limit** | 100 pieces max | Unlimited |
| **Max Texture Size** | 1024x1024 | 4096x4096 |
| **Texture Count** | 1 | Multiple |
| **Warp Deformers** | Yes | Yes |
| **Rotation Deformers** | Yes | Yes |
| **Glue Deformers** | No | Yes |
| **Blend Deformers** | No | Yes |
| **Physics Simulation** | Basic | Full + wind |
| **Animation Timeline** | Yes | Yes + enhanced |
| **Form Animation** | No | Yes |
| **Blend Shapes** | Limited | Full |
| **Mesh Division** | 2x2, 3x3 | Custom sizes |
| **Commercial Use** | Yes (under revenue threshold) | Yes |
| **Trial** | 42-day PRO trial available | -- |

**Recommendation for users:** The Free tier (100 parts) is sufficient for a basic VTuber-style avatar with:
- Head, body, 2 arms
- 2 eyes (lids, irises, pupils), 2 eyebrows
- Mouth (upper lip, lower lip, tongue)
- Hair (front, side, back -- a few layers each)
- Simple clothing

That totals around 30-60 parts, well within the 100-part limit.

### 10.2 Complete Workflow

```
Step 1: Prepare Artwork
  - Create layered PSD in Photoshop/Krita/GIMP
  - Each movable part = separate layer
  - Proper naming convention for layers
  - Canvas size: 2048x2048 or 4096x4096

Step 2: Import into Cubism Editor
  - File > New Model from PSD
  - Layers become ArtMeshes
  - Auto-generated draw order

Step 3: Create Meshes
  - Select ArtMesh > Auto Mesh Generator (Ctrl+A for all)
  - Manual mesh refinement for key areas (eyes, mouth)
  - Finer mesh = smoother deformation but more CPU

Step 4: Set Up Deformers
  - Create Warp Deformers for bending (hair, body)
  - Create Rotation Deformers for rotation (head tilt, eye roll)
  - Build deformer hierarchy (head > face > eyes > pupils)

Step 5: Configure Parameters
  - Standard parameters: ParamAngleX/Y/Z, ParamEyeLOpen/ROpen, etc.
  - Add keys to parameters (min, default, max)
  - Set deformation at each keyform
  - Link ArtMeshes and deformers to parameters

Step 6: Physics Setup
  - Physics > Physics/Scene Blend Settings
  - Add physics groups (hair, accessories)
  - Configure pendulum chains (gravity, stiffness, damping)
  - Link input parameters to physics output

Step 7: Create Expressions
  - Animation Workspace > Create Expression
  - Define parameter overrides for each emotion
  - Export as .exp3.json files

Step 8: Create Motions
  - Animation Workspace > Timeline
  - Keyframe parameters over time
  - Set loop behavior, fade times
  - Export as .motion3.json files

Step 9: Export for SDK
  - File > Export for Runtime
  - Generates: .moc3, .model3.json, textures, .physics3.json
  - Optionally: .motion3.json, .exp3.json, .pose3.json
```

### 10.3 PSD Layer Requirements

**Layer Naming Convention:**
```
[Body]
  Body_Base
  Body_Shadow
[Arms]
  ArmL_Upper
  ArmL_Lower
  ArmR_Upper
  ArmR_Lower
[Face]
  Face_Base
  [Eyes]
    EyeL_White
    EyeL_Iris
    EyeL_Pupil
    EyeL_Highlight
    EyeL_Upper_Lid
    EyeL_Lower_Lid
    EyeR_White
    EyeR_Iris
    ...
  [Eyebrows]
    BrowL
    BrowR
  [Mouth]
    Mouth_Upper
    Mouth_Lower
    Mouth_Inside
    Tongue
  [Nose]
    Nose
[Hair]
  Hair_Front_L
  Hair_Front_R
  Hair_Side_L
  Hair_Side_R
  Hair_Back
[Accessories]
  Earring_L
  Earring_R
  Headband
```

**Best Practices:**
- Each layer should have generous padding (parts extend beyond visible edges)
- Hair layers should overlap slightly for seamless movement
- Eye parts need the most layers for maximum expressiveness
- Keep the PSD at the target texture resolution
- Group layers by body region

### 10.4 Mesh and Deformer System

**Mesh Types:**
- **Auto Mesh** -- Quick generation, works for most parts. Options: Standard, Detailed, and custom settings
- **Manual Mesh** -- Hand-drawn mesh vertices for precise control. Essential for mouth and eye lids
- **Mesh Division** -- Subdivides existing mesh (Free: 2x2, 3x3; Pro: custom)

**Deformer Types:**
- **Warp Deformer** -- Grid-based distortion (bending, stretching). Used for hair, body curves, fabric
- **Rotation Deformer** -- Rotates child parts around a pivot point. Used for head tilt, arm rotation, eye roll
- **Glue Deformer** (Pro only) -- Connects edges of separate ArtMeshes for seamless bending
- **Blend Deformer** (Pro only) -- Blends between multiple keyforms smoothly

**Deformer Hierarchy Example:**
```
Root
  ├─ Rotation: Head_Rotation (ParamAngleX, Y, Z)
  │   ├─ Warp: Face_Deform
  │   │   ├─ ArtMesh: Face_Base
  │   │   ├─ Rotation: EyeL_Rotation
  │   │   │   ├─ ArtMesh: EyeL_Iris
  │   │   │   └─ ArtMesh: EyeL_Pupil
  │   │   ├─ ArtMesh: EyeL_Upper_Lid
  │   │   └─ ArtMesh: Mouth_*
  │   ├─ Warp: Hair_Front_Deform
  │   │   └─ ArtMesh: Hair_Front_*
  │   └─ Warp: Hair_Side_Deform
  │       └─ ArtMesh: Hair_Side_*
  └─ Warp: Body_Deform
      ├─ ArtMesh: Body_Base
      └─ Rotation: ArmL_Rotation
          └─ ArtMesh: ArmL_*
```

### 10.5 Physics Simulation

Live2D's physics system uses pendulum chains driven by input parameters:

**Physics Chain Structure:**
```
Input (e.g., head rotation)
  → Pendulum Vertex 1 (root, no mobility)
    → Pendulum Vertex 2 (hair base, low mobility)
      → Pendulum Vertex 3 (hair mid, medium mobility)
        → Pendulum Vertex 4 (hair tip, high mobility)
          → Output Parameter (e.g., ParamHairFront)
```

**Key Parameters:**
| Parameter | Range | Effect |
|-----------|-------|--------|
| Mobility | 0-1 | How freely the vertex swings |
| Delay | 0-1 | Response lag (higher = more sluggish) |
| Acceleration | 0-10 | Speed amplification |
| Radius | 0+ | Collision sphere radius |

**Physics Setup Tips:**
- Hair should have 3-5 vertices per chain for natural movement
- Use low delay (0.1-0.3) for responsive hair
- Gravity direction should be (0, -1) for downward
- Wind can be added via the EffectiveForces.Wind vector
- Multiple physics groups (front hair, side hair, ribbon) create more natural overall movement

### 10.6 Export Pipeline

**Export for Runtime (MOC3):**

File > Export for Runtime generates:

| Output File | Generated From | Required |
|-------------|----------------|----------|
| .moc3 | Compiled model data | Yes |
| .model3.json | Auto-generated manifest | Yes |
| textures/*.png | Atlas textures | Yes |
| .physics3.json | Physics settings | If physics configured |
| .userdata3.json | User data tags | If user data exists |
| .cdi3.json | Display info | Optional |

**Export Settings:**
- Target SDK Version: Cubism 3.x, 4.x, or 5.x (determines moc3 version)
- Texture Size: 1024x1024 (Free), up to 4096x4096 (Pro)
- Export target path

**Expression Export:**
- Animation Workspace > File > Export Expression
- Each expression saves as a separate .exp3.json file
- Name the expression files to match the categories in model3.json

**Motion Export:**
- Animation Workspace > File > Export Motion
- Each motion saves as a separate .motion3.json file
- Set FadeInTime and FadeOutTime during export

---

## 11. Community Ecosystems

### 11.1 Discord Servers

| Server | Members | Focus | Link |
|--------|---------|-------|------|
| **Live2D Community** | 41,000+ | Live2D rigging, resources, commissions, troubleshooting | discord.com/invite/live2d |
| **VRoid** | 15,000+ | VRoid Studio help, model sharing, customization tips | Various |
| **VTuber community servers** | Varies | Model sharing, rigging tips, commissioning | Various |
| **VRChat** | 100,000+ | Avatar sharing, optimization, Unity workflow | discord.gg/vrchat |
| **M3 (Metaverse Makers)** | 5,000+ | CC0 avatars, open source 3D assets, CharacterStudio | Various |
| **three.js** | 30,000+ | Three.js development, VRM rendering | discord.gg/threejs |

### 11.2 Subreddits

| Subreddit | Subscribers | Focus | Useful For |
|-----------|-------------|-------|-----------|
| r/VirtualYoutubers | 500K+ | VTuber community, model showcases | Trends, popular models |
| r/Live2D | 15K+ | Live2D rigging and resources | Technical help, free resources |
| r/VRoid | 10K+ | VRoid Studio models and tips | Customization guides |
| r/VRChat | 200K+ | VRM avatar sharing (VRChat-focused) | Avatar discovery |
| r/threejs | 30K+ | Three.js development | Rendering help |
| r/VTuberAssets | 5K+ | Free/paid VTuber asset sharing | Direct model links |
| r/CommissionsOpen | Varies | Commission marketplace | Custom model creation |

### 11.3 GitHub Repositories

| Repository | Stars | Description |
|-----------|-------|-------------|
| [pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 3K+ | VRM loader for Three.js (our runtime) |
| [vrm-c/vrm-specification](https://github.com/vrm-c/vrm-specification) | 1K+ | Official VRM specification |
| [vrm-c/UniVRM](https://github.com/vrm-c/UniVRM) | 3K+ | Unity VRM implementation |
| [saturday06/VRM-Addon-for-Blender](https://github.com/saturday06/VRM-Addon-for-Blender) | 1K+ | Blender VRM addon |
| [guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | 1K+ | Live2D for PixiJS (our runtime) |
| [Live2D/CubismWebSamples](https://github.com/Live2D/CubismWebSamples) | 500+ | Official web SDK samples |
| [Live2D/CubismSpecs](https://github.com/Live2D/CubismSpecs) | 200+ | Cubism file format specs |
| [ToxSam/open-source-avatars](https://github.com/ToxSam/open-source-avatars) | 200+ | 300+ CC0 VRM avatars |
| [M3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio) | 500+ | Web-based VRM creator |
| [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0) | 100+ | Curated CC0 assets list |
| [pixiv/VRoidHub-API-Example](https://github.com/pixiv/VRoidHub-API-Example) | 50+ | VRoid Hub API examples |
| [Live2D/nizimaLIVEPluginAPI](https://github.com/Live2D/nizimaLIVEPluginAPI) | 50+ | nizima LIVE plugin API spec |

### 11.4 Creator Communities

**VTuber Model Creators (Notable):**

The VTuber model creation community is large and active. Key platforms for finding creators:

- **Booth.pm** -- Primary marketplace for Japanese creators
- **nizima** -- Official Live2D marketplace
- **Fiverr** -- VRM/Live2D conversion and rigging services ($10-$500+)
- **VGen** -- VTuber-focused commission platform
- **Skeb** -- Japanese commission platform
- **Twitter/X** -- Many riggers share work and take commissions via DMs
- **Jinxxy** -- VTuber asset marketplace (newer)
- **Payhip** -- Digital goods marketplace used by some avatar creators

### 11.5 VTuber Model Commissioning Ecosystem

For users who want fully custom models, the commissioning ecosystem is well-established:

**Live2D Model Commission Pricing (2025-2026 Market Rates):**

| Tier | Price Range | Includes |
|------|-------------|----------|
| Basic (half-body) | $150-$500 | Art + basic rigging, 3-5 expressions |
| Standard (half-body) | $500-$1,500 | Art + full rigging, 10+ expressions, physics |
| Premium (full-body) | $1,500-$5,000+ | Professional art + advanced rigging, many expressions, toggle outfits |
| Rig only (you provide art) | $100-$800 | Rigging + expressions + physics |

**VRM Model Commission Pricing:**

| Tier | Price Range | Includes |
|------|-------------|----------|
| VRoid edit | $50-$200 | Modified VRoid model with custom textures |
| Custom mesh | $500-$3,000+ | Fully custom 3D model from scratch |
| Full avatar | $1,000-$5,000+ | Custom mesh + rigging + expressions + clothing |

---

## 12. Caching and CDN Strategies

### 12.1 Local Caching Architecture

For our desktop app, all caching is local:

```
~/.waifu-rt3d/cache/
  ├── models/
  │   ├── vrm/
  │   │   ├── {hash}.vrm          # Full VRM files
  │   │   └── {hash}.meta.json    # Cached metadata
  │   └── live2d/
  │       ├── {hash}/             # Live2D model folder
  │       │   ├── model.moc3
  │       │   ├── model.model3.json
  │       │   ├── textures/
  │       │   └── ...
  │       └── {hash}.meta.json
  ├── thumbnails/
  │   ├── {hash}_200.webp          # Small thumbnails
  │   ├── {hash}_400.webp          # Medium thumbnails
  │   └── {hash}_800.webp          # Large thumbnails
  ├── catalogs/
  │   ├── osa_catalog.json         # Open Source Avatars catalog cache
  │   ├── sketchfab_cache.json     # Sketchfab search results cache
  │   └── vroidhub_cache.json      # VRoid Hub search results cache
  └── cubism_core/
      └── live2dcubismcore.min.js   # User-downloaded Cubism Core runtime
```

**Cache Policy:**
- Model files: Cache indefinitely (immutable content-addressed by hash)
- Thumbnails: Cache indefinitely, regenerate on demand
- Catalog JSON: Cache for 24 hours, then refresh from source
- Search results: Cache for 1 hour
- Total cache size limit: Configurable, default 2 GB
- LRU eviction when cache is full

### 12.2 Progressive Loading

For VRM models loaded from remote sources:

```
Phase 1: Show thumbnail (instant, from cache or remote)
Phase 2: Download full VRM file (show progress bar)
Phase 3: Parse GLB header + JSON (immediate after download)
Phase 4: Load textures (show low-res first, then full-res)
Phase 5: Initialize spring bones and expressions (async)
Phase 6: Model ready for display
```

For Live2D models:

```
Phase 1: Load model3.json (small, fast)
Phase 2: Load .moc3 binary (may be large)
Phase 3: Load textures (parallel)
Phase 4: Load physics3.json (small)
Phase 5: Load expressions (parallel, small files)
Phase 6: Model ready for display
```

### 12.3 Compression Strategies

| Strategy | Savings | Implementation |
|----------|---------|----------------|
| gzip VRM files | 30-50% | Enable gzip for .vrm downloads |
| WebP thumbnails | 70-80% vs PNG | Convert thumbnails to WebP |
| Texture atlas | 20-40% materials | CATS plugin or manual atlas |
| Brotli compression | 40-60% | For HTTP-served content |
| Draco mesh compression | 50-70% geometry | glTF Draco extension (not VRM-compatible) |

Note: VRM files cannot use Draco compression because VRM requires specific glTF extensions that are incompatible with Draco. However, texture compression (KTX2/Basis) may be compatible with some VRM loaders.

### 12.4 Thumbnail Pipeline

```python
"""Generate and cache thumbnails for model browser."""

import hashlib
from pathlib import Path

CACHE_DIR = Path.home() / ".waifu-rt3d" / "cache" / "thumbnails"

def get_thumbnail_path(model_path: str, size: int = 200) -> Path:
    """
    Get the cached thumbnail path for a model file.

    Args:
        model_path: Path to the model file
        size: Thumbnail dimension (square)

    Returns:
        Path to the cached thumbnail WebP file
    """
    content_hash = hashlib.sha256(Path(model_path).read_bytes()).hexdigest()[:16]
    return CACHE_DIR / f"{content_hash}_{size}.webp"
```

For VRM thumbnails:
1. Check if the VRM file contains a thumbnail texture (VRM 0.x: `meta.texture`, VRM 1.0: `meta.thumbnailImage`)
2. If yes, extract and resize to target dimensions
3. If no, render a 3D preview using a headless Three.js renderer or use a placeholder

For Live2D thumbnails:
1. Check if the model3.json directory contains a preview image
2. If no, render using pixi-live2d-display in an offscreen canvas
3. Cache as WebP for efficient storage

---

## 13. Search UX Patterns

### 13.1 VRChat Avatar Search

VRChat's avatar browser (in-app) provides:
- **Grid view** of avatar thumbnails
- **Search by name** keyword
- **Filter by:** Featured, Recent, Popular, Random
- **Performance rank badges** (Excellent/Good/Medium/Poor/Very Poor) on each thumbnail
- **Quick preview** on hover/click (shows turntable animation)
- **Favorite** system
- **"Try On"** button for instant preview

**External: VRCDB (vrcdb.com)**
- Searchable database of millions of VRChat avatars
- Search by name, tags, author
- Shows polygon count, platform compatibility
- Links to VRChat worlds where the avatar is available

### 13.2 VSeeFace Model Selection

VSeeFace uses a simple file-based approach:
- **File picker dialog** for VRM files
- Recently used models list
- No built-in marketplace or search
- Model loads immediately after selection
- Expression and spring bone testing panel

VSeeFace's simplicity is a good reference for the "local import" path in our app. Users who already have models want a fast path to load them.

### 13.3 Warudo Model Browser

Warudo provides a more polished model selection experience:
- **Source dropdown** to select model type (VRM, .warudo)
- **Preview Gallery** button for visual browsing
- **Onboarding Assistant** guides new users through model loading
- **Live preview** in the main viewport after selection
- **Auto-configuration** of basic parameters after loading
- **Steam Workshop integration** for community-shared assets

Key UX pattern: Warudo's onboarding assistant is excellent at reducing the friction of first-time model loading. Our app should have a similar guided experience.

### 13.4 VRCDB Search Interface

VRCDB (vrcdb.com) is a web-based avatar search engine:
- **Text search** with autocomplete
- **Tag filtering** (anime, furry, male, female, etc.)
- **Sort options:** Popularity, Recent, Name
- **Thumbnail grid** with lazy loading
- **Detail view** showing: poly count, materials, file size, performance rank
- **Direct links** to VRChat worlds

### 13.5 Best Practices for Our App

Based on all the patterns studied, our model browser should include:

**Search & Discovery:**
- Keyword search across all sources simultaneously
- Tag/category filtering (anime, realistic, male, female, custom)
- License filtering (CC0 only, commercial OK, any)
- Source filtering (Built-in, VRoid Hub, Sketchfab, Local)
- Sort by: Relevance, Popularity, Recent, Quality Score

**Display:**
- Grid view (default, 4-6 columns) with thumbnail, name, quality badge
- List view (compact, more metadata visible)
- Quality score badge on each thumbnail (Excellent/Good/Acceptable/Poor)
- License badge (CC0 green, CC-BY blue, Personal Use yellow, Unknown red)
- Source icon (VRoid Hub, Sketchfab, Local File, CC0 Catalog)
- Format indicator (VRM / Live2D)

**Preview:**
- Quick preview on hover (animated turntable for VRM, idle animation for Live2D)
- Full preview panel with model info, license details, quality metrics
- "Try" button to load model temporarily before committing
- Expression preview (show all available expressions)

**Import:**
- Drag-and-drop zone always visible
- File picker with format filter (.vrm, .moc3, .model3.json, .zip)
- Auto-detect format and version
- Compatibility check before loading (VRM version, moc3 version)
- License metadata display after import

**Pagination & Loading:**
- Infinite scroll with lazy loading (not page-based)
- Skeleton thumbnails while loading
- Progressive thumbnail loading (blur-up technique)
- Cache search results for back-navigation

---

## 14. Model Preview Rendering

### 14.1 Thumbnail Generation

**VRM Thumbnails:**

Option A: Extract embedded thumbnail
```javascript
// VRM files may contain a thumbnail texture
const gltf = await loader.parseAsync(arrayBuffer);
const vrm = gltf.userData.vrm;
const meta = vrm.meta;
// VRM 1.0: meta.thumbnailImage (glTF image index)
// VRM 0.x: meta.texture (texture index)
```

Option B: Render a 3D thumbnail
```javascript
// Use an offscreen renderer to capture a pose
const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
renderer.setSize(400, 400);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
camera.position.set(0, 1.3, 2.5); // Frame the face/upper body

// Load and pose the model
loader.load(vrmUrl, (gltf) => {
  scene.add(gltf.scene);
  const vrm = gltf.userData.vrm;

  // Set a nice expression
  vrm.expressionManager?.setValue('happy', 0.5);
  vrm.update(0);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/webp', 0.8);
  // Save to cache
});
```

**Live2D Thumbnails:**

```javascript
// Render using pixi-live2d-display in an offscreen canvas
const app = new PIXI.Application({
  width: 400,
  height: 400,
  backgroundAlpha: 0,
});
const model = await Live2DModel.from('model.model3.json');
model.anchor.set(0.5, 0.5);
model.scale.set(0.3);
app.stage.addChild(model);

// Set an idle expression
model.expression('happy');

// Render one frame and capture
app.render();
const dataUrl = app.view.toDataURL('image/webp', 0.8);
app.destroy();
```

### 14.2 Live 3D Preview

For the model browser's detail view, render a live interactive preview:

**VRM Live Preview Features:**
- Turntable rotation (auto-rotate or mouse-drag)
- Zoom in/out (scroll wheel)
- Expression cycling (buttons to trigger each expression)
- Spring bone demonstration (slight head movement to show physics)
- Background color picker (to preview model against different colors)
- Wireframe toggle (to see mesh quality)

**Implementation:**
```javascript
// Reuse the existing viewer.html infrastructure
// Send preview commands via postMessage
viewerIframe.contentWindow.postMessage({
  type: 'preview_model',
  url: modelUrl,
  options: {
    autoRotate: true,
    showExpressions: true,
    backgroundColor: '#1a1a2e',
  }
}, '*');
```

### 14.3 Live2D Preview Rendering

For Live2D models in the preview panel:

**Features:**
- Idle animation playback
- Mouse tracking (eyes follow cursor)
- Expression cycling
- Tap interaction (if HitAreas defined)
- Physics demonstration
- Parameter slider panel (for advanced users)

### 14.4 Lazy Loading Strategy

For the model browser grid:

```
Viewport Detection
  ├── Above viewport: Loaded, keep in memory
  ├── In viewport: Load thumbnail immediately
  │   ├── Placeholder skeleton (instant)
  │   ├── Blur-up low-res thumbnail (50ms)
  │   └── Full thumbnail loaded (200-500ms)
  ├── Near viewport (+2 rows): Pre-load thumbnail
  └── Below viewport: Don't load yet

On Scroll:
  - Intersection Observer triggers loading for visible + near items
  - Items far above viewport can release thumbnail memory (keep in disk cache)
  - Never load more than 50 thumbnails simultaneously
```

```javascript
// Intersection Observer for lazy thumbnail loading
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const modelCard = entry.target;
        const thumbnailUrl = modelCard.dataset.thumbnail;
        // Load thumbnail
        const img = new Image();
        img.src = thumbnailUrl;
        img.onload = () => {
          modelCard.querySelector('.thumbnail').src = thumbnailUrl;
          modelCard.classList.add('loaded');
        };
        observer.unobserve(modelCard);
      }
    });
  },
  { rootMargin: '200px' } // Pre-load 200px before visible
);

// Observe all model cards
document.querySelectorAll('.model-card').forEach((card) => {
  observer.observe(card);
});
```

---

## 15. Recommendations for the Model Browser

### Architecture: Tiered Source Integration

```
Tier 1: Built-in (no auth, instant)
  - CC0 catalog from open-source-avatars (300+ models)
  - Bundled sample Live2D models (2-3 Cubism SDK samples)
  - Quality scored and pre-cached thumbnails

Tier 2: API-integrated (auth required, searchable)
  - VRoid Hub API (OAuth 2.0) -- best VRM source with real API
  - Sketchfab API (token auth) -- already integrated
  - Combined search across both APIs

Tier 3: Link-out (no API, open in browser)
  - Booth.pm (VRM + Live2D) -- curated search URLs
  - Gumroad -- discovery search URLs
  - itch.io -- asset category links
  - nizima (Live2D) -- marketplace link
  - BOOTHPLORER -- third-party catalog

Tier 4: User-created (local import)
  - VRoid Studio export (VRM) -- with "Create Your Own" link
  - Cubism Editor export (Live2D) -- with tutorial link
  - Any .vrm or .moc3 file drag-and-drop
  - Zip archive import (Live2D packages)
```

### Priority Implementation Order

1. **Expand CC0 VRM catalog** (Low effort, high value)
   - Integrate Open Source Avatars registry (300+ models, JSON-based)
   - Add to existing `cc0_models.json` or create `cc0_vrm_catalog.json`
   - Pre-generate and cache thumbnails
   - Add quality scoring badges

2. **Local file import polish** (Essential)
   - Drag-and-drop .vrm files
   - Drag-and-drop Live2D folders (or .zip archives)
   - Auto-detect format and version
   - Compatibility validation before loading
   - License metadata display on import

3. **VRoid Hub API integration** (Medium effort, highest browse value)
   - Developer registration
   - OAuth 2.0 flow (Electron popup window)
   - Search with filters (downloadable, tags, popularity)
   - License metadata display
   - Secure token storage

4. **Quality assessment and badges** (UX polish)
   - Automated quality scoring on all models
   - Performance badges (Excellent/Good/Acceptable/Poor)
   - License badges (CC0/CC-BY/Personal/Unknown)
   - Expression completeness indicator
   - Polygon count display

5. **Cubism Core auto-download** (Required for Live2D)
   - First-run detection of missing Cubism Core
   - User-friendly download prompt
   - Auto-download from Live2D CDN (if ToS permits) or manual link
   - Local caching after first download

6. **Link-out pages** (Low effort, good discoverability)
   - "More Models" section with curated links
   - Pre-configured search URLs for each marketplace
   - Brief description of each source and what to expect
   - Import instructions for each source

7. **Live 3D/2D preview** (UX excellence)
   - Turntable preview for VRM
   - Animated preview for Live2D
   - Expression cycling in preview
   - "Try" button for temporary loading

### Format Compatibility Checklist

Before displaying a model in the browser, validate:

| Check | VRM | Live2D |
|-------|-----|--------|
| File exists and parses | .vrm loads via three-vrm | .model3.json is valid JSON |
| Version supported | VRM 0.x or 1.0 (both OK) | moc3 v3-v5 (not v6) |
| Textures present | Embedded in .vrm | Referenced files exist |
| Rigging valid | 15 required humanoid bones present | Parameters defined |
| License readable | VRM metadata present | N/A (manual) |
| Quality assessed | Poly count, textures, expressions | Part count, expressions |
| Thumbnail available | Embedded or generated | Generated from render |

---

## Sources

### Official Documentation
- [VRoid Hub](https://hub.vroid.com/en)
- [VRoid Hub API Reference](https://developer.vroid.com/en/api/)
- [VRoid Hub OAuth API](https://developer.vroid.com/en/api/oauth-api.html)
- [VRoid Hub Quick Start](https://developer.vroid.com/en/api/quick-start.html)
- [VRoid Hub Load Character](https://developer.vroid.com/en/api/load-character.html)
- [VRoid Hub API Example (GitHub)](https://github.com/pixiv/VRoidHub-API-Example)
- [VRoid Hub License Conditions](https://vroid.pixiv.help/hc/en-us/articles/360016417013-About-VRoid-Hub-s-conditions-of-use-and-VRM-license)
- [VRoid Hub Developer Registration](https://hub.vroid.com/en/developer/registration)
- [VRoid Studio](https://vroid.com/en/studio)
- [VRoid Studio VRM Export FAQ](https://vroid.pixiv.help/hc/en-us/articles/38726063278233-How-do-I-export-a-model-as-VRM)
- [VRoid Studio VRM 1.0 Export](https://vroid.pixiv.help/hc/en-us/articles/15760756822297)

### VRM Specification
- [VRM 0.0 Specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/0.0/README.md)
- [VRM 1.0 Specification (VRMC_vrm)](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/README.md)
- [VRM 1.0 Humanoid Bones](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md)
- [VRM 1.0 Expressions](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/expressions.md)
- [VRM 1.0 Node Constraint](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_node_constraint-1.0/README.md)
- [VRM Features and Specification](https://vrm.dev/en/vrm/vrm_features/)
- [VRM Consortium](https://vrm-consortium.org/en/)
- [VRM PUBLIC LICENSE 1.0](https://vrm.dev/en/licenses/1.0/)
- [VRM at Library of Congress](https://www.loc.gov/preservation/digital/formats/fdd/fdd000564.shtml)

### Three-VRM
- [@pixiv/three-vrm GitHub](https://github.com/pixiv/three-vrm)
- [@pixiv/three-vrm API Docs (VRMHumanoid)](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html)
- [@pixiv/three-vrm Migration Guide](https://pixiv.github.io/three-vrm/docs/documents/migration-guide-1.0.html)

### Sketchfab
- [Sketchfab Data API v3](https://sketchfab.com/developers/data-api/v3)
- [Sketchfab Swagger UI](https://docs.sketchfab.com/data-api/v3/index.html)
- [Sketchfab Download API](https://sketchfab.com/developers/download-api)
- [Sketchfab Downloading Models](https://sketchfab.com/developers/download-api/downloading-models)
- [Sketchfab Python Examples](https://sketchfab.com/developers/data-api/v3/python)
- [Sketchfab VRM Models](https://sketchfab.com/tags/vrm)
- [Sketchfab CC0 Models](https://sketchfab.com/tags/cc0)

### Live2D
- [Live2D SDK License](https://www.live2d.com/en/sdk/license/)
- [Live2D Expandable Applications](https://www.live2d.com/en/sdk/license/expandable/)
- [Live2D SDK License FAQ](https://help.live2d.com/en/sdk/sdk_001/)
- [Live2D Expandable App Definition](https://help.live2d.com/en/sdk/sdk_004/)
- [Live2D Business Scale Determination](https://help.live2d.com/en/sdk/sdk_007/)
- [Live2D Free vs Pro Comparison](https://www.live2d.com/en/cubism/comparison/)
- [Live2D File Types and Extensions](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/)
- [Live2D Export MOC3/Motion3 Files](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- [Live2D Export Model3.json](https://docs.live2d.com/en/cubism-editor-manual/export-model3-json/)
- [Live2D model3.json Spec (CubismSpecs)](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)
- [Live2D Cubism 5.3 SDK Compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5-3/)
- [Live2D Cubism 5 SDK Compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5/)
- [Live2D Cubism 2 to 3 Conversion](https://docs.live2d.com/en/cubism-editor-manual/convert-data-cubism-2-to-3/)
- [Live2D Sample Models (Free)](https://www.live2d.com/en/learn/sample/)
- [Live2D Cubism Manual](https://docs.live2d.com/en/cubism-editor-manual/top/)
- [Live2D Cubism Tutorials](https://docs.live2d.com/en/cubism-editor-tutorials/top/)
- [Live2D Mesh Editor](https://docs.live2d.com/en/cubism-editor-manual/mesh-edit/)
- [Live2D Parameter Editing](https://docs.live2d.com/en/cubism-editor-manual/edit-parameters/)
- [Live2D Community Discord](https://discord.com/invite/live2d)
- [Live2D Communities](https://www.live2d.com/en/community/)

### nizima
- [nizima Marketplace](https://docs.nizima.com/en/guide/introduction/)
- [nizima Model Specification](https://docs.nizima.com/en/model-spec/)
- [nizima LIVE Plugin API (GitHub)](https://github.com/Live2D/nizimaLIVEPluginAPI)
- [nizima LIVE Download](https://nizimalive.com/en/download/)
- [nizima LIVE Plugin Tutorial](https://docs.live2d.com/nizimalive/en/tutorials/plugins/)

### pixi-live2d-display
- [pixi-live2d-display GitHub](https://github.com/guansss/pixi-live2d-display)
- [pixi-live2d-display Complete Guide](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide)
- [CubismWebSamples (GitHub)](https://github.com/Live2D/CubismWebSamples)

### Open Source Model Collections
- [Open Source Avatars (300+ CC0)](https://www.opensourceavatars.com/en/gallery)
- [Open Source Avatars GitHub](https://github.com/ToxSam/open-source-avatars)
- [Open Source 3D Assets GitHub](https://github.com/toxsam/open-source-3D-assets)
- [OSA Gallery GitHub](https://github.com/ToxSam/osa-gallery)
- [MJMoonbow/VRMavatars](https://github.com/MJMoonbow/VRMavatars)
- [madjin/vrm-samples](https://github.com/madjin/vrm-samples)
- [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0)
- [M3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio)
- [CC0 Open Source VRMs (Hyperfy)](https://docs.hyperfy.xyz/guides/avatars/opensource/)

### Marketplaces
- [Booth.pm 3D Models](https://booth.pm/en/browse/3D%20Models)
- [Booth.pm Free Live2D](https://booth.pm/en/search/free%20live2d)
- [Booth.pm Live2D](https://booth.pm/en/search/live2d)
- [BOOTHPLORER](https://boothplorer.com/)
- [Gumroad](https://gumroad.com)
- [itch.io Live2D Assets](https://itch.io/game-assets/free/tag-live2d)
- [Live3D.io Free VTuber Models](https://live3d.io/vtuber-model)

### Conversion Tools
- [VRM Addon for Blender](https://extensions.blender.org/add-ons/vrm/)
- [VRM Addon for Blender (GitHub)](https://github.com/saturday06/VRM-Addon-for-Blender)
- [VRM Addon for Blender Beyond (GitHub)](https://github.com/tdw46/VRM-Addon-for-Blender-Beyond)
- [Convert.Guru VRM Converter](https://convert.guru/vrm-converter)
- [Convert.Guru PMX Converter](https://convert.guru/pmx-converter)
- [MMD to VRM Converter (itch.io)](https://vtuber.itch.io/dssconverter)
- [RapidPipeline FBX to VRM](https://rapidpipeline.com/en/a/conversions-fbx-to-vrm/)

### Quality & Performance
- [VRChat Performance Ranks](https://creators.vrchat.com/avatars/avatar-performance-ranking-system/)
- [VRChat Avatar Optimization Tips](https://creators.vrchat.com/avatars/avatar-optimizing-tips/)
- [Mona VRM Requirements](https://docs.monaverse.com/create/creating-avatars/vrm-requirements)
- [Cluster VRM Optimization](https://medium.com/@cluster_official/optimizing-avatars-vrm-models-in-unity-for-cluster-c5f7f1aaf920)

### Search UX References
- [VSeeFace](https://www.vseeface.icu/)
- [VSeeFace Manual (GitHub)](https://github.com/emilianavt/VSeeFaceManual)
- [Warudo Handbook](https://docs.warudo.app/)
- [Warudo Getting Started](https://docs.warudo.app/docs/tutorials/getting-started)
- [Warudo Character Mod](https://docs.warudo.app/docs/modding/character-mod)
- [VRCDB Avatar Search](https://vrcdb.com/)

### CDN & Caching
- [Three.js Forum: CDN for 3D Models](https://discourse.threejs.org/t/cdn-or-storage-for-3d-models/18969)
- [VRM Model Factory: Advanced Caching](https://vrmodelfactory.com/faster-display-of-3d-models-with-advanced-caching/)
- [AWS CloudFront for WebGL](https://aws.amazon.com/blogs/networking-and-content-delivery/serving-compressed-webgl-websites-using-amazon-cloudfront-amazon-s3-and-aws-lambda/)
- [3D Optimization: 26MB to 560KB](https://echobind.com/post/3D-Optimization-for-Web-26mb-down-to-560kb)

### Community
- [VRM BlendShape Settings](https://vrm.dev/en/univrm/blendshape/univrm_blendshape/)
- [ShiraLive2D Free Models](https://shiralive2d.com/live2d-sample-models/)
- [Live2D Cubism Cookbook](https://r3dhummingbird.gitbook.io/live2d-cubism-cookbook/modeling-and-rigging/basic-workflow)
- [Understanding Live2D Model Files (Medium)](https://medium.com/@vesper_illust/understanding-live2d-model-data-files-for-vtube-studio-0ada080a35b2)
