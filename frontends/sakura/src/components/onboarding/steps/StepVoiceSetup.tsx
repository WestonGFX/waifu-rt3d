import { useState, useEffect } from 'react';
import { ChevronRight, Volume2, Play, Loader2, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { api } from '../../../lib/api';
import type { VoiceEntry } from '../../../lib/types';
import type { WizardStepProps } from '../../wizard/WizardShell';

/* ── Voice provider recommendation cards ──────────────────────────────── */

interface VoiceProviderCard {
  id: string;
  name: string;
  badge: string;
  description: string;
  icon: string;
  requiresGpu: boolean;
  minVram?: number;
}

const VOICE_PROVIDERS: VoiceProviderCard[] = [
  {
    id: 'edge',
    name: 'Edge-TTS',
    badge: 'Cloud · Free · Instant',
    description: 'Recommended for getting started',
    icon: '\uD83C\uDF10',
    requiresGpu: false,
  },
  {
    id: 'kokoro',
    name: 'Kokoro',
    badge: 'Local · CPU · 82M params',
    description: 'Best local quality, no GPU needed',
    icon: '\uD83C\uDFB5',
    requiresGpu: false,
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    badge: 'GPU · Voice Cloning',
    description: 'Clone any voice with a 10s sample',
    icon: '\uD83C\uDFA4',
    requiresGpu: true,
    minVram: 4096,
  },
];

/**
 * Onboarding Step 3: Voice / TTS Setup.
 *
 * Shows recommended TTS provider cards with hardware-aware gating,
 * then a voice preview browser for the selected provider.
 */
export function StepVoiceSetup({ onNext, onSkip, wizardData }: WizardStepProps) {
  const { saveConfig } = useAppStore();
  const vramMb = (wizardData.vram_mb as number) || 0;

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);

  // Fetch voices when provider changes
  useEffect(() => {
    if (!selectedProvider) return;
    setLoadingVoices(true);
    setVoices([]);
    setSelectedVoice(null);
    api.getVoices(selectedProvider)
      .then(v => {
        setVoices(v.slice(0, 12)); // Show up to 12 voices
        if (v.length > 0) setSelectedVoice(v[0].id);
      })
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));
  }, [selectedProvider]);

  /** Play a voice preview using the TTS preview endpoint. */
  const playPreview = async (voiceId: string) => {
    if (previewPlaying === voiceId) return;
    setPreviewPlaying(voiceId);
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! Nice to meet you.',
          voice_id: voiceId,
          provider: selectedProvider,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          const audio = new Audio(data.audio_url);
          audio.onended = () => setPreviewPlaying(null);
          audio.onerror = () => setPreviewPlaying(null);
          await audio.play();
          return;
        }
      }
    } catch { /* preview failed — non-critical */ }
    setPreviewPlaying(null);
  };

  /** Save voice selection and proceed. */
  const handleNext = async () => {
    if (selectedProvider && selectedVoice) {
      await saveConfig({
        tts: { provider: selectedProvider, voice_id: selectedVoice },
      } as Record<string, unknown>).catch(() => {});
    }
    onNext();
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <div className="flex items-center gap-3 mb-1">
        <Volume2 size={20} style={{ color: 'var(--color-accent)' }} />
        <h2 className="char-name-display" style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}>
          Set up Voice
        </h2>
      </div>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Give your characters a voice. You can change this anytime in Settings.
      </p>

      {/* Provider cards */}
      <div className="flex flex-col gap-2 mb-5">
        {VOICE_PROVIDERS.map(p => {
          const gpuBlocked = p.requiresGpu && vramMb > 0 && p.minVram && vramMb < p.minVram;
          const noGpu = p.requiresGpu && vramMb === 0;

          return (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              className="flex items-start gap-3 p-3 rounded-xl text-left transition-all"
              style={{
                backgroundColor: selectedProvider === p.id ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                border: selectedProvider === p.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                opacity: noGpu ? 0.6 : 1,
              }}
            >
              <span className="text-xl mt-0.5">{p.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {p.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}>
                    {p.badge}
                  </span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {p.description}
                </p>
                {(gpuBlocked || noGpu) && (
                  <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
                    <AlertTriangle size={10} />
                    {noGpu
                      ? 'Requires a GPU. Try Edge-TTS or Kokoro instead.'
                      : `Needs ${Math.round((p.minVram || 0) / 1024)} GB VRAM. You have ${Math.round(vramMb / 1024)} GB.`}
                  </p>
                )}
              </div>
            </button>
          );
        })}

        {/* More options link */}
        <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>
          18 engines available in Settings &gt; Voice
        </p>
      </div>

      {/* Voice preview browser */}
      {selectedProvider && (
        <div className="mb-5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Choose a voice
          </label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading voices...</span>
            </div>
          ) : voices.length === 0 ? (
            <p className="text-xs py-3 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              No voices available for this provider. You can configure it later in Settings.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
              {voices.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className="flex items-center gap-2 p-2 rounded-lg text-left transition-all"
                  style={{
                    backgroundColor: selectedVoice === v.id ? 'var(--color-accent-soft)' : 'var(--color-background)',
                    border: selectedVoice === v.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); playPreview(v.id); }}
                    className="p-1 rounded-full flex-shrink-0"
                    style={{ color: previewPlaying === v.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                  >
                    {previewPlaying === v.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Play size={12} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {v.name}
                    </p>
                    {v.language && (
                      <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {v.language} · {v.gender || 'neutral'}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onSkip} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Skip for now
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
