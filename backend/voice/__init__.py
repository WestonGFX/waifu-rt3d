"""
Full-duplex voice conversation package.

Provides WebSocket-based bidirectional voice chat:
  mic audio → server VAD → ASR → LLM → TTS → speaker

Modules:
    audio_utils: Audio format conversion (WebM/Opus → PCM, resampling)
    duplex:      VoiceDuplexSession state machine
"""
