import { toast } from '../utils/Toast.js';

/**
 * Theme Editor modal for customizing CSS design tokens.
 * Lists all CSS custom properties from :root and provides color pickers
 * and text inputs for live editing. Supports save/load/export/import.
 *
 * Custom themes are stored in localStorage under 'waifu-custom-themes'.
 * The active custom theme is applied via inline style on :root.
 */
export class ThemeEditor {
    constructor() {
        this.modalEl = null;
        this.customThemes = this._loadThemes();
        this.currentValues = {};
        this._injectHTML();
    }

    /**
     * CSS variables organized by category for the editor UI.
     * Only editable design tokens are listed — computed/internal vars are excluded.
     */
    static EDITABLE_VARS = {
        'Colors': [
            { var: '--bg-void', label: 'Background (Void)', type: 'color' },
            { var: '--bg-deep', label: 'Background (Deep)', type: 'color' },
            { var: '--text-main', label: 'Text Primary', type: 'color' },
            { var: '--text-muted', label: 'Text Muted', type: 'color' },
            { var: '--neon-cyan', label: 'Neon Cyan', type: 'color' },
            { var: '--neon-magenta', label: 'Neon Magenta', type: 'color' },
            { var: '--neon-yellow', label: 'Neon Yellow', type: 'color' },
            { var: '--neon-green', label: 'Neon Green', type: 'color' },
        ],
        'Glass': [
            { var: '--glass-panel', label: 'Panel BG', type: 'text' },
            { var: '--glass-border', label: 'Border', type: 'text' },
            { var: '--glass-highlight', label: 'Highlight', type: 'text' },
            { var: '--glass-blur', label: 'Blur Amount', type: 'text' },
        ],
        'Spacing': [
            { var: '--radius-sm', label: 'Radius SM', type: 'text' },
            { var: '--radius-md', label: 'Radius MD', type: 'text' },
            { var: '--radius-lg', label: 'Radius LG', type: 'text' },
        ]
    };

    /** Inject the modal HTML into the DOM. */
    _injectHTML() {
        const div = document.createElement('div');
        div.id = 'theme-editor-modal';
        div.className = 'modal-overlay';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="settings-box" style="max-width:650px; max-height:85vh;">
                <button class="settings-close-x" id="theme-editor-close">&times;</button>
                <div class="settings-content" style="padding:1rem;">
                    <h3 style="font-family:var(--font-display); color:var(--neon-cyan); letter-spacing:2px; margin:0 0 0.5rem;">
                        THEME EDITOR
                    </h3>
                    <p style="font-size:0.7rem; color:var(--text-muted); margin:0 0 0.75rem;">
                        Customize CSS variables in real-time. Changes preview live.
                    </p>

                    <!-- Theme Preset Controls -->
                    <div style="display:flex; gap:6px; margin-bottom:0.75rem; align-items:center; flex-wrap:wrap;">
                        <select id="theme-preset-select" class="input-field" style="flex:1; min-width:120px; font-size:0.75rem;">
                            <option value="">-- Built-in Themes --</option>
                            <option value="default">Cyberpunk (Default)</option>
                            <option value="light">Light</option>
                            <option value="dracula">Dracula</option>
                            <option value="nord">Nord</option>
                            <option value="pop">Pop</option>
                        </select>
                        <button class="btn-config" id="theme-apply-builtin" style="padding:4px 10px; font-size:0.7rem;">APPLY</button>
                    </div>
                    <div style="display:flex; gap:6px; margin-bottom:1rem; align-items:center; flex-wrap:wrap;">
                        <select id="theme-custom-select" class="input-field" style="flex:1; min-width:120px; font-size:0.75rem;">
                            <option value="">-- Custom Themes --</option>
                        </select>
                        <button class="btn-config" id="theme-custom-load" style="padding:4px 10px; font-size:0.7rem;">LOAD</button>
                        <button class="btn-config" id="theme-save-as" style="padding:4px 10px; font-size:0.7rem; color:var(--neon-green); border-color:rgba(57,255,20,0.2);">SAVE</button>
                        <button class="btn-config" id="theme-custom-delete" style="padding:4px 10px; font-size:0.7rem; color:var(--neon-magenta); border-color:rgba(255,0,60,0.2);">DEL</button>
                    </div>
                    <div style="display:flex; gap:6px; margin-bottom:1rem;">
                        <button class="btn-config" id="theme-export" style="flex:1; padding:4px 10px; font-size:0.7rem;">EXPORT</button>
                        <button class="btn-config" id="theme-import" style="flex:1; padding:4px 10px; font-size:0.7rem;">IMPORT</button>
                        <button class="btn-config" id="theme-reset" style="flex:1; padding:4px 10px; font-size:0.7rem;">RESET</button>
                    </div>

                    <!-- Variable Editors -->
                    <div id="theme-vars" style="overflow-y:auto; max-height:calc(85vh - 280px); padding-right:0.5rem;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        this.modalEl = div;

        // Bind close
        div.querySelector('#theme-editor-close').onclick = () => this.close();
        div.addEventListener('click', (e) => {
            if (e.target === div) this.close();
        });

        // Bind controls
        div.querySelector('#theme-apply-builtin').onclick = () => this._applyBuiltinTheme();
        div.querySelector('#theme-custom-load').onclick = () => this._loadCustomTheme();
        div.querySelector('#theme-save-as').onclick = () => this._saveCustomTheme();
        div.querySelector('#theme-custom-delete').onclick = () => this._deleteCustomTheme();
        div.querySelector('#theme-export').onclick = () => this._exportTheme();
        div.querySelector('#theme-import').onclick = () => this._importTheme();
        div.querySelector('#theme-reset').onclick = () => this._resetToDefault();
    }

    /** Open the theme editor modal. */
    open() {
        this.modalEl.style.display = 'flex';
        this._readCurrentValues();
        this._renderVarEditors();
        this._populateCustomThemeDropdown();
    }

    /** Close the theme editor modal. */
    close() {
        this.modalEl.style.display = 'none';
    }

    /** Read current computed values for all editable CSS vars. */
    _readCurrentValues() {
        const styles = getComputedStyle(document.documentElement);
        this.currentValues = {};
        for (const [, vars] of Object.entries(ThemeEditor.EDITABLE_VARS)) {
            for (const v of vars) {
                this.currentValues[v.var] = styles.getPropertyValue(v.var).trim();
            }
        }
    }

    /** Render the variable editor sections. */
    _renderVarEditors() {
        const container = this.modalEl.querySelector('#theme-vars');
        let html = '';

        for (const [category, vars] of Object.entries(ThemeEditor.EDITABLE_VARS)) {
            html += `<div style="margin-bottom:1rem;">
                <div style="font-family:var(--font-display); font-size:0.85rem; color:var(--neon-cyan); letter-spacing:1px; margin-bottom:0.5rem;">${category}</div>`;

            for (const v of vars) {
                const currentVal = this.currentValues[v.var] || '';
                const isColor = v.type === 'color';

                // Convert hex-like values for color input
                let colorInputVal = '#000000';
                if (isColor) {
                    colorInputVal = this._toHex(currentVal);
                }

                html += `
                <div class="setting-row" style="display:flex; align-items:center; gap:8px; margin-bottom:0.4rem; padding:0.4rem 0.6rem;">
                    <label style="flex:0 0 130px; font-family:var(--font-mono); font-size:0.7rem; color:var(--text-main);">
                        ${v.label}
                    </label>
                    ${isColor ? `
                        <input type="color" value="${colorInputVal}" data-var="${v.var}"
                               style="width:32px; height:24px; border:none; background:none; cursor:pointer; padding:0;">
                        <input type="text" value="${currentVal}" data-var-text="${v.var}" class="input-field"
                               style="flex:1; font-size:0.7rem; padding:3px 6px;">
                    ` : `
                        <input type="text" value="${currentVal}" data-var-text="${v.var}" class="input-field"
                               style="flex:1; font-size:0.7rem; padding:3px 6px;">
                    `}
                </div>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;

        // Bind color picker changes
        container.querySelectorAll('input[type="color"]').forEach(picker => {
            picker.addEventListener('input', (e) => {
                const varName = e.target.dataset.var;
                const textInput = container.querySelector(`input[data-var-text="${varName}"]`);
                if (textInput) textInput.value = e.target.value;
                document.documentElement.style.setProperty(varName, e.target.value);
            });
        });

        // Bind text input changes (for both color and non-color vars)
        container.querySelectorAll('input[data-var-text]').forEach(input => {
            input.addEventListener('change', (e) => {
                const varName = e.target.dataset.varText;
                const value = e.target.value.trim();
                document.documentElement.style.setProperty(varName, value);

                // Sync color picker if present
                const colorPicker = container.querySelector(`input[type="color"][data-var="${varName}"]`);
                if (colorPicker) {
                    try { colorPicker.value = this._toHex(value); } catch(err) {}
                }
            });
        });
    }

    /**
     * Convert a CSS color value to hex format for color input elements.
     * @param {string} val - CSS color value (hex, rgb, named)
     * @returns {string} Hex color string like #ff00aa
     */
    _toHex(val) {
        if (!val) return '#000000';
        val = val.trim();
        if (val.startsWith('#')) {
            // Ensure 6-digit hex
            if (val.length === 4) {
                return `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`;
            }
            return val.substring(0, 7);
        }
        // Try parsing via temporary element
        const temp = document.createElement('div');
        temp.style.color = val;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    }

    // ── Built-in Themes ─────────────────────────────────────

    /** Apply a built-in theme by switching the data-theme attribute. */
    _applyBuiltinTheme() {
        const select = this.modalEl.querySelector('#theme-preset-select');
        const theme = select.value;
        if (!theme) return;

        // Clear any custom inline overrides
        for (const [, vars] of Object.entries(ThemeEditor.EDITABLE_VARS)) {
            for (const v of vars) {
                document.documentElement.style.removeProperty(v.var);
            }
        }

        if (theme === 'default') {
            delete document.body.dataset.theme;
            localStorage.removeItem('waifu-theme');
        } else {
            document.body.dataset.theme = theme;
            localStorage.setItem('waifu-theme', theme);
        }

        // Refresh editor values
        this._readCurrentValues();
        this._renderVarEditors();
        toast.info(`Applied theme: ${theme}`);
    }

    // ── Custom Themes ───────────────────────────────────────

    /**
     * Load custom themes from localStorage.
     * @returns {Object<string, Object<string, string>>} Map of theme name → CSS var values
     */
    _loadThemes() {
        try {
            return JSON.parse(localStorage.getItem('waifu-custom-themes')) || {};
        } catch { return {}; }
    }

    /** Save custom themes to localStorage. */
    _saveThemesToStorage() {
        localStorage.setItem('waifu-custom-themes', JSON.stringify(this.customThemes));
    }

    /** Populate the custom theme dropdown. */
    _populateCustomThemeDropdown() {
        const select = this.modalEl.querySelector('#theme-custom-select');
        const names = Object.keys(this.customThemes);
        select.innerHTML = '<option value="">-- Custom Themes --</option>' +
            names.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    /** Load and apply a custom theme from the dropdown. */
    _loadCustomTheme() {
        const select = this.modalEl.querySelector('#theme-custom-select');
        const name = select.value;
        if (!name || !this.customThemes[name]) {
            toast.warn('Select a custom theme to load');
            return;
        }

        const theme = this.customThemes[name];

        // Clear built-in theme
        delete document.body.dataset.theme;

        // Apply custom vars
        Object.entries(theme).forEach(([varName, value]) => {
            document.documentElement.style.setProperty(varName, value);
        });

        localStorage.setItem('waifu-theme', `custom:${name}`);

        this._readCurrentValues();
        this._renderVarEditors();
        toast.info(`Loaded custom theme: ${name}`);
    }

    /** Save current CSS variable values as a named custom theme. */
    _saveCustomTheme() {
        const name = prompt('Theme name:');
        if (!name?.trim()) return;

        // Gather current values from the editors
        const container = this.modalEl.querySelector('#theme-vars');
        const values = {};
        container.querySelectorAll('input[data-var-text]').forEach(input => {
            values[input.dataset.varText] = input.value.trim();
        });

        this.customThemes[name.trim()] = values;
        this._saveThemesToStorage();
        this._populateCustomThemeDropdown();
        toast.success(`Saved theme: ${name.trim()}`);
    }

    /** Delete a custom theme. */
    _deleteCustomTheme() {
        const select = this.modalEl.querySelector('#theme-custom-select');
        const name = select.value;
        if (!name) {
            toast.warn('Select a custom theme to delete');
            return;
        }

        delete this.customThemes[name];
        this._saveThemesToStorage();
        this._populateCustomThemeDropdown();
        toast.info(`Deleted theme: ${name}`);
    }

    /** Reset to default theme (remove all custom overrides). */
    _resetToDefault() {
        for (const [, vars] of Object.entries(ThemeEditor.EDITABLE_VARS)) {
            for (const v of vars) {
                document.documentElement.style.removeProperty(v.var);
            }
        }
        delete document.body.dataset.theme;
        localStorage.removeItem('waifu-theme');

        this._readCurrentValues();
        this._renderVarEditors();
        toast.info('Reset to default theme');
    }

    // ── Export/Import ────────────────────────────────────────

    /** Export current theme as a JSON file download. */
    _exportTheme() {
        const container = this.modalEl.querySelector('#theme-vars');
        const values = {};
        container.querySelectorAll('input[data-var-text]').forEach(input => {
            values[input.dataset.varText] = input.value.trim();
        });

        const blob = new Blob([JSON.stringify({ name: 'Custom Theme', values }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'waifu-theme.json';
        a.click();
        URL.revokeObjectURL(url);
        toast.info('Theme exported');
    }

    /** Import a theme from a JSON file. */
    _importTheme() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.values || typeof data.values !== 'object') {
                    toast.error('Invalid theme file format');
                    return;
                }

                // Apply imported values
                Object.entries(data.values).forEach(([varName, value]) => {
                    document.documentElement.style.setProperty(varName, value);
                });

                // Save as custom theme
                const name = data.name || file.name.replace('.json', '');
                this.customThemes[name] = data.values;
                this._saveThemesToStorage();
                this._populateCustomThemeDropdown();

                this._readCurrentValues();
                this._renderVarEditors();
                toast.success(`Imported theme: ${name}`);
            } catch (err) {
                toast.error('Failed to import theme: ' + err.message);
            }
        };
        input.click();
    }
}
