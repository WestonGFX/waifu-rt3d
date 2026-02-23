# Features Specification v5.31: Audio, Animation & Intelligence

**Version**: 5.31.0 "Hybrid"
**Status**: Active Development
**Target Hardware**: Apple Silicon (M2/M3) & NVIDIA RTX Workstations

---

## 1. Advanced Audio Architecture (Voice)

We are building a "Commercial Quality" voice interaction layer. It is not enough to just playback audio; the voice must feel *native* to the character and *responsive* to the hardware.

### 1.1 Text-to-Speech (TTS) Pipeline

The system uses a **Dynamic Provider Registry** (`backend/tts.registry`).

- **Character-Specific Voices**: Each character (Rin, Nyx, etc.) has a mapped `voice_id` and `provider`.
- **Hardware-Aware Routing**:
  - **M-Series (Mac)**: Defaults to `AVFoundation` (System) or `Sherpa-ONNX` (CPU-optimized Neural) for zero-latency.
  - **NVIDIA GPU**: Defaults to `XTTS` (Coqui) or `RVC` (Voice Conversion) for broadcast-quality anime voices.

### 1.2 "Smart Switching" Workflow

When a user switches characters in the UI:

1. Frontend updates the visual theme (e.g., Red for Rin).
2. Backend seamlessly hot-swaps the TTS model/voice without restarting the server.
3. If the user is on a slow connection/hardware, it degrades gracefully to System TTS instead of stuttering.

---

## 2. Speech-to-Text (ASR) & Voice Control

Users should be able to talk to their Waifu naturally without typing.

### 2.1 Interaction Modes

- **Push-to-Talk (PTT)**:
  - **Logic**: User holds a key (Spacebar) or Mouse Button (Side Btn) to record. API calls triggers on release.
  - **Use Case**: Precise commands, noisy environments.
- **VAD (Voice Activity Detection) / Streaming**:
  - **Logic**: The app listens continuously. When silence is broken, it records. When silence returns (e.g., > 1.5s), it auto-sends.
  - **Tech**: WebAudio API (Client-side VAD) + `Whisper.cpp` (Server-side).

### 2.2 The "Smart Model Manager" (Wizard)

A built-in GUI Utility (`frontends/neon/model_manager.html`) that:

1. **Scans Hardware**: Detects VRAM, CPU Cores, and Platform (Mac/Win).
2. **Recommends Models**:
   - `Mac M2`: Recommends `Whisper-Base-CoreML`.
   - `RTX 5080`: Recommends `Whisper-Large-v3`.
3. **One-Click Install**: Downloads the GGUF/Model file to `backend/models` automatically.

---

## 3. Next-Gen Animation System

Taking the "Static" puppet and making it alive.

### 3.1 Tiered Animation Logic

| Tier | Tech | Description | Hardware |
| :--- | :--- | :--- | :--- |
| **0** | **Static** | A-Pose only. | Potato PC |
| **1** | **Procedural** | Sine-wave breathing, Blink timers, Head-look-at-cursor. | Any |
| **2** | **Reactive** | Audio-Amplitude Lipsync (Visemes), Emotion Pre-sets (Happy/Sad) triggered by LLM tags. | M1+ |
| **3** | **Generative** | **Motion Diffusion**. The AI generates a unique `.vmd` motion clip for *each reply* based on sentiment. | NVIDIA GPU |

### 3.2 Visual Customization

- **Backgrounds**:
  - **Void (Black)**: Default.
  - **Transparent (Alpha)**: For overlaying on desktop/OBS.
  - **Color Picker**: User-selected solid color/chroma key (Green Screen).
  - **Image**: Custom user upload (e.g., "Bedroom", "Space Station").

---

## 4. Persona Creator (UGC)

Users must be able to create their own Waifus without coding.

### 4.1 "Create New Character" Workflow

1. **Details**: Name, Description, System Prompt.
2. **Visuals**:
   - **Thumbnail**: Upload 2D PNG/JPG.
   - **Avatar**: Upload `.vrm` file (Auto-validates bone structure).
3. **Voice**:
   - Select from available TTS presets or Upload a 10s sample for Voice Cloning (XTTS).
4. **Save**: Writes to `waifu.db` and acts immediately.

### 4.2 Roster UI

The Character Select screen will feature:

- Grid of Cards with **2D Thumbnails**.
- "Active" indicator.
- Quick-Edit button.

---

## 5. Technical Roadmap Checklist

### Phase 1: Foundation (Completed)

- [x] Hybrid Architecture.
- [x] Basic VRM 1.0 Loading.
- [x] Database Schema v5.

### Phase 2: Input/Output (Current)

- [ ] **ASR Integration**: Implement `Whisper` backend and PTT frontend.
- [ ] **TTS Scaling**: Add `pyttsx3` fallback.

### Phase 3: Visual Polish

- [ ] **Background Switcher**: Add Alpha/Image support to Viewer.
- [ ] **Thumbnail UI**: Update `index.html` to show images in sidebar.

### Phase 4: Tools

- [ ] **Model Manager Wizard**: Create the "One-Click Installer".
- [ ] **Persona Creator UI**.
