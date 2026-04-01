/**
 * FantasyJournal — read-only diary overlay showing a character's recorded
 * fantasies and intimate thoughts, written in their voice.
 *
 * Features:
 *   - Category filter tabs (All / Romantic / Playful / Passionate / Tender)
 *   - Mood tint per entry with a colored dot indicator
 *   - Intensity dots (1–5) rendered as subtle filled circles
 *   - Inline expand / collapse for full entry content
 *   - Favorite toggle (heart icon) — persisted via PATCH in future; read-only now
 *   - Loading, error, and empty states
 *
 * API surface:
 *   GET /api/characters/{char_id}/fantasy-journal
 *
 * Usage:
 *   <FantasyJournal
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     characterId={3}
 *     characterName="Sakura"
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Heart, Loader2, AlertCircle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Constants & Types
   ═══════════════════════════════════════════════════════════════════════ */

const BASE = 'http://localhost:8080';

/** All valid entry category values from the API. */
type EntryCategory = 'romantic' | 'playful' | 'passionate' | 'tender';

/** All valid mood values from the API. */
type EntryMood = 'dreamy' | 'passionate' | 'playful' | 'tender' | 'longing';

/** Shape of a single journal entry returned by the API. */
interface JournalEntry {
  id: number;
  category: EntryCategory;
  title: string;
  content: string;
  mood: EntryMood;
  /** 1–5 intensity level. */
  intensity: number;
  /** ISO 8601 datetime string e.g. "2026-03-15T22:30:00". */
  created_at: string;
  is_favorite: boolean;
}

/** Shape of the full API response for the fantasy journal endpoint. */
interface JournalApiResponse {
  char_id: number;
  entries: JournalEntry[];
}

/** Filter tab definition. */
interface FilterTab {
  key: EntryCategory | 'all';
  label: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All' },
  { key: 'romantic', label: 'Romantic' },
  { key: 'playful', label: 'Playful' },
  { key: 'passionate', label: 'Passionate' },
  { key: 'tender', label: 'Tender' },
];

/**
 * Background tint colors keyed by mood value.
 * These are intentionally not CSS variables because they are mood-semantic
 * constants defined in the feature specification.
 */
const MOOD_TINTS: Record<EntryMood, string> = {
  dreamy:    'rgba(139, 92, 246, 0.08)',
  passionate:'rgba(239, 68, 68, 0.08)',
  playful:   'rgba(251, 191, 36, 0.08)',
  tender:    'rgba(59, 130, 246, 0.08)',
  longing:   'rgba(168, 85, 247, 0.08)',
};

/**
 * Dot accent colors keyed by mood value — used for the small mood indicator.
 * Same rationale as MOOD_TINTS: spec-defined semantic constants, not theme vars.
 */
const MOOD_DOT_COLORS: Record<EntryMood, string> = {
  dreamy:    'rgba(139, 92, 246, 0.7)',
  passionate:'rgba(239, 68, 68, 0.7)',
  playful:   'rgba(251, 191, 36, 0.7)',
  tender:    'rgba(59, 130, 246, 0.7)',
  longing:   'rgba(168, 85, 247, 0.7)',
};

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Formats an ISO 8601 datetime string into a diary-friendly label.
 * Returns a string like "March 15, evening".
 *
 * The time-of-day label is derived from the entry's local hour:
 *   - 05–11 → "morning"
 *   - 12–16 → "afternoon"
 *   - 17–20 → "evening"
 *   - 21–23, 00–04 → "night"
 *
 * @param iso - ISO 8601 datetime string from the API.
 * @returns Human-readable date label, or the raw string on parse failure.
 *
 * @example
 *   formatEntryDate("2026-03-15T22:30:00") // "March 15, night"
 *   formatEntryDate("2026-03-15T09:00:00") // "March 15, morning"
 */
function formatEntryDate(iso: string): string {
  try {
    const d = new Date(iso);
    const month = d.toLocaleDateString(undefined, { month: 'long' });
    const day = d.getDate();
    const hour = d.getHours();

    let timeOfDay: string;
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    return `${month} ${day}, ${timeOfDay}`;
  } catch {
    return iso;
  }
}

/**
 * Clamps an intensity value to the 1–5 range used by the dot renderer.
 *
 * @param n - Raw intensity number from the API.
 * @returns Integer in [1, 5].
 */
function clampIntensity(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders 1–5 small filled circles representing entry intensity.
 * Filled dots use the accent color; empty dots use the border color.
 *
 * @param value - Intensity value (1–5).
 */
function IntensityDots({ value }: { value: number }) {
  const clamped = clampIntensity(value);
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 3 }}
      aria-label={`Intensity ${clamped} of 5`}
      title={`Intensity ${clamped}/5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: i < clamped
              ? 'var(--color-accent)'
              : 'var(--color-border-subtle)',
            opacity: i < clamped ? 0.7 : 1,
            transition: 'background-color 0.12s',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Renders a single journal entry as a diary "page" card.
 * Clicking the card header expands the full content inline.
 *
 * @param entry     - The journal entry data.
 * @param expanded  - Whether this entry is currently expanded.
 * @param onToggle  - Callback to toggle expanded state.
 * @param onFavorite - Callback to toggle favorite state.
 */
function EntryCard({
  entry,
  expanded,
  onToggle,
  onFavorite,
}: {
  entry: JournalEntry;
  expanded: boolean;
  onToggle: () => void;
  onFavorite: (id: number) => void;
}) {
  const moodTint = MOOD_TINTS[entry.mood] ?? 'transparent';
  const moodDot  = MOOD_DOT_COLORS[entry.mood] ?? 'var(--color-text-muted)';

  return (
    <motion.div
      layout
      style={{
        backgroundColor: moodTint,
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        boxShadow: expanded ? 'var(--shadow-card)' : 'none',
        transition: 'box-shadow 0.18s',
      }}
    >
      {/* ── Card header — always visible ─────────────────────────────── */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '14px 16px 10px',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
        aria-expanded={expanded}
        aria-label={`Journal entry: ${entry.title}`}
      >
        {/* Row 1: title + heart */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          {/* Title — italic serif-like styling to suggest handwriting */}
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              fontStyle: 'italic',
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
              fontFamily: 'Georgia, "Times New Roman", serif',
              flex: 1,
            }}
          >
            {entry.title}
          </span>

          {/* Favorite heart — separate click target via stopPropagation */}
          <button
            onClick={e => { e.stopPropagation(); onFavorite(entry.id); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              color: entry.is_favorite ? 'var(--color-accent)' : 'var(--color-text-muted)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.13s',
            }}
            aria-label={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={entry.is_favorite}
          >
            <Heart
              size={14}
              fill={entry.is_favorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Row 2: date, mood dot, intensity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Date label */}
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--color-text-muted)',
              fontStyle: 'italic',
            }}
          >
            {formatEntryDate(entry.created_at)}
          </span>

          {/* Mood dot + label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: moodDot,
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span
              style={{
                fontSize: '0.65rem',
                color: 'var(--color-text-secondary)',
                textTransform: 'capitalize',
              }}
            >
              {entry.mood}
            </span>
          </div>

          {/* Intensity dots */}
          <IntensityDots value={entry.intensity} />
        </div>
      </button>

      {/* ── Expanded content — AnimatePresence collapse ──────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '0 16px 16px',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              <p
                style={{
                  marginTop: 12,
                  fontSize: '0.82rem',
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.75,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontStyle: 'italic',
                }}
              >
                {entry.content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Props for the FantasyJournal overlay.
 *
 * @property isOpen        - Whether the overlay is visible.
 * @property onClose       - Callback invoked when the user closes the overlay.
 * @property characterId   - ID of the character whose journal to display.
 * @property characterName - Display name of the character (used in the header).
 */
export interface FantasyJournalProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: number;
  characterName: string;
}

/**
 * Full-screen overlay that displays a character's fantasy journal — a
 * read-only diary of their intimate thoughts and fantasies.
 *
 * Entries are filterable by category. Each entry renders as a diary page
 * card with an italic serif title, date label, mood indicator, and intensity
 * dots. Clicking a card expands the full content inline via AnimatePresence.
 *
 * Data is fetched from GET /api/characters/{characterId}/fantasy-journal on
 * mount and whenever `characterId` changes while the overlay is open.
 *
 * @example
 *   <FantasyJournal
 *     isOpen={journalOpen}
 *     onClose={() => setJournalOpen(false)}
 *     characterId={activeCharacter.id}
 *     characterName={activeCharacter.name}
 *   />
 */
export function FantasyJournal({
  isOpen,
  onClose,
  characterId,
  characterName,
}: FantasyJournalProps) {
  // ── Data state ────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<EntryCategory | 'all'>('all');
  /** Set of entry IDs that are currently expanded. */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  /** Local favorite overrides — mirrors server state after toggling. */
  const [favoriteOverrides, setFavoriteOverrides] = useState<Map<number, boolean>>(new Map());

  // ── Fetch journal entries ─────────────────────────────────────────────
  const fetchJournal = useCallback(async (charId: number) => {
    if (charId <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/characters/${charId}/fantasy-journal`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: JournalApiResponse = await res.json();
      setEntries(data.entries ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && characterId > 0) {
      fetchJournal(characterId);
    }
    if (!isOpen) {
      // Reset ephemeral UI on close so the next open feels fresh.
      setExpandedIds(new Set());
      setFavoriteOverrides(new Map());
      setActiveCategory('all');
      setError(null);
    }
  }, [isOpen, characterId, fetchJournal]);

  // ── Toggle expanded state for a single entry ──────────────────────────
  const handleToggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ── Toggle favorite (optimistic local state; no server write yet) ─────
  /**
   * Toggles the favorite state of an entry locally.
   * The override map takes precedence over the server-returned value so the
   * UI feels instant. A backend PATCH can be wired here in a future pass.
   *
   * @param id - Entry ID to toggle.
   */
  const handleFavorite = useCallback((id: number) => {
    setFavoriteOverrides(prev => {
      const next = new Map(prev);
      // Determine the current effective state before toggling.
      const serverEntry = entries.find(e => e.id === id);
      const currentFav = prev.has(id) ? prev.get(id)! : (serverEntry?.is_favorite ?? false);
      next.set(id, !currentFav);
      return next;
    });
  }, [entries]);

  // ── Filtered entries ──────────────────────────────────────────────────
  const filteredEntries = activeCategory === 'all'
    ? entries
    : entries.filter(e => e.category === activeCategory);

  // ── Merge server favorite with local overrides ────────────────────────
  const resolvedEntries = filteredEntries.map(e => ({
    ...e,
    is_favorite: favoriteOverrides.has(e.id) ? favoriteOverrides.get(e.id)! : e.is_favorite,
  }));

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ───────────────────────────────────────────────── */}
          <motion.div
            key="fj-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 200,
            }}
            aria-hidden="true"
          />

          {/* ── Panel ──────────────────────────────────────────────────── */}
          <motion.div
            key="fj-panel"
            role="dialog"
            aria-label={`${characterName}'s Journal`}
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              inset: 16,
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            {/* ── Header ───────────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                height: 52,
                flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <BookOpen size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    fontStyle: 'italic',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {characterName}'s Journal
                </span>
                {/* Entry count badge */}
                {!loading && entries.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      fontStyle: 'normal',
                      color: 'var(--color-text-secondary)',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 10,
                      padding: '1px 8px',
                    }}
                  >
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: 6,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.12s',
                }}
                aria-label="Close journal"
              >
                <X size={17} />
              </button>
            </div>

            {/* ── Category filter tabs ─────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: '10px 20px',
                flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
                overflowX: 'auto',
              }}
              role="tablist"
              aria-label="Filter journal entries by category"
            >
              {FILTER_TABS.map(tab => {
                const active = activeCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveCategory(tab.key)}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: active ? 600 : 400,
                      padding: '5px 13px',
                      borderRadius: 20,
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                      backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.13s',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── Scrollable entry list ────────────────────────────────── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
              role="tabpanel"
              aria-label={`Journal entries — ${activeCategory}`}
            >
              {/* Loading spinner */}
              {loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '60px 0',
                    gap: 10,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <Loader2
                    size={22}
                    style={{
                      color: 'var(--color-accent)',
                      animation: 'fj-spin 1s linear infinite',
                    }}
                  />
                  <span style={{ fontSize: '0.78rem' }}>Opening journal…</span>
                </div>
              )}

              {/* Error state */}
              {!loading && error && (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-card)',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 600, margin: 0 }}>
                      Couldn't load the journal
                    </p>
                    <p style={{ fontSize: '0.70rem', color: 'var(--color-text-secondary)', margin: '3px 0 0' }}>
                      {error}
                    </p>
                  </div>
                  <button
                    onClick={() => fetchJournal(characterId)}
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                    aria-label="Retry loading journal"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && resolvedEntries.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '60px 24px',
                    textAlign: 'center',
                    gap: 12,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <BookOpen
                    size={36}
                    style={{ opacity: 0.3 }}
                    aria-hidden="true"
                  />
                  <p
                    style={{
                      fontSize: '0.84rem',
                      fontStyle: 'italic',
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.55,
                      maxWidth: 320,
                      margin: 0,
                    }}
                  >
                    {activeCategory !== 'all'
                      ? `No ${activeCategory} entries yet.`
                      : `No journal entries yet. As your bond deepens, ${characterName} will share more…`
                    }
                  </p>
                </div>
              )}

              {/* Entry cards */}
              {!loading && !error && resolvedEntries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedIds.has(entry.id)}
                  onToggle={() => handleToggleExpand(entry.id)}
                  onFavorite={handleFavorite}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}

      {/* Keyframe — scoped name to avoid collisions with other components */}
      <style>{`@keyframes fj-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AnimatePresence>
  );
}
