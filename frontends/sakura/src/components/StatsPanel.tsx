import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface CharacterStats {
  message_count: number;
  session_count: number;
  affinity: number;
  mood: number;
  trust: number;
  interactions: number;
  first_chat_date: string | null;
  last_chat_date: string | null;
  streak_days: number;
  top_emotion: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helper functions
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Convert a 0-1 score to a human-readable relationship tier label.
 * Thresholds mirror those in StatusBar and CharacterCard.
 *
 * @param score - Normalised score (0-1).
 * @returns Tier label string.
 */
function scoreTier(score: number): string {
  const pct = score * 100;
  if (pct >= 80) return 'Devoted';
  if (pct >= 60) return 'Close';
  if (pct >= 40) return 'Friendly';
  if (pct >= 20) return 'Neutral';
  return 'Stranger';
}

/**
 * Resolve the tier color for a named relationship tier.
 *
 * @param tier - Tier label from scoreTier().
 * @returns CSS color string for the tier.
 */
function tierColor(tier: string): string {
  switch (tier) {
    case 'Devoted':  return '#e879a0';
    case 'Close':    return 'var(--color-accent)';
    case 'Friendly': return 'var(--color-success)';
    case 'Neutral':  return 'var(--color-text-secondary)';
    default:         return 'var(--color-text-tertiary)';
  }
}

/**
 * Map a 0-1 score to a colored progress bar fill color.
 * Green for high, accent for mid, muted for low.
 *
 * @param score - Normalised score (0-1).
 * @returns CSS color string.
 */
function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-success)';
  if (score >= 0.4) return 'var(--color-accent)';
  return 'var(--color-text-tertiary)';
}

/**
 * Format an ISO date string (YYYY-MM-DD) into a human-friendly label.
 *
 * @param iso - ISO date string or null.
 * @returns Formatted date, or "—" for null values.
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

/**
 * Returns a descriptive emoji glyph for a recorded emotion string.
 * Falls back to a neutral face for unrecognised values.
 *
 * @param emotion - Emotion name from the backend (e.g. "happy", "sad").
 * @returns Emoji string.
 */
function emotionEmoji(emotion: string): string {
  const map: Record<string, string> = {
    happy:    '😊',
    joy:      '😄',
    love:     '🥰',
    flirt:    '😏',
    hype:     '🤩',
    sass:     '💅',
    anger:    '😤',
    sad:      '😢',
    shock:    '😱',
    cringe:   '😬',
    comfort:  '🤗',
    tease:    '😜',
    neutral:  '😐',
    playful:  '🎉',
  };
  return map[emotion.toLowerCase()] ?? '😐';
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A labeled stat value card used for summary numbers (messages, sessions, etc.).
 *
 * @param label - Short descriptor shown below the value.
 * @param value - Primary display value (string or number).
 */
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: '12px 10px',
        borderRadius: '8px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: '0.65rem',
          color: 'var(--color-text-muted)',
          margin: '4px 0 0',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
    </div>
  );
}

/**
 * A labeled horizontal progress bar for affinity / mood / trust scores.
 *
 * @param label - Descriptor for the metric.
 * @param score - Normalised value (0-1).
 * @param emoji - Small glyph shown beside the label.
 */
function ScoreBar({
  label,
  score,
  emoji,
}: {
  label: string;
  score: number;
  emoji: string;
}) {
  const pct = Math.round(score * 100);
  const color = scoreColor(score);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem' }}>{emoji}</span>
          {label}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: '5px',
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
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel displaying a character's lifetime stats dashboard.
 *
 * Sections:
 * 1. Summary row — total messages, sessions, and streak
 * 2. Relationship tier — colored tier badge with an affinity progress bar
 * 3. Score bars — affinity, mood, and trust as labeled progress bars
 * 4. Timeline — first chat date, last chat date, and current emotion
 *
 * Data comes from GET /api/characters/{id}/stats (new backend endpoint).
 * Falls back gracefully to zero/null values when data is not yet available.
 */
export function StatsPanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'stats';

  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats whenever the panel opens or the active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    setLoading(true);
    setError(null);
    setStats(null);

    api.getCharacterStats(activeCharacter.id)
      .then(data => {
        setStats(data as unknown as CharacterStats);
      })
      .catch(() => {
        setError('Failed to load stats. Try again later.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, activeCharacter?.id]);

  const tier = stats ? scoreTier(stats.affinity) : null;
  const tColor = tier ? tierColor(tier) : 'var(--color-text-muted)';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="stats-backdrop"
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
            key="stats-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Character stats"
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
              <BarChart2 size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                STATS
              </span>
              {activeCharacter && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 2 }}>
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
                  color: 'var(--color-text-muted)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
                aria-label="Close stats panel"
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
              {loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '40px 0' }}>
                  Loading…
                </p>
              )}

              {error && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-danger, #f44)', fontSize: '0.85rem', padding: '40px 0' }}>
                  {error}
                </p>
              )}

              {!loading && !error && stats && (
                <>
                  {/* ── Section 1: Summary cards ── */}
                  <section>
                    <p
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-muted)',
                        marginBottom: '10px',
                      }}
                    >
                      Overview
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <StatCard label="Messages" value={stats.message_count.toLocaleString()} />
                      <StatCard label="Sessions" value={stats.session_count.toLocaleString()} />
                      <StatCard
                        label="Day Streak"
                        value={stats.streak_days > 0 ? `${stats.streak_days} 🔥` : '0'}
                      />
                    </div>
                  </section>

                  {/* ── Section 2: Relationship tier ── */}
                  <section>
                    <p
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-muted)',
                        marginBottom: '10px',
                      }}
                    >
                      Relationship
                    </p>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {/* Tier badge + interactions count */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '99px',
                            color: tColor,
                            backgroundColor: `color-mix(in srgb, ${tColor} 14%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${tColor} 35%, transparent)`,
                          }}
                        >
                          {tier}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {stats.interactions.toLocaleString()} interactions
                        </span>
                      </div>

                      {/* Score bars */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <ScoreBar label="Affinity" score={stats.affinity} emoji="♥" />
                        <ScoreBar label="Mood"     score={stats.mood}     emoji="✦" />
                        <ScoreBar label="Trust"    score={stats.trust}    emoji="◈" />
                      </div>
                    </div>
                  </section>

                  {/* ── Section 3: Timeline ── */}
                  <section>
                    <p
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-muted)',
                        marginBottom: '10px',
                      }}
                    >
                      Timeline
                    </p>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '9px',
                      }}
                    >
                      {(
                        [
                          ['Member Since', fmtDate(stats.first_chat_date)],
                          ['Last Active',  fmtDate(stats.last_chat_date)],
                        ] as [string, string][]
                      ).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{label}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* ── Section 4: Current emotion ── */}
                  <section>
                    <p
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-muted)',
                        marginBottom: '10px',
                      }}
                    >
                      Current Mood
                    </p>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                        {emotionEmoji(stats.top_emotion)}
                      </span>
                      <div>
                        <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, textTransform: 'capitalize' }}>
                          {stats.top_emotion}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                          Last recorded emotion
                        </p>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* Empty state — panel opened but no active character */}
              {!loading && !error && !stats && !activeCharacter && (
                <div
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '12px', padding: '40px 20px', textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>📊</span>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    No character selected
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Open the stats panel from a character's chat to see their history.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
