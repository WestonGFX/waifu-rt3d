import { useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
import { VocabPanel } from './components/VocabPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
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
    setSidebarSection
  } = useAppStore();
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  // Global keyboard shortcuts
  const shortcuts = useMemo(() => [
    { key: 'ctrl+,', action: () => openOverlay('settings'), description: 'Open settings' },
    { key: 'ctrl+m', action: () => openOverlay('memory'), description: 'Open memory manager' },
    { key: 'ctrl+k', action: () => openOverlay('vocab'), description: 'Open vocabulary manager' },
    { key: 'ctrl+n', action: () => setSidebarSection('create'), description: 'New character' },
    { key: 'ctrl+b', action: () => toggleSidebar(), description: 'Toggle sidebar' },
    {
      key: 'escape',
      action: () => {
        if (activeOverlay) closeOverlay();
      },
      description: 'Close overlay'
    },
  ], [openOverlay, closeOverlay, activeOverlay, toggleSidebar, setSidebarSection]);

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
    </div>
  );
}
