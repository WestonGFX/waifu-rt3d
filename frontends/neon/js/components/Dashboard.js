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
        this._initTokenBudgetWidget();

        // Refresh data widgets on character/session/chat events
        bus.on('character:selected', () => {
            this.refreshRelationship();
            this.refreshTokenBudget();
        });
        bus.on('session:selected', () => {
            this.refreshEmotionTimeline();
            this.refreshTokenBudget();
        });
        bus.on('chat:completed', (meta) => {
            this.refreshRelationship();
            this.refreshEmotionTimeline();
            this.updateTokenBudget(meta?.context_budget);
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
        this._initFpsListener();
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
     * Fetch and update system stats (CPU, RAM, provider, GPU).
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

            // RAM: show used/total with color coding by percentage
            const memPct = data.memory_percent || 0;
            const ramColor = memPct >= 90 ? '#ff4444'
                           : memPct >= 75 ? '#ff8800'
                           : memPct >= 50 ? '#ffcc00'
                           : 'var(--neon-green)';
            vramEl.innerText = data.memory_total
                ? `${data.memory}/${data.memory_total}GB`
                : data.memory + 'GB';
            vramEl.style.color = ramColor;

            // GPU/VRAM row
            this._updateGpuStat(data.gpu);

            // LLM response time is set by ChatInterface after each response.
            // Show a meaningful placeholder until the first chat message.
            if (!llmTimeEl.innerText || llmTimeEl.innerText === '--') {
                llmTimeEl.innerText = 'no chat';
                llmTimeEl.style.color = 'var(--text-muted)';
            }
            const ttftEl = document.getElementById('stat-ttft');
            if (ttftEl && (!ttftEl.innerText || ttftEl.innerText === '--')) {
                ttftEl.innerText = 'no chat';
                ttftEl.style.color = 'var(--text-muted)';
            }

            // Update sidebar LLM status with provider name
            this._updateSidebarStatus(true, data.provider);

            // Reset failure count on success; restore normal interval if backed off
            if (this._statsFailCount > 0) {
                this._statsFailCount = 0;
                clearInterval(this._statsTimer);
                this._statsTimer = setInterval(() => {
                    this.updateStats(loadEl, vramEl, llmTimeEl);
                }, this._statsInterval);
            }
        } catch (e) {
            this._updateSidebarStatus(false);

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
     * Update the GPU/VRAM stat row from the stats API gpu object.
     * Apple Silicon shows "UNIFIED"; NVIDIA shows used/total GB.
     * @param {Object|null} gpu - GPU info from /api/stats
     */
    _updateGpuStat(gpu) {
        const row = document.getElementById('gpu-stat-row');
        const el = document.getElementById('stat-gpu');
        if (!row || !el || !gpu || !gpu.type) return;
        row.style.display = '';
        if (gpu.type === 'apple_silicon') {
            el.textContent = gpu.vram_total_gb ? `${gpu.vram_total_gb}GB` : 'UNIFIED';
            el.style.color = 'var(--neon-green)';
        } else if (gpu.type === 'nvidia' && gpu.vram_total_gb) {
            const pct = gpu.vram_used_gb / gpu.vram_total_gb * 100;
            el.textContent = `${gpu.vram_used_gb}/${gpu.vram_total_gb}GB`;
            el.style.color = pct >= 90 ? '#ff4444' : pct >= 75 ? '#ff8800' : 'var(--neon-green)';
        }
    }

    /**
     * Listen for FPS updates posted from the viewer iframe.
     * The viewer posts { type: 'fpsUpdate', fps: number } every second.
     */
    _initFpsListener() {
        window.addEventListener('message', (e) => {
            if (e.data?.type !== 'fpsUpdate') return;
            const el = document.getElementById('stat-fps');
            if (!el) return;
            el.textContent = e.data.fps;
            el.style.color = e.data.fps >= 55 ? 'var(--neon-green)'
                           : e.data.fps >= 30 ? '#ffcc00' : '#ff4444';
        });
    }

    /**
     * Update the sidebar LLM status badge.
     * Shows short provider name (e.g. "OpenAI" / "Claude") with green/red
     * color to indicate connection status. Avoids layout jitter by keeping
     * text short and not including model names or "(local)" suffixes.
     *
     * @param {boolean} connected - Whether the stats API responded successfully
     * @param {string} [providerLabel] - Human-readable provider name from /api/stats
     */
    _updateSidebarStatus(connected, providerLabel) {
        const el = document.getElementById('sidebar-llm-status');
        if (!el) return;
        if (connected) {
            el.textContent = providerLabel || 'Online';
            el.className = 'subtitle connected';
        } else {
            el.textContent = 'Offline';
            el.className = 'subtitle disconnected';
        }
    }

    /**
     * Fetch active model info from LM Studio via our proxy endpoint.
     * Populates the MODEL and CTX rows in the telemetry widget, and
     * overrides the sidebar label with the short model name so users can
     * confirm which model is loaded at a glance.
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

            const shortName = model.id.includes('/')
                ? model.id.split('/').pop()
                : model.id;
            const quant = model.quantization ? ` (${model.quantization})` : '';

            if (nameEl && nameRow) {
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

            // Model name belongs in the telemetry MODEL row (stat-model-name),
            // NOT in the sidebar label — that's reserved for provider name from
            // updateStats(). Writing both causes a visible flip-flop every 10-30s.
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

            // Estimate injected token count: limit entries × ~60 chars each ÷ 4 chars/token
            const vocabLimit = stats.limit || 40;
            const injectedCount = Math.min(stats.total || 0, vocabLimit);
            const estTokens = Math.round(injectedCount * 15);  // ~60 chars/entry ÷ 4

            widget.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:6px;">
                    <span style="color:var(--text-muted);">Total Terms</span>
                    <span style="color:var(--neon-magenta,#ff00ff);">${stats.total || 0}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:6px;">
                    <span style="color:var(--text-muted);">Custom</span>
                    <span style="color:var(--neon-cyan);">${stats.user || 0}</span>
                </div>
                ${injectedCount > 0 ? `
                    <div style="font-size:0.6rem; color:var(--neon-green,#39ff14); margin-bottom:4px; opacity:0.8;">
                        Injecting ${injectedCount} entries · ~${estTokens} tok
                    </div>
                ` : ''}
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

    // ─── TOKEN BUDGET WIDGET ──────────────────────────────

    /**
     * Initialize the Token Budget widget.
     * Subscribes to events that trigger budget refreshes.
     * @private
     */
    _initTokenBudgetWidget() {
        /** @type {boolean} Whether the breakdown list is expanded */
        this._tokenBudgetExpanded = false;
        /** @type {Object|null} Last full budget data for re-rendering */
        this._lastBudgetData = null;
    }

    /**
     * Fetch the full token budget breakdown from the backend.
     * Called on session/character switch for a complete snapshot.
     *
     * Uses raw fetch (not API.get) to avoid toast spam — this is a
     * non-critical widget update that should degrade silently.
     */
    async refreshTokenBudget() {
        const sid = state.state.currentSessionId;
        const cid = state.state.currentCharacterId;
        if (!sid) return;

        try {
            const res = await fetch(`/api/context-budget/${sid}?char_id=${cid || ''}`);
            if (!res.ok) return;  // Silently ignore errors (e.g. endpoint not available)
            const data = await res.json();
            if (data?.ok) {
                this._lastBudgetData = data;
                this._renderTokenBudget(data);
            }
        } catch (e) {
            console.debug('[Dashboard] Token budget fetch failed:', e.message);
        }
    }

    /**
     * Quick-update the token budget from inline chat response data.
     * Avoids an extra API call — piggybacks on the SSE done event.
     *
     * @param {Object|null} summary - context_budget from chat response
     */
    updateTokenBudget(summary) {
        if (!summary) {
            console.debug('[Dashboard] chat:completed had no context_budget — backend may need restart');
            return;
        }
        this._lastBudgetData = summary;
        this._renderTokenBudget(summary);
    }

    /**
     * Render the token budget widget with SVG stacked bar and breakdown list.
     *
     * @param {Object} data - Budget data with sections, total_tokens, context_limit, usage_pct
     * @private
     */
    _renderTokenBudget(data) {
        const widget = document.getElementById('token-budget-widget');
        if (!widget) return;

        const { sections = [], total_tokens = 0, context_limit = 131072, usage_pct = 0 } = data;

        // Color palette for each section type (cyberpunk)
        const SECTION_COLORS = {
            'System Prompt': '#00ff41',
            'Diary Entry': '#ff00ff',
            'Daily Greeting': '#ffaa00',
            'Anniversary': '#ffaa00',
            'RAG Memory': '#00ffcc',
            'Vocabulary': '#ff6b6b',
            'Emotion Instructions': '#00d4ff',
            'Content Filter': '#888888',
        };
        // Chat History and anything else defaults to purple
        const getColor = (name) => {
            for (const [key, color] of Object.entries(SECTION_COLORS)) {
                if (name.startsWith(key)) return color;
            }
            return name.includes('History') ? '#7c4dff' : '#aaa';
        };

        // Format token count for display (e.g. 4433 → "4.4k", 131072 → "131k")
        const fmtTok = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

        // Urgency class
        const urgencyColor = usage_pct >= 90 ? '#ff003c'
            : usage_pct >= 70 ? '#ffaa00'
            : 'var(--text-muted)';
        const urgencyLabel = usage_pct >= 90 ? ' · ⚠ CONTEXT NEARLY FULL'
            : usage_pct >= 70 ? ' · ⚠ Getting full'
            : '';

        // Build SVG stacked bar
        const barWidth = 220;
        const barHeight = 14;
        let svgRects = '';
        let x = 0;
        const nonZeroSections = sections.filter(s => s.tokens > 0);
        for (const s of nonZeroSections) {
            const w = Math.max(1, (s.tokens / context_limit) * barWidth);
            const color = getColor(s.name);
            svgRects += `<rect x="${x}" y="0" width="${w}" height="${barHeight}" fill="${color}" opacity="0.85"><title>${s.name}: ${s.tokens.toLocaleString()} tokens</title></rect>`;
            x += w;
        }
        // Remaining space
        if (x < barWidth) {
            svgRects += `<rect x="${x}" y="0" width="${barWidth - x}" height="${barHeight}" fill="#1a1a2e" opacity="0.3"></rect>`;
        }

        const svgBar = `<svg width="100%" height="${barHeight}" viewBox="0 0 ${barWidth} ${barHeight}" preserveAspectRatio="none" style="border-radius:3px; overflow:hidden; display:block;">${svgRects}</svg>`;

        // Build breakdown list
        const breakdownId = 'token-budget-breakdown';
        const breakdownItems = nonZeroSections.map(s => {
            const color = getColor(s.name);
            return `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.6rem; padding:1px 0;">
                <span style="display:flex; align-items:center; gap:4px;">
                    <span style="width:6px; height:6px; border-radius:1px; background:${color}; display:inline-block; flex-shrink:0;"></span>
                    <span style="color:var(--text-secondary);">${s.name}</span>
                </span>
                <span style="color:var(--text-muted); font-family:var(--font-mono); font-size:0.55rem;">${s.tokens.toLocaleString()}</span>
            </div>`;
        }).join('');

        widget.innerHTML = `
            <div style="margin-bottom:4px;">
                ${svgBar}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.6rem; margin-bottom:4px;">
                <span style="color:${urgencyColor}; font-family:var(--font-mono);">${fmtTok(total_tokens)} / ${fmtTok(context_limit)} · ${usage_pct}%${urgencyLabel}</span>
            </div>
            <div>
                <button id="btn-token-budget-toggle" style="background:none; border:none; color:var(--text-muted); font-size:0.6rem; cursor:pointer; padding:0; font-family:var(--font-mono);">
                    ${this._tokenBudgetExpanded ? '▾ Hide breakdown' : '▸ Show breakdown'}
                </button>
                <div id="${breakdownId}" style="display:${this._tokenBudgetExpanded ? 'block' : 'none'}; margin-top:4px;">
                    ${breakdownItems}
                </div>
            </div>
        `;

        // Bind toggle
        const toggleBtn = document.getElementById('btn-token-budget-toggle');
        const breakdownEl = document.getElementById(breakdownId);
        if (toggleBtn && breakdownEl) {
            toggleBtn.addEventListener('click', () => {
                this._tokenBudgetExpanded = !this._tokenBudgetExpanded;
                breakdownEl.style.display = this._tokenBudgetExpanded ? 'block' : 'none';
                toggleBtn.textContent = this._tokenBudgetExpanded ? '▾ Hide breakdown' : '▸ Show breakdown';
            });
        }

        // Pulse animation for high usage
        if (usage_pct >= 90) {
            widget.closest('.dashboard-widget')?.style.setProperty('border-color', 'rgba(255, 0, 60, 0.4)');
        } else if (usage_pct >= 70) {
            widget.closest('.dashboard-widget')?.style.setProperty('border-color', 'rgba(255, 170, 0, 0.3)');
        } else {
            widget.closest('.dashboard-widget')?.style.removeProperty('border-color');
        }
    }
}
