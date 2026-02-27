import { useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
import { VocabPanel } from './components/VocabPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ChatThread } from './views/ChatThread';
import { CreateView } from './views/CreateView';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

/**
 * Root layout — desktop-first with left sidebar + main content area.
 *
 * Layout structure:
 *   ┌──────────┬──────────────────────────────┐
 *   │          │                              │
 *   │ Sidebar  │     Main Content             │
 *   │ (280px)  │  (Chat / Create / Welcome)   │
 *   │          │                              │
 *   └──────────┴──────────────────────────────┘
 *
 * - Sidebar: collapsible, contains character list + presets + create
 * - Main: ChatThread when a character is selected, CreateView when
 *   "create" section is active, or WelcomeScreen as default
 * - Settings & Memory: slide-out overlay drawers (right side)
 */
export function App() {
  const {
    loadCharacters, loadConfig, activeCharacter, sidebarSection,
    openOverlay, closeOverlay, activeOverlay, toggleSidebar,
    setSidebarSection, config, configLoaded
  } = useAppStore();

  // Show onboarding wizard on first run (gated on configLoaded to avoid flash)
  const showOnboarding = configLoaded && !config.onboarded;
  const { theme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);

  // PWA install prompt — captured from the browser's beforeinstallprompt event
  const installPromptRef = useRef<Event & { prompt: () => Promise<void> } | null>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    /**
     * Capture the browser's install prompt so we can trigger it from our
     * own button instead of the default browser UI.
     *
     * @param {Event} e - The BeforeInstallPromptEvent
     */
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as Event & { prompt: () => Promise<void> };
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    // Once installed, hide the button
    window.addEventListener('appinstalled', () => setShowInstallBtn(false));
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  /**
   * Trigger the deferred browser install prompt and hide the button
   * regardless of whether the user accepts or dismisses it.
   */
  const handleInstall = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    installPromptRef.current = null;
    setShowInstallBtn(false);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  // Global keyboard shortcuts
  // Note: ctrl+k, ctrl+n, ctrl+b are Chrome reserved — use Alt or ctrl+\ instead.
  const shortcuts = useMemo(() => [
    { key: 'ctrl+,', action: () => openOverlay('settings'), description: 'Open settings' },
    { key: 'ctrl+m', action: () => openOverlay('memory'), description: 'Open memory manager' },
    { key: 'alt+v', action: () => openOverlay('vocab'), description: 'Open vocabulary manager' },
    { key: 'alt+n', action: () => setSidebarSection('create'), description: 'New character' },
    { key: 'ctrl+\\', action: () => toggleSidebar(), description: 'Toggle sidebar' },
    { key: '?', action: () => setShowHelp(h => !h), description: 'Show keyboard shortcuts' },
    {
      key: 'escape',
      action: () => {
        if (showHelp) { setShowHelp(false); return; }
        if (activeOverlay) closeOverlay();
      },
      description: 'Close overlay'
    },
  ], [openOverlay, closeOverlay, activeOverlay, toggleSidebar, setSidebarSection, showHelp]);

  useKeyboardShortcuts(shortcuts);

  /** Determine what to render in the main content area. */
  const mainContent = (() => {
    // Create wizard takes priority when that section is active
    if (sidebarSection === 'create') return <CreateView />;
    // If a character is selected, show the chat thread
    if (activeCharacter) return <ChatThread />;
    // Otherwise show the welcome screen
    return <WelcomeScreen />;
  })();

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
      <Sidebar />
      <main className="flex-1 min-w-0 h-screen overflow-hidden">
        {mainContent}
      </main>

      {/* Overlay drawers */}
      <SettingsDrawer />
      <MemoryPanel />
      <VocabPanel />
      <ShortcutHelpModal open={showHelp} shortcuts={shortcuts} onClose={() => setShowHelp(false)} />

      {/* First-run onboarding wizard — shown once, then config.onboarded = true */}
      {showOnboarding && <OnboardingWizard onComplete={() => {}} />}

      {/* PWA install prompt — only visible when browser fires beforeinstallprompt */}
      {showInstallBtn && (
        <button
          onClick={handleInstall}
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 999,
            fontSize: 11,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          ⬇ Install App
        </button>
      )}
    </div>
  );
}
