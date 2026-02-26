import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { WizardStep } from '../components/WizardStep';
import { VoicePicker } from '../components/VoicePicker';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

const STEPS = ['Identity', 'Appearance', 'Voice', 'Personality', 'Review'];

/** 5-step character creation wizard with animated transitions. */
export function CreateView() {
  const { loadCharacters, setActiveTab } = useAppStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [data, setData] = useState<Partial<Character>>({
    name: '',
    system_prompt: '',
    greeting_message: '',
    voice_id: '',
    tts_provider: 'edge-tts'
  });

  // Auto-populate with the recommended default voice on mount
  useEffect(() => {
    fetch('/api/tts/voices/default')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.voice_id) {
          setData(prev => ({
            ...prev,
            voice_id: prev.voice_id || d.voice_id,
            tts_provider: prev.tts_provider || d.provider,
          }));
        }
      })
      .catch(() => {});
  }, []);
  const [creating, setCreating] = useState(false);

  const patch = (updates: Partial<Character>) => setData(prev => ({ ...prev, ...updates }));

  const next = () => { setDirection('left'); setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const prev = () => { setDirection('right'); setStep(s => Math.max(s - 1, 0)); };

  const create = async () => {
    setCreating(true);
    try {
      await api.createCharacter(data);
      await loadCharacters();
      setActiveTab('chats');
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(false);
    }
  };

  const fieldStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)'
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">Create Character</h2>

      {/* Progress bar */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full" style={{
            backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-border)'
          }} />
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Step {step + 1}: {STEPS[step]}
      </p>

      {/* Steps */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <WizardStep key="identity" direction={direction}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input type="text" value={data.name || ''} onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Sakura" className="w-full text-sm px-3 py-2 rounded" style={fieldStyle} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role / Persona</label>
                <textarea value={data.system_prompt || ''} onChange={e => patch({ system_prompt: e.target.value })}
                  placeholder="Describe who this character is..." rows={4} className="w-full text-sm px-3 py-2 rounded resize-none" style={fieldStyle} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Greeting Message</label>
                <input type="text" value={data.greeting_message || ''} onChange={e => patch({ greeting_message: e.target.value })}
                  placeholder="What does she say when you open the chat?" className="w-full text-sm px-3 py-2 rounded" style={fieldStyle} />
              </div>
            </div>
          </WizardStep>
        )}

        {step === 1 && (
          <WizardStep key="appearance" direction={direction}>
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                VRM model picker and background image selection will be expanded here. For now, characters use the default model.
              </p>
              <div>
                <label className="text-sm font-medium block mb-1">Avatar URL</label>
                <input type="text" value={data.avatar_url || ''} onChange={e => patch({ avatar_url: e.target.value })}
                  placeholder="/files/images/avatar.png" className="w-full text-sm px-3 py-2 rounded" style={fieldStyle} />
              </div>
            </div>
          </WizardStep>
        )}

        {step === 2 && (
          <WizardStep key="voice" direction={direction}>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Voice</label>
                <VoicePicker
                  value={data.voice_id || ''}
                  onChange={(voiceId, provider) => patch({ voice_id: voiceId, tts_provider: provider })}
                />
              </div>
            </div>
          </WizardStep>
        )}

        {step === 3 && (
          <WizardStep key="personality" direction={direction}>
            <div className="space-y-4">
              <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Adjust personality traits that influence animation behavior.
              </p>
              {(['energy', 'confidence', 'nervousness', 'expressiveness', 'playfulness'] as const).map(trait => (
                <div key={trait}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{trait}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {((data.animation_profile as Record<string, number> | undefined)?.[trait] ?? 0.5).toFixed(1)}
                    </span>
                  </div>
                  <input type="range" min="0" max="1" step="0.1"
                    value={(data.animation_profile as Record<string, number> | undefined)?.[trait] ?? 0.5}
                    onChange={e => patch({
                      animation_profile: {
                        energy: 0.5, confidence: 0.5, nervousness: 0.3, expressiveness: 0.5, playfulness: 0.5,
                        ...(data.animation_profile || {}),
                        [trait]: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full" />
                </div>
              ))}
            </div>
          </WizardStep>
        )}

        {step === 4 && (
          <WizardStep key="review" direction={direction}>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h3 className="font-semibold text-sm mb-2">{data.name || 'Unnamed'}</h3>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                {data.system_prompt?.slice(0, 120) || 'No persona set'}
                {(data.system_prompt?.length || 0) > 120 ? '...' : ''}
              </p>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Greeting: {data.greeting_message || 'None'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Voice: {data.voice_id || 'Default'} ({data.tts_provider})
              </p>
            </div>
          </WizardStep>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={prev} disabled={step === 0}
          className="px-4 py-2 text-sm rounded-lg disabled:opacity-30"
          style={{ color: 'var(--color-text-secondary)' }}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={next}
            className="px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            Next
          </button>
        ) : (
          <button onClick={create} disabled={creating || !data.name}
            className="px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        )}
      </div>
    </div>
  );
}
