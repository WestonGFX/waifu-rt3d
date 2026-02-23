/**
 * HotkeyEditor.js
 * Modal for viewing and rebinding keyboard shortcuts.
 *
 * Features:
 * - Lists all registered shortcuts with descriptions
 * - Click "Rebind" to capture next keypress as new binding
 * - Conflict detection warns if key is already in use
 * - Reset individual or all shortcuts to defaults
 * - Persists to localStorage via KeyboardShortcutManager
 *
 * @example
 * const editor = new HotkeyEditor();
 * editor.open(); // Opens the hotkey editor modal
 */
import { keyboard } from '../utils/KeyboardShortcuts.js';
import { toast } from '../utils/Toast.js';

export class HotkeyEditor {
    constructor() {
        /** @type {string|null} Original key currently being rebound */
        this._rebindingKey = null;
        /** @type {Function|null} Active keydown listener for capture */
        this._captureListener = null;

        this.injectHTML();
    }

    /**
     * Inject the modal HTML into the DOM.
     */
    injectHTML() {
        if (document.getElementById('hotkey-editor-modal')) return;

        const html = `
            <div id="hotkey-editor-modal" class="modal-overlay" style="display:none;">
                <div class="glass-panel" style="position:relative; max-width:600px; width:90vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 0 50px rgba(0,240,255,0.1); overflow:hidden;">
                    <button id="btn-close-hotkeys" class="settings-close-x">&times;</button>
                    <div style="padding:20px 24px; padding-right:48px; display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <h2 style="margin:0 0 4px 0; color:var(--neon-cyan); font-family:var(--font-display); letter-spacing:2px; font-size:1.1rem;">HOTKEYS</h2>
                        <p style="color:var(--text-dim); font-size:0.72rem; margin:0 0 12px 0;">
                            Click "Rebind" to capture a new key combo. Press Escape to cancel.
                        </p>
                        <div id="hotkey-list" style="overflow-y:auto; flex:1; min-height:0;"></div>
                        <div style="display:flex; justify-content:flex-end; padding-top:10px;">
                            <button id="btn-reset-all-hotkeys" class="btn-config" style="padding:5px 14px; font-size:0.75rem; color:var(--neon-red,#ff4444); border-color:rgba(255,68,68,0.2);">
                                Reset All to Defaults
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('btn-close-hotkeys').onclick = () => this.close();
        document.getElementById('hotkey-editor-modal').addEventListener('click', (e) => {
            if (e.target.id === 'hotkey-editor-modal') this.close();
        });
        document.getElementById('btn-reset-all-hotkeys').onclick = () => {
            if (!confirm('Reset all keyboard shortcuts to defaults?')) return;
            keyboard.resetAll();
            toast.success('All shortcuts reset to defaults');
            this._renderList();
        };
    }

    /**
     * Open the hotkey editor and render the shortcut list.
     */
    open() {
        const modal = document.getElementById('hotkey-editor-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        this._renderList();
    }

    /**
     * Close the hotkey editor and cancel any active rebind capture.
     */
    close() {
        const modal = document.getElementById('hotkey-editor-modal');
        if (modal) modal.style.display = 'none';
        this._cancelCapture();
    }

    /**
     * Render the list of all registered shortcuts.
     * @private
     */
    _renderList() {
        const container = document.getElementById('hotkey-list');
        if (!container) return;

        const shortcuts = keyboard.getAll();

        if (shortcuts.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim);">No shortcuts registered.</div>';
            return;
        }

        container.innerHTML = shortcuts.map(s => {
            const isCustom = s.shortcut !== s.originalKey;
            const keyDisplay = this._formatKey(s.shortcut);
            const defaultDisplay = isCustom ? `<span style="color:var(--text-dim); font-size:0.65rem; margin-left:6px;">(default: ${this._formatKey(s.originalKey)})</span>` : '';

            return `
                <div class="hotkey-row" data-original="${s.originalKey}" style="
                    display:flex; align-items:center; gap:10px; padding:8px 10px;
                    border-bottom:1px solid rgba(255,255,255,0.04);
                ">
                    <div style="flex:1; min-width:0;">
                        <div style="color:var(--text-primary); font-size:0.82rem;">${s.description || 'Unnamed shortcut'}</div>
                    </div>
                    <div style="flex:0 0 auto; display:flex; align-items:center; gap:6px;">
                        <kbd style="
                            padding:3px 8px; background:rgba(0,0,0,0.4);
                            border:1px solid rgba(0,240,255,0.2); border-radius:4px;
                            font-family:monospace; font-size:0.75rem;
                            color:${isCustom ? 'var(--neon-magenta,#ff00ff)' : 'var(--neon-cyan)'};
                        ">${keyDisplay}</kbd>
                        ${defaultDisplay}
                        <button class="hotkey-rebind-btn btn-config" data-orig="${s.originalKey}"
                                style="padding:3px 8px; font-size:0.68rem;">Rebind</button>
                        ${isCustom ? `<button class="hotkey-reset-btn btn-config" data-orig="${s.originalKey}"
                                style="padding:3px 8px; font-size:0.68rem; color:var(--text-dim);">Reset</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Bind rebind buttons
        container.querySelectorAll('.hotkey-rebind-btn').forEach(btn => {
            btn.onclick = () => this._startCapture(btn.dataset.orig, btn);
        });

        // Bind reset buttons
        container.querySelectorAll('.hotkey-reset-btn').forEach(btn => {
            btn.onclick = () => {
                keyboard.resetBinding(btn.dataset.orig);
                toast.success('Shortcut reset to default');
                this._renderList();
            };
        });
    }

    /**
     * Start capturing a key combo for rebinding.
     *
     * Temporarily disables the keyboard manager and listens for the next
     * keypress to use as the new binding.
     *
     * @param {string} originalKey - The original key to rebind
     * @param {HTMLElement} btn - The rebind button element (for visual feedback)
     * @private
     */
    _startCapture(originalKey, btn) {
        this._cancelCapture(); // Cancel any previous capture

        this._rebindingKey = originalKey;
        btn.textContent = 'Press key...';
        btn.style.color = 'var(--neon-magenta, #ff00ff)';
        btn.style.borderColor = 'rgba(255,0,255,0.4)';

        // Disable keyboard manager during capture
        keyboard.disable();

        this._captureListener = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Escape cancels
            if (e.key === 'Escape') {
                this._cancelCapture();
                this._renderList();
                return;
            }

            // Ignore lone modifier keys
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

            const newKey = keyboard.buildShortcutKey(e);

            // Attempt rebind
            const success = keyboard.rebind(originalKey, newKey);

            keyboard.enable();
            document.removeEventListener('keydown', this._captureListener, true);
            this._captureListener = null;
            this._rebindingKey = null;

            if (success) {
                toast.success(`Rebound to ${newKey}`);
            } else {
                toast.error(`"${newKey}" is already in use — choose another key`);
            }

            this._renderList();
        };

        document.addEventListener('keydown', this._captureListener, true);
    }

    /**
     * Cancel an active key capture session.
     * @private
     */
    _cancelCapture() {
        if (this._captureListener) {
            document.removeEventListener('keydown', this._captureListener, true);
            this._captureListener = null;
        }
        this._rebindingKey = null;
        keyboard.enable();
    }

    /**
     * Format a shortcut key string for display.
     *
     * Replaces modifier names with symbols on Mac, keeps text on other platforms.
     *
     * @param {string} key - Shortcut string like "Ctrl+Shift+k"
     * @returns {string} Formatted display string
     * @private
     */
    _formatKey(key) {
        const isMac = navigator.platform.includes('Mac');
        if (isMac) {
            return key
                .replace('Ctrl', '⌃')
                .replace('Alt', '⌥')
                .replace('Shift', '⇧')
                .replace('Meta', '⌘');
        }
        return key;
    }
}
