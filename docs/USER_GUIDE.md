# Waifu-RT3D User Guide

## 1. Installation

### Requirements
-   **OS:** Windows / macOS / Linux
-   **Python:** 3.10+
-   **Node.js:** (Optional, for development)
-   **Backend:** Local LLM (LM-Studio, Ollama) or Remote API.

### Setup
1.  **Clone Repository:**
    ```bash
    git clone https://github.com/your-repo/waifu-rt3d.git
    cd waifu-rt3d
    ```
2.  **Install Python Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run Application:**
    ```bash
    python backend/server.py
    ```
    Access the interface at `http://localhost:8000`.

## 2. Configuration (Settings Modal)
Click the **SYSTEM CONFIG** button in the bottom left to open settings.

### 🧠 BRAIN (LLM)
-   **System Prompt:** Override the AI's base personality.
-   **Context Window:** Max memory size (default 4096).
-   **Thinking:** Show the AI's hidden chain-of-thought `<think>` tags.

### 🗣️ VOICE
-   **Speed/Pitch:** Adjust TTS audio characteristics.
-   **Interrupt Mode:** Enable microphone "Hands-Free" mode (requires VAD).

### 🎨 APPEARANCE
-   **Visual Mode:** Switch between **3D (VRM)** and **2D (Live2D)** engines.
-   **Theme:** Choose from 8 presets (Synthwave, Dark, Zen, Hacker...).
-   **Layout:** Toggle Left/Right panels to customize your workspace.

### 👤 CHARACTER (New!)
-   **Edit Active Character:** Change Name, Personality, and Voice.
-   **Link Model:** Select a VRM or Live2D model from the dropdown. The list auto-populates from the storage folders.
-   **Save:** Persists changes to the database.

## 3. Adding Content

### Adding Live2D Models
1.  Create a folder in `backend/storage/live2d/`.
2.  Drop your Live2D files (`.model3.json`, `.moc3`, textures) into that folder.
3.  Restart the app OR reopen Settings. The new model will appear in the "Character" tab dropdown.

### Adding VRM Models
1.  Drop `.vrm` files into `backend/storage/avatars/`.
2.  Select them in the "Character" tab.

### Creating New Characters
Currently handled via the database or the "Character" tab (modifying the Default). A full "New Character" button is coming in v3.1.
Use `docs/PERSONA_TEMPLATE.md` to draft your character details before entering them.
