# Audio, Voice & Music AI Techniques for Waifu-RT3D

**Date:** 2026-03-25
**Topic:** Voice cloning, singing synthesis, music generation, SFX, lip sync, VAD, noise suppression, ASR alternatives, expressive TTS, audio fingerprinting
**Why:** Identify 8-12 actionable local-inference audio/voice features for the companion platform, building on existing Kokoro TTS + full-duplex voice pipeline.

---

## Current App Audio Stack (Baseline)

| Component | Implementation | Notes |
|-----------|---------------|-------|
| TTS | Kokoro-82M via `backend/tts/adapters/kokoro.py` | 82M params, CPU real-time, 16-emotion VoiceModulator |
| ASR | faster-whisper (tiny.en) via `backend/asr/adapters/faster_whisper.py` | ONNX, ~39M params |
| VAD | Energy-based RMS threshold in `backend/voice/duplex.py` | Simple energy gate, no ML model |
| Voice pipeline | Full-duplex WebSocket, barge-in, MediaRecorder | `backend/voice/duplex.py` |
| Audio | Procedural ambient soundscapes, reaction SFX, per-character audio profiles | Static assets |
| Lip sync | None (mouth opens/closes on speak state in viewer.html) | No phoneme-level sync |

---

## Feature Matrix (10 Recommendations)

### Legend
- **Priority:** P1 = high impact + feasible now, P2 = strong value + moderate effort, P3 = nice-to-have
- **RT** = real-time capable
- **VRAM** = peak GPU memory (inference)

---

### 1. Voice Cloning / Zero-Shot TTS Upgrade: Chatterbox Turbo

| Attribute | Value |
|-----------|-------|
| **Model** | `ResembleAI/chatterbox-turbo` |
| **HF Link** | https://hf.co/ResembleAI/chatterbox-turbo |
| **Parameters** | 350M (Turbo) / 500M (full) |
| **VRAM** | ~4-6 GB (Turbo), ~7 GB (full) |
| **License** | MIT |
| **RT capable** | Yes -- single-step distilled decoder, streams chunks |
| **Priority** | **P1** |

**User-facing benefit:** Users record or upload 5-10 seconds of any anime character's voice. The app clones that voice and uses it for ALL future TTS output. Character sounds exactly like the original VA from the anime. Emotion exaggeration control (monotone to dramatic) via single parameter.

**vs. current Kokoro:** Kokoro is 82M single-speaker; it sounds good but generic. Chatterbox adds zero-shot voice cloning from a reference clip, plus emotion exaggeration knob. Kokoro stays as fast fallback; Chatterbox becomes the premium path when a voice reference exists.

**Integration complexity:** **Medium** -- Drop-in TTS adapter alongside existing Kokoro adapter. Reference audio stored per character. MLX builds exist for Apple Silicon (`mlx-community/Chatterbox-Turbo-TTS-4bit`). ONNX builds exist for CPU fallback.

**Key files to modify:** `backend/tts/adapters/` (new `chatterbox.py`), `backend/tts/registry.py`, `backend/tts/voice_modulator.py` (map emotions to exaggeration param).

---

### 2. Real-Time Voice Conversion (Post-TTS): OpenVoice V2

| Attribute | Value |
|-----------|-------|
| **Model** | `myshell-ai/OpenVoiceV2` |
| **HF Link** | https://hf.co/myshell-ai/OpenVoiceV2 |
| **Parameters** | ~60M (tone color converter) |
| **VRAM** | ~2-4 GB (lightweight) |
| **License** | MIT |
| **RT capable** | Yes -- processes chunks in <100ms |
| **Priority** | **P2** |

**User-facing benefit:** Takes ANY TTS output (Kokoro, Chatterbox, etc.) and converts the voice timbre to match a target character voice. This is a post-processing step, so it works with the existing pipeline. Controls for emotion, accent, rhythm, pauses, and intonation.

**vs. current:** The app has no voice conversion. This sits between TTS output and playback, adding character-specific timbre to any TTS engine. Works complementarily with Feature #1.

**vs. RVC:** RVC needs ~4GB VRAM, requires per-character model training (hours of data + GPU time). OpenVoice V2 is zero-shot (just a reference clip). RVC produces higher fidelity for trained voices but has CC-BY-NC-SA license issues. OpenVoice is MIT + zero-shot = better fit.

**Integration complexity:** **Low-Medium** -- Audio post-processor in the TTS pipeline. Reference audio per character. 6 languages natively supported including Japanese.

---

### 3. AI Sound Effect Generation: Stable Audio Open

| Attribute | Value |
|-----------|-------|
| **Model** | `stabilityai/stable-audio-open-1.0` |
| **HF Link** | https://hf.co/stabilityai/stable-audio-open-1.0 |
| **Parameters** | 1.2B |
| **VRAM** | ~6 GB (DiT inference), ~14.5 GB peak (decoding); chunked decoding reduces this |
| **License** | Stability Community License (non-commercial research OK; commercial requires license) |
| **RT capable** | No -- generation takes 5-30s per clip |
| **Priority** | **P2** |

**User-facing benefit:** Instead of shipping static SFX assets, the app generates contextual sound effects on-demand from text prompts. "Gentle rain on a window," "cat purring," "keyboard typing nearby." Mood engine feeds prompts to generate ambient audio matching the character's current emotional state and time-of-day.

**vs. current:** App uses static procedural soundscapes. This replaces them with infinite variety. Pre-generate a cache of ~50 mood-matched clips at install time, then generate new ones on-demand during idle GPU time.

**Alternative:** `cvssp/audioldm2` (CC-BY-NC-SA-4.0, 350M-1.5B params, ~4-8 GB VRAM). AudioLDM2 is lighter and also does SFX well. Better fit for RTX 3070 (8GB).

**Integration complexity:** **Medium** -- New `backend/audio/sfx_generator.py` service. Background generation queue. Cache to disk. Hook into mood engine for prompt construction.

---

### 4. Ambient Music Generation: MusicGen Small

| Attribute | Value |
|-----------|-------|
| **Model** | `facebook/musicgen-small` |
| **HF Link** | https://hf.co/facebook/musicgen-small |
| **Parameters** | 300M |
| **VRAM** | ~4-5 GB |
| **License** | CC-BY-NC-4.0 |
| **RT capable** | Near-RT -- generates 10s of music in ~5-8s on RTX 3070 |
| **Priority** | **P2** |

**User-facing benefit:** Dynamic background music that shifts with the character's mood. "Gentle piano, warm ambient, soft" for cozy evening conversations. "Upbeat electronic, energetic" for game sessions. Music loops seamlessly and crossfades when mood changes.

**vs. current:** No background music. This adds an entire emotional layer. Pre-generate a mood-indexed music library at first run (~20 prompts x 30s each = ~10 min generation), then generate fresh tracks during idle time.

**Integration complexity:** **Medium** -- New `backend/audio/music_generator.py`. Mood-to-prompt mapping table. Web Audio API playback in frontend with crossfade. Stereo variant available (`facebook/musicgen-stereo-small`) for richer output.

**Note:** CC-BY-NC limits commercial use. For commercial release, consider licensing or switching to a CC-BY model.

---

### 5. Audio-Driven Lip Sync: Phoneme-to-Viseme Pipeline

| Attribute | Value |
|-----------|-------|
| **Tool** | Rhubarb Lip Sync (CLI) + custom phoneme-to-VRM-viseme mapper |
| **GitHub** | https://github.com/DanielSWolf/rhubarb-lip-sync |
| **Size** | ~15 MB binary, no GPU needed |
| **License** | MIT |
| **RT capable** | Near-RT -- processes audio in <500ms per sentence |
| **Priority** | **P1** |

**User-facing benefit:** Character's mouth movements precisely match spoken phonemes instead of just opening/closing. Dramatic quality jump for 3D avatar immersion. Each vowel and consonant triggers a specific mouth shape (viseme), making speech look natural.

**VRM integration:** VRM models already have blend shapes for visemes (aa, ih, ou, ee, oh + neutral). Rhubarb outputs timed viseme data (JSON). The viewer.html AnimationDirector maps these to VRM blend shape weights via `THREE.MathUtils.lerp` for smooth transitions.

**Alternative approach:** Skip Rhubarb entirely and use Whisper's word-level timestamps (already available in faster-whisper) + a phoneme dictionary to estimate visemes in real-time. Lower accuracy but zero extra dependencies.

**vs. current:** Viewer.html only toggles mouth open/closed on `talk` state. This replaces it with 6-viseme animation driven by actual audio content.

**Integration complexity:** **Low** -- Rhubarb runs as subprocess, outputs JSON. New `backend/voice/lip_sync.py` processes TTS audio before playback. Frontend `viewer.html` already has blend shape infrastructure.

---

### 6. ML-Based Voice Activity Detection: Silero VAD v5

| Attribute | Value |
|-----------|-------|
| **Model** | `snakers4/silero-vad` (PyTorch/ONNX) or `aufklarer/Silero-VAD-v5-MLX` (Apple Silicon) |
| **HF Link** | https://hf.co/aufklarer/Silero-VAD-v5-MLX |
| **Parameters** | ~2M (tiny model) |
| **VRAM** | 0 -- runs on CPU, <1ms per 30ms chunk |
| **License** | MIT |
| **RT capable** | Yes -- sub-millisecond per chunk on single CPU thread |
| **Priority** | **P1** |

**User-facing benefit:** Far more accurate speech detection. Current energy-based VAD triggers on keyboard noise, fan noise, music. Silero VAD distinguishes speech from non-speech with 87.7% TPR at 5% FPR. Reduces false wake-ups and missed utterances. Trained on 6000+ languages.

**vs. current:** `duplex.py` uses RMS energy threshold (DEFAULT_VAD_THRESHOLD = 0.015). Simple but noisy. Silero is a drop-in replacement that runs on CPU with zero GPU cost. MLX variant optimized for M2 Pro.

**vs. pyannote VAD:** pyannote is heavier, designed for offline diarization, not streaming. Silero is purpose-built for streaming/real-time with <1ms latency.

**Integration complexity:** **Low** -- Replace the `_rms_energy()` check in `duplex.py` with Silero inference. ONNX model is ~2MB. No GPU needed.

---

### 7. Noise Suppression: DeepFilterNet 3

| Attribute | Value |
|-----------|-------|
| **Model** | DeepFilterNet 3 |
| **GitHub** | https://github.com/Rikorose/DeepFilterNet |
| **Parameters** | ~2M |
| **VRAM** | 0 -- CPU-only Rust inference via tract engine |
| **License** | MIT (DeepFilterNet2), Apache-2.0 (v3) |
| **RT capable** | Yes -- RTF 0.19 on Intel i5, ~40ms latency |
| **Priority** | **P1** |

**User-facing benefit:** Cleans up user microphone audio before ASR. Removes fan noise, keyboard clicks, background music, room echo. Results in dramatically better transcription accuracy, especially in noisy home environments. Users no longer need a quiet room for voice chat.

**vs. current:** No noise suppression. Raw mic audio goes straight to ASR. This sits between WebSocket audio input and the ASR adapter, cleaning audio in real-time.

**Integration complexity:** **Low** -- Python bindings available (`pip install deepfilternet`). Process audio chunks in `duplex.py` before passing to ASR. Pure CPU, no GPU contention.

---

### 8. Faster ASR: Moonshine v2

| Attribute | Value |
|-----------|-------|
| **Model** | `UsefulSensors/moonshine-tiny` / `UsefulSensors/moonshine-base` |
| **HF Link** | https://hf.co/UsefulSensors/moonshine-base |
| **Parameters** | 27M (tiny) / 62M (base) |
| **VRAM** | 0 -- optimized for CPU/edge |
| **License** | MIT |
| **RT capable** | Yes -- 50ms latency (tiny), 148ms (base); 5-35x faster than Whisper |
| **Priority** | **P2** |

**User-facing benefit:** Voice responses feel instant. Current faster-whisper tiny.en processes in fixed segments regardless of actual speech length. Moonshine adapts to actual audio duration -- a 2-second utterance processes in ~50ms instead of Whisper's ~250ms+. This slashes the perceived latency of voice conversations.

**vs. current faster-whisper tiny.en:** Similar accuracy (slightly better WER), dramatically faster (5x minimum), smaller model (27M vs 39M). Processes variable-length audio without zero-padding waste. MIT license (same as current).

**Integration complexity:** **Low** -- New ASR adapter `backend/asr/adapters/moonshine.py`. Same interface as existing faster-whisper adapter. Drop-in replacement.

---

### 9. Singing Voice Synthesis: DiffSinger (OpenVPI)

| Attribute | Value |
|-----------|-------|
| **Model** | OpenVPI/DiffSinger |
| **GitHub** | https://github.com/openvpi/DiffSinger |
| **Parameters** | ~50-100M (varies by voicebank) |
| **VRAM** | ~2-4 GB |
| **License** | Apache-2.0 |
| **RT capable** | No -- offline generation, ~10-30s per phrase |
| **Priority** | **P3** |

**User-facing benefit:** Character can sing songs. User requests "sing happy birthday" and the character performs it with their voice. Incredibly memorable, emotionally impactful moments. Unique differentiator vs. all competitors.

**How it works:** DiffSinger takes a musical score (MIDI + phoneme sequence) and generates singing audio via shallow diffusion. Pre-trained Japanese/Chinese voicebanks exist in the community. Can be fine-tuned on character reference audio (~30 min of singing data).

**vs. current:** No singing capability. This is a "wow factor" feature -- low frequency of use but extremely high emotional impact when it happens.

**Integration complexity:** **High** -- Requires musical score input (MIDI or MusicXML), phoneme-to-viseme mapping during singing, custom voicebank training per character. Best implemented as a background batch process that pre-renders songs.

---

### 10. Speaker Diarization + Audio Context: pyannote 3.1

| Attribute | Value |
|-----------|-------|
| **Model** | `pyannote/speaker-diarization-3.1` |
| **HF Link** | https://hf.co/pyannote/speaker-diarization-3.1 |
| **Parameters** | ~10M (segmentation) + ~7M (embedding) |
| **VRAM** | ~1-2 GB |
| **License** | MIT |
| **RT capable** | Near-RT with windowed processing |
| **Priority** | **P3** |

**User-facing benefit:** When user is watching a show or on a call, the character can distinguish the user's voice from other speakers. Prevents the character from responding to TV dialogue or other people talking. Also enables "who said that?" awareness for richer contextual reactions.

**vs. current:** No speaker distinction. The app treats all mic audio as user speech. This prevents false triggers when media is playing.

**Integration complexity:** **Medium** -- Requires speaker embedding enrollment (user records a few sentences). Runtime comparison of incoming audio embeddings vs. enrolled user. Integrates into VAD/ASR pipeline.

---

## Priority Summary

| Priority | Features | Estimated Total Effort |
|----------|----------|----------------------|
| **P1** | Silero VAD, DeepFilterNet, Lip Sync, Chatterbox Turbo | ~3-4 days |
| **P2** | OpenVoice V2, MusicGen, Stable Audio, Moonshine ASR | ~4-5 days |
| **P3** | DiffSinger, pyannote diarization | ~3-4 days |

## Implementation Order (Recommended)

```
Phase 1 (Voice Pipeline Hardening):
  1. Silero VAD v5       -- replace energy-based VAD      [4 hours]
  2. DeepFilterNet 3     -- noise suppression pre-ASR     [4 hours]
  3. Moonshine ASR       -- faster transcription          [3 hours]

Phase 2 (Visual + Voice Identity):
  4. Lip Sync Pipeline   -- Rhubarb or Whisper-based      [6 hours]
  5. Chatterbox Turbo    -- voice cloning TTS adapter     [8 hours]
  6. OpenVoice V2        -- voice timbre post-processing  [6 hours]

Phase 3 (Ambient Audio):
  7. MusicGen            -- mood-driven background music  [8 hours]
  8. Stable Audio / AudioLDM2 -- contextual SFX          [8 hours]

Phase 4 (Specialty):
  9. DiffSinger          -- singing voice synthesis       [16 hours]
  10. pyannote           -- speaker diarization           [8 hours]
```

## License Summary

| Model | License | Commercial OK? |
|-------|---------|---------------|
| Chatterbox Turbo | MIT | Yes |
| OpenVoice V2 | MIT | Yes |
| Silero VAD v5 | MIT | Yes |
| DeepFilterNet 3 | Apache-2.0 | Yes |
| Moonshine | MIT | Yes |
| Rhubarb Lip Sync | MIT | Yes |
| DiffSinger | Apache-2.0 | Yes |
| pyannote 3.1 | MIT | Yes |
| MusicGen Small | CC-BY-NC-4.0 | **No** (non-commercial) |
| Stable Audio Open | Stability Community | **Restricted** (requires license for commercial) |
| AudioLDM2 | CC-BY-NC-SA-4.0 | **No** (non-commercial) |

**Note:** For commercial release, music/SFX generation needs either licensing agreements or alternative models. All voice/speech models are commercially clear.

## VRAM Budget Analysis (RTX 3070, 8GB)

```
Concurrent load scenario:
  Silero VAD          ~0 GB (CPU)
  DeepFilterNet       ~0 GB (CPU)
  Moonshine ASR       ~0 GB (CPU)
  Kokoro TTS          ~0.3 GB (CPU-capable)
  Chatterbox Turbo    ~4-6 GB (GPU)
  ─────────────────────────────
  Total:              ~4-6 GB  [FITS in 8GB]

Background generation (non-concurrent):
  MusicGen Small      ~4-5 GB
  AudioLDM2           ~4-8 GB
  Stable Audio Open   ~6-14 GB (needs chunked decoding on 8GB)
```

The P1 features (VAD, noise suppression, lip sync) are all CPU-only and add zero GPU pressure. Chatterbox Turbo fits within 8GB alongside the LLM if the LLM is offloaded or uses a small model.

---

## Sources

- [Fish Speech 1.5](https://hf.co/fishaudio/fish-speech-1.5) -- CC-BY-NC-SA-4.0, 6.7K downloads
- [Chatterbox](https://hf.co/ResembleAI/chatterbox) -- MIT, 2.3M downloads
- [Chatterbox Turbo](https://hf.co/ResembleAI/chatterbox-turbo) -- MIT, 350M params
- [OpenVoice V2](https://hf.co/myshell-ai/OpenVoiceV2) -- MIT
- [MusicGen Small](https://hf.co/facebook/musicgen-small) -- CC-BY-NC-4.0, 300M params
- [AudioLDM2](https://hf.co/cvssp/audioldm2) -- CC-BY-NC-SA-4.0
- [Stable Audio Open](https://hf.co/stabilityai/stable-audio-open-1.0) -- 1.2B params
- [Silero VAD v5 MLX](https://hf.co/aufklarer/Silero-VAD-v5-MLX) -- MIT
- [Silero VAD GitHub](https://github.com/snakers4/silero-vad) -- MIT
- [DeepFilterNet GitHub](https://github.com/Rikorose/DeepFilterNet) -- Apache-2.0
- [Moonshine Tiny](https://hf.co/UsefulSensors/moonshine-tiny) -- MIT, 27M params
- [Moonshine Base](https://hf.co/UsefulSensors/moonshine-base) -- MIT, 62M params
- [distil-whisper large-v3](https://hf.co/distil-whisper/distil-large-v3) -- MIT, 988K downloads
- [Parler-TTS Mini v1](https://hf.co/parler-tts/parler-tts-mini-v1) -- Apache-2.0
- [pyannote speaker-diarization-3.1](https://hf.co/pyannote/speaker-diarization-3.1) -- MIT, 12M downloads
- [DiffSinger (OpenVPI)](https://github.com/openvpi/DiffSinger) -- Apache-2.0
- [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) -- MIT
- [TalkingHead 3D Lip Sync](https://github.com/met4citizen/TalkingHead) -- real-time viseme detection
- [StyleStream paper](https://hf.co/papers/2602.20113) -- real-time zero-shot voice style conversion (Feb 2026)
- [Moonshine v2 paper](https://arxiv.org/html/2602.12241v1) -- ergodic streaming ASR
- [Kokoro vs Chatterbox comparison](https://www.inferless.com/learn/comparing-different-text-to-speech---tts--models-part-2)
- [SillyTavern RVC integration](https://docs.sillytavern.app/extensions/rvc/)
- [Dejavu audio fingerprinting](https://github.com/worldveil/dejavu)
