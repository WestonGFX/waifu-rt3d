import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from './ChatPanel.tsx';

const mockUseChat = vi.fn();
const mockUseCompanion = vi.fn();
const mockUseEnvironment = vi.fn();
const mockUseSettings = vi.fn();
const mockUseApp = vi.fn();
const mockUseSpeechSynthesis = vi.fn();

vi.mock('../../context/ChatContext.tsx', () => ({
  useChat: () => mockUseChat(),
}));

vi.mock('../../context/CompanionContext.tsx', () => ({
  useCompanion: () => mockUseCompanion(),
}));

vi.mock('../../context/EnvironmentContext.tsx', () => ({
  useEnvironment: () => mockUseEnvironment(),
}));

vi.mock('../../context/SettingsContext.tsx', () => ({
  useSettings: () => mockUseSettings(),
}));

vi.mock('../../context/AppContext.tsx', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../../hooks/useSpeechSynthesis.ts', () => ({
  default: () => mockUseSpeechSynthesis(),
}));

vi.mock('./MessageList.tsx', () => ({
  default: ({ emptyStateVariant }: { emptyStateVariant?: string }) => (
    <div
      data-testid="message-list"
      data-empty-state-variant={emptyStateVariant ?? 'default'}
    >
      messages
    </div>
  ),
}));

vi.mock('./ChatInputBar.tsx', () => ({
  default: () => <div data-testid="chat-input">input</div>,
}));

vi.mock('./SharedMomentBanner.tsx', () => ({
  default: () => <div data-testid="shared-moment-banner">banner</div>,
}));

vi.mock('../settings/SettingsPanel.tsx', () => ({
  default: ({ heightMode }: { heightMode?: string }) => <div data-testid="settings-panel" data-height-mode={heightMode ?? 'unknown'}>settings</div>,
}));

vi.mock('../relationship/MoodIndicator.tsx', () => ({
  default: () => <span data-testid="mood-indicator" />,
}));

vi.mock('../../services/moodService.ts', () => ({
  deriveCompanionMood: () => ({ mood: 'neutral', icon: '🌿', colorClass: 'text-slate-400', label: 'Neutral' }),
}));

describe('ChatPanel runtime header insight', () => {
  beforeEach(() => {
    mockUseChat.mockReturnValue({
      state: {
        messages: [],
        isLoading: false,
        error: null,
      },
      importSharedMoment: vi.fn(),
    });

    mockUseCompanion.mockReturnValue({
      state: {
        threads: [
          {
            id: 'thread-1',
            title: 'Test thread',
            titleSource: 'timestamp',
            personaId: 'persona-1',
            voiceProfileId: 'voice-1',
            archived: false,
            createdAt: 1,
            updatedAt: 1,
            summaryVersion: 0,
            promptSnapshotId: 'prompt-1',
          },
        ],
        currentThreadId: 'thread-1',
        personas: [
          {
            id: 'persona-1',
            name: 'Reina',
            archetype: 'shy',
            tagline: 'Quiet and playful.',
            dereTypes: ['shy'],
            generatedSystemPrompt: 'Stay playful.',
            rawPromptOverride: '',
          },
        ],
        runtimeStatuses: [],
        memoryRecords: [],
        messagesByThread: { 'thread-1': [] },
      },
      currentThread: {
        id: 'thread-1',
        title: 'Test thread',
        titleSource: 'timestamp',
        personaId: 'persona-1',
        voiceProfileId: 'voice-1',
        archived: false,
        createdAt: 1,
        updatedAt: 1,
        summaryVersion: 0,
        promptSnapshotId: 'prompt-1',
      },
      currentThreadSummaries: [],
      retrievedMemories: [],
      activePersona: {
        id: 'persona-1',
        name: 'Reina',
        archetype: 'shy',
        tagline: 'Quiet and playful.',
        dereTypes: ['shy'],
        generatedSystemPrompt: 'Stay playful.',
        rawPromptOverride: '',
      },
      createThread: vi.fn(),
      selectThread: vi.fn(),
      renameThread: vi.fn(),
      archiveThread: vi.fn(),
      deleteThread: vi.fn(),
      setCurrentPersona: vi.fn(),
      currentPsychologyState: null,
    });

    mockUseEnvironment.mockReturnValue({
      currentEnvironment: null,
      state: {
        roomRuntime: {
          roomMode: 'none',
          currentAnchorId: null,
          currentHotspotId: null,
          familiarity: 0,
        },
      },
    });

    mockUseSettings.mockReturnValue({
      state: {
        autoReadAssistant: false,
        currentTab: 'general',
        wizardStep: null,
      },
      dispatch: vi.fn(),
    });

    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: null,
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 0,
          currentFps: 0,
        },
      },
      dispatch: vi.fn(),
    });

    mockUseSpeechSynthesis.mockReturnValue({
      speak: vi.fn(),
      isSupported: false,
    });
  });

  it('renders without crashing when the runtime model has no maximum context window', () => {
    expect(() => render(<ChatPanel layoutMode="two-column" />)).not.toThrow();
    expect(screen.getAllByText('ollama').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Room').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Context').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no active room/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/is none/i)).not.toBeInTheDocument();
    expect(screen.queryByText('State')).not.toBeInTheDocument();
    expect(screen.getAllByText(/4,096 active/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /workspace details/i })).not.toBeInTheDocument();
  });

  it('collapses workspace details below chat when the thread already has messages', () => {
    mockUseChat.mockReturnValue({
      state: {
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            content: 'Hello there',
            timestamp: 1,
          },
        ],
        isLoading: false,
        error: null,
      },
      importSharedMoment: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" />);

    const detailsButton = screen.getByRole('button', { name: /workspace details/i });
    expect(detailsButton).toBeInTheDocument();
    expect(screen.getByText('Empty stage · ollama')).toBeInTheDocument();
    expect(screen.queryByText('Room')).not.toBeInTheDocument();
    expect(screen.queryByText('Viewer')).not.toBeInTheDocument();

    fireEvent.click(detailsButton);

    expect(screen.getAllByText('Room').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Context').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('treats the two-column chat shell as an internal scroll stage', () => {
    render(<ChatPanel layoutMode="two-column" />);

    expect(screen.getByTestId('chat-panel-scroll-root')).toHaveAttribute('data-scroll-mode', 'internal');
    expect(screen.getByTestId('chat-panel-shell')).toHaveAttribute('data-stage-layout', 'shared-height');
    expect(screen.getByTestId('chat-panel-shell').className).toContain('scroll-pb-5');
  });

  it('keeps the overview deck when the focus module is hidden', () => {
    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
          headerModules: {
            overview: true,
            focus: false,
            actions: false,
          },
        },
        activeUtilityTray: null,
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 0,
          currentFps: 0,
        },
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" />);

    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.queryByText(/max runtime pending/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /workspace details/i })).not.toBeInTheDocument();
  });

  it('uses the message stage for setup on desktop without replacing the bottom dock', () => {
    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: 'settings',
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 0,
          currentFps: 0,
        },
      },
      dispatch: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      state: {
        autoReadAssistant: false,
        currentTab: 'general',
        wizardStep: 0,
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    const messageStage = screen.getByTestId('chat-message-stage');
    const setupStageShell = screen.getByTestId('chat-setup-stage-shell');
    const setupPane = screen.getByTestId('chat-setup-pane');
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-panel')).toHaveAttribute('data-height-mode', 'natural');
    expect(messageStage).toHaveAttribute('data-stage-mode', 'setup-compact');
    expect(setupStageShell.className).toContain('py-1.5');
    expect(setupPane).toHaveAttribute('data-pane-density', 'compact');
    expect(setupPane.className).not.toContain('h-[clamp(18rem,32dvh,24rem)]');
    expect(setupPane.className).toContain('overflow-visible');
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-settings-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-details-section')).toHaveAttribute('data-workspace-details-density', 'rich-compact');
    expect(screen.queryByTestId('workspace-details-summary')).not.toBeInTheDocument();
    expect(screen.getAllByText('Runtime HUD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Room').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('keeps loaded-room fresh chat conversation-first without moving the bottom utility row', () => {
    mockUseEnvironment.mockReturnValue({
      currentEnvironment: {
        id: 'room-1',
        name: 'Playful rainy-day date',
      },
      state: {
        roomRuntime: {
          roomMode: 'waiting',
          currentAnchorId: null,
          currentHotspotId: null,
          familiarity: 0.7,
        },
      },
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    const composer = screen.getByTestId('chat-input');
    const chatsButton = screen.getByRole('button', { name: 'Chats' });
    const detailsSection = screen.getByTestId('workspace-details-section');
    const detailsShell = screen.getByTestId('workspace-details-shell');
    const utilityDock = screen.getByTestId('chat-utility-dock');

    expect(screen.getByTestId('message-list')).toHaveAttribute('data-empty-state-variant', 'loaded-room-fresh-chat');
    expect(composer.compareDocumentPosition(detailsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailsSection.compareDocumentPosition(chatsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detailsSection).toHaveAttribute('data-workspace-details-density', 'rich-compact');
    expect(detailsShell.className).toContain('chat-workspace-details-shell');
    expect(utilityDock.className).toContain('pb-6');
    expect(screen.queryByTestId('workspace-details-summary')).not.toBeInTheDocument();
    expect(screen.getAllByText('Runtime HUD').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /workspace details/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace details')).not.toBeInTheDocument();
    expect(screen.getAllByText('Room').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Context').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('chat-settings-overlay')).not.toBeInTheDocument();
  });

  it('uses the message stage for chat history when setup is complete but no room or messages exist yet', () => {
    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-history-stage-shell')).toBeInTheDocument();
    expect(screen.getByTestId('chat-history-pane').className).toContain('h-[clamp(16rem,35dvh,23rem)]');
    expect(screen.getByText('Previous chats and quick switching.')).toBeInTheDocument();
    expect(screen.getAllByText('Test thread').length).toBeGreaterThan(0);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-details-section')).toHaveAttribute('data-workspace-details-density', 'rich-compact');
    expect(screen.getByText('Context summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('uses a naturally sized settings tray in single-column wizard mode', () => {
    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: 'settings',
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 0,
          currentFps: 0,
        },
      },
      dispatch: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      state: {
        autoReadAssistant: false,
        currentTab: 'general',
        wizardStep: 0,
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="single-column" initialWorkspaceWidth={760} initialWorkspaceHeight={920} />);

    const utilityTray = screen.getByTestId('chat-active-utility-tray');
    expect(utilityTray).toHaveAttribute('data-tray-mode', 'natural');
    expect((utilityTray as HTMLDivElement).style.height).toBe('');
    expect((utilityTray as HTMLDivElement).style.maxHeight).toBe('min(56dvh, 38rem)');
  });

  it('routes the bottom settings action to the real settings tray while setup is active', () => {
    const dispatch = vi.fn();
    const settingsDispatch = vi.fn();

    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: null,
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 45,
          currentFps: 60,
        },
      },
      dispatch,
    });

    mockUseSettings.mockReturnValue({
      state: {
        autoReadAssistant: false,
        currentTab: 'general',
        wizardStep: 0,
      },
      dispatch: settingsDispatch,
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(settingsDispatch).toHaveBeenCalledWith({ type: 'CLOSE_WIZARD' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_UTILITY_TRAY', payload: 'settings' });
  });

  it('routes bottom chats and context actions through the real tray path while setup is active', () => {
    const dispatch = vi.fn();
    const settingsDispatch = vi.fn();

    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: null,
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 45,
          currentFps: 60,
        },
      },
      dispatch,
    });

    mockUseSettings.mockReturnValue({
      state: {
        autoReadAssistant: false,
        currentTab: 'general',
        wizardStep: 0,
      },
      dispatch: settingsDispatch,
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Context' }));

    expect(settingsDispatch).toHaveBeenCalledTimes(2);
    expect(settingsDispatch).toHaveBeenNthCalledWith(1, { type: 'CLOSE_WIZARD' });
    expect(settingsDispatch).toHaveBeenNthCalledWith(2, { type: 'CLOSE_WIZARD' });
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'SET_ACTIVE_UTILITY_TRAY', payload: 'chats' });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'SET_ACTIVE_UTILITY_TRAY', payload: 'context' });
  });

  it('uses the desktop overlay tray for context in two-column fresh chat states', () => {
    mockUseEnvironment.mockReturnValue({
      currentEnvironment: {
        id: 'room-1',
        name: 'Playful rainy-day date',
      },
      state: {
        roomRuntime: {
          roomMode: 'waiting',
          currentAnchorId: null,
          currentHotspotId: null,
          familiarity: 0.7,
        },
      },
    });

    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: 'context',
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 45,
          currentFps: 60,
        },
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    const overlay = screen.getByTestId('chat-settings-overlay');
    expect(overlay).toBeInTheDocument();
    expect(screen.queryByTestId('chat-active-utility-tray')).not.toBeInTheDocument();
    expect(within(overlay).getByText(/tokens in play/i)).toBeInTheDocument();
  });

  it('renders settings inline instead of as an overlay in two-column mode', () => {
    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: 'settings',
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 45,
          currentFps: 60,
        },
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    expect(screen.queryByTestId('chat-settings-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-active-utility-tray')).toBeInTheDocument();
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-details-section')).toBeInTheDocument();
  });

  it('keeps bottom actions below the inline tray when a two-column settings tray is open', () => {
    mockUseApp.mockReturnValue({
      state: {
        providerConfig: {
          llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: [], timeoutMs: 30000 },
        },
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
        },
        activeUtilityTray: 'settings',
        headerInsightMode: 'runtime',
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
        },
        metrics: {
          averageFps: 45,
          currentFps: 60,
        },
      },
      dispatch: vi.fn(),
    });

    render(<ChatPanel layoutMode="two-column" initialWorkspaceWidth={1021} initialWorkspaceHeight={1180} />);

    const utilityTray = screen.getByTestId('chat-active-utility-tray');
    const bottomActions = screen.getByTestId('chat-bottom-actions');

    expect(utilityTray.compareDocumentPosition(bottomActions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
