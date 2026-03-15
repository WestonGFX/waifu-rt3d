import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import styles from './PromptDebugPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single section of the assembled prompt with its token cost. */
interface BudgetSection {
  name: string;
  tokens: number;
  chars: number;
}

/** Full response shape from GET /api/context-budget/:sessionId. */
interface ContextBudget {
  ok: boolean;
  context_limit: number;
  history_limit: number;
  sections: BudgetSection[];
  total_tokens: number;
  remaining_tokens: number;
  usage_pct: number;
}

// ── Section color mapping ────────────────────────────────────────────────────

/**
 * Color for each prompt section segment in the budget bar.
 * Keys match the `name` field returned by the context-budget endpoint.
 *
 * system_prompt = purple, persona = pink, lorebook = orange,
 * memory = blue, history = green. Anything unrecognized gets gray.
 */
const SECTION_COLORS: Record<string, string> = {
  system_prompt: '#b49bf0',
  persona: '#ff8da1',
  lorebook: '#ffb86c',
  memory: '#6cb4ee',
  history: '#66d9a0',
  author_note: '#e0a8d0',
  game_memory: '#8ec9d2',
  knowledge_graph: '#c9a86c',
};

/** Fallback color for sections not in the color map. */
const DEFAULT_SECTION_COLOR = '#888';

/**
 * Resolve a section name to its display color.
 *
 * @param name - Section name from the budget API.
 * @returns CSS color string.
 */
function sectionColor(name: string): string {
  return SECTION_COLORS[name] ?? DEFAULT_SECTION_COLOR;
}

/** Polling interval for auto-refresh when the panel is expanded (ms). */
const POLL_INTERVAL_MS = 10_000;

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Prompt Assembly Debugger panel.
 *
 * Shows a stacked bar visualization of the LLM context window usage,
 * broken down by section (system prompt, persona, lorebook, memory,
 * history, etc.). Starts collapsed as a thin bar with usage %, click
 * to expand the full breakdown with per-section token counts.
 *
 * Data source: `GET /api/context-budget/:sessionId?char_id=:charId`
 *
 * Auto-refreshes every 10 seconds while expanded, and on every new
 * message (detected via message count change).
 *
 * @param props.charId - Active character ID, used as a query param.
 */
interface PromptDebugPanelProps {
  /** Active character ID for scoping the budget query. */
  charId?: number;
}

export function PromptDebugPanel({ charId }: PromptDebugPanelProps) {
  const sessionId = useChatStore((s) => s.sessionId);
  const messageCount = useChatStore((s) => s.messages.length);

  const [expanded, setExpanded] = useState(false);
  const [budget, setBudget] = useState<ContextBudget | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track message count to trigger refresh on new messages
  const prevMessageCount = useRef(messageCount);

  /**
   * Fetch the context budget from the backend.
   * Silently swallows errors and sets the error state for display.
   */
  const fetchBudget = useCallback(async () => {
    if (sessionId == null) return;
    try {
      const data = await api.getContextBudget(sessionId, charId);
      setBudget(data);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch budget';
      setError(message);
    }
  }, [sessionId, charId]);

  // Fetch on mount and when session/character changes
  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  // Refresh when message count changes (new message sent/received)
  useEffect(() => {
    if (messageCount !== prevMessageCount.current) {
      prevMessageCount.current = messageCount;
      // Small delay to let the backend process the message
      const timer = setTimeout(fetchBudget, 1500);
      return () => clearTimeout(timer);
    }
  }, [messageCount, fetchBudget]);

  // Poll every 10s while expanded
  useEffect(() => {
    if (!expanded) return;
    const interval = setInterval(fetchBudget, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [expanded, fetchBudget]);

  /**
   * Determine the CSS class for usage color coding.
   * Green < 60%, orange 60-85%, red > 85%.
   */
  const usageClass = budget
    ? budget.usage_pct > 85
      ? styles.usageRed
      : budget.usage_pct > 60
        ? styles.usageOrange
        : styles.usageGreen
    : '';

  /**
   * Format a number with thousands separators.
   *
   * @param n - The number to format.
   * @returns Formatted string (e.g. "2,570").
   */
  const fmt = (n: number) => n.toLocaleString();

  // Don't render at all if there's no session
  if (sessionId == null) return null;

  return (
    <div className={styles.wrapper}>
      {/* Collapsed header — always visible */}
      <div
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        aria-label="Toggle prompt debug panel"
      >
        <span className={styles.headerLabel}>Context</span>

        {/* Mini stacked bar in collapsed mode */}
        <div className={styles.miniBar}>
          {budget?.sections.map((s) => (
            <div
              key={s.name}
              className={styles.miniBarSegment}
              style={{
                width: `${(s.tokens / budget.context_limit) * 100}%`,
                background: sectionColor(s.name),
              }}
            />
          ))}
        </div>

        {/* Usage percentage */}
        {budget && (
          <span className={clsx(styles.headerUsage, usageClass)}>
            {budget.usage_pct.toFixed(1)}%
          </span>
        )}

        <ChevronDown
          size={14}
          className={clsx(styles.chevron, expanded && styles.chevronOpen)}
        />
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.detail}>
              {error && <div className={styles.error}>{error}</div>}

              {!budget && !error && (
                <div className={clsx(styles.budgetBar, styles.skeleton)} />
              )}

              {budget && (
                <>
                  {/* Full stacked bar */}
                  <div className={styles.budgetBar}>
                    {budget.sections.map((s) => {
                      const pct = (s.tokens / budget.context_limit) * 100;
                      return (
                        <div
                          key={s.name}
                          className={styles.budgetBarSegment}
                          style={{
                            width: `${pct}%`,
                            background: sectionColor(s.name),
                          }}
                          data-tooltip={`${s.name.replace(/_/g, ' ')}: ${fmt(s.tokens)} tokens (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>

                  {/* Section breakdown list */}
                  <ul className={styles.sectionList}>
                    {budget.sections.map((s) => {
                      const pct = (s.tokens / budget.context_limit) * 100;
                      return (
                        <li key={s.name} className={styles.sectionRow}>
                          <span
                            className={styles.sectionDot}
                            style={{ background: sectionColor(s.name) }}
                          />
                          <span className={styles.sectionName}>
                            {s.name.replace(/_/g, ' ')}
                          </span>
                          <span className={styles.sectionTokens}>
                            {fmt(s.tokens)}
                          </span>
                          <span className={styles.sectionPct}>
                            {pct.toFixed(1)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Totals */}
                  <div className={styles.totals}>
                    <span className={styles.totalLabel}>
                      Context window
                    </span>
                    <span className={clsx(styles.totalValue, usageClass)}>
                      {fmt(budget.total_tokens)} / {fmt(budget.context_limit)} tokens ({budget.usage_pct.toFixed(1)}%)
                    </span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
