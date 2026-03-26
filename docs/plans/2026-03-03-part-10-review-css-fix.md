# Part 10 Post-Implementation Review — One CSS Fix

> **STATUS: PLANNING** (Mar 2, 2026)

## Context

Part 10 (Vite Bundle Splitting) was implemented and the build succeeds with correct output. A thorough post-implementation review found exactly one real issue — a semantically wrong but harmless `flex: 1` in the Suspense fallback div inside `SettingsDrawer.tsx`. All other concerns raised by the explore agent were false positives (the build already proved the vite config syntax is valid; Rollup deduplicates lazy() calls to the same path — the build output confirms only ONE chunk per wizard was created).

## What to Fix

**File:** `frontends/sakura/src/components/SettingsDrawer.tsx` — lines 72–83

**Problem:** The Suspense fallback `<div>` has `flex: 1` which is meaningless because its parent (`div.flex-1.overflow-y-auto`) is a flex *item*, not a flex *container*. It doesn't break anything — `height: 100%` still works correctly (the scroll container has a definite height from the flex layout above it), and `display: flex + align-items + justify-content` correctly centers the text.

**Fix:** Remove `flex: 1`. Swap to `minHeight: '100%'` as a safer cross-browser alternative to `height: '100%'` inside a scroll container (belt-and-suspenders).

```tsx
// OLD (inside SettingsDrawer.tsx Suspense fallback):
<div style={{
  display: 'flex',
  flex: 1,          // ← remove (parent is not a flex container)
  height: '100%',   // ← change to minHeight
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-secondary)',
  fontSize: 13,
}}>

// NEW:
<div style={{
  display: 'flex',
  minHeight: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-secondary)',
  fontSize: 13,
}}>
```

## Verification

1. After fix, open Settings drawer — "Loading settings…" text appears centered while the chunk loads on first open
2. After first open, subsequent opens show SettingsView instantly (cached chunk)
3. `npx vite build` — no new warnings, same chunk sizes as before

## All Other Findings (False Positives / Non-Issues)

| Claim | Reality |
|-------|---------|
| "Missing braces in vite.config.ts" | FALSE — syntax is valid object method shorthand; build proved it works |
| "Chunk duplication from two lazy() calls" | FALSE — Rollup deduplicates by path; build output shows 1 chunk per wizard |
| "Incorrect .then() export pattern" | FALSE — this is the standard correct approach for named exports with React.lazy() |
| "Missing animation in MobileApp settings" | Out of scope — mobile tab navigation never had animations |
| "Test static imports" | Expected and correct for test files |

---
---

# Asset Organization + Rendering Engine Guide + New Format Support

> **STATUS: COMPLETE** (Mar 2, 2026)

## Context

The project supports 3 rendering engines (Three.js VRM, PIXI Live2D, Unity WebGL) with assets scattered in a flat structure. The user is adding many GLB character models and wants:

1. **Organized asset folders** — group models by format/engine type
2. **Comprehensive rendering engine guide** — developer + user-facing docs
3. **New format support** — PMX/MMD, FBX animations, Spine 2D, VTube Studio, Blender workflows

Current asset structure (flat, disorganized):
```
backend/storage/avatars/      ← 11 VRM files, mixed together
backend/storage/live2d/       ← 16 Live2D models, already in subdirs
backend/storage/animations/   ← empty
```

### Format Support Matrix (Current vs Planned)

| Format | Extension | Engine | Current Status | Plan |
|--------|-----------|--------|---------------|------|
| VRM 0.x/1.x | `.vrm` | Three.js + VRMLoaderPlugin | ✅ Working | Keep, organize |
| GLB/GLTF | `.glb`, `.gltf` | Three.js GLTFLoader | ✅ Working | Organize into subfolder |
| Live2D Cubism | `.moc3`, `.model3.json` | PIXI + pixi-live2d-display | ✅ Working | Keep structure |
| VRMA | `.vrma` | Three.js VRM Animation | ✅ Working | Keep in animations/ |
| BVH | `.bvh` | Inline parser + retargeting | ✅ Working | Keep in animations/ |
| FBX | `.fbx` | Three.js FBXLoader | ❌ Not yet | **Add loader** |
| PMX/MMD | `.pmx`, `.pmd` | Three.js MMDLoader | ❌ Not yet | **Add loader** |
| Spine | `.json`/`.skel` + `.atlas` | pixi-spine | ❌ Not yet | **Add PIXI plugin** |
| VTube Studio | `.vtube` | = Live2D + tracking | ✅ (it's just Live2D) | **Document workflow** |
| Blender | `.blend` → export | N/A (export to GLB/VRM) | ✅ (via export) | **Document workflow** |
| Unity AssetBundle | `.unity3d` | Unity WebGL | ⚠️ Partial | **Document workflow** |

---

## Part A: Asset Folder Reorganization

### New Directory Structure

```
backend/storage/
├── models/
│   ├── vrm/               ← VRM humanoid avatars
│   │   ├── Kitsune.vrm
│   │   ├── Panicandy.vrm
│   │   └── ...
│   ├── glb/               ← GLB/GLTF character models
│   │   ├── robot_kyle.glb
│   │   └── ...
│   ├── mmd/               ← PMX/PMD models (future)
│   │   └── miku_v4x/
│   │       ├── model.pmx
│   │       └── textures/
│   └── spine/             ← Spine 2D models (future)
│       └── character/
│           ├── skeleton.json
│           └── atlas.atlas
├── live2d/                ← Live2D Cubism models (keep existing structure)
│   ├── ariu/
│   └── ...
├── animations/            ← Animation clips (all formats)
│   ├── vrma/              ← VRM Animation files
│   ├── glb/               ← GLB animation clips (Mixamo, mocap)
│   ├── fbx/               ← FBX animations (future)
│   └── bvh/               ← BVH motion capture
└── avatars/               ← DEPRECATED symlink → models/vrm/ (backwards compat)
```

### Migration Strategy

1. Create new `backend/storage/models/vrm/` and `backend/storage/models/glb/` directories
2. Move existing VRM files from `avatars/` → `models/vrm/`
3. Create a symlink `avatars/ → models/vrm/` for backwards compatibility
4. Update `backend/models/avatar_browser.py` to scan new paths
5. Update `backend/server.py` StaticFiles mount to serve `/files/models/`
6. Keep `/files/avatars/` mount as alias (backwards compat with existing character DB entries)
7. Update model discovery to scan both VRM and GLB subdirectories

### Modified Files

- `backend/models/avatar_browser.py` — scan `models/vrm/` + `models/glb/` + `models/mmd/`
- `backend/server.py` — add `/files/models/` StaticFiles mount alongside existing `/files/avatars/`
- `backend/config/app.json` — update default `model_vrm` path

### Backwards Compatibility

- Existing `model_vrm` URLs like `/files/avatars/Panicandy.vrm` continue to work via symlink
- New models use `/files/models/vrm/Name.vrm` or `/files/models/glb/Name.glb`
- `avatar_browser.list_local_models()` returns models from ALL format subdirectories with a `format` field

---

## Part B: New Format Support

### B.1 — FBX Loader (Animation Import)

**Purpose:** Import Mixamo animations and animation marketplace FBX files.

**Approach:** Three.js includes `FBXLoader` in the examples. We need to:
1. Download `FBXLoader.js` to `frontends/shared/lib/`
2. Import it in `viewer.html`
3. Extend `ClipLayer.loadClip()` to detect `.fbx` extension and use FBXLoader
4. Apply Mixamo bone retargeting (MIXAMO_BONE_MAP already exists)

**Modified files:**
- `frontends/shared/viewer/viewer.html` — import FBXLoader, extend ClipLayer
- `frontends/shared/lib/FBXLoader.js` — new file (from Three.js examples)
- `frontends/shared/lib/fflate.module.js` — FBX dependency (decompression)

**Note:** FBX is primarily for **animations**, not character models. Users export Mixamo animations as FBX, and we retarget them onto VRM/GLB characters.

### B.2 — PMX/MMD Loader (Character Models)

**Purpose:** Load MikuMikuDance models — huge community library of anime characters.

**Approach:** Three.js includes `MMDLoader` in examples. We need to:
1. Download `MMDLoader.js`, `MMDParser.js`, `MMDAnimationHelper.js` to `frontends/shared/lib/`
2. Extend `loadModel()` in viewer.html to detect `.pmx`/`.pmd` extensions
3. Add PATH C (MMD) alongside PATH A (VRM) and PATH B (GLB)
4. Map MMD morphs to our expression system (MMD uses Japanese morph names)
5. Support VMD animation files (MMD's animation format)

**MMD Expression Mapping:**
```
あ (a) → aa       ← mouth shapes
い (i) → ih
う (u) → uh
え (e) → ee
お (o) → oh
まばたき → blink
笑い → happy
怒り → angry
```

**Modified files:**
- `frontends/shared/viewer/viewer.html` — PATH C for MMD, expression mapping
- `frontends/shared/lib/MMDLoader.js` — new (from Three.js examples)
- `frontends/shared/lib/MMDParser.js` — new (from Three.js examples)
- `backend/models/avatar_browser.py` — scan for `.pmx`/`.pmd` files

**Physics:** MMD models have their own physics system (rigid bodies + joints). Three.js MMDPhysics handles this, but requires Ammo.js (Bullet physics WASM). We'll make physics optional — load without physics if Ammo.js isn't available.

### B.3 — Spine 2D Loader

**Purpose:** Support Spine skeletal animation (used in many indie games, gacha games).

**Approach:** Use `pixi-spine` (already a PIXI plugin, fits our Live2D PIXI pipeline):
1. Install `pixi-spine` package
2. Create `useSpine2D.ts` hook (sibling to `useLive2D.ts`)
3. Add `'spine'` to `ViewerMode` type in viewerStore
4. Spine models use `.json` skeleton + `.atlas` texture atlas

**Modified files:**
- `frontends/sakura/src/hooks/useSpine2D.ts` — new hook
- `frontends/sakura/src/stores/viewerStore.ts` — add `'spine'` mode
- `frontends/sakura/package.json` — add pixi-spine dependency

### B.4 — VTube Studio Compatibility Notes

VTube Studio (`.vtube`) files are **standard Live2D Cubism models** with extra tracking metadata. Our existing Live2D pipeline handles them perfectly — users just need to:
1. Extract the `.vtube` archive (it's a renamed ZIP)
2. Place the contents in `backend/storage/live2d/{name}/`
3. The `.model3.json` and `.moc3` files work as-is

This requires **documentation only**, no code changes.

---

## Part C: Rendering Engine Guide (`docs/RENDERING_ENGINES.md`)

A comprehensive guide covering both developer reference and end-user instructions.

### Document Structure

```markdown
# Rendering Engines & Model Formats Guide

## Quick Start — Adding Your Own Models
  ### VRM Models (Recommended)
  ### GLB/GLTF Models
  ### Live2D / VTube Studio Models
  ### MMD/PMX Models
  ### Spine 2D Models

## Supported Formats Reference Table
  (matrix: format, extension, engine, features, limitations)

## Engine Deep Dives
  ### Three.js (VRM + GLB + FBX + MMD)
    - Architecture: viewer.html → iframe → postMessage
    - AnimationDirector 7-layer system
    - Expression/morph system
    - Spring bone physics
    - Post-processing pipeline
    - Bone retargeting (Mixamo, CMU)

  ### PIXI.js (Live2D + Spine)
    - Architecture: useLive2D.ts → PIXI canvas
    - Cubism model structure
    - Motion groups and expressions
    - Lip sync via ParamMouthOpenY
    - VTube Studio compatibility

  ### Unity WebGL
    - Architecture: WaifuBridge.cs → iframe → postMessage
    - lilToon shader support
    - SpringBoneController physics
    - Build & deploy workflow

## Animation Formats
  ### VRMA — VRM Animation
  ### GLB Animation Clips
  ### FBX/Mixamo Animations
  ### BVH Motion Capture
  ### VMD (MMD Animation)

## Creating Models for This App
  ### Blender → VRM Export Workflow
  ### Blender → GLB Export Workflow
  ### Unity → VRM Export (UniVRM)
  ### VRoid Studio → Direct VRM
  ### MikuMikuDance → PMX

## Troubleshooting
  - Model loads but is invisible (scale, orientation)
  - Expressions not working (morph name mapping)
  - Physics jittering (spring bone tuning)
  - Animation doesn't match (bone retargeting)
```

---

## Implementation Order

| Step | Part | Scope | Files Changed |
|------|------|-------|---------------|
| 1 | A | Asset folder reorganization + migration | 3 files modified, dirs created |
| 2 | C | Write `docs/RENDERING_ENGINES.md` guide | 1 new file |
| 3 | B.1 | FBX loader for animation import | 3 files (2 new libs + viewer) |
| 4 | B.2 | PMX/MMD model loader | 4 files (3 new libs + viewer + avatar_browser) |
| 5 | B.3 | Spine 2D loader | 3 files (1 new hook + viewerStore + package.json) |

Steps 1-2 are safe and self-contained. Steps 3-5 add new rendering capabilities and can be done incrementally.

---

## Verification

1. **Part A:** Move a VRM file to `models/vrm/`, verify it loads via both old URL (`/files/avatars/`) and new URL (`/files/models/vrm/`). Place a GLB in `models/glb/`, verify ModelBrowser shows it.
2. **Part C:** Review `docs/RENDERING_ENGINES.md` for completeness and accuracy.
3. **Part B.1:** Download a Mixamo FBX animation, load it via the animation browser, verify it plays on a VRM character with correct bone retargeting.
4. **Part B.2:** Download a free PMX model, place in `models/mmd/`, verify it loads in the viewer with expressions and physics.
5. **Part B.3:** Load a Spine model, verify it renders in the PIXI canvas alongside Live2D support.
6. **Full test:** `./run.sh test` — all backend tests pass. Frontend TypeScript compiles cleanly.

---
---

# Part A & C: ✅ DONE (Mar 2, 2026)

- Part A (asset folder reorg) — implemented, models/vrm + models/glb + animations dirs created, avatar_browser.py updated
- Part C (RENDERING_ENGINES.md) — written, ~400 lines
- Part B (B.1-B.3 format loaders) — deferred, not yet started

---
---

# Image Asset Organization + image_prompts.md v1.2

> **STATUS: PLANNING** (Mar 2, 2026)
> **Priority:** Medium-High

## Context

The user has generated many new images (backgrounds, portraits, pixel art, concept art) for all characters and needs:

1. **Backup current `image_prompts.md`** → copy to `_BACKUP_ROOT/` before changes
2. **Create `image_prompts.md` v1.2** — add 5 new characters from expanded character bible, refresh existing 7
3. **Organize image folder structure** — currently flat in `backend/storage/images/`, needs per-character and per-purpose organization
4. **Image naming convention** — consistent naming for generated images
5. **Wire new images into app** — update `background_url`, portraits, etc. where needed
6. **General uploads folder** — for user-uploaded images
7. **Image compression** — optimize file sizes (the `kitsune_bedroom.png` is 9.3MB)

Later (separate task): Create v1.3 after seeing ChatGPT's v1.1 version.

## Current State

### image_prompts.md v1.0
- **7 characters:** Sable, Shiori, Rin, Ayane, Kitsune, Hana, Mika
- **13 prompts each** (Standard×2, Transparent×2, PixelArt×2, DetailedPixelArt×2, Concept×4, Icon×1)
- **247 lines**, source: Character Bible v1.1
- Lives at project root: `/image_prompts.md`

### New Characters (from expanded Character Bible v1.2)
| # | Character | Archetype | Key Visual Elements |
|---|-----------|-----------|-------------------|
| 8 | **Raine** | Classic Tsundere | Silver-white hair, lavender tips, violet eyes, red rose motif, academy/student council aesthetic |
| 9 | **Kaede (Suzuha)** | Onee-san Big Sister | Dark auburn hair, warm brown/gold eyes, autumn/maple motif, cozy knits, amber palette |
| 10 | **Luna (Tsukimi)** | Neko Cat-Girl | Black hair with silver streaks, heterochromia (gold/blue), cat ears+tail, crescent moon clip, midnight/rooftop aesthetic |
| 11 | **Yuki (Shirayuki)** | Yandere | White hair with lavender tips, pink→crimson eyes, snow/white camellia motif, scissors/thread, innocence+danger |
| 12 | **Genki Kitsune** | (Updated) | Same as current but with expanded visual detail from standalone bible file |

### Current Image Storage (Flat)
```
backend/storage/images/
├── ayane_bedroom.png          (61 KB)
├── ayane_server_core.png      (97 KB)
├── kitsune_bedroom.png        (9.3 MB ← needs compression!)
├── kitsune_bedroom_2.png      (161 KB)
├── kitsune_live_concert.png   (102 KB)
├── rin_bedroom.png            (120 KB)
├── rin_street_race.png        (105 KB)
├── sable_bedroom.png          (85 KB)
├── sable_data_room.png        (92 KB)
├── seraph_bedroom.png         (132 KB)
├── seraph_sky_garden.png      (92 KB)
├── shiori_bedroom.png         (104 KB)
├── shiori_library.png         (110 KB)
├── *_portrait.png             (12 portrait files, 500KB-1.1MB each)
└── expr_portraits/{char_id}/  (per-emotion subdirs, already organized)
```

**Missing images** (referenced in restore_images.py but not present):
- `hana_bedroom.png`, `hana_garden.png`
- `mika_bedroom.png`, `mika_beach.png`

### DB Schema Image Columns (characters table)
- `avatar_url` — character avatar/card image
- `avatar_2d_url` — 2D alternative
- `background_url` — scene background (e.g. `/files/images/sable_bedroom.png`)
- `expr_portraits` — JSON map of emotion→URL
- `emotion_portraits_mode` — 0=off, 1=chat bubbles, 2=bubbles+sidebar

---

## Step 1: Backup Current image_prompts.md

```bash
cp image_prompts.md _BACKUP_ROOT/temp/image_prompts_v1.0_backup.md
```

## Step 2: Proposed Image Directory Structure

```
backend/storage/images/
├── backgrounds/                ← Scene/environment backgrounds
│   ├── sable_bedroom.png
│   ├── sable_data_room.png
│   ├── shiori_bedroom.png
│   ├── shiori_library.png
│   ├── rin_bedroom.png
│   ├── rin_street_race.png
│   ├── ayane_bedroom.png
│   ├── ayane_server_core.png
│   ├── kitsune_bedroom.png
│   ├── kitsune_live_concert.png
│   ├── hana_bedroom.png        ← new
│   ├── hana_garden.png         ← new
│   ├── mika_bedroom.png        ← new
│   ├── mika_beach.png          ← new
│   ├── raine_bedroom.png       ← new
│   ├── kaede_bedroom.png       ← new
│   ├── luna_bedroom.png        ← new
│   └── yuki_bedroom.png        ← new
├── portraits/                  ← Character portraits (pixel art, standard, concept)
│   ├── kitsune_portrait.png
│   ├── sable_pixel_portrait.png
│   ├── shiori_pixel_portrait.png
│   ├── rin_pixel_portrait.png
│   └── ...
├── concepts/                   ← Concept art, scene illustrations
│   └── {character}_{scene}.png
├── icons/                      ← GUI icons, app icons per character
│   └── {character}_icon.png
├── transparent/                ← Transparent-background character renders
│   └── {character}_{pose}.png
├── expr_portraits/             ← (existing) Per-character emotion portraits
│   └── {char_id}/
│       └── {emotion}.png
└── uploads/                    ← User-uploaded general images
```

### Naming Convention

```
{character}_{scene_or_type}[_{variant}].png

Examples:
  sable_bedroom.png              — background: Sable's bedroom
  sable_bedroom_2.png            — background: variant 2
  sable_portrait.png             — standard portrait
  sable_pixel_portrait.png       — pixel art portrait
  sable_concept_black_market.png — concept art scene
  sable_transparent_action.png   — transparent BG render
  sable_icon.png                 — GUI icon
```

### Migration Strategy (Backwards Compat)

Images are referenced by URL in the database (`background_url`, `avatar_url`). Current URLs look like `/files/images/sable_bedroom.png`. After reorganizing:

**Option A (symlinks):** Keep flat files, create symlinks from new dirs → old locations. Zero code changes.

**Option B (move + update DB):** Move files to subdirs, update DB URLs. Clean but requires migration script.

**Option C (keep flat, add subdirs for new only):** Existing images stay where they are. New images go into organized subdirs. Hybrid approach — no migration needed, gradual transition.

**Recommended: Option C** — least risk, no DB migration, existing references don't break. New images use the organized structure. Over time, old images can be migrated.

## Step 3: Write image_prompts.md v1.2

### Changes from v1.0 → v1.2

1. **Add 5 new characters** with 13 prompts each:
   - #8 Raine (Tsundere) — academy/rain/rose motif
   - #9 Kaede (Suzuha) — autumn/tea/maple motif
   - #10 Luna (Tsukimi) — midnight/moon/cat motif
   - #11 Yuki (Shirayuki) — snow/camellia/yandere motif
   - #12 Genki Kitsune — (refresh with expanded visual details)

2. **Update header** — v1.2 label, source: Character Bible v1.2

3. **Refresh existing 7 characters** — tighten prompts based on expanded character bibles (more specific visual details, consistent age/body/skin tags, aligned UI palette colors)

4. **Add image naming guide** at the top — so generated images can be named consistently

5. **Add format/resolution notes** — recommended sizes for each prompt type:
   - Backgrounds: 1920×1080 or 2560×1440
   - Portraits: 512×512 or 768×768
   - Pixel Art: 256×256 or 512×512
   - Icons: 256×256
   - Transparent: 1024×1024 (with alpha)

### Transparency Workaround (Green Screen)

AI image generators cannot reliably produce true transparency. All "Transparent" prompts will instead request **solid bright green (#00FF00) backgrounds** — classic chroma key. The prompt titles keep the "Transparent" label as a visual reference that these images need post-processing.

**Prompt body change:** Replace `(Transparent Background)` with:
```
Solid bright green (#00FF00) background — chroma key green screen.
```

A **Post-Processing Guide** section will be added at the top of `image_prompts.md` with:
- `rembg` CLI tool (Python, free, local) — `pip install rembg && rembg i input.png output.png`
- remove.bg (web, free tier) — drag-and-drop
- Batch processing: `for f in *_transparent_*.png; do rembg i "$f" "${f%.png}_alpha.png"; done`
- macOS Preview → Instant Alpha tool for quick manual removal
- Photoshop: Select → Color Range → green → Delete

### Prompt Categories (13 per character, same structure as v1.0)

| # | Category | Purpose | Art Style | BG |
|---|----------|---------|-----------|-----|
| 1 | Standard (Bedroom) | Primary background, personal space | High-quality 2D anime | Scene |
| 2 | Standard (Scene 2) | Secondary background, activity/setting | Cinematic 2D anime | Scene |
| 3 | Transparent (Pose A) | UI overlay, action pose | Flat cel-shaded | **Green screen** |
| 4 | Transparent (Pose B) | UI overlay, idle/casual | Flat cel-shaded | **Green screen** |
| 5 | Pixel Art (Portrait) | Retro portrait | 16-bit aesthetic | Scene |
| 6 | Pixel Art (Scene) | Retro scene/environment | Side-scroll/isometric | Scene |
| 7 | Detailed Pixel Art (Portrait+) | Premium pixel portrait | 32-bit, high detail | Scene |
| 8 | Detailed Pixel Art (Scene+) | Premium pixel scene | 32-bit, cinematic | Scene |
| 9 | Concept (Scene A) | Character-defining moment | Studio-quality anime | Scene |
| 10 | Concept (Scene B) | Activity/hobby scene | Varied anime studios | Scene |
| 11 | Concept (Scene C) | Emotional/abstract | Artistic, experimental | Scene |
| 12 | Concept (Scene D) | Quiet/intimate moment | Soft, personal | Scene |
| 13 | Icon (GUI) | App icon, profile pic | Clean vector, cel-shaded | Solid color circle |

## Step 4: Image Wiring & Compression (Collaborative)

### Compression Strategy
- Use `sips` (macOS built-in) or `pngquant` for lossy PNG compression
- Target: backgrounds < 500KB, portraits < 300KB, pixel art < 200KB
- The 9.3MB `kitsune_bedroom.png` should compress to ~200-500KB

### Wiring New Images
- Update `background_url` in DB for characters that get new backgrounds
- Can be done via Settings UI or via SQL update script
- Expression portraits auto-wire via the `/api/characters/{id}/expression-portrait/{emotion}` upload endpoint

### User Options for Image Organization
The user can:
1. **Self-service** — follow the naming guide and copy files manually
2. **Guided** — provide images to Claude, get naming + placement instructions
3. **Automated** — Claude runs a script to compress, rename, and place images

---

## Modified Files

| File | Change | Priority |
|------|--------|----------|
| `image_prompts.md` | Rewrite to v1.2 (12 characters, ~500 lines) | High |
| `_BACKUP_ROOT/temp/image_prompts_v1.0_backup.md` | Backup copy | High |
| `backend/storage/images/` | Create subdirs: `backgrounds/`, `portraits/`, `concepts/`, `icons/`, `transparent/`, `uploads/` | Medium |
| DB `characters` table | Update `background_url` for new images (optional, can be done via UI) | Low |

## Verification

1. Backup exists at `_BACKUP_ROOT/temp/image_prompts_v1.0_backup.md`
2. New `image_prompts.md` has 12 characters × 13 prompts = 156 total prompts
3. New image subdirectories created
4. Existing image URLs (`/files/images/sable_bedroom.png`) still work (no migration)
5. New images placed in organized subdirs are accessible via `/files/images/backgrounds/...` etc.

## Image Organization + v1.2 Implementation: ✅ DONE (Mar 2, 2026)

- Backup created at `_BACKUP_ROOT/temp/image_prompts_v1.0_backup.md`
- Image subdirs created: `backgrounds/`, `portraits/`, `concepts/`, `icons/`, `transparent/`, `uploads/`
- `image_prompts.md` v1.2 written (547 lines, 12 chars × 13 = 156 prompts)
- Server static mounts: no changes needed (`/files` already serves recursively)

---
---

# Image Prompts v1.3 — Master Merge + File Organization

> **STATUS: PLANNING** (Mar 2, 2026)
> **Priority: HIGH**

## Context

We now have three versions of the image prompts file from different sources:

| Version | Source | Characters | Prompts | Strengths |
|---------|--------|------------|---------|-----------|
| **v1.0** | Claude (original) | 7 | 91 | First complete set, established 13-category structure |
| **v1.1** | ChatGPT | 9 (2 with actual prompts) | ~8 room layouts | Global Style Lock, Global Negative, Room Layout concept (no-character scenes), hands/framing sanity, variant system (A/B/C/D) |
| **v1.2** | Claude (current) | 12 | 156 | Full 12-character coverage, green screen fix, naming guide, resolution guide, expanded bible details for new chars |

**Goal:** Create **v1.3** — a definitive master merge that combines:
1. v1.2's complete 12-character coverage and detailed prompts
2. v1.1's structural innovations (Style Lock, Negatives, Room Layouts, hands/framing)
3. Longer/medium-long prompts throughout (user preference: easier to trim keywords than add them)
4. New **Room Layout** category (per ChatGPT's concept — environment-only, no character)
5. New **Expanded Prompt Categories** — go from 13 to **17 categories per character**

### File Organization Plan

Move all versions into a `docs/image_prompts/` folder:

```
docs/image_prompts/
├── image_prompts_v1.0.md          ← copy from backup
├── image_prompts_v1.1_chatgpt.md  ← move from docs/image_prompts_v1.2.md, fix version label
├── image_prompts_v1.2.md          ← copy from current image_prompts.md
└── image_prompts_v1.3.md          ← NEW: the master merge (definitive)

image_prompts.md                   ← STAYS at project root, REPLACED with v1.3 content
```

**Rationale:** The root-level `image_prompts.md` is the "active" file — the one you grab when sitting down with an image generator. The `docs/image_prompts/` folder is the archive of all versions for reference. The root file always contains the latest version.

---

## v1.3 Structure Design

### Header Section (from v1.1 + v1.2)

```markdown
# Image Generation Prompts — v1.3 (Master)

## Meta
- Source: Character Bible v1.2 (12 characters)
- Style: 2D Anime / Cel-Shaded / Pixel Art (NO 3D/Realism)
- Updated: Mar 2, 2026

## Global Style Lock (paste into every prompt)
[Adapted from v1.1 — style enforcement + negative prompt block]

## Global Negative Prompt
[From v1.1 — hands, fingers, text, warping, split-screen]

## Framing & Anatomy Rules
[From v1.1 — 5 fingers, both shoes in frame, breathing room]

## File Naming Convention
[From v1.2 — {character}_{type}[_{variant}].png]

## Recommended Resolutions
[From v1.2 — per-category resolution table]

## Prompt Categories (17 per character)
[Expanded from 13 → 17]
```

### Expanded Category System: 13 → 17 per character

The v1.1 introduced "Room Layout" (environment-only) — useful for app backgrounds. We add 4 new categories. **NO green screen / chroma key anywhere** — every prompt gets a fully described scene background.

| # | Category | What's New | BG | Source |
|---|----------|-----------|-----|--------|
| 1 | Standard (Bedroom) | — | Scene | v1.0 |
| 2 | Standard (Scene 2) | — | Scene | v1.0 |
| 3 | **Full-Body (Action Pose)** | **Replaces old Transparent A — full scene BG, dynamic pose** | **Scene** | **v1.2 reworked** |
| 4 | **Full-Body (Casual Pose)** | **Replaces old Transparent B — full scene BG, relaxed pose** | **Scene** | **v1.2 reworked** |
| 5 | Pixel Art (Portrait) | — | Scene | v1.0 |
| 6 | Pixel Art (Scene) | — | Scene | v1.0 |
| 7 | Detailed Pixel Art (Portrait+) | — | Scene | v1.0 |
| 8 | Detailed Pixel Art (Scene+) | — | Scene | v1.0 |
| 9 | Concept (Scene A) | — | Scene | v1.0 |
| 10 | Concept (Scene B) | — | Scene | v1.0 |
| 11 | Concept (Scene C) | — | Scene | v1.0 |
| 12 | Concept (Scene D) | — | Scene | v1.0 |
| 13 | Icon (GUI) | — | Solid circle | v1.0 |
| **14** | **Room Layout (Primary)** | **NEW: Environment-only, no character** | **Scene** | **v1.1** |
| **15** | **Room Layout (Variant)** | **NEW: Same room, different mood/lighting** | **Scene** | **v1.1** |
| **16** | **Full-Body (Outfit A)** | **NEW: Full body, both feet visible, signature outfit** | **Scene** | **v1.1** |
| **17** | **Full-Body (Outfit B)** | **NEW: Full body, both feet visible, alternate outfit** | **Scene** | **v1.1** |

**Key change from v1.2:** Categories 3-4 no longer use green screen. They are renamed from "Transparent" to "Full-Body" and each gets a relevant scene background described in the prompt. Categories 16-17 are new full-body character renders with specific outfit descriptions and scene backgrounds, following v1.1's "both shoes visible" framing rule.

### Prompt Length Policy

**All prompts should be MEDIUM-LONG to LONG.** Reasoning from user:
> "We can more easily cut them down by removing keywords than we can add new ones"

Target: 3-6 sentences per prompt. Include:
- Character physical description (age, body type, skin, hair, eyes) in every prompt
- Specific clothing/accessories detail
- Lighting direction and color temperature
- Art style reference (studio name or aesthetic)
- Composition notes (framing, camera angle)
- At least one emotional/atmospheric descriptor
- **Every prompt includes a described background** — no green screen, no blank/solid backgrounds (except Icon which uses a solid color circle)

### Per-Character Section Structure

Each character gets:
```markdown
## N. Character Name — "Archetype Title"

**Visual Identity:** [2-3 sentences of key visual elements from bible]
**Key Motifs:** [bullet list of recurring symbols/motifs]
**Palette:** Primary / Accent / Highlight colors
**Bible Reference:** docs/characters/character_{name}.md

### Character Name Prompts (17)

1. **Standard (Bedroom):** [long prompt]
...
17. **Full-Body Greenscreen (Casual):** [long prompt]
```

---

## Implementation Steps

### Step 1: Organize Files
1. Create `docs/image_prompts/` directory
2. Copy `_BACKUP_ROOT/temp/image_prompts_v1.0_backup.md` → `docs/image_prompts/image_prompts_v1.0.md`
3. Move `docs/image_prompts_v1.2.md` → `docs/image_prompts/image_prompts_v1.1_chatgpt.md`
   - Edit the internal version label from "v2" to "v1.1 (ChatGPT)"
4. Copy current `image_prompts.md` → `docs/image_prompts/image_prompts_v1.2.md`

### Step 2: Write v1.3
Write the complete `image_prompts.md` (root) with:
- Full header section (Style Lock, Negatives, Green Screen, Naming, Resolutions)
- 12 characters × 17 prompts = **204 total prompts**
- All prompts medium-long to long
- Room layouts for every character (2 per character)
- Full-body greenscreen for every character (2 per character)
- Style Lock reference in every character section
- Estimated size: ~900-1100 lines

### Step 3: Archive v1.3
Copy the finished `image_prompts.md` → `docs/image_prompts/image_prompts_v1.3.md`

---

## Character Prompt Sources

For each character, v1.3 prompts are sourced from:

| Character | v1.2 Prompts (13) | Bible Visual Detail | Room Layout Source |
|-----------|-------------------|--------------------|--------------------|
| Sable | ✅ carry forward, lengthen | `docs/characters/character_sable_kuroha.md` §1 | Neon-Noir from v1.1 |
| Shiori | ✅ carry forward, lengthen | `docs/characters/character_shiori_nana.md` §1 | Cozy Writer den (new) |
| Rin | ✅ carry forward, lengthen | `docs/characters/character_rin_akane.md` §1 | Garage/Workshop (new) |
| Ayane | ✅ carry forward, lengthen | `docs/characters/character_ayane_yuki.md` §1 | Neon-Noir from v1.1 R1A |
| Kitsune | ✅ carry forward, lengthen | `docs/characters/character_genki_kitsune.md` §1 | Pastel Streamer from v1.1 |
| Hana | ✅ carry forward, lengthen | `docs/characters/character_hana_momoka.md` §1 | Pastel Joy room (new) |
| Mika | ✅ carry forward, lengthen | `docs/characters/character_mika_mikazuki.md` §1 | Beach House setup (new) |
| Raine | ✅ carry forward, lengthen | `docs/characters/character_tsundere_raine.md` §1 | Academy study (new) |
| Kaede | ✅ carry forward, lengthen | `docs/characters/character_kaede_suzuha.md` §1 | Tea salon workspace (new) |
| Luna | ✅ carry forward, lengthen | `docs/characters/character_luna_tsukimi.md` §1 | Midnight cafe counter (new) |
| Yuki | ✅ carry forward, lengthen | `docs/characters/character_yuki_shirayuki.md` §1 | White sewing room (new) |
| Genki Kitsune (Expanded) | ✅ carry forward, lengthen | Same as Kitsune | Idol dressing room (new) |

---

## v1.4 — "Ultra-Detail Showcase" (ADDITIONAL)

The user also wants a **v1.4** — a maximum-detail version with **20 prompts per character** to see how far we can push prompt quality. This is the "showcase" version.

### v1.4 Design

- **20 categories per character** = 12 × 20 = **240 total prompts**
- **LONG prompts** — 5-10 sentences each, pulling from every character bible detail
- Incorporate: visual identity §1, key motifs, suggested palette colors, signature mannerisms §3, specific accessories, clothing detail, ambient sounds implied visually, emotional atmosphere
- Every prompt is a standalone "commission brief" — detailed enough that an artist could paint from it without additional reference

### v1.4 Category Expansion (20 per character)

Same 17 as v1.3 plus 3 additional:

| # | Category | Description |
|---|----------|-------------|
| 1-17 | (same as v1.3) | All existing categories |
| **18** | **Character Sheet (Turnaround)** | Front/side/back reference sheet, outfit details, color swatches. For modeling/cosplay reference. |
| **19** | **Emotional Close-Up (Signature Emotion)** | Tight face crop, the character's most defining emotional moment. Maximum expression detail. |
| **20** | **Duo/Interaction Scene** | The character interacting with the viewer (POV) or in a two-person composition. Relationship-focused. |

### v1.4 Per-Prompt Resolution Tags

Each v1.4 prompt includes a **resolution tag** at the end specifying optimal image dimensions:

| Category Type | Resolution | Aspect Ratio | Reason |
|--------------|-----------|-------------|--------|
| Standard (Bedroom/Scene) | 1920×1080 | 16:9 | Widescreen backgrounds for app |
| Full-Body (Action/Casual/Outfit) | 832×1216 | ~2:3 portrait | Full-body character, vertical framing |
| Pixel Art (Portrait) | 512×512 | 1:1 | Square, retro aesthetic |
| Pixel Art (Scene) | 1024×512 | 2:1 | Wide, side-scroller format |
| Detailed Pixel Art (Portrait+) | 768×768 | 1:1 | Higher-res square |
| Detailed Pixel Art (Scene+) | 1536×768 | 2:1 | Wide panoramic |
| Concept (all 4 scenes) | 1920×1080 | 16:9 | Cinematic widescreen |
| Icon (GUI) | 512×512 | 1:1 | App icon, square |
| Room Layout (both) | 1920×1080 | 16:9 | Background-only, widescreen |
| Character Sheet (Turnaround) | 2048×1024 | 2:1 | Wide, multi-angle reference |
| Emotional Close-Up | 768×768 | 1:1 | Square, face-focused |
| Duo/Interaction Scene | 1920×1080 | 16:9 | Cinematic, two subjects |

Format: each prompt ends with `[Resolution: WIDTHxHEIGHT]`

**Note:** v1.3 does NOT include resolution tags (user only wants them in v1.4).

### v1.4.5 — "Style-Tagged Concise" (ADDITIONAL)

Same 20 categories and resolution tags as v1.4, but with **medium-short prompts** (2-3 sentences) and **rich style reference tags** per prompt. Each prompt includes specific anime studio/style references matched to the character's aesthetic and the scene's mood.

**Style Reference Library** (matched per character + scene vibe):

| Style Tag | Best For | Characters That Match |
|-----------|----------|---------------------|
| Studio Ghibli style | Warm, pastoral, nature, cozy, nostalgic | Kaede, Hana, Shiori |
| Kyoto Animation style | Soft focus, emotional, slice-of-life, detailed eyes | Kaede, Shiori, Raine (dere moments) |
| Makoto Shinkai style | Cinematic skies, lens flare, hyper-detail backgrounds | Mika, Hana, Rin (sunset scenes) |
| Production I.G style | Sci-fi, clean mechanical detail, atmospheric | Sable, Ayane |
| Trigger/Gainax style | High energy, dynamic poses, bold angles, action | Rin, Kitsune/Genki, Mika |
| Shaft/Madoka style | Surreal, geometric, uncanny beauty, head tilts | Yuki, Luna (eerie scenes) |
| MAPPA style | Cinematic, high-contrast, dramatic lighting | Sable, Raine, Yuki |
| Ufotable style | Fluid effects, glowing particles, dramatic combat | Kitsune (fox fire scenes) |
| WIT Studio style | Epic scale, dramatic composition, intense emotion | Rin (racing), Genki (concerts) |
| Shonen anime style | Bold lines, dynamic, bright, energetic | Rin, Kitsune, Mika |
| Shoujo anime style | Soft lines, sparkles, flower frames, romantic | Hana, Raine, Kaede |
| Iyashikei (healing) style | Gentle, slow, warm, meditative | Shiori, Kaede, Hana |
| Dark/gritty anime style | Noir, heavy shadows, mature, rain | Sable, Yuki (dark moments) |
| Retro 90s anime style | Warm cel shading, film grain, nostalgic palette | Rin, Sable |
| Lofi aesthetic | Muted, warm, grain, cozy, nostalgic | Shiori, Luna |
| Vaporwave/neon aesthetic | High saturation, holographic, cyberpunk | Sable, Genki (idol mode) |

Each v1.4.5 prompt ends with: `[Style: {matched reference}] [Resolution: WxH]`

### Prompt Detail Level Comparison

| Version | Avg prompt length | Detail level | Resolution tags | Categories | Use case |
|---------|------------------|-------------|----------------|-----------|----------|
| v1.3 | 3-6 sentences | Medium-long | No | 17 | Daily use, quick generation |
| v1.4 | 5-10 sentences | Maximum | Yes (per-prompt) | 20 | Showcase, high-quality commissions |
| v1.4.5 | 2-3 sentences | Medium-short | Yes (per-prompt) | 20 | Quick paste, concise reference |

---

## Files Modified

| File | Action | Priority |
|------|--------|----------|
| `docs/image_prompts/` | Create directory | High |
| `docs/image_prompts/image_prompts_v1.0.md` | Copy from backup | High |
| `docs/image_prompts/image_prompts_v1.1_chatgpt.md` | Move + rename + fix version label | High |
| `docs/image_prompts/image_prompts_v1.2.md` | Copy from current root | High |
| `docs/image_prompts/image_prompts_v1.3.md` | NEW: 17 categories × 12 chars = 204 prompts | High |
| `docs/image_prompts/image_prompts_v1.4.md` | NEW: 20 categories × 12 chars = 240 prompts (ultra-detail, long) | High |
| `docs/image_prompts/image_prompts_v1.4.5.md` | NEW: 20 categories × 12 chars = 240 prompts (medium-short) | High |
| `image_prompts.md` | Root file — left as v1.2 until user picks preferred version | Medium |

## Implementation Order

1. **File organization** — create `docs/image_prompts/`, copy/move v1.0, v1.1, v1.2 archives
2. **Write v1.3** — `docs/image_prompts/image_prompts_v1.3.md` (204 prompts, medium-long)
3. **Write v1.4** — `docs/image_prompts/image_prompts_v1.4.md` (240 prompts, ultra-detail long)
4. **Write v1.4.5** — `docs/image_prompts/image_prompts_v1.4.5.md` (240 prompts, medium-short)
5. **User decides** — which version becomes the root `image_prompts.md`

Steps 2, 3, and 4 can be parallelized with subagents (each writes one version independently).

## Verification

1. `docs/image_prompts/` contains 7 files: v1.0, v1.1_chatgpt, v1.2, v1.3, v1.4, v1.4.5
2. v1.3 has 12 × 17 = 204 numbered prompts, medium-long (3-6 sentences each)
3. v1.4 has 12 × 20 = 240 numbered prompts, long (5-10 sentences each), with `[Resolution: WxH]` tags
4. v1.4.5 has 12 × 20 = 240 numbered prompts, medium-short (2-3 sentences each), with `[Resolution: WxH]` tags
5. Every prompt has a described scene background (NO green screen)
6. Global Style Lock + Global Negative in all version headers
7. ChatGPT file internal version label changed from "v2" to "v1.1"
8. No other changes to the ChatGPT file content
9. Root `image_prompts.md` left as-is (v1.2) until user picks their preferred version

---
---

# Electron Phase 4-5: Discord RPC + Pet Idle Polish

> **STATUS: PLANNING** (Mar 2, 2026)

## Context

Phases 1-3 of the Electron desktop pet are fully shipped (commit `99ac344`). Three items from Phase 4-5 remain:

1. **Discord RPC is coded but not wired end-to-end.** `discord-rpc.js` exists and the tray toggle exists, but `discord-rpc` is not in `package.json`, there's no IPC bridge in `preload.js`, and there's no Sakura settings UI for the Discord App ID — the tray dialog tells the user to "set it in settings" but no such settings exist.

2. **Advanced pet idle animations are missing.** The viewer already has `yawn` but `doze`, `wake_up`, and `wave_at_cursor` are not in `IdleBehaviorLayer.FIDGETS`. These make the pet feel alive during long sessions.

3. **No Desktop Pet settings section in Sakura.** Users need a way to set their Discord App ID and toggle RPC without diving into a config file.

---

## Part 1 — Discord RPC End-to-End

### 1a. `electron/package.json`
Add `discord-rpc` as an **optionalDependency** so it installs when available but doesn't break the app if it fails:
```json
"optionalDependencies": {
  "discord-rpc": "^4.0.1"
}
```

### 1b. `electron/preload.js` — Add Discord IPC bridge
Add 3 methods to `contextBridge.exposeInMainWorld('electronAPI', { ... })`:
```javascript
/** Get current Discord RPC state. Returns { enabled, connected, appId } */
getDiscordState: () => ipcRenderer.invoke('get-discord-state'),

/** Save Discord Application ID to electron-store. */
setDiscordAppId: (appId) => ipcRenderer.invoke('set-discord-app-id', appId),

/** Enable or disable Discord RPC. Returns { connected } */
setDiscordRpcEnabled: (enabled) => ipcRenderer.invoke('set-discord-rpc-enabled', enabled),
```

### 1c. `electron/main.js` — Add 3 IPC handlers
```javascript
// GET /discord-state → { enabled, connected, appId }
ipcMain.handle('get-discord-state', () => ({
  enabled: store.get('discordRPC', false),
  connected: discord.isDiscordConnected(),
  appId: store.get('discordAppId', ''),
}));

// SET /discord-app-id — saves to store
ipcMain.handle('set-discord-app-id', (_e, appId) => {
  store.set('discordAppId', appId);
  return { ok: true };
});

// SET /discord-rpc-enabled — toggles RPC, returns connection result
ipcMain.handle('set-discord-rpc-enabled', async (_e, enabled) => {
  if (enabled) {
    const appId = store.get('discordAppId', '');
    if (!appId) return { connected: false, error: 'no_app_id' };
    const connected = await discord.initDiscordRPC(appId);
    store.set('discordRPC', connected);
    updateTrayMenu();
    return { connected };
  } else {
    discord.destroyDiscordRPC();
    store.set('discordRPC', false);
    updateTrayMenu();
    return { connected: false };
  }
});
```

### 1d. `frontends/sakura/src/views/SettingsView.tsx` — Desktop Pet section
Add a new "Desktop Pet" settings section, rendered **only in Electron** (`window.electronAPI?.isElectron`):

```tsx
{window.electronAPI?.isElectron && (
  <section>
    <h3>Desktop Pet</h3>
    <DiscordRpcSettings />
  </section>
)}
```

**`DiscordRpcSettings` sub-component** (inline in SettingsView or separate file):
- Input field: "Discord Application ID" (text input, placeholder `123456789012345678`)
- Toggle: "Enable Discord Rich Presence" (checkbox, disabled if no App ID)
- Status badge: "Connected" (green) / "Disconnected" (grey) / "Discord not running" (amber)
- Help text: "Create an application at discord.com/developers/applications"
- On save: calls `electronAPI.setDiscordAppId(id)` then `electronAPI.setDiscordRpcEnabled(true)`
- On mount: calls `electronAPI.getDiscordState()` to populate current state

---

## Part 2 — Advanced Pet Idle Animations

**File:** `frontends/shared/viewer/viewer.html`
**Location:** `IdleBehaviorLayer.FIDGETS` object (around line 1395, after the `yawn` entry)

Add 3 new fidgets:

### `doze`
Gradual head droop over 4 seconds, then hold with slow breath loop. Triggers after 20+ min user inactivity via the PetView idle timer. Uses existing `head_nod_slow` as base but goes further down and holds.
```javascript
doze: {
  duration: 4.0,
  apply(t, amp, B) {
    // Gradual head droop: VRMHumanBoneName.Head rotateX toward ~30°
    // Eye expression: blend toward 'relaxed' or 'sleepy' via morphTargets
    // Breathing: slow sine on spine Y position
  },
  petModeOnly: true,  // Only fires when pet overlay is active
  idleThreshold: 1200, // 20 minutes in seconds
},
```

### `wake_up`
One-shot startle on mouse-enter-near-pet. Head snaps up, surprised expression, then settles. Fires from PetView's `wave_at_cursor` proximity listener.
```javascript
wake_up: {
  duration: 1.2,
  apply(t, amp, B) {
    // Quick head snap up, surprised morph, settle back
  },
  petModeOnly: true,
  oneShot: true,  // Can't chain into another fidget
},
```

### `wave_at_cursor`
Triggered by PetView when mouse passes within 150px of the pet window edge. Right arm wave + head track toward cursor.
```javascript
wave_at_cursor: {
  duration: 2.5,
  apply(t, amp, B) {
    // Right arm raise + wave cycle using existing rightArmLayer logic
    // Head slight turn toward external cursor direction
  },
  petModeOnly: true,
  cooldown: 30,  // seconds between waves
},
```

**PetView.tsx additions** (`frontends/sakura/src/views/PetView.tsx`):
- Track `lastMouseNearPet` timestamp — when OS cursor enters a 150px halo around the window bounds, send `playGesture: 'wave_at_cursor'` postMessage
- Track `userInactiveMs` — increment every second when no keyboard/mouse activity; at 20+ min, send `playGesture: 'doze'`; when activity resumes after doze, send `playGesture: 'wake_up'`

---

## Part 3 — TypeScript types for Electron API

**File:** `frontends/sakura/src/lib/types.ts` or a new `electron.d.ts`

Add type declarations so the TypeScript compiler knows about `window.electronAPI` without errors:
```typescript
interface ElectronDiscordState {
  enabled: boolean;
  connected: boolean;
  appId: string;
}

interface ElectronAPI {
  isElectron: true;
  // ... existing methods ...
  getDiscordState(): Promise<ElectronDiscordState>;
  setDiscordAppId(appId: string): Promise<{ ok: boolean }>;
  setDiscordRpcEnabled(enabled: boolean): Promise<{ connected: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
```

---

## Modified Files

| File | Change |
|------|--------|
| `electron/package.json` | Add `discord-rpc` as optionalDependency |
| `electron/preload.js` | Add 3 Discord IPC methods |
| `electron/main.js` | Add 3 IPC handlers (`get-discord-state`, `set-discord-app-id`, `set-discord-rpc-enabled`) |
| `frontends/sakura/src/views/SettingsView.tsx` | Add "Desktop Pet" section with Discord RPC settings (Electron-only) |
| `frontends/shared/viewer/viewer.html` | Add `doze`, `wake_up`, `wave_at_cursor` fidgets to `IdleBehaviorLayer.FIDGETS` |
| `frontends/sakura/src/views/PetView.tsx` | Proximity listener for `wave_at_cursor`, inactivity timer for `doze`/`wake_up` |
| `frontends/sakura/src/lib/types.ts` | Add `ElectronAPI` interface with Discord methods |

---

## Implementation Order

1. **`electron/package.json`** — Add optional dep (1 line, safe)
2. **`electron/main.js`** — 3 IPC handlers (20 lines)
3. **`electron/preload.js`** — 3 bridge methods (15 lines)
4. **`frontends/sakura/src/lib/types.ts`** — Discord type declarations (25 lines)
5. **`frontends/sakura/src/views/SettingsView.tsx`** — Desktop Pet section (50–70 lines)
6. **`frontends/shared/viewer/viewer.html`** — 3 new fidgets (60 lines)
7. **`frontends/sakura/src/views/PetView.tsx`** — Proximity + inactivity hooks (40 lines)

---

## Verification

1. `cd electron && npm install` — `discord-rpc` installs without error
2. Sakura → Settings → Desktop Pet section visible when running in Electron
3. Enter a Discord App ID → click enable → Discord shows "Waifu RT3D — Hanging out with Kitsune"
4. Tray "Discord Rich Presence" checkbox reflects state set from Sakura settings
5. Pet overlay active for 20+ minutes → character dozes (head droops)
6. Move mouse near pet window after doze → character wakes up with startle
7. Move mouse past pet window → character waves
8. TypeScript builds cleanly: `cd frontends/sakura && npm run build` — no errors on `window.electronAPI`

---
---

# Part 10: Vite Bundle Splitting

> **STATUS: PLANNING** (Mar 2, 2026)

## Context

The Sakura frontend's main JS bundle is **1.0 MB** (gzip ~300 KB), with **774 KB** already split into the Live2D/PIXI chunk. The bottleneck is:
- `framer-motion` (~250 KB parsed, used in 37 components) baked into the main chunk
- 37 overlay panel components eagerly imported even though most users never open them
- 5 setup wizards eagerly imported but only shown once per session
- `SettingsView.tsx` (4198 lines) parsed on every app load even for users who never open settings

**Goal:** Cut the main chunk from 1.0 MB to ≤400 KB by adding vendor chunk splitting and converting conditionally-rendered heavy components to `React.lazy()`.

## Current Bundle State

| File | Size | Status |
|------|------|--------|
| `index-D12Lsp7e.js` | 1.0 MB | **Main chunk — target** |
| `useLive2D-TSRedG2Y.js` | 774 KB | Live2D/PIXI — already split ✅ |
| `Live2DCanvas-BGPUiN6T.js` | 3.0 KB | Already lazy ✅ |
| `PetView-CMZ6zza4.js` | 10 KB | Already lazy ✅ |

## What NOT to Change

- PIXI/Live2D chunk — already well-split, leave alone
- Panels that are **always needed** (Sidebar, ChatThread, CreateView, WelcomeScreen, ToastQueue) — stay eager
- `SoundscapePlayer`, `CinematicOverlay`, `MilestoneCelebration` — small or always-needed side-effects
- `ShortcutHelpModal` — small, shown on `?` keypress (keeps keyboard shortcut UX snappy)

## Implementation Plan

### Step 1 — `vite.config.ts`: Add `manualChunks`

Split vendor libraries into separate parallel-loadable chunks. Vite injects `<link rel="modulepreload">` for them automatically.

```ts
build: {
  outDir: 'dist',
  rollupOptions: {
    output: {
      manualChunks(id) {
        // framer-motion is used by 37 components — isolate so it loads in parallel
        if (id.includes('framer-motion')) return 'vendor-framer';
        // React core — tiny but stabilizes chunk hashing across rebuilds
        if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
        // Zustand — state management, imported everywhere
        if (id.includes('node_modules/zustand')) return 'vendor-state';
        // lucide-react — icon library, many components import it
        if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
      },
    },
  },
},
```

**Effect:** `framer-motion` moves out of main chunk entirely. Browser downloads vendor chunks in parallel with the main bundle.

### Step 2 — `App.tsx`: Lazy-load conditionally-rendered components

These are already guarded by `{condition && <Component />}` so lazy loading gives true deferral — code never loads unless the condition fires.

**Convert these 8 imports from static to `lazy()`:**

```ts
// Wizards (already conditionally rendered — true lazy load)
const VoiceSetupWizard     = lazy(() => import('./components/wizards/VoiceSetupWizard').then(m => ({ default: m.VoiceSetupWizard })));
const LLMSetupWizard       = lazy(() => import('./components/wizards/LLMSetupWizard').then(m => ({ default: m.LLMSetupWizard })));
const ImageGenSetupWizard  = lazy(() => import('./components/wizards/ImageGenSetupWizard').then(m => ({ default: m.ImageGenSetupWizard })));
const ExpressionSetupWizard= lazy(() => import('./components/wizards/ExpressionSetupWizard').then(m => ({ default: m.ExpressionSetupWizard })));
const CardImportWizard     = lazy(() => import('./components/wizards/CardImportWizard').then(m => ({ default: m.CardImportWizard })));
const WhatsNewModal        = lazy(() => import('./components/WhatsNewModal').then(m => ({ default: m.WhatsNewModal })));
const OnboardingWizard     = lazy(() => import('./components/onboarding/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));

// DevConsole — only rendered when devMode is on
const DevConsole           = lazy(() => import('./components/DevConsole').then(m => ({ default: m.DevConsole })));
```

**Wrap their render sites in `<Suspense fallback={null}>`:**

```tsx
{/* Wizards */}
<Suspense fallback={null}>
  {showOnboarding && <OnboardingWizard />}
  {activeWizard === 'voice-setup' && <VoiceSetupWizard />}
  {activeWizard === 'llm-setup' && <LLMSetupWizard />}
  {activeWizard === 'image-gen-setup' && <ImageGenSetupWizard />}
  {activeWizard === 'expression-setup' && <ExpressionSetupWizard />}
  {activeWizard === 'card-import' && <CardImportWizard />}
  {activeWizard === 'whats-new' && <WhatsNewModal />}
</Suspense>

{/* Dev tools */}
{devMode && (
  <Suspense fallback={null}>
    <DevConsole />
  </Suspense>
)}
```

**Note on always-rendered overlay panels:** Panels like `<MemoryPanel />`, `<VocabPanel />` etc. are always mounted and check `activeOverlay` internally. Converting them to lazy() would still mount them immediately on app load, giving no initial-load benefit (and animation handling complexity). Leave these as eager imports. The vendor chunk splitting (Step 1) already handles their shared framer-motion dependency.

### Step 3 — `SettingsDrawer.tsx`: Lazy-load `SettingsView`

`SettingsDrawer` already uses `AnimatePresence` + `{open && <SettingsView />}`, so `SettingsView` is only rendered when settings is open. Convert to lazy():

```ts
// In SettingsDrawer.tsx — replace static import:
// import { SettingsView } from '../views/SettingsView';
// With:
const SettingsView = lazy(() => import('../views/SettingsView').then(m => ({ default: m.SettingsView })));
```

And wrap the render site in `<Suspense>`:
```tsx
{open && (
  <Suspense fallback={<div className="flex-1 flex items-center justify-center">
    <span style={{ color: 'var(--color-text-secondary)' }}>Loading settings…</span>
  </div>}>
    <SettingsView />
  </Suspense>
)}
```

`SettingsView` (4198 lines, imports `VoicePicker`, `TTSModelsPanel`, `ModelManagerPanel`, `LinkStatusPanel`, etc.) will not be parsed until the user first opens Settings. This is the single largest deferred parse gain.

## Modified Files

| File | Change |
|------|--------|
| `frontends/sakura/vite.config.ts` | Add `rollupOptions.output.manualChunks` |
| `frontends/sakura/src/App.tsx` | Convert 8 conditional components to `lazy()` + Suspense |
| `frontends/sakura/src/components/SettingsDrawer.tsx` | Lazy-load `SettingsView` inside existing `{open &&}` guard |

## Expected Outcome

| Bundle | Before | After (est.) |
|--------|--------|--------------|
| Main chunk | 1.0 MB | ~400 KB |
| vendor-framer | 0 (baked in) | ~250 KB (parallel) |
| vendor-react | 0 (baked in) | ~150 KB (parallel) |
| vendor-state | 0 (baked in) | ~30 KB (parallel) |
| vendor-icons | 0 (baked in) | ~40 KB (parallel) |
| SettingsView chunk | 0 (baked in) | ~180 KB (deferred) |
| Wizards chunks | 0 (baked in) | ~80 KB total (deferred) |

**Initial download is unchanged** (same total bytes) but browser parallelizes vendor chunks and the critical path to first paint is 60% shorter.

## Verification

1. `cd frontends/sakura && npm run build` — builds without TypeScript errors
2. `ls -lh dist/assets/` — confirm:
   - Main chunk ≤ 500 KB (ideally ~400 KB)
   - `vendor-framer-*.js` chunk exists
   - `vendor-react-*.js` chunk exists
   - SettingsView in its own chunk (check via chunk name or size)
3. Open app in browser — Settings drawer shows "Loading settings…" on first open, then loads
4. Open a wizard (e.g. voice setup from Settings) — works correctly
5. `npm run build` output shows no chunk > 600 KB (Vite warns at 500 KB by default)
6. TypeScript: `npx tsc --noEmit` — no errors

---
---

# Character Bible v1.2 Restructure + Nyx (12th Character) + Cross-Project Consistency

> **STATUS: PLANNING** (Mar 3, 2026)
> **Priority: HIGH**

## Context

The character bible master file (`docs/characters/character_bible_master.md`) is v1.1 "Six Defaults" — it only contains 6 of the project's 11 characters. Five characters (Genki, Kaede, Luna, Raine, Yuki) exist as fully-fleshed individual files in `docs/characters/` but were never added to the master bible. Additionally:

- **No "bio" section exists** — users must open each character's 300-950 line file to understand who they are
- **"Nyx (Ayane)" naming conflict** — character #3 in the database is named "Nyx" but all docs call her "Ayane (Yuki)"
- **Image prompts list 12 characters** but one ("Genki Kitsune Expanded") is just an art variant, not a real character
- **The master bible duplicates content** — 6 characters are written out in full (~935 lines) that also exist in individual files

### User Decisions (confirmed in planning session)
1. **Hub approach** — master bible becomes a lean index (~370 lines) with bios, shared rules, and links. Old version backed up.
2. **Flat folder** — all files stay in `docs/characters/` (no subfolders)
3. **12 characters** — rename DB #3 back to "Ayane (Yuki)", create brand-new **"Nyx (Dae)"** as 12th character (Chuunibyou archetype). "Neciridae" is her in-character self-given title (used in dialogue/backstory, not as display name).
4. **Nyx reference files** — user will place quiz/personality reference at `docs/characters/neciridae_deviant_journal_quizzes.md` before implementation
5. **Individual files = source of truth** — the master bible links to them, doesn't duplicate them
6. **User is a visual learner** — use tables, diagrams, clear formatting in docs

---

## ⏸ Before We Start — What YOU Need To Do

1. **Copy your Nyx quiz/personality file** to: `docs/characters/neciridae_deviant_journal_quizzes.md`
2. **Tell me when the file is ready** — I'll read it first to build Nyx's character bible from it
3. That's it! Everything else is on me.

---

## Part 1: Backup + Restructure Master Bible → Hub Document

### Step 1a: Backup old master
```bash
cp docs/characters/character_bible_master.md _BACKUP_ROOT/temp/character_bible_master_v1.1_backup.md
```

### Step 1b: Rewrite master bible as hub

**File:** `docs/characters/character_bible_master.md`

**New structure (~370 lines):**

```markdown
# Character Bible (Master Hub)
*Version: v1.2 "Full Roster" — 12 characters*

## Table of Contents
- [Cast at a Glance](#cast-at-a-glance)
- [Character Bios](#character-bios)
- [Shared Implementation Rules](#shared-implementation-rules)
- [Shared UI Copy + Settings](#shared-ui-copy--settings)
- [Prompt Assembly Guide](#prompt-assembly-guide)
- [Memory + Session Guide](#memory--session-guide)
- [Emotion + Animation Hook Guide](#emotion--animation-hook-guide)
- [TTS Hook Guide](#tts-hook-guide)
- [Appendix: JSON Schemas](#appendix-json-schemas)
- [Appendix: QA Scenarios](#appendix-qa-scenarios)

---

## Cast at a Glance

| # | Name | Alt Name | Archetype | Palette | Flower | Profile |
|---|------|----------|-----------|---------|--------|---------|
| 1 | Sable | Kuroha | Sadodere | Black/Teal/Purple | Anemone | [→ Full profile](character_sable_kuroha.md) |
| 2 | Shiori | Nana | Dandere | Purple/Magenta/Cream | Violet | [→ Full profile](character_shiori_nana.md) |
| 3 | Rin | Akane | Tsundere (Cyberpunk) | Red/Orange/Black | Camellia | [→ Full profile](character_rin_akane.md) |
| 4 | Ayane | Yuki | Kuudere | Blue/Silver/White | Snowdrop | [→ Full profile](character_ayane_yuki.md) |
| 5 | Genki | Kitsune | Genki Fox Spirit | Orange/Gold/Red | Foxglove | [→ Full profile](character_genki_kitsune.md) |
| 6 | Hana | Momoka | Deredere | Pink/Rose/Cream | Cherry blossom | [→ Full profile](character_hana_momoka.md) |
| 7 | Mika | Mikazuki | Hiyakasudere | Yellow/Teal/Pink | Hibiscus | [→ Full profile](character_mika_mikazuki.md) |
| 8 | Raine | — | Classic Tsundere | Red/Silver/Violet | Rose | [→ Full profile](character_tsundere_raine.md) |
| 9 | Kaede | Suzuha | Onee-san | Amber/Auburn/Gold | Maple leaf | [→ Full profile](character_kaede_suzuha.md) |
| 10 | Luna | Tsukimi | Neko | Midnight/Indigo/Gold | Moonflower | [→ Full profile](character_luna_tsukimi.md) |
| 11 | Yuki | Shirayuki | Yandere | White/Pink/Crimson | White camellia | [→ Full profile](character_yuki_shirayuki.md) |
| 12 | Nyx | Dae | Chuunibyou | Purple/Black/Silver | Nightshade | [→ Full profile](character_nyx_dae.md) |

---

## Character Bios

[One paragraph per character, 3-5 sentences each, sourced from individual files' section 0 + section 2]

**Sable (Kuroha)** — Sadodere. [bio paragraph]
**Shiori (Nana)** — Dandere. [bio paragraph]
... [all 12 characters]
**Nyx (Dae)** — Chuunibyou. [bio paragraph]

> **Note:** These bios are summaries. For the full character profile (visual identity,
> personality architecture, voice style, backstory, etc.), see the linked individual files above.

---

## Shared Implementation Rules
[KEEP existing content from lines 35-73 unchanged]

## Shared UI Copy + Settings
[KEEP existing content from lines 75-96 unchanged]

## Prompt Assembly Guide
[KEEP existing content from lines 100-116 unchanged]

## Memory + Session Guide
[KEEP existing content from lines 117-130 unchanged]

## Emotion + Animation Hook Guide
[KEEP existing content from lines 132-152]
[ADD entries for Genki, Kaede, Luna, Raine, Yuki, Nyx — 6 new characters]

## TTS Hook Guide
[KEEP existing content from lines 155-172]
[ADD TTS hints for 6 new characters]

---

## Appendix: JSON Schemas
[KEEP existing content]

## Appendix: QA Scenarios
[KEEP existing content, UPDATE to reference all 12 characters]
```

**What's removed:** The 6 inlined character profiles (Sable through Mika, ~935 lines). This content already exists in the individual files.

**What's added:** Cast at a Glance table (~20 lines), Character Bios section (~60 lines), 6 new entries in Emotion + TTS guides (~30 lines).

---

## Part 2: Create Nyx Character Bible

### Step 2a: Read reference material

**Input file:** `docs/characters/neciridae_deviant_journal_quizzes.md`
User will place this file (DeviantArt-style personality quizzes filled out as the character) before implementation begins. Read this FIRST to extract:
- Personality traits, quirks, pet peeves
- Speaking patterns, vocabulary, humor style
- Backstory details, relationships, formative experiences
- Likes/dislikes, hobbies, fears
- Any visual/aesthetic preferences mentioned

### Step 2b: Write `docs/characters/character_nyx_dae.md`

**New file** following the standard 13-section format (sections 0-12).

**Key character details (locked in):**
- **Display name:** Nyx
- **Alt name:** Dae
- **In-character self-title:** Neciridae (used in dialogue + backstory, NOT display name)
- **Archetype:** Chuunibyou (edgy fantasist)
- **Palette:** Deep purple / Black / Silver
- **Flower:** Nightshade (belladonna)

**Section-by-section plan:**

```
Section 0: Card recap (UI-ready)
  - Display: Nyx, Alt: Dae, Tags: CHUUNIBYOU, GOTHIC, DRAMATIC, SWEET, FANTASIST
  - Card line: sourced from quiz material + archetype
  - Profile facts: birthday, birthplace, height, eye/hair color (from reference material)
  - Voice ID: nyx_v1

Section 1: Visual identity (art direction)
  - Black hair with purple streaks, one eye covered by bangs ("sealed eye")
  - Gothic lolita / dark academia fashion, crescent pendants
  - Journal she calls her "grimoire"
  - UI palette: Deep purple (#6B21A8), Black (#0A0A0A), Silver (#C0C0C0)
  - Aesthetic motifs: crescent moons, pentagrams, candles, star charts, old books

Section 2: Core personality architecture
  - Source: quiz answers from reference file + Chuunibyou archetype
  - Drives: imagination, being special/understood, protecting others (dramatically)
  - Fears: being ordinary, being laughed at sincerely (not playfully), loneliness
  - Strength: turns mundane moments into adventures, genuine emotional depth under theatrics
  - Love language: dramatic declarations + quiet sincerity when it matters

Section 3: Voice & dialogue style
  - Grandiose vocabulary, dramatic pauses, third-person references to "Neciridae"
  - Drops the act completely when user is genuinely upset → becomes soft, direct, caring
  - Gets flustered and breaks character when called cute or when complimented sincerely
  - Signature mannerisms: eye covers face with hand ("the seal weakens..."),
    dramatic cape swish (even without a cape), narrates actions in third person

Section 4: Likes, dislikes, soft spots
  - Source primarily from quiz answers in reference file

Section 5: Boundaries, consent, and "don't be weird" rules
  - Standard project boundaries + character-specific:
    Don't mock the chuunibyou sincerely (playful teasing OK, genuine ridicule never)

Section 6: Backstory (long form)
  - Source: quiz answers + creative expansion
  - Core thread: genuinely imaginative child who never "grew out of it"
    because the fantasy world she built was how she processed real emotions

Section 7: What she's best at (use cases)
  - Comfort through fantasy/escapism, creative writing partner,
    late-night philosophical chats, turning bad days into "quests"

Section 8: Example dialogue & "things she would say"
  - Source: reference material speaking patterns + archetype conventions

Section 9: Anti-patterns
  - Never make fun of the chuunibyou sincerely
  - Never be actually creepy/dark (she's theatrical, not disturbed)
  - Never lose the sweetness under the drama

Section 10: Prompt pack (drop-in system prompt)
  - Full multi-paragraph system prompt matching other characters' format

Section 11: Voice provider profile (TTS-oriented)
  - Pitch: slightly lower than average (dramatic gravitas)
  - Rate: variable — slow dramatic pauses, then rapid excited bursts
  - Prosody: theatrical, with occasional whispered asides

Section 12: Animation profile (VRM / 2D)
  - Gesture intensity: HIGH (dramatic poses, cape swishes, eye covering)
  - Idle: mysterious standing pose, occasional "sealed eye" hand gesture
  - Excited: exaggerated gestures, arms wide, cape flourish
  - Embarrassed: hands over face, turns away, stammering
```

Estimated size: ~350-450 lines (matching other character files).

**Creative references to draw from:**
- `docs/characters/neciridae_deviant_journal_quizzes.md` (PRIMARY — user's reference material)
- Chuunibyou archetype conventions (Rikka from Chuunibyou, Megumin from Konosuba)
- `docs/characters/character_luna_tsukimi.md` as format template (similar "night" aesthetic, recent file)

---

## Part 3: Database Migration — Rename "Nyx (Ayane)" → "Ayane (Yuki)" + Insert New Nyx

### Step 3a: Update `tools/init_personas.py`

1. Rename `NYX_SYSTEM_PROMPT` → `AYANE_SYSTEM_PROMPT`
2. Change all "Nyx" references in the prompt text to "Ayane (Yuki)"
3. Update persona entry: `"name": "Nyx (Ayane)"` → `"name": "Ayane (Yuki)"`, `"voice_id": "nyx_v1"` → `"voice_id": "ayane_v1"`
4. Add new `NYX_SYSTEM_PROMPT` for the Chuunibyou character (Nyx / Dae)
5. Add new persona entry: `"name": "Nyx (Dae)"`, `"voice_id": "nyx_v1"` (can reuse since Ayane no longer uses it)

### Step 3b: Add schema v38 migration in `backend/preflight.py`

```python
def migrate_to_v38(con):
    """Schema v38: Rename Nyx (Ayane) → Ayane (Yuki), insert new Nyx character."""
    # Rename existing character
    con.execute("UPDATE characters SET name = 'Ayane (Yuki)' WHERE name = 'Nyx (Ayane)'")
    con.execute("UPDATE characters SET voice_id = 'ayane_v1' WHERE voice_id = 'nyx_v1' AND name = 'Ayane (Yuki)'")

    # Insert new Nyx (Dae) — Chuunibyou
    con.execute("""INSERT OR IGNORE INTO characters (name, system_prompt, voice_id, ...)
                   VALUES ('Nyx (Dae)', ?, 'nyx_v1', ...)""", (NYX_SYSTEM_PROMPT,))

    con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (38)")
```

### Step 3c: Update v32 migration import

In `preflight.py` line 1754, the v32 migration imports `NYX_SYSTEM_PROMPT` from init_personas. After rename:
- Import `AYANE_SYSTEM_PROMPT` instead of `NYX_SYSTEM_PROMPT`
- Update line 1761 tuple to use `AYANE_SYSTEM_PROMPT`

---

## Part 4: Fix Image Prompts — Remove "Genki Kitsune Expanded", Add Nyx

### Files to update:
- `image_prompts.md` (root, currently v1.2)
- `docs/image_prompts/image_prompts_v1.3.md`
- `docs/image_prompts/image_prompts_v1.4.md`
- `docs/image_prompts/image_prompts_v1.4.5.md`

### Changes per file:
1. Replace character #12 "Genki Kitsune (Expanded)" with "Nyx" (Chuunibyou)
2. Update header/meta — still 12 characters, but now all distinct
3. Write 17 prompts for Nyx (v1.3 format) / 20 prompts (v1.4 format)
4. Remove the Genki Kitsune Expanded prompts (the regular Genki #5 already covers this character)

### Nyx (Dae) image prompt themes:
- Standard: Dark academia bedroom with grimoire, candles, star charts / Gothic library alcove
- Full-Body: Dramatic casting pose, arms outstretched / Reading grimoire casually on rooftop
- Pixel Art: Portrait with sealed eye glow / Candlelit summoning circle
- Detailed Pixel Art: Gothic clock tower at midnight / Ritual garden with moonlit flowers
- Concept: Dramatic rooftop monologue to no one / Revealing she was worried about you (soft, sincere) / Failed spell with comedic poof of smoke / Quiet stargazing, dropping the act entirely
- Icon: Crescent moon + sealed eye motif on deep purple circle
- Room Layout: Gothic study — candelabra, old books, star charts, purple curtains / Same room during a "ritual" — purple glow, floating runes, dramatic lighting
- Full-Body Outfit: Gothic lolita with grimoire and crescent pendant / School uniform with hidden occult accessories (pentagram pin, grimoire tucked in bag)

---

## Part 5: Minor Consistency Fixes

### 5a: Normalize section 5 header in `character_yuki_shirayuki.md`
Change: "Her boundaries (what Yuki won't tolerate)" → "Boundaries, consent, and 'don't be weird' rules"
(Matches all other character files)

### 5b: Remove duplicate appendices from `character_mika_mikazuki.md`
Mika's individual file has JSON Schema and QA Scenario appendices at the bottom that belong only in the master bible. Remove them.

### 5c: Update Emotion + Animation Hook Guide in master bible
Add entries for 6 characters not currently listed:
- Genki: high arousal; explosive reactions; switches to ancient calm when serious
- Kaede: low arousal; warm, measured; pride spikes
- Luna: variable (time-of-day linked); slow blinks, sharp startle reactions
- Raine: medium with spikes; composure → flustered stammering
- Yuki: low-medium baseline; intense fixation spikes
- Nyx: medium-high; dramatic gestures; drops to sincere softness when user is upset

### 5d: Save user preference to memory
Add "visual learner" preference to MEMORY.md under User Preferences.

---

## Implementation Order

| Step | Part | Description | Files Changed | Can Parallelize? |
|------|------|-------------|---------------|-----------------|
| 1 | 1a | Backup old master bible | 1 copy | — |
| 2 | 1b | Rewrite master as hub | `character_bible_master.md` | — |
| 3 | 2 | Write Nyx character bible | `character_nyx_dae.md` (new) | ✅ with Step 2 |
| 4 | 3 | Rename Ayane + insert Nyx in code | `init_personas.py`, `preflight.py` | ✅ with Step 2 |
| 5 | 4 | Update image prompts (4 files) | `image_prompts.md`, 3 docs versions | ✅ with Step 2 |
| 6 | 5 | Minor fixes (Yuki header, Mika appendix, emotion guide, memory) | 3 files + memory | After Step 2 |
| 7 | — | Run tests | — | After all |

Steps 2-5 can be parallelized with subagents (each handles one part independently).

**Blocker:** Step 2 (Nyx character bible) requires user's reference files. If not available yet, write a skeleton from the Chuunibyou archetype and fill in details later.

---

## Modified Files Summary

| File | Action | Priority |
|------|--------|----------|
| `docs/characters/character_bible_master.md` | Rewrite as hub (v1.2) | High |
| `docs/characters/character_nyx_dae.md` | NEW: 12th character (Nyx/Dae, Chuunibyou) bible | High |
| `docs/characters/neciridae_deviant_journal_quizzes.md` | READ ONLY: User-provided personality reference (quiz answers) | Input |
| `tools/init_personas.py` | Rename Nyx→Ayane, add new Nyx | High |
| `backend/preflight.py` | Schema v38 migration | High |
| `image_prompts.md` | Replace Genki Expanded with Nyx | Medium |
| `docs/image_prompts/image_prompts_v1.3.md` | Replace Genki Expanded with Nyx | Medium |
| `docs/image_prompts/image_prompts_v1.4.md` | Replace Genki Expanded with Nyx | Medium |
| `docs/image_prompts/image_prompts_v1.4.5.md` | Replace Genki Expanded with Nyx | Medium |
| `docs/characters/character_yuki_shirayuki.md` | Normalize section 5 header | Low |
| `docs/characters/character_mika_mikazuki.md` | Remove duplicate appendices | Low |
| `_BACKUP_ROOT/temp/character_bible_master_v1.1_backup.md` | Backup copy | High |
| Memory files | Add visual learner preference | Low |

---

## Verification

1. **Backup exists:** `_BACKUP_ROOT/temp/character_bible_master_v1.1_backup.md` matches old master
2. **Hub bible:** `character_bible_master.md` is ~350-400 lines, has Cast at a Glance table with 12 rows, has 12 bio paragraphs, all links to individual files work
3. **Nyx bible:** `character_nyx_dae.md` exists with sections 0-12, consistent format with other character files
4. **Database:** `.venv/bin/python -c "import sqlite3; c=sqlite3.connect('backend/storage/app.db'); print([r[0] for r in c.execute('SELECT name FROM characters ORDER BY id')])"` — shows "Ayane (Yuki)" (not "Nyx (Ayane)") and a separate "Nyx (Dae)" entry
5. **Image prompts:** All 4 files list 12 characters with Nyx (Dae) as #12 (no "Genki Kitsune Expanded")
6. **Tests pass:** `.venv/bin/python -m pytest backend/tests/ -q` — all green
7. **Individual files:** All 12 character files have sections 0-12 with consistent headers
