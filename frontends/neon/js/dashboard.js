/**
 * dashboard.js
 * Manages the main application layout (Grid/Dashboard).
 */

export class Dashboard {
    constructor() {
        this.container = document.getElementById('app-dashboard');
        this.panels = {};
        this.init();
    }

    init() {
        console.log("Dashboard initialized");
        this.setupResizers();
    }

    setupResizers() {
        // Simple toggle for sidebar
        const sidebar = document.querySelector('.left-panel');
        if (!sidebar) return;

        // Add toggle button to header
        const header = sidebar.querySelector('.panel-header');
        if (header) {
            // Check if already exists to avoid dupes
            if (header.querySelector('.sidebar-toggle')) return;

            const toggle = document.createElement('button');
            toggle.innerHTML = '<<';
            toggle.className = 'btn-icon-small sidebar-toggle';
            toggle.style.marginLeft = 'auto'; // Push to right
            toggle.onclick = () => this.togglePanel('left-panel');
            header.appendChild(toggle);
        }
    }

    togglePanel(type) {
        if (type === 'left-panel') {
            const sidebar = document.querySelector('.left-panel');
            const grid = document.getElementById('app-dashboard');

            if (sidebar.style.display === 'none') {
                sidebar.style.display = 'flex';
                // Restore grid
                grid.style.gridTemplateColumns = '280px 1fr';
                const toggle = sidebar.querySelector('.sidebar-toggle');
                if (toggle) toggle.innerText = '<<';
            } else {
                sidebar.style.display = 'none';
                // Collapse grid
                grid.style.gridTemplateColumns = '0px 1fr';

                // We need a way to bring it back. Using a floating button or similar?
                // For now, let's assume specific UI trigger elsewhere or just simple toggle.
                // Actually, if we hide the sidebar, the button inside it is gone. 
                // We need a trigger in the main panel to open it back up.
                this.addRestoreTrigger();
            }
        }
    }

    addRestoreTrigger() {
        const center = document.querySelector('.center-panel');
        if (!center.querySelector('#sidebar-restore')) {
            const btn = document.createElement('button');
            btn.id = 'sidebar-restore';
            btn.innerText = '>>';
            btn.className = 'btn-icon-small';
            btn.style.position = 'absolute';
            btn.style.top = '10px';
            btn.style.left = '10px';
            btn.style.zIndex = '100';
            btn.style.background = 'var(--p)';
            btn.style.color = '#000';
            btn.onclick = () => {
                this.togglePanel('left-panel');
                btn.remove();
            };
            center.appendChild(btn);
        }
    }
}
