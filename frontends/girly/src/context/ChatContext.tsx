/**
 * ChatContext – Chat message history and send orchestration.
 *
 * Owns:
 *   - The full message array (user + assistant messages in order).
 *   - Loading flag (true while waiting for an LLM response).
 *   - Error string (set when the LLM call fails after all fallbacks).
 *
 * Exports `sendMessage(text)` – the async orchestrator that:
 *   1. Appends the user message.
 *   2. Calls the LLM through the provider/fallback system.
 *   3. Appends the assistant response (or sets error).
 *
 * Persistence: a useEffect in this provider persists messages to
 * localStorage whenever the array changes, via storageService.
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { type ChatMessage } from '../types/index.ts';
import { executeLLMStream, getLLMProvider, STREAM_RESET_SENTINEL } from '../providers/registry.ts';
import { sessionTokenHistory, estimateRequestCost } from '../services/tokenHistoryService.ts';
import { estimateTokenCount } from '../services/contextBudgetService.ts';
import { useApp } from './AppContext.tsx';
import { useSettings } from './SettingsContext.tsx';
import { useCompanion } from './CompanionContext.tsx';
import {
  buildPerformancePromptMessages,
  createAssistantAvatarState,
  createAvatarFailureState,
  createStreamingAvatarState,
  createThinkingAvatarState,
  parseThinkTags,
  sanitizeAssistantVisibleText,
} from '../services/avatarPerformanceService.ts';
import {
  buildThreadPromptContext,
  keepRecentMessages,
} from '../services/promptAssemblyService.ts';
import {
  buildHeuristicThreadTitle,
  buildTimestampThreadTitle,
  generateThreadTitleWithLLM,
} from '../services/threadTitleService.ts';
import {
  createImportedMessagesFromSharedMoment,
} from '../services/shareMomentService.ts';
import {
  getProviderOptions,
  resolveConfiguredLLMModelId,
  resolveCurrentRuntimeStatus,
} from '../services/llmRuntimeService.ts';
import { type SharedConversationMoment } from '../types/index.ts';
import {
  DEFAULT_INTIMACY_STATE,
  DEFAULT_PHYSICAL_STATE,
} from '../types/content.ts';
import { resolveEffectiveContentCeiling } from '../services/contentGatingService.ts';
import { evaluateIntimacyShift, updatePhysicalState } from '../services/intimacyTrackingService.ts';
import {
  createInitialPsychologyState,
  evaluateConversationTurn,
} from '../services/psychologyEngineService.ts';
import { scanForActivatedEntries } from '../services/lorebookScannerService.ts';
import { listLorebookEntriesForPersona, listMilestonesForPersona, putMilestone } from '../services/appDb.ts';
import { DEFAULT_LOREBOOK_SETTINGS } from '../types/lorebook.ts';
import { checkMilestones, computeRelationshipStats, type MilestoneDefinition } from '../services/milestoneService.ts';
import { type MilestoneRecord } from '../types/relationship.ts';
import { extractWorkingMemoryFacts, deduplicateWithLongTerm } from '../services/workingMemoryService.ts';
import { detectEpisodicMoments } from '../services/episodicMemoryService.ts';
import { scanForKnowledgeUpdates } from '../services/knowledgeBoundaryService.ts';
import { detectContradictions } from '../services/contradictionDetectionService.ts';
import {
  bulkPutEpisodicMemories,
  bulkPutKnowledgeBoundaries,
  listEpisodicMemoriesForPersona,
  listKnowledgeBoundariesForPersona,
} from '../services/appDb.ts';

/* ── State & Actions ─────────────────────────────────────────────── */
export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'REMOVE_MESSAGE'; payload: { id: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'RESTORE_HISTORY'; payload: ChatMessage[] }
  | { type: 'IMPORT_SHARED_MOMENT'; payload: ChatMessage[] }
  /** Adds a placeholder assistant message with empty content and isStreaming=true. */
  | { type: 'ADD_STREAMING_MESSAGE'; payload: ChatMessage }
  /** Appends a chunk to the streaming message's content.
   *  If chunk === STREAM_RESET_SENTINEL, content is reset to '' instead. */
  | { type: 'UPDATE_STREAMING_MESSAGE'; payload: { id: string; chunk: string } }
  /** Replaces the current streaming message content with a sanitized value. */
  | { type: 'SET_STREAMING_MESSAGE_CONTENT'; payload: { id: string; content: string } }
  /** Marks the streaming message as finished (isStreaming → false). */
  | { type: 'FINISH_STREAMING_MESSAGE'; payload: { id: string } }
  /** Attaches extracted thoughts to an assistant message. */
  | { type: 'SET_MESSAGE_THOUGHTS'; payload: { id: string; thoughts: string } }
  /** Attaches activated lorebook entry IDs to an assistant message. */
  | { type: 'SET_MESSAGE_LOREBOOK_IDS'; payload: { id: string; entryIds: string[] } };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'REMOVE_MESSAGE':
      return { ...state, messages: state.messages.filter((m) => m.id !== action.payload.id) };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_HISTORY':
      return { ...state, messages: [], error: null };
    case 'RESTORE_HISTORY':
      return { ...state, messages: action.payload };
    case 'IMPORT_SHARED_MOMENT':
      return {
        ...state,
        messages: action.payload,
        isLoading: false,
        error: null,
      };

    case 'ADD_STREAMING_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'UPDATE_STREAMING_MESSAGE': {
      const { id, chunk } = action.payload;
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === id
            ? {
                ...m,
                // Reset sentinel wipes partial content from a failed provider.
                content: chunk === STREAM_RESET_SENTINEL ? '' : m.content + chunk,
              }
            : m,
        ),
      };
    }

    case 'SET_STREAMING_MESSAGE_CONTENT':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, content: action.payload.content } : m,
        ),
      };

    case 'FINISH_STREAMING_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, isStreaming: false } : m,
        ),
      };

    case 'SET_MESSAGE_THOUGHTS':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, thoughts: action.payload.thoughts } : m,
        ),
      };

    case 'SET_MESSAGE_LOREBOOK_IDS':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, activatedLorebookEntryIds: action.payload.entryIds } : m,
        ),
      };

    default:
      return state;
  }
}

/* ── Context ─────────────────────────────────────────────────────── */
interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  /** Async: appends user message, calls LLM, appends assistant response.
   *  Returns the visible assistant response text (empty string on failure). */
  sendMessage: (text: string) => Promise<string>;
  /** Adds a director note to chat history without triggering an LLM call. */
  addDirectorNote: (text: string) => void;
  /** Replaces chat history with an imported shared moment. */
  importSharedMoment: (moment: SharedConversationMoment) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}

/* ── Provider ────────────────────────────────────────────────────── */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { state: appState, dispatch: appDispatch } = useApp();
  const { dispatch: settingsDispatch } = useSettings();
  const {
    state: companionState,
    currentMessages,
    currentThread,
    currentThreadSummaries,
    retrievedMemories,
    activePersona,
    replaceCurrentMessages,
    setThreadAutoTitle,
    warmOllamaModel,
    currentIntimacyState,
    currentPsychologyState,
    updateIntimacyState,
    updatePsychologyState,
  } = useCompanion();

  const [state, dispatch] = useReducer(chatReducer, {
    messages: [],
    isLoading: false,
    error: null,
  });
  const hydratedThreadIdRef = useRef<string | null>(null);
  const lastAutoWarmRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!companionState.isReady || !companionState.currentThreadId) return;
    if (hydratedThreadIdRef.current === companionState.currentThreadId) return;

    hydratedThreadIdRef.current = companionState.currentThreadId;
    dispatch({ type: 'RESTORE_HISTORY', payload: currentMessages });
    dispatch({ type: 'SET_LOADING', payload: false });
    dispatch({ type: 'SET_ERROR', payload: null });
  }, [
    companionState.currentThreadId,
    companionState.isReady,
    currentMessages,
  ]);

  useEffect(() => {
    if (!companionState.isReady) return;
    if (appState.providerConfig.llm.primary !== 'ollama') return;

    const configuredModelId = resolveConfiguredLLMModelId(appState.providerConfig);
    if (!configuredModelId) return;

    const providerOptions = getProviderOptions(appState.providerConfig, 'ollama');
    const keepModelWarm = providerOptions.keepModelWarm ?? true;
    if (!keepModelWarm) return;

    const keepAlive = typeof providerOptions.keepAlive === 'string' ? providerOptions.keepAlive : '30m';
    const currentRuntime = resolveCurrentRuntimeStatus(companionState.runtimeStatuses, appState.providerConfig);
    if (!currentRuntime?.online || !currentRuntime.canWarmModels) return;

    const alreadyLoaded = currentRuntime.activeModelId === configuredModelId
      && currentRuntime.loadedModelIds.includes(configuredModelId);
    if (alreadyLoaded) {
      lastAutoWarmRequestRef.current = `${configuredModelId}:${keepAlive}`;
      return;
    }

    const requestKey = `${configuredModelId}:${keepAlive}`;
    if (lastAutoWarmRequestRef.current === requestKey) return;

    lastAutoWarmRequestRef.current = requestKey;
    void warmOllamaModel(configuredModelId, keepAlive).catch(() => {
      lastAutoWarmRequestRef.current = null;
    });
  }, [
    appState.providerConfig,
    companionState.isReady,
    companionState.runtimeStatuses,
    warmOllamaModel,
  ]);

  useEffect(() => {
    if (!companionState.isReady || !companionState.currentThreadId) return;
    if (hydratedThreadIdRef.current !== companionState.currentThreadId) return;

    void replaceCurrentMessages(state.messages);
  }, [
    companionState.currentThreadId,
    companionState.isReady,
    replaceCurrentMessages,
    state.messages,
  ]);

  /**
   * sendMessage – the streaming async orchestrator.
   *
   * Flow:
   *   1. Append user message immediately (UI feedback).
   *   2. Create an empty assistant message with isStreaming=true.
   *   3. Iterate executeLLMStream(), dispatching each chunk.
   *      The STREAM_RESET_SENTINEL is forwarded as-is; the reducer
   *      clears content when it sees it.
   *   4. Mark the assistant message as finished (isStreaming → false).
   *   5. Emit dev-mode latency metric.
   *
   * @param text - The user's typed or recognised input text.
   */
  const sendMessage = useCallback(async (text: string): Promise<string> => {
    if (!text.trim() || !companionState.currentThreadId) return '';

    // 1. Append user message immediately for snappy UI feedback.
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    let avatarRuntime = createThinkingAvatarState(appState.avatar, userMsg.content, Date.now());
    appDispatch({ type: 'SET_AVATAR_STATE', payload: avatarRuntime });

    // 2. Create the streaming assistant placeholder.
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id:          assistantId,
      role:        'assistant',
      content:     '',
      timestamp:   Date.now(),
      isStreaming: true,
    };
    dispatch({ type: 'ADD_STREAMING_MESSAGE', payload: assistantMsg });

    try {
      if (appState.providerConfig.llm.primary === 'ollama') {
        const configuredModelId = resolveConfiguredLLMModelId(appState.providerConfig);
        const providerOptions = getProviderOptions(appState.providerConfig, 'ollama');
        const keepAlive = typeof providerOptions.keepAlive === 'string' ? providerOptions.keepAlive : '30m';
        const currentRuntime = resolveCurrentRuntimeStatus(companionState.runtimeStatuses, appState.providerConfig);
        const alreadyLoaded = configuredModelId
          && currentRuntime?.activeModelId === configuredModelId
          && currentRuntime.loadedModelIds.includes(configuredModelId);

        if (configuredModelId && !alreadyLoaded) {
          await warmOllamaModel(configuredModelId, keepAlive);
        }
      }

      // Build the full history for multi-turn context.
      // We read state directly here because ADD_MESSAGE above hasn't yet
      // propagated through the reducer at this tick.

      // Resolve content system inputs
      const effectiveCeiling = resolveEffectiveContentCeiling(
        companionState.contentGateConfig,
        activePersona?.contentConfig?.contentCeiling,
        appState.providerConfig.llm.primary,
      );
      const threadIntimacy = currentIntimacyState?.intimacy ?? DEFAULT_INTIMACY_STATE;
      const threadPhysical = currentIntimacyState?.physical ?? DEFAULT_PHYSICAL_STATE;

      // Load lorebook entries and achieved milestones for prompt assembly
      const personaLorebookEntries = activePersona
        ? await listLorebookEntriesForPersona(activePersona.id)
        : [];
      const achievedMilestoneRecords = activePersona
        ? await listMilestonesForPersona(activePersona.id)
        : [];
      const achievedMilestoneIds = achievedMilestoneRecords.map((m) => m.milestoneDefId);
      // Resolve achieved milestone definitions for prompt injection
      const { DEFAULT_MILESTONES } = await import('../services/milestoneService.ts');
      const achievedMilestoneDefs: MilestoneDefinition[] = DEFAULT_MILESTONES.filter(
        (m: MilestoneDefinition) => achievedMilestoneIds.includes(m.id),
      );
      const lorebookResult = personaLorebookEntries.length > 0
        ? scanForActivatedEntries(
            personaLorebookEntries.filter((e) => e.enabled),
            [...state.messages, userMsg],
            DEFAULT_LOREBOOK_SETTINGS,
          )
        : { activatedEntries: [], authorsNote: null, totalTokens: 0, truncatedCount: 0 };

      // Extract working memory facts from conversation
      const workingFacts = extractWorkingMemoryFacts([...state.messages, userMsg]);
      const dedupedFacts = deduplicateWithLongTerm(workingFacts, retrievedMemories);

      // Load advanced memory data for prompt injection
      const [episodicMemories, knowledgeBoundaries] = activePersona
        ? await Promise.all([
            listEpisodicMemoriesForPersona(activePersona.id).catch(() => []),
            listKnowledgeBoundariesForPersona(activePersona.id).catch(() => []),
          ])
        : [[], []];
      const contradictionAlerts = retrievedMemories.length >= 2
        ? detectContradictions(retrievedMemories)
        : [];

      const history = buildPerformancePromptMessages([
        ...buildThreadPromptContext({
          persona: activePersona,
          recentMessages: keepRecentMessages([...state.messages, userMsg]),
          summaries: currentThreadSummaries,
          retrievedMemories,
          userMessage: userMsg,
          contentCeiling: effectiveCeiling,
          intimacyState: threadIntimacy,
          physicalState: threadPhysical,
          sensoryWritingConfig: activePersona?.contentConfig?.sensoryWriting,
          psychologyState: currentPsychologyState ?? undefined,
          lorebookEntries: lorebookResult.activatedEntries,
          authorsNote: lorebookResult.authorsNote ?? undefined,
          achievedMilestones: achievedMilestoneDefs,
          workingMemoryFacts: dedupedFacts,
          episodicMemories,
          knowledgeBoundaries,
          contradictionAlerts,
        }),
      ]);

      const startMs = Date.now();

      // 3. Stream loop – raw content is accumulated locally, then sanitized
      //    before syncing into the visible streaming message so hidden
      //    animation tags never leak into the chat bubble.
      let lastChunkWasReset = false;
      let rawAssistantResponse = '';
      let removedAssistantMessage = false;
      let lastVisibleContent = '';
      let finalVisibleText = '';

      for await (const chunk of executeLLMStream(
        history,
        appState.providerConfig.llm,
        undefined,                              // no one-off options override
        appState.providerConfig.providerOptions, // per-provider stored opts
      )) {
        if (chunk === STREAM_RESET_SENTINEL) {
          lastChunkWasReset = true;
          rawAssistantResponse = '';
          lastVisibleContent = '';
          avatarRuntime = createThinkingAvatarState(avatarRuntime, userMsg.content, Date.now());
          appDispatch({ type: 'SET_AVATAR_STATE', payload: avatarRuntime });
          dispatch({
            type: 'SET_STREAMING_MESSAGE_CONTENT',
            payload: { id: assistantId, content: '' },
          });
          continue;
        }

        rawAssistantResponse += chunk;
        const visibleContent = sanitizeAssistantVisibleText(rawAssistantResponse);

        if (visibleContent.trim().length > 0) {
          lastChunkWasReset = false;
          avatarRuntime = createStreamingAvatarState(
            avatarRuntime,
            userMsg.content,
            rawAssistantResponse,
            appState.avatarTuning,
            Date.now(),
          );
          appDispatch({ type: 'SET_AVATAR_STATE', payload: avatarRuntime });
        }

        if (visibleContent !== lastVisibleContent) {
          lastVisibleContent = visibleContent;
          dispatch({
            type: 'SET_STREAMING_MESSAGE_CONTENT',
            payload: { id: assistantId, content: visibleContent },
          });
        }
      }

      const finalAvatarState = createAssistantAvatarState(
        avatarRuntime,
        userMsg.content,
        rawAssistantResponse,
        appState.avatarTuning,
        Date.now(),
      );
      finalVisibleText = finalAvatarState.lastAssistantText.trim();

      if (lastChunkWasReset || finalVisibleText.length === 0) {
        dispatch({ type: 'REMOVE_MESSAGE', payload: { id: assistantId } });
        removedAssistantMessage = true;
        appDispatch({
          type: 'SET_AVATAR_STATE',
          payload: createAvatarFailureState(avatarRuntime, 'Empty assistant response', Date.now()),
        });
      } else {
        dispatch({
          type: 'SET_STREAMING_MESSAGE_CONTENT',
          payload: { id: assistantId, content: finalAvatarState.lastAssistantText },
        });
        appDispatch({ type: 'SET_AVATAR_STATE', payload: finalAvatarState });
      }

      // 4. Stream finished – update dev-mode latency metric.
      const streamLatencyMs = Date.now() - startMs;
      appDispatch({
        type: 'UPDATE_METRICS',
        payload: { lastLlmLatencyMs: streamLatencyMs },
      });

      // Record token usage for the Usage Dashboard.
      try {
        const primaryProvider = appState.providerConfig.llm.primary;
        const llmProvider = getLLMProvider(primaryProvider);
        const metrics = llmProvider.getLastMetrics();
        const inputTokens = metrics?.totalTokens
          ? Math.round(metrics.totalTokens * 0.7) // approximate 70/30 input/output split
          : estimateTokenCount(history.map((m) => m.content).join('\n'));
        const outputTokens = metrics?.totalTokens
          ? metrics.totalTokens - inputTokens
          : estimateTokenCount(rawAssistantResponse);
        const totalTokens = inputTokens + outputTokens;
        const modelId = appState.providerConfig.providerOptions?.[primaryProvider]?.model ?? primaryProvider;
        const tokPerSec = outputTokens > 0 && streamLatencyMs > 0
          ? Math.round((outputTokens / streamLatencyMs) * 1000)
          : 0;

        sessionTokenHistory.push({
          timestamp: Date.now(),
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs: streamLatencyMs,
          tokensPerSecond: tokPerSec,
          providerId: primaryProvider,
          modelId,
          contextUsageRatio: totalTokens > 0 ? Math.min(1, totalTokens / 4096) : 0,
          estimatedCostUsd: estimateRequestCost(primaryProvider, modelId, inputTokens, outputTokens),
        });
      } catch {
        // Non-critical — silently skip if metrics can't be captured
      }

      if (!removedAssistantMessage) {
        dispatch({ type: 'FINISH_STREAMING_MESSAGE', payload: { id: assistantId } });

        // Extract and attach any <think> content from the raw response.
        const { thoughts } = parseThinkTags(rawAssistantResponse);
        if (thoughts) {
          dispatch({ type: 'SET_MESSAGE_THOUGHTS', payload: { id: assistantId, thoughts } });
        }

        // Attach activated lorebook entry IDs to the assistant message.
        if (lorebookResult.activatedEntries.length > 0) {
          dispatch({
            type: 'SET_MESSAGE_LOREBOOK_IDS',
            payload: { id: assistantId, entryIds: lorebookResult.activatedEntries.map((e) => e.id) },
          });
        }

        // Auto-dismiss the setup wizard after the first successful exchange
        if (!appState.setupComplete) {
          appDispatch({ type: 'SET_SETUP_COMPLETE', payload: true });
          settingsDispatch({ type: 'CLOSE_WIZARD' });
        }

        if (
          currentThread &&
          currentThread.id === companionState.currentThreadId &&
          currentThread.titleSource !== 'manual'
        ) {
          const nextMessages = [
            ...state.messages,
            userMsg,
            {
              id: assistantId,
              role: 'assistant' as const,
              content: finalAvatarState.lastAssistantText,
              timestamp: Date.now(),
            },
          ];

          const hasFirstExchange = nextMessages.some((message) => message.role === 'assistant' && message.content.trim().length > 0);
          const shouldAttemptAutoTitle = currentThread.title === 'New conversation' || currentThread.titleSource !== 'manual';

          if (hasFirstExchange && shouldAttemptAutoTitle) {
            const llmTitle = await generateThreadTitleWithLLM(
              currentThread,
              nextMessages,
              activePersona,
              appState.providerConfig,
            );

            if (llmTitle) {
              await setThreadAutoTitle(currentThread.id, llmTitle, 'llm');
            } else {
              const heuristicTitle = buildHeuristicThreadTitle(nextMessages);
              if (heuristicTitle) {
                await setThreadAutoTitle(currentThread.id, heuristicTitle, 'heuristic');
              } else {
                await setThreadAutoTitle(currentThread.id, buildTimestampThreadTitle(Date.now()), 'timestamp');
              }
            }
          }
        }
      }

      // ── Post-response evaluation: intimacy tracking ──
      if (!removedAssistantMessage && companionState.currentThreadId && activePersona) {
        const updatedIntimacy = evaluateIntimacyShift(
          threadIntimacy,
          userMsg.content,
          finalAvatarState.lastAssistantText,
          effectiveCeiling,
          currentPsychologyState?.phase,
        );
        const updatedPhysical = updatePhysicalState(
          threadPhysical,
          userMsg.content,
          finalAvatarState.lastAssistantText,
        );
        void updateIntimacyState(
          companionState.currentThreadId,
          activePersona.id,
          updatedIntimacy,
          updatedPhysical,
        );

        // ── Post-response evaluation: psychology engine ──
        const currentPsych = currentPsychologyState
          ?? createInitialPsychologyState(companionState.currentThreadId, activePersona);

        const { state: updatedPsychState } = evaluateConversationTurn(
          currentPsych,
          userMsg.content,
          finalAvatarState.lastAssistantText,
          activePersona,
        );
        void updatePsychologyState(
          companionState.currentThreadId,
          activePersona.id,
          updatedPsychState,
        );

        // ── Post-response evaluation: milestone checking ──
        const stats = computeRelationshipStats(updatedPsychState, updatedIntimacy.level);
        const existingMilestones = await listMilestonesForPersona(activePersona.id);
        const achievedIds = existingMilestones.map((m) => m.milestoneDefId);
        const newMilestones = checkMilestones(stats, achievedIds);

        for (const milestone of newMilestones) {
          const record: MilestoneRecord = {
            id: `milestone-${Date.now()}-${milestone.id}`,
            personaId: activePersona.id,
            milestoneDefId: milestone.id,
            achievedAt: Date.now(),
            threadId: companionState.currentThreadId,
          };
          void putMilestone(record);
        }

        // ── Post-response evaluation: episodic memory detection ──
        try {
          const allMessages = [
            ...state.messages,
            userMsg,
            { id: assistantId, role: 'assistant' as const, content: finalAvatarState.lastAssistantText, timestamp: Date.now() },
          ];
          const episodicMoments = detectEpisodicMoments(allMessages, activePersona.id, companionState.currentThreadId);
          if (episodicMoments.length > 0) {
            void bulkPutEpisodicMemories(episodicMoments);
          }
        } catch {
          // Non-critical — episodic detection failure should not block the conversation
        }

        // ── Post-response evaluation: knowledge boundary scanning ──
        try {
          const existingBoundaries = await listKnowledgeBoundariesForPersona(activePersona.id);
          const allUserMessages = [...state.messages, userMsg].filter((m) => m.role === 'user');
          const kbUpdates = scanForKnowledgeUpdates(allUserMessages, existingBoundaries, activePersona.id);
          if (kbUpdates.length > 0) {
            void bulkPutKnowledgeBoundaries(kbUpdates);
          }
        } catch {
          // Non-critical — knowledge scanning failure should not block the conversation
        }
      }

      return finalVisibleText;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error from LLM';
      dispatch({ type: 'SET_ERROR', payload: message });
      dispatch({ type: 'REMOVE_MESSAGE', payload: { id: assistantId } });
      appDispatch({
        type: 'SET_AVATAR_STATE',
        payload: createAvatarFailureState(avatarRuntime, `LLM error: ${message}`, Date.now()),
      });
      console.warn('[AnimeGirly Chat] Stream error, avatar state reset to failure:', message);
      return '';
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });

      // Safety net: if the avatar is still stuck in a streaming/thinking phase
      // after the LLM call completes (success or failure), force it to settle.
      // This prevents the avatar from freezing mid-expression on unexpected
      // stream interruptions, network drops, or unhandled edge cases.
      const currentAvatarPhase = appState.avatar.phase;
      if (currentAvatarPhase === 'thinking' || currentAvatarPhase === 'speaking') {
        // Only reset if it's still in an active phase — if the normal flow
        // already set it to idle/settling/reacting, leave it alone.
        const timeSincePhaseStart = Date.now() - appState.avatar.phaseStartedAt;
        if (timeSincePhaseStart > 30_000) {
          // 30+ seconds stuck in thinking/speaking is a clear sign of a stuck state
          appDispatch({
            type: 'SET_AVATAR_STATE',
            payload: createAvatarFailureState(
              appState.avatar,
              'Avatar state safety reset (stuck phase)',
              Date.now(),
            ),
          });
          console.warn('[AnimeGirly Chat] Avatar stuck in phase for >30s, force-resetting.');
        }
      }
    }
  }, [
    companionState.currentThreadId,
    companionState.contentGateConfig,
    currentThread,
    currentThreadSummaries,
    retrievedMemories,
    activePersona,
    state.messages,
    appState.avatar,
    appState.avatarTuning,
    appState.providerConfig,
    appState.providerConfig.llm,
    appDispatch,
    companionState.runtimeStatuses,
    setThreadAutoTitle,
    warmOllamaModel,
    currentIntimacyState,
    currentPsychologyState,
    updateIntimacyState,
    updatePsychologyState,
  ]);

  /**
   * addDirectorNote – Adds a director stage direction to the chat history.
   *
   * Director notes:
   *   - Appear in the message list with role 'director'.
   *   - Are rendered with a distinct centered cinematic style.
   *   - Are injected into the LLM prompt as system-level instructions
   *     the next time the user sends a normal message.
   *   - Do NOT trigger an LLM response on their own.
   */
  const addDirectorNote = useCallback((text: string) => {
    if (!text.trim()) return;
    const directorMsg: ChatMessage = {
      id: `director-${Date.now()}`,
      role: 'director',
      content: text.trim(),
      timestamp: Date.now(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: directorMsg });
  }, []);

  const importSharedMoment = useCallback((moment: SharedConversationMoment) => {
    dispatch({
      type: 'IMPORT_SHARED_MOMENT',
      payload: createImportedMessagesFromSharedMoment(moment),
    });
  }, []);

  return (
    <ChatContext.Provider value={{ state, dispatch, sendMessage, addDirectorNote, importSharedMoment }}>
      {children}
    </ChatContext.Provider>
  );
}
