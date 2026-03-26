# Waifu-RT3D Features

**47 features shipped** | Schema v60 | 887 tests | Desktop-only

---

## Voice & Conversation

- **Full-Duplex Voice** -- Real-time voice chat with VAD, barge-in, and automatic turn-taking via WebSocket
- **Kokoro TTS + Voice Modulation** -- 16-emotion voice parameter mapping with provider-aware modulation
- **Smart LLM Endpoint Fallback** -- Auto-failover between LLM providers with stream post-processing hooks
- **Smart Tool Protocol Detection** -- Automatic detection of model capabilities (function calling, XML, or plain text)
- **LM Studio Link + Smart Routing** -- Multi-device LLM discovery and intelligent request routing
- **Proactive AI Messages** -- Scheduler-driven messages that initiate conversation without user prompts

## Memory & Intelligence

- **Tiered Episodic Memory** -- Three-tier memory system with sqlite-vec vector search for semantic recall
- **Context Assembler** -- Token-budget-aware context assembly with 5-tier priority system
- **User Knowledge Graph** -- Automatic fact extraction and persistent user model across sessions
- **Lorebook / World Info** -- Keyword-triggered context injection for world-building details
- **Semantic Lore Matching** -- Embedding-based vector similarity for intelligent lore lookup
- **On-Device Learning** -- Signal capture, behavior adaptation, and privacy-safe local tuning
- **Adaptive Intelligence Engine** -- Trust model, mood updates, topic steering, and behavior reflection

## Characters & Personality

- **13 Characters** -- Fully realized characters with distinct personalities, voices, and backgrounds
- **Tiered Prompt System** -- CORE/EXTENDED/DEEP auto-selection based on available context budget
- **Character Moods & Time-of-Day** -- Dynamic mood engine reflecting time and conversation state
- **Bond Progression System** -- XP-based relationship levels (0-100) with gifts and story scene unlocks
- **Character Journal** -- Memory transparency API for inspecting what the character remembers
- **Content Gating** -- 4-level content system with ceiling resolver and intimacy tracking
- **Companion Opening Greeting** -- Contextual greetings based on time, mood, and relationship level
- **Author's Note** -- Injected context note at configurable token depth for narrative guidance
- **Director Mode** -- Dual-layer out-of-character stage direction injection
- **Model Catalog** -- 24 LLMs, 10 TTS, 6 STT with content ratings and 4-axis quality matrix

## 3D Avatar & Animation

- **VRM + Live2D Runtime** -- Dual renderer with viewerStore mediator dispatching to iframe (VRM) or PIXI (Live2D)
- **Animation Library + Sequencer** -- Clip library with chained sequences and emotion-to-animation mapping
- **Animation State Machine v2** -- 8-state system: idle, talk, gesture, clip, mocap, sequence, transition, emote
- **Emotion-Driven Expressions** -- LLM emotion tags automatically mapped to VRM morph targets
- **Procedural Idle Animation** -- Breathing, blinking, saccades, and hair physics running continuously
- **Micro-Expressions** -- Random facial twitches and emotion-driven body language postures
- **Touch Interaction** -- Raycasting touch zones with character reactions
- **Cinematic Camera** -- Camera preset system with smooth transitions between angles
- **Environment Poses + Lighting** -- Procedural pose system with sunrise/day/dusk/night lighting cycles

## Visual Effects

- **Anime Shaders** -- Toon/cel shading, outline rendering, and rim glow effects
- **Hair Anisotropic + Eye Sparkle** -- Specialty VRM material shaders for anime-quality rendering
- **Backgrounds + Particles** -- Gradient backgrounds, god rays, and configurable particle systems
- **Cinematic Immersion Mode** -- Fullscreen mode with hidden UI for pure visual experience
- **Visual Novel Layout** -- Bottom-bar dialogue box with VN-style text rendering

## Audio & Sound

- **Procedural Character Audio** -- Ambient soundscapes and reaction SFX per character
- **Desktop Pet Mute State** -- Electron-integrated TTS mute toggle for pet mode

## Import / Export

- **SillyTavern Character Cards** -- PNG card import/export compatible with V1 + V2 spec
- **AI-Generated Portraits** -- Per-emotion portrait generation via image backend
- **Character Portfolio Card** -- html2canvas PNG export with character stats overlay

## Mini Games

- **Trivia** -- Character-themed trivia with personality-flavored questions and reactions
- **Twenty Questions** -- Classic guessing game with in-character hints and commentary

## Infrastructure

- **DB Schema Migrations** -- Automated migration chain from v3 to v60
- **18 Built-in Themes** -- 9 light + 9 dark themes with full component coverage
- **Cross-Frontend Navigation** -- 4-pill nav bar shared across Sakura and Girly frontends

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.14, FastAPI, SQLite, sqlite-vec |
| Frontend | React 19, TypeScript, Zustand, Framer Motion, Vite |
| 3D Engine | Three.js, VRM, Live2D (pixi-live2d-display) |
| Desktop | Electron |
| Voice | WebSocket duplex, Web Audio API, Kokoro TTS |
| LLM | LM Studio, Ollama, OpenAI-compatible, Claude API |

## Hardware Targets

| Machine | Specs | Role |
|---------|-------|------|
| Mac M2 Pro | 24GB unified memory | GPU floor for rendering |
| Windows Desktop | RTX 5080, 16GB VRAM | High-end rendering + large models |
| Windows Laptop | RTX 3070, 8GB VRAM | Portable development |
