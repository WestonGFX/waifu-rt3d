import { useEffect, useRef, useState } from 'react';
import { TabBar } from './components/TabBar';
import { ChatsView } from './views/ChatsView';
import { DiscoverView } from './views/DiscoverView';
import { CreateView } from './views/CreateView';
import { ChatThread } from './views/ChatThread';
import { SettingsView } from './views/SettingsView';
import { MemoryPanel } from './components/MemoryPanel';
import { MilestoneCelebration, useMilestoneDetection } from './components/MilestoneCelebration';
import { OnboardingWizard } from './components/OnboardingWizard';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';

/**
 * Mobile-first root layout.
 *
 * Layout:
 *   ┌─────────────────────────────┐
 *   │                             │
 *   │      Main content area      │
 *   │  (scrollable, pb-14 for     │
 *   │   bottom TabBar clearance)  │
 *   │                             │
 *   ├─────────────────────────────┤
 *   │  [ Chats | Chars | Create ] │  ← TabBar (fixed bottom, h-14)
 *   └─────────────────────────────┘
 *
 * When a character is selected and the user is on the Chats tab, the full
 * ChatThread is shown. The TabBar remains visible for easy tab switching.
 *
 * Navigation state is driven by `activeTab` from appStore. Views that call
 * `setSidebarSection('create')` (e.g. DiscoverView) are reconciled back to
 * `activeTab` via a sync effect so both navigation systems stay aligned.
 */
export function MobileApp() {
  const {
    loadCharacters, loadConfig,
    activeCharacter,
    activeTab, setActiveTab,
    sidebarSection,
    config, configLoaded,
    customTheme,
  } = useAppStore();

  const { theme } = useTheme();

  // Show onboarding wizard on first run (gated on configLoaded to avoid flash)
  const showOnboarding = configLoaded && !config.onboarded;

  // ── Theme ────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply persisted custom theme overrides
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(customTheme).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
  }, [customTheme]);

  // ── Initialisation ───────────────────────────────────────────────────────
  useEffect(() => {
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  // ── Sync sidebarSection → activeTab ─────────────────────────────────────
  // DiscoverView calls setSidebarSection('create') and CreateView's X button
  // calls setSidebarSection('characters'). We reconcile here so both
  // navigation systems stay in sync without touching those views.
  useEffect(() => {
    if (sidebarSection === 'create') {
      setActiveTab('create');
    } else if (sidebarSection === 'chats' || sidebarSection === 'characters') {
      // Navigating back from create → chats
      if (activeTab === 'create') setActiveTab('chats');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarSection]);

  // ── Milestone celebration ────────────────────────────────────────────────
  const [currentAffinity, setCurrentAffinity] = useState<number | null>(null);
  useEffect(() => {
    if (!activeCharacter?.id) { setCurrentAffinity(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/characters/${activeCharacter.id}/relationship`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          const rel = data.relationship ?? data;
          setCurrentAffinity(typeof rel.affinity === 'number' ? rel.affinity : null);
        }
      } catch { /* non-critical */ }
    };
    poll();
    const iv = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeCharacter?.id]);

  const charNameForCelebration = activeCharacter?.name ?? '';
  const { celebrationTier, clearCelebration } = useMilestoneDetection(currentAffinity, charNameForCelebration);

  // ── PWA install prompt ───────────────────────────────────────────────────
  const installPromptRef = useRef<Event & { prompt: () => Promise<void> } | null>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    /**
     * Capture the browser's BeforeInstallPromptEvent so we can trigger it
     * from our own button rather than the default browser chrome.
     *
     * @param {Event} e - The BeforeInstallPromptEvent
     */
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as Event & { prompt: () => Promise<void> };
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => setShowInstallBtn(false));
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  /**
   * Trigger the deferred install prompt and hide the button regardless of
   * whether the user accepts or dismisses.
   */
  const handleInstall = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    installPromptRef.current = null;
    setShowInstallBtn(false);
  };

  // ── Main content routing ─────────────────────────────────────────────────
  /**
   * Decide which view to render based on active tab and character state.
   * When a character is selected and the Chats tab is active, the full
   * ChatThread is shown so the user is immediately in conversation.
   */
  const mainContent = (() => {
    if (activeTab === 'chats' && activeCharacter) return <ChatThread />;
    switch (activeTab) {
      case 'chats':    return <ChatsView />;
      case 'discover': return <DiscoverView />;
      case 'create':   return <CreateView />;
      case 'settings': return <SettingsView />;
      default:         return <ChatsView />;
    }
  })();

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-background)',
        overflow: 'hidden',
      }}
    >
      {/* Scrollable content area — padded for fixed bottom TabBar */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {mainContent}
      </main>

      {/* Fixed bottom navigation */}
      <TabBar />

      {/* Overlays — shared with desktop (memory, milestone) */}
      <MemoryPanel />

      <MilestoneCelebration
        tier={celebrationTier}
        charName={charNameForCelebration}
        onClose={clearCelebration}
      />

      {/* First-run onboarding wizard */}
      {showOnboarding && <OnboardingWizard onComplete={() => {}} />}

      {/* PWA install prompt — shown at bottom above TabBar */}
      {showInstallBtn && (
        <button
          onClick={handleInstall}
          style={{
            position: 'fixed',
            bottom: 70, // above TabBar
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            fontSize: 12,
            padding: '8px 16px',
            borderRadius: 20,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-card)',
            whiteSpace: 'nowrap',
          }}
        >
          ⬇ Install App
        </button>
      )}
    </div>
  );
}
