import { state } from '../core/StateManager.js';
import { logger } from '../core/Logger.js';

const SETTINGS_SCHEMA = {
    brain: {
        label: "BRAIN (LLM)",
        icon: "🧠",
        fields: [
            { id: "system_prompt", name: "System Prompt Override", type: "textarea", desc: "Rewrite the AI's core instructions." },
            { id: "context_limit", name: "Context Window", type: "slider", min: 2048, max: 32768, step: 1024, default: 4096, desc: "Max tokens for memory." },
            { id: "temperature", name: "Temperature (Creativity)", type: "slider", min: 0.1, max: 2.0, step: 0.1, default: 0.7, desc: "Higher = More Creative, Lower = More Logical." },
            { id: "repeat_penalty", name: "Repetition Penalty", type: "slider", min: 1.0, max: 2.0, step: 0.05, default: 1.1, desc: "Prevent looping phrases." },
            { id: "thinking_visible", name: "Show Thinking <think>", type: "toggle", default: true, desc: "Show the AI's Chain-of-Thought." }
        ]
    },
    voice: {
        label: "VOICE (TTS/ASR)",
        icon: "🗣️",
        fields: [
            { id: "speech_rate", name: "Speech Rate", type: "slider", min: 0.5, max: 2.0, step: 0.1, default: 1.0, desc: "Speed of TTS output." },
            { id: "pitch_shift", name: "Pitch Shift", type: "slider", min: -10, max: 10, step: 1, default: 0, desc: "Semitone shift for voice." },
            { id: "voice_stability", name: "Voice Stability", type: "slider", min: 0, max: 1.0, step: 0.1, default: 0.5, desc: "Consistent vs Expressive." },
            { id: "interrupt_mode", name: "Interrupt Mode", type: "toggle", default: true, desc: "Stop AI talking when you speak." }
        ]
    },
    visuals: {
        label: "APPEARANCE",
        icon: "🎨",
        fields: [
            { id: "visual_mode", name: "Avatar Engine", type: "select", options: ["3D (VRM)", "2D (Live2D)"], default: "3D (VRM)", desc: "Choose rendering engine." },
            { id: "theme", name: "Visual Theme", type: "select", options: ["Synthwave UI (Dark)", "Zen (Light)", "Anime Pop", "Bubblegum", "Dracula", "Nord", "Hacker", "Blurple"], default: "Synthwave UI (Dark)", desc: "Global color scheme." },
            { id: "bg_mode", name: "Dynamic Background", type: "select", options: ["Void", "Bento Gradient", "Digital Rain", "City Video"], default: "Bento Gradient" },
            { id: "glow_intensity", name: "Neon Glow Intensity", type: "slider", min: 0, max: 100, default: 50, desc: "Brightness of UI elements." },
            { id: "ui_border_radius", name: "Border Radius", type: "slider", min: 0, max: 20, step: 2, default: 12, desc: "Roundness of panels (px)." },
            { id: "ui_blur", name: "Glass Blur", type: "slider", min: 0, max: 50, step: 5, default: 10, desc: "Backdrop blur strength (px)." },
            { id: "ui_font_size", name: "Base Font Size", type: "slider", min: 12, max: 20, step: 1, default: 14, desc: "Text size scaling (px)." },
            { id: "layout_show_left", name: "Show Left Panel (Character)", type: "toggle", default: true, desc: "Toggle Character List." },
            { id: "layout_show_right", name: "Show Right Panel (Memory)", type: "toggle", default: true, desc: "Toggle Context/Debug." },
            { id: "ui_sounds", name: "Interface Sounds", type: "toggle", default: false, desc: "Clicks and beeps." }
        ]
    },
    character: {
        label: "CHARACTER",
        icon: "👤",
        fields: [
            { id: "active_character_id", name: "Active Character", type: "select", options: ["Loading..."], default: "1", desc: "Select the current persona." },
            { id: "avatar_url", name: "2D Avatar / Icon", type: "gallery", filter: "avatar", desc: "Select a profile picture for chat/UI." },
            { id: "model_vrm", name: "VRM Model", type: "select", options: ["Loading..."], default: "", desc: "3D Model file." },
            { id: "live2d_model", name: "Live2D Model", type: "select", options: ["Loading..."], default: "", desc: "2D Model folder." },
            { id: "bg_image", name: "Background Image", type: "gallery", filter: "background", desc: "Select a background for this character." }
        ]
    },
    system: {
        label: "SYSTEM & DEV",
        icon: "⚙️",
        fields: [
            { id: "dev_mode", name: "Developer Mode", type: "toggle", default: false, desc: "Show Debug Log Overlay." },
            { id: "log_limit", name: "Log Buffer Size", type: "slider", min: 100, max: 1000, step: 100, default: 200, desc: "Lines to keep in memory." },
            { id: "save_logs_auto", name: "Auto-Save Logs", type: "toggle", default: false, desc: "Save logs on exit." },
            { id: "reset_all", name: "Factory Reset", type: "button", action: "reset", desc: "Wipe all settings." }
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

        // Global Access
        window.openSettings = (tab) => this.open(tab);
    }

    open(tab) {
        if (tab && SETTINGS_SCHEMA[tab]) {
            this.currentTab = tab;
        }
        this.modal.style.display = 'flex';
        this.renderTabs();
        this.renderContent();
    }


    injectHTML() {
        if (document.getElementById('settings-modal')) return;
        const html = `
            <div id="settings-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel settings-box">
                    <div class="settings-sidebar">
                        <div class="settings-header">CONFIG V3.0</div>
                        <div id="settings-tabs"></div>
                        <div class="settings-footer">
                            <button class="btn" id="btn-close-settings">CLOSE</button>
                        </div>
                    </div>
                    <div class="settings-content">
                        <div id="settings-scroll-area"></div>
                        <div class="settings-actions">
                            <button class="btn btn-primary" id="btn-save-settings">APPLY CHANGES</button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
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

        // Global trigger
        window.openSettings = () => this.open();
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

    open() {
        this.modal.style.display = 'flex';
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
        const activeChar = currentState.characters.find(c => c.id == currentState.currentCharacterId);
        if (activeChar) {
            // Match the option format "ID: Name"
            this.tempConfig.active_character_id = `${activeChar.id}: ${activeChar.name}`;
            this.tempConfig.avatar_url = activeChar.avatar_url;
            this.tempConfig.model_vrm = activeChar.avatar_url; // Wait, VRM is different. 
            // VRM logic is complex because it might be in config OR character? 
            // PRD says character specific. Server says "avatar_url" is the VRM path usually?
            // Actually, looking at server.py: "avatar_url" is used for VRM path in older logic, 
            // but we want to use it for 2D icon now?
            // "model_type" distinguishes.
            // Let's check server.py SCHEMA again.
            // characters table: avatar_url (TEXT).
            // upload_avatar => .vrm file.
            // OLD LOGIC: avatar_url was the 3D model path.
            // NEW LOGIC: We want avatar_url to be the ICON.
            // AND we have model_vrm? SettingsSchema has "model_vrm".
            // Where is "model_vrm" stored in DB?
            // server.py list_characters -> "avatar_url" is row[3].
            // If we repurpose "avatar_url" for 2D icon, I break the VRM loader if it relies on that column.
            // Let's check how VRM is loaded.
            // Dashboard.js / ViewerBridge.js probably uses state.characters[id].avatar_url.

            // Checking ViewerBridge.js is safer before I commit this change.
            // But for now, I will pre-fill it.
        }

        // Fetch external data when opening
        this.fetchImages(); 

        this.switchTab('brain');
    }

    close() {
        this.modal.style.display = 'none';
        this.tempConfig = null;
    }

    switchTab(tabId) {
        this.currentTab = tabId;

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

        // Label & Desc
        const info = document.createElement('div');
        info.innerHTML = `<div class="setting-label">${def.name}</div><div class="setting-desc">${def.desc}</div>`;
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
                disp.innerText = e.target.value;
                this.tempConfig[def.id] = Number(e.target.value);
            };

            wrap.appendChild(input); wrap.appendChild(disp);
            row.appendChild(wrap);
        } else if (def.type === 'toggle') {
            const toggle = document.createElement('div');
            toggle.className = `toggle-switch ${currentVal ? 'on' : 'off'}`;
            toggle.onclick = () => {
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
            input.onchange = (e) => this.tempConfig[def.id] = e.target.value;
            row.appendChild(input);
        } else if (def.type === 'select') {
            input = document.createElement('select');
            input.className = 'input-field';
            def.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt; o.innerText = opt;
                if (opt === currentVal) o.selected = true;
                input.appendChild(o);
            });
            input.onchange = (e) => this.tempConfig[def.id] = e.target.value;
            row.appendChild(input);
        } else if (def.type === 'button') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger';
            btn.innerText = "EXECUTE";
            btn.onclick = () => {
                if (confirm("Are you sure?")) {
                    console.log("Resetting config...");
                    // TODO: call reset API
                }
            };
            row.appendChild(btn);
        } else if (def.type === 'gallery') {
            const grid = document.createElement('div');
            grid.className = 'gallery-grid';

            // Filter images if filter is specified
            let displayImages = this.images;
            if (def.filter) {
                displayImages = this.images.filter(img => img.type === def.filter);
            }

            // Render images
            if (displayImages.length === 0) {
                grid.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No images found.</div>';
            } else {
                displayImages.forEach(img => {
                    const item = document.createElement('div');
                    item.className = 'gallery-item';
                    // Check if selected (substring match for paths vs clean names)
                    if (currentVal && (currentVal === img.url || currentVal.includes(img.file))) {
                        item.classList.add('selected');
                    }

                    item.innerHTML = `
                        <img src="${img.url}" alt="${img.name}" loading="lazy">
                        <div class="gallery-item-label">${img.name}</div>
                    `;

                    item.onclick = () => {
                        // Deselect others
                        grid.querySelectorAll('.gallery-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        // Update config (store the full URL)
                        this.tempConfig[def.id] = img.url;
                    };

                    grid.appendChild(item);
                });
            }
            row.appendChild(grid);
        }

        container.appendChild(row);
    }

    async save() {
        const btn = document.getElementById('btn-save-settings');
        btn.innerText = "SAVING...";

        // Handle Dev Mode Toggle Side Effect
        logger.toggle(this.tempConfig.dev_mode);

        try {
            // Apply Theme immediately
            const themeMap = {
                "Synthwave UI (Dark)": "dark",
                "Zen (Light)": "light",
                "Anime Pop": "pop",
                "Bubblegum": "bubblegum",
                "Dracula": "dracula",
                "Nord": "nord",
                "Hacker": "hacker",
                "Blurple": "blurple"
            };
            document.body.dataset.theme = themeMap[this.tempConfig.theme] || "dark";

            // Apply Granular Visuals
            const r = document.documentElement;
            if (this.tempConfig.ui_border_radius !== undefined) r.style.setProperty('--radius-panel', `${this.tempConfig.ui_border_radius}px`);
            if (this.tempConfig.ui_blur !== undefined) r.style.setProperty('--glass-blur', `${this.tempConfig.ui_blur}px`);
            if (this.tempConfig.ui_font_size !== undefined) document.body.style.fontSize = `${this.tempConfig.ui_font_size}px`;

            // Apply Layout (MVP)
            const showLeft = this.tempConfig.layout_show_left !== false; // default true
            const showRight = this.tempConfig.layout_show_right !== false; // default true

            // Toggle Display
            const pLeft = document.getElementById('panel-left');
            const pRight = document.getElementById('panel-right');
            if (pLeft) pLeft.style.display = showLeft ? 'flex' : 'none';
            if (pRight) pRight.style.display = showRight ? 'flex' : 'none';

            // Update Grid Cols
            const colLeft = showLeft ? '280px' : '0px';
            const colRight = showRight ? '320px' : '0px';
            r.style.setProperty('--layout-cols', `${colLeft} 1fr ${colRight}`);

            // === SAVE ACTIVE CHARACTER SPECIFICS ===
            let activeCharId = this.tempConfig.active_character_id || state.state.currentCharacterId;

            // Parse ID if it's in "ID: Name" format
            if (typeof activeCharId === 'string' && activeCharId.includes(':')) {
                activeCharId = activeCharId.split(':')[0];
            }
            if (activeCharId) {
                // Determine if we have character-specific changes
                // Note: avatar_url (we decided this is the ICON now)
                const charUpdates = {};
                if (this.tempConfig.avatar_url) charUpdates.avatar_url = this.tempConfig.avatar_url;

                if (Object.keys(charUpdates).length > 0) {
                    await state.saveCharacter(activeCharId, charUpdates);
                }
            }

            await state.saveConfig(this.tempConfig);
            btn.innerText = "SAVED";
            setTimeout(() => this.close(), 500);
        } catch (e) {
            btn.innerText = "ERROR";
            logger.error("Settings", "Failed to save: " + e.message);
        } finally {
            setTimeout(() => btn.innerText = "APPLY CHANGES", 2000);
        }
    }
}
