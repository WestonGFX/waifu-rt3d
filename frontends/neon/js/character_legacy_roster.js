export class RosterUI {
    constructor() {
        this.container = document.getElementById('roster-panel-content');
        if (!this.container) {
            // Fallback or wait for Dashboard initialization
            console.warn("Roster container not found, waiting...");
        }
        // Listener for character updates
        window.addEventListener('characters-updated', () => this.render());
    }

    async render() {
        this.container = document.getElementById('roster-panel-content');
        if (!this.container) return;

        if (!window.characterCache || window.characterCache.length === 0) {
            this.container.innerHTML = '<div style="padding:20px; color:var(--text-muted);">No characters found.</div>';
            return;
        }

        this.container.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 15px;
            padding: 10px;
        `;

        window.characterCache.forEach(char => {
            const isActive = char.id === window.currentCharacterId;
            const card = document.createElement('div');
            card.className = "roster-card";
            card.style.cssText = `
                background: ${isActive ? 'linear-gradient(135deg, rgba(var(--p-rgb), 0.2), rgba(var(--s-rgb), 0.2))' : 'var(--surface-light)'};
                border: 2px solid ${isActive ? 'var(--p)' : 'var(--border-color)'};
                border-radius: 8px;
                padding: 10px;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                overflow: hidden;
            `;
            
            // Hover effect
            card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)'; };
            card.onmouseleave = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = 'none'; };

            // Avatar Handling
            let avatarHtml = '';
            // Assuming we might have image path in future, currently VRM path is common.
            // Using a generated identicon or generic image for now if no specific image.
            const avatarColor = isActive ? 'var(--p)' : '#555';

            avatarHtml = `
                <div style="width:100%; height:100px; background:${avatarColor}; margin-bottom:8px; border-radius:4px; display:flex; align-items:center; justify-content:center; color:rgba(0,0,0,0.5); font-size:2rem; font-weight:bold;">
                    ${char.name.substring(0, 2).toUpperCase()}
                </div>
            `;
            
            // Description Truncation
            const bio = char.description ? (char.description.length > 50 ? char.description.substring(0, 50) + '...' : char.description) : 'No description.';

            card.innerHTML = `
                ${avatarHtml}
                <div style="font-family:var(--font-primary); font-weight:bold; color:var(--text-main); margin-bottom:4px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${char.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.2; height:2.4em; overflow:hidden;">${bio}</div>
                
                <div style="display:flex; justify-content:space-between; margin-top:8px;">
                     <button class="btn-icon-small" title="Edit" onclick="event.stopPropagation(); window.charUI.edit('${char.id}')">⚙️</button>
                     ${isActive ? '<span style="font-size:0.7rem; color:var(--s);">ACTIVE</span>' : ''}
                </div>
            `;

            card.onclick = () => {
                window.currentCharacterId = char.id;
                window.initAvatar();
                this.render(); // Re-render to update active state
                showToast(`Activated ${char.name}`);
            };

            grid.appendChild(card);
        });

        // Add New Character Card
        const addCard = document.createElement('div');
        addCard.style.cssText = `
            border: 2px dashed var(--text-muted);
            border-radius: 8px;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            cursor:pointer; opacity: 0.6; min-height: 180px;
        `;
        addCard.innerHTML = `<div style="font-size:3rem; color:var(--text-muted);">+</div><div style="font-size:0.8rem; color:var(--text-muted);">NEW</div>`;
        addCard.onclick = () => window.charUI.open();
        grid.appendChild(addCard);

        this.container.appendChild(grid);
    }
}
