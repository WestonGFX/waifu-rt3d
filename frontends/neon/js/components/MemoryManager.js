/**
 * MemoryManager.js
 * Modal interface for browsing, searching, and managing the ChromaDB memory store.
 *
 * Features:
 * - Paginated memory table with text preview and metadata
 * - Semantic search using existing /api/v2/memory/search endpoint
 * - Delete individual memories
 * - Filter by character
 *
 * @example
 * const memMgr = new MemoryManager();
 * memMgr.open();
 */
import { state } from '../core/StateManager.js';
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';

export class MemoryManager {
    constructor() {
        this.page = 0;
        this.pageSize = 15;
        this.searchQuery = '';
        this.filterCharId = 0;
        this.injectHTML();
        this.modal = document.getElementById('memory-manager-modal');
    }

    /**
     * Open the memory manager modal and load the first page.
     */
    open() {
        this.page = 0;
        this.searchQuery = '';
        this.modal.style.display = 'flex';
        this._loadPage();
    }

    /**
     * Close the memory manager modal.
     */
    close() {
        this.modal.style.display = 'none';
    }

    /**
     * Inject modal HTML into the document body.
     * @private
     */
    injectHTML() {
        if (document.getElementById('memory-manager-modal')) return;

        const html = `
            <div id="memory-manager-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel" style="position:relative; max-width:800px; width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 0 50px rgba(0,240,255,0.1); overflow:hidden;">
                    <button id="btn-close-memory-mgr" class="settings-close-x">&times;</button>
                    <div style="padding:24px; padding-right:48px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <h2 style="margin:0 0 16px 0; color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:2px;">MEMORY MANAGER</h2>

                        <!-- Search + Filter Bar -->
                        <div style="display:flex; gap:8px; margin-bottom:16px;">
                            <input id="mem-mgr-search" type="text" class="input-field" placeholder="Search memories..."
                                   style="flex:1; padding:8px 12px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:6px; font-size:0.8rem;">
                            <select id="mem-mgr-char-filter" style="padding:8px; background:rgba(0,10,20,0.6); border:1px solid var(--glass-border); color:var(--text-main); border-radius:6px; font-size:0.8rem;">
                                <option value="0">All Characters</option>
                            </select>
                            <button id="mem-mgr-search-btn" class="btn" style="padding:8px 16px; background:rgba(0,240,255,0.1); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:6px; cursor:pointer; font-size:0.8rem;">SEARCH</button>
                        </div>

                        <!-- Memory Table -->
                        <div id="mem-mgr-table" style="flex:1; overflow-y:auto; min-height:0;"></div>

                        <!-- Pagination -->
                        <div id="mem-mgr-pagination" style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05); margin-top:8px;">
                            <button id="mem-mgr-prev" class="btn" style="padding:6px 12px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:6px; cursor:pointer; font-size:0.75rem;">&#x2190; PREV</button>
                            <span id="mem-mgr-page-info" style="color:var(--text-muted); font-size:0.75rem;">Page 1</span>
                            <button id="mem-mgr-next" class="btn" style="padding:6px 12px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:6px; cursor:pointer; font-size:0.75rem;">NEXT &#x2192;</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Bind events
        document.getElementById('btn-close-memory-mgr').onclick = () => this.close();
        document.getElementById('memory-manager-modal').addEventListener('click', (e) => {
            if (e.target.id === 'memory-manager-modal') this.close();
        });
        document.getElementById('mem-mgr-search-btn').onclick = () => this._search();
        document.getElementById('mem-mgr-search').onkeydown = (e) => {
            if (e.key === 'Enter') this._search();
        };
        document.getElementById('mem-mgr-char-filter').onchange = () => {
            this.filterCharId = parseInt(document.getElementById('mem-mgr-char-filter').value) || 0;
            this.page = 0;
            this._loadPage();
        };
        document.getElementById('mem-mgr-prev').onclick = () => {
            if (this.page > 0) { this.page--; this._loadPage(); }
        };
        document.getElementById('mem-mgr-next').onclick = () => {
            this.page++;
            this._loadPage();
        };
    }

    /**
     * Populate the character filter dropdown from state.
     * @private
     */
    _populateCharFilter() {
        const select = document.getElementById('mem-mgr-char-filter');
        if (!select) return;

        const chars = state.state.characters || [];
        select.innerHTML = '<option value="0">All Characters</option>';
        chars.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
        select.value = this.filterCharId;
    }

    /**
     * Load a page of memories from the backend.
     * @private
     */
    async _loadPage() {
        this._populateCharFilter();
        const table = document.getElementById('mem-mgr-table');
        table.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Loading...</div>';

        try {
            const params = new URLSearchParams({
                page: this.page,
                size: this.pageSize,
            });
            if (this.filterCharId > 0) params.set('char_id', this.filterCharId);

            const data = await API.get(`v2/memory/list?${params}`);
            this._renderTable(data.memories || [], data.total || 0);
        } catch (err) {
            table.innerHTML = `<div style="padding:20px; color:var(--neon-magenta);">Failed to load: ${err.message}</div>`;
        }
    }

    /**
     * Perform a semantic search and display results.
     * @private
     */
    async _search() {
        const query = document.getElementById('mem-mgr-search').value.trim();
        if (!query) {
            this.searchQuery = '';
            this.page = 0;
            this._loadPage();
            return;
        }

        this.searchQuery = query;
        const table = document.getElementById('mem-mgr-table');
        table.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Searching...</div>';

        try {
            const charParam = this.filterCharId > 0 ? `&char_id=${this.filterCharId}` : `&char_id=0`;
            const data = await API.get(`v2/memory/search?query=${encodeURIComponent(query)}&n_results=20${charParam}`);
            this._renderSearchResults(data.results || []);
        } catch (err) {
            table.innerHTML = `<div style="padding:20px; color:var(--neon-magenta);">Search failed: ${err.message}</div>`;
        }
    }

    /**
     * Render the memory table from a list page.
     * @private
     * @param {Array} memories - Memory objects from API
     * @param {number} total - Total memory count
     */
    _renderTable(memories, total) {
        const table = document.getElementById('mem-mgr-table');
        const pageInfo = document.getElementById('mem-mgr-page-info');

        const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
        pageInfo.textContent = `Page ${this.page + 1} / ${totalPages} (${total} memories)`;

        if (memories.length === 0) {
            table.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No memories stored yet.</div>';
            return;
        }

        table.innerHTML = memories.map(mem => this._renderMemoryRow(mem)).join('');
        this._bindDeleteButtons();
    }

    /**
     * Render search results.
     * @private
     * @param {Array} results - Search result objects
     */
    _renderSearchResults(results) {
        const table = document.getElementById('mem-mgr-table');
        const pageInfo = document.getElementById('mem-mgr-page-info');
        pageInfo.textContent = `${results.length} search results`;

        if (results.length === 0) {
            table.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No matching memories found.</div>';
            return;
        }

        table.innerHTML = results.map(mem => this._renderMemoryRow(mem, true)).join('');
        this._bindDeleteButtons();
    }

    /**
     * Render a single memory row.
     * @private
     * @param {Object} mem - Memory object
     * @param {boolean} [showScore=false] - Whether to show relevance score
     * @returns {string} HTML string
     */
    _renderMemoryRow(mem, showScore = false) {
        const roleColor = mem.role === 'user' ? 'var(--neon-cyan)' : mem.role === 'knowledge' ? 'var(--neon-green)' : 'var(--neon-magenta)';
        const preview = (mem.text || '').slice(0, 200);
        const ts = mem.timestamp ? new Date(mem.timestamp * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const scoreHtml = showScore && mem.score !== undefined
            ? `<span style="color:var(--neon-green); font-size:0.65rem;">${(mem.score * 100).toFixed(0)}%</span>`
            : '';

        return `
            <div class="mem-row" style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; gap:10px; align-items:flex-start; transition:background 0.15s;"
                 onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
                 onmouseleave="this.style.background='transparent'">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                        <span style="color:${roleColor}; font-size:0.65rem; text-transform:uppercase; font-family:var(--font-display);">${mem.role || 'unknown'}</span>
                        ${scoreHtml}
                        <span style="color:var(--text-muted); font-size:0.6rem; margin-left:auto;">${ts}</span>
                    </div>
                    <div style="color:var(--text-main); font-size:0.78rem; line-height:1.5; word-break:break-word;">${this._escapeHtml(preview)}${mem.text?.length > 200 ? '...' : ''}</div>
                </div>
                <button class="mem-delete-btn" data-mem-id="${mem.id}" title="Delete memory"
                        style="flex-shrink:0; width:28px; height:28px; border:1px solid rgba(255,0,80,0.2); background:rgba(255,0,80,0.05); color:var(--neon-magenta); border-radius:4px; cursor:pointer; font-size:0.7rem; opacity:0.5; transition:opacity 0.15s;"
                        onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.5'">&#x2715;</button>
            </div>
        `;
    }

    /**
     * Bind click handlers to delete buttons in the rendered table.
     * @private
     */
    _bindDeleteButtons() {
        document.querySelectorAll('.mem-delete-btn').forEach(btn => {
            btn.onclick = async () => {
                const memId = btn.dataset.memId;
                if (!memId) return;

                btn.disabled = true;
                btn.textContent = '...';

                try {
                    await API.delete(`v2/memory/${encodeURIComponent(memId)}`);
                    toast.success('Memory deleted', 2000);
                    // Refresh current view
                    if (this.searchQuery) {
                        this._search();
                    } else {
                        this._loadPage();
                    }
                } catch (err) {
                    toast.error(`Delete failed: ${err.message}`, 3000);
                    btn.disabled = false;
                    btn.textContent = '\u2715';
                }
            };
        });
    }

    /**
     * Escape HTML to prevent XSS.
     * @private
     * @param {string} str
     * @returns {string}
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
