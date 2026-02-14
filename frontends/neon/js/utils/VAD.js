/**
 * VAD.js — Voice Activity Detection utility.
 *
 * Uses the Web Audio API AnalyserNode to monitor microphone volume
 * and auto-detect speech for hands-free voice input. When speech is
 * detected, recording starts via MediaRecorder. When silence is
 * detected for a configurable timeout, recording stops and the audio
 * blob is emitted via callback.
 *
 * @example
 * const vad = new VAD({
 *     onSpeechStart: () => console.log('Speaking...'),
 *     onSpeechEnd: (blob) => sendToASR(blob),
 *     onVolumeChange: (vol) => updateMeter(vol),
 * });
 * await vad.start();
 * // ... later
 * vad.stop();
 */
export class VAD {
    /**
     * Create a Voice Activity Detector.
     *
     * @param {Object} options - Configuration options
     * @param {function} options.onSpeechStart - Called when speech is detected
     * @param {function(Blob): void} options.onSpeechEnd - Called with audio blob when speech ends
     * @param {function(number): void} [options.onVolumeChange] - Called with normalized volume (0-1) on each frame
     * @param {number} [options.threshold=0.015] - Volume threshold to trigger speech (0-1)
     * @param {number} [options.silenceTimeout=1500] - Milliseconds of silence before stopping (ms)
     * @param {number} [options.activationDelay=200] - Minimum speech duration before recording (ms)
     * @param {string} [options.mimeType='audio/webm'] - MediaRecorder MIME type
     */
    constructor(options = {}) {
        this.onSpeechStart = options.onSpeechStart || (() => {});
        this.onSpeechEnd = options.onSpeechEnd || (() => {});
        this.onVolumeChange = options.onVolumeChange || null;

        this.threshold = options.threshold ?? 0.015;
        this.silenceTimeout = options.silenceTimeout ?? 1500;
        this.activationDelay = options.activationDelay ?? 200;
        this.mimeType = options.mimeType ?? 'audio/webm';

        /** @type {AudioContext|null} */
        this._audioCtx = null;
        /** @type {AnalyserNode|null} */
        this._analyser = null;
        /** @type {MediaStream|null} */
        this._stream = null;
        /** @type {MediaRecorder|null} */
        this._recorder = null;
        /** @type {number|null} */
        this._animFrame = null;

        this._isSpeaking = false;
        this._speechStartTime = 0;
        this._silenceStartTime = 0;
        this._chunks = [];
        this._running = false;
    }

    /**
     * Start listening for voice activity.
     * Requests microphone permission and begins monitoring.
     *
     * @returns {Promise<void>}
     * @throws {Error} If microphone access is denied
     */
    async start() {
        if (this._running) return;

        this._stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        });

        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = this._audioCtx.createMediaStreamSource(this._stream);

        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 512;
        this._analyser.smoothingTimeConstant = 0.8;
        source.connect(this._analyser);

        this._running = true;
        this._monitor();

        console.log('[VAD] Started listening');
    }

    /**
     * Stop listening and release all resources.
     */
    stop() {
        this._running = false;

        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }

        if (this._recorder && this._recorder.state !== 'inactive') {
            this._recorder.stop();
        }
        this._recorder = null;

        if (this._stream) {
            this._stream.getTracks().forEach(t => t.stop());
            this._stream = null;
        }

        if (this._audioCtx) {
            this._audioCtx.close().catch(() => {});
            this._audioCtx = null;
        }

        this._isSpeaking = false;
        this._chunks = [];
        console.log('[VAD] Stopped');
    }

    /** @returns {boolean} Whether VAD is currently running */
    get isRunning() { return this._running; }

    /** @returns {boolean} Whether speech is currently detected */
    get isSpeaking() { return this._isSpeaking; }

    /**
     * Update VAD settings at runtime.
     *
     * @param {Object} settings - Partial settings to update
     * @param {number} [settings.threshold] - Volume threshold (0-1)
     * @param {number} [settings.silenceTimeout] - Silence timeout (ms)
     * @param {number} [settings.activationDelay] - Activation delay (ms)
     */
    updateSettings(settings) {
        if (settings.threshold !== undefined) this.threshold = settings.threshold;
        if (settings.silenceTimeout !== undefined) this.silenceTimeout = settings.silenceTimeout;
        if (settings.activationDelay !== undefined) this.activationDelay = settings.activationDelay;
    }

    /**
     * Core monitoring loop — runs every animation frame while active.
     * Reads volume from AnalyserNode and manages speech state transitions.
     * @private
     */
    _monitor() {
        if (!this._running || !this._analyser) return;

        const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
        this._analyser.getByteFrequencyData(dataArray);

        // Calculate RMS volume normalized to 0-1
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const norm = dataArray[i] / 255;
            sum += norm * norm;
        }
        const volume = Math.sqrt(sum / dataArray.length);

        if (this.onVolumeChange) {
            this.onVolumeChange(volume);
        }

        const now = Date.now();
        const aboveThreshold = volume > this.threshold;

        if (aboveThreshold) {
            if (!this._isSpeaking) {
                // Potential speech start
                if (!this._speechStartTime) {
                    this._speechStartTime = now;
                }
                // Wait for activation delay before confirming speech
                if (now - this._speechStartTime >= this.activationDelay) {
                    this._isSpeaking = true;
                    this._silenceStartTime = 0;
                    this._startRecording();
                    this.onSpeechStart();
                }
            } else {
                // Still speaking — reset silence timer
                this._silenceStartTime = 0;
            }
        } else {
            // Below threshold
            this._speechStartTime = 0;

            if (this._isSpeaking) {
                if (!this._silenceStartTime) {
                    this._silenceStartTime = now;
                }
                // Check if silence has lasted long enough
                if (now - this._silenceStartTime >= this.silenceTimeout) {
                    this._isSpeaking = false;
                    this._silenceStartTime = 0;
                    this._stopRecording();
                }
            }
        }

        this._animFrame = requestAnimationFrame(() => this._monitor());
    }

    /**
     * Start MediaRecorder to capture the speech audio.
     * @private
     */
    _startRecording() {
        if (!this._stream) return;

        this._chunks = [];

        // Pick a supported MIME type
        const types = [this.mimeType, 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
        let selectedType = '';
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) {
                selectedType = t;
                break;
            }
        }

        try {
            this._recorder = new MediaRecorder(this._stream, {
                mimeType: selectedType || undefined,
            });

            this._recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this._chunks.push(e.data);
                }
            };

            this._recorder.start(100); // Collect data in 100ms chunks
        } catch (err) {
            console.error('[VAD] MediaRecorder error:', err);
        }
    }

    /**
     * Stop recording and emit the captured audio blob.
     * @private
     */
    _stopRecording() {
        if (!this._recorder || this._recorder.state === 'inactive') return;

        this._recorder.onstop = () => {
            if (this._chunks.length > 0) {
                const blob = new Blob(this._chunks, {
                    type: this._recorder?.mimeType || 'audio/webm'
                });
                // Only emit if we have meaningful audio (> 1KB)
                if (blob.size > 1024) {
                    this.onSpeechEnd(blob);
                }
            }
            this._chunks = [];
        };

        this._recorder.stop();
    }
}
