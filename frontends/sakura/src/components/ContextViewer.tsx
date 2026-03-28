/**
 * ContextViewer — Feature P2: Context Assembly Viewer
 *
 * Debug panel showing exactly what's sent to the LLM for each conversation.
 * Visualizes prompt sections, token counts, and budget utilization.
 *
 * Data sources:
 * - GET /api/dev/prompt-inspect/{session_id} — full sections with content
 * - GET /api/context-budget/{session_id} — budget summary
 *
 * Design:
 * - Right slide-in panel (520px, slightly wider for code readability)
 * - Stacked token budget bar at top
 * - Collapsible sections with color-coded categories
 * - Summaries and history stats
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronDown, ChevronRight, Loader2, RefreshCw,
  Cpu, FileText, BookOpen, MessageCircle, Brain,
  Sparkles, Zap, Eye,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface PromptSection {
  name: string;
  content: string;
  tokens: number;
  chars: number;
}

interface SummaryEntry {
  text: string;
  range: string;
  tokens: number;
}

interface InspectData {
  sections: PromptSection[];
  history: { message_count: number; tokens: number };
  summaries: SummaryEntry[];
  token_counter: 'tiktoken' | 'heuristic';
}

interface BudgetData {
  context_limit: number;
  sections: Array<{ name: string; tokens: number; chars: number }>;
  total_tokens: number;
  remaining_tokens: number;
  usage_pct: number;
  token_counter: 'tiktoken' | 'heuristic';
}

/* ═══════════════════════════════════════════════════════════════════════
   Section categorization — maps section names to visual groups
   ═══════════════════════════════════════════════════════════════════════ */

type SectionCategory = 'system' | 'character' | 'context' | 'memory' | 'format' | 'other';

/**
 * Categorize a prompt section by its name for color-coding.
 *
 * @param name - Section name from _build_prompt_sections.
 * @returns Category key for styling.
 */
function categorize(name: string): SectionCategory {
  const lower = name.toLowerCase();
  if (lower.includes('system prompt') || lower.includes('user persona')) return 'system';
  if (lower.includes('bible') || lower.includes('character') || lower.includes('mood')
      || lower.includes('diary') || lower.includes('greeting') || lower.includes('anniversary')
      || lower.includes('sarcasm') || lower.includes('vocal')) return 'character';
  if (lower.includes('scene') || lower.includes('director') || lower.includes('interaction mode')
      || lower.includes('author')) return 'context';
  if (lower.includes('fact') || lower.includes('memory') || lower.includes('nostalgia')
      || lower.includes('knowledge') || lower.includes('vocabulary') || lower.includes('game')
      || lower.includes('relationship')) return 'memory';
  if (lower.includes('emotion') || lower.includes('response format') || lower.includes('rp style')
      || lower.includes('content') || lower.includes('mode response')) return 'format';
  return 'other';
}

const CATEGORY_STYLE: Record<SectionCategory, { color: string; bg: string; icon: typeof Cpu }> = {
  system:    { color: 'var(--color-accent)',        bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',   icon: Cpu },
  character: { color: '#e9729f',                    bg: 'rgba(233,114,159,0.08)',                                     icon: Sparkles },
  context:   { color: '#f59e0b',                    bg: 'rgba(245,158,11,0.08)',                                      icon: Eye },
  memory:    { color: '#39c96e',                    bg: 'rgba(57,201,110,0.08)',                                      icon: Brain },
  format:    { color: 'var(--color-text-secondary)', bg: 'color-mix(in srgb, var(--color-text-secondary) 8%, transparent)', icon: FileText },
  other:     { color: 'var(--color-text-tertiary)',  bg: 'color-mix(in srgb, var(--color-text-tertiary) 8%, transparent)', icon: Zap },
};

/** Category labels for the legend. */
const CATEGORY_LABELS: Record<SectionCategory, string> = {
  system: 'System',
  character: 'Character',
  context: 'Context',
  memory: 'Memory & Knowledge',
  format: 'Formatting',
  other: 'Other',
};

/* ═══════════════════════════════════════════════════════════════════════
   Budget Bar — stacked horizontal bar showing token allocation
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Stacked token budget visualization.
 * Groups sections by category and shows proportional widths.
 *
 * @param sections  - Prompt sections with token counts.
 * @param historyTokens - Tokens used by chat history.
 * @param limit     - Total context window size.
 * @param totalUsed - Total tokens consumed.
 */
function BudgetBar({
  sections,
  historyTokens,
  limit,
  totalUsed,
}: {
  sections: Array<{ name: string; tokens: number }>;
  historyTokens: number;
  limit: number;
  totalUsed: number;
}) {
  // Group by category
  const groups = new Map<SectionCategory, number>();
  for (const s of sections) {
    const cat = categorize(s.name);
    groups.set(cat, (groups.get(cat) ?? 0) + s.tokens);
  }

  // Add history as its own segment
  const segments: Array<{ cat: SectionCategory | 'history'; tokens: number; color: string; label: string }> = [];
  for (const [cat, tokens] of groups) {
    if (tokens > 0) {
      segments.push({ cat, tokens, color: CATEGORY_STYLE[cat].color, label: CATEGORY_LABELS[cat] });
    }
  }
  if (historyTokens > 0) {
    segments.push({ cat: 'history', tokens: historyTokens, color: '#6366f1', label: 'Chat History' });
  }

  const responseReserve = Math.max(256, Math.round(limit * 0.1));
  const usagePct = limit > 0 ? (totalUsed / limit) * 100 : 0;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Header stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>
          {totalUsed.toLocaleString()} / {limit.toLocaleString()} tokens
        </span>
        <span
          style={{
            fontSize: '0.68rem', fontWeight: 600,
            color: usagePct > 80 ? 'var(--color-danger)' : usagePct > 50 ? '#f59e0b' : 'var(--color-success)',
          }}
        >
          {usagePct.toFixed(1)}% used
        </span>
      </div>

      {/* Stacked bar */}
      <div
        style={{
          height: 16, borderRadius: 8, overflow: 'hidden',
          backgroundColor: 'var(--color-border-subtle)',
          display: 'flex',
        }}
      >
        {segments.map(seg => {
          const pct = limit > 0 ? (seg.tokens / limit) * 100 : 0;
          if (pct < 0.3) return null;
          return (
            <div
              key={seg.cat}
              title={`${seg.label}: ${seg.tokens.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: seg.color,
                opacity: 0.7,
                transition: 'width 0.4s ease',
              }}
            />
          );
        })}
        {/* Response reserve indicator */}
        <div
          title={`Response reserve: ${responseReserve.toLocaleString()} tokens (10%)`}
          style={{
            width: `${(responseReserve / limit) * 100}%`,
            height: '100%',
            backgroundColor: 'var(--color-text-tertiary)',
            opacity: 0.2,
            marginLeft: 'auto',
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 6 }}>
        {segments.map(seg => (
          <span key={seg.cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--color-text-tertiary)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: seg.color, opacity: 0.7, flexShrink: 0 }} />
            {seg.label} ({seg.tokens.toLocaleString()})
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--color-text-tertiary)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: 'var(--color-text-tertiary)', opacity: 0.2, flexShrink: 0 }} />
          Reserve ({responseReserve.toLocaleString()})
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section Card — collapsible card for a single prompt section
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Collapsible card showing one prompt section's metadata and content.
 *
 * @param section - Section data with name, content, tokens, chars.
 * @param totalTokens - Total tokens for percentage calculation.
 */
function SectionCard({ section, totalTokens }: { section: PromptSection; totalTokens: number }) {
  const [expanded, setExpanded] = useState(false);
  const cat = categorize(section.name);
  const style = CATEGORY_STYLE[cat];
  const pct = totalTokens > 0 ? ((section.tokens / totalTokens) * 100).toFixed(1) : '0';
  const Icon = style.icon;

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
        backgroundColor: expanded ? style.bg : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon size={12} style={{ color: style.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {section.name}
        </span>
        <span
          style={{
            fontSize: '0.62rem', fontWeight: 600,
            color: style.color,
            backgroundColor: style.bg,
            borderRadius: 4, padding: '1px 6px',
            flexShrink: 0,
          }}
        >
          {section.tokens.toLocaleString()} tok
        </span>
        <span style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)', width: 32, textAlign: 'right', flexShrink: 0 }}>
          {pct}%
        </span>
        {expanded
          ? <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        }
      </button>

      {/* Content — shown when expanded */}
      {expanded && section.content && (
        <div
          style={{
            padding: '0 10px 10px',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <pre
            style={{
              fontSize: '0.7rem',
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              paddingTop: 8,
              maxHeight: 300,
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            {section.content}
          </pre>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)' }}>
              {section.chars.toLocaleString()} chars
            </span>
            <span style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)' }}>
              ~{(section.chars / 4).toLocaleString()} est. tokens
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Context Assembly Viewer — debug panel showing exactly what's sent to the LLM.
 *
 * Renders as a right slide-in overlay (520px wide).
 * Opens when `activeOverlay === 'contextviewer'`.
 *
 * Shows:
 * 1. Token budget stacked bar (color-coded by category)
 * 2. All prompt sections with expand/collapse for full content
 * 3. Rolling summaries (if any)
 * 4. Chat history stats
 * 5. Token counter method indicator
 */
export function ContextViewer() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const { sessionId } = useChatStore();
  const open = activeOverlay === 'contextviewer';

  const [inspect, setInspect] = useState<InspectData | null>(null);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charId = activeCharacter?.id;
  const charName = activeCharacter?.name ?? 'Character';

  const loadData = useCallback(async () => {
    if (!sessionId || typeof sessionId !== 'number') return;
    setLoading(true);
    setError(null);
    try {
      const [inspectRes, budgetRes] = await Promise.all([
        api.getPromptInspect(sessionId, charId ?? undefined),
        api.getContextBudget(sessionId, charId ?? undefined),
      ]);
      setInspect({
        sections: inspectRes.sections ?? [],
        history: inspectRes.history ?? { message_count: 0, tokens: 0 },
        summaries: inspectRes.summaries ?? [],
        token_counter: inspectRes.token_counter ?? 'heuristic',
      });
      setBudget({
        context_limit: budgetRes.context_limit ?? 131072,
        sections: budgetRes.sections ?? [],
        total_tokens: budgetRes.total_tokens ?? 0,
        remaining_tokens: budgetRes.remaining_tokens ?? 0,
        usage_pct: budgetRes.usage_pct ?? 0,
        token_counter: inspectRes.token_counter ?? 'heuristic',
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to load context data');
    } finally {
      setLoading(false);
    }
  }, [sessionId, charId]);

  // Load data when panel opens
  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const totalSectionTokens = inspect?.sections.reduce((sum, s) => sum + s.tokens, 0) ?? 0;
  const historyTokens = inspect?.history.tokens ?? 0;
  const summaryTokens = inspect?.summaries.reduce((sum, s) => sum + s.tokens, 0) ?? 0;
  const grandTotal = totalSectionTokens + historyTokens + summaryTokens;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            style={{ position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 40 }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              right: 0, top: 0, bottom: 0,
              width: 'min(520px, 94vw)',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', height: 48, flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={15} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Context Viewer
                </span>
                {inspect && (
                  <span
                    style={{
                      fontSize: '0.58rem', fontWeight: 600,
                      backgroundColor: inspect.token_counter === 'tiktoken'
                        ? 'rgba(57,201,110,0.12)' : 'rgba(245,158,11,0.12)',
                      color: inspect.token_counter === 'tiktoken' ? '#39c96e' : '#f59e0b',
                      borderRadius: 4, padding: '1px 5px',
                    }}
                  >
                    {inspect.token_counter}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={loadData}
                  disabled={loading}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', padding: 6, borderRadius: 8,
                    opacity: loading ? 0.4 : 1,
                  }}
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={closeOverlay}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', padding: 6, borderRadius: 8,
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── Content ────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {/* No session state */}
              {(!sessionId || typeof sessionId !== 'number') && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
                  <MessageCircle size={28} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
                  <p style={{ fontSize: '0.85rem' }}>No active session.</p>
                  <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
                    Start a conversation to inspect the context assembly.
                  </p>
                </div>
              )}

              {/* Loading */}
              {loading && sessionId && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
                  <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '0.8rem' }}>Assembling context...</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: 8,
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    marginBottom: 12,
                  }}
                >
                  <AlertTriangle size={14} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-danger)' }}>{error}</span>
                </div>
              )}

              {/* Data loaded */}
              {!loading && inspect && budget && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Title */}
                  <div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem', fontWeight: 300, fontStyle: 'italic',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {charName}'s Context Window
                    </h3>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      Session #{sessionId} &middot; {inspect.sections.length} sections &middot; {inspect.history.message_count} messages
                    </p>
                  </div>

                  {/* Token Budget Bar */}
                  <BudgetBar
                    sections={budget.sections}
                    historyTokens={historyTokens}
                    limit={budget.context_limit}
                    totalUsed={budget.total_tokens}
                  />

                  {/* Quick stats row */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: 'System', value: totalSectionTokens, icon: <Cpu size={11} /> },
                      { label: 'History', value: historyTokens, icon: <MessageCircle size={11} /> },
                      { label: 'Summaries', value: summaryTokens, icon: <BookOpen size={11} /> },
                      { label: 'Total', value: grandTotal, icon: <Zap size={11} /> },
                    ].map(stat => (
                      <div
                        key={stat.label}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8,
                          backgroundColor: 'var(--color-background)',
                          border: '1px solid var(--color-border-subtle)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: 'var(--color-text-tertiary)' }}>
                          {stat.icon}
                        </div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {stat.value.toLocaleString()}
                        </p>
                        <p style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Prompt Sections */}
                  <div>
                    <p
                      style={{
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: 'var(--color-text-tertiary)',
                        marginBottom: 8,
                      }}
                    >
                      Prompt Sections ({inspect.sections.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {inspect.sections.map((section, i) => (
                        <SectionCard
                          key={`${section.name}-${i}`}
                          section={section}
                          totalTokens={grandTotal}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Rolling Summaries */}
                  {inspect.summaries.length > 0 && (
                    <div>
                      <p
                        style={{
                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.08em', color: 'var(--color-text-tertiary)',
                          marginBottom: 8,
                        }}
                      >
                        Rolling Summaries ({inspect.summaries.length})
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {inspect.summaries.map((summary, i) => (
                          <SummaryCard key={i} summary={summary} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat History info */}
                  <div
                    style={{
                      padding: '10px 12px', borderRadius: 8,
                      backgroundColor: 'var(--color-background)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MessageCircle size={12} style={{ color: '#6366f1' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6366f1' }}>
                        Chat History
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      <span>{inspect.history.message_count} messages</span>
                      <span>{inspect.history.tokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Collapsible card for a rolling summary.
 *
 * @param summary - Summary with text, range (e.g. "1-50"), and token count.
 */
function SummaryCard({ summary }: { summary: SummaryEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <BookOpen size={12} style={{ color: '#6366f1', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>
          Messages {summary.range}
        </span>
        <span style={{ fontSize: '0.62rem', color: '#6366f1', flexShrink: 0 }}>
          {summary.tokens.toLocaleString()} tok
        </span>
        {expanded
          ? <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
        }
      </button>
      {expanded && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <pre
            style={{
              fontSize: '0.7rem', lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: 0, paddingTop: 8, maxHeight: 200, overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            {summary.text}
          </pre>
        </div>
      )}
    </div>
  );
}
