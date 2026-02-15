/**
 * KeyboardShortcuts.js
 * Global keyboard shortcut manager with rebinding and persistence.
 *
 * Features:
 * - Register shortcuts with descriptions for help display
 * - Rebind shortcuts via localStorage persistence
 * - allowInInput flag for shortcuts that work in text fields
 * - getAll() returns registered shortcuts for the Hotkey Editor
 *
 * @example
 * keyboard.register('Ctrl+k', () => openSearch(), { description: 'Open search' });
 * keyboard.rebind('Ctrl+k', 'Ctrl+Shift+k'); // Custom rebind
 */

const STORAGE_KEY = 'waifu_keybindings';

class KeyboardShortcutManager {
    constructor() {
        /** @type {Map<string, Object>} Active shortcut handlers keyed by current binding */
        this.shortcuts = new Map();
        /** @type {Map<string, string>} Original key → custom key rebindings */
        this.rebindings = new Map();
        /** @type {boolean} Global enable/disable */
        this.enabled = true;

        this._loadRebindings();
        this.init();
    }

    /**
     * Initialize the global keydown listener.
     * @private
     */
    init() {
        document.addEventListener('keydown', (e) => {
            if (!this.enabled) return;

            const target = e.target;
            const isInputField = target.tagName === 'INPUT' ||
                               target.tagName === 'TEXTAREA' ||
                               target.isContentEditable;

            const key = this.buildShortcutKey(e);
            const handler = this.shortcuts.get(key);

            if (handler) {
                if (handler.allowInInput || !isInputField) {
                    e.preventDefault();
                    handler.callback(e);
                }
            }
        });
    }

    /**
     * Build a normalized shortcut string from a keyboard event.
     *
     * @param {KeyboardEvent} event - The keyboard event
     * @returns {string} Normalized shortcut string like "Ctrl+Shift+k"
     */
    buildShortcutKey(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        if (event.metaKey) parts.push('Meta');

        const key = event.key;
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * Register a keyboard shortcut.
     *
     * If the user has rebound this shortcut, the custom binding is used instead.
     *
     * @param {string} shortcut - Default shortcut (e.g., "Ctrl+k", "Escape")
     * @param {Function} callback - Handler function
     * @param {Object} [options] - Options
     * @param {boolean} [options.allowInInput=false] - Fire even in input fields
     * @param {string} [options.description=''] - Human-readable description
     */
    register(shortcut, callback, options = {}) {
        // Check if user has rebound this shortcut
        const effectiveKey = this.rebindings.get(shortcut) || shortcut;

        this.shortcuts.set(effectiveKey, {
            callback,
            allowInInput: options.allowInInput || false,
            description: options.description || '',
            originalKey: shortcut
        });
    }

    /**
     * Unregister a shortcut by its original or effective key.
     * @param {string} shortcut - Shortcut string to remove
     */
    unregister(shortcut) {
        this.shortcuts.delete(shortcut);
        // Also check if original was rebound
        const rebound = this.rebindings.get(shortcut);
        if (rebound) this.shortcuts.delete(rebound);
    }

    /** Enable all keyboard shortcuts. */
    enable() { this.enabled = true; }

    /** Disable all keyboard shortcuts. */
    disable() { this.enabled = false; }

    /**
     * Get all registered shortcuts for display in Hotkey Editor.
     *
     * @returns {Array<{shortcut: string, originalKey: string, description: string}>}
     */
    getAll() {
        const result = [];
        this.shortcuts.forEach((handler, key) => {
            result.push({
                shortcut: key,
                originalKey: handler.originalKey || key,
                description: handler.description
            });
        });
        return result.sort((a, b) => a.description.localeCompare(b.description));
    }

    /**
     * Rebind a shortcut from its original key to a new key.
     *
     * Moves the handler from the old binding to the new one.
     * Persists the rebinding to localStorage.
     *
     * @param {string} originalKey - The original shortcut string
     * @param {string} newKey - The new shortcut string
     * @returns {boolean} True if rebinding succeeded
     */
    rebind(originalKey, newKey) {
        // Find the handler by original key
        let handler = null;
        let currentKey = null;

        this.shortcuts.forEach((h, k) => {
            if (h.originalKey === originalKey || k === originalKey) {
                handler = h;
                currentKey = k;
            }
        });

        if (!handler) return false;

        // Check for conflict
        if (this.shortcuts.has(newKey) && newKey !== currentKey) {
            return false; // Conflict
        }

        // Move handler
        this.shortcuts.delete(currentKey);
        handler.originalKey = originalKey;
        this.shortcuts.set(newKey, handler);

        // Save rebinding
        this.rebindings.set(originalKey, newKey);
        this._saveRebindings();

        return true;
    }

    /**
     * Reset a shortcut back to its default binding.
     *
     * @param {string} originalKey - The original default shortcut
     */
    resetBinding(originalKey) {
        const customKey = this.rebindings.get(originalKey);
        if (!customKey) return;

        const handler = this.shortcuts.get(customKey);
        if (handler) {
            this.shortcuts.delete(customKey);
            this.shortcuts.set(originalKey, handler);
        }

        this.rebindings.delete(originalKey);
        this._saveRebindings();
    }

    /**
     * Reset all rebindings to defaults.
     */
    resetAll() {
        // Rebuild all shortcuts using original keys
        const handlers = [];
        this.shortcuts.forEach((h, k) => {
            handlers.push({ handler: h, currentKey: k });
        });

        this.shortcuts.clear();
        handlers.forEach(({ handler }) => {
            const key = handler.originalKey || handler.shortcut;
            this.shortcuts.set(key, handler);
        });

        this.rebindings.clear();
        this._saveRebindings();
    }

    /**
     * Load user rebindings from localStorage.
     * @private
     */
    _loadRebindings() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([orig, custom]) => {
                    this.rebindings.set(orig, custom);
                });
            }
        } catch (e) {
            console.warn('[Keyboard] Failed to load rebindings:', e);
        }
    }

    /**
     * Save user rebindings to localStorage.
     * @private
     */
    _saveRebindings() {
        try {
            const obj = {};
            this.rebindings.forEach((custom, orig) => {
                obj[orig] = custom;
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        } catch (e) {
            console.warn('[Keyboard] Failed to save rebindings:', e);
        }
    }
}

// Export singleton
export const keyboard = new KeyboardShortcutManager();
