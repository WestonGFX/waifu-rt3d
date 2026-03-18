import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useSettings } from '../../context/SettingsContext.tsx';
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis.ts';
import { type TTSMode, type TTSVoiceProfile } from '../../types/companion.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import {
  SETTINGS_PANEL_CARD,
  SETTINGS_PANEL_MUTED,
  SETTINGS_PANEL_SUBCARD,
  SettingsStatCard,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';
import {
  getAvailableEngines,
  listVoiceSamples,
  uploadVoiceSample,
  deleteVoiceSample,
  previewClonedVoice,
  type VoiceSample,
  type VoiceCloneEngine,
} from '../../services/voiceCloneService.ts';
import { setHelperCloneVoiceId, setHelperTTSVoice } from '../../providers/registry.ts';
import { synthesizeSpeech, type TTSAudioResponse } from '../../services/helperClient.ts';

const MODE_LABELS: Record<TTSMode, string> = {
  'local-only': 'Local only',
  'cloud-only': 'Cloud only',
  hybrid: 'Hybrid',
};

const CHUNKING_LABELS: Record<TTSVoiceProfile['chunkingMode'], string> = {
  sentence: 'Sentence aware',
  paragraph: 'Paragraph aware',
  'provider-default': 'Provider default',
};

export default function VoiceSettingsPanel() {
  const {
    state: companionState,
    activeVoiceProfile,
    setCurrentVoiceProfile,
    saveVoiceProfile,
    saveProviderSecret,
    deleteProviderSecret,
  } = useCompanion();
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();
  const { speak, isSupported, supportsProfile } = useSpeechSynthesis();
  const [previewText, setPreviewText] = useState('Senpai, did you really tune my voice settings just for me?');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [draftProfile, setDraftProfile] = useState<TTSVoiceProfile | null>(activeVoiceProfile);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [isSavingSecret, setIsSavingSecret] = useState(false);

  // ── Voice Clone state ──
  const [cloneEngines, setCloneEngines] = useState<VoiceCloneEngine[]>([]);
  const [cloneSamples, setCloneSamples] = useState<VoiceSample[]>([]);
  const [cloneSelectedEngine, setCloneSelectedEngine] = useState<VoiceCloneEngine | ''>('');
  const [cloneActiveVoiceId, setCloneActiveVoiceId] = useState('');
  const [cloneIsUploading, setCloneIsUploading] = useState(false);
  const [cloneIsPreviewing, setCloneIsPreviewing] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftProfile(activeVoiceProfile);
  }, [activeVoiceProfile]);

  // ── Voice Clone: fetch engines + samples for the active persona ──
  const personaId = companionState.currentPersonaId;
  useEffect(() => {
    void getAvailableEngines()
      .then((engines) => {
        setCloneEngines(engines);
        if (engines.length > 0 && !cloneSelectedEngine) {
          setCloneSelectedEngine(engines[0]);
        }
      })
      .catch(() => setCloneEngines([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCloneSamples = useCallback(async () => {
    if (!personaId) return;
    try {
      const samples = await listVoiceSamples(personaId);
      setCloneSamples(samples);
    } catch {
      setCloneSamples([]);
    }
  }, [personaId]);

  useEffect(() => {
    void refreshCloneSamples();
  }, [refreshCloneSamples]);

  /**
   * Handle audio file upload for voice cloning.
   * Sends the file to the helper, refreshes the sample list on success.
   */
  const handleCloneUpload = useCallback(async (file: File) => {
    if (!personaId || !cloneSelectedEngine) return;
    setCloneIsUploading(true);
    setCloneError(null);
    try {
      await uploadVoiceSample(personaId, file, cloneSelectedEngine);
      await refreshCloneSamples();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCloneIsUploading(false);
    }
  }, [personaId, cloneSelectedEngine, refreshCloneSamples]);

  /**
   * Activate a voice sample as the primary clone voice.
   * Updates the singleton HelperCloneTTSProvider instance via the registry setter.
   */
  const handleCloneActivate = useCallback((sampleId: string) => {
    setHelperCloneVoiceId(sampleId);
    setCloneActiveVoiceId(sampleId);
  }, []);

  /**
   * Preview a cloned voice sample via the helper's synthesis endpoint.
   * Plays the result through a temporary Audio element.
   */
  const handleClonePreview = useCallback(async (sampleId: string) => {
    setCloneIsPreviewing(true);
    setCloneError(null);
    try {
      const blob = await previewClonedVoice(sampleId, 'Hello senpai, this is my new voice!');
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setCloneIsPreviewing(false);
    }
  }, []);

  /**
   * Delete a voice sample from the helper and refresh the list.
   */
  const handleCloneDelete = useCallback(async (sampleId: string) => {
    setCloneError(null);
    try {
      await deleteVoiceSample(sampleId);
      if (cloneActiveVoiceId === sampleId) {
        setHelperCloneVoiceId('');
        setCloneActiveVoiceId('');
      }
      await refreshCloneSamples();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [cloneActiveVoiceId, refreshCloneSamples]);

  const availableVoices = useMemo(() => {
    if (!draftProfile) return [];
    return companionState.ttsVoices.filter((voice) => voice.providerId === draftProfile.primary.providerId);
  }, [companionState.ttsVoices, draftProfile]);

  const recommendedFemaleVoices = useMemo(() => (
    companionState.ttsVoices.filter((voice) => voice.gender === 'female' && voice.language.startsWith('en'))
  ), [companionState.ttsVoices]);

  const fallbackProvider = draftProfile?.fallbacks[0] ?? null;
  const elevenLabsConfigured = companionState.secretStatus?.elevenlabs.stored ?? false;

  const availableFallbackVoices = useMemo(() => {
    if (!fallbackProvider) return [];
    return companionState.ttsVoices.filter((voice) => voice.providerId === fallbackProvider.providerId);
  }, [companionState.ttsVoices, fallbackProvider]);

  const activePrimaryVoice = useMemo(() => {
    if (!draftProfile?.primary.voiceId) return null;
    return companionState.ttsVoices.find((voice) => voice.id === draftProfile.primary.voiceId && voice.providerId === draftProfile.primary.providerId) ?? null;
  }, [companionState.ttsVoices, draftProfile?.primary.providerId, draftProfile?.primary.voiceId]);

  const handleProfilePatch = (patch: Partial<TTSVoiceProfile>) => {
    if (!draftProfile) return;
    setDraftProfile({
      ...draftProfile,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const isDirty = useMemo(() => {
    if (!draftProfile || !activeVoiceProfile) return false;
    return JSON.stringify(draftProfile) !== JSON.stringify(activeVoiceProfile);
  }, [activeVoiceProfile, draftProfile]);

  const handlePrimaryProviderChange = (providerId: string) => {
    if (!draftProfile) return;
    const firstVoice = companionState.ttsVoices.find((voice) => voice.providerId === providerId);
    handleProfilePatch({
      primary: {
        providerId,
        voiceId: firstVoice?.id,
      },
    });
  };

  const handlePrimaryVoiceChange = (voiceId: string) => {
    if (!draftProfile) return;
    const voice = availableVoices.find((candidate) => candidate.id === voiceId);
    handleProfilePatch({
      primary: { ...draftProfile.primary, voiceId: voiceId || undefined },
    });
    if (voice?.previewText) {
      setPreviewText(voice.previewText);
    }
  };

  const applyQuickVoice = (providerId: string, voiceId: string) => {
    if (!draftProfile) return;
    const voice = companionState.ttsVoices.find((candidate) => candidate.providerId === providerId && candidate.id === voiceId);
    handleProfilePatch({
      primary: { providerId, voiceId },
    });
    if (voice?.previewText) {
      setPreviewText(voice.previewText);
    }
  };

  const handleFallbackPatch = (providerId: string, voiceId?: string) => {
    if (!draftProfile) return;

    if (!providerId) {
      handleProfilePatch({ fallbacks: [] });
      return;
    }

    handleProfilePatch({
      fallbacks: [{
        providerId,
        voiceId,
      }],
    });
  };

  const handleSaveProfile = async () => {
    if (!draftProfile) return;
    await saveVoiceProfile(draftProfile);
    await setCurrentVoiceProfile(draftProfile.id);
  };

  const handleSaveElevenLabsKey = async () => {
    if (!elevenLabsApiKey.trim()) return;
    setIsSavingSecret(true);
    try {
      await saveProviderSecret('elevenlabs', elevenLabsApiKey.trim());
      setElevenLabsApiKey('');
    } finally {
      setIsSavingSecret(false);
    }
  };

  const handleDeleteElevenLabsKey = async () => {
    setIsSavingSecret(true);
    try {
      await deleteProviderSecret('elevenlabs');
      setElevenLabsApiKey('');
    } finally {
      setIsSavingSecret(false);
    }
  };

  const handlePreview = async () => {
    if (!draftProfile || !supportsProfile(draftProfile) || isPreviewing || !previewText.trim()) return;
    setIsPreviewing(true);
    try {
      await speak(previewText, draftProfile);
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={SETTINGS_PANEL_MUTED}>
        Voice profiles decide what actually speaks, how aggressively the app falls back when something fails, and how long replies are chunked before playback. If you only change one thing here, change the primary provider and preview it.
      </div>

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Profile"
          title="Voice profile"
          description="Choose a provider chain, try voices before saving, and keep browser speech as the emergency fallback instead of the main path."
          aside={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isDirty ? 'warning' : 'success'}>
                {isDirty ? 'Unsaved draft' : 'Saved'}
              </Badge>
              <Button
                onClick={handleSaveProfile}
                disabled={!draftProfile || !isDirty}
              >
                Save profile
              </Button>
            </div>
          )}
        />

        <div className={`mt-3 ${SETTINGS_PANEL_SUBCARD}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-anime-600">Quick female English picks</div>
              <p className="mt-1 text-xs text-text-muted">
                Tap a voice to swap the draft instantly. Preview should react immediately now, no save ritual required.
              </p>
            </div>
            <span className="text-[11px] text-text-muted">{recommendedFemaleVoices.length} voices detected</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendedFemaleVoices.map((voice) => (
              <Button
                key={`${voice.providerId}-${voice.id}`}
                onClick={() => applyQuickVoice(voice.providerId, voice.id)}
                title={voice.previewText ?? `${voice.label} (${voice.language})`}
                variant={draftProfile?.primary.providerId === voice.providerId && draftProfile?.primary.voiceId === voice.id ? 'default' : 'secondary'}
                size="sm"
                className={[
                  draftProfile?.primary.providerId === voice.providerId && draftProfile?.primary.voiceId === voice.id
                    ? ''
                    : '',
                ].join(' ')}
              >
                {voice.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,220px)_1fr]">
          <ScrollArea className="max-h-[38rem] pr-1">
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Saved profiles
            </div>
            {companionState.voiceProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => void setCurrentVoiceProfile(profile.id)}
                className={[
                  'w-full rounded-anime border px-3 py-2 text-left transition-colors',
                  activeVoiceProfile?.id === profile.id
                    ? 'border-anime-400 bg-anime-50 text-anime-700'
                  : 'border-anime-100 bg-white text-text-secondary hover:bg-anime-50',
                ].join(' ')}
              >
                <div className="text-sm font-medium">{profile.label}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">
                  {MODE_LABELS[profile.mode]}
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  {profile.primary.providerId}
                </div>
              </button>
            ))}
          </div>
          </ScrollArea>

          <div className={`space-y-3 ${SETTINGS_PANEL_SUBCARD}`}>
            {!draftProfile ? (
              <p className="text-sm text-text-muted">Select a voice profile.</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <SettingsStatCard label="Mode" value={MODE_LABELS[draftProfile.mode]} />
                  <SettingsStatCard label="Primary" value={draftProfile.primary.providerId} />
                  <SettingsStatCard label="Voice" value={activePrimaryVoice?.label ?? 'Provider default'} />
                  <SettingsStatCard label="Fallback" value={fallbackProvider?.providerId ?? 'None'} />
                </div>

                <div className="rounded-[18px] border border-anime-100/80 bg-white/82 p-3">
                  <SettingsSectionHeader
                    eyebrow="Preview"
                    title="Try the draft voice"
                    description="Change provider, voice, chunking, or gain and test it here before saving. This preview always follows the current draft."
                    aside={(
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => void handlePreview()}
                        disabled={!draftProfile || !supportsProfile(draftProfile) || isPreviewing}
                      >
                        {isPreviewing ? 'Previewing…' : 'Preview voice'}
                      </Button>
                    )}
                  />

                  <label className="mt-3 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">Preview line</span>
                    <Textarea
                      value={previewText}
                      onChange={(event) => setPreviewText(event.target.value)}
                      rows={3}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const selectedVoice = availableVoices.find((voice) => voice.id === draftProfile.primary.voiceId);
                          if (selectedVoice?.previewText) {
                            setPreviewText(selectedVoice.previewText);
                          }
                        }}
                      >
                        Use selected voice sample
                      </Button>
                      <span className="text-[11px] text-text-muted">
                        {draftProfile && supportsProfile(draftProfile)
                          ? 'Draft preview is ready'
                          : (isSupported ? 'Saved profile preview is ready' : 'Helper offline, browser fallback only')}
                      </span>
                    </div>
                  </label>
                </div>

                <div className={SETTINGS_PANEL_SUBCARD}>
                  <SettingsSectionHeader
                    eyebrow="Routing"
                    title="Provider chain"
                    description="This decides what the app tries first, what exact voice it asks for, and what happens if that provider is unavailable."
                  />
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Label</span>
                      <Input
                        value={draftProfile.label}
                        onChange={(event) => handleProfilePatch({ label: event.target.value })}
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Voice mode</span>
                      <Select value={draftProfile.mode} onValueChange={(value) => handleProfilePatch({ mode: value as TTSMode })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MODE_LABELS).map(([mode, label]) => (
                            <SelectItem key={mode} value={mode}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Primary provider</span>
                      <Select value={draftProfile.primary.providerId} onValueChange={handlePrimaryProviderChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {companionState.ttsProviders.map((provider) => (
                            <SelectItem key={provider.providerId} value={provider.providerId}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Primary voice</span>
                      <Select value={draftProfile.primary.voiceId ?? '__provider-default__'} onValueChange={(value) => handlePrimaryVoiceChange(value === '__provider-default__' ? '' : value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__provider-default__">Provider default</SelectItem>
                          {availableVoices.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                              {voice.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-text-muted">
                        Pick a concrete voice if the provider exposes several options. The draft voice is what preview uses right now, even before you save.
                      </span>
                    </label>
                  </div>

                  {draftProfile.mode === 'hybrid' && (
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-text-secondary">Fallback provider</span>
                        <Select value={fallbackProvider?.providerId ?? '__no-fallback__'} onValueChange={(value) => handleFallbackPatch(value === '__no-fallback__' ? '' : value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__no-fallback__">No fallback</SelectItem>
                            {companionState.ttsProviders
                              .filter((provider) => provider.providerId !== draftProfile.primary.providerId)
                              .map((provider) => (
                                <SelectItem key={provider.providerId} value={provider.providerId}>
                                  {provider.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-text-secondary">Fallback voice</span>
                        <Select
                          value={fallbackProvider?.voiceId ?? '__provider-default__'}
                          onValueChange={(value) => handleFallbackPatch(
                            fallbackProvider?.providerId ?? '',
                            value === '__provider-default__' ? undefined : value,
                          )}
                          disabled={!fallbackProvider}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__provider-default__">Provider default</SelectItem>
                            {availableFallbackVoices.map((voice) => (
                              <SelectItem key={voice.id} value={voice.id}>
                                {voice.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                  )}
                </div>

                <div className={SETTINGS_PANEL_SUBCARD}>
                  <SettingsSectionHeader
                    eyebrow="Playback"
                    title="How speech behaves"
                    description="Use these controls to tune pacing, loudness, and chunking without changing the actual voice identity."
                  />
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Speech rate</span>
                      <input
                        type="range"
                        min="0.75"
                        max="1.25"
                        step="0.01"
                        value={draftProfile.playbackRate}
                        onChange={(event) => handleProfilePatch({ playbackRate: Number(event.target.value) })}
                        className="accent-anime-500"
                      />
                      <span className="text-xs text-text-muted">{draftProfile.playbackRate.toFixed(2)}x</span>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Playback gain</span>
                      <input
                        type="range"
                        min="-12"
                        max="6"
                        step="1"
                        value={draftProfile.playbackGainDb}
                        onChange={(event) => handleProfilePatch({ playbackGainDb: Number(event.target.value) })}
                        className="accent-anime-500"
                      />
                      <span className="text-xs text-text-muted">
                        {draftProfile.playbackGainDb > 0 ? '+' : ''}
                        {draftProfile.playbackGainDb} dB
                      </span>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Chunking mode</span>
                      <Select
                        value={draftProfile.chunkingMode}
                        onValueChange={(value) => handleProfilePatch({
                          chunkingMode: value as TTSVoiceProfile['chunkingMode'],
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CHUNKING_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-text-muted">
                        Sentence-aware chunking is usually the safest option for long replies and cloud providers.
                      </span>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Auto-read</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => settingsDispatch({
                          type: 'SET_AUTO_READ_ASSISTANT',
                          payload: !settingsState.autoReadAssistant,
                        })}
                      >
                        {settingsState.autoReadAssistant ? 'Enabled for fresh replies' : 'Disabled'}
                      </Button>
                      <span className="text-xs text-text-muted">
                        Keep this enabled if you want every completed assistant reply to start speaking automatically.
                      </span>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Voice interruption</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => settingsDispatch({
                          type: 'SET_VOICE_INTERRUPTION',
                          payload: !settingsState.voiceInterruptionEnabled,
                        })}
                      >
                        {settingsState.voiceInterruptionEnabled ? 'Enabled (experimental)' : 'Disabled'}
                      </Button>
                      <span className="text-xs text-text-muted">
                        Speak to interrupt the AI mid-speech. Uses voice activity detection to stop TTS playback when you start talking.
                      </span>
                    </label>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      </div>

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Cloud"
          title="ElevenLabs cloud access"
          description="Store the ElevenLabs API key in the local helper so premium cloud voices can appear in the picker and act as a hybrid fallback."
          aside={(
            <span
              className={[
                'rounded-pill px-2 py-1 text-[11px] font-medium',
                elevenLabsConfigured
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700',
              ].join(' ')}
            >
              {elevenLabsConfigured ? 'Configured' : 'Not configured'}
            </span>
          )}
        />

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input
            type="password"
            value={elevenLabsApiKey}
            onChange={(event) => setElevenLabsApiKey(event.target.value)}
            placeholder={elevenLabsConfigured ? 'Replace stored ElevenLabs key' : 'Paste ElevenLabs API key'}
          />
          <Button
            size="sm"
            onClick={() => void handleSaveElevenLabsKey()}
            disabled={isSavingSecret || !elevenLabsApiKey.trim()}
          >
            {isSavingSecret ? 'Saving…' : elevenLabsConfigured ? 'Replace key' : 'Save key'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDeleteElevenLabsKey()}
            disabled={isSavingSecret || !elevenLabsConfigured}
          >
            Remove key
          </Button>
        </div>

        <p className="mt-2 text-xs text-text-muted">
          Backend: {companionState.secretStatus?.elevenlabs.backend ?? 'helper unavailable'}.
        </p>
      </div>

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Clone"
          title="Voice cloning"
          description="Upload audio samples and use the helper's local clone engine to give your companion a unique voice. Requires a clone engine (Fish Speech, F5-TTS, or CosyVoice) installed in the helper runtime."
          aside={(
            <Badge variant={cloneEngines.length > 0 ? 'success' : 'secondary'}>
              {cloneEngines.length > 0
                ? `${cloneEngines.length} engine${cloneEngines.length > 1 ? 's' : ''} ready`
                : 'No engines detected'}
            </Badge>
          )}
        />

        {cloneError && (
          <p className="mt-2 text-xs text-red-600">{cloneError}</p>
        )}

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary">Available engines</span>
            {cloneEngines.length === 0 ? (
              <p className="text-xs text-text-muted">
                No voice-clone engines found. Install Fish Speech, F5-TTS, or CosyVoice in the helper environment.
              </p>
            ) : (
              <Select
                value={cloneSelectedEngine}
                onValueChange={(value) => setCloneSelectedEngine(value as VoiceCloneEngine)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select engine" />
                </SelectTrigger>
                <SelectContent>
                  {cloneEngines.map((engine) => (
                    <SelectItem key={engine} value={engine}>{engine}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary">Upload audio sample</span>
            <input
              ref={cloneFileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCloneUpload(file);
                event.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={cloneEngines.length === 0 || cloneIsUploading || !personaId}
              onClick={() => cloneFileInputRef.current?.click()}
            >
              {cloneIsUploading ? 'Uploading…' : 'Choose audio file'}
            </Button>
            <p className="text-xs text-text-muted">
              WAV, MP3, or OGG. 5–30 seconds of clean speech works best.
            </p>
          </div>
        </div>

        {cloneSamples.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-semibold text-text-secondary">Samples for this persona</span>
            <div className="mt-2 space-y-2">
              {cloneSamples.map((sample) => (
                <div
                  key={sample.id}
                  className={[
                    'flex items-center justify-between rounded-anime border px-3 py-2',
                    cloneActiveVoiceId === sample.id
                      ? 'border-anime-400 bg-anime-50'
                      : 'border-anime-100 bg-white',
                  ].join(' ')}
                >
                  <div>
                    <div className="text-sm font-medium">{sample.label}</div>
                    <div className="text-[11px] text-text-muted">
                      {sample.engine} · {sample.durationSec.toFixed(1)}s
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleClonePreview(sample.id)}
                      disabled={cloneIsPreviewing}
                    >
                      {cloneIsPreviewing ? '…' : 'Preview'}
                    </Button>
                    <Button
                      variant={cloneActiveVoiceId === sample.id ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => handleCloneActivate(sample.id)}
                    >
                      {cloneActiveVoiceId === sample.id ? 'Active' : 'Activate'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleCloneDelete(sample.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Engines"
          title="TTS module status"
          description="All available speech synthesis engines detected by the helper. Green means ready to use; install or configure the ones you need."
          aside={(
            <Badge variant={companionState.ttsProviders.filter((p) => p.available).length > 0 ? 'success' : 'secondary'}>
              {companionState.ttsProviders.filter((p) => p.available).length} / {companionState.ttsProviders.length} ready
            </Badge>
          )}
        />

        <div className="mt-3 space-y-2">
          {companionState.ttsProviders.map((provider) => {
            const voices = companionState.ttsVoices.filter((v) => v.providerId === provider.providerId);
            return (
              <div
                key={provider.providerId}
                className={[
                  'rounded-anime border px-3 py-2.5 transition-colors',
                  provider.available
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-anime-100 bg-white/60',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.label}</span>
                      <span
                        className={[
                          'rounded-pill px-2 py-0.5 text-[10px] font-medium',
                          provider.available
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-50 text-amber-700',
                        ].join(' ')}
                      >
                        {provider.installState}
                      </span>
                      <span className="rounded-pill bg-anime-50 px-2 py-0.5 text-[10px] text-anime-600">
                        {provider.qualityTier}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-text-muted">
                      <span>{provider.local ? 'Local' : 'Cloud'}</span>
                      {provider.requiresApiKey && <span>API key required</span>}
                      {provider.requiresInstall && <span>Requires install</span>}
                      <span>{voices.length} voice{voices.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 gap-1.5">
                    {provider.available && voices.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const voice = voices[0];
                          setHelperTTSVoice(provider.providerId, voice.id);
                          void (async () => {
                            try {
                              const response: TTSAudioResponse = await synthesizeSpeech({
                                text: 'Hello senpai, this is my voice!',
                                provider: { providerId: provider.providerId, voiceId: voice.id },
                              });
                              const binary = atob(response.audioBase64);
                              const bytes = new Uint8Array(binary.length);
                              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                              const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                              const ctx = new AudioCtx();
                              const buffer = await ctx.decodeAudioData(bytes.buffer);
                              const source = ctx.createBufferSource();
                              source.buffer = buffer;
                              source.connect(ctx.destination);
                              source.start(0);
                            } catch (err) {
                              console.warn('[VoiceSettings] Preview failed:', err);
                            }
                          })();
                        }}
                      >
                        Preview
                      </Button>
                    )}
                    {provider.docsUrl && (
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-anime border border-anime-200 bg-white px-2.5 py-1 text-[11px] font-medium text-anime-600 hover:bg-anime-50"
                      >
                        Docs
                      </a>
                    )}
                  </div>
                </div>

                {provider.available && voices.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {voices.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => {
                          setHelperTTSVoice(provider.providerId, voice.id);
                          if (draftProfile) {
                            handleProfilePatch({
                              primary: { providerId: provider.providerId, voiceId: voice.id },
                            });
                          }
                        }}
                        className={[
                          'rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors',
                          draftProfile?.primary.providerId === provider.providerId && draftProfile?.primary.voiceId === voice.id
                            ? 'border-anime-400 bg-anime-100 text-anime-700'
                            : 'border-anime-200 bg-white text-text-secondary hover:bg-anime-50',
                        ].join(' ')}
                        title={`${voice.label} (${voice.language}, ${voice.gender})`}
                      >
                        {voice.label}
                      </button>
                    ))}
                  </div>
                )}

                {!provider.available && provider.requiresApiKey && (
                  <p className="mt-2 text-xs text-amber-600">
                    Store an API key in the ElevenLabs section above to enable this provider.
                  </p>
                )}

                {!provider.available && provider.requiresInstall && !provider.requiresApiKey && (
                  <p className="mt-2 text-xs text-text-muted">
                    Install the {provider.label} Python package in the helper environment to enable this engine.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
