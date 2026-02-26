# TTS Model Manager — Design Document

**Date:** 2026-02-25
**Status:** Approved design, pending implementation plan
**Phase:** TTS Model Manager (post-Phase 6F)

---

## Goal

Add an on-demand TTS voice model manager to the app. Users can browse, preview, download, and delete local TTS voice packs for Kokoro and Piper engines — nothing pre-packaged, models download only when the user chooses. Replaces the current free-text voice ID input with a proper voice picker dropdown.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Engines at launch | Kokoro + Piper | Clean model-per-voice pattern; Chatterbox/XTTS/GPT-SoVITS are "install a server" — later phase |
| Catalog approach | Hybrid (bundled JSON + online refresh) | Works offline with bundled list, discovers new voices when online |
| Model storage | `backend/storage/tts_models/` (configurable via `tts.model_dir`) | Consistent with existing storage, easy to find/backup, added to .gitignore |
| UI approach | Two-tier: voice picker dropdown + model management panel | Picker for daily use, management panel for installing new voices |
| Voice preview | Pre-recorded samples (pre-install) + live synthesis (post-install) | Browse fast without downloading; post-install proves engine works |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend                                            │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ Voice Picker     │  │ TTS Model Manager Panel  │  │
│  │ (dropdown in     │  │ (Settings > TTS Models)  │  │
│  │  WaifuCreator +  │  │ - Browse catalog         │  │
│  │  Settings)       │  │ - Install / Delete        │  │
│  │                  │  │ - Size / Status           │  │
│  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                         │                 │
│           ▼                         ▼                 │
│     GET /api/tts/voices    GET /api/tts/models        │
│                            POST /api/tts/models/install│
│                            DELETE /api/tts/models/:id  │
│                            POST /api/tts/models/refresh│
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Backend — TTSModelManager                              │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Catalog       │  │ Downloader  │  │ Storage       │  │
│  │ (bundled JSON │  │ (async      │  │ tts_models/   │  │
│  │  + refresh)   │  │  httpx      │  │  kokoro/      │  │
│  │              │  │  w/progress) │  │  piper/       │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Browse**: Frontend calls `GET /api/tts/models` → returns catalog merged with install status
2. **Install**: Frontend calls `POST /api/tts/models/install` with `{model_id}` → backend downloads async, reports progress via SSE
3. **Delete**: Frontend calls `DELETE /api/tts/models/{model_id}` → backend removes files, updates status
4. **Pick voice**: Frontend calls `GET /api/tts/voices?provider=kokoro` → returns only installed voices for dropdown
5. **Preview (pre-install)**: Frontend plays `sample_url` directly from catalog entry
6. **Preview (post-install)**: Frontend calls `POST /api/tts` with installed voice → live synthesis

## Catalog Schema

Each voice entry in the bundled catalog JSON (`backend/tts/voice_catalog.json`):

```json
{
  "id": "kokoro/af_sky",
  "engine": "kokoro",
  "name": "Sky",
  "language": "en-US",
  "gender": "female",
  "description": "Warm, natural American female",
  "size_mb": 45,
  "files": [
    {
      "url": "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices/af_sky.pt",
      "path": "kokoro/af_sky.pt"
    }
  ],
  "voice_id": "af_sky",
  "sample_url": "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/samples/af_sky.wav",
  "tags": ["natural", "warm"]
}
```

Piper voices use a pair of files (`.onnx` + `.onnx.json`):

```json
{
  "id": "piper/en_US-amy-medium",
  "engine": "piper",
  "name": "Amy",
  "language": "en-US",
  "gender": "female",
  "description": "Medium quality American female",
  "size_mb": 63,
  "files": [
    {
      "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
      "path": "piper/en_US-amy-medium.onnx"
    },
    {
      "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json",
      "path": "piper/en_US-amy-medium.onnx.json"
    }
  ],
  "voice_id": "piper/en_US-amy-medium",
  "sample_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/samples/speaker_0.mp3",
  "tags": ["clear", "american"]
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tts/models` | Full catalog with install status per entry |
| `POST` | `/api/tts/models/install` | Start async download `{model_id}` |
| `GET` | `/api/tts/models/install/status` | SSE stream of download progress |
| `DELETE` | `/api/tts/models/{model_id}` | Delete installed model files |
| `POST` | `/api/tts/models/refresh-catalog` | Fetch latest catalog from remote URL |
| `GET` | `/api/tts/voices` | Installed voices only, grouped by provider (for picker dropdown) |

### Response Shapes

**GET /api/tts/models:**
```json
{
  "models": [
    {
      "id": "kokoro/af_sky",
      "engine": "kokoro",
      "name": "Sky",
      "language": "en-US",
      "gender": "female",
      "size_mb": 45,
      "installed": true,
      "sample_url": "https://...",
      "tags": ["natural", "warm"]
    }
  ],
  "catalog_updated": "2026-02-25T12:00:00Z",
  "total_installed_mb": 180
}
```

**GET /api/tts/voices:**
```json
{
  "voices": [
    {"id": "af_sky", "name": "Sky (Female, American)", "provider": "kokoro", "language": "en-US"},
    {"id": "en-US-AriaNeural", "name": "Aria (Female, American)", "provider": "edge-tts", "language": "en-US"}
  ]
}
```

Edge-TTS voices are always included (no download needed — they stream from Microsoft cloud).

**POST /api/tts/models/install** (request):
```json
{"model_id": "kokoro/af_sky"}
```

**GET /api/tts/models/install/status** (SSE stream):
```
data: {"model_id": "kokoro/af_sky", "status": "downloading", "progress": 0.45, "bytes_done": 20971520, "bytes_total": 47185920}
data: {"model_id": "kokoro/af_sky", "status": "complete"}
```

## UI Surfaces

### Voice Picker Dropdown

Replaces the free-text voice ID input in WaifuCreator and SettingsModal.

- Grouped by provider: "Kokoro", "Piper", "Edge-TTS"
- Each option shows: voice name + language
- "Manage Voices..." option at bottom opens Settings > TTS Models tab
- Edge-TTS voices always available (no install needed)
- Only shows installed local voices (prevents selecting unavailable voice)

### TTS Models Panel (Settings > "TTS Models" tab)

- **Header**: total installed count, total disk usage, "Refresh Catalog" button
- **Filter bar**: engine dropdown (All / Kokoro / Piper), language dropdown, gender toggle
- **Voice cards** (grid layout):
  - Voice name, engine badge, language flag, gender icon
  - File size (e.g. "45 MB")
  - Preview button (plays sample_url or live synthesis)
  - Install / Delete button with confirmation
  - Download progress bar (during install)
- **Installed section** at top, available section below

## Error Handling

- **Download failure** → Retry button, partial file cleanup (delete incomplete downloads)
- **Disk space** → Check available space before download, warn if < 500MB free
- **Engine not running** → Model files download fine, but show info note: "Kokoro server must be running to use this voice"
- **Catalog refresh failure** → Keep using bundled catalog, show toast: "Could not refresh — using cached catalog"
- **Concurrent downloads** → Allow one download at a time per engine, queue additional requests

## Storage Layout

```
backend/storage/tts_models/
├── kokoro/
│   ├── af_sky.pt
│   ├── af_bella.pt
│   └── jf_alpha.pt
├── piper/
│   ├── en_US-amy-medium.onnx
│   ├── en_US-amy-medium.onnx.json
│   └── en_GB-alan-medium.onnx
└── .installed.json          # Tracks install metadata (date, version, size)
```

The `.installed.json` file tracks what's installed without scanning the filesystem:

```json
{
  "kokoro/af_sky": {"installed_at": "2026-02-25T12:00:00Z", "size_bytes": 47185920, "version": "1.0"},
  "piper/en_US-amy-medium": {"installed_at": "2026-02-25T12:05:00Z", "size_bytes": 66060288, "version": "1.0"}
}
```

## Config

New keys in `app.json`:

```json
{
  "tts": {
    "model_dir": null,
    "catalog_url": "https://raw.githubusercontent.com/WestonGFX/waifu-rt3d/master/backend/tts/voice_catalog.json"
  }
}
```

- `model_dir`: Override storage path. `null` = use default `backend/storage/tts_models/`
- `catalog_url`: Remote URL for catalog refresh. Can be changed for self-hosted catalogs.

## Future Extensions (not in this phase)

- Chatterbox / XTTS / GPT-SoVITS server setup wizard
- Voice model favorites / ratings
- Community voice sharing
- Auto-detect running TTS servers and show health status
- Batch install (install all voices for a language)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/tts/model_manager.py` | Create | TTSModelManager class (catalog, download, delete) |
| `backend/tts/voice_catalog.json` | Create | Bundled catalog (~30 Kokoro + ~30 Piper voices) |
| `backend/server.py` | Modify | Add 6 new API endpoints |
| `frontends/neon/js/components/SettingsModal.js` | Modify | Add "TTS Models" tab |
| `frontends/neon/js/components/WaifuCreator.js` | Modify | Replace voice ID text input with picker dropdown |
| `frontends/neon/js/components/PersonaCreator.js` | Modify | Replace voice ID text input with picker dropdown |
| `frontends/neon/css/settings_modal.css` | Modify | Styles for model cards, progress bars |
| `.gitignore` | Modify | Add `backend/storage/tts_models/` |
