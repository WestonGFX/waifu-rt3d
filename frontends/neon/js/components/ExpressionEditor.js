import { toast } from '../utils/Toast.js';

/**
 * Expression Editor modal for fine-tuning VRM blend shapes.
 * Shows all available blend shapes as sliders (0-1) with live preview.
 * Supports saving/loading named presets to localStorage.
 *
 * @example
 * const editor = new ExpressionEditor();
 * editor.open();
 */
export class ExpressionEditor {
    constructor() {
        this.modalEl = null;
        this.shapes = [];
        this.presets = this._loadPresets();
        this._injectHTML();
    }

    /** Inject the modal HTML into the DOM. */
    _injectHTML() {
        const div = document.createElement('div');
        div.id = 'expression-editor-modal';
        div.className = 'modal-overlay';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="settings-box" style="max-width:600px; max-height:85vh;">
                <button class="settings-close-x" id="expr-editor-close">&times;</button>
                <div class="settings-content" style="padding:1rem;">
                    <h3 style="font-family:var(--font-display); color:var(--neon-cyan); letter-spacing:2px; margin:0 0 0.5rem;">
                        EXPRESSION EDITOR
                    </h3>
                    <p style="font-size:0.7rem; color:var(--text-muted); margin:0 0 1rem;">
                        Adjust blend shapes in real-time. Changes are previewed live on the model.
                    </p>

                    <!-- Preset Controls -->
                    <div style="display:flex; gap:6px; margin-bottom:1rem; align-items:center;">
                        <select id="expr-preset-select" class="input-field" style="flex:1; font-size:0.75rem;">
                            <option value="">-- Presets --</option>
                        </select>
                        <button class="btn-config" id="expr-preset-load" style="padding:4px 10px; font-size:0.7rem;">LOAD</button>
                        <button class="btn-config" id="expr-preset-save" style="padding:4px 10px; font-size:0.7rem; color:var(--neon-green); border-color:rgba(57,255,20,0.2);">SAVE</button>
                        <button class="btn-config" id="expr-preset-delete" style="padding:4px 10px; font-size:0.7rem; color:var(--neon-magenta); border-color:rgba(255,0,60,0.2);">DEL</button>
                    </div>

                    <!-- Reset Button -->
                    <div style="display:flex; gap:6px; margin-bottom:1rem;">
                        <button class="btn-config" id="expr-reset-all" style="flex:1; padding:4px 10px; font-size:0.7rem;">RESET ALL</button>
                    </div>

                    <!-- Blend Shape Sliders -->
                    <div id="expr-sliders" style="overflow-y:auto; max-height:calc(85vh - 220px); padding-right:0.5rem;">
                        <div style="padding:20px; color:var(--text-muted); font-size:0.75rem; text-align:center;">
                            No model loaded. Load a VRM model first.
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        this.modalEl = div;

        // Bind close
        div.querySelector('#expr-editor-close').onclick = () => this.close();
        div.addEventListener('click', (e) => {
            if (e.target === div) this.close();
        });

        // Bind preset controls
        div.querySelector('#expr-preset-load').onclick = () => this._loadSelectedPreset();
        div.querySelector('#expr-preset-save').onclick = () => this._savePreset();
        div.querySelector('#expr-preset-delete').onclick = () => this._deleteSelectedPreset();
        div.querySelector('#expr-reset-all').onclick = () => this._resetAll();
    }

    /**
     * Open the expression editor modal and fetch blend shapes from the viewer.
     */
    async open() {
        this.modalEl.style.display = 'flex';

        // Request blend shapes from viewer
        const viewer = window.app?.viewer;
        if (!viewer) {
            toast.warn('Viewer not initialized');
            return;
        }

        this.shapes = await viewer.getAvailableBlendShapes();
        this._renderSliders();
        this._populatePresetDropdown();
    }

    /** Close the expression editor modal. */
    close() {
        this.modalEl.style.display = 'none';
    }

    /**
     * Render sliders for each available blend shape.
     * Each slider sends real-time updates to the viewer.
     */
    _renderSliders() {
        const container = this.modalEl.querySelector('#expr-sliders');

        if (!this.shapes.length) {
            container.innerHTML = `<div style="padding:20px; color:var(--text-muted); font-size:0.75rem; text-align:center;">
                No blend shapes available. Load a VRM model first.
            </div>`;
            return;
        }

        container.innerHTML = this.shapes.map(name => `
            <div class="setting-row" style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem; padding:0.4rem 0.6rem;">
                <label style="flex:0 0 120px; font-family:var(--font-mono); font-size:0.7rem; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${name}">
                    ${name}
                </label>
                <input type="range" min="0" max="1" step="0.01" value="0"
                       data-shape="${name}"
                       style="flex:1; accent-color:var(--neon-cyan);">
                <span class="val-display" data-val="${name}" style="min-width:2.5rem; font-size:0.7rem;">0.00</span>
            </div>
        `).join('');

        // Bind slider input events
        container.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const shapeName = e.target.dataset.shape;
                const value = parseFloat(e.target.value);
                const display = container.querySelector(`[data-val="${shapeName}"]`);
                if (display) display.textContent = value.toFixed(2);

                // Send to viewer in real-time
                const viewer = window.app?.viewer;
                if (viewer) viewer.setBlendShape(shapeName, value);
            });
        });
    }

    /** Reset all sliders to 0 and send to viewer. */
    _resetAll() {
        const container = this.modalEl.querySelector('#expr-sliders');
        container.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.value = 0;
            const name = slider.dataset.shape;
            const display = container.querySelector(`[data-val="${name}"]`);
            if (display) display.textContent = '0.00';
        });

        // Send all zeros to viewer
        const viewer = window.app?.viewer;
        if (viewer) {
            const resetMap = {};
            this.shapes.forEach(name => resetMap[name] = 0);
            viewer.setBlendShapes(resetMap);
        }
        toast.info('All expressions reset');
    }

    // ── Presets ──────────────────────────────────────────────

    /**
     * Load presets from localStorage.
     * @returns {Object<string, Object<string, number>>} Map of preset name → shape values
     */
    _loadPresets() {
        try {
            return JSON.parse(localStorage.getItem('waifu-expression-presets')) || {};
        } catch { return {}; }
    }

    /** Save presets to localStorage. */
    _savePresetsToStorage() {
        localStorage.setItem('waifu-expression-presets', JSON.stringify(this.presets));
    }

    /** Populate the preset dropdown with current presets. */
    _populatePresetDropdown() {
        const select = this.modalEl.querySelector('#expr-preset-select');
        const names = Object.keys(this.presets);
        select.innerHTML = '<option value="">-- Presets --</option>' +
            names.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    /** Load the selected preset and apply to sliders + viewer. */
    _loadSelectedPreset() {
        const select = this.modalEl.querySelector('#expr-preset-select');
        const name = select.value;
        if (!name || !this.presets[name]) {
            toast.warn('Select a preset to load');
            return;
        }

        const preset = this.presets[name];
        const container = this.modalEl.querySelector('#expr-sliders');

        // Apply to sliders
        Object.entries(preset).forEach(([shapeName, value]) => {
            const slider = container.querySelector(`input[data-shape="${shapeName}"]`);
            if (slider) {
                slider.value = value;
                const display = container.querySelector(`[data-val="${shapeName}"]`);
                if (display) display.textContent = value.toFixed(2);
            }
        });

        // Send to viewer
        const viewer = window.app?.viewer;
        if (viewer) viewer.setBlendShapes(preset);
        toast.info(`Loaded preset: ${name}`);
    }

    /** Save current slider values as a named preset. */
    _savePreset() {
        const presetName = prompt('Preset name:');
        if (!presetName?.trim()) return;

        const container = this.modalEl.querySelector('#expr-sliders');
        const values = {};
        container.querySelectorAll('input[type="range"]').forEach(slider => {
            const val = parseFloat(slider.value);
            if (val > 0) values[slider.dataset.shape] = val;
        });

        if (Object.keys(values).length === 0) {
            toast.warn('All values are zero — nothing to save');
            return;
        }

        this.presets[presetName.trim()] = values;
        this._savePresetsToStorage();
        this._populatePresetDropdown();
        toast.success(`Saved preset: ${presetName.trim()}`);
    }

    /** Delete the selected preset. */
    _deleteSelectedPreset() {
        const select = this.modalEl.querySelector('#expr-preset-select');
        const name = select.value;
        if (!name) {
            toast.warn('Select a preset to delete');
            return;
        }

        delete this.presets[name];
        this._savePresetsToStorage();
        this._populatePresetDropdown();
        toast.info(`Deleted preset: ${name}`);
    }
}
