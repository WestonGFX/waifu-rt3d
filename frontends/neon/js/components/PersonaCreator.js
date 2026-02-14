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

        // Expose globally for CharacterGrid's "NEW ENTITY" button
        window.openPersonaCreator = (charId) => this.open(charId);
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
            <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">
                Start with a template or build from scratch.
            </p>
            <div class="persona-template-grid"></div>
        `;

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
                        <span id="prompt-char-count">${prompt.length}</span>/5000 chars
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

                ${isEdit ? this._renderVoiceCloneSection(tpl) : ''}

                <div id="persona-avatar-section" class="persona-field">
                    <label style="color:var(--text-main); font-weight:600; display:block; margin-bottom:4px;">Avatar</label>
                    <div id="persona-avatar-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(60px, 1fr)); gap:8px; max-height:200px; overflow-y:auto; padding:8px; border:1px solid var(--glass-border); border-radius:8px; background:rgba(0,0,0,0.2);">
                        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.75rem; grid-column:1/-1;">Loading avatars...</div>
                    </div>
                </div>

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
        promptEl.oninput = () => {
            charCount.textContent = promptEl.value.length;
        };

        const backBtn = document.getElementById('btn-persona-back');
        if (backBtn) backBtn.onclick = () => this._renderTemplateStep();

        document.getElementById('btn-persona-save').onclick = () => this._save();

        // Load avatars
        this._loadAvatarGrid(tpl.avatar_2d_url || tpl.avatar_url);
    }

    /**
     * Render edit mode for an existing character.
     * Also loads the knowledge base docs after rendering.
     * @private
     * @param {Object} char - Character data from state
     */
    _renderEditMode(char) {
        this._renderFormStep(char);
        // Bind voice clone + knowledge doc handlers after DOM is ready
        requestAnimationFrame(() => {
            this._bindVoiceCloneEvents();
            this._loadKnowledgeDocs();
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

            avatars.forEach(img => {
                const item = document.createElement('div');
                const isSelected = selectedUrl && (selectedUrl === img.url || selectedUrl.includes(img.file));
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
     * Render the Voice Clone section for edit mode.
     * Shows upload/playback/delete for character voice samples used by XTTS.
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

        const payload = {
            name,
            system_prompt: prompt,
            personality_traits: traits,
            voice_id: voiceId || `${name.toLowerCase().replace(/\s+/g, '_')}_v1`,
            avatar_url: this.selectedAvatar || '',
            greeting_text: greeting,
            greeting_animation: greetingAnim,
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
}
