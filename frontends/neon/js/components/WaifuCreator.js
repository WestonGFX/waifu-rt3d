/**
 * WaifuCreator.js
 * Full-page character creation/editing wizard with live VRM preview.
 *
 * Features:
 * - 6-tab wizard: Identity → Appearance → Voice → Brain → Scene → Review
 * - Live VRM preview in right panel (iframe postMessage)
 * - Background preview in real-time
 * - Works for both create and edit flows
 * - Persists form data across tab switches
 *
 * @example
 * const creator = new WaifuCreator();
 * creator.open();        // New character
 * creator.open(3);       // Edit character ID 3
 */
import { state } from '../core/StateManager.js';
import { API } from '../core/API.js';
import { bus } from '../core/EventBus.js';
import { toast } from '../utils/Toast.js';
import { buildVoicePicker } from '../utils/VoicePicker.js';

/** Persona templates — reused from PersonaCreator.js */
const TEMPLATES = [
    { name: "Tsundere", icon: "🔥", desc: "Hot-tempered but secretly caring", prompt: "You are a sharp-tongued tsundere. You deny your feelings but secretly care deeply. You get flustered when complimented and use phrases like 'b-baka!' when embarrassed. You're competitive, proud, but ultimately loyal.", traits: ["hot-tempered", "secretly-caring", "proud", "competitive"] },
    { name: "Kuudere", icon: "❄️", desc: "Cool, calm, barely shows emotion", prompt: "You are a kuudere — cool, logical, and rarely express emotion. You speak concisely and analytically. When you do show warmth, it's subtle and meaningful. You prefer efficiency over small talk.", traits: ["calm", "logical", "stoic", "analytical"] },
    { name: "Genki", icon: "⚡", desc: "Hyper-energetic and optimistic", prompt: "You are a genki girl — always bursting with energy and enthusiasm! You love fun, games, and making people smile. You end sentences with exclamation marks and use lots of onomatopoeia. Nothing gets you down!", traits: ["energetic", "optimistic", "loud", "playful"] },
    { name: "Onee-san", icon: "🌸", desc: "Mature, caring older sister type", prompt: "You are an onee-san type — a mature, caring older sister figure. You say 'Ara ara~' and offer comfort and wisdom. You're nurturing but can be teasing. You make others feel safe and supported.", traits: ["mature", "caring", "teasing", "nurturing"] },
    { name: "Goth", icon: "🦇", desc: "Mysterious, dark aesthetic, chunibyou", prompt: "You are a gothic character who loves the occult, darkness, and speaks in dramatic, chunibyou metaphors. You reference ancient powers and mysterious forces. Despite the dark exterior, you have a surprisingly kind heart.", traits: ["mysterious", "dramatic", "dark", "secretly-kind"] },
    { name: "Custom", icon: "✨", desc: "Build from scratch", prompt: "", traits: [] }
];

/** Available TTS providers (must match backend adapter registry) */
const TTS_PROVIDERS = [
    { value: '', label: 'Use Global Default' },
    { value: 'edge_tts', label: 'Edge TTS (Free)' },
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'piper_local', label: 'Piper (Local)' },
    { value: 'xtts_server', label: 'XTTS Server' },
    { value: 'gptsovits', label: 'GPT-SoVITS' },
    { value: 'kokoro', label: 'Kokoro' },
    { value: 'chatterbox', label: 'Chatterbox' },
    { value: 'fish_audio', label: 'Fish Audio' },
];

/** Greeting animation options */
const GREETING_ANIMATIONS = [
    '', 'Wave', 'Nod', 'Bow', 'Shrug', 'Clap', 'Think', 'Point', 'Celebrate', 'Shy', 'Dance'
];

/** Tab definitions */
const TABS = [
    { key: 'identity',   label: 'IDENTITY' },
    { key: 'appearance', label: 'APPEARANCE' },
    { key: 'voice',      label: 'VOICE' },
    { key: 'brain',      label: 'BRAIN' },
    { key: 'scene',      label: 'SCENE' },
    { key: 'review',     label: 'REVIEW' },
];

export class WaifuCreator {
    constructor() {
        /** @type {number|null} Character ID when editing, null when creating */
        this.editingCharId = null;
        /** @type {number} Currently active tab index */
        this.currentTab = 0;
        /** @type {Set<number>} Tabs the user has visited (for completed checkmark) */
        this.visitedTabs = new Set();
        /** @type {Object} Accumulated form data across all tabs */
        this.formData = this._defaultFormData();
        /** @type {Array} Cached VRM model list from /api/scan/vrm */
        this._vrmModels = [];
        /** @type {Array} Cached image list from /api/scan/images */
        this._images = [];
        /** @type {HTMLAudioElement|null} Active voice preview audio */
        this._previewAudio = null;

        // Cache DOM refs
        this.container = document.getElementById('waifu-creator');
        this.tabBar = document.getElementById('wc-tab-bar');
        this.content = document.getElementById('wc-content');
        this.previewInfo = document.getElementById('wc-preview-info');
        this.previewIframe = document.getElementById('wc-vrm-iframe');
        this.titleEl = document.getElementById('wc-title');
        this.prevBtn = document.getElementById('wc-prev');
        this.nextBtn = document.getElementById('wc-next');
        this.saveBtn = document.getElementById('wc-save');
        this.backBtn = document.getElementById('wc-back');

        this._bindEvents();
    }

    // ─── Public API ──────────────────────────────────────────

    /**
     * Open the creator in create or edit mode.
     *
     * @param {number|null} [charId=null] - Character ID to edit, or null for new creation.
     */
    async open(charId = null) {
        this.editingCharId = charId;
        this.currentTab = 0;
        this.visitedTabs = new Set([0]);
        this.formData = this._defaultFormData();

        if (charId) {
            // Edit mode — fetch fresh character data from API
            this.titleEl.textContent = 'EDIT WAIFU';
            this.saveBtn.textContent = 'SAVE CHANGES';
            try {
                await state.loadCharacters();
            } catch { /* use cache if refresh fails */ }
            const char = state.state.characters?.find(c => c.id == charId);
            if (char) {
                this._populateFromCharacter(char);
            }
        } else {
            this.titleEl.textContent = 'CREATE A WAIFU';
            this.saveBtn.textContent = 'CREATE ENTITY';
        }

        this.container.style.display = 'flex';

        // Fetch assets in parallel
        await Promise.all([
            this._fetchVrmModels(),
            this._fetchImages(),
        ]);

        this._renderTabs();
        this._switchTab(0);

        // Load VRM preview if editing a character with a model
        if (this.formData.vrm_model_url) {
            this._loadVrmPreview(this.formData.vrm_model_url);
        }
    }

    /**
     * Close the creator and return to the dashboard.
     */
    close() {
        this.container.style.display = 'none';
        this.editingCharId = null;
        this._stopPreviewAudio();
    }

    // ─── Event Binding ───────────────────────────────────────

    /**
     * Bind click handlers for back, prev, next, and save buttons.
     * @private
     */
    _bindEvents() {
        if (this.backBtn) {
            this.backBtn.onclick = () => {
                window.location.hash = '';
            };
        }

        if (this.prevBtn) {
            this.prevBtn.onclick = () => {
                if (this.currentTab > 0) {
                    this._collectFormData();
                    this._switchTab(this.currentTab - 1);
                }
            };
        }

        if (this.nextBtn) {
            this.nextBtn.onclick = () => {
                if (this.currentTab < TABS.length - 1) {
                    this._collectFormData();
                    this._switchTab(this.currentTab + 1);
                }
            };
        }

        if (this.saveBtn) {
            this.saveBtn.onclick = () => this._save();
        }
    }

    // ─── Tab Management ──────────────────────────────────────

    /**
     * Render the tab bar buttons with active/completed states.
     * @private
     */
    _renderTabs() {
        if (!this.tabBar) return;
        this.tabBar.innerHTML = TABS.map((tab, i) => {
            const cls = [
                'wc-tab',
                i === this.currentTab ? 'active' : '',
                this.visitedTabs.has(i) && i !== this.currentTab ? 'completed' : '',
            ].filter(Boolean).join(' ');
            return `<button class="${cls}" data-tab="${i}">${tab.label}</button>`;
        }).join('');

        // Bind tab click handlers
        this.tabBar.querySelectorAll('.wc-tab').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.tab);
                this._collectFormData();
                this._switchTab(idx);
            };
        });
    }

    /**
     * Switch to a specific tab index. Collects current data, renders new tab, updates nav buttons.
     *
     * @param {number} index - Tab index (0-5)
     * @private
     */
    _switchTab(index) {
        this.currentTab = index;
        this.visitedTabs.add(index);
        this._renderTabs();

        // Render tab content
        const renderers = [
            () => this._renderIdentityTab(),
            () => this._renderAppearanceTab(),
            () => this._renderVoiceTab(),
            () => this._renderBrainTab(),
            () => this._renderSceneTab(),
            () => this._renderReviewTab(),
        ];
        if (this.content) {
            this.content.innerHTML = renderers[index]();
            this._bindTabEvents(index);
            this.content.scrollTop = 0;
        }

        // Update footer buttons
        const isFirst = index === 0;
        const isLast = index === TABS.length - 1;
        if (this.prevBtn) this.prevBtn.style.display = isFirst ? 'none' : '';
        if (this.nextBtn) this.nextBtn.style.display = isLast ? 'none' : '';
        if (this.saveBtn) this.saveBtn.style.display = isLast ? '' : 'none';
    }

    /**
     * Bind interactive events specific to the current tab's DOM (post-render).
     *
     * @param {number} tabIndex - Which tab was just rendered
     * @private
     */
    _bindTabEvents(tabIndex) {
        switch (tabIndex) {
            case 0: this._bindIdentityEvents(); break;
            case 1: this._bindAppearanceEvents(); break;
            case 2: this._bindVoiceEvents(); break;
            case 3: this._bindBrainEvents(); break;
            case 4: this._bindSceneEvents(); break;
        }
    }

    // ─── Data Collection ─────────────────────────────────────

    /**
     * Return a fresh default formData object.
     * @returns {Object} Default character creation fields
     * @private
     */
    _defaultFormData() {
        return {
            name: '',
            system_prompt: '',
            personality_traits: [],
            vrm_model_url: '',
            avatar_2d_url: '',
            avatar_url: '',
            tts_provider: '',
            voice_id: '',
            voice_config: {},
            greeting_text: '',
            greeting_animation: '',
            background_url: '',
            background_mode: 'transparent',
            llm_endpoint: '',
            llm_model: '',
            llm_temperature: 0,
            vocab_categories: [],
            capability_profile: {},
            animation_profile: null,
        };
    }

    /**
     * Populate formData from an existing character record (edit mode).
     *
     * @param {Object} char - Character object from the backend
     * @private
     */
    _populateFromCharacter(char) {
        this.formData.name = char.name || '';
        this.formData.system_prompt = char.system_prompt || '';
        this.formData.vrm_model_url = char.vrm_model_url || '';
        this.formData.avatar_2d_url = char.avatar_2d_url || '';
        this.formData.avatar_url = char.avatar_url || '';
        this.formData.tts_provider = char.tts_provider || '';
        this.formData.voice_id = char.voice_id || '';
        this.formData.greeting_text = char.greeting_text || '';
        this.formData.greeting_animation = char.greeting_animation || '';
        this.formData.background_url = char.background_url || '';
        this.formData.background_mode = char.background_mode || 'transparent';
        this.formData.llm_endpoint = char.llm_endpoint || '';
        this.formData.llm_model = char.llm_model || '';
        this.formData.llm_temperature = char.llm_temperature || 0;

        // Parse JSON fields
        try {
            this.formData.personality_traits = typeof char.personality_traits === 'string'
                ? JSON.parse(char.personality_traits) : (char.personality_traits || []);
        } catch { this.formData.personality_traits = []; }

        try {
            this.formData.voice_config = typeof char.voice_config === 'string'
                ? JSON.parse(char.voice_config) : (char.voice_config || {});
        } catch { this.formData.voice_config = {}; }

        try {
            this.formData.vocab_categories = typeof char.vocab_categories === 'string'
                ? JSON.parse(char.vocab_categories) : (char.vocab_categories || []);
        } catch { this.formData.vocab_categories = []; }

        // Phase 9: Capability profile
        try {
            this.formData.capability_profile = typeof char.capability_profile === 'string'
                ? JSON.parse(char.capability_profile) : (char.capability_profile || {});
        } catch { this.formData.capability_profile = {}; }

        // Phase 6F: Animation personality profile
        try {
            this.formData.animation_profile = typeof char.animation_profile === 'string'
                ? JSON.parse(char.animation_profile) : (char.animation_profile || null);
        } catch { this.formData.animation_profile = null; }
    }

    /**
     * Snapshot the current tab's DOM input values into this.formData.
     * Called before every tab switch to preserve user input.
     * @private
     */
    _collectFormData() {
        const c = this.content;
        if (!c) return;

        // Helper to get value by ID
        const val = (id) => c.querySelector(`#${id}`)?.value ?? undefined;

        switch (this.currentTab) {
            case 0: // Identity
                if (val('wc-name') !== undefined) this.formData.name = val('wc-name');
                // Traits are managed via pill add/remove, already in formData
                break;

            case 1: // Appearance
                // VRM and avatar are set via card click handlers, already in formData
                break;

            case 2: // Voice
                if (val('wc-tts-provider') !== undefined) this.formData.tts_provider = val('wc-tts-provider');
                // voice_id is set by VoicePicker onChange callback
                break;

            case 3: // Brain
                if (val('wc-system-prompt') !== undefined) this.formData.system_prompt = val('wc-system-prompt');
                if (val('wc-llm-endpoint') !== undefined) this.formData.llm_endpoint = val('wc-llm-endpoint');
                if (val('wc-llm-model') !== undefined) this.formData.llm_model = val('wc-llm-model');
                if (val('wc-llm-temp') !== undefined) this.formData.llm_temperature = parseFloat(val('wc-llm-temp')) || 0;
                // Phase 9: Collect capability profile fields
                this.formData.capability_profile = this._collectCapabilityFields();
                break;

            case 4: // Scene
                if (val('wc-greeting-text') !== undefined) this.formData.greeting_text = val('wc-greeting-text');
                if (val('wc-greeting-anim') !== undefined) this.formData.greeting_animation = val('wc-greeting-anim');
                if (val('wc-bg-mode') !== undefined) this.formData.background_mode = val('wc-bg-mode');
                if (val('wc-bg-color') !== undefined && this.formData.background_mode === 'color') {
                    this.formData.background_url = val('wc-bg-color');
                }
                break;
        }
    }

    // ─── Tab Renderers ───────────────────────────────────────

    /**
     * Render the Identity tab: name, template picker, personality traits.
     * @returns {string} HTML string
     * @private
     */
    _renderIdentityTab() {
        const traitsHtml = this.formData.personality_traits.map(t =>
            `<span class="wc-trait-pill">${this._esc(t)}<span class="wc-trait-remove" data-trait="${this._esc(t)}">&times;</span></span>`
        ).join('');

        return `
            <div class="wc-field">
                <label class="wc-label" for="wc-name">Character Name *</label>
                <input id="wc-name" class="wc-input" type="text" placeholder="e.g. Raine Nox" value="${this._esc(this.formData.name)}" maxlength="100">
                <div class="wc-hint">The display name for your character</div>
            </div>

            <div class="wc-field">
                <label class="wc-label">Archetype Template</label>
                <div class="wc-hint">Pick a starting template or choose Custom to build from scratch</div>
                <div class="wc-template-grid">
                    ${TEMPLATES.map((t, i) => `
                        <div class="wc-template-card" data-tpl="${i}">
                            <div class="wc-tpl-icon">${t.icon}</div>
                            <div class="wc-tpl-name">${t.name}</div>
                            <div class="wc-tpl-desc">${t.desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <hr class="wc-divider">

            <div class="wc-field">
                <label class="wc-label">Personality Traits</label>
                <div style="display:flex; gap:6px;">
                    <input id="wc-trait-input" class="wc-input" type="text" placeholder="Type a trait and press Enter" style="flex:1;">
                    <button id="wc-trait-add" class="btn-config" style="white-space:nowrap;">ADD</button>
                </div>
                <div class="wc-traits-list" id="wc-traits-list">${traitsHtml}</div>
            </div>

            <hr class="wc-divider">

            <div class="wc-field">
                <label class="wc-label">ANIMATION PERSONALITY</label>
                <div class="wc-hint">Controls how the character moves and fidgets in 3D</div>
                ${['energy', 'confidence', 'nervousness', 'expressiveness', 'playfulness'].map(param => {
                    const val = this.formData.animation_profile?.[param] ?? (param === 'nervousness' ? 0.3 : 0.5);
                    return `
                    <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                        <span style="width:130px;font-size:12px;text-transform:uppercase;opacity:0.7;">${param}</span>
                        <input type="range" min="0" max="100" value="${Math.round(val * 100)}"
                               data-personality="${param}" class="wc-personality-slider"
                               style="flex:1;accent-color:var(--neon-cyan);" />
                        <span class="wc-personality-value" style="width:35px;text-align:right;font-size:12px;font-family:var(--font-mono);">
                            ${Math.round(val * 100)}%
                        </span>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    /**
     * Bind events for the Identity tab.
     * @private
     */
    _bindIdentityEvents() {
        const c = this.content;

        // Template card click → apply template
        c.querySelectorAll('.wc-template-card').forEach(card => {
            card.onclick = () => {
                const tpl = TEMPLATES[parseInt(card.dataset.tpl)];
                c.querySelectorAll('.wc-template-card').forEach(tc => tc.classList.remove('selected'));
                card.classList.add('selected');

                if (tpl.prompt) {
                    this.formData.system_prompt = tpl.prompt;
                }
                if (tpl.traits.length > 0) {
                    this.formData.personality_traits = [...tpl.traits];
                    this._refreshTraitPills();
                }
                // If name is still empty, suggest template name
                const nameInput = c.querySelector('#wc-name');
                if (nameInput && !nameInput.value.trim()) {
                    nameInput.value = tpl.name !== 'Custom' ? `My ${tpl.name}` : '';
                }
            };
        });

        // Trait add
        const traitInput = c.querySelector('#wc-trait-input');
        const addTrait = () => {
            const val = traitInput?.value.trim().toLowerCase();
            if (val && !this.formData.personality_traits.includes(val)) {
                this.formData.personality_traits.push(val);
                this._refreshTraitPills();
            }
            if (traitInput) traitInput.value = '';
        };

        c.querySelector('#wc-trait-add')?.addEventListener('click', addTrait);
        traitInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTrait(); }
        });

        // Trait remove (delegated)
        c.querySelector('#wc-traits-list')?.addEventListener('click', (e) => {
            const rm = e.target.closest('.wc-trait-remove');
            if (rm) {
                const trait = rm.dataset.trait;
                this.formData.personality_traits = this.formData.personality_traits.filter(t => t !== trait);
                this._refreshTraitPills();
            }
        });

        // Phase 6F: Animation personality sliders
        c.querySelectorAll('.wc-personality-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const param = e.target.dataset.personality;
                const value = parseInt(e.target.value) / 100;
                if (!this.formData.animation_profile) {
                    this.formData.animation_profile = {
                        energy: 0.5, confidence: 0.5, nervousness: 0.3,
                        expressiveness: 0.5, playfulness: 0.5,
                    };
                }
                this.formData.animation_profile[param] = value;
                e.target.nextElementSibling.textContent = `${Math.round(value * 100)}%`;
                // Live preview in VRM iframe
                this._updatePersonalityPreview();
            });
        });
    }


    /**
     * Send current personality profile to the VRM preview iframe for live feedback.
     * @private
     */
    _updatePersonalityPreview() {
        const iframe = document.getElementById('wc-vrm-iframe');
        if (iframe?.contentWindow && this.formData.animation_profile) {
            iframe.contentWindow.postMessage({
                type: 'setPersonality',
                payload: this.formData.animation_profile,
            }, '*');
        }
    }

    /**
     * Re-render the traits pill list from this.formData.
     * @private
     */
    _refreshTraitPills() {
        const list = this.content?.querySelector('#wc-traits-list');
        if (!list) return;
        list.innerHTML = this.formData.personality_traits.map(t =>
            `<span class="wc-trait-pill">${this._esc(t)}<span class="wc-trait-remove" data-trait="${this._esc(t)}">&times;</span></span>`
        ).join('');
    }

    /**
     * Render the Appearance tab: VRM model grid, 2D avatar grid, upload buttons.
     * @returns {string} HTML string
     * @private
     */
    _renderAppearanceTab() {
        const vrmCards = this._vrmModels.map(m => {
            const selected = this.formData.vrm_model_url === m.url ? 'selected' : '';
            const sizeMB = (m.size / (1024 * 1024)).toFixed(1);
            return `
                <div class="wc-vrm-card ${selected}" data-vrm-url="${this._esc(m.url)}">
                    <div class="wc-card-icon">🧍</div>
                    <div class="wc-card-name">${this._esc(m.name)}</div>
                    <div class="wc-card-size">${sizeMB} MB</div>
                </div>`;
        }).join('');

        const avatarImages = this._images.filter(img => img.type === 'avatar');
        const avatarCards = avatarImages.map(img => {
            const selected = this.formData.avatar_2d_url === img.url ? 'selected' : '';
            return `
                <div class="wc-avatar-card ${selected}" data-avatar-url="${this._esc(img.url)}">
                    <img src="${this._esc(img.url)}" alt="${this._esc(img.name)}" loading="lazy">
                    <div class="wc-card-name">${this._esc(img.name)}</div>
                </div>`;
        }).join('');

        return `
            <div class="wc-field">
                <label class="wc-label">3D Model (VRM)</label>
                <div class="wc-hint">Select a VRM file for the live 3D avatar</div>
                <div class="wc-vrm-grid">
                    ${vrmCards}
                    <div class="wc-vrm-card wc-upload-card" id="wc-upload-vrm">
                        <div class="wc-upload-icon">+</div>
                        <div class="wc-card-name">UPLOAD VRM</div>
                    </div>
                </div>
            </div>

            <hr class="wc-divider">

            <div class="wc-field">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label class="wc-label">2D Avatar (Portrait)</label>
                    <button id="wc-generate-icon" class="btn-config" style="padding:4px 12px; font-size:0.72rem;
                            border-color:rgba(157,80,255,0.5); background:rgba(157,80,255,0.1);
                            color:rgba(157,80,255,0.9);"
                            title="AI-generate a character portrait">
                        ✨ Generate Icon
                    </button>
                </div>
                <div class="wc-hint">Used in chat bubbles and the character roster</div>
                <div class="wc-avatar-grid">
                    ${avatarCards}
                    <div class="wc-avatar-card wc-upload-card" id="wc-upload-avatar">
                        <div class="wc-upload-icon">+</div>
                        <div class="wc-card-name">UPLOAD</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Bind events for the Appearance tab.
     * @private
     */
    _bindAppearanceEvents() {
        const c = this.content;

        // VRM card selection
        c.querySelectorAll('.wc-vrm-card:not(.wc-upload-card)').forEach(card => {
            card.onclick = () => {
                c.querySelectorAll('.wc-vrm-card').forEach(vc => vc.classList.remove('selected'));
                card.classList.add('selected');
                const url = card.dataset.vrmUrl;
                this.formData.vrm_model_url = url;
                // Also set avatar_url to the VRM URL (used by backend to find model)
                this.formData.avatar_url = url;
                this._loadVrmPreview(url);
                this._updatePreviewInfo(url);
            };
        });

        // Avatar card selection
        c.querySelectorAll('.wc-avatar-card:not(.wc-upload-card)').forEach(card => {
            card.onclick = () => {
                c.querySelectorAll('.wc-avatar-card').forEach(ac => ac.classList.remove('selected'));
                card.classList.add('selected');
                this.formData.avatar_2d_url = card.dataset.avatarUrl;
            };
        });

        // VRM upload
        c.querySelector('#wc-upload-vrm')?.addEventListener('click', () => this._uploadFile('vrm'));

        // Avatar upload
        c.querySelector('#wc-upload-avatar')?.addEventListener('click', () => this._uploadFile('image'));

        // Generate Icon (AI portrait)
        c.querySelector('#wc-generate-icon')?.addEventListener('click', () => this._generateIcon());
    }

    /**
     * Render the Voice tab: TTS provider, voice ID, preview button.
     * @returns {string} HTML string
     * @private
     */
    _renderVoiceTab() {
        const providerOptions = TTS_PROVIDERS.map(p =>
            `<option value="${p.value}" ${this.formData.tts_provider === p.value ? 'selected' : ''}>${p.label}</option>`
        ).join('');

        return `
            <div class="wc-field">
                <label class="wc-label" for="wc-tts-provider">TTS Provider</label>
                <select id="wc-tts-provider" class="wc-select">${providerOptions}</select>
                <div class="wc-hint">Override the global TTS provider for this character</div>
            </div>

            <div class="wc-field">
                <label class="wc-label">Voice</label>
                <div id="wc-voice-picker-container"></div>
                <div class="wc-hint">Select a voice or click "Manage Voices..." to install more</div>
            </div>

            <div class="wc-field">
                <label class="wc-label">Voice Preview</label>
                <button class="wc-voice-preview-btn" id="wc-voice-preview">
                    <span>&#9654;</span> TEST VOICE
                </button>
                <div class="wc-hint">Plays a short test phrase with the selected provider and voice</div>
            </div>

            ${this.editingCharId ? '' : `
                <div class="wc-field" style="margin-top:16px;">
                    <div class="wc-hint" style="opacity:0.5;">
                        Voice sample upload for cloning (XTTS/GPT-SoVITS) is available after saving the character.
                    </div>
                </div>
            `}
        `;
    }

    /**
     * Bind events for the Voice tab.
     * @private
     */
    _bindVoiceEvents() {
        this.content?.querySelector('#wc-voice-preview')?.addEventListener('click', () => this._previewVoice());

        // Initialize voice picker dropdown
        const provider = this.formData.tts_provider || '';
        buildVoicePicker({
            containerId: 'wc-voice-picker-container',
            currentProvider: provider,
            currentVoiceId: this.formData.voice_id || '',
            onChange: ({ provider: prov, voiceId }) => {
                this.formData.tts_provider = prov;
                this.formData.voice_id = voiceId;
            },
        });

        // When TTS provider dropdown changes, refresh picker filtered to that provider
        const provSelect = this.content?.querySelector('#wc-tts-provider');
        if (provSelect) {
            provSelect.addEventListener('change', () => {
                const newProv = provSelect.value;
                buildVoicePicker({
                    containerId: 'wc-voice-picker-container',
                    currentProvider: newProv,
                    currentVoiceId: this.formData.voice_id || '',
                    onChange: ({ provider: prov, voiceId }) => {
                        this.formData.tts_provider = prov;
                        this.formData.voice_id = voiceId;
                    },
                });
            });
        }
    }

    /**
     * Render the Brain tab: system prompt, token counter, LLM overrides.
     * @returns {string} HTML string
     * @private
     */
    _renderBrainTab() {
        const promptLen = this.formData.system_prompt.length;
        const estTokens = Math.ceil(promptLen / 4);
        const counterClass = estTokens >= 3000 ? 'danger' : estTokens >= 2000 ? 'warn' : '';

        return `
            <div class="wc-field">
                <label class="wc-label" for="wc-system-prompt">System Prompt *</label>
                <textarea id="wc-system-prompt" class="wc-textarea" rows="10" maxlength="5000"
                    placeholder="Define your character's personality, behavior, and speaking style..."
                >${this._esc(this.formData.system_prompt)}</textarea>
                <div class="wc-token-counter ${counterClass}" id="wc-token-counter">
                    ~${estTokens} tokens (${promptLen}/5000 chars)
                </div>
                <div class="wc-hint">This is the core instruction that shapes your character's behavior</div>
            </div>

            <hr class="wc-divider">

            <div class="wc-collapsible-header" id="wc-llm-toggle">
                <span class="wc-caret">&#9654;</span> ADVANCED LLM OVERRIDES
            </div>
            <div class="wc-collapsible-body" id="wc-llm-section">
                <div class="wc-field">
                    <label class="wc-label" for="wc-llm-endpoint">Custom LLM Endpoint</label>
                    <input id="wc-llm-endpoint" class="wc-input" type="text" placeholder="http://localhost:1234/v1" value="${this._esc(this.formData.llm_endpoint)}">
                    <div class="wc-hint">Override the global LLM endpoint for this character</div>
                </div>
                <div class="wc-field">
                    <label class="wc-label" for="wc-llm-model">Custom Model Name</label>
                    <input id="wc-llm-model" class="wc-input" type="text" placeholder="e.g. my-custom-model" value="${this._esc(this.formData.llm_model)}">
                </div>
                <div class="wc-field">
                    <label class="wc-label" for="wc-llm-temp">Temperature</label>
                    <input id="wc-llm-temp" class="wc-input" type="number" min="0" max="2" step="0.1" placeholder="0 = use global default" value="${this.formData.llm_temperature || ''}">
                    <div class="wc-hint">0 = use global default, 0.1–2.0 for per-character override</div>
                </div>
            </div>

            <hr class="wc-divider">

            <div class="wc-collapsible-header" id="wc-cap-toggle">
                <span class="wc-caret">&#9654;</span> CAPABILITY PROFILE
            </div>
            <div class="wc-collapsible-body" id="wc-cap-section">
                ${this._renderCapabilityFields()}
            </div>
        `;
    }

    /**
     * Bind events for the Brain tab.
     * @private
     */
    _bindBrainEvents() {
        const c = this.content;

        // Live token counter
        const textarea = c?.querySelector('#wc-system-prompt');
        const counter = c?.querySelector('#wc-token-counter');
        textarea?.addEventListener('input', () => {
            const len = textarea.value.length;
            const est = Math.ceil(len / 4);
            const cls = est >= 3000 ? 'danger' : est >= 2000 ? 'warn' : '';
            if (counter) {
                counter.className = `wc-token-counter ${cls}`;
                counter.textContent = `~${est} tokens (${len}/5000 chars)`;
            }
        });

        // Collapsible toggle — LLM overrides
        const toggle = c?.querySelector('#wc-llm-toggle');
        const section = c?.querySelector('#wc-llm-section');
        toggle?.addEventListener('click', () => {
            toggle.classList.toggle('open');
            section?.classList.toggle('open');
        });

        // Collapsible toggle — Capability profile
        const capToggle = c?.querySelector('#wc-cap-toggle');
        const capSection = c?.querySelector('#wc-cap-section');
        capToggle?.addEventListener('click', () => {
            capToggle.classList.toggle('open');
            capSection?.classList.toggle('open');
        });

        // Context budget slider live label
        const ctxSlider = c?.querySelector('#wc-cap-ctx-budget');
        const ctxLabel = c?.querySelector('#wc-cap-ctx-val');
        ctxSlider?.addEventListener('input', () => {
            if (ctxLabel) ctxLabel.textContent = ctxSlider.value;
        });
    }

    /**
     * Render capability profile form fields for the Brain tab.
     *
     * Uses `wc-cap-*` prefixed IDs to avoid collisions with PersonaCreator's
     * `cap-*` IDs when both are in the DOM.
     *
     * @returns {string} HTML string for the capability profile form
     * @private
     */
    _renderCapabilityFields() {
        const cap = this.formData.capability_profile || {};
        const tier = cap.model_tier || 'medium';
        const ctxBudget = cap.context_budget || 8192;
        const repPenalty = cap.repeat_penalty ?? '';
        const freqPenalty = cap.frequency_penalty ?? '';
        const maxTok = cap.max_tokens ?? -1;
        const tools = cap.supports_tools ?? false;
        const thinking = cap.supports_thinking ?? false;
        const vision = cap.supports_vision ?? false;
        const pStyle = cap.prompt_style || 'default';
        const notes = cap.notes || '';

        return `
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
                <div class="wc-field">
                    <label class="wc-label" for="wc-cap-model-tier">Model Tier Requirement</label>
                    <select id="wc-cap-model-tier" class="wc-select">
                        <option value="tiny" ${tier === 'tiny' ? 'selected' : ''}>Tiny (1-3B)</option>
                        <option value="small" ${tier === 'small' ? 'selected' : ''}>Small (3-7B)</option>
                        <option value="medium" ${tier === 'medium' ? 'selected' : ''}>Medium (7-14B)</option>
                        <option value="large" ${tier === 'large' ? 'selected' : ''}>Large (14-32B)</option>
                        <option value="xl" ${tier === 'xl' ? 'selected' : ''}>XL (32B+)</option>
                    </select>
                    <div class="wc-hint">Minimum model size this character needs. Shows a warning if a smaller model is loaded.</div>
                </div>
                <div class="wc-field">
                    <label class="wc-label">
                        Context Budget (tokens)
                        <span id="wc-cap-ctx-val" style="color:var(--neon-cyan); margin-left:8px; font-weight:400;">${ctxBudget}</span>
                    </label>
                    <input id="wc-cap-ctx-budget" type="range" min="1024" max="131072" step="1024"
                           value="${ctxBudget}" style="width:100%; accent-color:var(--neon-cyan);">
                    <div style="display:flex; justify-content:space-between; font-size:0.6rem; color:var(--text-muted);">
                        <span>1K</span><span>8K</span><span>32K</span><span>128K</span>
                    </div>
                    <div class="wc-hint">Max tokens per request. Lower = faster responses, fewer history messages.</div>
                </div>
                <div style="display:flex; gap:12px;">
                    <div class="wc-field" style="flex:1;">
                        <label class="wc-label" for="wc-cap-repeat-penalty">Repeat Penalty</label>
                        <input id="wc-cap-repeat-penalty" class="wc-input" type="number" min="0" max="2" step="0.05"
                               value="${repPenalty}" placeholder="Global">
                    </div>
                    <div class="wc-field" style="flex:1;">
                        <label class="wc-label" for="wc-cap-freq-penalty">Freq Penalty</label>
                        <input id="wc-cap-freq-penalty" class="wc-input" type="number" min="0" max="2" step="0.05"
                               value="${freqPenalty}" placeholder="Global">
                    </div>
                    <div class="wc-field" style="flex:1;">
                        <label class="wc-label" for="wc-cap-max-tokens">Max Tokens</label>
                        <input id="wc-cap-max-tokens" class="wc-input" type="number" min="-1" max="32768" step="100"
                               value="${maxTok}" placeholder="-1 (∞)">
                    </div>
                </div>
                <div style="display:flex; gap:16px; flex-wrap:wrap;">
                    <label class="wc-label" style="cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:normal;">
                        <input id="wc-cap-supports-tools" type="checkbox" ${tools ? 'checked' : ''}>
                        Supports Tool Use
                    </label>
                    <label class="wc-label" style="cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:normal;">
                        <input id="wc-cap-supports-thinking" type="checkbox" ${thinking ? 'checked' : ''}>
                        Supports Thinking (CoT)
                    </label>
                    <label class="wc-label" style="cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:normal;">
                        <input id="wc-cap-supports-vision" type="checkbox" ${vision ? 'checked' : ''}>
                        Supports Vision
                    </label>
                </div>
                <div class="wc-field">
                    <label class="wc-label" for="wc-cap-prompt-style">Prompt Style</label>
                    <select id="wc-cap-prompt-style" class="wc-select">
                        <option value="default" ${pStyle === 'default' ? 'selected' : ''}>Default</option>
                        <option value="minimal" ${pStyle === 'minimal' ? 'selected' : ''}>Minimal (tiny models)</option>
                        <option value="chatml" ${pStyle === 'chatml' ? 'selected' : ''}>ChatML</option>
                        <option value="alpaca" ${pStyle === 'alpaca' ? 'selected' : ''}>Alpaca</option>
                    </select>
                    <div class="wc-hint">How to format the system prompt. "Minimal" strips bracket syntax for tiny models.</div>
                </div>
                <div class="wc-field">
                    <label class="wc-label" for="wc-cap-notes">Notes</label>
                    <input id="wc-cap-notes" class="wc-input" type="text"
                           value="${this._esc(notes)}"
                           placeholder="e.g. Tuned for Gemma-3-12b Q4 on RTX 5080">
                </div>
            </div>`;
    }

    /**
     * Collect capability profile form values from `#wc-cap-*` elements.
     *
     * @returns {Object} Capability profile dict for the API payload
     * @private
     */
    _collectCapabilityFields() {
        const c = this.content;
        const tier = c?.querySelector('#wc-cap-model-tier')?.value || 'medium';
        const ctxBudget = parseInt(c?.querySelector('#wc-cap-ctx-budget')?.value || '8192');
        const repPenalty = parseFloat(c?.querySelector('#wc-cap-repeat-penalty')?.value);
        const freqPenalty = parseFloat(c?.querySelector('#wc-cap-freq-penalty')?.value);
        const maxTok = parseInt(c?.querySelector('#wc-cap-max-tokens')?.value ?? '-1');
        const tools = c?.querySelector('#wc-cap-supports-tools')?.checked || false;
        const thinking = c?.querySelector('#wc-cap-supports-thinking')?.checked || false;
        const vision = c?.querySelector('#wc-cap-supports-vision')?.checked || false;
        const pStyle = c?.querySelector('#wc-cap-prompt-style')?.value || 'default';
        const notes = c?.querySelector('#wc-cap-notes')?.value?.trim() || '';

        const profile = { model_tier: tier, context_budget: ctxBudget };
        if (!isNaN(repPenalty)) profile.repeat_penalty = repPenalty;
        if (!isNaN(freqPenalty)) profile.frequency_penalty = freqPenalty;
        profile.max_tokens = isNaN(maxTok) ? -1 : maxTok;
        profile.supports_tools = tools;
        profile.supports_thinking = thinking;
        profile.supports_vision = vision;
        if (pStyle !== 'default') profile.prompt_style = pStyle;
        if (notes) profile.notes = notes;

        return profile;
    }

    /**
     * Render the Scene tab: background, greeting, animation.
     * @returns {string} HTML string
     * @private
     */
    _renderSceneTab() {
        const bgImages = this._images.filter(img => img.type === 'background');
        const bgCards = bgImages.map(img => {
            const selected = this.formData.background_url === img.url && this.formData.background_mode === 'image' ? 'selected' : '';
            return `
                <div class="wc-bg-card ${selected}" data-bg-url="${this._esc(img.url)}">
                    <img src="${this._esc(img.url)}" alt="${this._esc(img.name)}" loading="lazy">
                    <div class="wc-card-name">${this._esc(img.name)}</div>
                </div>`;
        }).join('');

        const animOptions = GREETING_ANIMATIONS.map(a =>
            `<option value="${a}" ${this.formData.greeting_animation === a ? 'selected' : ''}>${a || '(None)'}</option>`
        ).join('');

        return `
            <div class="wc-field">
                <label class="wc-label" for="wc-bg-mode">Background Mode</label>
                <select id="wc-bg-mode" class="wc-select">
                    <option value="transparent" ${this.formData.background_mode === 'transparent' ? 'selected' : ''}>Transparent</option>
                    <option value="color" ${this.formData.background_mode === 'color' ? 'selected' : ''}>Solid Color</option>
                    <option value="image" ${this.formData.background_mode === 'image' ? 'selected' : ''}>Image</option>
                </select>
            </div>

            <div class="wc-field" id="wc-bg-color-field" style="display:${this.formData.background_mode === 'color' ? 'block' : 'none'};">
                <label class="wc-label" for="wc-bg-color">Background Color</label>
                <input id="wc-bg-color" class="wc-input" type="color" value="${this.formData.background_mode === 'color' ? (this.formData.background_url || '#0b0c15') : '#0b0c15'}" style="height:40px; padding:4px;">
            </div>

            <div class="wc-field" id="wc-bg-image-field" style="display:${this.formData.background_mode === 'image' ? 'block' : 'none'};">
                <label class="wc-label">Background Image</label>
                <div class="wc-bg-grid">${bgCards}</div>
            </div>

            <hr class="wc-divider">

            <div class="wc-field">
                <label class="wc-label" for="wc-greeting-text">Greeting Message</label>
                <textarea id="wc-greeting-text" class="wc-textarea" rows="3" placeholder="What your character says when first meeting someone...">${this._esc(this.formData.greeting_text)}</textarea>
            </div>

            <div class="wc-field">
                <label class="wc-label" for="wc-greeting-anim">Greeting Animation</label>
                <select id="wc-greeting-anim" class="wc-select">${animOptions}</select>
                <div class="wc-hint">Animation played when the character greets the user</div>
            </div>
        `;
    }

    /**
     * Bind events for the Scene tab.
     * @private
     */
    _bindSceneEvents() {
        const c = this.content;

        // Background mode switch
        const modeSelect = c?.querySelector('#wc-bg-mode');
        const colorField = c?.querySelector('#wc-bg-color-field');
        const imageField = c?.querySelector('#wc-bg-image-field');

        modeSelect?.addEventListener('change', () => {
            const mode = modeSelect.value;
            this.formData.background_mode = mode;
            if (colorField) colorField.style.display = mode === 'color' ? 'block' : 'none';
            if (imageField) imageField.style.display = mode === 'image' ? 'block' : 'none';

            // Update preview background
            if (mode === 'transparent') {
                this._updatePreviewBg('transparent', '');
                this.formData.background_url = '';
            } else if (mode === 'color') {
                const color = c?.querySelector('#wc-bg-color')?.value || '#0b0c15';
                this._updatePreviewBg('color', color);
                this.formData.background_url = color;
            }
        });

        // Color picker live update
        c?.querySelector('#wc-bg-color')?.addEventListener('input', (e) => {
            this.formData.background_url = e.target.value;
            this._updatePreviewBg('color', e.target.value);
        });

        // Background image cards
        c?.querySelectorAll('.wc-bg-card').forEach(card => {
            card.onclick = () => {
                c.querySelectorAll('.wc-bg-card').forEach(bc => bc.classList.remove('selected'));
                card.classList.add('selected');
                this.formData.background_url = card.dataset.bgUrl;
                this.formData.background_mode = 'image';
                this._updatePreviewBg('image', card.dataset.bgUrl);
            };
        });
    }

    /**
     * Render the Review tab: read-only summary of all settings.
     * @returns {string} HTML string
     * @private
     */
    _renderReviewTab() {
        // Collect current tab data first
        const d = this.formData;

        const vrmName = d.vrm_model_url
            ? this._vrmModels.find(m => m.url === d.vrm_model_url)?.name || d.vrm_model_url.split('/').pop()
            : '(none)';

        const avatarName = d.avatar_2d_url
            ? this._images.find(i => i.url === d.avatar_2d_url)?.name || d.avatar_2d_url.split('/').pop()
            : '(none)';

        const promptPreview = d.system_prompt.length > 200
            ? d.system_prompt.substring(0, 200) + '...'
            : (d.system_prompt || '(none)');

        return `
            <div class="wc-review-section">
                <h4>IDENTITY</h4>
                ${this._reviewRow('Name', d.name || '(not set)')}
                ${this._reviewRow('Traits', d.personality_traits.length > 0 ? d.personality_traits.join(', ') : '(none)')}
            </div>

            <div class="wc-review-section">
                <h4>APPEARANCE</h4>
                ${this._reviewRow('3D Model', vrmName)}
                ${this._reviewRow('2D Avatar', avatarName)}
            </div>

            <div class="wc-review-section">
                <h4>VOICE</h4>
                ${this._reviewRow('TTS Provider', d.tts_provider || 'Global Default')}
                ${this._reviewRow('Voice ID', d.voice_id || '(not set)')}
            </div>

            <div class="wc-review-section">
                <h4>BRAIN</h4>
                ${this._reviewRow('System Prompt', `<span title="${this._esc(d.system_prompt)}">${this._esc(promptPreview)}</span>`)}
                ${this._reviewRow('Tokens (est.)', `~${Math.ceil(d.system_prompt.length / 4)}`)}
                ${d.llm_endpoint ? this._reviewRow('Custom Endpoint', d.llm_endpoint) : ''}
                ${d.llm_model ? this._reviewRow('Custom Model', d.llm_model) : ''}
                ${d.llm_temperature ? this._reviewRow('Temperature', d.llm_temperature) : ''}
            </div>

            <div class="wc-review-section">
                <h4>SCENE</h4>
                ${this._reviewRow('Background', d.background_mode || 'transparent')}
                ${this._reviewRow('Greeting', d.greeting_text ? (d.greeting_text.substring(0, 100) + (d.greeting_text.length > 100 ? '...' : '')) : '(none)')}
                ${this._reviewRow('Greeting Anim', d.greeting_animation || '(none)')}
            </div>
        `;
    }

    /**
     * Build a review summary row.
     *
     * @param {string} key - Label
     * @param {string} val - Value (may contain HTML)
     * @returns {string} HTML string
     * @private
     */
    _reviewRow(key, val) {
        return `<div class="wc-review-row"><span class="wc-review-key">${key}</span><span class="wc-review-val">${val}</span></div>`;
    }

    // ─── VRM Preview ─────────────────────────────────────────

    /**
     * Send a loadCharacter command to the preview iframe to display the VRM model.
     *
     * @param {string} url - VRM file URL (e.g. /files/avatars/Panicandy.vrm)
     * @private
     */
    _loadVrmPreview(url) {
        if (!this.previewIframe?.contentWindow) return;
        this.previewIframe.contentWindow.postMessage({
            type: 'loadCharacter',
            url: url,
            model_type: '3d',
        }, '*');
    }

    /**
     * Update the preview info bar below the VRM viewport.
     *
     * @param {string} url - Selected VRM URL
     * @private
     */
    _updatePreviewInfo(url) {
        if (!this.previewInfo) return;
        const model = this._vrmModels.find(m => m.url === url);
        if (model) {
            const sizeMB = (model.size / (1024 * 1024)).toFixed(1);
            this.previewInfo.innerHTML = `
                <span class="wc-preview-label">
                    <span class="wc-model-name">${this._esc(model.name)}.vrm</span>
                    <span class="wc-model-meta">${sizeMB} MB</span>
                </span>`;
        } else {
            this.previewInfo.innerHTML = `<span class="wc-preview-label">SELECT A MODEL TO PREVIEW</span>`;
        }
    }

    /**
     * Send a background update to the preview iframe.
     *
     * @param {string} mode - "transparent", "color", or "image"
     * @param {string} value - Color hex or image URL
     * @private
     */
    _updatePreviewBg(mode, value) {
        if (!this.previewIframe?.contentWindow) return;
        this.previewIframe.contentWindow.postMessage({
            type: 'updateBackground',
            mode: mode,
            value: value,
        }, '*');
    }

    // ─── API Calls ───────────────────────────────────────────

    /**
     * Fetch available VRM models from the backend.
     * @private
     */
    async _fetchVrmModels() {
        try {
            const data = await API.get('scan/vrm');
            this._vrmModels = data.models || [];
        } catch (err) {
            console.warn('[WaifuCreator] Failed to fetch VRM models:', err);
            this._vrmModels = [];
        }
    }

    /**
     * Fetch available images from the backend.
     * @private
     */
    async _fetchImages() {
        try {
            const data = await API.get('scan/images');
            this._images = data.images || [];
        } catch (err) {
            console.warn('[WaifuCreator] Failed to fetch images:', err);
            this._images = [];
        }
    }

    /**
     * Upload a file (VRM model or image) and refresh the relevant asset list.
     *
     * @param {'vrm'|'image'} type - What kind of file to upload
     * @private
     */
    async _uploadFile(type) {
        const accept = type === 'vrm' ? '.vrm' : '.png,.jpg,.jpeg,.webp,.gif';
        const endpoint = type === 'vrm' ? 'upload/avatar' : 'upload/image';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                toast.info(`Uploading ${file.name}...`, 2000);
                const fd = new FormData();
                fd.append('file', file);
                await API.upload(endpoint, fd);
                toast.success(`${file.name} uploaded!`, 2000);

                // Refresh asset list and re-render current tab
                if (type === 'vrm') {
                    await this._fetchVrmModels();
                } else {
                    await this._fetchImages();
                }
                this._switchTab(this.currentTab);
            } catch (err) {
                toast.error(`Upload failed: ${err.message}`, 5000);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    /**
     * Generate an AI portrait icon for the character using the image gen pipeline.
     *
     * Calls POST /api/image-gen/portrait with a prompt derived from the
     * character's name and personality traits. If in edit mode, the endpoint
     * auto-updates avatar_2d_url in the database.
     *
     * @private
     */
    async _generateIcon() {
        const btn = this.content?.querySelector('#wc-generate-icon');
        if (!btn) return;

        const name = this.formData.name || 'character';
        const traits = (this.formData.personality_traits || []).join(', ');
        const traitStr = traits ? `, ${traits}` : '';
        const prompt = `${name}, anime character portrait, upper body, detailed face${traitStr}, high quality, studio lighting`;

        btn.disabled = true;
        btn.textContent = '⌛ Generating...';

        try {
            const body = {
                prompt,
                character_name: name,
                character_id: this.editingCharId || null,
            };
            const res = await fetch('/api/image-gen/portrait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await res.json();

            if (result.ok && result.url) {
                toast.success('Portrait generated!', 2000);
                this.formData.avatar_2d_url = result.url;
                // Refresh images and re-render the appearance tab to show new avatar
                await this._fetchImages();
                this._switchTab(this.currentTab);
            } else {
                toast.error(result.error || 'Generation failed', 4000);
            }
        } catch (err) {
            toast.error(`Generate icon failed: ${err.message}`, 5000);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '✨ Generate Icon';
            }
        }
    }

    /**
     * Play a voice preview using the selected TTS provider and voice ID.
     * @private
     */
    async _previewVoice() {
        this._stopPreviewAudio();

        const provider = this.formData.tts_provider || this.content?.querySelector('#wc-tts-provider')?.value || '';
        const voiceId = this.formData.voice_id || '';

        if (!voiceId) {
            toast.warning('Select a voice to preview', 2000);
            return;
        }

        const btn = this.content?.querySelector('#wc-voice-preview');
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: 'Hello! This is a voice preview test. Nice to meet you!',
                    provider: provider || undefined,
                    voice_id: voiceId,
                    format: 'mp3',
                }),
            });

            if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

            const data = await res.json();
            if (!data.ok || !data.url) throw new Error('TTS returned no audio URL');

            this._previewAudio = new Audio(data.url);
            this._previewAudio.onended = () => {
                if (btn) btn.disabled = false;
            };
            this._previewAudio.onerror = () => {
                if (btn) btn.disabled = false;
                toast.error('Voice preview playback failed', 3000);
            };
            this._previewAudio.play();
        } catch (err) {
            if (btn) btn.disabled = false;
            toast.error(`Voice preview failed: ${err.message}`, 5000);
        }
    }

    /**
     * Stop any currently playing voice preview audio.
     * @private
     */
    _stopPreviewAudio() {
        if (this._previewAudio) {
            this._previewAudio.pause();
            this._previewAudio = null;
        }
    }

    // ─── Save Flow ───────────────────────────────────────────

    /**
     * Validate form data and return an array of error messages.
     *
     * @returns {string[]} Array of validation error strings (empty = valid)
     * @private
     */
    _validate() {
        const errors = [];
        if (!this.formData.name.trim()) errors.push('Character name is required');
        if (!this.formData.system_prompt.trim()) errors.push('System prompt is required');
        return errors;
    }

    /**
     * Save the character (create or update) and return to the dashboard.
     * @private
     */
    async _save() {
        if (this._saving) return;

        // Collect current tab's data first
        this._collectFormData();

        const errors = this._validate();
        if (errors.length > 0) {
            toast.error(errors.join('. '), 5000);
            return;
        }

        this._saving = true;
        const saveBtn = document.getElementById('wc-save');
        if (saveBtn) saveBtn.disabled = true;

        const payload = { ...this.formData };

        // Clean up: remove empty strings for optional fields
        if (payload.llm_temperature === 0) payload.llm_temperature = null;

        try {
            if (this.editingCharId) {
                // Edit mode — PUT
                await API.put(`characters/${this.editingCharId}`, payload);
                toast.success(`${payload.name} updated!`, 2000);

                // Refresh character list and navigate back
                await state.loadCharacters();
                window.location.hash = '';
            } else {
                // Create mode — POST, then switch to the new character
                const created = await API.post('characters', payload);
                toast.success(`${payload.name} created!`, 2000);

                // Refresh list so the new character appears
                await state.loadCharacters();

                // Select the new character and start a fresh chat
                if (created && created.id) {
                    await state.selectCharacter(created.id);
                    await state.createSession(`Chat with ${payload.name}`);
                }

                // Navigate back to the main view (now showing new char's chat)
                window.location.hash = '';
            }
        } catch (err) {
            toast.error(`Save failed: ${err.message}`, 5000);
        } finally {
            this._saving = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // ─── Utilities ────────────────────────────────────────────

    /**
     * Escape HTML special characters for safe injection into innerHTML.
     *
     * @param {string} str - Raw string
     * @returns {string} HTML-escaped string
     * @private
     */
    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }
}
