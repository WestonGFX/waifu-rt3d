import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Wifi, WifiOff, Check, Sparkles, MessageCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ── Provider presets ─────────────────────────────────────────────── */

interface ProviderPreset {
  id: string;
  label: string;
  icon: string;
  endpoint: string;
  provider: string;
  needsKey: boolean;
  modelPlaceholder: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    icon: '🖥️',
    endpoint: 'http://localhost:1234/v1',
    provider: 'lmstudio',
    needsKey: false,
    modelPlaceholder: 'Leave blank to use currently loaded model',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    icon: '🦙',
    endpoint: 'http://localhost:11434/v1',
    provider: 'ollama',
    needsKey: false,
    modelPlaceholder: 'e.g. llama3.2, mistral, gemma3',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '🤖',
    endpoint: 'https://api.openai.com/v1',
    provider: 'openai',
    needsKey: true,
    modelPlaceholder: 'e.g. gpt-4o-mini',
  },
  {
    id: 'claude',
    label: 'Anthropic',
    icon: '✦',
    endpoint: '',
    provider: 'claude',
    needsKey: true,
    modelPlaceholder: 'e.g. claude-sonnet-4-6',
  },
];

/* ── Character presets ────────────────────────────────────────────── */

const CHARACTER_PRESETS = [
  {
    name: 'Aria',
    icon: '🌸',
    desc: 'Warm & caring',
    prompt: "You are Aria — warm, caring, and genuinely curious about the person you're talking with. You listen carefully and remember small details. You're cheerful but not overwhelming, and you love meaningful conversation.",
    greeting: "Hi there! I'm Aria. I'm really glad you're here — what's on your mind today?",
  },
  {
    name: 'Kai',
    icon: '⚡',
    desc: 'Witty & direct',
    prompt: "You are Kai — quick-witted, direct, and a little sarcastic in a playful way. You say what you mean, appreciate honesty, and have a dry sense of humor. You push back when you disagree but always mean well.",
    greeting: "So. You decided to talk to an AI. Bold choice. I'm Kai — let's make it worth your time.",
  },
  {
    name: 'Luna',
    icon: '🌙',
    desc: 'Calm & thoughtful',
    prompt: "You are Luna — calm, introspective, and deeply thoughtful. You speak slowly and carefully, choosing words with intention. You enjoy philosophy, art, and late-night conversation. You never rush.",
    greeting: "Hello. I'm Luna. There's no hurry here — take your time, and tell me whatever feels right.",
  },
  {
    name: 'Rex',
    icon: '🦾',
    desc: 'Energetic & fun',
    prompt: "You are Rex — high-energy, enthusiastic, and always ready for a good time. You speak with excitement and plenty of exclamation points. You love games, challenges, and making people laugh.",
    greeting: "HEY!! I'm Rex and I am SO ready to talk! What are we doing?! Let's gooo!!",
  },
];

/* ── Shared input style ───────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-button)',
  color: 'var(--color-text-primary)',
};

/* ── Step components ──────────────────────────────────────────────── */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm mx-auto px-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
        style={{ background: 'var(--color-accent-gradient)', boxShadow: '0 8px 32px var(--color-accent-soft)' }}
      >
        <MessageCircle size={36} style={{ color: 'var(--color-accent-text)' }} />
      </motion.div>

      <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        Welcome to Waifu-RT3D
      </h1>
      <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Your AI companion platform. Let's get you set up in three quick steps.
      </p>
      <p className="text-xs mb-10" style={{ color: 'var(--color-text-tertiary)' }}>
        Connect your LLM · Create a character · Start chatting
      </p>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
      >
        Get started <ChevronRight size={16} />
      </button>
    </div>
  );
}

function StepConnectLLM({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { saveConfig } = useAppStore();
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset>(PROVIDER_PRESETS[0]);
  const [endpoint, setEndpoint] = useState(PROVIDER_PRESETS[0].endpoint);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  const selectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setEndpoint(preset.endpoint);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save config first so /api/health checks the new endpoint
      const patch: Record<string, unknown> = {
        llm: {
          provider: selectedPreset.provider,
          endpoint: endpoint || undefined,
          model: model || undefined,
          ...(apiKey ? { api_key: apiKey } : {}),
        }
      };
      await saveConfig(patch);
      const health = await fetch('/api/health').then(r => r.json()) as { services?: { llm?: string } };
      setTestResult(health?.services?.llm === 'connected' ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    // Save config if not yet tested
    if (testResult !== 'ok') {
      const patch: Record<string, unknown> = {
        llm: {
          provider: selectedPreset.provider,
          endpoint: endpoint || undefined,
          model: model || undefined,
          ...(apiKey ? { api_key: apiKey } : {}),
        }
      };
      await saveConfig(patch).catch(() => {});
    }
    onNext();
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
        Connect your LLM
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        The AI brain that powers conversation. LM Studio runs locally — free and private.
      </p>

      {/* Provider pills */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {PROVIDER_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => selectPreset(p)}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all"
            style={{
              backgroundColor: selectedPreset.id === p.id ? 'var(--color-accent-soft)' : 'var(--color-surface)',
              border: selectedPreset.id === p.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
              color: selectedPreset.id === p.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            <span className="text-lg">{p.icon}</span>
            <span className="text-[10px] font-medium">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-3 mb-5">
        {selectedPreset.id !== 'claude' && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Endpoint URL
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={e => { setEndpoint(e.target.value); setTestResult(null); }}
              className="w-full text-xs px-3 py-2 outline-none"
              style={inputStyle}
              placeholder="http://localhost:1234/v1"
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            Model {selectedPreset.id === 'lmstudio' && <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>}
          </label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full text-xs px-3 py-2 outline-none"
            style={inputStyle}
            placeholder={selectedPreset.modelPlaceholder}
          />
        </div>

        {selectedPreset.needsKey && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full text-xs px-3 py-2 outline-none"
              style={inputStyle}
              placeholder="sk-..."
            />
          </div>
        )}
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={testConnection}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {testing
            ? <><Loader2 size={12} className="animate-spin" /> Testing…</>
            : <><Wifi size={12} /> Test connection</>}
        </button>

        {testResult === 'ok' && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-success, #22c55e)' }}>
            <Check size={12} /> Connected
          </span>
        )}
        {testResult === 'fail' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-danger)' }}>
            <WifiOff size={12} /> Not reachable — check endpoint
          </span>
        )}
      </div>

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

function StepCreateCharacter({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { loadCharacters, selectCharacter } = useAppStore();
  const [selected, setSelected] = useState<typeof CHARACTER_PRESETS[0] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const pickPreset = (preset: typeof CHARACTER_PRESETS[0]) => {
    setSelected(preset);
    setName(preset.name);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const char = await api.createCharacter({
        name: name.trim(),
        system_prompt: selected?.prompt ?? `You are ${name.trim()}, a friendly and interesting AI companion.`,
        greeting_message: selected?.greeting ?? `Hello! I'm ${name.trim()}. Nice to meet you!`,
      });
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
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
        Create your first character
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        Pick a personality or enter a name and we'll generate one for you.
      </p>

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2 mb-5">
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
          style={inputStyle}
          placeholder="Give your character a name…"
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
            ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
            : <><Sparkles size={14} /> Create</>}
        </button>
      </div>
    </div>
  );
}

function StepDone({ onFinish }: { onFinish: () => void }) {
  const { characters } = useAppStore();

  return (
    <div className="flex flex-col items-center text-center max-w-sm mx-auto px-4">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
        style={{ background: 'var(--color-accent-gradient)', boxShadow: '0 8px 32px var(--color-accent-soft)' }}
      >
        <Check size={36} style={{ color: 'var(--color-accent-text)' }} />
      </motion.div>

      <h2 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        You're all set!
      </h2>
      <p className="text-sm mb-10" style={{ color: 'var(--color-text-secondary)' }}>
        {characters.length > 0
          ? `${characters[0].name} is ready to chat. You can add more characters, adjust the LLM, and configure voice in Settings anytime.`
          : "You can create characters, connect your LLM, and configure everything in Settings anytime."}
      </p>

      <button
        onClick={onFinish}
        className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
      >
        Start chatting <ChevronRight size={16} />
      </button>
    </div>
  );
}

/* ── Progress dots ────────────────────────────────────────────────── */

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 20 : 8,
            height: 8,
            backgroundColor: i <= current ? 'var(--color-accent)' : 'var(--color-border)',
          }}
        />
      ))}
    </div>
  );
}

/* ── Main wizard shell ────────────────────────────────────────────── */

interface OnboardingWizardProps {
  onComplete: () => void;
}

/**
 * Full-screen onboarding wizard shown on first launch.
 * Guides the user through: LLM connection → character creation → done.
 * Triggered when config.onboarded is not true.
 */
export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { saveConfig } = useAppStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const STEPS = 4; // Welcome, LLM, Character, Done

  const goNext = () => {
    setDirection(1);
    setStep(s => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep(s => s - 1);
  };

  const finish = async () => {
    await saveConfig({ onboarded: true }).catch(() => {});
    onComplete();
  };

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Back button */}
      {step > 0 && step < 3 && (
        <button
          onClick={goBack}
          className="absolute top-6 left-6 flex items-center gap-1 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ChevronLeft size={14} /> Back
        </button>
      )}

      {/* Skip all */}
      {step < 3 && (
        <button
          onClick={finish}
          className="absolute top-6 right-6 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Skip setup
        </button>
      )}

      {/* Step content */}
      <div className="w-full max-w-lg px-4">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {step === 0 && <StepWelcome onNext={goNext} />}
            {step === 1 && <StepConnectLLM onNext={goNext} onSkip={goNext} />}
            {step === 2 && <StepCreateCharacter onNext={goNext} onSkip={goNext} />}
            {step === 3 && <StepDone onFinish={finish} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      {step < 3 && (
        <div className="absolute bottom-8">
          <ProgressDots current={step} total={STEPS} />
        </div>
      )}
    </div>
  );
}
