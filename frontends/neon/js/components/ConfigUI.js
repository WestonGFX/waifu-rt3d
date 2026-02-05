import { state } from '../core/StateManager.js';

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
                { id: "model", name: "Model", type: "select", options: ["gpt-3.5-turbo", "gpt-4", "gpt-4o"], default: "gpt-3.5-turbo" },
                { id: "max_tokens", name: "Max Tokens", type: "slider", min: 100, max: 4096, default: 1000 },
                { id: "temperature", name: "Temperature", type: "slider", min: 0, max: 2.0, step: 0.1, default: 0.7 }
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
            fields: [
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
        this.isOpen = false;
        this.modal = null;
        this.injectModal();
        this.bindGlobalTrigger();
    }

    injectModal() {
        if (document.getElementById('settings-modal')) return;

        const html = `
        <div id="settings-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; backdrop-filter:blur(5px); justify-content:center; align-items:center;">
            <div style="width:800px; height:600px; background:var(--bg-deep); border:1px solid var(--glass-border); border-radius:var(--radius-lg); display:flex; overflow:hidden; box-shadow:var(--shadow-glow);">
                <!-- LEFT SIDEBAR -->
                <div style="width:200px; background:rgba(255,255,255,0.03); padding:20px; border-right:1px solid var(--glass-border);">
                    <div style="font-family:var(--font-heading); color:var(--text-main); margin-bottom:20px;">CONFIG</div>
                    <div class="tab-nav active" data-tab="llm" style="padding:10px; cursor:pointer;">BRAIN (LLM)</div>
                    <div class="tab-nav" data-tab="tts" style="padding:10px; cursor:pointer;">VOICE (TTS)</div>
                    <div class="tab-nav" data-tab="asr" style="padding:10px; cursor:pointer;">EARS (ASR)</div>
                </div>
                
                <!-- CONTENT -->
                <div style="flex:1; padding:20px; display:flex; flex-direction:column;">
                    <div style="flex:1; overflow-y:auto;" id="cfg-content"></div>
                    <div style="padding-top:20px; border-top:1px solid var(--glass-border); display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn" id="cfg-cancel">CANCEL</button>
                        <button class="btn btn-primary" id="cfg-save">SAVE CHANGES</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        this.modal = document.getElementById('settings-modal');
        this.bindEvents();
    }

    bindGlobalTrigger() {
        // Find any button with text "SETTINGS"
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('SETTINGS'));
        btns.forEach(b => b.onclick = () => this.open());
    }

    bindEvents() {
        document.getElementById('cfg-cancel').onclick = () => this.close();
        document.getElementById('cfg-save').onclick = () => this.save();

        this.modal.querySelectorAll('.tab-nav').forEach(el => {
            el.onclick = () => {
                this.modal.querySelectorAll('.tab-nav').forEach(t => t.style.background = 'transparent');
                el.style.background = 'rgba(255,255,255,0.1)';
                this.renderTab(el.dataset.tab);
            };
        });
    }

    open() {
        this.modal.style.display = 'flex';
        // Clone config to avoid mutating global state directly until save
        this.localConfig = JSON.parse(JSON.stringify(state.state.config));
        this.renderTab('llm');
    }

    close() {
        this.modal.style.display = 'none';
        this.localConfig = null;
    }

    renderTab(type) {
        const container = document.getElementById('cfg-content');
        container.innerHTML = `<h3>${type.toUpperCase()} SETTINGS</h3>`;

        if (!this.localConfig || !this.localConfig.services) {
            container.innerHTML += '<p>Loading config...</p>';
            return;
        }

        const serviceCfg = this.localConfig.services[type];
        if (!serviceCfg) return;

        // 1. Provider Select
        const schemas = PROVIDER_SCHEMAS[type];
        const selector = document.createElement('select');
        selector.className = 'input-field';
        selector.style.marginBottom = '20px';
        
        for (const [key, details] of Object.entries(schemas)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = details.name;
            if (key === serviceCfg.active_provider) opt.selected = true;
            selector.appendChild(opt);
        }

        selector.onchange = (e) => {
            serviceCfg.active_provider = e.target.value;
            // Init provider obj if missing
            if (!serviceCfg.providers[e.target.value]) serviceCfg.providers[e.target.value] = {};
            this.renderTab(type); // Re-render
        };

        container.appendChild(selector);

        // 2. Fields
        const active = serviceCfg.active_provider;
        const schema = schemas[active];
        const providerData = serviceCfg.providers[active];

        schema.fields.forEach(f => {
            const row = document.createElement('div');
            row.style.marginBottom = '15px';
            
            const label = document.createElement('label');
            label.innerText = f.name;
            label.style.display = 'block';
            label.style.marginBottom = '5px';
            label.style.color = 'var(--text-muted)';
            label.style.fontSize = '0.9rem';

            let input;
            if (f.type === 'slider') {
                input = document.createElement('input');
                input.type = 'range';
                input.min = f.min;
                input.max = f.max;
                input.step = f.step || 1;
                input.value = providerData[f.id] ?? f.default;
            } else if (f.type === 'select') {
                input = document.createElement('select');
                input.className = 'input-field';
                f.options.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o;
                    opt.textContent = o;
                    if (o == (providerData[f.id] ?? f.default)) opt.selected = true;
                    input.appendChild(opt);
                });
            } else {
                input = document.createElement('input');
                input.className = 'input-field';
                input.type = f.type || 'text';
                input.value = providerData[f.id] ?? f.default ?? '';
            }

            input.onchange = (e) => {
                let v = e.target.value;
                if (f.type === 'slider' || f.type === 'number') v = Number(v);
                providerData[f.id] = v;
            };

            row.appendChild(label);
            row.appendChild(input);
            container.appendChild(row);
        });
    }

    async save() {
        const btn = document.getElementById('cfg-save');
        const origText = btn.innerText;
        btn.innerText = "SAVING...";
        
        try {
            await state.saveConfig(this.localConfig);
            btn.innerText = "SAVED!";
            setTimeout(() => this.close(), 500);
        } catch (e) {
            btn.innerText = "ERROR";
            console.error(e);
        } finally {
            setTimeout(() => btn.innerText = origText, 2000);
        }
    }
}
