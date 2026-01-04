// Main Alpine.js application
document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        // State
        darkMode: localStorage.getItem('darkMode') === 'true',
        sidebarOpen: false,
        settingsOpen: false,
        modelManagerOpen: false,
        terminalOpen: true,
        modelSearchQuery: '',
        modelFilter: 'downloads',
        searchResults: [],
        installedModels: {},
        isSearching: false,
        logs: [],
        systemStats: { cpu: 0, ram: 0, gpu: 0 },
        currentSessionId: 1,
        currentCharacterId: 1,
        sessions: [],
        messages: [],
        inputText: '',
        isTyping: false,
        currentPhase: '',
        devMode: localStorage.getItem('devMode') === 'true',
        llmStatus: { ok: false, error: 'Checking...' },
        config: {
            llm: {
                endpoint: '',
                model: '',
                temperature: 0.7
            },
            tts: {
                enabled: true,
                provider: 'local'
            },
            asr: {
                enabled: false,
                provider: 'web_speech'
            }
        },

        // Initialization
        async init() {
            // Apply dark mode
            if (this.darkMode) {
                document.documentElement.classList.add('dark');
            }

            // Load initial data
            await this.loadConfig();
            await this.loadSessions();
            await this.loadMessages(this.currentSessionId);

            // Start polling
            this.pollHealth();
            this.pollStats();
            setInterval(() => this.pollHealth(), 30000);
            setInterval(() => this.pollStats(), 2000);

            // Setup auto-scroll on new messages
            this.$watch('messages', () => {
                this.$nextTick(() => this.scrollToBottom());
            });
        },

        // Dark mode toggle
        toggleDarkMode() {
            this.darkMode = !this.darkMode;
            localStorage.setItem('darkMode', this.darkMode);
            document.documentElement.classList.toggle('dark', this.darkMode);
        },

        // Health polling
        async pollHealth() {
            const data = await api.healthCheck();
            this.llmStatus = data.llm || { ok: data.ok, error: data.issues?.[0] || 'Unknown' };
        },

        async pollStats() {
            const stats = await api.getSystemStats();
            this.systemStats = stats;
            
            if (this.terminalOpen) {
                try {
                    const res = await fetch('/api/logs');
                    const data = await res.json();
                    if (data.logs && data.logs.length > 0) {
                        this.logs = [...this.logs, ...data.logs].slice(-50);
                        this.$nextTick(() => {
                            const term = document.getElementById('terminal-output');
                            if (term) term.scrollTop = term.scrollHeight;
                        });
                    }
                } catch(e) {}
            }
        },

        // Model Manager
        async searchModels(type) {
            this.isSearching = true;
            this.searchResults = [];
            try {
                let task = '';
                if (type === 'llm') task = 'text-generation';
                if (type === 'tts') task = 'text-to-speech';
                if (type === 'asr') task = 'automatic-speech-recognition';
                
                const data = await api.searchModels(this.modelSearchQuery, task, this.modelFilter);
                this.searchResults = data.models || [];
            } catch (e) {
                this.showToast('Search failed', 'error');
            } finally {
                this.isSearching = false;
            }
        },
        
        async installModel(id, type) {
            try {
                const res = await api.installModel(id, type);
                if (res.ok) {
                    this.showToast(`Installing ${id}...`, 'info');
                } else {
                    this.showToast(res.error, 'error');
                }
            } catch (e) { this.showToast('Install request failed', 'error'); }
        },
        
        async loadInstalledModels() {
            const data = await api.getInstalledModels();
            this.installedModels = data;
        },
        
        async deleteModel(type, id) {
            if (!confirm('Are you sure you want to delete this model?')) return;
            try {
                const res = await api.deleteModel(type, id);
                if (res.ok) {
                    this.showToast('Model deleted', 'success');
                    this.loadInstalledModels();
                } else {
                    this.showToast('Delete failed', 'error');
                }
            } catch (e) { this.showToast('Delete error', 'error'); }
        },

        formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num;
        },

        // Session management
        async loadSessions() {
            try {
                const data = await api.getSessions();
                this.sessions = data.sessions || [];
            } catch (error) {
                console.error('Failed to load sessions:', error);
                this.showToast('Failed to load sessions', 'error');
            }
        },

        async createNewSession() {
            try {
                const title = `Chat ${new Date().toLocaleString()}`;
                const data = await api.createSession(title);
                this.currentSessionId = data.id;
                await this.loadSessions();
                this.messages = [];
                this.sidebarOpen = false; // Close sidebar on mobile
            } catch (error) {
                console.error('Failed to create session:', error);
                this.showToast('Failed to create new chat', 'error');
            }
        },

        async switchSession(sessionId) {
            this.currentSessionId = sessionId;
            await this.loadMessages(sessionId);
            this.sidebarOpen = false; // Close sidebar on mobile
        },

        // Messages
        async loadMessages(sessionId) {
            try {
                const data = await api.getMessages(sessionId);
                this.messages = (data.messages || []).map((msg, index) => ({
                    id: index,
                    role: msg.role,
                    text: msg.text
                }));
            } catch (error) {
                console.error('Failed to load messages:', error);
            }
        },

        async sendMessage() {
            const text = this.inputText.trim();
            if (!text || this.isTyping) return;

            // Add user message immediately
            this.messages.push({
                id: Date.now(),
                role: 'user',
                text
            });

            // Clear input
            this.inputText = '';
            this.isTyping = true;
            this.currentPhase = 'Connecting...';

            try {
                this.currentPhase = 'Thinking...';
                const response = await api.sendMessage(
                    this.currentSessionId,
                    this.currentCharacterId,
                    text,
                    this.config.tts?.enabled
                );

                this.currentPhase = 'Responding...';
                if (response.ok) {
                    this.messages.push({
                        id: Date.now() + 1,
                        role: 'assistant',
                        text: response.reply
                    });

                    // Play audio if available
                    if (response.audio && this.config.tts?.enabled) {
                        const audio = new Audio(response.audio);
                        audio.play();
                    }
                } else {
                    const errorMsg = response.error || 'Unknown error';
                    const errorCode = response.code || 'ERR_UNKNOWN';

                    this.messages.push({
                        id: Date.now() + 1,
                        role: 'assistant',
                        text: `**System Error (${errorCode}):** ${errorMsg}\n\n*Please check your LLM server connection.*`
                    });

                    if (this.devMode) {
                        console.error('LLM Failure Detail:', response);
                        this.showToast(`Dev Log: ${errorCode}`, 'error');
                    }
                }
            } catch (error) {
                console.error('Failed to send message:', error);
                this.messages.push({
                    id: Date.now() + 1,
                    role: 'assistant',
                    text: `**Network Error:** ${error.message || 'Failed to reach AI Backend'}`
                });
            } finally {
                this.isTyping = false;
                this.pollHealth(); // Check health after failure
            }
        },

        // Configuration
        async loadConfig() {
            try {
                const data = await api.getConfig();
                this.config = {
                    llm: data.llm || this.config.llm,
                    tts: data.tts || this.config.tts,
                    asr: data.asr || this.config.asr
                };
            } catch (error) {
                console.error('Failed to load config:', error);
            }
        },

        async saveSettings() {
            try {
                localStorage.setItem('devMode', this.devMode);
                await api.updateConfig(this.config);
                this.settingsOpen = false;
                this.showToast('Settings saved successfully', 'success');
                this.pollHealth(); // Re-check health with new config
            } catch (error) {
                console.error('Failed to save settings:', error);
                this.showToast('Failed to save settings', 'error');
            }
        },

        // Utility functions
        renderMarkdown(text) {
            return marked.parse(text);
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            const hours = Math.floor(diff / 3600000);

            if (hours < 1) return 'Just now';
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString();
        },

        autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        },

        scrollToBottom() {
            const container = document.querySelector('.overflow-y-auto');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        },

        showToast(message, type = 'info') {
            // Simple toast implementation (can be enhanced with a toast library)
            console.log(`[${type.toUpperCase()}] ${message}`);
            // TODO: Implement visual toast notifications
        }
    }));
});
