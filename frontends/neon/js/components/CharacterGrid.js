import { state } from '../core/StateManager.js';
import { bus } from '../core/EventBus.js';

export class CharacterGrid {
    constructor() {
        this.container = document.getElementById('roster-panel-content');
        bus.on('characters:updated', (chars) => this.render(chars));
        bus.on('character:selected', (char) => this.highlight(char));
    }

    render(characters) {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.className = 'character-grid-container'; // CSS Grid class

        // 1. Add "Create New" Button
        const createCard = document.createElement('div');
        createCard.className = 'char-card glass-panel create-new';
        createCard.style.cssText = `
            display: flex; 
            align-items: center; 
            justify-content: center; 
            cursor: pointer;
            border: 1px dashed var(--neon-cyan);
            opacity: 0.8;
            transition: all 0.2s;
        `;
        createCard.innerHTML = `
            <div style="text-align: center; color: var(--neon-cyan);">
                <div style="font-size: 2rem; margin-bottom: 5px;">+</div>
                <div style="font-family: var(--font-display); font-size: 0.9rem;">NEW ENTITY</div>
            </div>
        `;
        createCard.onclick = () => window.openSettings('character');
        createCard.onmouseenter = () => createCard.style.opacity = '1';
        createCard.onmouseleave = () => createCard.style.opacity = '0.8';
        this.container.appendChild(createCard);

        if (!characters || characters.length === 0) {
            // No characters message (but keep create button)
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
            card.className = 'char-card glass-panel';
            card.dataset.id = char.id;

            // Use avatar_url if specifically set, otherwise try pixel portrait by convention
            let imgSrc = char.avatar_url;

            // If no specific avatar or it's default, use the mounted images path
            // We know the pattern is /images/{name}_pixel_portrait.png based on scan
            if (!imgSrc || imgSrc === 'default' || imgSrc.includes('default') || imgSrc.endsWith('.vrm')) {
                const cleanName = char.name.toLowerCase().split(' ')[0]; // First name only for file matching
                imgSrc = `/images/${cleanName}_pixel_portrait.png`;
            }

            // Fallback to text if img fails (handled via onerror)
            card.innerHTML = `
                <div class="card-thumb" style="background-image: url('${imgSrc}'), linear-gradient(45deg, #111, #222);">
                    <div class="card-overlay">
                        <div class="card-name">${char.name}</div>
                    </div>
                </div>
            `;

            card.onclick = () => {
                if (document.startViewTransition) {
                    document.startViewTransition(() => {
                        state.selectCharacter(char.id)
                    });
                } else {
                    state.selectCharacter(char.id);
                }
            };
            this.container.appendChild(card);
        });
    }

    highlight(activeChar) {
        const cards = this.container.querySelectorAll('.char-card');
        cards.forEach(c => c.classList.remove('active'));

        const active = this.container.querySelector(`.char-card[data-id="${activeChar.id}"]`);
        if (active) active.classList.add('active');
    }


    getSlug(name) {
        // Mapping legacy names to our new assets
        const n = name.toLowerCase();

        // Specific Mappings
        if (n.includes('fox') || n.includes('rin')) return 'fox';
        if (n.includes('robot') || n.includes('mech')) return 'robot';
        if (n.includes('anime') || n.includes('hacker') || n.includes('raine')) return 'anime';

        // New Mappings (using existing assets or placeholders for now)
        if (n.includes('nyx') || n.includes('kuudere')) return 'robot'; // Temp mapping until asset gen
        if (n.includes('kitsune') || n.includes('genki')) return 'fox';
        if (n.includes('seraph') || n.includes('onee')) return 'anime';
        if (n.includes('viper') || n.includes('goth')) return 'anime';

        return 'anime'; // Default fallback instead of null
    }
}
