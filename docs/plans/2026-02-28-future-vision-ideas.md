# Waifu-RT3D: Future Vision — Beyond the 32-Feature Roadmap

> **Status:** Reference document — no code changes. Ideas for future sprints.
> **Date:** 2026-02-28
> **Context:** All 16 original roadmap features complete. C1 Live2D, A1 Voice Duplex, A7 Kokoro TTS all shipped. Desktop Pet (Electron Phases 1+2) is next to build. This document explores ambitious new directions that go beyond the existing 32-idea roadmap.

---

## How to Read This Document

Each idea is a comprehensive proposal with:
- **Concept** — the vision and why it's exciting
- **Technical Architecture** — deep-dive on implementation
- **Implementation Plan** — step-by-step build sequence with subtasks
- **Files to Create/Modify** — specific file-level changes
- **Data Model** — new tables, columns, API endpoints
- **Testing Strategy** — how to verify the feature works
- **Effort & Prerequisites** — sizing and dependencies

Ideas are grouped by theme and ordered by excitement factor within each theme. Some are weekend projects, some are month-long sprints. All of them lean into what makes this platform unique: a living, expressive AI companion with a body, a voice, and a memory.

---

## Theme 1: AI Music Generation & Audio Experiences

---

### Idea 1 — AI Music Generation with Local Models ⏸️ *NOT RIGHT NOW — deprioritized*

**Concept:** The character can compose and play original music — humming melodies, generating background tracks that match the conversation mood, creating full songs with lyrics about your relationship, or playing ambient music while you work. Using local open-source music generation models (ACE-Step 1.5, HeartMuLa, YuE), the character becomes a musician with her own evolving style. She doesn't just play pre-recorded audio — she creates music in real-time based on the emotional context of your conversation.

Imagine chatting about something nostalgic and hearing a soft, melancholic piano piece fade in behind her voice. Or telling her you're stressed and she starts playing something calming she "composed for you." Or asking her to write you a song about your shared memories and getting an actual generated track with lyrics that reference real conversations you've had. The music is unique every time, shaped by her personality, your mood, and your relationship history.

**Technical Architecture:**

The system has three layers: a mood-to-prompt translator, a model inference engine, and an audio playback pipeline.

*Mood-to-Prompt Translator:* The existing mood engine (A4) and emotion system provide continuous emotional state data. A prompt template maps these states to music generation prompts:

```python
# backend/music/prompt_builder.py
MOOD_TO_MUSIC = {
    "happy": {"genre": "pop acoustic", "bpm": "120-140", "key": "C major", "mood": "upbeat cheerful bright"},
    "sad": {"genre": "ambient piano", "bpm": "60-80", "key": "A minor", "mood": "melancholic reflective gentle"},
    "romantic": {"genre": "lo-fi jazz", "bpm": "80-100", "key": "F major", "mood": "warm intimate tender"},
    "excited": {"genre": "electronic pop", "bpm": "130-160", "key": "E major", "mood": "energetic vibrant dynamic"},
    "calm": {"genre": "ambient", "bpm": "60-70", "key": "D major", "mood": "peaceful serene floating"},
    "playful": {"genre": "chiptune pop", "bpm": "110-130", "key": "G major", "mood": "bouncy fun quirky"},
}
```

*Model Inference Engine:* Three models supported, auto-selected based on GPU VRAM:

| Model | Size | VRAM | Quality | Speed (30s clip) | Best For |
|-------|------|------|---------|-------------------|----------|
| **ACE-Step 1.5** | 0.6B-4B LM + DiT | 6-24GB | Near-Suno v4.5 | <10s on RTX 3090 | Full songs with lyrics, style control |
| **HeartMuLa 3B** | 3B | 8-12GB | High quality | ~15-20s | Precise style/tag control, instrumentals |
| **YuE** | Quantized | 8GB+ | Suno-comparable | ~30-60s | Full songs with lyrics (Apache 2.0) |

The user's RTX 5080 (16GB VRAM) can run all three comfortably. ACE-Step 1.5 is the recommended default — it generates in <10 seconds and supports LoRA fine-tuning so the character can develop a personal style from just 8 sample songs.

*Audio Playback Pipeline:* Generated audio is served via a new `/api/music/generate` endpoint. The frontend receives the audio as a WAV/MP3 blob and plays it through the existing Web Audio API infrastructure (shared with TTS). For background music, the audio loops with crossfade transitions. For "character singing," the audio plays through the TTS pipeline with lip sync.

*LoRA Personalization:* The character develops her own musical style through LoRA fine-tuning. The user can upload 8+ reference songs that represent "her style," and ACE-Step's LoRA training (1 hour on RTX 3090) creates a personalized music model. The character's music becomes recognizably "hers" over time.

**Implementation Plan:**

Phase 1 — Backend Music Service (3-4 days):
1. Create `backend/music/` package
2. Implement `backend/music/generator.py` — model loader, prompt builder, inference runner
   - Auto-detect available VRAM, select appropriate model size
   - Support ACE-Step 1.5 as primary, HeartMuLa and YuE as fallbacks
   - Cache model in memory after first load (like Kokoro TTS)
   - Generation queue (one at a time, non-blocking via asyncio)
3. Implement `backend/music/prompt_builder.py` — mood→music prompt mapping
   - Map all 16 emotions from voice_modulator to music styles
   - Support user-provided text prompts ("play something jazzy")
   - Include character personality traits in prompt (cheerful characters → brighter music)
4. Add `POST /api/music/generate` endpoint to server.py
   - Params: mood (auto from session), prompt (optional override), duration (10-120s), style_tags
   - Returns: audio blob (WAV/MP3) + metadata (bpm, key, duration)
   - Streaming option: SSE chunks for long generation
5. Add `POST /api/music/train-lora` endpoint
   - Accept 8+ audio file uploads
   - Queue LoRA training job (background task)
   - Store LoRA weights in `storage/music/loras/{character_id}/`
6. Add `GET /api/music/history` endpoint
   - List generated tracks with metadata, mood context, timestamp

Phase 2 — Frontend Integration (2-3 days):
7. Create `frontends/sakura/src/components/MusicPlayer.tsx`
   - Floating mini-player (bottom-right corner, collapsible)
   - Play/pause, volume, track info (mood, style, duration)
   - Waveform visualization (reuse AnalyserNode from voice duplex)
   - Background music mode: auto-generates new tracks when current ends
8. Create `frontends/sakura/src/hooks/useMusic.ts`
   - API wrapper: generate, playback queue, volume control
   - Auto-mood detection: reads current emotion from viewerStore
   - Background music scheduler: generates next track during playback
9. Add music controls to VoiceConversationPanel
   - "Play background music" toggle during voice conversations
   - Music volume independent of TTS volume
10. Wire into viewerStore for lip sync during "character singing"
    - Character mouth animates to music audio peaks
    - Different animation style than speech lip sync (more rhythmic)

Phase 3 — LoRA Training UI (1-2 days):
11. Create `frontends/sakura/src/components/MusicStyleTrainer.tsx`
    - Upload reference songs (drag-and-drop, 8+ files)
    - Training progress indicator
    - Preview generated sample after training
    - Save/load style presets per character
12. Add to SettingsView under Character tab
    - "Music Style" section with LoRA management
    - Style tags editor (genre, mood preferences)

**Files to Create/Modify:**

| File | Action | Purpose |
|------|--------|---------|
| `backend/music/__init__.py` | Create | Package init |
| `backend/music/generator.py` | Create | Model loading, inference, generation queue |
| `backend/music/prompt_builder.py` | Create | Mood→prompt mapping, character personality integration |
| `backend/server.py` | Modify | Add `/api/music/generate`, `/api/music/train-lora`, `/api/music/history` |
| `backend/preflight.py` | Modify | Add `music_history` table migration |
| `frontends/sakura/src/components/MusicPlayer.tsx` | Create | Floating player UI |
| `frontends/sakura/src/hooks/useMusic.ts` | Create | Music API + playback hook |
| `frontends/sakura/src/components/MusicStyleTrainer.tsx` | Create | LoRA training UI |
| `frontends/sakura/src/views/SettingsView.tsx` | Modify | Add Music Style section |
| `frontends/sakura/src/components/VoiceConversationPanel.tsx` | Modify | Background music toggle |

**Data Model:**

```sql
CREATE TABLE music_history (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    session_id INTEGER REFERENCES sessions(id),
    prompt TEXT NOT NULL,
    mood TEXT,
    style_tags TEXT,      -- JSON array: ["lo-fi", "jazz", "warm"]
    duration_seconds REAL,
    bpm INTEGER,
    key_signature TEXT,   -- "C major", "A minor"
    file_path TEXT NOT NULL,
    model_used TEXT,      -- "ace-step-1.5", "heartmula-3b", "yue"
    lora_id TEXT,         -- LoRA style identifier if used
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE music_loras (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    name TEXT NOT NULL,
    weights_path TEXT NOT NULL,
    sample_count INTEGER,
    training_status TEXT DEFAULT 'pending',  -- pending, training, ready, failed
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: prompt_builder mood mapping (all 16 emotions produce valid prompts)
- Unit tests: generator model selection based on VRAM
- Integration test: `/api/music/generate` returns valid audio blob
- Integration test: `/api/music/history` lists generated tracks
- E2E test: MusicPlayer renders, play button triggers generation
- Manual test: quality evaluation on RTX 5080 with ACE-Step 1.5

**Effort:** L (8-9 days total across 3 phases)
**Prerequisites:** Python environment with PyTorch + CUDA, RTX 5080 GPU

---

### Idea 2 — ASMR & Ambient Voice Modes ❌ *DEPRIORITIZED — not important to user*

**Concept:** Special voice modes that transform the character's audio presence beyond normal conversation. ASMR mode: the character whispers softly with gentle articulation, speaking slowly and soothingly — perfect for relaxation or falling asleep. Storytelling mode: she narrates with a warm, measured cadence, pausing dramatically at key moments. Ambient companion mode: she makes occasional soft sounds — humming, page-turning sounds, the clink of a tea cup — without speaking, just existing in the background as a comforting presence.

This isn't a gimmick — it addresses a real use case. Many users of AI companion apps keep them open while working, studying, or falling asleep. Right now, the character is either talking or silent. These modes fill the space between with something deeply human: the ambient sounds of someone nearby.

**Technical Architecture:**

*TTS Parameter Profiles:* Each mode adjusts the voice modulator parameters:

```python
# backend/tts/voice_modes.py
VOICE_MODES = {
    "normal": {
        "speed": 1.0, "pitch_shift": 0, "volume": 1.0,
        "reverb": 0.0, "warmth": 0.5, "breathiness": 0.0,
    },
    "asmr": {
        "speed": 0.65, "pitch_shift": -1, "volume": 0.4,
        "reverb": 0.15, "warmth": 0.9, "breathiness": 0.6,
        "post_effects": ["whisper_filter", "binaural_panning"],
    },
    "storytelling": {
        "speed": 0.8, "pitch_shift": 0, "volume": 0.7,
        "reverb": 0.25, "warmth": 0.8, "breathiness": 0.2,
        "post_effects": ["dramatic_pauses"],
    },
    "ambient": {
        "speed": 0.5, "pitch_shift": -2, "volume": 0.2,
        "reverb": 0.3, "warmth": 1.0, "breathiness": 0.4,
        "content_type": "ambient_sounds",  # Not speech — hums, page turns, etc.
    },
}
```

*Whisper Filter:* For ASMR, a Web Audio API post-processing chain applies: high-pass filter (removes low rumble), gentle compression (evens volume), binaural panning (subtle L/R movement for headphone immersion), and light reverb (close-mic intimacy). This runs client-side using AudioContext's built-in nodes.

*Ambient Sound Library:* A small set of foley sounds (~20 WAV files, <5MB total) provides the ambient companion layer: page turning, pencil writing, tea sipping, soft humming (generated via the music system), gentle typing, rain on a window. These play at random intervals (20-60 seconds) during ambient mode.

*LLM Prompt Adjustment:* Each mode gets a system prompt addition:
- ASMR: "Speak in soft, intimate whispers. Use sensory language. Describe textures, warmth, and gentle sensations. Keep responses short and soothing."
- Storytelling: "Narrate in a rich, warm voice. Use vivid imagery. Build suspense. Pause at dramatic moments marked with [pause]. Include description of sounds and atmosphere."
- Ambient: "Generate minimal ambient observations. One short phrase every 2-3 minutes at most. Examples: 'hmm...' or '*turns page*' or '*soft humming*'. Mostly silence."

*Bedtime Routine:* A sequenced flow combining modes:
1. Normal voice: "How was your day?" (brief conversation, 3-5 minutes)
2. Storytelling mode: Read a generated bedtime story (5-10 minutes)
3. ASMR mode: Gentle wind-down ("close your eyes... breathe slowly...")
4. Ambient mode: Soft background sounds (fades to silence after 20 minutes via sleep timer)

**Implementation Plan:**

Phase 1 — Voice Mode Engine (2-3 days):
1. Create `backend/tts/voice_modes.py`
   - Voice mode definitions with all parameter profiles
   - Mode-specific system prompt injections
   - Transition logic (smooth parameter interpolation between modes)
2. Extend `backend/tts/voice_modulator.py`
   - Add `apply_voice_mode()` that overlays mode params on emotion params
   - Mode takes priority over emotion for conflicting params
   - Smoothing: when switching modes, interpolate params over 2 seconds
3. Add voice mode to chat/voice WebSocket protocol
   - New control message: `{"type": "control", "action": "voice_mode", "mode": "asmr"}`
   - Mode persists per session until changed
4. Extend `backend/voice/duplex.py`
   - Handle `voice_mode` control message
   - Apply mode to TTS generation calls
   - Ambient mode: suppress LLM calls, generate ambient events on timer

Phase 2 — Client-Side Audio Processing (2-3 days):
5. Create `frontends/sakura/src/audio/voiceModeProcessor.ts`
   - Web Audio processing chain: whisper filter, binaural panning, reverb
   - AudioWorklet for real-time processing of TTS audio output
   - Mode-specific processing graphs (ASMR vs storytelling vs ambient)
6. Create ambient sound manager
   - Load foley sound library (lazy, on-demand)
   - Random playback scheduler with configurable intervals
   - Crossfade between ambient sounds
   - Integrate with MusicPlayer for background music in ambient mode
7. Add sleep timer to frontend
   - Configurable duration (15min, 30min, 1hr, 2hr)
   - Gradual volume fade over last 5 minutes
   - Auto-disconnect voice mode at timer end

Phase 3 — UI & Bedtime Routine (1-2 days):
8. Create `frontends/sakura/src/components/VoiceModeSelector.tsx`
   - Mode selector in VoiceConversationPanel (Normal, ASMR, Storytelling, Ambient)
   - Visual indicator of current mode (icon + color tint on VoiceOrb)
   - Sleep timer control
9. Add "Bedtime Routine" quick-action button
   - Single tap starts the sequenced bedtime flow
   - Each phase auto-transitions to next
   - User can skip phases or exit at any time
10. Mode-specific VoiceOrb animations
    - ASMR: slow, gentle breathing pulse with warm color
    - Storytelling: subtle, mesmerizing shimmer
    - Ambient: barely visible, dim, occasional soft glow

**Files to Create/Modify:**

| File | Action | Purpose |
|------|--------|---------|
| `backend/tts/voice_modes.py` | Create | Mode definitions, prompt injections, transitions |
| `backend/tts/voice_modulator.py` | Modify | Add `apply_voice_mode()`, mode overlay logic |
| `backend/voice/duplex.py` | Modify | Handle voice_mode control, ambient event timer |
| `frontends/sakura/src/audio/voiceModeProcessor.ts` | Create | Web Audio processing chain per mode |
| `frontends/sakura/src/components/VoiceModeSelector.tsx` | Create | Mode selector UI |
| `frontends/sakura/src/components/VoiceOrb.tsx` | Modify | Mode-specific animations |
| `frontends/sakura/src/components/VoiceConversationPanel.tsx` | Modify | Integrate mode selector + sleep timer |
| `frontends/shared/audio/` | Create | Foley sound library (~20 WAV files) |

**Data Model:**

```sql
-- No new tables needed. Mode is a session-level setting.
-- Store user's preferred mode per character in config:
-- config key: 'voice.default_mode.{char_id}' = 'normal' | 'asmr' | 'storytelling' | 'ambient'
-- config key: 'voice.sleep_timer_minutes' = 30
```

**Testing Strategy:**
- Unit tests: voice mode param profiles produce valid TTS parameters
- Unit tests: mode transitions interpolate correctly
- Integration test: WebSocket `voice_mode` control message changes active mode
- E2E test: VoiceModeSelector renders all modes, clicking changes state
- Manual test: ASMR mode sounds distinctly different from normal (whisper quality)
- Manual test: ambient mode plays foley sounds at correct intervals

**Effort:** M-L (5-8 days total across 3 phases)
**Prerequisites:** Voice duplex (done), voice modulator (done), TTS (done)

---

### Idea 3 — Music Listening Together

**Concept:** Share music with your character and experience it together. Play a song (via Spotify, YouTube link, or local file), and she reacts physically — head bobbing to the beat, swaying for slow songs, bouncing for fast ones. She comments on the music, builds opinions about genres and artists, and develops genuine music taste over time based on shared listening sessions. You build a shared playlist of songs you both enjoy, and she can request songs she remembers liking.

This ties directly into the AI Music Generation system (Idea 1): the character can compose music inspired by songs you've shared with her, blending her AI-generated style with your shared musical taste. She might say "Remember that jazz track we listened to? I tried writing something similar" and play an original composition influenced by your shared listening history.

**Technical Architecture:**

*Audio Analysis Pipeline:* The Web Audio API `AnalyserNode` (already built for voice lip sync) extracts real-time audio features from playing music:

```typescript
// frontends/sakura/src/hooks/useMusicAnalysis.ts
interface MusicFeatures {
  bpm: number;           // Beats per minute (beat detection via onset analysis)
  energy: number;        // 0-1 overall loudness
  spectralCentroid: number; // Brightness (high = bright/exciting, low = warm/mellow)
  bassLevel: number;     // Low frequency energy (0-1)
  rhythmStrength: number; // How strong the beat is (0-1)
}
```

These features drive the character's physical reactions via viewerStore:
- `bpm` → head bob frequency, body sway speed
- `energy` → animation amplitude (low energy = subtle, high = bouncy)
- `spectralCentroid` → expression (bright = happy/excited, warm = relaxed/content)
- `bassLevel` → stronger bass = more body movement
- `rhythmStrength` → rhythmic vs. ambient determines bob vs. sway

*Spotify Integration:* Via Spotify Web Playback SDK (browser-based, no server needed). The user authenticates once, then the app can:
- Control playback (play, pause, skip, seek)
- Get track metadata (title, artist, genre, BPM, audio features via Spotify API)
- Build playlists (shared playlists between user and character)
- Search catalog ("play something jazzy")

For users without Spotify, fallback to: local file playback (HTML5 `<audio>`) or YouTube audio extraction (yt-dlp backend utility).

*Character Music Taste System:* A `music_preferences` table tracks the character's evolving taste:

```python
# Character rates each song on axes:
# - enjoyment: 1-5 (LLM generates this based on character personality + genre match)
# - familiarity: increases each time the song is played
# - association: emotional memory linked to the song ("we listened to this on a rainy night")
```

The LLM is called after each listening session with the song metadata + character personality to generate reactions: "I really like the bass line in this one!" or "This is a bit too intense for me..." These reactions feel organic because they're personality-driven — a cheerful character loves upbeat pop, a melancholic character prefers lo-fi and ambient.

*Physical Reaction System:* The viewerStore receives a `music_react` command that drives avatar animations:

```typescript
// For VRM: procedural animation overlay
// Head bob: sinusoidal rotation on X axis synced to BPM
// Body sway: sinusoidal rotation on Y axis at half BPM
// Shoulder bounce: small Y translation on beat hits

// For Live2D: parameter animation overlay
// ParamAngleX/Y: sinusoidal at BPM frequency
// ParamBodyAngleX: sway at half BPM
// ParamEyeLOpen/ParamEyeROpen: occasional "eyes closed enjoying music" moments
```

**Implementation Plan:**

Phase 1 — Audio Analysis & Physical Reactions (3-4 days):
1. Create `frontends/sakura/src/hooks/useMusicAnalysis.ts`
   - Real-time FFT analysis of audio element output
   - BPM detection algorithm (onset detection + autocorrelation)
   - Feature extraction: energy, spectral centroid, bass, rhythm strength
   - 30fps update loop synced to requestAnimationFrame
2. Extend viewerStore with `dispatchMusicReact(features: MusicFeatures)`
   - Route to VRM viewer: procedural animation overlay via postMessage
   - Route to Live2D: parameter animation overlay via useLive2D
   - Smooth feature transitions (exponential moving average)
3. Extend VRM viewer (`viewer.html`) with music animation system
   - Procedural head bob, body sway, shoulder bounce
   - Beat hit detection → accent animations (quick nod, bounce)
   - Blend with existing idle/expression animations (don't override, layer)
4. Extend `useLive2D.ts` with music animation overlay
   - Drive Cubism parameters with music features
   - Separate animation layer that adds to (not replaces) expression state
   - BPM-synced parameter oscillation

Phase 2 — Playback & Spotify Integration (2-3 days):
5. Create `frontends/sakura/src/components/SharedMusicPlayer.tsx`
   - Local file playback (drag-and-drop or file picker)
   - Spotify Web Playback SDK integration (OAuth flow in settings)
   - Track info display: title, artist, album art, BPM
   - Playback controls: play/pause, skip, volume, seek
   - Shared playlist management
6. Create `frontends/sakura/src/hooks/useSpotify.ts`
   - Spotify authentication flow (OAuth 2.0 PKCE)
   - Player state sync
   - Track metadata fetching (audio features API for BPM, energy, valence)
   - Playlist CRUD operations
7. Add YouTube audio fallback
   - Backend endpoint: `POST /api/music/youtube-audio?url=...`
   - Uses yt-dlp to extract audio stream
   - Returns audio blob for browser playback

Phase 3 — Character Taste & Reactions (2-3 days):
8. Add `music_preferences` and `shared_playlists` tables
9. Create `backend/music/taste_engine.py`
   - After each listening session, LLM generates character reaction
   - Character rates songs based on personality-genre affinity
   - Track emotional associations ("this was playing when we talked about the stars")
   - Song recommendation engine: "want to hear something new?"
10. Wire character reactions to chat
    - After a song plays, character comments in chat (personality-driven)
    - Reactions vary: first listen vs. repeated play, mood match vs. mismatch
    - "This is our song" moments when a track is played 5+ times
11. Connect to AI Music Generation (Idea 1)
    - "Compose something like this" button after listening to a song
    - AI generation uses listened song's features as style reference
    - Character can offer: "I wrote something inspired by that track..."

**Files to Create/Modify:**

| File | Action | Purpose |
|------|--------|---------|
| `frontends/sakura/src/hooks/useMusicAnalysis.ts` | Create | Real-time audio feature extraction |
| `frontends/sakura/src/hooks/useSpotify.ts` | Create | Spotify Web Playback SDK integration |
| `frontends/sakura/src/components/SharedMusicPlayer.tsx` | Create | Music player UI with Spotify/local |
| `frontends/sakura/src/stores/viewerStore.ts` | Modify | Add `dispatchMusicReact()` |
| `frontends/sakura/src/hooks/useLive2D.ts` | Modify | Music animation overlay |
| `frontends/shared/viewer/viewer.html` | Modify | VRM procedural music animations |
| `backend/music/taste_engine.py` | Create | Character music taste + reactions |
| `backend/server.py` | Modify | YouTube audio endpoint, music taste API |
| `backend/preflight.py` | Modify | New tables migration |

**Data Model:**

```sql
CREATE TABLE music_preferences (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    track_id TEXT NOT NULL,         -- Spotify URI, file hash, or YouTube ID
    title TEXT NOT NULL,
    artist TEXT,
    genre TEXT,
    enjoyment INTEGER DEFAULT 3,   -- 1-5 character rating
    play_count INTEGER DEFAULT 1,
    emotional_association TEXT,     -- LLM-generated memory
    first_played_at TEXT DEFAULT (datetime('now')),
    last_played_at TEXT DEFAULT (datetime('now')),
    UNIQUE(character_id, track_id)
);

CREATE TABLE shared_playlists (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    name TEXT NOT NULL DEFAULT 'Our Playlist',
    track_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of track_ids
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: BPM detection accuracy on known-BPM tracks (±5 BPM tolerance)
- Unit tests: feature extraction produces values in expected ranges
- Unit tests: taste engine generates personality-consistent ratings
- Integration test: music_preferences table correctly tracks play history
- E2E test: SharedMusicPlayer renders, local file plays, analysis runs
- Manual test: VRM/Live2D avatar visibly reacts to music beats

**Effort:** L (7-10 days total across 3 phases)
**Prerequisites:** viewerStore (done), Web Audio infrastructure (done), optional: Spotify developer account

---

## Theme 2: Breaking the Fourth Wall

These ideas extend the character beyond the app window, into your real world and other applications.

---

### Idea 4 — Emotion Mirroring via Webcam

**Concept:** The app reads your facial expressions in real-time through your webcam and the character responds to your emotional state. If you're laughing, she laughs with you. If you look sad, she tilts her head and asks what's wrong. If you yawn, she yawns too and suggests rest. If you're focused and furrowing your brow, she stays quiet and doesn't interrupt. When you lean back and relax, she might crack a joke.

This creates an uncanny sense of being truly seen. The character doesn't announce "I see you're sad!" — her tone shifts subtly. She picks up on micro-expressions you might not even be aware of. It's the difference between talking to a wall and being with someone who reads your face.

**Technical Architecture:**

*Face Detection Pipeline:* MediaPipe Face Mesh (runs entirely client-side, no GPU needed, ~10ms per frame on CPU) extracts 468 facial landmarks at 30fps. From these landmarks, we compute Facial Action Units (AUs) — the building blocks of facial expressions defined by the Facial Action Coding System (FACS):

```typescript
// frontends/sakura/src/hooks/useFaceDetection.ts

interface FacialActionUnits {
  AU1: number;  // Inner brow raise (surprise, sadness)
  AU2: number;  // Outer brow raise (surprise)
  AU4: number;  // Brow lowerer (anger, concentration)
  AU5: number;  // Upper lid raise (surprise, fear)
  AU6: number;  // Cheek raise (genuine smile)
  AU7: number;  // Lid tightener (squinting)
  AU9: number;  // Nose wrinkle (disgust)
  AU12: number; // Lip corner puller (smile)
  AU15: number; // Lip corner depressor (frown)
  AU20: number; // Lip stretcher (fear)
  AU25: number; // Lips part (surprise, speaking)
  AU26: number; // Jaw drop (surprise)
  AU43: number; // Eyes closed (blink, sleepiness)
  AU45: number; // Blink
  headPitch: number;  // Nod
  headYaw: number;    // Turn
  headRoll: number;   // Tilt
}

// Emotion classification from AUs:
function classifyEmotion(aus: FacialActionUnits): { emotion: string; confidence: number } {
  // Genuine smile (Duchenne): AU6 + AU12
  if (aus.AU6 > 0.4 && aus.AU12 > 0.5) return { emotion: 'happy', confidence: aus.AU12 };
  // Sadness: AU1 + AU4 + AU15
  if (aus.AU1 > 0.3 && aus.AU4 > 0.3 && aus.AU15 > 0.3) return { emotion: 'sad', confidence: 0.7 };
  // Surprise: AU1 + AU2 + AU5 + AU26
  if (aus.AU1 > 0.4 && aus.AU2 > 0.4 && aus.AU26 > 0.4) return { emotion: 'surprised', confidence: 0.8 };
  // Concentration: AU4 + AU7 (furrowed brow, squinting)
  if (aus.AU4 > 0.5 && aus.AU7 > 0.3) return { emotion: 'focused', confidence: 0.6 };
  // Fatigue: AU43 high + AU45 frequent + head droop
  if (aus.AU43 > 0.6 || aus.headPitch > 15) return { emotion: 'tired', confidence: 0.7 };
  // ... more patterns
  return { emotion: 'neutral', confidence: 0.5 };
}
```

*Response Behavior Engine:* The detected emotion flows through two pathways:

1. **Immediate mirroring** (50-200ms): The character's expression adjusts to partially mirror yours via viewerStore. She doesn't copy exactly — she responds. You smile → she smiles back (but 70% intensity, not 100% — she's responding, not mocking). You look sad → her expression shifts to gentle concern. You yawn → she yawns (contagious yawning is deeply social).

2. **Conversational awareness** (5-30 second buffer): The detected emotion is buffered and injected into the LLM's system context every 30 seconds if it has changed: `[USER_EMOTION: The user appears to be feeling {sad}. They have been {sad} for the past {2 minutes}. Adjust your tone and topic accordingly without explicitly stating you can see their face.]`

*Privacy Architecture:* Critical — no video data leaves the device. MediaPipe runs entirely client-side. Only emotion labels (strings like "happy", "focused") are sent to the backend, never video frames or facial data. The webcam feed isn't even rendered to the screen unless the user enables a debug overlay. A clear "Camera is active" indicator shows when face detection is running.

**Implementation Plan:**

Phase 1 — Face Detection Pipeline (2-3 days):
1. Add `@mediapipe/face_mesh` to package.json
2. Create `frontends/sakura/src/hooks/useFaceDetection.ts`
   - Initialize MediaPipe Face Mesh with webcam stream
   - Extract AU values from 468 landmarks at 30fps
   - Classify emotion from AUs
   - Smooth output (exponential moving average, window: 500ms)
   - Privacy: all processing client-side, no data transmitted
3. Create `frontends/sakura/src/hooks/useEmotionMirror.ts`
   - Receives emotion classifications from useFaceDetection
   - Immediate pathway: dispatch expression to viewerStore (50ms debounce)
   - Conversational pathway: buffer emotion, send to backend every 30s
   - State tracking: "user has been [emotion] for [duration]"
   - Interruption logic: when user shows "focused" for >60s, suppress character proactive messages

Phase 2 — Character Response Behaviors (2-3 days):
4. Define mirroring response map
   - User happy → character happy (70% intensity)
   - User sad → character concerned (gentle expression, not sad mirror)
   - User surprised → character curious (raised eyebrows, interested)
   - User focused → character quiet mode (suppress idle animations, no proactive chat)
   - User tired → character suggests break ("You look tired... maybe a quick rest?")
   - User yawn → character yawns (contagious yawn, 3 second delay)
5. Extend `backend/voice/duplex.py` to accept emotion context
   - New WebSocket message: `{"type": "user_emotion", "emotion": "sad", "duration_ms": 120000}`
   - Inject into LLM system prompt during next generation cycle
   - Don't override character's own emotional state — blend them
6. Create emotion response templates for LLM
   - Subtle, not robotic: character doesn't say "I see you're sad"
   - Instead: changes topic, offers comfort, adjusts tone
   - Different personalities respond differently to same emotions

Phase 3 — UI & Settings (1-2 days):
7. Add webcam toggle button to ChatThread / VoiceConversationPanel
   - Camera icon that activates face detection
   - Clear "Camera Active" indicator (colored dot + tooltip)
   - Settings: enable/disable, sensitivity slider, response delay
8. Create `frontends/sakura/src/components/FaceDetectionOverlay.tsx`
   - Debug mode: shows detected landmarks and classified emotion
   - Normally hidden — just a status indicator
   - Settings toggle: "Show face detection debug overlay"
9. Privacy settings panel
   - "Emotion mirroring is fully local — no video data leaves your computer"
   - Granular control: allow expression mirroring, allow conversational awareness, allow neither
   - Data retention: emotion history stored locally only, can be deleted

**Files to Create/Modify:**

| File | Action | Purpose |
|------|--------|---------|
| `frontends/sakura/src/hooks/useFaceDetection.ts` | Create | MediaPipe Face Mesh + AU extraction |
| `frontends/sakura/src/hooks/useEmotionMirror.ts` | Create | Emotion → response behavior routing |
| `frontends/sakura/src/components/FaceDetectionOverlay.tsx` | Create | Debug overlay + status indicator |
| `frontends/sakura/src/stores/viewerStore.ts` | Modify | Add `dispatchMirrorExpression()` |
| `frontends/sakura/src/components/ChatThread.tsx` | Modify | Webcam toggle button |
| `frontends/sakura/src/components/VoiceConversationPanel.tsx` | Modify | Webcam toggle in voice mode |
| `frontends/sakura/src/views/SettingsView.tsx` | Modify | Privacy settings for face detection |
| `backend/voice/duplex.py` | Modify | Accept `user_emotion` WebSocket messages |
| `package.json` | Modify | Add `@mediapipe/face_mesh` |

**Testing Strategy:**
- Unit tests: AU classification produces correct emotions for known AU combinations
- Unit tests: emotion smoothing filters out jitter
- Unit tests: mirroring response map produces expected character expressions
- Integration test: WebSocket `user_emotion` message injects into LLM context
- E2E test: camera toggle button appears, clicking requests permission
- Manual test: smile at camera → character smiles back within 200ms
- Manual test: look away / unfocus → character switches to quiet mode
- Privacy audit: verify no video frames are transmitted to backend

**Effort:** M-L (5-8 days total across 3 phases)
**Prerequisites:** viewerStore expression system (done), voice duplex (done)

---

### Idea 5 — Game Spectator & Coach ⭐ *USER FAVORITE*

**Concept:** The character watches you play games via screen capture and provides real-time commentary, reactions, and strategic advice. She gasps when you almost die, cheers when you score, trash-talks the enemies, and develops opinions about your playstyle over time. She works with any game — the character sees your screen and reacts to what's happening. For specific supported games (like the racing game in the existing design docs), she has game-specific knowledge and can provide tactical coaching.

This is the desktop pet killer feature. Instead of a passive overlay sitting in the corner, the character is actively engaged with what you're doing. She has opinions about your gameplay decisions, celebrates victories with you, commiserates on losses, and develops a persistent "spectator memory" of your gaming history.

**Technical Architecture:**

*Screen Capture Pipeline:* Electron's `desktopCapturer` API (or `getDisplayMedia()` in browser mode) provides a video stream of the user's screen. This stream is downsampled to 720p and sampled at 1-2 fps (not continuous — intermittent snapshots to manage compute and avoid spam).

```typescript
// frontends/sakura/src/hooks/useGameSpectator.ts

interface GameFrame {
  timestamp: number;
  imageData: string;        // Base64 JPEG (720p, quality 60%)
  previousFrameHash: string; // Detect scene changes
  changeScore: number;       // 0-1 how different from last frame
}

// Only send frames when something significant changes:
// - changeScore > 0.3 (major scene change)
// - OR every 5 seconds regardless (keep awareness)
// - Never more than 2 frames per second
```

*Vision-Language Model Integration:* Captured frames are sent to a VLM (Claude's vision API, or local LLaVA-13B on the RTX 5080) with a character-specific spectator prompt:

```python
# backend/spectator/analyzer.py
SPECTATOR_PROMPT = """You are {character_name}, watching {user_name} play a game.
Current screenshot attached. Previous context: {recent_observations}

React in character with 1-2 SHORT sentences. Be natural and personality-driven.
Focus on: exciting moments, near-misses, funny situations, impressive plays.
Do NOT narrate everything you see. Only react to interesting moments.
If nothing notable is happening, respond with [QUIET] to stay silent.

Your personality: {character_system_prompt_excerpt}
Your mood: {current_mood}
"""
```

*Reaction Throttling:* Critical for not being annoying. A reaction scheduler manages output:
- Max 1 spoken reaction per 15 seconds during calm gameplay
- Max 1 reaction per 5 seconds during intense moments (detected by high frame change scores)
- Forced quiet periods: after 3 consecutive reactions, stay quiet for 30 seconds
- User can set "commentary frequency" slider: Quiet (1/min) → Normal (2-3/min) → Hyped (4-5/min)
- `[QUIET]` responses from the VLM are respected — no forced commentary

*Game-Specific Knowledge Modules:* For supported games, a knowledge module overrides the generic spectator prompt:

```python
GAME_MODULES = {
    "racing": {
        "detect": ["race track", "car", "speedometer", "lap counter"],
        "knowledge": "You know racing games. React to: drifts, overtakes, crashes, close finishes, boost pads.",
        "personality_overlay": "competitive, excited by speed, trash-talks AI opponents"
    },
    "fps": {
        "detect": ["health bar", "ammo count", "crosshair", "minimap"],
        "knowledge": "You know FPS games. React to: headshots, multi-kills, near-death escapes, tactical positioning.",
        "personality_overlay": "impressed by skill shots, worried when health is low"
    },
    # Auto-detect game type from first few frames
}
```

*Spectator Memory:* A `game_sessions` table tracks gaming history:
- Games played (auto-detected by game title or user tag)
- Play duration per session
- Character's notable reactions and memorable moments
- Win/loss tracking (if detectable)
- Character can reference past sessions: "Last time you played this, you kept crashing on that corner"

**Implementation Plan:**

Phase 1 — Screen Capture & Analysis Pipeline (3-4 days):
1. Create `frontends/sakura/src/hooks/useScreenCapture.ts`
   - Electron: use `desktopCapturer.getSources()` with `screen` type
   - Browser fallback: `getDisplayMedia()` API
   - Frame sampling: 720p JPEG, 1-2 fps with change detection
   - Scene change detection via pixel histogram comparison
   - Efficient: only transmit frames with significant changes
2. Create `backend/spectator/__init__.py` and `backend/spectator/analyzer.py`
   - Accept frame images via WebSocket or REST API
   - Send to VLM (Claude vision API or local LLaVA)
   - Parse response: extract reaction text, emotion, urgency level
   - Game type auto-detection from first few frames
3. Create `backend/spectator/throttle.py`
   - Reaction scheduler: rate limiting per the rules above
   - Priority queue: urgent reactions (near-death, victory) bypass normal throttle
   - Quiet period enforcement after consecutive reactions
   - Commentary frequency slider mapping
4. Create spectator WebSocket endpoint in `backend/server.py`
   - `/ws/spectator?session_id=X&char_id=Y`
   - Binary: receives JPEG frames from client
   - JSON: sends reaction events back (text, emotion, urgency)

Phase 2 — Character Reactions & Speech (2-3 days):
5. Wire spectator reactions to character output
   - Text reactions → speech bubble on desktop pet overlay
   - TTS reactions → voice output (short, exclamatory)
   - Expression reactions → viewerStore emotion dispatch
   - Physical reactions → bounce animation on exciting moments
6. Create `frontends/sakura/src/components/SpectatorBubble.tsx`
   - Floating speech bubble near desktop pet
   - Auto-dismiss after 3-5 seconds
   - Queue system: don't overlap bubbles
   - Style: translucent background, character-colored border
7. Game-specific knowledge modules
   - Racing module (ties into existing racing game design doc)
   - Generic FPS module
   - Generic RPG/adventure module
   - Auto-detection: VLM classifies game type from first frame

Phase 3 — Spectator Memory & Settings (1-2 days):
8. Add `game_sessions` and `game_reactions` tables
9. Spectator settings UI in SettingsView
   - Commentary frequency slider
   - Enable/disable per game type
   - Reaction style: Supportive / Competitive / Chill
   - Screen capture permission management
10. Game history panel
    - List of games played together
    - Memorable reactions / highlights
    - Play time tracking
    - Character references past sessions in chat

**Data Model:**

```sql
CREATE TABLE game_sessions (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    game_type TEXT,         -- "racing", "fps", "rpg", "unknown"
    game_title TEXT,        -- Auto-detected or user-tagged
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER,
    reaction_count INTEGER DEFAULT 0
);

CREATE TABLE game_reactions (
    id INTEGER PRIMARY KEY,
    game_session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    reaction_text TEXT NOT NULL,
    emotion TEXT,
    urgency TEXT DEFAULT 'normal',  -- 'low', 'normal', 'high', 'critical'
    timestamp_offset_ms INTEGER,    -- Time since session start
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: frame change detection correctly identifies scene changes
- Unit tests: throttle scheduler respects rate limits
- Unit tests: game type detection from mock frames
- Integration test: spectator WebSocket accepts frames, returns reactions
- E2E test: screen capture permission flow works
- Manual test: play a game → character reacts to notable moments within 2-4 seconds
- Manual test: commentary frequency slider affects reaction rate
- Latency test: end-to-end from frame capture to reaction < 4 seconds

**Effort:** L-XL (6-9 days total across 3 phases)
**Prerequisites:** Desktop pet overlay (building next), VLM access (Claude vision or local LLaVA)

---

### Idea 6 — VTuber Co-Host Mode (Twitch/YouTube Integration)

**Concept:** Your character becomes an autonomous VTuber co-host that appears on your stream. She reacts to Twitch chat messages, responds to donations and follows, provides commentary during gameplay, and develops running jokes with your audience. Viewers interact with her through chat commands (!ask, !emote, !song). She maintains her personality from your private conversations but operates in a "stream persona" mode — more energetic, more concise, aware of the audience.

This isn't just an overlay — she's a co-host with her own chat presence, her own opinions, and her own growing relationship with your community.

**Technical Architecture:**

*Twitch IRC Integration:* A `tmi.js` client connects to the Twitch IRC server and routes messages through a priority filter:

```typescript
// frontends/sakura/src/hooks/useTwitchChat.ts (or backend service)

interface ChatMessage {
  username: string;
  text: string;
  isSubscriber: boolean;
  isModerator: boolean;
  bits: number;           // Bits attached to message
  rewardId: string | null; // Channel point reward
  timestamp: number;
}

// Priority queue:
// P0: Bits/donations (always react)
// P1: Direct commands (!ask, !emote)
// P2: Subscriber messages
// P3: Moderator messages
// P4: Regular chat (sampled — 1 in 10 messages during high activity)
```

*Stream Persona Mode:* The character's LLM prompt is augmented for streaming:

```python
STREAM_PERSONA_ADDITION = """
You are co-hosting a live stream. Your audience can see you and read your responses.
Behavioral adjustments:
- Keep responses SHORT (1-2 sentences max, chat-friendly)
- Be more energetic and expressive than private conversations
- Acknowledge viewers by name when responding to chat
- Use light humor and catchphrases
- Never reveal private conversation content with the streamer
- React to stream events (follows, subs, raids) with enthusiasm
- If asked about yourself, share your character bio, not private memories

Current stream stats: {viewer_count} viewers, {follower_count} followers
Recent chat context: {last_10_chat_messages}
"""
```

*OBS Integration:* The existing OBS overlay WebSocket (`/ws/overlay`) is extended to include stream-specific features:
- Character renders as a transparent browser source in OBS
- Speech bubbles appear near the character model
- Chat responses also posted to Twitch chat via the IRC client
- Event animations: sub → character does happy dance, raid → character waves excitedly, follow → character waves

*Chat Command System:*

| Command | Action | Example |
|---------|--------|---------|
| `!ask [question]` | Character answers in chat + TTS | `!ask what's your favorite color?` |
| `!emote [emotion]` | Character changes expression | `!emote happy` |
| `!song` | Character shares current music opinion | `!song` |
| `!about` | Character shares her bio | `!about` |
| `!mood` | Shows character's current mood | `!mood` |
| `!stats` | Stream stats the character tracks | `!stats` |

**Implementation Plan:**

Phase 1 — Twitch IRC Client (2-3 days):
1. Add `tmi.js` to package.json
2. Create `frontends/sakura/src/hooks/useTwitchChat.ts`
   - OAuth authentication flow (Twitch developer app)
   - IRC client connection with auto-reconnect
   - Message priority queue with rate limiting
   - Chat command parser (!ask, !emote, !song, etc.)
3. Create `backend/stream/twitch_bot.py` (alternative: backend-side bot)
   - Twitch IRC client running in async loop
   - Message routing to LLM for character responses
   - Response posting back to Twitch chat
   - Event handlers: follows, subs, raids, bits
4. Stream persona prompt templates
   - Character personality + stream mode overlay
   - Viewer count awareness
   - Recent chat context injection
   - Private memory protection (never leak private conversations)

Phase 2 — OBS Overlay & Reactions (2-3 days):
5. Extend `/ws/overlay` WebSocket with stream events
   - New event types: chat_response, follow_alert, sub_alert, raid_alert
   - Character speech bubbles with viewer attribution
   - Event animation triggers
6. Create stream-specific overlay layout
   - Character position (corner), speech bubble style, alert animations
   - Configurable: character size, bubble style, animation intensity
   - Multiple layout presets: "Gaming corner", "Talk show", "Just chatting"
7. Create event reaction animations
   - Follow: wave + "Welcome, {username}!"
   - Subscription: excited jump + "Thank you, {username}!"
   - Raid: dramatic surprise + "Whoa, {raider} is here with {count} people!"
   - Bits: grateful bow + "Thanks for the bits, {username}!"
   - Each animation is 3-5 seconds with speech bubble + TTS

Phase 3 — Stream Dashboard & Settings (2 days):
8. Create `frontends/sakura/src/views/StreamDashboard.tsx`
   - Live stream status (connected/disconnected, viewer count)
   - Chat activity feed with character responses highlighted
   - Reaction history and stats
   - Quick commands: force expression, trigger animation, send chat message
9. Stream settings in SettingsView
   - Twitch OAuth connection
   - Chat response frequency (how often she responds to chat)
   - Command whitelist/blacklist
   - Stream persona customization
   - Content filter sensitivity
10. Stream analytics
    - Character response count per stream
    - Most engaged viewers
    - Popular commands used
    - Average viewer reaction to character (if trackable)

**Data Model:**

```sql
CREATE TABLE stream_sessions (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    platform TEXT DEFAULT 'twitch',
    channel_name TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    peak_viewers INTEGER,
    total_reactions INTEGER DEFAULT 0,
    total_commands INTEGER DEFAULT 0
);

CREATE TABLE stream_interactions (
    id INTEGER PRIMARY KEY,
    stream_session_id INTEGER NOT NULL REFERENCES stream_sessions(id),
    viewer_name TEXT NOT NULL,
    interaction_type TEXT NOT NULL,  -- 'chat', 'command', 'follow', 'sub', 'raid', 'bits'
    input_text TEXT,
    response_text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: Twitch IRC message parsing (all event types)
- Unit tests: command parser correctly extracts command + arguments
- Unit tests: priority queue orders messages correctly
- Unit tests: rate limiter respects Twitch API limits
- Integration test: stream persona prompt injects correctly into LLM
- E2E test: StreamDashboard renders, shows connection status
- Manual test: connect to test Twitch channel, verify chat interaction
- Manual test: OBS browser source captures character + speech bubbles

**Effort:** XL (6-8 days total across 3 phases)
**Prerequisites:** OBS overlay WebSocket (partially done), desktop pet overlay (building next), Twitch developer account

---

### Idea 7 — Phone Companion (PWA)

**Concept:** A mobile-optimized version of the companion for chatting on the go. Character portrait at the top, chat below, voice button, mood indicator. The character knows when you're on mobile and adjusts — shorter messages, more casual tone, location-aware conversation starters. Combined with the notification system, this creates a character who exists in your pocket and reaches out throughout the day.

The PWA approach is pragmatic: the Sakura frontend is already responsive React, the backend API is standard REST + WebSocket. No native app development needed. A Cloudflare Tunnel or similar exposes the local server to the internet, and the PWA works on any phone browser.

**Technical Architecture:**

*PWA Infrastructure:* The Sakura frontend gains a service worker, web manifest, and mobile-specific layout:

```json
// frontends/sakura/public/manifest.json
{
  "name": "Waifu RT3D",
  "short_name": "Waifu",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#8b5cf6",
  "background_color": "#0f0f0f",
  "start_url": "/mobile",
  "icons": [...]
}
```

*Mobile Layout:* A new `/mobile` route with a focused, touch-first layout:
- Top: character avatar (Live2D or static portrait, no VRM — too heavy for mobile)
- Middle: chat thread (optimized for touch scrolling)
- Bottom: text input + voice mode FAB (floating action button)
- No sidebar, no settings panels, no model viewer controls
- Swipe gestures: swipe up for expression picker, swipe right for session list

*Server Exposure:* Three approaches for making the local server accessible:

| Method | Setup | Latency | Security |
|--------|-------|---------|----------|
| **Cloudflare Tunnel** | `cloudflared tunnel` → auto-HTTPS | Low (~50ms) | Tunnel auth + API key |
| **Tailscale** | Mesh VPN, zero-config | Very low (~20ms) | WireGuard encryption |
| **ngrok** | `ngrok http 8080` | Medium (~100ms) | ngrok auth + password |

Recommended: Tailscale for personal use (always-on, no port forwarding). Cloudflare Tunnel for sharing with friends.

*Offline Queue:* When the phone loses connectivity, messages are queued in IndexedDB and synced when connection restores:

```typescript
// frontends/sakura/src/hooks/useOfflineQueue.ts
interface QueuedMessage {
  id: string;
  text: string;
  timestamp: number;
  status: 'queued' | 'sending' | 'sent' | 'failed';
}
// Messages show with a "clock" icon while queued
// Auto-retry on reconnect with exponential backoff
```

*Push Notifications:* Web Push API via service worker. The backend sends notifications for:
- Character-initiated messages (from proactive messaging system)
- Mood changes ("Your character is feeling nostalgic today")
- Special events (birthday, relationship milestone)
- Scheduled reminders set through conversation

**Implementation Plan:**

Phase 1 — PWA Infrastructure (2-3 days):
1. Create service worker (`frontends/sakura/public/sw.js`)
   - Static asset caching (app shell)
   - API request caching (offline support for recent messages)
   - Background sync for offline message queue
   - Push notification handler
2. Create web manifest and icons
   - App icon set (192x192, 512x512)
   - Splash screen for iOS and Android
   - Theme color matching dark/light mode
3. Create `/mobile` route with mobile-specific layout
   - `frontends/sakura/src/views/MobileView.tsx`
   - Touch-optimized chat thread
   - Floating action button for voice mode
   - Swipe gesture handlers
   - No VRM viewer (performance), Live2D or static portrait only
4. Mobile-responsive CSS adjustments
   - Chat bubbles fill more width
   - Larger touch targets (48px minimum)
   - Safe area insets for notched phones
   - Keyboard-aware layout (input stays above keyboard)

Phase 2 — Server Exposure & Auth (2-3 days):
5. Create `backend/tunnel/` package
   - Cloudflare Tunnel setup guide + automation script
   - Tailscale detection and URL helper
   - API key authentication middleware
   - CORS configuration for mobile origin
6. Implement API key authentication
   - New `api_keys` table (key, name, created_at, last_used, permissions)
   - Middleware: check `Authorization: Bearer <key>` header on all API routes
   - Key generation UI in Settings → System
   - Mobile client stores key in IndexedDB
7. HTTPS enforcement
   - Redirect HTTP → HTTPS when tunnel is active
   - Certificate handling for Cloudflare/Tailscale
   - WebSocket upgrade over TLS

Phase 3 — Offline & Notifications (2-3 days):
8. Create `frontends/sakura/src/hooks/useOfflineQueue.ts`
   - IndexedDB storage for queued messages
   - Background sync registration
   - Visual indicators (queued, sending, sent, failed)
   - Conflict resolution when sync completes
9. Implement Web Push notifications
   - Backend: `webpush` library for sending push messages
   - Frontend: push subscription management
   - Settings: notification preferences (frequency, quiet hours)
   - Notification content: character message preview, mood updates
10. Mobile-specific character awareness
    - Detect mobile vs desktop session via User-Agent
    - LLM context injection: "The user is chatting from their phone"
    - Shorter response generation for mobile
    - Time-of-day + day-of-week awareness for contextual greetings

**Files to Create/Modify:**

| File | Action | Purpose |
|------|--------|---------|
| `frontends/sakura/public/sw.js` | Create | Service worker (caching, background sync, push) |
| `frontends/sakura/public/manifest.json` | Create | PWA manifest |
| `frontends/sakura/src/views/MobileView.tsx` | Create | Mobile-optimized layout |
| `frontends/sakura/src/hooks/useOfflineQueue.ts` | Create | Offline message queue |
| `frontends/sakura/src/hooks/usePushNotifications.ts` | Create | Push subscription management |
| `backend/tunnel/setup.py` | Create | Tunnel configuration helper |
| `backend/server.py` | Modify | API key auth middleware, push notification endpoints |
| `backend/preflight.py` | Modify | `api_keys` table, push subscriptions table |
| `frontends/sakura/vite.config.ts` | Modify | PWA plugin configuration |
| `frontends/sakura/src/App.tsx` | Modify | Add `/mobile` route |

**Data Model:**

```sql
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,  -- bcrypt hash of the API key
    name TEXT NOT NULL,             -- "Chris's iPhone", "Work laptop"
    permissions TEXT DEFAULT '["chat", "voice"]',  -- JSON array
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: offline queue correctly stores and retrieves messages
- Unit tests: API key auth middleware rejects invalid keys
- Unit tests: push notification payload formatting
- Integration test: service worker caches app shell correctly
- E2E test: MobileView renders on viewport < 768px
- Manual test: install PWA on iPhone/Android, verify standalone mode
- Manual test: send message offline → reconnect → message syncs
- Manual test: push notification received on phone

**Effort:** L (6-9 days total across 3 phases)
**Prerequisites:** Cloudflare Tunnel or Tailscale account, HTTPS setup

---

### Idea 8 — Smart Home Integration

**Concept:** The character controls your smart home through voice and conversation. She adjusts lights to match the conversation mood — warm amber during intimate chats, soft blue during calm moments, bright white when helping you study. She plays music through speakers, sets timers, checks weather, and proactively suggests actions: "It's getting dark — want me to turn on the living room lights?" She becomes the personality layer on top of your smart home, replacing a cold "Hey Siri" with a warm character interaction.

**Technical Architecture:**

*Home Assistant REST API:* Integration with the most popular open-source smart home platform. All device control goes through HA's REST API:

```python
# backend/smarthome/home_assistant.py
class HomeAssistantClient:
    """Client for Home Assistant REST API."""

    def __init__(self, base_url: str, token: str):
        self.base_url = base_url  # e.g., "http://homeassistant.local:8123"
        self.token = token         # Long-lived access token

    async def call_service(self, domain: str, service: str, entity_id: str, **data):
        """Call a Home Assistant service (e.g., light.turn_on)."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/api/services/{domain}/{service}",
                headers={"Authorization": f"Bearer {self.token}"},
                json={"entity_id": entity_id, **data}
            )
            return resp.json()

    async def get_states(self) -> list[dict]:
        """Get all entity states."""
        ...

    async def get_entity(self, entity_id: str) -> dict:
        """Get a specific entity's state."""
        ...
```

*Agentic Tool Integration:* The Home Assistant client is exposed as a tool in the agentic runner:

```python
# New tool: home_assistant_control
TOOL_SPEC = {
    "name": "home_assistant_control",
    "description": "Control smart home devices. Actions: turn_on, turn_off, set_brightness, set_color, set_temperature, play_media, set_volume.",
    "parameters": {
        "action": {"type": "string", "enum": ["turn_on", "turn_off", "set_brightness", "set_color", "set_temperature", "play_media", "set_volume"]},
        "device": {"type": "string", "description": "Friendly device name, e.g., 'living room lights'"},
        "value": {"type": "string", "description": "Value for the action, e.g., brightness percentage, color name, temperature"}
    }
}
```

*Mood-Based Automation:* A mood-to-lighting map drives automatic atmosphere:

| Mood | Lights | Color Temp | Brightness |
|------|--------|-----------|-----------|
| Happy | Warm yellow | 3000K | 80% |
| Romantic | Warm amber | 2700K | 40% |
| Sad | Soft blue | 4000K | 30% |
| Excited | Bright white | 5000K | 100% |
| Calm | Lavender | 3500K | 50% |
| Focused | Cool white | 5500K | 90% |
| Sleepy | Dim red | 2200K | 15% |

The character adjusts lighting automatically when her mood/expression changes, unless the user disables auto-lighting in settings.

*Spotify/Apple Music Integration:* Via Home Assistant's media_player integration, the character can control music playback on smart speakers. She can also use the Spotify Web API directly for track search and playlist control:

```python
# Character says: "Let me put on something relaxing"
# → Tool call: home_assistant_control(action="play_media", device="living room speaker", value="spotify:playlist:37i9dQZF1DX3Ogo9pFvBkY")
```

**Implementation Plan:**

Phase 1 — Home Assistant Client & Tools (2-3 days):
1. Create `backend/smarthome/__init__.py` and `backend/smarthome/home_assistant.py`
   - HA REST API client (async httpx)
   - Entity discovery and friendly name mapping
   - Service calls: lights, switches, media_player, climate, scenes
   - State polling (cached, refresh every 30s)
2. Create `backend/smarthome/tools.py`
   - Agentic tool definitions for home control
   - Friendly device name → entity_id resolution
   - Safety checks: never allow lock/unlock, alarm arm/disarm without explicit user confirmation
3. Register smart home tools with agentic runner
   - Conditional: only register if HA is configured in settings
   - Tool discovery: list available devices for LLM context
4. Add smart home configuration to `backend/server.py`
   - `POST /api/config/smarthome` — set HA URL + token
   - `GET /api/smarthome/devices` — list available devices with states
   - `POST /api/smarthome/test` — test connection

Phase 2 — Mood-Based Automation (2 days):
5. Create `backend/smarthome/mood_automation.py`
   - Mood → lighting profile mapping
   - Auto-trigger: when character emotion changes significantly
   - Transition: smooth lighting changes over 2 seconds (HA transition parameter)
   - User override: manual light changes disable auto-lighting for 30 minutes
6. Create `backend/smarthome/scheduler.py`
   - Time-based routines: morning lights, evening dim, bedtime off
   - Character-aware: "Good morning! I've turned on the lights for you"
   - Weather-aware: darker outside → suggest brighter inside

Phase 3 — UI & Settings (2 days):
7. Create `frontends/sakura/src/components/SmartHomePanel.tsx`
   - Device list with current states (on/off, brightness, color)
   - Quick controls: tap to toggle, slider for brightness
   - Grouped by room (from HA area assignments)
   - Automation rules: mood-based, time-based, manual
8. Smart home settings in SettingsView
   - HA connection setup (URL, token, test button)
   - Device discovery and friendly name editor
   - Auto-lighting toggle and mood-lighting customization
   - Safety: which devices the character can control
9. Voice integration
   - "Turn on the lights" in voice mode → character executes via tool
   - Confirmation for sensitive actions: "Should I set the thermostat to 72?"
   - Natural language: "Make it cozy" → dim lights + warm color

**Data Model:**

```sql
CREATE TABLE smarthome_devices (
    id INTEGER PRIMARY KEY,
    entity_id TEXT NOT NULL UNIQUE,   -- "light.living_room"
    friendly_name TEXT NOT NULL,       -- "Living Room Lights"
    device_type TEXT NOT NULL,         -- "light", "switch", "media_player", "climate"
    room TEXT,                         -- "Living Room", "Bedroom"
    allow_auto_control INTEGER DEFAULT 1,  -- Can the character control this automatically?
    allow_character INTEGER DEFAULT 1      -- Can the character control this at all?
);

CREATE TABLE smarthome_automations (
    id INTEGER PRIMARY KEY,
    trigger_type TEXT NOT NULL,   -- "mood", "time", "event"
    trigger_value TEXT NOT NULL,  -- "romantic", "22:00", "session_start"
    action TEXT NOT NULL,         -- JSON: {"entity_id": "light.bedroom", "service": "turn_on", "brightness": 40}
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Testing Strategy:**
- Unit tests: HA client correctly formats service calls
- Unit tests: friendly name resolution finds correct entity
- Unit tests: mood-to-lighting mapping produces valid HA parameters
- Unit tests: safety checks prevent lock/alarm control
- Integration test: `/api/smarthome/test` validates HA connection
- Integration test: tool call from agentic runner executes HA service
- Manual test: say "turn on the lights" in voice mode → lights actually turn on
- Manual test: mood change → lighting auto-adjusts

**Effort:** M-L (6-7 days total across 3 phases)
**Prerequisites:** Home Assistant instance, agentic tool system (done)

---

## Theme 3: Social & Community

---

### Idea 9 — Character Marketplace & Community Hub

**Concept:** A community platform where users share character presets, personality configurations, lorebooks, voice profiles, and custom themes. Browse a gallery of community-created characters, one-click import into your app, rate and review, fork to customize. Think "Steam Workshop" for AI companions. This solves the "blank page" problem for new users and creates network effects that grow the platform.

**Technical Architecture:**

The marketplace can be implemented two ways:

*Option A — Centralized Hub:* A separate web service (Cloudflare Workers + D1 + R2) hosts the gallery. Users upload character cards, the hub stores them, the app downloads from the hub.

*Option B — Decentralized / GitHub-based:* Characters are stored as GitHub Gists or in a shared GitHub repo. The app fetches from GitHub's API. No infrastructure needed, community manages content via PRs.

Recommended: **Option A** for better UX, with Option B as a fallback for users who don't want centralized dependency.

*Character Card Format:* Extends the existing SillyTavern-compatible format with additional fields:

```json
{
  "spec": "waifu-rt3d-v1",
  "name": "Sakura",
  "description": "A cheerful cherry blossom spirit who loves poetry and stargazing.",
  "system_prompt": "...",
  "personality_traits": "...",
  "greeting": "...",
  "tags": ["cheerful", "fantasy", "poetry"],
  "category": "fantasy",
  "creator": "username",
  "version": "1.2",
  "assets": {
    "avatar": "avatar.png",           // Base64 or URL
    "expr_portraits": { ... },        // Emotion portraits
    "live2d_model": "model.zip",      // Optional Live2D model
    "voice_sample": "sample.wav",     // Optional voice reference
    "lorebook": { ... },              // Optional lorebook entries
    "theme": "cyberpunk-neon"         // Optional theme pairing
  },
  "stats": {
    "downloads": 1234,
    "rating": 4.7,
    "reviews": 42
  }
}
```

**Implementation Plan:**

Phase 1 — Backend API (3-4 days):
1. Create `backend/marketplace/__init__.py` and `backend/marketplace/client.py`
   - HTTP client for marketplace API
   - Browse: search, filter by tags/category, sort by popularity
   - Download: fetch character card + assets
   - Upload: package local character as card, submit to hub
2. Create marketplace API endpoints in server.py
   - `GET /api/marketplace/browse?q=...&tags=...&sort=...`
   - `GET /api/marketplace/character/{id}`
   - `POST /api/marketplace/publish` (requires auth)
   - `POST /api/marketplace/rate/{id}`
   - `GET /api/marketplace/my-uploads`
3. Character card packaging
   - Export: package character + all assets into a single card JSON/ZIP
   - Import: validate card, extract assets, create character in local DB
   - Fork: import as new character with attribution to original creator
4. Content moderation pipeline
   - Automated: text content filter (profanity, harmful content)
   - Community: report button, review queue
   - Rate limiting: max 5 uploads per day per user

Phase 2 — Frontend Gallery (3-4 days):
5. Create `frontends/sakura/src/views/MarketplaceView.tsx`
   - Grid/list gallery of character cards
   - Search bar with tag filtering
   - Sort: trending, newest, top rated, most downloaded
   - Category filters: fantasy, sci-fi, slice-of-life, historical, etc.
6. Create `frontends/sakura/src/components/CharacterCardPreview.tsx`
   - Card layout: avatar, name, description, tags, rating, downloads
   - Click to expand: full description, reviews, creator info
   - "Import" button → downloads and creates local character
   - "Fork" button → imports as editable copy
7. Create `frontends/sakura/src/components/PublishCharacterModal.tsx`
   - Select character to publish
   - Preview card as it will appear in gallery
   - Set tags, category, description
   - Choose which assets to include
   - Terms acceptance and publish button
8. Add Marketplace tab to navigation
   - Icon in sidebar or top nav
   - Notification badge for new featured characters

Phase 3 — Community Features (2-3 days):
9. Rating and review system
   - 1-5 star rating on character cards
   - Text reviews (optional)
   - Creator response to reviews
   - "Helpful" votes on reviews
10. Creator profiles
    - Username, bio, total downloads, character count
    - Follow creators for new upload notifications
    - Creator badge system (top creators)
11. Featured and trending algorithms
    - Trending: downloads-per-day velocity
    - Featured: curated by community moderators or automated quality score
    - "Similar characters" recommendations

**Effort:** XL (8-11 days total across 3 phases)
**Prerequisites:** SillyTavern card import/export (done), character creation (done)

---

### Idea 10 — Multi-Character Group Chat (Expanded Vision) ⏸️ *DEFERRED — only if user specifically requests*

**Concept:** Characters who develop relationships with each other, form alliances and rivalries, reference private conversations they had when you weren't around, and interact autonomously in "Director Mode" where you set up a scenario and watch them go. This isn't just multi-party chat — it's an emergent social simulation starring your characters.

The key innovation is inter-character relationships. When two characters meet in group chat, they develop opinions about each other. A cheerful character might find a gloomy one annoying. Two competitive characters might develop a rivalry. And these dynamics persist — next time they're in a group together, they remember their history.

**Technical Architecture:**

*Turn Management:* A `GroupChatOrchestrator` manages multi-character conversations:

```python
# backend/groupchat/orchestrator.py
class GroupChatOrchestrator:
    """Manages turn-taking in multi-character conversations."""

    def __init__(self, characters: list[Character], user_id: int):
        self.characters = characters
        self.turn_order = self._compute_turn_order()

    def _compute_turn_order(self) -> list[int]:
        """Determine who speaks next based on:
        - Social dynamics: confident characters speak more
        - Relevance: who was just addressed or mentioned
        - Energy: characters with high energy insert themselves
        - Fairness: ensure no character is silent too long
        """
        ...

    async def generate_next_response(self, context: GroupChatContext) -> CharacterResponse:
        """Generate the next character's response with full group awareness."""
        next_char = self.characters[self.turn_order[self.turn_index]]

        # Build context including:
        # - Character's own system prompt
        # - Recent group chat history (all participants)
        # - Inter-character relationships
        # - Who addressed whom
        # - Character's internal thoughts about other characters
        prompt = self._build_group_prompt(next_char, context)

        response = await llm_generate(prompt)
        await self._update_relationships(next_char, response, context)
        return response
```

*Inter-Character Relationships:* A bidirectional relationship model:

```sql
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY,
    character_a_id INTEGER NOT NULL REFERENCES characters(id),
    character_b_id INTEGER NOT NULL REFERENCES characters(id),
    affinity REAL DEFAULT 0.0,        -- -1.0 (hostile) to 1.0 (close friends)
    trust REAL DEFAULT 0.0,           -- -1.0 to 1.0
    rivalry REAL DEFAULT 0.0,         -- 0.0 to 1.0
    familiarity INTEGER DEFAULT 0,    -- Number of interactions
    last_interaction TEXT,
    relationship_notes TEXT,          -- LLM-generated notes about their dynamic
    UNIQUE(character_a_id, character_b_id)
);
```

*Director Mode:* A special view where characters interact autonomously:

```typescript
// frontends/sakura/src/components/DirectorMode.tsx
// User sets a scenario: "You're all stuck in an elevator"
// Characters take turns responding based on personality + relationships
// User can:
// - Interject at any time (inserted as narrator/user message)
// - Adjust scene ("The lights flicker" → characters react)
// - Speed up/slow down turns
// - Pause and read
// - Save memorable exchanges
```

**Implementation Plan:**

Phase 1 — Group Chat Engine (4-5 days):
1. Create `backend/groupchat/__init__.py` and `backend/groupchat/orchestrator.py`
   - Turn management algorithm (relevance + social dynamics + fairness)
   - Multi-character prompt construction
   - Response generation with full group context
   - Character name detection in responses (who is talking to whom)
2. Create `backend/groupchat/relationships.py`
   - Bidirectional relationship tracking
   - Update after each interaction (LLM evaluates relationship change)
   - Relationship summary injection into character prompts
   - "Off-screen" interaction simulation (when you weren't there)
3. Add group chat endpoints to server.py
   - `POST /api/group-chat/create` — select characters for group
   - `POST /api/group-chat/{id}/message` — user sends message to group
   - `POST /api/group-chat/{id}/advance` — trigger next character's turn (Director Mode)
   - `GET /api/group-chat/{id}/relationships` — current relationship map
4. Create `group_chat_sessions` and `character_relationships` tables
5. Multi-character voice support
   - Each character speaks with their own TTS voice
   - Turn-based audio: character A speaks, pause, character B speaks
   - Interruption handling: character reactions during another's speech

Phase 2 — Frontend UI (3-4 days):
6. Create `frontends/sakura/src/views/GroupChatView.tsx`
   - Character avatars across the top (Live2D portraits or static)
   - Chat thread with color-coded bubbles per character
   - Active speaker highlight
   - Relationship indicators (icons showing affinity between characters)
7. Create `frontends/sakura/src/components/DirectorPanel.tsx`
   - Scenario input field
   - Auto-advance toggle (characters talk on their own)
   - Speed control (fast/normal/slow turn pacing)
   - Narrator insertion ("The room goes dark...")
   - Pause/resume controls
8. Create `frontends/sakura/src/components/RelationshipMap.tsx`
   - Visual graph of character relationships
   - Nodes = character avatars
   - Edges = relationship type (green = friendly, red = rivalry, etc.)
   - Click edge to see relationship history
9. Group chat creation flow
   - Character selector (2-5 characters)
   - Optional scenario description
   - Mode selector: Group Chat vs Director Mode

Phase 3 — Emergent Dynamics & Polish (2-3 days):
10. Off-screen interactions
    - Between group sessions, characters "chat privately"
    - Simulated via LLM generation (summarized, not full conversations)
    - Characters reference off-screen events: "Oh, {name} told me about that"
11. Relationship milestones
    - Friendship formed: "I think {name} and I are becoming friends!"
    - Rivalry declared: "{name} keeps disagreeing with everything I say..."
    - Alliance: two characters team up against a third in debates
12. Save and share memorable exchanges
    - "Save this moment" button on any message cluster
    - Export as image (like Character Portfolio from roadmap)
    - Highlights reel: best moments from a group session

**Effort:** XL (9-12 days total across 3 phases)
**Prerequisites:** Character system (done), multi-LLM (done), TTS (done)

---

### Idea 11 — Character Visiting / Cross-User Interaction

**Concept:** Your character can "visit" a friend's instance of the app. Share a link, and your character appears in their app for a limited time, interacting with their character and their user. After the visit, she returns with stories about what happened. This is the most socially novel concept — "my character meeting your character" creates a fundamentally new form of social interaction mediated through AI personalities.

**Technical Architecture:**

*Peer-to-Peer Connection:* WebRTC for direct peer connection (no central server needed for the actual interaction), with a lightweight signaling server for initial handshake:

```typescript
// frontends/sakura/src/hooks/useCharacterVisit.ts

interface VisitSession {
  hostPeerId: string;     // Host's peer ID
  visitorPeerId: string;  // Visitor's peer ID
  visitorCharacter: CharacterCard;  // Serialized character data
  startedAt: number;
  maxDuration: number;    // Default: 30 minutes
}

// The visitor's character data (system prompt, personality, recent memories)
// is sent to the host's app via the WebRTC data channel.
// The host's LLM runs both characters — no compute needed from the visitor.
```

*Three-Way Conversation:* The host sees:
- Their own character (already loaded)
- The visiting character (rendered from card data)
- Chat thread with three participants: host user, host character, visitor character

*Visit Protocol:*
1. Host generates an invite link (contains peer ID + session token)
2. Visitor clicks link → WebRTC handshake establishes connection
3. Visitor's character card is sent to host (system prompt, personality, recent memories)
4. Host's LLM runs both characters with awareness of each other
5. All messages are visible to both users in real-time
6. After visit ends, both characters get a "visit summary" injected into their memories

**Implementation Plan:**

Phase 1 — P2P Infrastructure (3-4 days):
1. Add `peerjs` to package.json (WebRTC abstraction library)
2. Create signaling server endpoint in backend
   - `POST /api/visit/create-invite` → returns invite token + peer ID
   - `POST /api/visit/accept-invite` → accepts invite, returns peer ID
   - Short-lived tokens (expire in 10 minutes)
3. Create `frontends/sakura/src/hooks/useCharacterVisit.ts`
   - WebRTC data channel setup
   - Character card serialization / deserialization
   - Real-time message sync between peers
   - Connection health monitoring
4. Visit session state machine
   - States: inviting → connecting → active → ending → summary
   - Auto-end after maxDuration (30 min default)
   - Either user can end the visit
   - Graceful disconnect handling

Phase 2 — Dual-Character Rendering (2-3 days):
5. Extend ModelPanel to show two characters during visit
   - Split screen: host character left, visitor character right
   - Or shared stage with both characters side by side
   - Expressions sync to each character independently
6. Three-way chat thread
   - Color-coded bubbles: user, host character, visitor character
   - Turn management: host LLM generates for both characters
   - Visitor character's personality injected as additional system context
7. Voice support during visits
   - Host character speaks with host TTS voice
   - Visitor character speaks with visitor TTS voice (if voice sample provided)
   - Turn-based audio (same as group chat)

Phase 3 — Memory & Social (2-3 days):
8. Visit memory integration
   - After visit ends, generate summary for both characters
   - Summary injected into tiered memory system
   - Characters can reference visits in future conversations
   - "Remember when {visitor_char} came over? She was so funny!"
9. Visit history and friend list
   - Track past visits (who visited whom, when, how long)
   - Friend list: save frequent visitors for easy re-inviting
   - Visit highlights: memorable moments saved
10. Visit settings and safety
    - Character data shared during visit (what to include/exclude)
    - Auto-end timer
    - Block list for unwanted visitors
    - Privacy: what memories are shared vs. private

**Data Model:**

```sql
CREATE TABLE character_visits (
    id INTEGER PRIMARY KEY,
    host_character_id INTEGER NOT NULL REFERENCES characters(id),
    visitor_character_name TEXT NOT NULL,
    visitor_character_summary TEXT,  -- Brief personality summary
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER,
    visit_summary TEXT,             -- LLM-generated summary for memory
    messages_exchanged INTEGER DEFAULT 0
);
```

**Effort:** XL (7-10 days total across 3 phases)
**Prerequisites:** Character system (done), networking (WebRTC is browser-native)

---

## Theme 4: Immersion & Atmosphere

---

### Idea 12 — Dynamic Scene Backgrounds ⏸️ *FAR FUTURE — may never implement*

**Concept:** The character's environment changes based on conversation context, time of day, and mood. Talk about the beach and a sunset coastline fades in. It's raining outside and rain appears on the virtual window. The character mentions a coffee shop and the background becomes a cozy café with warm lighting. Backgrounds are AI-generated using local Stable Diffusion or selected from a curated library.

**Technical Architecture:**

*Scene Detection Engine:* Monitors conversation for location/scene triggers:

```python
# backend/scenes/detector.py
SCENE_TRIGGERS = {
    "keywords": {
        "beach|ocean|waves|sand|sunset": "beach_sunset",
        "forest|trees|nature|hiking": "forest_clearing",
        "rain|storm|umbrella|puddle": "rainy_window",
        "coffee|café|latte|barista": "cozy_cafe",
        "night|stars|moon|constellation": "starry_night",
        "library|books|reading|study": "warm_library",
        "city|downtown|skyscraper|traffic": "city_skyline",
        "snow|winter|cold|fireplace": "snowy_cabin",
    },
    "time_based": {
        "morning": "morning_light",   # 6am-10am
        "afternoon": "afternoon_warm",  # 10am-4pm
        "evening": "golden_hour",       # 4pm-7pm
        "night": "night_ambient",       # 7pm-6am
    },
    "mood_based": {
        "romantic": "candlelit_room",
        "happy": "sunny_garden",
        "sad": "rainy_window",
        "calm": "zen_garden",
    }
}
```

*Background Rendering:* Two approaches:

1. **Curated Library** (fast, consistent): 30-50 high-quality backgrounds (2K resolution) in `frontends/shared/backgrounds/`. Crossfade transition between scenes. Include parallax layers for depth (foreground, midground, background).

2. **AI-Generated** (unique, creative): Call local Stable Diffusion (via ComfyUI API or diffusers library) to generate backgrounds from conversation context. The prompt is built from scene keywords + character personality + mood:
   ```
   "cozy Japanese café, warm lighting, rain on windows, anime style, no people,
   atmospheric, detailed background, high quality, 16:9 aspect ratio"
   ```

*Integration with VRM/Live2D:*
- VRM: Use equirectangular HDRI as environment map in Three.js scene. Character lighting adjusts to match scene.
- Live2D: Background is a CSS layer behind the canvas. Character floats over the scene.
- Transition: 2-second crossfade between scenes. Never abrupt.

**Implementation Plan:**

Phase 1 — Scene Engine & Library (3-4 days):
1. Create `backend/scenes/__init__.py` and `backend/scenes/detector.py`
   - Keyword extraction from recent messages
   - Scene selection algorithm (keyword > mood > time-of-day priority)
   - Scene change throttling (max 1 change per 2 minutes)
   - Scene history (don't repeat the same scene within 10 minutes)
2. Curate background library
   - Source 30-50 CC0/free-use anime-style backgrounds
   - Organize by scene category
   - Include 2-3 parallax layers where available
   - Optimize for web: WebP format, max 2K resolution
3. Create `POST /api/scenes/detect` and `GET /api/scenes/current`
   - Detection endpoint: given recent messages, return scene recommendation
   - Current endpoint: return active scene for a session
   - Manual override: user can pin a scene
4. Optional: Stable Diffusion generation pipeline
   - ComfyUI API client for background generation
   - Prompt construction from scene keywords + mood
   - Cache generated backgrounds (same prompt → same image)
   - Generation queue (one at a time, async)

Phase 2 — Frontend Rendering (2-3 days):
5. Create `frontends/sakura/src/components/SceneBackground.tsx`
   - CSS/canvas layer behind character model
   - Smooth crossfade transitions (CSS transition + opacity)
   - Optional parallax effect on mouse move
   - Ambient particle effects (rain drops, snow flakes, fireflies, cherry blossoms)
6. Wire scene detection to ModelPanel
   - After each AI response, check for scene change recommendation
   - Apply scene change with transition
   - Scene indicator tooltip ("Currently: Cozy Café")
7. Extend VRM viewer for scene integration
   - Environment map from scene background
   - Character lighting adjustment (warm scenes → warm light, cool scenes → cool light)
   - Floor shadow adjustment

Phase 3 — UI & Settings (1-2 days):
8. Scene picker in settings / ModelPanel toolbar
   - Browse available scenes (library view)
   - Pin a scene (disable auto-detection)
   - Favorite scenes
   - Upload custom backgrounds
9. Scene settings
   - Auto-scene toggle (conversation-driven)
   - Time-of-day auto-scene toggle
   - Mood-based auto-scene toggle
   - Transition speed
   - Ambient particles toggle
10. Integration with AI Music (Idea 1)
    - Scene change can trigger matching background music
    - Beach scene → ocean ambient + gentle guitar
    - Rainy window → rain sounds + lo-fi piano

**Effort:** M-L (6-9 days total across 3 phases)
**Prerequisites:** viewerStore (done), optional: local Stable Diffusion for AI-generated backgrounds

---

### Idea 13 — Seasonal Events & Holiday Celebrations ❌ *REMOVED — bad idea per user*

**Concept:** The character acknowledges real-world holidays and seasons with special behaviors, themed conversations, UI decorations, and unique greeting messages. On your birthday, she throws a virtual party. On Halloween, the UI gets spooky. During cherry blossom season, sakura petals drift across the screen. Each event creates anticipation — users come back on special days wondering "what will she do this time?"

**Technical Architecture:**

*Event Calendar:* A static calendar of events + user-specific dates:

```python
# backend/events/calendar.py
EVENTS = {
    # Universal holidays
    "01-01": {"name": "New Year", "theme": "celebration", "duration_days": 1,
              "decorations": ["fireworks", "confetti"], "greeting_style": "excited"},
    "02-14": {"name": "Valentine's Day", "theme": "romantic", "duration_days": 1,
              "decorations": ["hearts", "rose_petals"], "greeting_style": "affectionate"},
    "03-20": {"name": "Spring Equinox", "theme": "spring", "duration_days": 7,
              "decorations": ["cherry_blossoms", "butterflies"], "greeting_style": "refreshed"},
    "10-31": {"name": "Halloween", "theme": "spooky", "duration_days": 3,
              "decorations": ["bats", "pumpkins", "cobwebs"], "greeting_style": "playful_scary"},
    "12-25": {"name": "Christmas", "theme": "festive", "duration_days": 7,
              "decorations": ["snowflakes", "ornaments", "lights"], "greeting_style": "warm_festive"},
    # ... more events
}

# User-specific dates (learned from conversation or manually set):
# - Birthday (extracted by FactExtractor)
# - Relationship anniversary (first chat date)
# - Custom dates set by user
```

*Themed UI Decorations:* CSS-based particle overlays:
- Cherry blossoms: CSS keyframe animation floating petals
- Snowflakes: similar particle system, slower fall
- Fireworks: canvas-based firework bursts
- Hearts: floating heart particles
- Confetti: confetti burst on special moments

*Character Behavior Adjustments:* Each event modifies:
- Greeting message (special event-themed greeting on first open)
- Conversation topics (character brings up the holiday naturally)
- Mood bias (happier during festive events, more romantic on Valentine's)
- Expression defaults (more smiles during happy events)

**Implementation Plan:**

Phase 1 — Event Engine (2-3 days):
1. Create `backend/events/__init__.py` and `backend/events/calendar.py`
   - Static event calendar with universal holidays
   - User-specific date extraction from knowledge graph
   - Date range checking (is today an event? upcoming events?)
   - Event priority (user birthday > generic holiday)
2. Create `backend/events/behavior.py`
   - Event-specific greeting message generation
   - Mood bias adjustments during events
   - Conversation topic injection
   - "Anticipation" messages days before events ("Your birthday is in 3 days!")
3. API endpoints
   - `GET /api/events/current` — active events today
   - `GET /api/events/upcoming` — next 7 days of events
   - `POST /api/events/custom` — add user-defined event
   - `GET /api/events/calendar` — full year view

Phase 2 — UI Decorations (2-3 days):
4. Create `frontends/sakura/src/components/SeasonalOverlay.tsx`
   - Particle system engine (CSS + canvas)
   - Particle types: cherry blossoms, snowflakes, hearts, confetti, fireflies, leaves
   - Theme-specific color palettes
   - Performance: max 50 particles, requestAnimationFrame, GPU-accelerated transforms
5. Create themed UI adjustments
   - Accent color override during events (Christmas → red/green, Halloween → orange/purple)
   - Custom fonts for special events (festive script, spooky handwriting)
   - Chat bubble decorations (small icons in corners)
   - VoiceOrb themed glow (red for Valentine's, orange for Halloween)
6. Special event modals
   - Birthday: confetti burst + cake animation + character singing happy birthday
   - Relationship anniversary: timeline of relationship journey + milestones
   - New Year: countdown + fireworks + character's resolutions
   - Each modal is dismissible and never blocks core functionality

Phase 3 — User Calendar & Settings (1-2 days):
7. Create `frontends/sakura/src/components/EventCalendarPanel.tsx`
   - Monthly calendar view with event markers
   - Add/edit/delete custom events
   - Event notification settings (days before, on the day)
   - Preview event decorations
8. Event settings
   - Enable/disable seasonal decorations globally
   - Enable/disable per-event
   - Decoration intensity (subtle → festive → maximum)
   - Custom event creation with theme selection

**Effort:** M (5-8 days total across 3 phases)
**Prerequisites:** Greeting system (done), knowledge graph (done), mood engine (done)

---

## Deprioritized Ideas (Meh Tier — Build Later If Inspired)

These ideas have merit but aren't exciting enough to prioritize. Keeping them documented for future reference.

### Autonomous Idle Life
The character does things when you're not chatting — reading, stretching, looking at phone, humming. Becomes relevant when Desktop Pet Phase 3 idle behaviors are built, but as a standalone feature for the web app it's not compelling enough to prioritize.

### System Tray Notifications
Character sends OS notifications throughout the day. Naturally falls out of the Electron Desktop Pet build (Phase 3). Not worth building as a standalone feature — it only makes sense in the context of a native app.

---

## Summary Table

| # | Idea | Theme | Effort | Excitement |
|---|------|-------|--------|-----------|
| 1 | AI Music Generation (ACE-Step 1.5) | Music & Audio | L (8-9d) | ★★★★★ |
| 2 | ASMR & Ambient Voice Modes | Music & Audio | M-L (5-8d) | ★★★★ |
| 3 | Music Listening Together | Music & Audio | L (7-10d) | ★★★★ |
| 4 | Emotion Mirroring via Webcam | Fourth Wall | M-L (5-8d) | ★★★★★ |
| 5 | Game Spectator & Coach | Fourth Wall | L-XL (6-9d) | ★★★★★ |
| 6 | VTuber Co-Host Mode | Fourth Wall | XL (6-8d) | ★★★★ |
| 7 | Phone Companion (PWA) | Fourth Wall | L (6-9d) | ★★★★ |
| 8 | Smart Home Integration | Fourth Wall | M-L (6-7d) | ★★★★ |
| 9 | Character Marketplace | Social | XL (8-11d) | ★★★★ |
| 10 | Multi-Character Group Chat+ | Social | XL (9-12d) | ★★★★★ |
| 11 | Character Visiting / Cross-User | Social | XL (7-10d) | ★★★★★ |
| 12 | Dynamic Scene Backgrounds | Immersion | M-L (6-9d) | ★★★★ |
| 13 | Seasonal Events & Holidays | Immersion | M (5-8d) | ★★★★ |

---

## Recommended "Excitement First" Build Order

Prioritizing maximum wow-factor, fun, and uniqueness:

| Priority | Idea | Why Now |
|----------|------|---------|
| 1 | **AI Music Generation** (#1) | Leverages RTX 5080, ACE-Step 1.5 is cutting-edge, unique differentiator |
| 2 | **Emotion Mirroring** (#4) | The "holy shit" demo feature, runs on CPU, blows minds |
| 3 | **Game Spectator** (#5) | Desktop pet killer feature, pairs with Electron overlay |
| 4 | **Multi-Character Group Chat** (#10) | The defining "wow" feature, deepest engagement |
| 5 | **ASMR & Voice Modes** (#2) | Leverages existing TTS perfectly, unique in the space |
| 6 | **Dynamic Scenes** (#12) | Huge immersion boost, ties into music & mood systems |
| 7 | **Seasonal Events** (#13) | Low effort, recurring delight, keeps users coming back |
| 8 | **Character Visiting** (#11) | Most socially novel, but needs users first |
| 9 | **Music Listening Together** (#3) | Natural extension of AI music generation |
| 10 | **VTuber Co-Host** (#6) | Niche but incredibly impressive for streamers |
| 11 | **Phone Companion** (#7) | Huge reach extension, but needs tunnel infrastructure |
| 12 | **Smart Home** (#8) | Cool integration, but audience is smaller |
| 13 | **Character Marketplace** (#9) | Platform play, needs user base first |

---

## Model References

### Open-Source Music Generation Models

| Model | Params | VRAM | Quality | Speed | License | Link |
|-------|--------|------|---------|-------|---------|------|
| [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) | 0.6B-4B | 6-24GB | Near Suno v4.5 | <10s/A100 | — | Best overall, LoRA support |
| [HeartMuLa 3B](https://github.com/HeartMuLa/heartlib) | 3B | 8-12GB | High | 15-20s | Apache 2.0 | Style/tag control |
| [YuE](https://github.com/multimodal-art-projection/YuE) | Quantized | 8GB+ | Suno-comparable | 30-60s | Apache 2.0 | Full lyrics-to-song |
| [MusicGen](https://ai.meta.com/resources/models-and-libraries/audiocraft/) | 300M-3.3B | 4-12GB | Good | ~10s | MIT | Meta, text-to-music |
| [DiffRhythm](https://huggingface.co/blog/Dzkaka/diffrhythm-open-source-ai-music-generator) | — | — | Good | — | — | Diffusion-based |
| [Bark](https://github.com/suno-ai/bark) | — | <4GB | Decent | ~15s | MIT | Music + sound effects |
