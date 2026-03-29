# Model Marketplace Implementation Spec

**Date:** 2026-03-29
**Based on:** `docs/research/2026-03-29-model-marketplace-research.md`
**Status:** READY TO EXECUTE

---

## Overview

Expand the existing Model Browser (3 tabs: CC0 / Sketchfab / Local) into a full Model Marketplace with 6 source integrations, license-aware badges, Live2D drag-and-drop import, Cubism Core auto-download, and VRoid Hub OAuth browsing. Builds on existing `ModelBrowser.tsx` and `avatar_browser.py`.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     ModelBrowser.tsx                         │
│  Tabs: CC0 | VRoid Hub | Sketchfab | Marketplace | Local   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ ModelCard    │  │ LicenseBadge │  │ DragDropImporter  │  │
│  │ (enhanced)  │  │ (VRM meta)   │  │ (.vrm/.moc3/.zip) │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ API calls
┌──────────────────────────▼──────────────────────────────────┐
│                   backend/server.py                          │
│  /api/avatars/browse?source={cc0,vroid,sketchfab,osa}       │
│  /api/avatars/import           (file upload)                │
│  /api/avatars/vrm-meta/{file}  (license metadata reader)    │
│  /api/avatars/vroid/auth       (OAuth flow)                 │
│  /api/live2d/cubism-core       (runtime download)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              backend/models/avatar_browser.py                │
│  + search_osa()        (Open Source Avatars JSON registry)   │
│  + search_vroid_hub()  (VRoid Hub API v11, OAuth 2.0)       │
│  + read_vrm_license()  (parse glTF VRM extension metadata)  │
│  + import_local_file() (drag-and-drop .vrm/.moc3/.zip)      │
│  + download_cubism()   (runtime fetch + cache)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Expand CC0 Catalog + Open Source Avatars Registry

**Effort:** 3-4 hours
**Why first:** Zero-auth, immediate value, expands catalog from ~20 to 300+ models.

### Files to Modify

| File | Action |
|------|--------|
| `backend/models/avatar_browser.py` | Add `search_osa()` method |
| `backend/data/osa_registry.json` | **Create** — cached snapshot of OSA projects.json |
| `backend/server.py` | Add `source=osa` to `/api/avatars/browse` |
| `frontends/sakura/src/components/ModelBrowser.tsx` | Add "Open Source" tab |
| `frontends/sakura/src/lib/types.ts` | Add `'osa'` to `BrowseableModel.source` union |

### Backend: `avatar_browser.py` Changes

```python
# New constant
_OSA_REGISTRY_URL = "https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/projects.json"
_OSA_CACHE_PATH = _THIS_DIR / "data" / "osa_registry.json"
_OSA_CACHE_TTL = 86400  # 24 hours

async def fetch_osa_registry(self, force_refresh: bool = False) -> list[dict[str, Any]]:
    """Fetch the Open Source Avatars registry from GitHub.

    Downloads and caches the projects.json file locally. Each entry
    contains a direct VRM download URL and CC0 license.

    Args:
        force_refresh: If True, bypass cache TTL and re-download.

    Returns:
        List of model dicts normalized to BrowseableModel shape.
    """
    ...

def search_osa(self, query: str) -> list[dict[str, Any]]:
    """Search the cached OSA registry by name/tags.

    Args:
        query: Case-insensitive search term.

    Returns:
        Filtered list of CC0 VRM models from opensourceavatars.com.
    """
    ...
```

### OSA Registry Format (from GitHub)

The registry at `https://github.com/ToxSam/open-source-avatars/blob/main/data/projects.json` contains entries like:

```json
{
  "id": "abc123",
  "name": "Anime Girl A",
  "creator": "username",
  "vrm_url": "https://..../model.vrm",
  "thumbnail": "https://..../thumb.png",
  "tags": ["anime", "female"],
  "license": "CC0"
}
```

Normalize each entry to the existing `BrowseableModel` shape with `source: "osa"`, `format: "vrm"`, `license: "CC0"`.

### Frontend Changes

Add a 4th tab to `SOURCE_TABS`:

```typescript
type SourceTab = 'cc0' | 'osa' | 'sketchfab' | 'local';

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Box }[] = [
  { id: 'cc0',       label: 'CC0 Curated', icon: Box },
  { id: 'osa',       label: 'Open Source',  icon: Globe },
  { id: 'sketchfab', label: 'Sketchfab',    icon: Globe },
  { id: 'local',     label: 'Local Library', icon: HardDrive },
];
```

### TODOs

- [ ] Fetch `projects.json` from GitHub, cache to `backend/data/osa_registry.json`
- [ ] Implement 24h TTL cache refresh (check file mtime)
- [ ] Normalize OSA entries to `BrowseableModel` shape
- [ ] Wire `source=osa` into `/api/avatars/browse` endpoint
- [ ] Add "Open Source" tab to `ModelBrowser.tsx`
- [ ] Handle pagination (OSA is ~300 models, paginate client-side at 24/page)
- [ ] Add "Refresh catalog" button to force re-fetch
- [ ] Test with real OSA registry data

---

## Phase 2: Local File Import (Drag-and-Drop)

**Effort:** 4-5 hours
**Why second:** Essential for Booth.pm/nizima/Gumroad purchases. Users buy models externally and need to import them.

### Files to Modify

| File | Action |
|------|--------|
| `backend/models/avatar_browser.py` | Add `import_local_file()` method |
| `backend/server.py` | Add `POST /api/avatars/import` (multipart upload) |
| `frontends/sakura/src/components/ModelBrowser.tsx` | Add drag-and-drop zone to Local tab |
| `frontends/sakura/src/lib/api.ts` | Add `importAvatar()` API call |

### Backend: File Import Endpoint

```python
# In server.py
@app.post("/api/avatars/import")
async def import_avatar(file: UploadFile = File(...)):
    """Import a local avatar model file via upload.

    Accepts:
        - .vrm files (VRM 0.x and 1.0)
        - .glb / .gltf files
        - .zip files containing Live2D model bundles
          (.moc3 + .model3.json + textures)

    The file is validated, placed in the correct storage subdirectory,
    and metadata is returned.

    Args:
        file: Uploaded file (multipart/form-data).

    Returns:
        JSON with: ok, filename, format, size_mb, license_meta (if VRM).
    """
    ...
```

### Supported Import Formats

| Format | Extension(s) | Handling |
|--------|-------------|----------|
| VRM | `.vrm` | Save to `storage/models/vrm/`, extract license metadata |
| GLB/GLTF | `.glb`, `.gltf` | Save to `storage/models/glb/` |
| Live2D bundle | `.zip` | Extract, validate `.model3.json` exists, save to `storage/models/live2d/{name}/` |
| Live2D direct | `.moc3` | Reject with helpful error: "Please upload a .zip containing the full model bundle" |

### `avatar_browser.py` Addition

```python
# New constant
_LIVE2D_DIR = _THIS_DIR / "storage" / "models" / "live2d"

async def import_local_file(self, filename: str, data: bytes) -> dict[str, Any]:
    """Import an uploaded avatar model file.

    Validates the file format, saves to the appropriate storage
    directory, and extracts metadata (VRM license info if applicable).

    Args:
        filename: Original upload filename.
        data: Raw file bytes.

    Returns:
        Dict with: ok, filename, format, size_mb, path,
        license_meta (VRM only), error.

    Raises:
        ValueError: If file extension is unsupported or validation fails.
    """
    ...

def _validate_live2d_zip(self, zip_data: bytes) -> tuple[bool, str]:
    """Validate a Live2D model ZIP bundle.

    Checks that the archive contains at least one .model3.json file
    and that any .moc3 files are version 5 or below (not Cubism 5.3 v6).

    Args:
        zip_data: Raw ZIP file bytes.

    Returns:
        Tuple of (is_valid, error_message).
    """
    ...
```

### Frontend: Drag-and-Drop Zone

Add to the Local tab in `ModelBrowser.tsx`:

```typescript
// Drop zone at the top of the Local tab content area
<div
  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
  onDragLeave={() => setDragActive(false)}
  onDrop={handleFileDrop}
  style={{
    border: `2px dashed ${dragActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center',
    marginBottom: '16px',
    transition: 'all 0.15s ease',
    backgroundColor: dragActive ? 'var(--color-accent-soft)' : 'transparent',
  }}
>
  <Upload size={24} style={{ color: 'var(--color-text-tertiary)', marginBottom: 8 }} />
  <p>Drop .vrm, .glb, or Live2D .zip files here</p>
  <p style={{ fontSize: '0.65rem' }}>Or click to browse</p>
  <input type="file" accept=".vrm,.glb,.gltf,.zip" hidden ref={fileInputRef} onChange={handleFileSelect} />
</div>
```

### TODOs

- [ ] Add `POST /api/avatars/import` endpoint to `server.py` (multipart upload, 100MB max)
- [ ] Implement `import_local_file()` in `avatar_browser.py`
- [ ] ZIP validation: check for `.model3.json`, check moc3 version bytes
- [ ] moc3 version check: read bytes 4-7 of moc3 file header for version number (reject v6+)
- [ ] Drag-and-drop UI component in `ModelBrowser.tsx` Local tab
- [ ] Also add a file picker button (click-to-browse fallback)
- [ ] Show upload progress for large files
- [ ] After successful import, refresh local library and show success toast
- [ ] Add `importAvatar()` to `api.ts`
- [ ] Handle duplicate filenames (append `_1`, `_2`, etc.)
- [ ] Test: import VRM, import GLB, import Live2D ZIP, import invalid file

---

## Phase 3: VRM License Metadata Reader + Badge System

**Effort:** 4-5 hours
**Why third:** Builds trust, enables filtering, critical for user awareness of model rights.

### Files to Modify

| File | Action |
|------|--------|
| `backend/models/avatar_browser.py` | Add `read_vrm_license()` method |
| `backend/models/vrm_parser.py` | **Create** — lightweight VRM glTF extension parser |
| `backend/server.py` | Add `GET /api/avatars/vrm-meta/{filename}` endpoint |
| `frontends/sakura/src/components/ModelBrowser.tsx` | Add `LicenseBadge` sub-component |
| `frontends/sakura/src/lib/types.ts` | Add `VrmLicenseMeta` interface |

### VRM License Metadata Format

VRM files are glTF containers. License metadata lives in the glTF JSON under:

- **VRM 0.x:** `extensions.VRM.meta` — fields: `licenseName`, `allowedUserName`, `violentUsage`, `sexualUsage`, `commercialUsage`, `otherPermissionUrl`
- **VRM 1.0:** `extensions.VRMC_vrm.meta` — fields: `licenseUrl`, `allowExcessivelyViolentUsage`, `allowExcessivelySexualUsage`, `commercialUsage` ("personalNonProfit" | "personalProfit" | "corporation"), `allowRedistribution`, `modification` ("prohibited" | "allowModification" | "allowModificationRedistribution")

### Backend: `vrm_parser.py` (New File)

```python
"""Lightweight VRM metadata parser.

Reads glTF JSON from a .vrm file (which is just a .glb container)
and extracts the VRM extension metadata: license, author, title,
version, and usage permissions.

This does NOT load the 3D geometry — it only reads the JSON header
chunk of the GLB binary, making it fast even for large files.

Example:
    >>> meta = read_vrm_metadata("/path/to/model.vrm")
    >>> meta["license_name"]
    'CC0-1.0'
    >>> meta["commercial_use"]
    'Allow'
"""

import json
import struct
from pathlib import Path
from typing import Any


def read_vrm_metadata(file_path: str | Path) -> dict[str, Any]:
    """Read VRM license and author metadata from a .vrm file.

    Parses the GLB binary header to extract the JSON chunk, then
    reads the VRM extension metadata. Supports both VRM 0.x and 1.0.

    Args:
        file_path: Path to a .vrm file.

    Returns:
        Dict with normalized keys:
            - vrm_version: "0.x" | "1.0"
            - title: str
            - author: str
            - license_name: str (e.g., "CC0-1.0", "CC-BY-4.0", "Other")
            - license_url: str
            - allowed_users: str ("Everyone" | "OnlyAuthor" | "ExplicitlyLicensedPerson")
            - commercial_use: str ("Allow" | "Disallow" | "personalNonProfit" | ...)
            - sexual_usage: str ("Allow" | "Disallow")
            - violent_usage: str ("Allow" | "Disallow")
            - modification: str ("Allow" | "Disallow" | "prohibited" | ...)
            - redistribution: str ("Allow" | "Disallow")
            - other_permission_url: str
            - thumbnail_image_index: int | None

    Raises:
        ValueError: If the file is not a valid GLB or has no VRM metadata.
    """
    ...
```

**GLB Parsing Approach (no dependencies):**

1. Read first 12 bytes: magic (`0x46546C67` = "glTF"), version (2), total length
2. Read chunk 0 header (8 bytes): chunk length, chunk type (`0x4E4F534A` = "JSON")
3. Read chunk 0 data: raw JSON string
4. Parse JSON, extract `extensions.VRM.meta` (0.x) or `extensions.VRMC_vrm.meta` (1.0)

This avoids any heavy 3D library dependency — pure binary parsing of the GLB header.

### Backend: `avatar_browser.py` Addition

```python
def read_vrm_license(self, filename: str) -> dict[str, Any]:
    """Read VRM license metadata from a local model file.

    Args:
        filename: Name of the .vrm file in local storage.

    Returns:
        Dict with VRM license metadata, or error dict if file not found
        or not a valid VRM.
    """
    path = self._find_model_path(filename)
    if not path:
        return {"error": f"File not found: {filename}"}
    from backend.models.vrm_parser import read_vrm_metadata
    return read_vrm_metadata(path)
```

### API Endpoint

```python
@app.get("/api/avatars/vrm-meta/{filename}")
async def get_vrm_metadata(filename: str):
    """Get VRM license and author metadata for a local model.

    Returns the embedded VRM extension metadata including license,
    author, usage permissions, and version info.
    """
    return avatar_browser.read_vrm_license(filename)
```

### Frontend: License Badge Component

Add to `ModelBrowser.tsx`:

```typescript
interface VrmLicenseMeta {
  vrm_version: string;
  title: string;
  author: string;
  license_name: string;
  commercial_use: string;
  sexual_usage: string;
  violent_usage: string;
  modification: string;
  redistribution: string;
}
```

**Badge Display Rules:**

| License | Badge Color | Icon | Tooltip |
|---------|------------|------|---------|
| CC0 | Green | Shield-check | "Public domain — use for anything" |
| CC-BY | Blue | Shield | "Free with attribution" |
| CC-BY-NC | Orange | Shield-alert | "Non-commercial use only" |
| Personal Use | Red | Shield-x | "Personal use only — do not redistribute" |
| Unknown | Gray | Help-circle | "License unknown — check with creator" |

**Permission pills** (shown in expanded card or detail popover):
- Commercial: green/red pill
- Modification: green/red pill
- Redistribution: green/red pill
- NSFW content: green/red pill
- Violent content: green/red pill

### TODOs

- [ ] Create `backend/models/vrm_parser.py` — GLB header parser + VRM extension reader
- [ ] Support VRM 0.x `extensions.VRM.meta` fields
- [ ] Support VRM 1.0 `extensions.VRMC_vrm.meta` fields
- [ ] Add `read_vrm_license()` to `avatar_browser.py`
- [ ] Add `GET /api/avatars/vrm-meta/{filename}` endpoint to `server.py`
- [ ] Create `LicenseBadge` component in `ModelBrowser.tsx`
- [ ] Show license badge on all model cards (CC0 for OSA, extracted for local VRM)
- [ ] Add license detail popover/tooltip with permission pills
- [ ] Add license filter dropdown to search header ("All" / "CC0" / "CC-BY" / "Any Commercial")
- [ ] Auto-extract license on import (Phase 2 import endpoint reads VRM meta and stores it)
- [ ] Add `VrmLicenseMeta` type to `types.ts`
- [ ] Test with VRM 0.x file, VRM 1.0 file, non-VRM file (should gracefully error)
- [ ] Test: malformed GLB, truncated file, VRM with no meta extension

---

## Phase 4: VRoid Hub API Integration

**Effort:** 8-10 hours
**Why fourth:** Highest browsing value — thousands of quality VRM models, but requires OAuth 2.0 flow.

### Files to Modify

| File | Action |
|------|--------|
| `backend/models/avatar_browser.py` | Add `search_vroid_hub()`, `download_vroid_model()` |
| `backend/models/vroid_oauth.py` | **Create** — OAuth 2.0 flow for VRoid Hub |
| `backend/server.py` | Add VRoid auth + browse endpoints |
| `backend/config/app.json` | Add `vroid_client_id`, `vroid_client_secret` fields |
| `frontends/sakura/src/components/ModelBrowser.tsx` | Add "VRoid Hub" tab with auth prompt |
| `frontends/sakura/src/lib/api.ts` | Add VRoid auth + browse API calls |
| `frontends/sakura/src/lib/types.ts` | Add `'vroid'` source handling |

### VRoid Hub API Details

**Base URL:** `https://hub.vroid.com/api`
**Auth:** OAuth 2.0 Authorization Code flow
**Dev registration:** https://hub.vroid.com/en/developer/registration

#### OAuth 2.0 Flow

```
1. User clicks "Connect VRoid Hub" in Model Browser
2. Frontend opens popup/redirect to:
   https://hub.vroid.com/oauth/authorize
     ?client_id={CLIENT_ID}
     &response_type=code
     &redirect_uri=http://localhost:8080/api/vroid/callback
     &scope=default
3. User authorizes in browser
4. VRoid Hub redirects to callback with ?code=xxx
5. Backend exchanges code for access_token:
   POST https://hub.vroid.com/oauth/token
     grant_type=authorization_code
     code=xxx
     client_id=xxx
     client_secret=xxx
     redirect_uri=http://localhost:8080/api/vroid/callback
6. Backend stores access_token + refresh_token in app.json
7. Frontend polls /api/vroid/status until connected
```

#### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/character_models` | GET | Browse/search all models |
| `/api/character_models/{id}` | GET | Get model details |
| `/api/character_models/{id}/download` | GET | Get download URL (if allowed) |
| `/api/hearts` | GET | User's favorited models |

#### Search Parameters

```
GET /api/character_models?
  q={search_term}
  &category=character
  &is_downloadable=true     # Only models the creator allows downloading
  &order=popularity          # popularity | newest
  &count=24
  &offset=0
```

#### Response Shape (normalized)

```json
{
  "id": "vroid_12345",
  "name": "Model Name",
  "description": "Creator's description",
  "thumbnail_url": "https://hub.vroid.com/...thumb.png",
  "download_url": "",
  "format": "vrm",
  "license": "VRoid Hub Terms",
  "file_size_mb": 0,
  "tags": ["anime", "female"],
  "author": "CreatorName",
  "source": "vroid",
  "_vroid_id": "12345",
  "_is_downloadable": true,
  "_commercial_use": false,
  "_modification_ok": true
}
```

### Backend: `vroid_oauth.py` (New File)

```python
"""VRoid Hub OAuth 2.0 client.

Handles the authorization code flow for VRoid Hub API access.
Tokens are stored in the app config file for persistence across restarts.

Example:
    >>> client = VRoidOAuth(config)
    >>> auth_url = client.get_auth_url()
    >>> # User visits auth_url, authorizes, gets redirected
    >>> client.exchange_code("abc123")
    >>> # Now API calls will work
"""

class VRoidOAuth:
    """Manages VRoid Hub OAuth 2.0 tokens.

    Attributes:
        access_token: Current bearer token, or None.
        refresh_token: Refresh token for token renewal.
        expires_at: Unix timestamp when access_token expires.
    """

    AUTH_URL = "https://hub.vroid.com/oauth/authorize"
    TOKEN_URL = "https://hub.vroid.com/oauth/token"
    REDIRECT_URI = "http://localhost:8080/api/vroid/callback"
    SCOPES = "default"

    def get_auth_url(self) -> str: ...
    async def exchange_code(self, code: str) -> dict[str, Any]: ...
    async def refresh_access_token(self) -> dict[str, Any]: ...
    def is_connected(self) -> bool: ...
    def get_headers(self) -> dict[str, str]: ...
```

### Backend: `avatar_browser.py` Additions

```python
async def search_vroid_hub(
    self, query: str = "", page: int = 1, downloadable_only: bool = True
) -> list[dict[str, Any]]:
    """Search VRoid Hub for VRM character models.

    Requires a valid OAuth token (see vroid_oauth.py).

    Args:
        query: Search string.
        page: 1-based page number (24 results/page).
        downloadable_only: If True, only return models marked downloadable.

    Returns:
        List of model dicts normalized to BrowseableModel shape.
        Empty list if not authenticated or request fails.
    """
    ...

async def download_vroid_model(self, vroid_id: str) -> dict[str, Any]:
    """Download a VRM model from VRoid Hub.

    Fetches the download URL for the given model ID, then streams
    the file to local storage using the standard download engine.

    Args:
        vroid_id: VRoid Hub model ID.

    Returns:
        Dict with: ok, filename, path, error.
    """
    ...
```

### Frontend: VRoid Hub Tab

The VRoid Hub tab has two states:

**Disconnected state:**
```
┌──────────────────────────────┐
│  🔗 Connect to VRoid Hub     │
│                              │
│  Browse thousands of anime   │
│  VRM avatars from VRoid Hub. │
│                              │
│  [Connect VRoid Hub]         │
│                              │
│  Free account required.      │
│  vroid.com/en/studio         │
└──────────────────────────────┘
```

**Connected state:**
Standard grid layout with search, same as other tabs. Additional filter: "Downloadable only" toggle.

### API Endpoints (server.py)

```python
@app.get("/api/vroid/status")
async def vroid_status():
    """Check VRoid Hub connection status."""
    return {"connected": vroid_oauth.is_connected()}

@app.get("/api/vroid/auth-url")
async def vroid_auth_url():
    """Get the VRoid Hub OAuth authorization URL."""
    return {"url": vroid_oauth.get_auth_url()}

@app.get("/api/vroid/callback")
async def vroid_callback(code: str):
    """OAuth callback from VRoid Hub. Exchanges code for tokens."""
    result = await vroid_oauth.exchange_code(code)
    # Return HTML page that closes the popup
    return HTMLResponse("<html><script>window.close()</script>Connected!</html>")

@app.delete("/api/vroid/disconnect")
async def vroid_disconnect():
    """Disconnect VRoid Hub (clear tokens)."""
    vroid_oauth.clear_tokens()
    return {"ok": True}
```

### TODOs

- [ ] Register as VRoid Hub developer (manual step, needs client_id/secret)
- [ ] Create `backend/models/vroid_oauth.py` — OAuth 2.0 flow
- [ ] Store tokens encrypted in `backend/config/app.json`
- [ ] Add auth endpoints to `server.py`: status, auth-url, callback, disconnect
- [ ] Implement `search_vroid_hub()` in `avatar_browser.py`
- [ ] Implement `download_vroid_model()` in `avatar_browser.py`
- [ ] Wire `source=vroid` into `/api/avatars/browse`
- [ ] Frontend: add "VRoid Hub" tab to `ModelBrowser.tsx`
- [ ] Frontend: disconnected state with "Connect" button
- [ ] Frontend: popup window for OAuth flow
- [ ] Frontend: poll `/api/vroid/status` after popup closes
- [ ] Frontend: "Downloadable only" filter toggle
- [ ] Frontend: show VRoid-specific license info (per-model permissions)
- [ ] Handle token refresh automatically (401 → refresh → retry)
- [ ] Handle rate limiting (back off and show user-friendly message)
- [ ] Add "Disconnect VRoid Hub" button in connected state
- [ ] Test: full OAuth flow, search, download, token refresh, token expiry

---

## Phase 5: Cubism Core Runtime Auto-Download

**Effort:** 3-4 hours
**Why fifth:** Required before any Live2D model can render. Must NOT bundle the SDK — users download it themselves.

### Files to Modify

| File | Action |
|------|--------|
| `backend/server.py` | Add `GET /api/live2d/cubism-core/status`, `POST /api/live2d/cubism-core/download` |
| `backend/models/cubism_runtime.py` | **Create** — Cubism Core download + cache manager |
| `frontends/sakura/src/hooks/useLive2D.ts` | Add Cubism Core availability check before model load |
| `frontends/sakura/src/components/CubismCoreSetup.tsx` | **Create** — one-time setup dialog |

### Strategy

The Cubism Core runtime (`live2dcubismcore.min.js`) is proprietary and cannot be redistributed. Our approach:

1. On first Live2D model load, check if `live2dcubismcore.min.js` exists locally
2. If missing, show a setup dialog explaining:
   - "Live2D models require the Cubism Core runtime"
   - "This is a free download from Live2D Inc."
   - Two options: [Auto-download] or [Manual: visit live2d.com]
3. Auto-download fetches from Live2D's official CDN/npm and caches locally
4. File is stored at `backend/storage/lib/live2dcubismcore.min.js`
5. Served via `/files/lib/live2dcubismcore.min.js`

### Backend: `cubism_runtime.py` (New File)

```python
"""Cubism Core runtime download and cache manager.

Handles downloading the Live2D Cubism Core runtime
(live2dcubismcore.min.js) from official sources and caching
it locally. This avoids bundling the proprietary runtime
while providing a seamless user experience.

The runtime is downloaded from the official Live2D npm package
(@nicokimura/cubism4-core or similar public CDN mirror).

Example:
    >>> manager = CubismRuntimeManager()
    >>> manager.is_available()
    False
    >>> await manager.download()
    >>> manager.is_available()
    True
"""

_CUBISM_CORE_PATH = Path(__file__).resolve().parent.parent / "storage" / "lib" / "live2dcubismcore.min.js"

# Official source: npm package or CDN
_CUBISM_CORE_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"

class CubismRuntimeManager:
    """Manages the Cubism Core runtime file.

    Attributes:
        core_path: Path where the runtime is cached locally.
    """

    def is_available(self) -> bool:
        """Check if the Cubism Core runtime exists locally."""
        ...

    def get_version(self) -> str | None:
        """Read the Cubism Core version from the cached file header."""
        ...

    async def download(self) -> dict[str, Any]:
        """Download the Cubism Core runtime from official sources.

        Returns:
            Dict with: ok, path, version, error.
        """
        ...

    def get_serve_path(self) -> str | None:
        """Get the URL path to serve the cached runtime file."""
        ...
```

### Frontend: `CubismCoreSetup.tsx` (New File)

A modal dialog shown when:
- User tries to load a Live2D model AND Cubism Core is not available
- User navigates to Live2D section of settings

```
┌────────────────────────────────────┐
│  Live2D Runtime Setup              │
│                                    │
│  Live2D models require the Cubism  │
│  Core runtime from Live2D Inc.     │
│  This is a one-time setup.        │
│                                    │
│  [Auto-Download (Recommended)]     │
│                                    │
│  ── or ──                          │
│                                    │
│  [Download manually from live2d.com]│
│  Then drag the .js file here: [  ] │
│                                    │
│  Note: Free for indie use (<$67K)  │
└────────────────────────────────────┘
```

### `useLive2D.ts` Changes

Add a pre-check before model loading:

```typescript
// Before loading any Live2D model, verify Cubism Core is available
const cubismStatus = await api.getCubismCoreStatus();
if (!cubismStatus.available) {
  // Emit event or set state to show CubismCoreSetup dialog
  onCubismCoreMissing?.();
  return;
}
```

### TODOs

- [ ] Create `backend/models/cubism_runtime.py`
- [ ] Identify the correct official CDN URL for `live2dcubismcore.min.js`
- [ ] Add `GET /api/live2d/cubism-core/status` — returns `{available, version, path}`
- [ ] Add `POST /api/live2d/cubism-core/download` — downloads and caches the runtime
- [ ] Serve cached file via `/files/lib/live2dcubismcore.min.js` (static file route)
- [ ] Create `CubismCoreSetup.tsx` modal component
- [ ] Wire into `useLive2D.ts` — check availability before model load
- [ ] Add manual upload fallback (drag .js file onto dialog)
- [ ] Show version info after successful download
- [ ] Handle download failure gracefully (network error, CDN down)
- [ ] Test: fresh state (no core), auto-download, manual upload, subsequent loads (cached)

---

## Phase 6: Marketplace Link-Outs + Polish

**Effort:** 3-4 hours
**Why last:** Low effort, good discoverability for sources without APIs.

### Files to Modify

| File | Action |
|------|--------|
| `frontends/sakura/src/components/ModelBrowser.tsx` | Add "Marketplace" tab with link cards |
| `frontends/sakura/src/components/ModelBrowser.tsx` | UI polish pass on all tabs |

### Marketplace Tab Content

A curated grid of external model sources with descriptions and direct links:

| Source | Type | Description | URL |
|--------|------|-------------|-----|
| Booth.pm | VRM + Live2D | Largest Japanese creator marketplace. 3,200+ VRM models, 1,400+ Live2D. | `https://booth.pm/en/browse/3D%20Models` |
| nizima | Live2D | Official Live2D marketplace. Professional rigged models. | `https://nizima.com` |
| Gumroad | VRM | Creator marketplace with VRChat/VRM avatars. | `https://gumroad.com/3d/avatars` |
| itch.io | VRM + Live2D | Indie creator assets, some free. | `https://itch.io` (search "VRM avatar") |
| VRoid Studio | Tool | Free VRM avatar creator. No modeling skills needed. | `https://vroid.com/en/studio` |
| Cubism Editor | Tool | Live2D model creation tool. Free tier available. | `https://www.live2d.com/en/cubism/` |

Each card: icon, name, description, "Open in Browser" button (launches default browser via Electron shell.openExternal or window.open).

### UI Polish Items

- [ ] Consistent card heights across all tabs
- [ ] Loading skeleton animation (not just spinner)
- [ ] "No results" states with helpful suggestions per tab
- [ ] Keyboard navigation (arrow keys between cards, Enter to download)
- [ ] Thumbnail lazy-loading with IntersectionObserver
- [ ] Model count badge on each tab
- [ ] "Last refreshed" timestamp for OSA and CC0 catalogs
- [ ] Search placeholder text per tab ("Search VRoid Hub...", "Filter local models...")
- [ ] Responsive grid: 1 column at narrow width, 2-3 at normal

### TODOs

- [ ] Create marketplace link-out cards with external URLs
- [ ] Add ExternalLink icon for "Open in Browser" buttons
- [ ] Each card: logo/icon, name, model count estimate, "popular for" tags
- [ ] Add VRoid Studio and Cubism Editor as "Create Your Own" section
- [ ] Include a tip: "After purchasing, drag-and-drop your .vrm or .zip into the Local tab"
- [ ] UI polish: skeletons, lazy thumbnails, keyboard nav
- [ ] Update tab count badge to show model count per tab
- [ ] Final pass: test all 5 tabs end-to-end

---

## Effort Summary

| Phase | Description | Hours | Cumulative |
|-------|-------------|-------|------------|
| 1 | Open Source Avatars registry | 3-4h | 3-4h |
| 2 | Local file import (drag-and-drop) | 4-5h | 7-9h |
| 3 | VRM license metadata + badges | 4-5h | 11-14h |
| 4 | VRoid Hub OAuth + browsing | 8-10h | 19-24h |
| 5 | Cubism Core auto-download | 3-4h | 22-28h |
| 6 | Marketplace link-outs + polish | 3-4h | 25-32h |
| **Total** | | **25-32h** | |

Using the project's 12x AI-assisted calibration: **2-3 calendar hours per phase**, ~13-16h wall clock total.

---

## Files Summary

### New Files (6)

| File | Phase | Purpose |
|------|-------|---------|
| `backend/data/osa_registry.json` | 1 | Cached OSA projects.json snapshot |
| `backend/models/vrm_parser.py` | 3 | Lightweight VRM glTF extension parser |
| `backend/models/vroid_oauth.py` | 4 | VRoid Hub OAuth 2.0 client |
| `backend/models/cubism_runtime.py` | 5 | Cubism Core download/cache manager |
| `frontends/sakura/src/components/CubismCoreSetup.tsx` | 5 | One-time Cubism Core setup dialog |
| `backend/tests/test_vrm_parser.py` | 3 | Tests for VRM metadata extraction |

### Modified Files (7)

| File | Phases | Changes |
|------|--------|---------|
| `backend/models/avatar_browser.py` | 1,2,3,4 | +`search_osa()`, +`import_local_file()`, +`read_vrm_license()`, +`search_vroid_hub()`, +`download_vroid_model()` |
| `backend/server.py` | 1,2,3,4,5 | New endpoints: browse?source=osa, import, vrm-meta, vroid auth/callback, cubism-core |
| `backend/config/app.json` | 4 | +`vroid_client_id`, `vroid_client_secret`, `vroid_access_token` |
| `frontends/sakura/src/components/ModelBrowser.tsx` | 1,2,3,6 | +OSA tab, +drag-drop, +LicenseBadge, +Marketplace tab, polish |
| `frontends/sakura/src/lib/types.ts` | 1,3 | +`'osa'` source, +`VrmLicenseMeta` interface |
| `frontends/sakura/src/lib/api.ts` | 1,2,3,4,5 | +`importAvatar()`, +VRoid auth/browse, +cubism status/download |
| `frontends/sakura/src/hooks/useLive2D.ts` | 5 | +Cubism Core availability pre-check |

---

## Dependencies & Blockers

| Item | Blocker? | Notes |
|------|----------|-------|
| VRoid Hub dev registration | Phase 4 blocker | Manual step — register at hub.vroid.com/en/developer/registration, get client_id/secret |
| Live2D Cubism Core CDN URL | Phase 5 | Need to verify exact URL that serves `live2dcubismcore.min.js` without auth |
| OSA registry format | Phase 1 | Verify actual JSON structure of `projects.json` matches assumptions |
| No new pip dependencies | All | `httpx` already installed; VRM parser uses only stdlib (`json`, `struct`) |
| No new npm dependencies | All | All frontend work uses existing React + Lucide icons |
