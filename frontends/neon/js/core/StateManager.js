import { bus } from './EventBus.js';
import { API } from './API.js';

/**
 * StateManager.js
 * The Single Source of Truth for the application.
 * Manages Data (Plan), emits Events (Update), and calls API (Action).
 */
export class StateManager {
    constructor() {
        this.state = {
            config: {},
            characters: [],
            currentCharacterId: null,
            sessions: [],
            currentSessionId: null,
            isConnected: false
        };
    }

    /**
     * Initialize Application State
     */
    async init() {
        console.log("[State] Initializing...");
        try {
            await Promise.all([
                this.loadConfig(),
                this.loadCharacters(),
            ]);
            this.state.isConnected = true;
            bus.emit('ready', this.state);
        } catch (error) {
            console.error("[State] Init Failed", error);
            bus.emit('error', error);
        }
    }

    // --- CONFIG ---
    async loadConfig() {
        const data = await API.get('config');
        this.state.config = data;
        bus.emit('config:updated', this.state.config);
    }

    async saveConfig(newConfig) {
        await API.put('config', newConfig);
        await this.loadConfig(); // Reload to confirm
    }

    // --- CHARACTERS ---
    async loadCharacters() {
        const data = await API.get('characters');
        this.state.characters = data.characters || [];
        bus.emit('characters:updated', this.state.characters);

        // Auto-select first if none selected — await so sessions load before init completes
        if (!this.state.currentCharacterId && this.state.characters.length > 0) {
            await this.selectCharacter(this.state.characters[0].id);
        }
    }

    async saveCharacter(id, changes) {
        await API.put(`characters/${id}`, changes);
        await this.loadCharacters(); // Reload to confirm
    }

    /**
     * Select a character and load their most recent chat session.
     * Emits 'character:selected', then loads sessions and auto-selects the latest.
     *
     * @param {number} id - Character ID to select
     */
    async selectCharacter(id) {
        const char = this.state.characters.find(c => c.id == id);
        if (char) {
            this.state.currentCharacterId = id;
            this.state.currentSessionId = null; // Reset until we find one
            bus.emit('character:selected', char);

            // Load sessions and auto-select the most recent one
            await this.loadSessions();
        }
    }

    // --- SESSIONS ---

    /**
     * Load all chat sessions from the backend.
     * Only auto-selects a session if none is currently active, preventing
     * the re-render race condition during active streaming.
     */
    async loadSessions() {
        try {
            const data = await API.get('sessions');
            this.state.sessions = data.sessions || [];
            bus.emit('sessions:updated', this.state.sessions);

            // Only auto-select if no session is currently active
            if (!this.state.currentSessionId) {
                const withMessages = this.state.sessions.filter(s => s.message_count > 0);
                if (withMessages.length > 0) {
                    await this.selectSession(withMessages[0].id);
                }
            }
        } catch (e) {
            console.error('[State] Failed to load sessions:', e);
        }
    }

    /**
     * Select a session and load its message history.
     * Emits 'session:selected' with the full message list.
     *
     * @param {number} sessionId - Session ID to load
     */
    async selectSession(sessionId) {
        this.state.currentSessionId = sessionId;
        try {
            const data = await API.get(`sessions/${sessionId}/messages`);
            const messages = data.messages || [];
            bus.emit('session:selected', { sessionId, messages });
        } catch (e) {
            console.error('[State] Failed to load messages:', e);
            bus.emit('session:selected', { sessionId, messages: [] });
        }
    }

    /**
     * Create a new empty chat session.
     *
     * @param {string} title - Optional session title
     * @returns {Object} The created session {id, title}
     */
    async createSession(title) {
        const session = await API.post('sessions', {
            title: title || `Chat ${new Date().toLocaleDateString()}`
        });
        this.state.currentSessionId = session.id;
        await this.loadSessions();
        bus.emit('session:selected', { sessionId: session.id, messages: [] });
        return session;
    }

    // --- CHAT ---

    /**
     * Send a chat message to the current character in the current session.
     *
     * @param {string} text - Message text
     * @param {Object} options - Fetch options (e.g. AbortController signal)
     * @returns {Object} Chat response with reply, audio, memory_hits, etc.
     */
    async sendMessage(text, options = {}) {
        if (!this.state.currentCharacterId) throw new Error("No character selected");

        const payload = {
            text: text,
            character_id: this.state.currentCharacterId,
            session_id: this.state.currentSessionId
        };

        const response = await API.post('chat', payload, options);

        // If server returns a new session ID, update state
        if (response.session_id && response.session_id !== this.state.currentSessionId) {
            this.state.currentSessionId = response.session_id;
            // Refresh session list to include the new session
            this.loadSessions();
        }

        return response;
    }
}

export const state = new StateManager();
