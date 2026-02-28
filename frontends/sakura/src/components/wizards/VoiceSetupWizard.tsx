import { useState, useEffect } from 'react';
import { Volume2, Play, Loader2, Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../wizard/WizardShell';
import { api } from '../../lib/api';
import type { VoiceEntry } from '../../lib/types';

/* ── Provider data ────────────────────────────────────────────────────── */

interface VoiceProviderOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  quality: number;
  speed: number;
  cpuOnly: boolean;
  cloningSupport: boolean;
}

const VOICE_PROVIDER_OPTIONS: VoiceProviderOption[] = [
  { id: 'edge', name: 'Edge-TTS', badge: 'Cloud', description: 'Microsoft neural voices, instant setup', quality: 3, speed: 5, cpuOnly: true, cloningSupport: false },
  { id: 'kokoro', name: 'Kokoro', badge: 'Local CPU', description: 'Best local quality, 82M parameters', quality: 4, speed: 4, cpuOnly: true, cloningSupport: false },
  { id: 'chatterbox', name: 'Chatterbox', badge: 'GPU', description: 'Voice cloning with 10-second samples', quality: 5, speed: 3, cpuOnly: false, cloningSupport: true },
  { id: 'f5-tts', name: 'F5-TTS', badge: 'GPU', description: 'High-quality zero-shot voice conversion', quality: 5, speed: 2, cpuOnly: false, cloningSupport: true },
  { id: 'parler', name: 'Parler-TTS', badge: 'GPU', description: 'Text-described voice generation', quality: 4, speed: 2, cpuOnly: false, cloningSupport: false },
  { id: 'melotts', name: 'MeloTTS', badge: 'CPU', description: 'Lightweight multi-lingual synthesis', quality: 3, speed: 5, cpuOnly: true, cloningSupport: false },
];

/* ── Stars helper ─────────────────────────────────────────────────────── */

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
      {'★'.repeat(count)}{'☆'.repeat(max - count)}
    </span>
  );
}

/* ── Step 0: Provider Selection ───────────────────────────────────────── */

function StepProviderSelect({ onNext, wizardData, setWizardData }: WizardStepProps) {
  const [selected, setSelected] = useState<string>(wizardData.voiceProvider as string || '');

  const handleSelect = (id: string) => {
    setSelected(id);
    setWizardData({ voiceProvider: id });
  };

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Choose a voice engine. You can always change this later.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {VOICE_PROVIDER_OPTIONS.map(p => (
          <button
            key={p.id}
            onClick={() => handleSelect(p.id)}
            className="flex items-start gap-3 p-3 rounded-xl text-left transition-all"
            style={{
              backgroundColor: selected === p.id ? 'var(--color-accent-soft)' : 'var(--color-surface)',
              border: selected === p.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{
                  backgroundColor: p.cpuOnly ? 'var(--color-accent-soft)' : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                  color: p.cpuOnly ? 'var(--color-accent)' : 'var(--color-warning)',
                }}>
                  {p.badge}
                </span>
                {p.cloningSupport && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                    color: 'var(--color-success)',
                  }}>
                    Cloning
                  </span>
                )}
              </div>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{p.description}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Quality: <Stars count={p.quality} /></span>
                <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Speed: <Stars count={p.speed} /></span>
              </div>
            </div>
            {selected === p.id && <Check size={14} style={{ color: 'var(--color-accent)', marginTop: 4 }} />}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 1: Browse & Preview Voices ──────────────────────────────────── */

function StepBrowseVoices({ onNext, wizardData, setWizardData }: WizardStepProps) {
  const provider = wizardData.voiceProvider as string;
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>(wizardData.selectedVoice as string || '');
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getVoices(provider)
      .then(v => {
        setVoices(v);
        if (v.length > 0 && !selected) {
          setSelected(v[0].id);
          setWizardData({ selectedVoice: v[0].id });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [provider]);

  const handleSelect = (id: string) => {
    setSelected(id);
    setWizardData({ selectedVoice: id });
  };

  const playPreview = async (voiceId: string) => {
    if (playing) return;
    setPlaying(voiceId);
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello! Nice to meet you.', voice_id: voiceId, provider }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          const audio = new Audio(data.audio_url);
          audio.onended = () => setPlaying(null);
          audio.onerror = () => setPlaying(null);
          await audio.play();
          return;
        }
      }
    } catch { /* non-critical */ }
    setPlaying(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2">
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading voices...</span>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        Choose a voice for {provider}. Tap the play button to preview.
      </p>
      <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto pr-1 mb-5">
        {voices.map(v => (
          <button
            key={v.id}
            onClick={() => handleSelect(v.id)}
            className="flex items-center gap-2 p-2.5 rounded-lg text-left transition-all"
            style={{
              backgroundColor: selected === v.id ? 'var(--color-accent-soft)' : 'var(--color-background)',
              border: selected === v.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); playPreview(v.id); }}
              className="p-1 rounded-full flex-shrink-0"
              style={{ color: playing === v.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
            >
              {playing === v.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{v.name}</p>
              {v.language && (
                <p className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {v.language}{v.gender ? ` · ${v.gender}` : ''}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      {voices.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
          No voices available for this provider.
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Confirm ──────────────────────────────────────────────────── */

function StepConfirm({ onNext, wizardData }: WizardStepProps) {
  const { saveConfig } = useAppStore();
  const [saving, setSaving] = useState(false);

  const provider = wizardData.voiceProvider as string;
  const voiceId = wizardData.selectedVoice as string;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig({
        tts: { provider, voice_id: voiceId },
        voice_setup_completed: true,
      } as Record<string, unknown>);
      useWizardStore.getState().voiceSetupCompleted = true;
    } catch { /* best effort */ }
    setSaving(false);
    onNext();
  };

  return (
    <div className="text-center py-4">
      <div
        className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
      >
        <Volume2 size={28} />
      </div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Ready to save</h3>
      <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        Provider: <strong>{provider}</strong>
      </p>
      <p className="text-xs mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Voice: <strong>{voiceId}</strong>
      </p>
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all mx-auto disabled:opacity-50"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Set as default voice
      </button>
    </div>
  );
}

/* ── Wizard assembly ──────────────────────────────────────────────────── */

const STEPS: WizardStepDef[] = [
  { id: 'provider', title: 'Choose Engine', component: StepProviderSelect },
  { id: 'browse', title: 'Browse Voices', component: StepBrowseVoices },
  { id: 'confirm', title: 'Confirm', component: StepConfirm },
];

/**
 * Voice Setup Wizard — 3-step modal for configuring TTS.
 *
 * Accessible from: Settings > Voice tab, Setup Guides hub, feature discovery tips.
 */
export function VoiceSetupWizard() {
  const { closeWizard } = useWizardStore();

  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="Voice Setup"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
