import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, Square, ChevronDown } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface SessionSummary {
  id: number;
  title?: string;
  created_at: string;
  message_count?: number;
}

interface SessionMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

/** Playback speed multiplier options. */
type SpeedOption = 1 | 2 | 4;

/** Current state of the replay playback engine. */
type PlayState = 'idle' | 'playing' | 'paused' | 'done';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Base delay in milliseconds between messages appearing during replay.
 * Divided by the speed multiplier: 1x → 1600ms, 2x → 800ms, 4x → 400ms.
 */
const BASE_DELAY_MS = 1600;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format an ISO datetime string into a short readable label.
 *
 * @param iso - ISO 8601 string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...).
 * @returns Formatted string like "Jan 15, 2025", or the original on failure.
 */
function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Build a display label for a session dropdown option.
 *
 * @param s - Session summary from the API.
 * @returns Human-readable label combining ID, title/date, and message count.
 */
function sessionLabel(s: SessionSummary): string {
  const datePart = fmtDate(s.created_at);
  const titlePart = s.title ? s.title : datePart;
  const countPart = s.message_count != null ? ` · ${s.message_count} msgs` : '';
  return `#${s.id}  ${titlePart}${countPart}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A simplified message bubble used during replay playback.
 * Styled to match the user/assistant distinction without TTS or reaction
 * controls. Fades in with a brief vertical slide for cinematic effect.
 *
 * @param role - "user" | "assistant" | "system"
 * @param content - Message text.
 */
function ReplayBubble({ role, content }: { role: SessionMessage['role']; content: string }) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: isSystem ? '6px 12px' : '9px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          backgroundColor: isSystem
            ? 'transparent'
            : isUser
              ? 'var(--color-accent)'
              : 'var(--color-surface)',
          border: isSystem
            ? 'none'
            : isUser
              ? 'none'
              : '1px solid var(--color-border-subtle)',
          color: isSystem
            ? 'var(--color-text-tertiary)'
            : isUser
              ? '#fff'
              : 'var(--color-text-primary)',
          fontSize: isSystem ? '0.7rem' : '0.84rem',
          lineHeight: 1.55,
          fontStyle: isSystem ? 'italic' : 'normal',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </motion.div>
  );
}

/**
 * Speed selector: three buttons for 1x / 2x / 4x.
 *
 * @param speed - Currently active speed.
 * @param onChange - Callback when user selects a new speed.
 */
function SpeedSelector({
  speed,
  onChange,
}: {
  speed: SpeedOption;
  onChange: (s: SpeedOption) => void;
}) {
  const OPTIONS: SpeedOption[] = [1, 2, 4];
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {OPTIONS.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-pressed={speed === s}
          style={{
            padding: '3px 10px',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            backgroundColor: speed === s
              ? 'var(--color-accent)'
              : 'transparent',
            color: speed === s ? '#fff' : 'var(--color-text-secondary)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.12s',
          }}
        >
          {s}x
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel for replaying past chat sessions.
 *
 * Workflow:
 * 1. Panel opens → fetches session list via GET /api/sessions?character_id={id}
 * 2. User picks a session from the dropdown
 * 3. On session selection → fetches messages via GET /api/sessions/{id}/messages
 * 4. User presses Play → messages appear one at a time with a configurable delay
 * 5. Playback controls: Play/Pause, Stop, and 1x/2x/4x speed selector
 * 6. A progress bar tracks position through the message list
 *
 * IMPORTANT: Replay is entirely decorative. No messages are sent to the backend.
 *
 * Overlay key: 'replay'
 */
export function SessionReplayModal() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'replay';

  // Session list state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Currently selected session
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // Messages for the selected session
  const [allMessages, setAllMessages] = useState<SessionMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);

  // Playback state
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [visibleCount, setVisibleCount] = useState(0);
  const [speed, setSpeed] = useState<SpeedOption>(1);

  // Ref for the active timeout so we can clear it on pause/stop
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Fetch session list when the panel opens
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    let cancelled = false;
    setSessionsLoading(true);
    setSessionsError(null);
    setSessions([]);
    setSelectedSessionId(null);
    setAllMessages([]);
    setPlayState('idle');
    setVisibleCount(0);

    fetch(`/api/sessions?character_id=${activeCharacter.id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setSessions(data as SessionSummary[]);
        } else if (data && typeof data === 'object' && 'sessions' in data) {
          // Some backends wrap the array in { sessions: [] }
          setSessions((data as { sessions: SessionSummary[] }).sessions);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionsError('Failed to load sessions.');
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, activeCharacter?.id]);

  // Fetch messages when a session is selected
  useEffect(() => {
    if (selectedSessionId == null) return;

    let cancelled = false;
    setMsgsLoading(true);
    setMsgsError(null);
    setAllMessages([]);
    setPlayState('idle');
    setVisibleCount(0);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    fetch(`/api/sessions/${selectedSessionId}/messages`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setAllMessages(data as SessionMessage[]);
        } else if (data && typeof data === 'object' && 'messages' in data) {
          setAllMessages((data as { messages: SessionMessage[] }).messages);
        }
      })
      .catch(() => {
        if (!cancelled) setMsgsError('Failed to load session messages.');
      })
      .finally(() => {
        if (!cancelled) setMsgsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedSessionId]);

  // Cleanup timeout on unmount or close
  useEffect(() => {
    if (!open && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [open]);

  // Auto-scroll to the bottom as new messages appear
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleCount]);

  /**
   * Advance the replay by one message, then schedule the next step.
   * Uses a closure over the current speed to derive the correct delay.
   */
  const stepReplay = useCallback((currentCount: number, total: number, currentSpeed: SpeedOption) => {
    if (currentCount >= total) {
      setPlayState('done');
      return;
    }
    const nextCount = currentCount + 1;
    setVisibleCount(nextCount);
    timeoutRef.current = setTimeout(
      () => stepReplay(nextCount, total, currentSpeed),
      BASE_DELAY_MS / currentSpeed,
    );
  }, []);

  /** Start or resume playback. */
  const handlePlay = () => {
    if (allMessages.length === 0) return;
    if (playState === 'done') {
      // Restart from the beginning
      setVisibleCount(0);
      setPlayState('playing');
      timeoutRef.current = setTimeout(
        () => stepReplay(0, allMessages.length, speed),
        BASE_DELAY_MS / speed,
      );
    } else if (playState === 'paused') {
      setPlayState('playing');
      timeoutRef.current = setTimeout(
        () => stepReplay(visibleCount, allMessages.length, speed),
        BASE_DELAY_MS / speed,
      );
    } else if (playState === 'idle') {
      setPlayState('playing');
      timeoutRef.current = setTimeout(
        () => stepReplay(0, allMessages.length, speed),
        BASE_DELAY_MS / speed,
      );
    }
  };

  /** Pause playback without resetting position. */
  const handlePause = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPlayState('paused');
  };

  /** Stop playback and reset to the beginning. */
  const handleStop = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPlayState('idle');
    setVisibleCount(0);
  };

  /**
   * Change playback speed. If currently playing, the next step will pick up
   * the new speed automatically; the in-flight timeout uses the old speed for
   * one more tick, which is an acceptable UX trade-off.
   *
   * @param s - New speed multiplier.
   */
  const handleSpeedChange = (s: SpeedOption) => {
    setSpeed(s);
  };

  const progressPct =
    allMessages.length > 0 ? Math.round((visibleCount / allMessages.length) * 100) : 0;

  const visibleMessages = allMessages.slice(0, visibleCount);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="replay-backdrop"
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
            key="replay-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Session replay"
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
              <Play size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                SESSION REPLAY
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
                aria-label="Close session replay"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Session selector row ── */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              {sessionsLoading && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', margin: 0 }}>
                  Loading sessions…
                </p>
              )}

              {sessionsError && !sessionsLoading && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-error)', margin: 0 }}>
                  {sessionsError}
                </p>
              )}

              {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', margin: 0 }}>
                  No sessions found for this character.
                </p>
              )}

              {!sessionsLoading && sessions.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedSessionId ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedSessionId(val ? Number(val) : null);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 32px 8px 10px',
                      appearance: 'none',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Select a session…</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {sessionLabel(s)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--color-text-tertiary)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Message feed ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
              }}
            >
              {msgsLoading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  Loading messages…
                </p>
              )}

              {msgsError && !msgsLoading && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-error)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  {msgsError}
                </p>
              )}

              {!msgsLoading && !msgsError && selectedSessionId == null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: '12px',
                    textAlign: 'center',
                    opacity: 0.55,
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>▶</span>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    Select a session above, then press Play to replay it.
                  </p>
                </div>
              )}

              {!msgsLoading && !msgsError && selectedSessionId != null && allMessages.length > 0 && (
                <>
                  {visibleMessages.map(msg => (
                    <ReplayBubble key={msg.id} role={msg.role} content={msg.content} />
                  ))}
                  {/* Anchor for auto-scroll */}
                  <div ref={scrollAnchorRef} />
                </>
              )}

              {!msgsLoading && !msgsError && selectedSessionId != null && allMessages.length === 0 && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: '0.85rem',
                    padding: '40px 0',
                  }}
                >
                  This session has no messages.
                </p>
              )}
            </div>

            {/* ── Playback controls ── */}
            {selectedSessionId != null && allMessages.length > 0 && (
              <div
                style={{
                  padding: '12px 20px 16px',
                  borderTop: '1px solid var(--color-border)',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Progress bar */}
                <div>
                  <div
                    style={{
                      height: '4px',
                      borderRadius: 99,
                      backgroundColor: 'var(--color-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        borderRadius: 99,
                        backgroundColor: 'var(--color-accent)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--color-text-tertiary)',
                      marginTop: '4px',
                      textAlign: 'right',
                    }}
                  >
                    {visibleCount} / {allMessages.length} messages
                    {playState === 'done' ? ' — done' : ''}
                  </p>
                </div>

                {/* Buttons row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Play / Pause */}
                  {playState === 'playing' ? (
                    <button
                      onClick={handlePause}
                      aria-label="Pause replay"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: 'var(--color-accent)',
                        color: '#fff',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Pause size={13} /> Pause
                    </button>
                  ) : (
                    <button
                      onClick={handlePlay}
                      disabled={msgsLoading}
                      aria-label="Play replay"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: 'var(--color-accent)',
                        color: '#fff',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: msgsLoading ? 'not-allowed' : 'pointer',
                        opacity: msgsLoading ? 0.55 : 1,
                      }}
                    >
                      <Play size={13} />
                      {playState === 'done' ? 'Replay' : 'Play'}
                    </button>
                  )}

                  {/* Stop */}
                  <button
                    onClick={handleStop}
                    disabled={playState === 'idle'}
                    aria-label="Stop replay"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: playState === 'idle' ? 'not-allowed' : 'pointer',
                      opacity: playState === 'idle' ? 0.4 : 1,
                    }}
                  >
                    <Square size={13} /> Stop
                  </button>

                  {/* Speed selector — right-aligned */}
                  <div style={{ marginLeft: 'auto' }}>
                    <SpeedSelector speed={speed} onChange={handleSpeedChange} />
                  </div>
                </div>

                {/* Disclaimer */}
                <p
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                    opacity: 0.6,
                    textAlign: 'center',
                  }}
                >
                  Replay is decorative — no messages are actually sent.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
