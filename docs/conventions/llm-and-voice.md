# LLM & Voice Conventions

## LLM Adapters

- Adapters live in `backend/llm/adapters/` — one per provider (OpenAI-compat, Claude, Ollama).
- All adapters implement the same interface: `chat_completion()` and `chat_completion_stream()`.
- Claude adapter: `_convert_tools_to_anthropic()` converts OpenAI tool schemas to Anthropic format. Don't duplicate this conversion elsewhere.
- Field name mapping: `repeat_penalty` → `repetition_penalty` for LM Studio/llama.cpp. `frequency_penalty` is the standard OpenAI field.

## Context Assembly

- `context_assembler.py` builds token-budget-aware prompts. It is the ONLY place that assembles the final message list sent to LLMs.
- `token_counter.py` uses tiktoken with `chars // 4` fallback when no tokenizer is available.
- Never hardcode token limits — read from the model catalog or config.

## LM Studio Integration

- `link_manager.py` handles device discovery via LM Studio REST API (v0).
- `get_model_recommendation()` filters models by VRAM + use case from `backend/data/model_catalog.json`.
- LMS CLI path: `/Users/chris/.cache/lm-studio/bin/lms`.

## Voice Pipeline

- `duplex.py` implements the `VoiceDuplexSession` state machine: `idle → listening → processing → speaking`.
- WebSocket endpoint: `/ws/voice` in server.py. Barge-in interrupts speaking state.
- `audio_utils.py` converts WebM/Opus → PCM via ffmpeg subprocess. Always check ffmpeg is available before calling.

## TTS / Voice Modulation

- `voice_modulator.py` maps 16 emotions to provider-specific TTS parameters (pitch, speed, stability).
- Provider-aware: different param names for ElevenLabs, Kokoro, and system TTS.
- Emotion detection feeds from `backend/mood/engine.py` — don't duplicate emotion logic in the voice layer.

## Tool Protocol

- `capability_detector.py` determines tool protocol per model: `openai_functions`, `xml_fallback`, or `none`.
- Results are cached in `model_capability_cache`. Don't call the detector on every request.
