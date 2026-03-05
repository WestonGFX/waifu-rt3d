# Settings Reference

Complete reference for all configuration settings in waifu-rt3d.

## How Configuration Works

- **Config file location:** `backend/config/app.json`
- Settings can be changed via the **Settings UI** (gear icon) or by editing the JSON file directly.
- The server reads the config on each API request, so most changes take effect **immediately** without a restart.
- **Restart required** for: `system.auto_start_lmstudio`, `system.lms_path`, `tts.model_dir`, `tts.catalog_url`, `default_frontend`, and `audio_cleanup_days` (only checked at startup).
- **Per-character overrides** exist for LLM endpoint, model, and temperature. These are stored in the database (not app.json) and take priority over global settings when set.

---

## 1. LLM Configuration

Settings that control the language model backend and text generation behavior.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `llm.provider` | string | `"lmstudio"` | `"openai"`, `"lmstudio"` | LLM API provider. Both use OpenAI-compatible endpoints. | app.json only |
| `llm.endpoint` | string | `"http://127.0.0.1:1234/v1"` | Any URL | OpenAI-compatible API endpoint. | app.json only |
| `llm.api_key` | string | `"lm-studio"` | Any string | API key for the LLM endpoint. Use `"lm-studio"` for local LM Studio. | app.json only |
| `llm.model` | string | `""` | Any model ID | Model identifier as reported by the endpoint. The UI "Active LLM" dropdown writes to this. | Both |
| `llm.history_limit` | number | `30` | `0` - `500` | Max messages sent to the LLM per request. `0` = unlimited (send all history). Auto-compression fires at 90% of this limit. | Both |
| `llm.thinking_mode` | boolean | `false` | `true`, `false` | Enable chain-of-thought reasoning for supported models (Qwen3, DeepSeek-R1/R2, QwQ, Cogito, Sky-T1). Slower but smarter responses. | Both |
| `context_limit` | number | `131072` | `2048` - `131072` | Max token budget for the context window. Should match your model's max context length. | Both |
| `temperature` | number | `0.7` | `0.1` - `2.0` | Controls creativity/randomness. Lower = more deterministic, higher = more creative. `0.7` recommended for chat. | Both |
| `repeat_penalty` | number | `1.1` | `1.0` - `2.0` | Penalizes repeated tokens. Sent as `repetition_penalty` to LM Studio/llama.cpp. `1.1` is usually ideal. | Both |
| `frequency_penalty` | number | `null` | `0.0` - `2.0` | Standard OpenAI frequency penalty. Applied additively with `repeat_penalty`. | app.json only |
| `thinking_visible` | boolean | `true` | `true`, `false` | Show the AI's chain-of-thought reasoning in `<think>` tags. Useful for debugging model behavior. | Both |
| `message_input_mode` | string | `"queue"` | `"queue"`, `"steer"`, `"discard"` | What happens when you send a message while the AI is still responding. Queue buffers it, steer aborts current generation, discard drops the message. | UI only |
| `content_filter_level` | number | `1` | `-1` - `3` | Content filter injection level. `-1` = no filter, `0` = minimal, `1` = standard, `2` = strict, `3` = maximum. Adds safety instructions to the system prompt. | Both |

---

## 2. Text-to-Speech (TTS)

Settings for voice synthesis output.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `tts.enabled` | boolean | `true`* | `true`, `false` | Master switch for TTS. When off, AI responses are text-only. | Both |
| `tts.provider` | string | `"fish_audio"` | `"kokoro"`, `"chatterbox"`, `"edge_tts"`, `"fish_audio"`, `"piper_local"`, `"xtts_server"`, `"elevenlabs"`, `"gptsovits"` | TTS engine to use. Kokoro and Chatterbox are local; Edge-TTS uses Microsoft cloud; others require external services. | Both |
| `tts.voice_id` | string | `"8ef4a238..."` | Provider-specific | Voice identifier. Depends on the active TTS provider (e.g., `"fox_v1"` for Kokoro, a UUID for Fish Audio). | Both |
| `tts.auto_speak` | boolean | `true`* | `true`, `false` | Automatically speak AI responses. When off, TTS only triggers manually. | Both |
| `tts.exaggeration` | number | `0.8` | `0.3` - `2.0` | Emotional intensity for Chatterbox TTS. `0.3-0.5` = calm, `0.7-0.9` = natural, `1.2+` = dramatic. Only applies to the Chatterbox provider. | Both |
| `tts.fast_chunking` | boolean | `true` | `true`, `false` | Stream TTS sentence-by-sentence instead of waiting for the full reply. Reduces latency from ~10s to ~1-2s. Recommended for all local providers. Turn off for ElevenLabs. | Both |
| `tts.endpoint` | string | `"https://api.fish.audio/v1"` | Any URL | TTS service endpoint. Only used by network-based providers (Fish Audio, ElevenLabs, XTTS, GPT-SoVITS). | app.json only |
| `tts.api_key` | string | `""` | Any string | API key for cloud TTS providers (Fish Audio, ElevenLabs). | app.json only |
| `tts.format` | string | `"mp3"` | `"mp3"`, `"wav"`, `"ogg"` | Audio output format. | app.json only |
| `tts.sample_rate` | number | `24000` | `8000` - `48000` | Audio sample rate in Hz. | app.json only |
| `tts.fallback_chain` | array | `["piper_local","xtts_server","elevenlabs"]` | Array of provider strings | Ordered list of fallback TTS providers if the primary fails. | app.json only |
| `tts.model_dir` | string | `null` | Directory path or `null` | Custom directory for TTS model files. `null` = use built-in default. **Requires restart.** | app.json only |
| `tts.catalog_url` | string | `null` | URL or `null` | Custom URL for the TTS voice catalog. `null` = use built-in default. **Requires restart.** | app.json only |
| `speech_rate` | number | `1.0` | `0.5` - `2.0` | Speed of TTS output. `1.0` = normal. Lower for dramatic delivery, higher for quick responses. | Both |
| `pitch_shift` | number | `0` | `-10` - `10` | Semitone shift applied to TTS voice. Negative = deeper, positive = higher. | Both |
| `voice_stability` | number | `0.5` | `0.0` - `1.0` | Balance between expressive and consistent voice. Low = more expressive/varied, high = more consistent but robotic. | Both |

\* Current app.json value; `DEFAULT_CFG` in preflight.py uses different provider defaults.

---

## 3. Speech Recognition (ASR)

Settings for voice input and microphone handling.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `asr.enabled` | boolean | `false` | `true`, `false` | Enable speech recognition input. | Both |
| `asr.provider` | string | `"browser"` | `"browser"`, `"faster_whisper"` | ASR engine. Browser uses Web Speech API (cloud, needs internet). Faster-Whisper is local/offline (requires `pip install faster-whisper`). | Both |
| `asr.model` | string | `"whisper-1"` | `"tiny.en"`, `"base.en"`, `"small"`, `"medium"`, `"large-v3"` | Whisper model size for Faster-Whisper provider. Larger = more accurate but slower and uses more RAM. | Both |
| `asr.endpoint` | string | `""` | Any URL | Custom ASR endpoint (for remote Whisper servers). | app.json only |
| `asr.api_key` | string | `""` | Any string | API key for cloud ASR services. | app.json only |
| `asr.language` | string | `"en"` | ISO language code | Language hint for ASR transcription. | app.json only |
| `vad_threshold` | number | `0.015` | `0.001` - `0.05` | Voice Activity Detection sensitivity. Lower = more sensitive (picks up whispers), higher = ignores background noise. Try `0.02-0.03` if keyboard clicks trigger detection. | Both |
| `asr_min_confidence` | number | `0` | `0.0` - `0.9` | Minimum ASR confidence to accept a transcription. `0` = accept all. `0.5` = reject uncertain results. Only used by Faster-Whisper. | Both |
| `interrupt_mode` | boolean | `true` | `true`, `false` | Stop AI TTS playback when you start speaking into the mic. | Both |

---

## 4. UI & Appearance

Visual theme and style settings.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `visual_mode` | string | `"3D (VRM)"` | `"3D (VRM)"`, `"2D (Live2D)"` | Avatar rendering engine. VRM = 3D models with full body animation. Live2D = 2D animated portraits (Cubism 4). | Both |
| `theme` | string | `"Synthwave UI (Dark)"` | `"Synthwave UI (Dark)"`, `"Zen (Light)"`, `"Anime Pop"`, `"Bubblegum"`, `"Dracula"`, `"Nord"`, `"Hacker"`, `"Blurple"`, `"iOS Messages"`, `"iOS Dark"` | Global color scheme for the entire UI. | Both |
| `bg_mode` | string | `"Bento Gradient"` | `"Void"`, `"Bento Gradient"`, `"Digital Rain"`, `"City Video"` | Decorative background animation behind the main UI panels. | Both |
| `glow_intensity` | number | `50` | `0` - `100` | Brightness of neon glow effects on UI elements. `0` = no glow (subtle look). | Both |
| `ui_border_radius` | number | `12` | `0` - `20` | Roundness of panels and buttons in pixels. `0` = sharp corners, `20` = very rounded. | Both |
| `ui_blur` | number | `10` | `0` - `50` | Frosted glass backdrop blur strength in pixels. Higher values may impact performance. | Both |
| `ui_font_size` | number | `14` | `12` - `20` | Base text size in pixels. Scales all UI text. Useful for accessibility or high-DPI displays. | Both |
| `ui_sounds` | boolean | `false` | `true`, `false` | Play subtle cyberpunk sound effects on button clicks and notifications. | Both |
| `show_timestamps` | boolean | `false`* | `true`, `false` | Show timestamps on chat messages. | Both |
| `typewriter_enabled` | boolean | `false` | `true`, `false` | Enable typewriter animation for incoming AI messages (characters appear one at a time). | Both |
| `typewriter_speed` | number | `15` | `1` - `100` | Characters per tick for typewriter animation. Higher = faster reveal. | Both |
| `lighting_preset` | string | `"studio"` | `"studio"`, `"warm_sunset"`, `"cool_moonlight"`, `"dramatic"`, `"neon"` | Lighting mood for the 3D viewport. Studio is neutral; others are atmospheric. | Both |

\* Not in default config; controlled via UI toggle.

---

## 5. Layout

Panel visibility and chat/viewport arrangement.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `layout_show_left` | boolean | `true` | `true`, `false` | Show or hide the left sidebar (character roster and chat threads). | Both |
| `layout_show_right` | boolean | `false` | `true`, `false` | Show or hide the right sidebar (memory bank, relationship, system stats). | Both |
| `chat_layout` | string | `"Auto (Recommended)"` | `"Auto (Recommended)"`, `"Full Chat"`, `"Toggle View"` | How the chat panel and 3D viewport share the center area. Auto expands chat when no 3D model is loaded. Full Chat hides the viewport. Toggle View adds a button to switch between modes. | Both |

---

## 6. 3D Viewer

Settings for the Three.js VRM viewport and rendering performance.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `fps_target` | string | `"Unlimited"` | `"30"`, `"60"`, `"120"`, `"Unlimited"` | Cap the 3D render frame rate. Reduces GPU load when running in background or on battery. | Both |
| `show_fps_overlay` | boolean | `false` | `true`, `false` | Display a live FPS counter in the corner of the 3D viewport. | Both |
| `shadow_quality` | string | `"off"` | `"off"`, `"soft"`, `"sharp"` | 3D character shadow rendering. Off = no shadows (fastest). Soft = realistic blur. Sharp = hard-edged shadows. | Both |
| `render_quality` | string | `"High (Native)"` | `"Low (1x)"`, `"Medium (1.5x)"`, `"High (Native)"`, `"Ultra (2x)"` | Pixel ratio for the 3D viewport. Lower = faster but blurrier. Ultra = supersampled (sharpest, GPU heavy). | UI only |
| `antialias` | boolean | `true` | `true`, `false` | Smooth jagged edges on 3D models. Disabling saves ~10-15% GPU. **Requires page reload.** | UI only |
| `vrm_scale` | number | `1.0` | `0.5` - `2.0` | Scale of the VRM model in the viewport. `1.0` = original size. | Both |
| `vrm_offset_x` | number | `0.0` | `-1.0` - `1.0` | Horizontal position of the VRM model. `0` = centered. | Both |
| `vrm_offset_y` | number | `0.0` | `-0.5` - `0.5` | Vertical position of the VRM model. `0` = default, positive = up. | Both |

---

## 7. Character Defaults

Global character-related settings. Per-character overrides (LLM endpoint, model, temperature) are stored in the database.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `active_character_id` | string | `"1"` | `"<id>: <name>"` format | The currently selected character. Format is `"1: Rin (Akane)"` where the number before `:` is the database ID. | Both |
| `avatar_url` | string | `""` | File path (e.g., `"/files/images/portrait.png"`) | 2D avatar / profile picture used in chat bubbles and character roster. | Both |
| `model_vrm` | string | `""` | File path (e.g., `"/files/avatars/Model.vrm"`) | Path to the VRM 3D model file for the active character. | Both |
| `live2d_model` | string | `""` | File path (e.g., `"/live2d/ariu/ariu.model3.json"`) | Path to the Live2D model file. Only used when `visual_mode` is `"2D (Live2D)"`. | Both |
| `bg_image` | string | `""` | File path | Per-character background image shown behind the avatar in the viewport. | Both |
| `background_mode` | string | `"transparent"` | `"transparent"`, `"image"`, `"color"`, `"video"`, `"gradient"` | How the 3D viewport background is rendered. Transparent blends with the UI. Image/Video shows media behind the avatar. | Both |

---

## 8. Image & Video Generation

Settings for AI-powered image and video generation via ComfyUI or compatible backends.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `image_gen.provider` | string | `"disabled"` | `"disabled"`, `"comfyui"` | Image generation backend. `"disabled"` turns off all AI art features. | Both |
| `image_gen.endpoint` | string | `"http://localhost:8188"` | Any URL | ComfyUI or compatible image generation API endpoint. | Both |
| `image_gen.model` | string | `"z-image-turbo"` | Any model name | Image generation model/checkpoint name. | Both |
| `image_gen.steps` | number | `9` | `1` - `50` | Number of diffusion steps. More steps = higher quality but slower. | Both |
| `image_gen.width` | number | `512` | `256` - `2048` | Default image width in pixels. | Both |
| `image_gen.height` | number | `512` | `256` - `2048` | Default image height in pixels. | Both |
| `video_gen.provider` | string | `"disabled"` | `"disabled"`, `"comfyui"` | Video generation backend. | Both |
| `video_gen.endpoint` | string | `"http://localhost:8188"` | Any URL | ComfyUI endpoint for video generation. | Both |
| `video_gen.model` | string | `"wan2.2-ti2v-5b"` | Any model name | Video generation model name (e.g., Wan 2.2 text/image-to-video). | app.json only |
| `video_gen.duration` | number | `5` | `1` - `30` | Video clip duration in seconds. | app.json only |

---

## 9. Vocabulary

Settings for the vocabulary context injection system that teaches the AI slang and domain-specific terms.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `vocab.enabled` | boolean | `true` | `true`, `false` | Inject vocabulary context into the system prompt so the AI can use slang/terms naturally. Also settable as top-level `vocab_enabled`. | Both |
| `vocab.limit` | number | `40` | `10` - `100` | Max vocabulary entries injected per message. More entries = richer vocabulary but uses more tokens. Also settable as top-level `vocab_limit`. | Both |

---

## 10. System & Operations

Settings for developer tools, logging, webhooks, and automation.

| Key | Type | Default | Valid Values | Description | Where Settable |
|-----|------|---------|--------------|-------------|----------------|
| `dev_mode` | boolean | `false` | `true`, `false` | Enable developer tools and verbose logging in the UI. | Both |
| `log_limit` | number | `200` | `0` - `1000` | Max log lines retained in the frontend debug console. | Both |
| `save_logs_auto` | boolean | `false` | `true`, `false` | Automatically save frontend logs to disk. | Both |
| `onboarded` | boolean | `false` | `true`, `false` | Whether the user has completed first-run onboarding. Set to `true` after initial setup. | app.json only |
| `default_frontend` | string | `"neon"` | `"neon"` | Which frontend to serve. Currently only `"neon"` is available. **Requires restart.** | app.json only |
| `audio_cleanup_days` | number | `7` | `0` - `365` | Delete cached TTS audio files older than this many days. `0` = never clean up. **Only checked at startup.** | app.json only |
| `webhooks` | array | `[]` | Array of URL strings | Outbound webhook URLs. Events (message sent, TTS complete, etc.) are POSTed to these URLs. | Both |
| `system.auto_start_lmstudio` | boolean | `false` | `true`, `false` | Automatically start LM Studio headless daemon on server startup if the LLM endpoint is unreachable. **Requires restart.** | app.json only |
| `system.lms_path` | string | `"lms"` | File path | Path to the `lms` CLI binary. Defaults to `"lms"` which auto-resolves to `~/.cache/lm-studio/bin/lms`. **Requires restart.** | app.json only |
| `memory.max_history` | number | `12` | `1` - `100` | Max conversation turns stored in the memory system (from `DEFAULT_CFG`). | app.json only |

---

## 11. Legacy / Preflight Defaults

These keys appear in the `DEFAULT_CFG` in `backend/preflight.py` and are written to `app.json` only when creating a brand-new config file. They may not be present in an existing config.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `profile` | string | `"auto"` | Hardware profile hint (auto-detected). |
| `input_mode` | string | `"text"` | Input mode: `"text"` or `"voice"`. |
| `output_mode` | string | `"text+voice"` | Output mode: `"text"`, `"voice"`, or `"text+voice"`. |

---

## Per-Character Overrides (Database)

These settings are stored per-character in the SQLite database, not in `app.json`. They override global config when set (non-NULL).

| Column | Type | Description |
|--------|------|-------------|
| `llm_endpoint` | string | Per-character LLM API endpoint (e.g., route one character to Ollama, another to LM Studio). |
| `llm_model` | string | Per-character model override. |
| `llm_temperature` | number | Per-character temperature override. `NULL` = use global `temperature`. |
| `tts_pitch` | number | Per-character TTS pitch adjustment. |
| `tts_rate` | number | Per-character TTS speech rate. |
| `voice_config` | JSON string | Extended voice settings (ElevenLabs stability, SSML style, pitch preset). |
| `voice_sample_prompt` | string | Reference audio transcript for GPT-SoVITS voice conditioning. |
| `capability_profile` | JSON string | LLM capability metadata: model tier requirement, context budget, feature flags, prompt style. |
| `animation_profile` | JSON string | Animation personality: energy, confidence, nervousness, expressiveness, playfulness (each 0-1). |
| `vocab_categories` | JSON string | Array of vocabulary category names to filter which vocab entries are injected for this character. |
