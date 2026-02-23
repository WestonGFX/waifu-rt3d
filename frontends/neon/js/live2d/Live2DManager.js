
/**
 * Live2D Manager — handles Live2D Cubism model rendering via pixi-live2d-display.
 * Manages model loading, expressions, gestures (motions), and audio lip sync.
 *
 * Unlike VRM (which runs in an iframe), Live2D renders directly on a canvas
 * in the main window, so calls are direct JS (no postMessage needed).
 */
export class Live2DManager {
    constructor() {
        this.app = null;
        this.model = null;
        this.canvas = document.getElementById('live2d-canvas');
        this.initialized = false;
        this._audioContext = null;
        this._analyser = null;
        this._lipSyncRAF = null;
    }

    /**
     * Initialize the Pixi.js application for Live2D rendering.
     * Only initializes once; subsequent calls are no-ops.
     */
    async init() {
        if (this.initialized) return;

        this.app = new PIXI.Application({
            view: this.canvas,
            autoStart: true,
            backgroundAlpha: 0,
            resizeTo: window
        });

        this.initialized = true;
        console.log("[Live2D] Engine Initialized");
    }

    /**
     * Load a Live2D model from a model3.json path.
     * Removes any previously loaded model first.
     *
     * @param {string} modelPath - Path to model3.json or model.json file
     * @returns {Promise<boolean>} True if model loaded successfully
     */
    async loadModel(modelPath) {
        if (!this.initialized) await this.init();

        // Clear existing model
        if (this.model) {
            this.app.stage.removeChild(this.model);
            this.model.destroy();
            this.model = null;
        }

        try {
            console.log(`[Live2D] Loading: ${modelPath}`);

            // pixi-live2d-display creates the model from the manifest
            const model = await PIXI.live2d.Live2DModel.from(modelPath);

            this.model = model;
            this.app.stage.addChild(this.model);

            // Scale and position to fill viewport
            this.fitModelToScreen();

            // Enable motion/physics ticker
            const ticker = PIXI.Ticker.shared;
            ticker.add(() => {
                if (this.model) {
                    this.model.update(ticker.elapsedMS);
                }
            });

            console.log("[Live2D] Model Loaded Successfully");
            return true;
        } catch (e) {
            console.error("[Live2D] Load Failed:", e);
            return false;
        }
    }

    /**
     * Scale and center the model to fit the viewport.
     */
    fitModelToScreen() {
        if (!this.model) return;

        const scaleX = (window.innerWidth * 0.8) / this.model.width;
        const scaleY = (window.innerHeight * 0.8) / this.model.height;
        const scale = Math.min(scaleX, scaleY);

        this.model.scale.set(scale);
        this.model.x = (window.innerWidth - this.model.width) / 2;
        this.model.y = (window.innerHeight - this.model.height) / 2;
    }

    /**
     * Set a Live2D expression by name.
     * Expression names depend on the model (e.g. "happy", "angry", "f01").
     *
     * @param {string} expressionName - Name of the expression to set
     */
    setExpression(expressionName) {
        if (!this.model) return;
        try {
            // pixi-live2d-display expression API
            if (this.model.internalModel?.motionManager?.expressionManager) {
                this.model.internalModel.motionManager.expressionManager.setExpression(expressionName);
            } else {
                console.warn('[Live2D] Expression manager not available');
            }
        } catch (e) {
            console.warn('[Live2D] Expression not found:', expressionName, e);
        }
    }

    /**
     * Play a motion/gesture by group and index.
     * Common groups: "idle", "tap_body", "flick_head", etc.
     * If no group specified, defaults to playing the first available motion.
     *
     * @param {string} gesture - Gesture name (mapped to motion groups)
     */
    playGesture(gesture) {
        if (!this.model) return;
        try {
            // Map gesture names to common Live2D motion groups
            const motionMap = {
                'wave': 'tap_body',
                'nod': 'flick_head',
                'idle': 'idle',
                'happy': 'tap_body',
                'bow': 'tap_body',
            };
            const group = motionMap[gesture] || gesture || 'idle';
            this.model.motion(group, 0);
        } catch (e) {
            console.warn('[Live2D] Motion not available:', gesture, e);
        }
    }

    /**
     * Play audio with volume-based lip sync for Live2D.
     * Uses Web Audio API to analyze volume and drive the mouth parameter.
     *
     * @param {string} audioUrl - URL of audio file to play
     */
    async playAudio(audioUrl) {
        if (!this.model) return;
        this.stopAudio();

        try {
            if (!this._audioContext) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this._analyser = this._audioContext.createAnalyser();
                this._analyser.fftSize = 256;
            }

            const response = await fetch(audioUrl);
            const buffer = await response.arrayBuffer();
            const audioBuffer = await this._audioContext.decodeAudioData(buffer);

            const source = this._audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this._analyser);
            this._analyser.connect(this._audioContext.destination);

            this._currentSource = source;
            source.start(0);

            source.onended = () => {
                this._currentSource = null;
                this._setMouthOpen(0);
                if (this._lipSyncRAF) cancelAnimationFrame(this._lipSyncRAF);
            };

            // Start lip sync loop
            const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
            let lastValue = 0;
            const updateLipSync = () => {
                if (!this._currentSource) return;
                this._analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                const normalized = Math.min(avg / 128, 1.0);
                const smoothed = normalized * 0.7 + lastValue * 0.3;
                lastValue = smoothed;
                this._setMouthOpen(smoothed);
                this._lipSyncRAF = requestAnimationFrame(updateLipSync);
            };
            updateLipSync();
        } catch (e) {
            console.error('[Live2D] Audio playback error:', e);
        }
    }

    /** Stop any playing audio and reset mouth. */
    stopAudio() {
        if (this._currentSource) {
            try { this._currentSource.stop(); } catch (e) {}
            this._currentSource = null;
        }
        if (this._lipSyncRAF) {
            cancelAnimationFrame(this._lipSyncRAF);
            this._lipSyncRAF = null;
        }
        this._setMouthOpen(0);
    }

    /**
     * Set the mouth open value for lip sync.
     * Drives the ParamMouthOpenY parameter (Cubism standard).
     *
     * @param {number} value - Mouth open amount (0 to 1)
     */
    _setMouthOpen(value) {
        if (!this.model?.internalModel?.coreModel) return;
        try {
            const coreModel = this.model.internalModel.coreModel;
            // Cubism 4 standard parameter
            const paramIndex = coreModel.getParameterIndex('ParamMouthOpenY');
            if (paramIndex >= 0) {
                coreModel.setParameterValueById('ParamMouthOpenY', value);
            }
        } catch (e) {
            // Silently fail — parameter may not exist on all models
        }
    }

    /**
     * Show the Live2D canvas and hide the VRM iframe.
     */
    show() {
        if (this.canvas) this.canvas.style.display = 'block';
        const iframe = document.getElementById('vrm-iframe');
        if (iframe) iframe.style.display = 'none';
    }

    /**
     * Hide the Live2D canvas and show the VRM iframe.
     */
    hide() {
        if (this.canvas) this.canvas.style.display = 'none';
        const iframe = document.getElementById('vrm-iframe');
        if (iframe) iframe.style.display = '';
    }

    /**
     * Handle window resize — resize Pixi app and refit model.
     */
    resize() {
        if (this.app) {
            this.app.resize();
            this.fitModelToScreen();
        }
    }
}

export const live2d = new Live2DManager();
