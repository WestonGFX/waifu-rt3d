---
paths:
  - "backend/llm/**"
  - "backend/voice/**"
  - "backend/tts/**"
  - "backend/mood/**"
---

# LLM & Voice Rules

## LLM Adapters
- Live in `backend/llm/adapters/` — one per provider (OpenAI-compat, Claude, Ollama).
- All implement: `chat_completion()` and `chat_completion_stream()`.
- Claude adapter: `_convert_tools_to_anthropic()` converts OpenAI→Anthropic tool schemas. Don't duplicate.
- Field mapping: `repeat_penalty` → `repetition_penalty` for LM Studio/llama.cpp.

## Context Assembly
- `context_assembler.py` is the ONLY place that assembles the final message list.
- `token_counter.py` uses tiktoken with `chars // 4` fallback.
- Never hardcode token limits — read from model catalog or config.

## LM Studio Integration
- `link_manager.py` handles device discovery via REST API (v0).
- LMS CLI: `/Users/chris/.cache/lm-studio/bin/lms`

## Voice Pipeline
- `duplex.py` state machine: `idle → listening → processing → speaking`.
- WebSocket: `/ws/voice` in server.py. Barge-in interrupts speaking.
- `audio_utils.py` converts WebM/Opus → PCM via ffmpeg subprocess.

## TTS / Voice Modulation
- `voice_modulator.py` maps 16 emotions to TTS params (pitch, speed, stability).
- Provider-aware: different param names for ElevenLabs, Kokoro, system TTS.
- Emotion detection from `backend/mood/engine.py` — don't duplicate emotion logic in voice layer.

## Tool Protocol
- `capability_detector.py` determines tool protocol per model: `openai_functions`, `xml_fallback`, `none`.
- Results cached in `model_capability_cache`. Don't call detector on every request.
