import { state } from './core/StateManager.js';
import { bus } from './core/EventBus.js';
import { logger } from './core/Logger.js';
import { live2d } from './live2d/Live2DManager.js';
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
import { API } from './core/API.js';

console.log("%c[Boot] Initiating CyberDeck V3.0...", "color:#00f0ff; font-weight:bold;");

// Error Trap
window.onerror = (msg, url, line) => {
    logger.error("Global", `${msg} (${url}:${line})`);
};

/**
 * Apply the bg_mode setting from config to the document body.
 * CSS rules keyed on body[data-bg-mode="..."] control the decorative background.
 *
 * @param {string} mode - One of: 'void', 'bento-gradient', 'digital-rain', 'city-video'
 */
function applyBgMode(mode) {
    if (!mode) return;
    // Normalize display name to a CSS-safe data attribute value (e.g., "Bento Gradient" → "bento-gradient")
    document.body.dataset.bgMode = mode.toLowerCase().replace(/\s+/g, '-');
    console.log(`%c[BgMode] Applied: ${document.body.dataset.bgMode}`, 'color:#ff9900;');
}

/**
 * Apply persisted visual config values to CSS custom properties immediately.
 * Called once on boot (after state.init()) and again on every config:updated
 * event so that sliders take effect without a page reload.
 *
 * CSS variables modified:
 *   --radius-panel  ← ui_border_radius (px)
 *   --glass-blur    ← ui_blur (px)
 *   --glow-intensity ← glow_intensity (0–100 → 0.0–1.0 normalized)
 * And body font-size ← ui_font_size (px).
 *
 * @param {Object} cfg - Config object from state.state.config
 */
function _applyVisualConfig(cfg) {
    if (!cfg) return;
    const r = document.documentElement;
    if (cfg.ui_border_radius !== undefined) {
        r.style.setProperty('--radius-panel', `${cfg.ui_border_radius}px`);
    }
    if (cfg.ui_blur !== undefined) {
        r.style.setProperty('--glass-blur', `${cfg.ui_blur}px`);
    }
    if (cfg.ui_font_size !== undefined) {
        document.body.style.fontSize = `${cfg.ui_font_size}px`;
    }
    if (cfg.glow_intensity !== undefined) {
        r.style.setProperty('--glow-intensity', cfg.glow_intensity / 100);
    }
    // #30 — Chat font size: S/M/L setting → CSS variable
    if (cfg.chat_font_size) {
        const sizeMap = { small: '0.8rem', medium: '0.9rem', large: '1.05rem' };
        const fontSize = sizeMap[cfg.chat_font_size] || '0.9rem';
        r.style.setProperty('--chat-font-size', fontSize);
    }
    // #93 — Timestamps toggle
    if (cfg.show_timestamps === false) {
        document.body.classList.add('hide-timestamps');
    } else {
        document.body.classList.remove('hide-timestamps');
    }
}

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

        // Wire up Pet Mode button — opens VRM viewer as a floating desktop popup.
        // The popup relays user messages back here via postMessage; ViewerBridge
        // routes them through ChatInterface so the full LLM pipeline runs normally.
        const petBtn = document.getElementById('btn-pet-mode');
        if (petBtn) {
            petBtn.onclick = () => {
                const win = viewer.openPetMode();
                if (!win) toast.warning('Pet window blocked — allow popups for this site', 4000);
            };
        }

        // Fix 5: Eagerly init Live2D PIXI canvas so it's ready before any mode switch.
        // Lazy init inside loadModel() can cause a race when the user switches modes quickly.
        live2d.init().catch(e => console.warn('[Live2D] Eager init failed:', e));

        // 3. Hydrate State
        await state.init();

        logger.success("System", "State Hydrated");

        // Fix 10: Apply bg_mode from config immediately after state is loaded.
        // bg_mode controls the decorative background behind the UI panels.
        applyBgMode(state.state.config?.bg_mode);
        // Also re-apply whenever settings are saved (config:updated fires after each saveConfig)
        bus.on('config:updated', (cfg) => {
            if (cfg.bg_mode) applyBgMode(cfg.bg_mode);
        });

        // Apply persisted visual settings as CSS variables immediately on load.
        // Without this, customizations (glow, blur, font size, radius) reset to
        // CSS defaults after every page refresh until the user re-saves settings.
        _applyVisualConfig(state.state.config || {});
        bus.on('config:updated', (cfg) => _applyVisualConfig(cfg));

        // 4. Check Dev Mode Pref
        if (state.state.config && state.state.config.dev_mode) {
            logger.toggle(true);
            logger.log("System", "Dev Mode Active via Config", "warn");
        }

        // 5. Register Global Keyboard Shortcuts
        setupKeyboardShortcuts(settings, charGrid, chat);
        logger.success("System", "Keyboard Shortcuts Registered");

        // 6a. Backend watchdog + connection quality indicator (#51, #52).
        // Polls /api/health every 30 seconds. On failure → shows red banner.
        // Every 10 seconds, measures round-trip latency and colours the dot
        // green (<150ms), yellow (150–500ms), or red (>500ms / offline).
        startBackendWatchdog();
        startArtStatusWatchdog(); // Phase 8A — AI art availability indicator

        // Font size (S/M/L) and compress history are settings-panel features.
        // Font size is controlled via Appearance → Base Font Size slider.
        // Compress history is triggered via Ctrl+H keyboard shortcut only.

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

    // Ctrl+H - Compress chat history (summarize + truncate current session)
    keyboard.register('Ctrl+h', async () => {
        const sessionId = state.state.currentSessionId;
        if (!sessionId) { toast.warning('No active session to compress', 2000); return; }
        try {
            const res = await API.post(`sessions/${sessionId}/summarize`);
            if (res.ok) {
                toast.success('History compressed — context window freed', 3000);
                const sessionData = await API.get(`sessions/${sessionId}/messages`);
                bus.emit('session:selected', sessionData);
            } else {
                toast.warning(res.error || 'Nothing to compress', 3000);
            }
        } catch (err) {
            toast.error(`Compress failed: ${err.message}`, 3000);
        }
    }, {
        allowInInput: false,
        description: 'Compress chat history'
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

/**
 * Start the backend health watchdog and connection quality indicator.
 *
 * Behaviour:
 * - Every 10 seconds: fetch /api/health and measure round-trip latency.
 *   The `#conn-quality-dot` changes colour: green (<150ms), yellow (150–500ms), red (fail/offline).
 * - Every 30 seconds (3rd tick): update the `#backend-offline-banner`.
 *   Banner shown on failure, hidden on recovery.
 *
 * Dot colours mirror standard monitoring conventions:
 *   🟢 green  — healthy, low latency
 *   🟡 yellow — healthy but slow (LLM or heavy load)
 *   🔴 red    — unreachable or error
 */
function startBackendWatchdog() {
    const dot = document.getElementById('conn-quality-dot');
    const banner = document.getElementById('backend-offline-banner');
    if (!dot) return;

    let tickCount = 0;

    const setDot = (color, glow, title) => {
        dot.style.background = color;
        dot.style.boxShadow = `0 0 6px ${glow}`;
        dot.title = title;
    };

    const tick = async () => {
        tickCount++;
        const t0 = performance.now();
        try {
            // ANY HTTP response means the server is alive (even 404 on older builds).
            // Only a network-level throw means truly unreachable.
            const res = await fetch('/api/health', { cache: 'no-store' });
            const latency = Math.round(performance.now() - t0);

            // Backend is reachable — grade by latency and health status
            if (banner) banner.style.display = 'none';
            if (res.ok) {
                if (latency < 150) {
                    setDot('#39ff14', '#39ff14', `Backend OK — ${latency}ms`);
                } else if (latency < 500) {
                    setDot('#ffd700', '#ffd700', `Backend slow — ${latency}ms`);
                } else {
                    setDot('#ff9900', '#ff9900', `Backend very slow — ${latency}ms`);
                }
            } else {
                // Server responded but health check returned non-2xx (old build or error)
                setDot('#ffd700', '#ffd700', `Backend alive (status ${res.status}) — ${latency}ms`);
            }
        } catch {
            // Network error — server is genuinely unreachable
            setDot('#ff003c', '#ff003c', 'Backend unreachable');
            if (banner) banner.style.display = 'block';
        }
    };

    // First check immediately, then every 10 seconds
    tick();
    setInterval(tick, 10_000);
}

/**
 * Poll /api/image-gen/status every 15 seconds and update the AI art
 * status indicator (🎨 icon in the viewport toolbar).
 *
 * When ComfyUI or Easy Diffusion is reachable the icon glows purple;
 * when offline it stays grey. Tooltip shows the provider + model.
 */
function startArtStatusWatchdog() {
    const icon = document.getElementById('art-status-icon');
    if (!icon) return;

    const tick = async () => {
        try {
            const res = await fetch('/api/image-gen/status', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.available) {
                icon.style.opacity = '1';
                icon.style.filter = 'drop-shadow(0 0 4px rgba(157,80,255,0.9))';
                icon.title = `AI Art: ${data.provider} available — ${data.model || 'no model set'}`;
                icon.style.color = 'rgba(157,80,255,0.9)';
            } else {
                icon.style.opacity = '0.35';
                icon.style.filter = 'none';
                const providerName = data.provider === 'disabled' ? 'disabled in settings' : `${data.provider} offline`;
                icon.title = `AI Art: ${providerName} — enable in Settings → AI ART`;
                icon.style.color = 'var(--text-muted)';
            }
        } catch {
            icon.style.opacity = '0.2';
            icon.style.filter = 'none';
            icon.title = 'AI Art: backend unreachable';
        }
    };

    tick();
    setInterval(tick, 15_000);
}

// Check if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
