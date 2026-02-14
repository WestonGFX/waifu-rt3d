/**
 * PushToTalk.js
 * Microphone capture and ASR integration for voice input.
 *
 * Uses the MediaRecorder API to record audio from the user's microphone,
 * then sends it to the backend /api/asr endpoint for transcription.
 * Supports both push-to-talk (hold) and toggle (click) modes.
 *
 * @example
 * const ptt = new PushToTalk({
 *     onTranscript: (text) => chatInput.value += text,
 *     onStateChange: (state) => updateUI(state),
 * });
 * ptt.attachToButton(document.getElementById('btn-mic'));
 */
import { toast } from './Toast.js';

/** @typedef {'idle'|'recording'|'processing'|'error'} PTTState */

export class PushToTalk {
    /**
     * Create a PushToTalk instance.
     *
     * @param {Object} options
     * @param {function(string): void} options.onTranscript - Called with transcribed text
     * @param {function(PTTState): void} [options.onStateChange] - Called on state transitions
     * @param {string} [options.mode='toggle'] - 'toggle' (click on/off) or 'hold' (hold to record)
     * @param {number} [options.maxDuration=30000] - Max recording duration in ms
     */
    constructor(options = {}) {
        this.onTranscript = options.onTranscript || (() => {});
        this.onStateChange = options.onStateChange || (() => {});
        this.mode = options.mode || 'toggle';
        this.maxDuration = options.maxDuration || 30000;

        /** @type {PTTState} */
        this.state = 'idle';
        /** @type {MediaRecorder|null} */
        this.recorder = null;
        /** @type {MediaStream|null} */
        this.stream = null;
        /** @type {Blob[]} */
        this.chunks = [];
        /** @type {number|null} */
        this.maxTimer = null;
        /** @type {number} */
        this.recordingStartTime = 0;
    }

    /**
     * Attach push-to-talk behavior to a button element.
     *
     * @param {HTMLElement} button - The button to attach to
     */
    attachToButton(button) {
        if (!button) return;

        if (this.mode === 'hold') {
            // Hold to record
            button.addEventListener('mousedown', () => this.startRecording());
            button.addEventListener('mouseup', () => this.stopRecording());
            button.addEventListener('mouseleave', () => {
                if (this.state === 'recording') this.stopRecording();
            });
            // Touch support
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.startRecording();
            });
            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.stopRecording();
            });
        } else {
            // Toggle mode (click to start/stop)
            button.addEventListener('click', () => {
                if (this.state === 'recording') {
                    this.stopRecording();
                } else if (this.state === 'idle') {
                    this.startRecording();
                }
            });
        }
    }

    /**
     * Request microphone access and begin recording.
     */
    async startRecording() {
        if (this.state !== 'idle') return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            this.chunks = [];
            this.recorder = new MediaRecorder(this.stream, {
                mimeType: this._getSupportedMimeType()
            });

            this.recorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.chunks.push(e.data);
            };

            this.recorder.onstop = () => this._handleRecordingComplete();

            this.recorder.start(100); // Collect data every 100ms
            this.recordingStartTime = performance.now();
            this._setState('recording');

            // Safety timeout
            this.maxTimer = setTimeout(() => {
                if (this.state === 'recording') {
                    toast.warning('Max recording time reached', 2000);
                    this.stopRecording();
                }
            }, this.maxDuration);

        } catch (err) {
            console.error('[PTT] Microphone access failed:', err);
            this._setState('error');

            if (err.name === 'NotAllowedError') {
                toast.error('Microphone access denied. Check browser permissions.', 5000);
            } else if (err.name === 'NotFoundError') {
                toast.error('No microphone found.', 5000);
            } else {
                toast.error(`Mic error: ${err.message}`, 5000);
            }

            // Reset to idle after showing error
            setTimeout(() => this._setState('idle'), 2000);
        }
    }

    /**
     * Stop recording and trigger transcription.
     */
    stopRecording() {
        if (this.state !== 'recording' || !this.recorder) return;

        clearTimeout(this.maxTimer);
        this.recorder.stop();

        // Release mic stream
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    /**
     * Handle completed recording — send to ASR endpoint.
     * @private
     */
    async _handleRecordingComplete() {
        const duration = performance.now() - this.recordingStartTime;

        // Ignore very short recordings (accidental clicks)
        if (duration < 300) {
            this._setState('idle');
            return;
        }

        this._setState('processing');

        const mimeType = this._getSupportedMimeType();
        const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav';
        const blob = new Blob(this.chunks, { type: mimeType });
        const formData = new FormData();
        formData.append('file', blob, `recording.${ext}`);

        try {
            const response = await fetch('/api/asr', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`ASR failed: ${errText}`);
            }

            const result = await response.json();
            const text = (result.text || '').trim();

            if (text) {
                this.onTranscript(text);
                toast.success(`Transcribed: "${text.substring(0, 50)}..."`, 2000);
            } else {
                toast.warning('No speech detected', 2000);
            }
        } catch (err) {
            console.error('[PTT] Transcription failed:', err);
            toast.error(`Transcription failed: ${err.message}`, 5000);
        } finally {
            this._setState('idle');
        }
    }

    /**
     * Get the best supported audio MIME type for this browser.
     * @private
     * @returns {string} Supported MIME type
     */
    _getSupportedMimeType() {
        // Prefer webm/opus (smallest, Whisper supports it)
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/wav'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'audio/webm'; // Fallback
    }

    /**
     * Update state and notify listener.
     * @private
     * @param {PTTState} newState
     */
    _setState(newState) {
        this.state = newState;
        this.onStateChange(newState);
    }

    /**
     * Check if the browser supports the required APIs.
     * @returns {boolean}
     */
    static isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }
}
