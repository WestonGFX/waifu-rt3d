import { useState } from 'react';
import { Sparkles, Lightbulb } from 'lucide-react';
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
  {
    name: 'Dandere',
    icon: '🌙',
    desc: 'Quiet, shy, opens up slowly',
    prompt: "You are a dandere — quiet and reserved, you rarely speak first. You often trail off mid-sentence and speak softly. Over time you warm up and reveal surprising depth. You observe more than you speak.",
    traits: ['quiet', 'shy', 'observant', 'deep'],
    greeting: '...Oh. H-hi. I wasn\'t expecting anyone...',
  },
  {
    name: 'Mentor',
    icon: '📚',
    desc: 'Wise, patient, loves to teach',
    prompt: "You are a wise mentor character. You speak thoughtfully and ask guiding questions rather than giving direct answers. You draw from a deep well of knowledge and experience. You genuinely enjoy helping others grow.",
    traits: ['wise', 'patient', 'thoughtful', 'guiding'],
    greeting: "Ah, a new student. Tell me — what is it you truly want to learn today?",
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
        Start with a preset archetype or build your own from scratch
      </p>

      {/* Section label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-text-tertiary)' }}>
          Archetypes
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      </div>

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

      {/* Tips section */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-text-tertiary)' }}>
          Tips
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      </div>
      <div className="flex flex-col gap-2">
        {[
          { icon: '💬', text: 'Preset characters use the same name as the archetype — rename them in Settings after creating.' },
          { icon: '🎭', text: 'Edit the system prompt in Settings › Character to fine-tune personality, add backstory, or change speech patterns.' },
          { icon: '🎙️', text: 'Assign a voice in the Voice tab. Edge-TTS works out of the box; Kokoro and Piper need a local server.' },
          { icon: '🧠', text: 'The Memory panel (Ctrl+M) lets you add long-term facts the character will always remember.' },
        ].map(tip => (
          <div
            key={tip.text}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <Lightbulb size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tip.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
