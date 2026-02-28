import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

const EXPRESSIONS = ['happy', 'sad', 'surprised', 'thinking', 'embarrassed', 'excited', 'angry', 'shy'] as const;
type Expression = typeof EXPRESSIONS[number];

interface ExpressionPortraitGridProps {
  /** Character ID to generate/display portraits for. */
  charId: number;
  /** Character name, shown in prompts. */
  charName: string;
  /** Optional base visual description (falls back to system_prompt excerpt on backend). */
  basePrompt?: string;
}

/**
 * Feature A5 — AI-Generated Character Expression Portraits.
 *
 * Displays an 8-slot grid of expression portraits (happy, sad, surprised, etc.)
 * for a character. Each slot shows the generated portrait or an empty placeholder.
 * A "Generate All" button triggers batch generation via the existing
 * POST /api/image-gen/expressions/{charId} endpoint.
 *
 * @example
 * <ExpressionPortraitGrid charId={3} charName="Sakura" />
 */
export function ExpressionPortraitGrid({ charId, charName, basePrompt }: ExpressionPortraitGridProps) {
  const [portraits, setPortraits] = useState<Partial<Record<Expression, string>>>({});
  const [generating, setGenerating] = useState(false);
  const [generatingSlot, setGeneratingSlot] = useState<Expression | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing portraits on mount / charId change
  useEffect(() => {
    setPortraits({});
    api.getExprPortraits(charId)
      .then(res => {
        if (res?.expr_portraits) {
          setPortraits(res.expr_portraits as Partial<Record<Expression, string>>);
        }
      })
      .catch(() => {});
  }, [charId]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateExpressions(charId, basePrompt);
      if (res?.portraits) {
        setPortraits(prev => ({ ...prev, ...(res.portraits as Partial<Record<Expression, string>>) }));
      }
      if (res?.errors?.length) {
        setError(`Some failed: ${res.errors.join(', ')}`);
      }
    } catch (e) {
      setError('Generation failed — is image gen running?');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenSlot = async (emotion: Expression) => {
    setGeneratingSlot(emotion);
    setError(null);
    try {
      const res = await api.generateExpressions(charId, basePrompt);
      if (res?.portraits?.[emotion]) {
        setPortraits(prev => ({ ...prev, [emotion]: res.portraits![emotion] }));
      }
    } catch {
      setError(`Regen failed for ${emotion}`);
    } finally {
      setGeneratingSlot(null);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          Expression Portraits
        </span>
        <button
          onClick={handleGenerateAll}
          disabled={generating}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all"
          style={{
            backgroundColor: generating ? 'var(--color-border)' : 'var(--color-accent-soft)',
            color: generating ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
            border: `1px solid ${generating ? 'var(--color-border)' : 'var(--color-accent)'}`,
            cursor: generating ? 'wait' : 'pointer',
          }}
          title={`Generate all 8 expression portraits for ${charName}`}
        >
          <Sparkles size={9} />
          {generating ? 'Generating…' : 'Generate All'}
        </button>
      </div>

      {/* 8-slot grid — 4 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {EXPRESSIONS.map(emotion => {
          const url = portraits[emotion];
          const isGenerating = generatingSlot === emotion || (generating && !url);
          return (
            <div
              key={emotion}
              style={{
                position: 'relative',
                aspectRatio: '2/3',
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: 'var(--color-surface)',
                border: `1px solid ${url ? 'var(--color-border-subtle)' : 'var(--color-border)'}`,
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt={`${charName} ${emotion}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  className="flex items-center justify-center w-full h-full"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {isGenerating ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <span className="text-[9px]">—</span>
                  )}
                </div>
              )}
              {/* Emotion label */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                  padding: '6px 3px 2px',
                  textAlign: 'center',
                }}
              >
                <span className="text-[8px] font-semibold" style={{ color: '#fff' }}>
                  {emotion}
                </span>
              </div>
              {/* Regen button (hover) */}
              {url && !generating && (
                <button
                  onClick={() => handleRegenSlot(emotion)}
                  disabled={generatingSlot !== null}
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    border: 'none',
                    borderRadius: 3,
                    padding: 2,
                    cursor: 'pointer',
                    color: '#fff',
                    lineHeight: 1,
                  }}
                  title={`Regenerate ${emotion}`}
                >
                  <RefreshCw size={9} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-[9px] mt-1" style={{ color: 'var(--color-error, #f44)' }}>{error}</p>
      )}

      <p className="text-[9px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
        Requires image gen (EasyDiffusion or ComfyUI) to be running.
      </p>
    </div>
  );
}
