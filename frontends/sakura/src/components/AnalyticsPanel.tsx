import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface WordFreq { word: string; count: number; }
interface SparkDay { date: string; count: number; }
interface ArcDay {
  date: string;
  happy: number; sad: number; love: number; angry: number; neutral: number;
  [emotion: string]: string | number;
}

interface Analytics {
  word_frequencies: WordFreq[];
  session_sparkline: SparkDay[];
  latency_avg_ms: number;
  latency_p95_ms: number;
  latency_trend: 'improving' | 'stable' | 'degrading';
  tps_avg: number;
  emotion_arc: ArcDay[];
  total_messages: number;
  total_sessions: number;
  avg_messages_per_session: number;
  longest_session_messages: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Canonical emotion name → fill color for the arc stacked bar. */
const EMOTION_COLORS: Record<string, string> = {
  happy:   '#f9c74f',
  love:    '#f4a0b5',
  sad:     '#6db3f2',
  angry:   '#e05c5c',
  neutral: '#94a3b8',
};

/* ═══════════════════════════════════════════════════════════════════════
   Helper components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Section label displayed above each analytics block.
 *
 * @param label - Short uppercase heading.
 */
function SectionLabel({ label }: { label: string }) {
  return (
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
      {label}
    </p>
  );
}

/**
 * A single pill-shaped stat used in the conversation depth row.
 *
 * @param label - Descriptor shown below the value.
 * @param value - Primary display string or number.
 */
function DepthPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: '10px 8px',
        borderRadius: '8px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: '1.2rem',
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
          fontSize: '0.6rem',
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
 * Tag cloud visualization — proportionally sized word spans in a flex-wrap grid.
 * Font size is linearly interpolated between 11px (min count) and 22px (max count).
 *
 * @param words - Sorted word frequency list (most frequent first).
 */
function TagCloud({ words }: { words: WordFreq[] }) {
  if (!words.length) {
    return (
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        Not enough data yet.
      </p>
    );
  }
  const max = words[0].count;
  const min = words[words.length - 1].count;
  const range = Math.max(max - min, 1);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 8px',
        padding: '12px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {words.map(({ word, count }) => {
        const t = (count - min) / range;           // 0..1
        const fontSize = Math.round(11 + t * 11);  // 11..22 px
        // Shift hue from muted (low) to accent (high)
        const opacity = 0.5 + t * 0.5;
        return (
          <span
            key={word}
            title={`${word}: ${count} times`}
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: t > 0.6 ? 700 : 500,
              color: `color-mix(in srgb, var(--color-accent) ${Math.round(t * 80)}%, var(--color-text-secondary))`,
              opacity,
              cursor: 'default',
              lineHeight: 1.3,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Sparkline of 90 daily mini-bars.
 *
 * Days with no messages have height 0. The bar heights are proportional to the
 * max count in the window.  Bars show a tooltip on hover.
 *
 * @param days - Array of {date, count} for the last 90 days (sparse — missing
 *   dates are filled in as zero-height bars for a continuous 90-day grid).
 */
function ActivitySparkline({ days }: { days: SparkDay[] }) {
  // Build a dense 90-day array by filling gaps with zero
  const today = new Date();
  const denseMap: Record<string, number> = {};
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    denseMap[key] = 0;
  }
  days.forEach(({ date, count }) => { denseMap[date] = count; });
  const dense = Object.entries(denseMap);

  const max = Math.max(...dense.map(([, c]) => c), 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '1px',
          height: '40px',
          padding: '4px 8px',
          borderRadius: '8px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        {dense.map(([date, count]) => {
          const heightPct = count > 0 ? Math.max(10, Math.round((count / max) * 100)) : 2;
          return (
            <div
              key={date}
              title={count > 0 ? `${date}: ${count} msgs` : date}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                height: `${heightPct}%`,
                borderRadius: '1px 1px 0 0',
                backgroundColor: count > 0
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
                opacity: count > 0 ? 0.8 : 0.3,
                transition: 'height 0.3s ease',
                cursor: count > 0 ? 'default' : 'default',
              }}
            />
          );
        })}
      </div>
      <p style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: 4, textAlign: 'right' }}>
        Last 90 days
      </p>
    </div>
  );
}

/**
 * Trend indicator arrow — green for improving, red for degrading, muted for stable.
 *
 * @param trend - Trend string from the backend.
 */
function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'improving') {
    return <span style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>↓</span>;
  }
  if (trend === 'degrading') {
    return <span style={{ color: 'var(--color-danger, #f55)', fontSize: '0.85rem' }}>↑</span>;
  }
  return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>→</span>;
}

/**
 * Two side-by-side performance stat boxes.
 *
 * @param data - Analytics payload (latency + TPS fields).
 */
function PerformanceStats({ data }: { data: Analytics }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {/* Latency box */}
      <div
        style={{
          flex: 1,
          padding: '12px',
          borderRadius: '10px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <p style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          {data.latency_avg_ms > 0 ? `${data.latency_avg_ms}ms` : '—'}
          {data.latency_avg_ms > 0 && <TrendArrow trend={data.latency_trend} />}
        </p>
        <p style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
          Avg response
        </p>
        {data.latency_p95_ms > 0 && (
          <p style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
            p95: {data.latency_p95_ms}ms
          </p>
        )}
      </div>

      {/* TPS box */}
      <div
        style={{
          flex: 1,
          padding: '12px',
          borderRadius: '10px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <p style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
          {data.tps_avg > 0 ? `${data.tps_avg}` : '—'}
        </p>
        <p style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
          Tok/sec avg
        </p>
        <p style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', margin: '3px 0 0' }}>
          {data.tps_avg > 0 ? 'local model' : 'no latency data'}
        </p>
      </div>
    </div>
  );
}

/**
 * Stacked horizontal bar chart for the emotion arc over the last 30 days.
 * Each row is a day; bar segments are proportional to emotion counts for that day.
 *
 * @param arc - Array of daily emotion pivot rows.
 */
function EmotionArc({ arc }: { arc: ArcDay[] }) {
  if (!arc.length) {
    return (
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        No emotion data for the last 30 days.
      </p>
    );
  }

  const emotions = Object.keys(EMOTION_COLORS) as Array<keyof typeof EMOTION_COLORS>;
  // Show at most 20 days to keep the panel height reasonable
  const visible = arc.slice(-20);

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {visible.map(day => {
          const total = emotions.reduce((s, e) => s + (day[e] as number), 0);
          const label = day.date.slice(5); // MM-DD
          return (
            <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)', width: '30px', flexShrink: 0, textAlign: 'right' }}>
                {label}
              </span>
              <div style={{ flex: 1, height: '10px', borderRadius: '4px', display: 'flex', overflow: 'hidden', backgroundColor: 'var(--color-border)' }}>
                {total > 0 && emotions.map(emotion => {
                  const pct = ((day[emotion] as number) / total) * 100;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={emotion}
                      title={`${emotion}: ${day[emotion]}`}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: EMOTION_COLORS[emotion],
                        flexShrink: 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        {emotions.map(emotion => (
          <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: EMOTION_COLORS[emotion], flexShrink: 0 }} />
            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
              {emotion}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel showing conversation analytics for the active character.
 *
 * Sections:
 * 1. Tag Cloud — most-frequent words in assistant messages
 * 2. Activity Sparkline — 90-day daily message bar chart
 * 3. Performance Stats — average latency, p95, tokens/sec, trend
 * 4. Emotional Arc — stacked bar chart of emotions over last 30 days
 * 5. Conversation Depth — total messages, sessions, avg session length
 *
 * Data comes from GET /api/characters/{id}/analytics.
 * Falls back gracefully when fewer than 5 messages exist.
 */
export function AnalyticsPanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'analytics';

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch analytics whenever the panel opens or the active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    setLoading(true);
    setError(null);
    setData(null);

    api.getCharacterAnalytics(activeCharacter.id)
      .then(raw => {
        setData(raw as unknown as Analytics);
      })
      .catch(() => {
        setError('Failed to load analytics. Try again later.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, activeCharacter?.id]);

  const isEmpty = data && data.total_messages < 5;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="analytics-backdrop"
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
            key="analytics-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation analytics"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(520px, 94vw)',
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
              <Activity size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                ANALYTICS
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
                aria-label="Close analytics panel"
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
                gap: '22px',
              }}
            >
              {/* Loading state */}
              {loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '40px 0' }}>
                  Crunching numbers…
                </p>
              )}

              {/* Error state */}
              {error && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-danger, #f44)', fontSize: '0.85rem', padding: '40px 0' }}>
                  {error}
                </p>
              )}

              {/* Empty state — no character selected */}
              {!loading && !error && !data && !activeCharacter && (
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
                    Open analytics from a character's chat to explore their conversation data.
                  </p>
                </div>
              )}

              {/* Not enough data yet */}
              {!loading && !error && isEmpty && (
                <div
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '12px', padding: '40px 20px', textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>💬</span>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    Not enough data yet
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Chat with {activeCharacter?.name} a bit more — analytics unlock after 5 messages.
                  </p>
                </div>
              )}

              {/* Main content — only when we have sufficient data */}
              {!loading && !error && data && !isEmpty && (
                <>
                  {/* ── Section 1: Tag Cloud ── */}
                  <section>
                    <SectionLabel label="Word Cloud" />
                    <TagCloud words={data.word_frequencies} />
                  </section>

                  {/* ── Section 2: Activity Sparkline ── */}
                  <section>
                    <SectionLabel label="Activity" />
                    <ActivitySparkline days={data.session_sparkline} />
                  </section>

                  {/* ── Section 3: Performance Stats ── */}
                  <section>
                    <SectionLabel label="Performance" />
                    <PerformanceStats data={data} />
                  </section>

                  {/* ── Section 4: Emotional Arc ── */}
                  <section>
                    <SectionLabel label="Emotional Arc — Last 30 Days" />
                    <EmotionArc arc={data.emotion_arc} />
                  </section>

                  {/* ── Section 5: Conversation Depth ── */}
                  <section>
                    <SectionLabel label="Conversation Depth" />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <DepthPill label="Messages" value={data.total_messages.toLocaleString()} />
                      <DepthPill label="Sessions" value={data.total_sessions.toLocaleString()} />
                      <DepthPill label="Avg Length" value={`${data.avg_messages_per_session}`} />
                      <DepthPill label="Longest" value={data.longest_session_messages.toLocaleString()} />
                    </div>
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
