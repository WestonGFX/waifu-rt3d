import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, User } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface TopEmotion {
  emotion: string;
  count: number;
}

interface PortfolioData {
  /** Full display name of the character. */
  name: string;
  /** URL path to the character's avatar image, if available. */
  avatar_url?: string | null;
  /** Normalised affinity score, 0-1. */
  affinity: number;
  /** Total number of messages exchanged with this character. */
  total_messages: number;
  /** ISO date string for the first recorded interaction (e.g. "2025-01-15"). */
  first_interaction_date: string | null;
  /** Personality trait tokens (e.g. ["cheerful", "teasing", "loyal"]). */
  personality_traits: string[];
  /** Top emotions recorded in conversations, sorted by frequency descending. */
  top_emotions: TopEmotion[];
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Derive a human-readable relationship tier from an affinity score (0-1).
 * Thresholds match those used in StatsPanel and StatusBar.
 *
 * @param affinity - Normalised affinity value.
 * @returns Tier label string.
 */
function affinityTier(affinity: number): string {
  const pct = affinity * 100;
  if (pct >= 80) return 'Devoted';
  if (pct >= 60) return 'Close';
  if (pct >= 40) return 'Friendly';
  if (pct >= 20) return 'Neutral';
  return 'Stranger';
}

/**
 * Return a CSS color string appropriate for the given affinity tier name.
 *
 * @param tier - Tier label from affinityTier().
 * @returns CSS color value.
 */
function tierColor(tier: string): string {
  switch (tier) {
    case 'Devoted':  return '#e879a0';
    case 'Close':    return 'var(--color-accent)';
    case 'Friendly': return '#4ade80';
    case 'Neutral':  return 'var(--color-text-secondary)';
    default:         return 'var(--color-text-tertiary)';
  }
}

/**
 * Format an ISO date string (YYYY-MM-DD) into a human-readable label.
 *
 * @param iso - ISO date string or null.
 * @returns Formatted date like "Jan 15, 2025", or "—" for null.
 */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Section heading label, styled consistently with other panels.
 *
 * @param label - Short uppercase heading text.
 */
function SectionLabel({ label }: { label: string }) {
  return (
    <p
      style={{
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
        marginBottom: '8px',
        margin: '0 0 8px',
      }}
    >
      {label}
    </p>
  );
}

/**
 * Horizontal bar chart for the top emotion frequencies.
 * Bars are proportional to the max count in the dataset.
 *
 * @param emotions - Sorted top-emotion array from portfolio data.
 */
function TopEmotionsChart({ emotions }: { emotions: TopEmotion[] }) {
  if (!emotions.length) {
    return (
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
        No emotion data yet.
      </p>
    );
  }

  const max = Math.max(...emotions.map(e => e.count), 1);

  /** Distinct fill colors cycled across emotion bars. */
  const colors = ['#f4a0b5', '#f9c74f', '#6db3f2', '#a78bfa', '#86efac', '#fb923c'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {emotions.slice(0, 6).map((entry, i) => {
        const pct = Math.round((entry.count / max) * 100);
        const color = colors[i % colors.length];
        return (
          <div key={entry.emotion}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '3px',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {entry.emotion}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                {entry.count}
              </span>
            </div>
            <div
              style={{
                height: '6px',
                borderRadius: 99,
                backgroundColor: 'var(--color-border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 99,
                  backgroundColor: color,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel showing a full "portfolio card" for the active character.
 *
 * Sections:
 * 1. Hero — avatar (if present), character name, affinity tier badge
 * 2. Stats row — total messages, affinity %, timeline start date
 * 3. Personality traits — pill tokens
 * 4. Top emotions — horizontal bar chart
 * 5. Download Card button — logs a message (html2canvas export not yet implemented)
 *
 * Data comes from GET /api/characters/{id}/portfolio.
 * Uses native fetch() rather than the api module.
 *
 * Overlay key: 'portfolio'
 */
export function CharacterPortfolioCard() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'portfolio';

  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch portfolio whenever the panel opens or the active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setExportMsg(null);

    fetch(`/api/characters/${activeCharacter.id}/portfolio`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: unknown) => {
        if (!cancelled) setData(raw as PortfolioData);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load portfolio. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, activeCharacter?.id]);

  /**
   * Export the portfolio card as a PNG image using html2canvas.
   * Captures the card panel DOM element and triggers a browser download.
   */
  const handleExport = async () => {
    if (!cardRef.current || !data) return;
    setExportMsg('Capturing…');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${data.name.replace(/\s+/g, '_')}_portfolio.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setExportMsg('Saved!');
    } catch (err) {
      console.error('[CharacterPortfolioCard] export failed:', err);
      setExportMsg('Export failed — see console for details.');
    }
    setTimeout(() => setExportMsg(null), 3000);
  };

  const tier = data ? affinityTier(data.affinity) : null;
  const tColor = tier ? tierColor(tier) : 'var(--color-text-tertiary)';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="portfolio-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            ref={cardRef}
            key="portfolio-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Character portfolio card"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(480px, 94vw)',
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
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <User size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                PORTFOLIO
              </span>
              {activeCharacter && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
                  {activeCharacter.name}
                </span>
              )}
              <button
                onClick={closeOverlay}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
                aria-label="Close portfolio panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Loading state */}
              {loading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  Loading…
                </p>
              )}

              {/* Error state */}
              {error && !loading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-error)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  {error}
                </p>
              )}

              {/* Empty state — no character selected */}
              {!loading && !error && !data && !activeCharacter && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>🃏</span>
                  <p
                    style={{
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    No character selected
                  </p>
                </div>
              )}

              {/* Main card content */}
              {!loading && !error && data && (
                <>
                  {/* ── Section 1: Hero ── */}
                  <section
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '20px 16px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {/* Avatar */}
                    {data.avatar_url ? (
                      <img
                        src={data.avatar_url}
                        alt={`${data.name} avatar`}
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `2px solid ${tColor}`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          backgroundColor: `color-mix(in srgb, ${tColor} 18%, var(--color-background))`,
                          border: `2px solid ${tColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '2rem',
                          lineHeight: 1,
                        }}
                      >
                        {data.name[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}

                    {/* Name */}
                    <h2
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                        margin: 0,
                        textAlign: 'center',
                      }}
                    >
                      {data.name}
                    </h2>

                    {/* Affinity tier badge */}
                    {tier && (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: '99px',
                          color: tColor,
                          backgroundColor: `color-mix(in srgb, ${tColor} 14%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${tColor} 35%, transparent)`,
                        }}
                      >
                        {tier}
                      </span>
                    )}
                  </section>

                  {/* ── Section 2: Stats row ── */}
                  <section>
                    <SectionLabel label="Overview" />
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                      }}
                    >
                      {(
                        [
                          ['Messages', data.total_messages.toLocaleString()],
                          ['Affinity', `${Math.round(data.affinity * 100)}%`],
                          ['Since', fmtDate(data.first_interaction_date)],
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border-subtle)',
                            textAlign: 'center',
                          }}
                        >
                          <p
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 700,
                              color: 'var(--color-text-primary)',
                              margin: 0,
                              lineHeight: 1.1,
                              wordBreak: 'break-word',
                            }}
                          >
                            {value}
                          </p>
                          <p
                            style={{
                              fontSize: '0.62rem',
                              color: 'var(--color-text-tertiary)',
                              margin: '4px 0 0',
                              textTransform: 'uppercase',
                              letterSpacing: '0.07em',
                              fontWeight: 600,
                            }}
                          >
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* ── Section 3: Personality traits ── */}
                  {data.personality_traits.length > 0 && (
                    <section>
                      <SectionLabel label="Personality" />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {data.personality_traits.map(trait => (
                          <span
                            key={trait}
                            style={{
                              fontSize: '0.75rem',
                              padding: '3px 10px',
                              borderRadius: '99px',
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Section 4: Top emotions bar chart ── */}
                  <section>
                    <SectionLabel label="Top Emotions" />
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <TopEmotionsChart emotions={data.top_emotions} />
                    </div>
                  </section>

                  {/* ── Section 5: Export ── */}
                  <section>
                    <button
                      onClick={handleExport}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'transparent',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background-color 0.12s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'var(--color-surface)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <Download size={14} />
                      Download Card
                    </button>

                    {/* Transient feedback message for export stub */}
                    <AnimatePresence>
                      {exportMsg && (
                        <motion.p
                          key="export-msg"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            marginTop: '8px',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-tertiary)',
                            textAlign: 'center',
                          }}
                        >
                          {exportMsg}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
