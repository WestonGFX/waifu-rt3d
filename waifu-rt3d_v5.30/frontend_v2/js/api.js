// API communication layer
const API_BASE = "http://localhost:8000"; // Fixed: Point to backend port, not frontend port (8080)

const api = {
    // Session management
    async getSessions() {
        const response = await fetch(`${API_BASE}/api/sessions`);
        return response.json();
    },

    async createSession(title) {
        const response = await fetch(`${API_BASE}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        return response.json();
    },

    async getMessages(sessionId) {
        const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
        return response.json();
    },

    // Chat
    async sendMessage(sessionId, charId, text, speak = false) {
        const response = await fetch(`${API_BASE}/api/chat?session_id=${sessionId}&char_id=${charId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, speak })
        });
        return response.json();
    },

    // Configuration
    async getConfig() {
        const response = await fetch(`${API_BASE}/api/config`);
        return response.json();
    },

    async updateConfig(config) {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        return response.json();
    },

    // Characters
    async getCharacters() {
        const response = await fetch(`${API_BASE}/api/characters`);
        return response.json();
    },

    // Health check
    async healthCheck() {
        try {
            const response = await fetch(`${API_BASE}/api/healthcheck`);
            return response.json();
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
};
