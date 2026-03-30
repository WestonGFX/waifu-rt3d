> **This is Part 3 of 4.** See also: [Part 1](2026-03-29-model-marketplace-research-part-1.md), [Part 2](2026-03-29-model-marketplace-research-part-2.md), [Part 4](2026-03-29-model-marketplace-research-part-4.md)

## 4. Live2D Format Details

### 4.1 Cubism 2 vs 3 vs 4 vs 5 Differences

| Feature | Cubism 2.x | Cubism 3.x | Cubism 4.x | Cubism 5.0-5.1 | Cubism 5.3 |
|---------|-----------|-----------|-----------|------------|-----------|
| **Model Format** | .moc + .model.json | .moc3 (v3) + .model3.json | .moc3 (v4-5) + .model3.json | .moc3 (v5) + .model3.json | .moc3 (v6) + .model3.json |
| **Motion Format** | .mtn | .motion3.json | .motion3.json | .motion3.json | .motion3.json |
| **Expression Format** | (in model) | .exp3.json | .exp3.json | .exp3.json | .exp3.json |
| **Physics** | Built-in | .physics3.json | .physics3.json | .physics3.json | .physics3.json |
| **Deformers** | Warp, rotation | Enhanced warp/rotation | Glue, blend deformers | Same as 4.x | New blend modes |
| **Max Texture** | 2048x2048 | 2048x2048 | 4096x4096 (Pro) | 4096x4096 | 4096x4096 |
| **Physics** | Simple | Improved | Advanced + wind | Enhanced | Enhanced |
| **Art Parts Limit (Free)** | N/A | 100 | 100 | 100 | 100 |
| **SDK Compatibility** | Cubism 2 SDK only | Cubism 3+ SDK | Cubism 4+ SDK | Cubism 4+ SDK | **Cubism 5.3 SDK only** |

**Critical Version Break: Cubism 5.3**

Cubism 5.3 (released January 2026) introduced moc3 version 6, which is NOT backward-compatible with Cubism 4 SDK runtimes. The error message:
```
"The Core unsupport later than moc3 ver:[5]. This moc3 ver is [6]"
```

New Cubism 5.3 features causing incompatibility:
- New blend modes for drawing
- Offscreen drawing capabilities
- New moc3 binary format extensions

**Migration Notes:**
- Cubism 2.1 models (.moc + .mtn) can be converted to Cubism 3+ format using the "Convert Data" feature in Cubism Editor
- Motion curves are calculated differently between Cubism 2.x and 3+; converted motions use approximate values
- Cubism 4 Editor can export moc3 files targeting Cubism 3 SDK by selecting the appropriate export version
- Cubism 5.0-5.1 exports are compatible with Cubism 4 SDK

---

### 4.2 .moc3 Binary Format

The .moc3 file is a compiled binary containing all model geometry, deformer data, parameter definitions, and draw order information.

**Header Structure:**
```
Offset  Size  Field
0x00    4     Magic: "MOC3"
0x04    1     Version: 3 (Cubism 3), 4 (Cubism 4), 5 (Cubism 5.0-5.1), 6 (Cubism 5.3)
0x05    1     Big-endian flag (0 = little-endian)
0x06    2     Reserved
```

**Version Detection Code:**
```javascript
/**
 * Detect the moc3 file version from its binary header.
 *
 * @param {ArrayBuffer} buffer - Raw moc3 file data
 * @returns {{ magic: string, version: number, supported: boolean }}
 */
function detectMoc3Version(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  const version = view.getUint8(4);
  return {
    magic,
    version,
    supported: version >= 3 && version <= 5,  // v6 (Cubism 5.3) not supported
  };
}
```

The rest of the binary format is proprietary and documented only in Live2D's internal specifications. The SDK runtime handles all parsing; developers interact with the model through the Cubism Core API.

**Data contained in .moc3:**
- ArtMesh vertex positions and UV coordinates
- Deformer hierarchy and transformations
- Parameter definitions (name, min, max, default)
- Part definitions and draw order
- Key frame data for parameter-driven deformations
- Warp deformer grid data
- Rotation deformer pivot and angle data

---

### 4.3 model3.json Complete Schema

The .model3.json file is the entry point for loading a Live2D model. It references all associated files.

```json
{
  "Version": 3,
  "FileReferences": {
    "Moc": "model.moc3",
    "Textures": [
      "textures/texture_00.png",
      "textures/texture_01.png"
    ],
    "Physics": "model.physics3.json",
    "UserData": "model.userdata3.json",
    "Pose": "model.pose3.json",
    "DisplayInfo": "model.cdi3.json",
    "MotionSync": "model.motionsync3.json",
    "Expressions": [
      { "Name": "default", "File": "expressions/default.exp3.json" },
      { "Name": "happy", "File": "expressions/happy.exp3.json" },
      { "Name": "angry", "File": "expressions/angry.exp3.json" },
      { "Name": "sad", "File": "expressions/sad.exp3.json" },
      { "Name": "surprised", "File": "expressions/surprised.exp3.json" }
    ],
    "Motions": {
      "Idle": [
        { "File": "motions/idle_01.motion3.json", "FadeInTime": 0.5, "FadeOutTime": 0.5 },
        { "File": "motions/idle_02.motion3.json", "FadeInTime": 0.5, "FadeOutTime": 0.5 }
      ],
      "TapBody": [
        { "File": "motions/tap_body.motion3.json", "FadeInTime": 0.3, "FadeOutTime": 0.5, "Sound": "sounds/tap.wav" }
      ],
      "TapHead": [
        { "File": "motions/tap_head.motion3.json", "FadeInTime": 0.3, "FadeOutTime": 0.5 }
      ],
      "Flick": [
        { "File": "motions/flick.motion3.json", "FadeInTime": 0.2, "FadeOutTime": 0.3 }
      ]
    }
  },
  "Groups": [
    { "Target": "Parameter", "Name": "EyeBlink", "Ids": ["ParamEyeLOpen", "ParamEyeROpen"] },
    { "Target": "Parameter", "Name": "LipSync", "Ids": ["ParamMouthOpenY"] }
  ],
  "HitAreas": [
    { "Name": "Head", "Id": "HitAreaHead" },
    { "Name": "Body", "Id": "HitAreaBody" }
  ]
}
```

**Field Reference:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `Version` | Yes | int | JSON format version (currently 3) |
| `FileReferences.Moc` | Yes | string | Path to .moc3 file |
| `FileReferences.Textures` | Yes | string[] | Texture image paths |
| `FileReferences.Physics` | No | string | Path to .physics3.json |
| `FileReferences.UserData` | No | string | Path to .userdata3.json |
| `FileReferences.Pose` | No | string | Path to .pose3.json |
| `FileReferences.DisplayInfo` | No | string | Path to .cdi3.json |
| `FileReferences.MotionSync` | No | string | Path to .motionsync3.json |
| `FileReferences.Expressions` | No | object[] | Array of {Name, File} expression refs |
| `FileReferences.Motions` | No | object | Category-keyed motion arrays |
| `Groups` | No | object[] | Parameter groupings (EyeBlink, LipSync) |
| `HitAreas` | No | object[] | Clickable regions {Name, Id} |

**Motion Object Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `File` | Yes | string | Path to .motion3.json |
| `FadeInTime` | No | float | Fade-in duration in seconds |
| `FadeOutTime` | No | float | Fade-out duration in seconds |
| `Sound` | No | string | Path to associated audio file |
| `MotionSync` | No | string | Motion-sync settings reference |

---

### 4.4 Expression Files (.exp3.json)

Expression files define parameter overrides that change the model's appearance:

```json
{
  "Type": "Live2D Expression",
  "Parameters": [
    { "Id": "ParamEyeLOpen", "Value": 0.0, "Blend": "Add" },
    { "Id": "ParamEyeROpen", "Value": 0.0, "Blend": "Add" },
    { "Id": "ParamMouthForm", "Value": 1.0, "Blend": "Add" },
    { "Id": "ParamBrowLY", "Value": -0.3, "Blend": "Add" }
  ]
}
```

**Blend Modes:**
- `Add` -- Add the value to the current parameter value
- `Multiply` -- Multiply the current parameter value by the expression value
- `Overwrite` -- Replace the current parameter value entirely

Common expression parameters:
| Parameter ID | Range | Purpose |
|-------------|-------|---------|
| `ParamEyeLOpen` | 0-1 | Left eye open amount |
| `ParamEyeROpen` | 0-1 | Right eye open amount |
| `ParamMouthOpenY` | 0-1 | Mouth vertical opening |
| `ParamMouthForm` | -1 to 1 | Mouth shape (-1=frown, 1=smile) |
| `ParamBrowLY` | -1 to 1 | Left eyebrow vertical |
| `ParamBrowRY` | -1 to 1 | Right eyebrow vertical |
| `ParamBrowLAngle` | -1 to 1 | Left eyebrow angle |
| `ParamBrowRAngle` | -1 to 1 | Right eyebrow angle |
| `ParamAngleX` | -30 to 30 | Head rotation X (degrees) |
| `ParamAngleY` | -30 to 30 | Head rotation Y |
| `ParamAngleZ` | -30 to 30 | Head rotation Z |
| `ParamBodyAngleX` | -10 to 10 | Body sway |
| `ParamEyeBallX` | -1 to 1 | Eye gaze horizontal |
| `ParamEyeBallY` | -1 to 1 | Eye gaze vertical |

---

### 4.5 Motion Files (.motion3.json)

Motion files define time-based parameter animations:

```json
{
  "Version": 3,
  "Meta": {
    "Duration": 2.5,
    "Fps": 30.0,
    "Loop": true,
    "AreBeziersRestricted": true,
    "FadeInTime": 0.5,
    "FadeOutTime": 0.5,
    "CurveCount": 4,
    "TotalSegmentCount": 24,
    "TotalPointCount": 48,
    "UserDataCount": 0,
    "TotalUserDataSize": 0
  },
  "Curves": [
    {
      "Target": "Parameter",
      "Id": "ParamAngleX",
      "Segments": [0.0, 0.0, 1, 0.5, 5.0, 1.0, 10.0, 1, 1.5, 5.0, 2.0, 0.0]
    },
    {
      "Target": "Parameter",
      "Id": "ParamAngleY",
      "Segments": [0.0, 0.0, 0, 2.5, 0.0]
    }
  ],
  "UserData": []
}
```

**Segment Types:**
- Type 0: Linear interpolation (2 values: time, value)
- Type 1: Bezier curve (6 values: time1, value1, cx1, cy1, cx2, cy2, time2, value2)
- Type 2: Stepped (2 values: time, value -- holds until next keyframe)
- Type 3: Inverse stepped

**Curve Targets:**
- `Parameter` -- Animates a model parameter
- `PartOpacity` -- Animates part visibility (0-1)
- `Model` -- Model-level properties

---

### 4.6 Physics Files (.physics3.json)

Physics files define dynamic simulation for hair, clothing, and accessories:

```json
{
  "Version": 3,
  "Meta": {
    "PhysicsSettingCount": 3,
    "TotalInputCount": 3,
    "TotalOutputCount": 6,
    "VertexCount": 9,
    "EffectiveForces": {
      "Gravity": { "X": 0.0, "Y": -1.0 },
      "Wind": { "X": 0.0, "Y": 0.0 }
    },
    "PhysicsDictionary": [
      { "Id": "PhysicsSetting1", "Name": "Hair Front" },
      { "Id": "PhysicsSetting2", "Name": "Hair Side" },
      { "Id": "PhysicsSetting3", "Name": "Ribbon" }
    ]
  },
  "PhysicsSettings": [
    {
      "Id": "PhysicsSetting1",
      "Input": [
        {
          "Source": { "Target": "Parameter", "Id": "ParamAngleX" },
          "Weight": 1.0,
          "Type": "X",
          "Reflect": false
        }
      ],
      "Output": [
        {
          "Destination": { "Target": "Parameter", "Id": "ParamHairFront" },
          "VertexIndex": 1,
          "Scale": 1.0,
          "Weight": 1.0,
          "Type": "Angle",
          "Reflect": false
        }
      ],
      "Vertices": [
        { "Position": { "X": 0.0, "Y": 0.0 }, "Mobility": 1.0, "Delay": 0.5, "Acceleration": 1.5, "Radius": 0.0 },
        { "Position": { "X": 0.0, "Y": 5.0 }, "Mobility": 0.95, "Delay": 0.5, "Acceleration": 1.5, "Radius": 3.0 }
      ],
      "Normalization": {
        "Position": { "Minimum": -10.0, "Default": 0.0, "Maximum": 10.0 },
        "Angle": { "Minimum": -10.0, "Default": 0.0, "Maximum": 10.0 }
      }
    }
  ]
}
```

**Physics Simulation Chain:**
1. Input parameters (e.g., head rotation) drive the simulation
2. Pendulum vertices swing based on input forces, gravity, and wind
3. Output maps vertex positions/angles to model parameters
4. Those parameters deform the model mesh

---

### 4.7 Pose Files (.pose3.json)

Pose files handle arm/part switching for models with alternative art (e.g., left arm in front vs behind body):

```json
{
  "Type": "Live2D Pose",
  "FadeInTime": 0.5,
  "Groups": [
    [
      { "Id": "Part_ArmL_A", "Link": [] },
      { "Id": "Part_ArmL_B", "Link": [] }
    ],
    [
      { "Id": "Part_ArmR_A", "Link": [] },
      { "Id": "Part_ArmR_B", "Link": [] }
    ]
  ]
}
```

Each group is mutually exclusive -- only one part in each group is visible at a time. The SDK handles crossfade transitions.

---

### 4.8 pixi-live2d-display Runtime Requirements

| Config | Cubism 2 | Cubism 3 | Cubism 4 | Cubism 5.0-5.1 | Cubism 5.3 |
|--------|----------|----------|----------|----------------|------------|
| Cubism 4 only (`cubism4.js`) | No | Yes | Yes | Yes | **No (v6)** |
| All versions (`index.js`) | Yes | Yes | Yes | Yes | **No (v6)** |

**Required Runtime Files:**

For Cubism 4 only:
- `cubism4.js` (from pixi-live2d-display)
- `live2dcubismcore.min.js` (from Live2D Cubism SDK -- **not redistributable**)

For all versions:
- `index.js` (from pixi-live2d-display)
- `live2d.min.js` (Cubism 2 runtime)
- `live2dcubismcore.min.js` (Cubism 4 runtime)

**Recommendation:** Use the "all versions" config. Cubism 2 models still exist. Cubism 5.3 (moc3 v6) models should be flagged as incompatible until the runtime updates.

---

## 5. Licensing Deep Dive

### 5.1 Live2D SDK Licensing Tiers

Live2D uses a revenue-based licensing model with multiple tiers:

| Category | Annual Revenue | Initial Fee | Annual Fee (per Platform) | Notes |
|----------|---------------|-------------|---------------------------|-------|
| **General User** | < 10M JPY (~$67K) | Free | Free | Individual creators |
| **Small-Scale Enterprise** | < 10M JPY | Free | Free | Small businesses |
| **Middle-Scale Enterprise** | 10M-100M JPY | 50,000 JPY | 240,000 JPY/platform | Negotiated |
| **Large-Scale Enterprise** | > 100M JPY | 300,000 JPY | 1,200,000 JPY/platform | Negotiated |

**Revenue is measured by "recent annual sales"** -- the total revenue of the publishing entity, not just SDK-related revenue.

**Exemption for Small Users:** Individuals and small-scale businesses (< 10M JPY annual revenue) are exempt from the Publication License Agreement, meaning they can use the SDK without signing any contract or paying any fees. **However, this exemption does NOT apply to Expandable Applications** (see 5.2).

---

### 5.2 Expandable Application Classification

This is the most critical licensing issue for our app.

#### Definition

An "Expandable Application" is defined as **any work having significant expandability among services or content utilizing SDK products**. This includes:

1. **Avatar-based applications** -- Apps that generate indefinite numbers of models through user-uploaded files/data combinations
2. **Platform applications** -- Portal-style access to collections of Live2D content
3. **Tracking/streaming apps** -- VTuber streaming software that loads user models
4. **Multi-model applications** -- Apps that can display multiple different Live2D works

**Our app (waifu-rt3d) almost certainly qualifies** because it loads arbitrary user-provided Live2D models, making it an "expandable" platform.

#### Requirements for Expandable Applications

ALL Expandable Applications must:

1. **Submit for review and approval** from Live2D Inc. BEFORE release
2. **Sign a special Publication License Agreement**
3. **These requirements apply to ALL publishers** -- including General Users and Small-Scale Enterprises who are normally exempt

#### Fee Structure for Expandable Applications

| Category | Annual Revenue | Initial Fee | Annual Fee | Revenue Share |
|----------|---------------|-------------|------------|---------------|
| General User / Small-Scale | < 10M JPY | Free | Free | 300 JPY/sale OR 20% of sales (whichever is higher) |
| Middle-Scale Enterprise | 10M-100M JPY | 50,000 JPY | 240,000 JPY/platform | 5% of sales |
| Large-Scale Enterprise | > 100M JPY | 300,000 JPY | 1,200,000 JPY/platform | 5% of sales |

**Key Detail:** For small publishers, the revenue share is 300 JPY per sale OR 20% of sales, whichever is HIGHER. This means even a free app would owe nothing (no sales = no share), but a paid app could face significant fees.

#### Additional Requirements

- If the app involves streaming, a specific EULA statement is required
- The Expandable Application logo must be displayed in the app
- The app must be listed in Live2D's Showcase
- Sales reporting and consent are mandatory

#### Application Process

1. Review the requirements at https://www.live2d.com/en/sdk/license/expandable/
2. Submit the application form at Live2D's official portal
3. Live2D reviews the application and contacts the publisher
4. Sign the Publication License Agreement
5. Implement required EULA, logo, and reporting

#### How Other Apps Handle This

| App | Approach | Notes |
|-----|----------|-------|
| **VTube Studio** | Has Publication License Agreement | Commercial app, pays licensing fees |
| **nizima LIVE** | Made by Live2D Inc. | No external licensing needed |
| **VSeeFace** | Free, non-commercial | Relies on users obtaining Cubism Core themselves |
| **Warudo** | Commercial | Has licensing agreement |
| **Most open-source projects** | Users provide own Cubism Core | Avoids redistribution issues entirely |

#### Recommended Strategy for Our App

**Option A: Avoid SDK Distribution (Safest)**
1. Do NOT bundle `live2dcubismcore.min.js`
2. On first Live2D model load, detect missing runtime
3. Prompt user: "Live2D Cubism Core is required. Download from Live2D?" with link to official download
4. User downloads and places the file in the app's data directory
5. App loads it from the local path

**Option B: Auto-Download at Runtime (Medium Risk)**
1. On first Live2D load, auto-download `live2dcubismcore.min.js` from Live2D's CDN
2. Cache locally
3. This puts the download action on the user's side but may still require review

**Option C: Full Licensing (Cleanest UX)**
1. Apply for Expandable Application review
2. Sign Publication License Agreement
3. Bundle the Cubism Core with the app
4. Implement required branding and reporting

For an indie/pre-revenue project, Option A is recommended to start. Apply for the license when approaching commercial release.

---

### 5.3 VRM License Types and Metadata

VRM files embed license information directly in their metadata, making it machine-readable.

#### Standard License Types

| License ID | Full Name | Bundle OK? | Redistribute? | Commercial? | Attribution? |
|------------|-----------|:----------:|:--------------:|:-----------:|:------------:|
| `CC0` | CC0 1.0 (Public Domain) | Yes | Yes | Yes | No |
| `CC_BY` | CC BY 4.0 | Yes | Yes | Yes | Yes |
| `CC_BY_SA` | CC BY-SA 4.0 | Yes (share-alike) | Yes (share-alike) | Yes | Yes |
| `CC_BY_NC` | CC BY-NC 4.0 | Limited | Limited | No | Yes |
| `CC_BY_NC_SA` | CC BY-NC-SA 4.0 | Limited | Limited (SA) | No | Yes |
| `CC_BY_ND` | CC BY-ND 4.0 | Yes | Yes (no derivatives) | Yes | Yes |
| `CC_BY_NC_ND` | CC BY-NC-ND 4.0 | Limited | No | No | Yes |
| `Redistribution_Prohibited` | No redistribution | No | No | Check per-model | N/A |
| `Other` | Custom license | Check URL | Check URL | Check URL | Check URL |

#### VRM-Specific Permission Flags

Beyond the standard CC licenses, VRM adds avatar-specific flags:

| Flag | Purpose | Impact |
|------|---------|--------|
| `allowedUserName` / `avatarPermission` | Who can "be" this avatar | Restricts who can use the model in VTuber/avatar apps |
| `violentUsage` / `allowExcessivelyViolentUsage` | Violence content | Restricts use in violent contexts |
| `sexualUsage` / `allowExcessivelySexualUsage` | Sexual content | Restricts NSFW use |
| `commercialUsage` | Commercial use | Restricts monetization |
| `allowPoliticalOrReligiousUsage` (1.0 only) | Political/religious | Restricts political messaging |
| `allowAntisocialOrHateUsage` (1.0 only) | Antisocial content | Restricts hate speech contexts |

#### Reading License in Code

```python
"""Extract VRM license metadata from a .vrm file."""

import json
import struct

def read_vrm_license(vrm_path: str) -> dict:
    """
    Extract license metadata from a VRM file.

    Args:
        vrm_path: Path to the .vrm file

    Returns:
        Dict with license fields (version-normalized)
    """
    with open(vrm_path, 'rb') as f:
        # Read GLB header
        magic = f.read(4)
        assert magic == b'glTF', "Not a valid glTF/VRM file"
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]

        # Read JSON chunk
        chunk_length = struct.unpack('<I', f.read(4))[0]
        chunk_type = f.read(4)
        assert chunk_type == b'JSON', "First chunk must be JSON"
        json_data = json.loads(f.read(chunk_length))

    extensions = json_data.get('extensions', {})

    # VRM 1.0
    if 'VRMC_vrm' in extensions:
        meta = extensions['VRMC_vrm'].get('meta', {})
        return {
            'version': '1.0',
            'name': meta.get('name', ''),
            'authors': meta.get('authors', []),
            'license_url': meta.get('licenseUrl', ''),
            'avatar_permission': meta.get('avatarPermission', 'onlyAuthor'),
            'commercial_usage': meta.get('commercialUsage', 'personalNonProfit'),
            'allow_violent': meta.get('allowExcessivelyViolentUsage', False),
            'allow_sexual': meta.get('allowExcessivelySexualUsage', False),
            'allow_political': meta.get('allowPoliticalOrReligiousUsage', False),
            'allow_antisocial': meta.get('allowAntisocialOrHateUsage', False),
            'allow_redistribution': meta.get('allowRedistribution', False),
            'modification': meta.get('modification', 'prohibited'),
            'credit_required': meta.get('creditNotation', 'required') == 'required',
        }

    # VRM 0.x
    if 'VRM' in extensions:
        meta = extensions['VRM'].get('meta', {})
        return {
            'version': '0.x',
            'name': meta.get('title', ''),
            'authors': [meta.get('author', '')],
            'license_name': meta.get('licenseName', ''),
            'license_url': meta.get('otherLicenseUrl', ''),
            'avatar_permission': meta.get('allowedUserName', 'OnlyAuthor'),
            'commercial_usage': 'Allow' if meta.get('commercialUssageName') == 'Allow' else 'Disallow',
            'allow_violent': meta.get('violentUssageName') == 'Allow',
            'allow_sexual': meta.get('sexualUssageName') == 'Allow',
            'allow_redistribution': meta.get('licenseName') not in ['Redistribution_Prohibited', ''],
            'credit_required': True,
        }

    return {'version': 'unknown', 'error': 'No VRM extension found'}
```

---

### 5.4 Creative Commons for 3D Models

| License | Summary | Key Restriction |
|---------|---------|-----------------|
| **CC0** | No rights reserved | None -- public domain equivalent |
| **CC-BY** | Attribution required | Must credit the creator |
| **CC-BY-SA** | Attribution + share-alike | Derivatives must use same license |
| **CC-BY-NC** | Attribution + non-commercial | Cannot use for commercial purposes |
| **CC-BY-ND** | Attribution + no derivatives | Cannot modify the model |
| **CC-BY-NC-SA** | Attribution + non-commercial + share-alike | Both NC and SA restrictions |
| **CC-BY-NC-ND** | Attribution + non-commercial + no derivatives | Most restrictive CC license |

**For our app:**
- CC0 models: Safe to bundle, redistribute, modify, use commercially
- CC-BY models: Safe with attribution display in the UI
- CC-BY-NC models: Only if our app remains free/non-commercial
- CC-BY-ND models: Cannot modify but can display
- NC models: Risky if the app ever becomes commercial

---

### 5.5 Redistribution Rules Summary

| Source | Can We Bundle? | Can We Cache/Serve? | Can Users Download Via Us? |
|--------|:--------------:|:-------------------:|:-------------------------:|
| OSA CC0 models | Yes | Yes | Yes |
| Sketchfab CC0 | Yes | Yes (with terms) | Via Sketchfab API |
| VRoid Hub models | No (per-model) | No | Via VRoid Hub API (OAuth) |
| Booth.pm models | No | No | User downloads from Booth |
| nizima models | No | No | User downloads from nizima |
| Live2D SDK samples | Dev use only | No | Link to Live2D site |
| Cubism Core runtime | **No** | Auto-download OK? | Link to Live2D CDN |
| VRM files from users | N/A (user's own) | Cache locally | N/A |

---

## 6. Free Model Pack Comprehensive List

### VRM Models

| Source | Count | License | Quality | Download Method |
|--------|-------|---------|---------|----------------|
| **Open Source Avatars (100avatars R1)** | 100 | CC0 | Good | Direct URL (Arweave) |
| **Open Source Avatars (VIPE Heroes)** | 50+ | CC0 | Good | Direct URL (Arweave) |
| **Open Source Avatars (Other)** | 150+ | CC0/varies | Good | Direct URL (Arweave) |
| **MJMoonbow/VRMavatars** | ~50 | CC0 | Moderate | GitHub raw |
| **madjin/vrm-samples** | ~20 | CC0 | Moderate | GitHub raw |
| **madjin/awesome-cc0** | Curated list | CC0 | Varies | Various |
| **M3-org/CharacterStudio outputs** | Unlimited (user-created) | CC0 | Good | Web app |
| **Sketchfab CC0 VRM tag** | ~100-200 | CC0 | Variable | Sketchfab API |
| **Sketchfab CC-BY VRM tag** | ~200-400 | CC-BY | Variable | Sketchfab API |
| **VRoid Hub free downloads** | 1000+ | Varies per model | High | VRoid Hub API (OAuth) |
| **Live3D.io free VTuber models** | 100+ | Varies | Moderate | Direct download |
| **Gumroad free ($0+) VRM** | ~50 | Varies | Variable | Gumroad purchase flow |
| **itch.io free VRM assets** | ~30 | Varies | Variable | itch.io download |

### Live2D Models

| Source | Count | License | Quality | Download Method |
|--------|-------|---------|---------|----------------|
| **Live2D Official Samples** | 6-8 | Dev use | Professional | Live2D website |
| **Cubism SDK Sample Models** | 6-8 | SDK license | Professional | SDK download |
| **ShiraLive2D free models** | ~5 | Varies | Good | Direct download |
| **Booth.pm free Live2D** | ~200 | Varies | Variable | Booth purchase flow |
| **itch.io free Live2D** | ~20 | Varies | Variable | itch.io download |
| **DeviantArt free PSD templates** | ~30 | Varies | Variable | DeviantArt download |
| **nizima free samples** | ~5 | Varies | Professional | nizima download |

### Recommended Starting Catalog for Our App

For the built-in model browser:

1. **Primary CC0 Catalog:** Import all 300+ Open Source Avatars into `cc0_vrm_catalog.json`
2. **Sample Live2D Models:** Bundle 2-3 official Cubism SDK samples for Live2D testing
3. **Tier 2 Browse:** VRoid Hub API (1000+ downloadable) and Sketchfab API (CC0/CC-BY filtered)
4. **Tier 3 Links:** Booth, nizima, Gumroad, itch.io link-outs

---

## 7. Model Quality Assessment Metrics

### 7.1 Polygon Count Guidelines

| Use Case | Recommended Max | Notes |
|----------|----------------|-------|
| Mobile VR (Quest) | 7,500-10,000 tris | VRChat Quest "Good" rating |
| Desktop VR | 32,000-70,000 tris | VRChat PC "Excellent-Good" |
| Desktop Non-VR (Our App) | 50,000-100,000 tris | More headroom since no VR overhead |
| WebGL Browser | 30,000-50,000 tris | Browser GPU limits |
| High-End Desktop | Up to 200,000 tris | Only for powerful GPUs |

**For our app (desktop, Three.js):** Target 50,000 triangles as "recommended max" for smooth performance on M2 Pro. Flag models over 100,000 as "heavy" in the browser.

### 7.2 Texture Quality Metrics

| Metric | Good | Acceptable | Warning |
|--------|------|------------|---------|
| **Total Texture Memory** | < 40 MB | < 75 MB | > 110 MB |
| **Max Single Texture** | 2048x2048 | 4096x4096 | > 4096 |
| **Material Count** | 1-4 | 5-8 | > 16 |
| **Texture Format** | PNG, WebP | JPEG | Uncompressed |

Each material slot corresponds to a draw call. Fewer materials = better rendering performance. VRoid Studio models typically have 2-4 materials. Hand-made models may have more.

### 7.3 Rigging Quality Indicators

| Indicator | Good | Acceptable | Poor |
|-----------|------|------------|------|
| **Bone Count** | < 75 | 75-150 | > 256 |
| **All 15 Required Bones** | Present | Present | Missing any |
| **Finger Bones** | All 30 | Partial | None |
| **Spring Bones** | Present (hair, clothes) | Minimal | None |
| **Spring Bone Colliders** | Configured | Missing | N/A |
| **Weight Painting** | Clean deformations | Minor artifacts | Visible distortion |

### 7.4 Expression Completeness

| Level | Expressions Present | Rating |
|-------|-------------------|--------|
| **Full** | All 5 emotions + 5 lip sync + 3 blink + 4 gaze = 17+ | Excellent |
| **Good** | 5 emotions + 5 lip sync + blink = 11+ | Good |
| **Basic** | neutral + happy + sad + blink + A/I/U/E/O = 9 | Acceptable |
| **Minimal** | neutral + blink = 2 | Poor |
| **None** | 0 expressions | Unusable for our app |

Our app relies on expressions for emotional AI display. Models with fewer than 5 emotion expressions will have degraded emotional responsiveness.

### 7.5 VRChat Performance Rank Reference

VRChat's performance ranking system is the industry standard for avatar quality assessment. Here are the full tables for reference:

**PC Performance Ranks:**

| Metric | Excellent | Good | Medium | Poor |
|--------|-----------|------|--------|------|
| Triangles | 32,000 | 70,000 | 70,000 | 70,000 |
| Bounds Size | 2.5m^3 | 4m^3 | 5x6x5m | 5x6x5m |
| Texture Memory | 40 MB | 75 MB | 110 MB | 150 MB |
| Skinned Meshes | 1 | 2 | 8 | 16 |
| Basic Meshes | 4 | 8 | 16 | 24 |
| Material Slots | 4 | 8 | 16 | 32 |
| Bones | 75 | 150 | 256 | 400 |
| PhysBones Components | 4 | 8 | 16 | 32 |
| PhysBones Transforms | 16 | 64 | 128 | 256 |
| PhysBones Colliders | 4 | 8 | 16 | 32 |
| Animators | 1 | 4 | 16 | 32 |
| Particle Systems | 0 | 4 | 8 | 16 |
| Lights | 0 | 0 | 0 | 1 |

**Mobile/Quest Performance Ranks:**

| Metric | Excellent | Good | Medium | Poor |
|--------|-----------|------|--------|------|
| Triangles | 7,500 | 10,000 | 15,000 | 20,000 |
| Texture Memory | 10 MB | 18 MB | 25 MB | 40 MB |
| Skinned Meshes | 1 | 1 | 2 | 2 |
| Material Slots | 1 | 1 | 2 | 4 |
| Bones | 75 | 90 | 150 | 150 |
| PhysBones Components | 0 | 4 | 6 | 8 |

**For our app:** Aim for VRChat "Good" tier or better as the quality recommendation. Display a performance indicator badge based on these metrics.

### 7.6 Automated Quality Scoring Algorithm

```python
"""Automated VRM quality scoring for the model browser."""

from dataclasses import dataclass

@dataclass
class ModelQualityReport:
    """Quality assessment report for a VRM model."""

    triangle_count: int
    texture_memory_mb: float
    material_count: int
    bone_count: int
    spring_bone_count: int
    expression_count: int
    has_all_required_bones: bool
    has_lip_sync: bool
    has_blink: bool
    overall_score: str  # "excellent", "good", "acceptable", "poor"
    warnings: list[str]

def assess_vrm_quality(
    triangle_count: int,
    texture_memory_mb: float,
    material_count: int,
    bone_count: int,
    spring_bone_count: int,
    expression_names: list[str],
    has_all_required_bones: bool,
) -> ModelQualityReport:
    """
    Assess the quality of a VRM model for use in waifu-rt3d.

    Args:
        triangle_count: Total triangle count of the model
        texture_memory_mb: Total texture memory in megabytes
        material_count: Number of material slots
        bone_count: Total bone count
        spring_bone_count: Number of spring bone groups
        expression_names: List of expression names found in the model
        has_all_required_bones: Whether all 15 required humanoid bones are present

    Returns:
        ModelQualityReport with score and warnings

    Example:
        >>> report = assess_vrm_quality(
        ...     triangle_count=25000,
        ...     texture_memory_mb=30.0,
        ...     material_count=3,
        ...     bone_count=100,
        ...     spring_bone_count=4,
        ...     expression_names=["happy", "angry", "sad", "relaxed", "surprised",
        ...                       "aa", "ih", "ou", "ee", "oh", "blink"],
        ...     has_all_required_bones=True,
        ... )
        >>> report.overall_score
        'excellent'
    """
    warnings = []
    scores = []

    # Triangle score
    if triangle_count <= 32000:
        scores.append(4)
    elif triangle_count <= 70000:
        scores.append(3)
    elif triangle_count <= 100000:
        scores.append(2)
    else:
        scores.append(1)
        warnings.append(f"High polygon count: {triangle_count:,} triangles")

    # Texture memory score
    if texture_memory_mb <= 40:
        scores.append(4)
    elif texture_memory_mb <= 75:
        scores.append(3)
    elif texture_memory_mb <= 110:
        scores.append(2)
    else:
        scores.append(1)
        warnings.append(f"High texture memory: {texture_memory_mb:.0f} MB")

    # Material score
    if material_count <= 4:
        scores.append(4)
    elif material_count <= 8:
        scores.append(3)
    elif material_count <= 16:
        scores.append(2)
    else:
        scores.append(1)
        warnings.append(f"Too many materials: {material_count}")

    # Expression score
    lip_sync_names = {"aa", "ih", "ou", "ee", "oh", "a", "i", "u", "e", "o"}
    emotion_names = {"happy", "angry", "sad", "relaxed", "surprised", "joy", "sorrow", "fun"}
    blink_names = {"blink", "blinkLeft", "blinkRight", "blink_l", "blink_r"}

    expr_set = set(expression_names)
    has_lip_sync = len(expr_set & lip_sync_names) >= 5
    has_emotions = len(expr_set & emotion_names) >= 3
    has_blink = len(expr_set & blink_names) >= 1

    if has_lip_sync and has_emotions and has_blink:
        scores.append(4)
    elif has_emotions and has_blink:
        scores.append(3)
    elif has_blink:
        scores.append(2)
    else:
        scores.append(1)
        warnings.append("Missing expressions for emotional display")

    # Required bones
    if not has_all_required_bones:
        scores.append(1)
        warnings.append("Missing required humanoid bones")
    else:
        scores.append(4)

    # Spring bones
    if spring_bone_count >= 4:
        scores.append(4)
    elif spring_bone_count >= 1:
        scores.append(3)
    else:
        scores.append(2)
        warnings.append("No spring bones (hair/clothes won't move)")

    # Calculate overall
    avg = sum(scores) / len(scores)
    if avg >= 3.5:
        overall = "excellent"
    elif avg >= 2.5:
        overall = "good"
    elif avg >= 1.5:
        overall = "acceptable"
    else:
        overall = "poor"

    return ModelQualityReport(
        triangle_count=triangle_count,
        texture_memory_mb=texture_memory_mb,
        material_count=material_count,
        bone_count=bone_count,
        spring_bone_count=spring_bone_count,
        expression_count=len(expression_names),
        has_all_required_bones=has_all_required_bones,
        has_lip_sync=has_lip_sync,
        has_blink=has_blink,
        overall_score=overall,
        warnings=warnings,
    )
```

---

