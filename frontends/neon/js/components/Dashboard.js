import { state } from '../core/StateManager.js';

export class Dashboard {
    constructor() {
        this.layout = document.querySelector('.app-layout');
        this.sidebar = document.querySelector('.sidebar');
        this.toggleBtn = document.getElementById('sidebar-toggle');
        
        this.bindEvents();
    }

    bindEvents() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggleSidebar());
        }
    }

    toggleSidebar() {
        this.layout.classList.toggle('sidebar-collapsed');
        // Optional: Save preference to localStorage or State
        const isCollapsed = this.layout.classList.contains('sidebar-collapsed');
        this.toggleBtn.innerText = isCollapsed ? '>>' : '<<';
    }
}
