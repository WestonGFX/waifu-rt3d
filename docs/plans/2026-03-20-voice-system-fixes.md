# Voice System Fixes: ElevenLabs, TTS/STT Visibility, Provider Switching

## Context

The voice system has 5 issues:
1. **ElevenLabs API key save silently fails** — no error shown to user
2. **Only 2 TTS options visible** — edge-tts + webSpeech; kokoro/piper/chatterbox/elevenlabs hidden when helper offline or models not installed
3. **Missing `get_stt_providers()` in catalog.py** — STT endpoint 500s, no STT providers visible
4. **No STT provider switcher UI** — hardcoded to webSpeech, helperWhisper exists but unreachable
5. **No STT schema** — `STTProviderDescriptor` doesn't exist in schemas.py

Helper stays as-is (Python ML inference requires subprocess). Focus is on making all voice providers discoverable and errors visible.

## Step 1: Fix ElevenLabs save error visibility

**File: `src/components/settings/VoiceSettingsPanel.tsx`** (lines 142-151)

The `handleSaveElevenLabsKey` function has a try/finally but no catch — errors are silently swallowed. Add error state and display it.

```typescript
const [secretError, setSecretError] = useState<string | null>(null);

const handleSaveElevenLabsKey = async () => {
  if (!elevenLabsApiKey.trim()) return;
  setIsSavingSecret(true);
  setSecretError(null);
  try {
    await saveProviderSecret('elevenlabs', elevenLabsApiKey.trim());
    setElevenLabsApiKey('');
  } catch (err) {
    setSecretError(err instanceof Error ? err.message : 'Failed to save API key. Is the helper running?');
  } finally {
    setIsSavingSecret(false);
  }
};
```

Display `secretError` below the save button as a red-tinted error card.

## Step 2: Add `STTProviderDescriptor` schema

**File: `helper/app/schemas.py`**

Add a new Pydantic model mirroring `TTSProviderDescriptor`:

```python
class STTProviderDescriptor(AppModel):
    provider_id: str
    label: str
    local: bool
    requires_install: bool
    requires_api_key: bool
    available: bool
    install_state: str
    docs_url: str
```

## Step 3: Add `get_stt_providers()` to catalog.py

**File: `helper/app/catalog.py`**

Add the missing function that `stt.py` already imports. Return descriptors for:
- **webSpeech** — always available (browser-native), no install
- **helperWhisper** — available if faster-whisper is importable, requires install

```python
def get_stt_providers() -> list[STTProviderDescriptor]:
    whisper_available = False
    try:
        from .services.whisper_service import is_whisper_available
        whisper_available = is_whisper_available()
    except ImportError:
        pass

    return [
        STTProviderDescriptor(
            provider_id="webSpeech",
            label="Browser Speech Recognition",
            local=True, requires_install=False, requires_api_key=False,
            available=True,
            install_state="built-in",
            docs_url="https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition",
        ),
        STTProviderDescriptor(
            provider_id="helperWhisper",
            label="Whisper (Local)",
            local=True, requires_install=True, requires_api_key=False,
            available=whisper_available,
            install_state="installed" if whisper_available else "not-installed",
            docs_url="https://github.com/SYSTRAN/faster-whisper",
        ),
    ]
```

Also need to add `is_whisper_available()` to `whisper_service.py` if it doesn't exist.

## Step 4: Add STT provider fetching to frontend

**File: `src/services/helperClient.ts`**

Add a `fetchSTTProviders()` function:
```typescript
export async function fetchSTTProviders(): Promise<STTProviderDescriptor[]> {
  const res = await fetch(`${HELPER_BASE}/v1/stt/providers`);
  if (!res.ok) return [];
  return res.json();
}
```

**File: `src/types/companion.ts`**

Add `STTProviderDescriptor` type matching the schema.

**File: `src/context/CompanionContext.tsx`**

Add `sttProviders` to companion state. Fetch alongside `ttsProviders` in the helper data refresh cycle.

## Step 5: Add STT provider section to VoiceSettingsPanel

**File: `src/components/settings/VoiceSettingsPanel.tsx`**

Add a new section below the TTS configuration:

- **"Speech Recognition" section header**
- Show available STT providers as cards (webSpeech, helperWhisper)
- Primary/fallback selector (like TTS has)
- Status badges (available/needs-install/browser-only)
- For helperWhisper: show install button linking to Model Manager if not installed
- Wire selection to `appState.providerConfig.stt.primary`

## Step 6: Wire STT provider selection to actual usage

**File: `src/hooks/useSpeechRecognition.ts`** (line 29)

Currently hardcoded: `const provider = getSTTProvider('webSpeech');`

Change to read from provider config:
```typescript
const sttPrimary = appState.providerConfig.stt.primary;
const provider = getSTTProvider(sttPrimary);
```

**File: `src/hooks/useVoiceCall.ts`** (line 150)

Same fix — read from config instead of hardcoding `'webSpeech'`.

## Step 7: Show all TTS providers even when unavailable

**File: `src/components/settings/VoiceSettingsPanel.tsx`**

Currently filters out unavailable providers from the voice picker. Instead, show ALL providers but:
- Available ones: normal interactive cards
- Unavailable ones: grayed out with status reason ("Helper offline", "Not installed — click to install", "API key required")
- This makes the full range of options discoverable

## Files Modified

| File | Change |
|------|--------|
| `src/components/settings/VoiceSettingsPanel.tsx` | Error display for ElevenLabs, STT section, show unavailable providers |
| `helper/app/schemas.py` | Add `STTProviderDescriptor` |
| `helper/app/catalog.py` | Add `get_stt_providers()` |
| `helper/app/services/whisper_service.py` | Add `is_whisper_available()` if missing |
| `src/services/helperClient.ts` | Add `fetchSTTProviders()` |
| `src/types/companion.ts` | Add `STTProviderDescriptor` type |
| `src/context/CompanionContext.tsx` | Add `sttProviders` state + fetch |
| `src/hooks/useSpeechRecognition.ts` | Read STT provider from config |
| `src/hooks/useVoiceCall.ts` | Read STT provider from config |

## Verification

```bash
npx tsc --noEmit              # 0 errors
npx vitest run                # No regressions
cd helper && uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
curl http://127.0.0.1:8765/v1/stt/providers   # Should return 2 providers
npm run dev                   # Visual: VoiceSettingsPanel shows STT section + all TTS providers
```

Chrome automation checks:
- Open Settings → Voice tab
- Verify STT provider section visible with webSpeech + Whisper options
- Verify all TTS providers shown (available + unavailable with status)
- Paste a bad ElevenLabs key → verify error message appears
- Paste a good key → verify it saves and ElevenLabs appears as available
