/**
 * KeyboardShortcuts.js
 * Global keyboard shortcut manager for the application
 */

class KeyboardShortcutManager {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.init();
    }

    init() {
        document.addEventListener('keydown', (e) => {
            if (!this.enabled) return;

            // Don't trigger shortcuts when user is typing in input/textarea
            const target = e.target;
            const isInputField = target.tagName === 'INPUT' ||
                               target.tagName === 'TEXTAREA' ||
                               target.isContentEditable;

            // Build shortcut key string
            const key = this.buildShortcutKey(e);

            // Check if shortcut exists
            const handler = this.shortcuts.get(key);

            if (handler) {
                // Some shortcuts should work even in input fields (Esc, Ctrl+K)
                if (handler.allowInInput || !isInputField) {
                    e.preventDefault();
                    handler.callback(e);
                }
            }
        });
    }

    buildShortcutKey(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        if (event.metaKey) parts.push('Meta');

        // Add the actual key
        const key = event.key;
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * Register a keyboard shortcut
     * @param {string} shortcut - e.g., "Ctrl+k", "Escape", "Ctrl+Shift+p"
     * @param {Function} callback - Function to call when shortcut is triggered
     * @param {Object} options - Options like allowInInput
     */
    register(shortcut, callback, options = {}) {
        this.shortcuts.set(shortcut, {
            callback,
            allowInInput: options.allowInInput || false,
            description: options.description || ''
        });
    }

    unregister(shortcut) {
        this.shortcuts.delete(shortcut);
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    /**
     * Get all registered shortcuts (for help menu)
     */
    getAll() {
        const result = [];
        this.shortcuts.forEach((handler, key) => {
            result.push({
                shortcut: key,
                description: handler.description
            });
        });
        return result;
    }
}

// Export singleton
export const keyboard = new KeyboardShortcutManager();
