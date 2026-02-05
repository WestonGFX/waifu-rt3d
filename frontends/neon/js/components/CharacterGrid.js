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

        if (characters.length === 0) {
            this.container.innerHTML = '<div style="padding:20px; color:var(--text-muted)">No characters online.</div>';
            return;
        }

        characters.forEach(char => {
            const card = document.createElement('div');
            card.className = 'char-card glass-panel';
            card.dataset.id = char.id;

            // Map character name to folder (simple slugify)
            const slug = this.getSlug(char.name);
            if (!slug) return; // Skip invalid/legacy characters

            const imgSrc = `assets/img/characters/${slug}/thumb.png`;

            // Fallback to text if img fails (handled via onerror)
            card.innerHTML = `
                <div class="card-thumb" style="background-image: url('${imgSrc}'), linear-gradient(45deg, #111, #222);">
                    <div class="card-overlay">
                        <div class="card-name">${char.name}</div>
                        <div class="card-role">LVL 1 ENTITY</div>
                    </div>
                </div>
            `;

            card.onclick = () => state.selectCharacter(char.id);
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
