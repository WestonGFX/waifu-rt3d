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

        // Auto-select first if none selected
        if (!this.state.currentCharacterId && this.state.characters.length > 0) {
            this.selectCharacter(this.state.characters[0].id);
        }
    }

    async saveCharacter(id, changes) {
        await API.put(`characters/${id}`, changes);
        await this.loadCharacters(); // Reload to confirm
    }

    selectCharacter(id) {
        const char = this.state.characters.find(c => c.id == id); // Loose equality for string/int mix
        if (char) {
            this.state.currentCharacterId = id;
            bus.emit('character:selected', char);
        }
    }

    // --- SESSIONS ---
    async loadSessions() {
        const data = await API.get('sessions');
        this.state.sessions = data.sessions || [];
        bus.emit('sessions:updated', this.state.sessions);
    }

    // --- CHAT ---
    async sendMessage(text) {
        if (!this.state.currentCharacterId) throw new Error("No character selected");

        // Optimistic UI update handled by component, this is the data sync
        const payload = {
            text: text,
            character_id: this.state.currentCharacterId,
            session_id: this.state.currentSessionId // Null is fine, server creates new one
        };

        const response = await API.post('chat', payload);

        // If server returns a new session ID, update state
        if (response.session_id && response.session_id !== this.state.currentSessionId) {
            this.state.currentSessionId = response.session_id;
        }

        return response; // { text: "...", audio: "...", ... }
    }
}

export const state = new StateManager();
