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

        // Multi-character chat mode
        /** @type {number[]|null} Active multi-chat character IDs */
        this._multiChatIds = null;
        bus.on('multi-chat:start', (charIds) => {
            this._multiChatIds = charIds;
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

        this.ptt = new PushToTalk({
            mode: 'toggle',
            maxDuration: 30000,
            onTranscript: (text) => {
                // Insert transcribed text into chat input
                if (this.input) {
                    const current = this.input.value;
                    const separator = current && !current.endsWith(' ') ? ' ' : '';
                    this.input.value = current + separator + text;
                    // Trigger auto-expand
                    this.input.dispatchEvent(new Event('input'));
                    this.input.focus();
                }
            },
            onStateChange: (pttState) => {
                micBtn.classList.remove('recording', 'processing');
                if (pttState === 'recording') {
                    micBtn.classList.add('recording');
                    micBtn.title = 'Recording... Click to stop';
                } else if (pttState === 'processing') {
                    micBtn.classList.add('processing');
                    micBtn.title = 'Transcribing...';
                } else {
                    micBtn.title = 'Voice Input (Push-to-Talk)';
                }
            }
        });

        this.ptt.attachToButton(micBtn);
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
                threshold: 0.015,
                silenceTimeout: 1500,
                activationDelay: 200,
                onSpeechStart: () => {
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

                // Show final stats — persists until next message (no revert to idle)
                this._lastGenTime = this.streamStartTime
                    ? (performance.now() - this.streamStartTime) / 1000
                    : 0;
                this._lastTotalTime = (performance.now() - this.prefillStartTime) / 1000;
                this._lastSpeed = this._lastGenTime > 0
                    ? (this.tokenCount / this._lastGenTime).toFixed(1) : '0';
                label.innerText = `DONE: ${this.tokenCount} tok | ${this._lastSpeed} tok/s | ${this._lastTotalTime.toFixed(1)}s`;
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
    async sendMessage() {
        const text = this.input.value.trim();
        if (!text || this.isThinking) return;

        // Disable controls
        if (this.sendBtn) this.sendBtn.disabled = true;
        this.input.disabled = true;
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

        // Timeout warning at 120s
        this.timeoutWarningTimer = setTimeout(() => {
            if (!this.isThinking) return;
            const shouldCancel = confirm(
                "The AI is taking longer than usual (2+ minutes).\n\n" +
                "Continue waiting or cancel?"
            );
            if (!shouldCancel && this.currentRequestAbortController) {
                this.currentRequestAbortController.abort();
                toast.warning("Request cancelled by user", 3000);
            }
        }, 120000);

        const startTime = performance.now();

        try {
            // Build streaming request
            const payload = {
                text,
                character_id: state.state.currentCharacterId,
                session_id: state.state.currentSessionId,
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

            // Read the SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events (delimited by double newlines)
                const events = buffer.split('\n\n');
                buffer = events.pop(); // Keep incomplete chunk in buffer

                for (const eventBlock of events) {
                    if (!eventBlock.trim()) continue;

                    const lines = eventBlock.split('\n');
                    let eventType = 'message';
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

            // Add info line with real token stats (left) and time (right)
            const genTime = this.streamStartTime
                ? ((performance.now() - this.streamStartTime) / 1000).toFixed(1)
                : '0';
            const elapsed = this.streamStartTime
                ? (performance.now() - this.streamStartTime) / 1000 : 0;
            const speed = elapsed > 0.2
                ? (this.tokenCount / elapsed).toFixed(1) : '0';
            const tokenCount = metadata?.token_count || this.tokenCount;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const infoLine = document.createElement('div');
            infoLine.className = 'bubble-info';
            infoLine.innerHTML = `<span class="bubble-info-stats">${tokenCount} tok · ${speed} tok/s · ${genTime}s</span><span class="bubble-info-time">${time}</span>`;
            streamContentEl.appendChild(infoLine);

            this.setThinking(false, null);

            // Play TTS audio if enabled and attach visualizer
            if (metadata?.reply && state.config?.tts?.enabled) {
                this._playTTSWithVisualizer(metadata.reply, streamRow);
            }

            // Update Memory Bank + session state
            if (metadata) {
                this.updateMemoryBank(metadata);
                // Notify dashboard to refresh relationship + emotion widgets
                bus.emit('chat:completed', metadata);
                if (metadata.session_id && metadata.session_id !== state.state.currentSessionId) {
                    state.state.currentSessionId = metadata.session_id;
                    state.loadSessions();
                }
            }

        } catch (err) {
            clearTimeout(this.timeoutWarningTimer);
            this.setThinking(false, null);
            console.error('[Chat] Stream error:', err);

            if (err.name === 'AbortError') {
                this.addBubble("Request cancelled", false, null);
            } else {
                this.addBubble(`Error: ${err.message}`, false, null);
                toast.error(`Chat error: ${err.message}`, 5000);
            }
        } finally {
            this.input.disabled = false;
            this.input.focus();
            if (this.sendBtn) this.sendBtn.disabled = false;
            this.currentRequestAbortController = null;
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

        this.input.disabled = false;
        this.input.focus();
        if (this.sendBtn) this.sendBtn.disabled = false;
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

        // Scroll to bottom after loading
        requestAnimationFrame(() => {
            this.container.scrollTop = this.container.scrollHeight;
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
        textEl.innerText = text;
        bubbleContent.appendChild(textEl);

        // Action buttons (edit for user, regen for AI) — shown on hover
        if (meta.messageId) {
            const actions = document.createElement('div');
            actions.className = 'bubble-actions';
            actions.style.cssText = 'position:absolute; top:4px; right:4px; display:none; gap:4px;';

            if (isUser) {
                actions.innerHTML = `<button class="bubble-action-btn bubble-edit-btn" title="Edit message" data-msg-id="${meta.messageId}">&#x270E;</button>`;
            } else {
                actions.innerHTML = `<button class="bubble-action-btn bubble-regen-btn" title="Regenerate response" data-msg-id="${meta.messageId}">&#x21BB;</button>`;
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
        if (isUser) {
            const charCount = text.length;
            infoLine.innerHTML = `<span class="bubble-info-stats">${charCount} chars</span><span class="bubble-info-time">${time}</span>`;
        } else if (meta.tokenCount) {
            const speed = meta.tokPerSec ? `${meta.tokPerSec} tok/s` : '';
            const duration = meta.totalTime ? `${meta.totalTime}s` : '';
            const stats = [`${meta.tokenCount} tok`, speed, duration].filter(Boolean).join(' · ');
            infoLine.innerHTML = `<span class="bubble-info-stats">${stats}</span><span class="bubble-info-time">${time}</span>`;
        } else {
            infoLine.innerHTML = `<span class="bubble-info-stats"></span><span class="bubble-info-time">${time}</span>`;
        }

        bubbleContent.appendChild(infoLine);

        row.innerHTML = isUser ? '' : avatarHtml;
        row.appendChild(bubbleContent);

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
