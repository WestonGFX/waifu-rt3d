import { state } from '../core/StateManager.js';
import { bus } from '../core/EventBus.js';
import { API } from '../core/API.js';
import { toast } from '../utils/Toast.js';
import { PushToTalk } from '../utils/PushToTalk.js';
import { VAD } from '../utils/VAD.js';

export class ChatInterface {
    constructor() {
        this.container = document.getElementById('chat-messages');
        this.inputWrapper = document.querySelector('.chat-layer');
        this.setupInput();
        this.sendBtn = document.getElementById('btn-send');

        this.bindEvents();
        this.isThinking = false;
        this.currentRequestAbortController = null;
        this.timeoutWarningTimer = null;
        /** @type {string[]} Messages queued while AI was responding (queue mode, FIFO). */
        this._queuedMessages = [];
        /** @type {string|null} Steering message that triggered an in-flight abort (steer mode). */
        this._steeringMessage = null;

        // TTS queue tracking (#79): class-level so _updateTTSPill() can see them
        /** @type {Array<{url:string,index:number}>} Chunks pending playback */
        this._ttsQueue = [];
        /** @type {number} Total chunks enqueued for the current response */
        this._ttsQueueTotal = 0;

        // Silence padding (#80): brief VAD gate after TTS ends to prevent mic
        // from picking up speaker echo. Set to true by drainAudioQueue, cleared after 300ms.
        this._ttsSilencePad = false;

        // Incognito mode (#123): when true, messages skip DB persistence.
        this._incognito = false;

        // Chat search (#31): tracks open/active state; _searchBar is the DOM element.
        this._searchActive = false;
        /** @type {HTMLElement|null} */
        this._searchBar = null;
        this._searchMatches = [];
        this._searchMatchIndex = 0;

        // Listen for session changes to load history
        bus.on('session:selected', (data) => {
            this.loadHistory(data);
            // Re-render session list to update active highlight
            // (sessions:updated fires before currentSessionId is set)
            if (state.state.sessions?.length) {
                this.renderSessionList(state.state.sessions);
            }
        });
        bus.on('sessions:updated', (sessions) => this.renderSessionList(sessions));
        bus.on('character:selected', (char) => {
            this._showGreeting(char);
            this._updateStatusTopLine(char);
        });

        // Pet mode: route messages from the pet popup through the normal send pipeline.
        // ViewerBridge emits 'pet:userMessage' when it receives a postMessage from the
        // popup window; we inject the text into the input and trigger sendMessage()
        // so the full streaming pipeline (emotion, TTS, history) runs unchanged.
        bus.on('pet:userMessage', ({ text }) => {
            if (this.isThinking) return; // drop silently if AI is already busy
            this.input.value = text;
            this.sendMessage();
        });

        // Multi-character chat mode
        /** @type {number[]|null} Active multi-chat character IDs */
        this._multiChatIds = null;
        bus.on('multi-chat:start', (charIds) => {
            this._multiChatIds = charIds;
        });

        // Phase 8A: Reaction portrait overlay — shows the character's AI-generated
        // expression portrait as a brief floating image when an emotion fires.
        this._reactionPortraitEl = this._createReactionPortraitEl();
        bus.on('chat:emotion', ({ emotion }) => {
            // #112: Mood-reactive background — set data-emotion on <body> for CSS glow shifts
            if (emotion) document.body.dataset.emotion = emotion;

            const char = state.state.characters?.find(c => c.id == state.state.currentCharacterId);
            if (!char) return;
            const portraits = char.expr_portraits;
            if (!portraits) return;
            // expr_portraits may be stored as a JSON string or already parsed
            const map = typeof portraits === 'string' ? (() => { try { return JSON.parse(portraits); } catch { return {}; } })() : (portraits || {});
            const url = map[emotion] || map['neutral'];
            if (url) this._showReactionPortrait(url, emotion);
        });

        // New chat button
        const newChatBtn = document.getElementById('btn-new-chat');
        if (newChatBtn) {
            newChatBtn.onclick = async () => {
                await state.createSession();
                this.container.innerHTML = '';
                toast.info('New chat started', 2000);
                // Show greeting for current character in new session
                const char = state.state.characters?.find(c => c.id == state.state.currentCharacterId);
                if (char) this._showGreeting(char);
            };
        }

        // Import chat button
        const importBtn = document.getElementById('btn-import-chat');
        if (importBtn) {
            importBtn.onclick = () => this._importSession();
        }

        // Show archived sessions toggle
        this._showingArchived = false;
        const archiveBtn = document.getElementById('btn-show-archived');
        if (archiveBtn) {
            archiveBtn.onclick = async () => {
                this._showingArchived = !this._showingArchived;
                archiveBtn.style.opacity = this._showingArchived ? '1' : '0.6';
                archiveBtn.title = this._showingArchived ? 'Show Active' : 'Show Archived';
                try {
                    const res = await API.get(`sessions?archived=${this._showingArchived}`);
                    this.renderSessionList(res.sessions || []);
                } catch (err) {
                    toast.error('Failed to load sessions');
                }
            };
        }

        // Session search (toggle visible on Ctrl+F when sidebar focused)
        const searchInput = document.getElementById('session-search');
        if (searchInput) {
            let searchTimer = null;
            searchInput.oninput = () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(async () => {
                    const q = searchInput.value.trim();
                    try {
                        const url = q ? `sessions?search=${encodeURIComponent(q)}` : 'sessions';
                        const res = await API.get(url);
                        this.renderSessionList(res.sessions || []);
                    } catch (err) {
                        console.warn('[Chat] Session search failed:', err);
                    }
                }, 300);
            };
            // Show search on click of the header
            const header = document.querySelector('#session-list-panel span[style*="CHAT THREADS"]') ||
                           document.querySelector('#session-list-panel .font-display');
            // Just keep it visible for now
            searchInput.style.display = 'block';
        }

        // Initialize Push-to-Talk if browser supports it
        this.initPushToTalk();

        // Initialize Voice Activity Detection (hands-free mode)
        this.initVAD();

        // Inject export button into chat header
        this._injectExportButton();
    }

    setupInput() {
        // Now using existing textarea from HTML
        this.input = document.getElementById('chat-input');
        if (!this.input) console.error("Chat Input not found!");
    }

    /**
     * Initialize push-to-talk voice input.
     * Attaches to #btn-mic, inserts transcribed text into the chat input.
     */
    initPushToTalk() {
        const micBtn = document.getElementById('btn-mic');
        if (!micBtn) return;

        if (!PushToTalk.isSupported()) {
            micBtn.style.display = 'none';
            return;
        }

        // Live transcription preview (#81): When asr_provider is 'browser', use the
        // Web Speech API's interimResults to show ghost text in the input as the user speaks.
        // The interim text is visually dimmed and replaced by the final PTT transcript on stop.
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        /** @type {SpeechRecognition|null} */
        this._speechPreview = SR ? new SR() : null;
        if (this._speechPreview) {
            this._speechPreview.continuous = true;
            this._speechPreview.interimResults = true;
            this._speechPreview.onresult = (e) => {
                if (!this.input) return;
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (!e.results[i].isFinal) interim += e.results[i][0].transcript;
                }
                if (interim) {
                    this.input.dataset.interim = '1';
                    this.input.value = interim;
                    this.input.style.opacity = '0.55';
                    this.input.dispatchEvent(new Event('input'));
                }
            };
            this._speechPreview.onerror = () => { /* silent — PTT handles errors */ };
        }

        this.ptt = new PushToTalk({
            mode: 'toggle',
            maxDuration: 30000,
            minConfidence: state.state.config?.asr_min_confidence ?? 0, // #20
            onTranscript: (text) => {
                // Clear any interim preview, then insert the final transcribed text
                if (this.input) {
                    this.input.dataset.interim = '';
                    this.input.style.opacity = '';
                    const current = this.input.dataset.interim ? '' : this.input.value.replace(/\s+$/, '');
                    const separator = current && !current.endsWith(' ') ? ' ' : '';
                    this.input.value = (current ? current + separator : '') + text;
                    this.input.dispatchEvent(new Event('input'));
                    this.input.focus();
                }
            },
            onStateChange: (pttState) => {
                micBtn.classList.remove('recording', 'processing');
                if (pttState === 'recording') {
                    micBtn.classList.add('recording');
                    micBtn.title = 'Recording... Click to stop';
                    // Start live preview if browser ASR is selected
                    if (this._speechPreview && state.state.config?.asr_provider !== 'faster_whisper') {
                        try { this._speechPreview.start(); } catch (_) { /* already started */ }
                    }
                } else {
                    // Stop live preview on any non-recording state
                    if (this._speechPreview) {
                        try { this._speechPreview.stop(); } catch (_) {}
                    }
                    if (this.input) {
                        this.input.style.opacity = '';
                        this.input.dataset.interim = '';
                    }
                    if (pttState === 'processing') {
                        micBtn.classList.add('processing');
                        micBtn.title = 'Transcribing...';
                    } else {
                        micBtn.title = 'Voice Input (Push-to-Talk)';
                    }
                }
            }
        });

        this.ptt.attachToButton(micBtn);

        // Push-to-talk Space hotkey (#18): hold Space to record, release to stop.
        // Guards: only fires when the chat input is NOT focused (to avoid blocking typing)
        // and when VAD is not already active (they would conflict).
        let _spaceHeld = false;
        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Space' || e.repeat) return;
            if (document.activeElement === this.input) return; // typing in input
            if (this.vadActive) return; // VAD already handling mic
            if (_spaceHeld) return;
            _spaceHeld = true;
            if (this.ptt?.state === 'idle') this.ptt.startRecording();
        });
        document.addEventListener('keyup', (e) => {
            if (e.code !== 'Space') return;
            _spaceHeld = false;
            if (this.ptt?.state === 'recording') this.ptt.stopRecording();
        });
    }

    /**
     * Initialize Voice Activity Detection for hands-free voice input.
     * Injects a VAD toggle button next to the mic button. When active,
     * continuously monitors microphone and auto-transcribes detected speech.
     */
    initVAD() {
        const micBtn = document.getElementById('btn-mic');
        if (!micBtn) return;

        // Inject VAD toggle button after the mic button
        const vadBtn = document.createElement('button');
        vadBtn.id = 'btn-vad';
        vadBtn.className = 'btn-icon btn-vad';
        vadBtn.title = 'Hands-Free Mode (Voice Activity Detection)';
        vadBtn.innerHTML = '&#x1F50A;'; // speaker icon
        vadBtn.style.cssText = 'font-size:0.9rem; opacity:0.6; transition:all 0.2s;';
        micBtn.parentNode.insertBefore(vadBtn, micBtn.nextSibling);

        this.vadActive = false;
        this.vad = null;

        vadBtn.onclick = () => this._toggleVAD(vadBtn);
    }

    /**
     * Toggle VAD on/off.
     * When activated, creates a VAD instance that monitors mic volume
     * and auto-sends transcribed speech to the chat.
     * @private
     * @param {HTMLButtonElement} btn - The VAD toggle button
     */
    async _toggleVAD(btn) {
        if (this.vadActive) {
            // Turn off VAD
            if (this.vad) {
                this.vad.stop();
                this.vad = null;
            }
            this.vadActive = false;
            btn.style.opacity = '0.6';
            btn.style.color = '';
            btn.style.textShadow = '';
            btn.title = 'Hands-Free Mode (Voice Activity Detection)';
            toast.info('Hands-free mode OFF', 1500);
            // Remove volume indicator
            const indicator = document.getElementById('vad-volume-indicator');
            if (indicator) indicator.remove();
            return;
        }

        // Turn on VAD — stop PTT if active
        if (this.ptt?.isRecording) {
            this.ptt.stop();
        }

        try {
            this.vad = new VAD({
                threshold: state.state.config?.vad_threshold ?? 0.015,
                silenceTimeout: 1500,
                activationDelay: 200,
                onSpeechStart: () => {
                    // Silence padding (#80): ignore speech events during the post-TTS cooldown
                    if (this._ttsSilencePad) return;
                    btn.classList.add('recording');
                    const indicator = document.getElementById('vad-volume-indicator');
                    if (indicator) indicator.style.background = 'var(--neon-magenta)';
                    // interrupt_mode: stop TTS playback when user starts speaking
                    if (state.state.config?.interrupt_mode !== false && this._currentAudio) {
                        this._currentAudio.pause();
                        this._currentAudio.currentTime = 0;
                        this._currentAudio = null;
                    }
                },
                onSpeechEnd: async (blob) => {
                    if (this._ttsSilencePad) return; // still in cooldown, discard this segment
                    btn.classList.remove('recording');
                    const indicator = document.getElementById('vad-volume-indicator');
                    if (indicator) indicator.style.background = 'var(--neon-green)';
                    await this._processVADAudio(blob);
                },
                onVolumeChange: (vol) => {
                    const indicator = document.getElementById('vad-volume-indicator');
                    if (indicator) {
                        indicator.style.width = `${Math.min(vol * 200, 100)}%`;
                    }
                },
            });

            await this.vad.start();
            this.vadActive = true;
            btn.style.opacity = '1';
            btn.style.color = 'var(--neon-green)';
            btn.style.textShadow = '0 0 8px var(--neon-green)';
            btn.title = 'Hands-Free Mode: ACTIVE (click to stop)';
            toast.success('Hands-free mode ON — speak naturally', 2000);

            // Add volume indicator bar
            this._injectVADIndicator();
        } catch (err) {
            toast.error(`Mic access denied: ${err.message}`, 3000);
        }
    }

    /**
     * Inject a small volume indicator bar above the input area.
     * Shows real-time mic volume when VAD is active.
     * @private
     */
    _injectVADIndicator() {
        if (document.getElementById('vad-volume-indicator')) return;

        const inputArea = document.querySelector('.input-area');
        if (!inputArea) return;

        const bar = document.createElement('div');
        bar.id = 'vad-volume-indicator';
        bar.style.cssText = `
            position:absolute; top:-3px; left:0; height:3px; width:0%;
            background:var(--neon-green); border-radius:2px;
            transition:width 0.05s linear, background 0.2s;
            pointer-events:none; z-index:5;
        `;
        inputArea.style.position = 'relative';
        inputArea.appendChild(bar);
    }

    /**
     * Process audio from VAD — send to ASR endpoint and insert transcription.
     * @private
     * @param {Blob} audioBlob - Recorded audio blob
     */
    async _processVADAudio(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'vad_recording.webm');

            const result = await API.upload('asr', formData);
            const text = result?.text?.trim();
            if (text) {
                // Insert transcribed text into chat input
                if (this.input) {
                    const current = this.input.value;
                    const separator = current && !current.endsWith(' ') ? ' ' : '';
                    this.input.value = current + separator + text;
                    this.input.dispatchEvent(new Event('input'));
                    this.input.focus();
                }
            }
        } catch (err) {
            console.warn('[VAD] ASR transcription failed:', err.message);
        }
    }

    bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.onclick = () => this.sendMessage();
        }
        if (this.input) {
            // Auto-expand
            this.input.addEventListener('input', () => {
                this.input.style.height = 'auto';
                this.input.style.height = Math.min(this.input.scrollHeight, 200) + 'px';
            });

            // Enter to send, Shift+Enter for newline
            this.input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            };
        }

        // Chat message search (#31)
        this._initChatSearch();
    }

    /**
     * Set the thinking state — updates status indicator and shows/hides thinking bubble.
     * Three distinct phases during streaming:
     *   1. PROCESSING INPUT... (prefill — LM Studio ingesting the prompt)
     *   2. GENERATING: N tokens | X.X tok/s (real tokens arriving)
     *   3. DONE: N tokens | X.X tok/s (stream complete)
     *
     * @param {boolean} thinking - Whether the AI is currently generating
     * @param {string|null} avatarUrl - Avatar URL for the thinking bubble
     */
    setThinking(thinking, avatarUrl) {
        this.isThinking = thinking;
        if (thinking) {
            // Reset counters only when entering thinking state — not on exit,
            // so the final "DONE: N tok" label can read the real token count.
            this.tokenCount = 0;
            this.streamStartTime = null;
            this.prefillStartTime = performance.now();
            this.inputTokens = 0;
            this._lastMetadata = null;
        }

        const dot = document.querySelector('.status-dot');
        const label = document.getElementById('neural-link-status');

        if (thinking) {
            this._showThinkingBubble(avatarUrl);

            if (dot && label) {
                dot.style.background = '#ff00ff';
                dot.style.boxShadow = '0 0 15px #ff00ff';
                dot.classList.add('thinking');
                label.innerText = 'SENDING TO AI...';
                label.style.color = '#ff00ff';
            }
        } else {
            this._removeThinkingBubble();

            if (dot && label) {
                dot.style.background = '#00ffff';
                dot.style.boxShadow = '0 0 15px #00ffff';
                dot.classList.remove('thinking');

                // Show final stats — persists until next message (no revert to idle).
                // Prefer server-authoritative metadata values when the frontend
                // counters are 0 (e.g. adapter didn't emit individual token events).
                const meta = this._lastMetadata;
                let tokCount = this.tokenCount;
                let genTimeSec = this.streamStartTime
                    ? (performance.now() - this.streamStartTime) / 1000
                    : 0;

                // Fallback to server metadata when frontend counters are empty
                if (tokCount === 0 && meta?.token_count > 0) {
                    tokCount = meta.token_count;
                }
                if (genTimeSec === 0 && meta?.generation_time_ms > 0) {
                    genTimeSec = meta.generation_time_ms / 1000;
                }

                this._lastGenTime = genTimeSec;
                this._lastTotalTime = (performance.now() - this.prefillStartTime) / 1000;
                this._lastSpeed = genTimeSec > 0
                    ? (tokCount / genTimeSec).toFixed(1) : '0';
                label.innerText = `DONE: ${tokCount} tok | ${this._lastSpeed} tok/s | ${this._lastTotalTime.toFixed(1)}s`;
                label.style.color = '#00ff88';
            }
        }
    }

    /**
     * Show "PROCESSING INPUT..." status during LLM prefill phase.
     * Called when the backend sends the 'processing' SSE event.
     *
     * @param {number} inputTokens - Estimated input token count
     */
    _setProcessingPhase(inputTokens) {
        this.inputTokens = inputTokens || 0;
        const label = document.getElementById('neural-link-status');
        if (label && this.isThinking) {
            const tokenInfo = this.inputTokens > 0 ? ` (~${this.inputTokens} tokens)` : '';
            label.innerText = `AI READING INPUT${tokenInfo}...`;
        }
    }

    /**
     * Transition from prefill to generation phase.
     * Called when the first token arrives from the LLM stream.
     * Records TTFT (Time To First Token) for display in the right panel.
     */
    _setGeneratingPhase() {
        this.streamStartTime = performance.now();

        // TTFT = time from request send (prefillStartTime) to first token
        if (this.prefillStartTime) {
            const ttft = ((this.streamStartTime - this.prefillStartTime) / 1000).toFixed(2);
            const ttftEl = document.getElementById('stat-ttft');
            if (ttftEl) ttftEl.textContent = ttft + 's';
        }

        const label = document.getElementById('neural-link-status');
        if (label && this.isThinking) {
            label.innerText = 'AI WRITING: 0 tokens';
        }
    }

    /**
     * Update the status label with real token count and speed during streaming.
     * Called each time a new token arrives from the SSE stream.
     *
     * @private
     */
    _updateTokenProgress() {
        const label = document.getElementById('neural-link-status');
        if (!label || !this.isThinking) return;

        const elapsed = this.streamStartTime
            ? (performance.now() - this.streamStartTime) / 1000
            : 0;
        const speed = elapsed > 0.2 ? (this.tokenCount / elapsed).toFixed(1) : '--';
        label.innerText = `AI WRITING: ${this.tokenCount} tok | ${speed} tok/s`;
    }

    /**
     * Update the top status line with the current character name and model info.
     * Shows meaningful, user-friendly info about who they're chatting with.
     *
     * @private
     * @param {Object} char - Character object with name and other fields
     */
    _updateStatusTopLine(char) {
        const topLine = document.getElementById('ai-status-top');
        if (!topLine) return;
        if (char && char.name) {
            topLine.innerText = `CHATTING WITH: ${char.name.toUpperCase()}`;
        } else {
            topLine.innerText = 'NO CHARACTER SELECTED';
        }
    }

    /**
     * Show animated thinking bubble with bouncing dots and glowing avatar.
     * @private
     * @param {string|null} avatarUrl - Avatar image URL
     */
    _showThinkingBubble(avatarUrl) {
        this._removeThinkingBubble(); // Clean up any stale one
        const row = document.createElement('div');
        row.className = 'message-thinking';
        row.id = 'thinking-bubble';

        row.innerHTML = `
            <div class="chat-avatar" style="
                width: 2.2rem; height: 2.2rem;
                margin-right: 0.625rem;
                border-radius: 50%;
                overflow: hidden;
                flex-shrink: 0;
            ">
                <img src="${avatarUrl || 'assets/default_avatar.png'}"
                     onerror="this.src='assets/default_avatar.png'"
                     style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="bubble-content" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,0,255,0.15); border-radius:14px 14px 14px 2px;">
                <div class="thinking-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;

        this.container.appendChild(row);
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Remove the thinking bubble from the chat.
     * @private
     */
    _removeThinkingBubble() {
        const existing = document.getElementById('thinking-bubble');
        if (existing) existing.remove();
    }

    /**
     * Resolve the current character's 2D avatar URL for chat bubbles.
     * Uses avatar_2d_url first, falls back to name-based path.
     *
     * @returns {string|null} Avatar URL or null if no character selected
     */
    _getCharacterAvatarUrl() {
        if (!state.state.currentCharacterId) return null;
        const char = state.state.characters.find(c => c.id == state.state.currentCharacterId);
        if (!char) return null;

        const primaryUrl = char.avatar_2d_url || char.avatar_url;
        if (primaryUrl && !primaryUrl.includes('default') && !primaryUrl.endsWith('.vrm')) {
            return primaryUrl;
        }
        // Extract parenthetical name e.g. "Fox (Rin)" → "rin"
        const parenMatch = char.name.match(/\((\w+)\)/);
        const cleanName = parenMatch ? parenMatch[1].toLowerCase() : char.name.toLowerCase().split(' ')[0];
        return `/images/${cleanName}_pixel_portrait.png`;
    }

    /**
     * Send a message using the streaming SSE endpoint (/api/chat/stream).
     * Tokens appear in real-time in the chat bubble, and the status bar
     * shows actual token count and generation speed (tok/s).
     */
    /**
     * Show a "⏳ queued" badge near the send button so the user knows their
     * message is buffered and will fire automatically.
     *
     * @param {string} text - The queued message text (shown truncated).
     */
    /**
     * Update the queued-message badge to reflect the current queue state.
     * Shows the first message text and a count if there are multiple.
     */
    _showQueuedBadge() {
        this._hideQueuedBadge();
        const count = this._queuedMessages.length;
        if (count === 0) return;

        const badge = document.createElement('div');
        badge.id = 'queued-msg-badge';

        const first = this._queuedMessages[0];
        const truncated = first.length > 35 ? first.slice(0, 32) + '…' : first;
        const countLabel = count > 1 ? ` (+${count - 1} more)` : '';
        badge.textContent = `⏳ Queued: ${truncated}${countLabel}`;
        badge.title = this._queuedMessages.join('\n');

        badge.style.cssText = [
            'position:absolute', 'bottom:calc(100% + 4px)', 'right:0',
            'background:rgba(0,240,255,0.12)', 'border:1px solid rgba(0,240,255,0.4)',
            'color:var(--neon-cyan)', 'font-size:0.6rem', 'padding:2px 8px',
            'border-radius:4px', 'white-space:nowrap', 'max-width:260px',
            'overflow:hidden', 'text-overflow:ellipsis', 'z-index:50',
            'pointer-events:none'
        ].join(';');

        if (this.sendBtn?.parentElement) {
            this.sendBtn.parentElement.style.position = 'relative';
            this.sendBtn.parentElement.appendChild(badge);
        }
    }

    /** Remove the queued message badge. */
    _hideQueuedBadge() {
        document.getElementById('queued-msg-badge')?.remove();
    }

    async sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // ── Mid-thinking intercept ─────────────────────────────────────────────
        // When the AI is already generating, behaviour depends on the
        // `message_input_mode` config setting:
        //   "queue"   – buffer the message; auto-send it once the current
        //               response finishes (default)
        //   "steer"   – abort the current generation and immediately redirect
        //               the conversation with the new message
        //   "discard" – silently drop the message (classic behaviour)
        if (this.isThinking) {
            const mode = state.state.config?.message_input_mode ?? 'queue';
            this.input.value = '';
            this.input.style.height = '';

            if (mode === 'steer') {
                // Mark as a steering abort so the catch block stays silent
                this._steeringMessage = text;
                if (this.currentRequestAbortController) {
                    this.currentRequestAbortController.abort();
                }
            } else if (mode === 'queue') {
                this._queuedMessages.push(text);
                this._showQueuedBadge();
            }
            // 'discard' → fall through and do nothing
            return;
        }

        // Disable the send button (prevents double-submit) but keep input editable
        // so the user can type their next message while the AI is responding.
        if (this.sendBtn) this.sendBtn.disabled = true;
        this.input.value = '';
        this.input.style.height = '';

        // Multi-character chat intercept
        if (this._multiChatIds && this._multiChatIds.length > 1) {
            const ids = [...this._multiChatIds];
            await this.sendMultiMessage(text, ids);
            return;
        }

        // Show user message
        this.addBubble(text, true, null);

        const avatarUrl = this._getCharacterAvatarUrl();

        // Start thinking indicator
        this.setThinking(true, avatarUrl);

        // Abort controller for cancellation
        this.currentRequestAbortController = new AbortController();

        // Timeout warning at 30s — show a non-blocking in-chat banner instead of a
        // browser confirm() dialog (which blocks browser events and breaks automation).
        this._timeoutBanner = null;
        this.timeoutWarningTimer = setTimeout(() => {
            if (!this.isThinking) return;
            this._showTimeoutBanner(text);
        }, 30000);

        const startTime = performance.now();

        try {
            // Build streaming request
            const payload = {
                text,
                character_id: state.state.currentCharacterId,
                session_id: state.state.currentSessionId,
                // Opt-in to sentence-chunked TTS when TTS is globally enabled.
                // The server will emit audio_chunk SSE events as sentences complete.
                speak: !!(state.config?.tts?.enabled),
                // Incognito mode (#123): skip DB persistence for this exchange
                ...(this._incognito && { incognito: true }),
            };

            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: this.currentRequestAbortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            // Defer bubble creation until first token arrives (avoids blank bubble)
            let streamRow = null;
            let streamContentEl = null;
            let fullText = '';
            let metadata = null;

            // ── Sentence-chunked TTS audio queue (Phase 6G) ────────────────────
            //
            // WHY a queue instead of playing audio immediately?
            //   The server fires TTS synthesis for each sentence concurrently
            //   while the LLM streams tokens.  Because network latency varies,
            //   sentence 2 might arrive *before* sentence 1 has finished playing.
            //   Without a queue, audio clips overlap or play out of order.
            //
            // HOW it works:
            //   1. Each audio_chunk SSE event carries a URL + an integer `index`.
            //   2. enqueueAudioChunk() inserts the chunk into a sorted array.
            //   3. drainAudioQueue() pops and plays the next clip; on `ended` or
            //      `error` it calls itself again (chain-plays the whole queue).
            //   4. The viewer iframe is notified via postMessage so the VRM
            //      character's mouth moves in sync with the audio.
            const audioQueue = [];
            let audioQueuePlaying = false;

            // Reset class-level TTS queue trackers for this response (#79)
            this._ttsQueue = audioQueue;
            this._ttsQueueTotal = 0;

            /**
             * Pop the next audio chunk from the sorted queue and play it.
             *
             * Calls itself recursively via `onended` so each clip starts
             * immediately after the previous one finishes — no gap, no overlap.
             * On `onerror` it skips the broken clip and plays the next one
             * so a single bad audio file doesn't freeze the whole queue.
             */
            const drainAudioQueue = () => {
                if (!audioQueue.length) {
                    audioQueuePlaying = false;
                    this._updateTTSPill(); // Hide pill when queue is empty
                    // Silence padding (#80): gate VAD for 300ms so the mic doesn't pick
                    // up speaker echo immediately after the character finishes speaking.
                    if (this.vadActive) {
                        this._ttsSilencePad = true;
                        setTimeout(() => { this._ttsSilencePad = false; }, 300);
                    }
                    return;
                }
                audioQueuePlaying = true;
                const { url } = audioQueue.shift();
                this._updateTTSPill(); // Update pill position after pop

                // Preload the *next* chunk while the current one plays (#47).
                // fetch() with no-op consumption warms the browser's audio cache so
                // the next Audio() constructor finds it already in memory.
                if (audioQueue.length > 0) {
                    fetch(audioQueue[0].url, { cache: 'force-cache' }).catch(() => {});
                }

                const audio = new Audio(url);
                audio.onended = drainAudioQueue;
                // On error: log it and skip to the next chunk rather than stalling
                audio.onerror = (err) => {
                    console.warn('[ChatInterface] Audio chunk error, skipping:', url, err);
                    drainAudioQueue();
                };

                // Tell the VRM viewer to activate lip sync for this audio file.
                // The viewer.html listens for postMessage({type:'audioUrl', audioUrl})
                // and attaches its WebAudio analyser to the same URL.
                const viewerIframe = document.querySelector('.viewport-layer iframe');
                if (viewerIframe?.contentWindow) {
                    viewerIframe.contentWindow.postMessage({ type: 'audioUrl', audioUrl: url }, '*');
                }

                // .play() returns a Promise — catch it to avoid unhandled-rejection
                // warnings in Chrome when the user navigates away mid-playback.
                audio.play().catch((err) => {
                    console.warn('[ChatInterface] Audio play() rejected:', err.message);
                    drainAudioQueue();
                });
            };

            /**
             * Add a TTS chunk to the queue and start draining if idle.
             *
             * The sort by `index` guarantees that even if chunk 2 arrives before
             * chunk 1 (due to variable TTS synthesis latency), playback is always
             * in the correct sentence order.
             *
             * @param {string} url   - Audio file URL from the server
             * @param {number} index - Sequence number (0-based) for ordered playback
             */
            const enqueueAudioChunk = (url, index) => {
                audioQueue.push({ url, index });
                // Sort ascending by index so lowest-indexed chunk is always at front
                audioQueue.sort((a, b) => a.index - b.index);
                // Track total for pill display (#79)
                this._ttsQueueTotal++;
                this._updateTTSPill();
                // Only call drainAudioQueue() if nothing is playing — the drain
                // chain will handle everything else via its onended callback.
                if (!audioQueuePlaying) drainAudioQueue();
            };

            // ── SSE stream reader ───────────────────────────────────────────────
            //
            // Server-Sent Events (SSE) is a simple text protocol over HTTP where
            // the server pushes multiple messages on one long-lived connection.
            //
            // Each event looks like:
            //   event: token\n
            //   data: {"t": "Hello"}\n
            //   \n                         ← blank line signals end of event
            //
            // We use a manual ReadableStream reader rather than EventSource because:
            //  - EventSource doesn't support POST requests
            //  - We need to abort the stream (AbortController) when the user stops
            //
            // Parsing strategy:
            //  1. Read raw Uint8Array chunks from the HTTP body
            //  2. Decode to text and append to a rolling `buffer` string
            //  3. Split on '\n\n' to get complete event blocks
            //  4. The LAST split fragment is always incomplete (stream mid-event),
            //     so we save it back to `buffer` (via .pop()) for the next iteration
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // `stream: true` tells TextDecoder not to flush multi-byte chars
                // that may be split across two network packets
                buffer += decoder.decode(value, { stream: true });

                // SSE events are separated by blank lines (\n\n).
                // Split gets us complete events PLUS one possibly-incomplete tail.
                const events = buffer.split('\n\n');
                buffer = events.pop(); // Save incomplete tail back into buffer

                for (const eventBlock of events) {
                    if (!eventBlock.trim()) continue;

                    // Each event block has one or more "field: value" lines.
                    // We care about "event:" (the event type) and "data:" (the payload).
                    const lines = eventBlock.split('\n');
                    let eventType = 'message';  // Default SSE event type
                    let eventData = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            eventData = line.slice(6);
                        }
                    }

                    if (!eventData) continue;

                    try {
                        const parsed = JSON.parse(eventData);

                        if (eventType === 'processing') {
                            // LLM is ingesting the prompt (prefill phase)
                            this._setProcessingPhase(parsed.input_tokens);

                        } else if (eventType === 'generating') {
                            // First token is about to arrive — switch to generation phase
                            this._setGeneratingPhase();

                        } else if (eventType === 'token') {
                            // Create bubble on first token (removes thinking bubble)
                            if (!streamContentEl) {
                                this._removeThinkingBubble();
                                const bubble = this._addStreamingBubble(avatarUrl);
                                streamRow = bubble.row;
                                streamContentEl = bubble.contentEl;
                            }
                            // Append token to bubble
                            fullText += parsed.t;
                            streamContentEl.innerText = fullText;
                            this.tokenCount++;
                            this._updateTokenProgress();

                            // Auto-scroll as text streams in
                            this.container.scrollTop = this.container.scrollHeight;

                        } else if (eventType === 'audio_chunk') {
                            // Sentence-chunked TTS: queue this audio clip for sequential playback
                            enqueueAudioChunk(parsed.url, parsed.index);

                        } else if (eventType === 'done') {
                            metadata = parsed;

                        } else if (eventType === 'error') {
                            throw new Error(parsed.error || 'Stream error');
                        }
                    } catch (parseErr) {
                        if (parseErr.message !== 'Stream error' &&
                            !parseErr.message.startsWith('Stream error')) {
                            console.warn('[Chat] SSE parse error:', parseErr, eventData);
                        } else {
                            throw parseErr;
                        }
                    }
                }
            }

            // Stream complete — finalize
            clearTimeout(this.timeoutWarningTimer);
            this._dismissTimeoutBanner();

            // Track total time in dashboard
            const responseTimeMs = Math.round(performance.now() - startTime);
            if (window.llmTimeEl) {
                window.llmTimeEl.innerText = responseTimeMs + 'ms';
                window.llmTimeEl.classList.toggle('crit', responseTimeMs > 5000);
            }

            // If no tokens arrived (empty response), create bubble now
            if (!streamContentEl) {
                this._removeThinkingBubble();
                const bubble = this._addStreamingBubble(avatarUrl);
                streamRow = bubble.row;
                streamContentEl = bubble.contentEl;
                streamContentEl.innerText = metadata?.reply || '(empty response)';
            } else if (metadata && metadata.reply) {
                // Use cleaned reply from server metadata if available
                streamContentEl.innerText = metadata.reply;
            }

            // Sync local counters with server metadata (#73 token counter fix).
            //
            // Two scenarios where the frontend counters end up at 0:
            //  a) LLM adapter doesn't emit individual SSE `token` events — so
            //     this.tokenCount never increments during streaming.
            //  b) The `generating` SSE event wasn't emitted before the first token,
            //     so this.streamStartTime is null, making speed = '0'.
            //
            // Fix: always trust the server's authoritative token_count when it's > 0,
            // and backfill streamStartTime from multiple fallback sources.
            if (metadata?.token_count > 0) {
                // Prefer server count — it's the source of truth regardless of
                // whether the frontend counted the same value via token events.
                this.tokenCount = metadata.token_count;
            }
            if (!this.streamStartTime) {
                if (metadata?.generation_time_ms > 0) {
                    // Server reported how long generation took — backfill the start time.
                    this.streamStartTime = performance.now() - metadata.generation_time_ms;
                } else if (this.prefillStartTime) {
                    // Last resort: treat the whole request time as generation time.
                    // Speed will be slightly underestimated but avoids showing 0.
                    this.streamStartTime = this.prefillStartTime;
                }
            }

            // Store metadata for setThinking() status bar fallback
            this._lastMetadata = metadata;

            // Use the best available token stats: prefer frontend counters (real-time),
            // fall back to server metadata when frontend counters are 0
            const finalTokenCount = this.tokenCount > 0
                ? this.tokenCount
                : (metadata?.token_count || 0);
            const genTime = this.streamStartTime
                ? ((performance.now() - this.streamStartTime) / 1000).toFixed(1)
                : metadata?.generation_time_ms > 0
                    ? (metadata.generation_time_ms / 1000).toFixed(1)
                    : '0';
            const elapsed = this.streamStartTime
                ? (performance.now() - this.streamStartTime) / 1000
                : metadata?.generation_time_ms > 0
                    ? metadata.generation_time_ms / 1000
                    : 0;
            const speed = elapsed > 0.2
                ? (finalTokenCount / elapsed).toFixed(1) : '0';
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const infoLine = document.createElement('div');
            infoLine.className = 'bubble-info';
            infoLine.innerHTML = `<span class="bubble-info-stats">${finalTokenCount} tok · ${speed} tok/s · ${genTime}s</span><span class="bubble-info-sep" style="opacity:0.4; margin:0 4px;">·</span><span class="bubble-info-time">${time}</span>`;
            streamContentEl.appendChild(infoLine);

            this.setThinking(false, null);

            // Play TTS audio if enabled and the server did NOT already emit audio_chunk
            // events (chunked TTS). When chunked, audioQueue handles playback above.
            if (metadata?.reply && state.config?.tts?.enabled && !metadata?.tts_chunked) {
                this._playTTSWithVisualizer(metadata.reply, streamRow);
            }

            // Update Memory Bank + session state
            if (metadata) {
                this.updateMemoryBank(metadata);
                // Notify dashboard to refresh relationship + emotion widgets
                bus.emit('chat:completed', metadata);
                // Forward reply text to pet popup window (if open) so it can show
                // the response in its overlay bubble via ViewerBridge.sendPetReply()
                if (metadata.reply) bus.emit('pet:reply', { text: metadata.reply });

                // ── Emotion + gesture → viewer ──────────────────────────────
                // Emit the primary emotion (sets VRM expression) and the explicit
                // [gesture:X] tag that was extracted server-side from the reply.
                // This was previously missing from the stream path (only fired
                // in the history-reload path), causing gestures to be silently dropped.
                if (metadata.emotion || metadata.gesture) {
                    bus.emit('chat:emotion', {
                        emotion: metadata.emotion,
                        gesture: metadata.gesture
                    });
                }

                // ── Parse *action text* → additional gestures ────────────────
                // Scan the reply for *asterisk-wrapped action phrases* and fire
                // matching VRM gestures. The text stays visible in the bubble
                // (it's part of the character's personality expression).
                if (metadata.reply) {
                    const actionGestures = this._extractActionGestures(metadata.reply);
                    // Skip index 0 if already covered by metadata.gesture above
                    const startIdx = (metadata.gesture && actionGestures[0] === metadata.gesture) ? 1 : 0;
                    for (let i = startIdx; i < actionGestures.length; i++) {
                        // Small stagger so gestures don't all fire simultaneously
                        setTimeout(() => bus.emit('viewer:gesture', { gesture: actionGestures[i] }), i * 600);
                    }
                }
                if (metadata.session_id && metadata.session_id !== state.state.currentSessionId) {
                    state.state.currentSessionId = metadata.session_id;
                    state.loadSessions();
                }

                // Daily greeting: if the server signals this is the first chat today,
                // emit an event so the dashboard or character can show a greeting (#54).
                // The ViewerBridge sets the initial expression from last_emotion on load;
                // here we just fire the bus event for any listeners to react.
                if (metadata.is_daily_first) {
                    bus.emit('chat:daily_first', {
                        char_id: state.state.currentCharId,
                        emotion: metadata.emotion,
                    });
                }
            }

        } catch (err) {
            clearTimeout(this.timeoutWarningTimer);
            this._dismissTimeoutBanner();
            this.setThinking(false, null);
            console.error('[Chat] Stream error:', err);

            if (err.name === 'AbortError') {
                // Steer abort: the partial response is intentionally discarded;
                // the steering message will be fired from the finally block.
                // Regular cancel: show a brief notice.
                if (!this._steeringMessage) {
                    this.addBubble("↩ Response cancelled", false, null);
                }
            } else {
                this.addBubble(`Error: ${err.message}`, false, null);
                toast.error(`Chat error: ${err.message}`, 5000);
            }
        } finally {
            if (this.sendBtn) this.sendBtn.disabled = false;
            this.currentRequestAbortController = null;
            this._hideQueuedBadge();

            // Fire steering message (overwrites queue — steer aborted the whole
            // generation, so the queue is now stale and should be cleared) or
            // dequeue the next message FIFO from the queue.
            const steering = this._steeringMessage;
            this._steeringMessage = null;

            const pending = steering ?? this._queuedMessages.shift() ?? null;
            if (!steering) {
                // Queue was consumed one item at a time; keep the rest
            } else {
                // Steer replaced the generation — discard any buffered queue
                this._queuedMessages = [];
            }

            if (pending) {
                // Small settle delay so the DOM finishes updating before the
                // next generation starts
                setTimeout(() => {
                    this.input.value = pending;
                    this.sendMessage();
                }, 80);
            } else {
                setTimeout(() => this.input.focus(), 0);
            }
        }
    }

    /**
     * Send a message to multiple characters simultaneously.
     * Each character responds independently with their own personality.
     *
     * @param {string} text - User message
     * @param {number[]} characterIds - Array of character IDs to respond
     */
    async sendMultiMessage(text, characterIds) {
        if (!text || !characterIds?.length || this.isThinking) return;

        this.addBubble(text, true, null);
        this.setThinking(true);

        try {
            const sessionId = state.state.currentSessionId || 1;
            const res = await API.post('chat/multi', {
                text,
                session_id: sessionId,
                character_ids: characterIds
            });

            this.setThinking(false);

            if (res.ok && res.responses) {
                for (const r of res.responses) {
                    // Find character avatar
                    const char = state.state.characters?.find(c => c.id === r.char_id);
                    const avatarUrl = char?.avatar_url || char?.avatar_2d_url || 'assets/default_avatar.png';
                    this.addBubble(r.text, false, avatarUrl, { charName: r.char_name });
                }
            }
        } catch (err) {
            this.setThinking(false);
            this.addBubble(`Error: ${err.message}`, false, null);
        }

        if (this.sendBtn) this.sendBtn.disabled = false;
        setTimeout(() => this.input.focus(), 0);
    }

    /**
     * Request TTS for a reply, play it, and show an audio visualizer canvas.
     * Uses POST /api/tts to generate audio, then plays it with a waveform
     * rendered on a small canvas inside the chat bubble.
     *
     * @param {string} text - The AI reply text to speak
     * @param {HTMLElement} bubbleRow - The .message-ai row element
     */
    async _playTTSWithVisualizer(text, bubbleRow) {
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) return;

            const data = await res.json();
            if (!data.url) return;

            // Create audio element — stored so interrupt_mode can pause it on VAD trigger
            const audio = new Audio(data.url);
            this._currentAudio = audio;

            // Create visualizer canvas inside the bubble
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 40;
            canvas.style.cssText = `
                width:100%; max-width:300px; height:40px; margin-top:8px;
                border-radius:6px; background:rgba(0,0,0,0.3);
                display:block;
            `;
            const contentEl = bubbleRow.querySelector('.bubble-text, .message-text');
            if (contentEl) {
                contentEl.appendChild(canvas);
            } else {
                bubbleRow.appendChild(canvas);
            }

            // Set up Web Audio API for visualization
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaElementSource(audio);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.85;

            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            const ctx = canvas.getContext('2d');
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let animFrame = null;

            /**
             * Draw waveform bars on the canvas each frame.
             */
            const draw = () => {
                analyser.getByteFrequencyData(dataArray);

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const barCount = 32;
                const barWidth = canvas.width / barCount;
                const step = Math.floor(bufferLength / barCount);

                for (let i = 0; i < barCount; i++) {
                    const value = dataArray[i * step] / 255;
                    const barHeight = value * canvas.height * 0.9;
                    const x = i * barWidth;
                    const y = canvas.height - barHeight;

                    // Gradient from cyan to magenta based on frequency
                    const hue = 180 + (i / barCount) * 120; // cyan→magenta range
                    ctx.fillStyle = `hsla(${hue}, 100%, 65%, ${0.5 + value * 0.5})`;
                    ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
                }

                animFrame = requestAnimationFrame(draw);
            };

            audio.onplay = () => draw();
            audio.onended = () => {
                this._currentAudio = null;
                if (animFrame) cancelAnimationFrame(animFrame);
                // Fade out canvas
                canvas.style.transition = 'opacity 0.5s';
                canvas.style.opacity = '0.3';
                audioCtx.close().catch(() => {});
            };
            audio.onerror = () => {
                canvas.remove();
                audioCtx.close().catch(() => {});
            };

            // Also pipe audio to ViewerBridge for lip sync
            bus.emit('chat:audioPlay', { url: data.url });

            audio.play().catch(() => canvas.remove());

        } catch (err) {
            console.warn('[Chat] TTS playback failed:', err.message);
        }
    }

    /**
     * Create an AI chat bubble pre-wired for streaming text into.
     * Returns the row element and the content div for appending tokens.
     *
     * @param {string|null} avatarUrl - Avatar image URL
     * @returns {{row: HTMLElement, contentEl: HTMLElement}}
     */
    _addStreamingBubble(avatarUrl) {
        const row = document.createElement('div');
        row.className = 'message-ai';

        const avatarHtml = `
            <div class="chat-avatar" style="
                width: 2.2rem; height: 2.2rem;
                margin-right: 0.625rem;
                border-radius: 50%;
                overflow: hidden;
                border: 1px solid var(--neon-cyan);
                flex-shrink: 0;
            ">
                <img src="${avatarUrl || 'assets/default_avatar.png'}"
                     onerror="this.src='assets/default_avatar.png'"
                     style="width: 100%; height: 100%; object-fit: cover;">
            </div>`;

        const contentEl = document.createElement('div');
        contentEl.className = 'bubble-content';

        row.innerHTML = avatarHtml;

        // Bind avatar tooltip for streaming bubble (#94)
        const avatarDiv = row.querySelector('.chat-avatar');
        if (avatarDiv) {
            avatarDiv.style.cursor = 'pointer';
            avatarDiv.onmouseenter = (e) => this._showAvatarTooltip(e, state.state.currentCharacterId);
            avatarDiv.onmouseleave = () => this._hideAvatarTooltip();
        }

        row.appendChild(contentEl);
        this.container.appendChild(row);
        this.container.scrollTop = this.container.scrollHeight;

        return { row, contentEl };
    }

    /**
     * Load chat history from a session into the chat container.
     * Called when a session is selected (on startup or from session list).
     *
     * @param {Object} data - {sessionId, messages: [{id, role, text, ts}]}
     */
    loadHistory(data) {
        // Save scroll position for the session we're leaving (#92)
        if (state.state.currentSessionId && state.state.currentSessionId !== data.id) {
            sessionStorage.setItem(`scroll-${state.state.currentSessionId}`, this.container.scrollTop);
        }

        // Close search bar when switching sessions (#31) — highlights are now gone
        if (this._searchActive) this._closeSearch();

        const { messages } = data;
        this.container.innerHTML = ''; // Clear current chat

        if (!messages || messages.length === 0) return;

        // Resolve current character avatar for AI messages
        let avatarUrl = null;
        if (state.state.currentCharacterId) {
            const char = state.state.characters.find(c => c.id == state.state.currentCharacterId);
            if (char) {
                const primaryUrl = char.avatar_2d_url || char.avatar_url;
                if (primaryUrl && !primaryUrl.includes('default') && !primaryUrl.endsWith('.vrm')) {
                    avatarUrl = primaryUrl;
                } else {
                    const parenMatch = char.name.match(/\((\w+)\)/);
                    const cleanName = parenMatch ? parenMatch[1].toLowerCase() : char.name.toLowerCase().split(' ')[0];
                    avatarUrl = `/images/${cleanName}_pixel_portrait.png`;
                }
            }
        }

        // Render each message with IDs and token stats for edit/regen actions
        messages.forEach(msg => {
            const isUser = msg.role === 'user';
            const meta = { messageId: msg.id };

            // Pass token stats from DB for historical AI messages
            if (!isUser && msg.token_count) {
                meta.tokenCount = msg.token_count;
                meta.tokPerSec = msg.tokens_per_second
                    ? msg.tokens_per_second.toFixed(1)
                    : null;
                meta.totalTime = msg.generation_time_ms
                    ? (msg.generation_time_ms / 1000).toFixed(1)
                    : null;
            }

            // Use original timestamp if available
            if (msg.ts) {
                meta.timestamp = msg.ts;
            }

            this.addBubble(msg.text, isUser, isUser ? null : avatarUrl, meta);
        });

        // Restore scroll position if the user had scrolled up in this session (#92),
        // otherwise snap to bottom for new sessions
        const savedScroll = sessionStorage.getItem(`scroll-${data.id}`);
        requestAnimationFrame(() => {
            if (savedScroll !== null) {
                this.container.scrollTop = parseInt(savedScroll, 10);
            } else {
                this.container.scrollTop = this.container.scrollHeight;
            }
        });
    }

    /**
     * Render the session list in the left sidebar.
     * Shows pinned sessions first, with context menu for management actions.
     *
     * @param {Array} sessions - [{id, title, created_ts, message_count, is_pinned, is_archived}]
     */
    renderSessionList(sessions) {
        const listEl = document.getElementById('session-list');
        if (!listEl) return;

        if (!sessions || sessions.length === 0) {
            listEl.innerHTML = '<div style="padding:8px; color:var(--text-muted); font-size:0.7rem;">No chat threads yet.</div>';
            return;
        }

        // Store sessions for context menu actions
        this._sessionCache = sessions;

        listEl.innerHTML = sessions.map(s => {
            const isActive = s.id === state.state.currentSessionId;
            const isPinned = s.is_pinned;
            const ts = s.last_message_ts || s.created_ts;
            const date = ts
                ? new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })
                : '';
            const title = s.title || `Session ${s.id}`;
            const msgCount = s.message_count || 0;
            const pinIcon = isPinned ? '<span style="color:var(--neon-cyan); font-size:0.55rem; margin-right:3px;" title="Pinned">&#x1F4CC;</span>' : '';

            return `
                <div class="session-item ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}"
                     data-session-id="${s.id}">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                        ${pinIcon}${this._escapeHtml(title)}
                    </span>
                    <span style="font-size:0.58rem; opacity:0.5; margin-left:6px; flex-shrink:0; white-space:nowrap;">${msgCount} ${date}</span>
                </div>
            `;
        }).join('');

        // Bind click + right-click handlers
        listEl.querySelectorAll('[data-session-id]').forEach(el => {
            const sessionId = parseInt(el.dataset.sessionId);

            el.onclick = () => state.selectSession(sessionId);

            el.oncontextmenu = (e) => {
                e.preventDefault();
                this._showSessionContextMenu(e, sessionId);
            };
        });
    }

    /**
     * Show a context menu for session management actions.
     *
     * @param {MouseEvent} e - The right-click event
     * @param {number} sessionId - Session ID to act on
     * @private
     */
    _showSessionContextMenu(e, sessionId) {
        // Remove any existing context menu
        const existing = document.getElementById('session-context-menu');
        if (existing) existing.remove();

        const session = (this._sessionCache || []).find(s => s.id === sessionId);
        if (!session) return;

        const isPinned = session.is_pinned;

        const menu = document.createElement('div');
        menu.id = 'session-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(0, 240, 255, 0.2);
            border-radius: 8px;
            padding: 4px 0;
            min-width: 160px;
            z-index: 10000;
            box-shadow: 0 8px 30px rgba(0,0,0,0.6);
            backdrop-filter: blur(10px);
            font-size: 0.75rem;
        `;

        const items = [
            { label: 'Rename', icon: '✎', action: () => this._renameSession(sessionId, session.title) },
            { label: isPinned ? 'Unpin' : 'Pin to Top', icon: isPinned ? '✕' : '📌', action: () => this._togglePinSession(sessionId, !isPinned) },
            { label: 'Duplicate', icon: '⧉', action: () => this._duplicateSession(sessionId) },
            { label: 'Export', icon: '↓', action: () => this._exportSession(sessionId, session.title) },
            { label: 'Compress History', icon: '⚡', action: () => this._compressHistory(sessionId) },
            { divider: true },
            { label: 'Archive', icon: '📦', action: () => this._archiveSession(sessionId) },
            { label: 'Delete', icon: '🗑', action: () => this._deleteSession(sessionId), danger: true },
        ];

        items.forEach(item => {
            if (item.divider) {
                const hr = document.createElement('div');
                hr.style.cssText = 'height:1px; background:rgba(255,255,255,0.06); margin:4px 8px;';
                menu.appendChild(hr);
                return;
            }

            const btn = document.createElement('button');
            btn.style.cssText = `
                display: flex; align-items: center; gap: 8px; width: 100%;
                padding: 6px 12px; background: none; border: none;
                color: ${item.danger ? 'var(--neon-red, #ff4444)' : 'var(--text-secondary)'};
                cursor: pointer; font-size: 0.75rem; text-align: left;
            `;
            btn.innerHTML = `<span style="width:16px; text-align:center;">${item.icon}</span> ${item.label}`;
            btn.onmouseenter = () => btn.style.background = 'rgba(0,240,255,0.08)';
            btn.onmouseleave = () => btn.style.background = 'none';
            btn.onclick = () => {
                menu.remove();
                item.action();
            };
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    /**
     * Rename a session via inline prompt.
     * @param {number} sessionId - Session to rename
     * @param {string} currentTitle - Current title for pre-fill
     * @private
     */
    async _renameSession(sessionId, currentTitle) {
        const newTitle = prompt('Rename session:', currentTitle);
        if (!newTitle || newTitle === currentTitle) return;

        try {
            await API.put(`sessions/${sessionId}`, { title: newTitle });
            toast.success('Session renamed');
            state.loadSessions();
        } catch (err) {
            toast.error(`Rename failed: ${err.message}`);
        }
    }

    /**
     * Toggle pin/unpin for a session.
     * @param {number} sessionId - Session to pin/unpin
     * @param {boolean} pin - True to pin, false to unpin
     * @private
     */
    async _togglePinSession(sessionId, pin) {
        try {
            await API.put(`sessions/${sessionId}`, { is_pinned: pin });
            toast.success(pin ? 'Session pinned' : 'Session unpinned');
            state.loadSessions();
        } catch (err) {
            toast.error(`Pin toggle failed: ${err.message}`);
        }
    }

    /**
     * Duplicate a session with all its messages.
     * @param {number} sessionId - Session to duplicate
     * @private
     */
    async _duplicateSession(sessionId) {
        try {
            const res = await API.post(`sessions/${sessionId}/duplicate`);
            toast.success(`Duplicated as "${res.session.title}"`);
            state.loadSessions();
        } catch (err) {
            toast.error(`Duplicate failed: ${err.message}`);
        }
    }

    /**
     * Export a session as JSON download.
     * @param {number} sessionId - Session to export
     * @param {string} title - Session title for filename
     * @private
     */
    async _exportSession(sessionId, title) {
        try {
            const res = await API.get(`sessions/${sessionId}/export?format=json`);
            const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(title || 'session').replace(/[^a-zA-Z0-9]/g, '_')}_${sessionId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Session exported');
        } catch (err) {
            toast.error(`Export failed: ${err.message}`);
        }
    }

    /**
     * Archive a session (hide from main list).
     * @param {number} sessionId - Session to archive
     * @private
     */
    async _archiveSession(sessionId) {
        try {
            await API.put(`sessions/${sessionId}`, { is_archived: true });
            toast.success('Session archived');
            // If we archived the current session, clear selection
            if (state.state.currentSessionId === sessionId) {
                state.state.currentSessionId = null;
            }
            state.loadSessions();
        } catch (err) {
            toast.error(`Archive failed: ${err.message}`);
        }
    }

    /**
     * Delete a session after confirmation.
     * @param {number} sessionId - Session to delete
     * @private
     */
    async _deleteSession(sessionId) {
        if (!confirm('Delete this session and all its messages? This cannot be undone.')) return;

        try {
            await API.delete(`sessions/${sessionId}`);
            toast.success('Session deleted');
            if (state.state.currentSessionId === sessionId) {
                state.state.currentSessionId = null;
            }
            state.loadSessions();
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`);
        }
    }

    /**
     * Import a session from a JSON file via file picker.
     * Accepts the format produced by the export endpoint.
     * @private
     */
    async _importSession() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) { input.remove(); return; }

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Accept both export format and raw {title, messages}
                const title = data.title || data.session?.title || file.name.replace('.json', '');
                const messages = data.messages || [];

                const res = await API.post('sessions/import', { title, messages });
                toast.success(`Imported "${res.session.title}" (${res.message_count} messages)`);
                state.loadSessions();
                if (res.session?.id) {
                    state.selectSession(res.session.id);
                }
            } catch (err) {
                toast.error(`Import failed: ${err.message}`);
            }

            input.remove();
        };

        input.click();
    }

    /**
     * Update the Memory Bank panel with data from the chat response.
     * Populates "Active Context" with current session info and
     * "RAG Archive" with semantic memory hits from the vector store.
     *
     * @param {Object} response - Chat API response containing memory_hits, session_id, etc.
     */
    updateMemoryBank(response) {
        const activeEl = document.getElementById('mem-active');
        const archiveEl = document.getElementById('mem-archive');

        // Active Context — show current session and character info
        if (activeEl) {
            const charName = state.state.characters?.find(
                c => c.id == state.state.currentCharacterId
            )?.name || 'Unknown';
            const sessionId = response.session_id || state.state.currentSessionId || '?';
            const emotion = response.emotion || 'neutral';

            activeEl.innerHTML = `
                <div style="font-size:0.75rem; color:var(--text-main); line-height:1.6;">
                    <div><span style="color:var(--neon-cyan);">ENTITY:</span> ${charName}</div>
                    <div><span style="color:var(--neon-cyan);">SESSION:</span> #${sessionId}</div>
                    <div><span style="color:var(--neon-cyan);">EMOTION:</span> ${emotion}</div>
                </div>
            `;
        }

        // RAG Archive — show memory hits with similarity scores
        if (archiveEl) {
            const hits = response.memory_hits || [];
            if (hits.length === 0) {
                archiveEl.innerHTML = '<div style="font-size:0.7rem; color:var(--text-muted);">No memory matches for this query.</div>';
                return;
            }

            archiveEl.innerHTML = hits.map(hit => {
                const score = hit.score !== undefined ? (hit.score * 100).toFixed(0) : '?';
                const role = hit.role || 'unknown';
                const text = (hit.text || '').slice(0, 120);
                const roleColor = role === 'user' ? 'var(--neon-cyan)' : 'var(--neon-magenta)';

                return `
                    <div style="font-size:0.7rem; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04); line-height:1.5;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span style="color:${roleColor}; text-transform:uppercase; font-size:0.6rem;">${role}</span>
                            <span style="color:var(--neon-green); font-size:0.6rem;">${score}% match</span>
                        </div>
                        <div style="color:var(--text-muted);">${text}${hit.text?.length > 120 ? '...' : ''}</div>
                    </div>
                `;
            }).join('');
        }
    }

    /**
     * Add a chat bubble to the message container with edit/regen action icons.
     *
     * @param {string} text - Message text
     * @param {boolean} isUser - Whether the message is from the user
     * @param {string|null} avatarUrl - Avatar URL for AI messages
     * @param {Object} [meta] - Optional metadata for the info line
     * @param {number} [meta.tokenCount] - Token count for AI responses
     * @param {number} [meta.tokPerSec] - Tokens per second for AI responses
     * @param {number} [meta.totalTime] - Total response time in seconds
     * @param {number} [meta.messageId] - Database message ID for edit/regen
     */
    addBubble(text, isUser, avatarUrl, meta = {}) {
        const row = document.createElement('div');
        row.className = isUser ? 'message-user' : 'message-ai';
        if (meta.messageId) row.dataset.messageId = meta.messageId;

        // Avatar (AI Only)
        let avatarHtml = '';
        if (!isUser) {
            avatarHtml = `
                <div class="chat-avatar" style="
                    width: 35px; height: 35px;
                    margin-right: 10px;
                    border-radius: 50%;
                    overflow: hidden;
                    border: 1px solid var(--neon-cyan);
                    flex-shrink: 0;
                ">
                    <img src="${avatarUrl || 'assets/default_avatar.png'}"
                         onerror="this.src='assets/default_avatar.png'"
                         style="width: 100%; height: 100%; object-fit: cover;">
                </div>`;
        }

        const bubbleContent = document.createElement('div');
        bubbleContent.className = 'bubble-content';
        bubbleContent.style.position = 'relative';

        // Multi-character name label
        if (!isUser && meta.charName) {
            const nameLabel = document.createElement('div');
            nameLabel.style.cssText = 'font-size:0.65rem; color:var(--neon-cyan); font-weight:600; margin-bottom:2px; opacity:0.8;';
            nameLabel.textContent = meta.charName;
            bubbleContent.appendChild(nameLabel);
        }

        const textEl = document.createElement('span');
        textEl.className = 'bubble-text';
        if (!isUser && window.marked) {
            // Render Markdown in AI bubbles: bold, italic, code, code blocks (#32).
            // marked.parse returns an HTML string; we set innerHTML directly since the
            // content comes from our own LLM (not user input), so XSS is not a concern.
            if (!isUser && state.state.config?.typewriter_enabled && !meta.streaming) {
                // Typewriter effect (#91): animate word-by-word, full markdown render on completion
                this._typewriterEffect(textEl, text);
            } else {
                textEl.innerHTML = window.marked.parse(text, { breaks: true, gfm: true });
            }
        } else {
            textEl.innerText = text;
        }
        bubbleContent.appendChild(textEl);

        // Action buttons (edit for user, regen for AI) — shown on hover
        if (meta.messageId) {
            const actions = document.createElement('div');
            actions.className = 'bubble-actions';
            actions.style.cssText = 'position:absolute; top:4px; right:4px; display:none; gap:4px;';

            if (isUser) {
                actions.innerHTML = `<button class="bubble-action-btn bubble-edit-btn" title="Edit message" data-msg-id="${meta.messageId}">&#x270E;</button>`;
            } else {
                // AI bubble: regen + TTS replay (#13)
                actions.innerHTML = `
                    <button class="bubble-action-btn bubble-tts-replay-btn" title="Replay audio (TTS)" data-msg-id="${meta.messageId}">&#x1F508;</button>
                    <button class="bubble-action-btn bubble-regen-btn" title="Regenerate response" data-msg-id="${meta.messageId}">&#x21BB;</button>
                `;
            }

            bubbleContent.appendChild(actions);
            bubbleContent.onmouseenter = () => { actions.style.display = 'flex'; };
            bubbleContent.onmouseleave = () => { actions.style.display = 'none'; };
        }

        // Info line — stats on the left, time on the right
        const infoLine = document.createElement('div');
        infoLine.className = 'bubble-info';

        const timeDate = meta.timestamp ? new Date(meta.timestamp * 1000) : new Date();
        const time = timeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Separator ensures stats and time are always visually distinct,
        // even when the bubble content is narrow (justify-content: space-between
        // requires the parent to be wider than total child content to have effect).
        const SEP = '<span class="bubble-info-sep" style="opacity:0.4; margin:0 4px;">·</span>';
        if (isUser) {
            const charCount = text.length;
            infoLine.innerHTML = `<span class="bubble-info-stats">${charCount} chars</span>${SEP}<span class="bubble-info-time">${time}</span>`;
        } else if (meta.tokenCount) {
            const speed = meta.tokPerSec ? `${meta.tokPerSec} tok/s` : '';
            const duration = meta.totalTime ? `${meta.totalTime}s` : '';
            const stats = [`${meta.tokenCount} tok`, speed, duration].filter(Boolean).join(' · ');
            infoLine.innerHTML = `<span class="bubble-info-stats">${stats}</span>${SEP}<span class="bubble-info-time">${time}</span>`;
        } else {
            infoLine.innerHTML = `<span class="bubble-info-time">${time}</span>`;
        }

        bubbleContent.appendChild(infoLine);

        row.innerHTML = isUser ? '' : avatarHtml;
        row.appendChild(bubbleContent);

        // Bind avatar tooltip for AI bubbles (#94)
        if (!isUser) {
            const avatarDiv = row.querySelector('.chat-avatar');
            if (avatarDiv) {
                avatarDiv.style.cursor = 'pointer';
                avatarDiv.onmouseenter = (e) => this._showAvatarTooltip(e, state.state.currentCharacterId);
                avatarDiv.onmouseleave = () => this._hideAvatarTooltip();
            }
        }

        this.container.appendChild(row);
        this.container.scrollTop = this.container.scrollHeight;

        // Bind action buttons
        this._bindBubbleActions(row);
    }

    /**
     * Bind edit/regen action buttons on a message bubble.
     * @private
     * @param {HTMLElement} row - The message row element
     */
    _bindBubbleActions(row) {
        const editBtn = row.querySelector('.bubble-edit-btn');
        if (editBtn) {
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this._startInlineEdit(row, parseInt(editBtn.dataset.msgId));
            };
        }

        const regenBtn = row.querySelector('.bubble-regen-btn');
        if (regenBtn) {
            regenBtn.onclick = async (e) => {
                e.stopPropagation();
                await this._regenerateMessage(row, parseInt(regenBtn.dataset.msgId));
            };
        }

        // TTS replay: re-synthesize the AI message text on demand (#13)
        const ttsReplayBtn = row.querySelector('.bubble-tts-replay-btn');
        if (ttsReplayBtn) {
            ttsReplayBtn.onclick = async (e) => {
                e.stopPropagation();
                const textEl = row.querySelector('.bubble-text');
                if (!textEl) return;

                // Use innerText to get the plain text, stripping any Markdown HTML
                const text = textEl.innerText?.trim();
                if (!text) return;

                ttsReplayBtn.disabled = true;
                ttsReplayBtn.textContent = '⌛';
                try {
                    const res = await fetch('/api/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text }),
                    });
                    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
                    const data = await res.json();
                    // TTS endpoint returns { ok, url } — not audio_url
                    const audioUrl = data.url || data.audio_url;
                    if (data.ok && audioUrl) {
                        const audio = new Audio(audioUrl);
                        audio.play().catch(() => {});
                        // Sync lips with VRM viewer
                        const viewerIframe = document.querySelector('.viewport-layer iframe');
                        if (viewerIframe?.contentWindow) {
                            viewerIframe.contentWindow.postMessage(
                                { type: 'audioUrl', audioUrl }, '*'
                            );
                        }
                    }
                } catch (err) {
                    console.warn('[ChatInterface] TTS replay failed:', err);
                } finally {
                    ttsReplayBtn.disabled = false;
                    ttsReplayBtn.textContent = '🔊';
                }
            };
        }
    }

    /**
     * Enable inline editing of a user message.
     * Replaces the bubble text with a textarea for editing.
     * @private
     * @param {HTMLElement} row - The message row element
     * @param {number} messageId - Database message ID
     */
    _startInlineEdit(row, messageId) {
        const textEl = row.querySelector('.bubble-text');
        if (!textEl) return;

        const originalText = textEl.innerText;
        const textarea = document.createElement('textarea');
        textarea.className = 'input-field';
        textarea.value = originalText;
        textarea.style.cssText = 'width:100%; min-height:60px; padding:8px; background:rgba(0,10,20,0.8); border:1px solid var(--neon-cyan); color:var(--text-main); border-radius:6px; resize:vertical; font-size:0.85rem;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:6px; margin-top:6px; justify-content:flex-end;';
        btnRow.innerHTML = `
            <button class="btn edit-cancel" style="padding:4px 12px; background:transparent; border:1px solid var(--glass-border); color:var(--text-muted); border-radius:4px; cursor:pointer; font-size:0.75rem;">CANCEL</button>
            <button class="btn edit-save" style="padding:4px 12px; background:rgba(0,240,255,0.1); border:1px solid var(--neon-cyan); color:var(--neon-cyan); border-radius:4px; cursor:pointer; font-size:0.75rem;">SAVE</button>
        `;

        textEl.replaceWith(textarea);
        textarea.parentElement.appendChild(btnRow);
        textarea.focus();

        btnRow.querySelector('.edit-cancel').onclick = () => {
            const newTextEl = document.createElement('span');
            newTextEl.className = 'bubble-text';
            newTextEl.innerText = originalText;
            textarea.replaceWith(newTextEl);
            btnRow.remove();
        };

        btnRow.querySelector('.edit-save').onclick = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;

            try {
                await API.put(`messages/${messageId}`, { text: newText });
                const newTextEl = document.createElement('span');
                newTextEl.className = 'bubble-text';
                newTextEl.innerText = newText;
                textarea.replaceWith(newTextEl);
                btnRow.remove();
                toast.success('Message edited', 2000);
            } catch (err) {
                toast.error(`Edit failed: ${err.message}`, 3000);
            }
        };
    }

    /**
     * Regenerate an AI response via the backend.
     * @private
     * @param {HTMLElement} row - The AI message row element
     * @param {number} messageId - Database message ID to regenerate
     */
    async _regenerateMessage(row, messageId) {
        const textEl = row.querySelector('.bubble-text');
        if (!textEl) return;

        const originalText = textEl.innerText;
        textEl.innerText = 'Regenerating...';
        textEl.style.opacity = '0.5';

        try {
            const result = await API.post(`messages/${messageId}/regenerate`, {});
            if (result.ok && result.new_message) {
                textEl.innerText = result.new_message.text;
                textEl.style.opacity = '1';
                row.dataset.messageId = result.new_message.id;

                // Update regen button data-msg-id
                const regenBtn = row.querySelector('.bubble-regen-btn');
                if (regenBtn) regenBtn.dataset.msgId = result.new_message.id;

                toast.success('Response regenerated', 2000);

                // Emit emotion/gesture if present
                if (result.new_message.emotion) {
                    bus.emit('chat:emotion', { emotion: result.new_message.emotion, gesture: result.new_message.gesture });
                }
            } else {
                throw new Error('Regeneration failed');
            }
        } catch (err) {
            textEl.innerText = originalText;
            textEl.style.opacity = '1';
            toast.error(`Regen failed: ${err.message}`, 3000);
        }
    }

    /**
     * Show a character greeting message in an empty session.
     * Only displays if the character has a greeting_text set and
     * the current session has no messages.
     *
     * @private
     * @param {Object} char - Character object with greeting_text, greeting_animation
     */
    _showGreeting(char) {
        if (!char || !char.greeting_text) return;

        // Only show greeting if chat is empty (no messages)
        const hasMessages = this.container.children.length > 0;
        if (hasMessages) return;

        const avatarUrl = this._getCharacterAvatarUrl();
        this.addBubble(char.greeting_text, false, avatarUrl);

        // Trigger greeting animation on the 3D viewer if set
        if (char.greeting_animation) {
            bus.emit('viewer:gesture', { gesture: char.greeting_animation });
        }
    }

    /**
     * Inject an export button into the AI status container area.
     * @private
     */
    _injectExportButton() {
        const statusContainer = document.querySelector('.ai-status-container');
        if (!statusContainer) return;

        const btn = document.createElement('button');
        btn.id = 'btn-export-chat';
        btn.className = 'btn-icon';
        btn.title = 'Export conversation';
        btn.style.cssText = 'margin-left:auto; width:28px; height:28px; font-size:0.7rem; opacity:0.6; transition:opacity 0.15s;';
        btn.innerHTML = '&#x2B07;';
        btn.onmouseenter = () => { btn.style.opacity = '1'; };
        btn.onmouseleave = () => { btn.style.opacity = '0.6'; };
        btn.onclick = () => this._showExportDialog();

        statusContainer.appendChild(btn);

        // Recap/Summarize button
        const recapBtn = document.createElement('button');
        recapBtn.id = 'btn-recap';
        recapBtn.className = 'btn-icon';
        recapBtn.title = 'Recap conversation';
        recapBtn.style.cssText = 'width:28px; height:28px; font-size:0.7rem; opacity:0.6; transition:opacity 0.15s; margin-left:4px;';
        recapBtn.innerHTML = '&#x1F4DD;';
        recapBtn.onmouseenter = () => { recapBtn.style.opacity = '1'; };
        recapBtn.onmouseleave = () => { recapBtn.style.opacity = '0.6'; };
        recapBtn.onclick = () => this._showRecap();

        statusContainer.appendChild(recapBtn);

        // Incognito mode toggle (#123): ghost button in the status bar
        const incognitoBtn = document.createElement('button');
        incognitoBtn.id = 'btn-incognito';
        incognitoBtn.className = 'btn-icon';
        incognitoBtn.title = 'Incognito mode: messages won\'t be saved';
        incognitoBtn.style.cssText = 'width:28px; height:28px; font-size:0.75rem; opacity:0.4; transition:all 0.2s; margin-left:4px;';
        incognitoBtn.textContent = '👻';
        incognitoBtn.onclick = () => {
            this._incognito = !this._incognito;
            incognitoBtn.style.opacity = this._incognito ? '1' : '0.4';
            incognitoBtn.style.filter = this._incognito ? 'drop-shadow(0 0 6px rgba(157,80,255,0.7))' : '';
            incognitoBtn.title = this._incognito
                ? 'Incognito ON — messages are NOT saved (click to disable)'
                : 'Incognito mode: messages won\'t be saved';
            if (this._incognito) {
                import('../utils/Toast.js').then(({ toast }) => toast.warning('Incognito mode ON — this conversation won\'t be saved', 3000));
            }
        };
        statusContainer.appendChild(incognitoBtn);
    }

    /**
     * Show a format picker and trigger conversation export download.
     * @private
     */
    async _showExportDialog() {
        const sessionId = state.state.currentSessionId;
        if (!sessionId) {
            toast.warning('No active session to export', 2000);
            return;
        }

        // Simple format picker via prompt (could be a modal in future)
        const formats = ['markdown', 'json', 'txt'];
        const choice = prompt('Export format:\n1. Markdown\n2. JSON\n3. Plain Text\n\nEnter number (1-3):', '1');
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        const format = formats[idx] || 'markdown';

        try {
            toast.info('Exporting conversation...', 2000);
            const response = await fetch(`/api/sessions/${sessionId}/export?format=${format}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] || `conversation.${format === 'markdown' ? 'md' : format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success('Conversation exported!', 2000);
        } catch (err) {
            toast.error(`Export failed: ${err.message}`, 3000);
        }
    }

    /**
     * Show a conversation recap/summary. First tries to load a cached summary,
     * then generates one if none exists.
     * @private
     */
    async _showRecap() {
        const sessionId = state.state.currentSessionId;
        if (!sessionId) {
            toast.warning('No active session', 2000);
            return;
        }

        // Try to load existing summary first
        try {
            const cached = await API.get(`sessions/${sessionId}/summary`);
            if (cached.ok && cached.summary) {
                this._displayRecapBubble(cached.summary);
                return;
            }
        } catch (e) {
            // No cached summary, generate one
        }

        // Generate new summary
        toast.info('Generating recap...', 3000);
        const recapBtn = document.getElementById('btn-recap');
        if (recapBtn) {
            recapBtn.disabled = true;
            recapBtn.style.opacity = '0.3';
        }

        try {
            const result = await API.post(`sessions/${sessionId}/summarize`, {});
            if (result.ok && result.summary) {
                this._displayRecapBubble(result.summary);
                toast.success('Recap generated!', 2000);
            } else {
                toast.error('Failed to generate recap', 3000);
            }
        } catch (err) {
            toast.error(`Recap failed: ${err.message}`, 3000);
        } finally {
            if (recapBtn) {
                recapBtn.disabled = false;
                recapBtn.style.opacity = '0.6';
            }
        }
    }

    /**
     * Show a non-blocking in-chat timeout banner when the AI takes longer than 30s.
     * The banner sits at the bottom of the chat container and auto-dismisses when
     * the response completes. Avoids blocking browser confirm() dialogs (#50).
     *
     * @param {string} lastText - The user's last message, used for the Retry button.
     * @private
     */
    _showTimeoutBanner(lastText) {
        if (this._timeoutBanner) return; // Already showing

        const banner = document.createElement('div');
        banner.id = 'timeout-warning-banner';
        banner.style.cssText = `
            position: sticky; bottom: 0; left: 0; right: 0;
            background: rgba(255, 60, 0, 0.12);
            border: 1px solid rgba(255, 80, 0, 0.35);
            border-radius: 8px; padding: 8px 12px; margin: 8px 0;
            display: flex; align-items: center; gap: 10px;
            font-family: var(--font-mono); font-size: 0.72rem;
            color: #ff8040; z-index: 10;
            animation: fadeIn 0.3s ease;
        `;

        banner.innerHTML = `
            <span style="flex:1;">⏳ Still waiting for AI response… (${Math.floor(30)}s+)</span>
            <button id="timeout-cancel-btn" style="
                padding: 3px 10px; background: rgba(255,60,0,0.2);
                border: 1px solid rgba(255,80,0,0.4); border-radius: 4px;
                color: #ff8040; font-size: 0.7rem; cursor: pointer; font-family: inherit;
            ">Cancel</button>
        `;

        this.container.appendChild(banner);
        this.container.scrollTop = this.container.scrollHeight;
        this._timeoutBanner = banner;

        banner.querySelector('#timeout-cancel-btn').onclick = () => {
            if (this.currentRequestAbortController) {
                this.currentRequestAbortController.abort();
            }
            this._dismissTimeoutBanner();
        };
    }

    /**
     * Dismiss the timeout warning banner if it is currently shown.
     * @private
     */
    _dismissTimeoutBanner() {
        if (this._timeoutBanner) {
            this._timeoutBanner.remove();
            this._timeoutBanner = null;
        }
    }

    /**
     * Compress session history: summarize all messages, archive them in the DB,
     * and inject a summary system message so future LLM calls have a shorter context.
     *
     * This actively reduces the LLM context window cost — unlike _showRecap which
     * only displays the summary without touching stored messages.
     *
     * @param {number} sessionId - Session to compress
     * @private
     */
    async _compressHistory(sessionId) {
        if (!sessionId) {
            toast.warning('No session selected', 2000);
            return;
        }

        // Confirm before archiving (destructive-ish operation)
        if (!confirm('Compress history?\n\nThis will summarize and archive old messages, keeping the last 6 as context. The summary will be injected as a system message.\n\nYou can still see archived messages by reading the stored summary.')) {
            return;
        }

        toast.info('Compressing history…', 4000);

        try {
            const res = await API.post(`sessions/${sessionId}/compress`, { keep_recent: 6 });
            if (res.ok) {
                toast.success(`Compressed — ${res.archived} messages archived, summary injected`, 4000);
                // Reload the chat so the injected summary message is visible
                if (sessionId === state.state.currentSessionId) {
                    await this.loadHistory({ id: sessionId });
                }
            } else {
                toast.warning(res.error || 'Nothing to compress', 3000);
            }
        } catch (err) {
            toast.error(`Compress failed: ${err.message}`, 3000);
        }
    }

    /**
     * Display a recap/summary as a special system bubble in the chat.
     * @private
     * @param {string} summary - The summary text
     */
    _displayRecapBubble(summary) {
        const row = document.createElement('div');
        row.className = 'message-ai';
        row.style.cssText = 'border-left:2px solid var(--neon-cyan); padding-left:12px; margin:12px 0;';
        row.innerHTML = `
            <div style="font-family:var(--font-display); font-size:0.7rem; color:var(--neon-cyan); letter-spacing:1px; margin-bottom:6px;">CONVERSATION RECAP</div>
            <div style="color:var(--text-main); font-size:0.85rem; line-height:1.5; white-space:pre-wrap;">${summary}</div>
        `;
        this.container.appendChild(row);
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Escape HTML special characters for safe rendering.
     * @param {string} str - Raw string
     * @returns {string} Escaped string
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    /**
     * Scan AI reply text for *asterisk-wrapped action phrases* and return a
     * list of matching VRM gesture names to trigger on the 3D avatar.
     *
     * The LLM frequently narrates physical actions inline, e.g.:
     *   "*crosses arms*", "*foot tapping*", "*tilts head*"
     * We extract these and map them to the gesture controller's named animations
     * so the character actually performs the described action.
     *
     * Only up to 3 gestures are returned per reply to prevent animation spam.
     *
     * @param {string} text - Full AI reply text including *action phrases*.
     * @returns {string[]} List of gesture name strings (may be empty).
     */
    _extractActionGestures(text) {
        if (!text) return [];

        // Map of regex pattern (matched against lowercased action phrase) → gesture name.
        // Ordered from most-specific to least-specific.
        const ACTION_MAP = [
            [/foot.?tap|tap.?foot|stamp.?foot|foot.?stamp/, 'foot_tap'],
            [/cross.?arm|arm.?cross|fold.?arm|arm.?fold/, 'crossed_arms'],
            [/shake.?head|head.?shake/, 'shake'],
            [/tilt.?head|head.?tilt/, 'tilt'],
            [/nod/, 'nod'],
            [/wave|waving/, 'wave'],
            [/shrug/, 'shrug'],
            [/bow|bowing/, 'bow'],
            [/clap|clapping/, 'clap'],
            [/think|thinking|ponder/, 'think'],
            [/point|pointing/, 'point'],
            [/celebrat|cheer|jump|yell/, 'celebrate'],
            [/shy|blush|embarrass/, 'shy'],
            [/danc|spinning/, 'dance'],
            [/sigh/, 'shrug'],    // subtle body gesture for sighs
            [/fidget|fidgeting/, 'shrug'],
        ];

        const seen = new Set();
        const results = [];

        // Extract all *...*-wrapped phrases from the text
        const matches = [...text.matchAll(/\*([^*]{2,50})\*/g)];
        for (const match of matches) {
            const phrase = match[1].toLowerCase();
            for (const [pattern, gesture] of ACTION_MAP) {
                if (pattern.test(phrase) && !seen.has(gesture)) {
                    seen.add(gesture);
                    results.push(gesture);
                    break;
                }
            }
            if (results.length >= 3) break; // cap at 3 gestures per reply
        }

        return results;
    }

    // ── Phase 8A: Reaction Portrait Overlay ─────────────────────────────────

    /**
     * Create and inject the floating reaction portrait element into the DOM.
     * The element is absolutely positioned over the chat overlay area and is
     * invisible by default; ``_showReactionPortrait()`` fades it in and out.
     *
     * @private
     * @returns {HTMLElement} The portrait overlay element.
     */
    _createReactionPortraitEl() {
        const el = document.createElement('div');
        el.id = 'reaction-portrait-overlay';
        el.style.cssText = `
            position: fixed;
            bottom: 140px;
            right: 20px;
            width: 160px;
            height: 200px;
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid rgba(157,80,255,0.5);
            box-shadow: 0 0 20px rgba(157,80,255,0.3);
            opacity: 0;
            pointer-events: none;
            z-index: 500;
            transition: opacity 0.3s ease;
            background: rgba(0,0,0,0.4);
        `;
        el.innerHTML = `
            <img id="reaction-portrait-img" src="" alt=""
                style="width:100%; height:100%; object-fit:cover; object-position:top;">
            <div id="reaction-portrait-emotion"
                style="position:absolute; bottom:0; left:0; right:0; padding:4px 8px;
                       background:rgba(0,0,0,0.6); font-size:0.7rem; text-align:center;
                       color:rgba(157,80,255,0.9); letter-spacing:0.05em; text-transform:uppercase;">
            </div>
        `;
        document.body.appendChild(el);

        // Inject portrait animation keyframes if not already present
        if (!document.getElementById('reaction-portrait-anim')) {
            const style = document.createElement('style');
            style.id = 'reaction-portrait-anim';
            style.textContent = `
                @keyframes portraitFadeIn {
                    0%  { opacity: 0; transform: translateY(8px) scale(0.96); }
                    100%{ opacity: 1; transform: translateY(0)   scale(1); }
                }
                #reaction-portrait-overlay.visible {
                    animation: portraitFadeIn 0.25s ease forwards;
                }
            `;
            document.head.appendChild(style);
        }

        return el;
    }

    /**
     * Display an expression portrait as a floating overlay for 2.5 seconds,
     * then fade it out. Replaces any currently visible portrait immediately.
     *
     * @param {string} url     - URL of the expression portrait image.
     * @param {string} emotion - Emotion label shown below the portrait.
     *
     * @example
     * this._showReactionPortrait('/files/images/rin_expr_happy.png', 'happy');
     */
    _showReactionPortrait(url, emotion) {
        if (!this._reactionPortraitEl) return;

        const img = this._reactionPortraitEl.querySelector('#reaction-portrait-img');
        const label = this._reactionPortraitEl.querySelector('#reaction-portrait-emotion');

        if (!img) return;

        // Clear any pending hide timer
        if (this._portraitHideTimer) {
            clearTimeout(this._portraitHideTimer);
            this._portraitHideTimer = null;
        }

        img.src = url;
        if (label) label.textContent = emotion || '';

        this._reactionPortraitEl.style.opacity = '1';
        this._reactionPortraitEl.classList.add('visible');

        // Auto-hide after 2.5 seconds
        this._portraitHideTimer = setTimeout(() => {
            if (this._reactionPortraitEl) {
                this._reactionPortraitEl.style.opacity = '0';
                this._reactionPortraitEl.classList.remove('visible');
            }
        }, 2500);
    }

    // ── Phase 7C: TTS Queue Pill (#79) ───────────────────────────────────────

    /**
     * Update the floating TTS queue progress pill.
     * Shows "🔊 Speaking N/Total" while audio chunks are queued, hides otherwise.
     * The pill is appended to document.body (fixed position) so it floats above the chat.
     *
     * @private
     */
    _updateTTSPill() {
        const remaining = this._ttsQueue?.length ?? 0;
        const total = this._ttsQueueTotal ?? 0;

        let pill = document.getElementById('tts-queue-pill');

        if (total === 0 || remaining === 0) {
            if (pill) pill.style.display = 'none';
            return;
        }

        const current = total - remaining + 1;

        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'tts-queue-pill';
            pill.style.cssText = [
                'position:fixed',
                'bottom:80px',
                'left:50%',
                'transform:translateX(-50%)',
                'background:rgba(0,240,255,0.08)',
                'border:1px solid rgba(0,240,255,0.25)',
                'border-radius:20px',
                'padding:4px 14px',
                'font-family:var(--font-mono,monospace)',
                'font-size:0.65rem',
                'color:var(--neon-cyan,#00f0ff)',
                'z-index:200',
                'pointer-events:none',
                'transition:opacity 0.3s',
                'letter-spacing:0.05em',
            ].join(';');
            document.body.appendChild(pill);
        }

        pill.style.display = 'block';
        pill.textContent = `🔊 Speaking ${current}/${total}`;
    }

    // ── Phase 7C: Avatar Info Tooltip (#94) ──────────────────────────────────

    /**
     * Show a tooltip near the cursor with character info.
     * Displays name, traits, current mood, and bond tier.
     *
     * @private
     * @param {MouseEvent} e      - The mouseenter event on the avatar div.
     * @param {number}     charId - Current character ID from state.
     */
    _showAvatarTooltip(e, charId) {
        this._hideAvatarTooltip();

        const char = state.state.characters?.find(c => c.id == charId);
        if (!char) return;

        const traits = Array.isArray(char.personality_traits)
            ? char.personality_traits.join(', ')
            : (char.personality_traits || '—');
        const mood = char.last_emotion || 'neutral';
        const moodEmoji = { happy: '😊', sad: '😢', angry: '😠', surprised: '😲', shy: '😳', excited: '⚡', embarrassed: '😅', thinking: '🤔', neutral: '😐' };
        const bondScore = char.relationship_score || 0;
        const bondTier = bondScore >= 80 ? 'Devoted' : bondScore >= 50 ? 'Close' : bondScore >= 20 ? 'Friendly' : 'Acquainted';

        const tip = document.createElement('div');
        tip.id = 'avatar-tooltip';
        tip.style.cssText = [
            'position:fixed',
            `left:${Math.min(e.clientX + 12, window.innerWidth - 220)}px`,
            `top:${Math.max(e.clientY - 10, 8)}px`,
            'background:rgba(8,10,20,0.95)',
            'border:1px solid rgba(0,240,255,0.3)',
            'border-radius:8px',
            'padding:8px 12px',
            'font-size:0.72rem',
            'color:var(--text-main,#e0e6ed)',
            'z-index:9000',
            'pointer-events:none',
            'max-width:200px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
            'line-height:1.5',
        ].join(';');
        tip.innerHTML = `
            <div style="font-weight:700; color:var(--neon-cyan,#00f0ff); margin-bottom:4px;">${char.name}</div>
            <div style="color:var(--text-muted,#8899aa); font-size:0.65rem; margin-bottom:3px;">${traits || '—'}</div>
            <div>${moodEmoji[mood] || '😐'} ${mood.charAt(0).toUpperCase() + mood.slice(1)}</div>
            <div style="color:rgba(157,80,255,0.9); font-size:0.68rem; margin-top:2px;">⚡ ${bondTier} (${bondScore} pts)</div>
        `;
        document.body.appendChild(tip);

        // Auto-hide after 3 seconds
        this._avatarTooltipTimer = setTimeout(() => this._hideAvatarTooltip(), 3000);
    }

    /**
     * Remove the avatar info tooltip from the DOM.
     * @private
     */
    _hideAvatarTooltip() {
        if (this._avatarTooltipTimer) {
            clearTimeout(this._avatarTooltipTimer);
            this._avatarTooltipTimer = null;
        }
        const tip = document.getElementById('avatar-tooltip');
        if (tip) tip.remove();
    }

    /**
     * Animate AI message text with a word-by-word typewriter effect (#91).
     *
     * Words are revealed progressively via ``setInterval``. After each tick the
     * partial source text is re-rendered through ``marked.parse()`` so markdown
     * syntax remains valid throughout. A final pass re-renders the full text
     * once the animation completes.
     *
     * Only fires when ``state.state.config.typewriter_enabled`` is truthy.
     * Does nothing for streaming bubbles (they animate naturally via SSE).
     *
     * @param {HTMLElement} el     - The ``.bubble-text`` element to animate into
     * @param {string}      text   - Raw (markdown) source text to reveal
     * @param {Function}    [onDone] - Called after animation finishes
     */
    _typewriterEffect(el, text, onDone) {
        if (!text) return;
        const words = text.split(' ');
        let i = 0;
        const wps = Math.max(1, Math.min(state.state.config?.typewriter_speed ?? 15, 60));
        const intervalMs = Math.round(1000 / wps);
        el.innerHTML = '';

        const tick = setInterval(() => {
            i++;
            const partial = words.slice(0, i).join(' ');
            // Re-render markdown on each tick — marked handles partial syntax gracefully
            el.innerHTML = typeof marked !== 'undefined' ? marked.parse(partial) : partial;

            if (i >= words.length) {
                clearInterval(tick);
                // Final full render ensures clean closing tags after animation
                el.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
                if (onDone) onDone();
            }
        }, intervalMs);
    }

    // ── Chat Search (#31) ────────────────────────────────────────────────────

    /**
     * Set up Ctrl+F keyboard listener to open the in-chat search bar.
     * Escape closes the bar; Enter / Shift+Enter navigate between matches.
     * @private
     */
    _initChatSearch() {
        document.addEventListener('keydown', (e) => {
            // Only intercept Ctrl+F (or Cmd+F on Mac) when not in an input
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                // Don't intercept if user is typing in an <input> or <textarea>
                const tag = document.activeElement?.tagName?.toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;

                e.preventDefault();
                if (this._searchActive) {
                    this._focusSearch();
                } else {
                    this._openSearch();
                }
            }

            if (e.key === 'Escape' && this._searchActive) {
                this._closeSearch();
            }
        });
    }

    /**
     * Create and display the chat search bar above the message list.
     * @private
     */
    _openSearch() {
        if (this._searchBar) {
            this._searchBar.style.display = 'flex';
            this._focusSearch();
            this._searchActive = true;
            return;
        }

        const bar = document.createElement('div');
        bar.id = 'chat-search-bar';
        bar.style.cssText = `
            display:flex; align-items:center; gap:8px; padding:6px 12px;
            background:rgba(0,10,20,0.92); border-bottom:1px solid rgba(0,240,255,0.25);
            position:sticky; top:0; z-index:50; backdrop-filter:blur(8px);
        `;
        bar.innerHTML = `
            <span style="color:var(--neon-cyan); font-size:0.75rem; font-family:var(--font-mono); white-space:nowrap;">🔍 SEARCH</span>
            <input id="chat-search-input" type="text" placeholder="Search messages..."
                   style="flex:1; padding:4px 8px; background:rgba(0,20,40,0.8);
                          border:1px solid rgba(0,240,255,0.3); color:var(--text-main);
                          border-radius:6px; font-size:0.82rem; outline:none;"/>
            <span id="chat-search-count" style="color:var(--text-muted); font-size:0.72rem; font-family:var(--font-mono); white-space:nowrap; min-width:48px;"></span>
            <button id="chat-search-prev" title="Previous (Shift+Enter)"
                    style="padding:2px 7px; border-radius:4px; border:1px solid rgba(0,240,255,0.3);
                           background:transparent; color:var(--neon-cyan); cursor:pointer; font-size:0.8rem;">▲</button>
            <button id="chat-search-next" title="Next (Enter)"
                    style="padding:2px 7px; border-radius:4px; border:1px solid rgba(0,240,255,0.3);
                           background:transparent; color:var(--neon-cyan); cursor:pointer; font-size:0.8rem;">▼</button>
            <button id="chat-search-close" title="Close (Esc)"
                    style="padding:2px 7px; border-radius:4px; border:none;
                           background:transparent; color:var(--text-muted); cursor:pointer; font-size:0.9rem;">✕</button>
        `;

        // Insert at top of message container (sticky positioning handles the rest)
        this.container.insertBefore(bar, this.container.firstChild);
        this._searchBar = bar;
        this._searchActive = true;

        const input = bar.querySelector('#chat-search-input');
        let debounce = null;
        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => this._runSearch(input.value), 120);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this._navigateMatch(-1);
                else this._navigateMatch(1);
            } else if (e.key === 'Escape') {
                this._closeSearch();
            }
        });

        bar.querySelector('#chat-search-prev').onclick = () => this._navigateMatch(-1);
        bar.querySelector('#chat-search-next').onclick = () => this._navigateMatch(1);
        bar.querySelector('#chat-search-close').onclick = () => this._closeSearch();

        this._focusSearch();
    }

    /** @private */
    _focusSearch() {
        const input = document.getElementById('chat-search-input');
        if (input) { input.focus(); input.select(); }
    }

    /**
     * Close and hide the search bar, removing all highlights.
     * @private
     */
    _closeSearch() {
        this._clearHighlights();
        if (this._searchBar) this._searchBar.style.display = 'none';
        this._searchActive = false;
        this._searchMatches = [];
        this._searchMatchIndex = 0;
        const count = document.getElementById('chat-search-count');
        if (count) count.textContent = '';
    }

    /**
     * Highlight all text nodes matching the query within chat bubbles.
     * Builds a match list for navigation.
     *
     * @private
     * @param {string} query - Search string (case-insensitive)
     */
    _runSearch(query) {
        this._clearHighlights();
        this._searchMatches = [];
        this._searchMatchIndex = 0;
        const count = document.getElementById('chat-search-count');

        if (!query || query.length < 2) {
            if (count) count.textContent = '';
            return;
        }

        const qLower = query.toLowerCase();

        // Walk text nodes inside .bubble-text elements only (not timestamps, metadata)
        this.container.querySelectorAll('.bubble-text').forEach(bubble => {
            this._highlightInElement(bubble, qLower, query);
        });

        // Collect all mark elements as match targets
        this._searchMatches = Array.from(this.container.querySelectorAll('mark.chat-search-mark'));

        if (count) {
            count.textContent = this._searchMatches.length
                ? `1/${this._searchMatches.length}`
                : 'No match';
        }

        // Scroll to first match
        if (this._searchMatches.length) {
            this._activateMatch(0);
        }
    }

    /**
     * Recursively walk text nodes in `el` and wrap matches in `<mark>`.
     * Operates on live text nodes to avoid breaking markdown HTML.
     *
     * @private
     * @param {Element} el - Container element
     * @param {string} qLower - Lowercased query for matching
     * @param {string} query - Original query for display
     */
    _highlightInElement(el, qLower, query) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodesToProcess = [];

        // Collect all text nodes first (modifying DOM mid-walk is unsafe)
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.toLowerCase().includes(qLower)) {
                nodesToProcess.push(node);
            }
        }

        for (const textNode of nodesToProcess) {
            const text = textNode.textContent;
            const lower = text.toLowerCase();
            const parts = [];
            let lastIdx = 0;
            let idx;

            while ((idx = lower.indexOf(qLower, lastIdx)) !== -1) {
                if (idx > lastIdx) parts.push(document.createTextNode(text.slice(lastIdx, idx)));
                const mark = document.createElement('mark');
                mark.className = 'chat-search-mark';
                mark.textContent = text.slice(idx, idx + query.length);
                mark.style.cssText = 'background:rgba(0,240,255,0.35); color:inherit; border-radius:2px; padding:0 1px;';
                parts.push(mark);
                lastIdx = idx + query.length;
            }

            if (lastIdx < text.length) parts.push(document.createTextNode(text.slice(lastIdx)));

            if (parts.length > 1) {
                const frag = document.createDocumentFragment();
                parts.forEach(p => frag.appendChild(p));
                textNode.parentNode.replaceChild(frag, textNode);
            }
        }
    }

    /**
     * Remove all `<mark>` elements inserted by search, restoring original text nodes.
     * @private
     */
    _clearHighlights() {
        this.container.querySelectorAll('mark.chat-search-mark').forEach(mark => {
            const text = document.createTextNode(mark.textContent);
            mark.parentNode.replaceChild(text, mark);
        });
        // Normalize merges adjacent text nodes created by our splitting
        this.container.normalize();
    }

    /**
     * Navigate to the next or previous match and scroll it into view.
     *
     * @private
     * @param {number} delta - +1 for next, -1 for previous
     */
    _navigateMatch(delta) {
        if (!this._searchMatches.length) return;
        const prev = this._searchMatches[this._searchMatchIndex];
        if (prev) prev.style.background = 'rgba(0,240,255,0.35)';

        this._searchMatchIndex = (this._searchMatchIndex + delta + this._searchMatches.length) % this._searchMatches.length;
        this._activateMatch(this._searchMatchIndex);

        const count = document.getElementById('chat-search-count');
        if (count) count.textContent = `${this._searchMatchIndex + 1}/${this._searchMatches.length}`;
    }

    /**
     * Highlight the active match and scroll it into view.
     * @private
     * @param {number} idx - Match index
     */
    _activateMatch(idx) {
        const mark = this._searchMatches[idx];
        if (!mark) return;
        mark.style.background = 'rgba(255,200,0,0.55)'; // Gold for active match
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}



// Add animation globally if not exists
if (!document.getElementById('anim-pop')) {
    const style = document.createElement('style');
    style.id = 'anim-pop';
    style.innerHTML = `
        @keyframes popIn {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}
