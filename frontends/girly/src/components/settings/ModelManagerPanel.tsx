/**
 * ModelManagerPanel — Comprehensive AI Model Lifecycle Manager.
 *
 * Shows all installed AI models across all capabilities (TTS, STT, LLM, voice-clone),
 * provides a catalog browser with hardware compatibility badges, one-click install,
 * disk usage tracking, and hardware-aware recommendations.
 *
 * Tabs:
 *   - Overview: Hardware summary, disk usage, model counts
 *   - LLM: Runtime model selection, auto-tune, feature toggles
 *   - TTS: Voice provider cards with install/remove
 *   - STT: Speech recognition providers (WebSpeech + Whisper)
 *   - Catalog: Full browsable catalog with filters and install wizard
 *   - Avatars: VRM/GLB asset management
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useApp } from '../../context/AppContext.tsx';
import ModelUploader from './ModelUploader.tsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import {
  getProviderOptions,
  resolveConfiguredLLMModelId,
  resolveCurrentRuntimeModel,
  resolveCurrentRuntimeStatus,
  resolveEffectiveContextWindow,
  resolveMaximumContextWindow,
  updateProviderOptions,
} from '../../services/llmRuntimeService.ts';
import {
  buildModelRecommendation,
  buildRecommendedProviderPatch,
  checkModelHardwareCompatibility,
  formatBytes,
  formatDiskFree,
  formatHardwareMemoryLabel,
  getRecommendedModels,
  type HardwareCompatibility,
} from '../../services/modelRecommendationService.ts';
import {
  fetchDiskUsage,
  fetchSTTProviders,
} from '../../services/helperClient.ts';
import type { DiskUsageResponse, ModelCatalogEntry, STTProviderDescriptor } from '../../types/companion.ts';
import {
  AppMutedNote,
  SETTINGS_PANEL_CARD,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
  SettingsStatCard,
} from './SettingsPrimitives.tsx';

type ModelTab = 'overview' | 'llm' | 'tts' | 'stt' | 'catalog' | 'avatar';

const MODEL_TABS: { id: ModelTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'llm', label: 'LLM' },
  { id: 'tts', label: 'TTS' },
  { id: 'stt', label: 'STT' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'avatar', label: 'Avatars' },
];

const MODEL_TAB_STORAGE_KEY = 'animegirly_settings_model_tab';

const COMPAT_STYLES: Record<HardwareCompatibility, { bg: string; text: string; label: string }> = {
  compatible:   { bg: 'bg-green-50',          text: 'text-green-700',        label: 'Compatible' },
  tight:        { bg: 'bg-amber-50',          text: 'text-amber-700',        label: 'Tight fit' },
  incompatible: { bg: 'bg-rose-pastel-50',    text: 'text-rose-pastel-600',  label: 'Too heavy' },
  unknown:      { bg: 'bg-slate-50',          text: 'text-slate-500',        label: 'Unknown' },
};

const TYPE_LABELS: Record<string, string> = {
  tts: 'Text-to-Speech',
  stt: 'Speech-to-Text',
  llm: 'Language Model',
  'voice-clone': 'Voice Clone',
  motion: 'Motion',
  avatar: 'Avatar',
};

/** Format a type string to a display badge. */
function typeBadge(type: string) {
  return TYPE_LABELS[type] ?? type.toUpperCase();
}

export default function ModelManagerPanel() {
  const {
    state,
    startInstallJob,
    removeInstalledModel,
    warmOllamaModel,
    unloadOllamaModels,
  } = useCompanion();
  const { state: appState, dispatch: appDispatch } = useApp();

  const [currentTab, setCurrentTab] = useState<ModelTab>(() => {
    if (typeof window === 'undefined') return 'overview';
    const stored = window.localStorage.getItem(MODEL_TAB_STORAGE_KEY);
    return MODEL_TABS.some((tab) => tab.id === stored) ? (stored as ModelTab) : 'overview';
  });
  const [runtimeActionMessage, setRuntimeActionMessage] = useState<string | null>(null);
  const [isRuntimeActionPending, setIsRuntimeActionPending] = useState(false);
  const [diskUsage, setDiskUsage] = useState<DiskUsageResponse | null>(null);
  const [sttProviders, setSttProviders] = useState<STTProviderDescriptor[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<string>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  useEffect(() => {
    window.localStorage.setItem(MODEL_TAB_STORAGE_KEY, currentTab);
  }, [currentTab]);

  // Fetch disk usage and STT providers when panel mounts or tab changes
  useEffect(() => {
    if (currentTab === 'overview' || currentTab === 'catalog') {
      fetchDiskUsage().then(setDiskUsage).catch(() => { /* helper offline */ });
    }
    if (currentTab === 'overview' || currentTab === 'stt') {
      fetchSTTProviders().then(setSttProviders).catch(() => { /* helper offline */ });
    }
  }, [currentTab]);

  const updateCurrentTab = (nextTab: ModelTab) => {
    setCurrentTab(nextTab);
  };

  const providerStateById = useMemo(
    () => Object.fromEntries(state.ttsProviders.map((p) => [p.providerId, p])),
    [state.ttsProviders],
  );
  const localProviderCapabilities = useMemo(
    () => Object.fromEntries((state.helperCapabilities?.localProviders ?? []).map((p) => [p.providerId, p])),
    [state.helperCapabilities],
  );
  const currentRuntime = resolveCurrentRuntimeStatus(state.runtimeStatuses, appState.providerConfig);
  const currentRuntimeModel = resolveCurrentRuntimeModel(state.runtimeStatuses, appState.providerConfig);
  const configuredModelId = resolveConfiguredLLMModelId(appState.providerConfig);
  const llmProviderOptions = getProviderOptions(appState.providerConfig, appState.providerConfig.llm.primary);
  const effectiveContextWindow = resolveEffectiveContextWindow(state.runtimeStatuses, appState.providerConfig);
  const maximumContextWindow = resolveMaximumContextWindow(state.runtimeStatuses, appState.providerConfig);
  const autoTuneEnabled = llmProviderOptions.autoTune ?? true;
  const modelRecommendation = buildModelRecommendation(currentRuntimeModel, state.helperCapabilities);
  const hardwareLabel = formatHardwareMemoryLabel(state.helperCapabilities);

  const patchLlmProviderOptions = useCallback((patch: Parameters<typeof updateProviderOptions>[2]) => {
    appDispatch({
      type: 'SET_PROVIDER_CONFIG',
      payload: updateProviderOptions(appState.providerConfig, appState.providerConfig.llm.primary, patch),
    });
  }, [appDispatch, appState.providerConfig]);

  const keepAliveSetting = typeof llmProviderOptions.keepAlive === 'string' ? llmProviderOptions.keepAlive : '30m';
  const keepModelWarm = llmProviderOptions.keepModelWarm ?? appState.providerConfig.llm.primary === 'ollama';

  const runRuntimeAction = useCallback(async (action: () => Promise<string>) => {
    setIsRuntimeActionPending(true);
    try {
      const message = await action();
      setRuntimeActionMessage(message);
    } catch (error) {
      setRuntimeActionMessage(error instanceof Error ? error.message : 'Runtime action failed.');
    } finally {
      setIsRuntimeActionPending(false);
    }
  }, []);

  const applyRecommendedRuntimeSettings = useCallback(() => {
    const patch = buildRecommendedProviderPatch(currentRuntimeModel, state.helperCapabilities);
    if (!patch) return;
    patchLlmProviderOptions(patch);
  }, [currentRuntimeModel, state.helperCapabilities, patchLlmProviderOptions]);

  // Derived catalog data
  const catalog = state.modelCatalog;
  const installedCount = catalog.filter((e) => e.installed || !e.requiresInstall).length;
  const modelCountByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of catalog) {
      counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    }
    return counts;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let result = catalog;
    if (catalogFilter !== 'all') {
      result = result.filter((e) => e.type === catalogFilter);
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.family.toLowerCase().includes(q),
      );
    }
    return result;
  }, [catalog, catalogFilter, catalogSearch]);

  const recommendedSTT = useMemo(
    () => getRecommendedModels(catalog, 'stt', state.helperCapabilities),
    [catalog, state.helperCapabilities],
  );
  const recommendedTTS = useMemo(
    () => getRecommendedModels(catalog, 'tts', state.helperCapabilities),
    [catalog, state.helperCapabilities],
  );

  return (
    <div className="space-y-4">
      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Hub"
          title="Model & asset manager"
          description="Manage AI models across all capabilities — LLM, TTS, STT, voice cloning, motion, and avatars. Hardware-aware recommendations help pick the right models for your machine."
          aside={<Badge variant="muted">{installedCount} installed</Badge>}
        />
        <Tabs value={currentTab} onValueChange={(v) => updateCurrentTab(v as ModelTab)} className="mt-3">
          <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 shadow-none">
            {MODEL_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="h-8 rounded-pill border border-anime-200 bg-white px-3 py-1.5 text-xs data-[state=active]:border-anime-400 data-[state=active]:bg-anime-50"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Overview tab ─────────────────────────────────────────── */}
      {currentTab === 'overview' && (
        <div className="space-y-3">
          {/* Hardware summary */}
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Hardware"
              title="Your machine"
              description="Detected hardware used for model compatibility recommendations."
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SettingsStatCard label="Machine" value={hardwareLabel} />
              <SettingsStatCard
                label="GPU"
                value={state.helperCapabilities?.system?.gpuName ?? state.helperCapabilities?.system?.metalDeviceName ?? 'Not detected'}
              />
              <SettingsStatCard
                label="VRAM / Working set"
                value={state.helperCapabilities?.system?.vramBytes
                  ? formatBytes(state.helperCapabilities.system.vramBytes)
                  : 'Unknown'}
              />
              <SettingsStatCard label="Disk" value={formatDiskFree(state.helperCapabilities)} />
            </div>
          </div>

          {/* Disk usage */}
          {diskUsage && (
            <div className={SETTINGS_PANEL_CARD}>
              <SettingsSectionHeader
                eyebrow="Storage"
                title="Model disk usage"
                description={`${formatBytes(diskUsage.totalBytes)} used across ${diskUsage.models.length} models.`}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(diskUsage.byType).map(([type, bytes]) => (
                  <SettingsStatCard key={type} label={typeBadge(type)} value={formatBytes(bytes)} />
                ))}
                <SettingsStatCard label="Total" value={formatBytes(diskUsage.totalBytes)} />
              </div>
              {diskUsage.models.length > 0 && (
                <div className="mt-3 space-y-1">
                  {diskUsage.models.map((m) => (
                    <div key={m.modelId} className="flex items-center justify-between rounded-anime border border-anime-100 bg-anime-50/70 px-3 py-1.5 text-xs">
                      <span className="font-medium text-text-primary">{m.modelId}</span>
                      <span className="text-text-muted">{formatBytes(m.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Model counts by type */}
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Catalog"
              title="Available models by type"
              description="Total models in the catalog across all capability categories."
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {Object.entries(modelCountByType).map(([type, count]) => (
                <SettingsStatCard key={type} label={typeBadge(type)} value={String(count)} />
              ))}
            </div>
          </div>

          {/* Recommended models */}
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Recommended"
              title="Best models for your hardware"
              description="Top picks based on your detected GPU, RAM, and disk space."
            />
            <div className="mt-3 space-y-3">
              {recommendedSTT.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Speech-to-Text</div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    {recommendedSTT.slice(0, 3).map((entry) => (
                      <CatalogCard
                        key={entry.id}
                        entry={entry}
                        capabilities={state.helperCapabilities}
                        onInstall={() => void startInstallJob(entry.id, 'curated')}
                        onRemove={() => void removeInstalledModel(entry.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {recommendedTTS.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Text-to-Speech</div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    {recommendedTTS.slice(0, 3).map((entry) => (
                      <CatalogCard
                        key={entry.id}
                        entry={entry}
                        capabilities={state.helperCapabilities}
                        onInstall={() => void startInstallJob(entry.id, 'curated')}
                        onRemove={() => void removeInstalledModel(entry.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Catalog tab ──────────────────────────────────────────── */}
      {currentTab === 'catalog' && (
        <div className="space-y-3">
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Browse"
              title="Full model catalog"
              description="Discover and install AI models. Hardware badges show compatibility with your machine."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 rounded-lg border border-anime-200 bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-anime-300"
              />
              <Select value={catalogFilter} onValueChange={setCatalogFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="tts">TTS</SelectItem>
                  <SelectItem value="stt">STT</SelectItem>
                  <SelectItem value="llm">LLM</SelectItem>
                  <SelectItem value="voice-clone">Voice Clone</SelectItem>
                  <SelectItem value="motion">Motion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {filteredCatalog.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                capabilities={state.helperCapabilities}
                onInstall={() => void startInstallJob(entry.id, 'curated')}
                onRemove={() => void removeInstalledModel(entry.id)}
              />
            ))}
          </div>

          {filteredCatalog.length === 0 && (
            <AppMutedNote>No models match your search.</AppMutedNote>
          )}
        </div>
      )}

      {/* ── STT tab ──────────────────────────────────────────────── */}
      {currentTab === 'stt' && (
        <div className="space-y-3">
          <AppMutedNote>
            Speech recognition providers for voice input. Whisper runs locally through the helper and provides much better accuracy than browser speech recognition, especially for anime terms and non-English.
          </AppMutedNote>
          <div className="grid gap-3 xl:grid-cols-2">
            {sttProviders.map((provider) => (
              <div key={provider.providerId} className={SETTINGS_PANEL_CARD}>
                <SettingsSectionHeader
                  eyebrow={provider.local ? 'Local STT' : 'Browser STT'}
                  title={provider.label}
                  description={provider.providerId === 'whisper'
                    ? 'High-accuracy local transcription using faster-whisper. Install a model below to enable.'
                    : 'Browser-native speech recognition. Limited accuracy but zero setup required.'}
                  aside={(
                    <span className={[
                      'rounded-pill px-2 py-1 text-[11px] font-medium',
                      provider.available
                        ? 'bg-green-50 text-green-700'
                        : 'bg-rose-pastel-50 text-rose-pastel-400',
                    ].join(' ')}>
                      {provider.available ? 'Ready' : provider.installState}
                    </span>
                  )}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <SettingsStatCard label="Quality" value={provider.qualityTier} />
                  <SettingsStatCard label="Status" value={provider.installState} />
                  {provider.activeModel && (
                    <SettingsStatCard label="Active model" value={provider.activeModel} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Whisper model cards */}
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Whisper models"
              title="Available Whisper models"
              description="Install a Whisper model to enable high-quality local speech recognition. Larger models are more accurate but need more RAM."
            />
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {catalog
                .filter((e) => e.type === 'stt')
                .map((entry) => (
                  <CatalogCard
                    key={entry.id}
                    entry={entry}
                    capabilities={state.helperCapabilities}
                    onInstall={() => void startInstallJob(entry.id, 'curated')}
                    onRemove={() => void removeInstalledModel(entry.id)}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Avatar tab ───────────────────────────────────────────── */}
      {currentTab === 'avatar' && (
        <div className={SETTINGS_PANEL_CARD}>
          <SettingsSectionHeader
            eyebrow="Avatars"
            title="Avatar asset manager"
            description="Load a local VRM or GLB through the picker, or drop files into the watched model folder and hit refresh if you prefer to manage assets manually."
          />
          <ModelUploader />
        </div>
      )}

      {/* ── LLM tab ──────────────────────────────────────────────── */}
      {currentTab === 'llm' && (
        <div className="space-y-3">
          <div className={SETTINGS_PANEL_CARD}>
            <SettingsSectionHeader
              eyebrow="Runtime"
              title="Active LLM route"
              description="AnimeGirly inspects the exact runtime model, not just the provider. If the runtime reports tool use, reasoning, or vision, those capabilities appear here and can be toggled per route."
              aside={(
                <span className="rounded-pill bg-anime-50 px-2 py-1 text-[11px] font-medium text-anime-700">
                  Context window: {effectiveContextWindow.toLocaleString()}{maximumContextWindow ? ` / ${maximumContextWindow.toLocaleString()}` : ''}
                </span>
              )}
            />

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SettingsStatCard label="Provider" value={appState.providerConfig.llm.primary} />
              <SettingsStatCard label="Configured" value={configuredModelId ?? 'Not set'} />
              <SettingsStatCard label="Runtime" value={currentRuntimeModel?.id ?? 'Unknown'} />
              <SettingsStatCard label="Loaded" value={currentRuntime?.activeModelId ?? 'No model loaded'} />
            </div>

            <div className={`mt-3 ${SETTINGS_PANEL_SUBCARD}`}>
              <SettingsSectionHeader
                eyebrow="Smart tune"
                title="Machine-aware recommendations"
                description="AnimeGirly can read the exact runtime model plus your machine memory guidance and suggest a sane context size, keep-alive, and feature policy automatically."
                aside={(
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Auto-tune</span>
                    <Switch
                      checked={autoTuneEnabled}
                      onCheckedChange={() => patchLlmProviderOptions({ autoTune: !autoTuneEnabled })}
                    />
                  </div>
                )}
              />

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.9fr)]">
                <div className="space-y-3">
                  <div className="rounded-anime border border-anime-100 bg-white/80 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Detected hardware</div>
                    <div className="mt-1 text-sm font-medium text-text-primary">{hardwareLabel}</div>
                    {modelRecommendation ? (
                      <div className="mt-2 text-xs text-text-muted">
                        Recommended default context: <span className="font-semibold text-text-primary">{modelRecommendation.recommendedContextWindow.toLocaleString()}</span>
                        {modelRecommendation.recommendedWorkingSetGb !== undefined
                          ? ` · Metal working-set guidance ${modelRecommendation.recommendedWorkingSetGb.toFixed(2)} GB`
                          : ''}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-text-muted">
                        Pick a runtime model to calculate machine-aware defaults.
                      </div>
                    )}
                  </div>

                  {modelRecommendation && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {modelRecommendation.presets.map((preset) => (
                          <Button
                            key={preset.id}
                            type="button"
                            size="sm"
                            variant={effectiveContextWindow === preset.contextWindow ? 'default' : 'secondary'}
                            onClick={() => patchLlmProviderOptions({ contextWindow: preset.contextWindow, autoTune: false })}
                          >
                            {preset.label}: {preset.contextWindow.toLocaleString()}
                          </Button>
                        ))}
                        <Button type="button" size="sm" onClick={applyRecommendedRuntimeSettings}>
                          Apply smart defaults
                        </Button>
                      </div>

                      <div className="grid gap-2 xl:grid-cols-2">
                        <SettingsStatCard label="Suggested keep-alive" value={modelRecommendation.recommendedKeepAlive} />
                        <SettingsStatCard label="Keep warm" value={modelRecommendation.recommendedKeepWarm ? 'On' : 'Off'} />
                        <SettingsStatCard label="Tools" value={modelRecommendation.recommendedTools ? 'Enabled' : 'Off'} />
                        <SettingsStatCard label="Reasoning" value={modelRecommendation.recommendedReasoning ? 'Enabled' : 'Off'} />
                      </div>

                      <div className="space-y-2 rounded-anime border border-anime-100 bg-anime-50/70 px-3 py-3 text-xs text-text-secondary">
                        {modelRecommendation.rationale.map((reason) => (
                          <div key={reason}>• {reason}</div>
                        ))}
                        {modelRecommendation.caution && (
                          <div className="rounded-anime border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                            {modelRecommendation.caution}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-anime border border-anime-100 bg-anime-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">What auto-tune touches</div>
                  <div className="mt-2 space-y-2 text-xs text-text-secondary">
                    <div>• Context window sized for the model plus current machine headroom.</div>
                    <div>• Keep-alive and "keep warm" defaults for Ollama.</div>
                    <div>• Tool / reasoning / vision policy defaults based on what the selected model actually reports.</div>
                    <div>• Manual changes always win when you turn auto-tune off.</div>
                  </div>
                </div>
              </div>
            </div>

            {currentRuntime?.online && currentRuntime.models.length > 0 && (
              <div className={`mt-3 ${SETTINGS_PANEL_SUBCARD}`}>
                <SettingsSectionHeader
                  eyebrow="Selection"
                  title="Choose the active runtime model"
                  description="Changing this updates AnimeGirly's model route immediately. If warm-loading is enabled for Ollama, the helper also loads it into RAM."
                />
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">Model</span>
                    <Select
                      value={configuredModelId ?? currentRuntime.models[0]?.id ?? ''}
                      onValueChange={async (value) => {
                        const nextModel = currentRuntime.models.find((m) => m.id === value);
                        patchLlmProviderOptions({
                          model: value,
                          contextWindow: nextModel?.contextWindow,
                        });
                        if (appState.providerConfig.llm.primary === 'ollama' && (llmProviderOptions.keepModelWarm ?? true)) {
                          await runRuntimeAction(() => warmOllamaModel(value, keepAliveSetting));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentRuntime.models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="rounded-anime border border-anime-100 bg-anime-50/70 px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Loaded now</div>
                    <div className="mt-1 text-sm font-medium text-text-primary">
                      {currentRuntime.activeModelId ?? 'No model loaded into RAM'}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">{currentRuntime.message}</div>
                  </div>
                </div>
              </div>
            )}

            {appState.providerConfig.llm.primary === 'ollama' && currentRuntime?.online && (
              <div className={`mt-3 ${SETTINGS_PANEL_SUBCARD}`}>
                <SettingsSectionHeader
                  eyebrow="Ollama"
                  title="Model memory behavior"
                  description="Ollama only reports a model as loaded after something actually warms it in RAM. Keep the selected model warm if you want faster first-token latency."
                  aside={<Switch checked={keepModelWarm} onCheckedChange={() => patchLlmProviderOptions({ keepModelWarm: !keepModelWarm })} />}
                />
                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">Keep-alive</span>
                    <input
                      value={keepAliveSetting}
                      onChange={(e) => patchLlmProviderOptions({ keepAlive: e.target.value })}
                      placeholder="30m"
                      className="rounded-lg border border-anime-200 bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-anime-300"
                    />
                    <span className="text-xs text-text-muted">Examples: `10m`, `30m`, `2h`, or `-1` to keep resident.</span>
                  </label>
                  <div className="rounded-anime border border-anime-100 bg-white/80 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Current load state</div>
                    <div className="mt-1 text-sm font-medium text-text-primary">{currentRuntime.activeModelId ?? 'No loaded model'}</div>
                    <div className="mt-1 text-xs text-text-muted">Loaded set: {currentRuntime.loadedModelIds.join(', ') || 'none'}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={isRuntimeActionPending || !configuredModelId}
                    onClick={() => { if (configuredModelId) void runRuntimeAction(() => warmOllamaModel(configuredModelId, keepAliveSetting)); }}
                    size="sm"
                  >
                    {isRuntimeActionPending ? 'Working...' : 'Load selected into RAM'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isRuntimeActionPending}
                    onClick={() => void runRuntimeAction(() => unloadOllamaModels())}
                  >
                    Unload all loaded models
                  </Button>
                </div>
                {runtimeActionMessage && (
                  <div className="mt-3 rounded-anime border border-anime-100 bg-white/80 px-3 py-2 text-xs text-text-secondary">
                    {runtimeActionMessage}
                  </div>
                )}
              </div>
            )}

            {currentRuntimeModel && (
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <div className={SETTINGS_PANEL_SUBCARD}>
                  <SettingsSectionHeader
                    eyebrow="Capabilities"
                    title="What this model can do"
                    description="These chips come from the live runtime probe, so they reflect the actual selected model."
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      currentRuntimeModel.supportsTools ? 'Tools' : null,
                      currentRuntimeModel.supportsReasoning ? 'Reasoning' : null,
                      currentRuntimeModel.supportsVision ? 'Vision' : null,
                      ...currentRuntimeModel.capabilities.filter((c) => !['tools', 'thinking', 'vision', 'completion'].includes(c)),
                    ].filter(Boolean).map((cap) => (
                      <Badge key={cap} variant="secondary" className="border border-anime-100 bg-anime-50 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <SettingsStatCard label="Family" value={currentRuntimeModel.family ?? 'Unknown'} />
                    <SettingsStatCard label="Params" value={currentRuntimeModel.parameterSize ?? 'Unknown'} />
                    <SettingsStatCard label="Quant" value={currentRuntimeModel.quantizationLevel ?? 'Unknown'} />
                    <SettingsStatCard label="Context" value={currentRuntimeModel.contextWindow?.toLocaleString() ?? 'Unknown'} />
                  </div>
                </div>

                <div className={SETTINGS_PANEL_SUBCARD}>
                  <SettingsSectionHeader
                    eyebrow="Policy"
                    title="Feature toggles"
                    description="Unsupported toggles stay disabled so the UI does not promise capabilities the runtime does not actually have."
                  />
                  <div className="mt-3 space-y-3">
                    {[
                      { id: 'enableTools', label: 'Tool use', description: 'Allow tool-calling flows.', enabled: llmProviderOptions.enableTools ?? currentRuntimeModel.supportsTools, supported: currentRuntimeModel.supportsTools },
                      { id: 'enableReasoning', label: 'Reasoning / thinking', description: 'Expose chain-of-thought features.', enabled: llmProviderOptions.enableReasoning ?? currentRuntimeModel.supportsReasoning, supported: currentRuntimeModel.supportsReasoning },
                      { id: 'enableVision', label: 'Vision', description: 'Permit image-aware requests.', enabled: llmProviderOptions.enableVision ?? currentRuntimeModel.supportsVision, supported: currentRuntimeModel.supportsVision },
                    ].map((toggle) => (
                      <label key={toggle.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-text-primary">{toggle.label}</span>
                          <span className="block text-xs text-text-muted">{toggle.supported ? toggle.description : 'Not supported by the selected model.'}</span>
                        </span>
                        <Switch checked={toggle.enabled} disabled={!toggle.supported} onCheckedChange={() => patchLlmProviderOptions({ [toggle.id]: !toggle.enabled })} />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {state.runtimeStatuses.map((runtime) => (
              <div key={runtime.id} className={SETTINGS_PANEL_CARD}>
                <SettingsSectionHeader
                  eyebrow="Runtime status"
                  title={runtime.label}
                  description={runtime.message}
                  aside={(
                    <span className={['rounded-pill px-2 py-1 text-[11px] font-medium', runtime.online ? 'bg-green-50 text-green-700' : 'bg-rose-pastel-50 text-rose-pastel-400'].join(' ')}>
                      {runtime.online ? 'online' : 'offline'}
                    </span>
                  )}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <SettingsStatCard label="Loaded models" value={runtime.loadedModelIds.join(', ') || 'none'} />
                  <SettingsStatCard label="Known count" value={String(runtime.modelCount)} />
                </div>
                {runtime.models.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {runtime.models.slice(0, 4).map((model) => (
                      <div key={model.id} className="rounded-xl border border-anime-100 bg-anime-50/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-text-primary">{model.id}</div>
                          {model.loaded && <span className="rounded-pill bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">loaded</span>}
                        </div>
                        <div className="mt-1 text-[11px] text-text-muted">
                          {model.contextWindow ? `${model.contextWindow.toLocaleString()} ctx` : 'Context unknown'}
                          {model.parameterSize ? ` · ${model.parameterSize}` : ''}
                          {model.quantizationLevel ? ` · ${model.quantizationLevel}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TTS tab ──────────────────────────────────────────────── */}
      {currentTab === 'tts' && (
        <div className="space-y-3">
          <AppMutedNote>
            Local voice cards show whether the runtime is actually available, whether the model is installed, and whether extra bootstrap work is still needed. Cloud cards skip install but still report readiness.
          </AppMutedNote>
          <div className="grid gap-3 xl:grid-cols-2">
            {catalog.filter((e) => e.type === 'tts').map((entry) => {
              const providerStatus = providerStateById[entry.family];
              const localCapability = localProviderCapabilities[entry.family];
              const canInstall = entry.requiresInstall;
              const installLabel = !canInstall ? 'No install needed' : providerStatus?.installState === 'installed' ? 'Installed' : 'Install';
              const installDisabled = !canInstall || providerStatus?.installState === 'installed';
              const showRemove = canInstall && providerStatus?.installState === 'installed';

              return (
                <div key={entry.id} className={SETTINGS_PANEL_CARD}>
                  <SettingsSectionHeader
                    eyebrow={entry.local ? 'Local voice' : 'Cloud voice'}
                    title={entry.id}
                    description={entry.summary}
                    aside={<span className="rounded-pill bg-anime-50 px-2 py-1 text-[11px] font-medium text-anime-600">{entry.qualityTier}</span>}
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <SettingsStatCard label="Runtime" value={entry.local ? 'Local' : 'Cloud'} />
                    <SettingsStatCard label="RAM" value={entry.minRamGb ? `${entry.minRamGb} GB+` : 'Light'} />
                    <SettingsStatCard label="Install" value={entry.installSizeMb ? `${entry.installSizeMb} MB` : 'Provider-managed'} />
                    <SettingsStatCard label="License" value={entry.license ?? 'See docs'} />
                    {providerStatus && <SettingsStatCard label="Status" value={providerStatus.installState} />}
                    {providerStatus && <SettingsStatCard label="Ready" value={providerStatus.available ? 'Yes' : 'Not yet'} />}
                    {localCapability && <SettingsStatCard label="Runtime detected" value={localCapability.runtimeAvailable ? 'Available' : 'Missing'} />}
                    {localCapability && <SettingsStatCard label="Bootstrap" value={localCapability.bootstrapRequired ? 'Required' : 'Ready'} />}
                  </div>

                  {localCapability?.bootstrapRequired && (
                    <div className="mt-3 rounded-anime border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <div className="font-medium">Kokoro helper bootstrap required</div>
                      <div className="mt-1">{localCapability.reason ?? 'This local provider needs a helper runtime built with Python 3.11 or 3.12.'}</div>
                      {state.helperCapabilities?.recommendedBootstrapCommand && (
                        <pre className="mt-2 overflow-auto rounded-anime bg-slate-950/90 p-3 text-[11px] leading-5 text-slate-100">
                          {state.helperCapabilities.recommendedBootstrapCommand}
                        </pre>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void startInstallJob(entry.id, 'curated')} disabled={installDisabled} size="sm">
                      {installLabel}
                    </Button>
                    {showRemove && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => void removeInstalledModel(entry.id)}>
                        Remove
                      </Button>
                    )}
                    {entry.docsUrl && (
                      <Button asChild variant="muted" size="sm">
                        <a href={entry.docsUrl} target="_blank" rel="noreferrer">Docs</a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {state.jobs.length > 0 && (
            <div className={SETTINGS_PANEL_CARD}>
              <SettingsSectionHeader eyebrow="Queue" title="Install jobs" description="Recent model installs and removals." />
              <div className="mt-3 space-y-2">
                {state.jobs.slice(0, 5).map((job) => (
                  <div key={job.jobId} className="rounded-xl border border-anime-100 bg-anime-50/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-text-primary">{job.kind}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{job.status}</div>
                    </div>
                    <div className="mt-1 text-xs text-text-muted">{job.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Catalog Card Component ──────────────────────────────────────── */

interface CatalogCardProps {
  entry: ModelCatalogEntry;
  capabilities: import('../../types/companion.ts').HelperCapabilities | null;
  onInstall: () => void;
  onRemove: () => void;
}

/**
 * Reusable card displaying a model catalog entry with hardware compatibility
 * badge, metadata, and install/remove actions.
 */
function CatalogCard({ entry, capabilities, onInstall, onRemove }: CatalogCardProps) {
  const compat = checkModelHardwareCompatibility(entry, capabilities);
  const style = COMPAT_STYLES[compat];
  const isInstalled = entry.installed || !entry.requiresInstall;

  return (
    <div className={SETTINGS_PANEL_CARD}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">{typeBadge(entry.type)}</span>
            {entry.recommended && (
              <span className="rounded-pill bg-anime-50 px-2 py-0.5 text-[10px] font-medium text-anime-700">Recommended</span>
            )}
          </div>
          <div className="mt-1 text-sm font-medium text-text-primary">{entry.id}</div>
          <div className="mt-1 text-xs text-text-muted">{entry.summary}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          {isInstalled && (
            <span className="rounded-pill bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
              Installed
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SettingsStatCard label="Size" value={entry.installSizeMb ? `${entry.installSizeMb} MB` : 'N/A'} />
        <SettingsStatCard label="RAM" value={entry.minRamGb ? `${entry.minRamGb} GB+` : 'Light'} />
        <SettingsStatCard label="Quality" value={entry.qualityTier} />
        {entry.accuracy && <SettingsStatCard label="Accuracy" value={entry.accuracy} />}
      </div>

      {entry.description && (
        <div className="mt-2 text-xs text-text-muted">{entry.description}</div>
      )}

      {entry.languages.length > 0 && entry.languages[0] !== 'en' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.languages.slice(0, 6).map((lang) => (
            <span key={lang} className="rounded-pill border border-anime-100 bg-white px-2 py-0.5 text-[10px] text-text-secondary">
              {lang}
            </span>
          ))}
          {entry.languages.length > 6 && <span className="text-[10px] text-text-muted">+{entry.languages.length - 6} more</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {entry.requiresInstall && !isInstalled && (
          <Button type="button" size="sm" onClick={onInstall}>
            Install
          </Button>
        )}
        {entry.requiresInstall && isInstalled && (
          <Button type="button" variant="secondary" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
        {entry.docsUrl && (
          <Button asChild variant="muted" size="sm">
            <a href={entry.docsUrl} target="_blank" rel="noreferrer">Docs</a>
          </Button>
        )}
      </div>
    </div>
  );
}
