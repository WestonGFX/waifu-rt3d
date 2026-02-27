import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single event returned by GET /api/characters/{id}/timeline. */
interface TimelineEvent {
  date: string;
  label: string;
  type: 'milestone' | 'affinity_unlock' | 'diary';
  detail: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format an ISO date string (YYYY-MM-DD) into a compact readable label.
 *
 * @param iso - ISO date string or empty string.
 * @returns Formatted date like "Jan 15, 2026", or the raw string on error.
 */
function formatDate(iso: string): string {
  if (!iso) return '';
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
 * Map an event type to its display icon glyph.
 *
 * @param type - Timeline event type string.
 * @returns A single Unicode character used as the timeline node icon.
 */
function eventIcon(type: TimelineEvent['type']): string {
  switch (type) {
    case 'milestone':      return '◆';
    case 'affinity_unlock': return '♥';
    case 'diary':          return '📖';
    default:               return '•';
  }
}

/**
 * Map an event type to its theme color CSS value.
 *
 * @param type - Timeline event type string.
 * @returns CSS color string for the node icon and accent rule.
 */
function eventColor(type: TimelineEvent['type']): string {
  switch (type) {
    case 'milestone':      return 'var(--color-accent)';
    case 'affinity_unlock': return '#e879a0';
    case 'diary':          return 'var(--color-warning, #c9a227)';
    default:               return 'var(--color-text-muted)';
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A single row in the vertical timeline list.
 *
 * Renders the event icon, date, label, and detail text with a horizontal
 * rule styled in the event's accent color.
 *
 * @param event - Timeline event data.
 * @param isLast - True for the final item (suppresses the connecting line).
 */
function TimelineRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const color = eventColor(event.type);
  const icon = eventIcon(event.type);

  return (
    <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
      {/* Icon + vertical connector line */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
          width: '20px',
        }}
      >
        <span
          style={{
            fontSize: event.type === 'diary' ? '0.85rem' : '0.65rem',
            color,
            lineHeight: 1,
            marginTop: '2px',
          }}
        >
          {icon}
        </span>
        {/* Connector line between events */}
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: '1px',
              marginTop: '6px',
              backgroundColor: 'var(--color-border)',
              minHeight: '28px',
            }}
          />
        )}
      </div>

      {/* Event body */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : '20px' }}>
        {/* Date + decorative rule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              color,
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {formatDate(event.date)}
          </span>
          <div
            style={{
              flex: 1,
              height: '1px',
              background: `linear-gradient(to right, color-mix(in srgb, ${color} 40%, transparent), transparent)`,
            }}
          />
        </div>

        {/* Label */}
        <p
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: '0 0 3px',
            lineHeight: 1.3,
          }}
        >
          {event.label}
        </p>

        {/* Detail */}
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            margin: 0,
            lineHeight: 1.5,
            fontStyle: event.type === 'diary' ? 'italic' : 'normal',
          }}
        >
          {event.detail}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel displaying a character's relationship timeline.
 *
 * Shows a vertical list of chronological events:
 * - First conversation milestone (with message count)
 * - Every 10th session milestone
 * - Affinity tier unlocks (Friendly / Close / Devoted)
 * - The most recent diary entry as a short preview
 *
 * Follows the same animation and layout pattern as DiaryPanel and StatsPanel:
 * spring slide-in from the right, dark backdrop, click backdrop to close.
 *
 * Data comes from GET /api/characters/{id}/timeline on panel open.
 */
export function TimelinePanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'timeline';

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch timeline whenever the panel opens or the active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    setLoading(true);
    setError(null);
    setEvents([]);

    api.getTimeline(activeCharacter.id)
      .then(({ timeline }) => {
        setEvents((timeline ?? []) as unknown as TimelineEvent[]);
      })
      .catch(() => {
        setError('Failed to load timeline. Try again later.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, activeCharacter?.id]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="timeline-backdrop"
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
            key="timeline-panel"
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
              <Clock size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                TIMELINE
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
                aria-label="Close timeline panel"
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
              }}
            >
              {loading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  Loading…
                </p>
              )}

              {error && !loading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-danger, #f44)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  {error}
                </p>
              )}

              {!loading && !error && events.length === 0 && (
                /* Empty state */
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
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>🕰️</span>
                  <p
                    style={{
                      color: 'var(--color-text-muted)',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    No timeline events yet
                  </p>
                  <p
                    style={{
                      color: 'var(--color-text-muted)',
                      fontSize: '0.75rem',
                      maxWidth: '280px',
                      lineHeight: 1.5,
                      opacity: 0.75,
                      margin: 0,
                    }}
                  >
                    No timeline events yet — start chatting!
                  </p>
                </div>
              )}

              {!loading && !error && events.length > 0 && (
                <div>
                  {events.map((event, i) => (
                    <TimelineRow
                      key={`${event.type}-${event.date}-${i}`}
                      event={event}
                      isLast={i === events.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
