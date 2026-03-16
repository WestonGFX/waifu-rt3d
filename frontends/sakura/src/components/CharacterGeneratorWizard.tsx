import { useState, useCallback, KeyboardEvent } from 'react';
import { Sparkles, RefreshCw, Check, Loader2, X, MessageSquare } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useWizardStore } from '../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from './wizard/WizardShell';
import { api } from '../lib/api';
import type { Character } from '../lib/types';

/* ── Shared data types ────────────────────────────────────────────────── */

/**
 * Input collected in Step 1 (trait collection).
 */
interface GeneratorInputs {
  traits: string[];
  name: string;
  gender: string;
  ageRange: string;
  setting: string;
}

/**
 * AI-generated character fields returned by /api/characters/generate.
 * All fields are optional — the backend may not populate every field.
 */
interface GeneratedCharacter {
  name: string;
  personality: string;
  system_prompt: string;
  greeting_message: string;
  backstory: string;
  example_messages: string;
  avatar_description: string;
}

/* ── Shared input style (mirrors existing wizard pattern) ─────────────── */

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
  color: 'var(--color-text-tertiary)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '8px 12px',
  outline: 'none',
  borderRadius: 8,
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

/* ── Step 0: Input Traits ─────────────────────────────────────────────── */

/**
 * Step 1 — Collects character traits as pills plus optional metadata fields.
 * POSTs to /api/characters/generate on submit and advances to Step 2.
 */
function StepInputTraits({ onNext, setWizardData }: WizardStepProps) {
  const [traitInput, setTraitInput] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [setting, setSetting] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Commit the current trait input text as one or more pills.
   * Splits on commas so the user can paste "shy, bookish, sarcastic" at once.
   */
  const commitTraits = useCallback(() => {
    const raw = traitInput.trim();
    if (!raw) return;
    const parsed = raw
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    setTraits(prev => {
      const existing = new Set(prev);
      const fresh = parsed.filter(p => !existing.has(p));
      return [...prev, ...fresh];
    });
    setTraitInput('');
  }, [traitInput]);

  /**
   * Commit pills on Enter or comma keypress within the trait input.
   */
  const handleTraitKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTraits();
    }
    if (e.key === 'Backspace' && traitInput === '' && traits.length > 0) {
      setTraits(prev => prev.slice(0, -1));
    }
  };

  /** Remove a single trait pill by index. */
  const removeTrait = (index: number) => {
    setTraits(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Build the payload and call the backend generation endpoint.
   * On success, stores the result in wizardData and advances to Step 2.
   */
  const handleGenerate = async () => {
    // Flush any uncommitted text first
    const allTraits = [...traits];
    if (traitInput.trim()) {
      traitInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .forEach(t => { if (!allTraits.includes(t)) allTraits.push(t); });
    }

    if (allTraits.length === 0) {
      setError('Add at least one trait before generating.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const inputs: GeneratorInputs = { traits: allTraits, name, gender, ageRange, setting };
      const result = await fetch('/api/characters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traits: allTraits,
          name: name.trim() || undefined,
          gender: gender || undefined,
          age_range: ageRange || undefined,
          setting: setting.trim() || undefined,
        }),
      });

      if (!result.ok) {
        const errBody = await result.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          typeof errBody.detail === 'string' ? errBody.detail : `Server error ${result.status}`
        );
      }

      const generated = await result.json() as GeneratedCharacter;

      setWizardData({ inputs, generated });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        Describe your character with a few traits and we'll generate a full personality, backstory,
        and opening greeting using your active AI model.
      </p>

      {/* Trait pill input */}
      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabelStyle}>Traits *</label>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 8,
            backgroundColor: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            cursor: 'text',
            minHeight: 42,
          }}
          onClick={() => document.getElementById('cgw-trait-input')?.focus()}
        >
          {traits.map((trait, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                fontWeight: 500,
              }}
            >
              {trait}
              <button
                onClick={(e) => { e.stopPropagation(); removeTrait(i); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}
                aria-label={`Remove trait "${trait}"`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            id="cgw-trait-input"
            value={traitInput}
            onChange={e => setTraitInput(e.target.value)}
            onKeyDown={handleTraitKeyDown}
            onBlur={commitTraits}
            placeholder={traits.length === 0 ? 'shy, bookish, sarcastic… (press Enter or comma)' : ''}
            style={{
              flex: 1,
              minWidth: 120,
              fontSize: 12,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
        <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Type a trait and press Enter or comma to add it as a tag.
        </p>
      </div>

      {/* Optional fields — two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 16 }}>
        <div>
          <label style={fieldLabelStyle}>Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Leave blank to auto-generate"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Gender (optional)</label>
          <select value={gender} onChange={e => setGender(e.target.value)} style={selectStyle}>
            <option value="">Any</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non-binary">Non-binary</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle}>Age Range (optional)</label>
          <select value={ageRange} onChange={e => setAgeRange(e.target.value)} style={selectStyle}>
            <option value="">Any</option>
            <option value="teen">Teen (15–17)</option>
            <option value="young_adult">Young Adult (18–25)</option>
            <option value="adult">Adult (26–40)</option>
            <option value="middle_aged">Middle-aged (41–60)</option>
            <option value="elder">Elder (61+)</option>
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle}>Setting (optional)</label>
          <input
            type="text"
            value={setting}
            onChange={e => setSetting(e.target.value)}
            placeholder="e.g. fantasy kingdom, modern city"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {/* Generate button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.6 : 1,
            background: 'var(--color-accent-gradient)',
            color: 'var(--color-accent-text)',
          }}
        >
          {generating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

/* ── Step 1: Preview & Edit ───────────────────────────────────────────── */

/**
 * Step 2 — Displays all generated fields in editable textareas.
 * Also allows the user to regenerate with the same traits.
 */
function StepPreviewEdit({ onNext, wizardData, setWizardData }: WizardStepProps) {
  const raw = wizardData.generated as GeneratedCharacter | undefined;
  const inputs = wizardData.inputs as GeneratorInputs | undefined;

  // Local editable copies of each generated field
  const [name, setName] = useState(raw?.name ?? '');
  const [personality, setPersonality] = useState(raw?.personality ?? '');
  const [systemPrompt, setSystemPrompt] = useState(raw?.system_prompt ?? '');
  const [greeting, setGreeting] = useState(raw?.greeting_message ?? '');
  const [backstory, setBackstory] = useState(raw?.backstory ?? '');
  const [avatarDescription] = useState(raw?.avatar_description ?? '');
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  if (!raw || !inputs) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No generated data found. Go back and generate a character first.
        </p>
      </div>
    );
  }

  /**
   * Commit any local edits back to wizardData then advance to confirmation step.
   */
  const handleNext = () => {
    setWizardData({
      generated: {
        ...raw,
        name,
        personality,
        system_prompt: systemPrompt,
        greeting_message: greeting,
        backstory,
        avatar_description: avatarDescription,
      } satisfies GeneratedCharacter,
    });
    onNext();
  };

  /**
   * Re-call /api/characters/generate with the original inputs, then hydrate
   * the local state with the fresh result.
   */
  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch('/api/characters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traits: inputs.traits,
          name: inputs.name.trim() || undefined,
          gender: inputs.gender || undefined,
          age_range: inputs.ageRange || undefined,
          setting: inputs.setting.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          typeof errBody.detail === 'string' ? errBody.detail : `Server error ${res.status}`
        );
      }

      const fresh = await res.json() as GeneratedCharacter;
      setName(fresh.name ?? '');
      setPersonality(fresh.personality ?? '');
      setSystemPrompt(fresh.system_prompt ?? '');
      setGreeting(fresh.greeting_message ?? '');
      setBackstory(fresh.backstory ?? '');
      setWizardData({ generated: fresh });
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div>
      {/* Regenerate row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
          Review and edit the generated character before saving.
        </p>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            cursor: regenerating ? 'not-allowed' : 'pointer',
            opacity: regenerating ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Regenerate
        </button>
      </div>

      {regenError && (
        <p style={{ fontSize: 11, color: 'var(--color-danger)', marginBottom: 10 }}>{regenError}</p>
      )}

      {/* Editable fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={fieldLabelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Personality (short)</label>
          <textarea
            value={personality}
            onChange={e => setPersonality(e.target.value)}
            rows={2}
            style={{ ...textareaStyle, minHeight: 56 }}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={6}
            style={{ ...textareaStyle, minHeight: 120 }}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Opening Greeting</label>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            style={{ ...textareaStyle, minHeight: 72 }}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>Backstory</label>
          <textarea
            value={backstory}
            onChange={e => setBackstory(e.target.value)}
            rows={4}
            style={{ ...textareaStyle, minHeight: 88 }}
          />
        </div>

        {/* Read-only previews */}
        {raw.example_messages && (
          <div>
            <label style={fieldLabelStyle}>Example Messages (read-only)</label>
            <div
              style={{
                fontSize: 11,
                padding: '8px 10px',
                borderRadius: 8,
                maxHeight: 100,
                overflowY: 'auto',
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {raw.example_messages}
            </div>
          </div>
        )}

        {avatarDescription && (
          <div>
            <label style={fieldLabelStyle}>Avatar Description (for image gen)</label>
            <div
              style={{
                fontSize: 11,
                padding: '8px 10px',
                borderRadius: 8,
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {avatarDescription}
            </div>
          </div>
        )}
      </div>

      {/* Next button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={handleNext}
          disabled={!name.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: name.trim() ? 'pointer' : 'not-allowed',
            opacity: name.trim() ? 1 : 0.5,
            background: 'var(--color-accent-gradient)',
            color: 'var(--color-accent-text)',
          }}
        >
          Next — Confirm &amp; Save
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Confirm & Save ───────────────────────────────────────────── */

/**
 * Step 3 — Final confirmation.  POSTs to /api/characters to create the character,
 * then shows a success card with a "Start Chatting" shortcut.
 */
function StepConfirmSave({ onNext, wizardData }: WizardStepProps) {
  const { loadCharacters, selectCharacter } = useAppStore();
  const { closeWizard } = useWizardStore();
  const generated = wizardData.generated as GeneratedCharacter | undefined;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Character | null>(null);

  if (!generated) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          No character data. Go back and generate a character first.
        </p>
      </div>
    );
  }

  /**
   * Build the Character payload from generated fields and POST to the API.
   * On success, reloads the character list and surfaces the success state.
   */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<Character> = {
        name: generated.name,
        system_prompt: generated.system_prompt || generated.personality || '',
        greeting_message: generated.greeting_message,
        backstory: generated.backstory,
      };

      const char = await api.createCharacter(payload);
      await loadCharacters();
      setCreated(char);
      onNext(); // Advance progress indicator to done
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save character. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /** Select the new character and close the wizard to jump straight into chat. */
  const handleStartChatting = () => {
    if (created) selectCharacter(created);
    closeWizard();
  };

  // ── Success state ──────────────────────────────────────────────────────
  if (created) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: 'var(--color-success-soft, var(--color-accent-soft))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Check size={24} style={{ color: 'var(--color-success, var(--color-accent))' }} />
        </div>

        <h4
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: '0 0 6px',
          }}
        >
          {created.name} is ready!
        </h4>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          Your new character has been created and added to your roster.
        </p>

        <button
          onClick={handleStartChatting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--color-accent-gradient)',
            color: 'var(--color-accent-text)',
          }}
        >
          <MessageSquare size={14} />
          Start Chatting
        </button>
      </div>
    );
  }

  // ── Pre-save confirmation ──────────────────────────────────────────────
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        You're about to create{' '}
        <strong style={{ color: 'var(--color-text-primary)' }}>{generated.name}</strong>.
        This will add them to your character roster.
      </p>

      {/* Summary card */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <SummaryRow label="Name" value={generated.name} />
        {generated.personality && (
          <SummaryRow label="Personality" value={generated.personality} truncate />
        )}
        {generated.greeting_message && (
          <SummaryRow label="Greeting" value={generated.greeting_message} truncate />
        )}
        {generated.backstory && (
          <SummaryRow label="Backstory" value={generated.backstory} truncate />
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            background: 'var(--color-accent-gradient)',
            color: 'var(--color-accent-text)',
          }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Creating…' : 'Create Character'}
        </button>
      </div>
    </div>
  );
}

/* ── SummaryRow helper ────────────────────────────────────────────────── */

/**
 * A compact label/value row used in the confirmation summary card.
 *
 * @param label - Field name shown on the left
 * @param value - Content to display
 * @param truncate - When true, clamps to 2 lines with ellipsis
 */
function SummaryRow({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          flexShrink: 0,
          minWidth: 72,
          paddingTop: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
          overflow: truncate ? 'hidden' : undefined,
          display: truncate ? '-webkit-box' : undefined,
          WebkitBoxOrient: truncate ? 'vertical' : undefined,
          WebkitLineClamp: truncate ? 2 : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Wizard step definitions ──────────────────────────────────────────── */

const STEPS: WizardStepDef[] = [
  {
    id: 'input-traits',
    title: 'Describe Traits',
    component: StepInputTraits,
  },
  {
    id: 'preview-edit',
    title: 'Preview & Edit',
    component: StepPreviewEdit,
  },
  {
    id: 'confirm-save',
    title: 'Confirm & Save',
    component: StepConfirmSave,
  },
];

/* ── CharacterGeneratorWizard ─────────────────────────────────────────── */

/**
 * AI-powered character generation wizard — 3-step modal flow.
 *
 * Step 1: The user enters personality traits (as pills) plus optional metadata
 *         (name, gender, age range, setting). Tapping Generate calls
 *         POST /api/characters/generate.
 *
 * Step 2: All returned fields are shown in editable textareas.
 *         The user can tweak anything or regenerate from scratch.
 *
 * Step 3: Confirmation summary, then POST /api/characters to persist the
 *         character. On success a "Start Chatting" button selects them.
 *
 * Mounts when `useWizardStore.getState().activeWizard === 'character-gen'`.
 * Rendered by App.tsx / MobileApp.tsx in the wizard overlay layer.
 *
 * @example
 * ```tsx
 * // In App.tsx / MobileApp.tsx wizard overlay section:
 * {activeWizard === 'character-gen' && <CharacterGeneratorWizard />}
 * ```
 */
export function CharacterGeneratorWizard() {
  const { closeWizard } = useWizardStore();

  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="AI Character Generator"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
