import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { UserKnowledgePanel } from './components/UserKnowledgePanel';
import { MemoryBrowser } from './components/MemoryBrowser';
import { ContextViewer } from './components/ContextViewer';
import { GamePanel } from './components/GamePanel';
import { ModelBrowser } from './components/ModelBrowser';
import { PhotoModeOverlay } from './components/PhotoModeOverlay';
import { GalleryOverlay } from './components/GalleryOverlay';
import { CinematicOverlay } from './components/CinematicOverlay';
import { MilestoneCelebration, useMilestoneDetection } from './components/MilestoneCelebration';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
// Feature tips disabled — import kept for potential re-enablement
// import { FeatureTipQueue } from './components/discovery/FeatureTipQueue';

// Lazy-load all wizards and the dev console — they are conditionally rendered
// and most users never see them in a given session. Deferring them cuts the
// critical parse path without affecting runtime behaviour because React.lazy()
// only triggers the dynamic import when the component is first rendered.
const OnboardingWizard     = lazy(() => import('./components/onboarding/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
const VoiceSetupWizard     = lazy(() => import('./components/wizards/VoiceSetupWizard').then(m => ({ default: m.VoiceSetupWizard })));
const LLMSetupWizard       = lazy(() => import('./components/wizards/LLMSetupWizard').then(m => ({ default: m.LLMSetupWizard })));
const ImageGenSetupWizard  = lazy(() => import('./components/wizards/ImageGenSetupWizard').then(m => ({ default: m.ImageGenSetupWizard })));
const ExpressionSetupWizard = lazy(() => import('./components/wizards/ExpressionSetupWizard').then(m => ({ default: m.ExpressionSetupWizard })));
const CardImportWizard     = lazy(() => import('./components/wizards/CardImportWizard').then(m => ({ default: m.CardImportWizard })));
const WhatsNewModal        = lazy(() => import('./components/WhatsNewModal').then(m => ({ default: m.WhatsNewModal })));
const CharacterGeneratorWizard = lazy(() => import('./components/CharacterGeneratorWizard').then(m => ({ default: m.CharacterGeneratorWizard })));
const DevConsole           = lazy(() => import('./components/DevConsole').then(m => ({ default: m.DevConsole })));
import { ToastQueue } from './components/ToastQueue';
import { useFeatureDiscovery } from './hooks/useFeatureDiscovery';
import { useWizardStore } from './stores/wizardStore';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ChatThread } from './views/ChatThread';
import { CreateView } from './views/CreateView';
import { isPetMode } from './lib/electron';

// Lazy-load PetView to avoid pulling pixi-live2d-display (and its Cubism 2
// runtime check) into the main bundle — it's only needed in Electron pet mode.
const PetView = lazy(() => import('./views/PetView').then(m => ({ default: m.PetView })));
import { useAppStore } from './stores/appStore';
import { useChatStore } from './stores/chatStore';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePhotoHotkeys } from './hooks/usePhotoHotkeys';

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
/**
 * Top-level router that checks for the /pet route before rendering
 * the full app. This avoids loading heavy components in pet mode.
 */
export function App() {
  // Pet mode renders a completely separate component tree — no hooks
  // from the main app are needed, so we check before any state setup.
  if (isPetMode()) {
    return <PetApp />;
  }
  return <MainApp />;
}

/** Minimal pet overlay app — just the character and speech bubble. */
function PetApp() {
  const { loadCharacters, loadConfig } = useAppStore();

  useEffect(() => {
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh' }} />}>
      <PetView />
    </Suspense>
  );
}

/** Full application with sidebar, chat, settings, overlays, etc. */
function MainApp() {
  const {
    loadCharacters, loadConfig, activeCharacter, sidebarSection,
    openOverlay, closeOverlay, activeOverlay, toggleSidebar,
    setSidebarSection, config, configLoaded,
    customKeyBindings, customTheme,
    cinematicMode, toggleCinematicMode,
    devMode,
  } = useAppStore();

  // Wizard store integration — hydrate from config and manage wizard lifecycle
  const { activeWizard, openWizard, hydrate: hydrateWizard, incrementSessionCount } = useWizardStore();

  useEffect(() => {
    if (configLoaded) {
      hydrateWizard(config as Record<string, unknown>);
      if (!config.onboarded) {
        openWizard('onboarding');
      } else {
        // Silently sync version — What's New info is in Settings > Help, not a popup
        fetch('/api/health')
          .then(r => r.json())
          .then(data => {
            const serverVersion = data.version as string | undefined;
            const { lastSeenVersion } = useWizardStore.getState();
            if (serverVersion && serverVersion !== lastSeenVersion) {
              useWizardStore.setState({ lastSeenVersion: serverVersion });
              useAppStore.getState().saveConfig({ last_seen_version: serverVersion } as Record<string, unknown>).catch(() => {});
            }
          })
          .catch(() => {}); // Non-critical — fail silently
      }
      incrementSessionCount();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoaded]);

  // Feature discovery — triggers contextual tips based on user activity
  useFeatureDiscovery();

  const showOnboarding = activeWizard === 'onboarding';
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
    { key: k('Open memory browser',    'ctrl+m'),  action: () => openOverlay('memorybrowser'),  description: 'Open memory browser' },
    { key: k('Open vocabulary manager','alt+v'),   action: () => openOverlay('vocab'),          description: 'Open vocabulary manager' },
    { key: k('Conversation analytics', 'alt+a'),   action: () => openOverlay('analytics'),      description: 'Conversation analytics' },
    { key: k('Session summary',        'alt+s'),   action: () => openOverlay('summary'),        description: 'Session summary' },
    { key: k('Character diary',        'alt+d'),   action: () => openOverlay('diary'),          description: 'Character diary' },
    { key: k('Relationship timeline',  'alt+t'),   action: () => openOverlay('timeline'),       description: 'Relationship timeline' },
    { key: k('Message schedules',      'alt+h'),   action: () => openOverlay('schedule'),       description: 'Message schedules' },
    { key: k('Global message search',  'alt+f'),   action: () => openOverlay('search'),         description: 'Global message search' },
    { key: 'ctrl+k',                              action: () => openOverlay('search'),         description: 'Quick search (Ctrl/Cmd+K)', allowInInput: true },
    { key: k('Scenario library',       'alt+i'),   action: () => openOverlay('scenarios'),      description: 'Scenario library' },
    { key: k('Character mood board',   'alt+b'),   action: () => openOverlay('moodboard'),      description: 'Character mood board' },
    { key: k('Model arena',            'alt+p'),   action: () => openOverlay('arena'),          description: 'Model arena' },
    { key: k('New character',          'alt+n'),   action: () => setSidebarSection('create'),   description: 'New character' },
    { key: k('Character portfolio',     'alt+o'),   action: () => openOverlay('portfolio'),       description: 'Character portfolio' },
    { key: k('Session replay',          'alt+r'),   action: () => openOverlay('replay'),          description: 'Session replay' },
    { key: k('Relationship web',        'alt+w'),   action: () => openOverlay('relweb'),          description: 'Relationship web' },
    { key: k('Character stats',        'alt+z'),   action: () => openOverlay('stats'),           description: 'Character stats' },
    { key: k('Universe builder',       'alt+u'),   action: () => openOverlay('universes'),       description: 'Universe builder' },
    { key: k('Context viewer',         'alt+c'),   action: () => openOverlay('contextviewer'),  description: 'Context viewer' },
    { key: k('Toggle sidebar',         'ctrl+\\'), action: () => toggleSidebar(),               description: 'Toggle sidebar' },
    { key: k('Cinematic mode',         'ctrl+i'),  action: () => toggleCinematicMode(),         description: 'Cinematic mode' },
    { key: k('Show keyboard shortcuts','?'),       action: () => setShowHelp(h => !h),          description: 'Show keyboard shortcuts' },
    {
      key: k('Close overlay', 'escape'),
      action: () => {
        if (cinematicMode) { toggleCinematicMode(); return; }
        if (showHelp) { setShowHelp(false); return; }
        if (activeOverlay) closeOverlay();
      },
      description: 'Close overlay'
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [openOverlay, closeOverlay, activeOverlay, toggleSidebar, setSidebarSection, showHelp, customKeyBindings, cinematicMode, toggleCinematicMode]);

  useKeyboardShortcuts(shortcuts);

  // Photo Mode global hotkeys (Ctrl+Shift+P/G/S)
  usePhotoHotkeys();

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
      {/* B1: Hide sidebar in cinematic mode */}
      {!cinematicMode && <Sidebar />}
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

      {/* Overlay drawers — Section A: Model Browser */}
      <ModelBrowser />

      {/* Photo Mode — full-viewport overlay with sidebar controls */}
      {activeOverlay === 'photomode' && <PhotoModeOverlay />}

      {/* Gallery — screenshot browser with lightbox */}
      {activeOverlay === 'gallery' && <GalleryOverlay />}

      {/* Overlay drawers — Feature C3 User Knowledge Graph */}
      {activeOverlay === 'userknowledge' && <UserKnowledgePanel />}

      {/* Overlay drawers — Feature P5 Unified Memory Browser */}
      <MemoryBrowser />

      {/* Overlay drawers — Feature P2 Context Assembly Viewer */}
      <ContextViewer />

      {/* Overlay drawers — Feature A2 Mini Games */}
      {activeOverlay === 'games' && activeCharacter && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          }}
          onClick={closeOverlay}
        >
          <div
            style={{ maxWidth: 480, width: '100%', margin: '0 16px' }}
            onClick={e => e.stopPropagation()}
          >
            <GamePanel characterId={activeCharacter.id} charName={activeCharacter.name} />
          </div>
        </div>
      )}

      {/* Floating (non-overlay) elements — Phase 2 */}
      <SoundscapePlayer />

      {/* Modals */}
      <CompressionPreviewModal
        open={activeOverlay === 'compression'}
        sessionId={sessionId}
        onClose={closeOverlay}
        onCompressed={closeOverlay}
      />

      {/* B1: Cinematic immersion overlay — above everything except celebration */}
      {cinematicMode && activeCharacter && <CinematicOverlay />}

      {/* Milestone celebration (full-screen, above everything) */}
      <MilestoneCelebration
        tier={celebrationTier}
        charName={charNameForCelebration}
        onClose={clearCelebration}
      />

      <ShortcutHelpModal open={showHelp} shortcuts={shortcuts} onClose={() => setShowHelp(false)} />

      {/* First-run onboarding wizard and quick-setup wizards — lazily loaded so their
          JS chunks only download when a user actually triggers them. fallback={null}
          is intentional: the triggering UI (Settings button, discovery tip) remains
          visible while the wizard chunk loads (~100 ms on fast connections). */}
      <Suspense fallback={null}>
        {showOnboarding && <OnboardingWizard />}
        {activeWizard === 'voice-setup' && <VoiceSetupWizard />}
        {activeWizard === 'llm-setup' && <LLMSetupWizard />}
        {activeWizard === 'image-gen-setup' && <ImageGenSetupWizard />}
        {activeWizard === 'expression-setup' && <ExpressionSetupWizard />}
        {activeWizard === 'card-import' && <CardImportWizard />}
        {activeWizard === 'whats-new' && <WhatsNewModal />}
        {activeWizard === 'character-gen' && <CharacterGeneratorWizard />}
      </Suspense>

      {/* Toast notifications — top-right floating */}
      <ToastQueue />

      {/* Feature discovery tips disabled — too distracting */}
      {/* <FeatureTipQueue /> */}

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

      {/* DevConsole — lazily loaded; only rendered when devMode is on */}
      {devMode && (
        <Suspense fallback={null}>
          <DevConsole />
        </Suspense>
      )}
    </div>
  );
}
