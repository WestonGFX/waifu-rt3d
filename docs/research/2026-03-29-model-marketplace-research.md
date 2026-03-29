# Model Marketplace Research: VRM & Live2D Sources, Licensing, and Compatibility

**Date:** 2026-03-29
**Topic:** Where to find VRM and Live2D models for the waifu-rt3d avatar browser
**Why:** The app supports both VRM 3D models (@pixiv/three-vrm) and Live2D models (pixi-live2d-display). Users need to discover, download, and use models. This research covers sources, APIs, format compatibility, licensing, and community resources.

---

## Table of Contents

1. [VRM Model Sources](#1-vrm-model-sources)
2. [Live2D Model Sources](#2-live2d-model-sources)
3. [VRoid Studio (User-Created VRM)](#3-vroid-studio-user-created-vrm)
4. [Live2D Cubism Editor (User-Created Live2D)](#4-live2d-cubism-editor-user-created-live2d)
5. [Format Compatibility Deep Dive](#5-format-compatibility-deep-dive)
6. [Licensing Landscape](#6-licensing-landscape)
7. [Community & Free Model Resources](#7-community--free-model-resources)
8. [Recommendations for the Model Browser](#8-recommendations-for-the-model-browser)

---

## 1. VRM Model Sources

### VRoid Hub (hub.vroid.com)

| Attribute | Details |
|-----------|---------|
| **URL** | https://hub.vroid.com/en |
| **Content** | Thousands of user-uploaded VRM avatars, mostly anime-style |
| **Pricing** | Free to browse; individual models set by creator (free or paid) |
| **Licensing** | Per-model: creator sets download, commercial use, modification, redistribution flags |
| **API** | Yes -- full REST API with OAuth 2.0 (API v11) |
| **API Docs** | https://developer.vroid.com/en/api/ |
| **Dev Registration** | https://hub.vroid.com/en/developer/registration |
| **Auth Flow** | OAuth 2.0 with ClientID/ClientSecret, scopes: `default` (browse/download), `heart` (favorites) |
| **Format** | VRM 0.x and VRM 1.0 |
| **Quality** | High -- VRoid Studio pipeline ensures consistent rigging |

**API Capabilities:**
- Search/browse character models programmatically
- Download VRM files for authorized users
- Get model metadata, thumbnails, creator info
- Requires developer registration (simplified process, immediate access before approval)

**Gotchas:**
- Each model has individual permissions set by creator -- must check `is_downloadable`, `is_commercial_use_ok`, `is_modification_ok`
- OAuth flow required for downloads (not just API key)
- Rate limits apply

### Sketchfab (sketchfab.com)

| Attribute | Details |
|-----------|---------|
| **URL** | https://sketchfab.com/tags/vrm |
| **Content** | 500K+ free models (all types), VRM subset available via tag filtering |
| **Pricing** | Free tier available; premium models exist |
| **Licensing** | CC0, CC-BY, CC-BY-SA, CC-BY-NC, and more -- filterable |
| **API** | Yes -- Data API v3 + Download API |
| **API Docs** | https://sketchfab.com/developers/download-api |
| **Auth** | API token (simpler than OAuth) |
| **Format** | GLB/GLTF primary; some VRM uploads |
| **Quality** | Variable -- ranges from professional to hobbyist |

**API Capabilities:**
- Full search with filters (tags, license, format, category)
- Download API for programmatic model retrieval
- License filtering: can specifically request CC0 or CC-BY models
- Model metadata, thumbnails, polygon counts

**Already Integrated:** The `backend/models/avatar_browser.py` already has Sketchfab search and download support.

**Gotchas:**
- Most Sketchfab models are GLB/GLTF, not VRM -- need conversion or separate VRM pipeline
- Download API has usage guidelines and rate limits
- Some "free" models are CC-BY-NC (non-commercial)

### Booth.pm (booth.pm)

| Attribute | Details |
|-----------|---------|
| **URL** | https://booth.pm/en/browse/3D%20Models |
| **Content** | Largest Japanese creator marketplace; 3,200+ VRM-tagged items |
| **Pricing** | Mix of free and paid (JPY pricing) |
| **Licensing** | Per-creator; no standardized license tags -- must read each listing |
| **API** | No public API for browsing/downloading |
| **Format** | VRM, VRoid, Unity packages, Blender files |
| **Quality** | Generally high -- many professional VTuber riggers sell here |

**Gotchas:**
- No API means no in-app integration -- can only link users to the website
- Licensing is inconsistent; many models are "personal use only"
- Japanese-language-heavy (English translations available but patchy)
- Owned by pixiv Inc. (same as VRoid Hub)

### Gumroad (gumroad.com)

| Attribute | Details |
|-----------|---------|
| **URL** | https://gumroad.com/3d/avatars |
| **Content** | Creator marketplace with VRChat/VRM avatars |
| **Pricing** | Free ($0+) and paid |
| **Licensing** | Per-creator; some CC0, most custom EULA |
| **API** | No public search/browse API for third-party apps |
| **Format** | VRM, FBX, Unity packages |
| **Quality** | Variable |

### itch.io (itch.io)

| Attribute | Details |
|-----------|---------|
| **URL** | https://itch.io (search "VRM avatar" or "Live2D") |
| **Content** | Indie game assets including VTuber models |
| **Pricing** | Many free, some paid |
| **Licensing** | Per-creator; generally more permissive than Booth |
| **API** | Limited API (no public browse for assets) |
| **Format** | VRM, Live2D, PNG sets |
| **Quality** | Variable -- indie/hobbyist focused |

### Open Source Avatars (opensourceavatars.com)

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.opensourceavatars.com/en/gallery |
| **GitHub** | https://github.com/ToxSam/open-source-avatars |
| **Content** | 300+ curated CC0 VRM avatars (100avatars challenge + community) |
| **Pricing** | All free |
| **Licensing** | CC0 (public domain) -- safest possible license |
| **API** | JSON registry on GitHub (projects.json with direct download URLs) |
| **Format** | VRM |
| **Quality** | Consistent -- curated collection |

**Best for bundling/redistribution.** This is the safest source for an app that wants to offer built-in avatars.

**Already Partially Integrated:** The `backend/models/avatar_browser.py` has a CC0 catalog system (`cc0_models.json`).

---

## 2. Live2D Model Sources

### nizima (nizima.com)

| Attribute | Details |
|-----------|---------|
| **URL** | https://nizima.com |
| **Content** | Official Live2D marketplace -- illustrations and rigged Live2D models |
| **Pricing** | Paid models (JPY); some free samples |
| **Licensing** | Per-model; commercial use varies; covered by nizima ToS |
| **API** | No public browse/search API for third-party integration |
| **Plugin API** | WebSocket-based Plugin API for nizima LIVE app (not marketplace browsing) |
| **Format** | .moc3 + .model3.json (Cubism 3/4/5) |
| **Quality** | Professional -- vetted marketplace |

**nizima Model Specification:** A standard format for model metadata (taps, flicks, expression changes) that works across nizima-compatible apps.

**Gotchas:**
- No public API for marketplace browsing -- cannot integrate into app
- Models purchased on nizima are for the buyer's use only
- Commercial use requires checking each model's terms

### Booth.pm (Live2D section)

| Attribute | Details |
|-----------|---------|
| **URL** | https://booth.pm/en/search/free%20live2d |
| **Content** | 1,400+ Live2D items (free + paid) |
| **Pricing** | Mix of free and paid |
| **Licensing** | Per-creator |
| **API** | None |
| **Format** | .moc3 + textures + .model3.json |
| **Quality** | Variable to professional |

### Free Live2D Sample Models (Official)

| Source | Details |
|--------|---------|
| **Live2D Official Samples** | Free sample models distributed on the Cubism website for testing |
| **nizima ACTION!!** | Free Live2D models for video creation |
| **Cubism SDK Samples** | Bundled sample models (Haru, Hiyori, etc.) for development |

### itch.io (Live2D section)

Smaller selection than VRM. Search "Live2D model" -- mostly VTuber-ready models. Some free, quality varies.

---

## 3. VRoid Studio (User-Created VRM)

### Overview

| Attribute | Details |
|-----------|---------|
| **Platform** | Windows, macOS, Steam |
| **Price** | Free |
| **Output** | VRM 0.x and VRM 1.0 |
| **Skill Required** | Low -- character creator UI, no 3D modeling knowledge needed |
| **Style** | Anime/manga exclusively |

### Workflow

1. Open VRoid Studio, start with a base model
2. Customize: face shape, eyes, hair, body proportions, clothing
3. Clothing: choose from presets or paint custom textures
4. Export: File > Export > VRM
   - Choose VRM 0.x or VRM 1.0 format
   - Set metadata: avatar name, creator name (required for VRM 1.0)
   - Adjust polygon reduction, texture quality
   - Set license permissions (commercial use, modification, redistribution)
5. Save .vrm file locally or upload to VRoid Hub

### Limitations

- Anime style only -- no realistic or stylized-cartoon options
- Cannot import external .vrm files for editing (VRoid uses .vroid project format internally)
- Hair and clothing customization has limits without external tools
- Models tend to look "VRoid-ish" without significant post-processing in Blender

### For Our App

VRoid Studio is the recommended path for users who want custom avatars. Our app should:
- Accept any .vrm file dropped/imported
- Link to VRoid Studio download in the model browser
- Support both VRM 0.x and 1.0 exports from VRoid

---

## 4. Live2D Cubism Editor (User-Created Live2D)

### Free vs Pro Comparison

| Feature | FREE | PRO |
|---------|------|-----|
| **Price** | Free (< 10M JPY/yr revenue) | ~$200/year (indie) |
| **Art Parts Limit** | 100 pieces max | Unlimited |
| **Texture Size** | 1024x1024, 1 texture | 4096x4096, multiple |
| **Deformers** | Basic | Advanced (warp, rotation) |
| **Physics** | Basic | Full physics simulation |
| **Blend Shapes** | Limited | Full |
| **Animation Timeline** | Yes | Yes, with more features |
| **Commercial Use** | Yes (under revenue threshold) | Yes |
| **Trial** | 42-day PRO trial available | -- |

### Export Workflow

1. Prepare layered PSD artwork (each movable part = separate layer)
2. Import PSD into Cubism Editor
3. Create mesh, deformers, and parameters for each part
4. Set up physics (hair, clothing movement)
5. Define expressions and motions
6. Export: .moc3 file + textures + .model3.json
7. The exported package can be loaded by pixi-live2d-display

### For Our App

The creation pipeline is significantly harder than VRoid Studio:
- Requires illustration skills (or commissioning art)
- Rigging takes hours even for experienced users
- Free tier is viable for simple models (100 parts is enough for a basic avatar)
- Most users will purchase or commission models rather than create their own

---

## 5. Format Compatibility Deep Dive

### VRM Formats

| Version | Extension | Spec | Status |
|---------|-----------|------|--------|
| VRM 0.x | .vrm | Based on glTF 2.0 + VRM extensions | Legacy but still widely used |
| VRM 1.0 | .vrm | Based on glTF 2.0 + VRMC extensions | Current standard (2022+) |

**Key Differences VRM 0.x vs 1.0:**

| Aspect | VRM 0.x | VRM 1.0 |
|--------|---------|---------|
| **Facing Direction** | Z- (backward) | Z+ (forward) |
| **Initial Pose** | Must be normalized T-Pose | T-Pose required but relaxed |
| **Shader** | MToon | MToon10 (different rendering) |
| **Expression System** | BlendShapeProxy | VRM Expression (more flexible) |
| **Spring Bones** | VRM spring bone | VRMC spring bone (improved) |
| **License Metadata** | Basic fields | Expanded CC-like fields |
| **Coordinate System** | Right = +X | Forward = Z+ |

**@pixiv/three-vrm 3.4.1 Support:**

| Feature | Supported |
|---------|-----------|
| VRM 0.x loading | Yes |
| VRM 1.0 loading | Yes |
| Auto-detection (0.x vs 1.0) | Yes |
| VRM 0.x backward compat shading | Yes (`v0CompatShade`) |
| VRM 0.x rotation fix | Yes (`VRMUtils.rotateVRM0`) |
| Three.js >= 0.137 | Required |
| Spring bones | Both versions |
| MToon / MToon10 | Both |
| Expression / BlendShape | Both |

The library handles both versions transparently. Use `VRMUtils.rotateVRM0` to fix the Z-axis difference when loading 0.x models.

### Live2D Formats

| Format | Extension | Cubism Version | pixi-live2d-display Support |
|--------|-----------|---------------|---------------------------|
| Cubism 2.1 | .moc + .model.json | Cubism 2.x | Yes (with live2d.min.js) |
| Cubism 3 | .moc3 (v3) + .model3.json | Cubism 3.x | Yes (via Cubism 4 runtime) |
| Cubism 4 | .moc3 (v4-5) + .model3.json | Cubism 4.x | Yes (with live2dcubismcore.min.js) |
| Cubism 5.0-5.1 | .moc3 (v5) + .model3.json | Cubism 5.0-5.1 | Likely yes (same moc3 v5) |
| Cubism 5.3 | .moc3 (v6) + .model3.json | Cubism 5.3 | **NO -- moc3 v6 not supported** |

**Critical Compatibility Note:**
Cubism 5.3 (released Jan 2026) introduced moc3 version 6, which is **not backward-compatible** with the Cubism 4 runtime that pixi-live2d-display uses. Models exported from Cubism 5.3 with new features (blend modes, offscreen drawing) will fail with: `"The Core unsupport later than moc3 ver:[5]. This moc3 ver is [6]"`.

**pixi-live2d-display Runtime Requirements:**

| Config | Supports | Required Files |
|--------|----------|---------------|
| Cubism 4 only | Cubism 3 + 4 models | `cubism4.js` + `live2dcubismcore.min.js` |
| All versions | Cubism 2 + 3 + 4 | `index.js` + `live2d.min.js` + `live2dcubismcore.min.js` |

**Recommendation:** Use the "all versions" config. Most free models are Cubism 3/4. Cubism 2 models still exist in the wild. Cubism 5.3 models should be flagged as incompatible in the browser until pixi-live2d-display updates.

---

## 6. Licensing Landscape

### What's Safe to Bundle/Redistribute

| License | Bundle in App | Redistribute | Commercial Use | Attribution Required |
|---------|:------------:|:------------:|:--------------:|:-------------------:|
| CC0 | Yes | Yes | Yes | No |
| CC-BY | Yes | Yes | Yes | Yes |
| CC-BY-SA | Yes (share-alike) | Yes (share-alike) | Yes | Yes |
| CC-BY-NC | No (if app is commercial) | Limited | No | Yes |
| VRM "Personal Use" | No | No | No | N/A |
| VRM "Allow Download" | App-mediated OK | No | Check per-model | N/A |
| Live2D SDK | See below | See below | Revenue threshold | N/A |

### Live2D SDK Licensing (Critical)

Live2D's SDK licensing has revenue-based tiers:

| Tier | Revenue Threshold | License Cost |
|------|-------------------|-------------|
| **General User / Indie** | < 10M JPY (~$67K USD) | Free |
| **Small Enterprise** | < 10M JPY | Free |
| **Mid Enterprise** | 10M-100M JPY | Paid (negotiated) |
| **Large Enterprise** | > 100M JPY | Paid (negotiated) |
| **Expandable Application** | Any (apps with significant expandability) | Special agreement required |

**Key Risk:** If our app qualifies as an "Expandable Application" (an app with significant expandability among services or content utilizing SDK products), Live2D requires pre-release review and a special Publication License Agreement. A desktop AI companion app that loads user-provided Live2D models likely qualifies.

**How VTuber Apps Handle This:**
- **VSeeFace:** Free, non-commercial -- avoids SDK licensing entirely
- **VTube Studio:** Commercial app -- has Publication License Agreement with Live2D Inc.
- **nizima LIVE:** Made by Live2D themselves
- **Most open-source projects:** Rely on users providing their own Cubism Core runtime file, sidestepping redistribution issues

**Recommended Approach for Our App:**
1. Do NOT bundle `live2dcubismcore.min.js` in the app distribution
2. On first Live2D model load, prompt user to download the Cubism Core from Live2D's official site
3. Or auto-download it at runtime (check Live2D's ToS for this approach)
4. This way, the user obtains the runtime themselves, similar to how VTube Studio handles it

### VRM License Metadata

VRM files embed license info directly in the file metadata:

```
{
  "licenseName": "CC0-1.0",
  "allowedUserName": "Everyone",
  "violentUsage": "Allow",
  "sexualUsage": "Allow",
  "commercialUsage": "Allow",
  "otherPermissionUrl": "https://...",
  "modification": "Allow",
  "redistribution": "Allow"
}
```

Our app should:
- Read and display this metadata in the model browser
- Warn users if a model restricts commercial use or redistribution
- Filter by license in search results

---

## 7. Community & Free Model Resources

### Discord Servers

| Server | Members | Focus |
|--------|---------|-------|
| **Live2D Community** | 41,000+ | Live2D rigging, resources, commissions |
| **VRoid** | Large | VRoid Studio help, model sharing |
| **VTuber communities** | Various | Model sharing, rigging tips |

### Subreddits

| Subreddit | Focus |
|-----------|-------|
| r/VirtualYoutubers | VTuber community, model showcases |
| r/Live2D | Live2D rigging and resources |
| r/VRoid | VRoid Studio models and tips |
| r/VRChat | VRM avatar sharing (VRChat-focused but applicable) |

### Key GitHub Repositories

| Repository | Description |
|-----------|-------------|
| [ToxSam/open-source-avatars](https://github.com/ToxSam/open-source-avatars) | 300+ CC0 VRM avatars, JSON registry |
| [ToxSam/osa-gallery](https://github.com/ToxSam/osa-gallery) | Web gallery for the above |
| [MJMoonbow/VRMavatars](https://github.com/MJMoonbow/VRMavatars) | Collection of CC0 VRM models |
| [madjin/vrm-samples](https://github.com/madjin/vrm-samples) | VRoid sample models |
| [madjin/awesome-cc0](https://github.com/madjin/awesome-cc0) | Curated CC0 asset list (includes VRM) |
| [M3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio) | Web-based VRM avatar creator |

### Quality Expectations

- **CC0 collections:** Decent quality, anime-style, VRoid-generated. Good enough for defaults.
- **Booth.pm paid models:** Professional quality, custom-rigged, unique designs. Best quality available.
- **VRoid Hub user models:** Highly variable. Some excellent, some basic templates.
- **Sketchfab:** Mixed. Many GLB models not optimized for real-time avatar use.
- **Live2D nizima:** Professional quality, expensive ($50-$500+).

---

## 8. Recommendations for the Model Browser

### Architecture: Tiered Source Integration

```
Tier 1: Built-in (no auth, instant)
  - CC0 catalog from open-source-avatars (already partially done)
  - Bundled sample Live2D models (Cubism SDK samples)

Tier 2: API-integrated (auth required, searchable)
  - VRoid Hub API (OAuth 2.0) -- best VRM source with real API
  - Sketchfab API (token auth) -- already integrated

Tier 3: Link-out (no API, open in browser)
  - Booth.pm (VRM + Live2D)
  - Gumroad
  - itch.io
  - nizima (Live2D)

Tier 4: User-created (local import)
  - VRoid Studio export (VRM)
  - Cubism Editor export (Live2D)
  - Any .vrm or .moc3 file drag-and-drop
```

### Specific Implementation Recommendations

#### 1. Expand CC0 Catalog
- Integrate the Open Source Avatars registry (300+ models, JSON-based, direct download URLs)
- Add to existing `cc0_models.json` or create a parallel `cc0_vrm_catalog.json`
- These are safe to bundle, no attribution needed

#### 2. VRoid Hub Integration (Phase 2)
- Register as developer at https://hub.vroid.com/en/developer/registration
- Implement OAuth 2.0 flow (popup in Electron, redirect in browser)
- Search API: browse by tag, popularity, downloadable-only filter
- Read license metadata before download
- This is the highest-value integration -- thousands of quality VRM models

#### 3. Live2D Model Import
- Support drag-and-drop of .moc3 + .model3.json + textures (as folder or zip)
- Auto-detect Cubism version from moc3 header
- Warn if moc3 v6 (Cubism 5.3) -- unsupported until pixi-live2d-display updates
- Link to nizima and Booth.pm for purchasing models

#### 4. License Display in Browser
- For VRM: read embedded license metadata, show badges (CC0, CC-BY, Personal Use, etc.)
- For Live2D: no embedded license standard -- require user to confirm they have rights
- Filter by "safe to use commercially" vs "personal use only"

#### 5. Cubism Core Runtime Strategy
- Do NOT bundle live2dcubismcore.min.js in the app
- On first Live2D load, check if runtime exists locally
- If not, prompt user to download from Live2D official site or auto-fetch
- Cache locally after first download
- This avoids SDK licensing issues for the app itself

#### 6. Format Compatibility Checklist

Before displaying a model in the browser, validate:

| Check | VRM | Live2D |
|-------|-----|--------|
| File exists and parses | .vrm loads via three-vrm | .model3.json is valid JSON |
| Version supported | VRM 0.x or 1.0 (both OK) | moc3 v3-v5 (not v6) |
| Textures present | Embedded in .vrm | Referenced files exist |
| Rigging valid | Humanoid bones present | Parameters defined |
| License readable | VRM metadata present | N/A (manual) |

### Priority Order for Implementation

1. **Expand CC0 VRM catalog** -- low effort, high value, already have the architecture
2. **Local file import** (drag-and-drop .vrm and Live2D folders) -- essential for Booth/nizima purchases
3. **VRoid Hub API** -- medium effort, highest browsing value
4. **License badge display** -- important for user trust
5. **Cubism Core auto-download** -- needed before Live2D models work at all
6. **Link-out pages** for Booth, nizima, Gumroad -- low effort, good discoverability

---

## Sources

- [VRoid Hub](https://hub.vroid.com/en)
- [VRoid Hub API Documentation](https://developer.vroid.com/en/api/)
- [VRoid Hub Developer Registration](https://hub.vroid.com/en/developer/registration)
- [Sketchfab VRM Models](https://sketchfab.com/tags/vrm)
- [Sketchfab Download API](https://sketchfab.com/developers/download-api)
- [Sketchfab CC0 Models](https://sketchfab.com/tags/cc0)
- [Booth.pm 3D Models](https://booth.pm/en/browse/3D%20Models)
- [Booth.pm Free Live2D](https://booth.pm/en/search/free%20live2d)
- [nizima Marketplace](https://docs.nizima.com/en/guide/introduction/)
- [nizima LIVE Plugin API](https://github.com/Live2D/nizimaLIVEPluginAPI)
- [Open Source Avatars (300+ CC0)](https://www.opensourceavatars.com/en/gallery)
- [Open Source Avatars GitHub](https://github.com/ToxSam/open-source-avatars)
- [awesome-cc0 GitHub](https://github.com/madjin/awesome-cc0)
- [pixi-live2d-display GitHub](https://github.com/guansss/pixi-live2d-display)
- [pixi-live2d-display Complete Guide](https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide)
- [@pixiv/three-vrm GitHub](https://github.com/pixiv/three-vrm)
- [@pixiv/three-vrm Migration Guide](https://pixiv.github.io/three-vrm/docs/documents/migration-guide-1.0.html)
- [VRM Features and Specification](https://vrm.dev/en/vrm/vrm_features/)
- [VRM Consortium](https://vrm-consortium.org/en/)
- [VRoid Hub License Conditions](https://vroid.pixiv.help/hc/en-us/articles/360016417013-About-VRoid-Hub-s-conditions-of-use-and-VRM-license)
- [Live2D SDK License](https://www.live2d.com/en/sdk/license/)
- [Live2D Free vs Pro Comparison](https://www.live2d.com/en/cubism/comparison/)
- [Live2D Cubism 5.3 SDK Compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5-3/)
- [Live2D Cubism 5 SDK Compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5/)
- [VRoid Studio](https://vroid.com/en/studio)
- [VRoid Studio VRM Export FAQ](https://vroid.pixiv.help/hc/en-us/articles/38726063278233-How-do-I-export-a-model-as-VRM)
- [Gumroad 3D Avatars](https://gumroad.com/3d/avatars)
- [M3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio)
- [Live2D Community Discord](https://discord.com/invite/live2d)
- [Live2D Communities](https://www.live2d.com/en/community/)
