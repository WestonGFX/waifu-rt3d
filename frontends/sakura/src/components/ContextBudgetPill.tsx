import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

/** Shape returned by GET /api/context-budget/{sessionId}. */
interface ContextBudgetResponse {
  ok: boolean;
  sections: Array<{ name: string; tokens: number; chars: number }>;
  total_tokens: number;
  context_limit: number;
  usage_pct: number;
  remaining_tokens: number;
  history_messages?: number;
  token_counter?: 'tiktoken' | 'heuristic';
}

/**
 * Props for the {@link ContextBudgetPill} component.
 *
 * @param sessionId           - Active chat session ID; pill is hidden when null.
 * @param messageCount        - Bumped after each reply to trigger a data re-fetch.
 * @param autoCompactThreshold - Percentage at which auto-compact kicks in (display only).
 * @param onCompact           - Optional callback fired after a successful manual compress.
 */
interface ContextBudgetPillProps {
  sessionId: number | null | undefined;
  messageCount: number;
  autoCompactThreshold?: number;
  onCompact?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a CSS color string based on context usage percentage.
 * Green <50%, amber 50-80%, red >80%.
 *
 * @param pct - Usage percentage 0-100.
 * @returns CSS color value.
 */
function budgetColor(pct: number): string {
  if (pct > 80) return 'var(--color-error, #f44)';
  if (pct > 50) return '#f59e0b';
  return 'var(--color-success, #4ade80)';
}

/**
 * Formats a token count into a compact human-readable string.
 *
 * @param n - Token count.
 * @returns Formatted string, e.g. "2.1k", "1.3M", or "842".
 *
 * @example
 * fmtTokens(2100)      // "2.1k"
 * fmtTokens(1_300_000) // "1.3M"
 * fmtTokens(42)        // "42"
 */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Clickable pill showing current context window usage (tokens / max / percentage)
 * with a colored status dot. Clicking expands a dropdown with per-section
 * breakdown bars, remaining tokens, auto-compact threshold info, and a
 * "Compact Now" button.
 *
 * Fetches `/api/context-budget/{sessionId}` on mount and whenever
 * `messageCount` changes (i.e. after each assistant reply).
 *
 * @example
 * <ContextBudgetPill
 *   sessionId={activeSession?.id}
 *   messageCount={messages.length}
 *   onCompact={() => refetchMessages()}
 * />
 */
export function ContextBudgetPill({
  sessionId,
  messageCount,
  autoCompactThreshold = 85,
  onCompact,
}: ContextBudgetPillProps) {
  const [data, setData] = useState<ContextBudgetResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  // ── Fetch budget data ────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionId == null) { setData(null); return; }
    fetch(`/api/context-budget/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((resp: ContextBudgetResponse | null) => {
        if (resp) setData(resp);
      })
      .catch(() => {});
    // messageCount is intentionally included to re-fetch after each reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messageCount]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Compact handler ──────────────────────────────────────────────────────
  const handleCompact = useCallback(async () => {
    if (!sessionId || compacting) return;
    setCompacting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/compress`, { method: 'POST' });
      if (res.ok) {
        // Re-fetch budget data after compression
        const budgetRes = await fetch(`/api/context-budget/${sessionId}`);
        if (budgetRes.ok) {
          const freshData = await budgetRes.json();
          setData(freshData);
        }
        onCompact?.();
      }
    } catch {
      // Silently handle errors — the user sees the button stop spinning
    } finally {
      setCompacting(false);
    }
  }, [sessionId, compacting, onCompact]);

  // ── Don't render when there's no data or no session ──────────────────────
  if (!data || data.context_limit === 0) return null;

  const pct = data.usage_pct != null
    ? Math.round(data.usage_pct * 10) / 10
    : Math.round((data.total_tokens / data.context_limit) * 1000) / 10;
  const color = budgetColor(pct);
  const autoCompactTokens = Math.round(data.context_limit * (autoCompactThreshold / 100));
  const isExact = data.token_counter === 'tiktoken';

  // Find the max section tokens for proportional bar widths
  const maxSectionTokens = data.sections.length > 0
    ? Math.max(...data.sections.map(s => s.tokens))
    : 1;

  return (
    <div ref={pillRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* ── Pill button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`Context: ${pct}% — ${data.total_tokens}/${data.context_limit} tokens`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 20,
          border: `1px solid color-mix(in srgb, ${color} 30%, var(--color-border))`,
          backgroundColor: 'var(--color-surface)',
          cursor: 'pointer',
          fontSize: '0.72rem',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
          boxShadow: open ? `0 0 0 1px color-mix(in srgb, ${color} 20%, transparent)` : 'none',
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 5px ${color}`,
            flexShrink: 0,
          }}
        />

        {/* Token summary */}
        <span style={{ whiteSpace: 'nowrap' }}>
          {fmtTokens(data.total_tokens)} / {fmtTokens(data.context_limit)}{' '}
          <span style={{ opacity: 0.7 }}>({pct}%)</span>
        </span>

        {/* Chevron */}
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            opacity: 0.6,
          }}
        />
      </button>

      {/* ── Expanded dropdown ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: 280,
              borderRadius: 12,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              zIndex: 60,
              overflow: 'hidden',
              padding: '12px 14px',
            }}
          >
            {/* Section breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.sections.map((section) => {
                const barPct = maxSectionTokens > 0
                  ? (section.tokens / maxSectionTokens) * 100
                  : 0;
                return (
                  <div key={section.name}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.68rem',
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        {section.name}
                      </span>
                      <span style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTokens(section.tokens)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 99,
                        backgroundColor: 'var(--color-border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(barPct, 100)}%`,
                          height: '100%',
                          borderRadius: 99,
                          backgroundColor: color,
                          opacity: 0.8,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Separator */}
            <div
              style={{
                height: 1,
                backgroundColor: 'var(--color-border-subtle)',
                margin: '10px 0',
              }}
            />

            {/* Remaining tokens */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.7rem',
              }}
            >
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Remaining
              </span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtTokens(data.remaining_tokens)}
              </span>
            </div>

            {/* History message count (if available) */}
            {data.history_messages != null && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.68rem',
                  marginTop: 4,
                }}
              >
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  History messages
                </span>
                <span style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                  {data.history_messages}
                </span>
              </div>
            )}

            {/* Footer: auto-compact info + counter badge */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
                fontSize: '0.64rem',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span>
                Auto-compact at {autoCompactThreshold}% ({fmtTokens(autoCompactTokens)})
              </span>
              <span
                style={{
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  backgroundColor: isExact
                    ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : 'color-mix(in srgb, var(--color-text-tertiary) 15%, transparent)',
                  color: isExact ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                }}
              >
                {isExact ? 'exact' : '~est'}
              </span>
            </div>

            {/* Compact Now button */}
            <button
              onClick={handleCompact}
              disabled={pct < 30 || compacting}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '6px 0',
                borderRadius: 8,
                border: 'none',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: pct < 30 || compacting ? 'not-allowed' : 'pointer',
                color: pct < 30 || compacting
                  ? 'var(--color-text-tertiary)'
                  : 'var(--color-accent-text, #fff)',
                backgroundColor: pct < 30 || compacting
                  ? 'var(--color-border)'
                  : 'var(--color-accent)',
                opacity: pct < 30 || compacting ? 0.5 : 1,
                transition: 'background-color 0.2s ease, opacity 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {compacting && (
                <Loader2
                  size={12}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
              )}
              {compacting ? 'Compacting...' : 'Compact Now'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spinner keyframes (injected once) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
