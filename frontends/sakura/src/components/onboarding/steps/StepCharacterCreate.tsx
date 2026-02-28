import { useState, useEffect } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { api } from '../../../lib/api';
import { CHARACTER_PRESETS, wizardInputStyle } from '../../../data/presets';
import type { WizardStepProps } from '../../wizard/WizardShell';

/**
 * Onboarding Step 4: Character Creation.
 *
 * Shows 4 personality presets (Aria, Kai, Luna, Rex) in a 2x2 grid,
 * an optional avatar gallery picker from scanned images, and a name field.
 */
export function StepCharacterCreate({ onNext, onSkip, wizardData }: WizardStepProps) {
  const { loadCharacters, selectCharacter } = useAppStore();
  const [selected, setSelected] = useState<typeof CHARACTER_PRESETS[0] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);

  // Load available images from wizardData or fetch fresh
  useEffect(() => {
    const cached = wizardData.availableImages as string[] | undefined;
    if (cached && cached.length > 0) {
      setGalleryImages(cached);
    } else {
      api.scanImages().then(setGalleryImages).catch(() => {});
    }
  }, [wizardData.availableImages]);

  const pickPreset = (preset: typeof CHARACTER_PRESETS[0]) => {
    setSelected(preset);
    setName(preset.name);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const data: Record<string, unknown> = {
        name: name.trim(),
        system_prompt: selected?.prompt ?? `You are ${name.trim()}, a friendly and interesting AI companion.`,
        greeting_message: selected?.greeting ?? `Hello! I'm ${name.trim()}. Nice to meet you!`,
      };
      if (avatarUrl) data.avatar_url = avatarUrl;
      const char = await api.createCharacter(data);
      await loadCharacters();
      selectCharacter(char);
      onNext();
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <h2 className="char-name-display mb-1" style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}>
        Create your first character
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Pick a personality or enter a name and we'll generate one for you.
      </p>

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {CHARACTER_PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => pickPreset(p)}
            className="text-left p-3 rounded-xl transition-all"
            style={{
              backgroundColor: selected?.name === p.name ? 'var(--color-accent-soft)' : 'var(--color-surface)',
              border: selected?.name === p.name ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{p.icon}</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
              {selected?.name === p.name && <Check size={10} style={{ color: 'var(--color-accent)', marginLeft: 'auto' }} />}
            </div>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{p.desc}</p>
          </button>
        ))}
      </div>

      {/* Avatar gallery */}
      {galleryImages.length > 0 && (
        <div className="mb-4">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            Avatar (optional)
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {galleryImages.slice(0, 16).map(img => {
              const url = img.startsWith('/') ? img : `/files/images/${img}`;
              const isSelected = avatarUrl === url;
              return (
                <button
                  key={img}
                  onClick={() => setAvatarUrl(isSelected ? null : url)}
                  className="flex-shrink-0 w-[52px] h-[52px] rounded-lg overflow-hidden transition-all"
                  style={{
                    border: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                    opacity: isSelected ? 1 : 0.75,
                  }}
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Name field */}
      <div className="mb-6">
        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="w-full text-sm px-3 py-2.5 outline-none"
          style={wizardInputStyle}
          placeholder="Give your character a name..."
          autoFocus
        />
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onSkip} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Skip for now
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          {creating
            ? <><Loader2 size={14} className="animate-spin" /> Creating...</>
            : <><Sparkles size={14} /> Create</>}
        </button>
      </div>
    </div>
  );
}
