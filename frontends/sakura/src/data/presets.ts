/* ── Provider presets ─────────────────────────────────────────────────── */

/** LLM provider preset for the onboarding and LLM setup wizards. */
export interface ProviderPreset {
  id: string;
  label: string;
  icon: string;
  endpoint: string;
  provider: string;
  needsKey: boolean;
  modelPlaceholder: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    icon: '\uD83D\uDDA5\uFE0F',
    endpoint: 'http://localhost:1234/v1',
    provider: 'lmstudio',
    needsKey: false,
    modelPlaceholder: 'Leave blank to use currently loaded model',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    icon: '\uD83E\uDD99',
    endpoint: 'http://localhost:11434/v1',
    provider: 'ollama',
    needsKey: false,
    modelPlaceholder: 'e.g. llama3.2, mistral, gemma3',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '\uD83E\uDD16',
    endpoint: 'https://api.openai.com/v1',
    provider: 'openai',
    needsKey: true,
    modelPlaceholder: 'e.g. gpt-4o-mini',
  },
  {
    id: 'claude',
    label: 'Anthropic',
    icon: '\u2726',
    endpoint: '',
    provider: 'claude',
    needsKey: true,
    modelPlaceholder: 'e.g. claude-sonnet-4-6',
  },
];

/* ── Character presets ───────────────────────────────────────────────── */

/** Character personality preset for quick character creation. */
export interface CharacterPreset {
  name: string;
  icon: string;
  desc: string;
  prompt: string;
  greeting: string;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    name: 'Aria',
    icon: '\uD83C\uDF38',
    desc: 'Warm & caring',
    prompt: "You are Aria \u2014 warm, caring, and genuinely curious about the person you're talking with. You listen carefully and remember small details. You're cheerful but not overwhelming, and you love meaningful conversation.",
    greeting: "Hi there! I'm Aria. I'm really glad you're here \u2014 what's on your mind today?",
  },
  {
    name: 'Kai',
    icon: '\u26A1',
    desc: 'Witty & direct',
    prompt: "You are Kai \u2014 quick-witted, direct, and a little sarcastic in a playful way. You say what you mean, appreciate honesty, and have a dry sense of humor. You push back when you disagree but always mean well.",
    greeting: "So. You decided to talk to an AI. Bold choice. I'm Kai \u2014 let's make it worth your time.",
  },
  {
    name: 'Luna',
    icon: '\uD83C\uDF19',
    desc: 'Calm & thoughtful',
    prompt: "You are Luna \u2014 calm, introspective, and deeply thoughtful. You speak slowly and carefully, choosing words with intention. You enjoy philosophy, art, and late-night conversation. You never rush.",
    greeting: "Hello. I'm Luna. There's no hurry here \u2014 take your time, and tell me whatever feels right.",
  },
  {
    name: 'Rex',
    icon: '\uD83E\uDDBE',
    desc: 'Energetic & fun',
    prompt: "You are Rex \u2014 high-energy, enthusiastic, and always ready for a good time. You speak with excitement and plenty of exclamation points. You love games, challenges, and making people laugh.",
    greeting: "HEY!! I'm Rex and I am SO ready to talk! What are we doing?! Let's gooo!!",
  },
];

/* ── Shared input style ──────────────────────────────────────────────── */

/** Consistent input styling used across wizard steps. */
export const wizardInputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-button)',
  color: 'var(--color-text-primary)',
};

/* ── Feature tour items ──────────────────────────────────────────────── */

/** Feature card shown in the onboarding feature tour step. */
export interface FeatureTourItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  shortcut?: string;
}

export const FEATURE_TOUR_ITEMS: FeatureTourItem[] = [
  {
    id: 'cinematic_mode',
    title: 'Cinematic Mode',
    description: 'Full-screen immersive roleplay',
    icon: 'Tv',
    shortcut: 'Ctrl+I',
  },
  {
    id: 'mini_games',
    title: 'Mini Games',
    description: 'Play trivia, hangman & more with your character',
    icon: 'Gamepad2',
  },
  {
    id: 'knowledge_graph',
    title: 'Knowledge Graph',
    description: 'Your AI learns facts about you automatically',
    icon: 'Brain',
  },
  {
    id: 'lore_editor',
    title: 'Lore Editor',
    description: 'Build world lore that shapes conversations',
    icon: 'BookOpen',
  },
  {
    id: 'expression_portraits',
    title: 'Expression Portraits',
    description: 'AI-generated emotion artwork for your character',
    icon: 'Palette',
  },
  {
    id: 'vn_mode',
    title: 'Visual Novel Mode',
    description: 'Read conversations in VN-style layout',
    icon: 'BookText',
  },
];
