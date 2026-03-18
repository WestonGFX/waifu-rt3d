import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScenarioWizard from '../scenario/ScenarioWizard.tsx';
import { type ScenarioOutput } from '../../types/scenario.ts';
import {
  Archive,
  Edit3,
  FolderArchive,
  MessageCircleMore,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import { useSettings } from '../../context/SettingsContext.tsx';
import { useApp } from '../../context/AppContext.tsx';
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis.ts';
import {
  createSpeechPlaybackCompleteState,
  createSpeechPlaybackState,
} from '../../services/avatarPerformanceService.ts';
import { globalVAD } from '../../services/vadService.ts';
import { trackGrowthEvent } from '../../services/analyticsService.ts';
import {
  buildShareMomentCopy,
  buildShareableMoment,
  clearSharedMomentFromLocation,
  createShareMomentUrl,
  parseShareMomentFromLocation,
} from '../../services/shareMomentService.ts';
import { buildContextBudgetBreakdown } from '../../services/contextBudgetService.ts';
import { createContextBudgetRuntimeDescriptor } from '../../services/contextBudgetService.ts';
import {
  resolveCurrentRuntimeModel,
  resolveEffectiveContextWindow,
  resolveMaximumContextWindow,
} from '../../services/llmRuntimeService.ts';
import { type HeaderInsightMode, type UtilityTrayId } from '../../types/index.ts';
import { Button } from '@/components/ui/button.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import MessageList from './MessageList.tsx';
import ChatInputBar from './ChatInputBar.tsx';
import SharedMomentBanner from './SharedMomentBanner.tsx';
import ThoughtsPanel from './ThoughtsPanel.tsx';
import MoodIndicator from '../relationship/MoodIndicator.tsx';
import { deriveCompanionMood } from '../../services/moodService.ts';
import ContextBudgetSummary from './ContextBudgetSummary.tsx';
import SettingsPanel from '../settings/SettingsPanel.tsx';
import { resolveChatLayoutProfile } from './chatLayoutProfile.ts';

interface ChatPanelProps {
  layoutMode: 'two-column' | 'single-column';
  initialWorkspaceWidth?: number;
  initialWorkspaceHeight?: number;
}

const UTILITY_TRAY_LABELS: Record<UtilityTrayId, string> = {
  chats: 'Chats',
  context: 'Context',
  settings: 'Settings',
};

const HEADER_INSIGHT_MODE_LABELS: Record<HeaderInsightMode, string> = {
  companion: 'Companion pulse',
  runtime: 'Runtime HUD',
  scene: 'Scene status',
  actions: 'Quick actions',
  character: 'Character card',
  hybrid: 'Hybrid overview',
};

const HEADER_INSIGHT_MODE_ORDER: HeaderInsightMode[] = [
  'companion',
  'runtime',
  'scene',
  'actions',
  'character',
  'hybrid',
];

export default function ChatPanel({
  layoutMode,
  initialWorkspaceWidth = 0,
  initialWorkspaceHeight = 0,
}: ChatPanelProps) {
  const TRAY_EXIT_DURATION_MS = 190;
  const TRAY_ENTER_DURATION_MS = 220;
  const { state, importSharedMoment } = useChat();
  const {
    state: companionState,
    currentThread,
    currentThreadSummaries,
    retrievedMemories,
    activePersona,
    currentPsychologyState,
    createThread,
    selectThread,
    renameThread,
    archiveThread,
    deleteThread,
    setCurrentPersona,
  } = useCompanion();
  const { currentEnvironment, state: environmentState } = useEnvironment();
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();
  const { state: appState, dispatch: appDispatch } = useApp();
  const { speak, isSupported: ttsSupported } = useSpeechSynthesis();

  const companionMood = useMemo(
    () => deriveCompanionMood(currentPsychologyState),
    [currentPsychologyState],
  );

  const [pendingSharedMoment, setPendingSharedMoment] = useState(parseShareMomentFromLocation());
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared' | 'error'>('idle');
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showScenarioWizard, setShowScenarioWizard] = useState(false);

  const handleScenarioApply = useCallback(async (scenario: ScenarioOutput) => {
    // Create a new thread with a director note for the scenario setup
    await createThread({ title: scenario.config.genre + ' scenario' });
    setShowScenarioWizard(false);
  }, [createThread]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [detailsExpandedOverride, setDetailsExpandedOverride] = useState<boolean | null>(null);
  const [threadSearch, setThreadSearch] = useState('');
  const [managedThreadId, setManagedThreadId] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [displayedUtilityTray, setDisplayedUtilityTray] = useState<UtilityTrayId | null>(null);
  const [utilityTrayTransitionState, setUtilityTrayTransitionState] = useState<'idle' | 'entering' | 'exiting'>('idle');
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({
    width: initialWorkspaceWidth,
    height: initialWorkspaceHeight,
  });
  const liveFpsRef = useRef({ average: 0, current: 0 });
  const [displayFps, setDisplayFps] = useState({ average: 0, current: 0 });

  const lastSpokenIndex = useRef(-1);
  const didHydrateRef = useRef(false);
  const avatarRuntimeRef = useRef(appState.avatar);
  const shareResetTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const utilityTrayTimerRef = useRef<number | null>(null);

  const shareableMoment = buildShareableMoment(state.messages);
  const currentRuntimeModel = resolveCurrentRuntimeModel(companionState.runtimeStatuses, appState.providerConfig);
  const effectiveContextWindow = resolveEffectiveContextWindow(companionState.runtimeStatuses, appState.providerConfig);
  const maximumContextWindow = resolveMaximumContextWindow(companionState.runtimeStatuses, appState.providerConfig);
  const contextBudget = buildContextBudgetBreakdown({
    persona: activePersona,
    summaries: currentThreadSummaries,
    retrievedMemories,
    recentMessages: state.messages.slice(-10),
    currentEnvironment,
    roomRuntime: environmentState.roomRuntime,
    runtimeDescriptor: createContextBudgetRuntimeDescriptor(
      appState.providerConfig,
      currentRuntimeModel?.id,
      effectiveContextWindow,
    ),
    contextWindow: effectiveContextWindow,
  });

  const baseUtilityTabs = useMemo(() => {
    const preferences = appState.workspacePanelPreferences;
    const tabs: UtilityTrayId[] = [];
    if (preferences.chats) tabs.push('chats');
    if (preferences.context) tabs.push('context');
    if (preferences.thoughts) tabs.push('thoughts');
    if (preferences.settings) tabs.push('settings');
    return tabs;
  }, [appState.workspacePanelPreferences]);

  const visibleThreads = useMemo(
    () => companionState.threads
      .filter((thread) => (showArchivedThreads ? thread.archived : !thread.archived))
      .filter((thread) => {
        if (!threadSearch.trim()) return true;
        const searchNeedle = threadSearch.trim().toLowerCase();
        const persona = companionState.personas.find((candidate) => candidate.id === thread.personaId);
        return (
          thread.title.toLowerCase().includes(searchNeedle)
          || persona?.name.toLowerCase().includes(searchNeedle)
        );
      })
      .sort((left, right) => right.updatedAt - left.updatedAt),
    [companionState.personas, companionState.threads, showArchivedThreads, threadSearch],
  );

  const managedThread = useMemo(
    () => companionState.threads.find((thread) => thread.id === managedThreadId) ?? currentThread,
    [companionState.threads, currentThread, managedThreadId],
  );

  const compactContextHint = useMemo(() => {
    const memoryHint = retrievedMemories.length > 0 ? ` + ${retrievedMemories.length} memories` : '';
    const summaryHint = currentThreadSummaries.length > 0 ? 'summary' : 'live history';
    const sourceHint = state.messages.length > 0 ? `${summaryHint}${memoryHint}` : 'fresh chat';
    return `${contextBudget.usedInputTokens.toLocaleString()} / ${effectiveContextWindow.toLocaleString()} ctx · ${sourceHint}`;
  }, [
    contextBudget.usedInputTokens,
    currentThreadSummaries.length,
    effectiveContextWindow,
    retrievedMemories.length,
    state.messages.length,
  ]);

  const desktopSetupPane = layoutMode === 'two-column'
    && settingsState.wizardStep !== null
    && state.messages.length === 0;
  const utilityTabs = baseUtilityTabs;
  const activeUtilityTray = useMemo(() => {
    if (!appState.activeUtilityTray) return null;
    return utilityTabs.includes(appState.activeUtilityTray) ? appState.activeUtilityTray : null;
  }, [appState.activeUtilityTray, utilityTabs]);
  const renderedUtilityTray = displayedUtilityTray ?? activeUtilityTray;
  const settingsTrayExpanded = renderedUtilityTray === 'settings' && !desktopSetupPane;
  const naturalSettingsTray = settingsTrayExpanded && layoutMode !== 'two-column';
  const compactUtilityTray = layoutMode === 'two-column' && renderedUtilityTray !== 'settings';
  const desktopUtilityOverlay = layoutMode === 'two-column' && renderedUtilityTray !== null && renderedUtilityTray !== 'settings' && !desktopSetupPane;
  const expandedTrayKind = layoutMode === 'two-column'
    ? renderedUtilityTray === 'settings' && !desktopSetupPane
      ? 'settings'
      : renderedUtilityTray !== null && !desktopSetupPane
        ? 'utility'
        : 'none'
    : settingsTrayExpanded
      ? 'settings'
      : 'none';
  const {
    compactWorkspace,
    veryCompactWorkspace,
    toolbarCompact,
    headerCompact,
    showHeaderInsightPane,
    showCompactHeaderInsight,
    condenseDesktopHeader,
    utilityTrayHeightStyle,
  } = resolveChatLayoutProfile(
    layoutMode,
    workspaceSize.width,
    workspaceSize.height,
    expandedTrayKind,
  );
  const headerModules = appState.workspacePanelPreferences.headerModules ?? {
    overview: true,
    focus: true,
    actions: false,
  };
  const effectiveHeaderModules = useMemo(
    () => (!headerModules.overview && !headerModules.focus
      ? { ...headerModules, overview: true }
      : headerModules),
    [headerModules],
  );
  const showCompactHeaderMetaRow = !condenseDesktopHeader;
  const visibleHeaderInsightModes = useMemo(
    () => HEADER_INSIGHT_MODE_ORDER.filter((mode) => mode !== 'actions' || effectiveHeaderModules.actions),
    [effectiveHeaderModules.actions],
  );
  const fpsLabel = displayFps.average > 0
    ? `${displayFps.average} avg`
    : displayFps.current > 0
      ? `${displayFps.current} live`
      : 'warming up';

  const headerInsightMode: HeaderInsightMode = appState.headerInsightMode ?? 'companion';
  const effectiveHeaderInsightMode = visibleHeaderInsightModes.includes(headerInsightMode) ? headerInsightMode : 'companion';
  const hasMessages = state.messages.length > 0;
  const roomModeLabel = environmentState.roomRuntime.roomMode === 'none'
    ? 'no active room'
    : environmentState.roomRuntime.roomMode;
  const avatarPhaseLabel = appState.avatar.phase === 'idle'
    ? 'resting'
    : appState.avatar.phase;
  const setupConversationFirst = desktopSetupPane;
  const pristineConversationStart = layoutMode === 'two-column'
    && !desktopSetupPane
    && !hasMessages
    && currentEnvironment === null;
  const loadedRoomFreshChat = layoutMode === 'two-column'
    && !desktopSetupPane
    && !hasMessages
    && currentEnvironment !== null;
  const visibleUtilityTabs = utilityTabs;
  const prioritizeConversationLayout = layoutMode === 'two-column' && condenseDesktopHeader;
  const detailsExpanded = detailsExpandedOverride ?? (setupConversationFirst || loadedRoomFreshChat || pristineConversationStart ? false : !hasMessages);
  const renderBelowChatDetails = (prioritizeConversationLayout && hasMessages)
    || setupConversationFirst
    || pristineConversationStart
    || loadedRoomFreshChat;
  const showHeaderDeckAboveChat = (effectiveHeaderModules.overview || effectiveHeaderModules.focus) && !renderBelowChatDetails;
  const topHeaderInsightMode = layoutMode === 'two-column' && effectiveHeaderInsightMode === 'actions'
    ? 'companion'
    : effectiveHeaderInsightMode;
  const activeDereTags = activePersona?.dereTypes.slice(0, 3).join(' · ') ?? 'Custom companion';
  const currentSpeechState = appState.avatar.phase === 'speaking'
    ? `${activePersona?.name ?? 'She'} is talking`
    : `${activePersona?.name ?? 'She'} is ${roomModeLabel}`;
  const roomName = currentEnvironment?.name ?? 'Empty stage';
  const roomLine = `${roomName} · ${roomModeLabel}`;
  const runtimeLine = currentRuntimeModel?.id ?? appState.providerConfig.llm.primary;
  const chatStateLine = state.messages.length > 0 ? `${currentThreadSummaries.length} summaries` : 'fresh chat';
  const maximumContextWindowLabel = maximumContextWindow
    ? maximumContextWindow.toLocaleString()
    : 'runtime pending';
  const liveFpsText = displayFps.current > 0 ? `${displayFps.current} live fps` : 'frame sync active';

  useEffect(() => {
    const node = workspaceRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      setWorkspaceSize((previous) => (
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      ));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setWorkspaceSize((previous) => (
      previous.width === initialWorkspaceWidth && previous.height === initialWorkspaceHeight
        ? previous
        : {
          width: initialWorkspaceWidth,
          height: initialWorkspaceHeight,
        }
    ));
  }, [initialWorkspaceHeight, initialWorkspaceWidth]);

  useEffect(() => {
    liveFpsRef.current = {
      average: appState.metrics.averageFps,
      current: appState.metrics.currentFps,
    };
  }, [appState.metrics.averageFps, appState.metrics.currentFps]);

  useEffect(() => {
    const syncDisplayedFps = () => {
      const nextAverage = Math.max(0, Math.round(liveFpsRef.current.average));
      const nextCurrent = Math.max(0, Math.round(liveFpsRef.current.current));
      setDisplayFps((previous) => (
        previous.average === nextAverage && previous.current === nextCurrent
          ? previous
          : { average: nextAverage, current: nextCurrent }
      ));
    };

    syncDisplayedFps();
    const intervalId = window.setInterval(syncDisplayedFps, 900);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const syncSharedMoment = () => {
      setPendingSharedMoment(parseShareMomentFromLocation());
    };

    syncSharedMoment();
    window.addEventListener('hashchange', syncSharedMoment);
    return () => window.removeEventListener('hashchange', syncSharedMoment);
  }, []);

  useEffect(() => {
    if (appState.activeUtilityTray && !visibleUtilityTabs.includes(appState.activeUtilityTray)) {
      appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: null });
    }
  }, [appDispatch, appState.activeUtilityTray, visibleUtilityTabs]);

  useEffect(() => {
    if (utilityTrayTimerRef.current) {
      window.clearTimeout(utilityTrayTimerRef.current);
      utilityTrayTimerRef.current = null;
    }

    if (activeUtilityTray) {
      setDisplayedUtilityTray(activeUtilityTray);
      setUtilityTrayTransitionState('entering');
      utilityTrayTimerRef.current = window.setTimeout(() => {
        setUtilityTrayTransitionState('idle');
        utilityTrayTimerRef.current = null;
      }, TRAY_ENTER_DURATION_MS);
      return;
    }

    if (displayedUtilityTray) {
      setUtilityTrayTransitionState('exiting');
      utilityTrayTimerRef.current = window.setTimeout(() => {
        setDisplayedUtilityTray(null);
        setUtilityTrayTransitionState('idle');
        utilityTrayTimerRef.current = null;
      }, TRAY_EXIT_DURATION_MS);
    }
  }, [activeUtilityTray, displayedUtilityTray]);

  useEffect(() => () => {
    if (utilityTrayTimerRef.current) {
      window.clearTimeout(utilityTrayTimerRef.current);
    }
  }, []);

  useEffect(() => {
    avatarRuntimeRef.current = appState.avatar;
  }, [appState.avatar]);

  useEffect(() => {
    if (shareStatus === 'idle') return undefined;
    shareResetTimerRef.current = window.setTimeout(() => setShareStatus('idle'), 2200);
    return () => {
      if (shareResetTimerRef.current) {
        window.clearTimeout(shareResetTimerRef.current);
      }
    };
  }, [shareStatus]);

  useEffect(() => {
    if (!renameDialogOpen) {
      setRenameDraft(currentThread?.title ?? '');
    }
  }, [currentThread?.title, renameDialogOpen]);

  useEffect(() => {
    if (!renameDialogOpen && !deleteDialogOpen) {
      setManagedThreadId(null);
    }
  }, [deleteDialogOpen, renameDialogOpen]);

  useEffect(() => {
    setDetailsExpandedOverride(null);
  }, [currentThread?.id]);

  useEffect(() => {
    if (!titleEditing) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [titleEditing]);

  useEffect(() => {
    if (!ttsSupported || state.messages.length === 0 || state.isLoading) return;
    if (!settingsState.autoReadAssistant) return;

    const latest = state.messages[state.messages.length - 1];
    const latestIndex = state.messages.length - 1;

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      lastSpokenIndex.current = latestIndex;
      return;
    }

    if (document.hidden) return;

    if (
      latest.role === 'assistant'
      && !latest.isStreaming
      && latest.content.trim().length > 0
      && latestIndex > lastSpokenIndex.current
    ) {
      lastSpokenIndex.current = latestIndex;
      const speakingState = createSpeechPlaybackState(
        avatarRuntimeRef.current,
        latest.content,
        Date.now(),
      );
      avatarRuntimeRef.current = speakingState;
      appDispatch({ type: 'SET_AVATAR_STATE', payload: speakingState });

      void (async () => {
        try {
          await speak(latest.content);
        } finally {
          const completedState = createSpeechPlaybackCompleteState(
            avatarRuntimeRef.current,
            Date.now(),
          );
          avatarRuntimeRef.current = completedState;
          appDispatch({ type: 'SET_AVATAR_STATE', payload: completedState });
        }
      })();
    }
  }, [
    appDispatch,
    settingsState.autoReadAssistant,
    speak,
    state.isLoading,
    state.messages,
    ttsSupported,
  ]);

  // Voice interruption: start/stop VAD based on setting, interrupt TTS on speech-start.
  useEffect(() => {
    if (!settingsState.voiceInterruptionEnabled) {
      globalVAD.destroy();
      return;
    }

    const handleSpeechStart = () => {
      // Stop any active TTS playback when the user starts speaking.
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.cancel();
      }
      const completedState = createSpeechPlaybackCompleteState(
        avatarRuntimeRef.current,
        Date.now(),
      );
      avatarRuntimeRef.current = completedState;
      appDispatch({ type: 'SET_AVATAR_STATE', payload: completedState });
    };

    globalVAD.on('speech-start', handleSpeechStart);
    void globalVAD.start();

    return () => {
      globalVAD.off('speech-start', handleSpeechStart);
      globalVAD.destroy();
    };
  }, [settingsState.voiceInterruptionEnabled, appDispatch]);

  const formatThreadTimestamp = (timestamp: number) => new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleShareMoment = async () => {
    if (!shareableMoment) return;

    const url = createShareMomentUrl(shareableMoment);
    const shareText = buildShareMomentCopy(shareableMoment);

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'AnimeGirly shared moment',
          text: shareText,
          url,
        });
        setShareStatus('shared');
        trackGrowthEvent('share_moment_shared', { method: 'native_share' });
        return;
      }

      const clipboardPayload = `${shareText}\n${url}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipboardPayload);
      } else {
        window.prompt('Copy this shared moment link', clipboardPayload);
      }

      setShareStatus('copied');
      trackGrowthEvent('share_moment_shared', { method: 'clipboard' });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('error');
    }
  };

  const handleImportSharedMoment = () => {
    if (!pendingSharedMoment) return;

    importSharedMoment(pendingSharedMoment);
    trackGrowthEvent('shared_moment_imported', {
      messageCount: pendingSharedMoment.messages.length,
    });
    setPendingSharedMoment(null);
    clearSharedMomentFromLocation();
  };

  const handleDismissSharedMoment = () => {
    setPendingSharedMoment(null);
    clearSharedMomentFromLocation();
  };

  const handleSaveTitle = async () => {
    if (!currentThread) {
      setTitleEditing(false);
      return;
    }

    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      setRenameDraft(currentThread.title);
      setTitleEditing(false);
      return;
    }

    if (nextTitle !== currentThread.title) {
      await renameThread(currentThread.id, nextTitle);
    }
    setTitleEditing(false);
  };

  const openRenameDialogForThread = (threadId: string, title: string) => {
    setManagedThreadId(threadId);
    setRenameDraft(title);
    setRenameDialogOpen(true);
  };

  const openDeleteDialogForThread = (threadId: string) => {
    setManagedThreadId(threadId);
    setDeleteDialogOpen(true);
  };

  const toggleTray = (trayId: UtilityTrayId) => {
    if (desktopSetupPane) {
      settingsDispatch({ type: 'CLOSE_WIZARD' });
      appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: trayId });
      return;
    }
    if (pristineConversationStart && trayId === 'chats') {
      appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: null });
      return;
    }
    appDispatch({
      type: 'SET_ACTIVE_UTILITY_TRAY',
      payload: activeUtilityTray === trayId ? null : trayId,
    });
  };

  const isUtilityTrayButtonActive = (trayId: UtilityTrayId) => (
    pristineConversationStart && trayId === 'chats'
      ? activeUtilityTray === null
      : activeUtilityTray === trayId
  );

  const renderChatsTray = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2.5 border-b border-[color:var(--shell-divider)] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Chats</div>
            <div className="mt-0.5 text-sm font-semibold text-text-primary">
              Previous chats and quick switching.
            </div>
          </div>
          <Button size="sm" onClick={() => void createThread()} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowScenarioWizard(true)} className="gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Scenario
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={showArchivedThreads ? 'secondary' : 'default'}
            size="sm"
            onClick={() => setShowArchivedThreads(false)}
          >
            Active
          </Button>
          <Button
            variant={showArchivedThreads ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setShowArchivedThreads(true)}
            className="gap-1"
          >
            <FolderArchive className="h-3.5 w-3.5" />
            Archived
          </Button>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder="Search chats or personas"
              className="h-10 rounded-pill pl-9"
            />
          </div>

          <Select value={activePersona?.id ?? ''} onValueChange={(value) => void setCurrentPersona(value)}>
            <SelectTrigger className="h-10 rounded-pill text-xs">
              <SelectValue placeholder="Choose a persona" />
            </SelectTrigger>
            <SelectContent>
              {companionState.personas.map((persona) => (
                <SelectItem key={persona.id} value={persona.id}>
                  {persona.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 py-1.5">
        <div className="space-y-2">
          {visibleThreads.length === 0 ? (
            <div className="app-card-surface rounded-[20px] px-4 py-4 text-xs leading-5 text-text-muted">
              {showArchivedThreads
                ? 'No archived chats yet. Archive one when you want it out of the way without deleting it.'
                : 'No chats match this view yet. Start one and it will appear here.'}
            </div>
          ) : visibleThreads.map((thread) => {
            const threadPersona = companionState.personas.find((persona) => persona.id === thread.personaId);
            const isActive = thread.id === companionState.currentThreadId;
            const threadMessageCount = companionState.messagesByThread[thread.id]?.length ?? 0;

            return (
              <div
                key={thread.id}
                className={[
                  'flex items-start gap-3 rounded-[18px] border px-3 py-2.5 transition-all',
                  isActive
                    ? 'border-[color:var(--control-border)] bg-[color:var(--card-bg-soft)] shadow-[var(--shell-shadow-soft)]'
                    : 'border-transparent bg-[color:var(--control-bg-soft)] hover:border-[color:var(--control-border-soft)] hover:bg-[color:var(--control-bg)]',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => void selectThread(thread.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text-primary" title={thread.title}>
                        {thread.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-text-muted">
                        <span>{threadPersona?.name ?? 'Unknown persona'}</span>
                        <span>·</span>
                        <span>{threadMessageCount} messages</span>
                        {thread.archived ? (
                          <>
                            <span>·</span>
                            <span>Archived</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {isActive ? (
                      <Badge variant="secondary" className="shrink-0 normal-case tracking-normal">
                        Current
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                    <span>{formatThreadTimestamp(thread.updatedAt)}</span>
                    <span className="uppercase tracking-[0.14em] text-anime-500/85">{thread.titleSource}</span>
                  </div>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8 rounded-full">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>{thread.title}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => openRenameDialogForThread(thread.id, thread.title)}>
                      <PencilLine className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void archiveThread(thread.id)}>
                      <Archive className="mr-2 h-4 w-4" />
                      {thread.archived ? 'Unarchive' : 'Archive'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-rose-pastel-400 focus:text-rose-pastel-400"
                      onClick={() => openDeleteDialogForThread(thread.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const renderContextTray = () => (
    <ScrollArea className="h-full px-3.5 py-3">
      <div className="space-y-3">
      <div className="app-card-surface rounded-[20px] px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Context</div>
          <div className="mt-0.5 text-[0.98rem] font-semibold text-text-primary">
            {contextBudget.usedInputTokens.toLocaleString()} / {effectiveContextWindow.toLocaleString()} tokens in play
          </div>
          <p className="mt-0.5 text-sm leading-5 text-text-muted">
            {maximumContextWindow
              ? `The current model can accept up to ${maximumContextWindowLabel} tokens.`
              : 'The current runtime has not reported its hard token limit yet.'}{' '}
            The compact header only shows the summary; the breakdown lives here.
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--control-bg-soft)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-anime-400 via-fuchsia-400 to-rose-pastel-300 transition-[width] duration-300"
              style={{ width: `${Math.max(6, Math.round(contextBudget.usageRatio * 100))}%` }}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Active window</div>
              <div className="mt-0.5 text-sm font-semibold text-text-primary">{effectiveContextWindow.toLocaleString()}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Reserved reply</div>
              <div className="mt-0.5 text-sm font-semibold text-text-primary">{contextBudget.reservedOutputTokens.toLocaleString()}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Summaries</div>
              <div className="mt-0.5 text-sm font-semibold text-text-primary">{currentThreadSummaries.length}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Memories</div>
              <div className="mt-0.5 text-sm font-semibold text-text-primary">{retrievedMemories.length}</div>
            </div>
          </div>
        </div>

        <div className="app-card-surface rounded-[20px] px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Breakdown</div>
          <div className="mt-2.5 space-y-2.5">
            {contextBudget.segments.map((segment) => {
              const ratio = segment.tokens / Math.max(contextBudget.contextWindow, 1);
              return (
                <div key={segment.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-text-primary">{segment.label}</span>
                    <span className="text-text-muted">{segment.tokens.toLocaleString()} tokens</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[color:var(--control-bg-soft)]">
                    <div
                      className={`h-full rounded-full ${segment.colorClass}`}
                      style={{ width: `${Math.max(4, Math.round(ratio * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="app-card-surface rounded-[20px] px-3.5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">Current route</div>
          <div className="mt-0.5 text-[0.98rem] font-semibold text-text-primary">{currentRuntimeModel?.id ?? appState.providerConfig.llm.primary}</div>
          <div className="mt-0.5 text-sm leading-5 text-text-muted">
            {activePersona?.name ?? 'No persona'} · {currentEnvironment?.name ?? 'Empty stage'} · {roomModeLabel}
          </div>
        </div>
      </div>
    </ScrollArea>
  );

  const renderUtilityTrayContent = (trayId: UtilityTrayId | null) => {
    switch (trayId) {
      case 'chats':
        return renderChatsTray();
      case 'context':
        return renderContextTray();
      case 'thoughts':
        return <ThoughtsPanel messages={state.messages} />;
      case 'settings':
        return <SettingsPanel embedded heightMode={naturalSettingsTray ? 'natural' : 'contained'} />;
      default:
        return null;
    }
  };

  const renderConversationMetricsStrip = (options?: { compact?: boolean }) => {
    const compact = options?.compact ?? false;
    const showStateCard = !effectiveHeaderModules.focus;
    return (
    <div className={[
      `chat-header-overview-grid ${compact ? 'mt-1.5' : 'mt-2.5'} grid gap-2`,
      showHeaderInsightPane
        ? showStateCard ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        : 'grid-cols-2',
    ].join(' ')}>
      <div className={`chat-header-overview-segment rounded-[18px] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'}`} title={roomName}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Room</div>
        <div className={`line-clamp-2 font-semibold text-text-primary ${compact ? 'mt-0.5 text-[0.9rem] leading-4.5' : 'mt-1 text-[0.98rem] leading-5'}`}>{roomName}</div>
        <div className={`text-text-muted ${compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-0.5 text-[11px] leading-5'}`}>
          {roomModeLabel} · {avatarPhaseLabel} · {appState.avatar.emotion}
        </div>
      </div>

      <div className={`chat-header-overview-segment rounded-[18px] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'}`}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Context</div>
        <div className={`${compact ? 'mt-0.5 text-[0.9rem] leading-4.5' : 'mt-1 text-[0.98rem] leading-5'} font-semibold text-text-primary`}>
          {contextBudget.usedInputTokens.toLocaleString()}
        </div>
        <div className={`${compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-0.5 text-[11px] leading-5'} text-text-muted`}>
          of {effectiveContextWindow.toLocaleString()} active
        </div>
      </div>

      <div className={`chat-header-overview-segment rounded-[18px] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'}`}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Viewer</div>
        <div className={`${compact ? 'mt-0.5 text-[0.9rem] leading-4.5' : 'mt-1 text-[0.98rem] leading-5'} font-semibold text-text-primary`}>{fpsLabel}</div>
        <div className={`${compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-0.5 text-[11px] leading-5'} text-text-muted`}>{liveFpsText}</div>
      </div>

      {showStateCard ? (
        <div className={`chat-header-overview-segment chat-header-overview-segment--accent rounded-[18px] ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">State</div>
          <div className={`line-clamp-2 font-semibold text-text-primary ${compact ? 'mt-0.5 text-[0.9rem] leading-4.5' : 'mt-1 text-[0.98rem] leading-5'}`}>
            {activePersona?.name ?? 'No persona'}
          </div>
          <div className={`${compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-0.5 text-[11px] leading-5'} text-text-muted`}>
            {appState.avatar.gesture} · {appState.avatar.gaze} · {appState.avatar.emotion}
          </div>
        </div>
      ) : null}
    </div>
    );
  };

  const renderHeaderInsightModeSelect = (triggerClassName: string, options?: { allowActions?: boolean; value?: HeaderInsightMode }) => {
    const modes = options?.allowActions === false
      ? visibleHeaderInsightModes.filter((mode) => mode !== 'actions')
      : visibleHeaderInsightModes;
    const value = options?.value && modes.includes(options.value) ? options.value : modes[0];

    return (
    <Select
      value={value}
      onValueChange={(value) => appDispatch({ type: 'SET_HEADER_INSIGHT_MODE', payload: value as HeaderInsightMode })}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {modes.map((value) => (
          <SelectItem key={value} value={value}>
            {HEADER_INSIGHT_MODE_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    );
  };

  const renderHeaderCommandDeck = (options?: { compact?: boolean; showSelector?: boolean }) => {
    const compact = options?.compact ?? false;
    const showSelector = options?.showSelector ?? false;
    const compactHeaderPills = compact && condenseDesktopHeader;
    return (
    <div className={`${compact ? 'rounded-[18px] border-0 bg-transparent px-0 py-0 shadow-none' : 'chat-header-overview-panel rounded-[20px] px-3 py-2.5'}`}>
      <div className={[
        'flex gap-2.5',
        headerCompact || compact ? 'flex-col items-start' : 'items-start justify-between',
      ].join(' ')}>
        {compact ? <div className="min-w-0 flex-1" /> : (
          <div className="min-w-0 flex-1">
            <div className={`flex min-w-0 flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
              <span className="chat-header-runtime-pill text-[11px] font-medium text-text-muted">
                {currentRuntimeModel?.id ?? appState.providerConfig.llm.primary}
              </span>
              {compactHeaderPills ? (
                <span className="chat-header-runtime-pill text-[11px] font-medium text-text-muted">
                  {activePersona?.name ?? 'No persona'}
                </span>
              ) : (
                <span className="chat-header-runtime-pill text-[11px] font-medium text-text-muted">
                  {chatStateLine}
                </span>
              )}
            </div>
          </div>
        )}

        {showSelector ? (
          <div className={headerCompact || compact ? 'w-full' : 'w-[12.5rem] shrink-0'}>
          {renderHeaderInsightModeSelect(
            `${compact ? 'h-8.5 rounded-[15px]' : 'h-9.5 rounded-[17px]'} w-full border-[color:var(--shell-divider)]/80 bg-[color:var(--control-bg-soft)] text-[11px] font-medium shadow-none`,
            { allowActions: false, value: topHeaderInsightMode },
          )}
          </div>
        ) : null}
      </div>

      {renderConversationMetricsStrip({ compact })}
    </div>
    );
  };

  const renderHeaderInsightPanel = (mode: HeaderInsightMode, options?: { compact?: boolean; showSelector?: boolean; allowActions?: boolean }) => {
    const compact = options?.compact ?? false;
    const showSelector = options?.showSelector ?? false;
    const allowActions = options?.allowActions ?? true;
    const denseDesktopInsight = compact && layoutMode === 'two-column';
    const compactComplementaryInsight = denseDesktopInsight && effectiveHeaderModules.overview;
    const baseCardClass = compact
      ? 'chat-header-insight-panel chat-header-insight-panel--compact min-w-0 w-full rounded-[20px] px-2.5 py-1'
      : 'chat-header-insight-panel min-w-0 w-full rounded-[22px] px-3 py-2';
    const memoryLine = `${currentThreadSummaries.length} summaries · ${retrievedMemories.length} memories`;
    const selectClassName = 'h-8.5 w-full rounded-[15px] border-[color:var(--shell-divider)]/80 bg-[color:var(--control-bg-soft)] text-[11px] font-medium shadow-none';
    const renderInsightDatum = (label: string, value: string, detail: string) => (
      <div className={`chat-header-insight-stat rounded-[15px] ${compact ? 'px-2 py-1.25' : 'px-2.5 py-2'}`}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</div>
        <div className={`font-semibold text-text-primary ${compact ? 'mt-0.5 text-[0.86rem] leading-4' : 'mt-1 text-sm leading-5'}`}>{value}</div>
        <div className={`text-text-muted ${compact ? 'mt-0.5 text-[9.5px] leading-4' : 'mt-0.5 text-[11px] leading-5'}`}>{detail}</div>
      </div>
    );
    const renderInsightLead = (eyebrow: string, title: string, subtitle: string) => (
      <div className={`flex min-w-0 items-start ${showSelector ? 'justify-between gap-3' : 'justify-start'}`}>
        <div className="min-w-0 flex-1">
          <div className={`font-semibold uppercase text-anime-600 ${compactComplementaryInsight ? 'text-[9px] tracking-[0.18em]' : 'text-[10px] tracking-[0.22em]'}`}>{eyebrow}</div>
          <div className={`font-semibold leading-tight text-text-primary ${compact ? 'mt-0.5 text-[0.92rem]' : 'mt-0.5 text-[0.98rem] md:text-[1rem]'}`}>{title}</div>
          {!denseDesktopInsight ? (
            <p className={`text-text-muted ${compact ? 'mt-0.5 line-clamp-1 text-[10px] leading-4' : 'mt-0.5 text-[11px] leading-5'}`}>{subtitle}</p>
          ) : null}
        </div>
        {showSelector ? (
          <div className={`${compact ? 'w-[10rem]' : 'w-[10.75rem]'} shrink-0`}>
            {renderHeaderInsightModeSelect(selectClassName, {
              allowActions,
              value: allowActions ? effectiveHeaderInsightMode : topHeaderInsightMode,
            })}
          </div>
        ) : null}
      </div>
    );

    if (mode === 'runtime') {
      return (
        <div className={baseCardClass}>
          {renderInsightLead(
            'Runtime HUD',
            runtimeLine,
                `${effectiveContextWindow.toLocaleString()} active · max ${maximumContextWindowLabel} · ${memoryLine}`,
          )}
          <div className={`mt-0.75 grid gap-1.25 ${compactComplementaryInsight ? 'grid-cols-3' : denseDesktopInsight ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
            {compactComplementaryInsight ? (
              <>
                {renderInsightDatum('Route', runtimeLine, currentSpeechState)}
                {renderInsightDatum('Context', `${contextBudget.usedInputTokens.toLocaleString()} in play`, `${effectiveContextWindow.toLocaleString()} active`)}
                {renderInsightDatum('Memories', retrievedMemories.length.toString(), memoryLine)}
              </>
            ) : (
              <>
                {renderInsightDatum(
                  'Context',
                  `${contextBudget.usedInputTokens.toLocaleString()} in play`,
                  `of ${effectiveContextWindow.toLocaleString()} active`,
                )}
                {renderInsightDatum('Viewer', fpsLabel, liveFpsText)}
                {renderInsightDatum('Room', roomName, roomLine)}
                {renderInsightDatum('Memories', retrievedMemories.length.toString(), memoryLine)}
              </>
            )}
          </div>
        </div>
      );
    }

    if (mode === 'scene') {
      return (
        <div className={baseCardClass}>
          {renderInsightLead(
            'Scene status',
            roomName,
            `${roomModeLabel} · ${avatarPhaseLabel} · ${appState.avatar.emotion}`,
          )}
          <div className={`mt-0.75 grid gap-1.25 ${compactComplementaryInsight ? 'grid-cols-3' : denseDesktopInsight ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
            {renderInsightDatum(
              'Anchor',
              environmentState.roomRuntime.currentAnchorId ?? 'Default spawn',
              `Familiarity ${Math.round(environmentState.roomRuntime.familiarity * 100)}%`,
            )}
            {renderInsightDatum(
              'Focus',
              environmentState.roomRuntime.currentHotspotId ?? 'User camera',
              `${appState.avatar.gesture} · ${appState.avatar.gaze}`,
            )}
            {compactComplementaryInsight
              ? renderInsightDatum('Runtime', runtimeLine, currentSpeechState)
              : renderInsightDatum('Room', roomName, roomLine)}
            {!compactComplementaryInsight ? renderInsightDatum('Runtime', runtimeLine, currentSpeechState) : null}
          </div>
        </div>
      );
    }

    if (mode === 'actions') {
      return (
        <div className={baseCardClass}>
          {renderInsightLead(
            'Quick actions',
            'Jump to what you need',
            'Keep the workspace moving without digging through trays.',
          )}
          <div className="mt-0.75 grid gap-1.25 sm:grid-cols-2 xl:grid-cols-5">
            <Button variant="secondary" className="justify-start gap-2" onClick={() => void createThread()}>
              <Plus className="h-4 w-4" />
              New chat
            </Button>
            <Button variant="secondary" className="justify-start gap-2" onClick={() => toggleTray('chats')}>
              <MessageCircleMore className="h-4 w-4" />
              Open chats
            </Button>
            <Button variant="secondary" className="justify-start gap-2" onClick={() => toggleTray('context')}>
              <Sparkles className="h-4 w-4" />
              Context details
            </Button>
            <Button variant="secondary" className="justify-start gap-2" onClick={() => appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: 'settings' })}>
              <Settings2 className="h-4 w-4" />
              Settings
            </Button>
            <Button variant="secondary" className="justify-start gap-2" onClick={() => void handleShareMoment()} disabled={!shareableMoment || state.isLoading}>
              <Share2 className="h-4 w-4" />
              {shareButtonLabel}
            </Button>
          </div>
        </div>
      );
    }

    if (mode === 'character') {
      return (
        <div className={baseCardClass}>
          {renderInsightLead(
            'Character card',
            activePersona?.name ?? 'No persona selected',
            activePersona?.tagline ?? 'A custom companion ready to chat.',
          )}
          <div className={`mt-0.75 grid gap-1.25 ${compactComplementaryInsight ? 'grid-cols-3' : denseDesktopInsight ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
            {renderInsightDatum(
              'Personality',
              activePersona?.archetype ?? 'custom',
              activeDereTags,
            )}
            {renderInsightDatum(
              'Current vibe',
              appState.avatar.emotion,
              `${appState.avatar.phase} · ${appState.avatar.gesture}`,
            )}
            {compactComplementaryInsight
              ? renderInsightDatum('Speech', currentSpeechState, runtimeLine)
              : renderInsightDatum('Room', roomName, roomLine)}
            {!compactComplementaryInsight ? renderInsightDatum('Viewer', fpsLabel, liveFpsText) : null}
          </div>
        </div>
      );
    }

    if (mode === 'hybrid') {
      return (
        <div className={baseCardClass}>
          {renderInsightLead(
            'Hybrid overview',
            currentSpeechState,
            `${roomLine} · ${runtimeLine}`,
          )}
          <div className={`mt-0.75 grid gap-1.25 ${compactComplementaryInsight ? 'grid-cols-3' : denseDesktopInsight ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
            {compactComplementaryInsight ? (
              <>
                {renderInsightDatum('Focus', activePersona?.name ?? 'No persona', `${appState.avatar.emotion} · ${appState.avatar.gesture}`)}
                {renderInsightDatum('Route', runtimeLine, roomLine)}
                {renderInsightDatum('Memories', retrievedMemories.length.toString(), memoryLine)}
              </>
            ) : (
              <>
                {renderInsightDatum('Room', roomName, roomLine)}
                {renderInsightDatum(
                  'Context',
                  contextBudget.usedInputTokens.toLocaleString(),
                  `${effectiveContextWindow.toLocaleString()} active`,
                )}
                {renderInsightDatum('Viewer', fpsLabel, liveFpsText)}
                {renderInsightDatum('Focus', activePersona?.name ?? 'No persona', `${appState.avatar.emotion} · ${appState.avatar.gesture}`)}
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={baseCardClass}>
        {renderInsightLead(
          'Companion pulse',
          currentSpeechState,
          `${roomName} · ${appState.avatar.emotion} · ${appState.avatar.gesture}`,
        )}

        <div className={`mt-0.75 grid gap-1.25 ${compactComplementaryInsight ? 'grid-cols-3' : denseDesktopInsight ? 'grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
          {compactComplementaryInsight ? (
            <>
              {renderInsightDatum(
                'Current state',
                currentSpeechState,
                `${appState.avatar.emotion} · ${appState.avatar.gesture}`,
              )}
              {renderInsightDatum(
                'Focus',
                activePersona?.name ?? 'No persona',
                roomLine,
              )}
              {renderInsightDatum('Route', runtimeLine, memoryLine)}
            </>
          ) : (
            <>
              {renderInsightDatum(
                'Current state',
                roomLine,
                `${memoryLine} · ${appState.avatar.emotion}`,
              )}
              {renderInsightDatum(
                'Live data',
                fpsLabel,
                liveFpsText,
              )}
              {renderInsightDatum(
                'Focus',
                activePersona?.name ?? 'No persona',
                `${appState.avatar.emotion} · ${appState.avatar.gesture}`,
              )}
              {renderInsightDatum('Route', runtimeLine, memoryLine)}
            </>
          )}
        </div>
      </div>
    );
  };

  const shareButtonLabel = shareStatus === 'shared'
    ? 'Shared'
    : shareStatus === 'copied'
      ? 'Copied'
      : shareStatus === 'error'
        ? 'Retry'
        : 'Share chat';
  const renderHeaderDeckSection = (options?: { belowChat?: boolean }) => {
    const belowChat = options?.belowChat ?? false;
    if (!effectiveHeaderModules.overview && !effectiveHeaderModules.focus) return null;

    if (belowChat) {
      if (setupConversationFirst || loadedRoomFreshChat || pristineConversationStart) {
        const compactInsightMode: HeaderInsightMode = 'runtime';
        return (
          <div
            data-testid="workspace-details-section"
            data-workspace-details-mode="compact"
            data-workspace-details-density="rich-compact"
            className="space-y-2"
          >
            <div
              data-testid="workspace-details-shell"
              className="chat-workspace-details-shell space-y-2 rounded-[22px] border border-[color:var(--control-border-soft)] px-3 py-3 shadow-[var(--shell-shadow-soft)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {loadedRoomFreshChat ? (
                    <div className="mt-0.25 text-sm font-medium text-text-primary">
                      Ready to talk in the current room
                    </div>
                  ) : pristineConversationStart ? (
                    <div className="mt-0.25 text-sm font-medium text-text-primary">
                      Choose a previous chat or start a new one before jumping in
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={`grid min-w-0 gap-1.5 ${effectiveHeaderModules.overview && effectiveHeaderModules.focus ? 'lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]' : 'grid-cols-1'}`}>
                {effectiveHeaderModules.overview ? renderHeaderCommandDeck({ compact: true, showSelector: false }) : null}
                {effectiveHeaderModules.focus ? (
                  <div className="min-w-0">
                    {renderHeaderInsightPanel(compactInsightMode, { compact: true, showSelector: false, allowActions: true })}
                  </div>
                ) : null}
              </div>
              <div className="space-y-1">
                <ContextBudgetSummary budget={contextBudget} />
              </div>
            </div>
          </div>
        );
      }

      return (
        <div data-testid="workspace-details-section" data-workspace-details-mode="collapsible">
          <button
            type="button"
            onClick={() => setDetailsExpandedOverride(!detailsExpanded)}
            className="flex w-full items-center justify-between gap-4 rounded-[20px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] px-4 py-3 text-left shadow-[var(--shell-shadow-soft)] transition-colors hover:bg-[color:var(--control-bg)]"
          >
            <div className="min-w-0 flex-1 self-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Workspace details
              </div>
              <div className="mt-0.5 truncate text-sm font-medium text-text-primary">
                {roomName} · {runtimeLine}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-4 text-text-muted">
                <span className="rounded-pill border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] px-2 py-0.5">
                  {contextBudget.usedInputTokens.toLocaleString()} / {effectiveContextWindow.toLocaleString()} ctx
                </span>
                <span className="rounded-pill border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] px-2 py-0.5">
                  {fpsLabel}
                </span>
                <span className="rounded-pill border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg)] px-2 py-0.5">
                  {roomModeLabel}
                </span>
              </div>
            </div>
            <span className="shrink-0 self-center text-[11px] font-medium text-text-secondary">
              {detailsExpanded ? 'Collapse' : 'Expand'}
            </span>
          </button>
          {detailsExpanded ? (
            <div className={`mt-1.5 grid min-w-0 gap-1.25 ${effectiveHeaderModules.overview && effectiveHeaderModules.focus ? 'lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]' : 'grid-cols-1'}`}>
              {effectiveHeaderModules.overview ? renderHeaderCommandDeck({ compact: true, showSelector: false }) : null}
              {effectiveHeaderModules.focus ? (
                <div className="min-w-0">
                  {renderHeaderInsightPanel(effectiveHeaderInsightMode, { compact: true, showSelector: false, allowActions: true })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    if (condenseDesktopHeader) {
      return (
        <div className={`grid min-w-0 gap-1.25 ${effectiveHeaderModules.overview && effectiveHeaderModules.focus ? 'lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]' : 'grid-cols-1'}`}>
          {effectiveHeaderModules.overview ? renderHeaderCommandDeck({ compact: true, showSelector: !effectiveHeaderModules.focus }) : null}
          {effectiveHeaderModules.focus ? (
            <div className="min-w-0">
              {renderHeaderInsightPanel(topHeaderInsightMode, { compact: true, showSelector: true, allowActions: false })}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <>
        {effectiveHeaderModules.overview ? renderHeaderCommandDeck({ showSelector: !effectiveHeaderModules.focus }) : null}
        {effectiveHeaderModules.focus ? (
          <div className="min-w-0">
            {renderHeaderInsightPanel(topHeaderInsightMode, { compact: showCompactHeaderInsight, showSelector: true, allowActions: false })}
          </div>
        ) : null}
      </>
    );
  };

  const renderBottomActions = () => {
    if (!(visibleUtilityTabs.length > 0 || shareableMoment)) return null;

    return (
      <div data-testid="chat-bottom-actions" className="relative isolate z-[8] min-w-0 overflow-x-auto overscroll-x-contain py-0.5">
        {toolbarCompact ? (
          <div className="flex w-max min-w-full items-center gap-1.5 px-0.5 pr-3">
            {visibleUtilityTabs.map((trayId) => {
              const isActive = isUtilityTrayButtonActive(trayId);
              return (
                <Button
                  key={trayId}
                  variant={isActive ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => toggleTray(trayId)}
                  data-active={isActive ? 'true' : 'false'}
                  data-current-view={pristineConversationStart && trayId === 'chats' ? 'true' : 'false'}
                  className={[
                    'chat-utility-tab-button h-7.5 shrink-0 gap-1.25 rounded-pill',
                    veryCompactWorkspace ? 'px-2.5 text-[11px]' : 'px-3.5',
                  ].join(' ')}
                  title={pristineConversationStart && trayId === 'chats' ? 'Chats view is already open' : undefined}
                >
                  {trayId === 'chats' ? <MessageCircleMore className="h-3.5 w-3.5" /> : null}
                  {trayId === 'context' ? <Sparkles className="h-3.5 w-3.5" /> : null}
                  {trayId === 'settings' ? <Settings2 className="h-3.5 w-3.5" /> : null}
                  {UTILITY_TRAY_LABELS[trayId]}
                </Button>
              );
            })}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleShareMoment()}
              disabled={!shareableMoment || state.isLoading}
              className={[
                'h-7.5 shrink-0 gap-1.25 rounded-pill',
                veryCompactWorkspace ? 'px-2.5' : 'px-3.5',
              ].join(' ')}
              title={shareButtonLabel}
            >
              <Share2 className="h-3.5 w-3.5" />
              {!veryCompactWorkspace ? shareButtonLabel : null}
            </Button>
          </div>
        ) : (
          <div className="flex min-w-full items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {visibleUtilityTabs.map((trayId) => {
                const isActive = isUtilityTrayButtonActive(trayId);
                return (
                  <Button
                    key={trayId}
                    variant={isActive ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => toggleTray(trayId)}
                    data-active={isActive ? 'true' : 'false'}
                    data-current-view={pristineConversationStart && trayId === 'chats' ? 'true' : 'false'}
                    className="chat-utility-tab-button h-7.5 shrink-0 gap-1.25 rounded-pill px-3.5"
                    title={pristineConversationStart && trayId === 'chats' ? 'Chats view is already open' : undefined}
                  >
                    {trayId === 'chats' ? <MessageCircleMore className="h-3.5 w-3.5" /> : null}
                    {trayId === 'context' ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    {trayId === 'settings' ? <Settings2 className="h-3.5 w-3.5" /> : null}
                    {UTILITY_TRAY_LABELS[trayId]}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleShareMoment()}
              disabled={!shareableMoment || state.isLoading}
              className="h-7.5 shrink-0 gap-1.25 rounded-pill px-3.5"
              title={shareButtonLabel}
            >
              <Share2 className="h-3.5 w-3.5" />
              {shareButtonLabel}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={workspaceRef}
      data-testid="chat-panel-scroll-root"
      data-scroll-mode={layoutMode === 'two-column' ? 'internal' : 'page'}
      className={[
        layoutMode === 'two-column'
          ? 'h-full min-h-0 min-w-0 overflow-hidden bg-transparent'
          : settingsTrayExpanded
            ? 'min-h-full min-w-0 overflow-visible bg-transparent'
            : 'h-full min-h-0 min-w-0 overflow-x-auto bg-transparent',
        layoutMode === 'two-column' ? 'p-0' : 'p-3 md:p-4',
      ].join(' ')}
    >
      <div
        data-testid="chat-panel-shell"
        data-stage-layout={layoutMode === 'two-column' ? 'shared-height' : 'stacked'}
        data-layout-mode={layoutMode}
        className={`chat-workspace-shell flex min-h-0 min-w-0 flex-col border border-[color:var(--shell-divider)] shadow-[var(--shell-shadow)] ${layoutMode === 'two-column' ? 'h-full overflow-x-hidden overflow-y-auto scroll-pb-5 rounded-[28px]' : settingsTrayExpanded ? 'overflow-x-auto overflow-y-visible rounded-[28px]' : 'h-full overflow-hidden rounded-[28px]'}`}
      >
      <header className={`chat-header-band px-4 ${condenseDesktopHeader ? 'py-1.5' : 'py-3'} md:px-5`}>
        <div className={`flex min-w-0 flex-col ${condenseDesktopHeader ? 'gap-0.75' : 'gap-2.5'}`}>
          <div className={`flex min-w-0 gap-2 ${headerCompact ? 'flex-col items-start' : 'items-start justify-between'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-2">
                {titleEditing ? (
                  <Input
                    ref={titleInputRef}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={() => void handleSaveTitle()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSaveTitle();
                      }
                      if (event.key === 'Escape') {
                        setRenameDraft(currentThread?.title ?? 'New conversation');
                        setTitleEditing(false);
                      }
                    }}
                    className={`max-w-[34rem] rounded-pill font-semibold ${condenseDesktopHeader ? 'h-9 text-base md:text-[1.08rem]' : 'h-10 text-lg md:text-xl'}`}
                    maxLength={120}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(currentThread?.title ?? 'New conversation');
                      setTitleEditing(true);
                    }}
                    className="group flex min-w-0 items-center gap-2 rounded-pill px-1 py-0.5 text-left transition-colors hover:bg-anime-50/60"
                  >
                    {condenseDesktopHeader && activePersona ? (
                      <>
                        <Badge variant="secondary" className="shrink-0 normal-case tracking-normal">
                          {activePersona.name}
                        </Badge>
                        <MoodIndicator mood={companionMood.mood} />
                      </>
                    ) : null}
                    <h1
                      className={[
                        'font-display font-semibold leading-tight text-text-primary',
                        compactWorkspace
                          ? 'line-clamp-1 text-[1.18rem]'
                          : condenseDesktopHeader
                            ? 'line-clamp-1 text-[1rem] md:text-[1.14rem]'
                            : 'line-clamp-2 text-[1.26rem] md:text-[1.7rem]',
                      ].join(' ')}
                      title={currentThread?.title ?? 'New conversation'}
                    >
                      {currentThread?.title ?? 'New conversation'}
                    </h1>
                    {condenseDesktopHeader ? (
                      <span className="chat-header-brand hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.28em] text-transparent sm:inline-flex">
                        <span className="chat-header-brand-gradient bg-clip-text font-display">
                          AnimeGirly
                        </span>
                      </span>
                    ) : null}
                    <Edit3 className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
              </div>

              {showCompactHeaderMetaRow ? (
                <div className={`grid gap-y-1 ${condenseDesktopHeader ? 'mt-0.25' : 'mt-1.5'}`}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {activePersona && !condenseDesktopHeader ? (
                      <>
                        <Badge variant="secondary" className="normal-case tracking-normal">
                          {activePersona.name}
                        </Badge>
                        <MoodIndicator mood={companionMood.mood} />
                      </>
                    ) : null}
                    {!condenseDesktopHeader ? (
                      <span
                        className="chat-header-inline-chip"
                        title={currentRuntimeModel?.id ?? appState.providerConfig.llm.primary}
                      >
                        {currentRuntimeModel?.id ?? appState.providerConfig.llm.primary}
                      </span>
                    ) : null}
                    <span className="chat-header-brand text-[11px] font-semibold uppercase tracking-[0.28em] text-transparent">
                      <span className="chat-header-brand-gradient bg-clip-text font-display">
                        AnimeGirly
                      </span>
                    </span>
                    {!condenseDesktopHeader ? (
                      <span
                        className="min-w-0 max-w-full truncate"
                        title={currentRuntimeModel?.id ?? appState.providerConfig.llm.primary}
                      >
                        <span className="chat-header-context-line text-[11px] leading-5 text-text-muted">{compactContextHint}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {!appState.workspacePanelPreferences.settings ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: 'settings' })}
                className={`shrink-0 gap-1 ${condenseDesktopHeader ? 'h-8.5 px-3' : ''}`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {!veryCompactWorkspace ? 'Settings' : null}
              </Button>
            ) : null}
          </div>

          {showHeaderDeckAboveChat ? renderHeaderDeckSection() : null}
        </div>
      </header>
      <Separator className="opacity-70" />

      <div
        data-testid="chat-message-stage"
        data-stage-mode={desktopSetupPane ? 'setup-compact' : loadedRoomFreshChat ? 'conversation-compact' : 'default'}
        className={`chat-message-stage bg-transparent ${desktopSetupPane ? 'shrink-0 overflow-visible' : 'min-h-0 flex-1 overflow-hidden'}`}
      >
        {desktopSetupPane ? (
          <div data-testid="chat-setup-stage-shell" className="flex min-h-0 items-start px-4 py-1.5 md:px-5">
            <div
              data-testid="chat-setup-pane"
              data-pane-density="compact"
              className="chat-utility-tray w-full self-start overflow-visible rounded-[20px] border border-[color:var(--shell-divider)] shadow-[var(--shell-shadow)]"
            >
              <SettingsPanel embedded heightMode="natural" />
            </div>
          </div>
        ) : pristineConversationStart ? (
          <div data-testid="chat-history-stage-shell" className="flex min-h-0 items-start px-4 py-1.5 md:px-5">
            <div
              data-testid="chat-history-pane"
              data-pane-density="compact"
              className="chat-utility-tray h-[clamp(16rem,35dvh,23rem)] w-full min-h-0 self-start overflow-hidden rounded-[20px] border border-[color:var(--shell-divider)] shadow-[var(--shell-shadow)]"
            >
              {renderChatsTray()}
            </div>
          </div>
        ) : (
          <>
            {pendingSharedMoment ? (
              <SharedMomentBanner
                moment={pendingSharedMoment}
                hasExistingChat={state.messages.length > 0}
                onAccept={handleImportSharedMoment}
                onDismiss={handleDismissSharedMoment}
              />
            ) : null}
            <MessageList
              scrollMode="contained"
              emptyStateVariant={loadedRoomFreshChat ? 'loaded-room-fresh-chat' : 'default'}
            />
          </>
        )}
      </div>

      {state.error ? (
        <>
          <Separator className="opacity-70" />
          <div className="mx-4 my-3 rounded-[18px] border border-rose-pastel-300 bg-rose-pastel-100/82 px-3 py-2 text-xs shadow-[0_10px_26px_-18px_var(--color-glow-accent)] md:mx-5">
          <span className="font-semibold">Error:</span> {state.error}
          </div>
        </>
      ) : null}

      <>
        <div className="chat-composer-dock bg-transparent px-4 pb-0.5 pt-0.75 md:px-5">
          <div data-testid="chat-composer-dock">
            <ChatInputBar autofocusEnabled={!renameDialogOpen && !deleteDialogOpen && settingsState.wizardStep === null} />
          </div>
        </div>

        <Separator className="opacity-70" />
        <div data-testid="chat-utility-dock" className="chat-utility-dock relative flex flex-col gap-1.5 bg-transparent px-4 pb-6 pt-0.75 md:px-5 md:pb-6">
        {renderBelowChatDetails ? renderHeaderDeckSection({ belowChat: true }) : null}

        {renderedUtilityTray && !desktopUtilityOverlay && !(desktopSetupPane && renderedUtilityTray === 'settings') ? (
          <div
            data-testid="chat-active-utility-tray"
            data-tray-mode={naturalSettingsTray ? 'natural' : 'contained'}
            data-motion-phase={utilityTrayTransitionState}
            className={`chat-utility-tray motion-panel ${compactUtilityTray ? 'chat-utility-tray--compact' : ''} relative z-[9] mt-1 rounded-[20px] border border-[color:var(--shell-divider)] min-h-0 ${naturalSettingsTray ? 'overflow-visible' : 'overflow-hidden'}`}
            style={utilityTrayHeightStyle}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className={`flex ${renderedUtilityTray === 'settings' ? 'items-center justify-between gap-2 px-3 py-0.25' : compactWorkspace ? 'flex-col items-start gap-3 px-3.5' : 'items-center justify-between gap-3 px-3.5'} ${compactUtilityTray ? 'py-0.5' : renderedUtilityTray === 'settings' ? 'py-0.25' : 'py-0.75'}`}>
                <div className={renderedUtilityTray === 'settings' ? 'text-sm font-semibold text-text-primary' : ''}>
                  {renderedUtilityTray === 'settings' ? (
                    UTILITY_TRAY_LABELS[renderedUtilityTray]
                  ) : (
                    <>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
                        {UTILITY_TRAY_LABELS[renderedUtilityTray]}
                      </div>
                      <div className={`mt-0.5 ${layoutMode === 'two-column' || compactUtilityTray ? 'hidden' : 'text-[11px] font-medium text-text-primary motion-content'}`}>
                        {renderedUtilityTray === 'chats' && 'Previous chats, archives, and new conversation controls.'}
                        {renderedUtilityTray === 'context' && 'Context usage, memory contribution, and runtime budget.'}
                      </div>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size={renderedUtilityTray === 'settings' ? 'icon' : 'sm'}
                  onClick={() => appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: null })}
                  aria-label={renderedUtilityTray === 'settings' ? 'Close settings' : 'Close tray'}
                  className={renderedUtilityTray === 'settings'
                    ? 'h-8 w-8 shrink-0 rounded-full border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] shadow-[var(--shell-shadow-soft)] transition-all hover:bg-[color:var(--control-bg)] active:scale-[0.97]'
                    : 'h-7.5 px-2.5 text-[11px]'}
                >
                  {renderedUtilityTray === 'settings' ? <X className="h-4 w-4" /> : 'Close'}
                </Button>
              </div>
              {renderedUtilityTray === 'settings' ? null : <Separator />}
              <div className={`${naturalSettingsTray ? 'flex-1' : 'min-h-0 flex-1'} motion-content`}>{renderUtilityTrayContent(renderedUtilityTray)}</div>
            </div>
          </div>
        ) : null}
        {renderBottomActions()}
        {desktopUtilityOverlay ? (
          <div
            data-testid="chat-settings-overlay"
            className="pointer-events-none absolute inset-x-4 bottom-16 z-[12] md:inset-x-5"
          >
            <div
              data-motion-phase={utilityTrayTransitionState}
              className="pointer-events-auto chat-utility-tray motion-panel rounded-[20px] border border-[color:var(--shell-divider)] min-h-0 overflow-hidden shadow-[var(--shell-shadow)]"
              style={utilityTrayHeightStyle}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between gap-3 px-3.5 py-0.75">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
                      {UTILITY_TRAY_LABELS[renderedUtilityTray]}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => appDispatch({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: null })}
                    className="h-7.5 px-2.5 text-[11px]"
                  >
                    Close
                  </Button>
                </div>
                <Separator />
                <div className="min-h-0 flex-1 motion-content">{renderUtilityTrayContent(renderedUtilityTray)}</div>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {managedThread
                ? `This removes "${managedThread.title}", its messages, summaries, and saved thread memories.`
                : 'This removes the current chat and its saved thread memory.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!managedThread) return;
                void deleteThread(managedThread.id);
              }}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>
              Keep the title short and easy to scan so it feels like a normal messaging app conversation list.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-text-secondary" htmlFor="rename-thread-input">
              Chat title
            </label>
            <Input
              id="rename-thread-input"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder="Late-night teasing"
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!managedThread) return;
                const nextTitle = renameDraft.trim();
                if (!nextTitle) return;
                void renameThread(managedThread.id, nextTitle);
                setRenameDialogOpen(false);
              }}
              disabled={!renameDraft.trim()}
            >
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showScenarioWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-2xl rounded-2xl border border-[color:var(--shell-divider)] bg-[color:var(--card-bg)] p-6 shadow-2xl">
            <ScenarioWizard
              onClose={() => setShowScenarioWizard(false)}
              onApply={(scenario) => void handleScenarioApply(scenario)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
