import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Copy, Check, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single LLM configuration slot for the arena. */
interface ArenaConfig {
  /** Display label shown on the result card (e.g. "Config A"). */
  label: string;
  /** Model identifier forwarded to the backend (e.g. "lmstudio/..."). */
  model: string;
  /** Sampling temperature (0.0–2.0). */
  temperature: number;
  /** Maximum tokens to generate (100–2000). */
  maxTokens: number;
  /** Whether this slot is active (Config C is optional). */
  enabled: boolean;
}

/** Successful result returned by POST /api/arena/compare for one config. */
interface ArenaSuccess {
  label: string;
  text: string;
  elapsed_ms: number;
  tokens: number;
}

/** Failed result returned by POST /api/arena/compare for one config. */
interface ArenaFailure {
  label: string;
  error: string;
}

type ArenaResult = ArenaSuccess | ArenaFailure;

/** Type guard: narrows an ArenaResult to ArenaSuccess. */
function isSuccess(r: ArenaResult): r is ArenaSuccess {
  return 'text' in r;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/** Default config values for each labelled slot. */
const DEFAULT_CONFIGS: ArenaConfig[] = [
  { label: 'Config A', model: '', temperature: 0.7, maxTokens: 200, enabled: true },
  { label: 'Config B', model: '', temperature: 1.2, maxTokens: 200, enabled: true },
  { label: 'Config C', model: '', temperature: 0.5, maxTokens: 200, enabled: false },
];

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Individual result card shown after the arena run completes.
 *
 * Displays the label badge, response body (scrollable, max 300 px),
 * elapsed time + token count footer, and a copy-to-clipboard button.
 *
 * @param result - Arena result object (success or failure).
 */
function ResultCard({ result }: { result: ArenaResult }) {
  const [copied, setCopied] = useState(false);

  /**
   * Copy response text to the system clipboard.
   * Shows a brief checkmark confirmation before reverting.
   */
  const handleCopy = () => {
    if (!isSuccess(result)) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const isErr = !isSuccess(result);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${isErr ? 'var(--color-danger, #f44)' : 'var(--color-border)'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isErr
          ? 'color-mix(in srgb, var(--color-danger, #f44) 8%, var(--color-surface))'
          : 'var(--color-surface)',
      }}
    >
      {/* Card header: label badge + copy button */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: `1px solid ${isErr ? 'var(--color-danger, #f44)' : 'var(--color-border)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            padding: '2px 7px',
            borderRadius: '4px',
            backgroundColor: isErr
              ? 'color-mix(in srgb, var(--color-danger, #f44) 20%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
            color: isErr ? 'var(--color-danger, #f44)' : 'var(--color-accent)',
          }}
        >
          {result.label}
        </span>

        {isSuccess(result) && (
          <button
            onClick={handleCopy}
            title="Copy response"
            aria-label={`Copy ${result.label} response`}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 7px',
              fontSize: '0.68rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: copied ? 'var(--color-accent)' : 'var(--color-text-muted)',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {/* Card body: response text or error message */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '300px',
          padding: '10px 12px',
        }}
      >
        {isErr ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.82rem',
              color: 'var(--color-danger, #f44)',
              fontStyle: 'italic',
            }}
          >
            {(result as ArenaFailure).error}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: '0.84rem',
              lineHeight: 1.65,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {(result as ArenaSuccess).text}
          </p>
        )}
      </div>

      {/* Footer: timing + token count (only for successful runs) */}
      {isSuccess(result) && (
        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            gap: '12px',
            fontSize: '0.68rem',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        >
          <span>{(result as ArenaSuccess).elapsed_ms.toLocaleString()} ms</span>
          <span>{(result as ArenaSuccess).tokens} tokens</span>
        </div>
      )}
    </div>
  );
}

/**
 * Config row for a single arena slot (label, model, temperature slider, max tokens).
 *
 * @param cfg   - Current config state for this slot.
 * @param index - Slot index (0 = A, 1 = B, 2 = C).
 * @param onChange - Callback to update one field of this slot's config.
 */
function ConfigRow({
  cfg,
  index,
  onChange,
}: {
  cfg: ArenaConfig;
  index: number;
  onChange: (index: number, field: keyof ArenaConfig, value: string | number | boolean) => void;
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--color-border)',
        borderRadius: '7px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backgroundColor: 'var(--color-surface)',
        opacity: cfg.enabled ? 1 : 0.45,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Slot header: label input + enable toggle (Config C only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {index === 2 && (
          <input
            type="checkbox"
            id={`arena-enable-c`}
            checked={cfg.enabled}
            onChange={e => onChange(index, 'enabled', e.target.checked)}
            style={{ cursor: 'pointer', flexShrink: 0 }}
            aria-label="Enable Config C"
          />
        )}
        <input
          type="text"
          value={cfg.label}
          onChange={e => onChange(index, 'label', e.target.value)}
          disabled={!cfg.enabled}
          aria-label={`Label for slot ${index + 1}`}
          style={{
            flex: 1,
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '4px 7px',
            borderRadius: '5px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Model field */}
      <div>
        <label
          style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '3px' }}
        >
          Model ID (blank = server default)
        </label>
        <input
          type="text"
          value={cfg.model}
          onChange={e => onChange(index, 'model', e.target.value)}
          disabled={!cfg.enabled}
          placeholder="e.g. lmstudio-community/Qwen3-8B-GGUF/..."
          aria-label={`Model for ${cfg.label}`}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontSize: '0.74rem',
            padding: '4px 7px',
            borderRadius: '5px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Temperature slider + Max tokens side by side */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {/* Temperature */}
        <div style={{ flex: 1, minWidth: '120px' }}>
          <label
            style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}
          >
            <span>Temperature</span>
            <span style={{ color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>
              {cfg.temperature.toFixed(1)}
            </span>
          </label>
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.1}
            value={cfg.temperature}
            disabled={!cfg.enabled}
            onChange={e => onChange(index, 'temperature', parseFloat(e.target.value))}
            aria-label={`Temperature for ${cfg.label}`}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Max tokens */}
        <div style={{ flex: '0 0 90px' }}>
          <label
            style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '3px' }}
          >
            Max tokens
          </label>
          <input
            type="number"
            min={100}
            max={2000}
            step={50}
            value={cfg.maxTokens}
            disabled={!cfg.enabled}
            onChange={e => onChange(index, 'maxTokens', parseInt(e.target.value, 10) || 200)}
            aria-label={`Max tokens for ${cfg.label}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '0.74rem',
              padding: '4px 7px',
              borderRadius: '5px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel implementing Feature #17 — Model Arena.
 *
 * Lets the user send the same prompt to 2–3 LLM configurations
 * simultaneously (sequentially on the backend) and view responses
 * side-by-side.
 *
 * Features:
 * - Animated slide-in from the right (same spring as DiaryPanel)
 * - Backdrop click to close
 * - 2 required + 1 optional config rows (label, model, temp slider, max tokens)
 * - "Run Arena" button with loading state
 * - Side-by-side result cards with copy + per-card error display
 * - "Clear" button to reset results
 * - Uses `activeCharacter` from appStore to pass optional `char_id`
 *
 * Overlay key: `'arena'`
 *
 * @example
 * // In App.tsx (or wherever overlays are mounted):
 * import { ModelArenaPanel } from './components/ModelArenaPanel';
 * // <ModelArenaPanel />
 */
export function ModelArenaPanel() {
  const { closeOverlay, activeCharacter } = useAppStore();
  const open = false; // overlay removed

  const [prompt, setPrompt] = useState('');
  const [configs, setConfigs] = useState<ArenaConfig[]>(DEFAULT_CONFIGS);
  const [results, setResults] = useState<ArenaResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  /**
   * Update a single field of one config slot.
   *
   * @param index - Slot index (0, 1, or 2).
   * @param field - Config field name.
   * @param value - New value.
   */
  const handleConfigChange = (
    index: number,
    field: keyof ArenaConfig,
    value: string | number | boolean
  ) => {
    setConfigs(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  /** Active (enabled) configs — always 2 required + optional C. */
  const activeConfigs = configs.filter(c => c.enabled);

  /**
   * Send the prompt to POST /api/arena/compare and update results state.
   * Builds the request body from enabled configs only.
   */
  const handleRun = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    if (activeConfigs.length < 2) return;

    setLoading(true);
    setRunError(null);
    setResults(null);

    try {
      const body = {
        prompt: trimmedPrompt,
        char_id: activeCharacter?.id ?? null,
        configs: activeConfigs.map(c => ({
          label: c.label,
          model: c.model,
          temperature: c.temperature,
          max_tokens: c.maxTokens,
        })),
      };

      const res = await fetch('/api/arena/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { detail?: string }).detail || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { results: ArenaResult[] };
      setResults(data.results);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  /** Clear results and reset error state. */
  const handleClear = () => {
    setResults(null);
    setRunError(null);
  };

  /** Number of enabled configs, shown in the loading message. */
  const modelCount = activeConfigs.length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="arena-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="arena-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Model Arena"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(680px, 96vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 12px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Swords size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                MODEL ARENA
              </span>
              {results && (
                <button
                  onClick={handleClear}
                  title="Clear results"
                  aria-label="Clear arena results"
                  style={{
                    marginLeft: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={11} /> Clear
                </button>
              )}
              <button
                onClick={closeOverlay}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
                aria-label="Close Model Arena panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* ── Prompt input ── */}
              <div>
                <label
                  htmlFor="arena-prompt"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    display: 'block',
                    marginBottom: '5px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Your prompt
                </label>
                <textarea
                  id="arena-prompt"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Ask something… e.g. What is the meaning of life?"
                  rows={3}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontSize: '0.84rem',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.55,
                  }}
                />
              </div>

              {/* ── Config rows ── */}
              <div>
                <p
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    margin: '0 0 8px 0',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Configurations
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  {configs.map((cfg, i) => (
                    <div key={i} style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <ConfigRow cfg={cfg} index={i} onChange={handleConfigChange} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Run button ── */}
              <button
                onClick={handleRun}
                disabled={loading || !prompt.trim() || activeConfigs.length < 2}
                aria-label="Run arena comparison"
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 18px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor:
                    loading || !prompt.trim() || activeConfigs.length < 2
                      ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)'
                      : 'var(--color-accent)',
                  color: '#fff',
                  cursor:
                    loading || !prompt.trim() || activeConfigs.length < 2
                      ? 'not-allowed'
                      : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  transition: 'background-color 0.15s',
                }}
              >
                <Swords size={14} />
                {loading ? `Sending to ${modelCount} model${modelCount > 1 ? 's' : ''}…` : 'Run Arena'}
              </button>

              {/* ── Global error (network / validation) ── */}
              {runError && (
                <p
                  style={{
                    margin: 0,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    color: 'var(--color-danger, #f44)',
                    border: '1px solid color-mix(in srgb, var(--color-danger, #f44) 35%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--color-danger, #f44) 8%, var(--color-surface))',
                  }}
                >
                  {runError}
                </p>
              )}

              {/* ── Results ── */}
              {results && results.length > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      margin: '0 0 8px 0',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Results
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'stretch',
                    }}
                  >
                    {results.map((result, i) => (
                      <ResultCard key={i} result={result} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
