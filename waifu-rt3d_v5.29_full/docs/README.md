# waifu-rt3d v5.29 — Voice-First Build
Built 2025-10-18 08:05

This build introduces a pluggable **TTS adapter system**:
- **Fish Audio** (cloud or self-host): default provider, defaults to the E-girl voice ID.
- **Piper** (local CLI): fully offline baseline, you provide a `.onnx` voice model.
- **XTTS server** (local): works with community servers (configure endpoint).
- **ElevenLabs** (API): for users with paid keys.

## Install
- Windows: `install.bat` → `run.bat`
- macOS: `./install.sh` → `./run.sh`
Then open http://127.0.0.1:8000

## Configure
Setup tab → fill LLM and TTS. Use **Speak replies** in Chat to hear audio. Files are saved in `backend/storage/audio`.
