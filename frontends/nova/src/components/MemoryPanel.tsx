import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { UserFact } from '../lib/types';
import styles from './MemoryPanel.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

/** Token budget summary from the context-budget endpoint. */
interface BudgetInfo {
  usage_pct: number;
  total_tokens: number;
  remaining_tokens: number;
}

/** A single memory entry from the tiered memory list endpoint. */
interface MemoryEntry {
  id: number;
  tier: number;
  role: string;
  content: string;
  created_at: string;
}

/** Paginated response from the memory list endpoint. */
interface MemoryListResponse {
  memories: MemoryEntry[];
  total: number;
  page: number;
}

/** Response from the semantic memory search endpoint. */
interface MemorySearchResponse {
  results: MemoryEntry[];
}

/** Fact category keys used for grouping user facts. */
type FactCategory = UserFact['category'];

/** Display labels for fact categories. */
const CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: 'Identity',
  preferences: 'Preferences',
  history: 'History',
  relationship: 'Relationship',
  general: 'General',
};

/** Ordered list of fact categories for consistent rendering. */
const CATEGORY_ORDER: FactCategory[] = [
  'identity',
  'preferences',
  'history',
  'relationship',
  'general',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a number with commas for display (e.g. 4096 -> "4,096").
 *
 * @param n - The number to format.
 * @returns Comma-separated string representation.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format an ISO timestamp to a short relative or absolute label.
 *
 * Returns "Xm", "Xh", "Xd" for recent timestamps, or a short date
 * for anything older than 7 days.
 *
 * @param iso - ISO 8601 timestamp string.
 * @returns Short human-readable time label.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Truncate a string to a maximum character length with ellipsis.
 *
 * @param text - Source string.
 * @param maxLen - Maximum length before truncation.
 * @returns Truncated string with "..." suffix if needed.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Memory panel for Nova's Focused mode IconRail.
 *
 * Displays the character's tiered memory system in a compact 280px panel:
 * - Token budget progress bar showing context window usage
 * - Paginated list of stored memories with tier/role badges
 * - Semantic search input for finding specific memories
 * - Collapsible user facts section grouped by category
 *
 * Data is fetched from the backend's memory and context-budget APIs.
 * The panel auto-refreshes budget info when the session changes.
 *
 * @example
 * ```tsx
 * // Used inside IconRail's panelContent map
 * const panelContent = {
 *   memory: <MemoryPanel />,
 * };
 * ```
 */
export function MemoryPanel() {
  const sessionId = useChatStore((s) => s.sessionId);
  const charId = useAppStore((s) => s.activeCharacter?.id ?? null);

  // Budget state
  const [budget, setBudget] = useState<BudgetInfo | null>(null);

  // Memory list state
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [memoryPage, setMemoryPage] = useState(1);
  const pageSize = 10;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // User facts state
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [factsOpen, setFactsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<FactCategory>>(
    new Set(['identity']),
  );

  // ── Data fetching ──────────────────────────────────────────────────────

  /**
   * Fetch token budget for the active session.
   * Silently fails if no session is active or the endpoint returns an error.
   */
  const fetchBudget = useCallback(async () => {
    if (sessionId == null) return;
    try {
      const res = await fetch(`/api/context-budget/${sessionId}`);
      if (!res.ok) return;
      const data: BudgetInfo = await res.json();
      setBudget(data);
    } catch {
      // Non-critical — budget display is informational
    }
  }, [sessionId]);

  /**
   * Fetch a page of memories from the tiered memory system.
   * Resets to page 1 when the character changes.
   *
   * @param page - 1-based page number to fetch.
   */
  const fetchMemories = useCallback(async (page: number) => {
    if (charId == null) return;
    try {
      const res = await fetch(
        `/api/v2/memory/list?page=${page}&size=${pageSize}&char_id=${charId}`,
      );
      if (!res.ok) return;
      const data: MemoryListResponse = await res.json();
      setMemories(data.memories ?? []);
      setMemoryTotal(data.total ?? 0);
      setMemoryPage(data.page ?? page);
    } catch {
      // Non-critical
    }
  }, [charId]);

  /**
   * Run a semantic search across the character's memory store.
   * Clears results when the query is emptied.
   *
   * @param query - Natural language search query.
   */
  const runSearch = useCallback(async (query: string) => {
    if (charId == null || !query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/v2/memory/search?query=${encodeURIComponent(query)}&n_results=10&char_id=${charId}`,
      );
      if (!res.ok) {
        setSearchResults(null);
        return;
      }
      const data: MemorySearchResponse = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [charId]);

  /**
   * Fetch user facts for the active character.
   * Uses the typed api.getUserFacts helper from api.ts.
   */
  const fetchFacts = useCallback(async () => {
    if (charId == null) return;
    try {
      const data = await api.getUserFacts(charId);
      setFacts(data.facts ?? []);
    } catch {
      // Non-critical
    }
  }, [charId]);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useEffect(() => {
    setMemoryPage(1);
    setSearchQuery('');
    setSearchResults(null);
    fetchMemories(1);
  }, [charId, fetchMemories]);

  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  // Debounced search: fire after 400ms of inactivity
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => runSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, runSearch]);

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * Navigate to a different memory list page.
   *
   * @param page - Target page number (1-based).
   */
  const handlePageChange = useCallback((page: number) => {
    setMemoryPage(page);
    fetchMemories(page);
  }, [fetchMemories]);

  /**
   * Toggle a fact category's expanded/collapsed state.
   *
   * @param cat - The category to toggle.
   */
  const toggleCategory = useCallback((cat: FactCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(memoryTotal / pageSize));

  /** The memory list to display: search results override the paginated list. */
  const displayMemories = searchResults ?? memories;

  /** Group facts by category for sectioned rendering. */
  const factsByCategory = CATEGORY_ORDER.reduce<Record<FactCategory, UserFact[]>>(
    (acc, cat) => {
      acc[cat] = facts.filter((f) => f.category === cat);
      return acc;
    },
    { identity: [], preferences: [], history: [], relationship: [], general: [] },
  );

  /** Budget bar CSS class based on usage threshold. */
  const budgetBarClass = budget
    ? budget.usage_pct >= 90
      ? styles.budgetBarCritical
      : budget.usage_pct >= 75
        ? styles.budgetBarWarn
        : ''
    : '';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* ── Token Budget ────────────────────────────────────────── */}
      {budget && (
        <div className={styles.budgetSection}>
          <div className={styles.budgetLabel}>
            <span>Context Budget</span>
            <span className={styles.budgetPct}>{Math.round(budget.usage_pct)}%</span>
          </div>
          <div className={styles.budgetBarTrack}>
            <div
              className={`${styles.budgetBarFill} ${budgetBarClass}`}
              style={{ width: `${Math.min(100, budget.usage_pct)}%` }}
            />
          </div>
          <div className={styles.budgetTokens}>
            <span>{formatNumber(budget.total_tokens - budget.remaining_tokens)} used</span>
            <span>{formatNumber(budget.remaining_tokens)} free</span>
          </div>
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────── */}
      <input
        type="text"
        className={styles.searchBox}
        placeholder="Search memories..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* ── Memory List ─────────────────────────────────────────── */}
      <div className={styles.memoryList}>
        {searchLoading && (
          <div className={styles.emptyState}>
            <span className={styles.loadingDot}>Searching</span>
          </div>
        )}

        {!searchLoading && displayMemories.length === 0 && (
          <div className={styles.emptyState}>
            {searchQuery ? 'No memories found' : 'No memories stored yet'}
          </div>
        )}

        {!searchLoading &&
          displayMemories.map((mem) => (
            <div key={mem.id} className={styles.memoryCard}>
              <div className={styles.memoryCardHeader}>
                <span
                  className={`${styles.tierBadge} ${
                    mem.tier === 1
                      ? styles.tierT1
                      : mem.tier === 2
                        ? styles.tierT2
                        : styles.tierT3
                  }`}
                >
                  T{mem.tier}
                </span>
                <span className={styles.roleBadge}>{mem.role}</span>
                <span className={styles.memoryTimestamp}>
                  {formatTimestamp(mem.created_at)}
                </span>
              </div>
              <div className={styles.memoryPreview}>{truncate(mem.content, 120)}</div>
            </div>
          ))}
      </div>

      {/* ── Pagination (hidden during search) ───────────────────── */}
      {!searchResults && totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            disabled={memoryPage <= 1}
            onClick={() => handlePageChange(memoryPage - 1)}
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className={styles.pageInfo}>
            {memoryPage} / {totalPages}
          </span>
          <button
            className={styles.pageButton}
            disabled={memoryPage >= totalPages}
            onClick={() => handlePageChange(memoryPage + 1)}
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── User Facts ──────────────────────────────────────────── */}
      <div className={styles.factsSection}>
        <div className={styles.factsHeader} onClick={() => setFactsOpen((v) => !v)}>
          <div className={styles.factsTitle}>
            User Facts
            {facts.length > 0 && (
              <span className={styles.factCategoryCount}>{facts.length}</span>
            )}
          </div>
          <ChevronDown
            size={14}
            className={`${styles.factsChevron} ${factsOpen ? styles.factsChevronOpen : ''}`}
          />
        </div>

        <AnimatePresence initial={false}>
          {factsOpen && (
            <motion.div
              key="facts-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{ overflow: 'hidden' }}
            >
              <div className={styles.factsBody}>
                {facts.length === 0 && (
                  <div className={styles.emptyState}>No facts learned yet</div>
                )}

                {CATEGORY_ORDER.map((cat) => {
                  const catFacts = factsByCategory[cat];
                  if (catFacts.length === 0) return null;
                  const isExpanded = expandedCategories.has(cat);

                  return (
                    <div key={cat} className={styles.factCategory}>
                      <div
                        className={styles.factCategoryHeader}
                        onClick={() => toggleCategory(cat)}
                      >
                        <span className={styles.factCategoryLabel}>
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <span className={styles.factCategoryCount}>
                          {catFacts.length}
                        </span>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            key={`cat-${cat}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 28,
                            }}
                            style={{ overflow: 'hidden' }}
                          >
                            {catFacts.map((fact) => (
                              <div key={fact.id} className={styles.factItem}>
                                <span className={styles.factText}>
                                  {fact.fact_text}
                                </span>
                                <div className={styles.factMeta}>
                                  <span
                                    className={`${styles.sourceBadge} ${
                                      fact.source === 'auto'
                                        ? styles.sourceAuto
                                        : styles.sourceManual
                                    }`}
                                  >
                                    {fact.source}
                                  </span>
                                  <span className={styles.confidenceBadge}>
                                    {Math.round(fact.confidence * 100)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
