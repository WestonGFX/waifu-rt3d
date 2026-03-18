import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type ChatMessage, type ThemePreference } from '../types/index.ts';
import {
  type ChatThread,
  type CompanionSnapshot,
  type HelperCapabilities,
  type HelperHealth,
  type HelperJobRecord,
  type MemoryRecord,
  type MemoryPreferences,
  type ModelCatalogEntry,
  type PersonaProfile,
  type RenderSettings,
  type RuntimeStatus,
  type SecretStatusResponse,
  type TTSProviderDescriptor,
  type TTSVoiceDescriptor,
  type TTSVoiceProfile,
  type ThreadMessageRecord,
  type ThreadSummaryRecord,
} from '../types/companion.ts';
import {
  DEFAULT_HELPER_BASE_URL,
  createInstallJob,
  deleteProviderSecret as deleteProviderSecretRequest,
  fetchHelperCapabilities,
  createOfflineHelperHealth,
  fetchHelperHealth,
  fetchJobs,
  fetchModelCatalog,
  fetchSecretStatus,
  removeInstalledModel as removeInstalledModelRequest,
  fetchRuntimeStatuses,
  setProviderSecret as setProviderSecretRequest,
  fetchTTSProviders,
  fetchTTSVoices,
  unloadOllamaModels as unloadOllamaModelsRequest,
  warmOllamaModel as warmOllamaModelRequest,
} from '../services/helperClient.ts';
import {
  bulkPutPersonas,
  bulkPutMemoryRecords,
  deleteThreadCascade,
  deleteMemoryRecord as deleteMemoryRecordFromDb,
  deleteThreadSummary,
  getIntimacyState as getIntimacyStateFromDb,
  getPsychologyState as getPsychologyStateFromDb,
  getSetting,
  listMemoryRecords,
  listMessagesForThread,
  listPersonas,
  listThreadSummariesForThread,
  listThreads,
  listVoiceProfiles,
  putIntimacyState as putIntimacyStateToDb,
  putMemoryRecord,
  putPsychologyState as putPsychologyStateToDb,
  putThreadSummary,
  putPersona,
  putSetting,
  putThread,
  putVoiceProfile,
  replaceMessagesForThread,
} from '../services/appDb.ts';
import { migrateLegacyStateIfNeeded } from '../services/legacyMigrationService.ts';
import { DEFAULT_RENDER_SETTINGS } from '../services/renderProfiles.ts';
import { getDefaultPersonaPresets } from '../services/personaPresets.ts';
import { getDefaultVoiceProfiles } from '../services/voiceProfileService.ts';
import { fetchBackendPersonas, isBackendPersona } from '../services/backendCharacterBridge.ts';
import {
  buildMemoryRecords,
  buildThreadSummaryRecord,
  selectRetrievedMemories,
  selectRetrievedMemoriesSemantic,
} from '../services/memoryHeuristicsService.ts';
import {
  extractWorkingMemoryFacts,
  deduplicateWithLongTerm,
  type WorkingMemoryFact,
} from '../services/workingMemoryService.ts';
import {
  generateEmbedding,
  isEmbeddingAvailable,
} from '../services/embeddingService.ts';
import {
  estimateMessageTokens,
  shouldCompactContext,
} from '../services/promptAssemblyService.ts';
import {
  type ContentGateConfig,
  type IntimacyState,
  type IntimacyStateRecord,
  type PhysicalState,
  DEFAULT_CONTENT_GATE_CONFIG,
} from '../types/content.ts';
import {
  type PsychologyState,
  type PsychologyStateRecord,
} from '../types/psychology.ts';

interface CompanionState extends CompanionSnapshot {
  isReady: boolean;
  helperBaseUrl: string;
  helperHealth: HelperHealth;
  helperCapabilities: HelperCapabilities | null;
  secretStatus: SecretStatusResponse | null;
  runtimeStatuses: RuntimeStatus[];
  ttsProviders: TTSProviderDescriptor[];
  ttsVoices: TTSVoiceDescriptor[];
  modelCatalog: ModelCatalogEntry[];
  jobs: HelperJobRecord[];
  isRefreshingHelper: boolean;
  /** Global content gating configuration. */
  contentGateConfig: ContentGateConfig;
  /** Per-thread intimacy state, keyed by thread ID. */
  intimacyStatesByThread: Record<string, { intimacy: IntimacyState; physical: PhysicalState }>;
  /** Per-thread psychology state, keyed by thread ID. */
  psychologyStatesByThread: Record<string, PsychologyState>;
}

interface CompanionContextValue {
  state: CompanionState;
  currentThread: ChatThread | null;
  currentMessages: ChatMessage[];
  currentThreadSummaries: ThreadSummaryRecord[];
  retrievedMemories: MemoryRecord[];
  workingMemoryFacts: WorkingMemoryFact[];
  activePersona: PersonaProfile | null;
  activeVoiceProfile: TTSVoiceProfile | null;
  createThread: (overrides?: Partial<Pick<ChatThread, 'title' | 'personaId' | 'voiceProfileId'>>) => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  setThreadAutoTitle: (threadId: string, title: string, source: 'llm' | 'heuristic' | 'timestamp') => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  replaceCurrentMessages: (messages: ChatMessage[]) => Promise<void>;
  setCurrentPersona: (personaId: string) => Promise<void>;
  savePersona: (persona: PersonaProfile) => Promise<void>;
  setPersonaThemePreference: (personaId: string, themePreference?: ThemePreference) => Promise<void>;
  resetPersonaThemesToAppDefault: () => Promise<void>;
  setCurrentVoiceProfile: (voiceProfileId: string) => Promise<void>;
  saveVoiceProfile: (voiceProfile: TTSVoiceProfile) => Promise<void>;
  updateRenderSettings: (settings: Partial<RenderSettings>) => Promise<void>;
  updateMemoryPreferences: (preferences: Partial<MemoryPreferences>) => Promise<void>;
  deleteMemoryRecord: (memoryId: string) => Promise<void>;
  saveMemoryRecord: (memory: MemoryRecord) => Promise<void>;
  setHelperBaseUrl: (baseUrl: string) => Promise<void>;
  refreshHelperData: () => Promise<void>;
  startInstallJob: (modelId: string, source?: string) => Promise<void>;
  removeInstalledModel: (modelId: string) => Promise<void>;
  saveProviderSecret: (providerId: string, secret: string) => Promise<void>;
  deleteProviderSecret: (providerId: string) => Promise<void>;
  warmOllamaModel: (modelId: string, keepAlive?: string) => Promise<string>;
  unloadOllamaModels: () => Promise<string>;
  /** Current thread's intimacy state. */
  currentIntimacyState: { intimacy: IntimacyState; physical: PhysicalState } | null;
  /** Current thread's psychology state. */
  currentPsychologyState: PsychologyState | null;
  /** Update the global content gate config. */
  updateContentGateConfig: (config: ContentGateConfig) => Promise<void>;
  /** Update intimacy state for the current thread. */
  updateIntimacyState: (threadId: string, personaId: string, intimacy: IntimacyState, physical: PhysicalState) => Promise<void>;
  /** Update psychology state for the current thread. */
  updatePsychologyState: (threadId: string, personaId: string, psychState: PsychologyState) => Promise<void>;
}

const DEFAULT_PERSONAS = getDefaultPersonaPresets();
const DEFAULT_VOICE_PROFILES = getDefaultVoiceProfiles();
const FALLBACK_THREAD: ChatThread = {
  id: 'thread-bootstrap',
  title: 'New conversation',
  titleSource: 'timestamp',
  personaId: DEFAULT_PERSONAS[0].id,
  voiceProfileId: DEFAULT_VOICE_PROFILES[0].id,
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  summaryVersion: 0,
  promptSnapshotId: 'prompt-bootstrap',
};

const FALLBACK_MEMORY_PREFERENCES: MemoryPreferences = {
  mode: 'thread-only',
  showUsageHints: true,
  longTermEnabled: false,
};

const FALLBACK_TTS_PROVIDERS: TTSProviderDescriptor[] = [
  {
    providerId: 'edge-tts',
    label: 'Edge TTS',
    local: false,
    requiresInstall: false,
    requiresApiKey: false,
    supportsStreaming: false,
    supportsPreview: true,
    recommended: true,
    qualityTier: 'balanced',
    available: false,
    installState: 'runtime-missing',
    docsUrl: 'https://github.com/rany2/edge-tts',
  },
  {
    providerId: 'webSpeech',
    label: 'Browser Speech',
    local: false,
    requiresInstall: false,
    requiresApiKey: false,
    supportsStreaming: false,
    supportsPreview: true,
    recommended: false,
    qualityTier: 'legacy',
    available: true,
    installState: 'legacy',
  },
];

const CompanionContext = createContext<CompanionContextValue | undefined>(undefined);

function toThreadMessages(threadId: string, messages: ChatMessage[]): ThreadMessageRecord[] {
  return messages.map((message) => ({
    ...message,
    threadId,
  }));
}

function areChatMessagesEqual(left: ChatMessage[], right: ChatMessage[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((message, index) => {
    const other = right[index];
    return (
      message.id === other.id &&
      message.role === other.role &&
      message.content === other.content &&
      message.timestamp === other.timestamp &&
      message.isStreaming === other.isStreaming
    );
  });
}

export function useCompanion(): CompanionContextValue {
  const context = useContext(CompanionContext);
  if (!context) throw new Error('useCompanion must be used inside <CompanionProvider>');
  return context;
}

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CompanionState>({
    isReady: false,
    threads: [FALLBACK_THREAD],
    currentThreadId: FALLBACK_THREAD.id,
    messagesByThread: { [FALLBACK_THREAD.id]: [] },
    summariesByThread: { [FALLBACK_THREAD.id]: [] },
    memoryRecords: [],
    personas: DEFAULT_PERSONAS,
    currentPersonaId: DEFAULT_PERSONAS[0].id,
    voiceProfiles: DEFAULT_VOICE_PROFILES,
    currentVoiceProfileId: DEFAULT_VOICE_PROFILES[0].id,
    renderSettings: DEFAULT_RENDER_SETTINGS,
    memoryPreferences: FALLBACK_MEMORY_PREFERENCES,
    helperBaseUrl: DEFAULT_HELPER_BASE_URL,
    helperHealth: createOfflineHelperHealth('Helper has not been checked yet.'),
    helperCapabilities: null,
    secretStatus: null,
    runtimeStatuses: [],
    ttsProviders: FALLBACK_TTS_PROVIDERS,
    ttsVoices: [],
    modelCatalog: [],
    jobs: [],
    isRefreshingHelper: false,
    contentGateConfig: DEFAULT_CONTENT_GATE_CONFIG,
    intimacyStatesByThread: {},
    psychologyStatesByThread: {},
  });

  const hydrate = useCallback(async () => {
    await migrateLegacyStateIfNeeded();

    const [
      threads,
      personas,
      voiceProfiles,
      currentThreadId,
      currentPersonaId,
      currentVoiceProfileId,
      renderSettings,
      memoryPreferences,
      helperBaseUrl,
      memoryRecords,
      contentGateConfig,
    ] = await Promise.all([
      listThreads(),
      listPersonas(),
      listVoiceProfiles(),
      getSetting<string>('current_thread_id'),
      getSetting<string>('current_persona_id'),
      getSetting<string>('current_voice_profile_id'),
      getSetting<RenderSettings>('render_settings'),
      getSetting<MemoryPreferences>('memory_preferences'),
      getSetting<string>('helper_base_url'),
      listMemoryRecords(),
      getSetting<ContentGateConfig>('content_gate_config'),
    ]);

    const safeThreads = (threads.length > 0 ? threads : [FALLBACK_THREAD]).map((thread) => ({
      ...thread,
      titleSource: thread.titleSource ?? (thread.title === 'New conversation' ? 'timestamp' : 'heuristic'),
    }));

    // Try to fetch backend characters non-blocking — returns [] if the backend
    // is unreachable so hydration always completes in offline mode.
    const backendPersonas = await fetchBackendPersonas();

    const mergedPersonas = [
      // 1. Backend characters are the canonical source — they appear first so
      //    the active persona defaults to the first backend character when present.
      //    Any user customisations persisted in IndexedDB (rawPromptOverride,
      //    defaultVoiceProfileId) are layered on top of the live backend data.
      ...backendPersonas.map((bp) => {
        const persisted = personas.find((p) => p.id === bp.id);
        if (!persisted) return bp;
        return {
          ...bp,
          rawPromptOverride: persisted.rawPromptOverride ?? bp.rawPromptOverride,
          defaultVoiceProfileId: persisted.defaultVoiceProfileId ?? bp.defaultVoiceProfileId,
        };
      }),
      // 2. Girly's built-in preset personas — offline fallback. Filtered to
      //    exclude any preset whose ID is shadowed by a backend character (no
      //    collisions expected, but guards against future ID changes).
      ...DEFAULT_PERSONAS
        .filter((defaultPersona) => !backendPersonas.some((bp) => bp.id === defaultPersona.id))
        .map((defaultPersona) => {
          const persistedPersona = personas.find((persona) => persona.id === defaultPersona.id);
          if (!persistedPersona) return defaultPersona;

          const isLegacyStockPersona = !persistedPersona.dereTypes || !persistedPersona.tagline || !persistedPersona.backstory;
          if (isLegacyStockPersona) {
            return {
              ...defaultPersona,
              rawPromptOverride: persistedPersona.rawPromptOverride,
              defaultVoiceProfileId: persistedPersona.defaultVoiceProfileId ?? defaultPersona.defaultVoiceProfileId,
              createdAt: persistedPersona.createdAt ?? defaultPersona.createdAt,
              updatedAt: Math.max(persistedPersona.updatedAt ?? 0, defaultPersona.updatedAt),
            };
          }

          return { ...defaultPersona, ...persistedPersona };
        }),
      // 3. User-created custom personas — not a preset, not a backend character.
      ...personas
        .filter(
          (persona) =>
            !DEFAULT_PERSONAS.some((defaultPersona) => defaultPersona.id === persona.id) &&
            !isBackendPersona(persona.id),
        )
        .map((persona) => ({
          ...DEFAULT_PERSONAS[0],
          ...persona,
          dereTypes: persona.dereTypes ?? DEFAULT_PERSONAS[0].dereTypes,
          tagline: persona.tagline ?? `${persona.name} is still being fully defined.`,
          shortBio: persona.shortBio ?? persona.toneGuide,
          backstory: persona.backstory ?? persona.worldSetting,
          characterFacts: persona.characterFacts ?? [],
        })),
    ];

    const shouldPersistMergedPersonas =
      mergedPersonas.length !== personas.length ||
      mergedPersonas.some((persona, index) => {
        const previousPersona = personas[index];
        return !previousPersona || JSON.stringify(previousPersona) !== JSON.stringify(persona);
      });

    if (shouldPersistMergedPersonas) {
      await bulkPutPersonas(mergedPersonas);
    }

    const mergedVoiceProfiles = [
      ...DEFAULT_VOICE_PROFILES.map((defaultProfile) => {
        const persistedProfile = voiceProfiles.find((profile) => profile.id === defaultProfile.id);
        return persistedProfile ? { ...defaultProfile, ...persistedProfile } : defaultProfile;
      }),
      ...voiceProfiles.filter((profile) => !DEFAULT_VOICE_PROFILES.some((defaultProfile) => defaultProfile.id === profile.id)),
    ];

    const shouldPersistMergedVoiceProfiles =
      mergedVoiceProfiles.length !== voiceProfiles.length ||
      mergedVoiceProfiles.some((profile, index) => {
        const previousProfile = voiceProfiles[index];
        return !previousProfile || JSON.stringify(previousProfile) !== JSON.stringify(profile);
      });

    if (shouldPersistMergedVoiceProfiles) {
      await Promise.all(mergedVoiceProfiles.map(async (profile) => putVoiceProfile(profile)));
    }

    const messagesByThread = Object.fromEntries(
      await Promise.all(
        safeThreads.map(async (thread) => [
          thread.id,
          (await listMessagesForThread(thread.id)).map((messageRecord) => ({
            id: messageRecord.id,
            role: messageRecord.role,
            content: messageRecord.content,
            timestamp: messageRecord.timestamp,
            isStreaming: messageRecord.isStreaming,
          })),
        ]),
      ),
    ) as Record<string, ChatMessage[]>;
    const summariesByThread = Object.fromEntries(
      await Promise.all(
        safeThreads.map(async (thread) => [
          thread.id,
          await listThreadSummariesForThread(thread.id),
        ]),
      ),
    ) as Record<string, ThreadSummaryRecord[]>;

    setState((previous) => ({
      ...previous,
      isReady: true,
      threads: safeThreads,
      currentThreadId: currentThreadId && safeThreads.some((thread) => thread.id === currentThreadId)
        ? currentThreadId
        : safeThreads[0].id,
      messagesByThread,
      summariesByThread,
      memoryRecords,
      personas: mergedPersonas,
      currentPersonaId: currentPersonaId && mergedPersonas.some((persona) => persona.id === currentPersonaId)
        ? currentPersonaId
        : (mergedPersonas[0]?.id ?? DEFAULT_PERSONAS[0].id),
      voiceProfiles: mergedVoiceProfiles.length > 0 ? mergedVoiceProfiles : DEFAULT_VOICE_PROFILES,
      currentVoiceProfileId:
        currentVoiceProfileId && mergedVoiceProfiles.some((profile) => profile.id === currentVoiceProfileId)
          ? currentVoiceProfileId
          : (mergedVoiceProfiles[0]?.id ?? DEFAULT_VOICE_PROFILES[0].id),
      renderSettings: renderSettings ?? DEFAULT_RENDER_SETTINGS,
      memoryPreferences: memoryPreferences ?? FALLBACK_MEMORY_PREFERENCES,
      helperBaseUrl: helperBaseUrl ?? DEFAULT_HELPER_BASE_URL,
      contentGateConfig: contentGateConfig ?? DEFAULT_CONTENT_GATE_CONFIG,
    }));
  }, []);

  const refreshHelperData = useCallback(async () => {
    setState((previous) => ({ ...previous, isRefreshingHelper: true }));

    try {
      const [helperHealth, helperCapabilities, secretStatus, runtimeStatuses, ttsProviders, ttsVoices, modelCatalog, jobs] = await Promise.all([
        fetchHelperHealth(state.helperBaseUrl),
        fetchHelperCapabilities(state.helperBaseUrl),
        fetchSecretStatus(state.helperBaseUrl),
        fetchRuntimeStatuses(state.helperBaseUrl),
        fetchTTSProviders(state.helperBaseUrl),
        fetchTTSVoices(state.helperBaseUrl),
        fetchModelCatalog(state.helperBaseUrl),
        fetchJobs(state.helperBaseUrl),
      ]);

      setState((previous) => ({
        ...previous,
        helperHealth,
        helperCapabilities,
        secretStatus,
        runtimeStatuses,
        ttsProviders,
        ttsVoices,
        modelCatalog,
        jobs,
        isRefreshingHelper: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Helper unavailable';
      setState((previous) => ({
        ...previous,
        helperHealth: createOfflineHelperHealth(message),
        helperCapabilities: null,
        secretStatus: null,
        runtimeStatuses: [],
        ttsProviders: FALLBACK_TTS_PROVIDERS,
        ttsVoices: [],
        modelCatalog: [],
        jobs: [],
        isRefreshingHelper: false,
      }));
    }
  }, [state.helperBaseUrl]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!state.isReady) return;
    void refreshHelperData();
  }, [state.isReady, refreshHelperData]);

  const currentThread = useMemo(
    () => state.threads.find((thread) => thread.id === state.currentThreadId) ?? null,
    [state.threads, state.currentThreadId],
  );

  const currentMessages = useMemo(
    () => (currentThread ? state.messagesByThread[currentThread.id] ?? [] : []),
    [currentThread, state.messagesByThread],
  );
  const currentThreadSummaries = useMemo(
    () => (currentThread ? state.summariesByThread[currentThread.id] ?? [] : []),
    [currentThread, state.summariesByThread],
  );

  const activePersona = state.personas.find((persona) => persona.id === state.currentPersonaId) ?? null;
  const activeVoiceProfile = state.voiceProfiles.find((profile) => profile.id === state.currentVoiceProfileId) ?? null;
  // Semantic embedding for the latest user message (cached by content)
  const latestUserContent = useMemo(() => {
    const latest = [...currentMessages].reverse().find((m) => m.role === 'user');
    return latest?.content ?? '';
  }, [currentMessages]);

  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);

  useEffect(() => {
    if (!latestUserContent || state.memoryPreferences.mode === 'disabled') {
      setQueryEmbedding(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const available = await isEmbeddingAvailable();
      if (!available || cancelled) return;
      try {
        const embedding = await generateEmbedding(latestUserContent);
        if (!cancelled) setQueryEmbedding(embedding);
      } catch {
        // Embedding unavailable — semantic retrieval will fall back to token overlap
      }
    })();
    return () => { cancelled = true; };
  }, [latestUserContent, state.memoryPreferences.mode]);

  const retrievedMemories = useMemo(() => {
    if (!currentThread || !activePersona || state.memoryPreferences.mode === 'disabled') return [];
    const records = state.memoryRecords.filter((record) => (
      record.personaId === activePersona.id &&
      (record.threadId === currentThread.id || state.memoryPreferences.longTermEnabled)
    ));
    // Use semantic retrieval when a query embedding is available; falls back to token overlap
    return selectRetrievedMemoriesSemantic(records, currentMessages, queryEmbedding, 5);
  }, [
    activePersona,
    currentMessages,
    currentThread,
    queryEmbedding,
    state.memoryPreferences.longTermEnabled,
    state.memoryPreferences.mode,
    state.memoryRecords,
  ]);

  // Working memory: extract short-term facts from current conversation
  const workingMemoryFacts: WorkingMemoryFact[] = useMemo(() => {
    if (!currentThread || state.memoryPreferences.mode === 'disabled') return [];
    const rawFacts = extractWorkingMemoryFacts(currentMessages);
    // Deduplicate against long-term memories to avoid redundant injection
    const personaRecords = activePersona
      ? state.memoryRecords.filter((r) => r.personaId === activePersona.id)
      : [];
    return deduplicateWithLongTerm(rawFacts, personaRecords);
  }, [activePersona, currentMessages, currentThread, state.memoryPreferences.mode, state.memoryRecords]);

  const selectThread = useCallback(async (threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;

    setState((previous) => ({
      ...previous,
      currentThreadId: threadId,
      currentPersonaId: thread.personaId,
      currentVoiceProfileId: thread.voiceProfileId,
    }));

    await putSetting('current_thread_id', threadId);
    await putSetting('current_persona_id', thread.personaId);
    await putSetting('current_voice_profile_id', thread.voiceProfileId);
  }, [state.threads]);

  const createThread = useCallback(async (
    overrides: Partial<Pick<ChatThread, 'title' | 'personaId' | 'voiceProfileId'>> = {},
  ) => {
    const now = Date.now();
    const thread: ChatThread = {
      id: `thread-${now}`,
      title: overrides.title?.trim() || 'New conversation',
      titleSource: overrides.title?.trim() ? 'manual' : 'timestamp',
      personaId: overrides.personaId ?? state.currentPersonaId,
      voiceProfileId: overrides.voiceProfileId ?? state.currentVoiceProfileId,
      archived: false,
      createdAt: now,
      updatedAt: now,
      summaryVersion: 0,
      promptSnapshotId: `prompt-${now}`,
    };

    setState((previous) => ({
      ...previous,
      threads: [thread, ...previous.threads],
      currentThreadId: thread.id,
      currentPersonaId: thread.personaId,
      currentVoiceProfileId: thread.voiceProfileId,
      messagesByThread: {
        ...previous.messagesByThread,
        [thread.id]: [],
      },
      summariesByThread: {
        ...previous.summariesByThread,
        [thread.id]: [],
      },
    }));

    await putThread(thread);
    await putSetting('current_thread_id', thread.id);
    await putSetting('current_persona_id', thread.personaId);
    await putSetting('current_voice_profile_id', thread.voiceProfileId);
  }, [state.currentPersonaId, state.currentVoiceProfileId]);

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    let updatedThread: ChatThread | null = null;
    setState((previous) => ({
      ...previous,
      threads: previous.threads.map((thread) => {
        if (thread.id !== threadId) return thread;
        updatedThread = { ...thread, title: nextTitle, titleSource: 'manual', updatedAt: Date.now() };
        return updatedThread;
      }),
    }));

    if (updatedThread) await putThread(updatedThread);
  }, []);

  const setThreadAutoTitle = useCallback(async (
    threadId: string,
    title: string,
    source: 'llm' | 'heuristic' | 'timestamp',
  ) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    let updatedThread: ChatThread | null = null;
    setState((previous) => ({
      ...previous,
      threads: previous.threads.map((thread) => {
        if (thread.id !== threadId || thread.titleSource === 'manual') return thread;
        updatedThread = {
          ...thread,
          title: nextTitle,
          titleSource: source,
          updatedAt: Date.now(),
        };
        return updatedThread;
      }),
    }));

    if (updatedThread) await putThread(updatedThread);
  }, []);

  const archiveThread = useCallback(async (threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;

    const archivedThread = {
      ...thread,
      archived: !thread.archived,
      updatedAt: Date.now(),
    };

    const nextThreads = state.threads.map((candidate) => (
      candidate.id === threadId ? archivedThread : candidate
    ));
    const nextCurrentThread = archivedThread.archived && state.currentThreadId === threadId
      ? nextThreads.find((candidate) => !candidate.archived)?.id ?? state.currentThreadId
      : state.currentThreadId;

    setState((previous) => ({
      ...previous,
      threads: nextThreads,
      currentThreadId: nextCurrentThread,
    }));

    await putThread(archivedThread);
    if (nextCurrentThread) {
      await putSetting('current_thread_id', nextCurrentThread);
    }
  }, [state.currentThreadId, state.threads]);

  const deleteThread = useCallback(async (threadId: string) => {
    const existing = state.threads.find((thread) => thread.id === threadId);
    if (!existing) return;

    const remainingThreads = state.threads.filter((thread) => thread.id !== threadId);
    const activeFallback = remainingThreads.find((thread) => !thread.archived) ?? remainingThreads[0] ?? null;
    let createdThread: ChatThread | null = null;

    setState((previous) => {
      const nextThreads = previous.threads.filter((thread) => thread.id !== threadId);
      const fallbackThread = nextThreads.find((thread) => !thread.archived) ?? nextThreads[0] ?? null;

      if (!fallbackThread) {
        const now = Date.now();
        createdThread = {
          id: `thread-${now}`,
          title: 'New conversation',
          titleSource: 'timestamp',
          personaId: previous.currentPersonaId,
          voiceProfileId: previous.currentVoiceProfileId,
          archived: false,
          createdAt: now,
          updatedAt: now,
          summaryVersion: 0,
          promptSnapshotId: `prompt-${now}`,
        };
      }

      const selectedThread = fallbackThread ?? createdThread;
      if (!selectedThread) return previous;

      return {
        ...previous,
        threads: selectedThread === createdThread ? [createdThread!, ...nextThreads] : nextThreads,
        currentThreadId: previous.currentThreadId === threadId ? selectedThread.id : previous.currentThreadId,
        currentPersonaId: previous.currentThreadId === threadId ? selectedThread.personaId : previous.currentPersonaId,
        currentVoiceProfileId: previous.currentThreadId === threadId ? selectedThread.voiceProfileId : previous.currentVoiceProfileId,
        messagesByThread: Object.fromEntries(
          Object.entries(previous.messagesByThread).filter(([candidateThreadId]) => candidateThreadId !== threadId),
        ),
        summariesByThread: Object.fromEntries(
          Object.entries(previous.summariesByThread).filter(([candidateThreadId]) => candidateThreadId !== threadId),
        ),
        memoryRecords: previous.memoryRecords.filter((record) => record.threadId !== threadId),
      };
    });

    await deleteThreadCascade(threadId);

    if (!remainingThreads.length && createdThread) {
      await putThread(createdThread);
      await putSetting('current_thread_id', createdThread.id);
      await putSetting('current_persona_id', createdThread.personaId);
      await putSetting('current_voice_profile_id', createdThread.voiceProfileId);
      return;
    }

    if (state.currentThreadId === threadId && activeFallback) {
      await putSetting('current_thread_id', activeFallback.id);
      await putSetting('current_persona_id', activeFallback.personaId);
      await putSetting('current_voice_profile_id', activeFallback.voiceProfileId);
    }
  }, [state.currentPersonaId, state.currentThreadId, state.currentVoiceProfileId, state.threads]);

  const replaceCurrentMessages = useCallback(async (messages: ChatMessage[]) => {
    const threadId = state.currentThreadId;
    if (!threadId) return;

    const updatedAt = messages[messages.length - 1]?.timestamp ?? Date.now();
    let nextThreadRecord: ChatThread | null = null;
    let shouldPersist = false;
    let nextSummaryRecord: ThreadSummaryRecord | null = null;
    let memoryRecordsToInsert: MemoryRecord[] = [];

    setState((previous) => {
      const previousMessages = previous.messagesByThread[threadId] ?? [];
      if (areChatMessagesEqual(previousMessages, messages)) {
        return previous;
      }

      shouldPersist = true;
      const currentThreadRecord = previous.threads.find((thread) => thread.id === threadId) ?? null;
      nextThreadRecord = currentThreadRecord
        ? {
            ...currentThreadRecord,
            updatedAt,
          }
        : null;
      if (nextThreadRecord) {
        const summaryVersion = nextThreadRecord.summaryVersion + 1;
        const shouldSummarize = shouldCompactContext(4096, estimateMessageTokens(messages), messages.length) || messages.length >= 12;
        const generatedSummary = shouldSummarize
          ? buildThreadSummaryRecord(threadId, messages, summaryVersion)
          : null;
        nextSummaryRecord = generatedSummary;
        if (generatedSummary) {
          nextThreadRecord = {
            ...nextThreadRecord,
            summaryVersion: summaryVersion,
          };
        }

        if (nextThreadRecord.personaId && previous.memoryPreferences.mode !== 'disabled') {
          memoryRecordsToInsert = buildMemoryRecords(
            nextThreadRecord.personaId,
            threadId,
            messages,
            previous.memoryRecords.filter((record) => record.personaId === nextThreadRecord!.personaId),
          );
        }
      }

      return {
        ...previous,
        messagesByThread: {
          ...previous.messagesByThread,
          [threadId]: messages,
        },
        summariesByThread: nextSummaryRecord
          ? {
              ...previous.summariesByThread,
              [threadId]: [nextSummaryRecord],
            }
          : previous.summariesByThread,
        memoryRecords: memoryRecordsToInsert.length > 0
          ? [...memoryRecordsToInsert, ...previous.memoryRecords]
          : previous.memoryRecords,
        threads: previous.threads.map((thread) => (
          thread.id === threadId && nextThreadRecord ? nextThreadRecord : thread
        )),
      };
    });

    if (!shouldPersist) return;

    await replaceMessagesForThread(threadId, toThreadMessages(threadId, messages));
    if (nextThreadRecord) {
      await putThread(nextThreadRecord);
    }
    if (nextSummaryRecord) {
      await putThreadSummary(nextSummaryRecord);
    } else if (messages.length < 12) {
      await deleteThreadSummary(threadId);
    }
    if (memoryRecordsToInsert.length > 0) {
      await bulkPutMemoryRecords(memoryRecordsToInsert);
    }
  }, [state.currentThreadId]);

  const setCurrentPersona = useCallback(async (personaId: string) => {
    setState((previous) => ({
      ...previous,
      currentPersonaId: personaId,
      threads: previous.threads.map((thread) => (
        thread.id === previous.currentThreadId ? { ...thread, personaId, updatedAt: Date.now() } : thread
      )),
    }));

    await putSetting('current_persona_id', personaId);
    if (state.currentThreadId) {
      const currentThreadRecord = state.threads.find((thread) => thread.id === state.currentThreadId);
      if (currentThreadRecord) {
        await putThread({ ...currentThreadRecord, personaId, updatedAt: Date.now() });
      }
    }
  }, [state.currentThreadId, state.threads]);

  const savePersona = useCallback(async (persona: PersonaProfile) => {
    setState((previous) => {
      const exists = previous.personas.some((candidate) => candidate.id === persona.id);
      return {
        ...previous,
        personas: exists
          ? previous.personas.map((candidate) => candidate.id === persona.id ? persona : candidate)
          : [persona, ...previous.personas],
      };
    });

    await putPersona(persona);
  }, []);

  const setPersonaThemePreference = useCallback(async (personaId: string, themePreference?: ThemePreference) => {
    const existingPersona = state.personas.find((persona) => persona.id === personaId);
    if (!existingPersona) return;

    const nextPersona: PersonaProfile = {
      ...existingPersona,
      themePreference,
      updatedAt: Date.now(),
    };

    setState((previous) => ({
      ...previous,
      personas: previous.personas.map((persona) => persona.id === personaId ? nextPersona : persona),
    }));

    await putPersona(nextPersona);
  }, [state.personas]);

  const resetPersonaThemesToAppDefault = useCallback(async () => {
    const nextPersonas = state.personas.map((persona) => (
      persona.themePreference
        ? {
            ...persona,
            themePreference: undefined,
            updatedAt: Date.now(),
          }
        : persona
    ));

    setState((previous) => ({
      ...previous,
      personas: nextPersonas,
    }));

    await bulkPutPersonas(nextPersonas);
  }, [state.personas]);

  const setCurrentVoiceProfile = useCallback(async (voiceProfileId: string) => {
    setState((previous) => ({
      ...previous,
      currentVoiceProfileId: voiceProfileId,
      threads: previous.threads.map((thread) => (
        thread.id === previous.currentThreadId ? { ...thread, voiceProfileId, updatedAt: Date.now() } : thread
      )),
    }));

    await putSetting('current_voice_profile_id', voiceProfileId);
    if (state.currentThreadId) {
      const currentThreadRecord = state.threads.find((thread) => thread.id === state.currentThreadId);
      if (currentThreadRecord) {
        await putThread({ ...currentThreadRecord, voiceProfileId, updatedAt: Date.now() });
      }
    }
  }, [state.currentThreadId, state.threads]);

  const saveVoiceProfile = useCallback(async (voiceProfile: TTSVoiceProfile) => {
    setState((previous) => {
      const exists = previous.voiceProfiles.some((candidate) => candidate.id === voiceProfile.id);
      return {
        ...previous,
        voiceProfiles: exists
          ? previous.voiceProfiles.map((candidate) => candidate.id === voiceProfile.id ? voiceProfile : candidate)
          : [voiceProfile, ...previous.voiceProfiles],
      };
    });

    await putVoiceProfile(voiceProfile);
  }, []);

  const updateRenderSettings = useCallback(async (settings: Partial<RenderSettings>) => {
    const nextSettings = { ...state.renderSettings, ...settings };
    setState((previous) => ({
      ...previous,
      renderSettings: nextSettings,
    }));
    await putSetting('render_settings', nextSettings);
  }, [state.renderSettings]);

  const updateMemoryPreferences = useCallback(async (preferences: Partial<MemoryPreferences>) => {
    const nextPreferences = { ...state.memoryPreferences, ...preferences };
    setState((previous) => ({
      ...previous,
      memoryPreferences: nextPreferences,
    }));
    await putSetting('memory_preferences', nextPreferences);
  }, [state.memoryPreferences]);

  const deleteMemoryRecord = useCallback(async (memoryId: string) => {
    setState((previous) => ({
      ...previous,
      memoryRecords: previous.memoryRecords.filter((record) => record.id !== memoryId),
    }));
    await deleteMemoryRecordFromDb(memoryId);
  }, []);

  const saveMemoryRecord = useCallback(async (memory: MemoryRecord) => {
    setState((previous) => {
      const exists = previous.memoryRecords.some((record) => record.id === memory.id);
      return {
        ...previous,
        memoryRecords: exists
          ? previous.memoryRecords.map((record) => record.id === memory.id ? memory : record)
          : [memory, ...previous.memoryRecords],
      };
    });
    await putMemoryRecord(memory);
  }, []);

  const setHelperBaseUrl = useCallback(async (baseUrl: string) => {
    const nextBaseUrl = baseUrl.trim() || DEFAULT_HELPER_BASE_URL;
    setState((previous) => ({
      ...previous,
      helperBaseUrl: nextBaseUrl,
    }));
    await putSetting('helper_base_url', nextBaseUrl);
  }, []);

  const startInstallJob = useCallback(async (modelId: string, source = 'curated') => {
    try {
      const job = await createInstallJob(modelId, source, state.helperBaseUrl);
      setState((previous) => ({
        ...previous,
        jobs: [job, ...previous.jobs],
      }));
      await refreshHelperData();
    } catch {
      // The helper exposes install jobs only when available.
    }
  }, [refreshHelperData, state.helperBaseUrl]);

  const removeInstalledModel = useCallback(async (modelId: string) => {
    try {
      await removeInstalledModelRequest(modelId, state.helperBaseUrl);
      await refreshHelperData();
    } catch {
      // Helper removal stays best-effort until model jobs become richer.
    }
  }, [refreshHelperData, state.helperBaseUrl]);

  const saveProviderSecret = useCallback(async (providerId: string, secret: string) => {
    await setProviderSecretRequest(providerId, secret, state.helperBaseUrl);
    await refreshHelperData();
  }, [refreshHelperData, state.helperBaseUrl]);

  const deleteProviderSecret = useCallback(async (providerId: string) => {
    await deleteProviderSecretRequest(providerId, state.helperBaseUrl);
    await refreshHelperData();
  }, [refreshHelperData, state.helperBaseUrl]);

  const warmOllamaModel = useCallback(async (modelId: string, keepAlive = '30m') => {
    const result = await warmOllamaModelRequest(modelId, keepAlive, true, state.helperBaseUrl);
    await refreshHelperData();
    return result.message;
  }, [refreshHelperData, state.helperBaseUrl]);

  const unloadOllamaModels = useCallback(async () => {
    const result = await unloadOllamaModelsRequest(state.helperBaseUrl);
    await refreshHelperData();
    return result.message;
  }, [refreshHelperData, state.helperBaseUrl]);

  const currentIntimacyState = useMemo(() => {
    if (!currentThread) return null;
    return state.intimacyStatesByThread[currentThread.id] ?? null;
  }, [currentThread, state.intimacyStatesByThread]);

  const currentPsychologyState = useMemo(() => {
    if (!currentThread) return null;
    return state.psychologyStatesByThread[currentThread.id] ?? null;
  }, [currentThread, state.psychologyStatesByThread]);

  const updateContentGateConfig = useCallback(async (config: ContentGateConfig) => {
    setState((previous) => ({ ...previous, contentGateConfig: config }));
    await putSetting('content_gate_config', config);
  }, []);

  const updateIntimacyState = useCallback(async (
    threadId: string,
    personaId: string,
    intimacy: IntimacyState,
    physical: PhysicalState,
  ) => {
    setState((previous) => ({
      ...previous,
      intimacyStatesByThread: {
        ...previous.intimacyStatesByThread,
        [threadId]: { intimacy, physical },
      },
    }));
    const record: IntimacyStateRecord = { threadId, personaId, intimacy, physical };
    await putIntimacyStateToDb(record);
  }, []);

  const updatePsychologyState = useCallback(async (
    threadId: string,
    personaId: string,
    psychState: PsychologyState,
  ) => {
    setState((previous) => ({
      ...previous,
      psychologyStatesByThread: {
        ...previous.psychologyStatesByThread,
        [threadId]: psychState,
      },
    }));
    const record: PsychologyStateRecord = { threadId, personaId, state: psychState };
    await putPsychologyStateToDb(record);
  }, []);

  // Hydrate intimacy and psychology states when thread changes
  useEffect(() => {
    if (!currentThread || !state.isReady) return;
    const threadId = currentThread.id;

    // Only fetch if not already loaded
    if (!state.intimacyStatesByThread[threadId]) {
      void getIntimacyStateFromDb(threadId).then((record) => {
        if (record) {
          setState((previous) => ({
            ...previous,
            intimacyStatesByThread: {
              ...previous.intimacyStatesByThread,
              [threadId]: { intimacy: record.intimacy, physical: record.physical },
            },
          }));
        }
      });
    }

    if (!state.psychologyStatesByThread[threadId]) {
      void getPsychologyStateFromDb(threadId).then((record) => {
        if (record) {
          setState((previous) => ({
            ...previous,
            psychologyStatesByThread: {
              ...previous.psychologyStatesByThread,
              [threadId]: record.state,
            },
          }));
        }
      });
    }
  }, [currentThread, state.isReady, state.intimacyStatesByThread, state.psychologyStatesByThread]);

  const value: CompanionContextValue = {
    state,
    currentThread,
    currentMessages,
    currentThreadSummaries,
    retrievedMemories,
    workingMemoryFacts,
    activePersona,
    activeVoiceProfile,
    createThread,
    selectThread,
    renameThread,
    setThreadAutoTitle,
    archiveThread,
    deleteThread,
    replaceCurrentMessages,
    setCurrentPersona,
    savePersona,
    setPersonaThemePreference,
    resetPersonaThemesToAppDefault,
    setCurrentVoiceProfile,
    saveVoiceProfile,
    updateRenderSettings,
    updateMemoryPreferences,
    deleteMemoryRecord,
    saveMemoryRecord,
    setHelperBaseUrl,
    refreshHelperData,
    startInstallJob,
    removeInstalledModel,
    saveProviderSecret,
    deleteProviderSecret,
    warmOllamaModel,
    unloadOllamaModels,
    currentIntimacyState,
    currentPsychologyState,
    updateContentGateConfig,
    updateIntimacyState,
    updatePsychologyState,
  };

  return (
    <CompanionContext.Provider value={value}>
      {children}
    </CompanionContext.Provider>
  );
}
