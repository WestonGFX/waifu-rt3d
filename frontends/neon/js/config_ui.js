/**
 * config_ui.js
 * Handles rendering and updating the Unified Provider Configuration in the Setup tab.
 * Now supports Typed Inputs (Sliders, Toggles, Selects).
 */

const PROVIDER_SCHEMAS = {
    llm: {
        local_jan: {
            name: "Jan (Local)",
            fields: [
                { id: "endpoint", name: "API Endpoint", type: "text", default: "http://localhost:1337/v1" },
                { id: "model", name: "Model Name", type: "text", default: "mistral-ins-7b-q4" },
                { id: "context_window", name: "Context Window", type: "number", min: 2048, max: 32768, default: 4096 },
                { id: "gpu_layers", name: "GPU Layers", type: "slider", min: 0, max: 100, default: -1 }
            ]
        },
        local_lmstudio: {
            name: "LM Studio (Local)",
            fields: [
                { id: "endpoint", name: "API Endpoint", type: "text", default: "http://localhost:1234/v1" },
                { id: "model", name: "Model Name", type: "text", default: "local-model" }
            ]
        },
        cloud_openai: {
            name: "OpenAI",
            fields: [
                { id: "api_key", name: "API Key", type: "password" },
                { id: "model", name: "Model", type: "select", options: ["gpt-3.5-turbo", "gpt-4", "gpt-4o", "gpt-4-turbo"], default: "gpt-3.5-turbo" },
                { id: "max_tokens", name: "Max Tokens", type: "slider", min: 100, max: 4096, default: 1000 },
                { id: "temperature", name: "Temperature", type: "slider", min: 0, max: 2.0, step: 0.1, default: 0.7 }
            ]
        },
        cloud_deepseek: {
            name: "DeepSeek",
            fields: [
                { id: "api_key", name: "API Key", type: "password" },
                { id: "model", name: "Model", type: "select", options: ["deepseek-chat", "deepseek-coder"], default: "deepseek-chat" }
            ]
        }
    },
    tts: {
        local_fish: {
            name: "Fish Audio (Local)",
            fields: [
                { id: "endpoint", name: "API Endpoint", type: "text", default: "http://localhost:8080/v1/invoke" },
                { id: "voice_id", name: "Reference Audio ID", type: "text" }
            ]
        },
        cloud_elevenlabs: {
            name: "ElevenLabs",
            fields: [w
                { id: "api_key", name: "API Key", type: "password" },
                { id: "voice_id", name: "Voice ID", type: "text" },
                { id: "stability", name: "Stability", type: "slider", min: 0, max: 1.0, step: 0.1, default: 0.5 }
            ]
        }
    },
    asr: {
        browser: { name: "Browser Native", fields: [] },
        local_whisper: {
            name: "Whisper (Local)",
            fields: [
                { id: "endpoint", name: "Endpoint", type: "text", default: "http://localhost:9000" },
                { id: "language", name: "Language (Auto)", type: "text", default: "en" }
            ]
        }
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
        if (!serviceCfg) return;

        container.innerHTML = '';
        const active = serviceCfg.active_provider;

        // 1. Provider Selector
        const header = document.createElement('div');
        header.style.marginBottom = "15px";
        header.innerHTML = `<label style="display:block;color:var(--s);margin-bottom:5px;font-family:var(--font-pixel);font-size:0.8rem;">ACTIVE PROVIDER</label>`;
        
        const select = document.createElement('select');
        select.className = "form-select";
        select.style.marginBottom = "15px";

        const schemas = PROVIDER_SCHEMAS[type] || {};
        for (const [key, details] of Object.entries(schemas)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = details.name;
            if (key === active) opt.selected = true;
            select.appendChild(opt);
        }

        select.onchange = (e) => {
            serviceCfg.active_provider = e.target.value;
            if (!serviceCfg.providers[e.target.value]) {
                serviceCfg.providers[e.target.value] = {}; 
            }
            this.render(); 
        };

        header.appendChild(select);
        container.appendChild(header);

        // 2. Settings Fields
        const providerData = serviceCfg.providers[active] || {};
        const schema = schemas[active] || { fields: [] };

        schema.fields.forEach(fieldDef => {
            const id = fieldDef.id;
            // Support simple string definition (backwards compat) or object
            const name = fieldDef.name || id;
            const fType = fieldDef.type || 'text';
            let val = providerData[id];
            if (val === undefined && fieldDef.default !== undefined) providerData[id] = fieldDef.default;
            val = providerData[id] || "";

            const fieldGroup = document.createElement('div');
            fieldGroup.className = "form-group";
            
            const label = document.createElement('label');
            label.className = "form-label";
            label.textContent = name;
            fieldGroup.appendChild(label);

            let input;

            if (fType === 'select') {
                input = document.createElement('select');
                input.className = "form-select";
                fieldDef.options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.textContent = opt;
                    if (opt == val) o.selected = true;
                    input.appendChild(o);
                });
            }
            else if (fType === 'slider' || fType === 'range') {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '10px';

                input = document.createElement('input');
                input.type = "range";
                input.min = fieldDef.min || 0;
                input.max = fieldDef.max || 100;
                input.step = fieldDef.step || 1;
                input.value = val !== "" ? val : (fieldDef.default || 0);
                input.style.flex = "1";

                const valDisplay = document.createElement('span');
                valDisplay.style.fontFamily = "var(--font-mono)";
                valDisplay.style.width = "40px";
                valDisplay.textContent = input.value;

                input.oninput = (e) => {
                    valDisplay.textContent = e.target.value;
                    providerData[id] = Number(e.target.value);
                };

                wrapper.appendChild(input);
                wrapper.appendChild(valDisplay);
                fieldGroup.appendChild(wrapper);
                container.appendChild(fieldGroup);
                return; // Special case return
            }
            else {
                input = document.createElement('input');
                input.type = fType === 'password' ? 'password' : 'text';
                input.className = "form-input";
                input.value = val;

                if (fType === 'number') {
                    input.type = "number";
                    if (fieldDef.min) input.min = fieldDef.min;
                    if (fieldDef.max) input.max = fieldDef.max;
                }
            }

            // Bind change
            input.onchange = (e) => {
                let v = e.target.value;
                if (fType === 'number') v = Number(v);
                providerData[id] = v;
            };

            if (input) fieldGroup.appendChild(input);
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
