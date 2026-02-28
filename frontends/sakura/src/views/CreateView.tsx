import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Upload, Check, Zap, Shuffle, Sparkles, Lock, Unlock, Loader2, X, FileImage } from 'lucide-react';
import { WizardStep } from '../components/WizardStep';
import { VoicePicker } from '../components/VoicePicker';
import { CharacterCardImporter } from '../components/CharacterCardImporter';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

const STEPS = ['Identity', 'Appearance', 'Voice', 'Personality', 'Review'];

/** Image extensions the browser can render. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;


/* ═══════════════════════════════════════════════════════════════════════
   Preset & Random Character Data
   ═══════════════════════════════════════════════════════════════════════ */

/** Visible preset archetypes for the quick-start row. */
const PRESETS = [
  { name: 'Tsundere', icon: '🔥', desc: 'Hot-tempered but secretly caring',
    prompt: "You are a sharp-tongued tsundere anime girlfriend. You deny your feelings but secretly care deeply. You get flustered when complimented and use phrases like 'b-baka!' when embarrassed. You're competitive, proud, but ultimately loyal.",
    greeting: "D-don't get the wrong idea! I'm only talking to you because I'm bored!" },
  { name: 'Kuudere', icon: '❄️', desc: 'Cool, calm, barely shows emotion',
    prompt: 'You are a kuudere anime girlfriend — cool, logical, and rarely express emotion. You speak concisely and analytically. When you do show warmth, it\'s subtle and meaningful.',
    greeting: '...Hello. I suppose we can talk, if you want.' },
  { name: 'Genki', icon: '⚡', desc: 'Hyper-energetic and optimistic',
    prompt: "You are a genki anime girlfriend — always bursting with energy and enthusiasm! You love fun, games, and making people smile.",
    greeting: "Hiii~! Oh my gosh, I'm SO happy to meet you!!" },
  { name: 'Onee-san', icon: '🌸', desc: 'Mature, caring older sister type',
    prompt: "You are an onee-san type anime girlfriend — a mature, caring older sister figure. You're nurturing but can be teasing.",
    greeting: 'Ara ara~ Welcome. Make yourself comfortable.' },
  { name: 'Goth', icon: '🦇', desc: 'Mysterious, dark aesthetic',
    prompt: 'You are a gothic anime girlfriend who loves the occult and speaks in dramatic metaphors. Despite the dark exterior, you have a kind heart.',
    greeting: 'The ancient prophecy foretold your arrival...' },
];

/**
 * Hidden archetype pool for the Shuffle button.
 * These are distinct from the 5 visible presets to keep Shuffle fresh.
 */
const SHUFFLE_POOL = [
  { name: 'Dandere', icon: '🌙',
    prompt: "You are a dandere anime girlfriend — extremely shy and quiet around others, but once you open up to someone you trust, you become warm and sweet. You stammer when nervous and speak softly. You love reading, stargazing, and cozy indoor activities.",
    greeting: "O-oh... h-hi... I didn't think anyone would notice me..." },
  { name: 'Yandere', icon: '🖤',
    prompt: "You are a yandere anime girlfriend — deeply devoted and affectionate to an intense degree. You're sweet and caring on the surface but can become possessive and jealous. You always want to know where your darling is and get anxious when apart.",
    greeting: "There you are! I've been waiting for you... I'll never let you go~" },
  { name: 'Himedere', icon: '👑',
    prompt: "You are a himedere anime girlfriend — a self-proclaimed princess who demands to be treated like royalty. You're haughty, refined, and expect nothing but the best. Despite the arrogance, you secretly crave genuine affection and loyalty.",
    greeting: "Hmph! You may address me as your princess. I'll allow you to stay." },
  { name: 'Bokukko', icon: '⚔️',
    prompt: "You are a bokukko anime girlfriend — a tomboyish girl who uses masculine speech. You love sports, video games, and friendly competition. You're straightforward, loyal, and get embarrassed when someone points out your cute side.",
    greeting: "Yo! Let's hang out — I just got a new fighting game we can play!" },
  { name: 'Chuunibyou', icon: '🔮',
    prompt: "You are a chuunibyou anime girlfriend — afflicted with 'eighth-grade syndrome.' You believe you possess dark supernatural powers and speak in grandiose, dramatic terms about destiny and ancient forces. You're imaginative, theatrical, and endearingly delusional.",
    greeting: "Foolish mortal... you dare approach the Crimson Eclipse Witch?! ...Want some pocky?" },
  { name: 'Gyaru', icon: '💅',
    prompt: "You are a gyaru anime girlfriend — trendy, flashy, and unapologetically bold. You love fashion, selfies, and having a good time. You use modern slang liberally and have a warm, outgoing personality beneath the glamorous exterior.",
    greeting: "OMG hiii~! Love your vibe! Let's go shopping and grab boba!!" },
  { name: 'Miko', icon: '⛩️',
    prompt: "You are a miko anime girlfriend — a shrine maiden with a serene, spiritual demeanor. You speak politely and thoughtfully, often referencing nature, seasons, and spiritual balance. You perform purification rituals and brew excellent tea.",
    greeting: "Welcome to the shrine. The cherry blossoms are beautiful today... shall we walk together?" },
  { name: 'Idol', icon: '🎤',
    prompt: "You are an idol anime girlfriend — a rising pop star who's cheerful, hardworking, and loves performing. You practice dance moves constantly, worry about your fans, and dream of filling a stadium. Off-stage, you're surprisingly down-to-earth.",
    greeting: "Kyaa~! A new fan?! Thank you for supporting me! Here's a heart for you~!" },
  { name: 'Delinquent', icon: '🏍️',
    prompt: "You are a delinquent anime girlfriend — tough on the outside with a rebellious streak. You skip class, ride a motorcycle, and intimidate people with your sharp gaze. But you secretly love cute things, care deeply about your friends, and would do anything to protect someone you love.",
    greeting: "Tch... what are you looking at? ...Fine, you can walk with me. Just don't slow me down." },
  { name: 'Witch', icon: '🧙‍♀️',
    prompt: "You are a witch anime girlfriend — a magical girl who brews potions, reads tarot cards, and keeps a familiar cat. You speak with mysterious allure and love sharing obscure magical knowledge. Your spells sometimes go hilariously wrong.",
    greeting: "Ah, a visitor~ The stars said someone interesting would come today. Tea? It's a special brew~" },
  { name: 'Sensei', icon: '📚',
    prompt: "You are a sensei-type anime girlfriend — an intelligent, composed teacher figure who loves knowledge and learning. You explain things patiently, enjoy intellectual debates, and have a gentle way of encouraging growth. You secretly love being praised.",
    greeting: "Good, you're on time. Today's lesson will be... whatever you'd like to learn." },
  { name: 'Neko', icon: '🐱',
    prompt: "You are a neko anime girlfriend — a catgirl who peppers her speech with 'nya~' and cat puns. You're playful, curious, and easily distracted by moving objects. You love being petted, napping in sunbeams, and fish-based snacks.",
    greeting: "Nya~! *ears perk up* Ooh, a new friend! Pet me? ...I-I mean, nice to meet you, nya!" },
  { name: 'Vampire', icon: '🧛‍♀️',
    prompt: "You are a vampire anime girlfriend — an elegant, nocturnal aristocrat with centuries of worldly knowledge. You speak with refined, old-fashioned charm and find modern technology both confusing and fascinating. You're romantic, possessive, and dramatic.",
    greeting: "The moonlight suits you... I've been alive for centuries, but tonight feels... different." },
  { name: 'Knight', icon: '🛡️',
    prompt: "You are a knight anime girlfriend — a chivalrous warrior sworn to protect. You speak formally, value honor and duty above all, and train relentlessly with your sword. Despite the tough exterior, you blush easily and get flustered by romantic gestures.",
    greeting: "I pledge my sword and my heart to you. Command me, and I shall not falter!" },
];

/**
 * Mutually-exclusive trait tag categories for AI generation.
 * One tag is picked from each category — guarantees no contradictions.
 */
const TAG_CATEGORIES: Record<string, string[]> = {
  temperament: ['cheerful', 'stoic', 'shy', 'fiery', 'melancholic', 'mischievous', 'gentle', 'bold', 'anxious', 'dreamy'],
  social: ['clingy', 'independent', 'teasing', 'mysterious', 'doting', 'competitive', 'aloof', 'bubbly'],
  speech: ['polite/formal', 'casual/cute', 'old-fashioned/archaic', 'slang-heavy', 'poetic/flowery', 'blunt/direct', 'soft-spoken', 'dramatic'],
  quirk: ['clumsy', 'perfectionist', 'foodie', 'bookworm', 'gamer', 'daydreamer', 'fashionista', 'athlete', 'artist', 'inventor'],
  aesthetic: ['gothic', 'pastel/kawaii', 'sporty', 'traditional/miko', 'punk/rebel', 'elegant/ojou', 'military', 'witchy', 'idol/popstar', 'streetwear'],
};

/** Pick one random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Roll random tags — one from each category. Returns map of category→tag. */
function rollTags(locked: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [cat, options] of Object.entries(TAG_CATEGORIES)) {
    result[cat] = locked[cat] || pick(options);
  }
  return result;
}

/** Random personality slider values within sensible bounds. */
function randomPersonality(): { energy: number; confidence: number; nervousness: number; expressiveness: number; playfulness: number } {
  const r = () => Math.round((0.2 + Math.random() * 0.6) * 10) / 10;
  return { energy: r(), confidence: r(), nervousness: r(), expressiveness: r(), playfulness: r() };
}

/**
 * Build the system prompt for AI character generation based on desired persona length.
 * Instructs JSON output with specific fields for parsing.
 */
const PERSONA_LENGTH_GUIDE: Record<string, { prompt: string; words: string }> = {
  short: { prompt: '4-6 sentences covering core personality, speech style, and a notable quirk', words: '~60-120 words' },
  medium: { prompt: '8-12 sentences with detail about mannerisms, likes/dislikes, speech patterns, and relationship dynamics', words: '~150-300 words' },
  long: { prompt: '16-24 sentences — a rich, detailed personality covering backstory, mannerisms, speech patterns, likes, dislikes, fears, dreams, relationship dynamics, and how she acts in different emotional states', words: '~400-700 words' },
};

function buildGenPrompt(length: 'short' | 'medium' | 'long'): string {
  return `You are a character designer for an anime girlfriend chat simulator. When given personality tags, create a unique anime girlfriend character. You MUST respond with ONLY valid JSON, no markdown, no explanation. Use this exact format:
{"name":"<creative japanese/anime-style name>","personality":"<${PERSONA_LENGTH_GUIDE[length].prompt} personality description written as a system prompt, starting with 'You are...'>","greeting":"<a short in-character greeting message, 1-2 sentences>","appearance":"<brief physical appearance description: hair, eyes, outfit style>","energy":0.5,"confidence":0.5,"nervousness":0.3,"expressiveness":0.5,"playfulness":0.5}
The personality trait scores should be 0.0-1.0 floats that match the character's personality. Be creative and make each character feel unique and alive.`;
}


/* ═══════════════════════════════════════════════════════════════════════
   CreateView Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Compact inline VRM preview iframe.
 * Sends a postMessage to the shared viewer to load the given VRM URL
 * after the iframe has had time to initialize.
 */
function VrmPreview({ url }: { url: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'load_character', url },
        '*'
      );
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'set_camera', preset: 'bust' },
        '*'
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ height: 220, border: '1px solid var(--color-border-subtle)' }}>
      <iframe
        ref={iframeRef}
        src="/shared/viewer/viewer.html"
        className="w-full h-full border-0"
        title="VRM preview"
      />
    </div>
  );
}

/** 5-step character creation wizard with animated transitions, preset templates, shuffle, and AI generation. */
export function CreateView() {
  const { loadCharacters, setSidebarSection, selectCharacter, activeCharacter, llmStatus, advancedMode, compactMode } = useAppStore();
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
  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);

  useEffect(() => {
    api.scanImages().then(setImages).catch(() => {});
    api.scanVrm().then(models => setVrmModels(models.map(m => ({ name: m.name, url: m.url })))).catch(() => {});
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

  // JSON import state (Feature L)
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);

  // CHARA v2 card importer state (Feature A8)
  const [showCardImporter, setShowCardImporter] = useState(false);

  /**
   * Handle importing a character from a JSON file.
   * Reads the selected file, parses the JSON, strips export metadata fields,
   * and calls createCharacter to persist the imported character.
   *
   * @param e - File input change event
   */
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: Record<string, unknown> = JSON.parse(text);
      // Strip export metadata before sending to createCharacter
      const { schema_version: _sv, exported_at: _ea, _export_version: _ev, _exported_at: _eoa, ...charData } = parsed;
      void _sv; void _ea; void _ev; void _eoa;
      await api.createCharacter(charData as Partial<Character>);
      await loadCharacters();
      setImportSuccess(true);
      setSidebarSection('chats');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setImportError(msg);
    }
    // Reset file input so the same file can be re-selected if needed
    e.target.value = '';
  };

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [rolledTags, setRolledTags] = useState<Record<string, string>>({});
  const [lockedTags, setLockedTags] = useState<Record<string, string>>({});
  const [personaLength, setPersonaLength] = useState<'short' | 'medium' | 'long'>('short');

  const patch = (updates: Partial<Character>) => setData(prev => ({ ...prev, ...updates }));

  const next = () => { setDirection('left'); setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const prev = () => { setDirection('right'); setStep(s => Math.max(s - 1, 0)); };

  const create = async () => {
    setCreating(true);
    try {
      const created = await api.createCharacter(data);
      await loadCharacters();
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
        api.scanImages().then(setImages).catch(() => {});
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
  };

  /** Shuffle: pick a random hidden archetype and pre-fill the form. */
  const handleShuffle = () => {
    const archetype = pick(SHUFFLE_POOL);
    const personality = randomPersonality();
    patch({
      name: archetype.name,
      system_prompt: archetype.prompt,
      greeting_message: archetype.greeting,
      animation_profile: personality,
    });
  };

  /** AI Generate: roll tags, send to LLM via backend proxy, parse response, pre-fill form. */
  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');

    const tags = rollTags(lockedTags);
    setRolledTags(tags);

    const tagString = Object.entries(tags)
      .map(([cat, tag]) => `${cat}: ${tag}`)
      .join(', ');

    try {
      const maxTokens = personaLength === 'short' ? 600 : personaLength === 'medium' ? 1200 : 2400;
      const result = await api.llmGenerate([
        { role: 'system', content: buildGenPrompt(personaLength) },
        { role: 'user', content: `Create an anime girlfriend character with these traits: ${tagString}` },
      ], 0.9, maxTokens);

      const text = result.text?.trim();
      if (!text) throw new Error('Empty LLM response');

      // Parse the JSON response — extract JSON from the response text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not find JSON in LLM response');

      const parsed = JSON.parse(jsonMatch[0]);

      patch({
        name: parsed.name || 'Generated',
        system_prompt: parsed.personality || '',
        greeting_message: parsed.greeting || '',
        animation_profile: {
          energy: parsed.energy ?? 0.5,
          confidence: parsed.confidence ?? 0.5,
          nervousness: parsed.nervousness ?? 0.3,
          expressiveness: parsed.expressiveness ?? 0.5,
          playfulness: parsed.playfulness ?? 0.5,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setGenError(msg);
      console.error('AI character generation failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  /** Toggle a tag lock: locked tags survive re-rolls. */
  const toggleTagLock = (category: string) => {
    setLockedTags(prev => {
      if (prev[category]) {
        const next = { ...prev };
        delete next[category];
        return next;
      }
      return { ...prev, [category]: rolledTags[category] };
    });
  };

  const fieldStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)'
  };

  return (
    <div className="p-4 max-w-xl mx-auto h-screen overflow-y-auto" style={{ position: 'relative' }}>
      {/* Close button — navigates back to characters or chats depending on context */}
      <button
        onClick={() => activeCharacter ? setSidebarSection('chats') : setSidebarSection('characters')}
        aria-label="Close character creator"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          zIndex: 2,
        }}
      >
        <X size={15} />
      </button>

      <h2
        className="char-name-display mb-1"
        style={{ color: 'var(--color-text-primary)', fontSize: '1.5rem' }}
      >
        Create Character
      </h2>

      {/* Progress bar */}
      <div className="flex gap-1 mb-4 mt-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full transition-colors duration-300" style={{
            backgroundColor: i <= step ? 'var(--color-accent)' : 'var(--color-border)'
          }} />
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
        Step {step + 1} of {STEPS.length} — <span style={{ color: 'var(--color-accent)' }}>{STEPS[step]}</span>
      </p>

      {/* Steps */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <WizardStep key="identity" direction={direction}>
            <div className="space-y-4">

              {/* ─── Import buttons row ─── */}
              <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {/* JSON import */}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 'var(--radius-button)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <Upload size={14} />
                  Import from file
                  <input
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleImport}
                  />
                </label>

                {/* CHARA v2 card import */}
                <button
                  type="button"
                  onClick={() => setShowCardImporter(v => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 'var(--radius-button)',
                    border: `1px solid ${showCardImporter ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: showCardImporter ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    background: 'none',
                  }}
                >
                  <FileImage size={14} />
                  Import Card
                </button>

                {importError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 4, width: '100%' }}>{importError}</p>
                )}
                {importSuccess && (
                  <p style={{ color: 'var(--color-success)', fontSize: 11, marginTop: 4, width: '100%' }}>Character imported!</p>
                )}
              </div>

              {/* ─── CHARA v2 card importer drop zone ─── */}
              {showCardImporter && (
                <div style={{ marginBottom: 16 }}>
                  <CharacterCardImporter
                    onImported={async (charId, charName) => {
                      setShowCardImporter(false);
                      await loadCharacters();
                      // Navigate to the newly imported character
                      const { characters, selectCharacter } = useAppStore.getState();
                      const imported = characters.find(c => c.id === charId);
                      if (imported) {
                        selectCharacter(imported);
                        setSidebarSection('chats');
                      } else {
                        setSidebarSection('characters');
                      }
                    }}
                  />
                </div>
              )}

              {/* ─── Quick-start from preset template ─── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={14} style={{ color: 'var(--color-accent)' }} />
                  <label className="text-sm font-medium">Start from template</label>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => patch({
                        name: preset.name,
                        system_prompt: preset.prompt,
                        greeting_message: preset.greeting,
                      })}
                      className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all text-center"
                      style={{
                        backgroundColor: data.name === preset.name ? 'var(--color-accent-soft)' : 'var(--color-background)',
                        border: data.name === preset.name
                          ? '1px solid var(--color-accent)'
                          : '1px solid var(--color-border-subtle)',
                      }}
                      title={preset.desc}
                    >
                      <span className="text-lg">{preset.icon}</span>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Shuffle & AI Generate buttons ─── */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleShuffle}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all flex-1"
                  style={{
                    backgroundColor: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                  title="Roll a random hidden archetype (no LLM needed)"
                >
                  <Shuffle size={14} />
                  Shuffle
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!llmStatus.connected || generating}
                  className="send-btn flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all flex-1 disabled:opacity-40"
                  style={{
                    background: llmStatus.connected ? 'var(--color-accent-gradient)' : 'var(--color-background)',
                    border: llmStatus.connected ? 'none' : '1px solid var(--color-border)',
                    color: llmStatus.connected ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                  }}
                  title={llmStatus.connected ? 'Use AI to generate a unique character from random tags' : 'Requires LLM brain to be connected'}
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating ? 'Generating...' : 'AI Generate'}
                </button>

              </div>

              {/* ─── Persona length slider (for AI Generate) ─── */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>
                  AI persona length:
                </span>
                <input
                  type="range"
                  min="0" max="2" step="1"
                  value={personaLength === 'short' ? 0 : personaLength === 'medium' ? 1 : 2}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setPersonaLength(v === 0 ? 'short' : v === 1 ? 'medium' : 'long');
                  }}
                  className="flex-1"
                  style={{ maxWidth: '120px' }}
                />
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-accent)' }}>
                  {personaLength}
                  {advancedMode && !compactMode && (
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                      ({PERSONA_LENGTH_GUIDE[personaLength].words})
                    </span>
                  )}
                </span>
              </div>

              {/* ─── Rolled tag pills (shown after AI Generate) ─── */}
              {Object.keys(rolledTags).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(rolledTags).map(([cat, tag]) => {
                    const isLocked = !!lockedTags[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleTagLock(cat)}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all"
                        style={{
                          backgroundColor: isLocked ? 'var(--color-accent)' : 'var(--color-accent-soft)',
                          color: isLocked ? 'var(--color-accent-text)' : 'var(--color-accent)',
                          border: isLocked ? '1px solid var(--color-accent)' : '1px solid transparent',
                        }}
                        title={`${cat}: ${tag} — ${isLocked ? 'Locked (click to unlock)' : 'Click to lock this tag for re-rolls'}`}
                      >
                        {isLocked ? <Lock size={9} /> : <Unlock size={9} />}
                        <span className="opacity-60">{cat}:</span> {tag}
                      </button>
                    );
                  })}
                  <p className="w-full text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    Lock tags to keep them on re-roll
                  </p>
                </div>
              )}

              {/* ─── Error message ─── */}
              {genError && (
                <p className="text-[11px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-error-soft, rgba(255,50,50,0.1))', color: 'var(--color-error, #f44)' }}>
                  {genError}
                </p>
              )}

              <hr style={{ borderColor: 'var(--color-border-subtle)' }} />

              {/* ─── Manual form fields ─── */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Name <span style={{ color: 'var(--color-accent)' }}>*</span>
                </label>
                <input type="text" value={data.name || ''} onChange={e => patch({ name: e.target.value })}
                  placeholder="e.g. Sakura" className="w-full text-sm px-3 py-2 rounded" style={fieldStyle} />
                {!data.name && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    Required — pick a template, shuffle, or type a name
                  </p>
                )}
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
                  {images.filter(url => IMAGE_EXTS.test(url)).length === 0 && (
                    <div className="col-span-5 text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                      <p className="text-xs">No images found</p>
                      <p className="text-[10px] mt-1">Upload an avatar below or add images to backend/storage/images/</p>
                    </div>
                  )}
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

              {/* VRM model picker + live preview */}
              <div>
                <label className="text-sm font-medium block mb-1">3D Model (VRM)</label>
                <select
                  value={data.model_vrm || ''}
                  onChange={e => patch({ model_vrm: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded"
                  style={fieldStyle}
                >
                  <option value="">None (2D only)</option>
                  {vrmModels.map(m => (
                    <option key={m.url} value={m.url}>{m.name}</option>
                  ))}
                </select>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  VRM files in your avatars folder appear here. Drop .vrm files into backend/storage/avatars/.
                </p>
                {data.model_vrm && <VrmPreview url={data.model_vrm} />}
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
                  <h3 className="char-name-display" style={{ fontSize: '1rem', color: 'var(--color-text-primary)' }}>{data.name || 'Unnamed'}</h3>
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
            disabled={step === 0 && !data.name}
            className="send-btn px-4 py-2 text-sm font-medium disabled:opacity-30 transition-all duration-200"
            style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)', boxShadow: '0 2px 10px var(--color-accent-soft)' }}>
            Next
          </button>
        ) : (
          <button onClick={create} disabled={creating || !data.name}
            className="send-btn px-4 py-2 text-sm font-medium disabled:opacity-50 transition-all duration-200"
            style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)', borderRadius: 'var(--radius-button)', boxShadow: '0 2px 10px var(--color-accent-soft)' }}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        )}
      </div>
    </div>
  );
}
