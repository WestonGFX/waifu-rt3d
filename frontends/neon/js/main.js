import { state } from './core/StateManager.js';
import { logger } from './core/Logger.js';
import { Dashboard } from './components/Dashboard.js';
import { CharacterGrid } from './components/CharacterGrid.js'; // The new Grid
import { SettingsModal } from './components/SettingsModal.js'; // The new 32-setting modal
import { ChatInterface } from './components/ChatInterface.js';
import { ViewerBridge } from './components/ViewerBridge.js';

console.log("%c[Boot] Initiating CyberDeck V3.0...", "color:#00f0ff; font-weight:bold;");

// Error Trap
window.onerror = (msg, url, line) => {
    logger.error("Global", `${msg} (${url}:${line})`);
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Init Shell
        const dashboard = new Dashboard();

        // 2. Init Interactive Components
        const charGrid = new CharacterGrid();
        const settings = new SettingsModal();
        const chat = new ChatInterface();
        const viewer = new ViewerBridge();

        logger.success("System", "Components Initialized");

        // 3. Hydrate State
        await state.init();

        logger.success("System", "State Hydrated");

        // 4. Check Dev Mode Pref
        if (state.state.config && state.state.config.dev_mode) {
            logger.toggle(true);
            logger.log("System", "Dev Mode Active via Config", "warn");
        }

    } catch (e) {
        logger.error("Boot", "Critical Failure: " + e.message);
        document.body.innerHTML += `<div style="color:red; padding:20px;">CRITICAL SYSTEM FAILURE: ${e.message}</div>`;
    }
});
