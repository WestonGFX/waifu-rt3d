import { bus } from '../core/EventBus.js';
import { state } from '../core/StateManager.js';
import { live2d } from '../live2d/Live2DManager.js';

/**
 * Bridge between the main UI and the 3D/Live2D viewer iframe.
 * All communication with the viewer happens via postMessage (VRM mode)
 * or direct JS calls (Live2D mode).
 *
 * The active mode is determined by `state.config.visual_mode`:
 * - "3D (VRM)" — VRM model in iframe, postMessage API
 * - "2D (Live2D)" — Live2D model on canvas, direct calls
 */
export class ViewerBridge {
    constructor() {
        this.iframe = document.getElementById('vrm-iframe');
        this._pendingCallbacks = {};
        this._mode = 'vrm'; // 'vrm' or 'live2d'
        /** @type {Window|null} Reference to the pet mode popup window, if open */
        this._petWindow = null;

        if (this.iframe) {
            this.iframe.src = "viewer/viewer.html";
            this.iframe.onload = () => this.onLoad();
        }

        // Event bus listeners
        bus.on('character:selected', (char) => this.loadCharacter(char));
        bus.on('config:updated', (cfg) => {
            this.updateSettings(cfg);
            // Check if visual mode changed
            if (cfg.visual_mode) this._setMode(cfg.visual_mode);
        });
        bus.on('viewer:gesture', (data) => this.playGesture(data.gesture));
        bus.on('chat:emotion', (data) => {
            if (data.emotion) this.setEmotion(data.emotion);
            if (data.gesture) this.playGesture(data.gesture);
        });

        // Pet mode: forward AI reply text to the pet popup window
        bus.on('pet:reply', ({ text }) => this.sendPetReply(text));

        // Pet mode: mirror TTS audio to the pet window so its VRM can lip-sync
        bus.on('chat:audioPlay', ({ url }) => {
            if (this._petWindow && !this._petWindow.closed) {
                this._petWindow.postMessage({ type: 'playAudio', audioUrl: url }, '*');
            }
        });

        // Listen for responses from viewer iframe AND pet popup
        window.addEventListener('message', (e) => this._handleViewerMessage(e));
    }

    /**
     * Switch between VRM (3D iframe) and Live2D (canvas) modes.
     * @param {string} visualMode - "3D (VRM)" or "2D (Live2D)"
     */
    _setMode(visualMode) {
        if (visualMode === '2D (Live2D)') {
            this._mode = 'live2d';
            live2d.show();
            console.log('[ViewerBridge] Switched to Live2D mode');
        } else {
            this._mode = 'vrm';
            live2d.hide();
            console.log('[ViewerBridge] Switched to VRM mode');
        }
        // Fix 4: Reload current character so the new mode takes effect immediately.
        // Without this, the user would see the old engine's output until next character switch.
        const currentId = state.state.currentCharacterId;
        if (currentId) {
            const char = state.state.characters.find(c => c.id === currentId);
            if (char) this.loadCharacter(char);
        }
    }

    /** @returns {boolean} True if currently in Live2D mode */
    get isLive2D() { return this._mode === 'live2d'; }

    onLoad() {
        console.log("[ViewerBridge] Iframe Loaded.");
        if (state.state.currentCharacterId) {
            const char = state.state.characters.find(c => c.id === state.state.currentCharacterId);
            if (char) this.loadCharacter(char);
        }
    }

    /**
     * Send a postMessage to the viewer iframe.
     * @param {Object} message - Message object with at minimum a `type` field
     */
    _post(message) {
        if (!this.iframe?.contentWindow) return;
        this.iframe.contentWindow.postMessage(message, '*');
    }

    /**
     * Handle response messages from the viewer iframe.
     * Routes to pending callbacks for request/response pairs.
     * @param {MessageEvent} e - The postMessage event
     */
    _handleViewerMessage(e) {
        const { type } = e.data || {};
        if (!type) return;

        // Pet mode: messages from the popup window are relayed through the EventBus
        // so ChatInterface can handle them like normal user input.
        // Source check prevents spoofing from other origins.
        if (this._petWindow && e.source === this._petWindow) {
            if (type === 'petMessage') {
                bus.emit('pet:userMessage', { text: e.data.text });
            }
            return;
        }

        // Route to pending callback if one exists
        if (this._pendingCallbacks[type]) {
            this._pendingCallbacks[type](e.data);
            delete this._pendingCallbacks[type];
            return;
        }

        // Emit on bus for other components to listen
        if (type === 'screenshotReady') {
            bus.emit('viewer:screenshotReady', e.data);
        } else if (type === 'blendShapeList') {
            bus.emit('viewer:blendShapeList', e.data);
        } else if (type === 'cameraPosition') {
            bus.emit('viewer:cameraPosition', e.data);
        }
    }

    // ── Character & Model ────────────────────────────────────

    /**
     * Load a character's model into the viewer (VRM or Live2D).
     * Also sends background if the character has one configured.
     * @param {Object} char - Character object with model URLs
     */
    loadCharacter(char) {
        console.log("[ViewerBridge] Loading Character:", char.name);

        if (this.isLive2D) {
            // Fix 4: In Live2D mode, never fall through to VRM.
            // If no live2d_model is set, canvas stays empty — that's intentional UX.
            if (char.live2d_model) {
                live2d.loadModel(char.live2d_model);
            }
            // Apply per-character background and greeting, then return.
            if (char.background_url) {
                this.setBackground(char.background_mode || 'image', char.background_url);
            }
            if (char.greeting_animation) {
                setTimeout(() => this.playGesture(char.greeting_animation), 500);
            }
            return;
        }

        // VRM mode — load via iframe postMessage
        this._post({
            type: 'loadCharacter',
            payload: {
                modelUrl: char.vrm_model_url || char.avatar_url || '/files/avatars/default.vrm',
                meta: char
            }
        });

        // Apply per-character background if set
        if (char.background_url) {
            this.setBackground(char.background_mode || 'image', char.background_url);
        }

        // Play greeting animation if set
        if (char.greeting_animation) {
            setTimeout(() => this.playGesture(char.greeting_animation), 500);
        }
    }

    updateSettings(config) {
        if (config.visuals) {
            this._post({
                type: 'updateSettings',
                payload: config.visuals
            });
        }
    }

    // ── Gestures & Expressions ───────────────────────────────

    /**
     * Send a gesture command to the viewer (VRM or Live2D).
     * @param {string} gesture - Gesture name (wave, nod, bow, clap, think, point, celebrate, shy, dance, etc.)
     */
    playGesture(gesture) {
        if (!gesture) return;
        if (this.isLive2D) {
            live2d.playGesture(gesture);
        } else {
            this._post({ type: 'playGesture', payload: { gesture } });
        }
    }

    /**
     * Play a sequence of gestures.
     * @param {Array<{gesture: string}>} sequence - Array of gesture objects
     */
    playGestureSequence(sequence) {
        if (!sequence?.length) return;
        this._post({ type: 'playGestureSequence', payload: sequence });
    }

    /**
     * Send an emotion expression to the viewer (VRM or Live2D).
     * @param {string} emotion - Emotion name (happy, sad, angry, surprised, neutral, thinking, confused)
     * @param {number} [intensity=1.0] - Intensity from 0 to 1
     */
    setEmotion(emotion, intensity = 1.0) {
        if (!emotion) return;
        if (this.isLive2D) {
            live2d.setExpression(emotion);
        } else {
            this._post({ type: 'setEmotion', payload: { emotion }, intensity });
        }
    }

    // ── Blend Shapes (Expression Editor) ─────────────────────

    /**
     * Request the list of available blend shapes from the loaded VRM.
     * Result arrives via 'viewer:blendShapeList' bus event or callback.
     * @returns {Promise<string[]>} Array of blend shape names
     */
    getAvailableBlendShapes() {
        return new Promise((resolve) => {
            this._pendingCallbacks['blendShapeList'] = (data) => resolve(data.shapes || []);
            this._post({ type: 'getAvailableBlendShapes' });
            // Timeout fallback
            setTimeout(() => {
                if (this._pendingCallbacks['blendShapeList']) {
                    delete this._pendingCallbacks['blendShapeList'];
                    resolve([]);
                }
            }, 2000);
        });
    }

    /**
     * Set a single blend shape value.
     * @param {string} name - Blend shape name
     * @param {number} value - Value between 0 and 1
     */
    setBlendShape(name, value) {
        this._post({ type: 'setBlendShape', payload: { name, value } });
    }

    /**
     * Set multiple blend shapes at once.
     * @param {Object<string, number>} shapes - Map of name → value (0-1)
     */
    setBlendShapes(shapes) {
        this._post({ type: 'setBlendShapes', payload: shapes });
    }

    // ── Camera Controls ──────────────────────────────────────

    /**
     * Get the current camera position and target.
     * @returns {Promise<{position: number[], target: number[], radius: number}>}
     */
    getCameraPosition() {
        return new Promise((resolve) => {
            this._pendingCallbacks['cameraPosition'] = (data) => resolve(data.state || {});
            this._post({ type: 'getCameraPosition' });
            setTimeout(() => {
                if (this._pendingCallbacks['cameraPosition']) {
                    delete this._pendingCallbacks['cameraPosition'];
                    resolve({});
                }
            }, 2000);
        });
    }

    /**
     * Set camera position from a preset state.
     * @param {{position: number[], target: number[]}} preset - Camera state
     */
    setCameraPosition(preset) {
        this._post({ type: 'setCameraPosition', payload: preset });
    }

    /** Reset camera to default framing position. */
    resetCamera() {
        this._post({ type: 'resetCamera' });
    }

    /**
     * Enable or disable camera orbit controls.
     * @param {boolean} enabled
     */
    setCameraEnabled(enabled) {
        this._post({ type: 'setCameraEnabled', enabled });
    }

    // ── Lighting ─────────────────────────────────────────────

    /**
     * Apply a lighting preset by name.
     * @param {string} presetName - One of: studio, warm_sunset, cool_moonlight, dramatic, neon
     */
    setLightingPreset(presetName) {
        this._post({ type: 'setLighting', preset: presetName });
    }

    /**
     * Apply custom lighting configuration.
     * @param {Object} config - {key: {color, intensity, position}, fill: {...}, ambient: {...}}
     */
    setLighting(config) {
        this._post({ type: 'setLighting', payload: config });
    }

    // ── Background ───────────────────────────────────────────

    /**
     * Set the viewer background.
     * @param {string} mode - 'transparent', 'color', 'image', 'video', or 'gradient'
     * @param {string} [value] - Color hex, image URL, video URL, or CSS gradient string
     */
    setBackground(mode, value) {
        this._post({ type: 'updateBackground', mode, value });
    }

    // ── Screenshot ───────────────────────────────────────────

    /**
     * Capture a screenshot of the current 3D viewport.
     * @returns {Promise<string>} Base64 PNG data URL
     */
    captureScreenshot() {
        return new Promise((resolve) => {
            this._pendingCallbacks['screenshotReady'] = (data) => resolve(data.dataUrl || '');
            this._post({ type: 'captureScreenshot' });
            setTimeout(() => {
                if (this._pendingCallbacks['screenshotReady']) {
                    delete this._pendingCallbacks['screenshotReady'];
                    resolve('');
                }
            }, 5000);
        });
    }

    // ── Pet Mode ─────────────────────────────────────────────────

    /**
     * Open the VRM viewer as a floating desktop pet popup window.
     *
     * The popup loads viewer.html?pet=1 (and ?url=<vrm> if a model is active).
     * Once open, user messages typed in the popup are forwarded here via
     * window.opener.postMessage → _handleViewerMessage → bus.emit('pet:userMessage').
     * AI replies are sent back by sendPetReply() after ChatInterface finishes streaming.
     *
     * @returns {Window|null} Reference to the opened popup, or null if blocked.
     *
     * @example
     * const win = viewer.openPetMode();
     * if (!win) toast.warning('Enable popups for this site');
     */
    openPetMode() {
        // If already open, focus it instead of opening a second window
        if (this._petWindow && !this._petWindow.closed) {
            this._petWindow.focus();
            return this._petWindow;
        }

        const vrmUrl = state.state.characters?.find(
            c => c.id === state.state.currentCharacterId
        )?.vrm_model_url;

        let petUrl = 'viewer/viewer.html?pet=1';
        if (vrmUrl) petUrl += `&url=${encodeURIComponent(vrmUrl)}`;

        this._petWindow = window.open(
            petUrl,
            'waifu-pet',
            'width=320,height=540,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no'
        );

        if (!this._petWindow) {
            console.warn('[ViewerBridge] Pet window blocked — enable popups for this site');
            return null;
        }

        console.log('[ViewerBridge] Pet window opened');
        return this._petWindow;
    }

    /**
     * Send an AI reply text to the pet popup window.
     * Called after ChatInterface finishes streaming a response.
     *
     * @param {string} text - The AI reply text (may contain emotion/gesture tags
     *   that were already stripped by the backend before reaching metadata.reply)
     */
    sendPetReply(text) {
        if (this._petWindow && !this._petWindow.closed) {
            this._petWindow.postMessage({ type: 'petReply', text }, '*');
        }
    }
}
