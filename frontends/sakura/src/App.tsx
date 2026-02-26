import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ChatThread } from './views/ChatThread';
import { CreateView } from './views/CreateView';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';

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
  const { loadCharacters, loadConfig, activeCharacter, sidebarSection } = useAppStore();
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

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
    </div>
  );
}
