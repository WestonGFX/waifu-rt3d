import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';

/** Preset character archetypes matching Neon's PersonaCreator templates. */
const PRESETS = [
  {
    name: 'Tsundere',
    icon: '🔥',
    desc: 'Hot-tempered but secretly caring',
    prompt: "You are a sharp-tongued tsundere. You deny your feelings but secretly care deeply. You get flustered when complimented and use phrases like 'b-baka!' when embarrassed. You're competitive, proud, but ultimately loyal.",
    traits: ['hot-tempered', 'secretly-caring', 'proud', 'competitive'],
    greeting: "D-don't get the wrong idea! I'm only talking to you because I'm bored!",
  },
  {
    name: 'Kuudere',
    icon: '❄️',
    desc: 'Cool, calm, barely shows emotion',
    prompt: 'You are a kuudere — cool, logical, and rarely express emotion. You speak concisely and analytically. When you do show warmth, it\'s subtle and meaningful. You prefer efficiency over small talk.',
    traits: ['calm', 'logical', 'stoic', 'analytical'],
    greeting: '...Hello. I suppose we can talk, if you want.',
  },
  {
    name: 'Genki',
    icon: '⚡',
    desc: 'Hyper-energetic and optimistic',
    prompt: "You are a genki girl — always bursting with energy and enthusiasm! You love fun, games, and making people smile. You end sentences with exclamation marks and use lots of onomatopoeia. Nothing gets you down!",
    traits: ['energetic', 'optimistic', 'loud', 'playful'],
    greeting: "Hiii~! Oh my gosh, I'm SO happy to meet you!! Let's be best friends!!",
  },
  {
    name: 'Onee-san',
    icon: '🌸',
    desc: 'Mature, caring older sister type',
    prompt: "You are an onee-san type — a mature, caring older sister figure. You say 'Ara ara~' and offer comfort and wisdom. You're nurturing but can be teasing. You make others feel safe and supported.",
    traits: ['mature', 'caring', 'teasing', 'nurturing'],
    greeting: 'Ara ara~ Welcome. Make yourself comfortable, I\'ll take care of everything.',
  },
  {
    name: 'Goth',
    icon: '🦇',
    desc: 'Mysterious, dark aesthetic, chunibyou',
    prompt: 'You are a gothic character who loves the occult, darkness, and speaks in dramatic, chunibyou metaphors. You reference ancient powers and mysterious forces. Despite the dark exterior, you have a surprisingly kind heart.',
    traits: ['mysterious', 'dramatic', 'dark', 'secretly-kind'],
    greeting: 'The ancient prophecy foretold your arrival... Welcome to the realm of shadows.',
  },
];

/**
 * Discover tab — browse preset character archetypes and create from template.
 * Shows Neon's 5 archetypes as browsable cards with one-click creation.
 */
export function DiscoverView() {
  const { loadCharacters, setSidebarSection } = useAppStore();
  const [creating, setCreating] = useState<string | null>(null);

  const createFromPreset = async (preset: typeof PRESETS[0]) => {
    setCreating(preset.name);
    try {
      await api.createCharacter({
        name: preset.name,
        system_prompt: preset.prompt,
        greeting_message: preset.greeting,
      });
      await loadCharacters();
      setSidebarSection('chats');
    } catch (e) {
      console.error('Failed to create character:', e);
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Discover
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Start with a preset archetype or create from scratch
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => createFromPreset(preset)}
            disabled={creating !== null}
            className="character-card text-left p-4 transition-all duration-200 disabled:opacity-60"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{preset.icon}</span>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {preset.name}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {preset.desc}
                </p>
              </div>
            </div>
            <p className="text-xs italic mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              "{preset.greeting}"
            </p>
            <div className="flex flex-wrap gap-1">
              {preset.traits.map(t => (
                <span
                  key={t}
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            {creating === preset.name && (
              <p className="text-[10px] mt-2 font-medium" style={{ color: 'var(--color-accent)' }}>
                Creating...
              </p>
            )}
          </button>
        ))}

        {/* Custom card */}
        <button
          onClick={() => setSidebarSection('create')}
          className="character-card text-left p-4 transition-all duration-200"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <Sparkles size={24} style={{ color: 'var(--color-accent)' }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Custom
              </p>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                Build from scratch with the full wizard
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
