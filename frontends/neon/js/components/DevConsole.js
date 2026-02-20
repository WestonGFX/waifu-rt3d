/**
 * DevConsole.js — In-app developer tools panel.
 *
 * Floating panel toggled via Ctrl+Shift+D (or dev_mode setting).
 * Tabs:
 *   - API Log: Wraps global fetch to log method/url/status/timing
 *   - Tokens: Per-session token usage from chat metadata
 *   - Memory: ChromaDB stats from /api/v2/memory/list
 *   - Config: Raw JSON viewer of current app config
 *
 * @example
 * const devConsole = new DevConsole();
 * devConsole.toggle(); // Open/close
 */
import { API } from '../core/API.js';

export class DevConsole {
    constructor() {
        /** @type {Array<{method: string, url: string, status: number, time: number, ts: Date}>} */
        this.apiLog = [];

        /** @type {{totalTokens: number, sessions: Object<string, number>}} */
        this.tokenStats = { totalTokens: 0, sessions: {} };

        /** @type {Array<{msg: string, source: string, ts: Date, type: 'error'|'warn'|'backend'}>} */
        this.errorLog = [];

        this._visible = false;
        this._activeTab = 'api';

        this._injectHTML();
        this._hookFetch();
        this._hookConsoleErrors();

        // Listen for chat metadata to track tokens
        this._listenForTokens();
    }

    /**
     * Open the developer console on a specific tab.
     * @param {string} [tab='errors'] - Tab name: 'api', 'errors', 'tokens', 'memory', 'config'
     */
    openTab(tab = 'errors') {
        this._activeTab = tab;
        this.open();
        // Update tab button active styling after injected HTML exists
        requestAnimationFrame(() => {
            document.querySelectorAll('.dev-tab').forEach(b => {
                b.style.background = b.dataset.tab === tab ? 'rgba(0,240,255,0.1)' : 'transparent';
                b.style.color = b.dataset.tab === tab ? 'var(--neon-cyan)' : 'var(--text-muted)';
            });
        });
    }

    /**
     * Toggle the developer console visibility.
     */
    toggle() {
        this._visible = !this._visible;
        const panel = document.getElementById('dev-console-panel');
        if (panel) {
            panel.style.display = this._visible ? 'flex' : 'none';
            if (this._visible) this._render();
        }
    }

    /**
     * Open the developer console.
     */
    open() {
        this._visible = true;
        const panel = document.getElementById('dev-console-panel');
        if (panel) {
            panel.style.display = 'flex';
            this._render();
        }
    }

    /**
     * Close the developer console.
     */
    close() {
        this._visible = false;
        const panel = document.getElementById('dev-console-panel');
        if (panel) panel.style.display = 'none';
    }

    /**
     * Inject the console panel HTML.
     * @private
     */
    _injectHTML() {
        if (document.getElementById('dev-console-panel')) return;

        const html = `
            <div id="dev-console-panel" style="
                display:none; position:fixed; bottom:10px; right:10px; z-index:9999;
                width:480px; max-height:400px; background:rgba(0,5,15,0.95);
                border:1px solid var(--neon-cyan); border-radius:12px;
                box-shadow:0 0 30px rgba(0,240,255,0.15); backdrop-filter:blur(20px);
                flex-direction:column; font-family:var(--font-mono); font-size:0.72rem;
                color:var(--text-main); overflow:hidden;
            ">
                <div style="
                    display:flex; align-items:center; padding:8px 12px;
                    border-bottom:1px solid rgba(0,240,255,0.15); gap:4px;
                ">
                    <span style="color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:1px; font-size:0.7rem; flex:1;">DEV CONSOLE</span>
                    <button class="dev-tab" data-tab="api" style="padding:3px 8px; border:1px solid var(--glass-border); background:rgba(0,240,255,0.1); color:var(--neon-cyan); border-radius:4px; cursor:pointer; font-size:0.65rem;">API</button>
                    <button class="dev-tab" data-tab="errors" style="padding:3px 8px; border:1px solid var(--glass-border); background:transparent; color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.65rem;">ERRORS</button>
                    <button class="dev-tab" data-tab="tokens" style="padding:3px 8px; border:1px solid var(--glass-border); background:transparent; color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.65rem;">TOKENS</button>
                    <button class="dev-tab" data-tab="memory" style="padding:3px 8px; border:1px solid var(--glass-border); background:transparent; color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.65rem;">MEMORY</button>
                    <button class="dev-tab" data-tab="config" style="padding:3px 8px; border:1px solid var(--glass-border); background:transparent; color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.65rem;">CONFIG</button>
                    <button id="dev-console-close" style="padding:3px 6px; border:none; background:transparent; color:var(--text-muted); cursor:pointer; font-size:0.9rem;">&times;</button>
                </div>
                <div id="dev-console-content" style="flex:1; overflow-y:auto; padding:8px 12px; min-height:100px; max-height:340px;"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Tab switching
        document.querySelectorAll('.dev-tab').forEach(btn => {
            btn.onclick = () => {
                this._activeTab = btn.dataset.tab;
                // Update active styling
                document.querySelectorAll('.dev-tab').forEach(b => {
                    b.style.background = b.dataset.tab === this._activeTab ? 'rgba(0,240,255,0.1)' : 'transparent';
                    b.style.color = b.dataset.tab === this._activeTab ? 'var(--neon-cyan)' : 'var(--text-muted)';
                });
                this._render();
            };
        });

        // Close button
        document.getElementById('dev-console-close').onclick = () => this.close();

        // Make draggable
        this._makeDraggable();
    }

    /**
     * Make the panel draggable by its header.
     * @private
     */
    _makeDraggable() {
        const panel = document.getElementById('dev-console-panel');
        if (!panel) return;

        const header = panel.querySelector('div');
        let isDragging = false;
        let startX, startY, startLeft, startBottom;

        header.style.cursor = 'move';
        header.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startBottom = window.innerHeight - rect.bottom;
        };

        document.onmousemove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.right = 'auto';
            panel.style.left = (startLeft + dx) + 'px';
            panel.style.bottom = (startBottom - dy) + 'px';
        };

        document.onmouseup = () => { isDragging = false; };
    }

    /**
     * Hook window.onerror and unhandledrejection to capture client-side errors.
     * Also polls /api/logs every 30s to surface backend errors.
     * @private
     */
    _hookConsoleErrors() {
        const self = this;

        const addError = (msg, source, type = 'error') => {
            self.errorLog.unshift({ msg: String(msg), source: source || '', ts: new Date(), type });
            if (self.errorLog.length > 200) self.errorLog.pop();
            if (self._visible && self._activeTab === 'errors') self._render();
        };

        // Client JS errors
        window.addEventListener('error', (e) => {
            addError(e.message || 'Unknown error', e.filename ? `${e.filename}:${e.lineno}` : 'window.onerror');
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            addError(e.reason?.message || String(e.reason), 'unhandledrejection');
        });

        // Poll backend error log
        const pollBackendLogs = async () => {
            try {
                const res = await window._origFetch
                    ? window._origFetch('/api/logs')
                    : fetch('/api/logs');
                const data = await res.json();
                (data.logs || []).forEach(entry => {
                    if (entry.level === 'ERROR' || entry.level === 'WARNING') {
                        addError(entry.message || JSON.stringify(entry), `backend:${entry.level}`, 'backend');
                    }
                });
            } catch (_) { /* Backend unreachable, skip */ }
        };

        pollBackendLogs();
        setInterval(pollBackendLogs, 30000);
    }

    /**
     * Monkey-patch global fetch to log API calls.
     * @private
     */
    _hookFetch() {
        const origFetch = window.fetch;
        const self = this;

        window.fetch = async function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            const method = args[1]?.method || 'GET';

            // Only log /api/ calls
            if (!url.includes('/api/')) {
                return origFetch.apply(this, args);
            }

            const start = performance.now();
            try {
                const response = await origFetch.apply(this, args);
                const time = Math.round(performance.now() - start);
                self.apiLog.push({
                    method: method.toUpperCase(),
                    url: url.replace(window.location.origin, ''),
                    status: response.status,
                    time,
                    ts: new Date(),
                });
                // Keep last 100 entries
                if (self.apiLog.length > 100) self.apiLog.shift();

                // Auto-refresh if visible and on API tab
                if (self._visible && self._activeTab === 'api') {
                    self._render();
                }
                return response;
            } catch (err) {
                const time = Math.round(performance.now() - start);
                self.apiLog.push({
                    method: method.toUpperCase(),
                    url: url.replace(window.location.origin, ''),
                    status: 0,
                    time,
                    ts: new Date(),
                    error: err.message,
                });
                if (self.apiLog.length > 100) self.apiLog.shift();
                throw err;
            }
        };
    }

    /**
     * Listen for chat:completed events to track token usage.
     * @private
     */
    _listenForTokens() {
        // Defer import to avoid circular deps
        import('../core/EventBus.js').then(({ bus }) => {
            bus.on('chat:completed', (metadata) => {
                if (metadata?.token_count) {
                    this.tokenStats.totalTokens += metadata.token_count;
                    const sid = metadata.session_id || 'unknown';
                    this.tokenStats.sessions[sid] = (this.tokenStats.sessions[sid] || 0) + metadata.token_count;
                }
                if (this._visible && this._activeTab === 'tokens') {
                    this._render();
                }
            });
        });
    }

    /**
     * Render the active tab content.
     * @private
     */
    _render() {
        const content = document.getElementById('dev-console-content');
        if (!content) return;

        switch (this._activeTab) {
            case 'api':    this._renderAPILog(content); break;
            case 'errors': this._renderErrors(content); break;
            case 'tokens': this._renderTokens(content); break;
            case 'memory': this._renderMemory(content); break;
            case 'config': this._renderConfig(content); break;
        }
    }

    /**
     * Render the API log tab.
     * @private
     * @param {HTMLElement} el
     */
    _renderAPILog(el) {
        if (this.apiLog.length === 0) {
            el.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">No API calls logged yet.</div>';
            return;
        }

        el.innerHTML = this.apiLog.slice().reverse().map(entry => {
            const statusColor = entry.status >= 200 && entry.status < 300 ? 'var(--neon-green)'
                : entry.status >= 400 ? 'var(--neon-magenta)' : 'var(--text-muted)';
            const timeColor = entry.time > 2000 ? 'var(--neon-magenta)' : entry.time > 500 ? '#ffaa00' : 'var(--neon-green)';
            const time = entry.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return `<div style="display:flex; gap:6px; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.03); align-items:baseline;">
                <span style="color:var(--text-muted); font-size:0.6rem; min-width:55px;">${time}</span>
                <span style="color:var(--neon-cyan); min-width:38px;">${entry.method}</span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${entry.url}">${entry.url}</span>
                <span style="color:${statusColor}; min-width:28px; text-align:right;">${entry.status || 'ERR'}</span>
                <span style="color:${timeColor}; min-width:45px; text-align:right;">${entry.time}ms</span>
            </div>`;
        }).join('');
    }

    /**
     * Render the error log tab — shows client JS errors and backend ERROR/WARNING logs.
     * Client errors: window.onerror + unhandledrejection.
     * Backend errors: polled from /api/logs every 30s.
     * @private
     * @param {HTMLElement} el
     */
    _renderErrors(el) {
        if (this.errorLog.length === 0) {
            el.innerHTML = `
                <div style="color:var(--neon-green); padding:20px; text-align:center; font-size:0.7rem;">
                    ✓ No errors detected. Backend logs polled every 30s.
                </div>`;
            return;
        }

        el.innerHTML = this.errorLog.map(entry => {
            const typeColor = entry.type === 'backend' ? '#ffaa00'
                            : entry.type === 'warn'    ? '#ffaa00'
                            : 'var(--neon-magenta)';
            const badge = entry.type === 'backend' ? 'BACKEND'
                        : entry.type === 'warn'    ? 'WARN'
                        : 'JS ERROR';
            const time = entry.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return `<div style="
                padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04);
                display:grid; grid-template-columns:55px 60px 1fr; gap:4px; align-items:start;
            ">
                <span style="color:var(--text-muted); font-size:0.6rem;">${time}</span>
                <span style="color:${typeColor}; font-size:0.6rem; font-weight:bold;">${badge}</span>
                <div>
                    <div style="color:var(--text-main); word-break:break-word; line-height:1.4;">${entry.msg}</div>
                    ${entry.source ? `<div style="color:var(--text-muted); font-size:0.6rem; margin-top:1px;">${entry.source}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    /**
     * Render the token usage tab.
     * @private
     * @param {HTMLElement} el
     */
    _renderTokens(el) {
        const sessions = Object.entries(this.tokenStats.sessions);

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:8px;">
                <span style="color:var(--text-muted);">Total Tokens (Session):</span>
                <span style="color:var(--neon-cyan); font-weight:bold;">${this.tokenStats.totalTokens.toLocaleString()}</span>
            </div>
            ${sessions.length > 0 ? `
                <div style="color:var(--text-muted); font-size:0.6rem; margin-bottom:4px;">Per Chat Session:</div>
                ${sessions.map(([sid, count]) => `
                    <div style="display:flex; justify-content:space-between; padding:2px 0;">
                        <span>Session #${sid}</span>
                        <span style="color:var(--neon-green);">${count.toLocaleString()} tok</span>
                    </div>
                `).join('')}
            ` : '<div style="color:var(--text-muted); text-align:center; padding:20px;">No token data yet. Send a chat message.</div>'}
        `;
    }

    /**
     * Render the memory stats tab (fetches from API).
     * @private
     * @param {HTMLElement} el
     */
    async _renderMemory(el) {
        el.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Loading...</div>';

        try {
            const data = await API.get('v2/memory/list?page=0&size=5');
            const total = data.total || 0;
            const items = data.memories || [];

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:8px;">
                    <span style="color:var(--text-muted);">Total Memories:</span>
                    <span style="color:var(--neon-cyan);">${total}</span>
                </div>
                <div style="color:var(--text-muted); font-size:0.6rem; margin-bottom:4px;">Recent Entries:</div>
                ${items.map(m => `
                    <div style="padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:${m.role === 'user' ? 'var(--neon-cyan)' : 'var(--neon-green)'};">${m.role}</span>
                            <span style="color:var(--text-muted); font-size:0.6rem;">char:${m.char_id || '-'}</span>
                        </div>
                        <div style="color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px;">${m.text || ''}</div>
                    </div>
                `).join('')}
                ${items.length === 0 ? '<div style="color:var(--text-muted); text-align:center;">ChromaDB is empty.</div>' : ''}
            `;
        } catch (err) {
            el.innerHTML = `<div style="color:var(--neon-magenta); padding:20px; text-align:center;">Failed to load memory stats: ${err.message}</div>`;
        }
    }

    /**
     * Render the config viewer tab (fetches from API).
     * @private
     * @param {HTMLElement} el
     */
    async _renderConfig(el) {
        el.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Loading...</div>';

        try {
            const data = await API.get('config');
            const json = JSON.stringify(data, null, 2);

            el.innerHTML = `
                <pre style="
                    margin:0; white-space:pre-wrap; word-break:break-all;
                    color:var(--text-main); font-size:0.65rem; line-height:1.4;
                    max-height:300px; overflow-y:auto;
                ">${this._syntaxHighlight(json)}</pre>
            `;
        } catch (err) {
            el.innerHTML = `<div style="color:var(--neon-magenta);">Failed to load config: ${err.message}</div>`;
        }
    }

    /**
     * Simple JSON syntax highlighter for the config viewer.
     * @private
     * @param {string} json - JSON string
     * @returns {string} HTML with colored spans
     */
    _syntaxHighlight(json) {
        return json
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"([^"]+)":/g, '<span style="color:var(--neon-cyan);">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span style="color:var(--neon-green);">"$1"</span>')
            .replace(/: (\d+\.?\d*)/g, ': <span style="color:#ffaa00;">$1</span>')
            .replace(/: (true|false)/g, ': <span style="color:var(--neon-magenta);">$1</span>')
            .replace(/: null/g, ': <span style="color:var(--text-muted);">null</span>');
    }
}
