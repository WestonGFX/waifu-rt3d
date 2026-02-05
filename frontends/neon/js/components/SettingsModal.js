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

    open() {
        this.modal.style.display = 'flex';
        // Safeguard against undefined state or config
        const currentState = state.state || {};
        this.tempConfig = JSON.parse(JSON.stringify(currentState.config || {}));
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

            // If we hide panels, we want the grid to collapse effectively. 
            // 0px cols works, but gaps remain?
            // "280px 1fr 320px" -> "0px 1fr 0px"
            // If we set the col to 0px, gap might still be there. 
            // Better: update gap? Or just trust the 0px?
            // Actually, if we set display:none on children, we can use `auto 1fr auto`?
            // But we want fixed width when visible.
            // Let's rely on the variable update.
            r.style.setProperty('--layout-cols', `${colLeft} 1fr ${colRight}`);


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
