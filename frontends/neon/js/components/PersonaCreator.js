/**
 * PersonaCreator.js
 * Modal wizard for creating and editing AI companion personas.
 *
 * Features:
 * - Template system with preset archetypes (Tsundere, Kuudere, etc.)
 * - Custom persona creation with name, prompt, traits, voice
 * - Avatar selection from image gallery with upload support
 * - Live preview of personality prompt
 *
 * @example
 * const creator = new PersonaCreator();
 * creator.open();           // New persona
 * creator.open(charId);     // Edit existing persona
 */
import { state } from '../core/StateManager.js';
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';

/** Persona templates for quick-start creation */
const TEMPLATES = [
    {
        name: "Tsundere",
        icon: "🔥",
        desc: "Hot-tempered but secretly caring",
        prompt: "You are a sharp-tongued tsundere. You deny your feelings but secretly care deeply. You get flustered when complimented and use phrases like 'b-baka!' when embarrassed. You're competitive, proud, but ultimately loyal.",
        traits: ["hot-tempered", "secretly-caring", "proud", "competitive"]
    },
    {
        name: "Kuudere",
        icon: "❄️",
        desc: "Cool, calm, barely shows emotion",
        prompt: "You are a kuudere — cool, logical, and rarely express emotion. You speak concisely and analytically. When you do show warmth, it's subtle and meaningful. You prefer efficiency over small talk.",
        traits: ["calm", "logical", "stoic", "analytical"]
    },
    {
        name: "Genki",
        icon: "⚡",
        desc: "Hyper-energetic and optimistic",
        prompt: "You are a genki girl — always bursting with energy and enthusiasm! You love fun, games, and making people smile. You end sentences with exclamation marks and use lots of onomatopoeia. Nothing gets you down!",
        traits: ["energetic", "optimistic", "loud", "playful"]
    },
    {
        name: "Onee-san",
        icon: "🌸",
        desc: "Mature, caring older sister type",
        prompt: "You are an onee-san type — a mature, caring older sister figure. You say 'Ara ara~' and offer comfort and wisdom. You're nurturing but can be teasing. You make others feel safe and supported.",
        traits: ["mature", "caring", "teasing", "nurturing"]
    },
    {
        name: "Goth",
        icon: "🦇",
        desc: "Mysterious, dark aesthetic, chunibyou",
        prompt: "You are a gothic character who loves the occult, darkness, and speaks in dramatic, chunibyou metaphors. You reference ancient powers and mysterious forces. Despite the dark exterior, you have a surprisingly kind heart.",
        traits: ["mysterious", "dramatic", "dark", "secretly-kind"]
    },
    {
        name: "Custom",
        icon: "✨",
        desc: "Build from scratch",
        prompt: "",
        traits: []
    }
];

export class PersonaCreator {
    constructor() {
        this.editingCharId = null;
        this.selectedTemplate = null;
        this.selectedAvatar = null;
        this.injectHTML();
        this.modal = document.getElementById('persona-creator-modal');

        // Redirect to WaifuCreator (full-page creator). Preserved for backward compatibility.
        window.openPersonaCreator = (charId) => {
            window.location.hash = charId ? `#edit-waifu/${charId}` : '#create-waifu';
        };
    }

    /**
     * Open the persona creator.
     * @param {number|null} [charId=null] - If provided, edit existing character
     */
    async open(charId = null) {
        this.editingCharId = charId;
        this.selectedTemplate = null;
        this.selectedAvatar = null;

        if (charId) {
            // Edit mode — load existing character data
            const char = state.state.characters.find(c => c.id == charId);
            if (char) {
                this.modal.style.display = 'flex';
                this._renderEditMode(char);
                return;
            }
        }

        // Create mode — show template picker
        this.modal.style.display = 'flex';
        this._renderTemplateStep();
    }

    /**
     * Close the persona creator modal.
     */
    close() {
        this.modal.style.display = 'none';
        this.editingCharId = null;
    }

    /**
     * Inject the modal HTML into the document body.
     * Uses inline flex-column styling instead of settings-box to avoid
     * the row-direction override from SettingsModal CSS.
     */
    injectHTML() {
        if (document.getElementById('persona-creator-modal')) return;
        const html = `
            <div id="persona-creator-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel" style="position:relative; max-width:700px; width:90vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 0 50px rgba(0,240,255,0.1); overflow:hidden;">
                    <button id="btn-close-persona" class="settings-close-x">&times;</button>
                    <div style="padding:24px; padding-right:48px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <h2 id="persona-title" style="margin:0 0 20px 0; color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:2px;">NEW ENTITY</h2>
                        <div id="persona-content" style="overflow-y:auto; flex:1; min-height:0;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Close on X button and overlay click
        document.getElementById('btn-close-persona').onclick = () => this.close();
        document.getElementById('persona-creator-modal').addEventListener('click', (e) => {
            if (e.target.id === 'persona-creator-modal') this.close();
        });
    }

    /**
     * Render the template selection step.
     * @private
     */
    _renderTemplateStep() {
        const container = document.getElementById('persona-content');
        document.getElementById('persona-title').textContent = 'CHOOSE ARCHETYPE';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">
                    Start with a template or build from scratch.
                </p>
                <button id="btn-import-character" class="btn-config" style="padding:5px 12px; font-size:0.7rem; color:var(--neon-magenta,#ff00ff); border-color:rgba(255,0,255,0.2); white-space:nowrap;">
                    IMPORT JSON
                </button>
            </div>
            <div class="persona-template-grid"></div>
        `;
        document.getElementById('btn-import-character')?.addEventListener('click', () => {
            this._importCharacter();
        });

        const grid = container.querySelector('.persona-template-grid');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px;';

        TEMPLATES.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style.cssText = `
                padding: 16px; cursor: pointer; text-align: center;
                transition: all 0.2s; border: 1px solid var(--glass-border);
            `;
            card.innerHTML = `
                <div style="font-size:2rem; margin-bottom:8px;">${tpl.icon}</div>
                <div style="font-family:var(--font-display); font-size:1rem; color:var(--neon-cyan); margin-bottom:4px;">${tpl.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${tpl.desc}</div>
            `;
            card.onmouseenter = () => {
                card.style.borderColor = 'var(--neon-cyan)';
                card.style.boxShadow = '0 0 15px rgba(0, 240, 255, 0.1)';
            };
            card.onmouseleave = () => {
                card.style.borderColor = 'var(--glass-border)';
                card.style.boxShadow = 'none';
            };
            card.onclick = () => {
                this.selectedTemplate = tpl;
                this._renderFormStep(tpl);
            };
            grid.appendChild(card);
        });
    }

    /**
     * Render the character creation/edit form.
     * @private
     * @param {Object} tpl - Template to pre-fill, or character data
     */
    _renderFormStep(tpl) {
        const container = document.getElementById('persona-content');
        const isEdit = !!this.editingCharId;
        document.getElementById('persona-title').textContent = isEdit ? 'EDIT ENTITY' : 'CUSTOMIZE ENTITY';

        const name = tpl.name === 'Custom' ? '' : (tpl.name || '');
        const prompt = tpl.prompt || tpl.system_prompt || '';
        const traits = (tpl.traits || tpl.personality_traits || []).join(', ');

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Name</label>
                    <input id="persona-name" type="text" class="input-field" value="${this._escapeHtml(name)}"
                           placeholder="e.g. Sakura, Max, Luna..."
                           style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px;">
                </div>

                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Personality Prompt</label>
                    <textarea id="persona-prompt" class="input-field" rows="6"
                              placeholder="Describe the character's personality, speech patterns, and behavior..."
                              style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; resize:vertical;">${this._escapeHtml(prompt)}</textarea>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">
                        <span id="prompt-char-count">${prompt.length}</span>/5000 chars · <span id="prompt-token-count" style="color:var(--text-muted);">~${Math.ceil(prompt.length / 4)} tokens</span>
                    </div>
                </div>

                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Personality Traits</label>
                    <input id="persona-traits" type="text" class="input-field" value="${this._escapeHtml(traits)}"
                           placeholder="e.g. caring, energetic, mysterious (comma-separated)"
                           style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px;">
                </div>

                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Voice ID</label>
                    <input id="persona-voice" type="text" class="input-field" value="${this._escapeHtml(tpl.voice_id || '')}"
                           placeholder="e.g. default_v1 (leave empty for default)"
                           style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px;">
                </div>

                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Greeting Message</label>
                    <input id="persona-greeting" type="text" class="input-field" value="${this._escapeHtml(tpl.greeting_text || '')}"
                           placeholder="e.g. Hello! I'm so happy to meet you~ (shown on new chat)"
                           style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px;">
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">Displayed as AI message when starting a new chat session.</div>
                </div>

                <div class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Greeting Animation</label>
                    <select id="persona-greeting-anim" style="width:100%; padding:10px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px;">
                        <option value="">None</option>
                        <option value="wave" ${tpl.greeting_animation === 'wave' ? 'selected' : ''}>Wave</option>
                        <option value="nod" ${tpl.greeting_animation === 'nod' ? 'selected' : ''}>Nod</option>
                        <option value="bow" ${tpl.greeting_animation === 'bow' ? 'selected' : ''}>Bow</option>
                        <option value="shrug" ${tpl.greeting_animation === 'shrug' ? 'selected' : ''}>Shrug</option>
                        <option value="clap" ${tpl.greeting_animation === 'clap' ? 'selected' : ''}>Clap</option>
                        <option value="think" ${tpl.greeting_animation === 'think' ? 'selected' : ''}>Think</option>
                        <option value="point" ${tpl.greeting_animation === 'point' ? 'selected' : ''}>Point</option>
                        <option value="celebrate" ${tpl.greeting_animation === 'celebrate' ? 'selected' : ''}>Celebrate</option>
                        <option value="shy" ${tpl.greeting_animation === 'shy' ? 'selected' : ''}>Shy</option>
                        <option value="dance" ${tpl.greeting_animation === 'dance' ? 'selected' : ''}>Dance</option>
                    </select>
                </div>

                <details style="margin-top:4px;">
                    <summary style="color:var(--text-muted); font-size:0.8rem; cursor:pointer; user-select:none; padding:4px 0;">
                        ▸ Advanced: Per-Character LLM Override
                    </summary>
                    <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px; padding:12px; border:1px solid rgba(255,255,255,0.06); border-radius:8px; background:rgba(0,0,0,0.15);">
                        <div class="persona-field">
                            <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">
                                Custom LLM Endpoint
                            </label>
                            <input id="persona-llm-endpoint" type="text" class="input-field"
                                   value="${this._escapeHtml(tpl.llm_endpoint || '')}"
                                   placeholder="e.g. http://localhost:11434/v1 (leave blank for global)"
                                   style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                            <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">Override the global LLM endpoint for this character only.</div>
                        </div>
                        <div class="persona-field">
                            <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">
                                Custom LLM Model
                            </label>
                            <input id="persona-llm-model" type="text" class="input-field"
                                   value="${this._escapeHtml(tpl.llm_model || '')}"
                                   placeholder="e.g. lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF (leave blank for global)"
                                   style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                            <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">Override the global active model for this character only.</div>
                        </div>
                        <div class="persona-field">
                            <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">
                                Character Temperature Override
                                <span id="persona-llm-temp-val" style="color:var(--neon-cyan); margin-left:8px; font-weight:400;">
                                    ${tpl.llm_temperature != null ? tpl.llm_temperature : 'Global'}
                                </span>
                            </label>
                            <input id="persona-llm-temperature" type="range" min="0" max="2" step="0.05"
                                   value="${tpl.llm_temperature != null ? tpl.llm_temperature : 0}"
                                   style="width:100%; accent-color:var(--neon-cyan);">
                            <div style="display:flex; justify-content:space-between; font-size:0.6rem; color:var(--text-muted); margin-top:2px;">
                                <span>0 = Global</span><span>0.7 = Balanced</span><span>1.5 = Creative</span><span>2.0 = Wild</span>
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">Per-character creativity. Drag to 0 to use the global temperature setting.</div>
                        </div>
                    </div>
                </details>

                <details style="margin-top:4px;">
                    <summary style="color:var(--text-muted); font-size:0.8rem; cursor:pointer; user-select:none; padding:4px 0;">
                        ▸ Capabilities: Model Requirements &amp; Behavior
                    </summary>
                    ${this._renderCapabilitySection(tpl)}
                </details>

                ${isEdit ? this._renderVoiceCloneSection(tpl) : ''}

                ${isEdit ? this._renderVocabCategoriesSection(tpl) : ''}

                <div id="persona-avatar-section" class="persona-field">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <label style="color:var(--text-main); font-weight:600;">Avatar</label>
                        <button id="btn-generate-icon" style="padding:4px 12px; border-radius:6px;
                                border:1px solid rgba(157,80,255,0.5); background:rgba(157,80,255,0.1);
                                color:rgba(157,80,255,0.9); font-size:0.72rem; cursor:pointer;"
                                title="AI-generate a character portrait">
                            ✨ Generate Icon
                        </button>
                    </div>
                    <div id="persona-avatar-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(60px, 1fr)); gap:8px; max-height:200px; overflow-y:auto; padding:8px; border:1px solid var(--glass-border); border-radius:8px; background:rgba(0,0,0,0.2);">
                        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.75rem; grid-column:1/-1;">Loading avatars...</div>
                    </div>
                </div>

                ${isEdit ? `
                <div id="persona-expressions-section" class="persona-field" style="margin-top:6px;">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">
                        Expression Portraits
                        <span id="expr-pack-status" style="margin-left:8px; font-size:0.72rem; color:var(--text-muted); font-weight:400;">(checking AI art...)</span>
                    </label>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
                        AI-generated portraits shown as reaction overlays during chat when emotions fire.
                    </div>
                    <div id="expr-portraits-preview" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;"></div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button id="btn-generate-expressions" style="padding:6px 14px; border-radius:6px;
                                border:1px solid rgba(157,80,255,0.5); background:rgba(157,80,255,0.1);
                                color:rgba(157,80,255,0.9); font-size:0.78rem; cursor:pointer;">
                            ✨ Generate All Expressions
                        </button>
                        <span id="expr-gen-status" style="font-size:0.75rem; color:var(--text-muted);"></span>
                    </div>
                </div>
                ` : ''}

                ${isEdit ? `
                <div id="persona-diary-section" class="persona-field" style="margin-top:6px;">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">
                        ✍ Character Diary
                        <span id="diary-date-label" style="margin-left:8px; font-size:0.72rem; color:var(--text-muted); font-weight:400;">
                            ${tpl.diary_date ? `Last entry: ${tpl.diary_date}` : 'No entry yet'}
                        </span>
                    </label>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
                        After each session, ask the character to write a diary entry from their perspective.
                        The entry is injected into the next session's system prompt for continuity.
                    </div>
                    <div id="diary-content" style="
                        background:rgba(0,10,20,0.5); border:1px solid rgba(255,255,255,0.08);
                        border-radius:8px; padding:10px 12px; font-size:0.8rem; color:var(--text-main);
                        font-style:italic; min-height:48px; max-height:140px; overflow-y:auto;
                        margin-bottom:8px; line-height:1.5; white-space:pre-wrap;
                    ">${tpl.diary ? this._escapeHtml(tpl.diary) : '<span style="color:var(--text-muted);">No diary entry yet — generate one after a chat session.</span>'}</div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button id="btn-write-diary" style="padding:6px 14px; border-radius:6px;
                                border:1px solid rgba(0,240,255,0.4); background:rgba(0,240,255,0.08);
                                color:var(--neon-cyan); font-size:0.78rem; cursor:pointer;">
                            ✍ Write Diary Entry
                        </button>
                        <span id="diary-gen-status" style="font-size:0.75rem; color:var(--text-muted);"></span>
                    </div>
                </div>
                ` : ''}

                ${isEdit ? this._renderKnowledgeBaseSection() : ''}

                <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:8px;">
                    ${!isEdit ? '<button id="btn-persona-back" class="btn" style="padding:10px 20px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); cursor:pointer; border-radius:8px;">&#x2190; BACK</button>' : ''}
                    <button id="btn-persona-save" class="btn btn-primary" style="padding:10px 24px; background:rgba(0,240,255,0.12); border:1px solid var(--neon-cyan); color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:1px; cursor:pointer; border-radius:8px;">
                        ${isEdit ? 'SAVE CHANGES' : 'CREATE ENTITY'}
                    </button>
                </div>
            </div>
        `;

        // Bind events
        const promptEl = document.getElementById('persona-prompt');
        const charCount = document.getElementById('prompt-char-count');
        const tokenCount = document.getElementById('prompt-token-count');
        promptEl.oninput = () => {
            const chars = promptEl.value.length;
            const tokens = Math.ceil(chars / 4);
            charCount.textContent = chars;
            if (tokenCount) {
                tokenCount.textContent = `~${tokens.toLocaleString()} tokens`;
                if (tokens > 2000) {
                    tokenCount.style.color = '#ffaa00';
                    tokenCount.textContent += ' (long)';
                } else {
                    tokenCount.style.color = 'var(--text-muted)';
                }
            }
        };

        const backBtn = document.getElementById('btn-persona-back');
        if (backBtn) backBtn.onclick = () => this._renderTemplateStep();

        document.getElementById('btn-persona-save').onclick = () => this._save();

        // Live display for temperature slider (#3)
        const tempSlider = document.getElementById('persona-llm-temperature');
        const tempVal = document.getElementById('persona-llm-temp-val');
        if (tempSlider && tempVal) {
            tempSlider.oninput = () => {
                const v = parseFloat(tempSlider.value);
                tempVal.textContent = v === 0 ? 'Global' : v.toFixed(2);
            };
        }

        // Load avatars
        this._loadAvatarGrid(tpl.avatar_2d_url || tpl.avatar_url);

        // Phase 8A-6c: Generate Icon button
        const genIconBtn = document.getElementById('btn-generate-icon');
        if (genIconBtn) {
            genIconBtn.onclick = () => this._generateIcon(tpl);
        }

        // Phase 8A: expression pack section (edit mode only)
        if (isEdit && tpl.id) {
            this._initExpressionPackSection(tpl);
        }

        // #57 Diary: wire "Write Diary Entry" button (edit mode only)
        const diaryBtn = document.getElementById('btn-write-diary');
        if (diaryBtn && tpl.id) {
            diaryBtn.onclick = () => this._writeDiaryEntry(tpl.id);
        }
    }

    /**
     * Generate a diary entry for the character via the backend LLM.
     * Updates the diary display panel on success.
     *
     * @private
     * @param {number} charId - Character ID to write diary for
     */
    async _writeDiaryEntry(charId) {
        const btn = document.getElementById('btn-write-diary');
        const status = document.getElementById('diary-gen-status');
        const content = document.getElementById('diary-content');
        const dateLabel = document.getElementById('diary-date-label');

        if (!btn || !status || !content) return;

        btn.disabled = true;
        btn.textContent = '⌛ Writing...';
        if (status) status.textContent = 'Asking the character to reflect...';

        try {
            const res = await fetch(`/api/characters/${charId}/diary`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();

            if (data.ok && data.diary) {
                content.textContent = data.diary;
                if (dateLabel) dateLabel.textContent = `Last entry: ${data.diary_date}`;
                if (status) status.textContent = '✓ Written!';
                setTimeout(() => { if (status) status.textContent = ''; }, 3000);
            } else {
                if (status) status.textContent = `Error: ${data.error || 'Unknown error'}`;
            }
        } catch (err) {
            if (status) status.textContent = `Failed: ${err.message}`;
        } finally {
            btn.disabled = false;
            btn.textContent = '✍ Write Diary Entry';
        }
    }

    /**
     * Render edit mode for an existing character.
     * Also loads the knowledge base docs after rendering.
     * @private
     * @param {Object} char - Character data from state
     */
    _renderEditMode(char) {
        this._renderFormStep(char);
        // Bind voice clone + knowledge doc + vocab handlers after DOM is ready
        requestAnimationFrame(() => {
            this._bindVoiceCloneEvents();
            this._loadKnowledgeDocs();
            // Parse vocab_categories (stored as JSON string or array in DB)
            let vocabCats = char.vocab_categories || [];
            if (typeof vocabCats === 'string') {
                try { vocabCats = JSON.parse(vocabCats); } catch { vocabCats = []; }
            }
            this._loadVocabCategories(vocabCats);
        });
    }

    /**
     * Load avatar images into the selection grid with upload support.
     * @private
     * @param {string|null} selectedUrl - Currently selected avatar URL
     */
    async _loadAvatarGrid(selectedUrl) {
        const grid = document.getElementById('persona-avatar-grid');
        if (!grid) return;

        try {
            const res = await fetch('/api/scan/images');
            const data = await res.json();
            const avatars = (data.images || []).filter(img => img.type === 'avatar');

            grid.innerHTML = '';

            // Upload button — always first in the grid
            const uploadItem = document.createElement('div');
            uploadItem.style.cssText = `
                aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer;
                border: 2px dashed var(--glass-border); display: flex; align-items: center;
                justify-content: center; transition: all 0.2s; background: rgba(0,240,255,0.03);
            `;
            uploadItem.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); font-size:0.65rem;">
                    <div style="font-size:1.2rem; margin-bottom:2px;">+</div>
                    Upload
                </div>
            `;
            uploadItem.onmouseenter = () => {
                uploadItem.style.borderColor = 'var(--neon-cyan)';
                uploadItem.style.background = 'rgba(0,240,255,0.06)';
            };
            uploadItem.onmouseleave = () => {
                uploadItem.style.borderColor = 'var(--glass-border)';
                uploadItem.style.background = 'rgba(0,240,255,0.03)';
            };
            uploadItem.onclick = () => this._uploadAvatar();
            grid.appendChild(uploadItem);

            if (avatars.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'padding:10px; text-align:center; color:var(--text-muted); font-size:0.75rem; grid-column:2/-1;';
                emptyMsg.textContent = 'No avatars yet';
                grid.appendChild(emptyMsg);
                return;
            }

            // Pre-select this.selectedAvatar if already set (keeps state through re-loads)
            const effectiveSelected = this.selectedAvatar || selectedUrl || '';

            avatars.forEach(img => {
                const item = document.createElement('div');
                // Robust URL match: normalize trailing slashes and try multiple heuristics.
                // Covers cases like '/files/images/foo.png' vs 'files/images/foo.png',
                // or when only the filename component is stored in the DB.
                const normSelected = effectiveSelected.replace(/^\//, '');
                const normUrl = (img.url || '').replace(/^\//, '');
                const isSelected = effectiveSelected && (
                    normSelected === normUrl ||
                    normSelected.endsWith('/' + img.file) ||
                    normUrl.endsWith('/' + img.file.replace(/^.*[\\/]/, '')) ||
                    img.file === effectiveSelected.split('/').pop()
                );
                item.style.cssText = `
                    aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer;
                    border: 2px solid ${isSelected ? 'var(--neon-cyan)' : 'transparent'};
                    transition: all 0.2s;
                `;
                if (isSelected) {
                    item.style.boxShadow = '0 0 10px var(--neon-cyan)';
                    this.selectedAvatar = img.url;
                }

                item.innerHTML = `<img src="${img.url}" alt="${img.name}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">`;

                item.onclick = () => {
                    grid.querySelectorAll('div').forEach(d => {
                        d.style.borderColor = 'transparent';
                        d.style.boxShadow = 'none';
                    });
                    item.style.borderColor = 'var(--neon-cyan)';
                    item.style.boxShadow = '0 0 10px var(--neon-cyan)';
                    this.selectedAvatar = img.url;
                };

                grid.appendChild(item);
            });
        } catch (e) {
            grid.innerHTML = '<div style="padding:10px; color:var(--neon-magenta); font-size:0.75rem;">Failed to load avatars</div>';
        }
    }

    /**
     * Open a file picker and upload a new avatar image.
     * Uses the existing POST /api/upload/image endpoint,
     * then refreshes the avatar grid to show the new image.
     * @private
     */
    async _uploadAvatar() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast.error('Image too large (max 10MB)', 3000);
                input.remove();
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                toast.info('Uploading avatar...', 2000);
                const result = await API.upload('upload/image?category=avatar', formData);
                if (result.ok) {
                    toast.success('Avatar uploaded!', 2000);
                    this.selectedAvatar = result.url;
                    // Refresh the avatar grid to include the new upload
                    await this._loadAvatarGrid(result.url);
                } else {
                    toast.error('Upload failed', 3000);
                }
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
     * character's name and traits. Auto-updates avatar_2d_url if in edit mode.
     *
     * @private
     * @param {Object} tpl - Character template data (may include id for edit mode)
     */
    async _generateIcon(tpl) {
        const btn = document.getElementById('btn-generate-icon');
        if (!btn) return;

        const name = document.getElementById('persona-name')?.value?.trim() || tpl.name || 'character';
        const traits = document.getElementById('persona-traits')?.value?.trim() || '';

        // Build a descriptive prompt from character info
        const traitStr = traits ? `, ${traits}` : '';
        const prompt = `${name}, anime character portrait, upper body, detailed face${traitStr}, high quality, studio lighting`;

        btn.disabled = true;
        btn.textContent = '⌛ Generating...';

        try {
            const body = {
                prompt,
                character_name: name,
                character_id: tpl.id || null,
            };
            const res = await fetch('/api/image-gen/portrait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await res.json();

            if (result.ok && result.url) {
                toast.success('Portrait generated!', 2000);
                this.selectedAvatar = result.url;
                await this._loadAvatarGrid(result.url);
            } else {
                toast.error(result.error || 'Generation failed', 4000);
            }
        } catch (err) {
            toast.error(`Generate icon failed: ${err.message}`, 5000);
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Generate Icon';
        }
    }

    /**
     * Renders the Phase 9 Capability Profile editor section.
     *
     * Provides controls for model tier, context budget, penalty overrides,
     * max output tokens, feature flags, prompt style, and notes.
     *
     * @private
     * @param {Object} tpl - Character template data
     * @returns {string} HTML string for the capability section
     */
    _renderCapabilitySection(tpl) {
        let cap = {};
        if (tpl.capability_profile) {
            try {
                cap = typeof tpl.capability_profile === 'string'
                    ? JSON.parse(tpl.capability_profile) : tpl.capability_profile;
            } catch { /* ignore */ }
        }
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
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px; padding:12px; border:1px solid rgba(255,255,255,0.06); border-radius:8px; background:rgba(0,0,0,0.15);">
                <div class="persona-field">
                    <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">
                        Model Tier Requirement
                    </label>
                    <select id="cap-model-tier" style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                        <option value="tiny" ${tier === 'tiny' ? 'selected' : ''}>Tiny (1-3B)</option>
                        <option value="small" ${tier === 'small' ? 'selected' : ''}>Small (3-7B)</option>
                        <option value="medium" ${tier === 'medium' ? 'selected' : ''}>Medium (7-14B)</option>
                        <option value="large" ${tier === 'large' ? 'selected' : ''}>Large (14-32B)</option>
                        <option value="xl" ${tier === 'xl' ? 'selected' : ''}>XL (32B+)</option>
                    </select>
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">Minimum model size this character needs. Shows a warning if a smaller model is loaded.</div>
                </div>
                <div class="persona-field">
                    <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">
                        Context Budget (tokens)
                        <span id="cap-ctx-val" style="color:var(--neon-cyan); margin-left:8px; font-weight:400;">${ctxBudget}</span>
                    </label>
                    <input id="cap-context-budget" type="range" min="1024" max="131072" step="1024"
                           value="${ctxBudget}"
                           oninput="document.getElementById('cap-ctx-val').textContent=this.value"
                           style="width:100%; accent-color:var(--neon-cyan);">
                    <div style="display:flex; justify-content:space-between; font-size:0.6rem; color:var(--text-muted);">
                        <span>1K</span><span>8K</span><span>32K</span><span>128K</span>
                    </div>
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">Max tokens per request. Lower = faster responses, fewer history messages.</div>
                </div>
                <div style="display:flex; gap:12px;">
                    <div class="persona-field" style="flex:1;">
                        <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Repeat Penalty</label>
                        <input id="cap-repeat-penalty" type="number" min="0" max="2" step="0.05"
                               value="${repPenalty}" placeholder="Global"
                               style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                    </div>
                    <div class="persona-field" style="flex:1;">
                        <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Freq Penalty</label>
                        <input id="cap-freq-penalty" type="number" min="0" max="2" step="0.05"
                               value="${freqPenalty}" placeholder="Global"
                               style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                    </div>
                    <div class="persona-field" style="flex:1;">
                        <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Max Tokens</label>
                        <input id="cap-max-tokens" type="number" min="-1" max="32768" step="100"
                               value="${maxTok}" placeholder="-1 (∞)"
                               style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                    </div>
                </div>
                <div style="display:flex; gap:16px; flex-wrap:wrap;">
                    <label style="color:var(--text-muted); font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <input id="cap-supports-tools" type="checkbox" ${tools ? 'checked' : ''}>
                        Supports Tool Use
                    </label>
                    <label style="color:var(--text-muted); font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <input id="cap-supports-thinking" type="checkbox" ${thinking ? 'checked' : ''}>
                        Supports Thinking (CoT)
                    </label>
                    <label style="color:var(--text-muted); font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <input id="cap-supports-vision" type="checkbox" ${vision ? 'checked' : ''}>
                        Supports Vision
                    </label>
                </div>
                <div class="persona-field">
                    <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Prompt Style</label>
                    <select id="cap-prompt-style" style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                        <option value="default" ${pStyle === 'default' ? 'selected' : ''}>Default</option>
                        <option value="minimal" ${pStyle === 'minimal' ? 'selected' : ''}>Minimal (tiny models)</option>
                        <option value="chatml" ${pStyle === 'chatml' ? 'selected' : ''}>ChatML</option>
                        <option value="alpaca" ${pStyle === 'alpaca' ? 'selected' : ''}>Alpaca</option>
                    </select>
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px;">How to format the system prompt. "Minimal" strips bracket syntax for tiny models.</div>
                </div>
                <div class="persona-field">
                    <label style="color:var(--text-muted); font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Notes</label>
                    <input id="cap-notes" type="text" class="input-field"
                           value="${this._escapeHtml(notes)}"
                           placeholder="e.g. Tuned for Gemma-3-12b Q4 on RTX 5080"
                           style="width:100%; padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:8px; font-size:0.85rem;">
                </div>
            </div>`;
    }

    /**
     * Collects the capability profile form values into a JSON object.
     *
     * Reads all #cap-* input elements and returns a structured capability
     * profile dict ready for the API.
     *
     * @private
     * @returns {Object|null} Capability profile dict, or null if all defaults
     */
    _collectCapabilityProfile() {
        const tier = document.getElementById('cap-model-tier')?.value || 'medium';
        const ctxBudget = parseInt(document.getElementById('cap-context-budget')?.value || '8192');
        const repPenalty = parseFloat(document.getElementById('cap-repeat-penalty')?.value);
        const freqPenalty = parseFloat(document.getElementById('cap-freq-penalty')?.value);
        const maxTok = parseInt(document.getElementById('cap-max-tokens')?.value ?? '-1');
        const tools = document.getElementById('cap-supports-tools')?.checked || false;
        const thinking = document.getElementById('cap-supports-thinking')?.checked || false;
        const vision = document.getElementById('cap-supports-vision')?.checked || false;
        const pStyle = document.getElementById('cap-prompt-style')?.value || 'default';
        const notes = document.getElementById('cap-notes')?.value?.trim() || '';

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
     * @private
     * @param {Object} char - Character data with optional voice_sample_path
     * @returns {string} HTML string for the voice clone section
     */
    _renderVoiceCloneSection(char) {
        const hasVoice = !!char.voice_sample_path;
        return `
            <div class="persona-field" style="border-top:1px solid var(--glass-border); padding-top:16px; margin-top:8px;">
                <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Voice Clone</label>
                <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:8px;">Upload a voice sample (.wav, .mp3) for XTTS voice cloning. 5-30 seconds of clear speech works best.</div>
                <div id="persona-voice-clone" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    ${hasVoice ? `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(57,255,20,0.06); border:1px solid rgba(57,255,20,0.2); border-radius:8px; flex:1; min-width:200px;">
                            <span style="color:var(--neon-green); font-size:0.8rem;">&#x2714;</span>
                            <span style="color:var(--text-main); font-size:0.78rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this._escapeHtml(char.voice_sample_path.split('/').pop())}</span>
                            <button id="btn-voice-play" style="padding:4px 10px; border:1px solid rgba(0,240,255,0.2); background:transparent; color:var(--neon-cyan); border-radius:4px; cursor:pointer; font-size:0.7rem;" title="Preview">&#x25B6;</button>
                            <button id="btn-voice-delete" style="padding:4px 10px; border:1px solid rgba(255,0,80,0.2); background:transparent; color:var(--neon-magenta); border-radius:4px; cursor:pointer; font-size:0.7rem;" title="Remove">&#x2715;</button>
                        </div>
                    ` : `
                        <div style="padding:8px 12px; color:var(--text-muted); font-size:0.75rem; flex:1;">No voice sample uploaded.</div>
                    `}
                    <button id="btn-voice-upload" class="btn" style="padding:8px 16px; background:rgba(0,240,255,0.08); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:6px; cursor:pointer; font-size:0.75rem; white-space:nowrap;">
                        ${hasVoice ? 'REPLACE' : '+ UPLOAD SAMPLE'}
                    </button>
                </div>
                <audio id="voice-preview-audio" style="display:none;"></audio>
            </div>
        `;
    }

    /**
     * Render the vocabulary categories multi-select for per-character vocab filtering.
     *
     * Fetches available categories from backend and renders checkboxes.
     * Selected categories are stored in the character's vocab_categories field.
     *
     * @param {Object} char - Character data with optional vocab_categories array
     * @returns {string} HTML string for the vocab categories section
     * @private
     */
    _renderVocabCategoriesSection(char) {
        const selected = char.vocab_categories || [];
        return `
            <div class="persona-field" style="border-top:1px solid var(--glass-border); padding-top:16px; margin-top:8px;">
                <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Vocab Categories</label>
                <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:8px;">Select which vocabulary categories this character should use. Leave empty for all categories.</div>
                <div id="persona-vocab-cats" style="display:flex; flex-wrap:wrap; gap:6px; max-height:120px; overflow-y:auto; padding:8px; border:1px solid var(--glass-border); border-radius:8px; background:rgba(0,0,0,0.2);">
                    <span style="color:var(--text-muted); font-size:0.75rem;">Loading categories...</span>
                </div>
            </div>
        `;
    }

    /**
     * Load vocab categories from backend and populate the checkbox grid.
     * Called from _renderEditMode after DOM is ready.
     * @param {string[]} selected - Currently selected category names
     * @private
     */
    async _loadVocabCategories(selected = []) {
        const container = document.getElementById('persona-vocab-cats');
        if (!container) return;

        try {
            const res = await fetch('/api/vocab/categories');
            const data = await res.json();
            const categories = data.categories || [];

            if (categories.length === 0) {
                container.innerHTML = '<span style="color:var(--text-muted); font-size:0.75rem;">No vocab categories available.</span>';
                return;
            }

            container.innerHTML = categories.map(cat => {
                const checked = selected.includes(cat) ? 'checked' : '';
                return `
                    <label style="display:flex; align-items:center; gap:4px; padding:3px 8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:4px; cursor:pointer; font-size:0.72rem; color:var(--text-secondary);">
                        <input type="checkbox" class="vocab-cat-checkbox" value="${cat}" ${checked}
                               style="accent-color:var(--neon-cyan);">
                        ${cat}
                    </label>
                `;
            }).join('');
        } catch (err) {
            console.warn('[PersonaCreator] Failed to load vocab categories:', err);
            container.innerHTML = '<span style="color:var(--text-muted); font-size:0.75rem;">Failed to load categories.</span>';
        }
    }

    /**
     * Get the currently selected vocab categories from the checkbox grid.
     * @returns {string[]} Selected category names
     * @private
     */
    _getSelectedVocabCategories() {
        const checkboxes = document.querySelectorAll('.vocab-cat-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    /**
     * Bind voice clone event handlers after the form is rendered.
     * Called from _renderEditMode after DOM is ready.
     * @private
     */
    _bindVoiceCloneEvents() {
        if (!this.editingCharId) return;

        const playBtn = document.getElementById('btn-voice-play');
        if (playBtn) {
            playBtn.onclick = () => this._playVoiceSample();
        }

        const deleteBtn = document.getElementById('btn-voice-delete');
        if (deleteBtn) {
            deleteBtn.onclick = () => this._deleteVoiceSample();
        }

        const uploadBtn = document.getElementById('btn-voice-upload');
        if (uploadBtn) {
            uploadBtn.onclick = () => this._uploadVoiceSample();
        }
    }

    /**
     * Preview the uploaded voice sample via the hidden audio element.
     * @private
     */
    _playVoiceSample() {
        const char = state.state.characters.find(c => c.id == this.editingCharId);
        if (!char?.voice_sample_path) return;

        const audio = document.getElementById('voice-preview-audio');
        if (!audio) return;

        // Toggle play/pause
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            const btn = document.getElementById('btn-voice-play');
            if (btn) btn.innerHTML = '&#x25B6;';
            return;
        }

        audio.src = char.voice_sample_path;
        audio.play().catch(() => toast.error('Failed to play audio', 2000));
        const btn = document.getElementById('btn-voice-play');
        if (btn) btn.innerHTML = '&#x23F8;';

        audio.onended = () => {
            if (btn) btn.innerHTML = '&#x25B6;';
        };
    }

    /**
     * Upload a new voice sample for the current character.
     * Uses POST /api/characters/{id}/voice-sample endpoint.
     * @private
     */
    async _uploadVoiceSample() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.wav,.mp3,.ogg,.flac,audio/wav,audio/mpeg,audio/ogg,audio/flac';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            if (file.size > 50 * 1024 * 1024) {
                toast.error('Audio file too large (max 50MB)', 3000);
                input.remove();
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                toast.info('Uploading voice sample...', 2000);
                const result = await API.upload(`characters/${this.editingCharId}/voice-sample`, formData);
                if (result.ok) {
                    toast.success('Voice sample uploaded!', 2000);
                    // Refresh character data and re-render
                    await state.loadCharacters();
                    const char = state.state.characters.find(c => c.id == this.editingCharId);
                    if (char) this._renderEditMode(char);
                }
            } catch (err) {
                toast.error(`Upload failed: ${err.message}`, 5000);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    /**
     * Delete the voice sample for the current character.
     * Uses DELETE /api/characters/{id}/voice-sample endpoint.
     * @private
     */
    async _deleteVoiceSample() {
        if (!confirm('Remove voice sample? TTS will use default voice.')) return;

        try {
            await API.delete(`characters/${this.editingCharId}/voice-sample`);
            toast.success('Voice sample removed', 2000);
            // Refresh and re-render
            await state.loadCharacters();
            const char = state.state.characters.find(c => c.id == this.editingCharId);
            if (char) this._renderEditMode(char);
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`, 3000);
        }
    }

    /**
     * Render the Knowledge Base section for edit mode.
     * Shows uploaded docs and upload button for character-specific RAG.
     * @private
     * @returns {string} HTML string for the knowledge base section
     */
    _renderKnowledgeBaseSection() {
        return `
            <div class="persona-field" style="border-top:1px solid var(--glass-border); padding-top:16px; margin-top:8px;">
                <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Knowledge Base</label>
                <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:8px;">Upload .txt or .md files to give this character specialized knowledge.</div>
                <div id="persona-kb-list" style="margin-bottom:8px;">
                    <div style="padding:8px; color:var(--text-muted); font-size:0.75rem;">Loading docs...</div>
                </div>
                <button id="btn-kb-upload" class="btn" style="padding:8px 16px; background:rgba(0,240,255,0.08); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:6px; cursor:pointer; font-size:0.75rem;">+ UPLOAD DOCUMENT</button>
            </div>
        `;
    }

    /**
     * Load and render knowledge base docs after the form is rendered.
     * @private
     */
    async _loadKnowledgeDocs() {
        if (!this.editingCharId) return;

        const list = document.getElementById('persona-kb-list');
        if (!list) return;

        try {
            const data = await API.get(`characters/${this.editingCharId}/docs`);
            const docs = data.docs || [];

            if (docs.length === 0) {
                list.innerHTML = '<div style="padding:8px; color:var(--text-muted); font-size:0.75rem;">No documents uploaded yet.</div>';
            } else {
                list.innerHTML = docs.map(doc => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.78rem;">
                        <span style="color:var(--text-main);">${this._escapeHtml(doc.filename)} <span style="color:var(--text-muted); font-size:0.65rem;">(${doc.chunk_count} chunks)</span></span>
                        <button class="kb-delete-btn" data-doc-id="${doc.id}" style="padding:2px 8px; border:1px solid rgba(255,0,80,0.2); background:transparent; color:var(--neon-magenta); border-radius:4px; cursor:pointer; font-size:0.65rem;">DELETE</button>
                    </div>
                `).join('');

                // Bind delete buttons
                list.querySelectorAll('.kb-delete-btn').forEach(btn => {
                    btn.onclick = async () => {
                        const docId = btn.dataset.docId;
                        try {
                            await API.delete(`characters/${this.editingCharId}/docs/${docId}`);
                            toast.success('Document deleted', 2000);
                            this._loadKnowledgeDocs();
                        } catch (err) {
                            toast.error(`Delete failed: ${err.message}`, 3000);
                        }
                    };
                });
            }
        } catch (err) {
            list.innerHTML = `<div style="padding:8px; color:var(--neon-magenta); font-size:0.75rem;">Failed to load docs</div>`;
        }

        // Bind upload button
        const uploadBtn = document.getElementById('btn-kb-upload');
        if (uploadBtn) {
            uploadBtn.onclick = () => this._uploadKnowledgeDoc();
        }
    }

    /**
     * Open file picker and upload a knowledge document.
     * @private
     */
    async _uploadKnowledgeDoc() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.md,.text';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                toast.error('File too large (max 5MB)', 3000);
                input.remove();
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                toast.info('Uploading document...', 2000);
                const result = await API.upload(`characters/${this.editingCharId}/docs`, formData);
                if (result.ok) {
                    toast.success(`Uploaded! ${result.chunk_count} chunks indexed.`, 3000);
                    this._loadKnowledgeDocs();
                }
            } catch (err) {
                toast.error(`Upload failed: ${err.message}`, 5000);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    /**
     * Save the persona (create or update).
     * @private
     */
    async _save() {
        const name = document.getElementById('persona-name').value.trim();
        const prompt = document.getElementById('persona-prompt').value.trim();
        const traitsStr = document.getElementById('persona-traits').value.trim();
        const voiceId = document.getElementById('persona-voice').value.trim();
        const greeting = document.getElementById('persona-greeting')?.value.trim() || '';
        const greetingAnim = document.getElementById('persona-greeting-anim')?.value || '';
        const llmEndpoint = document.getElementById('persona-llm-endpoint')?.value.trim() || '';
        const llmModel = document.getElementById('persona-llm-model')?.value.trim() || '';

        if (!name) {
            toast.error('Name is required', 3000);
            return;
        }
        if (!prompt) {
            toast.error('Personality prompt is required', 3000);
            return;
        }
        if (prompt.length > 5000) {
            toast.error('Prompt too long (max 5000 chars)', 3000);
            return;
        }

        const traits = traitsStr ? traitsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

        // Per-character temperature: 0 means "use global" → send null to backend (#3)
        const llmTempRaw = parseFloat(document.getElementById('persona-llm-temperature')?.value || '0');
        const llmTemperature = llmTempRaw > 0 ? llmTempRaw : null;

        // Phase 9: Collect capability profile from the capabilities section
        const capProfile = this._collectCapabilityProfile();

        const payload = {
            name,
            system_prompt: prompt,
            personality_traits: traits,
            voice_id: voiceId || `${name.toLowerCase().replace(/\s+/g, '_')}_v1`,
            avatar_url: this.selectedAvatar || '',
            greeting_text: greeting,
            greeting_animation: greetingAnim,
            vocab_categories: JSON.stringify(this._getSelectedVocabCategories()),
            llm_endpoint: llmEndpoint,
            llm_model: llmModel,
            llm_temperature: llmTemperature,
            capability_profile: capProfile,
        };

        const saveBtn = document.getElementById('btn-persona-save');
        saveBtn.textContent = 'SAVING...';
        saveBtn.disabled = true;

        try {
            if (this.editingCharId) {
                await API.put(`characters/${this.editingCharId}`, payload);
                toast.success(`${name} updated!`, 2000);
            } else {
                await API.post('characters', payload);
                toast.success(`${name} created!`, 2000);
            }

            // Reload characters to reflect changes
            await state.loadCharacters();
            this.close();
        } catch (err) {
            toast.error(`Failed to save: ${err.message}`, 5000);
        } finally {
            saveBtn.textContent = this.editingCharId ? 'SAVE CHANGES' : 'CREATE ENTITY';
            saveBtn.disabled = false;
        }
    }

    /**
     * Escape HTML special characters to prevent XSS.
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

    /**
     * Open a file picker and import a character from a JSON file.
     * Uses the POST /api/characters/import endpoint.
     * @private
     */
    _importCharacter() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.name || !data.system_prompt) {
                    toast.error('Invalid character file (missing name or system_prompt)', 3000);
                    return;
                }

                toast.info(`Importing ${data.name}...`, 2000);
                const result = await API.post('characters/import', data);
                if (result.ok) {
                    toast.success(`${result.name} imported!`, 2000);
                    await state.loadCharacters();
                    this.close();
                }
            } catch (err) {
                toast.error(`Import failed: ${err.message}`, 5000);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    // ── Phase 8A: Expression Pack ─────────────────────────────────────────────

    /**
     * Initialize the expression pack section in edit mode.
     * Checks whether AI art is available, renders existing portraits,
     * and wires the "Generate All Expressions" button.
     *
     * @private
     * @param {Object} char - Character object with id, name, expr_portraits fields.
     */
    async _initExpressionPackSection(char) {
        const statusEl = document.getElementById('expr-pack-status');
        const genBtn = document.getElementById('btn-generate-expressions');
        const previewEl = document.getElementById('expr-portraits-preview');
        if (!genBtn) return;

        // Check AI art availability
        try {
            const res = await fetch('/api/image-gen/status');
            const data = await res.json();
            if (!data.available) {
                if (statusEl) statusEl.textContent = `(${data.provider === 'disabled' ? 'disabled — enable in Settings → AI ART' : data.provider + ' offline'})`;
                genBtn.disabled = true;
                genBtn.style.opacity = '0.4';
            } else {
                if (statusEl) statusEl.textContent = `(${data.provider}: ${data.model || 'ready'})`;
            }
        } catch {
            if (statusEl) statusEl.textContent = '(AI art unavailable)';
            genBtn.disabled = true;
            genBtn.style.opacity = '0.4';
        }

        // Render existing expression portraits as thumbnails
        if (previewEl) {
            let portraits = char.expr_portraits || {};
            if (typeof portraits === 'string') {
                try { portraits = JSON.parse(portraits); } catch { portraits = {}; }
            }
            Object.entries(portraits).forEach(([emotion, url]) => {
                const thumb = document.createElement('div');
                thumb.title = emotion;
                thumb.style.cssText = `
                    width:48px; height:60px; border-radius:6px; overflow:hidden;
                    border:1px solid var(--glass-border); position:relative; flex-shrink:0;
                `;
                thumb.innerHTML = `
                    <img src="${url}" style="width:100%; height:100%; object-fit:cover; object-position:top;">
                    <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7);
                                font-size:0.55rem; text-align:center; padding:2px; color:#ccc;">
                        ${emotion}
                    </div>
                `;
                previewEl.appendChild(thumb);
            });
        }

        // Wire Generate button
        genBtn.onclick = () => this._generateExpressions(char);
    }

    /**
     * Trigger batch AI expression portrait generation for a character.
     * Calls POST /api/image-gen/expressions/{char_id} and shows progress.
     *
     * @private
     * @param {Object} char - Character object with id and name.
     */
    async _generateExpressions(char) {
        const btn = document.getElementById('btn-generate-expressions');
        const statusEl = document.getElementById('expr-gen-status');
        const previewEl = document.getElementById('expr-portraits-preview');
        if (!btn) return;

        btn.disabled = true;
        btn.textContent = '⚡ Generating... (takes ~30s)';
        if (statusEl) statusEl.textContent = 'Starting generation...';

        try {
            const res = await fetch(`/api/image-gen/expressions/${char.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();

            if (data.ok && data.portraits) {
                const count = Object.keys(data.portraits).length;
                btn.textContent = `✅ Generated ${count} portraits!`;
                if (statusEl) statusEl.textContent = data.errors?.length ? `(${data.errors.length} failed)` : '';

                // Update thumbnail preview
                if (previewEl) {
                    previewEl.innerHTML = '';
                    Object.entries(data.portraits).forEach(([emotion, url]) => {
                        const thumb = document.createElement('div');
                        thumb.title = emotion;
                        thumb.style.cssText = `width:48px; height:60px; border-radius:6px; overflow:hidden; border:1px solid var(--neon-purple,#9d50ff); flex-shrink:0; position:relative;`;
                        thumb.innerHTML = `
                            <img src="${url}" style="width:100%; height:100%; object-fit:cover; object-position:top;">
                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); font-size:0.55rem; text-align:center; padding:2px; color:#ccc;">${emotion}</div>
                        `;
                        previewEl.appendChild(thumb);
                    });
                }

                toast.success(`Generated ${count} expression portraits for ${char.name}!`);
                // Refresh character data so expr_portraits is current in state
                await state.loadCharacters();
            } else {
                btn.textContent = '❌ Generation failed';
                btn.disabled = false;
                if (statusEl) statusEl.textContent = data.errors?.[0] || data.error || 'Unknown error';
                toast.error('Expression generation failed');
            }
        } catch (err) {
            btn.textContent = '❌ Error';
            btn.disabled = false;
            if (statusEl) statusEl.textContent = err.message;
            toast.error(`Expression generation error: ${err.message}`, 5000);
        }
    }
}
