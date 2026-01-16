# Competitor Analysis & UI Intelligence (Phase 5)

**Goal**: Extract architectural secrets from "Neuro-sama" (Vedal987) and "Riko Project" (Just Rayen) to integrate into Waifu-RT3D V6.0.

## 1. Neuro-sama (Vedal987) Analysis
> **Philosophy**: "Soulless but Smart" -> The humor comes from the AI trying to handle complex social situations (Twitch Chat) and failing or succeeding unexpectedly.

### 1.1 Core Architecture
- **Engine**: Unity (C#) for Visuals + Python Backend (AI).
- **Communication**: IPC (Inter-Process Communication) or WebSockets between Unity and Python.
- **Data Input (The "Brain")**:
    - **Twitch Chat**: Real-time firehose.
    - **Observed Gameplay**: She "sees" the game state (Minecraft/Osu) via screen capture analysis or direct API hooks.
- **Engagement Loops**:
    - **Hype Train Reaction**: Specific code to detect sub-bombs and react emotionally ("Thank you for the sub!").
    - **Collaboration**: Can "collab" with other Vtubers via Discord voice (Audio -> ASR -> LLM -> TTS).

### 1.2 "Soulful" Takeaways for Waifu-RT3D
- **Action**: Implement a **"Twitch Monitor"** module.
- **Integration**: `backend/modules/twitch_monitor.py` -> Connects to IRC, pushes messages to Vector DB.
- **Feature**: "Chat Mode" where the Waifu ignores the user and talks to "Chat" (simulated or real).

---

## 2. Riko Project (Just Rayen) Analysis
> **Philosophy**: "Configurable Waifu" -> Focus on local customization and "Personality Profiles".

### 2.1 Core Architecture
- **Stack**: Python 3.10 + Faster-Whisper + GPT-SoVITS.
- **Config**: `config.yaml` defines the personality prompt (e.g., "Snarky Anime Girl").
- **Flow**: Push-to-Talk -> ASR -> LLM (History Aware) -> TTS -> Audio Playback.
- **Visuals**: Experimenting with `XR Animator` + VRM.

### 2.2 Takeaways
- **Action**: Adoption of **GPT-SoVITS**.
    - *Why*: It's better than standard Coqui TTS for anime voices.
    - *Plan*: Add `GPT-SoVITS` container to our `install.sh`.
- **Action**: **YAML Configuration**.
    - We currently use `app.json`. Moving to YAML for personality profiles (like Riko) allows for commented, easier editing by users.

---

## 3. UI/UX Inspiration: "The Dashboard Vibe"
**Objective**: Move from "Chatbot" to "Mission Control".

### 3.1 Design References
1.  **"Sci-Fi HUD" (React Three Fiber)**:
    - *Concept*: Floating glass panels in 3D space.
    - *Repo*: `pmndrs/react-three-fiber` examples.
    - *Application*: The "Settings" menu shouldn't be a modal; it should be a holographic screen that floats next to the Waifu.
2.  **"Cyberdeck Terminal"**:
    - *Concept*: Retro-futuristic terminal with glowing text (Fallout/Cyberpunk 2077).
    - *Application*: Our `debug.log` stream should look like a hacking terminal, not just text.

### 3.2 UI "Mega-Audit" Plan
I will now manually verify every element in the current `v5.30` UI to ensure it lives up to this standard.
