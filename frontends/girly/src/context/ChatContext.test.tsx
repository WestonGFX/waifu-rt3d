import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppProvider } from './AppContext.tsx';
import { ChatProvider, useChat } from './ChatContext.tsx';

const mockExecuteLLMStream = vi.fn();
const mockWarmOllamaModel = vi.fn();

vi.mock('../providers/registry.ts', () => ({
  STREAM_RESET_SENTINEL: '\x00RESET\x00',
  executeLLMStream: (...args: unknown[]) => mockExecuteLLMStream(...args),
}));

vi.mock('../services/appDb.ts', () => ({
  listLorebookEntriesForPersona: vi.fn().mockResolvedValue([]),
  listMilestonesForPersona: vi.fn().mockResolvedValue([]),
  putMilestone: vi.fn().mockResolvedValue(undefined),
  listEpisodicMemoriesForPersona: vi.fn().mockResolvedValue([]),
  listKnowledgeBoundariesForPersona: vi.fn().mockResolvedValue([]),
  bulkPutEpisodicMemories: vi.fn().mockResolvedValue(undefined),
  bulkPutKnowledgeBoundaries: vi.fn().mockResolvedValue(undefined),
}));

const mockReplaceCurrentMessages = vi.fn();

vi.mock('./CompanionContext.tsx', () => ({
  useCompanion: () => ({
    state: {
      isReady: true,
      currentThreadId: 'thread-test',
      runtimeStatuses: [],
      contentGateConfig: {
        globalContentCeiling: 'general',
        ageVerified: false,
        contentLockEnabled: false,
        contentLockPasswordHash: '',
        perPersonaCeilings: {},
      },
      intimacyStatesByThread: {},
      psychologyStatesByThread: {},
    },
    currentMessages: [],
    currentThreadSummaries: [],
    retrievedMemories: [],
    activePersona: {
      id: 'persona-test',
      name: 'Asami',
      archetype: 'deredere',
      dereTypes: ['deredere', 'genki'],
      tagline: 'A warm test persona.',
      shortBio: 'A bright and affectionate test companion.',
      backstory: 'She exists to keep tests realistic.',
      characterFacts: ['Likes test cafés', 'Remembers assertions'],
      worldSetting: 'Test city',
      relationshipPremise: 'Test premise',
      toneGuide: 'Warm and affectionate.',
      initiativeLevel: 7,
      affectionLevel: 8,
      flirtLevel: 6,
      memoryPriorities: [],
      generatedSystemPrompt: 'Stay in character as Asami.',
      createdAt: 1,
      updatedAt: 1,
    },
    replaceCurrentMessages: mockReplaceCurrentMessages,
    warmOllamaModel: mockWarmOllamaModel,
    currentIntimacyState: null,
    currentPsychologyState: null,
    updateIntimacyState: vi.fn(),
    updatePsychologyState: vi.fn(),
    updateContentGateConfig: vi.fn(),
  }),
}));

vi.mock('./SettingsContext.tsx', () => ({
  useSettings: () => ({
    state: { wizardStep: null, isPanelOpen: false, currentTab: 'general', panelHeight: 440, desktopViewerWidthPercent: 40 },
    dispatch: vi.fn(),
  }),
}));

function ChatProbe({ autoSend = false }: { autoSend?: boolean }) {
  const { state, sendMessage, importSharedMoment } = useChat();

  useEffect(() => {
    if (!autoSend) return;
    void sendMessage('hello');
  }, [autoSend, sendMessage]);

  return (
    <div>
      <button type="button" onClick={() => void sendMessage('hello')}>send</button>
      <button
        type="button"
        onClick={() => importSharedMoment({
          version: 1,
          source: 'animegirly',
          createdAt: 50,
          messages: [
            {
              role: 'user',
              content: 'share me',
              timestamp: 51,
            },
            {
              role: 'assistant',
              content: 'imported reply',
              timestamp: 52,
            },
          ],
        })}
      >
        import
      </button>
      <div data-testid="count">{state.messages.length}</div>
      <div data-testid="error">{state.error ?? ''}</div>
      <ul>
        {state.messages.map((m) => (
          <li key={m.id}>{m.role}:{m.content}</li>
        ))}
      </ul>
    </div>
  );
}

function renderChat(autoSend = false) {
  return render(
    <AppProvider>
      <ChatProvider>
        <ChatProbe autoSend={autoSend} />
      </ChatProvider>
    </AppProvider>,
  );
}

describe('ChatContext sendMessage integration', () => {
  beforeEach(() => {
    localStorage.clear();
    mockExecuteLLMStream.mockReset();
    mockReplaceCurrentMessages.mockReset();
    mockWarmOllamaModel.mockReset();
  });

  it('appends user and assistant messages for a successful stream', async () => {
    mockExecuteLLMStream.mockImplementation(async function* () {
      yield 'Hi';
      yield ' there';
      yield '\n<anime-performance emotion="warm" energy="0.58" intimacy="0.66" gesture="handToHeart" gaze="camera" talkIntensity="0.52" reaction="softSmile" idle="cozy" sceneBeat="reassure" />';
    });

    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
      expect(screen.getByText('assistant:Hi there')).toBeInTheDocument();
    });
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(screen.queryByText(/anime-performance/i)).not.toBeInTheDocument();
  });

  it('removes empty/reset assistant placeholder when stream fails after reset', async () => {
    mockExecuteLLMStream.mockImplementation(async function* () {
      yield 'partial';
      yield '\x00RESET\x00';
      throw new Error('chain failed');
    });

    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
    expect(screen.getByTestId('error').textContent).toContain('chain failed');
  });

  it('imports a shared moment as the active chat history', async () => {
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'import' }));

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
      expect(screen.getByText('user:share me')).toBeInTheDocument();
      expect(screen.getByText('assistant:imported reply')).toBeInTheDocument();
    });
  });
});
