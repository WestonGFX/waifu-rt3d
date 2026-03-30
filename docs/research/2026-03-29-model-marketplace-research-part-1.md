# Model Marketplace Research: VRM & Live2D Sources, Licensing, and Compatibility

> **This is Part 1 of 4.** See also: [Part 2](2026-03-29-model-marketplace-research-part-2.md), [Part 3](2026-03-29-model-marketplace-research-part-3.md), [Part 4](2026-03-29-model-marketplace-research-part-4.md)


**Date:** 2026-03-29
**Topic:** Where to find VRM and Live2D models for the waifu-rt3d avatar browser
**Why:** The app supports both VRM 3D models (@pixiv/three-vrm 3.4.1) and Live2D models (pixi-live2d-display). Users need to discover, download, and use models. This research covers sources, APIs, format compatibility, licensing, community resources, conversion pipelines, quality assessment, and UX patterns.
**Word Count Target:** 20,000+

---

## Table of Contents

1. [VRM Model Sources](#1-vrm-model-sources)
   - 1.1 [VRoid Hub API Deep Dive](#11-vroid-hub-api-deep-dive)
   - 1.2 [Open Source Avatars Registry](#12-open-source-avatars-registry)
   - 1.3 [Sketchfab API Deep Dive](#13-sketchfab-api-deep-dive)
   - 1.4 [Booth.pm Scraping Approaches](#14-boothpm-scraping-approaches)
   - 1.5 [Gumroad](#15-gumroad)
   - 1.6 [itch.io](#16-itchio)
   - 1.7 [DeviantArt](#17-deviantart)
2. [Live2D Model Sources](#2-live2d-model-sources)
   - 2.1 [nizima Marketplace Deep Dive](#21-nizima-marketplace-deep-dive)
   - 2.2 [Booth.pm Live2D Section](#22-boothpm-live2d-section)
   - 2.3 [Free Live2D Sample Models](#23-free-live2d-sample-models)
   - 2.4 [itch.io Live2D](#24-itchio-live2d)
3. [VRM Format Internals](#3-vrm-format-internals)
   - 3.1 [VRM 0.x Extension Schema](#31-vrm-0x-extension-schema)
   - 3.2 [VRM 1.0 VRMC Extension Schema](#32-vrm-10-vrmc-extension-schema)
   - 3.3 [Humanoid Bone Mapping (Complete)](#33-humanoid-bone-mapping-complete)
   - 3.4 [Blend Shapes and Expressions](#34-blend-shapes-and-expressions)
   - 3.5 [Spring Bones](#35-spring-bones)
   - 3.6 [License Metadata JSON Paths](#36-license-metadata-json-paths)
   - 3.7 [MToon Shader System](#37-mtoon-shader-system)
   - 3.8 [@pixiv/three-vrm 3.4.1 Compatibility](#38-pixivthree-vrm-341-compatibility)
4. [Live2D Format Details](#4-live2d-format-details)
   - 4.1 [Cubism 2 vs 3 vs 4 vs 5 Differences](#41-cubism-2-vs-3-vs-4-vs-5-differences)
   - 4.2 [.moc3 Binary Format](#42-moc3-binary-format)
   - 4.3 [model3.json Complete Schema](#43-model3json-complete-schema)
   - 4.4 [Expression Files (.exp3.json)](#44-expression-files-exp3json)
   - 4.5 [Motion Files (.motion3.json)](#45-motion-files-motion3json)
   - 4.6 [Physics Files (.physics3.json)](#46-physics-files-physics3json)
   - 4.7 [Pose Files (.pose3.json)](#47-pose-files-pose3json)
   - 4.8 [pixi-live2d-display Runtime Requirements](#48-pixi-live2d-display-runtime-requirements)
5. [Licensing Deep Dive](#5-licensing-deep-dive)
   - 5.1 [Live2D SDK Licensing Tiers](#51-live2d-sdk-licensing-tiers)
   - 5.2 [Expandable Application Classification](#52-expandable-application-classification)
   - 5.3 [VRM License Types and Metadata](#53-vrm-license-types-and-metadata)
   - 5.4 [Creative Commons for 3D Models](#54-creative-commons-for-3d-models)
   - 5.5 [Redistribution Rules Summary](#55-redistribution-rules-summary)
6. [Free Model Pack Comprehensive List](#6-free-model-pack-comprehensive-list)
7. [Model Quality Assessment Metrics](#7-model-quality-assessment-metrics)
   - 7.1 [Polygon Count Guidelines](#71-polygon-count-guidelines)
   - 7.2 [Texture Quality Metrics](#72-texture-quality-metrics)
   - 7.3 [Rigging Quality Indicators](#73-rigging-quality-indicators)
   - 7.4 [Expression Completeness](#74-expression-completeness)
   - 7.5 [VRChat Performance Rank Reference](#75-vrchat-performance-rank-reference)
   - 7.6 [Automated Quality Scoring Algorithm](#76-automated-quality-scoring-algorithm)
8. [Conversion Pipelines](#8-conversion-pipelines)
   - 8.1 [PMX to VRM](#81-pmx-to-vrm)
   - 8.2 [FBX to VRM](#82-fbx-to-vrm)
   - 8.3 [GLB/glTF to VRM](#83-glbgltf-to-vrm)
   - 8.4 [Blender VRM Addon](#84-blender-vrm-addon)
   - 8.5 [VRM Version Migration (0.x to 1.0)](#85-vrm-version-migration-0x-to-10)
9. [VRoid Studio Deep Dive](#9-vroid-studio-deep-dive)
   - 9.1 [Feature Overview](#91-feature-overview)
   - 9.2 [Export Pipeline Details](#92-export-pipeline-details)
   - 9.3 [Polygon Reduction System](#93-polygon-reduction-system)
   - 9.4 [Limitations and Workarounds](#94-limitations-and-workarounds)
   - 9.5 [Integration with Our App](#95-integration-with-our-app)
10. [Live2D Cubism Editor Deep Dive](#10-live2d-cubism-editor-deep-dive)
    - 10.1 [Free vs Pro Feature Matrix](#101-free-vs-pro-feature-matrix)
    - 10.2 [Complete Workflow](#102-complete-workflow)
    - 10.3 [PSD Layer Requirements](#103-psd-layer-requirements)
    - 10.4 [Mesh and Deformer System](#104-mesh-and-deformer-system)
    - 10.5 [Physics Simulation](#105-physics-simulation)
    - 10.6 [Export Pipeline](#106-export-pipeline)
11. [Community Ecosystems](#11-community-ecosystems)
    - 11.1 [Discord Servers](#111-discord-servers)
    - 11.2 [Subreddits](#112-subreddits)
    - 11.3 [GitHub Repositories](#113-github-repositories)
    - 11.4 [Creator Communities](#114-creator-communities)
    - 11.5 [VTuber Model Commissioning Ecosystem](#115-vtuber-model-commissioning-ecosystem)
12. [Caching and CDN Strategies](#12-caching-and-cdn-strategies)
    - 12.1 [Local Caching Architecture](#121-local-caching-architecture)
    - 12.2 [Progressive Loading](#122-progressive-loading)
    - 12.3 [Compression Strategies](#123-compression-strategies)
    - 12.4 [Thumbnail Pipeline](#124-thumbnail-pipeline)
13. [Search UX Patterns](#13-search-ux-patterns)
    - 13.1 [VRChat Avatar Search](#131-vrchat-avatar-search)
    - 13.2 [VSeeFace Model Selection](#132-vseeface-model-selection)
    - 13.3 [Warudo Model Browser](#133-warudo-model-browser)
    - 13.4 [VRCDB Search Interface](#134-vrcdb-search-interface)
    - 13.5 [Best Practices for Our App](#135-best-practices-for-our-app)
14. [Model Preview Rendering](#14-model-preview-rendering)
    - 14.1 [Thumbnail Generation](#141-thumbnail-generation)
    - 14.2 [Live 3D Preview](#142-live-3d-preview)
    - 14.3 [Live2D Preview Rendering](#143-live2d-preview-rendering)
    - 14.4 [Lazy Loading Strategy](#144-lazy-loading-strategy)
15. [Recommendations for the Model Browser](#15-recommendations-for-the-model-browser)

---

## 1. VRM Model Sources

### 1.1 VRoid Hub API Deep Dive

| Attribute | Details |
|-----------|---------|
| **URL** | https://hub.vroid.com/en |
| **Content** | Thousands of user-uploaded VRM avatars, mostly anime-style |
| **Pricing** | Free to browse; individual models set by creator (free or paid) |
| **Licensing** | Per-model: creator sets download, commercial use, modification, redistribution flags |
| **API** | Yes -- full REST API with OAuth 2.0 (API v11) |
| **API Docs** | https://developer.vroid.com/en/api/ |
| **Dev Registration** | https://hub.vroid.com/en/developer/registration |
| **Format** | VRM 0.x and VRM 1.0 |
| **Quality** | High -- VRoid Studio pipeline ensures consistent rigging |

#### OAuth 2.0 Flow

The VRoid Hub API uses OAuth 2.0 with the Authorization Code grant type. The complete authentication flow is as follows:

**Step 1: Developer Registration**

Register at https://hub.vroid.com/en/developer/registration to obtain:
- `client_id` -- Application identifier
- `client_secret` -- Application secret (keep server-side only)

You can begin using the API immediately after registration, even before official approval. Set a valid redirect URI during registration.

**Step 2: Authorization Request**

Redirect the user to:
```
GET https://hub.vroid.com/oauth/authorize
  ?response_type=code
  &client_id={YOUR_CLIENT_ID}
  &redirect_uri={YOUR_REDIRECT_URI}
  &scope=default
```

Available scopes:
- `default` -- Browse models, download VRM files, read metadata
- `heart` -- Add/remove favorites (hearts)

**Step 3: Token Exchange**

After the user authorizes, VRoid Hub redirects to your `redirect_uri` with an authorization `code`. Exchange it:

```http
POST https://hub.vroid.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={AUTH_CODE}
&redirect_uri={YOUR_REDIRECT_URI}
&client_id={YOUR_CLIENT_ID}
&client_secret={YOUR_CLIENT_SECRET}
```

Response:
```json
{
  "access_token": "abc123...",
  "token_type": "Bearer",
  "expires_in": 7200,
  "refresh_token": "def456...",
  "scope": "default",
  "created_at": 1680000000
}
```

**Step 4: Authenticated Requests**

All API calls require two headers:
```http
Authorization: Bearer {access_token}
X-Api-Version: 11
```

The `X-Api-Version: 11` header is mandatory and proprietary to VRoid Hub.

#### API Endpoints

**Account:**
```
GET /api/account
  -> { user: { id, pixiv_user_id, name, icon_url } }
```

**Browse Character Models:**
```
GET /api/character_models
  ?count={int}          # Items per page (max 100)
  &offset={int}         # Pagination offset
  &max_id={string}      # Cursor-based pagination
  &character_model_type=vrm  # Filter by type
  &order=popular        # Sort: popular, newest
```

Response schema (per model):
```json
{
  "id": "1234567890",
  "type": "vrm",
  "name": "My Avatar",
  "description": "...",
  "thumbnail": {
    "url": "https://...",
    "width": 400,
    "height": 400
  },
  "full_body_thumbnail": {
    "url": "https://...",
    "width": 800,
    "height": 1200
  },
  "user": {
    "id": "...",
    "name": "CreatorName",
    "icon_url": "https://..."
  },
  "heart_count": 42,
  "is_downloadable": true,
  "is_commercial_use_ok": false,
  "is_modification_ok": true,
  "is_redistribution_ok": false,
  "is_credit_required": true,
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-03-01T14:20:00Z"
}
```

**Get Single Model:**
```
GET /api/character_models/{model_id}
  -> Full model details including download URL (if authorized)
```

**Load/Download a Character Model:**
```
POST /api/character_models/{model_id}/download_authorization
  -> { download_url: "https://..." }
```

The download URL is temporary and expires. The download endpoint returns the raw .vrm binary file.

**Search:**
```
GET /api/character_models
  ?keyword={search_term}
  &tags[]={tag_name}
  &is_downloadable=true
```

**Hearts (Favorites):**
```
POST /api/character_models/{model_id}/hearts   # Add heart
DELETE /api/character_models/{model_id}/hearts  # Remove heart
```

#### Rate Limits

VRoid Hub enforces rate limits but does not publicly document exact thresholds. Based on community reports:
- ~60 requests/minute for browsing endpoints
- ~10 requests/minute for download endpoints
- Rate-limited responses return HTTP 429

#### Code Example: Complete OAuth + Search Flow

```python
"""VRoid Hub API integration example for waifu-rt3d."""

import httpx
from urllib.parse import urlencode

VROID_CLIENT_ID = "your_client_id"
VROID_CLIENT_SECRET = "your_client_secret"
VROID_REDIRECT_URI = "http://localhost:8080/oauth/vroid/callback"
API_BASE = "https://hub.vroid.com"
API_VERSION = "11"

def get_auth_url() -> str:
    """Generate the VRoid Hub OAuth authorization URL."""
    params = {
        "response_type": "code",
        "client_id": VROID_CLIENT_ID,
        "redirect_uri": VROID_REDIRECT_URI,
        "scope": "default",
    }
    return f"{API_BASE}/oauth/authorize?{urlencode(params)}"

async def exchange_code(code: str) -> dict:
    """Exchange authorization code for access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{API_BASE}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": VROID_REDIRECT_URI,
                "client_id": VROID_CLIENT_ID,
                "client_secret": VROID_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        return resp.json()

async def search_models(
    access_token: str,
    keyword: str = "",
    downloadable_only: bool = True,
    count: int = 20,
    offset: int = 0,
) -> list[dict]:
    """
    Search VRoid Hub for character models.

    Args:
        access_token: OAuth bearer token
        keyword: Search term
        downloadable_only: Only return downloadable models
        count: Results per page (max 100)
        offset: Pagination offset

    Returns:
        List of character model dicts with id, name, thumbnails, permissions
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "X-Api-Version": API_VERSION,
    }
    params = {
        "count": count,
        "offset": offset,
        "character_model_type": "vrm",
    }
    if keyword:
        params["keyword"] = keyword
    if downloadable_only:
        params["is_downloadable"] = "true"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API_BASE}/api/character_models",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

async def download_model(access_token: str, model_id: str) -> bytes:
    """
    Download a VRM file from VRoid Hub.

    Args:
        access_token: OAuth bearer token
        model_id: The character model ID

    Returns:
        Raw VRM file bytes

    Raises:
        httpx.HTTPStatusError: If download authorization fails
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "X-Api-Version": API_VERSION,
    }
    async with httpx.AsyncClient() as client:
        # Step 1: Get download authorization
        auth_resp = await client.post(
            f"{API_BASE}/api/character_models/{model_id}/download_authorization",
            headers=headers,
        )
        auth_resp.raise_for_status()
        download_url = auth_resp.json()["download_url"]

        # Step 2: Download the VRM file
        vrm_resp = await client.get(download_url)
        vrm_resp.raise_for_status()
        return vrm_resp.content
```

#### Electron Integration Considerations

For our Electron desktop app, the OAuth flow should use:
1. Open a BrowserWindow to the authorization URL
2. Listen for the redirect URI navigation event
3. Extract the `code` parameter from the redirect URL
4. Exchange code for token via the backend
5. Store the refresh token securely in the system keychain (via `safeStorage` or `keytar`)
6. Auto-refresh tokens before expiry

#### Gotchas and Limitations

- Each model has individual permissions set by the creator -- always check `is_downloadable`, `is_commercial_use_ok`, `is_modification_ok`, `is_redistribution_ok`
- OAuth flow is required for downloads (not just an API key)
- VRoid Hub's license metadata is separate from the VRM file's embedded license -- display both
- Models uploaded before VRM 1.0 may use VRM 0.x format
- Some creators disable downloading entirely; respect this
- Japanese-language content is dominant; keyword search works best in Japanese for many models
- The API does not support webhooks or real-time updates

---

### 1.2 Open Source Avatars Registry

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

#### Registry Schema

The registry uses a two-tier JSON structure hosted on GitHub:

**Tier 1: projects.json (Master Index)**

Located at: `data/projects.json`

```json
[
  {
    "name": "100avatars-r1",
    "avatar_data_file": "100avatars-r1.json",
    "license": "CC0",
    "description": "Round 1 of the 100 Avatars project",
    "creator": "Various artists",
    "count": 100,
    "tags": ["anime", "humanoid", "VRM"]
  },
  {
    "name": "vipe-heroes-genesis",
    "avatar_data_file": "vipe-heroes-genesis.json",
    "license": "CC0",
    "description": "VIPE Heroes Genesis collection",
    "creator": "VIPE",
    "count": 50,
    "tags": ["heroes", "humanoid"]
  },
  {
    "name": "toxsam",
    "avatar_data_file": "toxsam.json",
    "license": "CC0",
    "description": "ToxSam's personal collection",
    "creator": "ToxSam",
    "count": 15,
    "tags": ["anime", "original"]
  }
]
```

**Tier 2: Collection Files (avatars/*.json)**

Each collection file in `data/` contains an array of avatar objects:

```json
[
  {
    "name": "Avatar Name",
    "model_file_url": "https://arweave.net/abc123/model.vrm",
    "thumbnail_url": "https://arweave.net/abc123/thumbnail.png",
    "description": "A description of the avatar",
    "traits": {
      "hair_color": "blue",
      "style": "anime",
      "gender": "female"
    },
    "license": "CC0",
    "format": "VRM",
    "file_size_bytes": 5242880,
    "poly_count": 15000,
    "creator": "ArtistName"
  }
]
```

#### Integration Code

```javascript
/**
 * Fetches the complete Open Source Avatars catalog.
 *
 * @returns {Promise<Array>} Flat array of all avatar objects with collection metadata
 */
async function fetchOSACatalog() {
  const BASE = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data';

  // Fetch master index
  const projects = await fetch(`${BASE}/projects.json`).then(r => r.json());

  // Fetch all collections in parallel
  const collections = await Promise.all(
    projects.map(async (project) => {
      const avatars = await fetch(`${BASE}/${project.avatar_data_file}`).then(r => r.json());
      return avatars.map(avatar => ({
        ...avatar,
        collection: project.name,
        collection_license: project.license,
      }));
    })
  );

  return collections.flat();
}
```

#### Storage Notes

- Model files are hosted on Arweave (permanent, decentralized storage) -- URLs never expire
- Thumbnails are also on Arweave
- GitHub raw content URLs work for the JSON registry itself
- Total catalog is ~300 avatars, small enough to cache entirely client-side
- The registry itself (metadata, docs, integration code) is CC0; per-avatar licenses are specified per collection but nearly all are CC0

**Best for bundling/redistribution.** This is the safest source for an app that wants to offer built-in avatars. Already partially integrated in `backend/models/avatar_browser.py` via `cc0_models.json`.

#### Related Project: Open Source 3D Assets

ToxSam also maintains https://github.com/toxsam/open-source-3D-assets with 991+ CC0 GLB models (environments, props, furniture) using the same projects.json pattern. These could be used for scene backgrounds or props in the 3D viewer.

---

### 1.3 Sketchfab API Deep Dive

| Attribute | Details |
|-----------|---------|
| **URL** | https://sketchfab.com/tags/vrm |
| **Content** | 500K+ free models (all types), VRM subset available via tag filtering |
| **Pricing** | Free tier available; premium models exist |
| **Licensing** | CC0, CC-BY, CC-BY-SA, CC-BY-NC, and more -- filterable |
| **API** | Yes -- Data API v3 + Download API |
| **API Docs** | https://docs.sketchfab.com/data-api/v3/index.html |
| **Swagger** | https://docs.sketchfab.com/data-api/v3/swagger.json |
| **Auth** | API token (simpler than OAuth) or OAuth2 |
| **Format** | GLB/GLTF primary; some VRM uploads |
| **Quality** | Variable -- ranges from professional to hobbyist |

#### Authentication

**API Token (Recommended for Server-Side):**

Obtain from https://sketchfab.com/settings/password

```http
Authorization: Token {YOUR_API_TOKEN}
```

**OAuth2 (For User-Facing):**

```
GET https://sketchfab.com/oauth2/authorize/
  ?response_type=code
  &client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}

POST https://sketchfab.com/oauth2/token/
  grant_type=authorization_code
  &code={CODE}
  &client_id={CLIENT_ID}
  &client_secret={CLIENT_SECRET}
  &redirect_uri={REDIRECT_URI}
```

#### Key Endpoints

**Search Models:**
```
GET https://api.sketchfab.com/v3/search
  ?type=models
  &q={keyword}
  &tags={tag}                    # e.g., "vrm", "anime", "avatar"
  &categories={category}         # e.g., "characters-creatures"
  &license={license}            # cc0, by, by-sa, by-nd, by-nc, by-nc-sa, by-nc-nd
  &face_count={min}-{max}       # Triangle count range
  &downloadable=true            # Only downloadable models
  &animated=true|false          # Filter by animation
  &sort_by={field}              # -likeCount, -viewCount, -createdAt, relevance
  &count={int}                  # Per page (1-24, default 24)
  &cursor={string}              # Pagination cursor
```

Response:
```json
{
  "results": [
    {
      "uid": "abc123def456",
      "name": "Anime Girl VRM",
      "description": "...",
      "tags": [{"name": "vrm"}, {"name": "anime"}],
      "categories": [{"name": "Characters & Creatures"}],
      "license": {"slug": "cc0", "label": "CC0 1.0", "url": "..."},
      "user": {"username": "creator", "displayName": "Creator Name"},
      "viewCount": 1500,
      "likeCount": 42,
      "faceCount": 15000,
      "vertexCount": 8500,
      "isDownloadable": true,
      "thumbnails": {
        "images": [
          {"url": "https://...", "width": 200, "height": 200},
          {"url": "https://...", "width": 720, "height": 405}
        ]
      },
      "createdAt": "2025-06-15T10:30:00Z",
      "publishedAt": "2025-06-15T10:35:00Z",
      "archives": {
        "gltf": {"size": 5242880, "faceCount": 15000, "textureCount": 3}
      }
    }
  ],
  "cursors": {
    "next": "...",
    "previous": null
  },
  "next": "https://api.sketchfab.com/v3/search?cursor=..."
}
```

**Get Model Details:**
```
GET https://api.sketchfab.com/v3/models/{uid}
```

**Download Model:**
```
GET https://api.sketchfab.com/v3/models/{uid}/download
Authorization: Token {API_TOKEN}

Response:
{
  "gltf": {
    "url": "https://...",
    "size": 5242880,
    "expires": 300
  }
}
```

The download URL is temporary (expires in ~5 minutes). The downloaded archive contains a .gltf or .glb file plus textures in a zip archive. Note: most Sketchfab models download as glTF/GLB, NOT VRM, even if uploaded as VRM.

**Upload Model:**
```
POST https://api.sketchfab.com/v3/models
Content-Type: multipart/form-data

modelFile: <binary>
name: "Model Name"
description: "..."
tags: ["vrm", "anime"]
license: "cc0"
isPublished: true
isDownloadable: true
```

**Collections:**
```
GET https://api.sketchfab.com/v3/me/collections
POST https://api.sketchfab.com/v3/collections
PUT https://api.sketchfab.com/v3/collections/{uid}/models/{model_uid}
```

#### Rate Limits

- Anonymous: 1 request/second
- Authenticated: 5 requests/second (general), 1 request/second (downloads)
- HTTP 429 returned when exceeded, with `Retry-After` header
- Daily download limits exist (undocumented exact numbers)

#### Pagination

Sketchfab uses cursor-based pagination:
- `cursors.next` in response provides the cursor for the next page
- Pass `cursor` query parameter
- Maximum 24 results per page
- No way to jump to arbitrary pages

#### VRM Availability on Sketchfab

Most Sketchfab models are GLB/GLTF format. To find VRM specifically:
- Search with tag `vrm` -- returns ~500-1000 models
- Most are uploaded as .vrm files but Sketchfab converts them to glTF internally
- Original .vrm files may be available via the "original format" download option (if the uploader enabled it)
- Many "anime avatar" models on Sketchfab are not VRM but can potentially be converted

**Already Integrated:** `backend/models/avatar_browser.py` already has Sketchfab search and download support.

---

### 1.4 Booth.pm Scraping Approaches

| Attribute | Details |
|-----------|---------|
| **URL** | https://booth.pm/en/browse/3D%20Models |
| **Content** | Largest Japanese creator marketplace; 3,200+ VRM-tagged items, 14,000+ Live2D items |
| **Pricing** | Mix of free and paid (JPY pricing) |
| **Licensing** | Per-creator; no standardized license tags -- must read each listing |
| **API** | No public API for browsing/downloading |
| **Format** | VRM, VRoid, Unity packages, Blender files |
| **Quality** | Generally high -- many professional VTuber riggers sell here |
| **Owner** | pixiv Inc. (same as VRoid Hub) |

#### Why No API Exists

Booth.pm is a creator marketplace, not a developer platform. pixiv Inc. does not expose a public API because:
- Creators set their own terms; programmatic access could bypass ToS display
- Payment processing is tightly coupled to the web UI
- Anti-scraping measures are in place (Cloudflare, rate limits, JS rendering)

#### Scraping Approaches (For Reference Only)

**Approach 1: Search URL Parsing**

Booth search URLs follow a predictable pattern:
```
https://booth.pm/en/search/vrm?tags[]=VRM&tags[]=avatar
https://booth.pm/en/search/live2d%20model
https://booth.pm/en/items/{item_id}
```

Search results pages contain structured data (price, title, creator, thumbnail) that can be parsed from HTML. However, this violates Booth's ToS and is not recommended.

**Approach 2: BOOTHPLORER (Third-Party Catalog)**

BOOTHPLORER (https://boothplorer.com/) is a third-party catalog that indexes Booth.pm items, primarily for VRChat. It provides:
- Searchable index of Booth items with metadata
- Direct links back to original Booth listings
- Category filtering (avatars, accessories, props)
- All listings link to the original shop for purchase

This is the most viable "integration" -- link users to BOOTHPLORER for discovery, then to Booth.pm for purchase.

**Approach 3: Link-Out Only (Recommended)**

The safest approach for our app:
1. Provide a "Browse Booth.pm" button that opens specific search URLs in the default browser
2. Pre-configured search URLs for VRM avatars, Live2D models, etc.
3. After purchase, user imports the downloaded files via drag-and-drop into our app
4. No scraping, no ToS violations

#### Booth.pm Item Structure

Individual item pages contain:
- Title and description (HTML)
- Price (JPY, sometimes free/PWYW)
- Creator name and shop link
- Thumbnail images (up to 10)
- Tags (user-defined, no standardization)
- Download files (only accessible after purchase)
- "Conditions of use" section (free-text, not machine-readable)

#### Integration Recommendation

```
Tier 3: Link-out only
- "Browse VRM Avatars on Booth" -> https://booth.pm/en/search/vrm?tags[]=VRM
- "Browse Live2D Models on Booth" -> https://booth.pm/en/search/live2d%20model
- After purchase, user drags files into our app's import dialog
```

---

### 1.5 Gumroad

| Attribute | Details |
|-----------|---------|
| **URL** | https://gumroad.com |
| **Content** | Creator marketplace with VRChat/VRM avatars and Live2D models |
| **Pricing** | Free ($0+) and paid |
| **Licensing** | Per-creator; some CC0, most custom EULA |
| **API** | Gumroad has a seller API but no public buyer/browse API |
| **Format** | VRM, FBX, Unity packages, Live2D bundles |
| **Quality** | Variable -- indie to professional |

#### Gumroad API Limitations

Gumroad's API is seller-focused: it allows creators to manage products, check license keys, and view sales. There is no public endpoint for:
- Searching/browsing products
- Downloading purchased files programmatically
- Filtering by file format or tags

#### Notable Free VRM Models on Gumroad

Several creators offer free (PWYW $0+) VRM models:
- **VTuber Shop** offers MMD-to-VRM conversion tools
- **ReDesign Studio** offers free 3D VRM character models
- Various indie creators share free VTuber-ready avatars

#### Integration: Link-Out

Similar to Booth.pm -- provide curated links to Gumroad search pages:
```
https://gumroad.com/discover?query=vrm+avatar
https://gumroad.com/discover?query=live2d+model
```

---

### 1.6 itch.io

| Attribute | Details |
|-----------|---------|
| **URL** | https://itch.io |
| **Content** | Indie game assets including VTuber models |
| **Pricing** | Many free, some paid |
| **Licensing** | Per-creator; generally more permissive than Booth |
| **API** | itch.io has a limited API (no public asset search) |
| **Format** | VRM, Live2D, PNG sprite sheets |
| **Quality** | Variable -- indie/hobbyist focused |

#### itch.io Asset Discovery

itch.io organizes assets under the "Game assets" category with tag-based filtering:

```
https://itch.io/game-assets/free/tag-live2d      # Free Live2D assets
https://itch.io/game-assets/tag-live2d            # All Live2D assets
https://itch.io/game-assets/free/tag-vrm          # Free VRM assets
https://itch.io/game-assets/tag-vtuber            # VTuber assets
```

#### Notable Free Assets on itch.io

- **LimeBreaker** -- Free Live2D VTuber-ready models
- **VTuber Shop** -- MMD to VRM/VRoid converter tools
- **Various indie artists** -- Free PSD templates for Live2D rigging practice
- **Game asset packs** -- Some include VRM-compatible character models

#### Integration: Link-Out + Import

```
Tier 3: Link-out with import support
- Pre-configured itch.io search URLs for VRM/Live2D assets
- User downloads and imports via drag-and-drop
```

---

### 1.7 DeviantArt

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.deviantart.com |
| **Content** | Art community with some Live2D and VRM resources |
| **Pricing** | Mostly free (community sharing), some paid via DeviantArt Points |
| **Licensing** | Per-artist; often CC or personal use only |
| **API** | DeviantArt has an OAuth API but it is focused on 2D art, not 3D models |
| **Format** | PSD layers (for Live2D rigging), occasionally VRM/FBX |
| **Quality** | Variable; some professional Live2D PSD templates |

#### DeviantArt for Live2D

DeviantArt is primarily useful for:
- **Free PSD templates** for Live2D rigging practice (layered PSD files ready for Cubism import)
- **Art commissions** for custom Live2D illustrations
- **Tutorial resources** for Live2D rigging

Notable free resources:
- Free Live2D PSD models for practice (various artists)
- Live2D rigging tutorial reference sheets
- Character design templates

DeviantArt is not a viable source for ready-to-use models in our app. It is better suited as a community link for users who want to commission or create their own models.

---

