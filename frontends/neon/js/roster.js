
export class RosterUI {
    constructor() {
        this.container = document.getElementById('mini-roster');
        if (!this.container) return;
        this.render();
    }

    async render() {
        if (!window.characterCache || window.characterCache.length === 0) {
            // Retry if cache not ready
            setTimeout(() => this.render(), 1000);
            return;
        }

        this.container.innerHTML = '';
        
        window.characterCache.forEach(char => {
            const circle = document.createElement('div');
            circle.className = 'avatar-circle-btn';
            circle.title = char.name;
            
            // Style
            const size = '32px';
            circle.style.cssText = `
                width: ${size}; height: ${size};
                border-radius: 50%;
                background: linear-gradient(45deg, var(--p), var(--s));
                border: 2px solid ${char.id === window.currentCharacterId ? 'white' : 'transparent'};
                cursor: pointer;
                flex-shrink: 0;
                background-size: cover;
                transition: transform 0.2s;
            `;
            
            if (char.avatar_url && (char.avatar_url.endsWith('.png') || char.avatar_url.endsWith('.jpg'))) {
                 // If we had image support. Currently avatar_url is VRM.
                 // We can't display VRM as image easily without a thumb.
                 // We'll use initials.
            }
            
            circle.innerHTML = `<span style="display:flex; justify-content:center; align-items:center; height:100%; color:black; font-weight:bold; font-size:0.6rem;">${char.name.substring(0,2).toUpperCase()}</span>`;
            
            circle.onclick = () => {
                window.currentCharacterId = char.id;
                window.initAvatar(); // Reload generic avatar function
                this.render(); // Re-render to update border
                showToast(`Switched to ${char.name}`, 'success');
            };
            
            this.container.appendChild(circle);
        });
        
        // Add "Add" button
        const addBtn = document.createElement('div');
        addBtn.style.cssText = `
            width: 32px; height: 32px; border-radius: 50%;
            border: 1px dashed var(--text-muted);
            display:flex; justify-content:center; align-items:center;
            cursor:pointer; flex-shrink:0; color:var(--text-muted);
        `;
        addBtn.innerHTML = '+';
        addBtn.onclick = () => {
            if(window.charUI) window.charUI.open();
        };
        this.container.appendChild(addBtn);
    }
}
