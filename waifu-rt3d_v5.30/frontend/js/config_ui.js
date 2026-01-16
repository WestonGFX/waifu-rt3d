/**
 * config_ui.js
 * Handles rendering and updating the Unified Provider Configuration in the Setup tab.
 */

const PROVIDER_SCHEMAS = {
    llm: {
        local_jan: { name: "Jan (Local)", fields: ["endpoint", "model"] },
        local_lmstudio: { name: "LM Studio (Local)", fields: ["endpoint", "model"] },
        local_ollama: { name: "Ollama (Local)", fields: ["endpoint", "model"] },
        cloud_openai: { name: "OpenAI", fields: ["api_key", "model"] },
        cloud_liquid: { name: "Liquid AI", fields: ["api_key", "model"] },
        cloud_anthropic: { name: "Anthropic", fields: ["api_key", "model"] }
    },
    tts: {
        local_fish: { name: "Fish Audio (Local)", fields: ["endpoint", "voice_id"] },
        local_pinokio: { name: "Pinokio / Generic", fields: ["endpoint", "voice_id"] },
        cloud_elevenlabs: { name: "ElevenLabs", fields: ["api_key", "voice_id"] }
    },
    asr: {
        browser: { name: "Browser Native", fields: [] },
        local_whisper: { name: "Whisper (Local)", fields: ["endpoint"] }
    }
};

export class ConfigUI {
    constructor() {
        this.config = null;
        this.containers = {
            llm: document.getElementById('cfg_llm_container'),
            tts: document.getElementById('cfg_tts_container'),
            asr: document.getElementById('cfg_asr_container')
        };
    }

    async load() {
        try {
            const r = await fetch('/api/config');
            this.config = await r.json();
            this.render();
        } catch (e) {
            console.error("Config load failed", e);
        }
    }

    render() {
        if (!this.config || !this.config.services) return;
        this.renderService('llm', this.config.services.llm);
        this.renderService('tts', this.config.services.tts);
        this.renderService('asr', this.config.services.asr);
    }

    renderService(type, serviceCfg) {
        const container = this.containers[type];
        if (!container) return;

        container.innerHTML = '';
        const active = serviceCfg.active_provider;

        // 1. Provider Selector
        const header = document.createElement('div');
        header.style.marginBottom = "10px";
        header.innerHTML = `<label style="display:block;color:var(--neon-blue);margin-bottom:5px;">ACTIVE PROVIDER</label>`;
        
        const select = document.createElement('select');
        select.style.width = "100%";
        select.style.padding = "8px";
        select.style.background = "rgba(0,0,0,0.5)";
        select.style.border = "1px solid var(--neon-purple)";
        select.style.color = "var(--neon-green)";
        select.style.fontFamily = "var(--font-mono)";

        // Populate Options
        const schemas = PROVIDER_SCHEMAS[type] || {};
        for (const [key, details] of Object.entries(schemas)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = details.name;
            if (key === active) opt.selected = true;
            select.appendChild(opt);
        }

        // Add handler for provider switch
        select.onchange = (e) => {
            serviceCfg.active_provider = e.target.value;
            // Ensure provider entry exists
            if (!serviceCfg.providers[e.target.value]) {
                serviceCfg.providers[e.target.value] = {}; 
            }
            this.render(); // Re-render to show new fields
        };

        header.appendChild(select);
        container.appendChild(header);

        // 2. Settings Fields for Active Provider
        const providerData = serviceCfg.providers[active] || {};
        const schema = schemas[active] || { fields: [] };

        schema.fields.forEach(field => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = "form-group";
            
            const label = document.createElement('label');
            label.textContent = field.toUpperCase().replace("_", " ");
            
            const input = document.createElement('input');
            input.value = providerData[field] || "";
            
            // Mask API keys if they are env vars, or allow editing
            if (field === 'api_key' && (input.value.startsWith("env:") || input.value === "")) {
                input.placeholder = "env:VAR_NAME or raw key";
            }

            input.onchange = (e) => {
                providerData[field] = e.target.value;
            };

            fieldGroup.appendChild(label);
            fieldGroup.appendChild(input);
            container.appendChild(fieldGroup);
        });
    }

    async save() {
        try {
            const r = await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.config)
            });
            return await r.json();
        } catch (e) {
            console.error("Save failed", e);
            throw e;
        }
    }
}
