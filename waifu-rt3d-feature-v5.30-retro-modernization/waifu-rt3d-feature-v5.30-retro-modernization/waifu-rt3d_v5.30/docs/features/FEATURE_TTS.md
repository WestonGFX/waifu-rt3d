# TTS Integration - Complete Guide

**Feature:** Text-to-Speech Integration
**Status:** ✅ Implemented (v5.29)
**Module:** `backend/tts/`
**Providers:** 4 (XTTS Server, Piper Local, ElevenLabs, Fish Audio)

---

## Overview

The TTS (Text-to-Speech) system converts AI text responses into natural-sounding voice audio, giving your waifu companion a voice. Supports multiple providers with fallback chains and flexible voice configuration.

**Key Features:**
- 🎤 4 TTS providers supported
- 🔄 Automatic fallback chain
- 🎨 Customizable voice selection
- 📁 Audio file management
- ⚙️ Format and quality options

---

## Architecture

### Adapter Pattern

Like the LLM system, TTS uses adapters:

```
backend/tts/
├── registry.py            # Factory for TTS clients
└── adapters/
    ├── base.py           # Abstract base class (TTSAdapter)
    ├── xtts_server.py    # XTTS Server (local)
    ├── piper_local.py    # Piper (local, fast)
    ├── elevenlabs.py     # ElevenLabs (cloud, premium)
    └── fish_audio.py     # Fish Audio (cloud, affordable)
```

**Benefits:**
- Easy provider switching
- Fallback support
- Consistent interface
- Independent testing

---

## Supported Providers

### 1. Fish Audio (Cloud) ⭐ DEFAULT

**Status:** ✅ Fully implemented
**Type:** Cloud API
**Quality:** ⭐⭐⭐⭐ Excellent
**Speed:** ⭐⭐⭐⭐ Fast
**Cost:** $ Affordable
**Privacy:** ⚠️ Sends text to cloud

**Setup:**
1. Sign up: https://fish.audio/
2. Get API key
3. Choose voice ID from library
4. Configure in app.json

**Configuration:**
```json
{
  "tts": {
    "provider": "fish_audio",
    "endpoint": "https://api.fish.audio/v1",
    "api_key": "YOUR_KEY_HERE",
    "voice_id": "8ef4a238714b45718ce04243307c57a7",
    "format": "mp3",
    "sample_rate": 24000
  }
}
```

**Pros:**
- ✅ High quality voices
- ✅ Fast generation (~1-2 seconds)
- ✅ Many voice options
- ✅ Affordable pricing
- ✅ No local setup needed

**Cons:**
- ❌ Requires internet
- ❌ Sends data to cloud
- ❌ API costs

---

### 2. XTTS Server (Local)

**Status:** ✅ Fully implemented
**Type:** Self-hosted
**Quality:** ⭐⭐⭐⭐⭐ Excellent (voice cloning)
**Speed:** ⭐⭐ Slow (5-10 seconds)
**Cost:** Free
**Privacy:** ✅ Complete (local only)

**Setup:**
1. Clone XTTS: `git clone https://github.com/coqui-ai/TTS`
2. Install: `pip install TTS`
3. Start server: `python -m TTS.server.server`
4. Default port: 5002

**Configuration:**
```json
{
  "tts": {
    "provider": "xtts_server",
    "endpoint": "http://127.0.0.1:5002",
    "voice_id": "",
    "format": "wav",
    "sample_rate": 24000
  }
}
```

**Pros:**
- ✅ Voice cloning (use any voice sample)
- ✅ No API costs
- ✅ Complete privacy
- ✅ Works offline
- ✅ High quality output

**Cons:**
- ❌ Slow generation
- ❌ Requires GPU (CUDA)
- ❌ Complex setup
- ❌ High memory usage (4GB+)

---

### 3. Piper Local (Local)

**Status:** ✅ Fully implemented
**Type:** Self-hosted
**Quality:** ⭐⭐⭐ Good
**Speed:** ⭐⭐⭐⭐⭐ Very Fast (<1 second)
**Cost:** Free
**Privacy:** ✅ Complete (local only)

**Setup:**
1. Download: https://github.com/rhasspy/piper
2. Download voice model
3. Start server or use CLI
4. Default port: 5000

**Configuration:**
```json
{
  "tts": {
    "provider": "piper_local",
    "endpoint": "http://127.0.0.1:5000",
    "voice_id": "en_US-lessac-medium",
    "format": "wav",
    "sample_rate": 22050
  }
}
```

**Pros:**
- ✅ Extremely fast
- ✅ Low resource usage (runs on CPU)
- ✅ No API costs
- ✅ Privacy-focused
- ✅ Multiple languages

**Cons:**
- ❌ Lower quality than XTTS
- ❌ Robotic voice
- ❌ Limited voice variety
- ❌ Less natural intonation

---

### 4. ElevenLabs (Cloud)

**Status:** ✅ Fully implemented
**Type:** Cloud API
**Quality:** ⭐⭐⭐⭐⭐ Best-in-class
**Speed:** ⭐⭐⭐⭐ Fast
**Cost:** $$$ Premium
**Privacy:** ⚠️ Sends text to cloud

**Setup:**
1. Sign up: https://elevenlabs.io/
2. Get API key
3. Choose or create voice
4. Configure in app.json

**Configuration:**
```json
{
  "tts": {
    "provider": "elevenlabs",
    "endpoint": "https://api.elevenlabs.io/v1",
    "api_key": "YOUR_KEY_HERE",
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "format": "mp3_44100_128",
    "sample_rate": 44100
  }
}
```

**Pros:**
- ✅ Highest quality
- ✅ Most natural sounding
- ✅ Voice cloning available
- ✅ Emotion and emphasis control
- ✅ Multiple languages

**Cons:**
- ❌ Expensive ($5-$300/month)
- ❌ Requires internet
- ❌ Sends data to cloud
- ❌ Character limits on free tier

---

## Provider Comparison

| Feature | Fish Audio | XTTS | Piper | ElevenLabs |
|---------|-----------|------|-------|------------|
| **Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Speed** | Fast | Slow | Fastest | Fast |
| **Cost** | $ | Free | Free | $$$ |
| **Privacy** | Cloud | Local | Local | Cloud |
| **Setup** | Easy | Hard | Medium | Easy |
| **Best For** | General use | Voice clone | Speed | Premium |

---

## Configuration

### Main Config: `backend/config/app.json`

```json
{
  "tts": {
    "provider": "fish_audio",
    "endpoint": "https://api.fish.audio/v1",
    "api_key": "",
    "voice_id": "8ef4a238714b45718ce04243307c57a7",
    "format": "mp3",
    "sample_rate": 24000,
    "fallback_chain": [
      "piper_local",
      "xtts_server",
      "elevenlabs"
    ]
  }
}
```

**Options:**
- `provider`: Primary TTS provider
- `endpoint`: API or server URL
- `api_key`: Authentication (if needed)
- `voice_id`: Voice selection
- `format`: Audio format (mp3, wav, etc.)
- `sample_rate`: Audio quality (Hz)
- `fallback_chain`: Backup providers if primary fails

---

## Fallback Chain

### How It Works

If primary provider fails, system tries fallback providers in order:

1. Try `fish_audio` (primary)
2. If fails → Try `piper_local` (fallback 1)
3. If fails → Try `xtts_server` (fallback 2)
4. If fails → Try `elevenlabs` (fallback 3)
5. If all fail → Return error

**Example Failure Scenarios:**
- Fish Audio API down → Use Piper
- Piper not installed → Use XTTS
- XTTS server offline → Use ElevenLabs
- All offline → Chat works without voice

**Configuration:**
```json
{
  "fallback_chain": ["piper_local", "xtts_server"]
}
```

---

## Code Structure

### Base Adapter (`backend/tts/adapters/base.py`)

```python
class TTSAdapter(ABC):
    """Base class for TTS adapters."""

    @abstractmethod
    def speak(self, text: str, config: dict) -> dict:
        """
        Convert text to speech.

        Args:
            text: Text to synthesize
            config: Provider-specific settings

        Returns:
            {
              "ok": bool,
              "filename": str,      # Audio file name
              "path": str,          # Full file path
              "error": str,         # If failed
              "meta": dict          # Provider metadata
            }
        """
        pass
```

### Registry (`backend/tts/registry.py`)

```python
TTS_ADAPTERS = {
    "fish_audio": FishAudioAdapter,
    "xtts_server": XTTSServerAdapter,
    "piper_local": PiperLocalAdapter,
    "elevenlabs": ElevenLabsAdapter,
}

def get_tts(config: dict) -> TTSAdapter:
    """Factory function to get TTS adapter."""
    provider = config.get("tts", {}).get("provider", "fish_audio")
    adapter_class = TTS_ADAPTERS.get(provider)
    return adapter_class()
```

---

## API Integration

### Chat with Voice

**Endpoint:** `POST /api/chat?session_id=1`

**Request:**
```json
{
  "text": "Tell me a story",
  "speak": true
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "Once upon a time...",
  "audio": "/files/audio/response_1732425678.mp3",
  "session_id": 1
}
```

**Audio URL:** `http://localhost:8000/files/audio/response_1732425678.mp3`

### Standalone TTS

**Endpoint:** `POST /api/tts`

**Request:**
```json
{
  "text": "Hello world!",
  "voice_id": "custom-voice-id",
  "format": "wav"
}
```

**Response:**
```json
{
  "ok": true,
  "url": "/files/audio/tts_1732425690.wav",
  "meta": {
    "provider": "fish_audio",
    "duration": 1.5,
    "size": 52480
  }
}
```

---

## Audio File Management

### Storage Location

**Path:** `backend/storage/audio/`

**Naming:** `response_<timestamp>.mp3` or `tts_<timestamp>.mp3`

**Example:**
```
backend/storage/audio/
├── response_1732425678.mp3
├── response_1732425690.mp3
└── tts_1732425700.wav
```

### Cleanup

Currently: Manual (files accumulate)

**Planned:** Automatic cleanup after N days or size limit

**Manual cleanup:**
```bash
# Delete audio files older than 7 days
find backend/storage/audio/ -name "*.mp3" -mtime +7 -delete
```

---

## Voice Selection

### Fish Audio

**Find voices:** https://fish.audio/voices

**Example voice IDs:**
- `8ef4a238714b45718ce04243307c57a7` - Female, young, energetic
- `54a5170264694bfc8e9ad98df7bd89c3` - Female, mature, calm
- `e3de5e6f3d6e451f8b9a1c7f8e9a6b5c` - Male, deep, professional

### ElevenLabs

**Find voices:** https://elevenlabs.io/voice-library

**Pre-made voices:**
- `21m00Tcm4TlvDq8ikWAM` - Rachel (female)
- `AZnzlk1XvdvUeBnXmlld` - Domi (female)
- `EXAVITQu4vr4xnSDxMaL` - Bella (female)

**Custom voices:** Clone your own voice or upload sample

### XTTS

**Voice cloning:**
1. Prepare audio sample (10-30 seconds, clear speech)
2. Upload to XTTS server
3. Use sample path as voice_id

### Piper

**Available voices:** https://github.com/rhasspy/piper/blob/master/VOICES.md

**Examples:**
- `en_US-lessac-medium`
- `en_GB-alba-medium`
- `en_US-amy-medium`

---

## Troubleshooting

### Issue: "TTS failed: Connection refused"

**Cause:** Local TTS server not running

**Solution:**
1. Check if server is running (XTTS/Piper)
2. Start server: `python -m TTS.server.server`
3. Verify endpoint URL and port

### Issue: "Invalid voice_id"

**Cause:** Voice doesn't exist for provider

**Solution:**
- Check voice ID from provider's voice library
- For Fish Audio: Browse https://fish.audio/voices
- For ElevenLabs: Check dashboard

### Issue: "Audio file not found"

**Cause:** File path incorrect or file deleted

**Solution:**
- Check `backend/storage/audio/` exists
- Verify file permissions
- Check disk space

### Issue: "Slow TTS generation"

**Cause:** Using XTTS without GPU

**Solution:**
- Switch to Piper (faster, lower quality)
- Switch to Fish Audio (cloud, fast)
- Enable GPU for XTTS

---

## Performance Tips

1. **Use Piper for speed:** Fastest local option
2. **Use Fish Audio for quality:** Best balance
3. **Enable GPU for XTTS:** 5-10x faster
4. **Cache responses:** Store common phrases
5. **Reduce sample rate:** 16000 vs 44100 (smaller files)

---

## Adding New Provider

### Step 1: Create Adapter

**File:** `backend/tts/adapters/your_provider.py`

```python
from .base import TTSAdapter
import requests
from pathlib import Path
import time

class YourProviderAdapter(TTSAdapter):
    def speak(self, text: str, config: dict) -> dict:
        try:
            # Make API request
            response = requests.post(
                f"{config['endpoint']}/synthesize",
                json={"text": text, "voice": config["voice_id"]},
                headers={"Authorization": f"Bearer {config['api_key']}"},
                timeout=30
            )
            response.raise_for_status()

            # Save audio file
            audio_dir = Path(__file__).parents[3] / "backend" / "storage" / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)
            filename = f"tts_{int(time.time())}.mp3"
            filepath = audio_dir / filename

            filepath.write_bytes(response.content)

            return {
                "ok": True,
                "filename": filename,
                "path": str(filepath)
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}
```

### Step 2: Register

**File:** `backend/tts/registry.py`

```python
from .adapters.your_provider import YourProviderAdapter

TTS_ADAPTERS = {
    # ... existing ...
    "your_provider": YourProviderAdapter,
}
```

### Step 3: Configure

```json
{
  "tts": {
    "provider": "your_provider",
    "endpoint": "https://api.yourprovider.com/v1",
    "api_key": "your-key",
    "voice_id": "voice-123"
  }
}
```

---

## Future Enhancements

**Planned:**
- [ ] Voice emotion control
- [ ] Speaking rate adjustment
- [ ] Pitch control
- [ ] SSML support (pronunciation tags)
- [ ] Voice mixing (multiple characters)
- [ ] Real-time streaming TTS
- [ ] Audio caching system
- [ ] Automatic cleanup

---

## Related Documentation

- **Character Voices:** `docs/features/FEATURE_CHARACTERS.md`
- **Vocabulary System:** `docs/guides/VOCABULARY_INTEGRATION.md`
- **API Reference:** `docs/api/API_REFERENCE.md`
- **Troubleshooting:** `docs/guides/TROUBLESHOOTING.md`

---

## Quick Reference

**Files:**
- `backend/tts/registry.py` - Adapter factory
- `backend/tts/adapters/*.py` - Provider implementations
- `backend/config/app.json` - Configuration
- `backend/storage/audio/` - Generated audio files

**Endpoints:**
- `POST /api/chat` - Chat with optional TTS
- `POST /api/tts` - Standalone TTS

**Config Keys:**
- `tts.provider` - Which adapter to use
- `tts.endpoint` - API/server URL
- `tts.api_key` - Authentication
- `tts.voice_id` - Voice selection
- `tts.format` - Audio format (mp3/wav)
- `tts.sample_rate` - Quality (Hz)
- `tts.fallback_chain` - Backup providers

---

**Last Updated:** 2025-11-24
**Version:** v5.30
**Status:** Production Ready ✅
