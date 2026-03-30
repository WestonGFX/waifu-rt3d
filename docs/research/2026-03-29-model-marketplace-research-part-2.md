> **This is Part 2 of 4.** See also: [Part 1](2026-03-29-model-marketplace-research-part-1.md), [Part 3](2026-03-29-model-marketplace-research-part-3.md), [Part 4](2026-03-29-model-marketplace-research-part-4.md)

## 2. Live2D Model Sources

### 2.1 nizima Marketplace Deep Dive

| Attribute | Details |
|-----------|---------|
| **URL** | https://nizima.com |
| **Content** | Official Live2D marketplace -- illustrations and rigged Live2D models |
| **Pricing** | Paid models (JPY); some free samples |
| **Licensing** | Per-model; commercial use varies; covered by nizima ToS |
| **API** | No public browse/search API for marketplace |
| **Plugin API** | WebSocket-based Plugin API for nizima LIVE app |
| **Model Spec** | nizima model specification (beta v0.4) |
| **Format** | .moc3 + .model3.json (Cubism 3/4/5) |
| **Quality** | Professional -- vetted marketplace |

#### nizima Model Specification (Beta v0.4)

The nizima model specification is a standardized format for describing how Live2D models respond to user interactions. It is designed to work across multiple nizima-compatible applications.

**Supported Interactions:**
- **Taps** -- Touch/click on specific model regions
- **Flicks** -- Swipe gestures in specific directions
- **Expression changes** -- Automatic facial expression transitions

**Technical Foundation:**
- Built on Live2D's "Original Workflow" (Cubism 3+)
- Settings configured within the model3.json file
- Uses standard Live2D parameters and expressions
- Compatible with any app that implements the specification

**Model Capability Declaration:**
Models may display compatibility icons indicating nizima spec support. However, the marking is supplementary -- some compatible models may not display the icon.

#### nizima LIVE Plugin API

The nizima LIVE application exposes a WebSocket-based API for plugins:

**Connection:**
```
ws://localhost:22022/
```

**Message Format:**
```json
{
  "Type": "Request",
  "Method": "MethodName",
  "Data": {},
  "Timestamp": 1680000000,
  "Id": "unique-request-id"
}
```

**Message Types:**
- `Request` -- Client to server
- `Response` -- Server response to request
- `Event` -- Server-pushed event
- `Error` -- Error response

This API is for controlling the nizima LIVE app (model display, expression triggering), NOT for browsing the marketplace. It could be used to integrate with nizima LIVE for model previewing but is not relevant for our model browser.

#### Integration: Link-Out Only

nizima has no public browse API. Integration approach:
1. Link to nizima marketplace for Live2D model purchase
2. User imports purchased models via drag-and-drop
3. Our app reads .model3.json to load the complete model package

---

### 2.2 Booth.pm Live2D Section

| Attribute | Details |
|-----------|---------|
| **URL** | https://booth.pm/en/search/live2d |
| **Content** | 14,000+ Live2D items (includes textures, tools, not just models); ~4,000 actual models |
| **Pricing** | Mix of free and paid |
| **Licensing** | Per-creator; no standardization |
| **Format** | .moc3 + .model3.json + textures (as ZIP or folder) |
| **Quality** | Variable to professional |

Booth.pm is the largest source of Live2D models outside of nizima. Many professional VTuber riggers sell their models here. Price range: free to 50,000+ JPY ($335+ USD) for professional models.

Search URLs:
```
https://booth.pm/en/search/live2d%20model          # All Live2D models
https://booth.pm/en/search/live2d%20model?tags[]=model  # Tagged "model"
https://booth.pm/en/search/free%20live2d            # Free Live2D items
```

---

### 2.3 Free Live2D Sample Models

| Source | Models | License | Notes |
|--------|--------|---------|-------|
| **Live2D Official Samples** | Haru, Hiyori, Mao, Mark, Natori, Rice | Free for development | From Live2D website and SDK packages |
| **Cubism SDK Samples** | 6-8 models per SDK version | SDK license | Bundled with Cubism SDK downloads |
| **nizima ACTION!!** | Various | Free for video creation | Restricted to video use, not apps |
| **ShiraLive2D** | Several free models | Varies per model | Free downloads from shiralive2d.com |
| **Live3D.io** | 100+ free VTuber models | Varies | Mix of VRM and Live2D, curated list |

#### Live2D Official Sample Models (Recommended for Development)

The official samples are the best starting point for our app's Live2D development:

| Model | Cubism Version | Features |
|-------|---------------|----------|
| **Haru** | 4.x | Full-body, many expressions, physics, lip sync |
| **Hiyori** | 4.x | Upper-body, expressions, simple physics |
| **Mao** | 4.x | Upper-body, cat-ear physics |
| **Mark** | 4.x | Male model, expressions, simple rigging |
| **Natori** | 4.x | Professional quality, many parameters |
| **Rice** | 4.x | Simple model, good for testing |

These can be downloaded from:
- https://www.live2d.com/en/learn/sample/
- Included in Cubism SDK download packages
- Available in the CubismWebSamples GitHub repository

---

### 2.4 itch.io Live2D

A smaller selection compared to Booth or nizima. Content tends to be:
- Free Live2D models for VTubing (ready-to-use)
- PSD templates for Live2D rigging practice
- Live2D game asset packs (expressions, animations)
- Tutorial-focused resources

Notable tags: `live2d`, `vtuber`, `2d`, `character`

---

## 3. VRM Format Internals

### 3.1 VRM 0.x Extension Schema

VRM 0.x uses a single monolithic `VRM` extension in the glTF 2.0 JSON. The file is a standard .glb (binary glTF) with the `VRM` extension added.

**Top-Level Structure:**
```json
{
  "extensions": {
    "VRM": {
      "exporterVersion": "UniVRM-0.99.0",
      "specVersion": "0.0",
      "meta": { ... },
      "humanoid": { ... },
      "firstPerson": { ... },
      "blendShapeMaster": { ... },
      "secondaryAnimation": { ... },
      "materialProperties": [ ... ]
    }
  }
}
```

**meta (Metadata and License):**
```json
{
  "title": "Avatar Name",
  "version": "1.0",
  "author": "Creator Name",
  "contactInformation": "email@example.com",
  "reference": "https://...",
  "texture": 0,
  "allowedUserName": "Everyone",
  "violentUssageName": "Allow",
  "sexualUssageName": "Disallow",
  "commercialUssageName": "Allow",
  "otherPermissionUrl": "https://...",
  "licenseName": "CC0-1.0",
  "otherLicenseUrl": ""
}
```

Note the intentional typos: `violentUssageName` and `sexualUssageName` (double 's') are part of the spec and must be matched exactly.

**humanoid:**
```json
{
  "humanBones": [
    { "bone": "hips", "node": 0, "useDefaultValues": true },
    { "bone": "spine", "node": 1, "useDefaultValues": true },
    { "bone": "leftUpperArm", "node": 5, "useDefaultValues": true }
  ],
  "armStretch": 0.05,
  "legStretch": 0.05,
  "upperArmTwist": 0.5,
  "lowerArmTwist": 0.5,
  "upperLegTwist": 0.5,
  "lowerLegTwist": 0.5,
  "feetSpacing": 0,
  "hasTranslationDoF": false
}
```

**blendShapeMaster (Expressions):**
```json
{
  "blendShapeGroups": [
    {
      "name": "Joy",
      "presetName": "joy",
      "binds": [
        { "mesh": 0, "index": 3, "weight": 100.0 }
      ],
      "materialValues": []
    }
  ]
}
```

VRM 0.x preset expression names: `neutral`, `joy`, `angry`, `sorrow`, `fun`, `a`, `i`, `u`, `e`, `o`, `blink`, `blink_l`, `blink_r`, `lookup`, `lookdown`, `lookleft`, `lookright`

**secondaryAnimation (Spring Bones):**
```json
{
  "boneGroups": [
    {
      "comment": "hair_front",
      "stiffiness": 0.5,
      "gravityPower": 0.1,
      "gravityDir": { "x": 0, "y": -1, "z": 0 },
      "dragForce": 0.4,
      "center": -1,
      "hitRadius": 0.02,
      "bones": [10, 11, 12],
      "colliderGroups": [0, 1]
    }
  ],
  "colliderGroups": [
    {
      "node": 3,
      "colliders": [
        { "offset": { "x": 0, "y": 0.05, "z": 0 }, "radius": 0.08 }
      ]
    }
  ]
}
```

Note: `stiffiness` (not `stiffness`) is another intentional spec typo.

**materialProperties:**
```json
[
  {
    "name": "MaterialName",
    "shader": "VRM/MToon",
    "renderQueue": 2000,
    "floatProperties": {
      "_Cutoff": 0.5,
      "_OutlineWidth": 0.002,
      "_ShadeToony": 0.9
    },
    "vectorProperties": {
      "_Color": [1, 1, 1, 1],
      "_ShadeColor": [0.8, 0.75, 0.85, 1],
      "_OutlineColor": [0, 0, 0, 1]
    },
    "textureProperties": {
      "_MainTex": 0,
      "_ShadeTexture": 1
    },
    "keywordMap": { "_ALPHABLEND_ON": false },
    "tagMap": { "RenderType": "Opaque" }
  }
]
```

Available shader types: `VRM/MToon`, `VRM/UnlitTexture`, `VRM/UnlitCutout`, `VRM/UnlitTransparent`, `VRM/UnlitTransparentZWrite`

---

### 3.2 VRM 1.0 VRMC Extension Schema

VRM 1.0 uses modular VRMC (VRM Community/Consortium) extensions instead of a single monolithic block. This allows each subsystem to evolve independently.

**Extension List:**
| Extension | Purpose | Required |
|-----------|---------|----------|
| `VRMC_vrm` | Core: humanoid, meta, expressions, lookAt, firstPerson | Yes |
| `VRMC_springBone` | Dynamic bone simulation | No |
| `VRMC_node_constraint` | Bone constraints (roll, aim, rotation) | No |
| `VRMC_materials_mtoon` | MToon10 toon shader | No |
| `KHR_materials_unlit` | Unlit material (glTF standard) | No |
| `KHR_texture_transform` | Texture UV transform (no rotation) | No |
| `KHR_materials_emissive_strength` | Emissive intensity | No |
| `VRMC_vrm_animation` | Animation data (separate spec) | No |

**Top-Level Structure:**
```json
{
  "extensionsUsed": [
    "VRMC_vrm",
    "VRMC_springBone",
    "VRMC_node_constraint",
    "VRMC_materials_mtoon"
  ],
  "extensions": {
    "VRMC_vrm": {
      "specVersion": "1.0",
      "meta": { ... },
      "humanoid": { ... },
      "firstPerson": { ... },
      "expressions": { ... },
      "lookAt": { ... }
    },
    "VRMC_springBone": { ... },
    "VRMC_node_constraint": { ... }
  }
}
```

**Processing Order (Mandatory):**
1. Resolve humanoid bones from node tree
2. Apply LookAt (bone-type or expression-type)
3. Update expression weights from application inputs
4. Apply expression morphs/material changes to meshes
5. Resolve node constraints
6. Simulate spring bones

**Format Specifications:**
- File format: GLB (binary glTF 2.0)
- Extension: .vrm
- Units: Metric (meters)
- Coordinate system: Right-handed, Y-up
- Forward direction: Z+ (unlike 0.x which was Z-)
- Animations and cameras from standard glTF are excluded

**JSON Schema Location:**
All schemas are at: `https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0/schema`

---

### 3.3 Humanoid Bone Mapping (Complete)

VRM defines a standard humanoid skeleton. Every VRM model must map its skeleton nodes to these standard bone names.

#### Required Bones (15 bones)

| Bone Name | Parent | Notes |
|-----------|--------|-------|
| `hips` | (root) | Root of the humanoid skeleton |
| `spine` | hips | |
| `head` | neck (or chest if neck missing) | |
| `leftUpperLeg` | hips | |
| `leftLowerLeg` | leftUpperLeg | |
| `leftFoot` | leftLowerLeg | |
| `rightUpperLeg` | hips | |
| `rightLowerLeg` | rightUpperLeg | |
| `rightFoot` | rightLowerLeg | |
| `leftUpperArm` | leftShoulder (or chest) | |
| `leftLowerArm` | leftUpperArm | |
| `leftHand` | leftLowerArm | |
| `rightUpperArm` | rightShoulder (or chest) | |
| `rightLowerArm` | rightUpperArm | |
| `rightHand` | rightLowerArm | |

#### Optional Bones -- Torso (3 bones)

| Bone Name | Parent | Notes |
|-----------|--------|-------|
| `chest` | spine | Required in VRM 0.x, optional in 1.0 |
| `upperChest` | chest | Only valid when chest exists |
| `neck` | upperChest (or chest) | |

#### Optional Bones -- Head (3 bones)

| Bone Name | Parent | Notes |
|-----------|--------|-------|
| `leftEye` | head | For eye bone tracking |
| `rightEye` | head | For eye bone tracking |
| `jaw` | head | For jaw tracking |

#### Optional Bones -- Extremities (4 bones)

| Bone Name | Parent |
|-----------|--------|
| `leftToes` | leftFoot |
| `rightToes` | rightFoot |
| `leftShoulder` | upperChest (or chest) |
| `rightShoulder` | upperChest (or chest) |

#### Optional Bones -- Fingers (30 bones)

Left hand (15 bones):
| Finger | Bones |
|--------|-------|
| Thumb | `leftThumbMetacarpal`, `leftThumbProximal`, `leftThumbDistal` |
| Index | `leftIndexProximal`, `leftIndexIntermediate`, `leftIndexDistal` |
| Middle | `leftMiddleProximal`, `leftMiddleIntermediate`, `leftMiddleDistal` |
| Ring | `leftRingProximal`, `leftRingIntermediate`, `leftRingDistal` |
| Little | `leftLittleProximal`, `leftLittleIntermediate`, `leftLittleDistal` |

Right hand (15 bones): Same structure with `right` prefix.

**Total: 15 required + 40 optional = 55 possible humanoid bones**

#### Bone Constraints

- All humanoid bones must be unique (no two humanoid bones can share the same node)
- Non-humanoid bone nodes are permitted between humanoid bones (e.g., twist bones between upper arm and lower arm)
- Scale components MUST have positive values (zero is not permitted)
- The parent bone of each humanoid bone follows a fixed hierarchy; if an optional parent bone is missing, look up the chain to the next available parent

#### VRM 0.x vs 1.0 Bone Name Differences

| VRM 0.x | VRM 1.0 |
|---------|---------|
| `leftThumbProximal` | `leftThumbMetacarpal` |
| `leftThumbIntermediate` | `leftThumbProximal` |
| `leftThumbDistal` | `leftThumbDistal` |

The thumb bone naming shifted by one segment in VRM 1.0. `@pixiv/three-vrm` handles this automatically.

---

### 3.4 Blend Shapes and Expressions

#### VRM 0.x: BlendShapeProxy

VRM 0.x uses `blendShapeMaster.blendShapeGroups` to define expressions:

**Preset Names (17 total):**

| Category | Presets |
|----------|---------|
| Emotions | `neutral`, `joy`, `angry`, `sorrow`, `fun` |
| Lip Sync | `a`, `i`, `u`, `e`, `o` |
| Blink | `blink`, `blink_l`, `blink_r` |
| Gaze | `lookup`, `lookdown`, `lookleft`, `lookright` |

Custom expressions can be added with arbitrary names.

#### VRM 1.0: Expressions

VRM 1.0 renames and restructures the expression system:

**Preset Names (20 total):**

| Category | Presets | Override Behavior |
|----------|---------|-------------------|
| Emotions | `happy`, `angry`, `sad`, `relaxed`, `surprised` | overrideMouth, overrideBlink, overrideLookAt |
| Lip Sync | `aa`, `ih`, `ou`, `ee`, `oh` | Procedural, controlled by audio |
| Blink | `blink`, `blinkLeft`, `blinkRight` | Procedural, controlled by tracking |
| Gaze | `lookUp`, `lookDown`, `lookLeft`, `lookRight` | Procedural, controlled by tracking |
| Other | `neutral` | Backwards compatibility |

**Name Changes from 0.x to 1.0:**

| VRM 0.x | VRM 1.0 |
|---------|---------|
| `joy` | `happy` |
| `sorrow` | `sad` |
| `fun` | `relaxed` |
| `blink_l` | `blinkLeft` |
| `blink_r` | `blinkRight` |
| `lookup` | `lookUp` |
| `lookdown` | `lookDown` |
| `lookleft` | `lookLeft` |
| `lookright` | `lookRight` |
| `a` | `aa` |
| `i` | `ih` |
| `u` | `ou` |
| `e` | `ee` |
| `o` | `oh` |
| (new in 1.0) | `surprised` |

**Expression Object Schema (VRM 1.0):**
```json
{
  "preset": {
    "happy": {
      "isBinary": false,
      "morphTargetBinds": [
        {
          "node": 0,
          "index": 3,
          "weight": 1.0
        }
      ],
      "materialColorBinds": [
        {
          "material": 0,
          "type": "color",
          "targetValue": [1.0, 0.8, 0.8, 1.0]
        }
      ],
      "textureTransformBinds": [
        {
          "material": 0,
          "scale": [1.0, 1.0],
          "offset": [0.0, 0.5]
        }
      ],
      "overrideMouth": "blend",
      "overrideBlink": "none",
      "overrideLookAt": "none"
    }
  },
  "custom": {
    "myCustomExpression": { ... }
  }
}
```

**Override Behavior:**
- `none` -- No interference with procedural expressions
- `block` -- When this expression weight > 0, the overridden category weight is forced to 0
- `blend` -- The overridden category weight is attenuated proportionally (multiplied by 1 - expression weight)

This is important for preventing conflicting expressions (e.g., "happy" should partially close the mouth, suppressing lip sync).

---

### 3.5 Spring Bones

#### VRM 0.x: secondaryAnimation

Spring bones in VRM 0.x are defined in `extensions.VRM.secondaryAnimation`:

```json
{
  "boneGroups": [
    {
      "comment": "hair_front",
      "stiffiness": 0.5,
      "gravityPower": 0.1,
      "gravityDir": { "x": 0, "y": -1, "z": 0 },
      "dragForce": 0.4,
      "center": -1,
      "hitRadius": 0.02,
      "bones": [10, 11, 12],
      "colliderGroups": [0, 1]
    }
  ],
  "colliderGroups": [
    {
      "node": 3,
      "colliders": [
        { "offset": { "x": 0, "y": 0.05, "z": 0 }, "radius": 0.08 }
      ]
    }
  ]
}
```

Parameters:
- `stiffiness` (sic): How quickly the bone returns to its rest position (0-4, higher = stiffer)
- `gravityPower`: Gravity influence (0-2)
- `gravityDir`: Gravity direction vector
- `dragForce`: Air resistance (0-1, higher = more damping)
- `hitRadius`: Radius of the spring bone's spherical collision shape
- `center`: Reference node for relative movement (-1 = world space)

#### VRM 1.0: VRMC_springBone

VRM 1.0 restructures spring bones into a separate extension with improved features:

```json
{
  "VRMC_springBone": {
    "specVersion": "1.0",
    "colliders": [
      {
        "node": 3,
        "shape": {
          "sphere": { "offset": [0, 0.05, 0], "radius": 0.08 }
        }
      },
      {
        "node": 4,
        "shape": {
          "capsule": { "offset": [0, 0, 0], "radius": 0.05, "tail": [0, 0.1, 0] }
        }
      }
    ],
    "colliderGroups": [
      { "name": "head", "colliders": [0, 1] }
    ],
    "springs": [
      {
        "name": "hair_front",
        "joints": [
          {
            "node": 10,
            "hitRadius": 0.02,
            "stiffness": 0.5,
            "gravityPower": 0.1,
            "dragForce": 0.4
          },
          {
            "node": 11,
            "hitRadius": 0.02,
            "stiffness": 0.3,
            "gravityPower": 0.1,
            "dragForce": 0.4
          }
        ],
        "colliderGroups": [0],
        "center": null
      }
    ]
  }
}
```

Key improvements in 1.0:
- **Capsule colliders** in addition to sphere colliders
- **Per-joint parameters** instead of per-group (finer control)
- Named springs and collider groups
- Typo corrections (`stiffness` instead of `stiffiness`)
- Cleaner separation of concerns

---

### 3.6 License Metadata JSON Paths

#### VRM 0.x License Fields

Path: `extensions.VRM.meta`

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `title` | string | Any | Model name |
| `version` | string | Any | Model version |
| `author` | string | Any | Creator name |
| `contactInformation` | string | Any | Creator contact |
| `reference` | string | URL | Related URL |
| `texture` | int | Texture index | Thumbnail texture |
| `allowedUserName` | enum | `OnlyAuthor`, `ExplicitlyLicensedPerson`, `Everyone` | Who can use |
| `violentUssageName` | enum | `Disallow`, `Allow` | Violence OK? |
| `sexualUssageName` | enum | `Disallow`, `Allow` | Sexual content OK? |
| `commercialUssageName` | enum | `Disallow`, `Allow` | Commercial use OK? |
| `otherPermissionUrl` | string | URL | Additional permissions |
| `licenseName` | enum | See below | License identifier |
| `otherLicenseUrl` | string | URL | Custom license URL |

`licenseName` values: `Redistribution_Prohibited`, `CC0`, `CC_BY`, `CC_BY_NC`, `CC_BY_SA`, `CC_BY_NC_SA`, `CC_BY_ND`, `CC_BY_NC_ND`, `Other`

#### VRM 1.0 License Fields

Path: `extensions.VRMC_vrm.meta`

VRM 1.0 expands the license metadata significantly:

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `name` | string | Required | Model name |
| `version` | string | Optional | Model version |
| `authors` | string[] | Required (min 1) | Creator names |
| `copyrightInformation` | string | Optional | Copyright notice |
| `contactInformation` | string | Optional | Contact info |
| `references` | string[] | Optional | Related URLs |
| `thirdPartyLicenses` | string | Optional | Third-party license text |
| `thumbnailImage` | int | Optional | glTF image index |
| `licenseUrl` | string | Required | License URL |
| `avatarPermission` | enum | `onlyAuthor`, `onlySeparatelyLicensedPerson`, `everyone` | Who can use as avatar |
| `allowExcessivelyViolentUsage` | bool | | Violence OK? |
| `allowExcessivelySexualUsage` | bool | | Sexual content OK? |
| `commercialUsage` | enum | `personalNonProfit`, `personalProfit`, `corporation` | Commercial use level |
| `allowPoliticalOrReligiousUsage` | bool | | Political/religious OK? |
| `allowAntisocialOrHateUsage` | bool | | Antisocial content OK? |
| `creditNotation` | enum | `required`, `unnecessary` | Attribution needed? |
| `allowRedistribution` | bool | | Redistribution OK? |
| `modification` | enum | `prohibited`, `allowModification`, `allowModificationRedistribution` | Modification level |
| `otherLicenseUrl` | string | Optional | Additional license |

Key improvements in 1.0:
- Multiple authors support
- Finer-grained commercial use levels (personal vs corporate)
- New political/religious and antisocial usage flags
- Credit notation requirement flag
- More nuanced modification permissions

---

### 3.7 MToon Shader System

MToon is VRM's signature toon/cel-shading material designed for anime-style rendering.

#### MToon (VRM 0.x)

Stored in `extensions.VRM.materialProperties` with `shader: "VRM/MToon"`.

Key properties:
| Property | Type | Purpose |
|----------|------|---------|
| `_Color` | vec4 | Base color tint |
| `_ShadeColor` | vec4 | Shadow color |
| `_MainTex` | texture | Base texture |
| `_ShadeTexture` | texture | Shadow texture |
| `_BumpMap` | texture | Normal map |
| `_BumpScale` | float | Normal intensity |
| `_ShadeToony` | float | Toony vs realistic shading (0-1) |
| `_ShadeShift` | float | Shadow threshold shift |
| `_OutlineWidthMode` | float | 0=none, 1=world, 2=screen |
| `_OutlineWidth` | float | Outline thickness |
| `_OutlineColor` | vec4 | Outline color |
| `_OutlineColorMode` | float | 0=fixed, 1=mixed |
| `_EmissionColor` | vec4 | Emissive color |
| `_EmissionMap` | texture | Emissive texture |
| `_RimColor` | vec4 | Rim light color |
| `_RimFresnelPower` | float | Rim light falloff |

#### MToon10 (VRM 1.0)

VRM 1.0 uses the `VRMC_materials_mtoon` extension on individual glTF materials. The properties are similar but use the glTF material extension pattern rather than a custom properties array.

`@pixiv/three-vrm` supports both MToon and MToon10, with `v0CompatShade` mode for backward compatibility.

---

### 3.8 @pixiv/three-vrm 3.4.1 Compatibility

| Feature | Supported |
|---------|-----------|
| VRM 0.x loading | Yes |
| VRM 1.0 loading | Yes |
| Auto-detection (0.x vs 1.0) | Yes |
| VRM 0.x backward compat shading | Yes (`v0CompatShade`) |
| VRM 0.x rotation fix | Yes (`VRMUtils.rotateVRM0`) |
| Three.js >= 0.137 | Required |
| Spring bones (both versions) | Yes |
| MToon / MToon10 | Yes |
| Expression / BlendShape | Yes |
| Node constraints (1.0) | Yes |
| Humanoid bone access | Yes, via `vrm.humanoid.getNormalizedBoneNode('hips')` |
| Expression control | Yes, via `vrm.expressionManager.setValue('happy', 1.0)` |
| LookAt control | Yes, via `vrm.lookAt.target` |
| Spring bone update | Yes, via `vrm.springBoneManager.update(delta)` |

**Loading Code:**
```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

loader.load('model.vrm', (gltf) => {
  const vrm = gltf.userData.vrm;

  // Fix VRM 0.x coordinate system
  VRMUtils.rotateVRM0(vrm);

  // Remove unnecessary objects for performance
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.removeUnnecessaryJoints(gltf.scene);

  scene.add(gltf.scene);
});
```

---

