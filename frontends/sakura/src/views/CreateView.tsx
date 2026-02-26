import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Upload, Check } from 'lucide-react';
import { WizardStep } from '../components/WizardStep';
import { VoicePicker } from '../components/VoicePicker';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

const STEPS = ['Identity', 'Appearance', 'Voice', 'Personality', 'Review'];

/** Image extensions the browser can render. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/** 5-step character creation wizard with animated transitions. */
export function CreateView() {
  const { loadCharacters, setSidebarSection, selectCharacter } = useAppStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [data, setData] = useState<Partial<Character>>({
    name: '',
    system_prompt: '',
    greeting_message: '',
    voice_id: '',
    tts_provider: 'edge-tts'
  });

  // Gallery images + VRM models from server
  const [images, setImages] = useState<string[]>([]);
  const [vrmModels, setVrmModels] = useState<string[]>([]);

  useEffect(() => {
    api.scanImages().then(setImages).catch(() => {});
    api.scanVrm().then(setVrmModels).catch(() => {});
  }, []);

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
      const created = await api.createCharacter(data);
      await loadCharacters();
      // Switch to the new character's chat thread
      if (created?.id) {
        selectCharacter(created);
      } else {
        setSidebarSection('chats');
      }
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(false);
    }
  };

  /** Handle avatar file upload. */
  const handleUpload = async (file: File) => {
    try {
      const result = await api.uploadAvatar(file);
      if (result.url) {
        patch({ avatar_url: result.url });
        // Refresh gallery to include uploaded file
        api.scanImages().then(setImages).catch(() => {});
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
  };

  const fieldStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)'
  };

  return (
    <div className="p-4 max-w-xl mx-auto h-screen overflow-y-auto">
      <h2
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Create Character
      </h2>

      {/* Progress bar */}
      <div className="flex gap-1 mb-6 mt-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full transition-colors duration-300" style={{
            backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-border)'
          }} />
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
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
            <div className="space-y-5">
              {/* Avatar picker */}
              <div>
                <label className="text-sm font-medium block mb-2">Avatar Image</label>
                <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                  {images.filter(url => IMAGE_EXTS.test(url)).map(url => (
                    <button
                      key={url}
                      onClick={() => patch({ avatar_url: url })}
                      className="relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-150"
                      style={{
                        borderColor: data.avatar_url === url ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                        boxShadow: data.avatar_url === url ? 'var(--shadow-glow)' : 'none',
                      }}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {data.avatar_url === url && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                          <Check size={16} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {/* Upload button */}
                <label
                  className="mt-2 flex items-center gap-2 px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    border: '1px dashed var(--color-accent)',
                    borderRadius: 'var(--radius-button)',
                  }}
                >
                  <Upload size={14} />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                  />
                </label>
              </div>

              {/* VRM model picker */}
              <div>
                <label className="text-sm font-medium block mb-1">3D Model (VRM)</label>
                <select
                  value={data.model_vrm || ''}
                  onChange={e => patch({ model_vrm: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded"
                  style={fieldStyle}
                >
                  <option value="">None (2D only)</option>
                  {vrmModels.map(url => {
                    const name = url.split('/').pop() || url;
                    return <option key={url} value={url}>{name}</option>;
                  })}
                </select>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  VRM files in your avatars folder appear here. Drop .vrm files into backend/storage/avatars/.
                </p>
              </div>

              {/* Avatar preview */}
              {data.avatar_url && IMAGE_EXTS.test(data.avatar_url) && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}>
                  <img src={data.avatar_url} alt="Preview" className="w-14 h-14 rounded-full object-cover" />
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <p className="font-medium">{data.avatar_url.split('/').pop()}</p>
                    <p>Selected as avatar</p>
                  </div>
                </div>
              )}
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
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                {data.avatar_url && IMAGE_EXTS.test(data.avatar_url) ? (
                  <img src={data.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', fontWeight: 600 }}
                  >
                    {data.name?.[0] || '?'}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-sm">{data.name || 'Unnamed'}</h3>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {data.tts_provider} / {data.voice_id || 'Default voice'}
                  </p>
                </div>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {data.system_prompt?.slice(0, 150) || 'No persona set'}
                {(data.system_prompt?.length || 0) > 150 ? '...' : ''}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Greeting: {data.greeting_message || 'None'}
              </p>
              {data.model_vrm && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  3D Model: {data.model_vrm.split('/').pop()}
                </p>
              )}
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
            style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            Next
          </button>
        ) : (
          <button onClick={create} disabled={creating || !data.name}
            className="px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)' }}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        )}
      </div>
    </div>
  );
}
