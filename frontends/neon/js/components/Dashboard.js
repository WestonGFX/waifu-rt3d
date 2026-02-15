/**
 * Dashboard.js
 * Main dashboard controller for the bento grid layout.
 *
 * Features:
 * - Sidebar toggle (left/right panels)
 * - Telemetry stats (CPU, RAM, LLM time, model info)
 * - Draggable widget system with show/hide and localStorage persistence
 * - Relationship, Emotion, Vocabulary, and Telemetry widgets
 *
 * @example
 * const dashboard = new Dashboard();
 * dashboard.toggleSidebar(); // Toggle left panel
 */
import { state } from '../core/StateManager.js';
import { API } from '../core/API.js';
import { bus } from '../core/EventBus.js';

/** @type {string} localStorage key for widget order */
const WIDGET_ORDER_KEY = 'waifu_widget_order';
/** @type {string} localStorage key for hidden widgets */
const WIDGET_HIDDEN_KEY = 'waifu_widget_hidden';

export class Dashboard {
    constructor() {
        this.grid = document.querySelector('.bento-grid');
        this.leftPanel = document.getElementById('panel-left');
        this.rightPanel = document.getElementById('panel-right');
        this.activeModelInfo = null;

        /** @type {HTMLElement|null} The widget container in the right panel */
        this.widgetContainer = document.getElementById('widget-container');

        this.bindEvents();
        this.initTelemetry();
        this._initWidgetSystem();
        this._initVocabWidget();

        // Refresh data widgets on character/session/chat events
        bus.on('character:selected', () => this.refreshRelationship());
        bus.on('session:selected', () => this.refreshEmotionTimeline());
        bus.on('chat:completed', () => {
            this.refreshRelationship();
            this.refreshEmotionTimeline();
        });
    }

    // ─── SIDEBAR TOGGLES ───────────────────────────────────

    bindEvents() {
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
            const btn = document.getElementById('btn-toggle-left');
            if (btn) {
                btn.innerHTML = this.grid.classList.contains('left-collapsed') ? '&#x00BB;' : '&#x00AB;';
                btn.title = this.grid.classList.contains('left-collapsed') ? 'Show Roster' : 'Hide Roster';
            }
        }
    }

    /**
     * Toggle the 3D viewport visibility in Toggle View layout mode.
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
            const btn = document.getElementById('btn-toggle-right');
            if (btn) {
                btn.innerHTML = this.grid.classList.contains('right-open') ? '&#x00BB;' : '&#x00AB;';
                btn.title = this.grid.classList.contains('right-open') ? 'Hide Memory Bank' : 'Show Memory Bank';
            }
        }
    }

    // ─── TELEMETRY ─────────────────────────────────────────

    initTelemetry() {
        this.startTelemetryLoop();
        this.fetchModelInfo();
        setInterval(() => this.fetchModelInfo(), 30000);
    }

    async startTelemetryLoop() {
        const loadEl = document.getElementById('stat-load');
        const vramEl = document.getElementById('stat-vram');
        const llmTimeEl = document.getElementById('stat-llm-time');

        // Make llmTimeEl globally accessible for ChatInterface
        window.llmTimeEl = llmTimeEl;

        /** @type {number} Consecutive failure count for circuit breaker */
        this._statsFailCount = 0;
        /** @type {number} Normal polling interval (ms) */
        this._statsInterval = 10000;
        /** @type {number} Backed-off interval after failures (ms) */
        this._statsBackoffInterval = 30000;

        this.updateStats(loadEl, vramEl, llmTimeEl);
        this._statsTimer = setInterval(() => {
            this.updateStats(loadEl, vramEl, llmTimeEl);
        }, this._statsInterval);
    }

    /**
     * Fetch and update system stats (CPU, RAM).
     * Uses raw fetch (not API.get) to avoid retry/toast spam for this
     * non-critical polling endpoint. Backs off after consecutive failures.
     *
     * @param {HTMLElement|null} loadEl - CPU stat display element
     * @param {HTMLElement|null} vramEl - RAM stat display element
     * @param {HTMLElement|null} llmTimeEl - LLM time display element
     */
    async updateStats(loadEl, vramEl, llmTimeEl) {
        if (!loadEl) return;
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            loadEl.innerText = data.cpu + '%';
            if (data.cpu > 80) loadEl.classList.add('crit');
            else loadEl.classList.remove('crit');

            vramEl.innerText = data.memory + 'GB';

            if (!llmTimeEl.innerText || llmTimeEl.innerText === '--') {
                llmTimeEl.innerText = '--';
            }

            // Reset failure count on success; restore normal interval if backed off
            if (this._statsFailCount > 0) {
                this._statsFailCount = 0;
                clearInterval(this._statsTimer);
                this._statsTimer = setInterval(() => {
                    this.updateStats(loadEl, vramEl, llmTimeEl);
                }, this._statsInterval);
            }
        } catch (e) {
            // Circuit breaker: after 3 failures, back off to 30s polling
            this._statsFailCount = (this._statsFailCount || 0) + 1;
            if (this._statsFailCount === 3) {
                console.warn('[Dashboard] Stats unavailable, backing off to 30s polling');
                clearInterval(this._statsTimer);
                this._statsTimer = setInterval(() => {
                    this.updateStats(loadEl, vramEl, llmTimeEl);
                }, this._statsBackoffInterval);
            }
        }
    }

    /**
     * Fetch active model info from LM Studio via our proxy endpoint.
     * Populates the MODEL and CTX rows in the telemetry widget.
     */
    async fetchModelInfo() {
        try {
            const data = await API.get('lm-studio/models');
            if (!data.ok || !data.active_model) return;

            const model = data.active_model;
            this.activeModelInfo = model;
            window.activeModelInfo = model;

            const nameEl = document.getElementById('stat-model-name');
            const ctxEl = document.getElementById('stat-model-ctx');
            const nameRow = document.getElementById('model-info-row');
            const ctxRow = document.getElementById('model-ctx-row');

            if (nameEl && nameRow) {
                const shortName = model.id.includes('/')
                    ? model.id.split('/').pop()
                    : model.id;
                const quant = model.quantization ? ` (${model.quantization})` : '';
                nameEl.innerText = shortName + quant;
                nameEl.title = model.id;
                nameRow.style.display = '';
            }

            if (ctxEl && ctxRow) {
                const ctx = model.max_context_length || model.loaded_context_length;
                if (ctx) {
                    ctxEl.innerText = ctx >= 1024 ? `${Math.round(ctx / 1024)}K` : ctx;
                    ctxRow.style.display = '';
                }
            }
        } catch (e) {
            console.debug('[Dashboard] Model info unavailable:', e.message);
        }
    }

    // ─── WIDGET SYSTEM ─────────────────────────────────────

    /**
     * Initialize the draggable widget system.
     *
     * Reads saved order and visibility from localStorage,
     * applies them to the DOM, and sets up drag-and-drop handlers
     * and the widget picker dropdown.
     *
     * @private
     */
    _initWidgetSystem() {
        if (!this.widgetContainer) return;

        // Restore saved widget order
        this._restoreWidgetOrder();
        this._restoreWidgetVisibility();

        // Attach drag handlers to all widgets
        this._setupDragAndDrop();

        // Widget picker button
        this._setupWidgetPicker();
    }

    /**
     * Restore widget DOM order from localStorage.
     * @private
     */
    _restoreWidgetOrder() {
        try {
            const saved = localStorage.getItem(WIDGET_ORDER_KEY);
            if (!saved) return;

            const order = JSON.parse(saved);
            const container = this.widgetContainer;
            const widgets = Array.from(container.querySelectorAll('.dashboard-widget'));
            const widgetMap = new Map(widgets.map(w => [w.dataset.widgetId, w]));

            // Re-append in saved order (widgets not in saved list stay at end)
            order.forEach(id => {
                const widget = widgetMap.get(id);
                if (widget) {
                    container.appendChild(widget);
                    widgetMap.delete(id);
                }
            });
            // Append remaining widgets not in saved order
            widgetMap.forEach(widget => container.appendChild(widget));
        } catch (e) {
            console.warn('[Dashboard] Failed to restore widget order:', e);
        }
    }

    /**
     * Restore widget visibility from localStorage.
     * @private
     */
    _restoreWidgetVisibility() {
        try {
            const saved = localStorage.getItem(WIDGET_HIDDEN_KEY);
            if (!saved) return;

            const hidden = JSON.parse(saved);
            hidden.forEach(id => {
                const widget = this.widgetContainer.querySelector(`.dashboard-widget[data-widget-id="${id}"]`);
                if (widget) widget.classList.add('hidden');
            });
        } catch (e) {
            console.warn('[Dashboard] Failed to restore widget visibility:', e);
        }
    }

    /**
     * Save current widget DOM order to localStorage.
     * @private
     */
    _saveWidgetOrder() {
        const widgets = Array.from(this.widgetContainer.querySelectorAll('.dashboard-widget'));
        const order = widgets.map(w => w.dataset.widgetId);
        localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
    }

    /**
     * Save hidden widget IDs to localStorage.
     * @private
     */
    _saveWidgetVisibility() {
        const widgets = Array.from(this.widgetContainer.querySelectorAll('.dashboard-widget.hidden'));
        const hidden = widgets.map(w => w.dataset.widgetId);
        localStorage.setItem(WIDGET_HIDDEN_KEY, JSON.stringify(hidden));
    }

    /**
     * Set up HTML5 drag-and-drop on widget grip handles.
     *
     * Uses the grip handle as the drag initiator, with the entire widget
     * as the draggable element. Drop targets are other widgets — dropping
     * inserts the dragged widget before the target.
     *
     * @private
     */
    _setupDragAndDrop() {
        const container = this.widgetContainer;
        /** @type {HTMLElement|null} Currently dragged widget */
        let draggedWidget = null;

        container.querySelectorAll('.dashboard-widget').forEach(widget => {
            const grip = widget.querySelector('.widget-grip');
            if (!grip) return;

            // Make the widget draggable only via the grip handle
            widget.setAttribute('draggable', 'false');
            grip.addEventListener('mousedown', () => {
                widget.setAttribute('draggable', 'true');
            });
            grip.addEventListener('mouseup', () => {
                widget.setAttribute('draggable', 'false');
            });

            widget.addEventListener('dragstart', (e) => {
                draggedWidget = widget;
                widget.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', widget.dataset.widgetId);
            });

            widget.addEventListener('dragend', () => {
                widget.classList.remove('dragging');
                widget.setAttribute('draggable', 'false');
                draggedWidget = null;
                // Clear all drag-over highlights
                container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                this._saveWidgetOrder();
            });

            widget.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedWidget && widget !== draggedWidget) {
                    widget.classList.add('drag-over');
                }
            });

            widget.addEventListener('dragleave', () => {
                widget.classList.remove('drag-over');
            });

            widget.addEventListener('drop', (e) => {
                e.preventDefault();
                widget.classList.remove('drag-over');
                if (draggedWidget && widget !== draggedWidget) {
                    // Insert dragged widget before the drop target
                    container.insertBefore(draggedWidget, widget);
                }
            });
        });
    }

    /**
     * Set up the widget picker dropdown (gear icon in panel header).
     *
     * Shows a checklist of all widgets with toggles to show/hide each one.
     * State is persisted to localStorage.
     *
     * @private
     */
    _setupWidgetPicker() {
        const btn = document.getElementById('btn-widget-picker');
        if (!btn) return;

        let pickerEl = null;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Toggle existing picker
            if (pickerEl) {
                pickerEl.remove();
                pickerEl = null;
                return;
            }

            pickerEl = document.createElement('div');
            pickerEl.className = 'widget-picker';

            const widgets = Array.from(this.widgetContainer.querySelectorAll('.dashboard-widget'));
            widgets.forEach(widget => {
                const id = widget.dataset.widgetId;
                const label = widget.dataset.widgetLabel || id;
                const isVisible = !widget.classList.contains('hidden');

                const item = document.createElement('label');
                item.className = 'widget-picker-item';
                item.innerHTML = `
                    <input type="checkbox" ${isVisible ? 'checked' : ''} data-widget-toggle="${id}">
                    <span>${label}</span>
                `;
                item.querySelector('input').addEventListener('change', (ev) => {
                    if (ev.target.checked) {
                        widget.classList.remove('hidden');
                    } else {
                        widget.classList.add('hidden');
                    }
                    this._saveWidgetVisibility();
                });
                pickerEl.appendChild(item);
            });

            // Position relative to the panel header
            const header = btn.closest('.panel-header');
            if (header) header.style.position = 'relative';
            header.appendChild(pickerEl);

            // Close on outside click
            const closeHandler = (ev) => {
                if (pickerEl && !pickerEl.contains(ev.target) && ev.target !== btn) {
                    pickerEl.remove();
                    pickerEl = null;
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        });
    }

    // ─── RELATIONSHIP WIDGET ───────────────────────────────

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

    // ─── EMOTION TIMELINE WIDGET ───────────────────────────

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

            /** @type {Object<string, string>} Emotion name → hex color */
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

    // ─── VOCAB WIDGET ──────────────────────────────────────

    /**
     * Initialize the vocab widget in the right panel.
     * Wires the expand button and fetches initial stats.
     * @private
     */
    _initVocabWidget() {
        const expandBtn = document.getElementById('btn-vocab-expand');
        if (expandBtn) {
            expandBtn.onclick = () => {
                if (window.app?.vocabManager) {
                    window.app.vocabManager.open();
                }
            };
        }
        this.refreshVocabWidget();
    }

    /**
     * Fetch vocab stats and render a compact summary in the right panel widget.
     */
    async refreshVocabWidget() {
        const widget = document.getElementById('vocab-widget');
        if (!widget) return;

        try {
            const data = await API.get('vocab/stats');
            if (!data.ok) {
                widget.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem;">Vocab unavailable</div>';
                return;
            }

            const stats = data.stats;
            const categories = stats.categories || {};
            const topCategories = Object.entries(categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);

            widget.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:6px;">
                    <span style="color:var(--text-muted);">Total Terms</span>
                    <span style="color:var(--neon-magenta,#ff00ff);">${stats.total || 0}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:6px;">
                    <span style="color:var(--text-muted);">Custom</span>
                    <span style="color:var(--neon-cyan);">${stats.user || 0}</span>
                </div>
                ${topCategories.length ? `
                    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                        ${topCategories.map(([cat, count]) => `
                            <span style="font-size:0.55rem; padding:2px 6px; background:rgba(255,0,255,0.08); border:1px solid rgba(255,0,255,0.15); border-radius:3px; color:var(--text-muted);" title="${count} terms">${cat}</span>
                        `).join('')}
                    </div>
                ` : ''}
            `;
        } catch (e) {
            widget.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem;">--</div>';
        }
    }
}
