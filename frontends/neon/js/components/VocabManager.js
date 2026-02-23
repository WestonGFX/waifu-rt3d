/**
 * VocabManager.js
 * Modal interface for browsing, searching, adding, and managing vocabulary entries.
 *
 * Features:
 * - Browse base vocab (2537 e-girl/VTuber/anime entries from v5.30 pack)
 * - Search by term, meaning, or category with instant filtering
 * - Three tabs: Browse (all entries), My Additions (user-only), Import/Export
 * - Add custom vocab entries with category, register, emotion pickers
 * - Edit/delete user entries (base entries are read-only)
 * - Import/export user vocab as JSON for sharing
 * - Source badges: BASE (read-only) vs CUSTOM (user-added)
 *
 * Uses backend endpoints:
 * - GET    /api/vocab?category=&search=&page=&size=
 * - GET    /api/vocab/categories
 * - GET    /api/vocab/stats
 * - POST   /api/vocab          (add entry)
 * - PUT    /api/vocab/{eg_id}  (edit entry)
 * - DELETE /api/vocab/{eg_id}  (delete entry)
 * - GET    /api/vocab/export   (download user vocab)
 * - POST   /api/vocab/import   (upload vocab JSON)
 *
 * @example
 * const vm = new VocabManager();
 * vm.open(); // Opens the vocabulary manager modal
 */
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';

/** Register options for the add/edit form */
const REGISTER_OPTIONS = [
    'playful', 'cute', 'edgy', 'flirty', 'chill', 'hype',
    'dramatic', 'sassy', 'wholesome', 'chaotic', 'neutral'
];

/** Emotion options for the add/edit form */
const EMOTION_OPTIONS = [
    'neutral', 'joy', 'love', 'flirt', 'hype', 'sass',
    'anger', 'sad', 'shock', 'cringe', 'comfort', 'tease'
];

export class VocabManager {
    constructor() {
        /** @type {string} Current active tab */
        this.currentTab = 'browse';
        /** @type {number} Current page (0-indexed) */
        this.page = 0;
        /** @type {number} Items per page */
        this.pageSize = 30;
        /** @type {string} Active category filter */
        this.categoryFilter = '';
        /** @type {string} Active search query */
        this.searchQuery = '';
        /** @type {string[]} Available categories from backend */
        this.categories = [];
        /** @type {Object|null} Current stats from backend */
        this.stats = null;
        /** @type {string|null} eg_id currently being edited inline */
        this._editingId = null;

        this.injectHTML();
    }

    /**
     * Inject the modal HTML into the DOM (once).
     * Uses the same glass-panel overlay pattern as ModelManager/MemoryManager.
     */
    injectHTML() {
        if (document.getElementById('vocab-manager-modal')) return;

        const html = `
            <div id="vocab-manager-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel" style="position:relative; max-width:900px; width:94vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 0 50px rgba(0,240,255,0.1); overflow:hidden;">
                    <button id="btn-close-vocab" class="settings-close-x">&times;</button>
                    <div style="padding:20px 24px; padding-right:48px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <h2 style="margin:0 0 4px 0; color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:2px; font-size:1.1rem;">VOCABULARY</h2>
                        <div id="vocab-stats-bar" style="font-size:0.72rem; color:var(--text-dim); margin-bottom:10px;"></div>
                        <div id="vocab-tabs" style="display:flex; gap:6px; margin-bottom:12px;"></div>
                        <div id="vocab-toolbar" style="display:flex; gap:8px; margin-bottom:10px; align-items:center;"></div>
                        <div id="vocab-content" style="overflow-y:auto; flex:1; min-height:0;"></div>
                        <div id="vocab-pagination" style="display:flex; justify-content:center; gap:8px; padding-top:10px;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('btn-close-vocab').onclick = () => this.close();
        document.getElementById('vocab-manager-modal').addEventListener('click', (e) => {
            if (e.target.id === 'vocab-manager-modal') this.close();
        });
    }

    /**
     * Open the vocab manager modal and load initial data.
     */
    async open() {
        const modal = document.getElementById('vocab-manager-modal');
        if (!modal) return;
        modal.style.display = 'flex';

        await this._loadMeta();
        this._renderTabs();
        this._renderToolbar();
        await this._loadEntries();
    }

    /**
     * Close the vocab manager modal.
     */
    close() {
        const modal = document.getElementById('vocab-manager-modal');
        if (modal) modal.style.display = 'none';
        this._editingId = null;
    }

    /**
     * Load categories and stats from backend.
     * @private
     */
    async _loadMeta() {
        try {
            const [catRes, statsRes] = await Promise.all([
                API.get('vocab/categories'),
                API.get('vocab/stats')
            ]);
            this.categories = catRes.categories || [];
            this.stats = statsRes.stats || null;

            const bar = document.getElementById('vocab-stats-bar');
            if (bar && this.stats) {
                bar.textContent = `${this.stats.total} entries (${this.stats.base_count} base + ${this.stats.user_count} custom) · ${this.stats.category_count} categories`;
            }
        } catch (err) {
            console.warn('[VocabManager] Failed to load meta:', err);
        }
    }

    /**
     * Render the tab bar (Browse | My Additions | Import/Export).
     * @private
     */
    _renderTabs() {
        const tabs = [
            { id: 'browse', label: 'Browse All' },
            { id: 'user', label: 'My Additions' },
            { id: 'io', label: 'Import / Export' }
        ];

        const container = document.getElementById('vocab-tabs');
        if (!container) return;

        container.innerHTML = tabs.map(t => `
            <button class="btn-config ${this.currentTab === t.id ? 'active' : ''}"
                    data-vtab="${t.id}"
                    style="flex:0 0 auto; padding:5px 14px; font-size:0.78rem;
                           ${this.currentTab === t.id ? 'color:var(--neon-cyan); border-color:var(--neon-cyan);' : ''}">
                ${t.label}
            </button>
        `).join('');

        container.querySelectorAll('[data-vtab]').forEach(btn => {
            btn.onclick = () => {
                this.currentTab = btn.dataset.vtab;
                this.page = 0;
                this._editingId = null;
                this._renderTabs();
                this._renderToolbar();
                this._loadEntries();
            };
        });
    }

    /**
     * Render the toolbar (search box, category filter, add button).
     * @private
     */
    _renderToolbar() {
        const container = document.getElementById('vocab-toolbar');
        if (!container) return;

        if (this.currentTab === 'io') {
            container.innerHTML = '';
            return;
        }

        const showCategoryFilter = this.currentTab === 'browse';

        container.innerHTML = `
            <input id="vocab-search" type="text" placeholder="Search terms..."
                   value="${this._escapeAttr(this.searchQuery)}"
                   style="flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                          padding:6px 10px; color:var(--text-primary); font-size:0.82rem; outline:none;">
            ${showCategoryFilter ? `
                <select id="vocab-cat-filter"
                        style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                               padding:6px 8px; color:var(--text-primary); font-size:0.78rem;">
                    <option value="">All Categories</option>
                    ${this.categories.map(c => `<option value="${c}" ${this.categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            ` : ''}
            <button id="vocab-add-btn" class="btn-config" style="padding:5px 12px; color:var(--neon-green); border-color:rgba(57,255,20,0.3); font-size:0.78rem;">
                + ADD
            </button>
        `;

        // Search with debounce
        let searchTimer = null;
        const searchInput = document.getElementById('vocab-search');
        if (searchInput) {
            searchInput.oninput = () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    this.searchQuery = searchInput.value.trim();
                    this.page = 0;
                    this._loadEntries();
                }, 300);
            };
        }

        const catSelect = document.getElementById('vocab-cat-filter');
        if (catSelect) {
            catSelect.onchange = () => {
                this.categoryFilter = catSelect.value;
                this.page = 0;
                this._loadEntries();
            };
        }

        document.getElementById('vocab-add-btn').onclick = () => this._showAddForm();
    }

    /**
     * Load and render entries based on current tab, filters, and page.
     * @private
     */
    async _loadEntries() {
        const content = document.getElementById('vocab-content');
        if (!content) return;

        if (this.currentTab === 'io') {
            this._renderImportExport(content);
            document.getElementById('vocab-pagination').innerHTML = '';
            return;
        }

        content.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim);">Loading...</div>';

        try {
            const params = new URLSearchParams();
            params.set('page', this.page);
            params.set('size', this.pageSize);

            if (this.searchQuery) {
                params.set('search', this.searchQuery);
            }
            if (this.currentTab === 'user') {
                params.set('source', 'user');
            }
            if (this.categoryFilter && this.currentTab === 'browse') {
                params.set('category', this.categoryFilter);
            }

            const res = await API.get(`vocab?${params.toString()}`);
            const entries = res.entries || [];
            const total = res.total || 0;

            if (entries.length === 0) {
                content.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-dim);">
                    ${this.currentTab === 'user' ? 'No custom entries yet. Click "+ ADD" to create one.' : 'No entries found.'}
                </div>`;
                document.getElementById('vocab-pagination').innerHTML = '';
                return;
            }

            this._renderEntries(content, entries);
            this._renderPagination(total);
        } catch (err) {
            console.error('[VocabManager] Load error:', err);
            content.innerHTML = `<div style="text-align:center; padding:40px; color:var(--neon-red);">Failed to load vocabulary: ${err.message}</div>`;
        }
    }

    /**
     * Render the entry list as a compact table.
     * @param {HTMLElement} container - Target container
     * @param {Object[]} entries - Vocab entries to render
     * @private
     */
    _renderEntries(container, entries) {
        const rows = entries.map(e => {
            const isUser = e._source === 'user';
            const badge = isUser
                ? '<span style="background:rgba(57,255,20,0.15); color:var(--neon-green); padding:1px 6px; border-radius:3px; font-size:0.65rem; font-weight:600;">CUSTOM</span>'
                : '<span style="background:rgba(0,240,255,0.1); color:var(--neon-cyan); padding:1px 6px; border-radius:3px; font-size:0.65rem; font-weight:600;">BASE</span>';

            const aliases = (e.aliases || []).length > 0
                ? `<span style="color:var(--text-dim); font-size:0.72rem;"> (${e.aliases.slice(0, 3).join(', ')})</span>`
                : '';

            const tags = [e.category, e.register, e.emotion].filter(Boolean);
            const tagHtml = tags.map(t =>
                `<span style="background:rgba(255,255,255,0.05); padding:1px 5px; border-radius:2px; font-size:0.65rem; color:var(--text-dim);">${t}</span>`
            ).join(' ');

            const actions = isUser ? `
                <button class="vocab-edit-btn" data-egid="${e.eg_id}" title="Edit"
                        style="background:none; border:none; color:var(--neon-cyan); cursor:pointer; padding:2px 6px; font-size:0.8rem;">✎</button>
                <button class="vocab-del-btn" data-egid="${e.eg_id}" title="Delete"
                        style="background:none; border:none; color:var(--neon-red,#ff4444); cursor:pointer; padding:2px 6px; font-size:0.8rem;">✕</button>
            ` : '';

            return `
                <div class="vocab-row" style="display:flex; align-items:flex-start; gap:10px; padding:8px 10px;
                            border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s;"
                     onmouseenter="this.style.background='rgba(0,240,255,0.03)'"
                     onmouseleave="this.style.background='transparent'">
                    <div style="flex:0 0 56px;">${badge}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                            <strong style="color:var(--text-primary); font-size:0.85rem;">${this._escapeHtml(e.term)}</strong>
                            ${aliases}
                        </div>
                        <div style="color:var(--text-secondary); font-size:0.78rem; margin-top:2px; line-height:1.4;">
                            ${this._escapeHtml(e.meaning || '')}
                        </div>
                        <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">${tagHtml}</div>
                    </div>
                    <div style="flex:0 0 auto; display:flex; align-items:center;">${actions}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div style="border:1px solid rgba(0,240,255,0.08); border-radius:6px; overflow:hidden;">${rows}</div>`;

        // Bind edit/delete buttons
        container.querySelectorAll('.vocab-edit-btn').forEach(btn => {
            btn.onclick = () => this._showEditForm(btn.dataset.egid, entries);
        });
        container.querySelectorAll('.vocab-del-btn').forEach(btn => {
            btn.onclick = () => this._deleteEntry(btn.dataset.egid);
        });
    }

    /**
     * Render pagination controls.
     * @param {number} total - Total matching entries
     * @private
     */
    _renderPagination(total) {
        const pag = document.getElementById('vocab-pagination');
        if (!pag) return;

        const totalPages = Math.ceil(total / this.pageSize);
        if (totalPages <= 1) {
            pag.innerHTML = `<span style="color:var(--text-dim); font-size:0.75rem;">${total} entries</span>`;
            return;
        }

        let html = '';
        if (this.page > 0) {
            html += `<button class="btn-config vocab-page-btn" data-vpage="${this.page - 1}" style="padding:3px 10px; font-size:0.75rem;">← Prev</button>`;
        }
        html += `<span style="color:var(--text-dim); font-size:0.75rem; padding:3px 8px;">Page ${this.page + 1} / ${totalPages} (${total} entries)</span>`;
        if (this.page < totalPages - 1) {
            html += `<button class="btn-config vocab-page-btn" data-vpage="${this.page + 1}" style="padding:3px 10px; font-size:0.75rem;">Next →</button>`;
        }

        pag.innerHTML = html;
        pag.querySelectorAll('.vocab-page-btn').forEach(btn => {
            btn.onclick = () => {
                this.page = parseInt(btn.dataset.vpage);
                this._loadEntries();
            };
        });
    }

    /**
     * Show the "Add New Entry" form in a floating overlay within the modal.
     * @private
     */
    _showAddForm() {
        const content = document.getElementById('vocab-content');
        if (!content) return;

        const formHtml = this._buildEntryForm(null);
        content.innerHTML = formHtml;
        this._bindFormEvents(content, null);
    }

    /**
     * Show inline edit form for a specific user entry.
     * @param {string} egId - Entry ID to edit
     * @param {Object[]} entries - Current entries list to find the target
     * @private
     */
    _showEditForm(egId, entries) {
        const entry = entries.find(e => e.eg_id === egId);
        if (!entry) return;

        const content = document.getElementById('vocab-content');
        if (!content) return;

        const formHtml = this._buildEntryForm(entry);
        content.innerHTML = formHtml;
        this._bindFormEvents(content, entry);
    }

    /**
     * Build the add/edit form HTML.
     * @param {Object|null} entry - Existing entry for edit mode, null for add mode
     * @returns {string} Form HTML
     * @private
     */
    _buildEntryForm(entry) {
        const isEdit = !!entry;
        const title = isEdit ? 'Edit Entry' : 'Add New Entry';

        return `
            <div style="border:1px solid rgba(0,240,255,0.15); border-radius:8px; padding:16px; background:rgba(0,0,0,0.2);">
                <h3 style="margin:0 0 12px 0; color:var(--neon-cyan); font-size:0.9rem;">${title}</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Term *</span>
                        <input id="vf-term" type="text" value="${this._escapeAttr(entry?.term || '')}"
                               style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                      padding:6px 8px; color:var(--text-primary); font-size:0.82rem;">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Category</span>
                        <select id="vf-category"
                                style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                       padding:6px 8px; color:var(--text-primary); font-size:0.78rem;">
                            <option value="Custom">Custom</option>
                            ${this.categories.map(c => `<option value="${c}" ${(entry?.category || '') === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px; grid-column:1/-1;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Meaning *</span>
                        <textarea id="vf-meaning" rows="2"
                                  style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                         padding:6px 8px; color:var(--text-primary); font-size:0.82rem; resize:vertical;">${this._escapeHtml(entry?.meaning || '')}</textarea>
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Aliases (comma-separated)</span>
                        <input id="vf-aliases" type="text" value="${this._escapeAttr((entry?.aliases || []).join(', '))}"
                               style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                      padding:6px 8px; color:var(--text-primary); font-size:0.82rem;">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Part of Speech</span>
                        <input id="vf-pos" type="text" value="${this._escapeAttr(entry?.pos || 'noun')}"
                               style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                      padding:6px 8px; color:var(--text-primary); font-size:0.82rem;">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Register</span>
                        <select id="vf-register"
                                style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                       padding:6px 8px; color:var(--text-primary); font-size:0.78rem;">
                            ${REGISTER_OPTIONS.map(r => `<option value="${r}" ${(entry?.register || 'playful') === r ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                    </label>
                    <label style="display:flex; flex-direction:column; gap:3px;">
                        <span style="font-size:0.72rem; color:var(--text-dim);">Emotion</span>
                        <select id="vf-emotion"
                                style="background:rgba(0,0,0,0.3); border:1px solid rgba(0,240,255,0.15); border-radius:4px;
                                       padding:6px 8px; color:var(--text-primary); font-size:0.78rem;">
                            ${EMOTION_OPTIONS.map(em => `<option value="${em}" ${(entry?.emotion || 'neutral') === em ? 'selected' : ''}>${em}</option>`).join('')}
                        </select>
                    </label>
                </div>
                <div style="display:flex; gap:8px; margin-top:14px; justify-content:flex-end;">
                    <button id="vf-cancel" class="btn-config" style="padding:5px 14px; font-size:0.78rem;">Cancel</button>
                    <button id="vf-save" class="btn-config" style="padding:5px 14px; font-size:0.78rem; color:var(--neon-green); border-color:rgba(57,255,20,0.3);">
                        ${isEdit ? 'Save Changes' : 'Add Entry'}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Bind save/cancel events on the add/edit form.
     * @param {HTMLElement} container - Form container
     * @param {Object|null} entry - Existing entry (edit mode) or null (add mode)
     * @private
     */
    _bindFormEvents(container, entry) {
        container.querySelector('#vf-cancel').onclick = () => this._loadEntries();

        container.querySelector('#vf-save').onclick = async () => {
            const term = document.getElementById('vf-term')?.value?.trim();
            const meaning = document.getElementById('vf-meaning')?.value?.trim();

            if (!term || !meaning) {
                toast.error('Term and meaning are required');
                return;
            }

            const aliasStr = document.getElementById('vf-aliases')?.value || '';
            const aliases = aliasStr.split(',').map(a => a.trim()).filter(Boolean);

            const payload = {
                term,
                meaning,
                aliases,
                category: document.getElementById('vf-category')?.value || 'Custom',
                pos: document.getElementById('vf-pos')?.value?.trim() || 'noun',
                register: document.getElementById('vf-register')?.value || 'playful',
                emotion: document.getElementById('vf-emotion')?.value || 'neutral'
            };

            try {
                if (entry) {
                    await API.put(`vocab/${entry.eg_id}`, payload);
                    toast.success(`Updated "${term}"`);
                } else {
                    await API.post('vocab', payload);
                    toast.success(`Added "${term}"`);
                }
                await this._loadMeta();
                this._loadEntries();
            } catch (err) {
                toast.error(`Failed: ${err.message}`);
            }
        };
    }

    /**
     * Delete a user vocab entry after confirmation.
     * @param {string} egId - Entry ID to delete
     * @private
     */
    async _deleteEntry(egId) {
        if (!confirm('Delete this vocab entry? This cannot be undone.')) return;

        try {
            await API.delete(`vocab/${egId}`);
            toast.success('Entry deleted');
            await this._loadMeta();
            this._loadEntries();
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`);
        }
    }

    /**
     * Render the Import/Export tab content.
     * @param {HTMLElement} container - Target container
     * @private
     */
    _renderImportExport(container) {
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; padding:10px;">
                <div style="border:1px solid rgba(0,240,255,0.1); border-radius:8px; padding:16px;">
                    <h3 style="margin:0 0 8px 0; color:var(--neon-cyan); font-size:0.9rem;">Export User Vocabulary</h3>
                    <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 12px 0;">
                        Download your custom vocabulary entries as a JSON file for backup or sharing.
                    </p>
                    <button id="vocab-export-btn" class="btn-config" style="padding:6px 16px; font-size:0.78rem; color:var(--neon-green); border-color:rgba(57,255,20,0.3);">
                        Export JSON
                    </button>
                </div>
                <div style="border:1px solid rgba(0,240,255,0.1); border-radius:8px; padding:16px;">
                    <h3 style="margin:0 0 8px 0; color:var(--neon-cyan); font-size:0.9rem;">Import Vocabulary</h3>
                    <p style="color:var(--text-dim); font-size:0.78rem; margin:0 0 12px 0;">
                        Import vocabulary entries from a JSON file. Duplicates (by ID) are skipped.
                    </p>
                    <input type="file" id="vocab-import-file" accept=".json"
                           style="display:none;">
                    <button id="vocab-import-btn" class="btn-config" style="padding:6px 16px; font-size:0.78rem;">
                        Choose File & Import
                    </button>
                    <span id="vocab-import-status" style="margin-left:10px; font-size:0.75rem; color:var(--text-dim);"></span>
                </div>
            </div>
        `;

        // Export handler
        document.getElementById('vocab-export-btn').onclick = async () => {
            try {
                const res = await API.get('vocab/export');
                const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `user_vocab_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`Exported ${res.count} entries`);
            } catch (err) {
                toast.error(`Export failed: ${err.message}`);
            }
        };

        // Import handler
        const fileInput = document.getElementById('vocab-import-file');
        document.getElementById('vocab-import-btn').onclick = () => fileInput.click();
        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            const status = document.getElementById('vocab-import-status');
            status.textContent = 'Reading file...';

            try {
                const text = await file.text();
                let entries = JSON.parse(text);

                // Accept both raw array and {entries: [...]} wrapper
                if (entries.entries && Array.isArray(entries.entries)) {
                    entries = entries.entries;
                }
                if (!Array.isArray(entries)) {
                    throw new Error('File must contain a JSON array of vocab entries');
                }

                status.textContent = `Importing ${entries.length} entries...`;
                const res = await API.post('vocab/import', { entries });
                toast.success(`Imported ${res.imported} new entries (${res.total_user} total user entries)`);
                status.textContent = `Done — ${res.imported} imported`;
                await this._loadMeta();
            } catch (err) {
                toast.error(`Import failed: ${err.message}`);
                status.textContent = `Error: ${err.message}`;
            }

            fileInput.value = '';
        };
    }

    /**
     * Escape HTML special characters for safe rendering.
     * @param {string} str - Raw string
     * @returns {string} Escaped string
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Escape string for use in HTML attribute values.
     * @param {string} str - Raw string
     * @returns {string} Escaped string safe for attribute values
     * @private
     */
    _escapeAttr(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
