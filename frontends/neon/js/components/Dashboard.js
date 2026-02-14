import { state } from '../core/StateManager.js';
import { API } from '../core/API.js';
import { bus } from '../core/EventBus.js';

export class Dashboard {
    constructor() {
        this.grid = document.querySelector('.bento-grid');
        this.leftPanel = document.getElementById('panel-left');
        this.rightPanel = document.getElementById('panel-right');
        this.activeModelInfo = null; // Cached model info from LM Studio

        this.bindEvents();
        this.initTelemetry();
        this._injectRelationshipWidget();
        this._injectEmotionWidget();

        // Refresh relationship data when character changes or after chat
        bus.on('character:selected', () => this.refreshRelationship());
        bus.on('session:selected', () => this.refreshEmotionTimeline());
        bus.on('chat:completed', () => {
            this.refreshRelationship();
            this.refreshEmotionTimeline();
        });
    }

    bindEvents() {
        // Toggle Buttons
        const leftBtn = document.getElementById('btn-toggle-left');
        const rightBtn = document.getElementById('btn-toggle-right');
        const configBtn = document.getElementById('btn-system-config');
        const modelBtn = document.getElementById('btn-model-manager');
        const personaBtn = document.getElementById('btn-new-persona');
        const toggleViewBtn = document.getElementById('btn-toggle-view');

        if (leftBtn) leftBtn.addEventListener('click', () => this.toggleSidebar());
        if (rightBtn) rightBtn.addEventListener('click', () => this.toggleRightPanel());
        if (configBtn) configBtn.addEventListener('click', () => window.openSettings());
        if (modelBtn) modelBtn.addEventListener('click', () => window.openModelManager());
        if (personaBtn) personaBtn.addEventListener('click', () => window.openPersonaCreator());
        if (toggleViewBtn) toggleViewBtn.addEventListener('click', () => this.toggleViewport());
    }

    toggleSidebar() {
        if (this.grid) {
            this.grid.classList.toggle('left-collapsed');
            // Update button text to indicate direction
            const btn = document.getElementById('btn-toggle-left');
            if (btn) {
                btn.innerHTML = this.grid.classList.contains('left-collapsed') ? '&#x00BB;' : '&#x00AB;';
                btn.title = this.grid.classList.contains('left-collapsed') ? 'Show Roster' : 'Hide Roster';
            }
        }
    }

    /**
     * Toggle the 3D viewport visibility in Toggle View layout mode.
     * Updates the button label to reflect current state.
     */
    toggleViewport() {
        const mainView = document.querySelector('.main-view');
        if (!mainView) return;

        mainView.classList.toggle('show-viewport');
        const isShowing = mainView.classList.contains('show-viewport');

        const label = document.getElementById('toggle-view-label');
        const icon = document.getElementById('toggle-view-icon');
        if (label) label.textContent = isShowing ? 'HIDE 3D' : 'SHOW 3D';
        if (icon) icon.innerHTML = isShowing ? '&#x1F4AC;' : '&#x1F441;';
    }

    toggleRightPanel() {
        if (this.grid) {
            this.grid.classList.toggle('right-open');
            // Update button text to indicate direction
            const btn = document.getElementById('btn-toggle-right');
            if (btn) {
                btn.innerHTML = this.grid.classList.contains('right-open') ? '&#x00BB;' : '&#x00AB;';
                btn.title = this.grid.classList.contains('right-open') ? 'Hide Memory Bank' : 'Show Memory Bank';
            }
        }
    }

    // --- TELEMETRY ---

    initTelemetry() {
        this.startTelemetryLoop();
        this.fetchModelInfo(); // Initial model info fetch
        // Refresh model info every 30s (model swaps are infrequent)
        setInterval(() => this.fetchModelInfo(), 30000);
    }

    async startTelemetryLoop() {
        const loadEl = document.getElementById('stat-load');
        const vramEl = document.getElementById('stat-vram');
        const llmTimeEl = document.getElementById('stat-llm-time');

        // Make llmTimeEl globally accessible for ChatInterface
        window.llmTimeEl = llmTimeEl;

        this.updateStats(loadEl, vramEl, llmTimeEl);
        setInterval(() => this.updateStats(loadEl, vramEl, llmTimeEl), 2000);
    }

    async updateStats(loadEl, vramEl, llmTimeEl) {
        if (!loadEl) return;
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();

            loadEl.innerText = data.cpu + '%';
            if (data.cpu > 80) loadEl.classList.add('crit');
            else loadEl.classList.remove('crit');

            vramEl.innerText = data.memory + 'GB';

            // LLM time is set by ChatInterface after each response
            // Just display it here (or show "--" if never set)
            if (!llmTimeEl.innerText || llmTimeEl.innerText === '--') {
                llmTimeEl.innerText = '--';
            }
        } catch (e) {
            // Silently fail — stats are non-critical
        }
    }

    /**
     * Fetch active model info from LM Studio via our proxy endpoint.
     * Populates the MODEL and CTX rows in the telemetry panel and
     * caches the result for SettingsModal auto-detect.
     */
    async fetchModelInfo() {
        try {
            const data = await API.get('lm-studio/models');
            if (!data.ok || !data.active_model) return;

            const model = data.active_model;
            this.activeModelInfo = model;

            // Expose globally so SettingsModal can access it
            window.activeModelInfo = model;

            // Update dashboard display
            const nameEl = document.getElementById('stat-model-name');
            const ctxEl = document.getElementById('stat-model-ctx');
            const nameRow = document.getElementById('model-info-row');
            const ctxRow = document.getElementById('model-ctx-row');

            if (nameEl && nameRow) {
                // Show short model name: "gemma-3-12b" from "google/gemma-3-12b"
                const shortName = model.id.includes('/')
                    ? model.id.split('/').pop()
                    : model.id;
                const quant = model.quantization ? ` (${model.quantization})` : '';
                nameEl.innerText = shortName + quant;
                nameEl.title = model.id; // Full name on hover
                nameRow.style.display = '';
            }

            if (ctxEl && ctxRow) {
                const ctx = model.max_context_length || model.loaded_context_length;
                if (ctx) {
                    // Format: "131K" or "8K"
                    ctxEl.innerText = ctx >= 1024 ? `${Math.round(ctx / 1024)}K` : ctx;
                    ctxRow.style.display = '';
                }
            }
        } catch (e) {
            // Non-critical — LM Studio may not be running
            console.debug('[Dashboard] Model info unavailable:', e.message);
        }
    }

    // --- RELATIONSHIP WIDGET ---

    /**
     * Inject the relationship gauge widget into the right panel.
     * Shows affinity, mood, and trust as horizontal bars.
     * @private
     */
    _injectRelationshipWidget() {
        const sidebar = document.querySelector('#panel-right .sidebar-content');
        if (!sidebar) return;

        const section = document.createElement('div');
        section.className = 'memory-section';
        section.innerHTML = `
            <div class="memory-header">Relationship</div>
            <div id="relationship-widget" style="padding:8px;">
                <div style="color:var(--text-muted); font-size:0.7rem;">Select a character...</div>
            </div>
        `;
        // Insert before the telemetry panel
        const telemetry = sidebar.querySelector('.telemetry-panel');
        if (telemetry) {
            sidebar.insertBefore(section, telemetry);
        } else {
            sidebar.appendChild(section);
        }
    }

    /**
     * Fetch and render relationship scores for the current character.
     * Called on character select and after chat messages.
     */
    async refreshRelationship() {
        const charId = state.state.currentCharacterId;
        const widget = document.getElementById('relationship-widget');
        if (!widget || !charId) return;

        try {
            const data = await API.get(`characters/${charId}/relationship`);
            if (!data.ok) return;

            const r = data.relationship;
            const bars = [
                { label: 'Affinity', value: r.affinity, color: 'var(--neon-magenta)' },
                { label: 'Mood', value: r.mood, color: 'var(--neon-cyan)' },
                { label: 'Trust', value: r.trust, color: 'var(--neon-green)' },
            ];

            widget.innerHTML = bars.map(b => `
                <div style="margin-bottom:6px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:2px;">
                        <span style="color:var(--text-muted);">${b.label}</span>
                        <span style="color:${b.color};">${Math.round(b.value * 100)}%</span>
                    </div>
                    <div style="height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
                        <div style="height:100%; width:${b.value * 100}%; background:${b.color}; border-radius:2px; transition:width 0.5s ease;"></div>
                    </div>
                </div>
            `).join('') + `
                <div style="font-size:0.6rem; color:var(--text-muted); margin-top:4px;">${r.interactions} interactions</div>
            `;
        } catch (e) {
            widget.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem;">--</div>';
        }
    }

    // --- EMOTION TIMELINE WIDGET ---

    /**
     * Inject the emotion timeline widget into the right panel.
     * @private
     */
    _injectEmotionWidget() {
        const sidebar = document.querySelector('#panel-right .sidebar-content');
        if (!sidebar) return;

        const section = document.createElement('div');
        section.className = 'memory-section';
        section.innerHTML = `
            <div class="memory-header">Emotion Timeline</div>
            <div id="emotion-timeline-widget" style="padding:8px; max-height:80px; overflow-y:auto;">
                <div style="color:var(--text-muted); font-size:0.7rem;">No session loaded.</div>
            </div>
        `;
        const telemetry = sidebar.querySelector('.telemetry-panel');
        if (telemetry) {
            sidebar.insertBefore(section, telemetry);
        } else {
            sidebar.appendChild(section);
        }
    }

    /**
     * Fetch and render the emotion timeline for the current session.
     */
    async refreshEmotionTimeline() {
        const sessionId = state.state.currentSessionId;
        const widget = document.getElementById('emotion-timeline-widget');
        if (!widget || !sessionId) return;

        try {
            const data = await API.get(`sessions/${sessionId}/emotions`);
            if (!data.ok || !data.emotions?.length) {
                widget.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem;">No emotions yet.</div>';
                return;
            }

            const EMOTION_COLORS = {
                happy: '#39ff14',
                excited: '#ffdd00',
                sad: '#4488ff',
                worried: '#6688aa',
                angry: '#ff0050',
                frustrated: '#ff4400',
                surprised: '#ffaa00',
                thinking: '#aa88ff',
                confused: '#88aacc',
                neutral: '#666',
            };

            widget.innerHTML = `
                <div style="display:flex; gap:2px; flex-wrap:wrap; align-items:flex-end; min-height:24px;">
                    ${data.emotions.map(e => {
                        const color = EMOTION_COLORS[e.emotion] || '#666';
                        return `<div title="${e.emotion}" style="width:8px; height:${12 + Math.random() * 12}px; background:${color}; border-radius:1px; flex-shrink:0;"></div>`;
                    }).join('')}
                </div>
                <div style="font-size:0.6rem; color:var(--text-muted); margin-top:4px;">${data.emotions.length} exchanges</div>
            `;
        } catch (e) {
            widget.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem;">--</div>';
        }
    }
}
