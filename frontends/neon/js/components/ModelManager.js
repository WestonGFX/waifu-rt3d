/**
 * ModelManager.js
 * LM Studio-native model management wizard.
 *
 * Features:
 * - Browse recommended models by category (LLM, Coding, Vision, Speech)
 * - View installed models from LM Studio with state badges (LOADED / DOWNLOADED)
 * - Load/Unload models into LM Studio memory
 * - One-click install via LM Studio download API with real progress polling
 * - Hardware compatibility indicators with live HW banner
 * - Client-side sorting/filtering (size, architecture, format)
 * - Quantization picker with VRAM estimates
 *
 * Uses backend endpoints:
 * - GET  /api/models/recommend?type=llm
 * - GET  /api/models/installed          (queries LM Studio /api/v0/models)
 * - GET  /api/models/details?id=...     (HuggingFace GGUF file list)
 * - GET  /api/models/download-status    (LM Studio download progress)
 * - GET  /api/hardware
 * - POST /api/models/install            (LM Studio /api/v0/download)
 * - POST /api/models/load               (LM Studio /api/v0/load)
 * - POST /api/models/unload             (LM Studio /api/v0/unload)
 * - DELETE /api/models/{type}/{id}      (lms rm CLI)
 *
 * @example
 * const mm = new ModelManager();
 * mm.open(); // Opens the model manager modal
 */
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';

/** Model categories for the tab switcher */
const MODEL_CATEGORIES = [
    { id: 'llm', label: 'Chat / RP', icon: '🧠' },
    { id: 'coding', label: 'Coding', icon: '💻' },
    { id: 'vlm', label: 'Vision', icon: '👁️' },
    { id: 'asr', label: 'Speech', icon: '🎙️' }
];

/** Sort options for the recommended models list */
const SORT_OPTIONS = [
    { id: 'recommended', label: 'Recommended' },
    { id: 'size-asc', label: 'Size: Small → Large' },
    { id: 'size-desc', label: 'Size: Large → Small' }
];

/**
 * Extract architecture family from a model ID string.
 * @param {string} modelId - HuggingFace model ID
 * @returns {string|null} Architecture family name or null
 */
function detectArchitecture(modelId) {
    const id = modelId.toLowerCase();
    if (id.includes('llama-3') || id.includes('llama3')) return 'Llama 3';
    if (id.includes('llama-2') || id.includes('llama2')) return 'Llama 2';
    if (id.includes('llama')) return 'Llama';
    if (id.includes('mistral')) return 'Mistral';
    if (id.includes('mixtral')) return 'Mixtral';
    if (id.includes('gemma')) return 'Gemma';
    if (id.includes('qwen')) return 'Qwen';
    if (id.includes('deepseek')) return 'DeepSeek';
    if (id.includes('phi')) return 'Phi';
    if (id.includes('whisper')) return 'Whisper';
    if (id.includes('llava')) return 'LLaVA';
    if (id.includes('hermes')) return 'Hermes';
    return null;
}

/**
 * Detect model format from ID and tags.
 * @param {Object} model - Model object with id and tags
 * @returns {string} 'mlx' | 'gguf' | 'other'
 */
function detectFormat(model) {
    const id = model.id.toLowerCase();
    const tags = (model.tags || []).map(t => t.toLowerCase());
    if (id.includes('mlx') || tags.includes('mlx') || tags.includes('apple-silicon')) return 'mlx';
    if (id.includes('gguf') || tags.includes('gguf')) return 'gguf';
    return 'gguf';
}

/**
 * Map LM Studio model state to a display badge.
 * @param {string} modelState - "loaded", "not-loaded", etc.
 * @returns {{label: string, color: string, bg: string}}
 */
function stateBadge(modelState) {
    if (modelState === 'loaded') {
        return { label: 'LOADED', color: 'var(--neon-green)', bg: 'rgba(57,255,20,0.08)' };
    }
    return { label: 'DOWNLOADED', color: 'var(--neon-cyan)', bg: 'rgba(0,240,255,0.05)' };
}

export class ModelManager {
    constructor() {
        this.currentCategory = 'llm';
        this.installedModels = {};
        this.recommendedModels = [];
        this.installing = new Map();
        this.hardwareInfo = null;
        this.quantPickerTarget = null;
        this.quantOptions = [];

        // Sorting & filtering state
        this.sortBy = 'recommended';
        this.formatFilter = 'all';
        this.archFilter = null;

        // Download progress polling
        this._downloadPollInterval = null;

        this.injectHTML();
        this.modal = document.getElementById('model-manager-modal');

        // Global access
        window.openModelManager = () => this.open();
    }

    /**
     * Open the model manager wizard.
     * Loads hardware info, installed models, and recommendations in parallel.
     */
    async open() {
        this.modal.style.display = 'flex';
        this.quantPickerTarget = null;
        this.sortBy = 'recommended';
        this.formatFilter = 'all';
        this.archFilter = null;
        this._renderLoading();
        await Promise.all([
            this._loadHardware(),
            this._loadData()
        ]);
        this._render();
    }

    /**
     * Close the model manager modal and clean up.
     */
    close() {
        this.modal.style.display = 'none';
        this.quantPickerTarget = null;
        this._stopDownloadPolling();
    }

    /**
     * Inject the modal HTML skeleton into the document body.
     */
    injectHTML() {
        if (document.getElementById('model-manager-modal')) return;
        const html = `
            <div id="model-manager-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel" style="position:relative; max-width:850px; width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 0 50px rgba(0,240,255,0.1); overflow:hidden;">
                    <button id="btn-close-models" class="settings-close-x">&times;</button>
                    <div style="padding:20px 24px; padding-right:48px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <h2 style="margin:0 0 12px 0; color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:2px; font-size:1.1rem;">MODEL HUB</h2>
                        <div id="model-hw-banner"></div>
                        <div id="model-manager-content" style="overflow-y:auto; flex:1; min-height:0;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('btn-close-models').onclick = () => this.close();
        document.getElementById('model-manager-modal').addEventListener('click', (e) => {
            if (e.target.id === 'model-manager-modal') this.close();
        });
    }

    /** @private */
    async _loadHardware() {
        try {
            this.hardwareInfo = await API.get('hardware');
        } catch (err) {
            console.warn('[ModelManager] Hardware info unavailable:', err);
            this.hardwareInfo = null;
        }
    }

    /** @private */
    async _loadData() {
        try {
            const [recommended, installed] = await Promise.all([
                API.get(`models/recommend?type=${this.currentCategory}`),
                API.get('models/installed')
            ]);
            this.recommendedModels = recommended.models || [];
            this.installedModels = installed.installed || {};
        } catch (err) {
            console.error('[ModelManager] Failed to load data:', err);
            this.recommendedModels = [];
            this.installedModels = {};
        }
    }

    /** @private */
    _renderLoading() {
        const container = document.getElementById('model-manager-content');
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
                <div style="font-size:2rem; margin-bottom:10px; animation: spin 1s linear infinite;">⚙️</div>
                <div>Scanning hardware & models...</div>
            </div>
        `;
    }

    /** @private */
    _renderHWBanner() {
        const banner = document.getElementById('model-hw-banner');
        if (!banner) return;
        if (!this.hardwareInfo) { banner.innerHTML = ''; return; }

        const hw = this.hardwareInfo;
        const items = [
            { label: 'CPU', value: hw.cpu || 'Unknown', color: 'var(--neon-cyan)' },
            { label: 'RAM', value: hw.ram_gb ? `${hw.ram_gb} GB` : '--', color: 'var(--neon-cyan)' },
            { label: 'GPU', value: hw.gpu || 'None', color: 'var(--neon-green)' },
            { label: 'VRAM', value: hw.vram_gb ? `${hw.vram_gb} GB` : 'N/A', color: 'var(--neon-green)' }
        ];

        banner.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:12px; padding:8px 12px; margin-bottom:12px; border-radius:8px; background:rgba(0,240,255,0.03); border:1px solid rgba(0,240,255,0.1);">
                ${items.map(i => `
                    <div style="display:flex; align-items:center; gap:5px; font-size:0.7rem;">
                        <span style="color:${i.color}; font-weight:600;">${i.label}</span>
                        <span style="color:var(--text-main); font-family:var(--font-mono);">${i.value}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /** @private */
    _getInstalledIds() {
        const installed = this.installedModels[this.currentCategory] || [];
        return new Set(installed.map(m => m.id));
    }

    /** @private */
    _getArchitectures() {
        const archs = new Set();
        this.recommendedModels.forEach(m => {
            const arch = detectArchitecture(m.id);
            if (arch) archs.add(arch);
        });
        return [...archs].sort();
    }

    /** @private */
    _getFilteredModels() {
        let models = [...this.recommendedModels];
        if (this.archFilter) {
            models = models.filter(m => detectArchitecture(m.id) === this.archFilter);
        }
        if (this.formatFilter !== 'all') {
            models = models.filter(m => detectFormat(m) === this.formatFilter);
        }
        if (this.sortBy === 'size-asc') {
            models.sort((a, b) => (a.min_ram || 0) - (b.min_ram || 0));
        } else if (this.sortBy === 'size-desc') {
            models.sort((a, b) => (b.min_ram || 0) - (a.min_ram || 0));
        }
        return models;
    }

    /** @private */
    _render() {
        this._renderHWBanner();
        const container = document.getElementById('model-manager-content');
        const installedIds = this._getInstalledIds();
        const architectures = this._getArchitectures();
        const hasMLX = this.recommendedModels.some(m => detectFormat(m) === 'mlx');

        // Category Tabs
        const tabsHtml = MODEL_CATEGORIES.map(cat => {
            const isActive = cat.id === this.currentCategory;
            const activeStyle = isActive
                ? 'background:rgba(0,240,255,0.12); color:var(--neon-cyan); border-color:var(--neon-cyan);'
                : 'background:transparent; color:var(--text-main); border-color:rgba(255,255,255,0.15);';
            return `<button class="mm-tab" data-cat="${cat.id}"
                    style="padding:7px 14px; border:1px solid; border-radius:6px; cursor:pointer; font-family:var(--font-display); font-size:0.8rem; letter-spacing:0.5px; transition:all 0.2s; ${activeStyle}">
                ${cat.icon} ${cat.label}
            </button>`;
        }).join('');

        // Sort & Filter
        const sortHtml = SORT_OPTIONS.map(s => {
            const sel = s.id === this.sortBy;
            return `<button data-sort="${s.id}" style="padding:4px 10px; font-size:0.68rem; font-family:var(--font-mono); border-radius:4px; cursor:pointer; transition:all 0.15s; border:1px solid ${sel ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.1)'}; background:${sel ? 'rgba(0,240,255,0.1)' : 'transparent'}; color:${sel ? 'var(--neon-cyan)' : 'var(--text-muted)'};">${s.label}</button>`;
        }).join('');

        const formatChips = [
            { id: 'all', label: 'All' },
            { id: 'gguf', label: 'GGUF' },
            ...(hasMLX ? [{ id: 'mlx', label: 'MLX' }] : [])
        ].map(f => {
            const sel = f.id === this.formatFilter;
            return `<button data-format="${f.id}" style="padding:4px 10px; font-size:0.68rem; font-family:var(--font-mono); border-radius:4px; cursor:pointer; transition:all 0.15s; border:1px solid ${sel ? 'var(--neon-green)' : 'rgba(255,255,255,0.1)'}; background:${sel ? 'rgba(57,255,20,0.08)' : 'transparent'}; color:${sel ? 'var(--neon-green)' : 'var(--text-muted)'};">${f.label}</button>`;
        }).join('');

        const archChips = architectures.map(a => {
            const sel = this.archFilter === a;
            return `<button data-arch="${a}" style="padding:3px 8px; font-size:0.65rem; font-family:var(--font-mono); border-radius:4px; cursor:pointer; transition:all 0.15s; border:1px solid ${sel ? 'var(--neon-yellow)' : 'rgba(255,255,255,0.08)'}; background:${sel ? 'rgba(252,238,10,0.08)' : 'transparent'}; color:${sel ? 'var(--neon-yellow)' : 'var(--text-muted)'};">${a}</button>`;
        }).join('');
        const archClearBtn = this.archFilter
            ? `<button data-arch-clear style="padding:3px 8px; font-size:0.65rem; font-family:var(--font-mono); border-radius:4px; cursor:pointer; border:1px solid rgba(255,0,60,0.3); background:rgba(255,0,60,0.06); color:var(--neon-magenta);">Clear</button>`
            : '';

        // Installed Section (with state badges + load/unload)
        const installedForType = this.installedModels[this.currentCategory] || [];
        const installedHtml = installedForType.length > 0
            ? installedForType.map(m => this._renderInstalledCard(m)).join('')
            : '<div style="padding:10px; color:var(--text-muted); font-size:0.75rem;">No models found in LM Studio for this category.</div>';

        // Recommended Section
        const filteredModels = this._getFilteredModels();
        const recommendedHtml = filteredModels.length > 0
            ? filteredModels.map(m => this._renderRecommendedCard(m, installedIds)).join('')
            : '<div style="padding:12px; color:var(--text-muted); font-size:0.8rem;">No models match current filters.</div>';

        container.innerHTML = `
            <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">${tabsHtml}</div>

            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.65rem; color:var(--text-muted); margin-right:4px;">SORT</span>
                ${sortHtml}
                <span style="width:1px; height:16px; background:rgba(255,255,255,0.08); margin:0 4px;"></span>
                <span style="font-size:0.65rem; color:var(--text-muted); margin-right:4px;">FORMAT</span>
                ${formatChips}
            </div>

            ${architectures.length > 0 ? `
            <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-bottom:14px;">
                <span style="font-size:0.65rem; color:var(--text-muted); margin-right:4px;">ARCH</span>
                ${archChips}
                ${archClearBtn}
            </div>` : ''}

            <div style="margin-bottom:16px;">
                <h3 style="color:var(--neon-green); font-family:var(--font-display); font-size:0.85rem; letter-spacing:1px; margin-bottom:8px;">
                    INSTALLED (${installedForType.length})
                </h3>
                <div style="display:flex; flex-direction:column; gap:6px;">${installedHtml}</div>
            </div>

            <div>
                <h3 style="color:var(--neon-cyan); font-family:var(--font-display); font-size:0.85rem; letter-spacing:1px; margin-bottom:8px;">
                    RECOMMENDED (${filteredModels.length})
                </h3>
                <div style="display:flex; flex-direction:column; gap:6px;">${recommendedHtml}</div>
            </div>
        `;

        this._bindEvents(container);
    }

    /** @private */
    _bindEvents(container) {
        // Tab clicks
        container.querySelectorAll('[data-cat]').forEach(btn => {
            btn.onclick = async () => {
                this.currentCategory = btn.dataset.cat;
                this.quantPickerTarget = null;
                this.archFilter = null;
                this._renderLoading();
                await this._loadData();
                this._render();
            };
        });

        // Sort
        container.querySelectorAll('[data-sort]').forEach(btn => {
            btn.onclick = () => { this.sortBy = btn.dataset.sort; this._render(); };
        });

        // Format filter
        container.querySelectorAll('[data-format]').forEach(btn => {
            btn.onclick = () => { this.formatFilter = btn.dataset.format; this._render(); };
        });

        // Architecture filter
        container.querySelectorAll('[data-arch]').forEach(btn => {
            btn.onclick = () => {
                this.archFilter = this.archFilter === btn.dataset.arch ? null : btn.dataset.arch;
                this._render();
            };
        });
        const archClear = container.querySelector('[data-arch-clear]');
        if (archClear) archClear.onclick = () => { this.archFilter = null; this._render(); };

        // Install buttons → quantization picker
        container.querySelectorAll('[data-install]').forEach(btn => {
            btn.onclick = () => this._showQuantPicker(btn.dataset.install, btn.dataset.type);
        });

        // Delete buttons
        container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.onclick = () => this._deleteModel(btn.dataset.delete, btn.dataset.type);
        });

        // Load buttons
        container.querySelectorAll('[data-load]').forEach(btn => {
            btn.onclick = () => this._loadModel(btn.dataset.load);
        });

        // Unload buttons
        container.querySelectorAll('[data-unload]').forEach(btn => {
            btn.onclick = () => this._unloadModel(btn.dataset.unload);
        });

        // Quantization selection
        container.querySelectorAll('[data-quant-select]').forEach(btn => {
            btn.onclick = () => this._installModel(
                btn.dataset.quantSelect,
                btn.dataset.quantType,
                btn.dataset.quantValue
            );
        });

        // Cancel quant picker
        container.querySelectorAll('[data-quant-cancel]').forEach(btn => {
            btn.onclick = () => { this.quantPickerTarget = null; this._render(); };
        });
    }

    /**
     * Render an installed model card with state badge and load/unload action.
     * @private
     * @param {Object} model - Installed model data from LM Studio
     * @returns {string} HTML string
     */
    _renderInstalledCard(model) {
        const badge = stateBadge(model.state);
        const isLoaded = model.state === 'loaded';
        const sizeDisplay = model.size_mb > 0 ? `${Math.round(model.size_mb)} MB` : '';
        const ctxDisplay = model.max_context_length ? `ctx: ${model.max_context_length.toLocaleString()}` : '';
        const meta = [sizeDisplay, ctxDisplay].filter(Boolean).join(' · ');

        const actionBtn = isLoaded
            ? `<button data-unload="${model.id}" style="padding:4px 12px; font-size:0.68rem; color:var(--neon-yellow); border:1px solid rgba(252,238,10,0.3); background:rgba(252,238,10,0.04); cursor:pointer; border-radius:6px; transition:all 0.15s;" onmouseenter="this.style.background='rgba(252,238,10,0.1)'" onmouseleave="this.style.background='rgba(252,238,10,0.04)'">UNLOAD</button>`
            : `<button data-load="${model.id}" style="padding:4px 12px; font-size:0.68rem; color:var(--neon-green); border:1px solid rgba(57,255,20,0.3); background:rgba(57,255,20,0.04); cursor:pointer; border-radius:6px; transition:all 0.15s;" onmouseenter="this.style.background='rgba(57,255,20,0.1)'" onmouseleave="this.style.background='rgba(57,255,20,0.04)'">LOAD</button>`;

        return `
            <div style="padding:10px 12px; display:flex; justify-content:space-between; align-items:center; border-radius:8px; background:${badge.bg}; border:1px solid ${badge.color}20;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${model.id}</span>
                        <span style="padding:2px 8px; border-radius:4px; font-size:0.6rem; font-family:var(--font-display); letter-spacing:0.5px; color:${badge.color}; border:1px solid ${badge.color}40; background:${badge.bg};">${badge.label}</span>
                    </div>
                    ${meta ? `<div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${meta}</div>` : ''}
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    ${actionBtn}
                    <button data-delete="${model.id}" data-type="${model.type}"
                            style="padding:4px 12px; font-size:0.68rem; color:var(--neon-magenta); border:1px solid rgba(255,0,60,0.3); background:transparent; cursor:pointer; border-radius:6px; transition:all 0.15s;"
                            onmouseenter="this.style.background='rgba(255,0,60,0.1)'" onmouseleave="this.style.background='transparent'">
                        DELETE
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render a recommended model card with install/state indicators.
     * @private
     * @param {Object} model - Recommended model data
     * @param {Set<string>} installedIds - Already-installed model IDs
     * @returns {string} HTML string
     */
    _renderRecommendedCard(model, installedIds) {
        const isInstalling = this.installing.has(model.id);
        const isInstalled = installedIds.has(model.id);
        const isCompatible = model.compatible !== false;
        const showQuant = this.quantPickerTarget === model.id;
        const arch = detectArchitecture(model.id);
        const format = detectFormat(model);

        const tags = (model.tags || []).map(t =>
            `<span style="padding:1px 6px; border-radius:3px; font-size:0.62rem; background:rgba(0,240,255,0.06); color:rgba(0,240,255,0.7); border:1px solid rgba(0,240,255,0.1);">${t}</span>`
        ).join(' ');

        const metaInfo = [
            arch ? `<span style="color:var(--neon-yellow); font-size:0.65rem;">${arch}</span>` : '',
            format === 'mlx' ? `<span style="color:var(--neon-green); font-size:0.65rem; border:1px solid rgba(57,255,20,0.3); padding:0 4px; border-radius:3px;">MLX</span>` : '',
            model.min_ram ? `<span style="color:var(--text-muted); font-size:0.65rem;">${model.min_ram}GB+ RAM</span>` : ''
        ].filter(Boolean).join(' ');

        // Installing state — pulsing card with progress
        if (isInstalling) {
            const info = this.installing.get(model.id);
            const elapsed = Math.round((Date.now() - info.startTime) / 1000);
            const timerKey = model.id.replace(/[^a-zA-Z0-9]/g, '_');
            const progressPct = info.progress != null ? Math.round(info.progress * 100) : null;
            const progressBar = progressPct != null
                ? `<div style="height:100%; background:var(--neon-yellow); width:${progressPct}%; transition:width 0.3s;"></div>`
                : `<div style="height:100%; background:var(--neon-yellow); width:100%; animation:progress-indeterminate 1.5s ease-in-out infinite;"></div>`;

            return `
                <div style="padding:12px; border-radius:8px; border:1px solid var(--neon-yellow); animation:pulse-border 2s ease-in-out infinite; background:rgba(252,238,10,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-main);">${model.id}</div>
                            <div style="font-size:0.68rem; color:var(--neon-yellow); margin-top:3px;">
                                Installing ${info.quantization || 'model'}...${progressPct != null ? ` ${progressPct}%` : ''}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div id="install-timer-${timerKey}" style="font-family:var(--font-mono); font-size:1rem; color:var(--neon-yellow);">${elapsed}s</div>
                            <div style="font-size:0.6rem; color:var(--text-muted);">elapsed</div>
                        </div>
                    </div>
                    <div style="margin-top:8px; height:3px; background:rgba(255,255,255,0.04); border-radius:2px; overflow:hidden;">
                        ${progressBar}
                    </div>
                </div>
            `;
        }

        // Quantization picker
        if (showQuant) {
            const quantChoices = this.quantOptions.length > 0
                ? this.quantOptions.map(q => {
                    const name = q.filename || q.quantization || 'Unknown';
                    const shortName = q.quantization || name.split('.').find(p => p.startsWith('Q') || p.startsWith('q') || p === 'FP16') || name;
                    const vram = q.estimated_vram_gb ? `~${q.estimated_vram_gb} GB VRAM` : '';
                    return `
                        <button data-quant-select="${model.id}" data-quant-type="${model.type || this.currentCategory}" data-quant-value="${shortName}"
                                style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:8px 12px; background:rgba(0,240,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main); cursor:pointer; transition:all 0.15s; font-size:0.72rem; font-family:var(--font-mono);"
                                onmouseenter="this.style.borderColor='var(--neon-cyan)';this.style.background='rgba(0,240,255,0.06)'" onmouseleave="this.style.borderColor='rgba(255,255,255,0.08)';this.style.background='rgba(0,240,255,0.03)'">
                            <span style="font-weight:600;">${shortName}</span>
                            <span style="color:var(--neon-cyan); font-size:0.68rem;">${vram}</span>
                        </button>
                    `;
                }).join('')
                : ['Q2_K', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'].map(q => {
                    const fallbackVram = this._estimateFallbackVram(model, q);
                    return `
                        <button data-quant-select="${model.id}" data-quant-type="${model.type || this.currentCategory}" data-quant-value="${q}"
                                style="display:flex; justify-content:space-between; align-items:center; padding:7px 12px; background:rgba(0,240,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:var(--text-main); cursor:pointer; transition:all 0.15s; font-size:0.72rem; font-family:var(--font-mono);"
                                onmouseenter="this.style.borderColor='var(--neon-cyan)';this.style.background='rgba(0,240,255,0.06)'" onmouseleave="this.style.borderColor='rgba(255,255,255,0.08)';this.style.background='rgba(0,240,255,0.03)'">
                            <span style="font-weight:600;">${q}</span>
                            <span style="color:var(--neon-cyan); font-size:0.68rem;">${fallbackVram}</span>
                        </button>
                    `;
                }).join('');

            return `
                <div style="padding:12px; border-radius:8px; border:1px solid var(--neon-cyan); background:rgba(0,240,255,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div>
                            <div style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-main);">${model.id}</div>
                            <div style="font-size:0.68rem; color:var(--neon-cyan); margin-top:2px;">Select quantization:</div>
                        </div>
                        <button data-quant-cancel="${model.id}" style="padding:4px 10px; font-size:0.68rem; color:var(--text-muted); border:1px solid rgba(255,255,255,0.1); background:transparent; cursor:pointer; border-radius:6px;">
                            CANCEL
                        </button>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">${quantChoices}</div>
                </div>
            `;
        }

        // Action button
        let actionHtml;
        if (isInstalled) {
            actionHtml = `<span style="padding:4px 12px; font-size:0.68rem; color:var(--neon-green); border:1px solid rgba(57,255,20,0.3); background:rgba(57,255,20,0.06); border-radius:6px; font-family:var(--font-display); letter-spacing:0.5px;">&#x2713; IN LM STUDIO</span>`;
        } else if (isCompatible) {
            actionHtml = `<button data-install="${model.id}" data-type="${model.type || this.currentCategory}"
                    style="padding:5px 16px; font-size:0.7rem; color:var(--neon-cyan); border:1px solid var(--neon-cyan); background:rgba(0,240,255,0.08); cursor:pointer; border-radius:6px; font-family:var(--font-display); letter-spacing:0.5px; transition:all 0.15s;"
                    onmouseenter="this.style.background='rgba(0,240,255,0.18)'" onmouseleave="this.style.background='rgba(0,240,255,0.08)'">
                INSTALL
            </button>`;
        } else {
            actionHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                    <span style="font-size:0.6rem; color:var(--neon-yellow);">Needs ${model.min_ram}GB+ RAM</span>
                    <button data-install="${model.id}" data-type="${model.type || this.currentCategory}"
                            style="padding:4px 12px; font-size:0.68rem; color:var(--neon-yellow); border:1px solid rgba(252,238,10,0.3); background:rgba(252,238,10,0.04); cursor:pointer; border-radius:6px; font-family:var(--font-display); letter-spacing:0.5px; transition:all 0.15s;"
                            onmouseenter="this.style.background='rgba(252,238,10,0.1)'" onmouseleave="this.style.background='rgba(252,238,10,0.04)'">
                        INSTALL ANYWAY
                    </button>
                </div>
            `;
        }

        return `
            <div style="padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.01); transition:border-color 0.15s;"
                 onmouseenter="this.style.borderColor='rgba(255,255,255,0.12)'" onmouseleave="this.style.borderColor='rgba(255,255,255,0.06)'">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:5px;">
                    <div style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-main); word-break:break-all; flex:1;">${model.id}</div>
                    ${actionHtml}
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                    ${tags}
                    ${metaInfo ? `<span style="margin-left:auto;">${metaInfo}</span>` : ''}
                </div>
            </div>
        `;
    }

    /** @private */
    _estimateFallbackVram(model, quant) {
        const baseRam = model.min_ram || 8;
        const paramsB = baseRam / 0.75;
        const factors = {
            'Q2_K': 0.4, 'Q3_K_M': 0.55, 'Q4_K_M': 0.75, 'Q4_K_S': 0.7,
            'Q5_K_M': 0.9, 'Q5_K_S': 0.85, 'Q6_K': 1.0, 'Q8_0': 1.2
        };
        const factor = factors[quant] || 0.75;
        const est = Math.round(paramsB * factor + 0.5);
        return `~${est} GB VRAM`;
    }

    /** @private */
    async _showQuantPicker(modelId, type) {
        this.quantPickerTarget = modelId;
        this.quantOptions = [];
        this._render();

        try {
            const details = await API.get(`models/details?id=${encodeURIComponent(modelId)}`);
            if (details.files && details.files.length > 0) {
                this.quantOptions = details.files;
                this._render();
            }
        } catch (err) {
            console.warn('[ModelManager] Could not fetch model details:', err);
        }
    }

    /**
     * Install a model via the LM Studio download API.
     * Starts download progress polling for real-time updates.
     * @private
     */
    async _installModel(modelId, type, quantization) {
        if (this.installing.has(modelId)) return;

        const startTime = Date.now();
        const timerKey = modelId.replace(/[^a-zA-Z0-9]/g, '_');

        const timerInterval = setInterval(() => {
            const el = document.getElementById(`install-timer-${timerKey}`);
            if (el) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                el.textContent = `${elapsed}s`;
            }
        }, 1000);

        this.installing.set(modelId, { startTime, quantization, interval: timerInterval, progress: null });
        this.quantPickerTarget = null;
        this._render();
        toast.info(`Installing ${modelId} (${quantization}) via LM Studio...`, 5000);

        // Start polling download status
        this._startDownloadPolling(modelId);

        try {
            const result = await API.post('models/install', { id: modelId, type, quantization });
            if (result.ok) {
                toast.success(`${modelId} downloaded to LM Studio!`, 3000);
                await this._loadData();
            } else {
                toast.error(`Install failed: ${result.error}`, 5000);
            }
        } catch (err) {
            toast.error(`Install failed: ${err.message}`, 5000);
        } finally {
            const info = this.installing.get(modelId);
            if (info) clearInterval(info.interval);
            this.installing.delete(modelId);
            this._stopDownloadPolling();
            this._render();
        }
    }

    /**
     * Start polling LM Studio download progress.
     * Updates the installing model's progress field for display.
     * @private
     * @param {string} modelId - Model being downloaded
     */
    _startDownloadPolling(modelId) {
        this._stopDownloadPolling();
        this._downloadPollInterval = setInterval(async () => {
            try {
                const status = await API.get('models/download-status');
                const info = this.installing.get(modelId);
                if (info && status.progress != null) {
                    info.progress = status.progress;
                    this._render();
                }
            } catch {
                // Silently ignore poll failures
            }
        }, 2000);
    }

    /** @private */
    _stopDownloadPolling() {
        if (this._downloadPollInterval) {
            clearInterval(this._downloadPollInterval);
            this._downloadPollInterval = null;
        }
    }

    /**
     * Load a model into LM Studio memory.
     * @private
     * @param {string} modelId - Model ID to load
     */
    async _loadModel(modelId) {
        toast.info(`Loading ${modelId} into LM Studio...`, 3000);
        try {
            const result = await API.post('models/load', { model: modelId });
            if (result.ok) {
                toast.success(`${modelId} loaded!`, 3000);
                // Update config to use this model
                try {
                    await API.put('config', { llm: { model: modelId } });
                } catch {
                    // Non-critical — model is loaded even if config update fails
                }
                await this._loadData();
                this._render();
            } else {
                toast.error(`Load failed: ${result.error}`, 5000);
            }
        } catch (err) {
            toast.error(`Load failed: ${err.message}`, 5000);
        }
    }

    /**
     * Unload a model from LM Studio memory.
     * @private
     * @param {string} modelId - Model ID to unload
     */
    async _unloadModel(modelId) {
        if (!confirm(`Unload "${modelId}" from memory?`)) return;
        try {
            const result = await API.post('models/unload', { model: modelId });
            if (result.ok) {
                toast.success(`${modelId} unloaded`, 2000);
                await this._loadData();
                this._render();
            } else {
                toast.error(`Unload failed: ${result.error}`, 5000);
            }
        } catch (err) {
            toast.error(`Unload failed: ${err.message}`, 5000);
        }
    }

    /**
     * Delete a model via lms CLI after confirmation.
     * @private
     */
    async _deleteModel(modelId, type) {
        if (!confirm(`Delete model "${modelId}" from LM Studio? This cannot be undone.`)) return;
        try {
            await API.delete(`models/${type}/${encodeURIComponent(modelId)}`);
            toast.success(`${modelId} deleted`, 2000);
            await this._loadData();
            this._render();
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`, 5000);
        }
    }
}
