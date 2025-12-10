# ASR Integration - Complete Guide

**Feature:** Automatic Speech Recognition (ASR)
**Status:** ✅ Implemented (v5.30)
**Module:** `backend/asr/`
**Providers:** 3 (Browser API, Whisper API, Whisper.cpp Local)

---

## Overview

The ASR (Automatic Speech Recognition) system enables voice input for your waifu companion. Users can speak instead of type, and their speech is automatically converted to text for processing by the LLM.

**Key Features:**
- 🎤 3 ASR providers supported
- 🌐 Browser-based (no server needed)
- ☁️ Cloud API (OpenAI Whisper)
- 💻 Local self-hosted (Whisper.cpp)
- 🔄 Async processing
- 🎯 Configurable language support

---

## Architecture

### Adapter Pattern

Like LLM and TTS, ASR uses the adapter pattern:

```
backend/asr/
├── __init__.py           # Module initialization
├── registry.py           # Factory for ASR adapters
└── adapters/
    ├── base.py          # Abstract base class (ASRAdapter)
    ├── whisper_api.py   # OpenAI Whisper API (cloud)
    └── whisper_local.py # Whisper.cpp (local)
```

**Benefits:**
- Easy provider switching
- Consistent interface
- Independent testing
- Provider-specific optimizations

---

## Supported Providers

### 1. Browser API (Frontend) ⭐ DEFAULT

**Status:** ✅ Fully implemented (frontend)
**Type:** Built-in browser API
**Quality:** ⭐⭐⭐ Good
**Speed:** ⭐⭐⭐⭐⭐ Real-time
**Cost:** Free
**Privacy:** ✅ Depends on browser (Chrome sends to Google)

**Setup:**
1. No backend configuration needed
2. Works in modern browsers (Chrome, Edge, Safari)
3. User must grant microphone permission
4. Frontend handles everything

**Configuration:**
```json
{
  "asr": {
    "enabled": false,
    "provider": "browser"
  }
}
```

**Frontend Implementation:**
```javascript
// In index_v2.html
const recognition = new webkitSpeechRecognition();
recognition.continuous = false;
recognition.lang = 'en-US';
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  sendMessage(transcript);
};
```

**Pros:**
- ✅ Zero setup required
- ✅ Real-time streaming
- ✅ No API costs
- ✅ Works offline (Safari)
- ✅ Low latency

**Cons:**
- ❌ Browser compatibility varies
- ❌ Quality depends on browser
- ❌ Privacy concerns (Chrome sends to Google)
- ❌ Limited language support

---

### 2. OpenAI Whisper API (Cloud) ⭐

**Status:** ✅ Fully implemented
**Type:** Cloud API
**Quality:** ⭐⭐⭐⭐⭐ Excellent
**Speed:** ⭐⭐⭐ Medium (1-3 seconds)
**Cost:** $0.006 per minute
**Privacy:** ⚠️ Sends audio to OpenAI

**Setup:**
1. Get OpenAI API key: https://platform.openai.com/api-keys
2. Configure in app.json
3. Enable ASR in config

**Configuration:**
```json
{
  "asr": {
    "enabled": true,
    "provider": "whisper_api",
    "endpoint": "https://api.openai.com/v1",
    "api_key": "sk-...",
    "model": "whisper-1",
    "language": "en"
  }
}
```

**Supported Languages:**
- English, Spanish, French, German, Italian
- Japanese, Korean, Chinese, Russian
- 50+ languages total

**Pros:**
- ✅ Highest accuracy
- ✅ Best multilingual support
- ✅ Handles noisy audio well
- ✅ No local setup needed
- ✅ Punctuation included

**Cons:**
- ❌ Requires internet
- ❌ API costs ($0.006/min)
- ❌ Sends audio to cloud
- ❌ Slower than browser

---

### 3. Whisper.cpp (Local) ⭐

**Status:** ✅ Fully implemented
**Type:** Self-hosted
**Quality:** ⭐⭐⭐⭐ Very Good
**Speed:** ⭐⭐⭐⭐ Fast (depends on hardware)
**Cost:** Free
**Privacy:** ✅ Complete (local only)

**Setup:**

1. **Clone Whisper.cpp:**
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
```

2. **Build:**
```bash
make
# For GPU support:
# make CUDA=1
```

3. **Download Model:**
```bash
bash ./models/download-ggml-model.sh base.en
# Options: tiny, base, small, medium, large
```

4. **Start Server:**
```bash
./server -m models/ggml-base.en.bin -l en -p 8080
```

**Configuration:**
```json
{
  "asr": {
    "enabled": true,
    "provider": "whisper_local",
    "endpoint": "http://127.0.0.1:8080",
    "api_key": "",
    "model": "base.en",
    "language": "en"
  }
}
```

**Model Sizes:**
- `tiny` - 75 MB, fastest, lowest accuracy
- `base` - 142 MB, good balance
- `small` - 466 MB, better accuracy
- `medium` - 1.5 GB, high accuracy
- `large` - 3 GB, best accuracy (slow)

**Pros:**
- ✅ Completely offline
- ✅ No API costs
- ✅ Full privacy
- ✅ GPU acceleration available
- ✅ Good accuracy

**Cons:**
- ❌ Requires setup
- ❌ Needs disk space (75 MB - 3 GB)
- ❌ CPU/GPU intensive
- ❌ Slower than browser API

---

## Provider Comparison

| Feature | Browser API | Whisper API | Whisper.cpp |
|---------|------------|-------------|-------------|
| **Quality** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Speed** | Real-time | 1-3 sec | 1-5 sec |
| **Cost** | Free | $0.006/min | Free |
| **Privacy** | Varies | Cloud | Local |
| **Setup** | None | Easy | Complex |
| **Best For** | Quick chat | Production | Privacy |

---

## Configuration

### Main Config: `backend/config/app.json`

```json
{
  "asr": {
    "enabled": false,
    "provider": "browser",
    "endpoint": "",
    "api_key": "",
    "model": "whisper-1",
    "language": "en"
  }
}
```

**Options:**
- `enabled`: Enable backend ASR processing
- `provider`: Which adapter to use (browser, whisper_api, whisper_local)
- `endpoint`: API or server URL
- `api_key`: Authentication (Whisper API only)
- `model`: Model name/size
- `language`: Target language (ISO 639-1 code)

**Provider-Specific Defaults:**
- Browser: No backend config needed
- Whisper API: `endpoint = "https://api.openai.com/v1"`
- Whisper Local: `endpoint = "http://127.0.0.1:8080"`

---

## Code Structure

### Base Adapter (`backend/asr/adapters/base.py`)

```python
class ASRAdapter(ABC):
    """Base class for ASR adapters."""

    @abstractmethod
    async def transcribe(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None
    ) -> Dict:
        """
        Transcribe audio to text.

        Args:
            audio_bytes: Audio file bytes (webm, mp3, wav, etc.)
            language: Target language code (e.g., "en", "es")

        Returns:
            {
              "text": str,          # Transcribed text
              "language": str,      # Detected/used language
              "confidence": float,  # 0.0-1.0 (if available)
              "duration": float     # Audio duration in seconds
            }
        """
        pass
```

### Registry (`backend/asr/registry.py`)

```python
from .adapters.whisper_api import WhisperAPIAdapter
from .adapters.whisper_local import WhisperLocalAdapter

ASR_ADAPTERS = {
    "whisper_api": WhisperAPIAdapter,
    "whisper_local": WhisperLocalAdapter,
}

def get_asr_adapter(config: Dict) -> Optional[ASRAdapter]:
    """Factory function to get ASR adapter."""
    asr_cfg = config.get("asr", {})
    if not asr_cfg.get("enabled", False):
        return None

    provider = asr_cfg.get("provider", "browser")
    if provider == "browser":
        return None  # Handled by frontend

    adapter_class = ASR_ADAPTERS.get(provider)
    if not adapter_class:
        raise ValueError(f"Unknown ASR provider: {provider}")

    return adapter_class()
```

---

## API Integration

### ASR Endpoint

**Endpoint:** `POST /api/asr`

**Request:** `multipart/form-data`
```
file: <audio binary data>
language: "en" (optional)
```

**Supported Audio Formats:**
- WebM (browser recording)
- MP3
- WAV
- M4A
- OGG

**Response:**
```json
{
  "text": "Hello, how are you doing today?",
  "language": "en",
  "confidence": 0.95
}
```

**Error (ASR not enabled):**
```json
{
  "detail": "ASR not enabled in configuration"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8000/api/asr \
  -F "file=@recording.webm" \
  -F "language=en"
```

**JavaScript Example:**
```javascript
// Record audio
const recorder = new MediaRecorder(stream);
recorder.ondataavailable = async (e) => {
  const formData = new FormData();
  formData.append('file', e.data, 'recording.webm');

  const response = await fetch('/api/asr', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  console.log('Transcribed:', result.text);
};
```

---

## Frontend Integration

### Microphone Button (`index_v2.html`)

**HTML:**
```html
<button id="micButton" title="Voice Input">🎤</button>
```

**JavaScript:**
```javascript
let recognition = null;
let isRecording = false;

// Initialize Speech Recognition (Browser API)
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('userInput').value = transcript;
    sendMessage(); // Auto-send or wait for user confirmation
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    alert('Voice input error: ' + event.error);
  };
}

// Microphone button click
document.getElementById('micButton').addEventListener('click', () => {
  if (!recognition) {
    alert('Voice input not supported in this browser');
    return;
  }

  if (isRecording) {
    recognition.stop();
    micButton.textContent = '🎤';
    isRecording = false;
  } else {
    recognition.start();
    micButton.textContent = '🔴';
    isRecording = true;
  }
});
```

---

## Usage Flows

### Flow 1: Browser ASR (Simple)

1. User clicks microphone button
2. Browser requests mic permission
3. User speaks
4. Browser transcribes in real-time
5. Text appears in input field
6. User sends message

**Pros:** Fast, no backend needed

### Flow 2: Backend ASR (High Quality)

1. User clicks microphone button
2. Frontend records audio (MediaRecorder)
3. Audio uploaded to `/api/asr`
4. Backend transcribes via Whisper
5. Text returned to frontend
6. User sends message

**Pros:** Better accuracy, offline capable (local Whisper)

### Flow 3: Hybrid (Best UX)

1. Start with browser ASR (fast feedback)
2. If confidence low, fallback to backend
3. Show "Processing..." while backend transcribes
4. Replace with higher-quality transcription

---

## Language Support

### Whisper API Languages (50+)
- Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian
- Bosnian, Bulgarian, Catalan, Chinese, Croatian
- Czech, Danish, Dutch, **English**, Estonian
- Finnish, French, Galician, German, Greek
- Hebrew, Hindi, Hungarian, Icelandic, Indonesian
- Italian, Japanese, Kannada, Kazakh, Korean
- Latvian, Lithuanian, Macedonian, Malay, Marathi
- Maori, Nepali, Norwegian, Persian, Polish
- Portuguese, Romanian, Russian, Serbian, Slovak
- Slovenian, Spanish, Swahili, Swedish, Tagalog
- Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh

**Usage:**
```json
{"language": "ja"}  // Japanese
{"language": "es"}  // Spanish
{"language": "fr"}  // French
```

---

## Troubleshooting

### Issue: "ASR not enabled in configuration"

**Cause:** ASR disabled in app.json
**Solution:**
```json
{
  "asr": {
    "enabled": true,
    "provider": "whisper_api"
  }
}
```

### Issue: "Microphone permission denied"

**Cause:** User blocked browser mic access
**Solution:**
1. Click lock icon in browser address bar
2. Allow microphone permission
3. Refresh page

### Issue: "Speech recognition not supported"

**Cause:** Browser doesn't support Web Speech API
**Solution:**
- Use Chrome/Edge (best support)
- Or configure backend ASR (Whisper)

### Issue: "Whisper API 401 Unauthorized"

**Cause:** Invalid or missing API key
**Solution:**
1. Get key from https://platform.openai.com/api-keys
2. Update `asr.api_key` in app.json
3. Restart server

### Issue: "Whisper.cpp connection refused"

**Cause:** Local Whisper server not running
**Solution:**
```bash
cd whisper.cpp
./server -m models/ggml-base.en.bin -l en -p 8080
```

### Issue: "Audio format not supported"

**Cause:** Unsupported audio encoding
**Solution:**
- Use WebM (browser default)
- Or convert to MP3/WAV before upload
- Check Whisper.cpp supported formats

---

## Performance Tips

### For Speed:
1. **Use Browser API** - Real-time, zero latency
2. **Use `tiny` model** - Whisper.cpp tiny model is very fast
3. **Enable GPU** - 10x faster with CUDA/Metal
4. **Use English-only model** - `base.en` vs `base`

### For Accuracy:
1. **Use Whisper API** - Highest accuracy
2. **Use `large` model** - Best but slow (local)
3. **Reduce background noise** - Clean audio = better results
4. **Use headset mic** - Better than laptop mic

### For Privacy:
1. **Use Browser API (Safari)** - Processes locally
2. **Use Whisper.cpp** - Completely offline
3. **Avoid Whisper API** - Sends audio to OpenAI

---

## Adding New Provider

### Step 1: Create Adapter

**File:** `backend/asr/adapters/your_provider.py`

```python
from .base import ASRAdapter
from typing import Dict, Optional
import requests

class YourProviderAdapter(ASRAdapter):
    async def transcribe(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None
    ) -> Dict:
        try:
            # Make API request
            response = requests.post(
                f"{endpoint}/transcribe",
                files={"audio": audio_bytes},
                data={"language": language or "en"},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30
            )
            response.raise_for_status()

            result = response.json()
            return {
                "text": result["text"],
                "language": result.get("language", language),
                "confidence": result.get("confidence", 0.0),
                "duration": result.get("duration", 0.0)
            }
        except Exception as e:
            raise Exception(f"Transcription failed: {str(e)}")
```

### Step 2: Register

**File:** `backend/asr/registry.py`

```python
from .adapters.your_provider import YourProviderAdapter

ASR_ADAPTERS = {
    # ... existing ...
    "your_provider": YourProviderAdapter,
}
```

### Step 3: Configure

```json
{
  "asr": {
    "enabled": true,
    "provider": "your_provider",
    "endpoint": "https://api.yourprovider.com/v1",
    "api_key": "your-key",
    "model": "model-name",
    "language": "en"
  }
}
```

---

## Future Enhancements

**Planned:**
- [ ] Voice Activity Detection (VAD)
- [ ] Real-time streaming transcription
- [ ] Speaker diarization (multiple speakers)
- [ ] Automatic language detection
- [ ] Transcript editing UI
- [ ] Voice command shortcuts
- [ ] Noise reduction preprocessing
- [ ] Custom vocabulary injection

---

## Related Documentation

- **Chat Integration:** `docs/api/API_REFERENCE.md` (ASR section)
- **Frontend UI:** `frontend/index_v2.html` (microphone button)
- **Whisper Official:** https://github.com/openai/whisper
- **Whisper.cpp:** https://github.com/ggerganov/whisper.cpp
- **Web Speech API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

---

## Quick Reference

**Files:**
- `backend/asr/registry.py` - Adapter factory
- `backend/asr/adapters/*.py` - Provider implementations
- `backend/server.py:335` - ASR endpoint
- `backend/config/app.json` - Configuration
- `frontend/index_v2.html` - Microphone UI

**Endpoint:**
- `POST /api/asr` - Transcribe audio file

**Config Keys:**
- `asr.enabled` - Enable/disable ASR
- `asr.provider` - Which adapter (browser, whisper_api, whisper_local)
- `asr.endpoint` - API/server URL
- `asr.api_key` - Authentication
- `asr.model` - Model name/size
- `asr.language` - Target language

**Browser Support:**
- Chrome/Edge: ✅ Excellent
- Safari: ✅ Good (local processing)
- Firefox: ⚠️ Limited
- Mobile: ✅ Works on Chrome/Safari iOS

---

**Last Updated:** 2025-11-25
**Version:** v5.30
**Status:** Production Ready ✅
