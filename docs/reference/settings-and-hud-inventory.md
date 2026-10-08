# Settings and HUD inventory (Sakura frontend + backend config)

Generated: 2026-10-08. Source: static reading of the code (not a live browser run).

## How to use this doc
1. This lists every user-facing setting and on-screen (HUD) element found by reading the code, with file paths so you can jump to the source.
2. "Persisted pref" = browser-side (localStorage). "Backend config" = `backend/config/app.json`, read with `GET /api/config`, merged-written with `PUT /api/config` (nested dicts are shallow-merged one level).
3. Paths are relative to `frontends/sakura/src/` unless they start with `backend/`. Settings UI is `views/SettingsView.tsx` (abbrev. SV).
4. "tier" = `SettingField` visibility gate: 0 always, 1 Advanced (settingsTier>=1), 2 Developer (settingsTier>=2).
5. The `app.json` values below are the LIVE file in this checkout (git shows it modified), not factory defaults. Factory reset values (`POST /api/config/reset`, backend/server.py ~line 1823) are noted where they differ.
6. Anything marked "no consumer found" was grep-checked against `backend/`, `frontends/shared/` and `frontends/sakura/src/`; it may still be read dynamically. See the last section.

---

## SECTION 1 - Frontend persisted preferences

### 1a. Zustand store `sakura-app` (stores/appStore.ts, `persist` + `partialize`, 14 fields)

| name | type / values | default | storage key | what it does | UI control |
|---|---|---|---|---|---|
| chatLayout | 'chat-first' / 'model-first' / 'split' | 'chat-first' | sakura-app | Intended chat vs 3D arrangement. No component reads it (grep found none outside the store) | no UI |
| settingsTier | 0 / 1 / 2 | 0 | sakura-app | Gates which `SettingField`s show (Normal / Advanced / Developer). Also sets `advancedMode`, `devMode` | Settings > General > Display: "Advanced Mode", "Developer Mode" toggles |
| layoutMode | 'normal' / 'compact' / 'mobile' / 'minimal' | 'normal' | sakura-app | UI density. compact/mobile hide field descriptions; minimal hides header buttons + collapses sidebar to icons (class `app-layout--minimal`) | Settings > General > Display: "Layout" (Normal/Compact/Mobile) and "HUD Density" (Cozy/Minimal); shortcut Ctrl+Shift+M |
| chatStyle | 'screenplay' / 'transcript' / 'storybook' | 'storybook' | sakura-app | How script segments (speech/action/scene/thought) render in a message | Display: "Chat style" |
| thoughtsMode | 'off' / 'peek' / 'open' | 'peek' | sakura-app | How the model-thinking card shows above a reply | Display: "Model thinking" |
| replyDelivery | 'live' / 'fade' / 'beats' | 'live' | sakura-app | Whether replies stream live or wait, then fade/cascade in once complete | Display: "Reply animation" |
| sidebarCollapsed | boolean | false | sakura-app | Left sidebar collapsed to icon strip | Sidebar chevron; Ctrl+\ |
| sidebarSection | 'chats' / 'characters' / 'create' | 'chats' | sakura-app | Which sidebar section is expanded (`create` swaps main area to CreateView) | Sidebar section headers; Alt+N |
| customKeyBindings | Record<description, combo> | {} | sakura-app | Overrides default shortcut combos, keyed by action description | Settings > General > Keyboard Shortcuts editor |
| replyLengthMode | 'brief' / 'normal' / 'detailed' / 'auto' | 'normal' | sakura-app | Max tokens per reply: 180 / 400 / 900 / adaptive from typing speed (hooks/useAdaptivePacing.ts) | Settings > Brain > Inference Parameters: "Reply Length" |
| customTheme | Record<cssVar, color> | {} | sakura-app | Inline CSS variable overrides applied on `:root` (App.tsx effect) | Settings > General > Theme Customization |
| incognito | boolean | false | sakura-app | Messages not saved / memory not written for the turn | Settings > General > Chat Behaviour: "Incognito Mode"; composer toggle |
| settingsMode | 'drawer' / 'sidebar' | 'drawer' | sakura-app | Settings opens as right drawer or left side panel (3D stays visible) | Chat Behaviour: "Settings Panel" |
| showQuickChips | boolean | false | sakura-app | Quick-reply suggestion chips in the thread | Chat Behaviour: "Quick-Reply Chips" |
| thinkingIndicatorMode | 'skeleton' / 'stages' | 'skeleton' | sakura-app | Style of the "character is thinking" indicator | Chat Behaviour: "Thinking Indicator Style" |

NOT persisted: (note: `replyDelivery` IS persisted — corrected 2026-10-08 after the first inventory pass read the file before it was added to `partialize`.) Not persisted: `devMode`, `advancedMode` (derived from settingsTier by `setSettingsTier`, but not restored on reload - see gaps), `compactMode`, `mobileMode`, `vnMode`, `cinematicMode`, `modelPanelOpen`, `activeOverlay`, notifications, bond state.

### 1b. Other localStorage / sessionStorage keys

| name | type | default | storage key | what it does | UI control |
|---|---|---|---|---|---|
| theme | ThemeMode (23 ids, Section 6) | 'blurple' in dev (`import.meta.env.DEV`), 'sakura' in production | sakura-theme (hooks/useTheme.ts, zustand persist) | Sets `data-theme` on `<html>`; saved value always beats default | Settings > General > Theme "Color Theme" (8 options only) + Theme Customization presets; theme-cycle `toggle()` exists in the store |
| custom theme colors | {accent, background, surface, textPrimary, border} hex | dark-sakura-like starter palette | sakura-custom-theme (SV `CUSTOM_THEME_KEY`) | Saved custom palette for the pickers | Theme Customization |
| camera presets | array | [] | waifu-camera-presets (components/ModelPanel.tsx) | Saved 3D camera positions | 3D viewer panel |
| expression presets | object | {} | waifu-expression-presets (ModelPanel.tsx) | Saved expression mixes | 3D viewer panel |
| LLM probe dismissals | '1' flags | unset | per-warning key from `dismissKey()` (hooks/useLLMProbe.ts) | Remembers dismissed model warnings | Dismiss on LLMProbeAside |
| LLM probe cache | JSON | - | sessionStorage `llm_probe_v1` | Cached probe result per session | no UI |

Everything else the user sets (SettingsView values) is stored on the backend, not in the browser (Section 2).

---

## SECTION 2 - Backend config keys (`backend/config/app.json`)

Values are the live file as of 2026-10-08. Secret-like keys: named only. 130 lines, about 110 leaf keys; related keys grouped when helpful. "UI" = SV label under Settings.

### Top-level scalars and UI/display

| key path | default in app.json | meaning | UI location |
|---|---|---|---|
| default_frontend | "neon" (factory: "sakura") | Which frontend the server serves at `/` (env `WAIFU_DEFAULT_FRONTEND` also exists) | none |
| context_limit | 262144 | LLM context window the app budgets against | Brain > Model Intelligence: "Context Window" |
| temperature, repeat_penalty | 0.7, 1.1 | Sampling params | Brain > Inference Parameters: "Reply Length" row (sliders) |
| thinking_visible | true | Show model thinking tags | Brain > Model Intelligence: "Show Thinking Tags" (tier 1) |
| speech_rate, pitch_shift, voice_stability | 1, 0, 0.5 | TTS prosody | Voice > TTS: "Auto-Speak" row sliders |
| tts_volume | 0.8 | TTS playback volume (read in views/ChatThread.tsx) | Voice > TTS: "Auto-Speak" row |
| interrupt_mode | false (factory true) | User speech interrupts the character | Voice > TTS: "Interrupt Mode" (tier 1) |
| visual_mode | "3D (VRM)" | Avatar renderer mode | none found |
| theme (string) | "Blurple" | Legacy Neon theme name (the Sakura theme lives in localStorage) | none |
| bg_mode, glow_intensity, ui_border_radius, ui_blur, ui_font_size | "Void", 50, 12, 10, 14 | Legacy Neon appearance | none in Sakura |
| layout_show_left / layout_show_right | true / false | Legacy Neon panel visibility | none in Sakura |
| ui_sounds | false | Interface sounds | General > Layout: "Interface Sounds" (no consumer found) |
| dev_mode | true | Backend-side dev flag (read by KokoroDebugPanel); different from the frontend `devMode` | System > Developer: "Developer Mode" |
| log_limit, save_logs_auto | 600, true | Dev console log buffer / auto-save | System > Developer: "Kokoro Engine" row (log_limit), "Auto-Save Logs" (tier 1) |
| onboarded, onboarding_version | true, 2 | First-run wizard state | none (wizard) |
| kokoro_enabled | false | Master switch for Kokoro psychology engine | System > Developer: "Kokoro Engine" |
| active_character_id | "1: Rin (Akane)" | Last active character | none |
| avatar_url, model_vrm, live2d_model, bg_image, background_mode | image / VRM / Live2D / bg paths, "image" | Current avatar assets and background | Character tab > Avatar & Appearance; 3D panel |
| chat_layout | "chat-first" (factory "Auto (Recommended)") | Chat/3D arrangement | General > Layout: "Chat Layout" (no consumer found) |
| fps_target, show_fps_overlay, antialias, shadow_quality | "60", true, true, "soft" | 3D viewport quality | General > 3D Viewport and System > 3D Viewport (FPS Cap, FPS Overlay, Anti-Aliasing, Shadow Quality) |
| content_filter_level | -1 | Legacy int content ceiling (2 general, 1 edgy, 0 mature, -1 explicit) | Safety > Content Ceiling |
| auto_compact_threshold | 85 | % of context at which auto-compaction triggers | Brain > Context & Memory: "Auto-Compact Threshold" (tier 1) |
| keep_recent_messages | 8 | Messages kept verbatim when compacting | Brain > Context & Memory (tier 2) |
| prompt_tier | "deep" (code default "auto") | Character prompt detail: CORE / EXTENDED / DEEP | Brain > Model Intelligence: "Character Detail" |
| rp_style_preset | "explicit_rp" (factory "none") | Roleplay style preset | Safety > RP Style: "RP Style Preset" |
| user_persona | "25yo guy who likes anime and gaming" | Text about the user injected in prompts | General > About You: "Tell your characters about yourself" |
| user_name | (not in file; code default "") | User display name | General > About You: "Your name" |
| typewriter_enabled | true (factory false) | Typewriter text effect | General > Chat Effects: "Typewriter Effect" (also typewriter_speed, not in file; factory 15) |
| message_input_mode | "queue" | Send behavior while the AI is replying | General > Behavior: "Message During AI Response" (no consumer found) |
| system_prompt | long string (not reproduced) | Global system prompt override | Brain > Inference Parameters: "System Prompt Override" (tier 1) |
| auto_start_lmstudio | false (appears top-level AND in system.*) | Start LM Studio headless at boot | System > LM Studio: "Auto-Start LM Studio" |
| last_seen_version, wizard_message_count, wizard_session_count, tips_snoozed_until, discovered_features, tooltips_hidden, voice_setup_completed, image_gen_setup_completed | "5.34.0", 0, 214, null, ["settings_tour"], false, false, false | Onboarding / feature-discovery bookkeeping | General > Feature Discovery: "Hide tooltips"; Setup Guides cards |

### Group `llm` (and links)

| key path | default | meaning | UI |
|---|---|---|---|
| llm.provider | "openai" | Backend type (OpenAI-compatible, etc.) | Brain > Connection: "Backend" |
| llm.endpoint | "http://localhost:1234/v1" | LM Studio / server URL | Brain > Connection: "LLM Endpoint" |
| llm.model | "llama-3.2-1b-instruct" | Active model id | Brain > Connection: "Active Model" |
| llm.api_key | secret - not documented | API key | Brain > Connection (hidden field) |
| llm.history_limit | 30 | Messages of history sent | none found |
| llm.thinking_mode | true | Ask model to reason | Brain > Model Intelligence: "Thinking / Reasoning" (tier 1) |
| llm.vision_enabled | true | Allow image input | "Vision / Image Input" (tier 1) |
| llm.tool_use_enabled | (absent) | Function calling | "Tool Use / Function Calling" (tier 1) |
| llm.timeout_seconds | (absent; code default 30) | Request timeout | Inference Parameters row |
| llm.inference_opts.* | speculative_decoding "auto", structured_output "auto", gpu_offload_layers "auto", context_length_override null, flash_attention true | LM Studio load options | none found |
| llm.link.enabled / auto_route / static_endpoints | true / false (file lists auto_route twice: true then false; JSON last wins) / [] | LM Studio Link multi-endpoint routing | Brain > Connection: "Active Model" row |

### Groups `tts`, `asr`, `voice`, `character_audio`, `system`, `embedding`

| key path | default | meaning | UI |
|---|---|---|---|
| tts.enabled / provider / voice_id | true / "elevenlabs" / "af_claire" | TTS on, engine, voice | Voice > Text-to-Speech: "TTS Provider", "Voice" |
| tts.auto_speak | true | Speak every reply | "Auto-Speak" |
| tts.exaggeration | 0.8 | Expressiveness (Chatterbox-style engines) | "Auto-Speak" row slider |
| tts.fast_chunking | true | Sentence-streaming TTS | "Fast TTS (Sentence Streaming)" (tier 1) |
| tts.model_dir, tts.catalog_url | null, null | Voice pack folder / catalog override | none |
| asr.provider / enabled / model | "browser" / false / "base.en" | Speech recognition | Voice > ASR: "ASR Provider", "Whisper Model Size" |
| asr_provider, asr_model, vad_threshold, asr_min_confidence, groq_api_key | (flat keys written by UI; groq_api_key secret - not documented) | ASR options written at top level by SV | Voice > ASR rows |
| voice.auto_interrupt / silence_timeout_ms / vad_threshold / speaking_vad_threshold | (absent from file) | Full-duplex voice tuning | Voice > Voice Conversation: "Auto-Interrupt" row |
| character_audio.enabled / volume / breathing / vocals / interaction | (absent) | Ambient audio, breathing, idle vocals, touch sounds | Voice > Character Audio rows |
| system.auto_start_lmstudio, system.lms_path | false, "lms" | LM Studio launcher; `system.huggingface_token` is a secret - not documented | System > LM Studio |
| embedding.model | "minilm" | Embedding model for memory | none |

### Groups `image_gen`, `video_gen`, `jiggle`

| key path | default | meaning | UI |
|---|---|---|---|
| image_gen.provider / endpoint / model | "easydiffusion" / "http://10.0.0.202:9000/" / "z-image-turbo" | Image generator | AI Art > Image Generation: "Image Generator", "Image Gen URL", "Default Checkpoint" (tier 1) |
| image_gen.steps / width / height / retention_days | 9 / 512 / 512 / (absent) | Render settings | "Default Checkpoint" row |
| video_gen.provider / endpoint | "disabled" / "http://localhost:8188" | Video generator | AI Art > Video Generation (tier 1) |
| jiggle.enabled / preset / intensity | true / "subtle" / 0.5 | Spring-bone body physics | Physics tab: "Jiggle preset" |
| jiggle.body_parts.breast / butt / thigh | 0.65 / 0.4 / 0.2 | Per-part strength | Physics tab sliders "Breast", "Butt", "Thigh" |

### Groups read by backend code but NOT in app.json (code defaults)

| key path | code default | meaning | UI |
|---|---|---|---|
| aie_enabled, aie_lite_mode | False, True | Adaptive Intelligence Engine opt-in / lite mode | none found |
| adaptive.dynamic_params | {} | AIE dynamic sampling params | none |
| bond_xp_enabled | False | Master flag for bond XP accrual | none |
| content_gate.global_content_ceiling | "general" | Server-side content ceiling | Safety > Content Ceiling (via /api/content-gate) |
| nsfw.skip_bond_gate | False | Skip bond-level requirement for gated content | Safety > Bond Gate Override |
| intimacy.jealousy_enabled / spontaneity_level / time_features_enabled | false / "bold" / false (in file) | Intimacy engine toggles | Intimacy tab (Section 3) |
| memory.nostalgia_enabled, memory.reranker_enabled | True, True | Memory behaviors | none |
| nlp.ner_extraction / sarcasm_detection / toxicity_detection | True, True, True | NLP side-analyzers | none |
| routing, services, vocab (vocab_enabled, vocab_limit) | {} | LLM routing, external services, vocab injection | Safety > Vocabulary: "Inject Vocabulary" |
| webhooks | [] | Outbound webhook URLs | System > Webhooks |
| audio_cleanup_days, history_limit, frequency_penalty, motion_remote_url | 7, 0, None, "" | Misc server tunables | Safety > Audio Cache (cleanup days) |
| lms_autoload_model, compact_batch_size, settings_layout, lighting_preset, ambient_idle, render_quality | (absent) | UI-written keys (see SV) | see Section 3 |

Server-side `_KNOWN_CFG_KEYS` (backend/server.py ~line 195) only logs a warning for unknown keys; it does not reject them.

---

## SECTION 3 - Settings screen map (views/SettingsView.tsx)

Entry points: `SettingsDrawer` (drawer/side panel, Ctrl+,), `openSettingsTab(tab)`. Three page layouts chosen by config `settings_layout` ('anchor' default / 'collapsibles' / 'sidebar'); the same section renderers are used by all. After every control a "Saved" flash appears. Tabs in order (TABS array): General, Character, Brain, Voice, Safety, Intimacy, AI Art, System, Physics, TTS Models, LM Models.

### 3.1 General (GeneralTab)
Sections: Setup Guides, Keyboard Shortcuts, Discord Rich Presence (inside Behavior area), Theme, Theme Customization, Layout, Chat Effects, 3D Viewport, Behavior, Display, Chat Behaviour, About You, Feature Discovery, Desktop Pet.

| section | label | control | writes |
|---|---|---|---|
| Setup Guides | cards: Set up Voice, Set up Image Gen, Configure LLM, Import Character, Expression Portraits | buttons | opens wizards (wizardStore); completion flags voice_setup_completed / image_gen_setup_completed |
| Keyboard Shortcuts | per-action key capture | key-capture inputs + reset | appStore.customKeyBindings |
| Theme | Color Theme | select (8 options: sakura, crystal, matcha, lavender, peach, dark-sakura, dark-crystal, midnight) | useTheme.theme |
| Theme Customization | preset cards (Dark, Light, Crystal, Dark Crystal featured; others behind "Show more themes"), 5 color pickers (accent, background, surface, text, border) | cards + color inputs + reset | useTheme.theme, appStore.customTheme, localStorage sakura-custom-theme |
| Layout | Chat Layout | select | cfg chat_layout |
| Layout | Chat Font Size | slider/select | cfg chat_font_size |
| Layout | Show Timestamps | toggle | cfg show_timestamps |
| Layout | Interface Sounds | toggle | cfg ui_sounds |
| Chat Effects | Typewriter Effect | toggle + speed | cfg typewriter_enabled, typewriter_speed |
| 3D Viewport | Scene Lighting | select | cfg lighting_preset |
| 3D Viewport | Shadow Quality | select | cfg shadow_quality |
| 3D Viewport | FPS Cap (tier 1) | select | cfg fps_target |
| 3D Viewport | Anti-Aliasing (tier 1) | toggle | cfg antialias |
| Behavior | Ambient Idle | toggle | cfg ambient_idle |
| Behavior | Proactive Messages (tier 1) | toggle | local proactive state (hooks/useProactive.ts) |
| Behavior | Frequency (tier 1) / Active Hours (tier 1) / Recent Messages (tier 1) | select / range / list | proactive state |
| Behavior | Message During AI Response (tier 1) | select | cfg message_input_mode |
| Behavior | Discord Application ID, Enable Discord Rich Presence | text + toggle | Discord RPC state |
| Display | Advanced Mode (tier 1) | toggle | appStore.settingsTier (0<->1) |
| Display | Developer Mode (tier 1) | toggle | appStore.settingsTier (->2) |
| Display | Chat style | segmented: Screenplay / Transcript / Storybook | appStore.chatStyle |
| Display | Reply animation | segmented (live / fade / beats) | appStore.replyDelivery |
| Display | Model thinking | segmented (Off / Peek / Open) | appStore.thoughtsMode |
| Display | Layout | segmented: Normal / Compact / Mobile | appStore.layoutMode |
| Display | HUD Density | segmented: Cozy / Minimal | appStore.layoutMode (normal / minimal) |
| Display | Settings Layout | select (anchor / collapsibles / sidebar) | cfg settings_layout |
| Chat Behaviour | Incognito Mode | toggle | appStore.incognito |
| Chat Behaviour | Quick-Reply Chips | toggle | appStore.showQuickChips |
| Chat Behaviour | Thinking Indicator Style | segmented (skeleton / stages) | appStore.thinkingIndicatorMode |
| Chat Behaviour | Settings Panel | segmented (drawer / sidebar) | appStore.settingsMode |
| About You | Your name | text | cfg user_name |
| About You | Tell your characters about yourself | textarea | cfg user_persona |
| Feature Discovery | Hide tooltips | toggle | cfg tooltips_hidden |
| Desktop Pet | (section, controls open the pet) | buttons | Electron pet window |

### 3.2 Character (CharacterTab - edits the active character, not app config)
Sections: Editing: <name>, Avatar & Appearance, Voice, Relationship, Backstory, Availability, Daily Mood, Output Format Rules; buttons for JSON download, SillyTavern CHARA v2 PNG export, JSON import. Writes go to `/api/characters/...`, not `/api/config`.

### 3.3 Brain (BrainTab)
| section | label | control | writes |
|---|---|---|---|
| Connection | Backend | select (PROVIDER_PRESETS) | llm.provider, llm.endpoint |
| Connection | LLM Endpoint | text | llm.endpoint |
| Connection | Active Model | select + refresh | llm.model, llm.link.enabled, llm.link.auto_route |
| Model Intelligence | Thinking / Reasoning (t1) | toggle | llm.thinking_mode |
| Model Intelligence | Show Thinking Tags (t1) | toggle | thinking_visible |
| Model Intelligence | Tool Use / Function Calling (t1) | toggle | llm.tool_use_enabled |
| Model Intelligence | Vision / Image Input (t1) | toggle | llm.vision_enabled |
| Model Intelligence | Context Window | select/slider | context_limit |
| Model Intelligence | Character Detail | select | prompt_tier |
| Model Intelligence | Tool Call Protocol (t2) | select | per-model protocol override |
| Inference Parameters | Reply Length | segmented + temperature / repeat penalty / timeout sliders | appStore.replyLengthMode, temperature, repeat_penalty, llm.timeout_seconds |
| Inference Parameters | System Prompt Override (t1) | textarea | system_prompt |
| Context & Memory | Auto-Compact Threshold (t1) | slider | auto_compact_threshold |
| Context & Memory | Compact Batch Size (t2) / Keep Recent Messages (t2) | number | compact_batch_size, keep_recent_messages |
| Voice Fine-tuning (Beta) | (section; not itemised here) | - | - |

### 3.4 Voice (VoiceTab)
| section | label | control | writes |
|---|---|---|---|
| Text-to-Speech | TTS Provider | select | tts.provider |
| Text-to-Speech | Voice | select + gallery | tts.voice_id |
| Text-to-Speech | Auto-Speak | toggle + sliders | tts.auto_speak, tts_volume, speech_rate, pitch_shift, voice_stability, tts.exaggeration |
| Text-to-Speech | Interrupt Mode (t1) | toggle | interrupt_mode |
| Text-to-Speech | Fast TTS (Sentence Streaming) (t1) | toggle | tts.fast_chunking |
| Text-to-Speech | Voice Preview / Provider Benchmark | buttons | none (test) |
| Voice Cloning | Voice Wand, Result, Voice Sample | upload + buttons | clone API |
| Speech Recognition (ASR) | ASR Provider | select | asr_provider |
| Speech Recognition (ASR) | Groq API Key | password text | groq_api_key (secret) |
| Speech Recognition (ASR) | Whisper Model Size (t1) | select + sliders | asr_model, vad_threshold, asr_min_confidence |
| Voice Conversation (Full-Duplex) | Auto-Interrupt | toggle + sliders | voice.auto_interrupt, voice.silence_timeout_ms, voice.vad_threshold, voice.speaking_vad_threshold |
| Character Audio | Ambient Audio / Breathing Sounds / Idle Vocalizations / Touch Sounds | toggles + volume | character_audio.* |

### 3.5 Safety (SafetyTab)
| section | label | control | writes |
|---|---|---|---|
| Content Ceiling | General / Edgy / Mature / Explicit cards (Mature needs bond 20, Explicit bond 50, both need age confirm) | radio cards | `/api/content-gate` (+ content_filter_level) |
| Age Verification | I am 18 years or older | checkbox | age flag via API |
| Per-Character Overrides | per-character ceiling dropdowns | selects | per-character API |
| Content Lock | Lock content controls, Locked | password lock | lock API |
| RP Style | RP Style Preset | select | rp_style_preset |
| Audio Cache | cleanup control | button/number | audio_cleanup_days |
| Vocabulary | Inject Vocabulary | toggle + limit | vocab_enabled, vocab_limit |
| Feedback Signals | Show feedback buttons on messages; Allow implicit feedback collection | toggles | feedback preference API |
| Bond Gate Override | Skip Bond Level Requirement | toggle | nsfw.skip_bond_gate |

### 3.6 Intimacy (components/NsfwSettingsTab.tsx)
| section | label | control | writes |
|---|---|---|---|
| Power Dynamics | Character; Dynamic type; Intensity | select, select, slider | per-character power-dynamic API |
| Jealousy & Possessiveness | Enable jealousy | toggle | intimacy.jealousy_enabled |
| Spontaneity | Spontaneity level | select | intimacy.spontaneity_level |
| Time-Aware Features | Enable time features | toggle | intimacy.time_features_enabled |

### 3.7 AI Art (AIArtTab)
Image Generation: "Image Generator" (image_gen.provider), "Image Gen URL" (image_gen.endpoint), "Default Checkpoint" (t1; image_gen.model/steps/width/height/retention_days). Test Generate (button). Video Generation (t1): "Video Generator", "Video Gen URL" (video_gen.provider/endpoint).

### 3.8 System (SystemTab)
LM Studio: "Auto-Start LM Studio" (auto_start_lmstudio), "Auto-Load Model" t1 (lms_autoload_model). 3D Viewport (all t1): "Scene Lighting" (lighting_preset), "FPS Cap" (fps_target), "Shadow Quality" (shadow_quality), "Render Quality" (render_quality), "Anti-Aliasing" (antialias), "FPS Overlay" (show_fps_overlay). Vocabulary: "Browse Vocabulary". Developer: "Developer Mode" (dev_mode), "Kokoro Engine" (kokoro_enabled, log_limit), "Auto-Save Logs" t1 (save_logs_auto), "Export All Data", "Factory Reset" (`POST /api/config/reset`). Webhooks: URL list + test ping (webhooks). Also a Performance panel (PerformanceStatsSection) showing live stats.

### 3.9 Physics (components/JigglePhysicsPanel.tsx)
Enable toggle (jiggle.enabled), "Jiggle preset" select (jiggle.preset), sliders "Breast", "Butt", "Thigh" (jiggle.body_parts.*), "Body type" select. All save the whole `jiggle` object.

### 3.10 TTS Models / LM Models
Embed `TTSModelsPanel` ("Voice Model Manager") and `ModelManagerPanel` ("LM Studio Model Manager"): download/delete/load model lists; no config keys.

---

## SECTION 4 - HUD / on-screen elements

Layout root: `App.tsx` = flex row: `Sidebar` | `<main>` (WelcomeScreen / CreateView / ChatThread) + overlays. `MobileApp.tsx` + `components/TabBar.tsx` is a separate mobile shell (Ctrl+1..5 tab switch).

| name | file | what it shows | settings that affect it |
|---|---|---|---|
| Sidebar | components/Sidebar.tsx | Collapsible nav: Chats, Characters, Create sections; frontend switch (Neon/Sakura/Nova/Girly); More tools (Memory, Lorebook, Stats, Context); Help (Setup Guides, Keyboard Shortcuts); notification badge | sidebarCollapsed, sidebarSection, layoutMode (minimal = icon strip), settingsTier |
| Chat header / StatusBar | components/StatusBar.tsx | Character name, time-of-day mood slot, Author's Note badge, search toggle (Thread/Global), ContextBudgetPill, Settings button, "Open 3D character viewer" button, More tools menu (Chat threads, Export Text/Markdown/JSON, Ambient sounds, Models) | layoutMode (minimal hides buttons), settingsTier, modelPanelOpen |
| Context pill | components/ContextBudgetPill.tsx | Token usage of the app's LLM context (not Claude Code's) from `/api/context-budget/{session}` | config context_limit |
| Thread | views/ChatThread.tsx | Message list, greeting card, quick-reply chips, idle prompts, VN mode, voice mode, regenerate/edit | showQuickChips, incognito, vnMode, cinematicMode, layoutMode, rp_style_preset |
| Message bubble | components/DialogueBubble.tsx (+ MessageMeta.tsx) | Reply with script segments, emotion emoji, actions, edit/delete/regenerate | chatStyle, replyDelivery, thinkingIndicatorMode, typewriter_enabled (stored only) |
| Thinking card | components/ThinkingCard.tsx | Model reasoning above the reply (Thinking / Raw output tabs) | thoughtsMode, thinking_visible |
| Composer | views/ChatThread.tsx + components/RichComposer.tsx | Rich text box (Ctrl+I italics), send, cancel generation, push-to-talk mic, composer-modes menu (Scenario library, Scenario picker, Visual Novel mode, Gesture picker, Director mode, Whisper, Quickfire), incognito banner | incognito, replyLengthMode, layoutMode, voice settings |
| Gesture picker | components/GesturePicker.tsx | Gesture/expression buttons for the VRM | toggled from composer menu |
| Waveform | components/WaveformVisualizer.tsx | TTS audio bars while speaking | tts.* |
| Voice conversation | components/VoiceConversationPanel.tsx (+ VoiceOrb.tsx) | Full-duplex voice UI; Ctrl+Shift+V | voice.*, asr.* |
| 3D viewer pane | components/ModelPanel.tsx | Slide-out right panel with the VRM iframe (frontends/shared/viewer/viewer.html), camera/expression presets, FPS overlay, effects/animation panels; Ctrl+Shift+C floating composer (FloatingComposer.tsx) | modelPanelOpen, fps_target, shadow_quality, antialias, show_fps_overlay, jiggle.* |
| Session drawer | components/SessionDrawer.tsx | Left drawer listing/renaming/deleting chat sessions | none |
| LLM probe aside | components/LLMProbeAside.tsx | Quiet italic warning about the loaded model | localStorage dismissals |
| Settings drawer | components/SettingsDrawer.tsx | Settings as right drawer or left side panel | settingsMode |
| Overlay panels (drawers) | App.tsx mounts: MemoryPanel, VocabPanel, AnalyticsPanel, DiaryPanel, StatsPanel, TimelinePanel, SessionSummaryPanel, GlobalSearchPanel, ScenarioLibrary, SessionReplayModal, LorePanel, ModelBrowser, MemoryBrowser, BoundaryPanel, VocabularyPanel, SceneBookmarks, UserKnowledgePanel, GalleryOverlay, AboutOverlay, DesireTree, IntimateMemoryBrowser, LoveLetterModal, PersonaPicker, ScenarioPicker | Opened via `activeOverlay` (store) / shortcuts | Section 5 shortcuts |
| Dev-only overlays | ContextViewer, PhotoModeOverlay, CompressionPreviewModal (all need effectiveDevMode); KokoroDebugPanel (devMode or `?debug=kokoro`, fixed bottom-right); DevConsole (devMode, lazy) | developer inspection | settingsTier 2 / Electron `--dev` |
| Cinematic overlay | components/CinematicOverlay.tsx | Full-screen over the 3D view: last 4 messages + input; Esc exits | cinematicMode (Ctrl+I) |
| Command palette | components/CommandPalette.tsx | Fuzzy command search (z-index 300) | Ctrl+K |
| Shortcut sheet | components/HotkeySheet.tsx (ShortcutHelpModal.tsx exists but App uses HotkeySheet) | List of registered shortcuts | customKeyBindings; `?` |
| Toasts | components/ToastQueue.tsx | Top-right toasts | none |
| Backend error banner | components/BackendErrorBanner.tsx | Fixed banner when the backend (:8080) is unreachable | none |
| Soundscape player | components/SoundscapePlayer.tsx | Ambient sound player | soundscapeOpen |
| Onboarding/wizards | components/onboarding, wizards/ (lazy in App) | First-run wizard, setup wizards, WhatsNewModal | onboarded, onboarding_version |
| Install button | App.tsx | "Install App" PWA button, bottom-left, only when the browser offers it | none |
| WelcomeScreen | components/WelcomeScreen.tsx | Shown when no character is selected | none |

Files present but not mounted anywhere (no import found): TemperatureMeter, ChatModeToggles, SpectatorBubble, FeedbackButtons, MessageReactionsBar, GamePanel. Intimacy overlays IntimateScenarioBrowser, FantasyJournal, IntimateGallery, AudioStoryPlayer, IntimateQuizPanel, SharedFantasyBuilder, SceneReplayViewer are behind `SHOW_NSFW_OVERLAYS = false` in App.tsx.

---

## SECTION 5 - Keyboard shortcuts

Hook: hooks/useKeyboardShortcuts.ts. Ctrl and Cmd both count as "ctrl". Shortcuts are ignored while typing in an input unless `allowInInput`. Rebinding stores `customKeyBindings[description]`. Defaults below are what App.tsx registers (the Settings editor's own default list in SV `DEFAULT_SHORTCUT_KEYS` differs - see gaps).

### 5a. Global (App.tsx `shortcuts`)
| combo | action |
|---|---|
| ctrl+, | Open settings |
| ctrl+m | Open memory browser |
| alt+v | Open vocabulary manager |
| alt+a | Conversation analytics |
| alt+s | Session summary |
| alt+d | Character diary |
| alt+t | Relationship timeline |
| alt+f | Global message search |
| ctrl+k (works in inputs) | Open command palette |
| alt+i | Scenario library |
| alt+n | New character (Create section) |
| alt+r | Session replay |
| alt+z | Character stats |
| alt+g | Gallery |
| alt+c (devMode only) | Context viewer |
| alt+shift+b | Boundaries |
| alt+shift+v | Private vocabulary |
| alt+shift+k | Scene bookmarks |
| alt+shift+m | Milestones timeline (overlay id 'milestones'; no mounted component found) |
| alt+shift+d | Desire tree |
| alt+shift+a | About |
| ctrl+\ | Toggle sidebar |
| ctrl+i | Cinematic mode |
| ctrl+shift+m | Toggle minimal mode (hide UI chrome) |
| ? | Show keyboard shortcuts (bare single key) |
| escape | Close cinematic > palette > help > active overlay (bare key) |

### 5b. Other registered handlers
| combo | action | file |
|---|---|---|
| ctrl+shift+p | Toggle Photo Mode (overlay only renders in dev mode) | hooks/usePhotoHotkeys.ts |
| ctrl+shift+g | Open Gallery | usePhotoHotkeys.ts |
| ctrl+shift+s | Quick-capture screenshot to gallery (white flash) | usePhotoHotkeys.ts |
| ctrl+shift+c | Toggle floating composer in 3D panel | components/ModelPanel.tsx |
| ctrl+shift+v | Toggle voice mode | views/ChatThread.tsx |
| ctrl+shift+r | Regenerate last assistant reply | views/ChatThread.tsx |
| ctrl+i (in composer) | Italic wrap (RichComposer toolbar) | components/RichComposer.tsx (the global ctrl+i also toggles cinematic mode - possible clash) |
| ctrl/cmd+1..5 | Switch tab (mobile shell only) | components/TabBar.tsx |
| escape | Close dropdowns/lightboxes/cinematic/wizard | many components |
| arrow left/right, escape | Lightbox navigation | components/IntimateGallery.tsx |
| enter / space | Skip VN typewriter | components/VNTextBox.tsx |

---

## SECTION 6 - Themes

Source: hooks/useTheme.ts (`ThemeMode`, `CYCLE`) and `[data-theme="..."]` blocks in the CSS. 23 ids; all 23 have CSS blocks. Dev-mode default: 'blurple' (dark) via `import.meta.env.DEV`; production default 'sakura'; a saved `sakura-theme` always wins.

| id | light/dark |
|---|---|
| sakura, crystal, catppuccin-latte, matcha, lavender, peach, bubblegum, pop-bubblegum, pop-lemonade | light (9) |
| dark-sakura, dark-crystal, midnight, blurple, catppuccin-macchiato, monokai, darcula, dracula, tokyo-night, rose-pine, synthwave84, nord-aurora, catppuccin-mocha, gruvbox-material | dark (14) |

Classification follows the comment in `CYCLE`; I did not render each theme. The Settings "Color Theme" select exposes only 8 ids; others are reachable through Theme Customization presets or the store.

---

## Known gaps / could not verify
1. Static reading only; no theme or control was rendered or clicked in a browser.
2. Settings keys with no consumer found by grep (they save to app.json, but nothing reads them): chat_layout, chat_font_size, show_timestamps, ui_sounds, typewriter_enabled / typewriter_speed (VNTextBox has its own typewriter), ambient_idle, render_quality, message_input_mode, lighting_preset, shadow_quality, fps_target, show_fps_overlay (viewer reads values another way, or not at all - unconfirmed; antialias IS read by viewer.html).
3. `settingsTier` is persisted but `devMode` / `advancedMode` are not, so after reload a tier-2 user may have `devMode` false until the tier is set again. Inferred from `partialize` and `merge`; not run.
4. ~~`replyDelivery` missing from `partialize`~~ — wrong; it is persisted (fixed 2026-10-08).
5. Duplicate "Developer Mode": Display toggle sets frontend settingsTier 2; System > Developer toggle writes backend config `dev_mode`.
6. SV `DEFAULT_SHORTCUT_KEYS` (rebinding editor) lists actions App.tsx does not register (Message schedules alt+h, Character mood board alt+b, Model arena alt+p, Character portfolio alt+o, Relationship web alt+w) and uses "Open memory manager" vs App's "Open memory browser"; rebinding by description may not match.
7. Section 3 labels were extracted by script + spot reads. The Character tab, Voice Fine-tuning, Voice Cloning internals, Safety sub-panels, Setup Guides cards, JigglePhysicsPanel internals and DiscordRpc area were not read line by line. Control types for some rows (slider vs select) are inferred.
8. Backend nested defaults for `adaptive`, `routing`, `services`, `kokoro` psychology dials, `content_gate` beyond the ceiling, and `memory` are only partly enumerated; `kokoro_enabled` is the only Kokoro key in app.json. The code-default table (Section 2) comes from regex over `cfg.get(...)` and misses dynamic access.
9. app.json contains a duplicate `llm.link.auto_route` (true then false) and a duplicated `auto_start_lmstudio` (top level and `system`).
10. `ContextBudgetPill`, `DevConsole`, `ModelPanel` and `Sidebar` internals were skimmed, not fully itemised.
