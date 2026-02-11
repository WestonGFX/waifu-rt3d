import { state } from '../core/StateManager.js';

export class Dashboard {
    constructor() {
        this.grid = document.querySelector('.bento-grid');
        this.leftPanel = document.getElementById('panel-left');
        this.rightPanel = document.getElementById('panel-right');
        
        this.bindEvents();
        this.initTelemetry();
    }

    bindEvents() {
        // Toggle Buttons
        const leftBtn = document.getElementById('btn-toggle-left');
        const rightBtn = document.getElementById('btn-toggle-right');
        const configBtn = document.getElementById('btn-system-config');

        if (leftBtn) leftBtn.addEventListener('click', () => this.toggleSidebar());
        if (rightBtn) rightBtn.addEventListener('click', () => this.toggleRightPanel());
        if (configBtn) configBtn.addEventListener('click', () => window.openSettings());
    }

    toggleSidebar() {
        if (this.grid) {
            this.grid.classList.toggle('left-collapsed');
        }
    }

    toggleRightPanel() {
        if (this.grid) {
            this.grid.classList.toggle('right-open');
        }
    }

    // --- TELEMETRY ---

    initTelemetry() {
        this.startTelemetryLoop();
    }

    async startTelemetryLoop() {
        const loadEl = document.getElementById('stat-load');
        const vramEl = document.getElementById('stat-vram');
        const pingEl = document.getElementById('stat-ping');

        this.updateStats(loadEl, vramEl, pingEl);
        setInterval(() => this.updateStats(loadEl, vramEl, pingEl), 2000);
    }

    async updateStats(loadEl, vramEl, pingEl) {
        if (!loadEl) return;
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();

            loadEl.innerText = data.cpu + '%';
            if (data.cpu > 80) loadEl.classList.add('crit');
            else loadEl.classList.remove('crit');

            vramEl.innerText = data.memory + 'GB';
            pingEl.innerText = data.ping + 'ms';
        } catch (e) {
            // Silently fail — stats are non-critical
        }
    }
}
