/**
 * CharacterGrid.js
 * Renders character cards in the left sidebar with selection, edit, and delete actions.
 *
 * Features:
 * - 2-column grid of character avatar cards
 * - Click to select/switch active character
 * - Hover reveals gear (edit) and X (delete) action icons
 * - "NEW" card opens PersonaCreator
 * - Deduplicates characters by ID
 *
 * @example
 * const grid = new CharacterGrid();
 * // Listens to 'characters:updated' and 'character:selected' events
 */
import { state } from '../core/StateManager.js';
import { bus } from '../core/EventBus.js';
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';

export class CharacterGrid {
    constructor() {
        this.container = document.getElementById('roster-panel-content');
        /** @type {Set<number>} Multi-select character IDs */
        this.multiSelected = new Set();
        bus.on('characters:updated', (chars) => this.render(chars));
        bus.on('character:selected', (char) => this.highlight(char));
    }

    /**
     * Get the currently multi-selected character IDs.
     * @returns {number[]} Array of selected character IDs
     */
    getMultiSelected() {
        return Array.from(this.multiSelected);
    }

    /**
     * Clear multi-selection state and update visual indicators.
     */
    clearMultiSelect() {
        this.multiSelected.clear();
        this.container?.querySelectorAll('.char-card').forEach(c => {
            c.classList.remove('multi-selected');
        });
        this._updateMultiSelectBanner();
    }

    /**
     * Render the character grid with all character cards.
     * @param {Array<Object>} characters - Array of character objects from state
     */
    render(characters) {
        if (!this.container) return;
        this.container.className = 'character-grid-container'; // CSS Grid class

        // Reconcile: build new content in a DocumentFragment, then swap once
        // to avoid mid-render repaint flash from innerHTML = '' + slow append loop
        const frag = document.createDocumentFragment();

        // 1. Add "Create New" Button
        const createCard = document.createElement('div');
        createCard.className = 'char-card create-new';
        createCard.style.cssText = `border: 1px dashed var(--neon-cyan); opacity: 0.8; transition: all 0.2s;`;
        createCard.innerHTML = `
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                <div style="text-align: center; color: var(--neon-cyan);">
                    <div style="font-size: 1.5rem; line-height: 1;">+</div>
                    <div style="font-family: var(--font-display); font-size: 0.65rem; margin-top: 2px;">NEW</div>
                </div>
            </div>
        `;
        createCard.onclick = () => {
            window.location.hash = '#create-waifu';
        };
        createCard.onmouseenter = () => createCard.style.opacity = '1';
        createCard.onmouseleave = () => createCard.style.opacity = '0.8';
        frag.appendChild(createCard);

        if (!characters || characters.length === 0) {
            const msg = document.createElement('div');
            msg.style.padding = '20px';
            msg.style.color = 'var(--text-muted)';
            msg.innerText = 'No entities found.';
            frag.appendChild(msg);
            this.container.innerHTML = '';
            this.container.appendChild(frag);
            return;
        }

        // Deduplicate characters by ID
        const uniqueChars = new Map();
        characters.forEach(char => uniqueChars.set(char.id, char));

        uniqueChars.forEach(char => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.id = char.id;

            // Prefer avatar_2d_url (new field), fallback to avatar_url, then convention
            let imgSrc = char.avatar_2d_url || char.avatar_url;

            // If no specific avatar or it's default/VRM, use the mounted images path
            if (!imgSrc || imgSrc === 'default' || imgSrc.includes('default') || imgSrc.endsWith('.vrm')) {
                const parenMatch = char.name.match(/\((\w+)\)/);
                const cleanName = parenMatch ? parenMatch[1].toLowerCase() : char.name.toLowerCase().split(' ')[0];
                imgSrc = `/images/${cleanName}_pixel_portrait.png`;
            }

            // Build card HTML with hover action buttons (edit, export, delete)
            const isDefault = char.id === 1;
            card.innerHTML = `
                <div class="card-thumb" style="background-image: url('${imgSrc}'), linear-gradient(45deg, #111, #222);">
                    <div class="card-actions">
                        <button class="card-action-btn card-edit-btn" title="Edit persona" data-edit-id="${char.id}">&#x2699;</button>
                        <button class="card-action-btn card-export-btn" title="Export persona" data-export-id="${char.id}" style="font-size:0.6rem;">&#x2B07;</button>
                        ${!isDefault ? `<button class="card-action-btn card-delete-btn" title="Delete persona" data-delete-id="${char.id}">&#x2715;</button>` : ''}
                    </div>
                    <div class="card-overlay">
                        <div class="card-name">${char.name}</div>
                    </div>
                </div>
            `;

            // Bind card click → select character (Ctrl+click for multi-select)
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.card-action-btn')) return;

                // Ctrl+Click → toggle multi-select
                if (e.ctrlKey || e.metaKey) {
                    if (this.multiSelected.has(char.id)) {
                        this.multiSelected.delete(char.id);
                        card.classList.remove('multi-selected');
                    } else {
                        this.multiSelected.add(char.id);
                        card.classList.add('multi-selected');
                    }
                    this._updateMultiSelectBanner();
                    return;
                }

                // Normal click → single select (clear multi-select)
                if (this.multiSelected.size > 0) {
                    this.clearMultiSelect();
                }

                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';

                try {
                    if (document.startViewTransition) {
                        await document.startViewTransition(async () => {
                            await state.selectCharacter(char.id);
                        }).finished;
                    } else {
                        await state.selectCharacter(char.id);
                    }
                    toast.success(`Switched to ${char.name}`, 2000);
                } catch (err) {
                    console.error('Character switch failed:', err);
                    toast.error(`Failed to switch character: ${err.message}`, 5000);
                } finally {
                    card.style.opacity = '1';
                    card.style.pointerEvents = 'auto';
                }
            });

            // Bind edit button → open PersonaCreator in edit mode
            const editBtn = card.querySelector('.card-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.location.hash = `#edit-waifu/${char.id}`;
                });
            }

            // Bind export button → download character JSON
            const exportBtn = card.querySelector('.card-export-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const data = await API.get(`characters/${char.id}/export`);
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${char.name.replace(/\s+/g, '_')}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        toast.success(`${char.name} exported!`, 2000);
                    } catch (err) {
                        toast.error(`Export failed: ${err.message}`, 3000);
                    }
                });
            }

            // Bind delete button → confirm and delete
            const deleteBtn = card.querySelector('.card-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;

                    try {
                        await API.delete(`characters/${char.id}`);
                        toast.success(`${char.name} deleted`, 2000);
                        await state.loadCharacters();
                    } catch (err) {
                        toast.error(`Delete failed: ${err.message}`, 5000);
                    }
                });
            }

            frag.appendChild(card);
        });

        // Single DOM swap — one repaint instead of N+1
        this.container.innerHTML = '';
        this.container.appendChild(frag);
    }

    /**
     * Highlight the active character card.
     * @param {Object} activeChar - The currently selected character
     */
    highlight(activeChar) {
        const cards = this.container.querySelectorAll('.char-card');
        cards.forEach(c => c.classList.remove('active'));

        const active = this.container.querySelector(`.char-card[data-id="${activeChar.id}"]`);
        if (active) active.classList.add('active');
    }

    /**
     * Open a file picker and import a character from a JSON file.
     * Uses the POST /api/characters/import endpoint.
     * @private
     */
    async _importCharacter() {
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
                }
            } catch (err) {
                toast.error(`Import failed: ${err.message}`, 5000);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    /**
     * Map character name to asset slug for fallback avatars.
     * @param {string} name - Character display name
     * @returns {string} Asset slug identifier
     */
    getSlug(name) {
        const n = name.toLowerCase();

        if (n.includes('fox') || n.includes('rin')) return 'fox';
        if (n.includes('robot') || n.includes('mech')) return 'robot';
        if (n.includes('anime') || n.includes('hacker') || n.includes('raine')) return 'anime';
        if (n.includes('nyx') || n.includes('kuudere')) return 'robot';
        if (n.includes('kitsune') || n.includes('genki')) return 'fox';
        if (n.includes('seraph') || n.includes('onee')) return 'anime';
        if (n.includes('viper') || n.includes('goth')) return 'anime';

        return 'anime';
    }

    /**
     * Update or create the multi-select banner showing selected count and action button.
     * @private
     */
    _updateMultiSelectBanner() {
        let banner = document.getElementById('multi-select-banner');

        if (this.multiSelected.size === 0) {
            if (banner) banner.remove();
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'multi-select-banner';
            banner.style.cssText = `
                padding: 6px 10px; margin: 4px 0;
                background: rgba(0, 240, 255, 0.08);
                border: 1px solid rgba(0, 240, 255, 0.2);
                border-radius: 6px;
                display: flex; align-items: center; justify-content: space-between;
                font-size: 0.7rem; color: var(--neon-cyan);
            `;
            this.container?.parentElement?.insertBefore(banner, this.container);
        }

        const names = [];
        this.multiSelected.forEach(id => {
            const char = state.state.characters?.find(c => c.id === id);
            if (char) names.push(char.name);
        });

        banner.innerHTML = `
            <span>${this.multiSelected.size} selected: ${names.join(', ')}</span>
            <div style="display:flex; gap:4px;">
                <button id="btn-multi-chat" style="padding:3px 8px; background:rgba(0,240,255,0.15); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:4px; cursor:pointer; font-size:0.65rem;">GROUP CHAT</button>
                <button id="btn-multi-clear" style="padding:3px 8px; background:none; border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.65rem;">CLEAR</button>
            </div>
        `;

        banner.querySelector('#btn-multi-clear').onclick = () => this.clearMultiSelect();
        banner.querySelector('#btn-multi-chat').onclick = () => {
            // Emit event for ChatInterface to handle
            bus.emit('multi-chat:start', this.getMultiSelected());
            toast.info(`Group chat with ${this.multiSelected.size} characters — type a message!`, 3000);
        };
    }
}
