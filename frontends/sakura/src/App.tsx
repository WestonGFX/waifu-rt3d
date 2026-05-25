import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { BackendErrorBanner } from './components/BackendErrorBanner';
import { MemoryPanel } from './components/MemoryPanel';
import { VocabPanel } from './components/VocabPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { DiaryPanel } from './components/DiaryPanel';
import { StatsPanel } from './components/StatsPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { SessionSummaryPanel } from './components/SessionSummaryPanel';
import { CompressionPreviewModal } from './components/CompressionPreviewModal';
import { GlobalSearchPanel } from './components/GlobalSearchPanel';
import { SoundscapePlayer } from './components/SoundscapePlayer';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { SessionReplayModal } from './components/SessionReplayModal';
import { LorePanel } from './components/LorePanel';
import { UserKnowledgePanel } from './components/UserKnowledgePanel';
import { MemoryBrowser } from './components/MemoryBrowser';
import { ContextViewer } from './components/ContextViewer';
import { KokoroDebugPanel } from './components/KokoroDebugPanel';
import { BoundaryPanel } from './components/BoundaryPanel';
import { VocabularyPanel } from './components/VocabularyPanel';
import { IntimateScenarioBrowser } from './components/IntimateScenarioBrowser';
import { DesireTree } from './components/DesireTree';
import { FantasyJournal } from './components/FantasyJournal';
// MilestoneTimeline removed session-47 (queue #10).
import { IntimateMemoryBrowser } from './components/IntimateMemoryBrowser';
import { SceneBookmarks } from './components/SceneBookmarks';
import { IntimateGallery } from './components/IntimateGallery';
import { LoveLetterModal } from './components/LoveLetterModal';
import { AudioStoryPlayer } from './components/AudioStoryPlayer';
import { IntimateQuizPanel } from './components/IntimateQuizPanel';
import { SharedFantasyBuilder } from './components/SharedFantasyBuilder';
import { PersonaPicker } from './components/PersonaPicker';
import { SceneReplayViewer } from './components/SceneReplayViewer';
// BondPanel removed session-47 (queue #10) — gamification chrome.
import { ScenarioPicker } from './components/ScenarioPicker';
import { AboutOverlay } from './components/AboutOverlay';
import { ModelBrowser } from './components/ModelBrowser';
import { PhotoModeOverlay } from './components/PhotoModeOverlay';
import { GalleryOverlay } from './components/GalleryOverlay';
import { CinematicOverlay } from './components/CinematicOverlay';
// Session-47 (queue #10): MilestoneCelebration, LevelUpCelebration,
// AchievementToast deleted — full-screen "WILD POPUP HAS APPEARED"
// patterns the user explicitly hates.  The flags below stayed at
// `false` through session-46; session-47 removes the dead code too.
import { SettingsDrawer } from './components/SettingsDrawer';
import { CommandPalette } from './components/CommandPalette';
import { HotkeySheet } from './components/HotkeySheet';
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
// Session-46 declutter feature flags. Typed `boolean` (not literal `false`)
// so TypeScript still narrows the conditional chain inside the JSX (literal
// `false &&` short-circuits type evaluation and breaks `activeCharacter`
// narrowing). Flip any of these to `true` to restore the corresponding UI.
const SHOW_NSFW_OVERLAYS: boolean = false;
// Session-46 declutter: all gamification celebration modals
// (BOND LEVEL UP, AFFINITY MILESTONE) — user directive: "this kind of code
// makes our app look SO cheap and buggy". Flip to true to restore.

function MainApp() {
  const {
    loadCharacters, loadConfig, activeCharacter, sidebarSection,
    openOverlay, closeOverlay, activeOverlay, toggleSidebar,
    setSidebarSection, config, configLoaded,
    customKeyBindings, customTheme,
    cinematicMode, toggleCinematicMode,
    devMode,
    toggleMinimalMode,
    layoutMode,
  } = useAppStore();

  // Dev-only overlays visible when devMode is on OR Electron is launched with --dev
  const effectiveDevMode = devMode || !!window.electronAPI?.isDev;

  // Kokoro debug HUD: visible when URL has ?debug=kokoro OR devMode is on.
  const kokoroDebugVisible = useMemo(() => {
    if (effectiveDevMode) return true;
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'kokoro';
  }, [effectiveDevMode]);

  // Live-poll the dial vector after each turn so the HUD shows
  // absolute values alongside this-turn deltas.
  const lastKokoroPayload = useChatStore(s => s.lastKokoroPayload);
  const kokoroCharId = useChatStore(s => s.charId);
  const kokoroSessionId = useChatStore(s => s.sessionId);
  const [kokoroDials, setKokoroDials] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!kokoroDebugVisible || !kokoroCharId) return;
    let cancelled = false;
    import('./lib/api').then(({ api }) => {
      api.kokoroState(kokoroCharId, kokoroSessionId ?? undefined)
        .then(res => {
          if (cancelled || !res.ok) return;
          const numericMind: Record<string, number> = {};
          for (const [k, v] of Object.entries(res.mind || {})) {
            if (typeof v === 'number') numericMind[k] = v;
          }
          setKokoroDials(numericMind);
        })
        .catch(() => { /* HUD only — silent failure */ });
    });
    return () => { cancelled = true; };
  }, [kokoroDebugVisible, kokoroCharId, kokoroSessionId, lastKokoroPayload]);

  // Expose openOverlay for Electron tray menu IPC
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__openOverlay = openOverlay;
    return () => { delete (window as unknown as Record<string, unknown>).__openOverlay; };
  }, [openOverlay]);

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
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Affinity polling + useMilestoneDetection removed session-47 (queue #10)
  // — was only a feed for the deleted MilestoneCelebration popup.

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
    // Migration: clear colors from the removed sakura-custom preset so users
    // don't load into the old wine/maroon palette after the preset was removed.
    const removedColors = ['#e879a0', '#1a0d12', '#2a1020', '#f5e0ea', '#4a2030'];
    const vals = Object.values(customTheme);
    if (vals.length === 5 && removedColors.every((c) => vals.includes(c))) {
      useAppStore.getState().resetCustomTheme();
      return;
    }
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
    { key: k('Global message search',  'alt+f'),   action: () => openOverlay('search'),         description: 'Global message search' },
    { key: 'ctrl+k',                              action: () => setPaletteOpen(true),          description: 'Open command palette', allowInInput: true },
    { key: k('Scenario library',       'alt+i'),   action: () => openOverlay('scenarios'),      description: 'Scenario library' },
    { key: k('New character',          'alt+n'),   action: () => setSidebarSection('create'),   description: 'New character' },
    { key: k('Session replay',          'alt+r'),   action: () => openOverlay('replay'),          description: 'Session replay' },
    { key: k('Character stats',        'alt+z'),   action: () => openOverlay('stats'),           description: 'Character stats' },
    { key: k('Gallery',               'alt+g'),   action: () => openOverlay('gallery'),         description: 'Gallery' },
    ...(effectiveDevMode ? [{ key: k('Context viewer', 'alt+c'), action: () => openOverlay('contextviewer'), description: 'Context viewer' }] : []),
    { key: k('Boundaries',            'alt+shift+b'), action: () => openOverlay('boundaries'),  description: 'Boundaries' },
    { key: k('Private vocabulary',    'alt+shift+v'), action: () => openOverlay('vocabulary'),  description: 'Private vocabulary' },
    { key: k('Bookmarks',            'alt+shift+k'), action: () => openOverlay('bookmarks'),   description: 'Scene bookmarks' },
    { key: k('Milestones',           'alt+shift+m'), action: () => openOverlay('milestones'),  description: 'Milestones timeline' },
    { key: k('Desire tree',          'alt+shift+d'), action: () => openOverlay('desiretree'),  description: 'Desire tree' },
    // Bond panel shortcut removed session-47 (queue #10) — panel deleted.
    { key: k('About',                 'alt+shift+a'), action: () => openOverlay('about'),       description: 'About' },
    { key: k('Toggle sidebar',         'ctrl+\\'), action: () => toggleSidebar(),               description: 'Toggle sidebar' },
    { key: k('Cinematic mode',         'ctrl+i'),  action: () => toggleCinematicMode(),         description: 'Cinematic mode' },
    { key: k('Toggle minimal mode',    'ctrl+shift+m'), action: () => toggleMinimalMode(),      description: 'Toggle minimal mode (hide UI chrome)' },
    { key: k('Show keyboard shortcuts','?'),       action: () => setShowHelp(h => !h),          description: 'Show keyboard shortcuts' },
    {
      key: k('Close overlay', 'escape'),
      action: () => {
        if (cinematicMode) { toggleCinematicMode(); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (showHelp) { setShowHelp(false); return; }
        if (activeOverlay) closeOverlay();
      },
      description: 'Close overlay'
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [openOverlay, closeOverlay, activeOverlay, toggleSidebar, setSidebarSection, showHelp, paletteOpen, customKeyBindings, cinematicMode, toggleCinematicMode, toggleMinimalMode]);

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
    <div
      className={`flex h-screen overflow-hidden${layoutMode === 'minimal' ? ' app-layout--minimal' : ''}`}
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Floats above everything — visible signal when /api/characters fails. */}
      <BackendErrorBanner />
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

      {/* Overlay drawers — Phase 2 sprint */}
      <GlobalSearchPanel />
      <ScenarioLibrary onSelect={(text) => { setDraft(text); closeOverlay(); }} />

      {/* Overlay drawers — Phase 3 sprint */}
      <SessionReplayModal />

      {/* Overlay drawers — Feature A6 Lorebook / World Info */}
      <LorePanel />

      {/* Overlay drawers — Section A: Model Browser */}
      <ModelBrowser />

      {/* Photo Mode — full-viewport overlay with sidebar controls (dev only) */}
      {effectiveDevMode && activeOverlay === 'photomode' && <PhotoModeOverlay />}

      {/* Gallery — screenshot browser + AI images (all users) */}
      {activeOverlay === 'gallery' && <GalleryOverlay />}

      {/* Overlay drawers — Feature C3 User Knowledge Graph */}
      {activeOverlay === 'userknowledge' && <UserKnowledgePanel />}

      {/* Overlay drawers — Feature P5 Unified Memory Browser */}
      <MemoryBrowser />

      {/* Overlay drawers — Feature P2 Context Assembly Viewer (dev only) */}
      {effectiveDevMode && <ContextViewer />}

      {/* Kokoro v1 debug HUD — visible with ?debug=kokoro or devMode */}
      {kokoroDebugVisible && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9000,
            pointerEvents: 'auto',
          }}
        >
          <KokoroDebugPanel payload={lastKokoroPayload} dialValues={kokoroDials} />
        </div>
      )}

      {/* Overlay drawers — Feature F40 Boundaries */}
      <BoundaryPanel
        isOpen={activeOverlay === 'boundaries'}
        onClose={closeOverlay}
      />

      {/* Overlay drawers — Feature F30 Private Vocabulary */}
      <VocabularyPanel />

      {/* ── NSFW Phase Overlays ──────────────────────────────────── */}

      {/* F8: Intimate Scenario Browser — session-46 cut (bloat per NSFW audit;
          duplicate of ScenarioPicker). Restore by removing `false &&`. */}
      {SHOW_NSFW_OVERLAYS && (
        <IntimateScenarioBrowser
          isOpen={activeOverlay === 'intimatescenarios'}
          onClose={closeOverlay}
        />
      )}

      {/* F39: Secret Desire Tree */}
      {activeOverlay === 'desiretree' && activeCharacter && (
        <DesireTree
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F11: Fantasy Journal — session-46 cut (bloat; read-only DB viewer
          with no LLM context injection). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'fantasyjournal' && activeCharacter && (
        <FantasyJournal
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* MilestoneTimeline deleted session-47 (queue #10) — the
          `intimate_milestones` table + tracker still injects context. */}

      {/* F2: Intimate Memory Browser */}
      {activeOverlay === 'intimatememories' && activeCharacter && (
        <IntimateMemoryBrowser
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F20: Scene Bookmarks */}
      <SceneBookmarks
        isOpen={activeOverlay === 'bookmarks'}
        onClose={closeOverlay}
        characterId={activeCharacter?.id}
        characterName={activeCharacter?.name}
      />

      {/* F42: Intimate Photo Gallery — session-46 cut (bloat; pure viewer,
          no LLM context). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'intimategallery' && activeCharacter && (
        <IntimateGallery
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F46: Love Letter Modal */}
      {activeOverlay === 'loveletter' && activeCharacter && (
        <LoveLetterModal
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F33: Audio Story Player — session-46 cut (bloat; TTS narration UI
          orthogonal to chat). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'audiostories' && activeCharacter && (
        <AudioStoryPlayer
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F22: Intimate Quiz Progress — session-46 cut (bloat; questionnaire
          UI, no prompt injection). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'intimatequiz' && activeCharacter && (
        <IntimateQuizPanel
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F47: Shared Fantasy Builder — session-46 cut (bloat; CRUD UI for
          rows never injected into LLM context). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'sharedfantasies' && activeCharacter && (
        <SharedFantasyBuilder
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F37: Fantasy Persona Picker */}
      {activeOverlay === 'personapicker' && activeCharacter && (
        <PersonaPicker
          isOpen
          onClose={closeOverlay}
          characterId={activeCharacter.id}
          characterName={activeCharacter.name}
        />
      )}

      {/* F35: Scene Replay Viewer — session-46 cut (bloat; rendered with
          replay=null anyway, suggesting it never delivered on its premise). */}
      {SHOW_NSFW_OVERLAYS && activeOverlay === 'scenereplay' && (
        <SceneReplayViewer
          isOpen
          onClose={closeOverlay}
          replay={null}
        />
      )}

      {/* BondPanel deleted session-47 (queue #10). */}

      {/* Scenario Picker overlay — per-character scene templates */}
      {activeOverlay === 'scenariopicker' && activeCharacter && sessionId && (
        <ScenarioPicker
          open
          onClose={closeOverlay}
          charId={activeCharacter.id}
          sessionId={sessionId}
        />
      )}

      {/* About overlay */}
      <AboutOverlay />

      {/* Floating (non-overlay) elements — Phase 2 */}
      <SoundscapePlayer />

      {/* Modals (dev only) */}
      {effectiveDevMode && (
        <CompressionPreviewModal
          open={activeOverlay === 'compression'}
          sessionId={sessionId}
          onClose={closeOverlay}
          onCompressed={closeOverlay}
        />
      )}

      {/* B1: Cinematic immersion overlay — above everything except celebration */}
      {cinematicMode && activeCharacter && <CinematicOverlay />}

      {/* Session-47 (queue #10): MilestoneCelebration, LevelUpCelebration,
          AchievementToast deleted.  Bond progression state still mutates
          underneath (no harm); the popup surfaces are gone.  See commit
          history for the previous JSX. */}

      <HotkeySheet open={showHelp} shortcuts={shortcuts} onClose={() => setShowHelp(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

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
