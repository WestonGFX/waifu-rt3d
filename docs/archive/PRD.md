# Product Requirements Document (PRD) - Waifu-RT3D v5.31 "Hybrid"

## 1. Executive Summary

**Waifu-RT3D v5.31** is a hybrid desktop application combining a modern, aesthetic "Neon Glass" frontend with the stability of the "Classic" dashboard. It features real-time 3D anime avatars (VRM), local LLM integration (via LM Studio), and audio-reactive lip synchronization.

**Core Philosophy**:

- **Aesthetics**: Premium, immersive, "Anime Cyberpunk" visual style.
- **Personality**: Deeply characterized AI personas (e.g., Rin/Fox).
- **Privacy**: Local-first processing (LLM, TTS, ASR).

---

## 2. Character System: "Project Rin"

The system supports multiple distinct personalities. The primary flagship character is **Rin (Fox)**.

### 2.1 Rin (Fox) Profile

- **Archetype**: Fiery Tsundere Racer.
- **Visuals**: Red/Black cyberpunk aesthetic.
- **Voice**: Fast cadence, snappy, slightly higher pitch (1.1x).
- **Personality Engine**:
  - **Vibe**: Competitive, blunt, loyal.
  - **Traits**: Prideful but caring ("Defensive Affection").
  - **Interaction**: Challenges the user, gamifies tasks, offers "tough love".
- **System Prompt**: Enforced via `tools/init_personas.py` and database injection.

### 2.2 Roster

1. **Rin (Akane)** [Default] - Tsundere/Racer.
2. **Raine** - Classic Tsundere.
3. **Nyx (Ayane)** - Kuudere/Systems Engineer.
4. **Kitsune** - Genki/Fox-girl.
5. **Hana (Momoka)** - Deredere/Joy-Spreader.
6. **Sable (Kuroha)** - Sadodere/Fixer.
7. **Shiori (Nana)** - Dandere/Writer.
8. **Mika (Mikazuki)** - Hiyakasudere/Summer Spirit.

---

## 3. Technical Architecture

### 3.1 Hybrid Frontend Strategy

To ensure stability while iterating on design:

- **Neon Frontend (`/`)**: Modern, React-like (Vanilla JS modules), Glassmorphism UI. Supports VRM 1.0.
- **Classic Frontend (`/classic`)**: Legacy, robust dashboard for diagnostics.
- **Switching**: Users can toggle between frontends via System Settings.

### 3.2 3D Visualization

- **Engine**: Three.js + @pixiv/three-vrm (v1.0).
- **Features**:
  - **VRM Loading**: `VRMLoaderPlugin` for modern avatar support.
  - **Animation**:
    - **LipSync**: Real-time audio frequency mapping to `aa` blendshape.
    - **Expressions**: Emotion-driven facial states (Happy, Angry, Surprised).
    - **Idle Engine**: Procedural breathing, head sway, and "A-Pose" correction.

### 3.3 Memory Systems (Planned - v5.4+)

- **Short-Term**: Session-based JSON logs (Current).
- **Long-Term (RAG)**: Vector database (Chroma/FAISS) to store conversation chunks.
  - *Goal*: The AI remembers user preferences and past conversations indefinitely.

---

## 4. Features & Roadmap

### Phase 1: Stabilization (Completed)

- [x] Unified Backend (`server.py`).
- [x] Database Schema v5 (Pitch/Rate columns).
- [x] VRM 1.0 Support (Fixing T-Pose).
- [x] Basic "Rin" Personality Injection.

### Phase 2: Polish (Current)

- [ ] **UI animations**: Smooth transitions, hover effects.
- [ ] **Settings Panel**: Full configuration for LLM/TTS providers.
- [ ] **Frontend Switcher**: Seamless toggling.

### Phase 3: Advanced AI (Upcoming)

- [ ] **Memory (RAG)**: Integration of vector store.
- [ ] **Auto-Launch**: Script to auto-start LM Studio headless.
- [ ] **Smart Installer**: Wizards for non-technical users.

---

## 5. Directory Structure

```text
waifu-rt3d/
├── backend/            # Python FastAPI server & DB
├── frontends/
│   ├── neon/           # Modern Glass UI
│   └── classic/        # Legacy Dashboard
├── tools/              # Utilities (init_personas, patch_db)
├── docs/               # Documentation & Changelogs
└── assets/             # Shared resources (VRMs, Sounds)
```
