# Voice Preview Sweep — 2026-05-07

**Backend:** `http://localhost:8080`  
**Method:** POST `/api/tts/preview` with each installed voice  
**Test phrase:** "Hello! I am a companion. How are you feeling today?"  
**Total voices:** 15

---

## Results Summary

| Voice ID | Provider | Status | Latency | Notes |
|----------|----------|--------|---------|-------|
| `en-US-AriaNeural` | edge-tts | ✅ Working | 1.35s | Clear, natural American English |
| `en-US-JennyNeural` | edge-tts | ✅ Working | 1.44s | Used by Dae by default |
| `en-US-EmmaNeural` | edge-tts | ✅ Working | 8.38s | **Slow** — 8s latency unacceptable for real-time |
| `en-GB-SoniaNeural` | edge-tts | ✅ Working | 2.75s | British accent, warm |
| `ja-JP-NanamiNeural` | edge-tts | ✅ Working | 1.68s | Japanese TTS, good for anime characters |
| `es-ES-ElviraNeural` | edge-tts | ✅ Working | 1.10s | Spanish |
| `fr-FR-DeniseNeural` | edge-tts | ✅ Working | 1.18s | French |
| `de-DE-KatjaNeural` | edge-tts | ✅ Working | 1.60s | German |
| `en-US-AmberNeural` | edge-tts | ❌ Timeout | 15s+ | Network timeout — Microsoft server issue |
| `en-US-AnaNeural` | edge-tts | ❌ Timeout | 15s+ | Network timeout — same issue |
| `piper/en_US-amy-medium` | piper | ❌ Routing bug | 5.20s | Backend passes piper voice_id to edge-tts — crashes |
| `piper/en_GB-jenny_dioco-medium` | piper | ❌ Routing bug | 0.86s | Same routing bug |
| `af_claire` | kitten | ❌ Server down | 0.14s | `kittentts-server --port 8891` not running |
| `af_luna` | kitten | ❌ Server down | 0.01s | Same — KittenTTS server required |
| `v2/en_speaker_6` | bark | ❌ Server down | 0.01s | `bark-server --port 8893` not running |

**Working: 8/15 (53%)** | **Broken: 7/15 (47%)**

---

## Bug Details

### BUG-001 — Piper voices route to edge-tts (routing bug)
**Error:** `edge-tts failed: ValueError: Invalid voice 'piper/en_US-amy-medium'`  
**Root cause:** The `/api/tts/preview` endpoint dispatches to edge-tts regardless of `provider` param when provider is `"piper"`. The piper voice_id format (`piper/en_US-amy-medium`) gets passed to edge-tts which rejects it.  
**Impact:** 2 Piper voices completely broken in preview. Piper voices are the only locally-installed, offline-capable TTS voices — this affects the primary offline TTS path.  
**Fix:** Check the TTS preview handler routing logic for piper provider dispatch.

### BUG-002 — edge-tts AmberNeural and AnaNeural timeout
**Error:** HTTP 000 (no response), 15s timeout  
**Root cause:** These two specific Microsoft edge-tts voices appear to be unavailable or rate-limited on Microsoft's servers. The other 6 edge-tts voices work fine.  
**Impact:** 2 voices listed in the gallery but non-functional.  
**Fix:** Either remove these from the catalog or add timeout handling with graceful fallback.

### BUG-003 — KittenTTS and Bark servers not running
**Error:** "Cannot connect to KittenTTS server" / "Cannot connect to Bark server"  
**Root cause:** These require separate server processes. Not started.  
**af_claire, af_luna** — ElevenLabs-style voices via KittenTTS  
**v2/en_speaker_6** — Bark neural TTS  
**Fix:** Not a code bug — expected behavior. Document how to start these.

---

## Recommendations

1. **Fix piper routing** (P1) — Piper is the only offline TTS path. The preview endpoint should handle `provider=piper` correctly.
2. **Remove/flag non-functional voices** — AmberNeural and AnaNeural should be marked unavailable or removed from the gallery until Microsoft fixes their endpoint.
3. **Best voices for character assignment:**
   - Japanese characters → `ja-JP-NanamiNeural` (1.68s, clean)
   - Western characters → `en-US-AriaNeural` (1.35s, most natural)
   - UK aesthetic → `en-GB-SoniaNeural` (2.75s, warm British)
   - Default fallback → `en-US-JennyNeural` (1.44s, used by Dae)
4. **EmmaNeural is too slow** (8.38s) — below the 3s acceptable threshold for companion use. Should be de-prioritized or removed.

---

## Voice-to-Character Matching Suggestions

| Character | Current voice_id | Suggested voice | Reason |
|-----------|-----------------|-----------------|--------|
| Rin (Akane) | rin_v1 (broken) | en-US-AriaNeural | Warm, natural, friendly |
| Tsundere (Raine) | raine_v1 (broken) | en-US-AriaNeural + pitch ↑ | Same base, adjust pitch |
| Ayane (Yuki) | ayane_v1 (broken) | en-US-EmmaNeural | Calm (if latency fixed) |
| Genki (Kitsune) | kitsune_v1 (broken) | en-US-AriaNeural + rate ↑ | Fast-talking genki |
| Hana (Momoka) | hana_v1 (broken) | en-GB-SoniaNeural | Mature, warm |
| Luna (Tsukimi) | luna_v1 (broken) | ja-JP-NanamiNeural | Moon/lunar — Japanese fits |
| Dae | en-US-JennyNeural | en-US-JennyNeural | Already set, keep it |

All characters 2-13 have broken voice_ids (`raine_v1`, `ayane_v1`, etc.) that don't map to any installed provider.

