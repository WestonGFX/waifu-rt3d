import { useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MemoryPanel } from './components/MemoryPanel';
import { VocabPanel } from './components/VocabPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { DiaryPanel } from './components/DiaryPanel';
import { StatsPanel } from './components/StatsPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { SessionSummaryPanel } from './components/SessionSummaryPanel';
import { ScheduleEditorPanel } from './components/ScheduleEditorPanel';
import { CompressionPreviewModal } from './components/CompressionPreviewModal';
import { GlobalSearchPanel } from './components/GlobalSearchPanel';
import { SoundscapePlayer } from './components/SoundscapePlayer';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { MoodBoardEditor } from './components/MoodBoardEditor';
import { ModelArenaPanel } from './components/ModelArenaPanel';
import { CharacterPortfolioCard } from './components/CharacterPortfolioCard';
import { SessionReplayModal } from './components/SessionReplayModal';
import { CharacterRelationshipWeb } from './components/CharacterRelationshipWeb';
import { UniversePanel } from './components/UniversePanel';
import { LorePanel } from './components/LorePanel';
import { MilestoneCelebration, useMilestoneDetection } from './components/MilestoneCelebration';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ChatThread } from './views/ChatThread';
import { CreateView } from './views/CreateView';
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
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
    setSidebarSection, config, configLoaded,
    customKeyBindings,
    customTheme,
  } = useAppStore();

  // Show onboarding wizard on first run (gated on configLoaded to avoid flash)
  const showOnboarding = configLoaded && !config.onboarded;
  const { theme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);

  // ── Milestone celebration (Feature #3) ─────────────────────────────────
  // Poll the relationship endpoint to detect affinity tier advances.
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

  // Compression modal uses the shared overlay system ('compression' key)
  // setDraft allows ScenarioLibrary to pre-fill the chat composer from App level.
  const { sessionId, setDraft } = useChatStore();

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
    loadCharacters().then(() => {
      // Auto-select the first character so the app opens directly into a chat
      // rather than showing the WelcomeScreen when characters already exist.
      const { activeCharacter: ac, characters, selectCharacter } = useAppStore.getState();
      if (!ac && characters.length > 0) {
        selectCharacter(characters[0]);
      }
    }).catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  // Apply persisted custom theme CSS variable overrides on load and whenever
  // the palette changes (e.g. after the user tweaks a color in Settings).
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(customTheme).forEach(([varName, value]) => {
      root.style.setProperty(varName, value);
    });
  }, [customTheme]);

  // Global keyboard shortcuts — keys can be rebound via Settings → General.
  // customKeyBindings[description] overrides the default key for that action.
  // Note: ctrl+k, ctrl+n, ctrl+b are Chrome reserved — use Alt or ctrl+\ instead.
  const k = (desc: string, def: string) => customKeyBindings[desc] ?? def;
  const shortcuts = useMemo(() => [
    { key: k('Open settings',          'ctrl+,'),  action: () => openOverlay('settings'),       description: 'Open settings' },
    { key: k('Open memory manager',    'ctrl+m'),  action: () => openOverlay('memory'),         description: 'Open memory manager' },
    { key: k('Open vocabulary manager','alt+v'),   action: () => openOverlay('vocab'),          description: 'Open vocabulary manager' },
    { key: k('Conversation analytics', 'alt+a'),   action: () => openOverlay('analytics'),      description: 'Conversation analytics' },
    { key: k('Session summary',        'alt+s'),   action: () => openOverlay('summary'),        description: 'Session summary' },
    { key: k('Character diary',        'alt+d'),   action: () => openOverlay('diary'),          description: 'Character diary' },
    { key: k('Relationship timeline',  'alt+t'),   action: () => openOverlay('timeline'),       description: 'Relationship timeline' },
    { key: k('Message schedules',      'alt+h'),   action: () => openOverlay('schedule'),       description: 'Message schedules' },
    { key: k('Global message search',  'alt+f'),   action: () => openOverlay('search'),         description: 'Global message search' },
    { key: k('Scenario library',       'alt+i'),   action: () => openOverlay('scenarios'),      description: 'Scenario library' },
    { key: k('Character mood board',   'alt+b'),   action: () => openOverlay('moodboard'),      description: 'Character mood board' },
    { key: k('Model arena',            'alt+p'),   action: () => openOverlay('arena'),          description: 'Model arena' },
    { key: k('New character',          'alt+n'),   action: () => setSidebarSection('create'),   description: 'New character' },
    { key: k('Character portfolio',     'alt+o'),   action: () => openOverlay('portfolio'),       description: 'Character portfolio' },
    { key: k('Session replay',          'alt+r'),   action: () => openOverlay('replay'),          description: 'Session replay' },
    { key: k('Relationship web',        'alt+w'),   action: () => openOverlay('relweb'),          description: 'Relationship web' },
    { key: k('Character stats',        'alt+z'),   action: () => openOverlay('stats'),           description: 'Character stats' },
    { key: k('Universe builder',       'alt+u'),   action: () => openOverlay('universes'),       description: 'Universe builder' },
    { key: k('Toggle sidebar',         'ctrl+\\'), action: () => toggleSidebar(),               description: 'Toggle sidebar' },
    { key: k('Show keyboard shortcuts','?'),       action: () => setShowHelp(h => !h),          description: 'Show keyboard shortcuts' },
    {
      key: k('Close overlay', 'escape'),
      action: () => {
        if (showHelp) { setShowHelp(false); return; }
        if (activeOverlay) closeOverlay();
      },
      description: 'Close overlay'
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [openOverlay, closeOverlay, activeOverlay, toggleSidebar, setSidebarSection, showHelp, customKeyBindings]);

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

      {/* Overlay drawers — character-agnostic */}
      <SettingsDrawer />
      <MemoryPanel />
      <VocabPanel />

      {/* Overlay drawers — character-scoped (previously orphaned, now wired) */}
      <AnalyticsPanel />
      <DiaryPanel />
      <StatsPanel />
      <TimelinePanel />

      {/* Overlay drawers — new (Phase 1 sprint) */}
      <SessionSummaryPanel />
      <ScheduleEditorPanel />

      {/* Overlay drawers — Phase 2 sprint */}
      <GlobalSearchPanel />
      <ScenarioLibrary onSelect={(text) => { setDraft(text); closeOverlay(); }} />
      <MoodBoardEditor />
      <ModelArenaPanel />

      {/* Overlay drawers — Phase 3 sprint */}
      <CharacterPortfolioCard />
      <SessionReplayModal />
      <CharacterRelationshipWeb />

      {/* Overlay drawers — Feature #23 Universe Builder */}
      <UniversePanel />

      {/* Overlay drawers — Feature A6 Lorebook / World Info */}
      <LorePanel />

      {/* Floating (non-overlay) elements — Phase 2 */}
      <SoundscapePlayer />

      {/* Modals */}
      <CompressionPreviewModal
        open={activeOverlay === 'compression'}
        sessionId={sessionId}
        onClose={closeOverlay}
        onCompressed={closeOverlay}
      />

      {/* Milestone celebration (full-screen, above everything) */}
      <MilestoneCelebration
        tier={celebrationTier}
        charName={charNameForCelebration}
        onClose={clearCelebration}
      />

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
