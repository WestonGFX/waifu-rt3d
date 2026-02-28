import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, AlertTriangle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Props for the CompressionPreviewModal. */
export interface CompressionPreviewModalProps {
  /** When true, the modal is visible. */
  open: boolean;
  /** The session ID to compress. Null disables the Compress button. */
  sessionId: number | null;
  /** Called when the user cancels or the modal closes after success. */
  onClose: () => void;
  /** Called after a successful compression so the parent can refresh. */
  onCompressed: () => void;
}

/** Partial shape of a session from GET /api/sessions/{id}. */
interface SessionInfo {
  id: number;
  /** Title/name of the session, if set. */
  title?: string;
  /** Number of messages in the session. */
  message_count?: number;
  /** Estimated token count across all messages (may be absent). */
  token_count?: number;
}

/** Response from POST /api/sessions/{id}/compress. */
interface CompressResult {
  messages_removed: number;
  tokens_freed: number;
}

/** Internal view state for the modal. */
type ModalState =
  | 'idle'       // Preview loaded, waiting for user action
  | 'loading'    // Fetching session preview
  | 'compressing'// POST in progress
  | 'success'    // Compression done — showing result briefly before auto-close
  | 'error';     // Something went wrong

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Modal dialog that previews context window usage and lets the user trigger
 * a compression pass on the active session.
 *
 * Behaviour:
 * 1. When `open` becomes true, fetches GET /api/sessions/{sessionId} to
 *    display current message count and token usage before the user commits.
 * 2. On "Compress", calls POST /api/sessions/{sessionId}/compress and shows
 *    a brief success message with the compression stats.
 * 3. Auto-closes 1.5 seconds after a successful compression, calling both
 *    `onCompressed` and `onClose` so the parent can refresh its data.
 * 4. Backdrop click dismisses the modal (unless a compress is in flight).
 *
 * @param open        - Controls modal visibility.
 * @param sessionId   - Session to compress. Null disables the Compress button.
 * @param onClose     - Dismiss callback.
 * @param onCompressed - Post-success refresh callback.
 *
 * @example
 * <CompressionPreviewModal
 *   open={showCompress}
 *   sessionId={sessionId}
 *   onClose={() => setShowCompress(false)}
 *   onCompressed={() => chatStore.loadHistory(sessionId)}
 * />
 */
export function CompressionPreviewModal({
  open,
  sessionId,
  onClose,
  onCompressed,
}: CompressionPreviewModalProps) {
  const [state, setState] = useState<ModalState>('loading');
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch session preview whenever the modal opens
  useEffect(() => {
    if (!open || sessionId == null) return;

    setState('loading');
    setSessionInfo(null);
    setCompressResult(null);
    setErrorMsg(null);

    fetch(`/api/sessions/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ session?: SessionInfo } | SessionInfo>;
      })
      .then(data => {
        // Backend may return the session directly or nested under a "session" key
        const session = ('session' in data && data.session) ? data.session : data as SessionInfo;
        setSessionInfo(session);
        setState('idle');
      })
      .catch(() => {
        // Still allow compression even if the preview fetch fails
        setSessionInfo(null);
        setState('idle');
      });
  }, [open, sessionId]);

  /**
   * Execute the compression POST.
   * On success, shows a brief result before calling `onCompressed` + `onClose`.
   */
  const handleCompress = async () => {
    if (sessionId == null) return;
    setState('compressing');
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/compress`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
      const result = await res.json() as CompressResult;
      setCompressResult(result);
      setState('success');

      // Auto-close after 1.5 s
      setTimeout(() => {
        onCompressed();
        onClose();
      }, 1500);
    } catch {
      setErrorMsg('Compression failed. Please try again.');
      setState('error');
    }
  };

  /** Whether the backdrop click should dismiss the modal. */
  const canDismiss = state !== 'compressing';

  const handleBackdropClick = () => {
    if (canDismiss) onClose();
  };

  /* ── Helpers ── */

  /** Format a raw token count to a short string like "12.4k". */
  const formatTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="compress-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleBackdropClick}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              zIndex: 60,
            }}
          />

          {/* Modal */}
          <motion.div
            key="compress-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Compress context window"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(420px, 92vw)',
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              boxShadow: '0 24px 72px rgba(0,0,0,0.5)',
              zIndex: 70,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Zap size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.05em',
                  color: 'var(--color-text-primary)',
                }}
              >
                Compress Context
              </span>
              {canDismiss && (
                <button
                  onClick={onClose}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close"
                  aria-label="Close compression modal"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* ── Body ── */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Loading state */}
              {state === 'loading' && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.85rem', padding: '12px 0' }}>
                  Loading session info…
                </p>
              )}

              {/* Success state */}
              {state === 'success' && compressResult && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 0',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2rem', lineHeight: 1 }}>✅</span>
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Compressed!
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {compressResult.messages_removed > 0
                      ? `Removed ${compressResult.messages_removed} message${compressResult.messages_removed !== 1 ? 's' : ''}`
                      : 'Context updated'}
                    {compressResult.tokens_freed > 0
                      ? ` · freed ~${formatTokens(compressResult.tokens_freed)} tokens`
                      : ''}
                  </p>
                </div>
              )}

              {/* Error state */}
              {state === 'error' && errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, var(--color-danger, #f44) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-danger, #f44) 30%, transparent)',
                  }}
                >
                  <AlertTriangle size={14} style={{ color: 'var(--color-danger, #f44)', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-danger, #f44)' }}>
                    {errorMsg}
                  </p>
                </div>
              )}

              {/* Idle + compressing: show preview */}
              {(state === 'idle' || state === 'compressing' || state === 'error') && (
                <>
                  {/* Session stats card */}
                  {sessionId != null && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        gap: '24px',
                      }}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '1.3rem',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                            lineHeight: 1,
                          }}
                        >
                          {sessionInfo?.message_count != null
                            ? sessionInfo.message_count.toLocaleString()
                            : '—'}
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: '0.62rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            fontWeight: 600,
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          Messages
                        </p>
                      </div>
                      {sessionInfo?.token_count != null && (
                        <div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '1.3rem',
                              fontWeight: 700,
                              color: 'var(--color-text-primary)',
                              lineHeight: 1,
                            }}
                          >
                            {formatTokens(sessionInfo.token_count)}
                          </p>
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '0.62rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.07em',
                              fontWeight: 600,
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            Est. tokens
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Warning message */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
                    }}
                  >
                    <AlertTriangle
                      size={14}
                      style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '1px' }}
                    />
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                      Older messages will be summarized and removed to free up context space. This action cannot be undone.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* ── Footer actions ── */}
            {(state === 'idle' || state === 'compressing' || state === 'error') && (
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={onClose}
                  disabled={state === 'compressing'}
                  style={{
                    padding: '8px 18px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    cursor: state === 'compressing' ? 'not-allowed' : 'pointer',
                    opacity: state === 'compressing' ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompress}
                  disabled={state === 'compressing' || sessionId == null}
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--color-accent)',
                    color: '#fff',
                    cursor: state === 'compressing' || sessionId == null ? 'not-allowed' : 'pointer',
                    opacity: state === 'compressing' || sessionId == null ? 0.65 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {state === 'compressing' ? (
                    <>
                      <Zap size={13} style={{ opacity: 0.8 }} />
                      Compressing…
                    </>
                  ) : (
                    <>
                      <Zap size={13} />
                      Compress
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
