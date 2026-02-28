import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, FileText } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Response shape from POST /api/sessions/{id}/summarize. */
interface SummaryResponse {
  summary: string;
  /** Number of tokens saved by the compression; 0 when not applicable. */
  tokens_saved: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel that shows an AI-generated summary of the current
 * chat session.
 *
 * Behaviour:
 * - Opens when `activeOverlay === 'summary'`.
 * - Auto-fetches a summary via POST /api/sessions/{sessionId}/summarize
 *   whenever the panel opens or the active session changes.
 * - Shows a regenerate button so the user can re-request a fresh summary
 *   without closing the panel.
 * - Renders the summary inside a styled blockquote card.
 * - If `tokens_saved > 0`, shows a muted footer line reporting the saving.
 * - Empty state when no session is active.
 * - Error state when the backend is unreachable or LLM fails.
 *
 * @example
 * // Rendered unconditionally in App.tsx — the panel self-guards on activeOverlay.
 * <SessionSummaryPanel />
 */
export function SessionSummaryPanel() {
  const { activeOverlay, closeOverlay } = useAppStore();
  const { sessionId } = useChatStore();
  const open = activeOverlay === 'summary';

  const [summary, setSummary] = useState<string | null>(null);
  const [tokensSaved, setTokensSaved] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Request a session summary from the backend.
   * Safe to call multiple times — resets state before each fetch.
   *
   * @param sid - Session ID to summarize. Must be non-null.
   */
  const fetchSummary = (sid: number) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setTokensSaved(0);

    fetch(`/api/sessions/${sid}/summarize`, { method: 'POST' })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<SummaryResponse>;
      })
      .then(data => {
        setSummary(data.summary ?? null);
        setTokensSaved(data.tokens_saved ?? 0);
      })
      .catch(() => {
        setError('Failed to generate summary. Check LLM connection.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Auto-fetch whenever the panel opens or the session changes
  useEffect(() => {
    if (!open) return;
    if (sessionId == null) {
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }
    fetchSummary(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="summary-backdrop"
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
            key="summary-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Session summary"
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
              <FileText size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                SESSION SUMMARY
              </span>

              {/* Regenerate button — only active when a session exists */}
              <button
                onClick={() => sessionId != null && fetchSummary(sessionId)}
                disabled={loading || sessionId == null}
                title="Regenerate summary"
                aria-label="Regenerate session summary"
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  borderRadius: '5px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: loading ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                  cursor: loading || sessionId == null ? 'not-allowed' : 'pointer',
                  opacity: sessionId == null ? 0.4 : 1,
                }}
              >
                <RefreshCw
                  size={11}
                  style={{
                    // Spin the icon while loading
                    animation: loading ? 'spin 1s linear infinite' : 'none',
                  }}
                />
                Regenerate
              </button>

              <button
                onClick={closeOverlay}
                style={{
                  marginLeft: '6px',
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
                aria-label="Close session summary panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* No active session */}
              {sessionId == null && (
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
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>💬</span>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    Start a conversation first
                  </p>
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Open a chat session, exchange some messages, then come back here for an AI-generated summary.
                  </p>
                </div>
              )}

              {/* Loading skeleton */}
              {sessionId != null && loading && (
                <div style={{ padding: '20px 0' }}>
                  <p
                    style={{
                      textAlign: 'center',
                      color: 'var(--color-text-tertiary)',
                      fontSize: '0.85rem',
                      marginBottom: '24px',
                    }}
                  >
                    Generating summary…
                  </p>
                  {/* Skeleton lines */}
                  {[1, 0.9, 0.95, 0.7].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        height: '12px',
                        width: `${w * 100}%`,
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-surface)',
                        marginBottom: '10px',
                        // Pulsing shimmer via opacity animation (CSS @keyframes not available inline;
                        // using a simple opacity approach that still conveys loading)
                        opacity: 0.5,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Error state */}
              {error && !loading && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2rem', lineHeight: 1, opacity: 0.5 }}>⚠️</span>
                  <p style={{ color: 'var(--color-danger, #f55)', fontSize: '0.85rem', margin: 0 }}>
                    {error}
                  </p>
                </div>
              )}

              {/* Summary content */}
              {summary && !loading && !error && (
                <article style={{ flex: 1 }}>
                  {/* Decorative accent rule */}
                  <div
                    style={{
                      height: '2px',
                      marginBottom: '20px',
                      borderRadius: '1px',
                      background: 'linear-gradient(to right, var(--color-accent), transparent)',
                      opacity: 0.45,
                    }}
                  />

                  {/* Summary blockquote card */}
                  <blockquote
                    style={{
                      margin: 0,
                      padding: '18px 20px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderLeft: '3px solid var(--color-accent)',
                      fontSize: '0.88rem',
                      lineHeight: 1.8,
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontStyle: 'italic',
                    }}
                  >
                    {summary}
                  </blockquote>

                  {/* Token savings footer — only shown when non-zero */}
                  {tokensSaved > 0 && (
                    <p
                      style={{
                        marginTop: '16px',
                        fontSize: '0.7rem',
                        color: 'var(--color-text-tertiary)',
                        textAlign: 'right',
                        opacity: 0.7,
                      }}
                    >
                      Tokens saved: {tokensSaved.toLocaleString()}
                    </p>
                  )}
                </article>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── CSS keyframe for the spinning refresh icon ─────────────────────────────
   Injected once into the document head so we don't need an external CSS file. */
if (typeof document !== 'undefined') {
  const styleId = 'session-summary-panel-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}
