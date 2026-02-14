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
        bus.on('characters:updated', (chars) => this.render(chars));
        bus.on('character:selected', (char) => this.highlight(char));
    }

    /**
     * Render the character grid with all character cards.
     * @param {Array<Object>} characters - Array of character objects from state
     */
    render(characters) {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.className = 'character-grid-container'; // CSS Grid class

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
            if (window.openPersonaCreator) {
                window.openPersonaCreator();
            } else {
                window.openSettings('character');
            }
        };
        createCard.onmouseenter = () => createCard.style.opacity = '1';
        createCard.onmouseleave = () => createCard.style.opacity = '0.8';
        this.container.appendChild(createCard);

        // Import button card
        const importCard = document.createElement('div');
        importCard.className = 'char-card create-new';
        importCard.style.cssText = 'border: 1px dashed var(--neon-magenta); opacity: 0.7; transition: all 0.2s;';
        importCard.innerHTML = `
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                <div style="text-align: center; color: var(--neon-magenta);">
                    <div style="font-size: 1.2rem; line-height: 1;">&#x2B06;</div>
                    <div style="font-family: var(--font-display); font-size: 0.6rem; margin-top: 2px;">IMPORT</div>
                </div>
            </div>
        `;
        importCard.onclick = () => this._importCharacter();
        importCard.onmouseenter = () => importCard.style.opacity = '1';
        importCard.onmouseleave = () => importCard.style.opacity = '0.7';
        this.container.appendChild(importCard);

        if (!characters || characters.length === 0) {
            const msg = document.createElement('div');
            msg.style.padding = '20px';
            msg.style.color = 'var(--text-muted)';
            msg.innerText = 'No entities found.';
            this.container.appendChild(msg);
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

            // Bind card click → select character (ignore clicks on action buttons)
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.card-action-btn')) return;

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
                    if (window.openPersonaCreator) {
                        window.openPersonaCreator(char.id);
                    }
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

            this.container.appendChild(card);
        });
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
}
