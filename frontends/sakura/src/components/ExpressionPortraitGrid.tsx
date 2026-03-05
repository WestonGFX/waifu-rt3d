import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Phase 15: 26 canonical emotions grouped by category.
 * Each entry maps to a prompt suffix on the backend for image generation.
 */
const EMOTION_CATEGORIES: { category: string; emotions: string[] }[] = [
  { category: 'Core',      emotions: ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'neutral'] },
  { category: 'Social',    emotions: ['embarrassed', 'shy', 'proud', 'confident', 'jealous', 'grateful'] },
  { category: 'Cognitive',  emotions: ['confused', 'curious', 'thoughtful', 'nostalgic', 'awe'] },
  { category: 'Romantic',  emotions: ['love', 'flirty', 'longing'] },
  { category: 'Energy',    emotions: ['excited', 'tired', 'relieved'] },
  { category: 'Playful',   emotions: ['smug', 'mischievous'] },
];

const ALL_EMOTIONS = EMOTION_CATEGORIES.flatMap(c => c.emotions);

interface ExpressionPortraitGridProps {
  /** Character ID to generate/display portraits for. */
  charId: number;
  /** Character name, shown in prompts. */
  charName: string;
  /** Optional base visual description (falls back to system_prompt excerpt on backend). */
  basePrompt?: string;
}

/**
 * Feature A5 / Phase 15 — AI-Generated Character Expression Portraits.
 *
 * Displays a 26-slot grid of expression portraits organized by category
 * (Core, Social, Cognitive, Romantic, Energy, Playful). Each slot shows
 * the generated portrait or an empty placeholder. "Generate All" triggers
 * batch generation via POST /api/image-gen/expressions/{charId}.
 *
 * @example
 * <ExpressionPortraitGrid charId={3} charName="Sakura" />
 */
export function ExpressionPortraitGrid({ charId, charName, basePrompt }: ExpressionPortraitGridProps) {
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Load existing portraits on mount / charId change
  useEffect(() => {
    setPortraits({});
    api.listExpressionPortraits(charId)
      .then(res => {
        if (res?.portraits) setPortraits(res.portraits);
      })
      .catch(() => {
        // Fallback to legacy endpoint
        api.getExprPortraits(charId)
          .then(res => {
            if (res?.expr_portraits) setPortraits(res.expr_portraits);
          })
          .catch(() => {});
      });
  }, [charId]);

  /** Generate all 26 emotions in batch. */
  const handleGenerateAll = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateExpressions(charId, basePrompt);
      if (res?.portraits) {
        setPortraits(prev => ({ ...prev, ...res.portraits }));
      }
      if (res?.errors?.length) {
        setError(`Some failed: ${res.errors.join(', ')}`);
      }
    } catch {
      setError('Generation failed — is image gen running?');
    } finally {
      setGenerating(false);
    }
  };

  /** Regenerate a single emotion slot. */
  const handleRegenSlot = async (emotion: string) => {
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

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const assignedCount = ALL_EMOTIONS.filter(e => portraits[e]).length;

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          Expression Portraits ({assignedCount}/26)
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
          title={`Generate all 26 expression portraits for ${charName}`}
        >
          <Sparkles size={9} />
          {generating ? 'Generating...' : 'Generate All'}
        </button>
      </div>

      {/* Category sections */}
      {EMOTION_CATEGORIES.map(({ category, emotions }) => {
        const isCollapsed = collapsed[category] ?? false;
        const catAssigned = emotions.filter(e => portraits[e]).length;

        return (
          <div key={category} style={{ marginBottom: 8 }}>
            <button
              onClick={() => toggleCategory(category)}
              className="flex items-center gap-1 w-full text-left"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '3px 0',
                color: 'var(--color-text-tertiary)',
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              {category}
              <span style={{ fontWeight: 400, marginLeft: 4 }}>
                {catAssigned}/{emotions.length}
              </span>
            </button>

            {!isCollapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 4 }}>
                {emotions.map(emotion => {
                  const url = portraits[emotion];
                  const isSlotGenerating = generatingSlot === emotion || (generating && !url);
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
                          {isSlotGenerating ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <span className="text-[8px]">—</span>
                          )}
                        </div>
                      )}
                      {/* Emotion label overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0, left: 0, right: 0,
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                          padding: '6px 3px 2px',
                          textAlign: 'center',
                        }}
                      >
                        <span className="text-[7px] font-semibold" style={{ color: '#fff' }}>
                          {emotion}
                        </span>
                      </div>
                      {/* Regen button (visible on hover) */}
                      {url && !generating && (
                        <button
                          onClick={() => handleRegenSlot(emotion)}
                          disabled={generatingSlot !== null}
                          style={{
                            position: 'absolute',
                            top: 2, right: 2,
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
                          <RefreshCw size={8} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

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
