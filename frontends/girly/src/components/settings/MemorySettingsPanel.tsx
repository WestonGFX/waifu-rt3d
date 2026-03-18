import { useMemo, useState } from 'react';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useApp } from '../../context/AppContext.tsx';
import {
  buildContextBudgetBreakdown,
  createContextBudgetRuntimeDescriptor,
} from '../../services/contextBudgetService.ts';
import { resolveCurrentRuntimeModel, resolveEffectiveContextWindow, resolveMaximumContextWindow } from '../../services/llmRuntimeService.ts';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import {
  AppCard,
  AppMutedNote,
  Button,
  Switch,
  Textarea,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';

export default function MemorySettingsPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const {
    state,
    currentThread,
    currentMessages,
    activePersona,
    currentThreadSummaries,
    retrievedMemories,
    deleteMemoryRecord,
    saveMemoryRecord,
    updateMemoryPreferences,
  } = useCompanion();
  const { state: appState } = useApp();
  const { currentEnvironment, state: environmentState } = useEnvironment();
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const currentRuntimeModel = resolveCurrentRuntimeModel(state.runtimeStatuses, appState.providerConfig);
  const effectiveContextWindow = resolveEffectiveContextWindow(state.runtimeStatuses, appState.providerConfig);
  const maximumContextWindow = resolveMaximumContextWindow(state.runtimeStatuses, appState.providerConfig);

  const contextBudget = useMemo(() => buildContextBudgetBreakdown({
    persona: activePersona,
    summaries: currentThreadSummaries,
    retrievedMemories,
    recentMessages: currentMessages.slice(-10),
    currentEnvironment,
    roomRuntime: environmentState.roomRuntime,
    runtimeDescriptor: createContextBudgetRuntimeDescriptor(
      appState.providerConfig,
      currentRuntimeModel?.id,
      effectiveContextWindow,
    ),
    contextWindow: effectiveContextWindow,
  }), [
    activePersona,
    appState.providerConfig,
    currentEnvironment,
    currentMessages,
    currentRuntimeModel?.id,
    currentThreadSummaries,
    effectiveContextWindow,
    environmentState.roomRuntime,
    retrievedMemories,
  ]);

  const beginEditMemory = (memoryId: string, text: string) => {
    setEditingMemoryId(memoryId);
    setEditingMemoryText(text);
  };

  const commitEditMemory = async () => {
    if (!editingMemoryId) return;
    const targetMemory = state.memoryRecords.find((memory) => memory.id === editingMemoryId);
    if (!targetMemory) return;
    await saveMemoryRecord({
      ...targetMemory,
      text: editingMemoryText.trim() || targetMemory.text,
    });
    setEditingMemoryId(null);
    setEditingMemoryText('');
  };

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-3.5'}>
      {embedded ? (
        <p className="px-1 text-[11px] leading-4.5 text-text-muted">
          Memory is split into thread summaries for prompt compaction and saved memories for continuity across sessions.
        </p>
      ) : (
        <AppMutedNote>
          Memory is split into thread summaries for prompt compaction and saved memories for continuity across sessions.
        </AppMutedNote>
      )}

      <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
        <SettingsSectionHeader
          eyebrow="Mode"
          title="Memory mode"
          description="Keep short-term thread summaries lean, then layer long-term recall on top when you want continuity."
        />
        <div className={`mt-2.5 grid gap-2 ${embedded ? 'xl:grid-cols-1' : 'xl:grid-cols-3'}`}>
          {[
            { id: 'disabled', label: 'Disabled', description: 'No memory beyond the visible thread.' },
            { id: 'thread-only', label: 'Thread only', description: 'Compact the active thread without long-term recall.' },
            { id: 'thread-and-long-term', label: 'Thread + long-term', description: 'Enable summary plus retrievable companion memory.' },
          ].map((option) => (
            <Button
              key={option.id}
              type="button"
              onClick={() => void updateMemoryPreferences({
                mode: option.id as 'disabled' | 'thread-only' | 'thread-and-long-term',
                longTermEnabled: option.id === 'thread-and-long-term',
              })}
              variant={state.memoryPreferences.mode === option.id ? 'default' : 'secondary'}
              className="h-auto items-start justify-start rounded-[18px] px-3 py-2.5 text-left"
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="mt-0.5 text-xs text-text-muted">{option.description}</div>
            </Button>
          ))}
        </div>
      </AppCard>

      <div className={`grid gap-2 ${embedded ? 'xl:grid-cols-1' : 'xl:grid-cols-2'}`}>
        <AppCard className={`flex items-center justify-between gap-3 ${embedded ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
          <div>
            <div className="text-sm font-semibold text-text-primary">Memory usage hints</div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">
              {state.memoryPreferences.showUsageHints
                ? 'Enabled: show subtle in-chat hints when memory or summaries are injected.'
                : 'Disabled: keep the chat surface cleaner and push memory details into settings only.'}
            </div>
          </div>
          <Switch
            checked={state.memoryPreferences.showUsageHints}
            onCheckedChange={() => void updateMemoryPreferences({
              showUsageHints: !state.memoryPreferences.showUsageHints,
            })}
          />
        </AppCard>

        <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-text-primary">Context budget</div>
            <div className="text-[11px] text-text-muted">
              {contextBudget.usedInputTokens.toLocaleString()}/{effectiveContextWindow.toLocaleString()} used
            </div>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Current LLM: {appState.providerConfig.llm.primary}
            {currentRuntimeModel ? ` · ${currentRuntimeModel.id}` : ''}
            {maximumContextWindow
              ? ` · ${effectiveContextWindow.toLocaleString()} / ${maximumContextWindow.toLocaleString()} token window`
              : ''}
          </p>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-anime-100">
            {contextBudget.segments.map((segment) => (
              <div
                key={segment.id}
                className={segment.colorClass}
                style={{
                  width: `${Math.max(2, (segment.tokens / Math.max(1, contextBudget.contextWindow)) * 100)}%`,
                }}
                title={`${segment.label}: ~${segment.tokens} tokens`}
              />
            ))}
          </div>
          <div className={`mt-2.5 grid gap-2 ${embedded ? 'sm:grid-cols-1 lg:grid-cols-2' : 'sm:grid-cols-2'}`}>
            {contextBudget.segments.map((segment) => (
              <div key={segment.id} className={`rounded-[16px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] ${embedded ? 'px-2.5 py-1.5' : 'px-2.5 py-2'}`}>
                <div className="text-[11px] font-medium text-text-primary">{segment.label}</div>
                <div className="mt-0.5 text-xs text-text-muted">~{segment.tokens} tokens</div>
                {segment.id === 'response' ? (
                  <div className="mt-1 text-[10px] leading-4 text-text-muted">
                    Reserved so the reply can stay smooth without instantly overflowing the prompt budget.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <div className={`grid gap-2 ${embedded ? 'xl:grid-cols-1' : 'xl:grid-cols-2'}`}>
        <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
          <SettingsSectionHeader
            eyebrow="Compaction"
            title="Active thread summaries"
            description={currentThread
              ? `Compacted context for ${currentThread.title}.`
              : 'No active thread selected.'}
          />

          {currentThreadSummaries.length === 0 ? (
            <p className="mt-2.5 text-xs text-text-muted">
              Summaries appear automatically once the active thread grows large enough to compact.
            </p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {currentThreadSummaries.map((summary) => (
                <div key={`${summary.threadId}-${summary.summaryVersion}`} className={SETTINGS_PANEL_SUBCARD}>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    Summary v{summary.summaryVersion}
                  </div>
                  <p className="mt-1.5 text-sm text-text-secondary">{summary.summaryText}</p>
                  <div className="mt-1.5 text-xs text-text-muted">
                    Relationship state: {summary.relationshipState}
                  </div>
                  {summary.notablePreferences.length > 0 && (
                    <div className="mt-1.5 text-xs text-text-muted">
                      Preferences: {summary.notablePreferences.join(' · ')}
                    </div>
                  )}
                  {summary.unresolvedTopics.length > 0 && (
                    <div className="mt-1.5 text-xs text-text-muted">
                      Open loops: {summary.unresolvedTopics.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </AppCard>

        <AppCard className={embedded ? 'p-3' : 'p-3.5'}>
          <SettingsSectionHeader
            eyebrow="Recall"
            title="Retrieved memories"
            description="These are the top memory records that would be injected into the next prompt for the active thread."
          />

          {retrievedMemories.length === 0 ? (
            <p className="mt-2.5 text-xs text-text-muted">
              No retrieved memories yet. Mention preferences, favorites, boundaries, or callback requests in chat and they will start appearing here.
            </p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {retrievedMemories.map((memory) => (
                <div key={memory.id} className={SETTINGS_PANEL_SUBCARD}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium capitalize text-text-primary">{memory.kind}</div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        salience {memory.salience.toFixed(2)} · confidence {memory.confidence.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => beginEditMemory(memory.id, memory.text)}
                        className="rounded-pill border border-anime-200 bg-white px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-anime-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMemoryRecord(memory.id)}
                        className="rounded-pill border border-rose-pastel-200 bg-rose-pastel-50 px-2.5 py-1 text-[11px] font-medium text-rose-pastel-400 transition-colors hover:bg-rose-pastel-100"
                      >
                        Forget
                      </button>
                    </div>
                  </div>
                  {editingMemoryId === memory.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        rows={3}
                        value={editingMemoryText}
                        onChange={(event) => setEditingMemoryText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void commitEditMemory()}
                        >
                          Save memory
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingMemoryId(null);
                            setEditingMemoryText('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-text-secondary">{memory.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </AppCard>
      </div>
    </div>
  );
}
