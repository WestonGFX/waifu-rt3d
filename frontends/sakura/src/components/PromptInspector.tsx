/**
 * PromptInspector -- displays the fully assembled LLM prompt with
 * per-section token breakdown.  Dev-mode tool for understanding
 * exactly what context the AI receives each turn.
 *
 * Fetches from GET /api/dev/prompt-inspect/{sessionId} and renders
 * collapsible section panels with monospace content previews, token
 * badges, chat history stats, and rolling summary details.
 *
 * Designed to be mounted as a tab inside the DevConsole panel.
 *
 * @example
 * <PromptInspector sessionId={activeSession?.id} />
 */

import { useState, useCallback } from 'react';
import { ChevronRight, RefreshCw, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single prompt section returned by the inspect endpoint. */
interface PromptSection {
  name: string;
  content: string;
  tokens: number;
  chars: number;
}

/** Rolling summary entry from session_summaries table. */
interface SummaryEntry {
  text: string;
  range: string;
  tokens: number;
}

/** Full response shape from GET /api/dev/prompt-inspect/{sessionId}. */
interface InspectResponse {
  ok: boolean;
  error?: string;
  sections: PromptSection[];
  history: {
    message_count: number;
    tokens: number;
  };
  summaries: SummaryEntry[];
  token_counter: 'tiktoken' | 'heuristic';
}

/**
 * Props for the {@link PromptInspector} component.
 *
 * @param sessionId - Active chat session ID; inspector is disabled when null.
 * @param charId    - Optional character ID override.
 */
interface PromptInspectorProps {
  sessionId: number | null | undefined;
  charId?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a token count into a compact human-readable string.
 *
 * @param n - Token count.
 * @returns Formatted string, e.g. "2.1k" or "842".
 */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Component ────────────────────────────────────────────────────────────────

export function PromptInspector({ sessionId, charId }: PromptInspectorProps) {
  const [data, setData] = useState<InspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  /**
   * Fetch prompt inspection data from the backend.
   * Clears previous data and error state before fetching.
   */
  const fetchInspection = useCallback(async () => {
    if (sessionId == null) return;
    setLoading(true);
    setError(null);
    try {
      const q = charId ? `?char_id=${charId}` : '';
      const res = await fetch(`/api/dev/prompt-inspect/${sessionId}${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: InspectResponse = await res.json();
      if (!json.ok) throw new Error(json.error || 'Unknown error');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, charId]);

  /**
   * Toggle a section's expanded/collapsed state.
   *
   * @param name - Section name to toggle.
   */
  const toggleSection = (name: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Compute totals when data is available
  const totalSectionTokens = data
    ? data.sections.reduce((sum, s) => sum + s.tokens, 0)
    : 0;
  const grandTotal = totalSectionTokens + (data?.history.tokens ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Prompt Inspector
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Token counter badge */}
          {data && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.03em',
                backgroundColor: data.token_counter === 'tiktoken'
                  ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-text-tertiary) 15%, transparent)',
                color: data.token_counter === 'tiktoken'
                  ? 'var(--color-success)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {data.token_counter === 'tiktoken' ? 'tiktoken' : '~heuristic'}
            </span>
          )}

          {/* Total tokens badge */}
          {data && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: '0.62rem',
                fontWeight: 600,
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              {fmtTokens(grandTotal)} total
            </span>
          )}

          {/* Refresh / Fetch button */}
          <button
            onClick={fetchInspection}
            disabled={loading || sessionId == null}
            title={data ? 'Refresh inspection' : 'Inspect prompt'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              cursor: loading || sessionId == null ? 'not-allowed' : 'pointer',
              fontSize: '0.65rem',
              fontWeight: 500,
              opacity: loading || sessionId == null ? 0.5 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {loading ? (
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <RefreshCw size={11} />
            )}
            {data ? 'Refresh' : 'Inspect'}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* No session */}
        {sessionId == null && (
          <div style={emptyStyle}>No active session selected.</div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ ...emptyStyle, color: 'var(--color-error, #f44)' }}>
            Error: {error}
          </div>
        )}

        {/* Empty state — haven't fetched yet */}
        {!data && !loading && !error && sessionId != null && (
          <div style={emptyStyle}>
            Click <strong>Inspect</strong> to load the assembled prompt.
          </div>
        )}

        {/* Loading spinner */}
        {loading && !data && (
          <div style={{ ...emptyStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading prompt sections...
          </div>
        )}

        {/* ── Sections list ──────────────────────────────────────────────── */}
        {data && data.sections.map((section, idx) => {
          const isOpen = expandedSections.has(section.name);
          return (
            <div
              key={`${section.name}-${idx}`}
              style={{
                borderBottom: '1px solid var(--color-border-subtle, var(--color-border))',
                backgroundColor: idx % 2 === 0
                  ? 'transparent'
                  : 'color-mix(in srgb, var(--color-surface) 60%, var(--color-bg))',
              }}
            >
              {/* Section header — clickable */}
              <button
                onClick={() => toggleSection(section.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 6,
                }}
              >
                <ChevronRight
                  size={12}
                  style={{
                    flexShrink: 0,
                    transition: 'transform 0.15s ease',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'var(--color-text-tertiary)',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {section.name}
                </span>

                {/* Token pill */}
                <span style={pillStyle}>
                  {fmtTokens(section.tokens)} tok
                </span>

                {/* Char count */}
                <span
                  style={{
                    fontSize: '0.58rem',
                    color: 'var(--color-text-tertiary)',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 44,
                    textAlign: 'right',
                  }}
                >
                  {section.chars.toLocaleString()} ch
                </span>
              </button>

              {/* Section content — collapsible */}
              {isOpen && (
                <div
                  style={{
                    padding: '4px 12px 8px 30px',
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  <pre
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                      fontSize: '0.62rem',
                      lineHeight: 1.5,
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                      padding: 8,
                      borderRadius: 6,
                      backgroundColor: 'color-mix(in srgb, var(--color-bg) 80%, var(--color-surface))',
                      border: '1px solid var(--color-border-subtle, var(--color-border))',
                    }}
                  >
                    {section.content || '(empty)'}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {/* ── History summary ────────────────────────────────────────────── */}
        {data && (
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-border-subtle, var(--color-border))',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.7rem',
              }}
            >
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Chat History
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)' }}>
                  {data.history.message_count} messages
                </span>
                <span style={pillStyle}>
                  {fmtTokens(data.history.tokens)} tok
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Rolling summaries ──────────────────────────────────────────── */}
        {data && data.summaries.length > 0 && (
          <div style={{ padding: '8px 12px' }}>
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: 6,
              }}
            >
              Rolling Summaries ({data.summaries.length})
            </div>
            {data.summaries.map((summary, i) => (
              <div
                key={i}
                style={{
                  padding: '4px 8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  backgroundColor: 'color-mix(in srgb, var(--color-bg) 80%, var(--color-surface))',
                  border: '1px solid var(--color-border-subtle, var(--color-border))',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.6rem',
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 500,
                    }}
                  >
                    msgs {summary.range}
                  </span>
                  <span style={pillStyle}>
                    {fmtTokens(summary.tokens)} tok
                  </span>
                </div>
                <pre
                  style={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: '0.58rem',
                    lineHeight: 1.4,
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                    maxHeight: 100,
                    overflowY: 'auto',
                  }}
                >
                  {summary.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Shared inline styles ──────────────────────────────────────────────────────

/** Style for the empty/placeholder text shown before data loads. */
const emptyStyle: React.CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  fontSize: '0.72rem',
  color: 'var(--color-text-tertiary)',
};

/** Style for the small rounded token count pills. */
const pillStyle: React.CSSProperties = {
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: '0.58rem',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
  color: 'var(--color-accent)',
  whiteSpace: 'nowrap',
};
