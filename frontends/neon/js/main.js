import { state } from './core/StateManager.js';
import { logger } from './core/Logger.js';
import { Dashboard } from './components/Dashboard.js';
import { CharacterGrid } from './components/CharacterGrid.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ChatInterface } from './components/ChatInterface.js';
import { PersonaCreator } from './components/PersonaCreator.js';
import { ModelManager } from './components/ModelManager.js';
import { MemoryManager } from './components/MemoryManager.js';
import { ViewerBridge } from './components/ViewerBridge.js';
import { ExpressionEditor } from './components/ExpressionEditor.js';
import { ThemeEditor } from './components/ThemeEditor.js';
import { DevConsole } from './components/DevConsole.js';
import { VocabManager } from './components/VocabManager.js';
import { HotkeyEditor } from './components/HotkeyEditor.js';
import { keyboard } from './utils/KeyboardShortcuts.js';
import { toast } from './utils/Toast.js';

console.log("%c[Boot] Initiating CyberDeck V3.0...", "color:#00f0ff; font-weight:bold;");

// Error Trap
window.onerror = (msg, url, line) => {
    logger.error("Global", `${msg} (${url}:${line})`);
};

// Main Initialization Logic
async function initApp() {
    try {
        console.log("Initializing App...");

        // 0. Restore theme from localStorage (apply before rendering)
        const savedTheme = localStorage.getItem('waifu-theme');
        if (savedTheme) {
            if (savedTheme.startsWith('custom:')) {
                // Restore custom theme from localStorage
                const customName = savedTheme.slice(7);
                try {
                    const customThemes = JSON.parse(localStorage.getItem('waifu-custom-themes') || '{}');
                    if (customThemes[customName]) {
                        Object.entries(customThemes[customName]).forEach(([varName, value]) => {
                            document.documentElement.style.setProperty(varName, value);
                        });
                        console.log(`%c[Theme] Restored custom: ${customName}`, "color:#ff00ff;");
                    }
                } catch (e) {
                    console.warn('[Theme] Failed to restore custom theme:', e);
                }
            } else {
                document.body.dataset.theme = savedTheme;
                console.log(`%c[Theme] Restored: ${savedTheme}`, "color:#ff00ff;");
            }
        }

        // 0b. Restore chat layout mode from localStorage
        const mainView = document.querySelector('.main-view');
        if (mainView) {
            const savedLayout = localStorage.getItem('waifu-chat-layout') || 'layout-auto';
            mainView.classList.add(savedLayout);
            // Default to no-model until viewer.html confirms a VRM is loaded
            if (savedLayout === 'layout-auto') {
                mainView.classList.add('no-model');
            }
            console.log(`%c[Layout] Restored: ${savedLayout}`, "color:#39ff14;");
        }

        // 1. Init Shell
        const dashboard = new Dashboard();

        // 2. Init Interactive Components
        const charGrid = new CharacterGrid();
        const settings = new SettingsModal();
        const chat = new ChatInterface();
        const personaCreator = new PersonaCreator();
        const modelManager = new ModelManager();
        const memoryManager = new MemoryManager();
        const viewer = new ViewerBridge();
        const expressionEditor = new ExpressionEditor();
        const themeEditor = new ThemeEditor();
        const devConsole = new DevConsole();
        const vocabManager = new VocabManager();
        const hotkeyEditor = new HotkeyEditor();

        // 3. Expose Global API for HTML Event Handlers
        window.app = {
            dashboard,
            charGrid,
            settings,
            chat,
            personaCreator,
            modelManager,
            memoryManager,
            viewer,
            expressionEditor,
            themeEditor,
            devConsole,
            vocabManager,
            hotkeyEditor,
            state
        };

        logger.success("System", "Components Initialized & Exposed to Window");

        // Wire up Memory Manager button
        const memBtn = document.getElementById('btn-memory-manager');
        if (memBtn) {
            memBtn.onclick = () => memoryManager.open();
        }

        // Wire up Screenshot button
        const screenshotBtn = document.getElementById('btn-screenshot');
        if (screenshotBtn) {
            screenshotBtn.onclick = async () => {
                toast.info('Capturing screenshot...', 1500);
                const dataUrl = await viewer.captureScreenshot();
                if (dataUrl) {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `waifu-screenshot-${Date.now()}.png`;
                    a.click();
                    toast.success('Screenshot saved!');
                } else {
                    toast.error('Screenshot capture failed');
                }
            };
        }

        // 3. Hydrate State
        await state.init();

        logger.success("System", "State Hydrated");

        // 4. Check Dev Mode Pref
        if (state.state.config && state.state.config.dev_mode) {
            logger.toggle(true);
            logger.log("System", "Dev Mode Active via Config", "warn");
        }

        // 5. Register Global Keyboard Shortcuts
        setupKeyboardShortcuts(settings, charGrid, chat);
        logger.success("System", "Keyboard Shortcuts Registered");

        // 6. Listen for model load events from viewer iframe
        window.addEventListener('message', (e) => {
            const mv = document.querySelector('.main-view');
            if (!mv) return;
            if (e.data && e.data.type === 'modelLoaded') {
                mv.classList.remove('no-model');
                console.log('%c[Layout] VRM model loaded — viewport visible', 'color:#39ff14;');
            } else if (e.data && e.data.type === 'modelFailed') {
                mv.classList.add('no-model');
                console.log('%c[Layout] VRM load failed — chat expanded', 'color:#ff003c;');
            }
        });

    } catch (e) {
        logger.error("Boot", "Critical Failure: " + e.message);
        document.body.innerHTML += `<div style="color:red; padding:20px;">CRITICAL SYSTEM FAILURE: ${e.message}</div>`;
    }
}

/**
 * Setup global keyboard shortcuts
 */
function setupKeyboardShortcuts(settings, charGrid, chat) {
    // Ctrl+K - Quick character switcher (focus on character grid)
    keyboard.register('Ctrl+k', () => {
        const firstCard = document.querySelector('.char-card[data-id]');
        if (firstCard) {
            firstCard.focus();
            toast.info('Character switcher active. Use arrow keys to navigate.', 2000);
        }
    }, {
        allowInInput: true,
        description: 'Quick character switcher'
    });

    // Ctrl+, (comma) - Open settings
    keyboard.register('Ctrl+,', () => {
        settings.open();
    }, {
        allowInInput: true,
        description: 'Open settings'
    });

    // Ctrl+N - Open Persona Creator (new persona)
    keyboard.register('Ctrl+n', () => {
        if (window.openPersonaCreator) {
            window.openPersonaCreator();
        }
    }, {
        allowInInput: false,
        description: 'New persona'
    });

    // Escape - Close modals/overlays (checks all modals in z-order)
    keyboard.register('Escape', () => {
        // Close topmost open modal
        const modals = [
            { id: 'dev-console-panel', close: () => window.app?.devConsole?.close() },
            { id: 'expression-editor-modal', close: () => window.app?.expressionEditor?.close() },
            { id: 'theme-editor-modal', close: () => window.app?.themeEditor?.close() },
            { id: 'hotkey-editor-modal', close: () => window.app?.hotkeyEditor?.close() },
            { id: 'vocab-manager-modal', close: () => window.app?.vocabManager?.close() },
            { id: 'memory-manager-modal', close: () => window.app?.memoryManager?.close() },
            { id: 'persona-creator-modal', close: () => window.app?.personaCreator?.close() },
            { id: 'model-manager-modal', close: () => window.app?.modelManager?.close() },
            { id: 'settings-modal', close: () => settings.close() }
        ];
        for (const modal of modals) {
            const el = document.getElementById(modal.id);
            if (el && el.style.display !== 'none') {
                modal.close();
                return;
            }
        }
    }, {
        allowInInput: true,
        description: 'Close modals'
    });

    // Ctrl+/ - Show keyboard shortcuts help
    keyboard.register('Ctrl+/', () => {
        const shortcuts = keyboard.getAll();
        const helpText = shortcuts.map(s => `${s.shortcut}: ${s.description}`).join('\n');
        toast.info(`Keyboard Shortcuts:\n${helpText}`, 8000);
    }, {
        allowInInput: true,
        description: 'Show this help'
    });

    // Alt+1, Alt+2, Alt+3, etc. - Quick switch to character by position
    for (let i = 1; i <= 9; i++) {
        keyboard.register(`Alt+${i}`, () => {
            const cards = Array.from(document.querySelectorAll('.char-card[data-id]'));
            const index = i - 1; // Alt+1 = index 0
            if (cards[index]) {
                const charId = cards[index].dataset.id;
                if (charId) {
                    state.selectCharacter(parseInt(charId));
                }
            }
        }, {
            allowInInput: true,
            description: `Switch to character #${i}`
        });
    }

    // Ctrl+M - Open Memory Manager
    keyboard.register('Ctrl+m', () => {
        if (window.app?.memoryManager) {
            window.app.memoryManager.open();
        }
    }, {
        allowInInput: true,
        description: 'Memory Manager'
    });

    // Ctrl+Enter - Focus chat input (from anywhere)
    keyboard.register('Ctrl+Enter', () => {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.focus();
        }
    }, {
        allowInInput: false,
        description: 'Focus chat input'
    });

    // Ctrl+E - Open Expression Editor
    keyboard.register('Ctrl+e', () => {
        if (window.app?.expressionEditor) {
            window.app.expressionEditor.open();
        }
    }, {
        allowInInput: false,
        description: 'Expression Editor'
    });

    // Ctrl+T - Open Theme Editor
    keyboard.register('Ctrl+t', () => {
        if (window.app?.themeEditor) {
            window.app.themeEditor.open();
        }
    }, {
        allowInInput: false,
        description: 'Theme Editor'
    });

    // Ctrl+Shift+S - Screenshot
    keyboard.register('Ctrl+Shift+s', async () => {
        const viewer = window.app?.viewer;
        if (!viewer) return;
        toast.info('Capturing screenshot...', 1500);
        const dataUrl = await viewer.captureScreenshot();
        if (dataUrl) {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `waifu-screenshot-${Date.now()}.png`;
            a.click();
            toast.success('Screenshot saved!');
        }
    }, {
        allowInInput: true,
        description: 'Capture screenshot'
    });

    // Ctrl+Shift+D - Toggle Developer Console
    keyboard.register('Ctrl+Shift+d', () => {
        if (window.app?.devConsole) {
            window.app.devConsole.toggle();
        }
    }, {
        allowInInput: true,
        description: 'Developer Console'
    });

    // Ctrl+Shift+H - Open Hotkey Editor
    keyboard.register('Ctrl+Shift+h', () => {
        if (window.app?.hotkeyEditor) {
            window.app.hotkeyEditor.open();
        }
    }, {
        allowInInput: true,
        description: 'Hotkey Editor'
    });

    // Ctrl+0 - Reset camera
    keyboard.register('Ctrl+0', () => {
        if (window.app?.viewer) {
            window.app.viewer.resetCamera();
            toast.info('Camera reset', 1500);
        }
    }, {
        allowInInput: false,
        description: 'Reset camera'
    });
}

// Check if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
