import { state } from '../core/StateManager.js';
import { logger } from '../core/Logger.js';
import { toast } from '../utils/Toast.js';

const SETTINGS_SCHEMA = {
    brain: {
        label: "BRAIN (LLM)",
        icon: "🧠",
        fields: [
            {
                id: "active_llm",
                name: "Active LLM",
                type: "select",
                options: ["Loading..."],
                default: "",
                desc: "Select the model loaded in LM Studio.",
                tooltip: "💡 Shows models from LM Studio. The loaded model is marked (Active)."
            },
            {
                id: "system_prompt",
                name: "System Prompt Override",
                type: "textarea",
                desc: "Rewrite the AI's core instructions.",
                tooltip: "⚠️ Advanced: Overrides character personality. Leave empty to use default persona.",
                validate: (val) => val.length <= 5000 || "System prompt too long (max 5000 chars)"
            },
            {
                id: "context_limit",
                name: "Context Window",
                type: "slider",
                min: 2048,
                max: 131072,
                step: 1024,
                default: 131072,
                desc: "Max tokens for memory. Match your model's context length.",
                tooltip: "💡 Set to your model's max context. Gemma3-12b supports 131072. Use Auto-Detect to query LM Studio.",
                validate: (val) => val >= 2048 && val <= 131072 || "Must be between 2048 and 131072",
                autoDetect: true
            },
            {
                id: "history_limit",
                name: "Chat History Limit",
                type: "slider",
                min: 0,
                max: 500,
                step: 10,
                default: 0,
                desc: "Max messages to include. 0 = unlimited.",
                tooltip: "💡 0 = send all history (recommended for large context models). Set a limit if you hit token limits.",
                validate: (val) => val >= 0 && val <= 500 || "Must be between 0 and 500"
            },
            {
                id: "temperature",
                name: "Temperature (Creativity)",
                type: "slider",
                min: 0.1,
                max: 2.0,
                step: 0.1,
                default: 0.7,
                desc: "Higher = More Creative, Lower = More Logical.",
                tooltip: "💡 0.7 recommended for chat. Lower (0.3) for factual, higher (1.2) for creative writing."
            },
            {
                id: "repeat_penalty",
                name: "Repetition Penalty",
                type: "slider",
                min: 1.0,
                max: 2.0,
                step: 0.05,
                default: 1.1,
                desc: "Prevent looping phrases.",
                tooltip: "💡 1.1 is usually perfect. Higher values may make responses feel forced."
            },
            {
                id: "thinking_visible",
                name: "Show Thinking <think>",
                type: "toggle",
                default: true,
                desc: "Show the AI's Chain-of-Thought.",
                tooltip: "🔍 Shows reasoning process in <think> tags. Useful for debugging."
            },
            {
                id: "llm.qwen3_thinking_mode",
                name: "Qwen3 Thinking Mode",
                type: "toggle",
                default: false,
                desc: "Enable chain-of-thought reasoning for Qwen3 models.",
                tooltip: "🧠 When ON: Qwen3 uses deep reasoning (slower, smarter). When OFF: fast direct responses. Only applies when a Qwen3 model is loaded. Recommended models by VRAM: Qwen3-4B (~3GB), Qwen3-8B (~7GB), Qwen3-14B (~10GB), Qwen3-30B-A3B (~19GB MoE)."
            }
        ]
    },
    voice: {
        label: "VOICE (TTS/ASR)",
        icon: "🗣️",
        fields: [
            { id: "speech_rate", name: "Speech Rate", type: "slider", min: 0.5, max: 2.0, step: 0.1, default: 1.0, desc: "Speed of TTS output.", tooltip: "💡 1.0 is normal speed. Lower for dramatic delivery, higher for quick responses." },
            { id: "pitch_shift", name: "Pitch Shift", type: "slider", min: -10, max: 10, step: 1, default: 0, desc: "Semitone shift for voice.", tooltip: "💡 Adjust the pitch of the AI's voice. Negative = deeper, positive = higher." },
            { id: "voice_stability", name: "Voice Stability", type: "slider", min: 0, max: 1.0, step: 0.1, default: 0.5, desc: "Consistent vs Expressive.", tooltip: "💡 Low = more expressive and varied. High = more consistent but robotic." },
            { id: "tts.exaggeration", name: "Chatterbox Exaggeration", type: "slider", min: 0.3, max: 2.0, step: 0.1, default: 0.8, desc: "Emotional intensity for Chatterbox TTS.", tooltip: "🎭 0.3–0.5 = Calm. 0.7–0.9 = Natural (recommended). 1.2–1.5 = Dramatic. 1.8+ = Over-the-top. Only applies when using the Chatterbox TTS provider." },
            { id: "interrupt_mode", name: "Interrupt Mode", type: "toggle", default: true, desc: "Stop AI talking when you speak.", tooltip: "💡 When enabled, speaking into the mic will stop the AI's current TTS playback." },
            { id: "tts.fast_chunking", name: "Fast TTS (Sentence Streaming)", type: "toggle", default: true, desc: "Start speaking after the first sentence instead of waiting for the full reply.", tooltip: "🔊 When ON: each sentence is synthesized as it arrives (~1-2s latency vs ~10s). Recommended for all local TTS providers (Kokoro, Chatterbox, Edge-TTS). Turn OFF for ElevenLabs." },
            {
                id: "asr_provider", name: "Microphone (ASR) Provider", type: "select",
                options: ["browser", "faster_whisper"],
                default: "browser",
                desc: "Speech recognition engine for voice input.",
                tooltip: "🎤 Browser: uses native Web Speech API (cloud, requires internet). Faster-Whisper: local offline transcription (install: pip install faster-whisper). Faster-Whisper is more accurate and works completely offline."
            },
            {
                id: "asr_model", name: "Faster-Whisper Model Size", type: "select",
                options: ["tiny.en", "base.en", "small", "medium", "large-v3"],
                default: "base.en",
                desc: "Accuracy vs. speed tradeoff. Only applies when using Faster-Whisper.",
                tooltip: "💡 tiny.en: fastest, least accurate. base.en: good balance for English. large-v3: best accuracy, multilingual, needs ~4GB RAM."
            }
        ]
    },
    visuals: {
        label: "APPEARANCE",
        icon: "🎨",
        fields: [
            { id: "visual_mode", name: "Avatar Engine", type: "select", options: ["3D (VRM)", "2D (Live2D)"], default: "3D (VRM)", desc: "Choose rendering engine.", tooltip: "💡 VRM = 3D models with full body/face animation. Live2D = 2D animated portraits." },
            { id: "theme", name: "Visual Theme", type: "select", options: ["Synthwave UI (Dark)", "Zen (Light)", "Anime Pop", "Bubblegum", "Dracula", "Nord", "Hacker", "Blurple", "iOS Messages", "iOS Dark"], default: "Synthwave UI (Dark)", desc: "Global color scheme.", tooltip: "💡 Changes the entire UI color palette. Use Theme Editor below for fine-grained control." },
            { id: "bg_mode", name: "Dynamic Background", type: "select", options: ["Void", "Bento Gradient", "Digital Rain", "City Video"], default: "Bento Gradient", desc: "Background animation style.", tooltip: "💡 Decorative background behind the main UI panels." },
            { id: "glow_intensity", name: "Neon Glow Intensity", type: "slider", min: 0, max: 100, default: 50, desc: "Brightness of UI elements.", tooltip: "💡 Controls the strength of neon glow effects. Set to 0 for a more subtle look." },
            { id: "ui_border_radius", name: "Border Radius", type: "slider", min: 0, max: 20, step: 2, default: 12, desc: "Roundness of panels (px).", tooltip: "💡 0 = sharp corners, 20 = very rounded. Affects all panels and buttons." },
            { id: "ui_blur", name: "Glass Blur", type: "slider", min: 0, max: 50, step: 5, default: 10, desc: "Backdrop blur strength (px).", tooltip: "💡 The frosted glass effect on panels. Higher = more blur. May impact performance." },
            { id: "ui_font_size", name: "Base Font Size", type: "slider", min: 12, max: 20, step: 1, default: 14, desc: "Text size scaling (px).", tooltip: "💡 Scales all text in the UI. Useful for accessibility or high-DPI displays." },
            { id: "layout_show_left", name: "Show Left Panel (Character)", type: "toggle", default: true, desc: "Toggle Character List.", tooltip: "💡 Hides the left sidebar with character roster and chat threads." },
            { id: "layout_show_right", name: "Show Right Panel (Memory)", type: "toggle", default: true, desc: "Toggle Context/Debug.", tooltip: "💡 Hides the right sidebar with memory bank, relationship, and system stats." },
            { id: "chat_layout", name: "Chat Layout", type: "select", options: ["Auto (Recommended)", "Full Chat", "Toggle View"], default: "Auto (Recommended)", desc: "How chat and 3D viewport share the center panel.", tooltip: "💡 Auto: chat expands when no 3D model loaded. Full Chat: no 3D viewport. Toggle View: button switches between modes." },
            { id: "ui_sounds", name: "Interface Sounds", type: "toggle", default: false, desc: "Clicks and beeps.", tooltip: "💡 Plays subtle cyberpunk sound effects on button clicks and notifications." },
            { id: "lighting_preset", name: "Scene Lighting", type: "select", options: ["studio", "warm_sunset", "cool_moonlight", "dramatic", "neon"], default: "studio", desc: "Lighting mood for the 3D viewport.", tooltip: "💡 Changes the lighting on your 3D avatar. Studio is neutral, others are atmospheric." },
            { id: "fps_target", name: "FPS Cap (3D Viewport)", type: "select", options: ["30", "60", "120", "Unlimited"], default: "Unlimited", desc: "Limit 3D render frame rate.", tooltip: "💡 Capping FPS reduces GPU load. Useful if the app is running in the background or on battery." },
            { id: "show_fps_overlay", name: "Show FPS Overlay (in Viewport)", type: "toggle", default: false, desc: "Display live FPS counter inside the 3D model window.", tooltip: "💡 Shows a small FPS readout in the corner of the 3D viewport for quick performance checks." },
            { id: "_open_theme_editor", name: "Theme Editor", type: "button", action: "theme_editor", desc: "Fine-tune CSS variables, create and export custom themes.", tooltip: "🎨 Opens a live editor for every CSS variable. Save custom themes and share them." }
        ]
    },
    character: {
        label: "CHARACTER",
        icon: "👤",
        fields: [
            { id: "active_character_id", name: "Active Character", type: "select", options: ["Loading..."], default: "1", desc: "Select the current persona.", tooltip: "💡 Switch between your created characters. Each has their own personality, avatar, and chat history." },
            { id: "avatar_url", name: "2D Avatar / Icon", type: "gallery", filter: "avatar", desc: "Select a profile picture for chat/UI.", tooltip: "💡 This image appears in chat bubbles and the character roster. Click to select, use + to upload." },
            { id: "model_vrm", name: "VRM Model", type: "select", options: ["Loading..."], default: "", desc: "3D Model file.", tooltip: "💡 VRM files are 3D anime models. Place .vrm files in backend/storage/avatars/ to see them here." },
            { id: "live2d_model", name: "Live2D Model", type: "select", options: ["Loading..."], default: "", desc: "2D Model folder.", tooltip: "💡 Live2D models are 2D animated portraits. Switch Avatar Engine to '2D (Live2D)' in Appearance tab to use." },
            { id: "bg_image", name: "Background Image", type: "gallery", filter: "background", desc: "Select a background for this character.", tooltip: "💡 Per-character background shown behind the 3D/2D avatar. Click to select, use + to upload." },
            { id: "background_mode", name: "Background Mode", type: "select", options: ["transparent", "image", "color", "video", "gradient"], default: "transparent", desc: "How the 3D viewport background is rendered.", tooltip: "💡 Transparent blends with the UI. Image/Video shows media behind the avatar. Color is a solid fill." }
        ]
    },
    templates: {
        label: "TEMPLATES",
        icon: "📋",
        fields: [
            { id: "_templates_ui", name: "Prompt Template Library", type: "custom", desc: "Manage reusable system prompts for characters." }
        ]
    },
    vocab: {
        label: "VOCAB",
        icon: "📖",
        fields: [
            { id: "vocab_enabled", name: "Inject Vocabulary Context", type: "toggle", default: true, desc: "Send vocab context to the LLM so it can use slang/terms naturally.", tooltip: "💡 When on, the AI receives a curated list of slang/vocab so it can use them naturally in conversation." },
            { id: "vocab_limit", name: "Vocab Context Size", type: "slider", min: 10, max: 100, step: 5, default: 40, desc: "Max vocab entries injected per message.", tooltip: "💡 More entries = richer vocabulary but uses more tokens. 40 is a good balance." },
            { id: "_vocab_manager_btn", name: "Vocabulary Manager", type: "custom", desc: "Browse, search, and manage all vocabulary entries.", tooltip: "📖 Opens the full vocab browser with 2500+ base entries. Add your own custom terms too." }
        ]
    },
    system: {
        label: "SYSTEM & DEV",
        icon: "⚙️",
        fields: [
            { id: "auto_start_lmstudio", name: "Auto-Start LM Studio (Headless)", type: "toggle", default: true, desc: "Start LM Studio daemon automatically on server boot.", tooltip: "💡 Runs 'lms daemon up' + 'lms server start' if LM Studio is not reachable." },
            { id: "dev_mode", name: "Developer Mode", type: "toggle", default: false, desc: "Show Debug Log Overlay.", tooltip: "🔧 Shows a floating debug panel with API calls, errors, and timing. Press Ctrl+Shift+D to toggle." },
            { id: "log_limit", name: "Log Buffer Size", type: "slider", min: 100, max: 1000, step: 100, default: 200, desc: "Lines to keep in memory.", tooltip: "💡 How many log lines to keep in the developer console. Higher = more history but more memory." },
            { id: "save_logs_auto", name: "Auto-Save Logs", type: "toggle", default: false, desc: "Save logs on exit.", tooltip: "💡 Automatically saves the debug log to a file when you close the app." },
            { id: "reset_all", name: "Factory Reset", type: "button", action: "reset", desc: "Wipe all settings.", tooltip: "⚠️ Resets ALL settings to defaults. Characters and chat history are NOT affected." },
            { id: "_open_error_log", name: "Error Log", type: "button", action: "open_error_log", desc: "View JS errors and backend log output.", tooltip: "🐛 Opens the developer console on the Errors tab. Shows JS exceptions and backend error lines." }
        ]
    }
};

export class SettingsModal {
    constructor() {
        this.injectHTML();
        this.modal = document.getElementById('settings-modal');
        this.currentTab = 'brain';
        this.bindEvents();
        this.images = []; // Cache for gallery images
        this.galleryPage = 0; // Current page for gallery pagination
        this.galleryPageSize = 20; // Images per page

        /** @type {string[]} Config snapshots for undo/redo (JSON strings) */
        this.undoStack = [];
        /** @type {string[]} Redo stack (cleared on new changes) */
        this.redoStack = [];
        /** @type {number} Max undo history depth */
        this.maxUndoDepth = 20;

        // Global Access
        window.openSettings = (tab) => this.open(tab);
    }

    injectHTML() {
        if (document.getElementById('settings-modal')) return;
        const html = `
            <div id="settings-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel settings-box">
                    <button id="btn-close-settings" class="settings-close-x" title="Close (Esc)">&times;</button>
                    <div class="settings-sidebar">
                        <div class="settings-header">CONFIG V3.0</div>
                        <div id="settings-tabs"></div>
                    </div>
                    <div class="settings-content">
                        <div id="settings-scroll-area"></div>
                        <div class="settings-actions" style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-sm" id="btn-undo-settings" title="Undo (Ctrl+Z)" disabled style="opacity:0.4; padding:0.375rem 0.75rem; font-size:0.75rem;">UNDO</button>
                                <button class="btn btn-sm" id="btn-redo-settings" title="Redo (Ctrl+Y)" disabled style="opacity:0.4; padding:0.375rem 0.75rem; font-size:0.75rem;">REDO</button>
                            </div>
                            <button class="btn btn-primary" id="btn-save-settings">APPLY CHANGES</button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .setting-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .setting-tooltip {
                    cursor: help;
                    font-size: 0.9rem;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                    position: relative;
                }
                .setting-tooltip:hover {
                    opacity: 1;
                }
                .setting-tooltip:hover::after {
                    content: attr(data-tip);
                    position: absolute;
                    left: 50%;
                    transform: translateX(-50%);
                    bottom: calc(100% + 6px);
                    width: max-content;
                    max-width: 280px;
                    padding: 6px 10px;
                    background: rgba(10, 11, 20, 0.95);
                    border: 1px solid var(--neon-cyan, #00f0ff);
                    border-radius: 6px;
                    color: var(--text-main, #e0e6ed);
                    font-size: 0.7rem;
                    font-family: var(--font-body, sans-serif);
                    line-height: 1.4;
                    white-space: normal;
                    z-index: 100;
                    pointer-events: none;
                    box-shadow: 0 2px 12px rgba(0, 240, 255, 0.15);
                }
                .setting-row.validation-error {
                    border-left: 3px solid var(--neon-pink, #ff00ff);
                    padding-left: 10px;
                    background: rgba(255, 0, 255, 0.1);
                }
                .setting-row.validation-error::after {
                    content: attr(data-error);
                    display: block;
                    color: var(--neon-pink, #ff00ff);
                    font-size: 0.75rem;
                    margin-top: 5px;
                    font-family: var(--font-mono, monospace);
                }
                .gallery-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                    gap: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                    padding: 5px;
                    border: 1px solid var(--glass-border);
                    border-radius: 8px;
                    background: rgba(0,0,0,0.2);
                }
                .gallery-item {
                    aspect-ratio: 1;
                    border-radius: 6px;
                    overflow: hidden;
                    cursor: pointer;
                    border: 2px solid transparent;
                    transition: all 0.2s;
                    position: relative;
                }
                .gallery-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .gallery-item:hover {
                    box-shadow: 0 0 10px var(--neon-primary);
                }
                .gallery-item.selected {
                    border-color: var(--neon-primary);
                    box-shadow: 0 0 15px var(--neon-primary);
                }
                .gallery-item-label {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: rgba(0,0,0,0.7);
                    color: white;
                    font-size: 10px;
                    padding: 2px;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            </style>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    bindEvents() {
        document.getElementById('btn-close-settings').onclick = () => this.close();
        document.getElementById('btn-save-settings').onclick = () => this.save();
        document.getElementById('btn-undo-settings').onclick = () => this.undo();
        document.getElementById('btn-redo-settings').onclick = () => this.redo();

        // Render Tabs
        const tabContainer = document.getElementById('settings-tabs');
        Object.keys(SETTINGS_SCHEMA).forEach(key => {
            const cat = SETTINGS_SCHEMA[key];
            const btn = document.createElement('div');
            btn.className = 'tab-btn';
            btn.innerHTML = `${cat.icon} ${cat.label}`;
            btn.onclick = () => this.switchTab(key);
            btn.dataset.tab = key;
            tabContainer.appendChild(btn);
        });

        // Global trigger (supports optional tab parameter)
        window.openSettings = (tab) => this.open(tab);
    }

    async fetchImages() {
        try {
            const res = await fetch('/api/scan/images');
            const data = await res.json();
            this.images = data.images || [];
        } catch (e) {
            console.error("Failed to fetch images", e);
        }
    }

    /**
     * Fetch VRM model files from the backend and populate the schema dropdown.
     * Updates SETTINGS_SCHEMA.character in place so renderField sees real options.
     */
    async fetchVrmModels() {
        try {
            const res = await fetch('/api/scan/vrm');
            const data = await res.json();
            const models = data.models || [];
            const vrmField = SETTINGS_SCHEMA.character.fields.find(f => f.id === 'model_vrm');
            if (vrmField) {
                vrmField.options = ['(None)', ...models.map(m => m.url)];
                // Store mapping for display labels
                vrmField._labelMap = { '(None)': '(None)' };
                models.forEach(m => { vrmField._labelMap[m.url] = m.name; });
            }
        } catch (e) {
            console.error("Failed to fetch VRM models", e);
        }
    }

    /**
     * Fetch Live2D model files from the backend and populate the schema dropdown.
     */
    async fetchLive2dModels() {
        try {
            const res = await fetch('/api/scan/live2d');
            const data = await res.json();
            const models = data.models || [];
            const l2dField = SETTINGS_SCHEMA.character.fields.find(f => f.id === 'live2d_model');
            if (l2dField) {
                l2dField.options = ['(None)', ...models.map(m => m.url)];
                l2dField._labelMap = { '(None)': '(None)' };
                models.forEach(m => { l2dField._labelMap[m.url] = m.name; });
            }
        } catch (e) {
            console.error("Failed to fetch Live2D models", e);
        }
    }

    /**
     * Fetch loaded/available models from LM Studio for the Active LLM dropdown.
     * Marks the currently loaded model with "(Active)" suffix.
     */
    async fetchLmStudioModels() {
        try {
            const res = await fetch('/api/lm-studio/models');
            const data = await res.json();
            if (!data.ok) return;

            const models = data.models || [];
            const activeId = data.active_model?.id || '';
            const llmField = SETTINGS_SCHEMA.brain.fields.find(f => f.id === 'active_llm');
            if (llmField) {
                llmField.options = models.map(m => m.id);
                llmField._labelMap = {};
                models.forEach(m => {
                    const state = m.state === 'loaded' ? ' (Active)' : '';
                    llmField._labelMap[m.id] = m.id.split('/').pop() + state;
                });
            }

            // Pre-fill with currently configured model
            const cfgModel = this.tempConfig?.llm?.model || '';
            if (cfgModel && models.some(m => m.id === cfgModel || m.id.includes(cfgModel) || cfgModel.includes(m.id))) {
                const match = models.find(m => m.id === cfgModel || m.id.includes(cfgModel) || cfgModel.includes(m.id));
                if (match) this.tempConfig.active_llm = match.id;
            } else if (activeId) {
                this.tempConfig.active_llm = activeId;
            }
        } catch (e) {
            console.error("Failed to fetch LM Studio models", e);
        }
    }

    open(tab) {
        this.modal.style.display = 'flex';
        this.galleryPage = 0; // Reset pagination when opening modal

        // Safeguard against undefined state or config
        const currentState = state.state || {};
        this.tempConfig = JSON.parse(JSON.stringify(currentState.config || {}));

        // === HYDRATE OPTIONS FROM STATE ===
        // Populate Character Dropdown
        if (currentState.characters && currentState.characters.length > 0) {
            const charField = SETTINGS_SCHEMA.character.fields.find(f => f.id === 'active_character_id');
            if (charField) {
                // Store ID and Name. For the select, we should probably use ID as value.
                // But the helper `renderField` currently assumes options array strings match values?
                // Let's check `renderField`: 
                // `o.value = opt; o.innerText = opt;`
                // It uses the string as both value and text.
                // So we should probably format it as "ID: Name" or change `renderField` to handle objects.
                // For now, let's just make it "Name" and hope names are unique? 
                // Or better, let's update `renderField` to handle simple string options.
                // Actually `active_character_id` is an ID.
                // If I set options to ["1", "2"], the dropdown will show "1", "2". Not user friendly.
                // Fix: I need to update `renderField` to support `options` as objects {value, label} OR simple strings.

                // For this quick fix, let's just update the schema to be compatible if I can, 
                // but `renderField` is simplistic.
                // Let's modify `renderField` properly in the next step. 
                // For now, I will just put the IDs effectively, or map names if I modify renderField.

                // Actually, let's do the renderField upgrade first or inline.
                // I will assume I can change renderField in the same file.

                charField.options = currentState.characters.map(c => `${c.id}: ${c.name}`);
            }
        }

        // Pre-fill active character specifics not in global config
        const activeChar = currentState.characters?.find(c => c.id == currentState.currentCharacterId);
        if (activeChar) {
            // Match the option format "ID: Name"
            this.tempConfig.active_character_id = `${activeChar.id}: ${activeChar.name}`;
            // 2D avatar icon (gallery-selected image)
            this.tempConfig.avatar_url = activeChar.avatar_2d_url || activeChar.avatar_url || '';
            // 3D VRM model URL (from dedicated DB column)
            this.tempConfig.model_vrm = activeChar.vrm_model_url || '';
            // Live2D model path
            this.tempConfig.live2d_model = activeChar.live2d_model || '';
            // Background image (DB column is background_url, not bg_image)
            this.tempConfig.bg_image = activeChar.background_url || '';
            // Background mode for the viewer (Fix 9: pre-fill so gallery shows current selection)
            this.tempConfig.background_mode = activeChar.background_mode || 'transparent';
        }

        // Flatten nested config values for toggle fields
        // auto_start_lmstudio lives in system.auto_start_lmstudio
        if (this.tempConfig.system?.auto_start_lmstudio !== undefined) {
            this.tempConfig.auto_start_lmstudio = this.tempConfig.system.auto_start_lmstudio;
        }
        // vocab.enabled / vocab.limit → flat vocab_enabled / vocab_limit
        if (this.tempConfig.vocab) {
            if (this.tempConfig.vocab.enabled !== undefined) {
                this.tempConfig.vocab_enabled = this.tempConfig.vocab.enabled;
            }
            if (this.tempConfig.vocab.limit !== undefined) {
                this.tempConfig.vocab_limit = this.tempConfig.vocab.limit;
            }
        }

        // Flat ASR fields: asr_provider / asr_model map to cfg.asr.provider / cfg.asr.model
        this.tempConfig.asr_provider = this.tempConfig.asr?.provider ?? "browser";
        this.tempConfig.asr_model = this.tempConfig.asr?.model ?? "base.en";

        // Dot-notation fields: stored nested in config but referenced by literal dotted keys in tempConfig.
        // llm.qwen3_thinking_mode → tempConfig["llm.qwen3_thinking_mode"]
        this.tempConfig["llm.qwen3_thinking_mode"] = this.tempConfig.llm?.qwen3_thinking_mode ?? false;
        // tts.exaggeration → tempConfig["tts.exaggeration"]
        this.tempConfig["tts.exaggeration"] = this.tempConfig.tts?.exaggeration ?? 0.8;
        // tts.fast_chunking → tempConfig["tts.fast_chunking"]
        this.tempConfig["tts.fast_chunking"] = this.tempConfig.tts?.fast_chunking ?? true;

        // Fetch external data in parallel when opening
        Promise.all([
            this.fetchImages(),
            this.fetchVrmModels(),
            this.fetchLive2dModels(),
            this.fetchLmStudioModels()
        ]).then(() => {
            // Re-render current tab so dropdowns reflect fetched data
            this.switchTab(this.currentTab);
        });

        // Use requested tab, or default to 'brain'
        if (tab && SETTINGS_SCHEMA[tab]) {
            this.currentTab = tab;
        }
        this.switchTab(this.currentTab || 'brain');
    }

    close() {
        this.modal.style.display = 'none';
        this.tempConfig = null;
        this.galleryPage = 0;
        this.undoStack = [];
        this.redoStack = [];

        // Layout is managed by CSS classes (.right-open, .left-collapsed)
        // on .bento-grid — no need to set inline styles or CSS variables here.
        // The grid's class state persists correctly across modal open/close.
    }

    /**
     * Push current config state onto the undo stack.
     * Called before each field change to enable reverting.
     */
    pushUndoState() {
        if (!this.tempConfig) return;
        const snapshot = JSON.stringify(this.tempConfig);

        // Don't push if identical to last snapshot
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) {
            return;
        }

        this.undoStack.push(snapshot);
        this.redoStack = []; // New change clears redo history

        // Limit stack depth
        if (this.undoStack.length > this.maxUndoDepth) {
            this.undoStack.shift();
        }

        this._updateUndoRedoButtons();
    }

    /**
     * Undo the last settings change.
     */
    undo() {
        if (this.undoStack.length === 0) return;

        // Save current state to redo stack
        this.redoStack.push(JSON.stringify(this.tempConfig));

        // Restore previous state
        const previous = this.undoStack.pop();
        this.tempConfig = JSON.parse(previous);

        // Re-render current tab to reflect changes
        this.switchTab(this.currentTab);
        this._updateUndoRedoButtons();
        toast.info('Change undone', 1500);
    }

    /**
     * Redo the last undone change.
     */
    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo stack
        this.undoStack.push(JSON.stringify(this.tempConfig));

        // Restore redo state
        const next = this.redoStack.pop();
        this.tempConfig = JSON.parse(next);

        // Re-render current tab
        this.switchTab(this.currentTab);
        this._updateUndoRedoButtons();
        toast.info('Change redone', 1500);
    }

    /**
     * Update undo/redo button enabled state and opacity.
     * @private
     */
    _updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo-settings');
        const redoBtn = document.getElementById('btn-redo-settings');
        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
            undoBtn.style.opacity = this.undoStack.length > 0 ? '1' : '0.4';
        }
        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
            redoBtn.style.opacity = this.redoStack.length > 0 ? '1' : '0.4';
        }
    }

    /**
     * Apply a chat layout mode by setting the appropriate CSS class
     * on the .main-view element and persisting to localStorage.
     *
     * @param {string} layoutOption - One of "Auto (Recommended)", "Full Chat", "Toggle View"
     */
    _applyChatLayout(layoutOption) {
        const mainView = document.querySelector('.main-view');
        if (!mainView) return;

        /** @type {Record<string, string>} Maps settings option to CSS class suffix */
        const layoutMap = {
            'Auto (Recommended)': 'layout-auto',
            'Full Chat': 'layout-fullchat',
            'Toggle View': 'layout-toggle'
        };

        const layoutClass = layoutMap[layoutOption] || 'layout-auto';

        // Remove all layout-* classes, then add the selected one
        mainView.classList.remove('layout-auto', 'layout-fullchat', 'layout-toggle', 'show-viewport');
        mainView.classList.add(layoutClass);

        // Auto mode starts with no-model (viewer.html will remove it on VRM load)
        if (layoutClass === 'layout-auto' && !mainView.classList.contains('no-model')) {
            mainView.classList.add('no-model');
        }

        // Persist for instant restore on page load
        localStorage.setItem('waifu-chat-layout', layoutClass);
    }

    switchTab(tabId) {
        this.currentTab = tabId;
        this.galleryPage = 0; // Reset pagination when switching tabs

        // Update Sidebar UI
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });

        // Render Fields
        const container = document.getElementById('settings-scroll-area');
        container.innerHTML = `<h3>${SETTINGS_SCHEMA[tabId].label}</h3><hr style="border-color:var(--glass-border); margin-bottom:20px;">`;

        SETTINGS_SCHEMA[tabId].fields.forEach(field => {
            this.renderField(field, container);
        });
    }

    renderField(def, container) {
        const row = document.createElement('div');
        row.className = 'setting-row';

        // Label & Desc with Tooltip
        const info = document.createElement('div');
        const tooltipHtml = def.tooltip ? `<div class="setting-tooltip" data-tip="${def.tooltip.replace(/"/g, '&quot;')}">ℹ️</div>` : '';
        info.innerHTML = `
            <div class="setting-label">
                ${def.name}
                ${tooltipHtml}
            </div>
            <div class="setting-desc">${def.desc}</div>
        `;
        row.appendChild(info);

        // Input Control
        let input;
        // Default to empty object if key is missing
        const currentVal = (this.tempConfig[def.id] !== undefined) ? this.tempConfig[def.id] : def.default;

        if (def.type === 'slider') {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '10px';

            input = document.createElement('input');
            input.type = 'range';
            input.min = def.min; input.max = def.max; input.step = def.step;
            input.value = currentVal;

            const disp = document.createElement('span');
            disp.className = 'val-display';
            disp.innerText = currentVal; // initial

            input.oninput = (e) => {
                this.pushUndoState();
                const value = Number(e.target.value);
                disp.innerText = value;
                this.tempConfig[def.id] = value;

                // Run validation if provided
                if (def.validate) {
                    const validationResult = def.validate(value);
                    if (validationResult !== true) {
                        row.classList.add('validation-error');
                        row.dataset.error = validationResult;
                    } else {
                        row.classList.remove('validation-error');
                        delete row.dataset.error;
                    }
                }
            };

            wrap.appendChild(input); wrap.appendChild(disp);

            // Auto-Detect button for fields that support it (e.g. context_limit)
            if (def.autoDetect) {
                const detectBtn = document.createElement('button');
                detectBtn.className = 'btn btn-sm';
                detectBtn.innerText = 'AUTO';
                detectBtn.title = 'Auto-detect from loaded LM Studio model';
                detectBtn.style.cssText = 'padding:2px 8px; font-size:0.65rem; color:var(--neon-cyan); border:1px solid var(--neon-cyan); background:rgba(0,240,255,0.06); cursor:pointer; border-radius:4px; white-space:nowrap;';
                detectBtn.onclick = async () => {
                    detectBtn.innerText = '...';
                    detectBtn.disabled = true;
                    try {
                        // Use cached model info from Dashboard, or fetch fresh
                        let model = window.activeModelInfo;
                        if (!model) {
                            const data = await (await fetch('/api/lm-studio/models')).json();
                            model = data.active_model;
                        }
                        if (model && model.max_context_length) {
                            const ctx = model.max_context_length;
                            input.value = ctx;
                            input.max = Math.max(def.max, ctx); // Expand slider if needed
                            disp.innerText = ctx;
                            this.pushUndoState();
                            this.tempConfig[def.id] = ctx;
                            const shortName = model.id.includes('/') ? model.id.split('/').pop() : model.id;
                            detectBtn.innerText = `✓ ${shortName}`;
                            setTimeout(() => { detectBtn.innerText = 'AUTO'; detectBtn.disabled = false; }, 3000);
                        } else {
                            detectBtn.innerText = 'N/A';
                            setTimeout(() => { detectBtn.innerText = 'AUTO'; detectBtn.disabled = false; }, 2000);
                        }
                    } catch (e) {
                        detectBtn.innerText = 'ERR';
                        console.error('[Settings] Auto-detect failed:', e);
                        setTimeout(() => { detectBtn.innerText = 'AUTO'; detectBtn.disabled = false; }, 2000);
                    }
                };
                wrap.appendChild(detectBtn);
            }

            row.appendChild(wrap);
        } else if (def.type === 'toggle') {
            const toggle = document.createElement('div');
            toggle.className = `toggle-switch ${currentVal ? 'on' : 'off'}`;
            toggle.onclick = () => {
                this.pushUndoState();
                const newVal = !this.tempConfig[def.id];
                this.tempConfig[def.id] = newVal;
                toggle.className = `toggle-switch ${newVal ? 'on' : 'off'}`;
            };
            row.appendChild(toggle);
        } else if (def.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'input-field';
            input.rows = 4;
            input.value = currentVal || '';
            input.onchange = (e) => {
                this.pushUndoState();
                const value = e.target.value;
                this.tempConfig[def.id] = value;

                // Run validation if provided
                if (def.validate) {
                    const validationResult = def.validate(value);
                    if (validationResult !== true) {
                        row.classList.add('validation-error');
                        row.dataset.error = validationResult;
                    } else {
                        row.classList.remove('validation-error');
                        delete row.dataset.error;
                    }
                }
            };
            row.appendChild(input);
        } else if (def.type === 'select') {
            const selectWrap = document.createElement('div');
            selectWrap.style.display = 'flex';
            selectWrap.style.alignItems = 'center';
            selectWrap.style.gap = '8px';

            input = document.createElement('select');
            input.className = 'input-field';
            def.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                // Use friendly label from _labelMap if available
                o.innerText = (def._labelMap && def._labelMap[opt]) || opt;
                if (opt === currentVal) o.selected = true;
                input.appendChild(o);
            });
            input.onchange = (e) => {
                this.pushUndoState();
                this.tempConfig[def.id] = e.target.value;

                // Live-apply lighting preset changes
                if (def.id === 'lighting_preset' && window.app?.viewer) {
                    window.app.viewer.setLightingPreset(e.target.value);
                }
            };
            selectWrap.appendChild(input);

            // Upload button for Live2D zip uploads
            if (def.id === 'live2d_model') {
                const uploadBtn = document.createElement('button');
                uploadBtn.className = 'btn btn-sm';
                uploadBtn.style.cssText = 'margin-top:4px; width:100%; font-size:0.65rem;';
                uploadBtn.textContent = '+ Upload Live2D (.zip)';
                /**
                 * Opens a hidden file input, POSTs the zip to /api/upload/live2d,
                 * then refreshes the model list and selects the newly uploaded model.
                 */
                uploadBtn.onclick = async () => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = '.zip';
                    inp.onchange = async (ev) => {
                        const file = ev.target.files[0];
                        if (!file) return;
                        try {
                            const fd = new FormData();
                            fd.append('file', file);
                            const res = await fetch('/api/upload/live2d', { method: 'POST', body: fd });
                            const data = await res.json();
                            if (data.ok) {
                                toast.success(`Uploaded: ${data.name}`);
                                await this.fetchLive2dModels();
                                this.tempConfig[def.id] = data.url;
                                this.switchTab(this.currentTab);
                            } else {
                                toast.error(data.detail || 'Upload failed');
                            }
                        } catch (err) {
                            toast.error(`Upload failed: ${err.message}`);
                        }
                    };
                    inp.click();
                };
                row.appendChild(uploadBtn);
            }

            // Upload button for VRM fields
            if (def.id === 'model_vrm') {
                const uploadBtn = document.createElement('button');
                uploadBtn.className = 'btn btn-sm';
                uploadBtn.innerText = 'UPLOAD';
                uploadBtn.title = 'Upload a .vrm file';
                uploadBtn.style.cssText = 'padding:4px 10px; font-size:0.68rem; color:var(--neon-cyan); border:1px solid var(--neon-cyan); background:rgba(0,240,255,0.06); cursor:pointer; border-radius:4px; white-space:nowrap;';
                uploadBtn.onclick = () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.vrm';
                    fileInput.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        uploadBtn.innerText = '...';
                        uploadBtn.disabled = true;
                        try {
                            const formData = new FormData();
                            formData.append('file', file);
                            const res = await fetch('/api/upload/avatar', { method: 'POST', body: formData });
                            const data = await res.json();
                            if (data.ok) {
                                toast.success(`Uploaded ${file.name}`);
                                // Refresh VRM list and re-render
                                await this.fetchVrmModels();
                                this.tempConfig.model_vrm = data.url;
                                this.switchTab(this.currentTab);
                            } else {
                                toast.error(data.detail || 'Upload failed');
                            }
                        } catch (err) {
                            toast.error(`Upload failed: ${err.message}`);
                        } finally {
                            uploadBtn.innerText = 'UPLOAD';
                            uploadBtn.disabled = false;
                        }
                    };
                    fileInput.click();
                };
                selectWrap.appendChild(uploadBtn);
            }

            row.appendChild(selectWrap);
        } else if (def.type === 'button') {
            const btn = document.createElement('button');

            if (def.action === 'theme_editor') {
                btn.className = 'btn-config';
                btn.style.cssText = 'padding:6px 14px; color:var(--neon-cyan); border-color:rgba(0,240,255,0.2);';
                btn.innerText = "OPEN THEME EDITOR";
                btn.onclick = () => {
                    if (window.app?.themeEditor) window.app.themeEditor.open();
                };
            } else if (def.action === 'open_error_log') {
                btn.className = 'btn-config';
                btn.style.cssText = 'padding:6px 14px; color:var(--neon-magenta); border-color:rgba(255,0,60,0.2);';
                btn.innerText = "OPEN ERROR LOG";
                btn.onclick = () => {
                    // Open DevConsole on the ERRORS tab. DevConsole is attached to window.app.
                    window.app?.devConsole?.openTab('errors');
                };
            } else {
                // Default: Factory Reset
                btn.className = 'btn btn-danger';
                btn.innerText = "EXECUTE";
                btn.onclick = async () => {
                    if (confirm("Factory Reset will restore all settings to defaults. This cannot be undone.\n\nContinue?")) {
                        btn.innerText = "RESETTING...";
                        btn.disabled = true;
                        try {
                            const response = await fetch('/api/config/reset', { method: 'POST' });
                            const data = await response.json();
                            if (data.ok) {
                                toast.success("Settings reset! Reloading...", 2000);
                                setTimeout(() => window.location.reload(), 2000);
                            } else {
                                throw new Error("Reset failed");
                            }
                        } catch (e) {
                            toast.error(`Reset failed: ${e.message}`, 5000);
                            btn.innerText = "EXECUTE";
                            btn.disabled = false;
                        }
                    }
                };
            }
            row.appendChild(btn);
        } else if (def.type === 'gallery') {
            const wrapper = document.createElement('div');
            wrapper.className = 'gallery-wrapper';

            const grid = document.createElement('div');
            grid.className = 'gallery-grid';

            // Filter images if filter is specified
            let displayImages = this.images;
            if (def.filter) {
                displayImages = this.images.filter(img => img.type === def.filter);
            }

            // Calculate pagination
            const totalPages = Math.ceil(displayImages.length / this.galleryPageSize);
            const startIdx = this.galleryPage * this.galleryPageSize;
            const endIdx = startIdx + this.galleryPageSize;
            const pageImages = displayImages.slice(startIdx, endIdx);

            // Render images with upload tile and delete buttons
            if (displayImages.length === 0 && !def.filter) {
                grid.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No images found.</div>';
            } else {
                // ── Upload "+" tile (always first) ──
                const uploadTile = document.createElement('div');
                uploadTile.className = 'gallery-item';
                uploadTile.title = 'Upload new image';
                uploadTile.style.cssText = 'display:flex; align-items:center; justify-content:center; border:2px dashed var(--neon-cyan); background:rgba(0,240,255,0.03); cursor:pointer;';
                uploadTile.innerHTML = `<span style="font-size:2rem; color:var(--neon-cyan);">+</span>`;
                uploadTile.onclick = () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.png,.jpg,.jpeg,.webp,.gif';
                    fileInput.onchange = async (ev) => {
                        const file = ev.target.files[0];
                        if (!file) return;
                        const category = def.filter || '';
                        try {
                            const formData = new FormData();
                            formData.append('file', file);
                            const res = await fetch(`/api/upload/image?category=${category}`, { method: 'POST', body: formData });
                            const data = await res.json();
                            if (data.ok) {
                                toast.success(`Uploaded ${file.name}`);
                                await this.fetchImages();
                                this.tempConfig[def.id] = data.url;
                                this.switchTab(this.currentTab);
                            } else {
                                toast.error(data.detail || 'Upload failed');
                            }
                        } catch (err) {
                            toast.error(`Upload failed: ${err.message}`);
                        }
                    };
                    fileInput.click();
                };
                grid.appendChild(uploadTile);

                pageImages.forEach(img => {
                    const item = document.createElement('div');
                    item.className = 'gallery-item';
                    if (currentVal && (currentVal === img.url || currentVal.includes(img.file))) {
                        item.classList.add('selected');
                    }

                    item.innerHTML = `
                        <img src="${img.url}" alt="${img.name}" loading="lazy">
                        <div class="gallery-item-label">${img.name}</div>
                    `;

                    // Delete button (only for user-uploaded images, not presets)
                    if (img.source === 'uploaded') {
                        const delBtn = document.createElement('button');
                        delBtn.className = 'gallery-delete-btn';
                        delBtn.innerHTML = '&times;';
                        delBtn.title = 'Delete image';
                        delBtn.style.cssText = 'position:absolute; top:2px; right:2px; width:20px; height:20px; border-radius:50%; border:none; background:rgba(255,0,60,0.8); color:white; font-size:14px; line-height:20px; text-align:center; cursor:pointer; display:none; padding:0; z-index:2;';
                        delBtn.onclick = async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete "${img.name}"? This permanently removes the file.`)) return;
                            try {
                                const res = await fetch(`/api/images/${img.file}`, { method: 'DELETE' });
                                const data = await res.json();
                                if (data.ok) {
                                    toast.success(`Deleted ${img.name}`);
                                    await this.fetchImages();
                                    // Clear selection if we deleted the selected image
                                    if (this.tempConfig[def.id] === img.url) {
                                        this.tempConfig[def.id] = '';
                                    }
                                    this.switchTab(this.currentTab);
                                } else {
                                    toast.error('Delete failed');
                                }
                            } catch (err) {
                                toast.error(`Delete failed: ${err.message}`);
                            }
                        };
                        item.appendChild(delBtn);
                        // Show on hover
                        item.onmouseenter = () => { delBtn.style.display = 'block'; };
                        item.onmouseleave = () => { delBtn.style.display = 'none'; };
                    }

                    item.onclick = () => {
                        this.pushUndoState();
                        grid.querySelectorAll('.gallery-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        this.tempConfig[def.id] = img.url;
                    };

                    grid.appendChild(item);
                });

                // Add pagination controls if needed
                if (totalPages > 1) {
                    const controls = document.createElement('div');
                    controls.className = 'gallery-pagination';
                    controls.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-top: 10px;
                        font-size: 0.85rem;
                        color: var(--text-muted);
                    `;

                    const prevBtn = document.createElement('button');
                    prevBtn.className = 'btn btn-sm';
                    prevBtn.innerText = '← Prev';
                    prevBtn.disabled = this.galleryPage === 0;
                    prevBtn.onclick = () => {
                        if (this.galleryPage > 0) {
                            this.galleryPage--;
                            this.switchTab(this.currentTab); // Re-render
                        }
                    };

                    const pageInfo = document.createElement('span');
                    pageInfo.innerText = `Page ${this.galleryPage + 1} of ${totalPages} (${displayImages.length} total)`;

                    const nextBtn = document.createElement('button');
                    nextBtn.className = 'btn btn-sm';
                    nextBtn.innerText = 'Next →';
                    nextBtn.disabled = this.galleryPage >= totalPages - 1;
                    nextBtn.onclick = () => {
                        if (this.galleryPage < totalPages - 1) {
                            this.galleryPage++;
                            this.switchTab(this.currentTab); // Re-render
                        }
                    };

                    controls.appendChild(prevBtn);
                    controls.appendChild(pageInfo);
                    controls.appendChild(nextBtn);
                    wrapper.appendChild(grid);
                    wrapper.appendChild(controls);
                } else {
                    wrapper.appendChild(grid);
                }
            }

            row.appendChild(wrapper);
        } else if (def.type === 'custom' && def.id === '_vocab_manager_btn') {
            // Render a button that opens the full VocabManager modal
            const btn = document.createElement('button');
            btn.className = 'btn-config';
            btn.style.cssText = 'padding:8px 16px; color:var(--neon-magenta,#ff00ff); border-color:rgba(255,0,255,0.3); font-size:0.82rem; cursor:pointer;';
            btn.textContent = 'Open Vocabulary Manager';
            btn.onclick = () => {
                if (window.app?.vocabManager) {
                    window.app.vocabManager.open();
                }
            };
            row.appendChild(btn);
        } else if (def.type === 'custom' && def.id === '_templates_ui') {
            // Render the Prompt Template Library UI inline
            const wrapper = document.createElement('div');
            wrapper.id = 'templates-ui-container';
            wrapper.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.8rem;">Loading templates...</div>';
            row.appendChild(wrapper);

            // Load templates after DOM insertion
            requestAnimationFrame(() => this._loadTemplatesUI(wrapper));
        }

        container.appendChild(row);
    }

    /**
     * Render the Prompt Template Library inside the Settings modal.
     * Shows a list of templates with create, edit, delete, apply, import/export.
     * @private
     * @param {HTMLElement} wrapper - Container element
     */
    async _loadTemplatesUI(wrapper) {
        try {
            const res = await fetch('/api/templates');
            const data = await res.json();
            const templates = data.templates || [];

            wrapper.innerHTML = `
                <div style="display:flex; gap:8px; margin-bottom:12px;">
                    <button id="tpl-create-btn" class="btn" style="padding:6px 14px; background:rgba(0,240,255,0.08); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:6px; cursor:pointer; font-size:0.75rem;">+ NEW TEMPLATE</button>
                    <button id="tpl-import-btn" class="btn" style="padding:6px 14px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:6px; cursor:pointer; font-size:0.75rem;">IMPORT</button>
                    <button id="tpl-export-btn" class="btn" style="padding:6px 14px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:6px; cursor:pointer; font-size:0.75rem;">EXPORT ALL</button>
                </div>
                <div id="tpl-list" style="max-height:300px; overflow-y:auto;"></div>
            `;

            const list = wrapper.querySelector('#tpl-list');
            if (templates.length === 0) {
                list.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.8rem;">No templates yet. Create one to get started.</div>';
            } else {
                list.innerHTML = templates.map(tpl => `
                    <div class="tpl-row" style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                        <div style="flex:1; min-width:0;">
                            <div style="color:var(--neon-cyan); font-family:var(--font-display); font-size:0.85rem;">${this._escapeHtml(tpl.name)}</div>
                            <div style="color:var(--text-muted); font-size:0.7rem; margin-top:2px;">${this._escapeHtml(tpl.category || 'custom')} — ${this._escapeHtml((tpl.system_prompt || '').slice(0, 80))}...</div>
                        </div>
                        <div style="display:flex; gap:4px; flex-shrink:0;">
                            <button class="tpl-apply-btn btn" data-tpl-id="${tpl.id}" style="padding:4px 10px; font-size:0.65rem; color:var(--neon-green); border:1px solid rgba(57,255,20,0.2); background:transparent; border-radius:4px; cursor:pointer;">APPLY</button>
                            <button class="tpl-delete-btn btn" data-tpl-id="${tpl.id}" style="padding:4px 10px; font-size:0.65rem; color:var(--neon-magenta); border:1px solid rgba(255,0,60,0.2); background:transparent; border-radius:4px; cursor:pointer;">DEL</button>
                        </div>
                    </div>
                `).join('');
            }

            // Bind create button
            wrapper.querySelector('#tpl-create-btn').onclick = () => this._createTemplate(wrapper);

            // Bind export button
            wrapper.querySelector('#tpl-export-btn').onclick = async () => {
                try {
                    const expRes = await fetch('/api/templates/export');
                    const expData = await expRes.json();
                    const blob = new Blob([JSON.stringify(expData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'prompt_templates.json';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    toast.success('Templates exported!', 2000);
                } catch (err) {
                    toast.error(`Export failed: ${err.message}`, 3000);
                }
            };

            // Bind import button
            wrapper.querySelector('#tpl-import-btn').onclick = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async () => {
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const importData = JSON.parse(text);
                        const impRes = await fetch('/api/templates/import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(importData)
                        });
                        const impResult = await impRes.json();
                        toast.success(`Imported ${impResult.imported} templates (${impResult.skipped} skipped)`, 3000);
                        this._loadTemplatesUI(wrapper);
                    } catch (err) {
                        toast.error(`Import failed: ${err.message}`, 3000);
                    }
                };
                input.click();
            };

            // Bind apply buttons
            wrapper.querySelectorAll('.tpl-apply-btn').forEach(btn => {
                btn.onclick = async () => {
                    const tplId = btn.dataset.tplId;
                    const tpl = templates.find(t => t.id == tplId);
                    if (!tpl) return;

                    // Apply to current character's system_prompt
                    const charId = this.tempConfig.currentCharacterId || state.state.currentCharacterId;
                    if (!charId) {
                        toast.warning('No character selected', 2000);
                        return;
                    }

                    try {
                        await fetch(`/api/characters/${charId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ system_prompt: tpl.system_prompt })
                        });
                        toast.success(`Template "${tpl.name}" applied to character!`, 2000);
                        await state.loadCharacters();
                    } catch (err) {
                        toast.error(`Apply failed: ${err.message}`, 3000);
                    }
                };
            });

            // Bind delete buttons
            wrapper.querySelectorAll('.tpl-delete-btn').forEach(btn => {
                btn.onclick = async () => {
                    const tplId = btn.dataset.tplId;
                    if (!confirm('Delete this template?')) return;
                    try {
                        await fetch(`/api/templates/${tplId}`, { method: 'DELETE' });
                        toast.success('Template deleted', 2000);
                        this._loadTemplatesUI(wrapper);
                    } catch (err) {
                        toast.error(`Delete failed: ${err.message}`, 3000);
                    }
                };
            });
        } catch (err) {
            wrapper.innerHTML = `<div style="padding:12px; color:var(--neon-magenta);">Failed to load templates: ${err.message}</div>`;
        }
    }

    /**
     * Show inline form to create a new prompt template.
     * @private
     * @param {HTMLElement} wrapper - Parent container for the templates UI
     */
    _createTemplate(wrapper) {
        const form = document.createElement('div');
        form.style.cssText = 'padding:12px; border:1px solid var(--neon-cyan); border-radius:8px; margin-bottom:12px; background:rgba(0,240,255,0.03);';
        form.innerHTML = `
            <div style="margin-bottom:8px;">
                <input id="new-tpl-name" type="text" placeholder="Template name" class="input-field" style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:6px; font-size:0.8rem;">
            </div>
            <div style="margin-bottom:8px;">
                <select id="new-tpl-category" class="input-field" style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:6px; font-size:0.8rem;">
                    <option value="custom">Custom</option>
                    <option value="roleplay">Roleplay</option>
                    <option value="assistant">Assistant</option>
                    <option value="creative">Creative</option>
                </select>
            </div>
            <div style="margin-bottom:8px;">
                <textarea id="new-tpl-prompt" placeholder="System prompt..." rows="4" class="input-field" style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:6px; font-size:0.8rem; resize:vertical;"></textarea>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="new-tpl-cancel" class="btn" style="padding:6px 12px; font-size:0.75rem; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:6px; cursor:pointer;">CANCEL</button>
                <button id="new-tpl-save" class="btn" style="padding:6px 12px; font-size:0.75rem; background:rgba(0,240,255,0.1); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:6px; cursor:pointer;">SAVE</button>
            </div>
        `;

        wrapper.prepend(form);

        form.querySelector('#new-tpl-cancel').onclick = () => form.remove();
        form.querySelector('#new-tpl-save').onclick = async () => {
            const name = form.querySelector('#new-tpl-name').value.trim();
            const category = form.querySelector('#new-tpl-category').value;
            const prompt = form.querySelector('#new-tpl-prompt').value.trim();

            if (!name || !prompt) {
                toast.error('Name and prompt are required', 2000);
                return;
            }

            try {
                await fetch('/api/templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, category, system_prompt: prompt })
                });
                toast.success(`Template "${name}" created!`, 2000);
                form.remove();
                this._loadTemplatesUI(wrapper);
            } catch (err) {
                toast.error(`Create failed: ${err.message}`, 3000);
            }
        };
    }

    /**
     * Escape HTML to prevent XSS in template rendering.
     * @private
     * @param {string} str
     * @returns {string}
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async save() {
        const btn = document.getElementById('btn-save-settings');

        // Check for validation errors
        const errors = document.querySelectorAll('.setting-row.validation-error');
        if (errors.length > 0) {
            const errorMessages = Array.from(errors)
                .map(el => el.dataset.error)
                .filter(msg => msg)
                .join('\n');
            toast.error(`Cannot save: Please fix validation errors\n${errorMessages}`, 6000);
            return;
        }

        btn.innerText = "SAVING...";
        btn.disabled = true;

        // Handle Dev Mode Toggle Side Effect
        logger.toggle(this.tempConfig.dev_mode);

        try {
            // Apply Theme immediately and persist to localStorage
            const themeMap = {
                "Synthwave UI (Dark)": "dark",
                "Zen (Light)": "light",
                "Anime Pop": "pop",
                "Bubblegum": "bubblegum",
                "Dracula": "dracula",
                "Nord": "nord",
                "Hacker": "hacker",
                "Blurple": "blurple",
                "iOS Messages": "ios-light",
                "iOS Dark": "ios-dark"
            };
            const themeName = themeMap[this.tempConfig.theme] || "dark";
            document.body.dataset.theme = themeName;
            localStorage.setItem('waifu-theme', themeName);

            // Apply Granular Visuals
            const r = document.documentElement;
            if (this.tempConfig.ui_border_radius !== undefined) r.style.setProperty('--radius-panel', `${this.tempConfig.ui_border_radius}px`);
            if (this.tempConfig.ui_blur !== undefined) r.style.setProperty('--glass-blur', `${this.tempConfig.ui_blur}px`);
            if (this.tempConfig.ui_font_size !== undefined) document.body.style.fontSize = `${this.tempConfig.ui_font_size}px`;
            // glow_intensity: 0–100 slider → --glow-intensity CSS var (0–1).
            // The CSS --shadow-glow definition uses calc() to scale alpha with this variable.
            if (this.tempConfig.glow_intensity !== undefined) {
                r.style.setProperty('--glow-intensity', this.tempConfig.glow_intensity / 100);
            }

            // Apply Layout via CSS classes (matches bento grid system)
            const grid = document.querySelector('.bento-grid');
            if (grid) {
                const showLeft = this.tempConfig.layout_show_left !== false;
                const showRight = this.tempConfig.layout_show_right !== false;
                grid.classList.toggle('left-collapsed', !showLeft);
                grid.classList.toggle('right-open', showRight);
            }

            // Apply Chat Layout Mode
            this._applyChatLayout(this.tempConfig.chat_layout);

            // === SAVE ACTIVE CHARACTER SPECIFICS ===
            let activeCharId = this.tempConfig.active_character_id || state.state.currentCharacterId;

            // Parse ID if it's in "ID: Name" format
            if (typeof activeCharId === 'string' && activeCharId.includes(':')) {
                activeCharId = activeCharId.split(':')[0];
            }
            if (activeCharId) {
                // Map UI field names → DB column names for character-specific settings
                const charUpdates = {};
                if (this.tempConfig.avatar_url) charUpdates.avatar_2d_url = this.tempConfig.avatar_url;
                const vrm = this.tempConfig.model_vrm;
                if (vrm && vrm !== '(None)') {
                    charUpdates.vrm_model_url = vrm;
                } else if (vrm === '(None)') {
                    charUpdates.vrm_model_url = '';
                }
                const l2d = this.tempConfig.live2d_model;
                if (l2d && l2d !== '(None)') {
                    charUpdates.live2d_model = l2d;
                } else if (l2d === '(None)') {
                    charUpdates.live2d_model = '';
                }

                // Fix 2: Include background fields — DB column is background_url, not bg_image
                if (this.tempConfig.bg_image !== undefined) charUpdates.background_url = this.tempConfig.bg_image;
                if (this.tempConfig.background_mode) charUpdates.background_mode = this.tempConfig.background_mode;

                if (Object.keys(charUpdates).length > 0) {
                    await state.saveCharacter(activeCharId, charUpdates);
                    // Fix 1: Reload character into viewer immediately so changes take effect without a page reload.
                    // state.saveCharacter() calls loadCharacters() internally, so state.state.characters
                    // is already refreshed by the time we read it back here.
                    const freshChar = state.state.characters.find(c => c.id == activeCharId);
                    if (freshChar && window.app?.viewer) {
                        window.app.viewer.loadCharacter(freshChar);
                    }
                    // Fix 3: Apply background immediately if background settings changed
                    if (charUpdates.background_url !== undefined || charUpdates.background_mode) {
                        window.app?.viewer?.setBackground(
                            charUpdates.background_mode || 'transparent',
                            charUpdates.background_url || ''
                        );
                    }
                }
            }

            // Remove character-specific fields before persisting to global app.json.
            // These were already saved via charUpdates above; leaving them in tempConfig
            // would clobber unrelated global config keys on the next load.
            delete this.tempConfig.bg_image;
            delete this.tempConfig.background_mode;

            // Map flat UI fields back to nested config structure before saving
            // active_llm → llm.model
            if (this.tempConfig.active_llm) {
                if (!this.tempConfig.llm) this.tempConfig.llm = {};
                this.tempConfig.llm.model = this.tempConfig.active_llm;
                delete this.tempConfig.active_llm;
            }
            // auto_start_lmstudio → system.auto_start_lmstudio
            if (this.tempConfig.auto_start_lmstudio !== undefined) {
                if (!this.tempConfig.system) this.tempConfig.system = {};
                this.tempConfig.system.auto_start_lmstudio = this.tempConfig.auto_start_lmstudio;
                delete this.tempConfig.auto_start_lmstudio;
            }

            // vocab_enabled / vocab_limit → vocab.enabled / vocab.limit
            if (this.tempConfig.vocab_enabled !== undefined || this.tempConfig.vocab_limit !== undefined) {
                if (!this.tempConfig.vocab) this.tempConfig.vocab = {};
                if (this.tempConfig.vocab_enabled !== undefined) {
                    this.tempConfig.vocab.enabled = this.tempConfig.vocab_enabled;
                    delete this.tempConfig.vocab_enabled;
                }
                if (this.tempConfig.vocab_limit !== undefined) {
                    this.tempConfig.vocab.limit = this.tempConfig.vocab_limit;
                    delete this.tempConfig.vocab_limit;
                }
            }

            // Dot-notation fields: write flat staging keys back to nested config paths.
            // tempConfig["llm.qwen3_thinking_mode"] → config.llm.qwen3_thinking_mode
            if (this.tempConfig["llm.qwen3_thinking_mode"] !== undefined) {
                if (!this.tempConfig.llm) this.tempConfig.llm = {};
                this.tempConfig.llm.qwen3_thinking_mode = this.tempConfig["llm.qwen3_thinking_mode"];
                delete this.tempConfig["llm.qwen3_thinking_mode"];
            }
            // tempConfig["tts.exaggeration"] → config.tts.exaggeration
            if (this.tempConfig["tts.exaggeration"] !== undefined) {
                if (!this.tempConfig.tts) this.tempConfig.tts = {};
                this.tempConfig.tts.exaggeration = this.tempConfig["tts.exaggeration"];
                delete this.tempConfig["tts.exaggeration"];
            }
            // tempConfig["tts.fast_chunking"] → config.tts.fast_chunking
            if (this.tempConfig["tts.fast_chunking"] !== undefined) {
                if (!this.tempConfig.tts) this.tempConfig.tts = {};
                this.tempConfig.tts.fast_chunking = this.tempConfig["tts.fast_chunking"];
                delete this.tempConfig["tts.fast_chunking"];
            }

            // asr_provider / asr_model → asr.provider / asr.model
            if (this.tempConfig.asr_provider !== undefined || this.tempConfig.asr_model !== undefined) {
                if (!this.tempConfig.asr) this.tempConfig.asr = {};
                if (this.tempConfig.asr_provider !== undefined) {
                    this.tempConfig.asr.provider = this.tempConfig.asr_provider;
                    this.tempConfig.asr.enabled = this.tempConfig.asr_provider !== "browser";
                    delete this.tempConfig.asr_provider;
                }
                if (this.tempConfig.asr_model !== undefined) {
                    this.tempConfig.asr.model = this.tempConfig.asr_model;
                    delete this.tempConfig.asr_model;
                }
            }

            // Relay viewer-specific settings to the iframe via postMessage.
            // The iframe is a separate document context so CSS/JS vars don't cross the boundary.
            const viewerIframe = document.querySelector('.viewport-layer iframe');
            if (viewerIframe?.contentWindow) {
                if (this.tempConfig.show_fps_overlay !== undefined) {
                    viewerIframe.contentWindow.postMessage(
                        { type: 'showFpsOverlay', payload: { visible: !!this.tempConfig.show_fps_overlay } }, '*'
                    );
                }
                if (this.tempConfig.fps_target !== undefined) {
                    viewerIframe.contentWindow.postMessage(
                        { type: 'setFpsTarget', payload: { fps: this.tempConfig.fps_target } }, '*'
                    );
                }
            }

            await state.saveConfig(this.tempConfig);
            btn.innerText = "✅ SAVED";
            toast.success("Settings saved successfully!");
            setTimeout(() => this.close(), 500);
        } catch (e) {
            btn.innerText = "❌ ERROR";
            logger.error("Settings", "Failed to save: " + e.message);
            toast.error(`Failed to save settings: ${e.message}`, 6000);
        } finally {
            setTimeout(() => {
                btn.innerText = "APPLY CHANGES";
                btn.disabled = false;
            }, 2000);
        }
    }
}
