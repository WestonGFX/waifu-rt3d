import { bus } from '../core/EventBus.js';
import { state } from '../core/StateManager.js';

export class ViewerBridge {
    constructor() {
        this.iframe = document.getElementById('vrm-iframe');
        // Point to the 3D viewer HTML
        // Assuming it's served at /viewer or similar. 
        // Based on file structure: frontends/neon/viewer/index.html
        // We might need to serve it properly. For now assuming relative path works if served statically.

        // Actually, let's assume we load the viewer HTML into the iframe
        if (this.iframe) {
            this.iframe.src = "viewer/viewer.html";
            this.iframe.onload = () => this.onLoad();
        }

        bus.on('character:selected', (char) => this.loadCharacter(char));
        bus.on('config:updated', (cfg) => this.updateSettings(cfg));
    }

    onLoad() {
        console.log("[ViewerBridge] Iframe Loaded.");
        // If we already have a character selected, load it now
        if (state.state.currentCharacterId) {
            const char = state.state.characters.find(c => c.id === state.state.currentCharacterId);
            if (char) this.loadCharacter(char);
        }
    }

    loadCharacter(char) {
        if (!this.iframe.contentWindow) return;
        console.log("[ViewerBridge] Loading Character:", char.name);

        this.iframe.contentWindow.postMessage({
            type: 'loadCharacter',
            payload: {
                modelUrl: char.avatar_url || '/files/avatars/default.vrm', // Fallback
                meta: char
            }
        }, '*');
    }

    updateSettings(config) {
        if (!this.iframe.contentWindow) return;
        // Example: Update background or graphical settings
        if (config.visuals) {
            this.iframe.contentWindow.postMessage({
                type: 'updateSettings',
                payload: config.visuals
            }, '*');
        }
    }
}
