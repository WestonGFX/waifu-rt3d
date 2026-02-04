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
        // Initial setup if we want to support drag/drop later.
        // For now, we enforce the grid structure defined in CSS.
        console.log("Dashboard initialized");
        this.setupResizers();
    }

    setupResizers() {
        // Find resizer handles and attach logic
        // Only simpler splitter logic for now: Sidebar vs Main content
    }
    
    togglePanel(id) {
        const el = document.getElementById(id);
        if(el) {
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }
    }
}
